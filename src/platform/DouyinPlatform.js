// 抖音小游戏平台 (tt.*)。官方文档：https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/api/javascript-api/
// - 画布：第一次 tt.createCanvas() 是唯一的上屏画布 (铺满屏幕)，之后创建的都是离屏画布
// - 输入：tt.onTouchStart / onTouchMove / onTouchEnd / onTouchCancel (多点触摸按 identifier 跟踪，只处理第一根手指)
// - 音频：tt.createInnerAudioContext (mp3；iOS 不支持 ogg)；不保证 WebAudio → 音效使用预渲染的 mp3 文件
// - 存储：tt.getStorageSync / tt.setStorageSync (单个 key ≤ 1MB，总计 ≤ 10MB)
// - 生命周期：tt.onShow / tt.onHide (必须在 game.js 启动时同步注册 onShow，侧边栏复访要用最新的 onShow 参数)
// - 激励视频：tt.createRewardedVideoAd({ adUnitId })，全局单例，onClose(res.isEnded / res.count)
// - 录屏：tt.getGameRecorderManager() (start/stop/onStop → videoPath)，分享：tt.shareAppMessage({ channel: 'video' })
// - 侧边栏复访：tt.checkScene / tt.navigateToScene({ scene: 'sidebar' })
import { Platform } from './Platform.js';
import { PlatformConfig, douyinAdUnitId } from '../config/PlatformConfig.js';

/** 游戏内资源路径 → 抖音包内路径 (与 tools/build-douyin.mjs 的输出目录一致) */
export const DOUYIN_PATHS = [
  ['assets/images/', 'images/'],
  ['assets/audio/sfx/', 'sfx/'],
  ['assets/audio/', `${PlatformConfig.douyin.mediaSubpackage}/`],   // 语音 + BGM 在分包里
];

/** tt.createInnerAudioContext 的 AudioClip 封装 (接口同 WebPlatform 的 HtmlAudioClip) */
export class InnerAudioClip {
  constructor(tt, src, { loop = false } = {}) {
    const a = tt.createInnerAudioContext();
    a.autoplay = false;
    a.loop = loop;
    this.a = a;
    this._src = src;
    this._ended = null;
    this._ready = [];
    this._isReady = false;
    this._error = null;
    this._ended = null;
    if (a.onCanplay) a.onCanplay(() => { if (!this._isReady) { this._isReady = true; this._ready.forEach((f) => f()); } });
    if (a.onEnded) a.onEnded(() => { if (this._ended) this._ended(); });
    if (a.onError) a.onError((e) => { this._error = e || { errMsg: 'error' }; (this._errs || []).forEach((f) => f(e && e.errCode)); });
    if (src) a.src = src;
  }
  onReady(cb) { if (this._isReady) cb(); else this._ready.push(cb); }
  onError(cb) { (this._errs = this._errs || []).push(cb); }
  onEnded(cb) { this._ended = cb; }
  load() {}
  play() {
    try { this.a.play(); return Promise.resolve(); } catch (err) { return Promise.reject(err); }
  }
  pause() { try { this.a.pause(); } catch (_) { /* ignore */ } }
  stop() { try { this.a.stop(); } catch (_) { /* ignore */ } }
  canPlayType(t) { return /mpeg|mp3/i.test(t) ? 'probably' : ''; }
  get paused() { return this.a.paused !== false; }
  get ended() { return false; }
  get volume() { return this.a.volume; }
  set volume(v) { this.a.volume = Math.max(0, Math.min(1, v)); }
  get currentTime() { return this.a.currentTime || 0; }
  set currentTime(t) { try { this.a.seek(t); } catch (_) { /* ignore */ } }
  get duration() { return this.a.duration || 0; }
  get loop() { return this.a.loop; }
  get src() { return this._src; }
  get error() { return this._error; }
  destroy() { try { this.a.destroy(); } catch (_) { /* ignore */ } }
}

