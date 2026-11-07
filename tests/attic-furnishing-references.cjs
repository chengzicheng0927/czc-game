'use strict';
// MC-079 独立引用检查草稿：真实store/save/creative/publicHouse/photography，不复制主规则检查。
// 仅隔离合成数据和内存存储；摄影末项仅验证参数转交，不验证Canvas、像素或实际取景。
// 本轮只执行node --check；规则运行由总集串行安排，不自动require其他检查或启动服务。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), atticId = 'attic:observatory', tests = [];
const core = new Set(['js/core/namespace.js', 'js/core/utils.js', 'js/core/bus.js', 'js/core/store.js', 'js/core/save.js', 'js/core/public-house.js']);
const files = [...fs.readFileSync(path.join(root, 'index.html'), 'utf8').matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)]
  .map(match => match[1].split('?')[0]).filter(file => core.has(file) || file.startsWith('js/data/') || file.startsWith('js/systems/'));
const plain = value => JSON.parse(JSON.stringify(value));
const succeeds = result => { assert.equal(result?.ok, true, result?.message || '真实系统没有返回成功'); return result; };
function test(name, fn) { tests.push({ name, fn }); }
let environments = [];
function setup({ attic = true, studio = true } = {}) {
  const storage = new Map(), writes = [], downloads = [], errors = [];
  let rejected = false, onWrite = null, timer = 0;
  const RealDate = Date, clock = new RealDate(2026, 9, 30, 21).getTime();
  class FixedDate extends RealDate { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const context = vm.createContext({
    console: { log: console.log, warn: console.warn, error: (...args) => errors.push(args.map(String)) },
    Blob, URL, Date: FixedDate, setTimeout() { return ++timer; }, clearTimeout() {}, setInterval() { return ++timer; }, clearInterval() {},
    document: { hidden: false, addEventListener() {} }
  });
  context.window = context; context.addEventListener = () => {};
  context.localStorage = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { if (rejected) throw new Error('QuotaExceededError'); const json = String(value); if (onWrite) onWrite(key, json); storage.set(key, json); writes.push({ key, json }); }
  };
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  const G = context.Game;
  G.utils.download = (name, value, mime) => { downloads.push({ name, value, mime }); return true; };
  G.store.init(G.save.load()); G.sys.init(); G.save.init();
  G.store.update(state => { state.level = 17; state.wallet.coin = 5000; state.settings.dayMode = 'night'; });
  const ordinaryId = succeeds(G.sys.building.buildRoom(0, 0, 'bedroom')).roomId;
  if (studio) succeeds(G.sys.building.buildRoom(0, 1, 'studio'));
  if (attic) succeeds(G.sys.observatory.build());
  const env = {
    G, ordinaryId, writes, downloads, errors,
    disk() { return storage.get(G.data.balance.saveKey); },
    reject(value) { rejected = value; },
    observeWrite(fn) { onWrite = fn; },
    into(value) { context.__fixtureJson = JSON.stringify(value); try { return vm.runInContext('JSON.parse(__fixtureJson)', context); } finally { delete context.__fixtureJson; } }
  };
  environments.push(env); return env;
}
function room(env, id = atticId) { const value = env.G.store.decorRoom(env.G.state, id); assert.ok(value, '必须使用产品空间解析器'); return value; }
function art(env, name = '只在私档保留的画名', pixels = '1' + '.'.repeat(255)) { return succeeds(env.G.sys.creative.save({ name, pixels })).art; }
function snapshot(env) { return { object: env.G.state, json: JSON.stringify(env.G.state), runtime: JSON.stringify(env.G.runtime), disk: env.disk() }; }
function unchanged(env, before) { assert.equal(env.G.state, before.object); assert.equal(JSON.stringify(env.G.state), before.json); assert.equal(JSON.stringify(env.G.runtime), before.runtime); assert.equal(env.disk(), before.disk); }
function successEvents(G) {
  const list = [], off = ['state:change', 'save:committed', 'creative:changed', 'item:placed', 'room:decorated', 'decoration:undone'].map(name => G.bus.on(name, () => list.push(name)));
  return { list, close() { off.forEach(stop => stop()); } };
}

