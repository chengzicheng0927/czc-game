'use strict';
// 真实临时SQLite与流式HTTP替身，不监听、不接触生产或本机真实存档。
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { prepareRelease, activateRelease, hash, sourceAssets } = require('../server/releases.cjs');
const { createCloudApi } = require('../server/cloud-api.cjs');
const { createHandler } = require('../server/handler.cjs');
const { contractHash } = require('../server/save-validator.cjs');
const root = path.resolve(__dirname, '..'), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-public-api-')), source = path.join(temp, 'source'), dataDir = path.join(temp, 'data');
const prefix = '/cottage', origin = 'https://cottage.test', checks = [];
let build, api, handler, alice, bob, emptyChild, privateSave, saved, publication, now = Date.now();
function test(name, run) { checks.push({ name, run }); }
function copy(relative, value) { const file = path.join(source, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value === undefined ? fs.readFileSync(path.join(root, relative)) : value); }
function boot() { api = createCloudApi({ dataDir, basePath: prefix, origin, clock: () => now }); handler = createHandler({ dataDir, basePath: prefix, cloudApi: api }); }
async function request(route, { method = 'GET', body, actor, headers = {}, publicPage = false, streamChange } = {}) {
  const bytes = body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body)); let req;
  const input = streamChange ? (async function* () { yield bytes.subarray(0, 9); streamChange(req); yield bytes.subarray(9); })() : bytes.length ? [bytes] : [];
  req = Readable.from(input); req.method = method; req.url = prefix + (publicPage ? '' : '/api/v1') + route;
  req.headers = { 'x-mc-protocol': '1', 'x-mc-build': build.id, ...(method === 'GET' || method === 'HEAD' ? {} : { origin, 'content-type': 'application/json' }), ...(actor ? { cookie: actor.cookie, 'x-mc-account': actor.account.id, 'x-csrf-token': actor.csrfToken } : {}), ...headers };
  req.socket = { remoteAddress: '127.0.0.1' };
  const response = { status: null, headers: {}, bytes: Buffer.alloc(0) };
  await handler(req, { writeHead(status, values) { assert.equal(response.status, null); response.status = status; response.headers = Object.fromEntries(Object.entries(values).map(([key, value]) => [key.toLowerCase(), value])); }, end(value) { if (value !== undefined) response.bytes = Buffer.from(value); } });
  if (!publicPage) { assert.equal(response.headers['cache-control'], 'no-store'); response.body = JSON.parse(response.bytes); }
  return response;
}
function actor(response) { assert.equal(response.status, 200, JSON.stringify(response.body)); return { ...response.body, cookie: response.headers['set-cookie'].split(';')[0] }; }
async function register(username) { return actor(await request('/register', { method: 'POST', body: { username, password: 'local-public-test-password' } })); }
async function save(child, state, mutation, etag) { return request('/save', { method: 'PUT', actor: child, body: { save: state, mutationId: mutation, expectedEpoch: child.serverEpoch }, headers: etag ? { 'if-match': etag } : { 'if-none-match': '*' } }); }
function privateFixture() {
  const state = api.currentValidator().defaultSave(); state.profile.name = 'private_nickname'; state.profile.birthday = '02-03'; state.house.name = 'private_house_name'; state.wallet.coin = 987654;
  state.memories.push({ at: now, text: 'secret_private_memory' }); state.settings.ttsVoice = 'secret_voice_uri';
  state.house.rooms.room_public_test = { type: 'bedroom', wallpaper: { pattern: 'solid', color: '#FFF1C1', color2: '#BDECD6' }, floor: { pattern: 'wood', color: '#D5B08C' }, light: 'warm', items: [], paidPrice: 1979 };
  state.house.floors[0].slots[0] = 'room_public_test';
  state.residents.lily = { movedIn: true, roomId: 'room_public_test', affection: 8888, happiness: 87, heartBubbles: 0, lastBubbleAt: now, patsToday: 0 };
  state.customArts.push({ id: 'secret_unused_art', name: 'secret_unused_art', pixels: '.'.repeat(256) });
  return api.currentValidator().validate(state).save;
}
const summaryKeys = ['displayName', 'id', 'roomCount', 'title', 'updatedAt'];
function assertPublicSummary(value) { assert.deepEqual(Object.keys(value).sort(), summaryKeys); }
function assertProjectionPrivacy(snapshot) {
  const forbidden = new Set(['profile', 'wallet', 'inventory', 'collection', 'owned', 'paidPrice', 'affection', 'heartBubbles', 'happiness', 'wish', 'settings', 'album', 'albumTrash', 'memories', 'createdAt', 'builtAt', 'sourceRevision', 'account_id', 'accountId', 'username', 'password', 'csrfToken', 'source_revision', 'level']);
  function walk(value) { if (!value || typeof value !== 'object') return; for (const [key, child] of Object.entries(value)) { assert.equal(forbidden.has(key), false, '公开字段泄露：' + key); walk(child); } }
  walk(snapshot); const json = JSON.stringify(snapshot);
  for (const marker of ['private_nickname', 'private_house_name', 'secret_private_memory', 'secret_voice_uri', 'secret_unused_art', '987654', '1979', '8888', '02-03']) assert.equal(json.includes(marker), false, '私有内容泄露：' + marker);
}

