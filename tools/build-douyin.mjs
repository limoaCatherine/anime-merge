// 抖音小游戏构建：npm run build:douyin
// 输出 dist-douyin/ (可直接用「抖音开发者工具」导入的小游戏工程)，并同步复制到 douyin/ (发给用户的目录)。
//
//   game.js              主包入口 (src/main.douyin.js + 全部玩法代码 + matter-js，esbuild 打包压缩)
//   game.json            竖屏、分包配置
//   project.config.json  AppID (来自 src/config/PlatformConfig.js)、打包忽略规则
//   images/              角色立绘 (压缩 PNG)            ┐ 主包 (≤ 4MB)
//   sfx/                 预渲染音效 mp3                 ┘
//   media/               分包 "media"：角色语音 + BGM (mp3)，启动时 tt.loadSubpackage 加载 (≤ 20MB)
//   抖音上架说明.md / 上架资料/   文档、隐私协议、商店文案与截图 (packOptions.ignore，不会被上传)
//
// 包体限制 (抖音开放平台「代码包」文档)：配置分包后整体 ≤ 20MB、主包 ≤ 4MB、单个分包 ≤ 20MB。超出时本脚本报错。
import { build } from 'esbuild';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist-douyin');
const userDir = path.join(root, 'douyin');
const MB = 1024 * 1024;
const LIMITS = { main: 4 * MB, sub: 20 * MB, total: 20 * MB };

// src/ 是 ES 模块语法而 package.json 是 commonjs：先用 esbuild 转一下再读取配置
const cfgBuild = await build({ entryPoints: [path.join(root, 'src/config/PlatformConfig.js')], bundle: true, write: false, format: 'esm', logLevel: 'silent' });
const { PlatformConfig } = await import('data:text/javascript;base64,' + Buffer.from(cfgBuild.outputFiles[0].text).toString('base64'));
const SUB = PlatformConfig.douyin.mediaSubpackage;

async function copyFiles(src, dst, filter) {
  await fs.mkdir(dst, { recursive: true });
  let n = 0;
  for (const e of await fs.readdir(src, { withFileTypes: true })) {
    if (e.isFile() && filter(e.name)) { await fs.copyFile(path.join(src, e.name), path.join(dst, e.name)); n++; }
  }
  return n;
}

async function copyTree(src, dst) {
  await fs.mkdir(dst, { recursive: true });
  for (const e of await fs.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, e.name); const d = path.join(dst, e.name);
    if (e.isDirectory()) await copyTree(s, d); else await fs.copyFile(s, d);
  }
}

async function dirSize(dir, skip = () => false) {
  let total = 0;
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    const rel = path.relative(out, p).replace(/\\/g, '/');
    if (skip(rel, e)) continue;
    total += e.isDirectory() ? await dirSize(p, skip) : (await fs.stat(p)).size;
  }
  return total;
}

// esbuild 插件：抖音版把 lib/matter.js (读取全局 window.Matter) 换成直接打包 npm matter-js
const matterPlugin = {
  name: 'douyin-matter',
  setup(b) {
    b.onResolve({ filter: /lib\/matter\.js$/ }, () => ({ path: path.join(root, 'src/lib/matter.bundled.js') }));
  },
};

