// 微信小游戏版自动化验证 (没有真实微信开发者工具时，用 Node + 模拟的 wx 环境 + @napi-rs/canvas 无头画布运行打包好的 wechat/game.js)
//   node tools/test-wechat.mjs            运行验证 (需先 npm run build:wechat)
//   node tools/test-wechat.mjs --shots    额外生成 1080×1920 竖屏截图到 docs/wechat/screenshots/
// 验证：无 window/document 也能运行；wx.loadSubpackage 分包加载与进度；画布/DPR/胶囊避让；触摸；投放与合成；预渲染音效；
//       语音/BGM 用 InnerAudioContext (只有 mp3 / wav)；BGM 双播放器无缝循环；wx 存储；onHide 暂停 / onShow 恢复；
//       激励广告 (onClose isEnded) 复活与 +1 整理；未填广告位时隐藏看广告入口 + 免费「再试一次」；
//       转发：showShareMenu(好友 + 朋友圈) / onShareAppMessage / onShareTimeline / 游戏内「分享给好友」按钮；没有录屏和侧边栏；包体大小。
import { promises as fs, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createCanvas, Image, GlobalFonts } = require('@napi-rs/canvas');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = path.join(root, 'dist-wechat');
const SHOTS = process.argv.includes('--shots');
const shotDir = path.join(root, SHOTS ? 'docs/wechat/screenshots' : 'build/wechat-shots');
await fs.mkdir(shotDir, { recursive: true });
for (const f of ['/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc']) {
  if (existsSync(f)) GlobalFonts.registerFromPath(f);
}

let passed = 0; let failed = 0;
const check = (ok, msg) => { if (ok) { passed++; console.log(`  ✔ ${msg}`); } else { failed++; console.log(`  ✘ ${msg}`); } };
const consoleErrors = [];
const origError = console.error;
console.error = (...a) => { consoleErrors.push(a.join(' ')); origError(...a); };

// ---------------- 模拟 wx ----------------
const WIN = SHOTS ? { w: 360, h: 640, dpr: 3 } : { w: 375, h: 812, dpr: 3 };   // iPhone X 比例 (非 9:16，测试留边与胶囊避让)
const log = { audioCreated: 0, plays: [], storage: new Map(), shares: [], toasts: [], ads: [], sub: [], shareMenu: null, onShareApp: null, onShareTimeline: null, getSystemInfoSync: 0 };
const handlers = { touchstart: [], touchmove: [], touchend: [], touchcancel: [], show: [], hide: [] };
const rafQueue = [];
let canvasCount = 0;
let adBehavior = 'complete';     // complete | skip | error
const imgSrcSetter = Object.getOwnPropertyDescriptor(Image.prototype, 'src').set;

