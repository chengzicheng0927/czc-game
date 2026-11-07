/* 游乐场内容与数值；局内临时状态不写入存档。 */
(function () {
  'use strict';
  const G = window.Game;
  G.data.minigames = [
    { id: 'bakery', name: '甜甜蛋糕屋', icon: '🎂', description: '记住朋友的订单，一层层做好香甜蛋糕。', requirement: '先建一间厨房', unlockLv: 1, patienceSeconds: 20, layeredPatienceSeconds: 25, customerChangeSeconds: .9 },
    { id: 'match3', name: '花园消消乐', icon: '🌼', description: '交换相邻花朵，25步收集花香。四连有蝴蝶，五连有彩虹花！', unlockLv: 1, size: 7, colors: 6, moves: 25, starScores: [600, 1400] },
    { id: 'catch_stars', name: '星星接接乐', icon: '⭐', description: '左右移动小篮子，在75秒里接住星星、糖果和彩虹。', unlockLv: 1, duration: 75, starScores: [500, 1000], doubleSeconds: 5, wetSeconds: 2 },
    { id: 'memory', name: '记忆翻翻乐', icon: '☁', description: '翻开棉花糖卡片，帮小屋里的朋友与家具找到一对。', unlockLv: 1, difficulties: [{ id: 'easy', name: '软绵绵 · 4 × 3', columns: 4, rows: 3 }, { id: 'normal', name: '甜蜜蜜 · 4 × 4', columns: 4, rows: 4 }, { id: 'hard', name: '亮晶晶 · 5 × 4', columns: 5, rows: 4 }] }
  ];
  G.data.minigameRewards = { coin: [30, 60, 100], exp: [10, 20, 30], fullPlays: 5 };
  G.data.minigameFlowers = [
    { name: '草莓粉花', color: '#F29AB7', center: '#FFE2AA' },
    { name: '天空蓝花', color: '#93CAE9', center: '#FFF1C1' },
    { name: '薄荷绿花', color: '#81C7A7', center: '#FFF0AD' },
    { name: '香芋紫花', color: '#B7A0DF', center: '#FFE7BB' },
    { name: '蜜桃橙花', color: '#F0B381', center: '#FFF2B0' },
    { name: '奶油黄花', color: '#E5CA69', center: '#F8E6BC' }
  ];
})();
