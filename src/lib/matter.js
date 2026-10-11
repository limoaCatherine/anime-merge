// Matter.js：浏览器/桌面版以经典脚本 (vendor/matter.min.js) 方式加载，挂在全局 Matter 上；
// 抖音版由 tools/build-douyin.mjs 把本文件替换为 lib/matter.bundled.js (直接打包 npm 的 matter-js，不依赖 window)。
// 只使用 Engine / World / Bodies / Body / Events 等纯计算模块，不使用 Render / Runner / Mouse (这些才会访问 DOM)。
const g = typeof globalThis !== 'undefined' ? globalThis : {};
const Matter = g.Matter;
if (!Matter) {
  throw new Error('Matter.js 未加载：请确认 vendor/matter.min.js 存在并在游戏脚本之前引入');
}
export default Matter;
