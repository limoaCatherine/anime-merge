// 当前运行平台 (单例)。入口 (main.js / main.douyin.js) 创建具体平台并 setPlatform()，其他模块用 getPlatform()。
let current = null;

export function setPlatform(p) { current = p; return p; }

export function getPlatform() {
  if (!current) throw new Error('[platform] 平台尚未初始化：请在入口调用 setPlatform()');
  return current;
}
