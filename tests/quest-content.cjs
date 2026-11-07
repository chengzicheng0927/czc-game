'use strict';
// 内容契约与依赖可达性检查，不启动规则循环、页面、浏览器或服务。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), context = vm.createContext({ console }); context.window = context;
function read(file) { vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file }); }
['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js'].forEach(read);
const firstTen = JSON.parse(JSON.stringify(context.Game.data.mainQuests));
['js/data/furniture-expansion.js', 'js/data/residents-expansion.js', 'js/data/progression.js', 'js/data/achievements.js', 'js/data/minigames.js'].forEach(read);
const D = context.Game.data, plain = value => JSON.parse(JSON.stringify(value));
let passed = 0; function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }
const oldIds = ['name_home', 'first_bedroom', 'first_bed', 'welcome_lily', 'first_cake', 'first_kitchen', 'three_star', 'new_wallpaper', 'forest_friend', 'art_friend', 'first_resident_wish', 'woolly_friend', 'thirty_little_things', 'ocean_friend', 'song_in_the_forest', 'acorn_collector', 'bamboo_friend'];
test('35条主线唯一且有序分入五章，每章6至8条，没有遗漏或重复引用', () => {
  assert.equal(D.mainQuests.length, 35); assert.equal(new Set(D.mainQuests.map(q => q.id)).size, 35); assert.equal(D.storyChapters.length, 5);
  const chapterIds = Array.from(D.mainQuests, q => q.chapter); assert.deepEqual(chapterIds, chapterIds.slice().sort((a, b) => a - b));
  const referenced = [];
  for (const chapter of D.storyChapters) { const own = D.mainQuests.filter(q => q.chapter === chapter.id); assert.ok(own.length >= 6 && own.length <= 8); assert.deepEqual(plain(chapter.questIds), Array.from(own, q => q.id)); referenced.push(...chapter.questIds); }
  assert.equal(new Set(referenced).size, 35);
});
test('17条旧任务ID和相对次序保留，已存在的糖果/经验奖励没有改写', () => {
  let last = -1; for (const id of oldIds) { const at = D.mainQuests.findIndex(q => q.id === id); assert.ok(at > last, id); last = at; }
  for (const q of firstTen) assert.deepEqual(plain(D.mainQuests.find(value => value.id === q.id).reward), q.reward);
  for (const [id, coin, exp] of [['first_resident_wish', 100, 60], ['woolly_friend', 120, 70], ['thirty_little_things', 150, 80], ['ocean_friend', 150, 80], ['song_in_the_forest', 150, 90], ['acorn_collector', 180, 100], ['bamboo_friend', 180, 100]]) assert.deepEqual(plain(D.mainQuests.find(q => q.id === id).reward), { coin, exp });
  assert.equal(D.mainQuests.find(q => q.id === 'first_cake').metric, 'bakeryPlays');
});
const metrics = new Set(['named', 'bedroom', 'bed', 'lily', 'bakeryPlays', 'minigamePlays', 'kitchen', 'bedroomStars', 'wallpaperChanges', 'pudding', 'orange', 'wishesDone', 'collection', 'level', 'floors', 'residentCount', 'maxAffection', 'bakeryOrders', 'harvests', 'outfitsOwned', 'photos', 'rainbowCount', 'roomCount', 'concerts']);
function validMetric(metric) { if (metrics.has(metric)) return true; if (metric.startsWith('resident_')) return D.residents.some(r => r.id === metric.slice(9)); if (metric.startsWith('room_')) return D.rooms.some(r => r.id === metric.slice(5)); if (metric.startsWith('theme_')) return !!D.themes[metric.slice(6)]; return false; }
test('每个任务使用真实内容与可计算指标，复合目标具有可读名称和合法阈值', () => {
  const panels = new Set(['rename', 'settings', 'build', 'decor', 'shop', 'play', 'residents', 'avatar', 'garden', 'photo', 'concert']);
  for (const q of D.mainQuests) {
    assert.ok(validMetric(q.metric), q.id + ':' + q.metric); assert.ok(Number.isInteger(q.target) && q.target > 0); assert.ok(q.title && q.description); assert.ok(q.reward.coin > 0 && q.reward.exp > 0);
    for (const item of q.conditions || []) { assert.ok(validMetric(item.metric)); assert.ok(Number.isInteger(item.target) && item.target > 0); assert.ok(item.label); }
    assert.ok(q.action && panels.has(q.action.panel)); if (q.action.itemId) assert.ok(D.furnitureById[q.action.itemId]); if (q.action.roomType) assert.ok(D.rooms.some(r => r.id === q.action.roomType)); if (q.action.residentId) assert.ok(D.residents.some(r => r.id === q.action.residentId)); if (q.action.gameId) assert.ok(D.minigames.some(g => g.id === q.action.gameId)); if (q.action.theme) assert.ok(D.themes[q.action.theme]);
  }
});
test('七色碎片各有且仅有一次主线来源，章节颜色按五章剧情分布', () => {
  const expected = [['red'], ['orange', 'yellow'], ['green'], ['cyan', 'blue'], ['purple']];
  for (let index = 0; index < 5; index++) { const colors = D.mainQuests.filter(q => q.chapter === index + 1 && q.rainbow).map(q => q.rainbow); assert.deepEqual(plain(colors), expected[index]); assert.deepEqual(plain(D.storyChapters[index].colors), expected[index]); }
  assert.equal(new Set(D.mainQuests.filter(q => q.rainbow).map(q => q.rainbow)).size, 7); assert.deepEqual(Array.from(D.rainbowFragments, value => value.id), expected.flat());
});
test('彩虹入住早于结局，最终任务只需六片后发紫色，摄影主线不超过相册容量', () => {
  const ending = D.mainQuests.at(-1), rainbowFriend = D.mainQuests.findIndex(q => q.id === 'shy_rainbow_friend');
  assert.equal(ending.id, 'rainbow_party'); assert.equal(ending.ending, true); assert.equal(ending.rainbow, 'purple'); assert.ok(rainbowFriend < 28); assert.equal(D.mainQuests[rainbowFriend].chapter, 4);
  assert.deepEqual(plain(ending.conditions.map(({ metric, target }) => ({ metric, target }))), [{ metric: 'residentCount', target: 12 }, { metric: 'room_living', target: 1 }, { metric: 'rainbowCount', target: 6 }]);
  for (const q of D.mainQuests) for (const item of [q, ...(q.conditions || [])]) { if (item.metric === 'photos') assert.ok(item.target <= 12); if (item.metric === 'floors') assert.ok(item.target <= 4); if (item.metric === 'level') assert.ok(item.target <= D.balance.maxLevel); }
});
test('每章开篇与章末台词均有角色可用，音乐会和结局具有可重读剧情', () => {
  const speakers = new Set(['nuomi', ...D.residents.map(r => r.id)]);
  for (const chapter of D.storyChapters) { assert.ok(chapter.story.length >= 3 && chapter.story.length <= 5); assert.ok(chapter.completionStory.length >= 3); for (const line of [...chapter.story, ...chapter.completionStory]) { assert.ok(speakers.has(line.speaker)); assert.ok(typeof line.text === 'string' && line.text.length > 10); } }
  assert.equal(D.rainbowEnding.partyQuestId, 'rainbow_party'); assert.ok(D.rainbowEnding.story.length >= 3); assert.ok(D.rainbowEnding.closing); for (const line of D.rainbowEnding.story) assert.ok(speakers.has(line.speaker));
});
test('八类五阶成就共40项，阈值严格递增且摄影/房间/服装顶阶均可达', () => {
  assert.equal(D.achievementCategories.length, 8); assert.equal(D.achievements.length, 40); assert.equal(new Set(D.achievements.map(a => a.id)).size, 40);
  for (const category of D.achievementCategories) { const steps = D.achievements.filter(a => a.category === category.id); assert.equal(steps.length, 5); let before = 0; steps.forEach((step, index) => { assert.equal(step.tier, index + 1); assert.ok(step.target > before); assert.ok(validMetric(step.metric)); assert.ok(step.reward.coin > 0 && step.reward.exp > 0); assert.equal(step.reward.badge, step.id); before = step.target; }); }
  assert.deepEqual(Array.from(D.achievements.filter(a => a.category === 'photographer'), a => a.target), [1, 3, 5, 8, 12]); assert.ok(D.achievements.find(a => a.id === 'builder_5').target <= 12); assert.ok(D.achievements.find(a => a.id === 'fashion_5').target <= 60);
});
test('10件限定家具各有一次奖励归属，普通成就和两里程碑不重复发相同定义', () => {
  const rewards = [...D.achievements, ...D.milestoneRewards].filter(a => a.reward.itemId), itemIds = rewards.map(a => a.reward.itemId);
  assert.equal(itemIds.length, 10); assert.equal(new Set(itemIds).size, 10); assert.deepEqual(itemIds.slice().sort(), Object.values(D.achievementGiftById).slice().sort());
  for (const id of itemIds) { assert.ok(D.furnitureById[id].rewardOnly); assert.equal(D.furnitureById[id].source, 'achievement'); }
  assert.deepEqual(Array.from(D.milestoneRewards, a => a.id), ['rainbow', 'home_master']); assert.ok(D.dailyChestReward.coin > 0 && D.dailyChestReward.exp > 0 && D.dailyChestReward.heart > 0);
});
console.log('\n' + passed + ' 组主线/成就内容契约检查通过（无服务或浏览器）。');
