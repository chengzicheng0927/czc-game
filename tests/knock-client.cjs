'use strict';
// 敲门客户端与屋主接待：内存HTTP替身+假时钟；验证凭据、取消、隐藏页、凭证入场与接待提醒，不碰私档。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../js/core/live.js'), 'utf8'), tests = [], plain = x => JSON.parse(JSON.stringify(x));
const house = '11111111-1111-4111-8111-111111111111', request1 = '33333333-3333-4333-8333-333333333333', build = 'r-' + 'a'.repeat(64), idle = () => new Promise(resolve => setImmediate(resolve));
function test(name, fn) { tests.push({ name, fn }); }
function sandbox() {
  let now = 100000, nextId = 1; const timers = new Map(), calls = [], windowListeners = {}, documentListeners = {};
  const server = { auth: true, knock: { requestId: request1, status: 'pending' }, statuses: [], inboxRevision: 1, inboxRequests: [], inboxHeld: null, inboxError: null, joinError: null };
  const document = { hidden: false, currentScript: { src: 'https://game.test/play/releases/' + build + '/js/core/live.js' }, addEventListener(name, fn) { (documentListeners[name] ??= []).push(fn); }, removeEventListener() {} };
  const setTimer = (fn, ms) => { const id = nextId++; timers.set(id, { at: now + (ms || 0), fn }); return id; }, clearTimer = id => timers.delete(id);
  const response = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => plain(data) });
  const window = { Game: {}, location: new URL('https://game.test/play/visit/' + house), AbortController, crypto: { randomUUID: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, addEventListener() {}, removeEventListener() {} };
  Object.defineProperty(window, 'localStorage', { get() { throw new Error('实时客户端不能读写私档存储'); } });
  window.fetch = async (url, init) => {
    const route = url.slice(url.indexOf('/api/v1/live') + '/api/v1/live'.length), call = { route, request: init, body: init.body && JSON.parse(init.body) }; calls.push(call);
    if (route === '/me') return response(200, server.auth ? { authenticated: true, liveKey: 'private_live_key', csrfToken: 'private_csrf', joinDisplayName: '小云' } : { authenticated: false });
    if (route === '/knock') return response(200, server.knock);
    if (route.startsWith('/knock/status')) { const next = server.statuses.shift() || { status: 'pending' }; return response(200, next); }
    if (route === '/knock/answer') return response(200, { ok: true });
    if (route === '/join') return server.joinError ? response(403, server.joinError) : response(200, { peerId: 'peer_one', revision: 1, house: { id: house, title: '公开小屋' }, peers: [{ id: 'peer_one', displayName: call.body.displayName, avatar: {}, isHost: false, zone: 'yard', x: .5, y: .5, updatedAt: now }], messages: [] });
    if (route.startsWith('/inbox')) {
      const after = Number(new URL('https://x/' + route).searchParams.get('after')), open = new URL('https://x/' + route).searchParams.get('open');
      if (server.inboxError) return response(server.inboxError.status, server.inboxError.body);
      if (open === '0') return response(200, { open: false, revision: server.inboxRevision, requests: [] });
      if (after < server.inboxRevision) return response(200, { open: true, revision: server.inboxRevision, requests: server.inboxRequests });
      return new Promise((resolve, reject) => { server.inboxHeld = () => resolve(response(200, { open: true, revision: server.inboxRevision, requests: server.inboxRequests })); init.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true }); });
    }
    return response(200, { ok: true });
  };
  const env = vm.createContext({ window, document, console, URL, Date: class extends Date { static now() { return now; } }, Math, Map, Set, Promise, setTimeout: setTimer, clearTimeout: clearTimer }); vm.runInContext(source, env, { filename: 'js/core/live.js' });
  async function tick(ms) { now += ms; for (let i = 0; i < 40; i++) { const due = [...timers].filter(([, t]) => t.at <= now); if (!due.length) break; for (const [id, t] of due) { if (!timers.has(id)) continue; timers.delete(id); t.fn(); } await idle(); } }
  return { G: window.Game, server, calls, tick, document, documentListeners, async hide(value) { document.hidden = value; for (const fn of (documentListeners.visibilitychange || []).slice()) fn(); await idle(); } };
}
const settle = async (b, ms = 2000, rounds = 1) => { for (let i = 0; i < rounds; i++) { await idle(); await b.tick(ms); await idle(); } };

