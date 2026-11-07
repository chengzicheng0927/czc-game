'use strict';
// MC-079 合成规则夹具草稿：只加载真实产品脚本，不替身实现空间/摆放/撤销/观星规则。
// 隔离数据实现已接入；本轮仍只做 node --check，不代表规则或视觉检查已执行。
// 存储与时钟是隔离的环境输入，不读取玩家存档，不创建服务、浏览器或真实计时器。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const atticId = 'attic:observatory';
const coreFiles = new Set(['js/core/namespace.js', 'js/core/utils.js', 'js/core/bus.js', 'js/core/store.js', 'js/core/save.js']);
const files = [...fs.readFileSync(path.join(root, 'index.html'), 'utf8').matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)]
  .map(match => match[1].split('?')[0])
  .filter(file => coreFiles.has(file) || file.startsWith('js/data/') || file.startsWith('js/systems/'));
const plain = value => JSON.parse(JSON.stringify(value));
const tests = [];
let environments = [];
function test(name, fn) { tests.push({ name, fn }); }
function succeeds(result) { assert.equal(result?.ok, true, result?.message || '真实规则没有返回成功'); return result; }

function sandbox() {
  const storage = new Map(), timers = new Map(), writes = [], eventErrors = [];
  let rejectWrites = false, sequence = 0, onWrite = null;
  const RealDate = Date;
  let clock = new RealDate(2026, 9, 30, 21).getTime();
  class TestDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
  }
  const context = vm.createContext({
    console: { log: console.log, warn: console.warn, error: (...args) => eventErrors.push(args.map(String)) },
    Blob, URL, Date: TestDate,
    setTimeout(fn) { timers.set(++sequence, fn); return sequence; },
    clearTimeout(id) { timers.delete(id); },
    setInterval() { return ++sequence; }, clearInterval() {},
    document: { hidden: false, addEventListener() {} }
  });
  context.window = context;
  context.addEventListener = () => {};
  context.localStorage = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) {
      if (rejectWrites) throw new Error('QuotaExceededError');
      const json = String(value);
      if (onWrite) onWrite(key, json);
      storage.set(key, json); writes.push({ key, json });
    }
  };
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  const G = context.Game;
  G.store.init(G.save.load());
  G.sys.init();
  G.save.init();
  const env = {
    G, storage, writes, eventErrors,
    into(value) {
      context.__fixtureJson = JSON.stringify(value);
      try { return vm.runInContext('JSON.parse(__fixtureJson)', context); }
      finally { delete context.__fixtureJson; }
    },
    disk() { return storage.get(G.data.balance.saveKey); },
    reject(value) { rejectWrites = value; },
    observeWrite(fn) { onWrite = fn; },
    at(date, hour = 21) {
      const [year, month, day] = date.split('-').map(Number);
      clock = new RealDate(year, month - 1, day, hour).getTime();
    }
  };
  environments.push(env);
  return env;
}

