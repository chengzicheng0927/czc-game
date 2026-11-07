(function (Game) {
  'use strict';
  Game.data.balance = {
    version: 1, saveKey: 'marshmallow_cottage_save_v1', maxSaveBytes: 3 * 1024 * 1024, maxSaveChars: 2500000,
    roomWidth: 320, roomHeight: 220, floorLine: 200, ceilingLine: 14, wallBottom: 160,
    initialCoin: 300, initialHeart: 0, maxLevel: 30, expBase: 40, expStep: 20,
    roomExp: 30, firstPlaceExp: 5, purchaseExpDivisor: 20, undoLimit: 20,
    maxMemories: 200, maxResidentsPerRoom: 2, maxItems: 1000,
    saveDebounceMs: 1200, saveIntervalMs: 30000, residentTickMs: 30000,
    maxOfflineMs: 7 * 24 * 60 * 60 * 1000, maxBubbles: 3, minBubbleMinutes: 10,
    maxBubbleMinutes: 30, minBubbleHearts: 5, maxBubbleHearts: 20,
    patsPerDay: 3, patAffection: 5, chatAffection: 2, giftAffection: 20,
    giftExp: 5, heartCollectExp: 5, giftName: '小蛋糕', tutorialReward: 300,
    affectionLevels: [0, 100, 300, 600, 1000],
    bakery: { duration: 60, starCoins: [30, 60, 100], starExp: [10, 20, 30], fullPlays: 5 },
    floorUnlocks: [{ level: 1, floors: 1, slots: 2 }, { level: 3, floors: 1, slots: 3 }, { level: 6, floors: 2, slots: 3 }, { level: 17, floors: 3, slots: 3 }, { level: 25, floors: 4, slots: 3 }],
    colors: ['#FFB6C8', '#FFF1C1', '#BDECD6', '#BFE3FF', '#D9C8FF', '#FFD3B0', '#FFFFFF', '#E8C39E', '#A87960', '#6B4E5E', '#FFA0AC', '#FFE0E9', '#F8DE98', '#D0E7AF', '#9BD1B3', '#8BC5DE', '#B2B0E7', '#DDB9E4', '#FFBC92', '#E9C8A6', '#E3B9A8', '#C1D0C5', '#A9C2D5', '#CDB6A5'],
    wallpaperPatterns: ['solid', 'dots', 'stripes', 'check', 'flowers', 'hearts', 'stars', 'clouds', 'wood', 'brick'],
    floorPatterns: ['wood', 'tile', 'carpet', 'grass', 'cloud', 'marble', 'tatami', 'stars']
  };
})(window.Game);
