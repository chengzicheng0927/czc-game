(function (G) {
  'use strict';
  G.data.yardConfig = { unlockLv: 11, maxItems: 120, bounds: { left: -650, right: 650, top: 20, bottom: 270 } };
  const rows = [
    ['fence', '奶油小栅栏', 72, 48, 25, '#E8C6A3', true, 72, 48],
    ['path', '云朵石小路', 56, 28, 12, '#E6D5C4', true, 56, 28],
    ['mailbox', '爱心信箱', 48, 90, 65, '#EFB8C7'],
    ['swing', '花藤秋千', 122, 136, 180, '#D8BE9C'],
    ['slide', '草莓滑梯', 130, 105, 150, '#E7A8B8'],
    ['tree', '团团大树', 140, 160, 180, '#ABD0A7'],
    ['pond', '月牙小池塘', 150, 70, 170, '#AAD3DB'],
    ['streetlamp', '晚安路灯', 42, 135, 100, '#C3B2CA'],
    ['flowerbed', '彩色小花坛', 110, 58, 75, '#E5B9AE'],
    ['bench', '云边长椅', 112, 72, 100, '#D9B89B'],
    ['fountain', '星光喷泉', 100, 115, 220, '#B8CED5'],
    ['windmill', '微风小风车', 92, 145, 160, '#E4C4A1'],
    ['mushroom_lamp', '蘑菇小夜灯', 60, 72, 80, '#E6ADB8'],
    ['rabbit_statue', '软软兔子雕像', 60, 95, 95, '#E6D9CE'],
    ['flower_arch', '花开拱门', 125, 150, 200, '#DCC7B0'],
    ['picnic_mat', '草莓野餐垫', 120, 55, 65, '#E8B3C1'],
    ['bridge', '弯弯小木桥', 130, 65, 130, '#D3B090'],
    ['bush', '圆圆灌木', 90, 70, 55, '#A8C8A2'],
    ['stone_lantern', '月光石灯笼', 62, 100, 110, '#C6C4B5'],
    ['balloon_stall', '糖果气球摊', 115, 145, 160, '#E9B8CC']
  ];
  G.data.yardFurniture = rows.map(row => ({ id: 'yard_' + row[0], name: row[1], motif: row[0], template: 'yard', theme: 'basic', category: 'yard', place: 'yard', w: row[2], h: row[3], price: row[4], color: row[5], stroke: !!row[6], gridX: row[7] || 0, gridY: row[8] || 0, currency: 'coin', surface: null, comfort: 8, recolor: true, tags: ['yard', row[0]].concat(['streetlamp', 'mushroom_lamp', 'stone_lantern'].includes(row[0]) ? ['light'] : []), unlockLv: 11, rarity: row[4] >= 150 ? 'fine' : 'common' }));
  G.data.yardFurniture.forEach(def => { G.data.furniture.push(def); G.data.furnitureById[def.id] = def; });
})(window.Game);
