/* 纯静态阁楼与星群绘图：场景、离屏照片和面板共用，不持有画布或时钟。 */
(function (G) {
  'use strict';
  const ink = '#726079';
  function rr(c, x, y, w, h, r, fill, stroke) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = 2; c.stroke(); }
  }
  function ellipse(c, x, y, rx, ry, fill, stroke) {
    c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = stroke; c.lineWidth = 2; c.stroke(); }
  }
  function line(c, x1, y1, x2, y2, color, width) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.strokeStyle = color; c.lineWidth = width || 2; c.stroke(); }
  function star(c, x, y, r, fill) {
    c.beginPath();
    for (let i = 0; i < 10; i++) { const angle = -Math.PI / 2 + i * Math.PI / 5, radius = i % 2 ? r * .45 : r; const sx = x + Math.cos(angle) * radius, sy = y + Math.sin(angle) * radius; if (i) c.lineTo(sx, sy); else c.moveTo(sx, sy); }
    c.closePath(); c.fillStyle = fill; c.fill();
  }
  function draw(c, x, y, w, h, night) {
    if (!c || !(w > 0) || !(h > 0)) return;
    c.save(); c.translate(x, y); c.scale(w / 320, h / 185);
    // 浅木台座与斜面地板，让剖面阁楼接在既有小屋屋顶上。
    rr(c, 22, 73, 276, 101, 12, '#E8C8AE', '#B69294');
    rr(c, 35, 65, 250, 94, 10, night ? '#C9BEDD' : '#EDE2F4', '#A88DAF');
    c.beginPath(); c.moveTo(35, 84); c.bezierCurveTo(35, -22, 285, -22, 285, 84); c.closePath(); c.fillStyle = night ? '#B6ABD9' : '#D3C8E9'; c.fill(); c.strokeStyle = '#9F8AB2'; c.lineWidth = 3; c.stroke();
    c.beginPath(); c.moveTo(81, 77); c.bezierCurveTo(88, 1, 232, 1, 239, 77); c.lineTo(239, 111); c.lineTo(81, 111); c.closePath(); c.fillStyle = night ? '#4A4D79' : '#BCD4E5'; c.fill(); c.strokeStyle = '#8B7CA1'; c.lineWidth = 3; c.stroke();
    if (night) {
      [[106,49,3],[137,27,3],[181,30,3],[210,56,4],[152,72,2],[191,86,2]].forEach(p => star(c, p[0], p[1], p[2], '#FFF0BC'));
      ellipse(c, 194, 48, 11, 11, '#FFF0C6'); ellipse(c, 198, 44, 10, 10, '#4A4D79');
    } else { ellipse(c, 190, 45, 15, 10, '#E9F4FA'); ellipse(c, 204, 48, 16, 9, '#E9F4FA'); }
    line(c, 81, 83, 239, 83, '#B9A4C7', 5); line(c, 160, 17, 160, 81, '#B9A4C7', 4);
    c.beginPath(); c.moveTo(36, 139); c.lineTo(284, 139); c.lineTo(298, 166); c.lineTo(22, 166); c.closePath(); c.fillStyle = '#F2DDC0'; c.fill(); c.strokeStyle = '#BEA18F'; c.lineWidth = 2; c.stroke();
    [70,119,168,217,266].forEach(px => line(c, px, 140, px - 7, 165, '#DBBBA2', 1));
    rr(c, 17, 166, 286, 13, 5, '#DAB69C', '#B69294');
    // 三脚望远镜的微斜镜筒与暖金色镜圈。
    line(c, 155, 111, 134, 157, ink, 5); line(c, 155, 111, 179, 158, ink, 5); line(c, 155, 111, 155, 155, '#8C7795', 4);
    ellipse(c, 155, 111, 7, 7, '#BCA7C7', ink);
    c.save(); c.translate(161, 92); c.rotate(-.42); rr(c, -44, -13, 87, 26, 8, '#F0CBDA', '#A67C98'); rr(c, -51, -10, 15, 20, 5, '#B49CC2', '#8C7795'); rr(c, 32, -18, 18, 36, 7, '#F6DFAD', '#BD9E79'); ellipse(c, 50, 0, 5, 14, '#A9D5E2', '#8D9FBC'); c.restore();
    // 小凳子、星星挂旗和笔记本只作静态装饰。
    rr(c, 68, 134, 32, 10, 4, '#F6D9C4', '#BE9A91'); line(c, 73, 145, 70, 156, '#BE9A91', 3); line(c, 95, 145, 98, 156, '#BE9A91', 3);
    rr(c, 222, 136, 31, 16, 3, '#FFF0C1', '#C7A586'); line(c, 237, 137, 237, 151, '#C7A586', 1);
    line(c, 51, 97, 51, 121, '#A490AB', 1); star(c, 51, 125, 7, '#F1D591');
    c.restore();
  }
  function drawConstellation(c, def, x, y, w, h) {
    if (!c || !def || !Array.isArray(def.points)) return;
    c.save(); c.translate(x, y); rr(c, 0, 0, w, h, 18, '#454A72');
    for (let i = 0; i < 22; i++) { const px = (i * 71 + 19) % 997 / 997 * w, py = (i * 43 + 31) % 337 / 337 * h; ellipse(c, px, py, 1, 1, '#C3C5E1'); }
    c.beginPath(); def.points.forEach((point, i) => { const px = point[0] * w, py = point[1] * h; if (i) c.lineTo(px, py); else c.moveTo(px, py); }); c.strokeStyle = '#C8BBD8'; c.lineWidth = 1.8; c.stroke();
    def.points.forEach((point, i) => star(c, point[0] * w, point[1] * h, i % 3 ? 4 : 6, '#FFEBB4'));
    c.restore();
  }
  G.draw = G.draw || {}; G.draw.observatory = { draw, drawConstellation };
})(window.Game);
