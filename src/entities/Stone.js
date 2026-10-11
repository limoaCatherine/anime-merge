// 石头障碍：不能合成；从地面"升起"(物理刚体逐渐变大，温和地推开周围角色)；
// 邻接发生 N 次合成后碎裂，期间显示裂纹。
import Matter from '../lib/matter.js';
import { getPlatform } from '../platform/index.js';

let textureCache = null;
function stoneTexture() {
  if (textureCache) return textureCache;
  const S = 256;
  const c = getPlatform().createCanvas(S, S);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(S * 0.38, S * 0.34, S * 0.05, S / 2, S / 2, S / 2);
  grad.addColorStop(0, '#d9d6e0');
  grad.addColorStop(0.6, '#9e98ab');
  grad.addColorStop(1, '#6d6779');
  g.fillStyle = grad;
  g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); g.fill();
  // 斑点
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 70; i++) {
    const a = rnd() * Math.PI * 2; const d = Math.sqrt(rnd()) * (S / 2 - 16);
    g.fillStyle = rnd() < 0.5 ? 'rgba(80,72,92,0.25)' : 'rgba(255,255,255,0.22)';
    g.beginPath(); g.arc(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, 2 + rnd() * 7, 0, Math.PI * 2); g.fill();
  }
  g.lineWidth = 8; g.strokeStyle = '#5a5466';
  g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 6, 0, Math.PI * 2); g.stroke();
  textureCache = c;
  return c;
}

export class Stone {
  constructor(physics, cfg, x, y) {
    this.physics = physics;
    this.cfg = cfg;
    this.radius = cfg.radius;
    this.isStone = true;
    this.level = -1;
    this.hits = 0;
    this.age = 0;
    this.dangerTime = 0;
    this.merging = false;
    this.removed = false;
    this.hitFlash = 0;
    this.growScale = 0.15;
    // 位置的指数平均 (约 0.4 秒)，用于判断"卡住抖动"：净位移很小即视为静止
    this.trackX = x; this.trackY = y;
    this.body = physics.createCircle(x, y, this.radius);
    Matter.Body.setDensity(this.body, cfg.density);
    this.body.friction = 0.5;
    this.body.restitution = 0.05;
    this.body.label = 'stone';
    this.body.plugin.stone = this;
    physics.scale(this.body, this.growScale);
    // 每块石头固定一组随机裂纹
    this.cracks = Array.from({ length: 2 }, (_, k) => {
      const a0 = Math.random() * Math.PI * 2 + k * Math.PI;
      const pts = [[0, 0]];
      let a = a0; let d = 0;
      for (let i = 0; i < 4; i++) {
        d += this.radius * (0.2 + Math.random() * 0.12);
        a += (Math.random() - 0.5) * 0.9;
        pts.push([Math.cos(a) * Math.min(d, this.radius * 0.92), Math.sin(a) * Math.min(d, this.radius * 0.92)]);
      }
      return pts;
    });
  }

  get x() { return this.body.position.x; }
  get y() { return this.body.position.y; }
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
      const next = Math.min(1, this.growScale + dt / this.cfg.growTime);
      this.physics.scale(this.body, next / this.growScale);
      this.growScale = next;
    }
    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt * 3);
  }

  /** 记录一次邻接合成，返回是否碎裂 */
  hit() {
    this.hits++;
    this.hitFlash = 1;
    return this.hits >= this.cfg.hitsToBreak;
  }

  render(ctx) {
    const r = this.currentRadius * (1 + this.hitFlash * 0.06);
    ctx.fillStyle = 'rgba(60,40,70,0.18)';
    ctx.beginPath(); ctx.arc(this.x + 2, this.y + 4, r, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.body.angle);
    ctx.drawImage(stoneTexture(), -r, -r, r * 2, r * 2);
    const k = r / this.radius;
    ctx.strokeStyle = '#3d3747';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < Math.min(this.hits, this.cracks.length); i++) {
      ctx.lineWidth = 3.5 - i * 0.5;
      ctx.beginPath();
      this.cracks[i].forEach(([px, py], j) => (j ? ctx.lineTo(px * k, py * k) : ctx.moveTo(px * k, py * k)));
      ctx.stroke();
    }
    ctx.restore();
    if (this.hitFlash > 0) {
      ctx.save();
      ctx.globalAlpha = this.hitFlash * 0.5;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(this.x, this.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  destroy() {
    if (this.removed) return;
    this.removed = true;
    this.physics.remove(this.body);
    this.body.plugin.stone = null;
  }
}
