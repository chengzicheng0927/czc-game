/** 原独立花园CPU内容；仅描述真实地块和原装饰，无GL、DOM、RAF、规则写入或网络。 */
  const C = Object.freeze({ grass: '#B6CD98', paleGrass: '#C6D7AB', soil: '#98765E', wet: '#755F50', bed: '#C39A76', edge: '#E7C7A1', cream: '#FFF5E3', berry: '#AF4566', pink: '#E6A8B9', wood: '#B78D6D', leaf: '#84AD89', lightLeaf: '#BAD09F', water: '#78B5C6', gold: '#E3B768', ink: '#73505B' });
  const SCALE = 1.55, GROUND = .18, TAU = Math.PI * 2;
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const color = (value, fallback) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  const copy = value => JSON.parse(JSON.stringify(value));
  function ring(g, p, width, depth, tone, thickness = .055) {
    for (const side of [-1, 1]) {
      g.box([p[0] + side * width / 2, p[1], p[2]], [thickness, .065, depth + thickness], tone, .025);
      g.box([p[0], p[1], p[2] + side * depth / 2], [width, .065, thickness], tone, .025);
    }
  }
  function leaf(g, p, scale, side) {
    g.sphere([p[0] + side * .14 * scale, p[1], p[2]], [.2 * scale, .06 * scale, .105 * scale], side < 0 ? C.leaf : C.lightLeaf, 10, 6);
  }
  function stem(g, p, height, scale = 1) {
    g.cylinder([p[0], p[1] + height / 2, p[2]], .025 * scale, height, C.leaf, .019 * scale, 8);
    leaf(g, [p[0], p[1] + height * .38, p[2]], scale, -1);
    leaf(g, [p[0], p[1] + height * .66, p[2]], scale, 1);
  }
  function petals(g, p, crop, scale, count = 7) {
    const rainbow = ['#E7A3B6', '#EDB48A', '#EAD17E', '#A7C89F', '#A6CEDB', '#AFADDA', '#D3B3D7'];
    for (let i = 0; i < count; i++) {
      const a = i * TAU / count, tone = crop.shape === 'rainbow' ? rainbow[i % rainbow.length] : crop.color;
      g.sphere([p[0] + Math.cos(a) * .22 * scale, p[1] + Math.sin(a) * .22 * scale, p[2]], [.18 * scale, .16 * scale, .105 * scale], tone, 10, 6);
    }
    g.sphere([p[0], p[1], p[2] + .09 * scale], [.17 * scale, .17 * scale, .085 * scale], crop.accent, 12, 7);
  }
  function star(g, p, scale, tone) {
    g.sphere(p, [.19 * scale, .19 * scale, .12 * scale], tone, 10, 6);
    for (let i = 0; i < 5; i++) {
      const a = i * TAU / 5;
      g.cylinder([p[0] + Math.sin(a) * .22 * scale, p[1] + Math.cos(a) * .22 * scale, p[2]], .145 * scale, .33 * scale, tone, 0, 8, [0, 0, -a]);
    }
  }
  function drop(g, p, scale = 1) {
    g.sphere([p[0], p[1] - .035 * scale, p[2]], [.09 * scale, .12 * scale, .065 * scale], C.water, 10, 7);
    g.cylinder([p[0], p[1] + .085 * scale, p[2]], .075 * scale, .17 * scale, C.water, 0, 10);
    g.sphere([p[0] - .027 * scale, p[1], p[2] + .055 * scale], [.02 * scale, .045 * scale, .012 * scale], C.cream, 8, 5);
  }
  function cropHeight(crop, status) {
    if (status.empty) return .3;
    if (status.stage === 0) return .5;
    if (status.stage === 1) return .65;
    return crop.shape === 'tree' ? status.stage === 2 ? 1.95 : 2.55 : crop.id === 'sunflower' ? 1.7 : 1.3;
  }
  function plant(g, models, plot) {
    const s = plot.status, crop = plot.crop, p = [plot.p[0], .31, plot.p[2]];
    if (s.empty || !crop) return;
    if (s.stage === 0) {
      g.sphere([p[0], .35, p[2]], [.115, .075, .16], '#D8B78D', 12, 7);
      g.box([p[0], .42, p[2]], [.025, .015, .17], C.cream, .006, [0, -.25, 0]); return;
    }
    if (s.stage === 1) { stem(g, p, .31, .85); return; }
    const mature = s.stage === 3, scale = mature ? 1 : .67;
    if (crop.shape === 'tree') {
      models.tree(g, p[0], p[2], mature ? .71 : .52, p[1], mature ? crop.color : C.lightLeaf); return;
    }
    const height = crop.id === 'sunflower' ? .92 : .62;
    if (crop.shape !== 'carrot' && crop.shape !== 'pumpkin') stem(g, p, height * scale, scale);
    const crown = [p[0], p[1] + height * scale, p[2]];
    if (!mature && ['flower', 'rainbow', 'tulip', 'rose'].includes(crop.shape)) {
      g.sphere(crown, [.14, .21, .14], crop.color, 12, 8);
      for (const side of [-1, 1]) leaf(g, [crown[0], crown[1] - .13, crown[2]], .65, side); return;
    }
    switch (crop.shape) {
      case 'flower': case 'rainbow': petals(g, crown, crop, scale, crop.shape === 'rainbow' ? 7 : crop.id === 'sunflower' ? 12 : 8); break;
      case 'tulip':
        g.sphere(crown, [.24 * scale, .22 * scale, .2 * scale], crop.color, 12, 8);
        for (const side of [-1, 0, 1]) g.sphere([crown[0] + side * .15 * scale, crown[1] + .13 * scale, crown[2]], [.105 * scale, .18 * scale, .15 * scale], side ? crop.color : crop.accent, 10, 7); break;
      case 'rose':
        for (let i = 0; i < 3; i++) g.sphere([crown[0] + (i % 2 ? -.035 : .025), crown[1] + i * .015, crown[2] + i * .055], [(.3 - i * .07) * scale, (.26 - i * .055) * scale, .11 * scale], i % 2 ? crop.accent : crop.color, 12, 8); break;
      case 'berry':
        g.cylinder([crown[0], crown[1] - .02, crown[2]], .075 * scale, .42 * scale, crop.color, .25 * scale, 16);
        for (let c = 0; c < 5; c++) {
          const ca = c * TAU / 5;
          g.sphere([crown[0] + Math.cos(ca) * .11 * scale, crown[1] + .21 * scale, crown[2] + Math.sin(ca) * .11 * scale], [.09 * scale, .03 * scale, .06 * scale], C.leaf, 8, 5);
        }
        for (const [x, y] of [[-.11, .02], [.09, .06], [0, -.1], [-.06, -.08], [.08, -.06]]) g.sphere([crown[0] + x * scale, crown[1] + y * scale, crown[2] + .19 * scale], [.025, .035, .013], crop.accent, 8, 5);
        for (const side of [-1, 1]) leaf(g, [crown[0], crown[1] + .22 * scale, crown[2]], .72 * scale, side); break;
      case 'carrot':
        g.cylinder([p[0], .48, p[2]], .045 * scale, .4 * scale, crop.color, .18 * scale, 12);
        g.sphere([p[0], .68 * scale + .12, p[2]], [.17 * scale, .05 * scale, .17 * scale], crop.color, 10, 6);
        for (const side of [-1, 0, 1]) g.sphere([p[0] + side * .09 * scale, .79, p[2]], [.065 * scale, .23 * scale, .055 * scale], C.leaf, 10, 6, [0, 0, -side * .25]); break;
      case 'pumpkin':
        for (let lobe = 0; lobe < 8; lobe++) {
          const la = lobe * TAU / 8;
          g.sphere([p[0] + Math.cos(la) * .10 * scale, .53, p[2] + Math.sin(la) * .10 * scale], [.21 * scale, .26 * scale, .21 * scale], lobe % 2 ? crop.color : crop.accent, 12, 8);
        }
        g.cylinder([p[0], .84, p[2]], .045, .18 * scale, C.leaf, .03, 8, [0, 0, -.25]); break;
      case 'lavender':
        for (const side of [-1, 0, 1]) {
          const x = p[0] + side * .15 * scale, top = crown[1] + (side ? 0 : .12);
          g.cylinder([x, (p[1] + top) / 2, p[2]], .015, top - p[1], C.leaf, .015, 6);
          for (let i = 0; i < 4; i++) g.sphere([x, top - i * .09 * scale, p[2]], [.09 * scale, .08 * scale, .1 * scale], i % 2 ? crop.accent : crop.color, 8, 5);
        } break;
      case 'blueberry':
        for (const [x, y] of [[-.17, 0], [.17, 0], [0, .2], [0, -.06]]) {
          g.sphere([crown[0] + x * scale, crown[1] + y * scale, crown[2]], [.18 * scale, .18 * scale, .17 * scale], crop.color, 12, 8);
          g.sphere([crown[0] + x * scale - .04, crown[1] + y * scale + .05, crown[2] + .15 * scale], [.035, .035, .015], crop.accent, 8, 5);
        } break;
      case 'star': star(g, crown, scale, crop.color); g.sphere([crown[0] - .06, crown[1] + .09, crown[2] + .13], [.04, .06, .015], crop.accent, 8, 5); break;
    }
  }
  function bed(g, models, plot, selected) {
    const p = plot.p, width = plot.size[0], depth = plot.size[2], s = plot.status;
    g.box([p[0], .18, p[2]], [width, .22, depth], C.bed, .11);
    g.box([p[0], .29, p[2]], [width - .13, .055, depth - .13], !s.empty && s.watered ? C.wet : C.soil, .09);
    ring(g, [p[0], .31, p[2]], width - .025, depth - .025, selected ? C.berry : C.edge, selected ? .09 : .055);
    for (const row of [-1, 0, 1]) g.box([p[0], .325, p[2] + row * depth * .22], [width * .72, .024, .035], !s.empty && s.watered ? '#8C745B' : '#B79875', .012);
    if (s.empty) for (const side of [-1, 1]) g.sphere([p[0] + side * .14, .35, p[2]], [.055, .025, .055], C.edge, 8, 5);
    else plant(g, models, plot);
    // 状态牌属于当前地块；水滴只在真实needsWater时显示，金色只在真实成熟时显示。
    const badge = [p[0] + width / 2 - .18, .59, p[2] + depth / 2 - .12];
    g.box([badge[0], .43, badge[2]], [.035, .32, .045], C.wood, .015);
    g.box(badge, [.25, .26, .07], s.mature ? C.gold : s.needsWater ? C.cream : s.empty ? C.edge : C.lightLeaf, .05);
    if (s.needsWater) drop(g, [badge[0], badge[1], badge[2] + .055], .65);
    else if (s.mature) g.box([badge[0], badge[1], badge[2] + .05], [.11, .11, .04], C.cream, .025, [0, 0, Math.PI / 4]);
    else if (!s.empty) leaf(g, [badge[0] - .04, badge[1], badge[2] + .05], .35, 1);
  }
  function fence(g) {
    // 后围栏和两侧短围栏留出前方花圃操作视线。
    for (const x of [-3.7, -2.78, -1.85, -.93, 0, .93, 1.85, 2.78, 3.7]) {
      g.box([x, .6, -4.3], [.13, 1, .14], C.cream, .04);
      g.sphere([x, 1.12, -4.3], [.1, .1, .1], C.pink, 8, 5);
    }
    for (const y of [.43, .86]) g.box([0, y, -4.3], [7.65, .1, .12], C.edge, .03);
    for (const side of [-1, 1]) {
      for (const z of [-2.6, -1.65, -.7]) g.box([side * 4.75, .5, z], [.13, .8, .14], C.cream, .04);
      for (const y of [.33, .69]) g.box([side * 4.75, y, -1.65], [.12, .1, 2.1], C.edge, .03);
    }
  }
  function wateringCan(g, x, y, z) {
    g.cylinder([x, y + .2, z], .21, .34, C.water, .18, 14);
    g.cylinder([x, y + .39, z], .17, .04, C.cream, .17, 14);
    g.box([x - .27, y + .26, z], [.3, .09, .1], C.water, .035, [0, 0, -.45]);
    g.cylinder([x - .4, y + .33, z], .075, .05, C.cream, .075, 10, [0, 0, -.9]);
    g.sphere([x + .22, y + .23, z], [.1, .2, .085], C.water, 10, 7);
    g.box([x + .22, y + .23, z + .065], [.085, .23, .04], C.cream, .03);
  }
  function pot(g, models, x, z, petal) {
    g.cylinder([x, .3, z], .2, .37, C.pink, .28, 14);
    g.cylinder([x, .5, z], .29, .07, C.cream, .29, 16);
    g.cylinder([x, .54, z], .24, .025, C.soil, .24, 14);
    models.flower(g, x, z, petal, 1.25, .55);
  }
  function environment(g, models) {
    models.island(g, 0, 0, 5.65, 0);
    g.sphere([0, .09, .4], [4.35, .035, 4.45], C.paleGrass, 28, 7);
    fence(g);
    // 工具架只摆固定园艺工具与空陶盆，不显示示例种子、收获或可领取资产。
    for (const x of [-3.65, -2.35]) g.box([x, .78, -3.38], [.11, 1.42, .14], C.wood, .035);
    g.box([-3, .88, -3.38], [1.62, .12, .67], C.edge, .05);
    g.box([-3, 1.51, -3.68], [1.62, .13, .12], C.wood, .035);
    wateringCan(g, -3.13, .95, -3.37);
    for (const x of [-2.65, -2.42]) {
      g.cylinder([x, 1.23, -3.45], .105, .23, C.pink, .15, 12);
      g.cylinder([x, 1.36, -3.45], .15, .03, C.cream, .15, 12);
      g.cylinder([x, 1.38, -3.45], .11, .01, C.soil, .11, 12);
    }
    for (const x of [-3.56, -3.23]) {
      g.box([x, .62, -3.8], [.045, 1.02, .05], C.wood, .015, [0, 0, .13]);
      g.box([x - .055, .18, -3.8], [.2, .23, .07], C.water, .065);
    }
    // 后木牌没有玩法文案；白色花瓣图案与莓红框沿用原型园艺陈设。
    g.box([2.8, 1.05, -3.5], [.12, 1.8, .14], C.wood, .035);
    g.box([2.8, 1.65, -3.5], [1.48, .73, .18], C.berry, .12);
    g.box([2.8, 1.65, -3.39], [1.29, .55, .045], C.cream, .08);
    petals(g, [2.8, 1.65, -3.34], { shape: 'flower', color: C.pink, accent: C.gold }, .62, 5);
    for (const [x, z, tone] of [[-4.25, 1.3, C.pink], [-4.1, 2.1, C.cream], [4.2, 1.3, C.cream], [4, 2.2, C.pink]]) pot(g, models, x, z, tone);
    for (let i = 0; i < 4; i++) g.box([(i % 2 ? -.07 : .07), .16, 3.15 + i * .52], [1.07, .12, .38], i % 2 ? C.cream : C.edge, .13, [0, i % 2 ? -.1 : .08, 0]);
    for (const side of [-1, 1]) {
      models.tree(g, side * 3.7, -2.45, .7, 0, side < 0 ? '#9DBFA3' : '#BDD0A4');
      for (let i = 0; i < 5; i++) models.flower(g, side * (2.75 + i * .28), 3.3 - i * .13, i % 2 ? C.cream : C.pink, .7, .1);
      g.sphere([side * 1.28, .26, 4.22], [.33, .2, .3], C.cream, 12, 7);
    }
  }
  export function describeGarden(env) {
    if (!env || env.surface !== 'garden' || !env.state || env.capturingPhoto || env.roomOnly || env.forceHouse) return null;
    const data = env.data, config = data?.gardenConfig, layout = env.garden;
    if (!config || env.state.level < config.unlockLv || !layout || !Array.isArray(layout.plots) || !Array.isArray(env.gardenStatuses) || !finite(layout.center?.x) || !finite(layout.center?.y)) return null;
    const capacity = env.state.level >= config.expandLv ? config.expandedPlots : config.basePlots;
    if (![6, 9].includes(capacity) || layout.plots.length !== capacity) return null;
    const center = { x: layout.center.x, y: layout.center.y };
    const worldToPage = (point, height = GROUND) => point && finite(point.x) && finite(point.y) && finite(height) ? [(point.x - center.x) / 100 * SCALE, height, (point.y - center.y) / 75 * SCALE] : null;
    const plots = [], hits = [], labels = [], indices = new Set();
    const selectedPlot = Number.isInteger(env.selectedPlot) && env.selectedPlot >= 0 && env.selectedPlot < capacity ? env.selectedPlot : null;
    for (const source of layout.plots) {
      const index = source.index, raw = env.gardenStatuses.find(status => status?.index === index);
      if (!Number.isInteger(index) || index < 0 || index >= capacity || indices.has(index) || !['x', 'y', 'w', 'h', 'cropX', 'particleX', 'particleY'].every(key => finite(source[key])) || source.w <= 0 || source.h <= 0 || !raw || raw.locked || typeof raw.empty !== 'boolean' || !Number.isInteger(raw.stage) || raw.stage < 0 || raw.stage > 3) return null;
      indices.add(index);
      const definition = !raw.empty && typeof raw.crop === 'string' ? data.cropById?.[raw.crop] || data.crops?.find(crop => crop.id === raw.crop) : null;
      if (!raw.empty && !definition) return null;
      const status = copy(raw), crop = definition ? { id: definition.id, shape: definition.shape, color: color(definition.color, C.pink), accent: color(definition.accent, C.gold) } : null;
      const world = { x: source.cropX, y: source.y + source.h / 2 }, particleWorld = { x: source.particleX, y: source.particleY };
      const p = worldToPage(world), height = cropHeight(crop, status), size = [source.w / 100 * SCALE, height, source.h / 75 * SCALE];
      const plot = { index, p, size, world, particleWorld, harvestAnchor: [p[0], height, p[2]], status, crop };
      plots.push(plot);
      // World3D.hitBox的p.y是底边，x/z才是中心；覆盖土面到完整植株。
      hits.push({ kind: 'plot', index, p: [p[0], .12, p[2]], size: [size[0], height + .05, size[2]], world: copy(world) });
      labels.push({ kind: 'plot', index, text: String(index + 1) + ' · ' + (status.empty ? '待播种' : status.mature ? '可收获' : status.needsWater ? '需浇水' : '已浇水'), p: [p[0], .62, p[2] + size[2] / 2 + .06], world: copy(world) });
    }
    plots.sort((a, b) => a.index - b.index);
    let visitor = null;
    if (env.visitor && finite(env.visitor.x) && finite(env.visitor.y)) {
      const world = { x: env.visitor.x, y: env.visitor.y }, p = worldToPage(world, 1.25);
      visitor = { p, bee: !!env.visitor.bee };
      hits.push({ kind: 'visitor', p: [p[0], p[1] - .3, p[2]], size: [.7, .65, .6], world });
      labels.push({ kind: 'visitor', text: '小访客', p: [p[0], p[1] + .45, p[2]], world: copy(world) });
    }
    const key = 'garden-page-v1:' + JSON.stringify([capacity, center, selectedPlot, plots.map(plot => [plot.index, plot.p, plot.size, plot.world, plot.particleWorld, plot.status.crop, plot.status.empty, plot.status.stage, plot.status.mature, plot.status.needsWater, plot.status.watered, plot.crop]), visitor]);
    return {
      id: 'garden', interactive: true, key, plots, hits, labels,
      bounds: { min: [-6.25, -1.6, -6.25], max: [6.25, 3.15, 6.25] }, focus: [0, .48, .05], worldToPage,
      buildEnvironment(geometry, models) {
        environment(geometry, models);
        if (visitor) {
          const p = visitor.p;
          geometry.sphere(p, [.22, .16, .18], visitor.bee ? '#EBC978' : C.pink, 12, 8);
          for (const side of [-1, 1]) geometry.sphere([p[0] + side * .18, p[1] + .13, p[2] - .025], [.18, .09, .1], visitor.bee ? '#DEEDF0' : '#D6BEE6', 10, 6);
        }
      },
      buildPlot(geometry, models, index) {
        const plot = plots.find(value => value.index === index); if (!plot) return false;
        bed(geometry, models, plot, plot.index === selectedPlot); return true;
      },
      build(geometry, models) {
        const M = models;
        if (!geometry || !['box', 'sphere', 'cylinder'].every(name => typeof geometry[name] === 'function') || !M || !['island', 'flower', 'tree'].every(name => typeof M[name] === 'function')) return false;
        environment(geometry, M);
        plots.forEach(plot => bed(geometry, M, plot, plot.index === selectedPlot));
        if (visitor) {
          const p = visitor.p;
          geometry.sphere(p, [.22, .16, .18], visitor.bee ? '#EBC978' : C.pink, 12, 8);
          for (const side of [-1, 1]) geometry.sphere([p[0] + side * .18, p[1] + .13, p[2] - .025], [.18, .09, .1], visitor.bee ? '#DEEDF0' : '#D6BEE6', 10, 6);
        }
        return true;
      }
    };
  }