function built() {
  const env = sandbox(), { G } = env;
  G.store.update(state => { state.level = 17; state.wallet.coin = 5000; state.settings.dayMode = 'night'; });
  // 使用真实建房，让原规则正常扩楼；不手工造普通房或赠送测试家具。
  env.ordinaryId = succeeds(G.sys.building.buildRoom(0, 0, 'bedroom')).roomId;
  succeeds(G.sys.observatory.build());
  assert.ok(G.save.flush());
  return env;
}
function room(env, id = atticId) {
  assert.equal(env.G.store.atticRoomId, atticId, 'MC-079 固定空间ID尚未接入');
  assert.equal(typeof env.G.store.decorRoom, 'function', '必须调用产品空间解析器，不在夹具补实现');
  const value = env.G.store.decorRoom(env.G.state, id);
  assert.ok(value, '真实已建空间应能解析：' + id);
  return value;
}
function item(env, uid, id = atticId) { return room(env, id).items.find(value => value.uid === uid); }
function parentAndChild(env, id = atticId) {
  const { G } = env;
  const parent = succeeds(G.sys.decorating.place('nightstand_basic', id, 100, 0, null, 0));
  const child = succeeds(G.sys.decorating.place('desk_lamp_basic', id, 105, 125, parent.uid));
  return { parent: parent.uid, child: child.uid };
}
function snapshot(env) {
  return { object: env.G.state, json: JSON.stringify(env.G.state), runtime: JSON.stringify(env.G.runtime), disk: env.disk() };
}
function unchanged(env, before) {
  assert.equal(env.G.state, before.object, '拒绝操作不得发布新的内存状态');
  assert.equal(JSON.stringify(env.G.state), before.json);
  assert.equal(JSON.stringify(env.G.runtime), before.runtime);
  assert.equal(env.disk(), before.disk, '本机原存档应保持原文');
}
function watch(G) {
  const list = [];
  // save:status/save:error 属于允许的失败反馈，只观察真实提交和成功事件。
  const off = ['state:change', 'state:replace', 'save:committed', 'save:imported', 'item:placed', 'item:moved', 'item:removed', 'room:decorated', 'decoration:undone', 'observatory:built', 'observatory:observed', 'level:up']
    .map(name => G.bus.on(name, () => list.push(name)));
  return { list, close() { off.forEach(stop => stop()); } };
}
function refuses(env, action) {
  const before = snapshot(env), events = watch(env.G);
  try { assert.equal(action()?.ok, false, '应返回明确失败，而非抛异常或声称成功'); unchanged(env, before); assert.deepEqual(events.list, []); }
  finally { events.close(); }
}
function ordinaryMetrics(G) {
  return Object.fromEntries(['roomCount', 'floors', 'bestRoomStars', 'theme_basic'].map(name => [name, G.sys.quests.metric(name)]));
}
function claims(G) { return plain({ main: G.state.quests.main.claimed, achievements: G.state.quests.achievements, milestones: G.state.quests.milestoneClaims }); }
function furnishings(env) { return plain({ ordinary: env.G.state.house.rooms, attic: room(env), inventory: env.G.state.inventory }); }

test('合法三字段旧阁楼经真实校验和JSON恢复补空布置，不改原数据或观星凭据', async () => {
  const env = built(), { G } = env;
  succeeds(G.sys.observatory.observe());
  const legacy = plain(G.state); delete legacy.house.attic.room;
  const input = env.into(legacy), source = JSON.stringify(input), checked = G.store.validate(input);
  assert.deepEqual(Object.keys(checked.house.attic).sort(), ['builtAt', 'paidPrice', 'room', 'type']);
  assert.deepEqual(Object.keys(checked.house.attic.room).sort(), ['floor', 'items', 'light', 'wallpaper']);
  assert.deepEqual(plain(checked.house.attic.room.items), []);
  assert.equal(JSON.stringify(input), source, '迁移不能改写真正传入校验器的原对象');
  assert.deepEqual(plain(checked.house.rooms), legacy.house.rooms);
  assert.deepEqual(plain(checked.house.floors), legacy.house.floors);
  assert.deepEqual(plain(checked.observatory), legacy.observatory);
  assert.deepEqual(plain(checked.wallet), legacy.wallet);
  succeeds(await G.save.importFile({ text: async () => source }));
  assert.deepEqual(plain(G.save.load().house.attic.room.items), []);
  assert.deepEqual(plain(G.state.observatory), legacy.observatory);
  assert.deepEqual(claims(G), { main: legacy.quests.main.claimed, achievements: legacy.quests.achievements, milestones: legacy.quests.milestoneClaims });
});

