/* 七份心意只读原系统状态；保存成功后，才收好这一份。 */
(function (G) {
  'use strict';
  const ui = G.ui = G.ui || {}, D = G.data;
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
  const number = value => Number(value || 0).toLocaleString('zh-CN');
  function giftSymbol(kind) {
    const paths = { coin: '<path d="m7 7 10 10M7 17 17 7M7 7C1 5 2 1 7 3l2 2M17 17c6 2 5 6 0 4l-2-2"/><rect x="6" y="6" width="12" height="12" rx="5"/>', seeds: '<path d="M12 21v-9M12 14C3 14 3 5 3 5s9-1 9 9Zm0-4C12 2 21 3 21 3s0 8-9 8"/>', furniture: '<path d="M5 12V6a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v6M4 12h16v8H4zM4 16h16M7 20v2M17 20v2"/>', check: '<path d="m4 12 5 5L21 4"/>' };
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + (paths[kind] || paths.furniture) + '</svg>';
  }
  let active = null, activeHandle = null, archive = 0, serial = 0, feedback = null, promptDate = '', promptTimer = 0;
  function owns(session) {
    if (!session || active !== session || session.disposed || session.archive !== archive || !session.body.isConnected) return false;
    const host = document.getElementById('panel');
    if (session.kind === 'modal') return activeHandle === session.handle && !!session.handle?.element.isConnected && session.handle.element.contains(session.body);
    if (session.kind === 'panel' || host?.contains(session.body)) return !!host && !host.classList.contains('hidden') && host.dataset.kind === 'login' && host.contains(session.body);
    return true;
  }
  function scrollHost(session) {
    if (session.kind === 'modal') return session.handle?.body;
    return document.getElementById('panel-body')?.contains(session.body) ? document.getElementById('panel-body') : session.body.parentElement;
  }
  function clearArt(session) {
    if (session.frame !== null) cancelAnimationFrame(session.frame);
    session.frame = null;
    if (session.canvas) {
      try { session.canvas.getContext('2d')?.clearRect(0, 0, session.canvas.width, session.canvas.height); } catch (_) { /* 关闭不依赖绘图。 */ }
      session.canvas.width = 0; session.canvas.height = 0; session.canvas = null;
    }
  }
  function dispose(session) {
    if (!session || session.disposed) return;
    session.disposed = true; clearArt(session); session.action.disabled = true; session.retry.disabled = true;
    if (active === session) active = null;
  }
  function localButton(session, text, key, action, cls) {
    const node = el('button', cls, text); node.type = 'button'; node.dataset.uiFocus = 'login-' + key;
    node.addEventListener('click', () => { if (owns(session) && !session.busy && !node.disabled) action(); }); return node;
  }
  function read() {
    const state = G.sys.login.status(), latest = G.sys.login.latest();
    if (!state || !Array.isArray(D.loginDays) || D.loginDays.length !== 7) throw new Error('心意记录暂不可读');
    // 今天已收与回拨只回看真实凭据；旧档没有凭据时绝不拿下一份代替。
    const reward = state.claimedToday || state.clockBehind ? latest : state.reward;
    const def = reward?.kind === 'furniture' ? D.furnitureById[reward.itemId] : null;
    if (reward && (!D.loginDays[reward.day - 1] || reward.kind === 'furniture' && !def)) throw new Error('礼物详情暂不可读');
    return { state, reward, def };
  }
  function make(kind) {
    const previous = active, keep = previous?.kind === kind && owns(previous), host = keep && scrollHost(previous);
    const focused = keep && previous.body.contains(document.activeElement) ? document.activeElement.dataset.uiFocus : null;
    const focusKey = keep ? previous.focusKey || focused : null, scroll = host ? host.scrollTop : null;
    if (previous?.kind === 'modal') activeHandle?.close();
    dispose(previous); if (!keep) feedback = null;
    const body = el('div', 'login-book login-v2'), session = { body, kind, archive, disposed: false, busy: false, frame: null, canvas: null, focusKey, scroll };
    active = session;
    const top = el('div', 'login-top'), copy = el('div', 'login-top-copy'), heading = el('h3'), intro = el('p', 'login-intro', '每个本地日期收一份，七份一轮。漏登不清零、不跳份，也不补领。');
    const cycle = el('p', 'login-cycle'); top.append(copy, cycle); copy.append(heading, intro);
    const days = el('ol', 'login-days'); days.setAttribute('aria-label', '七份心意进度');
    const present = el('section', 'login-present'), art = el('div', 'login-present-art'), detail = el('div', 'login-present-copy'); art.setAttribute('aria-hidden', 'true');
    const title = el('h4'), date = el('p', 'login-date'), description = el('p', 'login-detail'), destination = el('p', 'login-destination'), message = el('p', 'login-message');
    title.id = 'login-present-' + (++serial); present.setAttribute('aria-labelledby', title.id);
    message.id = 'login-status-' + serial; message.tabIndex = -1; message.dataset.uiFocus = 'login-status';
    message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite'); message.setAttribute('aria-atomic', 'true');
    const response = el('p', 'login-feedback'); response.tabIndex = -1; response.dataset.uiFocus = 'login-feedback'; response.setAttribute('aria-atomic', 'true');
    const action = localButton(session, '收下这份心意', 'claim', () => claim(session), 'ui-button ui-button-primary'); action.setAttribute('aria-describedby', message.id);
    const retry = localButton(session, '重新读取状态', 'retry', () => { feedback = null; session.focusKey = 'login-retry'; update(session); }, 'ui-button ui-button-soft');
    const actions = el('div', 'login-actions'); actions.append(action, retry);
    detail.append(title, description, destination); present.append(art, detail);
    const footer = el('details', 'login-footnote'), total = el('p', 'login-total'), rules = el('p'), record = el('p', 'login-record');
    const coins = D.loginDays.reduce((sum, item) => sum + item.coin, 0), seeds = Object.values(D.loginConfig.seeds).reduce((sum, count) => sum + count, 0);
    total.textContent = '每轮 ' + coins + '颗糖果 · ' + seeds + '粒种子 · ' + D.loginDays.filter(item => item.kind === 'furniture').length + '件家具';
    rules.textContent = '收齐第七份当天仍是本轮7/7，下个可领取的本地日期才开启新一轮。每次先保存，再收好心意。'; footer.append(el('summary', '', '按自己的节奏，一份一份往前'), total, rules, record);
    body.append(top, date, days, present, message, response, actions, footer);
    Object.assign(session, { heading, cycle, days, art, title, date, description, destination, message, response, action, retry, record });
    update(session); return session;
  }
  function progress(session, state) {
    session.days.replaceChildren();
    D.loginDays.forEach(definition => {
      const done = definition.day <= state.completed, current = !state.claimedToday && !state.clockBehind && definition.day === state.day;
      const item = el('li', 'login-day' + (done ? ' is-collected' : '') + (current ? ' is-current' : ''));
      if (current) item.setAttribute('aria-current', 'step');
      const icon = el('span', 'login-day-icon'); icon.innerHTML = giftSymbol(done ? 'check' : definition.kind); icon.setAttribute('aria-hidden', 'true');
      item.append(el('span', 'login-day-number', '第' + definition.day + '份'), icon, el('strong', 'login-day-name', definition.name), el('span', 'login-day-mark', done ? '✓ 已收好' : current ? state.canClaim ? '本次可领' : '本次待领' : '之后的心意')); session.days.append(item);
    });
  }
  function giftArt(session, reward, def) {
    clearArt(session); session.art.replaceChildren();
    if (def) {
      const canvas = el('canvas'); canvas.width = 260; canvas.height = 190; session.canvas = canvas; session.art.append(canvas);
    } else {
      const gift = el('div', 'login-gift' + (!reward ? ' is-kept' : reward.kind === 'seeds' ? ' is-seeds' : ''));
      const seal = el('span', 'login-gift-seal login-present-icon'); seal.innerHTML = giftSymbol(!reward ? 'check' : reward.kind);
      gift.append(el('span', 'login-gift-loop'), el('span', 'login-gift-lid'), el('span', 'login-gift-box'), el('span', 'login-gift-ribbon'), seal); session.art.append(gift);
    }
  }
  function showFeedback(session) {
    session.response.hidden = !feedback; session.response.className = 'login-feedback' + (feedback ? feedback.ok ? ' is-success' : ' is-error' : '');
    session.response.setAttribute('role', feedback && !feedback.ok ? 'alert' : 'status'); session.response.textContent = feedback?.message || '';
  }
  function update(session) {
    if (session.disposed || active !== session) return;
    const host = owns(session) && scrollHost(session); if (host && session.scroll === null) session.scroll = host.scrollTop;
    try {
      const { state, reward, def } = read(); session.snapshot = { state, reward, def };
      session.body.dataset.state = state.clockBehind ? 'clock' : state.claimedToday ? 'claimed' : state.canClaim ? 'ready' : 'blocked';
      session.heading.textContent = state.clockBehind ? '等日期赶上，心意还在' : state.claimedToday ? '今天的心意，已经收好' : '给慢慢回来的你，一份心意';
      session.cycle.textContent = '第' + number(state.cycle) + '轮 · ' + state.completed + '/7份';
      session.date.textContent = '本地日期 ' + state.date + (state.lastClaimDate ? ' · 上次领取 ' + state.lastClaimDate : ' · 还没有领取记录');
      const prefix = state.clockBehind ? '最近收好' : state.claimedToday ? '已收好' : '本次礼物';
      session.title.textContent = reward ? prefix + ' · 第' + reward.day + '份：' + (reward.kind === 'seeds' ? '花果种子包' : G.sys.login.description(reward)) : '已记录领取，礼物详情未保留';
      session.description.textContent = !reward ? '这份旧记录没有保留礼物详情。已领取进度保留，不推测当时收到了什么。' : reward.kind === 'seeds' ? G.sys.login.description(reward) : def ? (def.rarity === 'rare' ? '稀有' : '精致') + '家具 · ' + (D.themes[def.theme]?.name || def.theme) : G.sys.login.description(reward);
      session.destination.textContent = !reward ? '可以继续查看七份进度，下一可领取日期再来。' : reward.kind === 'furniture' ? '收进背包并点亮收藏图鉴。同款库存加1；满9999件时先整理，不更换这份礼物。' : reward.kind === 'seeds' ? '收入种子袋：小雏菊×3、郁金香×2、草莓×2。Lv6花园开放后就能种。' : '糖果放进小罐子，可以挑家具，也能为小屋添一间新房。';
      session.message.textContent = state.clockBehind ? '当前本地日期' + state.date + '早于领取记录' + state.lastClaimDate + '。须等日期严格晚于记录，才能收下一份心意。' : state.claimedToday && state.completed === 7 ? '本轮七份都收好啦！今天保持7/7，下个可领取的本地日期再从第一份开始。' : state.reason || '这份心意可以领取。收好之后，再等下一个本地日期。';
      session.action.textContent = state.clockBehind ? '等待更晚日期' : state.claimedToday ? '今日已领取' : state.canClaim ? '收下第' + state.day + '份心意' : '暂时无法领取';
      session.action.disabled = session.busy || !state.canClaim; session.retry.disabled = session.busy;
      session.record.textContent = '累计已收 ' + number(state.claimed) + '份 · 家具类别与数量以本次礼物为准';
      progress(session, state); giftArt(session, reward, def);
    } catch (_) {
      session.snapshot = null; session.body.dataset.state = 'unreadable'; session.heading.textContent = '心意记录暂时没能读好'; session.cycle.textContent = '进度暂不可读'; session.title.textContent = '重新读好记录，再收心意';
      session.date.textContent = ''; session.description.textContent = '礼物和领取进度暂不可读。'; session.destination.textContent = ''; session.message.textContent = '请重新读取状态，再确认本次礼物与领取资格。';
      session.action.textContent = '等待重新读取'; session.action.disabled = true; session.retry.disabled = session.busy; session.record.textContent = '累计记录暂不可读'; session.days.replaceChildren(); giftArt(session, null, null);
    }
    showFeedback(session); schedule(session);
  }
  function schedule(session) {
    if (session.frame !== null) cancelAnimationFrame(session.frame);
    session.frame = requestAnimationFrame(() => {
      session.frame = null; if (!owns(session)) { dispose(session); return; }
      const host = scrollHost(session); if (host && session.scroll !== null) { host.scrollTop = session.scroll; session.scroll = null; }
      if (session.focusKey) {
        let target = session.body.querySelector('[data-ui-focus="' + session.focusKey + '"]');
        if (!target || target.disabled || target.hidden) target = feedback ? session.response : session.message;
        target.focus({ preventScroll: true }); session.focusKey = null;
      }
      if (session.canvas && session.snapshot?.def) {
        try { G.render.drawThumbnail(session.canvas, session.snapshot.reward.itemId); }
        catch (_) { if (owns(session)) { clearArt(session); session.art.replaceChildren(el('span', 'login-art-unavailable', '礼物插图暂不可用')); } }
      }
    });
  }
  function claim(session) {
    if (!owns(session) || session.busy) return;
    session.busy = true; session.body.setAttribute('aria-busy', 'true'); session.action.disabled = true; session.retry.disabled = true;
    let result;
    try {
      const { state } = read(); if (!owns(session)) return;
      result = state.canClaim ? G.sys.login.claim() : { ok: false, message: state.reason || '这份心意暂时不能领取，请重新读取状态。' };
      if (!owns(session)) return; feedback = { ok: !!result?.ok, message: result?.message || '领取结果暂未确认，请重新读取状态。' };
    } catch (_) {
      if (!owns(session)) return; feedback = { ok: false, message: '领取结果暂未确认，请重新读取状态，再查看礼物与进度。' };
    } finally { session.busy = false; session.body.setAttribute('aria-busy', 'false'); }
    if (!owns(session)) return;
    session.focusKey = feedback.ok ? 'login-feedback' : 'login-claim'; update(session);
    if (result?.ok && owns(session)) { G.audio.play('success'); if (owns(session)) ui.toast(result.message); }
  }
  function content() { return make('content').body; }
  function panel() { return { title: '🌷 七日心意册', subtitle: '日子慢慢过，心意一份一份收', content: make('panel').body }; }
  function open() {
    activeHandle?.close(); ui.controls.close(); ui.panel.close(); promptDate = G.utils.dateKey();
    const session = make('modal'), handle = ui.modal({ title: '七日心意册', content: session.body, onClose() { dispose(session); if (activeHandle === session.handle) activeHandle = null; } });
    session.handle = handle; activeHandle = handle; handle.element.classList.add('login-modal-card'); return handle;
  }
  // 保持原门禁与关闭后的一次检查，不增加轮询或新的提示策略。
  function maybePrompt() {
    const panel = document.getElementById('panel'), title = document.getElementById('panel-title');
    if (panel && !panel.classList.contains('hidden')) { if (title?.textContent.includes('七日心意册')) promptDate = G.utils.dateKey(); return false; }
    if (promptDate === G.utils.dateKey() || document.hidden || !G.state.tutorial.done || document.querySelector('.modal-backdrop')) return false;
    try { if (!G.sys.login.status().canClaim) return false; } catch (_) { return false; }
    open(); return true;
  }
  G.bus.on('panel:change', () => { if (active && active.kind !== 'modal' && !owns(active)) { dispose(active); feedback = null; } });
  G.bus.on('modal:closed', () => {
    if (active && !owns(active)) dispose(active);
    clearTimeout(promptTimer); promptTimer = setTimeout(() => { promptTimer = 0; maybePrompt(); }, 700);
  });
  G.bus.on('state:replace', () => { archive++; dispose(active); feedback = null; activeHandle?.close(); activeHandle = null; promptDate = ''; clearTimeout(promptTimer); promptTimer = 0; });
  ui.login = { content, panel, open, maybePrompt };
})(window.Game);
