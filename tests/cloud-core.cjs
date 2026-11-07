'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), key = 'marshmallow_cottage_save_v1';
const core = new Set(['js/core/namespace.js', 'js/core/utils.js', 'js/core/bus.js', 'js/building/schema.js', 'js/core/store.js', 'js/core/save.js', 'js/core/content-spaces.js']);
const files = JSON.parse(fs.readFileSync(path.join(root, 'scripts/legacy-assets.json'), 'utf8')).filter(file => core.has(file) || file.startsWith('js/data/'));
for (const file of core) assert.ok(files.includes(file), '实际清单缺少存档依赖：' + file);
assert.ok(files.indexOf('js/building/schema.js') < files.indexOf('js/core/store.js'), '建筑schema须在store之前加载');
function setup() {
  const disk = new Map(), events = []; let denied = false;
  const ctx = vm.createContext({ console, Blob, URL, document: { hidden: false, addEventListener() {} }, setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {} });
  ctx.window = ctx; ctx.addEventListener = () => {}; ctx.localStorage = { getItem: k => disk.get(k) || null, setItem(k, value) { if (denied) throw new Error('QuotaExceededError'); disk.set(k, value); } };
  files.forEach(file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file }));
  const G = ctx.Game; G.store.init(); G.sys.init = () => {}; G.bus.on('save:committed', e => events.push(e));
  return { G, context: ctx, disk, events, deny: value => { denied = value; } };
}
let groups = 0;
function check(name, fn) { fn(); groups++; console.log('✓ ' + name); }
check('持久事务在内存发布前发出正确的已落盘快照，不能上传旧Game.state', () => {
  const { G, disk, events } = setup(); const old = G.state;
  G.bus.on('save:committed', event => { assert.equal(G.state, old); assert.equal(event.state.wallet.coin, 411); assert.equal(disk.get(key), event.json); });
  G.store.update(s => { s.wallet.coin = 411; }, { persist: true });
  assert.equal(events.length, 1); assert.equal(events[0].source, 'local'); assert.equal(G.state.wallet.coin, 411);
});
check('拒写不会发保存成功事件；snapshot只读实际落盘副本', () => {
  const env = setup(), { G } = env; assert.ok(G.save.flush()); const snapshot = G.save.snapshot();
  G.store.update(s => { s.wallet.coin = 512; }); assert.equal(G.save.snapshot().json, snapshot.json);
  env.deny(true); assert.equal(G.save.flush(), false); assert.equal(env.events.length, 1); assert.equal(G.save.snapshot().json, snapshot.json);
});
check('非持有页的写guard拦住普通操作、持久操作、replace与周期flush', () => {
  const { G, disk, events } = setup(); G.save.flush(); const original = JSON.stringify(G.state), raw = disk.get(key); let ran = false;
  G.store.setWriteGuard(() => ({ ok: false, message: '另一页正在保存' }));
  assert.equal(G.store.canWrite(), false); assert.equal(G.store.writeReason(), '另一页正在保存');
  assert.throws(() => G.store.update(s => { ran = true; s.wallet.coin++; }), /另一页/);
  assert.throws(() => G.store.update(s => { s.wallet.coin++; }, { persist: true }), /另一页/);
  assert.throws(() => G.store.replace(G.store.defaultState()), /另一页/);
  assert.equal(G.save.flush(), false); assert.equal(G.save.commit(G.store.defaultState()), false);
  assert.equal(ran, false); assert.equal(JSON.stringify(G.state), original); assert.equal(disk.get(key), raw); assert.equal(events.length, 1);
});
check('云端切档使用明确来源且真正落盘后才切换，仍受拒写保护', () => {
  const env = setup(), { G, disk } = env; G.save.flush(); const before = G.state, raw = disk.get(key); const next = G.store.defaultState(); next.house.name = '另台设备的小屋';
  G.store.setWriteGuard(context => context.source === 'cloud');
  env.deny(true); assert.equal(G.save.restore(next, { source: 'cloud' }).ok, false); assert.equal(G.state, before); assert.equal(disk.get(key), raw);
  env.deny(false); const result = G.save.restore(next, { source: 'cloud' }); assert.ok(result.ok); assert.equal(G.state.house.name, next.house.name); assert.equal(env.events.at(-1).source, 'cloud'); assert.equal(JSON.parse(disk.get(key)).house.name, next.house.name);
});
check('guard抛错也不会落盘，撤销guard后旧离线保存能力继续可用', () => {
  const { G } = setup(); G.store.setWriteGuard(() => { throw new Error('无法确认归属'); });
  assert.equal(G.save.flush(), false); assert.throws(() => G.store.update(s => { s.wallet.coin++; }), /无法确认/);
  G.store.setWriteGuard(null); G.store.update(s => { s.wallet.coin++; }); assert.ok(G.save.flush()); assert.equal(G.save.snapshot().state.wallet.coin, 301);
});
check('新建筑的米制几何进入同一真实保存事件，拒写时不发布建筑或云同步快照', () => {
  const env = setup(), { G } = env;
  const before = JSON.stringify(G.state.building);
  const addWall = state => {
    state.building = env.context.CottageBuilding.executeCommand(state.building, { type: 'wall.add', wall: { id: 'cloud_geometry_wall', floorId: state.building.floors[0].id, start: { x: -2, z: 1 }, end: { x: 3, z: 2 }, height: 2.8, thickness: .16, color: '#F4DDE7' } });
  };
  env.deny(true); assert.throws(() => G.store.update(addWall, { persist: true }));
  assert.equal(JSON.stringify(G.state.building), before); assert.equal(env.events.length, 0);
  env.deny(false); G.store.update(addWall, { persist: true });
  const event = env.events.at(-1), disk = JSON.parse(env.disk.get(key));
  assert.equal(event.state.building.schema, 2); assert.equal(event.state.building.walls[0].end.z, 2);
  assert.deepEqual(disk.building, JSON.parse(JSON.stringify(G.state.building)));
});
console.log(groups + ' 组本机保存事件与多页写入保护检查通过。');
