// 投放倒计时：每个待投放角色有 N 秒时间，超时自动在当前瞄准位置投放。
// 最后 3 秒每秒发出 timer:tick；超时发出 timer:expired。只在 update 被调用时计时 (暂停即停止)。
export class DropTimerSystem {
  constructor(events, duration) {
    this.events = events;
    this.duration = duration || 0;
    this.remaining = this.duration;
    this.lastWhole = Math.ceil(this.duration);
  }

  get enabled() {
    return this.duration > 0;
  }

  /** 剩余比例 1..0 */
  get fraction() {
    return this.enabled ? Math.max(0, this.remaining) / this.duration : 1;
  }

  get secondsLeft() {
    return Math.max(0, Math.ceil(this.remaining));
  }

  reset() {
    this.remaining = this.duration;
    this.lastWhole = Math.ceil(this.duration);
  }

  /** @param {boolean} armed 当前是否有可投放的角色 (冷却中不计时) */
  update(dt, armed) {
    if (!this.enabled) return;
    if (!armed) { this.reset(); return; }
    this.remaining -= dt;
    const whole = Math.ceil(this.remaining);
    if (whole < this.lastWhole) {
      this.lastWhole = whole;
      if (whole >= 1 && whole <= 3) this.events.emit('timer:tick', { seconds: whole });
    }
    if (this.remaining <= 0) {
      this.reset();
      this.events.emit('timer:expired');
    }
  }
}
