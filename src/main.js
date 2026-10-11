// 入口：创建游戏实例并启动。
import { Game } from './core/Game.js';

function boot() {
  const canvas = document.getElementById('game');
  const game = new Game(canvas);
  game.start();
  // 暴露给调试/自动化测试
  window.__ANIME_MERGE__ = game;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
