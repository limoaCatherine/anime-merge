// 音频配置：音效 / 背景音乐的默认音量、BGM 文件与闪避 (ducking) 参数。
// 语音相关参数在 VoiceConfig.js。修改默认音量后请同时提升 SaveSystem 的 SETTINGS_VERSION，
// 这样旧版本存档里保存的音量不会覆盖新的默认值。
export const AudioConfig = {
  sfxVolume: 0.12,          // 合成音效 (WebAudio) 的 100% 音量；1.2/1.3 版 0.5 → 1.4 版 0.25 → 1.5 版 0.12
  bgm: {
    // 按顺序选择浏览器能播放的格式：ogg 循环无缝；mp3 作为兜底
    sources: [
      { src: 'assets/audio/bgm/bgm_main.ogg', type: 'audio/ogg; codecs="vorbis"' },
      { src: 'assets/audio/bgm/bgm_main.mp3', type: 'audio/mpeg' },
    ],
    // 抖音 (只有 mp3，循环有空隙)：「一遍 + 开头 4 秒」的 mp3，两个播放器交替 + 交叉淡化实现无缝循环 (tools/make_douyin_bgm.py)
    seamless: { src: 'assets/audio/bgm/bgm_main_loop.mp3', loopLength: 68.571429, crossfade: 0.15, lead: 0.02 },
    title: '星糖午后 (Starlight Sugar Afternoon)',
    volume: 0.15,           // BGM 的 100% 音量 (较低，保证台词清晰)；1.4 版为 0.28
    duck: 0.55,             // 台词播放时 BGM 降到 55% (约 -5 dB)
    duckAttack: 0.12,       // 闪避下降时间常数 (秒)
    duckRelease: 0.6,       // 台词结束后恢复的时间常数 (秒)
    fadeIn: 0.8,            // 开始/恢复播放时的淡入时间常数 (秒)
    maxDuckTime: 8,         // 安全上限：闪避最多持续的秒数
  },
};

// 音量设置 (设置面板的滑块)：实际音量 = 各声道 100% 音量 × 声道滑块 × 总音量滑块
export const MixerConfig = {
  channels: ['master', 'voice', 'sfx', 'bgm'],
  labels: { master: '总音量', voice: '角色语音', sfx: '音效', bgm: '背景音乐' },
  defaults: { master: 1, voice: 1, sfx: 1, bgm: 1 },
  max: { master: 1, voice: 2, sfx: 2, bgm: 2 },   // 声道最多可调到 200%
  step: 0.05,
};
