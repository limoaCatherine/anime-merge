// 把 AudioSystem 的 WebAudio 合成音效「离线渲染」成小 wav (抖音小游戏不保证 WebAudio，用 InnerAudioContext 播放文件)。
// 用的是游戏里同一份合成代码 (src/systems/AudioSystem.js)，在 Chromium 的 OfflineAudioContext 中渲染，
// 输出 assets/audio/sfx/*.wav 与清单 src/config/SfxManifest.js (每个文件的归一化倍数 gain，播放时除回去，保证音量与网页版一致)。
// 用法：node tools/render_sfx.mjs   (需要 playwright 的 chromium 与 ffmpeg)
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { promises as fs } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'assets/audio/sfx');
const tmp = path.join(root, 'build/sfx-tmp');
await fs.mkdir(outDir, { recursive: true });
await fs.mkdir(tmp, { recursive: true });

const entry = path.join(tmp, 'entry.js');
await fs.writeFile(entry, `
import { AudioSystem } from '${path.join(root, 'src/systems/AudioSystem.js').replace(/\\/g, '/')}';
import { AudioConfig } from '${path.join(root, 'src/config/AudioConfig.js').replace(/\\/g, '/')}';
window.SFX_LIST = AudioSystem.sampleList();
window.renderSfx = async (name, opts, seconds, sr) => {
  const ev = { on() { return () => {}; }, emit() {} };
  const save = { get: (k, d) => d, set() {} };
  const mixer = { gain: () => AudioConfig.sfxVolume };
  const sys = new AudioSystem(ev, save, mixer, null);
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * sr), sr);
  sys.muted = false;
  sys.attachContext(ctx, AudioConfig.sfxVolume);   // 与网页版默认音量完全相同的输出链
  sys.play(name, opts);
  const buf = await ctx.startRendering();
  return Array.from(buf.getChannelData(0));
};
`);
const bundle = path.join(tmp, 'bundle.js');
await build({ entryPoints: [entry], bundle: true, format: 'iife', outfile: bundle, logLevel: 'silent' });

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<html><body></body></html>');
await page.addScriptTag({ path: bundle });
const list = await page.evaluate(() => window.SFX_LIST);
const SR = 44100;
const manifest = {};
const POLY = { drop: 2, click: 2 };   // 其余每个音效 1 个播放器 (控制 InnerAudioContext 实例数量，安卓最多同时播放 10 个)
let total = 0;
for (const [key, name, opts, seconds] of list) {
  const data = await page.evaluate(([n, o, s, sr]) => window.renderSfx(n, o, s, sr), [name, opts, seconds, SR]);
  // 去掉尾部静音
  let end = data.length;
  while (end > 1 && Math.abs(data[end - 1]) < 1e-4) end--;
  const s = data.slice(0, Math.min(data.length, end + Math.round(SR * 0.02)));
  let peak = 0;
  for (const v of s) peak = Math.max(peak, Math.abs(v));
  const gain = peak > 0 ? 0.89 / peak : 1;
  const pcm = Buffer.alloc(s.length * 2);
  s.forEach((v, i) => pcm.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * gain * 32767))), i * 2));
  const hdr = Buffer.alloc(44);
  hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write('WAVE', 8); hdr.write('fmt ', 12);
  hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(1, 22); hdr.writeUInt32LE(SR, 24);
  hdr.writeUInt32LE(SR * 2, 28); hdr.writeUInt16LE(2, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(pcm.length, 40);
  const wav = path.join(tmp, `${key}.wav`);
  await fs.writeFile(wav, Buffer.concat([hdr, pcm]));
  // 短音效用 wav (PCM 16bit 单声道 22.05kHz)：没有 mp3 编码器在首尾加的 20~30ms 静音，触发更及时；体积仍很小
  const out = path.join(outDir, `${key}.wav`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-ar', '22050', '-c:a', 'pcm_s16le', out]);
  const size = (await fs.stat(out)).size;
  total += size;
  manifest[key] = { file: `assets/audio/sfx/${key}.wav`, gain: Number(gain.toFixed(3)), ...(POLY[key] ? { poly: POLY[key] } : {}) };
  console.log(`${key.padEnd(12)} ${(s.length / SR).toFixed(2)}s  gain=${gain.toFixed(2)}  ${size} B`);
}
await browser.close();
const js = `// 由 tools/render_sfx.mjs 自动生成 —— 预渲染音效清单 (抖音版使用)。请勿手改。
// gain：渲染时的归一化倍数，播放音量 = 当前音效音量 / (AudioConfig.sfxVolume × gain)；poly：同时可重叠播放的数量
export const SFX_FILES = ${JSON.stringify(manifest, null, 2)};
`;
await fs.writeFile(path.join(root, 'src/config/SfxManifest.js'), js);
console.log(`共 ${list.length} 个音效，${(total / 1024).toFixed(1)} KB -> assets/audio/sfx/`);
