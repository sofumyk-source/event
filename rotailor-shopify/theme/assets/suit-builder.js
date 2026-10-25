/*
 * RO Tailor — スーツの組み立て描画（フロント組み立て方式）
 * ------------------------------------------------------------
 * 前身頃・ポケットを取り除いた写真（suit-front-base.jpg）や、ベントのない後ろ姿の写真の上に、
 * 仕様（前合わせ・ラペル・ベスト・ポケット・ベント・ボタン）から計算した形を Canvas で描き重ねます。
 * 生地・シャツ・ネクタイの色柄は suit-photo.js のタイル（写真の陰影を残す塗り替え）と同じものを使うため、
 * 写真の部分と描いた部分が同じ柄でつながります。設計は prototype/suit-builder/DESIGN.md。
 *
 * 座標はすべて基準写真（768×1152）のピクセル。中心線 x=384、約 4.9px/cm。
 */
(function () {
  'use strict';

  var CX = 384;
  var HEM_Y = 566;

  /*
   * 前合わせ（ボタンの数と配置）。
   *   overlap  … 上前の前端が中心線からどれだけ外（画像の右）に出るか。シングル約2cm、ダブル約8cm
   *   breakY   … 返り止まり（ラペルが折り返し始める点＝V ゾーンの底）。ダブルも中心付近で、
   *              そこから上前の前端が斜めに下り（drop）、外側の列の外で垂直になる
   *   buttons  … dx は中心線からの距離。fastened＝留める、rolled＝ラペルの裏に隠れる（段返り）
   */
  var CLOSURES = {
    sb1: { label: 'シングル1ボタン', type: 'single', overlap: 9, breakY: 384, buttons: [{ dx: 0, y: 404, fastened: true }] },
    sb2: { label: 'シングル2ボタン', type: 'single', overlap: 9, breakY: 352, buttons: [{ dx: 0, y: 373, fastened: true }, { dx: 0, y: 440 }] },
    sb3: {
      label: 'シングル3ボタン段返り', type: 'single', overlap: 9, breakY: 356,
      // 一番上のボタンはラペルの裏に隠れ、ボタンホールだけがラペルの返りに見える（3-roll-2）
      buttons: [{ dx: 0, y: 326, rolled: true }, { dx: 0, y: 374, fastened: true }, { dx: 0, y: 434 }]
    },
    db4: {
      label: 'ダブル4ボタン', type: 'double', overlap: 40, breakY: 352, drop: 44,
      buttons: [{ dx: -25, y: 386 }, { dx: 25, y: 386, fastened: true }, { dx: -25, y: 446 }, { dx: 25, y: 446 }]
    },
    db6: {
      label: 'ダブル6ボタン', type: 'double', overlap: 40, breakY: 300, drop: 80,
      // 6×2：上段は飾りボタンで、留める段よりずっと外側（約±12cm）。中段を留める
      buttons: [{ dx: -60, y: 322 }, { dx: 60, y: 322 }, { dx: -25, y: 383 }, { dx: 25, y: 383, fastened: true }, { dx: -25, y: 445 }, { dx: 25, y: 445 }]
    }
  };

  // 画像の左側（着用者の右前）のラペル。右側は中心線で反転して使う
  var LAPELS = {
    // 幅は返り線から直角に測って ノッチ 8.5cm（約42px）／ピーク 9.5cm（約47px）／ショール 9cm
    notch: {
      label: 'ノッチ',
      tip: [315, 198],      // ラペルの先端
      gorge: [336, 201],    // ゴージ（上襟との縫い目がラペルの縁に出る点）＝ノッチの谷
      collarTip: [327, 186], // 上襟の先端。tip との間の切れ込みがノッチ
      belly: [[328, 252], [359, 312]], // 外側の線（ほぼ直線で、わずかに外へ膨らむ）
      notchOpen: true
    },
    peak: {
      label: 'ピーク',
      tip: [303, 181],      // 上向きに尖る剣先
      gorge: [339, 196],
      collarTip: [333, 192], // 上襟は剣先の下に隠れる
      belly: [[318, 240], [355, 308]]
    },
    shawl: {
      label: 'ショール',
      shawl: true,          // 上襟とラペルが一続き（ゴージもノッチもない）
      neck: [345, 147],
      belly: [[316, 176], [312, 270]]
    }
  };

  // 腰ポケット（中心の位置と、フラップの幅）。画像の左が着用者の右
  var POCKET_AT = [[299, 442], [468, 442]];
  var POCKETS = {
    flap: { label: 'フラップポケット' },
    flap_ticket: { label: 'フラップ＋チェンジポケット', ticket: true },
    slant: { label: 'スラントポケット', angle: 0.17 },
    jetted: { label: '両玉縁ポケット', jetted: true },
    patch: { label: 'パッチポケット', patch: true }
  };

  // ベント（後ろ姿）。x は切れ目の位置
  var VENTS = {
    none: { label: 'ノーベント', at: [] },
    center: { label: 'センターベント', at: [384] },
    side: { label: 'サイドベンツ', at: [294, 474] }
  };
  var VENT_TOP = 452;

  // パンツの裾（左右の脚の範囲と裾の高さ）
  var HEMS = [[292, 349], [413, 476]];
  var HEM_LINE = 1004;

  function mirror(p) { return [2 * CX - p[0], p[1]]; }
  function same(p) { return p; }

  /* ---------------------------------------------------------- geometry */

  // 組み合わせの決まり：ダブルはピーク、ショールはシングル1ボタン、ダブルは前を留めた状態だけ
  function normalize(spec) {
    var s = {
      closure: spec.closure in CLOSURES ? spec.closure : 'sb2',
      lapel: spec.lapel in LAPELS ? spec.lapel : 'notch',
      vest: !!spec.vest,
      open: !!spec.open,
      pocket: spec.pocket in POCKETS ? spec.pocket : 'flap',
      vent: spec.vent in VENTS ? spec.vent : 'side',
      cuff: !!spec.cuff,
      buttonColor: /^#[0-9a-f]{6}$/i.test(spec.buttonColor || '') ? spec.buttonColor : '#2c2019'
    };
    if (CLOSURES[s.closure].type === 'double') {
      s.lapel = 'peak';
      s.open = false;
    }
    if (s.lapel === 'shawl') s.closure = 'sb1';
    return s;
  }

  // 仕様から、描画に使う点と線をすべて計算する（ここが「仕立ての正しさ」を決める）
  function geometry(spec) {
    var s = normalize(spec);
    var closure = CLOSURES[s.closure];
    var lastButton = Math.max.apply(null, closure.buttons.map(function (b) { return b.y; }));
    var g = {
      spec: s,
      closure: closure,
      lapel: LAPELS[s.lapel],
      double: closure.type === 'double',
      open: s.open,
      edgeX: CX + closure.overlap,
      breakPoint: [CX + 3, closure.breakY],
      rollTop: [351, 152], // ラペルの返り線の上端（シャツの襟の下に入る）
      overlapEnd: lastButton + 20, // シングル：ここまで前身頃が重なり、下はカッタウェイ
      vest: s.vest
    };
    if (g.open) {
      // 前を開けると、左右の前身頃は中心から離れて下がる（約3cm → 裾で約6cm）
      g.breakPoint = [CX - 14, closure.breakY + 6];
      g.underBreak = [CX + 14, closure.breakY + 6];
      g.openEdge = [[CX - 14, closure.breakY + 6], [CX - 30, HEM_Y + 2]];
    } else {
      // 下前（画像の右）のラペルの返り止まり。上前の下に入るので、上前の返り止まりの少し下・内側
      g.underBreak = [2 * CX - g.breakPoint[0] + 4, g.breakPoint[1] + 6];
    }
    // 返り線の内側（V ゾーン）。開けた状態では裾まで開く
    g.vZone = g.open
      ? [g.rollTop, [CX, 146], mirror(g.rollTop), g.underBreak, mirror(g.openEdge[1]), g.openEdge[1], g.breakPoint]
      : [g.rollTop, [CX, 146], mirror(g.rollTop), g.underBreak, g.breakPoint];
    g.visibleButtons = closure.buttons.filter(function (b) { return !b.rolled; }).length;
    return g;
  }

  // ラペル（外形）のパス。side = -1 が画像の左（上前）、+1 が右（下前）
  function lapelPath(ctx, g, side) {
    var L = g.lapel;
    var f = side > 0 ? mirror : same;
    var br = side > 0 ? g.underBreak : g.breakPoint;
    var start = f(g.rollTop);
    var c1 = f(L.belly[0]), c2 = f(L.belly[1]);
    ctx.beginPath();
    ctx.moveTo(start[0], start[1]);
    if (L.shawl) {
      var neck = f(L.neck);
      ctx.lineTo(neck[0], neck[1]);
    } else {
      var gorge = f(L.gorge), tip = f(L.tip);
      ctx.lineTo(gorge[0], gorge[1]);
      ctx.lineTo(tip[0], tip[1]);
    }
    // 返り止まりが浅い（ダブル6ボタンなど）ときは、外側の線の膨らみも上へ縮める
    var t = (br[1] - 198) / (352 - 198);
    ctx.bezierCurveTo(c1[0], 198 + (c1[1] - 198) * t, c2[0], 198 + (c2[1] - 198) * t, br[0], br[1]);
    ctx.closePath();
  }

  // 上襟（ゴージから首元まで）。ショールにはない
  function collarPath(ctx, g, side) {
    var L = g.lapel;
    var f = side > 0 ? mirror : same;
    var a = f(L.collarTip), gorge = f(L.gorge), neck = f([343, 150]), top = f([352, 146]);
    ctx.beginPath();
    ctx.moveTo(gorge[0], gorge[1]);
    ctx.lineTo(a[0], a[1]);
    ctx.quadraticCurveTo((a[0] + neck[0]) / 2 + side * 4, (a[1] + neck[1]) / 2 - 8, neck[0], neck[1]);
    ctx.lineTo(top[0], top[1]);
    ctx.lineTo(f(g.rollTop)[0], f(g.rollTop)[1]);
    ctx.closePath();
  }

  /* ---------------------------------------------------------- painting helpers */

  function tileCanvas(tex) {
    var c = document.createElement('canvas');
    c.width = tex.w;
    c.height = tex.h;
    var img = c.getContext('2d').createImageData(tex.w, tex.h);
    img.data.set(tex.data);
    c.getContext('2d').putImageData(img, 0, 0);
    return c;
  }

  function meanLum(tex) {
    var d = tex.data, sum = 0;
    for (var i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    return sum / (d.length / 4) / 255;
  }

  // パスの内側を生地のタイルで塗り、陰影（乗算）を重ねる
  function fillFabric(ctx, pattern, shade) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0)'; // 影は呼び出し側で形を塗って落とす（ここで付けると内側が暗くなる）
    ctx.clip();
    // 座標を移動・回転して描く部品（ポケット等）でも隙間なく塗れるよう、広めに塗る
    ctx.fillStyle = pattern;
    ctx.fillRect(-2000, -2000, 5000, 5000);
    if (shade) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = shade;
      ctx.fillRect(-2000, -2000, 5000, 5000);
    }
    ctx.restore();
  }

  function grey(v) {
    var c = Math.round(255 * Math.max(0, Math.min(1, v)));
    return 'rgb(' + c + ',' + c + ',' + c + ')';
  }

  function shadeHex(hex, k) {
    var v = parseInt(hex.slice(1), 16);
    var r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
    function f(c) { return Math.round(k > 0 ? c + (255 - c) * k : c * (1 + k)); }
    return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')';
  }

  function buttonColors(hex) {
    return { light: shadeHex(hex, 0.35), base: shadeHex(hex, 0), dark: shadeHex(hex, -0.55) };
  }

  function drawButton(ctx, x, y, r, color) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 1.5;
    var gr = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    gr.addColorStop(0, color.light);
    gr.addColorStop(0.7, color.base);
    gr.addColorStop(1, color.dark);
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.68, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (d) {
      ctx.beginPath();
      ctx.arc(x + d[0] * r * 0.22, y + d[1] * r * 0.22, r * 0.1, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function buttonhole(ctx, x0, x1, y) {
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(x0, y + 1.6);
    ctx.lineTo(x1, y + 1.6);
    ctx.stroke();
  }

  function line(ctx, pts, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    pts.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
    ctx.stroke();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.closePath();
  }

  // 描画に使う道具（生地の模様・陰影）をまとめて用意する
  function tools(ctx, textures) {
    var suitTile = tileCanvas(textures.suit);
    // 淡い生地ほど陰影を弱める（乗算は明るい色ほど暗く目立つため）
    var soft = 1 - 0.55 * meanLum(textures.suit);
    return {
      suitTile: suitTile,
      suit: ctx.createPattern(suitTile, 'repeat'),
      shirt: textures.shirt ? ctx.createPattern(tileCanvas(textures.shirt), 'repeat') : null,
      tie: textures.tie ? ctx.createPattern(tileCanvas(textures.tie), 'repeat') : null,
      linear: function (x0, y0, x1, y1, stops, fabric) {
        var gr = ctx.createLinearGradient(x0, y0, x1, y1);
        stops.forEach(function (s) { gr.addColorStop(s[0], grey(fabric ? 1 - (1 - s[1]) * soft : s[1])); });
        return gr;
      }
    };
  }

  /* ---------------------------------------------------------- pockets */

  function drawPocket(ctx, t, kind, at, side) {
    var P = POCKETS[kind] || POCKETS.flap;
    var x = at[0], y = at[1];
    var w = 54;
    ctx.save();
    ctx.translate(x, y);
    // スラントは前（中心側）が高い
    if (P.angle) ctx.rotate(side < 0 ? -P.angle : P.angle);
    if (P.jetted) {
      // 両玉縁：フラップのない細い 2 本の玉縁
      ctx.fillStyle = t.suit;
      ctx.fillRect(-w / 2, -3, w, 6);
      line(ctx, [[-w / 2, 0], [w / 2, 0]], 'rgba(0,0,0,0.7)', 1.4);
      line(ctx, [[-w / 2, -3], [w / 2, -3]], 'rgba(0,0,0,0.3)', 0.8);
      line(ctx, [[-w / 2, 3], [w / 2, 3]], 'rgba(0,0,0,0.3)', 0.8);
      line(ctx, [[-w / 2, -1.5], [w / 2, -1.5]], 'rgba(255,255,255,0.12)', 0.6);
    } else if (P.patch) {
      // パッチ：外から縫い付けた袋。少し大きく、角が丸い
      var pw = 60, ph = 58;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 5;
      ctx.shadowOffsetY = 2;
      roundRect(ctx, -pw / 2, -18, pw, ph, 10);
      ctx.fillStyle = t.suit;
      ctx.fill();
      fillFabric(ctx, t.suit, t.linear(0, -18, 0, 40, [[0, 0.98], [1, 0.9]], true));
      ctx.restore();
      roundRect(ctx, -pw / 2, -18, pw, ph, 10);
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([2, 2.5]);
      roundRect(ctx, -pw / 2 + 3, -15, pw - 6, ph - 6, 8);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.stroke();
      ctx.setLineDash([]);
      line(ctx, [[-pw / 2 + 2, -12], [pw / 2 - 2, -12]], 'rgba(0,0,0,0.25)', 0.8);
    } else {
      // フラップ：玉縁の上にふたがかぶさる
      line(ctx, [[-w / 2, -14], [w / 2, -14]], 'rgba(0,0,0,0.55)', 1.2);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 5;
      ctx.shadowOffsetY = 2.5;
      roundRect(ctx, -w / 2, -13, w, 30, 4);
      ctx.fillStyle = t.suit;
      ctx.fill();
      fillFabric(ctx, t.suit, t.linear(0, -13, 0, 17, [[0, 0.96], [1, 0.88]], true));
      ctx.restore();
      roundRect(ctx, -w / 2, -13, w, 30, 4);
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
    // チェンジポケット：着用者の右（画像の左）のフラップの上に小さなフラップ
    if (P.ticket && side < 0) {
      ctx.save();
      ctx.translate(x + 4, y - 38);
      line(ctx, [[-17, -9], [17, -9]], 'rgba(0,0,0,0.5)', 1);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 2;
      roundRect(ctx, -17, -8, 34, 18, 3);
      ctx.fillStyle = t.suit;
      ctx.fill();
      fillFabric(ctx, t.suit, t.linear(0, -8, 0, 10, [[0, 0.96], [1, 0.88]], true));
      ctx.restore();
      roundRect(ctx, -17, -8, 34, 18, 3);
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  }

  // パンツのダブル裾（約4cm の折り返し）
  function drawCuffs(ctx, t) {
    HEMS.forEach(function (h) {
      ctx.beginPath();
      ctx.moveTo(h[0], HEM_LINE - 19);
      ctx.quadraticCurveTo((h[0] + h[1]) / 2, HEM_LINE - 16, h[1], HEM_LINE - 19);
      ctx.lineTo(h[1] + 1, HEM_LINE + 2);
      ctx.quadraticCurveTo((h[0] + h[1]) / 2, HEM_LINE + 5, h[0] - 1, HEM_LINE + 2);
      ctx.closePath();
      fillFabric(ctx, t.suit, t.linear(0, HEM_LINE - 19, 0, HEM_LINE + 2, [[0, 0.92], [1, 0.8]], true));
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 3;
      ctx.shadowOffsetY = -1;
      ctx.beginPath();
      ctx.moveTo(h[0], HEM_LINE - 19);
      ctx.quadraticCurveTo((h[0] + h[1]) / 2, HEM_LINE - 16, h[1], HEM_LINE - 19);
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    });
  }

  /* ---------------------------------------------------------- front */

  /*
   * 正面。base は suit-photo.js の loadBase で読み込んだ前身頃なしの写真。
   * spec: { closure, lapel, vest, open, pocket, cuff, buttonColor }
   * textures: { suit, shirt, tie }（suit-photo.js のタイル）
   */
  function render(canvas, base, spec, textures) {
    var P = window.RoTailorPhoto;
    P.compose(base, textures, canvas); // 1. 前身頃を取り除いた写真を、選んだ生地に塗り替える
    var ctx = canvas.getContext('2d');
    var g = geometry(spec);
    var t = tools(ctx, textures);
    var linear = t.linear;
    var edgeX = g.edgeX;
    var BUTTON = buttonColors(g.spec.buttonColor);

    // 2. V ゾーン：シャツ → ネクタイ → ベルト・パンツ（開けた時）→ ベスト（首元の写真部分より下だけを描く）
    ctx.save();
    ctx.beginPath();
    g.vZone.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
    ctx.closePath();
    ctx.clip();
    ctx.beginPath();
    ctx.rect(0, 206, 768, 1000);
    fillFabric(ctx, t.shirt, linear(CX - 34, 0, CX + 34, 0, [[0, 0.78], [0.25, 0.96], [0.5, 1], [0.75, 0.96], [1, 0.8]]));

    // ネクタイの大剣（結び目の下から少しずつ広がる。剣先はベルトの上）
    ctx.beginPath();
    ctx.moveTo(CX - 13, 204);
    ctx.lineTo(CX + 13, 204);
    ctx.lineTo(CX + 22, 452);
    ctx.lineTo(CX, 468);
    ctx.lineTo(CX - 22, 452);
    ctx.closePath();
    fillFabric(ctx, t.tie, linear(CX - 22, 0, CX + 22, 0, [[0, 0.7], [0.2, 0.92], [0.5, 1], [0.8, 0.9], [1, 0.68]]));

    if (g.open) {
      // ベルトとパンツの前（タックの有無に関係なく、前立ての線が見える）
      ctx.beginPath();
      ctx.rect(0, 472, 768, 600);
      fillFabric(ctx, t.suit, linear(0, 472, 0, 580, [[0, 0.62], [0.2, 0.86], [1, 0.82]], true));
      line(ctx, [[CX + 6, 486], [CX + 6, 560]], 'rgba(0,0,0,0.4)', 1);
      ctx.fillStyle = '#141210';
      ctx.fillRect(0, 472, 768, 13);
      line(ctx, [[0, 472.5], [768, 472.5]], 'rgba(255,255,255,0.12)', 0.8);
      ctx.fillStyle = '#9a9184';
      ctx.fillRect(CX - 9, 471, 18, 15);
      ctx.fillStyle = '#141210';
      ctx.fillRect(CX - 5, 474, 10, 9);
    }

    if (g.vest) {
      // シングル 6 ボタンのベスト。ベストの V は浅く、ジャケットの V の中に見える分だけ描く
      var apexY = 268;
      var vestBottom = 492;
      ctx.beginPath();
      ctx.moveTo(330, 190);
      ctx.lineTo(CX, apexY);
      ctx.lineTo(438, 190);
      ctx.lineTo(500, 190);
      ctx.lineTo(500, vestBottom - 22);
      ctx.lineTo(CX + 4, vestBottom);  // 裾は前中心が剣先のように下がる
      ctx.lineTo(CX - 4, vestBottom);
      ctx.lineTo(268, vestBottom - 22);
      ctx.lineTo(268, 190);
      ctx.closePath();
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 3;
      ctx.fillStyle = t.suit;
      ctx.fill();
      fillFabric(ctx, t.suit, linear(CX - 40, 0, CX + 40, 0, [[0, 0.84], [0.3, 0.96], [0.5, 1], [0.7, 0.96], [1, 0.84]], true));
      ctx.restore();
      line(ctx, [[330, 190], [CX, apexY], [438, 190]], 'rgba(0,0,0,0.45)', 1.4);
      line(ctx, [[CX + 3, apexY], [CX + 3, vestBottom]], 'rgba(0,0,0,0.45)', 1.4);
      line(ctx, [[268, vestBottom - 22], [CX, vestBottom], [500, vestBottom - 22]], 'rgba(0,0,0,0.5)', 1.2);
      for (var i = 0; i < 6; i++) drawButton(ctx, CX, apexY + 18 + i * 34, 4.6, BUTTON);
    }
    ctx.restore();

    // 3. ラペルの落ち影（胸とVゾーンへ）
    [-1, 1].forEach(function (side) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetX = side * -2;
      ctx.shadowOffsetY = 3;
      lapelPath(ctx, g, side);
      ctx.fillStyle = t.suit; // ラペル本体は後で上から描く。ここでは影を落とすためだけに塗る
      ctx.fill();
      ctx.restore();
    });

    // 4. 前端
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 6;
    if (g.open) {
      // 開けた状態：左右の前端が V ゾーンの縁になる。それぞれ内側へ影を落とす
      [-1, 1].forEach(function (side) {
        var a = side < 0 ? g.openEdge[0] : mirror(g.openEdge[0]);
        var b = side < 0 ? g.openEdge[1] : mirror(g.openEdge[1]);
        ctx.shadowOffsetX = -side * 2.5;
        line(ctx, [a, b], 'rgba(0,0,0,0.6)', 1.3);
      });
      ctx.restore();
    } else if (g.double) {
      // ダブル：上前の前端は返り止まりから斜めに下り、外側の列の外で垂直。裾の角だけ丸い
      ctx.shadowOffsetX = 2.5;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(g.breakPoint[0], g.breakPoint[1]);
      ctx.lineTo(edgeX, g.breakPoint[1] + g.closure.drop);
      ctx.lineTo(edgeX, HEM_Y - 14);
      ctx.quadraticCurveTo(edgeX, HEM_Y + 2, edgeX - 14, HEM_Y + 3);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.restore();
      // シングル：一番下のボタンより下はカッタウェイで開き、パンツが見える
      ctx.beginPath();
      ctx.moveTo(edgeX, g.overlapEnd);
      ctx.bezierCurveTo(edgeX - 2, g.overlapEnd + 60, 372, HEM_Y - 30, 352, HEM_Y + 4);
      ctx.lineTo(420, HEM_Y + 4);
      ctx.bezierCurveTo(404, HEM_Y - 30, edgeX + 4, g.overlapEnd + 60, edgeX, g.overlapEnd);
      ctx.closePath();
      fillFabric(ctx, t.suit, linear(0, g.overlapEnd, 0, HEM_Y, [[0, 0.5], [0.25, 0.68], [1, 0.78]], true));
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(edgeX, g.overlapEnd);
      ctx.bezierCurveTo(edgeX + 4, g.overlapEnd + 60, 404, HEM_Y - 30, 420, HEM_Y + 4);
      ctx.stroke();
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 2.5;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(g.breakPoint[0], g.breakPoint[1]);
      ctx.lineTo(edgeX, g.breakPoint[1] + 14);
      ctx.lineTo(edgeX, g.overlapEnd);
      ctx.bezierCurveTo(edgeX - 2, g.overlapEnd + 60, 372, HEM_Y - 30, 352, HEM_Y + 4);
      ctx.stroke();
      ctx.restore();
    }
    if (!g.open) {
      line(ctx, [[edgeX - 1.5, g.breakPoint[1] + (g.double ? g.closure.drop + 2 : 16)], [edgeX - 1.5, g.double ? HEM_Y - 14 : g.overlapEnd]], 'rgba(255,255,255,0.16)', 0.8);
    }

    // 5. 上襟とラペル（右前 → 左前の順。左前＝上前が上に重なる）
    var lapelAngle = Math.atan2(g.breakPoint[0] - 315, g.breakPoint[1] - 198) * 180 / Math.PI;
    [1, -1].forEach(function (side) {
      if (!g.lapel.shawl) {
        collarPath(ctx, g, side);
        fillFabric(ctx, t.suit, linear(0, 146, 0, 200, [[0, 0.8], [1, 0.9]], true));
        collarPath(ctx, g, side);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      // ラペルの柄はラペルの向きに沿わせる（ストライプが斜めに走る）
      var pat = ctx.createPattern(t.suitTile, 'repeat');
      if (pat.setTransform && window.DOMMatrix) pat.setTransform(new DOMMatrix().rotate(-side * lapelAngle));
      var near = side > 0 ? mirror(g.rollTop) : g.rollTop;
      var far = g.lapel.shawl ? (side > 0 ? mirror([312, 240]) : [312, 240]) : (side > 0 ? mirror(g.lapel.tip) : g.lapel.tip);
      lapelPath(ctx, g, side);
      // 返り線側が明るく、外側へ向かって少し沈む（ラペルの立体感）
      fillFabric(ctx, pat, linear(near[0], near[1] + 40, far[0], far[1] + 40, [[0, 1.02], [0.45, 0.97], [1, 0.84]], true));
      lapelPath(ctx, g, side);
      ctx.strokeStyle = 'rgba(0,0,0,0.42)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });
    // ノッチ／ピークの切れ込み
    if (!g.lapel.shawl) {
      [-1, 1].forEach(function (side) {
        var f = side > 0 ? mirror : same;
        var a = f(g.lapel.collarTip), gorge = f(g.lapel.gorge), tip = f(g.lapel.tip);
        if (g.lapel.notchOpen) {
          ctx.fillStyle = 'rgba(0,0,0,0.28)';
          ctx.beginPath();
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(gorge[0], gorge[1]);
          ctx.lineTo(tip[0], tip[1]);
          ctx.closePath();
          ctx.fill();
        }
        line(ctx, [a, gorge, tip], 'rgba(0,0,0,0.55)', 1.2);
      });
    }

    // 胸ポケット（着用者の左胸）
    ctx.save();
    ctx.translate(470, 236);
    ctx.rotate(-0.08);
    ctx.fillStyle = t.suit;
    ctx.fillRect(-20, -4, 40, 8);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-20, -4, 40, 8);
    ctx.restore();

    // 腰ポケット
    drawPocket(ctx, t, g.spec.pocket, POCKET_AT[0], -1);
    drawPocket(ctx, t, g.spec.pocket, POCKET_AT[1], 1);

    // 6. フロントボタン
    g.closure.buttons.forEach(function (b) {
      var x = CX + b.dx;
      if (b.rolled) {
        // 段返り：ボタン自体はラペルの裏。ラペルの返りにボタンホールだけが見える
        ctx.save();
        ctx.translate(x - 9, b.y);
        ctx.rotate(-0.42);
        buttonhole(ctx, -9, 9, 0);
        ctx.restore();
        return;
      }
      if (g.open) {
        // 開けた状態：ボタンは下前（画像の右）の前端の内側、ボタンホールは上前（画像の左）の前端に並ぶ
        var k = (b.y - g.openEdge[0][1]) / (g.openEdge[1][1] - g.openEdge[0][1]);
        var off = 14 + 16 * Math.max(0, k);
        buttonhole(ctx, CX - off - 20, CX - off - 5, b.y);
        drawButton(ctx, CX + off + 12, b.y, 7.5, BUTTON);
        return;
      }
      if (!g.double && !b.fastened) buttonhole(ctx, edgeX - 20, edgeX - 5, b.y);
      drawButton(ctx, x, b.y, 7.5, BUTTON);
    });

    if (g.spec.cuff) drawCuffs(ctx, t);
    return g;
  }

  /* ---------------------------------------------------------- back */

  // 後ろ姿。base はベントのない後ろ姿の写真。spec: { vent, cuff }
  function renderBack(canvas, base, spec, textures) {
    var P = window.RoTailorPhoto;
    P.compose(base, textures, canvas);
    var ctx = canvas.getContext('2d');
    var s = normalize(spec);
    var t = tools(ctx, textures);
    VENTS[s.vent].at.forEach(function (x, i, all) {
      // ベントの重なり：上の身頃の縁に影。上端は斜めのステッチで止める
      var dir = all.length > 1 ? (i === 0 ? 1 : -1) : 1;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 5;
      ctx.shadowOffsetX = dir * 2;
      line(ctx, [[x, VENT_TOP], [x, HEM_Y + 1]], 'rgba(0,0,0,0.6)', 1.3);
      ctx.restore();
      line(ctx, [[x - dir * 1.5, VENT_TOP + 4], [x - dir * 1.5, HEM_Y - 2]], 'rgba(255,255,255,0.14)', 0.8);
      line(ctx, [[x, VENT_TOP], [x + dir * 10, VENT_TOP + 12]], 'rgba(0,0,0,0.45)', 1);
      // 裾で身頃がわずかに開き、下の身頃（陰）が見える
      ctx.beginPath();
      ctx.moveTo(x, HEM_Y - 30);
      ctx.lineTo(x + dir * 3, HEM_Y + 2);
      ctx.lineTo(x, HEM_Y + 2);
      ctx.closePath();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fill();
    });
    if (s.cuff) drawCuffs(ctx, t);
    return s;
  }

  window.RoTailorBuilder = {
    render: render,
    renderBack: renderBack,
    geometry: geometry,
    normalize: normalize,
    CLOSURES: CLOSURES,
    LAPELS: LAPELS,
    POCKETS: POCKETS,
    VENTS: VENTS
  };
})();
