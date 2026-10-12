/**
 * プレビュー用のサンプルデータ。
 * 商品は setup/products-sample.csv、ページ・ブログ本文は setup/content/ から読み込みます。
 * 商品写真の代わりに、色と形だけの簡単なイラスト（SVG）を生成します。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Drop } from 'liquidjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const THEME = path.join(ROOT, 'theme');
const SETUP = path.join(ROOT, 'setup');

class OptionValue extends Drop {
  constructor(value) { super(); this.value = value; this.available = true; }
  valueOf() { return this.value; }
  toString() { return this.value; }
}

function list(arr) {
  const a = arr.slice();
  a.count = a.length;
  return a;
}

/* ------------------------------------------------------------ CSV */

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift().map((h) => h.replace(/^﻿/, ''));
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

/* ------------------------------------------------------------ SVG art */

const COLORS = {
  ブラック: '#1f1d1c', ダークブラウン: '#4a3426', ブラウン: '#6b4a32', ネイビー: '#1f2a44', ボルドー: '#6b1f2a',
  グリーン: '#2f4a3a', グレー: '#9ea3a8', ホワイト: '#f4f1ea', スエード: '#5a4232',
};

function colorFor(p) {
  const text = p.title + ' ' + p.tags.join(' ');
  for (const [k, v] of Object.entries(COLORS)) if (text.includes(k)) return v;
  return '#4a3426';
}

