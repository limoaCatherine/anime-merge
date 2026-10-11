// 存档系统：通过平台层存储 (浏览器 localStorage / 抖音 tt.setStorageSync) 持久化各难度最高分、最高合成等级、通关记录与设置。
// 隐私模式等无法写入时自动退化为内存存储。

// 设置版本：默认音量等设置调整后提升此版本，旧存档中的相关设置会被迁移/丢弃 (成绩不受影响)
export const SETTINGS_VERSION = 3;
const SETTINGS_MIGRATIONS = {
  // v1 (≤1.3.0) -> v2 (1.4.0)：整体音量降低约 6 dB，丢弃旧存档里保存的音量，改用新的默认值
  2: (data) => { delete data.voiceVolume; delete data.sfxVolume; delete data.bgmVolume; },
  // v2 (1.4.0) -> v3 (1.5.0)：默认音量再降低约 40~50%，并改为「总音量 + 各声道」滑块；丢弃旧的音量值
  3: (data) => { delete data.voiceVolume; delete data.sfxVolume; delete data.bgmVolume; delete data.volumes; },
};

export class SaveSystem {
  constructor(key, platform) {
    this.key = key;
    this.platform = platform;
    this.data = {
      highScores: {},    // { easy: 0, normal: 0, hard: 0 }
      bestLevels: {},
      cleared: {},
      games: 0,
      muted: false,
      voiceOn: true,
      bgmOn: true,
      difficulty: 'normal',
    };
    let loaded = false;
    this.available = true;
    try {
      const raw = platform.storageGet(key);
      if (raw) { Object.assign(this.data, JSON.parse(raw)); loaded = true; }
    } catch (err) {
      this.available = false;
      console.warn('[SaveSystem] 存储不可用，存档仅在本次运行中有效');
    }
    // 兼容 1.0 版本的单一最高分 -> 归入"普通"
    if (typeof this.data.highScore === 'number') {
      this.data.highScores.normal = Math.max(this.data.highScores.normal || 0, this.data.highScore);
      if (typeof this.data.bestLevel === 'number') this.data.bestLevels.normal = Math.max(this.data.bestLevels.normal || 0, this.data.bestLevel);
      delete this.data.highScore;
      delete this.data.bestLevel;
      this.flush();
    }
    this.migrateSettings(loaded);
  }

  /** 旧版本存档的设置迁移 (没有 settingsVersion 的存档视为 v1) */
  migrateSettings(loaded) {
    const from = loaded ? (this.data.settingsVersion || 1) : SETTINGS_VERSION;
    for (let v = from + 1; v <= SETTINGS_VERSION; v++) {
      if (SETTINGS_MIGRATIONS[v]) SETTINGS_MIGRATIONS[v](this.data);
    }
    if (this.data.settingsVersion !== SETTINGS_VERSION) {
      this.migratedFrom = from;
      this.data.settingsVersion = SETTINGS_VERSION;
      this.flush();
    }
  }

  get(name, def) {
    return name in this.data ? this.data[name] : def;
  }

  set(name, value) {
    this.data[name] = value;
    this.flush();
  }

  flush() {
    if (!this.available) return;
    try {
      this.platform.storageSet(this.key, JSON.stringify(this.data));
    } catch (_) {
      this.available = false;
    }
  }

  highScore(difficulty) {
    return this.data.highScores[difficulty] || 0;
  }

  /** 所有难度中达到过的最高等级 (用于图鉴) */
  get bestLevel() {
    return Math.max(0, ...Object.values(this.data.bestLevels));
  }

  isCleared(difficulty) {
    return !!this.data.cleared[difficulty];
  }

  markCleared(difficulty) {
    this.data.cleared[difficulty] = true;
    this.flush();
  }

  /** 提交一局成绩，返回是否刷新该难度纪录 */
  submit(score, level, difficulty) {
    const isNew = score > this.highScore(difficulty);
    if (isNew) this.data.highScores[difficulty] = score;
    if (level > (this.data.bestLevels[difficulty] || 0)) this.data.bestLevels[difficulty] = level;
    this.data.games = (this.data.games || 0) + 1;
    this.flush();
    return isNew;
  }
}
