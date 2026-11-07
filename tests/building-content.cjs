'use strict';

// 真实加载清单、建筑schema和生活规则；只替代浏览器存储与时钟，不启动UI/网络或读取玩家数据。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'scripts/legacy-assets.json'), 'utf8'));
const core = new Set(['js/core/namespace.js', 'js/core/utils.js', 'js/core/bus.js', 'js/building/schema.js', 'js/core/store.js', 'js/core/save.js', 'js/core/content-spaces.js']);
const files = manifest.filter(file => core.has(file) || file.startsWith('js/data/') || file.startsWith('js/systems/'));
for (const file of core) assert.ok(files.includes(file), '实际清单缺少内容依赖：' + file);
assert.ok(files.indexOf('js/building/schema.js') < files.indexOf('js/core/store.js'));
const plain = value => JSON.parse(JSON.stringify(value));

function sandbox() {
  let clock = new Date(2026, 10, 7, 12).getTime(), denied = false, sequence = 0;
  const memory = new Map(), writes = [], downloads = [], RealDate = Date;
  class TestDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
  }
  const context = vm.createContext({ console, Blob, URL, TextEncoder, Date: TestDate,
    performance: { now: () => clock },
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
    document: { hidden: false, addEventListener() {}, getElementById() { return null; } } });
  context.window = context; context.addEventListener = () => {};
  context.localStorage = {
    getItem: key => memory.has(key) ? memory.get(key) : null,
    removeItem: key => memory.delete(key),
    setItem(key, value) { if (denied) throw new Error('QuotaExceededError'); memory.set(key, String(value)); writes.push({ key, value: String(value) }); }
  };
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  const G = context.Game, schema = context.CottageBuilding;
  G.utils.download = (name, value, mime) => { downloads.push({ name, value, mime }); return true; };
  G.store.init(); G.sys.init(); G.save.init();
  return { G, schema, context, memory, writes, downloads,
    deny(value) { denied = value; }, now: () => clock, at(value) { clock = value; },
    id: prefix => prefix + '_' + (++sequence),
    fund(level = 7, coin = 10000) { G.store.update(state => { state.level = level; state.wallet.coin = coin; }, { persist: true }); }
  };
}
function successful(result) { assert.equal(result?.ok, true, result?.message || '真实规则应成功'); return result; }
function room(env, prefix = 'room', minX = -2, minZ = -2) {
  const floorId = env.G.state.building.floors[0].id;
  const points = [{ x: minX, z: minZ }, { x: minX + 4, z: minZ }, { x: minX + 4, z: minZ + 4 }, { x: minX, z: minZ + 4 }];
  env.G.store.update(state => {
    for (let index = 0; index < 4; index++) state.building = env.schema.executeCommand(state.building, { type: 'wall.add', wall: {
      id: prefix + '_wall_' + index, floorId, start: points[index], end: points[(index + 1) % 4], height: 2.8, thickness: .16, color: '#F4DDE7'
    } }, env.G.data.furnitureById);
  }, { persist: true });
  return env.G.contentSpaces.list().find(value => value.bounds.minX === minX && value.bounds.minZ === minZ);
}
function put(env, defId, x = 0, z = 0) {
  const G = env.G, definition = G.data.furnitureById[defId]; assert.ok(definition);
  if (!(G.state.inventory[defId] > 0)) successful(G.sys.economy.buy(defId));
  const entity = { id: env.id('content_item'), defId, floorId: G.state.building.floors[0].id,
    position: { x, y: 0, z }, rotation: 0, dimensions: env.schema.furnitureDimensions(definition) };
  G.store.update(state => {
    assert.ok(state.inventory[defId] > 0); state.inventory[defId]--;
    state.building = env.schema.executeCommand(state.building, { type: 'furniture.add', furniture: entity }, G.data.furnitureById);
  }, { persist: true });
  return entity;
}
const checks = [];
function test(name, run) { checks.push({ name, run }); }

