// 角色语音台词表 (按等级 1..11)。
// text: 字幕显示的日文  zh: 中文翻译  tts: 交给语音合成的文本 (去掉 ♡♪ 等符号，用 、。… 控制停顿与语气)
// dur: 语音时长 (秒，字幕至少显示这么久)  file: 预生成的语音文件 —— 由 tools/generate_voices.mjs 调用语音合成引擎生成
// voice: 合成参数
//   engine: 'aivisspeech' (AivisSpeech Engine，Style-Bert-VITS2 系，更自然) 或 'voicevox'
//   model/modelUuid: AivisHub 上的语音模型 (ACML 1.0 或作者自定的允许商用的授权，见 VOICE_LICENSE / docs/README.md)
//   speaker/style/styleId: 说话人与风格
//   speed=speedScale  intonation=intonationScale (AivisSpeech 中为「风格/感情的强度」)
//   tempo=tempoDynamicsScale (语速缓急，越大越"生")  pitch=pitchScale (只做 ±0.03 的微调，年轻角色略高)
//   reverb: 后期加一点混响 (仅女神)
// credit: 署名 (显示在菜单「制作人员」与 README；ACML 1.0 中署名为任意；リダ / Tαkoe 的授权要求必须署名，格式按作者指定)
// 第 1 级不会由合成产生，用作开局问候语。每一句在每局游戏中只会在该角色"第一次登场"时播放。
const AIVIS = 'aivisspeech';
export const VOICE_LINES = [
  { file: 'assets/audio/voice/voice_01.mp3', dur: 2.90, text: 'えへへっ…よろしくねっ、先輩♡', zh: '嘿嘿……请多关照哦，前辈♡',
    tts: 'えへへっ、よろしくねっ、先輩！',
    voice: { engine: AIVIS, model: 'コハク', modelUuid: '22e8ed77-94fe-4ef2-871f-a86f94e9a579', speaker: 'コハク', style: 'あまあま', styleId: 1878365377, speed: 1.2, intonation: 1.4, tempo: 1.3, pitch: 0 },
    credit: 'AivisSpeech: コハク' },
  { file: 'assets/audio/voice/voice_02.mp3', dur: 2.98, text: 'もう～、早く遊ぼうよっ！', zh: '真是的～快来一起玩嘛！',
    tts: 'もー、早く遊ぼうよっ！',
    voice: { engine: AIVIS, model: '凛音エル', modelUuid: 'f5017410-fbb5-49e1-97cb-e785f42e15f5', speaker: '凛音エル', style: 'Happy', styleId: 1388823427, speed: 1.25, intonation: 1.5, tempo: 1.3, pitch: 0.03 },
    credit: 'AivisSpeech: 凛音エル' },
  { file: 'assets/audio/voice/voice_03.mp3', dur: 5.77, text: 'あ、あのっ…お話し、しよ？', zh: '那、那个……我们聊聊天吧？',
    tts: 'あ、あのっ、お話し、しよ？',
    voice: { engine: AIVIS, model: 'みちのくあいり', modelUuid: '1b2830f4-8cf1-4184-a0d9-3a1bace3a844', speaker: 'みちのくあいり', style: '標準', styleId: 1717361472, speed: 1.2, intonation: 1.45, tempo: 1.3, pitch: 0.02 },
    credit: 'AivisSpeech: みちのくあいり' },
  { file: 'assets/audio/voice/voice_04.mp3', dur: 4.70, text: 'えへへっ、任せてくださいっ！', zh: '嘿嘿，交给我吧！',
    tts: 'えへへっ、任せてくださいっ！',
    voice: { engine: AIVIS, model: 'リダ / Lida', modelUuid: '446d2053-14ca-4b68-897c-380faf555b59', speaker: 'リダ / Lida', style: 'キュート', styleId: 1349521256, speed: 1.25, intonation: 1.5, tempo: 1.3, pitch: 0.03 },
    credit: 'AivisSpeech: リダ / Lida' },
  { file: 'assets/audio/voice/voice_05.mp3', dur: 5.15, text: 'わぁっ！ステージ、見ててねっ♪', zh: '哇！要好好看我的舞台哦♪',
    tts: 'わぁっ！ステージ、見ててねっ！',
    voice: { engine: AIVIS, model: 'らせつん', modelUuid: '9f36ec0d-8dac-42dc-aff4-149c5f99faad', speaker: 'らせつん', style: '喜び', styleId: 893625025, speed: 1.25, intonation: 1.5, tempo: 1.3, pitch: 0.03 },
    credit: 'AivisSpeech: らせつん' },
  { file: 'assets/audio/voice/voice_06.mp3', dur: 3.81, text: 'えいっ！魔法で笑顔にしちゃう！', zh: '嘿！用魔法让你笑起来！',
    tts: 'えいっ！魔法で笑顔にしちゃう！',
    voice: { engine: AIVIS, model: '黄金笑', modelUuid: '734c12b6-eaf2-4dbd-8596-8663c72d2afa', speaker: '黄金笑', style: 'Positive', styleId: 1618811330, speed: 1.25, intonation: 1.5, tempo: 1.3, pitch: 0.03 },
    credit: 'Tαkoe:AivisSpeech:黄金笑' },
  { file: 'assets/audio/voice/voice_07.mp3', dur: 5.46, text: 'ふふっ、やっと会えたね…嬉しいなっ', zh: '呵呵，终于见到你了……好开心呀',
    tts: 'ふふっ、やっと会えたね、嬉しいなっ！',
    voice: { engine: AIVIS, model: 'まお', modelUuid: 'a59cb814-0083-4369-8542-f51a29e72af7', speaker: 'まお', style: 'あまあま', styleId: 888753762, speed: 1.18, intonation: 1.5, tempo: 1.3, pitch: 0.02 },
    credit: 'AivisSpeech: まお' },
  { file: 'assets/audio/voice/voice_08.mp3', dur: 5.02, text: 'わぁい！一緒に歌おっ♪', zh: '哇——！一起唱歌吧♪',
    tts: 'わぁい！一緒に歌おっ！',
    voice: { engine: AIVIS, model: 'リダ / Lida', modelUuid: '446d2053-14ca-4b68-897c-380faf555b59', speaker: 'リダ / Lida', style: '元気２', styleId: 1349521254, speed: 1.25, intonation: 1.5, tempo: 1.3, pitch: 0.02 },
    credit: 'AivisSpeech: リダ / Lida' },
  { file: 'assets/audio/voice/voice_09.mp3', dur: 5.54, text: 'えへへ…ずーっと、待ってたの♡', zh: '嘿嘿……我一直、一直在等你哦♡',
    tts: 'えへへ、ずーっと、待ってたの！',
    voice: { engine: AIVIS, model: 'コハク', modelUuid: '22e8ed77-94fe-4ef2-871f-a86f94e9a579', speaker: 'コハク', style: 'せつなめ', styleId: 1878365378, speed: 1.18, intonation: 1.5, tempo: 1.3, pitch: 0.02 },
    credit: 'AivisSpeech: コハク' },
  { file: 'assets/audio/voice/voice_10.mp3', dur: 5.67, text: 'あらあら、よく来たわね…ふふっ♡', zh: '哎呀呀，你来得正好嘛……呵呵♡',
    tts: 'あらあら、よく来たわね、ふふっ！',
    voice: { engine: AIVIS, model: 'まお', modelUuid: 'a59cb814-0083-4369-8542-f51a29e72af7', speaker: 'まお', style: 'からかい', styleId: 888753764, speed: 1.12, intonation: 1.5, tempo: 1.3, pitch: 0 },
    credit: 'AivisSpeech: まお' },
  { file: 'assets/audio/voice/voice_11.mp3', dur: 5.41, text: 'ふふっ、ずーっと一緒だよ♡', zh: '呵呵，要永远在一起哦♡',
    tts: 'ふふっ、ずーっと一緒だよ！',
    voice: { engine: AIVIS, model: 'まお', modelUuid: 'a59cb814-0083-4369-8542-f51a29e72af7', speaker: 'まお', style: 'おちつき', styleId: 888753763, speed: 1.12, intonation: 1.45, tempo: 1.3, pitch: -0.01, reverb: true },
    credit: 'AivisSpeech: まお' },
];

