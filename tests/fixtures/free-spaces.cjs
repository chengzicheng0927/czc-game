'use strict';

// 内容/DOM回归共用真实schema2命令夹具；不向Game.sys补回旧建房或装饰API。
const assert = require('node:assert/strict');
const apis = new WeakMap();
function register(G, api) { assert.ok(api && api.executeCommand); apis.set(G, api); }
function apiFor(G) { const api = apis.get(G); assert.ok(api, '夹具必须注册真实建筑schema模块'); return api; }
function addFloor(G, index) {
  const api = apiFor(G);
  G.store.update(state => {
    while (state.building.floors.length <= index) {
      const floor = { id: G.utils.uid('content_floor'), name: (state.building.floors.length + 1) + '楼', elevation: Math.max(...state.building.floors.map(value => value.elevation), -3) + 3 };
      state.building = api.executeCommand(state.building, { type: 'floor.add', floor }, G.data.furnitureById);
    }
  }, { persist: true });
  return G.state.building.floors[index].id;
}
function placeItem(G, defId, roomId, x = 40, y = 90, parentId) {
  const api = apiFor(G), definition = G.data.furnitureById[defId], room = G.contentSpaces.get(roomId);
  assert.ok(definition && room, '内容夹具需要实际存在的家具与围合空间');
  if (!(G.state.inventory[defId] > 0)) { const bought = G.sys.economy.buy(defId); assert.ok(bought.ok, defId + ': ' + bought.message); }
  const width = room.bounds.maxX - room.bounds.minX, depth = room.bounds.maxZ - room.bounds.minZ;
  const ratio = Math.max(.05, Math.min(.95, (x + definition.w / 2) / G.data.balance.roomWidth));
  const parent = parentId && G.state.building.furniture.find(item => item.id === parentId);
  const height = parent ? parent.position.y + parent.dimensions.height : definition.place === 'wall' ? 1.25 : definition.place === 'ceiling' ? 2.35 : 0;
  const uid = G.utils.uid('content_item');
  const entity = { id: uid, defId, floorId: room.floorId, position: { x: room.bounds.minX + width * ratio, y: height, z: room.bounds.minZ + depth * .65 }, rotation: 0, dimensions: api.furnitureDimensions(definition) };
  G.store.update(state => { assert.ok(state.inventory[defId] > 0); state.inventory[defId]--; state.building = api.executeCommand(state.building, { type: 'furniture.add', furniture: entity }, G.data.furnitureById); }, { persist: true });
  return { ok: true, uid, roomId };
}
function buildSpace(G, floorIndex, column, type = 'bedroom') {
  const api = apiFor(G), floorId = addFloor(G, floorIndex), origin = column * 6;
  const corners = [{ x: origin, z: 0 }, { x: origin + 4, z: 0 }, { x: origin + 4, z: 3 }, { x: origin, z: 3 }];
  G.store.update(state => {
    corners.forEach((start, index) => {
      state.building = api.executeCommand(state.building, { type: 'wall.add', wall: { id: G.utils.uid('content_wall'), floorId, start, end: corners[(index + 1) % 4], height: 2.8, thickness: .16, color: '#F4DDE7' } }, G.data.furnitureById);
    });
  }, { persist: true });
  const room = G.contentSpaces.list().find(value => value.floorId === floorId && Math.abs(value.bounds.minX - origin) < .000001 && Math.abs(value.bounds.maxX - origin - 4) < .000001);
  assert.ok(room, '实际四墙必须围成可读取的空间');
  if (type !== 'bedroom') {
    const definition = G.data.rooms.find(value => value.id === type), tag = definition && definition.required && definition.required[0];
    const furniture = tag && G.data.furniture.find(value => !value.rewardOnly && !value.festivalId && value.tags.includes(tag) && value.unlockLv <= G.state.level);
    assert.ok(furniture, '夹具需通过真实家具识别空间用途：' + type); placeItem(G, furniture.id, room.id);
    assert.ok(G.contentSpaces.isType(G.contentSpaces.get(room.id), type));
  }
  return { ok: true, roomId: room.id };
}
function removeSpace(G, roomId) {
  const api = apiFor(G), room = G.contentSpaces.get(roomId); assert.ok(room);
  const walls = G.state.building.walls.filter(wall => wall.floorId === room.floorId && [wall.start, wall.end].every(point => point.x >= room.bounds.minX - .000001 && point.x <= room.bounds.maxX + .000001 && point.z >= room.bounds.minZ - .000001 && point.z <= room.bounds.maxZ + .000001));
  G.store.update(state => {
    for (const item of room.items) {
      state.building = api.executeCommand(state.building, { type: 'entity.remove', id: item.uid }, G.data.furnitureById);
      if (!G.data.furnitureById[item.defId].customArt) state.inventory[item.defId] = (state.inventory[item.defId] || 0) + 1;
    }
    for (const wall of walls) state.building = api.executeCommand(state.building, { type: 'entity.remove', id: wall.id }, G.data.furnitureById);
  }, { persist: true });
  assert.equal(G.contentSpaces.get(roomId), null);
  return { ok: true };
}
module.exports = { register, buildSpace, placeItem, removeSpace, addFloor };