test('已建阁楼不冒充画室，同作品挂画在普通房和阁楼之间保持全屋唯一', () => {
  const env = setup({ studio: false }), { G } = env;
  assert.equal(G.sys.creative.status().hasStudio, false);
  assert.equal(G.sys.creative.status().unlocked, false);
  const locked = snapshot(env);
  assert.equal(G.sys.creative.save({ name: '未解锁', pixels: '.'.repeat(256) }).ok, false); unchanged(env, locked);
  succeeds(G.sys.building.buildRoom(0, 1, 'studio'));
  const saved = art(env), placed = succeeds(G.sys.creative.place(saved.id, atticId, 35, 45));
  assert.deepEqual(plain(G.sys.creative.placement(saved.id)), { roomId: atticId, uid: placed.uid });
  const before = snapshot(env), duplicate = G.sys.creative.place(saved.id, env.ordinaryId);
  assert.equal(duplicate.ok, false); assert.equal(duplicate.uid, placed.uid); unchanged(env, before);
  succeeds(G.sys.creative.wallpaper(atticId, saved.id));
  succeeds(G.sys.creative.save({ id: saved.id, name: saved.name, pixels: '3'.repeat(256) }));
  assert.equal(G.sys.creative.get(saved.id).pixels, '3'.repeat(256));
  assert.equal(room(env).wallpaper.artId, saved.id);
  assert.equal(room(env).items.find(value => value.uid === placed.uid).artId, saved.id);
  assert.equal(G.state.inventory.custom_art_frame, undefined); assert.equal(G.state.collection.custom_art_frame, undefined);
});

test('删除阁楼画作引用真实拒写时保留undo，成功时同次落盘清所有挂画和墙纸', () => {
  const env = setup(), { G } = env, saved = art(env);
  const placed = succeeds(G.sys.creative.place(saved.id, atticId, 35, 45));
  succeeds(G.sys.creative.wallpaper(atticId, saved.id)); succeeds(G.sys.creative.wallpaper(env.ordinaryId, saved.id));
  const colors = { attic: room(env).wallpaper.color, ordinary: room(env, env.ordinaryId).wallpaper.color };
  succeeds(G.sys.decorating.move(atticId, placed.uid, atticId, 70, 65));
  G.runtime.selected = { roomId: atticId, uid: placed.uid }; assert.ok(G.save.flush());
  const before = snapshot(env), events = successEvents(G);
  env.reject(true); assert.equal(G.sys.creative.remove(saved.id).ok, false); env.reject(false); events.close();
  unchanged(env, before); assert.deepEqual(events.list, []);
  succeeds(G.sys.decorating.undo());
  assert.equal(room(env).items.find(value => value.uid === placed.uid).x, 35, '拒写删除不能清掉旧移动撤销');
  succeeds(G.sys.decorating.move(atticId, placed.uid, atticId, 70, 65));
  G.runtime.selected = { roomId: atticId, uid: placed.uid };
  const old = snapshot(env), writes = env.writes.length, commits = [];
  env.observeWrite((key, json) => { if (key === G.data.balance.saveKey) commits.push({ old: G.state, saved: JSON.parse(json) }); });
  const result = G.sys.creative.remove(saved.id); env.observeWrite(null); succeeds(result);
  assert.equal(env.writes.length, writes + 1); assert.equal(commits.length, 1); assert.equal(commits[0].old, old.object);
  const committed = commits[0].saved;
  assert.equal(committed.customArts.some(value => value.id === saved.id), false);
  for (const target of [committed.house.attic.room, committed.house.rooms[env.ordinaryId]]) {
    assert.equal(target.items.some(value => value.artId === saved.id), false);
    assert.equal(target.wallpaper.pattern, 'solid'); assert.equal(Object.hasOwn(target.wallpaper, 'artId'), false);
  }
  assert.equal(room(env).wallpaper.color, colors.attic); assert.equal(room(env, env.ordinaryId).wallpaper.color, colors.ordinary);
  assert.equal(G.runtime.selected, null); assert.equal(G.state.inventory.custom_art_frame, undefined);
  assert.equal(G.sys.decorating.undo().ok, false, '成功删除后不能撤销出孤立作品引用');
});

test('Markdown阁楼清单与全屋作品引用计数来自真实布置，导出不改进度', () => {
  const env = setup(), { G } = env, saved = art(env, '阁楼小花');
  succeeds(G.sys.creative.place(saved.id, atticId, 35, 45));
  succeeds(G.sys.creative.wallpaper(atticId, saved.id)); succeeds(G.sys.creative.wallpaper(env.ordinaryId, saved.id));
  succeeds(G.sys.decorating.place('nightstand_basic', atticId, 100, 0, null, .35));
  const before = snapshot(env), memory = G.save.exportMemory(); unchanged(env, before);
  const attic = memory.split('## 阁楼天文台\n')[1]?.split('\n## ')[0];
  assert.ok(attic, '原观星章节应继续存在');
  assert.ok(attic.includes(saved.name), '阁楼章节应列出真实挂画');
  assert.ok(attic.includes(G.data.furnitureById.nightstand_basic.name), '阁楼章节应列出真实家具');
  assert.match(attic, /前后\s*35%/);
  assert.match(memory, /挂画\s*1\s*处\s*·\s*墙纸\s*2\s*(?:间|处)/);
  assert.equal(env.downloads.length, 1); assert.equal(env.downloads[0].value, memory);
});

