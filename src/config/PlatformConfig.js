// ============================================================================
//  平台配置 —— 抖音 AppID / 激励视频广告位 ID 等【只需要在这一个文件里填写】
// ============================================================================
//  TODO(上架前必填)：
//   1. douyin.appId              抖音开放平台 → 小游戏 → 「开发」→「开发设置」里的 AppID (tt 开头)
//                                 (build:douyin 会把它写进 douyin/project.config.json；也可以在抖音开发者工具导入时填写)
//   2. douyin.rewardedAdUnitId   「商业化」→「流量主」→「广告管理」→ 新建「激励视频广告」得到的广告位 ID
//                                 留空 = 不接真实广告：隐藏所有「看视频」按钮；复活变成每局 1 次免费「再试一次」，看视频 +1 整理隐藏
//                                 (流量主需游戏上线后才能开通，个人主体还要求 DAU≥50 —— 所以首发版本通常先留空)
//   3. douyin.softwareCopyrightNo 计算机软件著作权登记号 (审核要求在游戏开始画面显著位置标明)，拿到软著后填写
//  修改后重新执行  npm run build:douyin
//
//  微信小游戏 (wechat 段)：
//   1. wechat.appId              微信公众平台 mp.weixin.qq.com →「开发」→「开发管理」→「开发设置」里的 AppID (wx 开头)
//                                 (留 TODO = build:wechat 写入 touristappid 游客模式，只能在开发者工具里跑，不能真机预览/上传)
//   2. wechat.rewardedAdUnitId   「流量主」→「广告管理」→ 新建「激励广告」得到的广告位 ID (adunit-xxxx)
//                                 留空 = 同抖音：隐藏所有「看视频」按钮，每局 1 次免费「再试一次」
//                                 (流量主开通条件：累计独立访客 UV > 500 等，见 docs/微信上架说明.md)
//   3. wechat.softwareCopyrightNo 软著登记号 (有就填，启动页显示)
//  修改后重新执行  npm run build:wechat
// ============================================================================
export const PlatformConfig = {
  douyin: {
    appId: 'TODO_填写抖音小游戏AppID',            // TODO
    rewardedAdUnitId: 'TODO_填写激励视频广告位ID', // TODO
    softwareCopyrightNo: '',                       // TODO 例如 '2026SR0123456'
    projectName: '美少女合成',
    mediaSubpackage: 'media',                      // 语音 + BGM 所在的分包名 (= 目录名)
    useWebAudio: false,                            // 抖音不保证 WebAudio：音效使用预渲染 mp3
    recordDuration: 300,                           // 录屏最长秒数 (平台上限 300 秒)
    minShareSeconds: 3,                            // 少于 3 秒的录屏不能分享
    shareTitle: '我在《美少女合成》合成了美少女！',
    videoTopics: ['美少女合成', '合成小游戏'],
    healthAdvice: true,                            // 开始画面显示《健康游戏忠告》(审核要求)
    ageRating: '8+',                               // 适龄提示 (按平台「适龄提示分段表」自评)
    sidebarReward: { tidy: 1 },
    freeReviveWithoutAds: true,                    // 未填广告位时：每局 1 次免费「再试一次」(填了广告位后自动变回看视频复活)                    // 侧边栏复访奖励：下一局额外 1 次「整理」(每天 1 次)
  },
  wechat: {
    appId: 'wx6def2bda0bd75e11',                  // 微信小游戏 AppID (2026-10-11 注册)
    rewardedAdUnitId: 'TODO_填写激励广告位ID',     // TODO adunit- 开头
    softwareCopyrightNo: '',                       // TODO 例如 '2026SR0123456'
    projectName: '美少女合成',
    mediaSubpackage: 'media',                      // 语音 + BGM 所在的分包名 (= 目录名)
    shareTitle: '我在《美少女合成》合成了美少女！',
    shareImage: 'images/share.png',                // 转发卡片图 (5:4，包内路径)
    shareTimeline: true,                           // 允许分享到朋友圈 (wx.onShareTimeline)
    healthAdvice: true,                            // 启动页显示《健康游戏忠告》
    ageRating: '8+',                               // 适龄提示 (须与公众平台「适龄提示」设置一致)
    freeReviveWithoutAds: true,                    // 未填广告位时：每局 1 次免费「再试一次」
  },
  web: {
    placeholderAds: true,       // 浏览器版：没有真实广告时显示 5 秒「广告占位」(便于测试复活 / +1 整理流程)
  },
  desktop: {
    placeholderAds: false,      // 桌面 (Electron) 版：不显示广告和看广告入口
  },
  ads: {
    fakeDuration: 5,            // 占位广告时长 (秒)
    revivePerGame: 1,           // 每局可看广告复活次数
    tidyPerGame: 1,             // 每局可看广告 +1 整理 次数
    reviveClearBand: 90,        // 复活：清除顶部高于 警戒线 + 90px 的角色/石头
  },
};

/** 已填写的激励视频广告位 ID (未填写 / 仍是 TODO 时返回空字符串) */
export function douyinAdUnitId() {
  // 自动化测试 (tools/test-douyin.mjs) 可通过全局变量模拟已填写/未填写广告位
  const test = typeof globalThis !== 'undefined' ? globalThis.__AM_TEST_AD_UNIT__ : undefined;
  if (typeof test === 'string') return test;
  const id = PlatformConfig.douyin.rewardedAdUnitId || '';
  return /^TODO/i.test(id) ? '' : id;
}

/** 已填写的微信激励广告位 ID (未填写 / 仍是 TODO 时返回空字符串) */
export function wechatAdUnitId() {
  const test = typeof globalThis !== 'undefined' ? globalThis.__AM_TEST_AD_UNIT__ : undefined;
  if (typeof test === 'string') return test;
  const id = PlatformConfig.wechat.rewardedAdUnitId || '';
  return /^TODO/i.test(id) ? '' : id;
}