export class DouyinPlatform extends Platform {
  constructor(tt) {
    super();
    this.name = 'douyin';
    this.tt = tt;
    this.fullscreenCanvas = true;
    this.autoplay = true;
    this.preferSampledSfx = true;
    this.seamlessBgm = true;           // iOS 不支持 ogg，mp3 的 loop 有空隙 → BgmSystem 双播放器交叉淡化
    this.mediaReady = false;           // 语音 + BGM 在分包里，loadSubpackage 成功后置为 true      // 音效用预渲染 mp3 (不依赖 WebAudio)
    // 必须尽早同步注册 onShow (侧边栏复访要求在 game.js 运行时就监听)
    this.lastShow = (tt.getLaunchOptionsSync && tt.getLaunchOptionsSync()) || {};
    this._showCbs = [];
    this._hideCbs = [];
    if (tt.onShow) tt.onShow((res) => { this.lastShow = res || {}; this._showCbs.forEach((f) => f(this.lastShow)); });
    if (tt.onHide) tt.onHide(() => this._hideCbs.forEach((f) => f()));
    this.canvas = tt.createCanvas();          // 第一次创建 = 上屏画布
    this.info = tt.getSystemInfoSync ? tt.getSystemInfoSync() : {};
    this._rec = null;
    this._recState = 'idle';
    this._ad = null;
    if (tt.onShareAppMessage) {
      tt.onShareAppMessage(() => ({ title: PlatformConfig.douyin.shareTitle }));
    }
    if (tt.showShareMenu) { try { tt.showShareMenu({}); } catch (_) { /* ignore */ } }
  }

  // ---------- 画布 ----------
  createCanvas(w = 1, h = 1) {
    const c = this.tt.createCanvas();
    c.width = w; c.height = h;
    return c;
  }

  getViewport() {
    const i = this.info || {};
    return {
      width: i.windowWidth || i.screenWidth || 375,
      height: i.windowHeight || i.screenHeight || 667,
      dpr: Math.min(i.pixelRatio || 2, 3),
    };
  }

  /** 右上角胶囊按钮下沿 (避免挡住 HUD) */
  getSafeTop() {
    try {
      const r = this.tt.getMenuButtonBoundingClientRect && this.tt.getMenuButtonBoundingClientRect();
      if (r && r.bottom) return r.bottom + 4;
    } catch (_) { /* ignore */ }
    const sa = this.info && this.info.safeArea;
    return (sa && sa.top) || (this.info && this.info.statusBarHeight) || 0;
  }

  applyCanvasSize(cssW, cssH, pxW, pxH) {
    if (this.canvas.width !== pxW) this.canvas.width = pxW;
    if (this.canvas.height !== pxH) this.canvas.height = pxH;
  }

  onResize(cb) {
    if (this.tt.onWindowResize) this.tt.onWindowResize(() => { this.info = this.tt.getSystemInfoSync(); cb(); });
  }

  // ---------- 时间 / 帧 ----------
  now() {
    if (typeof performance !== 'undefined' && performance.now) return performance.now();
    if (!this._perf && this.tt.getPerformance) this._perf = this.tt.getPerformance();
    return this._perf ? this._perf.now() : Date.now();
  }

  requestFrame(cb) {
    if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(cb);
    return setTimeout(() => cb(this.now()), 16);
  }

  // ---------- 资源 ----------
  resolvePath(p) {
    for (const [from, to] of DOUYIN_PATHS) if (p.startsWith(from)) return to + p.slice(from.length);
    return p;
  }

  loadImage(src) {
    return new Promise((resolve) => {
      const img = this.tt.createImage();
      let done = false;
      const fin = (ok) => { if (!done) { done = true; resolve(ok ? img : null); } };
      img.onload = () => fin(true);
      img.onerror = () => fin(false);
      img.src = this.resolvePath(src);
    });
  }

