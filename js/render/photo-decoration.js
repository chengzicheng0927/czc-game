/* 一张基础图反复叠加相框、贴纸与文字；编辑时不重新绘制世界。 */
(function (G) {
  'use strict';
  const D = G.data, TAU = Math.PI * 2, ink = '#795867';
  function rounded(c, x, y, w, h, radius, fill, stroke, lineWidth) {
    const r = Math.min(radius, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lineWidth || 1; c.stroke(); }
  }
  function circle(c, x, y, radius, fill, stroke, lineWidth) { c.beginPath(); c.arc(x, y, radius, 0, TAU); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lineWidth || 1; c.stroke(); } }
  function star(c, x, y, r, color) { c.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, size = i % 2 ? r * .48 : r; if (!i) c.moveTo(x + Math.cos(a) * size, y + Math.sin(a) * size); else c.lineTo(x + Math.cos(a) * size, y + Math.sin(a) * size); } c.closePath(); c.fillStyle = color; c.fill(); }
  function heart(c, x, y, size, color) { c.beginPath(); c.moveTo(x, y + size * .7); c.bezierCurveTo(x - size * 1.5, y - size * .2, x - size * .7, y - size * 1.25, x, y - size * .45); c.bezierCurveTo(x + size * .7, y - size * 1.25, x + size * 1.5, y - size * .2, x, y + size * .7); c.fillStyle = color; c.fill(); }
  function leaf(c, x, y, size, angle, color) { c.save(); c.translate(x, y); c.rotate(angle); c.beginPath(); c.moveTo(0, size); c.quadraticCurveTo(-size, -size * .4, 0, -size); c.quadraticCurveTo(size, -size * .4, 0, size); c.fillStyle = color; c.fill(); c.restore(); }
  function cloud(c, x, y, size) { circle(c, x - size * .6, y, size * .65, '#FFFCF4'); circle(c, x, y - size * .3, size * .85, '#FFFCF4'); circle(c, x + size * .7, y, size * .6, '#FFFCF4'); rounded(c, x - size, y, size * 2, size * .7, size * .3, '#FFFCF4'); }
  function stickerBox(sticker, width, height) {
    const size = Math.min(width, height) * .13 * sticker.scale;
    return { x: sticker.x * width - size / 2, y: sticker.y * height - size / 2, w: size, h: size };
  }
  function frame(c, id, width, height) {
    if (id === 'none') return;
    const min = Math.min(width, height), edge = min * .037, pad = edge * .55, frameDef = D.photoFrames.find(value => value.id === id), color = frameDef.color;
    // 半透明边带让图案围住照片，不把主体压进一张小窗。
    c.save(); c.globalAlpha = .94; c.fillStyle = color; c.fillRect(0, 0, width, edge); c.fillRect(0, height - edge, width, edge); c.fillRect(0, 0, edge, height); c.fillRect(width - edge, 0, edge, height); c.globalAlpha = 1;
    rounded(c, pad, pad, width - pad * 2, height - pad * 2, min * .025, null, '#FDF7EA', Math.max(2, edge * .12));
    if (id === 'cream') {
      for (let x = edge; x < width - edge; x += edge * .9) { circle(c, x, edge * .48, edge * .4, '#FFFAE7'); circle(c, x, height - edge * .48, edge * .4, '#FFFAE7'); }
      for (let y = edge * 1.3; y < height - edge; y += edge * .9) { circle(c, edge * .48, y, edge * .4, '#FFFAE7'); circle(c, width - edge * .48, y, edge * .4, '#FFFAE7'); }
    } else if (id === 'strawberry') {
      for (const [x, y] of [[edge * 1.2, edge * 1.2], [width - edge * 1.2, edge * 1.2], [edge * 1.2, height - edge * 1.2], [width - edge * 1.2, height - edge * 1.2]]) { heart(c, x, y, edge * .7, '#D88FA9'); leaf(c, x, y - edge * .65, edge * .35, .3, '#AEC69B'); }
    } else if (id === 'forest') {
      for (let i = 0; i < 9; i++) { leaf(c, edge * .7, edge * (1.5 + i * 2.3), edge * .5, -.55, i % 2 ? '#D7E5BA' : '#8FAB7F'); leaf(c, width - edge * .7, height - edge * (1.5 + i * 2.3), edge * .5, .55, i % 2 ? '#D7E5BA' : '#8FAB7F'); }
    } else if (id === 'ocean') {
      for (let x = edge; x < width; x += edge * 1.7) { c.beginPath(); c.arc(x, height - edge * .2, edge * .55, Math.PI, TAU); c.strokeStyle = '#F6FCF6'; c.lineWidth = edge * .13; c.stroke(); }
      [[edge * 1.2, edge * 1.4], [width - edge * 1.4, edge * 1.2], [width - edge * .9, edge * 2.5]].forEach(([x, y]) => circle(c, x, y, edge * .4, null, '#F5FBF5', edge * .13));
    } else if (id === 'starry') {
      for (let i = 0; i < 10; i++) star(c, edge * (1.3 + i * 2.7), i % 2 ? height - edge * .55 : edge * .6, edge * .38, '#FFF0AF');
      circle(c, width - edge * 1.5, edge * 1.4, edge * .75, '#FFF1BF'); circle(c, width - edge * 1.2, edge * 1.1, edge * .65, color);
    } else if (id === 'cloud') {
      [[edge * 1.5, edge * 1.2], [width - edge * 1.8, edge * 1.2], [edge * 1.5, height - edge * 1.7], [width - edge * 1.8, height - edge * 1.7]].forEach(([x, y]) => cloud(c, x, y, edge * .8));
    } else if (id === 'rainbow') {
      ['#EDADC0', '#F1C69E', '#F1DFA7', '#B7CFA8', '#AED5D8', '#B5C5E3', '#D0B9DE'].forEach((paint, index) => rounded(c, pad + index * edge * .1, pad + index * edge * .1, width - 2 * (pad + index * edge * .1), height - 2 * (pad + index * edge * .1), min * .028, null, paint, edge * .1));
    } else if (id === 'polaroid') {
      c.fillStyle = '#FFF9EC'; c.fillRect(0, height - edge * 2.5, width, edge * 2.5); c.strokeStyle = '#D9C6B2'; c.lineWidth = Math.max(1, edge * .055); c.beginPath(); c.moveTo(edge, height - edge * 2.5); c.lineTo(width - edge, height - edge * 2.5); c.stroke();
      heart(c, width - edge * 1.9, height - edge * 1.2, edge * .45, '#DDA6BA');
    }
    c.restore();
  }
  function draw(target, base, rawDecor) {
    if (!target || !base || !target.width || !target.height) throw new Error('照片画布还没准备好。');
    const decor = D.validatePhotoDecor(rawDecor || D.defaultPhotoDecor()), c = target.getContext('2d'), width = target.width, height = target.height;
    if (!c) throw new Error('浏览器暂时无法绘制照片。');
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, width, height); c.drawImage(base, 0, 0, width, height); frame(c, decor.frame, width, height);
    decor.stickers.forEach(sticker => { const def = D.photoStickers.find(value => value.id === sticker.stickerId), box = stickerBox(sticker, width, height); c.save(); c.font = box.h * .88 + 'px "Apple Color Emoji", "Segoe UI Emoji", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(def.emoji, sticker.x * width, sticker.y * height); c.restore(); });
    if (decor.caption) {
      const font = Math.max(12, Math.min(width, height) * .04), bottom = Math.min(width, height) * .095, y = height - bottom;
      c.font = '600 ' + font + 'px "PingFang SC", "Microsoft YaHei", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      const measured = Math.min(width * .86, c.measureText(decor.caption).width + font * 1.4);
      if (decor.frame !== 'polaroid') rounded(c, (width - measured) / 2, y - font * .85, measured, font * 1.7, font * .5, '#FFF9ECDF');
      c.fillStyle = ink; c.fillText(decor.caption, width / 2, y, width * .82);
    }
    c.restore(); return target;
  }
  G.draw = G.draw || {}; G.draw.photoDecoration = { draw, stickerBox };
})(window.Game);
