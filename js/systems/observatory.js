/* 观星只在一次真实保存成功后发奖，不新增计时器。 */
(function (G) {
  'use strict';
  const D = G.data, C = D.observatoryConfig, clone = value => G.utils.clone(value);
  let busy = false;
  const fail = message => ({ ok: false, message });
  function record() { return G.state.observatory; }
  function latest() { return record().lastDiscovery ? clone(record().lastDiscovery) : null; }
  function isNight() {
    if (G.sys.time && G.sys.time.current) return G.sys.time.current().phase === 'night';
    if (G.state.settings.dayMode !== 'real') return G.state.settings.dayMode === 'night';
    const hour = new Date().getHours(); return hour >= 20 || hour < 6;
  }
  function status() {
    const saved = record(), today = G.utils.dateKey(), built = !!G.state.house.attic, unlocked = G.state.level >= C.unlockLv, night = isNight(), clockBehind = saved.lastDate !== '' && today < saved.lastDate;
    const alreadyObserved = saved.lastDate !== '' && today <= saved.lastDate, canBuild = unlocked && !built && G.state.wallet.coin >= C.price;
    const full = saved.observations >= C.maxObservations || saved.fragments + C.dailyFragments > C.maxFragments;
    const reason = !unlocked ? '小屋升到 ' + C.unlockLv + ' 级，就能在阁楼搭起天文台。' : !built ? G.state.wallet.coin < C.price ? '还差 ' + (C.price - G.state.wallet.coin) + ' 颗糖果，就能把望远镜搬上阁楼。' : '花 ' + C.price + ' 颗糖果建造天文台，普通房间格会完整保留。' : clockBehind ? '设备日期早于已保存的观星记录，等日期赶上后再来看星星吧。' : alreadyObserved ? '今晚的星星碎片已经收好。下一个夜晚，再来看看新星群吧。' : !night ? '望远镜在等夜幕降临。晚上 20 点到早上 6 点，或在设置里选择永远夜晚，就能观星。' : full ? '星星收集册已经装满，先把这段星空回忆保存下来吧。' : '今晚还没有观星。望一望星空，可以收下 ' + C.dailyFragments + ' 枚星星碎片。';
    return { date: today, built, unlocked, night, clockBehind, alreadyObserved, canBuild, canObserve: built && unlocked && night && !alreadyObserved && !full, price: C.price, fragments: saved.fragments, observations: saved.observations, lastDiscovery: latest(), constellation: clone(D.constellationForDate(today)), reason };
  }
  function memory(state, at, text) { state.memories.push({ at, text }); if (state.memories.length > D.balance.maxMemories) state.memories.splice(0, state.memories.length - D.balance.maxMemories); }
  function build() {
    if (busy) return fail('阁楼正在收拾，等一下再来吧。');
    const current = status();
    if (!current.canBuild) return fail(current.built ? '阁楼天文台已经建好啦。' : current.reason);
    const at = Date.now(); busy = true;
    try {
      G.store.update(state => {
        if (state.house.attic || state.level < C.unlockLv || state.wallet.coin < C.price) throw new Error('阁楼状态发生变化');
        state.wallet.coin -= C.price; state.house.attic = { type: 'observatory', paidPrice: C.price, builtAt: at, room: G.store.newAtticRoom() };
        memory(state, at, '在屋顶搭起阁楼天文台。今晚，和小屋一起等星星。');
      }, { persist: true });
      G.bus.emit('observatory:built', { at });
      return { ok: true, message: '阁楼天文台建好啦！夜晚来这里，和星星打个招呼吧。' };
    } catch (_) { return fail('阁楼还没有动工，糖果保持原样。请先下载JSON备份，或整理相册后再试一次。'); }
    finally { busy = false; }
  }
  function observe() {
    if (busy) return fail('这段星空正在收好，稍等一下吧。');
    const current = status(); if (!current.canObserve) return fail(current.reason);
    const discovery = { id: current.constellation.id, at: Date.now(), date: current.date, fragments: C.dailyFragments }; busy = true;
    try {
      G.store.update(state => {
        const saved = state.observatory;
        if (!state.house.attic || state.level < C.unlockLv || !isNight() || saved.lastDate >= current.date || saved.observations >= C.maxObservations || saved.fragments + C.dailyFragments > C.maxFragments) throw new Error('星空状态发生变化');
        saved.fragments += C.dailyFragments; saved.observations++; saved.lastDate = current.date; saved.lastDiscovery = clone(discovery);
        memory(state, discovery.at, '在阁楼发现「' + current.constellation.name + '」，收下 ' + C.dailyFragments + ' 枚星星碎片。' + current.constellation.story);
      }, { persist: true });
      G.bus.emit('observatory:observed', { discovery: clone(discovery) });
      return { ok: true, message: '发现「' + current.constellation.name + '」！' + C.dailyFragments + ' 枚星星碎片已经收好。', discovery: clone(discovery) };
    } catch (_) { return fail('这次星空还没有保存，观星机会和碎片保持原样。请先下载JSON备份，再试一次吧。'); }
    finally { busy = false; }
  }
  G.sys.observatory = { status, build, observe, latest, init() {} };
})(window.Game);