test('保留407件家具、12位居民、60件服饰、12种作物和稳定内容ID', () => {
  const { G } = sandbox(), D = G.data;
  assert.equal(D.furniture.length, 407); assert.equal(D.residents.length, 12); assert.equal(D.outfits.length, 60); assert.equal(D.crops.length, 12);
  for (const list of [D.furniture, D.residents, D.outfits, D.crops]) assert.equal(new Set(list.map(value => value.id)).size, list.length);
  assert.deepEqual(plain(D.residents.map(value => value.id).sort()), ['lily', 'pudding', 'orange', 'mianmian', 'bobo', 'xingxing', 'lizi', 'yuanyuan', 'mimi', 'doudou', 'shirley', 'rainbow'].sort());
  assert.deepEqual(plain(D.crops.map(value => value.id)), ['daisy', 'tulip', 'strawberry', 'carrot', 'sunflower', 'rose', 'pumpkin', 'lavender', 'blueberry', 'sakura', 'rainbow_flower', 'star_fruit']);
  for (const id of ['bed_basic', 'nightstand_basic', 'desk_lamp_basic', 'bed_strawberry', 'stove_basic', 'easel_basic', 'potted_plant_basic', 'custom_art_frame']) assert.equal(D.furnitureById[id].id, id);
  assert.equal(D.outfitById.top_berry.price, 40); assert.equal(D.outfitById.dress_pink.source, 'starter');
  assert.equal(D.furniture.filter(value => !value.rewardOnly && !value.festivalId && value.place !== 'yard' && D.furnitureTemplateById[value.template]).length, 342);
});

test('全部内容具有独立合法米制尺寸，并能作为真实建筑实体通过schema', () => {
  const { G, schema } = sandbox();
  for (const definition of Object.values(G.data.furnitureById)) {
    const dimensions = schema.furnitureDimensions(definition);
    for (const value of Object.values(dimensions)) assert.ok(Number.isFinite(value) && value >= .01 && value <= 30, definition.id);
    const document = schema.executeCommand(schema.createEmptyDocument(), { type: 'furniture.add', furniture: {
      id: 'dimension_check', defId: definition.id, floorId: 'floor_0', position: { x: 0, y: 0, z: 0 }, rotation: Math.PI / 6, dimensions,
      ...(definition.customArt ? { artId: 'dimension_art' } : {})
    } }, G.data.furnitureById);
    assert.equal(document.furniture[0].defId, definition.id);
  }
  assert.deepEqual(plain(schema.furnitureDimensions({ id: 'a', template: 'bed', w: 1, h: 999 })), plain(schema.furnitureDimensions({ id: 'b', template: 'bed', w: 900, h: 2 })));
});

test('真实购买同时保护糖果和库存；余额、锁定、未知ID与真实拒写均无成功副作用', () => {
  const env = sandbox(), { G } = env, bought = [];
  G.bus.on('item:bought', value => bought.push(value));
  const quote = G.sys.deals.priceFor('bed_strawberry'), coin = G.state.wallet.coin;
  successful(G.sys.economy.buy('bed_strawberry', quote));
  assert.equal(G.state.wallet.coin, coin - quote); assert.equal(G.state.inventory.bed_strawberry, 1); assert.equal(bought.length, 1);
  const beforeDenied = JSON.stringify(G.state), disk = env.memory.get(G.data.balance.saveKey);
  env.deny(true); assert.equal(G.sys.economy.buy('bed_strawberry', quote).ok, false);
  assert.equal(JSON.stringify(G.state), beforeDenied); assert.equal(env.memory.get(G.data.balance.saveKey), disk); assert.equal(bought.length, 1);
  env.deny(false);
  for (const id of ['__proto__', 'missing_furniture', 'resident_lily_gift', 'bed_princess']) {
    const before = JSON.stringify(G.state); assert.equal(G.sys.economy.buy(id).ok, false); assert.equal(JSON.stringify(G.state), before);
  }
  G.store.update(state => { state.wallet.coin = 0; });
  const poor = JSON.stringify(G.state); assert.equal(G.sys.economy.buy('bed_strawberry').ok, false); assert.equal(JSON.stringify(G.state), poor);
});

