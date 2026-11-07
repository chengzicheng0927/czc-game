(function (G) {
  'use strict';
  // 联机人物只占运行态画布；坐标取自公开房屋，不改动主人或参观存档。
  var clamp = function (value, low, high) { return Math.max(low, Math.min(high, value)); };
  var finite = function (value) { return typeof value === 'number' && Number.isFinite(value); };
  function room(house, id) {
    var result = null;
    (house && house.floors || []).forEach(function (floor, floorIndex) {
      (floor.slots || []).forEach(function (value, slotIndex) {
        if (value === id && id && house.rooms && house.rooms[id]) result = { id: id, x: -480 + slotIndex * 320, y: -220 - floorIndex * 220 };
      });
    });
    return result;
  }
  function position(house, peer) {
    if (!peer || !finite(peer.x) || !finite(peer.y) || peer.x < 0 || peer.x > 1 || peer.y < 0 || peer.y > 1) return null;
    if (peer.zone === 'yard') return { x: -520 + peer.x * 1040, y: 40 + peer.y * 245, scale: .55, zone: 'yard' };
    var box = room(house, peer.zone); if (!box) return null;
    var depth = .08 + peer.y * .84, perspective = .76 + depth * .24, canonicalX = 24 + peer.x * 272;
    return { x: box.x + 160 + (canonicalX - 160) * perspective, y: box.y + 142 + 68 * depth, scale: .55 * perspective, zone: peer.zone };
  }
  function destination(house, point, selectedRoom) {
    if (!point || !finite(point.x) || !finite(point.y)) return null;
    var candidates = selectedRoom ? [room(house, selectedRoom)] : [];
    if (!selectedRoom) (house && house.floors || []).forEach(function (floor) { (floor.slots || []).forEach(function (id) { if (id) candidates.push(room(house, id)); }); });
    for (var i = 0; i < candidates.length; i++) {
      var box = candidates[i]; if (!box) continue;
      var depth = (point.y - box.y - 142) / 68, perspective = .76 + .24 * depth;
      var canonicalX = 160 + (point.x - box.x - 160) / perspective;
      if (depth >= .08 - .00001 && depth <= .92 + .00001 && canonicalX >= 24 - .00001 && canonicalX <= 296 + .00001) return { zone: box.id, x: clamp((canonicalX - 24) / 272, 0, 1), y: clamp((depth - .08) / .84, 0, 1) };
    }
    if (!selectedRoom && point.x >= -520 && point.x <= 520 && point.y >= 40 && point.y <= 285) return { zone: 'yard', x: (point.x + 520) / 1040, y: (point.y - 40) / 245 };
    return null;
  }
  function frame(bounds, width, height) {
    var scale = Math.max(.02, Math.min(4, Math.max(1, width - 72) / (bounds.right - bounds.left), Math.max(1, height - 72) / (bounds.bottom - bounds.top)));
    return { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2, scale: scale };
  }
  function view(house, roomId, width, height, layout) {
    var box = roomId && room(house, roomId), count = Math.max(1, house && house.floors && house.floors.length || 1);
    var overview = layout && layout.overview ? layout.overview() : { left: -710, right: 1330, top: -220 * count - (house && house.attic ? 340 : 220), bottom: 410 };
    var bounds = box ? { left: box.x - 16, right: box.x + 336, top: box.y - 12, bottom: box.y + 232 } : overview;
    var camera = layout && layout.frame ? layout.frame(bounds, width, height, 36, 4) : frame(bounds, width, height), cropX = 0, cropY = 0, croppedWidth = width, croppedHeight = height;
    if (!box) {
      cropX = Math.max(0, Math.round((-710 - camera.x) * camera.scale + width / 2));
      cropY = Math.max(0, Math.round((overview.top - camera.y) * camera.scale + height / 2));
      croppedWidth = Math.max(1, Math.min(width - cropX, Math.round(1420 * camera.scale)));
      croppedHeight = Math.max(1, Math.min(height - cropY, Math.round((410 - overview.top) * camera.scale)));
    }
    return { frame: camera, rawWidth: width, rawHeight: height, cropX: cropX, cropY: cropY, width: croppedWidth, height: croppedHeight, roomId: box ? roomId : null };
  }
  function project(viewport, point) {
    if (!viewport || !point) return null;
    return { x: (point.x - viewport.frame.x) * viewport.frame.scale + viewport.rawWidth / 2 - viewport.cropX, y: (point.y - viewport.frame.y) * viewport.frame.scale + viewport.rawHeight / 2 - viewport.cropY, scale: (point.scale || 1) * viewport.frame.scale };
  }
  function unproject(viewport, point) {
    if (!viewport || !point || !finite(point.x) || !finite(point.y)) return null;
    return { x: (point.x + viewport.cropX - viewport.rawWidth / 2) / viewport.frame.scale + viewport.frame.x, y: (point.y + viewport.cropY - viewport.rawHeight / 2) / viewport.frame.scale + viewport.frame.y };
  }
  function clientPoint(canvas, clientX, clientY) {
    if (!canvas || !canvas.getBoundingClientRect || !finite(clientX) || !finite(clientY)) return null;
    var rect = canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return null;
    var x = (clientX - rect.left) / rect.width * canvas.width, y = (clientY - rect.top) / rect.height * canvas.height;
    return x >= 0 && y >= 0 && x <= canvas.width && y <= canvas.height ? { x: x, y: y } : null;
  }
  // 名牌配色：按排好序的 peerId 依次分配，各端看到的颜色一致；形象完全相同的人脚下再加一圈同色彩环。
  var TONES = [['#FFE3EA', '#E3A5B8'], ['#DDF1E5', '#8FBFA2'], ['#FFF1CE', '#DDB968'], ['#DCEBFA', '#8DB1D8'], ['#EBDDF6', '#B397CF'], ['#FFE5D2', '#E0A47E'], ['#D8F2F2', '#79BDBD'], ['#F2EBDD', '#BBA27E']];
  var BUBBLE_TTL = 6000;
  function fingerprint(avatar) { return G.data && G.data.avatarFingerprint ? G.data.avatarFingerprint(avatar) : JSON.stringify(avatar || {}); }
  function markers(peers) {
    var list = (Array.isArray(peers) ? peers : []).filter(function (peer) { return peer && typeof peer.id === 'string'; }), counts = {}, result = {};
    list.forEach(function (peer) { var key = fingerprint(peer.avatar); counts[key] = (counts[key] || 0) + 1; });
    list.map(function (peer) { return peer.id; }).sort().forEach(function (id, index) { result[id] = { tone: TONES[index % TONES.length], index: index }; });
    list.forEach(function (peer) { result[peer.id].twin = counts[fingerprint(peer.avatar)] > 1; });
    return result;
  }
  function syncBubbles(store, messages, now, ttl) {
    if (!store || messages === undefined) return;
    var duration = finite(ttl) && ttl > 0 ? ttl : BUBBLE_TTL, latestByPeer = new Map();
    (Array.isArray(messages) ? messages : []).forEach(function (message) {
      if (!message || typeof message.peerId !== 'string' || typeof message.text !== 'string') return;
      var text = message.text.trim(); if (!text) return;
      var seq = Number.isSafeInteger(message.seq) ? message.seq : 0, prev = latestByPeer.get(message.peerId);
      if (!prev || seq >= prev.seq) latestByPeer.set(message.peerId, { seq: seq, id: String(message.id || seq), text: text });
    });
    store.forEach(function (record, peerId) { if (!latestByPeer.has(peerId)) record.hidden = true; });
    latestByPeer.forEach(function (latest, peerId) {
      var existing = store.get(peerId);
      if (!existing || existing.seq !== latest.seq || existing.id !== latest.id) store.set(peerId, { seq: latest.seq, id: latest.id, text: latest.text, expiresAt: now + duration, hidden: false });
      else { existing.text = latest.text; existing.hidden = false; }
    });
  }
  function activeBubble(store, peerId, now) {
    var item = store && store.get(peerId);
    return item && !item.hidden && now < item.expiresAt ? item.text : '';
  }
  function nextBubbleExpiry(store, now) {
    var nearest = Infinity;
    if (store) store.forEach(function (item) { if (item && !item.hidden && item.expiresAt > now && item.expiresAt < nearest) nearest = item.expiresAt; });
    return Number.isFinite(nearest) ? nearest : 0;
  }
  function wrapBubbleLines(context, value, maxWidth, maxLines) {
    var chars = Array.from(String(value || '').trim()), lines = [], limit = Math.max(1, maxLines || 2), maxChars = 14;
    if (!chars.length) return lines;
    while (chars.length && lines.length < limit) {
      if (lines.length === limit - 1) {
        if (chars.length <= maxChars && context.measureText(chars.join('')).width <= maxWidth) { lines.push(chars.join('')); break; }
        if (chars.length > maxChars) chars = chars.slice(0, maxChars);
        while (chars.length > 1 && context.measureText(chars.join('') + '…').width > maxWidth) chars.pop();
        lines.push(chars.join('') + '…'); break;
      }
      var count = 1;
      while (count < chars.length && count < maxChars && context.measureText(chars.slice(0, count + 1).join('')).width <= maxWidth) count++;
      lines.push(chars.slice(0, count).join('')); chars = chars.slice(count);
    }
    return lines;
  }
  // placed：同一帧已画好的气泡矩形；挨得近的人同时说话时，后画的往上错开，不互相盖住。
  function drawBubble(context, text, anchorX, tagTopY, fontSize, mark, bounds, placed) {
    if (!context || !text) return false;
    var size = clamp(fontSize || 13, 12, 28);
    context.save(); context.font = '500 ' + size + 'px "PingFang SC","Microsoft YaHei",sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
    var lines = wrapBubbleLines(context, text, size * 12, 2);
    if (!lines.length) { context.restore(); return false; }
    var textWidth = 0; lines.forEach(function (line) { textWidth = Math.max(textWidth, context.measureText(line).width); });
    var padX = size * .75, padY = size * .45, lineHeight = size * 1.3, bw = Math.max(size * 2.6, textWidth + padX * 2), bh = lines.length * lineHeight + padY * 2, tail = Math.max(4, size * .36);
    var bx = anchorX;
    if (bounds && finite(bounds.width) && bounds.width > 0) {
      var minX = (bounds.left || 0) + bw / 2 + 4, maxX = (bounds.left || 0) + bounds.width - bw / 2 - 4;
      bx = maxX >= minX ? clamp(anchorX, minX, maxX) : anchorX;
    }
    var bottomY = tagTopY - tail - Math.max(2, size * .18), topY = bottomY - bh;
    if (bounds && finite(bounds.top) && topY < bounds.top + 4) { topY = bounds.top + 4; bottomY = topY + bh; }
    if (Array.isArray(placed)) {
      for (var guard = 0; guard < placed.length + 1; guard++) {
        var blocker = placed.find(function (r) { return bx - bw / 2 < r.x + r.w + 2 && bx + bw / 2 > r.x - 2 && topY < r.y + r.h + 2 && bottomY + tail > r.y - 2; });
        if (!blocker) break; bottomY = blocker.y - tail - 4; topY = bottomY - bh;
      }
      // 错开后不能被推出画面顶部；实在放不下宁可轻微重叠也要读得到。
      if (bounds && finite(bounds.top) && topY < bounds.top + 4) { topY = bounds.top + 4; bottomY = topY + bh; }
    }
    context.fillStyle = '#FFFDF9'; context.strokeStyle = mark && mark.tone && mark.tone[1] || '#D7A8B5'; context.lineWidth = Math.max(1.2, size / 10);
    context.beginPath();
    if (context.roundRect) context.roundRect(bx - bw / 2, topY, bw, bh, Math.min(size * .62, bh / 2));
    else context.rect(bx - bw / 2, topY, bw, bh);
    context.fill(); context.stroke();
    var tailX = clamp(anchorX, bx - bw / 2 + size * .6, bx + bw / 2 - size * .6);
    if (context.moveTo && context.lineTo && context.closePath) {
      context.beginPath(); context.moveTo(tailX - tail * .85, bottomY - 1); context.lineTo(tailX + tail * .85, bottomY - 1); context.lineTo(tailX, bottomY + tail); context.closePath(); context.fill(); context.stroke();
    }
    context.fillStyle = '#5D4350';
    lines.forEach(function (line, index) { context.fillText(line, bx, topY + padY + lineHeight * (index + .5)); });
    context.restore();
    var rect = { x: bx - bw / 2, y: topY, w: bw, h: bh + tail };
    if (Array.isArray(placed)) placed.push(rect);
    return rect;
  }
  function create(options) {
    var canvas = options.canvas, background = options.background, house = options.house, viewport = options.view, context = canvas.getContext('2d');
    var actors = new Map(), bubbles = new Map(), bubbleTimer = null, stopped = false, scheduled = null, lastPaint = -Infinity, selfId = null;
    var clock = options.now || function () { return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now(); };
    var request = options.requestFrame || (typeof requestAnimationFrame === 'function' ? requestAnimationFrame.bind(window) : null), cancel = options.cancelFrame || (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame.bind(window) : function () {});
    var setTimer = options.setTimeout || (typeof setTimeout === 'function' ? setTimeout : null), clearTimer = options.clearTimeout || (typeof clearTimeout === 'function' ? clearTimeout : function () {});
    var motion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    function reduced() { return options.reducedMotion !== undefined ? !!options.reducedMotion : !!(motion && motion.matches); }
    function hidden() { return typeof document !== 'undefined' && document.hidden; }
    function scheduleBubbleExpiry(now) {
      if (bubbleTimer !== null) { clearTimer(bubbleTimer); bubbleTimer = null; }
      if (stopped || hidden() || !setTimer) return;
      var expiry = nextBubbleExpiry(bubbles, now);
      if (expiry > now) bubbleTimer = setTimer(function () { bubbleTimer = null; redraw(); }, Math.max(16, Math.ceil(expiry - now)));
    }
    function sample(actor, now) {
      var progress = reduced() ? 1 : clamp((now - actor.startedAt) / actor.duration, 0, 1), amount = 1 - Math.pow(1 - progress, 2);
      if (actor.from.zone !== actor.to.zone) amount = 1;
      return { zone: actor.to.zone, x: actor.from.x + (actor.to.x - actor.from.x) * amount, y: actor.from.y + (actor.to.y - actor.from.y) * amount, walking: progress < 1 && actor.from.zone === actor.to.zone && (actor.from.x !== actor.to.x || actor.from.y !== actor.to.y) };
    }
    function target(actor, next, now) {
      if (actor.to.zone === next.zone && actor.to.x === next.x && actor.to.y === next.y) return;
      var before = sample(actor, now), delta = Math.hypot(next.x - before.x, next.y - before.y);
      actor.from = { zone: before.zone, x: before.x, y: before.y }; actor.to = { zone: next.zone, x: next.x, y: next.y }; actor.startedAt = now; actor.duration = clamp(delta * 1700, 180, 1500);
      if (actor.from.zone !== actor.to.zone) actor.from = Object.assign({}, actor.to);
      actor.facing = actor.to.x < actor.from.x ? -1 : 1;
    }
    function shortName(value, maxWidth) {
      var name = String(value || '小小建筑师'), chars = Array.from(name);
      while (chars.length > 1 && context.measureText(chars.join('') + '…').width > maxWidth) chars.pop();
      return chars.length < Array.from(name).length ? chars.join('') + '…' : name;
    }
    function paint(now) {
      if (stopped || !context || hidden()) return false;
      context.setTransform(1, 0, 0, 1, 0, 0); context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(background, 0, 0);
      var entries = [], moving = false;
      actors.forEach(function (actor) {
        var value = sample(actor, now); moving = moving || value.walking;
        if (viewport.roomId && value.zone !== viewport.roomId) return;
        var world = position(house, value); if (!world) return;
        entries.push({ actor: actor, value: value, world: world, screen: project(viewport, world) });
      });
      entries.sort(function (a, b) { return a.world.y - b.world.y; });
      var marks = markers(Array.from(actors.values()).map(function (actor) { return actor.peer; })), placed = [];
      entries.forEach(function (entry) {
        var actor = entry.actor, screen = entry.screen, mine = actor.peer.id === selfId, mark = marks[actor.peer.id];
        if (mark.twin) { context.save(); context.beginPath(); context.ellipse(screen.x, screen.y + 2 * screen.scale, 36 * screen.scale, 11 * screen.scale, 0, 0, Math.PI * 2); context.strokeStyle = mark.tone[1]; context.lineWidth = Math.max(2, 4 * screen.scale); context.stroke(); context.restore(); }
        var spoken = activeBubble(bubbles, actor.peer.id, now);
        var drawAvatar = options.drawAvatar || G.draw && G.draw.avatar;
        if (drawAvatar) drawAvatar(context, actor.peer.avatar, screen.x, screen.y, screen.scale, { time: now / 1000, still: !entry.value.walking || reduced(), waddle: entry.value.walking && !reduced(), cheer: Boolean(spoken) && !reduced(), facing: actor.facing });
        var ratio = canvas.clientWidth > 0 ? canvas.width / canvas.clientWidth : 1, fontSize = clamp(12 * ratio, 14, 34), labelY = screen.y - 165 * screen.scale;
        context.save(); context.font = '600 ' + fontSize + 'px "PingFang SC","Microsoft YaHei",sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
        var label = shortName(actor.peer.displayName, fontSize * 10) + (mine ? ' · 我' : actor.peer.isHost ? ' · 主人' : ''), width = context.measureText(label).width + fontSize;
        var labelX = clamp(screen.x, width / 2 + 3, Math.max(width / 2 + 3, canvas.width - width / 2 - 3));
        labelY = Math.max(fontSize, labelY); context.fillStyle = mark.tone[0]; context.strokeStyle = mark.tone[1]; context.lineWidth = Math.max(1, ratio) * (mine ? 1.8 : 1); context.beginPath();
        if (context.roundRect) context.roundRect(labelX - width / 2, labelY - fontSize * .8, width, fontSize * 1.6, fontSize * .55);
        else context.rect(labelX - width / 2, labelY - fontSize * .8, width, fontSize * 1.6);
        context.fill(); context.stroke(); context.fillStyle = '#654e5b'; context.fillText(label, labelX, labelY); context.restore();
        if (spoken) drawBubble(context, spoken, screen.x, labelY - fontSize * .8, clamp(Math.round(fontSize * .92), 12, 28), mark, { left: 0, top: 0, width: canvas.width, height: canvas.height }, placed);
      });
      scheduleBubbleExpiry(now);
      return moving && !reduced();
    }
    function step() {
      scheduled = null; if (stopped || hidden()) return;
      var now = clock();
      if (now - lastPaint < 1000 / 30) { if (request) scheduled = request(step); return; }
      lastPaint = now; if (paint(now) && request) scheduled = request(step);
    }
    function redraw() {
      if (stopped || hidden()) return;
      var now = clock();
      if (now - lastPaint < 1000 / 30 && request) { if (scheduled === null) scheduled = request(step); return; }
      lastPaint = now; var moving = paint(now); if (moving && scheduled === null && request) scheduled = request(step);
    }
    function visibility() { if (hidden()) { if (scheduled !== null) cancel(scheduled); scheduled = null; if (bubbleTimer !== null) clearTimer(bubbleTimer); bubbleTimer = null; } else redraw(); }
    if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('visibilitychange', visibility);
    if (motion && motion.addEventListener) motion.addEventListener('change', redraw);
    return {
      update: function (peers, id, messages) {
        if (stopped) return; selfId = id || null; var now = clock(), found = new Set();
        syncBubbles(bubbles, messages, now, options.bubbleTtl);
        (Array.isArray(peers) ? peers : []).slice(0, 8).forEach(function (peer) {
          if (!peer || typeof peer.id !== 'string' || !position(house, peer)) return;
          found.add(peer.id); var actor = actors.get(peer.id), next = { zone: peer.zone, x: peer.x, y: peer.y };
          if (!actor) { actor = { peer: peer, from: next, to: next, startedAt: now, duration: 1, facing: 1 }; actors.set(peer.id, actor); }
          else { actor.peer = peer; target(actor, next, now); }
        });
        actors.forEach(function (_, id) { if (!found.has(id)) { actors.delete(id); bubbles.delete(id); } }); redraw();
      },
      redraw: redraw,
      destroy: function () { if (stopped) return; stopped = true; if (scheduled !== null) cancel(scheduled); scheduled = null; if (bubbleTimer !== null) clearTimer(bubbleTimer); bubbleTimer = null; actors.clear(); bubbles.clear(); if (typeof document !== 'undefined' && document.removeEventListener) document.removeEventListener('visibilitychange', visibility); if (motion && motion.removeEventListener) motion.removeEventListener('change', redraw); }
    };
  }
  G.liveAvatars = { markers: markers, tones: TONES, bubbleTtl: BUBBLE_TTL, syncBubbles: syncBubbles, activeBubble: activeBubble, nextBubbleExpiry: nextBubbleExpiry, wrapBubbleLines: wrapBubbleLines, drawBubble: drawBubble, room: room, position: position, destination: destination, view: view, project: project, unproject: unproject, clientPoint: clientPoint, create: create };
})(window.Game);
