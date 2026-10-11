// 全局游戏参数：画面尺寸、容器、物理、节奏、配色等。
// 想调手感/难度，优先改这里。
export const GameConfig = {
  title: '美少女合成',
  subtitle: 'AnimeMerge',
  publisher: '狸猫',          // 出品方 (标题画面「出品：狸猫」、制作人员、exe 版本信息)
  version: '1.8.0',

  // 逻辑分辨率 (9:16 竖屏)，实际显示按窗口等比缩放
  width: 540,
  height: 960,

  // 容器 (物理墙内侧边界)
  container: {
    left: 22,
    right: 518,
    top: 108,     // 仅用于绘制容器外框
    bottom: 888,  // 地面
    wallThickness: 80,
  },

  hudHeight: 96,
  dropY: 162,          // 待投放角色的中心 y
  dangerY: 236,        // 警戒线
  dangerTime: 2.0,     // 默认判负时间 (实际由 DifficultyConfig 中各难度覆盖)
  dangerGrace: 1.0,    // 新落下/新合成的角色在此时间内不参与判负
  dangerSpeed: 2.2,    // 速度低于该值视为"静止"
  dangerJitter: 6,     // 或者：0.4 秒内的净位移小于该值 (像素) 也视为"静止" —— 防止卡住抖动的角色永远不判负
  dropCooldown: 0.55,  // 两次投放间隔 (秒)

  // 投放：只从最低的 N 级中随机
  spawnTierCount: 5,
  spawnWeights: [32, 26, 20, 13, 9],
  earlyDrops: 4,          // 开局前几次只出最小的 3 级
  earlyTierCount: 3,

  topMergeBonus: 1000,    // 两个最高级合成的奖励
  comboWindow: 0.8,       // 连锁判定窗口 (秒)

  physics: {
    gravityY: 1.65,
    restitution: 0.18,
    friction: 0.25,
    frictionStatic: 0.6,
    frictionAir: 0.01,
    density: 0.0012,
    timestep: 1000 / 60,
    maxSubSteps: 5,
    positionIterations: 10,
    velocityIterations: 8,
    spawnScale: 0.55,     // 合成新角色从多大开始"长大"
    growSpeed: 4.5,
    maxSpeed: 40,         // 每个物理步 (1/60 秒) 最多移动多少像素，防止高速穿墙
  },

  fontFamily: '"PingFang SC","Microsoft YaHei","Hiragino Sans GB","Noto Sans CJK SC","Noto Sans SC",sans-serif',

  colors: {
    bgTop: '#ffe1f0',
    bgBottom: '#dcd6ff',
    primary: '#ff6fa8',
    primaryDark: '#e2457f',
    secondary: '#8f7cff',
    secondaryDark: '#6a56e0',
    text: '#5a3d6e',
    textLight: '#ffffff',
    danger: '#ff4d6d',
    panel: 'rgba(255,255,255,0.88)',
    letterbox: '#e6d8fb',     // 抖音版屏幕比例不是 9:16 时上下/左右留边的颜色
  },

  storageKey: 'animeMerge.save.v1',
};
