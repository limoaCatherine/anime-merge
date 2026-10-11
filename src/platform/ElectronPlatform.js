// 桌面版 (Electron 渲染进程)：与浏览器相同，只是允许自动播放；不显示占位广告 (买断制桌面版)。
import { WebPlatform } from './WebPlatform.js';
import { PlatformConfig } from '../config/PlatformConfig.js';

export class ElectronPlatform extends WebPlatform {
  constructor(canvas) {
    super(canvas);
    this.name = 'electron';
    this.autoplay = true;
  }

  get placeholderAds() { return PlatformConfig.desktop.placeholderAds && !this.noAds; }

  static detect() {
    return typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent || '');
  }
}
