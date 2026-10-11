// 音频系统：全部音效由 WebAudio 实时合成 (柔和、可爱风格)，无需音频文件。
// 自己订阅玩法事件 (drop / merge / stone:* / timer:tick …)，场景无需关心音效。
// 浏览器要求用户交互后才能出声，因此在第一次点击/按键时解锁。
import { AudioConfig } from '../config/AudioConfig.js';

// 五声音阶 (半音)，合成等级越高音越高，听起来始终和谐
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26];
const C5 = 523.25;
const note = (i) => C5 * Math.pow(2, PENTA[Math.max(0, Math.min(PENTA.length - 1, i))] / 12);

export class AudioSystem {
  constructor(events, save, mixer) {
    this.events = events;
    this.save = save;
    this.ctx = null;
    this.master = null;
    this.mixer = mixer;              // 音量由 MixerSystem 决定 (总音量 × 音效声道)
    this.muted = !!save.get('muted', false);
    this.lastPlay = {};
    events.on('mixer:change', () => {
      if (this.master && !this.muted) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
    });
    events.on('input:down', () => this.unlock());
    events.on('input:key', () => this.unlock());

    // 玩法事件 -> 音效
    events.on('drop', () => this.play('drop'));
    events.on('merge', (e) => this.play('merge', { level: e.level }));
    events.on('merge:max', () => this.play('bonus'));
    events.on('timer:tick', (e) => this.play('tick', { last: e.seconds <= 1 }));
    events.on('danger:warn', () => this.play('warn'));
    events.on('stone:warn', () => this.play('stoneWarn'));
    events.on('stone:spawn', () => this.play('stoneSpawn'));
    events.on('stone:hit', () => this.play('stoneHit'));
    events.on('stone:break', () => this.play('stoneBreak'));
    events.on('item:tidy', () => this.play('tidy'));
    events.on('goal:reached', () => this.play('victory'));
    events.on('game:over', (e) => { this.play('gameover'); if (e.isNewRecord) this.play('record'); });
  }

