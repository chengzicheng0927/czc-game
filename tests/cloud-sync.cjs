'use strict';
// 隔离的浏览器时钟、Cookie会话与内存存储，加载真实store/save/sync；不监听端口或接触真实存档。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), saveKey = 'marshmallow_cottage_save_v1', metaKey = 'marshmallow_cottage_cloud_v1', leaseKey = 'marshmallow_cottage_owner_v1';
const core = new Set(['js/core/namespace.js', 'js/core/utils.js', 'js/core/bus.js', 'js/building/schema.js', 'js/core/store.js', 'js/core/save.js', 'js/core/content-spaces.js']);
const files = JSON.parse(fs.readFileSync(path.join(root, 'scripts/legacy-assets.json'), 'utf8')).filter(file => core.has(file) || file.startsWith('js/data/') || file.startsWith('js/systems/'));
for (const file of core) assert.ok(files.includes(file), '实际清单缺少同步依赖：' + file);
assert.ok(files.indexOf('js/building/schema.js') < files.indexOf('js/core/store.js'), '建筑schema须在store之前加载');
const plain = value => JSON.parse(JSON.stringify(value));
function canonical(value) { if (value === null || typeof value !== 'object') return JSON.stringify(value); return Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' : '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}'; }
const hash = value => crypto.createHash('sha256').update(canonical(value)).digest('hex');
const idle = async () => { for (let i = 0; i < 35; i++) await Promise.resolve(); };
function fakeServer() {
  const accounts = new Map(), saves = new Map(), receipts = new Map(), requests = [];
  let session = null, serverEpoch = 'epoch_one', offline = false, incompatible = false, sequence = 0, hold = null;
  const reply = (status, data, etag) => ({ ok: status < 400, status, headers: { get: name => name.toLowerCase() === 'etag' ? etag || null : null }, json: async () => plain(data) });
  const sessionData = () => session ? { authenticated: true, account: accounts.get(session).account, csrfToken: 'csrf_' + session, protocol: 1, serverEpoch } : { authenticated: false, protocol: 1, serverEpoch };
  function record(save, id) { const previous = saves.get(id), value = { save: plain(save), revision: previous ? previous.revision + 1 : 1, serverEpoch, contentHash: hash(save), updatedAt: ++sequence }; value.etag = '"' + serverEpoch + ':' + value.revision + ':' + value.contentHash + '"'; saves.set(id, value); return value; }
  async function fetch(url, options) {
    const pathname = new URL(url, 'http://game.test').pathname, route = pathname.replace(/^\/play\/api\/v1/, ''), method = options.method || 'GET', headers = options.headers || {}, body = options.body ? JSON.parse(options.body) : null;
    requests.push({ route, method, headers: plain(headers), body });
    if (offline) throw new TypeError('offline');
    assert.equal(headers['X-MC-Protocol'], '1'); assert.equal(headers['X-MC-Build'], 'r-test'); assert.equal(options.credentials, 'same-origin'); assert.equal(options.cache, 'no-store');
    let response;
    if (incompatible) response = reply(426, { code: 'INCOMPATIBLE', message: '请更新小屋。' });
    else if (route === '/session') response = reply(200, sessionData());
    else if (route === '/register' || route === '/login') {
      let entry = [...accounts.values()].find(value => value.account.username === body.username);
      if (route === '/register' && !entry) { const id = 'child_' + (accounts.size + 1); entry = { account: { id, username: body.username, displayName: body.displayName || body.username }, password: body.password }; accounts.set(id, entry); }
      if (!entry || entry.password !== body.password) response = reply(401, { code: 'BAD_LOGIN', message: '账号或密码不匹配。' });
      else { session = entry.account.id; response = reply(200, sessionData()); }
    } else if (!session || headers['X-MC-Account'] !== session) response = reply(401, { code: 'ACCOUNT_CHANGED', message: '请重新登录。' });
    else if (method !== 'GET' && headers['X-CSRF-Token'] !== 'csrf_' + session) response = reply(403, { code: 'CSRF', message: '请重新打开账号。' });
    else if (route === '/logout') { session = null; response = reply(200, { ok: true }); }
    else if (route === '/save' && method === 'GET') { const value = saves.get(session); response = value ? reply(200, value, value.etag) : reply(404, { code: 'NO_SAVE', message: '还没有小屋。', serverEpoch }); }
    else if (route === '/save' && method === 'PUT') {
      const previous = saves.get(session), key = session + ':' + body.mutationId, prior = receipts.get(key), contentHash = hash(body.save);
      if (prior && prior.contentHash === contentHash) response = reply(200, prior, prior.etag);
      else if (body.expectedEpoch !== serverEpoch || previous && headers['If-Match'] !== previous.etag || !previous && headers['If-None-Match'] !== '*') response = reply(412, { code: 'CONFLICT', message: '另一个设备已经更新小屋。' });
      else { const value = record(body.save, session); receipts.set(key, value); response = reply(200, value, value.etag); }
    } else if (route.startsWith('/save/versions/')) { const revision = Number(route.split('/').at(-1)), value = [...receipts.values()].find(item => item.revision === revision); response = value ? reply(200, value, value.etag) : reply(404, { code: 'NO_VERSION', message: '没有找到这份记录。' }); }
    else response = reply(404, { code: 'NOT_FOUND', message: '没有这个入口。' });
    if (hold && hold.method === method && hold.route === route) { const current = hold; hold = null; await new Promise(resolve => { current.release = resolve; }); if (current.drop) throw new TypeError('lost response'); }
    return response;
  }
  return { fetch, requests, saves, accounts, record, who: () => session, offline(value) { offline = value; }, incompatible(value) { incompatible = value; }, expire() { session = null; }, rotate() { serverEpoch = 'epoch_two'; session = null; }, hold(method, route, drop = false) { const gate = { method, route, drop, release: null }; hold = gate; return gate; } };
}
function browser(server, options = {}) {
  const memory = options.memory || new Map(), timeouts = new Map(), intervals = new Map(), listeners = {}, documentListeners = {}, downloads = [];
  let now = new Date(2026, 9, 29, 12).getTime(), serial = 0, denyMeta = false, denySave = false, failFinal = false;
  const RealDate = Date;
  class TestDate extends RealDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const buildId = options.buildId || 'r-test', href = options.file ? 'file:///game/index.html' : 'http://game.test/play/', source = options.file ? 'file:///game/js/core/cloud-sync.js' : options.bare ? 'http://game.test/play/js/core/cloud-sync.js' : 'http://game.test/play/releases/' + buildId + '/js/core/cloud-sync.js';
  const document = { hidden: !!options.hidden, currentScript: { src: source }, addEventListener(name, fn) { (documentListeners[name] ||= []).push(fn); } };
  const context = vm.createContext({ console, URL, Blob, TextEncoder, Date: TestDate, document, location: new URL(href), navigator: { onLine: true }, setTimeout(fn, delay) { const id = ++serial; timeouts.set(id, { fn, at: now + delay }); return id; }, clearTimeout(id) { timeouts.delete(id); }, setInterval(fn, delay) { const id = ++serial; intervals.set(id, { fn, delay }); return id; }, clearInterval(id) { intervals.delete(id); } });
  context.window = context; context.addEventListener = (name, fn) => { (listeners[name] ||= []).push(fn); }; context.fetch = server.fetch;
  context.localStorage = { getItem: key => memory.has(key) ? memory.get(key) : null, removeItem: key => memory.delete(key), setItem(key, value) { if (denyMeta && key === metaKey || denySave && key === saveKey || failFinal && key === metaKey && JSON.parse(value).journal === null && JSON.parse(value).active.startsWith('account_')) throw new Error('QuotaExceededError'); memory.set(key, String(value)); } };
  files.forEach(file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file }));
  vm.runInContext(fs.readFileSync(path.join(root, 'js/core/cloud-sync.js'), 'utf8'), context, { filename: 'js/core/cloud-sync.js' });
  const G = context.Game; G.utils.download = (name, value, type) => { downloads.push({ name, value, type }); return true; };
  G.cloud.prepare(); G.store.init(G.save.load()); if (G.store.canWrite()) G.sys.init(); G.save.init();
  document.currentScript = { src: 'http://game.test/play/releases/' + buildId + '/js/main.js' };
  const event = async (name, payload) => { for (const fn of listeners[name] || []) await fn(payload || {}); await idle(); };
  return { G, memory, downloads, context, timeouts, event, init: () => G.cloud.init(), denyMeta(value) { denyMeta = value; }, denySave(value) { denySave = value; }, failFinal(value) { failFinal = value; },
    async advance(ms) { now += ms; let count = 0; while (count++ < 40) { const due = [...timeouts].filter(([, item]) => item.at <= now); if (!due.length) break; for (const [id, item] of due) { timeouts.delete(id); item.fn(); } await idle(); } },
    expireLease() { const lease = JSON.parse(memory.get(leaseKey)); lease.until = 0; memory.set(leaseKey, JSON.stringify(lease)); },
    update(name, coin) { G.store.update(state => { state.house.name = name; if (coin !== undefined) state.wallet.coin = coin; }, { persist: true }); },
    state: () => plain(G.state), status: () => G.cloud.status() };
}
const credentials = { username: 'child_one', password: 'password_test_only' }, tests = [];
function test(name, fn) { tests.push({ name, fn }); }
async function bound(server, options) { const b = browser(server, options); await b.init(); assert.ok((await b.G.cloud.register(credentials)).ok); assert.equal(b.status().phase, 'choose'); assert.ok((await b.G.cloud.bindLocal()).ok); return b; }

