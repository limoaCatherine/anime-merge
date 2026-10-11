// 桌面版 (Electron) 自动化测试：在 Linux 上运行同一份打包应用 (build/linux-x64)，验证与 Windows 版相同的主进程逻辑。
// 用法: npm run package:linux && xvfb-run -a node tools/test-desktop.mjs [截图路径]
import { _electron as electron } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exe = path.join(root, 'build/linux-x64/anime-merge');
const shot = process.argv[2] || path.join(root, 'desktop-screenshot.png');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 独立的 appData，避免污染本机 (XDG_CONFIG_HOME 决定 Linux 上的 appData)
const cfgHome = fs.mkdtempSync(path.join(os.tmpdir(), 'am-cfg-'));
const env = { ...process.env, XDG_CONFIG_HOME: cfgHome };
let failures = 0;
const check = (c, m) => { console.log(`${c ? '  ✔' : '  ✘'} ${m}`); if (!c) failures++; };

async function launch() {
  const app = await electron.launch({ executablePath: exe, args: ['--no-sandbox'], env });
  const win = await app.firstWindow();
  const errors = [];
  win.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  win.on('pageerror', (e) => errors.push(String(e)));
  await win.waitForFunction(() => window.__ANIME_MERGE__ && window.__ANIME_MERGE__.scenes.currentName === 'menu' && !window.__ANIME_MERGE__.scenes.transitioning, null, { timeout: 15000 });
  return { app, win, errors };
}

async function tap(win, x, y) {
  const p = await win.evaluate(([lx, ly]) => {
    const r = document.getElementById('game').getBoundingClientRect();
    return { x: r.left + (lx / 540) * r.width, y: r.top + (ly / 960) * r.height };
  }, [x, y]);
  await win.mouse.click(p.x, p.y);
}

console.log('\n[desktop] 第一次启动');
let { app, win, errors } = await launch();
const info = await app.evaluate(({ app: a, BrowserWindow, Menu }) => {
  const w = BrowserWindow.getAllWindows()[0];
  const [cw, ch] = w.getContentSize();
  return {
    packaged: a.isPackaged, title: w.getTitle(), visible: w.isVisible(), menu: Menu.getApplicationMenu(),
    size: [cw, ch], userData: a.getPath('userData'), url: w.webContents.getURL(),
    devtools: (() => { w.webContents.openDevTools(); return w.webContents.isDevToolsOpened(); })(),
  };
});
check(info.packaged, '以打包模式运行 (app.isPackaged)');
check(info.title === '美少女合成', `窗口标题: ${info.title}`);
check(info.visible, 'ready-to-show 后窗口可见');
check(info.menu === null, '无菜单栏');
check(Math.abs(info.size[0] / info.size[1] - 9 / 16) < 0.02, `竖屏 9:16 内容区: ${info.size.join('x')}`);
check(info.devtools === false, '打包后无法打开开发者工具');
check(/AnimeMerge$/.test(info.userData), `存档目录: ${info.userData}`);
check(/app\.asar\/dist\/index\.html$/.test(info.url), `从包内加载: ${info.url.replace(/^.*resources/, '…/resources')}`);

const st = await win.evaluate(() => {
  const g = window.__ANIME_MERGE__;
  return { imgs: [...g.assets.images.values()].filter((i) => i instanceof HTMLImageElement && i.naturalWidth > 0).length, voices: g.voice.loadedCount };
});
check(st.imgs === 11 && st.voices === 11, `包内图片 ${st.imgs}/11、语音 ${st.voices}/11 加载成功`);

// 桌面版允许自动播放：未交互时 BGM 已在菜单播放；循环点无缝回到开头继续
await sleep(600);
const bgm0 = await win.evaluate(() => window.__ANIME_MERGE__.bgm.state());
check(bgm0.playing && bgm0.time > 0 && !bgm0.error, `启动即播放 BGM (包内 ${bgm0.src.split('/').pop()}, t=${bgm0.time.toFixed(2)}s, 音量 ${bgm0.volume.toFixed(3)})`);
await win.evaluate(() => { const el = window.__ANIME_MERGE__.bgm.el; el.currentTime = el.duration - 0.4; });
await sleep(1000);
const bgm1 = await win.evaluate(() => window.__ANIME_MERGE__.bgm.state());
check(bgm1.playing && bgm1.time > 0.2 && bgm1.time < 1.5, `BGM 到结尾后循环回开头继续 (t=${bgm1.time.toFixed(2)}s)`);

// 开始游戏 (普通)，问候语音应能自动播放
await tap(win, 270, 548);
await tap(win, 270, 656);
await win.waitForFunction(() => window.__ANIME_MERGE__.scenes.currentName === 'game' && !window.__ANIME_MERGE__.scenes.transitioning, null, { timeout: 8000 });
await sleep(800);
const greet = await win.evaluate(() => window.__ANIME_MERGE__.voice.lastPlay);
check(greet && greet.index === 0 && greet.result === 'audio', `开局问候语音播放: ${JSON.stringify(greet)}`);
for (const x of [150, 380, 260, 200]) { await tap(win, x, 400); await sleep(650); }
await win.evaluate(() => {
  const s = window.__ANIME_MERGE__.scenes.current;
  const r = s.getDef(5).radius;
  s.debugSpawn(5, 270 - r * 0.95, 500); s.debugSpawn(5, 270 + r * 0.95, 500);
});
await sleep(900);
const play = await win.evaluate(() => ({ drops: window.__ANIME_MERGE__.scenes.current.spawn.dropCount, v: window.__ANIME_MERGE__.voice.lastPlay }));
check(play.drops === 4, `鼠标投放 ${play.drops}/4`);
check(play.v && play.v.index === 6 && play.v.result === 'audio', `合成语音播放: ${JSON.stringify(play.v)}`);
await sleep(300);
await win.screenshot({ path: shot });
check(true, `桌面窗口截图: ${shot}`);

// 写入存档
await win.evaluate(() => {
  const g = window.__ANIME_MERGE__;
  g.save.set('difficulty', 'hard');
  g.save.submit(4321, 7, 'normal');
});

// 单实例：再次启动应立即退出并激活已有窗口
const second = spawn(exe, ['--no-sandbox'], { env, stdio: 'ignore' });
const code = await new Promise((resolve) => {
  const t = setTimeout(() => { second.kill(); resolve('timeout'); }, 10000);
  second.on('exit', (c) => { clearTimeout(t); resolve(c); });
});
const count = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
check(code === 0 && count === 1, `单实例锁: 第二个进程退出 (code ${code})，窗口数 ${count}`);
check(errors.length === 0, `控制台无错误${errors.length ? ': ' + errors.join(' | ') : ''}`);
await app.close();

console.log('\n[desktop] 重启后检查存档');
({ app, win, errors } = await launch());
const saved = await win.evaluate(() => ({ hs: window.__ANIME_MERGE__.save.highScore('normal'), diff: window.__ANIME_MERGE__.save.get('difficulty'), menuDiff: window.__ANIME_MERGE__.scenes.current.difficulty }));
check(saved.hs === 4321 && saved.diff === 'hard' && saved.menuDiff === 'hard', `localStorage 跨重启保留: 普通最高分 ${saved.hs}, 难度 ${saved.diff}`);
check(errors.length === 0, '控制台无错误');
await app.close();
fs.rmSync(cfgHome, { recursive: true, force: true });

console.log(failures ? `\n失败 ${failures} 项` : '\n全部通过 ✔');
process.exit(failures ? 1 : 0);
