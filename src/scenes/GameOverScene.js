// 结算场景：显示本局得分、最高分、是否新纪录与最高合成角色，可再来一局或返回菜单。
import { Scene } from '../core/Scene.js';
import { GameConfig } from '../config/GameConfig.js';
import { CHARACTERS } from '../config/LevelConfig.js';
import { DIFFICULTIES } from '../config/DifficultyConfig.js';
import { Button } from '../ui/Button.js';
import { drawText, drawPanel, drawPortrait, drawStar, easing } from '../ui/draw.js';

export class GameOverScene extends Scene {
  constructor(game) {
    super(game, 'gameover');
  }

  enter(data) {
    this.data = data;
    const cx = this.game.width / 2;
    this.retryBtn = new Button({ x: cx, y: 690, w: 250, h: 70, label: '再来一局', fontSize: 30, onClick: () => this.retry() });
    this.menuBtn = new Button({ x: cx, y: 780, w: 220, h: 60, label: '返回菜单', style: 'secondary', fontSize: 24, onClick: () => this.game.scenes.change('menu') });
    this.buttons = [this.retryBtn, this.menuBtn];
    this.buttons.forEach((b) => { b.audio = this.game.audio; });
    this.shownScore = 0;
    this.dt = 1 / 60;
  }

  retry() {
    this.game.scenes.change('game', { difficulty: this.data.difficulty });
  }

  onKeyDown(e) {
    if (e.code === 'Enter' || e.code === 'Space') this.retry();
    if (e.code === 'Escape') this.game.scenes.change('menu');
  }

  update(dt) {
    super.update(dt);
    this.dt = dt;
    const target = this.data.score;
    if (this.time > 0.4) this.shownScore = Math.min(target, this.shownScore + Math.max(1, target * dt * 1.5));
  }

  render(ctx) {
    const { width: w, height: h } = this.game;
    const C = GameConfig.colors;
    const d = this.data;
    if (d.snapshot) ctx.drawImage(d.snapshot, 0, 0, w, h);
    ctx.save();
    ctx.globalAlpha = Math.min(0.55, this.time * 1.2);
    ctx.fillStyle = '#3a1d4a';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    const k = easing.backOut(Math.min(1, this.time * 2.2));
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(k, k);
    ctx.translate(-w / 2, -h / 2);

    drawPanel(ctx, 50, 170, w - 100, 660, 30);
    drawText(ctx, '游戏结束', w / 2, 225, { size: 44, color: C.primary, stroke: '#fff', strokeWidth: 10 });

    const diff = DIFFICULTIES[d.difficulty];
    drawText(ctx, `【${diff ? diff.name : ''}】本局得分${d.cleared ? ' · 已通关' : ''}`, w / 2, 285, { size: 18, color: '#9a7bb0', weight: 'normal' });
    drawText(ctx, String(Math.floor(this.shownScore)), w / 2, 330, { size: 58, color: C.primary, stroke: '#fff', strokeWidth: 8 });
    if (d.isNewRecord) {
      const s = 1 + Math.sin(this.time * 6) * 0.06;
      ctx.save();
      ctx.translate(w / 2, 384);
      ctx.scale(s, s);
      ctx.fillStyle = '#ffd23f';
      drawStar(ctx, -96, 0, 14, 6);
      drawStar(ctx, 96, 0, 14, 6);
      drawText(ctx, '新纪录！', 0, 0, { size: 28, color: '#ff8a00', stroke: '#fff', strokeWidth: 6 });
      ctx.restore();
    } else {
      drawText(ctx, `${diff ? diff.name : ''}最高分 ${d.best}`, w / 2, 384, { size: 20, color: C.text });
    }

    const def = CHARACTERS[d.maxLevel];
    drawText(ctx, '本局最高合成', w / 2, 432, { size: 16, color: '#9a7bb0', weight: 'normal' });
    drawPortrait(ctx, this.game.assets.getImage(def.key), w / 2, 510, 58);
    drawText(ctx, `Lv.${d.maxLevel + 1} ${def.name}`, w / 2, 590, { size: 22, color: C.text });
    drawText(ctx, `共合成 ${d.merges} 次`, w / 2, 620, { size: 15, color: '#9a7bb0', weight: 'normal' });

    for (const b of this.buttons) b.render(ctx, this.dt);
    ctx.restore();
  }
}