test('闭合墙与实际家具决定厨房、温室和画室，不购买旧房间也不改迁移来源', () => {
  const env = sandbox(), { G } = env; env.fund(14);
  const archive = JSON.stringify(G.state.house), kitchen = room(env, 'kitchen'); put(env, 'stove_basic');
  assert.ok(G.contentSpaces.isType(G.contentSpaces.get(kitchen.id), 'kitchen'));
  const studio = room(env, 'studio', 5, -2); put(env, 'easel_basic', 7, 0);
  assert.ok(G.contentSpaces.isType(G.contentSpaces.get(studio.id), 'studio')); assert.equal(G.sys.creative.status().unlocked, true);
  const greenhouse = room(env, 'greenhouse', -2, 5); put(env, 'potted_plant_basic', 0, 7);
  assert.ok(G.contentSpaces.isType(G.contentSpaces.get(greenhouse.id), 'greenhouse'));
  assert.equal(JSON.stringify(G.state.house), archive); assert.equal(Object.keys(G.state.house.rooms).length, 0);
});

test('三消初盘可玩、翻牌和接星纯规则保留，结算凭证防止重复发奖', () => {
  const { G } = sandbox(), mini = G.sys.minigames;
  let seed = 7; const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const board = mini.rules.createBoard(7, 6, random);
  assert.equal(board.length, 49); assert.equal(mini.rules.matches(board, 7).length, 0); assert.ok(mini.rules.findMove(board, 7));
  assert.equal(mini.rules.memoryStars(6, 12, 18, true), 3);
  assert.equal(mini.rules.memoryStars(6, 12, 18, false), 1, '提前结束的翻牌不按完整通关发三星');
  const rainbow = mini.rules.catchEffect('rainbow', 2, { score: 0, doubleUntil: 0, wetUntil: 0 });
  assert.equal(rainbow.points, 50); assert.equal(rainbow.doubleUntil, 7);
  const next = mini.rules.catchEffect('star', 3, rainbow); assert.equal(next.points, 20); assert.equal(next.score, 70);
  const before = JSON.stringify(G.state); assert.equal(mini.finish('match3', { sessionId: 'forged', score: 1800, stars: 3 }).ok, false); assert.equal(JSON.stringify(G.state), before);
  const id = mini.begin('match3'), coin = G.state.wallet.coin, exp = G.state.exp, events = [];
  G.bus.on('minigame:finished', event => events.push(event));
  successful(mini.finish('match3', { sessionId: id, score: 1800, stars: 3 }));
  assert.equal(G.state.wallet.coin, coin + 100); assert.equal(G.state.exp, exp + 30); assert.equal(G.state.minigames.match3.playsToday, 1);
  const completed = JSON.stringify(G.state);
  for (let repeat = 0; repeat < 3; repeat++) assert.equal(mini.finish('match3', { sessionId: id, score: 1800, stars: 3 }).duplicate, true);
  assert.equal(JSON.stringify(G.state), completed); assert.equal(events.length, 1);
});

test('四款小游戏各自累计每日次数，第六局减半而不影响另一款首局', () => {
  const { G } = sandbox(), mini = G.sys.minigames;
  for (let count = 0; count < 6; count++) {
    const result = successful(mini.finish('memory', { sessionId: mini.begin('memory'), score: 600, stars: 3 }));
    assert.equal(result.half, count >= 5); assert.equal(result.coin, count >= 5 ? 50 : 100);
  }
  const other = successful(mini.finish('catch_stars', { sessionId: mini.begin('catch_stars'), score: 1000, stars: 3 }));
  assert.equal(other.half, false); assert.equal(other.coin, 100); assert.equal(G.state.minigames.memory.playsToday, 6); assert.equal(G.state.minigames.catch_stars.playsToday, 1);
});

