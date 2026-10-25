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
    { id: 'detail', label: 'ディテール', groups: ['pocket', 'vent'] },
    { id: 'vzone', label: 'シャツ・タイ', groups: ['shirt', 'tie'] }
  ];
  // 写真が用意できている型（キー）。ここにないものは写真モードでは選択肢に出さない
  var PHOTO_KEYS = { style: ['sb2', 'db6'], lapel: ['notch', 'peak'], pocket: ['flap', 'patch'], vent: ['side', 'center', 'none'] };
  // 写真に出ないため、店頭でご案内する項目
  var IN_STORE_GROUPS = ['button', 'lining', 'pleat', 'hem', 'extra'];
  var VENT_PHOTO = { side: 'back-s', center: 'back-c', none: 'back-n' };

  var SINGLE_GROUPS = ['fabric', 'style', 'lapel', 'pocket', 'vent', 'button', 'lining', 'pleat', 'hem', 'shirt', 'tie'];

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
    if (this.config.photos && !window.RoTailorPhoto) this.config.photos = null;
    this.groups.shirt = this.config.photos ? SHIRTS.slice() : [];
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
    if (g === 'shirt') return !!this.config.photos;
    return (this.groups[g] || []).length > 0;
  };

  Simulator.prototype.find = function (group, id) {
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
    SINGLE_GROUPS.forEach(function (g) {
      if (raw[g] && self.find(g, raw[g])) state[g] = raw[g];
    });
    state.threePiece = !!raw.threePiece && this.hasGroup('threePiece');
    state.open = !!raw.open;
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
      look: root.querySelector('[data-look]')
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
    this.$.prev.disabled = this.stepIndex === 0;
    this.$.next.textContent = this.stepIndex >= this.steps.length - 1 ? '仕上がりを見る' : '次へ';
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
    var top = this.$.nav.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.6) {
      this.$.nav.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        body.appendChild(fs);
      }
    });
    if (this.inStore && this.inStore.length && this.stepIndex === this.steps.length - 1) {
      body.appendChild(this.renderInStore());
    }
  };

  Simulator.prototype.select = function (group, id) {
    this.state[group] = id;
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

  Simulator.prototype.renderFabricGroup = function () {
    var self = this;
    var fabrics = this.groups.fabric;
    var fieldset = el('fieldset', { class: 'sim-group' }, [el('legend', { class: 'sim-group__title', text: GROUP_LABELS.fabric })]);

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
    var grid = el('div', { class: 'sim-options' + (group === 'button' || group === 'lining' || group === 'tie' || group === 'shirt' ? ' sim-options--swatch' : '') });
    var uploaded = this.uploads[group] && this.uploads[group].active;
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
        grid.querySelectorAll('.sim-option').forEach(function (o) {
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
    return fieldset;
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
      rows.push({ label: 'ベスト', value: st.threePiece ? 'スリーピース（ベスト付き）' : 'なし' });
    }
    if (this.hasGroup('shirt')) {
      var shirt = this.find('shirt', st.shirt);
      var up = this.uploads.shirt && this.uploads.shirt.active;
      if (up || shirt) rows.push({ label: 'シャツ', value: up ? 'お持ちの写真から' : shirt.name });
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
    if (this.$.summaryPreview) {
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
    this.state.look = { title: look.title || '', comment: look.comment || '', salonNote: look.salonNote || '', text: text };
    this.renderStep();
    this.update();
    this.renderLook();
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

  // 選択内容から、使うマネキン写真のキー（例：sn-ov）を決める
  Simulator.prototype.photoKey = function () {
    var style = this.find('style', this.state.style) || { key: 'sb2' };
    var lapel = this.find('lapel', this.state.lapel) || { key: 'notch' };
    var dbl = /^db/.test(style.key || '');
    var cut = dbl ? 'dp' : (lapel.key === 'peak' ? 'sp' : 'sn');
    var open = !dbl && this.state.open;
    return cut + '-' + (open ? 'o' : 'c') + (this.state.threePiece ? 'v' : '');
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
    var vent = this.find('vent', this.state.vent) || { key: 'side' };
    var back = this.view === 'back';
    var key = back ? (VENT_PHOTO[vent.key] || 'back-s') : this.photoKey();
    var urls = this.config.photos[key] || this.config.photos[this.photoKey()];
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
    var textures = {
      suit: this.textureFor('suit', fabric),
      shirt: this.textureFor('shirt', this.find('shirt', this.state.shirt)),
      tie: this.textureFor('tie', this.find('tie', this.state.tie))
    };
    // ディテールの手順では、腰ポケットのアップを右下に重ねる
    var step = this.steps[this.stepIndex];
    var pocket = this.find('pocket', this.state.pocket);
    var insetKey = !back && step && step.id === 'detail' && pocket ? 'pocket-' + pocket.key : null;
    var inset = preview.querySelector('.sim-photo-inset');
    if (!insetKey || !this.config.photos[insetKey]) {
      if (inset) inset.remove();
    } else {
      if (!inset) {
        inset = el('canvas', { class: 'sim-photo-inset', role: 'img', 'aria-label': '腰ポケットのアップ' });
        preview.appendChild(inset);
      }
      P.loadBase(insetKey, this.config.photos[insetKey]).then(function (b) {
        if (token === self.photoToken) P.compose(b, textures, inset, 3);
      });
    }
    P.loadBase(key, urls).then(function (base) {
      if (token !== self.photoToken) return;
      P.compose(base, textures, canvas);
      preview.classList.remove('is-loading');
      self.renderSummary();
    }).catch(function (e) {
      if (window.console) console.error('[suit-photo]', e);
      self.config.photos = null; // 読み込めない場合はイラスト表示に切り替える
      preview.classList.remove('is-loading');
      self.renderPreview();
    });

    var dbl = back || key.indexOf('dp') === 0;
    this.root.querySelectorAll('[data-open]').forEach(function (b) {
      var isOpen = b.getAttribute('data-open') === '1';
      var on = isOpen === (!dbl && self.state.open);
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (isOpen) {
        b.disabled = dbl;
        b.title = back ? '正面でお試しください' : (dbl ? 'ダブルは留めた状態で表示します' : '');
      }
    });
    if (this.$.caption) {
      this.$.caption.textContent = [fabric.name, fabric.mill, fabric.composition].filter(Boolean).join(' ／ ');
    }
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
