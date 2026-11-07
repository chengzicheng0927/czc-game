/* 软陶人物：保留脚底锚点与分层衣橱接口；只读取外观，不读取或写入衣物所有权。 */
(function (G) {
  'use strict';
  const TAU = Math.PI * 2, ink = '#66505A';
  const bounds = Object.freeze({ left: -64, top: -204, width: 128, height: 212 });
  const sprites = new Map(), maxSprites = 24;
  function tint(color, amount) {
    if (!/^#[a-f\d]{6}$/i.test(color)) return color;
    const rgb = color.slice(1).match(/../g).map(value => Math.max(0, Math.min(255, parseInt(value, 16) + amount)));
    return '#' + rgb.map(value => Math.round(value).toString(16).padStart(2, '0')).join('');
  }
  // 左上柔光、右下同色阴影；透明图案仍用纯色，避免把透明度变成硬边。
  function material(c, x, y, rx, ry, color) {
    if (!/^#[a-f\d]{6}$/i.test(color) || !c.createRadialGradient) return color;
    const g = c.createRadialGradient(x - rx * .38, y - ry * .45, 0, x - rx * .1, y - ry * .15, Math.max(rx, ry) * 1.3);
    g.addColorStop(0, tint(color, 20)); g.addColorStop(.48, color); g.addColorStop(1, tint(color, -25)); return g;
  }
  function finish(c, color, edge) {
    c.fillStyle = color; c.fill();
    if (edge) { c.strokeStyle = typeof color === 'string' && /^#[a-f\d]{6}$/i.test(color) ? tint(color, -25) : edge; c.lineWidth = .65; c.stroke(); }
  }
  function ellipse(c, x, y, rx, ry, color, edge) {
    c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); finish(c, material(c, x, y, rx, ry, color), edge ? tint(color, -25) : null);
  }
  function box(c, x, y, w, h, radius, color, edge) {
    c.beginPath(); c.roundRect(x, y, w, h, radius); finish(c, material(c, x + w / 2, y + h / 2, w / 2, h / 2, color), edge ? tint(color, -25) : null);
  }
  function line(c, points, color, width) { c.beginPath(); points.forEach((point, i) => i ? c.lineTo(...point) : c.moveTo(...point)); c.strokeStyle = color; c.lineWidth = width || 1.2; c.stroke(); }
  function poly(c, points, color, edge) {
    c.beginPath(); points.forEach((point, i) => i ? c.lineTo(...point) : c.moveTo(...point)); c.closePath();
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]), l = Math.min(...xs), t = Math.min(...ys), w = Math.max(...xs) - l, h = Math.max(...ys) - t;
    finish(c, material(c, l + w / 2, t + h / 2, w / 2, h / 2, color), edge ? tint(color, -25) : null);
  }
  function curve(c, start, commands, color, edge) {
    c.beginPath(); c.moveTo(...start); commands.forEach(command => c.bezierCurveTo(...command)); c.closePath(); finish(c, color, edge);
  }
  function star(c, x, y, size, color) { const points = []; for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, r = size * (i % 2 ? .45 : 1); points.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); } poly(c, points, color); }
  function bow(c, x, y, size, color, accent) {
    for (const side of [-1, 1]) {
      c.save(); c.translate(x, y); c.scale(side, 1);
      curve(c, [0, 0], [[size * .7, -size * .8, size * 1.45, -size * .7, size * 1.05, size * .35], [size * .8, size * .8, size * .35, size * .3, 0, 0]], material(c, size * .6, 0, size, size, color), tint(color, -25));
      line(c, [[size * .2, 0], [size * .58, -size * .12]], tint(color, -18), .7); c.restore();
    }
    ellipse(c, x, y, size * .22, size * .32, accent || tint(color, 12), ink);
  }
  function flower(c, x, y, size, color, center) { for (let i = 0; i < 5; i++) { const a = i * TAU / 5; ellipse(c, x + Math.cos(a) * size * .58, y + Math.sin(a) * size * .58, size * .45, size * .45, color); } ellipse(c, x, y, size * .32, size * .32, center || '#DAB573'); }
  function motif(c, item, y, width) {
    const accent = item.accent, pattern = item.pattern;
    if (pattern === 'star' || pattern === 'moon') { star(c, 0, y, 7, accent); if (pattern === 'moon') ellipse(c, 3, y - 2, 5, 5, item.color); }
    else if (pattern === 'bow') bow(c, 0, y, 8, accent, item.color);
    else if (pattern === 'flower' || pattern === 'petals') { flower(c, -9, y, 5, accent); flower(c, 9, y + 9, 4, accent); }
    else if (pattern === 'cloud') { ellipse(c, -5, y, 6, 4, accent); ellipse(c, 0, y - 3, 6, 6, accent); ellipse(c, 6, y, 6, 4, accent); }
    else if (pattern === 'berry') { ellipse(c, 0, y + 2, 5, 7, '#C98095'); poly(c, [[-5, y - 3], [0, y - 6], [5, y - 3]], '#94AF92'); }
    else if (pattern === 'bear') { ellipse(c, -6, y - 5, 3, 3, accent); ellipse(c, 6, y - 5, 3, 3, accent); ellipse(c, 0, y, 8, 7, accent); ellipse(c, -3, y, 1, 1.5, ink); ellipse(c, 3, y, 1, 1.5, ink); }
    else if (pattern === 'stripe' || pattern === 'plaid' || pattern === 'knit') {
      for (let row = 0; row < 3; row++) line(c, [[-width / 2, y - 7 + row * 7], [width / 2, y - 7 + row * 7]], accent, pattern === 'stripe' ? 2.5 : 1);
      if (pattern !== 'stripe') for (let x = -width / 2 + 3; x < width / 2; x += 8) line(c, [[x, y - 9], [x, y + 10]], accent, pattern === 'knit' ? 2 : 1);
    } else if (pattern === 'dot' || pattern === 'scales') {
      for (let i = 0; i < 6; i++) { const x = (i % 3 - 1) * 10, yy = y - 5 + Math.floor(i / 3) * 11; if (pattern === 'scales') { c.beginPath(); c.arc(x, yy, 5, 0, Math.PI); c.strokeStyle = accent; c.lineWidth = 1; c.stroke(); } else ellipse(c, x, yy, 1.8, 1.8, accent); }
    } else if (pattern === 'pocket') { box(c, -10, y - 4, 20, 14, 5, accent, ink); line(c, [[-7, y - 1], [7, y - 1]], item.color); }
    else if (pattern === 'buttons') for (let i = 0; i < 3; i++) ellipse(c, 0, y - 6 + i * 8, 1.7, 1.7, accent, ink);
    else if (pattern === 'lace' || pattern === 'fur') for (let x = -width / 2; x <= width / 2; x += 5) ellipse(c, x, y + 6, 3.3, pattern === 'fur' ? 4 : 2.5, accent);
  }
  const EGGY_BODY_BY_HAIR = {
    twin_tails: '#FF9EBB', ponytail: '#FFE169', buns: '#FFC2D1', curls: '#CDB4DB',
    princess_braid: '#A2D2FF', pigtail_braid: '#A2D2FF', bob: '#A8E6CF', short: '#FFBE98',
    side_swept: '#FDE2E4', long_straight: '#FDE2E4'
  };
  const EGGY_BODY_BY_COLOR = {
    '#D998AE': '#FF9EBB', '#F2D8A6': '#FFE169', '#E5C4B1': '#FFC2D1', '#B497CC': '#CDB4DB',
    '#859DC6': '#A2D2FF', '#8EBBA8': '#A8E6CF', '#C77362': '#FFBE98', '#BDB9CE': '#FDE2E4',
    '#D8B77A': '#FFD97D', '#B77D50': '#F7B299', '#8B5A3C': '#FFAEC9', '#3D3545': '#B8C0FF'
  };
  const PRESET_DEFAULT_COLOR = {
    twin_tails: '#8B5A3C', ponytail: '#3D3545', buns: '#D8B77A', curls: '#B77D50',
    princess_braid: '#3D3545', bob: '#8EBBA8', short: '#C77362', side_swept: '#B497CC'
  };
  function eggyBodyColor(hair, hairColor) {
    const upper = String(hairColor || '').toUpperCase();
    if (PRESET_DEFAULT_COLOR[hair] === upper && EGGY_BODY_BY_HAIR[hair]) return EGGY_BODY_BY_HAIR[hair];
    return EGGY_BODY_BY_COLOR[upper] || EGGY_BODY_BY_HAIR[hair] || '#FF9EBB';
  }
  function hairBack(c, avatar) {
    const rawColor = avatar.hairColor, bodyColor = eggyBodyColor(avatar.hair, rawColor), hair = avatar.hair;
    // 顶部Q弹萌耳/揪揪底座与区分发色的小发饰标记
    ellipse(c, 0, -144, 18, 8, bodyColor);
    ellipse(c, 0, -145, 4, 2, rawColor);
    if (hair === 'long_straight') {
      for (const side of [-1, 1]) {
        ellipse(c, side * 35, -132, 13, 13, '#FFFDF9', ink);
        ellipse(c, side * 40, -122, 9, 9, '#FFE5EC', ink);
        ellipse(c, side * 37, -110, 10, 10, '#FFFDF9', ink);
      }
    } else if (hair === 'twin_tails') {
      box(c, -3.5, -162, 7, 16, 3.5, bodyColor, ink);
      ellipse(c, 0, -166, 9.5, 9, bodyColor, ink);
    } else if (hair === 'ponytail') {
      box(c, -4, -164, 8, 18, 4, bodyColor, ink);
      ellipse(c, 0, -168, 10.5, 10, bodyColor, ink);
      ellipse(c, 0, -148, 8, 3.5, '#FFFDF5', ink);
    } else if (hair === 'buns') {
      for (const side of [-1, 1]) {
        c.save(); c.translate(side * 18, -146); c.rotate(side * -.15);
        ellipse(c, 0, -16, 9.5, 21, bodyColor, ink);
        ellipse(c, 0, -15, 5.5, 14, '#FFF0F5');
        c.restore();
      }
    } else if (hair === 'curls') {
      for (const side of [-1, 1]) {
        ellipse(c, side * 28, -142, 12.5, 12.5, bodyColor, ink);
        ellipse(c, side * 28, -142, 7, 7, '#FAF5FF');
      }
    } else if (hair === 'princess_braid' || hair === 'pigtail_braid') {
      for (const side of [-1, 1]) {
        ellipse(c, side * 29, -140, 13.5, 13.5, '#FFFFFF', ink);
        ellipse(c, side * 23, -133, 6, 4, '#FF759F');
        if (hair === 'pigtail_braid') ellipse(c, side * 36, -128, 9, 9, '#FFFFFF', ink);
      }
    } else if (hair === 'bob') {
      for (const side of [-1, 1]) {
        poly(c, [[side * 15, -144], [side * 28, -165], [side * 36, -136]], bodyColor, ink);
        poly(c, [[side * 19, -143], [side * 27, -158], [side * 32, -139]], '#FF9EBB');
      }
    } else if (hair === 'short') {
      for (const side of [-1, 1]) {
        ellipse(c, side * 25, -147, 9.5, 15.5, bodyColor, ink);
        ellipse(c, side * 25, -146, 5, 9.5, '#FFFDF7');
      }
    } else if (hair === 'side_swept') {
      for (const side of [-1, 1]) {
        ellipse(c, side * 34, -132, 13, 13, '#FFFDF9', ink);
        ellipse(c, side * 40, -124, 8.5, 8.5, '#FFE5EC', ink);
      }
    }
  }
  function hairFront(c, avatar) {
    const rawColor = avatar.hairColor, bodyColor = eggyBodyColor(avatar.hair, rawColor), hair = avatar.hair;
    // 额头顶部轻巧Q弹装饰，绝不遮挡圆滚滚脸蛋窗
    if (hair === 'twin_tails') {
      bow(c, 0, -147, 8.5, '#FF4D79', '#FFFDF5');
    } else if (hair === 'ponytail') {
      ellipse(c, -3, -170, 3, 2, '#FFFFFF');
    } else if (hair === 'buns') {
      ellipse(c, 0, -146, 7, 4, '#FF85A1');
    } else if (hair === 'curls') {
      ellipse(c, 0, -147, 7.5, 5, '#FFAFCC', ink);
    } else if (hair === 'princess_braid' || hair === 'pigtail_braid') {
      ellipse(c, -6, -147, 6, 4.5, '#FFFFFF');
      ellipse(c, 6, -147, 6, 4.5, '#FFFFFF');
      ellipse(c, 0, -149, 7, 5.5, '#FFFFFF');
      if (hair === 'pigtail_braid') star(c, 0, -148, 4.5, '#FFD166');
    } else if (hair === 'bob') {
      ellipse(c, 0, -148, 6, 4, bodyColor, ink);
    } else if (hair === 'short') {
      for (const side of [-1, 1]) ellipse(c, side * 10, -126, 3.8, 2.3, '#FFFFFF');
    } else if (hair === 'side_swept') {
      ellipse(c, 0, -147, 10, 6.5, '#FFFDF9', ink);
    } else {
      ellipse(c, 0, -148, 11, 7, '#FFFDF9', ink);
    }
  }
  function top(c, item) {
    const color = item.color, accent = item.accent;
    // 圆肚肚上半贴片与立体领口，不破坏圆润蛋体轮廓
    ellipse(c, 0, -64, 28, 20, color, ink);
    if (item.shape === 'sailor') {
      poly(c, [[-16, -79], [0, -67], [16, -79]], accent);
      ellipse(c, 0, -72, 4, 5.5, '#FF4D79');
    } else if (item.shape === 'hoodie') {
      ellipse(c, -8, -79, 6, 3.5, accent);
      ellipse(c, 8, -79, 6, 3.5, accent);
    } else if (item.shape === 'cape') {
      poly(c, [[0, -82], [-26, -54], [0, -58], [26, -54]], color, ink);
    } else {
      ellipse(c, -7, -79, 6.5, 4, accent);
      ellipse(c, 7, -79, 6.5, 4, accent);
      ellipse(c, 0, -79, 3.5, 3.5, '#FFFDF5');
    }
    if (['coat', 'cardigan'].includes(item.shape)) line(c, [[0, -76], [0, -48]], accent, 2);
    motif(c, item, -64, 28);
  }
  function bottom(c, item) {
    const color = item.color, accent = item.accent;
    if (['shorts', 'bloomers', 'wide', 'trousers', 'overalls'].includes(item.shape)) {
      const w = item.shape === 'wide' ? 16 : item.shape === 'bloomers' ? 18 : 14;
      ellipse(c, 0, -47, 27, 12, color, ink);
      box(c, -20, -45, w, 14, 6, color, ink);
      box(c, 20 - w, -45, w, 14, 6, color, ink);
      if (item.shape === 'overalls') {
        box(c, -13, -74, 26, 29, 8, color, ink);
        line(c, [[-10, -73], [-14, -81]], color, 4);
        line(c, [[10, -73], [14, -81]], color, 4);
        ellipse(c, -8, -69, 2.2, 2.2, accent);
        ellipse(c, 8, -69, 2.2, 2.2, accent);
      }
      if (item.pattern === 'star') { star(c, -10, -42, 4, accent); star(c, 10, -41, 3.5, accent); }
      if (item.pattern === 'dot') for (const side of [-1, 1]) ellipse(c, side * 11, -43, 2, 2, accent);
      if (item.pattern === 'stripe') for (const side of [-1, 1]) line(c, [[side * 11, -48], [side * 11, -35]], accent, 2);
    } else {
      const hem = item.shape === 'tutu' ? 30 : 27;
      ellipse(c, 0, -46, hem, 13, color, ink);
      if (item.shape === 'pleated') for (let x = -18; x <= 18; x += 9) line(c, [[x * .8, -52], [x, -36]], accent, 1.5);
      if (item.shape === 'tiered' || item.shape === 'tutu') line(c, [[-22, -43], [22, -43]], accent, 2.5);
      motif(c, item, -46, 28);
    }
  }
  function dress(c, item) {
    const shape = item.shape, color = item.color, accent = item.accent;
    const rx = ['princess', 'tutu', 'rainbow'].includes(shape) ? 31 : 29;
    // 圆润Q弹肚皮裙贴片 + 精致领口蝴蝶结/徽章
    ellipse(c, 0, -58, rx, 24, color, ink);
    ellipse(c, 0, -40, rx - 2, 8, accent);
    if (item.id === 'dress_pink') {
      bow(c, 0, -78, 7.5, '#FF4D79', accent);
    } else if (shape === 'rainbow') {
      ['#EAA7BE', '#EBC691', '#ECDD9C', '#BAD1B3', '#AFCBD9', '#C3B5D5'].forEach((band, i) => ellipse(c, -15 + i * 6, -44, 4, 6, band));
    } else if (shape === 'sailor') {
      poly(c, [[-16, -79], [0, -66], [16, -79]], accent);
    } else if (shape === 'pinafore') {
      box(c, -12, -74, 24, 26, 8, accent);
    } else {
      bow(c, 0, -78, 7, accent, color);
    }
    if (shape === 'winter') for (let x = -20; x <= 20; x += 8) ellipse(c, x, -38, 4.5, 3.5, accent);
    motif(c, item, -58, 26);
  }
  function shoes(c, item) {
    for (const side of [-1, 1]) {
      const x = side * 18;
      if (item.shape === 'boots' || item.shape === 'rainboots') box(c, x - 9, -22, 18, 16, 6, item.color, ink);
      ellipse(c, x, -4, 13.5, 5, '#FFFFFF', ink);
      ellipse(c, x, -8.5, 13, 8, item.color, ink);
      if (item.shape === 'mary') {
        line(c, [[x - 8, -10.5], [x + 8, -10.5]], item.accent, 2.6);
        ellipse(c, x + side * 5.5, -10.5, 1.8, 1.8, '#FFF0D7');
        if (item.pattern === 'star') star(c, x, -7, 3, item.accent);
      } else if (item.shape === 'sandals') {
        line(c, [[x - 6, -9], [x + 5, -4]], item.accent, 2.5);
      } else if (item.shape === 'ballet') {
        bow(c, x, -11, 3.2, item.accent);
      } else if (item.shape === 'fluffy') {
        for (let i = -1; i <= 1; i++) ellipse(c, x + i * 5, -12, 4, 3.5, item.accent);
      } else if (item.shape === 'sneaker') {
        for (let i = 0; i < 2; i++) line(c, [[x - 4, -10 + i * 2.5], [x + 4, -10 + i * 2.5]], item.accent, 1.6);
      } else {
        line(c, [[x - 8, -10], [x + 8, -10]], item.accent, 2.4);
      }
    }
  }
  function accessory(c, item, avatar) {
    const color = item.color, accent = item.accent;
    if (item.shape === 'bow') bow(c, avatar.hair === 'princess_braid' ? 22 : -20, -146, 9, color, accent);
    if (item.shape === 'flower') flower(c, -21, -142, 8.5, color, accent);
    if (item.shape === 'stars') { star(c, -22, -140, 6.5, color); star(c, -14, -147, 4.5, accent); }
    if (item.shape === 'crown') {
      poly(c, [[-14, -148], [-17, -163], [-6, -155], [0, -167], [6, -155], [17, -163], [14, -148]], color, ink);
      for (const x of [-9, 0, 9]) ellipse(c, x, -152, 2, 2, accent);
    }
    if (item.shape === 'beret') { ellipse(c, -2, -150, 26, 8.5, color, ink); box(c, -20, -151, 38, 4.5, 2, accent, ink); }
    if (item.shape === 'straw') { ellipse(c, 0, -147, 34, 6.5, color, ink); box(c, -19, -163, 38, 17, 9, color, ink); line(c, [[-19, -149], [19, -149]], accent, 4); }
    if (item.shape === 'bunny') {
      for (const side of [-1, 1]) {
        c.save(); c.translate(side * 14, -154); c.rotate(side * .18);
        ellipse(c, 0, -12, 6.5, 18, color, ink); ellipse(c, 0, -12, 3, 12, accent);
        c.restore();
      }
    }
    if (item.shape === 'moon') { star(c, -15, -149, 8.5, accent); ellipse(c, -11, -152, 6, 6, color); }
    if (item.shape === 'glasses' || item.shape === 'heartglasses') {
      for (const side of [-1, 1]) {
        c.strokeStyle = color; c.lineWidth = 2.2; c.beginPath();
        if (item.shape === 'heartglasses') {
          c.moveTo(side * 13, -104);
          c.bezierCurveTo(side * 13 - 15, -114, side * 13 - 6, -124, side * 13, -117);
          c.bezierCurveTo(side * 13 + 6, -124, side * 13 + 15, -114, side * 13, -104);
        } else c.ellipse(side * 13, -112, 9.5, 8, 0, 0, TAU);
        c.stroke();
      }
      line(c, [[-3.5, -112], [3.5, -112]], color, 2);
    }
    if (item.shape === 'stickers') { star(c, -22, -103, 4, color); star(c, 22, -103, 4, accent); }
    if (item.shape === 'wings' || item.shape === 'fairy') {
      for (const side of [-1, 1]) {
        c.save(); c.translate(side * 34, -84); c.rotate(side * -.32);
        ellipse(c, side * 12, -6, 18, item.shape === 'fairy' ? 22 : 12, color, ink);
        ellipse(c, side * 9, 8, 13, 9.5, accent, ink);
        c.restore();
      }
    }
    if (['berrybag', 'basket', 'teddybag'].includes(item.shape)) {
      line(c, [[-20, -78], [32, -48]], color, 2.6);
      ellipse(c, 34, -46, 10.5, 10, color, ink);
      ellipse(c, 34, -54, 5.5, 3, accent);
    }
  }
  function face(c, avatar) {
    const type = avatar.face, eyeY = type === 'shy' ? -111 : -113;
    for (const side of [-1, 1]) {
      const x = side * 12.5;
      if (type === 'cheer' || (type === 'wink' && side === 1)) {
        c.beginPath(); c.moveTo(x - 4.5, eyeY + 1); c.quadraticCurveTo(x, eyeY - 5, x + 4.5, eyeY + 1); c.strokeStyle = '#362028'; c.lineWidth = 2.4; c.stroke();
      } else {
        ellipse(c, x, eyeY, type === 'surprise' ? 4.8 : 4.2, type === 'surprise' ? 6.0 : 5.4, '#362028');
        ellipse(c, x - 1.4, eyeY - 1.8, 1.6, 1.8, '#FFFFFF');
        ellipse(c, x + 1.2, eyeY + 1.6, .8, .8, '#FFFFFF');
      }
      ellipse(c, side * 21, -103, type === 'shy' ? 7.2 : 5.8, 3.2, '#FF7597');
    }
    if (type === 'surprise' || type === 'calm') {
      ellipse(c, 0, -102, type === 'surprise' ? 3.4 : 2.0, type === 'surprise' ? 3.8 : 2.0, '#E85D75');
    } else {
      c.beginPath();
      c.moveTo(-4.2, -103); c.quadraticCurveTo(-2.1, -99.5, 0, -102.5); c.quadraticCurveTo(2.1, -99.5, 4.2, -103);
      c.strokeStyle = '#D9536F'; c.lineWidth = 1.8; c.stroke();
    }
  }
  function look(source) {
    const given = source && source.avatar ? source.avatar : source || G.state && G.state.avatar;
    const avatar = G.data.defaultAvatar();
    if (given) ['skin', 'hair', 'hairColor', 'face', 'top', 'bottom', 'dress', 'shoes', 'acc'].forEach(field => { if (given[field] !== undefined) avatar[field] = given[field]; });
    if (!G.data.avatarSkins[avatar.skin]) avatar.skin = 0;
    if (!G.data.avatarHairStyles.some(item => item.id === avatar.hair)) avatar.hair = 'twin_tails';
    if (!/^#[a-f\d]{6}$/i.test(avatar.hairColor)) avatar.hairColor = '#8B5A3C';
    return avatar;
  }
  function paint(c, avatar) {
    const byId = G.data.outfitById, skin = G.data.avatarSkins[avatar.skin].color;
    const bodyColor = eggyBodyColor(avatar.hair, avatar.hairColor);
    const accessories = (Array.isArray(avatar.acc) ? avatar.acc : [avatar.acc]).map(id => byId[id]).filter(Boolean);
    c.lineCap = 'round'; c.lineJoin = 'round';
    ellipse(c, 0, 2, 34, 4.5, '#D8B4C838'); ellipse(c, 0, 2, 22, 2.8, '#D8B4C824');
    accessories.filter(item => item.slot === 'back').forEach(item => accessory(c, item, avatar));
    hairBack(c, avatar);
    // 圆滚滚一头身蛋型机身与左右Q弹小短手
    for (const side of [-1, 1]) {
      c.save(); c.translate(side * 42, -78); c.rotate(side * -.25);
      ellipse(c, 0, 0, 8.5, 15, bodyColor, ink);
      ellipse(c, side * 1.5, 11, 7, 7, skin, ink);
      c.restore();
    }
    ellipse(c, 0, -86, 44, 56, bodyColor, ink);
    ellipse(c, 0, -64, 45, 36, bodyColor, ink);
    // 奶油白嫩脸蛋窗（严格保留 [0, -120, 29.5, 30.5] 的肤色主椭圆测试契约）
    ellipse(c, 0, -120, 29.5, 30.5, skin, ink);
    ellipse(c, 0, -108, 33, 24, skin, ink);
    ellipse(c, -9, -126, 10, 4.5, '#FFF9E528');
    if (byId[avatar.dress]) dress(c, byId[avatar.dress]);
    else {
      const shirt = byId[avatar.top], trousers = byId[avatar.bottom];
      if (trousers && trousers.shape === 'overalls') { if (shirt) top(c, shirt); bottom(c, trousers); }
      else { if (trousers) bottom(c, trousers); if (shirt) top(c, shirt); }
    }
    if (byId[avatar.shoes]) shoes(c, byId[avatar.shoes]);
    hairFront(c, avatar); face(c, avatar);
    accessories.filter(item => item.slot !== 'back').forEach(item => accessory(c, item, avatar));
  }
  function sprite(avatar) {
    const key = JSON.stringify(['skin', 'hair', 'hairColor', 'face', 'top', 'bottom', 'dress', 'shoes', 'acc'].map(field => avatar[field]));
    if (sprites.has(key)) { const hit = sprites.get(key); sprites.delete(key); sprites.set(key, hit); return hit; }
    const canvas = typeof window.OffscreenCanvas === 'function' ? new window.OffscreenCanvas(bounds.width * 2, bounds.height * 2) : null;
    if (!canvas) return null;
    const context = canvas.getContext('2d'); if (!context) return null;
    context.scale(2, 2); context.translate(-bounds.left, -bounds.top); paint(context, avatar);
    sprites.set(key, canvas); if (sprites.size > maxSprites) sprites.delete(sprites.keys().next().value); return canvas;
  }
  function draw(c, source, x, bottomY, scale, options) {
    const avatar = look(source), opts = options || {}, size = Number.isFinite(scale) && scale > 0 ? scale : 1;
    const t = opts.time || 0, hop = !opts.still && opts.waddle ? Math.abs(Math.sin(t * 7.8)) * 3.2 : 0;
    const bob = opts.still ? 0 : Math.sin(t * 2.2) * 1.3 - hop, facing = opts.facing === -1 || opts.facing === 'left' ? -1 : 1;
    c.save(); c.translate(x, bottomY + bob); c.scale(size * facing, size);
    if (!opts.still && (opts.waddle || opts.cheer)) {
      const sway = opts.waddle ? Math.sin(t * 7.8) * .085 : Math.sin(t * 4.6) * .045;
      const squash = opts.waddle ? Math.sin(t * 15.6) * .038 : Math.sin(t * 9.2) * .022;
      if (c.rotate) c.rotate(sway);
      if (c.scale) c.scale(1 - squash * .8, 1 + squash);
    }
    // 缓存纯外观栅格，移动/朝向/呼吸只改变变换；离屏不可用时仍直接绘制。
    const image = !opts.direct && c.drawImage ? sprite(avatar) : null;
    if (image) c.drawImage(image, bounds.left, bounds.top, bounds.width, bounds.height); else paint(c, avatar);
    c.restore();
  }
  function thumbnail(canvas, avatar, options) {
    if (!canvas) return; const opts = options || {}, rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
    const width = rect && rect.width || opts.width || 180, height = rect && rect.height || opts.height || 220, dpr = Math.min(2, window.devicePixelRatio || 1), c = canvas.getContext('2d'); if (!c) return;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, width, height);
    const resolved = look(avatar), highHat = (Array.isArray(resolved.acc) ? resolved.acc : [resolved.acc]).some(id => ['acc_bunny', 'acc_crown', 'acc_straw'].includes(id));
    const top = highHat ? bounds.top : -168, size = Math.max(.1, Math.min((width - 16) / 112, (height - 16) / (-top + 8)));
    const bottom = (height - (-top + 6) * size) / 2 + -top * size;
    draw(c, resolved, width / 2, bottom, size, Object.assign({ still: true }, opts));
  }
  G.draw = G.draw || {}; G.draw.avatar = draw; G.render = G.render || {}; G.render.drawAvatar = thumbnail;
  // 可独立接入其它Canvas场景；不接管drawPlayer、名牌、坐标或帧调度。
  G.render.characterVisual = { version: 2, bounds, draw, thumbnail, clearCache() { sprites.clear(); }, cacheInfo() { return { size: sprites.size, max: maxSprites }; } };
})(window.Game);
