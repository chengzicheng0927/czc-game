/* 庭院沿用原奶油图卡；物品和摆放只读取真实建筑，修改交给新建筑接口。 */
(function (G) {
  'use strict';
  const ui = G.ui = G.ui || {};
  const view = G.runtime.yardView = { tab: 'items', page: 0, message: '' };
  let epoch = 0, activeRoot = null, operating = false;
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
  function visible() {
    const host = document.getElementById('panel');
    return !!activeRoot?.isConnected && (!host || !host.classList.contains('hidden') && host.dataset.kind === 'yard');
  }
  const owns = scope => scope.epoch === epoch && scope.root === activeRoot && visible();
  function button(scope, text, action, cls = 'ui-button ui-button-soft', key) {
    const node = el('button', cls, text); node.type = 'button';
    if (key) node.dataset.uiFocus = key;
    node.addEventListener('click', () => { if (owns(scope) && !operating) action(node); }); return node;
  }
  function bridge(name, ...args) {
    const action = G.buildingEditor?.[name];
    if (typeof action !== 'function') return { ok: false, message: '院子还在准备，请稍后再试一次。' };
    try { return action(...args); }
    catch (_) { return { ok: false, message: '这次还没收好，原来的院子和背包都保留着。请再试一次。' }; }
  }
  function snapshot() {
    const result = bridge('yardSnapshot');
    const unlockLv = result?.unlockLv || G.data.yardConfig?.unlockLv || 11;
    return { ...result, unlockLv, unlocked: G.state.level >= unlockLv && result?.unlocked !== false, items: Array.isArray(result?.items) ? result.items : [] };
  }
  function notice(text) { const node = el('p', 'yard-status', text); node.setAttribute('role', 'status'); node.setAttribute('aria-live', 'polite'); return node; }
  function act(scope, operation, fallback) {
    if (!owns(scope) || operating) return false;
    operating = true; let result;
    try { result = operation(); }
    catch (_) { result = { ok: false, message: '这次还没收好，原来的院子和背包都保留着。请再试一次。' }; }
    operating = false;
    if (scope.epoch !== epoch) return false;
    const text = result?.message || (result?.ok ? fallback : '院子还在准备，请稍后再试一次。');
    ui.toast(text); G.audio?.play?.(result?.ok ? 'success' : 'soft');
    view.message = result?.ok ? '' : text;
    if (visible()) ui.refresh();
    return !!result?.ok;
  }
  function choose(scope, definition) {
    const current = snapshot(), required = Math.max(current.unlockLv, definition.unlockLv || 1);
    if (!current.unlocked || G.state.level < required) { ui.toast('小屋到 ' + required + ' 级，就能把它摆进院子啦。'); return false; }
    if (!(G.state.inventory[definition.id] > 0)) { ui.toast('这件宝贝已经摆好啦，去庭院背包重新挑一件吧。'); ui.refresh(); return false; }
    const result = bridge('beginPlacement', definition.id, null);
    if (!result?.ok) { ui.toast(result?.message || '这次没有开始摆放，请重新选择。'); return false; }
    view.message = ''; ui.panel.close({ keepPlacing: true }); ui.selection();
    ui.toast('点一下小屋前的草地，放好' + definition.name + '。摆好后也能拖动、转向或收回。');
    return true;
  }
  function thumbnail(definition) {
    // 与杂货铺、背包共用data-furniture缩略图绘制，不另起画面或渲染循环。
    const canvas = el('canvas', 'item-thumb yard-preview'); canvas.width = 144; canvas.height = 112;
    canvas.dataset.furniture = definition.id; canvas.setAttribute('aria-hidden', 'true'); return canvas;
  }
  function priceFor(definition) {
    const price = G.sys.deals?.priceFor ? G.sys.deals.priceFor(definition.id) : definition.price;
    return typeof price === 'number' && Number.isFinite(price) && price >= 0 ? price : null;
  }
  function costText(price, currency) { return price + (currency === 'heart' ? ' 颗爱心' : ' 颗糖果'); }
  function itemCard(scope, definition, item, state) {
    const card = el('article', 'yard-card ui-card' + (G.runtime.placing === definition.id && !item ? ' is-selected' : ''));
    const art = thumbnail(definition), copy = el('div', 'yard-card-copy');
    copy.append(el('h3', '', definition.name)); card.append(art, copy);
    ui.furnitureRarity?.decorate(card, definition, { preview: art });
    const count = G.state.inventory[definition.id] || 0;
    if (item) {
      copy.append(el('p', 'yard-card-detail', state.unlocked ? '已经摆在院子里' : '已经摆好 · 小屋' + state.unlockLv + '级后可调整'));
      const tools = el('div', 'yard-card-actions');
      const focus = button(scope, '选中，挪一挪', () => {
        const result = bridge('focusFurniture', item.id);
        if (result?.ok === false) ui.toast(result.message);
        else ui.toast('在场景中拖动' + definition.name + '，也可以转个方向或收回背包。');
      }, 'ui-button ui-button-soft', 'yard-focus-' + item.id);
      const remove = button(scope, '收回背包', () => act(scope, () => bridge('removeYard', item.id), '好好收进庭院背包啦。'), 'ui-button', 'yard-remove-' + item.id);
      focus.disabled = remove.disabled = !state.unlocked; tools.append(focus, remove);
      card.append(tools); return card;
    }
    if (view.tab === 'shop') {
      const price = priceFor(definition), currency = definition.currency || 'coin';
      const required = Math.max(state.unlockLv, definition.unlockLv || 1), locked = !state.unlocked || G.state.level < required;
      const short = price === null ? 0 : Math.max(0, price - (G.state.wallet[currency] || 0)), full = count >= 9999;
      copy.append(el('p', 'yard-card-detail', price === null ? '价格正在准备' : costText(price, currency) + (price < definition.price ? ' · 今日八折' : '')), el('p', 'yard-card-stock', '背包里有 ' + count + ' 件'));
      const label = locked ? '小屋' + required + '级可带回' : full ? '这件宝贝的背包装满啦' : price === null ? '稍后再来看看' : short ? '还差 ' + costText(short, currency) : '带回家 · ' + costText(price, currency);
      const buy = button(scope, label, () => act(scope, () => G.sys.economy.buy(definition.id, price), '带回庭院背包啦。'), 'ui-button ' + (locked || short || full ? 'ui-button-soft' : 'ui-button-primary'), 'yard-buy-' + definition.id);
      buy.disabled = locked || !!short || full || price === null;
      card.append(buy); return card;
    }
    copy.append(el('p', 'yard-card-detail', '背包里有 ' + count + ' 件'));
    const required = Math.max(state.unlockLv, definition.unlockLv || 1), locked = !state.unlocked || G.state.level < required;
    const place = button(scope, locked ? '小屋' + required + '级可摆放' : '选好，去摆放', () => choose(scope, definition), 'ui-button ui-button-soft', 'yard-place-' + definition.id);
    place.disabled = locked || count <= 0; card.append(place); return card;
  }
  function pagination(scope, length) {
    const pages = Math.max(1, Math.ceil(length / 24)); view.page = Math.max(0, Math.min(pages - 1, view.page));
    const bar = el('nav', 'yard-pagination'); bar.setAttribute('aria-label', '庭院物品翻页');
    const change = amount => { view.page += amount; ui.refresh(); const body = document.getElementById('panel-body'); if (body) body.scrollTop = 0; };
    const previous = button(scope, '上一页', () => change(-1), 'ui-button', 'yard-page-previous'); previous.disabled = view.page === 0;
    const next = button(scope, '下一页', () => change(1), 'ui-button', 'yard-page-next'); next.disabled = view.page + 1 >= pages;
    bar.append(previous, el('span', '', (view.page + 1) + ' / ' + pages + ' 页'), next); return bar;
  }
  function panel() {
    const wasVisible = visible();
    // 根桥按builderPanel判断首次进入；普通刷新不会重置镜头或清掉选择。
    const entry = bridge('openYard', { panel: false }), state = snapshot();
    const body = el('div', 'yard-panel ui-stack'); activeRoot = body;
    const scope = { root: body, epoch };
    if (entry?.ok === false || state.ok === false) { body.append(notice(entry?.message || state.message || '院子正在准备，请稍后再来看看。')); return { title: '我的大前院', subtitle: '留一块草地，装下喜欢的生活', content: body }; }
    if (!wasVisible && !state.unlocked && state.items.length) { view.tab = 'placed'; view.page = 0; }
    const intro = el('div', 'yard-intro');
    intro.append(el('p', '', '秋千、花坛和小长椅，把小屋前的草地布置成喜欢的样子。'), el('span', 'yard-level', '小屋 ' + G.state.level + ' 级'));
    body.append(intro);
    if (!state.unlocked) body.append(el('div', 'yard-locked ui-notice', '小屋到 ' + state.unlockLv + ' 级开放庭院装饰。现在可以看看喜欢的宝贝，已经摆好的小风景也都保留着。'), button(scope, '去看看成长任务', () => ui.open('quests'), 'ui-button ui-button-soft', 'yard-quests'));
    const tabs = el('div', 'yard-tabs ui-tabs'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', '前院布置');
    for (const tab of [{ id: 'items', name: '庭院背包' }, { id: 'shop', name: '庭院小铺' }, { id: 'placed', name: '已经摆好 ' + state.items.length }]) {
      const control = button(scope, tab.name, () => { view.tab = tab.id; view.page = 0; view.message = ''; ui.refresh(); }, 'ui-tab' + (view.tab === tab.id ? ' is-active' : ''), 'yard-tab-' + tab.id);
      control.setAttribute('aria-pressed', String(view.tab === tab.id)); tabs.append(control);
    }
    body.append(tabs);
    const tools = el('div', 'yard-tools');
    for (const redo of [false, true]) {
      const control = button(scope, redo ? '再做一次' : '退一步', () => act(scope, () => bridge('undo', { redo }), redo ? '再做一次啦。' : '退回上一步啦。'), 'ui-button', redo ? 'yard-redo' : 'yard-undo');
      control.disabled = !state.unlocked; tools.append(control);
    }
    tools.append(button(scope, '照顾花园', () => ui.open('garden'), 'ui-button ui-button-soft', 'yard-garden'), button(scope, '回房子成长书', () => ui.open('houseBlueprints'), 'ui-button ui-button-soft', 'yard-house-book')); body.append(tools);
    if (view.message) body.append(notice(view.message));
    const definitions = G.data.furniture.filter(definition => definition.place === 'yard');
    const rows = view.tab === 'placed' ? state.items.map(item => ({ definition: G.data.furnitureById[item.defId], item })).filter(row => row.definition) : definitions.filter(definition => view.tab === 'shop' ? !definition.rewardOnly && !definition.customArt && definition.currency !== 'none' : G.state.inventory[definition.id] > 0).map(definition => ({ definition, item: null }));
    if (rows.length > 24) body.append(pagination(scope, rows.length)); else view.page = 0;
    if (rows.length) {
      const grid = el('div', 'yard-grid item-grid');
      rows.slice(view.page * 24, (view.page + 1) * 24).forEach(row => grid.append(itemCard(scope, row.definition, row.item, state))); body.append(grid);
    } else {
      const empty = el('div', 'yard-empty');
      empty.append(el('p', '', view.tab === 'placed' ? '前院还是一块软软的草地。选一件宝贝，开始布置吧。' : view.tab === 'shop' ? '小铺正在整理货架，过一会儿再来看看吧。' : '庭院背包还空着。去小铺挑一件喜欢的宝贝吧。'));
      if (view.tab !== 'shop') empty.append(button(scope, view.tab === 'placed' ? '看看庭院背包' : '逛逛庭院小铺', () => { view.tab = view.tab === 'placed' ? 'items' : 'shop'; view.page = 0; ui.refresh(); }, 'ui-button ui-button-primary', 'yard-empty-action'));
      body.append(empty);
    }
    body.append(el('p', 'yard-help', state.unlocked ? '先选一件宝贝，再点小屋前的草地放好。摆好的物品可以拖动、转向或收回，进度会和小屋一起保存。' : '先看看喜欢的宝贝吧。小屋到' + state.unlockLv + '级后，就可以布置自己的小院子。'));
    return { title: '我的大前院', subtitle: '留一块草地，装下喜欢的生活', content: body };
  }
  G.bus.on('state:replace', () => { epoch++; activeRoot = null; operating = false; view.tab = 'items'; view.page = 0; view.message = ''; });
  G.bus.on('panel:change', event => { if (activeRoot && (event?.open === false || !visible())) activeRoot = null; });
  ui.yard = { panel, open() { return bridge('openYard'); } };
})(window.Game);
