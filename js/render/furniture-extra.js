/* 居民专属/成就家具的独立轮廓；入口放在scene.drawFurniture的常规模板之前。 */
(function (G) {
  'use strict';
  const TAU = Math.PI * 2;
  const motifs = new Set(['carrot_cake', 'honey_lamp', 'palette_frame', 'cloud_sofa', 'shell_bath', 'star_mobile', 'acorn_bookshelf', 'bamboo_lantern', 'cat_pillow', 'rainbow_drum', 'swan_mirror', 'rainbow_throne', 'mini_house', 'glass_cabinet', 'heart_tree', 'cake_carousel', 'watering_can', 'star_trophy', 'dress_stand', 'tripod_camera', 'rainbow_arch', 'cozy_fireplace']);
  const validColor = (value, fallback) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  function shade(color, delta) { const value = validColor(color, '#E8C39E'); return '#' + [1, 3, 5].map(i => Math.max(0, Math.min(255, parseInt(value.slice(i, i + 2), 16) + delta)).toString(16).padStart(2, '0')).join(''); }
  function ellipse(c, x, y, rx, ry, fill, edge, width) { c.beginPath(); c.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), 0, 0, TAU); if (fill) { c.fillStyle = fill; c.fill(); } if (edge) { c.strokeStyle = edge; c.lineWidth = width || 1.7; c.stroke(); } }
  function box(c, x, y, w, h, radius, fill, edge) { c.beginPath(); c.roundRect(x, y, w, h, radius); c.fillStyle = fill; c.fill(); if (edge) { c.strokeStyle = edge; c.lineWidth = 1.7; c.stroke(); } }
  function poly(c, points, fill, edge, width) { c.beginPath(); points.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.closePath(); c.fillStyle = fill; c.fill(); if (edge) { c.strokeStyle = edge; c.lineWidth = width || 1.7; c.stroke(); } }
  function line(c, points, color, width) { c.beginPath(); points.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.strokeStyle = color; c.lineWidth = width || 1.7; c.stroke(); }
  function star(c, x, y, radius, fill, edge) { const points = []; for (let i = 0; i < 10; i++) { const angle = i * Math.PI / 5 - Math.PI / 2, r = radius * (i % 2 ? .46 : 1); points.push([x + Math.cos(angle) * r, y + Math.sin(angle) * r]); } poly(c, points, fill, edge, 1); }
  function heart(c, x, y, size, fill, edge) { c.beginPath(); c.moveTo(x, y + size); c.bezierCurveTo(x - size * 1.9, y, x - size * 1.2, y - size * 1.5, x, y - size * .5); c.bezierCurveTo(x + size * 1.2, y - size * 1.5, x + size * 1.9, y, x, y + size); c.fillStyle = fill; c.fill(); if (edge) { c.strokeStyle = edge; c.lineWidth = 1.3; c.stroke(); } }
  function leaf(c, x, y, size, fill, rotation) { c.save(); c.translate(x, y); c.rotate(rotation || 0); c.beginPath(); c.moveTo(0, size); c.quadraticCurveTo(-size, -size * .3, 0, -size); c.quadraticCurveTo(size, -size * .3, 0, size); c.fillStyle = fill; c.fill(); c.restore(); }
  function flower(c, x, y, size, fill, center) { for (let i = 0; i < 5; i++) { const a = i * TAU / 5; ellipse(c, x + Math.cos(a) * size * .6, y + Math.sin(a) * size * .6, size * .42, size * .42, fill); } ellipse(c, x, y, size * .3, size * .3, center); }
  function bow(c, x, y, size, fill, accent, edge) { ellipse(c, x - size * .6, y, size * .7, size * .48, fill, edge); ellipse(c, x + size * .6, y, size * .7, size * .48, fill, edge); box(c, x - size * .2, y - size * .23, size * .4, size * .46, 2, accent, edge); }
  function rainbow(c, x, y, radius, bands, width) { c.lineWidth = width; const colors = ['#E7A5B8', '#EABD94', '#EDDA98', '#B7CFA5', '#A7CED8', '#B6B5D8', '#D1B0D4']; for (let i = 0; i < bands; i++) { c.beginPath(); c.arc(x, y, Math.max(1, radius - i * width), Math.PI, TAU); c.strokeStyle = colors[i % colors.length]; c.stroke(); } }
  function cloud(c, x, y, size, fill, edge) { c.beginPath(); c.moveTo(x - size, y + size * .15); c.bezierCurveTo(x - size * 1.4, y - size * .4, x - size * .65, y - size * .9, x - size * .35, y - size * .55); c.bezierCurveTo(x - size * .1, y - size * 1.2, x + size * .65, y - size * 1.1, x + size * .7, y - size * .4); c.bezierCurveTo(x + size * 1.4, y - size * .5, x + size * 1.4, y + size * .3, x + size * .8, y + size * .5); c.quadraticCurveTo(x, y + size * .8, x - size, y + size * .15); c.fillStyle = fill; c.fill(); if (edge) { c.strokeStyle = edge; c.lineWidth = 1.5; c.stroke(); } }
  function face(c, x, y, edge, sleepy) { for (const side of [-1, 1]) { if (sleepy) { c.beginPath(); c.arc(x + side * 8, y, 3, 0, Math.PI); c.strokeStyle = edge; c.lineWidth = 1.5; c.stroke(); } else ellipse(c, x + side * 8, y, 1.6, 2, edge); } c.beginPath(); c.arc(x, y + 4, 3, 0, Math.PI); c.strokeStyle = edge; c.lineWidth = 1.3; c.stroke(); }
  function windowShape(c, def, a, b, d, edge) {
    box(c, 8, 8, 84, 78, 9, a, edge); box(c, 16, 15, 68, 62, 5, '#D7E9EC', edge); line(c, [[50, 16], [50, 76]], b, 4); line(c, [[17, 46], [83, 46]], b, 4); line(c, [[22, 23], [35, 34]], '#FFF9EB', 2.5);
    for (const side of [0, 1]) { const x = side ? 72 : 8; c.beginPath(); c.moveTo(x, 5); c.lineTo(x + 21, 5); c.quadraticCurveTo(x + 11, 40, x + 21, 79); c.quadraticCurveTo(x + 6, 89, x - 1, 78); c.quadraticCurveTo(x + 8, 42, x, 5); c.fillStyle = b; c.fill(); c.strokeStyle = edge; c.lineWidth = 1.3; c.stroke(); line(c, [[x + 3, 55], [x + 16, 55]], d, 2); }
    line(c, [[3, 5], [97, 5]], d, 3); box(c, 4, 85, 92, 7, 3, a, edge);
    if (def.theme === 'garden') flower(c, 50, 7, 6, '#FFF2D1', d);
    else if (def.theme === 'ocean') { c.beginPath(); c.arc(50, 9, 8, Math.PI, TAU); c.strokeStyle = d; c.lineWidth = 2; c.stroke(); }
    else if (def.theme === 'cloud') cloud(c, 50, 8, 8, '#FFFBF1', edge);
    else if (def.theme === 'starry') star(c, 50, 8, 8, b, d);
    else if (def.theme === 'princess') bow(c, 50, 9, 9, b, a, d);
    else if (def.theme === 'forest') { leaf(c, 46, 9, 6, d, -.6); leaf(c, 54, 9, 6, d, .6); }
    else if (def.theme === 'oriental') { box(c, 45, 2, 10, 13, 4, a, d); line(c, [[50, 15], [50, 21]], d); }
  }
  function paint(c, motif, a, b, d, edge) {
    switch (motif) {
      case 'carrot_cake':
        ellipse(c, 50, 95, 43, 4, '#EEE0CA', edge); box(c, 12, 60, 76, 30, 7, '#E9C28F', edge); box(c, 20, 36, 60, 27, 7, '#E8B4C3', edge); box(c, 29, 18, 42, 22, 6, '#EBC894', edge);
        for (const [y, width] of [[60, 76], [36, 60], [18, 42]]) { box(c, 50 - width / 2, y, width, 6, 3, b); for (let i = 0; i < 5; i++) ellipse(c, 50 - width * .4 + i * width * .2, y + 4, width * .09, 3, b); }
        poly(c, [[43, 15], [56, 13], [51, 31]], '#DCA274', edge); leaf(c, 47, 9, 6, '#91AC84', -.5); leaf(c, 54, 9, 6, '#A6BC8C', .5); flower(c, 24, 74, 6, b, d); break;
      case 'honey_lamp':
        ellipse(c, 50, 50, 42, 42, '#FFF0C638'); box(c, 17, 25, 66, 66, 18, '#EACB89', edge); box(c, 13, 19, 74, 13, 5, '#C5A079', edge); box(c, 27, 43, 46, 32, 10, '#FFF1CA', edge); face(c, 50, 55, edge, false); line(c, [[29, 15], [71, 15]], d, 4);
        ellipse(c, 78, 36, 5, 4, '#F5D585', edge); ellipse(c, 75, 31, 4, 3, '#FFF7DC'); ellipse(c, 82, 31, 4, 3, '#FFF7DC'); break;
      case 'palette_frame':
        box(c, 7, 7, 86, 85, 9, a, edge); box(c, 16, 16, 68, 66, 5, '#FFF7E6', d); ellipse(c, 48, 49, 26, 23, '#E3C698', edge); ellipse(c, 62, 59, 6, 7, '#FFF7E6', edge);
        [[32, 40, '#DDA2B8'], [45, 30, '#D8C27D'], [59, 35, '#A2BCA0'], [29, 56, '#AECBDD']].forEach(p => ellipse(c, p[0], p[1], 5, 6, p[2])); line(c, [[61, 74], [78, 27]], '#9F806B', 4); poly(c, [[76, 32], [81, 21], [83, 34]], '#B3C79F', edge); break;
      case 'cloud_sofa':
        box(c, 15, 84, 12, 12, 4, d, edge); box(c, 73, 84, 12, 12, 4, d, edge); cloud(c, 49, 42, 36, a, edge); box(c, 11, 51, 78, 34, 12, a, edge); box(c, 18, 55, 64, 22, 9, b, edge); cloud(c, 10, 68, 8, b, edge); cloud(c, 90, 68, 8, b, edge); face(c, 50, 37, d, true); break;
      case 'shell_bath':
        c.beginPath(); c.moveTo(14, 48); c.bezierCurveTo(5, 11, 31, 0, 40, 15); c.bezierCurveTo(45, -2, 58, -2, 63, 15); c.bezierCurveTo(84, 0, 99, 21, 86, 49); c.closePath(); c.fillStyle = b; c.fill(); c.strokeStyle = edge; c.lineWidth = 1.7; c.stroke();
        for (let i = 0; i < 5; i++) line(c, [[50, 53], [20 + i * 15, 16 + Math.abs(i - 2) * 7]], '#ABC9D3', 1.5);
        poly(c, [[7, 51], [18, 87], [82, 87], [93, 51]], a, edge); ellipse(c, 50, 51, 43, 14, b, edge); ellipse(c, 50, 51, 34, 8, '#BEDDDC'); ellipse(c, 24, 92, 8, 4, d); ellipse(c, 76, 92, 8, 4, d); break;
      case 'star_mobile':
        line(c, [[50, 0], [50, 11]], d, 1.8); c.beginPath(); c.moveTo(10, 26); c.quadraticCurveTo(50, -3, 90, 26); c.strokeStyle = a; c.lineWidth = 4; c.stroke();
        for (const [x, y, r] of [[16, 65, 13], [50, 88, 12], [84, 60, 11]]) { line(c, [[x, 21], [x, y - r]], d, 1.3); star(c, x, y, r, b, edge); }
        ellipse(c, 48, 27, 9, 10, '#F0DA9A', edge); ellipse(c, 52, 24, 7, 8, '#FFF8E9'); break;
      case 'acorn_bookshelf':
        box(c, 16, 31, 68, 60, 12, '#C4AC87', edge); box(c, 22, 36, 56, 48, 5, '#A88F70', edge);
        for (let row = 0; row < 2; row++) { for (let col = 0; col < 5; col++) box(c, 26 + col * 10, 43 + row * 24, 7, 15 + col % 2 * 3, 1, [a, b, '#DDB5BB', '#B9CCD3', '#D8CE9E'][col], edge); box(c, 20, 60 + row * 24, 60, 4, 1, b, edge); }
        c.beginPath(); c.moveTo(6, 35); c.quadraticCurveTo(12, 8, 50, 10); c.quadraticCurveTo(88, 8, 94, 35); c.closePath(); c.fillStyle = '#B6C095'; c.fill(); c.strokeStyle = edge; c.stroke(); line(c, [[50, 10], [54, 3]], '#9E806A', 4); leaf(c, 67, 8, 7, '#91AB83', .8); break;
      case 'bamboo_lantern':
        box(c, 25, 91, 50, 6, 3, '#A4AB87', edge); line(c, [[50, 88], [50, 64]], '#A6AC87', 6); ellipse(c, 50, 43, 36, 33, '#F7E1A2', edge);
        for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(29 + i * 14, 16); c.quadraticCurveTo(20 + i * 20, 43, 29 + i * 14, 70); c.strokeStyle = '#A6B58B'; c.lineWidth = 2.4; c.stroke(); }
        box(c, 24, 11, 52, 8, 3, '#A9B28D', edge); box(c, 24, 68, 52, 8, 3, '#A9B28D', edge); line(c, [[50, 76], [50, 88]], d, 1.5); leaf(c, 54, 39, 10, '#AFBE91', .8); break;
      case 'cat_pillow':
        poly(c, [[12, 39], [16, 8], [38, 31]], a, edge); poly(c, [[63, 31], [85, 8], [88, 42]], a, edge); poly(c, [[18, 32], [20, 17], [31, 30]], '#E7BDC9'); poly(c, [[69, 29], [81, 17], [83, 33]], '#E7BDC9');
        ellipse(c, 50, 59, 45, 34, a, edge); face(c, 50, 55, d, true); for (const side of [-1, 1]) { line(c, [[50 + side * 22, 63], [50 + side * 35, 58]], d, 1.3); line(c, [[50 + side * 22, 69], [50 + side * 35, 70]], d, 1.3); } star(c, 49, 34, 9, b, edge); break;
      case 'rainbow_drum':
        poly(c, [[12, 35], [88, 35], [83, 89], [17, 89]], a, edge); for (let i = 0; i < 6; i++) box(c, 18 + i * 11, 44, 9, 39, 2, ['#E6B0C0', '#E7C290', '#E9D99A', '#B8CEAB', '#ABCAD9', '#C2B0D4'][i]); ellipse(c, 50, 88, 34, 7, b, edge); ellipse(c, 50, 35, 39, 10, '#FFF2D7', edge); star(c, 50, 66, 11, '#FFF3CD', edge); line(c, [[18, 29], [65, 5]], '#B2947A', 4); line(c, [[82, 27], [39, 3]], '#B2947A', 4); ellipse(c, 68, 4, 6, 5, '#DEB5C4', edge); ellipse(c, 35, 3, 6, 5, '#D2C197', edge); break;
      case 'swan_mirror':
        ellipse(c, 50, 48, 39, 43, b, edge, 3); ellipse(c, 50, 47, 30, 34, '#D6E8E8', d, 1.4); line(c, [[33, 23], [62, 62]], '#FAF9EE', 4);
        for (const side of [-1, 1]) { c.beginPath(); c.moveTo(50 + side * 28, 89); c.bezierCurveTo(50 + side * 10, 84, 50 + side * 41, 70, 50 + side * 26, 66); c.bezierCurveTo(50 + side * 10, 64, 50 + side * 9, 79, 50 + side * 21, 80); c.strokeStyle = '#FFF4DF'; c.lineWidth = 6; c.stroke(); poly(c, [[50 + side * 24, 65], [50 + side * 16, 68], [50 + side * 24, 71]], '#DAB277'); }
        bow(c, 50, 8, 10, a, b, edge); break;
      case 'rainbow_throne':
        rainbow(c, 50, 51, 43, 7, 4); box(c, 22, 49, 56, 31, 10, b, edge); cloud(c, 50, 79, 29, '#FFF0D9', edge); cloud(c, 13, 69, 9, a, edge); cloud(c, 87, 69, 9, a, edge); box(c, 23, 87, 9, 8, 3, d); box(c, 68, 87, 9, 8, 3, d); star(c, 50, 47, 9, '#F4D78F', edge); break;
      case 'mini_house':
        box(c, 15, 39, 70, 52, 5, '#F0E1C4', edge); poly(c, [[6, 41], [50, 8], [94, 41]], a, edge); box(c, 42, 65, 19, 26, 5, '#C7B093', edge);
        for (const x of [24, 65]) { box(c, x, 48, 14, 14, 3, '#C9E0DF', edge); line(c, [[x + 7, 49], [x + 7, 61]], '#FFF7E3', 1); }
        heart(c, 50, 31, 7, b, edge); box(c, 66, 9, 10, 15, 2, d, edge); break;
      case 'glass_cabinet':
        box(c, 12, 5, 76, 86, 8, a, edge); box(c, 19, 14, 62, 67, 4, '#D7E6DE', edge); line(c, [[50, 15], [50, 80]], d, 2);
        for (const y of [38, 63, 81]) box(c, 17, y, 66, 3, 1, b, edge); star(c, 33, 28, 9, '#E8CE90', edge); ellipse(c, 65, 27, 9, 8, '#D2B5CB', edge); flower(c, 33, 53, 7, '#FFF0CB', '#D7B878'); poly(c, [[57, 57], [64, 43], [74, 57]], '#AFBCA9', edge); line(c, [[25, 19], [37, 33]], '#FFFFFFA0', 3); box(c, 18, 91, 10, 6, 2, d); box(c, 72, 91, 10, 6, 2, d); break;
      case 'heart_tree':
        c.beginPath(); c.moveTo(43, 89); c.lineTo(44, 43); c.quadraticCurveTo(32, 30, 28, 28); c.moveTo(46, 60); c.lineTo(68, 37); c.strokeStyle = '#B08C73'; c.lineWidth = 10; c.stroke();
        for (const [x, y, size] of [[25, 22, 13], [49, 15, 15], [73, 25, 14], [28, 47, 12], [63, 45, 13]]) heart(c, x, y, size, x % 2 ? '#D4B4C3' : '#B9C99D', edge);
        poly(c, [[28, 78], [65, 78], [61, 96], [33, 96]], a, edge); bow(c, 48, 84, 7, b, a, edge); break;
      case 'cake_carousel':
        ellipse(c, 50, 91, 44, 5, a, edge); line(c, [[50, 89], [50, 20]], d, 4); ellipse(c, 50, 78, 39, 7, b, edge); poly(c, [[8, 26], [50, 3], [92, 26]], a, edge); line(c, [[9, 27], [91, 27]], b, 6);
        for (const x of [25, 50, 75]) { line(c, [[x, 28], [x, 65]], d, 1.3); box(c, x - 9, 62, 18, 14, 3, '#E6BE91', edge); cloud(c, x, 61, 7, '#FFF0DD', edge); ellipse(c, x, 55, 2, 3, '#CE8D9D'); } star(c, 50, 5, 6, '#F0D287', edge); break;
      case 'watering_can':
        ellipse(c, 77, 49, 18, 25, null, d, 7); poly(c, [[27, 40], [5, 20], [1, 37], [27, 65]], a, edge); box(c, 22, 27, 53, 60, 14, a, edge); box(c, 28, 20, 40, 12, 5, b, edge); flower(c, 48, 57, 14, '#FFF0CB', d); for (const p of [[6, 51], [12, 64], [4, 76]]) ellipse(c, p[0], p[1], 2.5, 4, '#A6C7D5'); break;
      case 'star_trophy':
        ellipse(c, 23, 42, 16, 18, null, d, 5); ellipse(c, 77, 42, 16, 18, null, d, 5); c.beginPath(); c.moveTo(23, 22); c.lineTo(77, 22); c.quadraticCurveTo(75, 60, 50, 64); c.quadraticCurveTo(25, 60, 23, 22); c.closePath(); c.fillStyle = b; c.fill(); c.strokeStyle = edge; c.lineWidth = 1.8; c.stroke(); box(c, 44, 61, 12, 23, 4, b, edge); box(c, 23, 84, 54, 11, 4, a, edge); star(c, 50, 40, 13, '#FFF3C5', edge); break;
      case 'dress_stand':
        ellipse(c, 50, 94, 28, 4, d, edge); line(c, [[50, 92], [50, 12]], d, 4); ellipse(c, 50, 10, 5, 5, b, edge); poly(c, [[35, 22], [65, 22], [60, 48], [84, 82], [16, 82], [40, 48]], a, edge); line(c, [[36, 47], [64, 47]], b, 5); bow(c, 50, 48, 10, b, a, edge); for (const x of [28, 43, 58, 73]) flower(c, x, 73, 4, b, d); break;
      case 'tripod_camera':
        line(c, [[50, 52], [15, 95]], d, 5); line(c, [[50, 52], [84, 95]], d, 5); line(c, [[50, 55], [50, 96]], d, 4); box(c, 8, 18, 84, 42, 9, a, edge); box(c, 17, 9, 25, 13, 4, b, edge); box(c, 70, 22, 14, 9, 3, b, edge); ellipse(c, 49, 39, 19, 17, d, edge); ellipse(c, 49, 39, 13, 12, '#C1D7DE', edge); ellipse(c, 45, 35, 4, 4, '#FFF9EC'); star(c, 79, 10, 5, '#EBD49C'); break;
      case 'rainbow_arch':
        rainbow(c, 50, 81, 43, 7, 5); cloud(c, 13, 83, 11, '#FFF4E0', edge); cloud(c, 87, 83, 11, '#FFF4E0', edge); star(c, 50, 14, 8, b, edge); break;
      case 'cozy_fireplace':
        box(c, 9, 25, 82, 66, 7, a, edge); box(c, 2, 17, 96, 12, 5, b, edge); box(c, 21, 43, 58, 42, 18, '#907982', edge); line(c, [[33, 76], [68, 80]], '#B49475', 5); line(c, [[34, 82], [65, 73]], '#BE9E7C', 5);
        for (const [x, y, size, color] of [[42, 66, 12, '#E5BA84'], [57, 64, 15, '#E9C58F'], [51, 73, 9, '#F9DFA4']]) { c.beginPath(); c.moveTo(x, y - size); c.bezierCurveTo(x - size, y, x - size * .5, y + size, x, y + size); c.bezierCurveTo(x + size, y + size, x + size, y, x, y - size); c.fillStyle = color; c.fill(); }
        box(c, 23, 6, 16, 11, 2, '#B7C8AA', edge); box(c, 64, 5, 13, 12, 2, '#E3BCC9', edge); heart(c, 50, 35, 6, b, edge); break;
      default: return false;
    }
    return true;
  }
  function draw(c, def, x, y, item) {
    if (!def || !['resident_gift', 'achievement'].includes(def.template) && !(def.expanded && def.template === 'window')) return false;
    if (def.template !== 'window' && !motifs.has(def.motif)) return false;
    const palette = G.data.themes[def.theme] && G.data.themes[def.theme].palette || ['#E8C39E', '#FFF1D9', '#A87960'], a = validColor(item && item.color, palette[0]), b = palette[1], d = palette[2], edge = shade(a, -34), w = Number(def.w) || 50, h = Number(def.h) || 60;
    c.save(); c.translate(x, y); if (item && item.flip) { c.translate(w, 0); c.scale(-1, 1); } c.scale(w / 100, h / 100); c.lineCap = 'round'; c.lineJoin = 'round';
    if (def.place !== 'wall' && def.place !== 'ceiling') ellipse(c, 50, 97, 42, 3, '#795F671A');
    let painted;
    if (def.template === 'window') { windowShape(c, def, a, b, d, edge); painted = true; }
    else painted = paint(c, def.motif, a, b, d, edge);
    c.restore(); return painted;
  }
  G.draw = G.draw || {}; G.draw.furnitureExtra = draw;
})(window.Game);
