'use strict';
// 真正的store/save与现有系统；仅使用内存localStorage，不启动服务或访问玩家存档。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), key = 'marshmallow_cottage_save_v1';
const coreFiles = new Set(['js/core/namespace.js', 'js/core/utils.js', 'js/core/bus.js', 'js/core/store.js', 'js/core/save.js']);
const files = [...fs.readFileSync(path.join(root, 'index.html'), 'utf8').matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)]
  .map(match => match[1].split('?')[0]).filter(file => coreFiles.has(file) || file.startsWith('js/data/') || file.startsWith('js/systems/'));
const plain = value => JSON.parse(JSON.stringify(value)), tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function setup(options = {}) {
  const storage = new Map(options.raw === undefined ? [] : [[key, options.raw]]), timers = new Map(), writes = [], downloads = [];
  let rejected = false, rejectBackup = !!options.rejectBackup, sequence = 0, onWrite = null;
  const RealDate = Date, clock = new RealDate(2026, 9, 29, 12).getTime();
  class TestDate extends RealDate { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const context = vm.createContext({ console, Blob, URL, Date: TestDate, setTimeout(fn) { timers.set(++sequence, fn); return sequence; }, clearTimeout(id) { timers.delete(id); }, setInterval() { return ++sequence; }, clearInterval() {}, document: { hidden: false, addEventListener() {} } });
  context.window = context; context.addEventListener = () => {};
  context.localStorage = {
    getItem(name) { return storage.has(name) ? storage.get(name) : null; },
    setItem(name, value) {
      if (rejected || rejectBackup && name.startsWith(key + '_corrupt_')) throw new Error('QuotaExceededError');
      if (onWrite) onWrite(name, String(value));
      storage.set(name, String(value)); writes.push({ key: name, value: String(value) });
    }
  };
  files.forEach(file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file }));
  const G = context.Game;
  G.utils.download = (name, value, type) => { downloads.push({ name, value, type }); return true; };
  G.store.init(G.save.load()); G.sys.init(); G.save.init();
  return { G, storage, writes, downloads, timers, reject(value) { rejected = value; }, allowBackup() { rejectBackup = false; }, observeWrite(fn) { onWrite = fn; }, runTimeouts() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); } };
}
function current(env) {
  const { G } = env, room = G.sys.building.buildRoom(0, 0, 'bedroom'); assert.ok(room.ok, room.message);
  assert.ok(G.sys.decorating.place('bed_basic', room.roomId, 30, 80).ok);
  G.store.update(state => { state.house.name = '今天仍在玩的家'; state.wallet.coin = 721; });
  G.runtime.mode = 'decorate'; G.runtime.selected = { roomId: room.roomId, uid: 'held_item' }; G.runtime.placing = 'desk_lamp_basic'; G.runtime.activeRoomId = room.roomId;
  G.runtime.latestPhoto = { id: 'old_photo', canvas: { old: true } };
  assert.ok(G.save.flush());
  return room.roomId;
}
function target(G) { const next = G.utils.clone(G.state); next.house.name = '准备恢复的小屋'; next.wallet.coin = 639; return next; }
function file(next) { const text = typeof next === 'string' ? next : JSON.stringify(next); return { size: Buffer.byteLength(text), text: async () => text }; }
function watch(G) { const events = { replace: 0, imported: 0, change: 0 }; G.bus.on('state:replace', () => events.replace++); G.bus.on('save:imported', () => events.imported++); G.bus.on('state:change', () => events.change++); return events; }
function snapshot(env) { return { object: env.G.state, state: JSON.stringify(env.G.state), runtime: JSON.stringify(env.G.runtime), disk: env.storage.get(key), writes: env.writes.length }; }
function unchanged(env, before, events) {
  assert.equal(env.G.state, before.object); assert.equal(JSON.stringify(env.G.state), before.state);
  assert.equal(JSON.stringify(env.G.runtime), before.runtime); assert.equal(env.storage.get(key), before.disk); assert.equal(env.writes.length, before.writes);
  assert.deepEqual(events, { replace: 0, imported: 0, change: 0 });
}

