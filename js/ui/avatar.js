/* 衣橱与形象面板：支持360°拖拽旋转与4大Q弹动作的3D萌物换装舞台 + 圆滚滚萌物专属换装槽。 */
(function (G) {
  'use strict';
  G.ui = G.ui || {};

  const TAU = Math.PI * 2;

  // 8 大圆滚滚可爱卡通蛋仔预设
  const PRESETS = [
    {
      id: 'preset_sunny', name: '🍓 草莓团团',
      hairColor: '#D998AE', bodyColor: '#FF9EBB', faceColor: '#FFF6F0', blush: '#FF6B92',
      ears: 'twin_tails', face: 'smile',
      outfitKey: 'dress_pink', shoesKey: 'shoes_mary', accKeys: ['bow_red']
    },
    {
      id: 'preset_pony', name: '🍋 奶黄布丁',
      hairColor: '#D8B77A', bodyColor: '#FFE169', faceColor: '#FFF7EC', blush: '#FF85A1',
      ears: 'ponytail', face: 'cheer',
      outfitKey: 'set_cloud', shoesKey: 'shoes_sneaker', accKeys: ['acc_star']
    },
    {
      id: 'preset_bun', name: '🐰 蜜桃兔兔',
      hairColor: '#E5C4B1', bodyColor: '#FFC2D1', faceColor: '#FFF8F4', blush: '#FF759F',
      ears: 'buns', face: 'calm',
      outfitKey: 'dress_cloud', shoesKey: 'shoes_ballet', accKeys: ['acc_flower']
    },
    {
      id: 'preset_curl', name: '🧸 奶咖小熊',
      hairColor: '#B77D50', bodyColor: '#E6CCB2', faceColor: '#FFF7F0', blush: '#FF8FA3',
      ears: 'curls', face: 'wink',
      outfitKey: 'set_overalls', shoesKey: 'shoes_boots', accKeys: ['bow_red', 'acc_teddy']
    },
    {
      id: 'preset_braid', name: '🫐 香芋星宝',
      hairColor: '#B497CC', bodyColor: '#CDB4DB', faceColor: '#FFF7F5', blush: '#FF85A1',
      ears: 'princess_braid', face: 'shy',
      outfitKey: 'dress_lavender', shoesKey: 'shoes_mary', accKeys: ['acc_crown', 'acc_wings']
    },
    {
      id: 'preset_bob', name: '🍵 薄荷喵喵',
      hairColor: '#8EBBA8', bodyColor: '#A8E6CF', faceColor: '#FFF8F2', blush: '#FF8FA3',
      ears: 'bob', face: 'surprise',
      outfitKey: 'dress_blue', shoesKey: 'shoes_fluffy', accKeys: ['acc_beret']
    },
    {
      id: 'preset_short', name: '🍊 蜜柑柴柴',
      hairColor: '#C77362', bodyColor: '#FFBE98', faceColor: '#FFF8F0', blush: '#FF7597',
      ears: 'short', face: 'smile',
      outfitKey: 'dress_rain', shoesKey: 'shoes_rain', accKeys: ['acc_flower']
    },
    {
      id: 'preset_taro', name: '☁️ 云朵羊羊',
      hairColor: '#859DC6', bodyColor: '#A2D2FF', faceColor: '#FFF9F5', blush: '#FF8FA3',
      ears: 'side_swept', face: 'cheer',
      outfitKey: 'dress_pink', shoesKey: 'shoes_fluffy', accKeys: ['acc_heartglasses', 'acc_bag']
    }
  ];

  // 萌物换装槽位数据定义
  const EAR_STYLES = [
    { id: 'twin_tails', name: '🍓 双团呆毛' },
    { id: 'ponytail', name: '🍮 Q弹布丁揪' },
    { id: 'buns', name: '🐰 长垂耳兔' },
    { id: 'curls', name: '🧸 圆圆小熊耳' },
    { id: 'princess_braid', name: '🌙 星月软角' },
    { id: 'bob', name: '🐱 软萌猫咪耳' },
    { id: 'short', name: '🐶 元气柴柴耳' },
    { id: 'side_swept', name: '☁️ 蓬蓬云朵耳' }
  ];

  // 糖果机身颜色：使用合法的发色ID与马卡龙高饱和展示色映射
  const BODY_COLORS = [
    { id: '#D998AE', hex: '#FF9EBB', name: '草莓粉' },
    { id: '#D8B77A', hex: '#FFE169', name: '布丁黄' },
    { id: '#E5C4B1', hex: '#FFC2D1', name: '水蜜桃' },
    { id: '#B497CC', hex: '#CDB4DB', name: '香芋紫' },
    { id: '#8EBBA8', hex: '#A8E6CF', name: '薄荷绿' },
    { id: '#859DC6', hex: '#A2D2FF', name: '云朵蓝' },
    { id: '#C77362', hex: '#FFBE98', name: '蜜柑橘' },
    { id: '#B77D50', hex: '#E6CCB2', name: '奶咖杏' }
  ];

  const COLOR_MAP = {
    '#D998AE': '#FF9EBB',
    '#D8B77A': '#FFE169',
    '#E5C4B1': '#FFC2D1',
    '#B497CC': '#CDB4DB',
    '#8EBBA8': '#A8E6CF',
    '#859DC6': '#A2D2FF',
    '#C77362': '#FFBE98',
    '#B77D50': '#E6CCB2',
    '#8B5A3C': '#E6CCB2',
    '#3D3545': '#CDB4DB',
    '#F2D8A6': '#FFE169',
    '#BDB9CE': '#A2D2FF'
  };

  const OUTFITS = {
    none: { id: 'none', name: '🥚 原味奶油肚皮', type: 'belly', col: '#FFFFFF', trim: '#FF4D79' },
    dress_pink: { id: 'dress_pink', name: '🍓 草莓蕾丝裙圈', type: 'tutu', col: '#FF6B96', trim: '#FFF5E8', motif: 'bow' },
    dress_cloud: { id: 'dress_cloud', name: '☁️ 云朵蓬蓬裙圈', type: 'tutu', col: '#BDE0FE', trim: '#FFFFFF', motif: 'cloud' },
    dress_lavender: { id: 'dress_lavender', name: '🪻 星河花瓣裙圈', type: 'tutu', col: '#B892FF', trim: '#FFF0F6', motif: 'star' },
    dress_blue: { id: 'dress_blue', name: '⚓ 海盐水手领巾', type: 'sailor', col: '#72EFDD', trim: '#FFFDF7', motif: 'sailor' },
    dress_rain: { id: 'dress_rain', name: '🍋 波点小斗篷', type: 'cape', col: '#FFD166', trim: '#FFFFFF', motif: 'flower' },
    set_overalls: { id: 'bottom_pants', name: '👖 小熊背带裤兜', type: 'overalls', col: '#95D5B2', trim: '#FFE169', motif: 'bear' },
    set_cloud: { id: 'top_cloud', name: '👕 云朵贴花小围兜', type: 'bib', col: '#FFFDF7', trim: '#90E0EF', motif: 'cloud' }
  };

  const SHOES = {
    shoes_mary: { id: 'shoes_mary', name: '👠 草莓小皮鞋', col: '#FF5D8F', sole: '#FFFFFF' },
    shoes_sneaker: { id: 'shoes_sneaker', name: '👟 活力橘脚丫', col: '#FF9F1C', sole: '#FFFFFF' },
    shoes_ballet: { id: 'shoes_ballet', name: '🩰 蜜桃粉脚丫', col: '#FF85A1', sole: '#FFF0F5' },
    shoes_boots: { id: 'shoes_boots', name: '🥾 奶茶小短靴', col: '#B08968', sole: '#FFF8F0' },
    shoes_rain: { id: 'shoes_rain', name: '👢 柠檬黄雨靴', col: '#FFD166', sole: '#FFFFFF' },
    shoes_fluffy: { id: 'shoes_fluffy', name: '🐾 奶油白团脚', col: '#FFFFFF', sole: '#FFC2D1' }
  };

  const ACCESSORIES = [
    { id: 'bow_red', name: '🎀 草莓蝴蝶结', slot: 'head' },
    { id: 'acc_crown', name: '👑 迷你金皇冠', slot: 'head' },
    { id: 'acc_beret', name: '🎨 甜心贝雷帽', slot: 'head' },
    { id: 'acc_flower', name: '🌼 奶油小雏菊', slot: 'head' },
    { id: 'acc_star', name: '⭐ 双星小发卡', slot: 'head' },
    { id: 'acc_heartglasses', name: '🕶️ 粉色爱心镜', slot: 'face' },
    { id: 'acc_wings', name: '🪽 扑腾小翅膀', slot: 'back' },
    { id: 'acc_bag', name: '🍓 草莓斜挎包', slot: 'bag' },
    { id: 'acc_teddy', name: '🧸 小熊斜挎包', slot: 'bag' }
  ];

  // WebGL 3D 辅助类与数学
  function rgb(hex) {
    const n = parseInt((hex || '#ffffff').replace('#', ''), 16);
    return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  function normalize(v) { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / n, v[1] / n, v[2] / n]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function subtract(a, b) { return a.map((n, i) => n - b[i]); }
  function multiply(a, b) {
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
    }
    return out;
  }
  function ortho(l, r, b, t, n, f) {
    return new Float32Array([2 / (r - l), 0, 0, 0, 0, 2 / (t - b), 0, 0, 0, 0, -2 / (f - n), 0, -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1]);
  }
  function lookAt(eye, center) {
    const z = normalize(subtract(eye, center)), x = normalize(cross([0, 1, 0], z)), y = cross(z, x);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -x.reduce((s, n, i) => s + n * eye[i], 0), -y.reduce((s, n, i) => s + n * eye[i], 0), -z.reduce((s, n, i) => s + n * eye[i], 0), 1]);
  }
  function rotatePoint(v, rx, ry, rz) {
    let [x, y, z] = v;
    if (rx) { const c = Math.cos(rx), s = Math.sin(rx); [y, z] = [y * c - z * s, y * s + z * c]; }
    if (ry) { const c = Math.cos(ry), s = Math.sin(ry); [x, z] = [x * c + z * s, -x * s + z * c]; }
    if (rz) { const c = Math.cos(rz), s = Math.sin(rz); [x, y] = [x * c - y * s, x * s + y * c]; }
    return [x, y, z];
  }

  class Geometry {
    // 顶点直接写进可复用的Float32Array（每顶点9个数），省掉每帧上万元素的数组增长和转换。
    constructor() { this.buf = new Float32Array(9 * 24000); this.len = 0; this.stack = []; this.detail = 1; }
    get data() { return this.buf.subarray(0, this.len); }
    reset() { this.len = 0; this.stack.length = 0; }
    // 每帧要建上万个顶点：变换的正余弦在入栈时算一次，顶点内不产生临时数组（否则每帧二十多毫秒，切换形象时明显卡顿）。
    pushTransform(pivot, rx, ry, rz, sx = 1, sy = 1, sz = 1) {
      rx = rx || 0; ry = ry || 0; rz = rz || 0;
      this.stack.push({ pivot, rx, ry, rz, sx, sy, sz, cx: Math.cos(rx), sinX: Math.sin(rx), cy: Math.cos(ry), sinY: Math.sin(ry), cz: Math.cos(rz), sinZ: Math.sin(rz) });
    }
    popTransform() { this.stack.pop(); }
    vertex(p, n, color) {
      let px = p[0], py = p[1], pz = p[2], nx = n[0], ny = n[1], nz = n[2], t;
      for (let i = this.stack.length - 1; i >= 0; i--) {
        const tr = this.stack[i], pv = tr.pivot;
        let x = (px - pv[0]) * tr.sx, y = (py - pv[1]) * tr.sy, z = (pz - pv[2]) * tr.sz, a = nx / tr.sx, b = ny / tr.sy, c = nz / tr.sz;
        if (tr.rx) { t = y * tr.cx - z * tr.sinX; z = y * tr.sinX + z * tr.cx; y = t; t = b * tr.cx - c * tr.sinX; c = b * tr.sinX + c * tr.cx; b = t; }
        if (tr.ry) { t = x * tr.cy + z * tr.sinY; z = -x * tr.sinY + z * tr.cy; x = t; t = a * tr.cy + c * tr.sinY; c = -a * tr.sinY + c * tr.cy; a = t; }
        if (tr.rz) { t = x * tr.cz - y * tr.sinZ; y = x * tr.sinZ + y * tr.cz; x = t; t = a * tr.cz - b * tr.sinZ; b = a * tr.sinZ + b * tr.cz; a = t; }
        px = x + pv[0]; py = y + pv[1]; pz = z + pv[2];
        const len = Math.hypot(a, b, c) || 1; nx = a / len; ny = b / len; nz = c / len;
      }
      if (this.len + 9 > this.buf.length) { const bigger = new Float32Array(this.buf.length * 2); bigger.set(this.buf); this.buf = bigger; }
      const buf = this.buf, at = this.len; buf[at] = px; buf[at + 1] = py; buf[at + 2] = pz; buf[at + 3] = nx; buf[at + 4] = ny; buf[at + 5] = nz; buf[at + 6] = color[0]; buf[at + 7] = color[1]; buf[at + 8] = color[2]; this.len = at + 9;
    }
    triangle(a, b, c, color, normals) {
      let n = null;
      if (!normals) {
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        n = normalize([uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]);
      }
      this.vertex(a, normals ? normals[0] : n, color);
      this.vertex(b, normals ? normals[1] : n, color);
      this.vertex(c, normals ? normals[2] : n, color);
    }
    quad(a, b, c, d, color, normals) {
      this.triangle(a, b, c, color, normals && [normals[0], normals[1], normals[2]]);
      this.triangle(a, c, d, color, normals && [normals[0], normals[2], normals[3]]);
    }
    // detail<1：画面上很小的人物（全家福）用更稀的网格，顶点数约按平方下降。
    sphere(p, s, color, segments = 22, rings = 12) {
      if (this.detail < 1) { segments = Math.max(8, Math.round(segments * this.detail)); rings = Math.max(5, Math.round(rings * this.detail)); }
      const col = rgb(color), points = [];
      for (let j = 0; j <= rings; j++) {
        const v = Math.PI * j / rings;
        const row = [];
        for (let i = 0; i <= segments; i++) {
          const u = TAU * i / segments, n = [Math.sin(v) * Math.cos(u), Math.cos(v), Math.sin(v) * Math.sin(u)];
          row.push({ p: n.map((x, k) => p[k] + x * s[k]), n: normalize(n.map((x, k) => x / s[k])) });
        }
        points.push(row);
      }
      for (let j = 0; j < rings; j++) for (let i = 0; i < segments; i++) {
        const q = [points[j][i], points[j + 1][i], points[j + 1][i + 1], points[j][i + 1]];
        this.quad(...q.map(a => a.p), col, q.map(a => a.n));
      }
    }
    cylinder(p, radius, height, color, topRadius, segments = 22) {
      if (this.detail < 1) segments = Math.max(8, Math.round(segments * this.detail));
      const center = p, r2 = topRadius == null ? radius : topRadius, col = rgb(color);
      for (let i = 0; i < segments; i++) {
        const a = i * TAU / segments, b = (i + 1) * TAU / segments;
        const pa = [center[0] + Math.cos(a) * radius, center[1] - height / 2, center[2] + Math.sin(a) * radius];
        const pb = [center[0] + Math.cos(b) * radius, center[1] - height / 2, center[2] + Math.sin(b) * radius];
        const qa = [center[0] + Math.cos(a) * r2, center[1] + height / 2, center[2] + Math.sin(a) * r2];
        const qb = [center[0] + Math.cos(b) * r2, center[1] + height / 2, center[2] + Math.sin(b) * r2];
        const na = normalize([Math.cos(a), (radius - r2) / height, Math.sin(a)]), nb = normalize([Math.cos(b), (radius - r2) / height, Math.sin(b)]);
        this.quad(pa, qa, qb, pb, col, [na, na, nb, nb]);
        this.triangle([center[0], center[1] + height / 2, center[2]], qb, qa, col, [[0, 1, 0], [0, 1, 0], [0, 1, 0]]);
        this.triangle([center[0], center[1] - height / 2, center[2]], pa, pb, col, [[0, -1, 0], [0, -1, 0], [0, -1, 0]]);
      }
    }
  }

  // 绘制 3D 软陶卡通蛋仔与搭配
  function drawChubbyCartoonCreature(g, x, z, scale, look, baseY, pose) {
    const s = scale || 1;
    const p = pose || {};
    const bobY = (p.bobY || 0) * s;
    const y = (baseY || 0) + bobY;

    const rawBodyCol = look.bodyColor || look.hairColor || '#D998AE';
    const bodyCol = COLOR_MAP[rawBodyCol] || rawBodyCol;
    const faceCol = look.faceColor || '#FFF6F0';
    const blushCol = look.blush || '#FF7096';
    const shoeKey = look.shoesKey || look.shoes || 'shoes_mary';
    const shoe = SHOES[shoeKey] || SHOES.shoes_mary;
    const outfitKey = look.outfitKey || look.dress || (look.bottom === 'bottom_pants' ? 'set_overalls' : (look.top === 'top_cloud' ? 'set_cloud' : 'dress_pink'));
    const outfit = OUTFITS[outfitKey] || OUTFITS.dress_pink;
    const accList = Array.isArray(look.accKeys) ? look.accKeys : (Array.isArray(look.acc) ? look.acc : []);

    const pt = (a, b, c) => [x + a * s, y + b * s, z + c * s];
    const sz = (a, b, c) => [a * s, b * s, c * s];

    // 地面软阴影
    const shScale = Math.max(0.7, 1 - (p.bobY || 0) * 0.9);
    g.sphere([x, (baseY || 0) + 0.02 * s, z], [0.46 * s * shScale, 0.02 * s, 0.38 * s * shScale], '#D8B4C8', 18, 6);

    // 根变换（Q弹拉伸压扁 + 摇摆 + 航向角）
    g.pushTransform([x, y + 0.55 * s, z], 0, p.yaw || 0, p.roll || 0, p.squashX || 1, p.squashY || 1, p.squashZ || 1);

    // 1. 小胖脚 + 鞋子
    for (const side of [-1, 1]) {
      const footRx = side === -1 ? (p.leftLegRx || 0) : (p.rightLegRx || 0);
      const footLift = side === -1 ? (p.leftLegLift || 0) : (p.rightLegLift || 0);
      g.pushTransform(pt(side * 0.21, 0.22 + footLift, 0), footRx, side * 0.08, 0);
      g.sphere(pt(side * 0.21, 0.13 + footLift, 0.05), sz(0.145, 0.115, 0.195), shoe.col, 14, 8);
      g.sphere(pt(side * 0.21, 0.08 + footLift, 0.055), sz(0.148, 0.045, 0.198), shoe.sole, 12, 6);
      if (shoeKey === 'shoes_boots' || shoeKey === 'shoes_rain') {
        g.cylinder(pt(side * 0.21, 0.19 + footLift, 0.02), 0.12 * s, 0.10 * s, shoe.col, 0.125 * s, 12);
      }
      g.popTransform();
    }

    // 2. 一头身圆滚滚蛋仔躯干
    g.sphere(pt(0, 0.66, 0), sz(0.54, 0.56, 0.49), bodyCol, 26, 16);
    g.sphere(pt(0, 0.52, 0), sz(0.56, 0.40, 0.50), bodyCol, 24, 12);

    // 软萌小尾巴
    g.sphere(pt(0, 0.38, -0.50), sz(0.12, 0.12, 0.11), '#FFFFFF', 10, 6);

    // 奶油面部区域
    g.sphere(pt(0, 0.74, 0.18), sz(0.42, 0.35, 0.36), faceCol, 22, 14);

    // 3. 圆肚肚穿搭槽
    if (outfit.type === 'tutu') {
      g.cylinder(pt(0, 0.38, 0), 0.58 * s, 0.18 * s, outfit.col, 0.53 * s, 26);
      g.cylinder(pt(0, 0.29, 0), 0.595 * s, 0.045 * s, outfit.trim, 0.585 * s, 26);
      g.sphere(pt(0, 0.43, 0.24), sz(0.31, 0.18, 0.29), '#FFFFFF', 16, 8);
    } else if (outfit.type === 'overalls') {
      g.sphere(pt(0, 0.44, 0), sz(0.575, 0.32, 0.515), outfit.col, 22, 12);
      g.sphere(pt(0, 0.46, 0.26), sz(0.26, 0.20, 0.28), outfit.col, 14, 8);
      g.sphere(pt(-0.11, 0.53, 0.51), sz(0.042, 0.042, 0.025), outfit.trim, 8, 6);
      g.sphere(pt(0.11, 0.53, 0.51), sz(0.042, 0.042, 0.025), outfit.trim, 8, 6);
    } else if (outfit.type === 'sailor') {
      g.sphere(pt(0, 0.41, 0.24), sz(0.31, 0.21, 0.29), '#FFFFFF', 16, 10);
      g.cylinder(pt(0, 0.54, 0.02), 0.53 * s, 0.08 * s, outfit.col, 0.50 * s, 22);
      g.sphere(pt(0, 0.50, 0.51), sz(0.06, 0.08, 0.03), '#FF4D79', 8, 6);
    } else if (outfit.type === 'cape') {
      g.sphere(pt(0, 0.41, 0.24), sz(0.31, 0.21, 0.29), '#FFFFFF', 16, 10);
      g.cylinder(pt(0, 0.50, 0), 0.58 * s, 0.16 * s, outfit.col, 0.51 * s, 22);
    } else {
      g.sphere(pt(0, 0.41, 0.24), sz(0.32, 0.22, 0.29), outfit.col, 16, 10);
    }

    // 胸前小饰物
    if (outfit.motif === 'cloud') {
      g.sphere(pt(-0.07, 0.52, 0.50), sz(0.06, 0.048, 0.03), outfit.trim, 8, 6);
      g.sphere(pt(0, 0.54, 0.505), sz(0.075, 0.06, 0.03), outfit.trim, 8, 6);
      g.sphere(pt(0.07, 0.52, 0.50), sz(0.06, 0.048, 0.03), outfit.trim, 8, 6);
    } else {
      g.sphere(pt(-0.075, 0.53, 0.495), sz(0.075, 0.048, 0.035), '#FF4D79', 8, 6);
      g.sphere(pt(0.075, 0.53, 0.495), sz(0.075, 0.048, 0.035), '#FF4D79', 8, 6);
      g.sphere(pt(0, 0.53, 0.51), sz(0.038, 0.038, 0.03), '#FFF5E0', 6, 6);
    }

    // 4. 水汪汪大眼睛与表情
    const eyeY = 0.77, eyeZ = 0.515;
    const isHappy = look.face === 'cheer' || Boolean(p.happyEye);
    const isBlink = Boolean(p.blink);

    for (const side of [-1, 1]) {
      const ex = side * 0.155;
      const winkRight = look.face === 'wink' && side === 1;
      if (isHappy || isBlink || winkRight) {
        for (let i = -2; i <= 2; i++) {
          const tArc = i / 2;
          g.sphere(pt(ex + tArc * 0.052, eyeY + (1 - tArc * tArc) * 0.032, eyeZ + 0.01), sz(0.022, 0.020, 0.015), '#3B232A', 6, 4);
        }
      } else {
        const rScale = look.face === 'surprise' ? 1.15 : 1.0;
        g.sphere(pt(ex, eyeY, eyeZ), sz(0.056 * rScale, 0.072 * rScale, 0.028), '#362028', 12, 8);
        g.sphere(pt(ex - 0.018, eyeY + 0.024, eyeZ + 0.024), sz(0.022, 0.024, 0.012), '#FFFFFF', 6, 6);
        g.sphere(pt(ex + 0.016, eyeY - 0.022, eyeZ + 0.022), sz(0.011, 0.011, 0.010), '#FFFFFF', 5, 5);
      }
      g.sphere(pt(side * 0.255, 0.69, 0.455), sz(look.face === 'shy' ? 0.09 : 0.078, 0.044, 0.025), blushCol, 10, 6);
    }

    // 软萌小嘴巴
    for (const side of [-1, 1]) {
      g.sphere(pt(side * 0.028, 0.695, 0.528), sz(0.026, 0.016, 0.014), '#D9536F', 6, 4);
    }
    if (p.openMouth || look.face === 'surprise') {
      g.sphere(pt(0, 0.68, 0.525), sz(0.045, 0.040, 0.018), '#E85D75', 8, 6);
    }

    // 5. 小短手（扑腾摇摆）
    for (const side of [-1, 1]) {
      const armRx = side === -1 ? (p.leftArmRx || 0) : (p.rightArmRx || 0);
      const armRz = side === -1 ? (p.leftArmRz || 0.35) : (p.rightArmRz || -0.35);
      g.pushTransform(pt(side * 0.50, 0.68, 0.04), armRx, 0, armRz);
      g.sphere(pt(side * 0.56, 0.56, 0.06), sz(0.105, 0.18, 0.115), bodyCol, 12, 8);
      g.sphere(pt(side * 0.57, 0.44, 0.07), sz(0.088, 0.09, 0.095), faceCol, 10, 6);
      g.popTransform();
    }

    // 6. 萌耳 / 揪揪造型
    const bounce = p.topBounce || 0, swing = p.topSwing || 0;
    const ears = look.ears || look.hair || 'twin_tails';
    g.pushTransform(pt(0, 1.18, 0), bounce * 0.8, 0, swing);

    if (ears === 'ponytail') {
      g.cylinder(pt(0, 1.26, 0), 0.038 * s, 0.16 * s, bodyCol, 0.032 * s, 10);
      g.sphere(pt(0, 1.37, 0), sz(0.098, 0.095, 0.098), bodyCol, 12, 8);
    } else if (ears === 'twin_tails') {
      for (const side of [-1, 1]) {
        g.sphere(pt(side * 0.16, 1.28, 0), sz(0.09, 0.12, 0.09), bodyCol, 10, 6);
        g.sphere(pt(side * 0.24, 1.36, 0), sz(0.075, 0.075, 0.075), '#FFFDF7', 8, 6);
      }
    } else if (ears === 'buns') {
      for (const side of [-1, 1]) {
        g.pushTransform(pt(side * 0.20, 1.16, 0), 0, 0, side * (-0.18 + swing * 0.5));
        g.sphere(pt(side * 0.22, 1.38, 0), sz(0.11, 0.26, 0.075), bodyCol, 12, 8);
        g.sphere(pt(side * 0.22, 1.37, 0.05), sz(0.065, 0.18, 0.035), '#FFF0F5', 8, 6);
        g.popTransform();
      }
    } else if (ears === 'curls') {
      for (const side of [-1, 1]) {
        g.sphere(pt(side * 0.34, 1.12, 0.02), sz(0.14, 0.14, 0.09), bodyCol, 12, 8);
        g.sphere(pt(side * 0.34, 1.12, 0.08), sz(0.08, 0.08, 0.04), '#FFFDF7', 8, 6);
      }
    } else if (ears === 'princess_braid') {
      for (const side of [-1, 1]) {
        g.sphere(pt(side * 0.24, 1.25, 0.04), sz(0.075, 0.14, 0.075), '#FFE169', 10, 6);
      }
    } else if (ears === 'bob') {
      for (const side of [-1, 1]) {
        g.cylinder(pt(side * 0.30, 1.18, 0.02), 0.13 * s, 0.18 * s, bodyCol, 0.02 * s, 10);
        g.sphere(pt(side * 0.30, 1.15, 0.07), sz(0.06, 0.07, 0.03), '#FF9EBB', 7, 5);
      }
    } else if (ears === 'short') {
      for (const side of [-1, 1]) {
        g.sphere(pt(side * 0.32, 1.16, 0.04), sz(0.10, 0.16, 0.08), bodyCol, 10, 6);
        g.sphere(pt(side * 0.14, 0.94, 0.44), sz(0.035, 0.022, 0.015), '#FFFDF7', 6, 4);
      }
    } else {
      for (const side of [-1, 1]) {
        g.sphere(pt(side * 0.35, 1.10, 0), sz(0.15, 0.15, 0.15), '#FFFFFF', 12, 8);
      }
    }

    // 7. 头部与背部配饰
    if (accList.includes('bow_red')) {
      g.sphere(pt(-0.11, 1.21, 0.14), sz(0.10, 0.065, 0.05), '#FF4D79', 8, 6);
      g.sphere(pt(0.11, 1.21, 0.14), sz(0.10, 0.065, 0.05), '#FF4D79', 8, 6);
      g.sphere(pt(0, 1.21, 0.16), sz(0.048, 0.048, 0.04), '#FFFDF5', 6, 4);
    }
    if (accList.includes('acc_crown')) {
      g.cylinder(pt(0, 1.26, 0.08), 0.15 * s, 0.10 * s, '#FFD166', 0.18 * s, 14);
      g.sphere(pt(0, 1.32, 0.23), sz(0.035, 0.035, 0.025), '#FF4D79', 6, 4);
    }
    if (accList.includes('acc_beret')) {
      g.sphere(pt(0.08, 1.22, 0.04), sz(0.32, 0.10, 0.30), '#FF759F', 14, 8);
      g.sphere(pt(0.08, 1.31, 0.04), sz(0.04, 0.04, 0.04), '#FFFDF7', 6, 4);
    }
    if (accList.includes('acc_flower')) {
      g.sphere(pt(-0.28, 1.12, 0.28), sz(0.08, 0.08, 0.035), '#FFFFFF', 8, 6);
      g.sphere(pt(-0.28, 1.12, 0.30), sz(0.038, 0.038, 0.025), '#FFD166', 6, 4);
    }
    if (accList.includes('acc_star')) {
      g.sphere(pt(-0.28, 1.10, 0.29), sz(0.065, 0.065, 0.03), '#FFD166', 8, 6);
      g.sphere(pt(-0.20, 1.16, 0.26), sz(0.045, 0.045, 0.025), '#FF85A1', 6, 4);
    }
    g.popTransform(); // 结束头顶

    // 爱心眼镜
    if (accList.includes('acc_heartglasses')) {
      for (const side of [-1, 1]) {
        g.sphere(pt(side * 0.16, 0.78, 0.535), sz(0.09, 0.07, 0.02), '#FF4D79', 10, 6);
        g.sphere(pt(side * 0.16, 0.78, 0.545), sz(0.065, 0.048, 0.015), '#FFE5EC', 8, 5);
      }
      g.sphere(pt(0, 0.78, 0.54), sz(0.045, 0.016, 0.015), '#FF4D79', 6, 4);
    }

    // 背部扑腾小翅膀
    if (accList.includes('acc_wings')) {
      for (const side of [-1, 1]) {
        g.pushTransform(pt(side * 0.24, 0.68, -0.42), 0, side * (-0.3 + Math.sin(p.wingFlap || 0) * 0.22), side * 0.2);
        g.sphere(pt(side * 0.44, 0.74, -0.44), sz(0.22, 0.14, 0.045), '#FFFFFF', 10, 6);
        g.sphere(pt(side * 0.36, 0.58, -0.44), sz(0.16, 0.10, 0.045), '#FFD6E8', 8, 6);
        g.popTransform();
      }
    }

    // 斜挎小包包
    if (accList.includes('acc_bag') || accList.includes('acc_teddy')) {
      const isTeddy = accList.includes('acc_teddy');
      const bagCol = isTeddy ? '#D4A373' : '#FF4D79';
      g.sphere(pt(0.49, 0.44, 0.22), sz(0.12, 0.11, 0.09), bagCol, 10, 6);
      g.sphere(pt(0.49, 0.53, 0.23), sz(0.06, 0.035, 0.04), isTeddy ? '#FFF3E0' : '#95D5B2', 6, 4);
    }

    g.popTransform(); // 结束根
  }

  // 4 大动作姿态计算函数
  function computeEggyPose(t, act, offset = 0) {
    const time = t + offset;
    const pose = {
      walkX: 0, walkZ: 0, bobY: 0, yaw: 0, roll: 0,
      squashX: 1, squashY: 1, squashZ: 1,
      leftLegRx: 0, rightLegRx: 0, leftLegLift: 0, rightLegLift: 0,
      leftArmRx: 0, leftArmRz: 0.35, rightArmRx: 0, rightArmRz: -0.35,
      topSwing: 0, topBounce: 0, wingFlap: time * 9,
      blink: (time % 3.2) > 3.06,
      happyEye: false, openMouth: false
    };

    if (act === 'waddle') {
      const w = time * 7.8;
      const s = Math.sin(w), c = Math.cos(w);
      const bounce = Math.abs(s);
      pose.roll = s * 0.13;
      pose.bobY = bounce * 0.08;
      const jelly = Math.sin(w * 2);
      pose.squashY = 1 + jelly * 0.045;
      pose.squashX = 1 - jelly * 0.03;
      pose.squashZ = 1 - jelly * 0.03;
      pose.leftLegRx = s * 0.55;
      pose.rightLegRx = -s * 0.55;
      pose.leftLegLift = Math.max(0, s) * 0.06;
      pose.rightLegLift = Math.max(0, -s) * 0.06;
      pose.leftArmRx = -s * 0.45;
      pose.rightArmRx = s * 0.45;
      pose.leftArmRz = 0.42 + bounce * 0.15;
      pose.rightArmRz = -0.42 - bounce * 0.15;
      pose.topSwing = -c * 0.22;
      pose.topBounce = Math.sin(w * 2 - 0.6) * 0.18;
    } else if (act === 'wave') {
      const wave = time * 9.5;
      pose.yaw = Math.sin(time * 1.6) * 0.18;
      pose.roll = 0.06 + Math.sin(time * 3.2) * 0.04;
      pose.bobY = Math.abs(Math.sin(time * 3.2)) * 0.04;
      pose.squashY = 1 + Math.sin(time * 6.4) * 0.03;
      pose.squashX = 1 - Math.sin(time * 6.4) * 0.02;
      pose.rightArmRz = 1.95 + Math.sin(wave) * 0.28;
      pose.rightArmRx = -0.25;
      pose.topSwing = Math.sin(time * 6.4) * 0.14;
      pose.happyEye = true;
      pose.openMouth = true;
    } else if (act === 'bounce') {
      const jump = Math.sin(time * 5.6);
      if (jump > 0) {
        pose.bobY = jump * 0.24;
        pose.squashY = 1 + jump * 0.08;
        pose.squashX = 1 - jump * 0.05;
        pose.squashZ = 1 - jump * 0.05;
        pose.leftArmRz = 1.65;
        pose.rightArmRz = -1.65;
      } else {
        pose.bobY = 0;
        pose.squashY = 0.90;
        pose.squashX = 1.07;
        pose.squashZ = 1.07;
        pose.leftArmRz = 0.65;
        pose.rightArmRz = -0.65;
      }
      pose.topBounce = -jump * 0.32;
      pose.happyEye = jump > 0.1;
      pose.openMouth = jump > 0.1;
    } else {
      // idle 歪头眨眼
      const b = Math.sin(time * 2.6);
      pose.squashY = 1 + b * 0.028;
      pose.squashX = 1 - b * 0.018;
      pose.roll = Math.sin(time * 1.4) * 0.05;
      pose.yaw = Math.sin(time * 1.1) * 0.22;
      pose.topSwing = Math.sin(time * 1.4 - 0.5) * 0.10;
    }
    return pose;
  }

  function projectOrtho(pt, matrix, width, height) {
    const x = pt[0], y = pt[1], z = pt[2];
    const cx = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
    const cy = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
    return { x: (cx * 0.5 + 0.5) * width, y: (1 - (cy * 0.5 + 0.5)) * height };
  }

  // 辅助 DOM 工具
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const button = (text, action, className) => {
    const node = el('button', className || 'ui-button', text);
    node.type = 'button';
    if (action) node.addEventListener('click', action);
    return node;
  };

  let activePanelLifecycle = null;

  // 挑选预设初始形象弹窗（首次启动或衣橱重挑）
  function pickPreset(options) {
    options = options || {};
    const sys = G.sys.avatar, D = G.data;
    let selected = options.initial && D.avatarPresetById[options.initial] ? options.initial : sys.randomPresetId(), done = false;
    const body = el('div', 'ui-stack preset-picker character-visual');
    const grid = el('div', 'preset-grid');
    const cards = [];
    const summary = el('p', 'preset-summary');
    summary.setAttribute('role', 'status');
    summary.setAttribute('aria-live', 'polite');

    const isFirstOrLogin = !!(options.first || options.fromLogin);
    const introText = options.fromLogin
      ? '欢迎来到棉花糖岛！先挑一个喜欢的小伙伴作为你的专属形象，之后随时能在换装间自由微调搭配！'
      : (options.first
        ? '先挑一个喜欢的小伙伴，之后随时能在衣橱里换装捏脸！'
        : '换上预设会换上一整套可爱的蛋仔形象，已买的衣服都会好好留着。');

    body.append(
      el('p', 'ui-small ui-muted', introText),
      grid,
      summary
    );

    PRESETS.forEach(preset => {
      const card = el('button', 'preset-card');
      const art = el('canvas', 'preset-art');
      const name = el('span', 'preset-name', preset.name);
      const check = el('span', 'preset-check', '✓');
      check.hidden = true;
      card.type = 'button';
      card.dataset.presetId = preset.id;
      const p = D.avatarPresetById?.[preset.id] || preset;
      const hairName = D.avatarHairStyles?.find(h => h.id === (p.hair || preset.ears))?.name || '';
      card.setAttribute('aria-label', (p.name || preset.name) + (hairName ? ' · ' + hairName : ''));
      card.setAttribute('aria-pressed', 'false');
      art.width = 110;
      art.height = 140;
      card.append(check, art, name);
      card.addEventListener('click', () => { selected = preset.id; mark(); });
      grid.append(card);
      cards.push({ card, preset, art, check });
    });

    function mark() {
      cards.forEach(({ card, preset, check }) => {
        const on = preset.id === selected;
        check.hidden = !on;
        card.classList.toggle('is-selected', on);
        card.setAttribute('aria-pressed', String(on));
      });
      const p = D.avatarPresetById?.[selected] || PRESETS.find(p => p.id === selected) || PRESETS[0];
      summary.textContent = '已选「' + (p.name || selected) + '」';
    }

    function finish() {
      if (done) return;
      done = true;
      const result = sys.applyPreset(selected);
      if (result.ok) {
        G.ui.toast(result.message);
        G.ui.audio?.play('success');
        G.ui.refresh?.();
      }
      if (options.onDone) options.onDone();
    }

    const confirmText = isFirstOrLogin ? '就是我啦！' : '换上这个形象';
    const confirm = button(confirmText, () => { finish(); modal.close(); }, 'ui-button ui-button-primary');
    const actions = el('div', 'ui-actions');
    actions.append(confirm);
    if (isFirstOrLogin) {
      const customize = button('去换装间调整', () => {
        finish();
        modal.close();
        if (G.ui && typeof G.ui.open === 'function') G.ui.open('avatar');
      }, 'ui-button ui-button-soft');
      actions.append(customize);
    }
    body.append(actions);
    const modalTitle = options.fromLogin ? '设置你的个人形象' : (options.first ? '挑一个你的样子' : '预设小伙伴');
    const modal = G.ui.modal({ title: modalTitle, content: body, onClose() { finish(); } });
    if (modal.element) modal.element.classList.add('character-picker-modal');
    mark();

    // 绘制预设缩略图
    requestAnimationFrame(() => cards.forEach(({ art, preset }) => {
      if (art.isConnected) G.render.drawAvatar(art, Object.assign({}, sys.current(), D.avatarPresetLook(preset.id)), { facing: 1 });
    }));

    return modal;
  }

  // 主换装面板
  function panel() {
    activePanelLifecycle?.dispose();

    const sys = G.sys.avatar, D = G.data;
    const body = el('div', 'ui-stack avatar-panel character-visual');

    // 当前换装与交互状态
    let actMode = 'waddle';
    let camAngle = 0.15;
    let camElev = 0.22;
    let dragging = false;
    let lastX = 0, lastY = 0;
    let showAll8 = false;
    let activePresetIdx = 0;
    let animFrame = 0;
    let disposed = false;

    // 1. 顶部预设快速切换栏（8 个蛋仔胶囊 + 全家福切换）
    const presetHeader = el('div', 'avatar-preset-bar-wrap');
    const presetGrid = el('div', 'avatar-preset-pills');
    const viewAllBtn = button('👥 8只全家福 / 单只换装台', () => {
      showAll8 = !showAll8;
      updatePresetPills();
    }, 'ui-button ui-button-soft avatar-all8-btn');

    PRESETS.forEach((p, idx) => {
      const b = button(p.name, () => {
        showAll8 = false;
        activePresetIdx = idx;
        // 一次事务换整套（发型/发色/表情/穿搭/鞋/配饰）：逐件写档会重复整档校验和主场景重绘，点击就会卡。
        const outfit = p.outfitKey === 'set_overalls' ? 'bottom_pants' : p.outfitKey === 'set_cloud' ? 'top_cloud' : p.outfitKey;
        sys.applyBundle({ hair: p.ears, hairColor: p.hairColor || p.bodyColor, face: p.face, wear: [outfit, p.shoesKey].concat(p.accKeys || []) });
        updatePresetPills();
        syncDressUpUI(false);
      }, 'avatar-preset-pill');
      b.dataset.presetIdx = String(idx);
      presetGrid.append(b);
    });

    presetHeader.append(presetGrid, viewAllBtn);
    body.append(presetHeader);

    function updatePresetPills() {
      presetGrid.querySelectorAll('.avatar-preset-pill').forEach((btn, idx) => {
        const on = !showAll8 && idx === activePresetIdx;
        btn.classList.toggle('is-active', on);
      });
      viewAllBtn.classList.toggle('is-active', showAll8);
      stageWrap.classList.toggle('is-all8', showAll8);
    }

    // 2. 3D WebGL 交互展示舞台与上方动作条（彻底避免遮挡蛋仔头部）
    const stageContainer = el('div', 'avatar-stage-container');
    const stageHeader = el('div', 'avatar-stage-header');
    const actGroup = el('div', 'avatar-act-group');

    const actions = [
      { id: 'waddle', label: '🐧 快乐企鹅步' },
      { id: 'wave', label: '👋 扑腾打招呼' },
      { id: 'bounce', label: '🍮 果冻Q弹跳' },
      { id: 'idle', label: '✨ 歪头眨眼' }
    ];

    function setAction(id) {
      actMode = id;
      actions.forEach(a => {
        actButtons[a.id]?.classList.toggle('is-active', a.id === id);
      });
    }

    const actButtons = {};
    actions.forEach(a => {
      const btn = button(a.label, e => {
        e.stopPropagation();
        e.preventDefault();
        setAction(a.id);
      }, 'avatar-act-btn' + (a.id === actMode ? ' is-active' : ''));
      actButtons[a.id] = btn;
      actGroup.append(btn);
    });

    const dragTip = el('span', 'avatar-drag-tip', '拖拽 360° 旋转看小尾巴/小翅膀');
    stageHeader.append(actGroup, dragTip);

    const stageWrap = el('div', 'avatar-stage-wrap');
    stageWrap.style.background = 'radial-gradient(circle at 50% 25%, #fffdf9 0%, #ffe8f2 55%, #f5d4e6 100%)';

    const glCanvas = el('canvas', 'avatar-stage-gl');
    const hudCanvas = el('canvas', 'avatar-stage-hud');
    glCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
    hudCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:block;';

    stageWrap.append(glCanvas, hudCanvas);
    stageContainer.append(stageHeader, stageWrap);
    body.append(stageContainer);

    // 360° 鼠标/触屏拖拽交互
    stageWrap.addEventListener('pointerdown', e => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      stageWrap.setPointerCapture?.(e.pointerId);
    });
    stageWrap.addEventListener('pointermove', e => {
      if (!dragging) return;
      camAngle -= (e.clientX - lastX) * 0.01;
      camElev = Math.max(0.05, Math.min(0.60, camElev + (e.clientY - lastY) * 0.006));
      lastX = e.clientX;
      lastY = e.clientY;
    });
    stageWrap.addEventListener('pointerup', () => { dragging = false; });
    stageWrap.addEventListener('pointercancel', () => { dragging = false; });

    // 3. WebGL 初始化与渲染管线
    const gl = glCanvas.getContext('webgl', { alpha: true, antialias: true });
    const hudCtx = hudCanvas.getContext('2d');

    let prog = null, locPos, locNorm, locCol, locMat, locEye, vbo = null;
    if (gl) {
      const vsSrc = `
        attribute vec3 aPosition;
        attribute vec3 aNormal;
        attribute vec3 aColor;
        uniform mat4 uMatrix;
        varying vec3 vNormal;
        varying vec3 vColor;
        varying vec3 vPosition;
        void main() {
          vNormal = aNormal;
          vColor = aColor;
          vPosition = aPosition;
          gl_Position = uMatrix * vec4(aPosition, 1.0);
        }
      `;
      const fsSrc = `
        precision mediump float;
        varying vec3 vNormal;
        varying vec3 vColor;
        varying vec3 vPosition;
        uniform vec3 uEye;
        void main() {
          vec3 n = normalize(vNormal);
          vec3 light = normalize(vec3(-0.45, 1.25, 1.35));
          vec3 viewDir = normalize(uEye - vPosition);
          float ndl = dot(n, light) * 0.5 + 0.5;
          float toon = smoothstep(0.28, 0.75, ndl);
          vec3 shadowTint = vec3(0.91, 0.84, 0.88);
          vec3 litTint = vec3(1.03, 1.01, 1.00);
          vec3 shading = mix(shadowTint, litTint, toon);
          float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0) * 0.12;
          vec3 halfDir = normalize(light + viewDir);
          float spec = pow(max(dot(n, halfDir), 0.0), 32.0) * 0.07;
          gl_FragColor = vec4(vColor * shading + vec3(rim + spec), 1.0);
        }
      `;
      function compile(type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        return s;
      }
      prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSrc));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSrc));
      gl.linkProgram(prog);
      gl.useProgram(prog);

      locPos = gl.getAttribLocation(prog, 'aPosition');
      locNorm = gl.getAttribLocation(prog, 'aNormal');
      locCol = gl.getAttribLocation(prog, 'aColor');
      locMat = gl.getUniformLocation(prog, 'uMatrix');
      locEye = gl.getUniformLocation(prog, 'uEye');
      vbo = gl.createBuffer();
      gl.enable(gl.DEPTH_TEST);
    }

    let lastStageDraw = -Infinity;
    const g = new Geometry();
    function renderStage(now) {
      if (disposed || !body.isConnected) return;
      // 预览最多30帧（全家福8只建模更重，最多20帧）：每帧重建几何，不限帧会和点击抢主线程。
      if (now - lastStageDraw < (showAll8 ? 50 : 33)) { animFrame = requestAnimationFrame(renderStage); return; }
      lastStageDraw = now;
      const t = now * 0.001;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = stageWrap.clientWidth || 320;
      const h = stageWrap.clientHeight || 260;

      if (glCanvas.width !== Math.floor(w * dpr) || glCanvas.height !== Math.floor(h * dpr)) {
        glCanvas.width = Math.floor(w * dpr);
        glCanvas.height = Math.floor(h * dpr);
        hudCanvas.width = Math.floor(w * dpr);
        hudCanvas.height = Math.floor(h * dpr);
      }

      if (gl && prog) {
        gl.viewport(0, 0, glCanvas.width, glCanvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        g.reset(); g.detail = showAll8 ? .5 : 1;
        const aspect = w / h;
        // 全家福：机位抬高、前后排拉开，视野按舞台宽高比放大，窄面板也不挤不出框。
        const viewH = showAll8 ? Math.max(2.7, 5.6 / (2 * aspect * .94)) : 1.35;
        const elev = showAll8 ? Math.max(camElev, .5) : camElev;
        const proj = ortho(-aspect * viewH, aspect * viewH, -viewH, viewH, -25, 25);
        const eye = [
          Math.sin(camAngle) * Math.cos(elev) * 9,
          Math.sin(elev) * 9 + (showAll8 ? 1.05 : 0.88),
          Math.cos(camAngle) * Math.cos(elev) * 9
        ];
        const mat = multiply(proj, lookAt(eye, [0, showAll8 ? 0.68 : 0.78, 0]));

        hudCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        hudCtx.clearRect(0, 0, w, h);

        const currentAvatar = sys.current();

        if (showAll8) {
          PRESETS.forEach((preset, idx) => {
            const col = idx % 4;
            const row = Math.floor(idx / 4);
            const px = (col - 1.5) * 1.5;
            const pz = row === 0 ? -1.45 : 1.45;
            g.cylinder([px, 0.06, pz], 0.56, 0.12, '#F9C6D9', 0.56, 20);
            g.cylinder([px, 0.13, pz], 0.51, 0.03, '#FFFDF9', 0.51, 20);
            const pose = computeEggyPose(t, actMode, idx * 0.5);
            drawChubbyCartoonCreature(g, px, pz, 0.72, preset, 0.14, pose);

            const anchor = projectOrtho([px, 0.02, pz], mat, w, h);
            hudCtx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
            const tw = hudCtx.measureText(preset.name).width + 12;
            hudCtx.fillStyle = 'rgba(236, 72, 153, 0.90)';
            hudCtx.beginPath();
            hudCtx.roundRect(anchor.x - tw / 2, anchor.y - 4, tw, 18, 9);
            hudCtx.fill();
            hudCtx.fillStyle = '#FFFFFF';
            hudCtx.textAlign = 'center';
            hudCtx.textBaseline = 'middle';
            hudCtx.fillText(preset.name, anchor.x, anchor.y + 5);
          });
        } else {
          // 绘制粉嫩软陶小圆台底座
          g.cylinder([0, 0.08, 0], 1.02, 0.16, '#F9C6D9', 1.02, 32);
          g.cylinder([0, 0.17, 0], 0.94, 0.04, '#FFFDF9', 0.94, 32);

          const pose = computeEggyPose(t, actMode, 0);
          drawChubbyCartoonCreature(g, 0, 0, 1.08, currentAvatar, 0.19, pose);

          if (actMode === 'wave') {
            const headPt = projectOrtho([0, 1.72 + pose.bobY, 0], mat, w, h);
            const pInfo = PRESETS.find(p => p.id === PRESETS[activePresetIdx].id);
            const text = '咔咔～今天也超可爱，来串门呀✨';
            hudCtx.font = 'bold 12px -apple-system, BlinkMacSystemFont, sans-serif';
            const bw = hudCtx.measureText(text).width + 22;
            const bh = 28;
            hudCtx.fillStyle = 'rgba(255, 253, 250, 0.98)';
            hudCtx.strokeStyle = 'rgba(244, 114, 182, 0.75)';
            hudCtx.lineWidth = 1.5;
            hudCtx.beginPath();
            hudCtx.roundRect(headPt.x - bw / 2, headPt.y - bh, bw, bh, 14);
            hudCtx.fill();
            hudCtx.stroke();
            hudCtx.fillStyle = '#592E3E';
            hudCtx.textAlign = 'center';
            hudCtx.textBaseline = 'middle';
            hudCtx.fillText(text, headPt.x, headPt.y - bh / 2);
          }
        }

        gl.uniformMatrix4fv(locMat, false, mat);
        gl.uniform3fv(locEye, eye);

        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, g.data, gl.DYNAMIC_DRAW);

        const stride = 9 * 4;
        gl.enableVertexAttribArray(locPos);
        gl.vertexAttribPointer(locPos, 3, gl.FLOAT, false, stride, 0);

        gl.enableVertexAttribArray(locNorm);
        gl.vertexAttribPointer(locNorm, 3, gl.FLOAT, false, stride, 3 * 4);

        gl.enableVertexAttribArray(locCol);
        gl.vertexAttribPointer(locCol, 3, gl.FLOAT, false, stride, 6 * 4);

        gl.drawArrays(gl.TRIANGLES, 0, g.len / 9);
      }

      animFrame = requestAnimationFrame(renderStage);
    }

    // 辅助函数：确保服装在已拥有列表中
    function ensureItemOwned(itemId) {
      if (!itemId || itemId === 'none') return;
      G.store.update(state => {
        const avatar = D.validateAvatar(state.avatar);
        if (!avatar.owned[itemId]) {
          avatar.owned[itemId] = true;
          state.avatar = D.validateAvatar(avatar);
        }
      });
    }

    // 4. 圆滚滚萌物专属换装槽（完全匹配设计原型）
    const dressUpBox = el('div', 'avatar-slots-container');
    const dressUpTitle = el('div', 'avatar-slots-heading');
    dressUpTitle.append(
      el('span', 'avatar-slots-title-text', '🎨 圆滚滚萌物换装槽（点选立即换装）'),
      el('span', 'avatar-current-badge', '🍓 草莓团团')
    );
    dressUpBox.append(dressUpTitle);

    // ① 头顶萌耳/揪揪槽
    const slotEarsWrap = el('div', 'avatar-slot-block');
    slotEarsWrap.append(el('span', 'avatar-slot-title', '① 头顶萌耳 / 揪揪槽 (hair · 8种Q弹头顶造型)'));
    const slotEars = el('div', 'avatar-slot-pills');
    EAR_STYLES.forEach(item => {
      const b = button(item.name, () => {
        sys.setHair(item.id);
        syncDressUpUI();
      }, 'avatar-slot-btn');
      b.dataset.earId = item.id;
      slotEars.append(b);
    });
    slotEarsWrap.append(slotEars);

    // ② 糖果机身颜色
    const slotColorWrap = el('div', 'avatar-slot-block');
    slotColorWrap.append(el('span', 'avatar-slot-title', '② 糖果机身颜色 (hairColor · 全马卡龙粉嫩色)'));
    const slotColor = el('div', 'avatar-color-pills');
    BODY_COLORS.forEach(item => {
      const b = el('button', 'avatar-color-pill');
      b.type = 'button';
      b.style.backgroundColor = item.hex;
      b.title = item.name;
      b.dataset.colId = item.id;
      b.addEventListener('click', () => {
        const res = sys.setHairColor(item.id);
        if (res && res.ok) {
          G.ui.toast?.(item.name + '果冻体色换好啦！');
        }
        syncDressUpUI();
      });
      slotColor.append(b);
    });
    slotColorWrap.append(slotColor);

    // ③ 圆肚肚穿搭槽
    const slotOutfitWrap = el('div', 'avatar-slot-block');
    slotOutfitWrap.append(el('span', 'avatar-slot-title', '③ 圆肚肚穿搭槽 (dress / top+bottom · 套在圆蛋身体上)'));
    const slotOutfit = el('div', 'avatar-slot-pills');
    Object.entries(OUTFITS).forEach(([k, item]) => {
      const b = button(item.name, () => {
        if (k === 'none') {
          // 脱下裙圈和衣服
          G.store.update(state => {
            const avatar = D.validateAvatar(state.avatar);
            avatar.dress = null;
            avatar.top = 'top_cloud';
            avatar.bottom = 'bottom_cream';
            state.avatar = D.validateAvatar(avatar);
          });
        } else {
          ensureItemOwned(item.id);
          sys.equip(item.id);
        }
        syncDressUpUI();
      }, 'avatar-slot-btn');
      b.dataset.outfitKey = k;
      slotOutfit.append(b);
    });
    slotOutfitWrap.append(slotOutfit);

    // ④ 小胖脚鞋槽
    const slotShoesWrap = el('div', 'avatar-slot-block');
    slotShoesWrap.append(el('span', 'avatar-slot-title', '④ 小胖脚鞋槽 (shoes · 6款小短脚鞋)'));
    const slotShoes = el('div', 'avatar-slot-pills');
    Object.entries(SHOES).forEach(([k, item]) => {
      const b = button(item.name, () => {
        ensureItemOwned(item.id);
        sys.equip(item.id);
        syncDressUpUI();
      }, 'avatar-slot-btn');
      b.dataset.shoesKey = k;
      slotShoes.append(b);
    });
    slotShoesWrap.append(slotShoes);

    // ⑤ 配饰叠加槽
    const slotAccWrap = el('div', 'avatar-slot-block');
    slotAccWrap.append(el('span', 'avatar-slot-title', '⑤ 配饰叠加槽 (acc · 头饰/眼镜/小翅膀/斜挎包)'));
    const slotAcc = el('div', 'avatar-slot-pills');
    ACCESSORIES.forEach(item => {
      const b = button(item.name, () => {
        const cur = sys.current();
        const wearing = (cur.acc || []).includes(item.id);
        if (wearing) {
          sys.removeAccessory(item.id);
        } else {
          ensureItemOwned(item.id);
          sys.equip(item.id);
        }
        syncDressUpUI();
      }, 'avatar-slot-btn');
      b.dataset.accId = item.id;
      slotAcc.append(b);
    });
    slotAccWrap.append(slotAcc);

    dressUpBox.append(slotEarsWrap, slotColorWrap, slotOutfitWrap, slotShoesWrap, slotAccWrap);
    body.append(dressUpBox);

    // 同步高亮选中状态
    function syncDressUpUI(notify = true) {
      const cur = sys.current();
      const curColor = String(cur.hairColor || '').toUpperCase();
      const curEars = cur.hair || 'twin_tails';
      const curAcc = Array.isArray(cur.acc) ? cur.acc : [];

      // 萌耳高亮
      slotEars.querySelectorAll('.avatar-slot-btn').forEach(b => {
        b.classList.toggle('is-active', b.dataset.earId === curEars);
      });

      // 颜色圆点高亮
      slotColor.querySelectorAll('.avatar-color-pill').forEach(b => {
        b.classList.toggle('is-active', b.dataset.colId.toUpperCase() === curColor);
      });

      // 穿搭高亮
      slotOutfit.querySelectorAll('.avatar-slot-btn').forEach(b => {
        const k = b.dataset.outfitKey;
        const active = (k === 'none' && !cur.dress) ||
          (k === 'set_overalls' && cur.bottom === 'bottom_pants') ||
          (k === 'set_cloud' && cur.top === 'top_cloud' && !cur.dress) ||
          (cur.dress === k);
        b.classList.toggle('is-active', Boolean(active));
      });

      // 鞋子高亮
      slotShoes.querySelectorAll('.avatar-slot-btn').forEach(b => {
        b.classList.toggle('is-active', b.dataset.shoesKey === cur.shoes);
      });

      // 配饰高亮
      slotAcc.querySelectorAll('.avatar-slot-btn').forEach(b => {
        b.classList.toggle('is-active', curAcc.includes(b.dataset.accId));
      });

      // 徽标名称
      const p = PRESETS[activePresetIdx] || PRESETS[0];
      dressUpTitle.querySelector('.avatar-current-badge').textContent = showAll8 ? '👥 8只全家福' : p.name;

      // 实时通知主场景刷新主角 3D 模型与颜色（系统层已通知过的操作不再重复）
      if (notify) { G.bus?.emit?.('avatar:changed', {}); G.render?.redraw?.(); }
    }

    // 启动动画循环与同步
    updatePresetPills();
    syncDressUpUI();
    animFrame = requestAnimationFrame(renderStage);

    const lifecycle = {
      body,
      dispose() {
        if (disposed) return;
        disposed = true;
        if (animFrame) cancelAnimationFrame(animFrame);
        animFrame = 0;
        G.bus?.emit?.('avatar:changed', {});
        G.render?.redraw?.();
        if (activePanelLifecycle === lifecycle) activePanelLifecycle = null;
      }
    };
    activePanelLifecycle = lifecycle;

    return { title: '我的换装间', subtitle: '今天，想做什么样的自己？', content: body };
  }

  G.bus?.on?.('panel:change', event => {
    if (activePanelLifecycle && (event?.open === false || !activePanelLifecycle.body.isConnected)) {
      activePanelLifecycle.dispose();
    }
  });

  G.bus?.on?.('state:replace', () => activePanelLifecycle?.dispose());

  G.ui.avatar = {
    panel,
    pickPreset,
    hasConfigured: () => (G.sys && G.sys.avatar && typeof G.sys.avatar.hasConfigured === 'function') ? G.sys.avatar.hasConfigured() : true,
    needsPreset: () => G.sys.avatar.needsPreset()
  };
})(window.Game);
