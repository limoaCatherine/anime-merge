// 贪心机器人模拟：在真实游戏代码 (dist/index.html) 中用固定随机种子跑很多局，统计各难度的
// 平均分 / 存活时间 / 达成目标率，用来检查难度是否"不可能"或"太简单"。
// 用法: npm run build && node tools/bot-sim.mjs [每个难度局数=24] [并行页数=4] [--difficulty hard] [--json out.json]
// 机器人策略 (近似一个认真但不算高手的玩家)：
//   对 31 个候选投放位置，计算角色直落会先碰到谁、落点高度；
//   同级相碰 +1000；落在比自己小的角色上 (压住小的) 扣分；落点越高扣分越多；落点附近有同级 +300。
//   每 1.3 秒投放一次 (普通/困难有倒计时，不会超时)。目标达成后选择「继续挑战」直到堆满或到达上限。
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const GAMES = Number(pos[0] || 24);
const PAR = Number(pos[1] || 4);
const DIFFS = flag('--difficulty', 'easy,normal,hard').split(',');
const OUT = flag('--json', null);
const MAX_TIME = Number(flag('--max-time', 900));   // 每局最多模拟多少秒 (游戏内时间)
const INTERVAL = Number(flag('--interval', 1.3));
const GRAD = Number(flag('--grad', 0.5));
const SET = JSON.parse(flag('--set', '{}'));   // 调参用覆盖，如 '{"hard":{"containerInset":10},"radii":{"10":140}}'

