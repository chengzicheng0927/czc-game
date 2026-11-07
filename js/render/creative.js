/* 每幅作品只缓存一块16×16底图；像素边缘保持利落，不增加世界绘制循环。 */
(function (G) {
  'use strict';
  const D = G.data, C = D.creativeConfig, cache = new Map();
  function clearCache() { cache.clear(); }
  function paint(c, pixels, x, y, width, height) {
    for (let row = 0; row < C.size; row++) for (let column = 0; column < C.size; column++) {
      const code = pixels[row * C.size + column], index = C.symbols.indexOf(code); if (index < 0) continue;
      c.fillStyle = C.palette[index];
      const left = x + column * width / C.size, top = y + row * height / C.size;
      c.fillRect(left, top, width / C.size, height / C.size);
    }
  }
  function tile(pixels) {
    if (!D.validCreativePixels(pixels)) return null;
    if (cache.has(pixels)) { const value = cache.get(pixels); cache.delete(pixels); cache.set(pixels, value); return value; }
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = C.size;
    const c = canvas.getContext('2d'); if (!c) return null; paint(c, pixels, 0, 0, C.size, C.size);
    cache.set(pixels, canvas); while (cache.size > C.maxArts) cache.delete(cache.keys().next().value);
    return canvas;
  }
  function drawPixels(c, pixels, x, y, width, height) {
    if (!c || !D.validCreativePixels(pixels) || ![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return false;
    c.save(); c.imageSmoothingEnabled = false;
    const canvas = tile(pixels); if (canvas) c.drawImage(canvas, x, y, width, height); else paint(c, pixels, x, y, width, height);
    c.restore(); return true;
  }
  function rounded(c, x, y, w, h, radius, fill, stroke, lineWidth) {
    c.beginPath(); c.moveTo(x + radius, y); c.arcTo(x + w, y, x + w, y + h, radius); c.arcTo(x + w, y + h, x, y + h, radius); c.arcTo(x, y + h, x, y, radius); c.arcTo(x, y, x + w, y, radius); c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lineWidth || 1; c.stroke(); }
  }
  function drawFrame(c, art, x, y, width, height) {
    if (!c || !art || !D.validCreativePixels(art.pixels)) return false;
    const w = width || C.frameWidth, h = height || C.frameHeight, edge = Math.min(w, h) * .105;
    c.save(); c.translate(x || 0, y || 0);
    rounded(c, 0, 2, w, h - 2, edge * .7, '#D6B28F', '#B28B71', Math.max(1, edge * .17));
    rounded(c, edge * .35, edge * .35, w - edge * .7, h - edge * .7, edge * .55, '#EBD0AE', '#F9E5C7', Math.max(1, edge * .14));
    c.fillStyle = '#FFF9EB'; c.fillRect(edge, edge, w - edge * 2, h - edge * 2);
    drawPixels(c, art.pixels, edge * 1.32, edge * 1.32, w - edge * 2.64, h - edge * 2.64);
    c.restore(); return true;
  }
  G.draw = G.draw || {}; G.draw.creative = { drawPixels, drawFrame, tile, clearCache };
  G.bus.on('state:replace', clearCache); G.bus.on('creative:changed', clearCache);
})(window.Game);
