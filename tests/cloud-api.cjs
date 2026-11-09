'use strict';

// 真实临时SQLite + 流式请求替身；不启动服务、不监听端口、不读写用户账号或存档。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { prepareRelease, activateRelease, hash, sourceAssets } = require('../server/releases.cjs');
const { createHandler } = require('../server/handler.cjs');
const { createCloudApi } = require('../server/cloud-api.cjs');
const { openCloudStore } = require('../server/cloud-store.cjs');
const root = path.resolve(__dirname, '..'), temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-cloud-api-'));
const source = path.join(temporary, 'source'), dataDir = path.join(temporary, 'data'), origin = 'http://127.0.0.1:4173', prefix = '/cottage';
const sourceHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const assets = [...new Set(sourceAssets(sourceHtml).map(reference => reference.path))];
assert.ok(assets.includes('js/building/schema.js'), '实际发布入口必须带上新建筑校验器');
assert.ok(assets.includes('js/core/content-spaces.js'), '实际发布入口必须带上真实空间投影');
function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); }
write(path.join(source, 'index.html'), sourceHtml);
for (const relative of assets) write(path.join(source, relative), fs.readFileSync(path.join(root, relative)));
let now = Date.now(), api, handler, build, alice, aliceB, bob, saved, save, firstEpoch;
const checks = [];
function test(name, check) { checks.push({ name, check }); }
const clone = value => JSON.parse(JSON.stringify(value));
function boot(target = dataDir, extra = {}) {
  const service = createCloudApi({ dataDir: target, basePath: prefix, origin, clock: () => now, sessionTtlMs: 120000, authLimit: 6, ...extra });
  return { api: service, handler: createHandler({ dataDir: target, basePath: prefix, cloudApi: service }) };
}
async function request(route, { method = 'GET', body, headers = {}, actor = null, target = handler, release = build.id, raw, chunks } = {}) {
  const bytes = raw !== undefined ? Buffer.from(raw) : body !== undefined ? Buffer.from(JSON.stringify(body)) : Buffer.alloc(0);
  const input = chunks || (bytes.length ? [bytes.subarray(0, Math.min(37, bytes.length)), bytes.subarray(Math.min(37, bytes.length))] : []);
  const req = Readable.from(input);
  req.method = method; req.url = prefix + '/api/v1' + route;
  req.headers = { 'x-mc-protocol': '1', 'x-mc-build': release, ...(method === 'GET' ? {} : { origin, 'content-type': 'application/json' }), ...(actor ? { cookie: actor.cookie, 'x-csrf-token': actor.csrfToken, 'x-mc-account': actor.account.id } : {}), ...headers };
  req.socket = { remoteAddress: '127.0.0.1' };
  const response = { status: null, headers: {}, raw: Buffer.alloc(0) };
  await target(req, {
    writeHead(status, values) { assert.equal(response.status, null); response.status = status; response.headers = Object.fromEntries(Object.entries(values).map(([key, value]) => [key.toLowerCase(), value])); },
    end(value) { if (value !== undefined) response.raw = Buffer.from(value); }
  });
  assert.equal(response.headers['cache-control'], 'no-store');
  response.body = JSON.parse(response.raw);
  return response;
}
function actorFrom(response) { assert.equal(response.status, 200, JSON.stringify(response.body)); assert.ok(response.headers['set-cookie']); return { ...response.body, cookie: response.headers['set-cookie'].split(';')[0] }; }
async function put(actor, state, mutationId, base, expectedEpoch = actor.serverEpoch, extra = {}) {
  return request('/save', { method: 'PUT', actor, body: { save: state, mutationId, expectedEpoch }, headers: base ? { 'if-match': base } : { 'if-none-match': '*' }, ...extra });
}

