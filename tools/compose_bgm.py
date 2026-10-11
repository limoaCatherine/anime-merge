#!/usr/bin/env python3
"""
compose_bgm.py — 程序化作曲并渲染《美少女合成》背景音乐 (原创，无第三方素材，无版权问题)

风格: 轻松可爱的 lo-fi / 八音盒，F 大调，84 BPM，swing 八分音符
编制: 八音盒主旋律 + FM 电钢琴和弦 + 柔和贝斯 + 暖色铺底 + 轻量 lo-fi 鼓 + 极轻黑胶噪声
结构: 8 小节和弦进行 × 3 段 (A 旋律 / B 旋律 / A 旋律 + 高八度点缀) = 24 小节 ≈ 68.6 秒
无缝循环: 多渲染一段尾音，把越过循环点的尾音 (延音、混响) 叠回开头，首尾波形连续

用法 (需要 numpy 与 ffmpeg):
    python tools/compose_bgm.py              # 输出 assets/audio/bgm/bgm_main.ogg 与 bgm_main.mp3
    python tools/compose_bgm.py --preview /path/preview.mp3   # 另存约 20 秒试听
"""
import argparse, os, subprocess, tempfile, wave
import numpy as np

SR = 44100
BPM = 84
BEAT = 60.0 / BPM
BAR = 4 * BEAT
SWING = 0.08            # 反拍八分音符向后推 (拍)
TAIL = 6.0              # 秒，叠回开头的尾音长度
TARGET_LUFS = -22.0     # 成品响度 (1.4 版约 -16.8)；游戏内再乘以 BGM 音量
rng = np.random.default_rng(20261011)

def mtof(m): return 440.0 * 2 ** ((m - 69) / 12)

def sw(beat):
    """swing: 把 x.5 拍的反拍稍微推后"""
    frac = beat % 1.0
    return beat + SWING if abs(frac - 0.5) < 1e-6 else beat

# ---------------- 和声与旋律 ----------------
CHORDS = {
    'Fmaj7':  ([53, 57, 60, 64], 41),
    'Am7':    ([55, 57, 60, 64], 45),
    'Bbmaj7': ([53, 57, 58, 62], 46),
    'C7sus':  ([53, 55, 58, 60], 48),
    'C7':     ([52, 55, 58, 60], 48),
    'Dm7':    ([53, 57, 60, 62], 38),
    'Gm7':    ([53, 55, 58, 62], 43),
}
PROG = [
    [('Fmaj7', 4)], [('Am7', 4)], [('Bbmaj7', 4)], [('C7sus', 2), ('C7', 2)],
    [('Dm7', 4)], [('Gm7', 4)], [('Gm7', 2), ('C7', 2)], [('Fmaj7', 4)],
]
F4, G4, A4, Bb4, C5, D5, E5, F5, G5, A5, E4 = 65, 67, 69, 70, 72, 74, 76, 77, 79, 81, 64
MEL_A = [
    [(0, C5, 1), (1, A4, .5), (1.5, C5, .5), (2, E5, 1.5), (3.5, D5, .5)],
    [(0, C5, 1), (1, A4, 1), (2, G4, 1), (3, E4, 1)],
    [(0, F4, .5), (.5, G4, .5), (1, A4, 1), (2, D5, 1), (3, C5, 1)],
    [(0, Bb4, 1.5), (1.5, A4, .5), (2, G4, 2)],
    [(0, A4, 1), (1, D5, .5), (1.5, E5, .5), (2, F5, 1.5), (3.5, E5, .5)],
    [(0, D5, 1), (1, Bb4, 1), (2, D5, .5), (2.5, C5, .5), (3, Bb4, 1)],
    [(0, A4, 1), (1, G4, 1), (2, E4, 1), (3, G4, 1)],
    [(0, F4, 3), (3.5, C5, .5)],
]
MEL_B = [
    [(0, F5, 2), (2, E5, 1), (3, C5, 1)],
    [(0, E5, 1.5), (1.5, D5, .5), (2, C5, 2)],
    [(0, D5, 1), (1, F5, 1), (2, A5, 2)],
    [(0, G5, 1), (1, F5, 1), (2, E5, 1), (3, C5, 1)],
    [(0, F5, 1.5), (1.5, E5, .5), (2, D5, 1), (3, A4, 1)],
    [(0, Bb4, 1), (1, D5, 1), (2, G5, 1.5), (3.5, F5, .5)],
    [(0, E5, 1), (1, D5, 1), (2, C5, 1), (3, Bb4, 1)],
    [(0, A4, 2), (2, C5, 1), (3.5, C5, .5)],
]

# ---------------- 音色 ----------------
def adsr(n, attack, tau, rel_start, rel=0.12):
    t = np.arange(n) / SR
    env = np.minimum(1.0, t / max(attack, 1e-4)) * np.exp(-t / tau)
    r = np.clip((t - rel_start) / rel, 0, 1)
    return env * (1 - r)

