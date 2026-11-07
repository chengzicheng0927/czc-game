/* 小屋外观的独立绘制层；主场景与试衣预览使用同一套轮廓。 */
(function (G) {
  'use strict';
  const ink = '#A18480', cream = '#FFF2D5', tau = Math.PI * 2;
  function shade(hex, delta) { const value = /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#D9B4B7'; return '#' + [1, 3, 5].map(i => Math.max(0, Math.min(255, parseInt(value.slice(i, i + 2), 16) + delta)).toString(16).padStart(2, '0')).join(''); }
  function line(c, x, y, xx, yy, color = ink, width = 2) { c.beginPath(); c.moveTo(x, y); c.lineTo(xx, yy); c.strokeStyle = color; c.lineWidth = width; c.stroke(); }
  function ellipse(c, x, y, rx, ry, fill, stroke, width = 2) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, tau); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); } }
  function rr(c, x, y, w, h, r, fill, stroke, width = 2) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); } }
  function polygon(c, points, fill, stroke, width = 2) { c.beginPath(); points.forEach((point, i) => i ? c.lineTo(...point) : c.moveTo(...point)); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); } }
  function curve(c, points, color = ink, width = 2) { c.beginPath(); c.moveTo(points[0], points[1]); c.bezierCurveTo(...points.slice(2)); c.strokeStyle = color; c.lineWidth = width; c.stroke(); }
  function heart(c, x, y, size, fill, stroke) { c.beginPath(); c.moveTo(x, y + size * .7); c.bezierCurveTo(x - size * 1.2, y, x - size * .7, y - size, x, y - size * .3); c.bezierCurveTo(x + size * .7, y - size, x + size * 1.2, y, x, y + size * .7); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1.5; c.stroke(); } }
  function star(c, x, y, r, color, stroke) { polygon(c, Array.from({ length: 10 }, (_, i) => { const angle = i * Math.PI / 5 - Math.PI / 2, radius = i % 2 ? r * .45 : r; return [x + Math.cos(angle) * radius, y + Math.sin(angle) * radius]; }), color, stroke, 1); }
  function text(c, value, x, y, size, color) { c.font = '600 ' + size + 'px "PingFang SC", "Microsoft YaHei", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = color; c.fillText(value, x, y); }
  function roofPath(c, type) {
    c.beginPath();
    if (type === 'roof_round' || type === 'roof_starry') { c.moveTo(-532, 7); c.bezierCurveTo(-510, -197, 510, -197, 532, 7); }
    else if (type === 'roof_castle') { [[-530, 8], [-488, -62], [-470, -62], [-470, -105], [-416, -161], [-362, -105], [-362, -60], [-154, -60], [-154, -110], [-80, -179], [-6, -110], [-6, -60], [303, -60], [303, -105], [366, -158], [429, -105], [429, -60], [486, -60], [530, 8]].forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); }
    else if (type === 'roof_mushroom') { c.moveTo(-535, 3); c.bezierCurveTo(-536, -62, -373, -170, 0, -173); c.bezierCurveTo(373, -170, 536, -62, 535, 3); c.bezierCurveTo(341, 34, -341, 34, -535, 3); }
    else if (type === 'roof_strawberry') { c.moveTo(-530, 6); c.bezierCurveTo(-477, -103, -178, -157, 0, -165); c.bezierCurveTo(178, -157, 477, -103, 530, 6); }
    else if (type === 'roof_cloud') { c.moveTo(-533, 6); c.bezierCurveTo(-586, -54, -494, -125, -406, -91); c.bezierCurveTo(-358, -184, -222, -170, -161, -117); c.bezierCurveTo(-88, -211, 87, -185, 144, -117); c.bezierCurveTo(230, -180, 359, -166, 408, -92); c.bezierCurveTo(497, -115, 588, -47, 532, 6); }
    else if (type === 'roof_oriental') { c.moveTo(-543, -63); c.bezierCurveTo(-415, -42, -306, -101, -67, -145); c.quadraticCurveTo(0, -163, 67, -145); c.bezierCurveTo(306, -101, 415, -42, 543, -63); c.quadraticCurveTo(514, -14, 454, 9); c.lineTo(-454, 9); c.quadraticCurveTo(-514, -14, -543, -63); }
    else { c.moveTo(-534, 8); c.lineTo(-410, -122); c.quadraticCurveTo(-402, -130, -387, -130); c.lineTo(387, -130); c.quadraticCurveTo(402, -130, 410, -122); c.lineTo(534, 8); }
    c.closePath();
  }
  function roof(c, { top = 0, exterior = {}, name = '我的小屋' } = {}) {
    const type = exterior.roof || 'roof_triangle', color = exterior.roofColor || '#E7A6B5', edge = shade(color, -33);
    c.save(); c.translate(0, top); c.lineCap = 'round'; c.lineJoin = 'round'; roofPath(c, type); c.fillStyle = color; c.fill(); c.strokeStyle = edge; c.lineWidth = 3; c.stroke();
    c.save(); roofPath(c, type); c.clip();
    if (['roof_triangle', 'roof_round', 'roof_oriental'].includes(type)) {
      for (let row = 0; row < 6; row++) for (let tile = -10; tile <= 10; tile++) { const x = tile * 59 + row % 2 * 30, y = -158 + row * 31; curve(c, [x, y, x - 2, y + 32, x + 57, y + 32, x + 59, y], shade(color, -22), 2); }
    } else if (type === 'roof_mushroom') {
      [[-420, -27, 35, 17], [-275, -98, 48, 20], [-103, -142, 38, 15], [118, -139, 40, 17], [312, -88, 45, 21], [443, -21, 27, 15]].forEach(values => ellipse(c, ...values, '#FFF0D6', shade(color, -10), 2));
    } else if (type === 'roof_strawberry') {
      for (let row = 0; row < 4; row++) for (let i = -5; i <= 5; i++) { const x = i * 84 + row % 2 * 42; ellipse(c, x, -132 + row * 36, 4, 8, '#FFE8AE', '#D5B279', 1); }
    } else if (type === 'roof_starry') {
      [[-424, -24], [-350, -73], [-246, -106], [-170, -135], [183, -128], [273, -106], [367, -65], [448, -16]].forEach(([x, y], i) => star(c, x, y, i % 2 ? 8 : 11, '#F6DDA3', '#BDA178'));
      ellipse(c, -284, -46, 27, 27, '#FFF1BC'); ellipse(c, -272, -55, 25, 25, color);
    } else if (type === 'roof_castle') {
      [-416, -80, 366].forEach((x, i) => { rr(c, x - 12, -97, 24, 27, 11, '#FFF0CE', edge, 2); line(c, x, -95, x, -71, edge, 1.5); });
      for (let x = -495; x < 500; x += 47) rr(c, x, -37, 31, 18, 3, shade(color, 11), edge, 1);
    } else if (type === 'roof_cloud') {
      for (let x = -465; x < 500; x += 110) curve(c, [x, -18, x + 16, -3, x + 45, -9, x + 54, -20], shade(color, 25), 3);
    }
    // 屋顶受光：左上提亮、右下略沉，瓦片多了一点立体感。
    c.save(); roofPath(c, type); c.clip();
    const sheen = c.createLinearGradient(-540, -190, 540, 14); sheen.addColorStop(0, 'rgba(255,255,255,.28)'); sheen.addColorStop(.45, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(70,35,60,.16)');
    c.fillStyle = sheen; c.fillRect(-600, -240, 1200, 270); c.restore();
    c.restore();
    if (type === 'roof_strawberry') {
      [-2, -1, 0, 1, 2].forEach(i => { c.save(); c.translate(0, -161); c.rotate(i * .32); c.beginPath(); c.moveTo(0, 6); c.quadraticCurveTo(-27, -28, i * 35, -49); c.quadraticCurveTo(27, -16, 0, 6); c.fillStyle = i % 2 ? '#A9C39B' : '#B7CDA7'; c.fill(); c.strokeStyle = '#88A580'; c.lineWidth = 2; c.stroke(); c.restore(); });
    }
    if (type === 'roof_castle') { [-416, -80, 366].forEach((x, i) => { const y = i === 1 ? -180 : -162; line(c, x, y, x, y - 23, '#B79A78', 2); polygon(c, [[x, y - 23], [x + 28, y - 16], [x, y - 9]], '#EBCB91', '#B79A78', 1.5); }); }
    rr(c, -535, 2, 1070, 15, 7, shade(color, 16), edge, 2.5);
    if (type === 'roof_mushroom' || type === 'roof_cloud') for (let x = -510; x <= 510; x += 34) ellipse(c, x, 12, 17, 7, shade(color, 23), edge, 1.2);
    rr(c, -145, -99, 290, 62, 24, cream, '#CCAB8D', 3); rr(c, -136, -91, 272, 46, 17, null, '#E8D4B6', 1.3); text(c, String(name).slice(0, 16), 0, -72, 23, '#956A6A');
    ellipse(c, -123, -68, 4, 4, '#DFB6BC'); ellipse(c, 123, -68, 4, 4, '#DFB6BC'); c.restore();
  }
  function wall(c, { x = -496, y = 0, w = 992, h = 240, exterior = {}, preview = false } = {}) {
    const color = exterior.wallColor || '#FFE3C9', edge = shade(color, -30), style = exterior.wall || 'wall_wood';
    c.save(); rr(c, x, y, w, h, 14); if (!preview && w > 36 && h > 32) c.rect(x + 18, y + 16, w - 36, h - 32); c.clip(preview ? 'nonzero' : 'evenodd');
    c.fillStyle = color; c.fillRect(x, y, w, h); c.lineCap = 'round';
    if (style === 'wall_wood') {
      for (let yy = y + 4, row = 0; yy < y + h; yy += 28, row++) { line(c, x, yy, x + w, yy, edge, 1.5); for (let xx = x + row % 2 * 65; xx < x + w; xx += 130) { line(c, xx, yy, xx, yy + 28, edge, 1); curve(c, [xx + 10, yy + 9, xx + 35, yy + 4, xx + 68, yy + 13, xx + 94, yy + 9], shade(color, -13), 1); } }
    } else if (style === 'wall_brick') {
      for (let yy = y, row = 0; yy < y + h; yy += 25, row++) for (let xx = x - 40 + row % 2 * 40; xx < x + w; xx += 80) rr(c, xx + 2, yy + 2, 76, 21, 3, shade(color, row % 2 ? -3 : 4), edge, 1.4);
    } else if (style === 'wall_stone') {
      for (let yy = y, row = 0; yy < y + h; yy += 43, row++) for (let xx = x - 30 + row % 2 * 40; xx < x + w; xx += 86) { polygon(c, [[xx + 5, yy + 7], [xx + 52, yy + 1], [xx + 80, yy + 16], [xx + 70, yy + 38], [xx + 12, yy + 40], [xx + 1, yy + 23]], shade(color, row % 2 ? -8 : 5), edge, 1.5); }
    } else if (style === 'wall_icing') {
      for (let yy = y; yy < y + h; yy += 38) for (let xx = x - 20; xx < x + w; xx += 60) { curve(c, [xx, yy, xx + 12, yy + 29, xx + 48, yy + 29, xx + 60, yy], shade(color, -18), 2.5); ellipse(c, xx + 29, yy + 13, 3, 4, '#FFF6DC'); }
    } else if (style === 'wall_cookie') {
      for (let yy = y; yy < y + h; yy += 48) for (let xx = x - 20; xx < x + w; xx += 84) { rr(c, xx + 2, yy + 2, 80, 44, 10, shade(color, -4), edge, 1.5); [[14, 14], [46, 12], [68, 31], [26, 32]].forEach(([dx, dy]) => ellipse(c, xx + dx, yy + dy, 2.8, 2.3, shade(color, -55))); }
    } else if (style === 'wall_shell') {
      for (let yy = y, row = 0; yy < y + h; yy += 38, row++) for (let xx = x - 30 + row % 2 * 35; xx < x + w; xx += 70) { c.beginPath(); c.moveTo(xx, yy + 34); c.bezierCurveTo(xx - 30, yy + 3, xx + 30, yy - 14, xx + 35, yy + 10); c.bezierCurveTo(xx + 57, yy - 9, xx + 84, yy + 12, xx + 70, yy + 34); c.closePath(); c.fillStyle = shade(color, row % 2 ? 5 : -5); c.fill(); c.strokeStyle = edge; c.lineWidth = 1.2; c.stroke(); [13, 28, 43, 58].forEach(dx => line(c, xx + 35, yy + 33, xx + dx, yy + 10, shade(color, -18), 1)); }
    } else if (style === 'wall_bamboo') {
      for (let xx = x; xx < x + w; xx += 25) { rr(c, xx + 2, y - 5, 19, h + 10, 8, shade(color, -5), edge, 1); for (let yy = y + xx % 23; yy < y + h; yy += 47) { line(c, xx + 1, yy, xx + 22, yy, edge, 2); line(c, xx + 9, yy + 5, xx + 9, yy + 34, shade(color, 15), 1.5); } }
    } else if (style === 'wall_starry') {
      for (let yy = y + 20, row = 0; yy < y + h; yy += 54, row++) for (let xx = x + 20 + row % 2 * 40; xx < x + w; xx += 80) { star(c, xx, yy, 7, shade(color, 23), edge); line(c, xx + 12, yy + 5, xx + 39, yy + 18, shade(color, -15), 1); ellipse(c, xx + 40, yy + 18, 2, 2, edge); }
    }
    c.restore(); rr(c, x, y, w, h, 14, null, edge, 2.5);
  }
  function openingPath(c, type) {
    c.beginPath();
    if (type === 'win_round' || type === 'door_round' || type === 'door_moon') c.ellipse(50, 52, 45, 45, 0, 0, tau);
    else if (type === 'win_heart') { c.moveTo(50, 94); c.bezierCurveTo(-22, 52, 5, -8, 50, 25); c.bezierCurveTo(95, -8, 122, 52, 50, 94); }
    else if (['win_arch', 'door_arch', 'win_stained', 'door_castle'].includes(type)) { c.moveTo(6, 96); c.lineTo(6, 41); if (type === 'win_stained' || type === 'door_castle') { c.quadraticCurveTo(8, 15, 50, 3); c.quadraticCurveTo(92, 15, 94, 41); } else c.bezierCurveTo(6, -8, 94, -8, 94, 41); c.lineTo(94, 96); }
    else { c.moveTo(11, 4); c.lineTo(89, 4); c.quadraticCurveTo(96, 4, 96, 12); c.lineTo(96, 89); c.quadraticCurveTo(96, 97, 89, 97); c.lineTo(11, 97); c.quadraticCurveTo(4, 97, 4, 89); c.lineTo(4, 12); c.quadraticCurveTo(4, 4, 11, 4); }
    c.closePath();
  }
  function windowDraw(c, x, y, w, h, exterior = {}, time) {
    const style = exterior.window || 'win_square', phase = time && typeof time === 'object' ? time : G.sys.time && G.sys.time.current(), night = phase && phase.nightness > .4;
    const glass = night ? '#F5D79A' : '#D7E7E8';
    c.save(); c.translate(x, y); c.scale(w / 100, h / 100); c.lineJoin = 'round';
    if (style === 'win_lace') for (let i = 0; i < 10; i++) { ellipse(c, 7 + i * 9.5, 3, 6, 7, '#F5E4DF', '#C4AAA5', 1); ellipse(c, 7 + i * 9.5, 96, 6, 7, '#F5E4DF', '#C4AAA5', 1); }
    openingPath(c, style); c.fillStyle = cream; c.fill(); c.strokeStyle = '#BFA38B'; c.lineWidth = 3; c.stroke();
    c.save(); c.translate(8, 7); c.scale(.84, .84); openingPath(c, style); c.fillStyle = glass; c.fill(); c.clip();
    if (style === 'win_stained') { [['#D9BAD8', [[0, 0], [50, 48], [0, 75]]], ['#AFD0BE', [[100, 0], [50, 48], [100, 75]]], ['#E9BFAD', [[0, 100], [50, 48], [100, 100]]]].forEach(([color, points]) => polygon(c, points, color, '#B19F94', 1.8)); star(c, 50, 43, 15, '#F6DF9F', '#B19F94'); }
    else { line(c, 50, 2, 50, 99, '#BEA58C', 3); line(c, 3, style === 'win_arch' ? 46 : 50, 97, style === 'win_arch' ? 46 : 50, '#BEA58C', 3); if (!night) line(c, 15, 14, 36, 35, '#F8FAEA', 3); }
    c.restore();
    if (style === 'win_lace') { polygon(c, [[7, 8], [30, 8], [22, 62], [6, 73]], '#E7BCC7', '#BE98A7', 1.4); polygon(c, [[93, 8], [70, 8], [78, 62], [94, 73]], '#E7BCC7', '#BE98A7', 1.4); }
    if (style !== 'win_heart' && style !== 'win_round') rr(c, 0, 95, 100, 6, 2, '#DEC5A7', '#BBA087', 1.4); c.restore();
  }
  function door(c, x, y, w, h, exterior = {}) {
    const style = exterior.door || 'door_wood', base = style === 'door_cake' ? '#DCA9B7' : style === 'door_moon' ? '#B6C3D5' : style === 'door_castle' ? '#C9BCCB' : '#D7B794';
    c.save(); c.translate(x, y); c.scale(w / 100, h / 100); c.lineJoin = 'round'; openingPath(c, style); c.fillStyle = cream; c.fill(); c.strokeStyle = '#BAA089'; c.lineWidth = 3; c.stroke();
    c.save(); c.translate(7, 5); c.scale(.86, .9); openingPath(c, style); c.fillStyle = base; c.fill(); c.clip();
    if (style === 'door_castle') { for (let yy = 27; yy < 100; yy += 21) line(c, 0, yy, 100, yy, '#A89BAB', 1.5); line(c, 50, 12, 50, 100, '#A89BAB', 2.5); [33, 68].forEach(xx => ellipse(c, xx, 64, 5, 6, null, '#A0866D', 2)); }
    else if (style === 'door_cake') { rr(c, 7, 7, 86, 17, 6, '#FFF2DA'); [14, 32, 50, 68, 85].forEach((xx, i) => ellipse(c, xx, 24 + i % 2 * 7, 8, 10, '#FFF2DA')); heart(c, 50, 57, 13, '#F2CDCE', '#B58499'); }
    else if (style === 'door_moon') { ellipse(c, 39, 37, 22, 23, '#FFF0BA'); ellipse(c, 49, 31, 21, 22, base); star(c, 68, 55, 7, '#FFF0BA'); star(c, 34, 72, 5, '#FFF0BA'); }
    else { for (let xx = 19; xx < 100; xx += 20) line(c, xx, 0, xx, 100, '#B69679', 1.5); rr(c, 24, 15, 52, 29, 7, '#DDE6D5', '#B5967C', 2); line(c, 50, 15, 50, 43, '#B5967C', 2); line(c, 25, 30, 75, 30, '#B5967C', 2); }
    c.restore(); if (style !== 'door_castle') ellipse(c, style === 'door_round' ? 52 : 77, 65, 3.7, 3.7, '#E4C88D', '#A68B68', 1.3);
    if (style === 'door_castle') { [0, 90].forEach(xx => { rr(c, xx, 27, 10, 70, 2, '#D4C7CE', '#AB9AA9', 1.5); polygon(c, [[xx - 3, 28], [xx + 5, 12], [xx + 13, 28]], '#C1ADC7', '#AB9AA9', 1.2); }); }
    if (style === 'door_cake') { ellipse(c, 50, 4, 7, 6, '#D995AA', '#AE7D8E', 1.3); polygon(c, [[45, 0], [51, -4], [55, 1]], '#A7C49C', '#88A480', 1); }
    c.restore();
  }
  function chimney(c, { top = 0, exterior = {}, time = 0, reducedMotion = false } = {}) {
    const style = exterior.chimney || 'normal'; if (style === 'none') return;
    c.save(); c.lineCap = 'round'; const color = style === 'heart' ? '#DFA9BC' : '#E4C2AD';
    rr(c, 292, top - 158, 53, 108, 7, color, '#BF9B91', 2.5); rr(c, 284, top - 165, 69, 17, 5, shade(color, 17), '#BF9B91', 2);
    for (let row = 0; row < 4; row++) { const yy = top - 139 + row * 21; line(c, 294, yy, 343, yy, shade(color, -24), 1.5); line(c, row % 2 ? 305 : 327, yy, row % 2 ? 305 : 327, yy + 21, shade(color, -24), 1.2); }
    for (let i = 0; i < 4; i++) { const t = reducedMotion ? .15 + i * .22 : ((Number(time) || 0) * .12 + i * .25) % 1, xx = 319 + t * 25, yy = top - 176 - t * 75; c.globalAlpha = (1 - t) * .4; if (style === 'heart') heart(c, xx, yy, 9 + t * 8, '#F4C4D2'); else { ellipse(c, xx, yy, 13 + t * 11, 8 + t * 9, '#FFFDF4'); ellipse(c, xx - 9, yy + 3, 9 + t * 8, 7 + t * 7, '#FFFDF4'); } }
    c.restore();
  }
  // 全部灵感卡共用一个离屏context；宿主负责有限队列和关闭时释放，不启动动画。
  let previewWorld = null, previewAttempted = false, previewFailure = '';
  function disposePreview() {
    const previous = previewWorld; previewWorld = null; previewAttempted = false; previewFailure = '';
    try { previous?.destroy(); } catch (_) { /* 预览释放不阻断宿主关闭。 */ }
  }
  function houseSnapshot(source, exterior, name) {
    if (!source || !Array.isArray(source.floors) || source.floors.length < 1 || source.floors.length > 4 || source.floors.some(floor => !Array.isArray(floor?.slots) || floor.slots.length !== 3)) throw new Error('invalid-house');
    const rooms = {}, entries = [], floors = source.floors.map((floor, floorIdx) => ({ slots: floor.slots.map((id, slotIdx) => {
      const room = id && source.rooms?.[id];
      if (room) rooms[id] = Object.assign({}, room, { items: [], wallpaper: Object.assign({}, room.wallpaper), floor: Object.assign({}, room.floor) });
      entries.push({ id: room ? id : null, data: room ? rooms[id] : null, floorIdx, slotIdx, x: -480 + slotIdx * 320, y: -220 - floorIdx * 220 });
      return room ? id : null;
    }) }));
    return { house: { name: String(name ?? source.name ?? '我的小屋'), floors, rooms, attic: source.attic ? Object.assign({}, source.attic) : null,
      exterior: Object.assign({}, source.exterior, exterior), yard: Object.assign({}, source.yard, { items: (source.yard?.items || []).map(item => Object.assign({}, item)) }) }, entries };
  }
  function previewFrame(width, height, count, attic) {
    const angle = .43, elevation = .49, ca = Math.cos(angle), sa = Math.sin(angle), ce = Math.cos(elevation), se = Math.sin(elevation);
    // 只框住家园本岛与真实建筑；不沿用主相机的聚焦层或额外四层预览。
    const top = .26 + count * 2.2, bounds = { left: -7.05, right: 7.05, back: -5.9, front: 7.7, bottom: -1.5, top: top + (attic ? 2.67 : 2.07) };
    const centerY = (bounds.top + bounds.bottom) / 2 - ((bounds.front + bounds.back) / 2 - .35) * ca * Math.tan(elevation);
    const points = [];
    for (const x of [bounds.left, bounds.right]) for (const y of [bounds.bottom, bounds.top]) for (const z of [bounds.back, bounds.front]) points.push([x * ca - (z - .35) * sa, (y - centerY) * ce - (x * sa + (z - .35) * ca) * se]);
    const range = Math.max((Math.max(...points.map(p => p[1])) - Math.min(...points.map(p => p[1]))) * 1.08,
      (Math.max(...points.map(p => p[0])) - Math.min(...points.map(p => p[0]))) * height / width * 1.08);
    const scale = height / range;
    return { angle, elevation, camera: { x: 0, y: -centerY * 100, scale: height / (range * 100) },
      project: p => [width / 2 + (p[0] * ca - (p[2] - .35) * sa) * scale,
        height / 2 - ((p[1] - centerY) * ce - (p[0] * sa + (p[2] - .35) * ca) * se) * scale],
      depth: p => p[0] * sa * ce + p[1] * se + p[2] * ca * ce };
  }
  function canvasHouse(c, model, frame) {
    const house = model.house, exterior = house.exterior, faces = [], project = frame.project;
    const wallColor = /^#[0-9a-f]{6}$/i.test(exterior.wallColor || '') ? exterior.wallColor : '#FFE3C9';
    const roofColor = /^#[0-9a-f]{6}$/i.test(exterior.roofColor || '') ? exterior.roofColor : '#FF9FB5';
    function face(points, fill, paint, stroke) {
      faces.push({ points, fill, paint, stroke: stroke || shade(fill, -28), depth: points.reduce((sum, p) => sum + frame.depth(p), 0) / points.length });
    }
    function box(x, y, z, w, h, d, fill) {
      const l = x - w / 2, r = x + w / 2, b = z - d / 2, f = z + d / 2;
      face([[l, y, f], [r, y, f], [r, y + h, f], [l, y + h, f]], fill);
      face([[r, y, f], [r, y, b], [r, y + h, b], [r, y + h, f]], shade(fill, -15));
      face([[l, y + h, b], [r, y + h, b], [r, y + h, f], [l, y + h, f]], shade(fill, 13));
    }
    function facade(x, y, z, w, h, groundDoor) {
      const points = [[x - w / 2, y, z], [x + w / 2, y, z], [x + w / 2, y + h, z], [x - w / 2, y + h, z]];
      face(points, wallColor, () => {
        const origin = project(points[3]), right = project(points[2]), bottom = project(points[0]);
        c.save(); c.transform((right[0] - origin[0]) / 320, (right[1] - origin[1]) / 320, (bottom[0] - origin[0]) / 220, (bottom[1] - origin[1]) / 220, origin[0], origin[1]);
        wall(c, { x: 0, y: 0, w: 320, h: 220, exterior, preview: true });
        if (groundDoor) door(c, 116, 67, 88, 153, exterior);
        else windowDraw(c, 108, 48, 104, 110, exterior, { nightness: 0 });
        c.restore();
      });
    }
    function pitchedRoof(x, y, z, w, d, h, fill) {
      const a = [x - w / 2, y, z - d / 2], b = [x + w / 2, y, z - d / 2], A = [x - w / 2, y, z + d / 2], B = [x + w / 2, y, z + d / 2], peak = [x, y + h, z - d / 2], front = [x, y + h, z + d / 2];
      face([a, A, front, peak], shade(fill, 12)); face([peak, front, B, b], shade(fill, -12)); face([A, B, front], shade(fill, 8));
      box(x, y + h - .045, z, .15, .12, d + .08, shade(fill, 18));
      // 与主3D的檐口同样保留瓦片圆润的体积，不把屋顶画成贴片。
      for (const side of [-1, 1]) for (let tile = 0; tile < 10; tile++) {
        const xx = x + side * (tile * w / 20 + w / 40), yy = y + h * (1 - Math.abs(xx - x) / (w / 2));
        box(xx, yy - .06, z + d / 2 + .025, w / 20 + .025, .13, .2, shade(fill, side > 0 ? -4 : 12));
      }
    }
    // 草坪、土层与托云按主模型本岛尺寸投影；所有普通楼层保留三个真实位置。
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * tau, p = project([Math.cos(a) * 5.05, -1.05, .9 + Math.sin(a) * 5.05]);
      const edge = project([Math.cos(a) * 5.05 + 1.7, -1.05, .9 + Math.sin(a) * 5.05]), top = project([Math.cos(a) * 5.05, -.55, .9 + Math.sin(a) * 5.05]);
      ellipse(c, p[0], p[1], Math.max(1, Math.abs(edge[0] - p[0])), Math.max(1, Math.abs(top[1] - p[1])), '#FFFAF0');
    }
    const rim = Array.from({ length: 40 }, (_, i) => { const a = i / 40 * tau; return [Math.cos(a) * 6.65, .05, .9 + Math.sin(a) * 6.65]; });
    for (let i = 0; i < rim.length; i++) { const p = rim[i], q = rim[(i + 1) % rim.length]; face([[p[0] * .96, -.9, .9 + (p[2] - .9) * .96], [q[0] * .96, -.9, .9 + (q[2] - .9) * .96], q, p], '#CDA888'); }
    face(rim, '#B1CC91', null, '#95AF79');
    model.entries.forEach(room => {
      const x = -3.2 + room.slotIdx * 3.2, y = .24 + room.floorIdx * 2.2;
      box(x, y - .08, 0, 3.24, .18, 2.95, '#C29A7D');
      if (room.data) {
        box(x, y + .1, 0, 3.19, 2.12, 2.9, wallColor); facade(x, y + .1, 1.46, 3.19, 2.12, room.floorIdx === 0 && room.slotIdx === 1);
        box(x, y + 2.16, 0, 3.26, .1, 2.99, '#FFF2D9');
      } else {
        for (const side of [-1, 1]) box(x + side * 1.48, y + .1, -1.35, .08, 1.8, .09, '#D8B8B3');
        box(x, y + 1.82, -1.35, 3.0, .08, .09, '#D8B8B3');
      }
    });
    const top = .26 + house.floors.length * 2.2;
    pitchedRoof(0, top, -.05, 10.16, 3.72, 1.45, roofColor);
    if (exterior.chimney !== 'none') { box(3.1, top + .65, -.5, .6, 1.2, .65, '#C47A88'); box(3.1, top + 1.85, -.5, .8, .18, .8, '#E7A1AE'); }
    if (house.attic) {
      box(0, top + .15, .25, 3.3, .18, 2.25, '#C6A289');
      box(0, top + .33, .25, 3.3, 1.55, 2.25, '#EDDDE7'); pitchedRoof(0, top + 1.87, .25, 3.7, 2.6, .8, roofColor);
    }
    faces.sort((a, b) => a.depth - b.depth).forEach(value => {
      if (value.paint) { value.paint(); return; }
      polygon(c, value.points.map(project), value.fill, value.stroke, .65);
    });
  }
  // 家名独占底部纸牌区；GL和降级共用，避免文字遮住真实房屋。
  function previewName(c, name, width, pictureHeight, nameHeight) {
    const size = Math.min(28, nameHeight - 12, width / 10), value = String(name);
    const plateWidth = Math.min(width - 16, Math.max(size * 4 + 24, Array.from(value).length * size + 24));
    const plateHeight = nameHeight - 6, x = (width - plateWidth) / 2, y = pictureHeight + 3;
    c.save();
    try {
      c.globalAlpha = 1; rr(c, x, y, plateWidth, plateHeight, Math.min(10, plateHeight / 2), '#FFF6E9', '#D7A8B5', 1);
      c.font = '600 ' + size + 'px "PingFang SC", "Microsoft YaHei", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#744554';
      c.fillText(value, width / 2, y + plateHeight / 2, plateWidth - 16);
    } finally { c.restore(); }
  }
  function preview(canvas, exterior, name, options = {}) {
    options = options && typeof options === 'object' ? options : {};
    let c, model;
    const bound = (value, fallback, max) => Number.isFinite(Number(value)) && Number(value) > 0 ? Math.max(80, Math.min(max, Math.round(Number(value)))) : fallback;
    const width = bound(options.width, 500, 1024), height = bound(options.height, 340, 768), dpr = Math.max(1, Math.min(1.5, Number(options.dpr) || window.devicePixelRatio || 1));
    const result = { ok: false, status: 'unavailable', mode: 'none', reason: '', floors: 0, rooms: 0, attic: false, width, height, partsSupport: 'current-world3d-parts',
      supportedParts: ['floors', 'rooms', 'attic', 'roofColor', 'wallColor', 'chimneyPresence'], unsupportedParts: ['roof', 'wall', 'window', 'door', 'chimneyStyle'] };
    const finish = () => {
      if (canvas?.dataset) Object.assign(canvas.dataset, { previewMode: result.mode, previewStatus: result.status, previewReason: result.reason, previewFloors: String(result.floors), previewRooms: String(result.rooms), previewParts: result.partsSupport });
      return result;
    };
    try {
      if (!canvas || typeof canvas.getContext !== 'function') { result.reason = 'canvas-unavailable'; return finish(); }
      c = canvas.getContext('2d'); if (!c) { result.reason = 'canvas-2d-unavailable'; return finish(); }
      model = houseSnapshot(options.house || G.state?.house, exterior, name);
      result.floors = model.house.floors.length; result.rooms = model.entries.filter(room => room.data).length; result.attic = !!model.house.attic;
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, width, height);
      const nameHeight = Math.max(30, Math.min(48, Math.round(height * .12))), pictureHeight = height - nameHeight;
      const frame = previewFrame(width, pictureHeight, result.floors, result.attic);
      if (!previewAttempted) {
        previewAttempted = true;
        if (typeof G.World3D === 'function') { try { previewWorld = new G.World3D(() => {}); } catch (_) { previewFailure = 'webgl-initialization-failed'; } }
        else previewFailure = 'world3d-module-unavailable';
      }
      if (previewWorld?.ready) {
        try {
          // 只消费正式核心公开的花园布局；预览不另造一份院景，后续原型院景也随核心接入。
          const garden = options.garden || (!options.house && G.render?.layout?.garden?.()) || { center: { x: 1000, y: 143 }, plots: [] };
          const gardenStatuses = options.gardenStatuses || (!options.house ? garden.plots.map(plot => G.sys?.garden?.status?.(plot.index) || {}) : []);
          const env = { state: { house: model.house, residents: {}, level: G.state?.level }, rooms: model.entries, garden, attic: { x: -160, y: -220 * result.floors - 230, w: 320, h: 210 },
            view: { floor: 'all', view: 'exterior', previewFourFloors: false }, camera: frame.camera, width, height: pictureHeight, offsetX: 0, offsetY: 0, dpr, night: false,
            reducedMotion: true, hidePlayer: true, peers: [], neighbors: [], visitor: null, selected: null, preview: null, gardenStatuses };
          if (previewWorld.render(c, env, { photo: true })) { previewName(c, model.house.name, width, pictureHeight, nameHeight); result.ok = true; result.status = 'ready'; result.mode = 'webgl'; return finish(); }
          previewFailure = previewWorld.reason || 'webgl-render-unavailable';
        } catch (_) {
          previewFailure = 'webgl-render-failed'; try { previewWorld.destroy(); } catch (_) {} previewWorld = null;
        }
      }
      result.reason = previewWorld?.reason || previewFailure || 'webgl-unavailable';
      c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, width, height); canvasHouse(c, model, frame); previewName(c, model.house.name, width, pictureHeight, nameHeight);
      result.ok = true; result.status = 'fallback'; result.mode = 'canvas-isometric'; result.partsSupport = 'canvas-exterior-parts';
      result.supportedParts.push('wall', 'window', 'door'); result.unsupportedParts = ['roof', 'chimneyStyle'];
    } catch (error) {
      result.reason = error?.message === 'invalid-house' ? 'invalid-house' : 'canvas-preview-failed';
      try { c?.setTransform(1, 0, 0, 1, 0, 0); c?.clearRect(0, 0, canvas?.width || width, canvas?.height || height); } catch (_) {}
    }
    return finish();
  }
  G.draw = G.draw || {}; G.draw.exterior = { roof, wall, window: windowDraw, door, chimney, preview, disposePreview };
})(window.Game);
