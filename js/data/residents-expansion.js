/* 十二位朋友的故事、入住条件与心愿；每日抽取和奖励由居民规则层处理。 */
(function (G) {
  'use strict';
  const D = G.data, originals = Object.fromEntries(D.residents.map(resident => [resident.id, resident]));
  const profiles = [
    {
      id: 'lily', name: '莉莉', animal: '小兔', species: 'rabbit', personality: '温柔', icon: '🐰', color: '#FFE5EC', accent: '#F6A7BE', favoriteColor: '#FFB6C8', favoriteTheme: 'strawberry', favoriteCrops: ['carrot'], favoriteItem: '胡萝卜蛋糕', unlockLv: 1, birthday: '03-14', requirement: '卧室里有一张床',
      admission: { unlockLv: 1, roomType: 'bedroom', requiredTags: ['bed'] },
      intro: '我是莉莉！可以和你一起住在这朵云上吗？', birthdayText: '今天我的耳朵也戴上了生日蝴蝶结。能和你在小屋里过生日，是最软乎乎的礼物！',
      chats: ['这张小床看起来像一朵云。', '早安，小设计师！今天也一起创造吧。', '窗外的云朵像胡萝卜蛋糕呢。', '我最喜欢粉粉的小台灯。', '和你一起住，心里暖暖的。', '刚才有一只蝴蝶经过窗前。', '我想给糯米留一块蛋糕。', '你挑选的家具都很可爱。', '不用着急，慢慢装扮就很好。', '睡前听一个故事吧。', '今天的小屋又漂亮了一点。'],
      emotions: ['有点害羞，但很想和你做朋友。', '哇！开心得耳朵都竖起来啦。', '呼……想躺在云朵床上做甜甜的梦。'],
      furniture: ['desk_lamp_strawberry', 'plush_strawberry'], flower: 'daisy', outfit: 'dress_pink', outfitGift: 'acc_bunny', games: ['memory', 'bakery'],
      wishesText: ['想在床头摆一盏草莓台灯，晚安就有颜色了。', '软软兔玩偶能坐在我的床边陪我听故事吗？', '卧室里有三件草莓家具，就像住进小蛋糕。', '今天想和你分享一块草莓小蛋糕。', '可以送我一朵小雏菊吗？想把花香留在床边。', '一起翻开记忆卡片吧，我会认真记住每位朋友。', '你穿上草莓奶油裙时，像春天里的一朵花。', '想请你去蛋糕屋做一局，回来讲讲香甜的订单。'],
      secret: '我把最喜欢的故事留到了最后一页，因为想和你一起读。', storyTitle: '留给你的那一页', story: ['莉莉抱来一本折了小角的故事书。', '“这一页讲的是，两位朋友把空空的房子变成了家。”', '她把书轻轻推到你面前：“我想和你一起写下一页。”']
    },
    {
      id: 'pudding', name: '布丁', animal: '小熊', species: 'bear', personality: '憨厚', icon: '🐻', color: '#DDB58E', accent: '#A67C58', favoriteColor: '#FFF1C1', favoriteTheme: 'forest', favoriteCrops: ['pumpkin', 'sunflower'], favoriteItem: '蜂蜜罐', unlockLv: 6, birthday: '09-09', requirement: 'Lv.6，卧室有 3 件森林家具',
      admission: { unlockLv: 6, roomType: 'bedroom', requiredTags: [], theme: 'forest', themeCount: 3 },
      intro: '你好，我是布丁。我带来了一点森林的香气！', birthdayText: '嘿嘿，今天的蜂蜜罐留给大家一起尝。谢谢你陪我过这个圆圆暖暖的生日。',
      chats: ['这里闻起来像温暖的蜂蜜。', '森林里，松果会咔嗒咔嗒地落下。', '一起慢慢喝杯茶吧。', '绿色的小家具让我想起家。', '我可以帮你搬东西！', '每一件小事都值得庆祝。', '今天的阳光刚刚好。', '我的蜂蜜罐总为朋友留一口。', '你说，云朵会不会是棉花糖做的？', '这张床好舒服，我想伸个懒腰。', '谢谢你为我准备小房间。'],
      emotions: ['嘿嘿，我还有一点点不好意思。', '抱抱！今天真是好日子。', '我想在蜂蜜色的梦里休息一会儿。'],
      furniture: ['teapot_forest', 'sofa_forest'], flower: 'sunflower', outfit: 'top_bear', outfitGift: 'acc_teddy', games: ['catch_stars', 'memory'],
      wishesText: ['床边要是有一把森林小茶壶，就能招待朋友啦。', '想在卧室放一张森林沙发，给来听故事的朋友坐。', '想让卧室里有三件森林家具，闻起来像松针。', '蜂蜜吃完了，今天可以换一块草莓蛋糕吗？', '送我一朵向日葵吧，像圆圆的小太阳。', '我们去接一局星星吧，我来想象它们是小松果。', '穿上小熊口袋卫衣，让我看看你的森林装扮吧。', '想玩一局翻翻乐，看看我能不能记住蜂蜜色卡片。'],
      secret: '我的小蜂蜜罐已经不只装着甜味，还装着你陪我的日子。', storyTitle: '蜂蜜罐底的小纸条', story: ['布丁从蜂蜜罐下面拿出一张干干净净的小纸条。', '上面画着小屋、松树，还有两位挨在一起的朋友。', '“蜂蜜会吃完，可这幅画我会一直留着。”']
    },
    {
      id: 'orange', name: '橘子', animal: '小狐狸', species: 'fox', personality: '爱画画', icon: '🦊', color: '#ECAA72', accent: '#D38656', favoriteColor: '#FFD3B0', favoriteTheme: 'garden', favoriteCrops: ['sunflower', 'rose'], favoriteItem: '画架', unlockLv: 7, birthday: '10-18', requirement: 'Lv.7，小屋有一间画室',
      admission: { unlockLv: 7, roomType: 'bedroom', requiredTags: [], requiredRoomTypes: ['studio'] },
      intro: '我是橘子！我想把这座小屋画成最漂亮的画。', birthdayText: '今天我想画一张特别的生日画。画上有一座暖暖的小屋，还有一直支持我画画的你。',
      chats: ['云海今天是淡淡的蓝色。', '我想给你的房间画一幅画。', '把喜欢的颜色放在一起，就是好作品。', '画错了也可以变成一朵小花。', '我给布丁画了一罐蜂蜜。', '橙色像傍晚的太阳。', '你的创意给了我好多灵感。', '一起找找窗外有多少种颜色吧。', '小屋的每个角落都有故事。', '我的画笔准备好了！', '今天要画你开心的样子。'],
      emotions: ['尾巴有点紧张地晃来晃去。', '灵感像星星一样冒出来啦！', '晚安，我去梦里找新的颜色。'],
      furniture: ['easel_basic', 'frame_basic'], wishTheme: 'garden', flower: 'sunflower', outfit: 'acc_beret', outfitGift: 'acc_beret', games: ['match3', 'memory'],
      wishesText: ['能在卧室里摆一个画架吗？醒来就能记下梦的颜色。', '给卧室添一个原木相框，等我画好小屋的肖像。', '想让卧室里有三件田园家具，画一幅花香小景。', '画到一半肚子咕噜了，想吃一块草莓蛋糕。', '可以给我一朵向日葵当今天的模特吗？', '去玩一局花园消消乐吧，帮我收集花朵配色。', '今天戴画家贝雷帽，和我一起做小画家吧。', '想和你比比翻翻乐的眼力，慢慢记也没关系。'],
      secret: '我最想画的风景，是你认真布置小屋的样子。', storyTitle: '没有画完的云', story: ['橘子在画纸上留了一块白白的云。', '“这里原来不知道画什么，现在我知道了。”', '他把画笔递给你：“这个角落，留给你最喜欢的颜色。”']
    },
    {
      id: 'mianmian', name: '绵绵', animal: '小羊', species: 'sheep', personality: '爱织毛衣', icon: '🐑', color: '#FFF3DC', accent: '#D8B9CB', favoriteColor: '#FFF1D8', favoriteTheme: 'cloud', favoriteCrops: ['daisy', 'lavender'], favoriteItem: '毛线球', unlockLv: 9, birthday: '01-20', requirement: 'Lv.9，小屋有一间衣帽间',
      admission: { unlockLv: 9, roomType: 'bedroom', requiredTags: [], requiredRoomTypes: ['wardrobe'] },
      intro: '你好呀，我是绵绵。我的毛线篮里还有一个位置，想给你织一份暖暖的礼物。', birthdayText: '生日这天，我给每位朋友织了一小段彩线。把它们连起来，就是一条装着小屋故事的围巾。',
      chats: ['一针，再一针，围巾就慢慢变长了。', '奶油白的毛线像没有落下来的小云朵。', '你想把今天的好心情织成什么颜色？', '衣帽间里有好多软软的搭配灵感。', '毛线打结时，慢慢解就会有办法。', '我想给糯米织一顶会漏出小星星的帽子。', '小屋的窗边很适合数针脚。', '这团粉毛线，是莉莉帮我挑的。', '下雨的声音像织针轻轻碰在一起。', '别怕冷，我的毛线篮一直开着。', '今天给围巾多加一条代表你的颜色。'],
      emotions: ['咩……你夸我的围巾时，耳朵都暖起来啦。', '针脚排得整整齐齐，我想给你一个软软的拥抱。', '毛线先睡进篮子里，我也要去盖小被子啦。'],
      furniture: ['wardrobe_cloud', 'books_basic'], flower: 'daisy', outfit: 'top_knit', outfitGift: 'top_knit', games: ['memory', 'match3'],
      wishesText: ['想在卧室放一座云朵衣柜，收好慢慢织的围巾。', '能给卧室摆一摞原木小书吗？我想学新的针法。', '三件云朵家具，会让我的卧室像一团棉花。', '织了半条围巾，想休息一下尝尝草莓蛋糕。', '送我一朵小雏菊吧，我想照着花瓣织图案。', '想玩一局翻翻乐，练习记住不同的针脚。', '今天穿麻花小毛衣给我看看吧，像软软的云。', '去收集一局花园花朵吧，我想挑围巾的新颜色。'],
      secret: '给你的围巾一直没织完，因为我总想再添一点温暖。', storyTitle: '一条慢慢变长的围巾', story: ['绵绵把一条长长的围巾铺到桌上。', '每种颜色旁都系着一张小纸签：搬家、种花、一起下雨天。', '“原来，我已经把我们的日子都织进去了。”']
    },
    {
      id: 'bobo', name: '波波', animal: '小企鹅', species: 'penguin', personality: '活泼', icon: '🐧', color: '#A9CDDE', accent: '#E8CB88', favoriteColor: '#BFE3FF', favoriteTheme: 'ocean', favoriteCrops: ['blueberry', 'strawberry'], favoriteItem: '鱼缸', unlockLv: 11, birthday: '07-07', requirement: 'Lv.11，小屋有浴室和浴缸',
      admission: { unlockLv: 11, roomType: 'bedroom', requiredTags: [], requiredRoomTypes: ['bathroom'], requiredHouseTags: ['bathtub'] },
      intro: '扑通！我是波波，没有真的跳进来啦。可以在这座小屋里安放我的海洋小梦想吗？', birthdayText: '生日快乐的泡泡，啵啵啵！今天想把每一颗想象中的海星，都送给陪我玩的你。',
      chats: ['我的脚步啪嗒啪嗒，像小小的海浪。', '浴缸里的一点水，也能装下大海的想象。', '云海里会不会也藏着会发光的小鱼？', '你见过蓝莓色的晚霞吗？', '我想在窗边看鱼儿慢慢游。', '水手领结打好了，今天准备去哪儿探险？', '下雨啦，是云朵在练习游泳吗？', '我和豆豆约好一起做伸展运动。', '海边的贝壳，每一片都有不同的纹路。', '我走得摇摇摆摆，但很会给朋友让路。', '把大海放进故事里，就能在小屋里去旅行。'],
      emotions: ['领结有点歪，我才没有紧张呢……啵。', '好想扑腾一下小翅膀！今天真有趣！', '小海浪也要休息，我想摇摇摆摆回床边。'],
      furniture: ['aquarium_ocean', 'bathtub_basic'], flower: 'tulip', outfit: 'top_sailor', outfitGift: 'top_sailor', games: ['catch_stars', 'match3'],
      wishesText: ['能在我的卧室摆一个海洋鱼缸吗？我要观察小鱼。', '在卧室里试放泡泡浴缸，想象一次海边旅行吧。', '想让卧室里有三件海洋家具，听见想象中的浪花。', '运动完想尝一口草莓蛋糕，可以分我一块吗？', '能送我一朵郁金香吗？想把它画在小船旁边。', '一起接一局星星吧，我会把篮子想象成小船。', '换上海风水手衫，今天一起当小小航海家吧。', '玩一局花园消消乐，把不同颜色的花当作贝壳收集。'],
      secret: '我收集的最好看的贝壳，想留给和我一起看云海的朋友。', storyTitle: '装着海浪的小盒子', story: ['波波捧来一只小盒子，里面躺着几片弯弯的贝壳。', '“贴近一点，你听到的是海浪，还是我们的笑声？”', '他把盒子放在窗边，留了刚好两位朋友的位置。']
    },
    {
      id: 'xingxing', name: '星星', animal: '小鹿', species: 'deer', personality: '爱唱歌', icon: '🦌', color: '#D9C39B', accent: '#B6D2BD', favoriteColor: '#BDECD6', favoriteTheme: 'forest', favoriteCrops: ['lavender', 'sunflower'], favoriteItem: '钢琴', unlockLv: 13, birthday: '05-05', requirement: 'Lv.13，小屋有一间音乐室',
      admission: { unlockLv: 13, roomType: 'bedroom', requiredTags: [], requiredRoomTypes: ['music'] },
      intro: '你好，我是星星。森林的风教会了我哼小曲，想把轻轻的旋律留在你的小屋。', birthdayText: '今天我给自己的生日愿望配了一段旋律：愿每位朋友，都能找到想一起唱歌的人。',
      chats: ['风经过鹿角时，好像会留下一小段旋律。', '音乐室的每个琴键，都在等一只轻轻的手。', '我喜欢用薄荷绿来想象清晨的音符。', '鸟叫不是考试，唱得开心就已经很好啦。', '今天想给树叶写一首慢慢的小曲。', '你摆家具的声音，也有自己的节奏。', '圆圆喝茶时敲杯沿的动作很像指挥家。', '小鹿的脚步轻一点，就不会吵醒做梦的朋友。', '雨点落下来，像一排排亮亮的琴键。', '你愿意做第一个听我新歌的朋友吗？', '休止的那一拍，也是在认真听世界。'],
      emotions: ['一想到你在听，我的耳朵就会悄悄动一下。', '今天的好心情，想唱成一整片森林。', '最后一个音符放回琴盒，我也想睡啦。'],
      furniture: ['piano_forest', 'bookshelf_forest'], flower: 'lavender', outfit: 'acc_flower', outfitGift: 'acc_flower', games: ['memory', 'catch_stars'],
      wishesText: ['想在卧室放一架森林钢琴，记录梦里的小旋律。', '能在卧室放森林书架吗？我想收好画满音符的书。', '卧室有三件森林家具，唱歌时就像站在树荫里。', '想在练完琴后，慢慢吃一块草莓蛋糕。', '送我一束薰衣草吧，我想写一首花香的小曲。', '我们玩一局翻翻乐，像记住一段轻轻的旋律。', '今天戴雏菊小发夹，给小屋添一个花朵音符吧。', '去接一局星星吧，我想把每一点光写进歌里。'],
      secret: '有一段小曲我一直没取名字，后来发现，它听起来很像你的名字。', storyTitle: '给朋友留的一拍', story: ['星星弹了一小段旋律，却在最后停住了。', '“这一拍留给你，可以是拍手，也可以是一声笑。”', '你们一起补上那一拍，小曲终于有了回家的声音。']
    },
    {
      id: 'lizi', name: '栗子', animal: '小松鼠', species: 'squirrel', personality: '爱收集', icon: '🐿️', color: '#C9A283', accent: '#E9CBA5', favoriteColor: '#B68A66', favoriteTheme: 'forest', favoriteCrops: ['pumpkin', 'blueberry'], favoriteItem: '坚果罐', unlockLv: 15, birthday: '11-11', requirement: 'Lv.15，家具图鉴收集至少 60 件',
      admission: { unlockLv: 15, roomType: 'bedroom', requiredTags: [], minCollection: 60 },
      intro: '我是栗子！我有一个收集小盒子，里面的每样东西都有故事。可以把新故事也放在这里吗？', birthdayText: '生日清单上，松果、树叶和小石子都打好勾了。最后一格写着：和朋友在一起。现在也能打勾啦！',
      chats: ['不是所有宝贝都要闪闪发光，小石头也很好看。', '我给每个松果都留了一点点位置。', '你的家具图鉴像一本会长大的故事书。', '今天捡到的叶子，边缘像小小的邮票。', '收藏盒要经常整理，才不会找不到重要的东西。', '这根缎带也许能给绵绵做书签。', '松鼠尾巴很蓬，但不能拿来当扫帚哦。', '我记得你上次把那盏灯放在了哪里。', '给别人看的时候，收藏会变成分享。', '秋天掉下来的栗子，要轻轻捧起来。', '我给小屋的每一天编了一个暖暖的编号。'],
      emotions: ['被发现藏了一颗漂亮松果，尾巴都卷起来了。', '又添了一件有故事的宝贝，想马上讲给你听！', '小盒子盖好啦，今晚去梦里整理收藏。'],
      furniture: ['bookshelf_forest', 'toy_box_forest'], flower: 'sunflower', outfit: 'acc_basket', outfitGift: 'acc_basket', games: ['memory', 'catch_stars'],
      wishesText: ['卧室放一座森林书架吧，我要给收藏贴小标签。', '想要一个森林玩具箱，在卧室收好散落的小宝贝。', '三件森林家具，就能给收藏布置一个小小展厅。', '整理完收藏盒，想请你分我一块草莓蛋糕。', '能给我一朵向日葵吗？我想把花瓣画进收藏册。', '一起玩一局翻翻乐吧，看看我记物品的本领。', '今天带小花编织篮，和我一起想象一场采集旅行。', '去接一局星星吧，我的收藏故事还缺一点星光。'],
      secret: '收藏清单里最重要的一项没有编号，是愿意听我讲故事的你。', storyTitle: '没有编号的小盒子', story: ['栗子的小柜子里，每一格都贴着编号。', '只有最中间的盒子空着，里面放了一张你们的小屋草图。', '“这不是用来收藏东西的，是用来收藏我们还没开始的故事。”']
    },
    {
      id: 'yuanyuan', name: '圆圆', animal: '小熊猫', species: 'panda', personality: '慢悠悠', icon: '🐼', color: '#F9F2DD', accent: '#8FAF9C', favoriteColor: '#A8CCA6', favoriteTheme: 'oriental', favoriteCrops: ['daisy', 'sakura'], favoriteItem: '灯笼', unlockLv: 16, birthday: '08-08', requirement: 'Lv.16，有一间摆着 3 件东方家具的房间',
      admission: { unlockLv: 16, roomType: 'bedroom', requiredTags: [], houseTheme: 'oriental', houseThemeCount: 3 },
      intro: '慢慢来，我是圆圆。竹叶的影子很好看，我想和你一起，在小屋里过不着急的日子。', birthdayText: '今天的生日愿望，也要慢慢许。第一杯茶敬小屋，第二杯敬朋友，最后一杯留给明天的好心情。',
      chats: ['竹叶摇一下，我也跟着慢慢眨一下眼睛。', '茶还热着，可以坐下来陪我一会儿吗？', '灯笼亮起来的时候，小屋像被温柔抱住了。', '慢不是停下，是把眼前的小事看得清楚一点。', '我在数窗边的光，不是在发呆。', '这个坐垫刚刚好，给你也留一个位置。', '橘子的画里有风，真想把它挂在茶桌旁。', '一片竹叶，也有深浅不同的绿色。', '今天的茶香，闻起来有一点像晴天。', '我想把急急的脚步，放回门口的小篮子。', '和朋友一起安静待着，也是一种聊天。'],
      emotions: ['你一夸我，我就慢慢地、很认真地害羞。', '嗯……今天比一杯热茶还让人开心。', '眼睛要慢慢合上啦，明天再一起看竹影。'],
      furniture: ['teapot_oriental', 'floor_lamp_oriental'], flower: 'sakura', outfit: 'dress_kimono', outfitGift: 'dress_kimono', games: ['memory', 'match3'],
      wishesText: ['想在卧室里摆一把东方茶壶，慢慢招待朋友。', '能给卧室放一盏东方落地灯吗？茶香也想暖一点。', '卧室里有三件东方家具，就能布置安静的小茶角。', '今天想用一口草莓蛋糕，配一口不烫的茶。', '送我一份樱花树苗的收获吧，我想画它的影子。', '我们慢慢玩一局翻翻乐，不用赶时间。', '今天穿樱花和风裙，陪我看看东方小茶角吧。', '去花园消消乐走一局，花朵也会慢慢排好队。'],
      secret: '我把最舒服的坐垫留在茶桌旁，因为知道你会来。', storyTitle: '茶桌旁的空位置', story: ['圆圆每天都会擦一擦茶桌旁的第二个坐垫。', '“我不是在等很重要的大事，只是在等你有空坐一会儿。”', '窗外的竹影晃了晃，茶杯里也安静地亮了一下。']
    },
    {
      id: 'mimi', name: '咪露', animal: '小猫', species: 'cat', personality: '傲娇爱睡觉', icon: '🐱', color: '#D0C4DD', accent: '#A99ABD', favoriteColor: '#D9C8FF', favoriteTheme: 'starry', favoriteCrops: ['lavender'], favoriteItem: '星星枕头', unlockLv: 18, birthday: '02-22', requirement: 'Lv.18，卧室里有 3 件星空家具',
      admission: { unlockLv: 18, roomType: 'bedroom', requiredTags: [], theme: 'starry', themeCount: 3 },
      intro: '我是咪露。先说好，我只是来看看这张床……如果你喜欢我留下，也不是不可以。', birthdayText: '今天是我的生日，你记得就好……这块蛋糕，想坐在我旁边一起吃吗？我把最软的靠垫留给你了。',
      chats: ['这张床还不错，我只是暂时多躺一会儿。', '星星枕头很软，不信你也轻轻碰一下。', '我才没有特地等你，只是刚好在这里晒太阳。', '窗帘晃的时候，像一条很会躲的小尾巴。', '薰衣草的香气，很适合放进午睡的梦。', '你摆的灯光，今天也不刺眼，挺好。', '刚才的哈欠不算，我还想听你讲一小段。', '我会把落在窗边的月光都看好。', '小猫的喜欢，有时候只是一句：你可以坐这里。', '那只玩偶的位置不能动，它看星星的角度正好。', '今晚的梦，想借一点你喜欢的颜色。'],
      emotions: ['耳朵有点热，才不是因为你夸我呢。', '嗯，今天很喜欢这里……也很喜欢你来。', '哈啊……月亮值班啦，我先去软枕头上休息。'],
      furniture: ['bed_starry', 'candle_starry'], flower: 'lavender', outfit: 'top_cape', outfitGift: 'acc_moon', games: ['memory', 'catch_stars'],
      wishesText: ['想在卧室换一张星空小床，只是为了更好地看月亮。', '床边摆一盏星空烛灯吧，我喜欢软软的光。', '卧室里有三件星空家具，今晚应该会睡得很好。', '草莓蛋糕……如果你刚好多一块，我可以尝尝。', '一份薰衣草，放在梦的门口应该很合适。', '玩一局翻翻乐给我看看，我会认真看着的。', '今天穿月亮小斗篷吧，和我的星星枕头很搭。', '去接一局星星回来，讲给我听就好，喵。'],
      secret: '我每天多留了一点靠垫的位置。不是给月亮的，是给你的。', storyTitle: '第二个靠垫', story: ['咪露把窗边的靠垫往旁边推了一点。', '“别误会，只是这个位置晒太阳更舒服。”', '你坐下以后，她的尾巴轻轻搭在两个靠垫之间。']
    },
    {
      id: 'doudou', name: '豆豆', animal: '小仓鼠', species: 'hamster', personality: '爱运动', icon: '🐹', color: '#EAC5A4', accent: '#D7A57F', favoriteColor: '#FFD3B0', favoriteTheme: 'basic', favoriteCrops: ['sunflower', 'carrot'], favoriteItem: '跑轮', unlockLv: 20, birthday: '04-01', requirement: 'Lv.20，小屋有一间游戏室',
      admission: { unlockLv: 20, roomType: 'bedroom', requiredTags: [], requiredRoomTypes: ['game'] },
      intro: '一二、一二！我是豆豆，运动完会认真喝水和休息。想和你做活力满满的小屋朋友！', birthdayText: '今天的生日比赛，项目是把祝福传给每个朋友！跑得快不重要，大家都笑起来才是冠军。',
      chats: ['运动前先伸伸小胳膊，慢慢活动一下。', '我的腮帮里没有藏哨子，是两颗小瓜子。', '跑轮会转圈，好朋友的故事会往前走。', '喝一口水，才有力气继续玩。', '今天的比赛，认真参加就算赢啦。', '波波走得摇摇摆摆，也很有自己的节奏。', '游戏室的小玩具，玩完要记得收回去。', '你布置的小路，很适合慢慢散步。', '休息不是偷懒，是给明天存一点精神。', '我做伸展时，会把尾巴也算进去。', '快乐的运动，应该能听见自己的呼吸和笑声。'],
      emotions: ['你一鼓掌，我的腮帮就有点不好意思。', '一二、一二！开心得想轻轻跳两下。', '今天的小脚步跑够啦，想睡一个结实的觉。'],
      furniture: ['toy_box_basic', 'indoor_swing_basic'], flower: 'sunflower', outfit: 'shoes_sneaker', outfitGift: 'shoes_sneaker', games: ['catch_stars', 'match3'],
      wishesText: ['给卧室放一个原木玩具箱吧，运动完收好装备。', '想在卧室试放原木秋千，坐下来做一次慢慢的休息。', '卧室摆三件简约日常家具，给伸展留一个清爽小角落。', '运动之后，想和你分一块草莓蛋糕补补精神。', '可以给我一朵向日葵吗？我想画它的瓜子队伍。', '一起接一局星星吧，小篮子也要做左右伸展。', '今天穿云朵运动鞋，和我一起做准备活动吧。', '玩一局花园消消乐，给会运动的小脑袋也热热身。'],
      secret: '我给你留了一张没有名次的小奖状，上面写着：陪朋友一起认真玩。', storyTitle: '没有名次的奖状', story: ['豆豆举着一张画满小脚印的纸。', '上面没有第一名，也没有最后一名，只有你们一起走过的路线。', '“这张奖状送给你，因为你总愿意等我喝完那一口水。”']
    },
    {
      id: 'shirley', name: '雪莉', animal: '小天鹅', species: 'swan', personality: '优雅爱芭蕾', icon: '🦢', color: '#FFF7E9', accent: '#D8BED5', favoriteColor: '#FFF5E8', favoriteTheme: 'princess', favoriteCrops: ['rose', 'sakura'], favoriteItem: '镜子', unlockLv: 22, birthday: '06-01', requirement: 'Lv.22，有一间摆着 3 件公主家具的房间',
      admission: { unlockLv: 22, roomType: 'bedroom', requiredTags: [], houseTheme: 'princess', houseThemeCount: 3 },
      intro: '你好，我是雪莉。每一次踮脚都要先站稳，想在这座小屋里，和朋友们一起练习优雅又自在的生活。', birthdayText: '生日这天，我想跳一支不追求完美的小舞。每一步都送给陪我练习、陪我笑的朋友。',
      chats: ['先站稳，再踮脚，慢慢来就很好。', '镜子不是用来挑错，是帮我看见自己的进步。', '白色羽毛里，也藏着奶油和珍珠的颜色。', '今天想把花瓣飘落的样子编成舞步。', '裙摆转起来以后，要记得给朋友留一点空间。', '我喜欢音乐开始前，大家安静期待的那一秒。', '脚尖酸了，就该好好坐下休息。', '彩虹害羞的时候，我会陪她从最小的一步开始。', '不是每支舞都要有观众，也可以只跳给自己看。', '你认真布置的房间，像一个温柔的小舞台。', '谢谢你愿意看我把同一个动作练习好多遍。'],
      emotions: ['被你认真看着时，羽毛都轻轻蓬起来了。', '这一小步站稳啦，想和你一起转一个开心的圈。', '舞鞋收好了，今晚的梦也要轻轻落地。'],
      furniture: ['mirror_princess', 'vanity_princess'], flower: 'rose', outfit: 'shoes_ballet', outfitGift: 'shoes_ballet', games: ['memory', 'match3'],
      wishesText: ['想在卧室放一面公主镜子，练习站稳的小动作。', '给卧室添一张公主梳妆台吧，舞鞋缎带也有地方收好。', '卧室里有三件公主家具，就能准备一个温柔的小舞台。', '练习结束后，可以分我一块草莓蛋糕吗？', '一份玫瑰的收获，会让今天的练习更有花香。', '想玩一局翻翻乐，像记住一段轻轻的舞步。', '今天换上缎带芭蕾鞋，陪我做一次站稳的练习吧。', '玩一局花园消消乐，帮我挑一支花瓣舞的颜色。'],
      secret: '我最喜欢的掌声，是你说“今天也比昨天稳了一点”。', storyTitle: '一支慢慢的舞', story: ['雪莉把舞鞋上的缎带重新系好，向你轻轻点头。', '她没有跳很难的动作，只把第一次学会的小舞步跳了一遍。', '“这支舞送给你，谢谢你一直陪我从这里开始。”']
    },
    {
      id: 'rainbow', name: '彩虹', animal: '独角兽', species: 'unicorn', personality: '害羞爱跳舞', icon: '🦄', color: '#F9E9EF', accent: '#C4B4D8', favoriteColor: '#FFD6E0', favoriteTheme: 'princess', favoriteCrops: ['rainbow_flower', 'star_fruit'], favoriteItem: '水晶球', unlockLv: 23, birthday: '12-25', requirement: 'Lv.23，主线到达第 4 章',
      admission: { unlockLv: 23, roomType: 'bedroom', requiredTags: [], minChapter: 4 },
      intro: '你、你好，我是彩虹。我的小角还会害羞地闪一下。可以先在小屋角落，和你做慢慢熟悉的朋友吗？', birthdayText: '今天的生日愿望，我小声说也可以吗？愿彩虹的每一种颜色，都能照到一位好朋友。你也在里面。',
      chats: ['我想跳一小步，你可以先不用鼓掌吗？', '彩虹不是只有一种好看的颜色，每一种都很重要。', '水晶球里没有答案，但能照见亮亮的窗户。', '雪莉说，先站稳再开始，我记住啦。', '我把害羞藏进鬃毛里，就能多说一句你好。', '雨后的小彩虹，像天空悄悄系上的缎带。', '你的房间里，有好多不会催我长大的颜色。', '小角闪了一下，大概是听见了温柔的话。', '我想把最轻的一朵云，编进今天的梦。', '和朋友一起跳舞时，脚步乱一点也会很好玩。', '今天终于敢先和你打招呼啦。你好，小设计师。'],
      emotions: ['小角有一点点亮……我只是有一点点开心。', '想把七种颜色都转成一个开心的小圈！', '鬃毛里的星光睡着啦，我也想靠着软枕头休息。'],
      furniture: ['crystal_ball_princess', 'garland_princess'], flower: 'rainbow_flower', outfit: 'dress_rainbow', outfitGift: 'acc_fairy', games: ['catch_stars', 'memory'],
      wishesText: ['能在卧室摆一颗公主水晶球吗？想看看窗边的光。', '卧室里添一串公主花环，就像给小舞台系一条缎带。', '三件公主家具，会让我更想试着跳一小步。', '想小声问问，可以和你分一块草莓蛋糕吗？', '能送我一份彩虹花吗？我想认真看看每一种颜色。', '去接一局星星吧，替害羞的小角带回一点勇气。', '今天穿彩虹庆典裙，陪我试着转一个小圈吧。', '想和你慢慢玩一局翻翻乐，记住每位朋友的笑脸。'],
      secret: '以前我只敢站在彩虹的背面，现在想和你一起站在有阳光的那一边。', storyTitle: '第一步的颜色', story: ['彩虹站到小屋中间，把小蹄子向前放了一点。', '她转了一个很小、很慢的圈，鬃毛里的颜色也跟着轻轻晃动。', '“原来第一步不用很勇敢，只要旁边有愿意等我的朋友。”']
    }
  ];
  function wishPool(profile) {
    const id = profile.id, texts = profile.wishesText;
    return [
      { id: id + '_furniture_first', type: 'furniture', target: 1, itemId: profile.furniture[0], text: texts[0] },
      { id: id + '_furniture_second', type: 'furniture', target: 1, itemId: profile.furniture[1], text: texts[1] },
      { id: id + '_theme_corner', type: 'theme', target: 3, theme: profile.wishTheme || profile.favoriteTheme, text: texts[2] },
      { id: id + '_cake_break', type: 'food', target: 1, itemId: 'cake_strawberry', text: texts[3] },
      { id: id + '_garden_gift', type: 'flower', target: 1, cropId: profile.flower, text: texts[4] },
      { id: id + '_play_together', type: 'activity', target: 1, gameId: profile.games[0], text: texts[5] },
      { id: id + '_new_look', type: 'outfit', target: 1, outfitId: profile.outfit, text: texts[6] },
      { id: id + '_little_adventure', type: 'activity', target: 1, gameId: profile.games[1], text: texts[7] }
    ];
  }
  const portraitHeights = { lily: 112, pudding: 94, orange: 94, mianmian: 108, bobo: 98, xingxing: 130, lizi: 112, yuanyuan: 102, mimi: 110, doudou: 100, shirley: 118, rainbow: 132 };
  const portraitWidths = { lily: 75, pudding: 75, orange: 100, mianmian: 88, bobo: 88, xingxing: 92, lizi: 132, yuanyuan: 90, mimi: 100, doudou: 90, shirley: 90, rainbow: 118 };
  D.residents = profiles.map(profile => {
    const resident = Object.assign({}, profile, originals[profile.id] || {});
    // 旧三位的基础外观、主题、门槛、介绍与台词保持兼容，新内容统一补上。
    resident.species = profile.species; resident.personality = profile.personality; resident.favoriteItem = profile.favoriteItem; resident.favoriteCrops = profile.favoriteCrops;
    resident.admission = profile.admission; resident.birthdayText = profile.birthdayText;
    resident.portraitHeight = portraitHeights[profile.id]; resident.portraitWidth = portraitWidths[profile.id];
    resident.appearance = { species: profile.species, body: resident.color, accent: resident.accent, muzzle: '#FFF3DF', eyes: '#795F67', earStyle: profile.species, tailStyle: profile.species, accessory: profile.outfitGift, height: resident.portraitHeight, width: resident.portraitWidth };
    resident.wishes = wishPool(profile);
    resident.friendshipRewards = [
      { level: 1, threshold: 0, kind: 'dialogue', text: profile.secret },
      { level: 2, threshold: 100, kind: 'outfit', outfitId: profile.outfitGift, text: '给你一份带着' + profile.name + '心意的穿搭小礼物。' },
      { level: 3, threshold: 300, kind: 'furniture', itemId: 'resident_' + profile.id + '_gift', text: profile.name + '把最喜欢的小物送给了你。' },
      { level: 4, threshold: 600, kind: 'story', title: profile.storyTitle, text: profile.story.join('\n'), lines: profile.story.slice() },
      { level: 5, threshold: 1000, kind: 'badge', itemId: 'frame_basic', badgeId: 'best_friend_' + profile.id, text: '最好的朋友 · ' + profile.name + '。这个相框，留给以后一起拍的照片。' }
    ];
    ['furniture', 'wishTheme', 'flower', 'outfit', 'outfitGift', 'games', 'wishesText', 'secret', 'storyTitle', 'story'].forEach(key => { delete resident[key]; });
    return resident;
  });
  D.residentById = Object.fromEntries(D.residents.map(resident => [resident.id, resident]));
})(window.Game);
