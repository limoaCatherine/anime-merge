// 广告服务：激励视频 (看视频复活 / 看视频 +1 整理)。与同系列游戏统一的接口：
//
//     game.ads.showRewardedAd(placement) -> Promise<boolean>     (true = 完整看完，发放奖励)
//
// - 抖音小游戏且已在 src/config/PlatformConfig.js 填写 rewardedAdUnitId → 平台真实激励视频 (tt.createRewardedVideoAd)
// - 浏览器版 (未接广告)          → 画面内 5 秒「广告占位」倒计时 (ui/AdOverlay.js)，不含任何广告 SDK
// - 桌面版 / 抖音未填广告位 ID   → available = false，游戏里不显示看广告入口
// 广告展示期间 busy = true：Game 暂停场景更新，台词暂缓。
import { PlatformConfig } from '../config/PlatformConfig.js';

export class AdService {
  constructor(events, platform) {
    this.events = events;
    this.platform = platform;
    this.fake = null;                 // 占位广告 { placement, time, duration, resolve, lastTick }
    this.busy = false;
    this.fakeDuration = PlatformConfig.ads.fakeDuration;
    this.stats = { shown: 0, rewarded: 0, byPlacement: {} };
  }

  /** 当前平台能否看激励视频 (真实广告或占位广告) */
  get available() {
    return !!(this.platform.hasRewardedAd || this.platform.placeholderAds);
  }

  get real() { return !!this.platform.hasRewardedAd; }
  get isShowingFake() { return !!this.fake; }

  /**
   * @param {string} placement 'revive' | 'tidy' (统计用)
   * @returns {Promise<boolean>}
   */
  showRewardedAd(placement = 'revive') {
    if (this.busy) return Promise.resolve(false);
    if (!this.available) return Promise.resolve(false);
    this.busy = true;
    this.stats.shown++;
    this.events.emit('ad:open', { placement, real: this.real });
    const done = (ok) => {
      ok = !!ok;
      this.busy = false;
      if (ok) {
        this.stats.rewarded++;
        this.stats.byPlacement[placement] = (this.stats.byPlacement[placement] || 0) + 1;
      }
      this.events.emit('ad:closed', { placement, rewarded: ok });
      return ok;
    };
    if (this.real) return this.platform.showRewardedAd(placement).then(done, () => done(false));
    return new Promise((resolve) => {
      this.fake = { placement, time: 0, duration: this.fakeDuration, resolve, lastTick: Math.ceil(this.fakeDuration) };
    }).then(done);
  }

  // —— 占位广告：由 Game 每帧驱动、由 ui/AdOverlay.js 绘制 ——
  update(dt) {
    const f = this.fake;
    if (!f) return;
    f.time += dt;
    const left = Math.ceil(Math.max(0, f.duration - f.time));
    if (left < f.lastTick) { f.lastTick = left; this.events.emit('ad:tick', { left }); }
  }

  get fakeRemaining() { return this.fake ? Math.max(0, this.fake.duration - this.fake.time) : 0; }
  get fakeFinished() { return !!this.fake && this.fake.time >= this.fake.duration; }

  /** 占位广告上点「领取奖励」(倒计时结束后) 或「跳过」(提前关闭 = 无奖励) */
  closeFake(rewarded) {
    const f = this.fake;
    if (!f) return;
    this.fake = null;
    f.resolve(!!rewarded && f.time >= f.duration);
  }
}
