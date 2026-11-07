/* 收获加工只消耗真实篮子库存；成品、发现历史与制作回忆一次保存。 */
(function (G) {
  'use strict';
  const D = G.data, C = D.craftingConfig, clone = value => G.utils.clone(value);
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  let busy = false, epoch = 0;
  const fail = message => ({ ok: false, canCraft: false, reason: message, message, quote: null });
  function definition(id) { return typeof id === 'string' && own(D.craftingRecipeById, id) ? D.craftingRecipeById[id] : null; }
  function validCount(count) { return Number.isInteger(count) && count >= 1 && count <= C.maxBatch; }
  function record(state) { return state.crafting || { counts: {}, last: null }; }
  function total(state) { return Object.values(record(state).counts).reduce((sum, amount) => sum + amount, 0); }
  function rooms(state, recipe) { return recipe.requireRoom ? Object.keys(state.house.rooms).filter(id => state.house.rooms[id].type === recipe.requireRoom).sort() : []; }
  function quoteFor(state, recipe, count) {
    const counts = record(state).counts;
    // 只签相关条件；游玩计时、天气和居民幸福度刷新不会打断正在看的配方。
    return JSON.stringify([epoch, state.profile.createdAt, recipe.id, count, state.level, state.garden.harvest[recipe.cropId] || 0, state.inventory[recipe.itemId] || 0, Object.keys(counts).sort().map(id => [id, counts[id]]), rooms(state, recipe)]);
  }
  function statusFor(state, id, count) {
    const recipe = definition(id);
    if (!recipe) return fail('这份配方还没写进加工册，请重新挑一份。');
    if (!validCount(count)) return fail('一次可以制作 1 到 ' + C.maxBatch + ' 份，请重新选数量。');
    const crop = D.cropById[recipe.cropId], have = state.garden.harvest[recipe.cropId] || 0, need = recipe.cropCount * count;
    const stock = state.inventory[recipe.itemId] || 0, crafted = record(state).counts[recipe.id] || 0, totalCrafted = total(state);
    const unlocked = state.level >= Math.max(C.unlockLv, recipe.unlockLv), hasRoom = !recipe.requireRoom || rooms(state, recipe).length > 0;
    const enough = have >= need, fits = stock + count <= C.maxStock, historyFits = totalCrafted + count <= C.maxCount;
    const reason = !unlocked ? '小屋升到 Lv.' + Math.max(C.unlockLv, recipe.unlockLv) + '，就能制作这份心意。' : !hasRoom ? '先建好一间甜品工坊，再用果实做高级蛋糕吧。' : !enough ? '还差 ' + (need - have) + ' 份' + crop.name + '。先去花园收一收吧。' : !fits ? '这件成品的背包格快满啦，先摆好或送出一些，再来制作。' : !historyFits ? '加工记录已经装满，先下载JSON保存这座小屋吧。' : '材料备好啦，制作后成品会直接放进家具背包。';
    return { ok: true, recipe, definition: recipe, recipeId: recipe.id, count, itemId: recipe.itemId, outputId: recipe.itemId, outputCount: count, materials: [{ cropId: recipe.cropId, need, have }], stock, crafted, totalCrafted, unlocked, hasRoom, canCraft: unlocked && hasRoom && enough && fits && historyFits, maxCraftable: unlocked && hasRoom ? Math.max(0, Math.min(C.maxBatch, Math.floor(have / recipe.cropCount), C.maxStock - stock, C.maxCount - totalCrafted)) : 0, reason, quote: quoteFor(state, recipe, count) };
  }
  function status(id, count = 1) { return statusFor(G.state, id, count); }
  function list(count = 1) { return D.craftingRecipes.map(recipe => status(recipe.id, count)); }
  function latest() { return record(G.state).last ? clone(record(G.state).last) : null; }
  function craft(id, count = 1, expectedQuote) {
    if (busy) return fail('这份心意正在收好，请稍等一下。');
    const current = status(id, count);
    if (!current.ok) return current;
    if (typeof expectedQuote !== 'string' || expectedQuote !== current.quote) return fail('配方里的材料或背包刚刚有变化，请重新确认再制作。');
    if (!current.canCraft) return fail(current.reason);
    const recipe = definition(id), receipt = { recipeId: id, count, total: current.totalCrafted + count, at: Date.now() };
    busy = true;
    try {
      G.store.update(state => {
        const checked = statusFor(state, id, count);
        if (!checked.canCraft || quoteFor(state, recipe, count) !== expectedQuote) throw new Error('制作条件刚刚有变化，请重新确认配方。');
        const saved = record(state);
        state.garden.harvest[recipe.cropId] -= recipe.cropCount * count;
        state.inventory[recipe.itemId] = checked.stock + count; state.collection[recipe.itemId] = true;
        saved.counts[recipe.id] = checked.crafted + count; saved.last = clone(receipt); state.crafting = saved;
        state.memories.push({ at: receipt.at, text: '用 ' + recipe.cropCount * count + ' 份' + D.cropById[recipe.cropId].name + '制作了「' + D.furnitureById[recipe.itemId].name + '」×' + count + '，把收获变成小屋里的心意。' });
        if (state.memories.length > D.balance.maxMemories) state.memories.splice(0, state.memories.length - D.balance.maxMemories);
      }, { persist: true });
      const event = { recipeId: recipe.id, itemId: recipe.itemId, count, receipt: clone(receipt) };
      G.bus.emit('crafting:made', event);
      return { ok: true, message: '做好「' + D.furnitureById[recipe.itemId].name + '」×' + count + '啦！已经放进家具背包。', recipeId: recipe.id, itemId: recipe.itemId, count, receipt: clone(receipt) };
    } catch (error) { return fail(error.message || '这份心意暂时没能保存，材料和背包保持原样。请先下载JSON备份后再试。'); }
    finally { busy = false; }
  }
  G.bus.on('state:replace', () => { epoch++; });
  G.sys.crafting = { status, list, craft, latest };
})(window.Game);
