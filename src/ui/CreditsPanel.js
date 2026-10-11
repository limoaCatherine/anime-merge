// 制作人员 / Credits 面板：游戏信息、角色语音署名 (AivisSpeech / AivisHub 模型，均允许商用；リダ・Tαkoe 按授权要求署名)、背景音乐、开源库。
import { GameConfig } from '../config/GameConfig.js';
import { CHARACTERS } from '../config/LevelConfig.js';
import { VOICE_LINES } from '../config/VoiceConfig.js';
import { AudioConfig } from '../config/AudioConfig.js';
import { Button } from './Button.js';
import { drawPanel, drawText, drawPortrait } from './draw.js';

export class CreditsPanel {
  constructor(game, { onClose }) {
    this.game = game;
    this.closeBtn = new Button({ x: game.width / 2, y: 900, w: 200, h: 54, label: '关闭', fontSize: 22, onClick: onClose });
    this.closeBtn.audio = game.audio;
    this.buttons = [this.closeBtn];
  }

  render(ctx, dt) {
    const w = this.game.width;
    const C = GameConfig.colors;
    drawPanel(ctx, 24, 404, w - 48, 534, 26);
    drawText(ctx, '制作人员 / Credits', w / 2, 434, { size: 24, color: C.primary });
    drawText(ctx, `出品：${GameConfig.publisher}`, w / 2, 466, { size: 14, color: C.text });
    drawText(ctx, '角色语音（AivisSpeech · AivisHub 模型，均可商用）', w / 2, 494, { size: 15, color: C.secondary });
    VOICE_LINES.forEach((line, i) => {
      const y = 520 + i * 26;
      const def = CHARACTERS[i];
      drawPortrait(ctx, this.game.assets.getImage(def.key), 64, y, 11);
      drawText(ctx, `Lv${i + 1} ${def.name}`, 82, y + 1, { size: 13, color: C.text, align: 'left', weight: 'normal' });
      drawText(ctx, line.credit, w - 50, y + 1, { size: 13, color: '#6a4f80', align: 'right' });
    });
    const y0 = 520 + VOICE_LINES.length * 26 + 6;
    drawText(ctx, 'リダ / Lida：youtube.com/channel/UC2tX473Zo09ZCnhAUNdAvjA/join', w / 2, y0 - 4, { size: 12, color: '#9a7bb0', weight: 'normal' });
    drawText(ctx, (this.game.platform.name === 'douyin' || this.game.platform.name === 'wechat') ? '物理引擎 Matter.js（MIT）' : '物理引擎 Matter.js（MIT）· 桌面版 Electron（MIT）', w / 2, y0 + 12, { size: 12, color: '#9a7bb0', weight: 'normal' });
    drawText(ctx, '音效：程序合成（原创）· 角色立绘为原创', w / 2, y0 + 28, { size: 12, color: '#9a7bb0', weight: 'normal' });
    drawText(ctx, `背景音乐：《${AudioConfig.bgm.title.split(' (')[0]}》原创（程序化作曲）`, w / 2, y0 + 44, { size: 12, color: '#9a7bb0', weight: 'normal' });
    this.closeBtn.render(ctx, dt);
  }
}
