(function (Game) {
  'use strict';
  var data = Game.data;
  data.themes = {
    basic: { id: 'basic', name: '简约日常', icon: '🌿', palette: ['#E8C39E', '#FFF8EB', '#A87960'], motif: 'none', unlockLv: 1 },
    strawberry: { id: 'strawberry', name: '草莓甜品', icon: '🍓', palette: ['#FFB6C8', '#FFF1C1', '#E58BA7'], motif: 'strawberry', unlockLv: 1 },
    forest: { id: 'forest', name: '森林小屋', icon: '🍄', palette: ['#B9C88E', '#E8C39E', '#77935F'], motif: 'leaf', unlockLv: 6 }
  };
  data.rooms = [
    { id: 'bedroom', name: '卧室', icon: '🛏️', unlockLv: 1, price: 100, tags: ['bed'], required: ['bed'], comfortCap: 65 },
    { id: 'kitchen', name: '厨房', icon: '🍳', unlockLv: 1, price: 150, tags: ['stove'], required: ['stove'], comfortCap: 60 },
    { id: 'living', name: '客厅', icon: '🛋️', unlockLv: 2, price: 200, tags: ['sofa'], required: ['sofa'], comfortCap: 70 },
    { id: 'bathroom', name: '浴室', icon: '🛁', unlockLv: 4, price: 250, tags: ['bathtub'], required: ['bathtub'], comfortCap: 60 },
    { id: 'dining', name: '餐厅', icon: '🍽️', unlockLv: 5, price: 300, tags: ['dining_table'], required: ['dining_table'], comfortCap: 60 },
    { id: 'studio', name: '画室', icon: '🎨', unlockLv: 7, price: 350, tags: ['easel'], required: ['easel'], comfortCap: 60 },
    { id: 'wardrobe', name: '衣帽间', icon: '👗', unlockLv: 9, price: 400, tags: ['wardrobe'], required: ['wardrobe'], comfortCap: 60 },
    { id: 'greenhouse', name: '温室花房', icon: '🌿', unlockLv: 14, price: 500, tags: ['plant'], required: ['potted_plant'], comfortCap: 60 }
  ];
  // 模板参数负责内容；渲染器根据 template 和 theme 自行绘制。
  var templates = [
    ['bed', '小床', 'bedroom', 'floor', 130, 70, null, 80, 12],
    ['nightstand', '床头柜', 'bedroom', 'floor', 40, 45, { y: 2, x0: 3, x1: 37 }, 35, 5],
    ['wardrobe', '衣柜', 'bedroom', 'floor', 70, 120, null, 95, 10],
    ['sofa', '沙发', 'living', 'floor', 120, 60, null, 90, 12],
    ['coffee_table', '茶几', 'living', 'floor', 70, 35, { y: 2, x0: 4, x1: 66 }, 45, 6],
    ['rug', '地毯', 'living', 'floor', 140, 14, null, 30, 5],
    ['floor_lamp', '落地灯', 'living', 'floor', 30, 100, null, 45, 6],
    ['dining_table', '餐桌', 'kitchen', 'floor', 100, 50, { y: 2, x0: 5, x1: 95 }, 70, 8],
    ['chair', '椅子', 'kitchen', 'floor', 35, 55, null, 25, 4],
    ['stove', '炉灶', 'kitchen', 'floor', 60, 65, { y: 4, x0: 3, x1: 57 }, 85, 9],
    ['counter', '橱柜', 'kitchen', 'floor', 80, 60, { y: 3, x0: 3, x1: 77 }, 65, 8],
    ['window', '小窗', 'wall', 'wall', 70, 70, null, 45, 7],
    ['frame', '相框', 'wall', 'wall', 40, 35, null, 25, 4],
    ['ceiling_lamp', '吊灯', 'living', 'ceiling', 40, 50, null, 50, 7],
    ['desk_lamp', '台灯', 'small', 'table', 25, 35, null, 30, 5],
    ['vase', '花瓶', 'small', 'table', 25, 35, null, 25, 5]
  ];
  var furniture = [];
  ['basic', 'strawberry'].forEach(function (theme) {
    templates.forEach(function (t) {
      furniture.push({ id: t[0] + '_' + theme, name: (theme === 'basic' ? '原木' : '草莓') + t[1], template: t[0], theme: theme,
        category: t[2], place: t[3], w: t[4], h: t[5], surface: t[6], price: t[7], currency: 'coin', comfort: t[8],
        recolor: true, tags: [t[0]], unlockLv: 1, rarity: t[7] >= 80 ? 'fine' : 'common' });
    });
  });
  [
    ['bathtub_basic', '泡泡浴缸', 'bathtub', 'basic', 'bathroom', 'floor', 110, 55, null, 100, 12, 4],
    ['bookshelf_basic', '故事书架', 'bookshelf', 'basic', 'living', 'floor', 70, 110, { y: 2, x0: 5, x1: 65 }, 85, 10, 1],
    ['plush_strawberry', '软软兔玩偶', 'plush', 'strawberry', 'small', 'table', 30, 35, null, 40, 6, 1],
    ['cake_strawberry', '草莓小蛋糕', 'cake', 'strawberry', 'small', 'table', 30, 27, null, 35, 6, 1],
    ['wall_shelf_basic', '墙上小搁板', 'wall_shelf', 'basic', 'wall', 'wall', 60, 12, { y: 0, x0: 3, x1: 57 }, 30, 5, 1],
    ['indoor_swing_strawberry', '奶油秋千', 'indoor_swing', 'strawberry', 'entertainment', 'ceiling', 50, 110, null, 120, 12, 2],
    ['potted_plant_basic', '绿叶盆栽', 'potted_plant', 'basic', 'plant', 'floor', 35, 60, null, 30, 6, 1],
    ['easel_basic', '彩虹画架', 'easel', 'basic', 'entertainment', 'floor', 55, 85, null, 85, 10, 7],
    ['bed_forest', '苔绿小床', 'bed', 'forest', 'bedroom', 'floor', 130, 70, null, 120, 14, 6],
    ['nightstand_forest', '蘑菇床头柜', 'nightstand', 'forest', 'bedroom', 'floor', 40, 45, { y: 2, x0: 3, x1: 37 }, 55, 8, 6],
    ['potted_plant_forest', '森林小盆栽', 'potted_plant', 'forest', 'plant', 'floor', 35, 60, null, 45, 8, 6]
  ].forEach(function (t) { furniture.push({ id: t[0], name: t[1], template: t[2], theme: t[3], category: t[4], place: t[5], w: t[6], h: t[7], surface: t[8], price: t[9], comfort: t[10], unlockLv: t[11], currency: 'coin', recolor: true, tags: [t[2]], rarity: 'fine' }); });
  data.furniture = furniture;
  data.furnitureById = Object.create(null);
  furniture.forEach(function (item) { data.furnitureById[item.id] = item; });
  data.starterItems = { bed_basic: 1, nightstand_basic: 1, desk_lamp_basic: 1 };
  data.residents = [
    { id: 'lily', name: '莉莉', animal: '小兔', icon: '🐰', color: '#FFE5EC', accent: '#F6A7BE', favoriteColor: '#FFB6C8', favoriteTheme: 'strawberry', favoriteCrops: ['carrot'], unlockLv: 1, birthday: '03-14', requirement: '卧室里有一张床', intro: '我是莉莉！可以和你一起住在这朵云上吗？',
      chats: ['这张小床看起来像一朵云。', '早安，小设计师！今天也一起创造吧。', '窗外的云朵像胡萝卜蛋糕呢。', '我最喜欢粉粉的小台灯。', '和你一起住，心里暖暖的。', '刚才有一只蝴蝶经过窗前。', '我想给糯米留一块蛋糕。', '你挑选的家具都很可爱。', '不用着急，慢慢装扮就很好。', '睡前听一个故事吧。', '今天的小屋又漂亮了一点。'], emotions: ['有点害羞，但很想和你做朋友。', '哇！开心得耳朵都竖起来啦。', '呼……想躺在云朵床上做甜甜的梦。'] },
    { id: 'pudding', name: '布丁', animal: '小熊', icon: '🐻', color: '#DDB58E', accent: '#A67C58', favoriteColor: '#FFF1C1', favoriteTheme: 'forest', unlockLv: 6, birthday: '09-09', requirement: 'Lv.6，卧室有 3 件森林家具', intro: '你好，我是布丁。我带来了一点森林的香气！',
      chats: ['这里闻起来像温暖的蜂蜜。', '森林里，松果会咔嗒咔嗒地落下。', '一起慢慢喝杯茶吧。', '绿色的小家具让我想起家。', '我可以帮你搬东西！', '每一件小事都值得庆祝。', '今天的阳光刚刚好。', '我的蜂蜜罐总为朋友留一口。', '你说，云朵会不会是棉花糖做的？', '这张床好舒服，我想伸个懒腰。', '谢谢你为我准备小房间。'], emotions: ['嘿嘿，我还有一点点不好意思。', '抱抱！今天真是好日子。', '我想在蜂蜜色的梦里休息一会儿。'] },
    { id: 'orange', name: '橘子', animal: '小狐狸', icon: '🦊', color: '#ECAA72', accent: '#D38656', favoriteColor: '#FFD3B0', favoriteTheme: 'garden', unlockLv: 7, birthday: '10-18', requirement: 'Lv.7，小屋有一间画室', intro: '我是橘子！我想把这座小屋画成最漂亮的画。',
      chats: ['云海今天是淡淡的蓝色。', '我想给你的房间画一幅画。', '把喜欢的颜色放在一起，就是好作品。', '画错了也可以变成一朵小花。', '我给布丁画了一罐蜂蜜。', '橙色像傍晚的太阳。', '你的创意给了我好多灵感。', '一起找找窗外有多少种颜色吧。', '小屋的每个角落都有故事。', '我的画笔准备好了！', '今天要画你开心的样子。'], emotions: ['尾巴有点紧张地晃来晃去。', '灵感像星星一样冒出来啦！', '晚安，我去梦里找新的颜色。'] }
  ];
  data.mainQuests = [
    { id: 'name_home', title: '云上的名字', description: '给小屋起一个喜欢的名字。', metric: 'named', target: 1, reward: { coin: 30, exp: 50 } },
    { id: 'first_bedroom', title: '第一块温暖的砖', description: '建造一间卧室，第一间免费。', metric: 'bedroom', target: 1, reward: { coin: 40, exp: 50 } },
    { id: 'first_bed', title: '甜梦准备好啦', description: '在卧室里摆一张小床。', metric: 'bed', target: 1, reward: { coin: 40, exp: 50 } },
    { id: 'welcome_lily', title: '欢迎新朋友', description: '邀请兔兔莉莉入住。', metric: 'lily', target: 1, reward: { coin: 60, exp: 60 } },
    { id: 'first_cake', title: '一口甜甜的幸福', description: '完成一局甜甜蛋糕屋。', metric: 'minigamePlays', target: 1, reward: { coin: 60, exp: 60 } },
    { id: 'first_kitchen', title: '香香的小厨房', description: '建造一间厨房。', metric: 'kitchen', target: 1, reward: { coin: 80, exp: 60 } },
    { id: 'three_star', title: '闪亮的小卧室', description: '把一间卧室装扮到 3 颗星。', metric: 'bedroomStars', target: 3, reward: { coin: 80, exp: 80 } },
    { id: 'new_wallpaper', title: '彩虹的第一种颜色', description: '为房间换一次墙纸，找回红色彩虹碎片。', metric: 'wallpaperChanges', target: 1, reward: { coin: 100, exp: 100 }, rainbow: 'red' },
    { id: 'forest_friend', title: '森林来的小客人', description: '准备森林卧室，邀请布丁入住。', metric: 'pudding', target: 1, reward: { coin: 150, exp: 100 }, rainbow: 'orange' },
    { id: 'art_friend', title: '把云海画下来', description: '建造画室，邀请橘子入住。', metric: 'orange', target: 1, reward: { coin: 150, exp: 100 }, rainbow: 'yellow' }
  ];
  data.dailyQuests = [
    { id: 'daily_place', title: '布置小能手', description: '今天摆放 3 件家具。', metric: 'itemsPlaced', target: 3, reward: { coin: 40, exp: 15 }, action: { panel: 'decor' } },
    { id: 'daily_play', title: '快乐小厨师', description: '今天玩 2 局小游戏。', metric: 'minigamePlays', target: 2, reward: { coin: 40, exp: 15 }, action: { panel: 'play' } },
    { id: 'daily_pat', title: '温暖的摸摸头', description: '今天摸摸居民 3 次。', metric: 'pats', target: 3, reward: { coin: 40, exp: 15 }, action: { panel: 'residents' } },
    { id: 'daily_harvest', title: '花园小帮手', description: '今天收获 3 份花园作物。', metric: 'harvests', target: 3, reward: { coin: 40, exp: 15 }, action: { panel: 'garden' } }
  ];
  // 日期决定任务轮换，同一天刷新或导入不会重新抽取任务。
  data.dailyQuestsForDate = function (date) {
    var digits = String(date || '').replace(/\D/g, ''), offset = (Number(digits) || 0) % data.dailyQuests.length;
    return [0, 1, 2].map(function (index) { return data.dailyQuests[(offset + index) % data.dailyQuests.length]; });
  };
  data.messages = {
    invalid: '这份存档的结构不完整，原来的进度没有改变。', future: '这是较新版本的存档，请用对应版本的小屋打开。',
    noRoom: '先选一间房间吧。', noItem: '背包里还没有这件家具。', locked: '再升一点等级就能解锁啦。',
    saved: '已保存在这台设备', saving: '正在保存…', unavailable: '自动保存暂不可用，请导出存档备份', corrupt: '发现损坏存档，已保留原文备份',
    imported: '存档恢复好啦，欢迎回家！', giftEmpty: '先去蛋糕屋做一份小蛋糕吧。', duplicateResident: '这位朋友已经入住啦。'
  };
})(window.Game);
(function (Game) {
  'use strict';
  var data = Game.data, names = ['纯色', '圆点', '条纹', '格子', '小花', '爱心', '星星', '云朵', '木板', '砖块'];
  data.wallpaperPatterns = data.balance.wallpaperPatterns.map(function (id, i) { return { id: id, name: names[i] }; });
  names = ['木地板', '瓷砖', '地毯', '草地', '云朵', '大理石', '榻榻米', '星空'];
  data.floorPatterns = data.balance.floorPatterns.map(function (id, i) { return { id: id, name: names[i] }; });
  data.palette = data.balance.colors;
  data.balance.bakeryDuration = data.balance.bakery.duration;
  data.balance.bakeryRewards = data.balance.bakery.starCoins.map(function (coin, i) { return { coin: coin, exp: data.balance.bakery.starExp[i] }; });
  data.balance.fullRewardPlays = data.balance.bakery.fullPlays;
})(window.Game);
