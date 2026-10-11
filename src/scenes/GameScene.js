// 核心游戏场景：按难度规则组合各系统 (物理/投放/倒计时/合成/计分/障碍/道具/目标/特效/字幕)，
// 负责瞄准投放、警戒线判负、暂停、胜利等流程编排。具体玩法逻辑都在 systems/ 中。
import { Scene } from '../core/Scene.js';
import { StateMachine } from '../core/StateMachine.js';
import { GameConfig } from '../config/GameConfig.js';
import { PlatformConfig } from '../config/PlatformConfig.js';
import { CHARACTERS, getCharacterDef } from '../config/LevelConfig.js';
import { resolveRules, DEFAULT_DIFFICULTY } from '../config/DifficultyConfig.js';
import { PhysicsSystem } from '../systems/PhysicsSystem.js';
import { SpawnSystem } from '../systems/SpawnSystem.js';
import { MergeSystem } from '../systems/MergeSystem.js';
import { ScoreSystem } from '../systems/ScoreSystem.js';
import { EffectSystem } from '../systems/EffectSystem.js';
import { DropTimerSystem } from '../systems/DropTimerSystem.js';
import { ItemSystem } from '../systems/ItemSystem.js';
import { ObstacleSystem } from '../systems/ObstacleSystem.js';
import { GoalSystem } from '../systems/GoalSystem.js';
import { SubtitleSystem } from '../systems/SubtitleSystem.js';
import { Character } from '../entities/Character.js';
import { HUD } from '../ui/HUD.js';
import { Button } from '../ui/Button.js';
import { VictoryPanel } from '../ui/VictoryPanel.js';
import { SettingsPanel } from '../ui/SettingsPanel.js';
import { drawCountdownRing } from '../ui/CountdownRing.js';
import { drawBackground, drawText, drawPanel, drawPortrait, roundRectPath, easing } from '../ui/draw.js';

export class GameScene extends Scene {
  constructor(game) {
    super(game, 'game');
  }

