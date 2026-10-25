"""
フロント組み立て方式（prototype/suit-builder）用の「土台」を作るスクリプト。

シングル2ボタン・ノッチの色分け写真から、前身頃（ラペル・Vゾーン・ボタン・前端）を
取り除き、周りの生地の陰影でなめらかに埋めた写真とマスクを書き出します。
腰ポケットのフラップも取り除きます。シャツの襟とネクタイの結び目（首元）だけは写真のまま残します。
ラペル・ボタン・ポケットは、ブラウザ側（suit-builder.js）で仕様どおりに描き直します。
マスクの A チャンネルには、仕上がり画面で使う切り抜き（首から上と背景が透明）を入れます。

  python3 tools/build-front-base.py <色分け写真(01番)> <出力フォルダ>
"""
import importlib.util
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 768, 1152
# 作り直す範囲（768×1152 の座標）。元のラペル・Vゾーン・前端・ボタンをすべて含む
REBUILD = [(286, 140), (482, 140), (490, 196), (456, 300), (414, 366), (414, 470), (424, 566),
           (344, 566), (354, 470), (354, 366), (312, 300), (278, 196)]
KEEP_ABOVE = 214  # これより上のシャツ襟・ネクタイの結び目は写真を残す
POCKETS = [(266, 416, 334, 468), (434, 416, 502, 468)]  # 写真のフラップポケット（左右）

_spec = importlib.util.spec_from_file_location("bsp", os.path.join(os.path.dirname(__file__), "build-suit-photos.py"))
bsp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bsp)


def hue_band(h, center, half):
    d = np.abs((h - center + 180) % 360 - 180)
    return d < half


def main(src, out):
    im = Image.open(src).convert("RGB").resize((W, H), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32)
    hsv = np.asarray(im.convert("HSV")).astype(np.float32)
    h, s, v = hsv[..., 0] * 360 / 255, hsv[..., 1] / 255, hsv[..., 2] / 255
    suit = hue_band(h, 225, 28) & (s > 0.3) & (v > 0.18)
    shirt_tie = (hue_band(h, 54, 16) & (s > 0.15) & (v > 0.5)) | (hue_band(h, 125, 40) & (s > 0.25))

    region = Image.new("L", (W, H), 0)
    ImageDraw.Draw(region).polygon(REBUILD, fill=255)
    region = np.asarray(region) > 0
    yy = np.arange(H)[:, None].repeat(W, 1)
    keep = shirt_tie & (yy < KEEP_ABOVE)
    keep = np.asarray(Image.fromarray(keep.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(3))) > 0
    background = (s < 0.14) & (v > 0.55) & (yy < 200)  # 肩より上の背景・マネキンの首は残す
    fill = region & ~keep & ~background
    # 腰ポケット：袖との隙間（背景）は残し、生地とフラップの影だけを埋める
    pocket = Image.new("L", (W, H), 0)
    for box in POCKETS:
        ImageDraw.Draw(pocket).rectangle(box, fill=255)
    near_suit = np.asarray(Image.fromarray(suit.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(5))) > 0
    fill |= (np.asarray(pocket) > 0) & near_suit & ~((s < 0.14) & (v > 0.55))

    # 生地の明るさ（V）を、作り直す範囲の外側の生地から内側へなめらかに補間（ラプラス方程式）
    lum = v.copy()
    known = suit & ~fill
    ys, xs = np.where(fill)
    y0, y1, x0, x1 = ys.min() - 4, ys.max() + 5, xs.min() - 4, xs.max() + 5
    L = lum[y0:y1, x0:x1].copy()
    F = fill[y0:y1, x0:x1]
    K = known[y0:y1, x0:x1]
    mean = L[K].mean()
    L[~K] = mean
    for _ in range(3000):
        avg = (np.roll(L, 1, 0) + np.roll(L, -1, 0) + np.roll(L, 1, 1) + np.roll(L, -1, 1)) / 4
        L = np.where(K, L, avg)
    # 単調にならないよう、元写真のごく細かな織りの揺らぎだけ戻す
    detail = lum[y0:y1, x0:x1] - np.asarray(Image.fromarray((lum[y0:y1, x0:x1] * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2))).astype(np.float32) / 255
    L = np.where(F, np.clip(L + np.clip(detail, -0.02, 0.02) * 0.5, 0, 1), L)

    # 埋めた範囲は「純粋なコバルトブルーの生地」として書き戻す（色相・彩度は周りの平均）
    blue = a[known].mean(0)
    blue = blue / blue.max()
    out_img = a.copy()
    sub = out_img[y0:y1, x0:x1]
    sub[F] = (blue[None, :] * L[F][:, None] * 255)
    out_img[y0:y1, x0:x1] = sub

    mask = np.zeros((H, W, 3), np.uint8)
    mask[..., 0] = np.where(suit | fill, 255, 0)
    mask[..., 1] = np.where(hue_band(h, 125, 40) & (s > 0.25) & ~fill, 255, 0)
    mask[..., 2] = np.where(hue_band(h, 54, 16) & (s > 0.15) & (v > 0.5) & ~fill, 255, 0)
    mask = np.asarray(Image.fromarray(mask).filter(ImageFilter.GaussianBlur(0.6)))
    mask = np.dstack([mask, bsp.cutout(np.asarray(im), mask.max(-1))])

    Image.fromarray(out_img.clip(0, 255).astype(np.uint8)).save(f"{out}/suit-front-base.jpg", quality=90)
    Image.fromarray(mask).save(f"{out}/suit-front-base-mask.png", optimize=True)
    print("rebuilt pixels:", int(fill.sum()))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
