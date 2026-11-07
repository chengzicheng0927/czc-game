/* 原生 DOM 面板：用户文字始终通过 textContent 写入。 */
(function () {
  'use strict';
  const G = window.Game;
  const ui = G.ui = G.ui || {};
  const view = { panel: null, options: {}, category: 'all', theme: 'all', search: '', decorSearch: '', decorTab: 'items', decorTheme: 'all', decorCategory: 'all', decorRoomSwitchOpen: false, decorMoreOpen: false, decorShopReturn: null, shopTab: 'all', shopPage: 0, decorPage: 0, returnFocus: null, modal: null, tutorialBusy: false, speech: null, saveRestoreWarning: '', archiveEpoch: 0, placementSerial: 0, dragPreparing: false };
  ui.view = view;
  const $ = id => document.getElementById(id);
  const S = () => G.state;
  const data = () => G.data;
  const rooms = () => G.contentSpaces.entries(S());
  const decorRoom = id => G.contentSpaces.get(id, S());
  const decorRooms = rooms;
  const isAttic = id => ['legacy_attic', 'observatory_floor'].includes(decorRoom(id)?.floorId);
  const roomDef = id => data().rooms.find(r => r.id === id);
  const furnDef = id => data().furnitureById[id];
  const num = value => Number(value || 0).toLocaleString('zh-CN');
  const catNames = { all: '全部', bedroom: '卧室', living: '客厅', kitchen: '餐厨', bathroom: '浴室', entertainment: '娱乐', wall: '墙面', small: '小物', decor: '装饰', plant: '植物', yard: '庭院', special: '特别' };
  const patterns = [{ id: 'solid', name: '纯色' }, { id: 'dots', name: '圆点' }, { id: 'stripes', name: '条纹' }];
  const floors = [{ id: 'wood', name: '木地板' }, { id: 'tile', name: '瓷砖' }];
  const colors = ['#FFD6E0', '#FFE9B4', '#BDECD6', '#BFE3FF', '#D9C8FF', '#FFD3B0', '#FFF8FB', '#E8C39E'];

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function append(parent, ...children) { children.flat().filter(Boolean).forEach(child => parent.append(child)); return parent; }
  function button(text, fn, cls = 'ui-button', dismiss = false) {
    const node = el('button', cls, text); node.type = 'button';
    const epoch = view.archiveEpoch;
    if (fn) node.addEventListener('click', event => { if (dismiss || epoch === view.archiveEpoch) return fn(event); });
    return node;
  }
  function paragraph(text, cls = 'ui-muted') { return el('p', cls, text); }
  function field(labelText, control) {
    return ui.controls.label(control, labelText);
  }
  function input(type, value, key) {
    if (type === 'color') return ui.controls.color(value, key);
    const node = el('input', type === 'checkbox' ? 'cute-checkbox' : 'ui-input'); node.type = type;
    if (type === 'range') { node.min = '0'; node.max = '1'; node.step = '0.01'; }
    node.value = value || ''; if (key) node.dataset.uiFocus = key;
    if (type === 'range') ui.controls.enhanceRange(node);
    return node;
  }
  function select(options, value, onChange) {
    const epoch = view.archiveEpoch;
    return ui.controls.select(options, value, onChange ? value => { if (epoch === view.archiveEpoch) onChange(value); } : undefined);
  }
  function notice(text) { return el('div', 'ui-notice', text); }
  function card(title, text) { return append(el('article', 'ui-card'), el('h3', 'ui-card-head', title), text ? paragraph(text) : null); }
  function doAction(result, fallback) {
    if (!result) return false;
    ui.toast(result.message || (result.ok ? fallback : '暂时还不能这样做哦。'));
    if (result.ok) { ui.audio.play('success'); ui.refresh(); }
    else ui.audio.play('soft');
    return !!result.ok;
  }
  function activeRoom() {
    const id = G.runtime.activeRoomId;
    if (id && decorRoom(id)) return id;
    const first = rooms()[0]; if (first) { G.runtime.activeRoomId = first[0]; return first[0]; }
    return null;
  }
  function activeDecorRoom() {
    const id = G.runtime.activeRoomId;
    if (id && decorRoom(id)) return id;
    const first = decorRooms()[0]; if (first) { G.runtime.activeRoomId = first[0]; return first[0]; }
    return null;
  }
  function focusDecorRoom(id) {
    const room = decorRoom(id); if (!room) return;
    updateHouseView({ floor: room.floorId, view: 'cutaway' }); G.render.camera?.focusRoom?.(id);
  }
  function cancelPlacement() {
    view.placementSerial++;
    if (typeof G.buildingEditor?.cancelPlacement === 'function') G.buildingEditor.cancelPlacement();
    else if (typeof G.render.cancelPlacement === 'function') G.render.cancelPlacement();
    else { G.runtime.placing = null; G.runtime.mode = 'explore'; G.render.redraw?.(); }
    ui.selection(); updateHint();
  }
  function beginRoomPlacement(def, roomId, keepPanel) {
    const epoch = view.archiveEpoch;
    if (roomId && !decorRoom(roomId)) { ui.toast('这个空间的墙已经变动啦，请重新选择。'); return false; }
    const result = typeof G.buildingEditor?.beginPlacement === 'function' ? G.buildingEditor.beginPlacement(def.id, roomId || null) : { ok: false, message: '摆放还没有准备好，请稍后再试。' };
    if (!result?.ok) { ui.toast(result?.message || '这次没有开始摆放，请重新选择家具。'); ui.selection(); updateHint(); return false; }
    const serial = ++view.placementSerial;
    ui.selection();
    if (!keepPanel) ui.panel.close({ keepPlacing: true });
    if (!keepPanel && window.matchMedia?.('(max-width: 600px)').matches) requestAnimationFrame(() => {
      if (!window.matchMedia?.('(max-width: 600px)').matches || epoch !== view.archiveEpoch || serial !== view.placementSerial || G.runtime.placing !== def.id || view.dragPreparing || !$('panel').classList.contains('hidden')) return;
      const world = $('world');
      if (world && typeof window.scrollTo === 'function') window.scrollTo({ top: Math.max(0, world.getBoundingClientRect().top + (window.scrollY || window.pageYOffset || 0)), behavior: 'auto' });
      $('selection-tools').querySelector('[data-ui-focus="placement-cancel"]')?.focus({ preventScroll: true });
    });
    updateHint(); return true;
  }
  function roomName(id) {
    const room = decorRoom(id); if (!room) return id ? '原来的空间' : '小屋地块';
    const floor = S().building.floors.find(value => value.id === room.floorId);
    return ((roomDef(room.type) || {}).name || '自由空间') + '（' + (floor?.name || '小屋') + ' · ' + Math.round(room.area * 10) / 10 + '㎡）';
  }
  function roomPicker(container, callback) {
    if (!rooms().length) { container.append(notice('先用墙围出一处空间，再来慢慢装饰吧。')); return null; }
    const id = activeRoom();
    const picker = select(rooms().map(([rid]) => ({ id: rid, name: roomName(rid) })), id, rid => {
      G.runtime.activeRoomId = rid;
      if (G.render.camera) G.render.camera.focusRoom(rid);
      if (callback) callback(rid); else renderCurrent();
    });
    append(container, field('正在照顾的房间', picker)); return id;
  }
  function speak(text, source) {
    const key = source && source.dataset.speechKey ? source.dataset.speechKey : String(text);
    const result = G.audio.speak(text, { manual: true, key });
    if (result && !result.ok) ui.toast(result.message);
    return result;
  }
  function listenButton(text, label = '🔊 听一听') {
    const key = 'dialogue-' + String(text), node = button(label, () => speak(text, node));
    node.dataset.speechKey = key; node.dataset.listenLabel = label;
    node.setAttribute('aria-label', '听一听这段台词'); syncSpeechButton(node); return node;
  }
  function syncSpeechButton(node) {
    const playing = view.speech && view.speech.speaking && node.dataset.speechKey === view.speech.key;
    const label = node.dataset.listenLabel || '', icon = label.startsWith('🔊') && ui.visualShell?.icon?.(playing ? 'stop' : 'volume');
    if (icon) {
      node.replaceChildren(icon);
      if (label !== '🔊') node.append(el('span', '', playing ? '停止朗读' : label.replace(/^🔊\s*/, '')));
    } else node.textContent = playing ? (label === '🔊' ? '■' : '■ 停止朗读') : label;
    node.setAttribute('aria-pressed', String(!!playing));
  }
  ui.syncSpeechButton = syncSpeechButton;
  ui.speak = speak;
  ui.toast = function (text) {
    if (!text) return;
    const node = el('div', 'toast', text); node.setAttribute('role', 'status');
    const root = $('toast-root');
    while (root.children.length >= 3) root.firstElementChild.remove();
    root.append(node);
    setTimeout(() => node.remove(), 4000);
  };

  function focusable(root) { return [...root.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')].filter(n => n.getClientRects().length); }
  ui.modal = function (options) {
    if (view.modal) view.modal.close();
    const previous = document.activeElement;
    const overlay = el('div', 'modal-backdrop');
    const dialog = el('section', 'modal-card'); dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.tabIndex = -1;
    const title = el('h2', '', options.title || '糯米想告诉你'); title.id = 'dialog-title'; dialog.setAttribute('aria-labelledby', title.id);
    const closeButton = button('✕', () => handle.close(), 'ui-button ui-button-icon', true); closeButton.setAttribute('aria-label', '关闭对话框');
    // 只朗读明确提供的正文，绝不拼接按钮、表单、图标和整张菜单。
    const speechText = typeof options.speechText === 'string' ? options.speechText : (typeof options.content === 'string' ? options.content : '');
    const speechButton = speechText ? listenButton(speechText, '🔊') : null;
    if (speechButton) { speechButton.className = 'ui-button ui-button-icon'; speechButton.setAttribute('aria-label', '朗读这段说明'); }
    const head = append(el('div', 'modal-head'), title, speechButton, closeButton);
    const body = el('div', 'modal-body');
    if (typeof options.content === 'string') body.append(paragraph(options.content)); else if (options.content) body.append(options.content);
    append(dialog, head, body); overlay.append(dialog); $('modal-root').append(overlay);
    let closed = false;
    const keyHandler = e => {
      // 调色盘与下拉菜单先处理自己的键盘操作，Escape只收起最上层。
      if (ui.controls.isOpen()) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); handle.close(); }
      if (e.key === 'Tab') {
        const nodes = focusable(dialog), first = nodes[0], last = nodes[nodes.length - 1];
        if (!first) { e.preventDefault(); dialog.focus(); }
        else if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    const handle = {
      element: dialog, body,
      close() {
        if (closed) return; closed = true; G.audio.stopSpeech(); overlay.remove(); document.removeEventListener('keydown', keyHandler, true);
        if (view.modal === handle) view.modal = null;
        if (options.onClose) options.onClose();
        if (previous && previous.isConnected) previous.focus();
        G.bus.emit('modal:closed', {});
      }
    };
    view.modal = handle;
    overlay.addEventListener('click', e => { if (e.target === overlay && !options.lockBackdrop) handle.close(); });
    document.addEventListener('keydown', keyHandler, true);
    requestAnimationFrame(() => { const target = body.querySelector('[autofocus]') || focusable(body)[0] || closeButton; target.focus(); });
    return handle;
  };
  ui.confirm = function (text, options = {}) {
    return new Promise(resolve => {
      let answered = false, modal;
      const finish = answer => { if (answered) return; answered = true; modal.close(); resolve(answer); };
      const content = append(el('div', 'ui-stack'), paragraph(text), append(el('div', 'modal-actions'),
        button(options.cancel || '再想想', () => finish(false), 'ui-button', true),
        button(options.accept || '确定', () => finish(true), 'ui-button ' + (options.danger ? 'ui-button-danger' : 'ui-button-primary'))));
      modal = ui.modal({ title: options.title || '确认一下', content, onClose() { if (!answered) { answered = true; resolve(false); } } });
    });
  };
  ui.panel = {
    open(options) {
      const panel = $('panel');
      const app = $('app');
      if (app) app.classList.remove('home-paper-open');
      if (panel.classList.contains('hidden')) view.returnFocus = document.activeElement;
      panel.classList.remove('hidden');
      panel.setAttribute('aria-hidden', 'false');
      $('panel-title').textContent = options.title || '';
      $('panel-subtitle').textContent = options.subtitle || '';
      $('panel-body').replaceChildren(options.content || el('div'));
      panel.dataset.kind = view.panel || '';
      if (ui.visualShell) ui.visualShell.sync(view.panel);
      else requestAnimationFrame(() => G.bus.emit('panel:change', { open: true, height: panel.getBoundingClientRect().height }));
    },
    close(options) {
      if ($('panel').classList.contains('hidden')) { if (!options?.keepPlacing && G.runtime.placing) cancelPlacement(); return; }
      if (view.panel === 'cloudAccount' && ui.cloudAccount) ui.cloudAccount.close();
      if (view.panel === 'neighbors' && ui.neighbors) ui.neighbors.close();
      if (view.panel === 'houseBlueprints' && ui.houseBlueprints) ui.houseBlueprints.close();
      G.audio.stopSpeech();
      const closedKind = view.panel;
      $('panel').classList.add('hidden'); $('panel').setAttribute('aria-hidden', 'true'); view.panel = null;
      G.runtime.mode = options && options.keepPlacing ? 'decorate' : 'explore';
      if (!options?.keepPlacing && G.runtime.placing) cancelPlacement();
      // 建造/装饰期间可能把视角缩到某一层；退出时恢复整屋，否则关掉面板后仍卡在那一层。摆放中(keepPlacing)要留着支撑平面，不恢复。
      if (!options?.keepPlacing && ['build', 'decor', 'yard', 'roomLayout'].includes(closedKind) && houseViewState().floor !== 'all') updateHouseView({ floor: 'all' });
      if (typeof ui.controls?.close === 'function') ui.controls.close(false);
      if (ui.visualShell) ui.visualShell.sync(null);
      else G.bus.emit('panel:change', { open: false, height: 0 });
      if (view.returnFocus && view.returnFocus.isConnected) view.returnFocus.focus();
      updateHint();
    }
  };

  function thumbnails() {
    requestAnimationFrame(() => {
      document.querySelectorAll('canvas[data-furniture]').forEach(canvas => { if (G.render.drawThumbnail) G.render.drawThumbnail(canvas, canvas.dataset.furniture); });
      document.querySelectorAll('canvas[data-resident]').forEach(canvas => { if (G.render.drawCharacter) G.render.drawCharacter(canvas, canvas.dataset.resident); });
    });
  }
  function thumb(id) { const canvas = el('canvas', 'item-thumb'); canvas.width = 144; canvas.height = 112; canvas.dataset.furniture = id; canvas.setAttribute('aria-hidden', 'true'); return canvas; }
  function residentThumb(id) { const canvas = el('canvas', 'resident-thumb'); canvas.width = 120; canvas.height = 120; canvas.dataset.resident = id; canvas.setAttribute('aria-hidden', 'true'); return canvas; }
  function tabs(options, value, fn) {
    const row = el('div', 'ui-tabs'); row.setAttribute('role', 'group');
    options.forEach(o => { const b = button(o.name, () => fn(o.id), 'ui-tab' + (o.id === value ? ' is-active' : '')); b.setAttribute('aria-pressed', String(o.id === value)); row.append(b); }); return row;
  }
  function categories(defs, callback, value) {
    const ids = ['all', ...new Set(defs.map(d => d.category))];
    const selected = ids.includes(value === undefined ? view.category : value) ? (value === undefined ? view.category : value) : 'all';
    if (value === undefined) view.category = selected;
    return tabs(ids.map(id => ({ id, name: catNames[id] || id })), selected, callback);
  }
  function inventoryCount() { return Object.values(S().inventory).reduce((sum, n) => sum + Number(n || 0), 0); }

  function houseViewState() {
    if (G.render && typeof G.render.getHouseView === 'function') return G.render.getHouseView();
    const hv = G.runtime && G.runtime.houseView;
    return { floor: hv?.floor || 'all', view: hv?.view || 'cutaway', previewFourFloors: !!hv?.previewFourFloors };
  }
  function updateHouseView(patch) {
    if (G.render && typeof G.render.setHouseView === 'function') G.render.setHouseView(patch);
    else if (G.runtime) G.runtime.houseView = Object.assign(houseViewState(), patch || {});
    syncWorldHouseNav();
    if (view.panel === 'build' || view.panel === 'decor') renderCurrent();
  }
  function houseNavigation(extraClass = '') {
    const hv = houseViewState(), definitions = S().building.floors;
    const nav = el('section', 'house-navigation' + (extraClass ? ' ' + extraClass : ''));
    nav.setAttribute('aria-label', '小屋楼层与视角');
    if (extraClass === 'house-nav-world') nav.append(el('h3', 'house-nav-title', '小屋楼层与视角'));
    const summary = el('div', 'house-summary');
    summary.append(el('strong', '', definitions.length + ' 层 · 自由画墙'), el('span', '', '每一处空间，都由自己的墙围起来'));
    const floorTabs = el('div', 'house-floor-tabs'); floorTabs.setAttribute('role', 'group'); floorTabs.setAttribute('aria-label', '选择楼层');
    [{ id: 'all', name: '整屋' }].concat(definitions).forEach(floor => {
      const active = hv.floor === floor.id, control = button(floor.name, () => updateHouseView({ floor: floor.id }), 'ui-button ui-button-soft' + (active ? ' is-active' : ''));
      control.dataset.floorFocus = floor.id; control.setAttribute('aria-pressed', String(active)); floorTabs.append(control);
    });
    const viewTabs = el('div', 'house-view-tabs'); viewTabs.setAttribute('role', 'group'); viewTabs.setAttribute('aria-label', '小屋视角');
    [{ id: 'cutaway', label: '全屋剖面' }, { id: 'exterior', label: '小屋外观' }].forEach(item => {
      const control = button(item.label, () => updateHouseView({ view: item.id }), 'ui-button ui-button-soft' + (hv.view === item.id ? ' is-active' : ''));
      control.dataset.houseView = item.id; control.setAttribute('aria-pressed', String(hv.view === item.id)); viewTabs.append(control);
    });
    const expand = button('给小屋再添一层', () => ui.open('build', { tool: 'floor' }), 'ui-button ui-button-soft house-expansion');
    append(nav, summary, floorTabs, viewTabs, expand); return nav;
  }
  ui.houseNavigation = houseNavigation;
  let worldHouseNav = null;
  function syncWorldHouseNav() {
    if (!worldHouseNav || !worldHouseNav.parentElement) return;
    const focused = document.activeElement, inNav = focused && worldHouseNav.contains(focused);
    const focusSelector = !inNav ? null : focused.dataset.floorFocus ? '[data-floor-focus="' + focused.dataset.floorFocus + '"]' : focused.dataset.houseView ? '[data-house-view="' + focused.dataset.houseView + '"]' : '.house-expansion';
    const scrollLeft = worldHouseNav.querySelector('.house-floor-tabs')?.scrollLeft || 0;
    const next = houseNavigation('house-nav-world');
    worldHouseNav.replaceWith(next);
    worldHouseNav = next;
    next.querySelector('.house-floor-tabs').scrollLeft = scrollLeft;
    if (focusSelector) (next.querySelector(focusSelector) || next.querySelector('.house-expansion')).focus({ preventScroll: true });
  }
  function decorateSuiteTabs(activeId) {
    const bar = el('div', 'ui-row decorate-suite-tabs'); bar.setAttribute('role', 'navigation'); bar.setAttribute('aria-label', '建造与装饰分类');
    const items = [
      { id: 'decor', label: '🛋 家具', open: () => ui.open('decor') },
      { id: 'build', label: '🏠 房间', open: () => ui.open('build') },
      { id: 'houseDesign', label: '🎨 外观', open: () => ui.houseDesign.open('styles') },
      { id: 'yard', label: '🌿 前院', open: () => ui.open('yard') },
      { id: 'roomLayout', label: '↔ 布局', open: () => ui.open('roomLayout') }
    ];
    items.forEach(item => {
      const active = activeId === item.id;
      const b = button(item.label, item.open, 'ui-button ' + (active ? 'ui-button-primary is-active' : 'ui-button-soft'));
      b.dataset.decorateTab = item.id;
      bar.append(b);
    });
    if (ui.observatory && typeof ui.observatory.entry === 'function') bar.append(ui.observatory.entry());
    return bar;
  }

  function buildingPanel(name, options) {
    if (!G.buildingEditor || typeof G.buildingEditor.panel !== 'function') throw new Error('小屋的建造工具还没有准备好，请保留存档后重新打开。');
    return G.buildingEditor.panel(name, options || view.options);
  }
  function roomMenu(roomId) {
    if (!decorRoom(roomId)) return;
    G.runtime.activeRoomId = roomId; ui.open('decor', { roomId });
  }
  function decorRoomContext(roomId) {
    const context = el('section', 'decor-room-context'), epoch = view.archiveEpoch;
    const headerRow = el('div', 'ui-row ui-between');
    headerRow.append(el('strong', 'decor-room-name', roomId ? roomName(roomId) : '还没有可装扮的房间'));
    // 看得见的楼层被缩到某一层时给一个回到整屋的出口：装饰面板里没有楼层条，不留这个按钮用户就切不回来。
    const hv = houseViewState();
    if (hv.floor !== 'all') headerRow.append(button('整屋', () => updateHouseView({ floor: 'all' }), 'ui-button ui-button-soft ui-small'));
    context.append(headerRow);
    const change = el('details', 'decor-room-switch'); change.open = view.decorRoomSwitchOpen || !roomId;
    const summary = el('summary', '', '更换房间'); summary.dataset.uiFocus = 'decor-room-switch'; change.append(summary);
    if (decorRooms().length) {
      const picker = select(decorRooms().map(([id]) => ({ id, name: roomName(id) })), roomId, id => {
        if (!decorRoom(id)) return;
        view.decorRoomSwitchOpen = false; G.runtime.activeRoomId = id;
        ui.open('decor', { roomId: id });
        requestAnimationFrame(() => {
          if (epoch === view.archiveEpoch && view.panel === 'decor' && G.runtime.activeRoomId === id && !$('panel').classList.contains('hidden')) $('panel-body').querySelector('[data-ui-focus="decor-room-switch"]')?.focus({ preventScroll: true });
        });
      });
      picker.dataset.uiFocus = 'decor-room-picker'; change.append(field('装扮另一间房', picker));
    } else change.append(button('先建一间房', () => ui.open('build'), 'ui-button ui-button-primary'));
    change.addEventListener('toggle', () => { if (epoch === view.archiveEpoch && change.isConnected) view.decorRoomSwitchOpen = change.open; });
    context.append(change); return context;
  }
  function decorShopContext() {
    return { roomId: activeDecorRoom(), theme: view.decorTheme, category: view.decorCategory, search: view.decorSearch, tab: view.decorTab, page: view.decorPage, epoch: view.archiveEpoch };
  }
  function openDecorShop() {
    const context = decorShopContext();
    view.decorShopReturn = context;
    view.theme = context.theme; view.search = context.search; view.category = context.category; view.shopPage = 0;
    const query = context.search.trim();
    const candidates = data().furniture.filter(def => !def.rewardOnly && !def.customArt && def.currency !== 'none' && (context.theme === 'all' || def.theme === context.theme) && (context.category === 'all' || def.category === context.category) && (!query || (def.name + ' ' + ((data().themes[def.theme] || {}).name || '')).includes(query)));
    view.shopTab = candidates.length && candidates.every(def => !!def.festivalId) ? 'festival' : 'all';
    ui.open('shop', { fromDecor: true });
  }
  function returnToDecor(context) {
    if (context.epoch !== view.archiveEpoch || context.roomId && !decorRoom(context.roomId)) { ui.toast('原来的空间已经变动，请重新选择。'); return; }
    view.decorTheme = context.theme; view.decorCategory = context.category; view.decorSearch = context.search; view.decorTab = context.tab; view.decorPage = context.page; view.decorShopReturn = null;
    ui.open('decor', { roomId: context.roomId });
  }
  // 保留原背包的卡片、主题、分类、分页和去杂货铺再返回；实体修改只交新建筑命令。
  function backpackPanel() {
    const body = el('div', 'ui-stack decor-panel'), epoch = view.archiveEpoch, roomId = activeDecorRoom();
    body.append(decorRoomContext(roomId));
    const controls = el('div', 'ui-row decor-controls');
    controls.append(el('strong', '', '🛋 背包 ' + inventoryCount()), button('↶ 撤销', () => doAction(G.buildingEditor.undo({ redo: false }), '已撤销上一步'), 'ui-button ui-button-soft'));
    body.append(controls);
    const more = el('details', 'decor-more-tools'); more.open = view.decorMoreOpen;
    const moreSummary = el('summary', '', '建造、外观与前院'); moreSummary.dataset.uiFocus = 'decor-more-tools'; more.append(moreSummary, decorateSuiteTabs('decor'));
    more.addEventListener('toggle', () => { if (epoch === view.archiveEpoch && more.isConnected) view.decorMoreOpen = more.open; });
    const defs = data().furniture.filter(def => S().inventory[def.id] > 0);
    const searchRow = el('div', 'ui-row decor-filter-row');
    const search = input('search', view.decorSearch, 'decor-search');
    search.placeholder = '搜索沙发、小床、台灯…';
    search.setAttribute('aria-label', '搜索背包里的家具');
    search.addEventListener('input', () => { if (epoch !== view.archiveEpoch) return; view.decorSearch = search.value; view.decorPage = 0; renderCurrent(); });
    searchRow.append(search);
    body.append(searchRow);
    const themes = [{ id: 'all', name: '全部主题' }, ...Object.values(data().themes).map(theme => ({ id: theme.id, name: theme.name }))];
    if (!themes.some(theme => theme.id === view.decorTheme)) view.decorTheme = 'all';
    const themePicker = select(themes, view.decorTheme, id => { view.decorTheme = id; view.decorPage = 0; renderCurrent(); });
    themePicker.dataset.uiFocus = 'decor-theme'; themePicker.setAttribute('aria-label', '筛选背包家具主题'); searchRow.append(field('家具主题', themePicker));
    body.append(categories(data().furniture, id => { view.decorCategory = id; view.decorPage = 0; renderCurrent(); }, view.decorCategory));
    const placing = G.runtime.placing && furnDef(G.runtime.placing);
    const grid = el('div', 'item-grid');
    const keyword = (view.decorSearch || '').trim();
    const filteredDefs = defs.filter(def => (view.decorTheme === 'all' || def.theme === view.decorTheme) && (view.decorCategory === 'all' || def.category === view.decorCategory) && (!keyword || (def.name + ' ' + ((data().themes[def.theme] || {}).name || '')).includes(keyword)));
    body.append(paragraph('背包共 ' + inventoryCount() + ' 件 · 当前筛选 ' + filteredDefs.length + ' 种', 'ui-small ui-muted'));
    const browse = button('去杂货铺找' + (view.decorTheme === 'all' ? '家具' : data().themes[view.decorTheme].name + '家具'), openDecorShop, 'ui-button ui-button-soft'); browse.dataset.uiFocus = 'decor-buy-theme';
    const page = catalogPage(filteredDefs, 'decorPage');
    if (filteredDefs.length > 24) body.append(page.controls());
    page.items.forEach(def => {
      const b = button('', () => {
        const targetRoomId = def.place === 'yard' ? null : roomId;
        if (!beginRoomPlacement(def, targetRoomId, false)) return;
        ui.toast('点一下房间，放下' + def.name + (def.place === 'floor' ? '；也可以拖动调整前后位置。' : '。')); updateHint();
      }, 'item-card' + (G.runtime.placing === def.id ? ' is-active' : ''));
      b.draggable = true; b.setAttribute('aria-label', def.name + '，' + S().inventory[def.id] + '件，选择后点击' + (def.place === 'yard' ? '前院' : '房间') + '摆放');
      append(b, thumb(def.id), el('span', 'item-info', def.name), el('span', 'item-count', '×' + S().inventory[def.id]));
      ui.furnitureRarity.decorate(b, def, { preview: b.querySelector('canvas') });
      const epoch = view.archiveEpoch;
      b.addEventListener('dragstart', event => {
        if (epoch !== view.archiveEpoch) { event.preventDefault(); return; }
        const targetRoomId = def.place === 'yard' ? null : roomId;
        view.dragPreparing = true;
        if (!beginRoomPlacement(def, targetRoomId, true)) { view.dragPreparing = false; event.preventDefault(); return; }
        event.dataTransfer.setData('application/x-marshmallow-item', def.id);
        event.dataTransfer.setData('application/x-marshmallow-furniture', def.id);
        event.dataTransfer.setData('text/plain', def.id); event.dataTransfer.effectAllowed = 'copy'; updateHint();
        // 先让浏览器捕获原生拖影，再隐藏来源面板，避免dragstart被display:none取消。
        requestAnimationFrame(() => {
          view.dragPreparing = false;
          if (epoch !== view.archiveEpoch || G.runtime.placing !== def.id) return;
          ui.panel.close({ keepPlacing: true }); updateHint();
        });
      });
      b.addEventListener('dragend', event => { if (epoch !== view.archiveEpoch) return; view.dragPreparing = false; if (event.dataTransfer?.dropEffect === 'none' && G.runtime.placing === def.id) cancelPlacement(); });
      grid.append(b);
    });
    body.append(grid);
    if (!defs.length) body.append(notice('背包里还没有家具。可以带着当前主题与搜索去杂货铺挑选。'));
    else if (!grid.children.length) body.append(notice('背包里暂时没有符合当前主题、分类或搜索的家具。可以去对应杂货铺看看，购买后再回这间房。'));
    body.append(browse, more);
    return { title: '🛋 装扮小屋', subtitle: placing ? '已选' + placing.name + ' · 点一下房间放下' : '点家具，再点房间摆放；也能直接拖进去', content: body };
  }

  ui.backpackPanel = backpackPanel;

  function catalogPage(definitions, key, size = 24) {
    const count = Math.max(1, Math.ceil(definitions.length / size));
    view[key] = Math.max(0, Math.min(Number(view[key]) || 0, count - 1));
    const page = view[key];
    function controls() {
      const nav = el('nav', 'catalog-pager'); nav.setAttribute('aria-label', key === 'shopPage' ? '家具商店翻页' : '家具背包翻页');
      const turn = value => { view[key] = value; renderCurrent(); $('panel-body').scrollTop = 0; };
      const previous = button('‹ 上一页', () => turn(page - 1), 'ui-button ui-button-soft'); previous.disabled = page === 0; previous.dataset.uiFocus = key + '-previous';
      const next = button('下一页 ›', () => turn(page + 1), 'ui-button ui-button-soft'); next.disabled = page + 1 >= count; next.dataset.uiFocus = key + '-next';
      nav.append(previous, el('span', 'ui-small', '第 ' + (page + 1) + ' / ' + count + ' 页 · ' + definitions.length + ' 件'), next); return nav;
    }
    return { items: definitions.slice(page * size, (page + 1) * size), controls };
  }

  function shopPanel() {
    const body = el('div', 'ui-stack shop-panel');
    const context = view.decorShopReturn;
    if (context && context.epoch === view.archiveEpoch) {
      const back = button('返回装扮 · ' + roomName(context.roomId), () => returnToDecor(context), 'ui-button ui-button-primary'); back.dataset.uiFocus = 'decor-return'; back.disabled = !!context.roomId && !decorRoom(context.roomId);
      body.append(append(el('div', 'decor-shop-return'), paragraph('为' + roomName(context.roomId) + '挑选 · 返回时保留原主题与筛选', 'ui-small ui-muted'), back));
    }
    body.append(tabs([{ id: 'all', name: '云朵杂货' }, { id: 'deals', name: '🍬 今日特惠' }, { id: 'festival', name: '🎁 节日限定' }, { id: 'gifts', name: '🎀 惊喜礼盒' }], view.shopTab, id => { view.shopTab = id; view.category = 'all'; view.shopPage = 0; renderCurrent(); }));
    if (view.shopTab === 'deals') { body.append(ui.deals.content()); return { title: '🍬 今日特惠', subtitle: '每天六份小惊喜，同一天慢慢选', content: body }; }
    if (view.shopTab === 'gifts') { body.append(ui.gifts.content()); return { title: '🎁 糯米的礼盒铺', subtitle: '用游戏里的糖果，收下一份小心意', content: body }; }
    if (ui.calendar && view.shopTab === 'festival') { const notices = ui.calendar.notices(); if (notices) body.append(notices); }
    const filter = el('div', 'ui-row'); const search = input('search', view.search, 'shop-search'); search.placeholder = '找找床、台灯、小花……'; search.setAttribute('aria-label', '搜索家具');
    const epoch = view.archiveEpoch;
    search.addEventListener('input', () => { if (epoch !== view.archiveEpoch) return; view.search = search.value; view.shopPage = 0; renderCurrent(); });
    const themes = [{ id: 'all', name: '所有主题' }, ...Object.values(data().themes).map(t => ({ id: t.id, name: (t.icon || '') + t.name }))];
    const themePicker = select(themes, view.theme, id => { view.theme = id; view.shopPage = 0; renderCurrent(); }); themePicker.setAttribute('aria-label', '筛选家具主题');
    append(filter, search, themePicker); body.append(filter);
    body.append(categories(data().furniture.filter(def => !def.rewardOnly), id => { view.category = id; view.shopPage = 0; renderCurrent(); }));
    const definitions = data().furniture.filter(def => !def.rewardOnly && (view.shopTab === 'festival' ? !!def.festivalId && G.sys.time.canBuy(def).ok : !def.festivalId) && (view.category === 'all' || def.category === view.category) && (view.theme === 'all' || def.theme === view.theme) && (!view.search || (def.name + ' ' + ((data().themes[def.theme] || {}).name || '')).includes(view.search.trim())));
    const grid = el('div', 'item-grid');
    const page = catalogPage(definitions, 'shopPage');
    if (definitions.length) body.append(page.controls());
    page.items.forEach(def => {
      const currency = def.currency || 'coin', icon = currency === 'heart' ? '❤' : '🍬', price = G.sys.deals.priceFor(def.id);
      const locked = S().level < def.unlockLv, short = Math.max(0, price - Number(S().wallet[currency] || 0)), purchasable = currency !== 'none';
      const item = append(el('article', 'item-card'), thumb(def.id), el('h3', 'item-info', def.name), el('span', 'ui-small ui-muted', (data().themes[def.theme] || {}).name || ''));
      ui.furnitureRarity.decorate(item, def, { preview: item.querySelector('canvas') });
      const text = locked ? '🔒 ' + def.unlockLv + '级解锁' : (!purchasable ? '特别礼物' : short > 0 ? ('还差 ' + num(short) + (currency === 'heart' ? ' 颗爱心' : ' 颗糖果')) : icon + ' ' + num(price) + (price < def.price ? ' · 今日八折' : ' · 买一件'));
      const buy = button(text, () => doAction(G.sys.economy.buy(def.id, price), '买到' + def.name + '啦！到背包里看看。'), 'ui-button ' + (short || locked ? 'ui-button-soft' : 'ui-button-primary'));
      buy.disabled = locked || short > 0 || !purchasable || (S().inventory[def.id] || 0) >= 9999; item.append(buy);
      const owned = (S().inventory[def.id] || 0) + S().building.furniture.filter(item => item.defId === def.id).length;
      if (owned) item.append(el('span', 'ui-badge', '已拥有 ' + owned)); grid.append(item);
    });
    body.append(grid);
    if (definitions.length > 24) body.append(page.controls());
    if (!definitions.length) body.append(notice(view.shopTab === 'festival' ? '限定小礼物会跟着节日来敲门。先逛逛云朵杂货，下一场庆祝在等你。' : '没有找到这件宝贝，换个词试试看。'));
    return { title: '🛍 云朵杂货铺', subtitle: '喜欢的东西，可以慢慢攒', content: body };
  }

  function residentsPanel() {
    return ui.residentBook.panel({ chat, gift: giftResident, invite: inviteResident, roomName, doAction, navigate(wish, residentId) {
      const action = wish.action || {}, definition = wish.definition || {}; let panel = action.panel || ({ furniture: 'shop', theme: 'decor', food: 'play', flower: 'garden', activity: 'play', outfit: 'avatar' }[definition.type]) || 'decor';
      const resident = S().residents[residentId]; if (resident?.roomId) G.runtime.activeRoomId = resident.roomId;
      if (definition.type === 'theme') { const available = data().furniture.filter(item => item.theme === definition.theme && item.place !== 'yard').reduce((total, item) => total + (S().inventory[item.id] || 0), 0); if (available < wish.target - wish.progress) panel = 'shop'; }
      if (panel === 'shop') { const item = furnDef(action.itemId || definition.itemId); view.search = item ? item.name : ''; view.theme = action.theme || definition.theme || 'all'; view.shopTab = 'all'; view.shopPage = 0; }
      if (panel === 'decor') { view.decorTab = 'items'; view.decorPage = 0; const theme = action.theme || definition.theme; if (data().themes[theme]) view.decorTheme = theme; }
      if (panel === 'avatar' && G.runtime.avatarUI) { G.runtime.avatarUI.tab = 'clothes'; const outfit = data().outfitById[action.outfitId || definition.outfitId]; if (outfit) G.runtime.avatarUI.category = outfit.category; }
      ui.open(panel);
    } });
  }
  function chat(id) {
    const result = G.sys.residents.chat(id), def = data().residents.find(r => r.id === id);
    if (!result.ok) { doAction(result); return; }
    const text = result.text || result.message || '和你在一起真开心！';
    const body = append(el('div', 'ui-stack'), residentThumb(id), paragraph(text, 'resident-dialogue'), listenButton(text), button('我也很开心', () => modal.close(), 'ui-button ui-button-primary'));
    const modal = ui.modal({ title: def.name + '说', content: body }); thumbnails();
  }
  function giftResident(id, preferredGiftId) {
    const def = data().residents.find(r => r.id === id), body = el('div', 'ui-stack'), choices = [];
    G.sys.residents.giftOptions(id).forEach(gift => choices.push({ id: gift.id, name: gift.name + ' · ' + gift.count + ' 份' + (gift.favorite ? ' · 最喜欢' : '') }));
    let modal;
    if (!choices.length) append(body, notice('礼物篮还空着。做一份蛋糕，或种一份花园的小惊喜吧。'), button('去游乐场', () => { modal.close(); ui.open('play'); }, 'ui-button ui-button-primary'), button('去花园', () => { modal.close(); ui.open('garden'); }));
    else {
      const picker = select(choices, choices.some(choice => choice.id === preferredGiftId) ? preferredGiftId : choices[0].id);
      append(body, paragraph('把亲手做的点心、种出的花果送给' + def.name + '。每天一份，心意刚刚好。'), field('选一份小礼物', picker), button('送给' + def.name, () => {
        const result = G.sys.residents.gift(id, picker.value);
        if (doAction(result, '收到你的心意啦！')) modal.close();
      }, 'ui-button ui-button-primary'));
    }
    modal = ui.modal({ title: '🎁 给' + def.name + '的心意', content: body });
  }
  function chooseGiftRecipient(itemId) {
    const friends = data().residents.filter(def => S().residents[def.id]?.movedIn), body = el('div', 'ui-stack'), food = furnDef(itemId);
    if (!food || !['cake_strawberry', 'cake_strawberry_deluxe', 'cake_blueberry_deluxe'].includes(itemId) || !(S().inventory[itemId] > 0)) { ui.toast('这份点心已经分享完啦，再做一份吧。'); return; }
    let modal;
    if (!friends.length) body.append(paragraph('先邀请一位朋友，再一起分享亲手做的点心。'), button('去认识朋友', () => { modal.close(); ui.open('residents'); }, 'ui-button ui-button-primary'));
    else {
      const picker = select(friends.map(def => ({ id: def.id, name: def.name + (S().residents[def.id].giftDate === G.utils.dateKey() ? ' · 今天的心意已收好' : '') })), friends.find(def => S().residents[def.id].giftDate !== G.utils.dateKey())?.id || friends[0].id);
      body.append(paragraph('想把「' + food.name + '」送给哪位朋友？每天一份，亲手制作的心意慢慢分享。'), field('选一位朋友', picker), button('选好这位朋友', () => { const id = picker.value; modal.close(); giftResident(id, itemId); }, 'ui-button ui-button-primary'));
    }
    modal = ui.modal({ title: '分享亲手做的点心', content: body });
  }
  function placeCraft(itemId) {
    const def = furnDef(itemId); if (!def || !(S().inventory[itemId] > 0)) { ui.toast('成品已经用完啦，再做一份小心意吧。'); return; }
    const target = def.place === 'yard' ? null : activeDecorRoom();
    if (beginRoomPlacement(def, target, false)) ui.toast('点房间，放下' + def.name + (def.place === 'table' ? '；也能放到桌面上。' : '。'));
  }
  function inviteResident(id) {
    const def = data().residents.find(r => r.id === id), body = el('div', 'ui-stack');
    append(body, residentThumb(id), paragraph('“' + def.intro + '”'));
    const eligible = G.sys.residents.eligibility(id);
    const bedrooms = rooms().filter(([rid, r]) => G.contentSpaces.isType(r, 'bedroom') && (!eligible.roomIds || eligible.roomIds.includes(rid)) && Object.values(S().residents).filter(v => v.movedIn && v.roomId === rid).length < 2);
    if (!bedrooms.length) append(body, notice('还没有空余的卧室。先建一间卧室并摆好床吧。'), button('🔨 去建卧室', () => { modal.close(); ui.open('build'); }));
    else {
      const picker = select(bedrooms.map(([rid]) => ({ id: rid, name: roomName(rid) })), bedrooms[0][0]);
      append(body, field('给朋友选一间卧室', picker), button('欢迎来我家！', () => {
        const result = G.sys.residents.invite(id, picker.value);
        if (doAction(result, def.name + '搬进来啦！')) { modal.close(); ui.open('residents'); }
      }, 'ui-button ui-button-primary'));
    }
    const modal = ui.modal({ title: '💌 新朋友来敲门', content: body, speechText: def.intro }); thumbnails();
  }

  function navigateToContent(action) {
    action = action || {};
    const panel = action.panel || 'build';
    if (panel === 'crafting') { ui.crafting.open(action); return; }
    if (panel === 'concert') { ui.concert.open(); return; }
    if (panel === 'photo') { ui.photography.open(); return; }
    if (panel === 'rename') { renameHouse(false); return; }
    if (panel === 'shop') { const item = furnDef(action.itemId); view.search = item ? item.name : ''; view.theme = action.theme || 'all'; view.category = 'all'; view.shopTab = action.shopTab || 'all'; view.shopPage = 0; }
    if (panel === 'decor') { view.decorTab = action.tab || 'items'; view.decorPage = 0; }
    if (panel === 'residents' && action.residentId && ui.residentBook.focus) ui.residentBook.focus(action.residentId);
    if (panel === 'avatar' && G.runtime.avatarUI) { G.runtime.avatarUI.tab = 'clothes'; const outfit = data().outfitById[action.outfitId]; if (outfit) G.runtime.avatarUI.category = outfit.category; G.runtime.avatarUI.filter = outfit && S().avatar.owned[outfit.id] ? 'owned' : 'shop'; }
    if (panel === 'quests' && ui.questBook.focus) ui.questBook.focus(action);
    if (panel === 'play' && action.gameId) {
      const game = ui.minigames.catalog().find(entry => entry.id === action.gameId);
      if (game && game.locked && action.gameId === 'bakery') { ui.open('build', { roomType: 'kitchen' }); return; }
      ui.open('play'); ui.minigames.start(action.gameId); return;
    }
    ui.open(panel, action);
  }
  function questsPanel() { return ui.questBook.panel({ doAction, navigate: navigateToContent }); }
  function playPanel() {
    const body = el('div', 'ui-stack'), grid = el('div', 'play-catalog');
    body.append(paragraph('每款游戏每天前 5 局都有完整礼物，之后也有一半奖励。想休息时随时收好本局礼物。', 'ui-small ui-muted'));
    ui.minigames.catalog().forEach(game => {
      const mini = S().minigames[game.id], count = mini.date === G.utils.dateKey() ? mini.playsToday : 0;
      const item = card(game.name, game.description);
      item.classList.add('play-card');
      if (ui.visualShell) { const art = el('div', 'play-card-art'); art.dataset.game = game.id; art.append(ui.visualShell.icon(({ bakery: 'cake', match3: 'leaf', catch_stars: 'star', memory: 'book' })[game.id] || 'game')); item.prepend(art); }
      item.append(paragraph((game.id === 'bakery' ? '最多完成 ' + mini.best + ' 单' : '最高 ' + mini.best + ' 分') + ' · 今日 ' + count + ' 局', 'ui-small ui-muted'));
      let difficulty = 'easy';
      if (game.id === 'memory') item.append(field('翻翻乐难度', select(game.difficulties, difficulty, value => { difficulty = value; })));
      if (game.locked) item.append(notice(game.unlockText));
      item.append(button(game.locked ? '🔨 去建厨房' : game.id === 'bakery' ? '开始烘焙' : '开始玩', () => game.locked ? ui.open('build') : game.id === 'bakery' ? ui.bakery.start() : ui.minigames.start(game.id, { difficulty }), 'ui-button ui-button-primary'));
      grid.append(item);
    });
    body.append(grid);
    return { title: '🎮 云端游乐场', subtitle: '开心地玩，每一局都有收获', content: body };
  }

  function renameHouse(fromGuide) {
    const body = el('form', 'ui-stack'), name = input('text', S().house.name, 'house-rename'); name.maxLength = 8; name.autofocus = true;
    append(body, field('小屋的名字（最多8个字）', name), paragraph('可以随便起一个喜欢的名字。', 'ui-small ui-muted'));
    const submit = el('button', 'ui-button ui-button-primary', '就叫这个名字'); submit.type = 'submit'; body.append(submit);
    const modal = ui.modal({ title: '🏡 给小屋起名字', content: body });
    body.addEventListener('submit', e => { e.preventDefault(); const value = [...name.value.trim()].slice(0, 8).join('') || '我的小屋'; G.store.update(state => { state.house.name = value; if (fromGuide && state.tutorial.step < 2) state.tutorial.step = 2; }); modal.close(); ui.toast('欢迎来到' + value + '！'); if (fromGuide) ui.open('build'); });
    if (fromGuide) body.append(button('先用“我的小屋”', () => { name.value = '我的小屋'; body.requestSubmit(); }, 'ui-button ui-button-soft'));
  }
  function settingsPanel() {
    const body = el('div', 'ui-stack settings-paper'), form = el('form', 'ui-grid settings-profile');
    form.noValidate = true;
    const name = input('text', S().profile.name, 'profile-name'); name.maxLength = 8;
    const birthday = input('text', S().profile.birthday || '', 'profile-birthday'); birthday.placeholder = '例如 06-01（可不填）'; birthday.pattern = '(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])'; birthday.maxLength = 5;
    append(form, field('设计师昵称（随便起一个）', name), field('想庆祝的生日（月-日，可不填）', birthday));
    const nameSave = el('button', 'ui-button ui-button-primary', '保存昵称和生日'); nameSave.type = 'submit'; form.append(nameSave);
    birthday.addEventListener('input', () => birthday.removeAttribute('aria-invalid'));
    form.addEventListener('submit', e => {
      e.preventDefault(); const date = birthday.value;
      if (date) {
        const parts = date.split('-').map(Number), days = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        if (!/^\d{2}-\d{2}$/.test(date) || parts[0] < 1 || parts[0] > 12 || parts[1] < 1 || parts[1] > days[parts[0] - 1]) {
          birthday.setAttribute('aria-invalid', 'true'); birthday.focus(); ui.toast('请填有效的月-日，例如06-01；也可以留空。'); return;
        }
      }
      G.store.update(state => { state.profile.name = [...name.value.trim()].slice(0, 8).join('') || '小设计师'; state.profile.birthday = date; }); ui.toast('记住啦！');
    }); body.append(el('h3', 'paper-section-title', '关于我和小屋'), form);
    body.append(button('🏡 修改小屋名字', () => renameHouse(false)));
    const settings = S().settings;
    body.append(el('h3', 'paper-section-title', '听见小屋的声音'));
    ['music', 'sfx'].forEach(key => {
      const range = input('range', String(settings[key]), 'setting-' + key); range.min = '0'; range.max = '1'; range.step = '0.01';
      range.addEventListener('input', () => { G.store.update(state => { state.settings[key] = Number(range.value); }); if (key === 'sfx') ui.audio.play('click'); });
      body.append(field(key === 'music' ? '🎵 音乐音量' : '🔔 音效音量', range));
    });
    const speechVoices = [...new Map(G.audio.getVoices().map(voice => [voice.voiceURI, voice])).values()];
    const voiceChoices = [{ id: '', name: '自动选择 · 优先自然普通话' }, ...speechVoices.map(voice => ({ id: voice.voiceURI, name: voice.name + (/zh[-_]HK/i.test(voice.lang) ? ' · 粤语' : /zh[-_]TW/i.test(voice.lang) ? ' · 台湾国语' : ' · 普通话') + (/enhanced|premium|natural|siri|增强|自然/i.test(voice.name + ' ' + voice.voiceURI) ? ' · 增强声线' : '') }))];
    const speechCard = card('听一听的声音', '选一条舒服的中文声线。正常语速，只读台词和说明，点第二次即可停下。');
    const voicePicker = select(voiceChoices, settings.ttsVoice || '', value => { G.audio.stopSpeech(); G.store.update(state => { state.settings.ttsVoice = value; }); });
    append(speechCard, field('中文声线', voicePicker), listenButton('你好呀，我是糯米。今天的云朵软软的，我们一起把小屋变得更温暖吧。', '🔊 试听这条声线'), paragraph(speechVoices.length ? '这里使用本机已安装的声线；增强声线是否可用，取决于你的设备。' : '正在寻找本机中文声线；若列表一直为空，可在系统中安装中文朗读声音。', 'ui-small ui-muted'));
    body.append(speechCard);
    body.append(el('h3', 'paper-section-title', '按自己的节奏'));
    const mode = select([{ id: 'real', name: '跟着太阳和月亮' }, { id: 'day', name: '永远白天' }, { id: 'night', name: '永远夜晚' }], settings.dayMode, value => { G.store.update(state => { state.settings.dayMode = value; }); }); body.append(field('☀ 昼夜', mode));
    const restCheck = input('checkbox', ''); restCheck.checked = settings.restReminder;
    restCheck.addEventListener('change', () => G.store.update(state => { state.settings.restReminder = restCheck.checked; }));
    body.append(field('🌿 玩40分钟提醒休息', restCheck));
    const saves = card('💾 小屋存档', G.cloud ? '进度会先保存在这个浏览器。登录并关联自己的账号后，还会自动保存到云端。' : '进度自动保存在这个浏览器里。用网址打开，也不会自动同步到别的设备。');
    append(saves, paragraph(G.cloud ? '换设备前请确认云端已同步，或下载JSON在新设备导入。清除浏览器数据前也请备份。MD回忆录只用来阅读。' : '换设备、换浏览器或清除浏览器数据前，先下载JSON存档。到新地方导入，就能继续这座小屋。MD回忆录只用来阅读。', 'ui-small ui-muted'), paragraph('本机保存状态：' + (G.save.status || '正在准备'), 'ui-small ui-muted'), append(el('div', 'ui-actions'), button('⬇ 下载JSON存档', () => { G.save.exportJson(); ui.toast('存档已准备下载。'); }), button('⬆ 导入JSON存档', importSave), button('📖 下载MD回忆录', () => G.save.exportMemory())));
    if (view.saveRestoreWarning) { const warning = paragraph(view.saveRestoreWarning, 'ui-small ui-muted'); warning.setAttribute('role', 'alert'); saves.append(warning); }
    body.append(saves);
    if (ui.cloudAccount) body.append(ui.cloudAccount.entry());
    append(body, button('👪 给家长的话', parentInfo), button('🧭 再看看怎么玩', () => ui.open('help')), button('重新开始', resetGame, 'ui-button ui-button-danger'));
    if (new URLSearchParams(location.search).get('debug') === '1') {
      const debug = card('开发者工具'); debug.classList.add('debug-tools');
      append(debug, button('+1000 糖果币', () => { G.store.update(s => { s.wallet.coin += 1000; }); }), button('+100 爱心', () => { G.store.update(s => { s.wallet.heart += 100; }); }), button('+1 小屋等级', () => { G.sys.economy.addExp(G.sys.economy.needExp(S().level)); ui.refresh(); }), button('跳过引导', () => finishTutorial(true)), button('重新开始（同样保护）', resetGame));
      if (G.sys.time) {
        const overrides = G.runtime.timeDebug || {};
        debug.append(field('预览时间段', select([{ id: 'real', name: '跟随本机时间' }, { id: '9', name: '☀ 清晨 09:00' }, { id: '19', name: '🌇 黄昏 19:00' }, { id: '22', name: '🌙 夜晚 22:00' }], overrides.hour === undefined ? 'real' : String(overrides.hour), value => { G.sys.time.setDebug({ hour: value === 'real' ? null : Number(value) }); })));
        debug.append(field('预览天气', select([{ id: '', name: '按日期与季节' }, { id: 'clear', name: '☀ 晴天' }, { id: 'cloudy', name: '☁ 多云' }, { id: 'rain', name: '🌧 小雨' }, { id: 'snow', name: '❄ 雪花' }, { id: 'sakura', name: '🌸 樱花飘落' }, { id: 'leaves', name: '🍂 秋日落叶' }], overrides.weather || '', value => { G.sys.time.setDebug({ weather: value || null }); })));
        debug.append(field('预览节日', select([{ id: '', name: '按当前日期' }, ...data().festivals.map(festival => ({ id: festival.id, name: festival.icon + ' ' + festival.name }))], overrides.festival || '', value => { G.sys.time.setDebug({ festival: value || null }); })));
        const datePreview = input('text', overrides.date || '', 'debug-date'); datePreview.placeholder = 'YYYY-MM-DD，例如 2026-12-25'; datePreview.maxLength = 10;
        debug.append(field('预览日期', datePreview), button('应用预览日期', () => { const result = G.sys.time.setDebug({ date: datePreview.value.trim() || null }); if (result && result.ok === false) ui.toast(result.message); else ui.toast('已切换预览日期，作物仍按真实时间生长。'); }), button('恢复真实时间与天气', () => { G.sys.time.clearDebug(); ui.refresh(); }));
      }
      body.append(debug);
    }
    return { title: '⚙️ 小屋设置', subtitle: '照你舒服的方式来', content: body };
  }
  function parentInfo() {
    const body = append(el('div', 'ui-stack'), paragraph('这是一款离线优先的装扮小游戏，没有广告、付费购买、社交聊天和排行榜。角色的对话都来自游戏预写内容。'), paragraph('每个孩子可以使用自己的账号。网站版登录并主动关联小屋后，会把完整进度自动保存到自己的账号，换设备可继续；不登录也能玩。离线文件版保留本机存档和JSON备份，MD回忆录只用于阅读。'), paragraph('建议每次游戏10～30分钟，陪孩子一起起名字、搭配颜色、给小动物布置房间。连续玩40分钟会有温柔的休息提示，可在设置中调整。'), paragraph('账号不要求真实姓名或邮箱，昵称和生日可以随意填写。关联账号后，昵称、生日、相册与画作会随完整存档上传；不想上传时可以继续单机。清除浏览器数据或更换设备前，请确认同步完成，并另留一份JSON备份。'));
    ui.modal({ title: '👪 给家长的话', content: body });
  }
  function cloudReplacementNote() {
    const cloud = G.cloud && typeof G.cloud.status === 'function' ? G.cloud.status() : null;
    return cloud && cloud.binding && cloud.account ? ' 当前小屋已关联账号“' + (cloud.account.displayName || cloud.account.username) + '”，本次替换后的进度也会自动同步到这个账号。' : '';
  }
  function importSave() {
    document.querySelectorAll('input[data-save-import]').forEach(node => node.remove());
    const picker = input('file', ''); picker.accept = '.json,application/json'; picker.hidden = true; picker.dataset.saveImport = 'true'; document.body.append(picker);
    picker.addEventListener('cancel', () => picker.remove(), { once: true });
    picker.addEventListener('change', async () => {
      const file = picker.files[0]; picker.remove(); if (!file) return;
      if (!await ui.confirm('用“' + file.name + '”恢复小屋？当前进度会被替换，建议先下载当前JSON存档。' + cloudReplacementNote(), { title: '导入存档', accept: '导入并恢复' })) return;
      try {
        const result = await G.save.importFile(file);
        if (!result || result.ok !== true) {
          view.saveRestoreWarning = result && result.message || '这次没有完成恢复，当前小屋还好好的。请先下载JSON存档，再选择小屋导出的JSON文件。'; if (view.panel === 'settings') renderCurrent(); ui.toast(view.saveRestoreWarning); return;
        }
        view.saveRestoreWarning = result && result.warning ? String(result.warning) : '';
        ui.selection(); if (G.render.camera) G.render.camera.fit(); ui.toast(result && result.message || '小屋恢复啦，欢迎回来！'); ui.open('settings');
      } catch (error) {
        view.saveRestoreWarning = error && error.message || '没有读懂这份存档，请选择小屋导出的JSON文件。'; if (view.panel === 'settings') renderCurrent(); ui.toast(view.saveRestoreWarning);
      }
    }); picker.click();
  }
  async function resetGame() {
    const first = await ui.confirm('重新开始会清空这个浏览器里的小屋进度。先下载一份JSON存档，就能以后再回来。' + cloudReplacementNote(), { title: '准备重新开始？', danger: true, accept: '我知道，继续确认' });
    if (!first) return;
    const body = el('div', 'ui-stack'); append(body, paragraph('最后确认：按住下面的按钮3秒。松开会取消本次计时。也可以用Tab选中按钮，持续按住空格或回车。'));
    const hold = button('按住3秒，重新开始', null, 'ui-button ui-button-danger hold-button');
    const progress = el('progress', 'hold-progress'); progress.max = 3000; progress.value = 0; progress.setAttribute('aria-label', '重新开始确认进度');
    const resetError = paragraph('', 'ui-small ui-muted'); resetError.setAttribute('role', 'alert'); resetError.tabIndex = -1;
    const recovery = append(el('div', 'ui-stack hidden'), resetError, button('先下载当前JSON存档', () => { G.save.exportJson(); ui.toast('存档已准备下载。'); }));
    let since = 0, timer = null, completed = false, pointer = null;
    const cancel = () => { if (completed) return; since = 0; if (timer) clearInterval(timer); timer = null; progress.value = 0; hold.textContent = '按住3秒，重新开始'; };
    const start = () => {
      if (since || completed) return; since = performance.now();
      timer = setInterval(() => {
        const elapsed = performance.now() - since; progress.value = Math.min(elapsed, 3000); hold.textContent = '再按住 ' + Math.max(1, Math.ceil((3000 - elapsed) / 1000)) + ' 秒';
        if (elapsed >= 3000) {
          clearInterval(timer); timer = null;
          let result;
          try { result = G.save.reset(); } catch (error) { result = { ok: false, message: error && error.message }; }
          if (!result || result.ok !== true) {
            cancel(); resetError.textContent = result && result.message || '这次没有重新开始，原来的小屋还在。请先下载JSON存档，再检查浏览器存储空间后重试。'; recovery.classList.remove('hidden'); resetError.focus(); return;
          }
          completed = true; modal.close(); view.saveRestoreWarning = result.warning ? String(result.warning) : '';
          ui.selection(); ui.panel.close(); ui.refresh(); if (G.render.camera) G.render.camera.fit(); ui.toast(result.message || '新的小屋旅程开始啦！'); if (view.saveRestoreWarning) ui.open('settings'); else showWelcome();
        }
      }, 40);
    };
    hold.addEventListener('pointerdown', e => { if (e.button !== 0) return; e.preventDefault(); hold.focus(); pointer = e.pointerId; hold.setPointerCapture(e.pointerId); start(); });
    hold.addEventListener('pointerup', cancel); hold.addEventListener('pointercancel', cancel); hold.addEventListener('lostpointercapture', cancel); hold.addEventListener('blur', cancel);
    hold.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) start(); } });
    hold.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); cancel(); } });
    document.addEventListener('visibilitychange', cancel);
    append(body, hold, progress, recovery, button('留下我的小屋', () => modal.close()));
    const modal = ui.modal({ title: '再确认一次', content: body, onClose() { cancel(); document.removeEventListener('visibilitychange', cancel); }, lockBackdrop: true });
  }

  function memoriesPanel() {
    const body = el('div', 'ui-stack');
    append(body, paragraph('把小屋里值得记住的时刻，收进一本小小的回忆录。'), button('📖 下载Markdown回忆录', () => { G.save.exportMemory(); ui.toast('回忆录已准备下载。'); }, 'ui-button ui-button-primary'), button('📷 小屋相册', () => ui.photography.open({ mode: 'album' }), 'ui-button ui-button-soft'), button('📚 收藏图鉴', () => ui.open('collection'), 'ui-button ui-button-soft'), button('🎨 创意画板', () => ui.creative.open(), 'ui-button ui-button-soft'), ui.crafting.entry(), button('🎁 惊喜礼盒', () => ui.gifts.open(), 'ui-button ui-button-soft'), button('📅 七日登录礼物', () => ui.open('login'), 'ui-button ui-button-soft'), ui.observatory.entry());
    const memories = [...(S().memories || [])].reverse();
    if (!memories.length) body.append(notice('第一段回忆，正等着你写下。盖一间房、邀请一位朋友吧。'));
    memories.forEach(memory => {
      const item = el('article', 'memory-item'); let time = '';
      try { time = new Date(memory.at).toLocaleString('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (_) { time = '美好的一天'; }
      append(item, el('time', 'ui-small ui-muted', time), paragraph(memory.text, 'memory-text')); body.append(item);
    });
    return { title: '📖 小屋回忆录', subtitle: '每一个温暖时刻，都被好好收藏', content: body };
  }
  const guideSteps = [
    '给小屋起一个喜欢的名字。',
    '打开建造，用墙围出一个喜欢的空间，也可以斜着画。',
    '打开装饰背包，点赠送的小床，再点卧室摆放。',
    '打开居民面板，邀请莉莉住进卧室。',
    '再围一处空间、摆上炉灶，去游乐场做一局蛋糕。',
    '去商店买一盏台灯，背包里还有赠送的床头柜。',
    '把床头柜摆进房间，再把台灯放到柜面上。'
  ];
  function helpPanel() {
    const body = el('div', 'ui-stack');
    body.append(notice('☁ 我是糯米。彩虹暴风吹散了小屋，我们一起给小动物盖个暖暖的家。'));
    const list = el('ol', 'guide-steps'); guideSteps.forEach(text => list.append(el('li', '', text))); body.append(list);
    append(body, paragraph('拖动画面可到处看看；滚轮或＋/−可以缩放。用墙围出空间，给墙安上门窗，再摆放家具；点选家具可调整位置和方向。Ctrl+Z（Mac用⌘Z）能撤销，Shift+Ctrl+Z能重做。', 'ui-small ui-muted'));
    if (!S().tutorial.done) append(body, button('带我做下一步', guideNext, 'ui-button ui-button-primary'), button('跳过引导，自由玩', () => finishTutorial(true), 'ui-button ui-button-soft'));
    else body.append(button('🔨 开始盖小屋', () => ui.open('build'), 'ui-button ui-button-primary'));
    return { title: '☁ 糯米的小贴士', subtitle: '想怎么装扮，就怎么装扮', content: body };
  }
  function guideNext() {
    const step = S().tutorial.step || 0;
    if (step < 2) renameHouse(true);
    else if (step === 2) ui.open('build');
    else if (step === 3 || step === 7) ui.open('decor');
    else if (step === 4) ui.open('residents');
    else if (step === 5) ui.open(rooms().some(([, r]) => G.contentSpaces.isType(r, 'kitchen')) ? 'play' : 'build');
    else if (step === 6) ui.open('shop');
  }
  function finishTutorial(skipped) {
    if (S().tutorial.done) return;
    G.store.update(state => { state.tutorial.done = true; state.tutorial.step = 8; if (!state.tutorial.rewarded) { state.tutorial.rewarded = true; state.wallet.coin += 300; } });
    if (view.modal) view.modal.close(); updateHint();
    ui.toast(skipped ? '可以自由装扮啦！糯米送你300颗糖果。' : '你的小屋已经暖起来啦！糯米送你300颗糖果，接下来尽情创造吧。');
    if (!G.runtime.reviewMode && ui.calendar) setTimeout(() => ui.calendar.maybeGreet(), 600);
  }
  function showWelcome() {
    if (G.runtime.reviewMode || S().tutorial.done || S().tutorial.step > 0) return;
    if (ui.avatar && ui.avatar.needsPreset()) { ui.avatar.pickPreset({ first: true, onDone: () => setTimeout(showWelcome, 200) }); return; }
    const body = append(el('div', 'ui-stack'), el('div', 'welcome-cloud', '☁'), paragraph('你好呀，我是云朵精灵糯米。'), paragraph('彩虹暴风吹散了岛上的房子，小动物们正在寻找新家。和我一起盖一座软乎乎、暖洋洋的小屋吧！'), append(el('div', 'ui-actions'), button('一起开始吧', () => { modal.close(); G.store.update(s => { s.tutorial.step = 1; }); renameHouse(true); }, 'ui-button ui-button-primary'), button('跳过引导，自由玩', () => { modal.close(); finishTutorial(true); }, 'ui-button ui-button-soft')));
    const modal = ui.modal({ title: '欢迎来到棉花糖岛', content: body, speechText: '你好呀，我是云朵精灵糯米。彩虹暴风吹散了岛上的房子，小动物们正在寻找新家。和我一起盖一座软乎乎、暖洋洋的小屋吧！' });
  }
  function advanceGuide() {
    const tutorial = S().tutorial;
    if (G.runtime.reviewMode || tutorial.done || view.tutorialBusy) return;
    let next = tutorial.step || 0;
    const bedroom = rooms().filter(([, room]) => G.contentSpaces.isType(room, 'bedroom'));
    if (next === 2 && bedroom.length) next = 3;
    if (next === 3 && bedroom.some(([, room]) => room.items.some(i => (furnDef(i.defId).tags || []).includes('bed')))) next = 4;
    if (next === 4 && S().residents.lily && S().residents.lily.movedIn) next = 5;
    if (next === 5 && (S().minigames.bakery.playsToday > 0 || S().minigames.bakery.best > 0)) next = 6;
    if (next === 6 && tutorial.seenTips.lampBought) next = 7;
    if (next === 7 && S().building.furniture.some(item => furnDef(item.defId).template === 'desk_lamp' && item.position.y > .2)) { finishTutorial(false); return; }
    if (next !== tutorial.step) { view.tutorialBusy = true; G.store.update(state => { state.tutorial.step = next; }); view.tutorialBusy = false; ui.toast('☁ ' + guideSteps[Math.max(0, next - 1)]); }
  }
  function cameraInteractionMode() {
    const camera = G.render?.camera;
    if (typeof camera?.getInteractionMode !== 'function' || typeof camera?.setInteractionMode !== 'function') return null;
    const mode = camera.getInteractionMode();
    return mode === 'pan' || mode === 'orbit' ? mode : null;
  }
  function syncCameraInteraction() {
    const toggle = $('camera-orbit'), mode = cameraInteractionMode();
    if (toggle) {
      toggle.disabled = mode === null;
      toggle.setAttribute('aria-pressed', String(mode === 'orbit'));
      const description = mode === null ? '当前场景尚未提供视角切换。' : mode === 'orbit' ? '鼠标或单指拖动转动视角；再次点击恢复拖动平移。' : '鼠标或单指拖动平移；点击后可以转动视角。';
      toggle.setAttribute('title', description); toggle.setAttribute('aria-description', description);
    }
    updateHint();
  }
  function updateHint() {
    const hint = $('scene-hint'); if (!hint) return;
    const buildingHint = G.buildingEditor?.hint?.();
    if (typeof buildingHint === 'string' && buildingHint) { hint.textContent = buildingHint; return; }
    if (G.runtime.placing || ['build', 'decor', 'yard', 'roomLayout', 'houseDesign', 'exterior'].includes(view.panel)) return;
    const mode = cameraInteractionMode(), dragHint = mode === 'orbit' ? '鼠标或单指拖动转动视角' : mode === 'pan' ? '鼠标或单指拖动平移' : '鼠标或单指拖动场景';
    if (G.runtime.placing) hint.textContent = furnDef(G.runtime.placing)?.place === 'yard' ? '✨ 点前院摆放 · Esc取消' : '✨ 点房间摆放 · Esc取消';
    else if (!S().tutorial.done) hint.textContent = '☁ ' + (guideSteps[Math.max(0, (S().tutorial.step || 1) - 1)] || '点糯米看看下一步') + ' · ' + dragHint;
    else hint.textContent = dragHint + ' · 双击房间放大';
  }

  ui.selection = function () {
    if (typeof G.buildingEditor?.selection === 'function') G.buildingEditor.selection();
    else { const root = $('selection-tools'); root.replaceChildren(); root.classList.add('hidden'); }
  };
  const renderers = { houseBlueprints: () => ui.houseBlueprints.panel(), neighbors: () => ui.neighbors.panel(), cloudAccount: () => ui.cloudAccount.panel(), houseDesign: () => ui.houseDesign.panel(), crafting: () => ui.crafting.panel(view.options), roomLayout: () => buildingPanel('roomLayout'), observatory: () => ui.observatory.panel(), login: () => ui.login.panel(), build: () => buildingPanel('build'), decor: () => buildingPanel('decor'), shop: shopPanel, residents: residentsPanel, quests: questsPanel, play: playPanel, garden: () => ui.garden.panel(), avatar: () => ui.avatar.panel(), yard: () => buildingPanel('yard'), exterior: () => ui.exterior.panel(), settings: settingsPanel, memories: memoriesPanel, collection: () => ui.collectionBook.panel({ doAction, navigate: navigateToContent }), help: helpPanel };
  function renderCurrent() {
    if (view.dragPreparing) return;
    if (!view.panel || !renderers[view.panel]) return;
    // 账号与公开表单保留同一组DOM；计时和同步刷新不重挂，避免输入与焦点被打断。
    const cloudPanel = view.panel === 'cloudAccount' && ui.cloudAccount ? ui.cloudAccount.panel() : view.panel === 'neighbors' && ui.neighbors ? ui.neighbors.panel() : null;
    if (cloudPanel && cloudPanel.content.parentElement === $('panel-body') && $('panel').dataset.kind === view.panel && !$('panel').classList.contains('hidden')) return;
    const focused = document.activeElement, key = focused && focused.dataset.uiFocus;
    const cursor = key && focused.selectionStart;
    ui.panel.open(cloudPanel || renderers[view.panel]()); thumbnails();
    if (key) {
      const replacement = $('panel-body').querySelector('[data-ui-focus="' + key + '"]');
      if (replacement) { replacement.focus({ preventScroll: true }); if (typeof cursor === 'number' && replacement.setSelectionRange && replacement.type !== 'range' && replacement.type !== 'color') { try { replacement.setSelectionRange(cursor, cursor); } catch (_) {} } }
    }
  }
  ui.open = function (name, options) {
    if (G.visitSession && G.visitSession.active() && G.visitSession.blocks(name)) { ui.toast('正在串门，先回自己的小屋再装扮吧'); return; } // 串门中不能改自己的小屋
    if (!renderers[name]) return;
    if (name === 'shop' && !options?.fromDecor) view.decorShopReturn = null;
    if (name === 'decor' && options?.theme && data().themes[options.theme]) view.decorTheme = options.theme;
    if (name === 'decor' && options?.roomId != null) {
      if (!decorRoom(options.roomId)) { ui.toast('这个房间已经不在了，请重新选择房间。'); return; }
      G.runtime.activeRoomId = options.roomId;
    }
    if (G.runtime.placing && name !== 'yard') cancelPlacement();
    const changed = view.panel !== name;
    if (changed && view.panel === 'cloudAccount' && ui.cloudAccount) ui.cloudAccount.close();
    if (changed && view.panel === 'neighbors' && ui.neighbors) ui.neighbors.close();
    if (changed && view.panel === 'houseBlueprints' && ui.houseBlueprints) ui.houseBlueprints.close();
    if (changed) G.audio.stopSpeech();
    if (changed && typeof ui.controls?.close === 'function') ui.controls.close(false);
    view.panel = name; view.options = options || {};
    if (changed && !(name === 'shop' && options?.fromDecor)) view.category = 'all';
    G.runtime.mode = name === 'roomLayout' ? 'roomLayout' : name === 'observatory' ? 'observatory' : name === 'decor' ? 'decorate' : name === 'build' ? 'build' : name === 'garden' ? 'garden' : name === 'yard' ? 'yard' : 'explore';
    if (!['decor', 'yard'].includes(name)) { G.runtime.placing = null; G.runtime.selected = null; ui.selection(); }
    renderCurrent();
    if (changed) {
      $('panel-body').scrollTop = 0;
      if (window.matchMedia && window.matchMedia('(max-width: 600px)').matches && window.scrollTo) window.scrollTo({ top: 0, behavior: 'auto' });
    }
    updateHint();
    // 只确定要装饰哪间房，不再跟着切到它的楼层：默认保持“整屋”，用户自己在房间下拉里换房时才会定位到那层（见 focusDecorRoom 的调用处）。
    if (name === 'decor') activeDecorRoom();
    const observatoryFloor = name === 'observatory' && S().building.floors.find(floor => ['observatory_floor', 'legacy_attic'].includes(floor.id));
    if (observatoryFloor) {
      const observatoryRoom = rooms().find(([, room]) => room.floorId === observatoryFloor.id);
      G.runtime.activeRoomId = observatoryRoom?.[0] || null;
      updateHouseView({ floor: observatoryFloor.id, view: 'cutaway' });
      const epoch = view.archiveEpoch;
      requestAnimationFrame(() => { if (epoch === view.archiveEpoch && view.panel === 'observatory' && !$('panel').classList.contains('hidden') && S().building.floors.some(floor => floor.id === observatoryFloor.id)) G.render.camera?.focusObservatory?.(); });
    }
    if (name === 'garden' && G.render.camera.focusGarden) requestAnimationFrame(() => G.render.camera.focusGarden());
    if (name === 'yard') requestAnimationFrame(() => G.render.camera.focusYard());
    if (changed) {
      const epoch = view.archiveEpoch;
      requestAnimationFrame(() => { if (epoch !== view.archiveEpoch || view.panel !== name || /(?:^|\s)hidden(?:\s|$)/.test($('panel').className)) return; const title = $('panel-title'); title.tabIndex = -1; title.focus({ preventScroll: true }); });
    }
  };
  let lastCoin = null, lastLevel = null, lastExp = null, refreshPending = false;
  ui.refresh = function () {
    if (!S()) return;
    const state = S(), need = G.sys.economy.needExp ? G.sys.economy.needExp(state.level) : 40 + state.level * 20;
    $('house-name').textContent = state.house.name;
    $('level-label').textContent = '小屋 ' + state.level + ' 级';
    $('xp-fill').style.width = '100%'; $('xp-fill').style.transform = 'scaleX(' + Math.min(1, state.exp / need) + ')';
    const experienceTrack = $('xp-fill').parentElement;
    experienceTrack.setAttribute('role', 'progressbar'); experienceTrack.setAttribute('aria-valuemin', '0'); experienceTrack.setAttribute('aria-valuemax', String(need)); experienceTrack.setAttribute('aria-valuenow', String(state.exp)); experienceTrack.setAttribute('aria-label', '小屋升级经验');
    $('xp-label').textContent = state.exp + '/' + need;
    $('coin-count').textContent = num(state.wallet.coin); $('heart-count').textContent = num(state.wallet.heart);
    if (lastCoin !== null && state.wallet.coin > lastCoin) { const node = $('coin-count'); node.classList.remove('coin-gain'); void node.offsetWidth; node.classList.add('coin-gain'); setTimeout(() => node.classList.remove('coin-gain'), 900); }
    if (lastLevel !== null && state.level > lastLevel) { ui.toast('🌈 升到' + state.level + '级啦！更多小屋惊喜在等你。'); }
    lastCoin = state.wallet.coin; lastLevel = state.level; lastExp = state.exp;
    $('save-status').textContent = G.save.status || '自动存档';
    const muted = state.settings.music <= 0 && state.settings.sfx <= 0;
    $('sound-toggle').textContent = muted ? '🔇' : '🔊'; $('sound-toggle').setAttribute('aria-label', muted ? '打开声音' : '关闭声音');
    const pending = G.sys.quests.list().filter(q => q.done && !q.claimed && !q.locked).length + (G.sys.achievements ? G.sys.achievements.summary().ready || 0 : 0) + (G.sys.quests.dailyChest && G.sys.quests.dailyChest().available ? 1 : 0);
    $('quest-button').querySelector('span').textContent = '任务' + (pending ? ' ' + pending : '');
    $('quest-button').dataset.pending = pending > 0 ? String(pending) : '';
    $('quest-button').classList.toggle('has-reward', pending > 0);
    $('quest-button').setAttribute('aria-label', '查看小屋心愿与任务' + (pending ? '，有' + pending + '份奖励可领取' : ''));
    const selectionFocused = $('selection-tools').contains(document.activeElement) && document.activeElement.dataset.cuteControl;
    if (!ui.controls.isInteracting($('selection-tools')) && !selectionFocused) ui.selection();
    updateHint();
    syncWorldHouseNav();
    // 自定义弹层与表单编辑时保留控件及焦点，不因自动存档重建。
    const active = document.activeElement;
    const editing = ui.controls.isInteracting($('panel-body')) || ($('panel-body').contains(active) && (['INPUT', 'SELECT', 'TEXTAREA'].includes(active.tagName) || active.dataset.cuteControl));
    if (!editing) renderCurrent();
    if (ui.visualShell) ui.visualShell.refresh();
  };
  function queueRefresh() {
    if (refreshPending) return; refreshPending = true;
    requestAnimationFrame(() => { refreshPending = false; advanceGuide(); ui.refresh(); });
  }

  // 音频独立管理调度、声线和资源释放，UI只发出操作意图。
  ui.audio = G.audio;
  ui.init = function () {
    G.audio.init();
    if (!G.runtime.reviewMode) {
      if (ui.cloudAccount) ui.cloudAccount.init();
      if (ui.neighbors) ui.neighbors.init();
      if (ui.seaMap) ui.seaMap.init();
      if (ui.reception) ui.reception.init();
    }
    if (ui.harvestFeedback) ui.harvestFeedback.init();
    const houseNavHost = $('house-view-controls') || $('home-paper') || $('world');
    if (houseNavHost && houseNavHost.append && !worldHouseNav) {
      worldHouseNav = houseNavigation('house-nav-world');
      houseNavHost.append(worldHouseNav);
    }
    if (ui.visualShell) ui.visualShell.init();
    G.bus.on('house:view', () => {
      syncWorldHouseNav();
      if (view.panel === 'build' || view.panel === 'decor') renderCurrent();
    });
    $('panel-close').addEventListener('click', () => ui.panel.close());
    const paperClose = $('home-paper-close'), paperToggle = $('home-paper-toggle'), appRoot = $('app');
    function closeHomePaper() {
      if (!appRoot) return;
      appRoot.classList.remove('home-paper-open');
      if ($('panel')?.classList.contains('hidden')) {
        appRoot.classList.remove('has-open-panel');
      }
      if (ui.visualShell?.scheduleLayout) ui.visualShell.scheduleLayout();
      ui.toast('已收起面板，点击右上方小胶囊可重新展开～');
    }
    function openHomePaper() {
      if (!appRoot) return;
      ui.panel.close();
      appRoot.classList.add('home-paper-open');
      appRoot.classList.add('has-open-panel');
      if (ui.visualShell?.scheduleLayout) ui.visualShell.scheduleLayout();
    }
    if (paperClose) paperClose.addEventListener('click', closeHomePaper);
    if (paperToggle) paperToggle.addEventListener('click', openHomePaper);
    document.querySelectorAll('[data-panel]').forEach(node => node.addEventListener('click', () => {
      if (node.dataset.panel === 'decor' && ui.houseBlueprints) { if (view.panel === 'houseBlueprints') ui.panel.close(); else ui.houseBlueprints.open(); }
      else if (view.panel === node.dataset.panel) ui.panel.close();
      else if (node.dataset.panel === 'neighbors' && ui.neighbors) ui.neighbors.open();
      else ui.open(node.dataset.panel);
    }));
    $('settings-button').addEventListener('click', () => ui.open('settings'));
    $('house-name').addEventListener('click', () => renameHouse(false));
    $('quest-button').addEventListener('click', () => ui.open('quests'));
    $('guide-button').addEventListener('click', () => ui.open('help'));
    $('zoom-in').addEventListener('click', () => G.render.camera.zoom(1.2));
    $('zoom-out').addEventListener('click', () => G.render.camera.zoom(1 / 1.2));
    const turnView = $('camera-orbit');
    if (turnView) turnView.addEventListener('click', () => {
      const mode = cameraInteractionMode(); if (mode === null) return;
      G.render.camera.setInteractionMode(mode === 'orbit' ? 'pan' : 'orbit');
      syncCameraInteraction();
    });
    const restoreView = $('zoom-fit');
    restoreView.setAttribute('aria-label', '恢复家园视角');
    restoreView.setAttribute('title', '恢复家园视角');
    restoreView.addEventListener('click', () => {
      const camera = G.render.camera;
      if (cameraInteractionMode() !== null) camera.setInteractionMode('pan');
      if (typeof camera.resetView === 'function') camera.resetView();
      else camera.fit();
      ui.selection();
      syncCameraInteraction();
    });
    G.bus.on('camera:interaction', syncCameraInteraction);
    syncCameraInteraction();
    $('zoom-yard').addEventListener('click', () => G.render.camera.focusYard());
    $('zoom-sea').addEventListener('click', () => G.render.camera.focusSea());
    $('sound-toggle').addEventListener('click', () => G.audio.toggleMute());
    const unlockAudio = () => {
      ui.audio.unlock().then(running => {
        if (running) {
          ['touchstart', 'touchend', 'click', 'pointerdown', 'keydown'].forEach(evt => {
            document.removeEventListener(evt, unlockAudio, true);
          });
        }
      });
    };
    ['touchstart', 'touchend', 'click', 'pointerdown', 'keydown'].forEach(evt => {
      document.addEventListener(evt, unlockAudio, { passive: true, capture: true });
    });
    document.addEventListener('click', e => { if (e.target.closest('button') && !e.target.closest('.hold-button,[data-speech-key]')) ui.audio.play('click'); });
    document.addEventListener('keydown', e => {
      if (view.modal || ui.controls.isOpen()) return;
      const typing = e.target.closest('input, textarea, select, [contenteditable]');
      if (e.key === 'Escape') { if (G.runtime.placing || G.runtime.selected) { G.runtime.selected = null; cancelPlacement(); renderCurrent(); } else ui.panel.close(); }
      if (!typing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); doAction(G.buildingEditor.undo({ redo: e.shiftKey }), e.shiftKey ? '已重做上一步' : '已撤销上一步'); }
    });
    G.bus.on('state:change', queueRefresh);
    G.bus.on('state:replace', () => {
      view.archiveEpoch++; view.dragPreparing = false; view.options = {}; view.decorSearch = ''; view.search = ''; view.category = 'all'; view.theme = 'all'; view.decorTheme = 'all'; view.decorCategory = 'all'; view.decorRoomSwitchOpen = false; view.decorMoreOpen = false; view.decorShopReturn = null; view.decorPage = 0; view.shopPage = 0;
      G.runtime.selected = null; G.runtime.activeRoomId = null; cancelPlacement();
      if (view.panel === 'decor' || view.panel === 'shop') { ui.panel.close(); $('panel-body').replaceChildren(); }
    });
    G.bus.on('placement:cancelled', () => { view.placementSerial++; ui.selection(); updateHint(); });
    G.bus.on('item:bought', ({ defId }) => { if (!S().tutorial.done && furnDef(defId).template === 'desk_lamp') G.store.update(s => { s.tutorial.seenTips.lampBought = true; }); });
    G.bus.on('speech:change', event => {
      view.speech = event;
      document.querySelectorAll('[data-speech-key]').forEach(syncSpeechButton);
    });
    if (window.speechSynthesis && window.speechSynthesis.addEventListener) window.speechSynthesis.addEventListener('voiceschanged', () => { if (view.panel === 'settings') ui.refresh(); });
    G.bus.on('save:status', () => { $('save-status').textContent = G.save.status || '自动存档'; });
    G.bus.on('time:change', () => { updateWeather(); queueRefresh(); });
    G.bus.on('scene:empty', options => ui.open('build', options));
    G.bus.on('scene:room-layout', ({ roomId }) => ui.open('roomLayout', { roomId }));
    G.bus.on('crafting:place_requested', ({ itemId }) => placeCraft(itemId));
    G.bus.on('crafting:gift_requested', ({ itemId }) => chooseGiftRecipient(itemId));
    G.bus.on('resident:invite_requested', ({ id }) => inviteResident(id));
    G.bus.on('scene:observatory', () => ui.open('observatory'));
    G.bus.on('scene:garden', ({ index }) => ui.garden.openPlot(index));
    G.bus.on('scene:player', () => { ui.toast('今天也想穿上喜欢的颜色！'); ui.open('avatar'); });
    G.bus.on('yard:selected', ({ uid }) => { G.runtime.selected = { yard: true, uid, roomId: null }; ui.selection(); });
    G.bus.on('scene:room', ({ roomId }) => {
      if (isAttic(roomId)) { if (decorRoom(roomId)) { G.runtime.selected = null; ui.open('decor', { roomId }); } else ui.open('observatory'); return; }
      G.runtime.activeRoomId = roomId; G.runtime.selected = null; ui.selection(); if (view.panel === 'decor' || view.panel === 'build') renderCurrent(); else roomMenu(roomId);
    });
    G.bus.on('scene:item', selection => { G.runtime.activeRoomId = selection.roomId; G.runtime.selected = selection; ui.selection(); });
    G.bus.on('scene:deselect', () => { ui.selection(); updateHint(); });
    G.bus.on('scene:resident', ({ id }) => { ui.open('residents'); chat(id); });
    G.bus.on('scene:placed', () => { G.runtime.placing = null; ui.refresh(); });
    if (!ui.visualShell && window.ResizeObserver) {
      const panelObserver = new ResizeObserver(() => {
        if (!$('panel').classList.contains('hidden')) G.bus.emit('panel:change', { open: true, height: $('panel').getBoundingClientRect().height });
      });
      panelObserver.observe($('panel'));
      panelObserver.observe($('world'));
    }
    if (new URLSearchParams(location.search).get('debug') === '1') {
      const debugButton = button('🐞', () => { ui.open('settings'); requestAnimationFrame(() => { const tools = document.querySelector('.debug-tools'); if (tools) tools.scrollIntoView({ block: 'start' }); }); }, 'debug-button');
      debugButton.setAttribute('aria-label', '打开开发者工具'); document.body.append(debugButton);
    }
    ui.refresh(); updateWeather();
    if (!G.runtime.reviewMode) {
      if (ui.residentNotices) ui.residentNotices.init(); setTimeout(showWelcome, 350);
      if (ui.calendar) setTimeout(() => ui.calendar.maybeGreet(), 650);
      if (ui.login) setTimeout(() => ui.login.maybePrompt(), 1100);
    }
  };
  function updateWeather() {
    if (!G.sys.time) return;
    const current = G.sys.time.current(), weather = { clear: ['☀', '晴天'], cloudy: ['☁', '多云'], rain: ['🌧', '小雨'], snow: ['❄', '雪花'], sakura: ['🌸', '樱花'], leaves: ['🍂', '落叶'] }[current.weather] || ['☀', '晴天'];
    const icon = document.querySelector('.sun-icon'); if (icon) icon.textContent = current.phase === 'night' && current.weather === 'clear' ? '☾' : weather[0];
    $('island-date').textContent = current.date.slice(5).replace('-', '月') + '日 · ' + weather[1] + (current.rainbow ? ' · 小彩虹' : '');
  }
})();