  enter(data = {}) {
    const game = this.game;
    const events = game.events;
    this.difficulty = data.difficulty || game.save.get('difficulty', DEFAULT_DIFFICULTY);
    const rules = resolveRules(this.difficulty);
    this.rules = rules;

    this.characters = [];
    this.physics = new PhysicsSystem(events, rules);
    this.physics.createWalls(rules.container);
    this.spawn = new SpawnSystem(rules);
    this.merge = new MergeSystem(events, this, rules.container);
    this.score = new ScoreSystem(events);
    this.effects = new EffectSystem(events);
    this.dropTimer = new DropTimerSystem(events, rules.dropTimer);
    // 侧边栏复访奖励：下一局额外的「整理」次数 (领取后存档，开局时使用)
    const bonusTidy = game.save.get('bonusTidy', 0) || 0;
    if (bonusTidy > 0) game.save.set('bonusTidy', 0);
    this.bonusTidy = bonusTidy;
    this.items = new ItemSystem(events, this, rules.tidyUses + bonusTidy);
    this.obstacles = new ObstacleSystem(events, this.physics, rules.stone, rules.container, this);
    this.goal = new GoalSystem(events, rules.goalLevel);
    this.subtitles = new SubtitleSystem(events, rules.container);
    this.physics.afterStep = () => this.merge.resolve();

    this.aimX = game.width / 2;
    this.aimTargetX = this.aimX;
    this.aiming = false;
    this.dangerLevel = 0;
    this.warnTimer = 0;
    this.dt = 1 / 60;
    this.best = game.save.highScore(this.difficulty);
    this.submitted = false;
    this.leaving = false;
    // 激励视频：每局 1 次复活、1 次 +1 整理 (平台不支持广告时为 0，不显示入口)
    // 抖音未填广告位 (流量主要上线后才能开通)：复活改为免费的「再试一次」(每局 1 次)，+1 整理隐藏
    const adsOn = game.ads.available;
    this.freeRevive = !adsOn && !!game.platform.freeRevive;
    this.revivesLeft = (adsOn || this.freeRevive) ? PlatformConfig.ads.revivePerGame : 0;
    this.adTidyLeft = adsOn ? PlatformConfig.ads.tidyPerGame : 0;
    this.reviveMsg = '';
    this.adPending = false;
    this.videoPath = null;
    this.videoPromise = null;

    this.hud = new HUD(game, rules, {
      onPause: () => this.pause(),
      onMute: () => game.audio.toggleMute(),
      onTidy: () => this.onTidyButton(),
      tidyAvailable: adsOn || bonusTidy > 0,
    });

    const cx = game.width / 2;
    const restart = () => game.scenes.change('game', { difficulty: this.difficulty });
    this.pauseButtons = [
      new Button({ x: cx, y: 430, w: 240, h: 66, label: '继续游戏', onClick: () => this.resume() }),
      new Button({ x: cx, y: 516, w: 240, h: 66, label: '重新开始', style: 'secondary', onClick: restart }),
      new Button({ x: cx, y: 602, w: 240, h: 66, label: '返回菜单', style: 'secondary', onClick: () => game.scenes.change('menu') }),
    ];
    // 暂停面板底部：语音 / 音乐 独立开关 + 音量设置
    this.voiceToggle = new Button({ x: cx - 104, y: 684, w: 98, h: 48, label: '', style: 'secondary', fontSize: 16, onClick: () => { game.voice.toggle(); this.refreshToggles(); } });
    this.bgmToggle = new Button({ x: cx, y: 684, w: 98, h: 48, label: '', style: 'secondary', fontSize: 16, onClick: () => { game.bgm.toggle(); this.refreshToggles(); } });
    this.volumeBtn = new Button({ x: cx + 104, y: 684, w: 98, h: 48, label: '音量', style: 'secondary', fontSize: 16, onClick: () => { this.settings.sync(); this.showSettings = true; } });
    this.pauseButtons.push(this.voiceToggle, this.bgmToggle, this.volumeBtn);
    this.showSettings = false;
    this.settings = new SettingsPanel(game, { top: 270, onClose: () => { this.showSettings = false; } });
    this.refreshToggles();
    this.pauseButtons.forEach((b) => { b.audio = game.audio; });
    this.victoryPanel = new VictoryPanel(game, {
      onContinue: () => this.continueEndless(),
      onRetry: restart,
      onMenu: () => game.scenes.change('menu'),
      onShare: game.platform.canRecord || game.platform.canShare ? () => this.shareVideo() : null,
      shareLabel: game.platform.canRecord ? '分享精彩片段' : '分享给好友',
    });
    // 复活面板 (看激励视频复活)
    this.reviveWatchBtn = new Button({ x: cx, y: 560, w: 280, h: 70, label: '▶ 看视频复活', fontSize: 28, onClick: () => this.watchReviveAd() });
    this.reviveSkipBtn = new Button({ x: cx, y: 648, w: 220, h: 56, label: '不了，去结算', style: 'secondary', fontSize: 22, onClick: () => this.declineRevive() });
    this.reviveButtons = [this.reviveWatchBtn, this.reviveSkipBtn];
    this.reviveButtons.forEach((b) => { b.audio = game.audio; });

    this.fsm = new StateMachine(this)
      .add('playing', {})
      .add('paused', {})
      .add('victory', {
        enter() { game.save.markCleared(this.difficulty); this.aiming = false; this.merge.cancelPending(); this.stopRecording(); },
      })
      .add('revive', {
        // 堆满了：先询问是否看激励视频复活 (每局 1 次)；放弃才真正结束
        enter() {
          this.aiming = false;
          this.merge.cancelPending();
          this.reviveMsg = '';
          this.reviveWatchBtn.label = this.freeRevive ? '再试一次' : '▶ 看视频复活';
          events.emit('game:hold');
          events.emit('revive:offer', { difficulty: this.difficulty });
        },
      })
      .add('over', {
        enter() {
          this.merge.enabled = false;
          this.merge.cancelPending();
          this.aiming = false;
          const isNewRecord = this.submitScore();
          events.emit('game:over', { score: this.score.score, isNewRecord, difficulty: this.difficulty });
          this.isNewRecord = isNewRecord;
          this.stopRecording();
        },
        update() {
          if (this.fsm.time > 1.4 && !this.leaving) {
            this.leaving = true;
            game.scenes.change('gameover', {
              snapshot: game.snapshot(),
              difficulty: this.difficulty,
              score: this.score.score,
              best: game.save.highScore(this.difficulty),
              isNewRecord: this.isNewRecord,
              maxLevel: this.score.maxLevel,
              merges: this.score.merges,
              cleared: this.goal.reached,
              video: this.videoPromise,       // 录屏 (抖音)：Promise<videoPath|null>
            }, { transition: false });
          }
        },
      });
    this.fsm.change('playing');

    this.listen('score:changed', (s) => { if (s > this.best) this.best = s; });
    this.listen('app:hidden', () => { if (this.fsm.is('playing')) this.pause(); });
    // 窗口失去焦点 (切到别的程序) 也自动暂停：否则倒计时会在玩家看不到时自动投放
    this.listen('app:blur', () => { if (this.fsm.is('playing')) this.pause(); else this.aiming = false; });
    // 触摸被系统取消 (来电/手势等)：取消瞄准，不投放
    this.listen('input:cancel', () => { this.aiming = false; });
    this.listen('timer:expired', () => this.autoDrop());
    this.listen('goal:reached', () => { if (this.fsm.is('playing')) this.fsm.change('victory'); });

    events.emit('game:start', { difficulty: this.difficulty, x: cx, y: 330 });
    // 抖音：每局开始自动录屏，结束 / 通关时可「分享精彩片段」
    if (game.platform.canRecord) game.platform.startRecording();
  }

