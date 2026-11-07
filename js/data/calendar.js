/* 来源：香港天文台官方公曆與農曆日期對照表，2026-10-27逐年核对2025—2035。
 * 本机 Intl 中国历在2027/2030春节与官方表存在一天差异，以官方表为准。
 * https://www.hko.gov.hk/en/gts/time/calendar/text/files/T2027e.txt
 * https://www.hko.gov.hk/en/gts/time/calendar/text/files/T2030e.txt
 * 运行时仅查本地表，不发出网络请求。
 */
(function (G) {
  'use strict';
  const D = G.data;
  D.lunarFestivalDates = {
    2025: { spring_festival: '2025-01-29', mid_autumn: '2025-10-06' },
    2026: { spring_festival: '2026-02-17', mid_autumn: '2026-09-25' },
    2027: { spring_festival: '2027-02-06', mid_autumn: '2027-09-15' },
    2028: { spring_festival: '2028-01-26', mid_autumn: '2028-10-03' },
    2029: { spring_festival: '2029-02-13', mid_autumn: '2029-09-22' },
    2030: { spring_festival: '2030-02-03', mid_autumn: '2030-09-12' },
    2031: { spring_festival: '2031-01-23', mid_autumn: '2031-10-01' },
    2032: { spring_festival: '2032-02-11', mid_autumn: '2032-09-19' },
    2033: { spring_festival: '2033-01-31', mid_autumn: '2033-09-08' },
    2034: { spring_festival: '2034-02-19', mid_autumn: '2034-09-27' },
    2035: { spring_festival: '2035-02-08', mid_autumn: '2035-09-16' }
  };
  D.lunarFestivalSources = {};
  Object.keys(D.lunarFestivalDates).forEach(year => { D.lunarFestivalSources[year] = 'https://www.hko.gov.hk/en/gts/time/calendar/text/files/T' + year + 'e.txt'; });
  D.weatherNames = { clear: '晴天', cloudy: '多云', rain: '小雨', snow: '飘雪', sakura: '樱花飘落', leaves: '落叶纷飞' };
  D.weatherWeights = {
    spring: { clear: 40, cloudy: 22, rain: 20, sakura: 18 },
    summer: { clear: 55, cloudy: 20, rain: 25 },
    autumn: { clear: 42, cloudy: 20, rain: 18, leaves: 20 },
    winter: { clear: 38, cloudy: 27, rain: 10, snow: 25 }
  };
  D.festivals = [
    { id: 'spring_festival', name: '春节', icon: '🧧', type: 'lunar', before: 7, after: 7, greeting: '新年好呀！愿你的小屋装满团圆与甜甜的好心情。' },
    { id: 'valentines', name: '情人节', icon: '💗', type: 'solar', monthDay: '02-14', greeting: '喜欢你的小小心意，今天也想认真告诉你。把温柔送给身边的朋友吧！' },
    { id: 'children_day', name: '儿童节', icon: '🎈', type: 'solar', monthDay: '06-01', greeting: '儿童节快乐！愿你的奇思妙想，永远比云朵还轻盈。朋友们也带来了一点心意。' },
    { id: 'mid_autumn', name: '中秋节', icon: '🥮', type: 'lunar', greeting: '月亮圆圆的，像朋友围坐的小桌子。愿每次回家，都有人等着和你分享甜蜜。' },
    { id: 'halloween', name: '万圣节', icon: '🎃', type: 'solar', monthDay: '10-31', before: 7, after: 7, greeting: '南瓜灯亮起来啦！这里只有可爱的小幽灵，和等你来分的糖果。' },
    { id: 'christmas', name: '圣诞节', icon: '🎄', type: 'solar', monthDay: '12-25', before: 5, after: 1, greeting: '把心愿挂在树梢吧。愿这个冬天，有暖暖的灯光，也有软软的拥抱。' },
    { id: 'player_birthday', name: '你的生日', icon: '🎂', type: 'player', greeting: '生日快乐，小设计师！朋友们送来生日小曲和祝福，愿你每天都住在喜欢里。' },
    { id: 'resident_birthday', name: '居民生日', icon: '🎉', type: 'resident', greeting: '今天有朋友过生日！给它一个祝福，送出的心意会变成双倍的温暖。' }
  ];
  D.festivalById = {};
  D.festivals.forEach(festival => { D.festivalById[festival.id] = festival; festival.itemIds = []; });
  const furniture = [
    ['spring_festival', 'lantern', '团圆小灯笼', 'ceiling', 45, 70, 80],
    ['spring_festival', 'couplets', '甜甜小春联', 'wall', 70, 90, 60],
    ['spring_festival', 'fu', '圆圆福字', 'wall', 45, 45, 45],
    ['spring_festival', 'red_envelope', '心意红包挂饰', 'wall', 30, 40, 40],
    ['valentines', 'heart_balloon', '爱心气球', 'floor', 55, 100, 65],
    ['valentines', 'rose_bouquet', '温柔玫瑰花束', 'table', 35, 50, 75],
    ['children_day', 'color_balloons', '彩色小气球', 'floor', 60, 105, 80],
    ['children_day', 'carousel', '云朵旋转木马', 'table', 60, 55, 120],
    ['mid_autumn', 'rabbit_lantern', '月光兔子灯', 'floor', 55, 60, 100],
    ['mid_autumn', 'mooncake_box', '团圆月饼盒', 'table', 55, 30, 90],
    ['halloween', 'pumpkin_lantern', '微笑南瓜灯', 'floor', 55, 48, 80],
    ['halloween', 'friendly_ghost', '软软小幽灵', 'ceiling', 45, 70, 65],
    ['christmas', 'christmas_tree', '心愿圣诞树', 'floor', 90, 135, 160],
    ['christmas', 'stocking', '暖暖圣诞袜', 'wall', 40, 55, 60],
    ['christmas', 'snowman', '围巾小雪人', 'floor', 65, 90, 120],
    ['player_birthday', 'birthday_cake', '生日愿望蛋糕', 'table', 55, 50, 100],
    ['player_birthday', 'birthday_crown', '闪闪生日皇冠', 'table', 40, 32, 80],
    ['resident_birthday', 'birthday_hat', '朋友的生日帽', 'table', 35, 40, 55]
  ];
  D.festivalFurniture = furniture.map(row => ({ id: 'festival_' + row[1], name: row[2], festivalId: row[0], motif: row[1], template: 'festival', theme: 'basic', category: 'special', place: row[3], w: row[4], h: row[5], surface: null, price: row[6], currency: 'coin', comfort: 8, recolor: false, tags: ['festival', row[1]].concat(['lantern', 'rabbit_lantern', 'pumpkin_lantern', 'christmas_tree', 'birthday_cake'].includes(row[1]) ? ['light'] : []), unlockLv: 1, rarity: 'limited' }));
  D.festivalFurniture.forEach(def => { D.furniture.push(def); D.furnitureById[def.id] = def; D.festivalById[def.festivalId].itemIds.push(def.id); });
})(window.Game);
