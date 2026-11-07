/* 七份心意只按领取次数前进，漏登不会扣掉进度。 */
(function (G) {
  'use strict';
  const D = G.data;
  D.loginConfig = { maxClaims: 1000000000, maxStock: 9999, maxCoin: 1000000000, seeds: { daisy: 3, tulip: 2, strawberry: 2 } };
  D.loginDays = [
    { day: 1, kind: 'coin', coin: 50, name: '50颗糖果', icon: '🍬' },
    { day: 2, kind: 'coin', coin: 100, name: '100颗糖果', icon: '🍬' },
    { day: 3, kind: 'seeds', coin: 0, name: '花果种子包', icon: '🌱' },
    { day: 4, kind: 'coin', coin: 150, name: '150颗糖果', icon: '🍬' },
    { day: 5, kind: 'furniture', rarity: 'fine', coin: 0, name: '精致家具', icon: '🪑' },
    { day: 6, kind: 'coin', coin: 200, name: '200颗糖果', icon: '🍬' },
    { day: 7, kind: 'furniture', rarity: 'rare', coin: 0, name: '稀有家具', icon: '🎁' }
  ];
  function random(seed) {
    let value = 2166136261;
    for (let i = 0; i < seed.length; i++) { value ^= seed.charCodeAt(i); value = Math.imul(value, 16777619); }
    return (value >>> 0) / 4294967296;
  }
  D.loginFurniturePool = rarity => D.furniture.filter(def => def.rarity === rarity && !def.rewardOnly && !def.festivalId && !def.customArt && def.currency === 'coin');
  D.loginReward = (day, date, claimed) => {
    const definition = D.loginDays[day - 1], pool = definition.kind === 'furniture' ? D.loginFurniturePool(definition.rarity) : [];
    const chosen = pool.length ? pool[Math.floor(random('login:' + date + ':' + claimed + ':' + day) * pool.length)] : null;
    return { day, at: 0, kind: definition.kind, coin: definition.coin, itemId: chosen ? chosen.id : null, seeds: definition.kind === 'seeds' ? Object.assign({}, D.loginConfig.seeds) : null };
  };
})(window.Game);
