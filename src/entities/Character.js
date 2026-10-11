// 角色实体：一个带圆形物理刚体、用角色头像贴图渲染的可合成单位。
import { GameConfig } from '../config/GameConfig.js';

let nextId = 1;

export class Character {
  /**
   * @param {import('../systems/PhysicsSystem.js').PhysicsSystem} physics
   * @param {object} def  LevelConfig 中的角色定义
   * @param {number} level 0 起始的等级索引
   */
  constructor(physics, def, level, x, y, { grow = false } = {}) {
    this.id = nextId++;
    this.physics = physics;
    this.def = def;
    this.level = level;
    this.radius = def.radius;
    this.body = physics.createCircle(x, y, def.radius);
    this.body.plugin.character = this;
    this.age = 0;
    this.merging = false;
    this.removed = false;
    this.dangerTime = 0;
    this.squash = 0; // 落地/出生时的弹跳感
    // 位置的指数平均 (约 0.4 秒)，用于判断"卡住抖动"：净位移很小即视为静止
    this.trackX = x; this.trackY = y;

    // 合成出生：物理刚体从小长大，视觉上有弹性放大
    this.growScale = 1;
    if (grow) {
      this.growScale = GameConfig.physics.spawnScale;
      physics.scale(this.body, this.growScale);
      this.squash = 1;
    }
  }

  get x() { return this.body.position.x; }
  get y() { return this.body.position.y; }
  get angle() { return this.body.angle; }
  get speed() { return this.body.speed; }
  get currentRadius() { return this.radius * this.growScale; }
  /** 最近约 0.4 秒内的净位移 (像素) */
  get drift() { return Math.hypot(this.x - this.trackX, this.y - this.trackY); }

  update(dt) {
    this.age += dt;
    const k = 1 - Math.exp(-dt / 0.4);
    this.trackX += (this.x - this.trackX) * k;
    this.trackY += (this.y - this.trackY) * k;
    if (this.growScale < 1) {
      const next = Math.min(1, this.growScale + dt * GameConfig.physics.growSpeed);
      this.physics.scale(this.body, next / this.growScale);
      this.growScale = next;
    }
    if (this.squash > 0) this.squash = Math.max(0, this.squash - dt * 2.5);
  }

  render(ctx, img, { danger = 0, time = 0 } = {}) {
    // 弹性：出生时略微超过原尺寸再回弹
    const wobble = this.squash > 0 ? Math.sin((1 - this.squash) * Math.PI * 3) * 0.08 * this.squash : 0;
    const r = this.currentRadius * (1 + wobble);
    const x = this.x;
    const y = this.y;

    // 阴影
    ctx.fillStyle = 'rgba(80,40,90,0.16)';
    ctx.beginPath();
    ctx.arc(x + 2, y + 4, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.angle);
    if (img) ctx.drawImage(img, -r, -r, r * 2, r * 2);
    ctx.restore();

    // 危险闪烁
    if (danger > 0) {
      const a = (0.25 + 0.35 * Math.abs(Math.sin(time * 10))) * Math.min(1, danger * 1.5);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = GameConfig.colors.danger;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  destroy() {
    if (this.removed) return;
    this.removed = true;
    this.physics.remove(this.body);
    this.body.plugin.character = null;
  }
}
