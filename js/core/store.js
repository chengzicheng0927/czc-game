(function (Game) {
  'use strict';
  var B = Game.data.balance, gardenConfig = Game.data.gardenConfig;
  var minigameIds = ['bakery', 'match3', 'catch_stars', 'memory'];
  var writeGuard = null;
  function permission(source, operation, next) {
    if (!writeGuard) return { ok: true };
    try { var result = writeGuard({ source: source || 'local', operation: operation || 'check', next: next }); return result === true || (result && result.ok === true) ? { ok: true } : { ok: false, message: result && result.message || '这座小屋正在另一页打开。请先在账号面板选择在此页继续；当前进度仍可下载JSON。' }; }
    catch (error) { return { ok: false, message: error && error.message || '暂时无法确认小屋的本机保存位置，请先下载JSON备份。' }; }
  }
  function assertWritable(source, operation, next) { var result = permission(source, operation, next); if (!result.ok) throw new Error(result.message); }
  var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var record = function (v) { if (!v || Object.prototype.toString.call(v) !== '[object Object]') return false; var proto = Object.getPrototypeOf(v); return proto === null || Object.getPrototypeOf(proto) === null; };
  var integer = function (v, min, max) { return Number.isInteger(v) && v >= min && v <= max; };
  var number = function (v, min, max) { return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max; };
  var string = function (v, max) { return typeof v === 'string' && v.length <= max; };
  var color = function (v) { return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v); };
  var date = function (value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    var parts = value.split('-').map(Number), year = parts[0], month = parts[1], day = parts[2], leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  };
  var birthday = function (v) {
    if (v === '') return true;
    if (typeof v !== 'string' || !/^\d{2}-\d{2}$/.test(v)) return false;
    var parts = v.split('-').map(Number), month = parts[0], day = parts[1];
    // 生日不含年份，允许闰年出生的小朋友填写 2 月 29 日。
    return month >= 1 && month <= 12 && day >= 1 && day <= [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  };
  var validId = function (v) { return typeof v === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v); };
  function invalid(reason) { throw new Error(reason || Game.data.messages.invalid); }
  function check(condition, reason) { if (!condition) invalid(reason); }
  // 仅阁楼新结构使用精确字段；普通房间仍沿用原有兼容校验。
  function shape(value, keys, optional) {
    check(record(value)); optional = optional || [];
    check(Object.keys(value).every(function (key) { return keys.indexOf(key) >= 0; }));
    check(keys.every(function (key) { return optional.indexOf(key) >= 0 || own(value, key); }));
  }
  var atticRoomId = 'attic:observatory';
  function newAtticRoom() {
    // 早期规则夹具不加载观星数据；保留同一套合法空房常量，不依赖新增脚本。
    var config = Game.data.observatoryAtticConfig || { wallpaper: { pattern: 'stars', color: '#EDDDE7', color2: '#FFF8FB' }, floor: { pattern: 'wood', color: '#EED7B9' }, light: 'star' };
    return { wallpaper: Game.utils.clone(config.wallpaper), floor: Game.utils.clone(config.floor), light: config.light, items: [] };
  }
  function decorRoom(state, id) {
    if (!record(state) || !record(state.house) || typeof id !== 'string') return null;
    if (id === atticRoomId) return record(state.house.attic) && state.house.attic.type === 'observatory' && record(state.house.attic.room) ? state.house.attic.room : null;
    return validId(id) && record(state.house.rooms) && own(state.house.rooms, id) && record(state.house.rooms[id]) ? state.house.rooms[id] : null;
  }
  function decorRooms(state) {
    if (!record(state) || !record(state.house) || !record(state.house.rooms)) return [];
    var result = [];
    Object.keys(state.house.rooms).forEach(function (id) { var room = decorRoom(state, id); if (room) result.push([id, room]); });
    var attic = decorRoom(state, atticRoomId); if (attic) result.push([atticRoomId, attic]);
    return result;
  }
  function replaceDecorRoom(state, id, room) {
    if (!record(room) || !decorRoom(state, id)) return false;
    if (id === atticRoomId) state.house.attic.room = room;
    else state.house.rooms[id] = room;
    return true;
  }
  function deepSafety(value, depth, counter) {
    check(depth <= 25 && ++counter.count <= 60000);
    if (value === null || typeof value === 'boolean') return;
    if (typeof value === 'number') return check(Number.isFinite(value));
    if (typeof value === 'string') return check(value.length <= 300000);
    check(record(value) || Array.isArray(value));
    check(Object.keys(value).length <= 2000);
    Object.keys(value).forEach(function (key) { check(key !== '__proto__' && key !== 'constructor' && key !== 'prototype', '存档含有不安全字段，已拒绝导入。'); deepSafety(value[key], depth + 1, counter); });
  }
  function defaultState() {
    var date = Game.utils.dateKey(), now = Date.now(), minigames = {};
    minigameIds.forEach(function (id) { minigames[id] = { best: 0, playsToday: 0, date: date }; });
    return {
      version: B.version,
      profile: { name: '小设计师', birthday: '06-01', createdAt: now, playTimeSec: 0 },
      wallet: { coin: B.initialCoin, heart: B.initialHeart }, level: 1, exp: 0,
      house: { name: '我的小屋', exterior: Game.data.defaultExterior ? Game.data.defaultExterior() : { roof: 'roof_triangle', roofColor: '#FF9FB5', wall: 'wall_wood', wallColor: '#FFE3C9', window: 'win_square', door: 'door_wood', chimney: 'normal' }, floors: [{ slots: [null, null, null] }], attic: null, rooms: {}, yard: { items: [] } },
      inventory: Game.utils.clone(Game.data.starterItems), collection: { bed_basic: true, nightstand_basic: true, desk_lamp_basic: true },
      residents: {}, residentNotices: [],
      quests: { main: { schema: 2, chapter: 1, index: 0, claimed: [], storySeen: [], endingSeen: false }, daily: { date: date, list: Game.data.dailyQuestsForDate(date).map(function (q) { return { id: q.id, progress: 0, done: false, claimed: false }; }), chestClaimed: false }, achievements: {}, milestoneClaims: [], stats: { itemsPlaced: 0, minigamePlays: 0, bakeryPlays: 0, bakeryOrders: 0, harvests: 0, wishesDone: 0, photos: 0, bought: 0, wallpaperChanges: 0, floorChanges: 0, chats: 0, pats: 0, gifts: 0, roomsBuilt: 0, concerts: 0 } },
      garden: { plots: Array(gardenConfig.basePlots).fill(null), seeds: Game.utils.clone(gardenConfig.starterSeeds), harvest: {} },
      crafting: { counts: {}, last: null },
      observatory: { fragments: 0, observations: 0, lastDate: '', lastDiscovery: null }, loginRewards: { claimed: 0, lastClaimDate: '', lastReward: null },
      calendar: { claimed: {} }, giftBox: { date: date, freeUsed: false, opened: 0, lastReward: null },
      avatar: Game.data.defaultAvatar ? Game.data.defaultAvatar() : { skin: 0, hair: 'twin_tails', hairColor: '#8B5A3C', face: 'smile', top: null, bottom: null, dress: 'dress_pink', shoes: 'shoes_mary', acc: ['bow_red'], outfits: [], owned: {} },
      pet: null, rainbowPieces: [], minigames: minigames, album: [], albumTrash: [], collectionBook: { crops: [], themeClaims: [] }, customArts: [],
      settings: { music: 0.22, sfx: 0.45, tts: false, audioVersion: 2, ttsVoice: '', restReminder: true, dayMode: 'real' },
      daily: { lastLoginDate: date, loginDay: 1, giftClaimed: false, freeBoxUsed: false },
      tutorial: { step: 0, done: false, seenTips: {} },
      memories: [{ at: now, text: '糯米送来一床甜梦。云上的小屋，从今天开始。' }]
    };
  }
  // 仅补齐同版本缺少的字段，不用默认值掩盖类型错误。
  function mergeDefaults(target, defaults) {
    Object.keys(defaults).forEach(function (key) {
      if (!own(target, key)) target[key] = Game.utils.clone(defaults[key]);
      else if (record(target[key]) && record(defaults[key])) mergeDefaults(target[key], defaults[key]);
    });
    return target;
  }
  function validate(raw) {
    deepSafety(raw, 0, { count: 0 });
    check(record(raw) && integer(raw.version, 1, 10000));
    check(raw.version <= B.version, Game.data.messages.future);
    check(raw.version === B.version, '这个存档版本暂不支持。');
    // 必需部分先校验；可选的新字段随后迁移补齐。
    check(record(raw.house) && record(raw.wallet) && record(raw.inventory));
    check(record(raw.house.rooms) && Array.isArray(raw.house.floors));
    var oldAudio = !record(raw.settings) || !own(raw.settings, 'audioVersion') || raw.settings.audioVersion === 1;
    var oldQuestBook = !record(raw.quests) || !record(raw.quests.main) || !own(raw.quests.main, 'schema');
    var s = mergeDefaults(Game.utils.clone(raw), defaultState());
    if (!own(raw, 'giftBox') && record(raw.daily)) s.giftBox = { date: s.daily.lastLoginDate === '' ? Game.utils.dateKey() : s.daily.lastLoginDate, freeUsed: s.daily.freeBoxUsed, opened: 0, lastReward: null };
    // 新玩法仅迁移整个缺失字段，拒绝把残缺记录补成看似完整的奖励凭据。
    ['observatory', 'loginRewards', 'crafting'].forEach(function (key) { if (own(raw, key)) s[key] = Game.utils.clone(raw[key]); });
    if (!own(raw, 'loginRewards') && record(raw.daily) && raw.daily.giftClaimed === true) s.loginRewards = { claimed: 1, lastClaimDate: date(raw.daily.lastLoginDate) ? raw.daily.lastLoginDate : Game.utils.dateKey(), lastReward: null };
    // 库存字典允许为空；不能把已用完的种子当作缺少新字段再送一遍。
    if (record(raw.garden) && record(raw.garden.seeds)) s.garden.seeds = Game.utils.clone(raw.garden.seeds);
    // 整款小游戏缺失属于旧版迁移；已存在但残缺的成绩记录必须拒绝。
    if (record(raw.minigames)) Object.keys(raw.minigames).forEach(function (id) { s.minigames[id] = Game.utils.clone(raw.minigames[id]); });
    // 旧档没有累计烘焙数，只保留可确认的最高订单/今日局数下限。
    if (record(s.quests) && record(s.quests.stats) && record(s.minigames.bakery)) {
      var oldStats = record(raw.quests) && record(raw.quests.stats) ? raw.quests.stats : {};
      if (!own(oldStats, 'bakeryOrders')) s.quests.stats.bakeryOrders = s.minigames.bakery.best;
      if (!own(oldStats, 'bakeryPlays')) s.quests.stats.bakeryPlays = Math.max(s.minigames.bakery.playsToday, s.minigames.bakery.best > 0 ? 1 : 0);
    }
    // 音频升级保留静音和更低音量，替换旧默认电子音与机械朗读偏好。
    if (oldAudio) { check(record(s.settings) && number(s.settings.music, 0, 1) && number(s.settings.sfx, 0, 1) && typeof s.settings.tts === 'boolean'); s.settings.music = Math.min(s.settings.music, 0.22); s.settings.sfx = Math.min(s.settings.sfx, 0.45); s.settings.tts = false; s.settings.audioVersion = 2; s.settings.ttsVoice = ''; }
    check(record(s.profile) && string(s.profile.name, 24) && birthday(s.profile.birthday));
    check(number(s.profile.createdAt, 0, 9007199254740991) && number(s.profile.playTimeSec, 0, 9007199254740991));
    check(number(s.wallet.coin, 0, 1000000000) && number(s.wallet.heart, 0, 1000000000));
    check(integer(s.level, 1, B.maxLevel) && number(s.exp, 0, 100000000));
    check(string(s.house.name, 32) && s.house.name.trim().length > 0);
    if (Game.data.normalizeExterior) {
      s.house.exterior = Game.data.normalizeExterior(s.house.exterior);
      check(Game.data.validateExterior(s.house.exterior), '小屋外观存档有误，请使用完整存档恢复。');
    } else {
      check(record(s.house.exterior) && color(s.house.exterior.roofColor) && color(s.house.exterior.wallColor));
      Object.keys(s.house.exterior).forEach(function (k) { check(string(s.house.exterior[k], 64)); });
    }
    check(s.house.floors.length >= 1 && s.house.floors.length <= 4 && Object.keys(s.house.rooms).length <= 12);
    check(Array.isArray(s.customArts) && s.customArts.length <= 20);
    var artIds = Object.create(null), placedArtIds = Object.create(null);
    s.customArts.forEach(function (art) {
      check(record(art) && Object.keys(art).length === 3 && ['id', 'name', 'pixels'].every(function (key) { return own(art, key); }));
      check(validId(art.id) && !artIds[art.id] && string(art.name, 40) && art.name.trim().length > 0 && Array.from(art.name).length <= 20 && !/[\x00-\x1F\x7F]/.test(art.name));
      check(typeof art.pixels === 'string' && /^[.0-9a-n]{256}$/.test(art.pixels)); artIds[art.id] = true;
    });
    var roomRefs = Object.create(null), itemIds = Object.create(null), count = 0;
    s.house.floors.forEach(function (floor) { check(record(floor) && Array.isArray(floor.slots) && floor.slots.length === 3); floor.slots.forEach(function (roomId) { check(roomId === null || validId(roomId)); if (roomId !== null) { check(!roomRefs[roomId] && own(s.house.rooms, roomId)); roomRefs[roomId] = true; } }); });
    if (s.house.attic !== null) {
      var attic = s.house.attic;
      shape(attic, ['type', 'paidPrice', 'builtAt', 'room'], ['room']);
      check(attic.type === 'observatory' && attic.paidPrice === 1000 && integer(attic.builtAt, 0, 8640000000000000) && s.level >= 17);
      // 只迁移恰为旧三字段的完整凭据；已有但残缺的布置不得补成空房。
      if (!own(attic, 'room')) attic.room = newAtticRoom();
      shape(attic.room, ['wallpaper', 'floor', 'light', 'items']);
    }
    var sky = s.observatory;
    check(record(sky) && Object.keys(sky).length === 4 && ['fragments', 'observations', 'lastDate', 'lastDiscovery'].every(function (key) { return own(sky, key); }));
    check(integer(sky.observations, 0, 333333333) && integer(sky.fragments, 0, 1000000000) && sky.fragments === sky.observations * 3);
    if (sky.observations === 0) check(sky.lastDate === '' && sky.lastDiscovery === null);
    else {
      var discovery = sky.lastDiscovery;
      check(s.house.attic !== null && date(sky.lastDate) && record(discovery) && Object.keys(discovery).length === 4 && ['id', 'at', 'date', 'fragments'].every(function (key) { return own(discovery, key); }));
      check((Game.data.constellationById ? own(Game.data.constellationById, discovery.id) : ['marshmallow_rabbit', 'sugar_swan', 'sleeping_cat', 'little_whale', 'honey_bear', 'rainbow_deer'].indexOf(discovery.id) >= 0) && integer(discovery.at, 0, 8640000000000000) && discovery.date === sky.lastDate && discovery.fragments === 3);
    }
    function validateRoomContents(r, strict) {
      if (strict) {
        shape(r.wallpaper, r.wallpaper && r.wallpaper.pattern === 'custom' ? ['pattern', 'color', 'color2', 'artId'] : ['pattern', 'color', 'color2']);
        shape(r.floor, ['pattern', 'color']);
      }
      check(record(r.wallpaper) && color(r.wallpaper.color) && color(r.wallpaper.color2));
      check(r.wallpaper.pattern === 'custom' ? validId(r.wallpaper.artId) && !!artIds[r.wallpaper.artId] : B.wallpaperPatterns.indexOf(r.wallpaper.pattern) >= 0 && !own(r.wallpaper, 'artId'));
      check(record(r.floor) && B.floorPatterns.indexOf(r.floor.pattern) >= 0 && color(r.floor.color));
      check(['warm', 'cool', 'colorful', 'star'].indexOf(r.light) >= 0 && Array.isArray(r.items) && r.items.length <= B.maxItems);
      var localIds = Object.create(null);
      r.items.forEach(function (i) {
        count += 1; check(record(i) && validId(i.uid) && !itemIds[i.uid] && own(Game.data.furnitureById, i.defId));
        itemIds[i.uid] = true; localIds[i.uid] = i;
        var d = Game.data.furnitureById[i.defId]; check(d.place !== 'yard');
        if (strict) {
          check(validId(i.defId));
          var keys = ['uid', 'defId', 'x', 'y', 'z', 'flip', 'color', 'parent'];
          if (d.customArt) keys.push('artId');
          if (d.place === 'floor') keys.push('depth');
          shape(i, keys, d.place === 'floor' ? ['depth'] : []);
        }
        if (d.customArt) { check(validId(i.artId) && !!artIds[i.artId] && !placedArtIds[i.artId] && i.parent === null && number(i.y, B.ceilingLine, B.wallBottom - d.h)); placedArtIds[i.artId] = true; } else check(!own(i, 'artId'));
        if (d.place === 'floor') { if (!own(i, 'depth')) i.depth = 0.75; check(number(i.depth, 0, 1)); }
        else check(!own(i, 'depth'));
        check(number(i.x, 0, B.roomWidth - d.w) && number(i.y, -B.roomHeight, B.roomHeight) && number(i.z, -10000, 10000));
        check(typeof i.flip === 'boolean' && (i.color === null || color(i.color)) && (i.parent === null || validId(i.parent)));
      });
      r.items.forEach(function (i) { if (i.parent !== null) { var p = localIds[i.parent]; check(p && p.uid !== i.uid && Game.data.furnitureById[p.defId].surface && Game.data.furnitureById[i.defId].place === 'table' && p.parent === null); } });
    }
    Object.keys(s.house.rooms).forEach(function (roomId) {
      check(validId(roomId) && roomRefs[roomId]);
      var r = s.house.rooms[roomId];
      check(record(r) && Game.data.rooms.some(function (d) { return d.id === r.type; }));
      if (!own(r, 'paidPrice')) r.paidPrice = Game.data.rooms.find(function (d) { return d.id === r.type; }).price;
      check(number(r.paidPrice, 0, 10000));
      validateRoomContents(r, false);
    });
    if (s.house.attic !== null) validateRoomContents(s.house.attic.room, true);
    check(record(s.house.yard) && Array.isArray(s.house.yard.items) && s.house.yard.items.length <= 120);
    var yardBounds = (Game.data.yardConfig || {}).bounds || { left: -650, right: 650, top: 20, bottom: 270 };
    s.house.yard.items.forEach(function (item) {
      count++; check(record(item) && validId(item.uid) && !itemIds[item.uid] && own(Game.data.furnitureById, item.defId)); itemIds[item.uid] = true;
      var def = Game.data.furnitureById[item.defId]; check(def.place === 'yard');
      check(number(item.x, yardBounds.left, yardBounds.right - def.w) && number(item.y, yardBounds.top, yardBounds.bottom - def.h) && number(item.z, -10000, 10000));
      check(typeof item.flip === 'boolean' && (item.color === null || color(item.color)));
    });
    check(count <= B.maxItems);
    check(record(s.inventory) && record(s.collection));
    Object.keys(s.inventory).forEach(function (id) { check(own(Game.data.furnitureById, id) && !Game.data.furnitureById[id].customArt && integer(s.inventory[id], 0, 9999)); });
    Object.keys(s.collection).forEach(function (id) { check(own(Game.data.furnitureById, id) && !Game.data.furnitureById[id].customArt && typeof s.collection[id] === 'boolean'); });
    check(Array.isArray(s.residentNotices) && s.residentNotices.length <= Game.data.residents.length && new Set(s.residentNotices).size === s.residentNotices.length);
    s.residentNotices.forEach(function (id) { check(Game.data.residents.some(function (def) { return def.id === id; })); });
    check(record(s.residents) && Object.keys(s.residents).length <= Game.data.residents.length);
    Object.keys(s.residents).forEach(function (id) {
      var r = s.residents[id]; check(Game.data.residents.some(function (d) { return d.id === id; }) && record(r));
      check(typeof r.movedIn === 'boolean' && (!r.movedIn || (own(s.house.rooms, r.roomId) && s.house.rooms[r.roomId].type === 'bedroom')));
      check(number(r.affection, 0, 1000000) && number(r.happiness, 0, 100) && integer(r.heartBubbles, 0, B.maxBubbles) && number(r.lastBubbleAt, 0, 9007199254740991) && integer(r.patsToday, 0, B.patsPerDay));
      if (!own(r, 'interactDate')) r.interactDate = Game.utils.dateKey();
      check(string(r.interactDate, 10));
      if (!own(r, 'giftDate')) r.giftDate = '';
      check(string(r.giftDate, 10));
      if (!own(r, 'wish')) r.wish = null;
      if (!own(r, 'wishLastClaimedDate')) r.wishLastClaimedDate = '';
      if (!own(r, 'friendshipClaims')) r.friendshipClaims = [];
      if (!own(r, 'bestFriendBadge')) r.bestFriendBadge = false;
      check(r.wishLastClaimedDate === '' || date(r.wishLastClaimedDate));
      check(Array.isArray(r.friendshipClaims) && r.friendshipClaims.length <= 5);
      r.friendshipClaims.forEach(function (level, index) { check(level === index + 1 && r.affection >= B.affectionLevels[level - 1]); });
      check(typeof r.bestFriendBadge === 'boolean' && r.bestFriendBadge === (r.friendshipClaims.indexOf(5) >= 0));
      // 早期仅用于显示的占位心愿没有可领取奖励，迁移时清空并在启动后生成真实心愿。
      if (record(r.wish) && !own(r.wish, 'defId') && Object.keys(r.wish).length > 0 && Object.keys(r.wish).every(function (key) { return ['text', 'description', 'done'].indexOf(key) >= 0; }) && (!own(r.wish, 'text') || string(r.wish.text, 300)) && (!own(r.wish, 'description') || string(r.wish.description, 300)) && (!own(r.wish, 'done') || typeof r.wish.done === 'boolean')) r.wish = null;
      check(r.wish === null || record(r.wish));
      if (r.wish !== null) {
        var wish = r.wish, residentDefinition = Game.data.residents.find(function (entry) { return entry.id === id; }), wishDefinition = (residentDefinition.wishes || []).find(function (entry) { return entry.id === wish.defId; });
        check(Object.keys(wish).length === 5 && Object.keys(wish).every(function (key) { return ['date', 'defId', 'generatedAt', 'baseline', 'claimed'].indexOf(key) >= 0; }));
        // date 是生成时的本地逻辑日期。跨时区导入时不按当前时区反算并拒载。
        check(wishDefinition && date(wish.date) && integer(wish.generatedAt, 0, 8640000000000000) && integer(wish.baseline, 0, 1000000000) && typeof wish.claimed === 'boolean');
        var counterName = wishDefinition.type === 'activity' ? 'wish_activity_' + wishDefinition.gameId : wishDefinition.type === 'outfit' ? 'wish_wear_' + wishDefinition.outfitId : null, counterValue = counterName ? ((s.quests && s.quests.stats) || {})[counterName] || 0 : 0;
        check(counterName ? integer(counterValue, 0, 1000000000) && wish.baseline <= counterValue : wish.baseline === 0);
        check(wish.claimed ? r.wishLastClaimedDate === wish.date : r.wishLastClaimedDate < wish.date);
      }
    });
    Object.keys(s.house.rooms).forEach(function (id) { check(Object.keys(s.residents).filter(function (rid) { var r = s.residents[rid]; return r.movedIn && r.roomId === id; }).length <= B.maxResidentsPerRoom); });
    check(record(s.quests) && record(s.quests.main) && Array.isArray(s.quests.main.claimed));
    check(integer(s.quests.main.chapter, 1, 5) && integer(s.quests.main.index, 0, Game.data.mainQuests.length));
    check(s.quests.main.claimed.length <= Game.data.mainQuests.length && new Set(s.quests.main.claimed).size === s.quests.main.claimed.length);
    s.quests.main.claimed.forEach(function (id) { check(Game.data.mainQuests.some(function (q) { return q.id === id; })); });
    var nextQuestIndex = Game.data.mainQuests.findIndex(function (q) { return s.quests.main.claimed.indexOf(q.id) < 0; });
    if (nextQuestIndex < 0) nextQuestIndex = Game.data.mainQuests.length;
    if (oldQuestBook) { s.quests.main.index = nextQuestIndex; s.quests.main.chapter = Math.max(s.quests.main.chapter, Game.data.mainQuests[nextQuestIndex] && Game.data.mainQuests[nextQuestIndex].chapter || 1); }
    check(s.quests.main.schema === 2 && s.quests.main.index === nextQuestIndex);
    check(Array.isArray(s.quests.main.storySeen) && new Set(s.quests.main.storySeen).size === s.quests.main.storySeen.length);
    s.quests.main.storySeen.forEach(function (chapter) { check(integer(chapter, 1, s.quests.main.chapter)); });
    check(typeof s.quests.main.endingSeen === 'boolean');
    check(Array.isArray(s.quests.milestoneClaims) && new Set(s.quests.milestoneClaims).size === s.quests.milestoneClaims.length);
    s.quests.milestoneClaims.forEach(function (id) { check(['rainbow', 'home_master'].indexOf(id) >= 0); });
    check(integer(s.quests.stats.concerts, 0, 1));
    check(record(s.quests.stats)); Object.keys(s.quests.stats).forEach(function (key) { check(number(s.quests.stats[key], 0, 1000000000)); });
    check(record(s.quests.daily) && date(s.quests.daily.date) && Array.isArray(s.quests.daily.list) && s.quests.daily.list.length <= 3 && typeof s.quests.daily.chestClaimed === 'boolean');
    s.quests.daily.list.forEach(function (q) { check(record(q) && Game.data.dailyQuests.some(function (d) { return d.id === q.id; }) && number(q.progress, 0, 1000000) && typeof q.done === 'boolean' && typeof q.claimed === 'boolean'); });
    check(new Set(s.quests.daily.list.map(function (q) { return q.id; })).size === s.quests.daily.list.length);
    check(!s.quests.daily.chestClaimed || s.quests.daily.list.length === 3 && s.quests.daily.list.every(function (q) { return q.claimed; }));
    check(record(s.quests.achievements) && record(s.garden) && Array.isArray(s.garden.plots));
    Object.keys(s.quests.achievements).forEach(function (id) {
      var achievement = (Game.data.achievements || []).find(function (def) { return def.id === id; });
      check(achievement && s.quests.achievements[id] === true);
      (Game.data.achievements || []).filter(function (def) { return def.category === achievement.category && def.tier < achievement.tier; }).forEach(function (def) { check(s.quests.achievements[def.id] === true); });
    });
    // 首版只保存 plots:[]，迁移为六块空地；升级时自动补齐九格。
    if (s.garden.plots.length === 0) s.garden.plots = Array(gardenConfig.basePlots).fill(null);
    check(s.garden.plots.length === gardenConfig.basePlots || s.garden.plots.length === gardenConfig.expandedPlots);
    if (s.level >= gardenConfig.expandLv && s.garden.plots.length === gardenConfig.basePlots) while (s.garden.plots.length < gardenConfig.expandedPlots) s.garden.plots.push(null);
    check(s.garden.plots.length === (s.level >= gardenConfig.expandLv ? gardenConfig.expandedPlots : gardenConfig.basePlots));
    ['seeds', 'harvest'].forEach(function (key) {
      check(record(s.garden[key]));
      Object.keys(s.garden[key]).forEach(function (id) { check(own(Game.data.cropById, id) && integer(s.garden[key][id], 0, gardenConfig.maxStock)); });
    });
    s.garden.plots.forEach(function (plot) {
      if (plot === null) return;
      check(record(plot) && own(Game.data.cropById, plot.crop));
      var crop = Game.data.cropById[plot.crop];
      check(integer(plot.plantedAt, 0, 8640000000000000 - crop.growMs));
      check(plot.durationMs === crop.growMs || plot.durationMs === Math.round(crop.growMs / 1.2));
      check(Array.isArray(plot.watered) && plot.watered.length === 3);
      var startAt = plot.plantedAt, stageMs = plot.durationMs / 3;
      plot.watered.forEach(function (wateredAt) {
        var endAt = startAt + stageMs;
        check(wateredAt === null || (integer(wateredAt, 0, 8640000000000000) && wateredAt >= startAt && wateredAt < endAt));
        startAt = wateredAt === null ? endAt : wateredAt + (endAt - wateredAt) * 0.7;
      });
    });
    check(record(s.avatar) && s.pet === null && Array.isArray(s.rainbowPieces) && s.rainbowPieces.length <= 7);
    if (Game.data.validateAvatar) s.avatar = Game.data.validateAvatar(s.avatar);
    s.rainbowPieces.forEach(function (c) { check(['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple'].indexOf(c) >= 0); });
    check(new Set(s.rainbowPieces).size === s.rainbowPieces.length);
    if (Game.data.mainQuests.some(function (q) { return q.ending; }) && s.quests.main.claimed.length === Game.data.mainQuests.length) check(s.rainbowPieces.length === 7);
    if (s.quests.main.endingSeen || s.quests.milestoneClaims.indexOf('home_master') >= 0) check(s.quests.main.claimed.length === Game.data.mainQuests.length && s.rainbowPieces.length === 7);
    if (s.quests.milestoneClaims.indexOf('rainbow') >= 0) check(s.rainbowPieces.length === 7);
    check(record(s.minigames) && Object.keys(s.minigames).length === minigameIds.length);
    minigameIds.forEach(function (id) { var result = s.minigames[id]; check(record(result) && integer(result.best, 0, 1000000) && integer(result.playsToday, 0, 1000000) && date(result.date)); });
    check(Array.isArray(s.album) && s.album.length <= 12 && Array.isArray(s.albumTrash) && s.albumTrash.length <= 12 && Array.isArray(s.customArts) && s.customArts.length <= 20);
    var photoIds = new Set(), photoBytes = 0;
    s.album.concat(s.albumTrash).forEach(function (photo) {
      var keys = record(photo) ? Object.keys(photo) : [];
      check((keys.length === 6 || keys.length === 7 && own(photo, 'decor')) && keys.every(function (key) { return ['id', 'at', 'name', 'image', 'width', 'height', 'decor'].indexOf(key) >= 0; }));
      check(validId(photo.id) && !photoIds.has(photo.id) && integer(photo.at, 0, 8640000000000000) && string(photo.name, 80) && Array.from(photo.name).length <= 40 && !/[\x00-\x1F\x7F]/.test(photo.name)); photoIds.add(photo.id);
      check(integer(photo.width, 1, 600) && integer(photo.height, 1, 600) && typeof photo.image === 'string' && photo.image.length <= 120000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(photo.image)); photoBytes += photo.image.length;
      if (own(photo, 'decor')) {
        var decor = photo.decor, stickerIds = new Set();
        check(record(decor) && Object.keys(decor).length === 3 && ['frame', 'caption', 'stickers'].every(function (key) { return own(decor, key); }));
        check(decor.frame === 'none' || (Game.data.photoFrames || []).some(function (frame) { return frame.id === decor.frame; }));
        check(string(decor.caption, 60) && Array.from(decor.caption).length <= 30 && !/[\x00-\x1F\x7F]/.test(decor.caption));
        check(Array.isArray(decor.stickers) && decor.stickers.length <= 20);
        decor.stickers.forEach(function (sticker) {
          check(record(sticker) && Object.keys(sticker).length === 5 && ['uid', 'stickerId', 'x', 'y', 'scale'].every(function (key) { return own(sticker, key); }));
          check(validId(sticker.uid) && !stickerIds.has(sticker.uid) && (Game.data.photoStickers || []).some(function (def) { return def.id === sticker.stickerId; })); stickerIds.add(sticker.uid);
          check(number(sticker.x, 0, 1) && number(sticker.y, 0, 1) && number(sticker.scale, 0.4, 3));
        });
      }
    });
    check(photoBytes <= 2880000 && s.quests.stats.photos >= s.album.length + s.albumTrash.length);
    check(record(s.collectionBook) && Object.keys(s.collectionBook).length === 2 && Array.isArray(s.collectionBook.crops) && Array.isArray(s.collectionBook.themeClaims));
    check(new Set(s.collectionBook.crops).size === s.collectionBook.crops.length && s.collectionBook.crops.every(function (id) { return own(Game.data.cropById, id); }));
    check(new Set(s.collectionBook.themeClaims).size === s.collectionBook.themeClaims.length);
    // 可确认的旧档实物历史在提交前补齐，连同体积校验一起成功或一起拒绝。
    Object.keys(s.inventory).forEach(function (id) { if (s.inventory[id] > 0) s.collection[id] = true; });
    decorRooms(s).forEach(function (entry) { entry[1].items.forEach(function (item) { if (!Game.data.furnitureById[item.defId].customArt) s.collection[item.defId] = true; }); });
    s.house.yard.items.forEach(function (item) { s.collection[item.defId] = true; });
    Object.keys(s.garden.harvest).forEach(function (id) { if (s.garden.harvest[id] > 0 && s.collectionBook.crops.indexOf(id) < 0) s.collectionBook.crops.push(id); });
    s.collectionBook.themeClaims.forEach(function (id) {
      check(own(Game.data.themes, id));
      var items = Game.data.furniture.filter(function (def) { return def.theme === id && Game.data.furnitureTemplateById && Game.data.furnitureTemplateById[def.template] && !def.rewardOnly && !def.festivalId && def.place !== 'yard'; });
      check(items.length === 38 && items.every(function (def) { return s.collection[def.id] === true; }));
    });
    check(record(s.settings) && number(s.settings.music, 0, 1) && number(s.settings.sfx, 0, 1) && typeof s.settings.tts === 'boolean' && typeof s.settings.restReminder === 'boolean' && ['real', 'day', 'night'].indexOf(s.settings.dayMode) >= 0);
    check(integer(s.settings.audioVersion, 2, 2) && string(s.settings.ttsVoice, 512));
    check(record(s.calendar) && record(s.calendar.claimed) && Object.keys(s.calendar.claimed).length <= 1000);
    Object.keys(s.calendar.claimed).forEach(function (key) {
      var match = /^(\d{4}):(spring_festival|valentines|children_day|mid_autumn|halloween|christmas|player_birthday|resident_birthday)(?::([a-zA-Z0-9_-]+))?$/.exec(key);
      check(match && Number(match[1]) >= 1 && s.calendar.claimed[key] === true);
      check(match[2] === 'resident_birthday' ? !!match[3] && Game.data.residents.some(function (resident) { return resident.id === match[3]; }) : !match[3]);
    });
    check(record(s.daily) && string(s.daily.lastLoginDate, 10) && integer(s.daily.loginDay, 0, 7) && typeof s.daily.giftClaimed === 'boolean' && typeof s.daily.freeBoxUsed === 'boolean');
    var login = s.loginRewards;
    check(record(login) && Object.keys(login).length === 3 && ['claimed', 'lastClaimDate', 'lastReward'].every(function (key) { return own(login, key); }));
    check(integer(login.claimed, 0, 1000000000) && (login.claimed === 0 ? login.lastClaimDate === '' && login.lastReward === null : date(login.lastClaimDate)));
    if (login.lastReward === null) check(login.claimed <= 1);
    if (login.lastReward !== null) {
      var loginGift = login.lastReward, loginDay = (login.claimed - 1) % 7 + 1;
      check(record(loginGift) && Object.keys(loginGift).length === 6 && ['day', 'at', 'kind', 'coin', 'itemId', 'seeds'].every(function (key) { return own(loginGift, key); }));
      check(login.claimed > 0 && loginGift.day === loginDay && integer(loginGift.at, 0, 8640000000000000));
      if (loginDay === 3) check(loginGift.kind === 'seeds' && loginGift.coin === 0 && loginGift.itemId === null && record(loginGift.seeds) && Object.keys(loginGift.seeds).length === 3 && loginGift.seeds.daisy === 3 && loginGift.seeds.tulip === 2 && loginGift.seeds.strawberry === 2);
      else if (loginDay === 5 || loginDay === 7) {
        var loginDef = Game.data.furnitureById[loginGift.itemId];
        check(loginGift.kind === 'furniture' && loginGift.coin === 0 && loginGift.seeds === null && validId(loginGift.itemId) && own(Game.data.furnitureById, loginGift.itemId) && !!loginDef && !loginDef.customArt && !loginDef.rewardOnly && !loginDef.festivalId && loginDef.rarity === (loginDay === 5 ? 'fine' : 'rare') && s.collection[loginGift.itemId] === true);
      } else check(loginGift.kind === 'coin' && loginGift.coin === ({1:50,2:100,4:150,6:200})[loginDay] && loginGift.itemId === null && loginGift.seeds === null);
    }
    check(record(s.giftBox) && Object.keys(s.giftBox).length === 4 && ['date', 'freeUsed', 'opened', 'lastReward'].every(function (key) { return own(s.giftBox, key); }));
    check(date(s.giftBox.date) && typeof s.giftBox.freeUsed === 'boolean' && integer(s.giftBox.opened, 0, 1000000000));
    if (s.giftBox.lastReward !== null) {
      var receipt = s.giftBox.lastReward;
      check(record(receipt) && Object.keys(receipt).length === 6 && ['id', 'at', 'kind', 'itemId', 'coin', 'paid'].every(function (key) { return own(receipt, key); }));
      check(validId(receipt.id) && integer(receipt.at, 0, 8640000000000000) && typeof receipt.paid === 'boolean' && s.giftBox.opened > 0);
      if (receipt.kind === 'furniture') { var giftDef = Game.data.furnitureById[receipt.itemId]; check(validId(receipt.itemId) && own(Game.data.furnitureById, receipt.itemId) && giftDef && !giftDef.customArt && !giftDef.rewardOnly && !giftDef.festivalId && receipt.coin === 0 && s.collection[receipt.itemId] === true); }
      else check(receipt.kind === 'coin' && receipt.itemId === null && receipt.coin === 300);
    }

    // 加工历史独立于当前库存；成品送出、摆放或工坊收起后仍保留凭据。
    var crafting = s.crafting, recipes = Game.data.craftingRecipeById || {}, craftLevels = { tulip_vase: 6, pumpkin_lantern: 6, sakura_tree: 11, strawberry_deluxe: 21, blueberry_deluxe: 21 }, craftedTotal = 0;
    check(record(crafting) && Object.keys(crafting).length === 2 && own(crafting, 'counts') && own(crafting, 'last') && record(crafting.counts));
    Object.keys(crafting.counts).forEach(function (id) {
      check(own(craftLevels, id) && integer(crafting.counts[id], 1, 1000000000) && s.level >= (recipes[id] ? recipes[id].unlockLv : craftLevels[id])); craftedTotal += crafting.counts[id];
    });
    check(integer(craftedTotal, 0, 1000000000));
    if (craftedTotal === 0) check(crafting.last === null);
    else {
      var made = crafting.last;
      check(record(made) && Object.keys(made).length === 4 && ['recipeId', 'count', 'total', 'at'].every(function (key) { return own(made, key); }));
      check(own(craftLevels, made.recipeId) && integer(made.count, 1, 99) && made.count <= crafting.counts[made.recipeId] && made.total === craftedTotal && integer(made.at, 0, 8640000000000000));
    }

    check(record(s.tutorial) && integer(s.tutorial.step, 0, 20) && typeof s.tutorial.done === 'boolean' && record(s.tutorial.seenTips));
    Object.keys(s.tutorial.seenTips).forEach(function (k) { check(typeof s.tutorial.seenTips[k] === 'boolean'); });
    check(Array.isArray(s.memories) && s.memories.length <= B.maxMemories);
    s.memories.forEach(function (m) { check(record(m) && number(m.at, 0, 9007199254740991) && string(m.text, 300)); });
    if (Game.data.applyOutfitRewardEntitlements) Game.data.applyOutfitRewardEntitlements(s);
    var serialized = JSON.stringify(s);
    // 同时约束字节和UTF-16占用，为本机保存键留出空间；超限事务不提交。
    check(serialized.length <= B.maxSaveChars && Game.utils.utf8Bytes(serialized) <= B.maxSaveBytes, '相册与回忆接近本机保存容量。先下载JSON备份，再整理回收夹中的相片。');
    return s;
  }
  Game.store = {
    defaultState: defaultState, validate: validate,
    atticRoomId: atticRoomId, decorRoom: decorRoom, decorRooms: decorRooms, replaceDecorRoom: replaceDecorRoom, newAtticRoom: newAtticRoom,
    setWriteGuard: function (fn) { writeGuard = typeof fn === 'function' ? fn : null; },
    canWrite: function (source) { return permission(source, 'check').ok; },
    writeReason: function (source) { return permission(source, 'check').message || ''; },
    init: function (raw) { Game.state = raw ? validate(raw) : defaultState(); return Game.state; },
    update: function (fn, options) {
      assertWritable(options && options.source, 'update');
      var next = Game.utils.clone(Game.state), result = fn(next), checked = validate(next);
      // 显式保存类操作先写入，拒写时不发布新状态或发奖励事件；纯规则环境可不安装save模块。
      if (options && options.persist && Game.save && Game.save.commit && !Game.save.commit(checked, { source: options.source || 'local' })) throw new Error('这次进度暂时无法保存在本机，原来的进度保持原样。请先导出JSON备份。');
      assertWritable(options && options.source, 'update', checked); Game.state = checked; Game.bus.emit('state:change', Game.state); return result;
    },
    replace: function (raw, options) { assertWritable(options && options.source, 'replace'); var next = validate(raw); Game.state = next; Game.bus.emit('state:replace', Game.state); Game.bus.emit('state:change', Game.state); return Game.state; }
  };
})(window.Game);
