/* 五件花园成品共用缩略图、场景和照片入口；不持有画布或持续动画。 */
(function (G) {
  'use strict';
  const ids = new Set(['craft_tulip_vase', 'craft_pumpkin_lantern', 'craft_sakura_tree', 'cake_strawberry_deluxe', 'cake_blueberry_deluxe']);
  const edge = '#A58382', TAU = Math.PI * 2;
  function oval(c, x, y, rx, ry, fill, stroke) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1.7; c.stroke(); } }
  function box(c, x, y, w, h, r, fill, stroke) { c.beginPath(); c.roundRect(x, y, w, h, r); c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1.6; c.stroke(); } }
  function line(c, x1, y1, x2, y2, color, width) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.strokeStyle = color; c.lineWidth = width || 1.6; c.stroke(); }
  function poly(c, points, fill, stroke) { c.beginPath(); points.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1.5; c.stroke(); } }
  function blossom(c, x, y, radius, fill) { for (let i = 0; i < 5; i++) { const a = i * TAU / 5 - Math.PI / 2; oval(c, x + Math.cos(a) * radius * .58, y + Math.sin(a) * radius * .58, radius * .48, radius * .46, fill); } oval(c, x, y, radius * .22, radius * .22, '#F7E4A6'); }
  function leaf(c, x, y, width, height, angle) { c.save(); try { c.translate(x, y); c.rotate(angle); oval(c, 0, 0, width, height, '#9DB78D', '#86A680'); } finally { c.restore(); } }
  function tulip(c, x, y, color) {
    c.beginPath(); c.moveTo(x - 11, y - 6); c.lineTo(x - 5, y - 2); c.lineTo(x, y - 9); c.lineTo(x + 5, y - 2); c.lineTo(x + 11, y - 6); c.bezierCurveTo(x + 13, y + 12, x + 5, y + 17, x, y + 17); c.bezierCurveTo(x - 6, y + 17, x - 13, y + 12, x - 11, y - 6); c.closePath(); c.fillStyle = color; c.fill(); c.strokeStyle = '#C994A4'; c.lineWidth = 1.5; c.stroke();
  }
  function vase(c) {
    [[28, 19, 37, 65], [51, 12, 51, 65], [74, 23, 63, 65]].forEach(([x, y, tx, ty]) => line(c, x, y + 10, tx, ty, '#89A784', 3));
    leaf(c, 35, 44, 6, 13, -.55); leaf(c, 63, 46, 6, 12, .65);
    tulip(c, 28, 19, '#EAA6BB'); tulip(c, 51, 12, '#F4CFAC'); tulip(c, 74, 23, '#EEC0D1');
    c.beginPath(); c.moveTo(31, 59); c.lineTo(69, 59); c.bezierCurveTo(67, 72, 79, 91, 63, 96); c.lineTo(37, 96); c.bezierCurveTo(21, 91, 33, 72, 31, 59); c.closePath(); c.fillStyle = '#C2DFE1'; c.fill(); c.strokeStyle = '#8FAFB6'; c.lineWidth = 1.8; c.stroke();
    oval(c, 50, 59, 19, 4, '#DFEEF0', '#8FAFB6'); line(c, 38, 72, 36, 86, '#ECF7F3', 3); blossom(c, 53, 80, 8, '#FFF7E8');
  }
  function pumpkin(c) {
    oval(c, 50, 91, 38, 6, '#C4B99C35');
    poly(c, [[46, 27], [47, 7], [58, 4], [55, 27]], '#96A887', '#7C9678'); leaf(c, 69, 17, 12, 5, -.3);
    oval(c, 30, 58, 23, 31, '#DCA06C', '#B78D73'); oval(c, 71, 58, 22, 31, '#E2A473', '#B78D73'); oval(c, 50, 57, 25, 35, '#F0BC84', '#C19572');
    c.strokeStyle = '#D29F74'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(39, 30); c.bezierCurveTo(31, 46, 31, 71, 39, 85); c.stroke(); c.beginPath(); c.moveTo(61, 30); c.bezierCurveTo(68, 46, 68, 71, 61, 85); c.stroke();
    // 圆眼与月牙笑嘴，让万圣节装饰仍然温柔。
    oval(c, 37, 54, 5, 7, '#8E725D'); oval(c, 64, 54, 5, 7, '#8E725D'); oval(c, 36, 52, 2, 3, '#FFF0AE'); oval(c, 63, 52, 2, 3, '#FFF0AE');
    c.beginPath(); c.moveTo(35, 69); c.quadraticCurveTo(50, 82, 66, 68); c.quadraticCurveTo(53, 91, 35, 69); c.closePath(); c.fillStyle = '#8E725D'; c.fill(); c.strokeStyle = '#FFF0AE'; c.lineWidth = 1.7; c.stroke(); oval(c, 26, 65, 5, 2.5, '#E79B88'); oval(c, 75, 65, 5, 2.5, '#E79B88');
  }
  function sakura(c) {
    oval(c, 50, 95, 42, 4, '#93A28625');
    poly(c, [[45, 41], [55, 41], [59, 95], [40, 95]], '#C5A18C', '#AD8B76'); line(c, 48, 65, 24, 43, '#B8947D', 5); line(c, 53, 58, 78, 36, '#B8947D', 4); line(c, 49, 83, 50, 60, '#D9B99D', 2);
    [[22, 37, 19, '#EAAFC5'], [44, 22, 26, '#F1BED0'], [72, 29, 23, '#EAAEC5'], [83, 46, 15, '#F1C7D5'], [47, 46, 27, '#F0BCD0']].forEach(([x, y, r, fill]) => oval(c, x, y, r, r * .86, fill, '#D9A0BA'));
    [[17, 32, 6], [36, 14, 6], [56, 25, 7], [78, 20, 5], [77, 43, 6], [34, 43, 7], [54, 54, 5], [14, 48, 4]].forEach(([x, y, r], i) => blossom(c, x, y, r, i % 2 ? '#FFE2EC' : '#FFF0F4'));
    [[16, 91], [27, 94], [73, 92], [85, 96]].forEach(([x, y], i) => oval(c, x, y, 3, 1.5, i % 2 ? '#EAAFC5' : '#F5CAD8'));
  }
  function berry(c, x, y, blueberry) {
    if (blueberry) {
      [[-5, 1], [5, 1], [0, -5]].forEach(([dx, dy]) => { oval(c, x + dx, y + dy, 5, 5, '#8E9BC9', '#7887B1'); oval(c, x + dx - 1, y + dy - 1, 1.2, 1.2, '#DDE5F4'); });
      leaf(c, x + 8, y - 7, 5, 2.5, -.5); return;
    }
    c.beginPath(); c.moveTo(x, y + 9); c.bezierCurveTo(x - 14, y - 2, x - 6, y - 11, x, y - 7); c.bezierCurveTo(x + 7, y - 11, x + 14, y - 2, x, y + 9); c.closePath(); c.fillStyle = '#DF8E9F'; c.fill(); c.strokeStyle = '#C2798D'; c.lineWidth = 1; c.stroke();
    [[-3, -2], [3, 0], [0, 5]].forEach(([dx, dy]) => oval(c, x + dx, y + dy, .9, 1.3, '#F8E4B7')); leaf(c, x - 3, y - 8, 5, 2.4, -.4); leaf(c, x + 3, y - 8, 5, 2.4, .4);
  }
  function cake(c, blueberry) {
    const filling = blueberry ? '#A8AED7' : '#E8A9B8', cream = '#FFF5E3', sponge = '#E7C293';
    oval(c, 50, 94, 46, 5, '#E9D9D8', '#C6AFB4'); oval(c, 50, 91, 44, 5, '#FFF7E9', '#CDBBB0');
    box(c, 13, 57, 74, 31, 8, sponge, '#C4A183'); box(c, 13, 65, 74, 10, 3, filling); oval(c, 50, 57, 37, 8, cream, '#D5BBAD');
    for (const x of [19, 31, 44, 57, 70, 81]) oval(c, x, 59, 6, 6, cream);
    box(c, 24, 29, 52, 27, 7, sponge, '#C4A183'); box(c, 24, 37, 52, 8, 3, filling); oval(c, 50, 29, 26, 7, cream, '#D5BBAD');
    for (const x of [29, 40, 50, 61, 71]) oval(c, x, 31, 5, 5, cream);
    berry(c, 42, 18, blueberry); berry(c, 61, 18, blueberry);
    if (blueberry) { berry(c, 23, 77, true); oval(c, 76, 71, 3, 3, '#8E9BC9'); }
    else { berry(c, 23, 78, false); blossom(c, 73, 74, 5, '#FFF1D2'); }
  }
  function draw(c, def, x, y, item = {}) {
    if (!c || !def || !ids.has(def.id)) return false;
    c.save();
    try {
      c.translate(x, y); if (item.flip) { c.translate(def.w, 0); c.scale(-1, 1); }
      c.scale(def.w / 100, def.h / 100); c.lineCap = 'round'; c.lineJoin = 'round';
      if (def.id === 'craft_tulip_vase') vase(c);
      else if (def.id === 'craft_pumpkin_lantern') pumpkin(c);
      else if (def.id === 'craft_sakura_tree') sakura(c);
      else cake(c, def.id === 'cake_blueberry_deluxe');
      return true;
    } finally { c.restore(); }
  }
  G.draw = G.draw || {}; G.draw.crafting = draw; G.draw.crafting.draw = draw;
})(window.Game);