test('未建阁楼不被解析或构造为普通房间，建造仅扣原1000并初始化空空间', () => {
  const env = sandbox(), { G } = env;
  assert.equal(typeof G.store.decorRoom, 'function', 'MC-079 产品访问器尚未接入');
  G.store.update(state => { state.level = 17; state.wallet.coin = 5000; state.settings.dayMode = 'night'; });
  const before = plain(G.state);
  assert.equal(G.store.decorRoom(G.state, atticId), null);
  assert.equal(G.store.decorRoom(G.state, '__proto__'), null);
  refuses(env, () => G.sys.decorating.place('bed_basic', atticId, 10, 90));
  succeeds(G.sys.observatory.build());
  assert.deepEqual(plain(room(env).items), []);
  assert.equal(G.state.wallet.coin, before.wallet.coin - 1000);
  assert.deepEqual(plain(G.state.house.rooms), before.house.rooms);
  assert.deepEqual(plain(G.state.house.floors), before.house.floors);
  assert.deepEqual(plain(G.state.inventory), before.inventory);
  assert.deepEqual(plain(G.state.quests), before.quests);
  assert.equal(Object.hasOwn(G.state.house.rooms, atticId), false);
});

test('新room的残缺、错类型和未知字段由真实校验及导入拒绝，原撤销仍可用', async () => {
  const env = built(), { G } = env;
  succeeds(G.sys.decorating.place('bed_basic', atticId, 10, 90));
  assert.ok(G.save.flush());
  G.runtime.activeRoomId = atticId; G.runtime.selected = { roomId: atticId, uid: room(env).items[0].uid };
  const mutations = [
    state => { state.house.attic.room = null; },
    ...['wallpaper', 'floor', 'light', 'items'].map(key => state => { delete state.house.attic.room[key]; }),
    state => { state.house.attic.extra = true; },
    state => { state.house.attic.room.paidPrice = 0; },
    state => { state.house.attic.room.items = {}; },
    state => { state.house.attic.room.wallpaper.extra = 'private'; },
    state => { state.house.attic.room.floor.extra = 'private'; },
    state => { state.house.attic.room.items[0].extra = 'private'; },
    state => { state.house.attic.room.items[0].defId = ['bed_basic']; }
  ];
  for (const mutate of mutations) {
    const raw = plain(G.state); mutate(raw);
    assert.throws(() => G.store.validate(env.into(raw)));
    const before = snapshot(env), events = watch(G);
    const result = await G.save.importFile({ text: async () => JSON.stringify(raw) });
    events.close(); assert.equal(result.ok, false); unchanged(env, before); assert.deepEqual(events.list, []);
  }
  succeeds(G.sys.decorating.undo());
  assert.equal(room(env).items.length, 0, '失败导入不能清掉原装饰撤销');
});

test('实际起始承托组跨普通房与阁楼保UID/深度，收起和撤销保留之后购买', () => {
  const env = built(), { G } = env, initialInventory = plain(G.state.inventory);
  const ids = parentAndChild(env), sky = plain(G.state.observatory), afterPlace = plain(G.state.quests.stats);
  assert.equal(G.state.inventory.nightstand_basic, initialInventory.nightstand_basic - 1);
  assert.equal(G.state.inventory.desk_lamp_basic, initialInventory.desk_lamp_basic - 1);
  assert.equal(item(env, ids.parent).depth, 0);
  assert.equal(item(env, ids.child).parent, ids.parent);
  assert.equal(Object.hasOwn(item(env, ids.child), 'depth'), false);
  const inventory = plain(G.state.inventory), experience = G.state.exp;
  succeeds(G.sys.decorating.move(atticId, ids.parent, env.ordinaryId, 180, 0, null, 1));
  assert.equal(room(env).items.length, 0);
  assert.equal(item(env, ids.parent, env.ordinaryId).depth, 1);
  assert.equal(item(env, ids.child, env.ordinaryId).parent, ids.parent);
  assert.equal(item(env, ids.child, env.ordinaryId).x, 185);
  succeeds(G.sys.decorating.move(env.ordinaryId, ids.parent, atticId, 60, 0));
  assert.equal(room(env, env.ordinaryId).items.length, 0);
  assert.equal(item(env, ids.parent).depth, 1);
  assert.equal(item(env, ids.child).x, 65);
  assert.equal(item(env, ids.child).parent, ids.parent);
  assert.deepEqual(plain(G.state.inventory), inventory);
  assert.deepEqual(plain(G.state.quests.stats), afterPlace);
  assert.equal(G.state.exp, experience);
  const group = plain(room(env).items);
  succeeds(G.sys.decorating.remove(atticId, ids.parent));
  assert.equal(room(env).items.length, 0);
  assert.deepEqual(plain(G.state.inventory), initialInventory);
  succeeds(G.sys.economy.buy('vase_basic'));
  const purchase = { coin: G.state.wallet.coin, exp: G.state.exp, count: G.state.inventory.vase_basic };
  succeeds(G.sys.decorating.undo());
  assert.deepEqual(plain(room(env).items), group);
  assert.equal(G.state.inventory.nightstand_basic, initialInventory.nightstand_basic - 1);
  assert.equal(G.state.inventory.desk_lamp_basic, initialInventory.desk_lamp_basic - 1);
  assert.equal(G.state.inventory.vase_basic, purchase.count);
  assert.equal(G.state.wallet.coin, purchase.coin); assert.equal(G.state.exp, purchase.exp);
  assert.deepEqual(plain(G.state.observatory), sky);
});

