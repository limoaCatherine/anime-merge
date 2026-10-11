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
import { BootScene } from '../scenes/BootScene.js';
import { MenuScene } from '../scenes/MenuScene.js';
import { GameScene } from '../scenes/GameScene.js';
import { GameOverScene } from '../scenes/GameOverScene.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = GameConfig.width;
    this.height = GameConfig.height;
    this.config = GameConfig;
    this.difficulties = DIFFICULTIES;   // 调试/平衡模拟 (tools/bot-sim.mjs) 用
    this.characters = CHARACTERS;
    this.voiceLines = VOICE_LINES;
    this.time = 0;
    this.pixelScale = 1;

    // 全局服务
    this.events = new EventBus();
    this.assets = new AssetLoader();
    this.save = new SaveSystem(GameConfig.storageKey);
    this.mixer = new MixerSystem(this.events, this.save);          // 总音量 + 各声道音量
    this.audio = new AudioSystem(this.events, this.save, this.mixer);
    this.voice = new VoiceSystem(this.events, this.save, this.audio, this.mixer);
    this.bgm = new BgmSystem(this.events, this.save, this.audio, this.mixer);   // 跨场景连续播放
    this.input = new InputSystem(this);

    // 场景
    this.scenes = new SceneManager(this);
    this.scenes.register(new BootScene(this));
    this.scenes.register(new MenuScene(this));
    this.scenes.register(new GameScene(this));
    this.scenes.register(new GameOverScene(this));

    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    window.addEventListener('orientationchange', this.resize);
    document.addEventListener('visibilitychange', () => {
      this.events.emit(document.hidden ? 'app:hidden' : 'app:visible');
    });
    this.resize();
  }

  /** 等比缩放到窗口 (保持 9:16)，并按设备像素比提高清晰度 */
  resize() {
    const vw = window.innerWidth || this.width;
    const vh = window.innerHeight || this.height;
    const scale = Math.min(vw / this.width, vh / this.height);
    const cssW = Math.floor(this.width * scale);
    const cssH = Math.floor(this.height * scale);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.canvas.width = Math.max(1, Math.round(cssW * dpr));
    this.canvas.height = Math.max(1, Math.round(cssH * dpr));
    this.pixelScale = this.canvas.width / this.width;
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
  }

  start() {
    this.scenes.change('boot', {}, { transition: false });
    this.last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      this.time += dt;
      this.scenes.update(dt);
      this.voice.update(dt);
      this.bgm.update(dt);
      const ctx = this.ctx;
      ctx.setTransform(this.pixelScale, 0, 0, this.pixelScale, 0, 0);
      ctx.clearRect(0, 0, this.width, this.height);
      this.scenes.render(ctx);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /** 截取当前画面 (用于结算场景背景) */
  snapshot() {
    const c = document.createElement('canvas');
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    c.getContext('2d').drawImage(this.canvas, 0, 0);
    return c;
  }
}
