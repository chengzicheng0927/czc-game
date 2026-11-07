/* 整套风格是可混搭的配方；存档仍以真实部件、拥有权与颜色为准。 */
(function (G) {
  'use strict';
  const base = { roof: 'roof_triangle', wall: 'wall_wood', window: 'win_square', door: 'door_wood', chimney: 'normal' };
  const styles = [
    { id: 'strawberry_cream', name: '草莓奶油', icon: '🍓', description: '草莓粉屋顶，配一圈软软奶油墙。', exterior: { roofColor: '#F29DB4', wallColor: '#FFF0D5' } },
    { id: 'sea_salt', name: '海盐蓝', icon: '🐚', description: '浅蓝屋顶与海盐白墙，留一片清爽的天空。', exterior: { roofColor: '#9FCBD9', wallColor: '#F3F2DE', chimney: 'none' } },
    { id: 'peach_honey', name: '蜜桃蜂蜜', icon: '🍑', description: '蜜桃色的瓦片，像阳光照着蜂蜜小屋。', exterior: { roofColor: '#F0B78E', wallColor: '#FFF0C9' } },
    { id: 'mint_cloud', name: '薄荷云朵', icon: '☁️', description: '蓬蓬云顶、清风竹墙和圆圆小窗。', exterior: { roof: 'roof_cloud', wall: 'wall_bamboo', window: 'win_round', door: 'door_arch', chimney: 'none', roofColor: '#B3D8C5', wallColor: '#E4EFCC' } },
    { id: 'forest_cookie', name: '森林饼干', icon: '🍄', description: '蘑菇屋顶盖住饼干墙，圆门通向森林。', exterior: { roof: 'roof_mushroom', wall: 'wall_cookie', window: 'win_round', door: 'door_round', roofColor: '#CDA486', wallColor: '#F1D6AA' } },
    { id: 'blueberry_night', name: '蓝莓星夜', icon: '🌙', description: '星星穹顶和彩绘窗，收好一夜蓝莓色的梦。', exterior: { roof: 'roof_starry', wall: 'wall_starry', window: 'win_stained', door: 'door_moon', chimney: 'none', roofColor: '#A7AED5', wallColor: '#D8D8ED' } }
  ];
  const byId = Object.create(null);
  styles.forEach(style => { style.exterior = Object.assign({}, base, style.exterior); byId[style.id] = style; });
  G.data.houseStyles = styles;
  G.data.houseStyleById = byId;
})(window.Game);
