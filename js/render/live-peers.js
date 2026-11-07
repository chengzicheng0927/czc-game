/* 主游戏页里的同屋小朋友：只读绘制。位置缓动、名牌配色、撞脸彩环与头顶发言气泡沿用参观页规则，不读写存档、不发网络请求。 */
(function (G) {
  'use strict';
  var actors = new Map(), bubbles = new Map(), bubbleTimer = null, selfId = null, marks = {};
  var clamp = function (n, low, high) { return Math.max(low, Math.min(high, n)); };
  function nowMs() { return typeof performance !== 'undefined' && performance.now ? performance.now() : (typeof Date !== 'undefined' && Date.now ? Date.now() : 0); }
  function scheduleBubbleExpiry(now) {
    if (bubbleTimer !== null && typeof clearTimeout === 'function') { clearTimeout(bubbleTimer); bubbleTimer = null; }
    if (!actors.size || typeof setTimeout !== 'function' || !G.liveAvatars || !G.liveAvatars.nextBubbleExpiry) return;
    var expiry = G.liveAvatars.nextBubbleExpiry(bubbles, now);
    if (expiry > now) bubbleTimer = setTimeout(function () { bubbleTimer = null; if (G.render && G.render.redraw) G.render.redraw(); }, Math.max(16, Math.ceil(expiry - now)));
  }
  function draw3DBubbles(world3d, c) {
    if (!actors.size || !world3d || !world3d.env || !Array.isArray(world3d.actors) || !G.liveAvatars || !G.liveAvatars.activeBubble || !G.liveAvatars.drawBubble) return;
    var now = nowMs(), env = world3d.env, left = env.offsetX || 0, top = env.offsetY || 0, items = [], placed = [];
    world3d.actors.forEach(function (actor) {
      if (!actor || actor.kind !== 'peer') return;
      var spoken = G.liveAvatars.activeBubble(bubbles, actor.id, now);
      if (!spoken) return;
      var p = actor.current || actor.p; if (!p) return;
      var q = world3d.project([p[0], p[1] + 1.5, p[2]]);
      if (!q || q.x < left - 150 || q.x > left + env.width + 150 || q.y < top || q.y > top + env.height) return;
      items.push({ id: actor.id, text: spoken, q: q });
    });
    // 靠前（画面更低）的人先占原位，后面的人气泡往上错开。
    items.sort(function (a, b) { return b.q.y - a.q.y; }).forEach(function (item) {
      var mark = marks[item.id] || { tone: ['#FFFDF8', '#DDC8D2'] };
      G.liveAvatars.drawBubble(c, item.text, item.q.x, item.q.y - 13, 12, mark, { left: left, top: top, width: env.width, height: env.height }, placed);
    });
  }
  function hookWorld3D() {
    var proto = G.World3D && G.World3D.prototype;
    if (!proto || proto.__liveBubbleHooked || typeof proto.drawLabels !== 'function') return;
    var original = proto.drawLabels;
    proto.drawLabels = function (c) {
      var result = original.apply(this, arguments);
      draw3DBubbles(this, c);
      return result;
    };
    proto.__liveBubbleHooked = true;
  }
  function set(peers, id, messages) {
    hookWorld3D();
    var now = nowMs(), list = (Array.isArray(peers) ? peers : []).filter(function (peer) { return peer && typeof peer.id === 'string'; }).slice(0, 8), keep = new Set();
    selfId = id || null; marks = G.liveAvatars && G.liveAvatars.markers ? G.liveAvatars.markers(list) : {};
    if (G.liveAvatars && G.liveAvatars.syncBubbles) G.liveAvatars.syncBubbles(bubbles, messages, now);
    list.forEach(function (peer) {
      keep.add(peer.id); var actor = actors.get(peer.id), target = { zone: peer.zone, x: peer.x, y: peer.y };
      if (!actor) actors.set(peer.id, { peer: peer, target: target, current: null, facing: 1 }); else { actor.peer = peer; actor.target = target; }
    });
    actors.forEach(function (_, key) { if (!keep.has(key)) { actors.delete(key); bubbles.delete(key); } });
    scheduleBubbleExpiry(now);
  }
  function clear() {
    if (bubbleTimer !== null && typeof clearTimeout === 'function') { clearTimeout(bubbleTimer); bubbleTimer = null; }
    actors.clear(); bubbles.clear(); selfId = null; marks = {};
  }
  function box(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function tag(c, actor, world, scale, now, placed) {
    var mark = marks[actor.peer.id] || { tone: ['#FFFDF8', '#DDC8D2'] }, mine = actor.peer.id === selfId, size = clamp(13 / scale, 13, 34), name = String(actor.peer.displayName || '小小建筑师'), chars = Array.from(name);
    c.save(); c.font = '600 ' + size + 'px "PingFang SC","Microsoft YaHei",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    while (chars.length > 1 && c.measureText(chars.join('') + '…').width > size * 9) chars.pop();
    var label = (chars.length < Array.from(name).length ? chars.join('') + '…' : name) + (mine ? ' · 我' : actor.peer.isHost ? ' · 主人' : ''), width = c.measureText(label).width + size, y = world.y - 165 * world.scale;
    box(c, world.x - width / 2, y - size * .8, width, size * 1.6, size * .55); c.fillStyle = mark.tone[0]; c.fill(); c.strokeStyle = mark.tone[1]; c.lineWidth = Math.max(1, size / 12) * (mine ? 1.8 : 1); c.stroke();
    c.fillStyle = '#654e5b'; c.fillText(label, world.x, y); c.restore();
    var spoken = G.liveAvatars && G.liveAvatars.activeBubble ? G.liveAvatars.activeBubble(bubbles, actor.peer.id, now) : '';
    if (spoken && G.liveAvatars && G.liveAvatars.drawBubble) {
      G.liveAvatars.drawBubble(c, spoken, world.x, y - size * .8, clamp(Math.round(size * .92), 12, 28), mark, null, placed);
    }
  }
  // env: { time(秒), delta(秒), reducedMotion, scale(镜头), house(主人当前小屋) }
  function draw(c, env) {
    if (!actors.size || !G.draw || !G.draw.avatar || !G.liveAvatars || !env || !env.house) return;
    var entries = [], now = nowMs();
    actors.forEach(function (actor) {
      var target = G.liveAvatars.position(env.house, actor.target); if (!target) return;
      if (!actor.current || actor.current.zone !== target.zone || env.reducedMotion) actor.current = { x: target.x, y: target.y, scale: target.scale, zone: target.zone, walking: false };
      else {
        var dx = target.x - actor.current.x, dy = target.y - actor.current.y, distance = Math.hypot(dx, dy), step = Math.min(distance, 520 * Math.max(0, Math.min(.1, env.delta || 0)));
        if (distance > .5) { actor.current.x += dx / distance * step; actor.current.y += dy / distance * step; actor.facing = dx < 0 ? -1 : 1; }
        actor.current.scale = target.scale; actor.current.walking = distance > 1;
      }
      entries.push({ actor: actor, world: actor.current });
    });
    entries.sort(function (a, b) { return a.world.y - b.world.y; });
    var placed = [];
    entries.forEach(function (entry) {
      var actor = entry.actor, world = entry.world, mark = marks[actor.peer.id];
      var spoken = G.liveAvatars && G.liveAvatars.activeBubble ? G.liveAvatars.activeBubble(bubbles, actor.peer.id, now) : '';
      if (mark && mark.twin) { c.save(); c.beginPath(); c.ellipse(world.x, world.y + 2 * world.scale, 36 * world.scale, 11 * world.scale, 0, 0, Math.PI * 2); c.strokeStyle = mark.tone[1]; c.lineWidth = Math.max(2, 4 * world.scale); c.stroke(); c.restore(); }
      G.draw.avatar(c, actor.peer.avatar, world.x, world.y, world.scale, { time: env.time || 0, still: !world.walking || !!env.reducedMotion, waddle: Boolean(world.walking && !env.reducedMotion), cheer: Boolean(spoken && !env.reducedMotion), facing: actor.facing });
      tag(c, actor, world, env.scale || 1, now, placed);
    });
  }
  hookWorld3D();
  G.livePeers = { set: set, clear: clear, draw: draw, count: function () { return actors.size; }, bubbleOf: function (peerId) { return G.liveAvatars && G.liveAvatars.activeBubble ? G.liveAvatars.activeBubble(bubbles, peerId, nowMs()) : ''; } };
})(window.Game = window.Game || {});