test('file与裸源码页面完全不请求账号API，正式release正确识别前缀和构建', async () => {
  const server = fakeServer(); for (const options of [{ file: true }, { bare: true }]) { const b = browser(server, options); await b.init(); assert.equal(b.status().available, false); assert.equal((await b.G.cloud.login(credentials)).ok, false); b.update('离线仍能布置', 400); assert.equal(b.state().wallet.coin, 400); }
  assert.equal(server.requests.length, 0); const b = browser(server); await b.init(); assert.equal(b.status().available, true); assert.equal(server.requests[0].route, '/session');
});

test('首次登录不上传或覆盖已有本机，明确关联后创建并自动同步真实成功保存', async () => {
  const server = fakeServer(), b = browser(server); await b.init(); b.update('我的旧单机小屋', 777); const before = b.memory.get(saveKey);
  assert.equal(b.state().building.schema, 2); assert.equal(b.state().building.walls.length, 0);
  assert.ok((await b.G.cloud.register(credentials)).ok); assert.equal(b.status().phase, 'choose'); assert.equal(b.memory.get(saveKey), before); assert.equal(server.saves.size, 0);
  assert.ok((await b.G.cloud.bindLocal()).ok); assert.equal(b.status().binding, true); assert.equal(server.saves.get('child_1').save.wallet.coin, 777);
  assert.deepEqual(server.saves.get('child_1').save.building, b.state().building);
  b.update('今天的新名字', 778); assert.equal(server.saves.get('child_1').save.wallet.coin, 777); await b.advance(1500); assert.equal(server.saves.get('child_1').save.wallet.coin, 778);
  const remote = server.saves.get('child_1'); assert.equal(remote.contentHash, hash(b.state()), '浏览器SHA256必须与Node摘要一致');
});

