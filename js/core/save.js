(function (Game) {
  'use strict';
  var B = Game.data.balance, timer = null, interval = null, initialized = false, protectOriginal = false, restoring = false;
  function status(text) { Game.save.status = text; Game.bus.emit('save:status', { status: text }); }
  function errorText(error, fallback) { return error && typeof error.message === 'string' && error.message.trim() ? error.message : typeof error === 'string' && error.trim() ? error : fallback; }
  function storage() { return window.localStorage; }
  function writable(source) { if (!Game.store.canWrite || Game.store.canWrite(source)) return true; status(Game.store.writeReason(source)); return false; }
  function committed(state, json, source) { Game.bus.emit('save:committed', { state: state, json: json, source: source || 'local' }); }
  function backup(raw) {
    var key = B.saveKey + '_corrupt_' + Date.now();
    try { storage().setItem(key, raw); Game.save.backupKey = key; return true; } catch (e) { protectOriginal = true; return false; }
  }
  function flush() {
    if (!Game.state || protectOriginal) { if (protectOriginal) status('原损坏存档保留中，请先导出当前进度'); return false; }
    if (!writable('local')) return false;
    if (timer) { clearTimeout(timer); timer = null; }
    try {
      var checked = Game.store.validate(Game.state), json = JSON.stringify(checked);
      if (Game.utils.utf8Bytes(json) > B.maxSaveBytes) throw new Error('存档已超过本地空间限制。');
      if (!writable('local')) return false;
      storage().setItem(B.saveKey, json); committed(checked, json, 'local'); status(Game.data.messages.saved); return true;
    } catch (error) { status(Game.data.messages.unavailable); Game.bus.emit('save:error', { message: errorText(error, '本机暂时无法保存，请先下载当前JSON存档。') }); return false; }
  }
  function schedule() { if (timer) clearTimeout(timer); status(Game.data.messages.saving); timer = setTimeout(flush, B.saveDebounceMs); }
  function readFile(file) {
    if (file && typeof file.text === 'function') return file.text();
    return new Promise(function (resolve, reject) { if (!file || typeof FileReader === 'undefined') return reject(new Error('请选择 JSON 存档文件。')); var reader = new FileReader(); reader.onload = function () { resolve(reader.result); }; reader.onerror = function () { reject(new Error('无法读取这个文件。')); }; reader.readAsText(file); });
  }
  function md(value) { return String(value == null ? '' : value).replace(/[\\`*_{}\[\]<>#|]/g, '\\$&').replace(/[\r\n]+/g, ' '); }
  function restoreState(raw, message, options) {
    // 校验只准备独立快照；拒写时不发布换档事件，也不运行会改每日、心愿和撤销记录的初始化。
    var next = Game.store.validate(raw);
    if (!Game.save.commit(next, options)) return { ok: false, message: protectOriginal ? '原损坏存档仍保留在本机，不能覆盖。请先下载当前JSON存档并保留损坏原文。' : '这份进度暂时无法保存在本机，原来的小屋没有改变。请先下载当前JSON存档，再检查浏览器存储后重试。' };
    if (timer) { clearTimeout(timer); timer = null; }
    Game.store.replace(next, options);
    Game.save.loadFailed = false;
    Game.runtime.mode = 'explore'; Game.runtime.selected = null; Game.runtime.placing = null; Game.runtime.activeRoomId = null;
    // 目标已落盘；日常和离线补算属于切档后的正常更新，沿用 state:change 自动保存，不能再以第二次 flush 判定是否导入。
    try { if (Game.sys.init) Game.sys.init(); }
    catch (error) {
      var warning = '目标存档已经保存在本机，日常更新暂时未完成。请先下载JSON备份，再重新打开小屋。';
      status(warning); Game.bus.emit('save:error', { message: errorText(error, '日常更新暂时未完成。'), restored: true });
      return { ok: true, message: message + warning, warning: warning };
    }
    return { ok: true, message: message };
  }
  Game.save = {
    status: '等待保存', backupKey: null, loadFailed: false,
    load: function () {
      var raw;
      try { raw = storage().getItem(B.saveKey); } catch (error) { Game.save.loadFailed = true; status(Game.data.messages.unavailable); return null; }
      if (!raw) return null;
      try { if (Game.utils.utf8Bytes(raw) > B.maxSaveBytes) throw new Error('存档过大。'); return Game.store.validate(JSON.parse(raw)); }
      catch (error) { Game.save.loadFailed = true; var kept = backup(raw); status(kept ? Game.data.messages.corrupt : '损坏存档已原位保留，请导出新的游戏进度'); Game.bus.emit('save:error', { message: errorText(error, '存档暂时无法读取，原文已保留。'), preserved: true }); return null; }
    },
    init: function () {
      if (initialized) return;
      initialized = true; Game.bus.on('state:change', schedule);
      interval = setInterval(flush, B.saveIntervalMs);
      if (window.addEventListener) { window.addEventListener('beforeunload', flush); window.addEventListener('pagehide', flush); }
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', function () { if (document.hidden) flush(); });
      // 读到坏档时先展示备份提示，随后仍会保存玩家的新进度。
      if (!Game.save.backupKey && !protectOriginal) flush();
    },
    flush: flush,
    commit: function (next, options) {
      if (protectOriginal) { status('原损坏存档保留中，请先导出当前进度'); return false; }
      if (!writable(options && options.source)) return false;
      try { var checked = Game.store.validate(next), json = JSON.stringify(checked); if (!writable(options && options.source)) return false; storage().setItem(B.saveKey, json); committed(checked, json, options && options.source); status(Game.data.messages.saved); return true; }
      catch (error) { status(Game.data.messages.unavailable); Game.bus.emit('save:error', { message: errorText(error, '本机暂时无法保存，请先下载当前JSON存档。') }); return false; }
    },
    snapshot: function () { var json = storage().getItem(B.saveKey); if (!json) return null; var state = Game.store.validate(JSON.parse(json)); return { state: state, json: JSON.stringify(state) }; },
    restore: function (raw, options) {
      if (restoring) return { ok: false, message: '正在恢复小屋，等这次完成后再试。' };
      restoring = true;
      try { return restoreState(raw, '小屋进度已恢复。', options || { source: 'cloud' }); }
      catch (error) { return { ok: false, message: errorText(error, '小屋暂时无法恢复，原来的进度保持原样。') }; }
      finally { restoring = false; }
    },
    exportJson: function () { var state = Game.store.validate(Game.state), json = JSON.stringify(state, null, 2); if (Game.utils.utf8Bytes(json) > B.maxSaveBytes) json = JSON.stringify(state); Game.utils.download('棉花糖小屋存档-' + Game.utils.dateKey() + '.json', json, 'application/json;charset=utf-8'); return json; },
    importFile: function (file) {
      if (restoring) return Promise.resolve({ ok: false, message: '正在恢复小屋，等这次完成后再试。' });
      var sourceState = Game.state; restoring = true;
      return Promise.resolve().then(function () { if (!file || (typeof file.size === 'number' && file.size > B.maxSaveBytes)) throw new Error('请选择小于 3MB 的 JSON 存档。'); return readFile(file); }).then(function (text) {
        if (typeof text !== 'string' || Game.utils.utf8Bytes(text) > B.maxSaveBytes) throw new Error('存档文件过大或无法读取。');
        // 读文件可以异步等待；期间继续游玩或日常补算产生的新进度，不能被迟到的文件覆盖。
        if (Game.state !== sourceState) throw new Error('读取存档期间，小屋已经有了新进度。请先下载当前JSON存档，再重新选择要恢复的文件。');
        var result = restoreState(JSON.parse(text), Game.data.messages.imported);
        if (result.ok) Game.bus.emit('save:imported', {});
        return result;
      }).catch(function (error) { return { ok: false, message: error instanceof SyntaxError ? '这个文件不是有效的 JSON，原来的进度没有改变。' : errorText(error, '暂时无法读取这份存档，原来的进度没有改变。请重新选择JSON文件。') }; }).finally(function () { restoring = false; });
    },
    exportMemory: function () {
      var s = Game.state, lines = ['# ' + md(s.house.name) + ' · 云上的回忆', '', '> 这是方便阅读的回忆录。恢复游戏请使用 JSON 存档。', '', '记录时间：' + Game.utils.dateKey(), '', '- 小设计师：' + md(s.profile.name), '- 小屋等级：Lv.' + s.level, '- 糖果币：' + s.wallet.coin + ' · 爱心：' + s.wallet.heart, '- 彩虹碎片：' + (s.rainbowPieces.map(md).join('、') || '正等着我们去找'), '', '## 我们的小屋', ''];
      // 建筑只读取真实文档和墙体推导空间，不把保留的迁移来源当作现在的布局。
      var building = window.CottageBuilding.validateDocument(s.building, Game.data.furnitureById), spaces = Game.contentSpaces.list(s);
      var metres = function (value) { return String(Math.round(value * 100) / 100); };
      var artName = function (id) { var art = s.customArts.find(function (value) { return value.id === id; }); return art ? art.name : '我的画作'; };
      lines.push('- 已建楼层：' + building.floors.length + ' 层 · 围合空间：' + spaces.length + ' 处', '- 实际墙面：' + building.walls.length + ' 面 · 门窗：' + building.openings.length + ' 处 · 家具：' + building.furniture.length + ' 件', '');
      building.floors.forEach(function (floor) {
        var floorRooms = spaces.filter(function (space) { return space.floorId === floor.id; }), walls = building.walls.filter(function (wall) { return wall.floorId === floor.id; });
        var furniture = building.furniture.filter(function (item) { return item.floorId === floor.id; });
        lines.push('### ' + md(floor.name) + ' · 离地 ' + metres(floor.elevation) + ' 米', '');
        if (!floorRooms.length) lines.push('- 还没有围成封闭空间，开放的墙和家具也都好好保存着。');
        floorRooms.forEach(function (space, index) { var def = Game.data.rooms.find(function (entry) { return entry.id === space.type; }), holes = space.holes || []; lines.push('- 空间 ' + (index + 1) + '：' + md(def ? def.name : '自由空间') + ' · ' + metres(space.area) + ' 平方米' + (holes.length ? ' · 留有 ' + holes.length + ' 处内部空区' : '')); });
        walls.forEach(function (wall, index) {
          lines.push('- 第 ' + (index + 1) + ' 面墙：从（' + metres(wall.start.x) + ', ' + metres(wall.start.z) + '）到（' + metres(wall.end.x) + ', ' + metres(wall.end.z) + '）米 · 高 ' + metres(wall.height) + ' 米 · 厚 ' + metres(wall.thickness) + ' 米 · ' + md(wall.color) + (wall.artId ? ' · 墙纸「' + md(artName(wall.artId)) + '」' : ''));
          building.openings.filter(function (opening) { return opening.wallId === wall.id; }).forEach(function (opening) { lines.push('  - ' + (opening.kind === 'door' ? '门' : '窗') + '：距墙起点 ' + metres(opening.offset) + ' 米 · 宽 ' + metres(opening.width) + ' 米 × 高 ' + metres(opening.height) + ' 米 · 底部离地 ' + metres(opening.sill) + ' 米'); });
        });
        furniture.forEach(function (item) {
          var definition = Game.data.furnitureById[item.defId];
          lines.push('- ' + md(item.artId ? artName(item.artId) : definition.name) + '：位置（' + metres(item.position.x) + ', ' + metres(item.position.y) + ', ' + metres(item.position.z) + '）米 · 朝向 ' + metres(item.rotation * 180 / Math.PI) + '° · 宽 ' + metres(item.dimensions.width) + ' 米 × 深 ' + metres(item.dimensions.depth) + ' 米 × 高 ' + metres(item.dimensions.height) + ' 米');
        });
        if (!walls.length && !furniture.length) lines.push('- 这一层还留着空白，等待下一份创意。');
        lines.push('');
      });
      var exterior = s.house.exterior, exteriorNames = { roof: '屋顶', wall: '外墙', window: '窗户', door: '小门', chimney: '烟囱' }, exteriorById = Game.data.exteriorById || {};
      lines.push('### 收好的外观与配色', '');
      Object.keys(exteriorNames).forEach(function (category) { var part = Object.prototype.hasOwnProperty.call(exteriorById, exterior[category]) ? exteriorById[exterior[category]] : null; lines.push('- ' + exteriorNames[category] + '：' + md(part ? part.name : exterior[category])); });
      lines.push('- 屋顶配色：' + md(exterior.roofColor), '- 外墙配色：' + md(exterior.wallColor), '');
      lines.push('## 音乐室的小合奏', '', (s.quests.stats.concerts ? '- 已完整举办海风与森林的小合奏，重演不重复发奖。' : '- 还在等待第一场完整谢幕。'), '');
      lines.push('## 彩虹故事与成长徽章', '', '- 主线：第 ' + s.quests.main.chapter + ' 章，已完成 ' + s.quests.main.claimed.length + ' / ' + Game.data.mainQuests.length + ' 个任务', '- 已读章节：' + (s.quests.main.storySeen.join('、') || '新的故事正在等你'), '- 彩虹派对：' + (s.quests.main.endingSeen ? '已经和朋友一起庆祝' : '还在准备小小的惊喜'));
      if (Game.data.achievements) Game.data.achievements.filter(function (def) { return s.quests.achievements[def.id]; }).forEach(function (def) { lines.push('- 已点亮成就：' + md(def.title)); });
      lines.push('- 小相册：' + s.album.length + ' 张照片 · 回收夹 ' + s.albumTrash.length + ' 张', '');
      s.album.forEach(function (photo) { var decor = photo.decor, frame = decor && (Game.data.photoFrames || []).find(function (def) { return def.id === decor.frame; }); lines.push('- ' + Game.utils.dateKey(photo.at) + ' · ' + md(photo.name) + (frame && frame.id !== 'none' ? ' · ' + md(frame.name) : '') + (decor && decor.caption ? ' · “' + md(decor.caption) + '”' : '') + (decor && decor.stickers.length ? ' · ' + decor.stickers.length + ' 枚贴纸' : '')); });
      if (Game.sys.collectionBook) { lines.push('', '## 收藏图鉴', ''); Game.sys.collectionBook.summary().forEach(function (category) { lines.push('- ' + md(category.name) + '：' + category.done + ' / ' + category.total + '（' + category.percent + '%）'); }); Game.sys.collectionBook.themes().filter(function (theme) { return theme.claimed; }).forEach(function (theme) { lines.push('- 已收好主题徽章：' + md(theme.name)); }); }

      lines.push('## 我的小画册', '', '- 已保存：' + s.customArts.length + ' / 20 幅');
      if (s.customArts.length) lines.push('- 像素编码：. 为透明，0–9、a–n 依次对应24色；恢复请用JSON。', '- 色板：' + (Game.data.creativeConfig ? Game.data.creativeConfig.symbols.split('').map(function (code, index) { return code + '=' + Game.data.creativeConfig.palette[index]; }).join(' ') : ''), '');
      s.customArts.forEach(function (art) {
        var hanging = building.furniture.filter(function (item) { return item.artId === art.id; }).length, wallpaper = building.walls.filter(function (wall) { return wall.artId === art.id; }).length;
        lines.push('### ' + md(art.name), '', '- 挂画 ' + hanging + ' 处 · 墙纸 ' + wallpaper + ' 面', '', '```text'); for (var row = 0; row < 16; row++) lines.push(art.pixels.slice(row * 16, row * 16 + 16)); lines.push('```', '');
      });
      lines.push('## 花园加工与甜品工坊', '', '- 累计制作：' + Object.values(s.crafting.counts).reduce(function (sum, count) { return sum + count; }, 0) + ' 份');
      (Game.data.craftingRecipes || []).forEach(function (recipe) { if (s.crafting.counts[recipe.id]) lines.push('- ' + md(recipe.name) + '：' + s.crafting.counts[recipe.id] + ' 份（' + recipe.cropCount + ' 份' + md(Game.data.cropById[recipe.cropId].name) + ' / 件）'); });
      if (s.crafting.last) { var craftedRecipe = (Game.data.craftingRecipeById || {})[s.crafting.last.recipeId]; lines.push('- 最近一批：' + md(craftedRecipe ? craftedRecipe.name : s.crafting.last.recipeId) + ' × ' + s.crafting.last.count + '，' + Game.utils.dateKey(s.crafting.last.at)); }
      lines.push('');
      lines.push('## 糯米的惊喜礼盒', '', '- 已拆礼盒：' + s.giftBox.opened + ' 份', '- 最近免费记录：' + s.giftBox.date + ' · ' + (s.giftBox.freeUsed ? '已经拆过' : '尚未使用'));
      if (s.giftBox.lastReward) { var gift = s.giftBox.lastReward; lines.push('- 最近心意：' + (gift.kind === 'furniture' ? md(Game.data.furnitureById[gift.itemId].name) : gift.coin + ' 颗糖果') + (gift.paid ? '（200游戏糖果礼盒）' : '（每日免费礼盒）')); } lines.push('');
      var observatoryFloor = building.floors.find(function (floor) { return floor.id === 'observatory_floor' || floor.id === 'legacy_attic'; });
      lines.push('## 阁楼天文台', '', '- 天文台：' + (s.observatory.built ? observatoryFloor ? '已经购买并建好观星楼层' : '已经购买，观星楼层等待重新搭建' : '还未建造（Lv17开放）'), '- 星星碎片：' + s.observatory.fragments + ' 枚 · 观星 ' + s.observatory.observations + ' 次');
      if (s.observatory.lastDiscovery) { var sky = s.observatory.lastDiscovery, constellation = (Game.data.constellationById || {})[sky.id]; lines.push('- 最近观测：' + sky.date + ' · ' + md(constellation ? constellation.name : sky.id)); }
      if (s.observatory.built && observatoryFloor) lines.push('- 观星楼层：' + md(observatoryFloor.name) + ' · 离地 ' + metres(observatoryFloor.elevation) + ' 米', '- 当前布置：' + building.walls.filter(function (wall) { return wall.floorId === observatoryFloor.id; }).length + ' 面墙 · ' + building.furniture.filter(function (item) { return item.floorId === observatoryFloor.id; }).length + ' 件家具；具体位置见上方的真实建筑记录。');
      lines.push('', '## 七日登录心意', '', '- 累计收好：' + s.loginRewards.claimed + ' 份 · 下一份第 ' + (s.loginRewards.claimed % 7 + 1) + ' 天', '- 最近领取：' + (s.loginRewards.lastClaimDate || '尚未领取'));
      if (s.loginRewards.lastReward && Game.sys.login) lines.push('- 最近礼物：' + md(Game.sys.login.description(s.loginRewards.lastReward)));
      if (Game.sys.deals) { lines.push('', '## 今日特惠', '', '- ' + Game.utils.dateKey() + ' · 以下六件八折（等级要求照常）'); Game.sys.deals.list().forEach(function (deal) { lines.push('- ' + md(deal.definition.name) + '：' + deal.price + ' 糖果（原价 ' + deal.originalPrice + '）'); }); }
      lines.push('');
      lines.push('## 住在这里的朋友', '');
      Game.data.residents.forEach(function (d) {
        var r = s.residents[d.id]; if (!r || !r.movedIn) return;
        var level = Game.sys.residents.affectionLevel(r.affection);
        lines.push('- ' + d.icon + ' ' + d.name + '：好朋友 ' + level + ' 级，好感 ' + r.affection + '，幸福度 ' + Math.round(r.happiness) + '，待收爱心泡泡 ' + r.heartBubbles);
        var wish = r.wish && (d.wishes || []).find(function (entry) { return entry.id === r.wish.defId; });
        if (wish) lines.push('  - ' + r.wish.date + ' 的心愿：' + md(wish.text) + '（' + (r.wish.claimed ? '已实现' : '正在陪朋友完成') + '）');
        if (Array.isArray(r.friendshipClaims) && r.friendshipClaims.length) lines.push('  - 已收好的朋友礼物：' + r.friendshipClaims.map(function (tier) { return '好感' + tier + '级'; }).join('、'));
      });
      lines.push('', '## 背包里的小心意', ''); Object.keys(s.inventory).forEach(function (id) { if (s.inventory[id] > 0) lines.push('- ' + md(Game.data.furnitureById[id].name) + ' × ' + s.inventory[id]); });
      if (s.level >= Game.data.gardenConfig.unlockLv) {
        lines.push('', '## 一粒种子的小花园', '');
        s.garden.plots.forEach(function (plot, index) {
          if (!plot) return;
          var growth = Game.sys.garden && Game.sys.garden.status(index);
          lines.push('- 第 ' + (index + 1) + ' 块花圃：' + md(Game.data.cropById[plot.crop].name) + (growth ? ' · ' + growth.stageName : ' · 正在长大'));
        });
        Game.data.crops.forEach(function (crop) {
          var seeds = s.garden.seeds[crop.id] || 0, harvest = s.garden.harvest[crop.id] || 0;
          if (seeds || harvest) lines.push('- ' + md(crop.name) + '：种子 ' + seeds + ' 粒，收获 ' + harvest + ' 份');
        });
      }
      if (Game.data.minigames) {
        lines.push('', '## 云端游乐场', '');
        Game.data.minigames.forEach(function (game) { var result = s.minigames[game.id]; lines.push('- ' + md(game.name) + '：最高 ' + result.best + (game.id === 'bakery' ? ' 单' : ' 分')); });
      }
      lines.push('', '## 一路的回忆', '');
      s.memories.forEach(function (m) { var time = new Date(m.at); lines.push('- ' + Game.utils.dateKey(m.at) + ' ' + String(time.getHours()).padStart(2, '0') + ':' + String(time.getMinutes()).padStart(2, '0') + ' · ' + md(m.text)); });
      lines.push('', '愿每一次回家，都有新的甜甜故事。', '');
      var result = lines.join('\n'); Game.utils.download('棉花糖小屋回忆-' + Game.utils.dateKey() + '.md', result, 'text/markdown;charset=utf-8'); return result;
    },
    reset: function () {
      if (restoring) return { ok: false, message: '正在恢复小屋，等这次完成后再试。' };
      restoring = true;
      try { return restoreState(Game.store.defaultState(), '新的一朵云，新的小屋故事。'); }
      catch (error) { return { ok: false, message: errorText(error, '新小屋暂时没有保存，原来的进度保持原样。请先下载JSON备份。') }; }
      finally { restoring = false; }
    }
  };
})(window.Game);