  get volume() {
    return this.mixer ? this.mixer.gain('sfx') : AudioConfig.sfxVolume;
  }

  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : this.volume;
        const comp = this.ctx.createDynamicsCompressor();
        this.master.connect(comp);
        comp.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (err) {
      console.warn('[AudioSystem] 无法初始化音频:', err);
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    this.save.set('muted', this.muted);
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.02);
    this.events.emit('audio:mute', this.muted);
    return this.muted;
  }

  get ready() {
    return this.ctx && this.master && !this.muted;
  }

  tone({ freq = 440, freqEnd = null, type = 'sine', dur = 0.15, vol = 0.3, delay = 0, attack = 0.006 }) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur * 0.8);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  noise({ dur = 0.12, vol = 0.2, freq = 1800, q = 1, delay = 0, type = 'bandpass' }) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = type; filter.frequency.value = freq; filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter); filter.connect(g); g.connect(this.master);
    src.start(t);
  }

  /** 一串细碎的高音"闪光" */
  sparkle(count = 3, delay = 0, vol = 0.035) {
    for (let k = 0; k < count; k++) {
      this.tone({ freq: 2600 + Math.random() * 1800, type: 'sine', dur: 0.09, vol, delay: delay + k * 0.045, attack: 0.002 });
    }
  }

  /** 播放命名音效 */
  play(name, opts = {}) {
    if (!this.ready) return;
    // 同名音效节流，避免连锁合成时爆音
    const now = this.ctx.currentTime;
    if (this.lastPlay[name] && now - this.lastPlay[name] < 0.035) return;
    this.lastPlay[name] = now;

    switch (name) {
      case 'click':
        this.tone({ freq: 990, freqEnd: 1480, type: 'sine', dur: 0.07, vol: 0.14, attack: 0.002 });
        break;
      case 'drop':
        // 泡泡般的 "啵"
        this.tone({ freq: 380, freqEnd: 820, type: 'sine', dur: 0.09, vol: 0.2, attack: 0.003 });
        this.tone({ freq: 1250, freqEnd: 1500, type: 'sine', dur: 0.05, vol: 0.05, delay: 0.035, attack: 0.002 });
        break;
      case 'merge': {
        const level = opts.level || 1;
        const f = note(level);
        // 轻 "啵" + 铃声 + 五度和声 + 闪光
        this.tone({ freq: 320, freqEnd: 680, type: 'sine', dur: 0.06, vol: 0.1, attack: 0.002 });
        this.tone({ freq: f, type: 'sine', dur: 0.42, vol: 0.2, attack: 0.004 });
        this.tone({ freq: f * 2.01, type: 'sine', dur: 0.26, vol: 0.06, attack: 0.003 });
        this.tone({ freq: f * 1.5, type: 'triangle', dur: 0.3, vol: 0.07, delay: 0.06 });
        this.sparkle(2 + Math.floor(level / 3), 0.06);
        break;
      }
      case 'bonus':
      case 'victory': {
        const seq = name === 'bonus' ? [0, 2, 3, 5, 7, 9] : [0, 3, 5, 7, 5, 7, 9, 10];
        seq.forEach((n, i) => {
          this.tone({ freq: note(n), type: 'sine', dur: 0.35, vol: 0.17, delay: i * 0.09 });
          this.tone({ freq: note(n) * 2, type: 'sine', dur: 0.2, vol: 0.04, delay: i * 0.09 });
        });
        this.sparkle(8, 0.2, 0.04);
        break;
      }
      case 'start':
        [0, 2, 4].forEach((n, i) => this.tone({ freq: note(n), type: 'sine', dur: 0.22, vol: 0.16, delay: i * 0.08 }));
        this.sparkle(3, 0.24);
        break;
      case 'gameover':
        [4, 3, 2, 0].forEach((n, i) => this.tone({ freq: note(n) * 0.75, freqEnd: note(n) * 0.72, type: 'sine', dur: 0.36, vol: 0.18, delay: i * 0.17 }));
        break;
      case 'record':
        [5, 7, 9, 12].forEach((n, i) => this.tone({ freq: note(Math.min(11, n)), type: 'sine', dur: 0.28, vol: 0.15, delay: 0.75 + i * 0.09 }));
        this.sparkle(5, 1.1);
        break;
      case 'warn':
        this.tone({ freq: 880, freqEnd: 740, type: 'sine', dur: 0.1, vol: 0.06 });
        break;
      case 'tick':
        // 木鱼般的 "嗒"，最后一秒更高
        this.tone({ freq: opts.last ? 1760 : 1320, type: 'sine', dur: 0.06, vol: 0.13, attack: 0.002 });
        this.tone({ freq: opts.last ? 3520 : 2640, type: 'sine', dur: 0.03, vol: 0.03, attack: 0.001 });
        break;
      case 'tidy':
        this.tone({ freq: 420, freqEnd: 1680, type: 'sine', dur: 0.32, vol: 0.14 });
        this.sparkle(6, 0.15);
        break;
      case 'stoneWarn':
        this.tone({ freq: 220, freqEnd: 180, type: 'triangle', dur: 0.25, vol: 0.08 });
        break;
      case 'stoneSpawn':
        this.noise({ dur: 0.6, vol: 0.12, freq: 180, q: 0.8, type: 'lowpass' });
        this.tone({ freq: 110, freqEnd: 70, type: 'sine', dur: 0.5, vol: 0.12 });
        break;
      case 'stoneHit':
        this.noise({ dur: 0.1, vol: 0.14, freq: 900, q: 1.5 });
        this.tone({ freq: 240, freqEnd: 180, type: 'triangle', dur: 0.12, vol: 0.08 });
        break;
      case 'stoneBreak':
        this.noise({ dur: 0.35, vol: 0.22, freq: 650, q: 0.8 });
        this.tone({ freq: 160, freqEnd: 60, type: 'sine', dur: 0.35, vol: 0.14 });
        this.sparkle(4, 0.12);
        break;
      default:
        break;
    }
  }
}
