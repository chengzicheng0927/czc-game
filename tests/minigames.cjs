'use strict';
// 纯规则和真实状态/经济结算验证，不需要浏览器或第三方依赖。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const spaces = require('./fixtures/free-spaces.cjs');
const root = path.resolve(__dirname, '..');
let count = 0;
function sandbox() {
  const context = vm.createContext({ console, Date, Math, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, document: { addEventListener() {} }, Blob, URL });
  context.window = context; context.addEventListener = () => {}; context.localStorage = { getItem: () => null, setItem() {} };
  for (const file of ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/minigames.js', 'js/data/garden.js', 'js/core/utils.js', 'js/core/bus.js', 'js/building/schema.js', 'js/core/store.js', 'js/core/save.js', 'js/core/content-spaces.js', 'js/systems/systems.js', 'js/systems/minigames.js', 'js/systems/garden.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  const G = context.Game; spaces.register(G, context.CottageBuilding); G.store.init(G.save.load()); G.sys.init(); return G;
}
function test(name, fn) { fn(); count++; console.log('✓ ' + name); }
const plain = value => JSON.parse(JSON.stringify(value));
function seeded(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
function board(size = 7) { return Array.from({ length: size * size }, (_, i) => ({ color: (i + Math.floor(i / size)) % 6, special: null })); }
test('100局初始花盘没有自动三连且有合法交换', () => {
  const r = sandbox().sys.minigames.rules;
  for (let seed = 1; seed <= 100; seed++) { const b = r.createBoard(7, 6, seeded(seed)); assert.equal(b.length, 49); assert.equal(r.matches(b, 7).length, 0); assert.ok(r.findMove(b, 7)); assert.ok(b.every(cell => cell.color >= 0 && cell.color < 6)); }
});
test('交换只允许相邻，跨行/对角/越界不会成为合法步', () => {
  const r = sandbox().sys.minigames.rules, b = board();
  assert.equal(r.adjacent(6, 7, 7), false); assert.equal(r.adjacent(0, 8, 7), false); assert.equal(r.adjacent(-1, 0, 7), false); assert.equal(r.validSwap(b, 0, 1, 7), false); assert.equal(r.adjacent(7, 14, 7), true);
  const original = JSON.stringify(b), moved = r.swapped(b, 0, 1); assert.equal(JSON.stringify(b), original); assert.equal(JSON.stringify(r.swapped(moved, 0, 1)), original);
});
test('可动交换产生三连，清除后补充为完整49格且不改变输入', () => {
  const r = sandbox().sys.minigames.rules, b = board(); b[0].color = 0; b[1].color = 1; b[2].color = 0; b[8].color = 0;
  assert.equal(r.validSwap(b, 1, 8, 7), true);
  const moved = r.swapped(b, 1, 8), round = r.clearRound(moved, 7, [1, 8], []); assert.ok(round.removed.length >= 3); assert.equal(round.board.filter(cell => !cell).length, round.removed.length - round.created.length);
  const full = r.refill(round.board, 7, 6, seeded(9)); assert.equal(full.length, 49); assert.ok(full.every(Boolean)); assert.ok(moved.every(Boolean));
});
test('四连生成蝴蝶，交换蝴蝶清除整行', () => {
  const r = sandbox().sys.minigames.rules, b = board(); for (const i of [7, 8, 9, 10]) b[i].color = 5;
  const round = r.clearRound(b, 7, [8], []); assert.ok(round.created.includes(8)); assert.equal(round.board[8].special, 'row'); assert.equal(round.board[8].color, 5);
  const full = r.refill(round.board, 7, 6, seeded(3)); const activated = r.clearRound(full, 7, [], [{ index: 8 }]); for (let i = 7; i < 14; i++) assert.ok(activated.removed.includes(i));
});
test('五连生成彩虹花，激活后清除选中颜色', () => {
  const r = sandbox().sys.minigames.rules, b = board(); for (const i of [14, 15, 16, 17, 18]) b[i].color = 5;
  const round = r.clearRound(b, 7, [17], []); assert.equal(round.board[17].special, 'color');
  const full = r.refill(round.board, 7, 6, seeded(13)), target = 2, activated = r.clearRound(full, 7, [], [{ index: 17, color: target }]);
  full.forEach((cell, i) => { if (cell.color === target) assert.ok(activated.removed.includes(i)); }); assert.ok(activated.removed.includes(17));
});
test('特殊花的连锁不会递归重复，清除格不会重复计分', () => {
  const r = sandbox().sys.minigames.rules, b = board(); b[0].special = 'row'; b[3].special = 'color'; b[10].special = 'row'; b[10].color = b[3].color;
  const round = r.clearRound(b, 7, [], [{ index: 0 }]); assert.equal(new Set(round.removed).size, round.removed.length); assert.ok(round.removed.includes(10)); for (let i = 7; i < 14; i++) assert.ok(round.removed.includes(i)); assert.ok(round.score >= 0);
});
test('无可动自动重排，棋盘恢复无三连且有一步可走', () => {
  const r = sandbox().sys.minigames.rules, b = board(); assert.equal(r.findMove(b, 7), null); const fresh = r.reshuffle(b, 7, 6, seeded(6)); assert.equal(r.matches(fresh, 7).length, 0); assert.ok(r.findMove(fresh, 7));
});
test('极端随机源仍能创建可玩棋盘', () => {
  const r = sandbox().sys.minigames.rules; for (const value of [0, .999999]) { const b = r.createBoard(7, 6, () => value); assert.ok(r.findMove(b, 7)); assert.equal(r.matches(b, 7).length, 0); }
});
test('三消与接星星按照阈值升星，记忆同时考虑翻牌数和用时', () => {
  const r = sandbox().sys.minigames.rules;
  assert.equal(r.scoreStars('match3', 0), 1); assert.equal(r.scoreStars('match3', 600), 2); assert.equal(r.scoreStars('match3', 1400), 3); assert.equal(r.scoreStars('catch_stars', 1000), 3);
  for (const pairs of [6, 8, 10]) { assert.equal(r.memoryStars(pairs, pairs * 2, pairs * 5, true), 3); assert.equal(r.memoryStars(pairs, pairs * 4, pairs * 11, true), 2); assert.equal(r.memoryStars(pairs, pairs * 6, pairs * 5, true), 1); assert.equal(r.memoryStars(pairs, 0, 0, false), 1); }
});
test('接物得分与双倍期限准确；乌云只湿2秒，不扣分不打断双倍', () => {
  const r = sandbox().sys.minigames.rules; let state = { score: 0, doubleUntil: 0, wetUntil: 0 };
  state = r.catchEffect('star', 1, state); assert.equal(state.points, 10); assert.equal(state.score, 10);
  state = r.catchEffect('candy', 2, state); assert.equal(state.points, 20);
  state = r.catchEffect('rainbow', 3, state); assert.equal(state.points, 50); assert.equal(state.doubleUntil, 8);
  state = r.catchEffect('star', 4, state); assert.equal(state.points, 20);
  state = r.catchEffect('candy', 5, state); assert.equal(state.points, 40);
  const score = state.score; state = r.catchEffect('cloud', 6, state); assert.equal(state.score, score); assert.equal(state.points, 0); assert.equal(state.wetUntil, 8); assert.equal(state.doubleUntil, 8);
  state = r.catchEffect('star', 8, state); assert.equal(state.points, 10);
  state = r.catchEffect('rainbow', 9, state); assert.equal(state.points, 50); state = r.catchEffect('rainbow', 10, state); assert.equal(state.points, 100); assert.equal(state.doubleUntil, 15);
});
test('每款游戏前5局独立全额，第6局半额；换日恢复全额', () => {
  const G = sandbox(), mini = G.sys.minigames;
  for (let i = 0; i < 6; i++) { const result = mini.finish('match3', { sessionId: mini.begin('match3'), score: i * 100, stars: 3 }); assert.equal(result.ok, true); assert.equal(result.coin, i < 5 ? 100 : 50); assert.equal(result.exp, i < 5 ? 30 : 15); }
  const other = mini.finish('memory', { sessionId: mini.begin('memory'), score: 0, stars: 1 }); assert.equal(other.coin, 30); assert.equal(G.state.minigames.match3.best, 500); assert.equal(G.state.minigames.match3.playsToday, 6); assert.equal(G.state.minigames.memory.playsToday, 1);
  G.store.update(state => { state.minigames.match3.date = '2000-01-01'; }); const next = mini.finish('match3', { sessionId: mini.begin('match3'), score: 100, stars: 2 }); assert.equal(next.coin, 60); assert.equal(G.state.minigames.match3.playsToday, 1); assert.equal(G.state.minigames.match3.best, 500);
});
test('同一session按钮/关窗/计时重复结算只发一次奖励', () => {
  const G = sandbox(), mini = G.sys.minigames, sessionId = mini.begin('catch_stars'); let events = 0;
  G.bus.on('minigame:finished', () => events++); assert.equal(mini.finish('catch_stars', { sessionId, score: 1000, stars: 3 }).ok, true); const snapshot = JSON.stringify(G.state);
  for (let i = 0; i < 3; i++) assert.equal(mini.finish('catch_stars', { sessionId, score: 1000, stars: 3 }).duplicate, true);
  assert.equal(JSON.stringify(G.state), snapshot); assert.equal(events, 1);
});
test('未知session/冒用游戏id/异常成绩不发奖励；修正后仍能正常结算', () => {
  const G = sandbox(), mini = G.sys.minigames, sessionId = mini.begin('match3'), snapshot = JSON.stringify(G.state);
  assert.equal(mini.begin('fake'), null);
  for (const payload of [{ sessionId: 'fake', score: 0, stars: 1 }, { sessionId, score: NaN, stars: 1 }, { sessionId, score: -10, stars: 1 }, { sessionId, score: 1000001, stars: 1 }, { sessionId, score: 0, stars: 4 }]) assert.equal(mini.finish('match3', payload).ok, false);
  assert.equal(mini.finish('memory', { sessionId, score: 0, stars: 1 }).ok, false); assert.equal(JSON.stringify(G.state), snapshot); assert.equal(mini.finish('match3', { sessionId, score: 0, stars: 1 }).coin, 30);
});
test('4x3/4x4/5x4卡片能被打乱且每对恰好两张', () => {
  const r = sandbox().sys.minigames.rules;
  for (const size of [12, 16, 20]) { const first = Array.from({ length: size / 2 }, (_, i) => i), cards = plain(r.shuffle(first.concat(first), seeded(size))); assert.equal(cards.length, size); first.forEach(id => assert.equal(cards.filter(card => card === id).length, 2)); }
});
test('蛋糕屋也走统一奖励与去重，其他小游戏回忆正确标注游戏名', () => {
  const G = sandbox(), mini = G.sys.minigames; let events = 0; G.bus.on('minigame:finished', () => events++);
  const startCoin = G.state.wallet.coin, before = G.state.quests.stats.minigamePlays || 0;
  for (let i = 0; i < 6; i++) {
    const sessionId = mini.begin('bakery'), result = mini.finish('bakery', { sessionId, score: 6, stars: 3 }); assert.equal(result.coin, i < 5 ? 100 : 50);
    assert.equal(mini.finish('bakery', { sessionId, score: 6, stars: 3 }).duplicate, true);
  }
  assert.equal(G.state.wallet.coin - startCoin, 550); assert.equal(events, 6); assert.equal(G.state.quests.stats.minigamePlays, before + 6);
  mini.finish('catch_stars', { sessionId: mini.begin('catch_stars'), score: 0, stars: 1 });
  assert.ok(G.state.memories[G.state.memories.length - 1].text.includes('星星接接乐'));
});
test('新的一天重置四游戏计数并从轮换池选3个每日任务', () => {
  const G = sandbox(); G.store.update(state => {
    state.quests.daily.date = '2000-01-01';
    for (const id of ['bakery', 'match3', 'catch_stars', 'memory']) state.minigames[id] = { date: '2000-01-01', playsToday: 6, best: 123 };
  }); G.sys.init();
  for (const id of ['bakery', 'match3', 'catch_stars', 'memory']) { assert.equal(G.state.minigames[id].date, G.utils.dateKey()); assert.equal(G.state.minigames[id].playsToday, 0); assert.equal(G.state.minigames[id].best, 123); }
  assert.equal(G.state.quests.daily.list.length, 3);
  if (G.data.dailyQuestsForDate) assert.deepEqual(plain(G.state.quests.daily.list.map(item => item.id)), plain(G.data.dailyQuestsForDate(G.utils.dateKey()).map(item => item.id)));
});
test('花园init接入，作物喜欢+20/普通+8，蛋糕与作物共用每日送礼限制', () => {
  const G = sandbox(), room = spaces.buildSpace(G, 0, 0, 'bedroom'); assert.equal(spaces.placeItem(G, 'bed_basic', room.roomId, 10, 50).ok, true); assert.equal(G.sys.residents.invite('lily', room.roomId).ok, true);
  G.data.residents.find(resident => resident.id === 'lily').birthday = '02-30';
  G.store.update(state => { state.garden.harvest.carrot = 2; state.garden.harvest.daisy = 2; state.inventory.cake_strawberry = 2; });
  assert.ok(G.state.garden.plots.length >= G.data.gardenConfig.basePlots);
  const original = G.state.residents.lily.affection, favorite = G.sys.residents.gift('lily', 'carrot'); assert.equal(favorite.ok, true); assert.equal(favorite.favorite, true); assert.equal(favorite.affection, 20); assert.equal(G.state.residents.lily.affection, original + 20); assert.equal(G.state.garden.harvest.carrot, 1);
  const sameDay = JSON.stringify(G.state); assert.equal(G.sys.residents.gift('lily', 'daisy').ok, false); assert.equal(G.sys.residents.gift('lily').ok, false); assert.equal(JSON.stringify(G.state), sameDay);
  G.store.update(state => { state.residents.lily.giftDate = ''; }); const ordinary = G.sys.residents.gift('lily', 'daisy'); assert.equal(ordinary.affection, 8); assert.equal(ordinary.favorite, false); assert.equal(G.state.garden.harvest.daisy, 1);
  G.store.update(state => { state.residents.lily.giftDate = ''; }); const cake = G.sys.residents.gift('lily'); assert.equal(cake.ok, true); assert.equal(cake.favorite, false); assert.equal(cake.affection, 8); assert.equal(G.state.inventory.cake_strawberry, 1);
});
test('没有作物/非法作物不扣库存，生日作物好感翻倍', () => {
  const G = sandbox(), room = spaces.buildSpace(G, 0, 0, 'bedroom'); spaces.placeItem(G, 'bed_basic', room.roomId, 10, 50); G.sys.residents.invite('lily', room.roomId);
  const before = JSON.stringify(G.state); assert.equal(G.sys.residents.gift('lily', 'carrot').ok, false); assert.equal(G.sys.residents.gift('lily', 'not_a_crop').ok, false); assert.equal(JSON.stringify(G.state), before);
  G.data.residents.find(resident => resident.id === 'lily').birthday = G.utils.dateKey().slice(5); G.store.update(state => { state.garden.harvest.carrot = 1; });
  const gift = G.sys.residents.gift('lily', 'carrot'); assert.equal(gift.affection, 40); assert.equal(G.state.garden.harvest.carrot, 0);
});
console.log('\n' + count + ' 组小游戏规则检查通过。');
