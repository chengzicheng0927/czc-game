/* 收好真实作物的小瞬间：只读收获事件与库存，不在动画里发奖或保存。 */
(function (G) {
  'use strict';
  const ui = G.ui = G.ui || {};
  const maxFlights = 4, flightMs = 820;
  let initialized = false, layer = null, floating = null, live = null, latest = null;
  let frame = null, pending = [], flights = [], hideTimer = null, floatingLayout = null, generation = 0, seen = new WeakSet();
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
  const cropDef = id => G.data && G.data.cropById && Object.prototype.hasOwnProperty.call(G.data.cropById, id) ? G.data.cropById[id] : null;
  const reduced = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const modalOpen = () => !!document.querySelector('.modal-backdrop');
  const panel = () => { const node = document.getElementById('panel'); return node && !node.hidden && !node.classList.contains('hidden') ? node : null; };
  function rect(node) {
    if (!node || !node.isConnected || typeof node.getBoundingClientRect !== 'function') return null;
    // aria-hidden 的作物画布仍然可见，只是不向读屏重复朗读。
    for (let parent = node; parent; parent = parent.parentElement) if (parent.hidden || parent.classList.contains('hidden')) return null;
    if (typeof window.getComputedStyle === 'function') { const style = window.getComputedStyle(node); if (style.display === 'none' || style.visibility === 'hidden') return null; }
    const box = node.getBoundingClientRect(), width = Number(box.width), height = Number(box.height);
    if (!(width > 0 && height > 0)) return null;
    return { left: box.left, top: box.top, right: box.left + width, bottom: box.top + height, width, height };
  }
  function visibleRect(node, clip) {
    const box = rect(node); if (!box) return null;
    const bounds = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    if (clip) { const clipBox = rect(clip); if (!clipBox) return null; bounds.left = Math.max(bounds.left, clipBox.left); bounds.top = Math.max(bounds.top, clipBox.top); bounds.right = Math.min(bounds.right, clipBox.right); bounds.bottom = Math.min(bounds.bottom, clipBox.bottom); }
    const left = Math.max(box.left, bounds.left), top = Math.max(box.top, bounds.top), right = Math.min(box.right, bounds.right), bottom = Math.min(box.bottom, bounds.bottom);
    return right - left >= Math.min(24, box.width) && bottom - top >= Math.min(24, box.height) ? { x: (left + right) / 2, y: (top + bottom) / 2, left, top, right, bottom } : null;
  }
  function total() {
    const harvest = G.state && G.state.garden && G.state.garden.harvest || {};
    return Object.keys(harvest).reduce((sum, id) => sum + (cropDef(id) && Number.isSafeInteger(harvest[id]) && harvest[id] > 0 ? harvest[id] : 0), 0);
  }
  function drawCrop(canvas, id) {
    const context = canvas.getContext('2d'); if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (id && ui.garden && typeof ui.garden.drawCrop === 'function') ui.garden.drawCrop(context, id, 3, 32, 55, 61);
  }
  function updateEntry(node) {
    const count = total(), crop = latest && cropDef(latest.crop), art = node.querySelector('canvas');
    node.querySelector('.harvest-basket-total').textContent = '篮子里 · ' + count + ' 份';
    node.querySelector('.harvest-basket-receipt').textContent = crop ? '刚收好 ' + crop.name + ' ×' + latest.count : '成熟后，把小惊喜收在这里';
    node.classList.toggle('has-harvest', !!crop);
    node.setAttribute('aria-label', '打开收获篮，篮子里共 ' + count + ' 份' + (crop ? '。刚收好 ' + crop.name + ' ×' + latest.count : ''));
    if (art.dataset.crop !== (crop && crop.id || '')) { art.dataset.crop = crop && crop.id || ''; drawCrop(art, art.dataset.crop); }
  }
  function entries() { return Array.from(document.querySelectorAll('.harvest-basket-entry')); }
  function refresh() { entries().forEach(updateEntry); }
  function openBasket() { if (ui.garden && typeof ui.garden.openBasket === 'function') ui.garden.openBasket(); else G.bus.emit('garden:open_basket', {}); }
  function entry() {
    const node = el('button', 'harvest-basket-entry'); node.type = 'button'; node.addEventListener('click', openBasket);
    const art = el('span', 'harvest-basket-art'), canvas = el('canvas', 'harvest-basket-crop'); canvas.width = 64; canvas.height = 64; canvas.setAttribute('aria-hidden', 'true'); art.setAttribute('aria-hidden', 'true'); art.append(canvas);
    const copy = el('span', 'harvest-basket-copy'), heading = el('span', 'harvest-basket-heading'); heading.append(el('strong', '', '收获篮'), el('span', 'harvest-basket-total'));
    copy.append(heading, el('span', 'harvest-basket-receipt')); node.append(art, copy, el('span', 'harvest-basket-arrow', '›')); updateEntry(node); return node;
  }
  function removeFlight(item) {
    const index = flights.indexOf(item); if (index < 0) return;
    clearTimeout(item.timer); item.node.remove(); flights.splice(index, 1);
  }
  function clearFlights() { flights.slice().forEach(removeFlight); }
  function hideFloating() { if (hideTimer !== null) clearTimeout(hideTimer); hideTimer = null; floatingLayout = null; if (floating) floating.hidden = true; }
  function clear() {
    generation++; if (frame !== null) cancelAnimationFrame(frame); frame = null; pending = []; clearFlights(); hideFloating();
    if (live) live.textContent = '';
  }
  function source(event) {
    const currentPanel = panel(), body = document.getElementById('panel-body');
    if (currentPanel && currentPanel.dataset.kind === 'garden') {
      const plot = document.querySelector('[data-garden-plot="' + event.index + '"]');
      if (plot) { const point = visibleRect(plot.querySelector('.garden-plot-action'), body) || visibleRect(plot.querySelector('.garden-plot-visual'), body); if (point) return Object.assign({ kind: 'plot' }, point); }
    }
    const point = event.origin || G.render && typeof G.render.harvestOrigin === 'function' && G.render.harvestOrigin(event.index);
    const world = rect(document.getElementById('scene')) || rect(document.getElementById('world'));
    if (!point || !world || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < world.left || point.x > world.right || point.y < world.top || point.y > world.bottom || point.x < 0 || point.x > window.innerWidth || point.y < 0 || point.y > window.innerHeight) return null;
    const cover = rect(currentPanel); if (cover && point.x >= cover.left && point.x <= cover.right && point.y >= cover.top && point.y <= cover.bottom) return null;
    return { x: point.x, y: point.y, kind: 'scene' };
  }
  function inlineTarget() {
    const body = document.getElementById('panel-body');
    for (const node of entries()) {
      if (floating && floating.contains(node)) continue;
      const point = visibleRect(node.querySelector('.harvest-basket-art'), body); if (point) return Object.assign({ kind: 'panel' }, point);
    }
    return null;
  }
  function floatingTarget() { const point = floating && !floating.hidden && visibleRect(floating.querySelector('.harvest-basket-art')); return point ? Object.assign({ kind: 'floating' }, point) : null; }
  function currentTarget() { return inlineTarget() || floatingTarget(); }
  function layoutSnapshot() {
    const active = panel(); return { kind: active ? active.dataset.kind || '' : null, panel: rect(active), world: rect(document.getElementById('world')), width: window.innerWidth, height: window.innerHeight };
  }
  function sameBox(a, b) { return !a || !b ? a === b : ['left', 'top', 'width', 'height'].every(key => Math.abs(a[key] - b[key]) <= 1); }
  function sameLayout(a, b) { return a.kind === b.kind && a.width === b.width && a.height === b.height && sameBox(a.panel, b.panel) && sameBox(a.world, b.world); }
  function samePoint(a, b) { return !!a && !!b && a.kind === b.kind && Math.abs(a.x - b.x) <= 2 && Math.abs(a.y - b.y) <= 2; }
  function target() {
    const inline = inlineTarget(); if (inline) { hideFloating(); return inline; }
    // 场景边的小篮子始终落在真实可见区域；空间不足时保留正文，不向屏外飞。
    const world = rect(document.getElementById('world')); if (!world) return null;
    const cover = rect(panel()), width = Math.min(232, world.width - 24), height = 72;
    const left = Math.max(12, world.left + 12), top = Math.max(12, world.top + (window.innerWidth <= 620 ? 112 : 82));
    const bottom = Math.min(world.bottom, cover ? cover.top - 8 : window.innerHeight - 12);
    if (width < 180 || top + height > bottom || left + width > window.innerWidth - 8) { hideFloating(); return null; }
    floating.style.left = left + 'px'; floating.style.top = top + 'px'; floating.style.width = width + 'px'; floating.hidden = false;
    floatingLayout = layoutSnapshot();
    if (hideTimer !== null) clearTimeout(hideTimer); hideTimer = setTimeout(hideFloating, 2400);
    return floatingTarget();
  }
  function fly(event, from, to) {
    if (!from || !to || reduced()) return;
    while (flights.length >= maxFlights) removeFlight(flights[0]);
    const node = el('canvas', 'harvest-flight'); node.width = 64; node.height = 64; node.setAttribute('aria-hidden', 'true'); drawCrop(node, event.crop);
    const set = (name, value) => node.style.setProperty(name, value + 'px');
    set('--harvest-from-x', from.x - 32); set('--harvest-from-y', from.y - 32); set('--harvest-mid-x', (from.x + to.x) / 2 - 32); set('--harvest-mid-y', Math.max(8, Math.min(from.y, to.y) - 76)); set('--harvest-to-x', to.x - 32); set('--harvest-to-y', to.y - 32);
    layer.append(node); const item = { node, timer: null, event, from, to, layout: layoutSnapshot() }; flights.push(item);
    node.addEventListener('animationend', () => removeFlight(item)); item.timer = setTimeout(() => removeFlight(item), flightMs + 180);
  }
  function receive(event) {
    if (!event || typeof event !== 'object' || event.ok === false || !Number.isSafeInteger(event.index) || event.index < 0 || typeof event.crop !== 'string' || !cropDef(event.crop) || !Number.isSafeInteger(event.count) || event.count < 1 || event.count > 9999 || document.hidden || modalOpen() || seen.has(event)) return;
    seen.add(event); latest = { crop: event.crop, count: event.count }; refresh();
    pending.push({ index: event.index, crop: event.crop, count: event.count, origin: event.origin }); if (pending.length > maxFlights) pending.shift();
    const token = generation;
    // 收获规则同步广播后，原按钮会被刷新；等这次刷新结束再量一次最终位置。
    Promise.resolve().then(() => {
      if (token !== generation || frame !== null || !pending.length || document.hidden) return;
      frame = requestAnimationFrame(() => {
        frame = null; const batch = pending.splice(0); if (token !== generation || document.hidden || modalOpen()) return;
        refresh(); const to = target(); batch.forEach(value => fly(value, source(value), to));
        const counts = new Map(); batch.forEach(value => counts.set(value.crop, (counts.get(value.crop) || 0) + value.count));
        live.textContent = '已收好：' + Array.from(counts, pair => cropDef(pair[0]).name + ' ×' + pair[1]).join('、') + '。可以打开收获篮查看。';
      });
    });
  }
  function layoutChanged() {
    // 普通状态刷新也广播 panel:change；只在真实布局或锚点改变时结束这次装饰。
    const layout = layoutSnapshot(), to = currentTarget();
    flights.slice().forEach(item => { if (!sameLayout(item.layout, layout) || !samePoint(item.from, source(item.event)) || !samePoint(item.to, to)) removeFlight(item); });
    if (floatingLayout && !sameLayout(floatingLayout, layout)) hideFloating();
  }
  function displaced() { clearFlights(); hideFloating(); }
  function init() {
    if (initialized) return; initialized = true;
    layer = el('div', 'harvest-feedback-layer'); layer.setAttribute('aria-hidden', 'true');
    floating = el('aside', 'harvest-basket-float'); floating.hidden = true; floating.setAttribute('aria-label', '刚收好的作物'); floating.append(entry());
    live = el('p', 'harvest-feedback-live'); live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite'); live.setAttribute('aria-atomic', 'true');
    document.body.append(layer, floating, live);
    G.bus.on('garden:harvested', receive); G.bus.on('state:change', refresh); G.bus.on('panel:change', layoutChanged);
    G.bus.on('state:replace', () => { clear(); latest = null; seen = new WeakSet(); refresh(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });
    document.addEventListener('scroll', displaced, true);
    document.addEventListener('wheel', clearFlights, { passive: true, capture: true });
    document.addEventListener('pointerdown', event => {
      for (let node = event.target; node; node = node.parentElement) if (node === document.getElementById('scene') || node.classList?.contains('camera-controls')) { clearFlights(); break; }
    }, true);
    window.addEventListener('resize', clear); window.addEventListener('pagehide', clear);
    if (typeof window.matchMedia === 'function') window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', clearFlights);
  }
  ui.harvestFeedback = { init, entry, clear, openBasket };
})(window.Game);