test('本机拒写不排队上传，只有实际保存成功才同步', async () => {
  const server = fakeServer(), b = await bound(server), before = server.saves.get('child_1').revision;
  b.denySave(true); assert.throws(() => b.update('不应出现', 999)); await b.advance(3000); assert.equal(server.saves.get('child_1').revision, before);
  b.denySave(false); b.update('真的保存', 800); await b.advance(1500); assert.equal(server.saves.get('child_1').save.wallet.coin, 800);
});

test('完整重开自动续同账号，离线待同步保留到连接恢复', async () => {
  const server = fakeServer(), first = await bound(server); server.offline(true); first.update('离线布置', 820); await first.advance(1500); assert.equal(first.status().phase, 'offline');
  first.expireLease(); const next = browser(server, { memory: first.memory }); await next.init(); assert.equal(next.state().house.name, '离线布置'); assert.equal(next.status().account.id, 'child_1');
  server.offline(false); await next.event('online'); assert.equal(server.saves.get('child_1').save.wallet.coin, 820); assert.equal(next.status().phase, 'ready');
});

test('离线冷启动在网卡始终在线时退避重查会话，服务器恢复后无需重登即可继续同步', async () => {
  const server = fakeServer(), first = await bound(server); first.update('冷启动前的未同步进度', 822); await first.event('pagehide'); server.offline(true);
  const b = browser(server, { memory: first.memory }); assert.equal(b.context.navigator.onLine, true); assert.equal((await b.init()).ok, false); assert.equal(b.status().phase, 'offline');
  const count = () => server.requests.filter(item => item.route === '/session').length, initial = count();
  await b.advance(1999); assert.equal(count(), initial); await b.advance(1); assert.equal(count(), initial + 1, '第一次重试在两秒后');
  await b.advance(3999); assert.equal(count(), initial + 1, '失败后等待四秒，不紧密循环');
  server.offline(false); await b.advance(1); assert.equal(count(), initial + 2); assert.equal(b.status().phase, 'ready'); assert.equal(b.status().account.id, 'child_1'); assert.equal(b.status().dirty, false);
  assert.equal(server.saves.get('child_1').save.house.name, '冷启动前的未同步进度'); assert.equal(server.saves.get('child_1').save.wallet.coin, 822);
});

