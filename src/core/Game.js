// 游戏主类：持有 Canvas、事件总线、全局系统与场景管理器，驱动主循环。
import { GameConfig } from '../config/GameConfig.js';
import { DIFFICULTIES } from '../config/DifficultyConfig.js';
import { CHARACTERS } from '../config/LevelConfig.js';
import { VOICE_LINES } from '../config/VoiceConfig.js';
import { EventBus } from './EventBus.js';
import { SceneManager } from './SceneManager.js';
import { AssetLoader } from './AssetLoader.js';
import { InputSystem } from '../systems/InputSystem.js';
import { AudioSystem } from '../systems/AudioSystem.js';
import { VoiceSystem } from '../systems/VoiceSystem.js';
import { BgmSystem } from '../systems/BgmSystem.js';
import { MixerSystem } from '../systems/MixerSystem.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import { AdService } from '../systems/AdService.js';
import { AdOverlay } from '../ui/AdOverlay.js';
import { BootScene } from '../scenes/BootScene.js';
import { MenuScene } from '../scenes/MenuScene.js';
import { GameScene } from '../scenes/GameScene.js';
import { GameOverScene } from '../scenes/GameOverScene.js';

export class Game {
  /** @param {import('../platform/Platform.js').Platform} platform 运行平台 (浏览器 / Electron / 抖音) */
  constructor(platform) {
    this.platform = platform;
    this.canvas = platform.getCanvas();
    this.ctx = this.canvas.getContext('2d');
    this.width = GameConfig.width;
    this.height = GameConfig.height;
    this.config = GameConfig;
    this.difficulties = DIFFICULTIES;   // 调试/平衡模拟 (tools/bot-sim.mjs) 用
    this.characters = CHARACTERS;
    this.voiceLines = VOICE_LINES;
    this.time = 0;
    this.pixelScale = 1;
    this.view = { ox: 0, oy: 0, scale: 1 };   // 逻辑坐标 → 画布像素：px = ox + x * scale

    // 全局服务
    this.events = new EventBus();
    this.assets = new AssetLoader(platform);
    this.save = new SaveSystem(GameConfig.storageKey, platform);
    this.mixer = new MixerSystem(this.events, this.save);          // 总音量 + 各声道音量
    this.audio = new AudioSystem(this.events, this.save, this.mixer, platform);
    this.voice = new VoiceSystem(this.events, this.save, this.audio, this.mixer, platform);
    this.bgm = new BgmSystem(this.events, this.save, this.audio, this.mixer, platform);   // 跨场景连续播放
    this.ads = new AdService(this.events, platform);               // 激励视频 (复活 / +1 整理)
    this.adOverlay = new AdOverlay(this);                          // 占位广告画面
    this.input = new InputSystem(this);

    // 场景
    this.scenes = new SceneManager(this);
    this.scenes.register(new BootScene(this));
    this.scenes.register(new MenuScene(this));
    this.scenes.register(new GameScene(this));
    this.scenes.register(new GameOverScene(this));

    this.resize = this.resize.bind(this);
    platform.onResize(this.resize);
    platform.onShow((res) => this.events.emit('app:visible', res || {}));
    platform.onHide(() => this.events.emit('app:hidden'));
    this.resize();
  }

  /**
   * 适配屏幕 (保持 9:16 逻辑分辨率 540×960)，并按设备像素比提高清晰度。
   * - 浏览器/桌面：画布本身等比缩放并居中 (CSS)
   * - 抖音：画布铺满屏幕，游戏画面在画布内等比居中 (上下/左右留边)，并避开右上角胶囊按钮
   */
  resize() {
    const p = this.platform;
    const vp = p.getViewport();
    const vw = vp.width || this.width;
    const vh = vp.height || this.height;
    const dpr = vp.dpr || 1;
    if (!p.fullscreenCanvas) {
      const scale = Math.min(vw / this.width, vh / this.height);
      const cssW = Math.floor(this.width * scale);
      const cssH = Math.floor(this.height * scale);
      p.applyCanvasSize(cssW, cssH, Math.max(1, Math.round(cssW * dpr)), Math.max(1, Math.round(cssH * dpr)));
      this.pixelScale = this.canvas.width / this.width;
      this.view = { ox: 0, oy: 0, scale: this.pixelScale };
    } else {
      const pxW = Math.max(1, Math.round(vw * dpr));
      const pxH = Math.max(1, Math.round(vh * dpr));
      p.applyCanvasSize(vw, vh, pxW, pxH);
      const scale = Math.min(pxW / this.width, pxH / this.height);
      const gw = this.width * scale;
      const gh = this.height * scale;
      let oy = (pxH - gh) / 2;
      const safeTop = (p.getSafeTop() || 0) * dpr;
      if (oy < safeTop) oy = Math.max(0, Math.min(safeTop, pxH - gh));
      this.pixelScale = scale;
      this.view = { ox: Math.round((pxW - gw) / 2), oy: Math.round(oy), scale };
    }
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
  }

  /** 画布像素坐标 → 逻辑坐标 */
  toLogical(px, py) {
    const v = this.view;
    return { x: (px - v.ox) / v.scale, y: (py - v.oy) / v.scale };
  }

  /** 每帧推进 (平台帧循环调用；测试也可手动调用) */
  frame(dt) {
    this.time += dt;
    this.ads.update(dt);
    if (this.ads.isShowingFake) this.adOverlay.update(dt);
    // 广告播放期间暂停游戏逻辑 (真实广告平台本身也会暂停渲染)
    if (!this.ads.busy) {
      this.scenes.update(dt);
      this.voice.update(dt);
    }
    this.bgm.update(dt);
    this.draw();
  }

  draw() {
    const ctx = this.ctx;
    const v = this.view;
    const full = this.platform.fullscreenCanvas;
    if (full) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = GameConfig.colors.letterbox || GameConfig.colors.bgBottom;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    ctx.setTransform(v.scale, 0, 0, v.scale, v.ox, v.oy);
    ctx.save();
    if (full) { ctx.beginPath(); ctx.rect(0, 0, this.width, this.height); ctx.clip(); }
    ctx.clearRect(0, 0, this.width, this.height);
    this.scenes.render(ctx);
    if (this.ads.isShowingFake) this.adOverlay.render(ctx, 1 / 60);
    ctx.restore();
  }

  start() {
    this.scenes.change('boot', {}, { transition: false });
    const p = this.platform;
    this.last = p.now();
    const loop = (now) => {
      if (typeof now !== 'number') now = p.now();
      const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      this.frame(dt);
      p.requestFrame(loop);
    };
    p.requestFrame(loop);
  }

  /** 截取当前游戏画面 (用于结算场景背景)，只截游戏区域 (不含抖音版的留边) */
  snapshot() {
    const v = this.view;
    const w = Math.max(1, Math.round(this.width * v.scale));
    const h = Math.max(1, Math.round(this.height * v.scale));
    const c = this.platform.createCanvas(w, h);
    c.getContext('2d').drawImage(this.canvas, v.ox, v.oy, w, h, 0, 0, w, h);
    return c;
  }
}
