/* M10家具扩充：只追加，保留首版43件的ID、尺寸、台面和价格。 */
(function (G) {
  'use strict';
  const D = G.data;
  const themeRows = [
    ['basic', '简约日常', '🌿', 1, 1, '原木', 'none', ['#E8C39E', '#FFF8EB', '#A87960']],
    ['strawberry', '草莓甜品', '🍓', 1, 1.1, '草莓', 'strawberry', ['#FFB6C8', '#FFF1C1', '#E58BA7']],
    ['forest', '森林小屋', '🍄', 6, 1.2, '苔绿', 'leaf', ['#B9C88E', '#E8C39E', '#77935F']],
    ['garden', '田园花香', '🌼', 8, 1.3, '雏菊', 'daisy', ['#E8D392', '#E8F0C9', '#93AD83']],
    ['ocean', '海洋之心', '🐚', 11, 1.45, '贝壳', 'shell', ['#ACD2DF', '#F5F1E5', '#82ACBF']],
    ['cloud', '云朵棉花', '☁', 13, 1.6, '云朵', 'cloud', ['#F3EFDF', '#D2E5F1', '#B5B9D6']],
    ['oriental', '东方小院', '🏮', 16, 1.75, '祥云', 'auspicious_cloud', ['#CC9C97', '#D1DDB8', '#A77F68']],
    ['starry', '星空梦境', '🌙', 18, 1.9, '星光', 'star', ['#AAA0CA', '#F0DB9F', '#897EAB']],
    ['princess', '梦幻公主', '👑', 22, 2.2, '珍珠', 'crown', ['#E6BDD4', '#F8E9BF', '#C5A274']]
  ];
  themeRows.forEach(row => {
    if (!D.themes[row[0]]) D.themes[row[0]] = { id: row[0], name: row[1], icon: row[2], unlockLv: row[3], motif: row[6], palette: row[7] };
    D.themes[row[0]].priceFactor = row[4]; D.themes[row[0]].prefix = row[5];
  });
  // 所有38个scene已有独立绘制的canonical模板；surface与实际台面高度对应。
  const rows = [
    ['bed', '小床', 'bedroom', 'floor', 130, 70, null, 80, 12, 1],
    ['nightstand', '床头柜', 'bedroom', 'floor', 40, 45, [2, 3, 37], 35, 5, 1],
    ['wardrobe', '衣柜', 'bedroom', 'floor', 70, 120, null, 95, 10, 1],
    ['vanity', '梳妆台', 'bedroom', 'floor', 70, 80, [43, 3, 67], 85, 9, 3],
    ['sofa', '沙发', 'living', 'floor', 120, 60, null, 90, 12, 2],
    ['armchair', '扶手椅', 'living', 'floor', 55, 60, null, 55, 7, 2],
    ['coffee_table', '茶几', 'living', 'floor', 70, 35, [2, 4, 66], 45, 6, 2],
    ['rug', '地毯', 'living', 'floor', 140, 14, null, 30, 5, 1],
    ['floor_lamp', '落地灯', 'living', 'floor', 30, 100, null, 45, 6, 2],
    ['bookshelf', '故事书架', 'living', 'floor', 70, 110, [2, 5, 65], 85, 10, 1],
    ['dining_table', '餐桌', 'kitchen', 'floor', 100, 50, [2, 5, 95], 70, 8, 1],
    ['chair', '椅子', 'kitchen', 'floor', 35, 55, null, 25, 4, 1],
    ['stove', '炉灶', 'kitchen', 'floor', 60, 65, [4, 3, 57], 85, 9, 1],
    ['fridge', '冰箱', 'kitchen', 'floor', 50, 110, null, 85, 9, 3],
    ['counter', '橱柜', 'kitchen', 'floor', 80, 60, [3, 3, 77], 65, 8, 1],
    ['bathtub', '泡泡浴缸', 'bathroom', 'floor', 110, 55, null, 100, 12, 4],
    ['sink', '洗手台', 'bathroom', 'floor', 50, 70, [25, 5, 45], 60, 7, 4],
    ['piano', '钢琴', 'entertainment', 'floor', 90, 75, [37, 4, 86], 150, 14, 7],
    ['toy_box', '玩具箱', 'entertainment', 'floor', 50, 40, [2, 4, 46], 45, 6, 2],
    ['aquarium', '鱼缸', 'entertainment', 'floor', 70, 60, null, 90, 10, 4],
    ['indoor_swing', '小秋千', 'entertainment', 'ceiling', 50, 110, null, 120, 12, 2],
    ['easel', '画架', 'entertainment', 'floor', 55, 85, null, 85, 10, 7],
    ['window', '小窗与窗帘', 'wall', 'wall', 70, 70, null, 45, 7, 1],
    ['frame', '相框', 'wall', 'wall', 40, 35, null, 25, 4, 1],
    ['mirror', '穿衣镜', 'wall', 'wall', 40, 55, null, 45, 6, 3],
    ['clock', '挂钟', 'wall', 'wall', 32, 32, null, 35, 5, 2],
    ['wall_shelf', '小搁板', 'wall', 'wall', 60, 12, [0, 3, 57], 30, 5, 1],
    ['garland', '彩旗串', 'wall', 'wall', 110, 25, null, 40, 5, 2],
    ['ceiling_lamp', '吊灯', 'living', 'ceiling', 40, 50, null, 50, 7, 1],
    ['desk_lamp', '小台灯', 'small', 'table', 25, 35, null, 30, 5, 1],
    ['vase', '花瓶', 'small', 'table', 25, 35, null, 25, 5, 1],
    ['cake', '小蛋糕', 'small', 'table', 30, 27, null, 35, 6, 1],
    ['teapot', '小茶壶', 'small', 'table', 35, 32, null, 30, 5, 2],
    ['books', '睡前故事书', 'small', 'table', 32, 30, null, 25, 5, 1],
    ['plush', '软软玩偶', 'small', 'table', 30, 35, null, 40, 6, 1],
    ['candle', '香香蜡烛', 'small', 'table', 22, 35, null, 25, 4, 2],
    ['crystal_ball', '水晶球', 'small', 'table', 35, 35, null, 65, 8, 5],
    ['potted_plant', '小盆栽', 'plant', 'floor', 35, 60, null, 30, 6, 1]
  ];
  D.furnitureTemplates = rows.map(row => ({ id: row[0], template: row[0], name: row[1], category: row[2], place: row[3], w: row[4], h: row[5], surface: row[6] ? { y: row[6][0], x0: row[6][1], x1: row[6][2] } : null, price: row[7], comfort: row[8], unlockLv: row[9] }));
  D.furnitureTemplateById = Object.create(null); D.furnitureTemplates.forEach(def => { D.furnitureTemplateById[def.id] = def; });
  function append(def) { if (Object.prototype.hasOwnProperty.call(D.furnitureById, def.id)) return; D.furniture.push(def); D.furnitureById[def.id] = def; }
  const lightTemplates = ['floor_lamp', 'desk_lamp', 'ceiling_lamp', 'candle'];
  themeRows.forEach(row => {
    const theme = D.themes[row[0]];
    D.furnitureTemplates.forEach(template => {
      const id = template.id + '_' + theme.id;
      if (Object.prototype.hasOwnProperty.call(D.furnitureById, id)) return;
      const tags = [template.id]; if (template.id === 'potted_plant') tags.push('plant'); if (lightTemplates.includes(template.id)) tags.push('light');
      const rare = theme.unlockLv >= 16 && ['piano', 'vanity', 'crystal_ball', 'ceiling_lamp'].includes(template.id);
      append({ id, name: theme.prefix + template.name, template: template.id, theme: theme.id, category: template.category, place: template.place, w: template.w, h: template.h, surface: template.surface ? Object.assign({}, template.surface) : null, price: Math.round(template.price * theme.priceFactor / 5) * 5, currency: 'coin', comfort: template.comfort + (theme.unlockLv >= 11 ? 2 : theme.unlockLv >= 6 ? 1 : 0), recolor: true, tags, unlockLv: Math.max(template.unlockLv, theme.unlockLv), rarity: rare ? 'rare' : template.price >= 75 || theme.unlockLv >= 8 ? 'fine' : 'common', source: 'shop', rewardOnly: false, expanded: true });
    });
  });
  const rooms = [
    ['study', '书房', '📚', 10, 400, 'bookshelf'], ['music', '音乐室', '🎹', 13, 500, 'piano'],
    ['game', '游戏室', '🎲', 18, 600, 'toy_box'], ['pet', '宠物房', '🐾', 19, 600, 'plush'], ['workshop', '甜品工坊', '🧁', 21, 800, 'stove']
  ];
  rooms.forEach(row => { if (!D.rooms.some(room => room.id === row[0])) D.rooms.push({ id: row[0], name: row[1], icon: row[2], unlockLv: row[3], price: row[4], tags: [row[5]], required: [row[5]], comfortCap: 70 }); });
  const residents = [
    ['lily', '莉莉的胡萝卜蛋糕塔', 'strawberry', 'floor', 60, 88, 'carrot_cake', ['cake']],
    ['pudding', '布丁的蜂蜜罐灯', 'forest', 'table', 40, 50, 'honey_lamp', ['candle', 'light']],
    ['orange', '橘子的调色画框', 'garden', 'wall', 65, 55, 'palette_frame', ['frame']],
    ['mianmian', '绵绵的云朵沙发', 'cloud', 'floor', 100, 64, 'cloud_sofa', ['sofa']],
    ['bobo', '波波的贝壳浴缸', 'ocean', 'floor', 100, 60, 'shell_bath', ['bathtub']],
    ['xingxing', '星星的月光风铃', 'forest', 'ceiling', 70, 80, 'star_mobile', ['ceiling_lamp', 'light']],
    ['lizi', '栗子的橡果藏书阁', 'forest', 'floor', 65, 100, 'acorn_bookshelf', ['bookshelf']],
    ['yuanyuan', '圆圆的竹影灯笼', 'oriental', 'floor', 45, 90, 'bamboo_lantern', ['floor_lamp', 'light']],
    ['mimi', '咪露的星星猫枕', 'starry', 'floor', 65, 38, 'cat_pillow', ['plush']],
    ['doudou', '豆豆的彩虹小鼓', 'basic', 'floor', 55, 60, 'rainbow_drum', ['toy_box']],
    ['shirley', '雪莉的天鹅穿衣镜', 'princess', 'wall', 55, 78, 'swan_mirror', ['mirror']],
    ['rainbow', '彩虹的云端宝座', 'princess', 'floor', 85, 110, 'rainbow_throne', ['armchair']]
  ];
  D.residentFurniture = []; D.residentGiftById = Object.create(null);
  residents.forEach(row => {
    const id = 'resident_' + row[0] + '_gift', def = { id, name: row[1], template: 'resident_gift', theme: row[2], category: 'special', place: row[3], w: row[4], h: row[5], motif: row[6], tags: ['resident_gift'].concat(row[7]), surface: null, price: 0, currency: 'none', comfort: 15, recolor: false, unlockLv: 1, rarity: 'limited', source: 'friendship', residentId: row[0], rewardOnly: true };
    append(def); D.residentFurniture.push(def); D.residentGiftById[row[0]] = id;
  });
  const achievements = [
    ['builder', '云朵迷你屋', 'basic', 'floor', 70, 85, 'mini_house', ['house']],
    ['collector', '珍藏玻璃柜', 'ocean', 'floor', 70, 100, 'glass_cabinet', ['wardrobe']],
    ['friend', '好朋友爱心树', 'forest', 'floor', 65, 90, 'heart_tree', ['plant']],
    ['baker', '奶油旋转蛋糕台', 'strawberry', 'table', 60, 75, 'cake_carousel', ['cake']],
    ['gardener', '小雏菊洒水壶', 'garden', 'table', 40, 38, 'watering_can', ['vase']],
    ['gamer', '闪闪星光奖杯', 'starry', 'table', 40, 55, 'star_trophy', ['trophy']],
    ['fashion', '蝴蝶结礼服模特', 'princess', 'floor', 50, 90, 'dress_stand', ['vanity']],
    ['photographer', '云朵三脚相机', 'cloud', 'floor', 55, 80, 'tripod_camera', ['camera']],
    ['rainbow', '七色回家拱门', 'princess', 'floor', 100, 85, 'rainbow_arch', ['arch']],
    ['home_master', '暖心童话壁炉', 'oriental', 'floor', 85, 80, 'cozy_fireplace', ['counter', 'light']]
  ];
  D.achievementFurniture = []; D.achievementGiftById = Object.create(null);
  achievements.forEach(row => {
    const id = 'achievement_' + row[0], def = { id, name: row[1], template: 'achievement', theme: row[2], category: 'special', place: row[3], w: row[4], h: row[5], motif: row[6], tags: ['achievement'].concat(row[7]), surface: row[0] === 'collector' ? { y: 5, x0: 5, x1: 65 } : row[0] === 'home_master' ? { y: 14, x0: 5, x1: 80 } : null, price: 0, currency: 'none', comfort: 15, recolor: false, unlockLv: 1, rarity: 'limited', source: 'achievement', achievementId: row[0], rewardOnly: true };
    append(def); D.achievementFurniture.push(def); D.achievementGiftById[row[0]] = id;
  });
  D.furnitureExpansion = { templateCount: D.furnitureTemplates.length, themeCount: themeRows.length, regularCount: D.furnitureTemplates.length * themeRows.length, residentCount: residents.length, achievementCount: achievements.length };
})(window.Game);
