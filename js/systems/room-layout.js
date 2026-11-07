/* 房间身份保持不变，只交换楼层格引用；家具和住户随房间一起换位置。 */
(function (G) {
  'use strict';
  const B = G.data.balance;
  let swapping = false;
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
  const fail = message => ({ ok: false, message });
  function positionIn(state, roomId) {
    if (!validId(roomId) || !own(state.house.rooms, roomId)) return null;
    let found = null, count = 0;
    state.house.floors.forEach((floor, floorIdx) => floor.slots.forEach((id, slotIdx) => {
      if (id === roomId) { found = { floorIdx, slotIdx }; count++; }
    }));
    return count === 1 ? found : null;
  }
  function roomPosition(roomId) { return positionIn(G.state, roomId); }
  function layoutSlots() {
    const cap = G.sys.building.capacity(), slots = [];
    for (let floorIdx = 0; floorIdx < cap.floors; floorIdx++) for (let slotIdx = 0; slotIdx < cap.slots; slotIdx++) {
      slots.push({ floorIdx, slotIdx, roomId: G.state.house.floors[floorIdx]?.slots[slotIdx] || null, locked: false });
    }
    return slots;
  }
  function openPosition(position, cap) {
    return position && Number.isInteger(position.floorIdx) && Number.isInteger(position.slotIdx) && position.floorIdx >= 0 && position.slotIdx >= 0 && position.floorIdx < cap.floors && position.slotIdx < cap.slots;
  }
  function name(state, id) {
    const room = state.house.rooms[id], definition = room && G.data.rooms.find(value => value.id === room.type);
    return definition ? definition.name : '房间';
  }
  function location(position) { return (position.floorIdx + 1) + '楼第' + (position.slotIdx + 1) + '格'; }
  function swapRooms(roomId, targetFloorIdx, targetSlotIdx, expectedTargetId) {
    if (swapping) return fail('房间正在换位置，稍等一下吧。');
    const cap = G.sys.building.capacity(), from = positionIn(G.state, roomId), to = { floorIdx: targetFloorIdx, slotIdx: targetSlotIdx };
    if (!from) return fail('先选择一间已经建好的普通房间吧。');
    if (!openPosition(from, cap) || !openPosition(to, cap)) return fail('这块位置还没开放，先选小屋里已经开放的格子吧。');
    const target = G.state.house.floors[targetFloorIdx]?.slots[targetSlotIdx] || null;
    if (target !== null && (!validId(target) || !own(G.state.house.rooms, target) || !positionIn(G.state, target))) return fail('这间房的位置刚刚变了，请重新选择。');
    if (expectedTargetId !== undefined && expectedTargetId !== target) return fail('目标位置刚刚有了变化，请重新选择要互换的房间。');
    if (from.floorIdx === to.floorIdx && from.slotIdx === to.slotIdx) return { ok: true, unchanged: true, roomId, otherRoomId: target, from, to, message: '这间房就在这里，可以再选一个位置。' };
    const at = Date.now(); swapping = true;
    try {
      G.store.update(state => {
        const currentFrom = positionIn(state, roomId), currentTarget = state.house.floors[targetFloorIdx]?.slots[targetSlotIdx] || null;
        if (!currentFrom || currentFrom.floorIdx !== from.floorIdx || currentFrom.slotIdx !== from.slotIdx || currentTarget !== target) throw new Error('房间位置发生变化');
        while (state.house.floors.length <= targetFloorIdx) state.house.floors.push({ slots: [null, null, null] });
        state.house.floors[from.floorIdx].slots[from.slotIdx] = target;
        state.house.floors[targetFloorIdx].slots[targetSlotIdx] = roomId;
        const text = target ? name(state, roomId) + '从' + location(from) + '和' + location(to) + '的' + name(state, target) + '互换位置，家具和朋友一起搬好啦。' : '把' + name(state, roomId) + '从' + location(from) + '搬到' + location(to) + '，家具和朋友一起搬好啦。';
        state.memories.push({ at, text });
        if (state.memories.length > B.maxMemories) state.memories.splice(0, state.memories.length - B.maxMemories);
      }, { persist: true });
      if (G.sys.decorating.clearUndo) G.sys.decorating.clearUndo();
      G.runtime.activeRoomId = roomId; G.runtime.selected = null; G.runtime.placing = null;
      const event = { roomId, otherRoomId: target, from: { floorIdx: from.floorIdx, slotIdx: from.slotIdx }, to: { floorIdx: to.floorIdx, slotIdx: to.slotIdx } };
      G.bus.emit('room:swapped', event);
      return Object.assign({ ok: true, message: target ? '房间互换好啦，家具和朋友也一起搬好了！' : '房间搬好啦，家具和朋友也一起到了新位置！' }, event);
    } catch (_) {
      return fail('这次位置还没有保存，房间和家具都保持原样。请先下载JSON备份，再试一次吧。');
    } finally { swapping = false; }
  }
  Object.assign(G.sys.building, { swapRooms, roomPosition, layoutSlots });
})(window.Game);