/** 原6/9地块的纯布局；数值保留自旧scene，非建筑房间格子。 */
export function gardenLayout(count = 6) {
  const center = { x: 1000, y: 143 }, radius = { x: 330, y: 185 }, columns = count > 9 ? 4 : 3, rows = Math.ceil(count / columns);
  const plotWidth = 100, plotHeight = 66, gapX = 18, gapY = 20, gridWidth = columns * plotWidth + (columns - 1) * gapX, gridHeight = rows * plotHeight + (rows - 1) * gapY;
  const plots = Array.from({ length: count }, (_, index) => {
    const x = center.x - gridWidth / 2 + index % columns * (plotWidth + gapX), y = center.y - gridHeight / 2 + Math.floor(index / columns) * (plotHeight + gapY);
    return { index, x, y, w: plotWidth, h: plotHeight, cropX: x + plotWidth / 2, cropY: y + 38, cropSize: 78, particleX: x + plotWidth / 2, particleY: y + 12 };
  });
  return { center, radius, columns, rows, plots, header: { x: center.x - 150, y: center.y - radius.y - 64, w: 300, h: 44 }, bridge: { x: 640, y: 124, w: 120, h: 42 }, visitor: { x: center.x + 120, y: center.y - 130, hitRadius: 31 }, bounds: { left: center.x - radius.x, right: center.x + radius.x, top: center.y - radius.y - 80, bottom: 410 } };
}
