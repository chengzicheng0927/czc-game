/* 十八件节日小物：复用绘本描边，全部以 Canvas 手绘，无图片资源。 */
(function (G) {
  'use strict';
  const ink = '#8D6870', gold = '#E5BE6D', cream = '#FFF5D9', pink = '#EAA9BC', mint = '#A9CDB2';
  const tau = Math.PI * 2;
  function ellipse(c, x, y, rx, ry, fill, stroke = ink, width = 1.6) {
    c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, tau);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
  }
  function line(c, x, y, xx, yy, color = ink, width = 1.6) {
    c.beginPath(); c.moveTo(x, y); c.lineTo(xx, yy); c.strokeStyle = color; c.lineWidth = width; c.stroke();
  }
  function shape(c, points, fill, stroke = ink, width = 1.6) {
    c.beginPath(); points.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.closePath();
    c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
  }
  function box(c, x, y, w, h, radius, fill, stroke = ink, width = 1.6) {
    c.beginPath(); c.moveTo(x + radius, y); c.arcTo(x + w, y, x + w, y + h, radius); c.arcTo(x + w, y + h, x, y + h, radius); c.arcTo(x, y + h, x, y, radius); c.arcTo(x, y, x + w, y, radius); c.closePath();
    c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
  }
  function curve(c, points, color = ink, width = 1.6) {
    c.beginPath(); c.moveTo(points[0], points[1]); c.bezierCurveTo(...points.slice(2)); c.strokeStyle = color; c.lineWidth = width; c.stroke();
  }
  function words(c, value, x, y, size = 18, color = ink) {
    c.font = '600 ' + size + 'px "PingFang SC", "Microsoft YaHei", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = color; c.fillText(value, x, y);
  }
  function star(c, x, y, r, fill = gold) {
    const points = Array.from({ length: 10 }, (_, i) => { const angle = i * Math.PI / 5 - Math.PI / 2, radius = i % 2 ? r * .47 : r; return [x + Math.cos(angle) * radius, y + Math.sin(angle) * radius]; });
    shape(c, points, fill, '#B59564', 1.1);
  }
  function heart(c, x, y, size, fill = pink) {
    c.beginPath(); c.moveTo(x, y + size * .65); c.bezierCurveTo(x - size * 1.25, y, x - size * .65, y - size * .9, x, y - size * .3); c.bezierCurveTo(x + size * .65, y - size * .9, x + size * 1.25, y, x, y + size * .65); c.closePath(); c.fillStyle = fill; c.fill(); c.strokeStyle = ink; c.lineWidth = 1.5; c.stroke();
  }
  function face(c, x, y, scale = 1) {
    ellipse(c, x - 7 * scale, y, 1.6 * scale, 2 * scale, ink, null); ellipse(c, x + 7 * scale, y, 1.6 * scale, 2 * scale, ink, null);
    curve(c, [x - 3 * scale, y + 5 * scale, x - scale, y + 8 * scale, x + scale, y + 8 * scale, x + 3 * scale, y + 5 * scale], ink, 1.2);
    ellipse(c, x - 12 * scale, y + 4 * scale, 3.4 * scale, 1.8 * scale, '#EDB3BD', null); ellipse(c, x + 12 * scale, y + 4 * scale, 3.4 * scale, 1.8 * scale, '#EDB3BD', null);
  }
  function bow(c, x, y, size = 7, color = pink) {
    ellipse(c, x - size * .65, y, size * .75, size * .5, color); ellipse(c, x + size * .65, y, size * .75, size * .5, color); ellipse(c, x, y, size * .3, size * .34, color);
  }
  function leaf(c, x, y, rotation, size = 11) {
    c.save(); c.translate(x, y); c.rotate(rotation); ellipse(c, 0, 0, size, size * .42, mint, '#80A88C', 1); line(c, -size * .7, 0, size * .7, 0, '#80A88C', .7); c.restore();
  }
  function balloon(c, x, y, color, rx = 14, ry = 18) {
    ellipse(c, x, y, rx, ry, color); shape(c, [[x, y + ry - 1], [x - 3, y + ry + 4], [x + 3, y + ry + 4]], color);
    curve(c, [x - rx * .45, y - ry * .3, x - rx * .55, y - ry * .68, x - 2, y - ry * .78, x + 1, y - ry * .7], '#FFF7EF', 2.5);
  }
  const drawings = {
    lantern(c) {
      line(c, 50, 3, 50, 17, '#C59B68', 2); box(c, 30, 14, 40, 6, 2, gold);
      ellipse(c, 50, 43, 34, 27, '#DFA19A'); ellipse(c, 50, 43, 22, 27, '#EEB2A0', '#B77E78', 1); ellipse(c, 50, 43, 9, 27, '#F3C4A5', '#C58D7A', 1);
      box(c, 30, 66, 40, 6, 2, gold); line(c, 50, 72, 50, 82, '#C59B68', 2); ellipse(c, 50, 81, 4, 4, gold);
      [44, 47, 50, 53, 56].forEach((x, i) => line(c, x, 84, x + (i - 2), 96 - Math.abs(i - 2), '#CA8883', 1.6));
    },
    couplets(c) {
      box(c, 9, 5, 21, 87, 3, '#DFA39D'); box(c, 70, 5, 21, 87, 3, '#DFA39D');
      ['春', '风', '送', '暖'].forEach((letter, i) => words(c, letter, 19.5, 20 + i * 19, 13, cream));
      ['万', '事', '如', '意'].forEach((letter, i) => words(c, letter, 80.5, 20 + i * 19, 13, cream));
      box(c, 33, 5, 34, 15, 3, '#DFA39D'); words(c, '迎春', 50, 12, 10, cream);
      drawings.fu(c, true);
    },
    fu(c, compact) {
      c.save(); c.translate(50, compact ? 54 : 46); c.scale(compact ? .48 : 1, compact ? .48 : 1); c.rotate(Math.PI / 4); box(c, -27, -27, 54, 54, 4, '#DDA099', '#B77F7A', 2); box(c, -23, -23, 46, 46, 2, '#DDA099', '#F4D391', 1); c.rotate(-Math.PI / 4); words(c, '福', 0, 1, 29, cream); c.restore();
      if (!compact) { line(c, 50, 85, 50, 96, '#C19D70', 2); ellipse(c, 50, 88, 3, 4, gold); }
    },
    red_envelope(c) {
      line(c, 50, 2, 50, 14, gold, 2); bow(c, 50, 14, 6, gold);
      box(c, 17, 20, 66, 68, 7, '#DFA19B'); shape(c, [[20, 23], [50, 48], [80, 23]], '#EDB6A5');
      ellipse(c, 50, 59, 17, 17, '#F0CE8E', '#B89263'); words(c, '福', 50, 60, 21, '#A76F69');
      line(c, 28, 80, 72, 80, '#EDC6A2', 1); [44, 50, 56].forEach(x => line(c, x, 88, x, 97, gold, 2));
    },
    heart_balloon(c) {
      curve(c, [34, 49, 25, 67, 57, 72, 46, 94], '#BF9CA4', 1.3); curve(c, [69, 38, 77, 61, 49, 73, 46, 94], '#BF9CA4', 1.3);
      heart(c, 34, 29, 26, '#E8A4B9'); heart(c, 69, 25, 22, '#C9B5DA'); bow(c, 46, 90, 5, '#E8B9A6');
      curve(c, [20, 26, 16, 15, 28, 12, 30, 18], '#FFF2E9', 2);
    },
    rose_bouquet(c) {
      [[29, 30], [50, 20], [71, 31]].forEach(([x, y]) => line(c, x, y, 49, 85, '#85A78C', 2)); leaf(c, 32, 54, -.4, 13); leaf(c, 65, 51, .3, 13);
      [[29, 29], [50, 20], [71, 31], [49, 43]].forEach(([x, y], i) => {
        for (let petal = 0; petal < 5; petal++) { const angle = petal * tau / 5; ellipse(c, x + Math.cos(angle) * 6, y + Math.sin(angle) * 6, 8, 7, i % 2 ? '#E7ADB7' : '#D991A7', '#BB7D90', 1); }
        curve(c, [x - 6, y, x - 3, y - 7, x + 9, y - 2, x, y + 5], '#B9788A', 1.4);
      });
      shape(c, [[16, 49], [50, 66], [83, 49], [60, 93], [41, 93]], '#F2DEC3', '#C1A78E'); bow(c, 51, 77, 9, pink);
    },
    color_balloons(c) {
      [[23, 30], [47, 22], [75, 32], [37, 47], [65, 48]].forEach(([x, y], i) => { curve(c, [x, y + 17, x - 4, 72, 49, 66, 49, 94], '#C3ABB0', 1); balloon(c, x, y, ['#D9B2CE', '#EBD292', '#A9CCDC', '#E8A9B6', '#B7D3B4'][i], 15, 18); }); bow(c, 49, 91, 5, gold);
    },
    carousel(c) {
      ellipse(c, 50, 88, 43, 8, '#D2B4CC'); box(c, 8, 80, 84, 10, 5, '#E5C9CF');
      [25, 50, 75].forEach(x => line(c, x, 30, x, 81, gold, 2));
      [29, 70].forEach((x, i) => {
        ellipse(c, x, 60 + i * 2, 15, 8, i ? '#BDD5C0' : '#EABAC6'); ellipse(c, x + 12, 50 + i * 2, 5, 9, cream); shape(c, [[x + 9, 44 + i * 2], [x + 9, 35 + i * 2], [x + 14, 44 + i * 2]], cream);
        line(c, x - 8, 65, x - 12, 74, '#A98B7F', 2); line(c, x + 7, 65, x + 11, 75, '#A98B7F', 2); ellipse(c, x + 14, 48 + i * 2, 1, 1, ink, null); curve(c, [x - 14, 58, x - 23, 48, x - 21, 65, x - 27, 60], '#B997B1', 3);
      });
      shape(c, [[5, 31], [50, 7], [95, 31]], cream); shape(c, [[19, 31], [50, 7], [38, 31]], pink, '#C493A5', 1); shape(c, [[61, 31], [50, 7], [80, 31]], pink, '#C493A5', 1); box(c, 4, 29, 92, 8, 4, '#F0D1A2'); star(c, 50, 7, 6);
    },
    rabbit_lantern(c) {
      curve(c, [25, 39, 20, 0, 80, 0, 75, 39], '#C49B71', 2.3); ellipse(c, 50, 89, 32, 6, '#EDD398');
      ellipse(c, 37, 30, 8, 24, cream, '#CDB496'); ellipse(c, 62, 30, 8, 24, cream, '#CDB496'); ellipse(c, 37, 31, 3, 15, '#F0C1C3', null); ellipse(c, 62, 31, 3, 15, '#F0C1C3', null);
      ellipse(c, 50, 67, 31, 22, '#FFF1CC', '#CDB496'); ellipse(c, 49, 49, 27, 22, '#FFF8DF', '#CDB496'); face(c, 49, 49); bow(c, 50, 73, 7, '#DDB2B8');
    },
    mooncake_box(c) {
      box(c, 9, 18, 82, 30, 5, '#C5D4B9', '#91AC93'); words(c, '月满小屋', 50, 33, 13, '#6F8C77'); box(c, 6, 43, 88, 45, 6, '#EBD0AF');
      [30, 71].forEach((x, i) => {
        for (let petal = 0; petal < 10; petal++) { const angle = petal * tau / 10; ellipse(c, x + Math.cos(angle) * 12, 64 + Math.sin(angle) * 10, 6, 6, '#E3BE85', '#BD986B', 1); }
        ellipse(c, x, 64, 13, 11, '#F2D49E', '#BD986B', 1); words(c, i ? '圆' : '月', x, 65, 11, '#A78261');
      });
    },
    pumpkin_lantern(c) {
      ellipse(c, 50, 84, 41, 7, '#E7CFB2', null); curve(c, [49, 24, 39, 5, 62, 4, 56, 19], '#91AC80', 7); leaf(c, 68, 20, -.4, 11);
      ellipse(c, 29, 56, 21, 31, '#E2AA78', '#BA8D66'); ellipse(c, 70, 56, 21, 31, '#E2AA78', '#BA8D66'); ellipse(c, 50, 57, 29, 34, '#F1C18C', '#C4976D');
      face(c, 50, 54, 1.35); ellipse(c, 50, 65, 4, 3, '#FFE7AA', '#C4976D', 1); line(c, 49, 65, 51, 65, '#B38B64', 1);
    },
    friendly_ghost(c) {
      ellipse(c, 50, 90, 31, 5, '#D5D8DE', null); c.beginPath(); c.moveTo(19, 84); c.bezierCurveTo(20, 54, 16, 14, 49, 13); c.bezierCurveTo(78, 12, 79, 48, 84, 81); c.bezierCurveTo(75, 78, 72, 94, 62, 84); c.bezierCurveTo(52, 98, 45, 82, 38, 88); c.bezierCurveTo(29, 98, 25, 82, 19, 84); c.closePath(); c.fillStyle = '#F9F7E9'; c.fill(); c.strokeStyle = '#B9B6C4'; c.lineWidth = 1.8; c.stroke();
      face(c, 49, 44, 1.1); curve(c, [21, 57, 9, 44, 4, 64, 19, 66], '#B9B6C4', 1.5); curve(c, [77, 58, 91, 42, 97, 57, 84, 67], '#B9B6C4', 1.5); heart(c, 50, 71, 9, '#E7B4C3');
    },
    christmas_tree(c) {
      box(c, 43, 77, 14, 18, 3, '#C2A180');
      [[16, 83, 50, 39, 84, 83], [22, 65, 50, 23, 78, 65], [29, 45, 50, 9, 71, 45]].forEach((p, i) => shape(c, [[p[0], p[1]], [p[2], p[3]], [p[4], p[5]]], ['#A8C7AA', '#B3CFB3', '#BFD7BB'][i], '#87A98D', 1.7));
      curve(c, [30, 48, 42, 60, 54, 52, 67, 61], '#E7CEA0', 2); curve(c, [25, 70, 40, 83, 62, 68, 76, 79], '#E7CEA0', 2);
      [[48, 34], [38, 56], [61, 50], [40, 76], [65, 73]].forEach(([x, y], i) => ellipse(c, x, y, 3.4, 4, i % 2 ? '#E4A2B0' : '#F6D78F', '#B3977E', 1)); star(c, 50, 10, 9);
    },
    stocking(c) {
      line(c, 61, 5, 71, 17, '#B18A84', 2); c.beginPath(); c.moveTo(43, 23); c.lineTo(76, 24); c.lineTo(75, 61); c.bezierCurveTo(76, 76, 63, 88, 47, 91); c.bezierCurveTo(26, 94, 11, 85, 15, 72); c.bezierCurveTo(17, 63, 33, 61, 42, 61); c.closePath(); c.fillStyle = '#DFA7AD'; c.fill(); c.strokeStyle = ink; c.lineWidth = 1.7; c.stroke();
      box(c, 37, 16, 43, 15, 5, '#E7EBD7', '#A5B89E'); star(c, 58, 48, 9, cream); curve(c, [18, 73, 25, 75, 29, 82, 29, 88], '#F1D4C5', 2); box(c, 64, 65, 9, 11, 3, '#C6D1B6', '#91AB91', 1);
    },
    snowman(c) {
      line(c, 27, 63, 8, 49, '#B3937B', 2); line(c, 15, 54, 12, 44, '#B3937B', 1.5); line(c, 74, 63, 93, 49, '#B3937B', 2); line(c, 88, 53, 89, 43, '#B3937B', 1.5);
      ellipse(c, 50, 73, 29, 24, '#F7F6EC', '#B8C5C6'); ellipse(c, 50, 39, 23, 21, '#FAF7EA', '#B8C5C6'); face(c, 50, 37, .9); shape(c, [[49, 43], [49, 48], [65, 46]], '#E4B47F', '#BA8E69', 1);
      box(c, 26, 53, 48, 9, 4, '#DCA8B7'); box(c, 59, 58, 9, 18, 3, '#DCA8B7'); [71, 81].forEach(y => ellipse(c, 49, y, 2, 2.5, '#A5B9B1', null)); box(c, 25, 20, 50, 7, 3, '#AEC6B4'); box(c, 34, 5, 30, 19, 4, '#AEC6B4');
    },
    birthday_cake(c) {
      ellipse(c, 50, 91, 44, 6, '#C8D7C7'); box(c, 14, 53, 72, 32, 7, '#ECC0C3'); box(c, 23, 29, 54, 31, 7, '#F1D6AC');
      box(c, 21, 26, 58, 11, 5, '#FFF8E6', '#D9BFAB'); box(c, 12, 49, 76, 13, 5, '#FFF8E6', '#D9BFAB');
      [24, 38, 52, 66, 78].forEach((x, i) => ellipse(c, x, 62 + (i % 2) * 3, 4, 5, '#FFF8E6', null));
      [34, 50, 66].forEach((x, i) => { box(c, x - 2, 12, 4, 15, 1, i % 2 ? '#BCD7CB' : '#E9B0C7', '#B19B9F', .8); ellipse(c, x, 7, 2.5, 4, '#F2D17E', '#CFB16D', 1); });
      [[28, 47], [50, 45], [72, 47]].forEach(([x, y]) => { ellipse(c, x, y, 4, 5, '#D992A4', '#BC7C8F', 1); leaf(c, x, y - 5, 0, 3); }); bow(c, 50, 76, 7, '#CE92A8');
    },
    birthday_crown(c) {
      shape(c, [[11, 26], [30, 44], [50, 12], [70, 44], [90, 26], [81, 79], [20, 79]], '#F0D392', '#BB9A68', 2); box(c, 18, 73, 65, 15, 5, '#E8BE7B', '#BB9A68');
      [[11, 26], [50, 12], [90, 26]].forEach(([x, y]) => ellipse(c, x, y, 4, 4, '#F8E8B7', '#BB9A68', 1));
      [[33, 59], [50, 52], [68, 59]].forEach(([x, y], i) => ellipse(c, x, y, i === 1 ? 6 : 4, i === 1 ? 8 : 5, ['#D3B6D6', '#E6A0B5', '#BAD5C6'][i], '#B9998B', 1));
      line(c, 27, 81, 74, 81, '#F7E5B4', 1.2);
    },
    birthday_hat(c) {
      shape(c, [[19, 86], [50, 13], [82, 86]], '#D4B7D8', '#A68BAE', 2);
      shape(c, [[26, 69], [33, 52], [67, 52], [74, 69]], '#F2D9A8', '#C4B19A', 1);
      shape(c, [[40, 36], [45, 24], [56, 27], [61, 40]], '#EDBAC7', '#BE98AE', 1);
      ellipse(c, 50, 13, 9, 9, '#F4DDAA', '#C1A984', 1.5); ellipse(c, 50, 86, 34, 7, '#E7CCDA', '#B799B1', 1.5);
      star(c, 50, 64, 7, '#FFF2CB'); curve(c, [26, 91, 38, 103, 63, 103, 75, 91], '#CDB6BD', 1.2);
    }
  };
  function draw(c, def, x = 0, y = 0, opts = {}) {
    const painter = drawings[def && def.motif]; if (!painter || !c) return false;
    const w = Number(def.w) || 80, h = Number(def.h) || 80;
    c.save(); c.translate(x, y); c.scale(w / 100, h / 100); c.lineCap = 'round'; c.lineJoin = 'round';
    // 翻转、选中状态与夜灯光晕由统一家具绘制入口负责。
    painter(c); c.restore(); return true;
  }
  G.draw = G.draw || {}; G.draw.festival = { draw, motifs: Object.keys(drawings) };
})(window.Game);
