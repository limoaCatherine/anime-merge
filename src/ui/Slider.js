// 画布滑块：拖动/点击轨道调整数值。接口与 Button 相同 (handleDown/handleMove/handleUp/render)，可直接放进场景的按钮列表。
import { GameConfig } from '../config/GameConfig.js';
import { roundRectPath, drawText } from './draw.js';

export class Slider {
  /**
   * @param {object} o
   * @param {number} o.x 轨道左端 x   @param {number} o.y 轨道中心 y   @param {number} o.w 轨道长度
   * @param {string} o.label 左侧标签   @param {number} o.min @param {number} o.max @param {number} o.value
   * @param {(v:number)=>void} o.onChange 拖动时持续回调   @param {(v:number)=>void} [o.onRelease] 松开时回调
   */
  constructor(o) {
    Object.assign(this, { min: 0, max: 1, value: 0, label: '', color: GameConfig.colors.primary, visible: true, enabled: true, hitPad: 24 }, o);
    this.dragging = false;
    this.hover = false;
  }

  get ratio() { return (this.value - this.min) / (this.max - this.min); }

  contains(p) {
    return p.x >= this.x - 14 && p.x <= this.x + this.w + 14 && Math.abs(p.y - this.y) <= this.hitPad;
  }

  setFromX(px) {
    const r = Math.max(0, Math.min(1, (px - this.x) / this.w));
    const v = this.min + r * (this.max - this.min);
    const out = this.onChange ? this.onChange(v) : v;
    this.value = typeof out === 'number' ? out : v;
  }

  handleDown(p) {
    if (!this.visible || !this.enabled || !this.contains(p)) return false;
    this.dragging = true;
    this.setFromX(p.x);
    return true;
  }

  handleMove(p) {
    if (!this.visible) return;
    this.hover = p.type !== 'touch' && this.contains(p);
    if (this.dragging) this.setFromX(p.x);
  }

  handleUp(p) {
    if (!this.dragging) return false;
    this.dragging = false;
    this.setFromX(p.x);
    if (this.onRelease) this.onRelease(this.value);
    return true;
  }

  render(ctx) {
    if (!this.visible) return;
    const C = GameConfig.colors;
    const { x, y, w } = this;
    drawText(ctx, this.label, x - 18, y, { size: 17, color: C.text, align: 'right' });
    ctx.save();
    ctx.fillStyle = 'rgba(180,150,210,0.35)';
    roundRectPath(ctx, x, y - 5, w, 10, 5); ctx.fill();
    const kx = x + this.ratio * w;
    const grad = ctx.createLinearGradient(x, 0, kx, 0);
    grad.addColorStop(0, '#ffb3d9'); grad.addColorStop(1, this.color);
    ctx.fillStyle = grad;
    roundRectPath(ctx, x, y - 5, Math.max(10, kx - x), 10, 5); ctx.fill();
    ctx.shadowColor = 'rgba(200,80,150,0.35)'; ctx.shadowBlur = 6;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(kx, y, this.dragging ? 14 : this.hover ? 13 : 12, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = this.color; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
    drawText(ctx, `${Math.round(this.value * 100)}%`, x + w + 20, y, { size: 16, color: C.primaryDark, align: 'left' });
  }
}
