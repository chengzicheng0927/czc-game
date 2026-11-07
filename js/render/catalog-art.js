/* 原商店与内容图卡的纯绘图：从旧场景提取，保留原图案，不持有相机、输入或存档写入。 */
(function (G) {
  'use strict';
  const TAU = Math.PI * 2;
  const palette = { ink: '#795F67', pink: '#E8A6B5', cream: '#FFF6DC', mint: '#B8DCC7', blue: '#BCD9E2', wood: '#DBB997' };
  const themePalettes = {
    basic: ['#DDBFA1', '#FFF8EB', '#9DBEA7'], strawberry: ['#EDB5C3', '#FFF2DA', '#BD798C'],
    forest: ['#B3C59B', '#E5D7B8', '#8B9474'], garden: ['#EFDA9B', '#FCF6DF', '#AEC398'],
    ocean: ['#B0D7E0', '#F6F9EE', '#80ADB9'], cloud: ['#EDF1EE', '#D7E6F5', '#B0C5D6'],
    oriental: ['#D6A499', '#E9DDBB', '#A6B69A'], starry: ['#C4B5DE', '#F8E5A3', '#9A87BA'],
    princess: ['#EBC7DD', '#FFF1CB', '#CEAD74']
  };
  const time = 0, reducedMotion = true;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const renderState = () => G.state || {customArts: []};
  const atmosphereTime = () => G.sys.time?.current?.() || {};
  const furnitureDef = id => G.data.furnitureById[id];
  function shade(hex, amount) {
    if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) return hex || palette.ink;
    return '#' + [1, 3, 5].map(i => clamp(parseInt(hex.slice(i, i + 2), 16) + amount, 0, 255).toString(16).padStart(2, '0')).join('');
  }
  function rr(c, x, y, w, h, radius, fill, stroke, lineWidth) {
    const r = Math.min(radius || 0, Math.abs(w) / 2, Math.abs(h) / 2);
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lineWidth || 2; c.stroke(); }
  }
  function ellipse(c, x, y, rx, ry, fill, stroke, lw) {
    c.beginPath(); c.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), 0, 0, TAU);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 2; c.stroke(); }
  }
  function line(c, x1, y1, x2, y2, color, lw) {
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.strokeStyle = color; c.lineWidth = lw || 2; c.stroke();
  }
  function poly(c, points, fill, stroke, lw) {
    c.beginPath(); points.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 2; c.stroke(); }
  }
  function text(c, value, x, y, size, color, align, weight) {
    c.font = `${weight || 500} ${size || 16}px ui-rounded, "PingFang SC", "Microsoft YaHei", sans-serif`;
    c.textAlign = align || 'center'; c.textBaseline = 'middle'; c.fillStyle = color || palette.ink; c.fillText(value, x, y);
  }
  function star(c, x, y, radius, color, rotation) {
    const points = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5 + (rotation || 0); const r = i % 2 ? radius * .46 : radius; points.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
    poly(c, points, color);
  }
  function heart(c, x, y, size, color) {
    c.beginPath(); c.moveTo(x, y + size * .46);
    c.bezierCurveTo(x - size * 1.05, y - size * .08, x - size * .45, y - size * .8, x, y - size * .32);
    c.bezierCurveTo(x + size * .45, y - size * .8, x + size * 1.05, y - size * .08, x, y + size * .46);
    c.fillStyle = color; c.fill();
  }
  function cloud(c, x, y, scale, color) {
    c.save(); c.translate(x, y); c.scale(scale, scale); c.fillStyle = color;
    c.beginPath(); c.moveTo(-68, 14); c.bezierCurveTo(-95, 12, -94, -14, -68, -18);
    c.bezierCurveTo(-72, -48, -29, -57, -12, -32); c.bezierCurveTo(3, -62, 48, -48, 49, -21);
    c.bezierCurveTo(82, -31, 102, 7, 74, 19); c.bezierCurveTo(34, 31, -36, 26, -68, 14); c.closePath(); c.fill(); c.restore();
  }
  function flower(c, x, y, size, color, angle) {
    c.save(); c.translate(x, y); c.rotate(angle || 0);
    for (let i = 0; i < 5; i++) { c.save(); c.rotate(i * TAU / 5); ellipse(c, 0, -size * .56, size * .38, size * .56, color); c.restore(); }
    ellipse(c, 0, 0, size * .32, size * .32, '#E6C57E'); c.restore();
  }
  function leaf(c, x, y, size, color, angle) {
    c.save(); c.translate(x, y); c.rotate(angle || 0); c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-size * .9, -size * .6, 0, -size * 1.5); c.quadraticCurveTo(size * .9, -size * .6, 0, 0); c.fillStyle = color; c.fill(); c.restore();
  }
  function defaultWindow(c, x, y, w, h) {
    if (G.draw?.exterior) { G.draw.exterior.window(c, x, y, w, h, renderState().house.exterior, atmosphereTime() || {}); return; }
    rr(c, x - 5, y - 5, w + 10, h + 10, 20, '#F4E6D1', '#D7C5AD', 2);
    rr(c, x, y, w, h, 16, atmosphereTime()?.phase === 'night' ? '#737D9F' : '#D3E7E4', '#C5D7D0', 1.5);
    c.save(); rr(c, x + 2, y + 2, w - 4, h - 4, 14); c.clip();
    cloud(c, x + w * .7, y + h * .6, .22, '#F7F7E9');
    c.fillStyle = 'rgba(255,255,255,.26)'; poly(c, [[x + 5, y], [x + 27, y], [x + w - 4, y + h], [x + w - 27, y + h]], 'rgba(255,255,255,.3)'); c.restore();
    line(c, x + w / 2, y + 2, x + w / 2, y + h, '#F8EEDC', 4); line(c, x, y + h * .52, x + w, y + h * .52, '#F8EEDC', 4);
    rr(c, x - 10, y + h - 1, w + 20, 7, 3, '#E1C7A7', '#CBAF92', 1.3);
    // 左右柔软窗帘，摆动幅度很小。
    const sway = reducedMotion ? 0 : Math.sin(time * .9 + x) * 1.5;
    for (const side of [0, 1]) {
      const xx = side ? x + w - 13 : x - 4;
      c.beginPath(); c.moveTo(xx - 1, y - 2); c.lineTo(xx + 19, y - 2); c.quadraticCurveTo(xx + 11 + sway, y + 27, xx + 20, y + h - 1); c.quadraticCurveTo(xx + 8, y + h + 5, xx - 3, y + h - 1); c.quadraticCurveTo(xx + 4 + sway, y + 28, xx - 1, y - 2); c.fillStyle = '#EECBD1'; c.fill(); c.strokeStyle = '#D7AEB8'; c.lineWidth = 1.2; c.stroke();
      line(c, xx + 3, y + 42, xx + 13, y + 42, '#D5AD91', 2);
    }
    line(c, x - 14, y - 6, x + w + 14, y - 6, '#BCA18A', 3);
    ellipse(c, x - 17, y - 6, 4, 4, '#D0AD8C'); ellipse(c, x + w + 17, y - 6, 4, 4, '#D0AD8C');
  }

  function furnitureColors(def, item) {
    const fallback = themePalettes[def.theme] || themePalettes.basic;
    const dataPalette = G.data?.themes?.[def.theme]?.palette;
    const colors = Array.isArray(dataPalette) ? dataPalette : dataPalette ? [dataPalette.primary || dataPalette.main || fallback[0], dataPalette.secondary || dataPalette.accent || fallback[1], dataPalette.detail || fallback[2]] : fallback;
    return [item?.color || colors[0] || fallback[0], colors[1] || fallback[1], colors[2] || fallback[2]];
  }
  function motif(c, def, x, y, size, colors) {
    const theme = def.theme, [a, b, d] = colors;
    if (theme === 'strawberry') {
      c.save(); c.translate(x, y); c.rotate(-.12); heart(c, 0, 1, size * .75, '#D98D9E');
      leaf(c, 0, -size * .25, size * .4, '#A6BE9C', .6); leaf(c, 0, -size * .25, size * .4, '#A6BE9C', -.7);
      for (const p of [[-2, 1], [2, 1], [0, 4]]) ellipse(c, p[0] * size / 8, p[1] * size / 8, .6 * size / 8, .9 * size / 8, '#FFEAD8'); c.restore();
    } else if (theme === 'forest') { leaf(c, x, y + size * .4, size, '#8FA986', .5); line(c, x - 2, y + 4, x + 2, y - 4, '#B9CB9D', 1); }
    else if (theme === 'garden') flower(c, x, y, size * .75, b);
    else if (theme === 'ocean') { c.beginPath(); c.arc(x, y + size / 2, size, Math.PI, TAU); c.lineTo(x, y + size / 2); c.fillStyle = '#EDF7EE'; c.fill(); for (let i = -1; i <= 1; i++) line(c, x, y + size / 2, x + i * size * .65, y - size * .35, '#B7D2D5', 1); }
    else if (theme === 'cloud') cloud(c, x, y, size / 68, '#FEFFFA');
    else if (theme === 'starry') star(c, x, y, size, b, .1);
    else if (theme === 'princess') { poly(c, [[x - size, y + size * .5], [x - size, y - size * .7], [x - size * .4, y], [x, y - size], [x + size * .4, y], [x + size, y - size * .7], [x + size, y + size * .5]], b, d, 1); }
    else if (theme === 'oriental') { c.beginPath(); c.arc(x - size * .35, y, size * .5, Math.PI * .8, TAU * 1.1); c.arc(x + size * .35, y, size * .5, Math.PI, TAU * 1.3); c.strokeStyle = b; c.lineWidth = 2; c.stroke(); }
  }
  function drawFurniture(c, def, x, y, item) {
    if (def.customArt) {
      const art = renderState().customArts.find(value => value.id === item?.artId); if (!art || !G.draw?.creative) return;
      c.save(); c.translate(x, y); if (item.flip) { c.translate(def.w, 0); c.scale(-1, 1); }
      G.draw.creative.drawFrame(c, art, 0, 0, def.w, def.h); c.restore(); return;
    }
    if (G.draw?.crafting && G.draw.crafting(c, def, x, y, item || {})) return;
    if (G.draw?.furnitureExtra && G.draw.furnitureExtra(c, def, x, y, item || {})) return;
    if (def.template === 'yard' && G.draw?.yard) { G.draw.yard(c, def, x, y, item || {}); return; }
    if (def.template === 'festival' && G.draw?.festival) {
      c.save();
      if (item?.flip) { c.translate(x + def.w, y); c.scale(-1, 1); G.draw.festival.draw(c, def, 0, 0, item); }
      else G.draw.festival.draw(c, def, x, y, item || {});
      c.restore(); return;
    }
    const w = Number(def.w) || 60, h = Number(def.h) || 50;
    const colors = furnitureColors(def, item), [a, b, d] = colors, edge = shade(a, -31), wood = '#C4A080';
    c.save(); c.translate(x, y); if (item?.flip) { c.translate(w, 0); c.scale(-1, 1); }
    c.lineCap = 'round'; c.lineJoin = 'round';
    if (def.place !== 'wall' && def.place !== 'ceiling') ellipse(c, w / 2, h - 1, w * .46, Math.min(5, h * .1), 'rgba(118,91,77,.12)');
    const box = (xx, yy, ww, hh, r, fill, stroke, lw) => rr(c, xx, yy, ww, hh, r, fill || a, stroke === false ? null : stroke || edge, lw || 2);
    const leg = (xx, yy, hh, color) => rr(c, xx, yy, Math.max(4, w * .055), hh, 2, color || wood, shade(color || wood, -18), 1);
    const knob = (xx, yy) => ellipse(c, xx, yy, 2.3, 2.3, '#C99E75', '#B2866C', 1);
    switch (def.template) {
      case 'bed':
        leg(6, h - 17, 16); leg(w - 13, h - 17, 16);
        box(3, 1, w * .28, h - 9, 12, a); box(w - 14, h * .49, 11, h * .41, 4, a);
        box(9, h * .33, w - 19, h * .48, 11, b, shade(b, -30));
        box(15, h * .25, w * .25, h * .28, 8, '#FFF8E8', '#DDCBB6', 1.5);
        box(w * .36, h * .35, w * .53, h * .43, 6, a);
        line(c, w * .42, h * .39, w * .42, h * .71, shade(a, 22), 2);
        for (let i = 0; i < 5; i++) ellipse(c, w * .39 + i * w * .1, h * .76, w * .052, 3, b);
        motif(c, def, w * .64, h * .55, 10, colors); break;
      case 'nightstand': case 'counter': case 'toy_box':
        leg(5, h - 9, 9); leg(w - 10, h - 9, 9); box(2, 8, w - 4, h - 15, 5, a); box(0, 2, w, 10, 4, b, shade(b, -30));
        if (def.template === 'toy_box') { motif(c, def, w / 2, h * .57, h * .21, colors); }
        else { box(7, 18, w - 14, Math.max(10, (h - 25) * .45), 3, shade(a, 8), edge, 1.3); knob(w / 2, 23); line(c, w / 2, h * .55, w / 2, h - 11, edge, 1.2); knob(w * .36, h * .73); knob(w * .63, h * .73); } break;
      case 'wardrobe':
        leg(8, h - 10, 10); leg(w - 14, h - 10, 10); box(2, 4, w - 4, h - 12, 11, a); box(0, 1, w, 11, 5, b, shade(b, -25));
        box(8, 19, w / 2 - 10, h - 37, 5, shade(a, 8), edge, 1.3); box(w / 2 + 2, 19, w / 2 - 10, h - 37, 5, shade(a, 8), edge, 1.3);
        knob(w / 2 - 7, h * .58); knob(w / 2 + 7, h * .58); motif(c, def, w * .25, h * .35, 8, colors); motif(c, def, w * .75, h * .35, 8, colors); break;
      case 'vanity':
        leg(8, h * .65, h * .35); leg(w - 13, h * .65, h * .35);
        ellipse(c, w / 2, h * .28, w * .25, h * .27, b, edge, 4); ellipse(c, w / 2, h * .28, w * .2, h * .22, '#DBEAE7');
        line(c, w * .43, h * .18, w * .58, h * .39, '#F7FAEF', 3); box(0, h * .54, w, h * .24, 5, a); line(c, w * .5, h * .57, w * .5, h * .75, edge, 1); knob(w * .25, h * .65); knob(w * .75, h * .65); break;
      case 'sofa': case 'armchair':
        leg(9, h - 10, 10); leg(w - 15, h - 10, 10); box(8, 2, w - 16, h * .7, 13, a);
        box(8, h * .43, w - 16, h * .41, 8, shade(a, 10)); box(0, h * .26, w * .16, h * .58, 8, b, shade(b, -32)); box(w * .84, h * .26, w * .16, h * .58, 8, b, shade(b, -32));
        if (def.template === 'sofa') { line(c, w / 2, h * .48, w / 2, h * .77, edge, 1); box(w * .20, h * .2, w * .21, h * .37, 6, b, shade(b, -25), 1.4); motif(c, def, w * .30, h * .38, 6, colors); box(w * .61, h * .2, w * .2, h * .37, 6, b, shade(b, -25), 1.4); }
        else motif(c, def, w / 2, h * .3, 7, colors); break;
      case 'coffee_table': case 'dining_table':
        leg(8, h * .3, h * .7); leg(w - 14, h * .3, h * .7); if (def.template === 'coffee_table') box(9, h * .68, w - 18, 5, 2, a);
        box(0, 1, w, Math.max(10, h * .28), 8, a); line(c, 10, 5, w - 10, 5, shade(a, 22), 1.5); motif(c, def, w / 2, h * .15, Math.min(5, h * .15), colors); break;
      case 'rug':
        ellipse(c, w / 2, h / 2, w / 2 - 2, h / 2 - 1, a, edge, 1.5); ellipse(c, w / 2, h / 2, w / 2 - 11, Math.max(1, h / 2 - 4), null, b, 1.5); motif(c, def, w / 2, h / 2, Math.min(5, h * .25), colors); break;
      case 'floor_lamp': case 'desk_lamp':
        ellipse(c, w / 2, h - 4, w * .4, 4, b, edge, 1.5); line(c, w / 2, h * .27, w / 2, h - 5, d, def.template === 'floor_lamp' ? 4 : 3);
        c.save(); c.globalAlpha = .13; ellipse(c, w / 2, h * .38, w * .7, h * .3, '#FFF5BB'); c.restore();
        poly(c, [[w * .22, 2], [w * .78, 2], [w - 1, h * .31], [1, h * .31]], a, edge, 2); ellipse(c, w / 2, h * .31, w * .46, 3, b, edge, 1.5); motif(c, def, w / 2, h * .16, Math.min(6, h * .08), colors); break;
      case 'bookshelf':
        leg(7, h - 8, 8); leg(w - 12, h - 8, 8); box(2, 2, w - 4, h - 8, 7, a); box(9, 11, w - 18, h - 25, 3, shade(a, -12), edge, 1);
        for (let row = 0; row < 3; row++) { const yy = 14 + row * (h - 25) / 3; for (let i = 0; i < 5; i++) { const bh = 12 + (i * 7 + row * 11) % 11; box(13 + i * (w - 26) / 5, yy + 22 - bh, (w - 32) / 5, bh, 1, [b, '#D8B7BC', '#B4C5AD', '#EBD3A6', '#B6CCD5'][(i + row) % 5], shade(a, -30), 1); } box(8, yy + 23, w - 16, 4, 1, b, edge, 1); } break;
      case 'chair':
        leg(5, h * .63, h * .37); leg(w - 10, h * .63, h * .37); box(3, 2, w - 6, h * .48, 8, a); line(c, 7, h * .37, 7, h * .63, edge, 3); line(c, w - 7, h * .37, w - 7, h * .63, edge, 3); box(0, h * .57, w, h * .16, 5, b, shade(b, -30)); motif(c, def, w / 2, h * .24, 6, colors); break;
      case 'stove':
        leg(7, h - 6, 6); leg(w - 12, h - 6, 6); box(2, 8, w - 4, h - 13, 6, a); box(0, 3, w, 12, 4, b, shade(b, -30));
        ellipse(c, w * .28, 7, w * .14, 3, '#A08F89'); ellipse(c, w * .73, 7, w * .14, 3, '#A08F89'); box(10, h * .42, w - 20, h * .4, 4, '#8C7D7F', '#AA8F8B', 1.5); box(14, h * .48, w - 28, h * .25, 3, '#B7B5AB', false); line(c, 17, h * .43, w - 17, h * .43, b, 3); for (let i = 0; i < 3; i++) knob(w * .25 + i * w * .25, h * .31); break;
      case 'fridge':
        box(2, 2, w - 4, h - 6, 9, a); line(c, 3, h * .34, w - 3, h * .34, edge, 2); line(c, w * .78, h * .14, w * .78, h * .26, d, 3); line(c, w * .78, h * .43, w * .78, h * .63, d, 3); motif(c, def, w * .42, h * .57, 9, colors); box(w * .17, h * .1, w * .25, h * .12, 2, b, false); break;
      case 'bathtub':
        leg(15, h - 8, 8); leg(w - 21, h - 8, 8); c.beginPath(); c.moveTo(3, h * .34); c.lineTo(12, h * .77); c.quadraticCurveTo(17, h - 8, 30, h - 8); c.lineTo(w - 30, h - 8); c.quadraticCurveTo(w - 17, h - 8, w - 12, h * .77); c.lineTo(w - 3, h * .34); c.closePath(); c.fillStyle = a; c.fill(); c.strokeStyle = edge; c.lineWidth = 2; c.stroke();
        ellipse(c, w / 2, h * .34, w / 2 - 2, h * .17, b, edge, 2); ellipse(c, w / 2, h * .34, w / 2 - 11, h * .105, '#C4DFDB');
        c.beginPath(); c.moveTo(w * .79, h * .27); c.lineTo(w * .79, 4); c.quadraticCurveTo(w * .79, -3, w * .70, 4); c.lineTo(w * .70, h * .14); c.strokeStyle = '#B9B8AA'; c.lineWidth = 4; c.stroke(); motif(c, def, w / 2, h * .68, 9, colors); break;
      case 'sink':
        box(8, h * .4, w - 16, h * .54, 6, a); line(c, w / 2, h * .5, w / 2, h * .86, edge, 1); knob(w * .37, h * .67); knob(w * .63, h * .67);
        ellipse(c, w / 2, h * .36, w / 2 - 2, h * .13, b, edge, 2); ellipse(c, w / 2, h * .36, w * .3, h * .065, '#C4DCD9'); line(c, w / 2, h * .08, w / 2, h * .29, '#B6B7AA', 4); line(c, w / 2, h * .09, w * .65, h * .09, '#B6B7AA', 4); break;
      case 'piano':
        leg(8, h - 16, 16); leg(w - 13, h - 16, 16); box(3, 5, w - 6, h * .7, 7, a); box(0, h * .49, w, h * .18, 3, b, edge, 2);
        for (let i = 1; i < 13; i++) { const xx = 4 + i * (w - 8) / 13; line(c, xx, h * .5, xx, h * .65, '#C3B3A3', 1); if (i % 7 !== 3 && i % 7 !== 0) box(xx - 2, h * .49, 4, h * .1, 1, '#83767C', false); }
        motif(c, def, w / 2, h * .27, 11, colors); line(c, 15, 12, w - 15, 12, shade(a, 22), 2); break;
      case 'easel':
        line(c, w * .48, 3, w * .13, h - 3, wood, 5); line(c, w * .52, 3, w * .87, h - 3, wood, 5); line(c, w * .48, h * .37, w * .61, h - 2, shade(wood, -15), 4);
        box(w * .08, h * .13, w * .84, h * .59, 3, b, edge, 2); box(w * .15, h * .18, w * .7, h * .48, 2, '#F7EDDA', false);
        c.save(); rr(c, w * .15, h * .18, w * .7, h * .48, 2); c.clip(); ellipse(c, w * .67, h * .31, 6, 6, '#E9CB8B'); poly(c, [[w * .15, h * .65], [w * .32, h * .39], [w * .6, h * .61], [w * .75, h * .44], [w * .86, h * .65]], '#BCD1B0'); line(c, w * .15, h * .59, w * .85, h * .59, '#BBCDD8', 5); c.restore(); box(0, h * .72, w, 6, 2, a); break;
      case 'aquarium':
        leg(9, h - 7, 7); leg(w - 14, h - 7, 7); box(2, 8, w - 4, h - 18, 5, '#C4E3E2', '#9ABEBB', 2.5); box(0, 3, w, 8, 3, a); box(0, h - 14, w, 7, 2, a); line(c, 7, h - 18, w - 7, h - 18, '#E7D8AF', 6);
        for (let i = 0; i < 3; i++) leaf(c, 14 + i * 8, h - 18, 10 + i * 2, '#9FC1A0', (i - 1) * .4);
        ellipse(c, w * .63, h * .45, 7, 4, '#EDBB9A'); poly(c, [[w * .63 + 6, h * .45], [w * .63 + 12, h * .45 - 5], [w * .63 + 12, h * .45 + 5]], '#E5A687'); ellipse(c, w * .63 - 4, h * .45 - 1, 1, 1, '#8F7271'); ellipse(c, w * .73, h * .29, 2, 2, null, '#F7FBF1', 1); line(c, 8, 16, 15, 26, '#EBF6E9', 3); break;
      case 'indoor_swing': case 'swing':
        line(c, 5, 1, 11, h - 15, d, 2); line(c, w - 5, 1, w - 11, h - 15, d, 2); box(4, h - 21, w - 8, 13, 6, a); motif(c, def, w / 2, h - 14, 5, colors); break;
      case 'window':
        defaultWindow(c, 8, 8, w - 16, h - 18); break;
      case 'frame':
        box(1, 1, w - 2, h - 2, 6, a); box(6, 6, w - 12, h - 12, 3, b, shade(a, -12), 1); poly(c, [[8, h - 8], [w * .45, h * .35], [w * .69, h * .69], [w - 8, h * .48], [w - 8, h - 8]], '#C3D0AF'); ellipse(c, w * .72, h * .29, 4, 4, '#E8CB89'); break;
      case 'mirror':
        ellipse(c, w / 2, h / 2, w / 2 - 2, h / 2 - 2, a, edge, 2.5); ellipse(c, w / 2, h / 2, w / 2 - 7, h / 2 - 7, '#D6E7E6', '#C0D3CF', 1); line(c, w * .32, h * .24, w * .61, h * .59, '#F9FBF2', 3); line(c, w * .39, h * .19, w * .68, h * .53, '#EFF7EF', 1.5); motif(c, def, w / 2, 7, 5, colors); break;
      case 'clock':
        ellipse(c, w / 2, h / 2, w / 2 - 2, h / 2 - 2, a, edge, 2.5); ellipse(c, w / 2, h / 2, w / 2 - 6, h / 2 - 6, b); for (let i = 0; i < 12; i++) { const angle = i * TAU / 12; ellipse(c, w / 2 + Math.sin(angle) * w * .29, h / 2 - Math.cos(angle) * h * .29, .8, .8, d); } line(c, w / 2, h / 2, w / 2, h * .29, d, 1.8); line(c, w / 2, h / 2, w * .7, h * .55, d, 1.8); break;
      case 'wall_shelf':
        poly(c, [[w * .15, 3], [w * .15, h - 1], [w * .3, 3]], d); poly(c, [[w * .7, 3], [w * .85, h - 1], [w * .85, 3]], d); box(0, 0, w, Math.max(5, h * .5), 3, a); break;
      case 'garland':
        c.beginPath(); c.moveTo(1, 1); c.quadraticCurveTo(w / 2, h * .9, w - 1, 1); c.strokeStyle = d; c.lineWidth = 1.6; c.stroke(); for (let i = 0; i < 7; i++) { const xx = 5 + i * (w - 20) / 6, yy = 2 + Math.sin(i * Math.PI / 6) * h * .33; poly(c, [[xx, yy], [xx + 10, yy + 1], [xx + 5, yy + h * .48]], [a, b, '#B9D3BE'][i % 3], shade(a, -18), 1); } break;
      case 'ceiling_lamp':
        line(c, w / 2, 0, w / 2, h * .48, d, 2); ellipse(c, w / 2, 2, w * .2, 2, a, edge, 1.3);
        c.save(); c.globalAlpha = .13; ellipse(c, w / 2, h * .9, w * .65, h * .24, '#FFF0A8'); c.restore();
        c.beginPath(); c.moveTo(1, h * .87); c.bezierCurveTo(3, h * .32, w - 3, h * .32, w - 1, h * .87); c.closePath(); c.fillStyle = a; c.fill(); c.strokeStyle = edge; c.lineWidth = 2; c.stroke(); ellipse(c, w / 2, h * .87, w / 2 - 2, 4, b, edge, 1); motif(c, def, w / 2, h * .64, 6, colors); break;
      case 'vase':
        for (let i = 0; i < 3; i++) { const xx = w * (.2 + i * .3), yy = h * (.13 + (i % 2) * .1); line(c, w / 2, h * .66, xx, yy, '#8EA88A', 1.3); flower(c, xx, yy, 4, [a, '#F8EACC', '#E9BCCB'][i]); }
        c.beginPath(); c.moveTo(w * .35, h * .48); c.bezierCurveTo(w * .35, h * .67, w * .13, h * .72, w * .24, h * .93); c.quadraticCurveTo(w * .5, h + 1, w * .76, h * .93); c.bezierCurveTo(w * .87, h * .72, w * .65, h * .67, w * .65, h * .48); c.closePath(); c.fillStyle = a; c.fill(); c.strokeStyle = edge; c.lineWidth = 1.5; c.stroke(); line(c, w * .35, h * .49, w * .65, h * .49, b, 2); break;
      case 'cake':
        ellipse(c, w / 2, h - 2, w / 2 - 1, 3, b, '#D6C2AF', 1); box(3, h * .35, w - 6, h * .5, 4, a); line(c, 5, h * .64, w - 5, h * .64, b, 3); ellipse(c, w / 2, h * .35, w / 2 - 3, h * .12, b, shade(b, -25), 1); for (let i = 0; i < 3; i++) ellipse(c, w * .27 + i * w * .23, h * .32, 3, 4, '#E2A0AB'); leaf(c, w / 2, h * .25, 3, '#98B291', -.4); break;
      case 'teapot':
        c.beginPath(); c.arc(w * .77, h * .57, w * .2, -Math.PI * .7, Math.PI * .7); c.strokeStyle = edge; c.lineWidth = 3; c.stroke(); poly(c, [[w * .24, h * .46], [0, h * .29], [w * .11, h * .65], [w * .28, h * .7]], a, edge, 1.5); ellipse(c, w * .48, h * .61, w * .32, h * .3, a, edge, 1.7); ellipse(c, w * .48, h * .34, w * .21, h * .06, b, edge, 1); ellipse(c, w * .48, h * .27, 3, 3, d); motif(c, def, w * .5, h * .61, 5, colors); break;
      case 'books':
        for (let i = 0; i < 3; i++) { box(2 + (i % 2) * 3, h - 8 - i * 7, w - 7, 6, 1, [a, b, '#B7CBB0'][i], shade(a, -25), 1); line(c, 6, h - 5 - i * 7, w - 8, h - 5 - i * 7, '#F8F0DE', 2); } break;
      case 'plush':
        ellipse(c, w * .25, h * .18, w * .13, h * .17, a, edge, 1.3); ellipse(c, w * .75, h * .18, w * .13, h * .17, a, edge, 1.3); ellipse(c, w / 2, h * .75, w * .3, h * .22, a, edge, 1.3); ellipse(c, w / 2, h * .39, w * .41, h * .3, a, edge, 1.5); ellipse(c, w * .35, h * .38, 1.3, 1.8, '#886E72'); ellipse(c, w * .65, h * .38, 1.3, 1.8, '#886E72'); ellipse(c, w * .5, h * .49, 1.4, 1, '#886E72'); heart(c, w / 2, h * .76, w * .13, b); break;
      case 'candle':
        ellipse(c, w / 2, h - 3, w * .46, 3, b, edge, 1); box(w * .22, h * .34, w * .56, h * .55, 3, a); ellipse(c, w / 2, h * .34, w * .28, 3, b, edge, 1); line(c, w / 2, h * .32, w / 2, h * .22, d, 1); c.beginPath(); c.moveTo(w / 2, 1); c.bezierCurveTo(w * .2, h * .22, w * .6, h * .31, w * .66, h * .19); c.quadraticCurveTo(w * .67, h * .12, w / 2, 1); c.fillStyle = '#E9C88A'; c.fill(); break;
      case 'crystal_ball':
        box(w * .16, h * .83, w * .68, h * .12, 3, a); poly(c, [[w * .32, h * .64], [w * .68, h * .64], [w * .79, h * .86], [w * .21, h * .86]], a, edge, 1); ellipse(c, w / 2, h * .38, w * .43, h * .37, '#D8CFEA', '#B6A7CB', 1.5); star(c, w * .56, h * .4, w * .17, '#F8E8BE'); ellipse(c, w * .3, h * .23, 2, 3, '#F6F1FC'); break;
      case 'potted_plant': case 'plant':
        for (let i = 0; i < 6; i++) { const xx = w * (.18 + (i % 3) * .31), yy = h * (.23 + (i % 2) * .15); line(c, w / 2, h * .72, xx, yy, '#92AC87', 1.8); leaf(c, xx, yy + 4, w * (.22 + (i % 2) * .08), i % 2 ? '#A8C29C' : '#B7CEA6', (i - 2) * .35); }
        poly(c, [[w * .16, h * .64], [w * .84, h * .64], [w * .73, h * .95], [w * .27, h * .95]], a, edge, 1.8); box(w * .12, h * .61, w * .76, h * .1, 3, b, edge, 1.5); motif(c, def, w / 2, h * .82, 5, colors); break;
      default:
        box(2, 3, w - 4, h - 7, 8, a); motif(c, def, w / 2, h / 2, Math.min(w, h) * .24, colors); line(c, w * .2, h * .8, w * .8, h * .8, b, 2);
    }
    c.restore();
  }

  function character(c, id, x, bottom, scale, options) {
    if (!options?.noShadow) ellipse(c, x, bottom - 1, 26 * scale, 6.5 * scale, 'rgba(96,64,66,.24)');
    if (G.draw?.residentExtra && G.draw.residentExtra(c, id, x, bottom, scale, Object.assign({ time, reducedMotion }, options || {}))) return;
    const opts = options || {}, isFox = id === 'orange', isBear = id === 'pudding', isCloud = id === 'nuomi';
    const body = isFox ? '#E8B990' : isBear ? '#D8BC97' : '#FBF5E8';
    const edge = isFox ? '#BC957F' : isBear ? '#B59B81' : '#D1BBAC';
    const accent = isFox ? '#B2C4A2' : isBear ? '#E9CC8E' : '#E8B6C4';
    const bob = reducedMotion || opts.still ? 0 : Math.sin(time * (isCloud ? 1.5 : 1.8) + x * .04) * (isCloud ? 4 : 1.3);
    c.save(); c.translate(x, bottom + bob); c.scale(scale, scale);
    ellipse(c, 0, -1, 24, 5, 'rgba(126,105,92,.11)');
    if (isCloud) {
      c.beginPath(); c.moveTo(-29, -14); c.bezierCurveTo(-49, -11, -50, -36, -32, -40); c.bezierCurveTo(-35, -63, -9, -71, 2, -56); c.bezierCurveTo(15, -71, 40, -57, 36, -38); c.bezierCurveTo(55, -31, 48, -11, 31, -12); c.bezierCurveTo(15, -6, -17, -5, -29, -14); c.closePath(); c.fillStyle = '#FFFCF3'; c.fill(); c.strokeStyle = '#DCCABA'; c.lineWidth = 2; c.stroke();
      star(c, -28, -49, 6, '#E6C883', -.15); face(c, 0, -33, false, time); ellipse(c, -29, -17, 8, 4, '#FFFCF3', '#DCCABA', 1.3); ellipse(c, 31, -17, 8, 4, '#FFFCF3', '#DCCABA', 1.3);
    } else {
      if (isFox) { c.beginPath(); c.moveTo(13, -20); c.bezierCurveTo(54, -38, 54, -13, 22, -8); c.closePath(); c.fillStyle = body; c.fill(); c.strokeStyle = edge; c.lineWidth = 2; c.stroke(); c.beginPath(); c.moveTo(35, -25); c.quadraticCurveTo(48, -25, 39, -15); c.lineTo(31, -16); c.closePath(); c.fillStyle = '#FFF3DC'; c.fill(); }
      ellipse(c, -10, -5, 8, 5, body, edge, 1.7); ellipse(c, 10, -5, 8, 5, body, edge, 1.7);
      ellipse(c, 0, -25, 19, 24, body, edge, 2);
      // 连衣裙/围兜采用小圆领与口袋。
      c.beginPath(); c.moveTo(-13, -38); c.quadraticCurveTo(0, -31, 13, -38); c.lineTo(20, -12); c.quadraticCurveTo(0, -7, -20, -12); c.closePath(); c.fillStyle = accent; c.fill(); c.strokeStyle = shade(accent, -23); c.lineWidth = 1.5; c.stroke();
      ellipse(c, -18, -27, 6, 10, body, edge, 1.5); ellipse(c, 18, -27, 6, 10, body, edge, 1.5);
      if (isFox) { poly(c, [[-25, -58], [-25, -85], [-5, -68]], body, edge, 2); poly(c, [[25, -58], [25, -85], [5, -68]], body, edge, 2); poly(c, [[-21, -66], [-21, -78], [-12, -68]], '#E6A8A4'); poly(c, [[21, -66], [21, -78], [12, -68]], '#E6A8A4'); }
      else if (isBear) { ellipse(c, -21, -71, 11, 12, body, edge, 2); ellipse(c, 21, -71, 11, 12, body, edge, 2); ellipse(c, -21, -71, 6, 7, '#E8C4B4'); ellipse(c, 21, -71, 6, 7, '#E8C4B4'); }
      else { c.save(); c.rotate(-.12); ellipse(c, -13, -82, 9, 24, body, edge, 2); ellipse(c, -13, -82, 4, 17, '#ECC5CB'); c.restore(); c.save(); c.rotate(.12); ellipse(c, 13, -82, 9, 24, body, edge, 2); ellipse(c, 13, -82, 4, 17, '#ECC5CB'); c.restore(); }
      ellipse(c, 0, -55, 30, 26, body, edge, 2);
      if (isFox) { c.beginPath(); c.moveTo(-24, -50); c.quadraticCurveTo(-11, -46, -7, -55); c.quadraticCurveTo(0, -44, 7, -55); c.quadraticCurveTo(11, -46, 24, -50); c.quadraticCurveTo(20, -31, 0, -31); c.quadraticCurveTo(-20, -31, -24, -50); c.fillStyle = '#FFF1DB'; c.fill(); }
      if (isBear) ellipse(c, 0, -44, 12, 9, '#F2DFBC');
      face(c, 0, -52, opts.happy, time + x);
      if (isBear) { rr(c, -6, -25, 12, 9, 3, '#F4E3B6', '#CEB277', 1); line(c, -3, -22, 3, -22, '#CEB277', 1); }
      else if (isFox) { poly(c, [[-5, -33], [-14, -39], [-14, -26]], '#A1B88E', '#8DA77E', 1); poly(c, [[5, -33], [14, -39], [14, -26]], '#A1B88E', '#8DA77E', 1); ellipse(c, 0, -33, 4, 4, '#B4C39D'); }
      else { poly(c, [[-18, -75], [-29, -83], [-29, -70]], '#DE9EB1', '#C98A9F', 1); poly(c, [[-18, -75], [-8, -83], [-8, -70]], '#DE9EB1', '#C98A9F', 1); ellipse(c, -18, -75, 3, 3, '#E9BAC8'); }
    }
    c.restore();
  }
  function face(c, x, y, happy, t) {
    const blink = !reducedMotion && Math.sin(t * .17) > .996;
    ellipse(c, x - 15, y + 6, 6, 3.3, '#F0BFCA'); ellipse(c, x + 15, y + 6, 6, 3.3, '#F0BFCA');
    for (const side of [-1, 1]) {
      if (blink || happy) { c.beginPath(); c.arc(x + side * 9, y, 3.3, Math.PI * 1.1, Math.PI * 1.9); c.strokeStyle = '#80666C'; c.lineWidth = 1.8; c.stroke(); }
      else { ellipse(c, x + side * 9, y, 2.6, 3.7, '#80666C'); ellipse(c, x + side * 9 - .8, y - 1.2, .85, 1.1, '#FFFCF0'); }
    }
    ellipse(c, x, y + 5, 1.8, 1.3, '#AA7E85');
    c.beginPath(); c.moveTo(x - 5, y + 8); c.quadraticCurveTo(x - 2, y + 12, x, y + 8); c.quadraticCurveTo(x + 2, y + 12, x + 5, y + 8); c.strokeStyle = '#9B7B7F'; c.lineWidth = 1.3; c.stroke();
  }
  function drawThumbnail(target, defId) {
    const def = furnitureDef(defId); if (!target || !def) return;
    const bounds = target.getBoundingClientRect?.(); const ww = bounds?.width || 96, hh = bounds?.height || 76, ratio = Math.min(2, window.devicePixelRatio || 1);
    target.width = Math.round(ww * ratio); target.height = Math.round(hh * ratio);
    const c = target.getContext('2d'); if (!c) return;
    c.setTransform(ratio, 0, 0, ratio, 0, 0); c.clearRect(0, 0, ww, hh);
    const s = Math.min((ww - 16) / def.w, (hh - 16) / def.h, 1.15);
    c.translate((ww - def.w * s) / 2, (hh - def.h * s) / 2); c.scale(s, s); drawFurniture(c, def, 0, 0, {});
  }
  function drawCharacter(target, id) {
    if (!target) return;
    const bounds = target.getBoundingClientRect?.(), ww = bounds?.width || 90, hh = bounds?.height || 100, ratio = Math.min(2, window.devicePixelRatio || 1);
    target.width = Math.round(ww * ratio); target.height = Math.round(hh * ratio);
    const c = target.getContext('2d'); if (!c) return;
    c.setTransform(ratio, 0, 0, ratio, 0, 0); c.clearRect(0, 0, ww, hh);
    character(c, id, ww / 2, hh - 7, Math.min((ww - 12) / (G.data.residents.find(def => def.id === id)?.portraitWidth || 75), (hh - 12) / (G.data.residents.find(def => def.id === id)?.portraitHeight || (id === 'lily' ? 112 : 93))), { still: true });
  }
  G.catalogArt = {drawThumbnail, drawCharacter};
  G.draw = G.draw || {}; G.draw.furniture = G.draw.furniture || {}; G.draw.furniture.draw = drawFurniture;
})(window.Game);