  // ---- 录屏分享 (抖音) ----
  stopRecording() {
    const p = this.game.platform;
    if (!p.canRecord) return null;
    if (!this.videoPromise) {
      this.videoPromise = p.stopRecording().then((path) => { this.videoPath = path; return path; });
    }
    return this.videoPromise;
  }

  shareVideo() {
    const p = this.game.platform;
    if (!p.canRecord) {   // 微信：普通转发 (好友 / 群)
      return p.shareGame({ score: this.score.score, maxLevel: this.score.maxLevel })
        .then((ok) => { this.game.events.emit('share:game', { ok, placement: 'victory' }); return ok; });
    }
    const go = (path) => {
      if (!path) { p.toast('录屏太短或不可用，暂时无法分享'); return false; }
      return p.shareVideo(path).then((ok) => { this.game.events.emit('share:video', { ok, placement: 'victory' }); return ok; });
    };
    return (this.videoPromise || Promise.resolve(this.videoPath)).then(go);
  }

  // ---- 激励视频 ----
  get canOfferRevive() {
    return this.revivesLeft > 0 && (this.game.ads.available || this.freeRevive);
  }

  watchReviveAd() {
    if (!this.fsm.is('revive') || this.adPending) return;
    if (this.freeRevive) { this.revive(); return; }      // 没有广告：免费再试一次
    this.adPending = true;
    this.reviveMsg = '';
    this.game.ads.showRewardedAd('revive').then((ok) => {
      this.adPending = false;
      if (!this.fsm.is('revive')) return;
      if (ok) this.revive();
      else this.reviveMsg = '视频没有看完，不能复活哦';
    });
  }

  declineRevive() {
    if (!this.fsm.is('revive') || this.adPending) return;
    this.fsm.change('over');
  }

  /** 复活：清掉顶部 (警戒线附近及以上) 的角色和石头；清得太少时再整理掉最小等级的角色，然后继续 */
  revive() {
    const band = GameConfig.dangerY + PlatformConfig.ads.reviveClearBand;
    const points = [];
    const mark = (c) => points.push({ x: c.x, y: c.y, r: c.currentRadius, color: c.def ? c.def.ringColor : '#a49eb0' });
    const top = this.characters.filter((c) => !c.removed && c.y - c.currentRadius < band);
    top.forEach((c) => { mark(c); this.removeCharacter(c); });
    const stones = this.obstacles.stones.filter((st) => st.y - st.currentRadius < band);
    stones.forEach((st) => { mark(st); this.obstacles.remove(st); });
    let removed = top.length + stones.length;
    if (removed < 3) {
      const alive = this.characters.filter((c) => !c.removed && !c.merging);
      if (alive.length) {
        const lv = Math.min(...alive.map((c) => c.level));
        alive.filter((c) => c.level === lv).forEach((c) => { mark(c); this.removeCharacter(c); removed++; });
      }
    }
    for (const c of [...this.characters, ...this.obstacles.stones]) c.dangerTime = 0;
    this.dangerLevel = 0;
    this.dropTimer.reset();
    this.revivesLeft--;
    this.merge.enabled = true;
    this.fsm.change('playing');
    this.game.events.emit('game:unhold');
    this.game.events.emit('game:revive', { removed, points });
  }

