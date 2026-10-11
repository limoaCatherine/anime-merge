// 游戏内 HUD：分数/难度/最高分、下一个预览、道具与暂停/静音按钮、目标进度条、底部进化链。
import { GameConfig } from '../config/GameConfig.js';
import { CHARACTERS } from '../config/LevelConfig.js';
import { Button, Icons } from './Button.js';
import { drawText, drawPanel, drawPortrait, roundRectPath } from './draw.js';

export class HUD {
  /**
   * @param {object} rules 难度规则
   * @param {{onPause:Function, onMute:Function, onTidy?:Function}} handlers
   */
  constructor(game, rules, { onPause, onMute, onTidy }) {
    this.game = game;
    this.rules = rules;
    this.pauseBtn = new Button({ x: 444, y: 48, w: 46, h: 46, style: 'icon', icon: Icons.pause, onClick: onPause });
    this.muteBtn = new Button({ x: 500, y: 48, w: 46, h: 46, style: 'icon', icon: Icons.sound(game.audio.muted), onClick: () => {
      this.muteBtn.icon = Icons.sound(onMute());
    } });
    this.buttons = [this.pauseBtn, this.muteBtn];
    if (rules.tidyUses > 0 && onTidy) {
      this.tidyBtn = new Button({ x: 378, y: 48, w: 62, h: 62, style: 'icon', icon: Icons.broom, label: '整理', fontSize: 13, badge: rules.tidyUses, onClick: onTidy });
      this.buttons.unshift(this.tidyBtn);
    }
    this.buttons.forEach((b) => { b.audio = game.audio; });
    this.scorePulse = 0;
    this.lastScore = 0;
  }

  update(dt, score, { tidyUses, canTidy } = {}) {
    if (score !== this.lastScore) { this.scorePulse = 1; this.lastScore = score; }
    if (this.scorePulse > 0) this.scorePulse = Math.max(0, this.scorePulse - dt * 4);
    if (this.tidyBtn) {
      this.tidyBtn.badge = tidyUses;
      this.tidyBtn.enabled = !!canTidy;
    }
  }

