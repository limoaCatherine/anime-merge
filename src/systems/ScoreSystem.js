// 计分系统：合成得分 + 连锁加成 + 最高级合成大奖。
import { GameConfig } from '../config/GameConfig.js';
import { getCharacterDef } from '../config/LevelConfig.js';

export class ScoreSystem {
  constructor(events) {
    this.events = events;
    this.reset();
    this.offs = [
      events.on('merge', (e) => this.onMerge(e)),
      events.on('merge:max', (e) => this.onMaxMerge(e)),
    ];
  }

  reset() {
    this.score = 0;
    this.displayScore = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.maxLevel = 0;
    this.merges = 0;
  }

  add(points, x, y, extra = {}) {
    this.score += points;
    this.events.emit('score:gain', { points, x, y, combo: this.combo, ...extra });
    this.events.emit('score:changed', this.score);
  }

  onMerge({ level, x, y }) {
    this.merges++;
    this.combo = this.comboTimer > 0 ? this.combo + 1 : 1;
    this.comboTimer = GameConfig.comboWindow;
    if (level > this.maxLevel) this.maxLevel = level;
    const def = getCharacterDef(level);
    const comboBonus = this.combo > 1 ? (this.combo - 1) * 2 : 0;
    this.add(def.score + comboBonus, x, y, { level });
  }

  onMaxMerge({ x, y }) {
    this.merges++;
    this.add(GameConfig.topMergeBonus, x, y, { max: true });
  }

  update(dt) {
    if (this.comboTimer > 0) this.comboTimer -= dt;
    // 分数滚动显示
    const diff = this.score - this.displayScore;
    if (diff > 0) this.displayScore = Math.min(this.score, this.displayScore + Math.max(1, diff * Math.min(1, dt * 12)));
  }

  destroy() {
    this.offs.forEach((off) => off());
  }
}
