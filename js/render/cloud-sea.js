/* 云海背景：按镜头视差滚动的远云与层层云浪，画在天空之上、小岛之后；只读镜头与时间，不碰存档和网络。 */
(function (G) {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  // 位置只由格子编号决定，镜头移到哪里都是同一片云，不用保存任何状态。
  function hash(a, b, salt) {
    let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(salt | 0, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function parse(hex) { return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); }
  function mix(a, b, t) { const x = parse(a), y = parse(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); }

  // 云浪从远到近：越远越小、越慢、越偏冷色；夜里整体沉进蓝紫色。
  const BANKS = [
    { depth: .3, y: 1000, amp: 50, radius: 110, gap: 170, speed: 1.5, day: '#E3D9F0', shade: '#CFC3E2', night: '#2F3F66', nightShade: '#26355A' },
    { depth: .45, y: 880, amp: 46, radius: 100, gap: 150, speed: 2.4, day: '#F1DCEA', shade: '#E2C6D8', night: '#394A74', nightShade: '#2F4067' },
    { depth: .65, y: 780, amp: 40, radius: 90, gap: 130, speed: 3.4, day: '#FDEFE6', shade: '#F0D8D2', night: '#455681', nightShade: '#3A4B76' },
    { depth: .85, y: 690, amp: 34, radius: 80, gap: 115, speed: 4.6, day: '#FFFAF1', shade: '#F4E4DA', night: '#51628E', nightShade: '#455683' }
  ];
  // 天上的远云：depth 越小越远。minY/maxY 限定在云浪之上。
  const SKY = [
    { depth: .2, cell: 900, density: .2, salt: 11, minY: -2600, maxY: 500, alpha: .5, speed: 2 },
    { depth: .35, cell: 760, density: .18, salt: 23, minY: -2400, maxY: 420, alpha: .62, speed: 3.2 },
    { depth: .5, cell: 640, density: .15, salt: 37, minY: -2200, maxY: 380, alpha: .76, speed: 4.6 }
  ];

  function ellipse(c, x, y, rx, ry, fill) { c.beginPath(); c.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), 0, 0, TAU); c.fillStyle = fill; c.fill(); }
  function circle(c, x, y, r, fill) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = fill; c.fill(); }
  // 平底圆润的小云，先画一层偏暗的底影再画主体，有一点体积。
  function blob(c, x, y, w, fill, shade) {
    for (const [dy, color] of [[w * .045, shade], [0, fill]]) {
      ellipse(c, x, y + w * .06 + dy, w * .5, w * .11, color);
      circle(c, x - w * .28, y - w * .02 + dy, w * .17, color); circle(c, x - w * .08, y - w * .1 + dy, w * .24, color);
      circle(c, x + w * .16, y - w * .06 + dy, w * .2, color); circle(c, x + w * .34, y + dy, w * .14, color);
    }
  }

  function drawBank(c, bank, env) {
    const scale = env.scale * bank.depth, top = env.centerY + (bank.y - env.camY) * scale - (bank.amp + bank.radius) * scale;
    if (top > env.height) return;
    let gap = bank.gap;
    const left = env.camX - (env.width / 2 + 240) / scale, right = env.camX + (env.width / 2 + 240) / scale;
    if ((right - left) / gap > 90) gap = (right - left) / 90;
    const fill = env.tint(mix(bank.day, bank.night, env.night)), shade = env.tint(mix(bank.shade, bank.nightShade, env.night)), drift = env.drift * bank.speed;
    let lowest = -Infinity;
    const puffs = [];
    for (let i = Math.floor((left - drift) / gap); i <= Math.ceil((right - drift) / gap); i++) {
      const wx = i * gap + (hash(i, 0, bank.depth * 100) - .5) * gap * .6 + drift, wy = bank.y - hash(i, 1, bank.depth * 100) * bank.amp, r = bank.radius * (.72 + .56 * hash(i, 2, bank.depth * 100));
      const sx = env.width / 2 + (wx - env.camX) * scale, sy = env.centerY + (wy - env.camY) * scale;
      puffs.push([sx, sy, r * scale]); lowest = Math.max(lowest, sy);
    }
    const edge = env.centerY + (bank.y - env.camY) * scale;
    c.save();
    for (const [sx, sy, r] of puffs) circle(c, sx, sy + r * .12, r, shade);
    for (const [sx, sy, r] of puffs) circle(c, sx, sy, r, fill);
    // 云浪下方向底部渐渐染上粉紫，避免大片纯色把站在上面的邻居云吞掉。
    const below = c.createLinearGradient(0, edge, 0, Math.max(edge + 1, env.height));
    below.addColorStop(0, fill); below.addColorStop(1, env.tint(mix(bank.shade, bank.nightShade, env.night)));
    c.fillStyle = below; c.fillRect(0, edge, env.width, Math.max(0, env.height - edge));
    c.restore();
  }

  function drawSky(c, layer, env) {
    const scale = env.scale * layer.depth, cell = Math.max(layer.cell, 150 / scale), drift = env.drift * layer.speed;
    const left = env.camX - (env.width / 2 + 200) / scale - drift, right = env.camX + (env.width / 2 + 200) / scale - drift;
    const top = env.camY - (env.centerY + 120) / scale, bottom = env.camY + (env.height - env.centerY + 120) / scale;
    const fill = env.tint(mix('#FFFFFF', '#6F7FA8', env.night)), shade = env.tint(mix('#EADFEF', '#4A5A82', env.night));
    c.save(); c.globalAlpha = layer.alpha * (1 - env.night * .45);
    for (let cy = Math.floor(top / cell); cy <= Math.floor(bottom / cell); cy++) {
      for (let cx = Math.floor(left / cell); cx <= Math.floor(right / cell); cx++) {
        if (hash(cx, cy, layer.salt) > layer.density) continue;
        const wx = (cx + hash(cx, cy, layer.salt + 1)) * cell + drift, wy = (cy + hash(cx, cy, layer.salt + 2)) * cell;
        if (wy < layer.minY || wy > layer.maxY) continue;
        blob(c, env.width / 2 + (wx - env.camX) * scale, env.centerY + (wy - env.camY) * scale, cell * (.34 + .26 * hash(cx, cy, layer.salt + 3)) * scale, fill, shade);
      }
    }
    c.restore();
  }

  // options: { width, height, camera: {x, y, scale}, centerY, time: {nightness, weather}, reducedMotion, now(秒) }
  function draw(c, options) {
    const camera = options.camera || { x: 0, y: 0, scale: 1 }, time = options.time || {}, night = clamp(Number(time.nightness) || 0, 0, 1);
    const kind = typeof time.weather === 'object' && time.weather ? time.weather.type : time.weather, grey = (kind === 'rain' ? .38 : kind === 'cloudy' || kind === 'snow' ? .16 : 0) * (1 - night * .6);
    const env = {
      width: clamp(options.width, 1, 10000), height: clamp(options.height, 1, 10000), centerY: Number.isFinite(options.centerY) ? options.centerY : options.height / 2,
      camX: camera.x, camY: camera.y, scale: clamp(camera.scale, .02, 4), night, drift: options.reducedMotion ? 0 : (Number(options.now) || 0),
      tint: color => grey ? mix(color, '#9AA5B8', grey) : color
    };
    SKY.forEach(layer => drawSky(c, layer, env));
    BANKS.forEach(bank => drawBank(c, bank, env));
  }

  G.cloudSea = { draw: draw };
})(window.Game = window.Game || {});
