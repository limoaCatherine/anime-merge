// 浏览器平台 (dist/index.html 双击运行 / 本地服务器)。也是 ElectronPlatform 的基类。
import { Platform } from './Platform.js';
import { PlatformConfig } from '../config/PlatformConfig.js';

/** HTMLAudioElement 的统一封装 (AudioClip 接口)，抖音版对应 DouyinPlatform 里的 InnerAudioClip */
export class HtmlAudioClip {
  constructor(src, { loop = false, preload = true } = {}) {
    const el = new Audio();
    el.loop = loop;
    el.preload = preload ? 'auto' : 'none';
    this.el = el;
    this._ended = null;
    el.addEventListener('ended', () => { if (this._ended) this._ended(); });
    if (src) el.src = src;
  }
  onReady(cb) {
    let fired = false;
    const f = () => { if (!fired) { fired = true; cb(); } };
    this.el.addEventListener('canplaythrough', f, { once: true });
    this.el.addEventListener('loadeddata', f, { once: true });
  }
  onError(cb) { this.el.addEventListener('error', () => cb(this.el.error ? this.el.error.code : 'error')); }
  onEnded(cb) { this._ended = cb; }
  load() { try { this.el.load(); } catch (_) { /* ignore */ } }
  play() { return this.el.play(); }
  pause() { this.el.pause(); }
  stop() { this.el.pause(); try { this.el.currentTime = 0; } catch (_) { /* ignore */ } }
  canPlayType(t) { return this.el.canPlayType(t); }
  get paused() { return this.el.paused; }
  get ended() { return this.el.ended; }
  get volume() { return this.el.volume; }
  set volume(v) { this.el.volume = v; }
  get currentTime() { return this.el.currentTime; }
  set currentTime(t) { this.el.currentTime = t; }
  get duration() { return this.el.duration; }
  get loop() { return this.el.loop; }
  get src() { return this.el.src; }
  get error() { return this.el.error; }
  destroy() { this.el.pause(); this.el.removeAttribute('src'); }
}

export class WebPlatform extends Platform {
  constructor(canvas) {
    super();
    this.name = 'web';
    this.canvas = canvas || document.getElementById('game');
    this.hasKeyboard = true;
    const q = (typeof location !== 'undefined' && location.search) || '';
    /** ?noads 关闭占位广告 (自动化测试用) */
    this.noAds = /[?&]noads\b/.test(q);
  }

  createCanvas(w = 1, h = 1) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  getViewport() {
    return {
      width: window.innerWidth || 540,
      height: window.innerHeight || 960,
      dpr: Math.min(window.devicePixelRatio || 1, 2.5),
    };
  }

  applyCanvasSize(cssW, cssH, pxW, pxH) {
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = pxW;
    this.canvas.height = pxH;
  }

  onResize(cb) {
    window.addEventListener('resize', cb);
    window.addEventListener('orientationchange', cb);
  }

  now() { return performance.now(); }
  requestFrame(cb) { return requestAnimationFrame(cb); }

  loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = this.resolvePath(src);
    });
  }

  clientToCanvas(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - r.left) / (r.width || 1)) * this.canvas.width,
      y: ((clientY - r.top) / (r.height || 1)) * this.canvas.height,
    };
  }

  bindInput(h) {
    const c = this.canvas;
    const pt = (e) => ({ id: e.pointerId, type: e.pointerType || 'mouse', ...this.clientToCanvas(e.clientX, e.clientY) });
    c.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (h.down(pt(e))) { try { c.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ } }
    });
    c.addEventListener('pointermove', (e) => h.move(pt(e)));
    window.addEventListener('pointerup', (e) => h.up(pt(e)));
    window.addEventListener('pointercancel', (e) => h.cancel({ id: e.pointerId }));
    // 指针捕获意外丢失 (例如在窗口外松开鼠标而没有收到 pointerup)：当作取消
    c.addEventListener('lostpointercapture', (e) => h.cancel({ id: e.pointerId }));
    window.addEventListener('blur', () => h.blur());
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (e.repeat && (e.code === 'Space' || e.code === 'Enter')) return;
      h.key(e);
    });
  }

  createWebAudioContext() {
    const AC = window.AudioContext || window.webkitAudioContext;
    return AC ? new AC() : null;
  }

  createAudio(src, opts) {
    if (typeof Audio === 'undefined') return null;
    return new HtmlAudioClip(src ? this.resolvePath(src) : src, opts);
  }

  speak(text, { lang = 'ja-JP', voiceHint = null, rate = 1, pitch = 1, volume = 1, onEnd } = {}) {
    const synth = window.speechSynthesis;
    if (!synth || typeof window.SpeechSynthesisUtterance === 'undefined') return null;
    if (!this._jaVoice) {
      const voices = synth.getVoices() || [];
      const ja = voices.filter((v) => /^ja/i.test(v.lang));
      this._jaVoice = ja.find((v) => voiceHint && voiceHint.test(v.name)) || ja[0] || null;
    }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    if (this._jaVoice) u.voice = this._jaVoice;
    u.rate = rate; u.pitch = pitch; u.volume = volume;
    if (onEnd) u.onend = onEnd;
    synth.speak(u);
    return u;
  }

  get speaking() { return !!(window.speechSynthesis && window.speechSynthesis.speaking); }
  cancelSpeech() { try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (_) { /* ignore */ } }

  storageGet(key) { return window.localStorage.getItem(key); }
  storageSet(key, value) { window.localStorage.setItem(key, value); return true; }

  onShow(cb) { document.addEventListener('visibilitychange', () => { if (!document.hidden) cb({}); }); }
  onHide(cb) { document.addEventListener('visibilitychange', () => { if (document.hidden) cb(); }); }
  get hidden() { return !!document.hidden; }

  /** 浏览器版：默认关闭占位广告 (PlatformConfig.web.placeholderAds = false)，不显示任何看广告入口 */
  get placeholderAds() { return PlatformConfig.web.placeholderAds && !this.noAds; }

  exposeDebug(game) { window.__ANIME_MERGE__ = game; }
}
