/* MC-072：已收礼后的奶油小剧场。祝词与姓名用DOM完整呈现，舞台只读。 */
(function (G) {
  'use strict';
  const ui = G.ui = G.ui || {}, B = G.data.birthdayParty;
  const colors = ['#dba9b3', '#e7cc8b', '#b8c99b', '#a7cbd0', '#c8b7d5'];
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
  let current = null;
  function available() {
    const now = new Date(), monthDay = String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    return !!(G.state?.profile?.birthday === monthDay && G.state?.calendar?.claimed?.[now.getFullYear() + ':player_birthday']);
  }
  function owns(s) { return current === s && !s.closed; }
  function safely(fn) { try { fn(); } catch (_) { /* 插图与清理失败不影响文字祝福。 */ } }
  function dispose(s) {
    if (!s || s.closed) return;
    s.closed = true;
    if (s.frame !== null) cancelAnimationFrame(s.frame);
    s.frame = null; s.off.splice(0).forEach(off => safely(off));
    s.holder.remove();
    s.canvases.forEach(canvas => { canvas.width = 0; canvas.height = 0; });
    s.canvases.length = 0; s.people.length = 0; s.sprites.length = 0;
    // 旧onClose即使迟到，也不能停止新舞台或清除新handle。
    if (current === s) { current = null; safely(() => G.audio.stopBirthday()); }
  }
  function closeSession(s) { if (!owns(s)) return; dispose(s); s.modal?.close(); }
  function valid(s) {
    if (!owns(s)) return false;
    if (!available()) { closeSession(s); return false; }
    return true;
  }
  function localButton(s, text, key, action, cls) {
    const node = el('button', cls || 'ui-button', text); node.type = 'button'; node.dataset.birthdayAction = key;
    const listener = () => { if (!node.disabled && valid(s)) action(); };
    node.addEventListener('click', listener); s.off.push(() => node.removeEventListener?.('click', listener)); return node;
  }
  function canvas(s, cls, width, height) {
    const node = el('canvas', cls); node.width = width; node.height = height; s.canvases.push(node); return node;
  }
  function art(s, fn) { try { fn(); } catch (_) { s.artNote.textContent = '舞台插图暂不可用，姓名与祝福仍可完整阅读。'; } }
  function portrait(s, id) {
    const node = canvas(s, 'birthday-portrait', 96, 124); node.style.width = '96px'; node.style.height = '124px'; node.setAttribute('aria-hidden', 'true');
    s.holder.append(node); return node;
  }
  function person(s, id, name, sprite) {
    const node = el('div', 'birthday-guest'), label = el('span', 'birthday-name', name);
    node.dataset.birthdayGuest = id; node.append(sprite, label); s.people.push({ id, node, sprite }); return node;
  }
  function drawing(canvas, width, height) {
    const scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const w = Math.round(width * scale), h = Math.round(height * scale);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const c = canvas.getContext('2d'); if (!c) return null;
    c.setTransform(scale, 0, 0, scale, 0, 0); c.clearRect(0, 0, width, height); return c;
  }
  function prepareSprites(s) {
    if (document.hidden || !valid(s)) return false;
    if (s.ready) return true;
    s.ready = true; document.body.append(s.holder);
    s.sprites.forEach(value => art(s, () => G.render.drawCharacter(value.sprite, value.id)));
    art(s, () => G.render.drawAvatar(s.player, s.avatar));
    art(s, () => G.render.drawCharacter(s.nuomi, 'nuomi'));
    s.holder.remove(); return true;
  }
  function paintSpeaker(s) {
    if (!prepareSprites(s)) return;
    const line = s.lines[s.line];
    art(s, () => {
      const c = drawing(s.speakerArt, 72, 88), sprite = line.id === 'nuomi' ? s.nuomi : s.sprites.find(value => value.id === line.id)?.sprite;
      if (c && sprite?.width && sprite?.height) c.drawImage(sprite, 0, 0, 72, 88);
    });
  }
  function paintCake(s) {
    if (document.hidden || !valid(s)) return;
    art(s, () => { const c = drawing(s.cake, 130, 90); if (c) G.draw.festival.draw(c, { motif: 'birthday_cake', w: 104, h: 76 }, 13, 3); });
  }
  function showLine(s) {
    if (!valid(s)) return;
    const line = s.lines[s.line];
    // 不替换祝词区、按钮或滚动容器；切句只更新文本与说话者标记。
    s.speaker.textContent = line.name + '的祝福 · ' + (s.line + 1) + ' / ' + s.lines.length;
    s.words.textContent = line.text;
    s.people.forEach(p => { p.node.classList.toggle('is-speaking', p.id === line.id); });
    paintSpeaker(s);
  }
  function moving(s) { return !s.media?.matches && s.guests.length > 0; }
  function draw(s) {
    if (!prepareSprites(s)) return;
    const sway = moving(s), phase = s.elapsed / 1000 * 2.4, bob = sway ? Math.sin(phase) * 2 : 0;
    art(s, () => {
      const c = drawing(s.stage, 120, 172); if (!c) return;
      c.fillStyle = '#a58b6524'; c.beginPath(); c.ellipse(60, 159, 34, 6, 0, 0, Math.PI * 2); c.fill();
      c.save(); c.translate(60, 158 + bob); c.rotate(sway ? Math.sin(phase) * .018 : 0);
      if (s.player.width && s.player.height) c.drawImage(s.player, -47, -124, 94, 124);
      G.draw.festival.draw(c, { motif: 'birthday_crown', w: 44, h: 30 }, -22, -153); c.restore();
    });
    s.people.forEach((p, i) => { p.sprite.style.transform = sway ? 'translateY(' + (Math.sin(phase + i * .8) * 2).toFixed(2) + 'px) rotate(' + (Math.sin(phase + i * .8) * 1.3).toFixed(2) + 'deg)' : 'none'; });
  }
  function schedule(s) {
    if (!owns(s) || document.hidden || !moving(s) || s.frame !== null) return;
    const frame = requestAnimationFrame(now => {
      if (!valid(s) || s.frame !== frame) return;
      s.frame = null;
      if (document.hidden || !moving(s)) return;
      if (s.previous !== null) s.elapsed += Math.min(90, Math.max(0, now - s.previous));
      s.previous = now;
      if (now - s.last >= 1000 / 12) { s.last = now; draw(s); }
      schedule(s);
    });
    s.frame = frame;
  }
  function stopFrames(s) { if (s.frame !== null) cancelAnimationFrame(s.frame); s.frame = null; s.previous = null; }
  function open(options) {
    if (current) valid(current);
    if (!available()) { ui.toast('在生日当天收下小礼物后，再请朋友们一起来庆祝吧。'); return false; }
    if (current) return current.modal;
    const guests = G.data.residents.filter(def => G.state.residents[def.id]?.movedIn).map(def => ({ id: def.id, name: def.name }));
    const name = G.state.profile.name || '小设计师', body = el('div', 'birthday-party'), scroll = el('div', 'birthday-scroll');
    const s = { guests, avatar: G.state.avatar, ready: false, body, scroll, closed: false, modal: null, frame: null, previous: null, last: 0, elapsed: 0, off: [], canvases: [], sprites: [], people: [], line: 0,
      lines: [{ id: 'nuomi', name: '糯米', text: B.nuomi }].concat(guests.map(def => ({ id: def.id, name: def.name, text: B.blessings[def.id] || B.greeting }))),
      holder: el('div', 'birthday-sprites'), media: window.matchMedia?.('(prefers-reduced-motion: reduce)'), artNote: el('p', 'birthday-art-note') };
    current = s;
    const intro = el('p', 'birthday-intro', name + '，生日快乐！' + (guests.length ? ' ' + guests.length + ' 位入住朋友都来啦。' : ' ' + B.empty));
    const blessing = el('section', 'birthday-blessing'), message = el('div', 'birthday-message');
    s.speaker = el('strong', 'birthday-speaker'); s.words = el('p', 'birthday-words');
    message.setAttribute('aria-live', 'polite'); message.setAttribute('aria-atomic', 'true'); message.append(s.speaker, s.words);
    s.speakerArt = canvas(s, 'birthday-speaker-art', 72, 88); s.speakerArt.setAttribute('aria-hidden', 'true'); blessing.append(s.speakerArt, message);
    const theatre = el('figure', 'birthday-theatre' + (guests.length > 6 ? ' birthday-many' : '')), bunting = el('div', 'birthday-bunting');
    theatre.dataset.guestCount = String(guests.length); theatre.setAttribute('aria-label', '生日小剧场 · ' + guests.length + ' 位入住朋友');
    bunting.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 9; i++) { const flag = el('i'); flag.style.backgroundColor = colors[i % colors.length]; bunting.append(flag); }
    const cast = el('div', 'birthday-cast'), left = el('div', 'birthday-side'), right = el('div', 'birthday-side'), playerFigure = el('div', 'birthday-player');
    s.stage = canvas(s, 'birthday-stage', 120, 172); s.stage.setAttribute('role', 'img');
    s.stage.setAttribute('aria-label', name + '戴着生日皇冠，和' + (guests.length ? guests.map(def => def.name).join('、') + '、糯米' : '糯米') + '一起围着生日蛋糕庆祝');
    playerFigure.append(s.stage, el('span', 'birthday-name birthday-player-name', name));
    s.holder.setAttribute('aria-hidden', 'true'); document.body.append(s.holder);
    guests.forEach(def => { s.sprites.push({ id: def.id, sprite: portrait(s, def.id) }); });
    s.player = canvas(s, '', 96, 124); s.player.style.width = '96px'; s.player.style.height = '124px'; s.holder.append(s.player);
    s.nuomi = portrait(s, 'nuomi');
    guests.forEach((def, i) => { (i < Math.ceil(guests.length / 2) ? left : right).append(person(s, def.id, def.name, s.sprites[i].sprite)); });
    if (!guests.length) left.append(person(s, 'nuomi', '糯米', s.nuomi));
    // 人物移入DOM名牌；缓存只在前台挂载绘制，后台开场延后到恢复时准备。
    s.holder.remove();
    cast.append(left, playerFigure, right);
    const table = el('div', 'birthday-cake-table'); s.cake = canvas(s, 'birthday-cake', 130, 90); s.cake.setAttribute('aria-hidden', 'true'); table.append(s.cake, el('i'));
    theatre.append(bunting, el('p', 'birthday-stage-title', '生日快乐'), cast, table);
    const caption = el('figcaption', 'birthday-guests', guests.length ? '今天的朋友：' + guests.map(def => def.name).join('、') + '。' : '今天有糯米和你，许愿的小桌子一样暖暖的。');
    const status = el('p', 'birthday-status', B.closing + ' ' + B.quiet), props = el('p', 'birthday-props-note', '皇冠与蛋糕只是舞台道具，不进背包。');
    const replay = localButton(s, '再唱一遍', 'replay', () => { if (!document.hidden) G.audio.play('birthday'); }, 'ui-button birthday-replay');
    const next = localButton(s, '换份祝福', 'next', () => { s.line = (s.line + 1) % s.lines.length; showLine(s); }, 'ui-button ui-button-soft birthday-next'); next.disabled = guests.length === 0;
    const close = localButton(s, '收好祝福', 'close', () => closeSession(s), 'ui-button ui-button-primary birthday-close');
    const actions = el('div', 'birthday-actions'); actions.append(replay, next, close);
    theatre.append(caption);
    scroll.append(intro, blessing, theatre, status, props, s.artNote); body.append(scroll, actions);
    s.modal = ui.modal({ title: B.title, content: body, onClose: () => dispose(s) });
    if (!owns(s)) { s.modal.close(); return false; }
    s.modal.element.classList.add('birthday-modal-card');
    const visibility = () => {
      if (!valid(s)) return;
      if (document.hidden) { stopFrames(s); G.audio.stopBirthday(); }
      else { paintSpeaker(s); paintCake(s); draw(s); schedule(s); }
    };
    const resize = () => { if (valid(s)) draw(s); };
    const motion = () => { if (!valid(s)) return; stopFrames(s); draw(s); schedule(s); };
    document.addEventListener('visibilitychange', visibility); window.addEventListener('resize', resize);
    s.off.push(() => document.removeEventListener('visibilitychange', visibility), () => window.removeEventListener('resize', resize));
    if (s.media?.addEventListener) { s.media.addEventListener('change', motion); s.off.push(() => s.media.removeEventListener('change', motion)); }
    else if (s.media?.addListener) { s.media.addListener(motion); s.off.push(() => s.media.removeListener(motion)); }
    s.off.push(G.bus.on('state:replace', () => closeSession(s)), G.bus.on('time:change', () => valid(s)));
    paintCake(s); showLine(s); draw(s); schedule(s);
    // 年度收礼已经奏曲；恢复前台只重画，主动重开或再唱才请求生日曲。
    if (!options?.fromClaim && !document.hidden && valid(s)) G.audio.play('birthday');
    return s.modal;
  }
  ui.birthday = { open, available, close() { if (current) closeSession(current); } };
})(window.Game);
