'use strict';

const crypto = require('node:crypto');
const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const FORBIDDEN_TEXT = /[\x00-\x1f\x7f-\x9f\u2028\u2029\u202a-\u202e\u2066-\u2069]/;
class LiveError extends Error {
  constructor(status, code, message, details = {}) { super(message); Object.assign(this, { status, code, details }); }
}
function fail(status, code, message, details) { throw new LiveError(status, code, message, details); }
function copy(value) { return JSON.parse(JSON.stringify(value)); }
function text(value, max, code) {
  if (typeof value !== 'string' || FORBIDDEN_TEXT.test(value)) fail(422, code, '请使用简短的单行文字，不使用控制符。');
  const result = value.normalize('NFC').trim();
  if (!result || [...result].length > max) fail(422, code, '文字需要1–' + max + '个字。');
  return result;
}
function exact(body, keys, optional = []) {
  if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).some(key => !keys.includes(key) && !optional.includes(key)) || keys.some(key => !Object.hasOwn(body, key))) fail(400, 'LIVE_INVALID_REQUEST', '串门请求不完整或包含多余资料。');
}
function houseId(value) { if (typeof value !== 'string' || !ID.test(value)) fail(422, 'LIVE_INVALID_HOUSE', '请从邻居列表重新打开这座小屋。'); return value; }
function peerId(value) { if (typeof value !== 'string' || !ID.test(value)) fail(409, 'LIVE_MEMBER_GONE', '这次串门已结束，请主动重新加入。'); return value; }