def music_box(f, dur, vel):
    n = int((dur + 1.6) * SR); t = np.arange(n) / SR
    out = np.zeros(n)
    for ratio, amp, tau in ((1.0, 1.0, 0.9), (3.0, 0.22, 0.25), (5.2, 0.07, 0.10)):
        for det in (-0.0012, 0.0012):
            out += amp * np.sin(2 * np.pi * f * ratio * (1 + det) * t) * np.exp(-t / tau)
    att = np.minimum(1.0, t / 0.0015)
    return out * att * vel * 0.5

def epiano(f, dur, vel):
    n = int((dur + 1.2) * SR); t = np.arange(n) / SR
    idx = 1.1 * np.exp(-t / 0.35) + 0.15
    out = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * t))
    out += 0.12 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t / 0.3)
    return out * adsr(n, 0.004, 1.3, dur, 0.25) * vel

def bass(f, dur, vel):
    n = int((dur + 0.3) * SR); t = np.arange(n) / SR
    x = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)
    x = np.tanh(1.4 * x) / np.tanh(1.4)
    return x * adsr(n, 0.008, 0.9, dur, 0.08) * vel

def pad(notes, dur, vel):
    n = int((dur + 1.0) * SR); t = np.arange(n) / SR
    out = np.zeros(n)
    for m in notes:
        f = mtof(m + 12)
        for det in (-0.003, 0.0, 0.003):
            for k in range(1, 6):
                out += np.sin(2 * np.pi * f * k * (1 + det) * t + k) / k ** 1.8
    env = np.minimum(1.0, t / 0.7) * (1 - np.clip((t - dur) / 0.9, 0, 1))
    return out * env * vel / (len(notes) * 3)

def biquad(x, kind, f0, q):
    w = 2 * np.pi * f0 / SR; a = np.sin(w) / (2 * q); c = np.cos(w)
    if kind == 'bp': b = [a, 0, -a]
    elif kind == 'hp': b = [(1 + c) / 2, -(1 + c), (1 + c) / 2]
    else: b = [(1 - c) / 2, 1 - c, (1 - c) / 2]
    a0, a1, a2 = 1 + a, -2 * c, 1 - a
    b = [v / a0 for v in b]; a1 /= a0; a2 /= a0
    y = np.zeros_like(x); x1 = x2 = y1 = y2 = 0.0
    for i, xi in enumerate(x):
        yi = b[0] * xi + b[1] * x1 + b[2] * x2 - a1 * y1 - a2 * y2
        x2, x1, y2, y1 = x1, xi, y1, yi
        y[i] = yi
    return y

def kick():
    n = int(0.35 * SR); t = np.arange(n) / SR
    f = 48 + 70 * np.exp(-t / 0.03)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t / 0.16)

def rim():
    n = int(0.18 * SR); t = np.arange(n) / SR
    x = biquad(rng.standard_normal(n), 'bp', 1900, 1.2) * np.exp(-t / 0.045)
    x += 0.4 * np.sin(2 * np.pi * 330 * t) * np.exp(-t / 0.02)
    return x / np.max(np.abs(x))

def shaker():
    n = int(0.07 * SR); t = np.arange(n) / SR
    x = biquad(rng.standard_normal(n), 'hp', 6500, 0.7)
    env = np.minimum(1, t / 0.006) * np.exp(-t / 0.02)
    x *= env
    return x / np.max(np.abs(x))

