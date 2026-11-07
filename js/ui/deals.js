/* 六件货架只读真实报价；购买与保存始终交给 economy。 */
(function (G) {
  'use strict';
  const ui = G.ui = G.ui || {}, D = G.data;
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
  const number = value => Number(value || 0).toLocaleString('zh-CN');
  let active = null, archive = 0, serial = 0, buying = false;
  function owns(session) {
    if (!session || session !== active || session.disposed || session.archive !== archive || !session.body.isConnected) return false;
    const panel = document.getElementById('panel');
    if (panel?.contains(session.body) && (panel.classList.contains('hidden') || panel.dataset.kind !== 'shop')) return false;
    for (let node = session.body; node; node = node.parentElement) {
      if (node.hidden || node.classList.contains('hidden') || node.getAttribute('aria-hidden') === 'true' || node.style?.display === 'none' || node.style?.visibility === 'hidden') return false;
    }
    return true;
  }
  function scrollHost(session) {
    const host = document.getElementById('panel-body');
    return host?.contains(session.body) ? host : session.body.parentElement;
  }
  function clearCards(session) {
    session.cards.forEach(card => {
      card.buy.disabled = true;
      try { card.canvas.getContext('2d')?.clearRect(0, 0, card.canvas.width, card.canvas.height); } catch (_) { /* 清理不依赖绘图成功。 */ }
      card.canvas.width = 0; card.canvas.height = 0;
      card.root.querySelector('.furniture-rarity-badge')?.remove();
    });
    session.cards.clear(); session.grid.replaceChildren();
  }
  function dispose(session) {
    if (!session || session.disposed) return;
    session.disposed = true;
    if (session.frame !== null) cancelAnimationFrame(session.frame);
    session.frame = null; session.observer?.disconnect(); clearCards(session); session.retry.disabled = true;
    session.focusRequest = null; session.feedback = null;
    if (active === session) active = null;
  }
  function read() {
    const state = G.sys.deals.status();
    if (!state || typeof state.date !== 'string' || !Array.isArray(state.items) || state.items.some(entry => !entry.definition)) throw new Error('特惠暂不可读');
    return state;
  }
  function focusAllowed(request) {
    const focused = document.activeElement;
    return !focused || focused === document.body || !focused.isConnected || focused === request.origin || focused.dataset.uiFocus === request.key;
  }
  function schedule(session) {
    if (session.frame !== null) cancelAnimationFrame(session.frame);
    session.frame = requestAnimationFrame(() => {
      session.frame = null;
      if (!owns(session)) { dispose(session); return; }
      session.mounted = true;
      const host = scrollHost(session);
      if (host && session.scroll !== null) { host.scrollTop = session.scroll; session.scroll = null; }
      session.cards.forEach(card => {
        if (card.drawn) return;
        card.drawn = true;
        try { G.render.drawThumbnail(card.canvas, card.id); }
        catch (_) { card.canvas.hidden = true; card.art.append(el('span', 'deal-art-unavailable', '家具插图暂不可用')); }
      });
      const request = session.focusRequest; session.focusRequest = null;
      if (request && focusAllowed(request)) {
        let target = request.key === 'deals-retry' ? session.retry : session.cards.get(request.id)?.buy;
        if (!target || target.disabled || target.hidden) target = session.message;
        target.focus({ preventScroll: true });
      }
    });
  }
  function cardFor(session, entry) {
    const def = entry.definition, root = el('article', 'deal-card'), art = el('div', 'deal-art'), canvas = el('canvas', 'deal-picture');
    canvas.width = 260; canvas.height = 180; canvas.dataset.dealFurniture = entry.id; art.setAttribute('aria-hidden', 'true'); art.append(canvas);
    const lock = el('span', 'deal-lock'), name = el('h4', 'deal-name', def.name), theme = el('p', 'deal-theme');
    name.id = 'deal-name-' + (++serial); root.setAttribute('aria-labelledby', name.id); art.append(lock);
    const price = el('p', 'deal-price'), current = el('strong'), old = el('del'), stock = el('p', 'deal-stock'), reason = el('p', 'deal-item-status');
    price.append(current, old); reason.id = 'deal-reason-' + serial;
    const buy = el('button', 'ui-button deal-buy'); buy.type = 'button'; buy.dataset.uiFocus = 'deals-buy-' + entry.id;
    buy.setAttribute('aria-describedby', reason.id + ' ' + session.message.id);
    const card = { id: entry.id, root, art, canvas, lock, name, theme, current, old, stock, reason, buy, drawn: false };
    buy.addEventListener('click', () => {
      if (!owns(session)) { dispose(session); return; }
      if (!buying && !session.busy && !buy.disabled) purchase(session, card);
    });
    root.append(art, name, theme, price, stock, reason, buy);
    ui.furnitureRarity?.decorate(root, def, { preview: canvas }); session.grid.append(root); session.cards.set(entry.id, card); return card;
  }
  function update(session, supplied) {
    if (session.disposed || session !== active) return;
    try {
      const state = supplied || read(), ids = state.items.map(entry => entry.id).join('|');
      if (ids !== session.ids) { clearCards(session); session.ids = ids; }
      session.snapshot = state; session.body.dataset.state = 'ready';
      session.date.textContent = '本地日期 ' + state.date + ' · Lv.' + number(G.state.level);
      session.wallet.textContent = '糖果 ' + number(G.state.wallet.coin);
      session.stamp.textContent = '今日' + (100 - state.discount) / 10 + '折';
      state.items.forEach(entry => {
        const card = session.cards.get(entry.id) || cardFor(session, entry), def = entry.definition;
        card.entry = entry; card.root.className = 'deal-card' + (entry.locked ? ' is-locked' : '') + ' furniture-rarity-surface rarity-' + (ui.furnitureRarity?.info(def).id || 'common');
        card.name.textContent = def.name;
        card.theme.textContent = (D.themes[def.theme]?.name || '普通家具') + (def.place === 'yard' ? ' · 前院' : '');
        card.lock.hidden = !entry.locked; card.lock.textContent = 'Lv.' + (def.unlockLv || 1) + ' 解锁';
        card.current.textContent = number(entry.price) + ' 糖'; card.current.setAttribute('aria-label', '折后价 ' + number(entry.price) + ' 颗糖果');
        card.old.textContent = '原价 ' + number(entry.originalPrice); card.old.setAttribute('aria-label', '原价 ' + number(entry.originalPrice) + ' 颗糖果');
        card.stock.textContent = '背包 ' + number(G.state.inventory[entry.id]) + ' 件 · ' + (entry.full ? '同款上限 9,999 件' : 'Lv.' + (def.unlockLv || 1) + ' 解锁');
        card.reason.textContent = entry.reason || '可继续购买，收进家具背包。';
        card.buy.disabled = buying || session.busy || !entry.canBuy;
        card.buy.className = 'ui-button deal-buy ' + (entry.canBuy ? 'ui-button-primary' : 'ui-button-soft');
        card.buy.textContent = entry.locked ? '尚未解锁' : entry.full ? '同款已满' : entry.short ? '慢慢攒糖果' : '买一件';
        card.buy.setAttribute('aria-label', def.name + '，' + (entry.reason || '用 ' + number(entry.price) + ' 颗糖果买一件'));
      });
    } catch (_) {
      session.snapshot = null; session.ids = ''; clearCards(session); session.body.dataset.state = 'unreadable';
      session.date.textContent = '今日目录暂不可读'; session.wallet.textContent = '糖果暂不可读';
      session.feedback = { ok: false, message: '今日特惠暂时没能读好，请重新读取目录，再确认家具和价格。' };
    }
    session.message.className = 'deal-message' + (session.feedback ? session.feedback.ok ? ' is-success' : ' is-error' : '');
    session.message.setAttribute('role', session.feedback && !session.feedback.ok ? 'alert' : 'status');
    session.message.textContent = session.feedback?.message || '普通货架上的同款家具，也会自动使用今天的八折价。';
    session.retry.disabled = buying || session.busy; schedule(session);
  }
  function purchase(session, card) {
    const displayed = card.entry, date = session.snapshot?.date, origin = document.activeElement;
    session.focusRequest = { key: card.buy.dataset.uiFocus, id: card.id, origin };
    session.busy = true; buying = true; session.body.setAttribute('aria-busy', 'true');
    session.cards.forEach(item => { item.buy.disabled = true; }); session.retry.disabled = true;
    let result;
    try {
      const current = read(), quote = G.sys.deals.priceFor(card.id);
      if (!owns(session)) return;
      const fresh = current.items.find(entry => entry.id === card.id);
      if (current.date !== date || quote !== displayed.price || fresh?.price !== displayed.price) {
        session.feedback = { ok: false, message: '特惠日期或价格已更新，已重新摆好六件家具。这次没有购买，请先看看今天的目录。' };
      } else if (!fresh.canBuy) {
        session.feedback = { ok: false, message: fresh.definition.name + '：' + (fresh.reason || '暂时不能购买，请重新读取目录。') };
      } else {
        result = G.sys.economy.buy(card.id, displayed.price);
        if (!owns(session)) return;
        session.feedback = { ok: result?.ok === true, message: result?.ok === true ? '「' + fresh.definition.name + '」已收进家具背包，使用 ' + number(displayed.price) + ' 颗糖果。喜欢的话，还可以继续买。' : result?.message || '购买结果暂未确认，请重新读取目录，核对糖果和库存后再试。' };
      }
    } catch (_) {
      if (owns(session)) session.feedback = { ok: false, message: '购买结果暂未确认，请重新读取目录，核对糖果和库存后再试。' };
    } finally {
      buying = false; session.busy = false; session.body.setAttribute('aria-busy', 'false');
      // 同步事件可能重建宿主；新页面恢复资格，但不接收旧页面的迟到成功反馈。
      if (active && active !== session && owns(active)) update(active);
    }
    if (!owns(session)) return;
    session.focusRequest = { key: card.buy.dataset.uiFocus, id: card.id, origin };
    update(session);
    if (result?.ok === true && owns(session)) { G.audio.play('success'); if (owns(session)) ui.toast(session.feedback.message); }
  }
  function content() {
    const previous = active, keep = owns(previous), host = keep && scrollHost(previous), focused = document.activeElement;
    const pending = keep && previous.focusRequest;
    const focusRequest = pending && focusAllowed(pending) ? pending : keep && previous.body.contains(focused) && focused.dataset.uiFocus ? { key: focused.dataset.uiFocus, id: focused.dataset.uiFocus.slice('deals-buy-'.length), origin: focused } : null;
    const feedback = keep && !previous.busy ? previous.feedback : null, scroll = host ? host.scrollTop : null;
    dispose(previous);
    const body = el('section', 'daily-deals deals-v2'), top = el('div', 'deal-heading'), stamp = el('span', 'deal-stamp', '今日八折');
    top.append(el('h3', '', '今天的六件小惊喜'), stamp);
    const intro = el('p', 'deal-intro', '每天换六件，喜欢的东西慢慢攒。买过也能继续买。');
    const budget = el('div', 'deal-budget'), date = el('span'), wallet = el('strong'); budget.append(date, wallet);
    const message = el('p', 'deal-message'); message.id = 'deals-message-' + (++serial); message.tabIndex = -1; message.dataset.uiFocus = 'deals-feedback'; message.setAttribute('aria-live', 'polite'); message.setAttribute('aria-atomic', 'true');
    const grid = el('div', 'deal-grid'), footer = el('div', 'deal-footer'), retry = el('button', 'ui-button ui-button-soft deal-retry', '重新读取目录');
    retry.type = 'button'; retry.dataset.uiFocus = 'deals-retry';
    footer.append(el('p', 'deal-footnote', '当天升级、购买或切换存档，都不会换掉这六件。前院家具收好后，可在「建造 → 布置前院」摆放。'), retry);
    body.append(top, intro, budget, message, grid, footer);
    const session = { body, stamp, date, wallet, message, grid, retry, cards: new Map(), ids: '', snapshot: null, archive, disposed: false, mounted: false, busy: false, frame: null, observer: null, feedback, focusRequest, scroll };
    active = session;
    retry.addEventListener('click', () => {
      if (!owns(session)) { dispose(session); return; }
      if (buying || session.busy || retry.disabled) return;
      session.feedback = null; session.focusRequest = { key: 'deals-retry', origin: document.activeElement }; update(session);
    });
    if (typeof MutationObserver !== 'undefined') {
      session.observer = new MutationObserver(() => {
        if (session.disposed) return;
        if (session.body.isConnected) session.mounted = true;
        if (session.mounted && !owns(session)) dispose(session);
      });
      session.observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'class', 'style', 'aria-hidden'] });
    }
    update(session); return body;
  }
  G.bus.on('panel:change', () => { if (active && active.mounted && !owns(active)) dispose(active); });
  G.bus.on('modal:closed', () => { if (active && !owns(active)) dispose(active); });
  G.bus.on('state:replace', () => { archive++; dispose(active); });
  ui.deals = { content };
})(window.Game);
