#!/usr/bin/env python3
"""
pick_voice_takes.py — 从多个候选语音中挑出读音最准确的一条 (类似配音录制时的 "选 take")

AivisSpeech (Style-Bert-VITS2) 每次合成结果略有不同，偶尔会把词读错/含糊。
本脚本用 faster-whisper 语音识别把每个候选转写成文字，与台词 (转平假名后) 比较字符错误率 (CER)，
先按读音准确度筛选 (CER 不超过该句最低 CER + 0.04 的候选视为 "读对了")，
再在其中选 "感情最丰富" 的一条：音高范围 (5~95% 分位，半音) + 音高标准差 + 能量动态 (帧 RMS 的 10~95% 分位差，dB)
三项在该句候选内标准化后求和，分数最高者胜出。音高范围异常 (>20 半音，多为合成故障) 的候选会被排除。

用法:
    node tools/generate_voices.mjs --takes 8 --out build/voice-takes
    pip install faster-whisper pykakasi numpy      # 另需 ffmpeg
    python tools/pick_voice_takes.py build/voice-takes [--model small] [--dry-run]
"""
import argparse, glob, json, os, re, shutil, subprocess, sys
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def load_lines():
    src = open(os.path.join(ROOT, 'src/config/VoiceConfig.js'), encoding='utf8').read()
    return re.findall(r"file: '([^']+)'.*?tts: '([^']+)'", src, re.S)

def pcm16k(path):
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', path, '-ac', '1', '-ar', '16000', '-f', 's16le', '-'], capture_output=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768

def energy_dyn(x):
    fr = x[:len(x) // 400 * 400].reshape(-1, 400).astype(float)
    r = np.sqrt((fr ** 2).mean(1)); r = r[r > 0.01]
    if len(r) < 5: return 0.0
    db = 20 * np.log10(r); return float(np.percentile(db, 95) - np.percentile(db, 10))

def pitch_stats(x, sr=16000):
    """返回 (标准差, 5~95% 范围)，单位：半音"""
    win, hop, f0 = 640, 160, []
    for i in range(0, len(x) - win, hop):
        f = x[i:i + win].astype(float)
        if np.sqrt((f ** 2).mean()) < 0.015: continue
        f -= f.mean(); ac = np.correlate(f, f, 'full')[win - 1:]
        lo, hi = sr // 700, sr // 110; k = lo + int(np.argmax(ac[lo:hi]))
        if ac[k] / ac[0] > 0.45: f0.append(sr / k)
    if len(f0) < 5: return 0.0, 0.0
    v = np.array(f0); s = 12 * np.log2(v / np.median(v))
    return float(s.std()), float(np.percentile(s, 95) - np.percentile(s, 5))

def lufs(path):
    out = subprocess.run(['ffmpeg', '-nostats', '-i', path, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
    vals = re.findall(r'I:\s+(-?[\d.]+) LUFS', out)
    return float(vals[-1]) if vals else None

def fix_loudness(path, target=-20.0, tol=0.6):
    """loudnorm 单次处理对短句会偏差 ±2 LU；这里再按实测值做一次线性增益校正 (带 -3 dBTP 限幅)"""
    i = lufs(path)
    if i is None or abs(i - target) <= tol: return i
    tmp = path + '.tmp.mp3'
    subprocess.run(['ffmpeg', '-v', 'quiet', '-y', '-i', path, '-af', f'volume={target - i:.2f}dB,alimiter=limit=0.708:level=disabled',
                    '-ar', '44100', '-ac', '1', '-b:a', '96k', tmp], check=True)
    os.replace(tmp, path); return lufs(path)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('dir'); ap.add_argument('--model', default='small'); ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--only', default='', help='只处理这些文件名 (逗号分隔，如 voice_07,voice_08)')
    a = ap.parse_args()
    from faster_whisper import WhisperModel
    import pykakasi
    kks = pykakasi.kakasi()
    kana = lambda s: ''.join(t['hira'] for t in kks.convert(re.sub(r'[、。！？…!?♡♪\s「」,.ー〜]', '', s)))
    def cer(ref, hyp):
        d = list(range(len(hyp) + 1))
        for i, c in enumerate(ref, 1):
            p = d[:]; d[0] = i
            for j, h in enumerate(hyp, 1): d[j] = min(p[j] + 1, d[j - 1] + 1, p[j - 1] + (c != h))
        return d[len(hyp)] / max(1, len(ref))
    model = WhisperModel(a.model, device='cpu', compute_type='int8')
    report = []
    for file, tts in load_lines():
        stem = os.path.basename(file).replace('.mp3', '')
        takes = sorted(glob.glob(os.path.join(a.dir, f'{stem}_take*.mp3')))
        if not takes or (a.only and stem not in a.only.split(',')): continue
        scored = []
        for t in takes:
            x = pcm16k(t)
            # 1.7：台词很短 (1.5~3 秒) 且首尾几乎没有留白时 whisper 容易输出空结果，转写前两端各补 0.6 秒静音
            pad = np.zeros(int(16000 * 0.6), np.float32)
            segs, _ = model.transcribe(np.concatenate([pad, x, pad]), language='ja', beam_size=5,
                                      no_speech_threshold=None, log_prob_threshold=None, condition_on_previous_text=False)
            txt = ''.join(s.text for s in segs)
            st, rng = pitch_stats(x)
            scored.append(dict(take=t, cer=round(cer(kana(tts), kana(txt)), 3), asr=txt, st=st, rng=rng, en=energy_dyn(x)))
        ok = [s for s in scored if s['rng'] <= 20] or scored
        best_cer = min(s['cer'] for s in ok)
        ok = [s for s in ok if s['cer'] <= best_cer + 0.04]
        def z(k):
            v = np.array([s[k] for s in ok]); sd = v.std() or 1
            return (v - v.mean()) / sd
        score = z('rng') + z('st') + z('en')
        for s, sc in zip(ok, score): s['emo'] = float(sc)
        best = max(ok, key=lambda s: s['emo'])
        print(f"{stem}: 选 {os.path.basename(best['take'])} CER={best['cer']:.2f} 音高范围={best['rng']:.1f}st 标准差={best['st']:.2f}st 能量动态={best['en']:.1f}dB 「{best['asr']}」"
              f" (候选 CER: {[s['cer'] for s in scored]})")
        report.append({'file': file, 'take': os.path.basename(best['take']), 'cer': best['cer'], 'pitch_range_st': round(best['rng'], 2),
                       'pitch_std_st': round(best['st'], 2), 'energy_dyn_db': round(best['en'], 1), 'asr': best['asr'],
                       'candidates': [{'take': os.path.basename(s['take']), 'cer': s['cer'], 'rng': round(s['rng'], 2), 'st': round(s['st'], 2), 'en': round(s['en'], 1)} for s in scored]})
        best = (None, None, best['take'])
        if not a.dry_run:
            dst = os.path.join(ROOT, file); shutil.copyfile(best[2], dst)
            report[-1]['lufs'] = fix_loudness(dst)
    json.dump(report, open(os.path.join(a.dir, 'picked.json'), 'w'), ensure_ascii=False, indent=1)

if __name__ == '__main__':
    main()
