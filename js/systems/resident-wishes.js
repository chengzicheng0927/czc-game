/* 每日心愿保存定义ID与动作基线，奖励和进度均从真实内容/库存重新计算。 */
(function (G) {
  'use strict';
  const D = G.data, B = D.balance;
  let initialized = false, lastWorn = null;
  const countedSessions = new Set();
  const ok = (message, extra) => Object.assign({ ok: true, message: message || '' }, extra || {});
  const fail = message => ({ ok: false, message });
  const definition = id => D.residents.find(resident => resident.id === id);
  const currentResident = id => G.state.residents[id] && G.state.residents[id].movedIn ? G.state.residents[id] : null;
  const defFor = (id, wishId) => ((definition(id) || {}).wishes || []).find(wish => wish.id === wishId);
  const rooms = () => G.contentSpaces.list(G.state);
  const worn = avatar => ['top', 'bottom', 'dress', 'shoes'].map(key => avatar[key]).concat(avatar.acc || []).filter(Boolean);
  const count = (object, id) => object && object[id] || 0;
  const target = wish => wish.target || 1;
  const counterKey = wish => wish.type === 'activity' ? 'wish_activity_' + wish.gameId : wish.type === 'outfit' ? 'wish_wear_' + wish.outfitId : null;
  const counter = wish => counterKey(wish) ? G.state.quests.stats[counterKey(wish)] || 0 : 0;
  function hash(value) { let result = 2166136261; for (let i = 0; i < value.length; i++) result = Math.imul(result ^ value.charCodeAt(i), 16777619); return result >>> 0; }
  function memory(state, text) { state.memories.push({ at: Date.now(), text }); if (state.memories.length > B.maxMemories) state.memories.splice(0, state.memories.length - B.maxMemories); }
  function statistic(state, name, amount) { state.quests.stats[name] = (state.quests.stats[name] || 0) + amount; state.quests.daily.list.forEach(entry => { const quest = D.dailyQuests.find(value => value.id === entry.id); if (quest && quest.metric === name) { entry.progress += amount; entry.done = entry.progress >= quest.target; } }); }
  function experience(state, amount) {
    state.exp += amount; const levels = [];
    while (state.level < B.maxLevel && state.exp >= B.expBase + B.expStep * state.level) { state.exp -= B.expBase + B.expStep * state.level; state.level++; levels.push(state.level); }
    if (state.level === B.maxLevel) state.exp = Math.min(state.exp, B.expBase + B.expStep * B.maxLevel);
    levels.forEach(level => memory(state, '小屋升到 Lv.' + level + '，朋友的小心愿也添了一点光。')); return levels;
  }
  function roomHas(type) { return rooms().some(room => G.contentSpaces.isType(room, type)); }
  function reachable(wish) {
    const missing = [], need = wish.unlockLv || 1;
    if (G.state.level < need) missing.push({ type: 'level', text: '小屋达到 Lv.' + need, panel: 'quests', target: need, progress: G.state.level });
    if (wish.type === 'furniture') {
      const item = D.furnitureById[wish.itemId];
      if (!item || item.place === 'yard') missing.push({ type: 'content', text: '这件房间家具还没来到小屋', panel: 'shop' });
      else if (item.unlockLv > G.state.level || item.currency === 'none' && !count(G.state.inventory, item.id) && !rooms().some(room => room.items.some(entry => entry.defId === item.id))) missing.push({ type: 'level', text: '先解锁' + item.name, panel: 'shop', itemId: item.id, target: item.unlockLv, progress: G.state.level });
    } else if (wish.type === 'theme') {
      const theme = D.themes[wish.theme], available = D.furniture.filter(item => item.theme === wish.theme && item.place !== 'yard' && item.unlockLv <= G.state.level && item.currency !== 'none');
      if (!theme || theme.unlockLv > G.state.level || !available.length) missing.push({ type: 'theme', text: '先解锁' + ((theme || {}).name || '这个主题'), panel: 'shop', theme: wish.theme });
    } else if (wish.type === 'food' || wish.type === 'flower') {
      if (wish.cropId) { if (!D.cropById[wish.cropId] || G.state.level < D.gardenConfig.unlockLv) missing.push({ type: 'garden', text: '先开放小花园', panel: 'garden' }); }
      else if (wish.type === 'food' && wish.itemId === 'cake_strawberry') { if (!roomHas('kitchen')) missing.push({ type: 'room', text: '先建一间厨房，才能做点心', panel: 'build', roomType: 'kitchen' }); }
      else missing.push({ type: 'content', text: '这份心意还没准备好', panel: 'play' });
    } else if (wish.type === 'activity') {
      const game = (D.minigames || []).find(value => value.id === wish.gameId);
      if (!game || game.unlockLv > G.state.level) missing.push({ type: 'game', text: '先解锁这项小游戏', panel: 'play', gameId: wish.gameId });
      if (wish.gameId === 'bakery' && !roomHas('kitchen')) missing.push({ type: 'room', text: '先建一间厨房', panel: 'build', roomType: 'kitchen' });
    } else if (wish.type === 'outfit') {
      const outfit = D.outfitById && D.outfitById[wish.outfitId];
      if (!outfit || outfit.unlockLv > G.state.level || !G.state.avatar.owned[wish.outfitId] && outfit.source !== 'shop') missing.push({ type: 'outfit', text: '先在衣橱解锁这件衣服', panel: 'avatar', outfitId: wish.outfitId });
    } else missing.push({ type: 'content', text: '朋友还在准备新的小心愿', panel: 'residents' });
    return missing;
  }
  function refresh() {
    const today = G.utils.dateKey(), updates = [];
    Object.keys(G.state.residents).forEach(id => {
      const resident = currentResident(id), data = definition(id); if (!resident || !data || !data.wishes || !data.wishes.length) return;
      if (resident.wish && resident.wish.date >= today || (resident.wishLastClaimedDate || '') >= today) return;
      const possible = data.wishes.filter(wish => !reachable(wish).length).slice().sort((a, b) => hash(today + ':' + id + ':' + a.id) - hash(today + ':' + id + ':' + b.id) || a.id.localeCompare(b.id));
      if (!possible.length) return;
      const selected = possible[0]; updates.push({ id, wish: { date: today, defId: selected.id, generatedAt: Date.now(), baseline: counter(selected), claimed: false } });
    });
    if (updates.length) G.store.update(state => updates.forEach(update => { state.residents[update.id].wish = update.wish; }));
  }
  function measure(id, wish, saved) {
    const resident = currentResident(id), room = resident && G.contentSpaces.get(resident.roomId, G.state);
    if (wish.type === 'furniture') return room ? room.items.filter(item => item.defId === wish.itemId).length : 0;
    if (wish.type === 'theme') return room ? room.items.filter(item => D.furnitureById[item.defId].theme === wish.theme).length : 0;
    if (wish.type === 'food' || wish.type === 'flower') return wish.cropId ? count(G.state.garden.harvest, wish.cropId) : count(G.state.inventory, wish.itemId);
    if (wish.type === 'activity') return Math.max(0, counter(wish) - saved.baseline);
    if (wish.type === 'outfit') return worn(G.state.avatar).includes(wish.outfitId) && counter(wish) > saved.baseline ? 1 : 0;
    return 0;
  }
  function wishAction(wish) { return wish.type === 'furniture' ? { panel: count(G.state.inventory, wish.itemId) ? 'decor' : 'shop', itemId: wish.itemId } : wish.type === 'theme' ? { panel: 'decor', theme: wish.theme } : wish.type === 'activity' ? { panel: 'play', gameId: wish.gameId } : wish.type === 'outfit' ? { panel: 'avatar', outfitId: wish.outfitId } : wish.cropId ? { panel: 'garden', cropId: wish.cropId } : { panel: 'play', gameId: 'bakery' }; }
  function wishView(id) {
    const resident = currentResident(id), saved = resident && resident.wish, wish = saved && defFor(id, saved.defId), today = G.utils.dateKey();
    if (!resident) return { ok: false, text: '先邀请朋友入住，再一起实现小心愿吧。', missing: [], locked: true };
    if (!wish) return { ok: false, text: '朋友还在准备明天的小心愿。', missing: [], locked: true };
    const locked = saved.date !== today || (resident.wishLastClaimedDate || '') > today, progress = saved.claimed ? target(wish) : Math.min(target(wish), measure(id, wish, saved)), reward = { coin: 50 + hash(saved.date + ':' + id + ':' + wish.id) % 101, affection: 30, exp: 20, heart: 5 }, missing = reachable(wish);
    if (locked) missing.unshift({ type: 'date', text: '心愿日期和今天不同，请回到真实日期再来', panel: 'residents' });
    const action = missing.length ? Object.assign({}, missing[0], { panel: missing[0].panel || 'residents' }) : wishAction(wish);
    return { ok: true, id: wish.id, definition: wish, text: wish.text, date: saved.date, progress, target: target(wish), done: !locked && (saved.claimed || progress >= target(wish)), claimed: saved.claimed, locked, reward, missing, action };
  }
  function rewards(def) {
    return def.friendshipRewards || [
      { level: 1, kind: 'dialogue', title: '新的悄悄话', text: def.chats[0] },
      { level: 2, kind: 'outfit', title: '朋友的穿搭', outfitId: 'dress_pink' },
      { level: 3, kind: 'furniture', title: '专属小礼物', itemId: 'resident_' + def.id + '_gift' },
      { level: 4, kind: 'story', title: '我们的故事', lines: [def.intro] },
      { level: 5, kind: 'badge', title: '最好的朋友', itemId: 'frame_basic' }
    ];
  }
  function friendship(id) {
    const resident = currentResident(id), def = definition(id); if (!resident || !def) return { ok: false, level: 0, affection: 0, nextThreshold: 0, progress: 0, max: 1, steps: [], missing: [{ type: 'resident', text: '先邀请朋友入住', panel: 'residents' }] };
    const level = G.sys.residents.affectionLevel(resident.affection), thresholds = B.affectionLevels, next = level < 5 ? thresholds[level] : null, claims = resident.friendshipClaims || [];
    const steps = rewards(def).map(reward => { const needed = thresholds[reward.level - 1], unlocked = resident.affection >= needed, claimed = claims.includes(reward.level); return { level: reward.level, title: reward.title || ['新的悄悄话', '朋友的专属穿搭', '专属小礼物', '我们的故事', '最好的朋友'][reward.level - 1], description: reward.text || (reward.kind === 'outfit' ? '一份用心准备的穿搭' : reward.kind === 'story' ? '朋友想与你分享一段故事' : reward.kind === 'badge' ? '收下友情徽章与合照相框' : '一件朋友带来的专属家具'), threshold: needed, unlocked, claimed, available: unlocked && !claimed && claims.length === reward.level - 1, reward }; });
    return { ok: true, level, affection: resident.affection, nextThreshold: next, progress: next === null ? 1 : resident.affection - thresholds[level - 1], max: next === null ? 1 : next - thresholds[level - 1], bestFriendBadge: !!resident.bestFriendBadge, steps };
  }
  function claimWish(id) {
    refresh();
    const view = wishView(id), resident = currentResident(id), today = G.utils.dateKey(); if (!view.ok || view.locked) return fail(view.locked && view.missing[0] ? view.missing[0].text : view.text || '等今天的小心愿准备好，再来看看吧。');
    if (view.claimed || (resident.wishLastClaimedDate || '') >= today) return fail('今天的心愿礼物已经收好啦，明天再来创造新的回忆吧。');
    if (view.missing.length || !view.done) return fail('还差一点点：' + (view.missing[0] ? view.missing[0].text : view.text));
    const reward = view.reward; if (G.state.wallet.coin + reward.coin > 1000000000 || G.state.wallet.heart + reward.heart > 1000000000 || resident.affection + reward.affection > 1000000) return fail('小屋的心意罐已经装得很满啦，先用掉一些再来领取。');
    let levels = []; G.store.update(state => {
      const current = state.residents[id], wish = view.definition;
      if (wish.type === 'food' || wish.type === 'flower') { if (wish.cropId) state.garden.harvest[wish.cropId] -= target(wish); else state.inventory[wish.itemId] -= target(wish); }
      current.wish.claimed = true; current.wishLastClaimedDate = today; current.affection += reward.affection; current.happiness = Math.min(100, current.happiness + 8); state.wallet.coin += reward.coin; state.wallet.heart += reward.heart; statistic(state, 'wishesDone', 1); levels = experience(state, reward.exp); memory(state, '完成' + definition(id).name + '的心愿「' + view.text + '」，把一份小期待变成甜甜的回忆。');
    }); levels.forEach(level => G.bus.emit('level:up', { level })); G.bus.emit('resident:wish_claimed', { id, wishId: view.id, reward }); return ok('心愿实现啦！糖果 +' + reward.coin + ' · 好感 +30 · 经验 +20 · 爱心 +5', { reward });
  }
  function claimFriendship(id, level) {
    const status = friendship(id), resident = currentResident(id); if (!status.ok) return fail('先邀请这位朋友入住吧。'); if (!Number.isInteger(level) || level < 1 || level > 5) return fail('选一份已经解锁的友情礼物吧。');
    const step = status.steps.find(value => value.level === level); if (!step || step.claimed) return fail('这份友情礼物已经好好收下啦。'); if (!step.unlocked) return fail('好感达到 ' + step.threshold + '，就能收到这份心意啦。'); if ((resident.friendshipClaims || []).length !== level - 1) return fail('先收好前面那份友情礼物吧。');
    const reward = step.reward, furniture = reward.itemId && D.furnitureById[reward.itemId], outfit = reward.outfitId && D.outfitById && D.outfitById[reward.outfitId];
    if ((reward.kind === 'furniture' || reward.kind === 'badge') && !furniture || reward.kind === 'outfit' && !outfit) return fail('朋友正在认真准备这份礼物，再等一会儿吧。');
    if (furniture && (G.state.inventory[furniture.id] || 0) >= 9999) return fail('背包里同款礼物太多啦，先摆好一些再来收下。');
    G.store.update(state => { const current = state.residents[id]; current.friendshipClaims.push(level); if (outfit) state.avatar.owned[outfit.id] = true; if (furniture) { state.inventory[furniture.id] = (state.inventory[furniture.id] || 0) + 1; state.collection[furniture.id] = true; } if (level === 5) current.bestFriendBadge = true; memory(state, '和' + definition(id).name + '成为 Lv.' + level + ' 好朋友，收下「' + step.title + '」。'); });
    G.bus.emit('resident:friendship_claimed', { id, level, reward }); return ok('这份友情心意，已经好好收下啦。', { level, reward, story: reward.kind === 'story' ? reward.lines || [reward.text || '和你一起的每一天，都是温柔的小故事。'] : null });
  }
  function init() {
    refresh(); lastWorn = worn(G.state.avatar).slice().sort(); if (initialized) return; initialized = true;
    G.bus.on('resident:moved_in', refresh); G.bus.on('state:replace', () => { lastWorn = worn(G.state.avatar).slice().sort(); refresh(); });
    G.bus.on('minigame:finished', event => {
      const sessions = G.runtime.minigames && G.runtime.minigames.sessions, session = event && sessions && sessions.get(event.sessionId);
      if (!session || !session.finished || session.id !== event.id || countedSessions.has(event.sessionId)) return;
      // 午夜后的第一场结算先生成当天心愿，再把这次真实动作计入新基线之后。
      refresh(); countedSessions.add(event.sessionId); G.store.update(state => { const key = 'wish_activity_' + event.id; state.quests.stats[key] = Math.min(1000000000, (state.quests.stats[key] || 0) + 1); });
    });
    G.bus.on('avatar:worn', event => {
      if (!event || !Array.isArray(event.before) || !Array.isArray(event.after)) return;
      const actual = worn(G.state.avatar).slice().sort(), after = event.after.slice().sort(), before = event.before.slice().sort(); if (JSON.stringify(actual) !== JSON.stringify(after) || JSON.stringify(before) !== JSON.stringify(lastWorn)) return;
      const added = actual.filter(id => !before.includes(id)); lastWorn = actual; if (!added.length) return;
      refresh(); G.store.update(state => added.forEach(id => { const key = 'wish_wear_' + id; state.quests.stats[key] = Math.min(1000000000, (state.quests.stats[key] || 0) + 1); }));
    });
  }
  G.sys.residentWishes = { init, refresh, reachable, counterKey };
  G.sys.residents.wish = wishView; G.sys.residents.claimWish = claimWish; G.sys.residents.friendship = friendship; G.sys.residents.claimFriendship = claimFriendship;
})(window.Game);
