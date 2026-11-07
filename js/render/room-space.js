/* 房间局部坐标的2.5D投影；家具/人物仍使用原有手绘billboard。 */
(function (G) {
  'use strict';
  const geometry = Object.freeze({ width: 320, height: 220, centerX: 160, backY: 142, depthHeight: 68, floorLine: 200, backScale: .76, scaleRange: .24, defaultDepth: .75 });
  const finite = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const depthValue = value => clamp(finite(value, geometry.defaultDepth), 0, 1);
  const definition = (item, def) => def || G.data && G.data.furnitureById && G.data.furnitureById[item.defId] || { w: 1, h: 1, place: 'wall' };
  const dimensions = def => ({ w: Math.max(1, finite(def.w, 1)), h: Math.max(1, finite(def.h, 1)) });
  const items = room => room && (room.items || room.data && room.data.items) || [];
  function foot(canonicalX, depth) {
    const d = depthValue(depth), scale = geometry.backScale + geometry.scaleRange * d;
    return { x: geometry.centerX + (finite(canonicalX, geometry.centerX) - geometry.centerX) * scale, y: geometry.backY + geometry.depthHeight * d, scale, depth: d };
  }
  function projected(room, source, def, visited) {
    const item = source || {}, d = definition(item, def), size = dimensions(d), x = finite(item.x, 0), y = finite(item.y, 0);
    if (d.place === 'table' && item.parent && !visited.has(item.parent)) {
      const parent = items(room).find(other => other.uid === item.parent);
      if (parent) {
        visited.add(item.parent); const target = projected(room, parent, null, visited), scale = target.scale;
        const left = target.x + (x - finite(parent.x, 0)) * scale, top = target.y + (y - finite(parent.y, 0)) * scale;
        return { x: left, y: top, w: size.w * scale, h: size.h * scale, scale, depth: target.depth, footX: left + size.w * scale / 2, footY: top + size.h * scale };
      }
    }
    if (d.place === 'floor') {
      const anchor = foot(x + size.w / 2, item.depth);
      return { x: anchor.x - size.w * anchor.scale / 2, y: anchor.y - size.h * anchor.scale, w: size.w * anchor.scale, h: size.h * anchor.scale, scale: anchor.scale, depth: anchor.depth, footX: anchor.x, footY: anchor.y };
    }
    // 壁挂、吊顶与没有承托面的桌面小物保持旧坐标，不伪造独立depth。
    return { x, y, w: size.w, h: size.h, scale: 1, depth: 0, footX: x + size.w / 2, footY: y + size.h };
  }
  function item(room, source, def) { const visited = new Set(); if (source && source.uid) visited.add(source.uid); return projected(room, source, def, visited); }
  function grabValue(grab) { return { u: clamp(finite(grab && grab.u, .5), 0, 1), v: clamp(finite(grab && grab.v, 1), 0, 1) }; }
  function placement(def, point, grab) {
    const size = dimensions(def), held = grabValue(grab), px = finite(point && point.x, geometry.centerX), py = finite(point && point.y, geometry.backY + geometry.depthHeight * geometry.defaultDepth);
    if (def.place === 'floor') {
      // 直接以归一化抓点反解，改变深度时缩放也不会让拖动点跳离鼠标。
      const aboveFoot = size.h * (1 - held.v), denominator = geometry.depthHeight - aboveFoot * geometry.scaleRange;
      const depth = Math.abs(denominator) < .00001 ? depthValue(grab && grab.depth) : depthValue((py - geometry.backY + aboveFoot * geometry.backScale) / denominator);
      const scale = geometry.backScale + geometry.scaleRange * depth;
      return { x: clamp(geometry.centerX + (px - geometry.centerX) / scale - size.w * held.u, 0, Math.max(0, geometry.width - size.w)), y: geometry.floorLine - size.h, depth };
    }
    let y = py - size.h * held.v;
    if (def.place === 'ceiling') y = finite(G.data && G.data.balance && G.data.balance.ceilingLine, 14);
    else if (def.place === 'wall') y = clamp(y, 14, Math.max(14, 160 - size.h));
    return { x: clamp(px - size.w * held.u, 0, Math.max(0, geometry.width - size.w)), y };
  }
  function tablePlacement(room, parent, def, point, grab) {
    if (!parent) return placement(def, point, grab);
    const target = item(room, parent), size = dimensions(def), held = grabValue(grab), x = finite(point && point.x, target.footX), y = finite(point && point.y, target.footY);
    return { x: clamp(finite(parent.x, 0) + (x - target.x) / target.scale - size.w * held.u, 0, Math.max(0, geometry.width - size.w)), y: finite(parent.y, 0) + (y - target.y) / target.scale - size.h * held.v };
  }
  function contains(target, point, padding) {
    if (!target || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
    const extra = Math.max(0, finite(padding, 0));
    return point.x >= target.x - extra && point.x <= target.x + target.w + extra && point.y >= target.y - extra && point.y <= target.y + target.h + extra;
  }
  function grab(target, point) { return { u: clamp((point.x - target.x) / target.w, 0, 1), v: clamp((point.y - target.y) / target.h, 0, 1) }; }
  G.roomSpace = { geometry, item, placement, tablePlacement, contains, grab, foot, pointToDepth: y => depthValue((finite(y, geometry.backY) - geometry.backY) / geometry.depthHeight) };
})(window.Game);
