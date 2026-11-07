(function (G) {
  'use strict';
  // 云海地图：只负责云位布局、绘制与命中。邻居数据由 ui/sea-map.js 通过 setHouses 推入，这里不做网络请求。
  var MAX_HOUSES = 40, TAU = Math.PI * 2;
  // 云位沿黄金角螺旋围着小岛散开，四面都有、疏密自然，不是整齐的网格。
  var CENTER = { x: 310, y: -100 }, RADIUS = { x: 3400, y: 2100 }, SPIRAL = 150, GOLDEN = 2.399963;
  // 自己的小岛与花园所占区域，云位不得进入；更高的楼层会盖住身后的云，不影响点击。
  var KEEP_OUT = { left: -1100, right: 1700, top: -900, bottom: 620 };
  // 贴着小岛边缘的近处小云：默认视角的四周就能露出几朵，不必点全景；比远处的云小一圈。
  var NEAR = [{ x: -820, y: -300 }, { x: 380, y: -620 }, { x: 1480, y: -260 }, { x: 1360, y: 500 }, { x: 360, y: 580 }, { x: -680, y: 480 }], NEAR_SCALE = .72;
  var walls = ['#F8D9DE', '#D9ECDD', '#FBE7C4', '#D8E6F5', '#E6DBF1', '#FCE3D3'];
  var roofs = ['#E7A7B5', '#9FCBAE', '#E8C07C', '#98B9DC', '#BFA7D9', '#EDA98A'];
  var shadows = ['#8E7A9A', '#7FA38F', '#D49A8B'];
  var ORDER = [0,6,23,1,7,24,2,8,25,3,9,26,4,10,27,5,11,28,12,29,13,30,14,31,15,32,16,33,17,34,18,35,19,36,20,37,21,38,22,39], slots = [], placed = [], empties = [], emptyOn = false;

  for (var k = 0; k < SPIRAL; k++) {
    var radius = Math.sqrt((k + .5) / SPIRAL), angle = k * GOLDEN, sx = CENTER.x + RADIUS.x * radius * Math.cos(angle), sy = CENTER.y + RADIUS.y * radius * Math.sin(angle);
    // 单朵云再抖动最多 ±40/±30，边界各外扩一圈，保证抖动后仍在禁区外。
    if (sx > KEEP_OUT.left - 40 && sx < KEEP_OUT.right + 40 && sy > KEEP_OUT.top - 30 && sy < KEEP_OUT.bottom + 30) continue;
    if (NEAR.some(function (near) { return Math.hypot(near.x - sx, near.y - sy) < 360; })) continue;
    slots.push({ x: Math.round(sx), y: Math.round(sy) });
  }
  function reach(slot) { return Math.hypot(slot.x - CENTER.x, (slot.y - CENTER.y) * 1.7); }
  slots.sort(function (a, b) { return reach(a) - reach(b); });
  // 近处的小云排在最前面：小屋少时先住进这几朵，空云也画在这里。
  slots = NEAR.map(function (near) { return { x: near.x, y: near.y, near: true }; }).concat(slots);
  empties = slots.slice(0, NEAR.length).map(function (slot, i) { return { house: { id: 'empty', empty: true, title: '等邻居来' }, x: slot.x, y: slot.y, k: NEAR_SCALE, phase: i * 1.1, tone: i }; });
  function visible() { return placed.length ? placed : emptyOn ? empties : []; }
  // 3D 主场景默认只摆 8 座邻居岛（7-8 座散落在小屋四周）；点“看远方”的云海全览才摆全部（上限 MAX_HOUSES）。
  var VISUAL_LIMIT = 8;
  // 3D 用正交相机，没有近大远小，所以“越远越小”必须靠岛屿自身缩放来做：离自己的小屋越近越大、越远越小。
  // 常量与 world3d.js 的坐标换算保持一致：x/100 为世界 x，1.45+y/75 为世界 z，(-.6,.9) 为 MAIN_ISLAND 圆心；
  // 缩放范围必须落在 world3d.neighborLocation 允许的 .5–1.25 内，否则会被它截断。
  // 斜率不能太平：默认 8 座岛的距离只分布在约 8–25 之间，斜率 .025 时大小只差 1.09↔.69，肉眼看几乎一样；
  // 现在 8 距离约 1.25（最近）→ 16 距离约 .75 → 24 以外 .5，差距要一眼看得出。
  function depthScale(x, y) {
    var distance = Math.hypot(x / 100 + .6, 1.45 + y / 75 - .9);
    return Math.round(clamp(1.3 - (distance - 8) * .06, .5, 1.25) * 1000) / 1000;
  }
  // 3D 邻居岛列表。位置按 ORDER 梯队固定：第 rank 座岛永远在 ORDER[rank] 号云位，真实邻居占住自己的 rank，
  // 其余补“待邻居入住”的空岛——这样没有人时也能看到空岛提示，有人时不会因邻居增减而挪位。
  // 只用于 3D；2D 云海仍用 visible()，空云数量与 emptyCount() 不变。
  function visualPositions(options) {
    if (!placed.length && !emptyOn) return [];
    var count = options && options.all ? Math.max(VISUAL_LIMIT, placed.length) : VISUAL_LIMIT, byRank = [], list = [];
    placed.forEach(function (item) { if (item.rank < count) byRank[item.rank] = item; });
    for (var rank = 0; rank < count; rank++) {
      var item = byRank[rank], slot = item || slots[ORDER[rank % ORDER.length]];
      list.push({ id: item ? item.house.id : 'empty', x: slot.x, y: slot.y, empty: !item, scale: depthScale(slot.x, slot.y) });
    }
    return list;
  }
  function setEmpty(flag) { emptyOn = !!flag; }

  function hash(text) {
    var value = 2166136261;
    for (var i = 0; i < text.length; i++) { value ^= text.charCodeAt(i); value = Math.imul(value, 16777619) >>> 0; }
    return value >>> 0;
  }
  function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }
  function clip(text, limit) { var chars = Array.from(String(text)); return chars.length > limit ? chars.slice(0, limit).join('') + '…' : chars.join(''); }

  // 按 id 哈希排序与 ORDER 梯队交错：近景、中景与远方交替展开，邻居少时有近有远且拉开间距，邻居多时自然填满四周与浩瀚云海；同一批小屋位置恒定，与传入顺序无关。
  function setHouses(list) {
    var picked = (Array.isArray(list) ? list : []).slice(0, MAX_HOUSES);
    placed = picked.map(function (house) { return { house: house, h: hash(house.id) }; }).sort(function (a, b) { return a.h - b.h || (a.house.id < b.house.id ? -1 : 1); }).map(function (entry, rank) {
      var index = ORDER[rank % ORDER.length];
      var h = entry.h;
      return { house: entry.house, x: slots[index].x + (h >>> 8) % 81 - 40, y: slots[index].y + (h >>> 16) % 61 - 30, phase: (h % 628) / 100, tone: h % walls.length, k: slots[index].near ? NEAR_SCALE : 1, rank: rank };
    }).sort(function (a, b) { return a.y - b.y; });
  }

  function cloud(c, x, y, scale, fill, stroke) {
    c.save(); c.translate(x, y); c.scale(scale, scale);
    c.beginPath(); c.moveTo(-68, 14); c.bezierCurveTo(-95, 12, -94, -14, -68, -18);
    c.bezierCurveTo(-72, -48, -29, -57, -12, -32); c.bezierCurveTo(3, -62, 48, -48, 49, -21);
    c.bezierCurveTo(82, -31, 102, 7, 74, 19); c.bezierCurveTo(34, 31, -36, 26, -68, 14); c.closePath();
    c.fillStyle = fill; c.fill(); c.strokeStyle = stroke; c.lineWidth = 2.5 / scale; c.stroke(); c.restore();
  }
  function rounded(c, x, y, w, h, radius, fill, stroke, lineWidth) {
    var r = Math.min(radius, w / 2, h / 2);
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lineWidth || 2; c.stroke(); }
  }
  function heart(c, x, y, size, color) {
    c.beginPath(); c.moveTo(x, y + size * .46);
    c.bezierCurveTo(x - size * 1.05, y - size * .08, x - size * .45, y - size * .8, x, y - size * .32);
    c.bezierCurveTo(x + size * .45, y - size * .8, x + size * 1.05, y - size * .08, x, y + size * .46);
    c.fillStyle = color; c.fill();
  }

  function drawPerson(c, x, y, color) {
    c.beginPath(); c.arc(x, y - 17, 6, 0, TAU); c.fillStyle = color; c.fill();
    rounded(c, x - 6.5, y - 11, 13, 15, 6, color);
  }

  function drawMiniIsland(c, x, ground, isEmpty) {
    // 参照原型 drawFloatingMiniIsland：云朵托盘之上的立体泥土底座、青草坪、小树与小花。
    rounded(c, x - 86, ground - 6, 172, 22, 11, '#C79C79', '#9B6F52', 1.8);
    rounded(c, x - 92, ground - 12, 184, 16, 8, isEmpty ? '#C7E8B4' : '#ADE498', '#689B62', 1.8);
    if (!isEmpty) {
      rounded(c, x - 68, ground - 30, 8, 20, 3, '#9B6A4A', '#6B442B', 1.4);
      c.beginPath(); c.arc(x - 64, ground - 36, 14, 0, TAU); c.fillStyle = '#77C66E'; c.fill(); c.strokeStyle = '#538D4E'; c.lineWidth = 1.6; c.stroke();
      c.beginPath(); c.arc(x - 58, ground - 43, 10, 0, TAU); c.fillStyle = '#9BE28B'; c.fill();
      c.beginPath(); c.arc(x + 50, ground - 7, 3.5, 0, TAU); c.fillStyle = '#FF8AA8'; c.fill();
      c.beginPath(); c.arc(x + 60, ground - 5, 3, 0, TAU); c.fillStyle = '#FFD66B'; c.fill();
    }
  }

  function drawEmpty(c, item, env) {
    var bob = env.reducedMotion ? 0 : Math.sin(env.time * .6 + item.phase) * 6, x = item.x, y = item.y + bob, ground = y - 24;
    cloud(c, x - 118, y + 18, .9, '#FFFFFF', '#E7DCCB'); cloud(c, x + 122, y + 26, .8, '#FFFFFF', '#E7DCCB'); cloud(c, x, y, 1.65, '#FFFFFF', '#E7DCCB');
    drawMiniIsland(c, x, ground, true);
    c.save(); c.setLineDash([8, 7]); c.strokeStyle = '#D6C3B2'; c.lineWidth = 2; c.lineJoin = 'round';
    rounded(c, x - 38, ground - 52, 76, 52, 8, null, '#D6C3B2', 2);
    c.beginPath(); c.moveTo(x - 52, ground - 50); c.lineTo(x, ground - 94); c.lineTo(x + 52, ground - 50); c.stroke(); c.restore();
    c.beginPath(); c.moveTo(x - 9, ground - 26); c.lineTo(x + 9, ground - 26); c.moveTo(x, ground - 35); c.lineTo(x, ground - 17); c.strokeStyle = '#CDB9A6'; c.lineWidth = 3; c.stroke();
    drawPlate(c, item, x, y + 58, env);
  }

  function drawHouse(c, item, env) {
    if (item.house.empty) { drawEmpty(c, item, env); return; }
    var house = item.house, online = house.online, bob = env.reducedMotion ? 0 : Math.sin(env.time * .6 + item.phase) * 6;
    var x = item.x, y = item.y + bob, ground = y - 24, wall = walls[item.tone], roof = roofs[item.tone];
    cloud(c, x - 118, y + 18, .9, '#FFFFFF', '#E7DCCB'); cloud(c, x + 122, y + 26, .8, '#FFFFFF', '#E7DCCB');
    cloud(c, x, y, 1.65, '#FFFFFF', '#E7DCCB');
    drawMiniIsland(c, x, ground, false);
    rounded(c, x + 16, ground - 96, 13, 26, 3, roof, '#B98F7D', 1.6);
    rounded(c, x - 38, ground - 52, 76, 52, 8, wall, '#C9A99A', 2);
    c.beginPath(); c.moveTo(x - 52, ground - 50); c.lineTo(x, ground - 94); c.lineTo(x + 52, ground - 50); c.closePath();
    c.fillStyle = roof; c.fill(); c.strokeStyle = '#B98F7D'; c.lineWidth = 2; c.lineJoin = 'round'; c.stroke();
    rounded(c, x + 6, ground - 32, 18, 32, 8, '#F4E4D2', '#C9A99A', 1.6);
    if (online) {
      var glow = c.createRadialGradient(x - 20, ground - 31, 2, x - 20, ground - 31, 52);
      glow.addColorStop(0, 'rgba(255,226,140,.7)'); glow.addColorStop(1, 'rgba(255,226,140,0)');
      c.fillStyle = glow; c.fillRect(x - 74, ground - 83, 108, 104);
    }
    rounded(c, x - 30, ground - 40, 20, 18, 5, online ? '#FFE9A8' : '#DCE8EE', online ? '#E3B95C' : '#B8CAD3', 1.6);
    if (online) {
      for (var i = 0; i < Math.min(3, online.count); i++) {
        var step = env.reducedMotion ? 0 : Math.sin(env.time * 1.4 + item.phase + i) * 2.5;
        drawPerson(c, x + 70 + i * 20, ground + 2 + step, shadows[i % shadows.length]);
      }
      if (online.hostOnline) heart(c, x + 44, ground - 104, 11, '#E58CA3');
    }
    drawPlate(c, item, x, y + 58, env);
  }

  function drawPlate(c, item, x, y, env) {
    var house = item.house, online = house.online, scale = (env.scale || 1) * (item.k || 1), size = clamp(12 / scale, 15, 60), label;
    if (online) label = clip(online.displayNames.slice(0, 2).join('、'), 9) + (online.count > 2 ? '等' + online.count + '人' : '');
    else if (scale < .14) return;
    else label = clip(house.title, 8);
    c.save(); c.font = size + 'px "PingFang SC",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    var width = c.measureText(label).width + size * 1.3, height = size * 1.75;
    rounded(c, x - width / 2, y - height / 2, width, height, height / 2, online ? '#FFF3C9' : '#FFFEFA', online ? '#E3B95C' : '#E2D3C2', 1.6);
    c.fillStyle = '#7A6455'; c.fillText(label, x, y + size * .04); c.restore();
  }

  function draw(c, env) {
    var list = visible();
    if (!list.length) return;
    var view = env.view;
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (view && (item.x < view.left - 320 || item.x > view.right + 320 || item.y < view.top - 320 || item.y > view.bottom + 320)) continue;
      var k = item.k || 1;
      c.save(); c.translate(item.x, item.y); c.scale(k, k); c.translate(-item.x, -item.y);
      drawHouse(c, item, env); c.restore();
    }
  }

  // 点击范围随缩放放大，云缩得很小时手指也能点中；越靠前（y 越大）越优先。
  function hitAt(point, scale) {
    var list = visible();
    for (var i = list.length - 1; i >= 0; i--) {
      var k = list[i].k || 1, rx = Math.max(170 * k, 30 / (scale || 1)), ry = Math.max(130 * k, 30 / (scale || 1));
      var dx = (point.x - list[i].x) / rx, dy = (point.y - list[i].y + 30) / ry;
      if (dx * dx + dy * dy <= 1) return list[i].house;
    }
    return null;
  }

  // 有人在线的小屋窗户位置（世界坐标），夜里用来在遮罩上打出光点。
  function lights() {
    return placed.filter(function (item) { return !!item.house.online; }).map(function (item) { return { x: item.x - 20, y: item.y - 55 }; });
  }

  function bounds() {
    var list = visible();
    if (!list.length) return null;
    return list.reduce(function (box, item) {
      return { left: Math.min(box.left, item.x - 200 * (item.k || 1)), right: Math.max(box.right, item.x + 200 * (item.k || 1)), top: Math.min(box.top, item.y - 170 * (item.k || 1)), bottom: Math.max(box.bottom, item.y + 120 * (item.k || 1)) };
    }, { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity });
  }

  G.seaMap = { setHouses: setHouses, setEmpty: setEmpty, emptyCount: function () { return !placed.length && emptyOn ? empties.length : 0; }, draw: draw, hitAt: hitAt, lights: lights, bounds: bounds, count: function () { return placed.length; }, positions: function () { return placed.map(function (item) { return { id: item.house.id, x: item.x, y: item.y }; }); }, visualPositions: visualPositions, slotCount: function () { return slots.length; }, keepOut: KEEP_OUT, limit: MAX_HOUSES };
})(window.Game);
