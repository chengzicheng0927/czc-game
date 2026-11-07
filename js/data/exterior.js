/* 保留原31款外观，新增免费奶油玩具墙；拥有权与装备分开保存。 */
(function (G) {
  'use strict';
  const rows = {
    roof: [
      ['roof_triangle', '三角糖霜顶', 0, 'coin', 1], ['roof_round', '圆弧软糖顶', 60, 'coin', 1], ['roof_castle', '城堡尖尖顶', 25, 'heart', 8], ['roof_mushroom', '蘑菇小圆顶', 110, 'coin', 3], ['roof_strawberry', '草莓甜心顶', 35, 'heart', 10], ['roof_cloud', '云朵蓬蓬顶', 140, 'coin', 5], ['roof_oriental', '东方飞檐顶', 180, 'coin', 7], ['roof_starry', '星空小穹顶', 45, 'heart', 12]
    ],
    wall: [
      ['wall_wood', '暖暖木板墙', 0, 'coin', 1], ['wall_toy', '奶油玩具墙', 0, 'coin', 1], ['wall_brick', '团圆小砖墙', 65, 'coin', 1], ['wall_stone', '圆石小屋墙', 100, 'coin', 3], ['wall_icing', '奶油糖霜墙', 25, 'heart', 6], ['wall_cookie', '香甜饼干墙', 120, 'coin', 4], ['wall_shell', '海风贝壳墙', 30, 'heart', 8], ['wall_bamboo', '清风竹子墙', 150, 'coin', 5], ['wall_starry', '星河许愿墙', 40, 'heart', 10]
    ],
    window: [
      ['win_square', '方方小窗', 0, 'coin', 1], ['win_arch', '圆拱小窗', 50, 'coin', 1], ['win_round', '圆圆小窗', 70, 'coin', 2], ['win_heart', '心形小窗', 20, 'heart', 5], ['win_lace', '花边小窗', 95, 'coin', 4], ['win_stained', '彩绘玻璃窗', 30, 'heart', 8]
    ],
    door: [
      ['door_wood', '暖木小门', 0, 'coin', 1], ['door_arch', '软软圆拱门', 55, 'coin', 2], ['door_round', '森林圆圆门', 85, 'coin', 3], ['door_castle', '城堡小门', 22, 'heart', 6], ['door_cake', '奶油蛋糕门', 25, 'heart', 7], ['door_moon', '月亮小门', 30, 'heart', 10]
    ],
    chimney: [['normal', '暖暖小烟囱', 0, 'coin', 1], ['none', '清爽无烟囱', 0, 'coin', 1], ['heart', '爱心烟囱', 18, 'heart', 4]]
  };
  const catalog = Object.create(null), byId = Object.create(null), defaults = { roof: 'roof_triangle', wall: 'wall_wood', window: 'win_square', door: 'door_wood', chimney: 'normal', roofColor: '#FF9FB5', wallColor: '#FFE3C9' };
  Object.keys(rows).forEach(category => {
    catalog[category] = rows[category].map(row => ({ id: row[0], name: row[1], price: row[2], currency: row[3], unlockLv: row[4], category }));
    catalog[category].forEach(def => { byId[def.id] = def; });
  });
  const defaultOwned = () => ({ roof_triangle: true, wall_wood: true, wall_toy: true, win_square: true, door_wood: true, normal: true, none: true });
  const record = value => !!value && Object.prototype.toString.call(value) === '[object Object]';
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  function defaultExterior() { return Object.assign({}, defaults, { owned: defaultOwned() }); }
  function normalizeExterior(raw) {
    if (!record(raw)) return raw;
    const result = Object.assign(defaultExterior(), raw);
    if (!own(raw, 'owned')) result.owned = defaultOwned();
    else if (record(raw.owned)) result.owned = Object.assign(defaultOwned(), raw.owned);
    return result;
  }
  function validateExterior(raw) {
    if (!record(raw) || !record(raw.owned) || typeof raw.roofColor !== 'string' || typeof raw.wallColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(raw.roofColor) || !/^#[0-9a-f]{6}$/i.test(raw.wallColor)) return false;
    if (Object.keys(raw).some(key => !own(defaults, key) && key !== 'owned')) return false;
    if (Object.keys(raw.owned).some(id => !own(byId, id) || typeof raw.owned[id] !== 'boolean')) return false;
    if (Object.keys(defaultOwned()).some(id => raw.owned[id] !== true)) return false;
    return Object.keys(catalog).every(category => typeof raw[category] === 'string' && own(byId, raw[category]) && byId[raw[category]].category === category && raw.owned[raw[category]] === true);
  }
  G.data.exteriorCatalog = catalog; G.data.exteriorById = byId; G.data.defaultExterior = defaultExterior; G.data.normalizeExterior = normalizeExterior; G.data.validateExterior = validateExterior;
})(window.Game);
