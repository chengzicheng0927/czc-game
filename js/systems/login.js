/* 登录礼物的奖励与领取日期先一并保存，再展示结果。 */
(function (G) {
  'use strict';
  const D = G.data, C = D.loginConfig;
  let claiming = false;
  const clone = value => G.utils.clone(value), fail = message => ({ ok: false, message });
  function book() { return G.state.loginRewards; }
  function latest() { return book().lastReward ? clone(book().lastReward) : null; }
  function description(reward) {
    if (!reward) return '今天的心意';
    if (reward.kind === 'coin') return reward.coin + '颗糖果';
    if (reward.kind === 'seeds') return '种子包：小雏菊×3、郁金香×2、草莓×2';
    return (D.furnitureById[reward.itemId] || {}).name || '一件家具';
  }
  function status() {
    const saved = book(), date = G.utils.dateKey(), day = saved.claimed % 7 + 1, clockBehind = !!saved.lastClaimDate && date < saved.lastClaimDate, claimedToday = date === saved.lastClaimDate;
    const reward = D.loginReward(day, date, saved.claimed);
    let reason = '';
    if (clockBehind) reason = '设备日期早于领取记录，等日期赶上后再来收心意吧。';
    else if (claimedToday) reason = '今天的小礼物已经收好。明天继续下一份，漏登也不会清零。';
    else if (saved.claimed >= C.maxClaims) reason = '心意记录已经装满，请先保留这份小屋存档。';
    else if (reward.kind === 'coin' && G.state.wallet.coin + reward.coin > C.maxCoin) reason = '糖果罐快装满啦，先用掉一些，再来收礼物吧。';
    else if (reward.kind === 'seeds' && Object.keys(C.seeds).some(id => (G.state.garden.seeds[id] || 0) + C.seeds[id] > C.maxStock)) reason = '种子袋快装满啦，先种下一些，再来收这份心意吧。';
    else if (reward.kind === 'furniture' && (!reward.itemId || (G.state.inventory[reward.itemId] || 0) >= C.maxStock)) reason = '这件家具的背包格已经装满，先整理一下再来收心意吧。';
    let completed = saved.claimed % 7;
    if ((claimedToday || clockBehind) && saved.claimed > 0 && completed === 0) completed = 7;
    return { date, day, reward: clone(reward), claimed: saved.claimed, lastClaimDate: saved.lastClaimDate, lastReward: latest(), claimedToday, clockBehind, completed, cycle: Math.floor((saved.claimed - (completed === 7 ? 1 : 0)) / 7) + 1, canClaim: !claiming && !reason, reason };
  }
  function claim() {
    if (claiming) return fail('这份心意正在收好，稍等一下吧。');
    const current = status(); if (!current.canClaim) return fail(current.reason);
    const reward = current.reward; reward.at = Date.now(); claiming = true;
    try {
      G.store.update(state => {
        const saved = state.loginRewards;
        if (saved.claimed !== current.claimed || saved.lastClaimDate && current.date <= saved.lastClaimDate) throw new Error('今天的心意已经收好了。');
        if (reward.kind === 'coin') {
          if (state.wallet.coin + reward.coin > C.maxCoin) throw new Error('糖果罐快装满啦。');
          state.wallet.coin += reward.coin;
        } else if (reward.kind === 'seeds') {
          Object.keys(reward.seeds).forEach(id => { if ((state.garden.seeds[id] || 0) + reward.seeds[id] > C.maxStock) throw new Error('种子袋快装满啦。'); state.garden.seeds[id] = (state.garden.seeds[id] || 0) + reward.seeds[id]; });
        } else {
          if (!reward.itemId || (state.inventory[reward.itemId] || 0) >= C.maxStock) throw new Error('家具背包格已经装满啦。');
          state.inventory[reward.itemId] = (state.inventory[reward.itemId] || 0) + 1; state.collection[reward.itemId] = true;
        }
        saved.claimed++; saved.lastClaimDate = current.date; saved.lastReward = clone(reward);
        // 旧字段保留兼容镜像，资格只由独立领取记录决定。
        if (state.daily.lastLoginDate <= current.date) state.daily.lastLoginDate = current.date;
        state.daily.loginDay = current.day; state.daily.giftClaimed = true;
        state.memories.push({ at: reward.at, text: '收好第' + reward.day + '份登录心意：' + description(reward) + '。每天一份，按自己的节奏慢慢来。' });
        if (state.memories.length > D.balance.maxMemories) state.memories.splice(0, state.memories.length - D.balance.maxMemories);
      }, { persist: true });
      G.bus.emit('login:claimed', { reward: clone(reward), claimed: G.state.loginRewards.claimed });
      return { ok: true, message: '收好' + description(reward) + '啦！', reward: clone(reward) };
    } catch (_) { return fail('这份心意还没有领走，进度和奖励保持原样。先导出JSON备份，或整理一下相册，再试一次吧。'); }
    finally { claiming = false; }
  }
  function init() {}
  G.sys.login = { status, claim, latest, init, description };
})(window.Game);
