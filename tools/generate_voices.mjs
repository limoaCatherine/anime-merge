// 合成角色语音 -> assets/audio/voice/voice_XX.mp3
// 台词、引擎、模型/说话人、调校参数的单一数据源: src/config/VoiceConfig.js
//
// 引擎 (每句 voice.engine 指定):
//   aivisspeech  AivisSpeech Engine (Style-Bert-VITS2 系，默认 http://127.0.0.1:10101)
//                Windows: 安装并启动 AivisSpeech 即可；Linux: AivisSpeech-Engine-Linux-x64/run --port 10101
//                缺少的模型会自动从 AivisHub 安装 (voice.modelUuid；全部为 ACML 1.0 商用可)
//   voicevox     VOICEVOX Engine (默认 http://127.0.0.1:50021)
// 另需 ffmpeg 在 PATH 中 (裁剪静音、EQ、齿音抑制、响度统一到 -20 LUFS、转 mp3)
//
// 用法: node tools/generate_voices.mjs [--aivis http://127.0.0.1:10101] [--voicevox http://127.0.0.1:50021] [--only 3,5]
//       node tools/generate_voices.mjs --takes 6 --out build/voice-takes   # 每句生成多个候选 (AivisSpeech 每次结果略有不同)
//       python tools/pick_voice_takes.py build/voice-takes                # 用语音识别挑出读音最准确的一条，复制到 assets
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const ENGINES = {
  aivisspeech: opt('--aivis', 'http://127.0.0.1:10101'),
  voicevox: opt('--voicevox', opt('--engine', 'http://127.0.0.1:50021')),
};
const ONLY = opt('--only', '') ? opt('--only').split(',').map(Number) : null;
const TAKES = Math.max(1, Number(opt('--takes', 1)));
const OUT = opt('--out', null);
const TARGET_LUFS = -20;

async function loadConfig() {
  // VoiceConfig.js 是浏览器用的 ES 模块；复制成 .mjs 再导入，避免 package.json type 影响
  const src = await fs.readFile(path.join(root, 'src/config/VoiceConfig.js'), 'utf8');
  const tmp = path.join(os.tmpdir(), `voiceconfig-${process.pid}.mjs`);
  await fs.writeFile(tmp, src);
  const mod = await import(pathToFileURL(tmp).href);
  await fs.rm(tmp, { force: true });
  return mod.VOICE_LINES;
}

async function post(url, body, form) {
  const res = await fetch(url, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: form || (body ? JSON.stringify(body) : undefined),
  });
  if (!res.ok) throw new Error(`${res.status} ${url}: ${await res.text()}`);
  return res;
}

/** AivisSpeech：确保模型已安装 (缺少时从 AivisHub 安装) */
async function ensureAivisModel(base, v, installed) {
  if (installed.has(v.modelUuid)) return;
  console.log(`  安装 AivisHub 模型 ${v.model} (${v.modelUuid}) ...`);
  const form = new FormData();
  form.append('url', `https://api.aivis-project.com/v1/aivm-models/${v.modelUuid}/download?model_type=AIVMX`);
  await post(`${base}/aivm_models/install`, null, form);
  installed.add(v.modelUuid);
}

async function synth(line, installed) {
  const v = line.voice;
  const engine = v.engine || 'voicevox';
  const base = ENGINES[engine];
  if (engine === 'aivisspeech') await ensureAivisModel(base, v, installed);
  const q = await (await post(`${base}/audio_query?${new URLSearchParams({ text: line.tts, speaker: v.styleId })}`)).json();
  q.speedScale = v.speed ?? 1;
  q.intonationScale = v.intonation ?? 1;   // AivisSpeech: 风格(感情)强度；VOICEVOX: 抑扬
  q.volumeScale = 1;
  if (engine === 'aivisspeech') {
    q.tempoDynamicsScale = v.tempo ?? 1;   // 语速缓急 (越大越"生")
    q.pitchScale = v.pitch ?? 0;           // AivisSpeech: 只做 ±0.03 以内的微调 (过大会劣化音质)
  } else {
    q.pitchScale = v.pitch ?? 0;
    // VOICEVOX 部分声线默认停顿很长 (>1 秒)，钳制为自然长度
    for (const ap of q.accent_phrases) {
      if (ap.pause_mora) ap.pause_mora.vowel_length = Math.min(ap.pause_mora.vowel_length, 0.22 * (v.pause ?? 1));
    }
  }
  // 1.7：句首/句尾留白尽量短 (原 0.1 / 0.15 秒)，听起来更干脆
  q.prePhonemeLength = v.pre ?? 0.05;
  q.postPhonemeLength = v.post ?? 0.1;
  q.outputSamplingRate = 44100;
  q.outputStereo = false;
  const wav = Buffer.from(await (await post(`${base}/synthesis?speaker=${v.styleId}`, q)).arrayBuffer());
  return { wav, kana: q.kana };
}

