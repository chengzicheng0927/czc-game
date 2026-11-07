'use strict';
// 规则夹具：显式准备等级、资金和累计历史；建房/购买/摆放/邀请仍使用真实API。
// 不启动页面、服务或浏览器；require不会执行游戏或写文件。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const files = ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/furniture-expansion.js', 'js/data/residents-expansion.js', 'js/data/progression.js', 'js/data/concert.js', 'js/data/achievements.js', 'js/data/minigames.js', 'js/data/garden.js', 'js/data/calendar.js', 'js/data/outfits.js', 'js/data/yard.js', 'js/data/crafting.js', 'js/data/exterior.js', 'js/data/creative.js', 'js/data/gifts.js', 'js/data/observatory.js', 'js/data/deals.js', 'js/data/login.js', 'js/core/utils.js', 'js/core/bus.js', 'js/core/store.js', 'js/core/save.js', 'js/systems/systems.js', 'js/systems/minigames.js', 'js/systems/garden.js', 'js/systems/time.js', 'js/systems/avatar.js', 'js/systems/resident-wishes.js', 'js/systems/quests.js', 'js/systems/concert.js', 'js/systems/crafting.js'];
const legacyIds = ['name_home', 'first_bedroom', 'first_bed', 'welcome_lily', 'first_cake', 'first_kitchen', 'three_star', 'new_wallpaper', 'forest_friend', 'art_friend', 'first_resident_wish', 'woolly_friend', 'thirty_little_things', 'ocean_friend', 'song_in_the_forest', 'acorn_collector', 'bamboo_friend'];
function setup(saved) {
  let clock = new Date(2026, 9, 28, 12).getTime(); const RealDate = Date;
  class TestDate extends RealDate { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const context = vm.createContext({ console, Blob, URL, Date: TestDate, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, document: { addEventListener() {} } });
  context.window = context; context.addEventListener = () => {}; context.localStorage = { getItem: () => null, setItem() {} };
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  const G = context.Game, parse = value => vm.runInContext('JSON.parse(' + JSON.stringify(JSON.stringify(value)) + ')', context);
  G.store.init(saved ? parse(saved) : undefined); G.sys.init();
  return { G, parse, clock: () => clock, at(date, hour = 12) { const parts = date.split('-').map(Number); clock = new RealDate(parts[0], parts[1] - 1, parts[2], hour).getTime(); } };
}
function finish(G, id = 'memory', score = 20) { const result = G.sys.minigames.finish(id, { sessionId: G.sys.minigames.begin(id), score, stars: 1 }); assert.ok(result.ok, result.message); return result; }
function village(G, options = {}) {
  G.store.update(s => { s.wallet.coin = 1000000; s.house.name = '主线内容验收小屋'; s.tutorial.done = true; s.tutorial.step = 10; }); G.sys.economy.addExp(1000000);
  let cursor = 0;
  const build = type => { const n = cursor++, result = G.sys.building.buildRoom(Math.floor(n / 3), n % 3, type); assert.ok(result.ok, type + ': ' + result.message); return result.roomId; };
  const bedrooms = Array.from({ length: 6 }, () => build('bedroom')), auxiliary = {};
  for (const type of ['kitchen', 'studio', 'wardrobe', 'bathroom', 'music', 'game']) auxiliary[type] = build(type);
  const place = (id, roomId, x = 40, parent) => {
    if (!(G.state.inventory[id] > 0)) assert.ok(G.sys.economy.buy(id).ok, '购买' + id);
    const result = G.sys.decorating.place(id, roomId, x, 90, parent); assert.ok(result.ok, id + ': ' + result.message); return result;
  };
  bedrooms.forEach(room => place('bed_basic', room));
  const table = place('nightstand_basic', bedrooms[0], 180); place('desk_lamp_basic', bedrooms[0], 185, table.uid);
  for (const [room, theme] of [[bedrooms[1], 'forest'], [bedrooms[3], 'starry'], [bedrooms[4], 'oriental'], [bedrooms[5], 'princess'], [auxiliary.music, 'ocean']]) ['bed_', 'nightstand_', 'potted_plant_'].forEach((prefix, i) => place(prefix + theme, room, i * 85));
  place('bathtub_basic', auxiliary.bathroom);
  for (const def of G.data.furniture.filter(def => !def.rewardOnly && !def.festivalId && def.place !== 'yard')) { if (Object.keys(G.state.collection).length >= 100) break; if (!G.state.collection[def.id]) assert.ok(G.sys.economy.buy(def.id).ok, def.id); }
  const lodging = { lily: 0, pudding: 1, orange: 0, mianmian: 2, bobo: 2, xingxing: 3, lizi: 1, yuanyuan: 4, mimi: 3, doudou: 4, shirley: 5 };
  for (const [id, index] of Object.entries(lodging)) { const result = G.sys.residents.invite(id, bedrooms[index]); assert.ok(result.ok, id + ': ' + result.message); }
  G.sys.decorating.wallpaper(bedrooms[0], 'dots', '#FFB6C8');
  if (options.counters !== false) {
    // 只为门槛规则构造累计历史，不声称本夹具完成真实种植、摄影或多天心愿。
    G.store.update(s => { s.quests.stats.harvests = 60; s.quests.stats.wishesDone = 5; s.quests.stats.photos = 12; s.residents.lily.affection = 100; });
    finish(G, 'bakery', 50); for (let i = 1; i < 50; i++) finish(G);
    for (const def of G.data.outfits) { if (Object.keys(G.state.avatar.owned).length >= 50) break; if (!G.state.avatar.owned[def.id] && def.source === 'shop') assert.ok(G.sys.avatar.buy(def.id).ok, def.id); }
  }
  return { bedrooms, auxiliary, place };
}
function prepareForQuest(G, built, quest) {
  if (quest.id === 'island_concert' && !G.state.quests.stats.concerts) { const start = G.sys.concert.begin(built.auxiliary.music); assert.ok(start.ok); assert.ok(G.sys.concert.advance(start.sessionId).ok); assert.ok(G.sys.concert.advance(start.sessionId).ok); assert.ok(G.sys.concert.finish(start.sessionId).ok); }
  if (quest.id === 'starlight_corner' && !Object.values(G.state.house.rooms).some(room => room.type === 'study')) assert.ok(G.sys.building.changeRoomType(built.auxiliary.wardrobe, 'study').ok);
  if (quest.id === 'cozy_party_room' && !Object.values(G.state.house.rooms).some(room => room.type === 'living')) assert.ok(G.sys.building.changeRoomType(built.auxiliary.studio, 'living').ok);
  if (quest.id === 'shy_rainbow_friend' && !G.state.residents.rainbow?.movedIn) { const result = G.sys.residents.invite('rainbow', built.bedrooms[5]); assert.ok(result.ok, result.message); }
}
function advance(G, built, stopBefore) {
  const results = [];
  for (const quest of G.data.mainQuests) {
    if (quest.id === stopBefore) break; if (G.state.quests.main.claimed.includes(quest.id)) continue; prepareForQuest(G, built, quest);
    const result = G.sys.quests.claim(quest.id); assert.ok(result.ok, quest.id + ': ' + result.message + '\n' + JSON.stringify(G.sys.quests.list().find(value => value.id === quest.id))); results.push({ id: quest.id, result });
  }
  return results;
}
function qaState(stopBefore = 'rainbow_party') { const { G } = setup(), built = village(G); advance(G, built, stopBefore); return JSON.parse(JSON.stringify(G.state)); }
module.exports = { setup, village, advance, prepareForQuest, finish, qaState, legacyIds };
