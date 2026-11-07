/* 独立花圃绘制 adapter：只消费真实地块状态，不计时、不修改存档。 */
(function (G) {
  'use strict';
  G.render = G.render || {};

  function ellipse(ctx, x, y, rx, ry, color) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  }
  function bed(ctx, top, bottom, color) {
    ctx.fillStyle = color; ctx.beginPath();
    ctx.moveTo(33, top); ctx.bezierCurveTo(24, top, 16, top + 10, 20, top + 17);
    ctx.lineTo(31, bottom - 3); ctx.quadraticCurveTo(34, bottom + 2, 45, bottom + 2);
    ctx.lineTo(140, bottom + 2); ctx.quadraticCurveTo(151, bottom + 2, 156, bottom - 6);
    ctx.lineTo(163, top + 15); ctx.quadraticCurveTo(168, top + 3, 154, top);
    ctx.closePath(); ctx.fill();
  }
  function soil(ctx, y, color) {
    ctx.fillStyle = color; ctx.beginPath();
    ctx.moveTo(38, y); ctx.lineTo(148, y); ctx.quadraticCurveTo(158, y, 154, y + 8);
    ctx.lineTo(145, y + 24); ctx.quadraticCurveTo(143, y + 29, 134, y + 29);
    ctx.lineTo(44, y + 29); ctx.quadraticCurveTo(34, y + 29, 31, y + 23);
    ctx.lineTo(26, y + 11); ctx.quadraticCurveTo(22, y, 38, y); ctx.closePath(); ctx.fill();
  }
  function glint(ctx, x, y, radius) {
    ctx.fillStyle = '#F2D88C'; ctx.beginPath(); ctx.moveTo(x, y - radius);
    ctx.quadraticCurveTo(x + 1, y - 1, x + radius * .7, y);
    ctx.quadraticCurveTo(x + 1, y + 1, x, y + radius);
    ctx.quadraticCurveTo(x - 1, y + 1, x - radius * .7, y);
    ctx.quadraticCurveTo(x - 1, y - 1, x, y - radius); ctx.fill();
  }
  function droplet(ctx) {
    ctx.fillStyle = '#A1C8CE'; ctx.beginPath(); ctx.moveTo(151, 25);
    ctx.bezierCurveTo(147, 33, 142, 38, 142, 43);
    ctx.bezierCurveTo(142, 55, 160, 55, 160, 43);
    ctx.bezierCurveTo(160, 38, 155, 32, 151, 25); ctx.fill();
    ctx.strokeStyle = '#E2F1ED'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(147, 40); ctx.quadraticCurveTo(145, 45, 149, 47); ctx.stroke();
  }

  function drawPlot(ctx, status, options) {
    if (!ctx || !status) return;
    options = options || {};
    const width = Number.isFinite(options.width) && options.width > 0 ? options.width : 180;
    const height = Number.isFinite(options.height) && options.height > 0 ? options.height : 130;
    const scale = Math.min(width / 180, height / 130);
    const drawCrop = typeof options.drawCrop === 'function' ? options.drawCrop : G.ui && G.ui.garden && G.ui.garden.drawCrop;
    ctx.save();
    try {
      ctx.translate((width - 180 * scale) / 2, (height - 130 * scale) / 2); ctx.scale(scale, scale);
      // 后侧浅边、前侧陶土和土面分别受光，保持原型的矮胖花圃比例。
      ellipse(ctx, 92, 115, 70, 8, '#4F5F3B16');
      if (options.selected) { ellipse(ctx, 91, 102, 80, 22, '#AFC59B40'); }
      bed(ctx, 80, 111, '#B69A7D');
      bed(ctx, 77, 104, '#D1B592');
      soil(ctx, 79, '#8F735E');
      soil(ctx, 80, '#A98A6B');
      ctx.strokeStyle = '#E6CBA6'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(34, 81); ctx.lineTo(148, 81); ctx.stroke();
      ctx.strokeStyle = '#BF9D78'; ctx.lineWidth = 1.5;
      [45, 67, 112, 135].forEach((x, i) => {
        ctx.beginPath(); ctx.moveTo(x, 91 + i % 2 * 3); ctx.lineTo(x + 9, 93 + i % 2 * 3); ctx.stroke();
      });
      ellipse(ctx, 46, 103, 3, 1.5, '#D7BC95'); ellipse(ctx, 133, 98, 2, 1.5, '#D7BC95');
      if (!status.empty && status.crop && typeof drawCrop === 'function') {
        drawCrop(ctx, status.crop, status.stage, 90, 91, 96);
      } else {
        // 空地保留清晰的播种位置，图形不承担业务操作或命中。
        ctx.strokeStyle = status.locked ? '#C3AF95' : '#E0C5A1'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(83, 93); ctx.lineTo(97, 93); ctx.moveTo(90, 88); ctx.lineTo(90, 98); ctx.stroke();
      }
      if (status.needsWater && !status.empty) droplet(ctx);
      if (status.mature && !status.empty) { glint(ctx, 149, 35, 8); glint(ctx, 32, 55, 5); }
    } finally { ctx.restore(); }
  }

  G.render.gardenVisual = { drawPlot: drawPlot };
})(window.Game);
