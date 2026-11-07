/* 礼盒只读规则与已存凭据；短动画不参与扣费或发奖。 */
(function (G) {
  'use strict';
  const ui = G.ui = G.ui || {}, C = G.data.giftConfig, lobbies = new Set();
  let activeHandle = null, archive = 0, serial = 0, opening = false;
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
  const number = value => Number(value || 0).toLocaleString('zh-CN');
  const keys = ['id', 'at', 'kind', 'itemId', 'coin', 'paid'];
  function receipt(value) {
    if (!value) return null;
    if (Object.keys(value).length !== keys.length || !keys.every(key => Object.prototype.hasOwnProperty.call(value, key)) || typeof value.id !== 'string' || !Number.isFinite(value.at) || typeof value.paid !== 'boolean') throw new Error('礼盒凭据暂不可读');
    if (value.kind === 'furniture' ? !G.data.furnitureById[value.itemId] || value.coin !== 0 : value.kind !== 'coin' || value.itemId !== null || value.coin !== C.completeCoins) throw new Error('礼物详情暂不可读');
    return Object.assign({}, value);
  }
  const rewardName = reward => reward.kind === 'furniture' ? G.data.furnitureById[reward.itemId].name : number(reward.coin) + ' 颗糖果';
  const savedAt = reward => new Date(reward.at).toLocaleString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const payment = reward => reward.paid ? '使用 ' + number(C.paidCost) + ' 颗游戏糖果' : '每日免费 · 未扣糖果';
  function illustration() {
    const scene = el('div', 'gift-scene'); scene.setAttribute('aria-hidden', 'true');
    const box = el('div', 'gift-parcel'), lid = el('div', 'gift-parcel-lid'), bow = el('div', 'gift-parcel-bow');
    bow.append(el('i'), el('i'), el('b')); lid.append(bow); box.append(el('div', 'gift-parcel-side'), el('div', 'gift-parcel-body'), el('div', 'gift-parcel-ribbon'), lid); scene.append(el('div', 'gift-ground'), box);
    const confetti = el('div', 'gift-confetti');
    for (let i = 0; i < C.confettiCount; i++) { const piece = el('i'); piece.style.setProperty('--piece-x', ((i * 53) % 232 - 116) + 'px'); piece.style.setProperty('--piece-y', (25 + (i * 29) % 130) + 'px'); piece.style.setProperty('--piece-turn', (i * 97 % 480 - 240) + 'deg'); piece.style.setProperty('--piece-delay', (i % 4 * .035) + 's'); confetti.append(piece); }
    scene.append(confetti); return scene;
  }
  function button(text, key, action, cls) {
    const node = el('button', cls || 'ui-button ui-button-soft', text); node.type = 'button'; node.dataset.uiFocus = 'gifts-' + key;
    node.addEventListener('click', () => { if (!node.disabled) action(); }); return node;
  }
  function owns(session) {
    if (session.disposed || session.archive !== archive || !session.body.isConnected) return false;
    session.mounted = true;
    const panel = document.getElementById('panel');
    return !panel?.contains(session.body) || !panel.classList.contains('hidden');
  }
  function canAct(session) {
    const overlay = document.querySelector('.modal-backdrop');
    return owns(session) && (!overlay || overlay.contains(session.body));
  }
  function dispose(session) {
    if (session.frame !== null) cancelAnimationFrame(session.frame); session.frame = null;
    session.lastArt.width = session.lastArt.height = 0;
    session.disposed = true; session.action.disabled = session.retry.disabled = session.replay.disabled = true; lobbies.delete(session);
  }
  function prune() { lobbies.forEach(session => { if (session.body.isConnected) owns(session); if (session.mounted && !owns(session)) dispose(session); }); }
  function modal(title, body, cleanup) {
    activeHandle?.close();
    let handle;
    handle = ui.modal({ title, content: body, onClose() { cleanup?.(); if (activeHandle === handle) activeHandle = null; } });
    handle.element.classList.add('gift-modal-card'); activeHandle = handle; return handle;
  }
  function showReward(saved, options = {}) {
    const born = archive, replay = !!options.replay, preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const animate = !replay && !document.hidden && !preference?.matches;
    const body = el('div', 'gift-reveal'), scene = illustration(), status = el('p', 'gift-reveal-status', animate ? '心意已经保存，正在轻轻松开丝带。' : '这份心意已经收好。');
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.setAttribute('aria-atomic', 'true');
    const rewardArea = el('section', 'gift-reward'); rewardArea.hidden = animate;
    const definition = saved.kind === 'furniture' ? G.data.furnitureById[saved.itemId] : null, name = rewardName(saved), title = el('h3', '', name);
    title.id = 'gift-reward-' + (++serial); rewardArea.setAttribute('aria-labelledby', title.id);
    let canvas = null;
    if (definition) { canvas = el('canvas', 'gift-reward-art'); canvas.width = 260; canvas.height = 200; canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', name); rewardArea.append(canvas); }
    else { const coins = el('div', 'gift-coin-art'); coins.setAttribute('aria-hidden', 'true'); coins.append(el('i'), el('i'), el('i')); rewardArea.append(coins); }
    rewardArea.append(title, el('p', 'gift-reward-copy', definition ? '已放进家具背包，并点亮收藏图鉴。摆出或送走后，仍算收集过。' : '当前等级的普通家具已收齐，回礼已放进糖果罐。'));
    if (definition) ui.furnitureRarity?.decorate(rewardArea, definition, { preview: canvas });
    rewardArea.append(el('p', 'gift-reward-payment', payment(saved) + (definition ? '' : ' · 回礼 ' + number(saved.coin) + ' 颗 · 本次净增加 ' + number(saved.coin - (saved.paid ? C.paidCost : 0)) + ' 颗')),
      el('p', 'gift-reward-record', '已存回执 · ' + savedAt(saved)), el('p', 'gift-receipt-id', '凭据 ' + saved.id));
    const actions = el('div', 'gift-actions'), timers = new Set();
    let closed = false, revealed = false, paintFrame = null, handle = null;
    const current = () => !closed && born === archive && body.isConnected && activeHandle === handle;
    const skip = button('跳过动画，看礼物', 'skip', () => reveal(false)), keep = button('收好礼物', 'keep', () => { if (current()) handle.close(); }, 'ui-button ui-button-primary');
    const close = button('关闭', 'close', () => { if (current()) handle.close(); });
    keep.hidden = animate; skip.hidden = !animate; actions.append(skip, keep, close); body.append(status, scene, rewardArea, actions);
    function clearTimers() { timers.forEach(clearTimeout); timers.clear(); }
    function clearArt() {
      if (paintFrame !== null) cancelAnimationFrame(paintFrame); paintFrame = null;
      if (canvas) { canvas.width = canvas.height = 0; canvas = null; }
    }
    function reveal(withConfetti) {
      if (!current() || revealed) return;
      // 隐藏持焦按钮会先退焦到body，须在改变显示状态前记住焦点。
      const skipFocused = document.activeElement === skip;
      revealed = true; clearTimers();
      body.classList.remove('is-shaking', 'is-lifting'); body.classList.add('is-open');
      if (withConfetti && !replay && !document.hidden && !preference?.matches) body.classList.add('is-celebrating');
      rewardArea.hidden = false; skip.hidden = true; keep.hidden = false;
      status.textContent = replay ? '上次的礼物已存好。重看不会扣糖果或重复发奖。' : '已保存 · ' + name + '，安心收好吧。';
      if (canvas) paintFrame = requestAnimationFrame(() => {
        paintFrame = null; if (!current() || !canvas?.isConnected) return;
        try { G.render.drawThumbnail(canvas, saved.itemId); }
        catch (_) { if (current()) { clearArt(); rewardArea.prepend(el('p', 'gift-art-unavailable', '家具插图暂不可用，礼物已保存。')); } }
      });
      if (skipFocused) keep.focus({ preventScroll: true });
    }
    const visibility = () => { if (document.hidden) { body.classList.remove('is-celebrating'); reveal(false); } };
    const motionChange = () => { if (preference.matches) { body.classList.remove('is-celebrating'); reveal(false); } };
    handle = modal(replay ? '上次收好的心意' : '糯米送来的礼物', body, () => {
      closed = true; clearTimers(); clearArt(); document.removeEventListener('visibilitychange', visibility);
      if (preference?.removeEventListener) preference.removeEventListener('change', motionChange); else preference?.removeListener?.(motionChange);
      body.classList.remove('is-shaking', 'is-lifting', 'is-celebrating');
      // 抽屉可能已被公共刷新替换，优先回到当前礼盒按钮。
      if (born === archive) { prune(); const target = [...lobbies].find(session => owns(session)); target?.action.focus({ preventScroll: true }); }
    });
    if (born !== archive) { handle.close(); return; }
    document.addEventListener('visibilitychange', visibility);
    if (preference?.addEventListener) preference.addEventListener('change', motionChange); else preference?.addListener?.(motionChange);
    if (animate) {
      body.classList.add('is-shaking');
      const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (current()) fn(); }, ms); timers.add(id); };
      later(() => { body.classList.remove('is-shaking'); body.classList.add('is-lifting'); }, C.liftAfterMs); later(() => reveal(true), C.revealAfterMs);
    } else reveal(false);
    if (!replay && current() && !document.hidden) G.audio.play('success');
  }
  function read() {
    const state = G.sys.gifts.status(), latest = receipt(G.sys.gifts.latest());
    if (!state || !Number.isFinite(state.cost) || !Number.isFinite(state.remaining) || !Number.isFinite(state.total)) throw new Error('礼盒状态暂不可读');
    return { state, latest };
  }
  function update(session, feedback) {
    if (session.disposed || session.archive !== archive) return;
    try {
      const snapshot = read(); if (session.disposed || session.archive !== archive) return; session.snapshot = snapshot;
      const { state, latest } = snapshot;
      session.body.dataset.state = !state.canOpen ? 'blocked' : state.freeAvailable ? 'free' : 'paid';
      session.heading.textContent = state.freeAvailable ? '今天的小心意，等你拆开' : state.clockBehind ? '这份心意，仍可用糖果拆开' : '再拆一份小心意';
      session.balance.textContent = number(state.coin) + ' 颗'; session.price.textContent = state.cost ? number(state.cost) + ' 颗游戏糖果' : '免费 · 不扣糖果';
      session.pool.textContent = '当前等级 · 未收 ' + number(state.remaining) + ' / ' + number(state.total) + ' 件';
      session.poolTrack.max = Math.max(1, state.total); session.poolTrack.value = Math.max(0, state.total - state.remaining);
      session.poolNote.textContent = state.remaining ? '从历史未收的普通家具中随机一件，含庭院家具。摆出或送走仍算已收；升级后会开放新候选。' : '当前等级已收齐，回礼 ' + number(C.completeCoins) + ' 颗糖果。' + (state.cost ? '须先有 ' + number(state.cost) + ' 颗，本次净增加 ' + number(C.completeCoins - state.cost) + ' 颗。' : '本次免费，净增加 ' + number(C.completeCoins) + ' 颗。');
      session.action.textContent = state.freeAvailable ? '拆今日免费礼盒' : '用 ' + number(state.cost) + ' 糖果拆礼盒'; session.action.disabled = session.busy || !state.canOpen;
      session.message.textContent = feedback || state.reason || (state.clockBehind ? '本地日期 ' + state.date + ' 早于免费记录 ' + state.savedDate + '。暂不新增免费机会，仍可用 ' + number(C.paidCost) + ' 糖果拆盒。' : state.freeAvailable ? '今日免费机会还在。先保存，再打开这份心意。' : '今天的免费心意已收好，下一份免费礼盒明天见。');
      session.record.textContent = latest ? '最近已存 · ' + rewardName(latest) : '还没有已存回执，拆开第一份心意后会留在这里。';
      session.lastArt.hidden = !latest || latest.kind !== 'furniture'; session.lastCoins.hidden = !latest || latest.kind !== 'coin';
      if (session.frame !== null) cancelAnimationFrame(session.frame); session.frame = null;
      if (latest?.kind === 'furniture' && session.artId !== latest.itemId) {
        session.frame = requestAnimationFrame(() => {
          session.frame = null; if (!owns(session) || session.snapshot?.latest?.itemId !== latest.itemId) return;
          try { G.render.drawThumbnail(session.lastArt, latest.itemId); session.artId = latest.itemId; }
          catch (_) { session.lastArt.hidden = true; }
        });
      }
      session.recordDetail.textContent = latest ? savedAt(latest) + ' · ' + payment(latest) : '这里只保留最近一份礼盒结果。';
      session.replay.hidden = !latest; session.replay.disabled = session.busy || !latest;
      session.date.textContent = '本地日期 ' + state.date + ' · 累计已拆 ' + number(state.opened) + ' 盒';
    } catch (_) {
      session.snapshot = null; session.body.dataset.state = 'unreadable'; session.heading.textContent = '礼盒记录暂时没能读好'; session.balance.textContent = session.price.textContent = '暂不可读';
      session.pool.textContent = '未收池暂不可读'; session.poolTrack.max = 1; session.poolTrack.value = 0; session.poolNote.textContent = '重新读好记录后，再确认本次预算和礼物去向。'; session.action.textContent = '等待重新读取'; session.action.disabled = true;
      session.message.textContent = feedback || '请重新读取状态，再确认开盒资格。'; session.record.textContent = '最近回执暂不可读'; session.recordDetail.textContent = ''; session.replay.hidden = true; session.date.textContent = '';
      session.lastArt.hidden = session.lastCoins.hidden = true;
    }
    session.retry.disabled = session.busy; session.message.setAttribute('role', feedback ? 'alert' : 'status');
  }
  function refresh() { prune(); lobbies.forEach(session => { if (!session.busy) update(session); }); }
  function openBox(session) {
    if (!canAct(session) || session.busy || opening) return;
    session.busy = opening = true; session.body.setAttribute('aria-busy', 'true'); session.action.disabled = session.retry.disabled = session.replay.disabled = true;
    let message = '', saved = null;
    try {
      const before = session.snapshot?.state, { state } = read();
      if (!canAct(session)) return;
      if (!state.canOpen) message = state.reason || '这份礼盒暂时不能拆开，请重新读取状态。';
      else if (!before || state.cost !== before.cost) message = '本次预算已变化，请确认最新按钮上的费用，再拆这份礼盒。';
      else {
        const result = G.sys.gifts.open(); if (!canAct(session)) return;
        if (!result?.ok) message = result?.message || '开盒结果暂未确认，请重新读取状态。';
        else {
          saved = receipt(G.sys.gifts.latest()); if (!canAct(session)) return;
          if (!saved || !keys.every(key => saved[key] === result.reward?.[key])) { saved = null; message = '已存回执暂未确认，请重新读取状态后查看最近礼物。'; }
        }
      }
    } catch (_) { saved = null; message = '开盒结果暂未确认，请重新读取状态，再查看最近已存回执。'; }
    finally { session.busy = opening = false; session.body.setAttribute('aria-busy', 'false'); }
    if (!canAct(session)) return;
    update(session, message); if (!canAct(session)) return;
    if (saved) showReward(saved);
    else { session.message.focus({ preventScroll: true }); }
  }
  function make(kind) {
    prune(); lobbies.forEach(session => { if (!session.mounted && !session.body.isConnected) dispose(session); });
    const body = el('div', 'gift-lobby gift-v2'), session = { body, kind, archive, disposed: false, busy: false, snapshot: null, frame: null, artId: null };
    const copy = el('div', 'gift-lobby-copy'), heading = el('h3'), intro = el('p', 'gift-intro', '每天本地日期首盒免费，之后每盒 ' + number(C.paidCost) + ' 颗游戏糖果。漏日不补，每次只拆一份。');
    const budget = el('dl', 'gift-budget'), balance = el('dd'), price = el('dd'); budget.append(el('dt', '', '糖果罐'), balance, el('dt', '', '本次预算'), price);
    const message = el('p', 'gift-message'); message.id = 'gift-status-' + (++serial); message.tabIndex = -1; message.dataset.uiFocus = 'gifts-status'; message.setAttribute('aria-live', 'polite'); message.setAttribute('aria-atomic', 'true');
    const action = button('拆礼盒', 'open', () => openBox(session), 'ui-button ui-button-primary'); action.setAttribute('aria-describedby', message.id);
    const retry = button('重新读取状态', 'retry', () => { if (canAct(session) && !opening) { update(session); if (owns(session)) session.message.focus({ preventScroll: true }); } });
    const actions = el('div', 'gift-actions'); actions.append(action, retry); copy.append(heading, intro);
    const details = el('div', 'gift-details'), pool = el('h4', 'gift-pool'), poolTrack = el('progress', 'gift-pool-track'), poolNote = el('p', 'gift-pool-note'), record = el('h4', 'gift-record'), recordDetail = el('p', 'gift-record-detail');
    poolTrack.setAttribute('aria-label', '当前等级家具收藏进度');
    const replay = button('查看上次礼物', 'replay', () => {
      if (!canAct(session) || opening) return;
      try { const saved = receipt(G.sys.gifts.latest()); if (!owns(session)) return; if (saved) showReward(saved, { replay: true }); else update(session); }
      catch (_) { if (owns(session)) { update(session, '最近回执暂不可读，请重新读取状态。'); session.message.focus({ preventScroll: true }); } }
    });
    const history = el('section', 'gift-last'), lastArt = el('canvas', 'gift-last-art'), lastCoins = el('div', 'gift-coin-art gift-last-coins'), historyCopy = el('div', 'gift-last-copy');
    lastArt.width = 112; lastArt.height = 98; lastArt.setAttribute('aria-hidden', 'true'); lastCoins.setAttribute('aria-hidden', 'true'); lastCoins.append(el('i'), el('i'), el('i')); historyCopy.append(record, recordDetail);
    history.append(lastArt, lastCoins, historyCopy, replay); details.append(pool, poolTrack, poolNote);
    const footer = el('details', 'gift-footnote'), date = el('p', 'gift-date'); footer.append(el('summary', '', '礼盒里会有什么？'), el('p', 'gift-small', '节日和专属家具有各自的获取方式。家具收进背包，糖果回礼放进糖果罐。'), el('p', 'gift-local-note', '这里只使用游戏里的糖果币，没有真钱购买。礼物先保存，跳过动画或提前关闭也不会丢。'));
    const hero = el('div', 'gift-lobby-hero'); hero.append(illustration(), copy);
    body.append(hero, date, details, budget, actions, message, history, footer); Object.assign(session, { heading, balance, price, message, action, retry, pool, poolTrack, poolNote, record, recordDetail, replay, date, lastArt, lastCoins });
    lobbies.add(session); update(session); return session;
  }
  function content() { return make('content').body; }
  function panel() { return { title: '🎁 糯米的小礼盒', subtitle: '每天一份，慢慢收集新的心意', content: make('panel').body }; }
  function open() { ui.panel.close(); ui.controls.close(); const session = make('modal'); return modal('糯米的小礼盒', session.body, () => dispose(session)); }
  G.bus.on('state:change', refresh);
  G.bus.on('panel:change', prune);
  G.bus.on('modal:closed', prune);
  G.bus.on('state:replace', () => { archive++; lobbies.forEach(dispose); activeHandle?.close(); activeHandle = null; });
  ui.gifts = { open, panel, content };
})(window.Game);
