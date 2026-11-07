/* 实时串门仅保存页内会话；不读取私档、不申请存档租约。 */
(function (G) {
  'use strict';
  var scriptSource = typeof document !== 'undefined' && document.currentScript && document.currentScript.src || '';
  var idPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  var credential = null, generation = 0, destroyed = false, initialized = false, subscribers = [], requests = [];
  var pollTask = null, pollTimer = null, moveTimer = null, pendingMove = null, moveTask = null, moveSeq = 0, moveAt = 0, failures = 0, probeTask = null;
  var state = { phase: 'idle', authenticated: false, houseId: null, peerId: null, revision: 0, houseVersion: '', peers: [], messages: [], error: '' };
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function status() { return copy(state); }
  function emit() { var next = status(); subscribers.slice().forEach(function (fn) { try { fn(copy(next)); } catch (_) {} }); }
  function resultError(error) { return { ok: false, code: error && error.code, message: error && error.message || '这次连接暂时没有完成，请稍后重试。' }; }
  function stale() { var error = new Error('之前的串门连接已结束。'); error.stale = true; return error; }
  function connection() {
    try {
      var source = new URL(scriptSource, window.location.href), match = source.pathname.match(/^(.*)\/releases\/(r-[a-f0-9]{64})\/js\/core\/live\.js$/);
      if (!match || !/^https?:$/.test(window.location.protocol) || source.origin !== window.location.origin || typeof window.fetch !== 'function') return null;
      return { api: match[1] + '/api/v1/live', build: match[2] };
    } catch (_) { return null; }
  }
  function validName(value) { return typeof value === 'string' && [...value.trim()].length >= 1 && [...value.trim()].length <= 24 && !/[\x00-\x1f\x7f]/.test(value); }
  function suggestedName(value) {
    var name = typeof value === 'string' ? value.normalize('NFC').trim() : '';
    return validName(name) && !/[\p{Cc}\p{Zl}\p{Zp}\u202a-\u202e\u2066-\u2069]/u.test(name) ? name : '小小建筑师';
  }
  function validText(value) { return typeof value === 'string' && [...value.trim()].length >= 1 && [...value.trim()].length <= 80 && !/[\x00-\x1f\x7f]/.test(value); }
  function usable() { return state.peerId && state.houseId && ['connected', 'reconnecting'].includes(state.phase); }
  function visible() { return typeof document === 'undefined' || !document.hidden; }
  function clearTimers() { if (pollTimer) clearTimeout(pollTimer); if (moveTimer) clearTimeout(moveTimer); pollTimer = moveTimer = null; pendingMove = null; }
  function cancelRequests() { requests.slice().filter(function (record) { return !record.detached; }).forEach(function (record) { if (record.controller) record.controller.abort(); }); }
  function clearMembership() { state.houseId = null; state.peerId = null; state.revision = 0; state.houseVersion = ''; state.peers = []; state.messages = []; pendingMove = null; moveSeq = 0; failures = 0; }
  function stop(error, unauthenticated) {
    generation++; clearTimers(); cancelRequests(); pollTask = moveTask = null; clearMembership(); state.phase = 'error'; state.error = error && error.message || '串门连接已结束，请重新加入。';
    if (unauthenticated) { credential = null; state.authenticated = false; } emit();
  }
  function memberFailure(error) {
    if (error && error.stale) return;
    if (error && [401, 403, 404, 409, 426].includes(error.status)) stop(error, error.status === 401);
  }
  async function request(route, method, body, ticket, options) {
    options = options || {};
    var config = connection(); if (!config) throw new Error('请从小屋网址联网串门，离线文件版仍可照顾自己的小屋。');
    if (!options.detached && (destroyed || ticket !== generation)) throw stale();
    var auth = options.credential || credential, peerId = options.peerId === undefined ? state.peerId : options.peerId;
    var controller = typeof window.AbortController === 'function' ? new window.AbortController() : null, record = { controller: controller, kind: options.kind || '', detached: !!options.detached }, timeout;
    var headers = { 'X-MC-Protocol': '1', 'X-MC-Build': config.build };
    if (route !== '/me') {
      if (!auth) throw new Error('请先确认登录，再加入串门。');
      headers['X-MC-Live'] = auth.liveKey; if (peerId) headers['X-MC-Peer'] = peerId;
      if (method === 'POST') headers['X-CSRF-Token'] = auth.csrfToken;
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    requests.push(record);
    try {
      var job = (async function () {
        var response;
        try { response = await window.fetch(config.api + route, { method: method || 'GET', credentials: 'same-origin', cache: 'no-store', headers: headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), ...(controller ? { signal: controller.signal } : {}), ...(options.keepalive ? { keepalive: true } : {}) }); }
        catch (_) { var network = new Error('暂时连不上同屋的小朋友，请检查连接。'); network.network = true; throw network; }
        var data; try { data = await response.json(); } catch (_) { var incomplete = new Error('没有收到完整的串门消息，请稍后重试。'); incomplete.network = true; throw incomplete; }
        if (!options.detached && (destroyed || ticket !== generation)) throw stale();
        if (!response.ok) { var failure = new Error(data && data.message || '串门连接已结束，请重新加入。'); failure.status = response.status; failure.code = data && data.code; throw failure; }
        return data;
      })();
      return await Promise.race([job, new Promise(function (_, reject) { timeout = setTimeout(function () { if (controller) controller.abort(); var error = new Error('串门连接等待太久，请检查网络后重试。'); error.network = true; reject(error); }, options.keepalive ? 3000 : 12000); })]);
    } finally { if (timeout) clearTimeout(timeout); var index = requests.indexOf(record); if (index >= 0) requests.splice(index, 1); }
  }
  function peersOf(value) {
    if (!Array.isArray(value) || value.length > 8) throw new Error('同屋成员资料不完整，请重新加入。');
    return value.map(function (peer) {
      if (!peer || typeof peer.id !== 'string' || peer.id.length > 120 || typeof peer.displayName !== 'string' || typeof peer.zone !== 'string' || !Number.isFinite(peer.x) || !Number.isFinite(peer.y)) throw new Error('同屋成员资料不完整，请重新加入。');
      return { id: peer.id, displayName: peer.displayName, avatar: copy(peer.avatar || {}), isHost: !!peer.isHost, zone: peer.zone, x: Math.max(0, Math.min(1, peer.x)), y: Math.max(0, Math.min(1, peer.y)), updatedAt: peer.updatedAt };
    });
  }
  function acceptPacket(packet, joined) {
    if (!packet || !Number.isSafeInteger(packet.revision) || packet.revision < 0) throw new Error('串门状态不完整，请重新加入。');
    state.revision = packet.revision; state.peers = peersOf(packet.peers);
    // 主人更新布置后版本号会变，参观页据此重新读取公开小屋。
    if (typeof packet.houseVersion === 'string' && /^[a-f0-9]{16,128}$/.test(packet.houseVersion)) state.houseVersion = packet.houseVersion;
    if (joined) state.messages = [];
    else {
      var merged = new Map(state.messages.map(function (message) { return [message.seq, message]; }));
      (Array.isArray(packet.messages) ? packet.messages : []).slice(-32).forEach(function (message) {
        if (!message || !Number.isSafeInteger(message.seq) || typeof message.id !== 'string' || typeof message.peerId !== 'string' || typeof message.displayName !== 'string' || typeof message.text !== 'string') return;
        merged.set(message.seq, { id: message.id, seq: message.seq, peerId: message.peerId, displayName: message.displayName, text: message.text, at: message.at });
      });
      state.messages = Array.from(merged.values()).sort(function (a, b) { return a.seq - b.seq; }).slice(-32);
    }
  }
  function schedulePoll(delay) {
    if (pollTimer) clearTimeout(pollTimer); pollTimer = null;
    if (destroyed || !usable() || !visible()) return;
    pollTimer = setTimeout(function () { pollTimer = null; poll(); }, delay || 0);
  }
  function poll() {
    if (destroyed || !usable() || !visible() || pollTask) return;
    var ticket = generation, houseId = state.houseId, nextDelay = 25;
    var task = (async function () {
      try {
        var packet = await request('/poll?houseId=' + houseId + '&after=' + state.revision, 'GET', undefined, ticket, { kind: 'poll' });
        if (ticket !== generation) return;
        acceptPacket(packet, false); failures = 0; state.phase = 'connected'; state.error = ''; emit();
      } catch (error) {
        if (ticket !== generation || error && error.stale) return;
        if (!visible()) { nextDelay = 0; return; }
        if (error && error.network) {
          failures++; if (failures > 3) { stop(new Error('串门连接暂时没有恢复，请联网后重新加入。'), false); return; }
          nextDelay = Math.min(8000, 1000 * Math.pow(2, failures - 1)); state.phase = 'reconnecting'; state.error = '连接中断，正在尝试恢复；聊天不会自动重发。'; emit();
        } else { memberFailure(error); if (ticket === generation) stop(error, false); }
      } finally {
        if (pollTask === task) pollTask = null;
        if (ticket === generation && usable()) schedulePoll(nextDelay);
      }
    })();
    pollTask = task;
  }
  function initialize() {
    if (initialized || destroyed) return; initialized = true;
    if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('visibilitychange', visibility);
    if (window.addEventListener) window.addEventListener('pagehide', pagehide);
  }
  function visibility() {
    if (!visible()) { if (pollTimer) clearTimeout(pollTimer); pollTimer = null; if (moveTimer) clearTimeout(moveTimer); moveTimer = null; pendingMove = null; requests.slice().filter(function (record) { return record.kind === 'poll'; }).forEach(function (record) { if (record.controller) record.controller.abort(); }); }
    else if (usable()) schedulePoll(0);
  }
  function pagehide() { leave(true); }
  function probe() {
    initialize(); if (destroyed) return Promise.resolve({ ok: false, message: '串门组件已经关闭。' });
    if (usable()) return Promise.resolve({ ok: true }); if (probeTask) return probeTask;
    var ticket = generation, task;
    task = (async function () {
      try {
        var data = await request('/me', 'GET', undefined, ticket);
        if (ticket !== generation) throw stale();
        state.authenticated = !!(data && data.authenticated);
        credential = state.authenticated && typeof data.liveKey === 'string' && typeof data.csrfToken === 'string' ? { liveKey: data.liveKey, csrfToken: data.csrfToken } : null;
        if (state.authenticated && !credential) throw new Error('登录资料不完整，请回自己的小屋重新登录。');
        state.phase = 'idle'; state.error = ''; emit(); return { ok: true };
      } catch (error) { if (ticket === generation && !error.stale) { credential = null; state.authenticated = false; state.phase = 'error'; state.error = resultError(error).message; emit(); } return resultError(error); }
      finally { if (probeTask === task) probeTask = null; }
    })(); probeTask = task; return task;
  }
  async function join(houseId, displayName, useSuggestedName, pass) {
    initialize(); if (destroyed) return { ok: false, message: '串门组件已经关闭。' };
    if (!idPattern.test(houseId || '')) return { ok: false, message: '请从公开小屋列表进入串门。' };
    if (useSuggestedName && !visible()) return { ok: false, message: '回到这页后可以手动加入串门。' };
    if (!useSuggestedName && !validName(displayName)) return { ok: false, message: '展示昵称请用1～24个字，不能换行。' };
    generation++; clearTimers(); cancelRequests(); pollTask = moveTask = probeTask = null; clearMembership(); credential = null;
    var ticket = generation; state.phase = 'joining'; state.error = ''; emit();
    try {
      // 每次主动加入都重新绑定当前Cookie，不能沿用另一个标签切账号前的凭据。
      var me = await request('/me', 'GET', undefined, ticket);
      if (!me || !me.authenticated) { state.authenticated = false; state.phase = 'idle'; state.error = '先回自己的小屋登录，再来一起串门。'; emit(); return { ok: false, message: state.error }; }
      if (typeof me.liveKey !== 'string' || typeof me.csrfToken !== 'string') throw new Error('登录资料不完整，请重新登录。');
      credential = { liveKey: me.liveKey, csrfToken: me.csrfToken }; state.authenticated = true;
      if (useSuggestedName && !visible()) { state.phase = 'idle'; state.error = '快捷串门已暂停，回到页面后可以手动加入。'; emit(); return { ok: false, message: state.error }; }
      // 快捷入口只使用这次Cookie握手中的公开称呼，不沿用先前探测的另一孩子资料。
      if (useSuggestedName) displayName = suggestedName(me.joinDisplayName);
      var body = { houseId: houseId, displayName: displayName.trim() }; if (typeof pass === 'string' && pass) body.ticket = pass;
      var packet = await request('/join', 'POST', body, ticket, { peerId: null });
      if (!packet || typeof packet.peerId !== 'string' || !packet.peerId) throw new Error('没有收到完整的加入确认，请重试。');
      acceptPacket(packet, true); state.houseId = houseId; state.peerId = packet.peerId; state.phase = 'connected'; state.error = ''; failures = 0; emit(); schedulePoll(0); return { ok: true };
    } catch (error) {
      // 不是屋主又没有入场凭证：不是故障，界面接着引导去敲门。
      if (ticket === generation && !error.stale && error.code === 'LIVE_KNOCK_REQUIRED') { clearMembership(); state.phase = 'idle'; state.error = ''; emit(); return resultError(error); }
      if (ticket === generation && !error.stale) { clearMembership(); state.phase = 'error'; state.error = resultError(error).message; if (error.status === 401) { state.authenticated = false; credential = null; } emit(); } return resultError(error);
    }
  }

  // —— 敲门：先通知屋主，等屋主同意后拿到入场凭证；不加入、不读取私档，可随时取消。 ——
  var knockRun = null;
  function sleep(run, ms) { return new Promise(function (resolve) { run.wake = resolve; run.timer = setTimeout(resolve, ms); }); }
  function cancelKnock() {
    var run = knockRun; if (!run) return; run.cancelled = true; if (run.timer) clearTimeout(run.timer); if (run.wake) run.wake();
    requests.slice().filter(function (record) { return record.kind === 'knock'; }).forEach(function (record) { if (record.controller) record.controller.abort(); });
  }
  var knockMessages = { declined: '主人现在不方便，过一会儿再来看看吧。', host_away: '主人现在不在家，下次再来看看吧。', expired: '主人还没有看到，稍后再试试吧。' };
  async function knock(houseId, onProgress) {
    initialize(); if (destroyed) return { ok: false, message: '串门组件已经关闭。' };
    if (!idPattern.test(houseId || '')) return { ok: false, message: '请从公开小屋列表进入串门。' };
    cancelKnock(); var run = { cancelled: false, timer: null, wake: null }; knockRun = run;
    var cancelled = { ok: false, status: 'cancelled', message: '已取消敲门。' };
    function tell(text) { if (typeof onProgress === 'function') { try { onProgress(text); } catch (_) {} } }
    var options = function (auth) { return { detached: true, credential: auth, peerId: null, kind: 'knock' }; };
    try {
      var me = await request('/me', 'GET', undefined, 0, { detached: true, kind: 'knock' });
      if (run.cancelled) return cancelled;
      if (!me || !me.authenticated || typeof me.liveKey !== 'string' || typeof me.csrfToken !== 'string') return { ok: false, status: 'login', message: '先回自己的小屋登录，再来敲门。' };
      var auth = { liveKey: me.liveKey, csrfToken: me.csrfToken }, first = await request('/knock', 'POST', { houseId: houseId }, 0, options(auth));
      if (run.cancelled) return cancelled;
      if (!first || first.status === 'host_away') return { ok: false, status: 'host_away', message: knockMessages.host_away };
      if (typeof first.requestId !== 'string' || !idPattern.test(first.requestId)) throw new Error('没有收到完整的敲门确认，请稍后重试。');
      tell('已经敲门啦，请等主人回应。');
      for (var started = Date.now(); Date.now() - started < 130000;) {
        await sleep(run, 2000); if (run.cancelled) return cancelled;
        if (!visible()) continue;
        var answer = await request('/knock/status?requestId=' + first.requestId, 'GET', undefined, 0, options(auth));
        if (run.cancelled) return cancelled;
        if (answer && answer.status === 'approved' && typeof answer.ticket === 'string') return { ok: true, status: 'approved', ticket: answer.ticket };
        if (answer && knockMessages[answer.status]) return { ok: false, status: answer.status, message: knockMessages[answer.status] };
      }
      return { ok: false, status: 'expired', message: knockMessages.expired };
    } catch (error) { return run.cancelled ? cancelled : resultError(error); }
    finally { if (knockRun === run) knockRun = null; }
  }

  // —— 屋主接待：主游戏页长轮询敲门提醒。打开接待即“在家”，关闭或页面离开后访客看到“不在家”。 ——
  var receptionRun = null, receptionSubscribers = [];
  function cleanRequests(list) {
    return (Array.isArray(list) ? list : []).slice(0, 3).filter(function (item) { return item && typeof item.id === 'string' && idPattern.test(item.id) && typeof item.displayName === 'string' && item.displayName.length <= 48 && Number.isFinite(item.at); }).map(function (item) { return { id: item.id, displayName: item.displayName, avatar: copy(item.avatar || {}), at: item.at }; });
  }
  function receptionEmit(run, error) { var value = { open: !run.stopped, requests: run.requests.map(copy), error: error || '' }; receptionSubscribers.slice().forEach(function (fn) { try { fn(copy(value)); } catch (_) {} }); }
  async function receptionLoop(run) {
    var failures = 0;
    while (!run.stopped) {
      if (!visible()) { await sleep(run, 1000); continue; }
      try {
        var packet = await request('/inbox?after=' + run.revision, 'GET', undefined, 0, { detached: true, credential: run.credential, peerId: null, kind: 'inbox' });
        if (run.stopped) return;
        if (!packet || !Number.isSafeInteger(packet.revision) || !Array.isArray(packet.requests)) throw new Error('敲门提醒不完整，请稍后再试。');
        run.revision = packet.revision; failures = 0; run.requests = cleanRequests(packet.requests); receptionEmit(run);
      } catch (error) {
        if (run.stopped) return;
        if ([401, 403].includes(error && error.status) || ++failures > 5) { run.stopped = true; if (receptionRun === run) receptionRun = null; receptionEmit(run, error && error.code === 'LIVE_NO_HOUSE' ? '先公开自己的小屋，朋友才能来敲门。' : resultError(error).message); return; }
        await sleep(run, Math.min(8000, 1000 * Math.pow(2, failures - 1)));
      }
    }
  }
  async function startReception() {
    stopReception(false); var run = { stopped: false, revision: 0, requests: [], credential: null, timer: null, wake: null }; receptionRun = run;
    try {
      var me = await request('/me', 'GET', undefined, 0, { detached: true });
      if (run.stopped) return { ok: false, message: '已停止接待。' };
      if (!me || !me.authenticated || typeof me.liveKey !== 'string' || typeof me.csrfToken !== 'string') { receptionRun = null; run.stopped = true; return { ok: false, message: '先登录并公开自己的小屋，朋友才能来敲门。' }; }
      run.credential = { liveKey: me.liveKey, csrfToken: me.csrfToken };
    } catch (error) { if (receptionRun === run) receptionRun = null; run.stopped = true; return resultError(error); }
    receptionLoop(run); return { ok: true };
  }
  function stopReception(tellServer) {
    var run = receptionRun; if (!run) return; receptionRun = null; run.stopped = true; if (run.timer) clearTimeout(run.timer); if (run.wake) run.wake();
    requests.slice().filter(function (record) { return record.kind === 'inbox'; }).forEach(function (record) { if (record.controller) record.controller.abort(); });
    if (tellServer !== false && run.credential) request('/inbox?after=0&open=0', 'GET', undefined, 0, { detached: true, credential: run.credential, peerId: null, keepalive: true }).then(function () {}, function () {});
    receptionEmit(run);
  }
  async function answerKnock(requestId, accept) {
    var run = receptionRun; if (!run || !run.credential) return { ok: false, message: '接待已关闭，请先打开接待。' };
    try { await request('/knock/answer', 'POST', { requestId: requestId, accept: !!accept }, 0, { detached: true, credential: run.credential, peerId: null }); run.requests = run.requests.filter(function (item) { return item.id !== requestId; }); receptionEmit(run); return { ok: true }; }
    catch (error) { run.requests = run.requests.filter(function (item) { return item.id !== requestId; }); receptionEmit(run); return resultError(error); }
  }
  function sendMove() {
    moveTimer = null;
    if (!pendingMove || !usable() || state.phase !== 'connected' || !visible() || destroyed) return;
    if (moveTask) return;
    var target = pendingMove; pendingMove = null; var ticket = generation; moveAt = Date.now(); var task;
    task = (async function () {
      try { await request('/move', 'POST', { houseId: state.houseId, seq: ++moveSeq, zone: target.zone, x: target.x, y: target.y }, ticket); }
      catch (error) { if (ticket === generation && !error.stale) { memberFailure(error); if (ticket === generation && !error.network) { state.error = resultError(error).message; emit(); } } }
      finally { if (moveTask === task) moveTask = null; if (ticket === generation && pendingMove && usable() && visible()) moveTimer = setTimeout(sendMove, Math.max(0, 250 - (Date.now() - moveAt))); }
    })(); moveTask = task;
  }
  function move(zone, x, y) {
    if (!usable() || state.phase !== 'connected' || !visible()) return { ok: false, message: '加入并连接后才能走动。' };
    if (typeof zone !== 'string' || zone.length > 120 || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return { ok: false, message: '请点小屋或前院的地面。' };
    pendingMove = { zone: zone, x: x, y: y };
    if (!moveTimer && !moveTask) moveTimer = setTimeout(sendMove, Math.max(0, 250 - (Date.now() - moveAt)));
    return { ok: true };
  }
  async function memberAction(route, body) {
    if (!usable() || state.phase !== 'connected') return { ok: false, message: '串门连接恢复后再试。' };
    var ticket = generation;
    try { await request(route, 'POST', Object.assign({ houseId: state.houseId }, body), ticket); state.error = ''; emit(); return { ok: true }; }
    catch (error) { if (ticket === generation && !error.stale) { memberFailure(error); if (ticket === generation) { state.error = resultError(error).message; emit(); } } return resultError(error); }
  }
  function messageId() { if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID(); return 'm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 14); }
  function chat(text) { if (!validText(text)) return Promise.resolve({ ok: false, message: '消息请写1～80个字，不能换行。' }); return memberAction('/chat', { clientMessageId: messageId(), text: text.trim() }); }
  function kick(peerId) {
    var me = state.peers.find(function (peer) { return peer.id === state.peerId; });
    if (!me || !me.isHost || peerId === state.peerId || !state.peers.some(function (peer) { return peer.id === peerId; })) return Promise.resolve({ ok: false, message: '只有屋主可以请其他同屋小朋友离开。' });
    return memberAction('/kick', { peerId: peerId });
  }
  function leave(keepalive) {
    var was = { houseId: state.houseId, peerId: state.peerId, credential: credential }, oldGeneration = generation;
    generation++; clearTimers(); cancelRequests(); pollTask = moveTask = probeTask = null; clearMembership(); state.phase = 'left'; state.error = ''; emit();
    if (!was.houseId || !was.peerId || !was.credential) return Promise.resolve({ ok: true });
    return request('/leave', 'POST', { houseId: was.houseId }, oldGeneration, { detached: true, credential: was.credential, peerId: was.peerId, keepalive: !!keepalive }).then(function () { return { ok: true }; }, function () { return { ok: true }; });
  }
  function destroy() {
    if (destroyed) return; cancelKnock(); stopReception(true); leave(true); destroyed = true; clearTimers(); cancelRequests(); credential = null;
    if (initialized) { if (document.removeEventListener) document.removeEventListener('visibilitychange', visibility); if (window.removeEventListener) window.removeEventListener('pagehide', pagehide); } subscribers = [];
  }
  G.live = { status: status, subscribe: function (fn) { if (typeof fn !== 'function') return function () {}; subscribers.push(fn); return function () { var i = subscribers.indexOf(fn); if (i >= 0) subscribers.splice(i, 1); }; }, probe: probe, join: function (houseId, displayName, pass) { return join(houseId, displayName, false, pass); }, quickJoin: function (houseId, pass) { return join(houseId, null, true, pass); }, knock: knock, cancelKnock: cancelKnock, reception: { start: startReception, stop: function () { stopReception(true); }, answer: answerKnock, subscribe: function (fn) { if (typeof fn !== 'function') return function () {}; receptionSubscribers.push(fn); return function () { var i = receptionSubscribers.indexOf(fn); if (i >= 0) receptionSubscribers.splice(i, 1); }; }, status: function () { var run = receptionRun; return { open: !!run && !run.stopped, requests: run ? run.requests.map(copy) : [] }; } }, move: move, chat: chat, kick: kick, leave: leave, destroy: destroy };
})(window.Game);
