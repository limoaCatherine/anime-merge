"""生成应用图标：assets/icons/app.ico (16~256 多尺寸)、app.png (512)、favicon.png (64)。
来源：assets/images/girl_11.png (星海女神圆形头像)。用法: python tools/make_icons.py
"""
import os
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'images', 'girl_11.png')
OUT = os.path.join(ROOT, 'assets', 'icons')
os.makedirs(OUT, exist_ok=True)

src = Image.open(SRC).convert('RGBA')
# 512 主图：头像四周留一点透明边距，并加柔和投影
S = 512
base = Image.new('RGBA', (S, S), (0, 0, 0, 0))
face = src.resize((int(S * 0.94), int(S * 0.94)), Image.LANCZOS)
off = (S - face.width) // 2
shadow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
alpha = face.split()[3].point(lambda a: int(a * 0.35))
shadow.paste((90, 40, 110, 255), (off, off + 8), alpha)
shadow = shadow.filter(ImageFilter.GaussianBlur(8))
base = Image.alpha_composite(base, shadow)
base.alpha_composite(face, (off, off))
base.save(os.path.join(OUT, 'app.png'))

sizes = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256]
imgs = []
for s in sizes:
    im = base.resize((s, s), Image.LANCZOS)
    if s <= 32:  # 小尺寸略微锐化
        im = im.filter(ImageFilter.UnsharpMask(radius=1, percent=60, threshold=2))
    imgs.append(im)
imgs[-1].save(os.path.join(OUT, 'app.ico'), format='ICO', sizes=[(s, s) for s in sizes], append_images=imgs[:-1])
base.resize((64, 64), Image.LANCZOS).save(os.path.join(OUT, 'favicon.png'))
print('ok', sizes)
