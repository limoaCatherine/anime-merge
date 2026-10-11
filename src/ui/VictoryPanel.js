// 胜利面板：达成难度目标后弹出，可继续无尽挑战、再来一局或返回菜单。
import { GameConfig } from '../config/GameConfig.js';
import { Button } from './Button.js';
import { drawPanel, drawText, drawPortrait, drawStar, easing } from './draw.js';

export class VictoryPanel {
  constructor(game, { onContinue, onRetry, onMenu, onShare = null, shareLabel = '分享精彩片段' }) {
    this.game = game;
    const cx = game.width / 2;
    this.buttons = [
      new Button({ x: cx, y: 600, w: 260, h: 66, label: '继续挑战（无尽）', fontSize: 24, onClick: onContinue }),
      new Button({ x: cx, y: 684, w: 220, h: 56, label: '再来一局', style: 'secondary', fontSize: 22, onClick: onRetry }),
      new Button({ x: cx, y: 758, w: 220, h: 56, label: '返回菜单', style: 'secondary', fontSize: 22, onClick: onMenu }),
    ];
    // 抖音：分享本局录屏；微信：转发给好友
    if (onShare) {
      this.shareBtn = new Button({ x: cx, y: 834, w: 240, h: 52, label: shareLabel, style: 'secondary', fontSize: 20, onClick: onShare });
      this.buttons.push(this.shareBtn);
    }
    this.buttons.forEach((b) => { b.audio = game.audio; });
  }

  render(ctx, { t, goalDef, goalImg, difficultyName, score, dt }) {
    const { width: w, height: h } = this.game;
    const C = GameConfig.colors;
    ctx.save();
    ctx.globalAlpha = Math.min(0.5, t);
    ctx.fillStyle = '#3a1d4a';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    const k = easing.backOut(Math.min(1, t * 2.2));
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(k, k);
    ctx.translate(-w / 2, -h / 2);
    drawPanel(ctx, 50, 190, w - 100, this.shareBtn ? 680 : 610, 30);
    ctx.fillStyle = '#ffd23f';
    for (let i = 0; i < 5; i++) {
      const a = t * 1.5 + (i / 5) * Math.PI * 2;
      drawStar(ctx, w / 2 + Math.cos(a) * 110, 390 + Math.sin(a) * 80, 12, 5);
    }
    drawText(ctx, '挑战成功！', w / 2, 245, { size: 46, color: C.primary, stroke: '#fff', strokeWidth: 10 });
    drawText(ctx, `【${difficultyName}】目标达成`, w / 2, 292, { size: 18, color: '#9a7bb0', weight: 'normal' });
    drawPortrait(ctx, goalImg, w / 2, 390, 70);
    drawText(ctx, goalDef ? goalDef.name : '', w / 2, 482, { size: 26, color: C.text });
    drawText(ctx, `当前得分 ${score}`, w / 2, 524, { size: 20, color: C.primary });
    for (const b of this.buttons) b.render(ctx, dt);
    ctx.restore();
  }
}
