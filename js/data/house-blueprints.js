/* 整栋房型保存米制墙段与真实开口；等级和费用始终引用旧屋顶目录。 */
(function (G) {
  'use strict';
  const point = (x, z) => ({ x, z });
  function floorPlan(width, depth, corner, columns, layout, entrance) {
    const x = width / 2, z = depth / 2;
    const polygon = corner ? [point(-x + corner, -z), point(x - corner, -z), point(x, -z + corner), point(x, z - corner), point(x - corner, z), point(-x + corner, z), point(-x, z - corner), point(-x, -z + corner)] : [point(-x, -z), point(x, -z), point(x, z), point(-x, z)];
    const walls = polygon.map((start, index) => ({ start, end: polygon[(index + 1) % polygon.length] }));
    const sides = corner ? { back: 0, right: 2, front: 4, left: 6 } : { back: 0, right: 1, front: 2, left: 3 };
    const openings = [], centers = Array.from({ length: columns }, (_, index) => -x + width * (index + .5) / columns);
    function opening(wall, kind, center, size) {
      const segment = walls[wall], length = Math.hypot(segment.end.x - segment.start.x, segment.end.z - segment.start.z), width = size || (kind === 'door' ? .9 : .88);
      openings.push({ wall, kind, offset: center - width / 2, width, height: kind === 'door' ? 1.9 : 1, sill: kind === 'door' ? 0 : .85 });
      if (center - width / 2 < 0 || center + width / 2 > length) throw new Error('房型门窗必须位于实际墙段内。');
    }
    function partition(start, end, centers) {
      const index = walls.length; walls.push({ start, end });
      (centers || [Math.hypot(end.x - start.x, end.z - start.z) / 2]).forEach(center => opening(index, 'door', center));
    }
    if (layout === 'castle') {
      // 前主房留出居中的大门，隔墙错开，门洞不会跨在房间交点上。
      partition(point(-x, 0), point(x, 0), [x - 2.5, x + 2]);
      partition(point(0, -z), point(0, 0)); partition(point(-1, 0), point(-1, z));
    } else if (layout === 'horizontal') {
      partition(point(-x, 0), point(x, 0));
    } else {
      for (let index = 1; index < columns; index++) {
        const cut = -x + width * index / columns; partition(point(cut, -z), point(cut, z));
      }
    }
    const backWindows = layout === 'horizontal' ? [0] : centers;
    const frontWindows = layout === 'castle' ? [-width * .29, width * .29] : layout === 'horizontal' ? [x / 2] : centers.filter(center => !entrance || Math.abs(center) > .8);
    backWindows.forEach(center => opening(sides.back, 'window', center + x - corner));
    frontWindows.forEach(center => opening(sides.front, 'window', x - corner - center));
    if (entrance) opening(sides.front, 'door', x - corner);
    const sideOffset = layout === 'castle' ? z * .45 : (z - corner) / 2;
    const sideCenters = layout === 'columns' ? [0] : [-sideOffset, sideOffset];
    sideCenters.forEach(center => {
      opening(sides.right, 'window', z - corner + center);
      opening(sides.left, 'window', z - corner - center);
    });
    return { elevation: 0, walls, openings };
  }
  function blueprint(id, name, description, roofId, roofColor, wallColor, width, depth, corner, columns, layout, floors) {
    return { id, name, description, roofId, roofColor, wallColor, roomCount: (layout === 'castle' ? 4 : columns) * floors,
      floors: Array.from({ length: floors }, (_, index) => Object.assign(floorPlan(width, depth, corner, columns, layout, index === 0), { name: index ? '二楼' : '一楼', elevation: index * 2.65 })) };
  }
  const definitions = [
    blueprint('starter', '奶油小屋', '两间暖暖的小房间，从第一盏灯开始布置自己的家。', 'roof_triangle', '#F4A8BA', '#FFF0D5', 5.2, 5.2, 0, 2, 'horizontal', 1),
    blueprint('mushroom', '蘑菇小屋', '圆润的斜角围出两间森林小屋，留给朋友和新的收藏。', 'roof_mushroom', '#EBA5A2', '#FFF0D5', 6.4, 4.8, .9, 2, 'horizontal', 1),
    blueprint('cloud', '云朵小屋', '三间相通的小房间，像云朵一样把好心情连起来。', 'roof_cloud', '#B9DCEB', '#FFF2DB', 7.2, 5.4, .65, 3, 'columns', 1),
    blueprint('castle', '糖果城堡', '四间相通的房间围成小小城堡，每扇窗都等着新的故事。', 'roof_castle', '#F3A9C8', '#FFF0CF', 7.2, 5.6, 0, 2, 'castle', 1),
    blueprint('star_castle', '星光城堡', '上下两层、六间小屋，把朋友们的心愿装进星光城堡。', 'roof_starry', '#BBB0E5', '#FFF0DE', 7.8, 5.4, 0, 3, 'columns', 2)
  ];
  function freeze(value) { if (value && typeof value === 'object') { Object.keys(value).forEach(key => freeze(value[key])); Object.freeze(value); } return value; }
  const byId = Object.create(null); definitions.forEach(definition => { byId[definition.id] = definition; });
  G.data.houseBlueprints = freeze(definitions); G.data.houseBlueprintById = freeze(byId);
})(window.Game);
