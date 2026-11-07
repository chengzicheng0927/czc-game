'use strict';
// 只加载本地真实规则；由root串行执行，不启动页面、浏览器或服务。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const files = ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/furniture-expansion.js', 'js/data/residents-expansion.js', 'js/data/garden.js', 'js/data/calendar.js', 'js/data/outfits.js', 'js/data/exterior.js', 'js/data/yard.js', 'js/data/minigames.js', 'js/core/utils.js', 'js/core/bus.js', 'js/core/store.js', 'js/core/save.js', 'js/systems/systems.js', 'js/systems/minigames.js', 'js/systems/avatar.js', 'js/systems/garden.js', 'js/systems/time.js', 'js/systems/resident-wishes.js'];
function sandbox(saved) {
  let clock = new Date(2026, 9, 28, 12).getTime(); const RealDate = Date;
  class TestDate extends RealDate { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const context = vm.createContext({ console, Blob, URL, Date: TestDate, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, document: { addEventListener() {} } }); context.window = context; context.addEventListener = () => {}; context.localStorage = { getItem: () => null, setItem() {} };
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  const G = context.Game, parse = value => vm.runInContext('JSON.parse(' + JSON.stringify(JSON.stringify(value)) + ')', context); G.store.init(saved ? parse(saved) : undefined); G.sys.init();
  return { G, parse, at: (date, hour = 12) => { const p = date.split('-').map(Number); clock = new Date(p[0], p[1] - 1, p[2], hour).getTime(); }, clock: () => clock };
}
function only(G, type, id = 'lily') { const resident = G.data.residents.find(value => value.id === id), selected = resident.wishes.find(wish => wish.type === type); assert.ok(selected, type); resident.wishes = [selected]; return selected; }
function inviteLily(G) { const roomId = G.sys.building.buildRoom(0, 0, 'bedroom').roomId; assert.ok(G.sys.decorating.place('bed_basic', roomId, 10, 80).ok); assert.ok(G.sys.residents.invite('lily', roomId).ok); return roomId; }
function finish(G, id = 'memory') { const sessionId = G.sys.minigames.begin(id), result = G.sys.minigames.finish(id, { sessionId, score: 20, stars: 1 }); assert.ok(result.ok); return result; }
function furnish(G, roomId, id, quantity = 1) { for (let i = 0; i < quantity; i++) { assert.ok(G.sys.economy.buy(id).ok, id); assert.ok(G.sys.decorating.place(id, roomId, 30 + i * 35, 80).ok); } }
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }
test('12位居民各有8个以上独立心愿、六类齐备、10条以上台词和5级奖励定义', () => {
  const { G } = sandbox(); assert.equal(G.data.residents.length, 12); G.data.residents.forEach(resident => { assert.ok(resident.wishes.length >= 8); assert.equal(new Set(resident.wishes.map(wish => wish.id)).size, resident.wishes.length); assert.equal(new Set(resident.wishes.map(wish => wish.type)).size, 6); assert.ok(resident.chats.length >= 10); assert.equal(resident.emotions.length, 3); assert.equal(resident.friendshipRewards.length, 5); assert.ok(resident.birthdayText); });
});
test('旧三位原门槛保持，新居民按结构化条件返回具体缺项与导航', () => {
  const { G } = sandbox(); assert.equal(G.sys.residents.eligibility('lily').ok, false); const roomId = G.sys.building.buildRoom(0, 0, 'bedroom').roomId; G.sys.decorating.place('bed_basic', roomId, 10, 80); assert.equal(G.sys.residents.eligibility('lily').ok, true); assert.ok(G.sys.residents.eligibility('pudding').missing.some(value => value.type === 'level')); G.store.update(s => { s.level = 11; s.wallet.coin = 10000; }); assert.ok(G.sys.residents.eligibility('bobo').missing.some(value => value.roomType === 'bathroom')); const bath = G.sys.building.buildRoom(0, 1, 'bathroom').roomId; assert.ok(G.sys.residents.eligibility('bobo').missing.some(value => value.tag === 'bathtub')); furnish(G, bath, 'bathtub_basic'); assert.equal(G.sys.residents.eligibility('bobo').ok, true); assert.ok(G.sys.residents.eligibility('orange').missing.some(value => value.roomType === 'studio'));
});
test('所有12位按真实房间/主题/图鉴/章节条件均可入住，单卧室最多2人', () => {
  const { G } = sandbox(); G.store.update(s => { s.level = 30; s.wallet.coin = 1000000; s.quests.main.chapter = 4; s.inventory.bed_basic = 6; }); const bedrooms = [];
  for (let i = 0; i < 6; i++) { const result = G.sys.building.buildRoom(Math.floor(i / 3), i % 3, 'bedroom'); assert.ok(result.ok); bedrooms.push(result.roomId); G.sys.decorating.place('bed_basic', result.roomId, 5, 80); }
  for (const [i, type] of ['studio', 'bathroom', 'wardrobe', 'music', 'game'].entries()) assert.ok(G.sys.building.buildRoom(Math.floor((6 + i) / 3), (6 + i) % 3, type).ok);
  const bathroom = Object.keys(G.state.house.rooms).find(id => G.state.house.rooms[id].type === 'bathroom'); furnish(G, bathroom, 'bathtub_basic'); for (const [i, theme] of ['forest', 'starry', 'oriental', 'princess'].entries()) furnish(G, bedrooms[i], 'chair_' + theme, 3);
  G.store.update(s => { G.data.furniture.slice(0, 65).forEach(def => { s.collection[def.id] = true; }); });
  const order = ['lily', 'pudding', 'mimi'].concat(G.data.residents.map(value => value.id).filter(id => !['lily', 'pudding', 'mimi'].includes(id)));
  for (const id of order) { const eligible = G.sys.residents.eligibility(id); assert.ok(eligible.ok, id + ': ' + eligible.message); assert.ok(G.sys.residents.invite(id, eligible.roomIds[0]).ok); }
  assert.equal(Object.values(G.state.residents).filter(value => value.movedIn).length, 12); assert.ok(bedrooms.every(roomId => Object.values(G.state.residents).filter(value => value.movedIn && value.roomId === roomId).length === 2));
});
test('同日心愿只生成一次，getter只读，刷新/JSON恢复不重抽；新日刷新不追发旧日奖励', () => {
  const { G, at } = sandbox(); inviteLily(G); const before = JSON.stringify(G.state), saved = JSON.parse(before), id = G.sys.residents.wish('lily').id; assert.equal(JSON.stringify(G.state), before); G.sys.residentWishes.refresh(); assert.equal(G.sys.residents.wish('lily').id, id); const loaded = sandbox(saved); assert.equal(loaded.G.sys.residents.wish('lily').id, id); const coin = G.state.wallet.coin; at('2026-10-29'); assert.equal(G.sys.residents.wish('lily').locked, true); G.sys.residentWishes.refresh(); assert.equal(G.sys.residents.wish('lily').date, '2026-10-29'); assert.equal(G.state.wallet.coin, coin); assert.equal(G.state.residents.lily.wish.claimed, false);
});
test('未解锁主题/花园/无厨房的食物不会被抽中，条件具备后才生成', () => {
  for (const type of ['food', 'flower']) { const { G } = sandbox(); only(G, type); inviteLily(G); assert.equal(G.state.residents.lily.wish, null); if (type === 'food') assert.ok(G.sys.building.buildRoom(0, 1, 'kitchen').ok); else G.store.update(s => { s.level = 6; }); G.sys.residentWishes.refresh(); assert.equal(G.sys.residents.wish('lily').definition.type, type); }
  const { G } = sandbox(), resident = G.data.residents.find(value => value.id === 'lily'), theme = resident.wishes.find(value => value.type === 'theme'); resident.wishes = [Object.assign({}, theme, { theme: 'princess' })]; inviteLily(G); assert.equal(G.state.residents.lily.wish, null);
});
test('家具和主题实时观察所属卧室，满足后领取50—150币/30好感/20经验/5爱心且不消耗摆件', () => {
  const { G } = sandbox(); const wish = only(G, 'furniture'), roomId = inviteLily(G); assert.equal(G.sys.residents.wish('lily').done, false); furnish(G, roomId, wish.itemId); const view = G.sys.residents.wish('lily'); assert.equal(view.done, true); assert.ok(view.reward.coin >= 50 && view.reward.coin <= 150); const before = { coin: G.state.wallet.coin, affection: G.state.residents.lily.affection, heart: G.state.wallet.heart, count: G.state.house.rooms[roomId].items.length }; assert.ok(G.sys.residents.claimWish('lily').ok); assert.equal(G.state.wallet.coin, before.coin + view.reward.coin); assert.equal(G.state.residents.lily.affection, before.affection + 30); assert.equal(G.state.wallet.heart, before.heart + 5); assert.equal(G.state.house.rooms[roomId].items.length, before.count); assert.equal(G.state.quests.stats.wishesDone, 1); const snapshot = JSON.stringify(G.state); assert.equal(G.sys.residents.claimWish('lily').ok, false); assert.equal(JSON.stringify(G.state), snapshot);
  const themeGame = sandbox(), T = themeGame.G; only(T, 'theme'); T.store.update(s => { s.wallet.coin = 10000; }); const bedroom = inviteLily(T); furnish(T, bedroom, 'chair_strawberry', 3); assert.equal(T.sys.residents.wish('lily').progress, 3); assert.equal(T.sys.residents.wish('lily').done, true);
});
test('食物/花领取才真实扣一次库存，不占用每天送礼次数，未完成不负扣', () => {
  for (const type of ['food', 'flower']) { const { G } = sandbox(), wish = only(G, type); G.store.update(s => { s.level = 6; }); if (type === 'food') assert.ok(G.sys.building.buildRoom(0, 1, 'kitchen').ok); inviteLily(G); const empty = JSON.stringify(G.state); assert.equal(G.sys.residents.claimWish('lily').ok, false); assert.equal(JSON.stringify(G.state), empty); G.store.update(s => { if (wish.cropId) s.garden.harvest[wish.cropId] = 1; else s.inventory[wish.itemId] = 1; }); assert.ok(G.sys.residents.claimWish('lily').ok); assert.equal(wish.cropId ? G.state.garden.harvest[wish.cropId] : G.state.inventory[wish.itemId], 0); assert.equal(G.state.residents.lily.giftDate, ''); assert.equal(G.sys.residents.claimWish('lily').ok, false); }
});
test('小游戏只计生成后真实结算的session；先前成绩、重发和伪造事件不刷进度', () => {
  const { G } = sandbox(); only(G, 'activity'); finish(G); inviteLily(G); const wish = G.sys.residents.wish('lily'); assert.equal(wish.progress, 0); assert.equal(wish.definition.gameId, 'memory'); const result = finish(G); assert.equal(G.sys.residents.wish('lily').progress, 1); const before = G.state.quests.stats.wish_activity_memory; G.bus.emit('minigame:finished', result); G.bus.emit('minigame:finished', { id: 'memory', sessionId: 'forged', ok: true }); assert.equal(G.state.quests.stats.wish_activity_memory, before); assert.ok(G.sys.residents.claimWish('lily').ok);
});
test('换装必须在生成后实际穿上指定衣物，买衣/存方案/头发/重复穿同件不计动作', () => {
  const { G } = sandbox(); only(G, 'outfit'); inviteLily(G); assert.equal(G.sys.residents.wish('lily').done, false); G.sys.avatar.setHair('bob'); G.sys.avatar.saveOutfit(0, '软软'); G.store.update(s => { s.wallet.coin = 10000; }); G.sys.avatar.buy('acc_bunny'); assert.equal(G.sys.residents.wish('lily').done, false); G.sys.avatar.equip('dress_pink'); assert.equal(G.sys.residents.wish('lily').done, false); G.sys.avatar.equip('top_cloud'); G.sys.avatar.equip('dress_pink'); assert.equal(G.sys.residents.wish('lily').done, true); const count = G.state.quests.stats.wish_wear_dress_pink; G.sys.avatar.equip('dress_pink'); G.sys.avatar.applyOutfit(0); assert.equal(G.state.quests.stats.wish_wear_dress_pink, count); assert.ok(G.sys.residents.claimWish('lily').ok);
});
test('移除配饰后仍能正常继续穿衣计数，纯移除不会完成换装心愿', () => {
  const { G } = sandbox(); only(G, 'outfit'); inviteLily(G); assert.ok(G.sys.avatar.removeAccessory('bow_red').ok); assert.equal(G.sys.residents.wish('lily').done, false); G.sys.avatar.equip('top_cloud'); G.sys.avatar.equip('dress_pink'); assert.equal(G.sys.residents.wish('lily').done, true); assert.equal(G.state.quests.stats.wish_wear_dress_pink, 1);
});
test('跨午夜未跑刷新tick就完成小游戏，当天第一个真实动作仍计入新心愿', () => {
  const { G, at } = sandbox(); only(G, 'activity'); inviteLily(G); at('2026-10-28', 23); assert.equal(G.state.residents.lily.wish.date, '2026-10-28'); at('2026-10-29', 0); const result = finish(G); const wish = G.sys.residents.wish('lily'); assert.equal(wish.date, '2026-10-29'); assert.equal(wish.progress, 1); assert.equal(wish.done, true); assert.equal(G.state.residents.lily.wish.baseline, 0); G.bus.emit('minigame:finished', result); assert.equal(G.state.quests.stats.wish_activity_memory, 1);
});
test('跨午夜未跑刷新tick先穿上指定衣物，当天新换装心愿立即记录这次穿戴', () => {
  const { G, at } = sandbox(); only(G, 'outfit'); inviteLily(G); at('2026-10-28', 23); G.sys.avatar.equip('top_cloud'); assert.equal(G.state.residents.lily.wish.date, '2026-10-28'); at('2026-10-29', 0); assert.ok(G.sys.avatar.equip('dress_pink').ok); const wish = G.sys.residents.wish('lily'); assert.equal(wish.date, '2026-10-29'); assert.equal(wish.progress, 1); assert.equal(wish.done, true); assert.equal(G.state.residents.lily.wish.baseline, 0);
});
test('JSON保留生成地逻辑日期，跨时区相差前后一天仍可验证，未来日期继续锁定', () => {
  const { G, parse } = sandbox(); only(G, 'activity'); inviteLily(G); const original = JSON.parse(JSON.stringify(G.state));
  const transfers = [
    ['2026-10-27', Date.UTC(2026, 9, 28, 0, 30)],
    ['2026-10-28', Date.UTC(2026, 9, 28, 23, 30)],
    ['2026-10-29', Date.UTC(2026, 9, 28, 12, 30)]
  ];
  // 对应生成地UTC-8/UTC+14的日期；导入地不得用自己的午夜去否定原逻辑日。
  for (const [date, generatedAt] of transfers) { const transfer = JSON.parse(JSON.stringify(original)); transfer.residents.lily.wish.date = date; transfer.residents.lily.wish.generatedAt = generatedAt; const restored = G.store.validate(parse(transfer)); assert.equal(restored.residents.lily.wish.date, date); assert.equal(restored.residents.lily.wish.generatedAt, generatedAt); }
  const future = JSON.parse(JSON.stringify(original)); future.residents.lily.wish.date = transfers[2][0]; future.residents.lily.wish.generatedAt = transfers[2][1]; G.store.replace(parse(future)); assert.equal(G.sys.residents.wish('lily').locked, true); const snapshot = JSON.stringify(G.state); assert.equal(G.sys.residents.claimWish('lily').ok, false); assert.equal(JSON.stringify(G.state), snapshot);
});
test('时钟倒退不能重领旧日礼物，离线旧心愿不补发，未来心愿暂时锁定', () => {
  const { G, at } = sandbox(); const wish = only(G, 'furniture'); const room = inviteLily(G); furnish(G, room, wish.itemId); at('2026-10-30'); G.sys.residentWishes.refresh(); assert.ok(G.sys.residents.claimWish('lily').ok); const snapshot = JSON.stringify(G.state); at('2026-10-29'); assert.equal(G.sys.residents.wish('lily').locked, true); assert.equal(G.sys.residents.claimWish('lily').ok, false); assert.equal(JSON.stringify(G.state), snapshot); const loaded = sandbox(JSON.parse(snapshot)); assert.equal(loaded.G.sys.residents.wish('lily').locked, true); assert.equal(loaded.G.sys.residents.claimWish('lily').ok, false);
});
test('好感五级奖励依序只领一次，服饰/专属家具/故事/徽章相框实际入档', () => {
  const { G } = sandbox(); inviteLily(G); G.store.update(s => { s.residents.lily.affection = 1000; }); assert.equal(G.sys.residents.claimFriendship('lily', 3).ok, false); let story;
  for (let level = 1; level <= 5; level++) { const result = G.sys.residents.claimFriendship('lily', level); assert.ok(result.ok, String(level)); if (level === 4) story = result.story; }
  const reward = G.data.residents.find(value => value.id === 'lily').friendshipRewards[1]; assert.equal(G.state.avatar.owned[reward.outfitId], true); assert.equal(G.state.inventory.resident_lily_gift, 1); assert.equal(G.state.inventory.frame_basic, 1); assert.ok(story.length >= 3); assert.equal(G.state.residents.lily.bestFriendBadge, true); assert.equal(G.sys.residents.friendship('lily').level, 5); const snapshot = JSON.stringify(G.state); for (let level = 1; level <= 5; level++) assert.equal(G.sys.residents.claimFriendship('lily', level).ok, false); assert.equal(JSON.stringify(G.state), snapshot); assert.equal(sandbox(JSON.parse(snapshot)).G.state.residents.lily.friendshipClaims.length, 5);
});
test('满库存友情礼物和满心意罐心愿安全失败，奖励不标已领也不消费食物', () => {
  const { G } = sandbox(); only(G, 'food'); G.store.update(s => { s.level = 6; }); G.sys.building.buildRoom(0, 1, 'kitchen'); inviteLily(G); G.store.update(s => { s.inventory.cake_strawberry = 1; s.wallet.coin = 1000000000; }); const before = JSON.stringify(G.state); assert.equal(G.sys.residents.claimWish('lily').ok, false); assert.equal(JSON.stringify(G.state), before); G.store.update(s => { s.wallet.coin = 1000; s.residents.lily.affection = 1000; s.inventory.resident_lily_gift = 9999; }); G.sys.residents.claimFriendship('lily', 1); G.sys.residents.claimFriendship('lily', 2); const full = JSON.stringify(G.state); assert.equal(G.sys.residents.claimFriendship('lily', 3).ok, false); assert.equal(JSON.stringify(G.state), full);
});
test('旧好感和无字段存档迁移不重置友谊，旧占位愿望清空且不会发奖励', () => {
  const { G } = sandbox(); inviteLily(G); const old = JSON.parse(JSON.stringify(G.state)), resident = old.residents.lily; resident.affection = 650; resident.wish = { text: '旧版占位', done: true }; delete resident.wishLastClaimedDate; delete resident.friendshipClaims; delete resident.bestFriendBadge; const loaded = sandbox(old); assert.equal(loaded.G.state.residents.lily.affection, 650); assert.equal(loaded.G.state.residents.lily.friendshipClaims.length, 0); assert.equal(loaded.G.state.wallet.coin, G.state.wallet.coin); assert.equal(loaded.G.sys.residents.friendship('lily').level, 4);
});
test('未知/跨居民愿望、伪造奖励进度、异常日期时间戳/基线和好感奖励记录被严格拒绝', () => {
  const { G, parse } = sandbox(); only(G, 'activity'); inviteLily(G); const snapshot = JSON.stringify(G.state), variants = [s => { s.residents.lily.wish.defId = 'forged'; }, s => { s.residents.lily.wish.defId = 'pudding_play_together'; }, s => { s.residents.lily.wish.reward = { coin: 999999 }; }, s => { s.residents.lily.wish.progress = 100; }, s => { s.residents.lily.wish.date = '2026-02-30'; }, s => { s.residents.lily.wish.date = 'not-a-date'; }, s => { s.residents.lily.wish.generatedAt = -1; }, s => { s.residents.lily.wish.generatedAt = 8640000000000001; }, s => { s.residents.lily.wish.generatedAt = '2026-10-28'; }, s => { s.residents.lily.wish.baseline = 100; }, s => { s.residents.lily.wish.claimed = true; }, s => { s.residents.lily.friendshipClaims = [2]; }, s => { s.residents.lily.friendshipClaims = [1, 2]; }, s => { s.residents.lily.bestFriendBadge = true; }];
  for (const mutate of variants) { const bad = JSON.parse(snapshot); mutate(bad); assert.throws(() => G.store.replace(parse(bad))); assert.equal(JSON.stringify(G.state), snapshot); }
});
console.log('\n' + passed + ' 组居民心愿与友情检查通过。');
