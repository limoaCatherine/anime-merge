// 入口 (浏览器 / Electron 桌面版)：创建平台层与游戏实例并启动。抖音小游戏入口见 main.douyin.js。
import { Game } from './core/Game.js';
import { setPlatform } from './platform/index.js';
import { WebPlatform } from './platform/WebPlatform.js';
import { ElectronPlatform } from './platform/ElectronPlatform.js';

function boot() {
  const canvas = document.getElementById('game');
  const platform = setPlatform(ElectronPlatform.detect() ? new ElectronPlatform(canvas) : new WebPlatform(canvas));
  const game = new Game(platform);
  game.start();
  platform.exposeDebug(game);   // 暴露给调试/自动化测试 (window.__ANIME_MERGE__)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
