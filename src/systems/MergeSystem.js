// 合成系统：监听碰撞，同级角色接触后在接触点合成为下一级；两个最高级合成则消失并给予大奖。
import { MAX_LEVEL } from '../config/LevelConfig.js';
import { GameConfig } from '../config/GameConfig.js';

export class MergeSystem {
  /**
   * @param {import('../core/EventBus.js').EventBus} events
   * @param {object} world  提供 spawnCharacter / removeCharacter 的对象 (GameScene)
   */
  constructor(events, world, container = GameConfig.container) {
    this.events = events;
    this.world = world;
    this.container = container;
    this.queue = [];
    this.enabled = true;
    this.off = events.on('physics:collision', (pairs) => this.collect(pairs));
  }

  collect(pairs) {
    if (!this.enabled) return;
    for (const pair of pairs) {
      const a = pair.bodyA.plugin && pair.bodyA.plugin.character;
      const b = pair.bodyB.plugin && pair.bodyB.plugin.character;
      if (!a || !b || a === b) continue;
      if (a.level !== b.level) continue;
      // 同一物理步内一个角色只能参与一次合成 (3 个同级同时接触时只合成其中 2 个，第 3 个下一步再判断)
      if (a.merging || b.merging || a.removed || b.removed) continue;
      a.merging = b.merging = true;
      // 接触点：优先使用 Matter 给出的接触点，否则取两圆心连线上的切点
      let cx; let cy;
      const contacts = pair.activeContacts || pair.contacts;
      if (contacts && contacts.length && contacts[0] && contacts[0].vertex) {
        cx = 0; cy = 0; let n = 0;
        for (const c of contacts) { if (c && c.vertex) { cx += c.vertex.x; cy += c.vertex.y; n++; } }
        cx /= n; cy /= n;
      } else {
        cx = (a.x + b.x) / 2; cy = (a.y + b.y) / 2;
      }
      this.queue.push({ a, b, x: cx, y: cy });
    }
  }

  resolve() {
    if (!this.queue.length) return;
    const list = this.queue;
    this.queue = [];
    const c = this.container;
    for (const { a, b, x, y } of list) {
      // 对方已被移除 (整理道具/重开等) 或合成已被禁用 (结束/暂停)：取消这一对，并解除另一方的 merging 标记，
      // 否则它会永远处于"合成中"——既不能再合成，也不参与判负
      if (!this.enabled || a.removed || b.removed || a.level !== b.level) {
        if (!a.removed) a.merging = false;
        if (!b.removed) b.merging = false;
        continue;
      }
      const level = a.level;
      const vx = (a.body.velocity.x + b.body.velocity.x) / 2;
      const vy = (a.body.velocity.y + b.body.velocity.y) / 2;
      // 参与合成的两个角色的位置 (供障碍系统判断是否"邻接"石头)
      const sources = [a, b].map((ch) => ({ x: ch.x, y: ch.y, r: ch.currentRadius }));
      this.world.removeCharacter(a);
      this.world.removeCharacter(b);

      if (level >= MAX_LEVEL) {
        this.events.emit('merge:max', { level, x, y, sources });
        continue;
      }
      const newLevel = level + 1;
      const def = this.world.getDef(newLevel);
      // 按"长大后的完整半径"把出生点限制在容器内，避免大角色长大时嵌进墙/地面、把周围角色挤穿墙
      const r = def.radius;
      const nx = c.right - c.left >= r * 2 ? Math.min(c.right - r, Math.max(c.left + r, x)) : (c.left + c.right) / 2;
      const ny = Math.min(c.bottom - r, y);
      const ch = this.world.spawnCharacter(newLevel, nx, ny, { grow: true });
      ch.body.plugin.character = ch;
      this.world.physics.setVelocity(ch.body, { x: vx * 0.4, y: Math.min(vy, 0) * 0.4 - 1 });
      this.events.emit('merge', { level: newLevel, x: nx, y: ny, character: ch, sources });
    }
  }

  /** 清空待处理的合成 (状态切换时调用)，并解除标记 */
  cancelPending() {
    for (const { a, b } of this.queue) { if (!a.removed) a.merging = false; if (!b.removed) b.merging = false; }
    this.queue = [];
  }

  destroy() {
    this.off();
    this.queue = [];
  }
}
