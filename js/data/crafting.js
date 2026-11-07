/* 收获的第二种去向：本地配方与成品共同注册，不替换原家具或作物。 */
(function (G) {
  'use strict';
  const D = G.data;
  const recipes = [
    { id: 'tulip_vase', name: '郁金香花瓶', description: '把三朵花插进小瓷瓶，让春天停在桌边。', cropId: 'tulip', cropCount: 3, itemId: 'craft_tulip_vase', requireRoom: null, unlockLv: 6 },
    { id: 'pumpkin_lantern', name: '手作南瓜灯', description: '把收获的南瓜做成温柔小灯。万圣节可以用，平时也能陪你亮着。', cropId: 'pumpkin', cropCount: 2, itemId: 'craft_pumpkin_lantern', requireRoom: null, unlockLv: 6 },
    { id: 'sakura_tree', name: '庭院樱花树', description: '把成熟的樱花树苗移进前院，留下一树软软的春天。', cropId: 'sakura', cropCount: 1, itemId: 'craft_sakura_tree', requireRoom: null, unlockLv: 11 },
    { id: 'strawberry_deluxe', name: '双层草莓蛋糕', description: '甜品工坊把新鲜草莓做成双层小蛋糕，可以摆在桌上，也能送给朋友。', cropId: 'strawberry', cropCount: 2, itemId: 'cake_strawberry_deluxe', requireRoom: 'workshop', unlockLv: 21 },
    { id: 'blueberry_deluxe', name: '双层蓝莓蛋糕', description: '甜品工坊把蓝莓与奶油叠成两层，把花园的清甜分享给朋友。', cropId: 'blueberry', cropCount: 2, itemId: 'cake_blueberry_deluxe', requireRoom: 'workshop', unlockLv: 21 }
  ];
  D.craftingRecipes = recipes;
  D.craftingRecipeById = Object.create(null);
  recipes.forEach(recipe => { D.craftingRecipeById[recipe.id] = recipe; });
  D.craftingConfig = { unlockLv: 6, maxBatch: 99, maxCount: 1000000000, maxStock: 9999 };
  const definitions = [
    { id: 'craft_tulip_vase', name: '郁金香花瓶', place: 'table', category: 'small', w: 40, h: 64, color: '#C2DFE1', theme: 'garden', comfort: 7, rarity: 'fine', tags: ['vase', 'flower', 'plant'] },
    { id: 'craft_pumpkin_lantern', name: '手作南瓜灯', place: 'floor', category: 'decor', w: 56, h: 55, color: '#E8AC76', theme: 'basic', comfort: 8, rarity: 'fine', tags: ['pumpkin', 'light'] },
    { id: 'craft_sakura_tree', name: '庭院樱花树', unlockLv: 11, place: 'yard', category: 'yard', w: 140, h: 160, color: '#EFB7CA', theme: 'garden', comfort: 10, rarity: 'rare', tags: ['yard', 'tree', 'plant', 'sakura'] },
    { id: 'cake_strawberry_deluxe', name: '双层草莓蛋糕', giftCrop: 'strawberry', place: 'table', category: 'small', w: 54, h: 61, color: '#E8A9B8', theme: 'strawberry', comfort: 8, rarity: 'fine', tags: ['cake', 'food', 'strawberry'] },
    { id: 'cake_blueberry_deluxe', name: '双层蓝莓蛋糕', giftCrop: 'blueberry', place: 'table', category: 'small', w: 54, h: 61, color: '#A8AED7', theme: 'garden', comfort: 8, rarity: 'fine', tags: ['cake', 'food', 'blueberry'] }
  ];
  D.craftedFurniture = definitions.map(entry => Object.assign({ template: 'crafting', surface: null, price: 0, currency: 'none', recolor: false, source: 'crafting', rewardOnly: true, unlockLv: entry.id.startsWith('cake_') ? 21 : 6 }, entry, { tags: ['crafting', 'crafted'].concat(entry.tags) }));
  D.craftedFurniture.forEach(definition => {
    if (Object.prototype.hasOwnProperty.call(D.furnitureById, definition.id)) throw new Error('加工成品ID重复：' + definition.id);
    D.furniture.push(definition); D.furnitureById[definition.id] = definition;
    if (definition.place === 'yard') { if (!Array.isArray(D.yardFurniture)) D.yardFurniture = []; D.yardFurniture.push(definition); }
  });
})(window.Game);