test('创建真实WAL/FK数据库，空session不覆盖或创建小屋', async () => {
  build = prepareRelease({ sourceRoot: source, dataDir, basePath: prefix }); activateRelease({ dataDir, releaseId: build.id });
  ({ api, handler } = boot());
  assert.equal(fs.existsSync(path.join(dataDir, 'cloud/cottage.sqlite')), true);
  assert.equal(api.store.db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
  assert.equal(api.store.db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(api.store.directory).mode & 0o777, 0o700);
    assert.equal(fs.statSync(api.store.databasePath).mode & 0o777, 0o600);
    const unsafe = path.join(temporary, 'unsafe-data'), escaped = path.join(temporary, 'must-not-create.sqlite');
    fs.mkdirSync(path.join(unsafe, 'cloud'), { recursive: true });
    fs.symlinkSync(escaped, path.join(unsafe, 'cloud/cottage.sqlite'));
    assert.throws(() => openCloudStore({ dataDir: unsafe }), /符号链接/);
    assert.equal(fs.existsSync(escaped), false, '坏符号链接也不能创建目录外数据库');
  }
  const guest = await request('/session'); assert.equal(guest.status, 200); assert.equal(guest.body.authenticated, false); firstEpoch = guest.body.serverEpoch;
  assert.equal(api.store.db.prepare('SELECT COUNT(*) AS n FROM saves').get().n, 0);
  assert.equal((await request('/save')).status, 401);
});
test('注册两个孩子，密码仅scrypt盐哈希；两设备可登录同一账号', async () => {
  alice = actorFrom(await request('/register', { method: 'POST', body: { username: 'Alice_1', password: 'cloud-test-password-1', displayName: '小草莓' } }));
  assert.equal(alice.account.username, 'alice_1'); assert.equal(alice.account.displayName, '小草莓');
  assert.equal((await request('/save', { actor: alice })).body.code, 'NO_SAVE');
  bob = actorFrom(await request('/register', { method: 'POST', body: { username: 'bob_2', password: 'cloud-test-password-2' } }));
  assert.notEqual(alice.account.id, bob.account.id);
  aliceB = actorFrom(await request('/login', { method: 'POST', body: { username: 'alice_1', password: 'cloud-test-password-1' } }));
  assert.equal(aliceB.account.id, alice.account.id); assert.notEqual(aliceB.cookie, alice.cookie);
  assert.equal((await request('/session', { actor: alice })).body.authenticated, true);
  const row = api.store.db.prepare('SELECT * FROM accounts WHERE username=?').get('alice_1');
  assert.match(row.password_salt, /^[a-f0-9]{32}$/); assert.match(row.password_hash, /^[a-f0-9]{128}$/); assert.notEqual(row.password_hash, 'cloud-test-password-1');
  assert.equal(api.store.db.prepare('SELECT token_hash FROM sessions LIMIT 1').get().token_hash.includes(alice.cookie.split('=')[1]), false);
  const cookies = (await request('/login', { method: 'POST', body: { username: 'bob_2', password: 'cloud-test-password-2' } })).headers['set-cookie'];
  assert.match(cookies, /HttpOnly/); assert.match(cookies, /SameSite=Strict/); assert.match(cookies, /Path=\/cottage\//);
});
test('Origin、JSON、CSRF、账号绑定及输入错误均拒绝，避免cookie换账号串档', async () => {
  assert.equal((await request('/login', { method: 'POST', body: { username: 'alice_1', password: 'cloud-test-password-1' }, headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await request('/login', { method: 'POST', body: {}, headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await request('/register', { method: 'POST', body: { username: '短', password: 'short' } })).status, 422);
  assert.equal((await request('/register', { method: 'POST', body: { username: 'other_name', password: 'valid-test-password', ownerId: alice.account.id } })).status, 400);
  assert.equal((await request('/save', { method: 'PUT', actor: alice, body: {}, headers: { 'x-csrf-token': 'wrong' } })).status, 403);
  for (const [route, method] of [['/save', 'GET'], ['/save/versions', 'GET'], ['/save/versions/1', 'GET'], ['/save', 'PUT'], ['/logout', 'POST']]) {
    const response = await request(route, { method, actor: alice, body: method === 'GET' ? undefined : {}, headers: { cookie: bob.cookie } });
    assert.equal(response.status, 401); assert.equal(response.body.code, 'ACCOUNT_CHANGED');
  }
  assert.equal((await request('/session', { actor: bob })).body.authenticated, true);
});
test('首份CAS与跨设备读取完整JSON，账号间严格隔离', async () => {
  save = api.currentValidator().defaultSave(); save.house.name = '草莓自己的小屋';
  assert.equal(save.building.schema, 2); assert.equal(save.building.walls.length, 0);
  const floorId = save.building.floors[0].id;
  save.building.walls.push({ id: 'alice_free_wall', floorId, start: { x: -2, z: -1 }, end: { x: 3, z: 2 }, height: 2.8, thickness: .16, color: '#F4DDE7' });
  save.building.revision++;
  saved = await put(alice, save, 'first_write_01', null);
  assert.equal(saved.status, 200); assert.equal(saved.body.revision, 1); assert.equal(saved.body.serverEpoch, firstEpoch); assert.match(saved.headers.etag, /^".+:1:[a-f0-9]{64}"$/);
  const remote = await request('/save', { actor: aliceB }); assert.equal(remote.status, 200); assert.equal(remote.body.save.house.name, save.house.name); assert.equal(remote.headers.etag, saved.headers.etag);
  assert.deepEqual(remote.body.save.building, save.building, '跨设备读取保留新建筑几何，不从旧house再生成');
  assert.equal((await request('/save', { actor: bob })).status, 404);
  assert.equal((await request('/save/versions/1', { actor: bob })).status, 404);
  const bobSave = api.currentValidator().defaultSave(); bobSave.house.name = '蓝莓自己的小屋';
  assert.equal((await put(bob, bobSave, 'bob_first_write_01', null)).status, 200);
  const forgedOwner = await request('/save?ownerId=' + alice.account.id, { actor: bob });
  assert.equal(forgedOwner.status, 200); assert.equal(forgedOwner.body.save.house.name, bobSave.house.name);
  assert.equal((await request('/save', { actor: alice })).body.save.house.name, save.house.name);
  const noBase = await request('/save', { method: 'PUT', actor: alice, body: { save, mutationId: 'without_base_01', expectedEpoch: firstEpoch } }); assert.equal(noBase.status, 428);
});
test('重复请求幂等，规范键排序同内容不刷版本；双设备分叉412保留双方', async () => {
  const duplicate = await put(alice, save, 'first_write_01', null); assert.equal(duplicate.status, 200); assert.deepEqual(duplicate.body, saved.body);
  const other = clone(save); other.wallet.coin += 5;
  assert.equal((await put(alice, other, 'first_write_01', null)).status, 409);
  const reordered = Object.fromEntries(Object.entries(save).reverse());
  const same = await put(aliceB, reordered, 'same_sorted_01', saved.headers.etag); assert.equal(same.status, 200); assert.equal(same.body.revision, 1); assert.equal(same.body.contentHash, saved.body.contentHash);
  const stale = saved.headers.etag;
  saved = await put(alice, other, 'device_a_change_01', stale); assert.equal(saved.status, 200); assert.equal(saved.body.revision, 2); save = other;
  const branch = clone(save); branch.house.name = '另一台的草莓';
  const conflict = await put(aliceB, branch, 'device_b_change_01', stale); assert.equal(conflict.status, 412); assert.equal(conflict.body.code, 'SAVE_CONFLICT');
  assert.equal((await request('/save', { actor: aliceB })).body.save.house.name, save.house.name);
  assert.equal(api.store.db.prepare('SELECT COUNT(*) AS n FROM mutations WHERE mutation_id=?').get('device_b_change_01').n, 0);
});
test('坏档、未来版、危险键、超限UTF-8/字符与流式请求不改旧云档', async () => {
  const cases = [null, { version: 999 }, { ...clone(save), version: 2 }, { ...clone(save), house: { ...save.house, floors: [{ slots: ['missing', null, null] }] } }, JSON.parse(JSON.stringify(save).replace('"profile":{', '"profile":{"__proto__":{},'))];
  for (let i = 0; i < cases.length; i++) assert.equal((await put(alice, cases[i], 'invalid_save_' + i, saved.headers.etag)).status, 422);
  const long = clone(save); long.extra = 'a'.repeat(2500001); assert.equal((await put(alice, long, 'oversize_chars_01', saved.headers.etag)).status, 413);
  const utf8 = clone(save); utf8.extra = '汉'.repeat(1100000); assert.equal((await put(alice, utf8, 'oversize_bytes_01', saved.headers.etag)).status, 413);
  const streamed = await request('/save', { method: 'PUT', actor: alice, chunks: [Buffer.alloc(2 * 1024 * 1024, 65), Buffer.alloc(3 * 1024 * 1024, 65)] }); assert.equal(streamed.status, 413);
  assert.equal((await request('/login', { method: 'POST', raw: '{broken' })).status, 400);
  assert.equal((await request('/save', { actor: alice })).body.revision, saved.body.revision);
});
test('最近10版历史可下载，恢复内容作为新CAS修订而非倒退版本', async () => {
  for (let i = 0; i < 11; i++) { save = clone(save); save.wallet.coin += 1; saved = await put(alice, save, 'history_change_' + i, saved.headers.etag); assert.equal(saved.status, 200); }
  const history = await request('/save/versions', { actor: alice }); assert.equal(history.body.versions.length, 10);
  const last = history.body.versions.at(-1), older = await request('/save/versions/' + last.revision, { actor: aliceB }); assert.equal(older.status, 200); assert.equal(older.body.revision, last.revision);
  assert.equal((await request('/save/versions/1', { actor: alice })).status, 404);
  const restored = await put(alice, older.body.save, 'restore_selected_01', saved.headers.etag); assert.equal(restored.status, 200); assert.equal(restored.body.revision, saved.body.revision + 1); saved = restored; save = older.body.save;
});
test('数据库重启保持会话和完整档，备份是真实一致性SQLite且最多7份', async () => {
  await api.close(); ({ api, handler } = boot());
  assert.equal((await request('/session', { actor: alice })).body.authenticated, true); assert.equal((await request('/save', { actor: aliceB })).body.revision, saved.body.revision);
  let backup;
  for (let i = 0; i < 8; i++) { now += 1; backup = await api.backupDatabase(); assert.equal(fs.readFileSync(backup).subarray(0, 15).toString(), 'SQLite format 3'); }
  assert.equal(fs.readdirSync(path.dirname(backup)).filter(value => value.endsWith('.sqlite')).length, 7);
  if (process.platform !== 'win32') { assert.equal(fs.statSync(path.dirname(backup)).mode & 0o777, 0o700); assert.equal(fs.statSync(backup).mode & 0o777, 0o600); }
  const restoreDir = path.join(temporary, 'restored');
  const release = prepareRelease({ sourceRoot: source, dataDir: restoreDir, basePath: prefix }); activateRelease({ dataDir: restoreDir, releaseId: release.id });
  write(path.join(restoreDir, 'cloud/cottage.sqlite'), fs.readFileSync(backup));
  const restoredStore = openCloudStore({ dataDir: restoreDir, mustExist: true, clock: () => now }); const newEpoch = restoredStore.rotateEpoch(); assert.notEqual(newEpoch, firstEpoch); await restoredStore.close();
  const restored = boot(restoreDir);
  try {
    assert.equal((await request('/session', { actor: alice, target: restored.handler })).body.authenticated, false);
    const fresh = actorFrom(await request('/login', { method: 'POST', target: restored.handler, body: { username: 'alice_1', password: 'cloud-test-password-1' } }));
    assert.equal(fresh.serverEpoch, newEpoch);
    const outdated = await request('/save', { method: 'PUT', target: restored.handler, actor: fresh, body: { save, mutationId: 'after_restore_01', expectedEpoch: firstEpoch }, headers: { 'if-match': saved.headers.etag } }); assert.equal(outdated.status, 412); assert.equal(outdated.body.code, 'EPOCH_MISMATCH');
    const remote = await request('/save', { actor: fresh, target: restored.handler }); assert.equal(remote.body.save.wallet.coin, save.wallet.coin); assert.notEqual(remote.headers.etag, saved.headers.etag);
  } finally { await restored.api.close(); }
});
test('retained纯界面版本可同步，数据合同不同或未知旧build被拒绝', async () => {
  assert.equal((await request('/session', { headers: { 'x-mc-protocol': '2' } })).status, 426);
  assert.equal((await request('/session', { release: 'r-' + '0'.repeat(64) })).status, 426);
  const style = Buffer.concat([fs.readFileSync(path.join(source, 'css/building.css')), Buffer.from('\n/* UI-only retained build */\n')]); write(path.join(source, 'css/building.css'), style);
  let html = sourceHtml.replace(/css\/building\.css\?v=[a-f0-9]{10}/, 'css/building.css?v=' + hash(style).slice(0, 10)); write(path.join(source, 'index.html'), html);
  const uiBuild = prepareRelease({ sourceRoot: source, dataDir, basePath: prefix }); assert.equal((await request('/session', { release: uiBuild.id })).status, 200);
  const changed = Buffer.concat([fs.readFileSync(path.join(source, 'js/core/store.js')), Buffer.from('\n/* changed contract */\n')]); write(path.join(source, 'js/core/store.js'), changed);
  html = html.replace(/js\/core\/store\.js\?v=[a-f0-9]{10}/, 'js/core/store.js?v=' + hash(changed).slice(0, 10)); write(path.join(source, 'index.html'), html);
  const incompatible = prepareRelease({ sourceRoot: source, dataDir, basePath: prefix }); assert.equal((await request('/save', { actor: alice, release: incompatible.id })).status, 426);
  activateRelease({ dataDir, releaseId: incompatible.id }); assert.equal((await request('/session')).status, 426); assert.equal((await request('/session', { release: incompatible.id })).status, 200);
  activateRelease({ dataDir, releaseId: build.id });
});
test('登录失败限流、会话过期与退出不删除本机或云端内容', async () => {
  for (let i = 0; i < 6; i++) assert.equal((await request('/login', { method: 'POST', body: { username: 'missing_account', password: 'wrong-test-password' } })).status, 401);
  assert.equal((await request('/login', { method: 'POST', body: { username: 'missing_account', password: 'wrong-test-password' } })).status, 429);
  assert.equal((await request('/logout', { method: 'POST', actor: bob, raw: '' })).status, 200);
  assert.equal((await request('/session', { actor: bob })).body.authenticated, false);
  assert.equal((await request('/session', { actor: alice })).body.authenticated, true);
  now += 120001;
  assert.equal((await request('/save', { actor: alice })).status, 401);
  assert.equal(api.store.db.prepare('SELECT COUNT(*) AS n FROM saves').get().n, 2);
});
test('HTTPS会话自动Secure，epoch轮换撤销会话且不倒退已有修订', async () => {
  const secureService = boot(dataDir, { origin: 'https://cottage.example' });
  try {
    const fresh = actorFrom(await request('/login', { method: 'POST', target: secureService.handler, body: { username: 'alice_1', password: 'cloud-test-password-1' }, headers: { origin: 'https://cottage.example' } }));
    const result = await request('/login', { method: 'POST', target: secureService.handler, body: { username: 'alice_1', password: 'cloud-test-password-1' }, headers: { origin: 'https://cottage.example' } }); assert.match(result.headers['set-cookie'], /; Secure/);
    const epoch = secureService.api.rotateEpoch(); assert.notEqual(epoch, firstEpoch);
    assert.equal((await request('/session', { actor: fresh, target: secureService.handler })).body.authenticated, false);
    assert.equal(secureService.api.store.db.prepare('SELECT revision FROM saves WHERE account_id=?').get(alice.account.id).revision, saved.body.revision);
    assert.equal(secureService.api.store.db.prepare('SELECT COUNT(*) AS n FROM mutations').get().n, 0);
  } finally { await secureService.api.close(); }
});

(async () => {
  let passed = 0;
  try { for (const { name, check } of checks) { await check(); passed++; process.stdout.write('✓ ' + name + '\n'); } process.stdout.write('cloud-api: ' + passed + ' 组通过（真实临时SQLite，无监听）\n'); }
  finally { if (api) await api.close(); fs.rmSync(temporary, { recursive: true, force: true }); }
})().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
