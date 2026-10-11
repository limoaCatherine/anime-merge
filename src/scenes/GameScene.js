// 核心游戏场景：按难度规则组合各系统 (物理/投放/倒计时/合成/计分/障碍/道具/目标/特效/字幕)，
// 负责瞄准投放、警戒线判负、暂停、胜利等流程编排。具体玩法逻辑都在 systems/ 中。
import { Scene } from '../core/Scene.js';
import { StateMachine } from '../core/StateMachine.js';
import { GameConfig } from '../config/GameConfig.js';
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
    this.items = new ItemSystem(events, this, rules.tidyUses);
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

    this.hud = new HUD(game, rules, {
      onPause: () => this.pause(),
      onMute: () => game.audio.toggleMute(),
      onTidy: () => { if (this.fsm.is('playing')) this.items.useTidy(); },
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
    });

    this.fsm = new StateMachine(this)
      .add('playing', {})
      .add('paused', {})
      .add('victory', {
        enter() { game.save.markCleared(this.difficulty); this.aiming = false; this.merge.cancelPending(); },
      })
      .add('over', {
        enter() {
          this.merge.enabled = false;
          this.merge.cancelPending();
          this.aiming = false;
          const isNewRecord = this.submitScore();
          events.emit('game:over', { score: this.score.score, isNewRecord, difficulty: this.difficulty });
          this.isNewRecord = isNewRecord;
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
  }

  exit() {
    // 中途离开 (如胜利后返回菜单) 也记录成绩
    if (!this.submitted && this.score.score > 0) this.submitScore();
    this.game.events.emit('game:exit');   // 语音系统据此停止并清空排队的台词
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
  }

  activeButtons() {
    if (this.fsm.is('paused')) return this.showSettings ? this.settings.buttons : this.pauseButtons;
    if (this.fsm.is('victory')) return this.fsm.time > 0.8 ? this.victoryPanel.buttons : [];
    if (this.fsm.is('over')) return [];
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
    if (this.showSettings && this.fsm.is('paused')) { if (e.code === 'Escape' || e.code === 'Enter') this.showSettings = false; return; }
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (this.fsm.is('playing')) this.pause(); else this.resume();
      return;
    }
    if (!this.fsm.is('playing')) return;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.aimTargetX -= 24;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') this.aimTargetX += 24;
    if (e.code === 'KeyT' && this.items.enabled) this.items.useTidy();
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
    if (worst >= limit) this.fsm.change('over');
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
    this.hud.update(dt, Math.floor(this.score.displayScore), { tidyUses: this.items.uses, canTidy: this.fsm.is('playing') && this.items.canUseTidy() });
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