const frame = (bg, inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000"><defs><radialGradient id="bg" cx="0.5" cy="0.38" r="0.8"><stop offset="0" stop-color="#2c2b29"/><stop offset="1" stop-color="#121212"/></radialGradient><linearGradient id="sh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.22"/><stop offset="1" stop-color="#000" stop-opacity="0.25"/></linearGradient></defs><rect width="800" height="1000" fill="url(#bg)"/><ellipse cx="400" cy="800" rx="270" ry="26" fill="#000" opacity="0.45"/>${inner}</svg>`;

const art = {
  shoe(c, alt) {
    const body = alt
      ? `<path d="M170 700 Q160 560 260 520 L420 470 Q520 450 600 520 Q660 580 640 700 Z" fill="${c}"/><path d="M170 700 Q160 560 260 520 L420 470 Q520 450 600 520 Q660 580 640 700 Z" fill="url(#sh)"/><path d="M300 520 Q380 600 470 480" fill="none" stroke="#000" stroke-opacity="0.25" stroke-width="4"/>`
      : `<path d="M110 700 Q100 620 180 600 L360 560 Q430 470 520 470 L600 480 Q660 500 680 600 L690 690 Q690 720 650 720 L140 720 Q110 720 110 700 Z" fill="${c}"/><path d="M110 700 Q100 620 180 600 L360 560 Q430 470 520 470 L600 480 Q660 500 680 600 L690 690 Q690 720 650 720 L140 720 Q110 720 110 700 Z" fill="url(#sh)"/><path d="M110 712 L690 712 L690 735 Q690 745 680 745 L120 745 Q108 745 110 735 Z" fill="#2a1d15"/><path d="M200 600 Q260 585 300 580" stroke="#000" stroke-opacity="0.3" stroke-width="4" fill="none"/><path d="M430 520 L470 600 M455 515 L495 595 M480 512 L520 590" stroke="#000" stroke-opacity="0.25" stroke-width="3"/>`;
    return frame('#ece7dd', body);
  },
  briefcase(c, alt) {
    return frame('#ece7dd', `<rect x="${alt ? 230 : 150}" y="420" width="${alt ? 340 : 500}" height="330" rx="18" fill="${c}"/><rect x="${alt ? 230 : 150}" y="420" width="${alt ? 340 : 500}" height="330" rx="18" fill="url(#sh)"/><path d="M330 420 Q330 340 400 340 Q470 340 470 420" fill="none" stroke="${c}" stroke-width="22"/><rect x="380" y="470" width="40" height="26" rx="4" fill="#c9a96a"/><path d="M${alt ? 230 : 150} 510 H${alt ? 570 : 650}" stroke="#000" stroke-opacity="0.2" stroke-width="3"/>`);
  },
  dulles(c) {
    return frame('#ece7dd', `<path d="M190 460 L610 460 L640 760 L160 760 Z" fill="${c}"/><path d="M190 460 L610 460 L640 760 L160 760 Z" fill="url(#sh)"/><rect x="180" y="440" width="440" height="40" rx="6" fill="#c9a96a"/><path d="M330 440 Q330 360 400 360 Q470 360 470 440" fill="none" stroke="${c}" stroke-width="24"/>`);
  },
  tote(c) {
    return frame('#ece7dd', `<path d="M200 430 L600 430 L630 770 L170 770 Z" fill="${c}"/><path d="M200 430 L600 430 L630 770 L170 770 Z" fill="url(#sh)"/><path d="M290 430 Q290 300 400 300 Q510 300 510 430" fill="none" stroke="${c}" stroke-width="18"/>`);
  },
  tie(c, pattern, accent) {
    const pat = pattern === 'stripe'
      ? `<pattern id="tp" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><rect width="40" height="40" fill="${c}"/><rect width="6" height="40" fill="${accent}"/></pattern>`
      : pattern === 'dot'
        ? `<pattern id="tp" width="22" height="22" patternUnits="userSpaceOnUse"><rect width="22" height="22" fill="${c}"/><circle cx="11" cy="11" r="3" fill="${accent}"/></pattern>`
        : pattern === 'knit'
          ? `<pattern id="tp" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="${c}"/><path d="M0 7 H14" stroke="#000" stroke-opacity="0.25" stroke-width="2"/></pattern>`
          : `<pattern id="tp" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="${c}"/><path d="M0 10 L10 0" stroke="#fff" stroke-opacity="0.1"/></pattern>`;
    const tip = pattern === 'knit' ? 'L470 760 L330 760' : 'L470 740 L400 800 L330 740';
    return frame('#ece7dd', `<defs>${pat}</defs><path d="M370 190 L430 190 L440 260 L360 260 Z" fill="url(#tp)"/><path d="M360 260 L440 260 ${tip} Z" fill="url(#tp)"/><path d="M360 260 L440 260 ${tip} Z" fill="url(#sh)" opacity="0.6"/>`);
  },
  belt(c) {
    return frame('#ece7dd', `<rect x="120" y="470" width="560" height="60" rx="8" fill="${c}"/><rect x="120" y="470" width="560" height="60" rx="8" fill="url(#sh)"/><rect x="560" y="455" width="70" height="90" rx="8" fill="none" stroke="#b9b9b9" stroke-width="10"/><g fill="#000" opacity="0.3"><circle cx="200" cy="500" r="5"/><circle cx="240" cy="500" r="5"/><circle cx="280" cy="500" r="5"/></g>`);
  },
  square() {
    return frame('#ece7dd', `<path d="M240 300 L560 300 L560 700 L240 700 Z" fill="#f7f4ec" stroke="#d8d1c3" stroke-width="3"/><path d="M240 300 L560 300 L560 360 L240 360 Z" fill="#eee9de"/><path d="M260 320 H540 M260 680 H540" stroke="#c9c1b2" stroke-dasharray="4 6" stroke-width="2"/>`);
  },
  cufflinks() {
    return frame('#ece7dd', `<g fill="#c9ccd1" stroke="#9aa0a6" stroke-width="4"><ellipse cx="320" cy="520" rx="80" ry="58"/><ellipse cx="490" cy="500" rx="80" ry="58"/></g><g fill="#fff" opacity="0.5"><ellipse cx="300" cy="500" rx="30" ry="14"/><ellipse cx="470" cy="480" rx="30" ry="14"/></g>`);
  },
  tree() {
    return frame('#ece7dd', `<path d="M180 560 Q170 480 260 470 L470 460 Q560 460 580 520 L600 600 Q600 630 570 630 L200 630 Q180 630 180 600 Z" fill="#c78f63"/><path d="M180 560 Q170 480 260 470 L470 460 Q560 460 580 520 L600 600 Q600 630 570 630 L200 630 Q180 630 180 600 Z" fill="url(#sh)"/><rect x="560" y="520" width="120" height="40" rx="20" fill="#b9b9b9"/><g stroke="#000" stroke-opacity="0.15" stroke-width="3"><path d="M260 500 Q380 520 500 500"/><path d="M250 560 Q380 580 520 560"/></g>`);
  },
};

function productArt(p, alt) {
  const c = colorFor(p);
  const h = p.handle;
  if (p.type === 'シューズ') return art.shoe(c, alt);
  if (h.includes('briefcase')) return art.briefcase(c, alt);
  if (h.includes('dulles')) return art.dulles(c);
  if (h.includes('tote')) return art.tote(c);
  if (p.type === 'ネクタイ') {
    const pattern = h.includes('regimental') ? 'stripe' : h.includes('komon') ? 'dot' : h.includes('knit') ? 'knit' : 'solid';
    return art.tie(c, pattern, h.includes('regimental') ? '#c9b27a' : '#c9a46a');
  }
  if (h.includes('belt')) return art.belt(c);
  if (h.includes('square')) return art.square();
  if (h.includes('cufflinks')) return art.cufflinks();
  return art.tree();
}

const scenes = {
  hero: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><defs><pattern id="pin" width="26" height="26" patternUnits="userSpaceOnUse"><rect width="26" height="26" fill="#1a2236"/><path d="M13 0 V26" stroke="#8f9bb8" stroke-opacity="0.35" stroke-width="1"/><path d="M0 26 L26 0" stroke="#fff" stroke-opacity="0.04"/></pattern><radialGradient id="l" cx="0.75" cy="0.25" r="0.8"><stop offset="0" stop-color="#d9c49b" stop-opacity="0.45"/><stop offset="0.6" stop-color="#d9c49b" stop-opacity="0"/></radialGradient></defs><rect width="1600" height="900" fill="url(#pin)"/><path d="M980 0 L1600 0 L1600 900 L1180 900 Q1060 520 980 0 Z" fill="#11172a" opacity="0.6"/><path d="M1040 0 Q1120 450 1250 900" stroke="#c9a96a" stroke-width="3" fill="none" opacity="0.5"/><rect width="1600" height="900" fill="url(#l)"/></svg>`,
  brand: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000"><rect width="800" height="1000" fill="#e6dfd2"/><g transform="rotate(-6 400 500)"><rect x="130" y="180" width="420" height="300" fill="#1f2a44"/><rect x="200" y="330" width="420" height="300" fill="#5a4232"/><rect x="160" y="480" width="420" height="300" fill="#7e8184"/><rect x="250" y="610" width="420" height="260" fill="#b9a586"/></g><g stroke="#fff" stroke-opacity="0.2"><path d="M140 200 H540 M210 350 H610 M170 500 H570"/></g><path d="M120 860 Q400 800 700 880" stroke="#a8874f" stroke-width="6" fill="none"/></svg>`,
  salon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900"><defs><linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2f27"/><stop offset="1" stop-color="#1f1a16"/></linearGradient></defs><rect width="1200" height="900" fill="url(#w)"/><g fill="#5a4232"><rect x="80" y="120" width="420" height="560"/></g><g>${Array.from({ length: 7 }, (_, i) => `<rect x="${100 + i * 56}" y="160" width="44" height="220" fill="${['#1f2a44', '#3a3c40', '#5a4232', '#7e8184', '#b9a586', '#22304d', '#6b1f2a'][i]}"/><rect x="${100 + i * 56}" y="420" width="44" height="220" fill="${['#9a9c9e', '#1e2639', '#2f4a3a', '#5c1e2a', '#3a3c40', '#b9a586', '#1f2a44'][i]}"/>`).join('')}</g><rect x="640" y="200" width="420" height="420" fill="#d9c49b" opacity="0.18"/><circle cx="850" cy="260" r="40" fill="#f1e2c0" opacity="0.6"/><rect x="600" y="700" width="520" height="40" fill="#2a221c"/></svg>`,
};

/* ------------------------------------------------------------ data */

export function buildData({ outDir, Color }) {
  const imgDir = path.join(outDir, 'img');
  fs.mkdirSync(imgDir, { recursive: true });
  const writeImg = (name, svg) => { fs.writeFileSync(path.join(imgDir, name), svg); return { src: 'img/' + name, alt: '', width: 800, height: 1000, aspect_ratio: 0.8 }; };
  for (const [k, v] of Object.entries(scenes)) writeImg(k + '.svg', v);
  const sceneImg = (k, alt) => ({ src: `img/${k}.svg`, alt: alt || '', width: 1600, height: 900 });

  const rows = parseCSV(fs.readFileSync(path.join(SETUP, 'products-sample.csv'), 'utf8'));
  const mfKey = (k) => Object.keys(rows[0]).find((c) => c.includes(`custom.${k})`));
  const groups = {};
  for (const r of rows) (groups[r.Handle] = groups[r.Handle] || []).push(r);

  let vid = 1000;
  const products = Object.entries(groups).map(([handle, rs]) => {
    const r0 = rs[0];
    const optionName = r0['Option1 Name'];
    const single = optionName === 'Title';
    const variants = rs.map((r) => ({
      id: ++vid, title: r['Option1 Value'], price: Number(r['Variant Price']) * 100, compare_at_price: null, available: true, options: [r['Option1 Value']],
    }));
    const p = {
      handle, title: r0.Title, url: `product-${handle}.html`, vendor: r0.Vendor, type: r0.Type, tags: r0.Tags.split(',').map((t) => t.trim()),
      description: r0['Body (HTML)'], price: variants[0].price, price_min: variants[0].price, price_varies: false, compare_at_price: null, available: true,
      variants, has_only_default_variant: single,
      metafields: { custom: {} },
    };
    p.selected_or_first_available_variant = variants[0];
    p.options_with_values = single ? [] : [{ name: optionName, values: variants.map((v) => new OptionValue(v.title)), selected_value: variants[0].title }];
    for (const k of ['tailor_comment', 'suit_pairing_hint', 'material', 'origin', 'care']) {
      const v = r0[mfKey(k)];
      if (v) p.metafields.custom[k] = { value: v };
    }
    const img1 = writeImg(`p-${handle}-1.svg`, productArt(p, false));
    const img2 = writeImg(`p-${handle}-2.svg`, productArt(p, true));
    img1.alt = p.title;
    p.media = [{ ...img1, media_type: 'image' }, { ...img2, media_type: 'image' }];
    p.featured_media = p.media[0];
    p.featured_image = p.media[0];
    return p;
  });
  const byHandle = Object.fromEntries(products.map((p) => [p.handle, p]));
  const pick = (...hs) => list(hs.map((h) => byHandle[h]).filter(Boolean));

  byHandle['straight-tip-black'].metafields.custom.pairing_products = { value: pick('shoe-tree', 'leather-belt', 'briefcase-black', 'tie-silver-grey') };
  byHandle['straight-tip-darkbrown'].metafields.custom.pairing_products = { value: pick('shoe-tree', 'leather-belt', 'dulles-bag-brown', 'tie-bordeaux-komon') };

  const filtersFor = (ps) => {
    const colors = ['ブラック', 'ブラウン', 'ネイビー', 'ボルドー', 'グリーン', 'グレー'];
    return [
      {
        label: 'カラー', type: 'list', active_values: [],
        values: colors.map((c) => ({ label: c, value: c, param_name: 'filter.p.tag', active: false, count: ps.filter((p) => p.tags.some((t) => t.includes(c))).length })),
      },
      {
        label: 'シーン', type: 'list', active_values: [],
        values: ['ビジネス', '結婚式', '休日'].map((c) => ({ label: c, value: c, param_name: 'filter.p.tag', active: false, count: ps.filter((p) => p.tags.includes(c)).length })),
      },
      { label: '価格', type: 'price_range', active_values: [], min_value: { param_name: 'filter.v.price.gte', value: null }, max_value: { param_name: 'filter.v.price.lte', value: null }, range_max: Math.max(...ps.map((p) => p.price)), url_to_remove: '' },
    ];
  };
  const makeCollection = (handle, title, ps, description) => ({
    handle, title, url: `collection-${handle}.html`, description: description || '', products: ps, products_count: ps.length,
    all_tags: [...new Set(ps.flatMap((p) => p.tags))], featured_image: ps[0] ? ps[0].featured_media : null,
    filters: filtersFor(ps), sort_by: 'manual', default_sort_by: 'manual',
    sort_options: [{ value: 'manual', name: 'おすすめ順' }, { value: 'price-ascending', name: '価格の安い順' }, { value: 'price-descending', name: '価格の高い順' }, { value: 'created-descending', name: '新着順' }],
  });
  const byType = (t) => products.filter((p) => p.type === t);
  const collections = {
    shoes: makeCollection('shoes', 'シューズ', byType('シューズ'), '<p>スーツの格と色に合わせて選ぶ、仕立て屋のための革靴。</p>'),
    bags: makeCollection('bags', 'バッグ', byType('バッグ'), '<p>ジャケットの肩に負担をかけない、スーツのためのバッグ。</p>'),
    ties: makeCollection('ties', 'ネクタイ', byType('ネクタイ'), '<p>ラペル幅に合わせて選ぶ、Vゾーンの主役。</p>'),
    accessories: makeCollection('accessories', 'ベルト・小物', byType('ベルト・小物'), '<p>装いの仕上げと、靴を長持ちさせる道具。</p>'),
    all: makeCollection('all', 'すべてのアイテム', products),
  };
  const collectionList = [collections.shoes, collections.bags, collections.ties, collections.accessories, collections.all];

  const readContent = (f) => fs.readFileSync(path.join(SETUP, 'content', f), 'utf8');
  const strip = (h) => h.replace(/<[^>]+>/g, '');
  const articlesSrc = [
    ['tie-width', 'ネクタイは「幅」で選ぶ。ラペルとの黄金比', 'blog-01-tie-width.html', '着こなし', ['tie-bordeaux-komon', 'tie-navy-solid', 'knit-tie-navy'], 'art-1', '#6b1f2a'],
    ['shoes-color', 'スーツの色で、靴の色は決まる', 'blog-02-shoes-color.html', '着こなし', ['straight-tip-darkbrown', 'straight-tip-black', 'leather-belt'], 'art-2', '#4a3426'],
    ['shoe-care', '良い靴を十年履くための、三つの習慣', 'blog-03-shoe-care.html', 'お手入れ', ['shoe-tree', 'straight-tip-black'], 'art-3', '#c78f63'],
  ];
  const articles = articlesSrc.map(([handle, title, file, tag, rel, imgName, color], i) => {
    const content = readContent(file);
    const img = writeImg(imgName + '.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="#e6dfd2"/><rect x="0" y="520" width="1200" height="280" fill="#d8cfbf"/><circle cx="${300 + i * 260}" cy="330" r="190" fill="${color}" opacity="0.9"/><path d="M0 520 H1200" stroke="#a8874f" stroke-width="4"/></svg>`);
    return {
      handle, title, url: `article-${handle}.html`, content, excerpt_or_content: strip(content).slice(0, 120), image: { ...img, alt: title },
      published_at: new Date(2026, 9, 8 - i * 7), tags: [tag], author: 'ROtailor', comments_count: 0,
      metafields: { custom: { related_products: { value: pick(...rel) } } },
    };
  });
  const blog = {
    title: 'テイラーの手帖', handle: 'journal', url: 'blog.html', articles, articles_count: articles.length,
    all_tags: ['着こなし', 'お手入れ'], comments_enabled_q: false, moderated_q: false, next_article: articles[1],
  };

  const pages = {
    about: { title: 'ROtailorについて', url: 'about.html', content: readContent('page-about.html') },
    simulator: { title: 'オーダースーツを仕立てる', url: 'simulator.html', content: '' },
    contact: { title: 'お問い合わせ', url: 'contact.html', content: '<p>商品やオーダースーツについて、お気軽にお問い合わせください。</p>' },
    shipping: { title: '配送・返品について', url: 'shipping.html', content: readContent('page-shipping.html') },
    sizeGuide: { title: 'シューズ サイズガイド', url: 'shipping.html', content: readContent('page-size-guide.html') },
  };

  const link = (title, url, links = []) => ({ title, url, links, current: false });
  const menus = {
    'main-menu': {
      title: 'メインメニュー',
      links: [
        link('アイテム', 'collection-all.html', [link('シューズ', 'collection-shoes.html'), link('バッグ', 'collection-bags.html'), link('ネクタイ', 'collection-ties.html'), link('ベルト・小物', 'collection-accessories.html')]),
        link('オーダースーツ', 'simulator.html'),
        link('店舗', 'about.html'),
        link('テイラーの手帖', 'blog.html'),
        link('ROtailorについて', 'about.html'),
      ],
    },
    footer: { title: 'ご案内', links: [link('配送・返品について', 'shipping.html'), link('お問い合わせ', 'contact.html'), link('ROtailorについて', 'about.html'), link('カテゴリ一覧', 'collections.html')] },
  };

  const cartItem = (h, qty) => {
    const p = byHandle[h];
    return { url: p.url, image: p.featured_media, title: p.title, product: p, variant: p.variants[0], properties: {}, url_to_remove: '#', quantity: qty, final_line_price: p.price * qty };
  };
  const items = [cartItem('tie-bordeaux-komon', 1), cartItem('straight-tip-darkbrown', 1)];
  const filledCart = { items, item_count: 2, total_price: items.reduce((s, i) => s + i.final_line_price, 0), note: '', currency: { iso_code: 'JPY' } };

  const searchResults = [...byType('ネクタイ').map((p) => ({ ...p, object_type: 'product' })), { ...articles[0], object_type: 'article' }];
  const search = { performed: true, terms: 'ネクタイ', results: searchResults, results_count: searchResults.length };

  // テーマ設定（schema の初期値＋プレビュー用の値）
  const schema = JSON.parse(fs.readFileSync(path.join(THEME, 'config/settings_schema.json'), 'utf8'));
  const settings = {};
  for (const group of schema) for (const s of group.settings || []) {
    if (!s.id) continue;
    if (s.type === 'color') settings[s.id] = new Color(s.default);
    else if (['image_picker', 'url', 'page', 'collection', 'product', 'blog'].includes(s.type)) settings[s.id] = s.default ?? null;
    else settings[s.id] = s.default ?? '';
  }
  // プレビューでは HP と同じ実際の値（schema の初期値）をそのまま使う

  // 空欄の設定をサンプルで埋めるルール
  const pairingByIndex = [
    ['tie-bordeaux-komon', 'straight-tip-darkbrown', 'dulles-bag-brown'],
    ['tie-silver-grey', 'straight-tip-black', 'briefcase-black'],
    ['tie-green-regimental', 'suede-loafer-darkbrown', 'leather-tote-navy'],
  ];
  const fill = {
    collection(info) {
      if (info.section === 'collection-list') return collectionList[info.index % 4];
      if (info.section === 'suit-pairing') return collections.ties;
      return collections.all;
    },
    productList(info, limit) {
      if (info.section === 'suit-pairing') return pick(...pairingByIndex[info.index % 3]);
      if (info.section === 'suit-simulator' && info.block === 'fabric') {
        const rot = info.index % 3;
        return pick(...pairingByIndex[rot], 'linen-pocket-square-white');
      }
      return list(products.slice(0, limit));
    },
    product(info) {
      if (info.section === 'suit-simulator' && info.block === 'tie') {
        return [byHandle['tie-bordeaux-komon'], byHandle['tie-navy-solid'], byHandle['tie-green-regimental']][info.index % 3] || '';
      }
      return '';
    },
    page(info) {
      if (info.id === 'simulator_page' || info.section === 'simulator-promo') return pages.simulator;
      if (info.block === 'size_guide') return pages.sizeGuide;
      if (info.id === 'shipping_page') return pages.shipping;
      return '';
    },
    image() {
      // 未設定の画像は、テーマ内の ROtailor の写真（フォールバック）を表示させる
      return '';
    },
  };

  return {
    products, productsByHandle: byHandle, collections, collectionList, blog, pages, menus, filledCart, search, fill,
    baseScope() {
      return {
        settings,
        shop: {
          name: 'ROtailor', url: '', description: 'スーツを知り尽くした仕立て屋が選ぶ小物のオンラインストア',
          money_format: '¥{{amount_no_decimals}}', customer_accounts_enabled: true, checkout: { guest_login: false },
          policies: [{ title: '返品ポリシー', url: 'shipping.html' }, { title: 'プライバシーポリシー', url: '#' }, { title: '特定商取引法に基づく表記', url: '#' }],
          metaobjects: { suit_fabric: { values: [] } },
        },
        routes: {
          root_url: 'index.html', cart_url: 'cart.html', cart_add_url: 'cart.html', search_url: 'search.html',
          account_url: 'account-login.html', account_login_url: 'account-login.html', account_register_url: 'account-login.html', account_logout_url: 'index.html',
          all_products_collection_url: 'collection-all.html', product_recommendations_url: '', predictive_search_url: '',
        },
        request: { locale: { iso_code: 'ja' }, origin: '', page_type: 'index' },
        cart: { items: [], item_count: 0, total_price: 0, currency: { iso_code: 'JPY' } },
        collections: collectionList,
        canonical_url: '', current_page: 1, current_tags: null, powered_by_link: '', customer: null,
      };
    },
  };
}
