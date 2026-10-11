// 主菜单：标题、难度选择、开始按钮、玩法说明、语音开关、音乐开关、制作人员、音量设置、各难度最高分与角色图鉴。
import { Scene } from '../core/Scene.js';
import { GameConfig } from '../config/GameConfig.js';
import { CHARACTERS } from '../config/LevelConfig.js';
import { DIFFICULTIES, DIFFICULTY_ORDER, DEFAULT_DIFFICULTY } from '../config/DifficultyConfig.js';
import { Button, Icons } from '../ui/Button.js';
import { CreditsPanel } from '../ui/CreditsPanel.js';
import { SettingsPanel } from '../ui/SettingsPanel.js';
import { SidebarPanel } from '../ui/SidebarPanel.js';
import { drawBackground, drawText, drawPanel, drawPortrait } from '../ui/draw.js';

export class MenuScene extends Scene {
  constructor(game) {
    super(game, 'menu');
  }

  enter() {
    const w = this.game.width;
    const save = this.game.save;
    this.showHelp = false;
    this.showCredits = false;
    this.credits = new CreditsPanel(this.game, { onClose: () => { this.showCredits = false; } });
    this.showSettings = false;
    this.settings = new SettingsPanel(this.game, { top: 410, onClose: () => { this.showSettings = false; } });
    this.difficulty = DIFFICULTIES[save.get('difficulty')] ? save.get('difficulty') : DEFAULT_DIFFICULTY;

    this.tabs = DIFFICULTY_ORDER.map((id, i) => new Button({
      x: w / 2 + (i - 1) * 132, y: 548, w: 118, h: 50, style: 'tab', fontSize: 22,
      label: DIFFICULTIES[id].name, color: DIFFICULTIES[id].color, id,
      onClick: () => this.selectDifficulty(id),
    }));
    this.startBtn = new Button({ x: w / 2, y: 656, w: 260, h: 70, label: '开始游戏', fontSize: 32, onClick: () => this.startGame() });
    // 底部一排：玩法说明 / 语音开关 / 音乐开关 / 制作人员
    const rowX = (i) => w / 2 + (i - 1.5) * 124;
    const rowBtn = (i, label, onClick) => new Button({ x: rowX(i), y: 738, w: 116, h: 52, label, style: 'secondary', fontSize: 17, onClick });
    this.helpBtn = rowBtn(0, '玩法说明', () => { this.showHelp = true; });
    this.voiceBtn = rowBtn(1, '', () => { this.game.voice.toggle(); this.refreshVoiceLabel(); });
    this.bgmBtn = rowBtn(2, '', () => { this.game.bgm.toggle(); this.refreshVoiceLabel(); });
    this.creditsBtn = rowBtn(3, '制作人员', () => { this.showCredits = true; });
    this.closeHelpBtn = new Button({ x: w / 2, y: 742, w: 200, h: 56, label: '知道啦', fontSize: 24, onClick: () => { this.showHelp = false; } });
    this.muteBtn = new Button({ x: w - 40, y: 40, w: 46, h: 46, style: 'icon', icon: Icons.sound(this.game.audio.muted), onClick: () => {
      this.muteBtn.icon = Icons.sound(this.game.audio.toggleMute());
    } });
    this.settingsBtn = new Button({ x: 40, y: 40, w: 46, h: 46, style: 'icon', icon: Icons.mixer, onClick: () => { this.settings.sync(); this.showSettings = true; } });
    this.buttons = [...this.tabs, this.startBtn, this.helpBtn, this.voiceBtn, this.bgmBtn, this.creditsBtn, this.muteBtn, this.settingsBtn];
    // 抖音：侧边栏复访奖励入口 (仅当宿主支持跳转侧边栏时显示)
    this.showSidebar = false;
    this.sidebar = new SidebarPanel(this.game, { onClose: () => { this.showSidebar = false; } });
    this.sidebarBtn = new Button({ x: 40, y: 100, w: 52, h: 58, style: 'icon', icon: Icons.gift, label: '奖励', fontSize: 12, visible: false, onClick: () => { this.sidebar.msg = ''; this.showSidebar = true; } });
    this.buttons.push(this.sidebarBtn);
    this.game.platform.checkSidebar().then((ok) => { this.sidebarBtn.visible = !!ok; });
    // 从侧边栏 (热) 启动回到游戏：自动打开奖励面板
    this.listen('app:visible', () => { if (this.sidebarBtn.visible && this.game.platform.launchedFromSidebar && !this.sidebar.claimedToday) this.showSidebar = true; });
    [...this.buttons, this.closeHelpBtn].forEach((b) => { b.audio = this.game.audio; });
    this.refreshVoiceLabel();
    this.selectDifficulty(this.difficulty, true);

    this.floaters = Array.from({ length: 9 }, (_, i) => ({
      level: i % 6,
      x: 40 + ((i * 113) % (w - 80)),
      y: 980 + i * 120,
      speed: 30 + (i % 4) * 12,
      r: 22 + (i % 3) * 8,
      phase: i,
    }));
    this.dt = 1 / 60;
  }