test('实际播种扣种子，三段浇水仅缩短当前剩余时间，收获拒写和重复收获均受保护', () => {
  const env = sandbox(), { G } = env, garden = G.sys.garden; env.fund(6, 300);
  const start = env.now(); successful(garden.plant(0, 'daisy')); assert.equal(G.state.garden.seeds.daisy, 2);
  const planted = JSON.stringify(G.state); assert.equal(garden.plant(0, 'daisy').ok, false); assert.equal(JSON.stringify(G.state), planted);
  env.at(start + 15000); successful(garden.water(0)); assert.equal(garden.timeline(G.state.garden.plots[0]).stages[0].endAt, start + 18500);
  const watered = JSON.stringify(G.state); assert.equal(garden.water(0).ok, false); assert.equal(JSON.stringify(G.state), watered);
  env.at(start + 20000); successful(garden.water(0)); assert.equal(garden.timeline(G.state.garden.plots[0]).stages[1].endAt, start + 32950);
  env.at(start + 40000); successful(garden.water(0)); assert.equal(garden.status(0).matureAt, start + 49065);
  env.at(start + 49064); assert.equal(garden.harvest(0).ok, false);
  env.at(start + 49065); const before = JSON.stringify(G.state), harvests = G.state.quests.stats.harvests, experience = G.state.exp;
  env.deny(true); assert.equal(garden.harvest(0).ok, false); assert.equal(JSON.stringify(G.state), before);
  env.deny(false); successful(garden.harvest(0)); assert.equal(G.state.garden.plots[0], null); assert.equal(G.state.garden.harvest.daisy, 1); assert.equal(G.state.exp, experience + 3); assert.equal(G.state.quests.stats.harvests, harvests + 1);
  const harvested = JSON.stringify(G.state); assert.equal(garden.harvest(0).ok, false); assert.equal(JSON.stringify(G.state), harvested);
  const coin = G.state.wallet.coin; successful(garden.sell('daisy', 1)); assert.equal(G.state.wallet.coin, coin + 12); assert.equal(G.sys.collectionBook.get('crops', 'daisy').collected, true);
  const empty = JSON.stringify(G.state); assert.equal(garden.sell('daisy', 1).ok, false); assert.equal(JSON.stringify(G.state), empty);
});

test('真实新空间内的温室家具加速后播种，不回写旧house，也不追改既有时间线', () => {
  const env = sandbox(), { G } = env, garden = G.sys.garden; env.fund(14, 2000); garden.init();
  successful(garden.plant(0, 'daisy')); assert.equal(G.state.garden.plots[0].durationMs, 60000);
  const archive = JSON.stringify(G.state.house); room(env, 'actual_greenhouse'); put(env, 'potted_plant_basic');
  assert.equal(garden.hasGreenhouse(), true); successful(garden.plant(1, 'daisy'));
  assert.equal(G.state.garden.plots[1].durationMs, 50000); assert.equal(G.state.garden.plots[0].durationMs, 60000); assert.equal(JSON.stringify(G.state.house), archive);
  assert.equal(garden.capacity(), 9); assert.equal(G.state.garden.plots.length, 9);
});

test('星星果按真实夜间播种，画面设置不能绕过，非法购买数量不扣钱', () => {
  const env = sandbox(), { G } = env, garden = G.sys.garden; env.fund(6, 300);
  successful(garden.buySeeds('star_fruit', 1)); G.store.update(state => { state.settings.dayMode = 'night'; });
  const daytime = JSON.stringify(G.state); assert.equal(garden.plant(0, 'star_fruit').ok, false); assert.equal(JSON.stringify(G.state), daytime);
  env.at(new Date(2026, 10, 7, 20).getTime()); successful(garden.plant(0, 'star_fruit')); assert.equal(G.state.garden.seeds.star_fruit, 0);
  for (const count of [-1, 0, .5, NaN, Infinity, '1', 10000]) { const before = JSON.stringify(G.state); assert.equal(garden.buySeeds('daisy', count).ok, false); assert.equal(JSON.stringify(G.state), before); }
});

