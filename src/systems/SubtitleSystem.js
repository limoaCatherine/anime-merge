// 字幕系统：显示语音台词 (日文 + 小字中文翻译) 的气泡，出现在合成位置附近。
import { GameConfig } from '../config/GameConfig.js';
import { VoiceConfig } from '../config/VoiceConfig.js';
import { CHARACTERS } from '../config/LevelConfig.js';
import { roundRectPath } from '../ui/draw.js';

export class SubtitleSystem {
  constructor(events, container) {
    this.container = container;
    this.current = null;
    this.off = events.on('voice:line', (e) => this.show(e));
  }

  show({ index, line, x, y, first }) {
    const def = CHARACTERS[index];
    // 第 1 级的开局问候不算"新角色"，不显示 NEW!
    this.current = { line, x, y, color: def.ringColor, r: def.radius, life: 0, max: Math.max(VoiceConfig.subtitleTime, (line.dur || 0) + 0.8), isNew: first && index > 0, name: def.name };
  }

  update(dt) {
    if (!this.current) return;
    this.current.life += dt;
    if (this.current.life >= this.current.max) this.current = null;
  }

  render(ctx) {
    const s = this.current;
    if (!s) return;
    const font = GameConfig.fontFamily;
    ctx.save();
    // 台词较长时：在标点 (…、！？。) 处折成两行；仍然太宽则缩小字号
    const maxW = this.container.right - this.container.left - 12;
    if (!s.layout) s.layout = layoutLines(ctx, font, s.line, maxW - 32);
    const { jp, zh, f1, f2 } = s.layout;
    ctx.font = `bold ${f1}px ${font}`;
    const w1 = Math.max(...jp.map((t) => ctx.measureText(t).width));
    ctx.font = `${f2}px ${font}`;
    const w2 = Math.max(...zh.map((t) => ctx.measureText(t).width));
    const w = Math.min(maxW, Math.max(w1, w2) + 32);
    const lh1 = f1 + 4, lh2 = f2 + 3;
    const h = 22 + jp.length * lh1 + zh.length * lh2;
    const c = this.container;
    const cx = Math.max(c.left + w / 2 + 4, Math.min(c.right - w / 2 - 4, s.x));
    let cy = s.y - s.r * 0.6 - 26 - h / 2;
    cy = Math.max(GameConfig.dangerY + 40, Math.min(c.bottom - 80, cy));
    const k = s.life / s.max;
    const appear = Math.min(1, s.life / 0.18);
    const alpha = k > 0.8 ? (1 - k) / 0.2 : 1;
    const scale = 0.7 + 0.3 * (1 - Math.pow(1 - appear, 3));
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy - (1 - appear) * 10);
    ctx.scale(scale, scale);
    ctx.shadowColor = 'rgba(120,60,140,0.25)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;
    roundRectPath(ctx, -w / 2, -h / 2, w, h, 18);
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 3;
    ctx.strokeStyle = s.color;
    ctx.stroke();
    // 小尾巴
    ctx.beginPath();
    ctx.moveTo(-8, h / 2 - 1); ctx.lineTo(0, h / 2 + 10); ctx.lineTo(8, h / 2 - 1);
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let y = -h / 2 + 11 + lh1 / 2;
    ctx.font = `bold ${f1}px ${font}`;
    ctx.fillStyle = '#e2457f';
    for (const t of jp) { ctx.fillText(t, 0, y); y += lh1; }
    y += (lh2 - lh1) / 2 + 1;
    ctx.font = `${f2}px ${font}`;
    ctx.fillStyle = '#8a6d9e';
    for (const t of zh) { ctx.fillText(t, 0, y); y += lh2; }
    // 「NEW!」徽章 + 角色名 (首次登场)
    if (s.isNew) {
      const bob = Math.sin(s.life * 10) * 1.5;
      ctx.save();
      ctx.translate(-w / 2 + 6, -h / 2 - 2 + bob);
      ctx.rotate(-0.18);
      ctx.font = `bold 13px ${font}`;
      const label = `NEW! ${s.name}`;
      const bw = ctx.measureText(label).width + 16;
      roundRectPath(ctx, -6, -11, bw, 22, 11);
      ctx.fillStyle = '#ff4f8b';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.fillText(label, 2, 1);
      ctx.restore();
    }
    ctx.restore();
  }

  destroy() {
    this.off();
  }
}

/** 把文本在最靠近中间的标点后切成两行 */
function splitAtPunct(text) {
  const marks = [];
  for (let i = 1; i < text.length - 2; i++) if ('…、！？。，'.includes(text[i])) marks.push(i + 1);
  if (!marks.length) { const m = Math.ceil(text.length / 2); return [text.slice(0, m), text.slice(m)]; }
  // 连续的 "……" 不要拆开
  const best = marks.filter((i) => !'…'.includes(text[i] || '')).sort((a, b) => Math.abs(a - text.length / 2) - Math.abs(b - text.length / 2))[0] ?? marks[0];
  return [text.slice(0, best), text.slice(best)];
}

export function layoutLines(ctx, font, line, maxW) {
  const fit = (lines, size, bold) => {
    ctx.font = `${bold ? 'bold ' : ''}${size}px ${font}`;
    const w = Math.max(...lines.map((t) => ctx.measureText(t).width));
    return w <= maxW ? size : Math.max(11, Math.floor(size * maxW / w));
  };
  const measure = (t, size, bold) => { ctx.font = `${bold ? 'bold ' : ''}${size}px ${font}`; return ctx.measureText(t).width; };
  const jp = measure(line.text, 20, true) > maxW ? splitAtPunct(line.text) : [line.text];
  const zh = measure(line.zh, 13, false) > maxW ? splitAtPunct(line.zh) : [line.zh];
  return { jp, zh, f1: fit(jp, 20, true), f2: fit(zh, 13, false) };
}
