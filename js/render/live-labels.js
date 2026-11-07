(function (G) {
  'use strict';
  // 纯内容标签与气泡工具；不包含旧房间、坐标投影或渲染循环。
  var clamp = function (value, low, high) { return Math.max(low, Math.min(high, value)); };
  var finite = function (value) { return typeof value === 'number' && Number.isFinite(value); };
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
  G.liveAvatars = { markers: markers, tones: TONES, bubbleTtl: BUBBLE_TTL, syncBubbles: syncBubbles, activeBubble: activeBubble, nextBubbleExpiry: nextBubbleExpiry, wrapBubbleLines: wrapBubbleLines, drawBubble: drawBubble };
})(window.Game);
