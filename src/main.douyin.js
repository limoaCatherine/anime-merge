// 抖音小游戏入口 (由 tools/build-douyin.mjs 打包为 douyin/game.js)。
// 注意：DouyinPlatform 构造时会立即同步注册 tt.onShow (侧边栏复访要求在 game.js 运行时就监听)。
import { Game } from './core/Game.js';
import { setPlatform } from './platform/index.js';
import { DouyinPlatform } from './platform/DouyinPlatform.js';

const tt = globalThis.tt;
const platform = setPlatform(new DouyinPlatform(tt));
const game = new Game(platform);
game.start();
platform.exposeDebug(game);
