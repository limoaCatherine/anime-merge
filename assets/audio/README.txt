音效：全部由 src/systems/AudioSystem.js 使用 WebAudio 实时合成，无需文件。
语音：voice/voice_01..11.mp3 由 tools/generate_voices.mjs 调用 AivisSpeech Engine 生成 (AivisHub 模型，ACML 1.0 / リダ授权 / Tαkoe 规约，均可商用，响度 -20 LUFS)，台词/模型/署名见 src/config/VoiceConfig.js。
背景音乐：bgm/bgm_main.ogg (主用，无缝循环) 与 bgm_main.mp3 (兜底) 由 tools/compose_bgm.py 原创程序化作曲渲染 (响度 -22 LUFS)，无第三方素材。
