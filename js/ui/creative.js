/* 小画室只在操作时重画像素；草稿留在本页运行时，正式作品走存档事务。 */
(function (G) {
  'use strict';
  const ui = G.ui = G.ui || {}, C = G.data.creativeConfig, SIZE = C.size;
  let active = null, modalSerial = 0, archiveEpoch = 0;
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
  const button = (text, action, cls = 'ui-button') => { const node = el('button', cls, text); node.type = 'button'; node.addEventListener('click', event => { if (node.isConnected && !node.disabled) action(event); }); return node; };
  const sys = () => G.sys.creative;
  const drafts = () => G.runtime.creativeDrafts || (G.runtime.creativeDrafts = Object.create(null));
  const draftKey = id => id ? 'art:' + id : 'new';
  const cleanName = value => [...String(value || '').replace(/[\u0000-\u001f\u007f]/g, '')].slice(0, 20).join('');
  function announce(result) { if (result?.message) ui.toast(result.message); G.audio.play(result?.ok ? 'success' : 'soft'); return !!result?.ok; }
  function showModal(title, body, cls, cleanup, inputState) {
    active?.handle.close();
    const serial = ++modalSerial, controller = new AbortController(), frames = new Set();
    // 必须早于公共modal的document capture Escape；不阻止输入法取消候选的默认动作。
    if (inputState) document.addEventListener('keydown', event => {
      if (body.contains(event.target) && event.key === 'Escape' && (inputState() || event.isComposing || event.keyCode === 229)) event.stopImmediatePropagation();
    }, { capture: true, signal: controller.signal });
    const handle = ui.modal({ title, content: body, lockBackdrop: cls === 'creative-editor-card', onClose() {
      controller.abort(); frames.forEach(cancelAnimationFrame); frames.clear(); cleanup?.(); if (active?.serial === serial) active = null;
    } });
    handle.element.classList.add(cls, 'creative-v2');
    active = { serial, handle };
    handle.creativeFrame = callback => { const id = requestAnimationFrame(() => { frames.delete(id); if (active?.serial === serial && handle.element.isConnected) callback(); }); frames.add(id); };
    return handle;
  }
  function clearPictures(node) { node.querySelectorAll('canvas').forEach(canvas => { canvas.width = canvas.height = 1; }); }
  function drawFrame(canvas, art) {
    if (!canvas.isConnected) return;
    const c = canvas.getContext('2d'); if (!c) return;
    c.clearRect(0, 0, canvas.width, canvas.height); G.draw.creative.drawFrame(c, art, 8, 8, canvas.width - 16, canvas.height - 16);
  }
  function roomChoices() {
    return G.contentSpaces.entries().map(([id, room]) => ({ id, name: (G.data.rooms.find(value => value.id === room.type)?.name || '自由空间') + ' · ' + (G.state.building.floors.find(floor => floor.id === room.floorId)?.name || '') }));
  }
  function goBuild(handle) { handle.close(); ui.open('build'); }
  function currentHandle(handle) { return active?.handle === handle && handle.element.isConnected; }
  function paintingLocation(target, artId) {
    if (!target || !sys().get(artId)) return null;
    if (target.uid) {
      const item = G.state.building.furniture.find(value => value.id === target.uid && value.artId === artId);
      return item ? { uid: item.id, floorId: item.floorId } : null;
    }
    const ids = target.wallIds || [];
    const space = target.roomId && G.contentSpaces.get(target.roomId);
    const wall = G.state.building.walls.find(value => value.artId === artId && (ids.length ? ids.includes(value.id) : !space || space.floorId === value.floorId));
    return wall ? { wallId: wall.id, wallIds: [wall.id], floorId: wall.floorId } : null;
  }
  function focusPainting(handle, target, artId, latest) {
    if (!currentHandle(handle)) return false;
    let location;
    try { location = paintingLocation(latest ? sys().placement(artId) : target, artId); } catch (_) { location = null; }
    if (!location) { ui.toast('画作的位置有了变化，请重新打开详情。'); return false; }
    const epoch = archiveEpoch;
    handle.close(); if (epoch !== archiveEpoch) return false;
    ui.panel.close();
    return location.uid ? G.buildingEditor.focusFurniture(location.uid) : G.buildingEditor.focusWall(location.wallId);
  }
  async function download(id, control) {
    const owner = active; if (!owner || control.disabled) return;
    const label = control.textContent; control.disabled = true; control.textContent = '正在准备PNG…'; control.setAttribute('aria-busy', 'true');
    try { const result = await sys().download(id); if (active === owner && control.isConnected && result?.message) ui.toast(result.message); }
    catch (_) { if (active === owner && control.isConnected) ui.toast('画作暂时没有下载成功，请再试一次。'); }
    finally { if (active === owner && control.isConnected) { control.disabled = false; control.textContent = label; control.removeAttribute('aria-busy'); } }
  }
  function showGallery(message) {
    const status = sys().status(), arts = sys().list(), body = el('div', 'creative-gallery'), intro = el('div', 'creative-gallery-intro');
    const freshDraft = drafts().new, create = button(freshDraft ? '继续草稿' : '画一幅', () => showEditor(), 'ui-button ui-button-primary');
    create.disabled = !status.unlocked || arts.length >= C.maxArts;
    const copy = el('div', 'creative-gallery-copy'); copy.append(el('h3', '', '把喜欢，收成一本画册'), el('p', '', '一格一格画下来，再让自己的颜色住进小屋。')); intro.append(copy, create); body.append(intro);
    body.append(el('p', 'creative-capacity', '已保存 ' + arts.length + ' / ' + C.maxArts + ' 幅 · 16×16像素 · 24种颜色'));
    if (message) { const note = el('p', 'creative-form-error', message); note.setAttribute('role', 'alert'); body.append(note); }
    let handle;
    if (!status.unlocked) {
      const locked = el('div', 'creative-unlock'); locked.append(el('strong', '', '给灵感准备一间画室'), el('p', '', status.reason), button('去建画室', () => goBuild(handle), 'ui-button ui-button-soft')); body.append(locked);
      if (arts.length) body.append(el('p', 'creative-note', '已经画好的作品仍在这里，可以查看和下载。重新备好画室后，就能继续编辑与布置。'));
    }
    if (arts.length >= C.maxArts) body.append(el('p', 'creative-capacity-note', C.texts.full));
    if (freshDraft) body.append(el('p', 'creative-draft-note', '有一幅还没收好的草稿留在本页。刷新前记得保存，或先下载JSON备份已存作品。'));
    if (!arts.length) {
      const empty = el('div', 'creative-empty'), book = el('div', 'creative-empty-symbol'); book.setAttribute('aria-hidden', 'true'); book.append(el('span'), el('span')); empty.append(book, el('h3', '', '第一幅画，想画什么？'), el('p', '', '画册还是空的。画一朵今天的云，或给喜欢的小花留个位置。画错了也能撤销。'));
      if (status.unlocked) empty.append(button(freshDraft ? '接着画草稿' : '打开小画板', () => showEditor(), 'ui-button ui-button-primary')); body.append(empty);
    } else {
      const list = el('div', 'creative-art-grid'); list.setAttribute('aria-label', '已经保存的画作');
      arts.slice().reverse().forEach(art => {
        const choose = button('', () => showDetail(art.id), 'creative-art-card'), canvas = el('canvas'); canvas.width = canvas.height = 192; canvas.setAttribute('aria-hidden', 'true');
        const placement = sys().placement(art.id), unsaved = !!drafts()[draftKey(art.id)]; choose.setAttribute('aria-label', '查看画作：' + art.name + (unsaved ? '，有未保存草稿' : ''));
        choose.append(canvas, el('strong', '', art.name), el('span', '', unsaved ? '有未保存草稿' : placement ? '已经挂在小屋里' : '等一个喜欢的位置')); list.append(choose);
      }); body.append(list);
    }
    body.append(el('p', 'creative-note', '作品和挂墙、墙纸记录随JSON存档保存。PNG是512×512透明像素图；草稿只留在当前页面。'));
    handle = showModal('我的小画册', body, 'creative-gallery-card', () => clearPictures(body));
    const ordered = arts.slice().reverse(); body.querySelectorAll('canvas').forEach((canvas, index) => handle.creativeFrame(() => drawFrame(canvas, ordered[index])));
  }
  function showRename(art) {
    let composing = false;
    const body = el('form', 'creative-name-form'), input = el('input', 'ui-input'); input.type = 'text'; input.value = art.name; input.maxLength = 40; input.autofocus = true;
    const count = el('span', 'creative-name-count', [...input.value].length + ' / 20字'), error = el('p', 'creative-form-error'); error.id = 'creative-rename-error'; error.setAttribute('role', 'alert'); input.setAttribute('aria-describedby', error.id);
    input.addEventListener('compositionstart', () => { composing = true; });
    input.addEventListener('input', event => { if (!composing && !event.isComposing) input.value = cleanName(input.value); count.textContent = [...input.value].length + ' / 20字'; error.textContent = ''; input.removeAttribute('aria-invalid'); });
    input.addEventListener('compositionend', () => { composing = false; input.value = cleanName(input.value); count.textContent = [...input.value].length + ' / 20字'; });
    input.addEventListener('keydown', event => { if (event.key === 'Enter' && (composing || event.isComposing || event.keyCode === 229)) event.preventDefault(); });
    body.append(ui.controls.label(input, '画作的小名字'), count, error);
    const actions = el('div', 'creative-actions'); actions.append(button('返回画作', () => showDetail(art.id)), button('收好名字', () => body.requestSubmit(), 'ui-button ui-button-primary')); body.append(actions);
    body.addEventListener('submit', event => {
      event.preventDefault(); if (composing || !body.isConnected) return; const result = sys().rename(art.id, input.value.trim());
      if (announce(result)) { const draft = drafts()[draftKey(art.id)]; if (draft) draft.name = result.art.name; showDetail(art.id); }
      else { error.textContent = result.message; input.setAttribute('aria-invalid', 'true'); input.focus(); }
    }); showModal('给画作改名', body, 'creative-name-card', null, () => composing);
  }
  function showDetail(id) {
    const art = sys().get(id); if (!art) { showGallery('这幅画暂时找不到了，可以在画册里重新选择。'); return; }
    const status = sys().status(), body = el('div', 'creative-detail'), picture = el('canvas', 'creative-detail-art'); picture.width = picture.height = 320; picture.setAttribute('role', 'img'); picture.setAttribute('aria-label', '装框的画作：' + art.name);
    const info = el('div', 'creative-detail-info'), placement = sys().placement(id), rooms = roomChoices();
    info.append(el('h3', 'creative-detail-name', art.name), el('p', 'creative-capacity', '已保存作品 · 16×16像素'), el('p', 'creative-note', '编辑同一幅作品，墙上的挂画和自制墙纸会一起更新。'));
    const actions = el('div', 'creative-actions'), edit = button(drafts()[draftKey(id)] ? '继续编辑草稿' : '编辑画作', () => showEditor(id), 'ui-button ui-button-primary'); edit.disabled = !status.unlocked;
    const savePng = button('下载PNG', () => download(id, savePng)); actions.append(edit, savePng); info.append(actions);
    if (!status.unlocked) info.append(el('p', 'creative-note', status.reason));
    let handle;
    if (placement) info.append(button('看看墙上这幅', () => focusPainting(handle, null, id, true), 'ui-button ui-button-soft'));
    if (rooms.length && status.unlocked) {
      const roomId = rooms.some(room => room.id === G.runtime.activeRoomId) ? G.runtime.activeRoomId : rooms[0].id, picker = ui.controls.select(rooms, roomId);
      picker.dataset.uiFocus = 'creative-room'; info.append(ui.controls.label(picker, '选一间房或阁楼来布置'));
      const arrange = el('div', 'creative-actions');
      const hang = button(placement ? '这幅已挂好了' : '装框挂墙', () => { const result = sys().place(id, picker.value); if (!currentHandle(handle)) return; if (announce(result) && focusPainting(handle, result, id)) ui.toast('挂好啦！可以直接拖动画框，挪到喜欢的位置。'); }, 'ui-button ui-button-soft'); hang.disabled = !!placement;
      arrange.append(hang, button('铺成墙纸', () => { const result = sys().wallpaper(picker.value, id); if (!currentHandle(handle)) return; if (announce(result)) focusPainting(handle, result, id); }, 'ui-button ui-button-soft')); info.append(arrange);
    }
    const manage = el('div', 'creative-actions creative-manage-actions'), rename = button('改名字', () => showRename(art)); rename.disabled = !status.unlocked;
    manage.append(rename, button('删除作品', () => showDelete(id), 'ui-button ui-button-danger')); info.append(manage, button('返回画册', () => showGallery())); body.append(picture, info);
    handle = showModal('画作与布置', body, 'creative-detail-card', () => clearPictures(body)); handle.creativeFrame(() => drawFrame(picture, art));
  }
  function showDelete(id) {
    const art = sys().get(id); if (!art) { showGallery('这幅画暂时找不到了。'); return; }
    const body = el('div', 'creative-delete'), error = el('p', 'creative-form-error'); error.setAttribute('role', 'alert');
    body.append(el('h3', '', '要移走「' + art.name + '」吗？'), el('p', 'creative-note', '这会删除原画，同时移走它的挂画。使用它的墙纸会恢复纯色，保留原来的底色。删除后不能恢复，想留念可以先返回下载PNG。'), error);
    const actions = el('div', 'creative-actions'); actions.append(button('保留作品', () => showDetail(id)), button('确认删除作品', () => {
      const result = sys().remove(id); if (result.ok) { delete drafts()[draftKey(id)]; announce(result); showGallery(); }
      else { error.textContent = result.message || '这次没有删除成功，作品还在，请再试一次。'; G.audio.play('soft'); }
    }, 'ui-button ui-button-danger')); body.append(actions); showModal('删除这幅作品？', body, 'creative-name-card');
  }
  function showEditor(id) {
    active?.handle.close();
    if (!sys().status().unlocked) { showGallery(); return; }
    const initial = id ? sys().get(id) : null; if (id && !initial) { showGallery('这幅画暂时找不到了，可以重新选择。'); return; }
    if (!id && sys().list().length >= C.maxArts) { showGallery(C.texts.full); return; }
    const key = draftKey(id), held = drafts()[key], fallbackName = C.defaultName + (sys().list().length + 1);
    let artId = id, pixels = (held?.pixels || initial?.pixels || '.'.repeat(SIZE * SIZE)).split(''), name = held?.name ?? initial?.name ?? fallbackName;
    let savedPixels = initial?.pixels || '.'.repeat(SIZE * SIZE), savedName = initial?.name || fallbackName, tool = 'brush', color = C.symbols[9], cursor = { x: held?.x || 0, y: held?.y || 0 };
    let closed = false, composing = false, paintFrame = 0, activePointer = null, lastPoint = null, strokeBefore = null, strokeTool = null, strokeColor = null, lastDirty = false, resizeObserver = null, handle;
    const history = [], future = [], controller = new AbortController();
    const listen = (node, event, callback, options = {}) => node.addEventListener(event, callback, Object.assign({ signal: controller.signal }, options));
    const body = el('div', 'creative-editor'), layout = el('div', 'creative-editor-layout'), workspace = el('div', 'creative-workspace'), stage = el('div', 'creative-canvas-stage'), surface = el('div', 'creative-canvas-surface');
    const canvas = el('canvas', 'creative-pixel-canvas'); canvas.width = canvas.height = 512; canvas.tabIndex = 0; canvas.setAttribute('role', 'application'); canvas.setAttribute('aria-label', '16×16像素画板'); canvas.setAttribute('aria-describedby', 'creative-cursor-status creative-keyboard-help');
    const coordinates = el('p', 'creative-cursor-status'); coordinates.id = 'creative-cursor-status'; coordinates.setAttribute('role', 'status'); coordinates.setAttribute('aria-live', 'polite');
    const help = el('p', 'creative-keyboard-help', '方向键选格 · 空格/Enter落笔 · B画笔 E橡皮 F填充 · Delete擦格 · Ctrl/⌘＋Z撤销，Shift＋Z或Y重做'); help.id = 'creative-keyboard-help';
    surface.append(canvas); stage.append(surface); workspace.append(stage, coordinates);
    const meta = el('div', 'creative-editor-meta'), draftState = el('strong', 'creative-draft-state'), capacity = el('span', 'creative-capacity'); meta.append(draftState, capacity); body.append(meta);
    const controls = el('section', 'creative-editor-controls'); controls.setAttribute('aria-label', '画板工具与颜色');
    const nameInput = el('input', 'ui-input creative-name-input'); nameInput.type = 'text'; nameInput.value = name; nameInput.maxLength = 40;
    const nameCount = el('span', 'creative-name-count', [...name].length + ' / 20字'); controls.append(ui.controls.label(nameInput, '画作的小名字'), nameCount);
    const tools = el('div', 'creative-tool-row'); tools.setAttribute('role', 'group'); tools.setAttribute('aria-label', '绘画工具');
    const toolButtons = [];
    [['brush', '画笔 B'], ['eraser', '橡皮 E'], ['fill', '填充 F']].forEach(([value, label]) => { const choose = button(label, () => { commitPending(); tool = value; updateControls(); }, 'ui-button creative-tool'); choose.dataset.creativeTool = value; toolButtons.push(choose); tools.append(choose); }); controls.append(tools);
    const actions = el('div', 'creative-history-row');
    const undo = button('撤销', () => travel(false), 'ui-button ui-button-soft'), redo = button('重做', () => travel(true), 'ui-button ui-button-soft'), clear = button('清空画布', () => { commitPending(); const before = pixels.join(''); pixels.fill('.'); remember(before); report('画布清空了，可以点「撤销」找回来。'); }, 'ui-button'); actions.append(undo, redo, clear);
    const historyStatus = el('p', 'creative-history-status'); historyStatus.setAttribute('aria-live', 'polite');
    const paletteLabel = el('p', 'creative-palette-label', '挑一种喜欢的颜色'), palette = el('div', 'creative-palette'); palette.setAttribute('role', 'group'); palette.setAttribute('aria-label', '24色调色盘'); const colors = [];
    C.palette.forEach((paint, index) => {
      const label = C.paletteNames?.[index] || '第' + (index + 1) + '色 ' + paint, choose = button('', () => { commitPending(); color = C.symbols[index]; if (tool === 'eraser') tool = 'brush'; updateControls(); }, 'creative-color');
      choose.style.setProperty('--creative-color', paint); choose.setAttribute('aria-label', '选择画笔颜色：' + label); choose.title = label; choose.dataset.creativeColor = C.symbols[index]; const mark = el('span', '', '✓'); mark.setAttribute('aria-hidden', 'true'); choose.append(mark); colors.push(choose); palette.append(choose);
    }); controls.append(paletteLabel, palette);
    const currentColor = el('p', 'creative-color-status'); controls.append(currentColor, actions, historyStatus);
    const preview = el('canvas', 'creative-frame-preview'); preview.width = preview.height = 144; preview.setAttribute('role', 'img'); preview.setAttribute('aria-label', '装框预览');
    const previewWrap = el('div', 'creative-preview-row'); previewWrap.append(preview, el('p', 'creative-note', '装框效果预览。雪白是颜色，橡皮才会擦回透明。保存后可以挂墙或铺成墙纸。')); controls.append(previewWrap);
    const shortcuts = el('details', 'creative-keyboard-guide'); shortcuts.append(el('summary', '', '键盘画画的办法'), help); controls.append(shortcuts);
    layout.append(workspace, controls); body.append(layout);
    const footer = el('div', 'creative-editor-footer'), status = el('p', 'creative-editor-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const footerActions = el('div', 'creative-editor-actions'), back = button('返回画册', () => { commitPending(); handle.close(); showGallery(); }), arrange = button('布置这幅画', () => { commitPending(); if (artId && !dirty()) { handle.close(); showDetail(artId); } }, 'ui-button ui-button-soft'), save = button(artId ? '保存修改' : '保存画作', saveArt, 'ui-button ui-button-primary');
    const savedDownload = button('下载已存PNG', () => download(artId, savedDownload)), downloadNote = el('p', 'creative-download-note'); controls.append(savedDownload, downloadNote);
    footerActions.append(back, arrange, save); footer.append(status, footerActions); body.append(footer);
    function dirty() { return pixels.join('') !== savedPixels || nameInput.value.trim() !== savedName; }
    function report(message, error = false) { status.textContent = message; status.classList.toggle('is-error', error); }
    function updateControls() {
      toolButtons.forEach(control => { const selected = control.dataset.creativeTool === tool; control.classList.toggle('is-active', selected); control.setAttribute('aria-pressed', String(selected)); });
      colors.forEach(control => { const selected = control.dataset.creativeColor === color; control.classList.toggle('is-active', selected); control.setAttribute('aria-pressed', String(selected)); });
      const colorIndex = C.symbols.indexOf(color), colorName = C.paletteNames?.[colorIndex] || '第' + (colorIndex + 1) + '色'; currentColor.textContent = (tool === 'eraser' ? '橡皮：擦回透明格' : (tool === 'fill' ? '填充颜色：' : '画笔颜色：') + colorName);
      undo.disabled = !history.length; redo.disabled = !future.length; clear.disabled = pixels.every(value => value === '.'); historyStatus.textContent = '可撤销 ' + history.length + ' / ' + C.maxUndo + ' 步 · 可重做 ' + future.length + ' 步'; arrange.disabled = !artId || dirty();
      save.disabled = composing; if (!savedDownload.hasAttribute('aria-busy')) savedDownload.disabled = !artId;
      draftState.textContent = dirty() ? '未保存草稿' : artId ? '已保存' : '新画布';
      draftState.classList.toggle('is-unsaved', dirty()); capacity.textContent = '画册 ' + sys().status().count + ' / ' + C.maxArts + ' 幅';
      downloadNote.textContent = artId ? '下载已保存的「' + savedName + '」。' + (dirty() ? '当前草稿不含在PNG里。' : '512×512，保留透明背景。') : '先保存画作，再下载透明PNG。';
      const changed = dirty(); if (changed !== lastDirty) { lastDirty = changed; report(changed ? '有未保存的颜色。草稿暂留本页，刷新前记得保存。' : artId ? '已经保存，可以返回画册布置。' : '先画下喜欢的颜色，再给它起个名字吧。'); }
      coordinates.textContent = '第' + (cursor.x + 1) + '列，第' + (cursor.y + 1) + '行 · ' + (pixels[cursor.y * SIZE + cursor.x] === '.' ? '透明格' : '已经有颜色');
    }
    function schedulePaint() { if (!closed && !paintFrame) paintFrame = requestAnimationFrame(paint); }
    function fitCanvas() {
      if (closed || !stage.isConnected) return;
      // 画架托沿预留20px；以真实工作区宽高约束正方形，桌面矮窗口不挤压底栏。
      const side = Math.max(1, Math.floor(Math.min(stage.clientWidth - 4, stage.clientHeight - 20, C.exportSize)));
      surface.style.setProperty('--creative-canvas-size', side + 'px');
    }
    function paint() {
      paintFrame = 0; if (closed) return;
      const c = canvas.getContext('2d'), cell = canvas.width / SIZE; c.clearRect(0, 0, canvas.width, canvas.height);
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) { c.fillStyle = (x + y) % 2 ? '#F1E9DC' : '#FFFCF3'; c.fillRect(x * cell, y * cell, cell, cell); }
      G.draw.creative.drawPixels(c, pixels.join(''), 0, 0, canvas.width, canvas.height);
      c.strokeStyle = '#AA8D8455'; c.lineWidth = 1; c.beginPath(); for (let i = 1; i < SIZE; i++) { c.moveTo(i * cell + .5, 0); c.lineTo(i * cell + .5, canvas.height); c.moveTo(0, i * cell + .5); c.lineTo(canvas.width, i * cell + .5); } c.stroke();
      c.strokeStyle = '#FFFDF5'; c.lineWidth = 5; c.strokeRect(cursor.x * cell + 3, cursor.y * cell + 3, cell - 6, cell - 6); c.strokeStyle = '#795366'; c.lineWidth = 2; c.strokeRect(cursor.x * cell + 3, cursor.y * cell + 3, cell - 6, cell - 6);
      const p = preview.getContext('2d'); p.clearRect(0, 0, preview.width, preview.height); G.draw.creative.drawFrame(p, { pixels: pixels.join('') }, 4, 4, preview.width - 8, preview.height - 8); updateControls();
    }
    function remember(before) {
      if (before === pixels.join('')) { updateControls(); return; }
      history.push(before); if (history.length > C.maxUndo) history.shift(); future.length = 0; updateControls(); schedulePaint();
    }
    function commitPending() {
      if (strokeBefore !== null) { const before = strokeBefore; strokeBefore = null; remember(before); }
      const pointer = activePointer; activePointer = null; lastPoint = null; strokeTool = strokeColor = null;
      if (pointer !== null && canvas.hasPointerCapture?.(pointer)) canvas.releasePointerCapture(pointer);
    }
    function travel(forwards) {
      commitPending(); const source = forwards ? future : history, target = forwards ? history : future; if (!source.length) return;
      target.push(pixels.join('')); pixels = source.pop().split(''); updateControls(); schedulePaint(); report(forwards ? '这一步又回来了。' : '回到上一步啦。');
    }
    function line(from, to) {
      let x = from.x, y = from.y, error = Math.abs(to.x - x) - Math.abs(to.y - y); const dx = Math.abs(to.x - x), dy = Math.abs(to.y - y), sx = x < to.x ? 1 : -1, sy = y < to.y ? 1 : -1;
      while (true) { pixels[y * SIZE + x] = (strokeTool || tool) === 'eraser' ? '.' : (strokeColor || color); if (x === to.x && y === to.y) break; const twice = error * 2; if (twice > -dy) { error -= dy; x += sx; } if (twice < dx) { error += dx; y += sy; } }
    }
    function fill(at) {
      const before = pixels.join(''), target = pixels[at.y * SIZE + at.x], replacement = color; if (target === replacement) return;
      const waiting = [at.y * SIZE + at.x]; pixels[waiting[0]] = replacement;
      while (waiting.length) { const index = waiting.pop(), x = index % SIZE, y = Math.floor(index / SIZE); for (const next of [x > 0 ? index - 1 : -1, x + 1 < SIZE ? index + 1 : -1, y > 0 ? index - SIZE : -1, y + 1 < SIZE ? index + SIZE : -1]) { if (next >= 0 && pixels[next] === target) { pixels[next] = replacement; waiting.push(next); } } }
      remember(before);
    }
    function point(event) { const box = canvas.getBoundingClientRect(); return { x: Math.max(0, Math.min(SIZE - 1, Math.floor((event.clientX - box.left) / box.width * SIZE))), y: Math.max(0, Math.min(SIZE - 1, Math.floor((event.clientY - box.top) / box.height * SIZE))) }; }
    listen(canvas, 'pointerdown', event => {
      if (activePointer !== null || event.button !== 0 || composing) return; event.preventDefault(); canvas.focus({ preventScroll: true }); cursor = point(event);
      activePointer = event.pointerId; canvas.setPointerCapture(event.pointerId); strokeTool = tool; strokeColor = color;
      if (tool === 'fill') { fill(cursor); schedulePaint(); return; }
      strokeBefore = pixels.join(''); lastPoint = cursor; line(cursor, cursor); updateControls(); schedulePaint();
    });
    listen(canvas, 'pointermove', event => { if (activePointer !== event.pointerId || strokeTool === 'fill') return; event.preventDefault(); cursor = point(event); line(lastPoint, cursor); lastPoint = cursor; updateControls(); schedulePaint(); });
    const endPointer = event => { if (activePointer === event.pointerId) commitPending(); }; listen(canvas, 'pointerup', endPointer); listen(canvas, 'pointercancel', endPointer); listen(canvas, 'lostpointercapture', endPointer);
    listen(canvas, 'keydown', event => {
      if (event.target !== canvas || composing || event.isComposing || event.keyCode === 229) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); travel(event.shiftKey); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); travel(true); return; }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (directions[event.key]) { event.preventDefault(); commitPending(); const delta = directions[event.key]; cursor.x = Math.max(0, Math.min(SIZE - 1, cursor.x + delta[0])); cursor.y = Math.max(0, Math.min(SIZE - 1, cursor.y + delta[1])); updateControls(); schedulePaint(); }
      else if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); commitPending(); const before = pixels.join(''); if (tool === 'fill') fill(cursor); else { line(cursor, cursor); remember(before); } schedulePaint(); }
      else if (['b', 'e', 'f'].includes(event.key.toLowerCase())) { event.preventDefault(); commitPending(); tool = { b: 'brush', e: 'eraser', f: 'fill' }[event.key.toLowerCase()]; updateControls(); }
      else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); commitPending(); const before = pixels.join(''); pixels[cursor.y * SIZE + cursor.x] = '.'; remember(before); schedulePaint(); }
    });
    function updateName() { nameInput.value = cleanName(nameInput.value); name = nameInput.value; nameCount.textContent = [...name].length + ' / 20字'; nameInput.removeAttribute('aria-invalid'); updateControls(); }
    listen(nameInput, 'compositionstart', () => { composing = true; updateControls(); });
    listen(nameInput, 'input', event => { if (!composing && !event.isComposing) updateName(); });
    listen(nameInput, 'compositionend', () => { composing = false; updateName(); });
    function saveArt() {
      if (closed || composing) return;
      commitPending(); const result = sys().save({ ...(artId ? { id: artId } : {}), name: nameInput.value.trim(), pixels: pixels.join('') });
      if (result.ok) { delete drafts()[key]; if (artId) delete drafts()[draftKey(artId)]; artId = result.art.id; savedPixels = result.art.pixels; savedName = result.art.name; nameInput.value = savedName; nameCount.textContent = [...savedName].length + ' / 20字'; save.textContent = '保存修改'; updateControls(); report(result.message); G.audio.play('success'); }
      else { drafts()[draftKey(artId)] = { id: artId || null, name: nameInput.value, pixels: pixels.join(''), x: cursor.x, y: cursor.y }; report(result.message || '还没保存好，请保留草稿后再试一次。', true); if (!nameInput.value.trim()) { nameInput.setAttribute('aria-invalid', 'true'); nameInput.focus(); } G.audio.play('soft'); }
    }
    handle = showModal(initial ? '给画作添一点颜色' : '糯米的小画板', body, 'creative-editor-card', () => {
      if (closed) return; commitPending();
      if (dirty()) drafts()[draftKey(artId)] = { id: artId || null, name: nameInput.value, pixels: pixels.join(''), x: cursor.x, y: cursor.y };
      else delete drafts()[draftKey(artId)];
      closed = true; controller.abort(); resizeObserver?.disconnect(); if (paintFrame) cancelAnimationFrame(paintFrame); canvas.width = canvas.height = preview.width = preview.height = 1; history.length = future.length = 0;
      document.body.classList.remove('is-creating'); ui.controls.close();
    }, () => composing);
    if (typeof ResizeObserver !== 'undefined') { resizeObserver = new ResizeObserver(fitCanvas); resizeObserver.observe(stage); }
    listen(window, 'resize', fitCanvas); handle.creativeFrame(fitCanvas);
    document.body.classList.add('is-creating'); updateControls(); report(held ? '上次的草稿还在，可以接着画。刷新前记得保存。' : initial ? '正在编辑已存作品，保存后挂画和墙纸会一起更新。' : '先画下喜欢的颜色。草稿只留在本页，刷新前记得保存。'); schedulePaint();
  }
  function open(options = {}) {
    active?.handle.close(); ui.panel.close(); ui.controls.close();
    try { if (options.mode === 'editor') showEditor(options.id); else showGallery(); }
    catch (_) {
      active?.handle.close(); const body = el('div', 'creative-unlock'); body.append(el('strong', '', '画册暂时没能打开'), el('p', '', '作品没有改变。可以重新读取，再试一次。'), button('重新读取画册', () => open())); showModal('我的小画册', body, 'creative-gallery-card');
    }
  }
  G.bus.on('state:replace', () => { archiveEpoch++; active?.handle.close(); active = null; delete G.runtime.creativeDrafts; document.body.classList.remove('is-creating'); });
  ui.creative = { open };
})(window.Game);
