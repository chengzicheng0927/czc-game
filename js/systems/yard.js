/* 前院坐标为世界绝对坐标，所有库存、糖果和摆放记录在同一事务内更改。 */
(function (G) {
  'use strict';
  const D = G.data, C = D.yardConfig, B = D.balance;
  const ok = (message, extra) => Object.assign({ ok: true, message: message || '' }, extra || {});
  const fail = message => ({ ok: false, message });
  const valid = value => typeof value === 'number' && Number.isFinite(value);
  const definition = id => D.furnitureById[id] && D.furnitureById[id].place === 'yard' ? D.furnitureById[id] : null;
  const get = uid => G.state.house.yard.items.find(item => item.uid === uid);
  function total() { return G.store.decorRooms(G.state).reduce((count, [, room]) => count + room.items.length, G.state.house.yard.items.length); }
  function position(def, x, y) {
    const b = C.bounds; if (!def || !valid(x) || !valid(y)) return null;
    if (def.stroke) { x = Math.round((x - b.left) / def.gridX) * def.gridX + b.left; y = Math.round((y - b.top) / def.gridY) * def.gridY + b.top; }
    return { x: Math.max(b.left, Math.min(b.right - def.w, x)), y: Math.max(b.top, Math.min(b.bottom - def.h, y)) };
  }
  function cell(def, p) { return def.id + ':' + p.x.toFixed(3) + ':' + p.y.toFixed(3); }
  function duplicate(def, p, excluded) { return def.stroke && G.state.house.yard.items.some(item => item.uid !== excluded && item.defId === def.id && cell(def, item) === cell(def, p)); }
  function canPlace(def, p) { if (G.state.level < C.unlockLv) return fail('Lv.' + C.unlockLv + ' 开放庭院装饰，先让小屋再长大一点吧。'); if (!def) return fail('先选一件庭院里的小宝贝吧。'); if (!p) return fail('点一下前院里想布置的位置吧。'); if (G.state.house.yard.items.length >= C.maxItems || total() >= B.maxItems) return fail('前院已经很热闹啦，先收起一件再继续吧。'); if (duplicate(def, p)) return fail('这一格已经铺好啦，试试旁边的位置。'); return ok(); }
  function memory(state, text) { state.memories.push({ at: Date.now(), text }); if (state.memories.length > B.maxMemories) state.memories.splice(0, state.memories.length - B.maxMemories); }
  function item(def, p, z) { return { uid: G.utils.uid('yard'), defId: def.id, x: p.x, y: p.y, flip: false, color: null, z }; }
  function nextLayer() { return Math.min(10000, G.state.house.yard.items.reduce((z, entry) => Math.max(z, entry.z), 0) + 1); }
  function statistics(state, name, amount) { state.quests.stats[name] = (state.quests.stats[name] || 0) + amount; state.quests.daily.list.forEach(entry => { const def = D.dailyQuests.find(quest => quest.id === entry.id); if (def && def.metric === name) { entry.progress += amount; entry.done = entry.progress >= def.target; } }); }
  function publish(name, payload) { G.bus.emit(name, payload); }
  function strokePoints(def, points) {
    const result = [], seen = new Set();
    function add(x, y) { const p = position(def, x, y), key = cell(def, p); if (!seen.has(key)) { seen.add(key); result.push(p); } }
    points.forEach((p, i) => { if (!i) { add(p.x, p.y); return; } const prior = points[i - 1], distance = Math.max(Math.abs(p.x - prior.x) / def.gridX, Math.abs(p.y - prior.y) / def.gridY), steps = Math.min(300, Math.max(1, Math.ceil(distance * 2))); for (let step = 1; step <= steps; step++) add(prior.x + (p.x - prior.x) * step / steps, prior.y + (p.y - prior.y) * step / steps); });
    return result;
  }
  G.sys.yard = {
    get, position,
    bounds() { return Object.assign({}, C.bounds); },
    place(id, x, y) {
      const def = definition(id), p = position(def, x, y), allowed = canPlace(def, p); if (!allowed.ok) return allowed;
      if (!(G.state.inventory[id] > 0)) return fail('背包里还没有' + def.name + '，去庭院小铺看看吧。');
      const entry = item(def, p, def.motif === 'path' ? -100 : nextLayer());
      G.store.update(state => { state.inventory[id]--; state.house.yard.items.push(entry); statistics(state, 'itemsPlaced', 1); memory(state, '把' + def.name + '放在前院，给云上的家多添了一份温柔。'); });
      publish('yard:placed', { uid: entry.uid, defId: id, x: p.x, y: p.y }); return ok(def.name + '摆好啦！', { uid: entry.uid, x: p.x, y: p.y });
    },
    move(uid, x, y) {
      const entry = get(uid); if (!entry) return fail('这件前院宝贝已经收好啦。'); const def = definition(entry.defId), p = position(def, x, y); if (!p) return fail('把宝贝放在前院里喜欢的位置吧。'); if (duplicate(def, p, uid)) return fail('这一格已经铺好啦，试试旁边的位置。');
      G.store.update(state => { const selected = state.house.yard.items.find(value => value.uid === uid); selected.x = p.x; selected.y = p.y; }); publish('yard:moved', { uid, x: p.x, y: p.y }); return ok('换个位置，也很可爱。', p);
    },
    remove(uid) {
      const entry = get(uid); if (!entry) return fail('已经放回背包啦。'); if ((G.state.inventory[entry.defId] || 0) >= 9999) return fail('背包里的同款宝贝太多啦，先用掉一些再收起。');
      G.store.update(state => { state.house.yard.items = state.house.yard.items.filter(value => value.uid !== uid); state.inventory[entry.defId] = (state.inventory[entry.defId] || 0) + 1; }); if (G.runtime.selected && G.runtime.selected.uid === uid) G.runtime.selected = null; publish('yard:removed', { uid }); return ok('好好收进庭院背包啦。');
    },
    flip(uid) { if (!get(uid)) return fail('先选一件前院宝贝吧。'); G.store.update(state => { const selected = state.house.yard.items.find(value => value.uid === uid); selected.flip = !selected.flip; }); publish('yard:changed', { uid }); return ok('转过来啦。'); },
    recolor(uid, color) { const selected = get(uid); if (!selected) return fail('先选一件前院宝贝吧。'); if (!G.data.furnitureById[selected.defId].recolor) return fail('这件宝贝保留自己的颜色，可以换个位置或转过来。'); if (color !== null && (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color))) return fail('挑一种喜欢的颜色吧。'); G.store.update(state => { state.house.yard.items.find(value => value.uid === uid).color = color; }); publish('yard:changed', { uid }); return ok('换上喜欢的颜色啦。'); },
    layer(uid, delta) { if (!get(uid) || !valid(delta)) return fail('先选一件前院宝贝和方向吧。'); const sorted = G.state.house.yard.items.slice().sort((a, b) => a.z - b.z), index = sorted.findIndex(value => value.uid === uid), target = index + Math.sign(delta); if (target < 0 || target >= sorted.length || target === index) return ok('已经在这一侧最外面啦。'); [sorted[index], sorted[target]] = [sorted[target], sorted[index]]; const order = new Map(sorted.map((value, i) => [value.uid, i])); G.store.update(state => state.house.yard.items.forEach(value => { value.z = order.get(value.uid); })); publish('yard:changed', { uid }); return ok('前后层次调好啦。'); },
    placeStroke(id, points, options) {
      const def = definition(id); if (!def || !def.stroke) return fail('小栅栏和云朵小路可以连续铺设哦。'); if (G.state.level < C.unlockLv) return fail('Lv.' + C.unlockLv + ' 就能布置前院啦。');
      if (!Array.isArray(points) || !points.length || points.length > 500 || points.some(p => !p || !valid(p.x) || !valid(p.y))) return fail('在前院里慢慢画一条小路吧。');
      const candidates = strokePoints(def, points).filter(p => !duplicate(def, p)), available = Math.min(C.maxItems - G.state.house.yard.items.length, B.maxItems - total()), inventory = G.state.inventory[id] || 0, buyMissing = !!(options && options.buyMissing), budget = buyMissing ? Math.floor(G.state.wallet.coin / def.price) : 0;
      const count = Math.max(0, Math.min(candidates.length, available, inventory + budget)); if (!count) return fail(candidates.length ? '库存或糖果不够啦，先去庭院小铺补充一点吧。' : '这些位置都已经铺好啦。');
      const bought = Math.max(0, count - inventory), coinsSpent = bought * def.price, z = nextLayer(), placed = candidates.slice(0, count).map((p, i) => item(def, p, def.motif === 'path' ? -100 : Math.min(10000, z + i)));
      G.store.update(state => { state.inventory[id] = Math.max(0, inventory - count); state.wallet.coin -= coinsSpent; Array.prototype.push.apply(state.house.yard.items, placed); if (bought) { state.collection[id] = true; statistics(state, 'bought', bought); } statistics(state, 'itemsPlaced', count); memory(state, '在前院铺好 ' + count + ' 段' + def.name + '，小屋有了自己的小风景。'); });
      publish('yard:placed', { defId: id, uids: placed.map(value => value.uid), count }); return ok('铺好 ' + count + ' 段' + def.name + '啦。' + (count < candidates.length ? '其余位置等材料齐了再继续。' : ''), { count, uids: placed.map(value => value.uid), coinsSpent, partial: count < candidates.length });
    }
  };
})(window.Game);
