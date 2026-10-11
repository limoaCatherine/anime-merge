// 难度配置：每个难度覆盖一组玩法规则。GameScene 通过 resolveRules() 拿到最终规则对象，
// 各系统只读取规则，不关心当前是哪个难度。
import { GameConfig } from './GameConfig.js';

export const DIFFICULTIES = {
  easy: {
    id: 'easy',
    name: '简单',
    color: '#5ccf8a',
    desc: '无限时 · 只出 1~4 级 · 警戒 3 秒 · 3 次「整理」 · 无尽模式',
    spawnWeights: [36, 30, 21, 13],   // 长度 = 可投放的等级数
    dropTimer: 0,                     // 每次投放倒计时 (秒)，0 = 不限时
    dangerTime: 3.0,                  // 越线多少秒判负
    gravityScale: 1.0,
    containerInset: 0,                // 容器左右各收窄多少像素
    tidyUses: 3,                      // 「整理」道具次数
    goalLevel: null,                  // 目标等级 (0 起)；null = 无尽
    stone: null,
  },
  normal: {
    id: 'normal',
    name: '普通',
    color: '#ff8fc7',
    desc: '每次 8 秒倒计时 · 出 1~5 级 · 警戒 2 秒 · 目标：月之公主',
    spawnWeights: [32, 26, 20, 13, 9],
    dropTimer: 8,
    dangerTime: 2.0,
    gravityScale: 1.0,
    containerInset: 0,
    tidyUses: 0,
    goalLevel: 8,                     // 第 9 级「月之公主」
    stone: null,
  },
  hard: {
    id: 'hard',
    name: '困难',
    color: '#9a6bff',
    desc: '4 秒倒计时 · 偏大角色 · 石头障碍 · 警戒 1.5 秒 · 目标：天空女王',
    spawnWeights: [16, 20, 24, 22, 18],
    dropTimer: 4,
    dangerTime: 1.5,
    gravityScale: 1.15,
    containerInset: 12,               // 1.7：22 → 12 (宽 452 → 472)，给大角色留出腾挪空间
    tidyUses: 0,
    goalLevel: 9,                     // 第 10 级「天空女王」(1.7：原目标「星海女神」在机器人模拟中 0% 可达，见 docs/README.md)
    stone: {
      interval: 25,       // 每隔多少秒出现一块石头
      firstDelay: 18,     // 开局后第一块石头的时间
      warnTime: 1.5,      // 出现前的预警时间
      radius: 50,         // 中等大小
      hitsToBreak: 2,     // 邻接合成 2 次后碎裂
      maxStones: 3,       // 场上最多同时存在的石头
      growTime: 1.2,      // 从地面"升起"所需时间
      density: 0.0024,
    },
  },
};

export const DIFFICULTY_ORDER = ['easy', 'normal', 'hard'];
export const DEFAULT_DIFFICULTY = 'normal';

/** 生成某个难度的最终规则 (合并全局默认值) */
export function resolveRules(id) {
  const d = DIFFICULTIES[id] || DIFFICULTIES[DEFAULT_DIFFICULTY];
  const base = GameConfig.container;
  return {
    ...d,
    container: { ...base, left: base.left + d.containerInset, right: base.right - d.containerInset },
    gravityY: GameConfig.physics.gravityY * d.gravityScale,
    stone: d.stone ? { ...d.stone, dangerY: GameConfig.dangerY } : null,
  };
}
