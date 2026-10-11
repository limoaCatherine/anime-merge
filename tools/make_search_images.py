# 由 1080×1920 商店截图生成抖音搜索结果页竖图 342×600 (按宽度缩放后居中裁切)
from PIL import Image
import os
d = os.path.join(os.path.dirname(__file__), '..', 'docs', 'douyin', 'screenshots')
for f in ['1-菜单.png', '2-游戏中.png', '3-看视频复活.png']:
    im = Image.open(os.path.join(d, f)).convert('RGB')
    h = round(im.height * 342 / im.width)
    im = im.resize((342, h), Image.LANCZOS)
    top = (h - 600) // 2
    im.crop((0, top, 342, top + 600)).save(os.path.join(d, '搜索竖图_342x600_' + f))
    print('ok', f)
