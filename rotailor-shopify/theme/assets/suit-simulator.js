/*
 * RO Tailor — Made-to-Measure Suit Simulator
 * ------------------------------------------------------------
 * sections/suit-simulator.liquid が出力する JSON（ブロック設定）を読み込み、
 * 生地・ディテールの選択 UI、SVG プレビュー、仕上がりの確認、来店予約フォームまでを
 * 担当します。価格は表示しません（お見積もりはサロンでご案内する方針）。
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
    tie: 'Vゾーン（ネクタイ）'
  };

  var STEPS = [
    { id: 'fabric', label: '生地', groups: ['fabric'] },
    { id: 'style', label: '型', groups: ['style', 'lapel'] },
    { id: 'detail', label: 'ディテール', groups: ['pocket', 'vent', 'button', 'lining'] },
    { id: 'trousers', label: 'パンツ・ベスト', groups: ['pleat', 'hem', 'threePiece'] },
    { id: 'extra', label: 'オプション', groups: ['extra'] },
    { id: 'vzone', label: 'Vゾーン', groups: ['tie'] }
  ];

  var SINGLE_GROUPS = ['fabric', 'style', 'lapel', 'pocket', 'vent', 'button', 'lining', 'pleat', 'hem', 'tie'];

  var SEASON_LABELS = { all: 'オールシーズン', ss: '春夏', aw: '秋冬' };

  var STYLE_GEOMETRY = {
    sb1: { vY: 192, cx: 150, buttons: [[150, 206]], double: false },
    sb2: { vY: 168, cx: 150, buttons: [[150, 182], [150, 226]], double: false },
    sb3: { vY: 160, cx: 150, buttons: [[150, 176], [150, 220]], double: false, rollHole: true },
    db6: { vY: 168, cx: 128, buttons: [[130, 176], [170, 176], [136, 208], [164, 208], [136, 240], [164, 240]], double: true },
    db4: { vY: 186, cx: 128, buttons: [[136, 198], [164, 198], [136, 234], [164, 234]], double: true }
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
    this.steps = STEPS.filter(function (step) {
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
    return (this.groups[g] || []).length > 0;
  };

  Simulator.prototype.find = function (group, id) {
    var list = this.groups[group] || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  };

  Simulator.prototype.defaults = function () {
    var self = this;
    var state = { extras: {}, threePiece: false };
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
      btn.addEventListener('click', function () {
        self.view = btn.getAttribute('data-view');
        root.querySelectorAll('[data-view]').forEach(function (b) {
          var on = b === btn;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        self.renderPreview();
      });
    });

    this.$.prev.addEventListener('click', function () { self.goStep(self.stepIndex - 1); });
    this.$.next.addEventListener('click', function () {
      if (self.stepIndex >= self.steps.length - 1) self.openSummary();
      else self.goStep(self.stepIndex + 1);
    });
    root.querySelectorAll('[data-go-summary]').forEach(function (b) {
      b.addEventListener('click', function () { self.openSummary(); });
    });

    this.bindStylist();

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
      else body.appendChild(self.renderOptionGroup(g));
    });
  };

  Simulator.prototype.select = function (group, id) {
    this.state[group] = id;
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
    var grid = el('div', { class: 'sim-options' + (group === 'button' || group === 'lining' || group === 'tie' ? ' sim-options--swatch' : '') });
    list.forEach(function (item) {
      var checked = self.state[group] === item.id;
      var input = el('input', { type: 'radio', name: self.uid + '-' + group, value: item.id, class: 'visually-hidden', checked: checked });
      input.addEventListener('change', function () { self.select(group, item.id); });

      var visual = null;
      if (group === 'button') {
        visual = el('span', { class: 'sim-option__dot sim-option__dot--button', style: '--dot:' + (item.color || '#333') });
      } else if (group === 'lining' || group === 'tie') {
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
    if (tie) text.push('Vゾーン：' + tie.name);
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
    if (tie) spec.appendChild(el('div', { class: 'sim-spec__row' }, [el('dt', { text: 'Vゾーン' }), el('dd', { text: tie.name })]));
    if (this.state.look) {
      spec.insertBefore(el('div', { class: 'sim-spec__row sim-spec__row--look' }, [el('dt', { text: '一着の名前' }), el('dd', { text: this.state.look.title })]), spec.firstChild);
    }
    if (this.$.formSpec) this.$.formSpec.value = this.specText();
    if (this.$.summaryPreview) {
      this.$.summaryPreview.innerHTML = '';
      var clone = this.$.preview.querySelector('svg');
      if (clone) this.$.summaryPreview.appendChild(clone.cloneNode(true));
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

  Simulator.prototype.bindStylist = function () {
    var self = this;
    var box = this.$.stylist;
    if (!box) return;
    var form = box.querySelector('form');
    var input = box.querySelector('[data-stylist-input]');
    box.querySelectorAll('[data-stylist-example]').forEach(function (chip) {
      chip.addEventListener('click', function () {
        input.value = chip.textContent.trim();
        input.focus();
      });
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = input.value.trim();
      if (!text) { input.focus(); return; }
      self.runStylist(text);
    });
  };

  Simulator.prototype.runStylist = function (text) {
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

    var endpoint = this.config.stylistEndpoint;
    var request = endpoint
      ? fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: text, catalog: this.catalogPayload(), threePiece: this.hasGroup('threePiece') })
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
        return window.RoTailorStylist
          ? window.RoTailorStylist.local(text, self.groups, self.hasGroup('threePiece'))
          : null;
      })
      .then(function (look) {
        // 演出のため最低 2.4 秒は「仕立て中」を見せる
        var wait = Math.max(0, 2400 - (Date.now() - started));
        setTimeout(function () {
          clearInterval(timer);
          button.disabled = false;
          box.classList.remove('is-working');
          progress.hidden = true;
          if (look) self.applyLook(look, text);
        }, wait);
      });
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

  Simulator.prototype.renderPreview = function () {
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

    var u = this.uid;
    var fab = 'url(#' + u + '-fab)';
    var seam = { fill: 'none', stroke: 'rgba(0,0,0,0.38)', 'stroke-width': 0.9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    var hi = { fill: 'none', stroke: 'rgba(255,255,255,0.12)', 'stroke-width': 0.8 };
    var fabricDark = mix(fabric.color || '#2b3245', '#000000', 0.25);

    var root = svg('svg', { viewBox: '0 0 300 452', class: 'sim-svg', role: 'img', 'aria-label': 'スーツのプレビュー：' + (fabric.name || '') });
    var defs = svg('defs');
    defs.appendChild(this.patternFor(u + '-fab', fabric, 1));
    if (tie) defs.appendChild(this.patternFor(u + '-tie', tie, 0.7));
    if (lining) defs.appendChild(this.patternFor(u + '-lin', lining, 1));
    var shade = svg('linearGradient', { id: u + '-shade', x1: '0', y1: '0', x2: '1', y2: '0' }, [
      svg('stop', { offset: '0', 'stop-color': '#000', 'stop-opacity': '0.34' }),
      svg('stop', { offset: '0.22', 'stop-color': '#000', 'stop-opacity': '0' }),
      svg('stop', { offset: '0.5', 'stop-color': '#fff', 'stop-opacity': '0.07' }),
      svg('stop', { offset: '0.78', 'stop-color': '#000', 'stop-opacity': '0' }),
      svg('stop', { offset: '1', 'stop-color': '#000', 'stop-opacity': '0.34' })
    ]);
    var vshade = svg('linearGradient', { id: u + '-vshade', x1: '0', y1: '0', x2: '0', y2: '1' }, [
      svg('stop', { offset: '0', 'stop-color': '#fff', 'stop-opacity': '0.06' }),
      svg('stop', { offset: '1', 'stop-color': '#000', 'stop-opacity': '0.22' })
    ]);
    var floor = svg('radialGradient', { id: u + '-floor', cx: '0.5', cy: '0.5', r: '0.5' }, [
      svg('stop', { offset: '0', 'stop-color': '#000', 'stop-opacity': '0.18' }),
      svg('stop', { offset: '1', 'stop-color': '#000', 'stop-opacity': '0' })
    ]);
    defs.appendChild(shade);
    defs.appendChild(vshade);
    defs.appendChild(floor);
    root.appendChild(defs);

    function add(tag, attrs) { var n = svg(tag, attrs); root.appendChild(n); return n; }
    function shaded(d, gradient) {
      add('path', { d: d, fill: fab });
      add('path', { d: d, fill: 'url(#' + u + '-' + (gradient || 'shade') + ')' });
      add('path', Object.assign({ d: d }, seam));
    }

    var front = this.view === 'front';

    // floor shadow + dress form neck
    add('ellipse', { cx: 150, cy: 444, rx: 90, ry: 7, fill: 'url(#' + u + '-floor)' });
    add('path', { d: 'M134 34 V14 Q134 6 150 6 Q166 6 166 14 V34 Z', fill: '#d6c7b0' });
    add('path', { d: 'M134 14 Q150 20 166 14', fill: 'none', stroke: 'rgba(0,0,0,0.12)', 'stroke-width': 1 });

    // trousers
    var legL = 'M80 296 L148 296 L144 432 L98 432 Z';
    var legR = mirrorPath(legL);
    var hemDouble = hem.key === 'double';
    shaded(legL, 'vshade');
    shaded(legR, 'vshade');
    add('path', Object.assign({ d: 'M114 306 L121 430' }, hi));
    add('path', Object.assign({ d: mirrorPath('M114 306 L121 430') }, hi));
    if (front) {
      add('path', Object.assign({ d: 'M150 300 Q151 328 145 338' }, seam));
      if (pleat.key === 'one' || pleat.key === 'two') {
        add('path', Object.assign({ d: 'M127 302 L128 326' }, seam));
        add('path', Object.assign({ d: mirrorPath('M127 302 L128 326') }, seam));
      }
      if (pleat.key === 'two') {
        add('path', Object.assign({ d: 'M137 302 L137.5 318' }, seam));
        add('path', Object.assign({ d: mirrorPath('M137 302 L137.5 318') }, seam));
      }
    } else {
      add('path', Object.assign({ d: 'M150 300 V340' }, seam));
      add('path', Object.assign({ d: 'M102 318 H126' }, seam));
      add('path', Object.assign({ d: mirrorPath('M102 318 H126') }, seam));
    }
    if (hemDouble) {
      add('path', Object.assign({ d: 'M98.6 420 L144.6 420' }, seam));
      add('path', Object.assign({ d: mirrorPath('M98.6 420 L144.6 420') }, seam));
    }
    // shoes
    var shoe = 'M97 432 Q96 444 104 446 L142 446 Q147 445 145 432 Z';
    add('path', { d: front ? 'M92 432 Q88 446 104 447 L140 447 Q148 446 145 432 Z' : shoe, fill: '#2e211a' });
    add('path', { d: mirrorPath(front ? 'M92 432 Q88 446 104 447 L140 447 Q148 446 145 432 Z' : shoe), fill: '#2e211a' });

    if (front) {
      // shirt + collar
      add('path', { d: 'M126 30 Q150 36 174 30 L180 46 L180 220 L120 220 L120 46 Z', fill: (tie && tie.shirtColor) || '#fbfbf8' });
      add('path', { d: 'M126 30 L150 50 L136 64 Z M174 30 L150 50 L164 64 Z', fill: (tie && tie.shirtColor) || '#fbfbf8', stroke: 'rgba(0,0,0,0.18)', 'stroke-width': 0.8 });
      if (tie) {
        add('path', { d: 'M144 50 L156 50 L154.5 62 L145.5 62 Z', fill: 'url(#' + u + '-tie)', stroke: 'rgba(0,0,0,0.25)', 'stroke-width': 0.6 });
        add('path', { d: 'M145.5 62 L154.5 62 L163 160 L150 176 L137 160 Z', fill: 'url(#' + u + '-tie)', stroke: 'rgba(0,0,0,0.25)', 'stroke-width': 0.6 });
        add('path', { d: 'M145.5 62 L154.5 62 L150 70 Z', fill: 'rgba(0,0,0,0.18)' });
      }
      // waistcoat
      if (st.threePiece) {
        var vd = 'M124 32 Q150 38 176 32 L182 44 L182 250 L118 250 L118 44 Z M127 33 L150 122 L173 33 Z';
        add('path', { d: vd, fill: fab, 'fill-rule': 'evenodd' });
        add('path', { d: vd, fill: 'url(#' + u + '-shade)', 'fill-rule': 'evenodd' });
        add('path', Object.assign({ d: 'M127 34 L150 122 L173 34' }, seam));
        [134, 150, 166].forEach(function (y) {
          add('circle', { cx: 150, cy: y, r: 2.4, fill: button.color || '#3a2a20' });
        });
      }
    }

    // sleeves
    var sleeveL = 'M66 62 C50 68 44 96 42 140 L36 296 L60 300 L69 170 Z';
    shaded(sleeveL, 'vshade');
    shaded(mirrorPath(sleeveL), 'vshade');
    var cuff = [[41, 284], [45.5, 286], [50, 288], [54.5, 290]];
    cuff.forEach(function (c) {
      add('circle', { cx: c[0], cy: c[1], r: 1.7, fill: button.color || '#3a2a20' });
      add('circle', { cx: 300 - c[0], cy: c[1], r: 1.7, fill: button.color || '#3a2a20' });
    });

    if (front) {
      var vY = geo.vY;
      var cx = geo.cx;
      var hemY = 304;
      var body;
      if (geo.double) {
        body = 'M122 36 L94 46 L66 62 C60 120 61 210 66 300 Q150 314 234 300 C239 210 240 120 234 62 L206 46 L178 36 L' + cx + ' ' + vY + ' Z';
      } else {
        body = 'M122 36 L94 46 L66 62 C60 120 61 210 66 300 Q100 306 132 310 Q147 302 150 286 Q153 302 168 310 Q200 306 234 300 C239 210 240 120 234 62 L206 46 L178 36 L150 ' + vY + ' Z';
      }
      shaded(body);
      // front edge
      if (geo.double) add('path', Object.assign({ d: 'M' + cx + ' ' + vY + ' L' + cx + ' 311' }, seam));
      else add('path', Object.assign({ d: 'M150 ' + vY + ' L150 286' }, seam));
      // darts
      add('path', Object.assign({ d: 'M108 150 Q106 196 107 232' }, seam, { stroke: 'rgba(0,0,0,0.18)' }));
      add('path', Object.assign({ d: mirrorPath('M108 150 Q106 196 107 232') }, seam, { stroke: 'rgba(0,0,0,0.18)' }));

      // lapels
      var width = lapel.width || 8.5;
      var kind = lapel.key || 'notch';
      var left = lapelPoints([130, 31], [cx, vY], 'left', width, kind);
      var right = lapelPoints([170, 31], [cx, vY], 'right', width, kind);
      [left, right].forEach(function (lp) {
        var d = kind === 'shawl' ? smoothPath(lp.points) : polyPath(lp.points, true);
        add('path', { d: d, fill: fab });
        add('path', { d: d, fill: 'rgba(255,255,255,0.05)' });
        add('path', Object.assign({ d: d }, seam));
      });
      // boutonniere on wearer's left lapel
      var bh = right.P(0.3, 0.55);
      add('path', Object.assign({ d: 'M' + (bh[0] - 3) + ' ' + (bh[1] - 1) + ' L' + (bh[0] + 3) + ' ' + (bh[1] + 1) }, seam, { 'stroke-width': 1.2 }));
      if (geo.rollHole) {
        var rh = left.P(0.86, 0.38);
        add('path', Object.assign({ d: 'M' + (rh[0] - 3) + ' ' + rh[1] + ' L' + (rh[0] + 3) + ' ' + rh[1] }, seam, { 'stroke-width': 1.2 }));
      }

      // pockets
      var pk = pocket.key || 'flap';
      var chest = 'M180 124 L208 120 L208.6 125 L180.6 129 Z';
      if (pk === 'patch') {
        var patch = 'M74 228 H124 V276 Q124 282 118 282 H80 Q74 282 74 276 Z';
        add('path', Object.assign({ d: patch }, seam));
        add('path', Object.assign({ d: mirrorPath(patch) }, seam));
        add('path', Object.assign({ d: 'M180 118 L206 115 L208 142 Q208 145 205 145 L184 147 Q181 147 181 144 Z' }, seam));
      } else {
        add('path', Object.assign({ d: chest }, seam));
        if (pk === 'jetted') {
          add('path', Object.assign({ d: 'M78 240 H122 M78 243 H122' }, seam));
          add('path', Object.assign({ d: mirrorPath('M78 240 H122 M78 243 H122') }, seam));
        } else if (pk === 'slant') {
          var slant = 'M76 244 L120 236 L122 248 L78 256 Z';
          add('path', { d: slant, fill: 'rgba(0,0,0,0.05)' });
          add('path', Object.assign({ d: slant }, seam));
          add('path', Object.assign({ d: mirrorPath(slant) }, seam));
        } else {
          var flap = 'M76 238 H122 V251 Q122 253 120 253 H78 Q76 253 76 251 Z';
          add('path', { d: flap, fill: 'rgba(0,0,0,0.05)' });
          add('path', Object.assign({ d: flap }, seam));
          add('path', Object.assign({ d: mirrorPath(flap) }, seam));
          if (pk === 'flap_ticket') {
            var ticket = 'M80 218 H114 V227 Q114 229 112 229 H82 Q80 229 80 227 Z';
            add('path', Object.assign({ d: ticket }, seam));
          }
        }
      }

      // buttons
      geo.buttons.forEach(function (b) {
        add('circle', { cx: b[0], cy: b[1], r: 4.2, fill: button.color || '#3a2a20' });
        add('circle', { cx: b[0], cy: b[1], r: 4.2, fill: 'none', stroke: 'rgba(0,0,0,0.35)', 'stroke-width': 0.6 });
        add('circle', { cx: b[0] - 1.2, cy: b[1] - 1.2, r: 1.2, fill: 'rgba(255,255,255,0.25)' });
      });
    } else {
      // back view
      var back = 'M110 34 Q150 42 190 34 L206 44 L234 62 C239 120 240 210 234 300 Q150 312 66 300 C61 210 60 120 66 62 L94 44 Z';
      shaded(back);
      var collar = 'M110 34 Q150 42 190 34 L188 46 Q150 54 112 46 Z';
      add('path', { d: collar, fill: fab });
      add('path', { d: collar, fill: 'rgba(0,0,0,0.12)' });
      add('path', Object.assign({ d: collar }, seam));
      var ventTop = 248;
      add('path', Object.assign({ d: 'M150 50 L150 ' + (vent.key === 'center' ? ventTop : 306) }, seam));
      add('path', Object.assign({ d: 'M96 88 Q88 200 88 ' + (vent.key === 'side' ? ventTop : 303) }, seam));
      add('path', Object.assign({ d: mirrorPath('M96 88 Q88 200 88 ' + (vent.key === 'side' ? ventTop : 303)) }, seam));
      if (vent.key === 'center') {
        add('path', { d: 'M150 248 L155 254 L155 306 L150 306 Z', fill: fabricDark, 'fill-opacity': 0.7 });
        add('path', Object.assign({ d: 'M150 248 L155 254 L155 306' }, seam));
      } else if (vent.key === 'side') {
        add('path', { d: 'M88 248 L93 254 L93 303 L88 303 Z', fill: fabricDark, 'fill-opacity': 0.7 });
        add('path', { d: mirrorPath('M88 248 L93 254 L93 303 L88 303 Z'), fill: fabricDark, 'fill-opacity': 0.7 });
        add('path', Object.assign({ d: 'M88 248 L93 254 L93 303' }, seam));
        add('path', Object.assign({ d: mirrorPath('M88 248 L93 254 L93 303') }, seam));
      }
    }

    // lining inset
    if (lining) {
      var g = svg('g', { transform: 'translate(30 34)' });
      g.appendChild(svg('circle', { r: 20, fill: 'url(#' + u + '-lin)', stroke: 'rgba(0,0,0,0.2)', 'stroke-width': 1 }));
      var label = svg('text', { y: 34, 'text-anchor': 'middle', 'font-size': 9, fill: 'currentColor', 'letter-spacing': '0.08em' });
      label.textContent = 'LINING';
      g.appendChild(label);
      root.appendChild(g);
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
