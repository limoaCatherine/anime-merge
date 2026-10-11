// 微信小游戏入口 (由 tools/build-wechat.mjs 打包为 wechat/game.js)。
// WechatPlatform 构造时同步注册 wx.onShow / onHide / onShareAppMessage / onShareTimeline。
import { Game } from './core/Game.js';
import { setPlatform } from './platform/index.js';
import { WechatPlatform } from './platform/WechatPlatform.js';

const wx = globalThis.wx;
const platform = setPlatform(new WechatPlatform(wx));
const game = new Game(platform);
game.start();
platform.exposeDebug(game);
