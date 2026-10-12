/**
 * RO Tailor theme — static preview builder
 * ------------------------------------------------------------
 * theme/ の Liquid を LiquidJS で実際に描画し、サンプルデータ入りの
 * 静的 HTML（preview-site/）を書き出します。Shopify のストアがなくても
 * サイト全体の見た目を確認できます。
 *
 *   cd rotailor-shopify/tools/preview && npm install && npm run build
 *
 * Shopify 固有のタグ・フィルタは、表示確認に必要な範囲だけ再現しています。
 * フォーム送信・カート追加・検索候補などサーバーが必要な機能は動きません。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Liquid, Drop, Tag, Hash } from 'liquidjs';
import { buildData } from './data.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const THEME = path.join(ROOT, 'theme');
const OUT = path.join(ROOT, 'preview-site');

const read = (p) => fs.readFileSync(path.join(THEME, p), 'utf8');
const readJSON = (p) => JSON.parse(read(p));
const locale = readJSON('locales/ja.default.json');

/* ------------------------------------------------------------ helpers */

class Color extends Drop {
  constructor(hex) {
    super();
    this.hex = hex;
    const h = hex.replace('#', '');
    this.red = parseInt(h.slice(0, 2), 16);
    this.green = parseInt(h.slice(2, 4), 16);
    this.blue = parseInt(h.slice(4, 6), 16);
  }
  valueOf() { return this.hex; }
  toString() { return this.hex; }
}

// Shopify の `?` 付きプロパティを LiquidJS が読める名前に置き換える
const preprocess = (src) => src
  .replace(/posted_successfully\?/g, 'posted_successfully_q')
  .replace(/comments_enabled\?/g, 'comments_enabled_q')
  .replace(/moderated\?/g, 'moderated_q');

function yen(cents, withCurrency) {
  const n = Math.round((Number(cents) || 0) / 100);
  return '¥' + n.toLocaleString('ja-JP') + (withCurrency ? ' JPY' : '');
}

function kwargs(args) {
  // LiquidJS はキーワード引数を [name, value] の配列で渡す
  const out = {};
  for (const a of args) if (Array.isArray(a) && a.length === 2 && typeof a[0] === 'string') out[a[0]] = a[1];
  return out;
}

function interpolate(str, vars) {
  return String(str).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] ?? ''));
}

function lookupLocale(key) {
  return key.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), locale);
}

const escapeAttr = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/* ------------------------------------------------------------ engine */

const engine = new Liquid({
  root: [path.join(THEME, 'snippets')],
  extname: '.liquid',
  strictFilters: false,
  strictVariables: false,
  jsTruthy: false,
  relativeReference: false,
  fs: {
    readFileSync: (f) => preprocess(fs.readFileSync(f, 'utf8')),
    readFile: async (f) => preprocess(fs.readFileSync(f, 'utf8')),
    existsSync: fs.existsSync,
    exists: async (f) => fs.existsSync(f),
    contains: () => true,
    resolve: (root, file, ext) => path.resolve(root, file.endsWith(ext) ? file : file + ext),
    sep: path.sep,
    dirname: path.dirname,
  },
});

/* filters */
engine.registerFilter('t', function (key, ...args) {
  const v = lookupLocale(key);
  return v === undefined ? key : interpolate(v, kwargs(args));
});
engine.registerFilter('asset_url', (name) => 'assets/' + name);
engine.registerFilter('shopify_asset_url', () => '');
engine.registerFilter('stylesheet_tag', (url) => `<link rel="stylesheet" href="${url}">`);
engine.registerFilter('image_url', (img) => {
  if (!img) return '';
  if (typeof img === 'string') return img;
  return img.src || '';
});
engine.registerFilter('image_tag', (src, ...args) => {
  const o = kwargs(args);
  const attrs = [`src="${escapeAttr(src)}"`, `alt="${escapeAttr(o.alt ?? '')}"`];
  if (o.class) attrs.push(`class="${escapeAttr(o.class)}"`);
  attrs.push(`loading="${o.loading || 'lazy'}"`);
  return `<img ${attrs.join(' ')}>`;
});
engine.registerFilter('placeholder_svg_tag', (name, cls) =>
  `<svg class="${escapeAttr(cls || '')}" viewBox="0 0 525 525" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="525" height="525" fill="#e9e4da"/><path d="M180 330 L262 220 L345 330 Z" fill="#d8d0c2"/></svg>`);