async function main() {
  const t0 = Date.now();
  await fs.rm(out, { recursive: true, force: true });
  await fs.mkdir(out, { recursive: true });

  const result = await build({
    entryPoints: [path.join(root, 'src/main.douyin.js')],
    bundle: true,
    format: 'iife',
    target: ['es2017'],
    minify: true,
    sourcemap: false,
    outfile: path.join(out, 'game.js'),
    legalComments: 'none',
    charset: 'utf8',
    metafile: true,
    plugins: [matterPlugin],
    logLevel: 'warning',
  });

  // 静态检查：打包进来的游戏源码 (src/，不含 matter-js) 不能直接引用 window / document / localStorage
  const bad = [];
  for (const input of Object.keys(result.metafile.inputs)) {
    if (!input.startsWith('src/')) continue;
    const code = (await fs.readFile(path.join(root, input), 'utf8')).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const m = code.match(/\b(window|document|localStorage|navigator)\s*\.|new\s+(Audio|Image)\s*\(/g);
    if (m) bad.push(`${input}: ${[...new Set(m)].join(', ')}`);
  }
  if (bad.length) throw new Error(`抖音版代码中引用了浏览器专有对象：\n  ${bad.join('\n  ')}`);

  // 资源
  const imgSrc = path.join(root, 'assets/images/douyin');
  const hasCompressed = await fs.stat(imgSrc).then(() => true, () => false);
  await copyFiles(hasCompressed ? imgSrc : path.join(root, 'assets/images'), path.join(out, 'images'), (n) => /^girl_\d+\.png$/i.test(n));
  if (!hasCompressed) console.warn('[build-douyin] 未找到压缩图片 assets/images/douyin/，使用原图 (可运行 python tools/compress_images_douyin.py)');
  await copyFiles(path.join(root, 'assets/audio/sfx'), path.join(out, 'sfx'), (n) => n.endsWith('.wav'));
  await copyFiles(path.join(root, 'assets/audio/voice'), path.join(out, SUB, 'voice'), (n) => n.endsWith('.mp3'));
  // iOS 的 InnerAudioContext 不支持 ogg → 只放 mp3
  await copyFiles(path.join(root, 'assets/audio/bgm'), path.join(out, SUB, 'bgm'), (n) => n === 'bgm_main_loop.mp3');   // 抖音只要无缝循环版 mp3 (iOS 不支持 ogg)
  await fs.writeFile(path.join(out, SUB, 'game.js'), '// 分包「media」入口：只包含语音与背景音乐资源，没有代码。\n', 'utf8');

  const gameJson = {
    deviceOrientation: 'portrait',
    showStatusBar: false,
    networkTimeout: { request: 10000, connectSocket: 10000, uploadFile: 10000, downloadFile: 10000 },
    subPackages: [{ name: SUB, root: `${SUB}/` }],
  };
  await fs.writeFile(path.join(out, 'game.json'), JSON.stringify(gameJson, null, 2) + '\n', 'utf8');

  const appid = /^TODO/i.test(PlatformConfig.douyin.appId) ? '' : PlatformConfig.douyin.appId;
  const projectConfig = {
    description: '《美少女合成》抖音小游戏 —— 由 npm run build:douyin 生成',
    projectname: PlatformConfig.douyin.projectName,
    appid: appid || 'testappid',          // TODO: 在 src/config/PlatformConfig.js 填写 douyin.appId 后重新构建 (或在开发者工具导入时填写)
    compileType: 'game',
    setting: { es6: true, urlCheck: false, minified: true, postcss: false, newFeature: true },
    packOptions: {
      ignore: [
        { type: 'folder', value: '上架资料' },
        { type: 'suffix', value: '.md' },
        { type: 'suffix', value: '.txt' },
      ],
    },
  };
  await fs.writeFile(path.join(out, 'project.config.json'), JSON.stringify(projectConfig, null, 2) + '\n', 'utf8');

  // 文档 / 上架资料 (不计入包体)
  const docDir = path.join(root, 'docs/douyin');
  if (await fs.stat(docDir).then(() => true, () => false)) {
    for (const e of await fs.readdir(docDir, { withFileTypes: true })) {
      const s = path.join(docDir, e.name);
      if (e.isDirectory()) await copyTree(s, path.join(out, '上架资料', e.name));
      else if (e.name === '抖音上架说明.md') await fs.copyFile(s, path.join(out, e.name));
      else await fs.copyFile(s, path.join(out, '上架资料', e.name)).catch(async () => { await fs.mkdir(path.join(out, '上架资料'), { recursive: true }); await fs.copyFile(s, path.join(out, '上架资料', e.name)); });
    }
  }

  // 包体统计 (与开发者工具一致：忽略 packOptions.ignore 的内容、点文件)
  const ignored = (rel, e) => rel.startsWith('.') || rel.split('/').some((x) => x.startsWith('.')) || rel === '上架资料' || rel.startsWith('上架资料/') || /\.(md|txt)$/i.test(e.name);
  const sub = await dirSize(path.join(out, SUB), ignored);
  const total = await dirSize(out, ignored);
  const main = total - sub;
  const sizes = { main, sub, total, gameJs: (await fs.stat(path.join(out, 'game.js'))).size };
  const fmt = (b) => `${(b / MB).toFixed(2)} MB`;
  console.log(`主包 ${fmt(main)} / 4 MB (game.js ${fmt(sizes.gameJs)})  分包 ${SUB} ${fmt(sub)} / 20 MB  整体 ${fmt(total)} / 20 MB`);
  await fs.writeFile(path.join(root, 'build', 'douyin-sizes.json'), JSON.stringify(sizes, null, 2)).catch(async () => {
    await fs.mkdir(path.join(root, 'build'), { recursive: true });
    await fs.writeFile(path.join(root, 'build', 'douyin-sizes.json'), JSON.stringify(sizes, null, 2));
  });
  if (main > LIMITS.main || sub > LIMITS.sub || total > LIMITS.total) throw new Error('包体超出抖音限制！');

  // 同步到 douyin/ (用户导入抖音开发者工具的目录)
  await fs.rm(userDir, { recursive: true, force: true });
  await copyTree(out, userDir);
  console.log(`抖音小游戏构建完成 -> dist-douyin/ 与 douyin/  (${Date.now() - t0} ms)${appid ? '' : '  ⚠ AppID 未填写 (src/config/PlatformConfig.js)'}`);
}

main().catch((err) => { console.error(err.message || err); process.exit(1); });
