(function (G) {
  'use strict';
  // 云海地图适配层：读取公开邻居摘要并推给渲染层，点击云朵后弹出串门小卡片。不读取账号或私人存档。
  var ui = G.ui = G.ui || {}, initialized = false, pageActive = true, loading = false, timer = null, ticket = 0, cycles = 0, settled = false;
  var online = [], recent = [], recentLoaded = false, card = null, cardId = '', cardKey = '';
  function keyOf(house) { return house ? house.title + '|' + house.displayName + '|' + (house.online ? house.online.count + house.online.displayNames.join(',') : '') : ''; }
  var idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function cloudOk() { try { var s = G.cloud && G.cloud.status && G.cloud.status(); return !!(s && s.available && G.cloud.requestPublic); } catch (_) { return false; } }
  function active() { return pageActive && !document.hidden && cloudOk(); }
  function safeHouse(v) { return v && idPattern.test(v.id) && typeof v.title === 'string' && typeof v.displayName === 'string' && Number.isInteger(v.roomCount) && v.roomCount >= 0; }
  function safeOnline(v) {
    return safeHouse(v) && v.online && Number.isInteger(v.online.count) && v.online.count >= 1 && v.online.count <= 8 && typeof v.online.hostOnline === 'boolean' && Array.isArray(v.online.displayNames) && v.online.displayNames.length === v.online.count &&
      v.online.displayNames.every(function (name) { return typeof name === 'string' && [...name].length >= 1 && [...name].length <= 24 && !/[\x00-\x1f\x7f]/.test(name); });
  }
  function checked(data, limit, test) {
    if (!data || !Array.isArray(data.houses) || data.houses.length > limit || !data.houses.every(test)) return null;
    return new Set(data.houses.map(function (v) { return v.id; })).size === data.houses.length ? data.houses : null;
  }
  // 在线小屋排前面，再补最近更新的；自己的小屋不放进别人的云海。
  function publish() {
    if (!G.seaMap) return;
    var own = G.neighbors && G.neighbors.ownId ? G.neighbors.ownId() : '', seen = new Set(), list = [];
    online.concat(recent).forEach(function (house) { if (house.id === own || seen.has(house.id)) return; seen.add(house.id); list.push(house); });
    var ok = cloudOk(); G.seaMap.setHouses(ok ? list : []); G.seaMap.setEmpty(ok && settled && !list.length);
    if (cardId && !list.some(function (house) { return house.id === cardId; })) closeCard();
    else if (cardId && cardKey !== keyOf(houseById(cardId))) showCard(cardId);
    if (G.render && G.render.redraw) G.render.redraw();
  }
  function houseById(id) {
    var found = null;
    online.concat(recent).forEach(function (house) { if (house.id === id && !found) found = house; });
    return found;
  }

  async function refresh() {
    if (loading || !active()) return;
    var mine = ++ticket; loading = true;
    try {
      try { online = checked(await G.cloud.requestPublic('/neighbors/online'), 64, safeOnline) || []; } catch (_) { online = []; }
      if (mine !== ticket) return;
      if (!recentLoaded || ++cycles % 6 === 0) {
        try { var page = checked(await G.cloud.requestPublic('/neighbors'), 24, safeHouse); if (page) { recent = page; recentLoaded = true; } } catch (_) { /* 保留上次的名单 */ }
        if (mine !== ticket) return;
      }
      settled = true; publish();
    } finally {
      loading = false;
      if (mine === ticket) schedule();
    }
  }
  function schedule() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (active()) timer = setTimeout(function () { timer = null; refresh(); }, 10000);
  }
  function pause() {
    if (timer !== null) clearTimeout(timer);
    timer = null; ticket++; loading = false;
  }
  function sync() {
    var button = document.getElementById('zoom-sea');
    if (button) button.hidden = !cloudOk();
    if (!cloudOk()) { pause(); online = []; recent = []; recentLoaded = false; settled = false; publish(); return; }
    if (active()) { if (timer === null && !loading) refresh(); } else pause();
  }

  function el(tag, className, text) { var node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function link(house, join, label) {
    var a = el('a', 'ui-button ' + (join ? 'ui-button-primary' : 'ui-button-soft'), label);
    a.href = G.neighbors.visitUrl(house.id, join); a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.setAttribute('aria-label', (join ? '加入“' : '参观“') + house.title + '”，将在新页面打开');
    if (G.neighbors.bindVisit) G.neighbors.bindVisit(a, house.id, join); // 主场景串门可用时直接切换，否则仍在新页面打开
    // 主场景串门接管这次点击（bindVisit 已 preventDefault）时收起邻居卡片，免得卡片留在别人家的画面上。
    a.addEventListener('click', function (event) { if (event.defaultPrevented) closeCard(); });
    return a;
  }
  function closeCard() { cardId = ''; if (card) { card.remove(); card = null; } }
  // 没有邻居时点空云：引导孩子去公开自己的小屋。
  function showHint() {
    closeCard();
    var next = el('div', 'sea-card'), close = el('button', 'sea-card-close', '×'), actions = el('div', 'sea-card-actions'), open = el('button', 'ui-button ui-button-primary', '打开邻居小屋');
    next.setAttribute('role', 'dialog'); next.setAttribute('aria-label', '这里还空着');
    close.type = 'button'; close.setAttribute('aria-label', '收起'); close.addEventListener('click', closeCard);
    open.type = 'button'; open.addEventListener('click', function () { closeCard(); if (G.neighbors && G.neighbors.open) G.neighbors.open(); });
    actions.append(open);
    next.append(close, el('strong', 'sea-card-title', '这里还空着'), el('span', 'sea-card-people', '公开自己的小屋，邻居就能在这里看到你。'), actions);
    card = next; document.body.append(card);
  }
  function showCard(id) {
    var house = houseById(id); if (!house || !G.neighbors || !G.neighbors.visitUrl) { closeCard(); return; }
    cardId = id; cardKey = keyOf(house);
    var next = el('div', 'sea-card'), close = el('button', 'sea-card-close', '×');
    next.setAttribute('role', 'dialog'); next.setAttribute('aria-label', house.title);
    close.type = 'button'; close.setAttribute('aria-label', '收起'); close.addEventListener('click', closeCard);
    var actions = el('div', 'sea-card-actions');
    if (house.online && house.online.count < 8) actions.append(link(house, true, '敲门串门'));
    actions.append(link(house, false, '路过看看'));
    next.append(close, el('strong', 'sea-card-title', house.title), el('span', 'sea-card-owner', house.displayName + '的小屋'),
      el('span', 'sea-card-people', house.online ? house.online.displayNames.join('、') + ' 正在玩' : '现在没有人，可以路过看看'), actions);
    if (card) card.remove();
    card = next; document.body.append(card);
  }

  ui.seaMap = {
    init: function () {
      if (initialized) return; initialized = true;
      if (G.bus && G.bus.on) {
        G.bus.on('cloud:change', sync); G.bus.on('scene:neighbor', function (e) { if (e && e.empty) showHint(); else if (e && idPattern.test(e.id)) showCard(e.id); });
        ['scene:deselect', 'scene:room', 'scene:empty', 'scene:item'].forEach(function (name) { G.bus.on(name, closeCard); });
      }
      document.addEventListener('visibilitychange', sync);
      window.addEventListener('pagehide', function () { pageActive = false; pause(); });
      window.addEventListener('pageshow', function () { pageActive = true; sync(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeCard(); });
      sync();
    },
    refresh: refresh,
    status: function () { return { online: online.length, recent: recent.length, shown: G.seaMap ? G.seaMap.count() : 0, card: cardId }; }
  };
})(window.Game);
