/* 先一次性保存礼物凭据，再播放开盒；关窗和刷新都不会把奖励发两遍。 */
(function (G) {
  'use strict';
  const D = G.data, C = D.giftConfig;
  let opening = false, lastOpenedAt = null;
  const clone = value => G.utils.clone(value);
  const fail = message => ({ ok: false, message });
  function box() { return G.state.giftBox || { date: G.state.daily.lastLoginDate, freeUsed: !!G.state.daily.freeBoxUsed, opened: 0, lastReward: null }; }
  function latest() { return box().lastReward ? clone(box().lastReward) : null; }
  function eligible() { return D.giftPool(G.state.level); }
  function status() {
    const current = box(), today = G.utils.dateKey(), choices = eligible(), remaining = choices.filter(def => G.state.collection[def.id] !== true).length;
    const clockBehind = today < current.date, freeAvailable = today > current.date || today === current.date && !current.freeUsed, cost = freeAvailable ? 0 : C.paidCost;
    const enoughCoin = G.state.wallet.coin >= cost, fullCoin = remaining === 0 && G.state.wallet.coin - cost + C.completeCoins > C.maxCoin;
    return { date: today, savedDate: current.date, freeAvailable, freeUsed: !freeAvailable, clockBehind, cost, coin: G.state.wallet.coin, remaining, total: choices.length, opened: current.opened, lastReward: latest(), canOpen: enoughCoin && !fullCoin && current.opened < C.maxOpened, reason: !enoughCoin ? '再攒 ' + (cost - G.state.wallet.coin) + ' 颗糖果，就能拆这份礼盒。' : fullCoin ? '糖果罐快装满啦，先花掉一些，再来收礼物吧。' : current.opened >= C.maxOpened ? '礼盒记录已经装满，先保留这份小屋存档吧。' : '' };
  }
  function open() {
    if (opening) return fail('这份礼盒正在收好，稍等一下吧。');
    const now = Date.now();
    if (lastOpenedAt !== null && now >= lastOpenedAt && now - lastOpenedAt < C.revealAfterMs) return fail('上一份礼物刚刚收好，等一小会儿再拆下一份吧。');
    const current = status();
    if (!current.canOpen) return fail(current.reason);
    const missing = eligible().filter(def => G.state.collection[def.id] !== true);
    const chosen = missing.length ? missing[Math.min(missing.length - 1, Math.floor(Math.max(0, Math.min(.999999999, Math.random())) * missing.length))] : null;
    if (chosen && (G.state.inventory[chosen.id] || 0) >= C.maxStock) return fail('这件家具的背包格已经装满，先整理一下再来收礼物吧。');
    const reward = { id: G.utils.uid('gift'), at: Date.now(), kind: chosen ? 'furniture' : 'coin', itemId: chosen ? chosen.id : null, coin: chosen ? 0 : C.completeCoins, paid: !current.freeAvailable };
    opening = true;
    try {
      G.store.update(state => {
        const saved = state.giftBox, today = current.date;
        if (today > saved.date) { saved.date = today; saved.freeUsed = false; }
        const free = today === saved.date && !saved.freeUsed, cost = free ? 0 : C.paidCost;
        if (cost !== current.cost || free !== current.freeAvailable || state.wallet.coin < cost || saved.opened >= C.maxOpened) throw new Error('这份礼盒刚刚有了变化。');
        if (chosen) {
          if (state.collection[chosen.id] === true || (state.inventory[chosen.id] || 0) >= C.maxStock) throw new Error('这件心意已经收好了。');
          state.inventory[chosen.id] = (state.inventory[chosen.id] || 0) + 1; state.collection[chosen.id] = true;
        } else if (state.wallet.coin - cost + reward.coin > C.maxCoin) throw new Error('糖果罐快装满啦。');
        state.wallet.coin = state.wallet.coin - cost + reward.coin;
        if (free) saved.freeUsed = true;
        saved.opened++; saved.lastReward = clone(reward);
        // 旧字段继续作兼容镜像；免费资格只由带日期的礼盒记录决定。
        state.daily.freeBoxUsed = saved.freeUsed;
        state.memories.push({ at: reward.at, text: (free ? '拆开今天的免费礼盒' : '用 ' + C.paidCost + ' 颗糖果拆开一份礼盒') + (chosen ? '，收下「' + chosen.name + '」，准备给小屋添一份新心意。' : '。当前等级的普通家具都收集啦，糯米送来 ' + reward.coin + ' 颗糖果。') });
        if (state.memories.length > D.balance.maxMemories) state.memories.splice(0, state.memories.length - D.balance.maxMemories);
      }, { persist: true });
    } catch (_) { return fail('礼盒还没有拆开，糖果和免费机会都保持原样。先导出JSON备份，或整理一下相册，再试一次吧。'); }
    finally { opening = false; }
    lastOpenedAt = reward.at;
    G.bus.emit('gift:opened', { reward: clone(reward), cost: current.cost, free: current.freeAvailable });
    return { ok: true, message: chosen ? '收下「' + chosen.name + '」啦！已经放进家具背包。' : '当前等级的家具都收集啦，收好 ' + reward.coin + ' 颗糖果。', reward: clone(reward), cost: current.cost, free: current.freeAvailable };
  }
  // 日期在真正拆盒时按单次事务前进，不为看一眼礼盒增加存档或计时器。
  function init() {}
  G.bus.on('state:replace', () => { lastOpenedAt = null; });
  G.sys.gifts = { init, status, open, latest };
})(window.Game);
