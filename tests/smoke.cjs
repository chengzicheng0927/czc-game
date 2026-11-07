'use strict';
// 不依赖浏览器或第三方包，测试真实模块的可恢复状态与经济不变量。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const files = ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/garden.js', 'js/core/utils.js', 'js/core/bus.js', 'js/core/store.js', 'js/core/save.js', 'js/systems/systems.js'];
let passed = 0;
function sandbox(storageInit = {}, denyStorage = false) {
  const storage = new Map(Object.entries(storageInit));
  let sequence = 0;
  const timers = new Map();
  const context = vm.createContext({ console, Blob, URL, setTimeout: (fn) => { timers.set(++sequence, fn); return sequence; }, clearTimeout: id => timers.delete(id), setInterval: () => ++sequence, clearInterval() {}, document: { addEventListener() {} } });
  context.window = context;
  context.addEventListener = () => {};
  context.localStorage = { getItem(key) { if (denyStorage) throw new Error('denied'); return storage.get(key) || null; }, setItem(key, val) { if (denyStorage) throw new Error('denied'); storage.set(key, String(val)); } };
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  const G = context.Game;
  const downloads = [];
  G.utils.download = (name, value, type) => downloads.push({ name, value, type });
  G.store.init(G.save.load());
  G.sys.init();
  return { G, storage, context, downloads, parse: value => vm.runInContext('JSON.parse(' + JSON.stringify(JSON.stringify(value)) + ')', context) };
}
async function test(name, fn) {
  await fn(); passed++; console.log('✓ ' + name);
}
async function run() {
  await test('初始状态、内容和首间免费卧室，不可重复建造/拆除刷币', () => {
    const { G } = sandbox();
    assert.equal(G.state.wallet.coin, 300); assert.ok(G.data.furniture.length >= 40);
    assert.equal(new Set(G.data.furniture.map(d => d.id)).size, G.data.furniture.length);
    const room = G.sys.building.buildRoom(0, 0, 'bedroom'); assert.equal(room.ok, true); assert.equal(G.state.wallet.coin, 300);
    assert.equal(G.sys.building.buildRoom(0, 0, 'bedroom').ok, false);
    assert.equal(G.sys.building.demolishRoom(room.roomId).ok, true); assert.equal(G.state.wallet.coin, 300);
    G.sys.building.buildRoom(0, 0, 'bedroom'); assert.equal(G.state.wallet.coin, 200);
    assert.equal(G.sys.building.buildRoom(0, 2, 'kitchen').ok, false);
  });
  await test('四类摆放、台面跟随、整组收起与撤销保留后续购买', () => {
    const { G } = sandbox(); const roomId = G.sys.building.buildRoom(0, 0, 'bedroom').roomId;
    const bed = G.sys.decorating.place('bed_basic', roomId, 15, 50); assert.ok(bed.ok);
    let item = G.state.house.rooms[roomId].items.find(i => i.uid === bed.uid);
    assert.equal(item.y, G.data.balance.floorLine - G.data.furnitureById.bed_basic.h);
    const table = G.sys.decorating.place('nightstand_basic', roomId, 200, 30);
    const lamp = G.sys.decorating.place('desk_lamp_basic', roomId, 205, 125, table.uid); assert.ok(lamp.ok); assert.equal(lamp.parent, table.uid);
    const oldLampX = G.state.house.rooms[roomId].items.find(i => i.uid === lamp.uid).x;
    assert.ok(G.sys.decorating.move(roomId, table.uid, roomId, 220, 20).ok);
    assert.equal(G.state.house.rooms[roomId].items.find(i => i.uid === lamp.uid).x - oldLampX, 20);
    assert.ok(G.sys.decorating.remove(roomId, table.uid).ok);
    assert.equal(G.state.inventory.nightstand_basic, 1); assert.equal(G.state.inventory.desk_lamp_basic, 1);
    assert.ok(G.sys.economy.buy('vase_basic').ok); const paid = G.state.wallet.coin;
    assert.ok(G.sys.decorating.undo().ok); assert.equal(G.state.wallet.coin, paid); assert.equal(G.state.inventory.vase_basic, 1);
    assert.equal(G.state.house.rooms[roomId].items.filter(i => i.parent === table.uid).length, 1);
    for (const id of ['window_basic', 'ceiling_lamp_basic']) { assert.ok(G.sys.economy.buy(id).ok); assert.ok(G.sys.decorating.place(id, roomId, 70, 50).ok); }
    assert.equal(G.state.house.rooms[roomId].items.find(i => i.defId === 'ceiling_lamp_basic').y, G.data.balance.ceilingLine);
    assert.equal(G.sys.decorating.place('bed_basic', roomId, 0, 0).ok, false);
    const snapshot = JSON.stringify(G.state); assert.equal(G.sys.decorating.move(roomId, bed.uid, 'missing_room', 0, 0).ok, false); assert.equal(JSON.stringify(G.state), snapshot);
  });
  await test('调整家具层级会改变前后次序，地毯始终在底部', () => {
    const { G } = sandbox(); const rid = G.sys.building.buildRoom(0, 0, 'bedroom').roomId;
    const bed = G.sys.decorating.place('bed_basic', rid, 20, 40);
    const table = G.sys.decorating.place('nightstand_basic', rid, 20, 40);
    const item = uid => G.state.house.rooms[rid].items.find(i => i.uid === uid);
    assert.ok(item(bed.uid).z < item(table.uid).z);
    assert.ok(G.sys.decorating.layer(rid, bed.uid, 1).ok); assert.ok(item(bed.uid).z > item(table.uid).z);
    assert.ok(G.sys.decorating.layer(rid, bed.uid, -1).ok); assert.ok(item(bed.uid).z < item(table.uid).z);
    G.sys.economy.buy('rug_strawberry'); const rug = G.sys.decorating.place('rug_strawberry', rid, 30, 30);
    G.sys.decorating.layer(rid, rug.uid, 1); assert.ok(item(rug.uid).z < Math.min(item(bed.uid).z, item(table.uid).z));
  });
  await test('生日可留空，闰日可保存，无效月日拒绝且不改变状态', () => {
    const { G } = sandbox();
    G.store.update(s => { s.profile.birthday = ''; }); assert.equal(G.state.profile.birthday, ''); assert.ok(G.save.flush());
    G.store.update(s => { s.profile.birthday = '02-29'; }); assert.equal(G.state.profile.birthday, '02-29');
    const before = JSON.stringify(G.state);
    assert.throws(() => G.store.update(s => { s.profile.birthday = '04-31'; })); assert.equal(JSON.stringify(G.state), before);
  });
  await test('居民入住条件、每日摸摸上限、离线爱心与一次收取', () => {
    const { G } = sandbox(); const roomId = G.sys.building.buildRoom(0, 0, 'bedroom').roomId;
    assert.equal(G.sys.residents.eligibility('lily').ok, false);
    G.sys.decorating.place('bed_basic', roomId, 30, 100);
    assert.ok(G.sys.residents.invite('lily', roomId).ok); assert.equal(G.sys.residents.invite('lily', roomId).ok, false);
    assert.equal(G.sys.residents.eligibility('pudding').ok, false);
    for (let i = 0; i < 3; i++) assert.ok(G.sys.residents.pat('lily').ok);
    assert.equal(G.sys.residents.pat('lily').ok, false); assert.equal(G.state.residents.lily.affection, 15);
    G.store.update(s => { s.residents.lily.lastBubbleAt = Date.now() - 24 * 60 * 60 * 1000; });
    G.sys.residents.tick(Date.now()); assert.equal(G.state.residents.lily.heartBubbles, 3);
    assert.ok(G.sys.residents.collect('lily').ok); const hearts = G.state.wallet.heart; assert.ok(hearts > 0);
    assert.equal(G.sys.residents.collect('lily').ok, false); assert.equal(G.state.wallet.heart, hearts);
  });
  await test('任务依序领取且不可重复，经济不足不改变进度', () => {
    const { G } = sandbox(); G.store.update(s => { s.house.name = '甜甜云'; });
    assert.ok(G.sys.quests.claim('name_home').ok); const coins = G.state.wallet.coin;
    assert.equal(G.sys.quests.claim('name_home').ok, false); assert.equal(G.state.wallet.coin, coins);
    G.store.update(s => { s.wallet.coin = 0; }); const snapshot = JSON.stringify(G.state);
    assert.equal(G.sys.economy.buy('bed_strawberry').ok, false); assert.equal(JSON.stringify(G.state), snapshot);
    assert.equal(G.sys.economy.reward(-5, 0, 'invalid').ok, false);
  });
  await test('三位居民在真实解锁条件下均可入住', () => {
    const { G } = sandbox(); G.sys.economy.reward(3000, 1000, '测试准备'); assert.ok(G.state.level >= 7);
    const roomId = G.sys.building.buildRoom(0, 0, 'bedroom').roomId;
    G.sys.decorating.place('bed_basic', roomId, 10, 20); G.sys.residents.invite('lily', roomId);
    for (const id of ['bed_forest', 'nightstand_forest', 'potted_plant_forest']) { assert.ok(G.sys.economy.buy(id).ok); assert.ok(G.sys.decorating.place(id, roomId, 100, 100).ok); }
    assert.ok(G.sys.residents.invite('pudding', roomId).ok);
    G.sys.building.buildRoom(0, 1, 'studio');
    const bedroom2 = G.sys.building.buildRoom(0, 2, 'bedroom').roomId;
    assert.ok(G.sys.residents.invite('orange', bedroom2).ok);
    assert.equal(Object.values(G.state.residents).filter(r => r.movedIn).length, 3);
  });
  await test('JSON 导出、刷新载入和导入完整恢复；Markdown 回忆可读', async () => {
    const { G, storage, downloads } = sandbox(); const rid = G.sys.building.buildRoom(0, 0, 'bedroom').roomId;
    G.sys.decorating.place('bed_basic', rid, 30, 50); G.sys.residents.invite('lily', rid); G.sys.init();
    const json = G.save.exportJson(), snapshot = JSON.stringify(G.state);
    assert.equal(downloads.at(-1).type, 'application/json;charset=utf-8'); assert.ok(G.save.flush());
    const next = sandbox(Object.fromEntries(storage)); assert.equal(JSON.stringify(next.G.state), snapshot);
    G.save.reset(); assert.equal(Object.keys(G.state.house.rooms).length, 0);
    const result = await G.save.importFile({ size: json.length, text: async () => json }); assert.ok(result.ok);
    assert.equal(JSON.stringify(G.state), snapshot);
    const md = G.save.exportMemory(); assert.ok(md.includes('莉莉')); assert.ok(md.includes('原木小床')); assert.ok(md.includes('恢复游戏请使用 JSON 存档'));
  });
  await test('坏 JSON、未来版本、负金币、重复房间和原型字段均拒绝且不改变进度', async () => {
    const { G } = sandbox(); G.sys.building.buildRoom(0, 0, 'bedroom'); const original = JSON.stringify(G.state);
    const variants = ['{broken'];
    const future = JSON.parse(original); future.version = 99; variants.push(JSON.stringify(future));
    const negative = JSON.parse(original); negative.wallet.coin = -1; variants.push(JSON.stringify(negative));
    const duplicate = JSON.parse(original); duplicate.house.floors[0].slots[1] = duplicate.house.floors[0].slots[0]; variants.push(JSON.stringify(duplicate));
    variants.push(original.slice(0, -1) + ',"__proto__":{"polluted":true}}');
    for (const text of variants) { const result = await G.save.importFile({ text: async () => text, size: text.length }); assert.equal(result.ok, false); assert.equal(JSON.stringify(G.state), original); }
    assert.equal({}.polluted, undefined);
  });
  await test('损坏原文备份和存储被禁用时可继续游玩/导出', () => {
    const key = 'marshmallow_cottage_save_v1'; const broken = '{not valid';
    const { G, storage } = sandbox({ [key]: broken }); assert.ok(G.save.backupKey); assert.equal(storage.get(G.save.backupKey), broken); assert.equal(G.state.wallet.coin, 300);
    const denied = sandbox({}, true); assert.equal(denied.G.save.flush(), false); assert.match(denied.G.save.status, /导出/);
    assert.ok(denied.G.save.exportJson().includes('"version": 1'));
  });
  // 确保所有入口引用都是本地且存在；不对样式或源码细节做镜像断言。
  await test('离线入口的全部 script/css 均在项目内，所有脚本可解析', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"/g)].map(m => m[1].split("?")[0]);
    assert.ok(assets.length >= 40, "入口资源不应被校验规则漏掉");
    for (const asset of assets) { assert.ok(!/^https?:/.test(asset)); assert.ok(fs.existsSync(path.join(root, asset)), asset); if (asset.endsWith('.js')) new vm.Script(fs.readFileSync(path.join(root, asset), 'utf8'), { filename: asset }); }
  });
  console.log('\n' + passed + ' 个场景全部通过。');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
