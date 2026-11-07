/* 功能页中央软陶展示台：只描述真实角色与CPU几何，挂载/相机/输入由World3D负责。 */
(function (G) {
  'use strict';
  const C = { paper: '#FFF5E4', cream: '#FFF9EF', wood: '#C49B78', edge: '#AD7B62', berry: '#A64261', rose: '#DE9FB1', blush: '#F0CCD4', brass: '#D4AD72', leaf: '#A7B89E', glass: '#C4D9DC' };
  const lookKeys = ['skin', 'hair', 'hairColor', 'face', 'top', 'bottom', 'dress', 'shoes'];
  const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const color = (value, fallback) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') { const result = {}; Object.keys(value).sort().forEach(key => { result[key] = canonical(value[key]); }); return result; }
    return value;
  }
  function keyFor(surface, value) { return 'page-stage-v1:' + surface + ':' + JSON.stringify(canonical(value)); }
  function appearance(raw) {
    const look = {}; lookKeys.forEach(key => { look[key] = raw[key]; }); look.acc = Array.isArray(raw.acc) ? raw.acc.slice() : []; return look;
  }
  function appearanceDefinitions(look) {
    const D = G.data || {}, ids = [look.top, look.bottom, look.dress, look.shoes].concat(look.acc).filter(id => typeof id === 'string');
    return { skin: D.avatarSkins?.find(row => row.id === look.skin) || null, hair: D.avatarHairStyles?.find(row => row.id === look.hair) || null, face: D.avatarFaces?.find(row => row.id === look.face) || null, outfits: ids.map(id => D.outfitById?.[id] || null) };
  }
  // 木台、奶油纸面与展示圆台是取景陈设，不作为家具或衣物写入背包。
  function platform(g) {
    g.sphere([0, -.4, 0], [3.34, .24, 3.2], C.cream, 32, 8);
    g.cylinder([0, -.2, 0], 3.44, .34, C.wood, 3.55, 48);
    g.cylinder([0, .015, 0], 3.55, .13, C.paper, 3.52, 48);
    g.cylinder([0, .19, .44], 1.72, .22, C.rose, 1.69, 40);
    g.cylinder([0, .32, .44], 1.63, .08, C.cream, 1.63, 40);
  }
  function planter(g, x, z, petal) {
    g.cylinder([x, .28, z], .24, .4, C.blush, .32, 16);
    g.cylinder([x, .5, z], .33, .075, C.cream, .33, 18);
    for (const side of [-1, 1]) {
      g.cylinder([x + side * .09, .71, z], .022, .42, C.leaf, .022, 8, [0, 0, side * .21]);
      g.sphere([x + side * .15, .67, z], [.13, .045, .07], C.leaf, 10, 6);
      for (let i = 0; i < 5; i++) { const angle = i * Math.PI * 2 / 5; g.sphere([x + side * .12 + Math.cos(angle) * .09, .92 + Math.sin(angle) * .09, z], [.09, .07, .055], petal, 8, 5); }
      g.sphere([x + side * .12, .92, z + .045], [.052, .052, .025], C.brass, 8, 5);
    }
  }
  function wardrobe(g) {
    // 原型左侧穿衣镜和右侧衣橱留出中央完整人体，柜门闭合，不虚构已拥有服饰。
    g.box([-2.3, 1.64, -.7], [1.26, 2.72, .22], C.wood, .2);
    g.box([-2.3, 1.65, -.565], [1.04, 2.47, .065], C.glass, .16);
    g.box([-2.61, 1.84, -.522], [.07, 1.65, .024], C.cream, .025, [0, 0, -.12]);
    for (const x of [-2.69, -1.91]) g.box([x, .22, -.7], [.14, .3, .3], C.edge, .04);
    g.box([2.22, 1.4, -1.03], [1.66, 2.6, .86], C.rose, .15);
    g.box([2.22, 2.75, -1.03], [1.8, .16, .99], C.cream, .065);
    g.box([2.22, .15, -1.03], [1.76, .14, .96], C.edge, .05);
    for (const side of [-1, 1]) {
      g.box([2.22 + side * .4, 1.4, -.565], [.73, 2.42, .07], C.blush, .09);
      g.sphere([2.22 + side * .11, 1.42, -.49], [.042, .042, .04], C.brass, 10, 6);
    }
    planter(g, -2.6, 1.48, C.rose);
  }
  function residentCorner(g, definition) {
    // 一本纸册与空矮凳陪伴所选朋友；不放入示例住户或模拟入住标记。
    const accent = color(definition.accent, C.rose);
    g.box([-2.2, .22, .94], [1.12, .15, .8], C.berry, .06, [0, -.12, 0]);
    g.box([-2.2, .31, .94], [1.01, .08, .69], C.cream, .025, [0, -.12, 0]);
    g.box([-2.2, .38, .94], [1.14, .08, .82], C.rose, .05, [0, -.12, 0]);
    for (const side of [-1, 1]) {
      g.box([2.22 + side * .57, .4, -.9], [.12, .68, .48], C.edge, .04);
      g.box([2.22 + side * .57, .96, -1.18], [.1, .83, .13], C.wood, .035);
    }
    g.box([2.22, .75, -.9], [1.5, .18, .72], C.wood, .08);
    g.box([2.22, .89, -.88], [1.36, .18, .62], C.blush, .1);
    g.box([2.22, 1.28, -1.18], [1.54, .22, .15], C.rose, .06);
    planter(g, -2.55, -1.2, accent);
  }
  function describe(env) {
    if (!env || !env.state || !['avatar', 'residents'].includes(env.surface)) return null;
    const surface = env.surface, state = env.state;
    let look = null, resident = null, key;
    if (surface === 'avatar') {
      if (!state.avatar || typeof state.avatar !== 'object') return null;
      look = appearance(state.avatar); key = keyFor(surface, { look, definitions: appearanceDefinitions(look) });
    } else {
      const id = env.residentId, definition = typeof id === 'string' ? G.data?.residents?.find(row => row.id === id) || G.data?.residentById?.[id] : null;
      if (!definition) return null;
      resident = copy(definition); key = keyFor(surface, { resident, movedIn: !!state.residents?.[id]?.movedIn });
    }
    return {
      id: surface, key,
      // 包括木台下沿、完整发束/最高兔耳头饰和动物角耳；供宿主统一适配未遮挡视口。
      bounds: { min: [-3.65, -.7, -3.65], max: [3.65, 5.25, 3.65] }, focus: [0, 1.95, .3],
      build(geometry, models) {
        const M = models || G.world3dModels;
        if (!geometry || !M || typeof M.character !== 'function' || !['box', 'sphere', 'cylinder'].every(name => typeof geometry[name] === 'function')) return false;
        platform(geometry);
        if (resident) { residentCorner(geometry, resident); M.character(geometry, null, [0, .36, .44], 2.3, copy(resident)); }
        else { wardrobe(geometry); M.character(geometry, copy(look), [0, .36, .44], 2.1); }
        return true;
      }
    };
  }
  G.pageStages3D = Object.freeze({ describe });
})(window.Game = window.Game || {});
