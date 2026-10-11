// 侧边栏复访奖励面板 (抖音)。按《「必接」侧边栏复访能力技术指南》：
// - 只有 tt.checkScene 返回 isExist=true 时才在菜单显示入口
// - 点击「领取奖励」时用最新的 tt.onShow 参数判断是否从侧边栏进入 (launch_from=homepage & location=sidebar_card)
// - 不是从侧边栏进入：提供「去侧边栏」按钮，调用 tt.navigateToScene({ scene: 'sidebar' })
// 奖励：下一局额外 1 次「整理」(每天可领取 1 次)。
import { GameConfig } from '../config/GameConfig.js';
import { PlatformConfig } from '../config/PlatformConfig.js';
import { Button } from './Button.js';
import { drawPanel, drawText } from './draw.js';

export function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export class SidebarPanel {
  constructor(game, { onClose }) {
    this.game = game;
    const cx = game.width / 2;
    this.actionBtn = new Button({ x: cx, y: 760, w: 260, h: 64, label: '', fontSize: 26, onClick: () => this.action() });
    this.closeBtn = new Button({ x: cx, y: 846, w: 180, h: 52, label: '关闭', style: 'secondary', fontSize: 22, onClick: onClose });
    this.buttons = [this.actionBtn, this.closeBtn];
    this.buttons.forEach((b) => { b.audio = game.audio; });
    this.msg = '';
  }

  get claimedToday() { return this.game.save.get('sidebarClaimDate', '') === todayKey(); }
  get fromSidebar() { return this.game.platform.launchedFromSidebar; }

  refresh() {
    if (this.claimedToday) { this.actionBtn.label = '今日已领取'; this.actionBtn.enabled = false; }
    else if (this.fromSidebar) { this.actionBtn.label = '领取奖励'; this.actionBtn.enabled = true; }
    else { this.actionBtn.label = '去侧边栏'; this.actionBtn.enabled = true; }
  }

  action() {
    const save = this.game.save;
    if (this.claimedToday) return;
    if (this.fromSidebar) {
      const n = PlatformConfig.douyin.sidebarReward.tidy || 1;
      save.set('bonusTidy', (save.get('bonusTidy', 0) || 0) + n);
      save.set('sidebarClaimDate', todayKey());
      this.msg = `领取成功！下一局额外 +${n} 次「整理」`;
      this.game.events.emit('sidebar:claim', { tidy: n });
    } else {
      this.game.platform.navigateToSidebar().then((ok) => { if (!ok) this.msg = '暂时无法打开侧边栏，请手动从抖音首页侧边栏进入'; });
    }
    this.refresh();
  }

  render(ctx, dt) {
    this.refresh();
    const w = this.game.width;
    const C = GameConfig.colors;
    drawPanel(ctx, 34, 410, w - 68, 476, 26);
    drawText(ctx, '侧边栏奖励', w / 2, 448, { size: 28, color: C.primary });
    const n = PlatformConfig.douyin.sidebarReward.tidy || 1;
    drawText(ctx, `从抖音首页「侧边栏」进入游戏，每天可领取：`, w / 2, 492, { size: 16, color: C.text, weight: 'normal' });
    drawText(ctx, `下一局额外 +${n} 次「整理」`, w / 2, 524, { size: 22, color: C.secondary });
    const steps = [
      '① 点击下方「去侧边栏」',
      '② 在抖音首页侧边栏找到「美少女合成」',
      '③ 从侧边栏进入游戏，回到这里点「领取奖励」',
    ];
    steps.forEach((t, i) => drawText(ctx, t, 70, 572 + i * 32, { size: 16, color: C.text, align: 'left', weight: 'normal' }));
    if (this.fromSidebar && !this.claimedToday) drawText(ctx, '你是从侧边栏进入的，可以领取啦！', w / 2, 694, { size: 16, color: '#3fb27f' });
    if (this.msg) drawText(ctx, this.msg, w / 2, 718, { size: 15, color: '#ff8a00' });
    for (const b of this.buttons) b.render(ctx, dt);
  }
}