# ---------------- 编曲与渲染 ----------------
def render():
    bars = PROG * 3
    L = len(bars) * BAR
    N = int((L + TAIL) * SR)
    dry = {k: np.zeros((N, 2)) for k in ('box', 'ep', 'bass', 'pad', 'drums')}

    def put(bus, sig, t0, pan=0.0, gain=1.0):
        i = int(round(t0 * SR)); j = min(N, i + len(sig))
        if j <= i: return
        s = sig[:j - i] * gain
        dry[bus][i:j, 0] += s * np.cos((pan + 1) * np.pi / 4)
        dry[bus][i:j, 1] += s * np.sin((pan + 1) * np.pi / 4)

    K, R, S = kick(), rim(), shaker()
    for b, bar in enumerate(bars):
        sec, inbar = divmod(b, 8)
        t_bar = b * BAR
        # 和弦: 电钢琴 + 铺底 + 贝斯
        beat = 0
        for name, length in bar:
            notes, root = CHORDS[name]
            t0 = t_bar + beat * BEAT
            hits = [(0, 1.8, 0.55), (2.5, 1.3, 0.38)] if length == 4 else [(0, 1.7, 0.5)]
            for off, d, v in hits:
                for k, m in enumerate(notes):   # 轻微琶音感 (strum)
                    put('ep', epiano(mtof(m), d * BEAT, v * (0.9 + 0.2 * rng.random())), t0 + sw(off) * BEAT + k * 0.012, pan=-0.25)
            put('pad', pad(notes, length * BEAT, 1.0), t0)
            bl = [(0, root, 1.7, 0.9), (2, root, 0.9, 0.7), (3, root + 7, 0.9, 0.6)] if length == 4 else [(0, root, 1.7, 0.85)]
            for off, m, d, v in bl:
                put('bass', bass(mtof(m), d * BEAT, v), t0 + off * BEAT)
            beat += length
        # 旋律: 八音盒
        mel = (MEL_A, MEL_B, MEL_A)[sec][inbar]
        for off, m, d in mel:
            v = 0.75 + 0.2 * rng.random()
            put('box', music_box(mtof(m + 12), d * BEAT, v), t_bar + sw(off) * BEAT, pan=0.2)
            if sec == 2:   # 第三段: 高八度轻点缀
                put('box', music_box(mtof(m + 24), d * BEAT, v * 0.22), t_bar + sw(off) * BEAT + 0.006, pan=0.45)
        # 鼓
        light = (sec == 0 and inbar < 2)
        for e in range(8):
            g = 0.6 if e % 2 == 0 else 0.4
            put('drums', S, t_bar + sw(e / 2) * BEAT, pan=0.35, gain=g * (0.6 if light else 1.0) * (0.85 + 0.3 * rng.random()))
        if not light:
            fill = (b == len(bars) - 1)
            for off, gk in ((0, 1.0), (2.5, 0.7)):
                if not (fill and off > 2):
                    put('drums', K, t_bar + sw(off) * BEAT, gain=gk)
            for off in (1, 3):
                put('drums', R, t_bar + off * BEAT, pan=-0.1, gain=0.8)
            if fill:
                for off in (3.5, 3.75):
                    put('drums', R, t_bar + off * BEAT, pan=0.1, gain=0.45)

    mix = (dry['box'] * 0.30 + dry['ep'] * 0.20 + dry['bass'] * 0.34 + dry['pad'] * 0.05 + dry['drums'] * 0.22)

    # 混响 (指数衰减噪声脉冲响应，FFT 卷积)
    ir_len = int(2.2 * SR); t = np.arange(ir_len) / SR
    ir = rng.standard_normal((ir_len, 2)) * np.exp(-t / 0.5)[:, None]
    for c in range(2):
        ir[:, c] = np.convolve(ir[:, c], np.ones(6) / 6, mode='same')   # 让混响更暗更柔
    ir /= np.sqrt(np.sum(ir ** 2, axis=0))
    send = dry['box'] * 0.30 + dry['ep'] * 0.20 + dry['pad'] * 0.05 + dry['drums'] * 0.05
    nfft = 1 << int(np.ceil(np.log2(N + ir_len)))
    for c in range(2):
        wet = np.fft.irfft(np.fft.rfft(send[:, c], nfft) * np.fft.rfft(ir[:, c], nfft), nfft)[:N]
        mix[:, c] += wet * 0.35

    # 黑胶噪声 (极轻)
    crack = np.zeros(N)
    pos = rng.integers(0, N, int(5 * N / SR))
    crack[pos] = rng.standard_normal(len(pos)) * rng.random(len(pos)) ** 3
    crack = np.diff(crack, prepend=0) * 0.04 + rng.standard_normal(N) * 0.0012
    mix += crack[:, None]

    # 无缝循环: 尾音叠回开头
    Ls = int(round(L * SR))
    out = mix[:Ls].copy()
    out[:N - Ls] += mix[Ls:]

    # 响度: RMS 归一到约 -19 dBFS，柔和限幅
    rms = np.sqrt(np.mean(out ** 2))
    out *= 10 ** (-19 / 20) / rms
    out = np.tanh(out * 1.1) / 1.1
    return out, L

def write_wav(path, x):
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())

def measure_lufs(path):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', path, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
    return float(r.split('Summary:')[1].split('I:')[1].split('LUFS')[0])

def main():
    ap = argparse.ArgumentParser()
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ap.add_argument('--out', default=os.path.join(root, 'assets/audio/bgm'))
    ap.add_argument('--preview', default=None, help='另存约 20 秒的试听 mp3 (含淡出)')
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    x, L = render()
    with tempfile.TemporaryDirectory() as td:
        wav = os.path.join(td, 'bgm.wav')
        write_wav(wav, x)
        # 线性增益校准到目标响度 (不压缩，不影响无缝循环)
        lufs = measure_lufs(wav)
        x = x * 10 ** ((TARGET_LUFS - lufs) / 20)
        write_wav(wav, x)
        print(f'[bgm] 响度 {lufs:.1f} LUFS -> {measure_lufs(wav):.1f} LUFS, 峰值 {20 * np.log10(np.max(np.abs(x))):.1f} dBFS')
        ogg = os.path.join(a.out, 'bgm_main.ogg'); mp3 = os.path.join(a.out, 'bgm_main.mp3')
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', wav, '-c:a', 'libvorbis', '-q:a', '4', ogg], check=True)
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '128k', mp3], check=True)
        if a.preview:
            subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', wav, '-t', '20', '-af', 'afade=t=out:st=17.5:d=2.5',
                            '-c:a', 'libmp3lame', '-b:a', '160k', a.preview], check=True)
    print(f'[bgm] {len(x) / SR:.2f}s ({len(PROG) * 3} 小节 @ {BPM} BPM) -> {ogg}, {mp3}')

if __name__ == '__main__':
    main()
