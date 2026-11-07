/* 预览不写盘，确认时校验来源快照；只改楼层引用，房间内容始终原样保留。 */
(function (G) {
  'use strict';
  const B = G.data.balance;
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const fail = message => ({ ok: false, message });
  let applying = false;
  function definition(id) {
    return typeof id === 'string' && (G.data.layoutTemplates || []).find(value => value.id === id);
  }
  function list() { return (G.data.layoutTemplates || []).map(value => Object.assign({}, value)); }
  function snapshot(state, cap, templateId) {
    return JSON.stringify({ templateId, capacity: cap, floors: state.house.floors.map(floor => floor.slots), rooms: Object.keys(state.house.rooms).sort().map(id => [id, state.house.rooms[id].type]) });
  }
  function order(cap, pattern) {
    const slots = [];
    let columns = Array.from({ length: cap.slots }, (_, index) => index);
    if (pattern === 'mirror') columns.reverse();
    if (pattern === 'steps') columns.sort((a, b) => Math.abs(a - (cap.slots - 1) / 2) - Math.abs(b - (cap.slots - 1) / 2) || a - b);
    if (pattern === 'columns' || pattern === 'steps') columns.forEach(slotIdx => {
      for (let floorIdx = 0; floorIdx < cap.floors; floorIdx++) slots.push({ floorIdx, slotIdx });
    });
    else for (let floorIdx = 0; floorIdx < cap.floors; floorIdx++) columns.forEach(slotIdx => slots.push({ floorIdx, slotIdx }));
    return slots;
  }
  function prepare(state, id, cap) {
    const def = definition(id);
    if (!def) return fail('先选择一份小屋布局吧。');
    const ids = Object.keys(state.house.rooms).sort(), positions = Object.create(null);
    let invalid = false;
    state.house.floors.forEach((floor, floorIdx) => floor.slots.forEach((roomId, slotIdx) => {
      if (roomId === null) return;
      if (!own(state.house.rooms, roomId) || own(positions, roomId) || floorIdx >= cap.floors || slotIdx >= cap.slots) invalid = true;
      positions[roomId] = { floorIdx, slotIdx };
    }));
    if (invalid || ids.length > cap.floors * cap.slots || ids.some(roomId => !own(positions, roomId))) return fail('房间位置发生了变化，请重新打开布局册。');
    if (!ids.length) return fail('先建一间房，再来试试小屋布局吧。');
    const floors = Array.from({ length: Math.max(state.house.floors.length, cap.floors) }, () => ({ slots: [null, null, null] }));
    const slots = order(cap, def.pattern), moves = [];
    ids.forEach((roomId, index) => {
      const from = positions[roomId], to = slots[index]; floors[to.floorIdx].slots[to.slotIdx] = roomId;
      if (from.floorIdx !== to.floorIdx || from.slotIdx !== to.slotIdx) moves.push({ roomId, from: Object.assign({}, from), to: Object.assign({}, to) });
    });
    return { ok: true, templateId: id, name: def.name, signature: snapshot(state, cap, id), before: state.house.floors.map(floor => ({ slots: floor.slots.slice() })), floors, moves, roomCount: ids.length, unchanged: moves.length === 0, capacity: Object.assign({}, cap), message: moves.length ? '这份布局会搬动 ' + moves.length + ' 间房，家具和朋友一起搬。' : '现在已经是这份布局啦。' };
  }
  function preview(id) { return prepare(G.state, id, G.sys.building.capacity()); }
  function apply(id, expectedSignature) {
    if (applying) return fail('房间正在搬家，稍等一下吧。');
    if (typeof expectedSignature !== 'string' || !expectedSignature) return fail('先预览布局，再确认搬家吧。');
    const cap = G.sys.building.capacity(), plan = prepare(G.state, id, cap);
    if (!plan.ok) return plan;
    if (plan.signature !== expectedSignature) return fail('小屋刚刚有了变化，请重新预览后再确认。');
    if (plan.unchanged) return { ok: true, unchanged: true, templateId: id, moves: [], message: plan.message };
    applying = true;
    try {
      G.store.update(state => {
        if (snapshot(state, G.sys.building.capacity(), id) !== expectedSignature) throw new Error('小屋位置变化');
        state.house.floors = plan.floors.map(floor => ({ slots: floor.slots.slice() }));
        state.memories.push({ at: Date.now(), text: '选择了「' + plan.name + '」布局，' + plan.moves.length + '间房带着家具和朋友一起搬好了。' });
        if (state.memories.length > B.maxMemories) state.memories.splice(0, state.memories.length - B.maxMemories);
      }, { persist: true });
      if (G.sys.decorating.clearUndo) G.sys.decorating.clearUndo();
      G.runtime.selected = null; G.runtime.placing = null;
      const event = { templateId: id, moves: plan.moves, roomCount: plan.roomCount };
      G.bus.emit('house:layout-applied', event);
      return Object.assign({ ok: true, message: plan.name + '搬好啦，原来的家具和朋友都在。' }, event);
    } catch (_) {
      return fail('这份布局还没有保存，房间保持原样。请先下载JSON备份，再试一次吧。');
    } finally { applying = false; }
  }
  G.sys.layoutTemplates = { list, preview, apply };
})(window.Game);
