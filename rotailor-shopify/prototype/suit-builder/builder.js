/*
 * RO Tailor — フロント組み立て方式（プロトタイプ）
 * ------------------------------------------------------------
 * 「前身頃を取り除いた写真（front-base.jpg）」の上に、仕様（ラペル・ボタン数・ベスト）から
 * 計算した形を Canvas で描き重ねます。生地・シャツ・ネクタイの色柄は suit-photo.js の
 * タイル（写真の陰影を残す塗り替え）と同じものを使うため、写真部分と描画部分が同じ柄になります。
 *
 * 座標はすべて基準写真（768×1152）のピクセル。中心線 x=384、約 4.9px/cm。
 */
(function () {
  'use strict';

  var CX = 384;
  var HEM_Y = 566;

  // ボタン数ごとの仕様（y はボタンの位置。fastened = 留めるボタン）
  var CLOSURES = {
    1: { buttons: [{ y: 404, fastened: true }], breakY: 384 },
    2: { buttons: [{ y: 373, fastened: true }, { y: 440, fastened: false }], breakY: 352 }
  };

  // 画像の左側（着用者の右前）のラペル。右側は中心線で反転して使う
  var LAPELS = {
    // 幅は返り線から直角に測って ノッチ 8.5cm（約42px）／ピーク 9.5cm（約47px）
    notch: {
      tip: [315, 198],      // ラペルの先端
      gorge: [336, 201],    // ゴージ（上襟との縫い目がラペルの縁に出る点）＝ノッチの谷
      collarTip: [327, 186], // 上襟の先端。tip との間の切れ込みがノッチ
      belly: [[328, 252], [359, 312]], // 外側の線（ほぼ直線で、わずかに外へ膨らむ）
      widthCm: 8.5,
      notchOpen: true
    },
    peak: {
      tip: [303, 181],      // 上向きに尖る剣先
      gorge: [339, 196],
      collarTip: [333, 192], // 上襟は剣先の下に隠れる
      belly: [[318, 240], [355, 308]],
      widthCm: 9.5
    }
  };

  function mirror(p) { return [2 * CX - p[0], p[1]]; }

  /* ---------------------------------------------------------- geometry */

  // 仕様から、描画に使う点と線をすべて計算する（ここが「仕立ての正しさ」を決める）
  function geometry(spec) {
    var closure = CLOSURES[spec.buttons] || CLOSURES[2];
    var lapel = LAPELS[spec.lapel] || LAPELS.notch;
    var lastButton = closure.buttons[closure.buttons.length - 1].y;
    var g = {
      closure: closure,
      lapel: lapel,
      breakPoint: [CX + 3, closure.breakY],
      rollTop: [351, 152], // ラペルの返り線の上端（シャツの襟の下に入る）
      overlapEnd: lastButton + 20, // ここまで前身頃が重なり、下はカッタウェイ
      vest: spec.vest
    };
    // 返り線の内側（V ゾーン）の多角形
    g.vZone = [g.rollTop, [CX, 146], mirror(g.rollTop), mirror(g.breakPoint), g.breakPoint];
    return g;
  }

  // 画像左側のラペル（外形）のパスを作る
  function lapelPath(ctx, g, side) {
    var L = g.lapel;
    var f = side > 0 ? mirror : function (p) { return p; };
    var b = g.breakPoint;
    var start = f(g.rollTop), gorge = f(L.gorge), tip = f(L.tip), c1 = f(L.belly[0]), c2 = f(L.belly[1]);
    var br = side > 0 ? [2 * CX - b[0] + 4, b[1] + 6] : b; // 右前は左前の下に入るので少し内側で終わる
    ctx.beginPath();
    ctx.moveTo(start[0], start[1]);
    ctx.lineTo(gorge[0], gorge[1]);
    ctx.lineTo(tip[0], tip[1]);
    ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], br[0], br[1]);
    ctx.closePath();
  }

  // 上襟（ゴージから首元まで）
  function collarPath(ctx, g, side) {
    var L = g.lapel;
    var f = side > 0 ? mirror : function (p) { return p; };
    var a = f(L.collarTip), gorge = f(L.gorge), neck = f([343, 150]), top = f([352, 146]);
    ctx.beginPath();
    ctx.moveTo(gorge[0], gorge[1]);
    ctx.lineTo(a[0], a[1]);
    ctx.quadraticCurveTo((a[0] + neck[0]) / 2 - side * -4, (a[1] + neck[1]) / 2 - 8, neck[0], neck[1]);
    ctx.lineTo(top[0], top[1]);
    ctx.lineTo(f(g.rollTop)[0], f(g.rollTop)[1]);
    ctx.closePath();
  }

  /* ---------------------------------------------------------- painting */

  function tileCanvas(tex) {
    var c = document.createElement('canvas');
    c.width = tex.w;
    c.height = tex.h;
    var img = c.getContext('2d').createImageData(tex.w, tex.h);
    img.data.set(tex.data);
    c.getContext('2d').putImageData(img, 0, 0);
    return c;
  }

  // パスの内側を生地のタイルで塗り、陰影（乗算）とハイライト（スクリーン）を重ねる
  function fillFabric(ctx, pattern, shade) {
    ctx.save();
    ctx.clip();
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, 768, 1152);
    if (shade) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, 768, 1152);
    }
    ctx.restore();
  }

  function grey(v, a) {
    var c = Math.round(255 * Math.max(0, Math.min(1, v)));
    return 'rgba(' + c + ',' + c + ',' + c + ',' + (a == null ? 1 : a) + ')';
  }

  function linear(ctx, x0, y0, x1, y1, stops) {
    var gr = ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach(function (s) { gr.addColorStop(s[0], grey(s[1])); });
    return gr;
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

  var BUTTON = { light: '#6b5444', base: '#2c2019', dark: '#120c08' };

  /*
   * 描画の本体。
   * spec: { lapel: 'notch'|'peak', buttons: 1|2, vest: bool }
   * textures: { suit, shirt, tie }（suit-photo.js のタイル）
   */
  function render(canvas, base, spec, textures) {
    var P = window.RoTailorPhoto;
    P.compose(base, textures, canvas); // 1. 前身頃を取り除いた写真を、選んだ生地に塗り替える
    var ctx = canvas.getContext('2d');
    var g = geometry(spec);
    var suit = ctx.createPattern(tileCanvas(textures.suit), 'repeat');
    var shirt = ctx.createPattern(tileCanvas(textures.shirt), 'repeat');
    var tie = ctx.createPattern(tileCanvas(textures.tie), 'repeat');
    var last = g.closure.buttons[g.closure.buttons.length - 1].y;

    // 2. V ゾーン：シャツ → ネクタイ → ベスト（首元の写真部分より下だけを描く）
    ctx.save();
    ctx.beginPath();
    g.vZone.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
    ctx.closePath();
    ctx.clip();
    ctx.beginPath();
    ctx.rect(0, 206, 768, 1000);
    fillFabric(ctx, shirt, linear(ctx, CX - 34, 0, CX + 34, 0, [[0, 0.78], [0.25, 0.96], [0.5, 1], [0.75, 0.96], [1, 0.8]]));

    // ネクタイの大剣（結び目の下から少しずつ広がる）
    ctx.beginPath();
    ctx.moveTo(CX - 13, 204);
    ctx.lineTo(CX + 13, 204);
    ctx.lineTo(CX + 22, 520);
    ctx.lineTo(CX - 22, 520);
    ctx.closePath();
    fillFabric(ctx, tie, linear(ctx, CX - 22, 0, CX + 22, 0, [[0, 0.7], [0.2, 0.92], [0.5, 1], [0.8, 0.9], [1, 0.68]]));

    if (g.vest) {
      // シングル 6 ボタンのベスト。ベストの V は浅く、ジャケットの V の中に見える分だけ描く
      var apexY = 268;
      ctx.beginPath();
      ctx.moveTo(330, 190);
      ctx.lineTo(CX, apexY);
      ctx.lineTo(438, 190);
      ctx.lineTo(470, 190);
      ctx.lineTo(470, 600);
      ctx.lineTo(298, 600);
      ctx.lineTo(298, 190);
      ctx.closePath();
      fillFabric(ctx, suit, linear(ctx, CX - 40, 0, CX + 40, 0, [[0, 0.72], [0.3, 0.9], [0.5, 0.95], [0.7, 0.9], [1, 0.72]]));
      // ベストの前端と V の縁（影と縫い目）
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(330, 190); ctx.lineTo(CX, apexY); ctx.lineTo(438, 190);
      ctx.moveTo(CX + 3, apexY); ctx.lineTo(CX + 3, 600);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.moveTo(331, 192); ctx.lineTo(CX, apexY + 2);
      ctx.stroke();
      for (var i = 0; i < 6; i++) drawButton(ctx, CX, apexY + 18 + i * 27, 4.6, BUTTON);
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
      ctx.fillStyle = 'rgba(0,0,0,0.01)';
      ctx.fill();
      ctx.restore();
    });

    // 4. 前端の重なりとカッタウェイ（下の前身頃 → 上の前身頃の順に）
    var edgeX = CX + 9;
    ctx.beginPath(); // カッタウェイから見えるパンツ
    ctx.moveTo(edgeX, g.overlapEnd);
    ctx.bezierCurveTo(edgeX - 2, g.overlapEnd + 60, 372, HEM_Y - 30, 352, HEM_Y + 4);
    ctx.lineTo(420, HEM_Y + 4);
    ctx.bezierCurveTo(404, HEM_Y - 30, edgeX + 4, g.overlapEnd + 60, edgeX, g.overlapEnd);
    ctx.closePath();
    fillFabric(ctx, suit, linear(ctx, 0, g.overlapEnd, 0, HEM_Y, [[0, 0.5], [0.25, 0.68], [1, 0.78]]));
    // 下前（右側）の前端の線
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(edgeX, g.overlapEnd);
    ctx.bezierCurveTo(edgeX + 4, g.overlapEnd + 60, 404, HEM_Y - 30, 420, HEM_Y + 4);
    ctx.stroke();
    // 上前（左側）の前端：返り止まりから裾まで。右側へ影を落とす
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
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(edgeX - 1.5, g.breakPoint[1] + 16);
    ctx.lineTo(edgeX - 1.5, g.overlapEnd);
    ctx.stroke();

    // 5. 上襟とラペル（右前 → 左前の順。左前が上に重なる）
    [1, -1].forEach(function (side) {
      collarPath(ctx, g, side);
      fillFabric(ctx, suit, linear(ctx, 0, 146, 0, 200, [[0, 0.8], [1, 0.9]]));
      collarPath(ctx, g, side);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
      lapelPath(ctx, g, side);
      var near = side > 0 ? mirror(g.rollTop) : g.rollTop;
      var far = side > 0 ? mirror(g.lapel.tip) : g.lapel.tip;
      // 返り線側が明るく、外側へ向かって少し沈む（ラペルの立体感）
      fillFabric(ctx, suit, linear(ctx, near[0], near[1] + 40, far[0], far[1] + 40, [[0, 1.02], [0.45, 0.97], [1, 0.84]]));
      // 縁のステッチと返り線のハイライト
      ctx.save();
      lapelPath(ctx, g, side);
      ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 0.8;
      ctx.setLineDash([2, 3]);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(0,0,0,0.0)';
      ctx.restore();
      lapelPath(ctx, g, side);
      ctx.strokeStyle = 'rgba(0,0,0,0.42)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });
    // ノッチ／ピークの切れ込みの影
    [-1, 1].forEach(function (side) {
      var f = side > 0 ? mirror : function (p) { return p; };
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
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(gorge[0], gorge[1]);
      ctx.lineTo(tip[0], tip[1]);
      ctx.stroke();
    });

    // 胸ポケット（着用者の左胸）
    ctx.save();
    ctx.translate(470, 236);
    ctx.rotate(-0.08);
    ctx.fillStyle = suit;
    ctx.fillRect(-20, -4, 40, 8);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-20, -4, 40, 8);
    ctx.restore();

    // 6. フロントボタン
    g.closure.buttons.forEach(function (b) {
      if (!b.fastened) {
        // 留めていないボタンの横には、上前のボタンホールが見える
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(edgeX - 20, b.y);
        ctx.lineTo(edgeX - 5, b.y);
        ctx.stroke();
      }
      drawButton(ctx, CX, b.y, 7.5, BUTTON);
    });
    return g;
  }

  window.RoTailorBuilder = { render: render, geometry: geometry, CLOSURES: CLOSURES, LAPELS: LAPELS };
})();
