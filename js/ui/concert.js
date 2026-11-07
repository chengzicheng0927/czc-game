/* MC-070：奶油木舞台、海风帷幕与真实入住朋友；先读故事，再主动接上三段。
 * 固定操作区与可滚动故事分开；规则仍委托 concert，插图仅按需绘制。
 * 正式整页/设备验收留目标快照，不改变入口、保存或音频策略。 */
(function (G) {
  'use strict';
  const ui = G.ui = G.ui || {}, C = G.data.concert;
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
  let current = null, serial = 0, acting = false;
  const profile = id => G.data.residents.find(def => def.id === id);
  function owns(s) { return current === s && !s.closed && s.body.isConnected; }
  function safe(fn) { try { fn(); } catch (_) { /* 插图/音频/清理失败不替代规则结果。 */ } }
  function stop() { safe(() => G.audio.stopSpeech()); safe(() => G.audio.stopConcert()); }
  function release(canvas) { safe(() => canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)); canvas.width = 0; canvas.height = 0; }
  function dispose(s) {
    if (!s || s.closed) return;
    s.closed = true;
    if (s.frame !== null) cancelAnimationFrame(s.frame);
    s.frame = null; s.off.splice(0).forEach(off => off());
    if (s.sessionId) safe(() => G.sys.concert.cancel(s.sessionId));
    s.sessionId = null; stop(); s.sprites.forEach(release); s.sprites = []; release(s.canvas);
    if (current === s) current = null;
  }
  function read() {
    const value = G.sys.concert.status();
    if (!value || !Array.isArray(value.roomIds) || !Array.isArray(value.guests)) throw new Error('演出状态暂不可读');
    return value;
  }
  function validRoom(s, state) { return s.requested === undefined || typeof s.requested === 'string' && state.roomIds.includes(s.requested); }
  function sameGuests(a, b) { return a.length === b.length && a.every((id, i) => id === b[i]); }
  function validSession(s, state) { return state.roomIds.includes(s.roomId) && sameGuests(state.guests, s.guests); }
  function report(s, message, error) {
    s.message.textContent = message || ''; s.message.className = 'concert-status' + (error ? ' is-error' : '');
    s.message.setAttribute('role', error ? 'alert' : 'status');
  }
  // 先读取焦点，再改变 hidden/disabled；浏览器会立即把隐藏节点的焦点退回 body。
  function keepPosition(s, action) {
    const focused = document.activeElement, inside = s.body.contains(focused), top = s.scroll.scrollTop;
    action();
    if (!owns(s)) return;
    const after = document.activeElement;
    if (inside && (after === focused || after === document.body)) {
      const target = !focused.hidden && !focused.disabled && focused.isConnected ? focused : !s.next.disabled ? s.next : s.message;
      target.focus({ preventScroll: true });
    }
    s.scroll.scrollTop = top;
  }
  function localButton(s, text, key, action, cls) {
    const node = el('button', cls || 'ui-button', text); node.type = 'button'; node.dataset.uiFocus = 'concert-' + key;
    const listener = () => { if (owns(s) && !s.busy && !acting && !node.disabled) action(); };
    node.addEventListener('click', listener); s.off.push(() => node.removeEventListener('click', listener)); return node;
  }
  function roster(s, ids) {
    if (s.rosterReady && sameGuests(s.drawnGuests, ids)) return;
    s.rosterReady = true;
    s.sprites.forEach(release); s.sprites = []; s.drawnGuests = ids.slice(); s.people.replaceChildren();
    s.people.dataset.count = String(ids.length);
    ids.forEach(id => {
      const card = el('li', 'concert-guest'), canvas = el('canvas', 'concert-portrait'), name = el('span', 'concert-name', profile(id)?.name || id);
      canvas.style.width = '88px'; canvas.style.height = '104px'; canvas.setAttribute('aria-hidden', 'true');
      card.append(canvas, name); s.people.append(card); s.sprites.push(canvas);
      try { G.render.drawCharacter(canvas, id); }
      catch (_) { s.artNote.textContent = '朋友插图暂不可用，姓名与故事仍可阅读。'; }
    });
    s.empty.hidden = ids.length > 0;
    s.caption.textContent = ids.length ? ids.length + '位已入住朋友 · ' + ids.map(id => profile(id)?.name || id).join('、') : '给朋友留一张听歌的椅子';
  }
  function schedule(s) {
    if (s.frame !== null) cancelAnimationFrame(s.frame);
    s.frame = requestAnimationFrame(() => {
      s.frame = null; if (!owns(s)) return;
      try { drawStage(s); } catch (_) { s.artNote.textContent = '舞台插图暂不可用，故事与演出仍可继续。'; }
    });
  }
  function drawStage(s) {
    const c = s.canvas.getContext('2d'); if (!c) throw new Error('Canvas不可用');
    const w = 800, h = 340; c.clearRect(0, 0, w, h);
    c.fillStyle = '#f6edcf'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#faeedc'; c.fillRect(12, 12, 776, 228);
    c.fillStyle = '#fff8e9'; c.beginPath(); c.ellipse(400, 169, 260, 135, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#e5c7a2'; c.fillRect(12, 226, 776, 102);
    c.fillStyle = '#d3af87'; c.fillRect(12, 226, 776, 7);
    c.fillStyle = '#efd6b5'; c.fillRect(12, 233, 776, 4);
    c.strokeStyle = '#c5a57a'; c.lineWidth = 2;
    for (let y = 237; y < 330; y += 26) { c.beginPath(); c.moveTo(12, y); c.lineTo(788, y); c.stroke(); }
    // 帷幕在左右12%内，人物与名牌留出16%的内侧安全区。
    for (const mirror of [false, true]) {
      c.save(); if (mirror) { c.translate(w, 0); c.scale(-1, 1); }
      c.fillStyle = '#d2a0b0'; c.beginPath(); c.moveTo(10, 10); c.lineTo(96, 10); c.quadraticCurveTo(80, 108, 57, 177); c.lineTo(71, 318); c.lineTo(10, 318); c.closePath(); c.fill();
      c.strokeStyle = '#b87992'; c.lineWidth = 3;
      for (const x of [25, 46, 67]) { c.beginPath(); c.moveTo(x, 12); c.quadraticCurveTo(x + 7, 88, 50, 177); c.stroke(); }
      c.strokeStyle = '#bca477'; c.lineWidth = 9; c.beginPath(); c.moveTo(13, 181); c.lineTo(62, 174); c.stroke(); c.restore();
    }
    c.strokeStyle = '#aea17a'; c.lineWidth = 2; c.beginPath(); c.moveTo(115, 35); c.quadraticCurveTo(400, 92, 685, 35); c.stroke();
    for (let i = 0; i < 5; i++) {
      const x = 202 + i * 99, y = 39 + Math.sin(i / 4 * Math.PI) * 19;
      c.save(); c.translate(x, y); c.rotate((i % 2 ? 1 : -1) * .08);
      c.fillStyle = '#fff6d9'; c.fillRect(-16, -12, 32, 37); c.strokeStyle = '#d3bd8d'; c.lineWidth = 1; c.strokeRect(-16, -12, 32, 37);
      c.fillStyle = '#ac607b'; c.beginPath(); c.ellipse(-4, 12, 5, 3, -.3, 0, Math.PI * 2); c.fill(); c.fillRect(0, -5, 2, 17);
      c.beginPath(); c.moveTo(2, -5); c.lineTo(10, -2); c.lineTo(10, 2); c.lineTo(2, -1); c.fill(); c.restore();
    }
    c.strokeStyle = '#b58e69'; c.lineWidth = 12; c.strokeRect(6, 6, 788, 328);
    c.strokeStyle = '#f0dbba'; c.lineWidth = 3; c.strokeRect(14, 14, 772, 310);
  }
  function render(s, state, redraw) {
    if (s.closed) return;
    keepPosition(s, () => {
      const running = !!s.sessionId, line = s.verse >= 0 ? C.verses[s.verse] : null;
      s.snapshot = state; s.body.dataset.state = running ? 'performing' : s.finished ? 'finished' : 'lobby';
      s.heading.textContent = line ? line.title : C.title;
      s.copy.textContent = line ? line.text : state.reason;
      s.record.textContent = state.completed ? '已经完整举办 · 重演不新增回忆或完成记录' : '首次完整谢幕后，留下一条具名回忆与举办记录';
      s.instruction.textContent = running ? '第' + (s.verse + 1) + '段 / ' + C.verses.length + '段 · 由你接上下一步，没有倒计时' : s.finished ? '本场已谢幕 · 喜欢的话，可以再演一遍' : '三段故事，慢慢奏完 · 中途收起可重新开始';
      s.steps.forEach((step, i) => {
        const done = s.finished || i < s.verse; step.className = done ? 'is-done' : running && i === s.verse ? 'is-current' : '';
        step.setAttribute('aria-current', running && i === s.verse ? 'step' : 'false');
        step.querySelector('span').textContent = done ? '已奏' : String(i + 1);
      });
      s.next.textContent = running ? s.verse === C.verses.length - 1 ? '一起谢幕，收好回忆' : '接上下一段' : s.finished || state.completed ? '再演一遍' : s.reenter ? '重新请朋友入场' : '请朋友入场';
      s.next.disabled = s.busy || !running && (!state.canStart || !validRoom(s, state));
      s.listen.hidden = s.melody.hidden = !line;
      s.listen.disabled = s.melody.disabled = s.busy || !running && !s.finished;
      s.restart.hidden = !running; s.retry.disabled = s.restart.disabled = s.busy;
      if (line) {
        const source = el('span', 'concert-notes-source', '本段音符 · ' + line.notes.join(' · '));
        s.notes.replaceChildren(source);
        const noteNames = { 60: 'C4', 62: 'D4', 64: 'E4', 65: 'F4', 67: 'G4', 69: 'A4', 71: 'B4' };
        line.notes.forEach(note => { const chip = el('span', 'concert-note-chip', noteNames[note] || String(note)); chip.setAttribute('aria-hidden', 'true'); s.notes.append(chip); });
      } else s.notes.textContent = '旋律在本机奏响；静音也能读完故事、完整参加。';
      roster(s, running || s.finished ? s.guests : state.guests);
      Array.from(s.people.children).forEach((card, i) => { card.style.transform = 'rotate(' + (running ? ((i + s.verse) % 3 - 1) * 2 : 0) + 'deg)'; });
      if (!validRoom(s, state)) report(s, '这间音乐室已经不在这里啦。请关闭演出，从当前音乐室重新进入。', true);
      if (redraw) schedule(s);
    });
  }
  function invalidate(s, message) {
    if (s.sessionId) safe(() => G.sys.concert.cancel(s.sessionId));
    s.sessionId = null; s.verse = -1; s.finished = false; s.reenter = true; stop();
    report(s, message || '音乐室或来宾发生变化，本场已暂停。请重新邀请大家入场。', true);
  }
  function refresh(s) {
    if (!owns(s) || s.busy) return;
    try {
      const state = read(); if (!owns(s)) return;
      const changed = s.sessionId && !validSession(s, state);
      if (changed) invalidate(s);
      render(s, state, !!changed || !sameGuests(s.drawnGuests, state.guests));
    } catch (_) {
      if (!owns(s)) return;
      keepPosition(s, () => { invalidate(s, '演出状态暂时没能读好，请重新读取状态，再请朋友入场。'); s.next.disabled = true; s.listen.hidden = s.melody.hidden = true; s.body.dataset.state = 'unreadable'; });
    }
  }
  function act(s) {
    if (!owns(s) || s.busy || acting) return;
    const focused = document.activeElement, top = s.scroll.scrollTop, operationSession = s.sessionId;
    s.busy = acting = true; s.body.setAttribute('aria-busy', 'true'); s.next.disabled = true; stop();
    let result = null, played = false, success = false;
    try {
      const state = read(); if (!owns(s)) return;
      if (s.sessionId && !validSession(s, state)) { invalidate(s); return; }
      report(s, '');
      if (!s.sessionId) {
        if (!state.canStart || !validRoom(s, state)) { render(s, state); return; }
        result = G.sys.concert.begin(s.requested);
        if (!owns(s)) { if (result?.sessionId) safe(() => G.sys.concert.cancel(result.sessionId)); return; }
        if (result?.ok && typeof result.sessionId === 'string' && result.verse === 0 && Array.isArray(result.guests)) {
          s.sessionId = result.sessionId; s.roomId = s.requested === undefined ? state.roomIds[0] : s.requested; s.guests = result.guests.slice(); s.verse = result.verse; s.finished = false; played = true;
        } else report(s, result?.message || '入场结果暂未确认，请重新读取状态后再试。', true);
      } else if (s.verse < C.verses.length - 1) {
        result = G.sys.concert.advance(s.sessionId); if (!owns(s)) return;
        if (result?.ok && result.verse === s.verse + 1) { s.verse = result.verse; played = true; }
        else invalidate(s, result?.message || '下一段暂未确认，请重新邀请大家入场。');
      } else {
        result = G.sys.concert.finish(s.sessionId); if (!owns(s)) return;
        if (result?.ok === true) { s.sessionId = null; s.finished = true; success = true; report(s, result.message); }
        else {
          report(s, (result?.message || '谢幕结果暂未确认。') + ' 仍可重试谢幕，或重新入场查看已存记录。', true);
          // 写入后通知异常可能已提交；只提示核对，不把 completed 推断成成功。
          if (result?.message === '小合奏已经暂停，请重新邀请大家入场。') invalidate(s, result.message);
          else if (!state.completed && read().completed) invalidate(s, '谢幕结果暂未确认，请重新入场查看已存记录。');
        }
      }
      if (!owns(s)) return;
      const latest = read();
      if ((s.sessionId || success) && !validSession(s, latest)) { invalidate(s); success = played = false; }
    } catch (_) {
      success = played = false;
      if (owns(s)) report(s, '演出结果暂未确认，请重新读取状态；也可以重新入场查看已存记录。', true);
    } finally {
      s.busy = acting = false; s.body.setAttribute('aria-busy', 'false');
      // 系统提交期间 busy 会拒绝 cancel；调用返回后补取消本次旧ID，不触及新弹窗。
      if (!owns(s) && operationSession) safe(() => G.sys.concert.cancel(operationSession));
      if (owns(s)) {
        refresh(s);
        if (played || success) schedule(s);
        if (focused === s.next && (document.activeElement === focused || document.activeElement === document.body)) (!s.next.disabled ? s.next : s.message).focus({ preventScroll: true });
        if (document.activeElement === s.next || document.activeElement === document.body) s.scroll.scrollTop = top;
      }
    }
    if (!owns(s)) return;
    if (played) safe(() => G.audio.play('concert_' + s.verse));
    if (success) safe(() => ui.toast(result.message));
  }
  function open(roomId) {
    if (current) { const previous = current; previous.modal?.close(); dispose(previous); }
    const body = el('div', 'concert concert-v2'), scroll = el('div', 'concert-scroll');
    const s = { body, scroll, requested: roomId, sessionId: null, roomId: null, guests: [], drawnGuests: [], sprites: [], verse: -1, finished: false, reenter: false, closed: false, busy: false, frame: null, off: [], modal: null };
    current = s;
    const figure = el('figure', 'concert-theatre'), canvas = el('canvas', 'concert-stage'), people = el('ul', 'concert-guests'), caption = el('figcaption', 'concert-caption'), empty = el('p', 'concert-empty', '给朋友留一张听歌的椅子'), artNote = el('p', 'concert-art-note');
    canvas.width = 800; canvas.height = 340; canvas.setAttribute('aria-hidden', 'true'); people.setAttribute('aria-label', '本场已入住朋友');
    const stage = el('div', 'concert-stage-wrap'); stage.append(canvas, people, empty); figure.append(stage, caption, artNote);
    const story = el('section', 'concert-story'), heading = el('h3', '', C.title), copy = el('p', 'concert-copy'), notes = el('p', 'concert-notes'), instruction = el('p', 'concert-instruction');
    heading.id = 'concert-heading-' + (++serial); story.setAttribute('aria-labelledby', heading.id); copy.setAttribute('aria-live', 'polite'); copy.setAttribute('aria-atomic', 'true'); story.append(heading, copy, notes);
    const progress = el('ol', 'concert-progress'); progress.setAttribute('aria-label', '小合奏三段进度');
    const steps = C.verses.map((line, i) => { const step = el('li'); step.append(el('span', '', String(i + 1)), el('small', '', line.title)); progress.append(step); return step; });
    const message = el('p', 'concert-status'); message.id = 'concert-status-' + serial; message.dataset.uiFocus = 'concert-status'; message.tabIndex = -1; message.setAttribute('aria-live', 'polite'); message.setAttribute('aria-atomic', 'true');
    const record = el('p', 'concert-record'), tools = el('div', 'concert-tools');
    const next = localButton(s, '请朋友入场', 'next', () => act(s), 'ui-button ui-button-primary concert-next'); next.setAttribute('aria-describedby', message.id); next.setAttribute('autofocus', '');
    const listen = localButton(s, '听这段故事', 'story', () => { refresh(s); if (owns(s) && (s.sessionId || s.finished) && s.verse >= 0) safe(() => ui.speak(C.verses[s.verse].text, listen)); });
    listen.dataset.listenLabel = '听这段故事'; listen.dataset.speechKey = 'concert-story';
    const melody = localButton(s, '再听这段旋律', 'melody', () => { refresh(s); if (owns(s) && (s.sessionId || s.finished) && s.verse >= 0) safe(() => G.audio.play('concert_' + s.verse)); });
    const retry = localButton(s, '重新读取状态', 'retry', () => refresh(s), 'ui-button ui-button-soft');
    const restart = localButton(s, '重新入场', 'restart', () => { keepPosition(s, () => { invalidate(s, '本场已收起，请重新邀请大家入场。'); refresh(s); }); }, 'ui-button ui-button-soft');
    tools.append(retry, restart);
    scroll.append(figure, progress, story, instruction, record, tools, el('p', 'concert-footnote', '不计时、不评分。只有主动推进才换段；首次谢幕只记录演出与回忆，不赠糖果、爱心或经验。'));
    const actions = el('div', 'concert-actions'), listening = el('div', 'concert-listening'); listening.append(melody, listen); actions.append(message, next, listening, el('p', 'concert-silent-note', '静音也能完整参加 · 随时可以收起'));
    body.append(scroll, actions); Object.assign(s, { canvas, people, caption, empty, artNote, heading, copy, notes, instruction, steps, message, record, next, listen, melody, retry, restart });
    s.modal = ui.modal({ title: '音乐室的小合奏', content: body, onClose: () => dispose(s) });
    if (s.closed) return;
    s.modal.element.classList.add('concert-modal-card');
    s.off.push(G.bus.on('state:replace', () => { if (!s.closed) { dispose(s); s.modal?.close(); } }));
    s.off.push(G.bus.on('state:change', () => refresh(s)));
    refresh(s); schedule(s);
  }
  ui.concert = { open };
})(window.Game);
