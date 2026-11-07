/* 阁楼不占普通房间格；小屋星座是绘本中的想象星群。 */
(function (G) {
  'use strict';
  const D = G.data;
  D.observatoryConfig = { unlockLv: 17, price: 1000, dailyFragments: 3, maxFragments: 999999999, maxObservations: 333333333 };
  // 阁楼布置独立于普通房型；固定望远镜不作为库存家具。
  D.observatoryAtticConfig = {
    roomId: 'attic:observatory',
    wallpaper: { pattern: 'stars', color: '#EDDDE7', color2: '#FFF8FB' },
    floor: { pattern: 'wood', color: '#EED7B9' },
    light: 'star'
  };
  D.constellations = [
    { id: 'marshmallow_rabbit', name: '棉花糖兔座', story: '长长的耳朵接住了一朵云。今晚，软软的梦也想来小屋做客。', points: [[.24,.56],[.32,.31],[.36,.13],[.43,.33],[.53,.17],[.55,.44],[.7,.54],[.64,.72],[.4,.75],[.24,.56]] },
    { id: 'sugar_swan', name: '糖霜天鹅座', story: '一只天鹅把星光撒在翅膀上，悄悄替云海铺了一条回家的路。', points: [[.16,.56],[.37,.48],[.53,.63],[.73,.58],[.81,.44],[.72,.32],[.62,.37],[.67,.5],[.53,.63],[.45,.78]] },
    { id: 'sleeping_cat', name: '呼噜小猫座', story: '两颗小星星变成猫耳朵。它在月亮旁打了个滚，又睡着了。', points: [[.25,.58],[.28,.22],[.44,.39],[.6,.35],[.76,.19],[.75,.62],[.59,.76],[.41,.75],[.25,.58]] },
    { id: 'little_whale', name: '云海鲸鱼座', story: '小鲸鱼游过安静的银河。它喷出的小水花，像一颗颗甜甜的糖。', points: [[.16,.53],[.28,.35],[.53,.28],[.69,.43],[.81,.35],[.78,.56],[.84,.72],[.66,.66],[.48,.76],[.28,.71],[.16,.53]] },
    { id: 'honey_bear', name: '蜂蜜小熊座', story: '小熊把蜂蜜罐藏在星星后面，留给明天来玩的好朋友。', points: [[.28,.3],[.31,.16],[.43,.23],[.58,.23],[.69,.15],[.73,.3],[.64,.46],[.69,.71],[.53,.8],[.35,.73],[.36,.47],[.28,.3]] },
    { id: 'rainbow_deer', name: '彩虹小鹿座', story: '小鹿用弯弯的角托起星河。等清晨到了，它会把光送进你的窗。', points: [[.2,.2],[.34,.38],[.35,.14],[.44,.46],[.59,.45],[.69,.14],[.67,.39],[.81,.21],[.67,.59],[.57,.76],[.42,.74],[.32,.58],[.44,.46]] }
  ];
  D.constellationById = Object.create(null);
  D.constellations.forEach(def => { D.constellationById[def.id] = def; });
  D.constellationForDate = date => {
    let seed = 2166136261;
    for (const char of String(date)) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
    return D.constellations[seed % D.constellations.length];
  };
})(window.Game);
