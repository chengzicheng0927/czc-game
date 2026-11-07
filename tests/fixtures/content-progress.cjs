'use strict';

// 任务面板的合法恢复检查点，验证当前任务的真实领奖；不冒充从新游戏逐项通关。
const assert = require('node:assert/strict');
const { setup } = require('./content-state.cjs');
const spaces = require('./free-spaces.cjs');
const snapshots = new Map();
const plain = value => JSON.parse(JSON.stringify(value));
function qaState(stopBefore = 'rainbow_party') {
  if (snapshots.has(stopBefore)) return plain(snapshots.get(stopBefore));
  const env = setup(), { G } = env;
  const index = G.data.mainQuests.findIndex(quest => quest.id === stopBefore);
  assert.ok(index >= 0, '检查点任务必须存在');
  G.store.update(state => { state.level = 30; state.wallet.coin = 1000000; state.house.name = '内容回归检查点'; state.tutorial.done = true; state.tutorial.step = 10; });
  const bedrooms = [];
  for (let position = 0; position < 6; position++) {
    const roomId = spaces.buildSpace(G, Math.floor(position / 3), position % 3).roomId;
    spaces.placeItem(G, 'bed_basic', roomId); bedrooms.push(roomId);
  }
  spaces.buildSpace(G, 2, 0, 'living');
  G.store.update(state => {
    // 模拟已恢复的入住历史；邀请资格的真实操作另由居民面板回归覆盖。
    G.data.residents.forEach((definition, position) => {
      state.residents[definition.id] = { movedIn: true, roomId: bedrooms[Math.floor(position / 2)], affection: 0, happiness: 70,
        heartBubbles: 0, lastBubbleAt: env.clock(), wish: null, wishLastClaimedDate: '', friendshipClaims: [], bestFriendBadge: false,
        patsToday: 0, interactDate: '', giftDate: '' };
    });
    const claimed = G.data.mainQuests.slice(0, index);
    state.quests.main.claimed = claimed.map(quest => quest.id); state.quests.main.index = index;
    state.quests.main.chapter = G.data.mainQuests[index].chapter;
    state.rainbowPieces = claimed.filter(quest => quest.rainbow).map(quest => quest.rainbow);
    state.quests.stats.wallpaperChanges = 1;
  }, { persist: true });
  const checkpoint = plain(G.store.validate(G.state)); snapshots.set(stopBefore, checkpoint);
  return plain(checkpoint);
}
module.exports = { qaState };
