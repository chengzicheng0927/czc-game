(function (G) {
  'use strict';
  var ui = G.ui = G.ui || {}, body = null, nodes = {}, initialized = false, opened = false, mode = 'list';
  var context = 0, owner = undefined, listTicket = 0, mineTicket = 0, operation = 0, working = '';
  var houses = [], nextCursor = null, loaded = false, loadingList = false, loadingMine = false, mineResolved = false, publication = null;
  var listError = '', mineError = '', feedback = '', feedbackError = false, titleDirty = false, nameDirty = false;
  var onlineHouses = [], onlineLoaded = false, loadingOnline = false, onlineError = '', onlineStale = false;
  var onlineTicket = 0, onlineGeneration = 0, onlineTimer = null, onlineActive = false, pageActive = true, rowCache = new Map();
  var presenceKey = '', mineEligible = false;
  var script = document.currentScript, match = script && /^(https?:\/\/[^/]+)(.*?)\/releases\/r-[a-f0-9]{64}\//.exec(script.src || ''), prefix = match ? match[2] : '';
  var idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function el(tag, className, text) { var node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function append(parent) { Array.prototype.slice.call(arguments, 1).filter(Boolean).forEach(function (node) { parent.append(node); }); return parent; }
  function hide(node, value) { node.classList.toggle('hidden', !!value); }
  function cloud() { try { return G.cloud && G.cloud.status ? G.cloud.status() : { available: false }; } catch (_) { return { available: false }; } }
  function signed(s) { return !!(s.available && s.account && s.phase !== 'expired'); }
  function currentOwner(s) { return signed(s) ? s.account.id : null; }
  function publishable(s) { return signed(s) && s.binding && !s.restoreRequired && !s.readOnly && !s.busy && !['choose', 'conflict', 'incompatible', 'expired', 'other_tab', 'offline'].includes(s.phase); }
  function message(error, fallback) { return error && typeof error.message === 'string' && error.message || fallback; }
  function date(value) { var d = new Date(value); return value && Number.isFinite(d.getTime()) ? d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''; }
  function button(label, fn, kind) { var node = el('button', 'ui-button' + (kind ? ' ' + kind : ''), label); node.type = 'button'; node.addEventListener('click', fn); return node; }
  // 把参观链接接到主场景串门：保留 href 与 target=_blank，只有无修饰键的左键点击且主场景串门可用时才拦截；
  // 其余（中键、Ctrl/Cmd/Shift/Alt、不可用）仍照旧在新页面打开。join 为真是敲门串门，否则路过；可重复调用以更新目标。
  function bindVisit(anchor, id, join) {
    var first = !anchor.mcVisit; anchor.mcVisit = { id: id, join: !!join };
    if (!first) return anchor;
    anchor.addEventListener('click', function (event) {
      var session = G.visitSession; if (!session || typeof session.available !== 'function' || !session.available()) return;
      if (event.defaultPrevented || (event.button || 0) !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      var target = anchor.mcVisit; if (!target || !idPattern.test(target.id)) return;
      event.preventDefault();
      Promise.resolve(session.enter(target.id, { mode: target.join ? 'live' : 'passerby' })).catch(function () { if (ui.toast) ui.toast('这次没能进去，请稍后再试。'); });
    });
    return anchor;
  }
  function visitLink(value, label) { var reception = label === '接待朋友，一起玩', link = el('a', 'ui-button ui-button-soft neighbors-visit', label || '路过看看'); link.href = prefix + '/visit/' + value.id + (reception ? '#join' : ''); link.target = '_blank'; link.rel = 'noopener noreferrer'; link.setAttribute('aria-label', (reception ? '加入“' : '参观“') + value.title + '”' + (reception ? '接待朋友并聊天' : '，登录后可加入实时串门') + '，将在新页面打开'); bindVisit(link, value.id, reception); return link; }
  function safeHouse(value) { return value && idPattern.test(value.id) && typeof value.title === 'string' && typeof value.displayName === 'string' && Number.isInteger(value.roomCount) && value.roomCount >= 0; }
  function safeOnlineHouse(value) { return safeHouse(value) && value.online && Number.isInteger(value.online.count) && value.online.count >= 1 && value.online.count <= 8 && typeof value.online.hostOnline === 'boolean' && Array.isArray(value.online.displayNames) && value.online.displayNames.length === value.online.count && value.online.displayNames.every(function (name) { return typeof name === 'string' && [...name].length >= 1 && [...name].length <= 24 && !/[\x00-\x1f\x7f]/.test(name); }); }
  // 冷启动会先恢复本机账号名，此时Cookie会话尚未确认，不能把它当成已登录请求。
  function canReadMine(s) { return signed(s) && !s.busy && !['offline', 'other_tab', 'error', 'incompatible'].includes(s.phase); }
  function canWatchHome() { var s = cloud(); return signed(s) && !['offline', 'other_tab'].includes(s.phase) && !!publication; }
  function canRefreshOnline() { return ((opened && mode === 'list') || canWatchHome()) && pageActive && !document.hidden && cloud().available; }
  function homePresence() {
    var own = canWatchHome() && onlineHouses.find(function (value) { return value.id === publication.id; }), fresh = !!own && onlineLoaded && !onlineStale && pageActive && !document.hidden;
    return { count: fresh ? Math.max(0, own.online.count - (own.online.hostOnline ? 1 : 0)) : 0, displayNames: fresh ? own.online.displayNames.slice() : [], href: fresh ? prefix + '/visit/' + own.id + (own.online.count < 8 ? '#join' : '') : '', full: fresh && own.online.count >= 8, stale: !!own && !fresh };
  }
  function notifyHome() {
    var key = JSON.stringify(homePresence()); if (key === presenceKey) return; presenceKey = key;
    if (G.bus && G.bus.emit) G.bus.emit('neighbors:presence');
  }
  function pauseOnline() {
    if (onlineTimer !== null && typeof clearTimeout === 'function') clearTimeout(onlineTimer);
    onlineTimer = null; onlineActive = false; onlineGeneration++; onlineTicket++; loadingOnline = false;
    if (onlineLoaded) onlineStale = true;
    notifyHome();
  }
  function scheduleOnline() {
    if (onlineTimer !== null && typeof clearTimeout === 'function') clearTimeout(onlineTimer);
    onlineTimer = null;
    if (!canRefreshOnline() || typeof setTimeout !== 'function') return;
    onlineTimer = setTimeout(function () { onlineTimer = null; loadOnline(); }, 10000);
  }
  async function loadOnline() {
    if (!canRefreshOnline() || loadingOnline || !G.cloud.requestPublic) return;
    if (onlineTimer !== null && typeof clearTimeout === 'function') clearTimeout(onlineTimer); onlineTimer = null;
    var at = context, generation = onlineGeneration, ticket = ++onlineTicket; loadingOnline = true; onlineError = ''; paint();
    try {
      var data = await G.cloud.requestPublic('/neighbors/online');
      if (at !== context || generation !== onlineGeneration || ticket !== onlineTicket || !canRefreshOnline()) return;
      if (!data || !Array.isArray(data.houses) || data.houses.length > 64 || !data.houses.every(safeOnlineHouse) || new Set(data.houses.map(function (value) { return value.id; })).size !== data.houses.length) throw new Error('在线名单暂时没有完整读出，请刷新重试。');
      onlineHouses = data.houses; onlineLoaded = true; onlineStale = false;
    } catch (error) {
      if (at === context && generation === onlineGeneration && ticket === onlineTicket) { onlineError = message(error, '在线状态暂时无法更新，请刷新重试。'); onlineStale = true; }
    } finally {
      if (at === context && generation === onlineGeneration && ticket === onlineTicket) { loadingOnline = false; paint(); scheduleOnline(); }
    }
  }
  function onlineLifecycle(force) {
    if (!canRefreshOnline()) { if (onlineActive || onlineTimer !== null || loadingOnline) pauseOnline(); return; }
    if (!onlineActive) { onlineActive = true; onlineGeneration++; loadOnline(); }
    else if (force) loadOnline();
  }
  function setFeedback(value, error) { feedback = value || ''; feedbackError = !!error; paint(); }
  function syncOwner() {
    var id = currentOwner(cloud()); if (id === owner) return false;
    pauseOnline(); onlineHouses = []; onlineLoaded = false; onlineError = ''; onlineStale = false;
    owner = id; context++; listTicket++; mineTicket++; operation++; working = ''; loadingList = false; loadingMine = false; mineEligible = false;
    publication = null; mineResolved = !id; mineError = ''; feedback = ''; loaded = false; listError = ''; houses = []; nextCursor = null; titleDirty = false; nameDirty = false;
    notifyHome();
    if (body) { nodes.title.value = G.state && G.state.house && G.state.house.name || '我的小屋'; nodes.displayName.value = '小小建筑师'; }
    return true;
  }
  async function loadMine() {
    var s = cloud(); if (!canReadMine(s) || loadingMine || working || !G.cloud.requestAccount) return;
    var at = context, ticket = ++mineTicket; loadingMine = true; mineError = ''; paint();
    try {
      var data = await G.cloud.requestAccount('/my-publication', 'GET');
      if (at !== context || ticket !== mineTicket || currentOwner(cloud()) !== owner) return;
      if (data.publication !== null && !safeHouse(data.publication)) throw new Error('公开小屋资料暂时没有完整读出，请刷新重试。');
      publication = data.publication; mineResolved = true;
      if (publication && body) { if (!titleDirty) nodes.title.value = publication.title; if (!nameDirty) nodes.displayName.value = publication.displayName; }
    } catch (error) { if (at === context && ticket === mineTicket) mineError = message(error, '暂时没有读到自己的公开状态，请重试。'); }
    finally { if (at === context && ticket === mineTicket) { loadingMine = false; paint(); onlineLifecycle(); } }
  }
  async function loadList(more) {
    if (!cloud().available || loadingList || !G.cloud.requestPublic) return;
    var cursor = more ? nextCursor : null; if (more && !cursor) return;
    var at = context, ticket = ++listTicket; loadingList = true; listError = ''; paint();
    try {
      var data = await G.cloud.requestPublic('/neighbors' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''));
      if (at !== context || ticket !== listTicket) return;
      if (!data || !Array.isArray(data.houses) || !data.houses.every(safeHouse) || !(data.nextCursor === null || typeof data.nextCursor === 'string')) throw new Error('邻居名单暂时没有完整读出，请刷新重试。');
      var merged = new Map((more ? houses : []).map(function (value) { return [value.id, value]; })); data.houses.forEach(function (value) { merged.set(value.id, value); });
      houses = Array.from(merged.values()); nextCursor = data.nextCursor; loaded = true;
    } catch (error) { if (at === context && ticket === listTicket) listError = message(error, '暂时连不上邻居名单，本机小屋仍可继续玩。'); }
    finally { if (at === context && ticket === listTicket) { loadingList = false; paint(); } }
  }
  function refresh() { syncOwner(); loadList(false); loadMine(); onlineLifecycle(true); }
  function switchMode(value) { mode = value; feedback = ''; onlineLifecycle(); paint(); if (value === 'mine' && !mineResolved) loadMine(); }
  function draft() {
    var title = nodes.title.value.trim(), displayName = nodes.displayName.value.trim();
    for (var pair of [[nodes.title, title, '公开小屋名'], [nodes.displayName, displayName, '展示昵称']]) {
      if (!pair[1] || [...pair[1]].length > 24 || /[\x00-\x1f\x7f]/.test(pair[1])) { pair[0].setAttribute('aria-invalid', 'true'); pair[0].focus(); setFeedback(pair[2] + '请写1～24个字，不要换行。', true); return null; }
    }
    return { title: title, displayName: displayName };
  }
  async function publish(event) {
    if (event) event.preventDefault(); var before = cloud(), id = currentOwner(before); if (working || !publishable(before)) return;
    var values = draft(); if (!values) return;
    if (!ui.confirm || !await ui.confirm('公开“' + values.title + '”此刻的小屋外观、家具、形象和画作，展示称呼为“' + values.displayName + '”。能打开这个网站的人都可能参观。账号名、生日、相册和完整进度不会公开；之后你改了布置，公开的小屋会自动跟着更新；不想公开时可以随时撤下。', { title: publication ? '更新公开的小屋' : '让小朋友来参观', accept: publication ? '更新这个公开模样' : '公开这个模样', cancel: '先不公开' })) return;
    if (id !== currentOwner(cloud())) return;
    if (!publishable(cloud())) { setFeedback('当前小屋状态有了变化，请重新确认。', true); return; }
    var at = context, ticket = ++operation; ++mineTicket; loadingMine = false; working = 'publish'; feedback = ''; paint();
    try {
      var result = await G.cloud.syncNow();
      if (at !== context || ticket !== operation || id !== currentOwner(cloud())) return;
      var s = cloud(); if (!result || !result.ok) throw new Error(result && result.message || '先把自己的进度同步好，再公开小屋。');
      if (!s.binding || s.phase !== 'ready' || s.dirty || s.restoreRequired || s.readOnly || !s.remote || !Number.isInteger(s.remote.revision)) throw new Error('小屋刚有新变化，请先同步并选好进度，再公开。');
      var data = await G.cloud.requestAccount('/my-publication', 'POST', { title: values.title, displayName: values.displayName, expectedRevision: s.remote.revision });
      if (at !== context || ticket !== operation || id !== currentOwner(cloud())) return;
      if (!safeHouse(data.publication)) throw new Error('公开结果暂时没有完整读出，请刷新公开状态确认。');
      publication = data.publication; onlineHouses = onlineHouses.filter(function (value) { return value.id !== publication.id; }); mineResolved = true; mineError = ''; titleDirty = false; nameDirty = false; feedback = '这个公开模样已收好，小朋友可以来参观了。'; feedbackError = false; if (G.bus && G.bus.emit) G.bus.emit('neighbors:published', {});
    } catch (error) { if (at === context && ticket === operation) { feedback = error && error.status === 412 ? '账号里的小屋刚有变化。先同步并确认进度，再更新公开模样。' : message(error, '这次没有公开成功，请保留页面后重试。'); feedbackError = true; } }
    finally { if (at === context && ticket === operation) { working = ''; paint(); onlineLifecycle(true); } }
  }
  async function unpublish() {
    var s = cloud(), id = currentOwner(s), previous = publication; if (working || !previous || !signed(s) || s.readOnly || s.busy) return;
    if (!ui.confirm || !await ui.confirm('撤下“' + previous.title + '”并设为不公开后，其他人不能再从邻居名单或原链接获取这个公开模样。自己的小屋和进度仍然保留，想公开时随时可以重新公开。', { title: '撤下公开的小屋', accept: '撤下这个公开模样', cancel: '继续公开', danger: true })) return;
    if (id !== currentOwner(cloud())) return;
    if (!publication || previous.id !== publication.id || cloud().readOnly || cloud().busy) { setFeedback('当前公开状态有了变化，请重新看看。', true); return; }
    var at = context, ticket = ++operation; ++mineTicket; loadingMine = false; working = 'unpublish'; feedback = ''; paint();
    try {
      var data = await G.cloud.requestAccount('/my-publication', 'DELETE', {});
      if (at !== context || ticket !== operation || id !== currentOwner(cloud())) return;
      if (!data || !data.ok) throw new Error('撤下结果暂时没有确认，请刷新公开状态。');
      houses = houses.filter(function (value) { return value.id !== previous.id; }); onlineHouses = onlineHouses.filter(function (value) { return value.id !== previous.id; }); publication = null; mineResolved = true; feedback = '已撤下公开模样，自己的小屋进度还在。'; feedbackError = false;
    } catch (error) { if (at === context && ticket === operation) { feedback = message(error, '这次没有撤下成功，请稍后重试。'); feedbackError = true; } }
    finally { if (at === context && ticket === operation) { working = ''; paint(); onlineLifecycle(); } }
  }
  function input(label, name, fallback) {
    var node = el('input', 'ui-input'); node.type = 'text'; node.name = name; node.maxLength = 48; node.value = fallback; node.dataset.uiFocus = name;
    var wrapper = el('label', 'neighbors-field', label), hint = el('span', 'ui-small ui-muted', '1～24个字，只会公开这里填写的文字。'); hint.id = name + '-hint'; node.setAttribute('aria-describedby', hint.id);
    node.addEventListener('input', function () { node.removeAttribute('aria-invalid'); if (name === 'public-title') titleDirty = true; else nameDirty = true; }); append(wrapper, node, hint); return { wrapper: wrapper, node: node };
  }
  function build() {
    body = el('div', 'ui-stack neighbors-panel');
    nodes.listTab = button('邻居小屋', function () { switchMode('list'); }, 'ui-tab'); nodes.mineTab = button('公开我的小屋', function () { switchMode('mine'); }, 'ui-tab');
    var tabs = append(el('div', 'ui-tabs neighbors-tabs'), nodes.listTab, nodes.mineTab); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', '邻居与我的公开小屋');
    nodes.feedback = el('p', 'neighbors-feedback'); nodes.feedback.setAttribute('aria-live', 'polite');
    nodes.list = el('section', 'ui-stack neighbors-list-section'); nodes.listStatus = el('p', 'ui-small ui-muted'); nodes.listStatus.setAttribute('role', 'status');
    nodes.refresh = button('刷新邻居', refresh, 'ui-button-soft'); nodes.rows = el('div', 'neighbors-list'); nodes.rows.setAttribute('role', 'list'); nodes.more = button('再看看更多小屋', function () { loadList(true); }, 'ui-button-soft');
    nodes.onlineSection = el('section', 'ui-stack neighbors-online-section'); nodes.onlineSection.setAttribute('aria-label', '正在串门的小朋友');
    nodes.onlineStatus = el('p', 'ui-small ui-muted neighbors-online-status'); nodes.onlineStatus.setAttribute('role', 'status'); nodes.onlineRows = el('div', 'neighbors-list neighbors-online-list'); nodes.onlineRows.setAttribute('role', 'list');
    append(nodes.onlineSection, el('h3', 'neighbors-section-title', '正在一起玩'), nodes.onlineStatus, nodes.onlineRows);
    append(nodes.list, append(el('div', 'neighbors-list-heading'), el('p', '', '先找在线的小朋友一起玩'), nodes.refresh), nodes.onlineSection, el('h3', 'neighbors-section-title', '其他公开小屋'), nodes.listStatus, nodes.rows, nodes.more);
    nodes.mine = el('section', 'ui-stack neighbors-mine'); nodes.guest = el('div', 'ui-stack'); nodes.guest.append(el('p', '', '登录并关联自己的小屋后，小屋默认对小伙伴们公开，也可以随时设为不公开。不登录也能直接参观邻居。'));
    nodes.login = button('登录 / 注册', function () { if (ui.cloudAccount) ui.cloudAccount.open(); }, 'ui-button-primary'); nodes.guest.append(nodes.login);
    nodes.myStatus = el('p', 'neighbors-my-status'); nodes.myStatus.setAttribute('role', 'status'); nodes.myPreview = el('div', 'neighbors-my-preview');
    nodes.reloadMine = button('刷新公开状态', function () { loadMine(); }, 'ui-button-soft');
    nodes.form = el('form', 'ui-stack neighbors-form'); nodes.form.noValidate = true;
    var title = input('公开小屋名', 'public-title', publication && publication.title || G.state && G.state.house && G.state.house.name || '我的小屋'), displayName = input('展示昵称', 'public-display-name', publication && publication.displayName || '小小建筑师'); nodes.title = title.node; nodes.displayName = displayName.node;
    nodes.publish = el('button', 'ui-button ui-button-primary'); nodes.publish.type = 'submit'; nodes.unpublish = button('撤下公开模样', unpublish, 'ui-button-soft');
    nodes.gate = el('p', 'ui-small ui-muted neighbors-gate');
    append(nodes.form, title.wrapper, displayName.wrapper, el('p', 'ui-small ui-muted neighbors-disclosure', '每个小朋友的小屋默认公开，也可以不公开。会公开这里的展示称呼，以及此刻的小屋外观、家具、形象和画作。账号名、生日、相册和完整进度不会公开。能打开这个网站的人都可能参观；之后你改了布置，公开的小屋会自动跟着更新；不想公开时可以随时撤下。'), nodes.gate, append(el('div', 'ui-actions'), nodes.publish, nodes.unpublish));
    nodes.form.addEventListener('submit', publish); append(nodes.mine, nodes.guest, nodes.myStatus, nodes.myPreview, nodes.reloadMine, nodes.form, ui.reception && ui.reception.section ? ui.reception.section() : null); append(body, tabs, nodes.feedback, nodes.list, nodes.mine);
  }
  function ordinaryHouses() { var liveIds = new Set(onlineHouses.map(function (value) { return value.id; })); return houses.filter(function (value) { return (!publication || value.id !== publication.id) && !liveIds.has(value.id); }); }
  function within(node, parent) { for (var current = node; current; current = current.parentElement) if (current === parent) return true; return false; }
  function rowFor(value, online) {
    var row = rowCache.get(value.id);
    if (!row) {
      var node = el('article', 'neighbors-row'); node.setAttribute('role', 'listitem'); node.dataset.houseId = value.id;
      var info = el('div', 'neighbors-row-info'), heading = el('h3'), author = el('p', 'neighbors-row-author'), badge = el('span', 'neighbors-presence'), names = el('p', 'neighbors-online-names'), host = el('p', 'ui-small ui-muted'), own = el('p', 'neighbors-own-note'), updated = el('p', 'ui-small ui-muted'), link = visitLink(value);
      append(info, heading, author, badge, names, host, own, updated); append(node, info, link);
      row = { node: node, heading: heading, author: author, badge: badge, names: names, host: host, own: own, updated: updated, link: link }; rowCache.set(value.id, row);
    }
    var fresh = !!online && !onlineStale, full = fresh && value.online.count >= 8, quick = fresh && !full;
    row.node.classList.toggle('neighbors-online-row', !!online); row.node.classList.toggle('is-stale', !!online && onlineStale);
    row.heading.textContent = value.title; row.author.textContent = value.displayName + ' · ' + value.roomCount + '间房';
    row.badge.classList.toggle('is-online', fresh); row.badge.textContent = online ? onlineStale ? '上次有' + value.online.count + '位在玩' : value.online.count + '位在线' + (full ? ' · 小屋满员' : '') : onlineLoaded && !onlineStale ? '暂时没人串门' : '在线状态待确认';
    row.names.textContent = online ? (onlineStale ? '上次在这里玩：' : '正在这里玩：') + value.online.displayNames.join('、') : ''; hide(row.names, !online);
    row.host.textContent = online ? onlineStale ? '' : value.online.hostOnline ? '屋主也在这里' : '屋主暂时不在，小伙伴们在玩' : ''; hide(row.host, !online || onlineStale);
    var isOwn = !!online && publication && value.id === publication.id; row.own.textContent = isOwn ? value.online.count > (value.online.hostOnline ? 1 : 0) ? '我家有小伙伴' : '我的公开小屋' : ''; hide(row.own, !isOwn);
    row.updated.textContent = date(value.updatedAt) ? '公开于 ' + date(value.updatedAt) : '刚刚公开'; hide(row.updated, !!online);
    row.link.textContent = quick ? '敲门串门' : '路过看看'; row.link.href = prefix + '/visit/' + value.id + (quick ? '#join' : '');
    bindVisit(row.link, value.id, quick); row.link.classList.toggle('ui-button-primary', quick); row.link.classList.toggle('ui-button-soft', !quick);
    row.link.setAttribute('aria-label', (quick ? '进入“' : '参观“') + value.title + '”' + (quick ? '和在线小朋友聊天' : full ? '，小屋当前满员' : '') + '，将在新页面打开');
    return row;
  }
  function paintRows() {
    var focused = document.activeElement, keep = new Set(), ordinary = signed(cloud()) && loadingMine && !mineResolved ? [] : ordinaryHouses();
    function place(values, parent, online) {
      values.forEach(function (value, index) { var row = rowFor(value, online); keep.add(value.id); if (parent.children[index] !== row.node) parent.insertBefore(row.node, parent.children[index] || null); });
    }
    place(onlineHouses, nodes.onlineRows, true); place(ordinary, nodes.rows, false);
    rowCache.forEach(function (row, id) { if (!keep.has(id)) { if (row.node.parentElement) row.node.parentElement.removeChild(row.node); rowCache.delete(id); } });
    // 定时变化可能令小屋移到在线区；保留已经选中的链接，不抢发布表单焦点。
    if (focused && document.activeElement !== focused && within(focused, nodes.list) && typeof focused.focus === 'function') focused.focus({ preventScroll: true });
  }
  function paint() {
    notifyHome();
    if (!body) return; var s = cloud(), logged = signed(s), busy = !!working;
    nodes.listTab.classList.toggle('is-active', mode === 'list'); nodes.mineTab.classList.toggle('is-active', mode === 'mine'); nodes.listTab.setAttribute('aria-pressed', String(mode === 'list')); nodes.mineTab.setAttribute('aria-pressed', String(mode === 'mine'));
    hide(nodes.list, mode !== 'list'); hide(nodes.mine, mode !== 'mine');
    nodes.feedback.textContent = feedback; nodes.feedback.setAttribute('role', feedbackError ? 'alert' : 'status'); hide(nodes.feedback, !feedback);
    var others = ordinaryHouses();
    nodes.onlineStatus.textContent = !s.available ? '到网站入口后，才能看看谁正在串门。' : onlineError ? onlineHouses.length ? '在线状态暂时无法更新，下面是上次看到的情况。请刷新重试。' : '在线状态暂时无法更新，请刷新重试。' : !onlineLoaded ? '正在看看谁在串门…' : onlineStale ? '正在重新确认在线状态…' : onlineHouses.length ? '登录后以已有公开称呼加入聊天；没有时用「小小建筑师」。' : '暂时没人串门，可以先逛逛其他公开的小屋。';
    nodes.listStatus.textContent = !s.available ? '离线文件版暂时不能读取邻居。到网站入口后可以参观，本机小屋仍可继续玩。' : listError || (logged && loadingMine && !mineResolved ? '正在确认自己的公开状态，再展示邻居…' : loadingList && !loaded ? '正在看看小朋友公开的小屋…' : loadingList ? '正在更新公开小屋…' : !loaded ? '打开后会读取已公开的小屋。' : others.length ? '布置只能参观，不能改动；在线的小朋友会排在上面。' : onlineHouses.length ? '正在一起玩的小屋已经放在上面了。' : '还没有其他小朋友公开小屋。可以先布置自己的，再主动公开一个模样。');
    nodes.refresh.disabled = !s.available || loadingList || loadingOnline || busy; nodes.more.disabled = loadingList || busy; hide(nodes.more, !nextCursor); paintRows();
    hide(nodes.guest, logged); hide(nodes.form, !logged); hide(nodes.reloadMine, !logged); hide(nodes.myStatus, !logged); hide(nodes.myPreview, !logged || !publication);
    nodes.myStatus.textContent = mineError || (loadingMine ? '正在确认自己的公开状态…' : publication ? '正在公开“' + publication.title + '”（每个小朋友的小屋默认都是公开的，可以撤下不公开）' + (date(publication.updatedAt) ? ' · ' + date(publication.updatedAt) : '') + '。有人来串门时，主界面会提醒；点击接待朋友就能走动和聊天。' : '自己的小屋已设为不公开，只有你能继续自己的进度。可以随时重新公开。');
    var previewKey = publication ? publication.id + ':' + publication.updatedAt : ''; if (nodes.myPreview.dataset.publication !== previewKey) { nodes.myPreview.dataset.publication = previewKey; nodes.myPreview.replaceChildren(); if (publication) nodes.myPreview.append(visitLink(publication, '接待朋友，一起玩'), visitLink(publication, '看看公开模样')); }
    nodes.gate.textContent = !s.available ? '请到网站入口登录后再公开。' : !logged ? '' : s.restoreRequired ? '先恢复完整的小屋，临时空屋不能公开。' : s.readOnly ? '这页目前只读，请先到账号面板选择在此页继续。' : !s.binding ? '先在账号面板关联自己的小屋，再公开。' : s.phase === 'conflict' ? '先在账号面板选好要继续的进度，再公开。' : s.phase === 'offline' ? '恢复连接并同步自己的进度后，再公开。' : s.phase === 'incompatible' ? '先保存JSON备份并更新页面，再公开。' : publication ? '每个小朋友的小屋默认公开；改动布置后公开的小屋会自动跟着更新，也可以随时撤下设为不公开。' : '确认后会先同步自己的进度，再公开这个模样。';
    nodes.publish.textContent = working === 'publish' ? '正在保存公开模样…' : publication ? '更新公开模样' : '公开这个模样'; nodes.publish.disabled = busy || !publishable(s); nodes.unpublish.disabled = busy || s.readOnly || s.busy || !logged; hide(nodes.unpublish, !publication);
    nodes.reloadMine.disabled = busy || loadingMine || s.busy; nodes.title.readOnly = busy; nodes.displayName.readOnly = busy;
  }
  function onCloud() {
    var changed = syncOwner(), s = cloud(), eligible = canReadMine(s);
    // 会话恢复或同步完成后，即使仍是同一账号，也允许补做第一次公开状态读取。
    if (eligible && !mineEligible && !mineResolved) mineError = ''; mineEligible = eligible;
    paint(); if (s.available && pageActive && !document.hidden) { if (opened && changed) loadList(false); if (!mineResolved && !mineError) loadMine(); } onlineLifecycle();
  }
  var api = {
    init: function () { if (initialized) return; initialized = true; if (G.bus && G.bus.on) G.bus.on('cloud:change', onCloud); if (document.addEventListener) document.addEventListener('visibilitychange', function () { onCloud(); }); if (window.addEventListener) { window.addEventListener('pagehide', function () { pageActive = false; pauseOnline(); }); window.addEventListener('pageshow', function () { pageActive = true; onCloud(); }); } onCloud(); },
    panel: function () { if (!body) build(); api.init(); syncOwner(); opened = true; paint(); if (ui.reception && ui.reception.refresh) ui.reception.refresh(); if (cloud().available) { if (!loaded && !loadingList && !listError) loadList(false); if (!mineResolved && !loadingMine && !mineError) loadMine(); } onlineLifecycle(); return { title: '邻居小屋', subtitle: '找在线的小朋友一起玩', content: body }; },
    open: function () { mode = 'list'; if (typeof ui.open === 'function') ui.open('neighbors'); },
    close: function () { opened = false; onlineLifecycle(); },
    refresh: refresh,
    homePresence: homePresence,
    bindVisit: bindVisit,
    visitUrl: function (id, join) { return idPattern.test(id) ? prefix + '/visit/' + id + (join ? '#join' : '') : ''; },
    ownId: function () { return publication ? publication.id : ''; },
    status: function () { return { mode: mode, loading: loadingList || loadingMine || loadingOnline, published: !!publication, houseCount: houses.length, onlineHouseCount: onlineHouses.length, onlineStale: onlineStale }; }
  };
  G.neighbors = api; ui.neighbors = api;
})(window.Game);
