/* 房间只调换位置；点击和拖动共用一份预览，再主动确认。 */
(function (G) {
  'use strict';
  const ui = G.ui = G.ui || {}, own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  let selectedId = null, pending = null, message = '', lastOptions = null, liveBody = null, gesture = null, suppressClick = false, clickTimer = 0, ignoredTargetOptions = null;
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
  const button = (text, action, cls) => { const node = el('button', cls || 'ui-button', text); node.type = 'button'; if (action) node.addEventListener('click', action); return node; };
  const room = id => typeof id === 'string' && own(G.state.house.rooms, id) ? G.state.house.rooms[id] : null;
  const definition = id => G.data.rooms.find(entry => entry.id === room(id)?.type);
  const name = id => definition(id)?.name || '房间';
  const positionText = value => (value.floorIdx + 1) + '楼第' + (value.slotIdx + 1) + '格';
  const samePosition = (a, b) => !!a && !!b && a.floorIdx === b.floorIdx && a.slotIdx === b.slotIdx;
  const slots = () => G.sys.building.layoutSlots();
  const position = id => G.sys.building.roomPosition(id);
  function residentCount(id) { return Object.values(G.state.residents).filter(friend => friend.movedIn && friend.roomId === id).length; }
  function stopGesture() {
    const current = gesture; if (!current) return;
    gesture = null;
    document.removeEventListener('pointermove', current.move, true); document.removeEventListener('pointerup', current.end, true); document.removeEventListener('pointercancel', current.cancel, true); document.removeEventListener('keydown', current.key, true); document.removeEventListener('pointerdown', current.extraPointer, true); document.removeEventListener('visibilitychange', current.visibility); window.removeEventListener('blur', current.blur);
    try { current.button.releasePointerCapture?.(current.pointerId); } catch (_) {}
    current.ghost?.remove(); current.body.classList.remove('is-room-dragging');
    current.body.querySelectorAll('.is-drop-target').forEach(node => node.classList.remove('is-drop-target'));
  }
  function chooseTarget(target, paint) {
    const source = position(selectedId);
    if (!source || samePosition(source, target)) { pending = null; message = '这里就是它现在的位置。再挑一格吧。'; }
    else { pending = { floorIdx: target.floorIdx, slotIdx: target.slotIdx, roomId: target.roomId, from: source, sourceType: room(selectedId).type, targetType: target.roomId ? room(target.roomId)?.type : null }; message = ''; }
    paint(pending ? 'room-layout-confirm' : 'room-layout-source');
  }
  function open(input, target) {
    stopGesture();
    const options = input && typeof input === 'object' ? Object.assign({}, input) : { roomId: input };
    if (target) options.target = target;
    lastOptions = null; ignoredTargetOptions = null; ui.controls.close(); ui.open('roomLayout', options);
  }
  function panel(options = {}) {
    stopGesture();
    const body = el('div', 'room-layout-panel'); liveBody = body;
    const roomIds = slots().filter(slot => slot.roomId && room(slot.roomId)).map(slot => slot.roomId);
    if (lastOptions !== options) {
      lastOptions = options; selectedId = room(options.roomId) ? options.roomId : room(G.runtime.activeRoomId) ? G.runtime.activeRoomId : roomIds[0] || null; pending = null; message = '';
      if (selectedId && options.target && options !== ignoredTargetOptions) {
        const target = slots().find(slot => samePosition(slot, options.target)), source = position(selectedId);
        if (target && !samePosition(source, target)) pending = { floorIdx: target.floorIdx, slotIdx: target.slotIdx, roomId: own(options.target, 'roomId') ? options.target.roomId : target.roomId, from: source, sourceType: room(selectedId).type, targetType: target.roomId ? room(target.roomId)?.type : null };
      }
    }
    function paint(focusKey) {
      if (!room(selectedId) || !position(selectedId)) { selectedId = roomIds.find(id => room(id) && position(id)) || null; pending = null; }
      body.replaceChildren();
      if (!selectedId) {
        body.append(el('p', 'room-layout-empty', '先建一间房，才能为它挑一个新位置。'), button('去盖小屋', () => ui.open('build'), 'ui-button ui-button-primary')); return;
      }
      const currentSlots = slots(), source = position(selectedId), destination = pending && currentSlots.find(slot => samePosition(slot, pending));
      if (pending && (!destination || destination.roomId !== pending.roomId || !samePosition(source, pending.from) || room(selectedId)?.type !== pending.sourceType || (destination.roomId ? room(destination.roomId)?.type : null) !== pending.targetType)) { pending = null; message = '房间位置已经改变，请重新挑一格。'; }
      const controls = el('div', 'room-layout-controls'), picker = ui.controls.select(currentSlots.filter(slot => slot.roomId && room(slot.roomId)).map(slot => ({ id: slot.roomId, name: name(slot.roomId) + ' · ' + positionText(slot) })), selectedId, value => { selectedId = value; pending = null; message = ''; paint('room-layout-source'); });
      picker.dataset.uiFocus = 'room-layout-source'; controls.append(ui.controls.label(picker, '要换位置的房间'));
      const statusText = message || (pending ? name(selectedId) + '：' + positionText(source) + ' → ' + positionText(pending) + (pending.roomId ? '；' + name(pending.roomId) + '会换到原位置。' : '。原位置会空出来。') : '点下方另一格预览；也能拖动房间标签。免费，家具和朋友一起过去。');
      const status = el('p', 'room-layout-status', statusText); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.tabIndex = -1; status.dataset.uiFocus = 'room-layout-status';
      const actions = el('div', 'room-layout-actions'), accept = button(pending ? pending.roomId ? '互换位置' : '移到空位' : '先挑一个位置', () => {
        if (!pending) return;
        // 预览后到下一帧重绘前也可能有外部变化，提交瞬间再次核对两端。
        const sourceNow = position(selectedId), targetNow = slots().find(slot => samePosition(slot, pending));
        if (!room(selectedId) || !samePosition(sourceNow, pending.from) || room(selectedId).type !== pending.sourceType || !targetNow || targetNow.roomId !== pending.roomId || (targetNow.roomId ? room(targetNow.roomId)?.type : null) !== pending.targetType) {
          pending = null; message = '房间已经改变，这次没有移动。请重新挑选位置。'; paint('room-layout-status'); return;
        }
        accept.disabled = true; const target = pending, result = G.sys.building.swapRooms(selectedId, target.floorIdx, target.slotIdx, target.roomId);
        if (result.ok) { pending = null; message = result.message || '位置换好啦，家具和朋友都在。'; ui.toast(message); G.audio.play('success'); }
        else { message = result.message || '这次位置没有保存，请稍后再试。'; ui.toast(message); }
        paint('room-layout-status'); ui.refresh();
      }, 'ui-button ui-button-primary'); accept.dataset.uiFocus = 'room-layout-confirm'; accept.disabled = !pending; actions.append(accept);
      if (pending) { const cancel = button('重新挑选', () => { pending = null; message = ''; paint('room-layout-source'); }, 'ui-button ui-button-soft'); cancel.dataset.uiFocus = 'room-layout-cancel'; actions.append(cancel); }
      controls.append(status, actions); body.append(controls);
      const house = el('section', 'room-layout-house'); house.setAttribute('aria-label', '小屋房间位置图');
      const floors = [...new Set(currentSlots.map(slot => slot.floorIdx))].sort((a, b) => b - a);
      floors.forEach(floorIdx => {
        const row = el('div', 'room-layout-level'), floorLabel = el('span', 'room-layout-floor', (floorIdx + 1) + '楼'), grid = el('div', 'room-layout-slots'); row.append(floorLabel, grid);
        currentSlots.filter(slot => slot.floorIdx === floorIdx).sort((a, b) => a.slotIdx - b.slotIdx).forEach(slot => {
          const sourceHere = slot.roomId === selectedId, targetHere = samePosition(slot, pending), def = slot.roomId && definition(slot.roomId), cell = button('', event => { if (suppressClick) { suppressClick = false; event.preventDefault(); return; } chooseTarget(slot, paint); }, 'room-layout-cell' + (slot.roomId ? ' has-room' : ' is-empty') + (sourceHere ? ' is-source' : '') + (targetHere ? ' is-target' : ''));
          cell.dataset.layoutSlot = slot.floorIdx + ':' + slot.slotIdx; if (slot.roomId) cell.dataset.roomId = slot.roomId; cell.dataset.uiFocus = 'room-layout-cell-' + cell.dataset.layoutSlot;
          cell.setAttribute('aria-pressed', String(!!targetHere)); cell.setAttribute('aria-label', positionText(slot) + ' · ' + (slot.roomId ? name(slot.roomId) : '空位') + (sourceHere ? '，当前房间' : targetHere ? '，已选目标' : '，选为目标'));
          const head = el('span', 'room-layout-cell-head'), icon = el('span', 'room-layout-room-icon', def?.icon || '＋'); icon.setAttribute('aria-hidden', 'true'); head.append(el('span', 'room-layout-cell-position', '第' + (slot.slotIdx + 1) + '格'), icon);
          cell.append(head, el('strong', 'room-layout-cell-name', slot.roomId ? name(slot.roomId) : '空位'), el('span', 'room-layout-cell-note', sourceHere ? '正在搬这里' : targetHere ? '✓ 选中目标' : slot.roomId ? residentCount(slot.roomId) ? residentCount(slot.roomId) + '位朋友住着' : room(slot.roomId).items.length + '件家具' : '可以搬来'));
          grid.append(cell);
        });
        house.append(row);
      });
      body.append(house, el('p', 'room-layout-footnote', '更多位置随小屋等级开放。阁楼天文台留在屋顶；互换不会改变装修、居民或建造花费。'));
      if (focusKey && body.isConnected) body.querySelector('[data-ui-focus="' + focusKey + '"]')?.focus({ preventScroll:true });
    }
    body.addEventListener('dragstart', event => event.preventDefault());
    body.addEventListener('keydown', event => {
      if (event.key === 'Escape' && pending) { event.preventDefault(); event.stopPropagation(); pending = null; message = '这次挑选收好啦，房间没有移动。'; paint('room-layout-source'); return; }
      const cell = event.target.closest('[data-layout-slot]'); if (!cell || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      const cells = [...body.querySelectorAll('[data-layout-slot]')], index = cells.indexOf(cell), step = { ArrowLeft:-1, ArrowRight:1, ArrowUp:-3, ArrowDown:3 }[event.key], target = event.key === 'Home' ? 0 : event.key === 'End' ? cells.length - 1 : Math.max(0, Math.min(cells.length - 1, index + step));
      event.preventDefault(); cells[target].focus();
    });
    body.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0 || gesture) return;
      const cell = event.target.closest('[data-room-id]'); if (!cell || !body.contains(cell)) return;
      const start = { x:event.clientX, y:event.clientY }, originalId = cell.dataset.roomId;
      const current = { body, button:cell, pointerId:event.pointerId, moved:false, ghost:null, target:null, move:null, end:null, cancel:null, key:null, extraPointer:null, visibility:null, blur:null };
      gesture = current;
      try { cell.setPointerCapture?.(event.pointerId); } catch (_) {}
      const findTarget = point => { const node = document.elementFromPoint(point.clientX, point.clientY)?.closest('[data-layout-slot]'); if (!node || !body.contains(node)) return null; const numbers = node.dataset.layoutSlot.split(':').map(Number); return slots().find(slot => slot.floorIdx === numbers[0] && slot.slotIdx === numbers[1]); };
      current.move = move => {
        if (move.pointerId !== current.pointerId) return;
        if (!body.isConnected) { stopGesture(); return; }
        if (!current.moved && Math.hypot(move.clientX - start.x, move.clientY - start.y) < 8) return;
        move.preventDefault();
        if (!current.moved) { current.moved = true; selectedId = originalId; pending = null; message = ''; current.ghost = el('div', 'room-layout-drag-tag', name(originalId)); current.ghost.setAttribute('aria-hidden', 'true'); document.body.append(current.ghost); body.classList.add('is-room-dragging'); }
        current.ghost.style.left = (move.clientX + 12) + 'px'; current.ghost.style.top = (move.clientY + 12) + 'px'; current.target = findTarget(move);
        body.querySelectorAll('[data-layout-slot]').forEach(node => { node.classList.toggle('is-drop-target', !!current.target && node.dataset.layoutSlot === current.target.floorIdx + ':' + current.target.slotIdx); });
      };
      current.end = end => { if (end.pointerId !== current.pointerId) return; const target = current.moved ? findTarget(end) : null, moved = current.moved; stopGesture(); if (moved) { suppressClick = true; clearTimeout(clickTimer); clickTimer = setTimeout(() => { suppressClick = false; clickTimer = 0; }, 0); end.preventDefault(); if (target) chooseTarget(target, paint); else { message = '放在位置图中的一格上，再确认移动。'; paint(); } ui.refresh(); } };
      const cancelGesture = text => { stopGesture(); pending = null; message = text || '拖动已取消，房间还在原位。'; paint('room-layout-status'); ui.refresh(); };
      current.cancel = cancel => { if (cancel.pointerId !== current.pointerId) return; cancelGesture(); };
      current.key = key => { if (key.key !== 'Escape') return; key.preventDefault(); key.stopImmediatePropagation(); cancelGesture(); };
      current.extraPointer = pointer => { if (pointer.pointerId !== current.pointerId) cancelGesture('双指操作已取消这次拖动，房间还在原位。'); };
      current.visibility = () => { if (document.hidden) cancelGesture('小屋暂时收起了，拖动已取消。房间还在原位。'); };
      current.blur = () => cancelGesture('离开页面后，拖动已经取消。房间还在原位。');
      document.addEventListener('pointermove', current.move, {capture:true,passive:false}); document.addEventListener('pointerup', current.end, true); document.addEventListener('pointercancel', current.cancel, true); document.addEventListener('keydown', current.key, true); document.addEventListener('pointerdown', current.extraPointer, true); document.addEventListener('visibilitychange', current.visibility); window.addEventListener('blur', current.blur);
    });
    paint(); return { title:'↔ 房间换位置', subtitle:'为熟悉的小房间，挑一个新位置', content:body };
  }
  G.bus.on('panel:change', event => { if (!event.open || liveBody && !liveBody.isConnected) { stopGesture(); clearTimeout(clickTimer); clickTimer = 0; suppressClick = false; selectedId = null; pending = null; message = ''; ignoredTargetOptions = lastOptions; lastOptions = null; } });
  G.bus.on('state:replace', () => { stopGesture(); selectedId = null; pending = null; message = ''; ignoredTargetOptions = lastOptions; lastOptions = null; clearTimeout(clickTimer); clickTimer = 0; suppressClick = false; });
  ui.roomLayout = { panel, open, isInteracting:() => !!gesture };
})(window.Game);