test('真实家具的重复UID与跨空间parent不能经存档绕过，地面旧depth仍补.75', () => {
  const env = built(), { G } = env, ids = parentAndChild(env);
  const bed = succeeds(G.sys.decorating.place('bed_basic', env.ordinaryId, 10, 90));
  succeeds(G.sys.economy.buy('yard_bench'));
  succeeds(G.sys.yard.place('yard_bench', -100, 80));
  const mutations = [
    state => { state.house.rooms[env.ordinaryId].items[0].uid = ids.parent; },
    state => { state.house.yard.items[0].uid = ids.parent; },
    state => { state.house.attic.room.items.find(value => value.uid === ids.child).parent = bed.uid; },
    state => { state.house.attic.room.items.find(value => value.uid === ids.child).parent = ids.child; },
    state => { state.house.attic.room.items.find(value => value.uid === ids.child).depth = .5; }
  ];
  for (const mutate of mutations) { const raw = plain(G.state); mutate(raw); assert.throws(() => G.store.validate(env.into(raw))); }
  const oldDepth = plain(G.state); delete oldDepth.house.attic.room.items.find(value => value.uid === ids.parent).depth;
  const checked = G.store.validate(env.into(oldDepth));
  assert.equal(checked.house.attic.room.items.find(value => value.uid === ids.parent).depth, .75);
  assert.equal(checked.house.attic.room.items.find(value => value.uid === ids.child).parent, ids.parent);
});

test('普通房、阁楼和前院共同使用真实配置的家具总上限', () => {
  const env = built(), { G } = env;
  succeeds(G.sys.decorating.place('bed_basic', env.ordinaryId, 10, 90));
  succeeds(G.sys.decorating.place('nightstand_basic', atticId, 100, 0));
  succeeds(G.sys.economy.buy('yard_bench')); succeeds(G.sys.yard.place('yard_bench', -100, 80));
  // 合成导入边界数据沿用真实物品形状与生产maxItems，不替换容量规则或降低上限。
  const full = plain(G.state), template = full.house.rooms[env.ordinaryId].items[0];
  for (let index = 0; index < G.data.balance.maxItems - 3; index++) full.house.attic.room.items.push({ ...template, uid: 'capacity_attic_' + index });
  succeeds(G.save.restore(env.into(full), { source: 'local' }));
  succeeds(G.sys.economy.buy('yard_bench'));
  refuses(env, () => G.sys.decorating.place('desk_lamp_basic', atticId, 105, 125));
  refuses(env, () => G.sys.decorating.place('desk_lamp_basic', env.ordinaryId, 105, 125));
  refuses(env, () => G.sys.yard.place('yard_bench', 100, 80));
  const over = plain(G.state); over.house.attic.room.items.push({ ...template, uid: 'capacity_overflow' });
  assert.throws(() => G.store.validate(env.into(over)));
});

