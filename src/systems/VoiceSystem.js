// 语音系统：角色在本局游戏中"第一次登场"时播放她的日语台词 (VOICEVOX 预生成 mp3)，并发出字幕事件。
// - 每局只说一次：已登场的角色再次合成出来时只有普通合成音效 (AudioSystem)，无语音/字幕
//   新的一局 (game:start —— 新游戏 / 重新开始 / 换难度) 时重置
// - 同一时刻多个角色首次登场：先播放最高等级；其余排队，等当前语音结束后依次播放 (过期则丢弃)
// - 更高等级的首次登场可以打断正在播放的低等级语音；两句之间有冷却，不会叠音
// - 通过平台层 createAudio 播放 (浏览器/Electron: HTMLAudioElement；抖音: tt.createInnerAudioContext，文件在分包里)
// - 独立音量 + 独立开关，遵守全局静音；文件加载失败时退回系统语音合成 (仅浏览器 speechSynthesis，ja-JP)
// - 发出 voice:start / voice:end 事件 (BgmSystem 据此在台词播放时压低背景音乐)
import { VOICE_LINES, VoiceConfig } from '../config/VoiceConfig.js';

export class VoiceSystem {
  constructor(events, save, audio, mixer, platform) {
    this.events = events;
    this.platform = platform;
    this.save = save;
    this.audio = audio;              // 用于读取全局静音状态
    this.mixer = mixer;              // 音量由 MixerSystem 决定 (总音量 × 语音声道)
    this.enabled = save.get('voiceOn', true);
    this.clips = [];                 // { el, state: 'loading'|'ready'|'failed'|'unknown' }
    this.introduced = new Set();     // 本局已登场 (已触发台词) 的等级
    this.queue = [];                 // 待播放的首次登场台词 { index, x, y, age }
    this.cooldown = 0;
    this.current = null;             // { index, el }
    this.lastPlay = null;            // 最近一次播放结果 (调试/测试用)
    this.history = [];               // 本局播放过的台词序号 (调试/测试用)

    this.held = false;               // 暂停中：不开始新的台词 (排队的台词等待继续)
    events.on('game:start', (e) => {
      this.resetRun();
      this.introduce(0, e.x, e.y, true); // 开局问候 = 第 1 级角色的首次登场
    });
    events.on('merge', (e) => {
      if (e.level >= VoiceConfig.minLevel) this.introduce(e.level, e.x, e.y);
    });
    events.on('audio:mute', (muted) => { if (muted) this.stop(); });
    // 一局结束 / 离开游戏场景：立刻停止并清空排队的台词 (不会在结算画面或菜单里继续说话)
    events.on('game:over', () => this.cancelAll());
    events.on('game:exit', () => this.cancelAll());
    events.on('game:hold', () => { this.held = true; });
    events.on('game:unhold', () => { this.held = false; });
    events.on('mixer:change', () => { if (this.current && this.current.el) this.current.el.volume = this.volume; });
    // 看广告期间不开始新台词
    events.on('ad:open', () => { this.adHeld = true; this.stop(); });
    events.on('ad:closed', () => { this.adHeld = false; });
    events.on('app:hidden', () => this.stop());
  }

  /** 预加载全部语音，返回 Promise (失败/超时都会 resolve，不阻塞游戏) */
  preload(onProgress = () => {}, timeoutMs = 4000) {
    let done = 0;
    const total = VOICE_LINES.length;
    const tasks = VOICE_LINES.map((line, i) => new Promise((resolve) => {
      const clip = { el: null, state: 'loading' };
      this.clips[i] = clip;
      let settled = false;
      const finish = (state) => {
        if (settled) return;
        settled = true;
        clip.state = state;
        onProgress(++done / total);
        resolve();
      };
      try {
        const el = this.platform && this.platform.createAudio(line.file, { loop: false });
        if (!el) { finish('failed'); return; }
        el.onReady(() => finish('ready'));
        el.onError(() => {
          console.warn(`[VoiceSystem] 语音加载失败，将使用系统语音合成: ${line.file}`);
          finish('failed');
        });
        el.load();
        clip.el = el;
        setTimeout(() => finish('unknown'), timeoutMs); // 未确认也允许尝试播放
      } catch (_) {
        finish('failed');
      }
    }));
    return Promise.all(tasks);
  }

  get loadedCount() {
    return this.clips.filter((c) => c && c.state === 'ready').length;
  }

  get silent() {
    return !this.enabled || this.audio.muted;
  }

