// 占位激励视频广告画面 (浏览器版没有真实广告时使用)。明确标注「广告占位」；
// 倒计时结束后才能「领取奖励」，提前跳过没有奖励。覆盖在任何场景之上，由 Game 绘制并接收输入。
import { GameConfig } from '../config/GameConfig.js';
import { Button } from './Button.js';
import { drawText, roundRectPath, drawStar } from './draw.js';

const REWARD_LABEL = { revive: '复活', tidy: '+1 次整理' };

export class AdOverlay {
  constructor(game) {
    this.game = game;
    this.ads = game.ads;
    const W = GameConfig.width;
    this.closeBtn = new Button({ x: W - 84, y: 150, w: 140, h: 44, label: '跳过', style: 'secondary', fontSize: 17, onClick: () => this.ads.closeFake(false) });
    this.claimBtn = new Button({ x: W / 2, y: 780, w: 300, h: 66, label: '领取奖励', fontSize: 26, onClick: () => this.ads.closeFake(true) });
    this.closeBtn.audio = game.audio;
    this.claimBtn.audio = game.audio;
    this.t = 0;
  }

  get active() { return this.ads.isShowingFake; }

  get buttons() {
    const fin = this.ads.fakeFinished;
    this.claimBtn.visible = fin;
    const p = this.ads.fake ? this.ads.fake.placement : '';
    this.claimBtn.label = `领取奖励：${REWARD_LABEL[p] || '奖励'}`;
    this.closeBtn.label = fin ? '关闭' : '跳过(无奖励)';
    return [this.claimBtn, this.closeBtn];
  }

  onPointerDown(p) { for (const b of this.buttons) if (b.handleDown(p)) return true; return true; }
  onPointerMove(p) { for (const b of this.buttons) b.handleMove(p); }
  onPointerUp(p) { for (const b of this.buttons) b.handleUp(p); return true; }
  onKeyDown(e) {
    if ((e.code === 'Enter' || e.code === 'Space') && this.ads.fakeFinished) this.ads.closeFake(true);
    if (e.code === 'Escape') this.ads.closeFake(false);
  }

  update(dt) { this.t += dt; }

  render(ctx, dt) {
    const W = GameConfig.width;
    const H = GameConfig.height;
    const t = this.t;
    ctx.save();
    ctx.fillStyle = 'rgba(20,10,30,0.92)';
    ctx.fillRect(0, 0, W, H);
    const vx = 30; const vy = 200; const vw = W - 60; const vh = 420;
    const g = ctx.createLinearGradient(vx, vy, vx + vw, vy + vh);
    const hue = (t * 40) % 360;
    g.addColorStop(0, `hsl(${hue},70%,72%)`);
    g.addColorStop(1, `hsl(${(hue + 80) % 360},70%,62%)`);
    roundRectPath(ctx, vx, vy, vw, vh, 22);
    ctx.fillStyle = g;
    ctx.fill();
    for (let i = 0; i < 14; i++) {
      const sx = vx + 20 + ((i * 97 + t * 40) % (vw - 40));
      const sy = vy + 20 + ((i * 61 + t * (20 + i * 3)) % (vh - 40));
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#fff';
      drawStar(ctx, sx, sy, 8 + (i % 3) * 3, 3);
    }
    ctx.globalAlpha = 1;
    roundRectPath(ctx, vx + 14, vy + 14, 110, 34, 10);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fill();
    drawText(ctx, '广告占位', vx + 69, vy + 31, { size: 18, color: '#ffe14d' });
    drawText(ctx, '这里将播放激励视频广告', W / 2, vy + vh / 2 - 34, { size: 26, color: '#fff', stroke: 'rgba(80,30,90,0.6)', strokeWidth: 5 });
    drawText(ctx, '(抖音小游戏 tt.createRewardedVideoAd)', W / 2, vy + vh / 2 + 4, { size: 16, color: '#fff', weight: 'normal' });
    drawText(ctx, '当前为测试占位，未接入任何广告 SDK', W / 2, vy + vh / 2 + 30, { size: 15, color: 'rgba(255,255,255,0.85)', weight: 'normal' });
    const left = this.ads.fakeRemaining;
    const dur = this.ads.fake ? this.ads.fake.duration : 1;
    const cx = W / 2; const cy = vy + vh - 80;
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(cx, cy, 38, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#ffe14d';
    ctx.beginPath(); ctx.arc(cx, cy, 38, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - left / dur)); ctx.stroke();
    drawText(ctx, left > 0 ? String(Math.ceil(left)) : '✓', cx, cy + 2, { size: 34, color: '#fff' });
    drawText(ctx, left > 0 ? `还剩 ${Math.ceil(left)} 秒` : '看完啦，可以领取奖励', W / 2, 690, { size: 22, color: '#fff' });
    for (const b of this.buttons) b.render(ctx, dt);
    ctx.restore();
  }
}
