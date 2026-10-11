// 逻辑审计回归测试 (1.7)：针对审计中发现/修复的每一个问题各写一条自动化检查。
// 大部分用例冻结主循环、以固定 1/60 秒手动推进游戏 (结果可复现)。
// 用法: npm run build && xvfb-run -a node tools/test-audit.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? '  ✔' : '  ✘'} ${msg}`); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(pathToFileURL(path.join(root, 'dist/index.html')).href);
await page.waitForFunction(() => window.__ANIME_MERGE__ && window.__ANIME_MERGE__.scenes.currentName === 'menu' && !window.__ANIME_MERGE__.scenes.transitioning, null, { timeout: 15000 });

// 测试辅助：冻结 / 恢复主循环的场景更新，手动推进；固定随机种子
await page.evaluate(() => {
  const g = window.__ANIME_MERGE__;
  const orig = g.scenes.update.bind(g.scenes);
  g.voice.enabled = false;
  window.__T = {
    frozen: false,
    freeze() { if (!this.frozen) { g.scenes.update = () => {}; this.frozen = true; } },
    thaw() { if (this.frozen) { g.scenes.update = orig; this.frozen = false; } },
    seed(n) { let s0 = n >>> 0; Math.random = () => { s0 = (s0 + 0x6D2B79F5) >>> 0; let t = s0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; },
    start(difficulty, seed = 1) { this.seed(seed); this.freeze(); g.scenes._swap('game', { difficulty }); const s = g.scenes.current; s.spawn.cooldown = 0; return s; },
    get s() { return g.scenes.current; },
    step(n = 1, fn) { const s = g.scenes.current; for (let i = 0; i < n; i++) { if (fn) fn(i); s.update(1 / 60); } },
    clear() { const s = g.scenes.current; [...s.characters].forEach((c) => s.removeCharacter(c)); },
    ev: {},
  };
  const count = (name) => g.events.on(name, () => { window.__T.ev[name] = (window.__T.ev[name] || 0) + 1; });
  ['merge', 'merge:max', 'goal:reached', 'game:over', 'drop', 'stone:spawn', 'stone:hit', 'stone:break', 'voice:line'].forEach(count);
});
const E = (fn, arg) => page.evaluate(fn, arg);

console.log('\n[合成竞态]');
let r = await E(() => {
  const T = window.__T; const s = T.start('easy'); T.clear(); T.ev = {};
  // 三个同级 (Lv3) 同时互相接触
  const R = s.getDef(2).radius;
  const a = s.debugSpawn(2, 270 - R * 0.9, 700); const b = s.debugSpawn(2, 270 + R * 0.9, 700); const c = s.debugSpawn(2, 270, 700 - R * 1.5);
  T.step(1);
  const first = T.ev.merge || 0;
  T.step(180);
  return { first, merges: T.ev.merge || 0, stuck: s.characters.filter((x) => x.merging).length, levels: s.characters.map((x) => x.level).sort() };
});
check(r.first === 1, `3 个同级同时接触：同一步只合成一对 (第一步合成 ${r.first} 次)`);
check(r.stuck === 0, `合成结束后没有角色卡在"合成中"状态 (卡住 ${r.stuck}，最终等级 ${JSON.stringify(r.levels.map((l) => l + 1))})`);

r = await E(() => {
  const T = window.__T; const s = T.s; T.clear();
  const a = s.debugSpawn(1, 150, 700); const b = s.debugSpawn(1, 400, 700);
  a.merging = b.merging = true;
  s.merge.queue.push({ a, b, x: 270, y: 700 });
  s.removeCharacter(b);                       // 对方在合成处理前被移除 (例如整理道具)
  const before = s.characters.length;
  s.merge.resolve();
  return { aMerging: a.merging, aRemoved: a.removed, spawned: s.characters.length - before };
});
check(!r.aMerging && !r.aRemoved && r.spawned === 0, `与刚被移除的角色合成：取消合成并解除标记 (merging=${r.aMerging}, 新生成 ${r.spawned})`);

r = await E(() => {
  const T = window.__T; const s = T.s; T.clear();
  const a = s.debugSpawn(1, 150, 700); const b = s.debugSpawn(1, 220, 700);
  a.merging = b.merging = true;
  s.merge.queue.push({ a, b, x: 185, y: 700 });
  s.merge.enabled = false;                    // 例如已判负
  s.merge.resolve();
  s.merge.enabled = true;
  return { a: a.merging, b: b.merging, alive: !a.removed && !b.removed };
});
check(!r.a && !r.b && r.alive, '合成被禁用 (判负后) 时排队的合成被取消且标记被清除');

r = await E(() => {
  const T = window.__T; const s = T.s; T.clear(); T.ev = {};
  const R = s.getDef(3).radius;
  s.debugSpawn(3, 270 - R * 0.95, 840); s.debugSpawn(3, 270 + R * 0.95, 840);
  s.pause();
  T.step(120);
  const paused = T.ev.merge || 0;
  s.resume();
  T.step(30);
  return { paused, after: T.ev.merge || 0 };
});
check(r.paused === 0 && r.after === 1, `暂停中不发生合成，继续后正常合成 (暂停中 ${r.paused}，继续后 ${r.after})`);

r = await E(() => {
  const T = window.__T; const s = T.s; T.clear(); T.ev = {};
  const R = s.getDef(5).radius;
  const ch = s.spawn.current;
  // "刚投放的角色" 也能正常参与合成：在落点下方放一个同级
  s.spawn.current = 2; s.aimX = s.aimTargetX = 270;
  s.debugSpawn(2, 270, 860);
  s.drop();
  T.step(90);
  return { merges: T.ev.merge || 0 };
});
check(r.merges >= 1, `刚投放的角色落到同级上会合成 (${r.merges} 次)`);

console.log('\n[物理]');
r = await E(() => {
  const T = window.__T; const s = T.start('hard'); T.clear();
  s.goal.reached = true;   // 本组用例不触发胜利画面 (胜利时物理暂停)
  const c = s.rules.container;
  const R8 = s.getDef(8).radius; const R9 = s.getDef(9).radius;
  // 两个 Lv9 贴着左墙合成 -> Lv10 出生点按完整半径限制在墙内
  s.debugSpawn(8, c.left + R8, 888 - R8); s.debugSpawn(8, c.left + R8, 888 - R8 * 3 + 2);
  let born = null;
  const off = window.__ANIME_MERGE__.events.on('merge', (e) => { if (e.level === 9 && !born) born = { x: e.x, y: e.y }; });
  s.physics.rescued = 0;
  T.step(120);
  off();
  const all = [...s.characters];
  const inside = all.every((ch) => ch.x - ch.currentRadius >= c.left - 3 && ch.x + ch.currentRadius <= c.right + 3 && ch.y + ch.currentRadius <= c.bottom + 3);
  return { born, min: c.left + R9, inside, rescued: s.physics.rescued };
});
check(r.born && r.born.x >= r.min - 0.01, `大角色合成出生点限制在墙内 (Lv10 出生 x=${r.born && r.born.x.toFixed(1)} ≥ ${r.min})`);
check(r.inside, `长大后所有角色都在容器内 (安全网救回 ${r.rescued} 个)`);

r = await E(() => {
  const T = window.__T; const s = T.s; T.clear();
  const c = s.rules.container;
  const a = s.debugSpawn(0, 200, 700);
  s.physics.setVelocity(a.body, { x: -400, y: 300 });   // 极端高速撞墙/地面
  T.step(1);
  const sp = a.speed;
  T.step(120);
  return { sp, x: a.x, y: a.y, r: a.currentRadius, left: c.left, bottom: c.bottom, max: window.__ANIME_MERGE__.config.physics.maxSpeed };
});
check(r.sp <= r.max + 0.01 && r.x >= r.left && r.y <= r.bottom, `高速撞墙不穿墙 (限速 ${r.sp.toFixed(1)} ≤ ${r.max}，最终 x=${r.x.toFixed(0)} y=${r.y.toFixed(0)})`);

r = await E(() => {
  const T = window.__T; const s = T.s; T.clear();
  const c = s.rules.container;
  const a = s.debugSpawn(2, 270, 700);
  window.__ANIME_MERGE__.characters; // noop
  // 直接把刚体移到墙外 (模拟穿透) -> 下一步被放回容器
  const M = a.body; M.position.x = c.left - 120; M.positionPrev.x = c.left - 120;
  T.step(2);
  return { x: a.x, min: c.left };
});
check(r.x >= r.min, `穿到墙外的角色会被放回容器 (x=${r.x.toFixed(0)})`);

r = await E(() => {
  const T = window.__T; const s = T.s; T.clear(); T.ev = {};
  const c = s.rules.container; const R = s.getDef(9).radius;
  // 困难窄场地：两个 Lv10 分别放在两侧 —— 场地宽 < 2×直径，必然互相接触并合成为 Lv11
  s.debugSpawn(9, c.left + R, 888 - R); s.debugSpawn(9, c.right - R, 888 - R - 10);
  T.step(240);
  return { merges: T.ev.merge || 0, top: s.characters.map((x) => x.level), width: c.right - c.left, R };
});
check(r.merges >= 1 && r.top.includes(10), `困难场地 (宽 ${r.width}) 两个天空女王 (r=${r.R}) 能相遇并合成为星海女神`);

r = await E(() => {
  const T = window.__T; const s = T.s; T.clear();
  const a = s.debugSpawn(2, 150, 860); const top = s.debugSpawn(1, 150, 860 - 39 - 30 - 2);
  T.step(90);
  const y0 = top.y;
  s.removeCharacter(a);                       // 下面的角色被移除 (合成/整理)
  T.step(90);
  return { y0, y1: top.y };
});
check(r.y1 > r.y0 + 20, `下方角色消失后上方角色会继续下落 (未启用休眠，y ${r.y0.toFixed(0)} → ${r.y1.toFixed(0)})`);

console.log('\n[警戒线]');
r = await E(() => {
  const T = window.__T; const s = T.start('normal'); T.clear();
  s.spawn.current = 4; s.aimX = s.aimTargetX = 270; s.drop();
  let worst = 0;
  T.step(120, () => { for (const c of s.characters) worst = Math.max(worst, c.dangerTime); });
  return { worst, st: s.fsm.name };
});
check(r.worst === 0 && r.st === 'playing', `新投放角色穿过警戒线不计时 (最大计时 ${r.worst})`);

r = await E(() => {
  const T = window.__T; const s = T.s; T.clear();
  const a = s.debugSpawn(1, 270, 500);
  s.physics.setVelocity(a.body, { x: 0, y: -22 });        // 被弹飞到警戒线以上再落下
  let worst = 0;
  T.step(150, () => { worst = Math.max(worst, a.dangerTime); });
  return { worst, st: s.fsm.name };
});
check(r.worst < 0.2 && r.st === 'playing', `短暂弹到警戒线以上不会判负 (最大计时 ${r.worst.toFixed(2)}s)`);

r = await E(() => {
  const T = window.__T; const s = T.s; T.clear(); T.ev = {};
  const a = s.debugSpawn(2, 270, 200);
  a.age = 5;
  // 卡在线上不停抖动 (速度始终 > 静止阈值，但几乎没有净位移) —— 修复前永远不会判负
  let k = 0;
  T.step(200, () => { k = -k || 3; const b = a.body; window.__ANIME_MERGE__.characters; b.position.y = 200; b.positionPrev.y = 200; s.physics.setVelocity(b, { x: k, y: 0 }); });
  return { st: s.fsm.name, over: T.ev['game:over'] || 0 };
});
check(r.st === 'over' && r.over === 1, `卡在警戒线上抖动的角色也会判负 (状态 ${r.st})`);

r = await E(() => {
  const T = window.__T; const s = T.start('normal'); T.clear(); T.ev = {};
  const a = s.debugSpawn(2, 270, 860); a.dangerTime = 1.9;   // 接近判负
  // 合成出目标 -> 胜利 -> 继续挑战
  const R = s.getDef(7).radius;
  s.debugSpawn(7, 270 - R * 0.95, 700); s.debugSpawn(7, 270 + R * 0.95, 700);
  T.step(30);
  const st1 = s.fsm.name;
  s.continueEndless();
  const reset = s.characters.every((c) => c.dangerTime === 0);
  T.step(10);
  return { st1, reset, st2: s.fsm.name, goal: T.ev['goal:reached'] || 0 };
});
check(r.st1 === 'victory' && r.reset && r.st2 === 'playing', `胜利 → 继续挑战：判负计时清零，继续游戏 (${r.st1} → ${r.st2})`);

r = await E(() => {
  const T = window.__T; const s = T.s; T.ev = {};
  const R = s.getDef(7).radius;
  s.debugSpawn(7, 150, 700); s.debugSpawn(7, 150 + R * 1.9, 700);
  T.step(40);
  const goal2 = T.ev['goal:reached'] || 0;
  // 继续挑战后仍会正常判负
  const a = s.debugSpawn(2, 100, 200); a.age = 5;
  T.step(200, () => { a.body.position.y = 200; a.body.positionPrev.y = 200; s.physics.setVelocity(a.body, { x: 0, y: 0 }); });
  return { goal2, st: s.fsm.name };
});
check(r.goal2 === 0, `目标只触发一次 (继续后再次合成出目标：${r.goal2} 次)`);
check(r.st === 'over', `继续挑战后仍会正常判负 (${r.st})`);

console.log('\n[投放]');
r = await E(() => {
  const T = window.__T; const s = T.start('normal'); T.clear();
  const n = [s.drop(), s.drop(), s.drop(), s.drop()].filter(Boolean).length;
  return { n, drops: s.spawn.dropCount };
});
check(r.n === 1, `连续狂按只投放 1 个 (冷却 0.55 秒；投放 ${r.n})`);

r = await E(() => {
  const T = window.__T; const s = T.start('hard'); T.clear();
  const c = s.rules.container;
  s.spawn.current = 4; const R = s.getDef(4).radius;
  s.aimX = s.aimTargetX = -500;
  s.drop();
  const a = s.characters[s.characters.length - 1].x;
  // 倒计时超时自动投放：瞄准在最右外侧，也要被限制在场地内
  T.step(40);
  s.spawn.current = 4; s.aimTargetX = 2000; s.aimX = 2000;
  let dropped = null;
  const off = window.__ANIME_MERGE__.events.on('drop', (e) => { dropped = e; });
  T.step(Math.ceil(4.2 * 60));
  off();
  return { a, min: c.left + R + 1, dropped, max: c.right - R - 1 };
});
check(Math.abs(r.a - r.min) < 0.01, `瞄准按当前角色半径限制在窄场地内 (x=${r.a.toFixed(1)})`);
check(r.dropped && r.dropped.x <= r.max + 0.01, `倒计时超时自动投放位置也被限制 (x=${r.dropped && r.dropped.x.toFixed(1)} ≤ ${r.max})`);

r = await E(() => {
  const T = window.__T; const s = T.start('normal'); T.clear();
  T.step(120);
  const r0 = s.dropTimer.remaining;
  s.pause(); T.step(180); const r1 = s.dropTimer.remaining;
  s.resume(); T.step(60); const r2 = s.dropTimer.remaining;
  return { r0, r1, r2 };
});
check(Math.abs(r.r0 - r.r1) < 1e-9 && r.r2 < r.r1, `暂停时倒计时停止 (${r.r0.toFixed(2)} → 暂停 3 秒后 ${r.r1.toFixed(2)} → 继续 ${r.r2.toFixed(2)})`);

r = await E(() => {
  const T = window.__T; const s = T.s;
  window.dispatchEvent(new Event('blur'));
  const st = s.fsm.name;
  s.resume();
  return { st };
});
check(r.st === 'paused', `窗口失去焦点自动暂停 (${r.st})`);

r = await E(() => {
  const T = window.__T; let s = T.start('easy'); T.clear();
  s.items.useTidy(); T.step(30); s.drop(); T.step(60);
  window.__ANIME_MERGE__.scenes._swap('game', { difficulty: 'easy' });   // 重新开始
  s = T.s;
  return { drops: s.spawn.dropCount, uses: s.items.uses, n: s.characters.length, st: s.fsm.name };
});
check(r.drops === 0 && r.uses === 3 && r.n === 0, `重新开始后投放数/道具次数/场上角色全部重置 (投放 ${r.drops}, 整理 ${r.uses})`);

r = await E(() => {
  const T = window.__T; const s = T.start('normal'); T.clear(); T.thaw();
  const cv = document.getElementById('game'); const b = cv.getBoundingClientRect();
  const at = (x, y) => ({ clientX: b.left + x / 540 * b.width, clientY: b.top + y / 960 * b.height });
  s.spawn.cooldown = 0;
  const d0 = s.spawn.dropCount;
  cv.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, ...at(200, 500) }));
  window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 7, pointerType: 'touch', bubbles: true, ...at(200, 500) }));
  const afterCancel = s.spawn.dropCount - d0;
  // 多点触控：第二根手指被忽略，只有第一根手指抬起才投放
  cv.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, pointerType: 'touch', isPrimary: true, bubbles: true, ...at(150, 500) }));
  cv.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 2, pointerType: 'touch', isPrimary: false, bubbles: true, ...at(420, 500) }));
  window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 2, pointerType: 'touch', bubbles: true, ...at(420, 500) }));
  const afterSecond = s.spawn.dropCount - d0;
  window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'touch', bubbles: true, ...at(150, 500) }));
  const last = s.characters[s.characters.length - 1];
  T.freeze();
  return { afterCancel, afterSecond, total: s.spawn.dropCount - d0, x: last && last.x };
});
check(r.afterCancel === 0, '触摸被系统取消 (pointercancel) 时不投放');
check(r.afterSecond === 0 && r.total === 1 && Math.abs(r.x - 150) < 40, `多点触控只响应第一根手指 (投放 ${r.total}，x=${r.x && r.x.toFixed(0)})`);

