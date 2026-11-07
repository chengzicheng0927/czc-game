(function () {
  'use strict';

  const G = window.Game = window.Game || {};
  const runtime = G.runtime = G.runtime || {};
  const TAU = Math.PI * 2;
  const palette = { ink: '#795F67', pink: '#E8A6B5', cream: '#FFF6DC', mint: '#B8DCC7', blue: '#BCD9E2', wood: '#DBB997' };
  const themePalettes = {
    basic: ['#DDBFA1', '#FFF8EB', '#9DBEA7'], strawberry: ['#EDB5C3', '#FFF2DA', '#BD798C'],
    forest: ['#B3C59B', '#E5D7B8', '#8B9474'], garden: ['#EFDA9B', '#FCF6DF', '#AEC398'],
    ocean: ['#B0D7E0', '#F6F9EE', '#80ADB9'], cloud: ['#EDF1EE', '#D7E6F5', '#B0C5D6'],
    oriental: ['#D6A499', '#E9DDBB', '#A6B69A'], starry: ['#C4B5DE', '#F8E5A3', '#9A87BA'],
    princess: ['#EBC7DD', '#FFF1CB', '#CEAD74']
  };
  let canvas, ctx, width = 1000, height = 700, dpr = 1, time = 0, raf = null;
  let panelHeight = 0, lastFloorCount = 1, initialized = false, lastPaint = 0;
  let reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let particles = [], drag = null, pinch = null, hover = null, placementPoint = null;
  const pointers = new Map();
  const htmlDrags = new WeakMap();
  let placementEpoch = 0;
  const residentHits = [];
  let gardenVisitor = null, nextVisitorAt = Date.now() + 15000;
  let playerHit = null;
  let ambientTime = null, ambientAt = 0;
  let capturingPhoto = false;
  let captureHidesPlayer = false;
  let captureFloorFocus = 'all';
  let captureViewMode = 'cutaway';
  let residentFrame = null;
  let world3d = null, lastPick = null, resizeObserver = null, needsDraw = true;
  let liveSnapshot = null, wakeTimer = null, wakeAt = 0, gardenStageAt = 0, gardenStages = [];
  let pageStageActive = false, houseCameraBeforeStage = null;
  let gardenPageActive = false, houseCameraBeforeGarden = null, gardenCameraRestored = false;
  let gardenActionOrigin = null;
  // 主场景串门：visitState 是对方公开小屋的深度冻结只读 state，只用于“画什么/点中什么”；G.state 永远是玩家自己的存档，绝不替换或写入。
  let visitState = null;
  function renderState() { return visitState || G.state; }
  function stopWorldWake() { if (wakeTimer) clearTimeout(wakeTimer); wakeTimer = null; wakeAt = 0; }
  function scheduleWorldWake(env) {
    const now = Date.now(), stages = env.gardenStatuses || [], times = stages.map(v => v.stageEndAt).filter(v => Number.isFinite(v) && v > now);
    // 小访客属于自己的花园进度，串门时不计时。
    if (!visitState && G.state.level >= (G.data.gardenConfig?.unlockLv || 6)) times.push(gardenVisitor ? gardenVisitor.at + 90000 : nextVisitorAt);
    const at = Math.min(Math.ceil((now + 1) / 60000) * 60000, ...times); if (wakeAt === at || document.hidden || !initialized) return;
    stopWorldWake(); wakeAt = at; wakeTimer = setTimeout(() => { wakeTimer = null; wakeAt = 0; gardenStageAt = 0; requestDraw(); }, Math.max(80, at - now));
  }
  const cleanup = [];
  function listen(target, name, handler, options) {
    target.addEventListener(name, handler, options);
    cleanup.push(() => target.removeEventListener?.(name, handler, options));
  }
  function onBus(name, handler) { const off = G.bus?.on?.(name, handler); if (typeof off === 'function') cleanup.push(off); }
  function sceneViewport() {
    const v = G.ui?.sceneViewport?.();
    if (v && Number.isFinite(v.width) && Number.isFinite(v.height)) {
      const x = clamp(Number(v.x) || 0, 0, Math.max(0, width - 1)), y = clamp(Number(v.y) || 0, 0, Math.max(0, height - 1));
      return { x, y, width: Math.max(1, Math.min(width - x, v.width)), height: Math.max(1, Math.min(height - y, v.height)), layout: v.layout || 'none' };
    }
    return { x: 0, y: 0, width, height: Math.max(180, height - panelHeight), layout: panelHeight ? 'bottom' : 'none' };
  }
  function usableWidth() { return sceneViewport().width; }
  function applyHouseFit(kind, id) {
    camera.focusKind = kind; camera.focusId = id || null;
    if (world3d?.ready) { const env = world3dEnvironment(); world3d.setEnvironment(env); world3d.fitCamera(env); }
    requestDraw();
  }
  function unusableWorldPoint(point) { return !point || point.outsideViewport || point.stagePreview || point.invalidProjection || !Number.isFinite(point.x) || !Number.isFinite(point.y); }
  function currentPick(x, y) { return world3d?.ready && lastPick && Math.abs(lastPick.x - x) < .0001 && Math.abs(lastPick.y - y) < .0001 ? lastPick.target : null; }
  function describePageStage(env) {
    const surface = runtime.shellLayout?.panelKind || null;
    if (visitState || !world3d?.ready || capturingPhoto || env?.forceHouse || env?.roomOnly || runtime.placing || drag && drag.kind !== 'stage-pan' || runtime.shellLayout?.takeover || document.body?.classList?.contains('is-photographing')) return null;
    if (!['avatar', 'residents'].includes(surface) || !G.pageStages3D?.describe) return null;
    try {
      const stage = G.pageStages3D.describe(Object.assign({ state: G.state, data: G.data, surface, residentId: runtime.residentBookV2?.friend || null }, env || {}));
      const triple = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
      return stage && typeof stage.id === 'string' && typeof stage.build === 'function' && triple(stage.focus) && triple(stage.bounds?.min) && triple(stage.bounds?.max) && stage.bounds.max.every((v, i) => v >= stage.bounds.min[i]) ? stage : null;
    } catch (_) { return null; }
  }
  function syncStageCamera(stage) {
    if (stage && !pageStageActive) { houseCameraBeforeStage = { x: camera.x, y: camera.y, scale: camera.scale }; pageStageActive = true; lastPick = null; }
    else if (!stage && pageStageActive) { if (houseCameraBeforeStage) Object.assign(camera, houseCameraBeforeStage); houseCameraBeforeStage = null; pageStageActive = false; lastPick = null; return true; }
    return false;
  }
  function describeGardenPage(env) {
    if (visitState || !world3d?.ready || capturingPhoto || env.forceHouse || env.roomOnly || runtime.placing || drag && drag.kind !== 'garden-pan' || env.surface !== 'garden' || !G.gardenPage3D?.describe) return null;
    try {
      const page = G.gardenPage3D.describe(Object.assign({ data: G.data, selectedPlot: runtime.gardenVisual?.selectedPlot }, env));
      const triple = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
      return page?.id === 'garden' && page.interactive === true && typeof page.build === 'function' && typeof page.worldToPage === 'function' && triple(page.focus) && triple(page.bounds?.min) && triple(page.bounds?.max) && page.bounds.max.every((v, i) => v >= page.bounds.min[i]) && Array.isArray(page.hits) && Array.isArray(page.labels) && Array.isArray(page.plots) ? page : null;
    } catch (_) { return null; }
  }
  function syncGardenCamera(page) {
    if (page && !gardenPageActive) {
      const numeric = {}; for (const key of ['x', 'y', 'scale', 'focusKind', 'focusId', 'focusFloorIndex']) numeric[key] = camera[key];
      houseCameraBeforeGarden = { numeric, engine: world3d.snapshotHouseCamera() }; gardenPageActive = true; gardenCameraRestored = false; lastPick = null;
    } else if (!page && gardenPageActive) {
      if (houseCameraBeforeGarden) { Object.assign(camera, houseCameraBeforeGarden.numeric); world3d.restoreHouseCamera(houseCameraBeforeGarden.engine); }
      houseCameraBeforeGarden = null; gardenPageActive = false; gardenCameraRestored = true; lastPick = null; return true;
    }
    return false;
  }
  function world3dEnvironment(patch) {
    const viewport = sceneViewport(), view = getHouseView(), entries = rooms();
    if (view.previewFourFloors) for (let f = renderState().house.floors.length; f < 4; f++) for (let slot = 0; slot < 3; slot++) entries.push({ id: null, floorIdx: f, slotIdx: slot, x: -480 + slot * 320, y: -220 - f * 220, data: null });
    const now = Date.now();
    // 花圃作物属于自己的进度：串门时给空地块（{} 不会回落到读自己的花园），数量用默认 6 块。
    if (!capturingPhoto && now - gardenStageAt >= 1000) { gardenStageAt = now; gardenStages = Array.from({ length: visitState ? 6 : G.sys?.garden?.capacity?.() || 6 }, (_, i) => visitState ? {} : G.sys?.garden?.status?.(i) || {}); }
    // 默认只给 3D 摆 8 座邻居岛；用户点“看邻居云朵”进入 sea 镜头时才摆全部，避免日常画面被几十座岛塞满。
    // 串门时不摆自己的邻居云海：它们相对于“我的小屋”布局，放在别人家周围会误导，也避免点云朵触发邻居卡片。
    const neighbors = visitState ? [] : (G.seaMap?.visualPositions?.({ all: camera.focusKind === 'sea' }) || G.seaMap?.positions?.() || []).map(value => Object.assign({}, value, { house: G.seaMap.hitAt(value, 1) }));
    // 同屋的人：串门（live）连上后，或屋主接待中；路过不画任何人。串门时 visitState 才算数，避免串门状态与自己家混用。
    const visit = runtime.visit, inLive = ['connected', 'reconnecting'].includes(liveSnapshot?.phase);
    const hosting = visitState ? !!(visit?.active && visit.mode === 'live') : !!G.hostRoom?.active?.();
    const peers = hosting && inLive ? liveSnapshot.peers || [] : [];
    const env = Object.assign({ state: renderState(), visiting: !!visitState, hidePlayer: !!visitState, rooms: entries, atticRoom: atticDecorRoom(), garden: gardenLayout(), attic: atticLayout(effectiveHouseFloors()), view, camera, width, height, offsetX: 0, offsetY: 0, fullWidth: width, fullHeight: height, dpr,
      // 3D 画布与天空同尺寸铺满；安全区（避开按钮/侧栏）只决定默认取景中心，拍照不用。
      safe: capturingPhoto ? null : { x: viewport.x, y: viewport.y, width: viewport.width, height: viewport.height }, constrainCamera: !capturingPhoto, capturingPhoto,
      surface: runtime.shellLayout?.panelKind || null, residentId: runtime.residentBookV2?.friend || null,
      night: atmosphereTime()?.phase === 'night', residentFrame: visitState ? null : residentFrame, reducedMotion, selected: visitState ? null : runtime.selected, peers, selfId: liveSnapshot?.peerId || (visitState ? visit?.selfPeerId : undefined),
      visitor: capturingPhoto || visitState ? null : gardenVisitor, gardenStatuses: gardenStages, gardenKey: JSON.stringify(gardenStages.map(v => [v.crop, v.stage, v.mature, v.needsWater])),
      neighbors, neighborKey: JSON.stringify(neighbors.map(v => [v.id, v.x, v.y, !!v.empty, v.scale, v.house?.title, v.house?.online])),
      omitUid: drag?.moved && ['item', 'yard-item'].includes(drag.kind) ? drag.hit.item?.uid || drag.hit.uid : null }, patch || {});
    env.gardenPage = describeGardenPage(env);
    env.stage = env.gardenPage ? null : describePageStage(env);
    if (!capturingPhoto) {
      // 先恢复离开的页面，再保存新页面，避免把页面镜头当成家园备份。
      if (!env.stage) env.restoredStageCamera = syncStageCamera(null);
      if (!env.gardenPage) syncGardenCamera(null);
      if (env.stage) syncStageCamera(env.stage);
      if (env.gardenPage) syncGardenCamera(env.gardenPage);
    }
    return env;
  }
  function preview3d() {
    const source = drag?.moved && drag.kind === 'item' ? drag.hit : null, yard = drag?.moved && drag.kind === 'yard-item' ? drag.hit : null;
    const def = source?.def || furnitureDef(yard?.defId || runtime.placing), point = source || yard ? drag.world : placementPoint;
    if (!def || unusableWorldPoint(point)) return null;
    if (def.place === 'yard') {
      const pos = G.sys?.yard?.position?.(def, point.x - (yard ? drag.offset.x : def.w / 2), point.y - (yard ? drag.offset.y : def.h / 2));
      return pos ? { def, item: Object.assign({}, yard || {}, pos) } : null;
    }
    const room = roomAt(point.x, point.y, false); if (!room) return null;
    const pos = placementCoords(def, room, point, source ? drag.grab : null, source?.item.uid);
    return { room, def, item: Object.assign({}, source?.item || {}, pos, { parent: pos.parentId === '__no_surface__' ? null : pos.parentId }) };
  }

  function getHouseView() {
    const view = runtime.houseView || {};
    const f = Number(view.floor);
    return {
      floor: view.floor === 'attic' ? 'attic' : Number.isInteger(f) && f >= 1 && f <= 4 ? f : 'all',
      view: view.view === 'exterior' ? 'exterior' : 'cutaway',
      previewFourFloors: Boolean(view.previewFourFloors)
    };
  }
  function effectiveHouseFloors() {
    const realFloors = Math.max(1, renderState()?.house?.floors?.length || 1);
    if (capturingPhoto) return realFloors;
    return getHouseView().previewFourFloors ? Math.max(4, realFloors) : realFloors;
  }
  function setHouseView(patch) {
    const prev = getHouseView(), next = Object.assign({}, prev, patch || {});
    const realFloors = Math.max(1, renderState()?.house?.floors?.length || 1);
    const maxFloors = next.previewFourFloors ? Math.max(4, realFloors) : realFloors;
    if (next.floor !== 'all' && next.floor !== 'attic') {
      const f = Number(next.floor);
      next.floor = Number.isInteger(f) && f >= 1 && f <= maxFloors ? f : 'all';
    }
    next.view = next.view === 'exterior' ? 'exterior' : 'cutaway';
    next.previewFourFloors = Boolean(next.previewFourFloors);
    runtime.houseView = next;
    if (initialized) {
      if (next.floor === 'attic') camera.focusObservatory(maxFloors);
      else if (typeof next.floor === 'number') camera.focusFloor(next.floor - 1);
      else camera.fit();
    }
    G.bus?.emit?.('house:view', next);
    requestDraw();
    return next;
  }
  function atmosphereTime() {
    if (!G.sys.time) return null;
    const now = Date.now();
    if (!ambientTime || now - ambientAt >= 1000) { ambientTime = G.sys.time.current(); ambientAt = now; }
    return ambientTime;
  }
  // 花园与前院共用地面中心线；绘制、命中、粒子和镜头统一读取此布局。
  function gardenLayout(count) {
    count = Number.isInteger(count) && count > 0 ? count : visitState ? 6 : G.sys?.garden?.capacity?.() || 6;
    const center = { x: 1000, y: 143 }, radius = { x: 330, y: 185 }, columns = count > 9 ? 4 : 3, rows = Math.ceil(count / columns);
    const plotWidth = 100, plotHeight = 66, gapX = 18, gapY = 20, gridWidth = columns * plotWidth + (columns - 1) * gapX, gridHeight = rows * plotHeight + (rows - 1) * gapY;
    const plots = Array.from({ length: count }, (_, index) => {
      const x = center.x - gridWidth / 2 + index % columns * (plotWidth + gapX), y = center.y - gridHeight / 2 + Math.floor(index / columns) * (plotHeight + gapY);
      return { index, x, y, w: plotWidth, h: plotHeight, cropX: x + plotWidth / 2, cropY: y + 38, cropSize: 78, particleX: x + plotWidth / 2, particleY: y + 12 };
    });
    return { center, radius, columns, rows, plots, header: { x: center.x - 150, y: center.y - radius.y - 64, w: 300, h: 44 }, bridge: { x: 640, y: 124, w: 120, h: 42 }, visitor: { x: center.x + 120, y: center.y - 130, hitRadius: 31 }, bounds: { left: center.x - radius.x, right: center.x + radius.x, top: center.y - radius.y - 80, bottom: 410 } };
  }
  function sceneBounds(floorCount) {
    const count = Number.isInteger(floorCount) && floorCount > 0 ? floorCount : Math.max(1, renderState()?.house?.floors?.length || 1), garden = gardenLayout();
    return { left: -710, right: garden.bounds.right, top: Math.min(-220 * count - (renderState()?.house?.attic ? 340 : 220), garden.bounds.top), bottom: 410 };
  }
  function frameFor(bounds, viewportWidth, viewportHeight, padding = 24, maxScale = 1.15, bottomInset = 0) {
    const scale = Math.max(.02, Math.min(maxScale, Math.max(1, viewportWidth - padding * 2) / (bounds.right - bounds.left), Math.max(1, viewportHeight - bottomInset - padding * 2) / (bounds.bottom - bounds.top)));
    return { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 + bottomInset / (2 * scale), scale };
  }
  function gardenPlotAt(point, count) {
    const plots = gardenLayout(count).plots;
    for (let i = plots.length - 1; i >= 0; i--) {
      const plot = plots[i], soil = point.x >= plot.x - 4 && point.x <= plot.x + plot.w + 4 && point.y >= plot.y - 4 && point.y <= plot.y + plot.h + 4;
      const planted = G.sys?.garden?.status?.(plot.index)?.crop, plant = planted && point.x >= plot.cropX - 34 && point.x <= plot.cropX + 34 && point.y >= plot.y - 38 && point.y <= plot.cropY + 8;
      if (soil || plant) return plot;
    }
    return null;
  }
  function gardenVisitorAt(point) { return !visitState && G.state.level >= G.data.gardenConfig.unlockLv && gardenVisitor && Math.hypot(point.x - gardenVisitor.x, point.y - gardenVisitor.y) <= gardenLayout().visitor.hitRadius; }
  const camera = {
    x: 0, y: -92, scale: 0.8, focusKind: 'overview', focusId: null,
    getInteractionMode() { return runtime.cameraInteractionMode === 'orbit' ? 'orbit' : 'pan'; },
    setInteractionMode(mode) { runtime.cameraInteractionMode = mode === 'orbit' ? 'orbit' : 'pan'; if (canvas?.dataset) canvas.dataset.cameraInteraction = runtime.cameraInteractionMode; G.bus?.emit?.('camera:interaction', { mode: runtime.cameraInteractionMode }); return runtime.cameraInteractionMode; },
    worldToScreen(x, y) { if (world3d?.ready) { world3d.setEnvironment(world3dEnvironment()); return world3d.worldToScreen(x, y); } return { x: (x - this.x) * this.scale + width / 2, y: (y - this.y) * this.scale + visibleHeight() / 2 }; },
    screenToWorld(x, y, defId) { if (world3d?.ready) { world3d.setEnvironment(world3dEnvironment(defId === undefined ? null : { forceHouse: true })); const def = defId === undefined ? furnitureDef(runtime.placing) || (drag?.moved && drag.kind === 'item' ? drag.hit.def : null) : furnitureDef(defId), placing = def ? { place: def.place, def, grab: defId === undefined && drag?.kind === 'item' ? drag.grab : null } : drag?.moved && drag.kind === 'yard-item' ? 'yard' : drag?.kind === 'room' ? 'floor' : null; lastPick = world3d.screenToWorld(x, y, placing); return lastPick; } const point = { x: (x - width / 2) / this.scale + this.x, y: (y - visibleHeight() / 2) / this.scale + this.y }, fixed = atticDecorRoom()?.observation.rect; return (defId !== undefined || runtime.placing || drag?.moved && drag.kind === 'item') && fixed && point.x >= fixed.x && point.x <= fixed.x + fixed.w && point.y >= fixed.y && point.y <= fixed.y + fixed.h ? { x: NaN, y: NaN, invalidProjection: true, target: { kind: 'fixed-observatory' } } : point; },
    rotate(dx, dy) { if (world3d?.ready) { world3d.setEnvironment(world3dEnvironment()); world3d.rotate(dx, dy); requestDraw(); } },
    // 3D 下平移只改 world3d.panVector、不写 camera.x/y；2D 云海背景靠 drawSky 里的 world3d.panShift() 同步，改这里要一并看那边。
    pan(dx, dy) { if (world3d?.ready) { world3d.setEnvironment(world3dEnvironment()); world3d.panScreen(dx, dy); } else { this.x -= dx / this.scale; this.y -= dy / this.scale; } requestDraw(); },
    resetView() {
      if (world3d?.ready) { const env = world3dEnvironment(); if (env.gardenPage) { clearPointerInteraction(); world3d.fitGarden(true); world3d.setEnvironment(env); this.setInteractionMode('pan'); requestDraw(); return; } }
      clearPointerInteraction(); runtime.placing = null; runtime.mode = 'explore';
      runtime.houseView = Object.assign({}, getHouseView(), { floor: 'all', previewFourFloors: false });
      world3d?.resetView(); this.setInteractionMode('pan');
      Object.assign(this, frameFor(sceneBounds(renderState()?.house?.floors?.length || 1), usableWidth(), visibleHeight(), 24, 1.15, 80));
      applyHouseFit('overview');
      if (pageStageActive) houseCameraBeforeStage = { x: this.x, y: this.y, scale: this.scale };
      G.bus?.emit?.('house:view', getHouseView()); requestDraw();
    },
    // 回到初始全景：先退出花园页/舞台页镜头并恢复家园相机，再重置角度/俯仰/平移，楼层回 all，最后重新取景。
    goHome() {
      clearPointerInteraction(); runtime.placing = null; runtime.selected = null; runtime.mode = 'explore';
      syncGardenCamera(null); syncStageCamera(null); gardenCameraRestored = false; lastPick = null;
      world3d?.resetView(); this.setInteractionMode('pan');
      // setHouseView 在已初始化时对 all 楼层调用 camera.fit()，回到默认缩放与平移。
      setHouseView({ floor: 'all', view: 'cutaway', previewFourFloors: false });
      requestDraw();
    },
    fit() {
      if (world3d?.ready && !capturingPhoto) {
        const env = world3dEnvironment();
        if (env.gardenPage || gardenCameraRestored || env.stage || env.restoredStageCamera) {
          if (env.stage) world3d.fitStage(env.stage);
          world3d.setEnvironment(env); gardenCameraRestored = false; requestDraw(); return;
        }
      }
      if (runtime.placing && furnitureDef(runtime.placing)?.place !== 'yard' && runtime.activeRoomId && !panelHeight) { this.focusRoom(runtime.activeRoomId); return; }
      if (runtime.mode === 'roomLayout' && runtime.activeRoomId && G.state?.house?.rooms?.[runtime.activeRoomId]) { this.focusRoom(runtime.activeRoomId); return; }
      if (runtime.mode === 'observatory' && G.state?.house?.attic) { this.focusObservatory(); return; }
      if (runtime.mode === 'garden') { this.focusGarden(); return; }
      if (runtime.mode === 'yard') { this.focusYard(); return; }
      if (panelHeight && width < 650 && ['build', 'decorate'].includes(runtime.mode) && runtime.activeRoomId) { this.focusRoom(runtime.activeRoomId); return; }
      const hv = getHouseView();
      if (hv.floor === 'attic') { this.focusObservatory(effectiveHouseFloors()); return; }
      if (typeof hv.floor === 'number') { this.focusFloor(hv.floor - 1); return; }
      // 全景为底部缩放按钮留出空间，避免按钮盖住花园底排。
      Object.assign(this, frameFor(sceneBounds(effectiveHouseFloors()), usableWidth(), visibleHeight(), 24, 1.15, 80));
      applyHouseFit('overview');
    },
    zoom(factor, point) {
      const viewport = sceneViewport();
      if (!Number.isFinite(factor) || factor <= 0) return;
      if (world3d?.ready) { world3d.setEnvironment(world3dEnvironment()); world3d.zoomScreen(factor, point); requestDraw(); return; }
      const anchor = point && (!world3d?.ready || world3d.containsScreen(point.x, point.y)) ? point : { x: viewport.x + viewport.width / 2, y: viewport.y + viewport.height / 2 };
      const before = this.screenToWorld(anchor.x, anchor.y);
      this.scale = clamp(this.scale * factor, 0.04, 2);
      const after = this.screenToWorld(anchor.x, anchor.y);
      if (Number.isFinite(before.x) && Number.isFinite(before.y) && Number.isFinite(after.x) && Number.isFinite(after.y)) { this.x += before.x - after.x; this.y += before.y - after.y; }
      requestDraw();
    },
    focusRoom(roomId) {
      const room = decorSpace(roomId);
      if (!room) return;
      if (room.kind === 'attic') { this.focusObservatory(); return; }
      this.x = room.x + 160;
      this.y = room.y + 115;
      this.scale = clamp(Math.min((usableWidth() - 80) / 430, (visibleHeight() - 50) / 330), 0.5, 2);
      applyHouseFit('room', roomId);
    },
    focusFloor(floorIdx) {
      const idx = clamp(Number(floorIdx) || 0, 0, Math.max(0, effectiveHouseFloors() - 1));
      const top = -220 * (idx + 1) - 24, bottom = -220 * idx + 28;
      Object.assign(this, frameFor({ left: -535, right: 545, top, bottom }, usableWidth(), visibleHeight(), 20, 1.45));
      this.focusFloorIndex = idx; applyHouseFit('floor');
    },
    focusObservatory(floorCount) {
      const attic = atticLayout(floorCount);
      Object.assign(this, frameFor({ left: attic.x - 40, right: attic.x + 510, top: attic.y - 50, bottom: attic.y + 245 }, usableWidth(), visibleHeight(), 20, 1.65));
      applyHouseFit('attic');
    },
    focusGarden() {
      if (world3d?.ready) { const env = world3dEnvironment(); if (env.gardenPage) { world3d.setEnvironment(env); requestDraw(); return; } }
      Object.assign(this, frameFor(gardenLayout().bounds, usableWidth(), visibleHeight(), 18, 1.4));
      applyHouseFit('garden');
    },
    focusSea() {
      const base = sceneBounds(), sea = G.seaMap?.bounds();
      const bounds = sea ? { left: Math.min(base.left, sea.left), right: Math.max(base.right, sea.right), top: Math.min(base.top, sea.top), bottom: Math.max(base.bottom, sea.bottom) } : base;
      Object.assign(this, frameFor(bounds, usableWidth(), visibleHeight(), 24, 1.15, 80));
      applyHouseFit('sea');
    },
    focusYard() {
      Object.assign(this, frameFor({ left: -710, right: 710, top: -35, bottom: 410 }, usableWidth(), visibleHeight(), 18, 1.5));
      applyHouseFit('yard');
    },
    focusPlayer() {
      if (playerHit) {
        this.x = playerHit.x + playerHit.w / 2;
        this.y = playerHit.y + playerHit.h / 2;
        this.scale = Math.min(2.0, Math.max(1.3, this.scale * 1.3));
        applyHouseFit('focus');
        requestDraw();
        return true;
      }
      const p = G.runtime?.player;
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
        this.x = p.x;
        this.y = p.y;
        this.scale = Math.min(2.0, Math.max(1.3, this.scale * 1.3));
        applyHouseFit('focus');
        requestDraw();
        return true;
      }
      this.fit();
      return false;
    }
  };

  function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }
  function shade(hex, amount) {
    if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) return hex || palette.ink;
    return '#' + [1, 3, 5].map(i => clamp(parseInt(hex.slice(i, i + 2), 16) + amount, 0, 255).toString(16).padStart(2, '0')).join('');
  }
  function visibleHeight() { return sceneViewport().height; }
  function rr(c, x, y, w, h, radius, fill, stroke, lineWidth) {
    const r = Math.min(radius || 0, Math.abs(w) / 2, Math.abs(h) / 2);
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lineWidth || 2; c.stroke(); }
  }
  function ellipse(c, x, y, rx, ry, fill, stroke, lw) {
    c.beginPath(); c.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), 0, 0, TAU);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 2; c.stroke(); }
  }
  function line(c, x1, y1, x2, y2, color, lw) {
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.strokeStyle = color; c.lineWidth = lw || 2; c.stroke();
  }
  function poly(c, points, fill, stroke, lw) {
    c.beginPath(); points.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 2; c.stroke(); }
  }
  function text(c, value, x, y, size, color, align, weight) {
    c.font = `${weight || 500} ${size || 16}px ui-rounded, "PingFang SC", "Microsoft YaHei", sans-serif`;
    c.textAlign = align || 'center'; c.textBaseline = 'middle'; c.fillStyle = color || palette.ink; c.fillText(value, x, y);
  }
  function star(c, x, y, radius, color, rotation) {
    const points = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5 + (rotation || 0); const r = i % 2 ? radius * .46 : radius; points.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
    poly(c, points, color);
  }
  function heart(c, x, y, size, color) {
    c.beginPath(); c.moveTo(x, y + size * .46);
    c.bezierCurveTo(x - size * 1.05, y - size * .08, x - size * .45, y - size * .8, x, y - size * .32);
    c.bezierCurveTo(x + size * .45, y - size * .8, x + size * 1.05, y - size * .08, x, y + size * .46);
    c.fillStyle = color; c.fill();
  }
  function cloud(c, x, y, scale, color) {
    c.save(); c.translate(x, y); c.scale(scale, scale); c.fillStyle = color;
    c.beginPath(); c.moveTo(-68, 14); c.bezierCurveTo(-95, 12, -94, -14, -68, -18);
    c.bezierCurveTo(-72, -48, -29, -57, -12, -32); c.bezierCurveTo(3, -62, 48, -48, 49, -21);
    c.bezierCurveTo(82, -31, 102, 7, 74, 19); c.bezierCurveTo(34, 31, -36, 26, -68, 14); c.closePath(); c.fill(); c.restore();
  }
  function flower(c, x, y, size, color, angle) {
    c.save(); c.translate(x, y); c.rotate(angle || 0);
    for (let i = 0; i < 5; i++) { c.save(); c.rotate(i * TAU / 5); ellipse(c, 0, -size * .56, size * .38, size * .56, color); c.restore(); }
    ellipse(c, 0, 0, size * .32, size * .32, '#E6C57E'); c.restore();
  }
  function leaf(c, x, y, size, color, angle) {
    c.save(); c.translate(x, y); c.rotate(angle || 0); c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-size * .9, -size * .6, 0, -size * 1.5); c.quadraticCurveTo(size * .9, -size * .6, 0, 0); c.fillStyle = color; c.fill(); c.restore();
  }
  function rooms() {
    const house = renderState()?.house;
    if (!house) return [];
    const result = [];
    (house.floors || []).forEach((f, floorIdx) => {
      (f.slots || []).forEach((id, slotIdx) => {
        result.push({ id, floorIdx, slotIdx, x: -480 + slotIdx * 320, y: -220 - floorIdx * 220, data: id ? house.rooms?.[id] : null });
      });
    });
    return result;
  }
  function atticLayout(floorCount) {
    const count = Number.isInteger(floorCount) && floorCount > 0 ? floorCount : Math.max(1, renderState()?.house?.floors?.length || 1);
    return { x: -160, y: -220 * count - 295, w: 320, h: 185 };
  }
  function atticDecorRoom() {
    const state = renderState(), id = G.store?.atticRoomId || 'attic:observatory', data = G.store?.decorRoom?.(state, id);
    if (!data || !state?.house?.attic) return null;
    const count = Math.max(1, state.house.floors.length), layout = atticLayout(count), base = .24 + count * 2.2 + .17;
    return { kind: 'attic', id, x: layout.x, y: layout.y, w: 320, h: 220, data,
      frame: { x: 0, y: base, backZ: -1.25, minZ: -1.35, maxZ: 1.5 },
      bounds: { min: [-2, base - .15, -3.3], max: [3.5, base + 3.35, 1.7] },
      observation: { p: [2.45, base + .16, -2.05], size: [1.35, 2.25, 1.65], world: { x: layout.x + 410, y: layout.y + 90 }, rect: { x: layout.x + 345, y: layout.y + 12, w: 140, h: 145 } } };
  }
  function decorSpace(id) { const attic = atticDecorRoom(); return attic?.id === id ? attic : rooms().find(room => room.id === id && room.data) || null; }
  function decorSpaces() { const attic = atticDecorRoom(); return attic ? rooms().concat(attic) : rooms(); }
  function atticAt(point) { const a = atticLayout(effectiveHouseFloors()); return (!!renderState()?.house?.attic || getHouseView().floor === 'attic') && point.x >= a.x && point.x <= a.x + a.w && point.y >= a.y && point.y <= a.y + a.h; }
  function furnitureDef(id) { return G.data?.furnitureById?.[id] || G.data?.furniture?.find(d => d.id === id); }
  function floorLine() { return G.data?.balance?.floorLine || 200; }
  function roomAt(x, y, allowEmpty) { const hit = currentPick(x, y); if (hit) { if (hit.fixed) return null; const room = hit.room || decorSpace(hit.roomId); return room && (allowEmpty || room.id) ? room : null; } return decorSpaces().find(r => x >= r.x && x <= r.x + 320 && y >= r.y && y <= r.y + 220 && (allowEmpty || r.id)); }
  // 名牌只占房间上缘，命中与绘图共用几何，不遮掉家具主体。
  function roomLabel(roomOrId) {
    const room = typeof roomOrId === 'string' ? rooms().find(entry => entry.id === roomOrId) : roomOrId;
    if (!room?.id || !room.data || room.kind === 'attic') return null;
    return { roomId: room.id, floorIdx: room.floorIdx, slotIdx: room.slotIdx, x: room.x + 76, y: room.y + 9, w: 168, h: 30 };
  }
  function openRoomSlot(room) {
    const cap = G.sys?.building?.capacity?.() || { floors: G.state?.house?.floors?.length || 1, slots: 3 };
    return !!room && room.kind !== 'attic' && room.floorIdx < cap.floors && room.slotIdx < cap.slots;
  }
  function roomLabelAt(point) {
    if (point.target && world3d?.ready) return point.target.kind === 'room-label' ? roomLabel(point.target.roomId) : null;
    return rooms().filter(openRoomSlot).map(roomLabel).find(label => label && point.x >= label.x && point.x <= label.x + label.w && point.y >= label.y && point.y <= label.y + label.h) || null;
  }
  function roomLayoutSnapshot() { return JSON.stringify(G.state.house.floors.map(floor => floor.slots)); }
  function roomDragValid(state) {
    const room = rooms().find(entry => entry.id === state.roomId);
    return !!room && openRoomSlot(room) && room.floorIdx === state.from.floorIdx && room.slotIdx === state.from.slotIdx && room.data?.type === state.roomType && state.snapshot === roomLayoutSnapshot();
  }
  function clearPointerInteraction() {
    pointers.forEach((_, id) => { try { if (canvas?.hasPointerCapture?.(id)) canvas.releasePointerCapture(id); } catch (_) {} });
    pointers.clear(); drag = null; pinch = null; placementPoint = null;
    if (canvas) canvas.style.cursor = runtime.placing ? 'copy' : 'grab';
  }
  function cancelPlacement() {
    const defId = runtime.placing || null, roomId = runtime.activeRoomId || null;
    placementEpoch++; runtime.placing = null; runtime.mode = 'explore'; runtime.selected = null;
    clearPointerInteraction(); hover = null; lastPick = null;
    G.bus?.emit?.('placement:cancelled', { defId, roomId }); requestDraw();
    return { ok: true, message: '已取消摆放。' };
  }
  function beginPlacement(defId, roomId) {
    if (visitState) return { ok: false, message: '正在串门，先回自己的小屋再装扮吧。' };
    const def = furnitureDef(defId), room = decorSpace(roomId);
    if (!def) return { ok: false, message: '这件家具已经不在当前背包里了，请重新选择。' };
    if (def.place === 'yard') return { ok: false, message: '这件家具请在前院里摆放。' };
    if (!['floor', 'table', 'wall', 'ceiling'].includes(def.place)) return { ok: false, message: '这件物品不能摆在房间里。' };
    if (!room) return { ok: false, message: '请重新选择一间已经建好的房间。' };
    if (!(G.state?.inventory?.[def.id] > 0)) return { ok: false, message: '这件家具已经用完啦，请从背包重新选择。' };
    placementEpoch++; clearPointerInteraction(); hover = null; lastPick = null;
    runtime.placing = def.id; runtime.mode = 'decorate'; runtime.selected = null; runtime.activeRoomId = room.id;
    syncGardenCamera(null); gardenCameraRestored = false;
    // 摆放入口必须露出真实支撑平面；单独focusRoom不会退出阁楼/屋外或修正背面镜头。
    if (world3d) { world3d.resetView(); world3d.angle = 0; }
    setHouseView({ floor: room.kind === 'attic' ? 'attic' : room.floorIdx + 1, view: 'cutaway', previewFourFloors: false });
    camera.focusRoom(room.id);
    if (canvas) canvas.style.cursor = 'copy';
    requestDraw(); return { ok: true, message: '点一下房间，放下' + def.name + '。', roomId: room.id, defId: def.id };
  }
  function draggedItemId(event) { return event.dataTransfer?.getData('application/x-marshmallow-item') || event.dataTransfer?.getData('application/x-marshmallow-furniture') || event.dataTransfer?.getData('text/plain') || runtime.placing; }
  function staleHtmlDrag(transfer) {
    if (!transfer || typeof transfer !== 'object') return false;
    if (!htmlDrags.has(transfer)) htmlDrags.set(transfer, placementEpoch);
    return htmlDrags.get(transfer) !== placementEpoch;
  }
  function drawRoomLabels(c) {
    if (capturingPhoto || visitState || getHouseView().view === 'exterior') return;
    const focused = typeof getHouseView().floor === 'number' ? getHouseView().floor - 1 : null;
    rooms().filter(room => room.id && room.data && openRoomSlot(room) && (focused === null || room.floorIdx === focused)).forEach(room => {
      const label = roomLabel(room), active = drag?.kind === 'room' && drag.roomId === room.id, name = G.data.rooms.find(def => def.id === room.data.type)?.name || '房间';
      rr(c, label.x, label.y, label.w, label.h, 12, active ? '#FFE2EB' : '#FFF8E9', active ? '#AD738B' : '#CDB39C', 1.5);
      for (let row = 0; row < 3; row++) for (let col = 0; col < 2; col++) ellipse(c, label.x + 13 + col * 5, label.y + 10 + row * 5, 1, 1, '#9E7D83');
      text(c, name + ' · 换位', label.x + label.w / 2 + 6, label.y + 15, 12, '#6B4E5E', 'center', 600);
    });
    if (drag?.kind !== 'room' || !drag.moved || unusableWorldPoint(drag.world)) return;
    const target = roomAt(drag.world.x, drag.world.y, true), valid = roomDragValid(drag) && openRoomSlot(target), different = valid && target.id !== drag.roomId;
    if (valid) {
      c.save(); c.setLineDash([8, 6]); rr(c, target.x + 6, target.y + 5, 308, 210, 12, 'rgba(189,236,214,.23)', different ? '#668F71' : '#AD8494', 3); c.restore();
    }
    const name = valid && target.data ? G.data.rooms.find(def => def.id === target.data.type)?.name || '房间' : '';
    const caption = !valid ? '拖到已开放的房间格' : !different ? '放回原来的位置' : target.id ? '与' + name + '互换位置' : '移到这块空位';
    const position = { x: drag.world.x, y: drag.world.y - 30 }, size = Math.max(174, caption.length * 12 + 24);
    rr(c, position.x - size / 2, position.y - 15, size, 30, 12, '#FFF6DC', valid ? '#9EBA97' : '#D7B6C3', 1.5);
    text(c, caption, position.x, position.y, 12, '#6B4E5E', 'center', 600);
  }
  function itemPosition(room, item) { return G.roomSpace.item(room, item); }
  function roomItemGroups(room) {
    const items = room.items || [];
    return items.filter(item => !item.parent || !items.some(parent => parent.uid === item.parent)).map(item => {
      const def = furnitureDef(item.defId), pos = itemPosition(room, item);
      const depth = def?.place === 'wall' || def?.place === 'ceiling' ? -2 : def?.template === 'rug' ? -1 : def?.place === 'floor' ? pos.depth : .75;
      return { item, depth, z: item.z || 0, members: [item, ...items.filter(child => child.parent === item.uid).sort((a, b) => a.z - b.z)] };
    }).sort((a, b) => a.depth - b.depth || a.z - b.z);
  }
  function itemAt(x, y) {
    const picked = currentPick(x, y);
    if (picked) { if (picked.kind !== 'item') return null; const room = decorSpace(picked.roomId), item = room?.data?.items?.find(v => v.uid === picked.uid), def = item && furnitureDef(item.defId); return item && def ? { room, item, def, pos: itemPosition(room.data, item), depth: item.depth || 0, z: item.z || 0 } : null; }
    const room = roomAt(x, y, false);
    if (!room?.data) return null;
    const ordered = roomItemGroups(room.data).flatMap(group => group.members).reverse();
    for (const item of ordered) {
      if (drag?.moved && drag.kind === 'item' && (item.uid === drag.hit.item.uid || item.parent === drag.hit.item.uid)) continue;
      const def = furnitureDef(item.defId); if (!def) continue;
      const pos = itemPosition(room.data, item);
      if (G.roomSpace.contains(pos, { x: x - room.x, y: y - room.y }, 3)) return { room, item, def, pos, depth: roomItemGroups(room.data).find(group => group.members.includes(item))?.depth ?? 0, z: item.z || 0 };
    }
    return null;
  }
  function yardAt(x, y) {
    const picked = currentPick(x, y); if (picked) return picked.kind === 'yard-item' ? (renderState().house.yard.items || []).find(v => v.uid === picked.uid) || null : null;
    return (renderState().house.yard.items || []).slice().sort((a, b) => b.z - a.z).find(item => {
      const def = furnitureDef(item.defId);
      return def && x >= item.x && x <= item.x + def.w && y >= item.y && y <= item.y + def.h;
    });
  }
  function inYard(point) {
    if (unusableWorldPoint(point)) return false;
    const bounds = G.data.yardConfig?.bounds || { left: -650, right: 650, top: 20, bottom: 270 };
    return point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom;
  }

  function drawSky(c) {
    if (G.atmosphere && atmosphereTime()) {
      G.atmosphere.sky(c, { width, height, time: atmosphereTime(), state: G.state, reducedMotion, now: time * 1000, fewClouds: !!G.cloudSea });
      // 非转动视角拖动＝拖整张“桌布”：天空云海的视差必须跟着 3D 一起动。3D 平移只改 world3d.panVector、不写 camera.x/y，
      // 如果这里直接传 camera，背景就纹丝不动，只剩小屋在滑，看起来像“在拖房子”。所以把 panVector 折算回 camera.x/y 的单位叠上去。
      const shift = world3d?.ready ? world3d.panShift() : { x: 0, y: 0 };
      if (G.cloudSea) G.cloudSea.draw(c, { width, height, centerY: visibleHeight() / 2, camera: { x: camera.x + shift.x, y: camera.y + shift.y, scale: camera.scale }, time: atmosphereTime(), reducedMotion, now: time });
      return;
    }
    const night = G.state?.settings?.dayMode === 'night';
    const grad = c.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, night ? '#DDD9EC' : '#E8F1EE'); grad.addColorStop(.65, '#F8EFE9'); grad.addColorStop(1, '#FFF5EB');
    c.fillStyle = grad; c.fillRect(0, 0, width, height);
    const glow = c.createRadialGradient(width * .72, height * .20, 0, width * .72, height * .20, width * .37);
    glow.addColorStop(0, '#FFF9E8'); glow.addColorStop(1, 'rgba(255,249,232,0)'); c.fillStyle = glow; c.fillRect(0, 0, width, height);
    c.save(); c.globalAlpha = .64;
    cloud(c, width * .13 + Math.sin(time * .07) * 10, height * .27, 1.05, '#FFFFFF');
    cloud(c, width * .87 + Math.sin(time * .05 + 2) * 12, height * .43, 1.4, '#FFFFFF');
    cloud(c, width * .04, height * .71, 1.65, '#FFFFFF');
    cloud(c, width * .64, height * .84, 1.9, '#FFFFFF'); c.restore();
    // 纸页般的细小光点，让整个场景保持轻盈。
    for (let i = 0; i < 22; i++) {
      const x = (i * 173 + 61) % width, y = ((i * 127 + 42) % Math.max(1, height - 50)) + 10;
      c.globalAlpha = .22 + (Math.sin(time * .6 + i) + 1) * .10;
      if (i % 3 === 0) { line(c, x - 3, y, x + 3, y, '#CBAE8D', 1); line(c, x, y - 3, x, y + 3, '#CBAE8D', 1); }
      else ellipse(c, x, y, 1.5, 1.5, '#CDAF9F');
    }
    c.globalAlpha = 1;
  }
  function drawIsland(c) {
    // 屋前向外伸展的大草坪，给走动、野餐和庭院家具留出空间。
    ellipse(c, 0, 333, 610, 23, 'rgba(151,151,153,.09)');
    cloud(c, -280, 281, 2.9, '#FFF9F2'); cloud(c, 280, 281, 2.9, '#FFF9F2'); cloud(c, 0, 299, 3.3, '#FFF9F2');
    ellipse(c, 0, 220, 679, 105, '#D6C1A0', '#C5AF8F', 2);
    ellipse(c, 0, 143, 710, 158, '#C3DFC5', '#AECEB2', 3);
    ellipse(c, 0, 132, 685, 146, '#D8E9CD');
    // 云朵托起的悬浮小岛，与房子共用柔软的奶油色轮廓。
    ellipse(c, 0, 14, 610, 87, '#D8E9CD');
    ellipse(c, 0, 1, 582, 68, '#D8E9CD');
    c.save(); c.globalAlpha = .45;
    for (let i = 0; i < 44; i++) {
      const x = Math.sin(i * 34.3) * 558, y = 11 + Math.cos(i * 18.4) * 42;
      line(c, x - 3, y + 2, x - 1, y - 4, '#A1BD97', 1.5); line(c, x - 1, y + 2, x + 3, y - 3, '#A1BD97', 1.5);
    } c.restore();
    // 门前石子与灌木。
    for (let i = 0; i < 4; i++) ellipse(c, -5 + Math.sin(i * 1.8) * 10, 29 + i * 14, 19 + i * 3, 6, '#F6E5CE', '#DDC9AF', 1.5);
    bush(c, -520, -14, .9); bush(c, 524, -12, 1.05);
    for (let i = 0; i < 13; i++) {
      const x = -535 + i * 88, y = 42 + Math.sin(i * 2.1) * 20;
      if (Math.abs(x) < 70) continue;
      line(c, x, y + 7, x + Math.sin(time * .7 + i) * 1.4, y - 2, '#96B994', 2);
      flower(c, x + Math.sin(time * .7 + i) * 1.4, y - 4, i % 2 ? 5 : 6, i % 3 ? '#FCF5E2' : '#EAB7C2', .25);
    }
    // 小信箱与花园围栏。
    line(c, -564, -5, -564, 34, '#BE9F84', 9); rr(c, -584, -33, 42, 31, 13, '#E7AFBC', '#C58E9D', 2.5); rr(c, -578, -25, 26, 18, 8, '#F8DADE'); line(c, -557, -34, -557, -47, '#BA8B9A', 3); poly(c, [[-557, -47], [-543, -45], [-557, -39]], '#EBC58C');
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) { const x = side * (442 + i * 24); rr(c, x - 4, -2 + i * .8, 8, 35, 4, '#FFF3DC', '#D9C8AE', 1.5); }
      line(c, side * 436, 10, side * 520, 13, '#EDDDC4', 5); line(c, side * 436, 25, side * 520, 28, '#EDDDC4', 5);
    }
    // 悬垂叶片，给小岛一些细节。
    for (let i = 0; i < 7; i++) {
      const x = -460 + i * 148, y = 71 + Math.cos(i) * 8;
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 16, y + 20, x + 4, y + 41); c.strokeStyle = '#9DBB9C'; c.lineWidth = 2; c.stroke();
      leaf(c, x + 5, y + 19, 10, '#A2C39F', -.8); leaf(c, x + 9, y + 29, 8, '#A2C39F', .7);
    }
    for (let i = 0; i < 7; i++) {
      const sx = Math.sin(i * 1.45) * 18, sy = 76 + i * 25, rx = 25 + (i % 2) * 4, ry = 8.5;
      ellipse(c, sx, sy + 2, rx, ry, 'rgba(138,112,86,.18)');
      ellipse(c, sx, sy, rx, ry, '#F6E5CE', '#DDC9AF', 1.4);
      line(c, sx - rx * .45, sy - 2, sx + rx * .35, sy - 2, '#FFF8EE', 1.5);
    }
    // 前院左侧立体茶歇角（当玩家未在此处密集摆放庭院家具时作为自然底景）。
    if (!(renderState()?.house?.yard?.items?.length > 4)) {
      c.save(); c.translate(-355, 148);
      ellipse(c, 0, 14, 58, 18, 'rgba(106,138,104,.16)');
      ellipse(c, -36, 8, 15, 9, '#F2A999', '#CF8475', 1.4);
      ellipse(c, 36, 8, 15, 9, '#A7D7B8', '#7FB091', 1.4);
      ellipse(c, 0, 22, 16, 8, '#F6D788', '#CFAF62', 1.4);
      rr(c, -5, -2, 10, 16, 3, '#B98558', '#966842', 1.4);
      ellipse(c, 0, -4, 30, 13, '#DFB07A', '#B88452', 1.8);
      ellipse(c, 0, -6, 25, 10, '#F5DEC0');
      ellipse(c, -8, -7, 5, 3.5, '#FFFDF7', '#CDB8A2', 1);
      ellipse(c, 9, -6, 5, 3.5, '#FFFDF7', '#CDB8A2', 1);
      c.restore();
    }
    for (let i = 0; i < 26; i++) {
      const x = Math.sin(i * 43.1) * 625, y = 112 + (i * 43) % 140;
      if (Math.abs(x) < 63 || Math.abs(x) > 580 && y > 205) continue;
      line(c, x, y + 5, x - 2, y - 3, '#A6C49D', 1.5); line(c, x, y + 5, x + 3, y - 1, '#A6C49D', 1.5);
      if (i % 3 === 0) flower(c, x, y - 5, 5, i % 2 ? '#F8E8C7' : '#F0C6D0');
    }
    bush(c, -610, 152, .8); bush(c, 610, 152, .8);
  }
  function bush(c, x, y, scale) {
    c.save(); c.translate(x, y); c.scale(scale, scale);
    ellipse(c, 0, 18, 47, 10, 'rgba(106,144,112,.12)');
    ellipse(c, -25, 1, 25, 25, '#B1CCA6'); ellipse(c, 3, -11, 33, 36, '#B5D0AC'); ellipse(c, 30, 6, 23, 25, '#A8C69D');
    for (let i = 0; i < 6; i++) flower(c, Math.sin(i * 4.3) * 33, -8 + Math.cos(i * 3.2) * 17, 4, i % 2 ? '#F8E4D2' : '#F4C8CF');
    c.restore();
  }

  function gardenPositions() {
    return gardenLayout().plots;
  }
  function drawGarden(c) {
    if (!G.sys?.garden || !G.ui?.garden) return;
    const unlocked = renderState().level >= G.data.gardenConfig.unlockLv, layout = gardenLayout(), { center, radius, header, bridge } = layout;
    cloud(c, center.x, 310, 3.3, '#FFF9F2');
    ellipse(c, center.x, 195, radius.x - 8, 145, '#D8C6A6', '#C8B38F', 2);
    ellipse(c, center.x, center.y, radius.x, radius.y, '#D7E7C6', '#B3C99D', 3);
    // 小石桥连接房子与花圃，视觉上仍是一座连在一起的小岛。
    rr(c, bridge.x, bridge.y, bridge.w, bridge.h, 16, '#F2E2C8', '#D1BD9D', 2);
    for (let x = bridge.x + 15; x < bridge.x + bridge.w - 8; x += 18) line(c, x, bridge.y + 6, x, bridge.y + bridge.h - 7, '#DAC7AB', 1.5);
    rr(c, header.x, header.y, header.w, header.h, 17, '#FFF5DC', '#C9B98E', 2);
    text(c, unlocked ? '一粒种子，一份小期待' : '小花园 · Lv.6 开放', header.x + header.w / 2, header.y + header.h / 2, 15, '#7A815F', 'center', 650);
    layout.plots.forEach(position => {
      const state = visitState ? {} : G.sys.garden.status(position.index), x = position.x, y = position.y;
      ellipse(c, position.cropX, y + position.h * .57, position.w * .54, 21, '#AC967C22');
      rr(c, x, y, position.w, position.h, 18, state.mature ? '#DBD3A1' : '#DDBE9C', '#BFA17E', 2);
      rr(c, x + 5, y + 5, position.w - 10, position.h - 12, 14, '#F0D8B7', '#D2B38F', 1);
      if (state.crop) G.ui.garden.drawCrop(c, state.crop, state.stage, position.cropX, position.cropY, position.cropSize);
      else {
        for (let i = 0; i < 3; i++) line(c, x + 20, y + 18 + i * 12, x + position.w - 20, y + 18 + i * 12, '#CDAF8E', 1.5);
        if (unlocked && !capturingPhoto) text(c, '+', position.cropX, y + 28, 26, '#A48C6D');
      }
      if (state.mature && !capturingPhoto) star(c, x + position.w - 16, y + 8, 8, '#F5CB69', -.2);
      else if (state.needsWater && !capturingPhoto) { ellipse(c, x + position.w - 16, y + 8, 6, 8, '#A8D1E3'); text(c, '水', x + position.w - 16, y + 8, 7, '#5A8AA3'); }
      if (!unlocked) { c.save(); c.globalAlpha = .45; rr(c, x, y, position.w, position.h, 18, '#FFF7E4'); c.restore(); }
    });
    if (unlocked && !visitState && !document.hidden) {
      const now = Date.now();
      if (!capturingPhoto && !gardenVisitor && now >= nextVisitorAt) gardenVisitor = { at: now, bee: Math.random() > .5, x: layout.visitor.x, y: layout.visitor.y };
      if (!capturingPhoto && gardenVisitor && now - gardenVisitor.at > 90000) { gardenVisitor = null; nextVisitorAt = now + 60000; }
      if (gardenVisitor) {
        const visitor = gardenVisitor;
        if (!capturingPhoto) { visitor.x = layout.visitor.x + (reducedMotion ? 0 : Math.sin(time * .7) * 14); visitor.y = layout.visitor.y + (reducedMotion ? 0 : Math.cos(time * 1.5) * 8); }
        const x = visitor.x, y = visitor.y;
        ellipse(c, x, y, 24, 23, '#FFFAE7', '#D5C7A3', 1.5);
        if (visitor.bee) {
          ellipse(c, x - 6, y - 8, 7, 10, '#E3EEF1'); ellipse(c, x + 6, y - 8, 7, 10, '#E3EEF1');
          ellipse(c, x, y + 2, 12, 9, '#EFD181', '#BD9F6A', 1);
          line(c, x - 4, y - 5, x - 4, y + 9, '#AF9068', 3); line(c, x + 3, y - 5, x + 3, y + 9, '#AF9068', 3);
          ellipse(c, x + 9, y, 2, 2, '#7D6A60');
        } else {
          const wing = reducedMotion ? 8 : 8 + Math.sin(time * 8) * 2;
          ellipse(c, x - 8, y - 3, wing, 12, '#EDBDCF'); ellipse(c, x + 8, y - 3, wing, 12, '#D3C4E8');
          line(c, x, y - 11, x, y + 10, '#AE8CA4', 3);
        }
        if (!capturingPhoto) text(c, '点点我 +5', x, y + 38, 11, '#7A815F');
      }
    }
  }

  function drawPreviewSlot(c, floorIdx, slotIdx) {
    const x = -480 + slotIdx * 320, y = -220 - floorIdx * 220;
    const names = [['云端温室', '手工花房', '星光露台'], ['观景书房', '绘本画室', '甜梦客房'], ['暖阳茶室', '烘焙工坊', '音乐小厅']];
    const roomTitle = (names[3 - Math.min(3, floorIdx)] || names[0])[slotIdx % 3];
    const unlockLv = floorIdx === 3 ? 25 : floorIdx === 2 ? 17 : 6;
    const wallColors = ['#F8EFE2', '#EBF4EC', '#F3ECF8'];
    c.save(); c.translate(x, y);
    drawRoomShell(c, { wallpaper: { color: wallColors[slotIdx % 3], pattern: ['dots', 'stripes', 'stars'][slotIdx % 3], color2: '#FFFFFF' }, floor: { color: '#E6C59E', pattern: 'wood' } });
    defaultWindow(c, 124, 42, 72, 82);
    const sampleIds = [['bookshelf_basic', 'potted_plant_basic'], ['sofa_basic', 'coffee_table_basic'], ['bed_basic', 'nightstand_basic']][slotIdx % 3];
    sampleIds.forEach((defId, idx) => {
      const def = furnitureDef(defId);
      if (def) { c.save(); c.globalAlpha = .86; drawFurniture(c, def, idx === 0 ? 46 : 210, 196 - def.h, {}); c.restore(); }
    });
    rr(c, 64, 10, 192, 28, 12, 'rgba(255,249,232,.92)', '#C2A882', 1.5);
    text(c, `${floorIdx + 1}F ${roomTitle} · Lv.${unlockLv} 预览`, 160, 24, 11.5, '#6B5848', 'center', 650);
    c.restore();
  }

  function drawExteriorBay(c, floorIdx, slotIdx, exterior) {
    const bx = -480 + slotIdx * 320 + 160, by = -220 * (floorIdx + 1);
    if (floorIdx === 0 && slotIdx === 1 && G.draw?.exterior) {
      rr(c, bx - 68, by + 206, 136, 14, 6, '#E6D2B8', '#C4AC8E', 2);
      G.draw.exterior.door(c, bx - 54, by + 68, 108, 144, exterior);
      flower(c, bx - 64, by + 196, 6, '#E88D83');
      flower(c, bx + 64, by + 196, 6, '#F2C96B');
      return;
    }
    rr(c, bx - 66, by + 54, 18, 86, 5, '#8DB48E', '#6E9470', 1.8);
    rr(c, bx + 48, by + 54, 18, 86, 5, '#8DB48E', '#6E9470', 1.8);
    if (G.draw?.exterior) G.draw.exterior.window(c, bx - 44, by + 48, 88, 94, exterior, atmosphereTime() || {});
    else defaultWindow(c, bx - 36, by + 52, 72, 82);
    rr(c, bx - 48, by + 140, 96, 14, 5, '#C98C63', '#A66E49', 1.8);
    flower(c, bx - 26, by + 137, 5.5, '#E88D83');
    flower(c, bx, by + 136, 6, '#F2C96B');
    flower(c, bx + 26, by + 137, 5.5, '#B9A3E3');
  }

  function drawHouse(c) {
    const house = renderState()?.house || {};
    const realFloors = Math.max(1, house.floors?.length || 1);
    const hv = capturingPhoto ? { floor: captureFloorFocus || 'all', view: captureViewMode || 'cutaway', previewFourFloors: false } : getHouseView();
    const floors = hv.previewFourFloors ? Math.max(4, realFloors) : realFloors;
    const focusedFloor = typeof hv.floor === 'number' ? hv.floor - 1 : null;
    const isExterior = hv.view === 'exterior';
    const top = -220 * floors;
    const exterior = house.exterior || {};
    const roofColor = exterior.roofColor || '#E7A6B5';
    ellipse(c, 0, 13, 515, 22, 'rgba(141,119,91,.14)');
    rr(c, -496, top - 9, 992, floors * 220 + 30, 19, exterior.wallColor || '#F3DFBF', '#D5BA99', 4);
    if (G.draw?.exterior) G.draw.exterior.wall(c, { x: -496, y: top - 9, w: 992, h: floors * 220 + 30, exterior, preview: isExterior });
    if (isExterior) {
      for (let f = 0; f < floors; f++) {
        c.save();
        if (focusedFloor !== null && focusedFloor !== f) c.globalAlpha = .38;
        for (let s = 0; s < 3; s++) drawExteriorBay(c, f, s, exterior);
        c.restore();
      }
    } else {
      for (const room of rooms()) {
        c.save();
        if (focusedFloor !== null && focusedFloor !== room.floorIdx) c.globalAlpha = .32;
        drawRoom(c, room);
        c.restore();
      }
      if (hv.previewFourFloors && floors > realFloors) {
        for (let f = realFloors; f < floors; f++) {
          c.save();
          if (focusedFloor !== null && focusedFloor !== f) c.globalAlpha = .32;
          for (let s = 0; s < 3; s++) drawPreviewSlot(c, f, s);
          c.restore();
        }
      }
    }
    // 木柱与层板，开口式娃娃屋仍然有完整的建筑轮廓；聚焦某层时高亮奶油黄层板前缘。
    for (let i = 0; i < 4; i++) rr(c, -489 + i * 320, top, 18, floors * 220 + 12, 6, '#EFDBC0', '#D3B79D', 2);
    for (let i = 0; i <= floors; i++) {
      const y = -220 * i, highlight = focusedFloor !== null && (i === focusedFloor || i === focusedFloor + 1);
      rr(c, -493, y - 5, 986, 16, 5, highlight ? '#F3D287' : '#E9CEAE', highlight ? '#C69B4B' : '#CAAC91', 2);
      line(c, -478, y, 478, y, highlight ? '#FFF7D6' : '#F9E9D1', 2.2);
    }
    // 右侧外挂木楼梯连接相邻楼层，强化多层立体感。
    for (let f = 0; f < floors - 1; f++) {
      const sy = -220 * f;
      c.save();
      if (focusedFloor !== null && focusedFloor !== f && focusedFloor !== f + 1) c.globalAlpha = .35;
      line(c, 498, sy - 16, 528, sy - 196, '#B88456', 4);
      line(c, 506, sy - 12, 536, sy - 192, '#C99666', 3.5);
      for (let st = 0; st < 5; st++) {
        rr(c, 497 + st * 5, sy - 38 - st * 36, 26, 8, 3, '#DFB07A', '#A8794D', 1.4);
      }
      c.restore();
    }
    if (G.draw?.exterior) {
      G.draw.exterior.chimney(c, { top, exterior, time, reducedMotion });
      G.draw.exterior.roof(c, { top, exterior, name: house.name });
      rr(c, -566, -91, 78, 111, 16, '#F5E0C4', '#CEB397', 2);
      G.draw.exterior.door(c, -556, -80, 59, 91, exterior);
    } else {
    // 烟囱在屋顶后方，圆形烟团慢慢淡去。
    rr(c, 292, top - 155, 53, 103, 7, '#E9C1AE', '#CB9D93', 2.5); rr(c, 284, top - 160, 68, 16, 5, '#F4DAC6', '#CDA89D', 2);
    for (let i = 0; i < 4; i++) { const progress = ((time * .13 + i * .25) % 1); c.globalAlpha = (1 - progress) * .38; cloud(c, 320 + progress * 30, top - 170 - progress * 82, .12 + progress * .15, '#FFFFFF'); }
    c.globalAlpha = 1;
    // 屋顶的瓦片用一道道拱形绘出，避免平板的三角形效果。
    c.beginPath(); c.moveTo(-531, top - 3); c.quadraticCurveTo(-530, top - 19, -513, top - 29); c.lineTo(-412, top - 117); c.quadraticCurveTo(-403, top - 125, -389, top - 125); c.lineTo(389, top - 125); c.quadraticCurveTo(403, top - 125, 412, top - 117); c.lineTo(513, top - 29); c.quadraticCurveTo(530, top - 19, 531, top - 3); c.closePath(); c.fillStyle = roofColor; c.fill(); c.strokeStyle = shade(roofColor, -35); c.lineWidth = 3; c.stroke();
    c.save(); c.beginPath(); c.moveTo(-525, top - 5); c.lineTo(-404, top - 120); c.lineTo(404, top - 120); c.lineTo(525, top - 5); c.closePath(); c.clip();
    for (let row = 0; row < 4; row++) {
      const y = top - 112 + row * 30;
      for (let i = -9; i < 10; i++) {
        const x = i * 62 + (row % 2 ? 31 : 0);
        c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x - 4, y + 33, x + 56, y + 33, x + 59, y); c.strokeStyle = shade(roofColor, row % 2 ? -20 : -27); c.lineWidth = 2; c.stroke();
        line(c, x + 8, y + 6, x + 12, y + 13, shade(roofColor, 15), 2);
      }
    } c.restore();
    rr(c, -535, top - 6, 1070, 18, 8, '#F3BBC6', '#CD92A1', 2.5);
    for (let i = -16; i <= 16; i++) ellipse(c, i * 32, top + 5, 16, 7, '#F3BBC6', '#D39AA7', 1.5);
    // 屋顶中央的奶油铭牌。
    rr(c, -145, top - 101, 290, 66, 25, '#FFF3D7', '#CFA88D', 3);
    rr(c, -137, top - 93, 274, 50, 19, null, '#EAD7B9', 1.5);
    text(c, house.name || '我的小屋', 0, top - 74, 22, '#9B6F6D', 'center', 650);
    text(c, 'MARSHMALLOW COTTAGE', 0, top - 52, 8.5, '#B69B87', 'center', 600);
    flower(c, -119, top - 70, 8, '#E8B9C5'); flower(c, 119, top - 70, 8, '#E8B9C5');
    }
    const furnishedAttic = atticDecorRoom();
    if (furnishedAttic) drawAttic(c, furnishedAttic);
    else if (!capturingPhoto && (hv.floor === 'attic' || hv.previewFourFloors)) {
      const attic = atticLayout(floors);
      c.save(); rr(c, attic.x, attic.y, 320, 185, 18, '#F1E4E9', '#C2A882', 2);
      rr(c, -108, attic.y + 12, 216, 26, 12, 'rgba(255,249,232,.94)', '#C2A882', 1.5);
      text(c, '屋顶阁楼待建 · Lv.' + (G.data?.observatoryConfig?.unlockLv || 17), 0, attic.y + 25, 11, '#6B5848', 'center', 650);
      c.restore();
    }
    // 小蝴蝶在花丛附近穿行。
    if (!reducedMotion) {
      const x = -575 + Math.sin(time * .18) * 35, y = -85 + Math.cos(time * .4) * 14;
      ellipse(c, x - 4, y, 4 + Math.sin(time * 9) * 2, 6, '#E7C6D4'); ellipse(c, x + 4, y, 4 + Math.sin(time * 9) * 2, 6, '#F1D7DA'); line(c, x, y - 4, x, y + 4, '#BA9EA7', 1);
    }
  }

  function polishHouse(c) {
    const floors = effectiveHouseFloors();
    G.polish?.house(c, { top: -220 * floors, floors });
  }

  const roomShellCache = new Map();
  function drawRoomShell(c, data) {
    const wallpaperArt = data?.wallpaper?.artId && renderState().customArts.find(art => art.id === data.wallpaper.artId);
    const key = JSON.stringify([data?.wallpaper || null, data?.floor || null, wallpaperArt?.pixels || null]);
    let image = roomShellCache.get(key);
    if (!image) {
      image = document.createElement('canvas'); image.width = 640; image.height = 440;
      const surface = image.getContext('2d'); surface.scale(2, 2); G.roomShell.draw(surface, data);
      if (roomShellCache.size >= 12) roomShellCache.delete(roomShellCache.keys().next().value);
      roomShellCache.set(key, image);
    }
    c.drawImage(image, 0, 0, 320, 220);
  }
  function drawRoom(c, room) {
    const { x, y, data } = room;
    c.save(); c.translate(x, y);
    drawRoomShell(c, data);
    if (!data && !capturingPhoto) {
      c.globalAlpha = .75;
      c.setLineDash([5, 7]); rr(c, 39, 40, 242, 115, 18, 'rgba(255,255,255,.31)', '#D5C5AD', 2); c.setLineDash([]);
      ellipse(c, 160, 79, 18, 18, '#FFF8E8', '#D8BDA5', 1.7);
      line(c, 153, 79, 167, 79, '#BD9C86', 2.5); line(c, 160, 72, 160, 86, '#BD9C86', 2.5);
      text(c, room.slotIdx === 1 && room.floorIdx === 0 ? '第一间，梦想的小屋' : '让温暖慢慢住满', 160, 116, 12, '#AD9584');
      text(c, '点击建造', 160, 138, 10, '#B5A18E'); c.globalAlpha = 1;
    } else if (data) {
      // 建筑自带的窗是一处温柔光源，墙面家具仍可覆盖它。
      defaultWindow(c, 124, 42, 72, 82);
      const queue = roomItemGroups(data).map(group => ({ depth: group.depth, z: group.z, draw() {
        for (const item of group.members) {
          const def = furnitureDef(item.defId); if (!def) continue;
          if (drag?.kind === 'item' && drag.moved && (drag.hit.item.uid === item.uid || item.parent === drag.hit.item.uid)) continue;
          drawRoomItem(c, room, item, def);
        }
      } }));
      queue.push(...roomActors(c, room));
      queue.sort((a, b) => a.depth - b.depth || a.z - b.z).forEach(entry => entry.draw());
    }
    if (!capturingPhoto && runtime.activeRoomId === room.id && room.id) { c.setLineDash([6, 7]); rr(c, 13, 8, 294, 201, 9, null, 'rgba(177,138,123,.38)', 1.5); c.setLineDash([]); }
    c.restore();
  }
  function drawAttic(c, room) {
    drawRoom(c, room);
    const fixed = room.observation.rect;
    rr(c, fixed.x, fixed.y, fixed.w, fixed.h, 14, room.data.wallpaper.color, '#C9AC91', 2);
    rr(c, fixed.x + 17, fixed.y + 10, fixed.w - 34, 90, 11, '#B8CBDA', '#F8ECDD', 3);
    c.save(); c.translate(fixed.x + fixed.w / 2, fixed.y + 127);
    ellipse(c, 0, 3, 45, 8, '#D8CBBF');
    for (const dx of [-32, 32]) { line(c, dx, 0, 0, -59, '#7B7584', 5); ellipse(c, dx, 1, 6, 3, '#BCA083'); }
    line(c, 4, 0, 0, -59, '#948696', 4); ellipse(c, 0, -59, 11, 7, '#E5C585');
    c.save(); c.translate(0, -76); c.rotate(-.5);
    rr(c, -40, -13, 82, 26, 9, '#A9C3D5', '#738599', 1.7);
    for (const dx of [-25, 19]) rr(c, dx, -15, 7, 30, 3, '#F3E5C8', '#D8B98A', 1);
    ellipse(c, 42, 0, 6, 17, '#E5C585', '#B79A6F', 1.6); ellipse(c, 45, 0, 3, 12, '#435D77');
    ellipse(c, 45, -4, 1.5, 4, '#D1EDF0'); rr(c, -52, -6, 15, 12, 3, '#6D7487', '#EEE3CC', 1);
    c.restore(); c.restore();
    if (!capturingPhoto) { text(c, '阁楼 · 布置', room.x + 160, room.y + 12, 12, '#795F67'); text(c, '固定望远镜 · 观星', fixed.x + fixed.w / 2, fixed.y - 12, 11, '#795F67'); }
  }
  function drawWallpaper(c, wallpaper) {
    const pattern = wallpaper.pattern || 'solid', color = wallpaper.color2 || '#FFFFFF';
    c.save(); c.globalAlpha = .44;
    if (pattern === 'stripes' || pattern === 'stripe') { for (let x = 0; x < 320; x += 27) { c.fillStyle = color; c.fillRect(x, 0, 11, 178); } }
    else if (pattern === 'check' || pattern === 'grid') { for (let x = 0; x < 320; x += 28) line(c, x, 0, x, 178, color, 8); for (let y = 0; y < 180; y += 28) line(c, 0, y, 320, y, color, 8); }
    else if (pattern === 'wood') {
      for (let xx = 12; xx < 320; xx += 32) { line(c, xx, 0, xx, 178, color, 2); ellipse(c, xx + 15, 62 + (xx % 3) * 30, 2, 12, null, color, 1); }
    } else if (pattern === 'brick') {
      for (let yy = 0; yy < 178; yy += 24) { line(c, 0, yy, 320, yy, color, 2); for (let xx = (yy / 24 % 2) * 31; xx < 320; xx += 62) line(c, xx, yy, xx, yy + 24, color, 2); }
    } else if (pattern !== 'solid' && pattern !== 'plain') {
      for (let y = 22; y < 175; y += 29) for (let x = 20 + (Math.floor(y / 29) % 2) * 15; x < 320; x += 31) {
        if (pattern === 'flowers' || pattern === 'floral') flower(c, x, y, 3.2, color);
        else if (pattern === 'hearts') heart(c, x, y, 3.5, color);
        else if (pattern === 'stars') star(c, x, y, 4, color);
        else if (pattern === 'clouds') cloud(c, x, y, .06, color);
        else ellipse(c, x, y, 2.2, 2.2, color);
      }
    }
    c.restore();
  }
  function defaultWindow(c, x, y, w, h) {
    if (G.draw?.exterior) { G.draw.exterior.window(c, x, y, w, h, renderState().house.exterior, atmosphereTime() || {}); return; }
    rr(c, x - 5, y - 5, w + 10, h + 10, 20, '#F4E6D1', '#D7C5AD', 2);
    rr(c, x, y, w, h, 16, atmosphereTime()?.phase === 'night' ? '#737D9F' : '#D3E7E4', '#C5D7D0', 1.5);
    c.save(); rr(c, x + 2, y + 2, w - 4, h - 4, 14); c.clip();
    cloud(c, x + w * .7, y + h * .6, .22, '#F7F7E9');
    c.fillStyle = 'rgba(255,255,255,.26)'; poly(c, [[x + 5, y], [x + 27, y], [x + w - 4, y + h], [x + w - 27, y + h]], 'rgba(255,255,255,.3)'); c.restore();
    line(c, x + w / 2, y + 2, x + w / 2, y + h, '#F8EEDC', 4); line(c, x, y + h * .52, x + w, y + h * .52, '#F8EEDC', 4);
    rr(c, x - 10, y + h - 1, w + 20, 7, 3, '#E1C7A7', '#CBAF92', 1.3);
    // 左右柔软窗帘，摆动幅度很小。
    const sway = reducedMotion ? 0 : Math.sin(time * .9 + x) * 1.5;
    for (const side of [0, 1]) {
      const xx = side ? x + w - 13 : x - 4;
      c.beginPath(); c.moveTo(xx - 1, y - 2); c.lineTo(xx + 19, y - 2); c.quadraticCurveTo(xx + 11 + sway, y + 27, xx + 20, y + h - 1); c.quadraticCurveTo(xx + 8, y + h + 5, xx - 3, y + h - 1); c.quadraticCurveTo(xx + 4 + sway, y + 28, xx - 1, y - 2); c.fillStyle = '#EECBD1'; c.fill(); c.strokeStyle = '#D7AEB8'; c.lineWidth = 1.2; c.stroke();
      line(c, xx + 3, y + 42, xx + 13, y + 42, '#D5AD91', 2);
    }
    line(c, x - 14, y - 6, x + w + 14, y - 6, '#BCA18A', 3);
    ellipse(c, x - 17, y - 6, 4, 4, '#D0AD8C'); ellipse(c, x + w + 17, y - 6, 4, 4, '#D0AD8C');
  }

  function furnitureColors(def, item) {
    const fallback = themePalettes[def.theme] || themePalettes.basic;
    const dataPalette = G.data?.themes?.[def.theme]?.palette;
    const colors = Array.isArray(dataPalette) ? dataPalette : dataPalette ? [dataPalette.primary || dataPalette.main || fallback[0], dataPalette.secondary || dataPalette.accent || fallback[1], dataPalette.detail || fallback[2]] : fallback;
    return [item?.color || colors[0] || fallback[0], colors[1] || fallback[1], colors[2] || fallback[2]];
  }
  function motif(c, def, x, y, size, colors) {
    const theme = def.theme, [a, b, d] = colors;
    if (theme === 'strawberry') {
      c.save(); c.translate(x, y); c.rotate(-.12); heart(c, 0, 1, size * .75, '#D98D9E');
      leaf(c, 0, -size * .25, size * .4, '#A6BE9C', .6); leaf(c, 0, -size * .25, size * .4, '#A6BE9C', -.7);
      for (const p of [[-2, 1], [2, 1], [0, 4]]) ellipse(c, p[0] * size / 8, p[1] * size / 8, .6 * size / 8, .9 * size / 8, '#FFEAD8'); c.restore();
    } else if (theme === 'forest') { leaf(c, x, y + size * .4, size, '#8FA986', .5); line(c, x - 2, y + 4, x + 2, y - 4, '#B9CB9D', 1); }
    else if (theme === 'garden') flower(c, x, y, size * .75, b);
    else if (theme === 'ocean') { c.beginPath(); c.arc(x, y + size / 2, size, Math.PI, TAU); c.lineTo(x, y + size / 2); c.fillStyle = '#EDF7EE'; c.fill(); for (let i = -1; i <= 1; i++) line(c, x, y + size / 2, x + i * size * .65, y - size * .35, '#B7D2D5', 1); }
    else if (theme === 'cloud') cloud(c, x, y, size / 68, '#FEFFFA');
    else if (theme === 'starry') star(c, x, y, size, b, .1);
    else if (theme === 'princess') { poly(c, [[x - size, y + size * .5], [x - size, y - size * .7], [x - size * .4, y], [x, y - size], [x + size * .4, y], [x + size, y - size * .7], [x + size, y + size * .5]], b, d, 1); }
    else if (theme === 'oriental') { c.beginPath(); c.arc(x - size * .35, y, size * .5, Math.PI * .8, TAU * 1.1); c.arc(x + size * .35, y, size * .5, Math.PI, TAU * 1.3); c.strokeStyle = b; c.lineWidth = 2; c.stroke(); }
  }
  function drawFurniture(c, def, x, y, item) {
    if (def.customArt) {
      const art = renderState().customArts.find(value => value.id === item?.artId); if (!art || !G.draw?.creative) return;
      c.save(); c.translate(x, y); if (item.flip) { c.translate(def.w, 0); c.scale(-1, 1); }
      G.draw.creative.drawFrame(c, art, 0, 0, def.w, def.h); c.restore(); return;
    }
    if (G.draw?.crafting && G.draw.crafting(c, def, x, y, item || {})) return;
    if (G.draw?.furnitureExtra && G.draw.furnitureExtra(c, def, x, y, item || {})) return;
    if (def.template === 'yard' && G.draw?.yard) { G.draw.yard(c, def, x, y, item || {}); return; }
    if (def.template === 'festival' && G.draw?.festival) {
      c.save();
      if (item?.flip) { c.translate(x + def.w, y); c.scale(-1, 1); G.draw.festival.draw(c, def, 0, 0, item); }
      else G.draw.festival.draw(c, def, x, y, item || {});
      c.restore(); return;
    }
    const w = Number(def.w) || 60, h = Number(def.h) || 50;
    const colors = furnitureColors(def, item), [a, b, d] = colors, edge = shade(a, -31), wood = '#C4A080';
    c.save(); c.translate(x, y); if (item?.flip) { c.translate(w, 0); c.scale(-1, 1); }
    c.lineCap = 'round'; c.lineJoin = 'round';
    if (def.place !== 'wall' && def.place !== 'ceiling') ellipse(c, w / 2, h - 1, w * .46, Math.min(5, h * .1), 'rgba(118,91,77,.12)');
    const box = (xx, yy, ww, hh, r, fill, stroke, lw) => rr(c, xx, yy, ww, hh, r, fill || a, stroke === false ? null : stroke || edge, lw || 2);
    const leg = (xx, yy, hh, color) => rr(c, xx, yy, Math.max(4, w * .055), hh, 2, color || wood, shade(color || wood, -18), 1);
    const knob = (xx, yy) => ellipse(c, xx, yy, 2.3, 2.3, '#C99E75', '#B2866C', 1);
    switch (def.template) {
      case 'bed':
        leg(6, h - 17, 16); leg(w - 13, h - 17, 16);
        box(3, 1, w * .28, h - 9, 12, a); box(w - 14, h * .49, 11, h * .41, 4, a);
        box(9, h * .33, w - 19, h * .48, 11, b, shade(b, -30));
        box(15, h * .25, w * .25, h * .28, 8, '#FFF8E8', '#DDCBB6', 1.5);
        box(w * .36, h * .35, w * .53, h * .43, 6, a);
        line(c, w * .42, h * .39, w * .42, h * .71, shade(a, 22), 2);
        for (let i = 0; i < 5; i++) ellipse(c, w * .39 + i * w * .1, h * .76, w * .052, 3, b);
        motif(c, def, w * .64, h * .55, 10, colors); break;
      case 'nightstand': case 'counter': case 'toy_box':
        leg(5, h - 9, 9); leg(w - 10, h - 9, 9); box(2, 8, w - 4, h - 15, 5, a); box(0, 2, w, 10, 4, b, shade(b, -30));
        if (def.template === 'toy_box') { motif(c, def, w / 2, h * .57, h * .21, colors); }
        else { box(7, 18, w - 14, Math.max(10, (h - 25) * .45), 3, shade(a, 8), edge, 1.3); knob(w / 2, 23); line(c, w / 2, h * .55, w / 2, h - 11, edge, 1.2); knob(w * .36, h * .73); knob(w * .63, h * .73); } break;
      case 'wardrobe':
        leg(8, h - 10, 10); leg(w - 14, h - 10, 10); box(2, 4, w - 4, h - 12, 11, a); box(0, 1, w, 11, 5, b, shade(b, -25));
        box(8, 19, w / 2 - 10, h - 37, 5, shade(a, 8), edge, 1.3); box(w / 2 + 2, 19, w / 2 - 10, h - 37, 5, shade(a, 8), edge, 1.3);
        knob(w / 2 - 7, h * .58); knob(w / 2 + 7, h * .58); motif(c, def, w * .25, h * .35, 8, colors); motif(c, def, w * .75, h * .35, 8, colors); break;
      case 'vanity':
        leg(8, h * .65, h * .35); leg(w - 13, h * .65, h * .35);
        ellipse(c, w / 2, h * .28, w * .25, h * .27, b, edge, 4); ellipse(c, w / 2, h * .28, w * .2, h * .22, '#DBEAE7');
        line(c, w * .43, h * .18, w * .58, h * .39, '#F7FAEF', 3); box(0, h * .54, w, h * .24, 5, a); line(c, w * .5, h * .57, w * .5, h * .75, edge, 1); knob(w * .25, h * .65); knob(w * .75, h * .65); break;
      case 'sofa': case 'armchair':
        leg(9, h - 10, 10); leg(w - 15, h - 10, 10); box(8, 2, w - 16, h * .7, 13, a);
        box(8, h * .43, w - 16, h * .41, 8, shade(a, 10)); box(0, h * .26, w * .16, h * .58, 8, b, shade(b, -32)); box(w * .84, h * .26, w * .16, h * .58, 8, b, shade(b, -32));
        if (def.template === 'sofa') { line(c, w / 2, h * .48, w / 2, h * .77, edge, 1); box(w * .20, h * .2, w * .21, h * .37, 6, b, shade(b, -25), 1.4); motif(c, def, w * .30, h * .38, 6, colors); box(w * .61, h * .2, w * .2, h * .37, 6, b, shade(b, -25), 1.4); }
        else motif(c, def, w / 2, h * .3, 7, colors); break;
      case 'coffee_table': case 'dining_table':
        leg(8, h * .3, h * .7); leg(w - 14, h * .3, h * .7); if (def.template === 'coffee_table') box(9, h * .68, w - 18, 5, 2, a);
        box(0, 1, w, Math.max(10, h * .28), 8, a); line(c, 10, 5, w - 10, 5, shade(a, 22), 1.5); motif(c, def, w / 2, h * .15, Math.min(5, h * .15), colors); break;
      case 'rug':
        ellipse(c, w / 2, h / 2, w / 2 - 2, h / 2 - 1, a, edge, 1.5); ellipse(c, w / 2, h / 2, w / 2 - 11, Math.max(1, h / 2 - 4), null, b, 1.5); motif(c, def, w / 2, h / 2, Math.min(5, h * .25), colors); break;
      case 'floor_lamp': case 'desk_lamp':
        ellipse(c, w / 2, h - 4, w * .4, 4, b, edge, 1.5); line(c, w / 2, h * .27, w / 2, h - 5, d, def.template === 'floor_lamp' ? 4 : 3);
        c.save(); c.globalAlpha = .13; ellipse(c, w / 2, h * .38, w * .7, h * .3, '#FFF5BB'); c.restore();
        poly(c, [[w * .22, 2], [w * .78, 2], [w - 1, h * .31], [1, h * .31]], a, edge, 2); ellipse(c, w / 2, h * .31, w * .46, 3, b, edge, 1.5); motif(c, def, w / 2, h * .16, Math.min(6, h * .08), colors); break;
      case 'bookshelf':
        leg(7, h - 8, 8); leg(w - 12, h - 8, 8); box(2, 2, w - 4, h - 8, 7, a); box(9, 11, w - 18, h - 25, 3, shade(a, -12), edge, 1);
        for (let row = 0; row < 3; row++) { const yy = 14 + row * (h - 25) / 3; for (let i = 0; i < 5; i++) { const bh = 12 + (i * 7 + row * 11) % 11; box(13 + i * (w - 26) / 5, yy + 22 - bh, (w - 32) / 5, bh, 1, [b, '#D8B7BC', '#B4C5AD', '#EBD3A6', '#B6CCD5'][(i + row) % 5], shade(a, -30), 1); } box(8, yy + 23, w - 16, 4, 1, b, edge, 1); } break;
      case 'chair':
        leg(5, h * .63, h * .37); leg(w - 10, h * .63, h * .37); box(3, 2, w - 6, h * .48, 8, a); line(c, 7, h * .37, 7, h * .63, edge, 3); line(c, w - 7, h * .37, w - 7, h * .63, edge, 3); box(0, h * .57, w, h * .16, 5, b, shade(b, -30)); motif(c, def, w / 2, h * .24, 6, colors); break;
      case 'stove':
        leg(7, h - 6, 6); leg(w - 12, h - 6, 6); box(2, 8, w - 4, h - 13, 6, a); box(0, 3, w, 12, 4, b, shade(b, -30));
        ellipse(c, w * .28, 7, w * .14, 3, '#A08F89'); ellipse(c, w * .73, 7, w * .14, 3, '#A08F89'); box(10, h * .42, w - 20, h * .4, 4, '#8C7D7F', '#AA8F8B', 1.5); box(14, h * .48, w - 28, h * .25, 3, '#B7B5AB', false); line(c, 17, h * .43, w - 17, h * .43, b, 3); for (let i = 0; i < 3; i++) knob(w * .25 + i * w * .25, h * .31); break;
      case 'fridge':
        box(2, 2, w - 4, h - 6, 9, a); line(c, 3, h * .34, w - 3, h * .34, edge, 2); line(c, w * .78, h * .14, w * .78, h * .26, d, 3); line(c, w * .78, h * .43, w * .78, h * .63, d, 3); motif(c, def, w * .42, h * .57, 9, colors); box(w * .17, h * .1, w * .25, h * .12, 2, b, false); break;
      case 'bathtub':
        leg(15, h - 8, 8); leg(w - 21, h - 8, 8); c.beginPath(); c.moveTo(3, h * .34); c.lineTo(12, h * .77); c.quadraticCurveTo(17, h - 8, 30, h - 8); c.lineTo(w - 30, h - 8); c.quadraticCurveTo(w - 17, h - 8, w - 12, h * .77); c.lineTo(w - 3, h * .34); c.closePath(); c.fillStyle = a; c.fill(); c.strokeStyle = edge; c.lineWidth = 2; c.stroke();
        ellipse(c, w / 2, h * .34, w / 2 - 2, h * .17, b, edge, 2); ellipse(c, w / 2, h * .34, w / 2 - 11, h * .105, '#C4DFDB');
        c.beginPath(); c.moveTo(w * .79, h * .27); c.lineTo(w * .79, 4); c.quadraticCurveTo(w * .79, -3, w * .70, 4); c.lineTo(w * .70, h * .14); c.strokeStyle = '#B9B8AA'; c.lineWidth = 4; c.stroke(); motif(c, def, w / 2, h * .68, 9, colors); break;
      case 'sink':
        box(8, h * .4, w - 16, h * .54, 6, a); line(c, w / 2, h * .5, w / 2, h * .86, edge, 1); knob(w * .37, h * .67); knob(w * .63, h * .67);
        ellipse(c, w / 2, h * .36, w / 2 - 2, h * .13, b, edge, 2); ellipse(c, w / 2, h * .36, w * .3, h * .065, '#C4DCD9'); line(c, w / 2, h * .08, w / 2, h * .29, '#B6B7AA', 4); line(c, w / 2, h * .09, w * .65, h * .09, '#B6B7AA', 4); break;
      case 'piano':
        leg(8, h - 16, 16); leg(w - 13, h - 16, 16); box(3, 5, w - 6, h * .7, 7, a); box(0, h * .49, w, h * .18, 3, b, edge, 2);
        for (let i = 1; i < 13; i++) { const xx = 4 + i * (w - 8) / 13; line(c, xx, h * .5, xx, h * .65, '#C3B3A3', 1); if (i % 7 !== 3 && i % 7 !== 0) box(xx - 2, h * .49, 4, h * .1, 1, '#83767C', false); }
        motif(c, def, w / 2, h * .27, 11, colors); line(c, 15, 12, w - 15, 12, shade(a, 22), 2); break;
      case 'easel':
        line(c, w * .48, 3, w * .13, h - 3, wood, 5); line(c, w * .52, 3, w * .87, h - 3, wood, 5); line(c, w * .48, h * .37, w * .61, h - 2, shade(wood, -15), 4);
        box(w * .08, h * .13, w * .84, h * .59, 3, b, edge, 2); box(w * .15, h * .18, w * .7, h * .48, 2, '#F7EDDA', false);
        c.save(); rr(c, w * .15, h * .18, w * .7, h * .48, 2); c.clip(); ellipse(c, w * .67, h * .31, 6, 6, '#E9CB8B'); poly(c, [[w * .15, h * .65], [w * .32, h * .39], [w * .6, h * .61], [w * .75, h * .44], [w * .86, h * .65]], '#BCD1B0'); line(c, w * .15, h * .59, w * .85, h * .59, '#BBCDD8', 5); c.restore(); box(0, h * .72, w, 6, 2, a); break;
      case 'aquarium':
        leg(9, h - 7, 7); leg(w - 14, h - 7, 7); box(2, 8, w - 4, h - 18, 5, '#C4E3E2', '#9ABEBB', 2.5); box(0, 3, w, 8, 3, a); box(0, h - 14, w, 7, 2, a); line(c, 7, h - 18, w - 7, h - 18, '#E7D8AF', 6);
        for (let i = 0; i < 3; i++) leaf(c, 14 + i * 8, h - 18, 10 + i * 2, '#9FC1A0', (i - 1) * .4);
        ellipse(c, w * .63, h * .45, 7, 4, '#EDBB9A'); poly(c, [[w * .63 + 6, h * .45], [w * .63 + 12, h * .45 - 5], [w * .63 + 12, h * .45 + 5]], '#E5A687'); ellipse(c, w * .63 - 4, h * .45 - 1, 1, 1, '#8F7271'); ellipse(c, w * .73, h * .29, 2, 2, null, '#F7FBF1', 1); line(c, 8, 16, 15, 26, '#EBF6E9', 3); break;
      case 'indoor_swing': case 'swing':
        line(c, 5, 1, 11, h - 15, d, 2); line(c, w - 5, 1, w - 11, h - 15, d, 2); box(4, h - 21, w - 8, 13, 6, a); motif(c, def, w / 2, h - 14, 5, colors); break;
      case 'window':
        defaultWindow(c, 8, 8, w - 16, h - 18); break;
      case 'frame':
        box(1, 1, w - 2, h - 2, 6, a); box(6, 6, w - 12, h - 12, 3, b, shade(a, -12), 1); poly(c, [[8, h - 8], [w * .45, h * .35], [w * .69, h * .69], [w - 8, h * .48], [w - 8, h - 8]], '#C3D0AF'); ellipse(c, w * .72, h * .29, 4, 4, '#E8CB89'); break;
      case 'mirror':
        ellipse(c, w / 2, h / 2, w / 2 - 2, h / 2 - 2, a, edge, 2.5); ellipse(c, w / 2, h / 2, w / 2 - 7, h / 2 - 7, '#D6E7E6', '#C0D3CF', 1); line(c, w * .32, h * .24, w * .61, h * .59, '#F9FBF2', 3); line(c, w * .39, h * .19, w * .68, h * .53, '#EFF7EF', 1.5); motif(c, def, w / 2, 7, 5, colors); break;
      case 'clock':
        ellipse(c, w / 2, h / 2, w / 2 - 2, h / 2 - 2, a, edge, 2.5); ellipse(c, w / 2, h / 2, w / 2 - 6, h / 2 - 6, b); for (let i = 0; i < 12; i++) { const angle = i * TAU / 12; ellipse(c, w / 2 + Math.sin(angle) * w * .29, h / 2 - Math.cos(angle) * h * .29, .8, .8, d); } line(c, w / 2, h / 2, w / 2, h * .29, d, 1.8); line(c, w / 2, h / 2, w * .7, h * .55, d, 1.8); break;
      case 'wall_shelf':
        poly(c, [[w * .15, 3], [w * .15, h - 1], [w * .3, 3]], d); poly(c, [[w * .7, 3], [w * .85, h - 1], [w * .85, 3]], d); box(0, 0, w, Math.max(5, h * .5), 3, a); break;
      case 'garland':
        c.beginPath(); c.moveTo(1, 1); c.quadraticCurveTo(w / 2, h * .9, w - 1, 1); c.strokeStyle = d; c.lineWidth = 1.6; c.stroke(); for (let i = 0; i < 7; i++) { const xx = 5 + i * (w - 20) / 6, yy = 2 + Math.sin(i * Math.PI / 6) * h * .33; poly(c, [[xx, yy], [xx + 10, yy + 1], [xx + 5, yy + h * .48]], [a, b, '#B9D3BE'][i % 3], shade(a, -18), 1); } break;
      case 'ceiling_lamp':
        line(c, w / 2, 0, w / 2, h * .48, d, 2); ellipse(c, w / 2, 2, w * .2, 2, a, edge, 1.3);
        c.save(); c.globalAlpha = .13; ellipse(c, w / 2, h * .9, w * .65, h * .24, '#FFF0A8'); c.restore();
        c.beginPath(); c.moveTo(1, h * .87); c.bezierCurveTo(3, h * .32, w - 3, h * .32, w - 1, h * .87); c.closePath(); c.fillStyle = a; c.fill(); c.strokeStyle = edge; c.lineWidth = 2; c.stroke(); ellipse(c, w / 2, h * .87, w / 2 - 2, 4, b, edge, 1); motif(c, def, w / 2, h * .64, 6, colors); break;
      case 'vase':
        for (let i = 0; i < 3; i++) { const xx = w * (.2 + i * .3), yy = h * (.13 + (i % 2) * .1); line(c, w / 2, h * .66, xx, yy, '#8EA88A', 1.3); flower(c, xx, yy, 4, [a, '#F8EACC', '#E9BCCB'][i]); }
        c.beginPath(); c.moveTo(w * .35, h * .48); c.bezierCurveTo(w * .35, h * .67, w * .13, h * .72, w * .24, h * .93); c.quadraticCurveTo(w * .5, h + 1, w * .76, h * .93); c.bezierCurveTo(w * .87, h * .72, w * .65, h * .67, w * .65, h * .48); c.closePath(); c.fillStyle = a; c.fill(); c.strokeStyle = edge; c.lineWidth = 1.5; c.stroke(); line(c, w * .35, h * .49, w * .65, h * .49, b, 2); break;
      case 'cake':
        ellipse(c, w / 2, h - 2, w / 2 - 1, 3, b, '#D6C2AF', 1); box(3, h * .35, w - 6, h * .5, 4, a); line(c, 5, h * .64, w - 5, h * .64, b, 3); ellipse(c, w / 2, h * .35, w / 2 - 3, h * .12, b, shade(b, -25), 1); for (let i = 0; i < 3; i++) ellipse(c, w * .27 + i * w * .23, h * .32, 3, 4, '#E2A0AB'); leaf(c, w / 2, h * .25, 3, '#98B291', -.4); break;
      case 'teapot':
        c.beginPath(); c.arc(w * .77, h * .57, w * .2, -Math.PI * .7, Math.PI * .7); c.strokeStyle = edge; c.lineWidth = 3; c.stroke(); poly(c, [[w * .24, h * .46], [0, h * .29], [w * .11, h * .65], [w * .28, h * .7]], a, edge, 1.5); ellipse(c, w * .48, h * .61, w * .32, h * .3, a, edge, 1.7); ellipse(c, w * .48, h * .34, w * .21, h * .06, b, edge, 1); ellipse(c, w * .48, h * .27, 3, 3, d); motif(c, def, w * .5, h * .61, 5, colors); break;
      case 'books':
        for (let i = 0; i < 3; i++) { box(2 + (i % 2) * 3, h - 8 - i * 7, w - 7, 6, 1, [a, b, '#B7CBB0'][i], shade(a, -25), 1); line(c, 6, h - 5 - i * 7, w - 8, h - 5 - i * 7, '#F8F0DE', 2); } break;
      case 'plush':
        ellipse(c, w * .25, h * .18, w * .13, h * .17, a, edge, 1.3); ellipse(c, w * .75, h * .18, w * .13, h * .17, a, edge, 1.3); ellipse(c, w / 2, h * .75, w * .3, h * .22, a, edge, 1.3); ellipse(c, w / 2, h * .39, w * .41, h * .3, a, edge, 1.5); ellipse(c, w * .35, h * .38, 1.3, 1.8, '#886E72'); ellipse(c, w * .65, h * .38, 1.3, 1.8, '#886E72'); ellipse(c, w * .5, h * .49, 1.4, 1, '#886E72'); heart(c, w / 2, h * .76, w * .13, b); break;
      case 'candle':
        ellipse(c, w / 2, h - 3, w * .46, 3, b, edge, 1); box(w * .22, h * .34, w * .56, h * .55, 3, a); ellipse(c, w / 2, h * .34, w * .28, 3, b, edge, 1); line(c, w / 2, h * .32, w / 2, h * .22, d, 1); c.beginPath(); c.moveTo(w / 2, 1); c.bezierCurveTo(w * .2, h * .22, w * .6, h * .31, w * .66, h * .19); c.quadraticCurveTo(w * .67, h * .12, w / 2, 1); c.fillStyle = '#E9C88A'; c.fill(); break;
      case 'crystal_ball':
        box(w * .16, h * .83, w * .68, h * .12, 3, a); poly(c, [[w * .32, h * .64], [w * .68, h * .64], [w * .79, h * .86], [w * .21, h * .86]], a, edge, 1); ellipse(c, w / 2, h * .38, w * .43, h * .37, '#D8CFEA', '#B6A7CB', 1.5); star(c, w * .56, h * .4, w * .17, '#F8E8BE'); ellipse(c, w * .3, h * .23, 2, 3, '#F6F1FC'); break;
      case 'potted_plant': case 'plant':
        for (let i = 0; i < 6; i++) { const xx = w * (.18 + (i % 3) * .31), yy = h * (.23 + (i % 2) * .15); line(c, w / 2, h * .72, xx, yy, '#92AC87', 1.8); leaf(c, xx, yy + 4, w * (.22 + (i % 2) * .08), i % 2 ? '#A8C29C' : '#B7CEA6', (i - 2) * .35); }
        poly(c, [[w * .16, h * .64], [w * .84, h * .64], [w * .73, h * .95], [w * .27, h * .95]], a, edge, 1.8); box(w * .12, h * .61, w * .76, h * .1, 3, b, edge, 1.5); motif(c, def, w / 2, h * .82, 5, colors); break;
      default:
        box(2, 3, w - 4, h - 7, 8, a); motif(c, def, w / 2, h / 2, Math.min(w, h) * .24, colors); line(c, w * .2, h * .8, w * .8, h * .8, b, 2);
    }
    c.restore();
  }

  function character(c, id, x, bottom, scale, options) {
    if (!options?.noShadow) ellipse(c, x, bottom - 1, 26 * scale, 6.5 * scale, 'rgba(96,64,66,.24)');
    if (G.draw?.residentExtra && G.draw.residentExtra(c, id, x, bottom, scale, Object.assign({ time, reducedMotion }, options || {}))) return;
    const opts = options || {}, isFox = id === 'orange', isBear = id === 'pudding', isCloud = id === 'nuomi';
    const body = isFox ? '#E8B990' : isBear ? '#D8BC97' : '#FBF5E8';
    const edge = isFox ? '#BC957F' : isBear ? '#B59B81' : '#D1BBAC';
    const accent = isFox ? '#B2C4A2' : isBear ? '#E9CC8E' : '#E8B6C4';
    const bob = reducedMotion || opts.still ? 0 : Math.sin(time * (isCloud ? 1.5 : 1.8) + x * .04) * (isCloud ? 4 : 1.3);
    c.save(); c.translate(x, bottom + bob); c.scale(scale, scale);
    ellipse(c, 0, -1, 24, 5, 'rgba(126,105,92,.11)');
    if (isCloud) {
      c.beginPath(); c.moveTo(-29, -14); c.bezierCurveTo(-49, -11, -50, -36, -32, -40); c.bezierCurveTo(-35, -63, -9, -71, 2, -56); c.bezierCurveTo(15, -71, 40, -57, 36, -38); c.bezierCurveTo(55, -31, 48, -11, 31, -12); c.bezierCurveTo(15, -6, -17, -5, -29, -14); c.closePath(); c.fillStyle = '#FFFCF3'; c.fill(); c.strokeStyle = '#DCCABA'; c.lineWidth = 2; c.stroke();
      star(c, -28, -49, 6, '#E6C883', -.15); face(c, 0, -33, false, time); ellipse(c, -29, -17, 8, 4, '#FFFCF3', '#DCCABA', 1.3); ellipse(c, 31, -17, 8, 4, '#FFFCF3', '#DCCABA', 1.3);
    } else {
      if (isFox) { c.beginPath(); c.moveTo(13, -20); c.bezierCurveTo(54, -38, 54, -13, 22, -8); c.closePath(); c.fillStyle = body; c.fill(); c.strokeStyle = edge; c.lineWidth = 2; c.stroke(); c.beginPath(); c.moveTo(35, -25); c.quadraticCurveTo(48, -25, 39, -15); c.lineTo(31, -16); c.closePath(); c.fillStyle = '#FFF3DC'; c.fill(); }
      ellipse(c, -10, -5, 8, 5, body, edge, 1.7); ellipse(c, 10, -5, 8, 5, body, edge, 1.7);
      ellipse(c, 0, -25, 19, 24, body, edge, 2);
      // 连衣裙/围兜采用小圆领与口袋。
      c.beginPath(); c.moveTo(-13, -38); c.quadraticCurveTo(0, -31, 13, -38); c.lineTo(20, -12); c.quadraticCurveTo(0, -7, -20, -12); c.closePath(); c.fillStyle = accent; c.fill(); c.strokeStyle = shade(accent, -23); c.lineWidth = 1.5; c.stroke();
      ellipse(c, -18, -27, 6, 10, body, edge, 1.5); ellipse(c, 18, -27, 6, 10, body, edge, 1.5);
      if (isFox) { poly(c, [[-25, -58], [-25, -85], [-5, -68]], body, edge, 2); poly(c, [[25, -58], [25, -85], [5, -68]], body, edge, 2); poly(c, [[-21, -66], [-21, -78], [-12, -68]], '#E6A8A4'); poly(c, [[21, -66], [21, -78], [12, -68]], '#E6A8A4'); }
      else if (isBear) { ellipse(c, -21, -71, 11, 12, body, edge, 2); ellipse(c, 21, -71, 11, 12, body, edge, 2); ellipse(c, -21, -71, 6, 7, '#E8C4B4'); ellipse(c, 21, -71, 6, 7, '#E8C4B4'); }
      else { c.save(); c.rotate(-.12); ellipse(c, -13, -82, 9, 24, body, edge, 2); ellipse(c, -13, -82, 4, 17, '#ECC5CB'); c.restore(); c.save(); c.rotate(.12); ellipse(c, 13, -82, 9, 24, body, edge, 2); ellipse(c, 13, -82, 4, 17, '#ECC5CB'); c.restore(); }
      ellipse(c, 0, -55, 30, 26, body, edge, 2);
      if (isFox) { c.beginPath(); c.moveTo(-24, -50); c.quadraticCurveTo(-11, -46, -7, -55); c.quadraticCurveTo(0, -44, 7, -55); c.quadraticCurveTo(11, -46, 24, -50); c.quadraticCurveTo(20, -31, 0, -31); c.quadraticCurveTo(-20, -31, -24, -50); c.fillStyle = '#FFF1DB'; c.fill(); }
      if (isBear) ellipse(c, 0, -44, 12, 9, '#F2DFBC');
      face(c, 0, -52, opts.happy, time + x);
      if (isBear) { rr(c, -6, -25, 12, 9, 3, '#F4E3B6', '#CEB277', 1); line(c, -3, -22, 3, -22, '#CEB277', 1); }
      else if (isFox) { poly(c, [[-5, -33], [-14, -39], [-14, -26]], '#A1B88E', '#8DA77E', 1); poly(c, [[5, -33], [14, -39], [14, -26]], '#A1B88E', '#8DA77E', 1); ellipse(c, 0, -33, 4, 4, '#B4C39D'); }
      else { poly(c, [[-18, -75], [-29, -83], [-29, -70]], '#DE9EB1', '#C98A9F', 1); poly(c, [[-18, -75], [-8, -83], [-8, -70]], '#DE9EB1', '#C98A9F', 1); ellipse(c, -18, -75, 3, 3, '#E9BAC8'); }
    }
    c.restore();
  }
  function face(c, x, y, happy, t) {
    const blink = !reducedMotion && Math.sin(t * .17) > .996;
    ellipse(c, x - 15, y + 6, 6, 3.3, '#F0BFCA'); ellipse(c, x + 15, y + 6, 6, 3.3, '#F0BFCA');
    for (const side of [-1, 1]) {
      if (blink || happy) { c.beginPath(); c.arc(x + side * 9, y, 3.3, Math.PI * 1.1, Math.PI * 1.9); c.strokeStyle = '#80666C'; c.lineWidth = 1.8; c.stroke(); }
      else { ellipse(c, x + side * 9, y, 2.6, 3.7, '#80666C'); ellipse(c, x + side * 9 - .8, y - 1.2, .85, 1.1, '#FFFCF0'); }
    }
    ellipse(c, x, y + 5, 1.8, 1.3, '#AA7E85');
    c.beginPath(); c.moveTo(x - 5, y + 8); c.quadraticCurveTo(x - 2, y + 12, x, y + 8); c.quadraticCurveTo(x + 2, y + 12, x + 5, y + 8); c.strokeStyle = '#9B7B7F'; c.lineWidth = 1.3; c.stroke();
  }
  function drawRoomItem(c, room, item, def) {
    const pos = itemPosition(room.data, item), selected = !capturingPhoto && runtime.selected?.uid === item.uid && runtime.selected?.roomId === room.id;
    if (selected) {
      c.save(); c.setLineDash([4, 4]); rr(c, pos.x - 4, pos.y - 4, pos.w + 8, pos.h + 8, 8, 'rgba(255,255,239,.17)', '#BD9A66', 1.5); c.restore();
      if (def.place === 'floor') ellipse(c, pos.footX, pos.footY, Math.max(10, pos.w * .45), 3, '#E9D09A99');
    }
    if (def.place === 'floor') ellipse(c, pos.footX, pos.footY, Math.max(10, pos.w * .5), Math.max(3.5, pos.w * .075), 'rgba(96,64,66,.2)');
    c.save(); c.translate(pos.x, pos.y); c.scale(pos.scale, pos.scale);
    // 投影偏移以设备像素计，不随镜头缩放，远近看起来都是同样的“厚度”。
    const px = capturingPhoto ? 1 : dpr; c.shadowColor = 'rgba(96,64,66,.24)'; c.shadowBlur = 5 * px; c.shadowOffsetX = 1.5 * px; c.shadowOffsetY = 3.5 * px;
    drawFurniture(c, def, 0, 0, item); c.restore();
  }
  function roomActors(c, room) {
    const state = renderState(), queue = [], residents = residentFrame && !visitState ? residentFrame.filter(actor => actor.roomId === room.id && state.residents[actor.id]?.movedIn).map(actor => [actor.id, state.residents[actor.id], actor]) : Object.entries(state.residents).filter(([, value]) => value.movedIn && value.roomId === room.id);
    const asleep = atmosphereTime()?.phase === 'night';
    residents.forEach(([id, state, actor], index) => {
      const seed = id.split('').reduce((n, ch) => n + ch.charCodeAt(0), 0), beds = room.data.items.filter(item => furnitureDef(item.defId)?.tags?.includes('bed'));
      if (asleep && beds.length) {
        const bed = beds[index % beds.length], pos = itemPosition(room.data, bed);
        queue.push({ depth: pos.depth, z: (bed.z || 0) + .01, draw() {
          c.save(); c.translate(pos.x, pos.y); c.scale(pos.scale, pos.scale);
          const def = furnitureDef(bed.defId);
          c.save(); c.translate(def.w * .77, def.h * .5); c.rotate(-Math.PI / 2); character(c, id, 0, 0, .52, { happy: true, noShadow: true }); c.restore();
          rr(c, def.w * .43, def.h * .35, def.w * .44, def.h * .38, 8, '#F1D3D6', '#D8B6C1', 1);
          text(c, 'z z z', def.w * .6, -9, 12, '#927A9F'); c.restore();
          residentHits.push({ id, depth: pos.depth, z: (bed.z || 0) + .01, x: room.x + pos.x, y: room.y + pos.y - 15, w: pos.w, h: pos.h + 15 });
        } }); return;
      }
      const walk = reducedMotion || asleep ? 0 : Math.sin(time * .12 + seed) * 30, depth = actor ? actor.depth : .42 + (reducedMotion ? 0 : Math.sin(time * .08 + seed) * .12), foot = G.roomSpace.foot(actor ? actor.x : 190 + walk, depth);
      queue.push({ depth, z: 0, draw() {
        const { x, y, scale } = foot;
        c.save(); c.globalAlpha = (typeof c.globalAlpha === 'number' ? c.globalAlpha : 1) * (actor ? actor.alpha : 1);
        const pose = actor?.pose || 'walk', progress = actor?.progress || 0, hop = pose === 'hop' && !reducedMotion ? Math.sin(progress * Math.PI) * 14 * scale : 0;
        c.save(); c.translate(x, y - hop); c.scale(.7 * scale * (actor?.facing || 1), .7 * scale);
        if (pose === 'sit' || pose === 'read') { ellipse(c, 0, -2, 26, 6, '#E6C9D3', '#C5A4B1', 1.1); c.scale(1, .86); }
        if (pose === 'stretch') { const reach = reducedMotion ? .05 : Math.sin(progress * Math.PI) * .08; c.scale(1 - reach * .3, 1 + reach); }
        character(c, id, 0, 0, 1, { still: pose !== 'walk', happy: pose === 'favorite' });
        if (pose === 'read') {
          poly(c, [[-22, -38], [-3, -34], [0, -17], [-22, -22]], '#EBD499', '#B49A77', 1.3);
          poly(c, [[22, -38], [3, -34], [0, -17], [22, -22]], '#FFF3CF', '#B49A77', 1.3);
          line(c, 0, -34, 0, -17, '#B49A77', 1.2); line(c, 6, -30, 17, -32, '#D4BA8C', .8);
        } else if (pose === 'stretch') {
          line(c, -32, -52, -37, -58, '#B99EC1', 1.8); line(c, 32, -52, 37, -58, '#B99EC1', 1.8);
        }
        if (pose === 'favorite') {
          const rise = reducedMotion ? 0 : Math.sin(progress * Math.PI) * 5;
          heart(c, -21, -96 - rise, 7, '#D68BA5'); heart(c, 9, -107 - rise, 5, '#E6ACB9');
        }
        c.restore();
        if (asleep) text(c, 'z z z', x + 10, y - 91 * scale, 12 * scale, '#927A9F');
        if (atmosphereTime()?.birthdays?.includes(id)) {
          c.save(); c.translate(x, y); c.scale(scale, scale); poly(c, [[-13, -76], [0, -108], [13, -76]], '#F6D59C', '#C6A176', 1.5); ellipse(c, 0, -108, 4, 4, '#EBA6C1'); c.restore();
        }
        if (!actor || actor.alpha > .3) residentHits.push({ id, depth, z: 0, x: room.x + x - 26 * scale, y: room.y + y - 86 * scale - hop, w: 52 * scale, h: 89 * scale });
        if (state.heartBubbles > 0 && !capturingPhoto) {
          const yy = y - 96 * scale; ellipse(c, x + 24, yy, 14, 14, '#FFF5EB', '#E7BCC4', 1.5); heart(c, x + 24, yy, 8, '#DF9AB1');
          residentHits.push({ id, depth: 2, z: 0, x: room.x + x + 8, y: room.y + yy - 16, w: 32, h: 32 });
        }
        c.restore();
      } });
    });
    if (!captureHidesPlayer && !visitState && G.draw?.avatar && rooms().find(other => other.id)?.id === room.id && G.runtime?.player?.zone !== 'yard') {
      const depth = .62 + (reducedMotion ? 0 : Math.sin(time * .07) * .12), foot = G.roomSpace.foot(83 + (reducedMotion ? 0 : Math.sin(time * .09) * 42), depth);
      queue.push({ depth, z: 0, draw() {
        G.draw.avatar(c, G.state.avatar, foot.x, foot.y, .55 * foot.scale, { time, still: reducedMotion, facing: Math.cos(time * .09) < 0 ? -1 : 1 });
        playerHit = { depth, z: 0, x: room.x + foot.x - 26 * foot.scale, y: room.y + foot.y - 93 * foot.scale, w: 52 * foot.scale, h: 97 * foot.scale };
      } });
    }
    return queue;
  }
  function drawResidents(c) {
    const first = rooms().filter(r => r.id).length === 0;
    const gx = first ? -390 : -620, gy = first ? -273 : -112;
    character(c, 'nuomi', gx, gy, .79);
    residentHits.push({ id: 'nuomi', x: gx - 37, y: gy - 58, w: 74, h: 62 });
    if (first && !capturingPhoto) {
      rr(c, -350, -326, 252, 42, 16, '#FFFAEC', '#E5D0B5', 1.5);
      poly(c, [[-349, -304], [-362, -294], [-346, -295]], '#FFFAEC');
      text(c, '把喜欢的日子，装进小屋里。', -224, -305, 12, '#A18679');
    }
  }
  function drawYard(c) {
    (renderState().house.yard.items || []).slice().sort((a, b) => a.z - b.z).forEach(item => {
      if (drag?.kind === 'yard-item' && drag.moved && drag.hit.uid === item.uid) return;
      const def = furnitureDef(item.defId); if (!def) return;
      drawFurniture(c, def, item.x, item.y, item);
      if (!capturingPhoto && runtime.selected?.yard && runtime.selected.uid === item.uid) {
        c.setLineDash([5, 5]); rr(c, item.x - 4, item.y - 4, def.w + 8, def.h + 8, 9, null, '#AD7A91', 2); c.setLineDash([]);
      }
    });
  }
  function drawPlayer(c) {
    if (captureHidesPlayer || visitState || !G.draw?.avatar) return;
    const inYard = G.runtime?.player?.zone === 'yard' || !rooms().some(room => room.id);
    if (!inYard) return;
    const p = G.runtime?.player;
    const x = p ? (p.x * 90) : (-220 + (reducedMotion ? 0 : Math.sin(time * .09) * 42));
    const y = p ? (p.z * 35 + 20) : 130;
    const facing = p?.facing || (Math.cos(time * .09) < 0 ? -1 : 1);
    const walking = !!p?.walking;
    G.draw.avatar(c, G.state.avatar, x, y, .55, { time, still: reducedMotion || !walking, waddle: walking, facing });
    playerHit = { x: x - 26, y: y - 93, w: 52, h: 97 };
  }
  function drawPlacement(c) {
    const def = furnitureDef(runtime.placing);
    if (!def || !placementPoint) return;
    if (def.place === 'yard' && G.sys.yard) {
      const points = drag?.kind === 'yard-stroke' ? drag.points : [placementPoint], seen = new Set();
      c.save(); c.globalAlpha = .6;
      points.slice(-100).forEach(point => {
        const pos = G.sys.yard.position(def, point.x - def.w / 2, point.y - def.h / 2), key = pos.x + ':' + pos.y;
        if (seen.has(key) || seen.size > 40) return; seen.add(key); drawFurniture(c, def, pos.x, pos.y, {});
      }); c.restore(); return;
    }
    const room = roomAt(placementPoint.x, placementPoint.y, false);
    if (!room) return;
    const pos = placementCoords(def, room, placementPoint);
    drawPlacementPreview(c, room, def, pos, null, .65);
  }
  function drawDrag(c) {
    if (drag?.world && unusableWorldPoint(drag.world)) return;
    if (drag?.moved && drag.kind === 'yard-item') {
      c.save(); c.globalAlpha = .78; drawFurniture(c, furnitureDef(drag.hit.defId), drag.world.x - drag.offset.x, drag.world.y - drag.offset.y, drag.hit); c.restore(); return;
    }
    if (!drag?.moved || drag.kind !== 'item') return;
    const def = drag.hit.def;
    const room = roomAt(drag.world.x, drag.world.y, false);
    if (room) {
      const pos = placementCoords(def, room, drag.world, drag.grab, drag.hit.item.uid);
      drawPlacementPreview(c, room, def, pos, drag.hit.item, .8);
    } else {
      c.save(); c.globalAlpha = .5; c.translate(drag.world.x - drag.offset.x, drag.world.y - drag.offset.y); c.scale(drag.hit.pos.scale, drag.hit.pos.scale); drawFurniture(c, def, 0, 0, drag.hit.item); c.restore();
    }
  }
  function addParticles(x, y, kind) {
    if (reducedMotion) return;
    for (let i = 0; i < 12; i++) {
      const angle = i * TAU / 12, speed = 18 + (i % 4) * 13;
      particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 18, life: 1, kind: kind || 'star', color: ['#E7B4C3', '#E9D18C', '#B7CEAA'][i % 3], size: 4 + i % 4 });
    }
  }
  function drawParticles(c, delta) {
    particles = particles.filter(p => p.life > 0);
    for (const p of particles) {
      p.life -= delta * .85; p.x += p.vx * delta; p.y += p.vy * delta; p.vy += delta * 22;
      c.globalAlpha = Math.max(0, p.life);
      if (p.kind === 'heart') heart(c, p.x, p.y, p.size, p.color); else star(c, p.x, p.y, p.size, p.color, time);
    } c.globalAlpha = 1;
  }
  function nightLights() {
    const lights = [];
    rooms().filter(room => room.id).forEach(room => {
      const window = camera.worldToScreen(room.x + 160, room.y + 84);
      lights.push({ x: window.x, y: window.y, radius: 92 * camera.scale, strength: .5 });
      room.data.items.forEach(item => {
        const def = furnitureDef(item.defId);
        if (!def || !(def.light || /lamp|lantern/.test(def.template + ' ' + def.id) || def.tags?.includes('light'))) return;
        const pos = itemPosition(room.data, item);
        const position = camera.worldToScreen(room.x + pos.x + pos.w / 2, room.y + pos.y + pos.h * .32);
        lights.push({ x: position.x, y: position.y, radius: 100 * camera.scale, strength: .9 });
      });
    });
    (visitState ? [] : G.seaMap?.lights() || []).forEach(light => {
      const position = camera.worldToScreen(light.x, light.y);
      lights.push({ x: position.x, y: position.y, radius: 90 * camera.scale, strength: .7 });
    });
    renderState().house.yard.items.forEach(item => {
      const def = furnitureDef(item.defId); if (!def?.tags?.includes('light')) return;
      const position = camera.worldToScreen(item.x + def.w / 2, item.y + def.h * .25);
      lights.push({ x: position.x, y: position.y, radius: 105 * camera.scale, strength: .85 });
    });
    return lights;
  }
  let lastTime = 0;
  function draw(now) {
    if (!ctx) return;
    const delta = Math.min(.05, Math.max(0, (now - lastTime) / 1000 || 0)); lastTime = now;
    time = reducedMotion ? 0 : now / 1000;
    if (G.sys.residentLife && !visitState) residentFrame = G.sys.residentLife.advance(now, { phase: atmosphereTime()?.phase, reducedMotion });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    drawSky(ctx);
    if (world3d?.ready) {
      try {
      const nowMs = Date.now(), layout = gardenLayout();
      if (!visitState && G.state.level >= (G.data.gardenConfig?.unlockLv || 6)) {
        if (!gardenVisitor && nowMs >= nextVisitorAt) gardenVisitor = { at: nowMs, bee: Math.random() > .5, x: layout.visitor.x, y: layout.visitor.y };
        if (gardenVisitor && nowMs - gardenVisitor.at > 90000) { gardenVisitor = null; nextVisitorAt = nowMs + 60000; }
      }
      const env = world3dEnvironment({ preview: preview3d() }); scheduleWorldWake(env);
      world3d.render(ctx, env);
      canvas.dataset.renderer = 'webgl'; canvas.dataset.rendererReason = '';
      canvas.dataset.stage = env.stage?.id || ''; canvas.dataset.scene = env.gardenPage ? 'garden-page' : env.stage ? 'page-stage' : 'home'; gardenCameraRestored = false;
      canvas.dataset.houseFloors = String(effectiveHouseFloors()); canvas.dataset.houseFloor = String(getHouseView().floor); canvas.dataset.houseView = getHouseView().view;
      residentHits.length = 0; playerHit = null;
      if (env.stage) return;
      draw3dFeedback(ctx, delta);
      if (G.atmosphere && atmosphereTime()) G.atmosphere.weather(ctx, { width, height, time: atmosphereTime(), state: G.state, reducedMotion, now, lights: [] });
      return;
      } catch (_) {
        world3d.ready = false; world3d.reason = 'webgl-render-failed'; world3d.release();
      }
    }
    canvas.dataset.renderer = 'canvas-fallback'; canvas.dataset.rendererReason = world3d?.reason || 'world3d-module-unavailable';
    ctx.save(); ctx.translate(width / 2, visibleHeight() / 2); ctx.scale(camera.scale, camera.scale); ctx.translate(-camera.x, -camera.y);
    residentHits.length = 0; playerHit = null;
    if (G.seaMap && !visitState) {
      const halfW = width / (2 * camera.scale), halfH = visibleHeight() / (2 * camera.scale);
      G.seaMap.draw(ctx, { time, reducedMotion, scale: camera.scale, view: { left: camera.x - halfW, right: camera.x + halfW, top: camera.y - halfH, bottom: camera.y + halfH } });
    }
    G.polish?.islandUnder(ctx); drawIsland(ctx); G.polish?.islandOver(ctx, { time, reducedMotion }); drawGarden(ctx); drawHouse(ctx); polishHouse(ctx); drawYard(ctx); drawResidents(ctx); drawPlayer(ctx); G.livePeers?.draw(ctx, { time, delta, reducedMotion, scale: camera.scale, house: renderState()?.house }); drawPlacement(ctx); drawDrag(ctx); drawRoomLabels(ctx); drawParticles(ctx, delta); ctx.restore();
    G.polish?.light(ctx, { width, height: visibleHeight(), time: atmosphereTime(), reducedMotion });
    if (G.atmosphere && atmosphereTime()) {
      const options = { width, height, time: atmosphereTime(), state: G.state, reducedMotion, now, lights: nightLights() };
      G.atmosphere.night(ctx, options); G.atmosphere.weather(ctx, options);
    }
    if (world3d && !world3d.ready) { const v = sceneViewport(); text(ctx, '立体画面暂不可用 · 当前使用平面场景', v.x + v.width / 2, v.y + v.height - 18, 12, '#865269'); }
    if (runtime.placing) {
      const def = furnitureDef(runtime.placing);
      const label = def?.place === 'yard' ? `点击前院，放下${def.name}` : `点地面选前后位置 · 放下${def?.name || '家具'}`;
      ctx.save(); ctx.font = '12px "PingFang SC",sans-serif'; const ww = ctx.measureText(label).width + 38;
      rr(ctx, width / 2 - ww / 2, visibleHeight() - 47, ww, 31, 15, '#FFF8E9', '#E0C8AD', 1.2); text(ctx, label, width / 2, visibleHeight() - 31, 12, '#A18474'); ctx.restore();
    }
  }
  function draw3dFeedback(c, delta) {
    particles = particles.filter(p => p.life > 0);
    for (const p of particles) {
      p.life -= delta; p.x += p.vx * delta; p.y += p.vy * delta; p.vy += 35 * delta;
      const q = world3d.worldToScreen(p.x, p.y); c.save(); c.globalAlpha = Math.max(0, p.life); star(c, q.x, q.y, p.size, p.color, time); c.restore();
    }
    const viewport = sceneViewport();
    if (runtime.placing) {
      const def = furnitureDef(runtime.placing), caption = def ? `放下${def.name} · 点击地面选择前后位置` : '请选择一件家具';
      const w = Math.min(viewport.width - 16, Math.max(190, caption.length * 12 + 28)), x = viewport.x + viewport.width / 2, y = viewport.y + viewport.height - 34;
      rr(c, x - w / 2, y - 17, w, 34, 14, '#FFF6E9', '#D8A5B6', 1.2); text(c, caption, x, y, 12, '#865269');
    }
    if (drag?.kind === 'room' && drag.moved && !unusableWorldPoint(drag.world)) {
      const target = roomAt(drag.world.x, drag.world.y, true), valid = target && openRoomSlot(target), q = camera.worldToScreen(drag.world.x, drag.world.y);
      const caption = valid ? target.id ? '松开，与这间房互换' : '松开，移到这块空位' : '拖到已开放的房间格';
      rr(c, q.x - 100, q.y - 42, 200, 30, 12, '#FFF6E9', valid ? '#91AF93' : '#D8A5B6', 1.2); text(c, caption, q.x, q.y - 27, 12, '#865269');
    }
    // 降级状态以画布属性及只读状态接口暴露；3D可用时输入仍沿既有系统提交。
  }
  // 离屏重新绘制纯场景。所有镜头与命中缓存都在 finally 中还原，不推进世界动画。
  function captureScene(options) {
    options = options || {};
    const scope = options.scope || 'house';
    // 串门时不拍照：拍到别人的小屋会把它存进自己的相册，先回自己的小屋再拍（摄影规则捕获异常后会提示这句）。
    if (visitState) throw new Error('正在串门，先回自己的小屋再拍照吧。');
    if (!['house', 'room', 'view'].includes(scope)) throw new Error('请先选择整屋或一个已建好的房间。');
    const room = scope === 'room' ? decorSpace(options.roomId) : null;
    if (scope === 'room' && !room) throw new Error('这间房还没有建好，先选一间温暖的小屋吧。');
    const photo = document.createElement('canvas');
    photo.width = Number.isInteger(options.width) ? clamp(options.width, 320, 1600) : 1280;
    photo.height = Number.isInteger(options.height) ? clamp(options.height, 240, 1200) : 960;
    const context = photo.getContext('2d');
    if (!context) throw new Error('这台浏览器暂时不能拍照，可以先导出JSON保存小屋。');
    const saved = { width, height, panelHeight, drag, capturingPhoto, captureHidesPlayer, captureFloorFocus, captureViewMode, ambientTime, ambientAt, playerHit, residentFrame, camera: { x: camera.x, y: camera.y, scale: camera.scale }, hits: residentHits.slice() };
    const viewFrame = world3d?.ready && world3d.env ? world3d.viewFrame() : null;
    const atmosphere = runtime.atmosphere, atmosphereSaved = atmosphere ? Object.assign({}, atmosphere) : null;
    const fFocus = Number.isInteger(Number(options.floorFocus)) && Number(options.floorFocus) >= 1 && Number(options.floorFocus) <= 4 ? Number(options.floorFocus) : 'all';
    const bounds = room ? { left: room.x - 16, right: room.x + (room.kind === 'attic' ? 510 : 336), top: room.y - 24, bottom: room.y + 232 } : scope === 'view' ? { left: camera.x - width / (2 * camera.scale), right: camera.x + width / (2 * camera.scale), top: camera.y - visibleHeight() / (2 * camera.scale), bottom: camera.y + visibleHeight() / (2 * camera.scale) } : typeof fFocus === 'number' ? { left: -535, right: 545, top: -220 * fFocus - 24, bottom: -220 * (fFocus - 1) + 28 } : sceneBounds();
    try {
      width = photo.width; height = photo.height; panelHeight = 0; drag = null; capturingPhoto = true;
      captureHidesPlayer = options.hidePlayer === true;
      captureFloorFocus = fFocus;
      captureViewMode = options.viewMode === 'exterior' ? 'exterior' : 'cutaway';
      if (G.sys.residentLife) residentFrame = G.sys.residentLife.snapshot({ phase: atmosphereTime()?.phase, reducedMotion });
      Object.assign(camera, frameFor(bounds, width, height, scope === 'view' ? 0 : 36, 4));
      // 天气模块持有同一个 runtime 对象；换用临时缓存，避免改变主画布的粒子或遮罩。
      if (atmosphere) { atmosphere.weatherKey = ''; atmosphere.skyKey = ''; atmosphere.particles = []; atmosphere.stars = []; atmosphere.mask = null; atmosphere.maskContext = null; atmosphere.lastAt = null; }
      context.setTransform(1, 0, 0, 1, 0, 0); context.lineCap = 'round'; context.lineJoin = 'round'; drawSky(context);
      if (world3d?.ready) {
        if (room) camera.scale = Math.min(camera.scale, height / 390);
        const captureView = scope === 'view' ? Object.assign({}, getHouseView(), { previewFourFloors: false }) : { floor: room ? room.kind === 'attic' ? 'attic' : room.floorIdx + 1 : fFocus, view: captureViewMode, previewFourFloors: false };
        const captureCamera = scope === 'view' && viewFrame ? { target: viewFrame.target, range: Math.max(viewFrame.range, viewFrame.range * viewFrame.aspect / (width / height)) } : null;
        world3d.render(context, world3dEnvironment({ width, height, offsetX: 0, offsetY: 0, dpr: 1, view: captureView, roomOnly: room?.id || null, hidePlayer: captureHidesPlayer, peers: [], preview: null, omitUid: null, captureCamera, forceHouse: true }), { photo: true });
        return photo;
      }
      context.save(); context.translate(width / 2, height / 2); context.scale(camera.scale, camera.scale); context.translate(-camera.x, -camera.y);
      if (room) { if (room.kind === 'attic') drawAttic(context, room); else drawRoom(context, room); }
      else { G.polish?.islandUnder(context); drawIsland(context); G.polish?.islandOver(context, { time, reducedMotion }); drawGarden(context); drawHouse(context); polishHouse(context); drawYard(context); drawResidents(context); drawPlayer(context); }
      context.restore();
      G.polish?.light(context, { width, height, time: atmosphereTime(), reducedMotion });
      if (G.atmosphere && atmosphereTime()) {
        const settings = { width, height, time: atmosphereTime(), state: G.state, reducedMotion, now: time * 1000, lights: nightLights() };
        G.atmosphere.night(context, settings); G.atmosphere.weather(context, settings);
      }
      return photo;
    } finally {
      width = saved.width; height = saved.height; panelHeight = saved.panelHeight; drag = saved.drag; capturingPhoto = saved.capturingPhoto; captureHidesPlayer = saved.captureHidesPlayer; captureFloorFocus = saved.captureFloorFocus; captureViewMode = saved.captureViewMode; ambientTime = saved.ambientTime; ambientAt = saved.ambientAt; playerHit = saved.playerHit; residentFrame = saved.residentFrame;
      Object.assign(camera, saved.camera); residentHits.splice(0, residentHits.length, ...saved.hits);
      if (world3d?.ready) { world3d.invalidate(); world3d.setEnvironment(world3dEnvironment()); needsDraw = true; }
      if (atmosphere && atmosphereSaved) { Object.keys(atmosphere).forEach(key => { delete atmosphere[key]; }); Object.assign(atmosphere, atmosphereSaved); }
    }
  }
  function frame(now) {
    raf = null; if (!initialized || document.hidden) return;
    const playing = !!G.runtime.minigames?.running || G.ui?.bakery?.isRunning?.();
    const interval = 1000 / (playing ? 5 : 30);
    if (now - lastPaint >= interval && (needsDraw || !reducedMotion)) { needsDraw = false; draw(now); lastPaint = now; }
    if (!reducedMotion || needsDraw) raf = requestAnimationFrame(frame);
  }
  function requestDraw() { needsDraw = true; if (initialized && !raf && !document.hidden) raf = requestAnimationFrame(frame); }
  function resize() {
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    width = Math.max(1, bounds.width || canvas.clientWidth || window.innerWidth);
    height = Math.max(1, bounds.height || canvas.clientHeight || window.innerHeight);
    dpr = Math.min(G.World3D ? 1.5 : 2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    camera.fit();
  }
  function localPoint(event) {
    const bounds = canvas.getBoundingClientRect(); return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }
  function placementCoords(def, room, point, grab, excludedUid) {
    const local = { x: point.x - room.x, y: point.y - room.y };
    let parent = null;
    if (def.place === 'table') {
      const held = grab || { u: .5, v: 1 };
      parent = roomItemGroups(room.data).flatMap(group => group.members).reverse().find(item => {
        if (item.uid === excludedUid || item.parent) return false;
        const target = furnitureDef(item.defId); if (!target?.surface || target.surface.x1 - target.surface.x0 < def.w) return false;
        const pos = itemPosition(room.data, item), sx = pos.x + target.surface.x0 * pos.scale, ex = pos.x + target.surface.x1 * pos.scale, sy = pos.y + target.surface.y * pos.scale;
        const center = local.x + (.5 - held.u) * def.w * pos.scale, bottom = local.y + (1 - held.v) * def.h * pos.scale;
        return center >= sx - 6 && center <= ex + 6 && Math.abs(bottom - sy) <= 38;
      });
    }
    const raw = parent ? G.roomSpace.tablePlacement(room.data, parent, def, local, grab) : G.roomSpace.placement(def, local, grab);
    // 不匹配台面时显式跳过旧坐标的自动吸附；预览与提交共用系统的落点约束。
    const parentId = parent?.uid || (def.place === 'table' ? '__no_surface__' : null);
    const resolved = G.sys.decorating.preview(def.id, room.id, raw.x, raw.y, parentId, excludedUid);
    return Object.assign({}, raw, resolved || {}, { parentId });
  }
  function drawPlacementPreview(c, room, def, pos, source, opacity) {
    const item = Object.assign({}, source || {}, pos, { defId: def.id, parent: pos.parent || null });
    const projected = itemPosition(room.data, item);
    c.save(); c.translate(room.x, room.y);
    if (def.place === 'floor') {
      ellipse(c, projected.footX, projected.footY, Math.max(12, projected.w * .45), 4, '#A5BE8B88', '#7F9F74', 1);
      line(c, projected.footX, 142, projected.footX, projected.footY, '#A7B69266', 1);
    }
    c.globalAlpha = opacity;
    c.save(); c.translate(projected.x, projected.y); c.scale(projected.scale, projected.scale); drawFurniture(c, def, 0, 0, item); c.restore();
    if (source?.uid) {
      const sourceRoom = drag?.kind === 'item' && drag.hit.item.uid === source.uid ? drag.hit.room.data : room.data;
      sourceRoom.items.filter(child => child.parent === source.uid).forEach(child => {
        const movedChild = Object.assign({}, child, { x: child.x + pos.x - source.x, y: child.y + pos.y - source.y });
        const temporary = { items: [item, movedChild] }, childPos = itemPosition(temporary, movedChild);
        c.save(); c.translate(childPos.x, childPos.y); c.scale(childPos.scale, childPos.scale); drawFurniture(c, furnitureDef(child.defId), 0, 0, child); c.restore();
      });
    }
    c.globalAlpha = 1; c.setLineDash([4, 4]); rr(c, projected.x - 3, projected.y - 3, projected.w + 6, projected.h + 6, 7, null, '#A78D6E', 1.2); c.restore();
  }
  function placeItem(defId, point) {
    if (visitState || unusableWorldPoint(point)) return; // 串门时一律不写自己的存档
    const def = furnitureDef(defId), pickedRoom = point.target?.room;
    // GL提交只认这次射线实际命中的房间，不能用activeRoom或旧二维矩形补造落点。
    const resolved = pickedRoom?.id && decorSpace(pickedRoom.id);
    const room = world3d?.ready ? resolved && resolved.kind === pickedRoom.kind && resolved.floorIdx === pickedRoom.floorIdx && resolved.slotIdx === pickedRoom.slotIdx ? resolved : null : roomAt(point.x, point.y, false);
    if (!def) return;
    if (def.place === 'yard' && G.sys.yard) {
      if (!inYard(point)) { G.ui.toast('把它放在屋前的大草坪上吧。'); return; }
      const result = G.sys.yard.place(defId, point.x - def.w / 2, point.y - def.h / 2);
      if (result.ok) { runtime.placing = null; runtime.selected = { yard: true, uid: result.uid, roomId: null }; addParticles(result.x + def.w / 2, result.y + def.h / 2); G.ui.selection(); G.ui.refresh(); }
      G.ui.toast(result.message); return;
    }
    if (!room) { G.ui?.toast?.('先点一个已建好的房间吧'); return; }
    const pos = placementCoords(def, room, point);
    let result;
    try { result = G.sys?.decorating?.place?.(defId, room.id, pos.x, pos.y, pos.parentId, pos.depth); }
    catch (error) { G.ui?.toast?.(error?.message || '这次没能保存摆放，请重试或取消。'); requestDraw(); return; }
    if (result?.ok) {
      placementEpoch++; runtime.placing = null; runtime.mode = 'explore'; runtime.activeRoomId = room.id; runtime.selected = { roomId: room.id, uid: result.uid };
      clearPointerInteraction(); hover = null; lastPick = null;
      const projected = itemPosition(room.data, Object.assign({ defId }, pos));
      addParticles(room.x + projected.footX, room.y + projected.footY);
      G.bus?.emit?.('scene:placed', { roomId: room.id, defId, result });
    } else G.ui?.toast?.(result?.message || '这件家具暂时放不下');
    requestDraw();
  }
  // 串门时只响应“点地面走过去”：编辑、选中、花圃、居民、小访客、邻居云朵、房间标签一律忽略。
  const visitIgnoredKinds = ['room-label', 'room-enter', 'attic', 'neighbor', 'visitor', 'plot', 'resident', 'player', 'item', 'yard-item', 'fixed-observatory'];
  function visitClick(point) {
    if (!visitIgnoredKinds.includes(point.target?.kind)) G.visitSession?.walkTo?.(point) || G.hostRoom?.walkTo?.(point);
    requestDraw();
  }
  function sceneClick(point) {
    if (unusableWorldPoint(point)) return;
    if (visitState) { visitClick(point); return; }
    if (!runtime.placing && point.target && world3d?.ready) {
      const hit = point.target;
      if (hit.kind === 'room-label') { G.bus.emit('scene:room-layout', { roomId: hit.roomId }); return; }
      if (hit.kind === 'room-enter') {
        if (runtime.player?.zone === hit.roomId) G.playerMovement?.toYard?.(-0.6, 2.4); else G.playerMovement?.enterRoom?.(hit.roomId);
        requestDraw(); return;
      }
      if (hit.kind === 'attic') { G.bus.emit('scene:observatory', {}); return; }
      if (hit.kind === 'neighbor') { G.bus.emit('scene:neighbor', { id: hit.id, empty: !!hit.empty }); return; }
      if (hit.kind === 'visitor' && gardenVisitor) { const v = gardenVisitor; gardenVisitor = null; nextVisitorAt = Date.now() + 60000; G.sys.economy.reward(5, 0, '花园小访客'); addParticles(v.x, v.y); G.ui?.toast?.('小访客送来 5 颗糖果，谢谢你陪它玩！'); requestDraw(); return; }
      if (hit.kind === 'plot') {
        // 收获规则会先发布新state，再发harvested；这次点击仍从已显示的植株上方起飞。
        gardenActionOrigin = world3d.env.gardenPage ? { index: hit.index, point: harvestOrigin(hit.index) } : null;
        try { G.bus.emit('scene:garden', { index: hit.index }); } finally { gardenActionOrigin = null; }
        return;
      }
      if (world3d.env.gardenPage) return;
      if (hit.kind === 'resident') { if (hit.id === 'nuomi') { G.ui?.open?.('help'); G.bus.emit('scene:guide', {}); } else G.bus.emit('scene:resident', { id: hit.id }); return; }
      if (hit.kind === 'player') { G.bus.emit('scene:player', {}); return; }
      if (hit.kind === 'item') { runtime.selected = { roomId: hit.roomId, uid: hit.uid }; runtime.activeRoomId = hit.roomId; G.bus.emit('scene:item', runtime.selected); requestDraw(); return; }
      if (hit.kind === 'yard-item') { runtime.selected = { yard: true, uid: hit.uid, roomId: null }; G.bus.emit('yard:selected', { uid: hit.uid }); requestDraw(); return; }
      if (G.hostRoom?.walkTo(point)) return;
      runtime.selected = null;
      if (hit.room?.id) { runtime.activeRoomId = hit.room.id; G.bus.emit('scene:room', { roomId: hit.room.id }); }
      else if (hit.kind === 'empty' && !hit.preview && hit.room) G.bus.emit('scene:empty', { floorIdx: hit.room.floorIdx, slotIdx: hit.room.slotIdx });
      else G.bus.emit('scene:deselect', {});
      requestDraw(); return;
    }
    if (runtime.placing) { placeItem(runtime.placing, point); return; }
    const label = roomLabelAt(point);
    if (label) { G.bus.emit('scene:room-layout', { roomId: label.roomId }); return; }
    const attic = atticDecorRoom(), observation = attic?.observation.rect;
    if (observation && point.x >= observation.x && point.x <= observation.x + observation.w && point.y >= observation.y && point.y <= observation.y + observation.h || !attic && atticAt(point)) { G.bus.emit('scene:observatory', {}); return; }
    const neighbor = G.seaMap?.hitAt(point, camera.scale);
    if (neighbor) { G.bus.emit('scene:neighbor', { id: neighbor.id, empty: !!neighbor.empty }); return; }
    const yardItem = yardAt(point.x, point.y);
    if (yardItem) { runtime.selected = { yard: true, uid: yardItem.uid, roomId: null }; G.bus.emit('yard:selected', { uid: yardItem.uid }); return; }
    if (gardenVisitorAt(point)) {
      const x = gardenVisitor.x, y = gardenVisitor.y;
      gardenVisitor = null; nextVisitorAt = Date.now() + 60000;
      G.sys.economy.reward(5, 0, '花园小访客'); addParticles(x, y); G.ui.toast('小访客送来 5 颗糖果，谢谢你陪它玩！'); return;
    }
    const plot = gardenPlotAt(point);
    if (plot) { G.bus.emit('scene:garden', { index: plot.index }); return; }
    const contains = hit => hit && point.x >= hit.x && point.x <= hit.x + hit.w && point.y >= hit.y && point.y <= hit.y + hit.h;
    const actors = residentHits.filter(contains).map(hit => Object.assign({ type: 'resident' }, hit));
    if (contains(playerHit)) actors.push(Object.assign({ type: 'player' }, playerHit));
    actors.sort((a, b) => (b.depth || 0) - (a.depth || 0) || (b.z || 0) - (a.z || 0));
    const actor = actors[0], item = itemAt(point.x, point.y);
    const itemInFront = item && (!actor || item.depth > (actor.depth || 0) || item.depth === (actor.depth || 0) && item.z >= (actor.z || 0));
    if (itemInFront) { runtime.selected = { roomId: item.room.id, uid: item.item.uid }; runtime.activeRoomId = item.room.id; G.bus?.emit?.('scene:item', runtime.selected); return; }
    if (actor) {
      if (actor.type === 'player') G.bus.emit('scene:player', {});
      else if (actor.id === 'nuomi') { G.ui?.open?.('help'); G.bus?.emit?.('scene:guide', {}); }
      else G.bus?.emit?.('scene:resident', { id: actor.id });
      return;
    }
    if (G.hostRoom?.walkTo(point)) return;
    const room = roomAt(point.x, point.y, true);
    runtime.selected = null;
    if (room?.id) { runtime.activeRoomId = room.id; G.bus?.emit?.('scene:room', { roomId: room.id }); }
    else if (room) G.bus?.emit?.('scene:empty', { floorIdx: room.floorIdx, slotIdx: room.slotIdx });
    else G.bus?.emit?.('scene:deselect', {});
    requestDraw();
  }
  function onPointerDown(event) {
    if (event.button && event.button !== 0) return;
    const point = localPoint(event), world = camera.screenToWorld(point.x, point.y);
    pointers.set(event.pointerId, point); canvas.setPointerCapture?.(event.pointerId);
    if (pointers.size >= 2) {
      const p = Array.from(pointers.values());
      const distance = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      pinch = { distance, lastDistance: distance, stage: !!(world3d?.env?.stage || world3d?.env?.gardenPage), scale: camera.scale };
      drag = null; return;
    }
    if (world3d?.env?.stage) { drag = { kind: 'stage-pan', pointerId: event.pointerId, start: point, last: point, world, moved: false }; canvas.style.cursor = 'grab'; return; }
    if (world3d?.env?.gardenPage) { drag = { kind: 'garden-pan', pointerId: event.pointerId, start: point, last: point, world, moved: false }; canvas.style.cursor = 'grab'; return; }
    // 串门：只允许拖动相机（pan）和点地面，不命中名牌、庭院家具、房内家具。
    if (visitState) { drag = { kind: 'pan', pointerId: event.pointerId, hit: null, start: point, last: point, world, moved: false, offset: null }; canvas.style.cursor = 'grabbing'; return; }
    const label = !runtime.placing ? roomLabelAt(world) : null;
    if (label && G.sys?.building?.swapRooms) {
      const room = G.state.house.rooms[label.roomId];
      drag = { kind: 'room', pointerId: event.pointerId, roomId: label.roomId, roomType: room.type, from: { floorIdx: label.floorIdx, slotIdx: label.slotIdx }, snapshot: roomLayoutSnapshot(), start: point, last: point, world, moved: false };
      canvas.style.cursor = 'grab'; requestDraw(); return;
    }
    const brush = furnitureDef(runtime.placing);
    if (brush?.place === 'yard' && brush.stroke && inYard(world)) { drag = { kind: 'yard-stroke', pointerId: event.pointerId, points: [world], start: point, last: point, world, moved: false }; return; }
    const yardItem = !runtime.placing ? yardAt(world.x, world.y) : null;
    if (yardItem) { drag = { kind: 'yard-item', pointerId: event.pointerId, hit: yardItem, start: point, last: point, world, moved: false, offset: { x: world.x - yardItem.x, y: world.y - yardItem.y } }; canvas.style.cursor = 'grab'; return; }
    const hit = !runtime.placing ? itemAt(world.x, world.y) : null;
    drag = { kind: hit ? 'item' : 'pan', pointerId: event.pointerId, hit, start: point, last: point, world, moved: false, offset: hit ? { x: world.x - hit.room.x - hit.pos.x, y: world.y - hit.room.y - hit.pos.y } : null };
    if (hit) drag.grab = G.roomSpace.grab(hit.pos, { x: world.x - hit.room.x, y: world.y - hit.room.y });
    canvas.style.cursor = hit ? 'grab' : runtime.placing ? 'copy' : 'grabbing';
  }
  function onPointerMove(event) {
    const point = localPoint(event), world = camera.screenToWorld(point.x, point.y);
    placementPoint = unusableWorldPoint(world) ? null : world; hover = world;
    if (pointers.has(event.pointerId)) pointers.set(event.pointerId, point);
    if (pinch && pointers.size >= 2) {
      const p = Array.from(pointers.values()), middle = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
      const distance = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      if (pinch.stage) { camera.zoom(distance / Math.max(1, pinch.lastDistance), middle); pinch.lastDistance = distance; return; }
      camera.zoom((pinch.scale * distance / Math.max(1, pinch.distance)) / camera.scale, middle); return;
    }
    if (['stage-pan', 'garden-pan'].includes(drag?.kind) && pointers.has(event.pointerId)) {
      if (Math.hypot(point.x - drag.start.x, point.y - drag.start.y) > 5) drag.moved = true;
      if (drag.moved) { if (event.altKey || camera.getInteractionMode() === 'orbit' && !event.shiftKey) world3d.rotate(point.x - drag.last.x, point.y - drag.last.y); else if (drag.kind === 'garden-pan') world3d.panScreen(point.x - drag.last.x, point.y - drag.last.y); else world3d.panStage(point.x - drag.last.x, point.y - drag.last.y); }
      drag.last = point; drag.world = world; requestDraw(); return;
    }
    if (!drag || !pointers.has(event.pointerId)) {
      if (visitState) { canvas.style.cursor = 'grab'; placementPoint = null; requestDraw(); return; }
      const overResident = residentHits.some(r => world.x >= r.x && world.x <= r.x + r.w && world.y >= r.y && world.y <= r.y + r.h);
      const overGarden = gardenPlotAt(world) || gardenVisitorAt(world);
      canvas.style.cursor = runtime.placing ? 'copy' : roomLabelAt(world) || itemAt(world.x, world.y) || yardAt(world.x, world.y) || overResident || overGarden || roomAt(world.x, world.y, true) ? 'pointer' : 'grab';
      requestDraw(); return;
    }
    if (Math.hypot(point.x - drag.start.x, point.y - drag.start.y) > 5) drag.moved = true;
    if (drag.kind === 'room') {
      if (!roomDragValid(drag)) { clearPointerInteraction(); G.ui?.toast?.('房间位置已经改变，重新选一间吧。'); requestDraw(); return; }
      drag.last = point; drag.world = world; canvas.style.cursor = drag.moved ? 'grabbing' : 'grab'; requestDraw(); return;
    }
    if (drag.kind === 'yard-stroke') { if (inYard(world) && drag.points.length < 500 && Math.hypot(world.x - drag.points[drag.points.length - 1].x, world.y - drag.points[drag.points.length - 1].y) > 8) drag.points.push(world); drag.world = world; requestDraw(); return; }
    if (drag.moved && drag.kind === 'pan') {
      if (event.altKey || camera.getInteractionMode() === 'orbit' && !event.shiftKey) {
        if (world3d?.ready) world3d.rotate(point.x - drag.last.x, point.y - drag.last.y);
      } else {
        camera.pan(point.x - drag.last.x, point.y - drag.last.y);
      }
    }
    if (drag.moved && drag.kind === 'item') { runtime.selected = { roomId: drag.hit.room.id, uid: drag.hit.item.uid }; canvas.style.cursor = 'grabbing'; }
    if (drag.moved && drag.kind === 'yard-item') { runtime.selected = { yard: true, uid: drag.hit.uid, roomId: null }; canvas.style.cursor = 'grabbing'; }
    drag.last = point; drag.world = camera.screenToWorld(point.x, point.y); requestDraw();
  }
  function onPointerUp(event) {
    // 取消前的迟到release不能消费重选后另一根手指建立的新手势。
    if (!pointers.has(event.pointerId) || !pinch && drag && drag.pointerId !== event.pointerId) return;
    pointers.delete(event.pointerId);
    if (pinch) { if (pointers.size < 2) pinch = null; drag = null; return; }
    if (!drag) return;
    const state = drag, point = localPoint(event), world = camera.screenToWorld(point.x, point.y); drag = null;
    if (visitState && state.kind !== 'pan') { clearPointerInteraction(); requestDraw(); return; } // 串门期间不执行任何会写存档的拖放
    if (state.kind === 'garden-pan') { if (!state.moved && !unusableWorldPoint(world)) sceneClick(world); clearPointerInteraction(); requestDraw(); return; }
    if (state.kind === 'stage-pan' || world.stagePreview) { clearPointerInteraction(); requestDraw(); return; }
    // 视口外的空白可用于转镜头，但释放不能变成放置、交换或“拖出房间收起”。
    if (unusableWorldPoint(world)) { clearPointerInteraction(); requestDraw(); return; }
    if (state.kind === 'room') {
      if (roomDragValid(state)) {
        if (!state.moved) G.bus.emit('scene:room-layout', { roomId: state.roomId });
        else {
          const target = roomAt(world.x, world.y, true);
          if (openRoomSlot(target)) {
            const result = G.sys.building.swapRooms(state.roomId, target.floorIdx, target.slotIdx, target.id || null);
            G.ui?.toast?.(result.message);
            if (result.ok && !result.unchanged) { G.audio?.play?.('success'); G.ui?.refresh?.(); }
          } else G.ui?.toast?.('拖到已开放的房间格，就能互换位置啦。');
        }
      } else G.ui?.toast?.('房间位置已经改变，重新选一间吧。');
      clearPointerInteraction(); requestDraw(); return;
    }
    if (state.kind === 'yard-stroke') {
      const def = furnitureDef(runtime.placing);
      if (def && G.sys.yard) {
        if (inYard(world)) state.points.push(world);
        const result = G.sys.yard.placeStroke(def.id, state.points.map(p => ({ x: p.x - def.w / 2, y: p.y - def.h / 2 })), { buyMissing: !!runtime.yardAutoBuy });
        G.ui.toast(result.message); if (result.ok) G.ui.refresh();
        if (!(G.state.inventory[def.id] > 0) && !runtime.yardAutoBuy) runtime.placing = null;
      }
      canvas.style.cursor = runtime.placing ? 'copy' : 'grab'; requestDraw(); return;
    }
    if (state.moved && state.kind === 'yard-item') {
      const result = G.sys.yard.move(state.hit.uid, world.x - state.offset.x, world.y - state.offset.y);
      G.ui.toast(result.message); runtime.selected = { yard: true, uid: state.hit.uid, roomId: null }; G.bus.emit('yard:selected', { uid: state.hit.uid }); canvas.style.cursor = 'grab'; requestDraw(); return;
    }
    if (state.moved && state.kind === 'item') {
      const room = roomAt(world.x, world.y, false);
      if (room) {
        const pos = placementCoords(state.hit.def, room, world, state.grab, state.hit.item.uid);
        const result = G.sys?.decorating?.move?.(state.hit.room.id, state.hit.item.uid, room.id, pos.x, pos.y, pos.parentId, pos.depth);
        if (result?.ok) {
          runtime.selected = { roomId: room.id, uid: state.hit.item.uid }; runtime.activeRoomId = room.id;
          const projected = itemPosition(room.data, Object.assign({}, state.hit.item, pos));
          addParticles(room.x + projected.footX, room.y + projected.footY);
          G.bus?.emit?.('scene:item', runtime.selected);
        } else G.ui?.toast?.(result?.message || '再选一个位置试试');
      } else if (!roomAt(world.x, world.y, true)) {
        const result = G.sys?.decorating?.remove?.(state.hit.room.id, state.hit.item.uid);
        if (result?.ok) {
          runtime.selected = null;
          G.bus?.emit?.('scene:deselect', {});
          G.ui?.toast?.(result.message || '已经放回背包啦。');
        } else G.ui?.toast?.(result?.message || '暂时没能收起，请再试一次');
      } else G.ui?.toast?.('先建好这个房间，再把家具搬进来吧');
    } else if (!state.moved) sceneClick(world);
    canvas.style.cursor = runtime.placing ? 'copy' : 'grab'; requestDraw();
  }
  function init(target) {
    if (initialized) return;
    canvas = target || document.getElementById('scene'); if (!canvas) return;
    if (!canvas.dataset) canvas.dataset = {};
    ctx = canvas.getContext('2d'); if (!ctx) return;
    if (G.World3D) world3d = new G.World3D(requestDraw);
    initialized = true; lastPaint = 0; gardenStageAt = 0; lastFloorCount = G.state.house.floors.length;
    canvas.style.touchAction = 'none'; canvas.style.cursor = 'grab';
    camera.setInteractionMode(camera.getInteractionMode());
    canvas.setAttribute('aria-label', '棉花糖小屋立体互动场景，拖动空白平移画面，可切换旋转模式环绕小屋，点击房间建造，拖动房间名牌互换位置，拖动家具，使用滚轮或双指缩放');
    listen(canvas, 'pointerdown', onPointerDown);
    listen(canvas, 'pointermove', onPointerMove);
    listen(canvas, 'pointerup', onPointerUp);
    listen(canvas, 'pointercancel', () => { clearPointerInteraction(); requestDraw(); });
    listen(canvas, 'pointerleave', () => { if (!drag) placementPoint = null; });
    listen(canvas, 'wheel', event => {
      event.preventDefault();
      const app = document.getElementById('app');
      if (app && app.classList.contains('home-paper-open')) {
        app.classList.remove('home-paper-open');
        if (document.getElementById('panel')?.classList.contains('hidden')) app.classList.remove('has-open-panel');
        if (G.ui?.visualShell?.scheduleLayout) G.ui.visualShell.scheduleLayout();
      }
      camera.zoom(Math.exp(clamp(-event.deltaY * .0014, -1.2, 1.2)), localPoint(event));
    }, { passive: false });
    listen(canvas, 'dblclick', event => { const p = localPoint(event), w = camera.screenToWorld(p.x, p.y), room = roomAt(w.x, w.y, false); if (roomLabelAt(w)) return; if (room) camera.focusRoom(room.id); });
    listen(canvas, 'dragover', event => { event.preventDefault(); if (visitState || staleHtmlDrag(event.dataTransfer) || canvas.dataset.scene === 'garden-page' && !runtime.placing) { placementPoint = null; if (event.dataTransfer) event.dataTransfer.dropEffect = 'none'; requestDraw(); return; } const p = localPoint(event), id = draggedItemId(event); placementPoint = id ? camera.screenToWorld(p.x, p.y, id) : null; if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'; requestDraw(); });
    listen(canvas, 'drop', event => { event.preventDefault(); if (visitState || staleHtmlDrag(event.dataTransfer) || canvas.dataset.scene === 'garden-page' && !runtime.placing) return; const id = draggedItemId(event), p = localPoint(event); if (id) placeItem(id, camera.screenToWorld(p.x, p.y, id)); });
    listen(document, 'keydown', event => {
      if (event.key === 'Escape') {
        const app = document.getElementById('app');
        if (app && app.classList.contains('home-paper-open')) {
          app.classList.remove('home-paper-open');
          if (document.getElementById('panel')?.classList.contains('hidden')) app.classList.remove('has-open-panel');
          if (G.ui?.visualShell?.scheduleLayout) G.ui.visualShell.scheduleLayout();
        }
        cancelPlacement(); G.bus?.emit?.('scene:deselect', {});
      }
    });
    listen(window, 'resize', resize);
    listen(window, 'blur', clearPointerInteraction);
    listen(document, 'visibilitychange', () => {
      if (document.hidden) { stopWorldWake(); if (raf) cancelAnimationFrame(raf); raf = null; clearPointerInteraction(); }
      else { lastTime = performance.now(); lastPaint = 0; start(); }
    });
    if (typeof ResizeObserver !== 'undefined') (resizeObserver = new ResizeObserver(resize)).observe(canvas);
    onBus('panel:change', event => { panelHeight = event?.open && event.layout !== 'side' ? Math.max(0, Math.min(height - 180, Number(event.height) || 280)) : 0; camera.fit(); });
    // 串门期间自己的存档变化（自动存档、云同步、导入等）与画面无关：不重建、不改相机，离开时 set(null) 会整体复位。
    onBus('state:change', () => { if (visitState) return; world3d?.invalidate(); gardenStageAt = 0; const count = G.state?.house?.floors?.length || 1; if (count !== lastFloorCount) { lastFloorCount = count; camera.fit(); } requestDraw(); });
    onBus('state:replace', () => { if (visitState) { gardenVisitor = null; gardenStageAt = 0; nextVisitorAt = Date.now() + 15000; lastFloorCount = G.state?.house?.floors?.length || 1; return; } syncGardenCamera(null); gardenCameraRestored = false; runtime.activeRoomId = null; runtime.houseView = { floor: 'all', view: 'cutaway', previewFourFloors: false }; cancelPlacement(); gardenVisitor = null; gardenStageAt = 0; gardenStages = []; nextVisitorAt = Date.now() + 15000; world3d?.invalidate(); if (world3d?.ready) { camera.focusKind = 'overview'; camera.focusId = null; const env = world3dEnvironment({ forceHouse: true }); world3d.setEnvironment(env); world3d.fitCamera(env); } camera.fit(); requestDraw(); });
    onBus('state:change', () => { ambientAt = 0; });
    onBus('avatar:changed', () => { world3d?.invalidate(); requestDraw(); });
    onBus('avatar:worn', () => { world3d?.invalidate(); requestDraw(); });
    onBus('time:change', () => { ambientAt = 0; world3d?.invalidate(); requestDraw(); });
    onBus('room:swapped', event => {
      clearPointerInteraction(); camera.focusRoom(event.roomId);
      const room = rooms().find(entry => entry.id === event.roomId); if (room) addParticles(room.x + 160, room.y + 80);
      G.ui?.selection?.(); requestDraw();
    });
    onBus('room:built', event => { const room = rooms().find(r => r.id === event?.roomId); if (room) addParticles(room.x + 160, room.y + 100); });
    onBus('observatory:built', () => { camera.focusObservatory(); const point = atticDecorRoom()?.observation.world; if (point) addParticles(point.x, point.y); });
    onBus('observatory:observed', () => { const point = atticDecorRoom()?.observation.world; if (point) addParticles(point.x, point.y); });
    onBus('resident:moved_in', event => { const state = G.state?.residents?.[event?.id || event?.residentId], room = rooms().find(r => r.id === state?.roomId); if (room) addParticles(room.x + 190, room.y + 100, 'heart'); });
    onBus('resident:happy', event => { const state = G.state?.residents?.[event?.id], room = rooms().find(r => r.id === state?.roomId); if (room) addParticles(room.x + 190, room.y + 100, 'heart'); });
    if (typeof matchMedia === 'function') { const mq = matchMedia('(prefers-reduced-motion: reduce)'); if (mq.addEventListener) listen(mq, 'change', event => { reducedMotion = event.matches; requestDraw(); }); }
    if (G.live?.subscribe) { liveSnapshot = G.live.status?.() || null; const off = G.live.subscribe(snapshot => { liveSnapshot = snapshot; requestDraw(); }); if (typeof off === 'function') cleanup.push(off); }
    resize();
  }
  function start() { if (!initialized || raf || document.hidden) return; needsDraw = true; raf = requestAnimationFrame(frame); }
  function destroy() {
    stopWorldWake(); if (raf) cancelAnimationFrame(raf); raf = null; clearPointerInteraction();
    resizeObserver?.disconnect(); resizeObserver = null;
    for (const off of cleanup.splice(0)) { try { off(); } catch (_) {} }
    world3d?.destroy(); G.avatar3D?.destroy?.(); world3d = null; lastPick = null; liveSnapshot = null; residentFrame = null; pageStageActive = false; houseCameraBeforeStage = null; gardenPageActive = false; houseCameraBeforeGarden = null; gardenCameraRestored = false; gardenActionOrigin = null;
    initialized = false; needsDraw = true; particles = []; canvas = ctx = null; visitState = null;
  }

  function drawThumbnail(target, defId) {
    const def = furnitureDef(defId); if (!target || !def) return;
    const bounds = target.getBoundingClientRect?.(); const ww = bounds?.width || 96, hh = bounds?.height || 76, ratio = Math.min(2, window.devicePixelRatio || 1);
    target.width = Math.round(ww * ratio); target.height = Math.round(hh * ratio);
    const c = target.getContext('2d'); if (!c) return;
    c.setTransform(ratio, 0, 0, ratio, 0, 0); c.clearRect(0, 0, ww, hh);
    const s = Math.min((ww - 16) / def.w, (hh - 16) / def.h, 1.15);
    c.translate((ww - def.w * s) / 2, (hh - def.h * s) / 2); c.scale(s, s); drawFurniture(c, def, 0, 0, {});
  }
  function drawCharacter(target, id) {
    if (!target) return;
    const bounds = target.getBoundingClientRect?.(), ww = bounds?.width || 90, hh = bounds?.height || 100, ratio = Math.min(2, window.devicePixelRatio || 1);
    target.width = Math.round(ww * ratio); target.height = Math.round(hh * ratio);
    const c = target.getContext('2d'); if (!c) return;
    c.setTransform(ratio, 0, 0, ratio, 0, 0); c.clearRect(0, 0, ww, hh);
    character(c, id, ww / 2, hh - 7, Math.min((ww - 12) / (G.data.residents.find(def => def.id === id)?.portraitWidth || 75), (hh - 12) / (G.data.residents.find(def => def.id === id)?.portraitHeight || (id === 'lily' ? 112 : 93))), { still: true });
  }
  function drawAvatar3D(target, look, options) { try { return G.avatar3D?.draw?.(target, look, options || {}) === true; } catch (_) { return false; } }

  // 花园飞入篮子的起点复用实际镜头投影，不猜测地块在页面上的位置。
  function harvestOrigin(index) {
    if (gardenActionOrigin?.index === index) return gardenActionOrigin.point;
    if (world3d?.env?.stage) return null;
    const plot = gardenPositions()[index]; if (!canvas || !plot) return null;
    if (world3d?.ready) world3d.setEnvironment(world3dEnvironment());
    const anchor = world3d?.env?.gardenPage?.plots.find(value => value.index === index)?.harvestAnchor;
    const point = anchor ? world3d.project(anchor) : camera.worldToScreen(plot.particleX, plot.particleY), rect = canvas.getBoundingClientRect();
    const viewport = sceneViewport(); if (point.x < viewport.x || point.y < viewport.y || point.x > viewport.x + viewport.width || point.y > viewport.y + viewport.height) return null;
    return { x: rect.left + point.x * rect.width / width, y: rect.top + point.y * rect.height / height };
  }
  // 主场景串门：set(visitState) 切到对方小屋的只读渲染，set(null) 回到自己的家园。
  // 首次 set：清掉摆放/选中/拖拽/拾取缓存，相机适配整座别人的房子；快照刷新再次 set：保持相机，除非正聚焦的房间/楼层/阁楼已被拆掉。
  function setVisit(next) {
    next = next && typeof next === 'object' && next.house ? next : null;
    if (next === visitState) return;
    const was = !!visitState;
    clearPointerInteraction(); hover = null; lastPick = null; placementPoint = null; residentHits.length = 0; playerHit = null; gardenStageAt = 0;
    if (next && was) {
      // 快照刷新：只换数据。
      visitState = next; world3d?.invalidate();
      const view = getHouseView(), focusGone = (runtime.activeRoomId && !decorSpace(runtime.activeRoomId)) || (camera.focusKind === 'room' && camera.focusId && !decorSpace(camera.focusId)) ||
        (typeof view.floor === 'number' && view.floor > effectiveHouseFloors()) || (view.floor === 'attic' && !next.house.attic);
      if (runtime.activeRoomId && !decorSpace(runtime.activeRoomId)) runtime.activeRoomId = null;
      if (focusGone) { world3d?.resetView(); setHouseView({ floor: 'all', view: 'cutaway', previewFourFloors: false }); }
      lastFloorCount = effectiveHouseFloors(); requestDraw(); return;
    }
    // 进入或离开：先复位摆放、选中、花园页/舞台页相机，再换状态。
    placementEpoch++; runtime.placing = null; runtime.selected = null; runtime.activeRoomId = null; particles = [];
    if (next) runtime.mode = 'visit'; // camera.fit 按 mode 选聚焦分支，进入时先固定为 visit（会话层也会设同样的值）
    syncGardenCamera(null); syncStageCamera(null); gardenCameraRestored = false;
    visitState = next; world3d?.invalidate();
    if (next) {
      G.playerMovement?.resetKeys?.(); // 松开仍按住的方向键，避免本地玩家在后台继续走
      world3d?.resetView(); camera.focusKind = 'overview'; camera.focusId = null;
      setHouseView({ floor: 'all', view: 'cutaway', previewFourFloors: false }); // 已初始化时内部 camera.fit()，适配整座别人的房子
    } else {
      lastFloorCount = G.state?.house?.floors?.length || 1;
      camera.goHome();
    }
    requestDraw();
  }
  G.render = { init, start, resize, destroy, visit: { set: setVisit, active: () => !!visitState }, rendererStatus: () => ({ renderer: world3d?.ready ? 'webgl' : 'canvas-fallback', reason: world3d?.reason || (!initialized ? 'not-initialized' : 'world3d-module-unavailable'), builds: world3d?.builds || 0, stage: world3d?.env?.stage?.id || null, gardenPage: world3d?.env?.gardenPage?.id || null }), camera, beginPlacement, cancelPlacement, captureScene, drawThumbnail, drawCharacter, drawAvatar3D, harvestOrigin, getHouseView, setHouseView, redraw: requestDraw, layout: { roomLabel, roomLabelAt, attic: atticLayout, atticRoom: atticDecorRoom, atticAt, garden: gardenLayout, plotAt: gardenPlotAt, overview: sceneBounds, frame: frameFor } };
  G.draw = G.draw || {}; G.draw.furniture = G.draw.furniture || {};
  G.draw.furniture.draw = drawFurniture;
}());
