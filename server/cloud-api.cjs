'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { readActiveId, readManifest, normalizeBasePath, hash } = require('./releases.cjs');
const { createSaveValidator, contractHash, MAX_SAVE_BYTES, MAX_SAVE_CHARS } = require('./save-validator.cjs');
const { openCloudStore } = require('./cloud-store.cjs');
const { createLiveHub, LiveError } = require('./live-hub.cjs');
const scrypt = promisify(crypto.scrypt);
const PASSWORD_OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const PUBLIC_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
class ApiError extends Error { constructor(status, code, message, details = {}) { super(message); Object.assign(this, { status, code, details }); } }
function fault(status, code, message, details) { throw new ApiError(status, code, message, details); }
function etagFor(epoch, row) { return '"' + epoch + ':' + row.revision + ':' + row.content_hash + '"'; }
function summary(epoch, row) { return { revision: row.revision, serverEpoch: epoch, contentHash: row.content_hash, updatedAt: row.updated_at }; }
function canonicalOrigin(value) {
  let url;
  try { url = new URL(value); } catch (_) { throw new Error('origin 必须是完整的 HTTP(S) 来源。'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.origin === 'null') throw new Error('origin 不能包含路径、凭据或查询。');
  return url.origin;
}
function readJson(req, maxBytes, allowEmpty = false) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers?.['content-type'] || '')) { req.resume?.(); return Promise.reject(new ApiError(415, 'JSON_REQUIRED', '请使用JSON请求。')); }
  const declared = req.headers?.['content-length'];
  if (declared !== undefined && (!/^\d+$/.test(String(declared)) || Number(declared) > maxBytes)) { req.resume?.(); return Promise.reject(new ApiError(413, 'BODY_TOO_LARGE', '请求内容过大。')); }
  return new Promise((resolve, reject) => {
    let bytes = 0, chunks = [], settled = false;
    const timer = setTimeout(() => fail(new ApiError(408, 'REQUEST_TIMEOUT', '读取请求超时，请重试。')), 15000); timer.unref?.();
    function cleanup() { clearTimeout(timer); req.removeListener('data', onData); req.removeListener('end', onEnd); req.removeListener('error', onError); req.removeListener('aborted', onAborted); }
    function fail(error) { if (settled) return; settled = true; cleanup(); chunks = []; req.resume?.(); reject(error); }
    function onData(chunk) { const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); bytes += value.length; if (bytes > maxBytes) return fail(new ApiError(413, 'BODY_TOO_LARGE', '请求内容过大。')); chunks.push(value); }
    function onEnd() {
      if (settled) return;
      try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
        const value = allowEmpty && text.trim() === '' ? {} : JSON.parse(text);
        if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('object required');
        settled = true; cleanup(); resolve(value);
      } catch (_) { fail(new ApiError(400, 'INVALID_JSON', '请求不是有效JSON对象。')); }
    }
    function onError() { fail(new ApiError(400, 'REQUEST_INTERRUPTED', '请求没有读完，请重试。')); }
    function onAborted() { onError(); }
    req.on('data', onData); req.on('end', onEnd); req.on('error', onError); req.on('aborted', onAborted);
  });
}
function createCloudApi({ dataDir, basePath = '/', origin, secureCookies = false, clock = Date.now, sessionTtlMs = 7 * 24 * 60 * 60 * 1000, authLimit = 6, liveOptions = {} }) {
  const prefix = normalizeBasePath(basePath), allowedOrigin = canonicalOrigin(origin);
  if (secureCookies && !allowedOrigin.startsWith('https://')) throw new Error('secure-cookies 需要 HTTPS origin。');
  if (!Number.isSafeInteger(sessionTtlMs) || sessionTtlMs < 1000 || sessionTtlMs > 30 * 24 * 60 * 60 * 1000 || !Number.isInteger(authLimit) || authLimit < 1) throw new Error('账号有效期或限流设置无效。');
  const secure = secureCookies || allowedOrigin.startsWith('https://'), store = openCloudStore({ dataDir, clock }), db = store.db;
  const cookieName = 'mc_session_' + hash(prefix || '/').slice(0, 12), cookiePath = prefix + '/';
  let validator = null, validatorRelease = null, activeAuth = 0, liveHub = null;
  function currentValidator() {
    const id = readActiveId(dataDir);
    if (id !== validatorRelease) { const next = createSaveValidator({ dataDir, releaseId: id }); validator = next; validatorRelease = id; }
    return validator;
  }
  try { currentValidator(); } catch (error) { void store.close(); throw error; }
  function compatibleBuild(req) {
    if (req.headers?.['x-mc-protocol'] !== '1') fault(426, 'CLIENT_INCOMPATIBLE', '小屋页面需要更新，请先保留本机进度再刷新。');
    const active = currentValidator();
    let build, buildContract;
    try { build = readManifest(dataDir, req.headers?.['x-mc-build']); buildContract = contractHash(build); } catch (_) { fault(426, 'CLIENT_INCOMPATIBLE', '这份页面版本已不能同步，请先导出JSON再更新。'); }
    if (build.basePath !== prefix || buildContract !== active.contractHash) fault(426, 'CLIENT_INCOMPATIBLE', '页面与云存档规则已不同，请先保留本机进度再更新。');
    return active;
  }
  function sessionToken(req) {
    const cookies = String(req.headers?.cookie || '').split(';').map(value => value.trim()).filter(value => value.startsWith(cookieName + '='));
    if (cookies.length !== 1) return null;
    const token = cookies[0].slice(cookieName.length + 1);
    return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
  }
  function csrfFor(token) { return hash('mc-csrf:' + token); }
  function findSession(req) {
    const token = sessionToken(req); if (!token) return null;
    const row = db.prepare('SELECT s.*, a.username, a.display_name FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE token_hash=?').get(hash(token));
    if (!row) { liveHub?.invalidateSession(hash(token)); return null; }
    if (row.expires_at <= clock() || row.epoch !== store.epoch()) { db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(token)); liveHub?.invalidateSession(hash(token)); return null; }
    return { ...row, token };
  }
  function requireSession(req) {
    const session = findSession(req);
    if (!session) fault(401, 'SESSION_EXPIRED', '请重新登录；本机未同步进度仍保留。');
    if (req.headers?.['x-mc-account'] !== session.account_id) fault(401, 'ACCOUNT_CHANGED', '当前浏览器账号已变化，请先保留进度并重新连接。');
    return session;
  }
  function checkOrigin(req, required = false) {
    const actual = req.headers?.origin;
    if ((required && actual !== allowedOrigin) || (actual !== undefined && actual !== allowedOrigin) || req.headers?.['sec-fetch-site'] === 'cross-site') fault(403, 'ORIGIN_REJECTED', '这个来源不能修改或读取小屋账号。');
  }
  function checkCsrf(req, session) {
    const supplied = req.headers?.['x-csrf-token'];
    if (typeof supplied !== 'string' || supplied.length !== 64 || !crypto.timingSafeEqual(Buffer.from(hash(supplied)), Buffer.from(hash(csrfFor(session.token))))) fault(403, 'CSRF_REJECTED', '账号验证已变化，请重新连接账号。');
  }
  function cookie(token, expires = false) { return cookieName + '=' + (expires ? '' : token) + '; Path=' + cookiePath + '; HttpOnly; SameSite=Strict; Max-Age=' + (expires ? '0' : Math.floor(sessionTtlMs / 1000)) + (secure ? '; Secure' : ''); }
  function accountBody(session) { return { authenticated: true, account: { id: session.account_id, username: session.username, displayName: session.display_name }, csrfToken: csrfFor(session.token), protocol: 1, serverEpoch: store.epoch() }; }
  function newSession(account) {
    const token = crypto.randomBytes(32).toString('base64url'), now = clock(), epoch = store.epoch();
    db.prepare('DELETE FROM sessions WHERE expires_at <= ? OR epoch <> ?').run(now, epoch);
    db.prepare('INSERT INTO sessions(token_hash,account_id,expires_at,created_at,epoch) VALUES (?,?,?,?,?)').run(hash(token), account.id, now + sessionTtlMs, now, epoch);
    db.prepare('DELETE FROM sessions WHERE account_id=? AND token_hash NOT IN (SELECT token_hash FROM sessions WHERE account_id=? ORDER BY created_at DESC, rowid DESC LIMIT 20)').run(account.id, account.id);
    return { account_id: account.id, username: account.username, display_name: account.display_name, token };
  }
  function reserveAuth(req, username) {
    const now = clock(), windowMs = 15 * 60 * 1000, ip = String(req.socket?.remoteAddress || 'local');
    const keys = [[hash('ip:' + ip), Math.max(30, authLimit * 5)], [hash('user:' + username), authLimit]];
    store.transaction(() => {
      db.prepare('DELETE FROM auth_limits WHERE window_start < ?').run(now - windowMs);
      for (const [key, limit] of keys) {
        const row = db.prepare('SELECT * FROM auth_limits WHERE key=?').get(key);
        if (row && row.attempts >= limit) fault(429, 'AUTH_RATE_LIMIT', '试了几次还没连上，请稍后再试。', { retryAfter: Math.max(1, Math.ceil((row.window_start + windowMs - now) / 1000)) });
      }
      for (const [key] of keys) db.prepare('INSERT INTO auth_limits(key,window_start,attempts) VALUES (?,?,1) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1').run(key, now);
    });
    if (activeAuth >= 4) fault(429, 'AUTH_BUSY', '账号服务正忙，请稍后再试。');
  }
  function authInput(body, register) {
    if (Object.keys(body).some(key => !['username', 'password', ...(register ? ['displayName'] : [])].includes(key))) fault(400, 'INVALID_ACCOUNT', '账号输入含有多余字段。');
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    if (!/^[a-z0-9_]{3,32}$/.test(username)) fault(422, 'INVALID_USERNAME', '账号名请用3–32位英文字母、数字或下划线。');
    if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128 || Buffer.byteLength(body.password) > 512) fault(422, 'INVALID_PASSWORD', '密码需要8–128个字符。');
    const displayName = body.displayName === undefined ? username : typeof body.displayName === 'string' ? body.displayName.trim() : '';
    if (register && (!displayName || [...displayName].length > 24 || /[\x00-\x1f\x7f]/.test(displayName))) fault(422, 'INVALID_DISPLAY_NAME', '昵称请写1–24个字，不使用控制符。');
    return { username, password: body.password, displayName };
  }
  async function authenticate(req, body, register) {
    const input = authInput(body, register); reserveAuth(req, input.username); activeAuth++;
    try {
      const existing = db.prepare('SELECT * FROM accounts WHERE username=?').get(input.username);
      const salt = register ? crypto.randomBytes(16).toString('hex') : existing?.password_salt || 'not-a-real-account-salt';
      const derived = await scrypt(input.password, salt, 64, PASSWORD_OPTIONS);
      if (register) {
        if (existing) fault(409, 'USERNAME_TAKEN', '这个账号名已经有人用了，换一个试试。');
        return store.transaction(() => {
          if (db.prepare('SELECT id FROM accounts WHERE username=?').get(input.username)) fault(409, 'USERNAME_TAKEN', '这个账号名已经有人用了，换一个试试。');
          const account = { id: crypto.randomUUID(), username: input.username, display_name: input.displayName };
          db.prepare('INSERT INTO accounts(id,username,display_name,password_salt,password_hash,created_at) VALUES (?,?,?,?,?,?)').run(account.id, account.username, account.display_name, salt, derived.toString('hex'), clock());
          return newSession(account);
        });
      }
      if (!existing || !crypto.timingSafeEqual(derived, Buffer.from(existing.password_hash, 'hex'))) fault(401, 'LOGIN_FAILED', '账号名或密码不对，再检查一下吧。');
      db.prepare('DELETE FROM auth_limits WHERE key=?').run(hash('user:' + input.username));
      return store.transaction(() => newSession(existing));
    } finally { activeAuth--; }
  }
  function saveWrite(req, body, session, checker) {
    if (Object.keys(body).some(key => !['save', 'mutationId', 'expectedEpoch'].includes(key)) || typeof body.mutationId !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(body.mutationId) || typeof body.expectedEpoch !== 'string') fault(400, 'INVALID_SAVE_REQUEST', '同步请求不完整，请重新打开账号面板。');
    let rawJson;
    try { rawJson = JSON.stringify(body.save); } catch (_) { fault(422, 'INVALID_SAVE', '这份进度格式不正确，原进度保留。'); }
    if (typeof rawJson !== 'string') fault(422, 'INVALID_SAVE', '请求中没有完整小屋进度。');
    if (rawJson.length > MAX_SAVE_CHARS || Buffer.byteLength(rawJson) > MAX_SAVE_BYTES) fault(413, 'SAVE_TOO_LARGE', '小屋存档超过容量，请先导出JSON再整理相册。');
    let checked;
    try { checked = checker.validate(body.save); } catch (_) { fault(422, 'INVALID_SAVE', '这份进度没有通过校验，原云端小屋保留。'); }
    return store.transaction(() => {
      const epoch = store.epoch();
      if (body.expectedEpoch !== epoch) fault(412, 'EPOCH_MISMATCH', '云备份已经恢复过，请重新登录并比较两份进度。', { serverEpoch: epoch });
      const receipt = db.prepare('SELECT * FROM mutations WHERE account_id=? AND mutation_id=?').get(session.account_id, body.mutationId);
      if (receipt) {
        if (receipt.content_hash !== checked.contentHash) fault(409, 'MUTATION_REUSED', '同一同步请求不能改成另一份进度。');
        return { row: receipt, epoch };
      }
      const previous = db.prepare('SELECT * FROM saves WHERE account_id=?').get(session.account_id);
      const match = req.headers?.['if-match'], none = req.headers?.['if-none-match'];
      if (match === undefined && none === undefined) fault(428, 'PRECONDITION_REQUIRED', '需要先比较云端版本再同步。');
      if (match !== undefined && none !== undefined) fault(400, 'INVALID_PRECONDITION', '同步版本条件有冲突。');
      if (previous ? match !== etagFor(epoch, previous) || none !== undefined : none !== '*' || match !== undefined) fault(412, 'SAVE_CONFLICT', '两台设备的小屋都有变化，请先比较并选择。', { serverEpoch: epoch });
      const row = previous && previous.content_hash === checked.contentHash ? previous : { account_id: session.account_id, revision: (previous?.revision || 0) + 1, json: checked.json, content_hash: checked.contentHash, updated_at: clock() };
      if (row !== previous) {
        db.prepare('INSERT INTO saves(account_id,revision,json,content_hash,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET revision=excluded.revision,json=excluded.json,content_hash=excluded.content_hash,updated_at=excluded.updated_at').run(row.account_id, row.revision, row.json, row.content_hash, row.updated_at);
        db.prepare('INSERT INTO versions(account_id,revision,json,content_hash,updated_at) VALUES (?,?,?,?,?)').run(row.account_id, row.revision, row.json, row.content_hash, row.updated_at);
        db.prepare('DELETE FROM versions WHERE account_id=? AND revision NOT IN (SELECT revision FROM versions WHERE account_id=? ORDER BY revision DESC LIMIT 10)').run(session.account_id, session.account_id);
      }
      db.prepare('INSERT INTO mutations(account_id,mutation_id,content_hash,revision,updated_at,epoch) VALUES (?,?,?,?,?,?)').run(session.account_id, body.mutationId, row.content_hash, row.revision, row.updated_at, epoch);
      db.prepare('DELETE FROM mutations WHERE account_id=? AND rowid NOT IN (SELECT rowid FROM mutations WHERE account_id=? ORDER BY rowid DESC LIMIT 256)').run(session.account_id, session.account_id);
      // 每个小朋友的房子默认都是公开的，未选择不公开时自动公开并跟随最新布置。
      const optedOut = db.prepare("SELECT 1 FROM metadata WHERE key=?").get('private:' + session.account_id);
      if (!optedOut) {
        const state = JSON.parse(checked.json);
        const existingPub = db.prepare('SELECT id, title, display_name, snapshot_json FROM publications WHERE account_id=?').get(session.account_id);
        const title = existingPub?.title || (typeof state.house?.name === 'string' && state.house.name.trim()) || '我的小屋';
        const displayName = existingPub?.display_name || defaultPublicName(session.account_id);
        const snapshot = checker.projectPublic(state, { title, displayName });
        const pubId = existingPub?.id || crypto.randomUUID();
        const roomCount = checker.countBuildingRooms(snapshot.building);
        // 公开投影没变（只是钱包等私有数据变了）时只记录来源修订，不改updated_at，避免在线访客被无谓刷新。
        if (existingPub && existingPub.snapshot_json === JSON.stringify(snapshot)) db.prepare('UPDATE publications SET source_revision=? WHERE account_id=?').run(row.revision, session.account_id);
        else db.prepare('INSERT INTO publications(id,account_id,title,display_name,snapshot_json,source_revision,room_count,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET title=excluded.title,display_name=excluded.display_name,snapshot_json=excluded.snapshot_json,source_revision=excluded.source_revision,room_count=excluded.room_count,updated_at=excluded.updated_at').run(pubId, session.account_id, title, displayName, JSON.stringify(snapshot), row.revision, roomCount, clock());
      }
      return { row, epoch };
    });
  }
  // 没自己填昵称时账号昵称等于登录名，绝不能当作公开展示昵称。
  function defaultPublicName(accountId) {
    const row = db.prepare('SELECT username, display_name FROM accounts WHERE id=?').get(accountId);
    return row && row.display_name && row.display_name !== row.username ? row.display_name : '小小建筑师';
  }
  function publicationSummary(row, own = false) {
    return { id: row.id, title: row.title, displayName: row.display_name, roomCount: row.room_count, updatedAt: row.updated_at, ...(own ? { sourceRevision: row.source_revision } : {}) };
  }
  function publicationInput(body) {
    if (Object.keys(body).some(key => !['title', 'displayName', 'expectedRevision'].includes(key))) fault(400, 'INVALID_PUBLICATION', '公开小屋只能提交名称、展示昵称和当前云版本。');
    const result = {};
    for (const key of ['title', 'displayName']) {
      const value = typeof body[key] === 'string' ? body[key].trim() : '';
      if (!value || [...value].length > 24 || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(value)) fault(422, 'INVALID_PUBLICATION', '公开小屋名和展示昵称各写1–24个字，不要换行。');
      result[key] = value;
    }
    if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 1) fault(422, 'INVALID_PUBLICATION', '请先保存并同步自己的小屋，再主动公开。');
    result.expectedRevision = body.expectedRevision;
    return result;
  }
  function publish(body, session, checker) {
    const input = publicationInput(body);
    return store.transaction(() => {
      const saved = db.prepare('SELECT revision,json FROM saves WHERE account_id=?').get(session.account_id);
      if (!saved) fault(409, 'NO_SAVED_HOUSE', '请先关联并同步自己的小屋，再主动公开。');
      if (saved.revision !== input.expectedRevision) fault(412, 'PUBLICATION_STALE', '云端小屋已有变化，请重新同步并确认公开。');
      // 清除不公开选择，恢复公开状态
      db.prepare("DELETE FROM metadata WHERE key=?").run('private:' + session.account_id);
      // 只从本人当前云档投影，不接受或透传客户端公开JSON与所有者字段。
      const state = JSON.parse(saved.json), snapshot = checker.projectPublic(state, { title: input.title, displayName: input.displayName });
      const previous = db.prepare('SELECT id FROM publications WHERE account_id=?').get(session.account_id);
      const row = { id: previous?.id || crypto.randomUUID(), account_id: session.account_id, title: input.title, display_name: input.displayName, snapshot_json: JSON.stringify(snapshot), source_revision: saved.revision, room_count: checker.countBuildingRooms(snapshot.building), updated_at: clock() };
      db.prepare('INSERT INTO publications(id,account_id,title,display_name,snapshot_json,source_revision,room_count,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET title=excluded.title,display_name=excluded.display_name,snapshot_json=excluded.snapshot_json,source_revision=excluded.source_revision,room_count=excluded.room_count,updated_at=excluded.updated_at').run(row.id, row.account_id, row.title, row.display_name, row.snapshot_json, row.source_revision, row.room_count, row.updated_at);
      return row;
    });
  }
  function cursorFor(row) { return Buffer.from(JSON.stringify({ updatedAt: row.updated_at, id: row.id })).toString('base64url'); }
  function publicList(req) {
    let params;
    try { params = new URL(req.url, 'http://local.invalid').searchParams; } catch (_) { fault(400, 'INVALID_CURSOR', '邻居列表地址不完整，请重新打开。'); }
    const values = params.getAll('cursor');
    if (values.length > 1) fault(400, 'INVALID_CURSOR', '邻居列表分页重复，请重新打开。');
    let after = null;
    if (values.length) {
      const raw = values[0];
      try {
        if (!/^[A-Za-z0-9_-]{1,240}$/.test(raw)) throw new Error('cursor');
        after = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
        if (!after || Array.isArray(after) || Object.keys(after).length !== 2 || !Number.isSafeInteger(after.updatedAt) || after.updatedAt < 0 || !PUBLIC_ID.test(after.id) || cursorFor({ updated_at: after.updatedAt, id: after.id }) !== raw) throw new Error('cursor');
      } catch (_) { fault(400, 'INVALID_CURSOR', '邻居列表分页无效，请重新打开。'); }
    }
    const rows = after ? db.prepare('SELECT id,title,display_name,room_count,updated_at FROM publications WHERE updated_at < ? OR (updated_at = ? AND id < ?) ORDER BY updated_at DESC,id DESC LIMIT 25').all(after.updatedAt, after.updatedAt, after.id) : db.prepare('SELECT id,title,display_name,room_count,updated_at FROM publications ORDER BY updated_at DESC,id DESC LIMIT 25').all();
    const page = rows.slice(0, 24);
    return { houses: page.map(row => publicationSummary(row)), nextCursor: rows.length > 24 ? cursorFor(page.at(-1)) : null };
  }
  function liveKeyFor(session) { return hash('mc-live:' + session.token); }
  function onlineNeighbors() {
    const houses = liveHub.directory().map(online => {
      const row = db.prepare('SELECT id,title,display_name,room_count,updated_at FROM publications WHERE id=?').get(online.id);
      return row ? { ...publicationSummary(row), online: { count: online.count, hostOnline: online.hostOnline, displayNames: online.displayNames } } : null;
    }).filter(Boolean);
    houses.sort((a, b) => Number(b.online.count < 8) - Number(a.online.count < 8) || Number(b.online.hostOnline) - Number(a.online.hostOnline) || b.online.count - a.online.count || b.updatedAt - a.updatedAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
    return { houses };
  }
  function joinDisplayNameFor(session) {
    const active = liveHub.displayNameFor(session.account_id), published = active ? null : db.prepare('SELECT display_name FROM publications WHERE account_id=?').get(session.account_id);
    const value = active || published?.display_name || '小小建筑师', normalized = typeof value === 'string' ? value.normalize('NFC').trim() : '';
    return normalized && [...normalized].length <= 24 && !/[\x00-\x1f\x7f-\x9f\u2028\u2029\u202a-\u202e\u2066-\u2069]/.test(normalized) ? normalized : '小小建筑师';
  }
  function requireLive(req) {
    const session = findSession(req);
    if (!session) fault(401, 'LIVE_AUTH_REQUIRED', '请回自己的小屋重新登录，再来串门。');
    const supplied = req.headers?.['x-mc-live'];
    if (typeof supplied !== 'string' || !/^[a-f0-9]{64}$/.test(supplied) || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(liveKeyFor(session)))) fault(401, 'LIVE_SESSION_CHANGED', '浏览器账号已变化，这次串门已结束，请重新登录后主动加入。');
    return session;
  }
  function liveActor(session) { return { accountId: session.account_id, sessionId: session.token_hash }; }
  function liveSessionValid(actor) {
    const session = db.prepare('SELECT account_id,expires_at,epoch FROM sessions WHERE token_hash=?').get(actor.sessionId);
    return !!session && session.account_id === actor.accountId && session.expires_at > clock() && session.epoch === store.epoch();
  }
  function liveHouse(id) {
    const row = db.prepare('SELECT id,account_id,title,snapshot_json,updated_at FROM publications WHERE id=?').get(id); if (!row) return null;
    const snapshot = JSON.parse(row.snapshot_json);
    return { id: row.id, title: row.title, ownerId: row.account_id, version: hash(row.snapshot_json + '\n' + row.title + '\n' + row.updated_at), zones: snapshot.building ? snapshot.building.floors.map(floor => floor.id) : Object.keys(snapshot.house.rooms) };
  }
  function liveAvatar(accountId) {
    const checker = currentValidator(), saved = db.prepare('SELECT json FROM saves WHERE account_id=?').get(accountId);
    // 使用完整校验过的云档或可信默认形象，绝不接收客户端的服装或身份。
    return checker.projectPublic(saved ? JSON.parse(saved.json) : checker.defaultSave(), { title: '串门形象', displayName: '小小建筑师' }).avatar;
  }
  function ownPublicationId(accountId) { return db.prepare('SELECT id FROM publications WHERE account_id=?').get(accountId)?.id || null; }
  liveHub = createLiveHub({ ...liveOptions, getHouse: liveHouse, getAvatar: liveAvatar, sessionValid: liveSessionValid, houseOf: ownPublicationId, nameFor: accountId => joinDisplayNameFor({ account_id: accountId }), clock });
  async function liveRequest(req, res, route, method, send) {
    if (route === '/live/me' && method === 'GET') {
      const session = findSession(req); return send(200, session ? { authenticated: true, liveKey: liveKeyFor(session), csrfToken: csrfFor(session.token), joinDisplayName: joinDisplayNameFor(session) } : { authenticated: false });
    }
    // 敲门：访客 knock/status，屋主 inbox/answer。身份只看登录Cookie与live密钥，不依赖加入后的peer标识。
    if ((route === '/live/knock' || route === '/live/knock/answer') && method === 'POST') {
      const session = requireLive(req); checkCsrf(req, session);
      const body = await readJson(req, 1024), current = requireLive(req); checkCsrf(req, current);
      if (current.token_hash !== session.token_hash) fault(401, 'LIVE_SESSION_CHANGED', '账号已变化，请重新登录后再敲门。');
      compatibleBuild(req);
      return send(200, route === '/live/knock' ? liveHub.knock(liveActor(current), body) : liveHub.answer(liveActor(current), body));
    }
    if (route === '/live/knock/status' && method === 'GET') {
      const session = requireLive(req); let query;
      try { query = new URL(req.url, 'http://local.invalid').searchParams; } catch (_) { fault(400, 'LIVE_INVALID_REQUEST', '敲门地址不完整，请重新打开。'); }
      if ([...query.keys()].some(key => key !== 'requestId') || query.getAll('requestId').length !== 1) fault(422, 'LIVE_INVALID_REQUEST', '敲门地址不完整，请重新打开。');
      return send(200, liveHub.knockStatus(liveActor(session), query.get('requestId')));
    }
    if (route === '/live/inbox' && method === 'GET') {
      const session = requireLive(req); let query;
      try { query = new URL(req.url, 'http://local.invalid').searchParams; } catch (_) { fault(400, 'LIVE_INVALID_CURSOR', '敲门提醒地址不完整，请刷新页面。'); }
      if ([...query.keys()].some(key => !['after', 'open'].includes(key)) || query.getAll('after').length !== 1 || query.getAll('open').length > 1 || !/^(?:0|[1-9]\d{0,15})$/.test(query.get('after')) || (query.has('open') && !['0', '1'].includes(query.get('open')))) fault(422, 'LIVE_INVALID_CURSOR', '敲门提醒版本无效，请刷新页面。');
      const controller = new AbortController(), aborted = () => controller.abort();
      res.once?.('close', aborted); req.once?.('aborted', aborted);
      try {
        const result = await liveHub.inbox(liveActor(session), Number(query.get('after')), { signal: controller.signal, open: query.get('open') !== '0' });
        if (requireLive(req).token_hash !== session.token_hash) fault(401, 'LIVE_SESSION_CHANGED', '账号已变化，请重新登录。');
        return send(200, result);
      } finally { res.removeListener?.('close', aborted); req.removeListener?.('aborted', aborted); }
    }
    if (['/live/knock', '/live/knock/answer', '/live/knock/status', '/live/inbox'].includes(route)) return send(405, { code: 'METHOD_NOT_ALLOWED', message: '这个串门操作方式不可用。' }, { Allow: route === '/live/knock/status' || route === '/live/inbox' ? 'GET' : 'POST' });
    const operations = { '/live/join': 'join', '/live/move': 'move', '/live/chat': 'chat', '/live/leave': 'leave', '/live/kick': 'kick' };
    if (route === '/live/poll' && method === 'GET') {
      const session = requireLive(req), peer = req.headers?.['x-mc-peer']; let query;
      try { query = new URL(req.url, 'http://local.invalid').searchParams; } catch (_) { fault(400, 'LIVE_INVALID_CURSOR', '串门地址不完整，请重新打开。'); }
      if ([...query.keys()].some(key => !['houseId', 'after'].includes(key)) || query.getAll('houseId').length !== 1 || query.getAll('after').length !== 1 || !/^(?:0|[1-9]\d{0,15})$/.test(query.get('after'))) fault(422, 'LIVE_INVALID_CURSOR', '串门画面版本无效，请重新加入。');
      const id = query.get('houseId'), after = Number(query.get('after')), controller = new AbortController(), aborted = () => controller.abort();
      res.once?.('close', aborted); req.once?.('aborted', aborted);
      try {
        const result = await liveHub.poll(liveActor(session), id, peer, after, { signal: controller.signal });
        const current = requireLive(req);
        if (current.token_hash !== session.token_hash || req.headers?.['x-mc-peer'] !== peer) fault(401, 'LIVE_SESSION_CHANGED', '账号或串门页面已变化，请主动重新加入。');
        liveHub.assertMember(liveActor(current), id, peer, false);
        return send(200, result);
      } finally { res.removeListener?.('close', aborted); req.removeListener?.('aborted', aborted); }
    }
    if (operations[route] && method === 'POST') {
      const session = requireLive(req), peer = req.headers?.['x-mc-peer']; checkCsrf(req, session);
      const body = await readJson(req, 4096), current = requireLive(req); checkCsrf(req, current);
      // Cookie和加入标识均绑定读body前的身份，迟到的旧标签不能影响新加入。
      if (current.token_hash !== session.token_hash || req.headers?.['x-mc-peer'] !== peer) fault(401, 'LIVE_SESSION_CHANGED', '账号或串门页面已变化，请主动重新加入。');
      compatibleBuild(req);
      return send(200, operations[route] === 'join' ? liveHub.join(liveActor(current), body) : liveHub[operations[route]](liveActor(current), peer, body));
    }
    if (route === '/live/me' || route === '/live/poll' || operations[route]) return send(405, { code: 'METHOD_NOT_ALLOWED', message: '这个串门操作方式不可用。' }, { Allow: route === '/live/me' || route === '/live/poll' ? 'GET' : 'POST' });
    return send(404, { code: 'NOT_FOUND', message: '没有这个串门接口。' });
  }
  async function handle(req, res, route) {
    const method = req.method || 'GET';
    function send(status, value, headers = {}) {
      if (res.destroyed || res.writableEnded) return;
      const body = Buffer.from(JSON.stringify(value) + '\n');
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store', Pragma: 'no-cache', 'X-Content-Type-Options': 'nosniff', ...headers });
      res.end(method === 'HEAD' ? undefined : body);
    }
    try {
      const checker = compatibleBuild(req); checkOrigin(req, !['GET', 'HEAD'].includes(method));
      if (route.startsWith('/live/')) return await liveRequest(req, res, route, method, send);
      if (route === '/session' && method === 'GET') {
        const session = findSession(req);
        return send(200, session ? accountBody(session) : { authenticated: false, protocol: 1, serverEpoch: store.epoch() }, !session && sessionToken(req) ? { 'Set-Cookie': cookie('', true) } : {});
      }
      if (route === '/neighbors' && method === 'GET') return send(200, publicList(req));
      if (route === '/neighbors/online' && method === 'GET') return send(200, onlineNeighbors());
      if (route.startsWith('/public-houses/') && method === 'GET') {
        const id = route.slice('/public-houses/'.length);
        if (!PUBLIC_ID.test(id)) fault(404, 'PUBLIC_HOUSE_NOT_FOUND', '这座公开小屋暂时不能参观，可能已被主人撤下。');
        const row = db.prepare('SELECT id,title,display_name,room_count,updated_at,snapshot_json FROM publications WHERE id=?').get(id);
        if (!row) fault(404, 'PUBLIC_HOUSE_NOT_FOUND', '这座公开小屋暂时不能参观，可能已被主人撤下。');
        return send(200, { house: publicationSummary(row), snapshot: JSON.parse(row.snapshot_json) });
      }
      if (route === '/my-publication' && method === 'GET') {
        const session = requireSession(req);
        let row = db.prepare('SELECT id,title,display_name,room_count,updated_at,source_revision FROM publications WHERE account_id=?').get(session.account_id);
        if (!row) {
          const optedOut = db.prepare("SELECT 1 FROM metadata WHERE key=?").get('private:' + session.account_id);
          if (!optedOut) {
            const saved = db.prepare('SELECT revision,json FROM saves WHERE account_id=?').get(session.account_id);
            if (saved) {
              const checker = compatibleBuild(req), state = JSON.parse(saved.json);
              const title = (typeof state.house?.name === 'string' && state.house.name.trim()) || '我的小屋', displayName = defaultPublicName(session.account_id);
              const snapshot = checker.projectPublic(state, { title, displayName }), pubId = crypto.randomUUID(), now = clock(), roomCount = checker.countBuildingRooms(snapshot.building);
              store.transaction(() => {
                db.prepare('INSERT INTO publications(id,account_id,title,display_name,snapshot_json,source_revision,room_count,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET title=excluded.title,display_name=excluded.display_name,snapshot_json=excluded.snapshot_json,source_revision=excluded.source_revision,room_count=excluded.room_count,updated_at=excluded.updated_at').run(pubId, session.account_id, title, displayName, JSON.stringify(snapshot), saved.revision, roomCount, now);
              });
              row = { id: pubId, title, display_name: displayName, room_count: roomCount, updated_at: now, source_revision: saved.revision };
            }
          }
        }
        return send(200, { publication: row ? publicationSummary(row, true) : null });
      }
      if (route === '/my-publication' && ['POST', 'DELETE'].includes(method)) {
        const session = requireSession(req); checkCsrf(req, session);
        const body = await readJson(req, method === 'POST' ? 4096 : 1024, method === 'DELETE');
        const current = requireSession(req); checkCsrf(req, current);
        if (method === 'POST') { const row = publish(body, current, compatibleBuild(req)); liveHub.refreshHouse(row.id); return send(200, { publication: publicationSummary(row, true) }); }
        if (Object.keys(body).length) fault(400, 'INVALID_PUBLICATION', '撤下公开小屋不需要其它资料。');
        const own = db.prepare('SELECT id FROM publications WHERE account_id=?').get(current.account_id);
        store.transaction(() => {
          db.prepare('DELETE FROM publications WHERE account_id=?').run(current.account_id);
          db.prepare("INSERT OR REPLACE INTO metadata(key,value) VALUES (?,?)").run('private:' + current.account_id, '1');
        });
        if (own) liveHub.invalidateHouse(own.id, new LiveError(404, 'LIVE_HOUSE_GONE', '主人已撤下这座公开小屋，这次串门结束了。'));
        return send(200, { ok: true, publication: null });
      }
      if (['/register', '/login'].includes(route) && method === 'POST') {
        const body = await readJson(req, 4096), session = await authenticate(req, body, route === '/register');
        liveHub.sweep();
        return send(200, accountBody(session), { 'Set-Cookie': cookie(session.token) });
      }
      if (route === '/logout' && method === 'POST') {
        const session = requireSession(req); checkCsrf(req, session); await readJson(req, 1024, true);
        const current = requireSession(req); checkCsrf(req, current);
        db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(current.token));
        liveHub.invalidateSession(current.token_hash);
        return send(200, { ok: true }, { 'Set-Cookie': cookie('', true) });
      }
      if (route === '/save' && method === 'PUT') {
        const session = requireSession(req); checkCsrf(req, session);
        const body = await readJson(req, 4 * 1024 * 1024);
        const current = requireSession(req); checkCsrf(req, current);
        const saved = saveWrite(req, body, current, compatibleBuild(req));
        const pub = db.prepare('SELECT id FROM publications WHERE account_id=?').get(current.account_id);
        if (pub) liveHub.refreshHouse(pub.id);
        return send(200, summary(saved.epoch, saved.row), { ETag: etagFor(saved.epoch, saved.row) });
      }
      if (method === 'GET' && (route === '/save' || route === '/save/versions' || /^\/save\/versions\/[1-9]\d{0,14}$/.test(route))) {
        const session = requireSession(req), epoch = store.epoch();
        if (route === '/save/versions') return send(200, { versions: db.prepare('SELECT revision, content_hash, updated_at FROM versions WHERE account_id=? ORDER BY revision DESC').all(session.account_id).map(row => summary(epoch, row)) });
        const row = route === '/save' ? db.prepare('SELECT * FROM saves WHERE account_id=?').get(session.account_id) : db.prepare('SELECT * FROM versions WHERE account_id=? AND revision=?').get(session.account_id, Number(route.split('/').pop()));
        if (!row) fault(404, 'NO_SAVE', '云端还没有这份小屋进度。', { serverEpoch: epoch });
        // 先核对原始记录，不能让读取时的迁移掩盖数据库原文损坏。
        if (hash(row.json) !== row.content_hash) fault(503, 'SAVE_INTEGRITY_FAILED', '云端存档原文与摘要不一致，已停止恢复；原文和本机进度仍保留，请先保留备份。');
        const checked = checker.validate(JSON.parse(row.json));
        // 客户端收到的save和contentHash属于同一份归一化文档；CAS仍绑定磁盘原行。
        // GET不覆盖旧JSON或旧历史，直到玩家正常保存才产生下一修订。
        return send(200, { save: checked.save, ...summary(epoch, row), contentHash: checked.contentHash }, { ETag: etagFor(epoch, row) });
      }
      if (['/session', '/register', '/login', '/logout', '/save', '/save/versions', '/neighbors', '/neighbors/online', '/my-publication'].includes(route) || route.startsWith('/public-houses/')) return send(405, { code: 'METHOD_NOT_ALLOWED', message: '这个操作方式不可用。' }, { Allow: route === '/save' ? 'GET, PUT' : route === '/my-publication' ? 'GET, POST, DELETE' : ['/register', '/login', '/logout'].includes(route) ? 'POST' : 'GET' });
      return send(404, { code: 'NOT_FOUND', message: '没有这个小屋接口。' });
    } catch (error) {
      if (error instanceof ApiError || error instanceof LiveError) return send(error.status, { code: error.code, message: error.message, ...error.details }, error.status === 429 ? { 'Retry-After': String(error.details.retryAfter || 30) } : {});
      return send(503, { code: 'SERVICE_UNAVAILABLE', message: '云存档暂时没有连上，本机进度继续保留。' });
    }
  }
  return { handle, store, cookieName, liveHub, closeLive: () => liveHub.close(), close: async () => { liveHub.close(); await store.close(); }, backupDatabase: store.backupDatabase, rotateEpoch: () => { const epoch = store.rotateEpoch(); liveHub.reset(); return epoch; }, currentValidator };
}
module.exports = { createCloudApi, ApiError, readJson, canonicalOrigin, etagFor };
