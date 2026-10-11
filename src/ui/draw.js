// 通用绘制工具：圆角矩形、描边文字、星形、背景等。
import { GameConfig } from '../config/GameConfig.js';

export function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

export function drawText(ctx, str, x, y, {
  size = 24, color = '#fff', align = 'center', baseline = 'middle', weight = 'bold',
  stroke = null, strokeWidth = 4, shadow = null,
} = {}) {
  ctx.save();
  ctx.font = `${weight} ${Math.round(size)}px ${GameConfig.fontFamily}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.lineJoin = 'round';
  if (shadow) {
    ctx.shadowColor = shadow;
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeWidth;
    ctx.strokeText(str, x, y);
    ctx.shadowColor = 'transparent';
  }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
  ctx.restore();
}

export function drawStar(ctx, x, y, outer, inner, points = 5) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
}

export function drawPanel(ctx, x, y, w, h, r = 24, fill = GameConfig.colors.panel) {
  ctx.save();
  ctx.shadowColor = 'rgba(120,60,140,0.25)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundRectPath(ctx, x + 1.5, y + 1.5, w - 3, h - 3, r);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

// 背景装饰点 (预生成，避免每帧随机)
const SPARKLES = Array.from({ length: 34 }, (_, i) => ({
  x: (i * 197.3) % GameConfig.width,
  y: (i * 331.7) % GameConfig.height,
  s: 2 + ((i * 7) % 5),
  p: i * 0.7,
  star: i % 3 === 0,
}));

export function drawBackground(ctx, w, h, time) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, GameConfig.colors.bgTop);
  g.addColorStop(1, GameConfig.colors.bgBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  for (const s of SPARKLES) {
    const y = (s.y - time * (6 + s.s * 2)) % h;
    const yy = y < 0 ? y + h : y;
    ctx.globalAlpha = 0.35 + 0.3 * Math.sin(time * 1.5 + s.p);
    ctx.fillStyle = '#ffffff';
    if (s.star) drawStar(ctx, s.x, yy, s.s * 1.8, s.s * 0.7);
    else { ctx.beginPath(); ctx.arc(s.x, yy, s.s, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}

/** 绘制圆形头像 (图片本身已是圆形透明 PNG) */
export function drawPortrait(ctx, img, x, y, r, alpha = 1) {
  if (!img) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

export const easing = {
  backOut: (t, s = 1.70158) => { const u = t - 1; return u * u * ((s + 1) * u + s) + 1; },
  cubicOut: (t) => 1 - Math.pow(1 - t, 3),
  elasticOut: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};
