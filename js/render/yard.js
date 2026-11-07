/* 二十件前院家具用同一套柔和描边绘制，形状本身承担识别。 */
(function (G) {
  'use strict';
  const ink = '#9A8176';
  function line(c, x1, y1, x2, y2, color, width = 3) { c.strokeStyle = color; c.lineWidth = width; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
  function oval(c, x, y, rx, ry, fill, stroke) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1.8; c.stroke(); } }
  function rect(c, x, y, w, h, r, fill, stroke = ink) { c.beginPath(); c.roundRect(x, y, w, h, r); c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1.8; c.stroke(); } }
  function poly(c, points, fill, stroke = ink) { c.beginPath(); points.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1.8; c.stroke(); } }
  function flower(c, x, y, size = 7, color = '#EDB5C7') { for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; oval(c, x + Math.cos(a) * size * .55, y + Math.sin(a) * size * .55, size * .46, size * .46, color); } oval(c, x, y, size * .27, size * .27, '#FFF0AE'); }
  function heart(c, x, y, size, fill) { c.fillStyle = fill; c.beginPath(); c.moveTo(x, y + size * .6); c.bezierCurveTo(x - size * 1.4, y - size * .2, x - size * .6, y - size, x, y - size * .4); c.bezierCurveTo(x + size * .6, y - size, x + size * 1.4, y - size * .2, x, y + size * .6); c.fill(); }
  function face(c, x, y) { oval(c, x - 5, y, 1.7, 2, '#826C6F'); oval(c, x + 5, y, 1.7, 2, '#826C6F'); c.strokeStyle = '#A17B83'; c.lineWidth = 1.3; c.beginPath(); c.arc(x, y + 3, 3, .15, Math.PI - .15); c.stroke(); }
  function draw(c, def, x, y, item = {}) {
    if (!c || !def) return;
    const w = def.w, h = def.h, color = item.color || def.color || '#E8C6A3';
    c.save(); c.translate(x, y); if (item.flip) { c.translate(w, 0); c.scale(-1, 1); } c.lineCap = 'round'; c.lineJoin = 'round';
    oval(c, w / 2, h - 4, w * .43, Math.max(3, Math.min(9, h * .09)), '#8B9B7217');
    switch (def.motif) {
      case 'fence':
        rect(c, 2, 17, w - 4, 7, 2, color); rect(c, 2, 34, w - 4, 7, 2, color);
        [8, 33, 58].forEach(left => { rect(c, left, 7, 11, 39, 3, '#FFF4DB'); poly(c, [[left, 9], [left + 5.5, 1], [left + 11, 9]], '#FFF4DB'); }); break;
      case 'path':
        [[12, 14, 11, 8], [32, 12, 12, 9], [47, 18, 8, 6]].forEach(([cx, cy, rx, ry]) => oval(c, cx, cy, rx, ry, color, '#C6B6A4')); line(c, 26, 8, 34, 7, '#FFF6E9', 2); break;
      case 'mailbox':
        rect(c, 21, 35, 8, 52, 3, '#C7AB8F'); rect(c, 5, 12, 40, 38, 14, color); rect(c, 9, 18, 32, 27, 9, '#FFF2DF'); line(c, 13, 24, 35, 24, '#B58D93', 2); heart(c, 25, 36, 7, '#DA9EB0'); line(c, 41, 9, 41, 31, '#B9968B', 2); poly(c, [[41, 9], [48, 12], [41, 17]], '#E4A0B3'); break;
      case 'swing':
        line(c, 27, 13, 5, h - 5, '#C4A481', 8); line(c, w - 27, 13, w - 5, h - 5, '#C4A481', 8); rect(c, 17, 8, w - 34, 12, 5, color); line(c, 39, 21, 39, 105, '#B9AC94', 2.5); line(c, w - 39, 21, w - 39, 105, '#B9AC94', 2.5); rect(c, 29, 102, w - 58, 12, 4, '#E8B3C1'); flower(c, 20, 15, 9); flower(c, w - 20, 15, 8, '#E9D994'); break;
      case 'slide':
        line(c, 25, 22, 9, h - 5, '#B7B2C9', 7); line(c, 48, 22, 48, h - 5, '#B7B2C9', 7); [44, 61, 78, 94].forEach(cy => line(c, 16, cy, 45, cy, '#D8CFE1', 5));
        poly(c, [[43, 23], [61, 23], [100, 83], [124, 86], [124, 98], [94, 98]], color); line(c, 54, 26, 100, 88, '#FFF0DD', 6); rect(c, 35, 9, 29, 16, 5, '#F7D58B'); line(c, 38, 11, 38, 33, '#D996A9', 4); line(c, 63, 11, 63, 35, '#D996A9', 4); break;
      case 'tree':
        poly(c, [[61, 70], [79, 70], [85, 151], [56, 151]], '#C4A086'); line(c, 69, 106, 46, 84, '#B89178', 7); line(c, 74, 94, 94, 73, '#B89178', 6); oval(c, 43, 64, 39, 38, color, '#87B18B'); oval(c, 77, 43, 48, 39, color, '#87B18B'); oval(c, 105, 73, 31, 33, '#BBD8AC', '#8DB490'); oval(c, 63, 80, 36, 31, '#B9D8AD'); flower(c, 29, 54, 6); flower(c, 99, 48, 6, '#FFF1B5'); face(c, 72, 117); break;
      case 'pond':
        oval(c, 75, 34, 72, 31, '#D0C7B0', '#B4B99C'); oval(c, 75, 30, 63, 24, color, '#87B7C0'); oval(c, 76, 28, 51, 16, '#C1E2E4'); line(c, 49, 24, 73, 24, '#E8F5EF', 3); line(c, 82, 37, 100, 37, '#E8F5EF', 2); oval(c, 36, 39, 15, 6, '#A5C5A0'); flower(c, 35, 36, 7, '#F3C1CD'); oval(c, 104, 24, 8, 3, '#E8BD91'); poly(c, [[111, 24], [117, 20], [117, 28]], '#E8BD91', null); break;
      case 'streetlamp':
        rect(c, 11, h - 12, 25, 9, 4, '#BBB1BC'); line(c, 23, 41, 23, h - 11, color, 7); c.strokeStyle = color; c.lineWidth = 6; c.beginPath(); c.moveTo(23, 48); c.quadraticCurveTo(23, 14, 9, 21); c.stroke(); rect(c, 2, 23, 26, 32, 8, '#FFF0B4', '#BAA8A8'); poly(c, [[1, 25], [15, 13], [30, 25]], color); line(c, 15, 27, 15, 49, '#E5D59C', 2); break;
      case 'flowerbed':
        rect(c, 5, 31, w - 10, 23, 8, color); line(c, 12, 43, w - 12, 43, '#C69D8C', 2); [16, 35, 54, 74, 94].forEach((cx, i) => { line(c, cx, 33, cx, 15 + i % 2 * 5, '#99B98E', 3); flower(c, cx, 15 + i % 2 * 5, 10, ['#E9AFC1', '#EFCF84', '#BCA9D8'][i % 3]); }); break;
      case 'bench':
        [17, 87].forEach(cx => line(c, cx, 44, cx, 68, '#A88E78', 6)); rect(c, 7, 12, 98, 31, 6, color); [22, 33].forEach(cy => line(c, 12, cy, 100, cy, '#B89A80', 2)); rect(c, 3, 44, 106, 12, 4, '#E3C8AA'); [10, 101].forEach(cx => { line(c, cx, 35, cx, 49, '#B29780', 5); oval(c, cx, 34, 7, 4, '#E4C7AA', '#B29780'); }); break;
      case 'fountain':
        oval(c, 50, 96, 47, 14, color, '#9AB7BF'); oval(c, 50, 92, 38, 9, '#BADDE0'); rect(c, 43, 53, 14, 39, 5, '#CEDADD'); oval(c, 50, 49, 30, 9, color, '#9AB7BF'); oval(c, 50, 46, 24, 6, '#C9E5E7'); line(c, 50, 44, 50, 13, '#AED5DD', 5); c.strokeStyle = '#B6DCE1'; c.lineWidth = 3; [-1, 1].forEach(sign => { c.beginPath(); c.moveTo(50, 18); c.quadraticCurveTo(50 + sign * 24, 2, 50 + sign * 31, 41); c.stroke(); oval(c, 50 + sign * 31, 44, 3, 5, '#B6DCE1'); }); oval(c, 50, 9, 4, 6, '#BBDDE2'); break;
      case 'windmill':
        poly(c, [[32, 51], [61, 51], [74, 139], [20, 139]], color); poly(c, [[24, 55], [46, 30], [68, 55]], '#C8AC9C'); rect(c, 35, 111, 24, 29, 10, '#F7EBD6'); oval(c, 47, 84, 8, 9, '#BCD7DD', '#B49C8F');
        c.save(); c.translate(46, 39); c.rotate(.35); for (let i = 0; i < 4; i++) { c.rotate(Math.PI / 2); line(c, 0, 0, 0, -34, '#B49885', 3); poly(c, [[0, -9], [0, -36], [12, -34], [8, -10]], '#FFF1CD'); } oval(c, 0, 0, 6, 6, '#D3B192', '#B49885'); c.restore(); break;
      case 'mushroom_lamp':
        rect(c, 21, 28, 19, 38, 8, '#FFF0C7'); oval(c, 30, 66, 22, 5, '#C4B99C'); c.fillStyle = color; c.strokeStyle = '#BC8E9B'; c.lineWidth = 2; c.beginPath(); c.moveTo(3, 33); c.bezierCurveTo(4, -3, 55, -3, 58, 33); c.quadraticCurveTo(30, 45, 3, 33); c.fill(); c.stroke(); oval(c, 18, 20, 5, 5, '#FFF3E3'); oval(c, 37, 13, 6, 5, '#FFF3E3'); oval(c, 47, 27, 4, 4, '#FFF3E3'); face(c, 30, 50); break;
      case 'rabbit_statue':
        oval(c, 30, 87, 26, 6, '#C7C1B3', '#B3AAA0'); oval(c, 30, 65, 20, 23, color, '#B7ABA1'); oval(c, 18, 20, 8, 19, color, '#B7ABA1'); oval(c, 40, 20, 8, 19, color, '#B7ABA1'); oval(c, 18, 20, 3, 12, '#EBC5CE'); oval(c, 40, 20, 3, 12, '#EBC5CE'); oval(c, 29, 43, 21, 19, color, '#B7ABA1'); face(c, 29, 42); heart(c, 30, 69, 8, '#D5AFBB'); break;
      case 'flower_arch':
        c.strokeStyle = color; c.lineWidth = 10; c.beginPath(); c.moveTo(12, 145); c.lineTo(12, 63); c.bezierCurveTo(12, -8, 113, -8, 113, 63); c.lineTo(113, 145); c.stroke(); c.strokeStyle = '#A9C298'; c.lineWidth = 4; c.beginPath(); c.moveTo(13, 142); c.bezierCurveTo(-7, 87, 38, 86, 17, 48); c.quadraticCurveTo(47, -13, 96, 32); c.quadraticCurveTo(125, 70, 110, 139); c.stroke(); [[14, 108], [17, 61], [37, 24], [73, 15], [104, 47], [112, 99]].forEach(([cx, cy], i) => flower(c, cx, cy, 9, i % 2 ? '#F3D893' : '#E9B5C8')); break;
      case 'picnic_mat':
        rect(c, 2, 7, 116, 42, 10, color, '#C99AA9'); c.save(); c.globalAlpha = .5; for (let i = 15; i < 110; i += 22) rect(c, i, 9, 10, 38, 0, '#FFF4E9', null); [17, 35].forEach(cy => rect(c, 4, cy, 112, 8, 0, '#FFF4E9', null)); c.restore(); oval(c, 38, 27, 17, 10, '#FFF4DA', '#D8C3A6'); oval(c, 37, 27, 9, 5, '#E3B793'); rect(c, 72, 15, 31, 24, 8, '#D8B58D'); c.strokeStyle = '#B49678'; c.lineWidth = 3; c.beginPath(); c.arc(87, 18, 12, Math.PI, 0); c.stroke(); break;
      case 'bridge':
        c.fillStyle = color; c.strokeStyle = '#AF8E72'; c.lineWidth = 2; c.beginPath(); c.moveTo(3, 56); c.quadraticCurveTo(65, 18, 127, 56); c.lineTo(127, 64); c.quadraticCurveTo(65, 32, 3, 64); c.closePath(); c.fill(); c.stroke(); [14, 38, 65, 92, 116].forEach((cx, i) => { const cy = 46 - Math.sin(i / 4 * Math.PI) * 19; line(c, cx, cy, cx, cy - 25, '#B49678', 5); }); c.strokeStyle = '#CCAE91'; c.lineWidth = 6; c.beginPath(); c.moveTo(14, 20); c.quadraticCurveTo(65, -3, 116, 20); c.stroke(); break;
      case 'bush':
        oval(c, 20, 42, 18, 23, color, '#87AC86'); oval(c, 45, 30, 26, 28, color, '#87AC86'); oval(c, 68, 45, 21, 21, '#B6D1A8', '#87AC86'); oval(c, 43, 50, 28, 18, color); [[18, 44], [46, 23], [70, 47]].forEach(([cx, cy]) => oval(c, cx, cy, 3, 3, '#DDAAB7')); break;
      case 'stone_lantern':
        rect(c, 11, 85, 41, 10, 4, color); poly(c, [[24, 48], [39, 48], [43, 86], [19, 86]], color); rect(c, 14, 27, 34, 25, 4, '#F9EDBF'); [17, 44].forEach(cx => line(c, cx, 28, cx, 50, '#B0AE9F', 5)); poly(c, [[4, 28], [16, 12], [47, 12], [59, 28]], color); oval(c, 31, 8, 7, 5, '#D6D3C4', '#B0AE9F'); break;
      case 'balloon_stall':
        rect(c, 14, 90, 88, 43, 7, color); rect(c, 8, 84, 100, 10, 4, '#F5D9AC'); oval(c, 29, 137, 8, 6, '#B89AA1'); oval(c, 87, 137, 8, 6, '#B89AA1'); [20, 96].forEach(cx => line(c, cx, 53, cx, 85, '#C7A98F', 5)); rect(c, 14, 49, 89, 15, 5, '#FFF0D0'); [23, 43, 64, 84].forEach((cx, i) => { const cy = 19 + i % 2 * 8; line(c, cx, cy + 17, 58, 84, '#C6B2AC', 1); oval(c, cx, cy, 13, 18, ['#ECB8CC', '#B7D8C1', '#D2C3E6', '#F4D497'][i], '#C1A7B3'); }); heart(c, 58, 112, 9, '#FFF3E1'); break;
    }
    c.restore();
  }
  G.draw = G.draw || {}; G.draw.yard = draw; G.draw.yard.draw = draw;
})(window.Game);
