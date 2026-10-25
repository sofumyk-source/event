/*
 * RO Tailor — 着せ替え写真レンダラー
 * ------------------------------------------------------------
 * 色分けしたマネキン写真（suit-photo-<key>.jpg）と部位マスク（-mask.png：
 * R=スーツ G=ネクタイ B=シャツ）を読み込み、写真の陰影を残したまま
 * 生地・シャツ・ネクタイの色柄に塗り替えます。suit-simulator.js から使います。
 */
(function () {
  'use strict';

  var REGIONS = ['suit', 'tie', 'shirt'];
  var cache = {};

  function loadImg(url, cors) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      if (cors) img.crossOrigin = 'anonymous';
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = url;
    });
  }

  function pixels(img, w, h) {
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    var ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h).data;
  }

  /* 写真とマスクを読み込み、塗り替えに必要な値（陰影・部位の重み）を前計算する */
  function loadBase(key, urls) {
    if (cache[key]) return cache[key];
    cache[key] = Promise.all([loadImg(urls.photo), loadImg(urls.mask)]).then(function (imgs) {
      var w = imgs[0].naturalWidth;
      var h = imgs[0].naturalHeight;
      var photo = pixels(imgs[0], w, h);
      var mask = pixels(imgs[1], w, h);
      var n = w * h;
      var list = [];
      var shade = new Float32Array(n);
      var hist = REGIONS.map(function () { return []; });
      for (var i = 0; i < n; i++) {
        var p = i * 4;
        var ws = mask[p], wt = mask[p + 1], wh = mask[p + 2];
        if (ws + wt + wh < 6) continue;
        var v = Math.max(photo[p], photo[p + 1], photo[p + 2]) / 255;
        shade[i] = v;
        list.push(i);
        var r = ws >= wt && ws >= wh ? 0 : (wt >= wh ? 1 : 2);
        if ((ws > 200 || wt > 200 || wh > 200) && (i % 3 === 0)) hist[r].push(v);
      }
      // 部位ごとに陰影の中央値を 1 に揃える（＝選んだ色がそのまま出る明るさ）
      var median = hist.map(function (arr) {
        if (!arr.length) return 0.6;
        arr.sort(function (a, b) { return a - b; });
        return arr[Math.floor(arr.length * 0.55)] || 0.6;
      });
      return { w: w, h: h, photo: photo, mask: mask, shade: shade, list: Int32Array.from(list), median: median };
    });
    cache[key].catch(function () { delete cache[key]; });
    return cache[key];
  }

  /* ---------------------------------------------------------- textures */

  function hexToRgb(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return [128, 128, 128];
    var v = parseInt(m[1], 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }

  function lum(rgb) { return (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255; }

  function autoPattern(rgb) {
    var dark = lum(rgb) < 0.5;
    return rgb.map(function (c) { return Math.round(dark ? c + (235 - c) * 0.55 : c * 0.45); });
  }

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function finish(c) {
    var data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    return { w: c.width, h: c.height, data: data };
  }

  function rgba(rgb, a) { return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + (a == null ? 1 : a) + ')'; }

  // 生地の織り目（ごく弱いノイズ）
  function weave(ctx, w, h, rgb, amount) {
    var img = ctx.getImageData(0, 0, w, h);
    var d = img.data;
    var seed = 7;
    for (var i = 0; i < d.length; i += 4) {
      seed = (seed * 9301 + 49297) % 233280;
      var x = (i / 4) % w, y = Math.floor(i / 4 / w);
      var k = ((seed / 233280) - 0.5) * amount + (((x + y) % 4) < 2 ? amount * 0.25 : -amount * 0.25);
      d[i] = Math.max(0, Math.min(255, d[i] + k * 255));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + k * 255));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + k * 255));
    }
    ctx.putImageData(img, 0, 0);
  }

  /*
   * 色と柄からタイルを作る。寸法は写真上のピクセル（横 768px で約 6.5px/cm）。
   * part: 'suit' | 'tie' | 'shirt'
   */
  function patternTexture(item, part) {
    var base = hexToRgb(item.color);
    var pc = item.patternColor && /^#?[0-9a-f]{6}$/i.test(item.patternColor) ? hexToRgb(item.patternColor) : autoPattern(base);
    var kind = item.pattern || 'solid';
    var size = {
      suit: { solid: 16, pinstripe: 9, chalkstripe: 14, check: 52, glen: 36, herringbone: 8, birdseye: 4 },
      tie: { solid: 12, pinstripe: 16, birdseye: 8, check: 14 },
      shirt: { solid: 12, stripe: 6, london: 8, gingham: 8, check: 14 }
    }[part][kind] || 12;
    var c = makeCanvas(size, size);
    var ctx = c.getContext('2d');
    ctx.fillStyle = rgba(base);
    ctx.fillRect(0, 0, size, size);
    weave(ctx, size, size, base, part === 'shirt' ? 0.015 : 0.035);
    ctx.fillStyle = rgba(pc, 0.85);
    var s = size;
    switch (part + ':' + kind) {
      case 'suit:pinstripe': ctx.fillStyle = rgba(pc, 0.5); ctx.fillRect(Math.floor(s / 2), 0, 1, s); break;
      case 'suit:chalkstripe': ctx.fillStyle = rgba(pc, 0.28); ctx.fillRect(Math.floor(s / 2) - 1, 0, 3, s); ctx.fillStyle = rgba(pc, 0.3); ctx.fillRect(Math.floor(s / 2), 0, 1, s); break;
      case 'suit:check': ctx.fillStyle = rgba(pc, 0.55); ctx.fillRect(Math.floor(s / 2), 0, 1, s); ctx.fillRect(0, Math.floor(s / 2), s, 1); break;
      case 'suit:glen':
        ctx.fillStyle = rgba(pc, 0.35);
        for (var i = 0; i < s / 2; i += 2) { ctx.fillRect(i, 0, 1, s / 2); ctx.fillRect(s / 2, s / 2 + i, s / 2, 1); }
        ctx.fillStyle = rgba(pc, 0.18);
        for (var j = 0; j < s / 2; j += 3) { ctx.fillRect(s / 2 + j, 0, 1, s / 2); ctx.fillRect(0, s / 2 + j, s / 2, 1); }
        break;
      case 'suit:herringbone':
        ctx.fillStyle = rgba(pc, 0.22);
        for (var y = 0; y < s; y++) { ctx.fillRect(y % (s / 2) < s / 4 ? y % (s / 4) : s / 4 - y % (s / 4), y, 1, 1); ctx.fillRect(s / 2 + (y % (s / 4)), y, 1, 1); }
        break;
      case 'suit:birdseye': ctx.fillStyle = rgba(pc, 0.4); ctx.fillRect(1, 1, 1, 1); ctx.fillRect(3, 3, 1, 1); break;
      case 'tie:pinstripe': // レジメンタル（斜めストライプ）
        ctx.fillStyle = rgba(pc, 0.9);
        for (var t = -s; t < s * 2; t++) { ctx.fillRect(t, t, 4, 1); }
        break;
      case 'tie:birdseye': ctx.beginPath(); ctx.arc(s / 2, s / 2, 1.3, 0, Math.PI * 2); ctx.fill(); break;
      case 'tie:check': ctx.fillStyle = rgba(pc, 0.5); ctx.fillRect(0, s / 2, s, 2); ctx.fillRect(s / 2, 0, 2, s); break;
      case 'shirt:stripe': ctx.fillStyle = rgba(pc, 0.8); ctx.fillRect(0, 0, 1, s); break;
      case 'shirt:london': ctx.fillStyle = rgba(pc, 0.75); ctx.fillRect(0, 0, s / 2, s); break;
      case 'shirt:gingham':
        ctx.fillStyle = rgba(pc, 0.45); ctx.fillRect(0, 0, s / 2, s); ctx.fillRect(0, 0, s, s / 2);
        break;
      case 'shirt:check': ctx.fillStyle = rgba(pc, 0.6); ctx.fillRect(0, s / 2, s, 1); ctx.fillRect(s / 2, 0, 1, s); break;
      default: break;
    }
    return finish(c);
  }

  // 正方形タイルの単純なぼかし（端は内側だけで平均する）
  function boxBlur(d, size, r) {
    var out = new Float32Array(d.length);
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        var sum = [0, 0, 0], cnt = 0;
        for (var yy = Math.max(0, y - r); yy <= Math.min(size - 1, y + r); yy++) {
          for (var xx = Math.max(0, x - r); xx <= Math.min(size - 1, x + r); xx++) {
            var q = (yy * size + xx) * 4;
            sum[0] += d[q]; sum[1] += d[q + 1]; sum[2] += d[q + 2]; cnt++;
          }
        }
        var p = (y * size + x) * 4;
        out[p] = sum[0] / cnt; out[p + 1] = sum[1] / cnt; out[p + 2] = sum[2] / cnt;
      }
    }
    return out;
  }

  /*
   * 商品写真の中から「生地だけが写っている」場所を探す。
   * 中央付近をいくつか試し、色ムラ（折り目・縁）が少なく、背景の木の色でない場所を選ぶ。
   */
  function findFlatSpot(img, iw, ih, side) {
    var S = 96;
    var c = makeCanvas(S, S);
    var ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, S, S);
    var d = ctx.getImageData(0, 0, S, S).data;
    var win = Math.max(4, Math.round(side / iw * S));
    var best = null;
    for (var gy = 0.28; gy <= 0.72; gy += 0.04) {
      for (var gx = 0.28; gx <= 0.72; gx += 0.04) {
        var x0 = Math.round(gx * S - win / 2), y0 = Math.round(gy * S - win / 2);
        var sum = [0, 0, 0], sq = 0, n = 0, orange = 0;
        for (var y = y0; y < y0 + win; y++) {
          for (var x = x0; x < x0 + win; x++) {
            var q = (y * S + x) * 4;
            var r = d[q], g = d[q + 1], b = d[q + 2];
            sum[0] += r; sum[1] += g; sum[2] += b;
            sq += r * r + g * g + b * b;
            var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
            if (r === mx && mx > 150 && (mx - mn) / mx > 0.5 && g > b) orange++; // 撮影台（明るいオレンジの木）
            n++;
          }
        }
        var mean2 = (sum[0] * sum[0] + sum[1] * sum[1] + sum[2] * sum[2]) / (n * n);
        var variance = sq / n - mean2;
        var dist = Math.abs(gx - 0.5) + Math.abs(gy - 0.5);
        var score = variance + orange / n * 20000 + dist * 400;
        if (!best || score < best.score) best = { score: score, x: x0, y: y0 };
      }
    }
    return [best.x / S * iw, best.y / S * ih];
  }

  /*
   * 写真（生地写真・商品写真・お客様の写真）からタイルを作る。
   * 中央を切り出し、大きな陰影を取り除いて（ハイパス）、継ぎ目が出ないよう鏡像で 2×2 に並べる。
   */
  function imageTexture(src, opts) {
    opts = opts || {};
    var crop = opts.crop || 0.5;
    var tile = opts.tile || 48;
    var p = typeof src === 'string' ? loadImg(src, true) : Promise.resolve(src);
    return p.then(function (img) {
      var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
      var side = Math.min(iw, ih) * crop;
      var sx = (iw - side) / 2, sy = (ih - side) / 2;
      if (opts.auto) {
        var best = findFlatSpot(img, iw, ih, side);
        sx = best[0];
        sy = best[1];
      }
      var c = makeCanvas(tile, tile);
      var ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, sx, sy, side, side, 0, 0, tile, tile);
      var data = ctx.getImageData(0, 0, tile, tile); // 外部画像で CORS が無いとここで例外 → 呼び出し側で色だけに
      var d = data.data;
      var lo = boxBlur(d, tile, Math.max(2, Math.round(tile / 6)));
      var mean = [0, 0, 0];
      for (var i = 0; i < d.length; i += 4) { mean[0] += d[i]; mean[1] += d[i + 1]; mean[2] += d[i + 2]; }
      var n = d.length / 4;
      mean = mean.map(function (v) { return v / n; });
      for (var k = 0; k < d.length; k += 4) {
        for (var ch = 0; ch < 3; ch++) d[k + ch] = Math.max(0, Math.min(255, mean[ch] + (d[k + ch] - lo[k + ch]) * 1.1));
      }
      ctx.putImageData(data, 0, 0);
      var out = makeCanvas(tile * 2, tile * 2);
      var o = out.getContext('2d');
      o.drawImage(c, 0, 0);
      o.save(); o.translate(tile * 2, 0); o.scale(-1, 1); o.drawImage(c, 0, 0); o.restore();
      o.save(); o.translate(0, tile * 2); o.scale(1, -1); o.drawImage(c, 0, 0); o.restore();
      o.save(); o.translate(tile * 2, tile * 2); o.scale(-1, -1); o.drawImage(c, 0, 0); o.restore();
      var tex = finish(out);
      tex.mean = mean.map(Math.round);
      return tex;
    });
  }

  /* ---------------------------------------------------------- compose */

  function compose(base, textures, canvas, scale) {
    scale = scale || 1; // アップの写真では柄を拡大する
    var w = base.w, h = base.h;
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    var out = ctx.createImageData(w, h);
    var o = out.data;
    o.set(base.photo);
    var photo = base.photo, mask = base.mask, shade = base.shade, list = base.list;
    var tx = REGIONS.map(function (r) { return textures[r]; });
    var med = base.median;
    for (var n = 0; n < list.length; n++) {
      var i = list[n];
      var p = i * 4;
      var x = i % w, y = (i - x) / w;
      var r = 0, g = 0, b = 0, total = 0;
      for (var k = 0; k < 3; k++) {
        var wgt = mask[p + k] / 255;
        var t = tx[k];
        if (wgt <= 0 || !t) continue;
        var q = ((Math.floor(y / scale) % t.h) * t.w + (Math.floor(x / scale) % t.w)) * 4;
        var s = shade[i] / med[k];
        // 影はそのまま掛け、明るい部分は白に寄せる（光沢）
        var hi = s > 1 ? Math.min(1, (s - 1) * 0.9) : 0;
        var m = s > 1 ? 1 : s;
        r += wgt * (t.data[q] * m + (255 - t.data[q]) * hi * 0.55);
        g += wgt * (t.data[q + 1] * m + (255 - t.data[q + 1]) * hi * 0.55);
        b += wgt * (t.data[q + 2] * m + (255 - t.data[q + 2]) * hi * 0.55);
        total += wgt;
      }
      if (total <= 0) continue;
      if (total > 1) { r /= total; g /= total; b /= total; total = 1; }
      o[p] = r + photo[p] * (1 - total);
      o[p + 1] = g + photo[p + 1] * (1 - total);
      o[p + 2] = b + photo[p + 2] * (1 - total);
    }
    ctx.putImageData(out, 0, 0);
  }

  /* ---------------------------------------------------------- cover */

  // 着せ替えた写真から、マスクの A チャンネルでマネキン（首から下）だけを切り抜く
  function cutout(base, composed) {
    var w = base.w, h = base.h;
    var src = composed.getContext('2d').getImageData(0, 0, w, h);
    var d = src.data, m = base.mask;
    var top = h, bottom = 0, left = w, right = 0;
    for (var i = 0; i < w * h; i++) {
      var a = m[i * 4 + 3];
      d[i * 4 + 3] = a;
      if (a > 0 && a < 230) { // 縁の白っぽさ（背景の名残り）を抑える
        d[i * 4] *= 0.8; d[i * 4 + 1] *= 0.8; d[i * 4 + 2] *= 0.8;
      }
      if (a > 40) {
        var x = i % w, y = (i - x) / w;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
    var c = makeCanvas(w, h);
    c.getContext('2d').putImageData(src, 0, 0);
    return { canvas: c, box: [left, top, right - left + 1, bottom - top + 1] };
  }

  var COVER_THEMES = {
    gold: { text: '#ffffff', sub: 'rgba(228,196,122,0.9)', accent: '#c9a55a', shadow: 'rgba(0,0,0,0.6)' },
    ivory: { text: '#1a1a1a', sub: 'rgba(150,112,52,0.7)', accent: '#a07c3a', shadow: 'rgba(60,40,10,0.28)' },
    night: { text: '#ffffff', sub: 'rgba(228,196,122,0.85)', accent: '#c9a55a', shadow: 'rgba(0,0,0,0.7)' }
  };

  function paintBackground(ctx, W, H, theme) {
    var g;
    if (theme === 'ivory') {
      g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#f4f0e9'); g.addColorStop(0.6, '#e5ded3'); g.addColorStop(1, '#cfc6b8');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      return;
    }
    if (theme === 'night') {
      g = ctx.createRadialGradient(W * 0.72, H * 0.18, 0, W * 0.72, H * 0.18, H * 0.95);
      g.addColorStop(0, '#22324f'); g.addColorStop(0.55, '#0b1020'); g.addColorStop(1, '#04060c');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,0.035)';
      for (var x = 0; x < W; x += 120) ctx.fillRect(x, 0, 5, H);
      return;
    }
    g = ctx.createRadialGradient(W * 0.45, H * 0.38, 0, W * 0.45, H * 0.38, H * 0.8);
    g.addColorStop(0, '#46331a'); g.addColorStop(0.5, '#17110a'); g.addColorStop(1, '#060504');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    var s = ctx.createLinearGradient(0, H * 0.1, W, H * 0.7);
    s.addColorStop(0.3, 'rgba(228,196,122,0)'); s.addColorStop(0.45, 'rgba(228,196,122,0.16)'); s.addColorStop(0.6, 'rgba(228,196,122,0)');
    ctx.fillStyle = s; ctx.fillRect(0, 0, W, H);
  }

  // 指定幅で折り返す（日本語は 1 文字単位、\n は強制改行）
  function wrapText(ctx, text, maxWidth) {
    var lines = [];
    String(text || '').split('\n').forEach(function (para) {
      var line = '';
      // 英単語はひとかたまりで、日本語は 1 文字ずつ折り返す
      (para.match(/[A-Za-z0-9&'.]+|\s+|[^A-Za-z0-9&'.\s]/g) || []).forEach(function (tok) {
        if (ctx.measureText(line + tok).width > maxWidth && line.trim()) { lines.push(line.replace(/\s+$/, '')); line = tok.replace(/^\s+/, ''); }
        else line += tok;
      });
      lines.push(line);
    });
    return lines;
  }

  function spaced(ctx, text, x, y, spacing) {
    Array.from(text).forEach(function (ch) {
      ctx.fillText(ch, x, y);
      x += ctx.measureText(ch).width + spacing;
    });
  }

  /*
   * 仕上がりの「表紙」を描く。opts:
   *   base, composed（compose 済みの canvas）, theme, eyebrow, title, en, specs: [[label, value]], logo（Image）
   */
  function drawCover(canvas, opts) {
    var W = 1080, H = 1440;
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');
    var t = COVER_THEMES[opts.theme] || COVER_THEMES.gold;
    paintBackground(ctx, W, H, opts.theme);

    // 英字のタイトル（背景側）
    ctx.fillStyle = t.sub;
    ctx.font = 'italic 400 82px "EB Garamond", serif';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(opts.en || '', 64, 380);

    // マネキン
    var cut = cutout(opts.base, opts.composed);
    var box = cut.box;
    var fh = 1040, fw = box[2] * fh / box[3];
    var fx = W * 0.4 - fw / 2, fy = H - fh - 30;
    var floor = ctx.createRadialGradient(W * 0.4, H - 34, 0, W * 0.4, H - 34, fw * 0.55);
    floor.addColorStop(0, t.shadow); floor.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save(); ctx.translate(0, H - 34); ctx.scale(1, 0.14); ctx.translate(0, -(H - 34));
    ctx.fillStyle = floor; ctx.fillRect(0, H - 34 - fw, W, fw * 2); ctx.restore();
    ctx.save();
    ctx.shadowColor = t.shadow; ctx.shadowBlur = 40; ctx.shadowOffsetY = 18;
    ctx.drawImage(cut.canvas, box[0], box[1], box[2], box[3], fx, fy, fw, fh);
    ctx.restore();

    // 小見出し・タイトル
    ctx.fillStyle = t.accent;
    ctx.font = 'italic 400 30px "EB Garamond", serif';
    spaced(ctx, opts.eyebrow || '', 64, 92, 5);
    ctx.fillStyle = t.text;
    var size = 66;
    ctx.font = '700 ' + size + 'px "Shippori Mincho", serif';
    var lines = wrapText(ctx, opts.title, W - 128);
    while (lines.length > 3 && size > 44) {
      size -= 4;
      ctx.font = '700 ' + size + 'px "Shippori Mincho", serif';
      lines = wrapText(ctx, opts.title, W - 128);
    }
    lines.slice(0, 3).forEach(function (line, i) { ctx.fillText(line, 64, 176 + i * size * 1.3); });

    // 仕様
    var sx = 760, sw = 270, sy = 900;
    ctx.fillStyle = t.accent;
    ctx.fillRect(sx, sy, sw, 2);
    sy += 50;
    (opts.specs || []).forEach(function (row) {
      ctx.fillStyle = t.accent;
      ctx.font = '500 22px "EB Garamond", serif';
      spaced(ctx, row[0], sx, sy, 5);
      sy += 38;
      ctx.fillStyle = t.text;
      ctx.font = '500 26px "Shippori Mincho", serif';
      wrapText(ctx, row[1], sw).slice(0, 2).forEach(function (line) { ctx.fillText(line, sx, sy); sy += 38; });
      sy += 16;
    });

    // ロゴ
    if (opts.logo && opts.logo.naturalWidth) ctx.drawImage(opts.logo, 770, H - 130, 84, 84 * opts.logo.naturalHeight / opts.logo.naturalWidth);
    ctx.fillStyle = t.text;
    ctx.font = '500 44px "EB Garamond", serif';
    spaced(ctx, 'ROtailor', 872, H - 82, 4);
    ctx.fillStyle = t.accent;
    ctx.font = '400 17px "EB Garamond", serif';
    spaced(ctx, 'ORDER SUIT', 874, H - 52, 9);
  }

  window.RoTailorPhoto = {
    drawCover: drawCover,
    loadBase: loadBase,
    patternTexture: patternTexture,
    imageTexture: imageTexture,
    compose: compose
  };
})();