/** 后期: 裁首尾静音 → 把句中超过 0.15 秒的停顿压缩到 0.1 秒 → 低切 100Hz → 轻微削减 3~5kHz 刺耳频段 → 齿音抑制 → (女神) 轻混响 → 响度 -20 LUFS → 淡入/尾部留白 */
function encode(wavPath, mp3Path, reverb) {
  const chain = [
    'silenceremove=start_periods=1:start_threshold=-50dB',
    'areverse', 'silenceremove=start_periods=1:start_threshold=-50dB', 'areverse',
    // 句中停顿 (「…」「、」处) 过长会显得机械：超过 0.15 秒的静音压缩为 0.1 秒
    'silenceremove=stop_periods=-1:stop_duration=0.15:stop_threshold=-40dB:stop_silence=0.1',
    'highpass=f=100',
    'equalizer=f=4000:t=q:w=1.2:g=-2',
    'deesser=i=0.35:m=0.5:f=0.5',
    reverb ? 'aecho=0.8:0.55:45|95:0.18|0.10' : null,
    `loudnorm=I=${TARGET_LUFS}:TP=-3:LRA=11`,
    'adelay=30',
    'afade=t=in:d=0.01',
    'apad=pad_dur=0.08',
  ].filter(Boolean).join(',');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wavPath, '-af', chain, '-ar', '44100', '-ac', '1', '-b:a', '96k', mp3Path]);
}

async function main() {
  const lines = await loadConfig();
  const used = new Set(lines.map((l) => l.voice.engine || 'voicevox'));
  const installed = new Set();
  for (const e of used) {
    const ver = await (await fetch(`${ENGINES[e]}/version`)).text().catch(() => null);
    if (!ver) throw new Error(`无法连接 ${e} 引擎: ${ENGINES[e]}`);
    console.log(`${e} engine ${ver} @ ${ENGINES[e]}`);
    if (e === 'aivisspeech') Object.keys(await (await fetch(`${ENGINES[e]}/aivm_models`)).json()).forEach((u) => installed.add(u));
  }
  const outDir = path.join(root, 'assets/audio/voice');
  await fs.mkdir(outDir, { recursive: true });
  for (let i = 0; i < lines.length; i++) {
    if (ONLY && !ONLY.includes(i + 1)) continue;
    const line = lines[i];
    for (let k = 1; k <= TAKES; k++) {
      const { wav, kana } = await synth(line, installed);
      const wavPath = path.join(os.tmpdir(), `voice_${i + 1}.wav`);
      await fs.writeFile(wavPath, wav);
      let dest = path.join(root, line.file);
      if (OUT) {
        await fs.mkdir(path.resolve(root, OUT), { recursive: true });
        dest = path.resolve(root, OUT, path.basename(line.file).replace('.mp3', `_take${k}.mp3`));
      }
      encode(wavPath, dest, line.voice.reverb);
      await fs.rm(wavPath, { force: true });
      console.log(`ok ${String(i + 1).padStart(2, '0')}${TAKES > 1 ? ` take${k}` : ''} ${line.voice.engine}:${line.voice.speaker}(${line.voice.style}) ${kana}`);
    }
  }
}

main().catch((err) => { console.error(err.message || err); process.exit(1); });
