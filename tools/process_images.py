"""把 assets/images/source/girl_XX_raw.jpg 处理成圆形透明 PNG（带分级彩色描边）。
用法: python tools/process_images.py
"""
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'images', 'source')
DST = os.path.join(ROOT, 'assets', 'images')
SIZE = 256
SS = 4  # 超采样抗锯齿
RING = 14  # 描边宽度(最终像素)

# 与 src/config/LevelConfig.js 中 ringColor 保持一致
RING_COLORS = ['#a8d8ff', '#ffb347', '#6c7bd9', '#7ccf6a', '#ff8fc7', '#b57bff',
               '#e85a5a', '#36c6e8', '#c9b8ff', '#ffd23f', '#ff6ad5']

def hex2rgb(h):
    h = h.lstrip('#'); return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def process(i):
    im = Image.open(os.path.join(SRC, f'girl_{i:02d}_raw.jpg')).convert('RGB')
    w, h = im.size
    side = int(h * 0.92)               # 稍微放大脸部
    left = (w - side) // 2
    top = 0                            # 贴顶裁剪，保证头顶/皇冠可见
    crop = im.crop((left, top, left + side, top + side))
    big = SIZE * SS
    crop = crop.resize((big, big), Image.LANCZOS).convert('RGBA')
    ring = RING * SS
    out = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    # 外圈：描边颜色
    rc = hex2rgb(RING_COLORS[i - 1])
    d = ImageDraw.Draw(out)
    d.ellipse((0, 0, big - 1, big - 1), fill=rc + (255,))
    # 白色内细线
    inner_w = int(ring * 0.25)
    d.ellipse((ring - inner_w, ring - inner_w, big - ring + inner_w, big - ring + inner_w), fill=(255, 255, 255, 255))
    # 头像
    mask = Image.new('L', (big, big), 0)
    ImageDraw.Draw(mask).ellipse((ring, ring, big - ring, big - ring), fill=255)
    out.paste(crop, (0, 0), mask)
    # 外圈高光
    hl = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    ImageDraw.Draw(hl).arc((ring // 3, ring // 3, big - ring // 3, big - ring // 3), 200, 290, fill=(255, 255, 255, 170), width=ring // 3)
    out = Image.alpha_composite(out, hl)
    out = out.resize((SIZE, SIZE), Image.LANCZOS)
    out.save(os.path.join(DST, f'girl_{i:02d}.png'), optimize=True)

if __name__ == '__main__':
    for i in range(1, 12):
        process(i)
        print('ok', i)