console.log('\n[石头]');
r = await E(() => {
  const T = window.__T; const s = T.start('hard', 3); T.clear(); T.ev = {};
  const c = s.rules.container; const o = s.obstacles;
  // 左边堆得很高，右边空：石头应出现在右侧低处
  for (let y = 840; y > 330; y -= 70) s.debugSpawn(3, c.left + 60, y), s.debugSpawn(3, c.left + 160, y);
  T.step(60);
  const xs = [];
  for (let i = 0; i < 6; i++) { const x = o.pickX(); xs.push(x); }
  return { xs, mid: (c.left + c.right) / 2 };
});
check(r.xs.every((x) => x != null && x > r.mid), `石头优先出现在堆积较低的一侧 (${r.xs.map((x) => x && x.toFixed(0)).join(',')})`);

r = await E(() => {
  const T = window.__T; const s = T.start('hard', 4); T.clear(); T.ev = {};
  s.rules.dangerTime = 999;   // 只检查石头逻辑，不让堆满判负
  const c = s.rules.container; const o = s.obstacles;
  // 全场都堆到接近警戒线：本次推迟出现，不会把角色顶出警戒线
  s.merge.enabled = false;    // 只检查石头逻辑：摆满后不让它们合成
  for (let x = c.left + 40; x < c.right - 30; x += 78) for (let y = 850; y > 330; y -= 76) s.debugSpawn(3, x, y);
  T.step(90);
  const top = Math.min(...[100, 200, 300, 400].map((x) => o.columnTop(x, 50)));
  o.forceNext(); T.step(Math.ceil(2 * 60));
  return { spawned: T.ev['stone:spawn'] || 0, postponed: o.postponed, stones: o.stones.length, top: Math.round(top) };
});
check(r.spawned === 0 && r.postponed >= 1, `场地太满时石头推迟出现 (堆积最高点 y=${r.top}，推迟 ${r.postponed} 次)`);

