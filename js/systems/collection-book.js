/* 收藏册只记真实获得：家具/朋友/衣服沿用既有历史，花果单独保留收获印记。 */
(function (G) {
  'use strict';
  const D = G.data, own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
  const kinds = [{ id: 'furniture', name: '家具', icon: '🛋️' }, { id: 'residents', name: '居民', icon: '🐰' }, { id: 'crops', name: '花果', icon: '🌷' }, { id: 'outfits', name: '服装', icon: '👗' }];
  const categoryNames = { bedroom: '卧室', living: '客厅', kitchen: '餐厨', bathroom: '浴室', entertainment: '娱乐', wall: '墙面', small: '小物', decor: '装饰', plant: '植物', yard: '庭院', special: '特别', top: '上衣', bottom: '下装', dress: '连衣裙', shoes: '鞋子', acc: '小配饰' };
  const themeIds = ['basic', 'strawberry', 'forest', 'garden', 'ocean', 'cloud', 'oriental', 'starry', 'princess'];
  function definitions(kind) { return kind === 'furniture' ? D.furniture : kind === 'residents' ? D.residents : kind === 'crops' ? D.crops : kind === 'outfits' ? D.outfits : []; }
  function book() { return G.state.collectionBook || { crops: [], themeClaims: [] }; }
  function discovered(kind, id) {
    if (kind === 'furniture') return G.state.collection[id] === true;
    if (kind === 'residents') return own(G.state.residents, id);
    if (kind === 'crops') return book().crops.includes(id);
    return kind === 'outfits' && G.state.avatar.owned[id] === true;
  }
  function furnitureCount(id) {
    return (G.state.inventory[id] || 0) + G.contentSpaces.items(G.state).filter(item => item.defId === id).length;
  }
  function regularIds(id) {
    if (!themeIds.includes(id)) return [];
    return D.furniture.filter(def => def.theme === id && own(D.furnitureTemplateById, def.template) && !def.rewardOnly && !def.festivalId && def.place !== 'yard').map(def => def.id);
  }
  function source(kind, def) {
    const level = kind === 'crops' ? D.gardenConfig.unlockLv : def.unlockLv || 1;
    if (kind === 'residents') return { source: '入住邀请', hint: def.requirement, level, action: { panel: 'residents', residentId: def.id }, actionLabel: '去看看入住条件' };
    if (kind === 'crops') return { source: '花园收获', hint: '在花园种下种子，成熟后亲手收获一次。' + (def.nightOnly ? '这枚种子只在夜晚播种。' : '') + ' 等待约 ' + def.growMinutes + ' 分钟。', level, action: { panel: 'garden' }, actionLabel: '去花园种一份' };
    if (kind === 'outfits') {
      const reward = def.rewardSources?.[0], collected = discovered(kind, def.id), shopHint = '也可以在衣橱商店用 ' + def.price + ' 颗糖果购买，Lv.' + level + ' 开放。';
      if (reward) return { source: '衣橱商店 / ' + (reward.kind === 'achievement' ? '成就礼物' : '节日心意'), hint: reward.hint + ' ' + shopHint + ' 已有同款时不重复添加或换发糖果。', level: 1, action: collected ? { panel: 'avatar', outfitId: def.id, category: def.category } : reward.kind === 'achievement' ? { panel: 'quests', tab: 'achievements', category: reward.category, achievementId: reward.id } : { panel: 'calendar', eventId: reward.id }, actionLabel: collected ? '去衣橱穿穿' : reward.kind === 'achievement' ? '去看小厨师成就' : '去看节日心意' };
      return { source: def.source === 'starter' ? '初见衣橱' : '衣橱商店', hint: def.source === 'starter' ? '糯米放进衣橱的第一份穿搭心意。' : '在衣橱挑选并购买，' + def.price + ' 颗糖果。', level, action: { panel: 'avatar', outfitId: def.id, category: def.category }, actionLabel: '去衣橱看看' };
    }
    if (def.source === 'crafting') {
      const recipe = (D.craftingRecipes || []).find(entry => entry.itemId === def.id), crop = recipe && D.cropById[recipe.cropId];
      return { source: recipe?.requireRoom ? '甜品工坊制作' : '花园加工', hint: recipe ? '用 ' + recipe.cropCount + ' 份' + crop.name + '制作一件。' + (recipe.requireRoom ? '需要Lv.21和甜品工坊。' : def.place === 'yard' ? 'Lv.11后可加工并摆在前院。' : 'Lv.6花园开放后可制作。') : '从加工册查看材料。', level, action: { panel: 'crafting', recipeId: recipe?.id }, actionLabel: '去加工册看看' };
    }
    if (def.source === 'friendship') {
      const resident = D.residents.find(item => item.id === def.residentId);
      return { source: '好朋友礼物', hint: '与' + (resident ? resident.name : '这位朋友') + '好感达到 300，按顺序领取 Lv.3 的专属家具礼物。', level, action: { panel: 'residents', residentId: def.residentId }, actionLabel: '去看看朋友的心意' };
    }
    if (def.source === 'achievement') {
      if (def.achievementId === 'rainbow' || def.achievementId === 'home_master') return { source: '小屋里程碑礼物', hint: def.achievementId === 'rainbow' ? '找齐七片彩虹后，打开成就页的「彩虹与小屋的特别礼物」收下它。' : '完成全部 35 条主线后，打开成就页的「彩虹与小屋的特别礼物」收下它。', level, action: { panel: 'quests', tab: 'achievements', category: def.achievementId === 'rainbow' ? 'collector' : 'builder', milestoneId: def.achievementId }, actionLabel: '去看看小屋的特别礼物' };
      return { source: '成就礼物', hint: '在任务小册的对应成就中领取专属家具。', level, action: { panel: 'quests', tab: 'achievements', category: def.achievementId }, actionLabel: '去看看这项成就' };
    }
    if (def.festivalId) {
      const festival = D.festivalById && D.festivalById[def.festivalId];
      return { source: '节日商店', hint: (festival ? festival.name : '对应节日') + '到来时，在节日商店用 ' + def.price + ' 颗糖果换取。', level, action: { panel: 'shop', shopTab: 'festival', itemId: def.id }, actionLabel: '去节日商店看看' };
    }
    return { source: def.place === 'yard' ? '庭院家具商店' : '家具商店', hint: '在商店购买，' + def.price + ' 颗糖果。' + (def.place === 'yard' ? '可以摆在小屋前院。' : ''), level, action: { panel: 'shop', itemId: def.id, theme: def.theme }, actionLabel: '去商店找找它' };
  }
  function entry(kind, def) {
    const collected = discovered(kind, def.id), clue = source(kind, def), count = kind === 'furniture' ? furnitureCount(def.id) : kind === 'residents' ? Number(!!G.state.residents[def.id]?.movedIn) : kind === 'crops' ? G.state.garden.harvest[def.id] || 0 : Number(collected);
    return { id: def.id, kind, definition: def, name: collected ? def.name : '？？？', collected, count, level: clue.level, locked: G.state.level < clue.level, theme: def.theme || null, category: def.category || null, categoryName: categoryNames[def.category] || '', source: clue.source, hint: clue.hint, action: clue.action, actionLabel: clue.actionLabel };
  }
  function get(kind, id) { const def = definitions(kind).find(item => item.id === id); return def ? entry(kind, def) : null; }
  function summary() {
    return kinds.map(kind => { const defs = definitions(kind.id), done = defs.filter(def => discovered(kind.id, def.id)).length; return Object.assign({}, kind, { done, total: defs.length, percent: defs.length ? Math.floor(done / defs.length * 100) : 0 }); });
  }
  function list(options) {
    const opts = options || {}, kind = opts.kind || 'furniture', query = String(opts.query || '').trim().toLocaleLowerCase('zh-CN');
    const items = definitions(kind).map(def => entry(kind, def)).filter(item => {
      if ((opts.status === 'collected' || opts.status === 'owned') && !item.collected || (opts.status === 'missing' || opts.status === 'unowned') && item.collected) return false;
      if (opts.theme && opts.theme !== 'all' && item.theme !== opts.theme || opts.category && opts.category !== 'all' && item.category !== opts.category) return false;
      // 未点亮的名字不能通过搜索命中；只可按可见的主题、分类与获取线索查找。
      return !query || [item.name, item.categoryName, D.themes[item.theme]?.name || '', item.source, item.hint].join(' ').toLocaleLowerCase('zh-CN').includes(query);
    });
    const pages = Math.max(1, Math.ceil(items.length / 24)), page = Math.max(1, Math.min(pages, Number.isInteger(opts.page) ? opts.page : 1));
    return { kind, items: items.slice((page - 1) * 24, page * 24), total: items.length, page, pages, pageSize: 24 };
  }
  function themes() {
    return themeIds.map(id => { const ids = regularIds(id), done = ids.filter(itemId => discovered('furniture', itemId)).length; return { id, name: D.themes[id].name, icon: D.themes[id].icon, done, total: ids.length, percent: ids.length ? Math.floor(done / ids.length * 100) : 0, complete: ids.length === 38 && done === ids.length, claimed: book().themeClaims.includes(id), reward: { coin: 500 }, missingIds: ids.filter(itemId => !discovered('furniture', itemId)) }; });
  }
  function claimTheme(id) {
    const theme = themes().find(item => item.id === id);
    if (!theme) return { ok: false, message: '这页套装还没有收录。' };
    if (theme.claimed) return { ok: false, message: '这枚套装徽章已经好好收起来啦。' };
    if (!theme.complete) return { ok: false, message: '再找到 ' + (theme.total - theme.done) + ' 件常规家具，就能收下这枚徽章。' };
    if (G.state.wallet.coin > 1000000000 - 500) return { ok: false, message: '糖果罐快装满啦，先花掉一些，再来收这份礼物。' };
    try {
      G.store.update(state => {
        state.collectionBook.themeClaims.push(id); state.wallet.coin += 500;
        state.memories.push({ at: Date.now(), text: '集齐「' + theme.name + '」的 38 件常规家具，收下一枚套装徽章和 500 颗糖果。' });
        if (state.memories.length > D.balance.maxMemories) state.memories.splice(0, state.memories.length - D.balance.maxMemories);
      });
    } catch (_) { return { ok: false, message: '这份礼物暂时放不进存档。先整理相册或导出备份，再来领取；徽章和糖果都还在。' }; }
    G.bus.emit('collection:theme-claimed', { id, coin: 500 });
    return { ok: true, message: '「' + theme.name + '」套装徽章收好啦！还有 500 颗糖果。', id, coin: 500 };
  }
  // 已有实物的迁移由 store.validate 在提交前完成；收获印记和收获本身同一事务写入。
  function init() {}
  G.sys = G.sys || {};
  G.sys.collectionBook = { init, list, get, summary, themes, claimTheme, regularIds, kinds, categoryNames };
})(window.Game);
