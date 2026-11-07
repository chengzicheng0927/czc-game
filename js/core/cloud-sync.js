/* 可选同源账号同步；单机规则不依赖网络，活动JSON仍使用原存档键。 */
(function (G) {
  'use strict';
  const metaKey = 'marshmallow_cottage_cloud_v1', leaseKey = 'marshmallow_cottage_owner_v1';
  const scriptSource = typeof document !== 'undefined' && document.currentScript && document.currentScript.src || '';
  const leaseMs = 20000, pollMs = 30000, maxAccounts = 2;
  const ownerId = 'tab_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
  let available = false, api = '', build = '', prepared = false, initialized = false, protectedMeta = false, readOnly = false, switching = false, incompatible = false;
  let meta = freshMeta(), account = null, authenticated = false, csrf = '', serverEpoch = '', remote = null, conflict = null;
  let phase = 'offline', message = '单机进度保存在本浏览器。', generation = 0, epoch = 0, actionBusy = false, syncTask = null;
  let latest = null, timer = null, retryDelay = 2000, uploadAt = 0, lease = null;
  let sessionTask = null, sessionTimer = null, sessionRecovery = false, sessionDelay = 2000;
  const clone = value => JSON.parse(JSON.stringify(value));
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const fail = text => ({ ok: false, message: text });
  const errorText = e => e && typeof e.message === 'string' && e.message || '连接暂时没有完成，本机进度仍保留。';
  const uid = () => ownerId + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
  function freshMeta() { return { version: 1, active: 'guest', slots: { guest: { account: null, bound: false, base: null, pending: null } }, recovery: null, journal: null }; }
  function canonical(value) { if (value === null || typeof value !== 'object') return JSON.stringify(value); if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'; return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}'; }
  // 同步摘要不依赖安全上下文中的WebCrypto，离线恢复journal也能即时比较完整内容。
  function digest(text) {
    const bytes = new TextEncoder().encode(text), words = [], primes = [], constants = [], initial = [];
    for (let n = 2; primes.length < 64; n++) { if (primes.every(p => n % p)) { primes.push(n); constants.push(Math.floor((Math.cbrt(n) % 1) * 4294967296) | 0); if (initial.length < 8) initial.push(Math.floor((Math.sqrt(n) % 1) * 4294967296) | 0); } }
    for (let i = 0; i < bytes.length; i++) words[i >> 2] = (words[i >> 2] || 0) | bytes[i] << (24 - i % 4 * 8);
    words[bytes.length >> 2] = (words[bytes.length >> 2] || 0) | 0x80 << (24 - bytes.length % 4 * 8);
    const end = ((bytes.length + 8 >> 6) + 1) * 16; words[end - 2] = Math.floor(bytes.length / 536870912); words[end - 1] = bytes.length * 8;
    const h = initial.slice(), rotate = (x, n) => x >>> n | x << (32 - n);
    for (let offset = 0; offset < end; offset += 16) {
      const w = Array(64); for (let i = 0; i < 64; i++) { if (i < 16) w[i] = words[offset + i] | 0; else { const a = w[i - 15], b = w[i - 2]; w[i] = (w[i - 16] + (rotate(a, 7) ^ rotate(a, 18) ^ a >>> 3) + w[i - 7] + (rotate(b, 17) ^ rotate(b, 19) ^ b >>> 10)) | 0; } }
      let [a, b, c, d, e, f, g, v] = h;
      for (let i = 0; i < 64; i++) { const t = (v + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) + (e & f ^ ~e & g) + constants[i] + w[i]) | 0, u = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + (a & b ^ a & c ^ b & c)) | 0; v = g; g = f; f = e; e = d + t | 0; d = c; c = b; b = a; a = t + u | 0; }
      [a, b, c, d, e, f, g, v].forEach((value, i) => { h[i] = h[i] + value | 0; });
    }
    return h.map(n => (n >>> 0).toString(16).padStart(8, '0')).join('');
  }
  function snapshotOf(raw) { const state = G.store.validate(typeof raw === 'string' ? JSON.parse(raw) : raw), json = JSON.stringify(state), hash = digest(canonical(state)), semantic = clone(state); delete semantic.profile.playTimeSec; Object.values(semantic.residents).forEach(r => { delete r.lastBubbleAt; }); return { state, json, hash, semanticHash: digest(canonical(semantic)) }; }
  function diskSnapshot(flush) { if (flush && !G.save.flush()) throw new Error('当前进度还没有保存在本机。请先下载JSON备份，再重试。'); const value = G.save.snapshot(); if (!value) throw new Error('本机存档还没有准备好，请先下载JSON备份。'); return snapshotOf(value.state); }
  function summary(snap, data) { if (!snap) return null; return { name: snap.state.house.name, level: snap.state.level, coin: snap.state.wallet.coin, roomCount: Object.keys(snap.state.house.rooms).length, updatedAt: data && data.updatedAt || null, revision: data && data.revision || null }; }
  function activeSlot() { return meta.slots[meta.active]; }
  function accountKey(value) { if (!value || typeof value.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value.id)) throw new Error('账号资料没有通过检查，请重新登录。'); return 'account_' + value.id; }
  function binding() { return !!(account && meta.active === accountKey(account) && activeSlot().bound); }
  function dirty() { return !!(latest && activeSlot() && (!activeSlot().base || latest.hash !== activeSlot().base.localHash)); }
  function emit() { if (G.bus) G.bus.emit('cloud:change', status()); }
  function setPhase(next, text) { phase = next; if (text) message = text; emit(); }
  function backups() {
    const result = [];
    Object.keys(meta.slots).forEach(id => { const slot = meta.slots[id]; if (slot.json) { try { const snap = id === meta.active && G.state ? snapshotOf(G.state) : snapshotOf(slot.json); result.push(Object.assign({ id, account: slot.account, active: id === meta.active }, summary(snap, slot.base))); } catch (_) {} } });
    if (meta.recovery) { try { result.push(Object.assign({ id: 'recovery', account: meta.recovery.account, active: false }, summary(snapshotOf(meta.recovery.json), meta.recovery))); } catch (_) {} }
    return result;
  }
  function status() { return clone({ available, phase: protectedMeta ? 'error' : readOnly ? 'other_tab' : phase, message, account, binding: binding(), remote: remote && !remote.none ? summary(remote.snapshot, remote) : null, conflict, busy: actionBusy || !!syncTask || !!sessionTask, dirty: binding() && dirty(), readOnly, restoreRequired: !!(G.save && G.save.loadFailed), backups: backups() }); }
  function writeMeta(next) { if (available && !ownsLease()) return false; try { window.localStorage.setItem(metaKey, JSON.stringify(next)); meta = next; return true; } catch (_) { setPhase('error', '浏览器暂时放不下安全副本，已停止切换或同步。请先下载JSON备份，再整理副本或存储空间。'); return false; } }
  function requireMeta(next) { if (!writeMeta(next)) throw new Error(message); }
  function parseLease() { try { const value = JSON.parse(window.localStorage.getItem(leaseKey) || 'null'); return value && typeof value.id === 'string' && typeof value.fence === 'string' && Number.isFinite(value.until) ? value : null; } catch (_) { return null; } }
  function loseLease() { if (!readOnly) { epoch++; cancelTimer(); stopSessionRecovery(); } readOnly = true; message = protectedMeta ? '本机副本需要恢复检查，当前仅可查看和下载JSON备份。' : '另一个标签页正在照顾这座小屋。这里可以查看和下载JSON备份。'; emit(); }
  function ownsLease() { if (!available) return true; if (protectedMeta) { loseLease(); return false; } const value = parseLease(); if (!lease || !value || value.id !== ownerId || value.fence !== lease.fence) { loseLease(); return false; } return true; }
  function claimLease(force) {
    const previous = parseLease(); if (!force && previous && previous.until > Date.now() && previous.id !== ownerId || !force && typeof document !== 'undefined' && document.hidden) { loseLease(); return false; }
    const next = { id: ownerId, fence: uid(), until: Date.now() + leaseMs };
    try { window.localStorage.setItem(leaseKey, JSON.stringify(next)); lease = next; const actual = parseLease(); readOnly = !actual || actual.id !== ownerId || actual.fence !== next.fence; if (readOnly) loseLease(); return !readOnly; } catch (_) { readOnly = true; message = '浏览器暂时不能保存进度，请先下载JSON备份。'; return false; }
  }
  function renewLease() { if (!ownsLease() || document.hidden) return; try { lease.until = Date.now() + leaseMs; window.localStorage.setItem(leaseKey, JSON.stringify(lease)); } catch (_) { loseLease(); } }
  function loadMeta(recover) {
    const raw = window.localStorage.getItem(metaKey); if (!raw) return;
    const next = JSON.parse(raw);
    if (!next || next.version !== 1 || !next.slots || !own(next.slots, next.active) || Object.keys(next.slots).length > maxAccounts + 1) throw new Error('副本索引损坏');
    Object.keys(next.slots).forEach(id => { if (id !== 'guest' && !/^account_[A-Za-z0-9_-]{1,100}$/.test(id)) throw new Error('副本索引无效'); const slot = next.slots[id]; if (!slot || typeof slot.bound !== 'boolean' || id !== 'guest' && accountKey(slot.account) !== id) throw new Error('副本索引无效'); if (slot.json) snapshotOf(slot.json); });
    if (next.recovery) snapshotOf(next.recovery.json);
    meta = next;
    if (meta.journal && recover) {
      const journal = meta.journal, rawActive = window.localStorage.getItem(G.data.balance.saveKey), actual = rawActive ? snapshotOf(rawActive).hash : '';
      if (!own(meta.slots, journal.from) || !own(meta.slots, journal.to) || !journal.fromSlot || typeof journal.fromSlot.bound !== 'boolean') throw new Error('切换记录无效');
      const draft = clone(meta);
      if (actual === journal.toHash) { draft.active = journal.to; delete draft.slots[journal.to].json; }
      else if (actual === journal.fromHash) { draft.active = journal.from; draft.slots[journal.from] = journal.fromSlot; }
      else throw new Error('活动存档归属待确认');
      draft.journal = null; if (!writeMeta(draft)) throw new Error('副本索引暂时无法恢复');
    }
  }
  function prepare() {
    if (prepared) return; prepared = true;
    try { const source = new URL(scriptSource, window.location.href), match = source.pathname.match(/^(.*)\/releases\/(r-[A-Za-z0-9._-]+)\/js\/core\/cloud-sync\.js$/); if (!match || !/^https?:$/.test(window.location.protocol) || source.origin !== window.location.origin || typeof window.fetch !== 'function') return; available = true; api = match[1] + '/api/v1'; build = match[2]; }
    catch (_) { return; }
    const owner = claimLease(false);
    try { loadMeta(owner); } catch (_) { protectedMeta = true; loseLease(); }
    G.store.setWriteGuard(context => {
      if (!ownsLease()) return { ok: false, message: message };
      if (switching && context.source !== 'cloud') return true;
      return true;
    });
    window.addEventListener('storage', event => { if (event.key === leaseKey) ownsLease(); });
    window.setInterval(renewLease, 5000);
  }
  function cancelTimer() { if (timer) clearTimeout(timer); timer = null; }
  function stopSessionRecovery() { sessionRecovery = false; if (sessionTimer) clearTimeout(sessionTimer); sessionTimer = null; sessionTask = null; sessionDelay = 2000; }
  function canRecoverSession() { return sessionRecovery && available && !authenticated && phase === 'offline' && !incompatible && !protectedMeta && !readOnly && ownsLease(); }
  function queueSessionRecovery() {
    if (sessionTimer || !canRecoverSession()) return;
    const ticket = epoch, delay = sessionDelay; sessionDelay = Math.min(60000, sessionDelay * 2);
    sessionTimer = setTimeout(() => { sessionTimer = null; if (ticket === epoch && canRecoverSession()) probeSession(); }, delay);
  }
  function probeSession() {
    if (!sessionRecovery || !available || !ownsLease() || incompatible) return Promise.resolve(fail(message));
    if (sessionTask) return sessionTask;
    if (actionBusy || syncTask) return Promise.resolve(fail('小屋正在处理账号，请稍后再试。'));
    const ticket = ++epoch; let task;
    task = (async () => {
      let timeout;
      try {
        // 网卡仍在线也可能只是服务器暂时不可达；冷启动查询有超时，重试只查询会话，不重放账号密码。
        const response = await Promise.race([request('/session', 'GET', null, null, ticket), new Promise((_, reject) => { timeout = setTimeout(() => { const error = new Error('账号连接暂时没有完成。'); error.network = true; reject(error); }, 15000); })]);
        checkTicket(ticket); sessionRecovery = false; sessionDelay = 2000; if (sessionTimer) clearTimeout(sessionTimer); sessionTimer = null;
        return await acceptSession(response.data, ticket);
      } catch (error) {
        // 用户可能在查询等待时退出或切换账号；旧查询和超时都不能修改新账号的状态。
        if (ticket !== epoch || !ownsLease()) return fail('之前的账号连接已取消，本机进度仍保留。');
        return failed(error);
      } finally {
        if (timeout) clearTimeout(timeout);
        if (sessionTask === task) { sessionTask = null; queueSessionRecovery(); emit(); }
      }
    })();
    sessionTask = task; emit(); return task;
  }
  function queue(delay) { if (!authenticated || !binding() || conflict || readOnly || protectedMeta || incompatible || G.save.loadFailed) return; const at = Date.now() + delay; if (timer && uploadAt <= at) return; cancelTimer(); uploadAt = at; timer = setTimeout(() => { timer = null; startSync(false); }, delay); }
  function committed(event) {
    if (!available || switching || !ownsLease() || !event || !event.json) return;
    try {
      const next = snapshotOf(event.json); if (latest && latest.hash === next.hash) return; latest = next; generation++;
      if (event.source === 'cloud') return;
      if (binding() && !G.save.loadFailed && !incompatible) {
        if (!authenticated) setPhase(phase === 'expired' ? 'expired' : 'offline', sessionRecovery ? '本机新进度已保存，连接恢复后会自动续接账号。' : '本机新进度已保存，重新登录后会继续同步。');
        else { setPhase(conflict ? 'conflict' : 'pending', conflict ? '两边都有新的布置，请选择要继续的小屋。' : '本机已保存，联网后会自动同步。'); queue(activeSlot().base && latest.semanticHash === activeSlot().base.semanticHash ? 120000 : 1500); }
      }
    } catch (_) { setPhase('error', '本机进度已保存，同步准备暂时未完成。可先下载JSON备份。'); }
  }
  function checkTicket(ticket) { if (ticket !== epoch || !ownsLease()) { const error = new Error('这次连接属于之前的标签页或账号，已忽略。'); error.stale = true; throw error; } }
  // 公开参观只识别发布地址，不调用prepare，避免读写主人存档或争夺租约。
  function publicConnection() {
    try {
      const source = new URL(scriptSource, window.location.href), match = source.pathname.match(/^(.*)\/releases\/(r-[A-Za-z0-9._-]+)\/js\/core\/cloud-sync\.js$/);
      if (!match || !/^https?:$/.test(window.location.protocol) || source.origin !== window.location.origin || typeof window.fetch !== 'function') return null;
      return { api: match[1] + '/api/v1', build: match[2] };
    } catch (_) { return null; }
  }
  async function requestPublic(path) {
    if (typeof path !== 'string' || !(path === '/neighbors/online' || /^\/neighbors(?:\?cursor=[A-Za-z0-9_-]{1,512})?$/.test(path) || /^\/public-houses\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(path))) throw new Error('邻居地址没有通过检查，请从小屋列表重新打开。');
    const connection = publicConnection();
    if (!connection) throw new Error('请从小屋网址查看邻居，离线文件版仍可照顾自己的小屋。');
    const controller = typeof window.AbortController === 'function' ? new window.AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), 15000) : null;
    try {
      let response;
      try { response = await window.fetch(connection.api + path, { method: 'GET', credentials: 'omit', cache: 'no-store', headers: { 'X-MC-Protocol': '1', 'X-MC-Build': connection.build }, ...(controller ? { signal: controller.signal } : {}) }); }
      catch (_) { throw new Error('暂时连不上邻居小屋，请联网后再试。自己的进度仍保留。'); }
      let data; try { data = await response.json(); } catch (_) { throw new Error('暂时没有读到完整的小屋，请稍后重试。'); }
      if (!response.ok) { const error = new Error(data && data.message || '这座小屋暂时不能参观，可能已经撤下。'); error.status = response.status; error.code = data && data.code; throw error; }
      return data;
    } finally { if (timeout) clearTimeout(timeout); }
  }
  async function requestAccount(path, method, body) {
    method = method || 'GET';
    if (path !== '/my-publication' || !['GET', 'POST', 'DELETE'].includes(method)) throw new Error('这项邻居操作没有通过检查。');
    if (!available || !authenticated || !account) throw new Error('请先登录自己的账号，再管理公开的小屋。');
    if (method === 'POST' && (!binding() || G.save.loadFailed || incompatible || conflict)) throw new Error('请先关联并同步完整小屋，再更新公开展示。');
    const ticket = epoch, owner = account.id;
    try {
      const result = await request(path, method, method === 'DELETE' && body === undefined ? {} : body, null, ticket);
      if (!account || account.id !== owner) { const error = new Error('账号已经切换，请重新打开邻居列表。'); error.stale = true; throw error; }
      return result.data;
    } catch (error) { if (error && [401, 426].includes(error.status)) failed(error); throw error; }
  }
  async function request(path, method, body, headers, ticket) {
    if (!available) throw new Error('离线目录版保留本机玩法，账号功能请从小屋网址进入。');
    checkTicket(ticket);
    const accountHeader = account && !/^\/(session|login|register)$/.test(path) ? { 'X-MC-Account': account.id } : {};
    const options = { method: method || 'GET', credentials: 'same-origin', cache: 'no-store', headers: Object.assign({ 'X-MC-Protocol': '1', 'X-MC-Build': build }, accountHeader, body ? { 'Content-Type': 'application/json' } : {}, method && method !== 'GET' && csrf ? { 'X-CSRF-Token': csrf } : {}, headers || {}) };
    if (body) options.body = JSON.stringify(body);
    let response; try { response = await window.fetch(api + path, options); } catch (_) { const error = new Error('网络暂时没有连接。'); error.network = true; throw error; } checkTicket(ticket);
    let data; try { data = await response.json(); } catch (_) { throw new Error('服务器的回复暂时无法读取，本机进度仍保留。'); } checkTicket(ticket);
    if (!response.ok) { const error = new Error(data && data.message || '连接暂时没有完成，本机进度仍保留。'); error.status = response.status; error.code = data && data.code; error.serverEpoch = data && data.serverEpoch; throw error; }
    return { data, etag: response.headers && response.headers.get('ETag') };
  }
  function failed(error) {
    if (error && error.stale) return fail(error.message);
    if (error && error.status === 401) { authenticated = false; csrf = ''; stopSessionRecovery(); setPhase('expired', error.code === 'LOGIN_FAILED' || error.code === 'BAD_LOGIN' ? errorText(error) : error.code === 'ACCOUNT_CHANGED' ? '另一个页面切换了账号，本机进度仍保留。请重新登录自己的账号。' : '登录已到期，本机进度和待同步内容仍保留。重新登录后可继续。'); }
    else if (error && error.status === 426) { incompatible = true; cancelTimer(); stopSessionRecovery(); setPhase('incompatible', '小屋已有更新，请先下载JSON备份，再刷新页面继续同步。'); }
    else if (error && error.status >= 400 && error.status < 500 && error.status !== 429) setPhase('error', errorText(error));
    else if (error && error.network || error && error.status >= 500 || error && error.status === 429) { setPhase('offline', '暂时连不上服务器，本机进度仍会保存。恢复连接后会重试。'); queue(retryDelay); retryDelay = Math.min(60000, retryDelay * 2); }
    else setPhase('error', errorText(error));
    return fail(message);
  }
  function ensureSlot(draft, person) { const id = accountKey(person); if (!own(draft.slots, id)) { if (Object.keys(draft.slots).filter(key => key !== 'guest').length >= maxAccounts) throw new Error('这里已经保留两位账号的离线副本。请先下载并整理不用的副本，再切换账号。'); draft.slots[id] = { account: clone(person), bound: true, base: null, pending: null }; } return id; }
  function cacheCurrent() { const snap = diskSnapshot(true), draft = clone(meta); draft.slots[draft.active].json = snap.json; requireMeta(draft); latest = snap; return snap; }
  function preserve(draft, snap, kind) {
    if (draft.recovery && snapshotOf(draft.recovery.json).hash !== snap.hash && draft.recovery.kind !== 'automatic') throw new Error('还有一份需要保留的分支。请先下载并整理“恢复前副本”，再继续选择。');
    draft.recovery = { json: snap.json, account: account ? clone(account) : null, kind, updatedAt: Date.now() };
  }
  function baseOf(record) { return record && !record.none ? { etag: record.etag, revision: record.revision, serverEpoch: record.serverEpoch, contentHash: record.contentHash, localHash: record.snapshot.hash, semanticHash: record.snapshot.semanticHash, updatedAt: record.updatedAt } : null; }
  function switchTo(id, snap, slot, preserveKind, expectedState) {
    if (!ownsLease()) throw new Error(message);
    if (expectedState && G.state !== expectedState) throw new Error('读取期间小屋有了新进度，请先下载JSON备份再重新比较。');
    const old = diskSnapshot(true), draft = clone(meta), from = draft.active, previous = clone(draft.slots[from]); delete previous.json;
    if (expectedState && G.state !== expectedState) throw new Error('读取期间小屋有了新进度，请先下载JSON备份再重新比较。');
    if (preserveKind && old.hash !== snap.hash) preserve(draft, old, preserveKind);
    draft.slots[from].json = old.json; draft.slots[id] = Object.assign({}, slot, { json: snap.json });
    draft.journal = { from, to: id, fromHash: old.hash, toHash: snap.hash, fromSlot: previous };
    requireMeta(draft);
    switching = true;
    let result;
    try { result = G.save.restore(snap.state, { source: 'cloud' }); } finally { switching = false; }
    if (!result || !result.ok) { const rollback = clone(meta); rollback.active = from; rollback.slots[from] = previous; rollback.journal = null; if (!writeMeta(rollback)) { protectedMeta = true; loseLease(); } throw new Error(result && result.message || '小屋没有切换，原进度仍保留。'); }
    const final = clone(meta); final.active = id; delete final.slots[id].json; final.journal = null;
    if (!writeMeta(final)) { protectedMeta = true; loseLease(); throw new Error('目标小屋已保存在本机，副本索引暂时未完成。请下载JSON备份，重新打开后恢复检查。'); }
    latest = snap; generation++; conflict = null;
    return result;
  }
  async function getRemote(ticket, revision) {
    try {
      const response = await request('/save' + (revision === undefined ? '' : '/versions/' + encodeURIComponent(revision)), 'GET', null, null, ticket), data = response.data, snap = snapshotOf(data.save);
      if (!response.etag || !Number.isInteger(data.revision) || typeof data.serverEpoch !== 'string' || data.contentHash !== snap.hash) throw new Error('云端存档没有通过完整检查，本机进度保持原样。');
      return Object.assign({}, data, { etag: response.etag, snapshot: snap });
    } catch (error) { if (revision === undefined && error && error.status === 404 && error.code === 'NO_SAVE') return { none: true, serverEpoch: error.serverEpoch || serverEpoch }; throw error; }
  }
  function setConflict(record) { remote = record; conflict = { local: summary(latest), cloud: record.none ? null : summary(record.snapshot, record) }; setPhase('conflict', '两台设备都有新的布置，已保留本机进度。请下载备份，再选择继续哪一座小屋。'); }
  async function upload(snap, record, ticket) {
    const draft = clone(meta), slot = draft.slots[draft.active], pending = slot.pending;
    const mutationId = pending && pending.hash === snap.hash && pending.etag === (record.etag || null) && pending.serverEpoch === record.serverEpoch ? pending.id : uid();
    slot.pending = { id: mutationId, hash: snap.hash, etag: record.etag || null, serverEpoch: record.serverEpoch }; requireMeta(draft);
    const sentGeneration = generation;
    try {
      const result = await request('/save', 'PUT', { save: snap.state, mutationId, expectedEpoch: record.serverEpoch }, record.none ? { 'If-None-Match': '*' } : { 'If-Match': record.etag }, ticket); checkTicket(ticket);
      if (!result.etag || result.data.contentHash !== snap.hash) throw new Error('云端保存回执没有通过检查，本机进度仍保留。');
      const acknowledged = Object.assign({}, result.data, { etag: result.etag, snapshot: snap }), next = clone(meta); next.slots[next.active].base = baseOf(acknowledged); next.slots[next.active].pending = null; requireMeta(next); remote = acknowledged; retryDelay = 2000;
      if (sentGeneration !== generation || dirty()) { setPhase('pending', '这次云端已保存，后来的新进度仍在等待同步。'); queue(1500); } else setPhase('ready', '小屋已自动保存到账号。');
      return { ok: true };
    } catch (error) { if (error && error.status === 412) { const fresh = await getRemote(ticket); setConflict(fresh); return fail(message); } throw error; }
  }
  async function reconcile(manual, ticket) {
    if (G.save.loadFailed) throw new Error('本机发现了损坏存档，请先下载备份，再明确选择恢复云端小屋；不会上传临时空屋。');
    // 冷启动重连和自动轮询也先保存内存中的新操作；不能拿旧磁盘基准判断“本机未修改”后恢复云端。
    checkTicket(ticket); latest = diskSnapshot(true); const startGeneration = generation, sourceState = G.state, record = await getRemote(ticket); checkTicket(ticket); remote = record;
    const slot = activeSlot(), base = slot.base, localChanged = dirty();
    if (record.none) {
      if (base) { setConflict(record); return fail(message); }
      return upload(latest, record, ticket);
    }
    if (record.snapshot.hash === latest.hash) { const draft = clone(meta); draft.slots[draft.active].base = baseOf(record); draft.slots[draft.active].pending = null; requireMeta(draft); setPhase('ready', '小屋已自动保存到账号。'); return { ok: true }; }
    // 请求丢回执但服务器已提交时，用幂等快照摘要确认原上传，再同步后来的操作。
    if (slot.pending && record.snapshot.hash === slot.pending.hash && record.serverEpoch === slot.pending.serverEpoch) { const draft = clone(meta); draft.slots[draft.active].base = baseOf(record); draft.slots[draft.active].pending = null; requireMeta(draft); return upload(latest, record, ticket); }
    const remoteChanged = !base || record.etag !== base.etag || record.serverEpoch !== base.serverEpoch;
    const branchChanged = !base || latest.semanticHash !== base.semanticHash;
    if (remoteChanged && localChanged && branchChanged) { setConflict(record); return fail(message); }
    if (remoteChanged) {
      if (generation !== startGeneration || G.state !== sourceState) { setPhase('pending', '读取期间小屋有了新进度，稍后会重新比较。'); queue(1500); return fail(message); }
      switchTo(meta.active, record.snapshot, Object.assign({}, activeSlot(), { base: baseOf(record), pending: null }), 'automatic', sourceState); setPhase('ready', '已接上另一台设备保存的小屋。'); return { ok: true };
    }
    if (localChanged && (manual || latest.semanticHash !== base.semanticHash || Date.now() >= uploadAt)) return upload(latest, record, ticket);
    setPhase(localChanged ? 'pending' : 'ready', localChanged ? '本机已保存，正在合并短时间内的自动同步。' : '小屋已自动保存到账号。'); return { ok: true };
  }
  function startSync(manual) {
    if (!available || !ownsLease()) return Promise.resolve(fail(message));
    if (syncTask) return syncTask;
    if (actionBusy) return Promise.resolve(fail('正在处理账号，请稍后再试。'));
    if (manual && !authenticated && sessionRecovery && phase === 'offline') { if (sessionTimer) clearTimeout(sessionTimer); sessionTimer = null; return probeSession(); }
    if (!authenticated || !binding()) return Promise.resolve(fail('请先登录，并选择要关联的小屋。'));
    if (incompatible) return Promise.resolve(fail('请先下载JSON备份，再刷新页面使用新版小屋。'));
    if (G.save.loadFailed) return Promise.resolve(fail('本机发现了损坏存档，请先保留JSON备份并恢复完整进度，再继续同步。'));
    if (conflict) return Promise.resolve(fail('两边的进度需要先作选择。'));
    const ticket = epoch; setPhase('syncing', '正在同步小屋，本机进度仍会保存。');
    syncTask = reconcile(!!manual, ticket).catch(failed).finally(() => { syncTask = null; emit(); }); emit(); return syncTask;
  }
  async function action(fn) {
    if (!available || !ownsLease()) return fail(available ? message : '请从小屋网址进入账号功能，离线目录版仍可单机游玩。');
    if (actionBusy || syncTask) return fail('小屋正在同步或处理账号，请稍后再试。');
    actionBusy = true; epoch++; cancelTimer(); emit();
    try { return await fn(epoch); } catch (error) { return failed(error); } finally { actionBusy = false; if (authenticated && binding() && dirty() && !conflict) queue(1500); emit(); }
  }
  async function acceptSession(data, ticket) {
    if (!data || data.protocol !== 1 || typeof data.serverEpoch !== 'string') throw new Error('账号回复没有通过检查，请刷新后重试。');
    if (!data.authenticated) { authenticated = false; csrf = ''; account = activeSlot().account || null; setPhase(account ? 'expired' : 'guest', account ? '本机仍保留这个账号的小屋，登录后会继续同步。' : '可以先单机游玩，也可以登录保留自己的小屋。'); return { ok: true }; }
    accountKey(data.account); account = clone(data.account); authenticated = true; csrf = data.csrfToken; serverEpoch = data.serverEpoch;
    if (G.save.loadFailed) { remote = await getRemote(ticket); conflict = null; setPhase('choose', '本机存档需要恢复，临时空屋不会上传。请先下载备份，再明确选择恢复云端小屋。'); return { ok: true }; }
    const id = accountKey(account), slot = meta.slots[id];
    if (slot && slot.bound) {
      if (meta.active !== id) { if (!slot.json) throw new Error('这个账号的离线副本暂时不完整，请先下载当前进度再选择云端小屋。'); switchTo(id, snapshotOf(slot.json), slot); }
      return reconcile(false, ticket);
    }
    remote = await getRemote(ticket); conflict = null; setPhase('choose', '账号已登录。请选择关联当前小屋，或恢复这个账号的云端小屋。'); return { ok: true };
  }
  async function authenticate(path, values) { stopSessionRecovery(); return action(async ticket => { cacheCurrent(); const result = await request(path, 'POST', values, null, ticket); return acceptSession(result.data, ticket); }); }
  async function init() {
    if (initialized) return { ok: true }; initialized = true; prepare();
    if (!available) { emit(); return { ok: true }; }
    G.bus.on('save:committed', committed);
    try { const value = G.save.snapshot(); if (value) latest = snapshotOf(value.state); } catch (_) { setPhase('error', '本机存档需要检查，请先下载JSON备份。'); }
    if (activeSlot().account) account = clone(activeSlot().account);
    // save.init已先安装pagehide保存；最后一份本机快照落盘后才释放自己的租约，刷新无需等待超时。
    window.addEventListener('pagehide', () => {
      const current = parseLease();
      if (lease && current && current.id === ownerId && current.fence === lease.fence) {
        try { window.localStorage.removeItem(leaseKey); lease = null; epoch++; cancelTimer(); stopSessionRecovery(); readOnly = true; } catch (_) {}
      }
    });
    window.addEventListener('pageshow', event => { if (event.persisted) ownsLease(); });
    window.addEventListener('online', () => { if (!ownsLease()) return; if (!authenticated && sessionRecovery) { if (sessionTimer) clearTimeout(sessionTimer); sessionTimer = null; probeSession(); } else if (authenticated) startSync(false); });
    window.addEventListener('offline', () => { if (available && !readOnly) setPhase(!authenticated && phase === 'expired' ? 'expired' : 'offline', !authenticated && phase === 'expired' ? '登录已到期，本机进度仍保留。连接恢复后请重新登录。' : '当前离线，进度仍保存在本机，连接恢复后会重试。'); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && ownsLease()) { renewLease(); if (authenticated) startSync(false); else if (sessionRecovery && phase === 'offline' && !sessionTimer) probeSession(); } });
    window.setInterval(() => { if (!document.hidden && authenticated && binding() && !conflict && !readOnly) startSync(false); }, pollMs);
    if (!ownsLease()) return fail(message);
    sessionRecovery = true; return probeSession();
  }
  G.cloud = {
    prepare, init, status, requestPublic, requestAccount,
    register: values => authenticate('/register', values), login: values => authenticate('/login', values), syncNow: () => startSync(true),
    startNew: () => action(async ticket => {
      if (G.save.loadFailed) throw new Error('请先保留损坏存档原文并恢复完整小屋，不能把临时空屋当作新的账号存档。');
      if (!authenticated || binding()) throw new Error('请先登录一个尚未关联的小屋账号。');
      const record = await getRemote(ticket); if (!record.none) throw new Error('这个账号已经有云端小屋，请选择恢复。重新开始仍需在设置中完整确认。');
      const draft = clone(meta), id = ensureSlot(draft, account), slot = Object.assign({}, draft.slots[id], { account: clone(account), bound: true, base: null, pending: null });
      requireMeta(draft); switchTo(id, snapshotOf(G.store.defaultState()), slot); remote = record; return reconcile(true, ticket);
    }),
    bindLocal: () => action(async ticket => {
      if (G.save.loadFailed) throw new Error('请先保留损坏存档原文并恢复完整小屋，临时空屋不会关联到账号。');
      if (!authenticated) throw new Error('请先登录这个账号。'); const record = await getRemote(ticket), snap = diskSnapshot(true), draft = clone(meta), id = ensureSlot(draft, account);
      if (!record.none && record.snapshot.hash !== snap.hash) preserve(draft, record.snapshot, 'remote');
      const slot = Object.assign({}, draft.slots[id], { account: clone(account), bound: true, base: baseOf(record), pending: null }); requireMeta(draft); switchTo(id, snap, slot); remote = record; return reconcile(true, ticket);
    }),
    useCloud: () => action(async ticket => {
      if (!authenticated) throw new Error('请先登录这个账号。'); const snap = diskSnapshot(true), at = generation, sourceState = G.state, record = await getRemote(ticket); if (record.none) throw new Error('这个账号还没有云端小屋，可以关联当前进度。'); if (generation !== at || G.state !== sourceState) throw new Error('读取期间本机有了新进度，请下载备份后重新选择。');
      const draft = clone(meta), id = ensureSlot(draft, account), slot = Object.assign({}, draft.slots[id], { account: clone(account), bound: true, base: baseOf(record), pending: null }); requireMeta(draft); switchTo(id, record.snapshot, slot, meta.active === id && snap.hash !== record.snapshot.hash ? 'branch' : null, sourceState); remote = record; setPhase('ready', '已恢复这个账号的小屋。'); return { ok: true };
    }),
    resolveConflict: choice => action(async ticket => {
      if (!authenticated || !binding() || !conflict || !['local', 'cloud'].includes(choice)) throw new Error('请先登录并选择要继续的小屋。');
      const snap = diskSnapshot(true), at = generation, sourceState = G.state, record = await getRemote(ticket); if (generation !== at || G.state !== sourceState) throw new Error('比较期间小屋有了新进度，请重新确认。');
      if (choice === 'cloud') { if (record.none) throw new Error('云端目前没有可恢复的小屋，本机进度仍保留。'); switchTo(meta.active, record.snapshot, Object.assign({}, activeSlot(), { base: baseOf(record), pending: null }), 'branch', sourceState); remote = record; setPhase('ready', '已恢复云端小屋，恢复前的本机分支仍可下载。'); return { ok: true }; }
      const draft = clone(meta); if (!record.none && record.snapshot.hash !== snap.hash) preserve(draft, record.snapshot, 'remote'); draft.slots[draft.active].base = baseOf(record); draft.slots[draft.active].pending = null; requireMeta(draft); conflict = null; remote = record; return upload(snap, record, ticket);
    }),
    logout: () => { stopSessionRecovery(); return action(async ticket => {
      cacheCurrent();
      // 冷启动尚未确认会话时，显式退出也要撤销Cookie，不能只换回guest后留下自动登录的凭据。
      if (!authenticated && account) {
        const session = (await request('/session', 'GET', null, null, ticket)).data;
        if (session.authenticated) {
          if (!session.account || session.account.id !== account.id) { const error = new Error('当前浏览器账号已变化，请先保留进度并重新登录。'); error.status = 401; error.code = 'ACCOUNT_CHANGED'; throw error; }
          authenticated = true; csrf = session.csrfToken;
        }
      }
      if (authenticated) await request('/logout', 'POST', {}, null, ticket);
      authenticated = false; csrf = ''; account = null; remote = null; conflict = null;
      const slot = meta.slots.guest || { account: null, bound: false, base: null, pending: null }, snap = slot.json ? snapshotOf(slot.json) : snapshotOf(G.store.defaultState()); switchTo('guest', snap, slot); setPhase('guest', '已退出账号。账号离线副本仍保留，当前可继续单机游玩。'); return { ok: true };
    }); },
    downloadCloud: revision => action(async ticket => { if (!authenticated) throw new Error('请先登录，再下载账号存档。'); const record = await getRemote(ticket, revision); if (record.none) throw new Error('这个账号还没有云端存档。'); G.utils.download('棉花糖小屋-云端-' + record.revision + '.json', record.snapshot.json, 'application/json;charset=utf-8'); return { ok: true }; }),
    downloadBackup(id) {
      try { let json; if (!id || id === 'current' || id === meta.active) json = JSON.stringify(G.store.validate(G.state)); else if (id === 'recovery' && meta.recovery) json = meta.recovery.json; else if (meta.slots[id] && meta.slots[id].json) json = meta.slots[id].json; else throw new Error('没有找到这份离线副本。'); snapshotOf(json); G.utils.download('棉花糖小屋-离线备份-' + (id || 'current') + '.json', json, 'application/json;charset=utf-8'); return { ok: true }; } catch (error) { return fail(errorText(error)); }
    },
    forgetBackup(id) { if (!available || !ownsLease() || actionBusy || syncTask || meta.journal) return fail('小屋正在处理进度，请稍后再整理副本。'); if (id === meta.active || id === 'current') return fail('当前活动小屋不能从这里删除。'); const draft = clone(meta); if (id === 'recovery') draft.recovery = null; else if (id === 'guest') delete draft.slots.guest.json; else if (own(draft.slots, id)) delete draft.slots[id]; else return fail('没有找到这份副本。'); if (!writeMeta(draft)) return fail(message); emit(); return { ok: true }; },
    takeover() {
      if (!available || protectedMeta) return Promise.resolve(fail(message));
      if (actionBusy || syncTask) return Promise.resolve(fail('小屋正在处理之前的连接，请稍后再接管。'));
      stopSessionRecovery();
      try {
        if (!claimLease(true)) return Promise.resolve(fail(message)); epoch++; loadMeta(true);
        const raw = window.localStorage.getItem(G.data.balance.saveKey), snap = raw ? snapshotOf(raw) : null;
        if (snap) { const draft = clone(meta); draft.slots[draft.active].json = snap.json; requireMeta(draft); }
        // 只读页的内存可能落后于原主人；先恢复实际磁盘快照，绝不能先flush旧内存。
        if (snap) { switching = true; let restored; try { restored = G.save.restore(snap.state, { source: 'cloud' }); } finally { switching = false; } if (!restored || !restored.ok) { protectedMeta = true; loseLease(); return Promise.resolve(fail(restored && restored.message || message)); } }
        latest = snap; setPhase('guest', '已接管本浏览器的小屋，正在核对账号。'); return action(async ticket => acceptSession((await request('/session', 'GET', null, null, ticket)).data, ticket));
      } catch (error) { protectedMeta = true; loseLease(); return Promise.resolve(fail(errorText(error))); }
    }
  };
})(window.Game);
