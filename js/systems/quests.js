/* 主线与成就只保存领取凭据；进度从真实小屋状态重新计算。 */
(function (G) {
  'use strict';
  const D = G.data, B = D.balance, colors = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple'];
  const colorNames = ['红', '橙', '黄', '绿', '青', '蓝', '紫'];
  const ok = (message, extra) => Object.assign({ ok: true, message }, extra || {});
  const fail = message => ({ ok: false, message });
  const state = () => G.state;
  function memory(s, text) { s.memories.push({ at: Date.now(), text }); if (s.memories.length > B.maxMemories) s.memories.splice(0, s.memories.length - B.maxMemories); }
  function experience(s, amount) {
    s.exp += amount || 0; const levels = [];
    while (s.level < B.maxLevel && s.exp >= B.expBase + B.expStep * s.level) { s.exp -= B.expBase + B.expStep * s.level; levels.push(++s.level); }
    if (s.level === B.maxLevel) s.exp = Math.min(s.exp, B.expBase + B.expStep * B.maxLevel);
    let capacity = B.floorUnlocks[0]; B.floorUnlocks.forEach(value => { if (s.level >= value.level) capacity = value; });
    while (s.house.floors.length < capacity.floors) s.house.floors.push({ slots: [null, null, null] });
    levels.forEach(level => memory(s, '小屋升到 Lv.' + level + '，新的故事正在云海里发芽。')); return levels;
  }
  function emitLevels(levels) { levels.forEach(level => G.bus.emit('level:up', { level })); }
  function metric(name) {
    const s = state(), rooms = Object.values(s.house.rooms), residents = Object.values(s.residents).filter(value => value.movedIn);
    if (!name) return 0;
    if (name.startsWith('resident_')) return s.residents[name.slice(9)]?.movedIn ? 1 : 0;
    if (name.startsWith('room_')) return rooms.filter(room => room.type === name.slice(5)).length;
    if (name.startsWith('theme_')) return rooms.reduce((n, room) => n + room.items.filter(item => D.furnitureById[item.defId]?.theme === name.slice(6)).length, 0);
    if (name === 'named') return s.house.name !== '我的小屋' || s.tutorial.step >= 2 ? 1 : 0;
    if (name === 'bedroom' || name === 'kitchen') return rooms.filter(room => room.type === name).length;
    if (name === 'bed') return rooms.some(room => room.type === 'bedroom' && room.items.some(item => D.furnitureById[item.defId]?.template === 'bed')) ? 1 : 0;
    if (['lily', 'pudding', 'orange'].includes(name)) return s.residents[name]?.movedIn ? 1 : 0;
    if (name === 'bedroomStars' || name === 'bestRoomStars') return Math.max(0, ...Object.entries(s.house.rooms).filter(([, room]) => name !== 'bedroomStars' || room.type === 'bedroom').map(([id]) => G.sys.decorating.score(id)));
    if (name === 'level') return s.level;
    if (name === 'floors') return s.house.floors.length;
    if (name === 'roomCount') return rooms.length;
    if (name === 'residentCount') return residents.length;
    if (name === 'maxAffection') return Math.max(0, ...residents.map(resident => resident.affection));
    if (name === 'collection') return Object.keys(s.collection).filter(id => s.collection[id]).length;
    if (name === 'outfitsOwned') return Object.keys(s.avatar.owned).filter(id => s.avatar.owned[id]).length;
    if (name === 'rainbowCount') return new Set(s.rainbowPieces).size;
    if (name === 'photos') return Math.max(s.quests.stats.photos || 0, s.album.length);
    return s.quests.stats[name] || 0;
  }
  function progress(definition, claimed) {
    const conditions = (definition.conditions || [{ metric: definition.metric, target: definition.target }]).map(condition => {
      const value = claimed ? condition.target : Math.min(condition.target, metric(condition.metric));
      return Object.assign({}, condition, { progress: value, done: value >= condition.target });
    });
    return { conditions: definition.conditions ? conditions : undefined, progress: definition.conditions ? conditions.filter(condition => condition.done).length : conditions[0].progress, target: definition.conditions ? conditions.length : definition.target, done: conditions.every(condition => condition.done) };
  }
  function firstMissing(s) { const index = D.mainQuests.findIndex(quest => !s.quests.main.claimed.includes(quest.id)); return index < 0 ? D.mainQuests.length : index; }
  function refreshDaily() {
    const today = G.utils.dateKey();
    if (state().quests.daily.date < today) G.store.update(s => { s.quests.daily = { date: today, list: D.dailyQuestsForDate(today).map(def => ({ id: def.id, progress: 0, done: false, claimed: false })), chestClaimed: false }; });
  }
  function list() {
    const s = state(), next = firstMissing(s);
    const main = D.mainQuests.map((quest, index) => {
      const claimed = s.quests.main.claimed.includes(quest.id);
      return Object.assign({}, quest, progress(quest, claimed), { type: 'main', claimed, locked: !claimed && index !== next });
    });
    const daily = s.quests.daily.list.map(entry => {
      const def = D.dailyQuests.find(quest => quest.id === entry.id);
      return Object.assign({}, def, { type: 'daily', progress: entry.claimed ? def.target : Math.min(entry.progress, def.target), done: entry.claimed || entry.progress >= def.target, claimed: entry.claimed, locked: s.quests.daily.date !== G.utils.dateKey() });
    });
    return main.concat(daily);
  }
  function pendingMilestones(s) {
    return (D.milestoneRewards || []).filter(def => !s.quests.milestoneClaims.includes(def.id) && (def.id === 'rainbow' ? new Set(s.rainbowPieces).size === 7 : def.id === 'home_master' && s.quests.main.claimed.length === D.mainQuests.length && new Set(s.rainbowPieces).size === 7));
  }
  function rewardFits(s, rewards) {
    let coin = s.wallet.coin, heart = s.wallet.heart; const items = {};
    for (const reward of rewards) { coin += reward.coin || 0; heart += reward.heart || 0; if (reward.outfitId && !D.outfitById?.[reward.outfitId]) return false; if (reward.itemId) { if (!D.furnitureById[reward.itemId]) return false; items[reward.itemId] = (items[reward.itemId] || 0) + 1; } }
    return coin <= 1000000000 && heart <= 1000000000 && Object.keys(items).every(id => (s.inventory[id] || 0) + items[id] <= 9999);
  }
  function give(s, reward) {
    s.wallet.coin += reward.coin || 0; s.wallet.heart += reward.heart || 0;
    if (reward.itemId) { s.inventory[reward.itemId] = (s.inventory[reward.itemId] || 0) + 1; s.collection[reward.itemId] = true; }
    if (reward.outfitId) s.avatar.owned[reward.outfitId] = true;
    return experience(s, reward.exp || 0);
  }
  function claim(id) {
    refreshDaily(); const quest = list().find(value => value.id === id);
    if (!quest) return fail('这张任务卡暂时找不到啦。');
    if (quest.claimed) return fail('这份奖励已经收好啦。');
    if (quest.locked) return fail(quest.type === 'daily' ? '请回到真实日期，再看今天的清单。' : '先收好当前任务的奖励，再继续故事吧。');
    if (!quest.done) return fail('还差一点点，按照任务卡里的提示试试看。');
    const preview = G.utils.clone(state());
    if (quest.type === 'main') { preview.quests.main.claimed.push(id); if (quest.rainbow && !preview.rainbowPieces.includes(quest.rainbow)) preview.rainbowPieces.push(quest.rainbow); }
    const milestones = pendingMilestones(preview);
    if (!rewardFits(state(), [quest.reward, ...milestones.map(def => def.reward)])) return fail('背包或糖果罐装满啦，先腾一点位置再来领奖。');
    let levels = [], chapterCompleted = null, endingUnlocked = false;
    G.store.update(s => {
      if (quest.type === 'main') {
        s.quests.main.claimed.push(id); s.quests.main.index = firstMissing(s);
        s.quests.main.chapter = Math.max(s.quests.main.chapter, quest.chapter || 1, D.mainQuests[s.quests.main.index]?.chapter || 1);
        if (quest.rainbow && !s.rainbowPieces.includes(quest.rainbow)) { s.rainbowPieces.push(quest.rainbow); memory(s, '找回' + colorNames[colors.indexOf(quest.rainbow)] + '色彩虹，天空又多了一点温柔。'); }
        if (D.mainQuests.filter(value => value.chapter === quest.chapter).every(value => s.quests.main.claimed.includes(value.id))) chapterCompleted = quest.chapter;
        endingUnlocked = s.quests.main.claimed.length === D.mainQuests.length && new Set(s.rainbowPieces).size === 7;
      } else s.quests.daily.list.find(entry => entry.id === id).claimed = true;
      levels.push(...give(s, quest.reward));
      milestones.forEach(def => { s.quests.milestoneClaims.push(def.id); levels.push(...give(s, def.reward)); memory(s, '收下「' + def.title + '」的纪念家具。'); });
      memory(s, '完成「' + quest.title + '」，收到 ' + quest.reward.coin + ' 颗糖果。');
    });
    emitLevels(levels); G.bus.emit('quest:claimed', { id, chapterCompleted, endingUnlocked, milestones });
    return ok('任务完成，礼物收好啦！', { reward: quest.reward, chapterCompleted, endingUnlocked, milestones });
  }
  function chapters() {
    const s = state(); return (D.storyChapters || []).map(def => {
      const quests = D.mainQuests.filter(quest => quest.chapter === def.id), done = quests.filter(quest => s.quests.main.claimed.includes(quest.id)).length;
      return Object.assign({}, def, { done, total: quests.length, available: def.id <= s.quests.main.chapter, complete: done === quests.length, storySeen: s.quests.main.storySeen.includes(def.id) });
    });
  }
  function ending() { return { unlocked: state().quests.main.claimed.length === D.mainQuests.length && new Set(state().rainbowPieces).size === 7, seen: state().quests.main.endingSeen }; }
  function dailyChest() {
    const daily = state().quests.daily, done = daily.list.filter(entry => entry.claimed).length;
    return { done, target: 3, claimed: daily.chestClaimed, available: daily.date === G.utils.dateKey() && done === 3 && !daily.chestClaimed, reward: Object.assign({}, D.dailyChestReward || { coin: 80, exp: 30, heart: 5 }) };
  }
  function claimDailyChest() {
    refreshDaily(); const chest = dailyChest(); if (!chest.available) return fail(chest.claimed ? '今天的宝箱已经收好啦。' : '收下今天三张任务卡的奖励后，再来打开宝箱吧。');
    if (!rewardFits(state(), [chest.reward])) return fail('糖果罐装满啦，先用掉一些再来。');
    let levels; G.store.update(s => { s.quests.daily.chestClaimed = true; levels = give(s, chest.reward); memory(s, '收好今天的三份小成长，打开每日宝箱。'); }); emitLevels(levels); G.bus.emit('quest:daily_chest', {}); return ok('每日宝箱打开啦！', { reward: chest.reward });
  }
  function achievementList(category) {
    return (D.achievements || []).filter(def => !category || def.category === category).map(def => {
      const claimed = state().quests.achievements[def.id] === true, locked = (D.achievements || []).some(previous => previous.category === def.category && previous.tier < def.tier && state().quests.achievements[previous.id] !== true), value = progress(def, claimed);
      return Object.assign({}, def, value, { claimed, locked, available: value.done && !claimed && !locked });
    });
  }
  function claimAchievement(id) {
    const value = achievementList().find(def => def.id === id);
    if (!value) return fail('这枚成就还没有来到小屋。'); if (value.claimed) return fail('这枚徽章已经收好啦。');
    if (value.locked) return fail('先收好这个类别前一阶的奖励吧。'); if (!value.done) return fail('继续收集一点点小成长吧。');
    if (!rewardFits(state(), [value.reward])) return fail('背包或糖果罐装满啦，先腾一点位置。');
    let levels; G.store.update(s => { s.quests.achievements[id] = true; levels = give(s, value.reward); memory(s, '点亮成就「' + value.title + '」，收下一枚成长徽章。'); });
    emitLevels(levels); G.bus.emit('achievement:claimed', { id, reward: value.reward }); return ok('成就点亮啦！', { reward: value.reward });
  }
  G.sys.quests = {
    list, claim, metric, chapters, ending, dailyChest, claimDailyChest,
    markStorySeen(id) { const chapter = chapters().find(value => value.id === id); if (!chapter?.available) return fail('这个章节还没有开始。'); if (!chapter.storySeen) G.store.update(s => { s.quests.main.storySeen.push(id); }); return ok('故事已经记住啦。'); },
    markEndingSeen() { if (!ending().unlocked) return fail('再找回一些彩虹颜色吧。'); if (!ending().seen) G.store.update(s => { s.quests.main.endingSeen = true; memory(s, '彩虹派对开始啦！从此，云上的小屋每天都有新的故事。'); }); return ok('欢迎回到自己的小屋。'); },
    init: refreshDaily
  };
  G.sys.achievements = {
    list: achievementList, claim: claimAchievement,
    categories() { return (D.achievementCategories || []).map(def => { const entries = achievementList(def.id); return Object.assign({}, def, { done: entries.filter(entry => entry.claimed).length, total: entries.length, ready: entries.filter(entry => entry.available).length }); }); },
    summary() { const entries = achievementList(); return { done: entries.filter(entry => entry.claimed).length, total: entries.length, ready: entries.filter(entry => entry.available).length, milestones: (D.milestoneRewards || []).map(def => Object.assign({}, def, { claimed: state().quests.milestoneClaims.includes(def.id), itemId: def.reward.itemId })) }; }
  };
})(window.Game);
