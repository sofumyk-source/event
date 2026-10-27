/*
 * RO Tailor — Made-to-Measure Suit Simulator
 * ------------------------------------------------------------
 * sections/suit-simulator.liquid が出力する JSON（ブロック設定）を読み込み、
 * 生地・ディテールの選択 UI、SVG プレビュー、仕上がりの確認、来店予約フォームまでを
 * 担当します。価格は表示しません（お見積もりは店頭でご案内する方針）。
 * 外部ライブラリには依存しません。
 */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  var GROUP_LABELS = {
    fabric: '生地',
    style: 'ジャケットの型',
    lapel: 'ラペル',
    pocket: '腰ポケット',
    vent: 'ベント',
    button: 'ボタン',
    lining: '裏地',
    pleat: 'パンツのタック',
    hem: 'パンツの裾',
    threePiece: 'ベスト',
    extra: 'オプション',
    shirt: 'シャツ',
    shoes: '靴',
    tie: 'Vゾーン（ネクタイ）'
  };

  var STEPS = [
    { id: 'fabric', label: '生地', groups: ['fabric'] },
    { id: 'style', label: '型', groups: ['style', 'lapel'] },
    { id: 'detail', label: 'ディテール', groups: ['pocket', 'vent', 'button', 'lining'] },
    { id: 'trousers', label: 'パンツ・ベスト', groups: ['pleat', 'hem', 'threePiece'] },
    { id: 'extra', label: 'オプション', groups: ['extra'] },
    { id: 'vzone', label: 'シャツ・タイ', groups: ['shirt', 'tie'] }
  ];

  // 写真モードの手順：写真で見た目が変わる項目だけを選んでもらう
  var PHOTO_STEPS = [
    { id: 'fabric', label: '生地', groups: ['fabric'] },
    { id: 'style', label: '型', groups: ['style', 'lapel', 'threePiece'] },
    { id: 'detail', label: 'ディテール', groups: ['pocket', 'vent', 'button', 'hem'] },
    { id: 'vzone', label: 'シャツ・タイ・靴', groups: ['shirt', 'tie', 'shoes'] }
  ];
  // 描画（suit-builder.js）が対応している型（キー）。ここにないものは写真モードでは選択肢に出さない
  var PHOTO_KEYS = {
    style: ['sb1', 'sb2', 'sb3', 'db4', 'db6'],
    lapel: ['notch', 'peak', 'shawl'],
    pocket: ['flap', 'flap_ticket', 'slant', 'jetted', 'patch'],
    vent: ['side', 'center', 'none'],
    hem: ['single', 'double']
  };
  // 写真に出ないため、店頭でご案内する項目
  var IN_STORE_GROUPS = ['lining', 'pleat', 'extra'];

  var SINGLE_GROUPS = ['fabric', 'style', 'lapel', 'pocket', 'vent', 'button', 'lining', 'pleat', 'hem', 'shirt', 'tie', 'shoes'];

  // 「色と柄から作る」生地：ベースの色・柄・柄の色
  var CLOTH_COLORS = [
    ['ネイビー', '#1F2A44'], ['ミッドナイト', '#161C2E'], ['ロイヤルブルー', '#2B4A8B'], ['明るいブルー', '#3F6FB5'], ['サックスブルー', '#7C9FCB'],
    ['ブルーグリーン', '#2E5E62'], ['ティール', '#1F4F5A'], ['ボトルグリーン', '#23412F'], ['フォレストグリーン', '#33503A'], ['オリーブ', '#556B3A'], ['カーキ', '#7A7650'], ['セージ', '#8C957A'],
    ['チャコール', '#3A3C40'], ['ミディアムグレー', '#6F7276'], ['ライトグレー', '#A3A5A7'], ['ブラック', '#1D1D1F'],
    ['ダークブラウン', '#3E2C20'], ['ブラウン', '#5A4232'], ['キャメル', '#A47A4E'], ['ベージュ', '#B9A586'],
    ['ボルドー', '#5C1E2A'], ['プラム', '#4A3A5C']
  ].map(function (c) { return { name: c[0], color: c[1] }; });
  var CLOTH_PATTERNS = [
    ['solid', '無地'], ['pinstripe', 'ピンストライプ'], ['chalkstripe', 'チョークストライプ'], ['herringbone', 'ヘリンボーン'],
    ['check', 'ウィンドウペン'], ['glen', 'グレンチェック'], ['birdseye', 'バーズアイ']
  ].map(function (p) { return { key: p[0], name: p[1] }; });
  var PATTERN_COLORS = [
    ['ホワイト', '#F2F2EE'], ['ライトグレー', '#B8BABD'], ['スカイブルー', '#8FB3DA'], ['ブルー', '#3F6FB5'], ['グリーン', '#5E8A5A'],
    ['ゴールド', '#C9A55A'], ['ブラウン', '#7A5A3C'], ['レッド', '#A8343F'], ['ラベンダー', '#9C8CC0'], ['ネイビー', '#1F2A44'], ['ブラック', '#1D1D1F']
  ].map(function (c) { return { name: c[0], color: c[1] }; });

  var SEASON_LABELS = { all: 'オールシーズン', ss: '春夏', aw: '秋冬' };

  // 写真モードで選べるシャツ（柄は suit-photo.js の shirt 用タイル）
  var SHIRTS = [
    { id: 'white', name: 'ホワイト', color: '#F6F6F2' },
    { id: 'sax', name: 'サックスブルー', color: '#CADBEE' },
    { id: 'pink', name: 'ペールピンク', color: '#F0D8DB' },
    { id: 'lavender', name: 'ラベンダー', color: '#DAD5EA' },
    { id: 'blue-stripe', name: 'ブルーストライプ', color: '#F6F6F2', pattern: 'stripe', patternColor: '#6E8EC2' },
    { id: 'london', name: 'ロンドンストライプ', color: '#F6F6F2', pattern: 'london', patternColor: '#9AB2D8' },
    { id: 'gingham', name: 'ギンガムチェック', color: '#F6F6F2', pattern: 'gingham', patternColor: '#8FA9D4' },
    { id: 'black', name: 'ブラック', color: '#26262A' }
  ];

  // 写真モードで選べる靴の色（お持ちの靴に近い色は「色を選ぶ」で自由に指定できる）
  var SHOES = [
    { id: 'black', name: 'ブラック', color: '#1a1a1a' },
    { id: 'dark-brown', name: 'ダークブラウン', color: '#3b2516' },
    { id: 'brown', name: 'ブラウン', color: '#7a4a26' },
    { id: 'tan', name: 'ライトブラウン（タン）', color: '#a8743f' },
    { id: 'burgundy', name: 'バーガンディ', color: '#4a1a22' },
    { id: 'navy', name: 'ネイビー', color: '#1f2a44' }
  ];

  // ベストだけ別の色にする場合の、生地見本にない定番色
  var VEST_EXTRAS = [
    { id: 'vest-grey', name: 'ミディアムグレー', color: '#7d7f82', pattern: 'solid' },
    { id: 'vest-beige', name: 'ベージュ', color: '#b9a586', pattern: 'solid' },
    { id: 'vest-black', name: 'ブラック', color: '#1f1f21', pattern: 'solid' },
    { id: 'vest-bordeaux', name: 'ボルドー', color: '#5c1e2a', pattern: 'solid' }
  ];

  // 人物の基準寸法（viewBox 300×640、約 8 頭身のファッション画プロポーション）
  var STYLE_GEOMETRY = {
    sb1: { vY: 262, cx: 150, buttons: [[150, 274]], double: false },
    sb2: { vY: 236, cx: 150, buttons: [[150, 250], [150, 296]], double: false },
    sb3: { vY: 226, cx: 150, buttons: [[150, 248], [150, 294]], double: false, rollHole: true },
    db6: { vY: 238, cx: 132, buttons: [[128, 246], [172, 246], [136, 280], [164, 280], [136, 314], [164, 314]], double: true },
    db4: { vY: 262, cx: 132, buttons: [[136, 274], [164, 274], [136, 310], [164, 310]], double: true }
  };

  /* ---------------------------------------------------------- utilities */

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (attrs[k] === null || attrs[k] === undefined || attrs[k] === false) return;
        if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else node.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function svg(tag, attrs, children) {
    var node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (attrs[k] === null || attrs[k] === undefined) return;
      if (k === 'href') node.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', attrs[k]);
      node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function hexToRgb(hex) {
    var h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    if (!/^[0-9a-f]{6}$/i.test(h)) return { r: 40, g: 46, b: 66 };
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }

  function rgbToHex(c) {
    return '#' + [c.r, c.g, c.b].map(function (v) {
      var s = Math.max(0, Math.min(255, Math.round(v))).toString(16);
      return s.length === 1 ? '0' + s : s;
    }).join('');
  }

  function mix(hex, target, amount) {
    var a = hexToRgb(hex);
    var b = hexToRgb(target);
    return rgbToHex({ r: a.r + (b.r - a.r) * amount, g: a.g + (b.g - a.g) * amount, b: a.b + (b.b - a.b) * amount });
  }

  function luminance(hex) {
    var c = hexToRgb(hex);
    return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
  }

  function autoPatternColor(base) {
    return luminance(base) < 0.45 ? mix(base, '#ffffff', 0.42) : mix(base, '#000000', 0.32);
  }

  function encodeState(obj) {
    try {
      return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch (e) { return ''; }
  }

  function decodeState(str) {
    try {
      var b64 = str.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      return JSON.parse(decodeURIComponent(escape(atob(b64))));
    } catch (e) { return null; }
  }

  function storageGet(key) {
    try { return JSON.parse(window.localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }

  function storageSet(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
  }

  /* --------------------------------------------------------- simulator */

  function Simulator(root) {
    this.root = root;
    var configEl = root.querySelector('[data-simulator-config]');
    this.config = JSON.parse(configEl.textContent);
    this.uid = 'sim' + (root.getAttribute('data-section-id') || Math.random().toString(36).slice(2)).replace(/[^a-z0-9]/gi, '');
    this.groups = {};
    var self = this;
    this.config.items.forEach(function (item) {
      (self.groups[item.type] = self.groups[item.type] || []).push(item);
    });
    if (this.config.photos && !(window.RoTailorPhoto && window.RoTailorBuilder)) this.config.photos = null;
    this.groups.shirt = this.config.photos ? SHIRTS.slice() : [];
    this.groups.shoes = this.config.photos ? SHOES.slice() : [];
    this.fabricMode = 'swatch';
    this.uploads = {};
    if (this.config.photos) {
      Object.keys(PHOTO_KEYS).forEach(function (g) {
        var seen = {};
        self.groups[g] = (self.groups[g] || []).filter(function (item) {
          if (PHOTO_KEYS[g].indexOf(item.key) === -1 || seen[item.key]) return false;
          seen[item.key] = true;
          return true;
        });
      });
      this.inStore = IN_STORE_GROUPS.filter(function (g) { return (self.groups[g] || []).length; }).map(function (g) {
        return { label: GROUP_LABELS[g], names: self.groups[g].map(function (i) { return i.name; }) };
      });
      IN_STORE_GROUPS.forEach(function (g) { self.groups[g] = []; });
    }
    this.steps = (this.config.photos ? PHOTO_STEPS : STEPS).filter(function (step) {
      return step.groups.some(function (g) { return self.hasGroup(g); });
    });
    this.view = 'front';
    this.stepIndex = 0;
    this.seasonFilter = 'all-filter';
    this.state = this.loadState();
    this.bind();
    this.renderStepsNav();
    this.renderStep();
    this.update();
    this.renderLook();
  }

  Simulator.prototype.hasGroup = function (g) {
    if (g === 'threePiece') return !!this.config.threePieceEnabled;
    if (g === 'shirt' || g === 'shoes') return !!this.config.photos;
    return (this.groups[g] || []).length > 0;
  };

  Simulator.prototype.find = function (group, id) {
    if (group === 'fabric' && id === 'custom') return this.customFabricItem();
    var list = this.groups[group] || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  };

  Simulator.prototype.defaults = function () {
    var self = this;
    var state = { extras: {}, threePiece: false, open: false };
    SINGLE_GROUPS.forEach(function (g) {
      var list = self.groups[g] || [];
      var picked = list.filter(function (i) { return i.isDefault; })[0] || list[0];
      state[g] = picked ? picked.id : null;
    });
    (this.groups.extra || []).forEach(function (x) {
      if (x.isDefault) state.extras[x.id] = x.needsText ? '' : true;
    });
    return state;
  };

  Simulator.prototype.sanitize = function (raw) {
    var self = this;
    var state = this.defaults();
    if (!raw || typeof raw !== 'object') return state;
    var cf = raw.customFabric;
    if (cf && /^#[0-9a-f]{6}$/i.test(cf.color || '')) {
      this.custom = {
        color: cf.color,
        pattern: CLOTH_PATTERNS.some(function (p) { return p.key === cf.pattern; }) ? cf.pattern : 'solid',
        patternColor: /^#[0-9a-f]{6}$/i.test(cf.patternColor || '') ? cf.patternColor : ''
      };
      state.customFabric = this.custom;
    }
    SINGLE_GROUPS.forEach(function (g) {
      if (raw[g] && self.find(g, raw[g])) state[g] = raw[g];
    });
    state.threePiece = !!raw.threePiece && this.hasGroup('threePiece');
    state.open = !!raw.open;
    if (raw.vestFabric && (this.find('fabric', raw.vestFabric) || this.vestExtra(raw.vestFabric))) state.vestFabric = raw.vestFabric;
    if (raw.shoes === 'custom' && /^#[0-9a-f]{6}$/i.test(raw.shoeColor || '')) {
      state.shoes = 'custom';
      state.shoeColor = raw.shoeColor;
    }
    if (raw.extras && typeof raw.extras === 'object') {
      state.extras = {};
      Object.keys(raw.extras).forEach(function (id) {
        var x = self.find('extra', id);
        if (x) state.extras[id] = x.needsText ? String(raw.extras[id] === true ? '' : raw.extras[id]).slice(0, 40) : true;
      });
    }
    if (raw.look && typeof raw.look === 'object') {
      state.look = {
        title: String(raw.look.title || '').slice(0, 40),
        comment: String(raw.look.comment || '').slice(0, 300),
        salonNote: String(raw.look.salonNote || '').slice(0, 120),
        text: String(raw.look.text || '').slice(0, 200)
      };
    }
    return state;
  };

  Simulator.prototype.loadState = function () {
    var match = window.location.hash.match(/sim=([A-Za-z0-9_-]+)/);
    if (match) {
      var fromHash = decodeState(match[1]);
      if (fromHash) {
        this.openSummaryOnLoad = true;
        return this.sanitize(fromHash);
      }
    }
    return this.sanitize(storageGet(this.config.storageKey));
  };

  Simulator.prototype.bind = function () {
    var self = this;
    var root = this.root;
    this.$ = {
      preview: root.querySelector('[data-preview]'),
      caption: root.querySelector('[data-fabric-caption]'),
      chosen: root.querySelector('[data-chosen]'),
      nav: root.querySelector('[data-steps-nav]'),
      body: root.querySelector('[data-step-body]'),
      prev: root.querySelector('[data-prev]'),
      next: root.querySelector('[data-next]'),
      summary: root.querySelector('[data-summary]'),
      spec: root.querySelector('[data-spec]'),
      summaryPreview: root.querySelector('[data-summary-preview]'),
      formSpec: root.querySelector('[data-form-spec]'),
      pairing: root.querySelector('[data-pairing]'),
      pairingComment: root.querySelector('[data-pairing-comment]'),
      stylist: root.querySelector('[data-stylist]'),
      look: root.querySelector('[data-look]'),
      stage: root.querySelector('.simulator__stage')
    };

    root.querySelectorAll('[data-view]').forEach(function (btn) {
      btn.addEventListener('click', function () { self.setView(btn.getAttribute('data-view')); });
    });

    this.$.prev.addEventListener('click', function () { self.goStep(self.stepIndex - 1); });
    this.$.next.addEventListener('click', function () {
      if (self.stepIndex >= self.steps.length - 1) self.openSummary();
      else self.goStep(self.stepIndex + 1);
    });
    root.querySelectorAll('[data-go-summary]').forEach(function (b) {
      b.addEventListener('click', function () { self.openSummary(); });
    });

    root.querySelectorAll('[data-open]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.disabled) return;
        self.state.open = btn.getAttribute('data-open') === '1';
        self.update();
      });
    });

    this.bindStylist();
    this.bindTryOn();
    this.bindCompactLayout();
    if (this.config.photos) {
      var tryon = root.querySelector('[data-tryon]');
      if (tryon) tryon.style.display = 'none'; // 写真モードでは顔写真の試着は使わない
    }

    var copyBtn = root.querySelector('[data-copy-link]');
    if (copyBtn) copyBtn.addEventListener('click', function () { self.copyLink(copyBtn); });

    var resetBtn = root.querySelector('[data-reset]');
    if (resetBtn) resetBtn.addEventListener('click', function () {
      self.state = self.defaults();
      self.renderLook();
      self.stepIndex = 0;
      self.renderStepsNav();
      self.renderStep();
      self.update();
      root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    root.querySelectorAll('[data-shuffle]').forEach(function (b) {
      b.addEventListener('click', function () { self.shuffle(); });
    });

    var today = new Date();
    var iso = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    root.querySelectorAll('[data-min-today]').forEach(function (input) { input.min = iso; });

    if (this.openSummaryOnLoad || root.querySelector('.form-message')) {
      setTimeout(function () { self.openSummary(true); }, 0);
    } else {
      setTimeout(function () { self.deepLink(); }, 0);
    }
  };

  // トップページの入口から来たとき：#start-tailor はテイラーへの入力欄へ、#start-vzone はシャツ・タイ・靴の手順へ
  Simulator.prototype.deepLink = function () {
    var hash = window.location.hash;
    if (hash === '#start-tailor' && this.$.stylist) {
      this.$.stylist.scrollIntoView({ behavior: 'smooth', block: 'start' });
      this.$.stylist.classList.add('is-highlighted');
    } else if (hash === '#start-vzone') {
      var i = -1;
      this.steps.forEach(function (st, n) { if (st.id === 'vzone') i = n; });
      if (i >= 0) {
        this.goStep(i);
        this.root.querySelector('.simulator__layout').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  Simulator.prototype.setView = function (view) {
    if (this.view === view) return;
    this.view = view;
    this.root.querySelectorAll('[data-view]').forEach(function (b) {
      var on = b.getAttribute('data-view') === view;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    this.renderPreview();
  };

  /* ------------------------------------------------------------ steps */

  Simulator.prototype.renderStepsNav = function () {
    var self = this;
    var nav = this.$.nav;
    nav.innerHTML = '';
    this.steps.forEach(function (step, i) {
      var btn = el('button', {
        type: 'button',
        role: 'tab',
        class: 'sim-steps__btn',
        'aria-selected': i === self.stepIndex ? 'true' : 'false'
      }, [el('span', { class: 'sim-steps__num', text: String(i + 1) }), el('span', { text: step.label })]);
      btn.addEventListener('click', function () { self.goStep(i); });
      nav.appendChild(el('li', { class: 'sim-steps__item' + (i === self.stepIndex ? ' is-active' : '') + (i < self.stepIndex ? ' is-done' : '') }, [btn]));
    });
    // 手順タブが画面幅に収まらないときは、いまの手順が見える位置まで横に送る
    var active = nav.querySelector('.is-active');
    if (active && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = Math.max(0, active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2);
    this.$.prev.disabled = this.stepIndex === 0;
    var nextStep = this.steps[this.stepIndex + 1];
    this.$.next.textContent = nextStep ? '次へ：' + nextStep.label : '仕上がりを見る';
  };

  Simulator.prototype.goStep = function (i) {
    if (i < 0 || i >= this.steps.length) return;
    this.stepIndex = i;
    if (this.config.photos) {
      if (this.view === 'back' && this.steps[i].id !== 'detail') this.setView('front');
      this.renderPreview();
    }
    this.renderStepsNav();
    this.renderStep();
    if (this.isCompact()) {
      // スマホ：固定したプレビューと手順タブのすぐ下に、新しい手順の先頭が来るようにする
      var offset = this.stickyTop() + this.$.stage.offsetHeight + this.$.nav.offsetHeight + 8;
      var y = this.$.body.getBoundingClientRect().top + window.pageYOffset - offset;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      return;
    }
    var top = this.$.nav.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.6) {
      this.$.nav.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  /* ---------------------------------------------------- phone layout */

  Simulator.prototype.isCompact = function () {
    return window.matchMedia('(max-width: 989px)').matches;
  };

  // 固定ヘッダーの下端（プレビューを貼り付ける位置）
  Simulator.prototype.stickyTop = function () {
    var header = document.querySelector('[data-header]');
    if (!header || getComputedStyle(header).position !== 'sticky') return 0;
    return Math.max(0, Math.round(header.getBoundingClientRect().bottom));
  };

  /*
   * スマホでは「プレビュー → 手順タブ」を画面上部に固定し、「戻る／次へ」を画面下に固定する。
   * 選択肢だけがその間をスクロールするので、いまどの手順か、次に何をするかが常に見える。
   */
  Simulator.prototype.bindCompactLayout = function () {
    var self = this;
    var root = this.root;
    var stepNav = root.querySelector('.sim-step-nav');
    var layout = root.querySelector('.simulator__layout');
    function measure() {
      root.style.setProperty('--sim-top', self.stickyTop() + 'px');
      root.style.setProperty('--sim-stage-h', self.$.stage.offsetHeight + 'px');
    }
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', function () {
      if (self.isCompact()) root.style.setProperty('--sim-top', self.stickyTop() + 'px');
    }, { passive: true });
    if (window.ResizeObserver) new ResizeObserver(measure).observe(this.$.stage);
    // 下の「戻る／次へ」は、シミュレーターが画面にある間だけ出す（仕上がりやフッターには重ねない）
    if (stepNav && layout && window.IntersectionObserver) {
      new IntersectionObserver(function (entries) {
        stepNav.classList.toggle('is-docked', entries[0].isIntersecting);
      }, { rootMargin: '0px 0px -40% 0px' }).observe(layout);
    }
  };

  Simulator.prototype.renderStep = function () {
    var self = this;
    var body = this.$.body;
    body.innerHTML = '';
    var step = this.steps[this.stepIndex];
    if (!step) return;
    step.groups.forEach(function (g) {
      if (!self.hasGroup(g)) return;
      if (g === 'fabric') body.appendChild(self.renderFabricGroup());
      else if (g === 'extra') body.appendChild(self.renderExtras());
      else if (g === 'threePiece') body.appendChild(self.renderThreePiece());
      else {
        var fs = self.renderOptionGroup(g);
        if (self.config.photos && (g === 'shirt' || g === 'tie')) fs.appendChild(self.renderUpload(g));
        if (self.config.photos && g === 'shoes') fs.appendChild(self.renderShoeColor());
        body.appendChild(fs);
      }
    });
    if (this.inStore && this.inStore.length && this.stepIndex === this.steps.length - 1) {
      body.appendChild(this.renderInStore());
    }
  };

  Simulator.prototype.select = function (group, id) {
    this.state[group] = id;
    if (group === 'shoes') delete this.state.shoeColor;
    if (this.config.photos) this.resolveConflicts(group);
    if (this.config.photos) {
      // ベントは後ろ姿で、それ以外は正面で見せる（描画は直後の update で）
      var view = group === 'vent' ? 'back' : 'front';
      if (this.view !== view) {
        this.view = view;
        this.root.querySelectorAll('[data-view]').forEach(function (b) {
          var on = b.getAttribute('data-view') === view;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
      }
    }
    if (this.uploads[group]) {
      this.uploads[group].active = false;
      this.$.body.querySelectorAll('[data-upload="' + group + '"]').forEach(function (b) { b.classList.remove('is-selected'); });
    }
    this.update();
    var inputs = this.$.body.querySelectorAll('input[name="' + this.uid + '-' + group + '"]');
    inputs.forEach(function (input) {
      input.closest('.sim-option').classList.toggle('is-selected', input.checked);
    });
  };

  // 「色と柄から作る」生地を、生地見本と同じ形のデータにする
  Simulator.prototype.customFabricItem = function () {
    var c = this.custom || (this.state && this.state.customFabric);
    if (!c) return null;
    var base = CLOTH_COLORS.filter(function (x) { return x.color.toLowerCase() === c.color.toLowerCase(); })[0];
    var pat = CLOTH_PATTERNS.filter(function (x) { return x.key === c.pattern; })[0] || CLOTH_PATTERNS[0];
    return {
      id: 'custom',
      type: 'fabric',
      name: (base ? base.name : 'オリジナル') + (pat.key === 'solid' ? ' 無地' : ' ' + pat.name),
      color: c.color,
      pattern: pat.key,
      patternColor: c.patternColor || '',
      mill: '色と柄から作った生地',
      comment: '',
      season: 'all'
    };
  };

  Simulator.prototype.setCustomFabric = function (patch) {
    var cur = this.custom || { color: (this.find('fabric', this.state.fabric) || {}).color || '#1F2A44', pattern: 'solid', patternColor: '' };
    this.custom = Object.assign({}, cur, patch);
    this.state.customFabric = this.custom;
    this.state.fabric = 'custom';
    this.update();
    this.renderStep();
  };

  // 色と柄から作る：①ベースの色 → ②柄 → ③柄の色（お任せ／パレット）
  Simulator.prototype.renderFabricBuilder = function () {
    var self = this;
    var c = this.custom || { color: (this.find('fabric', this.state.fabric) || {}).color || '#1F2A44', pattern: 'solid', patternColor: '' };
    var active = this.state.fabric === 'custom';
    var box = el('div', { class: 'sim-cloth' });

    function section(num, title, children) {
      return el('div', { class: 'sim-cloth__step' }, [
        el('p', { class: 'sim-cloth__title' }, [el('span', { class: 'sim-cloth__num', text: num }), title]),
        el('div', { class: 'sim-cloth__row' }, children)
      ]);
    }
    function dot(color, label, on, onClick, extraClass) {
      var b = el('button', { type: 'button', class: 'sim-cloth__dot' + (on ? ' is-active' : '') + (extraClass ? ' ' + extraClass : ''), title: label, 'aria-label': label, 'aria-pressed': on ? 'true' : 'false', style: color ? '--dot:' + color : '' });
      b.addEventListener('click', onClick);
      return b;
    }

    box.appendChild(section('1', 'ベースの色', CLOTH_COLORS.map(function (x) {
      return dot(x.color, x.name, active && x.color === c.color, function () { self.setCustomFabric({ color: x.color }); });
    })));

    box.appendChild(section('2', '柄', CLOTH_PATTERNS.map(function (pt) {
      var on = active && c.pattern === pt.key;
      var item = { color: c.color, pattern: pt.key, patternColor: c.patternColor };
      var b = el('button', { type: 'button', class: 'sim-cloth__pattern' + (on ? ' is-active' : ''), 'aria-pressed': on ? 'true' : 'false' }, [
        el('span', { class: 'sim-cloth__swatch' }),
        el('span', { text: pt.name })
      ]);
      b.firstChild.appendChild(self.swatchSvg(item, 'cp-' + pt.key));
      b.addEventListener('click', function () { self.setCustomFabric({ pattern: pt.key }); });
      return b;
    })));

    if (c.pattern !== 'solid') {
      var auto = el('button', { type: 'button', class: 'sim-chip' + (!c.patternColor ? ' is-active' : ''), 'aria-pressed': !c.patternColor ? 'true' : 'false', text: 'お任せ' });
      auto.addEventListener('click', function () { self.setCustomFabric({ patternColor: '' }); });
      box.appendChild(section('3', '柄の色', [auto].concat(PATTERN_COLORS.map(function (x) {
        return dot(x.color, x.name, c.patternColor === x.color, function () { self.setCustomFabric({ patternColor: x.color }); });
      }))));
    }

    var name = this.customFabricItem();
    if (active && name) box.appendChild(el('p', { class: 'sim-cloth__result', text: 'いまの生地：' + name.name + (c.pattern !== 'solid' ? '（柄の色：' + (c.patternColor ? PATTERN_COLORS.filter(function (x) { return x.color === c.patternColor; })[0].name : 'お任せ') + '）' : '') }));
    return box;
  };

  Simulator.prototype.renderFabricGroup = function () {
    var self = this;
    var fabrics = this.groups.fabric;
    var fieldset = el('fieldset', { class: 'sim-group' }, [el('legend', { class: 'sim-group__title', text: GROUP_LABELS.fabric })]);

    if (this.config.photos) {
      if (this.state.fabric === 'custom' && this.fabricModeInit !== true) { this.fabricMode = 'build'; this.fabricModeInit = true; }
      var tabs = el('div', { class: 'sim-filters sim-cloth__tabs', role: 'group', 'aria-label': '生地の選び方' });
      [['swatch', '生地見本から選ぶ'], ['build', '色と柄から作る']].forEach(function (pair) {
        var on = self.fabricMode === pair[0];
        var b = el('button', { type: 'button', class: 'sim-chip' + (on ? ' is-active' : ''), 'aria-pressed': on ? 'true' : 'false', text: pair[1] });
        b.addEventListener('click', function () {
          self.fabricMode = pair[0];
          if (pair[0] === 'build' && self.state.fabric !== 'custom') self.setCustomFabric({});
          else self.renderStep();
        });
        tabs.appendChild(b);
      });
      fieldset.appendChild(tabs);
      if (this.fabricMode === 'build') {
        fieldset.appendChild(this.renderFabricBuilder());
        return fieldset;
      }
    }

    var seasons = [];
    fabrics.forEach(function (f) { if (f.season && seasons.indexOf(f.season) === -1) seasons.push(f.season); });
    if (seasons.length > 1) {
      var filters = el('div', { class: 'sim-filters', role: 'group', 'aria-label': 'シーズンで絞り込む' });
      [['all-filter', 'すべて']].concat(seasons.map(function (s) { return [s, SEASON_LABELS[s] || s]; })).forEach(function (pair) {
        var b = el('button', { type: 'button', class: 'sim-chip' + (self.seasonFilter === pair[0] ? ' is-active' : ''), 'aria-pressed': self.seasonFilter === pair[0] ? 'true' : 'false', text: pair[1] });
        b.addEventListener('click', function () {
          self.seasonFilter = pair[0];
          self.renderStep();
        });
        filters.appendChild(b);
      });
      fieldset.appendChild(filters);
    }

    var grid = el('div', { class: 'sim-fabrics' });
    fabrics.forEach(function (f) {
      if (self.seasonFilter !== 'all-filter' && f.season !== self.seasonFilter && f.season !== 'all') return;
      var checked = self.state.fabric === f.id;
      var input = el('input', { type: 'radio', name: self.uid + '-fabric', value: f.id, class: 'visually-hidden', checked: checked });
      input.addEventListener('change', function () { self.select('fabric', f.id); });
      var swatch = el('span', { class: 'sim-fabric__swatch' });
      swatch.appendChild(self.swatchSvg(f, 'sw-' + f.id));
      var meta = [f.mill, SEASON_LABELS[f.season]].filter(Boolean).join(' ・ ');
      grid.appendChild(el('label', { class: 'sim-option sim-fabric' + (checked ? ' is-selected' : '') }, [
        input,
        swatch,
        el('span', { class: 'sim-fabric__body' }, [
          el('span', { class: 'sim-fabric__name', text: f.name }),
          meta ? el('span', { class: 'sim-fabric__meta', text: meta }) : null,
          f.origin ? el('span', { class: 'sim-fabric__origin', text: f.origin }) : null
        ])
      ]));
    });
    fieldset.appendChild(grid);
    return fieldset;
  };

  Simulator.prototype.renderOptionGroup = function (group) {
    var self = this;
    var list = this.groups[group] || [];
    var fieldset = el('fieldset', { class: 'sim-group' }, [el('legend', { class: 'sim-group__title', text: GROUP_LABELS[group] || group })]);
    var grid = el('div', { class: 'sim-options' + (group === 'button' || group === 'lining' || group === 'tie' || group === 'shirt' || group === 'shoes' ? ' sim-options--swatch' : '') });
    var uploaded = (this.uploads[group] && this.uploads[group].active) || (group === 'shoes' && this.state.shoes === 'custom');
    list.forEach(function (item) {
      var checked = self.state[group] === item.id && !uploaded;
      var input = el('input', { type: 'radio', name: self.uid + '-' + group, value: item.id, class: 'visually-hidden', checked: checked });
      input.addEventListener('change', function () { self.select(group, item.id); });

      var visual = null;
      if (group === 'button') {
        visual = el('span', { class: 'sim-option__dot sim-option__dot--button', style: '--dot:' + (item.color || '#333') });
      } else if (item.isProduct && item.image) {
        // 商品写真は生地の部分だけを拡大して見本にする
        visual = el('span', { class: 'sim-option__dot sim-option__dot--photo', style: 'background-image:url(' + JSON.stringify(item.image) + ')' });
      } else if (group === 'shoes') {
        visual = el('span', { class: 'sim-option__dot sim-option__dot--button', style: '--dot:' + item.color });
      } else if (group === 'lining' || group === 'tie' || group === 'shirt') {
        visual = el('span', { class: 'sim-option__dot' });
        visual.appendChild(self.swatchSvg(item, 'sw-' + item.id));
      } else {
        visual = self.optionIcon(group, item);
      }

      var title = item.name;
      if (group === 'lapel' && item.width) title += '（' + item.width + 'cm）';
      grid.appendChild(el('label', { class: 'sim-option' + (checked ? ' is-selected' : '') }, [
        input,
        visual,
        el('span', { class: 'sim-option__body' }, [
          el('span', { class: 'sim-option__name', text: title }),
          item.description ? el('span', { class: 'sim-option__desc', text: item.description }) : null
        ])
      ]));
    });
    fieldset.appendChild(grid);
    return fieldset;
  };

  Simulator.prototype.renderThreePiece = function () {
    var self = this;
    var fieldset = el('fieldset', { class: 'sim-group' }, [el('legend', { class: 'sim-group__title', text: 'スリーピース' })]);
    var grid = el('div', { class: 'sim-options' });
    [[false, 'ツーピース（上下）', 'ジャケットとパンツ'], [true, 'スリーピース（ベスト付き）', 'Vゾーンにベストをのぞかせて']].forEach(function (opt) {
      var checked = self.state.threePiece === opt[0];
      var input = el('input', { type: 'radio', name: self.uid + '-three', class: 'visually-hidden', checked: checked });
      input.addEventListener('change', function () {
        self.state.threePiece = opt[0];
        self.update();
        if (self.config.photos) self.renderStep(); // ベストの生地の選択欄を出し入れする
        else grid.querySelectorAll('.sim-option').forEach(function (o) {
          o.classList.toggle('is-selected', o.querySelector('input').checked);
        });
      });
      grid.appendChild(el('label', { class: 'sim-option' + (checked ? ' is-selected' : '') }, [
        input,
        el('span', { class: 'sim-option__body' }, [
          el('span', { class: 'sim-option__name', text: opt[1] }),
          el('span', { class: 'sim-option__desc', text: opt[2] })
        ])
      ]));
    });
    fieldset.appendChild(grid);
    if (this.config.photos && this.state.threePiece) fieldset.appendChild(this.renderVestFabric());
    return fieldset;
  };

  Simulator.prototype.vestExtra = function (id) {
    return VEST_EXTRAS.filter(function (v) { return v.id === id; })[0] || null;
  };

  // ベストの生地：スーツと同じ（初期値）か、別の生地・色
  Simulator.prototype.renderVestFabric = function () {
    var self = this;
    var box = el('div', { class: 'sim-vestcloth' }, [el('p', { class: 'sim-vestcloth__title', text: 'ベストの生地' })]);
    var grid = el('div', { class: 'sim-options sim-options--swatch' });
    var items = [{ id: '', name: 'スーツと同じ', same: true }].concat(this.groups.fabric, VEST_EXTRAS);
    items.forEach(function (item) {
      var checked = (self.state.vestFabric || '') === item.id;
      var input = el('input', { type: 'radio', name: self.uid + '-vestcloth', class: 'visually-hidden', checked: checked });
      input.addEventListener('change', function () {
        self.state.vestFabric = item.id || null;
        self.update();
        grid.querySelectorAll('.sim-option').forEach(function (o) { o.classList.toggle('is-selected', o.querySelector('input').checked); });
      });
      var visual = el('span', { class: 'sim-option__dot' });
      var swatchItem = item.same ? (self.find('fabric', self.state.fabric) || {}) : item;
      visual.appendChild(self.swatchSvg(swatchItem, 'vc-' + (item.id || 'same')));
      grid.appendChild(el('label', { class: 'sim-option' + (checked ? ' is-selected' : '') }, [
        input, visual, el('span', { class: 'sim-option__body' }, [el('span', { class: 'sim-option__name', text: item.name })])
      ]));
    });
    box.appendChild(grid);
    return box;
  };

  // お持ちの靴に合わせて、色を自由に選ぶ
  Simulator.prototype.renderShoeColor = function () {
    var self = this;
    var custom = this.state.shoes === 'custom';
    var input = el('input', { type: 'color', value: this.state.shoeColor || '#5a3a22', 'aria-label': 'お持ちの靴の色' });
    input.addEventListener('input', function () {
      self.state.shoes = 'custom';
      self.state.shoeColor = input.value;
      self.update();
      self.$.body.querySelectorAll('input[name="' + self.uid + '-shoes"]').forEach(function (r) {
        r.checked = false;
        r.closest('.sim-option').classList.remove('is-selected');
      });
      label.classList.add('is-selected');
    });
    var label = el('label', { class: 'sim-option sim-upload' + (custom ? ' is-selected' : '') }, [
      el('span', { class: 'sim-option__dot sim-shoecolor' }, [input]),
      el('span', { class: 'sim-option__body' }, [
        el('span', { class: 'sim-option__name', text: 'お持ちの靴の色を選ぶ' }),
        el('span', { class: 'sim-option__desc', text: '色の見本から近い色を選んでください' })
      ])
    ]);
    return el('div', { class: 'sim-options sim-options--swatch sim-upload-row' }, [label]);
  };

  Simulator.prototype.renderExtras = function () {
    var self = this;
    var fieldset = el('fieldset', { class: 'sim-group' }, [el('legend', { class: 'sim-group__title', text: GROUP_LABELS.extra })]);
    var grid = el('div', { class: 'sim-options sim-options--list' });
    this.groups.extra.forEach(function (x) {
      var on = Object.prototype.hasOwnProperty.call(self.state.extras, x.id);
      var input = el('input', { type: 'checkbox', class: 'sim-check', checked: on });
      var textInput = null;
      if (x.needsText) {
        textInput = el('input', { type: 'text', class: 'sim-text', maxlength: '20', placeholder: '例）K.TANAKA', value: on ? self.state.extras[x.id] : '', 'aria-label': x.name + 'の内容' });
        textInput.disabled = !on;
        textInput.addEventListener('input', function () {
          self.state.extras[x.id] = textInput.value;
          self.update();
        });
      }
      input.addEventListener('change', function () {
        if (input.checked) self.state.extras[x.id] = x.needsText ? (textInput ? textInput.value : '') : true;
        else delete self.state.extras[x.id];
        if (textInput) {
          textInput.disabled = !input.checked;
          if (input.checked) textInput.focus();
        }
        label.classList.toggle('is-selected', input.checked);
        self.update();
      });
      var label = el('label', { class: 'sim-option sim-option--check' + (on ? ' is-selected' : '') }, [
        input,
        el('span', { class: 'sim-option__body' }, [
          el('span', { class: 'sim-option__name', text: x.name }),
          x.description ? el('span', { class: 'sim-option__desc', text: x.description }) : null
        ])
      ]);
      var wrap = el('div', { class: 'sim-extra' }, [label, textInput]);
      grid.appendChild(wrap);
    });
    fieldset.appendChild(grid);
    return fieldset;
  };

  /* small line icons for option cards */
  Simulator.prototype.optionIcon = function (group, item) {
    var s = svg('svg', { viewBox: '0 0 48 48', class: 'sim-option__icon', 'aria-hidden': 'true' });
    var stroke = { fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' };
    function p(d) { s.appendChild(svg('path', Object.assign({ d: d }, stroke))); }
    function c(x, y) { s.appendChild(svg('circle', { cx: x, cy: y, r: 2.2, fill: 'currentColor' })); }
    var k = item.key;
    if (group === 'style') {
      p('M14 6 L24 30 L34 6');
      if (k === 'db6' || k === 'db4') {
        p('M18 30 V44');
        c(19, 32); c(29, 32); c(19, 39); c(29, 39);
        if (k === 'db6') { c(17, 25); c(31, 25); }
      } else {
        p('M24 30 V44');
        if (k === 'sb1') c(24, 34);
        else { c(24, 33); c(24, 41); if (k === 'sb3') c(24, 25); }
      }
    } else if (group === 'lapel') {
      if (k === 'peak') p('M30 44 L18 20 L10 8 L22 14 L26 10 L30 4');
      else if (k === 'shawl') p('M30 44 C16 30 12 16 22 4');
      else p('M30 44 L16 20 L14 12 L22 13 L22 8 L28 4');
    } else if (group === 'pocket') {
      if (k === 'patch') p('M10 14 H38 V38 Q38 42 34 42 H14 Q10 42 10 38 Z');
      else if (k === 'jetted') { p('M8 22 H40'); p('M8 26 H40'); }
      else if (k === 'slant') p('M8 26 L40 18 L41 24 L9 32 Z');
      else {
        p('M8 24 H40 V32 H8 Z');
        if (k === 'flap_ticket') p('M10 12 H34 V18 H10 Z');
      }
    } else if (group === 'vent') {
      p('M8 6 H40 V42 H8 Z');
      if (k === 'center') p('M24 26 V42');
      if (k === 'side') { p('M13 28 V42'); p('M35 28 V42'); }
    } else if (group === 'pleat') {
      p('M10 6 H38 L36 44 H12 Z');
      if (k === 'one' || k === 'two') p('M18 6 V16');
      if (k === 'two') p('M23 6 V13');
      p('M24 6 V12');
    } else if (group === 'hem') {
      p('M14 4 L12 40 H36 L34 4');
      if (k === 'double') p('M12 34 H36');
    } else {
      p('M10 24 H38');
    }
    return s;
  };

  /* ------------------------------------------------------ pricing */

  Simulator.prototype.lines = function () {
    var self = this;
    var st = this.state;
    var rows = [];
    var fabric = this.find('fabric', st.fabric);
    if (fabric) rows.push({ label: '生地', value: [fabric.name, fabric.mill].filter(Boolean).join(' ／ ') });
    ['style', 'lapel', 'pocket', 'vent', 'button', 'lining', 'pleat', 'hem'].forEach(function (g) {
      var item = self.find(g, st[g]);
      if (!item) return;
      var value = item.name + (g === 'lapel' && item.width ? '（' + item.width + 'cm）' : '');
      rows.push({ label: GROUP_LABELS[g], value: value });
    });
    if (this.hasGroup('threePiece')) {
      var vestCloth = st.vestFabric ? (this.find('fabric', st.vestFabric) || this.vestExtra(st.vestFabric)) : null;
      rows.push({ label: 'ベスト', value: st.threePiece ? 'スリーピース（ベスト付き）' + (vestCloth ? '／ベストの生地：' + vestCloth.name : '') : 'なし' });
    }
    if (this.hasGroup('shirt')) {
      var shirt = this.find('shirt', st.shirt);
      var up = this.uploads.shirt && this.uploads.shirt.active;
      if (up || shirt) rows.push({ label: 'シャツ', value: up ? 'お持ちの写真から' : shirt.name });
    }
    if (this.hasGroup('shoes')) {
      var shoe = this.find('shoes', st.shoes);
      rows.push({ label: '靴', value: st.shoes === 'custom' ? 'お持ちの靴の色（' + st.shoeColor + '）' : (shoe ? shoe.name : 'ブラック') });
    }
    Object.keys(st.extras).forEach(function (id) {
      var x = self.find('extra', id);
      if (!x) return;
      var v = x.needsText ? (st.extras[id] ? '「' + st.extras[id] + '」' : '（内容は来店時に）') : 'あり';
      rows.push({ label: x.name, value: v });
    });
    return rows;
  };

  Simulator.prototype.specText = function () {
    var tie = this.find('tie', this.state.tie);
    var text = this.lines().map(function (r) { return r.label + '：' + r.value; });
    if (this.uploads.tie && this.uploads.tie.active) text.push('Vゾーン：お持ちのネクタイの写真から');
    else if (tie) text.push('Vゾーン：' + tie.name);
    if (this.state.look) {
      text.unshift('一着の名前：' + this.state.look.title);
      if (this.state.look.text) text.unshift('お客様のイメージ：' + this.state.look.text);
    }
    text.push('シミュレーション URL：' + this.shareUrl());
    return text.join('\n');
  };

  Simulator.prototype.shareUrl = function () {
    return window.location.href.split('#')[0] + '#sim=' + encodeState(this.state);
  };

  /* ------------------------------------------------------- update */

  Simulator.prototype.update = function () {
    storageSet(this.config.storageKey, this.state);
    this.renderPreview();
    if (this.$.chosen) {
      var fabric = this.find('fabric', this.state.fabric);
      var style = this.find('style', this.state.style);
      this.$.chosen.textContent = [fabric && fabric.name, style && style.name, this.state.threePiece ? 'スリーピース' : null].filter(Boolean).join(' ・ ');
    }
    this.renderSummary();
    this.renderPairing();
  };

  Simulator.prototype.renderSummary = function () {
    var spec = this.$.spec;
    spec.innerHTML = '';
    var tie = this.find('tie', this.state.tie);
    this.lines().forEach(function (r) {
      spec.appendChild(el('div', { class: 'sim-spec__row' }, [el('dt', { text: r.label }), el('dd', { text: r.value })]));
    });
    var tieUp = this.uploads.tie && this.uploads.tie.active;
    if (tie || tieUp) spec.appendChild(el('div', { class: 'sim-spec__row' }, [el('dt', { text: 'Vゾーン' }), el('dd', { text: tieUp ? 'お持ちのネクタイの写真から' : tie.name })]));
    if (this.state.look) {
      spec.insertBefore(el('div', { class: 'sim-spec__row sim-spec__row--look' }, [el('dt', { text: '一着の名前' }), el('dd', { text: this.state.look.title })]), spec.firstChild);
    }
    if (this.inStore && this.inStore.length) {
      spec.appendChild(el('div', { class: 'sim-spec__row sim-spec__row--note' }, [
        el('dt', { text: '店頭で' }),
        el('dd', { text: this.inStore.map(function (g) { return g.label; }).join('・') + 'をお選びいただけます' })
      ]));
    }
    if (this.$.formSpec) this.$.formSpec.value = this.specText();
    if (this.config.photos && this.$.summaryPreview) {
      if (!this.$.summary.hidden) this.renderCover();
    } else if (this.$.summaryPreview) {
      this.$.summaryPreview.innerHTML = '';
      var canvas = this.$.preview.querySelector('canvas');
      var clone = this.$.preview.querySelector('svg');
      if (canvas && canvas.width) {
        try {
          this.$.summaryPreview.appendChild(el('img', { src: canvas.toDataURL('image/jpeg', 0.85), alt: '' }));
        } catch (e) { /* 外部画像の都合で書き出せない場合は省略 */ }
      } else if (clone) this.$.summaryPreview.appendChild(clone.cloneNode(true));
    }
  };


  /* ------------------------------------------------- AI stylist */

  var PATTERN_LABELS = { solid: '無地', pinstripe: 'ピンストライプ', chalkstripe: 'チョークストライプ', check: 'ウィンドウペン', glen: 'グレンチェック', herringbone: 'ヘリンボーン', birdseye: 'バーズアイ' };

  Simulator.prototype.catalogPayload = function () {
    var self = this;
    var catalog = {};
    SINGLE_GROUPS.forEach(function (g) {
      var list = self.groups[g] || [];
      if (!list.length) return;
      catalog[g] = list.map(function (item) {
        var hint = [
          item.mill,
          item.pattern ? PATTERN_LABELS[item.pattern] || item.pattern : null,
          item.color ? '色 ' + item.color : null,
          item.season ? SEASON_LABELS[item.season] : null,
          item.width ? '幅 ' + item.width + 'cm' : null,
          item.description || item.comment
        ].filter(Boolean).join(' ／ ');
        return { id: item.id, name: item.name, hint: hint.slice(0, 150) };
      });
    });
    return catalog;
  };

  var STYLIST_COLORS = [
    { key: 'navy', label: 'ネイビー', hex: '#1f2a44' },
    { key: 'charcoal', label: 'チャコール', hex: '#3a3c40' },
    { key: 'lightgrey', label: 'ライトグレー', hex: '#9a9c9e' },
    { key: 'black', label: 'ブラック', hex: '#1e1f22' },
    { key: 'brown', label: 'ブラウン', hex: '#5a4232' },
    { key: 'beige', label: 'ベージュ', hex: '#b9a586' },
    { key: 'blue', label: 'ブルー', hex: '#2e5f8a' },
    { key: 'green', label: 'グリーン', hex: '#2f4a3a' },
    { key: 'bordeaux', label: 'ボルドー', hex: '#5c1e2a' }
  ];
  var STYLIST_SCENES = [
    { key: 'business', label: '毎日のビジネス' },
    { key: 'pitch', label: '商談・プレゼン' },
    { key: 'interview', label: '面接・入社式' },
    { key: 'ceremony', label: '結婚式・式典' },
    { key: 'party', label: 'パーティー' },
    { key: 'dinner', label: '会食・デート' },
    { key: 'casual', label: '休日・おでかけ' }
  ];
  var MAX_COLORS = 3;

  // 画像を縮小して JPEG の dataURL にする（送信量と端末メモリを抑える）
  function loadImage(file, maxSize) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) { reject(new Error('not image')); return; }
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var scale = Math.min(1, maxSize / Math.max(img.width, img.height));
          var canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve({ url: canvas.toDataURL('image/jpeg', 0.82), canvas: canvas });
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // 写真の主な色を最大 3 色取り出す（白飛び・真っ黒は除外）
  function dominantColors(canvas) {
    var small = document.createElement('canvas');
    small.width = 48;
    small.height = 48;
    var ctx = small.getContext('2d');
    ctx.drawImage(canvas, 0, 0, 48, 48);
    var data = ctx.getImageData(0, 0, 48, 48).data;
    var buckets = {};
    for (var i = 0; i < data.length; i += 4) {
      var r = data[i], g = data[i + 1], b = data[i + 2];
      var l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (l > 0.9 || l < 0.04) continue;
      // 写真の中央（主役が写っていることが多い）ほど重く数える
      var px = (i / 4) % 48 - 23.5;
      var py = Math.floor(i / 4 / 48) - 23.5;
      var w = Math.max(0.05, 1 - Math.sqrt(px * px + py * py) / 30);
      var key = (r >> 4) + ',' + (g >> 4) + ',' + (b >> 4);
      var bucket = buckets[key] || (buckets[key] = { n: 0, c: 0, r: 0, g: 0, b: 0 });
      bucket.n += w; bucket.c++; bucket.r += r; bucket.g += g; bucket.b += b;
    }
    var list = Object.keys(buckets).map(function (k) {
      var x = buckets[k];
      return { n: x.n, hex: rgbToHex({ r: x.r / x.c, g: x.g / x.c, b: x.b / x.c }) };
    }).sort(function (a, b) { return b.n - a.n; });
    var picked = [];
    list.forEach(function (c) {
      if (picked.length >= 3) return;
      var far = picked.every(function (p) {
        var a = hexToRgb(p), b = hexToRgb(c.hex);
        return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) > 90;
      });
      if (far) picked.push(c.hex);
    });
    return picked;
  }

  Simulator.prototype.bindStylist = function () {
    var self = this;
    var box = this.$.stylist;
    if (!box) return;
    this.prefs = { colors: [], scenes: [], note: '', photo: null, photoColors: [] };
    var form = box.querySelector('form');
    var colorWrap = box.querySelector('[data-stylist-colors]');
    var sceneWrap = box.querySelector('[data-stylist-scenes]');
    var note = box.querySelector('[data-stylist-input]');
    var photoInput = box.querySelector('[data-stylist-photo]');
    var thumb = box.querySelector('[data-stylist-thumb]');
    var removePhoto = box.querySelector('[data-stylist-photo-remove]');
    var photoColorsEl = box.querySelector('[data-stylist-photo-colors]');

    STYLIST_COLORS.forEach(function (c) {
      var btn = el('button', { type: 'button', class: 'sim-color', 'aria-pressed': 'false', style: '--swatch:' + c.hex }, [
        el('span', { class: 'sim-color__dot' }), el('span', { text: c.label })
      ]);
      btn.addEventListener('click', function () {
        var i = self.prefs.colors.indexOf(c.key);
        if (i !== -1) self.prefs.colors.splice(i, 1);
        else {
          if (self.prefs.colors.length >= MAX_COLORS) self.prefs.colors.shift();
          self.prefs.colors.push(c.key);
        }
        colorWrap.querySelectorAll('.sim-color').forEach(function (b, idx) {
          var on = self.prefs.colors.indexOf(STYLIST_COLORS[idx].key) !== -1;
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
          b.classList.toggle('is-active', on);
        });
      });
      colorWrap.appendChild(btn);
    });

    STYLIST_SCENES.forEach(function (sc) {
      var btn = el('button', { type: 'button', class: 'sim-chip', 'aria-pressed': 'false', text: sc.label });
      btn.addEventListener('click', function () {
        var i = self.prefs.scenes.indexOf(sc.key);
        if (i !== -1) self.prefs.scenes.splice(i, 1);
        else self.prefs.scenes.push(sc.key);
        var on = i === -1;
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.classList.toggle('is-active', on);
      });
      sceneWrap.appendChild(btn);
    });

    if (photoInput) {
      photoInput.addEventListener('change', function () {
        var file = photoInput.files && photoInput.files[0];
        if (!file) return;
        loadImage(file, 768).then(function (res) {
          self.prefs.photo = res.url;
          self.prefs.photoColors = dominantColors(res.canvas);
          thumb.src = res.url;
          thumb.hidden = false;
          removePhoto.hidden = false;
          photoColorsEl.innerHTML = '';
          self.prefs.photoColors.forEach(function (hex) {
            photoColorsEl.appendChild(el('span', { class: 'sim-stylist__photo-color', style: 'background:' + hex, title: hex }));
          });
        }).catch(function () {
          window.alert('画像を読み込めませんでした。JPEG または PNG の写真をお試しください。');
        });
        photoInput.value = '';
      });
      removePhoto.addEventListener('click', function () {
        self.prefs.photo = null;
        self.prefs.photoColors = [];
        thumb.hidden = true;
        thumb.removeAttribute('src');
        removePhoto.hidden = true;
        photoColorsEl.innerHTML = '';
      });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      self.prefs.note = note ? note.value.trim().slice(0, 100) : '';
      var p = self.prefs;
      if (!p.colors.length && !p.scenes.length && !p.photo && !p.note) {
        var hint = box.querySelector('[data-stylist-progress]');
        hint.hidden = false;
        hint.textContent = '色か場面を一つ以上選んでください';
        return;
      }
      self.runStylist();
    });
  };

  Simulator.prototype.prefsSummary = function () {
    var p = this.prefs;
    var label = function (list, keys) {
      return keys.map(function (k) { return (list.filter(function (x) { return x.key === k; })[0] || {}).label; }).filter(Boolean).join('・');
    };
    var parts = [];
    if (p.colors.length) parts.push('好きな色：' + label(STYLIST_COLORS, p.colors));
    if (p.scenes.length) parts.push('着る場面：' + label(STYLIST_SCENES, p.scenes));
    if (p.note) parts.push('ひとこと：' + p.note);
    if (p.photo) parts.push('参考写真あり');
    return parts;
  };

  Simulator.prototype.runStylist = function () {
    var self = this;
    var box = this.$.stylist;
    var button = box.querySelector('[type="submit"]');
    var progress = box.querySelector('[data-stylist-progress]');
    var phases = ['生地棚を見渡しています', '型紙を引いています', '裁断しています', '仕上げのアイロンをかけています'];
    var phase = 0;
    button.disabled = true;
    box.classList.add('is-working');
    progress.hidden = false;
    progress.textContent = phases[0];
    var timer = setInterval(function () {
      phase = (phase + 1) % phases.length;
      progress.textContent = phases[phase];
    }, 1100);
    var started = Date.now();
    var summary = this.prefsSummary();
    var p = this.prefs;

    var endpoint = this.config.stylistEndpoint;
    var payload = { text: summary.join('\n'), catalog: this.catalogPayload(), threePiece: this.hasGroup('threePiece') };
    if (p.photo) payload.image = { mediaType: 'image/jpeg', data: p.photo.split(',')[1] };
    var request = endpoint
      ? fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(function (res) {
          if (!res.ok) throw new Error('stylist ' + res.status);
          return res.json();
        }).then(function (data) {
          data.source = 'ai';
          return data;
        })
      : Promise.reject(new Error('no endpoint'));

    request
      .catch(function () {
        if (!window.RoTailorStylist) return null;
        var colors = p.colors.map(function (k) { return STYLIST_COLORS.filter(function (c) { return c.key === k; })[0]; }).filter(Boolean);
        return window.RoTailorStylist.local({
          colors: colors,
          scenes: p.scenes,
          note: p.note,
          photoColors: p.photoColors
        }, self.groups, self.hasGroup('threePiece'));
      })
      .then(function (look) {
        var wait = Math.max(0, 2400 - (Date.now() - started));
        setTimeout(function () {
          clearInterval(timer);
          button.disabled = false;
          box.classList.remove('is-working');
          progress.hidden = true;
          if (look) self.applyLook(look, summary.join(' ／ '));
        }, wait);
      });
  };

  /* ------------------------------------------------- photo try-on */

  Simulator.prototype.bindTryOn = function () {
    var self = this;
    var box = this.root.querySelector('[data-tryon]');
    if (!box) return;
    var file = box.querySelector('[data-tryon-file]');
    var controls = box.querySelector('[data-tryon-controls]');
    var zoom = box.querySelector('[data-tryon-zoom]');
    var remove = box.querySelector('[data-tryon-remove]');

    file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      if (!f) return;
      loadImage(f, 640).then(function (res) {
        self.photo = { url: res.url, zoom: 1.6, x: 0, y: 8 };
        zoom.value = '1.6';
        controls.hidden = false;
        box.classList.add('has-photo');
        self.renderPreview();
        self.renderSummary();
      }).catch(function () {
        window.alert('画像を読み込めませんでした。JPEG または PNG の写真をお試しください。');
      });
      file.value = '';
    });
    zoom.addEventListener('input', function () {
      if (!self.photo) return;
      self.photo.zoom = parseFloat(zoom.value) || 1;
      self.renderPreview();
    });
    remove.addEventListener('click', function () {
      self.photo = null;
      controls.hidden = true;
      box.classList.remove('has-photo');
      self.renderPreview();
      self.renderSummary();
    });

    // 顔の位置合わせ：プレビューの顔をドラッグ
    var drag = null;
    var preview = this.$.preview;
    preview.addEventListener('pointerdown', function (e) {
      if (!self.photo || !e.target.closest('[data-photo-head]')) return;
      var svgEl = preview.querySelector('svg');
      var scale = 300 / svgEl.getBoundingClientRect().width;
      drag = { x: e.clientX, y: e.clientY, ox: self.photo.x, oy: self.photo.y, scale: scale };
      preview.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    preview.addEventListener('pointermove', function (e) {
      if (!drag) return;
      self.photo.x = drag.ox + (e.clientX - drag.x) * drag.scale;
      self.photo.y = drag.oy + (e.clientY - drag.y) * drag.scale;
      var img = preview.querySelector('[data-photo-head] image');
      if (img) {
        var size = 120 * self.photo.zoom;
        img.setAttribute('x', 150 - size / 2 + self.photo.x);
        img.setAttribute('y', 50 - size / 2 + self.photo.y);
      }
    });
    var end = function () {
      if (!drag) return;
      drag = null;
      self.renderSummary();
    };
    preview.addEventListener('pointerup', end);
    preview.addEventListener('pointercancel', end);
  };

  Simulator.prototype.applyLook = function (look, text) {
    var self = this;
    var sel = look.selection || {};
    SINGLE_GROUPS.forEach(function (g) {
      if (sel[g] && self.find(g, sel[g])) self.state[g] = sel[g];
    });
    if (this.hasGroup('threePiece')) this.state.threePiece = !!look.threePiece;
    if (this.config.photos) {
      this.state.vestFabric = look.vestFabric && this.vestExtra(look.vestFabric) ? look.vestFabric : null;
      this.state.open = !!look.open;
      delete this.state.shoeColor;
      if (this.uploads.shirt) this.uploads.shirt.active = false;
      if (this.uploads.tie) this.uploads.tie.active = false;
    }
    this.state.look = { title: look.title || '', comment: look.comment || '', salonNote: look.salonNote || '', text: text };
    this.renderStep();
    this.update();
    this.renderLook();
    if (this.config.photos) {
      // テイラーが仕立てた一着を、そのまま表紙で発表する。細部はそこから自分で調整できる
      this.coverNo = null;
      this.openSummary();
      return;
    }
    var stage = this.root.querySelector('.simulator__layout');
    if (stage) stage.scrollIntoView({ behavior: 'smooth', block: 'start' });
    var preview = this.$.preview;
    preview.classList.remove('is-revealed');
    void preview.offsetWidth;
    preview.classList.add('is-revealed');
    clearTimeout(this.revealTimer);
    this.revealTimer = setTimeout(function () { preview.classList.remove('is-revealed'); }, 1000);
  };

  Simulator.prototype.renderLook = function () {
    var box = this.$.look;
    if (!box) return;
    var look = this.state.look;
    box.innerHTML = '';
    box.hidden = !look;
    if (!look) return;
    box.appendChild(el('p', { class: 'sim-look__eyebrow', text: 'TAILOR\'S NOTE' }));
    box.appendChild(el('p', { class: 'sim-look__title', text: look.title }));
    if (look.text) box.appendChild(el('p', { class: 'sim-look__request', text: '「' + look.text + '」' }));
    box.appendChild(el('p', { class: 'sim-look__comment', text: look.comment }));
    if (look.salonNote) box.appendChild(el('p', { class: 'sim-look__salon', text: look.salonNote }));
  };

  /* おまかせ：ランダムに組み合わせる */
  Simulator.prototype.shuffle = function () {
    var self = this;
    SINGLE_GROUPS.forEach(function (g) {
      var list = self.groups[g] || [];
      if (list.length) self.state[g] = list[Math.floor(Math.random() * list.length)].id;
    });
    if (this.hasGroup('threePiece')) this.state.threePiece = Math.random() < 0.3;
    this.state.open = false;
    delete this.state.look;
    this.renderLook();
    this.renderStep();
    this.update();
  };

  Simulator.prototype.renderPairing = function () {
    var wrap = this.$.pairing;
    if (!wrap) return;
    var fabric = this.find('fabric', this.state.fabric);
    var any = false;
    var fabricGrid = fabric ? wrap.querySelector('[data-pairing-for="' + fabric.id + '"]') : null;
    var fallback = wrap.querySelector('[data-pairing-for="fallback"]');
    wrap.querySelectorAll('[data-pairing-for]').forEach(function (g) { g.hidden = true; });
    if (fabricGrid) { fabricGrid.hidden = false; any = true; }
    else if (fallback) { fallback.hidden = false; any = true; }
    var tieId = this.state.tie;
    wrap.querySelectorAll('[data-tie-product-for]').forEach(function (g) {
      var on = g.getAttribute('data-tie-product-for') === tieId;
      g.hidden = !on;
      if (on) any = true;
    });
    if (this.$.pairingComment) this.$.pairingComment.textContent = fabric && fabric.comment ? fabric.comment : '';
    wrap.hidden = !any;
  };

  Simulator.prototype.openSummary = function (instant) {
    var s = this.$.summary;
    s.hidden = false;
    this.renderSummary();
    if (this.$.cover) {
      var c = this.$.cover;
      c.classList.remove('is-revealed');
      void c.offsetWidth;
      c.classList.add('is-revealed');
    }
    s.scrollIntoView({ behavior: instant ? 'auto' : 'smooth', block: 'start' });
    s.focus({ preventScroll: true });
  };

  Simulator.prototype.copyLink = function (btn) {
    var url = this.shareUrl();
    var original = btn.textContent;
    function done() {
      btn.textContent = 'コピーしました';
      setTimeout(function () { btn.textContent = original; }, 2000);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, function () { window.prompt('このリンクをコピーしてください', url); });
    } else {
      window.prompt('このリンクをコピーしてください', url);
    }
  };

  /* ------------------------------------------------------ drawing */

  Simulator.prototype.patternFor = function (id, item, scale) {
    scale = scale || 1;
    var base = item.color || '#2b3245';
    var pc = item.patternColor || autoPatternColor(base);
    var kind = item.pattern || 'solid';
    var size = { solid: 6, pinstripe: 9, chalkstripe: 14, check: 30, glen: 24, herringbone: 8, birdseye: 4 }[kind] || 6;
    size *= scale;
    var pat = svg('pattern', { id: id, patternUnits: 'userSpaceOnUse', width: size, height: size });

    if (item.image) {
      var imgSize = 60 * scale;
      pat.setAttribute('width', imgSize);
      pat.setAttribute('height', imgSize);
      pat.appendChild(svg('rect', { width: imgSize, height: imgSize, fill: base }));
      pat.appendChild(svg('image', { href: item.image, width: imgSize, height: imgSize, preserveAspectRatio: 'xMidYMid slice' }));
      return pat;
    }

    pat.appendChild(svg('rect', { width: size, height: size, fill: base }));
    function line(x1, y1, x2, y2, w, op, color) {
      pat.appendChild(svg('line', { x1: x1, y1: y1, x2: x2, y2: y2, stroke: color || pc, 'stroke-width': w * scale, 'stroke-opacity': op, 'stroke-linecap': 'square' }));
    }
    // twill texture on every fabric
    line(0, size, size, 0, 0.5, 0.08, luminance(base) < 0.45 ? '#ffffff' : '#000000');

    switch (kind) {
      case 'pinstripe':
        line(size / 2, 0, size / 2, size, 0.45, 0.85);
        break;
      case 'chalkstripe':
        line(size / 2, 0, size / 2, size, 1.4, 0.45);
        break;
      case 'check':
        line(0, size / 2, size, size / 2, 0.6, 0.7);
        line(size / 2, 0, size / 2, size, 0.6, 0.7);
        break;
      case 'glen':
        for (var i = 0; i < 4; i++) {
          line((i + 0.5) * size / 8, 0, (i + 0.5) * size / 8, size / 2, 0.35, 0.55);
          line(size / 2, (i + 0.5) * size / 8 + size / 2, size, (i + 0.5) * size / 8 + size / 2, 0.35, 0.55);
        }
        line(0, size * 0.9, size, size * 0.9, 0.5, 0.75, mix(pc, '#b06a4a', 0.35));
        break;
      case 'herringbone':
        pat.appendChild(svg('path', {
          d: 'M0 0 L' + size / 2 + ' ' + size / 2 + ' L0 ' + size + ' M' + size / 2 + ' 0 L' + size + ' ' + size / 2 + ' L' + size / 2 + ' ' + size,
          fill: 'none', stroke: pc, 'stroke-width': 0.6 * scale, 'stroke-opacity': 0.45
        }));
        break;
      case 'birdseye':
        pat.appendChild(svg('circle', { cx: size / 2, cy: size / 2, r: 0.55 * scale, fill: pc, 'fill-opacity': 0.7 }));
        break;
      default:
        break;
    }
    return pat;
  };

  Simulator.prototype.swatchSvg = function (item, id) {
    var pid = this.uid + '-' + id.replace(/[^a-z0-9-]/gi, '');
    var s = svg('svg', { viewBox: '0 0 40 40', 'aria-hidden': 'true' });
    s.appendChild(svg('defs', null, [this.patternFor(pid, item, 0.8)]));
    s.appendChild(svg('rect', { width: 40, height: 40, fill: 'url(#' + pid + ')' }));
    return s;
  };

  function lapelPoints(top, bottom, side, width, kind) {
    var dx = bottom[0] - top[0];
    var dy = bottom[1] - top[1];
    var len = Math.sqrt(dx * dx + dy * dy);
    var ux = dx / len;
    var uy = dy / len;
    var nx = -uy;
    var ny = ux;
    if ((side === 'left' && nx > 0) || (side === 'right' && nx < 0)) { nx = -nx; ny = -ny; }
    var W = width * 2.5;
    function P(s, o) { return [top[0] + dx * s + nx * W * o, top[1] + dy * s + ny * W * o]; }
    var shapes = {
      notch: [P(1, 0), P(0.64, 0.72), P(0.4, 1), P(0.24, 1.08), P(0.235, 0.6), P(0.17, 0.92), P(0.03, 0.58), P(0, 0)],
      peak: [P(1, 0), P(0.62, 0.74), P(0.38, 1.04), P(0.16, 1.42), P(0.23, 0.66), P(0.19, 0.6), P(0.03, 0.5), P(0, 0)],
      shawl: [P(1, 0), P(0.66, 0.66), P(0.42, 0.98), P(0.22, 0.95), P(0.08, 0.7), P(0, 0)]
    };
    return { points: shapes[kind] || shapes.notch, P: P };
  }

  function smoothPath(points) {
    var d = 'M' + points[0].join(' ');
    for (var i = 1; i < points.length - 1; i++) {
      var mid = [(points[i][0] + points[i + 1][0]) / 2, (points[i][1] + points[i + 1][1]) / 2];
      d += ' Q' + points[i].join(' ') + ' ' + mid.join(' ');
    }
    d += ' L' + points[points.length - 1].join(' ') + ' Z';
    return d;
  }

  function polyPath(points, curveFirst) {
    var d = 'M' + points[0].join(' ');
    if (curveFirst) {
      var a = points[0];
      var b = points[1];
      var ctrl = [(a[0] + b[0]) / 2 + (b[0] < a[0] ? -2 : 2), (a[1] + b[1]) / 2 + 4];
      d += ' Q' + ctrl.join(' ') + ' ' + b.join(' ');
      for (var i = 2; i < points.length; i++) d += ' L' + points[i].join(' ');
    } else {
      for (var j = 1; j < points.length; j++) d += ' L' + points[j].join(' ');
    }
    return d + ' Z';
  }

  // Mirror an absolute-command path horizontally around x = 150.
  function mirrorPath(d) {
    var out = [];
    var tokens = d.match(/[A-Za-z]|-?\d*\.?\d+/g) || [];
    var cmd = '';
    var argIndex = 0;
    tokens.forEach(function (t) {
      if (/[A-Za-z]/.test(t)) {
        cmd = t;
        argIndex = 0;
        out.push(t);
        return;
      }
      var n = parseFloat(t);
      var isX = cmd === 'H' || (cmd !== 'V' && argIndex % 2 === 0);
      out.push(String(isX ? 300 - n : n));
      argIndex++;
    });
    return out.join(' ');
  }

  /* ------------------------------------------------ photo mode */

  // 選択内容を、描画（suit-builder.js）の仕様に変換する
  Simulator.prototype.builderSpec = function () {
    var st = this.state;
    function key(item, fallback) { return item && item.key ? item.key : fallback; }
    var button = this.find('button', st.button);
    return {
      closure: key(this.find('style', st.style), 'sb2'),
      lapel: key(this.find('lapel', st.lapel), 'notch'),
      vest: !!st.threePiece,
      open: !!st.open,
      pocket: key(this.find('pocket', st.pocket), 'flap'),
      vent: key(this.find('vent', st.vent), 'side'),
      cuff: key(this.find('hem', st.hem), 'single') === 'double',
      buttonColor: button && button.color ? button.color : '#2c2019',
      shoeColor: this.shoeColor()
    };
  };

  // 組み合わせられない仕様は、いま選んだ方を優先して相手を合わせる
  // （ダブルはピークラペル、ショールカラーはシングル1ボタン）
  Simulator.prototype.resolveConflicts = function (group) {
    var self = this;
    function keyOf(g) { var i = self.find(g, self.state[g]); return i ? i.key : null; }
    function pick(g, key) {
      var hit = (self.groups[g] || []).filter(function (i) { return i.key === key; })[0];
      if (hit) self.state[g] = hit.id;
    }
    var style = keyOf('style') || '', lapel = keyOf('lapel');
    if (group === 'style') {
      if (/^db/.test(style)) pick('lapel', 'peak');
      else if (lapel === 'shawl' && style !== 'sb1') pick('lapel', 'notch');
    } else if (group === 'lapel') {
      if (lapel === 'shawl') pick('style', 'sb1');
      else if (/^db/.test(style) && lapel !== 'peak') pick('style', 'sb2');
    } else {
      return;
    }
    this.renderStep();
  };

  Simulator.prototype.shoeColor = function () {
    if (this.state.shoes === 'custom' && this.state.shoeColor) return this.state.shoeColor;
    var shoe = this.find('shoes', this.state.shoes);
    return shoe ? shoe.color : '#1a1a1a';
  };

  // 描画に渡す生地・シャツ・ネクタイ・ベストのタイル
  Simulator.prototype.textures = function () {
    var fabric = this.find('fabric', this.state.fabric) || { id: 'x', color: '#2b3245', pattern: 'solid' };
    var vest = this.state.vestFabric ? (this.find('fabric', this.state.vestFabric) || this.vestExtra(this.state.vestFabric)) : null;
    return {
      suit: this.textureFor('suit', fabric),
      vest: vest ? this.textureFor('suit', vest) : null,
      shirt: this.textureFor('shirt', this.find('shirt', this.state.shirt)),
      tie: this.textureFor('tie', this.find('tie', this.state.tie))
    };
  };

  // 仕立ての決まり（ダブル→ピーク、ショール→1ボタン等）で変わった選択を、画面の選択にも反映する
  Simulator.prototype.applyNormalized = function (spec) {
    var self = this;
    var changed = false;
    [['style', spec.closure], ['lapel', spec.lapel]].forEach(function (pair) {
      var cur = self.find(pair[0], self.state[pair[0]]);
      if (cur && cur.key === pair[1]) return;
      var hit = (self.groups[pair[0]] || []).filter(function (i) { return i.key === pair[1]; })[0];
      if (hit) { self.state[pair[0]] = hit.id; changed = true; }
    });
    if (this.state.open && !spec.open) { this.state.open = false; changed = true; }
    if (changed) {
      storageSet(this.config.storageKey, this.state);
      this.renderStep();
    }
  };

  // 生地・シャツ・ネクタイのタイル。写真由来のものは非同期に作ってキャッシュする
  Simulator.prototype.textureFor = function (part, item) {
    var P = window.RoTailorPhoto;
    var self = this;
    this.texCache = this.texCache || {};
    if (part !== 'suit' && this.uploads[part] && this.uploads[part].active) return this.uploads[part].tex;
    if (!item) return null;
    if (!item.image) return P.patternTexture(item, part);
    var key = part + ':' + item.id;
    var hit = this.texCache[key];
    if (hit && hit.tex) return hit.tex;
    if (!hit) {
      this.texCache[key] = hit = {};
      var opts = part === 'tie' ? { crop: item.imageCrop || 0.5, tile: 28, auto: !!item.isProduct } : { crop: item.imageCrop || 0.6, tile: 56 };
      P.imageTexture(item.image, opts).then(function (tex) {
        hit.tex = tex;
        self.renderPreview();
      }).catch(function () {
        hit.tex = P.patternTexture({ color: item.color || '#555555' }, part);
        self.renderPreview();
      });
    }
    return P.patternTexture({ color: item.color || '#777777' }, part); // 読み込み中は無地で
  };

  Simulator.prototype.renderPhoto = function () {
    var self = this;
    var P = window.RoTailorPhoto;
    var B = window.RoTailorBuilder;
    var back = this.view === 'back';
    var spec = B.normalize(this.builderSpec());
    this.applyNormalized(spec);
    var key = back ? 'back' : 'front';
    var urls = this.config.photos[key];
    var preview = this.$.preview;
    preview.classList.add('is-photo');
    var canvas = preview.querySelector('canvas.sim-photo');
    if (!canvas) {
      preview.innerHTML = '';
      canvas = el('canvas', { class: 'sim-photo', role: 'img' });
      preview.appendChild(canvas);
    }
    var fabric = this.find('fabric', this.state.fabric) || { id: 'x', color: '#2b3245', pattern: 'solid' };
    canvas.setAttribute('aria-label', [fabric.name, this.state.threePiece ? 'スリーピース' : null].filter(Boolean).join('、') + 'のスーツを着たマネキン');
    var token = this.photoToken = (this.photoToken || 0) + 1;
    preview.classList.add('is-loading');
    var textures = this.textures();
    P.loadBase(key, urls).then(function (base) {
      if (token !== self.photoToken) return;
      // 土台の写真に、仕様どおりの前身頃・ポケット・ベントを描き重ねる
      if (back) B.renderBack(canvas, base, spec, textures);
      else B.render(canvas, base, spec, textures);
      preview.classList.remove('is-loading');
      self.renderSummary();
    }).catch(function (e) {
      if (window.console) console.error('[suit-photo]', e);
      self.config.photos = null; // 読み込めない場合はイラスト表示に切り替える
      preview.classList.remove('is-loading');
      self.renderPreview();
    });

    var dbl = back; // 後ろ姿ではボタンの開け閉めは見えない
    this.root.querySelectorAll('[data-open]').forEach(function (b) {
      var isOpen = b.getAttribute('data-open') === '1';
      var on = isOpen === (!dbl && self.state.open);
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (isOpen) {
        b.disabled = dbl;
        b.title = back ? '正面でお試しください' : '';
      }
    });
    if (this.$.caption) {
      this.$.caption.textContent = [fabric.name, fabric.mill, fabric.composition].filter(Boolean).join(' ／ ');
    }
  };

  /* ------------------------------------------------ cover（仕上がりの表紙） */

  var COVER_THEME_LABELS = [['gold', 'ゴールド'], ['ivory', 'アイボリー'], ['night', 'ナイト']];

  function hsl(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return [0, 0, 0.3];
    var v = parseInt(m[1], 16);
    var r = ((v >> 16) & 255) / 255, g = ((v >> 8) & 255) / 255, b = (v & 255) / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, h = 0, s = 0;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }

  // 生地の色から、表紙の英字タイトルと日本語のキャッチを決める（AI テイラーの名前があればそちらを優先）
  Simulator.prototype.coverStory = function () {
    var st = this.state;
    var fabric = this.find('fabric', st.fabric) || { name: '', color: '#2b3245' };
    var style = this.find('style', st.style) || { key: 'sb2' };
    var tie = this.find('tie', st.tie);
    var cut = st.threePiece ? 'スリーピース' : (/^db/.test(style.key) ? 'ダブル' : 'スーツ');
    var name = fabric.name.split(' ')[0];
    var c = hsl(fabric.color), h = c[0], s = c[1], l = c[2];
    var story;
    if (l < 0.1) story = ['Black Tie Noir', '漆黒の' + cut + 'で、\n夜の主役に。'];
    else if (h >= 195 && h <= 260 && s > 0.15) story = ['Midnight Executive', '夜を纏う、\n' + name + 'の' + cut + '。'];
    else if (s <= 0.15 && l < 0.35) story = ['City Night', name + 'に、\n' + (tie ? tie.name.split(' ')[0].split('（')[0] : 'ネクタイ') + 'を合わせて。'];
    else if (s <= 0.15) story = ['Silver Gentleman', '光をまとう、\n' + name + 'の' + cut + '。'];
    else if (h >= 10 && h <= 50 && l < 0.45) story = ['Classic Heritage', name + 'の' + cut + 'で、\n一生に一度の主役に。'];
    else if (h >= 25 && h <= 60) story = ['Riviera Summer', '風を仕立てる、\n' + name + 'の' + cut + '。'];
    else story = ['Signature Order', 'あなただけの、\n' + name + 'の' + cut + '。'];
    if (st.look && st.look.title) story[1] = st.look.title;
    return { en: story[0], title: story[1] };
  };

  Simulator.prototype.coverSpecs = function () {
    var st = this.state;
    var fabric = this.find('fabric', st.fabric);
    var style = this.find('style', st.style);
    var lapel = this.find('lapel', st.lapel);
    var shirt = this.find('shirt', st.shirt);
    var tie = this.find('tie', st.tie);
    var up = this.uploads;
    var shirtName = up.shirt && up.shirt.active ? 'お持ちのシャツ' : (shirt ? shirt.name : '');
    var tieName = '';
    if (up.tie && up.tie.active) tieName = 'お持ちのネクタイ';
    else if (tie && tie.isProduct) tieName = tie.name.split(' ')[0] + ((tie.name.match(/（[^）]+）/) || [''])[0]); // 例：CERRUTI（ブルー）
    else if (tie) tieName = tie.name;
    var cut = { sb1: 'シングル1B', sb2: 'シングル2B', sb3: 'シングル3B', db6: 'ダブル6B', db4: 'ダブル4B' }[style && style.key] || (style && style.name);
    var lap = { notch: 'ノッチ', peak: 'ピーク', shawl: 'ショール' }[lapel && lapel.key] || '';
    var vestCloth = st.vestFabric ? (this.find('fabric', st.vestFabric) || this.vestExtra(st.vestFabric)) : null;
    return [
      ['FABRIC', fabric ? fabric.name : ''],
      ['STYLE', [cut, lap, st.threePiece ? (vestCloth ? 'ベスト（' + vestCloth.name + '）' : 'ベスト付き') : null].filter(Boolean).join('・')],
      ['V-ZONE', [shirtName, tieName].filter(Boolean).join(' × ')],
      ['SHOES', st.shoes === 'custom' ? 'お持ちの靴の色' : ((this.find('shoes', st.shoes) || { name: 'ブラック' }).name)]
    ];
  };

  Simulator.prototype.buildCoverUi = function () {
    var self = this;
    var box = this.$.summaryPreview;
    box.innerHTML = '';
    box.removeAttribute('aria-hidden');
    box.classList.add('sim-cover');
    if (box.parentNode) box.parentNode.classList.add('has-cover');
    this.coverTheme = this.coverTheme || 'gold';
    var canvas = el('canvas', { class: 'sim-cover__canvas', role: 'img', 'aria-label': '仕上がりのイメージ' });
    var themes = el('div', { class: 'sim-cover__themes', role: 'group', 'aria-label': '背景' });
    COVER_THEME_LABELS.forEach(function (pair) {
      var b = el('button', { type: 'button', class: 'sim-chip' + (self.coverTheme === pair[0] ? ' is-active' : ''), 'aria-pressed': self.coverTheme === pair[0] ? 'true' : 'false', text: pair[1] });
      b.addEventListener('click', function () {
        self.coverTheme = pair[0];
        themes.querySelectorAll('.sim-chip').forEach(function (x) {
          var on = x === b;
          x.classList.toggle('is-active', on);
          x.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        self.renderCover();
      });
      themes.appendChild(b);
    });
    var save = el('button', { type: 'button', class: 'button button--accent', text: '画像を保存' });
    var share = el('button', { type: 'button', class: 'button button--ghost', text: 'シェアする' });
    save.addEventListener('click', function () { self.saveCover(); });
    share.addEventListener('click', function () { self.shareCover(); });
    // テイラーが仕立てた場合は、そのひとことを表紙の上に添える
    var note = el('div', { class: 'sim-cover__note', hidden: true });
    var adjust = el('button', { type: 'button', class: 'button button--ghost sim-cover__adjust', text: '細部を自分で調整する' });
    adjust.addEventListener('click', function () {
      self.goStep(0);
      var stage = self.root.querySelector('.simulator__layout');
      if (stage) stage.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    box.appendChild(note);
    box.appendChild(canvas);
    box.appendChild(themes);
    box.appendChild(el('div', { class: 'sim-cover__actions' }, [save, share]));
    box.appendChild(adjust);
    this.$.coverNote = note;
    this.$.cover = canvas;
  };

  Simulator.prototype.renderCover = function () {
    var self = this;
    var P = window.RoTailorPhoto;
    if (!this.$.cover) this.buildCoverUi();
    var spec = window.RoTailorBuilder.normalize(this.builderSpec());
    var look = this.state.look;
    if (this.$.coverNote) {
      this.$.coverNote.hidden = !look;
      this.$.coverNote.innerHTML = '';
      if (look) {
        this.$.coverNote.appendChild(el('p', { class: 'sim-cover__note-eyebrow', text: 'FROM YOUR TAILOR' }));
        this.$.coverNote.appendChild(el('p', { class: 'sim-cover__note-text', text: look.comment }));
      }
    }
    var textures = this.textures();
    var token = this.coverToken = (this.coverToken || 0) + 1;
    if (!this.logoImg && this.config.logo) {
      this.logoImg = new Image();
      this.logoImg.src = this.config.logo;
    }
    var logoReady = this.logoImg && !this.logoImg.complete ? new Promise(function (r) { self.logoImg.onload = r; self.logoImg.onerror = r; }) : Promise.resolve();
    var fonts = document.fonts && document.fonts.load ? Promise.all([
      document.fonts.load('700 66px "Shippori Mincho"', '仕立'),
      document.fonts.load('500 26px "Shippori Mincho"', '仕立'),
      document.fonts.load('italic 400 82px "EB Garamond"'),
      document.fonts.load('500 44px "EB Garamond"')
    ]).catch(function () {}) : Promise.resolve();
    Promise.all([P.loadBase('front', this.config.photos.front), fonts, logoReady]).then(function (res) {
      if (token !== self.coverToken) return;
      var base = res[0];
      var composed = document.createElement('canvas');
      window.RoTailorBuilder.render(composed, base, spec, textures);
      var story = self.coverStory();
      self.coverNo = self.coverNo || ('00' + (Math.floor(Math.random() * 900) + 100)).slice(-3);
      P.drawCover(self.$.cover, {
        base: base,
        composed: composed,
        theme: self.coverTheme,
        eyebrow: 'Your Order Suit — No.' + self.coverNo,
        title: story.title,
        en: story.en,
        specs: self.coverSpecs(),
        logo: self.logoImg
      });
    });
  };

  Simulator.prototype.coverBlob = function () {
    var canvas = this.$.cover;
    return new Promise(function (resolve, reject) {
      try {
        canvas.toBlob(function (b) { if (b) resolve(b); else reject(new Error('blob')); }, 'image/jpeg', 0.92);
      } catch (e) { reject(e); }
    });
  };

  Simulator.prototype.saveCover = function () {
    this.coverBlob().then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = el('a', { href: url, download: 'ROtailor-my-suit.jpg' });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }).catch(function () {
      window.alert('画像を書き出せませんでした。画面を長押しして保存してください。');
    });
  };

  Simulator.prototype.shareCover = function () {
    var self = this;
    var text = 'ROtailor でオーダースーツを仕立ててみました。';
    var url = this.shareUrl();
    this.coverBlob().then(function (blob) {
      var file = new File([blob], 'ROtailor-my-suit.jpg', { type: 'image/jpeg' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        return navigator.share({ files: [file], text: text + ' ' + url });
      }
      if (navigator.share) return navigator.share({ title: 'ROtailor', text: text, url: url });
      window.open('https://line.me/R/msg/text/?' + encodeURIComponent(text + '\n' + url), '_blank', 'noopener');
    }).catch(function (e) {
      if (e && e.name === 'AbortError') return;
      self.saveCover();
    });
  };

  // 写真に出ない仕様は、店頭でのお楽しみとして案内する
  Simulator.prototype.renderInStore = function () {
    var list = el('ul', { class: 'sim-instore__list' });
    this.inStore.forEach(function (g) {
      list.appendChild(el('li', null, [el('b', { text: g.label }), el('span', { text: g.names.join('／') })]));
    });
    return el('div', { class: 'sim-instore' }, [
      el('p', { class: 'sim-instore__eyebrow', text: 'AT THE SALON' }),
      el('p', { class: 'sim-instore__title', text: 'このほかに、店頭で実物を見ながら選べるもの' }),
      list
    ]);
  };

  // シャツ・ネクタイを「お持ちの写真から」作る
  Simulator.prototype.renderUpload = function (part) {
    var self = this;
    var up = this.uploads[part];
    var input = el('input', { type: 'file', accept: 'image/*', hidden: true });
    var label = el('label', { class: 'sim-option sim-upload' + (up && up.active ? ' is-selected' : ''), 'data-upload': part }, [
      input,
      el('span', { class: 'sim-option__dot sim-upload__thumb' }, up ? [el('img', { src: up.thumb, alt: '' })] : [el('span', { text: '+' })]),
      el('span', { class: 'sim-option__body' }, [
        el('span', { class: 'sim-option__name', text: part === 'shirt' ? 'お持ちのシャツの写真から' : 'お持ちのネクタイの写真から' }),
        el('span', { class: 'sim-option__desc', text: '生地が大きく写った写真がおすすめです' })
      ])
    ]);
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      if (!f) return;
      loadImage(f, 640).then(function (res) {
        return window.RoTailorPhoto.imageTexture(res.canvas, part === 'tie' ? { crop: 0.14, tile: 28, auto: true } : { crop: 0.3, tile: 56, auto: true }).then(function (tex) {
          self.uploads[part] = { active: true, tex: tex, thumb: res.url };
          self.renderStep();
          self.update();
        });
      }).catch(function () {
        window.alert('画像を読み込めませんでした。JPEG または PNG の写真をお試しください。');
      });
      input.value = '';
    });
    if (up && !up.active) {
      label.addEventListener('click', function (e) {
        if (e.target === input) return;
        e.preventDefault();
        up.active = true;
        self.renderStep();
        self.update();
      });
    }
    return el('div', { class: 'sim-options sim-options--swatch sim-upload-row' }, [label]);
  };

  Simulator.prototype.renderPreview = function () {
    if (this.config.photos) {
      this.renderPhoto();
      return;
    }
    this.photoToken = (this.photoToken || 0) + 1;
    var stale = this.$.preview.querySelector('canvas.sim-photo');
    if (stale) stale.remove();
    this.$.preview.classList.remove('is-photo', 'is-loading');
    var st = this.state;
    var fabric = this.find('fabric', st.fabric) || { color: '#2b3245', pattern: 'solid' };
    var style = this.find('style', st.style) || { key: 'sb2' };
    var lapel = this.find('lapel', st.lapel) || { key: 'notch', width: 8.5 };
    var pocket = this.find('pocket', st.pocket) || { key: 'flap' };
    var vent = this.find('vent', st.vent) || { key: 'side' };
    var button = this.find('button', st.button) || { color: '#3a2a20' };
    var lining = this.find('lining', st.lining);
    var pleat = this.find('pleat', st.pleat) || { key: 'none' };
    var hem = this.find('hem', st.hem) || { key: 'single' };
    var tie = this.find('tie', st.tie);
    var geo = STYLE_GEOMETRY[style.key] || STYLE_GEOMETRY.sb2;
    var photo = this.photo;

    var u = this.uid;
    var fab = 'url(#' + u + '-fab)';
    var seam = { fill: 'none', stroke: 'rgba(0,0,0,0.38)', 'stroke-width': 0.9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    var soft = { fill: 'none', stroke: 'rgba(0,0,0,0.16)', 'stroke-width': 0.9, 'stroke-linecap': 'round' };
    var hi = { fill: 'none', stroke: 'rgba(255,255,255,0.13)', 'stroke-width': 0.9 };
    var fabricDark = mix(fabric.color || '#2b3245', '#000000', 0.25);
    var btnColor = button.color || '#3a2a20';
    var shirt = (tie && tie.shirtColor) || '#fbfbf8';
    var skin = '#e3d3c0';

    var root = svg('svg', { viewBox: '0 0 300 640', class: 'sim-svg', role: 'img', 'aria-label': 'スーツのプレビュー：' + (fabric.name || '') });
    var defs = svg('defs');
    defs.appendChild(this.patternFor(u + '-fab', fabric, 1));
    if (tie) defs.appendChild(this.patternFor(u + '-tie', tie, 0.7));
    if (lining) defs.appendChild(this.patternFor(u + '-lin', lining, 1));
    defs.appendChild(svg('linearGradient', { id: u + '-shade', x1: '0', y1: '0', x2: '1', y2: '0' }, [
      svg('stop', { offset: '0', 'stop-color': '#000', 'stop-opacity': '0.32' }),
      svg('stop', { offset: '0.2', 'stop-color': '#000', 'stop-opacity': '0' }),
      svg('stop', { offset: '0.5', 'stop-color': '#fff', 'stop-opacity': '0.07' }),
      svg('stop', { offset: '0.8', 'stop-color': '#000', 'stop-opacity': '0' }),
      svg('stop', { offset: '1', 'stop-color': '#000', 'stop-opacity': '0.32' })
    ]));
    defs.appendChild(svg('linearGradient', { id: u + '-vshade', x1: '0', y1: '0', x2: '0', y2: '1' }, [
      svg('stop', { offset: '0', 'stop-color': '#000', 'stop-opacity': '0.12' }),
      svg('stop', { offset: '0.15', 'stop-color': '#fff', 'stop-opacity': '0.04' }),
      svg('stop', { offset: '1', 'stop-color': '#000', 'stop-opacity': '0.22' })
    ]));
    defs.appendChild(svg('radialGradient', { id: u + '-floor', cx: '0.5', cy: '0.5', r: '0.5' }, [
      svg('stop', { offset: '0', 'stop-color': '#000', 'stop-opacity': '0.2' }),
      svg('stop', { offset: '1', 'stop-color': '#000', 'stop-opacity': '0' })
    ]));
    defs.appendChild(svg('radialGradient', { id: u + '-head', cx: '0.42', cy: '0.38', r: '0.7' }, [
      svg('stop', { offset: '0', 'stop-color': '#efe4d6' }),
      svg('stop', { offset: '1', 'stop-color': '#cdbba6' })
    ]));
    var HEAD = { cx: 150, cy: 50, rx: 23, ry: 30 };
    var clip = svg('clipPath', { id: u + '-face' }, [
      svg('ellipse', { cx: HEAD.cx, cy: HEAD.cy, rx: HEAD.rx, ry: HEAD.ry }),
      svg('path', { d: 'M139 66 L161 66 L162 104 L138 104 Z' })
    ]);
    defs.appendChild(clip);
    root.appendChild(defs);

    function add(tag, attrs) { var n = svg(tag, attrs); root.appendChild(n); return n; }
    function shaded(d, gradient) {
      add('path', { d: d, fill: fab });
      add('path', { d: d, fill: 'url(#' + u + '-' + (gradient || 'shade') + ')' });
      add('path', Object.assign({ d: d }, seam));
    }

    var front = this.view === 'front';

    add('ellipse', { cx: 150, cy: 626, rx: 84, ry: 7, fill: 'url(#' + u + '-floor)' });

    // head + neck（写真があれば顔写真をはめ込む）
    if (photo && photo.url) {
      var size = 120 * photo.zoom;
      var g = svg('g', { 'clip-path': 'url(#' + u + '-face)', 'data-photo-head': '' });
      g.appendChild(svg('rect', { x: 120, y: 14, width: 60, height: 92, fill: skin }));
      g.appendChild(svg('image', {
        href: photo.url,
        x: HEAD.cx - size / 2 + photo.x,
        y: HEAD.cy - size / 2 + photo.y,
        width: size,
        height: size,
        preserveAspectRatio: 'xMidYMid slice'
      }));
      root.appendChild(g);
      add('ellipse', { cx: HEAD.cx, cy: HEAD.cy, rx: HEAD.rx, ry: HEAD.ry, fill: 'none', stroke: 'rgba(0,0,0,0.12)', 'stroke-width': 0.8 });
    } else {
      add('path', { d: 'M140 66 L160 66 L161 104 L139 104 Z', fill: '#d7c6b1' });
      add('ellipse', { cx: HEAD.cx, cy: HEAD.cy, rx: HEAD.rx, ry: HEAD.ry, fill: 'url(#' + u + '-head)' });
      add('path', { d: 'M127 46 Q128 18 150 19 Q172 18 173 46 Q168 30 150 30 Q132 30 127 46 Z', fill: 'rgba(60,45,35,0.55)' });
    }

    // trousers
    var legL = 'M94 340 L150 340 L150 382 L146 606 L106 606 Z';
    var legR = mirrorPath(legL);
    shaded(legL, 'vshade');
    shaded(legR, 'vshade');
    add('path', Object.assign({ d: 'M122 372 L126 602' }, hi));
    add('path', Object.assign({ d: mirrorPath('M122 372 L126 602') }, hi));
    if (front) {
      add('path', Object.assign({ d: 'M150 360 Q151 384 145 394' }, seam));
      if (pleat.key === 'one' || pleat.key === 'two') {
        add('path', Object.assign({ d: 'M132 362 L133 392' }, seam));
        add('path', Object.assign({ d: mirrorPath('M132 362 L133 392') }, seam));
      }
      if (pleat.key === 'two') {
        add('path', Object.assign({ d: 'M141 362 L141.5 382' }, seam));
        add('path', Object.assign({ d: mirrorPath('M141 362 L141.5 382') }, seam));
      }
    } else {
      add('path', Object.assign({ d: 'M150 360 V392' }, seam));
    }
    if (hem.key === 'double') {
      add('path', Object.assign({ d: 'M106.4 594 L146.4 594' }, seam));
      add('path', Object.assign({ d: mirrorPath('M106.4 594 L146.4 594') }, seam));
    }
    // shoes
    var shoe = front ? 'M106 604 Q97 621 112 623 L142 623 Q150 622 147 604 Z' : 'M105 604 Q104 618 112 620 L142 620 Q148 619 147 604 Z';
    add('path', { d: shoe, fill: '#2e211a' });
    add('path', { d: mirrorPath(shoe), fill: '#2e211a' });
    add('path', { d: front ? 'M110 616 Q120 612 132 614' : 'M110 615 Q125 612 140 614', fill: 'none', stroke: 'rgba(255,255,255,0.18)', 'stroke-width': 1.2, 'stroke-linecap': 'round' });

    if (front) {
      // shirt + collar
      add('path', { d: 'M134 92 Q150 98 166 92 L172 110 L172 330 L128 330 L128 110 Z', fill: shirt });
      add('path', { d: 'M134 92 L150 112 L139 125 Z M166 92 L150 112 L161 125 Z', fill: shirt, stroke: 'rgba(0,0,0,0.18)', 'stroke-width': 0.8 });
      if (tie) {
        add('path', { d: 'M145 111 L155 111 L153.6 122 L146.4 122 Z', fill: 'url(#' + u + '-tie)', stroke: 'rgba(0,0,0,0.25)', 'stroke-width': 0.6 });
        add('path', { d: 'M146.4 122 L153.6 122 L160 236 L150 250 L140 236 Z', fill: 'url(#' + u + '-tie)', stroke: 'rgba(0,0,0,0.25)', 'stroke-width': 0.6 });
        add('path', { d: 'M146.4 122 L153.6 122 L150 129 Z', fill: 'rgba(0,0,0,0.18)' });
      }
      if (st.threePiece) {
        var vd = 'M134 94 Q150 100 166 94 L174 108 L174 330 L126 330 L126 108 Z M137 95 L150 196 L163 95 Z';
        add('path', { d: vd, fill: fab, 'fill-rule': 'evenodd' });
        add('path', { d: vd, fill: 'url(#' + u + '-shade)', 'fill-rule': 'evenodd' });
        add('path', Object.assign({ d: 'M137 96 L150 196 L163 96' }, seam));
        [206, 220, 234].forEach(function (y) { add('circle', { cx: 150, cy: y, r: 2.3, fill: btnColor }); });
      }
    }

    // sleeves
    var sleeveL = 'M86 110 C70 114 63 136 62 172 L58 344 L86 348 L97 182 Z';
    shaded(sleeveL, 'vshade');
    shaded(mirrorPath(sleeveL), 'vshade');
    add('path', Object.assign({ d: 'M59 334 L86 337' }, soft));
    add('path', Object.assign({ d: mirrorPath('M59 334 L86 337') }, soft));
    [[63, 327], [67.5, 328], [72, 329], [76.5, 330]].forEach(function (c) {
      add('circle', { cx: c[0], cy: c[1], r: 1.6, fill: btnColor });
      add('circle', { cx: 300 - c[0], cy: c[1], r: 1.6, fill: btnColor });
    });
    // hands
    add('path', { d: 'M61 348 Q58 366 66 372 Q76 374 82 364 L84 349 Z', fill: skin });
    add('path', { d: mirrorPath('M61 348 Q58 366 66 372 Q76 374 82 364 L84 349 Z'), fill: skin });

    var sideL = 'M86 112 C86 150 93 205 104 252 C97 292 92 330 90 357';
    var sideR = 'M210 357 C208 330 203 292 196 252 C207 205 214 150 214 112';

    if (front) {
      var vY = geo.vY;
      var cx = geo.cx;
      var body;
      if (geo.double) {
        body = 'M132 97 L112 103 ' + sideL.replace('M86 112', 'L86 112') + ' Q150 372 210 357 ' + sideR.replace('M210 357', 'L210 357') + ' L188 103 L168 97 L' + cx + ' ' + vY + ' Z';
      } else {
        body = 'M132 97 L112 103 ' + sideL.replace('M86 112', 'L86 112') + ' Q112 363 134 367 Q147 360 150 340 Q153 360 166 367 Q188 363 210 357 ' + sideR.replace('M210 357', 'L210 357') + ' L188 103 L168 97 L150 ' + vY + ' Z';
      }
      shaded(body);
      if (geo.double) add('path', Object.assign({ d: 'M' + cx + ' ' + vY + ' L' + cx + ' 366' }, seam));
      else add('path', Object.assign({ d: 'M150 ' + vY + ' L150 340' }, seam));
      // darts / waist suppression
      add('path', Object.assign({ d: 'M118 190 Q115 245 117 290' }, soft));
      add('path', Object.assign({ d: mirrorPath('M118 190 Q115 245 117 290') }, soft));

      // lapels
      var width = lapel.width || 8.5;
      var kind = lapel.key || 'notch';
      var left = lapelPoints([134, 96], [cx, vY], 'left', width, kind);
      var right = lapelPoints([166, 96], [cx, vY], 'right', width, kind);
      [left, right].forEach(function (lp) {
        var d = kind === 'shawl' ? smoothPath(lp.points) : polyPath(lp.points, true);
        add('path', { d: d, fill: fab });
        add('path', { d: d, fill: 'rgba(255,255,255,0.05)' });
        add('path', Object.assign({ d: d }, seam));
      });
      var bh = right.P(0.3, 0.55);
      add('path', Object.assign({ d: 'M' + (bh[0] - 3) + ' ' + (bh[1] - 1) + ' L' + (bh[0] + 3) + ' ' + (bh[1] + 1) }, seam, { 'stroke-width': 1.2 }));
      if (geo.rollHole) {
        var rh = left.P(0.86, 0.38);
        add('path', Object.assign({ d: 'M' + (rh[0] - 3) + ' ' + rh[1] + ' L' + (rh[0] + 3) + ' ' + rh[1] }, seam, { 'stroke-width': 1.2 }));
      }

      // pockets
      var pk = pocket.key || 'flap';
      if (pk === 'patch') {
        var patch = 'M96 290 H140 V334 Q140 340 134 340 H102 Q96 340 96 334 Z';
        add('path', Object.assign({ d: patch }, seam));
        add('path', Object.assign({ d: mirrorPath(patch) }, seam));
        add('path', Object.assign({ d: 'M178 158 L202 155 L204 182 Q204 185 201 185 L182 187 Q179 187 179 184 Z' }, seam));
      } else {
        add('path', Object.assign({ d: 'M178 168 L203 164 L203.6 169 L178.6 173 Z' }, seam));
        if (pk === 'jetted') {
          add('path', Object.assign({ d: 'M100 302 H140 M100 305 H140' }, seam));
          add('path', Object.assign({ d: mirrorPath('M100 302 H140 M100 305 H140') }, seam));
        } else if (pk === 'slant') {
          var slant = 'M98 308 L138 300 L140 312 L100 320 Z';
          add('path', { d: slant, fill: 'rgba(0,0,0,0.05)' });
          add('path', Object.assign({ d: slant }, seam));
          add('path', Object.assign({ d: mirrorPath(slant) }, seam));
        } else {
          var flap = 'M98 300 H140 V313 Q140 315 138 315 H100 Q98 315 98 313 Z';
          add('path', { d: flap, fill: 'rgba(0,0,0,0.05)' });
          add('path', Object.assign({ d: flap }, seam));
          add('path', Object.assign({ d: mirrorPath(flap) }, seam));
          if (pk === 'flap_ticket') add('path', Object.assign({ d: 'M102 280 H134 V289 Q134 291 132 291 H104 Q102 291 102 289 Z' }, seam));
        }
      }

      geo.buttons.forEach(function (b) {
        add('circle', { cx: b[0], cy: b[1], r: 4, fill: btnColor });
        add('circle', { cx: b[0], cy: b[1], r: 4, fill: 'none', stroke: 'rgba(0,0,0,0.35)', 'stroke-width': 0.6 });
        add('circle', { cx: b[0] - 1.1, cy: b[1] - 1.1, r: 1.1, fill: 'rgba(255,255,255,0.25)' });
      });
    } else {
      var back = 'M124 96 Q150 103 176 96 L188 103 L214 112 C214 150 207 205 196 252 C203 292 208 330 210 357 Q150 372 90 357 C92 330 97 292 104 252 C93 205 86 150 86 112 L112 103 Z';
      shaded(back);
      var collar = 'M124 96 Q150 103 176 96 L174 108 Q150 116 126 108 Z';
      add('path', { d: collar, fill: fab });
      add('path', { d: collar, fill: 'rgba(0,0,0,0.12)' });
      add('path', Object.assign({ d: collar }, seam));
      var ventTop = 308;
      add('path', Object.assign({ d: 'M150 114 L150 ' + (vent.key === 'center' ? ventTop : 366) }, seam));
      add('path', Object.assign({ d: 'M110 160 Q102 250 100 ' + (vent.key === 'side' ? ventTop : 359) }, seam));
      add('path', Object.assign({ d: mirrorPath('M110 160 Q102 250 100 ' + (vent.key === 'side' ? ventTop : 359)) }, seam));
      if (vent.key === 'center') {
        add('path', { d: 'M150 308 L155 314 L155 366 L150 366 Z', fill: fabricDark, 'fill-opacity': 0.7 });
        add('path', Object.assign({ d: 'M150 308 L155 314 L155 366' }, seam));
      } else if (vent.key === 'side') {
        var sv = 'M100 308 L105 314 L105 360 L100 359 Z';
        add('path', { d: sv, fill: fabricDark, 'fill-opacity': 0.7 });
        add('path', { d: mirrorPath(sv), fill: fabricDark, 'fill-opacity': 0.7 });
        add('path', Object.assign({ d: 'M100 308 L105 314 L105 360' }, seam));
        add('path', Object.assign({ d: mirrorPath('M100 308 L105 314 L105 360') }, seam));
      }
    }

    if (lining) {
      var lg = svg('g', { transform: 'translate(34 44)' });
      lg.appendChild(svg('circle', { r: 20, fill: 'url(#' + u + '-lin)', stroke: 'rgba(0,0,0,0.2)', 'stroke-width': 1 }));
      var label = svg('text', { y: 34, 'text-anchor': 'middle', 'font-size': 9, fill: 'currentColor', 'letter-spacing': '0.08em' });
      label.textContent = 'LINING';
      lg.appendChild(label);
      root.appendChild(lg);
    }

    this.$.preview.innerHTML = '';
    this.$.preview.appendChild(root);

    if (this.$.caption) {
      var parts = [fabric.name, fabric.mill, fabric.composition].filter(Boolean);
      this.$.caption.textContent = parts.join(' ／ ');
    }
  };

  /* ---------------------------------------------------------- boot */

  function init(scope) {
    (scope || document).querySelectorAll('[data-suit-simulator]').forEach(function (root) {
      if (root.__simulator) return;
      try {
        root.__simulator = new Simulator(root);
      } catch (e) {
        if (window.console) console.error('[suit-simulator]', e);
      }
    });
  }

  window.RoTailorSimulator = { init: init };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(); });
  else init();

  document.addEventListener('shopify:section:load', function (e) { init(e.target); });
})();
