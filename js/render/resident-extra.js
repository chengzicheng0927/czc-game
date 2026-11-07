/* 新朋友使用同一套绘本笔触；九种独立剪影，保留原三位与糯米的绘制入口。 */
(function (G) {
  'use strict';
  const ids = ['mianmian', 'bobo', 'xingxing', 'lizi', 'yuanyuan', 'mimi', 'doudou', 'shirley', 'rainbow'];
  const cream = '#FFF4DE', ink = '#80666C', blush = '#E9B5C2', tau = Math.PI * 2;
  const heights = { mianmian: 108, bobo: 98, xingxing: 130, lizi: 112, yuanyuan: 102, mimi: 110, doudou: 100, shirley: 118, rainbow: 132 };
  const widths = { mianmian: 88, bobo: 88, xingxing: 92, lizi: 132, yuanyuan: 90, mimi: 100, doudou: 90, shirley: 90, rainbow: 118 };
  function ellipse(c, x, y, rx, ry, fill, stroke, width = 1.8) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, tau); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); } }
  function line(c, x, y, xx, yy, color = ink, width = 1.6) { c.beginPath(); c.moveTo(x, y); c.lineTo(xx, yy); c.strokeStyle = color; c.lineWidth = width; c.stroke(); }
  function curve(c, points, color = ink, width = 1.7) { c.beginPath(); c.moveTo(points[0], points[1]); c.bezierCurveTo(...points.slice(2)); c.strokeStyle = color; c.lineWidth = width; c.stroke(); }
  function polygon(c, points, fill, stroke, width = 1.6) { c.beginPath(); points.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.closePath(); c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); } }
  function painted(c, fill, stroke, width = 1.8) { c.closePath(); c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); } }
  function star(c, x, y, radius, fill) { polygon(c, Array.from({ length: 10 }, (_, i) => { const angle = i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? radius * .45 : radius; return [x + Math.cos(angle) * r, y + Math.sin(angle) * r]; }), fill, '#BDA179', 1); }
  function bow(c, x, y, color, size = 6) { ellipse(c, x - size * .65, y, size * .75, size * .48, color, '#B395A3', 1); ellipse(c, x + size * .65, y, size * .75, size * .48, color, '#B395A3', 1); ellipse(c, x, y, size * .27, size * .3, color, '#B395A3', 1); }
  function leaf(c, x, y, angle, color = '#A7C5A3', size = 8) { c.save(); c.translate(x, y); c.rotate(angle); c.beginPath(); c.moveTo(-size, 0); c.quadraticCurveTo(0, -size * .85, size, 0); c.quadraticCurveTo(0, size * .85, -size, 0); painted(c, color, '#83A587', 1); line(c, -size * .7, 0, size * .7, 0, '#83A587', .7); c.restore(); }
  function eyes(c, y, options, separation = 9, pupil = ink) {
    const time = Number(options.time) || 0, blink = !options.reducedMotion && !options.still && Math.sin(time * .21 + options.seed) > .996;
    [-1, 1].forEach(side => {
      const x = side * separation;
      if (options.happy || blink || options.sleepy) curve(c, [x - 3, y + 1, x - 1, y - 3, x + 1, y - 3, x + 3, y + 1], pupil, 1.7);
      else { ellipse(c, x, y, 2.4, 3.5, pupil); ellipse(c, x - .7, y - 1.2, .75, 1, '#FFFDF5'); }
    });
  }
  function face(c, y, options, size = 1) {
    ellipse(c, -16 * size, y + 7, 5.4 * size, 2.7 * size, blush); ellipse(c, 16 * size, y + 7, 5.4 * size, 2.7 * size, blush);
    eyes(c, y, options, 9 * size); ellipse(c, 0, y + 5, 1.8, 1.3, '#AC7F86'); curve(c, [-4, y + 9, -2, y + 13, 2, y + 13, 4, y + 9], ink, 1.2);
  }
  function feet(c, fill, edge) { ellipse(c, -11, -4, 8, 5, fill, edge, 1.5); ellipse(c, 11, -4, 8, 5, fill, edge, 1.5); }
  function body(c, fill, edge, accent, opts = {}) {
    feet(c, fill, edge); ellipse(c, 0, -26, 20, 24, fill, edge);
    if (accent) { c.beginPath(); c.moveTo(-14, -39); c.quadraticCurveTo(0, -31, 14, -39); c.lineTo(20, -12); c.quadraticCurveTo(0, -7, -20, -12); painted(c, accent, opts.dressEdge || '#B49EAE', 1.3); }
    ellipse(c, -20, -28, 6, 10, fill, edge, 1.4); ellipse(c, 20, -28, 6, 10, fill, edge, 1.4);
  }
  function sheep(c, palette, opts) {
    const wool = palette.body, edge = '#CDB8A5', skin = '#E6C8AD';
    feet(c, skin, '#B79B85'); ellipse(c, 0, -29, 27, 25, wool, edge);
    for (let i = 0; i < 9; i++) { const angle = i * tau / 9; ellipse(c, Math.cos(angle) * 22, -29 + Math.sin(angle) * 19, 9, 9, wool, edge, 1.2); }
    ellipse(c, 0, -28, 17, 18, '#DCC5D4', '#BCA1B6', 1.2); line(c, -9, -26, 9, -26, '#EEDFE9', 1); line(c, -9, -21, 9, -21, '#EEDFE9', 1); bow(c, 0, -40, '#EBC0CD', 5);
    ellipse(c, -29, -63, 12, 6, skin, '#B79B85', 1.3); ellipse(c, 29, -63, 12, 6, skin, '#B79B85', 1.3); ellipse(c, -30, -63, 6, 2.5, blush); ellipse(c, 30, -63, 6, 2.5, blush);
    ellipse(c, 0, -60, 25, 23, '#F1DAC1', '#BFA48C');
    [[-23, -72], [-17, -86], [-4, -91], [10, -88], [24, -76]].forEach(([x, y], i) => ellipse(c, x, y, i === 2 ? 12 : 10, i === 2 ? 10 : 11, wool, edge, 1.3));
    face(c, -61, opts); ellipse(c, -23, -29, 6, 9, wool, edge, 1.3); ellipse(c, 23, -29, 6, 9, wool, edge, 1.3);
    ellipse(c, 18, -20, 7, 7, '#CBAFCB', '#A68BA8', 1.2); curve(c, [12, -20, 15, -27, 24, -13, 17, -17], '#E7D5E2', 1); line(c, 10, -31, 24, -11, '#B49B7A', 1.1);
  }
  function penguin(c, palette, opts) {
    const blue = palette.body, edge = '#86A9BD', gold = '#E7C989';
    ellipse(c, -12, -3, 10, 4, gold, '#BD9C68', 1.4); ellipse(c, 12, -3, 10, 4, gold, '#BD9C68', 1.4);
    c.save(); c.rotate(.25); ellipse(c, -25, -31, 7, 22, blue, edge, 1.4); c.restore(); c.save(); c.rotate(-.25); ellipse(c, 25, -31, 7, 22, blue, edge, 1.4); c.restore();
    ellipse(c, 0, -34, 25, 32, blue, edge); ellipse(c, 0, -31, 17, 24, '#FFF7E8', '#B8CCD2', 1);
    ellipse(c, 0, -64, 27, 25, blue, edge); c.beginPath(); c.moveTo(-22, -57); c.bezierCurveTo(-28, -76, -8, -87, 0, -72); c.bezierCurveTo(8, -87, 28, -76, 22, -57); c.bezierCurveTo(18, -39, -18, -39, -22, -57); painted(c, '#FFF8E8', null);
    eyes(c, -64, opts); ellipse(c, -16, -57, 5, 2.5, blush); ellipse(c, 16, -57, 5, 2.5, blush); polygon(c, [[-5, -56], [5, -56], [0, -51]], gold, '#B89C6D', 1);
    polygon(c, [[-16, -42], [0, -35], [16, -42], [10, -29], [-10, -29]], '#E7EEDB', '#A1B7BD', 1.2); bow(c, 0, -34, '#E5CE90', 5);
    line(c, -8, -81, 1, -85, '#D1E3E6', 2.2); line(c, 1, -85, 7, -83, '#D1E3E6', 2.2);
  }
  function deer(c, palette, opts) {
    const tan = palette.body, edge = '#B59D7E';
    [[-17, -83, -24, -118], [17, -83, 24, -118]].forEach(([x, y, xx, yy]) => { line(c, x, y, xx, yy, '#B89D7D', 4); const side = x < 0 ? -1 : 1; line(c, x + side * 5, y - 18, x + side * 17, y - 24, '#B89D7D', 3); line(c, xx - side * 2, yy + 11, xx - side * 9, yy + 3, '#B89D7D', 3); });
    body(c, tan, edge, '#B9D2B8', { dressEdge: '#90AE95' });
    c.save(); c.translate(-26, -77); c.rotate(-.5); ellipse(c, 0, 0, 9, 16, tan, edge, 1.5); ellipse(c, 0, 0, 4, 10, '#E6B8B6'); c.restore(); c.save(); c.translate(26, -77); c.rotate(.5); ellipse(c, 0, 0, 9, 16, tan, edge, 1.5); ellipse(c, 0, 0, 4, 10, '#E6B8B6'); c.restore();
    ellipse(c, 0, -59, 26, 27, tan, edge); ellipse(c, 0, -48, 15, 12, cream); [[-16, -76], [15, -75], [-20, -49], [20, -49]].forEach(([x, y]) => ellipse(c, x, y, 2.2, 2.7, '#FFF0D2'));
    face(c, -59, opts); bow(c, 0, -33, '#8EB6A1', 6); ellipse(c, -2, -20, 3, 2, '#F5E6B8', '#AD9B77', .8); line(c, 1, -20, 1, -29, '#AD9B77', 1.2); curve(c, [1, -29, 6, -29, 6, -26, 8, -27], '#AD9B77', 1.2);
  }
  function squirrel(c, palette, opts) {
    const brown = palette.body, edge = '#AD886D';
    c.beginPath(); c.moveTo(14, -14); c.bezierCurveTo(71, -9, 71, -91, 44, -99); c.bezierCurveTo(17, -107, 10, -64, 35, -65); c.bezierCurveTo(63, -70, 39, -40, 14, -36); painted(c, '#C6A082', edge, 1.8);
    curve(c, [38, -88, 66, -80, 49, -36, 29, -34], '#EED7B5', 7); curve(c, [46, -92, 61, -79, 47, -53, 39, -48], '#DAB995', 1.3);
    body(c, brown, edge, '#DFC3A0', { dressEdge: '#B89C7B' });
    polygon(c, [[-26, -68], [-25, -94], [-8, -77]], brown, edge); polygon(c, [[26, -68], [25, -94], [8, -77]], brown, edge); polygon(c, [[-23, -74], [-22, -86], [-14, -77]], '#E7C2B1'); polygon(c, [[23, -74], [22, -86], [14, -77]], '#E7C2B1');
    ellipse(c, 0, -59, 28, 26, brown, edge); ellipse(c, 0, -48, 18, 12, cream); line(c, -7, -80, -4, -71, '#A47C61', 3); line(c, 6, -80, 8, -72, '#A47C61', 3); face(c, -58, opts);
    ellipse(c, 0, -20, 8, 10, '#D7B17D', '#AD895F', 1.2); ellipse(c, 0, -25, 10, 4, '#B99A75', '#927454', 1.1); line(c, 0, -29, 2, -32, '#927454', 1.5); ellipse(c, -13, -20, 6, 5, brown, edge, 1); ellipse(c, 13, -20, 6, 5, brown, edge, 1);
  }
  function panda(c, palette, opts) {
    const white = palette.body, dark = '#8F9691', edge = '#B9B6A4';
    feet(c, dark, '#737D77'); ellipse(c, 0, -26, 22, 25, white, edge); ellipse(c, -21, -29, 8, 14, dark, '#737D77', 1.3); ellipse(c, 21, -29, 8, 14, dark, '#737D77', 1.3); ellipse(c, 0, -28, 18, 12, '#B9CDB4', '#8DAA91', 1.2);
    ellipse(c, -22, -82, 11, 12, dark, '#737D77', 1.4); ellipse(c, 22, -82, 11, 12, dark, '#737D77', 1.4); ellipse(c, 0, -60, 30, 28, white, edge);
    [-1, 1].forEach(side => { c.save(); c.translate(side * 11, -60); c.rotate(side * .25); ellipse(c, 0, 0, 8, 10, dark, '#7B847D', 1); c.restore(); });
    eyes(c, -60, opts, 11, '#5C6861'); ellipse(c, -21, -52, 5, 2.6, blush); ellipse(c, 21, -52, 5, 2.6, blush); ellipse(c, 0, -49, 3.6, 2.7, '#7E8A80'); curve(c, [-4, -43, -2, -39, 2, -39, 4, -43], ink, 1.2);
    line(c, 8, -15, 24, -42, '#8EA779', 2.5); leaf(c, 20, -34, -.4, '#B4CA9F', 9); leaf(c, 27, -38, .4, '#A2BC92', 7); ellipse(c, 11, -18, 6, 5, white, edge, 1);
  }
  function cat(c, palette, opts) {
    const lavender = palette.body, edge = '#AE9EB9';
    curve(c, [14, -13, 48, -9, 48, -42, 35, -37], '#BBAAC9', 9); body(c, lavender, edge, '#E2CCDF', { dressEdge: '#BB9FB9' });
    polygon(c, [[-27, -67], [-25, -101], [-6, -78]], lavender, edge); polygon(c, [[27, -67], [25, -101], [6, -78]], lavender, edge); polygon(c, [[-22, -75], [-22, -92], [-12, -79]], '#EBC0CD'); polygon(c, [[22, -75], [22, -92], [12, -79]], '#EBC0CD');
    ellipse(c, 0, -60, 29, 27, lavender, edge); ellipse(c, 0, -49, 17, 12, '#F3E6E6'); [-1, 0, 1].forEach(i => line(c, i * 7, -82, i * 5, -75, '#AC99BE', 2.5)); face(c, -60, opts);
    [-1, 1].forEach(side => { line(c, side * 22, -53, side * 37, -56, '#9C8DA9', 1); line(c, side * 22, -49, side * 38, -48, '#9C8DA9', 1); });
    bow(c, 0, -32, '#C2AED3', 5); star(c, 0, -24, 5, '#F0D69C');
  }
  function hamster(c, palette, opts) {
    const peach = palette.body, edge = '#C19B7E';
    feet(c, '#F0D7BE', edge); ellipse(c, 0, -28, 27, 27, peach, edge); ellipse(c, 0, -23, 18, 18, '#FFF0DA');
    ellipse(c, -21, -77, 10, 11, peach, edge, 1.5); ellipse(c, 21, -77, 10, 11, peach, edge, 1.5); ellipse(c, -21, -77, 5, 6, '#E7B9B5'); ellipse(c, 21, -77, 5, 6, '#E7B9B5');
    ellipse(c, 0, -58, 30, 28, peach, edge); ellipse(c, -16, -49, 15, 12, '#FFF0DB'); ellipse(c, 16, -49, 15, 12, '#FFF0DB'); face(c, -59, opts); polygon(c, [[-3, -45], [-3, -40], [3, -40], [3, -45]], '#FFF8E8', '#C8A58B', .8); line(c, 0, -44, 0, -41, '#C8A58B', .6);
    curve(c, [-26, -73, -12, -80, 12, -80, 26, -73], '#B5D2BE', 6); bow(c, 23, -74, '#D1B18B', 4); ellipse(c, -24, -28, 6, 8, peach, edge, 1.3); ellipse(c, 24, -28, 6, 8, peach, edge, 1.3);
    ellipse(c, 0, -20, 7, 10, '#E6D5AC', '#B49C72', 1.1); line(c, 0, -27, 0, -13, '#C3AE82', 1);
  }
  function swan(c, palette, opts) {
    const white = palette.body, edge = '#C8B8B8';
    ellipse(c, -10, -3, 9, 4, '#E5C98E', '#BEA16E', 1.2); ellipse(c, 10, -3, 9, 4, '#E5C98E', '#BEA16E', 1.2); ellipse(c, 0, -27, 26, 24, white, edge);
    c.beginPath(); c.moveTo(-15, -33); c.bezierCurveTo(-19, -56, -9, -61, -8, -75); c.bezierCurveTo(-8, -91, 14, -92, 18, -75); c.bezierCurveTo(25, -55, 9, -46, 15, -32); painted(c, white, edge);
    c.beginPath(); c.moveTo(-21, -32); c.quadraticCurveTo(0, -25, 21, -32); c.lineTo(29, -14); c.quadraticCurveTo(18, -8, 9, -13); c.quadraticCurveTo(0, -7, -9, -13); c.quadraticCurveTo(-20, -7, -29, -14); painted(c, '#DCC5DD', '#BAA2C0', 1.2);
    [-1, 1].forEach(side => { c.save(); c.translate(side * 23, -29); c.rotate(-side * .35); ellipse(c, 0, 0, 10, 22, white, edge, 1.3); curve(c, [-3, -12, -10, 0, 2, 9, 0, 17], '#DFD0CD', .9); c.restore(); });
    ellipse(c, 2, -78, 23, 21, white, edge); polygon(c, [[21, -78], [36, -71], [21, -69]], '#E6C28E', '#BC9E74', 1.2); face(c, -78, opts, .75);
    curve(c, [-13, -93, -7, -101, 7, -102, 15, -94], '#D9B0C7', 4); bow(c, -12, -96, '#E7C3D3', 4); curve(c, [-1, -98, -5, -112, 3, -110, 6, -104], '#E6D9CF', 2); bow(c, 0, -32, '#C4A3C2', 5);
  }
  function unicorn(c, palette, opts) {
    const white = palette.body, edge = '#CBB2C5', colors = ['#E7B1C5', '#E8CC9F', '#B7D2C1', '#B9CDE2', '#CCB9DD'];
    colors.slice().reverse().forEach((color, i) => curve(c, [14, -19, 51 + i * 2, -11, 42 + i * 2, -48, 32 + i * 2, -38], color, 6));
    body(c, white, edge, '#D6C0DF', { dressEdge: '#B69CBF' });
    ellipse(c, -22, -87, 8, 16, white, edge, 1.4); ellipse(c, 22, -87, 8, 16, white, edge, 1.4); ellipse(c, -22, -87, 3, 10, '#E7BDCF'); ellipse(c, 22, -87, 3, 10, '#E7BDCF');
    c.beginPath(); c.moveTo(-7, -89); c.quadraticCurveTo(-4, -107, 0, -123); c.quadraticCurveTo(4, -107, 7, -89); painted(c, '#F0D69F', '#BCA174', 1.4); [-97, -104, -111].forEach((y, i) => line(c, -5 + i, y, 4 - i, y - 3, '#C4AD87', 1));
    ellipse(c, 0, -64, 28, 27, white, edge); colors.forEach((color, i) => curve(c, [-19 + i * 4, -85, -42 - i, -80, -38 - i, -53, -26 - i * 2, -39], color, 6));
    ellipse(c, 3, -49, 24, 15, '#F8DFE8', '#C9AABC', 1.4); eyes(c, -66, opts, 10); ellipse(c, -18, -58, 5, 2.5, blush); ellipse(c, 20, -58, 5, 2.5, blush); ellipse(c, -3, -48, 1.5, 1.8, '#B18A9E'); ellipse(c, 9, -48, 1.5, 1.8, '#B18A9E'); curve(c, [-2, -42, 1, -39, 6, -39, 9, -42], ink, 1.1);
    colors.slice(0, 4).forEach((color, i) => ellipse(c, -3 + i * 5, -80 - Math.sin(i * .9) * 4, 7, 5, color, '#C3A9BD', .7)); star(c, 0, -26, 5, '#F2DBA6');
  }
  const painters = { mianmian: sheep, bobo: penguin, xingxing: deer, lizi: squirrel, yuanyuan: panda, mimi: cat, doudou: hamster, shirley: swan, rainbow: unicorn };
  function draw(c, id, x, y, scale = 1, options = {}) {
    if (!ids.includes(id) || !c) return false;
    const def = residentDef(id), palette = def.appearance || { body: def.color, accent: def.accent }, seed = id.split('').reduce((sum, letter) => sum + letter.charCodeAt(0), 0);
    const opts = Object.assign({ seed }, options), time = Number(opts.time) || 0, bob = opts.still || opts.reducedMotion ? 0 : Math.sin(time * 1.8 + seed) * 1.1;
    c.save(); c.translate(x, y + bob); c.scale(scale * (opts.facing === -1 ? -1 : 1), scale); c.lineCap = 'round'; c.lineJoin = 'round';
    ellipse(c, 0, -1, 25, 4.5, 'rgba(126,105,92,.11)'); painters[id](c, palette, opts); c.restore(); return true;
  }
  function residentDef(id) { return G.data.residentById && G.data.residentById[id] || G.data.residents.find(resident => resident.id === id) || { color: '#FFF3DF', accent: '#D8BED5' }; }
  draw.height = id => G.data.residentById && G.data.residentById[id] && G.data.residentById[id].portraitHeight || heights[id] || (id === 'lily' ? 112 : 94);
  draw.width = id => G.data.residentById && G.data.residentById[id] && G.data.residentById[id].portraitWidth || widths[id] || 75;
  G.draw = G.draw || {}; G.draw.residentExtra = draw;
})(window.Game);
