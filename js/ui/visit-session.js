/* 主场景串门：去别人家时，主场景直接切换为对方的公开小屋（只读），自己的存档、规则和同步原样保留。
   - 路过（passerby）：只读公开快照，不建会话、不发心跳，主人不会知道。
   - 串门（live）：先敲门，屋主同意并连上后才切换场景；同屋的人经 G.livePeers 画在主场景里。
   敲门等待期间留在自己家（active() 为假）；婉拒、不在家、没回应、取消、被请离、掉线都回到自己的小屋并提示。
   主页面 G.state 永远是玩家自己的存档，这里只写 G.runtime.visit，并通过 G.render.visit.set 交给渲染层。 */
(function (G) {
  'use strict';
  var ui = G.ui = G.ui || {};
  var idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // 串门中会改动自己小屋的面板：一律先回家再装扮；neighbors、账号、换装、设置、回忆、帮助放行。
  var blocked = ['build', 'decor', 'yard', 'exterior', 'houseDesign', 'roomLayout', 'shop', 'garden', 'residents', 'crafting', 'play', 'quests', 'collection', 'observatory'];
  // phase：idle 在自己家 / loading 读取快照 / passerby 路过 / knocking 敲门等待 / live 同屋串门 / leaving 正在回家
  var phase = 'idle', ticket = 0, committed = false, houseId = '', wantMode = 'passerby';
  var visitState = null, meta = { title: '', ownerDisplayName: '' }, loadedUpdatedAt = null, loadedHouseVersion = '';
  var kit = null, banner = null, bannerNodes = null, refreshTimer = null, refreshing = false;
  var liveUsed = false, everConnected = false, mounting = false, muteLive = false;

  function el(tag, className, text) { var node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function toast(text) { if (text && ui.toast) ui.toast(text); }
  function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.keys(value).forEach(function (key) { freeze(value[key]); }); Object.freeze(value); } return value; }
  function redraw() { if (G.render && G.render.redraw) G.render.redraw(); }
  function cloudStatus() { try { return G.cloud && G.cloud.status ? G.cloud.status() || {} : {}; } catch (_) { return {}; } }
  function signedIn() { var s = cloudStatus(); return !!(s.available && s.account && s.phase !== 'expired'); }
  function ownId() { return G.neighbors && G.neighbors.ownId ? G.neighbors.ownId() : ''; }

  // 需要主场景串门渲染接口、同源公开读取，且不是 file 入口；否则入口回落旧的 /visit/<id> 页。
  function available() {
    return !!(G.render && G.render.visit && typeof G.render.visit.set === 'function' && G.cloud && typeof G.cloud.requestPublic === 'function' &&
      G.publicHouse && typeof G.publicHouse.materialize === 'function' && G.roomKit && cloudStatus().available);
  }
  function active() { return committed; }
  function blocks(name) { return blocked.indexOf(name) >= 0; }
  function loadMessage(error) {
    return error && error.status === 404 ? '主人可能已撤下这次公开，看看其他小屋吧。' : '暂时没有载入成功。请检查连接后再试，或先留在自己的小屋。';
  }

  // ——— 横幅：正在谁家 + 回自己的小屋 ———
  function removeBanner() { if (banner) { banner.remove(); banner = null; bannerNodes = null; } }
  function paintBanner() {
    if (!committed) { removeBanner(); return; }
    if (!banner) {
      banner = el('div', 'visit-banner'); banner.setAttribute('role', 'status'); banner.setAttribute('aria-label', '正在串门');
      var copy = el('div', 'visit-banner-copy'), text = el('strong', 'visit-banner-text'), note = el('span', 'visit-banner-note'), knock = el('button', 'ui-button ui-button-soft visit-banner-knock'), home = el('button', 'ui-button ui-button-primary visit-banner-home', '回自己的小屋');
      knock.type = 'button'; home.type = 'button';
      knock.addEventListener('click', function () { knockFromBanner(); });
      home.addEventListener('click', function () { leave({ message: '已回到自己的小屋。' }); });
      copy.append(text, note); banner.append(copy, knock, home); document.body.append(banner);
      bannerNodes = { text: text, note: note, knock: knock };
    }
    var live = !!(G.runtime.visit && G.runtime.visit.mode === 'live'), name = meta.ownerDisplayName || '小小建筑师';
    bannerNodes.text.textContent = '正在' + name + '的小屋 · ' + (live ? '串门中' : '路过');
    bannerNodes.note.textContent = live ? '' : '路过：主人不会知道你来过';
    bannerNodes.knock.hidden = live; bannerNodes.knock.disabled = phase === 'knocking';
    bannerNodes.knock.textContent = phase === 'knocking' ? '正在敲门…' : '敲门串门';
  }
  function knockFromBanner() {
    if (phase !== 'passerby') return;
    if (!signedIn()) { toast('登录后才能敲门串门。'); if (ui.cloudAccount && ui.cloudAccount.open) ui.cloudAccount.open(); return; }
    enter(houseId, { mode: 'live' });
  }

  // ——— 快照读取与刷新（沿用旧参观页逻辑：版本号立即触发 + 页面可见时每20秒核对一次） ———
  async function loadSnapshot(id) {
    var response = await G.cloud.requestPublic('/public-houses/' + id);
    if (!response || !response.house || !response.snapshot) throw new Error('公开小屋的资料暂时不完整，请返回邻居列表。');
    return { state: freeze(G.publicHouse.materialize(response.snapshot)), house: response.house };
  }
  function apply(loaded) {
    visitState = loaded.state; loadedUpdatedAt = loaded.house.updatedAt;
    meta.title = String(loaded.house.title || loaded.state.house.name); meta.ownerDisplayName = String(loaded.house.displayName || '小小建筑师');
  }
  function clearRefresh() { if (refreshTimer !== null && typeof clearTimeout === 'function') clearTimeout(refreshTimer); refreshTimer = null; }
  function scheduleRefresh() {
    clearRefresh(); if (typeof setTimeout !== 'function') return;
    refreshTimer = setTimeout(function () { refreshTimer = null; if (!document.hidden) refreshSnapshot(); else scheduleRefresh(); }, 20000);
  }
  async function refreshSnapshot() {
    if (refreshing || !committed) return; refreshing = true; var mine = ticket;
    try {
      var response = await G.cloud.requestPublic('/public-houses/' + houseId);
      if (mine !== ticket || !committed || !response || !response.house || !response.snapshot || response.house.updatedAt === loadedUpdatedAt) return;
      apply({ state: freeze(G.publicHouse.materialize(response.snapshot)), house: response.house });
      G.runtime.visit.state = visitState; G.runtime.visit.title = meta.title; G.runtime.visit.ownerDisplayName = meta.ownerDisplayName;
      G.render.visit.set(visitState); paintBanner(); redraw();
    } catch (error) {
      // 主人撤下公开：优雅回家；其它读取失败保留当前画面，下次再核对。
      if (mine === ticket && error && error.status === 404) leave({ message: '主人把小屋撤下了，已回到自己的小屋。' });
    } finally { refreshing = false; if (mine === ticket && committed) scheduleRefresh(); }
  }

  // ——— 切换场景 ———
  // 第一次提交：切到对方小屋（路过或已连上的串门）；此后升级为 live 只改模式和自己的 peerId。
  function commit(peerId) {
    if (!committed) {
      if (ui.panel && typeof ui.panel.close === 'function') { try { ui.panel.close(); } catch (_) { /* 面板收不起来也不影响串门 */ } }
      committed = true;
      G.runtime.visit = { active: true, houseId: houseId, title: meta.title, ownerDisplayName: meta.ownerDisplayName, mode: 'passerby', selfPeerId: null, state: visitState };
      G.runtime.mode = 'visit'; G.runtime.placing = null; G.runtime.selected = null;
      G.render.visit.set(visitState); scheduleRefresh();
    }
    if (peerId) { G.runtime.visit.mode = 'live'; G.runtime.visit.selfPeerId = peerId; }
    paintBanner(); redraw();
  }

  // ——— 实时部分（只在 live 模式出现；路过完全不碰 G.live） ———
  function stopLive(keepalive) {
    if (!liveUsed) return;
    muteLive = true;
    try {
      if (G.live) { if (typeof G.live.cancelKnock === 'function') G.live.cancelKnock(); if (typeof G.live.leave === 'function') G.live.leave(!!keepalive); }
      if (kit) kit.release(true);
    } finally { muteLive = false; liveUsed = false; everConnected = false; }
  }
  // 敲门/加入失败：直接串门时整体回到自己家；路过中升级失败则留在路过。
  function failLive(message) {
    if (!committed) { leave({ message: message }); return; }
    stopLive(false); phase = 'passerby'; paintBanner(); toast(message);
  }
  function onKnockResult(result) {
    if (muteLive || phase !== 'knocking' || !result || result.ok) return;
    failLive(result.status === 'cancelled' ? '已取消敲门，留在自己的小屋。' : result.message || '这次没能进去，下次再来看看吧。');
  }
  function onLiveState(state) {
    if (mounting || muteLive || (phase !== 'knocking' && phase !== 'live') || !state) return;
    var inRoom = !!state.peerId && (state.phase === 'connected' || state.phase === 'reconnecting') && state.houseId === houseId;
    if (inRoom) {
      if (!everConnected) { everConnected = true; phase = 'live'; commit(state.peerId); }
      kit.sync(state);
      if (state.houseVersion && loadedHouseVersion && state.houseVersion !== loadedHouseVersion) refreshSnapshot();
      if (state.houseVersion) loadedHouseVersion = state.houseVersion;
      return;
    }
    if (!everConnected) {
      // 见到 connected 之前，初始的 idle/left 是正常的等待；只有真正的失败才退出。
      if (state.phase === 'error') failLive(state.error || '这次没能进去，先留在自己的小屋吧。');
      else if (state.phase === 'idle' && state.error) failLive(state.error);
      else if (state.phase === 'idle' && state.authenticated === false) failLive('先回自己的小屋登录，再来敲门串门。');
      return;
    }
    if (state.phase === 'error') leave({ message: state.error || '串门连接已结束，已回到自己的小屋。' });
    else if (state.phase === 'left' || state.phase === 'idle') leave({ message: '这次串门结束了，已回到自己的小屋。' });
  }
  function startLive() {
    if (!(G.live && G.livePeers && ui.liveRoom && G.roomKit)) {
      var message = '现在不能敲门串门，先路过看看吧。';
      if (!committed) commit(); else phase = 'passerby';
      toast(message); return { ok: false, message: message };
    }
    if (G.hostRoom && G.hostRoom.leave) G.hostRoom.leave();
    phase = 'knocking'; liveUsed = true; everConnected = false; loadedHouseVersion = '';
    kit = kit || G.roomKit.create({ title: '去串门啦', label: '串门同屋', className: 'visit-room' });
    mounting = true;
    try { kit.mount({ houseId: houseId, quickJoin: true, onState: onLiveState, onKnockResult: onKnockResult }); }
    catch (_) { mounting = false; failLive('这次没能打开串门，先留在自己的小屋吧。'); return { ok: false, message: '这次没能打开串门。' }; }
    mounting = false; paintBanner();
    return { ok: true, knocking: true };
  }

  // ——— 对外接口 ———
  // mode：'passerby'（默认，路过看看）或 'live'（敲门串门 / 快捷加入）。
  async function enter(id, opts) {
    opts = opts || {}; var wantLive = opts.mode === 'live';
    if (!idPattern.test(id || '')) return { ok: false, message: '请从公开小屋列表进入串门。' };
    if (!available()) return { ok: false, fallback: true, message: '这里暂时不能直接串门，请用新页面参观。' };
    // 自己的房子：接待朋友走屋主同屋，不经公开快照。
    if (wantLive && ownId() === id) return G.hostRoom && G.hostRoom.enter ? G.hostRoom.enter() : { ok: false, message: '先公开自己的小屋，朋友才能进来。' };
    if (wantLive && !signedIn()) { toast('登录后才能敲门串门，先路过看看吧。'); wantLive = false; }
    if (houseId === id && phase !== 'idle') {
      if (phase === 'passerby' && wantLive) return startLive();
      return { ok: true }; // 同一座小屋：正在读取、敲门、路过或串门，不重复进入
    }
    if (phase !== 'idle') leave({ silent: true });
    var mine = ++ticket; houseId = id; wantMode = wantLive ? 'live' : 'passerby'; phase = 'loading';
    var loaded;
    try { loaded = await loadSnapshot(id); }
    catch (error) {
      if (mine !== ticket) return { ok: false, cancelled: true };
      var message = loadMessage(error); leave({ silent: true }); toast(message); return { ok: false, message: message };
    }
    if (mine !== ticket) return { ok: false, cancelled: true };
    apply(loaded);
    if (G.hostRoom && G.hostRoom.leave) G.hostRoom.leave(); // 同一账号不能同时在两个房子里
    if (wantLive) return startLive();
    phase = 'passerby'; commit(); return { ok: true };
  }
  function leave(options) {
    options = options || {};
    if (phase === 'idle' && !committed) return { ok: true }; // 幂等
    var wasCommitted = committed; phase = 'leaving'; ticket++; clearRefresh(); refreshing = false;
    stopLive(!!options.keepalive); removeBanner();
    committed = false; G.runtime.visit = null; if (G.runtime.mode === 'visit') G.runtime.mode = 'explore';
    if (wasCommitted && G.render && G.render.visit) G.render.visit.set(null);
    if (G.livePeers && kit) G.livePeers.clear();
    redraw();
    houseId = ''; visitState = null; loadedUpdatedAt = null; loadedHouseVersion = ''; meta = { title: '', ownerDisplayName: '' }; phase = 'idle';
    if (options.message && !options.silent) toast(options.message);
    return { ok: true };
  }
  // 点空地面走过去：只有已连上的 live 串门才接管，用对方小屋的布局换算目的地。
  function walkTo(point) {
    var visit = G.runtime && G.runtime.visit;
    if (!committed || !visit || visit.mode !== 'live' || !visitState || !G.liveSpace || !G.live) return false;
    var view = G.render && G.render.getHouseView && G.render.getHouseView();
    var destination = G.liveSpace.destination(visitState, point, view && view.floor); if (!destination) return false;
    G.live.move(destination.zone, destination.x, destination.y); return true;
  }
  function state() {
    var visit = G.runtime && G.runtime.visit;
    return { phase: phase, active: committed, houseId: houseId, mode: visit ? visit.mode : wantMode, title: meta.title, ownerDisplayName: meta.ownerDisplayName, selfPeerId: visit ? visit.selfPeerId : null };
  }

  // 关页/切走时尽力退出（keepalive 让离开请求在页面卸载后仍能发出）。
  if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('pagehide', function () { if (phase !== 'idle' || committed) leave({ silent: true, keepalive: true }); });
  // 关闭面板会把 mode 重置为 explore；串门期间保持 visit，供渲染层与输入判断。
  if (G.bus && G.bus.on) G.bus.on('panel:change', function () { if (committed && G.runtime.mode !== 'visit') G.runtime.mode = 'visit'; });

  G.visitSession = { available: available, active: active, blocks: blocks, enter: enter, leave: leave, walkTo: walkTo, state: state };
})(window.Game = window.Game || {});