test('导入真实拒写不切档、不清运行态、不初始化或发成功事件，当前进度仍可导出', async () => {
  const env = setup(), { G } = env; current(env); const next = target(G), before = snapshot(env), events = watch(G);
  let inits = 0; G.sys.init = () => { inits++; }; env.reject(true);
  const result = await G.save.importFile(file(next)); assert.equal(result.ok, false); assert.match(result.message, /原来的小屋没有改变/);
  unchanged(env, before, events); assert.equal(inits, 0);
  const exported = JSON.parse(G.save.exportJson()); assert.equal(exported.house.name, '今天仍在玩的家'); assert.equal(exported.wallet.coin, 721); assert.equal(env.downloads.length, 1);
  env.reject(false); assert.ok(G.sys.decorating.undo().ok, '失败不能清掉原小屋的撤销记录');
});

test('重新开始真实拒写保留原磁盘、选择与撤销，返回明确失败', () => {
  const env = setup(), { G } = env; current(env); const before = snapshot(env), events = watch(G); let inits = 0;
  G.sys.init = () => { inits++; }; env.reject(true);
  const result = G.save.reset(); assert.equal(result.ok, false); unchanged(env, before, events); assert.equal(inits, 0);
  assert.equal(JSON.parse(G.save.exportJson()).house.name, '今天仍在玩的家'); env.reject(false); assert.ok(G.sys.decorating.undo().ok);
});

test('坏JSON、未来版本、非法经济和超限文件在任何写入前拒绝，失败后可再导入', async () => {
  const env = setup(), { G } = env; current(env); const next = target(G), future = plain(next), negative = plain(next), duplicate = plain(next);
  future.version = 99; negative.wallet.coin = -1; duplicate.house.floors[0].slots[1] = duplicate.house.floors[0].slots[0];
  const before = snapshot(env), events = watch(G);
  for (const source of [file('{broken'), file(future), file(negative), file(duplicate), { size: G.data.balance.maxSaveBytes + 1, text: async () => { throw new Error('不应读取超限文件'); } }]) {
    assert.equal((await G.save.importFile(source)).ok, false); unchanged(env, before, events);
  }
  assert.ok((await G.save.importFile(file(next))).ok);
});

test('成功导入先把同版本旧档归一化并写盘，随后才换档及清理旧撤销和照片缓存', async () => {
  const env = setup(), { G } = env; current(env); const next = target(G); delete next.crafting; delete next.residentNotices; delete next.albumTrash;
  const before = snapshot(env), events = watch(G); let observed = false;
  env.observeWrite((name, value) => {
    if (name !== key) return;
    observed = true; assert.equal(G.state, before.object); assert.equal(JSON.stringify(G.runtime), before.runtime);
    const saved = JSON.parse(value); assert.equal(saved.house.name, next.house.name); assert.deepEqual(saved.crafting, { counts: {}, last: null }); assert.deepEqual(saved.residentNotices, []); assert.deepEqual(saved.albumTrash, []);
  });
  const result = await G.save.importFile(file(next)); env.observeWrite(null);
  assert.ok(result.ok, result.message); assert.ok(observed); assert.equal(events.replace, 1); assert.equal(events.imported, 1);
  assert.equal(G.state.house.name, next.house.name); assert.equal(G.state.wallet.coin, 639); assert.equal(G.runtime.mode, 'explore'); assert.equal(G.runtime.selected, null); assert.equal(G.runtime.placing, null); assert.equal(G.runtime.activeRoomId, null);
  assert.equal(G.runtime.latestPhoto, undefined); assert.equal(G.sys.decorating.undo().ok, false);
  assert.equal(G.save.load().house.name, next.house.name); assert.equal(G.save.load().wallet.coin, 639);
});

