/* 八本成就小册，每本五阶；奖励仅由规则层领取，图鉴内容不直接发奖。 */
(function (G) {
  'use strict';
  const D = G.data;
  D.achievementCategories = [
    { id: 'builder', name: '建造家', icon: '🏡', description: '让越来越多的房间亮起灯。', metric: 'roomCount', unit: '间房间', targets: [1, 3, 6, 9, 12], titles: ['第一扇小窗', '三间暖暖的房', '半座童话小屋', '九盏温柔灯光', '云上的建造家'] },
    { id: 'collector', name: '收藏家', icon: '🧺', description: '把不同的小心意装进收藏。', metric: 'collection', unit: '件不同家具', targets: [5, 15, 30, 60, 100], titles: ['口袋里的珍藏', '十五份小惊喜', '三十份小心意', '装满收藏盒', '百件云海珍藏'] },
    { id: 'friend', name: '好朋友', icon: '💌', description: '欢迎每一位小屋朋友。', metric: 'residentCount', unit: '位入住朋友', targets: [1, 3, 6, 9, 12], titles: ['第一次说你好', '三个温暖名字', '半屋子的笑声', '九张朋友名片', '一个朋友也不少'] },
    { id: 'baker', name: '小厨师', icon: '🧁', description: '认真做好每一份蛋糕订单。', metric: 'bakeryOrders', unit: '份完成的订单', targets: [1, 5, 15, 30, 50], titles: ['第一份甜甜订单', '五份奶油香', '忙碌的小围裙', '点心台的好手', '云边甜品大师'] },
    { id: 'gardener', name: '园艺师', icon: '🌱', description: '耐心等待种子变成收获。', metric: 'harvests', unit: '份花园收获', targets: [1, 5, 15, 30, 60], titles: ['第一粒种子的回信', '花篮里的五份香', '十五次小期待', '满园慢慢长大', '四季的小园丁'] },
    { id: 'gamer', name: '游戏达人', icon: '🎲', description: '每一局认真玩过的时光都算数。', metric: 'minigamePlays', unit: '局完成的游戏', targets: [1, 5, 15, 30, 50], titles: ['第一张游乐票', '五局好心情', '轻快的小玩家', '三十次小挑战', '云朵游乐达人'] },
    { id: 'fashion', name: '时尚达人', icon: '👗', description: '收藏衣服，慢慢找到喜欢的搭配。', metric: 'outfitsOwned', unit: '件已拥有服饰', targets: [6, 12, 20, 35, 50], titles: ['衣橱添新衣', '十二份穿搭灵感', '换季的小衣橱', '缤纷搭配盒', '小屋穿搭收藏家'] },
    { id: 'photographer', name: '摄影师', icon: '📷', description: '把值得记住的家，留在照片里。', metric: 'photos', unit: '张拍摄照片', targets: [1, 3, 5, 8, 12], titles: ['按下第一次快门', '三张家的模样', '五帧温暖日常', '八页小屋光影', '满本喜欢的回忆'] }
  ];
  const coins = [50, 80, 120, 180, 300], experience = [20, 30, 50, 70, 100];
  D.achievements = D.achievementCategories.flatMap(category => category.targets.map((target, index) => {
    const tier = index + 1, id = category.id + '_' + tier, reward = { coin: coins[index], exp: experience[index], badge: id };
    if (tier === 5) reward.itemId = D.achievementGiftById[category.id];
    if (id === 'baker_3') reward.outfitId = 'dress_daisy';
    return { id, category: category.id, tier, title: category.titles[index], description: '累计达到 ' + target + ' ' + category.unit + '。', metric: category.metric, target, reward };
  }));
  D.milestoneRewards = [
    { id: 'rainbow', title: '七色都回家啦', description: '集齐七片彩虹，收下七色回家拱门。', reward: { coin: 200, exp: 100, itemId: D.achievementGiftById.rainbow, badge: 'rainbow_complete' } },
    { id: 'home_master', title: '家的每一页', description: '完成全部35条主线，收下暖心童话壁炉。', reward: { coin: 300, exp: 150, itemId: D.achievementGiftById.home_master, badge: 'home_master' } }
  ];
  D.dailyChestReward = { coin: 80, exp: 30, heart: 5 };
})(window.Game);
