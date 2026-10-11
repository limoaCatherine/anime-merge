// 启动/加载场景：预加载全部角色图片与语音并显示进度条，完成后进入主菜单。
import { Scene } from '../core/Scene.js';
import { CHARACTERS } from '../config/LevelConfig.js';
import { GameConfig } from '../config/GameConfig.js';
import { drawBackground, drawText, roundRectPath } from '../ui/draw.js';

export class BootScene extends Scene {
  constructor(game) {
    super(game, 'boot');
  }

  enter() {
    this.progress = 0;
    this.shown = 0;
    this.done = false;
    const list = CHARACTERS.map((c, i) => ({ key: c.key, src: c.image, color: c.ringColor, label: String(i + 1) }));
    let imgP = 0; let voiceP = 0;
    const report = () => { this.progress = imgP * 0.6 + voiceP * 0.4; };
    Promise.all([
      this.game.assets.loadImages(list, (p) => { imgP = p; report(); }),
      this.game.voice.preload((p) => { voiceP = p; report(); }),
    ]).then(() => { this.progress = 1; this.done = true; });
  }

  update(dt) {
    super.update(dt);
    this.shown += (this.progress - this.shown) * Math.min(1, dt * 10);
    if (this.done && this.time > 0.6 && this.shown > 0.98) {
      this.done = false;
      this.game.scenes.change('menu');
    }
  }

  render(ctx) {
    const { width: w, height: h } = this.game;
    drawBackground(ctx, w, h, this.time);
    drawText(ctx, `《${GameConfig.title}》`, w / 2, h * 0.4, { size: 48, color: GameConfig.colors.primary, stroke: '#fff', strokeWidth: 10 });
    drawText(ctx, GameConfig.subtitle, w / 2, h * 0.4 + 52, { size: 22, color: GameConfig.colors.secondary });
    const bw = 300; const bh = 22; const x = (w - bw) / 2; const y = h * 0.58;
    roundRectPath(ctx, x, y, bw, bh, bh / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fill();
    roundRectPath(ctx, x + 3, y + 3, Math.max(bh - 6, (bw - 6) * this.shown), bh - 6, (bh - 6) / 2);
    ctx.fillStyle = GameConfig.colors.primary;
    ctx.fill();
    drawText(ctx, `加载中… ${Math.round(this.shown * 100)}%`, w / 2, y + 50, { size: 18, color: GameConfig.colors.text, weight: 'normal' });
  }
}
