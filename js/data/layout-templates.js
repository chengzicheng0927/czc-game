/* 布局模板只排列现有房间；稳定ID与格子顺序可供将来小屋展示复用。 */
(function (G) {
  'use strict';
  G.data.layoutTemplates = [
    { id: 'together_rows', name: '相伴横排', icon: '🏡', description: '从一楼开始，一排排住在一起。', pattern: 'rows' },
    { id: 'cloud_steps', name: '云朵阶梯', icon: '☁️', description: '先向上搭一列，再铺开两边的小房间。', pattern: 'steps' },
    { id: 'little_tower', name: '竖排小塔', icon: '🌷', description: '从左边向上长，像一座软软的小塔。', pattern: 'columns' },
    { id: 'mirror_rows', name: '镜像横排', icon: '🪞', description: '从右边开始，换一个方向看小屋。', pattern: 'mirror' }
  ];
})(window.Game);
