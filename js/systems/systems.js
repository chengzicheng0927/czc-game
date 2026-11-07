(function (Game) {
  'use strict';
  var B = Game.data.balance, D = Game.data, U = Game.utils, initialized = false, buying = false, gifting = false, relocating = false;
  var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var ok = function (message, extra) { return Object.assign({ ok: true, message: message || '' }, extra || {}); };
  var fail = function (message) { return { ok: false, message: message }; };
  var validNumber = function (n) { return typeof n === 'number' && Number.isFinite(n); };
  function memory(s, text) { s.memories.push({ at: Date.now(), text: text }); if (s.memories.length > B.maxMemories) s.memories.splice(0, s.memories.length - B.maxMemories); }
  function roomDef(type) { return D.rooms.find(function (r) { return r.id === type; }); }
  function residentDef(id) { return D.residents.find(function (r) { return r.id === id; }); }
  function needExp(lv) { return B.expBase + B.expStep * lv; }
  function expInto(s, value) {
    if (!validNumber(value) || value <= 0) return [];
    s.exp += Math.round(value); var levels = [];
    while (s.level < B.maxLevel && s.exp >= needExp(s.level)) { s.exp -= needExp(s.level); s.level += 1; levels.push(s.level); }
    if (s.level === B.maxLevel) s.exp = Math.min(s.exp, needExp(B.maxLevel));
    levels.forEach(function (level) { memory(s, '小屋升到 Lv.' + level + '，新的灵感正在云海里发芽。'); });
    return levels;
  }
  function emitLevels(levels) { levels.forEach(function (level) { Game.bus.emit('level:up', { level: level }); }); }
  function stats(s, name, amount) {
    s.quests.stats[name] = (s.quests.stats[name] || 0) + (amount || 1);
    s.quests.daily.list.forEach(function (entry) { var def = D.dailyQuests.find(function (q) { return q.id === entry.id; }); if (def && def.metric === name) { entry.progress += amount || 1; entry.done = entry.progress >= def.target; } });
  }
  function contentRooms(state) { return Game.contentSpaces.rooms(state || Game.state); }
  function contentRoom(id, state) { return Game.contentSpaces.get(id, state || Game.state); }
  function isRoomType(room, type) { return Game.contentSpaces.isType(room, type); }
  // 生活模块保留此生命周期钩子；自由建筑撤销由新编辑器独立管理。
  function clearUndo() {}
  Game.sys.economy = {
    needExp: needExp,
    // 供需要先保存再反馈的组合事务使用；只修改传入草稿，不发事件。
    expInto: expInto,
    buy: function (id, expectedPrice) {
      if (buying) return fail('这一件正在收好，稍等一下。');
      var def = typeof id === 'string' && own(D.furnitureById, id) ? D.furnitureById[id] : null; if (!def || def.customArt || def.rewardOnly) return fail('这是一份特别的礼物。');
      if (def.festivalId) { var available = Game.sys.time && Game.sys.time.canBuy(def); if (!available || !available.ok) return available || fail('等节日开始，再来挑选这份礼物吧。'); }
      if (def.unlockLv > Game.state.level) return fail('Lv.' + def.unlockLv + ' 就能把它带回家啦。');
      if (def.currency === 'none') return fail('这是一份特别的礼物。');
      if ((Game.state.inventory[id] || 0) >= 9999) return fail('这件家具的背包格已经满啦，先摆好一些再来。');
      var currency = def.currency || 'coin', have = Game.state.wallet[currency], price = Game.sys.deals ? Game.sys.deals.priceFor(id) : def.price;
      if (!validNumber(price) || price < 0) return fail('这件家具的价格还没有准备好。');
      if (expectedPrice !== undefined && price !== expectedPrice) return fail('今天的特惠已更新，请重新打开商店看看新价格。');
      if (have < price) return fail('还差 ' + Math.ceil(price - have) + (currency === 'heart' ? ' 颗爱心。' : ' 颗糖果。'));
      var levels; buying = true;
      try {
        Game.store.update(function (s) { s.wallet[currency] -= price; s.inventory[id] = (s.inventory[id] || 0) + 1; s.collection[id] = true; stats(s, 'bought'); levels = expInto(s, Math.max(1, Math.floor(price / B.purchaseExpDivisor))); memory(s, '把' + def.name + '装进背包' + (price < def.price ? '，今日八折花了 ' + price + ' 颗糖果。' : '，准备给小屋一点新惊喜。')); }, { persist: true });
        emitLevels(levels); Game.bus.emit('item:bought', { defId: id }); return ok('带回家啦！', { defId: id, price: price });
      } catch (error) { return fail(error.message || '这件家具还没保存好，请稍后再试。'); }
      finally { buying = false; }
    },
    addExp: function (value) { if (!validNumber(value) || value < 0 || value > 1000000) return fail('这份经验暂时无法领取。'); var levels; Game.store.update(function (s) { levels = expInto(s, value); }); emitLevels(levels); return ok(); },
    reward: function (coin, exp, reason) {
      if (!validNumber(coin) || !validNumber(exp) || coin < 0 || exp < 0 || coin > 1000000 || exp > 1000000) return fail('这份奖励暂时无法领取。');
      var levels; Game.store.update(function (s) { s.wallet.coin += Math.round(coin); levels = expInto(s, exp); if (reason) memory(s, String(reason).slice(0, 200) + '：收到 ' + Math.round(coin) + ' 颗糖果与 ' + Math.round(exp) + ' 点经验。'); });
      emitLevels(levels); Game.bus.emit('reward:received', { coin: Math.round(coin), exp: Math.round(exp), reason: reason }); return ok('甜甜的奖励收好啦！');
    }
  };
  // 装饰兼容接口只有只读评分；旧房间、旧坐标和库存差值撤销写链已退役。
  Game.sys.decorating = {
    clearUndo: clearUndo,
    score: function (roomId) {
      var room = contentRoom(roomId); if (!room) return 1;
      var definition = roomDef(room.type) || roomDef('bedroom'), comfort = 0, themes = {}, tags = {};
      room.items.forEach(function (item) {
        var furniture = D.furnitureById[item.defId]; if (!furniture) return;
        comfort += Number(furniture.comfort) || 0;
        if (furniture.theme) themes[furniture.theme] = (themes[furniture.theme] || 0) + 1;
        (furniture.tags || []).forEach(function (tag) { tags[tag] = true; });
      });
      var largest = Math.max.apply(null, [0].concat(Object.keys(themes).map(function (id) { return themes[id]; })));
      var score = 1 + (comfort >= definition.comfortCap / 2 ? 1 : 0) + (largest >= 6 ? 2 : largest >= 3 ? 1 : 0) + ((definition.required || []).some(function (tag) { return tags[tag]; }) ? 1 : 0);
      return U.clamp(score, 1, 5);
    }
  };
  function roomHas(room, tag) { return room.items.some(function (i) { return D.furnitureById[i.defId].tags.indexOf(tag) >= 0; }); }
  function qualifiedBedroom(id, room) {
    if (!isRoomType(room, 'bedroom')) return false;
    var definition = residentDef(id), admission = definition && definition.admission;
    if (admission) return (admission.requiredTags || []).every(function (tag) { return roomHas(room, tag); }) && (!admission.theme || room.items.filter(function (item) { return D.furnitureById[item.defId].theme === admission.theme; }).length >= (admission.themeCount || 1));
    if (id === 'lily') return roomHas(room, 'bed');
    if (id === 'pudding') return room.items.filter(function (i) { return D.furnitureById[i.defId].theme === 'forest'; }).length >= 3;
    return true;
  }
  function happiness(id, resident) {
    var def = residentDef(id), room = contentRoom(resident.roomId); if (!room) return 30;
    var favorites = room.items.filter(function (i) { return D.furnitureById[i.defId].theme === def.favoriteTheme || i.color === def.favoriteColor; }).length;
    return U.clamp(30 + Game.sys.decorating.score(resident.roomId) * 9 + favorites * 3 + (resident.interactDate === U.dateKey() ? 10 : 0), 0, 100);
  }
  function affectionLevel(value) { var level = 1; B.affectionLevels.forEach(function (need, index) { if (value >= need) level = index + 1; }); return level; }
  function relocation(id, state) {
    state = state || Game.state;
    var resident = state.residents[id], definition = residentDef(id), extra = { needed: false, roomIds: [] };
    if (!definition || !resident || !resident.movedIn) return Object.assign(fail('先邀请这位朋友入住吧。'), extra);
    if (contentRoom(resident.roomId, state)) return Object.assign(fail('朋友的房间还在，不需要重新安置。'), extra);
    var roomIds = Object.keys(contentRooms(state)).filter(function (roomId) {
      if (!qualifiedBedroom(id, contentRoom(roomId, state))) return false;
      return Object.keys(state.residents).filter(function (otherId) { var other = state.residents[otherId]; return otherId !== id && other.movedIn && other.roomId === roomId; }).length < B.maxResidentsPerRoom;
    });
    return { ok: roomIds.length > 0, needed: true, roomIds: roomIds, message: roomIds.length ? '给' + definition.name + '选一间现有卧室，继续住在一起吧。' : '先准备一间符合' + definition.name + '入住心愿且留有位置的卧室，再来重新安置吧。' };
  }
  Game.sys.residents = {
    affectionLevel: affectionLevel,
    relocation: relocation,
    relocate: function (id, roomId) {
      if (relocating) return fail('正在收好朋友的新地址，稍等一下。');
      var status = relocation(id); if (!status.ok) return status;
      if (status.roomIds.indexOf(roomId) < 0) return fail('为这位朋友选一间现有、合格且有空位的卧室吧。');
      var previous = Game.state.residents[id].roomId; relocating = true;
      try {
        Game.store.update(function (state) {
          var current = relocation(id, state);
          if (!current.ok || current.roomIds.indexOf(roomId) < 0) throw new Error('小屋刚刚有了变化，请重新选择卧室。');
          // 安置只修复地址，不重发入住奖励、不改友谊或库存，也不跟随建筑撤销回滚。
          state.residents[id].roomId = roomId;
          memory(state, '改建小屋后，为' + residentDef(id).name + '收好新的卧室地址，原来的友谊继续留在这里。');
        }, { persist: true });
        Game.bus.emit('resident:rehoused', { id: id, roomId: roomId, previousRoomId: previous });
        return ok(residentDef(id).name + '重新安置好啦，友谊和小心意都保留着。', { id: id, roomId: roomId });
      } catch (error) { return fail(error.message || '新地址还没有保存，朋友和原来的进度保持原样。'); }
      finally { relocating = false; }
    },
    eligibility: function (id) {
      var def = residentDef(id); if (!def) return Object.assign(fail('朋友还在云海的另一边。'), { roomIds: [], missing: [] });
      if (Game.state.residents[id] && Game.state.residents[id].movedIn) return Object.assign(fail(D.messages.duplicateResident), { roomIds: [], missing: [] });
      var admission = def.admission || { unlockLv: def.unlockLv, requiredRoomTypes: id === 'orange' ? ['studio'] : [] }, allRooms = Object.keys(contentRooms()), missing = [], needLevel = admission.unlockLv || def.unlockLv;
      if (Game.state.level < needLevel) missing.push({ type: 'level', text: '小屋达到 Lv.' + needLevel, panel: 'quests', progress: Game.state.level, target: needLevel });
      (admission.requiredRoomTypes || []).forEach(function (type) { if (!allRooms.some(function (key) { return isRoomType(contentRoom(key), type); })) missing.push({ type: 'room', text: '建造一间' + ((roomDef(type) || {}).name || type), panel: 'build', roomType: type, target: 1, progress: 0 }); });
      (admission.requiredHouseTags || []).forEach(function (tag) { if (!allRooms.some(function (key) { return roomHas(contentRoom(key), tag); })) missing.push({ type: 'furniture', text: '在小屋摆好' + ({ bathtub: '浴缸', bed: '小床', piano: '钢琴', mirror: '镜子' }[tag] || tag), panel: 'decor', tag: tag, target: 1, progress: 0 }); });
      if (admission.minRooms && allRooms.length < admission.minRooms) missing.push({ type: 'room', text: '建好 ' + admission.minRooms + ' 间房间', panel: 'build', target: admission.minRooms, progress: allRooms.length });
      var collected = Object.keys(Game.state.collection).filter(function (key) { return Game.state.collection[key]; }).length;
      if (admission.minCollection && collected < admission.minCollection) missing.push({ type: 'collection', text: '收集 ' + admission.minCollection + ' 种家具', panel: 'shop', target: admission.minCollection, progress: collected });
      if (admission.minChapter && Game.state.quests.main.chapter < admission.minChapter) missing.push({ type: 'chapter', text: '推进主线到第 ' + admission.minChapter + ' 章', panel: 'quests', target: admission.minChapter, progress: Game.state.quests.main.chapter });
      if (admission.houseTheme) { var most = Math.max.apply(null, [0].concat(allRooms.map(function (key) { return contentRoom(key).items.filter(function (item) { return D.furnitureById[item.defId].theme === admission.houseTheme; }).length; }))), need = admission.houseThemeCount || 3; if (most < need) missing.push({ type: 'theme', text: '一间房里摆好 ' + need + ' 件' + ((D.themes[admission.houseTheme] || {}).name || admission.houseTheme) + '家具', panel: 'decor', theme: admission.houseTheme, target: need, progress: most }); }
      var qualified = allRooms.filter(function (key) { var room = contentRoom(key); return isRoomType(room, admission.roomType || 'bedroom') && qualifiedBedroom(id, room); }), available = qualified.filter(function (key) { return Object.keys(Game.state.residents).filter(function (rid) { var resident = Game.state.residents[rid]; return resident.movedIn && resident.roomId === key; }).length < B.maxResidentsPerRoom; });
      if (!qualified.length) missing.push({ type: admission.theme ? 'theme' : 'room', text: def.requirement || '准备一间符合心愿的卧室', panel: admission.theme || (admission.requiredTags || []).length ? 'decor' : 'build', theme: admission.theme, roomType: 'bedroom' });
      else if (!available.length) missing.push({ type: 'space', text: '卧室里留一个入住位置（每间最多2位）', panel: 'build' });
      return missing.length ? Object.assign(fail(def.name + '希望：' + missing.map(function (entry) { return entry.text; }).join('；') + '。'), { roomIds: available, missing: missing }) : ok('朋友已经准备好来拜访啦。', { roomIds: available, missing: [] });
    },
    invite: function (id, roomId) {
      var eligible = Game.sys.residents.eligibility(id); if (!eligible.ok) return eligible;
      if (eligible.roomIds.indexOf(roomId) < 0) return fail('为这位朋友选一间符合心愿的卧室吧。');
      var def = residentDef(id), date = U.dateKey();
      Game.store.update(function (s) { var previous = s.residents[id]; s.residents[id] = Object.assign({ affection: 0, happiness: 70, heartBubbles: 0, lastBubbleAt: Date.now(), wish: null, wishLastClaimedDate: '', friendshipClaims: [], bestFriendBadge: false, patsToday: 0, interactDate: '', giftDate: '' }, previous || {}, { movedIn: true, roomId: roomId, lastBubbleAt: Date.now() }); memory(s, def.name + '搬进了小屋。' + def.intro); });
      Game.bus.emit('resident:moved_in', { id: id, roomId: roomId }); return ok(def.intro, { text: def.intro });
    },
    chat: function (id) {
      var r = Game.state.residents[id], def = residentDef(id); if (!r || !r.movedIn || !def) return fail('先邀请这位朋友入住吧。');
      var date = U.dateKey(), first = r.interactDate !== date, pool = def.chats.slice(), extra = (def.friendshipRewards || []).find(function (reward) { return reward.level === 1; });
      if ((r.friendshipClaims || []).indexOf(1) >= 0 && extra && extra.text) pool.push(extra.text);
      var text = pool[Math.floor(Math.random() * pool.length)];
      if (r.happiness < 40 && def.emotions) text = def.emotions[0];
      else if (Game.sys.time && Game.sys.time.current().phase === 'night' && def.emotions) text = def.emotions[2];
      if (date.slice(5) === def.birthday) text = def.birthdayText || '今天是我的生日！能和你一起庆祝，真开心。';
      Game.store.update(function (s) { var resident = s.residents[id]; resident.interactDate = date; if (first) resident.affection += B.chatAffection; resident.happiness = U.clamp(resident.happiness + 3, 0, 100); stats(s, 'chats'); });
      Game.bus.emit('resident:happy', { id: id, text: text }); return ok(text, { text: text });
    },
    pat: function (id) {
      var r = Game.state.residents[id], def = residentDef(id); if (!r || !r.movedIn || !def) return fail('先邀请这位朋友入住吧。');
      var today = U.dateKey(), pats = r.patDate === today ? r.patsToday : 0;
      if (pats >= B.patsPerDay) return fail('今天已经收下三次温暖的摸摸头啦，聊聊天吧。');
      Game.store.update(function (s) { var resident = s.residents[id]; resident.patDate = today; resident.patsToday = pats + 1; resident.interactDate = today; resident.affection += B.patAffection; resident.happiness = U.clamp(resident.happiness + 5, 0, 100); stats(s, 'pats'); memory(s, '轻轻摸摸' + def.name + '的头，收获一个软乎乎的笑容。'); });
      Game.bus.emit('resident:happy', { id: id }); return ok(def.emotions[1] + ' 好感 +' + B.patAffection);
    },
    giftOptions: function (id) {
      var def = residentDef(id); if (!def) return [];
      var options = [];
      ['cake_strawberry', 'cake_strawberry_deluxe', 'cake_blueberry_deluxe'].forEach(function (itemId) {
        var food = own(D.furnitureById, itemId) && D.furnitureById[itemId], count = Game.state.inventory[itemId] || 0;
        if (!food || count <= 0) return;
        var favorite = (def.favoriteGifts || []).indexOf(itemId) >= 0 || def.favoriteItem === food.name || !!food.giftCrop && (def.favoriteCrops || []).indexOf(food.giftCrop) >= 0;
        options.push({ id: itemId, name: food.name, count: count, favorite: favorite, type: 'food' });
      });
      (D.crops || []).forEach(function (crop) { var count = Game.state.garden.harvest[crop.id] || 0; if (count > 0) options.push({ id: crop.id, name: crop.name, count: count, favorite: (def.favoriteCrops || def.favoriteGifts || []).indexOf(crop.id) >= 0, type: 'crop' }); });
      return options;
    },
    gift: function (id, giftId) {
      if (gifting) return fail('这份心意正在收好，请稍等一下。');
      var r = Game.state.residents[id], def = residentDef(id); if (!r || !r.movedIn || !def) return fail('先邀请这位朋友入住吧。');
      var today = U.dateKey(); if (r.giftDate === today) return fail('今天的礼物已经好好收下啦，明天再带来惊喜吧。');
      var chosen = giftId === undefined || giftId === null ? 'cake_strawberry' : giftId;
      var option = Game.sys.residents.giftOptions(id).find(function (entry) { return entry.id === chosen; });
      if (!option) return fail(chosen === 'cake_strawberry' ? D.messages.giftEmpty : '礼物篮里没有这份心意，选一份真实拥有的花果或蛋糕吧。');
      var amount = (option.favorite ? 20 : 8) * (today.slice(5) === def.birthday ? 2 : 1), levels;
      if (r.affection + amount > 1000000) return fail('朋友已经收下好多心意啦，今天先一起聊聊天吧。');
      gifting = true;
      try {
        Game.store.update(function (s) { var resident = s.residents[id]; if (option.type === 'crop') s.garden.harvest[chosen] -= 1; else s.inventory[chosen] -= 1; resident.giftDate = today; resident.interactDate = today; resident.affection += amount; resident.happiness = U.clamp(resident.happiness + 10, 0, 100); stats(s, 'gifts'); levels = expInto(s, B.giftExp); memory(s, '把一份' + option.name + '送给' + def.name + '。' + (option.favorite ? '正是朋友最喜欢的小惊喜。' : '甜甜的心意，有朋友一起分享。')); }, { persist: true });
        emitLevels(levels); Game.bus.emit('resident:happy', { id: id, gift: chosen }); return ok('谢谢你的' + option.name + '！好感 +' + amount, { affection: amount, favorite: !!option.favorite, gift: chosen });
      } catch (error) { return fail(error.message || '心意还没保存好，请再试一次。'); }
      finally { gifting = false; }
    },
    collect: function (id) {
      var r = Game.state.residents[id]; if (!r || !r.movedIn || !r.heartBubbles) return fail('爱心正在慢慢长大，和朋友再待一会儿吧。');
      var amount = r.heartBubbles * Math.round(B.minBubbleHearts + (B.maxBubbleHearts - B.minBubbleHearts) * r.happiness / 100), levels;
      Game.store.update(function (s) { s.wallet.heart += amount; s.residents[id].heartBubbles = 0; s.residents[id].lastBubbleAt = Date.now(); levels = expInto(s, B.heartCollectExp); memory(s, '收下' + residentDef(id).name + '的 ' + amount + ' 颗爱心。'); });
      emitLevels(levels); Game.bus.emit('hearts:collected', { id: id, heart: amount }); return ok('收下 ' + amount + ' 颗爱心！', { heart: amount });
    },
    tick: function (now) {
      if (Game.store.canWrite && !Game.store.canWrite()) return ok();
      now = validNumber(now) ? now : Date.now(); var ids = Object.keys(Game.state.residents).filter(function (id) { return Game.state.residents[id].movedIn; });
      if (!ids.length) return ok();
      Game.store.update(function (s) { ids.forEach(function (id) { var r = s.residents[id]; r.happiness = happiness(id, r); var period = (B.maxBubbleMinutes - (B.maxBubbleMinutes - B.minBubbleMinutes) * r.happiness / 100) * 60000, elapsed = Math.min(B.maxOfflineMs, Math.max(0, now - r.lastBubbleAt)), bubbles = Math.floor(elapsed / period); if (r.heartBubbles >= B.maxBubbles) { r.lastBubbleAt = Math.max(r.lastBubbleAt, now); return; } if (bubbles > 0) { r.heartBubbles = Math.min(B.maxBubbles, r.heartBubbles + bubbles); r.lastBubbleAt = r.heartBubbles >= B.maxBubbles ? now : now - (elapsed % period); } }); });
      return ok();
    }
  };
  function metric(name) {
    var s = Game.state, rooms = Game.contentSpaces.entries(s).map(function (entry) { return { id: entry[0], room: entry[1] }; });
    if (name.indexOf('resident_') === 0) { var resident = s.residents[name.slice(9)]; return resident && resident.movedIn ? 1 : 0; }
    if (name === 'collection') return Object.keys(s.collection).filter(function (id) { return s.collection[id]; }).length;
    if (name === 'named') return s.house.name !== '我的小屋' || s.tutorial.step >= 2 ? 1 : 0;
    if (name === 'bedroom' || name === 'kitchen') return rooms.filter(function (r) { return isRoomType(r.room, name); }).length;
    if (name === 'bed') return rooms.some(function (r) { return isRoomType(r.room, 'bedroom') && roomHas(r.room, 'bed'); }) ? 1 : 0;
    if (['lily', 'pudding', 'orange'].indexOf(name) >= 0) return s.residents[name] && s.residents[name].movedIn ? 1 : 0;
    if (name === 'bedroomStars') return Math.max.apply(null, [0].concat(rooms.filter(function (r) { return isRoomType(r.room, 'bedroom'); }).map(function (r) { return Game.sys.decorating.score(r.id); })));
    return s.quests.stats[name] || 0;
  }
  Game.sys.quests = {
    list: function () {
      var claimed = Game.state.quests.main.claimed, nextIndex = D.mainQuests.findIndex(function (q) { return claimed.indexOf(q.id) < 0; });
      var main = D.mainQuests.map(function (q, index) { var wasClaimed = claimed.indexOf(q.id) >= 0, progress = wasClaimed ? q.target : Math.min(metric(q.metric), q.target); return Object.assign({}, q, { type: 'main', progress: progress, done: progress >= q.target, claimed: wasClaimed, locked: index > nextIndex && nextIndex >= 0 }); });
      return main.concat(Game.state.quests.daily.list.map(function (entry) { var def = D.dailyQuests.find(function (q) { return q.id === entry.id; }); return Object.assign({}, def, { type: 'daily', progress: Math.min(entry.progress, def.target), done: entry.progress >= def.target, claimed: entry.claimed, locked: false }); }));
    },
    claim: function (id) {
      var quest = Game.sys.quests.list().find(function (q) { return q.id === id; });
      if (!quest) return fail('这张任务卡暂时找不到啦。'); if (quest.claimed) return fail('奖励已经收好啦。'); if (quest.locked) return fail('先收下前面那张任务卡的奖励吧。'); if (!quest.done) return fail('再完成一点点，就能领到奖励啦。');
      var levels;
      Game.store.update(function (s) {
        if (quest.type === 'main') { s.quests.main.claimed.push(id); s.quests.main.index = s.quests.main.claimed.length; var nextQuest = D.mainQuests[s.quests.main.index]; s.quests.main.chapter = Math.max(s.quests.main.chapter, quest.chapter || (s.quests.main.index >= 8 ? 2 : 1), nextQuest && nextQuest.chapter || 1); }
        else s.quests.daily.list.find(function (entry) { return entry.id === id; }).claimed = true;
        s.wallet.coin += quest.reward.coin; levels = expInto(s, quest.reward.exp);
        if (quest.rainbow && s.rainbowPieces.indexOf(quest.rainbow) < 0) { s.rainbowPieces.push(quest.rainbow); memory(s, '找回一片' + ({ red: '红色', orange: '橙色', yellow: '黄色' }[quest.rainbow] || '') + '彩虹。朋友的笑容，让天空又亮了一点。'); }
        memory(s, '完成「' + quest.title + '」，收到 ' + quest.reward.coin + ' 颗糖果。');
      }); emitLevels(levels); Game.bus.emit('quest:claimed', { id: id }); return ok('任务完成，奖励收好啦！');
    }
  };
  function refreshDaily() {
    var today = U.dateKey();
    Game.store.update(function (s) {
      if (s.quests.daily.date < today) { s.quests.daily = { date: today, list: (D.dailyQuestsForDate ? D.dailyQuestsForDate(today) : D.dailyQuests.slice(0, 3)).map(function (q) { return { id: q.id, progress: 0, done: false, claimed: false }; }), chestClaimed: false }; }
      Object.keys(s.minigames).forEach(function (id) { if (s.minigames[id].date !== today) { s.minigames[id].date = today; s.minigames[id].playsToday = 0; } });
      if (s.daily.lastLoginDate < today) { s.daily.lastLoginDate = today; s.daily.loginDay = s.loginRewards.claimed % 7 + 1; s.daily.giftClaimed = s.loginRewards.lastClaimDate === today; s.daily.freeBoxUsed = false; memory(s, '新的一天，云海又送来一个温柔的早安。'); }
      Object.keys(s.residents).forEach(function (id) { if (s.residents[id].patDate !== today) { s.residents[id].patsToday = 0; s.residents[id].patDate = today; } });
    });
    if (Game.sys.residentWishes) Game.sys.residentWishes.refresh();
  }
  Game.sys.init = function () {
    if (Game.sys.collectionBook) Game.sys.collectionBook.init();
    if (Game.sys.gifts) Game.sys.gifts.init();
    if (Game.sys.login) Game.sys.login.init();
    if (Game.sys.observatory) Game.sys.observatory.init();
    clearUndo(); refreshDaily(); Game.sys.residents.tick(Date.now());
    if (Game.sys.garden && Game.sys.garden.init) Game.sys.garden.init();
    if (Game.sys.time && Game.sys.time.init) Game.sys.time.init();
    if (Game.sys.residentWishes) Game.sys.residentWishes.init();
    if (Game.sys.residentLife) Game.sys.residentLife.init();
    if (Game.sys.quests && Game.sys.quests.init) Game.sys.quests.init();
    if (initialized) return;
    initialized = true;
    Game.bus.on('state:replace', clearUndo);
    Game.bus.on('minigame:finished', function (event) { var game = D.minigames && D.minigames.find(function (entry) { return entry.id === (event && event.id); }), name = game ? game.name : event && event.id === 'bakery' ? '甜甜蛋糕屋' : '游乐场'; Game.store.update(function (s) { stats(s, 'minigamePlays'); memory(s, '在「' + name + '」收下一场快乐，' + ((event && event.stars) || 1) + ' 颗星星亮起来啦。'); }); });
    setInterval(function () { if (Game.store.canWrite && !Game.store.canWrite()) return; if (Game.state.quests.daily.date !== U.dateKey()) refreshDaily(); Game.sys.residents.tick(Date.now()); }, B.residentTickMs);
  };
})(window.Game);