  loadSubpackage(name, onProgress = () => {}) {
    const tt = this.tt;
    if (!tt.loadSubpackage) { this.mediaReady = true; onProgress(1); return Promise.resolve(true); }  // 旧版本客户端：整包，无需加载
    return new Promise((resolve) => {
      const task = tt.loadSubpackage({
        name,
        success: () => { this.mediaReady = true; onProgress(1); resolve(true); },
        fail: (err) => { console.warn('[DouyinPlatform] 分包加载失败', name, err); resolve(false); },
      });
      if (task && task.onProgressUpdate) {
        task.onProgressUpdate((r) => onProgress(Math.max(0, Math.min(1, (r.progress || 0) / 100))));
      }
    });
  }

  // ---------- 输入 ----------
  clientToCanvas(x, y) {
    const k = this.canvas.width / (this.getViewport().width || 1);
    return { x: x * k, y: y * k };
  }

  bindInput(h) {
    const tt = this.tt;
    const each = (e, fn) => {
      const list = (e && (e.changedTouches || e.touches)) || [];
      for (let i = 0; i < list.length; i++) {
        const t = list[i];
        const cx = t.clientX !== undefined ? t.clientX : (t.pageX !== undefined ? t.pageX : t.screenX);
        const cy = t.clientY !== undefined ? t.clientY : (t.pageY !== undefined ? t.pageY : t.screenY);
        fn({ id: t.identifier, type: 'touch', ...this.clientToCanvas(cx, cy) });
      }
    };
    tt.onTouchStart((e) => each(e, h.down));
    tt.onTouchMove((e) => each(e, h.move));
    tt.onTouchEnd((e) => each(e, h.up));
    if (tt.onTouchCancel) tt.onTouchCancel((e) => each(e, (p) => h.cancel(p)));
    this._hideCbs.push(() => h.blur());
  }

  // ---------- 音频 ----------
  createWebAudioContext() {
    if (!PlatformConfig.douyin.useWebAudio) return null;
    try { return this.tt.getAudioContext ? this.tt.getAudioContext() : null; } catch (_) { return null; }
  }

  createAudio(src, opts) {
    if (!this.tt.createInnerAudioContext) return null;
    return new InnerAudioClip(this.tt, src ? this.resolvePath(src) : src, opts);
  }

  // ---------- 存储 ----------
  storageGet(key) {
    const v = this.tt.getStorageSync(key);
    return v === undefined || v === null || v === '' ? null : String(v);
  }

  storageSet(key, value) { this.tt.setStorageSync(key, value); return true; }

  // ---------- 生命周期 ----------
  onShow(cb) { this._showCbs.push(cb); }
  onHide(cb) { this._hideCbs.push(cb); }

  // ---------- 上架信息 ----------
  get mediaSubpackage() { return PlatformConfig.douyin.mediaSubpackage; }
  get publishInfo() { return PlatformConfig.douyin; }

  // ---------- 激励视频 ----------
  get hasRewardedAd() { return !!(this.tt.createRewardedVideoAd && douyinAdUnitId()); }
  get freeRevive() { return !this.hasRewardedAd && PlatformConfig.douyin.freeReviveWithoutAds !== false; }

  showRewardedAd(placement) {
    const tt = this.tt;
    return new Promise((resolve) => {
      if (!this._ad) {
        this._ad = tt.createRewardedVideoAd({ adUnitId: douyinAdUnitId() });   // 全局单例
        if (this._ad.onError) this._ad.onError((err) => console.warn('[DouyinPlatform] 激励视频错误', err && err.errCode, err && err.errMsg));
      }
      const ad = this._ad;
      let settled = false;
      const onClose = (res) => {
        if (settled) return;
        settled = true;
        if (ad.offClose) ad.offClose(onClose);
        // 官方建议有 count 时用 count 判断是否看完；没有广告时平台可能自动拉起分享，分享成功也会回调 count == 1
        const ok = !!res && ((typeof res.count === 'number' && res.count > 0) || !!res.isEnded);
        resolve(ok);
      };
      ad.onClose(onClose);
      const fail = (err) => {
        if (settled) return;
        settled = true;
        if (ad.offClose) ad.offClose(onClose);
        console.warn('[DouyinPlatform] 激励视频展示失败', placement, err);
        this.toast('暂时没有可观看的视频，请稍后再试');
        resolve(false);
      };
      Promise.resolve(ad.show()).catch(() => Promise.resolve(ad.load()).then(() => ad.show())).catch(fail);
    });
  }

