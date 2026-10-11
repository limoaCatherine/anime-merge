// 投放倒计时环：围绕待投放角色的进度环 + 数字气泡。
import { GameConfig } from '../config/GameConfig.js';
import { drawText } from './draw.js';

/**
 * @param {number} fraction 剩余比例 1..0
 * @param {number} seconds  剩余整秒
 */
export function drawCountdownRing(ctx, x, y, r, fraction, seconds, time) {
  const urgent = seconds <= 3;
  const color = fraction > 0.5 ? '#5ccf8a' : fraction > 0.25 ? '#ffb347' : GameConfig.colors.danger;
  const rr = r + 7;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fraction);
  ctx.stroke();
  ctx.restore();

  // 数字气泡 (右上角)
  const bx = x + rr * 0.72 + 4;
  const by = y - rr * 0.72 - 4;
  const pulse = urgent ? 1 + 0.18 * Math.abs(Math.sin(time * Math.PI * 2)) : 1;
  ctx.save();
  ctx.translate(bx, by);
  ctx.scale(pulse, pulse);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
  drawText(ctx, String(seconds), 0, 1, { size: 17, color: '#fff' });
  ctx.restore();
}
