// 启动/加载场景：(抖音 / 微信) 先加载语音/BGM 分包，再预加载全部角色图片与语音并显示进度条，完成后进入主菜单。
// 同时显示《健康游戏忠告》、出品方与 (抖音) 软著登记号 / 适龄提示 —— 平台审核要求在游戏开始前显著展示。
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
    const game = this.game;
    const platform = game.platform;
    const needSub = !platform.mediaReady;
    let subP = needSub ? 0 : 1; let imgP = 0; let voiceP = 0;
    const report = () => { this.progress = needSub ? subP * 0.45 + imgP * 0.35 + voiceP * 0.2 : imgP * 0.6 + voiceP * 0.4; };
    this.status = needSub ? '正在下载语音与音乐…' : '加载中…';
    const media = needSub
      ? platform.loadSubpackage(platform.mediaSubpackage || 'media', (p) => { subP = p; report(); }).then((ok) => {
        subP = 1; report();
        if (!ok) console.warn('[BootScene] 语音分包加载失败，游戏将没有语音/音乐');
        platform.mediaReady = true;
        game.bgm.ensure();
        this.status = '加载中…';
      })
      : Promise.resolve();
    Promise.all([
      game.assets.loadImages(list, (p) => { imgP = p; report(); }),
      media.then(() => game.voice.preload((p) => { voiceP = p; report(); })),
    ]).then(() => { this.progress = 1; this.done = true; });
    this.minTime = platform.fullscreenCanvas ? 2.0 : 0.6;   // 抖音：至少显示 2 秒，让玩家看到健康游戏忠告
  }

  update(dt) {
    super.update(dt);
    this.shown += (this.progress - this.shown) * Math.min(1, dt * 10);
    if (this.done && this.time > this.minTime && this.shown > 0.98) {
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
    drawText(ctx, `${this.status || '加载中…'} ${Math.round(this.shown * 100)}%`, w / 2, y + 50, { size: 18, color: GameConfig.colors.text, weight: 'normal' });
    drawText(ctx, `出品：${GameConfig.publisher}`, w / 2, y + 86, { size: 16, color: GameConfig.colors.secondary, weight: 'normal' });
    drawHealthAdvice(ctx, w, h, this.game.platform.publishInfo);
  }
}

/** 《健康游戏忠告》+ (抖音 / 微信) 著作权登记号 / 适龄提示；d = platform.publishInfo */
export function drawHealthAdvice(ctx, w, h, d) {
  const C = GameConfig.colors;
  const y = h - 150;
  roundRectPath(ctx, 40, y - 20, w - 80, 118, 16);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fill();
  drawText(ctx, '健康游戏忠告', w / 2, y, { size: 15, color: C.text });
  drawText(ctx, '抵制不良游戏，拒绝盗版游戏。注意自我保护，谨防受骗上当。', w / 2, y + 24, { size: 13, color: C.text, weight: 'normal' });
  drawText(ctx, '适度游戏益脑，沉迷游戏伤身。合理安排时间，享受健康生活。', w / 2, y + 44, { size: 13, color: C.text, weight: 'normal' });
  const info = [];
  if (d && d.softwareCopyrightNo) info.push(`著作权登记号：${d.softwareCopyrightNo}`);
  if (d && d.ageRating) info.push(`适龄提示：${d.ageRating}`);
  if (info.length) drawText(ctx, info.join('　'), w / 2, y + 70, { size: 12, color: '#9a7bb0', weight: 'normal' });
}
