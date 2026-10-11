// 画布按钮：支持悬停/按下动画、主次两种样式与图标按钮。
import { GameConfig } from '../config/GameConfig.js';
import { roundRectPath, drawText } from './draw.js';

export class Button {
  /**
   * @param {object} o
   * @param {number} o.x 中心 x
   * @param {number} o.y 中心 y
   * @param {number} o.w
   * @param {number} o.h
   * @param {string} [o.label]
   * @param {'primary'|'secondary'|'icon'|'tab'} [o.style]
   * @param {(ctx:CanvasRenderingContext2D, size:number)=>void} [o.icon]
   * @param {()=>void} o.onClick
   */
  constructor(o) {
    Object.assign(this, { style: 'primary', label: '', fontSize: 28, visible: true, enabled: true }, o);
    this.hover = false;
    this.pressed = false;
    this.scale = 1;
    this.audio = null; // 由场景注入，用于点击音效
  }

  contains(p) {
    return p.x >= this.x - this.w / 2 && p.x <= this.x + this.w / 2 && p.y >= this.y - this.h / 2 && p.y <= this.y + this.h / 2;
  }

  handleDown(p) {
    if (!this.visible || !this.enabled) return false;
    if (this.contains(p)) { this.pressed = true; return true; }
    return false;
  }

  handleMove(p) {
    if (!this.visible) return;
    this.hover = p.type !== 'touch' && this.contains(p);
  }

  handleUp(p) {
    if (!this.pressed) return false;
    this.pressed = false;
    if (this.contains(p)) {
      if (this.audio) this.audio.play('click');
      this.onClick && this.onClick();
      return true;
    }
    return false;
  }

  render(ctx, dt = 1 / 60) {
    if (!this.visible) return;
    const target = this.pressed ? 0.92 : this.hover ? 1.05 : 1;
    this.scale += (target - this.scale) * Math.min(1, dt * 18);
    const { w, h } = this;
    const C = GameConfig.colors;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.scale, this.scale);

    if (this.style === 'icon') {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      roundRectPath(ctx, -w / 2, -h / 2, w, h, Math.min(w, h) * 0.32);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,143,199,0.8)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      if (!this.enabled) ctx.globalAlpha = 0.4;
      if (this.icon) this.icon(ctx, Math.min(w, h));
      if (this.label) drawText(ctx, this.label, 0, h * 0.26, { size: this.fontSize, color: C.primaryDark });
      ctx.globalAlpha = 1;
      if (this.badge != null) {
        ctx.fillStyle = this.enabled ? C.primary : '#b9a3c9';
        ctx.beginPath(); ctx.arc(w / 2 - 4, -h / 2 + 4, 11, 0, Math.PI * 2); ctx.fill();
        drawText(ctx, String(this.badge), w / 2 - 4, -h / 2 + 5, { size: 14, color: '#fff' });
      }
      ctx.restore();
      return;
    }

    if (this.style === 'tab') {
      // 选项卡：选中时为主题色实心，否则为白底描边
      const color = this.color || C.primary;
      roundRectPath(ctx, -w / 2, -h / 2 + (this.selected ? 4 : 3), w, h, h / 2);
      ctx.fillStyle = this.selected ? shade(color) : 'rgba(180,150,200,0.35)';
      ctx.fill();
      roundRectPath(ctx, -w / 2, -h / 2, w, h, h / 2);
      ctx.fillStyle = this.selected ? color : 'rgba(255,255,255,0.92)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = this.selected ? '#ffffff' : color;
      ctx.stroke();
      drawText(ctx, this.label, 0, 1, { size: this.fontSize, color: this.selected ? '#fff' : color, stroke: this.selected ? shade(color) : null, strokeWidth: 4 });
      ctx.restore();
      return;
    }

    const top = this.style === 'primary' ? C.primary : C.secondary;
    const bottom = this.style === 'primary' ? C.primaryDark : C.secondaryDark;
    // 底部厚度
    roundRectPath(ctx, -w / 2, -h / 2 + 5, w, h, h / 2);
    ctx.fillStyle = bottom;
    ctx.fill();
    // 主体
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, lighten(top));
    g.addColorStop(1, top);
    roundRectPath(ctx, -w / 2, -h / 2, w, h, h / 2);
    ctx.fillStyle = g;
    ctx.fill();
    // 高光
    roundRectPath(ctx, -w / 2 + 10, -h / 2 + 5, w - 20, h * 0.35, h * 0.2);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fill();
    drawText(ctx, this.label, 0, 1, { size: this.fontSize, color: '#fff', stroke: bottom, strokeWidth: 5 });
    ctx.restore();
  }
}

