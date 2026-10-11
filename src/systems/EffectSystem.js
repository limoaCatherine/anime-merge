// 特效系统：合成粒子、扩散光环、飘字、屏幕闪光与震屏。
import { getCharacterDef } from '../config/LevelConfig.js';
import { GameConfig } from '../config/GameConfig.js';
import { drawStar, drawText } from '../ui/draw.js';

export class EffectSystem {
  constructor(events) {
    this.events = events;
    this.particles = [];
    this.rings = [];
    this.texts = [];
    this.flash = 0;
    this.flashColor = '#ffffff';
    this.shakeTime = 0;
    this.shakeMag = 0;
    this.offs = [
      events.on('merge', (e) => this.onMerge(e)),
      events.on('merge:max', (e) => this.onMaxMerge(e)),
      events.on('score:gain', (e) => this.onScore(e)),
      events.on('item:tidy', (e) => this.onTidy(e)),
      events.on('game:revive', (e) => this.onTidy({ ...e, text: '复活！继续加油' })),
      events.on('stone:spawn', (e) => this.dust(e.x, e.y, 18)),
      events.on('stone:hit', (e) => { this.dust(e.x, e.y, 10); this.shake(0.15, 3); }),
      events.on('stone:break', (e) => this.onStoneBreak(e)),
      events.on('goal:reached', () => this.onGoal()),
    ];
  }

  onMerge({ level, x, y }) {
    const def = getCharacterDef(level);
    const n = 10 + level * 3;
    this.burst(x, y, def.ringColor, n, 120 + level * 25);
    this.rings.push({ x, y, r0: def.radius * 0.4, r1: def.radius * 1.6, life: 0, max: 0.45, color: def.ringColor, width: 6 });
    if (level >= 6) {
      this.flash = Math.min(0.5, 0.15 + level * 0.03);
      this.flashColor = '#ffffff';
      this.shake(0.25, 2 + level * 0.6);
    }
  }

  onMaxMerge({ x, y }) {
    const colors = ['#ff6ad5', '#ffd23f', '#8f7cff', '#36c6e8', '#ffffff'];
    colors.forEach((c) => this.burst(x, y, c, 30, 420));
    for (let i = 0; i < 3; i++) {
      this.rings.push({ x, y, r0: 20, r1: 260 + i * 80, life: -i * 0.12, max: 0.8, color: colors[i], width: 10 });
    }
    this.flash = 0.85;
    this.flashColor = '#fff6c9';
    this.shake(0.6, 12);
    this.texts.push({ x: GameConfig.width / 2, y: GameConfig.height * 0.42, text: '女神降临！', life: 0, max: 2.2, color: '#ff4fa8', size: 54, vy: -12 });
  }

  onScore({ points, x, y, combo, level, max }) {
    if (max) {
      this.texts.push({ x, y: y - 40, text: `+${points}`, life: 0, max: 1.6, color: '#ffb000', size: 46, vy: -50 });
      return;
    }
    const def = level != null ? getCharacterDef(level) : null;
    const size = 24 + Math.min(level || 0, 10) * 1.6;
    this.texts.push({ x, y, text: `+${points}`, life: 0, max: 0.9, color: def ? def.ringColor : '#fff', size, vy: -70 });
    if (def && level >= 4) {
      this.texts.push({ x, y: y - size - 6, text: def.name, life: 0, max: 1.1, color: '#ffffff', size: 18 + level, vy: -55, stroke: def.ringColor });
    }
    if (combo >= 2) {
      this.texts.push({ x, y: y + 30, text: `连锁 x${combo}`, life: 0, max: 0.9, color: '#ff7a00', size: 22, vy: -40 });
    }
  }

  onTidy({ points, text = '整理完成！' }) {
    for (const p of points) {
      this.burst(p.x, p.y, p.color, 12, 160);
      this.rings.push({ x: p.x, y: p.y, r0: p.r * 0.5, r1: p.r * 1.8, life: 0, max: 0.4, color: '#ffffff', width: 5 });
    }
    this.texts.push({ x: GameConfig.width / 2, y: GameConfig.height * 0.4, text, life: 0, max: 1.2, color: '#5ccf8a', size: 40, vy: -30 });
  }

