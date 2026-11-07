/* 棉花糖小屋 · 审核原型专用。原生 WebGL，自绘几何，不连接游戏进度。 */
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const C = {
    grass: '#a9ca83', grassLight: '#c5d99c', soil: '#cda888', clay: '#e7c4a2',
    cream: '#fff2d9', white: '#fffaf0', roof: '#e98982', roofDark: '#cd6f69',
    mint: '#87bcb0', teal: '#43877f', dark: '#405a50', wood: '#bc8868',
    pink: '#efb1b0', butter: '#f4d988', lilac: '#b9aed5', blue: '#a9d4d7'
  };
  function rgb(hex) {
    if (Array.isArray(hex)) return hex;
    const n = parseInt((hex || '#ffffff').replace('#', ''), 16);
    return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  function shade(hex, n) { return rgb(hex).map(v => Math.max(0, Math.min(1, v * n))); }
  function normalize(v) { const n = Math.hypot(...v) || 1; return v.map(a => a / n); }
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
    constructor() { this.data = []; this.groups = []; this.transform = null; }
    vertex(p, n, color) {
      let pos = p, normal = n;
      if (this.transform) {
        const tr = this.transform;
        pos = rotatePoint(p, tr.rx || 0, tr.ry || 0, tr.rz || 0).map((v, i) => v + tr.p[i]);
        normal = rotatePoint(n, tr.rx || 0, tr.ry || 0, tr.rz || 0);
      }
      this.data.push(...pos, ...normal, ...color);
    }
    triangle(a, b, c, color, normals) {
      const n = normals ? null : normalize(cross(subtract(b, a), subtract(c, a)));
      this.vertex(a, normals ? normals[0] : n, color);
      this.vertex(b, normals ? normals[1] : n, color);
      this.vertex(c, normals ? normals[2] : n, color);
    }
    quad(a, b, c, d, color, normals) {
      this.triangle(a, b, c, color, normals && [normals[0], normals[1], normals[2]]);
      this.triangle(a, c, d, color, normals && [normals[0], normals[2], normals[3]]);
    }
    sphere(p, s, color, segments = 16, rings = 10) {
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
    box(p, s, color, radius = 0.08, rotation) {
      const previous = this.transform;
      if (rotation) this.transform = { p: p, rx: rotation[0], ry: rotation[1], rz: rotation[2] };
      const center = rotation ? [0, 0, 0] : p, half = s.map(a => a / 2), r = Math.min(radius, ...half), inner = half.map(a => a - r), col = rgb(color);
      const subdivisions = 5;
      const faces = [[0, 1, 2, 1], [0, 2, 1, -1], [1, 2, 0, 1], [1, 0, 2, -1], [2, 0, 1, 1], [2, 1, 0, -1]];
      for (const [axis, ua, va, sign] of faces) {
        const pts = [];
        for (let j = 0; j <= subdivisions; j++) {
          const row = [];
          for (let i = 0; i <= subdivisions; i++) {
            const q = [0, 0, 0];
            q[axis] = sign * half[axis]; q[ua] = (i / subdivisions * 2 - 1) * half[ua]; q[va] = (j / subdivisions * 2 - 1) * half[va];
            const base = q.map((v, k) => Math.max(-inner[k], Math.min(inner[k], v))), n = normalize(subtract(q, base));
            row.push({ p: base.map((v, k) => center[k] + v + n[k] * r), n });
          }
          pts.push(row);
        }
        for (let j = 0; j < subdivisions; j++) for (let i = 0; i < subdivisions; i++) {
          let q = [pts[j][i], pts[j][i + 1], pts[j + 1][i + 1], pts[j + 1][i]];
          const cn = cross(subtract(q[1].p, q[0].p), subtract(q[2].p, q[0].p));
          if (cn[axis] * sign < 0) q = q.reverse();
          this.quad(...q.map(a => a.p), col, q.map(a => a.n));
        }
      }
      this.transform = previous;
    }
    cylinder(p, radius, height, color, topRadius, segments = 20, rotation) {
      const previous = this.transform;
      if (rotation) this.transform = { p, rx: rotation[0], ry: rotation[1], rz: rotation[2] };
      const center = rotation ? [0, 0, 0] : p, r2 = topRadius == null ? radius : topRadius, col = rgb(color);
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
      this.transform = previous;
    }
    roof(p, w, d, h, color) {
      const col = rgb(color), [x, y, z] = p;
      const a = [x - w / 2, y, z - d / 2], b = [x + w / 2, y, z - d / 2], c = [x, y + h, z - d / 2];
      const A = [a[0], y, z + d / 2], B = [b[0], y, z + d / 2], D = [x, y + h, z + d / 2];
      this.quad(a, A, D, c, col); this.quad(c, D, B, b, shade(color, 0.96));
      this.triangle(A, B, D, shade(color, 1.05)); this.triangle(b, a, c, col);
      this.quad(a, b, B, A, shade(color, 0.8));
    }
  }

  function island(g, x, z, radius, y = 0, color = C.grass) {
    g.cylinder([x, y - 0.56, z], radius * 0.96, 0.88, C.soil, radius, 48);
    g.cylinder([x, y - 0.08, z], radius, 0.28, color, radius * 0.99, 48);
    g.sphere([x, y - 0.71, z], [radius * 0.91, 0.67, radius * 0.87], C.clay, 32, 10);
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * TAU;
      g.sphere([x + Math.cos(a) * radius * 0.76, y - 1.05, z + Math.sin(a) * radius * 0.76], [radius * 0.33, 0.42, radius * 0.27], '#fff9ef', 14, 8);
    }
  }
  function shadow(g, x, z, w, d, y = 0.075) { g.sphere([x, y, z], [w, 0.035, d], '#8ca478', 20, 6); }
  function cloud(g, x, y, z, size = 1) {
    const parts = [[0, 0, 0, 1.1, .33, .65], [-.55, .1, 0, .7, .5, .58], [.15, .25, -.05, .75, .58, .6], [.7, .06, .02, .7, .4, .5]];
    for (const a of parts) g.sphere([x + a[0] * size, y + a[1] * size, z + a[2] * size], a.slice(3).map(v => v * size), '#fffaf1', 18, 10);
  }
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
  function avatar(g, x, z, s = 1, color = C.mint, y = 0, bunny = true) {
    if (!bunny && window.CottageCharacters) { window.CottageCharacters.draw(g, x, z, s, typeof color === 'string' && color.startsWith('preset_') ? color : 'preset_sunny', y); return; }
    shadow(g, x, z, .35 * s, .23 * s, y + .075);
    g.sphere([x - .14 * s, y + .14 * s, z + .04 * s], [.13 * s, .13 * s, .19 * s], C.wood, 12, 8);
    g.sphere([x + .14 * s, y + .14 * s, z + .04 * s], [.13 * s, .13 * s, .19 * s], C.wood, 12, 8);
    g.sphere([x, y + .53 * s, z], [.31 * s, .4 * s, .24 * s], color, 18, 12);
    g.sphere([x - .3 * s, y + .59 * s, z], [.11 * s, .23 * s, .12 * s], C.cream, 12, 8);
    g.sphere([x + .3 * s, y + .59 * s, z], [.11 * s, .23 * s, .12 * s], C.cream, 12, 8);
    g.sphere([x, y + 1.04 * s, z], [.36 * s, .36 * s, .31 * s], C.cream, 20, 14);
    if (bunny) {
      for (const dx of [-.17, .17]) {
        g.sphere([x + dx * s, y + 1.5 * s, z - .04 * s], [.105 * s, .32 * s, .09 * s], C.cream, 14, 10);
        g.sphere([x + dx * s, y + 1.51 * s, z + .038 * s], [.052 * s, .23 * s, .024 * s], C.pink, 12, 8);
      }
    } else {
      g.sphere([x, y + 1.27 * s, z - .04 * s], [.38 * s, .22 * s, .3 * s], '#956d58', 18, 10);
      g.sphere([x + .23 * s, y + 1.4 * s, z - .06 * s], [.15 * s, .17 * s, .14 * s], '#956d58', 12, 8);
      g.cylinder([x, y + 1.3 * s, z], .43 * s, .09 * s, C.butter, null, 22);
      g.sphere([x, y + 1.39 * s, z], [.31 * s, .18 * s, .3 * s], C.butter, 18, 10);
    }
    for (const dx of [-.11, .11]) g.sphere([x + dx * s, y + 1.07 * s, z + .29 * s], [.032 * s, .042 * s, .018 * s], '#455a52', 10, 6);
    for (const dx of [-.21, .21]) g.sphere([x + dx * s, y + .97 * s, z + .26 * s], [.055 * s, .025 * s, .016 * s], C.pink, 10, 6);
    g.sphere([x, y + 1.0 * s, z + .31 * s], [.035 * s, .022 * s, .014 * s], '#b27d70', 10, 6);
    g.sphere([x, y + .65 * s, z + .235 * s], [.15 * s, .17 * s, .015 * s], C.cream, 12, 8);
    g.sphere([x, y + .74 * s, z + .26 * s], [.025 * s, .026 * s, .016 * s], C.butter, 8, 6);
  }
  function cottage(g, x, z, s = 1, roofColor = C.roof, y = 0) {
    const X = n => x + n * s, Y = n => y + n * s, Z = n => z + n * s;
    shadow(g, x + .25 * s, z + .2 * s, 2.12 * s, 1.6 * s, y + .06);
    g.box([x, Y(.2), z], [4.05 * s, .4 * s, 3.25 * s], C.clay, .15 * s);
    g.box([x, Y(1.71), z], [3.8 * s, 3.0 * s, 3.0 * s], C.cream, .12 * s);
    g.roof([x, Y(3.16), z], 4.45 * s, 3.65 * s, 1.5 * s, roofColor);
    g.box([x, Y(3.16), Z(1.83)], [4.5 * s, .17 * s, .16 * s], shade(roofColor, .9), .07 * s);
    const slope = Math.atan2(1.5, 2.225);
    for (let k = 0; k < 6; k++) for (const side of [-1, 1]) {
      const xx = side * (k + .5) * 2.225 / 6;
      const yy = 3.16 + 1.5 * (1 - Math.abs(xx) / 2.225);
      g.box([X(xx), Y(yy + .035), z], [.035 * s, .08 * s, 3.64 * s], shade(roofColor, k % 2 ? 1.02 : .96), .015 * s, [0, 0, -side * slope]);
    }
    g.cylinder([x, Y(4.69), z], .09 * s, 3.75 * s, shade(roofColor, 1.06), null, 12, [Math.PI / 2, 0, 0]);
    g.box([X(1.14), Y(4.05), Z(-.5)], [.55 * s, 1.35 * s, .57 * s], C.cream, .055 * s);
    g.box([X(1.14), Y(4.75), Z(-.5)], [.7 * s, .17 * s, .72 * s], C.clay, .045 * s);
    for (let i = 0; i < 3; i++) g.sphere([X(1.14 - .1 * i), Y(5.02 + i * .3), Z(-.5)], [(.16 + i * .035) * s, (.17 + i * .025) * s, (.16 + i * .035) * s], '#fff7ec', 14, 8);
    // 门口有实体门框、拱顶和黄铜把手。
    g.box([x, Y(1.1), Z(1.535)], [1.08 * s, 1.85 * s, .18 * s], C.white, .17 * s);
    g.box([x, Y(1.08), Z(1.65)], [.84 * s, 1.63 * s, .13 * s], C.teal, .18 * s);
    g.sphere([x, Y(1.87), Z(1.66)], [.42 * s, .38 * s, .07 * s], C.teal, 22, 12);
    g.sphere([X(.27), Y(1.02), Z(1.76)], [.055 * s, .055 * s, .05 * s], C.butter, 12, 8);
    g.box([x, Y(.23), Z(1.89)], [1.3 * s, .17 * s, .7 * s], '#f6dfbc', .08 * s);
    for (const xx of [-1.15, 1.15]) {
      g.box([X(xx), Y(1.96), Z(1.55)], [.9 * s, 1.0 * s, .19 * s], C.white, .11 * s);
      g.box([X(xx), Y(1.96), Z(1.67)], [.69 * s, .78 * s, .08 * s], '#9cc7c5', .07 * s);
      g.box([X(xx), Y(1.96), Z(1.73)], [.055 * s, .78 * s, .04 * s], C.white, .015 * s);
      g.box([X(xx), Y(1.96), Z(1.73)], [.69 * s, .055 * s, .04 * s], C.white, .015 * s);
      for (const side of [-1, 1]) g.box([X(xx + .52 * side), Y(1.96), Z(1.63)], [.2 * s, 1.0 * s, .1 * s], C.mint, .04 * s);
      g.box([X(xx), Y(1.38), Z(1.8)], [1.0 * s, .21 * s, .35 * s], C.wood, .06 * s);
      for (let k = 0; k < 3; k++) flower(g, X(xx + (k - 1) * .28), Z(1.83), k % 2 ? C.butter : C.pink, .75 * s, Y(1.43));
    }
    g.cylinder([x, Y(3.75), Z(1.85)], .31 * s, .1 * s, C.white, null, 24, [Math.PI / 2, 0, 0]);
    g.cylinder([x, Y(3.75), Z(1.92)], .22 * s, .11 * s, C.teal, null, 24, [Math.PI / 2, 0, 0]);
    g.box([x, Y(3.75), Z(1.99)], [.045 * s, .43 * s, .03 * s], C.white, .01 * s);
    g.box([x, Y(3.75), Z(1.99)], [.43 * s, .045 * s, .03 * s], C.white, .01 * s);
    // 右侧外墙窗和招牌增加转动后的可看细节。
    g.box([X(1.94), Y(1.95), z], [.13 * s, 1.08 * s, 1.12 * s], C.white, .08 * s);
    g.box([X(2.02), Y(1.95), z], [.08 * s, .86 * s, .88 * s], C.blue, .06 * s);
    g.box([X(2.07), Y(1.95), z], [.04 * s, .86 * s, .06 * s], C.white, .01 * s);
    g.box([X(2.07), Y(1.95), z], [.04 * s, .06 * s, .88 * s], C.white, .01 * s);
    for (let k = 0; k < 4; k++) g.box([x, Y(.1), Z(2.3 + .46 * k)], [1.0 * s, .07 * s, .34 * s], '#f0dfbd', .14 * s);
  }
  // 多层小屋仍沿用原游戏的「每层三格」；楼板、隔墙与房间是真实几何。
  function houseRoom(g, cx, floorY, cz, kind, accent) {
    const box = (x, y, z, w, h, d, color, round = .05) => g.box([cx + x, floorY + y, cz + z], [w, h, d], color, round);
    const cyl = (x, y, z, r, h, color) => g.cylinder([cx + x, floorY + y, cz + z], r, h, color, null, 16);
    // 后墙窗户让各格拥有可辨认的室内尺度。
    box(0, 1.1, -1.38, .83, .85, .09, C.white, .09);
    box(0, 1.1, -1.32, .68, .7, .04, C.blue, .06);
    box(0, 1.1, -1.285, .035, .7, .025, C.white, .008);
    box(0, 1.1, -1.28, .68, .035, .03, C.white, .008);
    for (const x of [-.5, .5]) box(x, 1.1, -1.31, .15, .95, .08, accent, .035);
    box(0, .67, -1.24, 1.05, .08, .22, C.wood, .025);
    if (kind === 'living') {
      cyl(0, .12, .25, .81, .025, '#e6bdad');
      box(0, .36, -.45, 1.63, .42, .65, accent, .13);
      box(0, .67, -.72, 1.7, .68, .18, accent, .09);
      for (const x of [-.76, .76]) box(x, .47, -.43, .18, .46, .72, accent, .08);
      for (const x of [-.35, .35]) box(x, .59, -.3, .61, .11, .48, shade(accent, 1.13), .045);
      box(-.5, .82, -.47, .3, .3, .12, C.butter, .07);
      cyl(0, .53, .58, .45, .08, C.cream); cyl(0, .29, .58, .08, .48, C.wood);
      cyl(.09, .63, .59, .08, .12, C.pink);
    } else if (kind === 'dining') {
      cyl(0, .76, .04, .65, .1, C.butter); cyl(0, .43, .04, .1, .62, C.wood);
      for (const x of [-.82, .82]) { box(x, .33, .12, .4, .11, .44, accent); box(x, .51, -.08, .41, .48, .1, accent); box(x, .18, .12, .08, .3, .1, C.wood); }
      cyl(0, .84, .02, .28, .025, C.white);
      g.sphere([cx, floorY + .94, cz + .02], [.2, .14, .18], C.pink, 12, 8);
      box(.68, .36, -.95, .48, .55, .38, C.wood);
    } else if (kind === 'kitchen') {
      box(0, .43, -.76, 1.72, .73, .63, accent, .07);
      box(0, .83, -.75, 1.83, .1, .72, C.cream, .04);
      for (const x of [-.54, 0, .54]) { box(x, .45, -.425, .45, .55, .035, shade(accent, 1.1), .03); box(x, .64, -.39, .14, .035, .035, C.wood, .01); }
      cyl(-.48, .9, -.75, .2, .035, '#637870'); cyl(-.48, .94, -.75, .15, .08, C.butter);
      box(.44, .91, -.74, .45, .035, .38, C.blue, .05);
      box(.51, 1.07, -1.05, .035, .29, .035, C.wood, .012);
      cyl(.51, 1.22, -.96, .025, .2, C.wood);
      box(-.69, 1.38, -1.3, .48, .35, .18, C.cream);
    } else if (kind === 'bedroom') {
      box(-.1, .31, -.22, 1.13, .33, 1.65, C.wood, .06);
      box(-.1, .52, -.22, 1.09, .22, 1.58, C.white, .09);
      box(-.1, .68, .08, 1.11, .16, .99, accent, .07);
      box(-.1, .67, -.8, .85, .15, .36, C.white, .07);
      box(-.1, .72, -1.02, 1.2, 1.12, .12, accent, .08);
      box(.78, .36, -.56, .43, .51, .45, C.cream);
      cyl(.78, .73, -.56, .025, .23, C.wood); g.cylinder([cx + .78, floorY + .91, cz - .56], .19, .23, C.butter, .11, 14);
    } else if (kind === 'study') {
      box(0, .79, -.63, 1.55, .11, .62, C.wood);
      for (const x of [-.64, .64]) box(x, .43, -.63, .09, .7, .42, C.wood, .025);
      box(.23, .88, -.63, .45, .035, .34, C.white, .01);
      box(-.46, 1.05, -.73, .09, .45, .09, C.wood, .025);
      g.cylinder([cx - .46, floorY + 1.29, cz - .73], .22, .19, C.butter, .12, 14);
      box(.03, .37, .14, .46, .11, .46, accent);
      box(.03, .63, .34, .49, .5, .09, accent);
      box(.75, .51, .57, .41, .77, .4, C.cream);
      for (let i = 0; i < 4; i++) box(.62 + i * .09, .73, .79, .06, .33 + i % 2 * .06, .2, [C.pink, C.blue, C.butter, C.mint][i], .012);
    } else if (kind === 'art') {
      for (const x of [-.39, .39]) box(x, .61, -.15, .07, 1.1, .09, C.wood, .02);
      box(0, 1.04, -.12, 1.02, 1.04, .09, C.wood, .025);
      box(0, 1.05, -.055, .86, .87, .035, C.white, .015);
      g.sphere([cx - .1, floorY + 1.14, cz - .015], [.17, .18, .022], C.pink, 12, 8);
      g.sphere([cx + .13, floorY + 1.14, cz - .015], [.17, .18, .022], C.pink, 12, 8);
      box(.77, .59, .53, .43, .09, .5, C.butter); box(.77, .34, .53, .08, .5, .08, C.wood);
      for (let i = 0; i < 3; i++) cyl(.65 + i * .1, .68, .56, .05, .08, [C.pink, C.mint, C.lilac][i]);
    } else if (kind === 'music') {
      box(0, .48, -.53, 1.5, .76, .59, C.wood, .06);
      box(0, .92, -.73, 1.5, .5, .18, C.wood, .06);
      box(0, .84, -.17, 1.49, .06, .29, C.white, .018);
      for (let i = 0; i < 9; i++) { box(-.63 + i * .15, .88, -.14, .014, .013, .25, C.clay, .002); if (i % 3 !== 0) box(-.6 + i * .15, .91, -.22, .065, .06, .15, C.dark, .009); }
      box(0, .39, .45, .7, .12, .42, accent); for (const x of [-.25, .25]) box(x, .22, .45, .06, .33, .29, C.wood, .02);
    } else if (kind === 'games') {
      cyl(0, .14, .25, .8, .035, accent);
      box(0, .44, -.71, 1.65, .59, .54, C.wood);
      box(0, 1.02, -.76, 1.05, .69, .13, C.cream, .08);
      box(0, 1.03, -.68, .88, .52, .035, C.teal, .04);
      for (let i = 0; i < 3; i++) g.sphere([cx + (i - 1) * .23, floorY + 1.03, cz - .65], [.06, .065, .02], [C.butter, C.pink, C.mint][i], 8, 6);
      for (const x of [-.55, .55]) g.sphere([cx + x, floorY + .3, cz + .51], [.38, .26, .35], x < 0 ? C.pink : C.butter, 14, 9);
      box(0, .26, .11, .38, .15, .25, C.white, .07);
    } else if (kind === 'wardrobe') {
      for (const x of [-.81, .81]) box(x, .83, -.75, .08, 1.43, .36, C.wood, .025);
      box(0, 1.5, -.75, 1.75, .08, .48, C.wood);
      for (let i = 0; i < 4; i++) box(-.57 + i * .39, 1.01, -.7, .31, .7, .27, [C.pink, C.butter, C.mint, C.lilac][i], .07);
      box(.66, .7, .54, .45, 1.2, .08, C.wood, .12);
      box(.66, .71, .6, .33, 1.05, .035, C.blue, .1);
      cyl(-.38, .3, .35, .35, .4, accent);
    } else if (kind === 'greenhouse') {
      for (const x of [-.64, 0, .64]) { box(x, .28, -.54, .46, .3, .43, C.wood); for (const z of [-.6, -.38]) flower(g, cx + x, cz + z, C.pink, .85, floorY + .43); }
      for (const x of [-.52, .45]) planter(g, cx + x, cz + .61, accent, floorY + .1);
    } else if (kind === 'pets') {
      box(-.42, .29, -.41, .85, .31, .83, accent, .12);
      g.sphere([cx - .42, floorY + .47, cz - .41], [.28, .14, .25], C.white, 14, 8);
      for (const x of [.35, .75]) cyl(x, .2, .5, .15, .15, x < .5 ? C.pink : C.butter);
      box(.63, .64, -.75, .11, 1.1, .12, C.wood);
      box(.63, 1.21, -.75, .6, .12, .55, accent);
    } else {
      box(0, .77, -.53, 1.55, .13, .72, C.wood);
      for (const x of [-.63, .63]) box(x, .4, -.53, .1, .67, .45, C.wood);
      g.sphere([cx, floorY + .98, cz - .53], [.27, .16, .25], C.pink, 14, 8);
      box(-.63, .99, -.53, .16, .28, .16, C.butter);
      box(.62, .99, -.53, .19, .23, .19, C.mint);
    }
  }
  function multiCottage(g, options, roofColor, sofaColor) {
    const floors = options.floors, focused = options.floor !== 'all', exterior = options.view === 'exterior';
    const x = -.38, z = -.72, width = 7.0, depth = 4.2, step = 1.78;
    const halfDepth = depth / 2, backExtra = (depth - 3.0) / 2;
    const shown = focused && !exterior ? [Number(options.floor) - 1] : Array.from({ length: floors }, (_, i) => i);
    const rows = [ ['living', 'dining', 'kitchen'], ['bedroom', 'study', 'art'], ['music', 'games', 'wardrobe'], ['pets', 'greenhouse', 'workshop'] ];
    const accents = [[sofaColor, C.butter, C.mint], [C.pink, C.blue, C.lilac], [C.butter, C.lilac, C.mint], [C.pink, C.mint, C.blue]];
    shadow(g, x + .2, z + .2, 3.7, depth * .6);
    g.box([x, .24, z], [width + .25, .42, depth + .3], C.clay, .12);
    // 所有楼层共用结构与一片屋顶；增大实体进深，家具按原比例靠后陈列，前方留出走道。
    for (let i = 0; i < shown.length; i++) {
      const f = shown[i], y = .48 + i * step;
      g.box([x, y, z], [width + .17, .18, depth + .22], C.wood, .055);
      g.box([x, y + .11, z], [width - .01, .055, depth + .03], '#eed9bb', .025);
      for (let k = 0; k < 13; k++) g.box([x - 3.23 + k * .54, y + .145, z], [.012, .009, depth - .02], '#d3bea2', .002);
      if (exterior) {
        g.box([x, y + .89, z], [width, 1.63, depth], f % 2 ? '#f6ead1' : C.cream, .07);
        for (let c = 0; c < 3; c++) {
          const cx = x + (c - 1) * 2.31;
          const door = f === 0 && c === 1;
          g.box([cx, y + (door ? .7 : .96), z + halfDepth + .04], [door ? .78 : 1.12, door ? 1.35 : 1.05, .13], C.white, .09);
          g.box([cx, y + (door ? .7 : .96), z + halfDepth + .13], [door ? .62 : .91, door ? 1.22 : .84, .07], door ? C.teal : C.blue, .06);
          if (door) g.sphere([cx + .18, y + .65, z + halfDepth + .19], [.035, .035, .035], C.butter, 8, 6);
          else {
            g.box([cx, y + .96, z + halfDepth + .18], [.04, .87, .03], C.white, .01);
            g.box([cx, y + .96, z + halfDepth + .18], [.93, .04, .03], C.white, .01);
            for (const dx of [-.64, .64]) g.box([cx + dx, y + .96, z + halfDepth + .1], [.16, 1.06, .07], accents[f][c], .025);
            g.box([cx, y + .38, z + halfDepth + .23], [1.15, .14, .25], C.wood, .04);
            for (const dx of [-.34, 0, .34]) flower(g, cx + dx, z + halfDepth + .26, c % 2 ? C.butter : C.pink, .55, y + .42);
          }
        }
        for (const zz of [-1.12, 1.08]) {
          g.box([x + 3.54, y + .94, z + zz], [.09, .94, .82], C.white, .06);
          g.box([x + 3.6, y + .94, z + zz], [.04, .75, .65], C.blue, .035);
          g.box([x + 3.63, y + .94, z + zz], [.025, .75, .035], C.white, .005);
        }
      } else {
        g.box([x, y + .91, z - halfDepth + .03], [7.05, 1.61, .16], f % 2 ? '#e7e8d5' : '#efddca', .045);
        g.box([x - 3.48, y + .91, z], [.13, 1.61, depth - .02], '#f2dccd', .04);
        for (const divider of [-1.16, 1.16]) {
          g.box([x + divider, y + .73, z - .92], [.11, 1.31, 2.3], C.cream, .03);
          g.box([x + divider, y + .25, z + 1.32], [.11, .34, 1.42], C.cream, .025);
        }
        for (let c = 0; c < 3; c++) houseRoom(g, x + (c - 1) * 2.31, y + .14, z + .15, rows[f][c], accents[f][c]);
        // 右缘切墙只保留短立柱，保持九格中的家具可见。
        for (const zz of [-halfDepth + .07, halfDepth - .07]) g.box([x + 3.48, y + .92, z + zz], [.13, 1.63, .13], C.cream, .035);
        g.box([x, y + .14, z + halfDepth + .02], [7.07, .2, .12], '#dec29b', .04);
        if (f % 2 === 0) avatar(g, x - 2.68, z + 1.28, .39, C.pink, y + .15, true);
      }
      // 楼板前缘的奶油线使每层分界在远景仍然清楚。
      g.box([x, y - .025, z + halfDepth + .14], [7.25, .13, .13], focused && !exterior ? C.butter : C.cream, .035);
      // 侧边小楼梯连接相邻楼层，保持整栋房子的生活尺度。
      if (!focused && i < shown.length - 1) {
        const reverse = i % 2 === 1;
        for (let k = 0; k < 7; k++) {
          const zz = z + (reverse ? -1.55 + k * .51 : 1.55 - k * .51);
          g.box([x + 3.78, y + .16 + k * .24, zz], [.49, .17, .57], '#e2c49f', .035);
        }
        for (let k = 0; k < 8; k++) {
          const zz = z + (reverse ? -1.55 + k * .44 : 1.55 - k * .44);
          g.box([x + 4.0, y + .59 + k * .235, zz], [.045, .7, .045], C.white, .012);
        }
      }
    }
    if (!focused || exterior) {
      const top = .48 + floors * step;
      g.box([x, top - .07, z], [width + .3, .18, depth + .35], C.cream, .06);
      g.roof([x, top, z], width + .6, depth + .65, 1.08, roofColor);
      // 珊瑚瓦片与屋脊只属于整屋最上方。
      const slope = Math.atan2(1.08, 3.8);
      for (let i = 0; i < 10; i++) for (const side of [-1, 1]) {
        const xx = side * (i + .5) * .38;
        const yy = top + 1.08 * (1 - Math.abs(xx) / 3.8);
        g.box([x + xx, yy + .028, z], [.028, .055, depth + .62], shade(roofColor, i % 2 ? 1.06 : .96), .009, [0, 0, -side * slope]);
      }
      g.cylinder([x, top + 1.1, z], .075, depth + .72, shade(roofColor, 1.08), null, 12, [Math.PI / 2, 0, 0]);
      // 独立阁楼天文台，不占普通房间格：小圆穹、暖窗与屋顶望远镜。
      g.cylinder([x + 1.28, top + .74, z + .54], .56, .75, C.cream, null, 24);
      g.sphere([x + 1.28, top + 1.14, z + .54], [.59, .44, .59], C.mint, 20, 12);
      g.box([x + 1.28, top + .77, z + 1.12], [.42, .43, .07], C.white, .09);
      g.box([x + 1.28, top + .77, z + 1.17], [.28, .3, .035], C.butter, .07);
      g.cylinder([x - .53, top + .67, z + halfDepth - .14], .035, .45, C.wood, null, 8);
      g.cylinder([x - .53, top + .99, z + halfDepth - .14], .12, .74, C.butter, .14, 14, [0, 0, -.7]);
      g.box([x - 2.58, top + .71, z - .68], [.39, 1.26, .4], C.clay, .045);
      for (let i = 0; i < 2; i++) g.sphere([x - 2.58 + .12 * i, top + 1.44 + .23 * i, z - .68], [.15 + .025 * i, .17, .15], C.white, 12, 8);
    }
    return { top: focused && !exterior ? 2.3 : .48 + floors * step + 1.65, focused: focused && !exterior };
  }
  function garden(g, x, z, scale = 1, columns = 2) {
    for (let row = 0; row < 3; row++) for (let col = 0; col < columns; col++) {
      const px = x + (col - (columns - 1) / 2) * 1.2 * scale, pz = z + (row - 1) * .95 * scale, index = row * columns + col;
      g.box([px, .16, pz], [1.04 * scale, .21, .79 * scale], C.wood, .1);
      g.box([px, .285, pz], [.87 * scale, .065, .64 * scale], '#9b7961', .06);
      // 主花园九格混合展示空地、种子、发芽、花苞和成熟；前院缩略图保持原来的六格。
      if (columns === 3 && [2, 6].includes(index)) continue;
      if (columns === 3 && index === 7) { for (const dx of [-.2, .2]) g.sphere([px + dx * scale, .34, pz], [.1, .055, .07], C.butter, 10, 6); continue; }
      if (columns === 3 && index === 4) { for (const dx of [-.2, .2]) { g.cylinder([px + dx * scale, .42, pz], .02, .22, C.teal, null, 8); g.sphere([px + dx * scale - .06, .5, pz], [.12, .04, .07], C.mint, 10, 6); } continue; }
      for (let k = 0; k < 3; k++) {
        const xx = px + (k - 1) * .25 * scale;
        if (row === 1 || (columns === 3 && index === 5)) {
          g.sphere([xx, .45, pz], [.13, .15, .13], columns === 3 ? (index === 5 ? C.lilac : C.pink) : '#efb26c', 12, 8);
          g.cylinder([xx, .6, pz], .025, .12, C.teal, null, 6);
        } else flower(g, xx, pz, columns === 3 && index === 0 ? C.white : columns === 3 && index === 8 ? C.lilac : row ? C.butter : C.pink, columns === 3 && index === 1 ? .55 : .8, .3);
      }
    }
    g.box([x + (columns === 3 ? 2.15 : 1.6) * scale, .4, z + .3], [.5, .13, .3], C.blue, .06);
    g.cylinder([x + (columns === 3 ? 2.15 : 1.6) * scale, .68, z + .3], .15, .5, C.blue, .2, 16);
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
  function cake(g, x, z, y = .95, size = 1) {
    g.cylinder([x, y, z], .43 * size, .07 * size, C.white, null, 28);
    g.cylinder([x, y + .19 * size, z], .34 * size, .32 * size, '#f4dbac', null, 28);
    g.cylinder([x, y + .37 * size, z], .355 * size, .08 * size, C.pink, null, 28);
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6;
      g.sphere([x + Math.cos(a) * .25 * size, y + .45 * size, z + Math.sin(a) * .25 * size], [.055 * size, .08 * size, .055 * size], C.roof, 10, 8);
    }
  }
  function room(g, sofaColor) {
    g.box([0, .15, 0], [6.8, .35, 5.4], C.wood, .15);
    g.box([0, .36, 0], [6.55, .1, 5.15], '#edd8b8', .08);
    for (let i = -5; i <= 5; i++) g.box([i * .58, .42, 0], [.018, .012, 5.08], '#d9c4a7', .003);
    g.box([0, 2.1, -2.55], [6.8, 3.5, .21], '#e7e9d1', .08);
    g.box([-3.28, 2.1, 0], [.21, 3.5, 5.3], '#f4d8cf', .08);
    g.box([0, .58, -2.37], [6.6, .25, .12], C.white, .03);
    g.box([-3.11, .58, 0], [.12, .25, 5.1], C.white, .03);
    // 背墙圆窗、窗帘与挂画。
    g.box([-1.65, 2.55, -2.4], [1.63, 1.55, .15], C.white, .17);
    g.box([-1.65, 2.55, -2.29], [1.37, 1.29, .08], C.blue, .12);
    for (const dx of [-.9, .9]) g.box([-1.65 + dx, 2.46, -2.18], [.32, 1.73, .18], C.butter, .12);
    g.box([-1.65, 2.55, -2.2], [.07, 1.4, .05], C.white, .02);
    g.box([-1.65, 2.55, -2.2], [1.4, .07, .05], C.white, .02);
    g.box([1.18, 2.85, -2.38], [1.15, 1.0, .12], C.wood, .07);
    g.box([1.18, 2.85, -2.29], [.94, .8, .03], C.cream, .03);
    g.sphere([1.18, 2.89, -2.25], [.28, .27, .02], C.pink, 16, 10);
    g.sphere([1.11, 3.02, -2.22], [.09, .2, .02], C.white, 12, 8);
    g.sphere([1.29, 3.02, -2.22], [.09, .2, .02], C.white, 12, 8);
    // 地毯和软沙发。
    g.cylinder([-.8, .45, .5], 1.85, .035, '#e5b4a9', null, 48);
    g.cylinder([-.8, .48, .5], 1.62, .025, '#f3c9bd', null, 48);
    const color = sofaColor || C.mint;
    g.box([-1.45, .87, -1.25], [2.65, .65, 1.12], shade(color, .9), .22);
    g.box([-1.45, 1.39, -1.68], [2.8, .95, .39], color, .18);
    for (const x of [-2.7, -.2]) g.box([x, 1.06, -1.25], [.33, .65, 1.18], color, .16);
    for (const x of [-2.02, -.86]) g.box([x, 1.1, -1.15], [1.05, .2, .83], shade(color, 1.1), .1);
    for (const x of [-2.2, -.65]) g.box([x, 1.48, -1.35], [.5, .5, .18], x < -1 ? C.butter : C.pink, .13, [.15, 0, x < -1 ? .12 : -.1]);
    table(g, -.65, .55, .83, .42, C.cream);
    g.cylinder([-.65, 1.21, .55], .18, .025, C.pink, null, 18);
    g.cylinder([-.72, 1.32, .55], .085, .18, C.white, null, 16);
    g.box([-.25, 1.23, .65], [.29, .055, .23], C.teal, .015);
    // 床和边柜。
    g.box([2.15, .7, -1.15], [1.55, .47, 2.12], C.wood, .1);
    g.box([2.15, 1.18, -2.03], [1.68, 1.38, .19], C.pink, .15);
    g.box([2.15, 1.0, -1.12], [1.5, .3, 1.98], C.white, .14);
    g.box([2.15, 1.18, -.74], [1.53, .23, 1.25], C.butter, .13);
    g.box([2.15, 1.23, -1.76], [1.13, .24, .5], C.white, .15);
    g.box([2.58, .8, 1.35], [.75, .77, .72], C.cream, .06);
    g.box([2.58, 1.21, 1.35], [.84, .12, .79], C.wood, .04);
    planter(g, 2.58, 1.35, C.pink, 1.27);
    // 落地灯、书架、绿植。
    g.cylinder([-2.65, .51, 1.42], .3, .1, C.wood, null, 20);
    g.cylinder([-2.65, 1.35, 1.42], .035, 1.7, C.wood, null, 10);
    g.cylinder([-2.65, 2.22, 1.42], .46, .54, C.butter, .25, 24);
    g.sphere([-2.65, 1.98, 1.42], [.12, .14, .12], C.white, 12, 8);
    g.box([.56, .96, -2.02], [1.0, 1.15, .53], C.wood, .05);
    for (const y of [.51, 1.0, 1.5]) g.box([.56, y, -1.7], [1.1, .1, .64], C.cream, .04);
    for (let i = 0; i < 5; i++) g.box([.2 + i * .15, 1.24, -1.76], [.11, .4 + i % 2 * .08, .36], [C.pink, C.blue, C.butter, C.mint, C.lilac][i], .02);
    avatar(g, .6, 1.55, .75, C.butter, .42, false);
    avatar(g, -1.65, 1.65, .58, C.pink, .42, true);
  }

  class CottageScene {
    constructor(canvas) {
      this.canvas = canvas; this.sceneName = 'home'; this.night = false;
      this.angle = .64; this.elevation = .52; this.scale = 10.3; this.baseScale = 10.3;
      this.furnitureColor = C.mint; this.avatarColor = C.butter; this.avatarPreset = 'preset_sunny'; this.avatarOverrides = {}; this.roofColor = C.roof; this.added = [];
      this.house = { floors: 3, floor: 'all', view: 'cutaway' }; this.cameraTargetY = 1.1;
      this.playerPositions = { home: { x: -.3, z: 2.6 }, visit: { x: -.3, z: 2.6 }, team: { x: .2, z: 2.25 }, coop: { x: .2, z: 2.25 } };
      this.movementMarker = null;
      this._paused = document.hidden; this._lastFrame = 0; this._dirty = true;
      this._reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.gl = canvas.getContext('webgl', { alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
      if (this.gl) { this._initGL(); this._build(); } else this._fallback = canvas.getContext('2d');
      this._bind(); this._resize();
      this._tick = time => {
        this._raf = requestAnimationFrame(this._tick);
        if (this._paused || time - this._lastFrame < 33) return;
        this._lastFrame = time;
        if (this._dirty) { this._render(); this._dirty = false; }
      };
      this._raf = requestAnimationFrame(this._tick);
    }
    _initGL() {
      const gl = this.gl;
      const vertex = `attribute vec3 aPosition; attribute vec3 aNormal; attribute vec3 aColor; uniform mat4 uMatrix; varying vec3 vNormal; varying vec3 vColor; varying vec3 vPosition; void main(){ vNormal=aNormal; vColor=aColor; vPosition=aPosition; gl_Position=uMatrix*vec4(aPosition,1.0); }`;
      const fragment = `precision mediump float; varying vec3 vNormal; varying vec3 vColor; varying vec3 vPosition; uniform float uNight; uniform vec3 uEye; void main(){ vec3 n=normalize(vNormal); vec3 light=normalize(vec3(-0.7,1.4,1.1)); float diffuse=max(dot(n,light),0.0); float hemi=n.y*0.5+0.5; vec3 lighting=vec3(0.58,0.61,0.59)+vec3(0.27,0.25,0.20)*diffuse+vec3(0.18,0.19,0.20)*hemi; vec3 halfDirection=normalize(light+normalize(uEye-vPosition)); float spec=pow(max(dot(n,halfDirection),0.0),28.0)*0.08; vec3 color=vColor*lighting+spec; color=mix(color,color*vec3(0.58,0.64,0.84)+vec3(0.04,0.045,0.065),uNight*0.72); gl_FragColor=vec4(color,1.0); }`;
      const compile = (type, source) => { const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader); if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader)); return shader; };
      const program = gl.createProgram(); gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex)); gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment)); gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      this.program = program; this.buffer = gl.createBuffer();
      this.locations = { position: gl.getAttribLocation(program, 'aPosition'), normal: gl.getAttribLocation(program, 'aNormal'), color: gl.getAttribLocation(program, 'aColor'), matrix: gl.getUniformLocation(program, 'uMatrix'), night: gl.getUniformLocation(program, 'uNight'), eye: gl.getUniformLocation(program, 'uEye') };
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE); gl.clearColor(0, 0, 0, 0);
    }
    _build() {
      this.cameraTargetY = 1.1; this.canvas.dataset.houseFloors = String(this.house.floors); this.canvas.dataset.houseFloor = String(this.house.floor); this.canvas.dataset.houseView = this.house.view;
      if (!this.gl) { this._dirty = true; return; }
      const g = new Geometry(), name = this.sceneName;
      const tiny = (x, z, s, col) => cottage(g, x, z, s, col);
      if (name === 'village') {
        this.baseScale = 13.6;
        const places = [[-3.6, 1.1, 2.35, C.roof], [2.1, 2.7, 1.75, C.mint], [1.2, -3.4, 2.1, C.lilac], [-4.4, -4.2, 1.4, C.butter], [5, -1, 1.45, '#a3b9d5']];
        for (const [x, z, r, col] of places) {
          island(g, x, z, r); tiny(x, z - .3, r * .24, col); tree(g, x - r * .63, z - .2, r * .23, C.mint);
          avatar(g, x + r * .35, z + r * .46, r * .2, col);
          for (let k = 0; k < 4; k++) flower(g, x - r * .5 + k * r * .22, z + r * .55, k % 2 ? C.white : C.pink, .65);
        }
        for (let i = 0; i < 16; i++) {
          const t = i / 15;
          g.sphere([-3.5 + t * 5.4, -.25 + Math.sin(t * Math.PI) * .15, 1.4 + t * 1.2], [.11, .035, .11], C.butter, 8, 6);
          g.sphere([-2.9 + t * 4.1, -.35 + Math.sin(t * Math.PI) * .15, .7 - t * 4.0], [.09, .03, .09], C.white, 8, 6);
        }
        cloud(g, -.8, -.8, 4.8, .9); cloud(g, 4.9, .1, -5.2, 1.05); cloud(g, -6, .3, -1.4, .65);
      } else if (name === 'decorate') {
        const shape = multiCottage(g, this.house, this.roofColor, this.furnitureColor);
        this.baseScale = (shape.focused ? 10.0 : 10.1 + this.house.floors * .82) * .97; this.cameraTargetY = shape.focused ? .9 : 1.0 + this.house.floors * .27;
        if (!shape.focused && this.house.floors === 4) { this.baseScale = Math.max(13.95, this.baseScale); this.cameraTargetY = 2.65; }
        island(g, 0, 0, 5.8, -.2);
        tree(g, -4.1, -2.4, .56, C.mint); flower(g, 3.9, 1.4, C.pink, 1.1); flower(g, 3.7, 1.9, C.white, 1.1);
      } else if (name === 'wardrobe') {
        this.baseScale = 8.8; island(g, 0, 0, 4.5);
        g.cylinder([0, .26, .3], 2.1, .35, '#e9c6ba', null, 48); g.cylinder([0, .46, .3], 1.96, .12, C.cream, null, 48);
        this._drawPlayer(g, 0, .5, 2.05, .5);
        g.box([-2.35, 1.7, -.8], [1.35, 2.9, .18], C.wood, .28);
        g.box([-2.35, 1.7, -.67], [1.11, 2.64, .055], '#c7ded6', .24);
        for (const x of [1.7, 3.2]) g.cylinder([x, 1.3, -.8], .06, 2.5, C.wood, null, 10);
        g.cylinder([2.45, 2.5, -.8], .06, 1.55, C.wood, null, 10, [0, 0, Math.PI / 2]);
        for (let i = 0; i < 4; i++) g.box([1.9 + i * .33, 1.95, -.8], [.27, .75, .38], [C.pink, C.mint, C.butter, C.lilac][i], .08);
        planter(g, -2.7, 1.45, C.mint); tree(g, 3.1, -2, .65, C.mint);
      } else if (name === 'garden') {
        this.baseScale = 10.6; island(g, 0, 0, 5.1);
        garden(g, -.75, 1.0, 1.12, 3);
        g.box([1.9, .15, -1.8], [2.15, .2, 2.1], C.cream, .1);
        g.box([1.9, 1.1, -1.8], [2.0, 1.75, 1.95], '#b8d7c7', .04);
        g.roof([1.9, 2.0, -1.8], 2.25, 2.2, .75, '#cde7d7');
        for (const x of [.88, 1.9, 2.92]) g.box([x, 1.2, -.79], [.08, 1.9, .1], C.white, .02);
        for (const y of [.6, 1.3, 2.0]) g.box([1.9, y, -.77], [2.1, .07, .09], C.white, .015);
        g.box([1.9, 1.0, -.7], [.62, 1.65, .12], '#eaf2d7', .06);
        tree(g, -3.25, -1.8, .85, '#c2cd89'); tree(g, 3.65, .75, .7, C.mint);
        avatar(g, 1.75, 2.55, .75, C.butter, 0, false); fence(g, -3.7, 2.8, 5); fence(g, -4, -2.6, 6, Math.PI / 2);
      } else if (['team', 'coop', 'play', 'events'].includes(name)) {
        this.baseScale = 11.1; island(g, 0, 0, 5.3);
        tree(g, -3.6, -1.6, 1.15, C.mint); tree(g, 3.6, -1.8, .95, '#b7c482');
        g.roof([-1.5, .15, -1.8], 2.5, 2.4, 2.0, C.butter);
        g.roof([-1.5, .2, -.56], 1.4, .06, 1.4, '#d5b36e');
        g.roof([-1.5, .2, -.51], 1.1, .07, 1.15, '#fff0c6');
        for (const x of [-3.1, 3.1]) g.cylinder([x, 2.0, .2], .055, 4.0, C.wood, null, 10);
        for (let i = 0; i < 15; i++) {
          const t = i / 14, x = -3.1 + t * 6.2, y = 3.8 - Math.sin(t * Math.PI) * .65;
          g.sphere([x, y, .2], [.07, .09, .07], [C.butter, C.pink, C.white][i % 3], 10, 6);
          if (i < 14) g.box([x + .22, y + .01, .2], [.46, .018, .018], C.wood, .005);
        }
        table(g, .3, .4, 1.5, 0, C.cream); cake(g, .3, .4, 1.43, 1.4);
        if (name === 'coop') {
          g.box([1.2, .65, -1.7], [2.4, 1.1, .85], C.mint, .1);
          g.box([1.2, 1.25, -1.7], [2.65, .14, 1.0], C.white, .07);
          for (let i = 0; i < 4; i++) g.sphere([.4 + i * .38, 1.42, -1.65], [.12, .13, .12], i % 2 ? C.roof : C.butter, 10, 8);
        }
        const player = this.playerPositions[name] || { x: .2, z: 2.25 };
        avatar(g, -1.65, 1.6, .85, C.pink); this._drawPlayer(g, player.x, player.z, .83);
        avatar(g, 1.95, 1.1, .8, 'preset_bob', 0, false); avatar(g, 2.1, -1.05, .8, 'preset_curl', 0, false);
        bench(g, -2.65, .1);
        for (let i = 0; i < 12; i++) flower(g, -3.6 + (i % 6) * 1.3, 2.7 + Math.floor(i / 6) * .55, [C.pink, C.white, C.butter][i % 3], .85);
        if (name === 'events') {
          g.cylinder([2.6, 1.0, 1.9], .025, 2.0, C.wood, null, 8);
          g.sphere([2.6, 2.35, 1.9], [.38, .47, .36], C.pink, 18, 12);
          g.cylinder([3.05, .85, 2.1], .025, 1.7, C.wood, null, 8);
          g.sphere([3.05, 2.0, 2.1], [.32, .4, .31], C.butter, 18, 12);
        }
      } else if (name === 'observatory') {
        this.baseScale = 10.3; island(g, 0, 0, 4.9, 0, '#94b4a6');
        g.cylinder([-.8, .3, -.6], 2.0, .6, C.cream, null, 40);
        g.cylinder([-.8, 1.35, -.6], 1.8, 1.65, '#ced3d1', null, 40);
        g.sphere([-.8, 2.17, -.6], [1.82, 1.6, 1.82], C.mint, 32, 18);
        g.box([-.8, 2.4, 1.02], [.6, 2.4, .15], '#537b7a', .12);
        g.box([-.8, 1.05, 1.08], [.9, 1.5, .15], C.teal, .3);
        for (let i = 0; i < 4; i++) g.box([-.8, .12 + i * .06, 1.5 + (3 - i) * .3], [1.1, .22, .35], C.cream, .07);
        for (const x of [1.55, 2.45]) g.cylinder([x, .55, 1.2], .045, 1.0, C.wood, null, 10, [0, 0, x < 2 ? -.45 : .45]);
        g.cylinder([2.0, 1.45, 1.2], .21, 1.5, C.butter, .25, 20, [0, 0, -.72]);
        g.cylinder([2.47, 1.99, 1.2], .28, .12, C.teal, null, 20, [0, 0, -.72]);
        avatar(g, .6, 2.3, .85, C.lilac, 0, false); tree(g, -3.6, -.7, .8, '#839fa2');
        for (let i = 0; i < 18; i++) {
          const a = i * 2.399, r = 3.4 + i % 4 * .4;
          g.sphere([Math.cos(a) * r, .2 + i % 3 * .25, Math.sin(a) * r], [.055, .055, .055], C.butter, 8, 6);
        }
      } else if (name === 'shop') {
        this.baseScale = 10.6; island(g, 0, 0, 5.1);
        for (const x of [-1.7, 1.6]) {
          g.box([x, .6, -.4], [2.6, 1.0, 1.35], x < 0 ? C.mint : C.pink, .12);
          g.box([x, 1.15, -.4], [2.8, .14, 1.55], C.cream, .07);
          for (const dx of [-1.1, 1.1]) g.box([x + dx, 1.95, -.7], [.09, 2.6, .09], C.wood, .025);
          g.roof([x, 2.7, -.7], 2.85, 2.0, .6, x < 0 ? C.mint : C.roof);
          for (let i = 0; i < 5; i++) g.box([x - 1.1 + i * .55, 2.68, .3], [.5, .27, .1], i % 2 ? C.white : (x < 0 ? C.mint : C.roof), .09);
          if (x < 0) for (let i = 0; i < 3; i++) planter(g, x - .65 + i * .65, -.2, [C.pink, C.butter, C.blue][i], 1.2);
          else { cake(g, x, -.3, 1.25, 1.25); g.box([x - .8, 1.4, -.2], [.42, .37, .42], C.butter, .05); }
        }
        avatar(g, -.1, 2.0, 1.05, C.butter, 0, false); avatar(g, 2.8, 1.7, .75, C.lilac);
        tree(g, -3.7, -1.9, .85, C.mint); tree(g, 3.5, -2.0, .75, '#c1c983');
        g.box([-2.9, .4, 1.4], [.9, .75, .9], C.butter, .1); g.box([-2.9, .81, 1.4], [.97, .14, .97], C.pink, .06);
        g.box([-2.9, .86, 1.4], [.12, .08, 1.0], C.white, .02); g.box([-2.9, .86, 1.4], [1.0, .08, .12], C.white, .02);
      } else if (['creative', 'album', 'quests', 'settings'].includes(name)) {
        this.baseScale = 10.3; island(g, 0, 0, 5.0); room(g, this.furnitureColor);
        tree(g, -3.8, -2.9, .7, C.mint);
        if (name === 'creative') {
          g.box([1.8, 1.9, 1.45], [1.4, 1.8, .1], C.wood, .04, [0, 0, -.08]);
          g.box([1.8, 1.95, 1.54], [1.2, 1.5, .045], C.white, .02);
          for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
            if ((r === 0 && (c === 1 || c === 2)) || r === 1 || (r === 2 && c > 0 && c < 3) || (r === 3 && c === 2)) g.box([1.43 + c * .2, 2.3 - r * .2, 1.59], [.19, .19, .02], C.pink, .01);
          }
        }
      } else {
        island(g, 0, 0, 6.0);
        const shape = multiCottage(g, this.house, this.roofColor, this.furnitureColor);
        this.baseScale = (shape.focused ? 10.7 : 10.4 + this.house.floors * .82) * .97; this.cameraTargetY = shape.focused ? .9 : 1.0 + this.house.floors * .27;
        if (!shape.focused && this.house.floors === 4) { this.baseScale = Math.max(13.95, this.baseScale); this.cameraTargetY = 2.65; }
        tree(g, -4.25, -1.7, .83, C.mint); tree(g, 4.35, -1.65, .68, '#b8c78b');
        tree(g, -3.35, 1.25, .64, '#c8ce8b');
        garden(g, 3.35, 2.15, .57);
        fence(g, -3.65, 2.5, 5); fence(g, -4.25, -.5, 6, Math.PI / 2);
        bench(g, -2.8, 1.25);
        const player = this.playerPositions[name] || { x: -.3, z: 2.6 };
        this._drawPlayer(g, player.x, player.z, .8);
        avatar(g, -1.55, 2.35, .64, C.pink, 0, true);
        if (['visit', 'residents'].includes(name)) {
          avatar(g, .8, 3.0, .75, 'preset_bob', 0, false); avatar(g, -2.1, 3.1, .6, 'preset_curl', 0, false);
        }
        g.cylinder([-1.1, .57, 3.65], .07, 1.1, C.wood, null, 10);
        g.box([-1.1, 1.15, 3.65], [.6, .42, .4], C.roof, .1);
        g.box([-1.1, 1.17, 3.88], [.4, .055, .025], C.cream, .015);
        planter(g, 1.3, 1.25, C.pink); planter(g, -2.0, 1.3, C.mint);
        for (let i = 0; i < 11; i++) flower(g, -3.5 + (i % 6) * .5, 3.0 + Math.floor(i / 6) * .43, [C.white, C.butter, C.pink][i % 3], .8);
        if (name === 'home') {
          // 门前石路弯向树荫，小桌和软垫凳形成可以停留的生活角落。
          for (let i = 0; i < 7; i++) {
            const t = i / 6;
            g.box([-.4 - t * 2.35, .1, 2.8 - Math.sin(t * Math.PI / 2) * 1.0], [.37, .055, .28], '#edddbc', .11, [0, -.25 - t * .5, 0]);
          }
          table(g, .65, 3.5, .65, 0, C.cream);
          g.cylinder([.65, .65, 3.5], .12, .11, C.pink, null, 14);
          for (const pos of [[1.35, 3.35], [.25, 4.03]]) {
            g.cylinder([pos[0], .24, pos[1]], .23, .4, C.wood, null, 16);
            g.cylinder([pos[0], .47, pos[1]], .28, .12, C.butter, null, 20);
          }
          for (let i = 0; i < 5; i++) flower(g, 1.6 + i * .32, 3.25 - i * .1, i % 2 ? C.white : C.pink, .85);
        }
        // 远处浮岛属于场景，进入村庄页可放大探索。
        island(g, -7.7, -5.7, 1.5, -.5); cottage(g, -7.7, -5.7, .33, C.mint, -.5);
        island(g, 6.2, -5.0, 1.12, -.7); cottage(g, 6.2, -5, .25, C.lilac, -.7);
      }
      // 无贴图的软陶云；主体之外保留通透云海。
      if (name !== 'village') { cloud(g, -6.6, -.5, 1.4, .8); cloud(g, 5.6, -.8, 2.8, .72); cloud(g, 2.8, -.45, -5.8, .7); }
      if (this.movementMarker && this.playerPositions[name]) {
        const marker = this.playerPositions[name];
        for (let i = 0; i < 12; i++) {
          const a = i * TAU / 12;
          g.sphere([marker.x + Math.cos(a) * .38, .105, marker.z + Math.sin(a) * .38], [.045, .018, .045], '#fff4cd', 8, 5);
        }
      }
      for (let i = 0; i < this.added.length; i++) {
        const obj = this.added[i], x = -1.6 + (i % 4) * .8, z = 2.4 + Math.floor(i / 4) * .45;
        if (obj === 'plant') planter(g, x, z, this.furnitureColor);
        else if (obj === 'lamp') { g.cylinder([x, .65, z], .035, 1.2, C.wood, null, 8); g.cylinder([x, 1.3, z], .32, .4, C.butter, .19, 16); }
        else g.box([x, .4, z], [.55, .55, .55], this.furnitureColor, .13);
      }
      this.vertexCount = g.data.length / 9;
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer); this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(g.data), this.gl.STATIC_DRAW);
      this._dirty = true;
    }
    _bind() {
      let drag = null;
      this.canvas.style.touchAction = 'none';
      this.canvas.addEventListener('pointerdown', e => { if (e.button !== 0) return; drag = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: false }; try { this.canvas.setPointerCapture(e.pointerId); } catch (_) {} });
      this.canvas.addEventListener('pointermove', e => {
        if (!drag) return;
        if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 6) return;
        drag.moved = true;
        this.angle -= (e.clientX - drag.x) * .007;
        this.elevation = Math.max(.24, Math.min(.95, this.elevation + (e.clientY - drag.y) * .004));
        drag.x = e.clientX; drag.y = e.clientY; this._dirty = true;
      });
      this.canvas.addEventListener('pointerup', e => {
        if (drag && !drag.moved) this._moveAvatarToScreen(e.clientX, e.clientY);
        drag = null;
      });
      this.canvas.addEventListener('pointercancel', () => { drag = null; });
      this.canvas.addEventListener('wheel', e => { e.preventDefault(); this.zoom(e.deltaY > 0 ? .45 : -.45); }, { passive: false });
      document.addEventListener('visibilitychange', () => { this._paused = document.hidden; if (!this._paused) this._dirty = true; });
      this.canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this._paused = true; });
      this.canvas.addEventListener('webglcontextrestored', () => { this._initGL(); this._build(); this._paused = false; this._dirty = true; });
      if (typeof ResizeObserver !== 'undefined') { this.observer = new ResizeObserver(() => this._resize()); this.observer.observe(this.canvas); }
      else window.addEventListener('resize', () => this._resize());
    }
    _resize() {
      const rect = this.canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      this.width = Math.max(1, rect.width); this.height = Math.max(1, rect.height);
      const w = Math.round(this.width * dpr), h = Math.round(this.height * dpr);
      if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
      this._dirty = true; this._render();
    }
    _render() {
      if (!this.gl) { this._renderFallback(); return; }
      const gl = this.gl, aspect = this.canvas.width / this.canvas.height;
      const range = this.scale * (aspect < 1 ? 1.22 : 1), target = [0, this.cameraTargetY, 0];
      const eye = [Math.sin(this.angle) * Math.cos(this.elevation) * 20, Math.sin(this.elevation) * 20 + target[1], Math.cos(this.angle) * Math.cos(this.elevation) * 20];
      const projection = ortho(-range * aspect / 2, range * aspect / 2, -range / 2, range / 2, .1, 70);
      const matrix = multiply(projection, lookAt(eye, target));
      gl.viewport(0, 0, this.canvas.width, this.canvas.height); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.useProgram(this.program); gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      const stride = 9 * 4, loc = this.locations;
      for (const [location, offset] of [[loc.position, 0], [loc.normal, 12], [loc.color, 24]]) { gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 3, gl.FLOAT, false, stride, offset); }
      gl.uniformMatrix4fv(loc.matrix, false, matrix); gl.uniform1f(loc.night, this.night ? 1 : 0); gl.uniform3fv(loc.eye, eye); gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
      this.canvas.dataset.renderer = 'webgl'; this.canvas.dataset.scene = this.sceneName; this.canvas.dataset.avatarPreset = this.avatarPreset;
    }
    _renderFallback() {
      const ctx = this._fallback; if (!ctx) return;
      const w = this.canvas.width, h = this.canvas.height, s = Math.min(w / 720, h / 560);
      ctx.clearRect(0, 0, w, h); ctx.save(); ctx.translate(w / 2, h * .52); ctx.scale(s, s);
      ctx.fillStyle = '#d3b394'; ctx.beginPath(); ctx.ellipse(0, 80, 230, 85, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#b8cf92'; ctx.beginPath(); ctx.ellipse(0, 49, 230, 85, 0, 0, TAU); ctx.fill();
      const houseScene = ['home', 'decorate', 'visit', 'residents'].includes(this.sceneName);
      const count = houseScene ? (this.house.floor === 'all' || this.house.view === 'exterior' ? this.house.floors : 1) : 1;
      const floorHeight = 67, baseY = 48, houseWidth = 262, left = -131;
      for (let floor = 0; floor < count; floor++) {
        const top = baseY - (floor + 1) * floorHeight;
        ctx.fillStyle = floor % 2 ? '#efe5cf' : '#fff1d4'; ctx.fillRect(left, top, houseWidth, floorHeight - 4);
        ctx.fillStyle = '#c9a988'; ctx.fillRect(left - 5, top + floorHeight - 5, houseWidth + 10, 6);
        for (let col = 0; col < 3; col++) {
          const x = left + col * 88;
          if (this.house.view === 'cutaway' && houseScene) {
            ctx.fillStyle = '#d9bda0'; ctx.fillRect(x, top, 4, floorHeight - 4);
            ctx.fillStyle = [C.mint, C.pink, C.butter][(floor + col) % 3]; ctx.fillRect(x + 12, top + 35, 63, 18);
            ctx.fillStyle = '#b3d2cb'; ctx.fillRect(x + 28, top + 8, 32, 22);
          } else { ctx.fillStyle = C.teal; ctx.fillRect(x + 26, top + 16, 37, 37); ctx.strokeStyle = C.white; ctx.lineWidth = 3; ctx.strokeRect(x + 26, top + 16, 37, 37); }
        }
      }
      const roofY = baseY - count * floorHeight;
      ctx.fillStyle = this.roofColor; ctx.beginPath(); ctx.moveTo(-147, roofY); ctx.lineTo(0, roofY - 57); ctx.lineTo(147, roofY); ctx.closePath(); ctx.fill();
      ctx.fillStyle = C.mint; ctx.beginPath(); ctx.arc(72, roofY - 32, 21, Math.PI, 0); ctx.fill(); ctx.fillRect(51, roofY - 32, 42, 25);
      for (const x of [-185, 180]) { ctx.fillStyle = C.wood; ctx.fillRect(x - 8, -60, 16, 85); ctx.fillStyle = C.mint; ctx.beginPath(); ctx.ellipse(x, -80, 48, 72, 0, 0, TAU); ctx.fill(); }
      ctx.restore(); this.canvas.dataset.renderer = 'canvas-fallback'; this.canvas.dataset.scene = this.sceneName;
    }
    setScene(name, options) {
      options = options || {}; this.sceneName = name || 'home'; this.added = []; this.movementMarker = null;
      if (options.house) this.house = this._normalizedHouse(options.house);
      if (options.avatarPreset && window.CottageCharacters) this.avatarPreset = window.CottageCharacters.get(options.avatarPreset).id;
      if (options.roofColor) this.roofColor = options.roofColor;
      if (options.furnitureColor) this.furnitureColor = options.furnitureColor;
      this.night = options.night == null ? name === 'observatory' : !!options.night;
      this._build(); this.scale = this.baseScale; this.angle = name === 'decorate' || ['creative', 'album', 'quests', 'settings'].includes(name) ? .62 : .64; this.elevation = ['home','decorate','visit','residents'].includes(name) && this.house.floor === 'all' ? .39 : .52;
      this.canvas.dataset.night = this.night ? 'true' : 'false'; this._dirty = true; this._render();
    }
    _normalizedHouse(value) {
      const source = { ...this.house, ...value };
      const floors = Math.max(1, Math.min(4, Math.round(Number(source.floors) || 3)));
      return { floors, floor: source.floor === 'all' ? 'all' : Math.max(1, Math.min(floors, Math.round(Number(source.floor) || 1))), view: source.view === 'exterior' ? 'exterior' : 'cutaway' };
    }
    setHouse(value) { this.house = this._normalizedHouse(value || {}); this._build(); this.scale = this.baseScale; this._dirty = true; this._render(); return { ...this.house }; }
    setNight(value) { this.night = !!value; this.canvas.dataset.night = this.night ? 'true' : 'false'; this._dirty = true; this._render(); }
    rotate(delta) { this.angle += Number(delta) || .3; this._dirty = true; this._render(); }
    zoom(delta) { this.scale = Math.min(20, Math.max(6, this.scale + Number(delta || 0))); this._dirty = true; this._render(); }
    resetCamera() { this.angle = .64; this.elevation = ['home','decorate','visit','residents'].includes(this.sceneName) && this.house.floor === 'all' ? .39 : .52; this.scale = this.baseScale; this._dirty = true; this._render(); }
    setFurniture(color) { this.furnitureColor = color || C.mint; this._build(); this._render(); }
    addObject(type) { if (this.added.length < 12) this.added.push(type || 'plant'); this._build(); this._render(); }
    _drawPlayer(g, x, z, scale, y = 0) { if (window.CottageCharacters) window.CottageCharacters.draw(g, x, z, scale, this.avatarPreset, y, this.avatarOverrides); else avatar(g, x, z, scale, this.avatarColor, y, false); }
    setAvatarPreset(id) { this.avatarPreset = window.CottageCharacters ? window.CottageCharacters.get(id).id : id; this.avatarOverrides = {}; this._build(); this._render(); return this.avatarPreset; }
    setAvatar(color) { this.avatarColor = color || C.butter; this.avatarOverrides.shirtColor = color; this._build(); this._render(); }
    _moveAvatarToScreen(clientX, clientY) {
      const player = this.playerPositions[this.sceneName]; if (!player) return;
      const rect = this.canvas.getBoundingClientRect(), aspect = rect.width / rect.height;
      const range = this.scale * (aspect < 1 ? 1.22 : 1);
      const horizontal = ((clientX - rect.left) / rect.width - .5) * range * aspect;
      const vertical = (.5 - (clientY - rect.top) / rect.height) * range;
      const forward = -(vertical + this.cameraTargetY * Math.cos(this.elevation)) / Math.sin(this.elevation);
      const x = Math.cos(this.angle) * horizontal + Math.sin(this.angle) * forward;
      const z = -Math.sin(this.angle) * horizontal + Math.cos(this.angle) * forward;
      // 点到云海不移动；岛内点击按正交相机还原为地面位置。
      if (Math.hypot(x, z) > 5.0) return;
      this.moveAvatar(x - player.x, z - player.z);
    }
    moveAvatar(dx, dz) {
      const player = this.playerPositions[this.sceneName]; if (!player) return null;
      let x = player.x + (Number(dx) || 0), z = player.z + (Number(dz) || 0);
      const limit = 4.35, radius = Math.hypot(x, z);
      if (radius > limit) { x *= limit / radius; z *= limit / radius; }
      if (['home', 'visit'].includes(this.sceneName) && x > -4.05 && x < 3.6 && z < 1.74 && z > -2.95) z = 1.74;
      player.x = x; player.z = z; this.movementMarker = { x, z };
      this._build(); this._render();
      this.canvas.dataset.playerPosition = `${x.toFixed(2)},${z.toFixed(2)}`;
      if (typeof CustomEvent === 'function') this.canvas.dispatchEvent(new CustomEvent('cottage:move', { detail: { x, z, scene: this.sceneName } }));
      return { x, z };
    }
    capture() { this._render(); return this.canvas.toDataURL('image/png'); }
    destroy() { cancelAnimationFrame(this._raf); if (this.observer) this.observer.disconnect(); if (this.gl) { this.gl.deleteBuffer(this.buffer); this.gl.deleteProgram(this.program); } }
  }
  window.CottageScene = CottageScene;
})();