  /** 整理按钮：有次数直接用；次数用完时可以看激励视频 +1 次并立即使用 (每局 1 次) */
  onTidyButton() {
    if (!this.fsm.is('playing') || this.adPending) return;
    if (this.items.uses > 0) { this.items.useTidy(); return; }
    if (this.adTidyLeft > 0 && this.items.hasTargets && this.game.ads.available) {
      this.adPending = true;
      this.aiming = false;
      this.game.ads.showRewardedAd('tidy').then((ok) => {
        this.adPending = false;
        if (!ok) { this.game.platform.toast('视频没有看完，没有获得奖励'); return; }
        this.adTidyLeft--;
        this.items.grant(1);
        if (this.fsm.is('playing')) this.items.useTidy();
      });
    }
  }

  get tidyAdReady() {
    return this.items.uses === 0 && this.adTidyLeft > 0 && this.game.ads.available;
  }

  exit() {
    // 中途离开 (如胜利后返回菜单) 也记录成绩
    if (!this.submitted && this.score.score > 0) this.submitScore();
    this.game.events.emit('game:exit');   // 语音系统据此停止并清空排队的台词
    if (this.game.platform.canRecord && !this.videoPromise) this.game.platform.stopRecording();
    this.characters.forEach((c) => c.destroy());
    this.characters = [];
    this.merge.destroy();
    this.score.destroy();
    this.effects.destroy();
    this.obstacles.destroy();
    this.goal.destroy();
    this.subtitles.destroy();
    this.physics.destroy();
  }

  submitScore() {
    if (this.submitted) return false;
    this.submitted = true;
    return this.game.save.submit(this.score.score, this.score.maxLevel, this.difficulty);
  }

  // ---- 供 MergeSystem / ItemSystem 调用的世界接口 ----
  getDef(level) { return getCharacterDef(level); }

  spawnCharacter(level, x, y, opts = {}) {
    const ch = new Character(this.physics, getCharacterDef(level), level, x, y, opts);
    this.characters.push(ch);
    return ch;
  }

  removeCharacter(ch) {
    ch.destroy();
    const i = this.characters.indexOf(ch);
    if (i >= 0) this.characters.splice(i, 1);
  }

  // ---- 玩法 ----
  clampAim(x, level) {
    const r = CHARACTERS[level].radius;
    const c = this.rules.container;
    return Math.max(c.left + r + 1, Math.min(c.right - r - 1, x));
  }

  drop() {
    if (!this.fsm.is('playing') || !this.spawn.canDrop) return false;
    const level = this.spawn.take();
    const x = this.clampAim(this.aimX, level);
    const ch = this.spawnCharacter(level, x, GameConfig.dropY);
    this.physics.setVelocity(ch.body, { x: 0, y: 2 });
    this.dropTimer.reset();
    this.game.events.emit('drop', { level, x, auto: false });
    return true;
  }

  /** 倒计时结束：在当前瞄准位置自动投放 */
  autoDrop() {
    this.aimX = this.clampAim(this.aimX, this.spawn.current);
    this.aiming = false;
    this.drop();
  }

  refreshToggles() {
    this.voiceToggle.label = this.game.voice.enabled ? '语音：开' : '语音：关';
    this.bgmToggle.label = this.game.bgm.enabled ? '音乐：开' : '音乐：关';
  }

  pause() {
    if (!this.fsm.is('playing')) return;
    this.aiming = false;
    this.fsm.change('paused');
    this.game.events.emit('game:hold');     // 暂停期间不开始新的台词
  }

