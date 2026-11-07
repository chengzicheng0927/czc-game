'use strict';

// 真实schema、生活规则与内存localStorage；不监听端口，不读玩家存档，不宣称浏览器视觉验收。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const { sampleBuilding } = require('./fixtures/building-save.cjs');
const root = path.resolve(__dirname, '..'), key = 'marshmallow_cottage_save_v1';
const plain = value => JSON.parse(JSON.stringify(value));
function sandbox(level = 30, coin = 3000) {
  let denied = false, serial = 0, clock = new Date(2026, 9, 29, 21).getTime();
  const memory = new Map(), RealDate = Date;
  class TestDate extends RealDate { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const context = vm.createContext({ console, Date: TestDate, Blob, URL, TextEncoder,
    setTimeout: () => ++serial, clearTimeout() {}, setInterval: () => ++serial, clearInterval() {},
    document: { hidden: false, addEventListener() {} } });
  context.window = context; context.addEventListener = () => {};
  context.localStorage = { getItem: name => memory.get(name) || null, setItem(name, value) { if (denied) throw new Error('QuotaExceededError'); memory.set(name, String(value)); }, removeItem: name => memory.delete(name) };
  const files = [...fs.readFileSync(path.join(root, 'index.html'), 'utf8').matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(match => match[1].split('?')[0]);
  const core = new Set(['js/core/namespace.js', 'js/core/utils.js', 'js/core/bus.js', 'js/building/schema.js', 'js/core/store.js', 'js/core/save.js', 'js/core/content-spaces.js', 'js/ui/minigames.js']);
  for (const file of files.filter(file => core.has(file) || file.startsWith('js/data/') || file.startsWith('js/systems/'))) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  const G = context.Game, api = context.CottageBuilding;
  assert.ok(api && G.contentSpaces && G.sys.observatory && G.ui.minigames);
  G.store.init(); G.save.init();
  G.store.update(state => { state.level = level; state.wallet.coin = coin; state.settings.dayMode = 'night'; }, { persist: true });
  return { G, api, memory, deny(value) { denied = value; }, setTime(value) { clock = value; } };
}
function addFurniture(env, defId, uid, x = 0, z = 0) {
  const { G, api } = env;
  if (!(G.state.inventory[defId] > 0)) { const bought = G.sys.economy.buy(defId); assert.ok(bought.ok, bought.message); }
  G.store.update(state => {
    state.inventory[defId]--;
    state.building = api.executeCommand(state.building, { type: 'furniture.add', furniture: { id: uid, defId, floorId: state.building.floors[0].id,
      position: { x, y: 0, z }, rotation: 0, dimensions: api.furnitureDimensions(G.data.furnitureById[defId]) } }, G.data.furnitureById);
  }, { persist: true });
}
function archiveRoom(type) { return { type, paidPrice: 0, wallpaper: { pattern: 'solid', color: '#FFE3C9', color2: '#FFFFFF' }, floor: { pattern: 'wood', color: '#EED7B9' }, light: 'warm', items: [] }; }
function installSample(env) {
  env.G.store.update(state => { state.inventory.bed_basic--; state.building = sampleBuilding(env.api, env.G.data.furnitureById); }, { persist: true });
}
function unchanged(env, before) { assert.equal(env.G.state, before.object); assert.equal(JSON.stringify(env.G.state), before.json); assert.equal(env.memory.get(key), before.disk); }
const snapshot = env => ({ object: env.G.state, json: JSON.stringify(env.G.state), disk: env.memory.get(key) });

(async () => {
  let count = 0;
  const check = async (name, run) => { await run(); count++; console.log('✓ ' + name); };
  await check('温室、厨房、音乐室、工坊和画室只认新闭合空间中的实际家具', () => {
    const env = sandbox(), { G } = env; installSample(env);
    G.store.update(state => {
      state.house.rooms = { archived_greenhouse: archiveRoom('greenhouse'), archived_music: archiveRoom('music'), archived_workshop: archiveRoom('workshop') };
      state.house.rooms.archived_greenhouse.items = [{ uid: 'save_bed', defId: 'bed_basic', x: 15, y: 130, z: 1, flip: false, color: null, parent: null, depth: .75 }];
      state.house.floors = [{ slots: ['archived_greenhouse', 'archived_music', 'archived_workshop'] }];
      state.garden.harvest.strawberry = 4;
    }, { persist: true });
    const archive = JSON.stringify(G.state.house);
    assert.equal(G.sys.garden.hasGreenhouse(), false); assert.equal(G.sys.crafting.status('strawberry_deluxe').hasRoom, false);
    assert.equal(G.sys.concert.status().roomIds.length, 0); assert.equal(G.ui.minigames.catalog().find(game => game.id === 'bakery').locked, true);
    assert.equal(G.sys.creative.status().hasStudio, false);
    const roomId = G.contentSpaces.list()[0].id; assert.ok(G.sys.residents.invite('lily', roomId).ok);
    addFurniture(env, 'potted_plant_basic', 'life_plant', -1, -1); addFurniture(env, 'stove_basic', 'life_stove', 1, -1);
    addFurniture(env, 'piano_basic', 'life_piano', 1, 1); addFurniture(env, 'easel_basic', 'life_easel', -1, 1);
    assert.equal(G.sys.garden.hasGreenhouse(), true); assert.equal(G.sys.crafting.status('strawberry_deluxe').hasRoom, true);
    assert.equal(G.sys.concert.status().canStart, true); assert.equal(G.ui.minigames.catalog().find(game => game.id === 'bakery').locked, false);
    assert.equal(G.sys.creative.status().hasStudio, true);
    const performance = G.sys.concert.begin(roomId); assert.ok(performance.ok);
    G.store.update(state => {
      for (const item of state.building.furniture.filter(value => value.id !== 'save_bed')) {
        state.building = env.api.executeCommand(state.building, { type: 'entity.remove', id: item.id }, G.data.furnitureById);
        state.inventory[item.defId] = (state.inventory[item.defId] || 0) + 1;
      }
    }, { persist: true });
    assert.equal(G.sys.garden.hasGreenhouse(), false); assert.equal(G.sys.crafting.status('strawberry_deluxe').hasRoom, false);
    assert.equal(G.sys.concert.advance(performance.sessionId).ok, false); assert.equal(G.ui.minigames.catalog().find(game => game.id === 'bakery').locked, true);
    assert.equal(G.sys.creative.status().hasStudio, false); assert.equal(JSON.stringify(G.state.house), archive);
    assert.equal(G.sys.collectionBook.get('furniture', 'bed_basic').count, 1, '背包+新建筑计数不重复加归档家具');
  });
  await check('真实温室效果作用于新播种时间，房间摄影资格和参数来自新空间', () => {
    const env = sandbox(), { G } = env; installSample(env); addFurniture(env, 'potted_plant_basic', 'garden_plant');
    const crop = G.data.crops[0]; G.store.update(state => { state.garden.seeds[crop.id] = 3; });
    assert.ok(G.sys.garden.plant(0, crop.id).ok);
    assert.equal(G.state.garden.plots[0].durationMs, Math.round(crop.growMs / 1.2));
    const roomId = G.contentSpaces.list()[0].id, captures = [];
    // 这里只核对资格和宿主调用参数，不把Canvas替身当成照片或像素验收。
    G.render = { captureScene(settings) { captures.push(plain(settings)); return { width: 8, height: 6 }; } };
    assert.ok(G.sys.photography.prepare({ scope: 'room', roomId }).ok);
    assert.deepEqual(captures, [{ scope: 'room', roomId }]);
    assert.equal(G.sys.photography.prepare({ scope: 'room', roomId: 'missing_room' }).ok, false);
  });
  await check('观星购买真实增加新楼层与四墙，同次落盘扣款，拒写无建筑或成功事件', () => {
    const env = sandbox(17), { G } = env, archive = JSON.stringify(G.state.house);
    let events = 0; G.bus.on('observatory:built', () => events++);
    const before = snapshot(env); env.deny(true);
    assert.equal(G.sys.observatory.build().ok, false); unchanged(env, before); assert.equal(events, 0);
    env.deny(false); const result = G.sys.observatory.build(); assert.ok(result.ok, result.message);
    assert.equal(result.floorId, 'observatory_floor'); assert.equal(G.state.observatory.built, true); assert.equal(G.state.wallet.coin, 2000);
    assert.ok(G.state.building.floors.some(floor => floor.id === result.floorId));
    assert.equal(G.state.building.walls.filter(wall => wall.floorId === result.floorId).length, 4);
    assert.equal(env.api.deriveSpaces(G.state.building, result.floorId).length, 1);
    assert.equal(JSON.stringify(G.state.house), archive); assert.equal(events, 1);
    assert.equal(G.sys.observatory.build().ok, false); assert.equal(G.state.wallet.coin, 2000); assert.equal(events, 1);
    assert.deepEqual(JSON.parse(env.memory.get(key)).building, plain(G.state.building));
  });
  await check('新观星所有权支持夜晚每日一次，拒写不发奖，回拨不补领', () => {
    const env = sandbox(17), { G } = env; assert.ok(G.sys.observatory.build().ok);
    let events = 0; G.bus.on('observatory:observed', () => events++);
    G.store.update(state => { state.settings.dayMode = 'day'; }, { persist: true });
    assert.equal(G.sys.observatory.observe().ok, false);
    G.store.update(state => { state.settings.dayMode = 'night'; }, { persist: true });
    const before = snapshot(env); env.deny(true);
    assert.equal(G.sys.observatory.observe().ok, false); unchanged(env, before); assert.equal(events, 0);
    env.deny(false); assert.ok(G.sys.observatory.observe().ok);
    assert.equal(G.state.observatory.fragments, 3); assert.equal(G.state.observatory.observations, 1); assert.equal(events, 1);
    assert.equal(G.sys.observatory.observe().ok, false); assert.equal(events, 1);
    env.setTime(new Date(2026, 9, 28, 21).getTime()); assert.equal(G.sys.observatory.status().clockBehind, true); assert.equal(G.sys.observatory.observe().ok, false);
    env.setTime(new Date(2026, 9, 30, 21).getTime()); assert.ok(G.sys.observatory.observe().ok);
    assert.equal(G.state.observatory.fragments, 6); assert.equal(G.state.observatory.observations, 2); assert.equal(events, 2);
    assert.equal(G.state.house.attic, null, '观星记录不要求回写旧阁楼凭据');
  });
  await check('合法旧阁楼只迁移一次所有权，使用legacy_attic真实楼层而不二次收费', () => {
    const env = sandbox(17), { G } = env, legacy = plain(G.state);
    delete legacy.building; delete legacy.observatory.built;
    legacy.house.attic = { type: 'observatory', paidPrice: 1000, builtAt: 1234, room: plain(G.store.newAtticRoom()) };
    const archive = JSON.stringify(legacy.house), checked = G.store.validate(legacy); G.store.init(checked);
    const status = G.sys.observatory.status();
    assert.equal(status.owned, true); assert.equal(status.built, true); assert.equal(status.floorId, 'legacy_attic'); assert.equal(status.canBuild, false);
    assert.equal(G.state.wallet.coin, 3000); assert.equal(JSON.stringify(G.state.house), archive);
    assert.ok(G.sys.observatory.observe().ok); assert.equal(JSON.stringify(G.state.house), archive);
    assert.equal(G.store.validate(G.state).observatory.built, true);
    const bad = plain(G.state); bad.observatory.built = 'true'; assert.throws(() => G.store.validate(bad));
  });
  await check('已购但缺观星楼层的导入档保留星空记录，可免费重建且失败不丢所有权', () => {
    const env = sandbox(17, 0), { G } = env;
    G.store.update(state => { state.observatory = { built: true, fragments: 3, observations: 1, lastDate: '2026-10-28', lastDiscovery: { id: G.data.constellations[0].id, at: new Date(2026, 9, 28, 21).getTime(), date: '2026-10-28', fragments: 3 } }; }, { persist: true });
    const history = plain(G.state.observatory);
    const before = snapshot(env), state = G.sys.observatory.status();
    assert.equal(state.needsRebuild, true); assert.equal(state.canBuild, true); assert.equal(state.canObserve, false); assert.equal(state.price, 0);
    assert.equal(G.sys.observatory.observe().ok, false); env.deny(true);
    assert.equal(G.sys.observatory.build().ok, false); unchanged(env, before); env.deny(false);
    assert.ok(G.sys.observatory.build().ok); assert.equal(G.state.wallet.coin, 0); assert.equal(G.state.observatory.built, true);
    assert.deepEqual(plain(G.state.observatory), history);
    assert.equal(G.sys.observatory.status().built, true); assert.equal(G.state.house.attic, null);
  });
  console.log(count + ' 组新建筑生活规则与观星持久化检查通过。');
})().catch(error => { console.error(error); process.exitCode = 1; });
