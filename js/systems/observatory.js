/* 观星只在一次真实保存成功后发奖，不新增计时器。 */
(function (G) {
  'use strict';
  const D = G.data, C = D.observatoryConfig, clone = value => G.utils.clone(value);
  let busy = false;
  const fail = message => ({ ok: false, message });
  const observatoryFloorId = 'observatory_floor';
  function record() { return G.state.observatory; }
  function facilityFloor(state) { return state.building.floors.find(floor => floor.id === observatoryFloorId) || state.building.floors.find(floor => floor.id === 'legacy_attic') || null; }
  function latest() { return record().lastDiscovery ? clone(record().lastDiscovery) : null; }
  function isNight() {
    if (G.sys.time && G.sys.time.current) return G.sys.time.current().phase === 'night';
    if (G.state.settings.dayMode !== 'real') return G.state.settings.dayMode === 'night';
    const hour = new Date().getHours(); return hour >= 20 || hour < 6;
  }
  function status() {
    const saved = record(), today = G.utils.dateKey(), owned = saved.built, floor = facilityFloor(G.state), built = owned && !!floor, unlocked = G.state.level >= C.unlockLv, night = isNight(), clockBehind = saved.lastDate !== '' && today < saved.lastDate;
    const price = owned ? 0 : C.price, inconsistent = !owned && !!floor;
    const alreadyObserved = saved.lastDate !== '' && today <= saved.lastDate, canBuild = unlocked && !built && !inconsistent && G.state.wallet.coin >= price;
    const full = saved.observations >= C.maxObservations || saved.fragments + C.dailyFragments > C.maxFragments;
    const reason = !unlocked ? '小屋升到 ' + C.unlockLv + ' 级，就能搭起天文台。' : inconsistent ? '观星楼层已存在，但购买记录没有关联。请先保留JSON存档，再检查这份小屋。' : !built ? owned ? '天文台已经购买，观星楼层暂时缺失。可以免费重新搭建，原有观星记录会保留。' : G.state.wallet.coin < price ? '还差 ' + (price - G.state.wallet.coin) + ' 颗糖果，就能搭起天文台。' : '花 ' + price + ' 颗糖果增加观星楼层和实际围墙，原有建筑保持。' : clockBehind ? '设备日期早于已保存的观星记录，等日期赶上后再来看星星吧。' : alreadyObserved ? '今晚的星星碎片已经收好。下一个夜晚，再来看看新星群吧。' : !night ? '望远镜在等夜幕降临。晚上 20 点到早上 6 点，或在设置里选择永远夜晚，就能观星。' : full ? '星星收集册已经装满，先把这段星空回忆保存下来吧。' : '今晚还没有观星。望一望星空，可以收下 ' + C.dailyFragments + ' 枚星星碎片。';
    return { date: today, owned, built, floorId: floor && floor.id, needsRebuild: owned && !floor, inconsistent, unlocked, night, clockBehind, alreadyObserved, canBuild, canObserve: built && unlocked && night && !alreadyObserved && !full, price, fragments: saved.fragments, observations: saved.observations, lastDiscovery: latest(), constellation: clone(D.constellationForDate(today)), reason };
  }
  function memory(state, at, text) { state.memories.push({ at, text }); if (state.memories.length > D.balance.maxMemories) state.memories.splice(0, state.memories.length - D.balance.maxMemories); }
  function build() {
    if (busy) return fail('阁楼正在收拾，等一下再来吧。');
    const current = status();
    if (!current.canBuild) return fail(current.built ? '阁楼天文台已经建好啦。' : current.reason);
    const at = Date.now(), rebuilding = current.owned; busy = true;
    try {
      G.store.update(state => {
        const cost = state.observatory.built ? 0 : C.price;
        if (facilityFloor(state) || state.level < C.unlockLv || state.wallet.coin < cost || state.observatory.built !== rebuilding) throw new Error('观星楼层或购买状态发生变化。');
        const api = window.CottageBuilding;
        if (!api || typeof api.executeCommand !== 'function') throw new Error('建筑模块未完整加载，请重新打开小屋。');
        const elevation = Math.max(0, ...state.building.floors.filter(floor => floor.id !== 'legacy_yard').map(floor => floor.elevation)) + 3;
        let building = api.executeCommand(state.building, { type: 'floor.add', floor: { id: observatoryFloorId, name: '天文台', elevation } }, D.furnitureById);
        const corners = [{ x: -2.6, z: -2 }, { x: 2.6, z: -2 }, { x: 2.6, z: 2 }, { x: -2.6, z: 2 }];
        corners.forEach((start, index) => {
          building = api.executeCommand(building, { type: 'wall.add', wall: { id: G.utils.uid('observatory_wall'), floorId: observatoryFloorId, start, end: corners[(index + 1) % corners.length], height: 2.7, thickness: .16, color: '#E9DDEF' } }, D.furnitureById);
        });
        state.building = building; state.wallet.coin -= cost; state.observatory.built = true;
        memory(state, at, rebuilding ? '免费重新搭起观星楼层，原有星空回忆都好好保留。' : '在小屋上方搭起天文台。今晚，和小屋一起等星星。');
      }, { persist: true });
      G.bus.emit('observatory:built', { at, floorId: observatoryFloorId, rebuilding });
      return { ok: true, floorId: observatoryFloorId, rebuilding, message: rebuilding ? '观星楼层重新搭好啦，没有再次扣除糖果，星空记录仍保留。' : '天文台建好啦！夜晚来这里，和星星打个招呼吧。' };
    } catch (error) { return fail((error && error.message || '天文台还没有保存好。') + ' 原有建筑、糖果和星空记录保持原样，请先下载JSON备份后再试。'); }
    finally { busy = false; }
  }
  function observe() {
    if (busy) return fail('这段星空正在收好，稍等一下吧。');
    const current = status(); if (!current.canObserve) return fail(current.reason);
    const discovery = { id: current.constellation.id, at: Date.now(), date: current.date, fragments: C.dailyFragments }; busy = true;
    try {
      G.store.update(state => {
        const saved = state.observatory;
        if (!saved.built || !facilityFloor(state) || state.level < C.unlockLv || !isNight() || saved.lastDate >= current.date || saved.observations >= C.maxObservations || saved.fragments + C.dailyFragments > C.maxFragments) throw new Error('星空状态发生变化');
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
