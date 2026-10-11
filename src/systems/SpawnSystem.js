// 投放系统：决定"当前"和"下一个"角色 (只从最低几级中按难度权重随机)，并控制投放冷却。
import { GameConfig } from '../config/GameConfig.js';

export class SpawnSystem {
  /** @param {{spawnWeights?:number[]}} [rules] */
  constructor(rules = {}) {
    this.weights = rules.spawnWeights || GameConfig.spawnWeights.slice(0, GameConfig.spawnTierCount);
    this.reset();
  }

  reset() {
    this.dropCount = 0;
    this.cooldown = 0;
    this.current = this.roll(true);
    this.next = this.roll(true);
  }

  roll(early = false) {
    const cfg = GameConfig;
    const isEarly = early || this.dropCount < cfg.earlyDrops;
    const weights = isEarly ? this.weights.slice(0, cfg.earlyTierCount).map(() => 1) : this.weights;
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return 0;
  }

  get canDrop() {
    return this.cooldown <= 0;
  }

  /** 冷却进度 0..1 (1 = 可以投放) */
  get readiness() {
    return 1 - Math.max(0, this.cooldown) / GameConfig.dropCooldown;
  }

  take() {
    const level = this.current;
    this.dropCount++;
    this.current = this.next;
    this.next = this.roll();
    this.cooldown = GameConfig.dropCooldown;
    return level;
  }

  update(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
  }
}
