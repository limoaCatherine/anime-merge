// 音量混合：总音量 + 角色语音 / 音效 / 背景音乐 三个声道的滑块值 (持久化到存档 volumes)。
// 实际音量 = 声道 100% 音量 (VoiceConfig.volume / AudioConfig.sfxVolume / AudioConfig.bgm.volume) × 声道滑块 × 总音量。
// AudioSystem / VoiceSystem / BgmSystem 通过 gain(channel) 读取，并监听 mixer:change 实时更新。
import { AudioConfig, MixerConfig } from '../config/AudioConfig.js';
import { VoiceConfig } from '../config/VoiceConfig.js';

const BASE = { voice: VoiceConfig.volume, sfx: AudioConfig.sfxVolume, bgm: AudioConfig.bgm.volume };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class MixerSystem {
  constructor(events, save) {
    this.events = events;
    this.save = save;
    const saved = save.get('volumes', null) || {};
    this.levels = {};
    for (const ch of MixerConfig.channels) {
      const v = Number(saved[ch]);
      this.levels[ch] = Number.isFinite(v) ? clamp(v, 0, MixerConfig.max[ch]) : MixerConfig.defaults[ch];
    }
  }

  /** 声道实际音量 (0..1) */
  gain(channel) {
    return clamp(BASE[channel] * this.levels[channel] * this.levels.master, 0, 1);
  }

  get(channel) { return this.levels[channel]; }

  set(channel, value, persist = true) {
    const v = clamp(Math.round(value / MixerConfig.step) * MixerConfig.step, 0, MixerConfig.max[channel]);
    if (Math.abs(v - this.levels[channel]) < 1e-9) return v;
    this.levels[channel] = v;
    if (persist) this.persist();
    this.events.emit('mixer:change', { channel, levels: { ...this.levels } });
    return v;
  }

  persist() { this.save.set('volumes', { ...this.levels }); }

  reset() {
    for (const ch of MixerConfig.channels) this.levels[ch] = MixerConfig.defaults[ch];
    this.persist();
    this.events.emit('mixer:change', { channel: 'all', levels: { ...this.levels } });
  }
}