  resume() {
    this.showSettings = false;
    if (this.fsm.is('paused')) {
      this.fsm.change('playing');
      this.game.events.emit('game:unhold');
    }
  }

  /** 胜利后选择「继续挑战」：清零所有判负计时，避免一继续就因为之前的计时直接判负 */
  continueEndless() {
    if (!this.fsm.is('victory')) return;
    this.goal.continueEndless();
    for (const c of [...this.characters, ...this.obstacles.stones]) c.dangerTime = 0;
    this.dangerLevel = 0;
    this.dropTimer.reset();
    this.fsm.change('playing');
    // 继续无尽模式：重新开始录屏
    if (this.game.platform.canRecord) { this.videoPromise = null; this.videoPath = null; this.game.platform.startRecording(); }
  }

  activeButtons() {
    if (this.fsm.is('paused')) return this.showSettings ? this.settings.buttons : this.pauseButtons;
    if (this.fsm.is('victory')) return this.fsm.time > 0.8 ? this.victoryPanel.buttons : [];
    if (this.fsm.is('over')) return [];
    if (this.fsm.is('revive')) return this.adPending ? [] : this.reviveButtons;
    return this.hud.buttons;
  }

  onPointerDown(p) {
    if (super.onPointerDown(p)) return true;
    if (!this.fsm.is('playing')) return false;
    if (p.y < GameConfig.hudHeight) return false; // HUD 区域不触发投放
    this.aiming = true;
    this.aimTargetX = p.x;
    if (p.type === 'touch') this.aimX = p.x;
    return true;
  }

  onPointerMove(p) {
    super.onPointerMove(p);
    if (!this.fsm.is('playing')) return;
    if (this.aiming || p.type === 'mouse' || p.type === 'pen') this.aimTargetX = p.x;
  }

  onPointerUp(p) {
    if (super.onPointerUp(p)) return true;
    if (this.aiming && this.fsm.is('playing')) {
      this.aimTargetX = p.x;
      this.aimX = p.x;
      this.drop();
    }
    this.aiming = false;
    return true;
  }