test('公开阁楼只投影视觉和已引用像素，旧布尔快照兼容且新字段严格拒绝私密和坏引用', () => {
  const env = setup(), { G } = env, saved = art(env), unused = art(env, '未引用的私密画名', '2'.repeat(256));
  const placed = succeeds(G.sys.creative.place(saved.id, atticId, 35, 45));
  succeeds(G.sys.creative.wallpaper(atticId, saved.id));
  succeeds(G.sys.decorating.place('bed_basic', env.ordinaryId, 10, 90));
  G.store.update(state => { state.profile.name = '合成私密姓名'; state.house.name = '合成私密屋名'; });
  const source = plain(G.state), sourceJson = JSON.stringify(source), output = plain(G.publicHouse.project(source, { title: '主动公开的小屋' }));
  assert.equal(JSON.stringify(source), sourceJson);
  assert.equal(output.house.attic, true);
  assert.deepEqual(Object.keys(output.house.atticRoom).sort(), ['floor', 'items', 'light', 'wallpaper']);
  assert.deepEqual(output.customArts, [{ id: saved.id, pixels: saved.pixels }]);
  const encoded = JSON.stringify(output);
  for (const secret of ['paidPrice', 'builtAt', 'observatory', 'wallet', 'inventory', 'album', 'profile', saved.name, unused.id, unused.name, '合成私密姓名', '合成私密屋名']) assert.equal(encoded.includes(secret), false, secret);
  const materialized = G.publicHouse.materialize(env.into(output));
  assert.deepEqual(plain(materialized.house.attic.room), output.house.atticRoom);
  assert.equal(Object.hasOwn(materialized.house, 'atticRoom'), false, '视觉中转字段不能残留在真实状态形状');
  assert.deepEqual(plain(materialized.house.floors), output.house.floors);
  const legacy = plain(output); delete legacy.house.atticRoom;
  assert.deepEqual(plain(G.publicHouse.materialize(env.into(legacy)).house.attic.room.items), []);
  legacy.house.attic = false; assert.equal(G.publicHouse.materialize(env.into(legacy)).house.attic, null);
  const mutations = [
    value => { value.house.atticRoom.paidPrice = 1000; },
    value => { value.house.atticRoom.builtAt = 1234; },
    value => { value.house.atticRoom.observatory = plain(G.state.observatory); },
    value => { value.house.atticRoom.wallpaper.name = '私密名'; },
    value => { value.house.atticRoom.items[0].private = true; },
    value => { value.customArts[0].name = '私密画名'; },
    value => { value.house.attic = false; },
    value => { value.house.rooms[env.ordinaryId].items[0].uid = placed.uid; },
    value => { value.house.rooms[env.ordinaryId].items.push({ ...value.house.atticRoom.items[0], uid: 'duplicate_art_frame' }); },
    value => { value.house.atticRoom.wallpaper.artId = 'missing_art'; },
    value => { value.customArts = []; }
  ];
  for (const mutate of mutations) { const invalid = plain(output); mutate(invalid); assert.throws(() => G.publicHouse.materialize(env.into(invalid))); }
});

test('真实摄影framing仅向渲染接口转交已建阁楼ID，不把参数检查当成像素验收', () => {
  const env = setup({ attic: false, studio: false }), { G } = env, calls = [];
  // 唯一渲染替身只记录边界参数；不返回像素、不模拟captureScene内部取景或投射。
  G.render = { captureScene(settings) { calls.push(plain(settings)); return { width: 640, height: 480 }; } };
  assert.equal(G.sys.photography.prepare({ scope: 'room', roomId: atticId, fresh: true }).ok, false);
  assert.deepEqual(calls, []);
  succeeds(G.sys.observatory.build());
  const before = snapshot(env);
  succeeds(G.sys.photography.prepare({ scope: 'room', roomId: atticId, fresh: true }));
  succeeds(G.sys.photography.prepare({ scope: 'room', roomId: atticId }));
  assert.deepEqual(calls, [{ scope: 'room', roomId: atticId }], '同一阁楼草稿复用原底图');
  assert.equal(G.sys.photography.prepare({ scope: 'room', roomId: 'missing_room', fresh: true }).ok, false);
  assert.equal(calls.length, 1); unchanged(env, before);
});

(async () => {
  for (const entry of tests) {
    environments = []; await entry.fn();
    for (const env of environments) assert.deepEqual(env.errors, [], '真实产品事件不能静默抛错');
    console.log('✓ ' + entry.name);
  }
  console.log('\n' + tests.length + ' 组 MC-079 真实引用/导出检查通过；摄影末项仅为API转交，不表示取景、UI或像素验收。');
})().catch(error => { console.error(error); process.exitCode = 1; });
