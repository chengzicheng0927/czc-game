/* 原型前院纯几何：提取 prototype/scene.js 的资产与 home 院景，不接入游戏状态。 */
(function (G) {
  'use strict';

  const TAU = Math.PI * 2;
  const palette = Object.freeze({
    grass: '#a9ca83', grassLight: '#c5d99c', soil: '#cda888', clay: '#e7c4a2',
    cream: '#fff2d9', white: '#fffaf0', roof: '#c86e87', roofDark: '#a94d6b',
    mint: '#87bcb0', teal: '#43877f', dark: '#405a50', wood: '#bc8868',
    pink: '#efb1c0', butter: '#f4d988', lilac: '#b9aed5', blue: '#a9d4d7',
    shadow: '#8ca478', cloud: '#fff9ef', stone: '#edddbc',
    treeRight: '#b8c78b', treeFront: '#c8ce8b'
  });
  // 几何保留原型实值；仅邮箱/粉花默认改为当前界面的莓红、柔粉取向。
  function rgb(hex) {
    if (Array.isArray(hex)) return hex;
    const n = parseInt((hex || '#ffffff').replace('#', ''), 16);
    return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  function shade(hex, n) { return rgb(hex).map(v => Math.max(0, Math.min(1, v * n))); }
  function colors(overrides) {
    if (overrides == null) return palette;
    if (typeof overrides !== 'object' || Array.isArray(overrides)) throw new TypeError('palette must be an object');
    const result = Object.assign({}, palette);
    Object.keys(palette).forEach(key => {
      if (!Object.prototype.hasOwnProperty.call(overrides, key)) return;
      const value = overrides[key];
      if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) result[key] = value;
      else if (Array.isArray(value) && value.length === 3 && value.every(v => Number.isFinite(v) && v >= 0 && v <= 1)) result[key] = value.slice();
      else throw new TypeError('Invalid yard palette color: ' + key);
    });
    return result;
  }

  function makeAssets(C) {
    // 以下基础资产保留原型的分段数、圆角、部件比例与局部坐标。
    function island(g, x, z, radius, y = 0, color = C.grass) {
      g.cylinder([x, y - 0.56, z], radius * 0.96, 0.88, C.soil, radius, 48);
      g.cylinder([x, y - 0.08, z], radius, 0.28, color, radius * 0.99, 48);
      g.sphere([x, y - 0.71, z], [radius * 0.91, 0.67, radius * 0.87], C.clay, 32, 10);
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * TAU;
        g.sphere([x + Math.cos(a) * radius * 0.76, y - 1.05, z + Math.sin(a) * radius * 0.76], [radius * 0.33, 0.42, radius * 0.27], C.cloud, 14, 8);
      }
    }
    function shadow(g, x, z, w, d, y = 0.075) { g.sphere([x, y, z], [w, 0.035, d], C.shadow, 20, 6); }
    function tree(g, x, z, s = 1, color = C.mint, y = 0) {
      shadow(g, x + .15 * s, z + .1 * s, .65 * s, .48 * s, y + .06);
      g.cylinder([x, y + .8 * s, z], .12 * s, 1.5 * s, C.wood, .09 * s, 12);
      g.cylinder([x + .18 * s, y + 1.25 * s, z], .07 * s, .55 * s, C.wood, .05 * s, 10, [0, 0, -.55]);
      g.sphere([x, y + 2.05 * s, z], [.74 * s, .94 * s, .7 * s], color, 20, 14);
      g.sphere([x - .37 * s, y + 1.75 * s, z + .05 * s], [.53 * s, .62 * s, .55 * s], shade(color, .96), 18, 10);
      g.sphere([x + .38 * s, y + 1.9 * s, z - .03 * s], [.51 * s, .66 * s, .53 * s], shade(color, 1.05), 18, 10);
      for (let i = 0; i < 3; i++) g.sphere([x + (i - 1) * .34 * s, y + (1.68 + i % 2 * .38) * s, z + .59 * s], [.1 * s, .12 * s, .1 * s], C.butter, 10, 6);
    }
    function flower(g, x, z, color = C.pink, s = 1, y = 0) {
      g.cylinder([x, y + .16 * s, z], .022 * s, .32 * s, C.teal, null, 6);
      g.sphere([x - .07 * s, y + .13 * s, z], [.09 * s, .025 * s, .045 * s], C.mint, 8, 5);
      for (let i = 0; i < 5; i++) {
        const a = i * TAU / 5;
        g.sphere([x + Math.cos(a) * .095 * s, y + .34 * s + Math.sin(a) * .09 * s, z], [.095 * s, .075 * s, .045 * s], color, 8, 6);
      }
      g.sphere([x, y + .34 * s, z + .04 * s], [.065 * s, .065 * s, .035 * s], C.butter, 10, 6);
    }
    function planter(g, x, z, color, y = 0) {
      g.cylinder([x, y + .16, z], .22, .32, color || C.roof, .28, 16);
      g.cylinder([x, y + .32, z], .29, .07, color || C.roof, null, 16);
      flower(g, x, z, C.white, 1.4, y + .3);
    }
    function fence(g, x, z, n, angle = 0) {
      const step = .46, c = Math.cos(angle), s = Math.sin(angle);
      for (let i = 0; i < n; i++) {
        const px = x + c * i * step, pz = z + s * i * step;
        g.box([px, .37, pz], [.13, .64, .13], C.white, .045);
        g.sphere([px, .72, pz], [.095, .1, .095], C.white, 10, 6);
      }
      for (const y of [.26, .52]) g.box([x + c * (n - 1) * step / 2, y, z + s * (n - 1) * step / 2], [(n - 1) * step + .1, .075, .09], C.cream, .025, [0, -angle, 0]);
    }
    function bench(g, x, z) {
      for (const xx of [-.6, .6]) for (const zz of [-.18, .18]) g.box([x + xx, .3, z + zz], [.09, .6, .09], C.teal, .03);
      g.box([x, .64, z], [1.6, .14, .56], C.butter, .05);
      g.box([x, .98, z - .24], [1.6, .5, .11], C.butter, .06);
    }
    function table(g, x, z, s = 1, y = 0, color = C.wood) {
      g.cylinder([x, y + .84 * s, z], .77 * s, .14 * s, color, null, 26);
      g.cylinder([x, y + .43 * s, z], .1 * s, .74 * s, C.cream, null, 12);
      g.cylinder([x, y + .08 * s, z], .43 * s, .11 * s, C.cream, null, 18);
    }
    // 原型 home 院景中的散件单独命名，方便复用而不复制示例人物或花圃。
    function mailbox(g, x, z) {
      g.cylinder([x, .57, z], .07, 1.1, C.wood, null, 10);
      g.box([x, 1.15, z], [.6, .42, .4], C.roof, .1);
      g.box([x, 1.17, z + .23], [.4, .055, .025], C.cream, .015);
    }
    function flowerBed(g, x, z) {
      for (let i = 0; i < 11; i++) flower(g, x + (i % 6) * .5, z + Math.floor(i / 6) * .43, [C.white, C.butter, C.pink][i % 3], .8);
    }
    function flowerBorder(g, x, z) {
      for (let i = 0; i < 5; i++) flower(g, x + i * .32, z - i * .1, i % 2 ? C.white : C.pink, .85);
    }
    function steppingPath(g, x, z) {
      for (let i = 0; i < 7; i++) {
        const t = i / 6;
        g.box([x - t * 2.35, .1, z - Math.sin(t * Math.PI / 2) * 1.0], [.37, .055, .28], C.stone, .11, [0, -.25 - t * .5, 0]);
      }
    }
    function teaCorner(g, x, z) {
      table(g, x, z, .65, 0, C.cream);
      g.cylinder([x, .65, z], .12, .11, C.pink, null, 14);
      for (const pos of [[x + .7, z - .15], [x - .4, z + .53]]) {
        g.cylinder([pos[0], .24, pos[1]], .23, .4, C.wood, null, 16);
        g.cylinder([pos[0], .47, pos[1]], .28, .12, C.butter, null, 20);
      }
    }
    return Object.freeze({ island, shadow, tree, flower, planter, fence, bench, table, mailbox, flowerBed, flowerBorder, steppingPath, teaCorner });
  }

  function rotatePoint(v, rx, ry, rz) {
    let [x, y, z] = v;
    if (rx) { const c = Math.cos(rx), s = Math.sin(rx); [y, z] = [y * c - z * s, y * s + z * c]; }
    if (ry) { const c = Math.cos(ry), s = Math.sin(ry); [x, z] = [x * c + z * s, -x * s + z * c]; }
    if (rz) { const c = Math.cos(rz), s = Math.sin(rz); [x, y] = [x * c - y * s, x * s + y * c]; }
    return [x, y, z];
  }

  const assets = makeAssets(palette);
  function build(g, options) {
    options = options || {};
    if (!g || ['box', 'sphere', 'cylinder'].some(name => typeof g[name] !== 'function')) throw new TypeError('Yard geometry requires box, sphere and cylinder');
    const origin = options.origin === undefined ? [0, 0, 0] : options.origin;
    const scale = options.scale === undefined ? 1 : options.scale;
    if (!Array.isArray(origin) || origin.length !== 3 || !origin.every(Number.isFinite)) throw new TypeError('Yard origin requires three finite coordinates');
    if (!Number.isFinite(scale) || scale <= 0) throw new RangeError('Yard scale must be positive');
    const C = colors(options.palette), A = options.palette == null ? assets : makeAssets(C);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    const point = p => p.map((v, i) => origin[i] + v * scale);
    function include(p, extents) {
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], origin[i] + (p[i] - extents[i]) * scale);
        max[i] = Math.max(max[i], origin[i] + (p[i] + extents[i]) * scale);
      }
    }
    function axes(rotation) {
      const r = rotation || [0, 0, 0];
      return [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map(v => rotatePoint(v, r[0], r[1], r[2]));
    }
    // 只代理三个既有几何方法，不改 g.transform 或已有顶点。包围盒为保守 AABB。
    const draw = {
      sphere(p, s, color, segments, rings) {
        include(p, s); g.sphere(point(p), s.map(v => v * scale), color, segments, rings);
      },
      box(p, s, color, radius, rotation) {
        const a = axes(rotation), half = s.map(v => v / 2);
        include(p, [0, 1, 2].map(i => a.reduce((sum, axis, j) => sum + Math.abs(axis[i]) * half[j], 0)));
        g.box(point(p), s.map(v => v * scale), color, radius * scale, rotation);
      },
      cylinder(p, radius, height, color, topRadius, segments, rotation) {
        const a = axes(rotation), r = Math.max(radius, topRadius == null ? radius : topRadius);
        include(p, [0, 1, 2].map(i => r * Math.hypot(a[0][i], a[2][i]) + Math.abs(a[1][i]) * height / 2));
        g.cylinder(point(p), radius * scale, height * scale, color, topRadius == null ? topRadius : topRadius * scale, segments, rotation);
      }
    };

    // 用户要求疏开院景：只改组合坐标，原型资产的比例/圆角/分段数不变。
    // 对接岛心(-.6,.9)/半径7.25；调用方显式使用origin[0,0,.3]、scale1.2。
    const layout = {
      trees: { rearLeft: [-5.25, 0, -1.9], rearRight: [4.9, 0, -1.3], frontLeft: [-5, 0, .9] },
      fences: { frontStart: [-4.3, 0, 4.9], leftStart: [-5.95, 0, -.2] },
      bench: [-3.4, 0, 2.3], mailbox: [-1, 0, 4.4],
      planters: { right: [1.9, 0, 2.15], left: [-1.85, 0, 3.55] },
      flowers: { frontStart: [-4.3, 0, 4.1], rightStart: [.2, 0, 5.15] },
      entry: [.25, 0, 2.7], teaTable: [1, 0, 3.65],
      stools: [[1.95, 0, 3.5], [.55, 0, 4.45]]
    };
    A.tree(draw, layout.trees.rearLeft[0], layout.trees.rearLeft[2], .83, C.mint);
    A.tree(draw, layout.trees.rearRight[0], layout.trees.rearRight[2], .68, C.treeRight);
    A.tree(draw, layout.trees.frontLeft[0], layout.trees.frontLeft[2], .64, C.treeFront);
    A.fence(draw, layout.fences.frontStart[0], layout.fences.frontStart[2], 5);
    A.fence(draw, layout.fences.leftStart[0], layout.fences.leftStart[2], 6, Math.PI / 2);
    A.bench(draw, layout.bench[0], layout.bench[2]);
    A.mailbox(draw, layout.mailbox[0], layout.mailbox[2]);
    A.planter(draw, layout.planters.right[0], layout.planters.right[2], C.pink);
    A.planter(draw, layout.planters.left[0], layout.planters.left[2], C.mint);
    A.flowerBed(draw, layout.flowers.frontStart[0], layout.flowers.frontStart[2]);
    A.steppingPath(draw, layout.entry[0], layout.entry[2]);
    A.table(draw, layout.teaTable[0], layout.teaTable[2], .65, 0, C.cream);
    draw.cylinder([layout.teaTable[0], .65, layout.teaTable[2]], .12, .11, C.pink, null, 14);
    // 凳子仍用原型的木底/软垫几何，仅移离桌沿，避免原组合轻微相穿。
    for (const pos of layout.stools) {
      draw.cylinder([pos[0], .24, pos[2]], .23, .4, C.wood, null, 16);
      draw.cylinder([pos[0], .47, pos[2]], .28, .12, C.butter, null, 20);
    }
    A.flowerBorder(draw, layout.flowers.rightStart[0], layout.flowers.rightStart[2]);

    return {
      bounds: { min, max },
      anchors: {
        entry: point(layout.entry),
        trees: { rearLeft: point(layout.trees.rearLeft), rearRight: point(layout.trees.rearRight), frontLeft: point(layout.trees.frontLeft) },
        fences: { frontStart: point(layout.fences.frontStart), leftStart: point(layout.fences.leftStart) },
        bench: point(layout.bench), mailbox: point(layout.mailbox),
        planters: { right: point(layout.planters.right), left: point(layout.planters.left) },
        flowers: { frontStart: point(layout.flowers.frontStart), rightStart: point(layout.flowers.rightStart) },
        path: Array.from({ length: 7 }, (_, i) => { const t = i / 6; return point([layout.entry[0] - t * 2.35, .1, layout.entry[2] - Math.sin(t * Math.PI / 2)]); }),
        teaTable: point(layout.teaTable), teaCup: point([layout.teaTable[0], .65, layout.teaTable[2]]),
        stools: layout.stools.map(point),
        // 仅给出原型花圃参考坐标；这里不创建花圃、桥、作物或库存资产。
        gardenReference: point([3.35, 0, 2.15])
      }
    };
  }

  G.prototypeYard3D = Object.freeze({ assets, build });
})(window.Game = window.Game || {});