test('成功重新开始先落盘再换档，保留正常state:replace清理且不冒充导入事件', () => {
  const env = setup(), { G } = env; current(env); const before = snapshot(env), events = watch(G); let observed = false;
  env.observeWrite((name, value) => { if (name === key) { observed = true; assert.equal(G.state, before.object); assert.equal(JSON.stringify(G.runtime), before.runtime); const saved = JSON.parse(value); assert.equal(Object.keys(saved.house.rooms).length, 0); assert.equal(saved.wallet.coin, G.data.balance.initialCoin); } });
  const result = G.save.reset(); env.observeWrite(null); assert.ok(result.ok, result.message); assert.ok(observed);
  assert.equal(events.replace, 1); assert.equal(events.imported, 0); assert.equal(Object.keys(G.state.house.rooms).length, 0); assert.equal(G.runtime.selected, null); assert.equal(G.runtime.latestPhoto, undefined); assert.equal(G.sys.decorating.undo().ok, false);
  assert.equal(Object.keys(G.save.load().house.rooms).length, 0); assert.equal(G.save.load().wallet.coin, G.data.balance.initialCoin);
});

test('损坏原文备份失败的保护不被导入或重新开始绕过，之后恢复写权限也不覆盖原文', async () => {
  const broken = '{损坏原文请保留', env = setup({ raw: broken, rejectBackup: true }), { G } = env;
  assert.equal(G.save.backupKey, null); env.allowBackup(); const before = snapshot(env), events = watch(G), next = target(G);
  const imported = await G.save.importFile(file(next)); assert.equal(imported.ok, false); assert.match(imported.message, /损坏存档/); unchanged(env, before, events);
  assert.equal(G.save.reset().ok, false); unchanged(env, before, events); assert.equal(G.save.flush(), false); assert.equal(env.storage.get(key), broken);
  assert.equal(JSON.parse(G.save.exportJson()).house.name, G.state.house.name); assert.equal(env.storage.get(key), broken);
});

test('损坏原文已另键备份后允许恢复，备份原文仍完整保留', async () => {
  const broken = '{bad', env = setup({ raw: broken }), { G } = env, backupKey = G.save.backupKey;
  assert.ok(backupKey); assert.equal(env.storage.get(backupKey), broken); const next = target(G), result = await G.save.importFile(file(next));
  assert.ok(result.ok, result.message); assert.equal(env.storage.get(backupKey), broken); assert.equal(JSON.parse(env.storage.get(key)).house.name, next.house.name);
});

test('切档后初始化异常如实返回已保存加warning，不谎称失败仍是旧档', async () => {
  for (const action of ['import', 'reset']) for (const failure of [new Error('日常补算临时异常'), undefined, null]) {
    const env = setup(), { G } = env; current(env); const next = target(G), events = watch(G);
    G.sys.init = () => { throw failure; };
    const result = action === 'import' ? await G.save.importFile(file(next)) : G.save.reset();
    assert.equal(result.ok, true); assert.match(result.warning, /已经保存在本机/); assert.match(result.message, /日常更新暂时未完成/);
    assert.equal(events.replace, 1); assert.equal(events.imported, action === 'import' ? 1 : 0); assert.equal(G.runtime.selected, null);
    assert.equal(G.save.load().house.name, action === 'import' ? next.house.name : '我的小屋'); assert.match(G.save.status, /日常更新/);
  }
});

test('异步读文件期间拒绝并行导入和重新开始，读完后释放切档锁', async () => {
  const env = setup(), { G } = env; current(env); const next = target(G), before = snapshot(env), events = watch(G); let finishRead;
  const pending = G.save.importFile({ text: () => new Promise(resolve => { finishRead = resolve; }) }); await Promise.resolve();
  assert.equal((await G.save.importFile(file(next))).ok, false); assert.equal(G.save.reset().ok, false); unchanged(env, before, events);
  finishRead(JSON.stringify(next)); assert.ok((await pending).ok); assert.equal(events.replace, 1); assert.equal(events.imported, 1);
  assert.ok(G.save.reset().ok); assert.equal(events.replace, 2);
});

