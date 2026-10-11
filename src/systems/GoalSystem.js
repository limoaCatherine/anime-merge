// 目标系统：合成出目标等级即胜利 (可选择继续无尽挑战)。
import { getCharacterDef } from '../config/LevelConfig.js';

export class GoalSystem {
  constructor(events, goalLevel) {
    this.events = events;
    this.goalLevel = goalLevel == null ? null : goalLevel;
    this.reached = false;
    this.endless = this.goalLevel == null;
    this.best = 0;
    this.off = events.on('merge', (e) => this.onMerge(e));
  }

  get hasGoal() {
    return this.goalLevel != null;
  }

  get goalDef() {
    return this.hasGoal ? getCharacterDef(this.goalLevel) : null;
  }

  /** 进度 0..1 */
  get progress() {
    return this.hasGoal ? Math.min(1, this.best / this.goalLevel) : 0;
  }

  onMerge({ level }) {
    if (level > this.best) this.best = level;
    if (this.hasGoal && !this.reached && level >= this.goalLevel) {
      this.reached = true;
      this.events.emit('goal:reached', { level });
    }
  }

  continueEndless() {
    this.endless = true;
  }

  destroy() {
    this.off();
  }
}