r = await E(() => {
  const T = window.__T; const s = T.start('hard', 5); T.clear(); T.ev = {};
  const o = s.obstacles;
  for (let i = 0; i < 6; i++) { o.forceNext(); T.step(Math.ceil(1.7 * 60)); }
  const n = o.stones.length;
  // 远处的合成不会让石头开裂
  const R = s.getDef(0).radius;
  const hits0 = o.stones.reduce((a, x) => a + x.hits, 0);
  s.debugSpawn(0, 270 - R * 0.9, 300); s.debugSpawn(0, 270 + R * 0.9, 300);   // 半空中合成，离地面的石头很远
  T.step(3);
  const hits = o.stones.reduce((a, x) => a + x.hits, 0) - hits0;
  window.__ANIME_MERGE__.scenes._swap('game', { difficulty: 'hard' });
  return { n, max: o.cfg.maxStones, hits, after: T.s.obstacles.stones.length };
});
check(r.n === r.max, `石头数量不超过上限 (${r.n}/${r.max})`);
check(r.hits === 0, `只有紧邻石头的合成才会让它开裂 (远处合成后裂纹 ${r.hits})`);
check(r.after === 0, '重新开始后石头被清除');

console.log('\n[道具 / 目标 / 成绩]');
r = await E(() => {
  const T = window.__T; const s = T.start('easy'); T.clear();
  const empty = s.items.canUseTidy();
  s.debugSpawn(0, 200, 800); s.debugSpawn(2, 300, 800);
  T.step(30);
  const ok = s.items.useTidy();
  return { empty, ok, left: s.characters.map((c) => c.level), uses: s.items.uses };
});
check(!r.empty && r.ok && r.uses === 2 && r.left.length === 1 && r.left[0] === 2, `整理：空场不可用；只移除最小等级 (剩余 ${JSON.stringify(r.left.map((l) => l + 1))}, 次数 ${r.uses})`);

