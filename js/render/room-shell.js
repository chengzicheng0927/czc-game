/* 手绘房间壳：内收墙角、透视地板纹理与柔和踢脚线，不接管家具或人物。 */
(function (G) {
  'use strict';
  const TAU = Math.PI * 2, left = 38.4, right = 281.6, wallTop = 14, backY = 142, frontY = 212;
  const floorPoints = [[left, backY], [right, backY], [320, frontY], [0, frontY]];
  function hex(value, fallback) { return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback; }
  function mix(color, other, amount) { const a = hex(color, '#FFF1DE'), b = hex(other, '#FFFFFF'); return '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - amount) + parseInt(b.slice(i, i + 2), 16) * amount).toString(16).padStart(2, '0')).join(''); }
  function path(c, points) { c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); }
  function polygon(c, points, color, stroke, width) { path(c, points); c.fillStyle = color; c.fill(); if (stroke) { c.strokeStyle = stroke; c.lineWidth = width || 1; c.stroke(); } }
  function line(c, points, color, width) { c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.strokeStyle = color; c.lineWidth = width || 1; c.stroke(); }
  function ellipse(c, x, y, rx, ry, color) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fillStyle = color; c.fill(); }
  function star(c, x, y, size, color) { const points = []; for (let i = 0; i < 10; i++) { const angle = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? size * .43 : size; points.push([x + Math.cos(angle) * r, y + Math.sin(angle) * r]); } polygon(c, points, color); }
  function heart(c, x, y, size, color) { c.beginPath(); c.moveTo(x, y + size); c.bezierCurveTo(x - size * 2, y, x - size, y - size * 1.5, x, y - size * .5); c.bezierCurveTo(x + size, y - size * 1.5, x + size * 2, y, x, y + size); c.fillStyle = color; c.fill(); }
  function flower(c, x, y, size, color, center) { for (let i = 0; i < 5; i++) { const angle = i * TAU / 5; ellipse(c, x + Math.cos(angle) * size * .55, y + Math.sin(angle) * size * .55, size * .44, size * .44, color); } ellipse(c, x, y, size * .3, size * .3, center); }
  function customTiles(c, wall, x, y, width, height, tileWidth, tileHeight) {
    const art = wall.artId && G.state?.customArts?.find(value => value.id === wall.artId);
    if (!art || !G.draw?.creative) return;
    for (let yy = y; yy < y + height; yy += tileHeight) for (let xx = x; xx < x + width; xx += tileWidth) G.draw.creative.drawPixels(c, art.pixels, xx, yy, tileWidth, tileHeight);
  }
  function wallpaper(c, wall) {
    const pattern = wall.pattern || 'solid', accent = hex(wall.color2, '#FFFFFF'), base = hex(wall.color, '#F9EFDF');
    c.save(); path(c, [[left, wallTop], [right, wallTop], [right, backY], [left, backY]]); c.clip(); c.globalAlpha *= .66;
    if (pattern === 'custom') customTiles(c, wall, left, wallTop, right - left, backY - wallTop, 32, 32);
    else if (pattern === 'stripes' || pattern === 'wood') {
      for (let x = left + 5; x < right; x += pattern === 'wood' ? 22 : 20) {
        line(c, [[x, wallTop], [x, backY]], accent, pattern === 'wood' ? 1 : 7);
        if (pattern === 'wood') { c.beginPath(); c.moveTo(x + 9, 23); c.bezierCurveTo(x + 2, 52, x + 16, 89, x + 10, 135); c.strokeStyle = mix(base, '#90726A', .2); c.lineWidth = .6; c.stroke(); }
      }
    } else if (pattern === 'check') {
      for (let row = 0; row < 8; row++) for (let col = 0; col < 16; col++) if ((row + col) % 2 === 0) { c.fillStyle = accent; c.fillRect(left + col * 17, wallTop + row * 17, 17, 17); }
    } else if (pattern === 'brick') {
      for (let row = 0; row < 8; row++) { const y = wallTop + row * 18; line(c, [[left, y], [right, y]], accent, 1.6); for (let x = left + row % 2 * 19; x < right; x += 38) line(c, [[x, y], [x, y + 18]], accent, 1.6); }
    } else if (pattern !== 'solid') {
      for (let row = 0; row < 6; row++) for (let col = 0; col < 10; col++) {
        const x = left + 13 + col * 26 + row % 2 * 13, y = wallTop + 13 + row * 24;
        if (pattern === 'dots') ellipse(c, x, y, 1.7, 1.7, accent);
        else if (pattern === 'flowers') flower(c, x, y, 3.7, accent, mix(base, '#E1BB75', .4));
        else if (pattern === 'hearts') heart(c, x, y, 2.6, accent);
        else if (pattern === 'stars') star(c, x, y, 4, accent);
        else if (pattern === 'clouds') { ellipse(c, x - 3, y, 4, 2.5, accent); ellipse(c, x, y - 2, 4, 4, accent); ellipse(c, x + 4, y, 4, 2.5, accent); }
      }
    }
    c.restore();
  }
  function sideWall(c, side, wall) {
    const xOuter = side === 'left' ? 0 : 320, xInner = side === 'left' ? left : right, base = hex(wall.color, '#F9EFDF');
    const points = [[xOuter, 0], [xInner, wallTop], [xInner, backY], [xOuter, frontY]];
    c.save(); path(c, points); c.clip();
    const gradient = c.createLinearGradient(xOuter, 0, xInner, 0); gradient.addColorStop(0, mix(base, side === 'left' ? '#FFFFFF' : '#AB8A93', side === 'left' ? .13 : .18)); gradient.addColorStop(1, mix(base, '#9D7F8B', side === 'left' ? .06 : .12)); c.fillStyle = gradient; c.fillRect(Math.min(xOuter, xInner), 0, Math.abs(xInner - xOuter), frontY);
    // 装饰点随侧墙高度一起收束，避免在窄墙上铺一张正面贴图。
    if (wall.pattern === 'custom') { c.globalAlpha *= .58; customTiles(c, wall, Math.min(xOuter, xInner), 0, Math.abs(xInner - xOuter), frontY, 12, 32); }
    else if (!['solid', 'wood', 'brick'].includes(wall.pattern || 'solid')) {
      c.globalAlpha *= .36; const accent = hex(wall.color2, '#FFFFFF');
      for (let column = 0; column < 2; column++) for (let row = 0; row < 8; row++) {
        const u = .28 + column * .42, v = .1 + row * .12, x = xOuter + (xInner - xOuter) * u, top = wallTop * u, bottom = frontY - (frontY - backY) * u, y = top + (bottom - top) * v;
        if (wall.pattern === 'stripes') line(c, [[x, top], [x, bottom]], accent, 3);
        else if (wall.pattern === 'check') polygon(c, [[x - 3, y - 5], [x + 3, y - 4], [x + 3, y + 5], [x - 3, y + 6]], accent);
        else ellipse(c, x, y, 1.5, wall.pattern === 'dots' ? 1.7 : 3, accent);
      }
    }
    c.restore();
  }
  function plane(x, depth) { return { x: 160 + (x - 160) * (.76 + .24 * depth), y: backY + (frontY - backY) * depth }; }
  function quad(c, x0, x1, d0, d1, color, stroke, width) { const points = [plane(x0, d0), plane(x1, d0), plane(x1, d1), plane(x0, d1)].map(p => [p.x, p.y]); polygon(c, points, color, stroke, width); }
  function floorTexture(c, floor) {
    const color = hex(floor.color, '#E8C39E'), pattern = floor.pattern || 'wood', edge = mix(color, '#8B6A62', .27), soft = mix(color, '#FFF5DC', .25);
    c.save(); path(c, floorPoints); c.clip(); c.fillStyle = color; c.fillRect(0, backY, 320, frontY - backY);
    if (pattern === 'wood') {
      const rows = 5, splits = 5;
      for (let row = 0; row < rows; row++) {
        const d0 = Math.pow(row / rows, 1.45), d1 = Math.pow((row + 1) / rows, 1.45), offset = row % 2 * 32;
        for (let col = -1; col < splits + 1; col++) {
          const x0 = col * 64 + offset, x1 = x0 + 64;
          quad(c, x0, x1, d0, d1, (row + col) % 3 === 0 ? soft : (row + col) % 3 === 1 ? color : mix(color, '#B99A83', .1), edge, .65);
          const a = plane(x0 + 10, d0 + (d1 - d0) * .6), b = plane(x1 - 8, d0 + (d1 - d0) * .66); c.beginPath(); c.moveTo(a.x, a.y); c.quadraticCurveTo((a.x + b.x) / 2, a.y - 1.2, b.x, b.y); c.strokeStyle = mix(color, '#9A7A66', .22); c.lineWidth = .55; c.stroke();
        }
      }
    } else if (pattern === 'tile' || pattern === 'tatami') {
      const rows = pattern === 'tatami' ? 3 : 5, cols = pattern === 'tatami' ? 4 : 7;
      for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
        const d0 = Math.pow(row / rows, 1.38), d1 = Math.pow((row + 1) / rows, 1.38), x0 = col / cols * 320, x1 = (col + 1) / cols * 320;
        quad(c, x0, x1, d0, d1, (row + col) % 2 ? mix(color, '#FFFFFF', .08) : color, pattern === 'tatami' ? mix(color, '#81745C', .35) : mix(color, '#FFF8EC', .65), pattern === 'tatami' ? 1.6 : 1.3);
        if (pattern === 'tatami') for (let thread = 1; thread < 5; thread++) { const a = plane(x0 + (x1 - x0) * thread / 5, d0), b = plane(x0 + (x1 - x0) * thread / 5, d1); line(c, [[a.x, a.y], [b.x, b.y]], mix(color, '#746D4E', .12), .45); }
      }
    } else if (pattern === 'marble') {
      for (let index = 0; index < 9; index++) { const a = plane(index * 49 - 30, .05), b = plane(index * 44 + 15, .96); c.beginPath(); c.moveTo(a.x, a.y); c.bezierCurveTo(a.x - 35, a.y + 25, b.x + 30, b.y - 15, b.x, b.y); c.strokeStyle = index % 2 ? mix(color, '#FFFFFF', .6) : mix(color, '#9D9BAA', .25); c.lineWidth = index % 2 ? 2 : .6; c.stroke(); }
    } else if (pattern === 'grass') {
      for (let row = 0; row < 6; row++) for (let col = 0; col < 14; col++) { const depth = (row + .4) / 6, p = plane(col * 25 + row % 2 * 11, depth), size = 2 + depth * 3; line(c, [[p.x - size * .6, p.y], [p.x, p.y - size], [p.x + size * .6, p.y]], mix(color, '#788F65', .35), .9); }
    } else {
      // 地毯/星光/云朵使用被压扁到地平面的装饰，大小也随前后变化。
      for (let row = 0; row < 4; row++) for (let col = 0; col < 9; col++) {
        const depth = (row + .6) / 4, p = plane(col * 42 + row % 2 * 16, depth), size = 2.7 + depth * 2.5;
        c.save(); c.translate(p.x, p.y); c.scale(1, .45);
        if (pattern === 'stars') star(c, 0, 0, size, soft);
        else if (pattern === 'cloud') { ellipse(c, -size * .5, 0, size * .65, size * .55, soft); ellipse(c, 0, -size * .4, size * .7, size * .7, soft); ellipse(c, size * .6, 0, size * .6, size * .5, soft); }
        else { ellipse(c, 0, 0, size * .7, size * .7, mix(color, '#FFFFFF', .18)); }
        c.restore();
      }
      if (pattern === 'carpet') { const a = plane(10, .08), b = plane(310, .08), d = plane(10, .94), e = plane(310, .94); path(c, [[a.x, a.y], [b.x, b.y], [e.x, e.y], [d.x, d.y]]); c.strokeStyle = soft; c.lineWidth = 1.5; c.stroke(); }
    }
    const shade = c.createLinearGradient(0, backY, 0, backY + 25); shade.addColorStop(0, '#795F6727'); shade.addColorStop(1, '#795F6700'); c.fillStyle = shade; c.fillRect(0, backY, 320, 25); c.restore();
  }
  function draw(c, roomData, options) {
    const data = roomData || {}, wall = data.wallpaper || {}, floor = data.floor || {}, opts = options || {}, color = hex(wall.color, '#F9EFDF'), floorColor = hex(floor.color, '#E8C39E');
    c.save(); if (Number.isFinite(opts.width) && Number.isFinite(opts.height)) c.scale(opts.width / 320, opts.height / 220); c.lineJoin = 'round'; c.lineCap = 'round';
    polygon(c, [[0, 0], [320, 0], [right, wallTop], [left, wallTop]], mix(color, '#FFFFFF', .4));
    const wallLight = c.createLinearGradient(left, wallTop, right, backY); wallLight.addColorStop(0, mix(color, '#FFFFFF', .16)); wallLight.addColorStop(1, color); c.fillStyle = wallLight; c.fillRect(left, wallTop, right - left, backY - wallTop); wallpaper(c, wall); sideWall(c, 'left', wall); sideWall(c, 'right', wall); floorTexture(c, floor);
    // 后墙/侧墙同一条踢脚线形成真实墙角，脚前留2px余量给家具锚点。
    line(c, [[left, wallTop], [left, backY], [0, frontY]], mix(color, '#AA8C8D', .35), 1.2); line(c, [[right, wallTop], [right, backY], [320, frontY]], mix(color, '#9E818A', .42), 1.3);
    line(c, [[0, frontY], [left, backY], [right, backY], [320, frontY]], mix(color, '#FFF4DE', .65), 4); line(c, [[left, backY + 2], [right, backY + 2]], mix(floorColor, '#A3857B', .24), .9);
    // 环境光遮蔽：天花板、两侧墙角与侧墙更暗，光从左上来，房间像一只有深度的小盒子。
    const ao = 'rgba(92,60,72,';
    const ceiling = c.createLinearGradient(0, wallTop, 0, wallTop + 40); ceiling.addColorStop(0, ao + '.2)'); ceiling.addColorStop(1, ao + '0)'); c.fillStyle = ceiling; c.fillRect(left, wallTop, right - left, 40);
    const leftCorner = c.createLinearGradient(left, 0, left + 42, 0); leftCorner.addColorStop(0, ao + '.16)'); leftCorner.addColorStop(1, ao + '0)'); c.fillStyle = leftCorner; c.fillRect(left, wallTop, 42, backY - wallTop);
    const rightCorner = c.createLinearGradient(right, 0, right - 42, 0); rightCorner.addColorStop(0, ao + '.24)'); rightCorner.addColorStop(1, ao + '0)'); c.fillStyle = rightCorner; c.fillRect(right - 42, wallTop, 42, backY - wallTop);
    polygon(c, [[0, 0], [left, wallTop], [left, backY], [0, frontY]], ao + '.1)'); polygon(c, [[320, 0], [right, wallTop], [right, backY], [320, frontY]], ao + '.2)');
    polygon(c, [[0, frontY], [320, frontY], [315, 220], [5, 220]], mix(floorColor, '#B18D7A', .22), mix(floorColor, '#9C7E75', .3), .8);
    c.restore(); return { width: 320, height: 220, backWall: { x: left, y: wallTop, w: right - left, h: backY - wallTop }, floor: floorPoints.map(point => point.slice()) };
  }
  G.roomShell = { draw, floorPath: c => path(c, floorPoints), plane };
})(window.Game);
