/* 阁楼入口与观星记录，继续使用小屋的抽屉、按钮与可读状态提示。 */
(function (G) {
  'use strict';
  const ui = G.ui = G.ui || {}, C = G.data.observatoryConfig;
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
  const button = (text, action, cls) => { const node = el('button', cls || 'ui-button', text); node.type = 'button'; node.addEventListener('click', action); return node; };
  const number = value => Number(value || 0).toLocaleString('zh-CN');
  let active = null, archive = 0, feedback = null;
  function open() { ui.open('observatory'); }
  function entry() {
    const state = G.sys.observatory.status(), epoch = archive;
    return button('🔭 阁楼天文台' + (!state.unlocked ? ' · Lv' + C.unlockLv + '开放' : state.needsRebuild ? ' · 免费重建' : state.inconsistent ? ' · 待核对' : !state.built ? ' · ' + number(state.price) + '糖果' : ''), () => { if (epoch === archive) open(); }, 'ui-button ui-button-soft');
  }
  function panel() {
    const previous = active, host = document.getElementById('panel-body');
    const focused = previous && owns(previous) && previous.body.contains(document.activeElement) ? document.activeElement.dataset.uiFocus : null;
    const scroll = previous && owns(previous) && host ? host.scrollTop : null;
    dispose(previous);
    const body = el('div', 'observatory-panel observatory-v2'), intro = el('div', 'observatory-intro'), scene = el('figure', 'observatory-scene'), picture = el('canvas', 'observatory-picture'), copy = el('div', 'observatory-copy');
    const session = { body, archive, frame: null, canvases: [picture], busy: false, disposed: false, focusKey: focused, scroll };
    active = session;
    picture.width = 640; picture.height = 370; picture.setAttribute('role', 'img');
    scene.append(picture, el('figcaption', 'observatory-scene-caption', '一扇穹顶，把小屋与星空相连'));
    const heading = el('h3'), date = el('p', 'observatory-date'), note = el('p', 'observatory-note'), message = el('p', 'observatory-message');
    message.id = 'observatory-current-status'; message.dataset.uiFocus = 'observatory-status'; message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
    const response = el('p', 'observatory-feedback'); response.tabIndex = -1; response.dataset.uiFocus = 'observatory-feedback'; response.setAttribute('aria-atomic', 'true');
    const action = localButton(session, '观星', 'action', () => act(session), 'ui-button ui-button-primary'); action.setAttribute('aria-describedby', message.id);
    const decor = localButton(session, '布置天文台', 'decor', () => {
      const state = G.sys.observatory.status();
      if (!state.built || !state.floorId) { ui.toast(state.reason); return; }
      if (!G.buildingEditor || typeof G.buildingEditor.focusFloor !== 'function' || !G.buildingEditor.focusFloor(state.floorId)) { ui.toast('观星楼层暂时不能打开，请重新读取小屋。'); return; }
      dispose(session); feedback = null; ui.open('decor');
    }, 'ui-button ui-button-soft observatory-decor');
    const settings = localButton(session, '去设置夜晚', 'settings', () => { dispose(session); feedback = null; ui.open('settings'); }, 'ui-button ui-button-soft');
    const retry = localButton(session, '重新读取状态', 'retry', () => { session.focusKey = 'observatory-retry'; update(session); }, 'ui-button ui-button-soft');
    const actions = el('div', 'observatory-actions'); actions.append(action, decor, settings, retry);
    copy.append(date, heading, note, message, response, actions); intro.append(copy); body.append(intro);
    const stats = el('div', 'observatory-totals'), fragments = el('p'), observations = el('p'); stats.setAttribute('aria-label', '累计观星记录'); stats.append(fragments, observations);
    const record = el('section', 'observatory-record'), recordHeading = el('h3', '', '最近一条星空记录'), recordBody = el('div'); record.append(recordHeading, recordBody);
    const rules = el('details', 'observatory-rules');
    rules.append(el('summary', '', '今夜观星的规则'), el('p', '', '真实夜晚为20:00至次日06:00，也可在设置选择永远夜晚。每个本地日历日期一次，须晚于上次日期；跨过午夜可在夜晚再观星，早上6点不重置，漏日不补领。'), el('p', '', '每次观星收下' + C.dailyFragments + '枚星星碎片，累计次数加1。小屋星座是想象星群，按日期固定，也可能重复遇见。'));
    const attic = el('details', 'observatory-attic-preview'); attic.append(el('summary', '', '看看穹顶里的望远镜'), scene);
    body.append(stats, record, attic, rules);
    Object.assign(session, { picture, heading, date, note, message, response, action, decor, settings, retry, fragments, observations, recordBody });
    update(session);
    return { title: '🔭 阁楼天文台', subtitle: '抬头一小会儿，把星光收进小屋', content: body };
  }
  // 抽屉关闭后仍连接DOM，因此还需核对宿主、模式与档案代次。
  function owns(session) {
    const host = document.getElementById('panel');
    return !!session && active === session && !session.disposed && session.archive === archive && session.body.isConnected && !!host && !host.classList.contains('hidden') && host.dataset.kind === 'observatory' && G.runtime.mode === 'observatory' && host.contains(session.body);
  }
  function clearCanvas(canvas) {
    try { const ctx = canvas.getContext('2d'); if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height); } catch (_) { /* 清理不阻断关闭。 */ }
    canvas.width = 0; canvas.height = 0;
  }
  function dispose(session) {
    if (!session || session.disposed) return;
    session.disposed = true;
    if (session.frame !== null) cancelAnimationFrame(session.frame);
    session.frame = null; session.canvases.forEach(clearCanvas);
    if (active === session) active = null;
  }
  function localButton(session, text, key, action, cls) {
    const node = button(text, () => { if (owns(session) && !session.busy) action(); }, cls);
    node.dataset.uiFocus = 'observatory-' + key; return node;
  }
  function read() {
    const state = G.sys.observatory.status(), latest = G.sys.observatory.latest();
    const def = latest ? G.data.constellationById[latest.id] : null;
    if (!state || latest && !def) throw new Error('星空记录暂不可读');
    return { state, latest, def };
  }
  function stateView(state) {
    const full = state.observations >= C.maxObservations || state.fragments + C.dailyFragments > C.maxFragments;
    if (!state.unlocked) return ['locked', '把小屋的屋顶，留给星星', 'Lv.' + C.unlockLv + ' 开放天文台'];
    if (state.inconsistent) return ['invalid', '观星楼层与购买记录需要核对', '请先检查存档'];
    if (state.needsRebuild) return ['rebuild', '星空回忆还在，重新搭起观星楼层', '免费重建天文台'];
    if (!state.built) return [state.canBuild ? 'build' : 'poor', '在阁楼，安放一台望远镜', state.canBuild ? '建造天文台 · ' + number(state.price) + '糖果' : '糖果不足 · 需' + number(state.price) + '颗'];
    if (state.clockBehind) return ['clock', '设备日期需要赶上记录', '日期暂不可用'];
    if (state.alreadyObserved) return ['claimed', '今天的星光，已经收好', '今天已观星'];
    if (!state.night) return ['day', '等夜幕，为穹顶点亮星星', '等待夜晚'];
    if (full) return ['full', '星光已攒满，回看这段夜空', '碎片已达上限'];
    return ['ready', '今晚，星星在等你', '观星 · 收下' + C.dailyFragments + '枚碎片'];
  }
  function showFeedback(session) {
    session.response.hidden = !feedback;
    session.response.className = 'observatory-feedback' + (feedback ? feedback.ok ? ' is-success' : ' is-error' : '');
    session.response.setAttribute('role', feedback && !feedback.ok ? 'alert' : 'status');
    session.response.textContent = feedback ? feedback.message : '';
  }
  function update(session) {
    if (session.disposed || active !== session) return;
    try {
      const { state, latest, def } = read(), [code, title, label] = stateView(state);
      session.snapshot = { state, def };
      session.body.dataset.state = code; session.heading.textContent = title;
      session.date.textContent = '本地日期 ' + state.date + ' · ' + (state.night ? '夜晚' : '白天或黄昏');
      session.note.textContent = state.built ? '天文台是小屋中的真实楼层，可以继续摆放家具和布置画作。每个本地日期，在夜晚抬头一次，把一小片星光留在小屋。' : state.needsRebuild ? '购买记录与星空回忆都保留。免费重建会增加真实观星楼层和围墙，原有建筑不会被替换。' : '搭建后会在小屋上方增加观星楼层和围墙，原有房间和家具保持。';
      session.message.textContent = code === 'clock' ? '当前日期' + state.date + '早于已保存的' + latest?.date + '。须等本地日期严格晚于记录日期，才能再次观星。' : code === 'claimed' ? '今天已收下' + C.dailyFragments + '枚碎片。须到更晚的本地日期，并在夜晚再次观星。' : code === 'full' ? '累计星星碎片已达上限，最近一条记录仍可回看。' : state.reason;
      session.action.textContent = label; session.action.disabled = session.busy || !(state.built ? state.canObserve : state.canBuild);
      const canDecorate = state.built && !!state.floorId;
      session.decor.hidden = !canDecorate; session.decor.disabled = session.busy || !canDecorate;
      session.settings.hidden = !(state.built && state.unlocked && !state.night && !state.alreadyObserved); session.settings.disabled = session.busy;
      session.retry.disabled = session.busy;
      session.picture.setAttribute('aria-label', state.built ? '阁楼圆顶下的粉色望远镜' : '准备建在屋顶上的阁楼天文台');
      session.fragments.textContent = '星星碎片 ' + number(state.fragments) + ' 枚'; session.observations.textContent = '累计观星 ' + number(state.observations) + ' 次';
      session.canvases.slice(1).forEach(clearCanvas); session.canvases = [session.picture]; session.recordBody.replaceChildren();
      if (latest) {
        const discovery = el('div', 'observatory-discovery'), canvas = el('canvas', 'observatory-star-map'), copy = el('div', 'observatory-star-copy');
        canvas.width = 560; canvas.height = 320; canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', def.name + '的静态星群');
        copy.append(el('p', 'observatory-date', latest.date + ' · 收下' + latest.fragments + '枚碎片'), el('h4', '', def.name), el('p', '', def.story), el('p', 'observatory-record-note', '这里只保留最近一条记录。重看这片星空，不会重复领取碎片。'));
        discovery.append(canvas, copy); session.recordBody.append(discovery); session.canvases.push(canvas);
      } else session.recordBody.append(el('p', 'observatory-empty', state.built ? '还没有观星记录。等一个可以观星的夜晚，再把第一段星空收好。' : '望远镜还未搬上阁楼。建好后，第一段星空记录会留在这里。'));
      showFeedback(session); schedule(session);
    } catch (_) {
      session.snapshot = null; session.body.dataset.state = 'unreadable'; session.heading.textContent = '星空记录暂时没能读好'; session.date.textContent = ''; session.note.textContent = '请重新读取当前进度，再确认今夜可以做什么。';
      session.message.textContent = '读取失败，当前行动已暂停。'; session.action.textContent = '等待重新读取'; session.action.disabled = true; session.decor.hidden = true; session.decor.disabled = true; session.settings.hidden = true; session.retry.disabled = session.busy;
      session.fragments.textContent = '星星碎片 暂不可读'; session.observations.textContent = '累计观星 暂不可读';
      session.canvases.slice(1).forEach(clearCanvas); session.canvases = [session.picture]; session.recordBody.replaceChildren(el('p', 'observatory-empty', '最近记录暂不可读，请重新读取。'));
      showFeedback(session); schedule(session);
    }
  }
  function schedule(session) {
    if (session.frame !== null) cancelAnimationFrame(session.frame);
    session.frame = requestAnimationFrame(() => {
      session.frame = null;
      if (!owns(session)) { dispose(session); return; }
      const host = document.getElementById('panel-body');
      if (host && session.scroll !== null) { host.scrollTop = session.scroll; session.scroll = null; }
      if (session.focusKey) {
        let target = session.body.querySelector('[data-ui-focus="' + session.focusKey + '"]');
        if (!target || target.disabled || target.hidden) target = feedback ? session.response : session.message;
        target.tabIndex = target.tagName === 'BUTTON' ? 0 : -1; target.focus({ preventScroll: true }); session.focusKey = null;
      }
      try {
        const snapshot = session.snapshot;
        const ctx = session.picture.getContext('2d'); if (!ctx) throw new Error('Canvas不可用');
        ctx.clearRect(0, 0, 640, 370); G.draw.observatory.draw(ctx, 0, 0, 640, 370, snapshot ? snapshot.state.night : true);
        if (snapshot?.def && session.canvases[1]) {
          const star = session.canvases[1].getContext('2d'); if (!star) throw new Error('Canvas不可用');
          G.draw.observatory.drawConstellation(star, snapshot.def, 0, 0, 560, 320);
        }
      } catch (_) {
        session.canvases.forEach(canvas => { try { canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height); } catch (_) {} });
        session.message.textContent += ' 星空插图暂不可用，可重新读取；文字记录仍可阅读。';
      }
    });
  }
  function act(session) {
    if (!owns(session) || session.busy) return;
    session.busy = true; session.body.setAttribute('aria-busy', 'true'); session.action.disabled = true; session.decor.disabled = true; session.settings.disabled = true; session.retry.disabled = true;
    let result;
    try {
      const { state } = read();
      if (!owns(session)) return;
      result = state.built ? state.canObserve ? G.sys.observatory.observe() : { ok: false, message: state.reason } : state.canBuild ? G.sys.observatory.build() : { ok: false, message: state.reason };
      // 系统提交为同步；如果期间关闭或换档，迟到的反馈不可进入新面板。
      if (!owns(session)) return;
      feedback = { ok: !!result?.ok, message: result?.message || '这次行动未能确认，请重新读取当前状态。' };
    } catch (_) {
      if (!owns(session)) return;
      feedback = { ok: false, message: '这次行动未能确认，请重新读取当前状态后再试。' };
    } finally {
      session.busy = false; session.body.setAttribute('aria-busy', 'false');
    }
    if (!owns(session)) return;
    session.focusKey = feedback.ok ? 'observatory-feedback' : 'observatory-action';
    update(session);
    if (result?.ok) { G.audio.play('success'); ui.toast(result.message); }
  }
  G.bus.on('state:replace', () => { archive++; dispose(active); feedback = null; });
  G.bus.on('panel:change', event => { if (!event.open || active && !owns(active)) { dispose(active); feedback = null; } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && active && owns(active)) update(active); });
  ui.observatory = { open, panel, entry };
})(window.Game);
