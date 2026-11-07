/* 生活系统只读建筑投影：空间由真实墙体围合产生，绝不回写旧房间或补造固定格子。 */
(function (G) {
  'use strict';
  var cachedDocument = null, cachedJson = '', cachedView = null;
  var epsilon = 0.0000001;
  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.keys(value).forEach(function (key) { freeze(value[key]); }); Object.freeze(value);
    }
    return value;
  }
  function boundary(point, polygon) {
    return polygon.some(function (a, index) {
      var b = polygon[(index + 1) % polygon.length], cross = (b.x - a.x) * (point.z - a.z) - (b.z - a.z) * (point.x - a.x);
      return Math.abs(cross) <= epsilon && point.x >= Math.min(a.x, b.x) - epsilon && point.x <= Math.max(a.x, b.x) + epsilon && point.z >= Math.min(a.z, b.z) - epsilon && point.z <= Math.max(a.z, b.z) + epsilon;
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
  function contains(space, point) {
    return inside(point, space.polygon) && !(space.holes || []).some(function (hole) { return inside(point, hole) && !boundary(point, hole); });
  }
  function copyPoint(point) { return { x: point.x, z: point.z }; }
  function useState(state) { return state || G.state; }
  function purposes(room, legacyType) {
    var tags = Object.create(null);
    room.items.forEach(function (item) {
      var definition = G.data.furnitureById[item.defId];
      (definition && definition.tags || []).forEach(function (tag) { tags[tag] = true; });
    });
    var types = (G.data.rooms || []).filter(function (definition) {
      var required = definition.required && definition.required.length ? definition.required : definition.tags || [];
      return required.length > 0 && required.some(function (tag) { return tags[tag]; });
    }).map(function (definition) { return definition.id; });
    if (legacyType && types.indexOf(legacyType) < 0) types.unshift(legacyType);
    if (!types.length) types.push('bedroom');
    room.types = types; room.type = legacyType || types[0];
  }
  function project(state) {
    state = useState(state);
    if (!state) return freeze({ rooms: Object.create(null), list: [], entries: [], floors: [], items: [] });
    var document = state.building;
    if (!document || !window.CottageBuilding || typeof window.CottageBuilding.deriveSpaces !== 'function') throw new Error('建筑空间尚未准备好，请保留存档并重新打开游戏。');
    if (document === cachedDocument && cachedView) return cachedView;
    var json = JSON.stringify(document);
    if (cachedView && json === cachedJson) { cachedDocument = document; return cachedView; }
    var rooms = Object.create(null), list = [], mappings = document.migration && document.migration.rooms || [];
    document.floors.forEach(function (floor) {
      window.CottageBuilding.deriveSpaces(document, floor.id).forEach(function (space) {
        var legacy = space.legacyRoomId && mappings.find(function (mapping) { return mapping.id === space.legacyRoomId && mapping.floorId === floor.id; });
        var roomId = legacy && !rooms[legacy.id] ? legacy.id : space.id;
        var xs = space.polygon.map(function (point) { return point.x; }), zs = space.polygon.map(function (point) { return point.z; });
        var room = { id: roomId, spaceId: space.id, floorId: floor.id, polygon: space.polygon.map(copyPoint), holes: (space.holes || []).map(function (hole) { return hole.map(copyPoint); }), area: space.area,
          bounds: { minX: Math.min.apply(null, xs), maxX: Math.max.apply(null, xs), minZ: Math.min.apply(null, zs), maxZ: Math.max.apply(null, zs) }, items: [], type: '', types: [] };
        if (legacy) room.legacyRoomId = legacy.id;
        var facilityType = state.observatory && state.observatory.built && (floor.id === 'observatory_floor' || floor.id === 'legacy_attic') ? 'observatory' : '';
        Object.defineProperty(room, '_legacyType', { value: legacy && legacy.type || facilityType, enumerable: false });
        rooms[roomId] = room; list.push(room);
      });
    });
    var items = document.furniture.map(function (entity) {
      var item = { uid: entity.id, defId: entity.defId, floorId: entity.floorId, color: entity.color || null,
        position: { x: entity.position.x, y: entity.position.y, z: entity.position.z }, rotation: entity.rotation,
        dimensions: { width: entity.dimensions.width, height: entity.dimensions.height, depth: entity.dimensions.depth } };
      if (entity.artId) item.artId = entity.artId;
      var candidates = list.filter(function (room) { return room.floorId === entity.floorId && contains(room, entity.position); });
      candidates.sort(function (a, b) {
        var preferred = Number(b.id === entity.legacyRoomId) - Number(a.id === entity.legacyRoomId);
        return preferred || a.area - b.area || a.id.localeCompare(b.id);
      });
      var room = candidates[0];
      if (room) {
        var definition = G.data.furnitureById[entity.defId] || {}, width = Math.max(epsilon, room.bounds.maxX - room.bounds.minX), depth = Math.max(epsilon, room.bounds.maxZ - room.bounds.minZ);
        // x/depth是居民旧版内存动画的局部投影；真实空间和位置始终保留为米制坐标。
        item.x = (entity.position.x - room.bounds.minX) / width * G.data.balance.roomWidth - (definition.w || 0) / 2;
        item.depth = Math.max(0, Math.min(1, (entity.position.z - room.bounds.minZ) / depth));
        room.items.push(item);
      }
      return item;
    });
    list.forEach(function (room) { purposes(room, room._legacyType); });
    var view = { rooms: rooms, list: list, entries: list.map(function (room) { return [room.id, room]; }),
      floors: document.floors.map(function (floor) { return { id: floor.id, name: floor.name, elevation: floor.elevation }; }), items: items };
    cachedDocument = document; cachedJson = json; cachedView = freeze(view); return cachedView;
  }
  function room(state, id) { return project(state).rooms[id] || null; }
  G.contentSpaces = {
    project: project,
    rooms: function (state) { return project(state).rooms; },
    list: function (state) { return project(state).list; },
    entries: function (state) { return project(state).entries; },
    floors: function (state) { return project(state).floors; },
    items: function (state) { return project(state).items; },
    room: room,
    get: function (id, state) { return room(state, id); },
    isType: function (value, type) { return !!value && (value.type === type || (value.types || []).indexOf(type) >= 0); }
  };
})(window.Game);