test('衣服先真实购买后穿搭，预设与搭配盒不赠送任何未拥有的付费服饰', () => {
  const { G } = sandbox(), avatar = G.sys.avatar, inventory = JSON.stringify(G.state.inventory), initialOwned = Object.keys(G.state.avatar.owned).sort();
  assert.equal(initialOwned.length, 5); assert.equal(avatar.equip('top_berry').ok, false);
  const coin = G.state.wallet.coin; successful(avatar.buy('top_berry')); assert.equal(G.state.wallet.coin, coin - 40); successful(avatar.equip('top_berry')); assert.equal(G.state.avatar.top, 'top_berry');
  assert.equal(avatar.buy('top_berry').ok, false); assert.equal(G.state.wallet.coin, coin - 40);
  successful(avatar.saveOutfit(0, '草莓散步')); const purchased = Object.keys(G.state.avatar.owned).sort();
  for (const preset of G.data.avatarPresets) successful(avatar.applyPreset(preset.id));
  assert.deepEqual(Object.keys(G.state.avatar.owned).sort(), purchased); successful(avatar.applyOutfit(0)); assert.equal(G.state.avatar.top, 'top_berry');
  assert.equal(JSON.stringify(G.state.inventory), inventory);
  const forged = plain(G.state.avatar); forged.outfits[0].top = 'top_coat'; assert.throws(() => G.data.validateAvatar(forged));
  G.store.update(state => { state.wallet.coin = 0; }); const poor = JSON.stringify(G.state); assert.equal(avatar.buy('bottom_denim').ok, false); assert.equal(JSON.stringify(G.state), poor);
});

test('收藏册读取真实新建筑家具且不重复计算来源，搜索翻页不写存档或泄露未收集名称', () => {
  const env = sandbox(), { G } = env, book = G.sys.collectionBook;
  room(env, 'collection'); put(env, 'bed_basic'); assert.equal(G.state.inventory.bed_basic, 0);
  assert.equal(book.get('furniture', 'bed_basic').count, 1, '建筑中仍保有那张床');
  assert.deepEqual(plain(book.summary().map(value => [value.id, value.total])), [['furniture', 407], ['residents', 12], ['crops', 12], ['outfits', 60]]);
  const before = JSON.stringify(G.state), unknown = book.get('furniture', 'sofa_princess');
  assert.equal(unknown.collected, false); assert.equal(unknown.name, '？？？'); assert.equal(book.list({ kind: 'furniture', query: unknown.definition.name }).total, 0);
  for (let page = 1; page < 22; page++) { const result = book.list({ kind: 'furniture', page }); assert.ok(result.items.length <= 24); assert.ok(result.page <= result.pages); }
  assert.equal(book.themes().length, 9); book.themes().forEach(value => assert.equal(value.total, 38));
  assert.equal(JSON.stringify(G.state), before);
});