/** 语音模型授权信息 (README / 制作人员面板用) */
export const VOICE_LICENSE = {
  engine: 'AivisSpeech Engine 1.2.0 (LGPL-3.0，仅用于离线生成语音文件，不随游戏分发)',
  modelLicense: '均允许商用 (含游戏)：ACML 1.0 (コハク・まお・らせつん・みちのくあいり・凛音エル，署名任意) / リダ 自定授权 (必须署名) / Tαkoe 项目利用规约 (必须署名)',
  notes: [
    'コハク / まお：オズチャット -Oz Chat- / Trippy (CV: ねゆたろ) —— ACML 1.0',
    'みちのくあいり / らせつん：こずかた学園プロジェクト / Aivis Project (声：上戸恵里) —— ACML 1.0',
    '凛音エル：kokuren / 電脳天使工業 —— ACML 1.0',
    'リダ / Lida：youtube.com/channel/UC2tX473Zo09ZCnhAUNdAvjA/join —— 作者授权：商用可，需署名「リダ」+URL',
    'Tαkoe:AivisSpeech:黄金笑 —— Tαkoeプロジェクト利用規約 (wedst.pj.ymhk.jp/tos.html)：商用可，需著作权表示',
  ],
};

/** 去重后的署名列表 (用于制作人员面板) */
export const VOICE_CREDITS = [...new Set(VOICE_LINES.map((l) => l.credit))];

export const VoiceConfig = {
  volume: 0.3,          // 语音的 100% 音量 (独立于音效/BGM)；1.3 版 0.95 → 1.4 版 0.5 → 1.5 版 0.3，仍明显高于 BGM
  cooldown: 0.6,        // 两句语音的最短间隔 (秒)
  collectWindow: 0.08,  // 短时间内多次合成时，收集该窗口内的请求并优先播放最高级
  queueExpire: 9,       // 被高等级语音"挤掉"的首次登场语音最多排队等待多少秒 (1.6 版台词最长约 5.8 秒，6 → 9)
  firstTimeOnly: true,  // 每局游戏中每个角色只在第一次登场时说话
  minLevel: 1,          // 合成出 >= 该等级 (0 起) 时触发，即第 2 级起
  subtitleTime: 3.4,    // 字幕最短显示时长 (台词更长时按 dur + 0.8 秒)
  speechRate: 1.1,      // speechSynthesis 兜底时的语速/音高
  speechPitch: 1.45,
};
