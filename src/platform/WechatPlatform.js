// 微信小游戏平台 (wx.*)。官方文档：https://developers.weixin.qq.com/minigame/dev/api/
// 与抖音小游戏的 API 形态几乎一致，所以直接复用 DouyinPlatform 的画布 / 触摸 / 音频 / 存储 / 分包实现，只替换平台差异部分：
// - 画布：第一次 wx.createCanvas() 是上屏画布；窗口信息用 wx.getWindowInfo (旧基础库回退 wx.getSystemInfoSync)
// - 音频：wx.createInnerAudioContext —— iOS 不支持 ogg (官方「支持格式」表)，只用 mp3 (语音 / BGM) 和 wav (音效)
// - 存储：wx.getStorageSync / wx.setStorageSync (单个 key ≤ 1MB，总计 ≤ 10MB)
// - 生命周期：wx.onShow / wx.onHide
// - 激励广告：wx.createRewardedVideoAd({ adUnitId })，onClose(res) 里 res.isEnded = 是否看完 (基础库 < 2.1.0 时 res 为 undefined，视为看完)
// - 分享：没有录屏 / 侧边栏。改为 wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] })
//         + wx.onShareAppMessage (右上角「转发」) + wx.onShareTimeline (右上角「分享到朋友圈」) + 游戏内按钮 wx.shareAppMessage
// - 分包：wx.loadSubpackage({ name }) (game.json 的 "subpackages" 字段)
import { DouyinPlatform } from './DouyinPlatform.js';
import { PlatformConfig, wechatAdUnitId } from '../config/PlatformConfig.js';
import { CHARACTERS } from '../config/LevelConfig.js';

export class WechatPlatform extends DouyinPlatform {
  constructor(wx) {
    super(wx);                        // DouyinPlatform：同步注册 onShow/onHide、创建上屏画布
    this.name = 'wechat';
    this.wx = wx;
    this.info = WechatPlatform.windowInfo(wx);
    this._shareCtx = { score: 0, maxLevel: -1 };
    const cfg = PlatformConfig.wechat;
    // 右上角菜单：转发给好友 + 分享到朋友圈
    const menus = cfg.shareTimeline ? ['shareAppMessage', 'shareTimeline'] : ['shareAppMessage'];
    if (wx.showShareMenu) { try { wx.showShareMenu({ withShareTicket: false, menus }); } catch (_) { /* ignore */ } }
    if (wx.onShareAppMessage) wx.onShareAppMessage(() => this.shareContent());
    if (cfg.shareTimeline && wx.onShareTimeline) {
      wx.onShareTimeline(() => ({ title: this.shareContent().title, imageUrl: cfg.shareImage, query: 'from=timeline' }));
    }
  }

  static windowInfo(wx) {
    try {
      if (wx.getWindowInfo) {
        const w = wx.getWindowInfo();
        if (w && w.windowWidth) return w;
      }
    } catch (_) { /* ignore */ }
    try { return wx.getSystemInfoSync ? wx.getSystemInfoSync() : {}; } catch (_) { return {}; }
  }

  onResize(cb) {
    if (this.wx.onWindowResize) this.wx.onWindowResize(() => { this.info = WechatPlatform.windowInfo(this.wx); cb(); });
  }

  // ---------- 上架信息 ----------
  get mediaSubpackage() { return PlatformConfig.wechat.mediaSubpackage; }
  get publishInfo() { return PlatformConfig.wechat; }

  // ---------- 音频：不使用 WebAudio (音效走预渲染 wav + InnerAudioContext，与抖音一致) ----------
  createWebAudioContext() { return null; }

  // ---------- 激励广告 ----------
  get hasRewardedAd() { return !!(this.wx.createRewardedVideoAd && wechatAdUnitId()); }
  get freeRevive() { return !this.hasRewardedAd && PlatformConfig.wechat.freeReviveWithoutAds !== false; }

  showRewardedAd(placement) {
    const wx = this.wx;
    return new Promise((resolve) => {
      if (!this._ad) {
        this._ad = wx.createRewardedVideoAd({ adUnitId: wechatAdUnitId() });   // 同一 adUnitId 返回全局单例，创建后自动拉取广告
        if (this._ad.onError) this._ad.onError((err) => console.warn('[WechatPlatform] 激励广告错误', err && err.errCode, err && err.errMsg));
      }
      const ad = this._ad;
      let settled = false;
      const onClose = (res) => {
        if (settled) return;
        settled = true;
        if (ad.offClose) ad.offClose(onClose);
        resolve(!res || !!res.isEnded);     // 官方：isEnded=true 才发放奖励
      };
      ad.onClose(onClose);
      const fail = (err) => {
        if (settled) return;
        settled = true;
        if (ad.offClose) ad.offClose(onClose);
        console.warn('[WechatPlatform] 激励广告展示失败', placement, err);
        this.toast('暂时没有可观看的视频，请稍后再试');
        resolve(false);
      };
      Promise.resolve(ad.show()).catch(() => Promise.resolve(ad.load()).then(() => ad.show())).catch(fail);
    });
  }

  // ---------- 没有录屏 / 侧边栏 ----------
  get canRecord() { return false; }
  startRecording() {}
  stopRecording() { return Promise.resolve(null); }
  pauseRecording() {}
  resumeRecording() {}
  shareVideo() { return Promise.resolve(false); }
  checkSidebar() { return Promise.resolve(false); }
  get launchedFromSidebar() { return false; }
  navigateToSidebar() { return Promise.resolve(false); }

  // ---------- 转发分享 ----------
  get canShare() { return !!this.wx.shareAppMessage; }

  /** 当前转发内容 (右上角菜单和游戏内按钮共用；带上最近一局的成绩) */
  shareContent() {
    const cfg = PlatformConfig.wechat;
    const { score, maxLevel } = this._shareCtx;
    const def = maxLevel >= 0 ? CHARACTERS[maxLevel] : null;
    const title = def && score > 0 ? `我合成了「${def.name}」，拿到 ${score} 分！你也来试试《美少女合成》` : cfg.shareTitle;
    return { title, imageUrl: cfg.shareImage, query: 'from=share' };
  }

  shareGame(info = {}) {
    if (typeof info.score === 'number') this._shareCtx.score = info.score;
    if (typeof info.maxLevel === 'number') this._shareCtx.maxLevel = info.maxLevel;
    if (!this.wx.shareAppMessage) return Promise.resolve(false);
    try {
      // 微信不再返回分享成功/失败 (官方 2018 年起取消回调)，只要成功拉起就算 true
      this.wx.shareAppMessage(this.shareContent());
      return Promise.resolve(true);
    } catch (e) {
      console.warn('[WechatPlatform] 转发失败', e);
      return Promise.resolve(false);
    }
  }

  exposeDebug(game) { globalThis.__ANIME_MERGE__ = game; }
}
