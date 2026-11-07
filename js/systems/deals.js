/* 日期只参与可复现的抽样，不消耗随机数、不修改存档，也不运行刷新计时器。 */
(function (G) {
  'use strict';
  const D = G.data, C = D.dealConfig;
  let cachedDate = '', cachedSignature = '', cachedIds = [];
  const isEligible = def => !!def && !def.rewardOnly && !def.festivalId && !def.customArt && (def.currency || 'coin') === 'coin' && Number.isInteger(def.price) && def.price > 0;
  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parts = value.split('-').map(Number), date = new Date(0); date.setFullYear(parts[0], parts[1] - 1, parts[2]); date.setHours(12, 0, 0, 0);
    return parts[0] >= 1 && date.getFullYear() === parts[0] && date.getMonth() === parts[1] - 1 && date.getDate() === parts[2];
  }
  function dateKey(value) { return value === undefined ? G.utils.dateKey() : validDate(value) ? value : null; }
  function randomFor(date) {
    let seed = 2166136261;
    for (const character of 'cottage-deals-v1:' + date) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619) >>> 0;
    if (!seed) seed = 0x6d2b79f5;
    return () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  }
  function selection(date) {
    const pool = D.furniture.filter(isEligible).map(def => def.id).sort(), signature = pool.join('|');
    if (date !== cachedDate || signature !== cachedSignature) {
      const random = randomFor(date);
      // 部分洗牌只抽六次；不能用随机排序，否则不同引擎可能得到不同结果。
      for (let i = 0; i < Math.min(C.count, pool.length); i++) { const j = i + Math.floor(random() * (pool.length - i)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      cachedDate = date; cachedSignature = signature; cachedIds = pool.slice(0, C.count);
    }
    return cachedIds;
  }
  function discounted(def) { return Math.ceil(def.price * C.numerator / C.denominator); }
  function priceFor(id, requestedDate) {
    if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(D.furnitureById, id)) return null;
    const def = D.furnitureById[id];
    const date = dateKey(requestedDate);
    return date && isEligible(def) && selection(date).indexOf(id) >= 0 ? discounted(def) : def.price;
  }
  function list(requestedDate) {
    const date = dateKey(requestedDate); if (!date) return [];
    return selection(date).map(id => {
      const def = D.furnitureById[id], price = discounted(def), locked = G.state.level < (def.unlockLv || 1), short = Math.max(0, price - G.state.wallet.coin), full = (G.state.inventory[id] || 0) >= C.maxStock;
      return { id, definition: G.utils.clone(def), originalPrice: def.price, price, discount: C.discount, locked, short, full, canBuy: !locked && !short && !full, reason: locked ? 'Lv.' + def.unlockLv + ' 解锁' : full ? '背包里这件家具已经装满' : short ? '还差 ' + short + ' 颗糖果' : '' };
    });
  }
  function status(requestedDate) { const date = dateKey(requestedDate), items = date ? list(date) : []; return { date, count: items.length, discount: C.discount, items }; }
  G.sys.deals = { list, status, priceFor };
})(window.Game);
