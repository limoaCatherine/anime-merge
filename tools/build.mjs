// 构建脚本：用 esbuild 把 src/ 下的 ES 模块打包为单个经典脚本 dist/game.js，
// 并复制 Matter.js 与图片资源，生成可直接双击打开的 dist/index.html (file:// 无 CORS 问题)。
import { build } from 'esbuild';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

async function copyDir(src, dst, filter = () => true) {
  await fs.mkdir(dst, { recursive: true });
  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) continue; // 只复制当前层文件 (不复制 source 原图)
    if (filter(entry.name)) await fs.copyFile(s, d);
  }
}

async function main() {
  const t0 = Date.now();
  await fs.rm(dist, { recursive: true, force: true });
  await fs.mkdir(dist, { recursive: true });

  await build({
    entryPoints: [path.join(root, 'src/main.js')],
    bundle: true,
    format: 'iife',
    target: ['es2018'],
    minify: true,
    sourcemap: false,
    outfile: path.join(dist, 'game.js'),
    legalComments: 'none',
    charset: 'utf8',
  });

  await copyDir(path.join(root, 'vendor'), path.join(dist, 'vendor'), (n) => n.endsWith('.js'));
  await copyDir(path.join(root, 'assets/images'), path.join(dist, 'assets/images'), (n) => /\.(png|jpe?g|webp)$/i.test(n));
  await copyDir(path.join(root, 'assets/audio/voice'), path.join(dist, 'assets/audio/voice'), (n) => /\.(mp3|ogg|wav|m4a)$/i.test(n));
  await copyDir(path.join(root, 'assets/audio/bgm'), path.join(dist, 'assets/audio/bgm'), (n) => /\.(mp3|ogg|wav|m4a)$/i.test(n));
  await fs.copyFile(path.join(root, 'src/style.css'), path.join(dist, 'style.css'));
  await fs.copyFile(path.join(root, 'assets/icons/favicon.png'), path.join(dist, 'favicon.png'));

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
  <title>《美少女合成》AnimeMerge</title>
  <link rel="icon" type="image/png" href="favicon.png" />
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <canvas id="game"></canvas>
  <script src="vendor/matter.min.js"></script>
  <script src="game.js"></script>
</body>
</html>
`;
  await fs.writeFile(path.join(dist, 'index.html'), html, 'utf8');
  console.log(`构建完成 -> dist/  (${Date.now() - t0} ms)`);
}

main().catch((err) => { console.error(err); process.exit(1); });
