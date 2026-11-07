'use strict';
// 演出规则的真实新空间准备；已领奖历史作为显式恢复检查点，非从头通关模拟。
const assert = require('node:assert/strict');
const { setup } = require('./content-state.cjs');
const spaces = require('./free-spaces.cjs');
function village(G) {
  G.store.update(state => { state.level = 30; state.wallet.coin = 100000; state.quests.main.chapter = 3; });
  const bedrooms = [spaces.buildSpace(G, 0, 0).roomId, spaces.buildSpace(G, 0, 1).roomId];
  bedrooms.forEach(id => spaces.placeItem(G, 'bed_basic', id));
  const music = spaces.buildSpace(G, 0, 2, 'music').roomId;
  // 波波需要浴室与真实浴缸；通过同一新空间夹具购买并放好，而非跳过入住资格。
  const bathroom = spaces.buildSpace(G, 1, 0, 'bathroom').roomId;
  for (let index = 0; index < 3; index++) spaces.placeItem(G, 'chair_ocean', music, 30 + index * 30);
  for (const id of ['lily', 'bobo', 'xingxing']) {
    const eligible = G.sys.residents.eligibility(id); assert.ok(eligible.ok, eligible.message);
    assert.ok(G.sys.residents.invite(id, eligible.roomIds[0]).ok);
  }
  return { bedrooms, auxiliary: { music, bathroom } };
}
function advance(G, built, stopBefore) {
  assert.equal(stopBefore, 'island_concert');
  const index = G.data.mainQuests.findIndex(quest => quest.id === stopBefore);
  assert.ok(index >= 0 && built.auxiliary.music);
  G.store.update(state => {
    const previous = G.data.mainQuests.slice(0, index);
    state.quests.main.claimed = previous.map(quest => quest.id); state.quests.main.index = index;
    state.quests.main.chapter = G.data.mainQuests[index].chapter;
    state.rainbowPieces = previous.filter(quest => quest.rainbow).map(quest => quest.rainbow);
  }, { persist: true });
}
module.exports = { setup, village, advance };
