// 背景音乐系统：一首原创的轻松可爱 lo-fi / 八音盒风格循环曲 (tools/compose_bgm.py 程序化作曲渲染)。
// - 属于全局服务 (由 Game 持有)，跨场景连续播放：菜单 → 游戏 → 结算 → 菜单 不会重新开始
// - 使用 HTMLAudioElement (loop) 播放：file:// 双击运行与 Electron app.asar 内都可用；ogg 首尾无缝
// - 独立音量与独立开关 (存档 bgmOn)，遵守全局静音；窗口隐藏/最小化时暂停，回来后淡入继续
// - 台词播放时 (voice:start → voice:end) 平滑压低音量 (ducking)
// - 浏览器禁止无交互自动播放时，在第一次点击/按键时开始；Electron 桌面版启动即播放
// 只通过事件与其它系统交互：audio:mute / app:hidden / app:visible / voice:start / voice:end / input:*
import { AudioConfig } from '../config/AudioConfig.js';

const CFG = AudioConfig.bgm;

export class BgmSystem {
  constructor(events, save, audio, mixer) {
    this.events = events;
    this.save = save;
    this.audio = audio;                      // 读取全局静音状态
    this.enabled = save.get('bgmOn', true);
    this.mixer = mixer;                      // 音量由 MixerSystem 决定 (总音量 × 音乐声道)
    this.hidden = typeof document !== 'undefined' && !!document.hidden;
    this.el = null;
    this.src = null;
    this.level = 0;                          // 当前实际音量系数 (淡入/闪避平滑)
    this.duck = 1;                           // 闪避系数
    this.voiceActive = false;
    this.voiceTime = 0;
    this.blocked = false;                    // 自动播放被浏览器拦截，等待用户交互
    this.lastError = null;

    events.on('input:down', () => this.unlock());
    events.on('input:key', () => this.unlock());
    events.on('audio:mute', () => this.sync());
    events.on('app:hidden', () => { this.hidden = true; this.sync(); });
    events.on('app:visible', () => { this.hidden = false; this.sync(); });
    events.on('voice:start', () => { this.voiceActive = true; this.voiceTime = 0; });
    events.on('voice:end', () => { this.voiceActive = false; });

    this.init();
  }

  init() {
    if (typeof Audio === 'undefined') return;
    const probe = new Audio();
    const pick = CFG.sources.find((s) => probe.canPlayType(s.type)) || CFG.sources[CFG.sources.length - 1];
    this.src = pick.src;
    const el = new Audio();
    el.loop = true;
    el.preload = 'auto';
    el.volume = 0;
    el.src = pick.src;
    el.addEventListener('error', () => {
      this.lastError = el.error ? el.error.code : 'error';
      console.warn('[BgmSystem] 背景音乐加载失败:', pick.src);
    });
    this.el = el;
    this.sync();
  }

  /** 是否应该在播放 */
  get shouldPlay() {
    return !!this.el && this.enabled && !this.audio.muted && !this.hidden;
  }

  get playing() {
    return !!this.el && !this.el.paused;
  }

  /** 第一次用户交互：浏览器允许播放了 */
  unlock() {
    if (this.blocked || (this.shouldPlay && !this.playing)) this.sync();
  }

  /** 根据开关/静音/可见性 播放或暂停 (暂停后继续时从原位置淡入，不会从头开始) */
  sync() {
    const el = this.el;
    if (!el) return;
    if (this.shouldPlay) {
      if (!el.paused) return;
      this.level = 0;
      el.volume = 0;
      try {
        const pr = el.play();
        if (pr && pr.then) {
          pr.then(() => { this.blocked = false; })
            .catch((err) => { if (err && err.name === 'NotAllowedError') this.blocked = true; });
        }
      } catch (_) { this.blocked = true; }
    } else if (!el.paused) {
      el.pause();
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    this.save.set('bgmOn', this.enabled);
    this.sync();
    this.events.emit('bgm:toggle', this.enabled);
    return this.enabled;
  }

  get volume() {
    return this.mixer ? this.mixer.gain('bgm') : CFG.volume;
  }

  /** 每帧：平滑处理淡入与闪避 */
  update(dt) {
    if (!this.el || this.el.paused) return;
    if (this.voiceActive) {
      this.voiceTime += dt;
      if (this.voiceTime > CFG.maxDuckTime) this.voiceActive = false;
    }
    const duckTarget = this.voiceActive ? CFG.duck : 1;
    const tau = duckTarget < this.duck ? CFG.duckAttack : CFG.duckRelease;
    this.duck += (duckTarget - this.duck) * (1 - Math.exp(-dt / tau));
    this.level += (1 - this.level) * (1 - Math.exp(-dt / CFG.fadeIn));
    const v = Math.max(0, Math.min(1, this.volume * this.duck * this.level));
    if (Math.abs(this.el.volume - v) > 0.0005) this.el.volume = v;
  }

  /** 调试/测试用状态 */
  state() {
    const el = this.el;
    return {
      src: this.src,
      enabled: this.enabled,
      playing: this.playing,
      blocked: this.blocked,
      time: el ? el.currentTime : 0,
      duration: el ? el.duration : 0,
      loop: el ? el.loop : false,
      volume: el ? el.volume : 0,
      baseVolume: this.volume,
      duck: this.duck,
      voiceActive: this.voiceActive,
      error: this.lastError,
    };
  }
}
