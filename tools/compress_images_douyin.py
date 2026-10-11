"""抖音版图片压缩：角色立绘 256×256 RGBA PNG → libimagequant 256 色调色板 PNG (保留透明通道，约为原大小的 1/3)。
抖音 tt.createImage 文档没有明确写 WebP 支持 (iOS 旧版本运行时不保证)，所以用兼容性最好的 PNG。
输出 assets/images/douyin/girl_XX.png，build:douyin 会优先使用这里的文件。
用法：python tools/compress_images_douyin.py   (需要 pip install pillow imagequant)
"""
import glob, io, os
from PIL import Image
import imagequant

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src_dir = os.path.join(root, 'assets', 'images')
out_dir = os.path.join(src_dir, 'douyin')
os.makedirs(out_dir, exist_ok=True)
t0 = t1 = 0
for f in sorted(glob.glob(os.path.join(src_dir, 'girl_*.png'))):
    im = Image.open(f).convert('RGBA')
    q = imagequant.quantize_pil_image(im, dithering_level=1.0, max_colors=256, min_quality=70, max_quality=95)
    out = os.path.join(out_dir, os.path.basename(f))
    q.save(out, 'PNG', optimize=True)
    a, b = os.path.getsize(f), os.path.getsize(out)
    t0 += a; t1 += b
    print(f'{os.path.basename(f)}  {a/1024:.0f} KB -> {b/1024:.0f} KB')
print(f'合计 {t0/1024:.0f} KB -> {t1/1024:.0f} KB')