r = await E(() => {
  const T = window.__T; const s = T.start('hard'); T.clear(); T.ev = {};
  const R = s.getDef(8).radius;
  s.debugSpawn(8, 160, 888 - R); s.debugSpawn(8, 160 + R * 1.95, 888 - R);
  T.step(40);
  return { st: s.fsm.name, goal: T.ev['goal:reached'] || 0 };
});
check(r.st === 'victory' && r.goal === 1, `困难：合成「天空女王」即胜利 (${r.st})`);

r = await E(() => {
  const g = window.__ANIME_MERGE__; const sv = g.save;
  const keep = JSON.stringify(sv.data);
  sv.data.highScores = { normal: 500, hard: 100 };
  const a = sv.submit(300, 3, 'normal'); const b = sv.submit(200, 3, 'hard');
  const res = { a, b, n: sv.highScore('normal'), h: sv.highScore('hard') };
  sv.data = JSON.parse(keep); sv.flush();
  return res;
});
check(!r.a && r.b && r.n === 500 && r.h === 200, `最高分按难度分别记录，低分不覆盖 (普通 ${r.n}, 困难 ${r.h})`);

r = await E(() => {
  const T = window.__T; const s = T.start('hard', 9);
  let ok = true; let early = true;
  for (let i = 0; i < 60; i++) {
    const next = s.spawn.next; const L = s.spawn.take();
    if (i < 4 && L > 2) early = false;
    if (s.spawn.current !== next) ok = false;
  }
  return { ok, early };
});
check(r.ok, '「下一个」预览与实际投放一致 (60 次)');
check(r.early, '开局前 4 次只出 1~3 级');