  dust(x, y, count) {
    this.burst(x, y, '#a49eb0', count, 140);
  }

  onStoneBreak({ x, y, r }) {
    this.burst(x, y, '#8d8699', 26, 260);
    this.burst(x, y, '#d9d6e0', 12, 200);
    this.rings.push({ x, y, r0: r * 0.5, r1: r * 1.8, life: 0, max: 0.45, color: '#b8b2c4', width: 7 });
    this.shake(0.3, 6);
    this.texts.push({ x, y: y - r, text: '石头碎啦！', life: 0, max: 1.0, color: '#7a7287', size: 24, vy: -50 });
  }

  onGoal() {
    const colors = ['#ffd23f', '#ff6ad5', '#36c6e8', '#ffffff'];
    colors.forEach((c, i) => this.burst(GameConfig.width / 2, GameConfig.height * 0.4, c, 26, 380 + i * 30));
    this.flash = 0.6;
    this.flashColor = '#fff6c9';
  }

  burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.75);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - speed * 0.25,
        life: 0,
        max: 0.5 + Math.random() * 0.5,
        size: 3 + Math.random() * 6,
        color: Math.random() < 0.25 ? '#ffffff' : color,
        star: Math.random() < 0.45,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 10,
      });
    }
    if (this.particles.length > 600) this.particles.splice(0, this.particles.length - 600);
  }

  shake(time, mag) {
    this.shakeTime = Math.max(this.shakeTime, time);
    this.shakeMag = Math.max(this.shakeMag, mag);
  }

  get shakeOffset() {
    if (this.shakeTime <= 0) return { x: 0, y: 0 };
    const m = this.shakeMag * Math.min(1, this.shakeTime * 4);
    return { x: (Math.random() - 0.5) * 2 * m, y: (Math.random() - 0.5) * 2 * m };
  }

  update(dt) {
    for (const p of this.particles) {
      p.life += dt;
      p.vy += 520 * dt;
      p.vx *= 1 - dt * 1.5;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    this.particles = this.particles.filter((p) => p.life < p.max);
    for (const r of this.rings) r.life += dt;
    this.rings = this.rings.filter((r) => r.life < r.max);
    for (const t of this.texts) { t.life += dt; t.y += t.vy * dt; t.vy *= 1 - dt * 2; }
    this.texts = this.texts.filter((t) => t.life < t.max);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.2);
    if (this.shakeTime > 0) this.shakeTime -= dt; else this.shakeMag = 0;
  }

  render(ctx) {
    for (const r of this.rings) {
      if (r.life < 0) continue;
      const k = r.life / r.max;
      const e = 1 - Math.pow(1 - k, 3);
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - k) + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * e, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    for (const p of this.particles) {
      const k = p.life / p.max;
      ctx.save();
      ctx.globalAlpha = 1 - k * k;
      ctx.fillStyle = p.color;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      const s = p.size * (1 - k * 0.5);
      if (p.star) drawStar(ctx, 0, 0, s * 1.4, s * 0.6);
      else { ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
  }

  renderOverlay(ctx, w, h) {
    for (const t of this.texts) {
      const k = t.life / t.max;
      const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.5 : 1.1 - Math.min(0.1, (k - 0.15));
      ctx.save();
      ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      drawText(ctx, t.text, t.x, t.y, { size: t.size * pop, color: t.color, stroke: t.stroke || '#ffffff', strokeWidth: Math.max(4, t.size * 0.18) });
      ctx.restore();
    }
    if (this.flash > 0) {
      ctx.save();
      ctx.globalAlpha = this.flash;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  clear() {
    this.particles = []; this.rings = []; this.texts = []; this.flash = 0; this.shakeTime = 0;
  }

  destroy() {
    this.offs.forEach((off) => off());
  }
}
