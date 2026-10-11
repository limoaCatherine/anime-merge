// 1.8 新增：网页版占位激励广告 (复活 / +1 整理) 与「出品：狸猫」署名的回归测试。
// 用法: npm run build && node tools/test-ads.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? '  ✔' : '  ✘'} ${msg}`); if (!cond) failures++; };

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const url = pathToFileURL(path.join(root, 'dist/index.html')).href;
await page.goto(url);
await page.waitForFunction(() => window.__ANIME_MERGE__ && window.__ANIME_MERGE__.scenes.currentName === 'menu' && !window.__ANIME_MERGE__.scenes.transitioning, null, { timeout: 15000 });
const E = (fn, arg) => page.evaluate(fn, arg);

console.log('\n[署名]');
let r = await E(() => {
  const g = window.__ANIME_MERGE__;
  const texts = [];
  const proto = CanvasRenderingContext2D.prototype; const orig = proto.fillText;
  proto.fillText = function (t, ...a) { texts.push(String(t)); return orig.call(this, t, ...a); };
  g.scenes.current.render(g.ctx);
  const menu = texts.slice(); texts.length = 0;
  g.scenes.current.showCredits = true; g.scenes.current.render(g.ctx); g.scenes.current.showCredits = false;
  proto.fillText = orig;
  return { menu, credits: texts };
});
check(r.menu.includes('出品：狸猫'), '主菜单显示「出品：狸猫」');
check(r.credits.includes('出品：狸猫') && !r.credits.some((t) => /盖姆艾尔/.test(t)), '制作人员面板显示「出品：狸猫」');

// 冻结主循环，手动推进
await E(() => {
  const g = window.__ANIME_MERGE__;
  g.voice.enabled = false;
  const orig = g.scenes.update.bind(g.scenes);
  g.scenes.update = () => {};
  window.__T = {
    g, orig,
    start(d) { g.scenes._swap('game', { difficulty: d }); const s = g.scenes.current; s.spawn.cooldown = 0; return s; },
    step(n = 1) { const s = g.scenes.current; for (let i = 0; i < n; i++) { g.ads.update(1 / 60); s.update(1 / 60); } },
    clear() { const s = g.scenes.current; [...s.characters].forEach((c) => s.removeCharacter(c)); },
  };
});

console.log('\n[网页版占位激励广告]');
r = await E(() => { const g = window.__T.g; return { ph: g.platform.placeholderAds, avail: g.ads.available, real: g.ads.real }; });
check(r.ph && r.avail && !r.real, '网页版 (未加 ?noads)：激励广告可用，使用 5 秒占位广告');

r = await E(() => {
  const T = window.__T; const s = T.start('easy'); T.clear();
  s.merge.enabled = false;
  for (let row = 0; row < 10 && !s.fsm.is('revive') && !s.fsm.is('over'); row++) {
    for (let c = 0; c < 4; c++) s.debugSpawn(4, 90 + c * 120 + (row % 2) * 30, 300);
    T.step(60);
  }
  for (let i = 0; i < 1200 && !s.fsm.is('revive') && !s.fsm.is('over'); i++) T.step(1);
  return { state: s.fsm.name, label: s.reviveWatchBtn.label, revives: s.revivesLeft };
});
check(r.state === 'revive' && r.label === '▶ 看视频复活', `堆满 → 弹出「看视频复活」(状态 ${r.state})`);

r = await E(async () => {
  const T = window.__T; const g = T.g; const s = g.scenes.current;
  s.watchReviveAd();
  const showing = g.ads.isShowingFake;
  T.step(60);                      // 1 秒后点跳过
  g.ads.closeFake(false);
  await new Promise((res) => setTimeout(res, 0));
  const afterSkip = { state: s.fsm.name, msg: s.reviveMsg };
  s.watchReviveAd();
  T.step(60 * 5 + 10);             // 看完 5 秒
  const finished = g.ads.fakeFinished;
  g.ads.closeFake(true);
  await new Promise((res) => setTimeout(res, 0));
  return { showing, afterSkip, finished, state: s.fsm.name, revives: s.revivesLeft, rewarded: g.ads.stats.byPlacement.revive || 0 };
});
check(r.showing, '点「看视频复活」→ 显示占位广告');
check(r.afterSkip.state === 'revive' && r.afterSkip.msg, `提前跳过 → 不复活 (提示「${r.afterSkip.msg}」)`);
check(r.finished && r.state === 'playing' && r.revives === 0 && r.rewarded === 1, '看满 5 秒领取奖励 → 复活继续 (每局 1 次)');

r = await E(async () => {
  const T = window.__T; const g = T.g; const s = g.scenes.current;
  T.clear(); s.merge.enabled = true;
  s.items.uses = 0;
  s.debugSpawn(0, 200, 700); s.debugSpawn(1, 340, 700);
  T.step(30);
  const ready = s.tidyAdReady; const badge = s.hud.tidyBtn.badge;
  s.onTidyButton();
  const showing = g.ads.isShowingFake;
  T.step(60 * 5 + 10);
  g.ads.closeFake(true);
  await new Promise((res) => setTimeout(res, 0));
  T.step(5);
  return { ready, badge, showing, left: s.adTidyLeft, lv0: s.characters.filter((c) => !c.removed && c.level === 0).length, tidy: g.ads.stats.byPlacement.tidy || 0, ready2: s.tidyAdReady };
});
check(r.ready && r.badge === '▶', `整理次数用完 → 整理按钮显示「▶」(badge=${r.badge})`);
check(r.showing && r.tidy === 1 && r.left === 0 && r.lv0 === 0, '看完占位广告 → +1 整理并立即使用 (最小角色被清除)');
check(!r.ready2, '+1 整理每局只能看 1 次');

console.log('\n[?noads]');
await page.goto(url + '?noads');
await page.waitForFunction(() => window.__ANIME_MERGE__ && window.__ANIME_MERGE__.scenes.currentName === 'menu', null, { timeout: 15000 });
r = await E(() => { const g = window.__ANIME_MERGE__; g.scenes._swap('game', { difficulty: 'easy' }); const s = g.scenes.current; return { avail: g.ads.available, revives: s.revivesLeft, tidy: s.adTidyLeft, free: !!s.freeRevive }; });
check(!r.avail && r.revives === 0 && r.tidy === 0 && !r.free, '?noads：没有任何看广告入口，也没有免费复活 (网页/桌面行为)');

check(errors.length === 0, `没有页面错误 (${errors.length})${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
await browser.close();
console.log(failures ? `\n✘ ${failures} 项失败` : '\n全部通过');
process.exit(failures ? 1 : 0);
