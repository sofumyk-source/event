"""第 2 弾の商品（カフス 8 点・ウールカードケース）を Shopify 取り込み用 CSV にする。

写真はテーマのアセット（product-cuff-*.jpg / product-cardcase-*.jpg）に置いてあり、
Shopify が取り込み時にそこから商品画像としてコピーする。
出力：setup/products-rotailor-2.csv（管理画面 → 商品管理 → インポート）
"""
import csv
import io
from pathlib import Path

IMG = "https://rotailor-i1gwanhz.myshopify.com/cdn/shop/t/2/assets/"
OUT = Path(__file__).resolve().parent.parent / "setup" / "products-rotailor-2.csv"

HEADER = [
    "Handle", "Title", "Body (HTML)", "Vendor", "Type", "Tags", "Published",
    "Option1 Name", "Option1 Value", "Variant SKU", "Variant Inventory Tracker",
    "Variant Inventory Qty", "Variant Inventory Policy", "Variant Fulfillment Service",
    "Variant Price", "Variant Requires Shipping", "Variant Taxable", "Variant Image",
    "Image Src", "Image Position", "Image Alt Text", "Gift Card", "Status",
    "素材 (product.metafields.custom.material)",
]

# 写真の並び：箱なしの 2 個並び → 裏側 → 箱 → 着用（写真の枚数が違う商品だけ個別に指定）
BOX, WORN = "ギフトボックス入り", "着用イメージ"
IMAGE_NOTES = {
    5: ["", "", BOX, BOX, WORN],
    "key-padlock": ["", "", BOX, BOX],
    "high-heel": ["", BOX, BOX, WORN],
    "champagne": ["", BOX, BOX, BOX, WORN],
    "balloon-dog": ["", BOX, BOX, BOX, WORN],
}


def body(paragraphs, specs=None, note=None):
    html = "".join(f"<p>{p}</p>" for p in paragraphs)
    if specs:
        html += "<ul>" + "".join(f"<li>{s}</li>" for s in specs) + "</ul>"
    if note:
        html += f"<p>{note}</p>"
    return html


CUFFS = [
    ("teddy-bear", "シルバーベア カフス", 5, "シルバー,ベア,動物", [
        "遊び心と上品さを兼ね備えた、テディベアモチーフのカフスボタン。",
        "愛らしいベアのフォルムを、存在感のあるシルバーカラーで仕上げた個性的なデザインです。",
        "一見シンプルなスーツスタイルにさりげないアクセントを加え、袖元から自分らしさを演出します。",
        "ビジネスシーンはもちろん、結婚式やパーティー、成人式などの華やかな場面にもおすすめ。",
        "袖元に、ちょっとした遊び心を。",
    ]),
    ("key-padlock", "ゴールドキー＆パドロック カフス", 4, "ゴールド,鍵", [
        "鍵と南京錠をモチーフにした、ユニークで存在感のあるカフスボタン。",
        "ゴールドの美しい輝きと、遊び心のあるデザインが魅力のアイテムです。",
        "左右で異なるモチーフが、袖元に個性的な表情をプラス。",
        "クラシックなスーツスタイルから、華やかなパーティースタイルまで幅広くお楽しみいただけます。",
        "人と被らないアクセサリーをお探しの方にもおすすめです。",
        "鍵をかけるように、スタイルに個性を。",
    ]),
    ("horse-head", "シルバーホースヘッド カフス", 5, "シルバー,馬,動物", [
        "馬の頭部をモチーフにした、立体感あふれるシルバーカフス。",
        "細部まで表現された造形と、メタリックな光沢が手元に存在感を与えます。",
        "動物モチーフならではの個性がありながら、シルバーカラーによって落ち着いた印象も兼ね備えています。",
        "シンプルなシャツやスーツに合わせるだけで、ワンランク上の着こなしに。",
        "さりげなく差をつける、大人の遊び心。",
    ]),
    ("bulldog", "ゴールドブルドッグ カフス", 5, "ゴールド,ブルドッグ,動物", [
        "サングラスをかけたブルドッグをモチーフにした、インパクト抜群のカフスボタン。",
        "ゴールドカラーの存在感と、ユーモアあふれる表情が魅力のアイテムです。",
        "袖元に視線を集める個性的なデザインは、ファッションを楽しみたい方にぴったり。",
        "成人式や結婚式、パーティーなど、いつもより少し大胆な装いにもおすすめです。",
        "遊び心も、スタイルの一部に。",
    ]),
    ("high-heel", "レッドハイヒール カフス", 4, "レッド,ハイヒール", [
        "美しいレッドカラーのハイヒールをモチーフにした、華やかで個性的なカフスボタン。",
        "立体的なシルエットと鮮やかな色使いが、袖元に印象的なアクセントを添えます。",
        "シンプルなスーツスタイルに合わせるだけで、他とは違う自分らしいコーディネートが完成。",
        "ファッションにこだわる方や、個性的な小物をお探しの方におすすめです。",
        "袖元から魅せる、華やかなアクセント。",
    ]),
    ("cable-knot", "シルバーケーブルノット カフス", 5, "シルバー,ノット", [
        "渦を巻くような立体的なフォルムが特徴の、シルバーカフスボタン。",
        "幾重にも重なるような造形と、光を受けて変化するメタリックな輝きが魅力です。",
        "シンプルながらも独特な存在感があり、モードなスタイルや洗練されたスーツコーディネートとの相性も抜群。",
        "派手すぎず、さりげなく個性を表現したい方にもおすすめです。",
        "シンプルの中に、ひとクセを。",
    ]),
    ("champagne", "シャンパン カフス", 5, "ゴールド,シルバー,シャンパン", [
        "シャンパングラスとボトルをモチーフにした、遊び心あふれるカフスボタン。",
        "ゴールドとシルバーのコンビネーションが華やかで、細部までこだわった立体的なデザインが特徴です。",
        "結婚式や二次会、パーティーなど、お祝いのシーンにぴったりのアイテム。",
        "お酒やパーティーが好きな方へのプレゼントにもおすすめです。",
        "特別な一日を、袖元から華やかに。",
    ]),
    ("balloon-dog", "ターコイズバルーンドッグ カフス", 5, "ターコイズ,バルーンドッグ,動物", [
        "風船で作られた犬をイメージした、ポップでアーティスティックなカフスボタン。",
        "鮮やかなターコイズカラーと独特なフォルムが、袖元に遊び心と彩りをプラスします。",
        "一般的なカフスとは一味違うデザインで、ファッションに個性を取り入れたい方におすすめ。",
        "成人式やパーティー、個性的なスーツスタイルとの組み合わせにもぴったりです。",
        "周りと被らない、自分だけのアクセントを。",
    ]),
]

