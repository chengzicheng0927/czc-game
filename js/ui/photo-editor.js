/* 一张缓存底图上的相纸工作台：装饰按需合成，不重画世界、不编码预览。 */
(function (G) {
  'use strict';
  const ui = G.ui = G.ui || {}, clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  let activeSession = null;
  const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  function roomOptions() {
    return G.store.decorRooms(G.state).map(([id, room]) => {
      if (id === G.store.atticRoomId) return { id, name: '阁楼天文台 · 独立阁楼' };
      const definition = G.data.rooms.find(value => value.id === room.type);
      let position = '';
      G.state.house.floors.forEach((floor, index) => { const slot = floor.slots.indexOf(id); if (slot >= 0) position = (index + 1) + '楼第' + (slot + 1) + '间'; });
      return { id, name: (definition?.name || '房间') + ' · ' + position };
    });
  }
  function open(options = {}) {
    activeSession?.close(); ui.controls.close();
    const editing = !!options.photo, sys = G.sys.photography, roomChoices = editing ? [] : roomOptions();
    let decor = G.data.validatePhotoDecor(options.photo?.decor || G.data.defaultPhotoDecor());
    let base = null, selectedUid = null, tool = 'frames', scope = 'house', roomId = roomChoices.find(room => room.id === G.runtime.activeRoomId)?.id || roomChoices[0]?.id;
    let handle, closed = false, paintFrame = 0, captureTimer = 0, flashTimer = 0, lastPhotoId = editing ? options.photo.id : null;
    let busy = false, downloading = false, composing = false, pinch = null, drag = null, resizeObserver = null, baseRequest = 0;
    let savedDecor = editing ? JSON.stringify(decor) : null, savedBase = null, savedName = options.photo?.name || '', photoCount = sys.list().length;
    const controller = new AbortController(), pointers = new Map(), framePreviews = [], frameChoices = [], stickerChoices = [], tabButtons = [], panels = {};
    const listen = (node, type, action, extra = {}) => node.addEventListener(type, event => { if (!closed) action(event); }, Object.assign({ signal: controller.signal }, extra));
    function button(text, action, className = 'ui-button') { const node = el('button', className, text); node.type = 'button'; listen(node, 'click', event => { if (!node.disabled) action(event); }); return node; }
    const body = el('div', 'photo-studio photo-editor-v2'), top = el('div', 'photo-studio-top'), layout = el('div', 'photo-studio-layout');
    const draftState = el('strong', 'photo-editor-draft-state'), capacity = el('span', 'photo-editor-capacity'), count = el('p', 'photo-sticker-count');
    const stateLine = el('div', 'photo-editor-state-line'); stateLine.append(draftState, count, capacity);
    const stage = el('div', 'photo-stage'), stageHead = el('div', 'photo-stage-heading'), surface = el('div', 'photo-canvas-surface'), canvas = el('canvas', 'photo-editor-canvas');
    const stageTitle = el('strong', '', editing ? '珍藏相片' : '小屋取景');
    const previewButton = button('纯净预览', () => setPreview(!body.classList.contains('is-preview')), 'ui-button photo-pure-preview'); previewButton.setAttribute('aria-pressed', 'false');
    stageHead.append(stageTitle);
    const stageWell = el('div', 'photo-stage-well');
    canvas.tabIndex = 0; canvas.hidden = true; canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', '相片装饰画布。点选贴纸后可用方向键移动，加减号缩放，Delete拿下。'); canvas.setAttribute('aria-describedby', 'photo-canvas-help');
    const selection = el('div', 'photo-sticker-selection'); selection.hidden = true; selection.setAttribute('aria-hidden', 'true');
    const flash = el('div', 'photo-shutter-flash'); flash.setAttribute('aria-hidden', 'true');
    const stageStatus = el('p', 'photo-stage-status', editing ? '正在展开原来的相片…' : '正在准备取景…'); stageStatus.setAttribute('role', 'status');
    const canvasHelp = el('p', 'photo-canvas-help', '照片里的贴纸可以点选、拖动。相框与配文会一起保存。'); canvasHelp.id = 'photo-canvas-help';
    surface.append(canvas, selection, flash); stageWell.append(surface, stageStatus); stage.append(stageHead, stageWell);
    const previewColumn = el('section', 'photo-preview-column'); previewColumn.append(stage, previewButton, canvasHelp);
    const tools = el('section', 'photo-toolbox'); tools.setAttribute('aria-label', '装饰工具');
    const tabbar = el('div', 'photo-tool-tabs'), content = el('div', 'photo-tool-content');
    const toolDefinitions = [{ id: 'frames', name: '相框' }, { id: 'stickers', name: '贴纸' }, { id: 'caption', name: '配文' }];
    function selectTool(id) { tool = id; syncTools(); content.scrollTop = 0; }
    tabbar.setAttribute('role', 'tablist'); tabbar.setAttribute('aria-label', '照片装饰工具');
    toolDefinitions.forEach((item, index) => {
      const tab = button(item.name, () => selectTool(item.id), 'ui-button photo-tool-tab'); tab.dataset.tool = item.id; tab.setAttribute('role', 'tab'); tab.id = 'photo-tool-tab-' + item.id; tab.setAttribute('aria-controls', 'photo-tool-panel-' + item.id); tabButtons.push(tab); tabbar.append(tab);
      listen(tab, 'keydown', event => { if (event.isComposing) return; let next = event.key === 'Home' ? 0 : event.key === 'End' ? toolDefinitions.length - 1 : event.key === 'ArrowRight' ? (index + 1) % toolDefinitions.length : event.key === 'ArrowLeft' ? (index + toolDefinitions.length - 1) % toolDefinitions.length : -1; if (next < 0) return; event.preventDefault(); selectTool(toolDefinitions[next].id); tabButtons[next].focus(); });
      const panel = el('section', 'photo-tool-panel'); panel.dataset.panel = item.id; panel.id = 'photo-tool-panel-' + item.id; panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', tab.id); panel.setAttribute('aria-label', item.name + '工具'); panels[item.id] = panel; content.append(panel);
    });
    tools.append(tabbar, content); layout.append(previewColumn, tools);
    const status = el('p', 'photo-editor-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const footer = el('div', 'photo-editor-footer'), footerActions = el('div', 'photo-editor-actions');
    const album = button(editing ? '返回相片' : '查看相册', () => { handle.close(); (editing ? options.onSaved : options.onAlbum)?.(); });
    const downloadNote = el('p', 'photo-download-note');
    const download = button('下载已保存照片', async () => {
      if (!lastPhotoId || downloading) return;
      const id = lastPhotoId; downloading = true; syncState(); report('正在准备已保存照片的PNG…');
      try { const result = await sys.download(id); if (!closed) { report(result.message || (result.ok ? '相片已准备下载。' : '下载没有完成，请再试一次。')); if (!result.ok) ui.toast(status.textContent); } }
      catch (error) { if (!closed) report('下载没有完成，请再试一次。已保存照片仍在相册里。'); }
      finally { if (!closed) { downloading = false; syncState(); } }
    });
    const shutter = button(editing ? '保存装饰' : '拍一张', save, 'ui-button ui-button-primary photo-shutter'); shutter.disabled = true;
    const footerCopy = el('div', 'photo-editor-footer-copy'); footerCopy.append(status, downloadNote); footerActions.append(album, download, shutter); footer.append(footerCopy, footerActions);
    // 取景目标只在运行态选择；调用前重新核已建空间，不把失效阁楼换成整屋。
    const missingRoomMessage = '这处空间已经不在这里了。请重新打开取景，选择一个已建好的房间或阁楼。';
    function roomAvailable(id) {
      try { return typeof id === 'string' && roomChoices.some(room => room.id === id) && !!G.store.decorRoom(G.state, id); }
      catch (_) { return false; }
    }
    const scopeGroup = el('div', 'photo-scope-controls');
    if (!editing) {
      const scopeSelect = ui.controls.select([{ id: 'house', name: '整座小屋' }, { id: 'room', name: '指定房间', disabled: !roomChoices.length }], scope, value => { if (closed) return; scope = value; roomField.hidden = value !== 'room'; prepare(false); });
      scopeSelect.dataset.photoScope = 'scope'; scopeSelect.dataset.uiFocus = 'photo-framing-scope';
      scopeGroup.append(ui.controls.label(scopeSelect, '取景'));
      const roomSelect = roomChoices.length ? ui.controls.select(roomChoices, roomId, value => {
        if (closed) return; roomId = value;
        if (!roomAvailable(roomId)) { invalidateBase(missingRoomMessage); return; }
        prepare(false);
      }) : null;
      if (roomSelect) { roomSelect.dataset.photoRoom = 'room'; roomSelect.dataset.uiFocus = 'photo-framing-room'; }
      const roomField = roomSelect ? ui.controls.label(roomSelect, '选择房间') : el('span'); roomField.hidden = true; scopeGroup.append(roomField);
      scopeGroup.append(button('更新取景', () => prepare(true), 'ui-button ui-button-soft'));
    } else {
      const original = el('div', 'photo-original-info'); original.append(el('strong', '', options.photo.name || '这张珍藏'), el('span', '', '保留原底图 · 配文与照片名字分开保存')); scopeGroup.append(original);
      const retry = button('重试打开', loadOriginal, 'ui-button ui-button-soft'); retry.dataset.retryBase = ''; scopeGroup.append(retry);
    }
    top.append(stateLine, scopeGroup); body.append(top, layout, footer);
    function selected() { return decor?.stickers.find(sticker => sticker.uid === selectedUid); }
    function report(message) { if (!closed) status.textContent = message; }
    function isDirty() { return savedDecor !== JSON.stringify(decor) || (!editing && (!base || savedBase !== base)); }
    function syncState() {
      if (closed) return;
      const full = !editing && photoCount >= (sys.maxPhotos || 12), dirty = isDirty();
      shutter.disabled = !base || busy || composing || full;
      shutter.textContent = composing ? '输入完成后保存' : busy ? (editing ? '正在保存…' : '稍等一下…') : editing ? '保存装饰' : '拍一张';
      capacity.textContent = '相册 ' + photoCount + ' / ' + (sys.maxPhotos || 12) + (full ? ' · 已满' : '');
      draftState.textContent = dirty ? '未保存草稿' : editing ? '装饰已保存' : '相片已保存'; draftState.dataset.dirty = String(dirty);
      download.disabled = !lastPhotoId || downloading; download.textContent = downloading ? '正在准备PNG…' : '下载已保存照片';
      downloadNote.textContent = lastPhotoId ? '下载对象：已保存的「' + savedName + '」。' + (dirty ? '不含当前草稿。' : '含已保存的相框、贴纸和配文。') : '拍好后可下载PNG。关闭不会保存当前草稿。';
    }
    function changed() { syncTools(); syncState(); schedulePaint(); }
    function schedulePaint() { if (!closed && base && !paintFrame) paintFrame = requestAnimationFrame(paint); }
    function paint() {
      paintFrame = 0;
      if (closed || !base) return;
      try { G.draw.photoDecoration.draw(canvas, base, decor); stageStatus.hidden = true; canvas.hidden = false; }
      catch (error) { invalidateBase(error.message || '相片暂时没有画好，请重新打开取景。'); }
      updateSelection();
    }
    function updateSelection() {
      const sticker = selected(); selection.hidden = !base || !sticker || body.classList.contains('is-preview');
      if (sticker && base) {
        const box = G.draw.photoDecoration.stickerBox(sticker, canvas.width, canvas.height);
        selection.style.left = box.x / canvas.width * 100 + '%'; selection.style.top = box.y / canvas.height * 100 + '%'; selection.style.width = box.w / canvas.width * 100 + '%'; selection.style.height = box.h / canvas.height * 100 + '%';
      }
      if (sticker) { slider.value = sticker.scale; slider.style.setProperty('--range-progress', (sticker.scale - .4) / 2.6 * 100 + '%'); sizeLabel.textContent = Math.round(sticker.scale * 100) + '%'; }
    }
    function invalidateBase(message) {
      base = null; savedBase = null; cancelAnimationFrame(paintFrame); paintFrame = 0; finishPointers(); framePreviews.length = 0;
      canvas.hidden = true; canvas.width = 1; canvas.height = 1; selection.hidden = true; surface.style.width = '0px'; surface.style.height = '0px'; sys.clearDraft?.();
      stageStatus.textContent = message; stageStatus.hidden = false; syncFramePreviews(); syncState(); report(message);
    }
    function setBase(next) {
      if (!next || !Number.isFinite(next.width) || !Number.isFinite(next.height) || next.width < 1 || next.height < 1) { invalidateBase('底图还没准备好，请再试一次。'); return; }
      base = next; finishPointers();
      const ratio = Math.min(1, 1200 / Math.max(base.width, base.height));
      canvas.width = Math.max(1, Math.round(base.width * ratio)); canvas.height = Math.max(1, Math.round(base.height * ratio));
      surface.style.setProperty('--photo-ratio', canvas.width + ' / ' + canvas.height);
      framePreviews.length = 0; fitSurface(); syncFramePreviews(); syncState(); schedulePaint();
    }
    function fitSurface() {
      if (closed || !base) return;
      const availableWidth = Math.max(1, stageWell.clientWidth - 32), availableHeight = Math.max(1, stageWell.clientHeight - 24);
      const scale = Math.min(availableWidth / canvas.width, availableHeight / canvas.height);
      surface.style.width = Math.max(1, Math.floor(canvas.width * scale)) + 'px'; surface.style.height = Math.max(1, Math.floor(canvas.height * scale)) + 'px';
    }
    function prepare(fresh) {
      if (closed || editing) return;
      try {
        if (scope === 'room' && !roomAvailable(roomId)) { invalidateBase(missingRoomMessage); return; }
        const result = sys.prepare({ scope, roomId: scope === 'room' ? roomId : undefined, fresh: !!fresh });
        if (closed) return;
        if (!result.ok) { invalidateBase(result.message || '取景没有准备好，请点「更新取景」重试。'); return; }
        photoCount = sys.list().length; setBase(result.canvas); if (!base) return;
        stageTitle.textContent = scope === 'room' ? roomChoices.find(room => room.id === roomId)?.name || '房间取景' : '整座小屋';
        report(photoCount >= (sys.maxPhotos || 12) ? '相册已满12张。去相册移出一张，再为新回忆留个位置。' : '取景已准备好。装饰只留在草稿里，拍好才会收进相册。');
      } catch (error) { invalidateBase('取景没有准备好，请点「更新取景」重试。'); }
    }
    async function loadOriginal() {
      if (closed || !editing) return;
      const request = ++baseRequest; invalidateBase('正在展开原来的相片…');
      try {
        const result = await sys.base(options.photo.id); if (closed || request !== baseRequest) return;
        if (result.ok) { setBase(result.canvas); if (base) report('编辑后点「保存装饰」。相片数量和拍照次数都不变。'); }
        else invalidateBase(result.message || '原相片暂时没有展开，请点「重试打开」。');
      } catch (error) { if (!closed && request === baseRequest) invalidateBase('原相片暂时没有展开，请点「重试打开」。'); }
    }
    function setPreview(enabled) {
      finishPointers(); body.classList.toggle('is-preview', enabled); handle.element.classList.toggle('is-photo-preview', enabled);
      previewButton.textContent = enabled ? '继续装饰' : '纯净预览'; previewButton.setAttribute('aria-pressed', String(enabled)); fitSurface(); updateSelection();
    }
    function chooseSticker(uid) { selectedUid = uid; if (uid) tool = 'stickers'; syncTools(); updateSelection(); }
    function removeSticker() {
      if (!selected()) return;
      decor.stickers = decor.stickers.filter(sticker => sticker.uid !== selectedUid); selectedUid = null; finishPointers(); changed(); report('贴纸已拿下。保存前仍是草稿。'); canvas.focus({ preventScroll: true });
    }
    const frameGrid = el('div', 'photo-frame-grid'); panels.frames.append(el('h3', 'photo-tools-title', '给这张照片选一个边框'), el('p', 'photo-tool-help', '8款相框，也可以保留不加框的模样。'), frameGrid);
    G.data.photoFrames.forEach(definition => {
      const choice = button('', () => { decor.frame = definition.id; changed(); }, 'photo-frame-choice'); choice.dataset.frame = definition.id; choice.setAttribute('aria-label', definition.name);
      const sample = el('canvas'); sample.width = 96; sample.height = 72; sample.setAttribute('aria-hidden', 'true');
      const placeholder = el('span', 'photo-frame-placeholder'); placeholder.style.backgroundColor = definition.color;
      choice.append(sample, placeholder, el('span', 'photo-frame-name', definition.name)); frameChoices.push({ choice, sample, placeholder, definition }); frameGrid.append(choice);
    });
    function syncFramePreviews() {
      frameChoices.forEach(({ sample, placeholder, definition }, index) => {
        sample.hidden = !base; placeholder.hidden = !!base;
        if (base && !framePreviews[index]) {
          try { G.draw.photoDecoration.draw(sample, base, { frame: definition.id, caption: '', stickers: [] }); framePreviews[index] = true; }
          catch (error) { sample.hidden = true; placeholder.hidden = false; }
        }
      });
    }
    const selectedTools = el('div', 'photo-selected-tools'), selectedHeading = el('div', 'photo-selected-heading');
    const selectedName = el('strong', 'photo-selected-name'), remove = button('拿下贴纸', removeSticker, 'ui-button ui-button-soft'); selectedHeading.append(selectedName, remove);
    const slider = el('input', 'photo-sticker-range'); slider.type = 'range'; slider.min = '.4'; slider.max = '3'; slider.step = '.05'; slider.dataset.stickerSize = ''; ui.controls.enhanceRange(slider);
    const sizeLabel = el('span'); sizeLabel.dataset.stickerSizeLabel = ''; const rangeHead = el('div', 'photo-range-heading'); rangeHead.append(el('span', '', '选中贴纸大小'), sizeLabel);
    const rangeLabel = ui.controls.label(slider, '调整选中贴纸的大小'); rangeLabel.firstElementChild?.classList.add('photo-sr-only');
    const selectionHint = el('p', 'photo-tool-help', '先添加一张贴纸，或在照片上点选。'), positionLabel = el('p', 'photo-position-label'), moveControls = el('div', 'photo-move-controls');
    moveControls.setAttribute('role', 'group'); moveControls.setAttribute('aria-label', '移动选中的贴纸');
    [[0, -.01, '↑', '上'], [-.01, 0, '←', '左'], [.01, 0, '→', '右'], [0, .01, '↓', '下']].forEach(([dx, dy, symbol, name]) => { const control = button(symbol, () => { const sticker = selected(); if (!sticker) return; sticker.x = clamp(sticker.x + dx, 0, 1); sticker.y = clamp(sticker.y + dy, 0, 1); changed(); }, 'photo-move-button'); control.setAttribute('aria-label', '向' + name + '移动贴纸'); moveControls.append(control); });
    selectedTools.append(selectedHeading, positionLabel, moveControls, rangeHead, rangeLabel, selectionHint);
    listen(slider, 'input', () => { const sticker = selected(), value = Number(slider.value); if (sticker && Number.isFinite(value)) { sticker.scale = clamp(value, .4, 3); changed(); } });
    const palette = el('div', 'photo-sticker-palette');
    G.data.photoStickers.forEach(definition => {
      const add = button('', () => {
        if (decor.stickers.length >= 20) { report('这张相片已有20张贴纸，先拿下一张再添加吧。'); return; }
        const sticker = { uid: G.utils.uid('sticker'), stickerId: definition.id, x: .5, y: .5, scale: 1 };
        decor.stickers.push(sticker); selectedUid = sticker.uid; changed(); report('已添加' + definition.name + '，可以在相片上拖动。'); canvas.focus({ preventScroll: true });
      }, 'photo-sticker-choice'); add.setAttribute('aria-label', '添加贴纸：' + definition.name);
      const emoji = el('span', 'photo-sticker-emoji', definition.emoji); emoji.setAttribute('aria-hidden', 'true'); add.append(emoji, el('span', '', definition.name)); stickerChoices.push(add); palette.append(add);
    });
    const layers = el('div', 'photo-sticker-layers'); layers.setAttribute('role', 'group'); layers.setAttribute('aria-label', '已添加贴纸，选择后可用方向键移动');
    let layerKey = '';
    const paletteHeading = el('div', 'photo-palette-heading'), paletteCount = el('span'); paletteHeading.append(el('strong', '', '贴纸盒'), paletteCount);
    panels.stickers.append(selectedTools, layers, paletteHeading, palette, el('p', 'photo-tool-help photo-sticker-help', '拖动挪位置；滚轮或双指缩放。方向键移动，Shift加快，＋/－缩放，Delete拿下。'));
    const caption = el('input', 'ui-input photo-caption-input'); caption.type = 'text'; caption.value = decor.caption; caption.maxLength = 60; caption.placeholder = '写下今天的小心情'; caption.setAttribute('aria-describedby', 'photo-caption-help photo-caption-count');
    const captionCount = el('span', 'photo-character-count'); captionCount.id = 'photo-caption-count';
    function normalizeCaption() {
      if (closed) return;
      caption.value = [...caption.value.replace(/[\u0000-\u001f\u007f]/g, '')].slice(0, 30).join(''); decor.caption = caption.value; captionCount.textContent = [...decor.caption].length + ' / 30 字'; changed();
    }
    listen(caption, 'compositionstart', () => { composing = true; syncState(); });
    listen(caption, 'input', event => { if (!composing && !event.isComposing) normalizeCaption(); });
    listen(caption, 'compositionend', () => { composing = false; normalizeCaption(); });
    const help = el('p', 'photo-tool-help', '写一行文字，最多30个字，表情也会计数。配文会印在照片下方，跟着照片一起下载。'); help.id = 'photo-caption-help';
    panels.caption.append(el('h3', 'photo-tools-title', '写一句想留下的话'), ui.controls.label(caption, '相片上的一句话'), captionCount, help, button('擦掉文字', () => { if (composing) return; caption.value = ''; normalizeCaption(); caption.focus(); }, 'ui-button ui-button-soft'));
    function syncTools() {
      tabButtons.forEach(tab => { const active = tab.dataset.tool === tool; tab.classList.toggle('is-active', active); tab.setAttribute('aria-pressed', String(active)); tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1; });
      Object.entries(panels).forEach(([id, panel]) => { panel.hidden = id !== tool; });
      frameChoices.forEach(({ choice, definition }) => { const active = decor.frame === definition.id; choice.classList.toggle('is-active', active); choice.setAttribute('aria-pressed', String(active)); });
      const sticker = selected(), definition = sticker && G.data.photoStickers.find(item => item.id === sticker.stickerId);
      count.textContent = '贴纸 ' + decor.stickers.length + ' / 20'; selectedName.textContent = sticker ? '已选：' + definition.name : '还没有选中贴纸';
      const nextLayerKey = decor.stickers.map(item => item.uid).join('|');
      if (layerKey !== nextLayerKey) {
        layers.replaceChildren(); layerKey = nextLayerKey;
        decor.stickers.forEach((item, index) => {
          const def = G.data.photoStickers.find(value => value.id === item.stickerId);
          const layer = button(def.emoji + ' ' + (index + 1), () => { chooseSticker(item.uid); canvas.focus({ preventScroll: true }); }, 'photo-sticker-layer');
          layer.dataset.stickerUid = item.uid; layer.setAttribute('aria-label', '选中第' + (index + 1) + '枚' + def.name + '贴纸'); layers.append(layer);
        });
      }
      layers.hidden = !decor.stickers.length;
      layers.querySelectorAll('[data-sticker-uid]').forEach(layer => { const active = layer.dataset.stickerUid === selectedUid; layer.setAttribute('aria-pressed', String(active)); layer.classList.toggle('is-active', active); });
      positionLabel.hidden = !sticker; moveControls.hidden = !sticker; if (sticker) positionLabel.textContent = '横向 ' + Math.round(sticker.x * 100) + '% · 纵向 ' + Math.round(sticker.y * 100) + '%'; paletteCount.textContent = decor.stickers.length + ' / 20枚';
      remove.disabled = !sticker; slider.disabled = !sticker; rangeHead.hidden = !sticker; rangeLabel.hidden = !sticker; selectionHint.hidden = !!sticker;
      stickerChoices.forEach(choice => { choice.disabled = decor.stickers.length >= 20; }); captionCount.textContent = [...decor.caption].length + ' / 30 字'; updateSelection();
    }
    function point(event) { const rect = canvas.getBoundingClientRect(); return { x: (event.clientX - rect.left) / Math.max(1, rect.width), y: (event.clientY - rect.top) / Math.max(1, rect.height) }; }
    function hit(at) {
      return decor.stickers.slice().reverse().find(sticker => { const box = G.draw.photoDecoration.stickerBox(sticker, canvas.width, canvas.height), x = at.x * canvas.width, y = at.y * canvas.height; return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h; });
    }
    function pair() {
      const points = [...pointers.values()].slice(0, 2), rect = canvas.getBoundingClientRect();
      return { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2, distance: Math.hypot((points[0].x - points[1].x) * rect.width, (points[0].y - points[1].y) * rect.height) };
    }
    function beginPinch() { const sticker = selected(); if (!sticker || pointers.size < 2) return; const position = pair(); pinch = { x: position.x, y: position.y, distance: Math.max(1, position.distance), scale: sticker.scale, sx: sticker.x, sy: sticker.y }; drag = null; }
    function finishPointers() { const ids = [...pointers.keys()]; pointers.clear(); drag = null; pinch = null; ids.forEach(id => { if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id); }); }
    listen(canvas, 'pointerdown', event => {
      if (!base || body.classList.contains('is-preview') || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault(); canvas.focus({ preventScroll: true }); const at = point(event); pointers.set(event.pointerId, at); canvas.setPointerCapture(event.pointerId);
      if (pointers.size === 1) { const sticker = hit(at); chooseSticker(sticker?.uid || null); drag = sticker ? { x: at.x - sticker.x, y: at.y - sticker.y } : null; }
      else beginPinch();
    });
    listen(canvas, 'pointermove', event => {
      if (!pointers.has(event.pointerId)) return; pointers.set(event.pointerId, point(event)); const sticker = selected(); if (!sticker) return;
      if (pointers.size >= 2 && pinch) { const position = pair(); sticker.scale = clamp(pinch.scale * position.distance / pinch.distance, .4, 3); sticker.x = clamp(pinch.sx + position.x - pinch.x, 0, 1); sticker.y = clamp(pinch.sy + position.y - pinch.y, 0, 1); }
      else if (drag) { const at = point(event); sticker.x = clamp(at.x - drag.x, 0, 1); sticker.y = clamp(at.y - drag.y, 0, 1); }
      changed();
    });
    function endPointer(event) {
      if (!pointers.has(event.pointerId)) return;
      pointers.delete(event.pointerId); if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); pinch = null;
      const sticker = selected(), remaining = pointers.values().next().value; drag = sticker && remaining ? { x: remaining.x - sticker.x, y: remaining.y - sticker.y } : null;
      if (pointers.size >= 2) beginPinch();
    }
    listen(canvas, 'pointerup', endPointer); listen(canvas, 'pointercancel', endPointer); listen(canvas, 'lostpointercapture', endPointer);
    listen(canvas, 'wheel', event => { const sticker = selected(); if (!base || !sticker || body.classList.contains('is-preview')) return; event.preventDefault(); sticker.scale = clamp(sticker.scale * Math.exp(-event.deltaY * .0015), .4, 3); changed(); }, { passive: false });
    listen(canvas, 'keydown', event => {
      if (event.target !== canvas || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
      const sticker = selected(); if (!base || !sticker || body.classList.contains('is-preview')) return; const step = event.shiftKey ? .04 : .01;
      if (event.key === 'ArrowLeft') sticker.x = clamp(sticker.x - step, 0, 1);
      else if (event.key === 'ArrowRight') sticker.x = clamp(sticker.x + step, 0, 1);
      else if (event.key === 'ArrowUp') sticker.y = clamp(sticker.y - step, 0, 1);
      else if (event.key === 'ArrowDown') sticker.y = clamp(sticker.y + step, 0, 1);
      else if (['+', '=', 'Add'].includes(event.key)) sticker.scale = clamp(sticker.scale + .1, .4, 3);
      else if (['-', '_', 'Subtract'].includes(event.key)) sticker.scale = clamp(sticker.scale - .1, .4, 3);
      else if (['Delete', 'Backspace'].includes(event.key)) { event.preventDefault(); removeSticker(); return; }
      else return;
      event.preventDefault(); changed();
    });
    function save() {
      if (closed || busy || !base || composing) return;
      if (!editing && scope === 'room' && !roomAvailable(roomId)) { invalidateBase(missingRoomMessage); return; }
      normalizeCaption(); busy = true; syncState(); report(editing ? '正在保存装饰…' : '正在收好这一刻…');
      let result;
      try { result = editing ? sys.updateDecor(options.photo.id, decor) : sys.capture({ decor, scope, roomId: scope === 'room' ? roomId : undefined }); }
      catch (error) { result = { ok: false, message: '相片没有保存，草稿还在，请再试一次。' }; }
      if (closed) return;
      photoCount = sys.list().length;
      if (editing) {
        busy = false; report(result.message || (result.ok ? '装饰已经收好。' : '装饰没有保存，草稿还在，请再试一次。'));
        if (result.ok) { G.audio.play('success'); handle.close(); options.onSaved?.(); } else syncState();
        return;
      }
      if (result.ok) {
        lastPhotoId = result.photo.id; savedName = result.photo.name; savedDecor = JSON.stringify(decor); savedBase = base; G.audio.play('shutter'); syncState();
        report('咔嚓！已收好第' + photoCount + '张相片。继续修改会成为下一张的草稿。');
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) { flash.classList.remove('is-flashing'); void flash.offsetWidth; flash.classList.add('is-flashing'); flashTimer = setTimeout(() => { if (!closed) flash.classList.remove('is-flashing'); }, 220); }
      } else report(result.message || '还没有拍好，草稿还在，请稍后再试一次。');
      captureTimer = setTimeout(() => { if (!closed) { busy = false; syncState(); } }, 1050);
    }
    function cleanup() {
      if (closed) return; closed = true; baseRequest++; controller.abort(); resizeObserver?.disconnect(); cancelAnimationFrame(paintFrame); clearTimeout(captureTimer); clearTimeout(flashTimer); finishPointers(); framePreviews.length = 0; base = null; savedBase = null; decor = null; selectedUid = null; sys.clearDraft?.();
      // 只收起仍由本编辑器拥有的控件弹层，不碰后来打开的其它窗口。
      if (body.querySelector('[aria-expanded="true"]') || handle?.element.contains(document.activeElement)) ui.controls.close();
      document.body.classList.remove('is-photographing'); canvas.width = 1; canvas.height = 1;
      if (activeSession === session) activeSession = null;
    }
    const session = { close() { handle?.close(); } }; activeSession = session;
    // 注册在公共modal的capture handler之前；取消输入法候选不等于关闭草稿。
    listen(document, 'keydown', event => { if (event.target === caption && event.key === 'Escape' && (composing || event.isComposing)) event.stopImmediatePropagation(); }, { capture: true });
    handle = ui.modal({ title: editing ? '装饰这张相片' : '照片工作台', content: body, onClose: cleanup, lockBackdrop: true }); handle.element.classList.add('photo-studio-card', 'photo-editor-v2-card'); document.body.classList.add('is-photographing');
    if (typeof ResizeObserver !== 'undefined') { resizeObserver = new ResizeObserver(fitSurface); resizeObserver.observe(stageWell); }
    else listen(window, 'resize', fitSurface);
    syncTools(); syncState(); syncFramePreviews();
    if (editing) loadOriginal(); else prepare(false);
  }
  G.bus.on('state:replace', () => { activeSession?.close(); activeSession = null; });
  ui.photoEditor = { open, close() { activeSession?.close(); } };
})(window.Game);