test('阁楼摆放沿用旧首次标志，不新增普通房指标或重刷已领凭据', () => {
  const env = built(), { G } = env, before = plain(G.state), metrics = ordinaryMetrics(G), claimed = claims(G);
  const exp = G.state.exp, placed = G.state.quests.stats.itemsPlaced;
  succeeds(G.sys.decorating.place('bed_basic', atticId, 10, 90));
  assert.deepEqual(ordinaryMetrics(G), metrics);
  assert.equal(G.state.exp, exp + G.data.balance.firstPlaceExp);
  succeeds(G.sys.decorating.undo());
  succeeds(G.sys.decorating.place('bed_basic', env.ordinaryId, 10, 90));
  assert.equal(G.state.quests.stats.itemsPlaced, placed + 2);
  assert.equal(G.state.exp, exp + G.data.balance.firstPlaceExp, '同一defId的首次经验只能发一次');
  assert.deepEqual(Object.keys(G.state.tutorial.seenTips).filter(key => key.includes('bed_basic')), ['placed_bed_basic']);
  assert.deepEqual(claims(G), claimed);
  assert.deepEqual(plain(G.state.observatory), before.observatory);
  assert.deepEqual(plain(G.state.house.floors), before.house.floors);
  assert.equal(G.state.quests.stats.roomsBuilt, before.quests.stats.roomsBuilt);
  refuses(env, () => G.sys.building.demolishRoom(atticId));
  refuses(env, () => G.sys.building.changeRoomType(atticId, 'bedroom'));
  refuses(env, () => G.sys.residents.invite('lily', atticId));
});

test('阁楼收起后真实送礼消耗库存，撤销不能生成负库存或恢复已送出的物品', () => {
  const env = built(), { G } = env;
  succeeds(G.sys.decorating.place('bed_basic', env.ordinaryId, 10, 90));
  succeeds(G.sys.residents.invite('lily', env.ordinaryId));
  succeeds(G.sys.economy.buy('cake_strawberry'));
  const cake = succeeds(G.sys.decorating.place('cake_strawberry', atticId, 105, 130));
  succeeds(G.sys.decorating.remove(atticId, cake.uid));
  succeeds(G.sys.residents.gift('lily', 'cake_strawberry'));
  assert.equal(G.state.inventory.cake_strawberry, 0);
  refuses(env, () => G.sys.decorating.undo());
  assert.equal(room(env).items.some(value => value.uid === cake.uid), false);
});

test('阁楼place/双向移动/收起/墙地/undo走真实保存拒写，解除后只提交一次', () => {
  const cases = [
    { name: 'place', prepare() {}, act: env => env.G.sys.decorating.place('bed_basic', atticId, 10, 90), verify: env => assert.equal(room(env).items.length, 1) },
    { name: 'moveOut', prepare: env => { env.group = parentAndChild(env); }, act: env => env.G.sys.decorating.move(atticId, env.group.parent, env.ordinaryId, 180, 0, null, 1), verify: env => assert.equal(item(env, env.group.child, env.ordinaryId).parent, env.group.parent) },
    { name: 'moveIn', prepare: env => { env.group = parentAndChild(env, env.ordinaryId); }, act: env => env.G.sys.decorating.move(env.ordinaryId, env.group.parent, atticId, 180, 0, null, 1), verify: env => assert.equal(item(env, env.group.child).parent, env.group.parent) },
    { name: 'remove', prepare: env => { env.group = parentAndChild(env); }, act: env => env.G.sys.decorating.remove(atticId, env.group.parent), verify: env => assert.equal(room(env).items.length, 0) },
    { name: 'wallpaper', prepare() {}, act: env => env.G.sys.decorating.wallpaper(atticId, 'solid', '#F8DDE7', '#FFF8FB'), verify: env => assert.equal(room(env).wallpaper.color, '#F8DDE7') },
    { name: 'floor', prepare() {}, act: env => env.G.sys.decorating.floor(atticId, 'wood', '#D6B391'), verify: env => assert.equal(room(env).floor.color, '#D6B391') },
    { name: 'undo', prepare: env => { succeeds(env.G.sys.decorating.place('bed_basic', atticId, 10, 90)); }, act: env => env.G.sys.decorating.undo(), verify: env => { assert.equal(room(env).items.length, 0); assert.equal(env.G.state.inventory.bed_basic, 1); } }
  ];
  for (const entry of cases) {
    const env = built(); entry.prepare(env); assert.ok(env.G.save.flush());
    const beforeAction = furnishings(env);
    env.reject(true); refuses(env, () => entry.act(env)); env.reject(false);
    if (['place', 'wallpaper', 'floor'].includes(entry.name)) refuses(env, () => env.G.sys.decorating.undo());
    const events = watch(env.G), writes = env.writes.length;
    succeeds(entry.act(env)); events.close(); entry.verify(env);
    assert.equal(env.writes.length, writes + 1, entry.name + ' 应只持久提交一次');
    assert.equal(events.list.filter(name => name === 'save:committed').length, 1);
    assert.equal(events.list.filter(name => name === 'state:change').length, 1);
    assert.deepEqual(JSON.parse(env.disk()).house, plain(env.G.state.house));
    if (entry.name !== 'undo') {
      succeeds(env.G.sys.decorating.undo());
      assert.deepEqual(furnishings(env), beforeAction, entry.name + ' 重试只能增加一个真实撤销记录');
    }
    if (['moveOut', 'moveIn', 'remove'].includes(entry.name)) {
      const source = entry.name === 'moveIn' ? env.ordinaryId : atticId;
      succeeds(env.G.sys.decorating.undo());
      assert.deepEqual(plain(room(env, source).items.map(value => value.uid)), [env.group.parent], '下一步应撤销原台灯摆放，不能出现失败动作的多余记录');
      assert.equal(env.G.state.inventory.desk_lamp_basic, 1);
      succeeds(env.G.sys.decorating.undo());
      assert.equal(room(env, source).items.length, 0);
      assert.equal(env.G.state.inventory.nightstand_basic, 1);
    }
    refuses(env, () => env.G.sys.decorating.undo());
  }
});