  refreshVoiceLabel() {
    this.voiceBtn.label = this.game.voice.enabled ? '语音：开' : '语音：关';
    this.bgmBtn.label = this.game.bgm.enabled ? '音乐：开' : '音乐：关';
  }

  selectDifficulty(id, silent = false) {
    this.difficulty = id;
    this.tabs.forEach((t) => { t.selected = t.id === id; });
    if (!silent) this.game.save.set('difficulty', id);
  }

  activeButtons() {
    if (this.showSidebar) return this.sidebar.buttons;
    if (this.showSettings) return [...this.settings.buttons, this.muteBtn];
    if (this.showCredits) return this.credits.buttons;
    return this.showHelp ? [this.closeHelpBtn] : this.buttons;
  }

  startGame() {
    this.game.save.set('difficulty', this.difficulty);
    this.game.audio.play('start');
    this.game.scenes.change('game', { difficulty: this.difficulty });
  }

  onKeyDown(e) {
    if (this.showSettings) { if (e.code === 'Escape' || e.code === 'Enter') this.showSettings = false; return; }
    if (this.showSidebar) { if (e.code === 'Escape') this.showSidebar = false; return; }
    if (this.showCredits) { if (e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape') this.showCredits = false; return; }
    if (this.showHelp) { if (e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape') this.showHelp = false; return; }
    if (e.code === 'Enter' || e.code === 'Space') this.startGame();
    const idx = DIFFICULTY_ORDER.indexOf(this.difficulty);
    if (e.code === 'ArrowLeft' && idx > 0) this.selectDifficulty(DIFFICULTY_ORDER[idx - 1]);
    if (e.code === 'ArrowRight' && idx < DIFFICULTY_ORDER.length - 1) this.selectDifficulty(DIFFICULTY_ORDER[idx + 1]);
    if (e.code === 'Digit1') this.selectDifficulty('easy');
    if (e.code === 'Digit2') this.selectDifficulty('normal');
    if (e.code === 'Digit3') this.selectDifficulty('hard');
  }

  update(dt) {
    super.update(dt);
    this.dt = dt;
    for (const f of this.floaters) {
      f.y -= f.speed * dt;
      if (f.y < -60) f.y = 1020;
    }
  }

  render(ctx) {
    const { width: w, height: h } = this.game;
    const C = GameConfig.colors;
    const assets = this.game.assets;
    const save = this.game.save;
    drawBackground(ctx, w, h, this.time);

    for (const f of this.floaters) {
      drawPortrait(ctx, assets.getImage(CHARACTERS[f.level].key), f.x + Math.sin(this.time + f.phase) * 12, f.y, f.r, 0.4);
    }

    const bob = Math.sin(this.time * 2) * 6;
    drawPortrait(ctx, assets.getImage(CHARACTERS[10].key), w / 2, 190 + bob, 86);
    drawText(ctx, `《${GameConfig.title}》`, w / 2, 324 + bob * 0.5, { size: 56, color: C.primary, stroke: '#fff', strokeWidth: 12, shadow: 'rgba(200,80,150,0.4)' });
    drawText(ctx, 'AnimeMerge · 合成你的星海女神', w / 2, 376, { size: 20, color: C.secondary, stroke: '#fff', strokeWidth: 5 });
    drawText(ctx, `出品：${GameConfig.publisher}`, w / 2, 401, { size: 13, color: '#9a7bb0', weight: 'normal' });

    if (this.showSidebar) { this.sidebar.render(ctx, this.dt); return; }
    if (this.showHelp) { this.renderHelp(ctx, w); return; }
    if (this.showCredits) { this.credits.render(ctx, this.dt); return; }
    if (this.showSettings) { this.settings.render(ctx, this.dt); this.muteBtn.render(ctx, this.dt); return; }

    // 各难度最高分
    drawPanel(ctx, 40, 416, w - 80, 86, 22);
    DIFFICULTY_ORDER.forEach((id, i) => {
      const x = w / 2 + (i - 1) * 140;
      const d = DIFFICULTIES[id];
      const sel = id === this.difficulty;
      drawText(ctx, `${d.name}最高${save.isCleared(id) ? ' ★' : ''}`, x, 442, { size: 14, color: sel ? d.color : '#9a7bb0', weight: sel ? 'bold' : 'normal' });
      drawText(ctx, String(save.highScore(id)), x, 474, { size: sel ? 28 : 22, color: sel ? C.primary : '#b89cc9' });
    });

    for (const b of this.buttons) b.render(ctx, this.dt);
    drawText(ctx, DIFFICULTIES[this.difficulty].desc, w / 2, 595, { size: 14, color: C.text, weight: 'normal' });

    // 图鉴
    drawPanel(ctx, 20, 782, w - 40, 166, 22, 'rgba(255,255,255,0.7)');
    drawText(ctx, '角色图鉴（同级相碰即可升级）', w / 2, 804, { size: 15, color: C.text });
    const best = save.bestLevel;
    for (let i = 0; i < CHARACTERS.length; i++) {
      const row = i < 6 ? 0 : 1;
      const col = row === 0 ? i : i - 6;
      const count = row === 0 ? 6 : 5;
      const x = w / 2 + (col - (count - 1) / 2) * 80;
      const y = 846 + row * 58;
      drawPortrait(ctx, assets.getImage(CHARACTERS[i].key), x, y - 6, 22, i <= best ? 1 : 0.45);
      drawText(ctx, CHARACTERS[i].name, x, y + 22, { size: 11, color: C.text, weight: 'normal' });
    }
  }

  renderHelp(ctx, w) {
    const C = GameConfig.colors;
    drawPanel(ctx, 30, 410, w - 60, 380, 26);
    drawText(ctx, '玩法说明', w / 2, 444, { size: 26, color: C.primary });
    const lines = [
      '· 左右移动瞄准，松开手指/鼠标投放角色',
      '· 两个相同的角色碰到一起会合成更高级角色',
      '· 一共 11 级，最高级是「星海女神」',
      '· 两位星海女神相遇：+1000 大奖！',
      '· 角色堆过红色警戒线一段时间 → 游戏结束',
      '· 简单：无限时，可用 3 次「整理」清掉最小角色',
      '· 普通：8 秒倒计时，合成「月之公主」即通关',
      '· 困难：4 秒倒计时 + 石头障碍，目标「天空女王」',
      '· 石头不能合成，旁边合成 2 次就会碎掉',
      '· 键盘：← → 移动，空格投放，T 整理，P 暂停',
    ];
    lines.forEach((l, i) => drawText(ctx, l, 52, 480 + i * 23, { size: 14, color: C.text, align: 'left', weight: 'normal' }));
    this.closeHelpBtn.render(ctx, this.dt);
  }
}
