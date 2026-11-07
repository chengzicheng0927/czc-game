/* 五章成长清单。旧任务按ID保留；章节与奖励由规则层解释，数据不写存档。 */
(function (G) {
  'use strict';
  const D = G.data, previous = new Map(D.mainQuests.map(quest => [quest.id, quest]));
  const oldMilestones = [
    { id: 'first_resident_wish', title: '把心愿装进口袋', description: '帮朋友实现 1 个每日心愿。', metric: 'wishesDone', target: 1, reward: { coin: 100, exp: 60 } },
    { id: 'woolly_friend', title: '云朵一样的拥抱', description: '建好衣帽间，邀请绵绵入住。', metric: 'resident_mianmian', target: 1, reward: { coin: 120, exp: 70 } },
    { id: 'thirty_little_things', title: '三十份小心意', description: '收集 30 件不同的家具，为海边音乐会添一点灵感。', metric: 'collection', target: 30, reward: { coin: 150, exp: 80 } },
    { id: 'ocean_friend', title: '海风吹进小屋', description: '准备浴室和浴缸，邀请波波入住。', metric: 'resident_bobo', target: 1, reward: { coin: 150, exp: 80 } },
    { id: 'song_in_the_forest', title: '森林传来一首歌', description: '建好音乐室，邀请小鹿星星入住。', metric: 'resident_xingxing', target: 1, reward: { coin: 150, exp: 90 } },
    { id: 'acorn_collector', title: '橡果里的珍藏', description: '收集 60 件家具，邀请栗子入住。', metric: 'resident_lizi', target: 1, reward: { coin: 180, exp: 100 } },
    { id: 'bamboo_friend', title: '竹影里的慢时光', description: '准备三件东方主题家具，邀请圆圆入住，找回青色彩虹。', metric: 'resident_yuanyuan', target: 1, reward: { coin: 180, exp: 100 } }
  ];
  oldMilestones.forEach(quest => previous.set(quest.id, quest));
  const keep = (id, chapter, extra) => Object.assign({}, previous.get(id), { chapter }, extra || {});
  const add = (id, chapter, title, description, metric, target, coin, exp, action, extra) => Object.assign({ id, chapter, title, description, metric, target, reward: { coin, exp }, action }, extra || {});
  const condition = (metric, target, label) => ({ metric, target, label });
  D.mainQuests = [
    keep('name_home', 1, { action: { panel: 'rename' } }),
    keep('first_bedroom', 1, { action: { panel: 'build', roomType: 'bedroom' } }),
    keep('first_bed', 1, { action: { panel: 'decor', itemId: 'bed_basic' } }),
    keep('welcome_lily', 1, { action: { panel: 'residents', residentId: 'lily' } }),
    keep('first_cake', 1, { metric: 'bakeryPlays', description: '先建好厨房，再完成一局甜甜蛋糕屋。', action: { panel: 'play', gameId: 'bakery' } }),
    keep('first_kitchen', 1, { action: { panel: 'build', roomType: 'kitchen' } }),
    keep('three_star', 1, { action: { panel: 'decor' } }),
    keep('new_wallpaper', 1, { action: { panel: 'decor', tab: 'wallpaper' } }),

    keep('forest_friend', 2, { action: { panel: 'residents', residentId: 'pudding' } }),
    keep('art_friend', 2, { action: { panel: 'residents', residentId: 'orange' } }),
    add('garden_morning', 2, '楼上与花园的早安', '解锁第 2 层小屋，并收获 3 份花园作物。', 'harvests', 3, 100, 60, { panel: 'garden' }, { conditions: [condition('floors', 2, '小屋楼层'), condition('harvests', 3, '收获作物')] }),
    keep('first_resident_wish', 2, { action: { panel: 'residents' } }),
    keep('woolly_friend', 2, { action: { panel: 'residents', residentId: 'mianmian' } }),
    keep('thirty_little_things', 2, { action: { panel: 'shop' } }),

    keep('ocean_friend', 3, { action: { panel: 'residents', residentId: 'bobo' } }),
    add('music_room_ready', 3, '留一间房给旋律', '建造一间音乐室，给即将到来的音乐会留一个位置。', 'room_music', 1, 120, 70, { panel: 'build', roomType: 'music' }),
    keep('song_in_the_forest', 3, { action: { panel: 'residents', residentId: 'xingxing' } }),
    add('ocean_stage', 3, '把海风摆进小屋', '在小屋里摆好 3 件海洋之心主题家具。', 'theme_ocean', 3, 120, 80, { panel: 'shop', theme: 'ocean' }),
    keep('acorn_collector', 3, { action: { panel: 'residents', residentId: 'lizi' } }),
    add('friendship_first_song', 3, '一首歌的距离', '让任意一位朋友的好感达到 100。', 'maxAffection', 100, 120, 80, { panel: 'residents' }),
    add('island_concert', 3, '海边的音乐会', '准备音乐室和海洋家具，和波波、星星一起完整举办一场小合奏，迎接绿色彩虹。', 'concerts', 1, 150, 100, { panel: 'concert' }, { rainbow: 'green', conditions: [condition('room_music', 1, '音乐室'), condition('resident_bobo', 1, '波波已入住'), condition('resident_xingxing', 1, '星星已入住'), condition('theme_ocean', 3, '海洋主题家具'), condition('concerts', 1, '小合奏已谢幕')] }),

    keep('bamboo_friend', 4, { rainbow: 'cyan', action: { panel: 'residents', residentId: 'yuanyuan' } }),
    add('third_floor_lights', 4, '第三层也亮着灯', '让小屋达到 3 层，留出更多温暖的窗。', 'floors', 3, 150, 90, { panel: 'build' }),
    add('starlight_corner', 4, '星光落在书页上', '准备一间书房，并摆好 3 件星空主题家具。', 'theme_starry', 3, 150, 90, { panel: 'shop', theme: 'starry' }, { conditions: [condition('room_study', 1, '书房'), condition('theme_starry', 3, '星空主题家具')] }),
    add('cat_under_stars', 4, '月亮旁的猫咪', '准备星空卧室，邀请咪露入住。', 'resident_mimi', 1, 150, 100, { panel: 'residents', residentId: 'mimi' }),
    add('shy_rainbow_friend', 4, '轻轻敲门的小彩虹', '和害羞的独角兽彩虹成为小屋邻居。', 'resident_rainbow', 1, 180, 100, { panel: 'residents', residentId: 'rainbow' }),
    add('wishes_like_stars', 4, '把小心愿连成星座', '累计帮朋友实现 5 个每日心愿。', 'wishesDone', 5, 150, 100, { panel: 'residents' }),
    add('twilight_photo', 4, '把星光收进照片', '欢迎彩虹入住后，为小屋拍一张照片，找回蓝色彩虹。', 'photos', 1, 180, 100, { panel: 'photo' }, { rainbow: 'blue', conditions: [condition('resident_rainbow', 1, '彩虹已入住'), condition('photos', 1, '小屋照片')] }),

    add('party_letter', 5, '写给大家的邀请函', '小屋达到 Lv.24，一起开始准备彩虹派对。', 'level', 24, 150, 100, { panel: 'play' }),
    add('final_floor_ready', 5, '四层楼的暖暖灯光', '让小屋达到 4 层，给朋友们留出团聚的空间。', 'floors', 4, 180, 110, { panel: 'build' }),
    add('cozy_party_room', 5, '布置团聚的小客厅', '准备一间客厅，并累计收集 80 件不同的家具。', 'room_living', 1, 180, 110, { panel: 'build', roomType: 'living' }, { conditions: [condition('room_living', 1, '客厅'), condition('collection', 80, '不同家具收藏')] }),
    add('all_seats_reserved', 5, '每张邀请函都有回音', '邀请全部 12 位朋友入住，让派对的座位都有人等。', 'residentCount', 12, 200, 120, { panel: 'residents' }),
    add('party_little_baker', 5, '点心准备好啦', '累计完成 10 份甜甜蛋糕屋订单，为派对添上香气。', 'bakeryOrders', 10, 180, 110, { panel: 'play', gameId: 'bakery' }),
    add('party_seven_colors', 5, '把六种颜色放在一起', '找回前 6 片彩虹，并为小屋累计拍下 3 张照片。', 'rainbowCount', 6, 200, 120, { panel: 'photo' }, { conditions: [condition('rainbowCount', 6, '彩虹碎片'), condition('photos', 3, '小屋照片')] }),
    add('rainbow_party', 5, '彩虹回来了', '12 位朋友在客厅团聚，找回最后的紫色彩虹，开启彩虹派对。', 'residentCount', 12, 250, 150, { panel: 'residents' }, { rainbow: 'purple', ending: true, conditions: [condition('residentCount', 12, '已入住朋友'), condition('room_living', 1, '客厅'), condition('rainbowCount', 6, '彩虹碎片')] })
  ];

  D.storyChapters = [
    { id: 1, title: '新家的第一块砖', description: '从一间卧室开始，让云海上的第一盏灯亮起来。', levelRange: [1, 5], colors: ['red'], story: [
      { speaker: 'nuomi', text: '欢迎来到棉花糖岛，小小设计师。我是糯米，想和你一起把这座小屋变成家。' },
      { speaker: 'nuomi', text: '彩虹暴风把七种颜色吹散了。每完成一件温暖的小事，颜色就会慢慢找到回家的路。' },
      { speaker: 'lily', text: '我带着一本故事书来啦。如果有一张软软的床，我想把最后一页留给你一起读。' },
      { speaker: 'nuomi', text: '先给家起个名字，再放下第一块砖吧。每一步，我们都一起慢慢来。' }
    ], completionStory: [
      { speaker: 'lily', text: '小床、厨房，还有窗边的光……这里已经有家的味道啦。' },
      { speaker: 'nuomi', text: '看，红色彩虹轻轻落下来了！它说，温暖的第一块砖就在这里。' },
      { speaker: 'nuomi', text: '森林那边传来了脚步声，新的朋友正在路上。' }
    ] },
    { id: 2, title: '森林来的客人', description: '楼上的窗、花园的种子和新朋友，一起为小屋添上森林的颜色。', levelRange: [6, 10], colors: ['orange', 'yellow'], story: [
      { speaker: 'pudding', text: '你好，小设计师。我闻到了木头和花朵的香气，像森林里的一场好梦。' },
      { speaker: 'orange', text: '我的画笔准备好啦！想把小屋的每一扇窗，都画成一个暖暖的故事。' },
      { speaker: 'mianmian', text: '我会慢慢织一条围巾。等种子长大的时候，想和大家一起坐着聊聊天。' },
      { speaker: 'nuomi', text: '让楼上的窗亮起来，种下小花，也帮朋友完成一份小心愿吧。森林会把颜色送给用心的人。' }
    ], completionStory: [
      { speaker: 'orange', text: '橙色像云边的晚霞，黄色像厨房里的小灯。我把它们好好记在画里。' },
      { speaker: 'pudding', text: '花园也长大了一点，朋友们想做的事，都有地方慢慢开始啦。' },
      { speaker: 'nuomi', text: '我们带上收藏的小心意，去听听海风送来的旋律。' }
    ] },
    { id: 3, title: '海边的音乐会', description: '让海洋与森林的旋律，在小屋里遇见。', levelRange: [11, 16], colors: ['green'], story: [
      { speaker: 'bobo', text: '扑通！海风把我送来啦。我想在小屋里，留下一点点海浪的声音。' },
      { speaker: 'xingxing', text: '森林的风教会了我哼小曲。如果有一间音乐室，我想为朋友们唱一首轻轻的歌。' },
      { speaker: 'lizi', text: '我会把音乐会的邀请函收进小盒子，这也是一件值得珍藏的宝贝。' },
      { speaker: 'nuomi', text: '准备房间、摆好喜欢的家具，再慢慢靠近一位朋友。我们的小小音乐会，就从这份陪伴开始。' }
    ], completionStory: [
      { speaker: 'xingxing', text: '叮——第一颗音符落下来了。谢谢大家，让这首歌有了可以停靠的地方。' },
      { speaker: 'bobo', text: '我听见海浪也在轻轻拍手，大家一起唱的时候，心里暖暖的！' },
      { speaker: 'nuomi', text: '绿色彩虹随着旋律回来了。原来不同的声音，也能唱成同一首家的歌。' }
    ] },
    { id: 4, title: '星空下的愿望', description: '把窗边的星光与朋友的小心愿，一颗一颗收进回忆。', levelRange: [17, 23], colors: ['cyan', 'blue'], story: [
      { speaker: 'yuanyuan', text: '竹叶的影子慢慢晃着。我想留在这里，和大家过不着急的日子。' },
      { speaker: 'mimi', text: '我只是来看看这扇星光小窗……如果能在旁边读故事，我也可以留下。' },
      { speaker: 'rainbow', text: '你、你好，我是彩虹。我的小角还会害羞地闪一下，可以和你慢慢熟悉吗？' },
      { speaker: 'nuomi', text: '给星光留一角书页，给心愿留一份耐心。等大家站在一起时，也拍一张小屋的照片吧。' }
    ], completionStory: [
      { speaker: 'rainbow', text: '原来我的光，可以和大家的光放在一起。现在，我也想试着跳一小步。' },
      { speaker: 'mimi', text: '照片里每一扇亮着的窗，都有人在等朋友回来。我会把它放在喜欢的书旁边。' },
      { speaker: 'nuomi', text: '青色与蓝色也回到云海了。还差最后一种颜色，我们一起准备团聚吧。' }
    ] },
    { id: 5, title: '彩虹回来了', description: '写好邀请函，让每一位朋友都来参加彩虹派对。', levelRange: [24, 30], colors: ['purple'], story: [
      { speaker: 'doudou', text: '一二、一二！我会认真把邀请函送到每个房间，再和大家一起布置客厅。' },
      { speaker: 'shirley', text: '每一次舞步都先站稳。等朋友们到齐，我想把最轻盈的一步送给小屋。' },
      { speaker: 'lily', text: '我会准备故事，你来准备甜甜的点心，好吗？每张椅子旁边，都要留一个朋友的位置。' },
      { speaker: 'nuomi', text: '十二份心意，六片颜色，还有一间温暖的客厅。最后的紫色，会在团聚的时候找到我们。' }
    ], completionStory: [
      { speaker: 'rainbow', text: '这一次，我想和大家一起站在光里。谢谢你们，邀请害羞的我来到这个家。' },
      { speaker: 'nuomi', text: '七种颜色都回来啦！让我们一起跳起来，为每一份小小的陪伴，开一场彩虹派对。' },
      { speaker: 'lily', text: '明天也一起住在喜欢里。我的故事书，还有很多页想和你一起读。' }
    ] }
  ];
  D.storyChapters.forEach(chapter => { chapter.questIds = D.mainQuests.filter(quest => quest.chapter === chapter.id).map(quest => quest.id); });
  D.rainbowFragments = [
    { id: 'red', name: '红色', color: '#EC9BAB' }, { id: 'orange', name: '橙色', color: '#F0B080' },
    { id: 'yellow', name: '黄色', color: '#F2D889' }, { id: 'green', name: '绿色', color: '#ACCC9F' },
    { id: 'cyan', name: '青色', color: '#9BCDCB' }, { id: 'blue', name: '蓝色', color: '#A5C3E3' },
    { id: 'purple', name: '紫色', color: '#C4A9DC' }
  ];
  D.rainbowEnding = { title: '彩虹回来了', partyQuestId: 'rainbow_party', closing: '每一扇亮着的窗，都在说：欢迎回家。', story: [
    { speaker: 'nuomi', text: '七种颜色连成了一道彩虹。你为小屋放下的每一块砖，都接住了一份温暖。' },
    { speaker: 'xingxing', text: '森林的风、海边的浪，现在都在同一首歌里。朋友们，我们一起跳起来吧。' },
    { speaker: 'rainbow', text: '我找到可以放心发光的地方啦。今天的舞步，我想和每一位朋友分享。' },
    { speaker: 'lily', text: '小屋还有好多明天，等着我们一起种花、聊天、读故事。' },
    { speaker: 'nuomi', text: '彩虹会一直挂在岛上。明天，也一起住在喜欢里。' }
  ] };
})(window.Game);