test('阁楼持久提交的同步事件重入不能重复消费库存或压入额外撤销', () => {
  const env = built(), { G } = env, nested = [], events = watch(G);
  const stopCommit = G.bus.on('save:committed', () => nested.push(G.sys.decorating.place('bed_basic', atticId, 30, 90)));
  const stopChange = G.bus.on('state:change', () => nested.push(G.sys.decorating.place('desk_lamp_basic', env.ordinaryId, 30, 90)));
  const placed = G.sys.decorating.place('bed_basic', atticId, 10, 90);
  stopCommit(); stopChange(); events.close(); succeeds(placed);
  assert.equal(nested.length, 2); assert.equal(nested.every(result => result?.ok === false), true);
  assert.equal(room(env).items.length, 1); assert.equal(item(env, placed.uid).defId, 'bed_basic');
  assert.equal(room(env, env.ordinaryId).items.length, 0); assert.equal(G.state.inventory.bed_basic, 0);
  assert.equal(G.state.inventory.desk_lamp_basic, 1, '普通房重入也不能消费另一份真实库存');
  assert.equal(events.list.filter(name => name === 'save:committed').length, 1);
  assert.equal(events.list.filter(name => name === 'item:placed').length, 1);
  succeeds(G.sys.decorating.undo()); refuses(env, () => G.sys.decorating.undo());
});

test('写入租约拒绝也不能绕过阁楼原子事务，恢复写权限后原操作可重试', () => {
  const env = built(), { G } = env;
  G.store.setWriteGuard(() => ({ ok: false, message: '合成夹具：另一页正在写入' }));
  refuses(env, () => G.sys.decorating.place('bed_basic', atticId, 10, 90));
  G.store.setWriteGuard(null);
  succeeds(G.sys.decorating.place('bed_basic', atticId, 10, 90));
  assert.equal(room(env).items.length, 1); assert.equal(G.state.inventory.bed_basic, 0);
});

