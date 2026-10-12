/*
 * RO Tailor — ローカル・スタイリスト（AI が使えないときの代わり）
 * ------------------------------------------------------------
 * 入力文に含まれる言葉（季節・場面・気分・色・景色など）から好みを推定し、
 * シミュレーターの選択肢を点数づけして一着を組み立てます。
 * AI 版（stylist-api）が未設定・通信失敗のときに使われます。
 * 同じ言葉を入れれば、いつも同じ一着になります。
 */
(function () {
  'use strict';

  /*
   * 言葉の辞書。
   * color: 生地の目標色 / tie: ネクタイの目標色 / pattern: 好む柄
   * season: ss|aw / formal, bold, relaxed: -2〜+2 の傾き / mood: コメントに使う言い回し
   */
  var DICTIONARY = [
    { words: ['結婚式', 'ウェディング', '披露宴', '二次会', '祝'], formal: 2, tie: '#9ea3a8', title: '祝宴', mood: '祝いの席にふさわしい華やかさ' },
    { words: ['式典', '授賞', '表彰', 'パーティ', 'パーティー', 'ガラ', '晩餐'], formal: 2, bold: 1, title: '晴れ舞台', mood: '晴れの場で映える品格' },
    { words: ['商談', 'プレゼン', '勝負', '交渉', '面接', '会議', '就活'], formal: 1, color: '#1c2540', pattern: ['solid', 'pinstripe'], tie: '#6b1f2a', title: '勝負服', mood: '信頼を勝ち取る誠実さ' },
    { words: ['社長', '経営', 'リーダー', '役員', 'ボス', '貫禄', '威厳'], formal: 2, bold: 1, color: '#1e2639', pattern: ['chalkstripe', 'pinstripe'], title: '貫禄', mood: '人の上に立つ貫禄' },
    { words: ['デート', '初デート', '恋', 'ロマンチック', '告白', 'プロポーズ'], relaxed: 1, tie: '#6b1f2a', title: '逢瀬', mood: 'さりげない色気' },
    { words: ['休日', '週末', 'カジュアル', 'リラックス', 'ゆったり', 'のんびり', '旅行', '旅'], relaxed: 2, formal: -1, title: '休日', mood: '肩の力が抜けた心地よさ' },
    { words: ['クラシック', '英国', 'イギリス', 'ロンドン', '伝統', '紳士', 'ジェントル'], formal: 1, pattern: ['glen', 'herringbone', 'chalkstripe'], classic: 2, title: '英国紳士', mood: '英国紳士の伝統' },
    { words: ['イタリア', 'ナポリ', 'ミラノ', '色気', 'セクシー', '艶'], relaxed: 1, bold: 1, title: '艶', mood: 'イタリアらしい艶' },
    { words: ['モダン', 'シンプル', 'ミニマル', '都会', 'スタイリッシュ', 'シャープ', 'クール'], formal: 1, color: '#2c2f33', pattern: ['solid'], slim: 2, title: '鋭角', mood: '都会的でシャープな線' },
    { words: ['派手', '目立', '華やか', '大胆', 'ド派手', '個性', 'インパクト'], bold: 2, title: '主役', mood: '誰よりも目を引く存在感' },
    { words: ['控えめ', '上品', '品', '落ち着', '大人', '静か', '穏やか'], formal: 1, bold: -1, title: '静謐', mood: '静かに漂う上品さ' },
    { words: ['元気', '明る', '楽し', 'ハッピー', '陽気', 'ポップ', '笑顔'], bold: 1, light: 1, tie: '#c9a43e', title: '陽光', mood: '明るく前向きな空気' },
    { words: ['ミステリアス', '夜', '闇', 'ダーク', '影', '黒'], color: '#202226', light: -2, tie: '#2a2c30', title: '夜想', mood: '夜に溶けるようなミステリアスさ' },

    { words: ['春', '桜', 'さくら', '新緑', '入学', '入社'], season: 'ss', light: 1, tie: '#c98a9a', title: '春風', mood: '春の軽やかさ' },
    { words: ['夏', '真夏', '猛暑', '涼', 'サマー', '太陽', 'ひまわり'], season: 'ss', light: 2, color: '#b9a586', tie: '#2e4f7a', title: '涼風', mood: '夏を涼やかに過ごす軽さ' },
    { words: ['秋', '紅葉', '落ち葉', '収穫', 'ハロウィン'], season: 'aw', color: '#5a4232', pattern: ['herringbone', 'glen'], tie: '#8a5a2b', title: '秋思', mood: '深まる秋の温もり' },
    { words: ['冬', '雪', 'クリスマス', '年末', '寒', '暖か'], season: 'aw', color: '#3a3c40', pattern: ['herringbone', 'chalkstripe'], tie: '#6b1f2a', title: '冬凛', mood: '冬の凛とした空気' },

    { words: ['海', '波', 'マリン', '港', '船', '湘南', '沖縄'], color: '#22304d', pattern: ['birdseye', 'solid'], tie: '#2e5f8a', title: '深海', mood: '深い海の青' },
    { words: ['空', '青空', '晴れ', 'ブルー', '青'], color: '#2a3f66', tie: '#5a86b8', title: '青天', mood: '澄みきった空の青' },
    { words: ['森', '山', '自然', '緑', 'グリーン', '抹茶', '庭'], color: '#3a3c40', tie: '#2f4a3a', pattern: ['herringbone', 'birdseye'], title: '森閑', mood: '森のような深い緑の気配' },
    { words: ['夕日', '夕焼け', '夕暮れ', 'オレンジ', '黄昏'], color: '#5a4232', tie: '#b5652e', title: '黄昏', mood: '夕暮れの温かな光' },
    { words: ['月', '星', '宇宙', '銀河', '星空'], color: '#1c2540', pattern: ['birdseye', 'pinstripe'], tie: '#9ea3a8', title: '星屑', mood: '星空のようなきらめき' },
    { words: ['街', 'シティ', '東京', 'ニューヨーク', 'ビル'], color: '#3a3c40', pattern: ['pinstripe', 'check'], slim: 1, title: '摩天楼', mood: '都会の街並みに映える端正さ' },
    { words: ['和', '京都', '日本', '侍', '武士', '着物', '茶'], color: '#22304d', formal: 1, classic: 1, tie: '#4a3a5c', title: '和魂', mood: '凛とした和の佇まい' },
    { words: ['コーヒー', 'カフェ', 'チョコ', 'ウイスキー', 'ワイン', 'バー'], color: '#5a4232', relaxed: 1, tie: '#6b1f2a', title: '琥珀', mood: '深い琥珀色のくつろぎ' },
    { words: ['ジャズ', '音楽', 'ピアノ', 'クラブ'], color: '#202226', bold: 1, title: '夜奏', mood: 'ジャズの夜の粋' },
    { words: ['スポーツ', 'ゴルフ', '野球', 'サッカー', '走'], relaxed: 1, light: 1, title: '颯爽', mood: '軽快で動きやすい躍動感' },

    { words: ['赤', 'レッド', '情熱', '炎', '燃'], tie: '#8c1f24', bold: 1, liningRed: true, title: '情熱', mood: '内に秘めた情熱' },
    { words: ['黄', 'イエロー', '金', 'ゴールド', '稲妻', '雷'], tie: '#c9a43e', bold: 1, gold: true, title: '閃光', mood: '光を放つような明るさ' },
    { words: ['ピンク', '桃'], tie: '#c98a9a', title: '桜色', mood: 'やわらかな華やぎ' },
    { words: ['紫', 'パープル', 'ラベンダー'], tie: '#4a3a5c', title: '紫苑', mood: '高貴な紫の気配' },
    { words: ['白', 'ホワイト', '純白', '清潔', '爽やか'], light: 2, color: '#9a9c9e', title: '白昼', mood: '清らかな爽やかさ' },
    { words: ['グレー', '灰', 'シルバー', '銀'], color: '#6f7276', tie: '#9ea3a8', title: '銀灰', mood: '洗練されたグレーの陰影' },
    { words: ['茶', 'ブラウン', 'ベージュ', '土'], color: '#5a4232', title: '大地', mood: '大地のような温かみ' },
    { words: ['ネイビー', '紺'], color: '#1f2a44', title: '紺碧', mood: '頼れる紺の深み' }
  ];

  function hexToRgb(hex) {
    var h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  function distance(a, b) {
    var x = hexToRgb(a);
    var y = hexToRgb(b);
    if (!x || !y) return 200;
    var rgb = Math.sqrt(Math.pow(x[0] - y[0], 2) + Math.pow(x[1] - y[1], 2) + Math.pow(x[2] - y[2], 2));
    // 色みの強さ（彩度）の差も加味して、グレーと茶色を取り違えにくくする
    var satX = (Math.max.apply(null, x) - Math.min.apply(null, x)) / 255;
    var satY = (Math.max.apply(null, y) - Math.min.apply(null, y)) / 255;
    return rgb + Math.abs(satX - satY) * 160;
  }

  function lightness(hex) {
    var c = hexToRgb(hex);
    return c ? (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255 : 0.3;
  }

  // 同じ文字列から同じ乱数列をつくる（mulberry32）
  function seeded(text) {
    var h = 2166136261;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return function () {
      h += 0x6d2b79f5;
      var t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function best(list, score, rand) {
    var top = null;
    var topScore = -Infinity;
    list.forEach(function (item) {
      var s = score(item) + rand() * 0.6; // 同点のときは揺らぎで選ぶ
      if (s > topScore) { topScore = s; top = item; }
    });
    return top;
  }

  function analyse(text) {
    var prefs = { titles: [], formal: 0, bold: 0, relaxed: 0, light: 0, classic: 0, slim: 0, colors: [], ties: [], patterns: [], season: null, moods: [], gold: false, liningRed: false };
    DICTIONARY.forEach(function (entry) {
      var hit = entry.words.some(function (w) { return text.indexOf(w) !== -1; });
      if (!hit) return;
      ['formal', 'bold', 'relaxed', 'light', 'classic', 'slim'].forEach(function (k) { prefs[k] += entry[k] || 0; });
      if (entry.color) prefs.colors.push(entry.color);
      if (entry.tie) prefs.ties.push(entry.tie);
      if (entry.pattern) prefs.patterns = prefs.patterns.concat(entry.pattern);
      if (entry.season) prefs.season = entry.season;
      if (entry.gold) prefs.gold = true;
      if (entry.liningRed) prefs.liningRed = true;
      if (entry.mood && prefs.moods.indexOf(entry.mood) === -1) prefs.moods.push(entry.mood);
      if (entry.title) prefs.titles.push(entry.title);
    });
    return prefs;
  }

  // 着る場面ごとの傾向
  var SCENES = {
    business: { formal: 1, colors: ['#1f2a44', '#3a3c40'], patterns: ['solid', 'pinstripe', 'birdseye'], title: '日々の品格', mood: '毎日のビジネスで頼れる品格' },
    pitch: { formal: 1, bold: 1, colors: ['#1c2540'], patterns: ['pinstripe', 'solid'], ties: ['#6b1f2a'], title: '勝負服', mood: '信頼を勝ち取る誠実さ' },
    interview: { formal: 1, bold: -2, colors: ['#1f2a44', '#3a3c40'], patterns: ['solid'], ties: ['#1e2a4a'], title: '第一歩', mood: '清潔感と誠実さ' },
    ceremony: { formal: 2, ties: ['#9ea3a8'], title: '祝宴', mood: '祝いの席にふさわしい華やかさ' },
    party: { formal: 1, bold: 2, title: '主役', mood: '晴れの場で映える存在感' },
    dinner: { relaxed: 1, bold: 1, ties: ['#6b1f2a'], title: '逢瀬', mood: 'さりげない色気' },
    casual: { relaxed: 2, formal: -1, patterns: ['herringbone', 'glen', 'check'], title: '休日', mood: '肩の力が抜けた心地よさ' }
  };
  var ACCENT_COLORS = ['green', 'bordeaux'];

  /*
   * input: { colors: [{key,label,hex}], scenes: [key], note: string, photoColors: [hex] }
   * （文字列を渡した場合は、ひとことだけが入力されたものとして扱う）
   */
  function local(raw, groups, threePieceEnabled) {
    var input = typeof raw === 'string' ? { note: raw } : (raw || {});
    var colorsIn = input.colors || [];
    var scenes = input.scenes || [];
    var photoColors = input.photoColors || [];
    var note = String(input.note || '').trim();
    var rand = seeded(JSON.stringify([colorsIn.map(function (c) { return c.key; }), scenes, note, photoColors]));
    var p = analyse(note);
    var pick = {};

    scenes.forEach(function (key) {
      var sc = SCENES[key];
      if (!sc) return;
      ['formal', 'bold', 'relaxed'].forEach(function (k) { p[k] += sc[k] || 0; });
      (sc.colors || []).forEach(function (c) { p.colors.push(c); });
      (sc.ties || []).forEach(function (c) { p.ties.push(c); });
      p.patterns = p.patterns.concat(sc.patterns || []);
      if (p.titles.indexOf(sc.title) === -1) p.titles.unshift(sc.title);
      if (p.moods.indexOf(sc.mood) === -1) p.moods.unshift(sc.mood);
    });
    // 選んだ色は場面より優先（先頭に入れて重みを上げる）
    var suitColors = [];
    colorsIn.forEach(function (c) {
      if (ACCENT_COLORS.indexOf(c.key) !== -1) {
        p.ties.unshift(c.hex);
        p.liningAccent = c.hex;
      } else {
        suitColors.push(c.hex);
      }
    });
    if (!suitColors.length && photoColors[0]) suitColors.push(photoColors[0]);
    if (photoColors[1]) p.ties.push(photoColors[1]);
    if (suitColors.length) p.colors = suitColors.concat(suitColors).concat(p.colors.slice(0, 1));

    pick.fabric = best(groups.fabric || [], function (f) {
      var s = 0;
      p.colors.forEach(function (c) { s += 3 - distance(f.color, c) / 60; });
      if (p.patterns.indexOf(f.pattern) !== -1) s += 2;
      if (p.season && f.season === p.season) s += 2.5;
      if (p.season && f.season && f.season !== 'all' && f.season !== p.season) s -= 3;
      if (p.light > 0) s += lightness(f.color) * p.light * 2;
      if (p.light < 0) s += (1 - lightness(f.color)) * -p.light * 2;
      if (p.bold > 0 && f.pattern && f.pattern !== 'solid') s += p.bold * 0.6;
      if (p.formal > 0 && (f.pattern === 'solid' || f.pattern === 'pinstripe' || f.pattern === 'birdseye')) s += p.formal * 0.5;
      return s;
    }, rand);

    var keyScore = function (table) {
      return function (item) { return (table[item.key] || 0); };
    };
    var lvl = function (v) { return Math.max(-2, Math.min(2, v)); };
    var formal = lvl(p.formal);
    var bold = lvl(p.bold);
    var relaxed = lvl(p.relaxed);

    pick.style = best(groups.style || [], keyScore({
      sb2: 1 + formal * 0.5,
      sb1: p.slim * 1.2 + bold * 0.3,
      sb3: relaxed * 0.8 + p.classic * 0.6,
      db6: bold * 1.2 + p.classic * 0.6 + (formal > 1 ? 0.6 : 0) - relaxed,
      db4: bold * 0.8 + p.slim * 0.4 - relaxed * 0.5
    }), rand);
    var isDouble = pick.style && /^db/.test(pick.style.key);

    pick.lapel = best(groups.lapel || [], function (l) {
      var s = { notch: 1 + relaxed * 0.4, peak: bold * 1 + (isDouble ? 2 : 0) + formal * 0.3, shawl: (formal > 1 && bold > 0 ? 1.5 : -1) }[l.key] || 0;
      if (p.slim > 0 && l.width && l.width < 8) s += p.slim;
      return s;
    }, rand);
    pick.pocket = best(groups.pocket || [], keyScore({
      flap: 1, flap_ticket: p.classic * 1.2, slant: p.slim * 0.8 + bold * 0.3, jetted: formal * 0.8 - relaxed, patch: relaxed * 1.3 - formal
    }), rand);
    pick.vent = best(groups.vent || [], keyScore({ side: 1, center: relaxed * 0.8, none: formal > 1 ? 1.2 : -0.5 }), rand);

    var fabricColor = pick.fabric ? pick.fabric.color : '#1f2a44';
    pick.button = best(groups.button || [], function (b) {
      var s = 2 - distance(b.color, fabricColor) / 80;
      if (lightness(b.color) > 0.5 && lightness(b.color) < 0.75) s += (p.gold ? 3 : 0) + (bold > 1 && isDouble ? 1 : -1);
      return s;
    }, rand);
    pick.lining = best(groups.lining || [], function (l) {
      var s = 0;
      if (p.liningRed) s += 3 - distance(l.color, '#6b1f2a') / 60;
      if (p.liningAccent) s += 3 - distance(l.color, p.liningAccent) / 60;
      if (bold > 0 && l.pattern && l.pattern !== 'solid') s += bold * 1.2;
      if (bold <= 0) s += 2 - distance(l.color, fabricColor) / 80;
      return s;
    }, rand);
    pick.pleat = best(groups.pleat || [], keyScore({ none: 1 + p.slim * 0.5, one: relaxed * 0.6 + p.classic * 0.4, two: p.classic * 0.6 + relaxed * 0.3 - p.slim }), rand);
    pick.hem = best(groups.hem || [], keyScore({ single: 1 + formal * 0.4, double: relaxed * 0.6 + p.classic * 0.7 }), rand);
    pick.tie = best(groups.tie || [], function (t) {
      var s = 0;
      p.ties.forEach(function (c) { s += 3 - distance(t.color, c) / 60; });
      if (!p.ties.length) s += 1 - Math.abs(lightness(t.color) - 0.3);
      return s;
    }, rand);

    var threePiece = !!threePieceEnabled && (p.classic + formal + (p.season === 'aw' ? 1 : 0) >= 3 || (p.classic > 0 && rand() > 0.6));

    var moods = p.moods.slice(0, 2);
    if (!moods.length) moods = ['あなたらしさ'];
    var fabricName = pick.fabric ? pick.fabric.name : '';
    var styleName = pick.style ? pick.style.name : '';
    var titleWords = ['夜想', '晴天', '凛', '余白', '灯', '旅路', '静謐', '軽風', '深海', '黄昏', '雅', '颯爽'];
    var title = '「' + (p.titles[0] || titleWords[Math.floor(rand() * titleWords.length)]) + '」の一着';

    var colorText = colorsIn.map(function (c) { return c.label; }).join('と');
    var opening = colorText
      ? 'お選びいただいた' + colorText + 'を軸に、' + moods.join('と') + 'を表現しました。'
      : moods.join('と') + 'を表現しました。';
    if (photoColors.length) opening += '添えていただいた写真の色合いも取り入れています。';
    var comment = opening + fabricName + 'を' + styleName + 'に仕立て、' +
      (pick.lining && bold > 0 ? '裏地の' + pick.lining.name + 'でさりげなく遊び心を。' : 'ディテールは控えめに、品よくまとめています。');

    var selection = {};
    Object.keys(pick).forEach(function (g) { if (pick[g]) selection[g] = pick[g].id; });
    return {
      selection: selection,
      threePiece: threePiece,
      title: title,
      comment: comment,
      salonNote: '店頭では、約6,000種類の生地見本を手に取りながらこのイメージをさらに磨けます。',
      source: 'local',
      matched: p.moods.length > 0
    };
  }

  window.RoTailorStylist = { local: local };
})();