test('离线冷启动的“重试同步”立即重新查询会话，不必等退避或重新输入密码', async () => {
  const server = fakeServer(), first = await bound(server); first.update('手动重连前的新进度', 824); await first.event('pagehide'); server.offline(true);
  const b = browser(server, { memory: first.memory }); await b.init(); const count = server.requests.filter(item => item.route === '/session').length; server.offline(false);
  assert.ok((await b.G.cloud.syncNow()).ok); assert.equal(server.requests.filter(item => item.route === '/session').length, count + 1); assert.equal(b.status().phase, 'ready'); assert.equal(server.saves.get('child_1').save.wallet.coin, 824);
  await b.advance(2000); assert.equal(server.requests.filter(item => item.route === '/session').length, count + 1, '手动重连成功应取消原退避查询');
});

test('自动重连前已有尚未flush的新操作时先保存，再比较分叉，不能用旧磁盘基准覆盖', async () => {
  const server = fakeServer(), first = await bound(server); await first.event('pagehide'); server.offline(true); const b = browser(server, { memory: first.memory }); await b.init(); await b.advance(1999);
  const cloud = b.state(); cloud.house.name = '另一设备的云端新家'; cloud.wallet.coin = 825; server.record(cloud, 'child_1');
  b.G.store.update(state => { state.house.name = '重连前尚未自动保存的家'; state.wallet.coin = 826; }); assert.notEqual(JSON.parse(b.memory.get(saveKey)).wallet.coin, 826);
  server.offline(false); await b.advance(1); assert.equal(b.status().phase, 'conflict'); assert.equal(b.state().wallet.coin, 826); assert.equal(JSON.parse(b.memory.get(saveKey)).wallet.coin, 826); assert.equal(server.saves.get('child_1').save.wallet.coin, 825);
});

