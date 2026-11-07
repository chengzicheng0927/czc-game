/* 外观购买与换装只经 store.update，试看的未拥有款式不写入存档。 */
(function (G) {
  'use strict';
  const D = G.data;
  const owned = id => !!(G.state.house.exterior.owned && Object.prototype.hasOwnProperty.call(G.state.house.exterior.owned, id) && G.state.house.exterior.owned[id]);
  const fail = message => ({ ok: false, message });
  const ok = (message, extra) => Object.assign({ ok: true, message }, extra || {});
  function memory(state, text) { state.memories.push({ at: Date.now(), text }); if (state.memories.length > D.balance.maxMemories) state.memories.splice(0, state.memories.length - D.balance.maxMemories); }
  G.sys.exterior = {
    owned,
    list(category) { return (D.exteriorCatalog[category] || []).map(def => Object.assign({}, def, { owned: owned(def.id), selected: G.state.house.exterior[category] === def.id, locked: G.state.level < def.unlockLv, canAfford: G.state.wallet[def.currency] >= def.price })); },
    buy(id) {
      const def = D.exteriorById[id]; if (!def) return fail('先挑一款小屋外观吧。');
      if (owned(id)) return fail('这款外观已经在你的小盒子里啦。');
      if (G.state.level < def.unlockLv) return fail('小屋到 Lv.' + def.unlockLv + '，就能带走这款外观啦。');
      if (G.state.wallet[def.currency] < def.price) return fail('还差 ' + (def.price - G.state.wallet[def.currency]) + (def.currency === 'heart' ? ' 颗爱心' : ' 颗糖果') + '，可以先挑一款已经拥有的。');
      G.store.update(state => { state.wallet[def.currency] -= def.price; state.house.exterior.owned[id] = true; memory(state, '为小屋解锁「' + def.name + '」，又多了一种喜欢的模样。'); });
      G.bus.emit('exterior:bought', { id, category: def.category }); return ok(def.name + '收好啦！', { id, category: def.category });
    },
    equip(category, id) {
      const def = D.exteriorById[id]; if (!def || def.category !== category) return fail('这款外观放错小盒子啦，重新选一选吧。');
      if (!owned(id)) return fail('先把这款外观收进小盒子，再给小屋换上吧。');
      if (G.state.level < def.unlockLv) return fail('小屋到 Lv.' + def.unlockLv + '，就能换上这款外观啦。');
      if (G.state.house.exterior[category] === id) return ok('小屋已经换上这款啦。', { id, category });
      G.store.update(state => { state.house.exterior[category] = id; }); G.bus.emit('exterior:changed', { category, id }); return ok('换上' + def.name + '啦。', { id, category });
    },
    color(part, value) {
      const key = part === 'roof' || part === 'roofColor' ? 'roofColor' : part === 'wall' || part === 'wallColor' ? 'wallColor' : null;
      if (!key || typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) return fail('选一颗有效的糖果色吧。');
      const color = value.toUpperCase(); G.store.update(state => { state.house.exterior[key] = color; }); G.bus.emit('exterior:changed', { category: key.slice(0, -5), color }); return ok('小屋换上喜欢的颜色啦。');
    },
    rename(value) {
      const name = typeof value === 'string' ? value.trim() : '';
      if (!name || [...name].length > 8) return fail('给小屋写上 1—8 个字的名字吧。');
      G.store.update(state => { state.house.name = name; memory(state, '把小屋的名字写成「' + name + '」。'); }); return ok('欢迎来到' + name + '！');
    }
  };
})(window.Game);