  render(ctx, { score, best, nextLevel, maxLevel, goal, dt, aim = null }) {
    const C = GameConfig.colors;
    const rules = this.rules;
    // 分数面板
    drawPanel(ctx, 14, 12, 176, 72, 20);
    ctx.save();
    roundRectPath(ctx, 26, 21, 44, 20, 10);
    ctx.fillStyle = rules.color;
    ctx.fill();
    ctx.restore();
    drawText(ctx, rules.name, 48, 32, { size: 13, color: '#fff' });
    const s = 1 + this.scorePulse * 0.18;
    ctx.save();
    ctx.translate(28, 62);
    ctx.scale(s, s);
    drawText(ctx, String(Math.floor(score)), 0, 0, { size: 32, color: C.primary, align: 'left', stroke: '#fff', strokeWidth: 6 });
    ctx.restore();
    drawText(ctx, `最高 ${best}`, 180, 32, { size: 14, color: '#9a7bb0', align: 'right', weight: 'normal' });

    // 下一个
    const nx = this.tidyBtn ? 200 : 202;
    const nw = this.tidyBtn ? 136 : 200;
    drawPanel(ctx, nx, 12, nw, 72, 20);
    drawText(ctx, '下一个', nx + 34, 36, { size: 15, color: C.text });
    const def = CHARACTERS[nextLevel];
    drawText(ctx, def.name, nx + 34, 62, { size: 12, color: '#9a7bb0', weight: 'normal' });
    drawPortrait(ctx, this.game.assets.getImage(def.key), nx + nw - 36, 48, 27);

    for (const b of this.buttons) b.render(ctx, dt);

    // 目标进度 (容器顶部的小胶囊)
    this.renderGoal(ctx, goal, aim, dt);

    // 底部进化链
    const n = CHARACTERS.length;
    const y = 926;
    const gap = (GameConfig.width - 40) / n;
    ctx.save();
    roundRectPath(ctx, 14, y - 26, GameConfig.width - 28, 52, 26);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();
    ctx.restore();
    for (let i = 0; i < n; i++) {
      const x = 20 + gap * (i + 0.5);
      const unlocked = i <= maxLevel;
      const isGoal = goal && goal.hasGoal && i === goal.goalLevel;
      const r = i === maxLevel ? 21 : 18;
      if (isGoal) {
        ctx.save();
        ctx.strokeStyle = '#ffc400';
        ctx.lineWidth = 3;
        ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.arc(x, y, 23, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      if (!unlocked) ctx.globalAlpha = 0.35;
      drawPortrait(ctx, this.game.assets.getImage(CHARACTERS[i].key), x, y, r);
      ctx.restore();
      if (!unlocked) drawText(ctx, '?', x, y + 1, { size: 18, color: '#fff', stroke: '#b9a3c9', strokeWidth: 4 });
      if (isGoal) drawText(ctx, '目标', x, y - 26, { size: 11, color: '#fff', stroke: '#e0a000', strokeWidth: 4 });
    }
  }

  /**
   * 目标胶囊的位置：默认居中；如果会被待投放角色 (含倒计时环与秒数气泡) 挡住，
   * 就平滑移到远离瞄准位置的一侧。aim = { x, y, r, timer } (r 已含倒计时环)
   */
  goalLayout(text, aim, dt = 1, shortText = null) {
    const ctx = this.game.ctx;
    const measure = (t, min) => {
      ctx.save();
      ctx.font = `bold 13px ${GameConfig.fontFamily}`;
      const ww = Math.max(min, Math.ceil(ctx.measureText(t).width) + 28);
      ctx.restore();
      return ww;
    };
    let w = measure(text, 150);
    const h = 22; const y = 98;
    const c = this.rules.container;
    const center = GameConfig.width / 2;
    const candsFor = (ww) => [center, c.left + ww / 2 + 2, c.right - ww / 2 - 2];
    let cands = candsFor(w);
    const hits = (x) => {
      if (!aim) return false;
      const circles = [{ x: aim.x, y: aim.y, r: aim.r + 4 }];
      if (aim.timer) { const rr = aim.r; circles.push({ x: aim.x + rr * 0.72 + 4, y: aim.y - rr * 0.72 - 4, r: 14 * 1.18 + 3 }); }
      return circles.some((o) => {
        const px = Math.max(x - w / 2, Math.min(x + w / 2, o.x));
        const py = Math.max(y - h / 2, Math.min(y + h / 2, o.y));
        return Math.hypot(px - o.x, py - o.y) < o.r;
      });
    };
    let target = cands.find((x) => !hits(x));
    let compact = false;
    if (target == null && shortText) {
      // 两侧都放不下完整文字 (大角色在中间)：换成紧凑版本放到远离瞄准的一侧
      compact = true;
      w = measure(shortText, 60);
      cands = candsFor(w);
      target = cands.find((x) => !hits(x));
    }
    if (target == null) target = aim && aim.x > center ? cands[1] : cands[2];
    if (this.goalX == null || dt >= 1) this.goalX = target;
    else this.goalX += (target - this.goalX) * Math.min(1, dt * 14);
    return { x: this.goalX, y, w, h, target, compact, text: compact ? shortText : text, blocked: hits(this.goalX) };
  }

  renderGoal(ctx, goal, aim, dt) {
    if (!goal) return;
    let text; let short;
    if (!goal.hasGoal) { text = '无尽模式 · 尽情合成吧'; short = '无尽模式'; }
    else if (goal.endless) { text = `已通关 · 无尽挑战中`; short = '已通关'; }
    else { text = `目标：${goal.goalDef.name}  Lv.${goal.best + 1}/${goal.goalLevel + 1}`; short = `目标 Lv.${goal.best + 1}/${goal.goalLevel + 1}`; }
    const L = this.goalLayout(text, aim, dt, short);
    text = L.text;
    this.goalRect = L;
    const cx = L.x; const y = L.y; const w = L.w; const h = L.h;
    ctx.save();
    roundRectPath(ctx, cx - w / 2, y - h / 2, w, h, h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.fill();
    if (goal.hasGoal && !goal.endless) {
      const pw = (w - 6) * goal.progress;
      if (pw > 0) {
        roundRectPath(ctx, cx - w / 2 + 3, y - h / 2 + 3, Math.max(h - 6, pw), h - 6, (h - 6) / 2);
        ctx.fillStyle = 'rgba(255,196,0,0.55)';
        ctx.fill();
      }
    }
    ctx.restore();
    drawText(ctx, text, cx, y + 1, { size: 13, color: GameConfig.colors.text });
  }
}
