// 音量设置面板：总音量 + 角色语音 / 音效 / 背景音乐 滑块 (MixerSystem)，恢复默认 / 完成。
// 菜单 (左上角图标) 与游戏暂停面板 (「音量」按钮) 共用。设置会立即生效并保存。
import { GameConfig } from '../config/GameConfig.js';
import { MixerConfig } from '../config/AudioConfig.js';
import { Button } from './Button.js';
import { Slider } from './Slider.js';
import { drawPanel, drawText } from './draw.js';

export class SettingsPanel {
  constructor(game, { onClose, top = 300 }) {
    this.game = game;
    this.top = top;
    const mixer = game.mixer;
    const cx = game.width / 2;
    this.sliders = MixerConfig.channels.map((ch, i) => new Slider({
      channel: ch,
      x: 168, y: top + 112 + i * 66, w: 250,
      label: MixerConfig.labels[ch],
      min: 0, max: MixerConfig.max[ch], value: mixer.get(ch),
      color: ch === 'master' ? GameConfig.colors.primary : GameConfig.colors.secondary,
      onChange: (v) => mixer.set(ch, v),
      onRelease: () => { if (ch === 'sfx' || ch === 'master') game.audio.play('merge', { level: 3 }); },
    }));
    this.resetBtn = new Button({ x: cx - 92, y: top + 392, w: 160, h: 54, label: '恢复默认', style: 'secondary', fontSize: 20, onClick: () => { mixer.reset(); this.sync(); } });
    this.closeBtn = new Button({ x: cx + 92, y: top + 392, w: 160, h: 54, label: '完成', fontSize: 22, onClick: onClose });
    [this.resetBtn, this.closeBtn].forEach((b) => { b.audio = game.audio; });
    this.buttons = [...this.sliders, this.resetBtn, this.closeBtn];
  }

  /** 打开面板前 / 恢复默认后，同步滑块显示 */
  sync() {
    for (const s of this.sliders) s.value = this.game.mixer.get(s.channel);
  }

  slider(channel) { return this.sliders.find((s) => s.channel === channel); }

  render(ctx, dt) {
    const w = this.game.width;
    const C = GameConfig.colors;
    const t = this.top;
    drawPanel(ctx, 34, t, w - 68, 450, 28);
    drawText(ctx, '音量设置', w / 2, t + 40, { size: 28, color: C.primary });
    drawText(ctx, '100% 为推荐音量 · 各声道最高 200%', w / 2, t + 72, { size: 13, color: '#9a7bb0', weight: 'normal' });
    for (const s of this.sliders) s.render(ctx);
    if (this.game.audio.muted) drawText(ctx, '（当前已静音，点击右上角喇叭恢复）', w / 2, t + 352, { size: 13, color: C.primaryDark, weight: 'normal' });
    this.resetBtn.render(ctx, dt);
    this.closeBtn.render(ctx, dt);
  }
}