test('每个小朋友的小屋默认公开，脱敏快照自动生成且未绑定的账号不公开', async () => {
  let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  if (!html.includes('js/core/public-house.js?v=')) html = html.replace('</body>', '<script src="js/core/public-house.js?v=' + hash(fs.readFileSync(path.join(root, 'js/core/public-house.js'))).slice(0, 10) + '"></script></body>');
  for (const ref of sourceAssets(html)) copy(ref.path);
  html = html.replace(/((?:js|css)\/[^"?]+)\?v=[a-f0-9]{10}/g, (_, relative) => relative + '?v=' + hash(fs.readFileSync(path.join(source, relative))).slice(0, 10)); copy('index.html', html);
  build = prepareRelease({ sourceRoot: source, dataDir, basePath: prefix }); activateRelease({ dataDir, releaseId: build.id }); boot();
  assert.equal(api.store.db.prepare('PRAGMA user_version').get().user_version, 1);
  alice = await register('private_alice'); bob = await register('private_bob'); emptyChild = await register('not_yet_bound');
  // 尚未保存云端存档的账号，没有公开小屋
  assert.equal((await request('/my-publication', { actor: emptyChild })).body.publication, null);
  privateSave = privateFixture(); saved = await save(alice, privateSave, 'private_first_save'); assert.equal(saved.status, 200);
  // 保存云端后，默认自动公开
  const list = await request('/neighbors'); assert.equal(list.body.houses.length, 1); assertPublicSummary(list.body.houses[0]);
  const myPub = await request('/my-publication', { actor: alice }); assert.ok(myPub.body.publication);
  publication = myPub.body.publication;
  assert.equal(publication.sourceRevision, 1);
  // 没填昵称时账号昵称等于登录名，默认公开不能把登录名当展示昵称
  assert.equal(list.body.houses[0].displayName, '小小建筑师'); assert.equal(publication.displayName, '小小建筑师'); assert.equal(JSON.stringify(list.body).includes('private_alice'), false);
  assert.equal(JSON.stringify((await request('/public-houses/' + publication.id)).body).includes('private_alice'), false);
  assert.equal((await request('/my-publication')).status, 401);
  assert.equal((await request('/public-houses/' + alice.account.id)).status, 404);
});
test('公开必须有效，拒绝未保存空屋与伪造投影/过期修订', async () => {
  const details = { title: '小草莓之家', displayName: '小建筑师', expectedRevision: 1 };
  assert.equal((await request('/my-publication', { method: 'POST', body: details })).status, 401);
  assert.equal((await request('/my-publication', { method: 'POST', actor: emptyChild, body: details })).body.code, 'NO_SAVED_HOUSE');
  for (const input of [{ ...details, title: '' }, { ...details, title: '字'.repeat(25) }, { ...details, displayName: '换\n行' }, { ...details, expectedRevision: 0 }]) assert.equal((await request('/my-publication', { method: 'POST', actor: alice, body: input })).status, 422);
  for (const input of [{ ...details, ownerId: bob.account.id }, { ...details, snapshot: privateSave }]) assert.equal((await request('/my-publication', { method: 'POST', actor: alice, body: input })).status, 400);
  assert.equal((await request('/my-publication', { method: 'POST', actor: alice, body: { ...details, expectedRevision: 2 } })).status, 412);
});
test('发布快照由可信投影器生成，公开摘要及JSON均无账号、钱包、生日、拥有权或私密内容', async () => {
  const response = await request('/my-publication', { method: 'POST', actor: alice, body: { title: '小草莓之家', displayName: '小建筑师', expectedRevision: 1 } });
  assert.equal(response.status, 200, JSON.stringify(response.body)); publication = response.body.publication; assert.equal(publication.sourceRevision, 1); assert.equal(publication.roomCount, 1); assert.notEqual(publication.id, alice.account.id);
  const list = await request('/neighbors'); assert.equal(list.body.houses.length, 1); assertPublicSummary(list.body.houses[0]);
  const detail = await request('/public-houses/' + publication.id); assert.equal(detail.status, 200); assert.deepEqual(Object.keys(detail.body).sort(), ['house', 'snapshot']); assertPublicSummary(detail.body.house); assertProjectionPrivacy(detail.body.snapshot);
  assert.equal(detail.body.snapshot.house.name, '小草莓之家'); assert.equal(Object.keys(detail.body.snapshot.house.rooms).length, 1);
  assert.equal(JSON.stringify(detail.body).includes(alice.account.id), false); assert.equal(JSON.stringify(detail.body).includes('private_alice'), false);
});
test('公开状态下后续保存自动更新公开快照；也可以设为不公开，不公开后后续保存不再自动公开', async () => {
  privateSave = structuredClone(privateSave); privateSave.house.rooms.room_public_test.wallpaper.color = '#BFE3FF'; privateSave.wallet.coin += 1;
  saved = await save(alice, privateSave, 'private_second_save', saved.headers.etag); assert.equal(saved.body.revision, 2);
  // 公开状态下，保存后快照自动跟随更新
  const afterSecondSave = (await request('/public-houses/' + publication.id)).body;
  assert.equal(afterSecondSave.snapshot.house.rooms.room_public_test.wallpaper.color, '#BFE3FF');
  // 小朋友可以选择不公开（撤下）
  const withdraw = await request('/my-publication', { method: 'DELETE', actor: alice, body: {} });
  assert.equal(withdraw.status, 200);
  assert.deepEqual((await request('/my-publication', { actor: alice })).body, { publication: null });
  assert.equal((await request('/public-houses/' + publication.id)).status, 404);
  assert.deepEqual((await request('/neighbors')).body.houses, []);
  // 不公开后，再次保存私有存档不会被自动公开
  privateSave = structuredClone(privateSave); privateSave.wallet.coin += 1;
  saved = await save(alice, privateSave, 'private_third_save', saved.headers.etag); assert.equal(saved.body.revision, 3);
  assert.deepEqual((await request('/my-publication', { actor: alice })).body, { publication: null });
  assert.deepEqual((await request('/neighbors')).body.houses, []);
  // 小朋友可以随时再次选择公开
  now += 1;
  const rePub = await request('/my-publication', { method: 'POST', actor: alice, body: { title: '重新公开的草莓屋', displayName: '小建筑师', expectedRevision: 3 } });
  assert.equal(rePub.status, 200); publication = rePub.body.publication;
  assert.equal((await request('/neighbors')).body.houses.length, 1);
});
test('只改私有数据的保存不改变公开快照和更新时间，改了布置才刷新', async () => {
  const detail = async () => (await request('/public-houses/' + publication.id)).body, mine = async () => (await request('/my-publication', { actor: alice })).body.publication;
  const first = await detail(), firstMine = await mine(); now += 5000;
  privateSave = structuredClone(privateSave); privateSave.wallet.coin += 7;
  saved = await save(alice, privateSave, 'private_wallet_only', saved.headers.etag); assert.equal(saved.status, 200);
  const walletOnly = await detail(), walletMine = await mine();
  assert.deepEqual(walletOnly, first); assert.equal(walletMine.updatedAt, firstMine.updatedAt); assert.equal(walletMine.sourceRevision, saved.body.revision);
  privateSave = structuredClone(privateSave); privateSave.house.rooms.room_public_test.wallpaper.color = '#FFD6E8'; now += 5000;
  saved = await save(alice, privateSave, 'private_layout_change', saved.headers.etag); assert.equal(saved.status, 200);
  const changed = await detail(), changedMine = await mine();
  assert.equal(changed.snapshot.house.rooms.room_public_test.wallpaper.color, '#FFD6E8'); assert.ok(changed.house.updatedAt > first.house.updatedAt); assert.equal(changedMine.sourceRevision, saved.body.revision); assert.equal(changed.house.id, publication.id);
});
test('来源、CSRF、账号绑定和流式读取后会话变化不能替别的孩子公开或撤下', async () => {
  const details = { title: '小草莓', displayName: '小建筑师', expectedRevision: 2 };
  for (const method of ['POST', 'DELETE']) {
    const body = method === 'POST' ? details : {};
    assert.equal((await request('/my-publication', { method, actor: alice, body, headers: { origin: 'https://else.test' } })).status, 403);
    assert.equal((await request('/my-publication', { method, actor: alice, body, headers: { 'x-csrf-token': 'wrong' } })).status, 403);
    assert.equal((await request('/my-publication', { method, actor: alice, body, headers: { cookie: bob.cookie } })).status, 401);
    assert.equal((await request('/my-publication', { method, actor: alice, body, streamChange(req) { req.headers.cookie = bob.cookie; } })).status, 401);
  }
  assert.equal((await request('/my-publication', { actor: alice, headers: { cookie: bob.cookie } })).status, 401);
  assert.equal((await request('/my-publication', { actor: bob })).body.publication, null);
  assert.equal((await request('/public-houses/' + publication.id)).status, 200);
});
test('公开文本保留为JSON字符串，访客HTML不内嵌公开输入且支持固定前缀和HEAD', async () => {
  now += 1; const title = '<img src=x onerror=x>';
  const updated = await request('/my-publication', { method: 'POST', actor: alice, body: { title, displayName: '<script>孩子</script>', expectedRevision: saved.body.revision } });
  assert.equal(updated.status, 200); publication = updated.body.publication;
  const detail = (await request('/public-houses/' + publication.id)).body; assert.equal(detail.house.title, title);
  const page = await request('/visit/' + publication.id, { publicPage: true }), normal = await request('/', { publicPage: true });
  assert.equal(page.status, 200); assert.equal(page.headers['cache-control'], 'no-cache'); assert.match(page.headers['content-type'], /text\/html/); assert.deepEqual(page.bytes, normal.bytes); assert.equal(page.bytes.includes(Buffer.from(title)), false);
  const head = await request('/visit/' + publication.id, { method: 'HEAD', publicPage: true }); assert.equal(head.status, 200); assert.equal(head.bytes.length, 0);
  for (const route of ['/visit/not-an-id', '/visit/' + publication.id + '/extra', '/visit/%2e%2e/private']) assert.notEqual((await request(route, { publicPage: true })).status, 200);
});
test('公开读取与访客入口不改变任何私有修订、JSON、会话或数据库记录', async () => {
  const before = api.store.db.prepare('SELECT revision,json FROM saves WHERE account_id=?').get(alice.account.id), changes = api.store.db.prepare('SELECT total_changes() AS n').get().n;
  await request('/neighbors'); await request('/public-houses/' + publication.id); await request('/visit/' + publication.id, { publicPage: true });
  assert.deepEqual(api.store.db.prepare('SELECT revision,json FROM saves WHERE account_id=?').get(alice.account.id), before); assert.equal(api.store.db.prepare('SELECT total_changes() AS n').get().n, changes);
});
test('另一个孩子的公开与撤下只作用于自己，不会枚举或修改私有账号', async () => {
  const bobSave = api.currentValidator().defaultSave(); bobSave.house.name = '私有蓝莓'; assert.equal((await save(bob, bobSave, 'bob_first_save')).status, 200);
  const published = await request('/my-publication', { method: 'POST', actor: bob, body: { title: '蓝莓小屋', displayName: '另一位建筑师', expectedRevision: 1 } }); assert.equal(published.status, 200); const id = published.body.publication.id;
  assert.notEqual(id, publication.id); assert.equal((await request('/my-publication', { actor: bob })).body.publication.id, id); assert.equal((await request('/my-publication', { actor: alice })).body.publication.id, publication.id);
  assert.equal((await request('/my-publication?ownerId=' + alice.account.id, { method: 'DELETE', actor: bob, body: {} })).status, 200);
  assert.equal((await request('/public-houses/' + id)).status, 404); assert.equal((await request('/public-houses/' + publication.id)).status, 200); assert.equal((await request('/save', { actor: bob })).body.save.house.name, '私有蓝莓');
});
test('公开列表24项分页稳定且不重复，游标校验拒绝无效输入', async () => {
  const template = api.store.db.prepare('SELECT * FROM publications WHERE id=?').get(publication.id);
  api.store.transaction(() => {
    for (let i = 0; i < 26; i++) {
      const id = crypto.randomUUID(), account = crypto.randomUUID();
      api.store.db.prepare('INSERT INTO accounts(id,username,display_name,password_salt,password_hash,created_at) VALUES (?,?,?,?,?,?)').run(account, 'pagination_private_' + i, '私密账号昵称' + i, '0'.repeat(32), '0'.repeat(128), now);
      api.store.db.prepare('INSERT INTO publications(id,account_id,title,display_name,snapshot_json,source_revision,room_count,updated_at) VALUES (?,?,?,?,?,?,?,?)').run(id, account, '邻居小屋' + i, '小建筑师' + i, template.snapshot_json, 1, 1, now + Math.floor(i / 2));
    }
  });
  const first = (await request('/neighbors')).body; assert.equal(first.houses.length, 24); assert.equal(typeof first.nextCursor, 'string'); first.houses.forEach(assertPublicSummary);
  const second = (await request('/neighbors?cursor=' + first.nextCursor)).body; assert.equal(second.houses.length, 3); assert.equal(second.nextCursor, null);
  assert.equal(new Set(first.houses.concat(second.houses).map(value => value.id)).size, 27);
  assert.equal(JSON.stringify(first).includes('pagination_private'), false); assert.equal(JSON.stringify(first).includes('私密账号昵称'), false);
  for (const query of ['cursor=', 'cursor=invalid', 'cursor=' + first.nextCursor + '&cursor=' + first.nextCursor, 'cursor=' + Buffer.from('{"updatedAt":0,"id":"x"}').toString('base64url')]) assert.equal((await request('/neighbors?' + query)).status, 400);
});
test('撤下即时移出列表并使旧链接404，再发布产生新身份且私有小屋保留', async () => {
  const id = publication.id; assert.equal((await request('/my-publication', { method: 'DELETE', actor: alice, body: {} })).status, 200);
  assert.equal((await request('/public-houses/' + id)).status, 404); assert.equal((await request('/my-publication', { actor: alice })).body.publication, null);
  assert.equal((await request('/save', { actor: alice })).body.revision, saved.body.revision);
  const again = await request('/my-publication', { method: 'POST', actor: alice, body: { title: '重新公开的小屋', displayName: '小建筑师', expectedRevision: saved.body.revision } }); assert.equal(again.status, 200); publication = again.body.publication; assert.notEqual(publication.id, id); assert.equal((await request('/public-houses/' + id)).status, 404);
});
test('新增投影和纯界面版本不会改变私有数据合同；重启保留公开快照', async () => {
  const before = contractHash(build), file = path.join(source, 'js/core/public-house.js'), value = fs.readFileSync(file, 'utf8') + '\n/* public presentation change */\n'; copy('js/core/public-house.js', value);
  const html = fs.readFileSync(path.join(source, 'index.html'), 'utf8').replace(/js\/core\/public-house\.js\?v=[a-f0-9]{10}/, 'js/core/public-house.js?v=' + hash(value).slice(0, 10)); copy('index.html', html);
  const next = prepareRelease({ sourceRoot: source, dataDir, basePath: prefix }); assert.equal(contractHash(next), before); activateRelease({ dataDir, releaseId: next.id });
  assert.equal((await request('/session', { actor: alice })).status, 200); const beforeDetail = (await request('/public-houses/' + publication.id)).body;
  await api.close(); boot(); assert.deepEqual((await request('/public-houses/' + publication.id)).body, beforeDetail); assert.equal((await request('/save', { actor: alice })).body.revision, saved.body.revision);
  assert.equal((await request('/neighbors', { headers: { 'x-mc-protocol': '2' } })).status, 426);
});
test('灾难恢复轮换epoch时撤销公开记录，防止旧备份复活已撤下链接，私有进度不变', async () => {
  const before = api.store.db.prepare('SELECT revision,json FROM saves WHERE account_id=?').get(alice.account.id); api.rotateEpoch();
  assert.deepEqual((await request('/neighbors')).body, { houses: [], nextCursor: null }); assert.equal((await request('/public-houses/' + publication.id)).status, 404); assert.equal((await request('/my-publication', { actor: alice })).status, 401);
  assert.deepEqual(api.store.db.prepare('SELECT revision,json FROM saves WHERE account_id=?').get(alice.account.id), before);
  for (const [route, method] of [['/neighbors', 'POST'], ['/public-houses/' + publication.id, 'PUT'], ['/my-publication', 'PUT']]) assert.equal((await request(route, { method, body: {} })).status, 405);
});

(async () => {
  let passed = 0;
  try { for (const { name, run } of checks) { await run(); passed++; console.log('✓ ' + name); } console.log(passed + ' 组公开小屋API/隐私/CAS/撤下/分页/恢复检查通过（真实临时SQLite，无监听）。'); }
  finally { if (api) await api.close(); fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
