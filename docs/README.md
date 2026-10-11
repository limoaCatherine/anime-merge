# 《美少女合成》AnimeMerge

一款"合成大西瓜 / Suika Game"玩法的 2D 物理合成小游戏：投放可爱的二次元少女头像，两个相同等级碰到一起就会合成为更高级的角色，最终目标是合成出第 11 级 **「星海女神」**！

- 技术栈：纯 HTML5 Canvas + JavaScript (ES Modules) + [Matter.js](https://brm.io/matter-js/) 物理引擎
- 完全离线：Matter.js 已放在 `vendor/`，音效由 WebAudio 实时合成，角色语音与背景音乐为预生成的音频文件
- 原创背景音乐：轻松可爱的 lo-fi / 八音盒循环曲，菜单与游戏中连续播放，可单独开关
- 三种难度（简单 / 普通 / 困难），各难度最高分分别保存
- 每位角色在一局中**第一次登场**时，会用符合她形象的声线说一句日语台词（AivisSpeech 自然人声风格语音 + 日中双语字幕 + 「NEW!」徽章）
- 竖屏 9:16，自动适配窗口；支持鼠标、触屏和键盘

| 困难模式 | 主菜单 |
| --- | --- |
| ![困难模式](screenshot-hard.png) | ![主菜单](screenshot-menu.png) |

---

## 一、如何运行

### ★ 方式 1：桌面版（推荐给玩家）
双击 **`release\美少女合成\美少女合成.exe`** —— 游戏在独立窗口中运行，没有命令行黑框、没有浏览器。

- Windows 10/11 x64，无需安装任何运行库（自带 Electron 运行时，不依赖 WebView2 / Python / Node）
- 可以把整个 `美少女合成` 文件夹复制到任何位置；右键 exe →「发送到 → 桌面快捷方式」即可放到桌面
- 窗口为竖屏 9:16，按屏幕高度自动调整大小，拖动缩放时保持比例；重复双击只会激活已打开的窗口
- 存档（各难度最高分、设置）保存在 `%APPDATA%\AnimeMerge`，删除/更新游戏文件夹不会丢失
- 首次运行时 Windows SmartScreen 可能提示"已保护你的电脑"（exe 未做代码签名），点击「更多信息 → 仍要运行」即可

### 方式 2：浏览器直接玩
双击 `dist/index.html` 即可（已打包成单个经典脚本，`file://` 下不会有跨域问题）。

### 方式 3：开发模式（修改源码时）
需要 Node.js 18+：
```bash
npm install          # 安装 esbuild / matter-js / playwright (仅开发需要)
npm run build        # 打包 src/ -> dist/
npm run serve        # 启动本地服务器 http://localhost:8765/
```
- `http://localhost:8765/index.html`：**开发版**，直接加载 `src/` 下的 ES 模块源码（改完刷新即可，必须通过服务器访问）
- `http://localhost:8765/dist/index.html`：**发布版**，修改源码后需重新 `npm run build`
- Windows 上也可以双击 `tools\dev-start.bat`：自动用 Python 或 Node 启动本地服务器并在浏览器中打开 `dist/index.html`（仅供开发调试）
- `npm run desktop`：用开发模式的 Electron 打开桌面窗口（可用开发者工具）

### 打包桌面版 (Windows x64)
```bash
npm install
npm run package:win      # -> release/美少女合成/美少女合成.exe
```
流程（`tools/package.mjs`）：`npm run build` → 组装最小应用目录（`desktop/` + `dist/` + package.json）→ `@electron/packager` 打包 win32-x64（app.asar）→ `tools/win-resources.mjs` 用纯 JS 的 `resedit` 写入 exe 图标与版本信息（产品名「美少女合成」、公司「上海盖姆艾尔网络科技有限公司」），**在 Linux/macOS 上打包也不需要 wine**。

- 修改图标：替换 `assets/images/girl_11.png` 后运行 `npm run icons`（生成 `assets/icons/app.ico` 16~256 多尺寸、`app.png`、`favicon.png`），再重新打包
- 修改版本号：改 `package.json` 的 `version`
- 桌面外壳代码：`desktop/main.js`（窗口大小、标题、背景色、单实例、禁用开发者工具、外部链接用系统浏览器打开、允许语音自动播放）

### 自动化测试
```bash
npx playwright install chromium   # 首次需要
npm run build && npm test
```
桌面版测试（Linux 上打包同一份应用并在虚拟屏幕中运行）：
```bash
npm run package:linux && xvfb-run -a npm run test:desktop
```
验证：打包模式运行、窗口标题、无菜单栏、9:16 窗口、开发者工具已禁用、从 app.asar 内加载、图片/语音加载、开局问候与合成语音自动播放、单实例锁、localStorage 存档跨重启保留、无控制台错误。

浏览器版测试会用无头浏览器验证：无控制台报错、语音文件存在并可播放、难度选择、简单难度的「整理」道具、普通难度 8 秒倒计时自动投放与最后 3 秒滴答声、暂停时停表、合成「月之公主」胜利并继续无尽、困难难度 4 秒倒计时 / 窄场地 / 石头升起与碎裂、同级合成与语音字幕、连续合成只播最高级语音、最高级合成大奖、警戒线判负、分难度最高分存档，以及开发版源码可运行。

---

## 二、玩法

| 操作 | 鼠标 / 触屏 | 键盘 |
| --- | --- | --- |
| 瞄准 | 左右移动 / 按住拖动 | ← → 或 A D |
| 投放 | 点击 / 松开手指 | 空格 / 回车 / ↓ |
| 暂停 | 右上角 ⏸ 按钮 | P / Esc |
| 整理（简单） | HUD「整理」按钮 | T |
| 选难度（菜单） | 点击 简单/普通/困难 | ← → 或 1 2 3 |

- 每次只会出现最低几级中的角色（简单 4 级，普通/困难 5 级；开局前几个只出最低 3 级），顶部显示"下一个"
- 两个**相同等级**的角色接触 → 在接触点合成为下一级，并获得分数（短时间内连续合成有"连锁"加成）
- 两个**「星海女神」**相遇 → 双双升华消失，**+1000 分**大奖
- 静止的角色越过顶部**红色警戒线**持续一段时间（简单 3 秒 / 普通 2 秒 / 困难 1.5 秒）→ 游戏结束
- 各难度的最高分、通关记录分别保存在浏览器 `localStorage` 中

### 难度设计

配置文件：`src/config/DifficultyConfig.js`

| 项目 | 简单 | 普通 | 困难 |
| --- | --- | --- | --- |
| 投放倒计时 | 无 | 每次 8 秒（超时在当前瞄准位置自动投放） | 每次 4 秒 |
| 倒计时提示 | — | 待投放角色外圈进度环 + 数字，最后 3 秒滴答声 | 同左 |
| 可投放等级 | 1~4 级 | 1~5 级 | 1~5 级（权重偏向大角色 16/20/24/22/18） |
| 警戒线判负时间 | 3 秒 | 2 秒 | 1.5 秒 |
| 场地 / 重力 | 标准 | 标准 | 左右各收窄 22px（宽 452），重力 ×1.15 |
| 道具 | 「整理」×3：清除场上当前最小等级的全部角色 | — | — |
| 障碍 | — | — | 每约 25 秒（首次 18 秒）在底部随机位置预警 1.5 秒后升起一块石头；石头不能合成，邻接发生 2 次合成后碎裂（会显示裂纹）；场上最多 3 块 |
| 目标 | 无尽模式 | 合成「月之公主」(Lv9) → 胜利，可选继续无尽 | 合成「星海女神」(Lv11) → 胜利，可选继续无尽 |
| 最高分 | 单独保存 | 单独保存 | 单独保存 |

- 暂停（或切到后台）时倒计时、石头计时、物理全部停止
- HUD 显示难度标签、目标进度胶囊（如「目标：月之公主 Lv.6/9」），底部进化链用金色虚线圈标出目标角色

### 角色语音台词（AivisSpeech）

- 每局游戏中，每位角色只在**第一次被合成出来**时说话（字幕带「NEW! 角色名」徽章）；之后再合成出同一角色只有普通的合成音效
- 新的一局（新游戏 / 重新开始 / 更换难度）会重置
- 第 1 级「见习学妹」的台词作为开局问候（算作她的首次登场）

1.5 版起语音由 **AivisSpeech Engine 1.2.0**（基于 Style-Bert-VITS2，由 BERT 根据整句意思生成语调与节奏）生成。
**1.6 版**：保留大家喜欢的第 1 级（コハク・あまあま）不变，把第 2~11 级换成**更有感情、更像二次元少女**的声线——去掉了成熟平淡的「リアボVC」成年女声和 morioki，优先使用与コハク同一制作方（Oz Chat，CV：ねゆたろ）的模型，并为每位角色选择带感情的「风格」（あまあま / からかい / せつなめ / 喜び / キュート / 元気 …）、提高感情强度与语速缓急，台词也改成带「！」「…」的感情化写法。**所有模型均允许商用（含游戏）**，授权见下方「语音授权说明」。

配置：`src/config/VoiceConfig.js`（台词、字幕、朗读文本、引擎/模型/风格与参数、署名）；语音文件：`assets/audio/voice/voice_01.mp3 ~ voice_11.mp3`

| 等级 | 角色 | 语音模型（风格） | 参数 (感情强度 / 语速缓急 / 音高 / 语速) | 选择理由 | 台词 | 中文 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 见习学妹 | コハク（あまあま） | 1.3 / 1.0 / 0 / 1.0 | 「子猫般的甜美声音」，害羞撒娇的学妹（1.5 版原样保留） | えっと…よろしくね、先輩♡ | 那个……请多关照哦，前辈♡ |
| 2 | 元气同学 | 凛音エル（Happy） | 1.4 / 1.25 / +0.03 / 1.0 | 动漫系元气少女声，开心风格起伏最大 | やったぁ！ねえねえ、一緒に遊ぼうよ！ | 太好啦！呐呐，一起玩嘛！ |
| 3 | 图书委员 | みちのくあいり（標準） | 1.35 / 1.15 / +0.02 / 0.95 | 沉稳又可爱的角色声，害羞吞吐的文学少女 | あ、あの…よかったら、私とお話ししてくれませんか…？ | 那、那个……方便的话，能和我聊聊吗……？ |
| 4 | 社团部长 | リダ / Lida（キュート） | 1.35 / 1.2 / +0.03 / 1.0 | VTuber 的感情表现模型，可爱又有干劲 | えへへっ！任せてください、私、がんばっちゃいます！ | 嘿嘿！交给我吧，我会加油的！ |
| 5 | 偶像练习生 | らせつん（喜び） | 1.35 / 1.2 / +0.03 / 1.0 | 8 种感情风格的角色声，「喜悦」风格音高起伏最大，偶像感 | キラキラのステージ、ちゃんと見ててね！約束だよ♪ | 闪闪发光的舞台，要好好看着我哦！约好了♪ |
| 6 | 魔法少女 | 黄金笑（Positive） | 1.35 / 1.2 / +0.03 / 1.0 | 明亮的高音少女声，积极风格 | えいっ！魔法で、あなたを笑顔にしちゃうんだから！ | 嘿！我要用魔法让你露出笑容！ |
| 7 | 精灵巫女 | まお（あまあま） | 1.4 / 1.2 / +0.02 / 1.0 | 与コハク同 CV 的甜美风格，温柔又有生气 | ふふっ…やっと会えたね。あなたに会えて、すっごく嬉しいな…！ | 呵呵……终于见到你了。能遇见你，真的好开心呀……！ |
| 8 | 星辉歌姬 | リダ / Lida（元気２） | 1.4 / 1.25 / +0.02 / 1.0 | 元气开朗的歌姬，明快欢乐 | わぁい！この歌、あなただけに届けるね！いっしょに歌おう♪ | 哇——！这首歌只唱给你听！一起唱吧♪ |
| 9 | 月之公主 | コハク（せつなめ） | 1.4 / 1.15 / +0.02 / 0.95 | 同一甜美声线的「略带惆怅」风格，梦幻又甜 | 月の光の下で…ずーっと、あなたを待ってたの…えへへ♡ | 在月光下……我一直、一直在等你哦……嘿嘿♡ |
| 10 | 天空女王 | まお（からかい） | 1.4 / 1.2 / 0 / 1.0 | 「小恶魔」逗弄风格，高傲又俏皮的女王 | あらあら、よくぞここまで来たわね…ふふっ、特別に褒めてあげる♡ | 哎呀呀，能来到这里真了不起……呵呵，特别夸夸你♡ |
| 11 | 星海女神 | まお（おちつき）+ 轻混响 | 1.35 / 1.15 / −0.01 / 0.95 | 沉静温暖的风格，混响营造神圣感（仅女神加混响） | 星の海から、愛を込めて…これからも、ずーっと一緒だよ♡ | 自星之海，满怀爱意……今后也要永远在一起哦♡ |

生成与质检（`tools/generate_voices.mjs` + `tools/pick_voice_takes.py`）：
- 参数：`intonationScale`（AivisSpeech 中为「风格/感情强度」）1.3~1.4，`tempoDynamicsScale`（语速缓急）1.15~1.25，`pitchScale` 只做 ±0.03 以内的微调（年轻角色略高；幅度再大会劣化音质），`speedScale` 0.95~1.0
- **选 take**：AivisSpeech 每次合成略有不同，每句生成 **8 个候选**：先用 faster-whisper 语音识别比对台词（字符错误率），只保留读音正确的候选（不超过最低错误率 + 0.04）；再从中选**感情最丰富**的一条——音高范围、音高标准差、能量动态三项在候选内标准化后求和取最高。结果记录在 `docs/voice-qa.json`
- 后期：裁首尾静音 → 低切 100Hz → 4kHz 轻微削减 2dB（减少刺耳感）→ 齿音抑制 → 女神加轻混响 → 响度统一到 **−20 LUFS**（再按实测值做一次增益校正，误差 ±1 LU 以内）→ 44.1kHz 单声道 96kbps mp3
- 也保留 VOICEVOX 支持：把某句的 `voice.engine` 设为 `'voicevox'` 并填写 VOICEVOX 的 `styleId` 即可

语音系统规则（`src/systems/VoiceSystem.js`）：
- 使用 `HTMLAudioElement` 播放 mp3，`file://` 双击运行和桌面版（app.asar 内）都能出声
- 同一时刻有多位角色首次登场时，先播放**最高等级**的台词，其余排队在当前语音结束后播放（最多等待 9 秒）；更高等级可以打断正在播放的低等级台词；两句之间至少间隔 0.6 秒，不会叠音
- 菜单可单独开关「语音」，并遵守右上角的全局静音；音量由「音量设置」控制
- 若语音文件加载失败，自动改用浏览器自带的 `speechSynthesis`（ja-JP）朗读
- 字幕气泡（日文 + 小字中文 + NEW! 徽章）在合成位置附近显示，时长 = max(3.4 秒, 语音时长 + 0.8 秒)；台词较长时自动在标点处折成两行；静音时字幕照常显示

### 背景音乐与音量

- 曲目：**《星糖午后》(Starlight Sugar Afternoon)** —— 原创，由 `tools/compose_bgm.py` 程序化作曲并渲染（numpy 合成器，未使用任何第三方音源/采样/音乐素材，无版权问题）
  - 风格：轻松可爱的 lo-fi + 八音盒；F 大调，84 BPM，swing 八分音符
  - 编制：八音盒主旋律、FM 电钢琴和弦、柔和贝斯、暖色铺底、轻量 lo-fi 鼓（底鼓/边击/沙锤）、极轻黑胶噪声、混响
  - 和弦：Fmaj7 – Am7 – B♭maj7 – C7sus/C7 – Dm7 – Gm7 – Gm7/C7 – Fmaj7；24 小节（A 旋律 / B 旋律 / A 旋律 + 高八度点缀）≈ 68.6 秒
  - 无缝循环：渲染时把越过循环点的延音与混响尾音叠回开头，首尾波形连续；`assets/audio/bgm/bgm_main.ogg`（主用，循环无缝）与 `bgm_main.mp3`（兜底）
- 播放（`src/systems/BgmSystem.js`）：
  - 全局服务，菜单 → 游戏 → 结算之间连续播放，**不会**因切换场景而重新开始
  - `HTMLAudioElement` 循环播放，`file://` 与桌面版都可用；浏览器版在第一次点击后开始，桌面版启动即播放
  - 菜单「音乐：开/关」与游戏暂停面板「音乐」按钮单独开关（会保存）；遵守右上角全局静音
  - 窗口隐藏/最小化时暂停，回来后从原位置淡入继续
  - 角色台词播放时自动把 BGM 压低到 55%（约 −5 dB），台词结束后平滑恢复
- 默认音量（1.5 版再次整体调低）：

  | 声音 | 100% 时的音量 | 1.4 版 | 音频文件响度 |
  | --- | --- | --- | --- |
  | 角色语音 | 0.30 | 0.50 | −20 LUFS（原 −16） |
  | 合成音效 | 0.12 | 0.25 | WebAudio 实时合成 |
  | 背景音乐 | 0.15（台词播放时 ×0.55） | 0.28 | −22 LUFS（原 −16.8） |

  按以上默认值，台词比 BGM 高约 8 dB，BGM 闪避时约 13 dB，始终清晰；即使把滑块拉满也不会刺耳。
- **音量设置面板**（菜单左上角「推子」图标，或游戏中 暂停 → 「音量」）：总音量 0~100%，角色语音 / 音效 / 背景音乐 各 0~200%（100% = 推荐音量），拖动立即生效并保存；「恢复默认」一键回到 100%。实际音量 = 声道 100% 音量 × 声道滑块 × 总音量（`src/systems/MixerSystem.js`）
- 旧存档迁移：存档带有设置版本号（`SaveSystem.SETTINGS_VERSION = 3`）。旧版本存档中保存的音量会被丢弃并改用新的默认值，最高分/通关记录/开关等设置保留。

### 制作人员 / 署名（Credits）

菜单「制作人员」面板中同样列出以下信息：

- 出品：上海盖姆艾尔网络科技有限公司
- 角色语音（AivisSpeech）：AivisSpeech: コハク / AivisSpeech: 凛音エル / AivisSpeech: みちのくあいり / AivisSpeech: リダ / Lida / AivisSpeech: らせつん / Tαkoe:AivisSpeech:黄金笑 / AivisSpeech: まお
- リダ / Lida：https://youtube.com/channel/UC2tX473Zo09ZCnhAUNdAvjA/join
- 背景音乐：《星糖午后》原创（程序化作曲，tools/compose_bgm.py）
- 物理引擎：Matter.js（MIT License）；桌面版运行时：Electron（MIT License）

#### 语音授权说明

- 语音合成软件：AivisSpeech Engine（LGPL-3.0）——只在开发时离线生成 mp3，**不随游戏分发**；语音模型本身也**不随游戏分发**，游戏里只有生成好的 mp3
- 7 个语音模型均来自 AivisHub，**全部允许商用（含游戏）**：

| 模型 | 使用等级 | AivisHub UUID | 授权 | 署名要求 | 制作 / 声音提供 |
| --- | --- | --- | --- | --- | --- |
| コハク | 1, 9 | 22e8ed77… | ACML 1.0 | 任意（按作者希望标注「AivisSpeech: コハク」） | オズチャット -Oz Chat- / Trippy（CV：ねゆたろ） |
| まお | 7, 10, 11 | a59cb814… | ACML 1.0 | 任意（「AivisSpeech: まお」） | オズチャット -Oz Chat- / Trippy（CV：ねゆたろ） |
| みちのくあいり | 3 | 1b2830f4… | ACML 1.0 | 任意 | こずかた学園プロジェクト / Aivis Project（声：上戸恵里） |
| らせつん | 5 | 9f36ec0d… | ACML 1.0 | 任意 | こずかた学園プロジェクト / Aivis Project（声：上戸恵里） |
| 凛音エル | 2 | f5017410… | ACML 1.0 | 任意 | kokuren / 電脳天使工業 |
| リダ / Lida（感情表现模型） | 4, 8 | 446d2053… | 作者自定授权：商用·非商用均可 | **必须**注明角色名「リダ」或「Lida」及 URL https://youtube.com/channel/UC2tX473Zo09ZCnhAUNdAvjA/join | リダ |
| 黄金笑_T2 | 6 | 734c12b6… | Tαkoeプロジェクト利用規約：商用·非商用、个人·法人均可 | **必须**著作权表示，格式如「Tαkoe:AivisSpeech:黄金笑」 | Yumehaki Project V / VSMB Project |

- ACML 1.0：除禁止事项（冒充话者本人、诽谤中伤、虚假信息、诈骗、政治/宗教宣传、犯罪等）外，个人/法人、营利/非营利均可使用，**包括游戏**。全文见 `docs/licenses/ACML-1.0.md`，或 https://github.com/Aivis-Project/ACML
- リダ 授权全文：`docs/licenses/Lida-voice-model.txt`。禁止：模型的二次分发/转让、作为训练素材、暴力或性相关用途、损害「リダ」角色形象/品牌或其他被认为不当的用途。**注意：作者声明该授权可能随时变更**——发布前/更新时请到 AivisHub 模型页确认最新条款
- Tαkoe 规约全文：`docs/licenses/Takoe-project-tos.txt`（原文 http://wedst.pj.ymhk.jp/tos.html）。禁止：无著作权表示的使用、违反公序良俗、宗教活动、反社会势力、**赌博相关用途**、损害角色形象、侵害第三方权利等；未经生成者许可二次利用本游戏生成的语音也属禁止
- 未采用：ACML-NC（仅限非营利）模型、CC BY-SA（相同方式共享）模型、条款需另行到外部网站确认的模型、来源不明的试作模型
- 1.5 版使用的 リアボVC 系模型（さつき・れな・もえ・ほのか・かりん・わかな）与 morioki 已全部替换，游戏中不再包含这些声音

### 角色等级表

| 等级 | 名称 | 半径 | 合成得分 |
| --- | --- | --- | --- |
| 1 | 见习学妹 | 22 | 1 |
| 2 | 元气同学 | 30 | 3 |
| 3 | 图书委员 | 39 | 6 |
| 4 | 社团部长 | 49 | 10 |
| 5 | 偶像练习生 | 60 | 15 |
| 6 | 魔法少女 | 72 | 21 |
| 7 | 精灵巫女 | 85 | 28 |
| 8 | 星辉歌姬 | 99 | 36 |
| 9 | 月之公主 | 114 | 45 |
| 10 | 天空女王 | 130 | 55 |
| 11 | 星海女神 | 148 | 66 |

---

## 三、项目结构

```
AnimeMerge/
├─ release/
│  └─ 美少女合成/           ★ 桌面版 (双击 美少女合成.exe)
│     ├─ 美少女合成.exe
│     ├─ resources/app.asar  游戏本体 (desktop/ + dist/)
│     └─ *.dll / *.pak / locales/ …  Electron 运行时
├─ desktop/
│  ├─ main.js              Electron 主进程 (桌面窗口外壳)
│  └─ icon.png             窗口图标
├─ index.html              开发版入口 (ES Module，需本地服务器)
├─ package.json            npm 脚本: build / serve / test / package:win / package:linux / test:desktop / icons / voices
├─ dist/                   ★ 发布版 (双击 dist/index.html 即可玩)
│  ├─ index.html, favicon.png
│  ├─ game.js              esbuild 打包后的全部游戏代码
│  ├─ style.css
│  ├─ assets/icons/          app.ico (16~256) / app.png / favicon.png
├─ vendor/matter.min.js
│  └─ assets/  images/girl_XX.png, audio/voice/voice_XX.mp3, audio/bgm/bgm_main.ogg|mp3
├─ src/
│  ├─ main.js              入口：创建 Game 并启动
│  ├─ style.css
│  ├─ lib/matter.js        统一导出 window.Matter
│  ├─ config/
│  │  ├─ GameConfig.js     画面/容器/物理/节奏/配色等全局参数
│  │  ├─ LevelConfig.js    11 级角色表 (图片、名称、半径、分数、颜色)
│  │  ├─ DifficultyConfig.js 三种难度规则 + resolveRules()
│  │  ├─ VoiceConfig.js    11 句台词 (日文/中文/TTS 文本)、语音模型/风格/参数、署名、语音音量
│  │  └─ AudioConfig.js    音效/BGM 默认音量、BGM 文件、闪避参数、音量滑块设置 (MixerConfig)
│  ├─ core/
│  │  ├─ Game.js           主循环、画布缩放、全局服务装配
│  │  ├─ EventBus.js       事件总线 (发布/订阅)
│  │  ├─ StateMachine.js   有限状态机
│  │  ├─ Scene.js          场景基类
│  │  ├─ SceneManager.js   场景切换 + 淡入淡出 + 输入分发
│  │  └─ AssetLoader.js    图片预加载 (失败时生成占位图)
│  ├─ scenes/
│  │  ├─ BootScene.js      加载进度
│  │  ├─ MenuScene.js      主菜单 / 玩法说明 / 图鉴
│  │  ├─ GameScene.js      按难度组合各系统 (playing / paused / victory / over 状态)
│  │  └─ GameOverScene.js  结算
│  ├─ systems/
│  │  ├─ PhysicsSystem.js  Matter.js 封装，固定步长，重力随难度
│  │  ├─ SpawnSystem.js    当前/下一个角色按难度权重随机 + 投放冷却
│  │  ├─ DropTimerSystem.js 投放倒计时 / 最后 3 秒滴答 / 超时自动投放
│  │  ├─ ItemSystem.js     「整理」道具
│  │  ├─ ObstacleSystem.js 困难模式石头：预警、升起、开裂、碎裂
│  │  ├─ GoalSystem.js     难度目标 / 胜利 / 继续无尽
│  │  ├─ VoiceSystem.js    日语角色语音 (首次登场、排队、冷却、兜底 TTS)
│  │  ├─ BgmSystem.js      背景音乐 (跨场景循环、开关、静音、隐藏暂停、台词闪避)
│  │  ├─ MixerSystem.js    音量混合：总音量 + 语音/音效/音乐 声道 (持久化)
│  │  ├─ SubtitleSystem.js 语音字幕气泡
│  │  ├─ MergeSystem.js    同级碰撞合成、最高级大奖
│  │  ├─ ScoreSystem.js    计分、连锁
│  │  ├─ InputSystem.js    Pointer Events + 键盘 → 逻辑坐标
│  │  ├─ AudioSystem.js    WebAudio 合成音效 (订阅玩法事件自动发声)
│  │  ├─ EffectSystem.js   粒子、光环、飘字、闪光、震屏
│  │  └─ SaveSystem.js     localStorage 存档 + 设置版本迁移
│  ├─ entities/
│  │  ├─ Character.js      角色实体 (圆形刚体 + 头像贴图)
│  │  └─ Stone.js          石头障碍实体 (程序生成纹理 + 裂纹)
│  └─ ui/
│     ├─ HUD.js            分数/难度/下一个/整理/按钮/目标进度/进化链
│     ├─ Button.js         画布按钮 (主/次/图标/选项卡) + 图标
│     ├─ CountdownRing.js  待投放角色的倒计时环
│     ├─ VictoryPanel.js   胜利面板
│     ├─ CreditsPanel.js   制作人员 / 署名面板
│     ├─ SettingsPanel.js  音量设置面板 (菜单与暂停共用)
│     ├─ Slider.js         画布滑块
│     └─ draw.js           绘制工具函数
├─ assets/
│  ├─ images/girl_01.png ... girl_11.png   圆形透明头像 (256px，带分级描边)
│  ├─ images/source/girl_XX_raw.jpg        原始立绘
│  ├─ audio/voice/voice_01..11.mp3          角色语音 (AivisSpeech 生成)
│  └─ audio/bgm/bgm_main.ogg / .mp3         背景音乐 (原创，程序化作曲)
├─ assets/icons/          app.ico (16~256) / app.png / favicon.png
├─ vendor/matter.min.js    Matter.js 0.19.0 (离线)
├─ tools/
│  ├─ build.mjs            esbuild 打包脚本
│  ├─ serve.js             零依赖本地静态服务器
│  ├─ process_images.py    原图 → 圆形头像 (Pillow)
│  ├─ generate_voices.mjs  台词 → 语音 mp3 (AivisSpeech / VOICEVOX 引擎 HTTP API + ffmpeg)
│  ├─ pick_voice_takes.py  多个候选语音中用语音识别挑出读音最准的一条 (faster-whisper)
│  ├─ compose_bgm.py       程序化作曲并渲染背景音乐 (numpy + ffmpeg)
│  ├─ make_icons.py        头像 → app.ico / app.png / favicon.png
│  ├─ package.mjs          桌面版打包 (Electron)
│  ├─ win-resources.mjs    写入 exe 图标与版本信息 (resedit)
│  ├─ dev-start.bat        开发用：本地服务器 + 浏览器打开
│  ├─ test.mjs             浏览器版自动化测试 (Playwright)
│  └─ test-desktop.mjs     桌面版自动化测试 (Playwright + Electron)
└─ docs/README.md          本文档
```

### 架构图

```
                    ┌──────────────────────────────── Game ────────────────────────────────┐
  window / canvas → │  InputSystem ──emit──►  EventBus  ◄──on── AudioSystem / VoiceSystem   │
                    │                           ▲   │                                       │
                    │  SaveSystem   AssetLoader │   │ input:* 转发                           │
                    │                           │   ▼                                       │
                    │                     SceneManager (淡入淡出)                           │
                    │       ┌──────────┬─────────┴──┬──────────────┐                        │
                    │   BootScene  MenuScene   GameScene     GameOverScene                  │
                    └──────────────────────────────┼───────────────────────────────────────┘
                                                   │ resolveRules(难度) → rules
                                                   │ 组合 (StateMachine: playing/paused/victory/over)
   ┌─────────────┬────────────┬──────────────┬─────┴───────┬─────────────┬──────────────┬──────────┐
 Physics      Spawn       DropTimer        Merge         Score        Obstacle        Goal      Item
 (Matter.js)  (权重)      (倒计时)          │             ▲            (石头)          ▲
   │ physics:collision ─────────────────────┘             │              ▲              │
   │                                       merge {level, sources} ───────┴──────────────┘
   │                                         │ (EventBus)
   │                     ┌───────────────────┼───────────────────┬────────────────┐
   │               EffectSystem         AudioSystem        VoiceSystem ──voice:line──► SubtitleSystem
   └──► Character / Stone 实体
```

数据流：`InputSystem` 把鼠标/触屏转换为 540×960 的逻辑坐标 → `SceneManager` 转发给当前场景 → `GameScene` 投放 `Character` → `PhysicsSystem` 推进并广播碰撞 → `MergeSystem` 判断同级合成并发出 `merge` 事件 → `ScoreSystem`、`EffectSystem`、`AudioSystem` 各自响应。系统之间不直接互相调用，只通过事件总线解耦；难度差异全部体现在 `rules` 数据中，场景与系统里没有 `if (difficulty === ...)` 分支。

全局音频服务由 `Game` 持有、与场景无关：`AudioSystem`（音效）、`VoiceSystem`（台词，发出 `voice:line` / `voice:start` / `voice:end`）、`BgmSystem`（背景音乐，监听 `audio:mute`、`app:hidden/visible`、`voice:start/end` 实现静音、隐藏暂停与闪避），因此 BGM 跨场景连续播放。

主要事件：`drop`、`merge`、`merge:max`、`score:changed`、`timer:tick`、`timer:expired`、`stone:warn/spawn/hit/break`、`item:tidy`、`goal:reached`、`game:start`、`game:over`、`voice:line`、`danger:warn`。

---

## 四、如何换皮 (Reskin)

1. **替换角色图片**
   - 最简单：直接用自己的 **256×256 圆形透明 PNG** 覆盖 `assets/images/girl_01.png` ~ `girl_11.png`
   - 或者：把原图放到 `assets/images/source/girl_XX_raw.jpg`，运行 `python tools/process_images.py`（需要 `pip install pillow`），自动裁成圆形并加描边（描边颜色在脚本 `RING_COLORS` 中修改）
2. **修改角色名称/大小/分数/颜色**：编辑 `src/config/LevelConfig.js`；数量可增减，`MAX_LEVEL` 自动计算
3. **修改标题、配色、手感**：编辑 `src/config/GameConfig.js`（`title`、`colors`、`physics.gravityY`、`dangerY`、`dropCooldown`、`spawnTierCount` 等）
4. **修改难度**：编辑 `src/config/DifficultyConfig.js`（倒计时、投放权重、判负时间、场地收窄、重力、道具次数、目标等级、石头参数），也可以新增难度并加入 `DIFFICULTY_ORDER`
5. **修改台词 / 声线 / 重新生成语音**：编辑 `src/config/VoiceConfig.js` 中的 `text`（字幕）、`zh`（翻译）、`tts`（朗读文本）、`voice`（`engine`、`modelUuid`、`styleId`、`speed/intonation/tempo`）和 `credit`（署名），然后：
   ```bash
   # 1) 启动 AivisSpeech Engine (Windows 直接打开 AivisSpeech 应用即可；Linux 用 AivisSpeech-Engine 的 ./run --port 10101)
   #    缺少的模型会按 modelUuid 自动从 AivisHub 安装；http://127.0.0.1:10101/speakers 可查看 styleId
   # 2) 需要 ffmpeg 在 PATH 中
   npm run voices                                        # 每句生成 1 条，直接写入 assets
   node tools/generate_voices.mjs --only 3,5             # 只重做第 3、5 句
   # 推荐：每句多生成几条，再自动挑选 (需 pip install faster-whisper pykakasi numpy)
   node tools/generate_voices.mjs --takes 8 --out build/voice-takes
   python tools/pick_voice_takes.py build/voice-takes   # 先看读音是否正确，再选感情起伏最大的一条 (--only voice_07 只处理某句)
   ```
   更换模型时请先确认该模型在 AivisHub 上的授权（商用请选 ACML 1.0 / CC0，或确认作者自定授权允许商用），并按授权要求更新 `credit` 署名。
   也可以直接用自己录制的 mp3 覆盖 `assets/audio/voice/voice_XX.mp3`
6. **修改 / 重新生成背景音乐**：编辑 `tools/compose_bgm.py` 中的 `BPM`、`PROG`（和弦进行）、`MEL_A/MEL_B`（旋律），然后
   ```bash
   pip install numpy            # 另需 ffmpeg
   python tools/compose_bgm.py  # 输出 assets/audio/bgm/bgm_main.ogg 与 .mp3
   ```
   也可以换成自己的循环曲（同名 ogg/mp3 覆盖即可；第三方音乐请确认授权，例如 CC0）；音量在 `src/config/AudioConfig.js` 调整
7. **重新打包**：`npm run build`，然后打开 `dist/index.html`

> 提示：图片只要文件名与 `LevelConfig.js` 里的 `image` 路径一致即可，可以改用 `.webp` 等格式。

---

## 五、说明

- 角色立绘均为原创二次元风格形象，不涉及已有版权角色
- 浏览器策略要求用户首次点击后才能播放声音，所以菜单界面第一次点击之前没有音效（背景音乐在第一次点击后开始，开局问候语在点击「开始游戏」后播放；桌面版不受此限制）
- 角色语音由 AivisSpeech（AivisHub 模型，ACML 1.0 / リダ授权 / Tαkoe 规约，均可商用）合成，署名见上方「制作人员」；背景音乐为原创程序化作曲
- 部分浏览器在 `file://` 下可能限制 `localStorage`，若最高分没有保存，请使用桌面版 exe（或 `tools\dev-start.bat` 以服务器方式运行）
