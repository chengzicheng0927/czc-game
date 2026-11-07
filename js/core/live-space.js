/* 实时位置的纯只读映射：保持zone/x/y协议，楼层坐标以真实墙体范围归一。 */
(function (G) {
  'use strict';
  var epsilon = 0.0000001;
  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function clamp(value) { return Math.max(0, Math.min(1, value)); }
  function floors(state) { return state && state.building && Array.isArray(state.building.floors) ? state.building.floors : []; }
  function groundFloor(state) {
    return floors(state).filter(function (floor) { return floor.id !== 'legacy_yard'; }).slice().sort(function (a, b) { return a.elevation - b.elevation || a.id.localeCompare(b.id); })[0] || floors(state)[0] || null;
  }
  function spaces(state) { return G.contentSpaces && typeof G.contentSpaces.list === 'function' ? G.contentSpaces.list(state) : []; }
  function boundary(point, polygon) {
    return polygon.some(function (a, index) {
      var b = polygon[(index + 1) % polygon.length], dx = b.x - a.x, dz = b.z - a.z;
      return Math.abs(dx * (point.z - a.z) - dz * (point.x - a.x)) <= epsilon && point.x >= Math.min(a.x, b.x) - epsilon && point.x <= Math.max(a.x, b.x) + epsilon && point.z >= Math.min(a.z, b.z) - epsilon && point.z <= Math.max(a.z, b.z) + epsilon;
    });
  }
  function inside(point, polygon) {
    if (boundary(point, polygon)) return true;
    var result = false;
    for (var index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
      var a = polygon[index], b = polygon[previous];
      if ((a.z > point.z) !== (b.z > point.z) && point.x < (b.x - a.x) * (point.z - a.z) / (b.z - a.z) + a.x) result = !result;
    }
    return result;
  }
  function contains(room, point) {
    return inside(point, room.polygon) && !(room.holes || []).some(function (hole) { return inside(point, hole) && !boundary(point, hole); });
  }
  function bounds(state, floorId, margin) {
    var points = (state.building.walls || []).filter(function (wall) { return !floorId || wall.floorId === floorId; }).flatMap(function (wall) { return [wall.start, wall.end]; });
    var xs = points.map(function (point) { return point.x; }), zs = points.map(function (point) { return point.z; });
    var result = { minX: points.length ? Math.min.apply(null, xs) : -5, maxX: points.length ? Math.max.apply(null, xs) : 5, minZ: points.length ? Math.min.apply(null, zs) : -5, maxZ: points.length ? Math.max.apply(null, zs) : 5 };
    if (result.maxX - result.minX < epsilon) { result.minX -= .5; result.maxX += .5; }
    if (result.maxZ - result.minZ < epsilon) { result.minZ -= .5; result.maxZ += .5; }
    result.minX -= margin; result.maxX += margin; result.minZ -= margin; result.maxZ += margin;
    return result;
  }
  function normalized(point, extent) { return { x: clamp((point.x - extent.minX) / (extent.maxX - extent.minX)), y: clamp((point.z - extent.minZ) / (extent.maxZ - extent.minZ)) }; }
  function world(peer, extent) { return { x: extent.minX + peer.x * (extent.maxX - extent.minX), z: extent.minZ + peer.y * (extent.maxZ - extent.minZ) }; }
  function within(point, extent) { return point.x >= extent.minX - epsilon && point.x <= extent.maxX + epsilon && point.z >= extent.minZ - epsilon && point.z <= extent.maxZ + epsilon; }
  function closest(point, rooms) {
    var nearest = null, distance = Infinity;
    rooms.forEach(function (room) {
      [room.polygon].concat(room.holes || []).forEach(function (polygon) {
        polygon.forEach(function (a, index) {
          var b = polygon[(index + 1) % polygon.length], dx = b.x - a.x, dz = b.z - a.z, length = dx * dx + dz * dz;
          var t = length > epsilon ? clamp(((point.x - a.x) * dx + (point.z - a.z) * dz) / length) : 0;
          var candidate = { x: a.x + t * dx, z: a.z + t * dz }, squared = Math.pow(candidate.x - point.x, 2) + Math.pow(candidate.z - point.z, 2);
          if (squared < distance && rooms.some(function (value) { return contains(value, candidate); })) { distance = squared; nearest = candidate; }
        });
      });
    });
    return nearest;
  }
  function destination(state, point, floorId) {
    if (!state || !state.building || !point || !finite(point.x) || !finite(point.z)) return null;
    var available = floors(state), floor = available.find(function (value) { return value.id === floorId; }) || groundFloor(state);
    if (!floor) return null;
    var candidates = spaces(state).filter(function (room) { return room.floorId === floor.id && contains(room, point); });
    if (candidates.length) return Object.assign({ zone: floor.id }, normalized(point, bounds(state, floor.id, 0)));
    var yard = bounds(state, null, 3);
    return within(point, yard) ? Object.assign({ zone: 'yard' }, normalized(point, yard)) : null;
  }
  function position(state, peer) {
    if (!state || !state.building || !peer || typeof peer.zone !== 'string' || !finite(peer.x) || !finite(peer.y) || peer.x < 0 || peer.x > 1 || peer.y < 0 || peer.y > 1) return null;
    var floor = peer.zone === 'yard' ? groundFloor(state) : floors(state).find(function (value) { return value.id === peer.zone; });
    // 只用于读取旧会话的房间ID；新发送始终使用稳定的真实楼层ID。
    var legacy = null;
    if (!floor && G.contentSpaces) {
      legacy = G.contentSpaces.get(peer.zone, state) || spaces(state).find(function (room) { return room.spaceId === peer.zone || room.legacyRoomId === peer.zone; });
      if (legacy) floor = floors(state).find(function (value) { return value.id === legacy.floorId; });
    }
    if (!floor) return null;
    var point = world(peer, bounds(state, peer.zone === 'yard' ? null : floor.id, peer.zone === 'yard' ? 3 : 0));
    if (peer.zone !== 'yard') {
      var rooms = legacy ? [legacy] : spaces(state).filter(function (room) { return room.floorId === floor.id; });
      if (!rooms.some(function (room) { return contains(room, point); })) point = closest(point, rooms);
      if (!point) return null;
    }
    return { x: point.x, y: floor.elevation, z: point.z, floorId: floor.id };
  }
  G.liveSpace = { destination: destination, position: position };
})(window.Game);