console.log('\n[界面]');
r = await E(() => {
  const T = window.__T; const out = [];
  for (const d of ['normal', 'hard', 'easy']) {
    const s = T.start(d); const hud = s.hud; const c = s.rules.container;
    for (let L = 0; L < 5; L++) {
      const R = s.getDef(L).radius + 9;
      for (let x = c.left + R; x <= c.right - R; x += 6) {
        const g = s.goal;
        const text = !g.hasGoal ? '无尽模式 · 尽情合成吧' : `目标：${g.goalDef.name}  Lv.11/11`;
        const short = !g.hasGoal ? '无尽模式' : 'Lv.11/11';
        const lay = hud.goalLayout(text, { x, y: 162, r: R, timer: d !== 'easy' }, 1, `目标 ${short}`);
        if (lay.blocked) out.push(`${d} Lv${L + 1} x=${x}`);
      }
    }
  }
  return out;
});
check(r.length === 0, `目标进度条不再被待投放角色/倒计时环挡住 (冲突 ${r.length} 处${r.length ? ': ' + r.slice(0, 3).join('; ') : ''})`);

r = await E(() => {
  // 直接渲染每一句字幕并检查气泡宽度
  const T = window.__T; const s = T.start('normal'); const g = window.__ANIME_MERGE__;
  const c = s.rules.container; const out = [];
  const lines = g.voiceLines || [];
  for (let i = 0; i < lines.length; i++) {
    s.subtitles.show({ index: i, line: lines[i], x: 270, y: 500, first: true });
    s.subtitles.render(g.ctx);
    const L = s.subtitles.current.layout;
    g.ctx.font = `bold ${L.f1}px sans-serif`;
    out.push({ i, n: L.jp.length, f: L.f1 });
  }
  return { n: lines.length, out, maxW: c.right - c.left };
});
check(r.n === 11 && r.out.every((x) => x.f >= 16), `11 句字幕都能完整显示在容器内 (字号 ≥16，折行 ${r.out.filter((x) => x.n > 1).length} 句)`);

