/* 礼盒只使用游戏糖果，礼物来自当前等级的普通家具。 */
(function (G) {
  'use strict';
  const D = G.data;
  D.giftConfig = { paidCost: 200, completeCoins: 300, maxStock: 9999, maxCoin: 1000000000, maxOpened: 1000000000, liftAfterMs: 650, revealAfterMs: 1250, confettiCount: 16 };
  D.giftPool = level => D.furniture.filter(def => !def.rewardOnly && !def.festivalId && !def.customArt && def.currency !== 'none' && (def.unlockLv || 1) <= level);
})(window.Game);