  onKeyDown(e) {
    if (this.fsm.is('revive')) {
      if (e.code === 'Enter' || e.code === 'Space') this.watchReviveAd();
      if (e.code === 'Escape') this.declineRevive();
      return;
    }
    if (this.showSettings && this.fsm.is('paused')) { if (e.code === 'Escape' || e.code === 'Enter') this.showSettings = false; return; }
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (this.fsm.is('playing')) this.pause(); else this.resume();
      return;
    }
    if (!this.fsm.is('playing')) return;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.aimTargetX -= 24;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') this.aimTargetX += 24;
    if (e.code === 'KeyT' && this.hud.tidyBtn) this.onTidyButton();
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowDown') {
      this.aimX = this.aimTargetX;
      this.drop();
    }
  }

  checkDanger(dt) {
    const cfg = GameConfig;
    const limit = this.rules.dangerTime;
    let worst = 0;
    for (const c of [...this.characters, ...this.obstacles.stones]) {
      const above = c.y - c.currentRadius < cfg.dangerY;
      // "静止"：速度很低，或者虽然在抖动但 0.4 秒内几乎没有净位移 (卡住)
      const settled = c.speed < cfg.dangerSpeed || c.drift < cfg.dangerJitter;
      if (above && c.age > cfg.dangerGrace && !c.merging && settled) {
        c.dangerTime += dt;
      } else {
        c.dangerTime = Math.max(0, c.dangerTime - dt * 2);
      }
      if (c.dangerTime > worst) worst = c.dangerTime;
    }
    this.dangerLevel = worst / limit;
    if (this.dangerLevel > 0.15) {
      this.warnTimer -= dt;
      if (this.warnTimer <= 0) { this.game.events.emit('danger:warn'); this.warnTimer = 0.5 - Math.min(1, this.dangerLevel) * 0.3; }
    }
    if (worst >= limit) this.fsm.change(this.canOfferRevive ? 'revive' : 'over');
  }

  update(dt) {
    super.update(dt);
    this.dt = dt;
    this.fsm.update(dt);
    if (this.fsm.is('playing')) {
      const lvl = this.spawn.current;
      this.aimTargetX = this.clampAim(this.aimTargetX, lvl);
      this.aimX += (this.aimTargetX - this.aimX) * Math.min(1, dt * 22);
      this.aimX = this.clampAim(this.aimX, lvl);
      this.spawn.update(dt);
      this.dropTimer.update(dt, this.spawn.canDrop);
      this.obstacles.update(dt);
      this.physics.step(dt);
      for (const c of this.characters) c.update(dt);
      if (this.fsm.is('playing')) this.checkDanger(dt);
    }
    if (!this.fsm.is('paused')) {
      this.score.update(dt);
      this.effects.update(dt);
      this.subtitles.update(dt);
    }
    const playing = this.fsm.is('playing');
    const tidyAd = playing && this.tidyAdReady;
    this.hud.update(dt, Math.floor(this.score.displayScore), {
      tidyUses: this.items.uses,
      canTidy: playing && !this.adPending && (this.items.canUseTidy() || (tidyAd && this.items.hasTargets)),
      tidyAd,
    });
  }

  // ---- 渲染 ----
  render(ctx) {
    const { width: w, height: h } = this.game;
    const cfg = GameConfig;
    const c = this.rules.container;
    drawBackground(ctx, w, h, this.time);

    const shake = this.effects.shakeOffset;
    ctx.save();
    ctx.translate(shake.x, shake.y);

    // 容器
    ctx.save();
    roundRectPath(ctx, c.left - 6, c.top, c.right - c.left + 12, c.bottom - c.top + 6, 22);
    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.stroke();
    ctx.restore();
    const fg = ctx.createLinearGradient(0, c.bottom, 0, c.bottom + 8);
    fg.addColorStop(0, '#ffb3d6'); fg.addColorStop(1, '#ff8fc7');
    ctx.fillStyle = fg;
    roundRectPath(ctx, c.left - 6, c.bottom, c.right - c.left + 12, 8, 4);
    ctx.fill();

    // 警戒线
    const d = Math.min(1, this.dangerLevel);
    ctx.save();
    ctx.setLineDash([14, 10]);
    ctx.lineDashOffset = -this.time * 30;
    ctx.lineWidth = 3 + d * 2;
    ctx.globalAlpha = d > 0 ? 0.5 + 0.5 * Math.abs(Math.sin(this.time * (6 + d * 10))) : 0.45;
    ctx.strokeStyle = cfg.colors.danger;
    ctx.beginPath();
    ctx.moveTo(c.left, cfg.dangerY);
    ctx.lineTo(c.right, cfg.dangerY);
    ctx.stroke();
    ctx.restore();
    if (d > 0.05) {
      drawText(ctx, `危险！${Math.max(0, this.rules.dangerTime * (1 - d)).toFixed(1)}s`, w / 2, cfg.dangerY + 22, { size: 18, color: cfg.colors.danger, stroke: '#fff', strokeWidth: 5 });
    }

    // 瞄准线 + 待投放角色 + 倒计时环
    const def = CHARACTERS[this.spawn.current];
    if (this.fsm.is('playing') || this.fsm.is('paused')) {
      const x = this.aimX;
      const ready = this.spawn.canDrop;
      ctx.save();
      ctx.globalAlpha = ready ? 0.7 : 0.25;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 10]);
      ctx.beginPath();
      ctx.moveTo(x, cfg.dropY + def.radius);
      ctx.lineTo(x, c.bottom);
      ctx.stroke();
      ctx.restore();
      const k = ready ? 1 : easing.backOut(Math.max(0, this.spawn.readiness));
      const bob = Math.sin(this.time * 3) * 2;
      if (k > 0.01) {
        drawPortrait(ctx, this.game.assets.getImage(def.key), x, cfg.dropY + bob, def.radius * Math.max(0.05, k), ready ? 1 : 0.85);
      }
      if (ready && this.dropTimer.enabled) {
        drawCountdownRing(ctx, x, cfg.dropY + bob, def.radius, this.dropTimer.fraction, this.dropTimer.secondsLeft, this.time);
      }
    }

    // 角色与障碍
    const t = this.time;
    this.obstacles.render(ctx, t);
    for (const ch of this.characters) {
      const danger = ch.dangerTime > 0.05 ? ch.dangerTime / this.rules.dangerTime : 0;
      ch.render(ctx, this.game.assets.getImage(ch.def.key), { danger, time: t });
    }
    if (this.fsm.is('over')) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.35, this.fsm.time * 0.4);
      ctx.fillStyle = '#40204f';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    this.effects.render(ctx);
    this.subtitles.render(ctx);
    ctx.restore();

    this.hud.render(ctx, {
      score: this.score.displayScore,
      best: Math.max(this.best, Math.floor(this.score.displayScore)),
      nextLevel: this.spawn.next,
      maxLevel: this.score.maxLevel,
      goal: this.goal,
      dt: this.dt,
      aim: (this.fsm.is('playing') || this.fsm.is('paused'))
        ? { x: this.aimX, y: GameConfig.dropY, r: CHARACTERS[this.spawn.current].radius + 7 + 2, timer: this.spawn.canDrop && this.dropTimer.enabled }
        : null,
    });
    this.effects.renderOverlay(ctx, w, h);

    if (this.fsm.is('over')) {
      const k = Math.min(1, this.fsm.time * 3);
      drawText(ctx, '堆满啦！', w / 2, h * 0.45, { size: 56 * easing.backOut(k), color: cfg.colors.danger, stroke: '#fff', strokeWidth: 12 });
    }
    if (this.fsm.is('victory') && this.fsm.time > 0.8) {
      const goalDef = this.goal.goalDef;
      this.victoryPanel.render(ctx, {
        t: this.fsm.time - 0.8,
        goalDef,
        goalImg: goalDef ? this.game.assets.getImage(goalDef.key) : null,
        difficultyName: this.rules.name,
        score: this.score.score,
        dt: this.dt,
      });
    }
    if (this.fsm.is('paused')) this.renderPause(ctx, w, h);
    if (this.fsm.is('revive')) this.renderRevive(ctx, w, h);
  }

  renderRevive(ctx, w, h) {
    const C = GameConfig.colors;
    const t = this.fsm.time;
    ctx.save();
    ctx.globalAlpha = Math.min(1, t * 3);
    ctx.fillStyle = 'rgba(60,30,80,0.5)';
    ctx.fillRect(0, 0, w, h);
    const k = easing.backOut(Math.min(1, t * 2.5));
    ctx.translate(w / 2, h / 2);
    ctx.scale(k, k);
    ctx.translate(-w / 2, -h / 2);
    drawPanel(ctx, w / 2 - 190, 300, 380, 400, 28);
    drawText(ctx, '堆满啦！', w / 2, 360, { size: 46, color: C.danger, stroke: '#fff', strokeWidth: 10 });
    drawText(ctx, `当前得分 ${this.score.score}`, w / 2, 412, { size: 22, color: C.primary });
    drawText(ctx, this.freeRevive ? '清掉顶部的角色，再给你一次机会' : '看一段视频，清掉顶部的角色继续游戏', w / 2, 456, { size: 17, color: C.text, weight: 'normal' });
    drawText(ctx, '（每局 1 次）', w / 2, 482, { size: 15, color: '#9a7bb0', weight: 'normal' });
    if (this.reviveMsg) drawText(ctx, this.reviveMsg, w / 2, 512, { size: 16, color: C.danger });
    for (const b of this.reviveButtons) b.render(ctx, this.dt);
    ctx.restore();
  }

  renderPause(ctx, w, h) {
    ctx.save();
    ctx.fillStyle = 'rgba(60,30,80,0.45)';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    if (this.showSettings) { this.settings.render(ctx, this.dt); return; }   // 音量设置覆盖暂停面板
    drawPanel(ctx, w / 2 - 170, 290, 340, 440, 28);
    drawText(ctx, '暂停中', w / 2, 350, { size: 38, color: GameConfig.colors.primary, stroke: '#fff', strokeWidth: 8 });
    for (const b of this.pauseButtons) b.render(ctx, this.dt);
  }

  // ---- 调试/测试辅助 ----
  debugSpawn(level, x, y) {
    return this.spawnCharacter(level, x, y);
  }
}
