# 抖音版 BGM：mp3 循环时播放器会在首尾产生短暂空隙 (编码器延迟/补零 + 播放器重启)，iOS 又不支持 ogg。
# 做法：以无缝的 bgm_main.ogg 为母带，生成「完整一遍 + 开头 4 秒」的 mp3 (bgm_main_loop.mp3)。
# BgmSystem 在抖音上用两个 InnerAudioContext 交替播放：A 播到 loopLength (=一遍的长度) 时 B 从 0 开始，
# 此时 A 正在播放追加的那段 (与 B 内容相同)，两者做短交叉淡化，听感上无缝衔接。
#   python3 tools/make_douyin_bgm.py
import json, os, subprocess, tempfile
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
src = os.path.join(root, 'assets/audio/bgm/bgm_main.ogg')
out = os.path.join(root, 'assets/audio/bgm/bgm_main_loop.mp3')
TAIL = 4.0
info = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'stream=sample_rate,duration_ts', '-of', 'json', src]))['streams'][0]
sr = int(info['sample_rate']); n = int(info['duration_ts'])
with tempfile.TemporaryDirectory() as d:
    wav = os.path.join(d, 'loop.wav')
    # 母带 + 开头 TAIL 秒 (aloop 精确按采样数拼接)
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', src, '-af', f'aloop=loop=1:size={n},atrim=end_sample={n + int(TAIL * sr)}', wav], check=True)
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '128k', out], check=True)
print(json.dumps({'file': os.path.relpath(out, root), 'loopLength': round(n / sr, 6), 'tail': TAIL}))
