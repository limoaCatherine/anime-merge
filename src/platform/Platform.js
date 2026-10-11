// 平台抽象层 (Platform interface)。
// 游戏逻辑 / 系统 / 场景 **不直接访问** window / document / tt，所有与运行环境相关的能力都通过这里：
//   画布与尺寸、帧循环与时间、图片/分包加载、输入、音频、存储、前后台生命周期、激励视频、录屏分享、侧边栏复访。
// 具体实现：WebPlatform (浏览器 / file://)、ElectronPlatform (桌面版)、DouyinPlatform (抖音小游戏 tt.*)。
// 这里的基类给出接口说明与安全的默认实现 (都是"不支持")。
export class Platform {
  constructor() {
    this.name = 'base';
    this.canvas = null;
    /** 主画布是否铺满整个屏幕 (抖音)；为 false 时画布本身按 9:16 缩放 (浏览器) */
    this.fullscreenCanvas = false;
    /** 是否允许无用户交互自动播放音频 */
    this.autoplay = false;
    /** 是否有键盘 */
    this.hasKeyboard = false;
    /** 音效使用预渲染文件而不是 WebAudio 实时合成 */
    this.preferSampledSfx = false;
    this.seamlessBgm = false;      // true：BGM 用双播放器交叉淡化循环 (平台播放 mp3 循环有空隙时)
    /** 语音/BGM 资源是否已可用 (抖音分包加载前为 false) */
    this.mediaReady = true;
  }

  /** 没有真实广告时是否显示画面内的占位广告 (浏览器版) */
  get placeholderAds() { return false; }

  /** 页面当前是否在后台 */
  get hidden() { return false; }

  // ---------- 画布 ----------
  /** 主 (上屏) 画布 */
  getCanvas() { return this.canvas; }
  /** 离屏画布 (纹理缓存 / 截图) */
  createCanvas(w = 1, h = 1) { throw new Error('createCanvas not supported'); }
  /** 可用窗口大小 (逻辑像素) 与设备像素比 */
  getViewport() { return { width: 540, height: 960, dpr: 1 }; }
  /** 顶部需要避让的高度 (逻辑像素，如抖音右上角胶囊按钮)，默认 0 */
  getSafeTop() { return 0; }
  /** 设置主画布的像素尺寸 (以及浏览器里的 CSS 显示尺寸) */
  applyCanvasSize(cssW, cssH, pxW, pxH) {
    this.canvas.width = pxW;
    this.canvas.height = pxH;
  }
  onResize(_cb) {}

  // ---------- 时间 / 帧 ----------
  now() { return Date.now(); }
  requestFrame(cb) { return setTimeout(() => cb(this.now()), 16); }

  // ---------- 资源 ----------
  /** 把游戏内资源路径 (assets/...) 映射成当前平台的实际路径 */
  resolvePath(p) { return p; }
  /** 加载图片，失败时 resolve(null) */
  loadImage(_src) { return Promise.resolve(null); }
  /** 加载分包 (抖音)；其他平台立即完成。onProgress(0..1) */
  loadSubpackage(_name, onProgress = () => {}) { onProgress(1); return Promise.resolve(true); }

  // ---------- 输入 ----------
  /**
   * 绑定输入。坐标统一为「主画布像素坐标」，由 Game 换算成逻辑坐标。
   * handlers: { down(p), move(p), up(p), cancel({id}), key(e), blur() }  p = { id, x, y, type: 'touch'|'mouse'|'pen' }
   */
  bindInput(_handlers) {}
  /** 把窗口 client 坐标换算成主画布像素坐标 */
  clientToCanvas(x, y) { return { x, y }; }

  // ---------- 音频 ----------
  /** WebAudio 上下文 (用于实时合成音效)；不支持/不保证时返回 null，改用预渲染音效文件 */
  createWebAudioContext() { return null; }
  /** 音频片段 (语音 / BGM / 预渲染音效)。返回 AudioClip 接口对象，见 WebPlatform.HtmlAudioClip */
  createAudio(_src, _opts) { return null; }
  /** 系统语音合成兜底 (仅浏览器)，返回 { cancel() } 或 null */
  speak(_text, _opts) { return null; }
  get speaking() { return false; }
  cancelSpeech() {}

  // ---------- 存储 ----------
  storageGet(_key) { return null; }
  storageSet(_key, _value) { return false; }

  // ---------- 生命周期 ----------
  onShow(_cb) {}
  onHide(_cb) {}

  // ---------- 激励视频广告 (由 AdService 调用) ----------
  /** 是否接入了真实激励视频 (抖音且已配置 adUnitId) */
  get hasRewardedAd() { return false; }
  /** 没有激励视频时，是否改为每局 1 次免费「再试一次」(抖音：流量主开通前) */
  get freeRevive() { return false; }
  /** 展示真实激励视频，Promise<boolean> = 是否完整看完 */
  showRewardedAd(_placement) { return Promise.resolve(false); }

  // ---------- 录屏分享 ----------
  get canRecord() { return false; }
  startRecording() {}
  /** 停止录屏，Promise<string|null> 视频路径 */
  stopRecording() { return Promise.resolve(null); }
  pauseRecording() {}
  resumeRecording() {}
  /** 分享录屏视频，Promise<boolean> */
  shareVideo(_path) { return Promise.resolve(false); }

  // ---------- 普通分享 (微信：转发给好友 / 朋友圈，不需要录屏) ----------
  /** 是否支持游戏内「分享给好友」按钮 (不录屏的平台) */
  get canShare() { return false; }
  /** 主动拉起转发，info = { score, character }；Promise<boolean> */
  shareGame(_info) { return Promise.resolve(false); }

  // ---------- 上架信息 (启动页展示) ----------
  /** 小游戏分包名 (语音 + BGM)，非小游戏平台为 null */
  get mediaSubpackage() { return null; }
  /** 启动页展示的 { softwareCopyrightNo, ageRating }，非小游戏平台为 null */
  get publishInfo() { return null; }

  // ---------- 侧边栏复访 (抖音) ----------
  /** Promise<boolean> 当前宿主是否支持跳转侧边栏 */
  checkSidebar() { return Promise.resolve(false); }
  /** 最近一次 onShow 是否来自抖音首页侧边栏 */
  get launchedFromSidebar() { return false; }
  navigateToSidebar() { return Promise.resolve(false); }

  /** 轻提示 (抖音 tt.showToast)；返回 false 表示需要游戏自己绘制 */
  toast(_text) { return false; }

  /** 调试/测试：把游戏实例挂到全局 */
  exposeDebug(_game) {}
}
