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
    'threePieceEnabled': section['settings'].get('three_piece_enabled', True),
    'stylistEndpoint': '',
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
<div class="demo-banner">デモ表示：イメージ入力はサイト内蔵の辞書で動いています（AI 版は API の設定後に有効）。フォーム送信はデモでは動作しません。</div>
<header class="site-header site-header--sticky">
  <div class="site-header__inner container">
    <span></span>
    <a class="site-logo" href="#"><span class="site-logo__name">ROtailor</span><span class="site-logo__tagline">Haberdashery &amp; Bespoke</span></a>
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
      <div class="section-intro rte"><p>生地やラペル、ボタン、裏地まで。好きな組み合わせを選んで、あなただけの一着を思い描いてみてください。気に入ったイメージは、そのまま店頭でのご相談にお持ちいただけます。</p></div>
    </div>
    <div class="sim-stylist" data-stylist>
      <div class="sim-stylist__intro">
        <p class="eyebrow">TELL THE TAILOR</p>
        <h2 class="sim-stylist__title">あなたの好みを、テイラーに。</h2>
        <p class="sim-stylist__text">好きな色と、着ていく場面を選んでください。憧れのコーディネートや好きな景色の写真を添えると、その色や雰囲気も読み取って一着に仕立てます。</p>
      </div>
      <form class="sim-stylist__form" novalidate>
        <fieldset class="sim-stylist__field">
          <legend>好きな色<small>（3色まで）</small></legend>
          <div class="sim-stylist__colors" data-stylist-colors></div>
        </fieldset>
        <fieldset class="sim-stylist__field">
          <legend>着ていく場面<small>（いくつでも）</small></legend>
          <div class="sim-stylist__scenes" data-stylist-scenes></div>
        </fieldset>
        <div class="sim-stylist__field sim-stylist__photo-row">
          <span class="sim-stylist__label">参考写真<small>（任意）</small></span>
          <div class="sim-stylist__photo">
            <label class="sim-chip sim-stylist__photo-btn">
              写真を選ぶ
              <input type="file" accept="image/*" data-stylist-photo hidden>
            </label>
            <img class="sim-stylist__thumb" data-stylist-thumb alt="選んだ参考写真" width="56" height="56" hidden>
            <span class="sim-stylist__photo-colors" data-stylist-photo-colors aria-hidden="true"></span>
            <button type="button" class="sim-stylist__photo-remove" data-stylist-photo-remove hidden aria-label="参考写真を外す">×</button>
          </div>
          <p class="sim-stylist__hint">憧れのコーディネートや好きな景色の写真から、色や雰囲気を読み取ります。</p>
        </div>
        <label class="sim-stylist__field">
          <span class="sim-stylist__label">ひとこと<small>（任意）</small></span>
          <input type="text" class="sim-stylist__input" data-stylist-input maxlength="100" placeholder="例）軽やかに見せたい、少し遊び心がほしい">
        </label>
        <div class="sim-stylist__actions">
          <button type="submit" class="button button--accent">テイラーに仕立ててもらう</button>
          <p class="sim-stylist__progress" data-stylist-progress hidden aria-live="polite"></p>
        </div>
      </form>
    </div>
    <div class="simulator__layout">
      <div class="simulator__stage">
        <div class="sim-preview">
          <button type="button" class="sim-chip sim-chip--shuffle" data-shuffle>おまかせ</button>
          <div class="sim-preview__toolbar" role="group" aria-label="表示の向き">
            <button type="button" class="sim-chip is-active" data-view="front" aria-pressed="true">FRONT</button>
            <button type="button" class="sim-chip" data-view="back" aria-pressed="false">BACK</button>
          </div>
          <div class="sim-preview__canvas" data-preview aria-live="polite"></div>
          <div class="sim-preview__fabric" data-fabric-caption></div>
          <div class="sim-tryon" data-tryon>
            <label class="sim-chip sim-tryon__upload">
              自分の写真で試着する
              <input type="file" accept="image/*" data-tryon-file hidden>
            </label>
            <div class="sim-tryon__controls" data-tryon-controls hidden>
              <label class="sim-tryon__zoom">大きさ <input type="range" min="0.6" max="3.5" step="0.05" value="1.6" data-tryon-zoom></label>
              <button type="button" class="sim-tryon__remove" data-tryon-remove>写真を外す</button>
              <p class="sim-tryon__hint">顔をドラッグして位置を合わせてください</p>
            </div>
            <p class="sim-tryon__note">写真はこの画面の中だけで使われ、送信・保存はされません。</p>
          </div>
        </div>
        <div class="sim-total">
          <div class="sim-total__body"><p class="sim-total__label">YOUR STYLE</p><p class="sim-total__chosen" data-chosen></p></div>
          <button type="button" class="button button--primary sim-total__next" data-go-summary>仕上がりを見る</button>
        </div>
      </div>
      <div class="simulator__panel">
        <div class="sim-look" data-look hidden aria-live="polite"></div>
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
          <p class="eyebrow">YOUR STYLE</p>
          <h2 class="section-title">あなたの一着が仕上がりました</h2>
          <div class="sim-summary__look">
            <div class="sim-summary__preview" data-summary-preview aria-hidden="true"></div>
            <dl class="sim-spec" data-spec></dl>
          </div>
          <div class="sim-summary__tools">
            <button type="button" class="button button--ghost" data-copy-link>この内容のリンクをコピー</button>
            <button type="button" class="button button--ghost" data-reset>最初からやり直す</button>
          </div>
        </div>
        <div class="sim-summary__actions">
          <div class="sim-estimate">
            <p class="eyebrow">ESTIMATE</p>
            <h3 class="sim-card__title">お見積もりは、店頭で。</h3>
            <p class="sim-card__text">お仕立ての価格は、生地・仕立て方・サイズによって一着ずつ異なります。このイメージをお持ちいただければ、テイラーが実際の生地を手に取りながら、ご予算に合わせてご提案します。</p>
            <a href="#" class="button button--accent" onclick="event.preventDefault()">ご来店予約</a>
          </div>
          <div class="sim-card">
            <h3 class="sim-card__title">この内容でご来店予約</h3>
            <p class="sim-card__text">選んだイメージはそのままテイラーに届きます。採寸・生地選び・お見積もりを含めて 60〜90 分ほどお時間をいただきます。</p>
            <form class="sim-form" onsubmit="event.preventDefault(); alert('デモのため送信されません。Shopify 上ではストアのメールアドレスに届きます。');">
              <textarea name="contact[シミュレーション内容]" data-form-spec hidden readonly></textarea>
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
<script>{(THEME / 'assets/suit-stylist.js').read_text(encoding='utf-8')}</script>
<script>{(THEME / 'assets/suit-simulator.js').read_text(encoding='utf-8')}</script>
</body>
</html>
"""

out = ROOT / 'demo/simulator-demo.html'
out.write_text(html, encoding='utf-8')
print('wrote', out.relative_to(ROOT))