  toggle() {
    this.enabled = !this.enabled;
    this.save.set('voiceOn', this.enabled);
    if (!this.enabled) this.stop();
    return this.enabled;
  }

  get volume() {
    return this.mixer ? this.mixer.gain('voice') : VoiceConfig.volume;
  }

  /** 新的一局：清空登场记录与队列 */
  resetRun() {
    this.cancelAll();
    this.introduced.clear();
    this.history = [];
  }

  /** 停止当前台词并丢弃所有排队的台词 */
  cancelAll() {
    this.stop();
    this.queue = [];
    this.cooldown = 0;
    this.held = false;
  }

  isIntroduced(index) {
    return this.introduced.has(index);
  }

  /**
   * 角色登场。只有本局第一次登场才会排队播放台词，返回是否为首次登场。
   */
  introduce(index, x, y, immediate = false) {
    if (!VOICE_LINES[index]) return false;
    if (VoiceConfig.firstTimeOnly && this.introduced.has(index)) return false;
    this.introduced.add(index);
    this.queue.push({ index, x, y, age: immediate ? VoiceConfig.collectWindow : 0 });
    this.events.emit('voice:introduce', { index, x, y });
    return true;
  }

  isPlaying() {
    if (!this.current) return false;
    if (this.current.el) return !this.current.el.paused && !this.current.el.ended;
    return !!(this.platform && this.platform.speaking);
  }

  update(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (!this.queue.length || this.held || this.adHeld) return;
    for (const q of this.queue) q.age += dt;
    this.queue = this.queue.filter((q) => q.age <= VoiceConfig.queueExpire);
    const ready = this.queue.filter((q) => q.age >= VoiceConfig.collectWindow);
    if (!ready.length) return;
    const best = ready.reduce((a, b) => (b.index > a.index ? b : a));
    const playing = this.isPlaying();
    const interrupt = playing && this.current && best.index > this.current.index && best.age < 0.5;
    if (playing && !interrupt) return;           // 等当前语音播完
    if (this.cooldown > 0 && !interrupt) return;
    this.queue = this.queue.filter((q) => q !== best);
    this.play(best.index, best.x, best.y);
  }

  play(index, x, y) {
    const line = VOICE_LINES[index];
    this.stop();
    this.cooldown = VoiceConfig.cooldown;
    this.history.push(index);
    this.events.emit('voice:line', { index, line, x, y, first: true });  // 字幕 (静音时也显示)
    if (this.silent) { this.lastPlay = { index, result: 'muted' }; return; }

    const clip = this.clips[index];
    if (clip && clip.el && clip.state !== 'failed') {
      const el = clip.el;
      this.current = { index, el };
      el.onEnded(() => this.finish(el));
      try {
        el.currentTime = 0;
        el.volume = this.volume;
        const pr = el.play();
        this.lastPlay = { index, result: 'audio-pending' };
        this.events.emit('voice:start', { index });
        if (pr && pr.then) {
          pr.then(() => { this.lastPlay = { index, result: 'audio' }; })
            .catch((err) => {
              this.lastPlay = { index, result: `audio-blocked:${err && err.name}` };
              if (err && err.name !== 'AbortError') this.speak(index);
            });
        }
      } catch (_) {
        this.speak(index);
      }
      return;
    }
    this.speak(index);
  }

  speak(index) {
    try {
      const cur = { index, el: null };
      const u = this.platform && this.platform.speak(VOICE_LINES[index].tts, {
        lang: 'ja-JP',
        voiceHint: /female|nanami|haruka|ayumi|kyoko|mizuki/i,
        rate: VoiceConfig.speechRate,
        pitch: VoiceConfig.speechPitch,
        volume: this.volume,
        onEnd: () => { if (this.current === cur) { this.current = null; this.events.emit('voice:end', { index }); } },
      });
      if (!u) { this.lastPlay = { index, result: 'unsupported' }; return; }
      this.current = cur;
      this.events.emit('voice:start', { index });
      this.lastPlay = { index, result: 'speech' };
    } catch (_) {
      this.lastPlay = { index, result: 'unsupported' };
    }
  }

  /** 音频自然播放结束 */
  finish(el) {
    if (this.current && this.current.el === el) {
      const { index } = this.current;
      this.current = null;
      this.events.emit('voice:end', { index });
    }
  }

  stop() {
    const had = this.current;
    if (this.current && this.current.el) {
      try { this.current.el.pause(); } catch (_) { /* ignore */ }
    } else if (this.current && this.platform) {
      this.platform.cancelSpeech();
    }
    this.current = null;
    if (had) this.events.emit('voice:end', { index: had.index });
  }
}