test('冷启动恢复尚在退避时，明确退出或切换账号会取消自动会话重查', async () => {
  for (const choice of ['logout', 'switch']) {
    const server = fakeServer(), first = await bound(server); await first.event('pagehide'); server.offline(true); const b = browser(server, { memory: first.memory }); await b.init(); server.offline(false);
    if (choice === 'logout') { assert.ok((await b.G.cloud.logout()).ok); assert.equal(server.who(), null, '退出应撤销尚未确认的Cookie会话'); assert.equal(b.status().account, null); }
    else { assert.ok((await b.G.cloud.register({ username: 'child_two', password: 'second_password' })).ok); assert.equal(b.status().account.id, 'child_2'); assert.equal(b.status().phase, 'choose'); }
    const count = server.requests.filter(item => item.route === '/session').length; await b.advance(120000); await b.event('online');
    assert.equal(server.requests.filter(item => item.route === '/session').length, count); assert.equal(b.status().account && b.status().account.id, choice === 'logout' ? null : 'child_2');
  }
});

test('在途冷启动会话响应迟到时，退出或新账号的结果不会被旧会话改回', async () => {
  for (const choice of ['logout', 'switch']) {
    const server = fakeServer(), first = await bound(server); await first.event('pagehide'); const gate = server.hold('GET', '/session'), b = browser(server, { memory: first.memory }), pending = b.init();
    await idle(); assert.equal(typeof gate.release, 'function');
    if (choice === 'logout') assert.ok((await b.G.cloud.logout()).ok);
    else assert.ok((await b.G.cloud.register({ username: 'child_two', password: 'second_password' })).ok);
    const before = b.state(), phase = b.status().phase, count = server.requests.filter(item => item.route === '/session').length;
    gate.release(); assert.equal((await pending).ok, false); await b.advance(120000);
    assert.deepEqual(b.state(), before); assert.equal(b.status().phase, phase); assert.equal(b.status().account && b.status().account.id, choice === 'logout' ? null : 'child_2'); assert.equal(server.requests.filter(item => item.route === '/session').length, count);
  }
});

test('冷启动会话确认已过期后停止重查，离线再上线也不循环登录', async () => {
  const server = fakeServer(), first = await bound(server); first.update('到期仍保留的本机进度', 823); await first.event('pagehide'); server.offline(true);
  const b = browser(server, { memory: first.memory }); await b.init(); server.expire(); server.offline(false); await b.advance(2000);
  assert.equal(b.status().phase, 'expired'); assert.equal(b.status().dirty, true); const count = server.requests.filter(item => item.route === '/session').length;
  await b.event('offline'); await b.event('online'); await b.advance(120000);
  assert.equal(b.status().phase, 'expired'); assert.equal(server.requests.filter(item => item.route === '/session').length, count); assert.equal(b.state().wallet.coin, 823);
});

test('已有账号的坏本机档不把默认空屋上传，必须明确恢复且保留损坏原文', async () => {
  const server = fakeServer(), first = await bound(server); first.update('云端应保留的小屋', 830); await first.G.cloud.syncNow(); const revision = server.saves.get('child_1').revision;
  first.memory.set(saveKey, '{broken-local'); first.expireLease(); const b = browser(server, { memory: first.memory }); await b.init(); assert.equal(b.G.save.loadFailed, true); assert.equal(b.status().phase, 'choose');
  assert.equal(server.saves.get('child_1').revision, revision); assert.equal((await b.G.cloud.syncNow()).ok, false); assert.equal((await b.G.cloud.bindLocal()).ok, false);
  assert.ok((await b.G.cloud.useCloud()).ok); assert.equal(b.state().house.name, '云端应保留的小屋'); assert.equal(b.G.save.loadFailed, false); assert.ok([...b.memory].some(([name, value]) => name.startsWith(saveKey + '_corrupt_') && value === '{broken-local'));
});