test('作品保存、真实挂墙与墙纸同建筑事务落盘，删除引用不改旧来源或扣普通库存', () => {
  const env = sandbox(), { G } = env; env.fund(7, 2000);
  const studio = room(env, 'painting'); put(env, 'easel_basic');
  assert.equal(G.sys.creative.status().unlocked, true);
  const archive = JSON.stringify(G.state.house), inventory = JSON.stringify(G.state.inventory), events = [];
  G.bus.on('creative:changed', event => events.push(event));
  const art = successful(G.sys.creative.save({ name: '软软小云', pixels: '0' + '.'.repeat(255) })).art;
  const unplaced = JSON.stringify(G.state);
  env.deny(true); assert.equal(G.sys.creative.place(art.id, studio.id).ok, false); assert.equal(JSON.stringify(G.state), unplaced); assert.equal(events.filter(event => event.type === 'placed').length, 0);
  env.deny(false); const placed = successful(G.sys.creative.place(art.id, studio.id));
  const entity = G.state.building.furniture.find(item => item.id === placed.uid);
  assert.equal(entity.artId, art.id); assert.equal(entity.defId, G.data.creativeConfig.frameId); assert.ok(entity.position.y >= 0); assert.equal(G.sys.creative.placement(art.id).uid, placed.uid);
  assert.equal(G.sys.creative.place(art.id, studio.id).ok, false);
  const wallBefore = JSON.stringify(G.state); env.deny(true); assert.equal(G.sys.creative.wallpaper(studio.id, art.id).ok, false); assert.equal(JSON.stringify(G.state), wallBefore);
  env.deny(false); const paper = successful(G.sys.creative.wallpaper(studio.id, art.id)); assert.equal(paper.wallIds.length, 4); assert.equal(G.state.building.walls.filter(wall => wall.artId === art.id).length, 4);
  const beforeEditRevision = G.state.building.revision; successful(G.sys.creative.save({ id: art.id, name: art.name, pixels: '1' + '.'.repeat(255) }));
  assert.equal(G.state.building.revision, beforeEditRevision); assert.equal(G.state.building.furniture.find(item => item.id === placed.uid).artId, art.id);
  successful(G.sys.creative.rename(art.id, '莓红小云')); assert.equal(G.sys.creative.get(art.id).name, '莓红小云');
  const beforeDelete = JSON.stringify(G.state); env.deny(true); assert.equal(G.sys.creative.remove(art.id).ok, false); assert.equal(JSON.stringify(G.state), beforeDelete);
  env.deny(false); successful(G.sys.creative.remove(art.id));
  assert.equal(G.sys.creative.get(art.id), null); assert.equal(G.state.building.furniture.some(item => item.artId === art.id), false); assert.equal(G.state.building.walls.some(wall => wall.artId === art.id), false);
  assert.equal(JSON.stringify(G.state.house), archive); assert.equal(JSON.stringify(G.state.inventory), inventory); assert.equal(G.state.inventory[G.data.creativeConfig.frameId], undefined);
  for (const kind of ['placed', 'wallpaper']) { const event = events.find(value => value.type === kind); assert.ok(event.buildingBefore && event.buildingAfter && event.label); assert.ok(event.buildingAfter.revision > event.buildingBefore.revision); }
  assert.equal(events.filter(event => event.type === 'removed').length, 1);
  const persisted = JSON.parse(env.memory.get(G.data.balance.saveKey)); assert.equal(persisted.customArts.length, 0); assert.deepEqual(persisted.building, plain(G.state.building));
});

test('画作拒绝错误像素、缺失实际墙和非法定位，读取作品返回独立副本', () => {
  const env = sandbox(), { G } = env; env.fund(7, 2000); const studio = room(env, 'invalid_art'); put(env, 'easel_basic');
  for (const pixels of ['', '.'.repeat(255), 'z'.repeat(256)]) { const before = JSON.stringify(G.state); assert.equal(G.sys.creative.save({ name: '小画', pixels }).ok, false); assert.equal(JSON.stringify(G.state), before); }
  const art = successful(G.sys.creative.save({ name: '小画', pixels: '.'.repeat(256) })).art;
  const returned = G.sys.creative.get(art.id); returned.name = '不能改原件'; assert.equal(G.sys.creative.get(art.id).name, '小画');
  const before = JSON.stringify(G.state); assert.equal(G.sys.creative.place(art.id, 'missing_wall').ok, false); assert.equal(G.sys.creative.wallpaper('missing_wall', art.id).ok, false); assert.equal(G.sys.creative.place(art.id, studio.id, 120).ok, false); assert.equal(JSON.stringify(G.state), before);
});

(async () => {
  for (const check of checks) { await check.run(); console.log('✓ ' + check.name); }
  console.log(checks.length + ' 组新建筑与完整生活内容检查通过（隔离VM，无真实存档、网络或监听）。');
})().catch(error => { console.error(error); process.exitCode = 1; });
