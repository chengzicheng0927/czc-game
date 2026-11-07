/* 衣橱全身软陶预览：一个长期WebGL离屏场景，整段身体网格真实绕Y轴转向。 */
(function (G) {
  'use strict';
  const MODEL_LIMIT = 6, IMAGE_LIMIT = 20, TARGET_LIMIT = 24;
  const IMAGE_PIXEL_LIMIT = 2000000, FRAME_PIXEL_LIMIT = 1000000;
  const FACING_YAW = Math.PI / 4;
  const previewState = { house: {} };
  const models = new Map(), images = new Map(), targets = new Map();
  let world = null, imagePixels = 0, reason = 'not-initialized', contextsCreated = 0, renders = 0;
  let listening = false, recovering = false;
  const finite = Number.isFinite;
  const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
  function remember(map, key, value, limit) {
    map.delete(key); map.set(key, value);
    while (map.size > limit) map.delete(map.keys().next().value);
    return value;
  }
  function clearImages() {
    for (const entry of images.values()) { entry.canvas.width = entry.canvas.height = 1; }
    images.clear(); imagePixels = 0;
  }
  function lookCopy(look) {
    const source = look || {};
    return { skin: source.skin, hair: source.hair, hairColor: source.hairColor, face: source.face,
      top: source.top || null, bottom: source.bottom || null, dress: source.dress || null, shoes: source.shoes || null,
      acc: Array.isArray(source.acc) ? source.acc.slice() : [] };
  }
  function yawFor(options) {
    if (finite(options.yaw)) return options.yaw >= -Math.PI && options.yaw <= Math.PI ? options.yaw : Math.atan2(Math.sin(options.yaw), Math.cos(options.yaw));
    return options.facing === -1 ? -FACING_YAW : options.facing === 1 ? FACING_YAW : 0;
  }
  function vector(value) { return Array.isArray(value) && value.length === 3 && value.every(finite); }
  function customBounds(value) {
    return value && vector(value.min) && vector(value.max) && value.min.every((n, i) => n < value.max[i]) ? { min: value.min.slice(), max: value.max.slice() } : null;
  }
  function modelFor(look, yaw) {
    // 肤色与服装数据是当前正式元数据；更新同ID颜色也会使旧缓存失效。
    const palette = [G.data?.avatarSkins?.find(row => row.id === look.skin)?.color,
      ...[look.top, look.bottom, look.dress, look.shoes, ...look.acc].map(id => {
        const item = G.data?.outfitById?.[id]; return item && [item.id, item.color, item.accent, item.shape, item.pattern];
      })];
    const key = JSON.stringify([look, yaw, palette]);
    if (models.has(key)) return remember(models, key, models.get(key), MODEL_LIMIT);
    const geometry = new G.world3dMath.Geometry();
    G.world3dModels.character(geometry, look, [0, 0, 0], 1);
    const data = geometry.data, c = Math.cos(yaw), s = Math.sin(yaw);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    // 先完成所有嵌套发束/四肢/衣服/配件，再旋转整个网格和法线，避免局部transform覆盖。
    for (let i = 0; i < data.length; i += 9) {
      const x = data[i], z = data[i + 2], nx = data[i + 3], nz = data[i + 5];
      data[i] = c * x + s * z; data[i + 2] = -s * x + c * z;
      data[i + 3] = c * nx + s * nz; data[i + 5] = -s * nx + c * nz;
      for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], data[i + k]); max[k] = Math.max(max[k], data[i + k]); }
    }
    if (!data.length || !min.every(finite) || !max.every(finite)) throw new Error('avatar-geometry-unavailable');
    const bounds = { min, max }, focus = min.map((v, i) => (v + max[i]) / 2);
    return remember(models, key, { key, vertices: new Float32Array(data), bounds, focus }, MODEL_LIMIT);
  }
  function dimensions(canvas) {
    const rect = canvas.getBoundingClientRect?.();
    const width = clamp(Number(rect?.width || canvas.clientWidth) || 100, 1, 1024);
    const height = clamp(Number(rect?.height || canvas.clientHeight) || 130, 1, 1024);
    const ratio = Math.min(1.5, Math.max(.1, Number(window.devicePixelRatio) || 1), Math.sqrt(FRAME_PIXEL_LIMIT / (width * height)));
    return { width, height, ratio, pixelsWidth: Math.max(1, Math.round(width * ratio)), pixelsHeight: Math.max(1, Math.round(height * ratio)) };
  }
  function repaintRemembered() {
    if (recovering || (typeof document !== 'undefined' && document.hidden)) return;
    recovering = true;
    try {
      for (const [target, request] of Array.from(targets)) {
        if (target.isConnected === false) { targets.delete(target); continue; }
        draw(target, request.look, request.options);
      }
    } finally { recovering = false; }
  }
  function onWorldChange() {
    reason = world?.ready ? '' : world?.reason || 'webgl-unavailable';
    clearImages();
    if (world?.ready) repaintRemembered();
  }
  function onVisibility() { if (!document.hidden) repaintRemembered(); }
  function listen() {
    if (!listening && typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', onVisibility); listening = true;
    }
  }
  function ensureWorld() {
    if (world) return world.ready;
    if (!G.World3D || !G.world3dModels?.character || !G.world3dMath?.Geometry) { reason = 'avatar-3d-dependencies-missing'; return false; }
    contextsCreated++; world = new G.World3D(onWorldChange);
    reason = world.ready ? '' : world.reason || 'webgl-unavailable';
    return world.ready;
  }
  function cacheImage(key, target, size) {
    const canvas = document.createElement('canvas'); canvas.width = size.pixelsWidth; canvas.height = size.pixelsHeight;
    const context = canvas.getContext('2d'); if (!context) { canvas.width = canvas.height = 1; return; }
    context.drawImage(target, 0, 0);
    const pixels = canvas.width * canvas.height;
    images.set(key, { canvas, pixels }); imagePixels += pixels;
    while (images.size > IMAGE_LIMIT || imagePixels > IMAGE_PIXEL_LIMIT) {
      const first = images.keys().next().value, entry = images.get(first); imagePixels -= entry.pixels; images.delete(first); entry.canvas.width = entry.canvas.height = 1;
    }
  }
  function mark(canvas, yaw) {
    if (canvas.dataset) { canvas.dataset.avatarRenderer = 'webgl'; canvas.dataset.avatarYaw = String(yaw); }
  }
  function draw(canvas, look, options) {
    if (!canvas || typeof canvas.getContext !== 'function') { reason = 'avatar-canvas-unavailable'; return false; }
    options = options || {};
    const copy = lookCopy(look), settings = { yaw: yawFor(options), still: options.still !== false };
    const bounds = customBounds(options.bounds), focus = vector(options.focus) ? options.focus.slice() : null;
    if (bounds) settings.bounds = bounds; if (focus) settings.focus = focus;
    remember(targets, canvas, { look: copy, options: settings }, TARGET_LIMIT); listen();
    // UI可以在后台更新形象；真正GPU绘制等恢复可见后一次性补齐，不启动动画循环。
    if (typeof document !== 'undefined' && document.hidden) { reason = 'background-deferred'; return false; }
    const context = canvas.getContext('2d'); if (!context) { reason = 'avatar-2d-composite-unavailable'; return false; }
    try {
      if (!ensureWorld()) return false;
      const model = modelFor(copy, settings.yaw), size = dimensions(canvas), stageBounds = bounds || model.bounds, stageFocus = focus || model.focus;
      const imageKey = JSON.stringify([model.key, size.pixelsWidth, size.pixelsHeight, size.width, size.height, stageBounds, stageFocus]);
      if (canvas.width !== size.pixelsWidth || canvas.height !== size.pixelsHeight) { canvas.width = size.pixelsWidth; canvas.height = size.pixelsHeight; }
      context.setTransform(1, 0, 0, 1, 0, 0); context.clearRect(0, 0, canvas.width, canvas.height);
      if (images.has(imageKey)) {
        const cached = images.get(imageKey); remember(images, imageKey, cached, IMAGE_LIMIT); context.drawImage(cached.canvas, 0, 0); mark(canvas, settings.yaw); reason = ''; return true;
      }
      const stage = { id: 'avatar-preview', key: model.key, bounds: stageBounds, focus: stageFocus,
        build(geometry) { geometry.data = model.vertices; } };
      const view = world.getStageView(stage); view.angle = 0; view.elevation = .09; view.zoom = 1; view.panX = view.panY = 0;
      const env = { stage, state: previewState, width: size.width, height: size.height, dpr: size.ratio, offsetX: 0, offsetY: 0,
        camera: { x: 0, y: 0, scale: 1 }, view: { floor: 'all', view: 'cutaway', previewFourFloors: false }, rooms: [], peers: [], neighbors: [], selected: null,
        reducedMotion: true, hidePlayer: true, night: false, preview: null };
      context.setTransform(size.ratio, 0, 0, size.ratio, 0, 0);
      const rendered = world.render(context, env, { photo: true }); context.setTransform(1, 0, 0, 1, 0, 0);
      if (!rendered) { reason = world.reason || 'avatar-render-unavailable'; return false; }
      renders++; reason = ''; mark(canvas, settings.yaw); try { cacheImage(imageKey, canvas, size); } catch (_) {} return true;
    } catch (_) {
      reason = 'avatar-render-failed'; return false;
    }
  }
  function destroy() {
    if (listening) document.removeEventListener?.('visibilitychange', onVisibility); listening = false;
    world?.destroy(); world = null; clearImages(); models.clear(); targets.clear(); reason = 'destroyed';
  }
  function status() {
    return { ready: !!world?.ready, renderer: world?.ready ? 'webgl' : 'unavailable', reason,
      contextsCreated, activeContexts: world?.gl ? 1 : 0, renders, modelCacheEntries: models.size,
      imageCacheEntries: images.size, imageCachePixels: imagePixels, rememberedTargets: targets.size, static: true };
  }
  G.avatar3D = { draw, destroy, status };
})(window.Game = window.Game || {});