const resolvePkg = (p) => path.join(pkgDir, p.replace(/^\.?\//, ''));
const audios = [];
// 模拟播放进度：pump() 推进模拟时间时，正在播放的音频 currentTime 前进，非循环的播完触发 onEnded
function advanceAudio(sec) {
  for (const a of audios) {
    if (a.paused || !a._ok) continue;
    a.currentTime += sec;
    if (a.currentTime >= a.duration) {
      if (a.loop) a.currentTime %= a.duration;
      else { a.currentTime = 0; a.paused = true; (a._cb.ended || []).forEach((f) => f()); }
    }
  }
}
function mockAudio() {
  log.audioCreated++;
  const a = { autoplay: false, loop: false, volume: 1, paused: true, currentTime: 0, duration: 0.5, _cb: {} };
  audios.push(a);
  const on = (n) => (cb) => { (a._cb[n] = a._cb[n] || []).push(cb); };
  const fire = (n, arg) => (a._cb[n] || []).forEach((f) => f(arg));
  Object.assign(a, {
    onCanplay: on('canplay'), onEnded: on('ended'), onError: on('error'), onPlay: on('play'), onStop: on('stop'),
    offEnded() {},
    play() { if (!a._ok) return; a.paused = false; log.plays.push(a._src); fire('play'); },
    pause() { a.paused = true; }, stop() { a.paused = true; a.currentTime = 0; fire('stop'); },
    seek(t) { a.currentTime = t; }, destroy() { a.paused = true; },
  });
  Object.defineProperty(a, 'src', {
    get() { return a._src; },
    set(v) { a._src = v; if (/bgm_main_loop\.mp3$/.test(v)) a.duration = 72.62; setTimeout(() => { if (existsSync(resolvePkg(v))) { a._ok = true; fire('canplay'); } else fire('error', { errCode: 10004, errMsg: 'file not found ' + v }); }, 1); },
  });
  return a;
}

let adSingleton = null;
const wx = {
  createCanvas() {
    canvasCount++;
    // 第一次创建的是上屏画布，默认与屏幕等大
    return canvasCount === 1 ? createCanvas(WIN.w, WIN.h) : createCanvas(1, 1);
  },
  createImage() {
    const img = new Image();
    Object.defineProperty(img, 'src', {
      set(v) {
        fs.readFile(resolvePkg(v)).then((buf) => { img.onload && setTimeout(() => {}, 0); imgSrcSetter.call(img, buf); }, () => { setTimeout(() => img.onerror && img.onerror({}), 1); });
      },
      get() { return ''; },
    });
    return img;
  },
  getWindowInfo: () => ({ windowWidth: WIN.w, windowHeight: WIN.h, screenWidth: WIN.w, screenHeight: WIN.h, pixelRatio: WIN.dpr, statusBarHeight: 44, safeArea: { top: 44, bottom: WIN.h, left: 0, right: WIN.w, width: WIN.w, height: WIN.h - 44 }, screenTop: 0 }),
  getSystemInfoSync: () => (log.getSystemInfoSync++, { windowWidth: WIN.w, windowHeight: WIN.h, screenWidth: WIN.w, screenHeight: WIN.h, pixelRatio: WIN.dpr, platform: 'ios', statusBarHeight: 44, safeArea: { top: 44 } }),
  getMenuButtonBoundingClientRect: () => ({ top: 50, bottom: 82, left: WIN.w - 97, right: WIN.w - 10, width: 87, height: 32 }),
  getLaunchOptionsSync: () => ({ scene: 1001, query: {} }),
  onShow: (f) => handlers.show.push(f), onHide: (f) => handlers.hide.push(f),
  onTouchStart: (f) => handlers.touchstart.push(f), onTouchMove: (f) => handlers.touchmove.push(f),
  onTouchEnd: (f) => handlers.touchend.push(f), onTouchCancel: (f) => handlers.touchcancel.push(f),
  createInnerAudioContext: mockAudio,
  getStorageSync: (k) => (log.storage.has(k) ? log.storage.get(k) : ''),
  setStorageSync: (k, v) => { if (typeof v === 'string' && v.length > 1024 * 1024) throw new Error('exceed 1MB'); log.storage.set(k, v); },
  loadSubpackage({ name, success, fail }) {
    log.sub.push(name);
    const progressCbs = [];
    let p = 0;
    const tick = () => {
      p += 25;
      progressCbs.forEach((f) => f({ progress: p, totalBytesWritten: p, totalBytesExpectedToWrite: 100 }));
      if (p < 100) setTimeout(tick, 5);
      else if (existsSync(path.join(pkgDir, name, 'game.js'))) success && success({});
      else fail && fail({ errMsg: 'no subpackage' });
    };
    setTimeout(tick, 5);
    return { onProgressUpdate: (f) => progressCbs.push(f) };
  },
  createRewardedVideoAd({ adUnitId }) {
    if (adSingleton) return adSingleton;
    const cbs = { close: [], error: [] };
    adSingleton = {
      adUnitId,
      show() {
        log.ads.push(adBehavior);
        if (adBehavior === 'error') return Promise.reject({ errCode: 1004, errMsg: 'no ad' });
        setTimeout(() => cbs.close.slice().forEach((f) => f({ isEnded: adBehavior === 'complete' })), 20);
        return Promise.resolve();
      },
      load() { return adBehavior === 'error' ? Promise.reject({ errCode: 1004 }) : Promise.resolve(); },
      onClose: (f) => cbs.close.push(f), offClose: (f) => { const i = cbs.close.indexOf(f); if (i >= 0) cbs.close.splice(i, 1); },
      onError: (f) => cbs.error.push(f), onLoad() {}, destroy() {},
    };
    return adSingleton;
  },
  shareAppMessage(o) { log.shares.push(o); },   // 微信：无 success 回调
  onShareAppMessage(f) { log.onShareApp = f; },
  onShareTimeline(f) { log.onShareTimeline = f; },
  showShareMenu(o) { log.shareMenu = o; },
  showToast(o) { log.toasts.push(o.title); },
};

// ---------------- 运行 game.js ----------------
check(typeof globalThis.window === 'undefined' && typeof globalThis.document === 'undefined', '运行环境里没有 window / document (模拟微信)');
globalThis.wx = wx;
globalThis.GameGlobal = globalThis;
globalThis.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
globalThis.__AM_TEST_AD_UNIT__ = 'test-ad-unit-0001';      // 模拟已在 PlatformConfig 填写激励视频广告位
let now = 0;
// 让平台层的 performance.now() 与模拟帧时间一致 (录屏时长判断依赖它)
Object.defineProperty(globalThis, 'performance', { value: { now: () => now }, configurable: true, writable: true });
const flush = () => new Promise((r) => setTimeout(r, 0));
async function pump(seconds, step = 1 / 60) {
  const n = Math.round(seconds / step);
  for (let i = 0; i < n; i++) {
    now += step * 1000;
    advanceAudio(step);
    const q = rafQueue.splice(0);
    for (const cb of q) cb(now);
    if (i % 6 === 0) await flush();
  }
  await flush();
}
const code = readFileSync(path.join(pkgDir, 'game.js'), 'utf8');
let bootError = null;
try { vm.runInThisContext(code, { filename: 'game.js' }); } catch (e) { bootError = e; }
check(!bootError, `game.js 在无 DOM 环境中启动成功${bootError ? ': ' + bootError.stack : ''}`);
if (bootError) process.exit(1);
const g = globalThis.__ANIME_MERGE__;
check(g && g.platform.name === 'wechat', '使用 WechatPlatform');
check(handlers.show.length >= 1 && handlers.hide.length >= 1 && handlers.touchstart.length === 1, 'wx.onShow / wx.onHide / wx.onTouch* 已注册');
check(log.shareMenu && log.shareMenu.menus.includes('shareAppMessage') && log.shareMenu.menus.includes('shareTimeline'), `wx.showShareMenu 打开「转发」+「分享到朋友圈」(${log.shareMenu && log.shareMenu.menus.join(', ')})`);
check(typeof log.onShareApp === 'function' && typeof log.onShareTimeline === 'function', '已注册 wx.onShareAppMessage 与 wx.onShareTimeline');
{
  const a = log.onShareApp(); const t = log.onShareTimeline();
  check(a.title && a.imageUrl === 'images/share.png' && existsSync(resolvePkg(a.imageUrl)) && t.title && t.imageUrl === 'images/share.png', `右上角转发内容：「${a.title}」+ 包内卡片图 ${a.imageUrl}`);
}
check(g.platform.canRecord === false && g.platform.canShare === true, '微信版没有录屏 (canRecord=false)，改为普通转发 (canShare=true)');

const cv = g.canvas;
check(cv.width === WIN.w * WIN.dpr && cv.height === WIN.h * WIN.dpr, `上屏画布按 pixelRatio 设置为 ${cv.width}×${cv.height}`);
const v = g.view;
check(Math.abs(v.scale - Math.min(cv.width / 540, cv.height / 960)) < 1e-6, `游戏画面等比缩放 scale=${v.scale.toFixed(3)} 偏移 (${v.ox}, ${v.oy})`);
if (!SHOTS) check(v.oy >= 82 * WIN.dpr - 1, `游戏画面避开右上角胶囊按钮 (oy=${v.oy} ≥ ${82 * WIN.dpr})`);

// 启动 → 分包 → 菜单
await pump(0.2);
check(g.scenes.currentName === 'boot' && log.sub[0] === 'media', `启动时调用 wx.loadSubpackage('media') (状态: ${g.scenes.current.status})`);
let sawProgress = false;
for (let i = 0; i < 300 && g.scenes.currentName !== 'menu'; i++) { await pump(0.05); if (g.scenes.current && g.scenes.current.progress > 0 && g.scenes.current.progress < 1) sawProgress = true; }
check(sawProgress, '加载画面显示分包下载进度');
check(g.scenes.currentName === 'menu', `分包与资源加载完成后进入菜单 (${g.scenes.currentName})`);
check(g.platform.mediaReady === true, '分包加载成功 (mediaReady)');
check(g.assets.images.size === 11 && [...g.assets.images.values()].every((im) => im && im.width === 256), '11 张角色立绘通过 wx.createImage 加载 (压缩 PNG)');
check(g.voice.loadedCount === 11, `11 句语音通过 InnerAudioContext 加载 (media/voice/*.mp3): ${g.voice.loadedCount}`);
check(g.bgm.el && /^media\/bgm\/bgm_main_loop\.mp3$/.test(g.bgm.el.src) && g.bgm.seamless, `BGM 使用分包里的 mp3 (iOS 不支持 ogg)，双播放器交叉淡化循环: ${g.bgm.el && g.bgm.el.src}`);
check(g.audio.samples && Object.keys(g.audio.samples).length === 27, `音效为预渲染 wav (不依赖 WebAudio)：${g.audio.samples ? Object.keys(g.audio.samples).length : 0} 个`);
check(log.audioCreated < 50, `InnerAudioContext 实例数 ${log.audioCreated} (< 50)`);
await pump(1.5);
await fs.writeFile(path.join(shotDir, SHOTS ? '1-菜单.png' : 'menu.png'), cv.toBuffer('image/png'));

// 触摸工具：逻辑坐标 → 屏幕坐标 (只提供 screenX/screenY，按文档最保守的 Touch 字段)
let touchId = 1;
const scr = (x, y) => ({ screenX: (v.ox + x * v.scale) / WIN.dpr, screenY: (v.oy + y * v.scale) / WIN.dpr });
async function touch(type, x, y, id) {
  const t = { identifier: id, ...scr(x, y) };
  handlers[type].forEach((f) => f({ touches: type === 'touchend' ? [] : [t], changedTouches: [t], timeStamp: now }));
}
async function tap(x, y) { const id = touchId++; await touch('touchstart', x, y, id); await pump(0.05); await touch('touchend', x, y, id); await pump(0.05); }

check(!g.scenes.current.sidebarBtn || !g.scenes.current.sidebarBtn.visible, '菜单没有「侧边栏奖励」入口 (抖音专属)');
g.save.set('bestTest', 1);
const saved0 = JSON.parse(log.storage.get('animeMerge.save.v1') || '{}');
check(saved0.bestTest === 1, '存档通过 wx.setStorageSync 保存');
// 开始游戏 (简单：3 次整理)
await tap(270 - 132, 548);
check(g.scenes.current.difficulty === 'easy', '触摸选择「简单」难度');
await tap(270, 656);
await pump(1.0);
check(g.scenes.currentName === 'game', '触摸「开始游戏」进入游戏');
const s = () => g.scenes.current;
check(s().items.uses === 3, `简单难度整理次数 ${s().items.uses}`);
const ev = { drop: 0, merge: 0, revive: 0, over: 0 };
g.events.on('drop', () => ev.drop++); g.events.on('merge', () => ev.merge++);
g.events.on('game:revive', () => ev.revive++); g.events.on('game:over', () => ev.over++);
const playsBefore = log.plays.length;
for (let i = 0; i < 4; i++) { await tap(150 + i * 80, 500); await pump(0.8); }
check(ev.drop === 4, `触摸投放角色：${ev.drop} 次`);
// 强制合成：两个同级角色放在一起
s().debugSpawn(2, 270, 700); s().debugSpawn(2, 272, 640);
await pump(1.5);
check(ev.merge >= 1 && s().score.score > 0, `同级角色相碰合成 (合成 ${ev.merge} 次，得分 ${s().score.score})`);
const sfxPlayed = log.plays.slice(playsBefore).filter((p) => /^sfx\//.test(p));
check(sfxPlayed.some((p) => p === 'sfx/drop.wav') && sfxPlayed.some((p) => /^sfx\/merge_\d+\.wav$/.test(p)), `投放/合成音效通过 InnerAudioContext 播放 (${[...new Set(sfxPlayed)].slice(0, 5).join(', ')})`);
check(log.plays.some((p) => /^media\/voice\/voice_\d+\.mp3$/.test(p)), '角色语音通过 InnerAudioContext 播放');
if (SHOTS) {
  // 商店截图：摆一盘层次丰富的局面
  s().merge.enabled = false;
  const lv = [6, 5, 4, 3, 5, 2, 4, 1, 3, 0, 2, 1];
  lv.forEach((l, i) => s().debugSpawn(l, 80 + (i * 97) % 380, 760 - Math.floor(i / 4) * 90));
  await pump(2.5);
  s().merge.enabled = true;
  s().score.score = Math.max(s().score.score, 1860);
  await pump(0.3);
}
await fs.writeFile(path.join(shotDir, SHOTS ? '2-游戏中.png' : 'play.png'), cv.toBuffer('image/png'));

// 前后台：onHide 自动暂停
handlers.hide.forEach((f) => f());
await pump(0.1);
check(s().fsm.is('paused') && !g.bgm.playing, 'wx.onHide → 游戏自动暂停、BGM 暂停');
handlers.show.forEach((f) => f({ scene: 1001, query: {} }));
await pump(0.1);
check(s().fsm.is('paused') && g.bgm.playing, 'wx.onShow → BGM 恢复，游戏保持暂停等待玩家继续');
{
  // BGM 无缝循环：A 播到 loopLength 前 B 从头开始并交叉淡化
  const L = g.bgm.seamless.loopLength;
  const A = g.bgm.el;
  A.a.currentTime = L - 0.3;
  await pump(0.4);
  const mid = { xf: !!g.bgm.xf, va: A.volume, vb: g.bgm.next.volume, bPlaying: !g.bgm.next.paused };
  await pump(1.0);
  const B = g.bgm.el;
  check(mid.xf && mid.bPlaying && mid.va > 0 && mid.vb > 0, `BGM 循环点：第二个播放器从头开始，两者交叉淡化 (A ${mid.va.toFixed(2)} / B ${mid.vb.toFixed(2)})`);
  check(B !== A && g.bgm.loops === 1 && !B.paused && A.paused && B.currentTime > 0.5 && B.currentTime < 2, `交叉淡化完成后切换到新的一遍 (loops=${g.bgm.loops}, 新播放位置 ${B.currentTime.toFixed(2)}s，旧播放器已停止)`);
}
s().resume();

// 整理：用完 3 次后看激励视频 +1 (每局 1 次)
for (let i = 0; i < 3; i++) { s().debugSpawn(0, 120 + i * 90, 400); await pump(0.3); await tap(378, 48); await pump(0.3); }
check(s().items.uses === 0 && s().hud.tidyBtn.badge === '▶', `整理次数用完后，整理按钮显示「▶」(看视频 +1)`);
s().debugSpawn(0, 300, 400); await pump(0.3);
await tap(378, 48);
await pump(0.5);
check(log.ads.length === 1 && g.ads.stats.byPlacement.tidy === 1, '点整理 → wx.createRewardedVideoAd 激励广告 (onClose isEnded=true) → 获得 +1 次并立即使用');
check(adSingleton && adSingleton.adUnitId === 'test-ad-unit-0001', '激励广告使用 PlatformConfig 中的 adUnitId');
check(s().adTidyLeft === 0 && s().hud.tidyBtn.enabled === false, '每局只能看 1 次 +1 整理');

// 堆满 → 复活提示
async function fillUp() {
  s().merge.enabled = false;
  let k = 0;
  for (let row = 0; row < 9 && !s().fsm.is('revive') && !s().fsm.is('over'); row++) {
    for (let col = 0; col < 4; col++) s().debugSpawn(4, 90 + col * 120 + (row % 2) * 30, 300 - (k++ % 3) * 5);
    await pump(1.0);
  }
  for (let i = 0; i < 120 && !s().fsm.is('revive') && !s().fsm.is('over'); i++) await pump(0.1);
}
await fillUp();
check(s().fsm.is('revive'), `角色越过警戒线 → 弹出「看视频复活」(状态 ${s().fsm.name})`);
check(ev.over === 0 && !s().submitted, '复活提示期间还没有结算成绩');
await pump(0.5);
await fs.writeFile(path.join(shotDir, SHOTS ? '3-看视频复活.png' : 'revive.png'), cv.toBuffer('image/png'));
adBehavior = 'skip';
await tap(270, 560);
await pump(0.5);
check(s().fsm.is('revive') && s().reviveMsg, `中途关闭视频 (isEnded=false) → 不复活，提示「${s().reviveMsg}」`);
adBehavior = 'complete';
const nBefore = s().characters.length;
await tap(270, 560);
await pump(0.5);
check(s().fsm.is('playing') && ev.revive === 1, '完整看完视频 → 复活继续游戏');
check(s().characters.length < nBefore && s().characters.every((c) => c.y - c.currentRadius >= 236 + 90 - 40), `复活清掉了警戒线附近及以上的角色 (${nBefore} → ${s().characters.length})`);
check(s().revivesLeft === 0, '每局只能复活 1 次');
await fillUp();
check(s().fsm.is('over') && ev.over === 1, '第二次堆满直接结束 (不再提供复活)');
await pump(2.0);
check(g.scenes.currentName === 'gameover', '进入结算画面');
check(g.scenes.current.shareBtn && g.scenes.current.buttons.includes(g.scenes.current.shareBtn), '结算画面显示「分享给好友」按钮');
check(g.scenes.current.shareBtn.label === '分享给好友', `按钮文字：${g.scenes.current.shareBtn.label}`);
await pump(0.5);
await fs.writeFile(path.join(shotDir, SHOTS ? '4-结算分享.png' : 'gameover.png'), cv.toBuffer('image/png'));
await tap(270, 652);
await pump(0.3);
const sh = log.shares[log.shares.length - 1];
check(sh && !sh.channel && /分/.test(sh.title) && sh.imageUrl === 'images/share.png', `点击「分享给好友」→ wx.shareAppMessage({ title: 「${sh && sh.title}」, imageUrl })`);
check(/「.+」/.test(log.onShareApp().title) && /「.+」/.test(log.onShareTimeline().title), `右上角转发 / 朋友圈也带上本局成绩：「${log.onShareTimeline().title}」`);

// 未填写广告位：不出现任何看广告入口
globalThis.__AM_TEST_AD_UNIT__ = '';
await tap(270, 724 + 34 - 34 + 34);   // 再来一局 (有分享按钮时 y=724)
await pump(1.0);
check(g.scenes.currentName === 'game', '再来一局');
check(!g.ads.available && s().adTidyLeft === 0 && s().freeRevive && s().revivesLeft === 1, '未填写 adUnitId：隐藏看视频 +1 整理，复活改为每局 1 次免费「再试一次」');
{
  s().items.uses = 0;
  await pump(0.2);
  check(!s().tidyAdReady && s().hud.tidyBtn.badge !== '▶', `未填写 adUnitId：整理用完后不出现「▶」看视频入口 (badge=${s().hud.tidyBtn.badge})`);
}
const adsBefore = log.ads.length;
await fillUp();
check(s().fsm.is('revive') && s().reviveWatchBtn.label === '再试一次', `未接广告时堆满 → 免费「再试一次」(按钮：${s().reviveWatchBtn.label})`);
await pump(0.5);
await fs.writeFile(path.join(root, 'build/wechat-free-revive.png'), cv.toBuffer('image/png'));
await tap(270, 560);
await pump(0.5);
check(s().fsm.is('playing') && log.ads.length === adsBefore && !g.ads.isShowingFake, '点「再试一次」直接复活，不播放任何广告');
await fillUp();
check(s().fsm.is('over'), '「再试一次」用过后再次堆满 → 结束');
await pump(2.0);

// 胜利 → 分享按钮
globalThis.__AM_TEST_AD_UNIT__ = 'test-ad-unit-0001';
await tap(270, 724);
await pump(1.0);
s().goal.goalLevel = 1;
s().merge.enabled = true;
s().debugSpawn(0, 270, 700); s().debugSpawn(0, 272, 650);
await pump(2.5);
check(s().fsm.is('victory'), `达成目标 → 胜利面板 (状态 ${s().fsm.name})`);
check(s().victoryPanel.shareBtn && s().victoryPanel.buttons.includes(s().victoryPanel.shareBtn), '胜利面板显示「分享给好友」');
await pump(0.8);
await fs.writeFile(path.join(shotDir, SHOTS ? '5-胜利.png' : 'victory.png'), cv.toBuffer('image/png'));
await tap(270, 834);
await pump(0.3);
check(log.shares.length === 2 && !log.shares[1].channel && log.shares[1].imageUrl === 'images/share.png', `胜利面板转发：「${log.shares[1] && log.shares[1].title}」`);

// 包体 & 代码检查
const sizes = JSON.parse(readFileSync(path.join(root, 'build/wechat-sizes.json'), 'utf8'));
check(sizes.main <= 4 * 1024 * 1024, `主包 ${(sizes.main / 1048576).toFixed(2)} MB ≤ 4 MB`);
check(sizes.total <= 30 * 1024 * 1024, `分包 ${(sizes.sub / 1048576).toFixed(2)} MB、整体 ${(sizes.total / 1048576).toFixed(2)} MB ≤ 30 MB`);
const gj = JSON.parse(readFileSync(path.join(pkgDir, 'game.json'), 'utf8'));
check(gj.deviceOrientation === 'portrait' && gj.subpackages && gj.subpackages[0].name === 'media' && gj.subpackages[0].root === 'media/', 'game.json：竖屏 + subpackages 分包 media/');
{
  const pc = JSON.parse(readFileSync(path.join(pkgDir, 'project.config.json'), 'utf8'));
  check(pc.compileType === 'game' && /^(touristappid|wx[0-9a-f]{16})$/.test(pc.appid), `project.config.json：compileType=game，appid=${pc.appid}`);
  check(existsSync(path.join(pkgDir, '微信上架说明.md')) && pc.packOptions.ignore.some((x) => x.value === '.md'), '微信上架说明.md 已复制到工程目录 (不计入上传包)');
}
{
  const walk = (d) => require('node:fs').readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const files = walk(pkgDir).map((f) => path.relative(pkgDir, f));
  const ogg = files.filter((f) => /\.ogg$/i.test(f));
  const mp3 = files.filter((f) => /\.mp3$/i.test(f));
  const wav = files.filter((f) => /^sfx\/.*\.wav$/i.test(f));
  check(ogg.length === 0 && mp3.length === 11 + 1 && wav.length === 27 && files.every((f) => !/\.(ogg|flac|ape|wma|amr)$/i.test(f)), `包内没有 ogg (iOS 不支持)：语音 11 + BGM 1 = ${mp3.length} 个 mp3，音效 ${wav.length} 个 wav`);
}
check(existsSync(path.join(pkgDir, 'media/game.js')) && existsSync(path.join(pkgDir, 'project.config.json')), '分包入口 media/game.js 与 project.config.json 存在');
{
  // matter-js 自带的 Render 模块 (调试渲染器) 里有一处 document.createElement("canvas")，游戏从不调用 Matter.Render，允许这一处
  const hits = code.match(/\bdocument\.(createElement|getElementById|addEventListener)|localStorage|new Audio\(|speechSynthesis/g) || [];
  const matterRender = (code.match(/document\.createElement\("canvas"\);return \w+\.width=/g) || []).length;
  check(hits.length - matterRender === 0 && matterRender <= 1, `game.js 中除 matter-js 自带、游戏不调用的 Render/Mouse 调试模块外，没有 DOM / localStorage / Audio / speechSynthesis 调用`);
  check(typeof globalThis.document === 'undefined' && typeof globalThis.window === 'undefined', '模拟环境中没有 window / document 全局，全程运行 (含 Matter.js 物理) 无 ReferenceError / console.error → 运行时没有访问 DOM');
}
check(consoleErrors.length === 0, `运行过程中没有 console.error (${consoleErrors.length})`);

// 商店截图
if (SHOTS) {
  console.log('\n生成商店截图 (1080×1920)');
  }

console.log(`\n${failed ? '有失败项 ✘' : '全部通过 ✔'}  (${passed} 通过, ${failed} 失败)`);
process.exit(failed ? 1 : 0);
