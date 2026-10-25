"""
シミュレーター用の「着せ替え写真」を作るスクリプト。

ChatGPT などで作った色分け済みのマネキン写真（スーツ＝コバルトブルー、
シャツ＝薄い黄色、ネクタイ＝緑）から、次の 2 つを書き出します。

  theme/assets/suit-photo-<key>.jpg       … 写真（陰影の元になる）
  theme/assets/suit-photo-<key>-mask.png  … 部位マスク（R=スーツ, G=ネクタイ, B=シャツ）

使い方:
  python3 tools/build-suit-photos.py <元画像のフォルダ>

元画像のファイル名は 01〜10 で始まる名前（下の VARIANTS 参照）か、
キーそのもの（例: back-c.png、pocket-flap.png）にしてください。
"""
import os
import re
import sys

import numpy as np
from PIL import Image, ImageFilter

# 番号 → シミュレーターでのキー（s=シングル d=ダブル / n=ノッチ p=ピーク / c=閉 o=開 / v=ベスト）
VARIANTS = {
    "01": "sn-c", "02": "sn-o", "03": "sn-cv", "04": "sn-ov",
    "05": "sp-c", "06": "sp-o", "07": "sp-cv", "08": "sp-ov",
    "09": "dp-c", "10": "dp-cv",
}
WIDTH = 768
OUT = os.path.join(os.path.dirname(__file__), "..", "theme", "assets")


def smooth(x, lo, hi):
    t = np.clip((x - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


def hue_band(h, center, half, soft=12):
    d = np.abs((h - center + 180) % 360 - 180)
    return 1 - smooth(d, half, half + soft)


def build(src, key):
    im = Image.open(src).convert("RGB")
    im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
    hsv = np.asarray(im.convert("HSV")).astype(np.float32)
    h, s, v = hsv[..., 0] * 360 / 255, hsv[..., 1] / 255, hsv[..., 2] / 255

    suit = hue_band(h, 225, 25) * smooth(s, 0.22, 0.38) * smooth(v, 0.14, 0.22)  # 靴の青い映り込みを除く
    tie = hue_band(h, 125, 38) * smooth(s, 0.18, 0.32) * smooth(v, 0.08, 0.16)
    shirt = hue_band(h, 54, 14, 8) * smooth(s, 0.10, 0.22) * smooth(v, 0.45, 0.6)

    def clean(m):
        img = Image.fromarray((m * 255).astype(np.uint8))
        img = img.filter(ImageFilter.MedianFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
        return np.asarray(img)

    mask = np.dstack([clean(suit), clean(tie), clean(shirt)])
    im.save(os.path.join(OUT, f"suit-photo-{key}.jpg"), quality=88, optimize=True, progressive=True)
    Image.fromarray(mask).save(os.path.join(OUT, f"suit-photo-{key}-mask.png"), optimize=True)
    return [round(float((mask[..., i] > 128).mean()), 4) for i in range(3)]


def main():
    src_dir = sys.argv[1]
    for name in sorted(os.listdir(src_dir)):
        stem = os.path.splitext(name)[0]
        key = VARIANTS.get(name[:2]) or (stem if re.fullmatch(r"[a-z]+(-[a-z]+)*", stem) else None)
        if key:
            print(name, key, build(os.path.join(src_dir, name), key))


if __name__ == "__main__":
    main()