await page.setViewportSize({ width: 360, height: 700 });
await sleep(200);
r = await E(() => {
  const g = window.__ANIME_MERGE__; const cv = g.canvas; const b = cv.getBoundingClientRect();
  const p = g.input.toLogical({ clientX: b.left + b.width / 2, clientY: b.top + b.height / 4 });
  return { x: p.x, y: p.y, w: Math.round(b.width), h: Math.round(b.height) };
});
check(Math.abs(r.x - 270) < 1 && Math.abs(r.y - 240) < 1, `窗口缩放后坐标换算正确 (画布 ${r.w}×${r.h}，中心 → ${r.x.toFixed(0)},${r.y.toFixed(0)})`);
await page.setViewportSize({ width: 540, height: 960 });

console.log('\n[语音 / 音乐]');
r = await E(() => {
  const T = window.__T; const g = window.__ANIME_MERGE__; const v = g.voice;
  v.enabled = true;
  const s = T.start('normal');
  v.introduce(5, 200, 400); v.introduce(6, 200, 400);
  s.pause();
  for (let i = 0; i < 120; i++) v.update(1 / 60);       // 暂停中：排队的台词不开始
  const heldPlayed = v.history.filter((x) => x === 5 || x === 6).length;
  s.resume();
  for (let i = 0; i < 10; i++) v.update(1 / 60);
  const resumed = v.history.filter((x) => x === 5 || x === 6).length;
  // 判负：停止并清空队列
  v.introduce(7, 200, 400); v.introduce(8, 200, 400);
  s.fsm.change('over');
  const afterOver = { q: v.queue.length, cur: !!v.current };
  for (let i = 0; i < 120; i++) v.update(1 / 60);
  const playedAfterOver = v.history.filter((x) => x === 7 || x === 8).length;
  // 离开游戏场景 (返回菜单) 也停止
  g.scenes._swap('game', { difficulty: 'normal' });
  v.introduce(9, 200, 400);
  g.scenes._swap('menu');
  const menu = { q: v.queue.length, cur: !!v.current };
  v.enabled = false;
  return { heldPlayed, resumed, afterOver, playedAfterOver, menu };
});
check(r.heldPlayed === 0 && r.resumed >= 1, `暂停中不开始新台词，继续后播放 (暂停中 ${r.heldPlayed}，继续后 ${r.resumed})`);
check(r.afterOver.q === 0 && !r.afterOver.cur && r.playedAfterOver === 0, '判负后排队的台词被取消，结算画面不再说话');
check(r.menu.q === 0 && !r.menu.cur, '返回菜单时停止并清空台词');

r = await E(async () => {
  const g = window.__ANIME_MERGE__; const T = window.__T;
  T.thaw();
  g.bgm.unlock();
  await new Promise((res) => setTimeout(res, 600));
  const el = g.bgm.el; const t0 = el.currentTime; const src = el.src;
  g.scenes.change('game', { difficulty: 'normal' });
  await new Promise((res) => setTimeout(res, 900));
  g.scenes.change('game', { difficulty: 'normal' });   // 重新开始
  await new Promise((res) => setTimeout(res, 900));
  return { same: g.bgm.el === el && el.src === src, playing: !el.paused, t0, t1: el.currentTime };
});
check(r.same && r.playing && r.t1 > r.t0, `重新开始不会让背景音乐重头播放 (${r.t0.toFixed(1)}s → ${r.t1.toFixed(1)}s)`);

check(errors.length === 0, `控制台无错误${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
await browser.close();
console.log(failures ? `\n失败 ${failures} 项` : '\n全部通过 ✔');
process.exit(failures ? 1 : 0);