function shade(hex) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.round(v * 0.78));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function lighten(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) + 40);
  const g = Math.min(255, ((n >> 8) & 255) + 40);
  const b = Math.min(255, (n & 255) + 40);
  return `rgb(${r},${g},${b})`;
}

// ---- 常用图标 ----
export const Icons = {
  pause(ctx, s) {
    ctx.fillStyle = GameConfig.colors.primaryDark;
    const bw = s * 0.13; const bh = s * 0.42;
    roundRectPath(ctx, -bw * 1.6, -bh / 2, bw, bh, 2); ctx.fill();
    roundRectPath(ctx, bw * 0.6, -bh / 2, bw, bh, 2); ctx.fill();
  },
  sound(muted) {
    return (ctx, s) => {
      const k = s / 44;
      ctx.fillStyle = GameConfig.colors.primaryDark;
      ctx.strokeStyle = GameConfig.colors.primaryDark;
      ctx.lineWidth = 2.5 * k;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-11 * k, -5 * k); ctx.lineTo(-5 * k, -5 * k); ctx.lineTo(2 * k, -11 * k);
      ctx.lineTo(2 * k, 11 * k); ctx.lineTo(-5 * k, 5 * k); ctx.lineTo(-11 * k, 5 * k);
      ctx.closePath(); ctx.fill();
      if (muted) {
        ctx.beginPath();
        ctx.moveTo(6 * k, -5 * k); ctx.lineTo(14 * k, 5 * k);
        ctx.moveTo(14 * k, -5 * k); ctx.lineTo(6 * k, 5 * k);
        ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(3 * k, 0, 7 * k, -0.9, 0.9); ctx.stroke();
        ctx.beginPath(); ctx.arc(3 * k, 0, 12 * k, -0.9, 0.9); ctx.stroke();
      }
    };
  },
  broom(ctx, s) {
    const k = s / 60;
    ctx.save();
    ctx.translate(0, -6 * k);
    ctx.rotate(-0.5);
    ctx.fillStyle = '#c98b4b';
    ctx.fillRect(-2.5 * k, -16 * k, 5 * k, 18 * k);
    ctx.fillStyle = GameConfig.colors.primary;
    ctx.beginPath();
    ctx.moveTo(-8 * k, 2 * k); ctx.lineTo(8 * k, 2 * k); ctx.lineTo(12 * k, 14 * k); ctx.lineTo(-12 * k, 14 * k);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  },
  /** 音量设置 (三条推子) */
  mixer(ctx, s) {
    const k = s / 44;
    ctx.strokeStyle = GameConfig.colors.primaryDark;
    ctx.fillStyle = GameConfig.colors.primaryDark;
    ctx.lineWidth = 2.4 * k;
    ctx.lineCap = 'round';
    [[-9, 4], [0, -5], [9, 2]].forEach(([dx, ky]) => {
      ctx.beginPath(); ctx.moveTo(dx * k, -11 * k); ctx.lineTo(dx * k, 11 * k); ctx.stroke();
      ctx.beginPath(); ctx.arc(dx * k, ky * k, 3.8 * k, 0, Math.PI * 2); ctx.fill();
    });
  },
  /** 礼物 (侧边栏奖励) */
  gift(ctx, s) {
    const k = s / 44;
    const C = GameConfig.colors;
    ctx.fillStyle = C.primary;
    roundRectPath(ctx, -11 * k, -3 * k, 22 * k, 14 * k, 2 * k); ctx.fill();
    ctx.fillStyle = C.primaryDark;
    roundRectPath(ctx, -13 * k, -8 * k, 26 * k, 6 * k, 2 * k); ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(-2 * k, -8 * k, 4 * k, 19 * k);
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2.4 * k;
    ctx.beginPath(); ctx.ellipse(-5 * k, -11 * k, 5 * k, 3 * k, 0.4, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(5 * k, -11 * k, 5 * k, 3 * k, -0.4, 0, Math.PI * 2); ctx.stroke();
  },
  home(ctx, s) {
    const k = s / 44;
    ctx.fillStyle = GameConfig.colors.primaryDark;
    ctx.beginPath();
    ctx.moveTo(0, -12 * k); ctx.lineTo(12 * k, -1 * k); ctx.lineTo(8 * k, -1 * k); ctx.lineTo(8 * k, 11 * k);
    ctx.lineTo(-8 * k, 11 * k); ctx.lineTo(-8 * k, -1 * k); ctx.lineTo(-12 * k, -1 * k);
    ctx.closePath(); ctx.fill();
  },
};
