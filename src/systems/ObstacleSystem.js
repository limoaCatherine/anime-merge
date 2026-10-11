// 障碍系统 (困难)：定时在底部随机位置预警并"升起"石头；石头附近发生合成会使其开裂，N 次后碎裂。
import { Stone } from '../entities/Stone.js';

export class ObstacleSystem {
  /**
   * @param {object} cfg rules.stone (null 表示本难度无障碍)
   * @param {object} container rules.container
   */
  constructor(events, physics, cfg, container, world = null) {
    this.world = world;            // 提供 characters (用于挑选安全的出生位置)
    this.events = events;
    this.physics = physics;
    this.cfg = cfg;
    this.container = container;
    this.stones = [];
    this.timer = cfg ? cfg.firstDelay : Infinity;
    this.warnX = null;
    this.time = 0;
    const offs = cfg ? [events.on('merge', (e) => this.onMerge(e)), events.on('merge:max', (e) => this.onMerge(e))] : [];
    this.off = () => offs.forEach((f) => f());
    this.postponed = 0;
  }

  get enabled() {
    return !!this.cfg;
  }

  /** x 处 (宽度 2r 的一列) 堆积物的最高点 y；没有东西时为地面 */
  columnTop(x, r) {
    let top = this.container.bottom;
    const bodies = [...(this.world ? this.world.characters : []), ...this.stones];
    for (const b of bodies) {
      if (b.removed) continue;
      const rr = b.currentRadius;
      if (Math.abs(b.x - x) < r + rr) top = Math.min(top, b.y - rr);
    }
    return top;
  }

  /**
   * 挑选石头出生位置：在若干随机候选中选堆积最低的一列 (石头升起会把上面的角色顶高约 2r)。
   * 如果所有候选列被顶高后都会越过警戒线，返回 null (本次推迟，避免不公平判负)。
   */
  pickX() {
    const r = this.cfg.radius;
    const c = this.container;
    const dangerY = this.cfg.dangerY != null ? this.cfg.dangerY : 236;
    let best = null;
    for (let i = 0; i < 8; i++) {
      const x = c.left + r + Math.random() * (c.right - c.left - r * 2);
      const top = this.columnTop(x, r);
      if (!best || top > best.top) best = { x, top };
    }
    const clearance = best.top - r * 2 - dangerY;
    return clearance >= 40 ? best.x : null;
  }

  /** 立即开始下一块石头的预警 (测试/调试用) */
  forceNext() {
    if (this.enabled) this.timer = Math.min(this.timer, this.cfg.warnTime);
  }

  update(dt) {
    if (!this.enabled) return;
    this.time += dt;
    this.timer -= dt;
    if (this.warnX == null && this.timer <= this.cfg.warnTime) {
      if (this.stones.length >= this.cfg.maxStones) {
        this.timer = this.cfg.interval; // 场上石头太多，跳过这一轮
      } else {
        const x = this.pickX();
        if (x == null) {
          this.timer = this.cfg.warnTime + 3;   // 场地太满，3 秒后再试
          this.postponed++;
        } else {
          this.warnX = x;
          this.events.emit('stone:warn', { x: this.warnX });
        }
      }
    }
    if (this.warnX != null && this.timer <= 0 && this.columnTop(this.warnX, this.cfg.radius) - this.cfg.radius * 2 < (this.cfg.dangerY ?? 236)) {
      // 预警期间这一列被堆高了：取消这次出现，稍后再试
      this.warnX = null;
      this.timer = this.cfg.warnTime + 3;
      this.postponed++;
      this.events.emit('stone:cancel');
    }
    if (this.warnX != null && this.timer <= 0) {
      const r = this.cfg.radius;
      const stone = new Stone(this.physics, this.cfg, this.warnX, this.container.bottom - r * 0.2);
      this.stones.push(stone);
      this.events.emit('stone:spawn', { x: this.warnX, y: this.container.bottom - r, stone });
      this.warnX = null;
      this.timer = this.cfg.interval;
    }
    for (const s of this.stones) s.update(dt);
  }

  onMerge({ sources }) {
    if (!sources) return;
    for (const s of [...this.stones]) {
      const touching = sources.some((p) => Math.hypot(p.x - s.x, p.y - s.y) <= p.r + s.currentRadius + 6);
      if (!touching) continue;
      if (s.hit()) {
        this.remove(s);
        this.events.emit('stone:break', { x: s.x, y: s.y, r: s.radius });
      } else {
        this.events.emit('stone:hit', { x: s.x, y: s.y, r: s.radius, hits: s.hits });
      }
    }
  }

  remove(stone) {
    stone.destroy();
    this.stones = this.stones.filter((s) => s !== stone);
  }

  render(ctx, time) {
    if (!this.enabled) return;
    if (this.warnX != null) {
      const k = 1 - Math.max(0, this.timer) / this.cfg.warnTime;
      const y = this.container.bottom - 6;
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.45 * Math.abs(Math.sin(time * 9));
      ctx.fillStyle = '#7a7287';
      ctx.beginPath();
      ctx.ellipse(this.warnX, y, this.cfg.radius * (0.4 + 0.6 * k), 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = 'bold 26px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff4d6d';
      ctx.fillText('!', this.warnX, y - 18 - Math.sin(time * 9) * 3);
      ctx.restore();
    }
    for (const s of this.stones) s.render(ctx);
  }

  destroy() {
    this.off();
    this.stones.forEach((s) => s.destroy());
    this.stones = [];
  }
}
