/* 软陶内容工厂：保留各家具与角色造型，只调用宿主提供的几何接口。
 * 不访问 window、存档、渲染引擎或网络；Babylon adapter负责生成实际网格。
 */
export function createClayModels(data = {}, state = {}) {
  const G = { data, state };
  const TAU = Math.PI * 2;
  const C = { grass: '#B1CC91', soil: '#CDA888', clay: '#E7C4A2', cream: '#FFF2D9', white: '#FFFAF0', roof: '#CE7588', mint: '#A7C8B1', wood: '#BC8868', pink: '#E8A6B5', butter: '#F4D988', blue: '#B5D8DE', ink: '#6E5159' };
  const validColor = (value, fallback) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  const tint = (hex, n) => '#' + [1, 3, 5].map(i => Math.max(0, Math.min(255, parseInt(validColor(hex, '#FFFFFF').slice(i, i + 2), 16) + n)).toString(16).padStart(2, '0')).join('');

  function island(g, x, z, radius, y = 0, softClouds = false) {
    g.cylinder([x, y - .56, z], radius * .96, .88, C.soil, radius, 40);
    g.cylinder([x, y - .08, z], radius, .28, C.grass, radius * .99, 40);
    g.sphere([x, y - .71, z], [radius * .91, .67, radius * .87], C.clay, 24, 8);
    if (softClouds) {
      // 一整片宽云腹连接大小不等的云肩，不再让九颗等距小球围成波浪圈。
      // 范围仍约为原半径的1.09倍，草坪、土层和落脚面完全沿用原尺寸。
      const ball = g.cloudSphere ? g.cloudSphere.bind(g) : g.sphere.bind(g);
      const segments = radius < 3 ? 16 : 20;
      for (const [dx, dy, dz, rx, ry, rz, tone] of [
        [0, -1.04, 0, 1.035, .48, .985, '#F4F5FF'],
        [-.61, -.99, -.04, .46, .37, .59, '#FFFAF4'],
        [.58, -1.04, .12, .48, .34, .61, '#FFFFFF'],
        [.04, -.98, -.59, .69, .35, .45, '#FFFFFF'],
        [-.10, -1.02, .59, .74, .34, .47, '#FFFFFF'],
        [-.35, -1.01, .75, .44, .19, .30, '#FFFAF4'],
        [.53, -1.07, .49, .37, .20, .43, '#FFFFFF'],
      ]) ball([x + dx * radius, y + dy, z + dz * radius], [rx * radius, ry, rz * radius], tone, segments, 10);
      return;
    }
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * TAU;
      g.sphere([x + Math.cos(a) * radius * .76, y - 1.05, z + Math.sin(a) * radius * .76], [radius * .33, .42, radius * .27], C.white, 12, 7);
    }
  }
  function cloud(g, x, y, z, s = 1) {
    const ball = g.cloudSphere ? g.cloudSphere.bind(g) : g.sphere.bind(g);
    // 深叠的宽底、偏心高峰与低云肩，形成连续而非串珠的软云轮廓。
    for (const [dx, dy, dz, rx, ry, rz, tone] of [
      [.02, -.12, .04, 1.52, .31, .74, '#F4F5FF'],
      [-.07, .07, 0, 1.30, .41, .68, '#FFFAF4'],
      [-.93, .10, .02, .64, .36, .54, '#FFFFFF'],
      [-.33, .34, -.08, .68, .53, .59, '#FFFFFF'],
      [.43, .26, -.05, .77, .45, .63, '#FFFFFF'],
      [1.06, .025, .06, .53, .30, .48, '#FFFAF4'],
      [-.10, -.12, .46, 1.12, .20, .35, '#FFFFFF'],
    ]) ball([x + dx * s, y + dy * s, z + dz * s], [rx * s, ry * s, rz * s], tone, 18, 10);
  }
  function tree(g, x, z, s = 1, y = 0, color = C.mint, environmentStyle = '') {
    if (!environmentStyle) {
      // 原园区与真实树类作物保持原有阶段造型；环境树通过显式款式升级。
      g.sphere([x + .1 * s, y + .04, z], [.66 * s, .025, .5 * s], '#98B384', 14, 5);
      g.cylinder([x, y + .8 * s, z], .12 * s, 1.5 * s, C.wood, .09 * s, 10);
      g.cylinder([x + .18 * s, y + 1.25 * s, z], .07 * s, .55 * s, C.wood, .05 * s, 8, [0, 0, -.55]);
      for (const a of [[0, 2.05, 0, .74, .94, .7], [-.37, 1.75, .05, .53, .62, .55], [.38, 1.9, -.03, .51, .66, .53]]) g.sphere([x + a[0] * s, y + a[1] * s, z + a[2] * s], a.slice(3).map(v => v * s), color, 16, 10);
      for (let i = 0; i < 3; i++) g.sphere([x + (i - 1) * .34 * s, y + (1.68 + i % 2 * .38) * s, z + .59 * s], [.1 * s, .12 * s, .1 * s], color === C.mint ? C.butter : '#FFE5ED', 8, 6);
      return;
    }
    const point = (dx, dy, dz) => [x + dx * s, y + dy * s, z + dz * s];
    const ball = (p, radius, tone, segments = 12) => g.sphere(point(...p), radius.map(v => v * s), tone, segments, 8);
    const branch = (a, b, radius, top) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], length = Math.hypot(dx, dy, dz);
      g.cylinder(point((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), radius * s, length * s, C.wood, top * s, 12, [Math.atan2(dz, dy), 0, -Math.asin(dx / length)]);
    };
    ball([.03, .035, 0], [.67, .025, .53], '#A3BB91', 14);
    branch([0, .06, 0], [.035, 1.50, -.025], .115, .073);
    branch([.015, 1.01, 0], [-.38, 1.74, .02], .07, .035);
    branch([.025, 1.16, -.01], [.41, 1.87, -.07], .065, .03);
    ball([0, 1.12, 0], [.10, .12, .09], C.wood);
    for (const side of [-1, 1]) ball([side * .12, .085, .03], [.19, .075, .12], C.wood);
    // 七个相互深叠、大小和高度均不同的团簇，底部宽、顶部略偏心。
    const segments = s < .5 ? 14 : 18;
    for (const [dx, dy, dz, rx, ry, rz, light] of [
      [.015, 2.08, -.045, .72, .72, .67, 0],
      [-.42, 1.86, .02, .53, .48, .53, 0],
      [.43, 1.91, .07, .55, .50, .52, 6],
      [-.14, 2.24, -.37, .55, .57, .47, -5],
      [.10, 2.49, -.045, .52, .55, .51, 13],
      [-.20, 2.18, .38, .55, .48, .47, 6],
      [.43, 2.35, .17, .48, .52, .45, 6],
    ]) ball([dx, dy, dz], [rx, ry, rz], tint(color, light), segments);
    if (environmentStyle === 'blossom') {
      for (const [bx, by, bz, scale] of [[-.46, 2.13, .64, 1.25], [.22, 2.52, .70, 1]]) {
        for (let i = 0; i < 5; i++) { const a = i * TAU / 5; ball([bx + Math.cos(a) * .065 * scale, by + Math.sin(a) * .065 * scale, bz], [.057 * scale, .049 * scale, .025], '#E8A6B5', 8); }
        ball([bx, by, bz + .025], [.035 * scale, .035 * scale, .02], '#FFF0B8', 8);
      }
    } else if (environmentStyle === 'fruit') {
      for (const [fx, fy, fz] of [[-.42, 1.84, .62], [.55, 2.10, .62], [.15, 2.47, .70]]) {
        ball([fx, fy, fz], [.085, .095, .08], '#F6D98B', 12);
        ball([fx + .035, fy + .095, fz], [.065, .025, .035], tint(color, -7), 10);
      }
    }
  }
  function flower(g, x, z, color = C.pink, s = 1, y = 0) {
    g.cylinder([x, y + .16 * s, z], .022 * s, .32 * s, C.mint, null, 6);
    g.sphere([x - .07 * s, y + .13 * s, z], [.09 * s, .025 * s, .045 * s], C.mint, 8, 5);
    for (let i = 0; i < 5; i++) {
      const a = i * TAU / 5;
      g.sphere([x + Math.cos(a) * .095 * s, y + .34 * s + Math.sin(a) * .09 * s, z], [.095 * s, .075 * s, .045 * s], color, 8, 5);
    }
    g.sphere([x, y + .34 * s, z + .04 * s], [.065 * s, .065 * s, .035 * s], C.butter, 8, 5);
  }
  function colors(def, item) {
    const palette = G.data?.themes?.[def.theme]?.palette || ['#DBB997', '#FFF6DC', '#B88779'];
    const list = Array.isArray(palette) ? palette : [palette.primary || palette.main, palette.secondary || palette.accent, palette.detail];
    return [validColor(item?.color, validColor(def.color, validColor(list[0], C.pink))), validColor(list[1], C.cream), validColor(list[2], C.wood)];
  }
  // 所有尺寸由正式家具元数据和实际摆放位置传入。局部单位是家具各轴长度的比例。
  function furniture(g, def, item, p, size) {
    if (!def || !p || !size) return false;
    item = item || {};
    const [w, h, d] = size.map(v => Math.max(.015, Number(v) || .015)), [a, b, c] = colors(def, item), flip = item.flip ? -1 : 1;
    const pos = (x, y, z) => [p[0] + x * w * flip, p[1] + y * h, p[2] + z * d];
    const box = (x, y, z, ww, hh, dd, color = a, r = .045) => g.box(pos(x, y, z), [ww * w, hh * h, dd * d], color, Math.min(w, h, d) * r);
    const ball = (x, y, z, rx, ry, rz, color = a, seg = 12) => g.sphere(pos(x, y, z), [rx * w, ry * h, rz * d], color, seg, 8);
    const cyl = (x, y, z, r, hh, color = a, top, seg = 16, rotation) => g.cylinder(pos(x, y, z), r * Math.min(w, d), hh * h, color, top == null ? undefined : top * Math.min(w, d), seg, rotation);
    const legs = (top = .45, x = .37, z = .36) => { for (const xx of [-x, x]) for (const zz of [-z, z]) box(xx, top / 2, zz, .075, top, .09, C.wood); };
    const drawer = (yy, hh = .24, x = 0, ww = .85) => { box(x, yy, .51, ww, hh, .045, tint(a, 10), .025); ball(x, yy, .55, .035, .03, .035, c, 8); };
    const leaf = (x, y, z, sx = .17, sy = .12, sz = .11) => ball(x, y, z, sx, sy, sz, C.mint, 10);
    let template = def.template;
    if (template === 'crafting') template = def.tags?.includes('cake') ? 'cake' : def.tags?.includes('tree') ? 'tree' : def.tags?.includes('pumpkin') ? 'pumpkin_lantern' : 'vase';
    if (template === 'yard' || template === 'festival') template = def.motif;
    if (def.customArt) template = 'frame';
    // 卧室样板把美术设定转成可绕看的实体；PNG不参与近景渲染。
    // 这四个ID有独立轮廓，其他主题、目录与旧存档的内容编号保持原样。
    if (['bed_basic', 'nightstand_basic', 'desk_lamp_basic', 'wardrobe_basic'].includes(def.id)) {
      const honey = '#DFAB72', honeyLight = '#ECC18D', honeyDark = '#C99361';
      const cream = '#FFF2D9', creamShade = '#F0DEC2', berry = validColor(item.color, '#D77C97');
      const petal = (x, y, z, radius = .055) => {
        for (let i = 0; i < 5; i++) {
          const angle = i * TAU / 5;
          ball(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius * .78, z, radius * .61, radius * .49, .018, cream, 8);
        }
        ball(x, y, z + .013, radius * .35, radius * .31, .019, berry, 10);
      };
      const profile = (points, x, y, z, ww, hh, dd, color) => g.profile(points.map(([px, py]) => ({ x: px, y: py })), pos(x, y, z), [ww * w, hh * h, dd * d], color);
      if (def.id === 'bed_basic') {
        // 支点位于床脚底部；床头与被面都没有越过 .72 米的真实高度。
        for (const x of [-.425, .425]) for (const z of [-.447, .447]) {
          box(x, .095, z, .115, .19, .075, honey, .07);
          box(x, z < 0 ? .48 : .30, z, .115, z < 0 ? .82 : .40, .075, honey, .07);
          ball(x, z < 0 ? .935 : .515, z, .065, .065, .045, honeyLight, 14);
        }
        for (const x of [-.427, .427]) box(x, .26, 0, .10, .16, .84, honey, .05);
        box(0, .235, 0, .84, .16, .90, honeyDark, .08);
        box(0, .37, -.005, .87, .18, .86, cream, .13);
        // 弧顶床头是一块有厚度的连续面，前后均有圆润木边。
        const head = [[-.5, 0], [-.5, .44], [-.43, .51], [-.31, .58], [-.17, .65], [0, .67], [.17, .65], [.31, .58], [.43, .51], [.5, .44], [.5, 0]];
        profile(head, 0, .25, -.447, .81, 1, .052, honey);
        for (const z of [-.476, -.414]) {
          for (let i = 0; i < 15; i++) {
            const x = -.39 + i * .78 / 14, arch = .72 + .19 * Math.cos(x / .40 * Math.PI / 2);
            ball(x, arch, z, .045, .047, .024, honeyLight, 10);
          }
        }
        // 奶油枕头、粉被和翻折被沿从侧面与顶部都有体积。
        box(0, .515, -.278, .69, .16, .205, cream, .15);
        box(0, .485, .135, .91, .16, .60, berry, .14);
        box(0, .57, -.105, .89, .075, .115, tint(berry, 13), .09);
        for (const x of [-.455, .455]) box(x, .385, .13, .035, .23, .58, berry, .1);
        // 低对比绗缝线是窄实体，覆盖范围与床被一致，不烘焙到贴图。
        for (const z of [.035, .185, .335]) box(0, .568, z, .79, .007, .009, tint(berry, -8), .005);
        for (const x of [-.225, .225]) box(x, .568, .18, .009, .007, .40, tint(berry, -8), .005);
        profile([[-.5, 0], [-.5, .11], [-.3, .18], [0, .21], [.3, .18], [.5, .11], [.5, 0]], 0, .22, .447, .79, 1, .057, honey);
        return true;
      }
      if (def.id === 'nightstand_basic') {
        for (const x of [-.365, .365]) for (const z of [-.34, .34]) {
          box(x, .10, z, .15, .20, .16, honey, .09);
          ball(x, .045, z, .075, .045, .08, honey, 10);
        }
        box(0, .54, -.01, .88, .70, .86, honey, .08);
        for (const x of [-.435, .435]) box(x, .56, -.015, .025, .49, .63, creamShade, .04);
        box(0, .56, -.445, .70, .46, .025, honeyLight, .05);
        box(0, .66, .437, .72, .34, .065, cream, .10);
        ball(0, .65, .482, .065, .06, .018, berry, 14);
        box(0, .405, .43, .77, .075, .095, honeyLight, .05);
        box(0, .30, .435, .72, .16, .065, berry, .07);
        for (const x of [-.25, 0, .25]) ball(x, .24, .435, .12, .07, .032, berry, 10);
        petal(0, .31, .468, .065);
        // 桌面顶高恰好等于目录的 .58 米，可独立放置台灯。
        box(0, .95, 0, 1, .10, 1, honeyLight, .10);
        box(0, .993, 0, .83, .014, .81, honey, .06);
        return true;
      }
      if (def.id === 'desk_lamp_basic') {
        // 陶座、木颈、裙边灯罩都是立体几何；没有广告牌或假开灯交互。
        cyl(0, .035, 0, .285, .07, honey, .285, 24);
        ball(0, .215, 0, .30, .18, .30, berry, 18);
        cyl(0, .402, 0, .15, .07, honeyLight, .15, 20);
        cyl(0, .465, 0, .09, .12, honey, .075, 18);
        petal(0, .225, .291, .055);
        ball(-.13, .21, .275, .045, .023, .012, cream, 10);
        ball(.13, .21, .275, .045, .023, .012, cream, 10);
        cyl(0, .69, 0, .455, .38, cream, .25, 24);
        ball(0, .505, 0, .27, .025, .27, '#F8D99B', 16);
        // 交叠裙褶沿一整圈排列；背面与侧面同样有饰边。
        for (let i = 0; i < 16; i++) {
          const angle = i * TAU / 16, x = Math.cos(angle), z = Math.sin(angle);
          ball(x * .425, .515, z * .425, .072, .033, .072, berry, 10);
        }
        cyl(0, .885, 0, .259, .035, creamShade, .259, 24);
        ball(0, .958, 0, .09, .042, .09, berry, 12);
        return true;
      }
      if (def.id === 'wardrobe_basic') {
        for (const x of [-.36, .36]) for (const z of [-.31, .31]) {
          box(x, .05, z, .12, .10, .14, honey, .08);
          ball(x, .025, z, .06, .025, .07, honey, 10);
        }
        box(0, .495, -.025, .89, .79, .83, creamShade, .08);
        for (const x of [-.45, .45]) box(x, .48, -.025, .055, .75, .87, cream, .05);
        box(0, .115, 0, 1, .055, .98, cream, .07);
        for (const x of [-.217, .217]) {
          box(x, .475, .425, .418, .68, .055, cream, .065);
          box(x, .465, .458, .315, .565, .018, creamShade, .055);
          box(x, .465, .473, .275, .53, .012, cream, .055);
          ball(x * .30, .455, .479, .04, .022, .018, berry, 12);
        }
        // 两侧的嵌板与背板使侧后视有真实结构，绝非正面图卡。
        for (const x of [-.478, .478]) box(x, .49, -.025, .018, .61, .62, creamShade, .04);
        box(0, .49, -.451, .76, .64, .018, cream, .04);
        box(0, .49, -.465, .018, .61, .012, creamShade, .01);
        const crown = [[-.5, 0], [-.5, .05], [-.37, .065], [-.27, .095], [-.18, .145], [-.09, .18], [0, .19], [.09, .18], [.18, .145], [.27, .095], [.37, .065], [.5, .05], [.5, 0]];
        profile(crown, 0, .79, 0, .97, 1, .94, cream);
        // 木冠连续绕到背面；上沿的圆珠深叠为柔和曲线。
        for (const z of [-.44, .44]) for (let i = 0; i < 19; i++) {
          const x = -.455 + i * .91 / 18;
          const y = .84 + .14 * Math.exp(-Math.pow(x / .22, 2));
          ball(x, y, z, .045, .02, .04, honey, 10);
        }
        for (const x of [-.455, .455]) box(x, .845, 0, .07, .035, .88, honey, .04);
        for (const z of [-.477, .477]) {
          ball(0, .89, z, .018, .025, .009, berry, 10);
          ball(-.055, .875, z, .022, .013, .009, berry, 10);
          ball(.055, .875, z, .022, .013, .009, berry, 10);
        }
        return true;
      }
    }
    switch (template) {
      case 'bed':
        legs(.18); box(0, .28, 0, 1, .28, .98, C.wood, .09); box(0, .48, 0, .97, .22, .95, C.white, .12);
        box(0, .62, .13, .99, .15, .65, a, .12); box(0, .57, -.45, 1, .86, .12, a, .12);
        box(0, .67, -.29, .74, .17, .23, C.white, .13); box(0, .7, .15, .82, .025, .48, tint(a, 12), .035); break;
      case 'sofa': case 'armchair': case 'bench':
        legs(.17); box(0, .31, 0, .99, .35, .9, a, .13); box(0, .73, -.39, 1, .55, .19, a, .12);
        for (const x of [-.43, .43]) box(x, .5, 0, .16, .41, .99, b, .12);
        if (template !== 'bench') for (const x of template === 'armchair' ? [0] : [-.21, .21]) { box(x, .52, .035, template === 'armchair' ? .65 : .38, .12, .72, tint(a, 12), .1); box(x, .76, -.21, .23, .25, .16, b, .11); } break;
      case 'nightstand': case 'counter': case 'toy_box': case 'wardrobe': case 'fridge':
        legs(.08); box(0, .49, 0, .95, .88, .94, a, template === 'wardrobe' ? .08 : .045); box(0, .95, 0, 1, .08, 1, b);
        if (template === 'toy_box') { box(0, .99, 0, 1.03, .13, 1.04, b, .07); ball(0, .52, .49, .15, .15, .025, b); }
        else if (template === 'fridge') { drawer(.77, .34); drawer(.33, .47); for (const yy of [.28, .75]) box(.32, yy, .56, .045, .16, .04, c); }
        else if (template === 'wardrobe') { for (const x of [-.225, .225]) { box(x, .49, .49, .41, .75, .065, tint(a, 9)); ball(x * .4, .47, .54, .032, .025, .035, c, 8); } }
        else { drawer(.7); for (const x of [-.22, .22]) { box(x, .32, .49, .42, .42, .05, tint(a, 8)); ball(x * .45, .35, .54, .025, .03, .035, c, 8); } } break;
      case 'coffee_table': case 'dining_table': case 'wall_shelf':
        if (template !== 'wall_shelf') legs(.83); else for (const x of [-.35, .35]) box(x, .25, -.1, .08, .45, .65, c);
        box(0, .91, 0, 1, .18, 1, a, .08);
        if (template === 'coffee_table') box(0, .29, 0, .85, .08, .82, b); break;
      case 'chair':
        legs(.47); box(0, .51, 0, 1, .16, 1, b, .09); box(0, .83, -.39, .9, .34, .15, a, .09);
        for (const x of [-.37, .37]) box(x, .66, -.39, .08, .5, .08, c); break;
      case 'bookshelf':
        box(0, .53, -.43, 1, .94, .12, a); for (const x of [-.46, .46]) box(x, .5, 0, .08, 1, 1, a);
        for (let r = 0; r < 3; r++) {
          const y = .08 + r * .3; box(0, y, .04, 1, .06, .98, b);
          for (let k = 0; k < 5; k++) box(-.34 + k * .17, y + .13, .1, .12, .18 + (k + r) % 2 * .06, .64, [a, C.blue, C.pink, C.butter, C.mint][(k + r) % 5], .018);
        } box(0, .98, 0, 1.04, .06, 1.02, b); break;
      case 'floor_lamp': case 'desk_lamp': case 'streetlamp': case 'ceiling_lamp':
        if (template !== 'ceiling_lamp') { cyl(0, .045, 0, .4, .07, c); cyl(0, .43, 0, .035, .77, c); }
        else { cyl(0, .86, 0, .03, .28, c); cyl(0, .99, 0, .18, .035, c); }
        cyl(0, template === 'ceiling_lamp' ? .33 : .82, 0, .48, .32, a, .26, 20); ball(0, template === 'ceiling_lamp' ? .14 : .65, 0, .12, .08, .13, C.cream); break;
      case 'rug': case 'picnic_mat': case 'path':
        box(0, .1, 0, 1, .12, 1, a, .11); box(0, .17, 0, .84, .035, .77, b, .1);
        if (template === 'picnic_mat') for (let x = -.35; x < .4; x += .18) { box(x, .2, 0, .04, .02, .83, a); box(0, .2, x, .83, .02, .04, a); } break;
      case 'vanity':
        legs(.47); box(0, .53, .08, 1, .18, .92, a); for (const x of [-.25, .25]) drawer(.51, .1, x, .39);
        ball(0, .8, -.32, .34, .26, .12, c, 16); ball(0, .8, -.21, .285, .22, .03, C.blue, 16); break;
      case 'stove':
        legs(.08); box(0, .45, 0, .95, .78, .94, a); box(0, .87, 0, 1, .14, 1, b);
        box(0, .39, .49, .73, .38, .06, '#897781'); box(0, .39, .53, .6, .25, .04, '#BAC6C5'); box(0, .62, .55, .57, .035, .04, b);
        for (const x of [-.25, .25]) { cyl(x, .97, -.07, .18, .025, '#7B6D70'); ball(x, .74, .52, .045, .035, .04, c, 8); } break;
      case 'bathtub': case 'pond':
        ball(0, .4, 0, .5, .38, .5, a, 20); ball(0, .7, 0, .48, .1, .47, b, 20); ball(0, .77, 0, .39, .025, .37, '#BDDAD9', 20);
        if (template === 'bathtub') { cyl(.32, .89, -.26, .025, .25, c); box(.26, 1, -.26, .19, .035, .06, c); } break;
      case 'sink':
        box(0, .33, 0, .82, .63, .85, a); for (const x of [-.2, .2]) drawer(.3, .42, x, .36);
        ball(0, .68, 0, .5, .1, .5, b, 18); ball(0, .73, 0, .36, .025, .35, C.blue, 16); cyl(.12, .86, -.31, .035, .27, c); box(.04, .99, -.31, .24, .04, .06, c); break;
      case 'piano':
        legs(.25); box(0, .63, -.11, .93, .74, .77, a, .06); box(0, .45, .31, 1, .13, .38, b);
        for (let i = 0; i < 14; i++) { box(-.46 + i * .071, .535, .35, .065, .04, .29, C.white, .006); if (i % 7 !== 2 && i % 7 !== 6) box(-.43 + i * .071, .57, .26, .033, .035, .15, '#67535E', .006); } box(0, .96, -.15, 1, .08, .84, b); break;
      case 'easel':
        for (const x of [-.36, .36]) box(x, .47, 0, .075, .95, .1, C.wood); box(0, .59, 0, .87, .65, .18, C.wood);
        box(0, .6, .11, .74, .53, .04, b); ball(.18, .75, .14, .09, .06, .012, C.butter); box(0, .43, .14, .7, .17, .025, C.mint); box(0, .29, .13, 1, .06, .28, c); break;
      case 'aquarium':
        legs(.2); box(0, .55, 0, .95, .68, .9, '#B4D5D8'); for (const y of [.24, .94]) box(0, y, 0, 1, .11, 1, a);
        box(0, .33, .37, .9, .075, .12, C.cream); for (const x of [-.33, -.18]) { box(x, .48, .34, .035, .32, .04, C.mint); leaf(x, .6, .35, .12, .08, .04); }
        ball(.21, .64, .46, .12, .08, .035, C.roof); ball(.33, .64, .44, .07, .1, .03, C.pink); ball(.17, .66, .5, .012, .015, .008, C.ink, 8); break;
      case 'window':
        box(0, .5, 0, 1, 1, 1, b, .09); box(0, .5, .52, .79, .8, .08, C.blue, .07);
        box(0, .5, .59, .045, .82, .06, C.white); box(0, .5, .59, .82, .045, .06, C.white); for (const x of [-.43, .43]) box(x, .5, .55, .18, 1.04, .2, a, .1); break;
      case 'frame': case 'mirror':
        box(0, .5, 0, 1, 1, 1, a, .075); box(0, .5, .52, .84, .82, .06, template === 'mirror' ? C.blue : b, .03);
        if (def.customArt) {
          const art = (G.state?.customArts || []).find(entry => entry.id === item.artId), config = G.data?.creativeConfig;
          if (art?.pixels && config?.size && config.palette && config.symbols) for (let row = 0; row < config.size; row++) for (let col = 0; col < config.size; col++) {
            const index = config.symbols.indexOf(art.pixels[row * config.size + col]); if (index < 0) continue;
            box(-.37 + (col + .5) * .74 / config.size, .87 - (row + .5) * .74 / config.size, .58, .74 / config.size + .001, .74 / config.size + .001, .02, config.palette[index], 0);
          }
        } else if (template === 'frame') { ball(.19, .69, .58, .11, .11, .015, C.butter); ball(-.12, .38, .59, .26, .13, .018, C.mint); }
        else box(-.13, .63, .58, .035, .5, .02, '#E6EFF0'); break;
      case 'clock':
        ball(0, .5, 0, .5, .5, .5, a, 18); ball(0, .5, .49, .41, .41, .04, b, 18);
        for (let i = 0; i < 12; i++) { const an = i * TAU / 12; ball(Math.sin(an) * .33, .5 + Math.cos(an) * .33, .55, .02, .02, .015, c, 8); }
        box(0, .63, .57, .025, .28, .04, c); box(.1, .5, .57, .23, .025, .04, c); break;
      case 'garland':
        box(0, .87, 0, 1, .035, .12, c); for (let i = 0; i < 7; i++) ball(-.43 + i * .143, .55 - Math.sin(i / 6 * Math.PI) * .18, .06, .06, .23, .16, [a, b, C.mint][i % 3]); break;
      case 'indoor_swing': case 'swing':
        for (const x of [-.43, .43]) { box(x, .56, 0, .025, .88, .04, c); if (template === 'swing') { box(x, .5, -.27, .055, 1, .08, C.wood); box(x, .5, .3, .055, 1, .08, C.wood); } }
        box(0, .16, 0, 1, .11, .8, a, .08); if (template === 'swing') box(0, .98, 0, 1.06, .07, .79, C.wood); break;
      case 'vase': case 'potted_plant': case 'plant': case 'rose_bouquet':
        cyl(0, .2, 0, .3, .35, a, .36, 18); cyl(0, .39, 0, .36, .07, b, .36, 18);
        for (const x of [-.2, 0, .2]) { box(x, .62 + (x ? 0 : .1), 0, .035, .5, .035, C.mint); leaf(x + .08, .61, 0); leaf(x - .04, .73, 0); if (template === 'vase' || template === 'rose_bouquet') { for (let k = 0; k < 5; k++) { const ang = k * TAU / 5; ball(x + Math.cos(ang) * .08, .87 + Math.sin(ang) * .06 + (x ? 0 : .08), .06, .08, .07, .09, template === 'rose_bouquet' ? C.roof : C.pink, 8); } } } break;
      case 'cake': case 'birthday_cake':
        cyl(0, .04, 0, .5, .06, C.white, .5, 20); cyl(0, .32, 0, .44, .48, '#E6C397', .44, 20); cyl(0, .35, 0, .45, .11, a, .45, 20); cyl(0, .58, 0, .45, .09, C.cream, .45, 20);
        if (def.template === 'crafting' || template === 'birthday_cake') { cyl(0, .73, 0, .31, .26, '#E6C397', .31, 18); cyl(0, .73, 0, .32, .075, a, .32, 18); cyl(0, .9, 0, .32, .06, C.cream, .32, 18); }
        for (let i = 0; i < 7; i++) { const an = i * TAU / 7; ball(Math.cos(an) * .35, .62, Math.sin(an) * .35, .06, .07, .06, C.white, 8); }
        for (const x of [-.12, .12]) { ball(x, def.template === 'crafting' || template === 'birthday_cake' ? .98 : .72, 0, .085, .1, .085, a, 10); leaf(x, def.template === 'crafting' || template === 'birthday_cake' ? 1.07 : .81, 0, .08, .02, .05); } break;
      case 'teapot':
        ball(0, .4, 0, .35, .34, .4, a); cyl(0, .76, 0, .25, .06, b); ball(0, .85, 0, .065, .07, .08, c, 8); box(-.36, .61, 0, .26, .13, .18, a); ball(.35, .5, 0, .13, .22, .11, c); ball(.35, .5, .1, .06, .13, .09, b); break;
      case 'books':
        for (let i = 0; i < 3; i++) { box((i % 2 - .5) * .08, .14 + i * .28, 0, .95 - i * .06, .22, .94, [a, C.mint, C.blue][i]); box(0, .16 + i * .28, .48, .81, .12, .035, C.cream); } break;
      case 'candle':
        cyl(0, .035, 0, .44, .06, b); cyl(0, .38, 0, .28, .64, a, .28, 16); box(0, .76, 0, .025, .15, .035, c); ball(0, .88, 0, .1, .14, .11, C.butter, 10); break;
      case 'crystal_ball':
        cyl(0, .13, 0, .4, .23, c, .29, 16); ball(0, .6, 0, .45, .4, .44, C.blue, 18); ball(-.13, .78, .32, .12, .12, .025, C.white, 10); break;
      case 'plush': case 'rabbit_statue': case 'rabbit_lantern':
        ball(0, .32, 0, .3, .33, .31, a); ball(0, .67, .015, .34, .26, .3, b);
        for (const x of [-.16, .16]) { ball(x, .94, 0, .09, .22, .1, b); ball(x, .94, .09, .04, .15, .02, a); ball(x * .7, .7, .3, .018, .025, .02, C.ink, 8); } break;
      case 'tree': case 'christmas_tree':
        cyl(0, .25, 0, .06, .5, C.wood, .05, 10);
        if (template === 'christmas_tree') for (let i = 0; i < 3; i++) cyl(0, .4 + i * .2, 0, .5 - i * .12, .4, C.mint, 0, 20);
        else { ball(0, .68, 0, .49, .32, .48, a); ball(-.25, .66, .03, .25, .24, .26, tint(a, -8)); ball(.19, .83, -.08, .3, .22, .3, tint(a, 8)); }
        for (let i = 0; i < 5; i++) ball((i - 2) * .16, .61 + i % 2 * .17, .34, .055, .045, .05, C.pink, 8); break;
      case 'bush':
        for (const x of [-.28, 0, .28]) ball(x, .45 + (x ? 0 : .18), 0, .25, .36, .46, a); break;
      case 'flowerbed':
        box(0, .24, 0, 1, .4, 1, a, .08); box(0, .46, 0, .91, .06, .84, '#AE8B72'); for (let i = 0; i < 5; i++) { const x = (i - 2) * .18; box(x, .63, 0, .025, .4, .04, C.mint); ball(x, .87 - i % 2 * .08, .02, .1, .1, .16, [b, C.pink, C.butter][i % 3]); } break;
      case 'fence':
        for (let i = 0; i < 4; i++) { const x = -.44 + i * .29; box(x, .5, 0, .12, .9, .5, a); ball(x, .95, 0, .075, .075, .3, b, 8); } for (const yy of [.3, .69]) box(0, yy, .05, 1, .1, .4, b); break;
      case 'mailbox':
        box(0, .32, 0, .12, .65, .15, C.wood); box(0, .8, 0, .85, .38, .9, a, .13); box(0, .82, .47, .6, .03, .02, C.cream); ball(.31, .81, .48, .035, .035, .035, c, 8); break;
      case 'bridge':
        for (let i = 0; i < 7; i++) box(-.43 + i * .143, .19 + Math.sin(i / 6 * Math.PI) * .2, 0, .14, .12, .9, a);
        for (const zz of [-.43, .43]) { for (const xx of [-.46, .46]) box(xx, .44, zz, .065, .8, .1, C.wood); box(0, .79, zz, 1, .08, .08, c); } break;
      case 'slide':
        for (const xx of [-.39, .39]) box(xx, .55, -.34, .06, 1, .1, c); box(0, .96, -.31, .94, .12, .35, a);
        g.box(pos(0, .5, .08), [.83 * w, .09 * h, 1.15 * d], a, Math.min(w, h, d) * .04, [-Math.atan2(.87 * h, .9 * d), 0, 0]);
        for (let i = 0; i < 4; i++) box(0, .1 + i * .22, -.4, .7, .045, .15, b); break;
      case 'fountain':
        cyl(0, .09, 0, .5, .17, a, .5, 20); cyl(0, .18, 0, .43, .04, C.blue, .43, 20); cyl(0, .43, 0, .08, .56, b); cyl(0, .67, 0, .3, .08, a, .38, 20); ball(0, .87, 0, .08, .13, .1, C.blue); break;
      case 'windmill':
        cyl(0, .36, 0, .22, .65, b, .16, 16); g.roof(pos(0, .65, 0), .58 * w, .56 * d, .23 * h, a);
        for (let i = 0; i < 4; i++) { const an = i * Math.PI / 2 + .3; g.box(pos(Math.sin(an) * .23, .76 + Math.cos(an) * .17, .42), [.13 * w, .36 * h, .08 * d], a, Math.min(w, h, d) * .03, [0, 0, -an]); } ball(0, .76, .44, .09, .065, .06, c); break;
      case 'mushroom_lamp':
        cyl(0, .25, 0, .18, .5, b, .15, 14); ball(0, .7, 0, .5, .27, .48, a, 18); for (const x of [-.25, .15]) ball(x, .87, .05, .09, .04, .11, C.white, 8); break;
      case 'flower_arch':
        for (const xx of [-.43, .43]) { box(xx, .43, 0, .07, .85, .16, C.wood); for (let i = 0; i < 4; i++) { leaf(xx, .16 + i * .21, .08, .11, .045, .13); ball(xx, .23 + i * .21, .1, .07, .055, .1, C.pink, 8); } }
        for (let i = 0; i < 7; i++) { const an = i * Math.PI / 6; ball(Math.cos(an) * .43, .8 + Math.sin(an) * .18, 0, .12, .05, .15, i % 2 ? b : C.pink, 8); } break;
      case 'stone_lantern':
        box(0, .13, 0, .68, .2, .74, a); box(0, .4, 0, .2, .42, .3, a); box(0, .68, 0, .56, .32, .6, b); box(0, .68, .32, .28, .2, .04, C.butter); g.roof(pos(0, .84, 0), .85 * w, .9 * d, .16 * h, a); break;
      case 'balloon_stall': case 'color_balloons': case 'heart_balloon':
        if (template === 'balloon_stall') { box(0, .23, 0, .8, .32, .8, a); for (const xx of [-.3, .3]) ball(xx, .08, .36, .1, .08, .09, c, 10); }
        for (let i = 0; i < (template === 'heart_balloon' ? 2 : 5); i++) { const x = (i % 3 - 1) * .27, yy = .63 + (i % 2) * .17; box(x * .5, .36, 0, .012, .55, .018, c); ball(x, yy, 0, .16, .21, .18, [a, C.pink, C.butter, C.blue, C.mint][i], 12); } break;
      case 'pumpkin_lantern':
        for (const x of [-.24, 0, .24]) ball(x, .45, 0, .24, .39, .45, x ? tint(a, -12) : a, 14); cyl(0, .9, 0, .05, .17, C.mint); for (const xx of [-.16, .16]) ball(xx, .54, .44, .055, .065, .025, C.butter, 8); box(0, .31, .44, .28, .045, .035, C.ink); break;
      case 'lantern':
        cyl(0, .9, 0, .025, .2, c); ball(0, .57, 0, .48, .31, .46, C.roof, 18); for (const yy of [.24, .88]) cyl(0, yy, 0, .3, .055, C.butter, .3, 16); for (const xx of [-.07, 0, .07]) box(xx, .11, 0, .025, .23, .05, C.roof); break;
      case 'friendly_ghost':
        ball(0, .53, 0, .43, .43, .42, b); for (const xx of [-.28, 0, .28]) ball(xx, .2, 0, .16, .12, .32, b); for (const xx of [-.13, .13]) ball(xx, .63, .4, .04, .04, .03, C.ink, 8); break;
      case 'snowman':
        ball(0, .28, 0, .46, .3, .45, C.white, 18); ball(0, .66, 0, .3, .24, .3, C.white, 16); box(0, .48, 0, .67, .09, .7, C.roof); for (const xx of [-.1, .1]) ball(xx, .72, .29, .025, .025, .02, C.ink, 8); cyl(0, .88, 0, .35, .045, a); cyl(0, .95, 0, .23, .13, a); break;
      case 'birthday_hat': case 'birthday_crown':
        cyl(0, .32, 0, .48, .57, C.butter, template === 'birthday_hat' ? 0 : .48, 16); if (template === 'birthday_crown') for (let i = 0; i < 5; i++) { const an = i * TAU / 5; cyl(Math.cos(an) * .4, .76, Math.sin(an) * .4, .1, .4, C.butter, 0, 8); ball(Math.cos(an) * .4, .98, Math.sin(an) * .4, .07, .05, .07, C.pink, 8); } else ball(0, .68, 0, .08, .09, .08, C.pink); break;
      case 'couplets': case 'fu': case 'red_envelope': case 'stocking':
        box(0, .49, 0, .89, .95, .8, C.roof); box(0, .64, .43, .63, .065, .04, C.butter); box(0, .4, .43, .07, .43, .04, C.butter); if (template === 'stocking') ball(.2, .17, 0, .32, .17, .45, C.roof); break;
      case 'mooncake_box':
        box(0, .22, 0, 1, .4, 1, a); for (const xx of [-.22, .22]) for (const zz of [-.23, .23]) { cyl(xx, .61, zz, .18, .3, '#DFB37F', .18, 14); box(xx, .78, zz, .16, .02, .05, C.butter); } break;
      case 'carousel':
        cyl(0, .09, 0, .5, .13, a, .5, 18); cyl(0, .5, 0, .045, .82, c); for (const xx of [-.28, .28]) { cyl(xx, .48, 0, .02, .68, c); ball(xx, .43, 0, .16, .11, .2, b); ball(xx + .1, .55, -.03, .07, .12, .07, b); } g.roof(pos(0, .78, 0), w, d, h * .22, a); break;
      default:
        // 新增内容使用与类别相符的可辨认轮廓，待扩展模板仍保留真实颜色/尺寸和ID。
        if (def.category === 'plant') return furniture(g, Object.assign({}, def, { template: 'potted_plant' }), item, p, size);
        if (def.place === 'wall') { box(0, .5, 0, 1, 1, 1, a); box(0, .5, .52, .74, .7, .06, b); ball(0, .5, .57, .18, .2, .02, c); }
        else { legs(.16); box(0, .46, 0, .9, .61, .86, a, .12); box(0, .8, 0, 1, .12, 1, b); drawer(.45, .25); } break;
    }
    return true;
  }

  const EGGY_BODY_BY_HAIR = {
    twin_tails: '#FF9EBB', ponytail: '#FFE169', buns: '#FFC2D1', curls: '#CDB4DB',
    princess_braid: '#A2D2FF', pigtail_braid: '#A2D2FF', bob: '#A8E6CF', short: '#FFBE98',
    side_swept: '#FDE2E4', long_straight: '#FDE2E4'
  };
  const EGGY_BODY_BY_COLOR = {
    '#D998AE': '#FF9EBB', '#FF9EBB': '#FF9EBB',
    '#D8B77A': '#FFE169', '#FFE169': '#FFE169',
    '#E5C4B1': '#FFC2D1', '#FFC2D1': '#FFC2D1',
    '#B497CC': '#CDB4DB', '#CDB4DB': '#CDB4DB',
    '#8EBBA8': '#A8E6CF', '#A8E6CF': '#A8E6CF',
    '#859DC6': '#A2D2FF', '#A2D2FF': '#A2D2FF',
    '#C77362': '#FFBE98', '#FFBE98': '#FFBE98',
    '#B77D50': '#E6CCB2', '#E6CCB2': '#E6CCB2',
    '#F2D8A6': '#FFE169', '#BDB9CE': '#FDE2E4',
    '#8B5A3C': '#FFAEC9', '#3D3545': '#B8C0FF'
  };
  function eggyBodyColor(hair, hairColor) {
    const upper = String(hairColor || '').toUpperCase();
    if (EGGY_BODY_BY_COLOR[upper]) return EGGY_BODY_BY_COLOR[upper];
    if (/^#[0-9A-F]{6}$/i.test(upper)) return upper;
    return EGGY_BODY_BY_HAIR[hair] || '#FF9EBB';
  }

  function human(g, x, z, s, avatar, y, options) {
    const look = avatar || {}, skinMeta = G.data?.avatarSkins?.find(row => row.id === look.skin);
    const dress = G.data?.outfitById?.[look.dress], top = G.data?.outfitById?.[look.top], bottom = G.data?.outfitById?.[look.bottom], shoe = G.data?.outfitById?.[look.shoes];
    const accessories = (Array.isArray(look.acc) ? look.acc : []).map(id => G.data?.outfitById?.[id]).filter(Boolean), bow = accessories.find(row => row.shape === 'bow');
    const p = { id: null, name: null, skin: validColor(skinMeta?.color, '#FFF1E7'), skinIndex: Number(look.skin) || 0, hair: look.hair || 'twin_tails', hairColor: validColor(look.hairColor, '#8B5A3C'), face: look.face || 'smile', dress: !!dress, bow: !!bow, accent: validColor(bow?.color, '#FF4D79') };
    const clothing = { shirt: validColor(top?.color, '#FFF5DF'), cloud: validColor(top?.accent, '#A8C5D8'), shorts: validColor(bottom?.color, '#E7D7BD'), dress: validColor(dress?.color, '#ECB9CC'), trim: validColor((dress || top)?.accent, '#FFF0D7'), shoes: validColor(shoe?.color, '#FF759F'), strap: validColor(shoe?.accent, '#F6D5D2'), bow: validColor(bow?.color, '#CB8797') };
    const scale = Number.isFinite(s) && s > 0 ? s : 1;
    y = Number.isFinite(y) ? y : 0; options = options || {};
    const hair = p.hairColor, skin = p.skin, skinLight = tint(skin, 12), ink = '#362028';
    const bodyColor = eggyBodyColor(p.hair, hair);
    const shirt = validColor(options.shirtColor, p.dress ? clothing.dress : clothing.shirt);
    const accessory = validColor(options.accessoryColor, clothing.bow);
    const pos = (a, b, c) => [x + a * scale, y + b * scale, z + c * scale];
    const size = (a, b, c) => [a * scale, b * scale, c * scale];
    const ball = (a, b, c, rx, ry, rz, color, segments = 14, rings = 10) => g.sphere(pos(a, b, c), size(rx, ry, rz), color, segments, rings);
    const box = (a, b, c, w, h, d, color, r = .04, rotation) => g.box(pos(a, b, c), size(w, h, d), color, r * scale, rotation);
    const cylinder = (a, b, c, r, h, color, topR, seg = 16, rotation) => g.cylinder(pos(a, b, c), r * scale, h * scale, color, topR == null ? undefined : topR * scale, seg, rotation);

    // 1. 接地阴影与圆润Q弹小胖脚鞋（y < 0.27）
    ball(0, .025, 0, .44, .018, .36, '#D8B4C8', 18, 6);
    for (const side of [-1, 1]) {
      if (shoe?.shape === 'boots' || shoe?.shape === 'rainboots') cylinder(side * .21, .20, .04, .125, .10, clothing.shoes, .13, 14);
      ball(side * .21, .13, .05, .148, .115, .195, clothing.shoes, 16, 10);
      ball(side * .21, .08, .055, .152, .045, .198, '#FFFFFF', 14, 8);
      box(side * .21, .17, .12, .18, .034, .055, clothing.strap, .016);
      ball(side * .21 - side * .025, .185, .155, .026, .02, .014, clothing.trim, 8, 5);
    }

    // 2. 一头身圆滚滚Q弹蛋型机身 + 背后毛茸茸圆尾
    ball(0, .80, 0, .54, .58, .49, bodyColor, 26, 16);
    ball(0, .58, 0, .56, .40, .50, bodyColor, 24, 14);
    ball(0, .44, -.49, .12, .12, .11, '#FFFFFF', 12, 8);
    ball(0, .52, -.49, .04, .04, .025, hair, 8, 5);

    // 3. 奶油白嫩脸蛋窗（保留 [0, 1.19, .015] 半径 .31 的浅肤色球体契约）与圆肚肚贴片
    ball(0, 1.19, .015, .31, .21, .24, skin, 16, 10);
    ball(0, .88, .18, .42, .35, .36, skin, 24, 16);
    ball(-.08, 1.05, .44, .12, .06, .025, skinLight, 10, 6);

    if (p.dress) {
      ball(0, .47, .24, .32, .22, .29, shirt, 18, 12);
      ball(0, .35, .22, .33, .10, .28, clothing.trim, 16, 8);
    } else {
      ball(0, .51, .24, .31, .19, .29, shirt, 18, 12);
      ball(0, .38, .22, .32, .14, .28, clothing.shorts, 18, 10);
      ball(0, .44, .27, .30, .045, .26, clothing.trim, 14, 8);
    }

    // 领口立体胸章（云朵 / 星星 / 草莓 / 水手结 / 经典蝴蝶结）
    const pat = (dress || top)?.pattern || (p.dress ? 'bow' : 'cloud');
    if (pat === 'cloud') {
      ball(-.06, .645, .495, .055, .042, .03, clothing.cloud, 10, 6);
      ball(0, .66, .502, .07, .055, .032, clothing.trim, 10, 6);
      ball(.06, .645, .495, .055, .042, .03, clothing.cloud, 10, 6);
    } else if (pat === 'star' || pat === 'moon') {
      ball(0, .65, .502, .065, .065, .032, clothing.cloud, 10, 8);
      ball(-.09, .65, .49, .035, .035, .025, accessory, 8, 6);
      ball(.09, .65, .49, .035, .035, .025, accessory, 8, 6);
    } else if (pat === 'berry' || pat === 'flower' || pat === 'petals') {
      ball(0, .645, .502, .062, .068, .035, '#FF4D79', 10, 8);
      ball(0, .695, .498, .055, .025, .025, '#95D5B2', 8, 6);
    } else if (pat === 'stripe' || (dress || top)?.shape === 'sailor') {
      ball(-.09, .66, .485, .09, .032, .03, clothing.cloud, 10, 6);
      ball(.09, .66, .485, .09, .032, .03, clothing.cloud, 10, 6);
      ball(0, .63, .505, .045, .065, .03, '#FF4D79', 8, 6);
    } else {
      ball(-.075, .65, .495, .075, .048, .035, accessory, 10, 8);
      ball(.075, .65, .495, .075, .048, .035, accessory, 10, 8);
      ball(0, .65, .51, .038, .038, .03, clothing.trim, 8, 6);
    }

    // 4. 左右Q弹小短手（0.38 <= y < 0.88）
    for (const side of [-1, 1]) {
      ball(side * .53, .73, .05, .095, .075, .10, shirt, 12, 8);
      ball(side * .55, .66, .06, .105, .17, .115, bodyColor, 14, 10);
      ball(side * .57, .54, .07, .088, .09, .095, skin, 12, 8);
    }

    // 5. 8款头顶Q弹萌耳/揪揪（y > 1.0，顶端 > 1.52）
    if (p.hair === 'twin_tails' || p.hair === 'ponytail') {
      cylinder(0, 1.43, 0, .038, .16, bodyColor, .032, 12);
      ball(0, 1.55, 0, .098, .095, .098, bodyColor, 14, 10);
      if (p.hair === 'twin_tails') {
        ball(-.11, 1.35, .12, .10, .065, .05, accessory, 10, 8);
        ball(.11, 1.35, .12, .10, .065, .05, accessory, 10, 8);
        ball(0, 1.35, .14, .048, .048, .04, '#FFFDF5', 8, 6);
      } else {
        ball(0, 1.35, 0, .075, .035, .075, '#FFFDF5', 10, 6);
      }
    } else if (p.hair === 'buns') {
      for (const side of [-1, 1]) {
        ball(side * .21, 1.46, 0, .11, .22, .075, bodyColor, 14, 10);
        ball(side * .21, 1.45, .05, .065, .16, .035, '#FFF0F5', 10, 8);
      }
    } else if (p.hair === 'curls') {
      for (const side of [-1, 1]) {
        ball(side * .33, 1.30, .02, .14, .14, .09, bodyColor, 14, 10);
        ball(side * .33, 1.30, .08, .08, .08, .04, '#FAF5FF', 10, 8);
      }
      cylinder(0, 1.42, 0, .032, .12, bodyColor, .026, 10);
      ball(0, 1.51, 0, .075, .072, .075, bodyColor, 12, 8);
    } else if (p.hair === 'princess_braid' || p.hair === 'pigtail_braid') {
      for (const side of [-1, 1]) {
        ball(side * .34, 1.29, 0, .15, .15, .15, '#FFFFFF', 14, 10);
        ball(side * .27, 1.21, .10, .07, .045, .045, accessory, 8, 6);
        if (p.hair === 'pigtail_braid') ball(side * .41, 1.16, .02, .09, .09, .09, '#FFFFFF', 10, 8);
      }
      ball(0, 1.48, .02, .09, .075, .08, '#FFFFFF', 12, 8);
    } else if (p.hair === 'bob') {
      for (const side of [-1, 1]) {
        cylinder(side * .30, 1.33, .02, .135, .18, bodyColor, .022, 14);
        ball(side * .30, 1.30, .075, .062, .075, .03, '#FF9EBB', 10, 8);
      }
      cylinder(0, 1.42, 0, .03, .12, bodyColor, .024, 10);
      ball(0, 1.50, 0, .068, .065, .068, bodyColor, 12, 8);
    } else if (p.hair === 'short') {
      for (const side of [-1, 1]) {
        ball(side * .30, 1.35, .03, .11, .18, .08, bodyColor, 14, 10);
        ball(side * .30, 1.34, .08, .06, .11, .035, '#FFFDF7', 10, 8);
        ball(side * .12, 1.03, .475, .036, .022, .015, '#FFFFFF', 8, 6);
      }
    } else {
      for (const side of [-1, 1]) {
        ball(side * .38, 1.20, .02, .15, .15, .14, '#FFFDF9', 14, 10);
        ball(side * .44, 1.12, .06, .10, .10, .10, '#FFE5EC', 12, 8);
        if (p.hair === 'long_straight') ball(side * .40, .98, -.04, .11, .11, .11, '#FFFDF9', 10, 8);
      }
      ball(0, 1.45, .02, .13, .10, .11, '#FFFDF9', 14, 10);
    }

    // 6. 头饰、眼镜、背后小翅膀与斜挎包
    if (p.bow && p.hair !== 'twin_tails') {
      const bx = p.hair === 'princess_braid' ? .26 : -.25, by = 1.38;
      for (const side of [-1, 1]) ball(bx + side * .075, by, .15, .085, .058, .04, accessory, 10, 6);
      ball(bx, by, .18, .035, .042, .028, tint(accessory, 18), 8, 5);
    }
    accessories.forEach(acc => {
      if (acc.shape === 'bow') return;
      const color = validColor(acc.color, C.pink), detail = validColor(acc.accent, C.cream);
      if (acc.slot === 'back') {
        for (const side of [-1, 1]) {
          ball(side * .42, .84, -.42, .22, .14, .05, color, 12, 8);
          ball(side * .35, .68, -.42, .16, .10, .05, detail, 10, 8);
        }
      } else if (acc.slot === 'bag') {
        ball(.49, .54, .22, .12, .11, .09, color, 12, 8);
        ball(.49, .63, .23, .06, .035, .045, detail, 8, 6);
      } else if (acc.shape === 'glasses' || acc.shape === 'heartglasses' || acc.shape === 'stickers') {
        for (const side of [-1, 1]) {
          ball(side * .155, .91, .535, .088, .068, .018, color, 12, 8);
          ball(side * .155, .91, .544, .064, .046, .015, detail, 10, 6);
        }
        box(0, .91, .54, .06, .016, .015, color, .004);
      } else if (acc.shape === 'bunny') {
        for (const side of [-1, 1]) {
          ball(side * .16, 1.63, .01, .08, .24, .065, color);
          ball(side * .16, 1.64, .068, .035, .17, .018, detail);
        }
      } else if (acc.shape === 'crown') {
        cylinder(0, 1.45, .08, .14, .09, color, .17, 16);
        ball(0, 1.51, .21, .035, .035, .028, detail, 8, 6);
      } else if (acc.shape === 'straw' || acc.shape === 'beret') {
        cylinder(0, 1.43, -.01, .38, .065, color, .38, 20);
        ball(0, 1.50, -.03, .28, .12, .26, color, 16, 10);
        box(0, 1.47, .24, .32, .038, .045, detail, .015);
      } else {
        for (let i = 0; i < 5; i++) {
          const angle = i * TAU / 5;
          ball(-.24 + Math.cos(angle) * .055, 1.36 + Math.sin(angle) * .055, .18, .046, .045, .025, color, 8, 5);
        }
        ball(-.24, 1.36, .205, .024, .024, .018, detail, 8, 5);
      }
    });

    // 7. 灵动大眼、双高光、蜜桃腮红与w微笑猫嘴（无人类凸鼻）
    const eyeY = p.face === 'shy' ? .89 : .91, eyeZ = .515;
    function eye(cx, closed) {
      if (closed) {
        for (let i = -2; i <= 2; i++) {
          const tArc = i / 2;
          ball(cx + tArc * .05, eyeY + (1 - tArc * tArc) * .03, eyeZ + .01, .021, .019, .015, ink, 8, 6);
        }
      } else {
        const rScale = p.face === 'surprise' ? 1.12 : 1;
        ball(cx, eyeY, eyeZ, .055 * rScale, .070 * rScale, .028, ink, 14, 10);
        ball(cx - .018, eyeY + .023, eyeZ + .023, .021, .023, .012, '#FFFFFF', 8, 6);
        ball(cx + .015, eyeY - .021, eyeZ + .021, .011, .011, .010, '#FFFFFF', 6, 6);
      }
    }
    eye(-.155, p.face === 'cheer');
    eye(.155, p.face === 'cheer' || p.face === 'wink');
    for (const side of [-1, 1]) {
      ball(side * .255, .82, .455, p.face === 'shy' ? .085 : .074, .042, .025, '#FF7597', 12, 8);
      ball(side * .028, .825, .528, .025, .016, .014, '#D9536F', 8, 6);
    }
    if (p.face === 'surprise' || p.face === 'cheer') {
      ball(0, .81, .525, .044, p.face === 'surprise' ? .042 : .032, .018, '#E85D75', 10, 8);
      ball(0, .802, .533, .028, .02, .014, '#FF9EBB', 8, 6);
    } else if (p.face === 'calm') {
      ball(0, .818, .53, .022, .022, .014, '#D9536F', 8, 6);
    }
    return { id: p.id, name: p.name, height: 1.69 * scale, skin: p.skin, hair: p.hair };
  }

  function animal(g, resident, p, s) {
    const a = validColor(resident.color, '#FFF3DE'), accent = validColor(resident.accent, C.pink), species = resident.species || (resident.id === 'nuomi' ? 'rabbit' : 'bear');
    const pos = (x, y, z) => [p[0] + x * s, p[1] + y * s, p[2] + z * s];
    const ball = (x, y, z, rx, ry, rz, color = a, seg = 12) => g.sphere(pos(x, y, z), [rx * s, ry * s, rz * s], color, seg, 8);
    const box = (x, y, z, w, h, d, color = a) => g.box(pos(x, y, z), [w * s, h * s, d * s], color, .025 * s);
    const cyl = (x, y, z, radius, h, color = a, top, rotation) => g.cylinder(pos(x, y, z), radius * s, h * s, color, top == null ? undefined : top * s, 12, rotation);
    ball(0, .025, .02, .34, .018, .24, '#95AE85', 14);
    for (const side of [-1, 1]) ball(side * .145, .09, .06, .13, .095, .18, accent);
    if (species === 'swan') {
      ball(0, .36, 0, .35, .3, .3); cyl(0, .72, .045, .09, .5, a); ball(0, 1.02, .07, .23, .25, .24);
      for (const side of [-1, 1]) ball(side * .28, .48, -.03, .16, .28, .25, C.white);
      ball(0, .99, .31, .1, .05, .14, '#D5A079');
    } else {
      ball(0, .42, 0, species === 'penguin' ? .32 : .3, .36, .26);
      ball(0, .39, .23, .22, .25, .05, species === 'penguin' ? C.cream : tint(a, 10));
      for (const side of [-1, 1]) ball(side * .3, .46, 0, species === 'penguin' ? .11 : .09, .22, .105, species === 'panda' ? accent : a);
      ball(0, .93, .02, .36, .34, .31, a, 18);
    }
    if (species === 'rabbit') for (const side of [-1, 1]) {
      ball(side * .16, 1.37, -.025, .105, .32, .09, a, 14); ball(side * .16, 1.4, .06, .047, .23, .025, accent);
    }
    else if (species === 'fox' || species === 'cat' || species === 'unicorn') for (const side of [-1, 1]) {
      cyl(side * .25, 1.25, -.02, .14, .32, a, .02, [0, 0, -side * .17]); ball(side * .25, 1.24, .08, .055, .1, .025, accent);
    }
    else if (species === 'deer') {
      for (const side of [-1, 1]) {
        ball(side * .29, 1.24, -.04, .16, .08, .08, a); cyl(side * .2, 1.4, -.07, .035, .42, accent);
        cyl(side * .26, 1.43, -.07, .026, .24, accent, .018, [0, 0, -side * .6]); cyl(side * .15, 1.5, -.07, .025, .2, accent, .018, [0, 0, side * .6]);
      }
    } else if (species === 'penguin') {
      ball(0, 1.18, -.02, .18, .12, .19, accent); ball(0, .84, .31, .13, .065, .12, '#E8C389');
    } else if (species === 'swan') {
      ball(0, 1.25, .03, .045, .12, .06, accent);
    } else for (const side of [-1, 1]) {
      ball(side * .265, 1.21, -.035, species === 'hamster' ? .105 : .13, .13, .095, species === 'panda' ? accent : a);
      if (species !== 'panda') ball(side * .265, 1.21, .05, .07, .07, .025, accent);
    }
    if (species === 'sheep') {
      for (let i = 0; i < 9; i++) { const an = i * TAU / 9; ball(Math.cos(an) * .29, 1.04 + Math.sin(an) * .27, -.05, .15, .14, .14, C.cream); }
      for (const side of [-1, 1]) ball(side * .31, .92, .02, .13, .14, .15, accent);
    } else if (species === 'squirrel') {
      ball(.31, .45, -.24, .26, .39, .24, accent, 16); ball(.34, .68, -.29, .22, .22, .19, a, 14);
    } else if (species === 'fox' || species === 'cat') {
      ball(.3, .3, -.17, .28, .12, .14, accent); ball(.48, .35, -.2, .15, .13, .13, species === 'fox' ? C.cream : a);
    } else if (species === 'unicorn') {
      cyl(0, 1.41, .03, .075, .37, C.butter, 0); for (let i = 0; i < 4; i++) ball(-.29, 1.14 - i * .12, -.05, .1, .1, .1, [accent, C.pink, C.blue, C.butter][i]);
      ball(.3, .25, -.2, .15, .23, .11, accent);
    }
    const faceY = species === 'swan' ? 1.035 : .97, faceZ = species === 'swan' ? .29 : .315;
    for (const side of [-1, 1]) {
      if (species === 'panda') ball(side * .115, faceY, .302, .085, .095, .025, accent);
      ball(side * .115, faceY, faceZ, .025, .034, .02, '#604A51', 10);
      ball(side * .115 - .007, faceY + .012, faceZ + .018, .008, .009, .005, C.white, 8);
      ball(side * .21, faceY - .105, faceZ - .035, species === 'hamster' ? .1 : .06, .032, .02, species === 'hamster' ? C.cream : C.pink, 10);
    }
    if (species !== 'penguin' && species !== 'swan') {
      ball(0, faceY - .07, faceZ + .015, .026, .02, .03, accent, 8);
      for (const side of [-1, 1]) ball(side * .025, faceY - .125, faceZ - .01, .023, .012, .012, C.ink, 8);
    }
    if (resident.id === 'nuomi') {
      // 引导员糯米的红色围巾与普通入住兔居民区分。
      box(0, .64, .02, .55, .09, .5, C.roof); box(.17, .53, .25, .11, .25, .04, C.roof);
    } else box(0, .63, .245, .2, .075, .035, accent);
    return { height: (species === 'rabbit' ? 1.7 : species === 'deer' ? 1.64 : species === 'unicorn' ? 1.6 : 1.36) * s, species };
  }
  function character(g, avatar, p, scale = 1, residentDef) {
    if (!p) return null;
    if (residentDef) return animal(g, residentDef, p, scale);
    return human(g, p[0], p[2], scale, avatar, p[1], {});
  }
  return { furniture, character, tree, flower, island, cloud };
}
