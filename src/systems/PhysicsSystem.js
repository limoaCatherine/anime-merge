// 物理系统：封装 Matter.js 引擎，固定时间步长推进，转发碰撞事件。
import Matter from '../lib/matter.js';
import { GameConfig } from '../config/GameConfig.js';

const { Engine, Bodies, Composite, Events, Body } = Matter;

export class PhysicsSystem {
  /** @param {{gravityY?:number}} [rules] 难度规则 (可覆盖重力) */
  constructor(events, rules = {}) {
    const cfg = GameConfig.physics;
    this.cfg = cfg;
    this.events = events;
    this.engine = Engine.create({
      positionIterations: cfg.positionIterations,
      velocityIterations: cfg.velocityIterations,
      enableSleeping: false,
    });
    this.engine.gravity.y = rules.gravityY || cfg.gravityY;
    this.world = this.engine.world;
    this.accumulator = 0;
    this.afterStep = null; // 每个物理子步之后的回调 (用于处理合成)

    this._onCollision = (e) => this.events.emit('physics:collision', e.pairs);
    Events.on(this.engine, 'collisionStart', this._onCollision);
    Events.on(this.engine, 'collisionActive', this._onCollision);
  }

  createWalls(c) {
    this.container = c;
    const t = c.wallThickness;
    const h = c.bottom + 1200;
    const opts = { isStatic: true, label: 'wall', friction: 0.2, restitution: 0.1 };
    const left = Bodies.rectangle(c.left - t / 2, c.bottom - h / 2, t, h, opts);
    const right = Bodies.rectangle(c.right + t / 2, c.bottom - h / 2, t, h, opts);
    const floor = Bodies.rectangle((c.left + c.right) / 2, c.bottom + t / 2, c.right - c.left + t * 2, t, opts);
    Composite.add(this.world, [left, right, floor]);
    this.walls = [left, right, floor];
  }

  createCircle(x, y, r) {
    const cfg = this.cfg;
    const body = Bodies.circle(x, y, r, {
      label: 'character',
      restitution: cfg.restitution,
      friction: cfg.friction,
      frictionStatic: cfg.frictionStatic,
      frictionAir: cfg.frictionAir,
      density: cfg.density,
    }, 32);
    Composite.add(this.world, body);
    return body;
  }

  remove(body) {
    Composite.remove(this.world, body);
  }

  setVelocity(body, v) {
    Body.setVelocity(body, v);
  }

  scale(body, s) {
    Body.scale(body, s, s);
  }

  step(dt) {
    const ts = this.cfg.timestep;
    this.accumulator += dt * 1000;
    let n = 0;
    while (this.accumulator >= ts && n < this.cfg.maxSubSteps) {
      Engine.update(this.engine, ts);
      this.accumulator -= ts;
      n++;
      this.contain();
      if (this.afterStep) this.afterStep();
    }
    if (n >= this.cfg.maxSubSteps) this.accumulator = 0;
  }

  /**
   * 安全网：限制最大速度 (防止高速穿墙)，并把意外跑到容器外 (穿墙/穿地) 的刚体放回容器内。
   * 返回本步被"救回"的刚体数量 (测试用)。
   */
  contain() {
    const c = this.container;
    if (!c) return 0;
    const maxV = this.cfg.maxSpeed;
    let rescued = 0;
    for (const body of Composite.allBodies(this.world)) {
      if (body.isStatic) continue;
      const v = body.velocity;
      const sp = Math.hypot(v.x, v.y);
      if (sp > maxV) Body.setVelocity(body, { x: v.x / sp * maxV, y: v.y / sp * maxV });
      const r = body.circleRadius || 0;
      const p = body.position;
      const minX = c.left + Math.min(r, (c.right - c.left) / 2);
      const maxX = c.right - Math.min(r, (c.right - c.left) / 2);
      const maxY = c.bottom - r;
      // 允许轻微重叠 (正常的接触穿透)，超过一半半径才视为"逃逸"
      const tol = Math.max(4, r * 0.5);
      if (p.x < minX - tol || p.x > maxX + tol || p.y > maxY + tol) {
        Body.setPosition(body, { x: Math.min(maxX, Math.max(minX, p.x)), y: Math.min(maxY, p.y) });
        Body.setVelocity(body, { x: 0, y: Math.min(0, v.y) });
        rescued++;
      }
    }
    this.rescued = (this.rescued || 0) + rescued;
    return rescued;
  }

  destroy() {
    Events.off(this.engine, 'collisionStart', this._onCollision);
    Events.off(this.engine, 'collisionActive', this._onCollision);
    Composite.clear(this.world, false);
    Engine.clear(this.engine);
    this.afterStep = null;
  }
}