engine.registerFilter('money', (c) => yen(c));
engine.registerFilter('money_with_currency', (c) => yen(c, true));
engine.registerFilter('money_without_currency', (c) => String(Math.round((Number(c) || 0) / 100)));
engine.registerFilter('handle', (s) => String(s || '').toLowerCase().trim().replace(/[^\w぀-ヿ一-龯]+/g, '-'));
engine.registerFilter('handleize', (s) => String(s || '').toLowerCase().trim().replace(/[^\w぀-ヿ一-龯]+/g, '-'));
engine.registerFilter('structured_data', () => '{}');
engine.registerFilter('payment_button', () => '');
engine.registerFilter('default_errors', () => '');
engine.registerFilter('format_address', () => '');
engine.registerFilter('format_code', (s) => s);
engine.registerFilter('video_tag', () => '');
engine.registerFilter('external_video_tag', () => '');
engine.registerFilter('media_tag', () => '');

/* tags */
engine.registerTag('schema', {
  parse(token, remain) {
    this.tpls = [];
    let t;
    while ((t = remain.shift())) {
      if (t.name === 'endschema') return;
    }
  },
  * render() { return ''; },
});

engine.registerTag('form', {
  parse(token, remain) {
    this.args = token.args;
    this.tpls = [];
    let closed = false;
    const stream = this.liquid.parser.parseStream(remain)
      .on('tag:endform', () => { closed = true; stream.stop(); })
      .on('template', (tpl) => this.tpls.push(tpl))
      .on('end', () => { if (!closed) throw new Error(`tag ${token.getText()} not closed`); });
    stream.start();
  },
  * render(ctx, emitter) {
    const parts = splitArgs(this.args);
    const type = parts.shift().replace(/['"]/g, '');
    const attrs = [];
    for (const p of parts) {
      const m = p.match(/^([\w-]+)\s*:\s*(.+)$/);
      if (!m) continue;
      const v = yield this.liquid.evalValue(m[2], ctx);
      attrs.push(`${m[1]}="${escapeAttr(v)}"`);
    }
    const action = { product: 'cart.html', contact: '#', customer_login: '#', create_customer: '#', localization: '#' }[type] || '#';
    ctx.push({ form: { errors: false, posted_successfully_q: false, author: '', email: '', body: '', set_as_default_checkbox: '<input type="checkbox">' } });
    emitter.write(`<form method="post" action="${action}" accept-charset="UTF-8" ${attrs.join(' ')} onsubmit="event.preventDefault();alert('プレビューでは送信されません');">`);
    yield this.liquid.renderer.renderTemplates(this.tpls, ctx, emitter);
    emitter.write('</form>');
    ctx.pop();
  },
});

engine.registerTag('paginate', {
  parse(token, remain) {
    this.args = token.args;
    this.tpls = [];
    let closed = false;
    const stream = this.liquid.parser.parseStream(remain)
      .on('tag:endpaginate', () => { closed = true; stream.stop(); })
      .on('template', (tpl) => this.tpls.push(tpl))
      .on('end', () => { if (!closed) throw new Error('paginate not closed'); });
    stream.start();
  },
  * render(ctx, emitter) {
    ctx.push({ paginate: { pages: 1, current_page: 1, parts: [], previous: null, next: null } });
    yield this.liquid.renderer.renderTemplates(this.tpls, ctx, emitter);
    ctx.pop();
  },
});

engine.registerTag('sections', {
  parse(token) { this.group = token.args.trim().replace(/['"]/g, ''); },
  * render(ctx, emitter) {
    const group = readJSON(`sections/${this.group}.json`);
    for (const key of group.order) {
      emitter.write(yield renderSection(key, group.sections[key], ctx.getAll()));
    }
  },
});

engine.registerTag('layout', { parse() {}, * render() { return ''; } });

function splitArgs(str) {
  const out = [];
  let cur = '';
  let q = null;
  for (const ch of str) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === ',') { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/* ------------------------------------------------------------ sections */

const schemaCache = {};
function sectionSchema(type) {
  if (!schemaCache[type]) {
    const src = read(`sections/${type}.liquid`);
    const m = src.match(/{%-?\s*schema\s*-?%}([\s\S]*?){%-?\s*endschema\s*-?%}/);
    schemaCache[type] = m ? JSON.parse(m[1]) : {};
  }
  return schemaCache[type];
}

let DATA = null;
// Shopify では settings / shop / routes などはスニペット内からも見えるグローバル
let GLOBALS = {};
let fillCounter = 0;

/** 設定値を Shopify のオブジェクトに解決（空欄はサンプルで埋める） */
function resolveSetting(def, value, ctxInfo) {
  const type = def.type;
  const blank = value === undefined || value === null || value === '';
  switch (type) {
    case 'color': return value ? new Color(value) : (def.default ? new Color(def.default) : '');
    case 'collection': {
      if (!blank && DATA.collections[value]) return DATA.collections[value];
      return DATA.fill.collection(ctxInfo) || null;
    }
    case 'product': return !blank && DATA.productsByHandle[value] ? DATA.productsByHandle[value] : (DATA.fill.product(ctxInfo) || null);
    case 'product_list': return DATA.fill.productList(ctxInfo, def.limit || 4);
    case 'blog': return DATA.blog;
    case 'page': return DATA.fill.page(ctxInfo) || null;
    case 'link_list': return DATA.menus[value || def.default] || DATA.menus['main-menu'];
    case 'image_picker': return DATA.fill.image(ctxInfo) || null;
    case 'url': return blank ? '' : value;
    default: return blank ? (def.default ?? '') : value;
  }
}

function buildSettings(defs, values, ctxInfo) {
  const out = {};
  for (const def of defs || []) {
    if (!def.id) continue;
    const v = values && def.id in values ? values[def.id] : def.default;
    out[def.id] = resolveSetting(def, v, { ...ctxInfo, id: def.id });
  }
  return out;
}

async function renderSection(id, data, scope) {
  const schema = sectionSchema(data.type);
  const blocks = (data.block_order || []).map((bid, index) => {
    const b = data.blocks[bid];
    const bdef = (schema.blocks || []).find((x) => x.type === b.type) || {};
    return {
      id: bid,
      type: b.type,
      shopify_attributes: '',
      settings: buildSettings(bdef.settings, b.settings, { section: data.type, block: b.type, index, blockId: bid }),
    };
  });
  const section = {
    id,
    settings: buildSettings(schema.settings, data.settings, { section: data.type, sectionId: id }),
    blocks,
  };
  const src = preprocess(read(`sections/${data.type}.liquid`));
  const html = await engine.parseAndRender(src, { ...scope, section }, { globals: GLOBALS });
  const cls = schema.class ? ` ${schema.class}` : '';
  return `<div id="shopify-section-${id}" class="shopify-section${cls}">${html}</div>`;
}

/* ------------------------------------------------------------ pages */

async function renderPage(file, templateName, scope) {
  GLOBALS = scope;
  const tpl = readJSON(`templates/${templateName}.json`);
  let content = '';
  for (const key of tpl.order) {
    if (tpl.sections[key].disabled) continue;
    content += await renderSection(key, tpl.sections[key], scope);
  }
  const layoutName = tpl.layout || 'theme';
  const layout = preprocess(read(`layout/${layoutName}.liquid`));
  const [name, suffix] = templateName.split('.');
  let html = await engine.parseAndRender(layout, {
    ...scope,
    content_for_layout: content,
    content_for_header: '',
    template: { name, suffix: suffix || null },
  }, { globals: GLOBALS });
  html = html.replace('<body', '<body data-preview').replace(
    /(<body[^>]*>)/,
    `$1<div class="preview-banner">プレビュー（サンプルデータ）：見た目の確認用です。カート追加・フォーム送信・検索候補は Shopify 上でのみ動作します。</div>`,
  );
  fs.writeFileSync(path.join(OUT, file), html);
  return file;
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
  for (const f of fs.readdirSync(path.join(THEME, 'assets'))) {
    fs.copyFileSync(path.join(THEME, 'assets', f), path.join(OUT, 'assets', f));
  }
  fs.appendFileSync(path.join(OUT, 'assets', 'base.css'),
    '\n.preview-banner{background:#a8874f;color:#fff;font-size:12px;text-align:center;padding:6px 12px;letter-spacing:.06em}\n');

  DATA = buildData({ outDir: OUT, Color });
  const base = DATA.baseScope();
  const pages = [];
  const page = async (file, tpl, extra) => pages.push(await renderPage(file, tpl, { ...base, ...extra(fillCounter = 0) }));

  await page('index.html', 'index', () => ({ request: { ...base.request, page_type: 'index' }, page_title: base.shop.name }));
  for (const c of DATA.collectionList) {
    await page(`collection-${c.handle}.html`, 'collection', () => ({ collection: c, request: { ...base.request, page_type: 'collection' }, page_title: c.title }));
  }
  await page('collections.html', 'list-collections', () => ({ collections: DATA.collectionList, request: { ...base.request, page_type: 'list-collections' }, page_title: 'カテゴリ' }));
  for (const p of DATA.products) {
    const col = DATA.collectionList.find((c) => c.products.includes(p));
    await page(`product-${p.handle}.html`, 'product', () => ({ product: p, collection: col, request: { ...base.request, page_type: 'product' }, page_title: p.title, recommendations: { performed: true, products: DATA.products.filter((x) => x !== p).slice(0, 4) } }));
  }
  await page('blog.html', 'blog', () => ({ blog: DATA.blog, request: { ...base.request, page_type: 'blog' }, page_title: DATA.blog.title }));
  for (const a of DATA.blog.articles) {
    await page(`article-${a.handle}.html`, 'article', () => ({ blog: DATA.blog, article: a, request: { ...base.request, page_type: 'article' }, page_title: a.title }));
  }
  await page('about.html', 'page.about', () => ({ page: DATA.pages.about, request: { ...base.request, page_type: 'page' }, page_title: DATA.pages.about.title }));
  await page('simulator.html', 'page.simulator', () => ({ page: DATA.pages.simulator, request: { ...base.request, page_type: 'page' }, page_title: DATA.pages.simulator.title }));
  await page('contact.html', 'page.contact', () => ({ page: DATA.pages.contact, request: { ...base.request, page_type: 'page' }, page_title: DATA.pages.contact.title }));
  await page('shipping.html', 'page', () => ({ page: DATA.pages.shipping, request: { ...base.request, page_type: 'page' }, page_title: DATA.pages.shipping.title }));
  await page('cart.html', 'cart', () => ({ cart: DATA.filledCart, request: { ...base.request, page_type: 'cart' }, page_title: 'カート' }));
  await page('search.html', 'search', () => ({ search: DATA.search, request: { ...base.request, page_type: 'search' }, page_title: '検索' }));
  await page('account-login.html', 'customers/login', () => ({ request: { ...base.request, page_type: 'customers/login' }, page_title: 'ログイン' }));
  await page('404.html', '404', () => ({ request: { ...base.request, page_type: '404' }, page_title: 'ページが見つかりません' }));

  console.log(`wrote ${pages.length} pages to ${path.relative(process.cwd(), OUT)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
