/* 外观拥有权与装备只改元数据；试穿纯读，确认后一次持久保存。 */
(function (G) {
  'use strict';
  const D = G.data, own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  let changing = false;
  const owned = id => typeof id === 'string' && !!(G.state.house.exterior.owned && own(G.state.house.exterior.owned, id) && G.state.house.exterior.owned[id]);
  const definition = id => typeof id === 'string' && own(D.exteriorById, id) ? D.exteriorById[id] : null;
  const fail = message => ({ ok: false, message });
  const ok = (message, extra) => Object.assign({ ok: true, message }, extra || {});
  function memory(state, text) { state.memories.push({ at: Date.now(), text }); if (state.memories.length > D.balance.maxMemories) state.memories.splice(0, state.memories.length - D.balance.maxMemories); }
  function commit(update, result, notify) {
    if (changing) return fail('小屋正在换新衣，稍等一下吧。');
    changing = true;
    try {
      G.store.update(update, { persist: true });
      if (notify) notify();
      return result;
    } catch (_) { return fail('这次外观还没有保存，原来的小屋和糖果都保留着。请先下载JSON备份，再试一次吧。'); }
    finally { changing = false; }
  }
  function buy(id, equip) {
    if (changing) return fail('小屋正在换新衣，稍等一下吧。');
    const def = definition(id); if (!def) return fail('先挑一款小屋外观吧。');
    if (owned(id)) return fail('这款外观已经在你的小盒子里啦。');
    if (G.state.level < def.unlockLv) return fail('小屋到 Lv.' + def.unlockLv + '，就能带走这款外观啦。');
    if (G.state.wallet[def.currency] < def.price) return fail('还差 ' + (def.price - G.state.wallet[def.currency]) + (def.currency === 'heart' ? ' 颗爱心' : ' 颗糖果') + '，可以先挑一款已经拥有的。');
    return commit(state => {
      if (state.house.exterior.owned[id] || state.level < def.unlockLv || state.wallet[def.currency] < def.price) throw new Error('外观报价已变化');
      state.wallet[def.currency] -= def.price; state.house.exterior.owned[id] = true;
      if (equip) state.house.exterior[def.category] = id;
      memory(state, '为小屋解锁「' + def.name + '」，又多了一种喜欢的模样。');
    }, ok(def.name + (equip ? '换上啦！' : '收好啦！'), { id, category: def.category }), () => {
      G.bus.emit('exterior:bought', { id, category: def.category });
      if (equip) G.bus.emit('exterior:changed', { id, category: def.category });
    });
  }
  G.sys.exterior = {
    owned,
    list(category) { return (typeof category === 'string' && own(D.exteriorCatalog, category) ? D.exteriorCatalog[category] : []).map(def => Object.assign({}, def, { owned: owned(def.id), selected: G.state.house.exterior[category] === def.id, locked: G.state.level < def.unlockLv, canAfford: G.state.wallet[def.currency] >= def.price })); },
    buy(id) { return buy(id, false); },
    // 「购买并换上」不会因第二次写盘失败只买下半个操作。
    buyAndEquip(id) { return buy(id, true); },
    equip(category, id) {
      if (changing) return fail('小屋正在换新衣，稍等一下吧。');
      const def = definition(id); if (!def || def.category !== category) return fail('这款外观放错小盒子啦，重新选一选吧。');
      if (!owned(id)) return fail('先把这款外观收进小盒子，再给小屋换上吧。');
      if (G.state.level < def.unlockLv) return fail('小屋到 Lv.' + def.unlockLv + '，就能换上这款外观啦。');
      if (G.state.house.exterior[category] === id) return ok('小屋已经换上这款啦。', { id, category });
      return commit(state => { state.house.exterior[category] = id; }, ok('换上' + def.name + '啦。', { id, category }), () => G.bus.emit('exterior:changed', { category, id }));
    },
    color(part, value) {
      const key = part === 'roof' || part === 'roofColor' ? 'roofColor' : part === 'wall' || part === 'wallColor' ? 'wallColor' : null;
      if (!key || typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) return fail('选一颗有效的糖果色吧。');
      const color = value.toUpperCase();
      return commit(state => { state.house.exterior[key] = color; }, ok('小屋换上喜欢的颜色啦。'), () => G.bus.emit('exterior:changed', { category: key.slice(0, -5), color }));
    },
    rename(value) {
      const name = typeof value === 'string' ? value.trim() : '';
      if (!name || [...name].length > 8 || /[\x00-\x1f\x7f]/.test(name)) return fail('给小屋写上 1—8 个字的名字吧。');
      return commit(state => { state.house.name = name; memory(state, '把小屋的名字写成「' + name + '」。'); }, ok('欢迎来到' + name + '！'));
    }
  };
})(window.Game);
