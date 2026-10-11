// 道具系统：「整理」—— 移除场上当前最小等级的全部角色 (简单难度 3 次)。
export class ItemSystem {
  /**
   * @param {object} world 提供 characters / removeCharacter 的对象 (GameScene)
   */
  constructor(events, world, uses) {
    this.events = events;
    this.world = world;
    this.maxUses = uses || 0;
    this.uses = this.maxUses;
  }

  get enabled() {
    return this.maxUses > 0;
  }

  canUseTidy() {
    return this.uses > 0 && this.world.characters.some((c) => !c.merging && !c.removed);
  }

  useTidy() {
    if (!this.canUseTidy()) return false;
    const alive = this.world.characters.filter((c) => !c.merging && !c.removed);
    const level = Math.min(...alive.map((c) => c.level));
    const targets = alive.filter((c) => c.level === level);
    const points = targets.map((c) => ({ x: c.x, y: c.y, r: c.currentRadius, color: c.def.ringColor }));
    targets.forEach((c) => this.world.removeCharacter(c));
    this.uses--;
    this.events.emit('item:tidy', { level, count: targets.length, points, usesLeft: this.uses });
    return true;
  }
}