  // ---------- 录屏分享 ----------
  _recorder() {
    if (this._rec || !this.tt.getGameRecorderManager) return this._rec;
    const r = this.tt.getGameRecorderManager();
    r.onStart(() => { this._recState = 'recording'; this._recStart = this.now(); });
    r.onStop((res) => {
      this._recState = 'idle';
      const path = res && res.videoPath;
      const dur = (this.now() - (this._recStart || this.now())) / 1000;
      this.videoPath = path && dur >= PlatformConfig.douyin.minShareSeconds ? path : null;
      this.videoDuration = dur;
      const w = this._stopWaiters || [];
      this._stopWaiters = [];
      w.forEach((f) => f(this.videoPath));
    });
    if (r.onError) r.onError((e) => { console.warn('[DouyinPlatform] 录屏错误', e); this._recState = 'idle'; });
    this._rec = r;
    return r;
  }

  get canRecord() { return !!this.tt.getGameRecorderManager; }

  startRecording() {
    const r = this._recorder();
    if (!r) return;
    this.videoPath = null;
    const begin = () => {
      try { r.start({ duration: PlatformConfig.douyin.recordDuration }); this._recState = 'starting'; } catch (e) { console.warn(e); }
    };
    if (this._recState !== 'idle') {
      // 还在录：先停再开 (新的一局重新录)
      this._stopWaiters = (this._stopWaiters || []).concat(() => begin());
      try { r.stop(); } catch (_) { begin(); }
    } else begin();
  }

  stopRecording() {
    const r = this._recorder();
    if (!r || this._recState === 'idle') return Promise.resolve(this.videoPath || null);
    return new Promise((resolve) => {
      this._stopWaiters = (this._stopWaiters || []).concat(resolve);
      try { r.stop(); } catch (_) { resolve(null); }
      setTimeout(() => resolve(this.videoPath || null), 3000);   // 保险：回调丢失时不卡住
    });
  }

  pauseRecording() { if (this._rec && this._recState === 'recording' && this._rec.pause) this._rec.pause(); }
  resumeRecording() { if (this._rec && this._recState === 'recording' && this._rec.resume) this._rec.resume(); }

  shareVideo(path) {
    return new Promise((resolve) => {
      if (!path) { resolve(false); return; }   // videoPath 为空时 channel=video 会拉起摄像头 (审核不允许)，所以必须有录屏文件
      this.tt.shareAppMessage({
        channel: 'video',
        title: PlatformConfig.douyin.shareTitle,
        extra: { videoPath: path, withVideoId: true, videoTopics: PlatformConfig.douyin.videoTopics },
        success: () => resolve(true),
        fail: (e) => { console.warn('[DouyinPlatform] 分享失败', e); resolve(false); },
      });
    });
  }

  // ---------- 侧边栏复访 ----------
  checkSidebar() {
    const tt = this.tt;
    if (!tt.checkScene) return Promise.resolve(false);
    return new Promise((resolve) => {
      tt.checkScene({ scene: 'sidebar', success: (r) => resolve(!!(r && r.isExist)), fail: () => resolve(false) });
    });
  }

  get launchedFromSidebar() {
    const s = this.lastShow || {};
    return s.launch_from === 'homepage' && s.location === 'sidebar_card';
  }

  navigateToSidebar() {
    const tt = this.tt;
    if (!tt.navigateToScene) return Promise.resolve(false);
    return new Promise((resolve) => {
      tt.navigateToScene({ scene: 'sidebar', success: () => resolve(true), fail: (e) => { console.warn('[DouyinPlatform] 跳转侧边栏失败', e); resolve(false); } });
    });
  }

  toast(text) {
    if (!this.tt.showToast) return false;
    this.tt.showToast({ title: text, icon: 'none', duration: 2000 });
    return true;
  }

  exposeDebug(game) { globalThis.__ANIME_MERGE__ = game; }
}
