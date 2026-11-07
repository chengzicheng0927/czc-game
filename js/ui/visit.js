(function (G) {
  'use strict';
  var script = document.currentScript, source = script && script.src || '', hosted = /^(https?:\/\/[^/]+)(.*?)\/releases\/r-[a-f0-9]{64}\//.exec(source), basePath = hosted ? hosted[2] : '';
  var visitPattern = /^\/visit\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;
  var initialized = false, stage, picture, status, title, identity, roomButtons, visitRoot, liveSlot, movementBar, movementHint, enterButton, note;
  var scale = 1, offset = { x: 0, y: 0 }, dragging = null, generation = 0, currentRoom = null, currentFloor = 'all', currentView = 'cutaway', frameInfo = null, animator = null, liveWidget = null, viewCutawayBtn = null, viewExteriorBtn = null;
  var liveState = { phase: 'idle', peers: [] }, ownerDisplayName = '', ownTarget = null, ownPredictionUntil = 0;
  var quickJoinConsumed = false;
  // 3D参观：独立的World3D实例只画公开快照，不初始化主人场景、存档或同步；没有WebGL时回到原2D画法。
  var view3d = null, loadedUpdatedAt = null, loadedHouseVersion = '', refreshTimer = null, refreshing = false;
  function routeId() { var path = location.pathname || ''; if (basePath && path.indexOf(basePath + '/') !== 0) return null; var match = visitPattern.exec(path.slice(basePath.length)); return match && match[1] || null; }
  function make(tag, className, text) { var node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function button(text, handler, label) { var node = make('button', 'ui-button ui-button-soft', text); node.type = 'button'; if (label) node.setAttribute('aria-label', label); node.addEventListener('click', handler); return node; }
  function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.keys(value).forEach(function (key) { freeze(value[key]); }); Object.freeze(value); } return value; }
  function joined() { return liveState.houseId === routeId() && !!liveState.peerId && (liveState.phase === 'connected' || liveState.phase === 'reconnecting'); }
  function canMove() { return joined() && liveState.phase === 'connected' && G.live && typeof G.live.move === 'function'; }
  function transform() {
    if (!picture) return;
    // 默认固定整屋；只有放大后超出取景框的部分可以移动，不能把房子拖出画面。
    var limitX = Math.max(0, ((picture.clientWidth || stage.clientWidth) * scale - stage.clientWidth) / 2), limitY = Math.max(0, ((picture.clientHeight || stage.clientHeight) * scale - stage.clientHeight) / 2);
    if (scale === 1) limitX = limitY = 0;
    offset.x = Math.max(-limitX, Math.min(limitX, offset.x)); offset.y = Math.max(-limitY, Math.min(limitY, offset.y));
    picture.style.transform = 'translate(' + offset.x + 'px,' + offset.y + 'px) scale(' + scale + ')';
    stage.classList.toggle('is-zoomed', scale > 1); stage.classList.toggle('is-walking', !!canMove());
  }
  function reset() { scale = 1; offset = { x: 0, y: 0 }; transform(); }
  function zoom(factor) { scale = Math.max(1, Math.min(4, scale * factor)); if (scale === 1) offset = { x: 0, y: 0 }; transform(); }
  function stopAnimation() { if (animator) animator.destroy(); animator = null; stop3D(); }
  function has3D() {
    if (view3d === false) return false;
    if (view3d) return !!view3d.world.ready;
    var layout = G.render && G.render.layout;
    if (typeof G.World3D !== 'function' || !layout || typeof layout.garden !== 'function' || typeof layout.attic !== 'function') { view3d = false; return false; }
    var world; try { world = new G.World3D(function () { request3D(); }); } catch (_) { world = null; }
    if (!world || !world.ready) { if (world && world.destroy) world.destroy(); view3d = false; return false; }
    view3d = { world: world, canvas: null, context: null, dpr: 1, width: 1, height: 1, frame: null, lastPaint: -Infinity, lastTick: 0, eased: new Map() };
    return true;
  }
  function stop3D() { if (view3d && view3d.frame !== null) { cancelAnimationFrame(view3d.frame); view3d.frame = null; } }
  function size3D() {
    var dpr = Math.min(2, window.devicePixelRatio || 1), width = Math.max(1, Math.round(stage.clientWidth || 800)), height = Math.max(1, Math.round(stage.clientHeight || 500));
    view3d.dpr = dpr; view3d.width = width; view3d.height = height;
    if (view3d.canvas.width !== Math.round(width * dpr) || view3d.canvas.height !== Math.round(height * dpr)) { view3d.canvas.width = Math.round(width * dpr); view3d.canvas.height = Math.round(height * dpr); }
  }
  function rooms3D() {
    var result = [];
    G.state.house.floors.forEach(function (floor, floorIdx) { floor.slots.forEach(function (id, slotIdx) { result.push({ id: id, floorIdx: floorIdx, slotIdx: slotIdx, x: -480 + slotIdx * 320, y: -220 - floorIdx * 220, data: id ? G.state.house.rooms[id] : null }); }); });
    return result;
  }
  // 同屋的人在3D里平滑走过去；跨房间直接出现在新位置。
  function easedPeers(delta) {
    var reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches, keep = new Set(), moving = false;
    var list = displayedPeers().map(function (peer) {
      keep.add(peer.id); var current = view3d.eased.get(peer.id);
      if (!current || current.zone !== peer.zone || reduced) current = { zone: peer.zone, x: peer.x, y: peer.y };
      else {
        var dx = peer.x - current.x, dy = peer.y - current.y, distance = Math.hypot(dx, dy), step = Math.min(distance, .9 * Math.min(.1, delta));
        if (distance > .0005) { current.x += dx / distance * step; current.y += dy / distance * step; moving = true; } else { current.x = peer.x; current.y = peer.y; }
      }
      view3d.eased.set(peer.id, current);
      return Object.assign({}, peer, { x: current.x, y: current.y });
    });
    view3d.eased.forEach(function (_, id) { if (!keep.has(id)) view3d.eased.delete(id); });
    return { peers: list, moving: moving };
  }
  function env3D(peers, now) {
    var layout = G.render.layout, room = currentRoom && rooms3D().find(function (value) { return value.id === currentRoom && value.data; });
    return { state: G.state, rooms: rooms3D(), atticRoom: layout.atticRoom ? layout.atticRoom() : null, garden: layout.garden(), attic: layout.attic(G.state.house.floors.length),
      view: { floor: room ? room.floorIdx + 1 : currentFloor, view: room ? 'cutaway' : currentView, previewFourFloors: false }, camera: { x: 0, y: -92, scale: 1 },
      width: view3d.width, height: view3d.height, offsetX: 0, offsetY: 0, dpr: view3d.dpr, constrainCamera: false, capturingPhoto: true, captureCamera: null, forceHouse: true,
      roomOnly: room ? room.id : null, hidePlayer: true, peers: peers, selfId: joined() ? liveState.peerId : null, time: now / 1000, night: false, residentFrame: null, reducedMotion: true,
      selected: null, neighbors: [], neighborKey: '[]', gardenStatuses: [], gardenKey: '[]', visitor: null, omitUid: null, preview: null };
  }
  function paint3D() {
    if (!view3d || !view3d.canvas || !G.state || document.hidden) return false;
    var now = performance.now(), delta = view3d.lastTick ? (now - view3d.lastTick) / 1000 : 0; view3d.lastTick = now; view3d.lastPaint = now;
    var live = joined() ? easedPeers(delta) : { peers: [], moving: false }, context = view3d.context;
    context.setTransform(1, 0, 0, 1, 0, 0); context.clearRect(0, 0, view3d.canvas.width, view3d.canvas.height); context.setTransform(view3d.dpr, 0, 0, view3d.dpr, 0, 0);
    view3d.world.render(context, env3D(live.peers, now));
    return live.moving;
  }
  // 联机时最多30帧刷新走动和气泡；只读参观只在切换视角、尺寸或布置更新时重画。
  function request3D() {
    if (!view3d || !view3d.canvas || view3d.frame !== null || document.hidden) return;
    view3d.frame = requestAnimationFrame(function step(now) {
      view3d.frame = null; if (!view3d.canvas || document.hidden) return;
      if (now - view3d.lastPaint < 1000 / 30) { view3d.frame = requestAnimationFrame(step); return; }
      paint3D(); if (joined()) view3d.frame = requestAnimationFrame(step);
    });
  }
  function draw3D() {
    if (!view3d.canvas) {
      view3d.canvas = document.createElement('canvas'); view3d.canvas.className = 'visit-picture visit-picture-3d'; view3d.context = view3d.canvas.getContext('2d');
    }
    view3d.canvas.setAttribute('role', 'img'); view3d.canvas.setAttribute('aria-label', joined() ? '同屋朋友与公开小屋的实时3D画面' : currentRoom ? '公开房间的只读3D画面' : '公开小屋与庭院的只读3D画面');
    if (picture !== view3d.canvas) { if (picture && picture.parentElement === stage) stage.removeChild(picture); picture = view3d.canvas; stage.prepend(picture); }
    stage.classList.add('is-3d'); frameInfo = null; size3D(); view3d.lastTick = 0; paint3D(); request3D();
  }
  function roomName(id) {
    if (id === 'yard') return '前院';
    var room = G.state && G.state.house.rooms[id], definition = room && G.data.rooms.find(function (item) { return item.id === room.type; });
    return definition && definition.name || '房间';
  }
  function displayedPeers() {
    return (liveState.peers || []).map(function (peer) { return peer.id === liveState.peerId && ownTarget && Date.now() < ownPredictionUntil ? Object.assign({}, peer, ownTarget) : peer; });
  }
  function updateMovement() {
    if (!movementBar) return;
    movementBar.hidden = !joined(); enterButton.disabled = !canMove(); enterButton.textContent = currentRoom ? '走进这间房' : '走到前院';
    if (!joined()) return;
    var self = ownTarget || (liveState.peers || []).find(function (peer) { return peer.id === liveState.peerId; });
    movementHint.textContent = liveState.phase === 'reconnecting' ? '正在重新连接，连好后可以继续走动。' : '你在' + roomName(self && self.zone || 'yard') + '。点地面走过去，方向键也能走动；放大后可拖动视角。';
  }
  function draw(roomId, preserveTransform) {
    if (!G.state || !G.render || !G.render.captureScene) throw new Error('参观画面还没有准备好，请稍后再试。');
    currentRoom = roomId || null; if (currentRoom) currentFloor = 'all'; stopAnimation();
    if (has3D()) { draw3D(); if (!preserveTransform) reset(); else transform(); syncButtons(); return; }
    var raw = G.render.captureScene({ scope: currentRoom ? 'room' : 'house', roomId: currentRoom, floorFocus: currentRoom ? 'all' : currentFloor, viewMode: currentRoom ? 'cutaway' : currentView, width: 1600, height: 1200, hidePlayer: joined() }), rendered = raw;
    frameInfo = G.liveAvatars && raw.width && raw.height ? G.liveAvatars.view(G.state.house, currentRoom, raw.width, raw.height, G.render.layout) : null;
    // 庭院属于公开内容，作物和成长进度不公开；整屋裁去通用花圃区域。
    if (frameInfo && !currentRoom) {
      rendered = document.createElement('canvas'); rendered.width = frameInfo.width; rendered.height = frameInfo.height;
      rendered.getContext('2d').drawImage(raw, frameInfo.cropX, frameInfo.cropY, frameInfo.width, frameInfo.height, 0, 0, frameInfo.width, frameInfo.height);
    } else if (!currentRoom && G.render.layout && G.render.layout.overview && G.render.layout.frame) {
      var all = G.render.layout.overview(), frame = G.render.layout.frame(all, raw.width, raw.height, 36, 4), wanted = { left: -710, right: 710, top: all.top, bottom: 410 };
      var x = Math.max(0, Math.round((wanted.left - frame.x) * frame.scale + raw.width / 2)), y = Math.max(0, Math.round((wanted.top - frame.y) * frame.scale + raw.height / 2));
      var w = Math.min(raw.width - x, Math.round((wanted.right - wanted.left) * frame.scale)), h = Math.min(raw.height - y, Math.round((wanted.bottom - wanted.top) * frame.scale));
      rendered = document.createElement('canvas'); rendered.width = Math.max(1, w); rendered.height = Math.max(1, h); rendered.getContext('2d').drawImage(raw, x, y, w, h, 0, 0, w, h);
    }
    var background = rendered;
    if (joined() && G.liveAvatars && frameInfo) { rendered = document.createElement('canvas'); rendered.width = background.width; rendered.height = background.height; }
    rendered.className = 'visit-picture'; rendered.setAttribute('role', 'img'); rendered.setAttribute('aria-label', joined() ? '同屋朋友与公开小屋的实时画面' : currentRoom ? '公开房间的只读画面' : '公开小屋与庭院的只读画面');
    if (picture && picture.parentElement === stage) stage.removeChild(picture); picture = rendered; stage.prepend(picture);
    if (joined() && G.liveAvatars && frameInfo) { animator = G.liveAvatars.create({ canvas: picture, background: background, house: G.state.house, view: frameInfo }); animator.update(displayedPeers(), liveState.peerId, liveState.messages); }
    if (!preserveTransform) reset(); else transform();
    syncButtons();
  }
  function syncButtons() {
    roomButtons.querySelectorAll('button').forEach(function (node) {
      var active = node.dataset.floorFocus ? (!currentRoom && String(currentFloor) === node.dataset.floorFocus) : ((node.dataset.roomId || '') === (currentRoom || '') && currentFloor === 'all');
      node.setAttribute('aria-pressed', String(active)); node.classList.toggle('is-current', active);
    });
    if (viewCutawayBtn && viewExteriorBtn) {
      var isExt = !currentRoom && currentView === 'exterior';
      viewCutawayBtn.setAttribute('aria-pressed', String(!isExt)); viewCutawayBtn.classList.toggle('is-current', !isExt);
      viewExteriorBtn.setAttribute('aria-pressed', String(isExt)); viewExteriorBtn.classList.toggle('is-current', isExt);
    }
    updateMovement();
  }
  function moveTo(target) {
    if (!canMove() || !target || !G.liveAvatars || !G.liveAvatars.position(G.state.house, target)) return;
    var outcome = G.live.move(target.zone, target.x, target.y); if (outcome && outcome.ok === false) return;
    ownTarget = { zone: target.zone, x: target.x, y: target.y }; ownPredictionUntil = Date.now() + 2500;
    if (animator) animator.update(displayedPeers(), liveState.peerId); request3D(); updateMovement();
  }
  function moveDirection(direction) {
    if (!canMove()) return;
    var self = ownTarget || (liveState.peers || []).find(function (peer) { return peer.id === liveState.peerId; });
    var zone = currentRoom || self && self.zone || 'yard', same = self && self.zone === zone, x = same ? self.x : .5, y = same ? self.y : .5;
    x += direction === 'left' ? -.08 : direction === 'right' ? .08 : 0; y += direction === 'up' ? -.1 : direction === 'down' ? .1 : 0;
    moveTo({ zone: zone, x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) });
  }
  function groundClick(event) {
    if (canMove() && view3d && picture === view3d.canvas && G.liveAvatars) {
      var point = G.liveAvatars.clientPoint(picture, event.clientX, event.clientY), hit = point && view3d.world.pick(point.x / view3d.dpr, point.y / view3d.dpr, 'floor');
      var goal = hit && hit.world && G.liveAvatars.destination(G.state.house, hit.world, currentRoom); if (goal) moveTo(goal); return;
    }
    if (!canMove() || !picture || !frameInfo || !G.liveAvatars) return;
    var pixel = G.liveAvatars.clientPoint(picture, event.clientX, event.clientY), world = pixel && G.liveAvatars.unproject(frameInfo, pixel), target = world && G.liveAvatars.destination(G.state.house, world, currentRoom);
    if (target) moveTo(target);
  }
  function onLiveState(next) {
    var before = joined(); liveState = next || { phase: 'idle', peers: [] };
    var self = (liveState.peers || []).find(function (peer) { return peer.id === liveState.peerId; });
    if (!joined()) { ownTarget = null; ownPredictionUntil = 0; }
    else if (self && (!ownTarget || Date.now() >= ownPredictionUntil || self.zone === ownTarget.zone && self.x === ownTarget.x && self.y === ownTarget.y)) { ownTarget = { zone: self.zone, x: self.x, y: self.y }; ownPredictionUntil = 0; }
    if (!G.state) return;
    var active = joined(); identity.textContent = ownerDisplayName + '的小屋 · ' + (active ? '实时串门' : '只读参观');
    note.textContent = active ? '房间按钮先带你近看，再点地面或「走进这间房」加入朋友。布置供参观，自己的小屋进度单独保存。' : '这里是主人最近公开的布置预览。加入串门后能看到同屋朋友走动、聊天；放大后可拖动视角。';
    stage.setAttribute('aria-label', active ? '实时小屋画面，点地面或使用方向键走动，加减键缩放，放大后可拖动视角' : '公开布置预览，使用加减键缩放，放大后可拖动视角；加入串门后可走动聊天');
    if (view3d && G.livePeers) { if (active) G.livePeers.set(liveState.peers, liveState.peerId, liveState.messages); else G.livePeers.clear(); }
    if (active && liveState.houseVersion && loadedHouseVersion && liveState.houseVersion !== loadedHouseVersion) refreshSnapshot();
    if (active && liveState.houseVersion) loadedHouseVersion = liveState.houseVersion;
    if (before !== active) draw(currentRoom); else if (animator) animator.update(displayedPeers(), liveState.peerId, liveState.messages); else request3D(); transform(); updateMovement();
  }
  // 路过也看得到“现在屋里有谁”：只用匿名公开摘要（人数与称呼），不建立会话，主人不会被通知。
  var presenceNode = null, presenceTimer = null, presenceTicket = 0;
  async function loadPresence() {
    var ticket = ++presenceTicket;
    try {
      var data = await G.cloud.requestPublic('/neighbors/online'); if (ticket !== presenceTicket) return;
      var entry = data && Array.isArray(data.houses) ? data.houses.find(function (item) { return item && item.id === routeId(); }) : null;
      if (presenceNode) presenceNode.textContent = entry && entry.online ? '现在屋里有 ' + entry.online.count + ' 位：' + entry.online.displayNames.join('、') + (entry.online.hostOnline ? '（主人在家）' : '') : '现在屋里没有人。';
    } catch (_) { if (presenceNode && ticket === presenceTicket) presenceNode.textContent = ''; }
    finally { if (ticket === presenceTicket) { if (presenceTimer) clearTimeout(presenceTimer); presenceTimer = setTimeout(function () { if (!document.hidden && !joined()) loadPresence(); else presenceTimer = setTimeout(loadPresence, 15000); }, 15000); } }
  }
  function mountLive() {
    if (liveWidget || !G.ui || !G.ui.liveRoom || !G.ui.liveRoom.mount || !G.live || !G.liveAvatars) return;
    var quickJoin = false;
    if (!quickJoinConsumed) {
      quickJoinConsumed = true;
      if (location.hash === '#join' && window.history && typeof window.history.replaceState === 'function') {
        try { window.history.replaceState(window.history.state, '', location.pathname + (location.search || '')); quickJoin = true; } catch (_) { /* 无法消费片段时保留手动加入，避免刷新再次执行。 */ }
      }
    }
    liveSlot.hidden = false; visitRoot.classList.add('has-live-room'); liveWidget = G.ui.liveRoom.mount(liveSlot, { houseId: routeId(), onState: onLiveState, onMove: moveDirection, quickJoin: quickJoin });
  }
  function build() {
    document.body.classList.add('is-visiting'); var app = document.getElementById('app'); app.hidden = true;
    visitRoot = make('main', 'visit-shell'); visitRoot.id = 'visit-app';
    var header = make('header', 'visit-heading'), heading = make('div', 'visit-heading-copy'); title = make('h1', '', '正在打开邻居的小屋'); identity = make('p', 'visit-identity', '只读参观 · 自己的小屋进度会保留'); presenceNode = make('p', 'visit-presence ui-small'); heading.append(title, identity, presenceNode);
    var back = make('a', 'ui-button ui-button-primary', '回自己的小屋'); back.href = basePath + '/'; header.append(heading, back);
    var toolbar = make('div', 'visit-toolbar'); roomButtons = make('nav', 'visit-rooms'); roomButtons.setAttribute('aria-label', '选择参观整屋或房间');
    var zooms = make('div', 'visit-zoom'); zooms.setAttribute('role', 'group'); zooms.setAttribute('aria-label', '参观缩放与视角');
    viewCutawayBtn = button('全屋剖面', function () { currentView = 'cutaway'; draw(null); }, '切换为全屋剖面视角');
    viewExteriorBtn = button('小屋外观', function () { currentView = 'exterior'; draw(null); }, '切换为小屋外观视角');
    zooms.append(viewCutawayBtn, viewExteriorBtn, button('＋', function () { zoom(1.3); }, '放大参观画面'), button('－', function () { zoom(1 / 1.3); }, '缩小参观画面'), button('看整座', reset, '恢复参观画面缩放'));
    toolbar.append(roomButtons, zooms); stage = make('section', 'visit-stage'); stage.id = 'visit-stage'; stage.tabIndex = 0; stage.setAttribute('aria-label', '公开布置预览，使用加减键缩放，放大后可拖动视角；加入串门后可走动聊天');
    status = make('p', 'visit-status', '正在载入主人主动公开的布置…'); status.id = 'visit-status'; status.setAttribute('role', 'status'); stage.append(status);
    movementBar = make('div', 'visit-movement'); movementBar.hidden = true; movementHint = make('p', 'visit-movement-hint'); enterButton = button('走到前院', function () { moveTo({ zone: currentRoom || 'yard', x: .5, y: .5 }); }); movementBar.append(movementHint, enterButton);
    note = make('p', 'visit-note', '这里是主人最近公开的布置预览。加入串门后能看到同屋朋友走动、聊天；放大后可拖动视角。');
    var content = make('div', 'visit-content'), sceneColumn = make('div', 'visit-scene-column'); liveSlot = make('aside', 'visit-live-room'); liveSlot.hidden = true; liveSlot.setAttribute('aria-label', '同屋串门与聊天'); sceneColumn.append(stage, movementBar, note); content.append(sceneColumn, liveSlot);
    visitRoot.append(header, toolbar, content); document.body.append(visitRoot); document.title = '参观邻居 · 棉花糖小屋';
    stage.addEventListener('wheel', function (event) { if (!picture) return; event.preventDefault(); zoom(event.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });
    stage.addEventListener('pointerdown', function (event) {
      if (!picture || event.button !== 0) return; if (dragging) { dragging.multiple = true; return; }
      dragging = { id: event.pointerId, x: event.clientX, y: event.clientY, beforeX: offset.x, beforeY: offset.y, moved: false, multiple: event.isPrimary === false, canPan: scale > 1 }; if (stage.setPointerCapture) stage.setPointerCapture(event.pointerId);
      if (stage.focus) stage.focus({ preventScroll: true });
    });
    stage.addEventListener('pointermove', function (event) {
      if (!dragging || dragging.id !== event.pointerId) return; if (Math.hypot(event.clientX - dragging.x, event.clientY - dragging.y) > 7) dragging.moved = true; if (!dragging.moved) return;
      if (!dragging.canPan || dragging.multiple) return;
      stage.classList.toggle('is-dragging', true); offset.x = dragging.beforeX + event.clientX - dragging.x; offset.y = dragging.beforeY + event.clientY - dragging.y; transform();
    });
    stage.addEventListener('pointerup', function (event) { if (!dragging || dragging.id !== event.pointerId) return; var tap = !dragging.moved && !dragging.multiple; cancelDrag(); if (tap) groundClick(event); });
    function cancelDrag() { dragging = null; stage.classList.toggle('is-dragging', false); } stage.addEventListener('pointercancel', cancelDrag); stage.addEventListener('lostpointercapture', cancelDrag); window.addEventListener('blur', cancelDrag);
    stage.addEventListener('keydown', function (event) {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(1.3); }
      else if (event.key === '-') { event.preventDefault(); zoom(1 / 1.3); }
      else if (event.key === '0' || event.key === 'Home') { event.preventDefault(); reset(); }
      else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); if (joined()) moveDirection(event.key.slice(5).toLowerCase()); else { offset.x += event.key === 'ArrowLeft' ? 40 : event.key === 'ArrowRight' ? -40 : 0; offset.y += event.key === 'ArrowUp' ? 40 : event.key === 'ArrowDown' ? -40 : 0; transform(); } }
    });
    window.addEventListener('resize', function () { if (view3d && picture === view3d.canvas) { size3D(); paint3D(); } transform(); if (animator) animator.redraw(); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden && view3d && picture === view3d.canvas) { view3d.lastTick = 0; paint3D(); request3D(); } });
    window.addEventListener('pagehide', function () { cancelDrag(); stopAnimation(); if (refreshTimer) clearTimeout(refreshTimer); refreshTimer = null; if (G.livePeers) G.livePeers.clear(); presenceTicket++; if (presenceTimer) clearTimeout(presenceTimer); presenceTimer = null; if (liveWidget) liveWidget.destroy(); liveWidget = null; });
    window.addEventListener('pageshow', function (event) { if (!event.persisted || !G.state) return; liveState = { phase: 'idle', peers: [] }; ownTarget = null; draw(currentRoom, true); mountLive(); });
  }
  function buildRoomButtons() {
    roomButtons.replaceChildren(); var all = button('整座小屋', function () { currentFloor = 'all'; draw(null); }); roomButtons.append(all);
    if (G.state.house.floors.length > 1) {
      G.state.house.floors.forEach(function (_, floorIndex) {
        var fb = button((floorIndex + 1) + 'F', function () { currentFloor = floorIndex + 1; draw(null); }, '聚焦第' + (floorIndex + 1) + '层');
        fb.dataset.floorFocus = String(floorIndex + 1);
        roomButtons.append(fb);
      });
    }
    G.state.house.floors.forEach(function (floor, floorIndex) { floor.slots.forEach(function (id, slotIndex) { if (!id) return; var room = G.state.house.rooms[id], definition = G.data.rooms.find(function (item) { return item.id === room.type; }), node = button((floorIndex + 1) + '楼' + (slotIndex + 1) + ' · ' + (definition && definition.name || '房间'), function () { draw(id); }); node.dataset.roomId = id; roomButtons.append(node); }); });
  }
  // 主人的布置变了就跟着变：串门中由版本号立即触发；页面可见时每20秒再核对一次公开时间，补上读取失败或错过的更新。
  function scheduleRefresh() { if (refreshTimer) clearTimeout(refreshTimer); refreshTimer = setTimeout(function () { refreshTimer = null; if (!document.hidden) refreshSnapshot(); else scheduleRefresh(); }, 20000); }
  async function refreshSnapshot() {
    if (refreshing || !G.state) return; refreshing = true; var ticket = generation;
    try {
      var response = await G.cloud.requestPublic('/public-houses/' + routeId());
      if (ticket !== generation || !response || !response.house || !response.snapshot || response.house.updatedAt === loadedUpdatedAt) return;
      G.state = freeze(G.publicHouse.materialize(response.snapshot)); loadedUpdatedAt = response.house.updatedAt;
      title.textContent = String(response.house.title || G.state.house.name); document.title = title.textContent + ' · 参观棉花糖小屋';
      if (currentRoom && !G.state.house.rooms[currentRoom]) currentRoom = null;
      buildRoomButtons(); draw(currentRoom, true); updateMovement();
    } catch (_) { /* 暂时读不到就保留当前画面，下次再核对。 */ }
    finally { refreshing = false; if (ticket === generation) scheduleRefresh(); }
  }
  async function load() {
    var ticket = ++generation; status.hidden = false; status.textContent = '正在载入主人主动公开的布置…';
    try {
      var response = await G.cloud.requestPublic('/public-houses/' + routeId()); if (ticket !== generation) return;
      if (!response || !response.house || !response.snapshot) throw new Error('公开小屋的资料暂时不完整，请返回邻居列表。');
      G.state = freeze(G.publicHouse.materialize(response.snapshot)); ownerDisplayName = String(response.house.displayName || '小小建筑师');
      title.textContent = String(response.house.title || G.state.house.name); identity.textContent = ownerDisplayName + '的小屋 · 只读参观'; document.title = title.textContent + ' · 参观棉花糖小屋';
      loadedUpdatedAt = response.house.updatedAt; buildRoomButtons();
      draw(null); status.hidden = true; mountLive(); loadPresence(); scheduleRefresh();
    } catch (error) {
      if (ticket !== generation) return; stopAnimation(); title.textContent = '这座小屋暂时不能参观'; identity.textContent = '自己的小屋与进度仍然保留'; status.hidden = false; status.replaceChildren(make('span', '', error && error.status === 404 ? '主人可能已撤下这次公开，返回邻居列表看看其他小屋吧。' : '暂时没有载入成功。请检查连接后重试，或返回自己的小屋。'), button('重新载入', load));
    }
  }
  G.visit = {
    shouldStart: function () { return !!routeId(); },
    init: function () {
      if (initialized) return; initialized = true; G.runtime.visiting = true; G.runtime.mode = 'visit'; G.runtime.selected = null; G.runtime.placing = null;
      G.store.setWriteGuard(function () { return { ok: false, message: '参观页面的布置只读，请回自己的小屋继续装扮。' }; }); build(); return load();
    }
  };
})(window.Game);
