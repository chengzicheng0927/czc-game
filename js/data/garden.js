(function (Game) {
  'use strict';
  var rows = [
    ['daisy', '小雏菊', 5, 1, 12, '送给朋友的小小心意', 'flower', '#FFF8E6', '#F2CD68'],
    ['tulip', '郁金香', 10, 3, 25, '一朵软软的春天', 'tulip', '#EF9BAD', '#FFE8A8'],
    ['strawberry', '草莓', 15, 5, 35, '香甜的蛋糕材料', 'berry', '#E9869A', '#FFF1B4'],
    ['carrot', '胡萝卜', 15, 5, 35, '莉莉最喜欢的礼物', 'carrot', '#EEAF71', '#FFE1A3'],
    ['sunflower', '向日葵', 20, 8, 50, '把阳光送给朋友', 'flower', '#F8D47B', '#AA795E'],
    ['rose', '玫瑰', 25, 10, 65, '盛开着温柔的心意', 'rose', '#DE93B0', '#FFC3CD'],
    ['pumpkin', '南瓜', 30, 15, 80, '圆滚滚的秋日礼物', 'pumpkin', '#EDB07D', '#F6CE9B'],
    ['lavender', '薰衣草', 30, 15, 80, '咪露喜欢的花香', 'lavender', '#B5A0D9', '#DED0EF'],
    ['blueberry', '蓝莓', 35, 20, 95, '带着露珠的蛋糕材料', 'blueberry', '#9BA8D5', '#DCE4F5'],
    ['sakura', '樱花树苗', 60, 30, 160, '把春天种在小院里', 'tree', '#EFB5C9', '#FFE0E9'],
    ['rainbow_flower', '彩虹花', 100, 60, 300, '稀有的七色小惊喜', 'rainbow', '#B7A4DB', '#FFF1AE'],
    ['star_fruit', '星星果', 120, 90, 360, '只能在夜晚播种', 'star', '#F6D78C', '#FFF2BB']
  ];
  Game.data.crops = rows.map(function (r) {
    return { id: r[0], name: r[1], seedPrice: r[2], growMinutes: r[3], growMs: r[3] * 60000, sellPrice: r[4], description: r[5], shape: r[6], color: r[7], accent: r[8], nightOnly: r[0] === 'star_fruit' };
  });
  Game.data.cropById = {};
  Game.data.crops.forEach(function (crop) { Game.data.cropById[crop.id] = crop; });
  Game.data.gardenConfig = { unlockLv: 6, expandLv: 14, basePlots: 6, expandedPlots: 9, starterSeeds: { daisy: 3 }, harvestExp: 3, maxStock: 9999, stageNames: ['小种子', '发芽啦', '小花苞', '成熟啦'] };
})(window.Game);
