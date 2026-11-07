/* 风格试穿纯读；明确确认后，缺少部件和配色在同一次持久事务中换好。 */
(function (G) {
  'use strict';
  const D = G.data, categories = ['roof', 'wall', 'window', 'door', 'chimney'], colorKeys = ['roofColor', 'wallColor'];
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const fail = message => ({ ok: false, message });
  let applying = false;
  function inspect(state, id) {
    if (typeof id !== 'string' || !own(D.houseStyleById, id)) return fail('先挑一套喜欢的小屋风格吧。');
    const style = D.houseStyleById[id], current = state.house.exterior, cost = { coin: 0, heart: 0 };
    const parts = categories.map(category => {
      const definition = D.exteriorById[style.exterior[category]], owned = own(current.owned, definition.id) && current.owned[definition.id] === true;
      if (!owned) cost[definition.currency] += definition.price;
      return Object.assign({}, definition, { owned, locked: state.level < definition.unlockLv });
    });
    const unlockLv = Math.max(...parts.map(part => part.unlockLv)), locked = state.level < unlockLv;
    const canAfford = state.wallet.coin >= cost.coin && state.wallet.heart >= cost.heart;
    const selected = categories.every(key => current[key] === style.exterior[key]) && colorKeys.every(key => current[key].toUpperCase() === style.exterior[key]);
    const missing = parts.filter(part => !part.owned), shortfalls = [];
    if (state.wallet.coin < cost.coin) shortfalls.push((cost.coin - state.wallet.coin) + ' 颗糖果');
    if (state.wallet.heart < cost.heart) shortfalls.push((cost.heart - state.wallet.heart) + ' 颗爱心');
    const reason = locked ? '小屋到 Lv.' + unlockLv + '，就能换上这套风格啦。' : !canAfford ? '还差 ' + shortfalls.join('和') + '，可以先试试看。' : selected ? '小屋已经是这套模样啦，也可以继续单独搭配。' : missing.length ? '确认后一起收好 ' + missing.length + ' 款部件，再给小屋换上。' : '部件都已经拥有，确认后免费换上整套颜色和模样。';
    // 报价绑定当前外观与相关拥有权，面板外的改动不能被旧预览悄悄覆盖。
    const quote = JSON.stringify([id, categories.map(key => current[key]), colorKeys.map(key => current[key].toUpperCase()), missing.map(part => part.id), cost.coin, cost.heart, unlockLv, state.level]);
    return { ok: true, id, name: style.name, icon: style.icon, description: style.description, exterior: Object.assign({}, style.exterior, { owned: Object.assign({}, current.owned) }), parts, missing, cost, unlockLv, locked, canAfford, canApply: !locked && canAfford && !selected, selected, quote, reason, message: reason };
  }
  function preview(id) { return inspect(G.state, id); }
  function apply(id, expectedQuote) {
    if (applying) return fail('小屋正在换新衣，稍等一下吧。');
    const status = preview(id);
    if (!status.ok) return status;
    if (typeof expectedQuote !== 'string' || expectedQuote !== status.quote) return fail('小屋的搭配刚刚有了变化，请重新预览后再确认。');
    if (status.locked || !status.canAfford) return fail(status.reason);
    if (status.selected) return { ok: true, unchanged: true, id, message: status.reason };
    applying = true;
    try {
      G.store.update(state => {
        const next = inspect(state, id);
        if (!next.ok || next.quote !== expectedQuote || next.locked || !next.canAfford) throw new Error('外观报价变化');
        state.wallet.coin -= next.cost.coin; state.wallet.heart -= next.cost.heart;
        next.parts.forEach(part => { state.house.exterior.owned[part.id] = true; state.house.exterior[part.category] = part.id; });
        colorKeys.forEach(key => { state.house.exterior[key] = next.exterior[key]; });
        state.memories.push({ at: Date.now(), text: '给小屋换上「' + next.name + '」风格，部件和颜色还可以继续自由搭配。' });
        if (state.memories.length > D.balance.maxMemories) state.memories.splice(0, state.memories.length - D.balance.maxMemories);
      }, { persist: true });
      status.missing.forEach(part => G.bus.emit('exterior:bought', { id: part.id, category: part.category, styleId: id }));
      G.bus.emit('exterior:changed', { styleId: id });
      return { ok: true, id, cost: status.cost, message: '小屋换上' + status.name + '啦！还可以继续搭配屋顶和颜色。' };
    } catch (_) {
      return fail('这次新搭配还没有保存，糖果、爱心和小屋都保持原样。请先下载JSON备份，再试一次吧。');
    } finally { applying = false; }
  }
  G.sys.houseStyles = { preview, apply, list() { return D.houseStyles.map(style => preview(style.id)); }, current() { const matched = D.houseStyles.find(style => inspect(G.state, style.id).selected); return matched ? matched.id : null; } };
})(window.Game);