test('云端前进且本机只有计时更新时自动续接，两个实质分支不会静默覆盖', async () => {
  const server = fakeServer(), first = await bound(server), second = browser(server); await second.init(); assert.equal(second.status().phase, 'choose'); assert.ok((await second.G.cloud.useCloud()).ok);
  first.update('另一台设备的布置', 840); assert.ok((await first.G.cloud.syncNow()).ok);
  second.G.store.update(state => { state.profile.playTimeSec += 30; }, { persist: true }); assert.ok((await second.G.cloud.syncNow()).ok); assert.equal(second.state().house.name, '另一台设备的布置');
  server.offline(true); first.update('设备甲的离线分支', 850); second.update('设备乙的离线分支', 860); server.offline(false);
  assert.ok((await first.G.cloud.syncNow()).ok); const revision = server.saves.get('child_1').revision;
  assert.equal((await second.G.cloud.syncNow()).ok, false); assert.equal(second.status().phase, 'conflict'); assert.equal(second.state().wallet.coin, 860); assert.equal(server.saves.get('child_1').revision, revision);
  assert.equal(second.status().conflict.local.coin, 860); assert.equal(second.status().conflict.cloud.coin, 850);
  assert.ok((await second.G.cloud.resolveConflict('cloud')).ok); assert.equal(second.state().wallet.coin, 850); assert.ok(second.G.cloud.downloadBackup('recovery').ok); assert.equal(JSON.parse(second.downloads.at(-1).value).wallet.coin, 860);
});

test('在途回执只确认当时快照，后来的操作仍待同步；单次仅一个上传', async () => {
  const server = fakeServer(), b = await bound(server); b.update('第一代', 870); const gate = server.hold('PUT', '/save'); const task = b.G.cloud.syncNow(); await idle(); assert.equal(typeof gate.release, 'function');
  b.update('第二代', 871); const same = b.G.cloud.syncNow(); assert.equal(same, task); gate.release(); await task; assert.equal(b.status().dirty, true); assert.equal(b.state().wallet.coin, 871); assert.equal(server.saves.get('child_1').save.wallet.coin, 870);
  await b.advance(1500); assert.equal(server.saves.get('child_1').save.wallet.coin, 871); assert.equal(b.status().dirty, false);
});

test('云端GET等待期间尚未flush的新操作也阻止迟到恢复，显式恢复同样检查内存来源', async () => {
  const server = fakeServer(), b = await bound(server), changed = b.state(); changed.house.name = '别的设备已更新'; changed.wallet.coin = 875; server.record(changed, 'child_1');
  for (const operation of ['syncNow', 'useCloud']) {
    const gate = server.hold('GET', '/save'), task = b.G.cloud[operation](); await idle(); assert.equal(typeof gate.release, 'function');
    b.G.store.update(state => { state.house.name = '读取期间尚未保存的操作'; state.wallet.coin += 1; });
    const inMemory = b.state(), beforeDisk = b.memory.get(saveKey); gate.release(); assert.equal((await task).ok, false);
    assert.equal(b.state().house.name, inMemory.house.name); assert.equal(b.state().wallet.coin, inMemory.wallet.coin); assert.equal(b.memory.get(saveKey), beforeDisk);
  }
});

test('上传成功但丢失回执的重试不重复生成修订，401保留队列后可重新登录', async () => {
  const server = fakeServer(), b = await bound(server); b.update('断线前已保存', 880); const gate = server.hold('PUT', '/save', true), task = b.G.cloud.syncNow(); await idle(); gate.release(); await task;
  const revision = server.saves.get('child_1').revision; assert.equal(b.status().phase, 'offline'); assert.ok((await b.G.cloud.syncNow()).ok); assert.equal(server.saves.get('child_1').revision, revision);
  b.update('登录到期后的新进度', 881); server.expire(); assert.equal((await b.G.cloud.syncNow()).ok, false); assert.equal(b.status().phase, 'expired'); assert.equal(b.status().dirty, true);
  assert.ok((await b.G.cloud.login(credentials)).ok); assert.equal(server.saves.get('child_1').save.wallet.coin, 881);
});

