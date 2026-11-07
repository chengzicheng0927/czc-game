/* 屋主在主游戏页与访客同屋：加入自己的公开小屋、显示同屋的人、方向键/点地面走动、同屋聊天。
   全程只读：不写存档、不动租约，会话结束即清理；访客看到的是屋主上次公开的布置。 */
(function (G) {
  'use strict';
  var ui = G.ui = G.ui || {}, active = false, joining = false, kit = null, unsubscribe = null;
  function el(tag, className, text) { var node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function toast(text) { if (ui.toast) ui.toast(text); }
  function ownId() { return G.neighbors && G.neighbors.ownId ? G.neighbors.ownId() : ''; }
  function me(state) { return (state.peers || []).find(function (peer) { return peer.id === state.peerId; }) || null; }
  function connected(state) { return !!state.peerId && ['connected', 'reconnecting'].includes(state.phase); }

  // 同屋会话共用的小工具箱（屋主接待 hostRoom 与主场景串门 visitSession 共用）：
  // 面板挂载、同屋的人交给主场景、方向键步进、收尾清理。只读，不写存档、不发其它请求。
  // opts：title（面板标题）、label（无障碍名称）、className（附加样式类）。
  function createKit(opts) {
    opts = opts || {}; var panel = null, widget = null;
    var api = {
      // 连上后把同屋的人交给主场景重画；返回是否已连上。
      sync: function (state) {
        if (!connected(state)) return false;
        G.livePeers.set(state.peers, state.peerId, state.messages); if (G.render && G.render.redraw) G.render.redraw(); return true;
      },
      // config：houseId、onState、quickJoin、onKnockResult（后两项可选，透传给 liveRoom）。
      mount: function (config) {
        if (panel) return;
        panel = el('aside', 'host-room' + (opts.className ? ' ' + opts.className : '')); panel.setAttribute('aria-label', opts.label || '和朋友同屋');
        var slot = el('div', 'host-room-slot'); panel.append(el('p', 'host-room-title', opts.title || '朋友来做客啦'), slot); document.body.append(panel);
        widget = G.ui.liveRoom.mount(slot, { houseId: config.houseId, onState: config.onState, onMove: api.direction, quickJoin: config.quickJoin, onKnockResult: config.onKnockResult });
      },
      mounted: function () { return !!panel; },
      direction: function (name) {
        var state = G.live.status(), self = me(state); if (!self || state.phase !== 'connected') return;
        var step = .08, x = self.x + (name === 'left' ? -step : name === 'right' ? step : 0), y = self.y + (name === 'up' ? -step : name === 'down' ? step : 0);
        var source = G.runtime && G.runtime.visit && G.runtime.visit.active ? G.runtime.visit.state : G.state;
        if (!source || !G.liveSpace) return;
        var point = G.liveSpace.position(source, { zone: self.zone, x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) });
        var destination = point && G.liveSpace.destination(source, point, point.floorId);
        if (destination) G.live.move(destination.zone, destination.x, destination.y);
      },
      // 卸载面板；clearPeers 为真时同时清掉主场景里的同屋人物并重画。
      release: function (clearPeers) {
        if (widget) { var w = widget; widget = null; try { w.destroy(); } catch (_) {} }
        if (panel) { panel.remove(); panel = null; }
        if (clearPeers !== false) { if (G.livePeers) G.livePeers.clear(); if (G.render && G.render.redraw) G.render.redraw(); }
      }
    };
    return api;
  }
  G.roomKit = { create: createKit };
  function getKit() { return kit || (kit = createKit({ title: '朋友来做客啦', label: '和朋友同屋' })); }

  function onState(state) {
    if (!active && !joining) return;
    if (connected(state)) getKit().sync(state);
    else if (['left', 'error', 'idle'].includes(state.phase) && active) end(state.phase === 'error' ? state.error : '');
  }
  function end(message) {
    active = false; joining = false;
    getKit().release(false);
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    if (G.livePeers) G.livePeers.clear(); if (G.render && G.render.redraw) G.render.redraw();
    if (message) toast(message);
  }
  // 屋主同意朋友后进入自己的公开小屋，站在正在看的房间里（没有选中房间就在前院）。
  async function enter() {
    if (active || joining) return { ok: true }; var id = ownId();
    if (!id || !G.live || !G.livePeers || !G.ui.liveRoom) return { ok: false, message: '先公开自己的小屋，朋友才能进来。' };
    // 同一账号不能同时在两个房子里：先结束进行中的串门（含敲门等待）。
    if (G.visitSession && G.visitSession.leave) G.visitSession.leave();
    joining = true; unsubscribe = G.live.subscribe(onState);
    var result = await G.live.quickJoin(id);
    if (!result.ok) { joining = false; if (unsubscribe) { unsubscribe(); unsubscribe = null; } toast(result.message || '这次没能进入小屋，请稍后再试。'); return result; }
    joining = false; active = true; getKit().mount({ houseId: id, onState: onState }); onState(G.live.status());
    var room = G.contentSpaces && G.contentSpaces.get(G.runtime && G.runtime.activeRoomId);
    if (room && G.liveSpace) {
      // 凹形或带庭院的空间中心可能落在室外，先由只读映射找到合法落点。
      var point = G.liveSpace.position(G.state, { zone: room.spaceId, x: .5, y: .5 });
      var destination = point && G.liveSpace.destination(G.state, point, room.floorId);
      if (destination) G.live.move(destination.zone, destination.x, destination.y);
    }
    return { ok: true };
  }
  // 点空地面走过去；只有同屋会话中才接管点击，其余时候点击行为完全不变。
  function walkTo(point) {
    if (!active || !G.liveSpace || !G.state) return false;
    var view = G.render && G.render.getHouseView && G.render.getHouseView();
    var destination = G.liveSpace.destination(G.state, point, view && view.floor); if (!destination) return false;
    G.live.move(destination.zone, destination.x, destination.y); return true;
  }
  G.hostRoom = { enter: enter, leave: function () { if (active || joining) { G.live.leave(); end(''); } }, walkTo: walkTo, active: function () { return active; } };
})(window.Game = window.Game || {});