async function runGame(page, difficulty, seed) {
  return page.evaluate(async ({ difficulty, seed, MAX_TIME, INTERVAL, SET, GRAD }) => {
    const g = window.__ANIME_MERGE__;
    if (!g.__simSet) {
      g.__simSet = true;
      for (const [k, v] of Object.entries(SET)) {
        if (k === 'radii') for (const [i, r] of Object.entries(v)) g.characters[i].radius = r;
        else if (k === 'config') Object.assign(g.config, v);
        else Object.assign(g.difficulties[k], v);
      }
    }
    // 冻结主循环的逻辑更新 / 渲染，由这里手动推进
    if (!g.__simPatched) {
      g.__origUpdate = g.scenes.update.bind(g.scenes);
      g.scenes.update = () => {};
      g.scenes.render = () => {};
      g.voice.enabled = false;
      g.__simPatched = true;
    }
    let s0 = seed >>> 0;
    Math.random = () => { s0 = (s0 + 0x6D2B79F5) >>> 0; let t = s0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    g.scenes._swap('game', { difficulty });
    const s = g.scenes.current;
    const dt = 1 / 60;
    let t = 0; let reachedAt = null; let drops = 0; let sinceDrop = INTERVAL;
    const c = s.rules.container;
    const aim = () => {
      const L = s.spawn.current; const R = s.getDef(L).radius;
      const bodies = [...s.characters.filter((b) => !b.removed), ...s.obstacles.stones];
      let best = null;
      for (let i = 0; i <= 30; i++) {
        const x = c.left + R + 1 + (c.right - c.left - 2 * R - 2) * i / 30;
        let land = c.bottom - R; let hit = null;
        for (const b of bodies) {
          const rr = R + b.currentRadius; const dx = Math.abs(b.x - x);
          if (dx >= rr) continue;
          const y = b.y - Math.sqrt(rr * rr - dx * dx);
          if (y < land) { land = y; hit = b; }
        }
        let score = -(c.bottom - land) * 0.6;
        if (hit && hit.level === L) score += 1000;
        else if (hit && hit.level >= 0 && hit.level < L) score -= 120 * (L - hit.level);
        else if (hit && hit.level === L + 1) score += 40;
        else if (hit && hit.isStone) score -= 60;
        for (const b of bodies) if (b !== hit && b.level === L && Math.hypot(b.x - x, b.y - land) < R + b.currentRadius + 12) score += 300;
        // "角落策略"：大的放一侧、小的放另一侧，形成由大到小的梯度，便于连锁
        const tx = c.left + (c.right - c.left) * (1 - Math.min(4, L) / 4);
        score -= Math.abs(x - tx) * GRAD;
        if (land - R < 236 + 10) score -= 2000;
        if (!best || score > best.score) best = { x, score };
      }
      return best.x;
    };
    while (t < MAX_TIME) {
      if (s.fsm.is('victory')) {
        if (reachedAt == null) reachedAt = t;
        s.goal.continueEndless(); s.fsm.change('playing');
      }
      if (s.fsm.is('over')) break;
      sinceDrop += dt;
      if (sinceDrop >= INTERVAL && s.spawn.canDrop) {
        const x = aim();
        s.aimX = s.aimTargetX = x;
        if (s.drop()) { drops++; sinceDrop = 0; }
      }
      s.update(dt);
      t += dt;
      if ((Math.round(t * 60) % 600) === 0) await new Promise((r) => setTimeout(r, 0));
    }
    return {
      difficulty, seed, score: s.score.score, time: Math.round(t), drops, over: s.fsm.is('over'),
      maxLevel: s.score.maxLevel + 1, goal: s.goal.hasGoal ? s.goal.goalLevel + 1 : null, reachedAt: reachedAt == null ? null : Math.round(reachedAt),
      stones: s.obstacles.stones.length,
    };
  }, { difficulty, seed, MAX_TIME, INTERVAL, SET, GRAD });
}

const browser = await chromium.launch();
const url = pathToFileURL(path.join(root, 'dist/index.html')).href + '?noads';
const jobs = [];
for (const d of DIFFS) for (let i = 0; i < GAMES; i++) jobs.push({ d, seed: 1000 + i * 7919 });
const results = [];
await Promise.all(Array.from({ length: PAR }, async () => {
  const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
  await page.goto(url);
  await page.waitForFunction(() => window.__ANIME_MERGE__ && window.__ANIME_MERGE__.scenes.currentName === 'menu', null, { timeout: 15000 });
  while (jobs.length) {
    const j = jobs.shift();
    const r = await runGame(page, j.d, j.seed);
    results.push(r);
    process.stdout.write(`  ${r.difficulty.padEnd(6)} seed ${String(r.seed).padStart(6)}: 分数 ${String(r.score).padStart(5)}  时间 ${String(r.time).padStart(4)}s  最高 Lv${r.maxLevel}${r.goal ? `  目标 Lv${r.goal} ${r.reachedAt != null ? '✔ ' + r.reachedAt + 's' : '✘'}` : ''}${r.over ? '' : '  (到达时间上限)'}\n`);
  }
  await page.close();
}));
await browser.close();

console.log('\n难度   局数  平均分  中位分  平均存活  到上限  平均最高级  目标达成率  平均达成时间');
const summary = {};
for (const d of DIFFS) {
  const rs = results.filter((r) => r.difficulty === d);
  const avg = (f) => rs.reduce((a, r) => a + f(r), 0) / rs.length;
  const sc = rs.map((r) => r.score).sort((a, b) => a - b);
  const reached = rs.filter((r) => r.reachedAt != null);
  summary[d] = {
    games: rs.length, avgScore: Math.round(avg((r) => r.score)), medianScore: sc[Math.floor(sc.length / 2)],
    avgTime: Math.round(avg((r) => r.time)), capped: rs.filter((r) => !r.over).length, avgMaxLevel: +avg((r) => r.maxLevel).toFixed(1),
    goalRate: rs[0] && rs[0].goal ? +(reached.length / rs.length).toFixed(2) : null,
    avgReachTime: reached.length ? Math.round(reached.reduce((a, r) => a + r.reachedAt, 0) / reached.length) : null,
  };
  const S = summary[d];
  console.log(`${d.padEnd(6)} ${String(S.games).padStart(4)}  ${String(S.avgScore).padStart(6)}  ${String(S.medianScore).padStart(6)}  ${String(S.avgTime).padStart(6)}s  ${String(S.capped).padStart(5)}  ${String(S.avgMaxLevel).padStart(9)}  ${S.goalRate == null ? '      -   ' : (S.goalRate * 100).toFixed(0).padStart(8) + '%'}  ${S.avgReachTime == null ? '-' : S.avgReachTime + 's'}`);
}
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ summary, results, params: { GAMES, MAX_TIME, INTERVAL } }, null, 1));