test('副本配额拒写在登录或切档之前停止，账号离线副本与guest可分别下载', async () => {
  const server = fakeServer(), b = await bound(server); b.update('账号甲的家', 890); await b.G.cloud.syncNow(); const prior = b.memory.get(saveKey);
  b.denyMeta(true); const before = server.requests.length; assert.equal((await b.G.cloud.register({ username: 'child_two', password: 'second_password' })).ok, false); assert.equal(server.requests.length, before); assert.equal(b.memory.get(saveKey), prior); assert.equal(b.status().account.id, 'child_1');
  b.denyMeta(false); assert.ok((await b.G.cloud.logout()).ok); assert.equal(b.status().binding, false); assert.equal(b.state().wallet.coin, 300);
  const backup = b.status().backups.find(value => value.account && value.account.id === 'child_1'); assert.ok(backup); assert.ok(b.G.cloud.downloadBackup(backup.id).ok); assert.equal(JSON.parse(b.downloads.at(-1).value).wallet.coin, 890);
  assert.equal(b.G.cloud.forgetBackup('guest').ok, false); assert.ok(b.G.cloud.forgetBackup(backup.id).ok);
});

test('登录失败留下的活动缓存始终显示并下载最新进度，过期账号不丢失重新登录提示', async () => {
  const server = fakeServer(), b = await bound(server); assert.equal((await b.G.cloud.login({ username: credentials.username, password: 'wrong_password' })).ok, false);
  b.update('失败登录后仍在玩的家', 894); assert.equal(b.status().phase, 'expired');
  const active = b.status().backups.find(value => value.active); assert.ok(active); assert.equal(active.coin, 894); assert.equal(active.name, '失败登录后仍在玩的家');
  assert.ok(b.G.cloud.downloadBackup(active.id).ok); assert.equal(JSON.parse(b.downloads.at(-1).value).wallet.coin, 894);
});

test('新孩子首次新建独立空屋，旧账号和guest均保留；已有云档不能绕过重置确认', async () => {
  const server = fakeServer(), b = await bound(server); b.update('孩子甲装好的小屋', 895); await b.G.cloud.syncNow();
  assert.ok((await b.G.cloud.register({ username: 'child_two', password: 'second_password' })).ok); assert.equal(b.state().wallet.coin, 895);
  assert.ok((await b.G.cloud.startNew()).ok); assert.equal(b.state().wallet.coin, 300); assert.equal(Object.keys(b.state().house.rooms).length, 0); assert.equal(server.saves.get('child_2').save.wallet.coin, 300);
  const firstBackup = b.status().backups.find(value => value.account && value.account.id === 'child_1'); assert.ok(firstBackup); b.G.cloud.downloadBackup(firstBackup.id); assert.equal(JSON.parse(b.downloads.at(-1).value).wallet.coin, 895);
  assert.equal((await b.G.cloud.startNew()).ok, false); assert.ok((await b.G.cloud.login(credentials)).ok); assert.equal(b.state().wallet.coin, 895);
});

test('共享Cookie被别页换账号时旧页GET带账号约束，不把另一孩子的档写入本机', async () => {
  const server = fakeServer(), first = await bound(server); first.update('孩子甲', 900); await first.G.cloud.syncNow(); const other = browser(server); await other.init(); await other.G.cloud.register({ username: 'child_two', password: 'second_password' }); await other.G.cloud.bindLocal();
  const before = first.memory.get(saveKey); assert.equal((await first.G.cloud.syncNow()).ok, false); assert.equal(first.status().phase, 'expired'); assert.equal(first.memory.get(saveKey), before); const call = server.requests.at(-1); assert.equal(call.headers['X-MC-Account'], 'child_1');
});

test('第二标签只读，显式接管先保存原主人磁盘副本并恢复实际进度，旧页停止写入', async () => {
  const server = fakeServer(), first = await bound(server); first.update('原标签最新进度', 910); await first.G.cloud.syncNow(); const second = browser(server, { memory: first.memory }); await second.init(); assert.equal(second.status().readOnly, true); assert.throws(() => second.update('不应覆盖', 1));
  assert.ok(second.G.cloud.downloadBackup().ok); first.update('接管前又布置一次', 911); assert.ok((await second.G.cloud.takeover()).ok); assert.equal(second.state().wallet.coin, 911);
  await first.event('storage', { key: leaseKey }); assert.equal(first.status().readOnly, true); assert.throws(() => first.update('旧标签迟到写入', 2)); assert.ok(first.G.cloud.downloadBackup().ok);
});