test('没有凭证加入=需要敲门：不是故障，状态保持空闲且没有错误提示', async () => {
  const b = sandbox(); b.server.joinError = { code: 'LIVE_KNOCK_REQUIRED', message: '先敲敲门，等主人同意后才能进来哦。' };
  const answer = await b.G.live.join(house, '小云'); assert.equal(answer.ok, false); assert.equal(answer.code, 'LIVE_KNOCK_REQUIRED');
  assert.equal(b.G.live.status().phase, 'idle'); assert.equal(b.G.live.status().error, ''); assert.equal(b.G.live.status().peerId, null); b.G.live.destroy();
});
test('敲门→等待→同意：只发houseId，带liveKey/CSRF但不带peer；拿到凭证后加入会带上凭证', async () => {
  const b = sandbox(), progress = []; const task = b.G.live.knock(house, text => progress.push(text)); await settle(b, 0);
  const first = b.calls.find(call => call.route === '/knock'); assert.deepEqual(first.body, { houseId: house });
  assert.equal(first.request.headers['X-MC-Live'], 'private_live_key'); assert.equal(first.request.headers['X-CSRF-Token'], 'private_csrf'); assert.equal(first.request.headers['X-MC-Peer'], undefined); assert.equal(first.request.credentials, 'same-origin');
  assert.deepEqual(progress, ['已经敲门啦，请等主人回应。']);
  b.server.statuses.push({ status: 'pending' }, { status: 'approved', houseId: house, ticket: 'ticket-from-host' }); await settle(b, 2000, 3);
  const result = await task; assert.deepEqual(plain(result), { ok: true, status: 'approved', ticket: 'ticket-from-host' });
  assert.ok(b.calls.filter(call => call.route.startsWith('/knock/status?requestId=' + request1)).length >= 2);
  assert.equal((await b.G.live.join(house, '小云', 'ticket-from-host')).ok, true); assert.equal(b.calls.filter(call => call.route === '/join').at(-1).body.ticket, 'ticket-from-host');
  assert.ok(!JSON.stringify(b.G.live.status()).includes('private_') && !JSON.stringify(b.G.live.status()).includes('ticket-from-host')); b.G.live.destroy();
});
test('屋主不在家、婉拒、过期：各给温和的提示，不暴露原因', async () => {
  let b = sandbox(); b.server.knock = { requestId: null, status: 'host_away' }; let r = await b.G.live.knock(house); assert.equal(r.ok, false); assert.equal(r.status, 'host_away'); assert.match(r.message, /不在家/); b.G.live.destroy();
  for (const [status, text] of [['declined', /不方便/], ['expired', /稍后再试/]]) {
    b = sandbox(); const task = b.G.live.knock(house); await settle(b, 0); b.server.statuses.push({ status }); await settle(b, 2000, 2); r = await task; assert.equal(r.ok, false); assert.equal(r.status, status); assert.match(r.message, text); assert.equal(r.ticket, undefined); b.G.live.destroy();
  }
  b = sandbox(); b.server.auth = false; r = await b.G.live.knock(house); assert.equal(r.status, 'login'); assert.equal(b.calls.some(call => call.route === '/knock'), false); b.G.live.destroy();
  assert.equal((await sandbox().G.live.knock('../x')).ok, false);
});
test('可随时取消敲门；页面隐藏期间不轮询结果', async () => {
  let b = sandbox(); const task = b.G.live.knock(house); await settle(b, 0); await b.hide(true); const before = b.calls.length; await settle(b, 2000, 4); assert.equal(b.calls.length, before, '隐藏页不发敲门状态请求');
  await b.hide(false); b.G.live.cancelKnock(); const result = await task; assert.deepEqual(plain(result), { ok: false, status: 'cancelled', message: '已取消敲门。' }); const after = b.calls.length; await settle(b, 2000, 3); assert.equal(b.calls.length, after); b.G.live.destroy();
});
test('屋主接待：开启后长轮询提醒；同意/婉拒带CSRF；关闭时通知服务器并清空', async () => {
  const b = sandbox(), seen = []; b.G.live.reception.subscribe(value => seen.push(plain(value)));
  const asked = '44444444-4444-4444-8444-444444444444'; b.server.inboxRevision = 2; b.server.inboxRequests = [{ id: asked, displayName: '小云', avatar: { hair: 'bob' }, at: 1 }];
  assert.deepEqual(plain(await b.G.live.reception.start()), { ok: true }); await settle(b, 0, 2);
  const polls = b.calls.filter(call => call.route.startsWith('/inbox')); assert.equal(polls[0].route, '/inbox?after=0'); assert.equal(polls[0].request.headers['X-MC-Live'], 'private_live_key'); assert.equal(polls[0].request.headers['X-MC-Peer'], undefined);
  assert.equal(polls[1].route, '/inbox?after=2', '用上次的版本号继续等待'); assert.deepEqual(b.G.live.reception.status().requests.map(x => x.displayName), ['小云']);
  assert.equal(seen.at(-1).open, true); assert.deepEqual(seen.at(-1).requests[0].id, asked);
  assert.deepEqual(plain(await b.G.live.reception.answer(asked, true)), { ok: true }); const answer = b.calls.find(call => call.route === '/knock/answer'); assert.deepEqual(answer.body, { requestId: asked, accept: true }); assert.equal(answer.request.headers['X-CSRF-Token'], 'private_csrf'); assert.equal(b.G.live.reception.status().requests.length, 0);
  b.G.live.reception.stop(); await settle(b, 0, 2); assert.ok(b.calls.some(call => call.route === '/inbox?after=0&open=0')); assert.equal(b.G.live.reception.status().open, false); assert.equal(seen.at(-1).open, false);
  assert.equal((await b.G.live.reception.answer(asked, false)).ok, false); b.G.live.destroy();
});
test('接待失败：没有公开小屋/登录失效时停止并说明，不无限重试；未登录不能开启', async () => {
  let b = sandbox(), seen = []; b.G.live.reception.subscribe(value => seen.push(plain(value))); b.server.inboxError = { status: 403, body: { code: 'LIVE_NO_HOUSE', message: 'x' } };
  await b.G.live.reception.start(); await settle(b, 0, 3); assert.equal(seen.at(-1).open, false); assert.match(seen.at(-1).error, /先公开自己的小屋/); const polls = b.calls.filter(call => call.route.startsWith('/inbox')).length; await settle(b, 2000, 3); assert.equal(b.calls.filter(call => call.route.startsWith('/inbox')).length, polls); b.G.live.destroy();
  b = sandbox(); b.server.auth = false; const result = await b.G.live.reception.start(); assert.equal(result.ok, false); assert.equal(b.calls.some(call => call.route.startsWith('/inbox')), false); b.G.live.destroy();
});
(async () => { for (const check of tests) { await check.fn(); console.log('✓ ' + check.name); } console.log(tests.length + ' 组敲门客户端与接待检查通过（无监听，不碰私档）'); })().catch(error => { console.error(error); process.exit(1); });