test('失败恢复保留阁楼选择与undo；成功恢复先写盘，再清运行态和真实摄影缓存', () => {
  const env = built(), { G } = env;
  const bed = succeeds(G.sys.decorating.place('bed_basic', atticId, 10, 90));
  G.runtime.mode = 'decorate'; G.runtime.activeRoomId = atticId;
  G.runtime.placing = 'desk_lamp_basic'; G.runtime.selected = { roomId: atticId, uid: bed.uid };
  // 仅是运行态缓存标记，不包含相片或图像数据；清理由真实photography监听完成。
  G.runtime.latestPhoto = { fixture: 'old-archive' };
  assert.ok(G.save.flush());
  const targetEnv = sandbox(), target = plain(targetEnv.G.state);
  env.reject(true); refuses(env, () => G.save.restore(env.into(target), { source: 'local' })); env.reject(false);
  succeeds(G.sys.decorating.undo());
  assert.equal(room(env).items.length, 0, '拒写恢复不能清掉旧阁楼undo');
  succeeds(G.sys.decorating.place('bed_basic', atticId, 10, 90));
  G.runtime.selected = { roomId: atticId, uid: room(env).items[0].uid };
  const before = snapshot(env), observed = [], events = watch(G);
  env.observeWrite((key, json) => { if (key === G.data.balance.saveKey) observed.push({ object: G.state, json: JSON.stringify(G.state), runtime: JSON.stringify(G.runtime), saved: JSON.parse(json) }); });
  const result = G.save.restore(env.into(target), { source: 'local' });
  env.observeWrite(null); events.close(); succeeds(result);
  assert.equal(observed.length, 1); assert.equal(observed[0].object, before.object);
  assert.equal(observed[0].json, before.json); assert.equal(observed[0].runtime, before.runtime);
  assert.equal(observed[0].saved.house.attic, null);
  assert.equal(events.list.filter(name => name === 'state:replace').length, 1);
  assert.equal(G.state.house.attic, null); assert.equal(G.runtime.mode, 'explore');
  assert.equal(G.runtime.selected, null); assert.equal(G.runtime.placing, null); assert.equal(G.runtime.activeRoomId, null);
  assert.equal(G.runtime.latestPhoto, undefined);
  assert.equal(G.store.decorRoom(G.state, atticId), null);
  refuses(env, () => G.sys.decorating.undo());
});

test('布置后的观星仍由原持久事务发3碎片，拒写/重复/白天/回拨不改变家具', () => {
  const env = built(), { G } = env;
  succeeds(G.sys.decorating.place('bed_basic', atticId, 10, 90));
  const furnishing = plain(room(env)), inventory = plain(G.state.inventory), claimed = claims(G), coin = G.state.wallet.coin;
  env.reject(true); refuses(env, () => G.sys.observatory.observe()); env.reject(false);
  succeeds(G.sys.observatory.observe());
  assert.equal(G.state.observatory.fragments, 3); assert.equal(G.state.observatory.observations, 1);
  refuses(env, () => G.sys.observatory.observe());
  env.at('2026-10-29'); assert.equal(G.sys.observatory.status().clockBehind, true);
  refuses(env, () => G.sys.observatory.observe());
  G.store.update(state => { state.settings.dayMode = 'real'; });
  env.at('2026-10-31', 12); assert.equal(G.sys.observatory.status().night, false);
  refuses(env, () => G.sys.observatory.observe());
  env.at('2026-10-31', 0); succeeds(G.sys.observatory.observe());
  assert.equal(G.state.observatory.fragments, 6); assert.equal(G.state.observatory.observations, 2);
  assert.equal(G.state.observatory.lastDate, '2026-10-31');
  assert.deepEqual(plain(room(env)), furnishing); assert.deepEqual(plain(G.state.inventory), inventory);
  assert.deepEqual(claims(G), claimed); assert.equal(G.state.wallet.coin, coin);
  assert.deepEqual(JSON.parse(env.disk()).observatory, plain(G.state.observatory));
});

(async () => {
  for (const entry of tests) {
    environments = [];
    await entry.fn();
    for (const env of environments) assert.deepEqual(env.eventErrors, [], '产品事件处理不能静默抛错');
    console.log('✓ ' + entry.name);
  }
  console.log('\n' + tests.length + ' 组 MC-079 合成数据/真实规则检查通过；不替代场景、界面、摄影像素或浏览器验收。');
})().catch(error => { console.error(error); process.exitCode = 1; });
