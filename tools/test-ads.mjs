// 「出品：狸猫」署名，以及网页版不显示任何广告 / 看视频入口 (复活、+1 整理) 的回归测试。
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

console.log('\n[网页版：无广告入口]');
r = await E(() => { const g = window.__T.g; return { ph: g.platform.placeholderAds, avail: g.ads.available, real: g.ads.real }; });
check(!r.ph && !r.avail && !r.real, '网页版：不使用占位广告，激励广告不可用 (与桌面版相同)');

r = await E(() => {
  const T = window.__T; const g = T.g; const s = T.start('easy');
  return { revives: s.revivesLeft, tidy: s.adTidyLeft, free: !!s.freeRevive, uses: s.items.uses };
});
check(r.revives === 0 && r.tidy === 0 && !r.free, `开局：没有看视频复活 / +1 整理，也没有免费复活 (revives=${r.revives} adTidy=${r.tidy})`);
check(r.uses === 3, `简单模式：整理道具 3 次 (uses=${r.uses})`);

// 整理：正常次数依次用完，用完后不出现「▶」
r = await E(() => {
  const T = window.__T; const g = T.g; const s = g.scenes.current;
  T.clear(); s.merge.enabled = true;
  const log = [];
  for (let k = 0; k < 3; k++) {
    s.debugSpawn(0, 200, 700); s.debugSpawn(1, 340, 700);
    T.step(30);
    const before = s.characters.filter((c) => !c.removed && c.level === 0).length;
    const canTidy = s.hud.tidyBtn && !s.hud.tidyBtn.disabled;
    s.onTidyButton(); T.step(5);
    log.push({ before, after: s.characters.filter((c) => !c.removed && c.level === 0).length, uses: s.items.uses, badge: s.hud.tidyBtn.badge, canTidy });
  }
  s.debugSpawn(0, 200, 700); T.step(30);
  s.onTidyButton(); T.step(5);
  return { log, final: { uses: s.items.uses, badge: s.hud.tidyBtn.badge, adMode: !!s.hud.tidyBtn.adMode, ready: s.tidyAdReady, lv0: s.characters.filter((c) => !c.removed && c.level === 0).length, fake: g.ads.isShowingFake, shown: g.ads.stats.shown } };
});
check(r.log.every((x, i) => x.before > 0 && x.after === 0 && x.uses === 2 - i), `整理按次数正常使用 3 次 (${r.log.map((x) => `${x.before}→${x.after}/剩${x.uses}`).join(', ')})`);
check(r.final.uses === 0 && r.final.badge !== '▶' && !r.final.adMode && !r.final.ready, `次数用完：整理按钮不显示「▶」(badge=${r.final.badge})`);
check(!r.final.fake && r.final.shown === 0 && r.final.lv0 > 0, '次数用完再点整理：无效果，不弹出广告');

// 堆满：直接结束 → 结算页「再来一局」
r = await E(() => {
  const T = window.__T; const g = T.g; const s = g.scenes.current; T.clear();
  s.merge.enabled = false;
  for (let row = 0; row < 10 && !s.fsm.is('revive') && !s.fsm.is('over'); row++) {
    for (let c = 0; c < 4; c++) s.debugSpawn(4, 90 + c * 120 + (row % 2) * 30, 300);
    T.step(60);
  }
  let sawRevive = false;
  for (let i = 0; i < 1200 && !s.fsm.is('over'); i++) { T.step(1); if (s.fsm.is('revive')) sawRevive = true; }
  return { state: s.fsm.name, sawRevive, fake: g.ads.isShowingFake };
});
check(r.state === 'over' && !r.sawRevive && !r.fake, `堆满 → 直接结束，不弹「看视频复活」(状态 ${r.state})`);

r = await E(async () => {
  const g = window.__T.g;
  g.scenes.update = window.__T.orig;            // 恢复主循环，让结束动画切到结算页
  for (let i = 0; i < 100 && g.scenes.currentName !== 'gameover'; i++) await new Promise((res) => setTimeout(res, 50));
  const sc = g.scenes.current;
  const texts = [];
  const proto = CanvasRenderingContext2D.prototype; const orig = proto.fillText;
  proto.fillText = function (t, ...a) { texts.push(String(t)); return orig.call(this, t, ...a); };
  g.draw();                                     // 整帧绘制 (含广告层，如果有)
  proto.fillText = orig;
  return { scene: g.scenes.currentName, retry: !!(sc.retryBtn && sc.retryBtn.label === '再来一局'), adText: texts.filter((t) => /看视频|广告/.test(t)) };
});
check(r.scene === 'gameover' && r.retry, `结算页：显示「再来一局」(场景 ${r.scene})`);
check(r.adText.length === 0, `结算页没有任何广告 / 看视频文字 (${r.adText.join(',')})`);

r = await E(async () => {
  const g = window.__ANIME_MERGE__; g.scenes.current.retry();
  for (let i = 0; i < 100 && !(g.scenes.currentName === 'game' && !g.scenes.transitioning); i++) await new Promise((res) => setTimeout(res, 50));
  const s = g.scenes.current;
  return { scene: g.scenes.currentName, state: s.fsm && s.fsm.name, uses: s.items && s.items.uses };
});
check(r.scene === 'game' && r.state === 'playing' && r.uses === 3, `「再来一局」→ 重新开始 (场景 ${r.scene}/${r.state}，整理 ${r.uses} 次)`);

check(errors.length === 0, `没有页面错误 (${errors.length})${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
await browser.close();
console.log(failures ? `\n✘ ${failures} 项失败` : '\n全部通过');
process.exit(failures ? 1 : 0);
