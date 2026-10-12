#!/usr/bin/env python3
"""Build demo/simulator-demo.html — a standalone preview of the suit simulator.

It reads the default blocks from theme/templates/page.simulator.json and inlines
the theme's CSS/JS, so the simulator can be shown to the client without Shopify.
Usage: python3 tools/build-demo.py
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
THEME = ROOT / 'theme'

template = json.loads((THEME / 'templates/page.simulator.json').read_text(encoding='utf-8'))
section = template['sections']['simulator']
items = []
for block_id in section['block_order']:
    block = section['blocks'][block_id]
    s = block['settings']
    items.append({
        'id': block_id,
        'type': block['type'],
        'name': s.get('name'),
        'description': s.get('description'),
        'price': s.get('price', 0),
        'key': s.get('key'),
        'color': s.get('color', ''),
        'pattern': s.get('pattern'),
        'patternColor': s.get('pattern_color', ''),
        'shirtColor': s.get('shirt_color', ''),
        'image': '',
        'mill': s.get('mill'),
        'origin': s.get('origin'),
        'composition': s.get('composition'),
        'season': s.get('season'),
        'comment': s.get('comment'),
        'width': s.get('width', 0),
        'needsText': s.get('needs_text', False),
        'isDefault': s.get('is_default', False),
    })

config = {
    'moneyFormat': '¥{{amount_no_decimals}}',
    'threePiecePrice': section['settings'].get('three_piece_price', 22000),
    'storageKey': 'rotailor-sim-demo',
    'items': items,
}

css_vars = """
:root {
  --color-primary: #1C2333; --color-primary-rgb: 28, 35, 51; --color-accent: #A8874F;
  --color-bg: #F7F4EE; --color-surface: #FFFFFF; --color-text: #1E1E1E; --color-muted: #6B6559;
  --color-border: #DDD6C8; --color-sale: #8C2F2F;
  --font-serif: 'Shippori Mincho', 'Hiragino Mincho ProN', 'Yu Mincho', serif;
  --font-display: 'Cormorant Garamond', 'Shippori Mincho', serif;
  --font-sans: 'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', sans-serif;
  --card-ratio: 4 / 5; --logo-width: 140px;
}
"""

html = f"""<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>オーダースーツ シミュレーション（デモ）</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Noto+Sans+JP:wght@400;500;700&family=Shippori+Mincho:wght@500;600;700&display=swap" rel="stylesheet">
<style>{css_vars}
{(THEME / 'assets/base.css').read_text(encoding='utf-8')}
{(THEME / 'assets/suit-simulator.css').read_text(encoding='utf-8')}
.demo-banner {{ background: #A8874F; color: #fff; text-align: center; font-size: 12px; padding: 6px 16px; letter-spacing: .08em; }}
</style>
</head>
<body>
<div class="demo-banner">デモ表示：Shopify 上ではテーマエディタで生地・価格・文言を編集できます。フォーム送信とカート追加はデモでは動作しません。</div>
<header class="site-header site-header--sticky">
  <div class="site-header__inner container">
    <span></span>
    <a class="site-logo" href="#"><span class="site-logo__name">RO TAILOR</span><span class="site-logo__tagline">Haberdashery &amp; Bespoke</span></a>
    <span></span>
    <span></span>
  </div>
</header>
<main>
<section class="section simulator" data-suit-simulator data-section-id="demo">
  <div class="container">
    <div class="section-head simulator__head">
      <p class="eyebrow">MADE TO MEASURE SIMULATOR</p>
      <h1 class="section-title">オーダースーツを仕立てる</h1>
      <div class="section-intro rte"><p>生地とディテールを選ぶと、仕上がりのイメージと概算価格がすぐにわかります。最終的なお見積もりは、サロンでの採寸時にご案内します。</p></div>
    </div>
    <div class="simulator__layout">
      <div class="simulator__stage">
        <div class="sim-preview">
          <div class="sim-preview__toolbar" role="group" aria-label="表示の向き">
            <button type="button" class="sim-chip is-active" data-view="front" aria-pressed="true">FRONT</button>
            <button type="button" class="sim-chip" data-view="back" aria-pressed="false">BACK</button>
          </div>
          <div class="sim-preview__canvas" data-preview aria-live="polite"></div>
          <div class="sim-preview__fabric" data-fabric-caption></div>
        </div>
        <div class="sim-total">
          <div><p class="sim-total__label">概算価格（税込）</p><p class="sim-total__price" data-total>—</p></div>
          <button type="button" class="button button--primary sim-total__next" data-go-summary>見積もりを確認</button>
        </div>
      </div>
      <div class="simulator__panel">
        <ol class="sim-steps" role="tablist" aria-label="シミュレーションの手順" data-steps-nav></ol>
        <div class="sim-step-body" data-step-body></div>
        <div class="sim-step-nav">
          <button type="button" class="button button--ghost" data-prev>戻る</button>
          <button type="button" class="button button--primary" data-next>次へ</button>
        </div>
      </div>
    </div>
    <div class="sim-summary" data-summary hidden tabindex="-1">
      <div class="sim-summary__grid">
        <div class="sim-summary__spec">
          <p class="eyebrow">YOUR ORDER</p>
          <h2 class="section-title">お仕立て内容の確認</h2>
          <dl class="sim-spec" data-spec></dl>
          <table class="sim-breakdown" data-breakdown></table>
          <p class="sim-note">※ 表示価格は税込の概算です。体型補正や生地の在庫状況により、採寸時に最終価格をご案内します。</p>
          <div class="sim-summary__tools">
            <button type="button" class="button button--ghost" data-copy-link>この内容のリンクをコピー</button>
            <button type="button" class="button button--ghost" data-reset>最初からやり直す</button>
          </div>
        </div>
        <div class="sim-summary__actions">
          <div class="sim-card">
            <h3 class="sim-card__title">この内容でご来店予約</h3>
            <p class="sim-card__text">選んだ内容はそのままテイラーに届きます。採寸・生地確認を含めて 60〜90 分ほどお時間をいただきます。</p>
            <form class="sim-form" onsubmit="event.preventDefault(); alert('デモのため送信されません。Shopify 上ではストアのメールアドレスに届きます。');">
              <textarea name="contact[シミュレーション内容]" data-form-spec hidden readonly></textarea>
              <input type="hidden" data-form-total>
              <label class="field"><span>お名前 <em>*</em></span><input type="text" required></label>
              <label class="field"><span>メールアドレス <em>*</em></span><input type="email" required></label>
              <label class="field"><span>電話番号</span><input type="tel"></label>
              <div class="field-row">
                <label class="field"><span>ご来店希望日（第1希望）</span><input type="date" data-min-today></label>
                <label class="field"><span>第2希望</span><input type="date" data-min-today></label>
              </div>
              <label class="field"><span>着用シーン・ご要望</span><textarea rows="3" placeholder="例）秋の結婚式に。普段は 48 サイズの既製服を着ています。"></textarea></label>
              <button type="submit" class="button button--primary button--block">予約をリクエストする</button>
            </form>
          </div>
        </div>
      </div>
      <div class="sim-pairing" data-pairing hidden></div>
    </div>
  </div>
  <script type="application/json" data-simulator-config>{json.dumps(config, ensure_ascii=False)}</script>
</section>
</main>
<script>{(THEME / 'assets/suit-simulator.js').read_text(encoding='utf-8')}</script>
</body>
</html>
"""

out = ROOT / 'demo/simulator-demo.html'
out.write_text(html, encoding='utf-8')
print('wrote', out.relative_to(ROOT))