test('只读页不恢复活跃主人的journal，旧主人也不能再写侧车或删除新租约', async () => {
  const server = fakeServer(), first = await bound(server), saved = JSON.parse(first.memory.get(metaKey)), json = first.memory.get(saveKey), snap = plain(first.G.state);
  saved.journal = { from: saved.active, to: saved.active, fromHash: hash(snap), toHash: hash(snap), fromSlot: saved.slots[saved.active] }; saved.slots[saved.active].json = json;
  first.memory.set(metaKey, JSON.stringify(saved)); const original = first.memory.get(metaKey), second = browser(server, { memory: first.memory }); await second.init(); assert.equal(second.status().readOnly, true); assert.equal(first.memory.get(metaKey), original);
  assert.ok((await second.G.cloud.takeover()).ok); const currentMeta = first.memory.get(metaKey), currentLease = first.memory.get(leaseKey);
  assert.equal(first.G.cloud.forgetBackup('recovery').ok, false); assert.equal(first.memory.get(metaKey), currentMeta);
  await first.event('pagehide'); assert.equal(first.memory.get(leaseKey), currentLease);
});

test('pagehide先保存最后操作再释放本人租约，刷新立即续玩；缓存页不抢新主人', async () => {
  const server = fakeServer(), first = await bound(server); first.G.store.update(state => { state.house.name = '刷新前的最后一次操作'; });
  await first.event('pagehide'); assert.equal(first.memory.has(leaseKey), false); assert.equal(JSON.parse(first.memory.get(saveKey)).house.name, '刷新前的最后一次操作');
  const next = browser(server, { memory: first.memory }); await next.init(); assert.equal(next.status().readOnly, false); assert.equal(next.state().house.name, '刷新前的最后一次操作');
  const lease = first.memory.get(leaseKey); await first.event('pageshow', { persisted: true }); assert.equal(first.status().readOnly, true); assert.equal(first.memory.get(leaseKey), lease);
});

test('隐藏页面不自动抢占，损坏侧车归属不猜测；不兼容构建不继续排队上传', async () => {
  const server = fakeServer(), hidden = browser(server, { hidden: true }); await hidden.init(); assert.equal(hidden.status().readOnly, true);
  const broken = browser(server, { memory: new Map([[metaKey, '{broken']]) }); await broken.init(); assert.equal(broken.status().readOnly, true); assert.equal((await broken.G.cloud.takeover()).ok, false);
  const b = await bound(server); server.incompatible(true); assert.equal((await b.G.cloud.syncNow()).ok, false); assert.equal(b.status().phase, 'incompatible'); const count = server.requests.length; b.update('仍可本机游玩', 920); await b.advance(5000); assert.equal(server.requests.length, count); assert.equal(b.status().phase, 'incompatible');
});

test('切换journal在目标已写盘但最终索引拒写后可重开恢复，不丢失guest副本', async () => {
  const server = fakeServer(), b = browser(server); await b.init(); b.update('旧guest副本', 930); await b.G.cloud.register(credentials); b.failFinal(true); const result = await b.G.cloud.bindLocal(); assert.equal(result.ok, false); assert.equal(b.status().readOnly, true);
  const journal = JSON.parse(b.memory.get(metaKey)).journal; assert.ok(journal); assert.equal(JSON.parse(b.memory.get(saveKey)).wallet.coin, 930);
  b.failFinal(false); b.expireLease(); const reopened = browser(server, { memory: b.memory }); await reopened.init(); assert.equal(JSON.parse(reopened.memory.get(metaKey)).journal, null); assert.equal(reopened.state().wallet.coin, 930); assert.ok(reopened.status().backups.find(value => value.id === 'guest'));
});

module.exports = { browser, canonical, hash, idle };
if (require.main === module) (async () => { for (const item of tests) { await item.fn(); console.log('✓ ' + item.name); } console.log('\n' + tests.length + ' 组账号同步、分支保护与多标签检查通过（隔离VM，无真实网络/浏览器）。'); })().catch(error => { console.error(error); process.exitCode = 1; });