// 在线状态只驻留内存，既不读取请求凭据，也不触碰SQLite或私人存档。
// 敲门：访客请求→屋主在主游戏页同意→发入场凭证。请求、凭证、冷却和屋主在线状态同样只在内存。
function createLiveHub({ getHouse, getAvatar, sessionValid, houseOf = () => null, nameFor = () => '小小建筑师', requireKnock = true, clock = Date.now, pollMs = 8000, ttlMs = 35000, sweepMs = 5000, maxRooms = 64, maxMembers = 256, maxRoomMembers = 8, knockTtlMs = 120000, ticketTtlMs = 300000, cooldownMs = 600000, hostPresenceMs = 25000, maxPending = 3, knocksPerMinute = 3 } = {}) {
  if (typeof getHouse !== 'function' || typeof getAvatar !== 'function' || typeof sessionValid !== 'function' || typeof houseOf !== 'function' || typeof nameFor !== 'function') throw new Error('串门服务缺少可信资料接口。');
  if (![pollMs, ttlMs, sweepMs, maxRooms, maxMembers, maxRoomMembers, knockTtlMs, ticketTtlMs, cooldownMs, hostPresenceMs, maxPending, knocksPerMinute].every(n => Number.isSafeInteger(n) && n > 0) || pollMs > 8000 || maxRooms > 64 || maxMembers > 256 || maxRoomMembers > 8) throw new Error('串门容量或时限无效。');
  const rooms = new Map(), members = new Map(), joins = new Map();
  const knocks = new Map(), tickets = new Map(), cooldowns = new Map(), hosts = new Map(), knockTimes = new Map(), knockRevisions = new Map(), inboxWaiters = new Map();
  let closed = false;
  function ready() { if (closed) fail(503, 'LIVE_CLOSED', '串门服务正在重新准备，请稍后主动加入。'); }
  function actorValid(actor) {
    if (!actor || typeof actor.accountId !== 'string' || typeof actor.sessionId !== 'string') fail(401, 'LIVE_AUTH_REQUIRED', '请回自己的小屋重新登录，再来串门。');
    if (!sessionValid(actor)) { invalidateSession(actor.sessionId); fail(401, 'LIVE_AUTH_REQUIRED', '请回自己的小屋重新登录，再来串门。'); }
  }
  function publicPeer(member) { return { id: member.id, displayName: member.displayName, avatar: copy(member.avatar), isHost: member.isHost, zone: member.zone, x: member.x, y: member.y, updatedAt: member.updatedAt }; }
  function packet(room, member) { return { revision: room.revision, houseVersion: room.version, peers: [...room.members.values()].map(publicPeer), messages: room.messages.filter(message => message.seq > member.joinedChatSeq).map(copy) }; }
  function finishWait(member, error) {
    const wait = member.waiter; if (!wait) return;
    member.waiter = null; clearTimeout(wait.timer); wait.signal?.removeEventListener('abort', wait.abort);
    if (error) wait.reject(error); else wait.resolve(packet(wait.room, member));
  }
  function wake(room) { for (const member of room.members.values()) finishWait(member); }
  function remove(member, error, keepRoom = false) {
    const room = rooms.get(member.houseId);
    finishWait(member, error || new LiveError(409, 'LIVE_MEMBER_GONE', '这次串门已结束，请主动重新加入。'));
    if (members.get(member.accountId) === member) members.delete(member.accountId);
    if (room?.members.get(member.id) === member) { room.members.delete(member.id); room.revision++; wake(room); if (!room.members.size && !keepRoom) rooms.delete(room.id); }
  }
  function invalidateHouse(id, error = new LiveError(409, 'LIVE_ROOM_CHANGED', '主人更新了公开布置，请刷新小屋后主动重新加入。')) {
    const room = rooms.get(id); if (!room) return;
    // 先移除整屋，避免逐位清理时向别人发送一个即将失效的中间画面。
    rooms.delete(id);
    for (const member of room.members.values()) { finishWait(member, error); if (members.get(member.accountId) === member) members.delete(member.accountId); }
    room.members.clear(); room.messages.length = 0; room.banned.clear();
  }
  function checkedHouse(id, room) {
    const house = getHouse(id);
    if (!house) { const error = new LiveError(404, 'LIVE_HOUSE_GONE', '主人已撤下这座公开小屋，这次串门结束了。'); invalidateHouse(id, error); throw error; }
    if (room && house.version !== room.version) refreshRoom(room, house);
    return house;
  }
  // 主人更新公开布置：房间、成员、聊天与请离名单都保留，只换成新版小屋；被拆掉的房间里的人回到前院。
  function refreshRoom(room, house) {
    room.version = house.version; room.title = house.title; room.zones = new Set(['yard', ...house.zones]);
    let slot = 0;
    for (const member of room.members.values()) if (!room.zones.has(member.zone)) { member.zone = 'yard'; member.x = Math.min(1, 0.2 + (slot % 4) * 0.18); member.y = 0.45 + (slot % 2) * 0.08; member.updatedAt = clock(); slot++; }
    room.revision++; wake(room);
  }
  function refreshHouse(id) {
    const room = rooms.get(id); if (!room) return;
    try { checkedHouse(id, room); } catch (error) { if (!(error instanceof LiveError)) throw error; }
  }
  function requireMember(actor, id, peer, touch = true) {
    ready(); actorValid(actor); houseId(id); peerId(peer);
    const member = members.get(actor.accountId);
    if (!member || member.id !== peer || member.houseId !== id || member.sessionId !== actor.sessionId) fail(409, 'LIVE_MEMBER_GONE', '这次串门已结束、已在别处加入，或被主人请离；请主动重新加入。');
    const room = rooms.get(id); checkedHouse(id, room);
    if (!room || room.members.get(peer) !== member) fail(409, 'LIVE_MEMBER_GONE', '这次串门已结束，请主动重新加入。');
    if (!sessionValid(member)) { remove(member, new LiveError(401, 'LIVE_AUTH_REQUIRED', '账号已退出或过期，请重新登录。')); fail(401, 'LIVE_AUTH_REQUIRED', '账号已退出或过期，请重新登录。'); }
    if (clock() - member.lastTouch >= ttlMs) { remove(member); fail(409, 'LIVE_MEMBER_GONE', '离开了一会儿，这次串门已结束，请主动重新加入。'); }
    if (touch) member.lastTouch = clock();
    return { room, member };
  }
  function sweep() {
    if (closed) return;
    for (const room of [...rooms.values()]) {
      try { checkedHouse(room.id, room); } catch (error) { if (error instanceof LiveError) continue; throw error; }
      for (const member of [...room.members.values()]) {
        if (!sessionValid(member)) remove(member, new LiveError(401, 'LIVE_AUTH_REQUIRED', '账号已退出或过期，请重新登录。'));
        else if (clock() - member.lastTouch >= ttlMs) remove(member);
      }
    }
    for (const [account, value] of joins) if (clock() - value.at >= 10000) joins.delete(account);
    const now = clock();
    for (const [id, request] of knocks) {
      if (request.status === 'pending' && now - request.at >= knockTtlMs) { request.status = 'expired'; request.decidedAt = now; bumpKnocks(request.houseId); }
      if (request.status !== 'pending' && now - request.decidedAt >= 60000) knocks.delete(id);
    }
    for (const [ticket, value] of tickets) if (value.expires <= now) tickets.delete(ticket);
    for (const [key, until] of cooldowns) if (until <= now) cooldowns.delete(key);
    for (const [id, host] of hosts) if (now - host.at >= hostPresenceMs) closeReception(id);
    for (const [account, times] of knockTimes) { const recent = times.filter(at => now - at < 60000); if (recent.length) knockTimes.set(account, recent); else knockTimes.delete(account); }
  }
  const timer = setInterval(() => { try { sweep(); } catch (_) { /* 短暂资料读取失败不写日志或泄漏身份；下一请求会重新核对。 */ } }, sweepMs); timer.unref?.();
  function join(actor, body) {
    ready(); actorValid(actor); exact(body, ['houseId', 'displayName'], ['ticket']); const id = houseId(body.houseId), displayName = text(body.displayName, 24, 'LIVE_INVALID_NAME'); sweep();
    const house = checkedHouse(id), previous = members.get(actor.accountId); let room = rooms.get(id);
    if (room?.banned.has(actor.accountId)) fail(403, 'LIVE_FORBIDDEN', '主人已请你离开这次聚会，换一座小屋看看吧。');
    // 非屋主必须带着屋主同意后发的入场凭证；凭证绑定这座小屋和这个账号，限时内同一账号可重连，不能转给别人。
    if (requireKnock && actor.accountId !== house.ownerId) {
      const pass = typeof body.ticket === 'string' ? tickets.get(body.ticket) : null;
      if (!pass || pass.houseId !== id || pass.accountId !== actor.accountId || pass.expires <= clock()) fail(403, 'LIVE_KNOCK_REQUIRED', '先敲敲门，等主人同意后才能进来哦。');
    }
    if (room && room.members.size - (previous?.houseId === id ? 1 : 0) >= maxRoomMembers) fail(429, 'LIVE_ROOM_FULL', '这座小屋已有8位小伙伴，稍后再来吧。', { retryAfter: 10 });
    if (members.size - (previous ? 1 : 0) >= maxMembers || (!room && rooms.size >= maxRooms && !(previous && rooms.get(previous.houseId)?.members.size === 1))) fail(429, 'LIVE_CAPACITY', '串门的小伙伴有点多，稍后再来吧。', { retryAfter: 10 });
    const recent = joins.get(actor.accountId), count = recent && clock() - recent.at < 10000 ? recent.count : 0;
    if (count >= 5 || (!recent && joins.size >= 512)) fail(429, 'LIVE_RATE_LIMIT', '先在一座小屋玩一会儿，再换小屋吧。', { retryAfter: 10 });
    // 形象必须由可信云档投影产生，客户端不能上传服装或伪造其他成员。
    const avatar = copy(getAvatar(actor.accountId));
    if (previous) remove(previous, new LiveError(409, 'LIVE_MEMBER_GONE', '这个账号已在另一个页面加入串门。'), previous.houseId === id);
    room = rooms.get(id);
    if (!room) { room = { id, title: house.title, ownerId: house.ownerId, version: house.version, zones: new Set(['yard', ...house.zones]), members: new Map(), banned: new Set(), revision: 0, chatSeq: 0, messages: [] }; rooms.set(id, room); }
    const occupied = new Set([...room.members.values()].map(member => member.spawnSlot)); let slot = 0; while (occupied.has(slot)) slot++;
    // 访客出现在屋主此刻所在的位置旁边；屋主还没进房间时从前院出发。
    const hostMember = [...room.members.values()].find(value => value.isHost && value.accountId !== actor.accountId);
    const spawn = hostMember ? { zone: hostMember.zone, x: Math.min(1, Math.max(0, hostMember.x + 0.18 * (slot % 2 ? 1 : -1) * (1 + Math.floor(slot / 2) * 0.5))), y: Math.min(1, Math.max(0, hostMember.y + (slot % 2 ? 0.1 : -0.1))) } : { zone: 'yard', x: Math.min(1, 0.2 + (slot % 4) * 0.18), y: 0.45 + (slot % 2) * 0.08 };
    const now = clock(), member = { id: crypto.randomUUID(), accountId: actor.accountId, sessionId: actor.sessionId, houseId: id, spawnSlot: slot, avatar, displayName, isHost: actor.accountId === house.ownerId, zone: spawn.zone, x: spawn.x, y: spawn.y, updatedAt: now, lastTouch: now, moveSeq: 0, moveTimes: [], chatTokens: 3, chatTokenAt: now, receipts: new Map(), joinedChatSeq: room.chatSeq, waiter: null };
    joins.set(actor.accountId, { at: recent && count ? recent.at : now, count: count + 1 });
    members.set(actor.accountId, member); room.members.set(member.id, member); room.revision++; wake(room);
    return { peerId: member.id, revision: room.revision, houseVersion: room.version, house: { id, title: room.title }, peers: [...room.members.values()].map(publicPeer), messages: [] };
  }
  function poll(actor, id, peer, after, { signal } = {}) {
    const { room, member } = requireMember(actor, id, peer);
    if (!Number.isSafeInteger(after) || after < 0 || after > room.revision) fail(422, 'LIVE_INVALID_CURSOR', '串门画面版本无效，请重新加入。');
    if (member.waiter) finishWait(member, new LiveError(409, 'LIVE_POLL_REPLACED', '这份等待已被当前页面的新请求替换。'));
    if (after < room.revision) return Promise.resolve(packet(room, member));
    if (signal?.aborted) return Promise.reject(new LiveError(499, 'LIVE_POLL_ABORTED', '页面已离开。'));
    return new Promise((resolve, reject) => {
      const abort = () => finishWait(member, new LiveError(499, 'LIVE_POLL_ABORTED', '页面已离开。'));
      const waitTimer = setTimeout(() => { try { requireMember(actor, id, peer, false); finishWait(member); } catch (error) { finishWait(member, error); } }, pollMs);
      // 等待有HTTP请求持有，因此保留timer的事件循环引用；close/abort必定释放它。
      member.waiter = { resolve, reject, timer: waitTimer, room, signal, abort }; signal?.addEventListener('abort', abort, { once: true });
    });
  }
  function move(actor, peer, body) {
    exact(body, ['houseId', 'seq', 'zone', 'x', 'y']); const { room, member } = requireMember(actor, body.houseId, peer);
    if (!Number.isSafeInteger(body.seq) || body.seq < 1 || typeof body.zone !== 'string' || !room.zones.has(body.zone) || ![body.x, body.y].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1)) fail(422, 'LIVE_INVALID_MOVE', '请选择小屋或前院里可走的位置。');
    if (body.seq <= member.moveSeq) return { ok: true };
    const now = clock(); member.moveTimes = member.moveTimes.filter(at => now - at < 1000);
    if (member.moveTimes.length >= 5) fail(429, 'LIVE_RATE_LIMIT', '走动有点快，稍等一下就好。', { retryAfter: 1 });
    member.moveTimes.push(now); member.moveSeq = body.seq; member.zone = body.zone; member.x = body.x; member.y = body.y; member.updatedAt = now; room.revision++; wake(room); return { ok: true };
  }
  function chat(actor, peer, body) {
    exact(body, ['houseId', 'clientMessageId', 'text']); const { room, member } = requireMember(actor, body.houseId, peer);
    if (typeof body.clientMessageId !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(body.clientMessageId)) fail(422, 'LIVE_INVALID_MESSAGE_ID', '这句话的发送标识无效，请重新输入。');
    const message = text(body.text, 80, 'LIVE_INVALID_MESSAGE'), prior = member.receipts.get(body.clientMessageId);
    if (prior !== undefined) { if (prior !== message) fail(409, 'LIVE_MESSAGE_REUSED', '同一句发送请求不能改成另一句话。'); return { ok: true }; }
    const now = clock(); member.chatTokens = Math.min(3, member.chatTokens + Math.max(0, now - member.chatTokenAt) / 1000); member.chatTokenAt = now;
    if (member.chatTokens < 1) fail(429, 'LIVE_RATE_LIMIT', '先听听小伙伴说什么，稍后再发一句吧。', { retryAfter: 1 });
    member.chatTokens -= 1; member.receipts.set(body.clientMessageId, message); while (member.receipts.size > 32) member.receipts.delete(member.receipts.keys().next().value);
    room.messages.push({ id: body.clientMessageId, seq: ++room.chatSeq, peerId: member.id, displayName: member.displayName, text: message, at: now }); if (room.messages.length > 32) room.messages.splice(0, room.messages.length - 32);
    room.revision++; wake(room); return { ok: true };
  }
  function leave(actor, peer, body) {
    ready(); actorValid(actor); exact(body, ['houseId']); houseId(body.houseId); peerId(peer);
    const member = members.get(actor.accountId); if (!member) return { ok: true };
    if (member.id !== peer || member.houseId !== body.houseId || member.sessionId !== actor.sessionId) fail(409, 'LIVE_MEMBER_GONE', '旧页面的串门已结束，当前页面不受影响。');
    remove(member); return { ok: true };
  }
  function kick(actor, peer, body) {
    exact(body, ['houseId', 'peerId']); const { room, member } = requireMember(actor, body.houseId, peer); peerId(body.peerId);
    if (!member.isHost || body.peerId === member.id) fail(403, 'LIVE_FORBIDDEN', '只有主人能请离其他小伙伴。');
    const target = room.members.get(body.peerId); if (!target) return { ok: true };
    if (room.banned.size >= 256 && !room.banned.has(target.accountId)) fail(429, 'LIVE_CAPACITY', '这次聚会已处理很多请求，请重新准备房间。', { retryAfter: 10 });
    // 被请离的人入场凭证立即作废，并进入冷却，不能马上再敲门。
    for (const [ticket, pass] of tickets) if (pass.accountId === target.accountId && pass.houseId === body.houseId) tickets.delete(ticket);
    cooldowns.set(target.accountId + ':' + body.houseId, clock() + cooldownMs);
    room.banned.add(target.accountId); remove(target, new LiveError(409, 'LIVE_MEMBER_GONE', '主人请你离开了这次聚会，回自己的小屋继续玩吧。')); return { ok: true };
  }

  // —— 敲门协议 ——
  function knockRevision(id) { return knockRevisions.get(id) || 1; }
  function bumpKnocks(id) { knockRevisions.set(id, knockRevision(id) + 1); finishInbox(id); }
  function pendingFor(id) { const now = clock(); return [...knocks.values()].filter(request => request.houseId === id && request.status === 'pending' && now - request.at < knockTtlMs).sort((a, b) => a.at - b.at); }
  function inboxPacket(id) { return { open: true, revision: knockRevision(id), requests: pendingFor(id).map(request => ({ id: request.id, displayName: request.displayName, avatar: copy(request.avatar), at: request.at })) }; }
  function finishInbox(id, error) {
    const wait = inboxWaiters.get(id); if (!wait) return;
    inboxWaiters.delete(id); clearTimeout(wait.timer); wait.signal?.removeEventListener('abort', wait.abort);
    if (error) wait.reject(error); else wait.resolve(inboxPacket(id));
  }
  function hostAvailable(id) { const host = hosts.get(id); return !!host && clock() - host.at < hostPresenceMs; }
  function ownHouseId(actor) { const id = houseOf(actor.accountId); if (typeof id !== 'string' || !ID.test(id)) fail(403, 'LIVE_NO_HOUSE', '先公开自己的小屋，朋友才能来敲门。'); return id; }
  function closeReception(id) {
    hosts.delete(id); let changed = false;
    for (const request of knocks.values()) if (request.houseId === id && request.status === 'pending') { request.status = 'host_away'; request.decidedAt = clock(); changed = true; }
    if (changed) bumpKnocks(id);
  }
  // 屋主主游戏页的长轮询：每次调用都表示“屋主现在在家且愿意接待”，open=false 表示关闭接待。
  function inbox(actor, after, { signal, open = true } = {}) {
    ready(); actorValid(actor); const id = ownHouseId(actor);
    if (!open) { closeReception(id); return Promise.resolve({ open: false, revision: knockRevision(id), requests: [] }); }
    if (!Number.isSafeInteger(after) || after < 0) fail(422, 'LIVE_INVALID_CURSOR', '敲门提醒版本无效，请刷新页面。');
    sweep(); hosts.set(id, { accountId: actor.accountId, at: clock() });
    if (inboxWaiters.has(id)) finishInbox(id, new LiveError(409, 'LIVE_POLL_REPLACED', '这份等待已被当前页面的新请求替换。'));
    if (after !== knockRevision(id)) return Promise.resolve(inboxPacket(id));
    if (signal?.aborted) return Promise.reject(new LiveError(499, 'LIVE_POLL_ABORTED', '页面已离开。'));
    return new Promise((resolve, reject) => {
      const abort = () => finishInbox(id, new LiveError(499, 'LIVE_POLL_ABORTED', '页面已离开。'));
      const timer = setTimeout(() => finishInbox(id), pollMs);
      inboxWaiters.set(id, { resolve, reject, timer, signal, abort }); signal?.addEventListener('abort', abort, { once: true });
    });
  }
  function knock(actor, body) {
    ready(); actorValid(actor); exact(body, ['houseId']); const id = houseId(body.houseId); sweep();
    const house = checkedHouse(id), now = clock();
    if (house.ownerId === actor.accountId) fail(409, 'LIVE_OWN_HOUSE', '这是你自己的小屋，直接回去就好。');
    const until = cooldowns.get(actor.accountId + ':' + id);
    if (until && until > now) fail(429, 'LIVE_KNOCK_COOLDOWN', '主人现在不方便，过一会儿再来敲门吧。', { retryAfter: Math.ceil((until - now) / 1000) });
    const mine = pendingFor(id).find(request => request.accountId === actor.accountId);
    if (mine) return { requestId: mine.id, status: 'pending' };
    const recent = (knockTimes.get(actor.accountId) || []).filter(at => now - at < 60000);
    if (recent.length >= knocksPerMinute || (!knockTimes.has(actor.accountId) && knockTimes.size >= 512)) fail(429, 'LIVE_RATE_LIMIT', '敲门有点频繁，稍等一会儿再试吧。', { retryAfter: 20 });
    recent.push(now); knockTimes.set(actor.accountId, recent);
    if (!hostAvailable(id)) return { requestId: null, status: 'host_away' };
    const room = rooms.get(id);
    if (room && room.members.size >= maxRoomMembers) fail(429, 'LIVE_ROOM_FULL', '这座小屋已有8位小伙伴，稍后再来吧。', { retryAfter: 10 });
    if (pendingFor(id).length >= maxPending) fail(429, 'LIVE_KNOCK_BUSY', '主人那边有好几位朋友在等，稍后再来吧。', { retryAfter: 20 });
    if (knocks.size >= 256) fail(429, 'LIVE_CAPACITY', '敲门的小伙伴有点多，稍后再来吧。', { retryAfter: 10 });
    const request = { id: crypto.randomUUID(), houseId: id, accountId: actor.accountId, sessionId: actor.sessionId, displayName: text(nameFor(actor.accountId), 24, 'LIVE_INVALID_NAME'), avatar: copy(getAvatar(actor.accountId)), at: now, status: 'pending', ticket: null, decidedAt: 0 };
    knocks.set(request.id, request); bumpKnocks(id); return { requestId: request.id, status: 'pending' };
  }
  // 访客轮询自己的敲门结果；婉拒、忽略和过期对访客只表现为“不方便/没回应”，不透露原因。
  function knockStatus(actor, requestId) {
    ready(); actorValid(actor);
    const request = typeof requestId === 'string' && ID.test(requestId) ? knocks.get(requestId) : null;
    if (!request || request.accountId !== actor.accountId) fail(404, 'LIVE_KNOCK_GONE', '这次敲门已经结束，可以重新敲门。');
    const now = clock();
    if (request.status === 'pending') {
      if (now - request.at >= knockTtlMs) { request.status = 'expired'; request.decidedAt = now; bumpKnocks(request.houseId); }
      else if (!hostAvailable(request.houseId)) { request.status = 'host_away'; request.decidedAt = now; bumpKnocks(request.houseId); }
    }
    const result = { status: request.status, houseId: request.houseId };
    if (request.status === 'approved') result.ticket = request.ticket;
    if (request.status === 'declined') result.retryAfter = Math.max(1, Math.ceil(((cooldowns.get(actor.accountId + ':' + request.houseId) || now) - now) / 1000));
    return result;
  }
  function answer(actor, body) {
    ready(); actorValid(actor); exact(body, ['requestId', 'accept']); const id = ownHouseId(actor);
    if (typeof body.requestId !== 'string' || !ID.test(body.requestId) || typeof body.accept !== 'boolean') fail(422, 'LIVE_INVALID_REQUEST', '请选择“请进”或“婉拒”。');
    sweep(); const request = knocks.get(body.requestId), now = clock();
    if (!request || request.houseId !== id || request.status !== 'pending' || now - request.at >= knockTtlMs) fail(404, 'LIVE_KNOCK_GONE', '这位朋友已经离开，或敲门已经过期。');
    if (body.accept) {
      const room = rooms.get(id);
      if (room && room.members.size >= maxRoomMembers) fail(429, 'LIVE_ROOM_FULL', '屋里已经有8位小伙伴了。', { retryAfter: 10 });
      if (tickets.size >= 512) fail(429, 'LIVE_CAPACITY', '请稍后再请新朋友进来。', { retryAfter: 10 });
      const ticket = crypto.randomUUID(); tickets.set(ticket, { houseId: id, accountId: request.accountId, expires: now + ticketTtlMs }); request.status = 'approved'; request.ticket = ticket;
    } else { request.status = 'declined'; cooldowns.set(request.accountId + ':' + id, now + cooldownMs); }
    request.decidedAt = now; bumpKnocks(id); return { ok: true };
  }
  function invalidateSession(id) { for (const member of [...members.values()]) if (member.sessionId === id) remove(member, new LiveError(401, 'LIVE_AUTH_REQUIRED', '账号已退出或过期，请重新登录。')); }
  // 邻居只看已主动加入的公开称呼；读取目录与推荐称呼均不续租成员。
  function directory() {
    ready(); sweep();
    return [...rooms.values()].filter(room => room.members.size > 0).map(room => ({ id: room.id, count: room.members.size, hostOnline: [...room.members.values()].some(member => member.isHost), displayNames: [...room.members.values()].map(member => member.displayName) }));
  }
  function displayNameFor(accountId) { ready(); sweep(); return members.get(accountId)?.displayName || null; }
  function clearKnocks(error) { for (const id of [...inboxWaiters.keys()]) finishInbox(id, error); knocks.clear(); tickets.clear(); cooldowns.clear(); hosts.clear(); knockTimes.clear(); knockRevisions.clear(); }
  function reset() { for (const id of [...rooms.keys()]) invalidateHouse(id, new LiveError(409, 'LIVE_MEMBER_GONE', '串门房间已重新准备，请主动重新加入。')); joins.clear(); clearKnocks(new LiveError(409, 'LIVE_MEMBER_GONE', '串门服务已重新准备，请刷新页面。')); }
  function close() { if (closed) return; closed = true; clearInterval(timer); for (const id of [...rooms.keys()]) invalidateHouse(id, new LiveError(503, 'LIVE_CLOSED', '串门服务正在重新准备，请稍后主动加入。')); joins.clear(); clearKnocks(new LiveError(503, 'LIVE_CLOSED', '串门服务正在重新准备，请稍后主动加入。')); }
  return { join, poll, move, chat, leave, kick, knock, knockStatus, answer, inbox, assertMember: requireMember, invalidateHouse, refreshHouse, invalidateSession, directory, displayNameFor, sweep, reset, close, stats: () => ({ rooms: rooms.size, members: members.size, waiting: [...members.values()].filter(member => member.waiter).length, joinLimits: joins.size, knocks: knocks.size, tickets: tickets.size, cooldowns: cooldowns.size, hosts: hosts.size, inboxWaiting: inboxWaiters.size }) };
}

module.exports = { createLiveHub, LiveError };