test('读文件期间仍可正常更新和自动保存，新进度使迟到导入失效且可重选', async () => {
  const env = setup(), { G } = env; current(env); const next = target(G); let finishRead;
  const pending = G.save.importFile({ text: () => new Promise(resolve => { finishRead = resolve; }) }); await Promise.resolve();
  const writes = env.writes.length; G.store.update(state => { state.wallet.coin += 9; state.house.name = '读档期间继续布置的家'; });
  env.runTimeouts(); assert.equal(env.writes.length, writes + 1); assert.equal(JSON.parse(env.storage.get(key)).wallet.coin, 730);
  const before = snapshot(env), events = watch(G); finishRead(JSON.stringify(next));
  const result = await pending; assert.equal(result.ok, false); assert.match(result.message, /已经有了新进度/); assert.match(result.message, /重新选择/); unchanged(env, before, events);
  assert.ok((await G.save.importFile(file(next))).ok); assert.equal(G.state.house.name, next.house.name);
});

test('读取拒绝undefined或null有错误兜底且释放锁，reset非Error异常也能重试', async () => {
  for (const failure of [undefined, null]) {
    const env = setup(), { G } = env; current(env); const before = snapshot(env), events = watch(G);
    const result = await G.save.importFile({ text: () => Promise.reject(failure) });
    assert.equal(result.ok, false); assert.match(result.message, /暂时无法读取/); unchanged(env, before, events);
    assert.ok((await G.save.importFile(file(target(G)))).ok, '读取异常之后必须允许重新选择文件');
    const defaultState = G.store.defaultState, after = snapshot(env), afterEvents = watch(G);
    G.store.defaultState = () => { throw failure; }; const reset = G.save.reset(); G.store.defaultState = defaultState;
    assert.equal(reset.ok, false); assert.match(reset.message, /原来的进度保持原样/); unchanged(env, after, afterEvents);
    assert.ok(G.save.reset().ok, '重新开始异常之后必须释放切档锁');
  }
});

test('保存状态及导入完成的同步事件不能重入切档覆盖刚保存的目标', async () => {
  const env = setup(), { G } = env; current(env); const next = target(G); let resetResult, nestedImport;
  G.bus.on('save:status', event => { if (event.status === G.data.messages.saved && resetResult === undefined) resetResult = G.save.reset(); });
  G.bus.on('save:imported', () => { nestedImport = G.save.importFile(file(G.store.defaultState())); });
  const result = await G.save.importFile(file(next)); assert.ok(result.ok); assert.equal(resetResult.ok, false); assert.equal((await nestedImport).ok, false);
  assert.equal(G.state.house.name, next.house.name); assert.equal(G.save.load().house.name, next.house.name);
});

test('日常补算只在目标已保存后发生，沿用自动保存而不成为第二次导入提交', async () => {
  const env = setup(), { G } = env; current(env); const next = target(G), yesterday = '2026-10-28', today = G.utils.dateKey();
  next.quests.daily.date = yesterday; next.daily.lastLoginDate = yesterday; Object.values(next.minigames).forEach(game => { game.date = yesterday; game.playsToday = 2; });
  const writes = env.writes.length, result = await G.save.importFile(file(next)); assert.ok(result.ok, result.message);
  assert.equal(env.writes.length, writes + 1); assert.equal(JSON.parse(env.storage.get(key)).daily.lastLoginDate, yesterday);
  assert.equal(G.state.daily.lastLoginDate, today); assert.equal(G.state.quests.daily.date, today); assert.equal(G.state.minigames.memory.playsToday, 0); assert.ok(env.timers.size);
  env.runTimeouts(); assert.equal(JSON.parse(env.storage.get(key)).daily.lastLoginDate, today); assert.equal(JSON.parse(env.storage.get(key)).quests.daily.date, today);
});

(async () => { for (const entry of tests) { await entry.fn(); console.log('✓ ' + entry.name); } console.log('\n' + tests.length + ' 组可靠切档与原文保护检查通过。'); })().catch(error => { console.error(error); process.exitCode = 1; });
