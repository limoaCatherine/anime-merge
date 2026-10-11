// 自动化冒烟测试 (Playwright + Chromium 无头浏览器)
// 用法: npm run build && node tools/test.mjs [截图目录]
// 覆盖: 加载/无报错、语音文件存在与播放、难度选择、简单(整理道具)、普通(8秒倒计时自动投放/暂停停表/胜利继续)、
//       困难(4秒倒计时/窄场地/石头生成与碎裂)、合成、最高级大奖、判负、分难度最高分、开发版源码、
//       背景音乐 (首次交互后播放/跨场景连续/开关/静音/隐藏暂停/台词闪避)、默认音量与旧存档设置迁移。
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shotDir = process.argv[2] || root;
const shots = {
  menu: path.join(shotDir, 'anime-merge-menu2.png'),
  hard: path.join(shotDir, 'anime-merge-hard.png'),
  easy: path.join(shotDir, 'anime-merge-easy.png'),
  gameover: path.join(shotDir, 'anime-merge-gameover2.png'),
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(cond, msg) {
  console.log(`${cond ? '  ✔' : '  ✘'} ${msg}`);
  if (!cond) failures++;
}

async function openPage(browser, url) {
  const page = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()}`));
  await page.goto(url);
  return { page, errors };
}

const G = (page, fn, arg) => page.evaluate(fn, arg);
async function waitScene(page, name, timeout = 8000) {
  await page.waitForFunction((n) => {
    const g = window.__ANIME_MERGE__;
    return g && g.scenes.currentName === n && !g.scenes.transitioning;
  }, name, { timeout });
}
async function toPage(page, x, y) {
  return page.evaluate(([lx, ly]) => {
    const r = document.getElementById('game').getBoundingClientRect();
    return { x: r.left + (lx / 540) * r.width, y: r.top + (ly / 960) * r.height };
  }, [x, y]);
}
async function tap(page, x, y) {
  const p = await toPage(page, x, y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.up();
}
const scene = () => window.__ANIME_MERGE__.scenes.current;

async function clearBoard(page) {
  await G(page, () => {
    const s = window.__ANIME_MERGE__.scenes.current;
    [...s.characters].forEach((c) => s.removeCharacter(c));
  });
}

async function testDist(browser) {
  console.log('\n[1] dist/index.html (file://, 双击方式)');
  const voiceFiles = Array.from({ length: 11 }, (_, i) => path.join(root, `dist/assets/audio/voice/voice_${String(i + 1).padStart(2, '0')}.mp3`));
  const sizes = voiceFiles.map((f) => (fs.existsSync(f) ? fs.statSync(f).size : 0));
  check(sizes.every((s) => s > 5000), `11 个语音文件存在于 dist (${sizes.map((s) => Math.round(s / 1024) + 'K').join(' ')})`);

  const url = pathToFileURL(path.join(root, 'dist/index.html')).href + '?noads';
  const { page, errors } = await openPage(browser, url);
  await waitScene(page, 'menu');
  check(true, '加载完成并进入主菜单');
  const load = await G(page, () => {
    const g = window.__ANIME_MERGE__;
    return {
      imgs: [...g.assets.images.values()].filter((i) => i instanceof HTMLImageElement && i.naturalWidth > 0).length,
      voices: g.voice.loadedCount,
      states: g.voice.clips.map((c) => c.state),
    };
  });
  check(load.imgs === 11, `11 张角色图片加载成功 (${load.imgs})`);
  check(load.voices === 11, `11 条语音预加载成功 (${load.states.join(',')})`);
  const bgmFiles = ['ogg', 'mp3'].map((e) => path.join(root, `dist/assets/audio/bgm/bgm_main.${e}`));
  check(bgmFiles.every((f) => fs.existsSync(f) && fs.statSync(f).size > 200000), 'BGM 文件 (ogg + mp3) 存在于 dist');

  // ---- 默认音量 / 背景音乐 ----
  const bgm = () => window.__ANIME_MERGE__.bgm.state();
  let vol = await G(page, () => { const g = window.__ANIME_MERGE__; return { sfx: g.audio.volume, voice: g.voice.volume, bgm: g.bgm.volume, ver: g.save.get('settingsVersion'), lv: g.mixer.levels }; });
  check(vol.sfx === 0.12 && vol.voice === 0.3 && vol.bgm === 0.15 && vol.ver === 3 && vol.lv.master === 1, `默认音量: 语音 ${vol.voice} / 音效 ${vol.sfx} / BGM ${vol.bgm}，总音量 100% (设置版本 ${vol.ver})`);
  let b = await G(page, bgm);
  check(!b.playing, `首次交互前 BGM 不自动播放 (浏览器策略, blocked=${b.blocked})`);

  // ---- 难度选择 ----
  await tap(page, 402, 548); // 困难
  await sleep(300);
  let diff = await G(page, () => window.__ANIME_MERGE__.scenes.current.difficulty);
  check(diff === 'hard', `菜单选择「困难」(${diff})`);
  await sleep(1700);
  b = await G(page, bgm);
  check(b.playing && b.loop && /bgm_main\.ogg$/.test(b.src) && Math.abs(b.duration - 68.57) < 0.2, `首次点击后 BGM 循环播放 (${b.src.split('/').pop()}, ${b.duration.toFixed(2)}s, loop=${b.loop})`);
  check(b.time > 1 && b.volume > 0.1 && b.volume <= 0.15 + 1e-6, `BGM 淡入到低音量 (t=${b.time.toFixed(2)}s, 音量 ${b.volume.toFixed(3)})`);
  // 音量设置面板 (菜单左上角)
  await tap(page, 40, 40);
  await sleep(200);
  let st = await G(page, () => window.__ANIME_MERGE__.scenes.current.showSettings);
  check(st === true, '菜单「音量设置」面板打开');
  const sl = await G(page, () => window.__ANIME_MERGE__.scenes.current.settings.sliders.map((x) => ({ ch: x.channel, x: x.x, y: x.y, w: x.w, max: x.max })));
  const master = sl.find((x) => x.ch === 'master');
  const pA = await toPage(page, master.x + master.w - 4, master.y);
  const pB = await toPage(page, master.x + master.w * 0.5, master.y);
  await page.mouse.move(pA.x, pA.y); await page.mouse.down();
  await page.mouse.move(pB.x, pB.y, { steps: 6 }); await page.mouse.up();
  await sleep(150);
  const bgmS = sl.find((x) => x.ch === 'bgm');
  await tap(page, bgmS.x + bgmS.w * (1.5 / bgmS.max), bgmS.y);   // 音乐 150%
  await sleep(300);
  let mx = await G(page, () => { const g = window.__ANIME_MERGE__; return { lv: g.mixer.levels, sfx: g.audio.volume, voice: g.voice.volume, bgmGain: g.bgm.volume, el: g.bgm.el.volume, saved: g.save.get('volumes') }; });
  check(Math.abs(mx.lv.master - 0.5) < 0.051 && Math.abs(mx.lv.bgm - 1.5) < 0.051 && Math.abs(mx.sfx - 0.12 * mx.lv.master) < 1e-9 && Math.abs(mx.voice - 0.3 * mx.lv.master) < 1e-9,
    `拖动滑块: 总音量 ${Math.round(mx.lv.master * 100)}%, 音乐 ${Math.round(mx.lv.bgm * 100)}% → 语音 ${mx.voice.toFixed(3)} / 音效 ${mx.sfx.toFixed(3)} / BGM ${mx.bgmGain.toFixed(3)}`);
  check(mx.saved && Math.abs(mx.saved.master - mx.lv.master) < 1e-9 && Math.abs(mx.el - mx.bgmGain) < 0.02, `音量设置已保存且实时作用于 BGM (元素音量 ${mx.el.toFixed(3)})`);
  await page.screenshot({ path: path.join(shotDir, 'anime-merge-settings.png') });
  await tap(page, 270 - 92, 410 + 392);   // 恢复默认
  await sleep(150);
  mx = await G(page, () => window.__ANIME_MERGE__.mixer.levels);
  check(mx.master === 1 && mx.bgm === 1 && mx.voice === 1 && mx.sfx === 1, '「恢复默认」→ 全部 100%');
  await tap(page, 270 + 92, 410 + 392);   // 完成
  await sleep(150);
  st = await G(page, () => window.__ANIME_MERGE__.scenes.current.showSettings);
  check(st === false, '「完成」关闭音量设置');
  // 菜单「音乐」开关
  await tap(page, 332, 738);
  await sleep(150);
  let b2 = await G(page, () => ({ ...window.__ANIME_MERGE__.bgm.state(), saved: window.__ANIME_MERGE__.save.get('bgmOn'), label: window.__ANIME_MERGE__.scenes.current.bgmBtn.label }));
  check(!b2.playing && b2.saved === false && b2.label === '音乐：关', `菜单「音乐：关」→ BGM 暂停并保存 (${b2.label})`);
  await tap(page, 332, 738);
  await sleep(300);
  b = await G(page, bgm);
  check(b.playing && b.time >= b2.time, `「音乐：开」→ 从原位置继续播放 (${b2.time.toFixed(2)}s → ${b.time.toFixed(2)}s)`);
  // 全局静音
  await tap(page, 500, 40);
  await sleep(150);
  b2 = await G(page, bgm);
  await tap(page, 500, 40);
  await sleep(300);
  b = await G(page, bgm);
  check(!b2.playing && b.playing, `全局静音时 BGM 暂停，取消静音后恢复 (${b2.playing} → ${b.playing})`);
  // 窗口隐藏 (最小化/切到后台)
  await G(page, () => window.__ANIME_MERGE__.events.emit('app:hidden'));
  b2 = await G(page, bgm);
  await G(page, () => window.__ANIME_MERGE__.events.emit('app:visible'));
  await sleep(300);
  b = await G(page, bgm);
  check(!b2.playing && b.playing, `窗口隐藏时 BGM 暂停，回来后继续 (${b2.playing} → ${b.playing})`);
  await sleep(400);
  await page.screenshot({ path: shots.menu });
  check(true, `菜单截图: ${shots.menu}`);
  await tap(page, 456, 738); // 制作人员
  await sleep(300);
  const cr = await G(page, () => window.__ANIME_MERGE__.scenes.current.showCredits);
  await page.screenshot({ path: path.join(shotDir, 'anime-merge-credits.png') });
  check(cr === true, '「制作人员」面板打开 (语音署名)');
  await tap(page, 270, 900); // 关闭
  await sleep(200);
  await tap(page, 138, 548); // 简单
  await sleep(200);
  diff = await G(page, () => window.__ANIME_MERGE__.save.get('difficulty'));
  check(diff === 'easy', `菜单选择「简单」并保存 (${diff})`);

  // ================= 简单 =================
  console.log('  -- 简单 --');
  const before = await G(page, () => { window.__bgmEl = window.__ANIME_MERGE__.bgm.el; return window.__ANIME_MERGE__.bgm.state(); });
  await tap(page, 270, 656);
  await waitScene(page, 'game');
  await sleep(150);
  b = await G(page, () => ({ ...window.__ANIME_MERGE__.bgm.state(), same: window.__ANIME_MERGE__.bgm.el === window.__bgmEl }));
  check(b.same && b.playing && b.time > before.time, `菜单 → 游戏：BGM 连续播放不重新开始 (${before.time.toFixed(2)}s → ${b.time.toFixed(2)}s)`);
  check(b.voiceActive && b.duck < 0.85, `开局问候台词播放时 BGM 闪避 (系数 ${b.duck.toFixed(2)}, 音量 ${b.volume.toFixed(3)})`);
  await page.waitForFunction(() => !window.__ANIME_MERGE__.voice.isPlaying(), null, { timeout: 6000 });
  await sleep(1800);
  b = await G(page, bgm);
  check(!b.voiceActive && b.duck > 0.9, `台词结束后 BGM 恢复 (系数 ${b.duck.toFixed(2)}, 音量 ${b.volume.toFixed(3)})`);
  let info = await G(page, () => { const s = window.__ANIME_MERGE__.scenes.current; return { id: s.rules.id, timer: s.dropTimer.enabled, w: s.spawn.weights.length, uses: s.items.uses }; });
  check(info.id === 'easy' && !info.timer && info.w === 4 && info.uses === 3, `简单规则: 无倒计时, 出 1~${info.w} 级, 整理 ${info.uses} 次`);

  await G(page, () => {
    const g = window.__ANIME_MERGE__;
    window.__ev = { merges: [], max: 0, ticks: [], tidy: 0, stoneSpawn: 0, stoneHit: 0, stoneBreak: 0, goal: 0, voice: [] };
    g.events.on('merge', (e) => window.__ev.merges.push(e.level));
    g.events.on('merge:max', () => window.__ev.max++);
    g.events.on('timer:tick', (e) => window.__ev.ticks.push(e.seconds));
    g.events.on('item:tidy', () => window.__ev.tidy++);
    g.events.on('stone:spawn', () => window.__ev.stoneSpawn++);
    g.events.on('stone:hit', () => window.__ev.stoneHit++);
    g.events.on('stone:break', () => window.__ev.stoneBreak++);
    g.events.on('goal:reached', () => window.__ev.goal++);
    g.events.on('voice:line', (e) => window.__ev.voice.push(e.index));
  });

  // 鼠标投放
  const xs = [120, 400, 270, 180, 360, 90];
  for (const x of xs) {
    const p = await toPage(page, x, 400);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.up();
    await sleep(650);
  }
  const dropped = await G(page, () => window.__ANIME_MERGE__.scenes.current.spawn.dropCount);
  check(dropped === xs.length, `鼠标投放 ${dropped}/${xs.length}`);
  await sleep(2600);
  const stillDropped = await G(page, () => window.__ANIME_MERGE__.scenes.current.spawn.dropCount);
  check(stillDropped === dropped, '简单难度不会自动投放');

  // 整理道具
  await clearBoard(page);
  await G(page, () => {
    const s = window.__ANIME_MERGE__.scenes.current;
    [[0, 80], [0, 200], [0, 330], [2, 140], [2, 420]].forEach(([l, x], i) => s.debugSpawn(l, x, 820 - (i % 2) * 90));
  });
  await sleep(900);
  await tap(page, 378, 48);
  await sleep(300);
  info = await G(page, () => { const s = window.__ANIME_MERGE__.scenes.current; return { levels: s.characters.map((c) => c.level), uses: s.items.uses }; });
  check(info.uses === 2 && !info.levels.includes(0), `「整理」移除最小等级: 剩余等级 ${JSON.stringify(info.levels.map((l) => l + 1))}, 剩余次数 ${info.uses}`);

  // 合成 + 语音
  await clearBoard(page);
  await G(page, () => {
    const s = window.__ANIME_MERGE__.scenes.current;
    const r = s.getDef(3).radius;
    s.debugSpawn(3, 270 - r * 0.95, 600);
    s.debugSpawn(3, 270 + r * 0.95, 600);
  });
  await sleep(700);
  let v = await G(page, () => ({ last: window.__ANIME_MERGE__.voice.lastPlay, sub: !!window.__ANIME_MERGE__.scenes.current.subtitles.current, merges: window.__ev.merges }));
  check(v.merges.includes(4), `同级合成: 2×Lv4 -> Lv5 (${JSON.stringify(v.merges.map((l) => l + 1))})`);
  check(v.last && v.last.index === 4 && /^audio/.test(v.last.result), `合成语音播放: voice_05 (${JSON.stringify(v.last)})`);
  check(v.sub, '显示语音字幕气泡');
  // 同一角色第二次合成出来：只有合成音效，没有语音/字幕
  await sleep(2600);
  await clearBoard(page);
  await G(page, () => {
    window.__ev.voice = [];
    window.__ev.merges = [];
    const s = window.__ANIME_MERGE__.scenes.current;
    s.subtitles.current = null; // 1.6 版台词更长，上一条字幕可能还在显示
    const r = s.getDef(3).radius;
    s.debugSpawn(3, 270 - r * 0.95, 600);
    s.debugSpawn(3, 270 + r * 0.95, 600);
  });
  await sleep(900);
  v = await G(page, () => ({ voice: window.__ev.voice, merges: window.__ev.merges, sub: !!window.__ANIME_MERGE__.scenes.current.subtitles.current }));
  check(v.merges.includes(4) && v.voice.length === 0 && !v.sub, `第二次合成出 Lv5：仅合成音效，无语音/字幕 (合成 ${JSON.stringify(v.merges.map((l) => l + 1))}, 语音 ${JSON.stringify(v.voice)})`);

  // 两个角色同时首次登场：先播放最高级，低级排队稍后播放
  await clearBoard(page);
  const fresh = await G(page, () => {
    window.__ev.voice = [];
    const vs = window.__ANIME_MERGE__.voice;
    const s = window.__ANIME_MERGE__.scenes.current;
    // 选两个本局尚未登场的等级 (合成结果)
    const lowRes = [1, 2, 3].find((l) => !vs.isIntroduced(l));
    const pairs = [[lowRes - 1, 120], [5, 380]];
    for (const [l, x] of pairs) {
      const r = s.getDef(l).radius;
      s.debugSpawn(l, x - r * 0.95, 600);
      s.debugSpawn(l, x + r * 0.95, 600);
    }
    return lowRes;
  });
  await sleep(700);
  v = await G(page, () => ({ voice: [...window.__ev.voice] }));
  check(v.voice.length === 1 && v.voice[0] === 6, `同时首次登场：先播放最高级 voice_07 (当前序列 ${JSON.stringify(v.voice.map((i) => i + 1))})`);
  await sleep(300);
  await page.screenshot({ path: shots.easy });
  await sleep(6800); // voice_07 约 5.5 秒 + 间隔
  v = await G(page, () => ({ voice: [...window.__ev.voice] }));
  check(JSON.stringify(v.voice) === JSON.stringify([6, fresh]), `被挤掉的首次登场台词随后播放 (序列 ${JSON.stringify(v.voice.map((i) => i + 1))})`);

  // 重新开始 -> 登场记录重置
  await tap(page, 444, 48);
  await sleep(200);
  await tap(page, 270, 516); // 重新开始
  await waitScene(page, 'game');
  await sleep(300);
  v = await G(page, () => ({ intro: [...window.__ANIME_MERGE__.voice.introduced], hist: window.__ANIME_MERGE__.voice.history }));
  check(JSON.stringify(v.intro) === '[0]' && JSON.stringify(v.hist) === '[0]', `重新开始后登场记录重置，只播放开局问候 (${JSON.stringify(v.intro)})`);
  await G(page, () => {
    window.__ev.voice = [];
    const s = window.__ANIME_MERGE__.scenes.current;
    const r = s.getDef(3).radius;
    s.debugSpawn(3, 270 - r * 0.95, 600);
    s.debugSpawn(3, 270 + r * 0.95, 600);
  });
  await sleep(2500);
  v = await G(page, () => ({ voice: window.__ev.voice, last: window.__ANIME_MERGE__.voice.lastPlay }));
  check(v.voice.includes(4) && v.last && v.last.index === 4 && v.last.result === 'audio', `新一局中 Lv5 再次首次登场并播放语音 (${JSON.stringify(v.last)})`);

  // 最高级合成
  await clearBoard(page);
  const beforeMax = await G(page, () => window.__ANIME_MERGE__.scenes.current.score.score);
  await G(page, () => { const s = window.__ANIME_MERGE__.scenes.current; s.debugSpawn(10, 150, 700); s.debugSpawn(10, 390, 700); });
  await sleep(1500);
  const max = await G(page, () => ({ n: window.__ev.max, score: window.__ANIME_MERGE__.scenes.current.score.score }));
  check(max.n === 1 && max.score - beforeMax >= 1000, `两个「星海女神」合成大奖 +${max.score - beforeMax}`);

  // 判负 (简单: 3 秒)
  await G(page, () => {
    const s = window.__ANIME_MERGE__.scenes.current;
    [9, 8, 7, 6, 9, 8, 7, 6].forEach((l, i) => s.debugSpawn(l, 120 + (i % 2) * 300, 700 - i * 120));
  });
  let over = false;
  for (let i = 0; i < 50 && !over; i++) { await sleep(250); over = (await G(page, () => window.__ANIME_MERGE__.scenes.currentName)) === 'gameover'; }
  check(over, '越过警戒线后进入结算场景');
  await sleep(1200);
  await page.screenshot({ path: shots.gameover });
  let saveData = await G(page, () => JSON.parse(localStorage.getItem('animeMerge.save.v1') || '{}'));
  check(saveData.highScores && saveData.highScores.easy > 0, `简单最高分单独保存: ${JSON.stringify(saveData.highScores)}`);
  await tap(page, 270, 780); // 返回菜单
  await waitScene(page, 'menu');

  // ================= 普通 =================
  console.log('  -- 普通 --');
  await tap(page, 270, 548);
  await tap(page, 270, 656);
  await waitScene(page, 'game');
  info = await G(page, () => { const s = window.__ANIME_MERGE__.scenes.current; return { id: s.rules.id, dur: s.dropTimer.duration, w: s.spawn.weights.length, goal: s.goal.goalLevel }; });
  check(info.id === 'normal' && info.dur === 8 && info.w === 5 && info.goal === 8, `普通规则: ${info.dur}s 倒计时, 出 1~${info.w} 级, 目标 Lv${info.goal + 1}`);
  await G(page, () => { window.__ev.ticks = []; });
  const aim = await toPage(page, 140, 400);
  await page.mouse.move(aim.x, aim.y); // 只瞄准不点击
  await sleep(8900);
  info = await G(page, () => { const s = window.__ANIME_MERGE__.scenes.current; return { drops: s.spawn.dropCount, x: s.characters[0] && Math.round(s.characters[0].x), ticks: window.__ev.ticks }; });
  check(info.drops === 1, `8 秒倒计时结束自动投放 (投放数 ${info.drops}, x≈${info.x}, 瞄准 140)`);
  check(JSON.stringify(info.ticks.slice(0, 3)) === '[3,2,1]', `最后 3 秒滴答提示 ${JSON.stringify(info.ticks)}`);
  // 暂停停表
  await sleep(1500);
  await tap(page, 444, 48);
  const r1 = await G(page, () => window.__ANIME_MERGE__.scenes.current.dropTimer.remaining);
  await sleep(1500);
  const r2 = await G(page, () => ({ rem: window.__ANIME_MERGE__.scenes.current.dropTimer.remaining, st: window.__ANIME_MERGE__.scenes.current.fsm.name }));
  check(r2.st === 'paused' && Math.abs(r1 - r2.rem) < 0.001, `暂停时倒计时停止 (${r1.toFixed(2)}s -> ${r2.rem.toFixed(2)}s)`);
  // 暂停面板的 语音 / 音乐 开关
  await tap(page, 270, 684);
  await sleep(150);
  let pb = await G(page, () => { const g = window.__ANIME_MERGE__; return { on: g.bgm.enabled, playing: g.bgm.playing, label: g.scenes.current.bgmToggle.label }; });
  await tap(page, 270, 684);
  await sleep(150);
  let pb2 = await G(page, () => ({ on: window.__ANIME_MERGE__.bgm.enabled, playing: window.__ANIME_MERGE__.bgm.playing }));
  check(!pb.on && !pb.playing && pb.label === '音乐：关' && pb2.on && pb2.playing, `暂停面板「音乐」开关 (${pb.label} → 开)`);
  await tap(page, 166, 684);
  await sleep(100);
  pb = await G(page, () => ({ on: window.__ANIME_MERGE__.voice.enabled, label: window.__ANIME_MERGE__.scenes.current.voiceToggle.label }));
  await tap(page, 166, 684);
  await sleep(100);
  pb2 = await G(page, () => window.__ANIME_MERGE__.voice.enabled);
  check(!pb.on && pb.label === '语音：关' && pb2, `暂停面板「语音」开关 (${pb.label} → 开)`);
  // 暂停面板「音量」→ 音量设置
  await tap(page, 374, 684);
  await sleep(150);
  const ps = await G(page, () => { const s = window.__ANIME_MERGE__.scenes.current; return { open: s.showSettings, n: s.activeButtons().length, sl: s.settings.slider('voice') }; });
  const vp = await toPage(page, ps.sl.x + ps.sl.w * (0.5 / ps.sl.max), ps.sl.y);
  await page.mouse.move(vp.x, vp.y); await page.mouse.down(); await page.mouse.up();
  await sleep(100);
  const pv = await G(page, () => ({ lv: window.__ANIME_MERGE__.mixer.get('voice'), v: window.__ANIME_MERGE__.voice.volume }));
  await page.screenshot({ path: path.join(shotDir, 'anime-merge-pause.png') });
  check(ps.open && Math.abs(pv.lv - 0.5) < 0.051 && Math.abs(pv.v - 0.15) < 0.016, `暂停面板「音量」打开设置，语音滑块 ${Math.round(pv.lv * 100)}% → 音量 ${pv.v.toFixed(3)}`);
  await G(page, () => window.__ANIME_MERGE__.mixer.reset());
  await tap(page, 270 + 92, 270 + 392);   // 完成
  await sleep(100);
  await tap(page, 270, 430); // 继续
  await sleep(200);
  // 胜利：合成月之公主
  await clearBoard(page);
  await G(page, () => { const s = window.__ANIME_MERGE__.scenes.current; const r = s.getDef(7).radius; s.debugSpawn(7, 270 - r * 0.95, 700); s.debugSpawn(7, 270 + r * 0.95, 700); });
  await sleep(1600);
  info = await G(page, () => ({ st: window.__ANIME_MERGE__.scenes.current.fsm.name, goal: window.__ev.goal }));
  check(info.st === 'victory' && info.goal === 1, `合成「月之公主」-> 胜利画面 (${info.st})`);
  await tap(page, 270, 600); // 继续挑战
  await sleep(300);
  info = await G(page, () => ({ st: window.__ANIME_MERGE__.scenes.current.fsm.name, endless: window.__ANIME_MERGE__.scenes.current.goal.endless, cleared: window.__ANIME_MERGE__.save.isCleared('normal') }));
  check(info.st === 'playing' && info.endless && info.cleared, '选择「继续挑战」进入无尽模式，通关记录已保存');
  // 返回菜单
  await tap(page, 444, 48);
  await sleep(200);
  await tap(page, 270, 602);
  await waitScene(page, 'menu');
  saveData = await G(page, () => JSON.parse(localStorage.getItem('animeMerge.save.v1') || '{}'));
  check(saveData.highScores.normal > 0 && saveData.highScores.easy > 0, `分难度最高分: ${JSON.stringify(saveData.highScores)}`);

  // ================= 困难 =================
  console.log('  -- 困难 --');
  await tap(page, 402, 548);
  await tap(page, 270, 656);
  await waitScene(page, 'game');
  info = await G(page, () => { const s = window.__ANIME_MERGE__.scenes.current; return { id: s.rules.id, dur: s.dropTimer.duration, w: s.rules.container.right - s.rules.container.left, g: s.physics.engine.gravity.y, goal: s.goal.goalLevel, wts: s.spawn.weights }; });
  check(info.id === 'hard' && info.dur === 4 && info.w < 496 && info.goal === 9, `困难规则: ${info.dur}s 倒计时, 场地宽 ${info.w}, 重力 ${info.g.toFixed(2)}, 权重 ${JSON.stringify(info.wts)}, 目标 Lv${info.goal + 1}`);
  await sleep(4900);
  info = await G(page, () => ({ drops: window.__ANIME_MERGE__.scenes.current.spawn.dropCount }));
  check(info.drops === 1, `4 秒倒计时自动投放 (投放数 ${info.drops})`);
  // 石头生成
  await clearBoard(page);
  await G(page, () => window.__ANIME_MERGE__.scenes.current.obstacles.forceNext());
  await sleep(3200);
  info = await G(page, () => { const o = window.__ANIME_MERGE__.scenes.current.obstacles; return { n: o.stones.length, spawn: window.__ev.stoneSpawn, grow: o.stones[0] && o.stones[0].growScale, y: o.stones[0] && Math.round(o.stones[0].y) }; });
  check(info.n === 1 && info.spawn === 1 && info.grow === 1, `石头从底部升起 (数量 ${info.n}, y=${info.y}, 成长 ${info.grow})`);
  // 石头旁合成两次 -> 碎裂
  for (const lv of [0, 2]) {
    await G(page, (l) => {
      const s = window.__ANIME_MERGE__.scenes.current;
      const st = s.obstacles.stones[0];
      if (!st) return;
      const r = s.getDef(l).radius;
      s.debugSpawn(l, st.x - r * 0.9, st.y - st.radius - r * 0.6);
      s.debugSpawn(l, st.x + r * 0.9, st.y - st.radius - r * 0.6);
    }, lv);
    await sleep(1200);
  }
  info = await G(page, () => ({ hit: window.__ev.stoneHit, brk: window.__ev.stoneBreak, n: window.__ANIME_MERGE__.scenes.current.obstacles.stones.length }));
  check(info.hit >= 1 && info.brk === 1 && info.n === 0, `石头邻接合成 2 次后碎裂 (开裂 ${info.hit}, 碎裂 ${info.brk})`);

  // 困难截图：摆一个中局场面 + 石头 + 倒计时环 + 字幕
  await clearBoard(page);
  await G(page, () => {
    const s = window.__ANIME_MERGE__.scenes.current;
    s.obstacles.forceNext();
    const layout = [[8, 150, 780], [6, 380, 800], [5, 290, 640], [4, 440, 640], [3, 100, 600], [2, 200, 520],
      [1, 330, 520], [0, 420, 520], [3, 80, 480], [1, 260, 440], [0, 380, 440]];
    layout.forEach(([l, x, y]) => s.debugSpawn(l, x, y));
  });
  await sleep(2600);
  await G(page, () => {
    const s = window.__ANIME_MERGE__.scenes.current;
    s.dropTimer.reset();
    const r = s.getDef(4).radius;
    s.debugSpawn(4, 230 - r * 0.95, 330); s.debugSpawn(4, 230 + r * 0.95, 330);
  });
  const p = await toPage(page, 330, 400);
  await page.mouse.move(p.x, p.y);
  await sleep(1300);
  await page.screenshot({ path: shots.hard });
  info = await G(page, () => { const s = window.__ANIME_MERGE__.scenes.current; return { stones: s.obstacles.stones.length, sub: !!s.subtitles.current, st: s.fsm.name }; });
  check(info.st === 'playing', `困难截图: ${shots.hard} (石头 ${info.stones}, 字幕 ${info.sub})`);

  check(errors.length === 0, `控制台无错误${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await page.close();
}

async function testDev(browser) {
  console.log('\n[2] 开发版 index.html (ES Module 源码, 本地服务器)');
  const port = 8799;
  const server = spawn(process.execPath, [path.join(root, 'tools/serve.js'), String(port)], { stdio: 'ignore' });
  await sleep(600);
  try {
    const { page, errors } = await openPage(browser, `http://localhost:${port}/index.html?noads`);
    await waitScene(page, 'menu');
    await tap(page, 402, 548);
    await tap(page, 270, 656);
    await waitScene(page, 'game');
    await tap(page, 270, 400);
    await sleep(800);
    const n = await G(page, () => ({ n: window.__ANIME_MERGE__.scenes.current.characters.length, id: window.__ANIME_MERGE__.scenes.current.rules.id, v: window.__ANIME_MERGE__.voice.loadedCount }));
    check(n.n === 1 && n.id === 'hard' && n.v === 11, `源码版可选难度进入游戏并投放 (${n.id}, 语音 ${n.v})`);
    const bs = await G(page, () => window.__ANIME_MERGE__.bgm.state());
    check(bs.playing && !bs.error, `源码版 BGM 播放 (${bs.src})`);
    // 旧版本 (1.3 及以前) 存档：保存过的大音量应被迁移为新的默认值，成绩保留
    await G(page, () => localStorage.setItem('animeMerge.save.v1', JSON.stringify({
      highScores: { normal: 777 }, bestLevels: { normal: 5 }, cleared: {}, games: 3, muted: false, voiceOn: true,
      difficulty: 'hard', voiceVolume: 0.95, sfxVolume: 0.5, bgmVolume: 0.28, settingsVersion: 2,
    })));
    await page.reload();
    await waitScene(page, 'menu');
    const mig = await G(page, () => { const g = window.__ANIME_MERGE__; return { voice: g.voice.volume, sfx: g.audio.volume, bgm: g.bgm.enabled, hs: g.save.highScore('normal'), diff: g.save.get('difficulty'), stored: JSON.parse(localStorage.getItem('animeMerge.save.v1')) }; });
    check(mig.voice === 0.3 && mig.sfx === 0.12 && mig.bgm && mig.hs === 777 && mig.diff === 'hard' && mig.stored.settingsVersion === 3 && !('voiceVolume' in mig.stored) && !('bgmVolume' in mig.stored),
      `旧存档迁移 (v2→v3): 语音 0.95→${mig.voice}, 音效 0.5→${mig.sfx}, 设置版本 ${mig.stored.settingsVersion}, 成绩保留 ${mig.hs}`);
    // 音量设置跨重启保留
    await G(page, () => window.__ANIME_MERGE__.mixer.set('master', 0.6));
    await page.reload();
    await waitScene(page, 'menu');
    const keep = await G(page, () => ({ m: window.__ANIME_MERGE__.mixer.get('master'), v: window.__ANIME_MERGE__.voice.volume }));
    check(Math.abs(keep.m - 0.6) < 1e-9 && Math.abs(keep.v - 0.18) < 1e-9, `音量设置跨重启保留 (总音量 ${Math.round(keep.m * 100)}%, 语音 ${keep.v.toFixed(2)})`);
    check(errors.length === 0, `控制台无错误${errors.length ? ': ' + errors.join(' | ') : ''}`);
    await page.close();
  } finally {
    server.kill();
  }
}

const browser = await chromium.launch({ args: ['--autoplay-policy=user-gesture-required'] });
try {
  await testDist(browser);
  await testDev(browser);
} catch (err) {
  failures++;
  console.error('测试异常:', err);
} finally {
  await browser.close();
}
console.log(failures ? `\n失败 ${failures} 项` : '\n全部通过 ✔');
process.exit(failures ? 1 : 0);