CARD_FABRICS = ["千鳥格子 グレー×イエロー", "ブラック", "ブルー"]


def row(**kw):
    return [kw.get(h, "") for h in HEADER]


def build():
    rows = [HEADER]
    for n, (slug, title, count, tags, paras) in enumerate(CUFFS, 1):
        handle = f"cufflinks-{slug}"
        for i in range(1, count + 1):
            src = f"{IMG}product-cuff-{slug}-{i}.jpg"
            note = IMAGE_NOTES.get(slug, IMAGE_NOTES[5])[i - 1]
            alt = f"{title}（{note}）" if note else title
            if i == 1:
                rows.append(row(**{
                    "Handle": handle, "Title": title, "Body (HTML)": body(paras),
                    "Vendor": "ROtailor", "Type": "カフス", "Tags": f"カフス,ギフト,{tags}",
                    "Published": "TRUE", "Option1 Name": "Title", "Option1 Value": "Default Title",
                    "Variant SKU": f"RO-1{n:02d}", "Variant Inventory Tracker": "shopify",
                    "Variant Inventory Qty": "1", "Variant Inventory Policy": "deny",
                    "Variant Fulfillment Service": "manual", "Variant Price": "5500",
                    "Variant Requires Shipping": "TRUE", "Variant Taxable": "TRUE",
                    "Image Src": src, "Image Position": "1", "Image Alt Text": alt,
                    "Gift Card": "FALSE", "Status": "active",
                }))
            else:
                rows.append(row(**{"Handle": handle, "Image Src": src, "Image Position": str(i), "Image Alt Text": alt}))

    title = "ROtailorオリジナル ウールカードケース"
    handle = "card-case-wool"
    card_body = body(
        [
            "スーツ作成の際に出た残布を使って作ったハンドメイドカードケース。",
            "２つのスロットはそれぞれ約15枚ずつカードを収納することが可能です。",
            "ビジネスシーンで使用する名刺ケースだからこそ、細部まで自分らしさにこだわりたい方におすすめ。",
            "第一印象に、さりげないこだわりを。",
            "ROtailorらしい遊び心を感じられるアイテムです。",
        ],
        specs=["サイズ（折りたたみ時）：縦6cm × 横10.5cm × マチ1cm", "収納：スロット2つ（各約15枚）"],
        note="※ハンドメイドのためアイテムに個体差がある場合がございます。ご了承下さい。",
    )
    pos = 0
    for k, fabric in enumerate(CARD_FABRICS, 1):
        for i in range(1, 4):
            pos += 1
            src = f"{IMG}product-cardcase-{k}-{i}.jpg"
            alt = f"{title}（{fabric}）"
            r = {"Handle": handle, "Image Src": src, "Image Position": str(pos), "Image Alt Text": alt}
            if i == 1:
                r.update({
                    "Option1 Value": fabric, "Variant SKU": f"RO-20{k}",
                    "Variant Inventory Tracker": "shopify", "Variant Inventory Qty": "1",
                    "Variant Inventory Policy": "deny", "Variant Fulfillment Service": "manual",
                    "Variant Price": "4400", "Variant Requires Shipping": "TRUE",
                    "Variant Taxable": "TRUE", "Variant Image": src,
                })
            if pos == 1:
                r.update({
                    "Title": title, "Body (HTML)": card_body, "Vendor": "ROtailor",
                    "Type": "カードケース", "Tags": "カードケース,名刺入れ,ハンドメイド,ウール,ギフト",
                    "Published": "TRUE", "Option1 Name": "柄", "Gift Card": "FALSE", "Status": "active",
                    "素材 (product.metafields.custom.material)": "ウール（オーダースーツの残布）",
                })
            rows.append(row(**r))

    buf = io.StringIO()
    csv.writer(buf, lineterminator="\r\n").writerows(rows)
    OUT.write_text("﻿" + buf.getvalue(), encoding="utf-8")
    print(OUT, len(rows) - 1, "rows")


if __name__ == "__main__":
    build()
