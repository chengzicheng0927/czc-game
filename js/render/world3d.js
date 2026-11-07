/* 真实状态驱动的原生WebGL软陶家园。几何基础抽取自本项目原型，不含样本状态。 */
(function (G) {
  'use strict';
  const TAU = Math.PI * 2;
  const C = {
    grass: '#a9ca83', grassLight: '#c5d99c', soil: '#cda888', clay: '#e7c4a2',
    cream: '#fff2d9', white: '#fffaf0', roof: '#d56783', roofDark: '#b74868',
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
      const center = rotation ? [0, 0, 0] : p, half = s.map(a => a / 2), r = Math.max(.00001, Math.min(radius, ...half)), inner = half.map(a => a - r), col = rgb(color);
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

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const color = (v, fallback) => /^#[0-9a-f]{6}$/i.test(v || '') ? v : fallback;
  const floorY = f => .24 + f * 2.2;
  const roomX = s => -3.2 + s * 3.2;
  const depthZ = depth => -.65 + clamp(depth, 0, 1) * 1.3;
  const depthAtZ = z => clamp((z + .65) / 1.3, 0, 1);
  const yardZ = y => 1.45 + y / 75;
  const surfaceRatio = def => ({ vanity: .62, stove: .94, nightstand: .99, counter: .99, bookshelf: 1.01 }[def?.template] || 1);
  const MAIN_ISLAND = Object.freeze({ x: -.6, z: .9, radius: 7.25 });
  const defFor = id => G.data?.furnitureById?.[id] || G.data?.furniture?.find(d => d.id === id);
  const boundsFor = (p, s) => ({ min: [p[0] - s[0] / 2, p[1], p[2] - s[2] / 2], max: [p[0] + s[0] / 2, p[1] + s[1], p[2] + s[2] / 2] });
  function rayBox(ray, box) {
    let near = -Infinity, far = Infinity;
    for (let k = 0; k < 3; k++) {
      if (Math.abs(ray.direction[k]) < 1e-7) { if (ray.origin[k] < box.min[k] || ray.origin[k] > box.max[k]) return null; continue; }
      let a = (box.min[k] - ray.origin[k]) / ray.direction[k], b = (box.max[k] - ray.origin[k]) / ray.direction[k];
      if (a > b) [a, b] = [b, a]; near = Math.max(near, a); far = Math.min(far, b);
      if (far < Math.max(near, 0)) return null;
    }
    const distance = Math.max(near, 0);
    return { distance, p: ray.origin.map((v, k) => v + ray.direction[k] * distance) };
  }
  function rayPlane(ray, axis, value) {
    if (Math.abs(ray.direction[axis]) < 1e-7) return null;
    const distance = (value - ray.origin[axis]) / ray.direction[axis];
    if (!Number.isFinite(distance) || distance < 0) return null;
    return { distance, p: ray.origin.map((v, k) => v + ray.direction[k] * distance) };
  }
  class World3D {
    constructor(onChange) {
      this.canvas = document.createElement('canvas'); this.ready = false; this.dirty = true; this.destroyed = false;
      this.onChange = onChange || (() => {}); this.hits = []; this.actors = []; this.labels = []; this.builds = 0;
      this.angle = .43; this.elevation = .49; this.lastDynamic = -Infinity;
      this._lost = e => { e.preventDefault(); this.ready = false; this.reason = 'context-lost'; this.onChange(); };
      this._restored = () => { if (this.destroyed) return; try { this.initGL(); this.invalidate(); } catch (_) { this.ready = false; this.reason = 'context-restore-failed'; this.release(); } this.onChange(); };
      this.canvas.addEventListener('webglcontextlost', this._lost);
      this.canvas.addEventListener('webglcontextrestored', this._restored);
      try {
        this.gl = this.canvas.getContext('webgl', { alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
        if (!this.gl || !G.world3dModels) { this.reason = this.gl ? 'models-missing' : 'webgl-unavailable'; return; }
        this.initGL();
      } catch (_) { this.reason = 'webgl-initialization-failed'; this.release(); }
    }
    initGL() {
      const gl = this.gl;
      this.release();
      const vertex = 'attribute vec3 aPosition; attribute vec3 aNormal; attribute vec3 aColor; uniform mat4 uMatrix; uniform vec3 uOffset; varying vec3 vNormal; varying vec3 vColor; varying vec3 vPosition; void main(){ vNormal=aNormal; vColor=aColor; vPosition=aPosition+uOffset; gl_Position=uMatrix*vec4(vPosition,1.0); }';
      const fragment = 'precision mediump float; varying vec3 vNormal; varying vec3 vColor; varying vec3 vPosition; uniform float uNight; uniform float uOpacity; uniform vec3 uEye; void main(){ vec3 n=normalize(vNormal); vec3 light=normalize(vec3(-0.7,1.4,1.1)); float diffuse=max(dot(n,light),0.0); float hemi=n.y*0.5+0.5; vec3 lighting=vec3(0.60)+vec3(0.25)*diffuse+vec3(0.18)*hemi; vec3 halfDirection=normalize(light+normalize(uEye-vPosition)); float spec=pow(max(dot(n,halfDirection),0.0),28.0)*0.08; vec3 col=vColor*lighting+spec; float warmGlow=smoothstep(0.72,0.95,vColor.r*0.5+vColor.g*0.4-vColor.b*0.25); vec3 nightCol=mix(col*vec3(0.58,0.64,0.84)+vec3(0.04,0.045,0.065),vColor*1.04,warmGlow*0.82); col=mix(col,nightCol,uNight*0.72); gl_FragColor=vec4(col,uOpacity); }';
      this.shaders = [];
      const compile = (type, source) => { const shader = gl.createShader(type); this.shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader); if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('shader'); return shader; };
      this.program = gl.createProgram();
      gl.attachShader(this.program, compile(gl.VERTEX_SHADER, vertex)); gl.attachShader(this.program, compile(gl.FRAGMENT_SHADER, fragment)); gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error('program');
      this.buffer = gl.createBuffer(); this.previewBuffer = gl.createBuffer();
      this.locations = { position: gl.getAttribLocation(this.program, 'aPosition'), normal: gl.getAttribLocation(this.program, 'aNormal'), color: gl.getAttribLocation(this.program, 'aColor'), matrix: gl.getUniformLocation(this.program, 'uMatrix'), offset: gl.getUniformLocation(this.program, 'uOffset'), opacity: gl.getUniformLocation(this.program, 'uOpacity'), night: gl.getUniformLocation(this.program, 'uNight'), eye: gl.getUniformLocation(this.program, 'uEye') };
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE); gl.clearColor(0, 0, 0, 0);
      this.ready = true; this.reason = ''; this.dirty = true; this.previewKey = '';
    }
    release() {
      if (!this.gl) return;
      if (this.buffer) this.gl.deleteBuffer(this.buffer);
      if (this.previewBuffer) this.gl.deleteBuffer(this.previewBuffer);
      if (this.program) this.gl.deleteProgram(this.program);
      for (const shader of this.shaders || []) this.gl.deleteShader(shader);
      this.buffer = this.previewBuffer = this.program = null; this.shaders = [];
    }
    invalidate() { this.dirty = true; this.outdoorCache = null; }
    rotate(dx, dy) {
      if (this.env?.gardenPage) { const view = this.getGardenView(); view.angle = ((view.angle - dx * .007 + Math.PI) % TAU + TAU) % TAU - Math.PI; view.elevation = clamp(view.elevation + dy * .004, -.5, 1.05); return; }
      if (this.env?.stage) { const view = this.getStageView(this.env.stage); view.angle = clamp(view.angle - dx * .007, -1.08, 1.08); view.elevation = clamp(view.elevation + dy * .004, .12, .7); return; }
      this.angle = ((this.angle - dx * .007 + Math.PI) % TAU + TAU) % TAU - Math.PI; this.elevation = clamp(this.elevation + dy * .004, -.5, 1.05);
    }
    resetView() { this.angle = .43; this.elevation = .49; this.stageView = null; this.panVector = [0, 0, 0]; this.baseTarget = null; this.baseCamera = null; }
    neighborLocation(neighbor, env = this.env) {
      const scale = clamp(Number(neighbor.scale) || 1, .5, 1.25), garden = env.garden?.center || { x: 1000, y: 143 };
      const key = JSON.stringify([neighbor.id, !!neighbor.empty, neighbor.x, neighbor.y, scale, garden.x, garden.y]);
      this.neighborLocations = this.neighborLocations || new Map();
      if (this.neighborLocations.has(key)) return this.neighborLocations.get(key);
      let x = (Number(neighbor.x) || 0) / 100, z = yardZ(Number(neighbor.y) || 0);
      const clearance = 1.05 * scale * 1.09 + .45;
      const keepOut = [[MAIN_ISLAND.x, MAIN_ISLAND.z, MAIN_ISLAND.radius * 1.09], [-4.3, 3.4, 3 * 1.09], [4.3, 3.4, 3 * 1.09], [garden.x / 100, yardZ(garden.y), 3.25 * 1.09]];
      // 只由正式云位和地形确定，旋转、缩放和标签布局不会移动邻居。
      for (let pass = 0; pass < 8; pass++) for (const [cx, cz, radius] of keepOut) {
        const dx = x - cx, dz = z - cz, distance = Math.hypot(dx, dz), min = radius + clearance;
        if (distance < min) { const ux = distance > 1e-6 ? dx / distance : -1, uz = distance > 1e-6 ? dz / distance : 0; x = cx + ux * min; z = cz + uz * min; }
      }
      const p = Object.freeze([x, -.7, z]);
      if (this.neighborLocations.size >= 64) this.neighborLocations.delete(this.neighborLocations.keys().next().value);
      this.neighborLocations.set(key, p); return p;
    }
    cameraSpec(env, requestedKind) {
      if (env.gardenPage) {
        const page = env.gardenPage, points = [];
        for (const x of [page.bounds.min[0], page.bounds.max[0]]) for (const y of [page.bounds.min[1], page.bounds.max[1]]) for (const z of [page.bounds.min[2], page.bounds.max[2]]) points.push([x, y, z]);
        return { kind: 'garden-page', points, anchor: page.focus, bounds: page.bounds };
      }
      const c = env.camera, count = Math.max(env.view.previewFourFloors ? 4 : 1, env.state?.house?.floors?.length || 1), kind = requestedKind || env.focusKind || (env.roomOnly ? 'room' : c.focusKind) || 'overview';
      const points = [], box = (min, max) => { for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) points.push([x, y, z]); };
      const island = (x, z, r) => { for (let i = 0; i < 24; i++) for (const y of [-1.5, .15]) { const a = i * TAU / 24; points.push([x + Math.cos(a) * r * 1.09, y, z + Math.sin(a) * r * 1.03]); } };
      const room = this.decorRoom(env.roomOnly || c.focusId, env);
      const garden = env.garden || { center: { x: 1000, y: 143 } }, gardenCenter = [garden.center.x / 100, .45, yardZ(garden.center.y)];
      const houseTop = floorY(count) + .02, houseAnchor = [0, (floorY(0) + houseTop + 1.45) / 2, 0];
      let anchor = houseAnchor;
      if (kind === 'room' && room) { const frame = this.spaceFrame(room), x = frame.x, y = frame.y; if (room.kind === 'attic') { box(room.bounds.min, room.bounds.max); anchor = [.65, y + 1.25, -.5]; } else { box([x - 1.75, y - .1, -1.65], [x + 1.75, y + 2.3, 1.75]); anchor = [x, y + 1, 0]; } }
      else if (kind === 'floor') { const f = clamp(Number(env.capturingPhoto ? Number(env.view.floor) - 1 : c.focusFloorIndex ?? Number(env.view.floor) - 1) || 0, 0, 3), y = floorY(f); box([-5.25, y - .1, -1.95], [5.25, y + 2.3, 1.95]); anchor = [0, y + 1, 0]; }
      else if (kind === 'attic') { if (env.atticRoom) { box(env.atticRoom.bounds.min, env.atticRoom.bounds.max); anchor = [.65, env.atticRoom.frame.y + 1.25, -.5]; } else { box([-2, houseTop, -1.2], [2, houseTop + 2.8, 1.7]); anchor = [0, houseTop + 1.4, .25]; } }
      else if (kind === 'garden') { island(gardenCenter[0], gardenCenter[2], 3.25); box([gardenCenter[0] - 1.8, .1, gardenCenter[2] - 1.5], [gardenCenter[0] + 1.8, 2.5, gardenCenter[2] + 1.5]); anchor = gardenCenter; }
      else {
        island(MAIN_ISLAND.x, MAIN_ISLAND.z, MAIN_ISLAND.radius); island(-4.3, 3.4, 3); island(4.3, 3.4, 3);
        if (kind !== 'yard') { island(gardenCenter[0], gardenCenter[2], 3.25); box([-5.25, .15, -1.95], [5.25, houseTop, 1.95]); box([-.12, houseTop, -1.95], [.12, houseTop + 1.55, 1.95]); box([2.65, houseTop, -.95], [3.55, houseTop + 1.98, -.05]); if (env.state?.house?.attic) box([-2, houseTop, -1.2], [2, houseTop + 2.8, 1.7]); }
        else { box([-6.5, .1, 1.4], [6.5, 3.3, 5.3]); anchor = [0, .7, 3.8]; }
        const yard = this.yardEnvironment?.bounds; if (yard) box(yard.min, yard.max);
        if (kind !== 'yard' && env.atticRoom) box(env.atticRoom.bounds.min, env.atticRoom.bounds.max);
        if (kind === 'sea' || kind === 'overview') {
          const neighbors = (env.neighbors || []).map(neighbor => ({ neighbor, p: this.neighborLocation(neighbor, env) })).sort((a, b) => Math.hypot(a.p[0] - MAIN_ISLAND.x, a.p[2] - MAIN_ISLAND.z) - Math.hypot(b.p[0] - MAIN_ISLAND.x, b.p[2] - MAIN_ISLAND.z));
          // 默认只为近处三朵云留边，40户全览由云海按钮显式触发。
          for (const { neighbor, p } of kind === 'sea' ? neighbors : neighbors.slice(0, 3)) {
            const s = clamp(Number(neighbor.scale) || 1, .5, 1.25), r = 1.05 * s * 1.09;
            box([p[0] - r, p[1] - 1.5, p[2] - r], [p[0] + r, p[1] + 1.9 * s, p[2] + r]);
          }
        }
      }
      const min = [0, 1, 2].map(k => Math.min(...points.map(p => p[k]))), max = [0, 1, 2].map(k => Math.max(...points.map(p => p[k])));
      return { kind, points, anchor, bounds: { min, max } };
    }
    houseBasis(angle = this.angle, elevation = this.elevation) {
      const backward = [Math.sin(angle) * Math.cos(elevation), Math.sin(elevation), Math.cos(angle) * Math.cos(elevation)];
      const right = normalize(cross([0, 1, 0], backward)); return { backward, right, up: cross(backward, right) };
    }
    // 画布铺满整个 #world；安全区（避开按钮/侧栏）只决定默认取景：相机目标落在安全区中心，放大/拖拽后画面仍铺满画布。
    // 拍照（capturingPhoto）和没有 env.safe 的环境（如 visit.js 自建）一律返回整幅画布。
    safeRect(env = this.env) {
      const W = env.width, H = env.height, s = env.capturingPhoto ? null : env.safe;
      if (!s || !(s.width > 0) || !(s.height > 0)) return { x: 0, y: 0, width: W, height: H };
      const x = clamp(Number(s.x) || 0, 0, Math.max(0, W - 1)), y = clamp(Number(s.y) || 0, 0, Math.max(0, H - 1));
      return { x, y, width: Math.max(1, Math.min(W - x, s.width)), height: Math.max(1, Math.min(H - y, s.height)) };
    }
    // 相机目标在画布内的落点（画布坐标，不含 offset）。
    viewCenter(env = this.env) { const s = this.safeRect(env); return { x: s.x + s.width / 2, y: s.y + s.height / 2 }; }
    viewCenterScreen(env = this.env) { const c = this.viewCenter(env); return { x: (env.offsetX || 0) + c.x, y: (env.offsetY || 0) + c.y }; }
    // range 表示整幅画布高度对应的世界单位；按安全区算出的 range 要乘 H/safe.h，才与改前 camera.scale 一致。
    rangeScale(env = this.env) { return env.height / this.safeRect(env).height; }
    // 偏心正交投影：相机目标映射到 viewCenter，正交不变，旋转/缩放绕安全区中心。
    projectionMatrix(env, range) {
      const c = this.viewCenter(env), unit = range / env.height;
      return ortho(-c.x * unit, (env.width - c.x) * unit, -(env.height - c.y) * unit, c.y * unit, .1, 150);
    }
    // 当前取景换算回“安全区子视窗”（range 为安全区高度、aspect 为安全区宽高比），供拍照还原所见。
    viewFrame() {
      const env = this.env; if (!env) return null;
      if (env.gardenPage) return this.lastHouseFrame || null;
      if (env.stage || !this.target) return null;
      const s = this.safeRect(env);
      return { target: this.target.slice(), range: this.range / this.rangeScale(env), aspect: s.width / s.height };
    }
    fittedFrame(env, spec, basis) {
      const dot = (p, axis) => p.reduce((sum, n, i) => sum + n * axis[i], 0), extent = axis => { const values = spec.points.map(p => dot(p, axis)); return [Math.min(...values), Math.max(...values)]; };
      const safe = this.safeRect(env), k = env.height / safe.height;
      const r = extent(basis.right), u = extent(basis.up), aspect = safe.width / safe.height, padding = Math.min(24, safe.width * .08, safe.height * .08);
      const range = Math.max(2.7, (u[1] - u[0]) / Math.max(.5, 1 - padding * 2 / safe.height), (r[1] - r[0]) / aspect / Math.max(.5, 1 - padding * 2 / safe.width)) * k;
      const center = spec.bounds.min.map((v, i) => (v + spec.bounds.max[i]) / 2), dr = (r[0] + r[1]) / 2 - dot(center, basis.right), du = (u[0] + u[1]) / 2 - dot(center, basis.up);
      return { target: center.map((v, i) => v + basis.right[i] * dr + basis.up[i] * du), range };
    }
    zoomLimits(env, basis = this.houseBasis()) {
      const full = this.fittedFrame(env, this.cameraSpec(env, env.camera.focusKind === 'sea' ? 'sea' : 'overview'), basis);
      return { min: env.height / (full.range * 100) * .8, max: Math.min(2, this.safeRect(env).height / 270) };
    }
    fitCamera(env) {
      if (env.gardenPage) { this.fitGarden(); this.updateCamera(env); return; }
      if (env.stage) { this.fitStage(env.stage); return; }
      const frame = this.fittedFrame(env, this.cameraSpec(env), this.houseBasis());
      this.baseTarget = frame.target; this.baseCamera = env.camera; this.legacyRef = { x: env.camera.x, y: env.camera.y }; this.panVector = [0, 0, 0];
      env.camera.scale = env.height / (frame.range * 100); this.updateCamera(env);
    }
    constrainTarget(env, target, range, basis) {
      const spec = this.cameraSpec(env), dot = (p, axis) => p.reduce((sum, n, i) => sum + n * axis[i], 0), unit = range / env.height, center = this.viewCenter(env);
      // 目标不在画布正中时窗口左右/上下不对称：neg/pos 是目标沿轴负向/正向可见的像素数。
      const clampAxis = (axis, size, neg, pos) => {
        const values = spec.points.map(p => dot(p, axis)), low = Math.min(...values), high = Math.max(...values);
        const edge = Math.min(64, size * .12) * unit, anchor = dot(spec.anchor, axis), current = dot(target, axis);
        let min = anchor - pos * unit + edge, max = anchor + neg * unit - edge;
        if (high - low <= size * unit) { min = Math.max(min, high - pos * unit - edge); max = Math.min(max, low + neg * unit + edge); }
        return clamp(current, min, max) - current;
      };
      const dr = clampAxis(basis.right, env.width, center.x, env.width - center.x), du = clampAxis(basis.up, env.height, env.height - center.y, center.y);
      return target.map((v, i) => v + basis.right[i] * dr + basis.up[i] * du);
    }
    panScreen(dx, dy) {
      const env = this.env; if (!env || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
      if (env.gardenPage) { const view = this.getGardenView(), unit = this.range / env.height; view.panX -= clamp(dx, -env.width * 2, env.width * 2) * unit; view.panY += clamp(dy, -env.height * 2, env.height * 2) * unit; this.updateCamera(env); return; }
      if (env.stage) { this.panStage(dx, dy); return; }
      const unit = this.range / env.height; this.panVector = this.panVector || [0, 0, 0];
      dx = clamp(dx, -env.width * 2, env.width * 2); dy = clamp(dy, -env.height * 2, env.height * 2);
      this.panVector = this.panVector.map((v, i) => v + (-this.right[i] * dx + this.up[i] * dy) * unit); this.updateCamera(env);
    }
    // 把家园视角的平移量折算成 camera.x/y 的单位（世界单位×100）：向右拖 x 变小、向下拖 y 变小，与旧的 2D 平移符号一致。
    // 只给 2D 背景（云海视差）用，让背景随“拖桌布”一起动；花园页/舞台页有各自的平移，不在此处。
    panShift() {
      const env = this.env, pan = this.panVector;
      if (!env || env.gardenPage || env.stage || !pan || !this.right || !this.up) return { x: 0, y: 0 };
      const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      return { x: dot(pan, this.right) * 100, y: -dot(pan, this.up) * 100 };
    }
    zoomScreen(factor, point) {
      const env = this.env; if (!env || !Number.isFinite(factor) || factor <= 0) return;
      if (env.gardenPage) {
        const view = this.getGardenView(), oldUnit = this.range / env.height, basis = this.houseBasis(view.angle, view.elevation), frame = this.fittedFrame(env, this.cameraSpec(env), basis);
        view.zoom = clamp(view.zoom * clamp(factor, .5, 2), .8, Math.max(1, Math.min(3, frame.range / (2.7 * this.rangeScale(env)))));
        // 默认锚点是安全区中心（相机目标所在），而不是整幅画布中心。
        const newUnit = frame.range / view.zoom / env.height, center = this.viewCenterScreen(env), anchor = point && this.containsScreen(point.x, point.y) ? point : center;
        view.panX += (anchor.x - center.x) * (oldUnit - newUnit);
        view.panY += (center.y - anchor.y) * (oldUnit - newUnit); this.updateCamera(env); return;
      }
      if (env.stage) { this.zoomStage(factor); return; }
      const limits = this.zoomLimits(env), oldUnit = env.height / (Math.max(.000001, env.camera.scale) * 100) / env.height;
      const center = this.viewCenterScreen(env), anchor = point && this.containsScreen(point.x, point.y) ? point : center;
      const x = anchor.x - center.x, y = center.y - anchor.y;
      env.camera.scale = clamp(env.camera.scale * clamp(factor, .5, 2), limits.min, limits.max);
      const newUnit = 1 / (env.camera.scale * 100); this.panVector = this.panVector || [0, 0, 0];
      this.panVector = this.panVector.map((v, i) => v + (this.right[i] * x + this.up[i] * y) * (oldUnit - newUnit)); this.updateCamera(env);
    }
    getStageView(stage) {
      if (this.stageView?.id !== stage.id) this.stageView = { id: stage.id, angle: .18, elevation: .22, zoom: 1, panX: 0, panY: 0 };
      return this.stageView;
    }
    fitStage(stage) { const view = this.getStageView(stage); view.zoom = 1; view.panX = view.panY = 0; }
    zoomStage(factor) { if (this.env?.stage && Number.isFinite(factor) && factor > 0) { const view = this.getStageView(this.env.stage); view.zoom = clamp(view.zoom * factor, .5, 3); } }
    panStage(dx, dy) { if (this.env?.stage) { const view = this.getStageView(this.env.stage), unit = this.range / this.env.height; view.panX -= dx * unit; view.panY += dy * unit; } }
    getGardenView() { return this.gardenView || (this.gardenView = { angle: .18, elevation: .62, zoom: 1, panX: 0, panY: 0 }); }
    fitGarden(reset) { const view = this.getGardenView(); view.zoom = 1; view.panX = view.panY = 0; if (reset) { view.angle = .18; view.elevation = .62; } }
    snapshotHouseCamera() {
      const result = {};
      for (const key of ['angle', 'elevation', 'baseTarget', 'baseCamera', 'legacyRef', 'panVector', 'lastHouseFrame']) {
        const value = this[key]; result[key] = Array.isArray(value) ? value.slice() : key === 'legacyRef' && value ? Object.assign({}, value) : value;
      }
      return result;
    }
    restoreHouseCamera(snapshot) { if (snapshot) for (const key of Object.keys(snapshot)) { const value = snapshot[key]; this[key] = Array.isArray(value) ? value.slice() : key === 'legacyRef' && value ? Object.assign({}, value) : value; } }
    setEnvironment(env) {
      const avatarKey = G.data?.avatarFingerprint?.(env.state?.avatar) || JSON.stringify(env.state?.avatar || '');
      // 主角所在区域（院子/某间房）必须进缓存键：站位在构建时一次性写入网格，键里没有它，点“进入房间”后画面不会重建，人就不会进屋。
      const key = [avatarKey, G.runtime?.player?.zone || 'yard', !!G.prototypeYard3D?.build, env.gardenPage?.id || '', env.gardenPage?.key || '', env.stage?.id || '', env.stage?.key || '', env.view.floor, env.view.view, env.view.previewFourFloors, env.omitUid || '', env.roomOnly || '', !!env.hidePlayer, env.neighborKey || '', env.gardenKey || '', !!env.visitor, JSON.stringify((env.peers || []).map(p => [p.id, p.zone, p.avatar, p.displayName, p.isHost]))].join('|');
      if (this.key !== key || this.state !== env.state) this.dirty = true;
      this.key = key; this.state = env.state; this.env = env;
      if (this.dirty && this.ready) { this.build(); this.dirty = false; }
      this.updateCamera(env);
    }
    logicalToWorld(x, y) {
      const env = this.env, count = Math.max(1, env?.state?.house?.floors?.length || 1);
      if (env?.gardenPage) return env.gardenPage.worldToPage({ x, y }) || [NaN, NaN, NaN];
      const space = env?.atticRoom;
      if (space) {
        const observation = space.observation, rect = observation.rect;
        if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) return [observation.p[0], observation.p[1] + 1, observation.p[2]];
        if (x >= space.x && x <= space.x + 320 && y >= space.y && y <= space.y + 220) {
          const localX = x - space.x, localY = y - space.y, frame = this.spaceFrame(space);
          if (localY >= 142) { const depth = clamp((localY - 142) / 68, 0, 1); return [frame.x + (localX - 160) / (100 * (.76 + .24 * depth)), frame.y + .15, depthZ(depth)]; }
          return [frame.x + (localX - 160) / 100, frame.y + (142 - localY) / 78, frame.backZ];
        }
      }
      const attic = env?.attic;
      if (attic && y >= attic.y && y <= attic.y + attic.h && x >= attic.x && x <= attic.x + attic.w) return [x / 100, floorY(count) + (attic.y + attic.h - y) / 100, 0];
      const f = Math.floor((-y - .001) / 220), localY = y + (f + 1) * 220;
      if (y < 0 && f >= 0 && f < (env?.view.previewFourFloors ? 4 : count) && x >= -480 && x <= 480) {
        const slot = clamp(Math.floor((x + 480) / 320), 0, 2), center = roomX(slot), localX = x - (-480 + slot * 320);
        if (localY >= 142) {
          const depth = clamp((localY - 142) / 68, 0, 1), perspective = .76 + .24 * depth;
          return [center + (localX - 160) / (100 * perspective), floorY(f) + .15, depthZ(depth)];
        }
        return [x / 100, floorY(f) + (142 - localY) / 78, -1.25];
      }
      return [x / 100, .13, yardZ(y)];
    }
    updateCamera(env) {
      const h = env.height, c = env.camera, rangeScale = this.rangeScale(env);
      if (env.gardenPage) { this.updateGardenCamera(env); return; }
      if (env.stage) { this.updateStageCamera(env); return; }
      const basis = this.houseBasis(); this.right = basis.right; this.up = basis.up; this.forward = basis.backward.map(v => -v);
      let target, range;
      if (env.capturingPhoto) {
        const frame = env.captureCamera || this.fittedFrame(env, this.cameraSpec(env, env.roomOnly ? 'room' : typeof env.view.floor === 'number' ? 'floor' : 'overview'), basis);
        target = frame.target.slice(); range = frame.range;
      } else {
        if (this.baseTarget && this.baseCamera === c) {
          const x = clamp(Number.isFinite(c.x) ? c.x : 0, -100000, 100000), y = clamp(Number.isFinite(c.y) ? c.y : -92, -100000, 100000);
          this.baseTarget[0] += (x - this.legacyRef.x) / 100; this.baseTarget[1] -= (y - this.legacyRef.y) / 100; this.legacyRef = { x, y }; c.x = x; c.y = y; target = this.baseTarget.slice();
        } else target = [c.x / 100, Math.max(.15, -c.y / 100), c.y > 0 ? yardZ(c.y) : .35];
        if (env.roomOnly) { const room = this.decorRoom(env.roomOnly, env); if (room) { const frame = this.spaceFrame(room); target = [frame.x, frame.y + 1, 0]; } }
        if (env.constrainCamera) { const limits = this.zoomLimits(env, basis); c.scale = clamp(Number.isFinite(c.scale) ? c.scale : limits.min, limits.min, limits.max); }
        range = Math.max(2.7 * rangeScale, h / (Math.max(.000001, c.scale) * 100));
        const pan = this.panVector || [0, 0, 0]; target = target.map((v, i) => v + pan[i]);
        if (env.constrainCamera) target = this.constrainTarget(env, target, range, basis);
      }
      const distance = 45, angle = this.angle, elevation = this.elevation;
      this.target = target;
      this.eye = [target[0] + Math.sin(angle) * Math.cos(elevation) * distance, target[1] + Math.sin(elevation) * distance, target[2] + Math.cos(angle) * Math.cos(elevation) * distance];
      this.range = range;
      this.matrix = multiply(this.projectionMatrix(env, range), lookAt(this.eye, target));
      // lastHouseFrame 记录安全区子视窗取景（range 为安全区高度），拍照据此还原所见。
      if (!env.capturingPhoto) { const safe = this.safeRect(env); this.lastHouseFrame = { target: target.slice(), range: range / rangeScale, aspect: safe.width / safe.height }; }
    }
    updateGardenCamera(env) {
      const view = this.getGardenView(), basis = this.houseBasis(view.angle, view.elevation), frame = this.fittedFrame(env, this.cameraSpec(env), basis);
      view.zoom = clamp(view.zoom, .8, Math.max(1, Math.min(3, frame.range / (2.7 * this.rangeScale(env)))));
      this.range = frame.range / view.zoom; this.right = basis.right; this.up = basis.up; this.forward = basis.backward.map(v => -v);
      const target = frame.target.map((v, i) => v + basis.right[i] * view.panX + basis.up[i] * view.panY), bounded = this.constrainTarget(env, target, this.range, basis);
      view.panX += bounded.reduce((sum, v, i) => sum + (v - target[i]) * basis.right[i], 0); view.panY += bounded.reduce((sum, v, i) => sum + (v - target[i]) * basis.up[i], 0);
      this.target = bounded; this.eye = bounded.map((v, i) => v + basis.backward[i] * 45);
      this.matrix = multiply(this.projectionMatrix(env, this.range), lookAt(this.eye, this.target));
    }
    updateStageCamera(env) {
      const stage = env.stage, view = this.getStageView(stage), distance = 45, angle = view.angle, elevation = view.elevation;
      const backward = [Math.sin(angle) * Math.cos(elevation), Math.sin(elevation), Math.cos(angle) * Math.cos(elevation)];
      this.right = normalize(cross([0, 1, 0], backward)); this.up = cross(backward, this.right); this.forward = backward.map(v => -v);
      const focus = stage.focus, corners = [];
      for (const x of [stage.bounds.min[0], stage.bounds.max[0]]) for (const y of [stage.bounds.min[1], stage.bounds.max[1]]) for (const z of [stage.bounds.min[2], stage.bounds.max[2]]) corners.push([x - focus[0], y - focus[1], z - focus[2]]);
      const span = axis => Math.max(...corners.map(p => Math.abs(p.reduce((sum, value, i) => sum + value * axis[i], 0)))) * 2;
      // 舞台按安全区宽高比取景，再乘 H/safe.h 折成整幅画布高度；目标落在安全区中心。
      const safe = this.safeRect(env), rangeScale = env.height / safe.height;
      this.range = Math.max(.6, span(this.up) * 1.14, span(this.right) / (safe.width / safe.height) * 1.14) * rangeScale / view.zoom;
      this.target = focus.map((v, i) => v + this.right[i] * view.panX + this.up[i] * view.panY);
      this.eye = this.target.map((v, i) => v + backward[i] * distance);
      this.matrix = multiply(this.projectionMatrix(env, this.range), lookAt(this.eye, this.target));
    }
    project(p) {
      const m = this.matrix, v = [p[0], p[1], p[2], 1];
      const clip = [0, 1, 2, 3].map(r => v.reduce((sum, n, k) => sum + n * m[k * 4 + r], 0));
      return { x: (this.env.offsetX || 0) + (clip[0] / clip[3] + 1) * this.env.width / 2, y: (this.env.offsetY || 0) + (1 - clip[1] / clip[3]) * this.env.height / 2, z: clip[2] / clip[3] };
    }
    worldToScreen(x, y) { return this.project(this.logicalToWorld(x, y)); }
    ray(x, y) {
      // 相机目标映射在 viewCenter（安全区中心），不是画布正中。
      x -= this.env.offsetX || 0; y -= this.env.offsetY || 0;
      const unit = this.range / this.env.height, center = this.viewCenter(), sx = (x - center.x) * unit, sy = (center.y - y) * unit;
      return { origin: this.eye.map((v, k) => v + this.right[k] * sx + this.up[k] * sy), direction: this.forward };
    }
    hitBox(kind, p, size, extra) { const hit = Object.assign({ kind, p, size }, boundsFor(p, size), extra); this.hits.push(hit); return hit; }
    decorRoom(id, env = this.env) { return env.atticRoom?.id === id ? env.atticRoom : env.rooms?.find(room => room.id && room.id === id); }
    spaceFrame(room) { return room.kind === 'attic' ? room.frame : { x: roomX(room.slotIdx), y: floorY(room.floorIdx), backZ: -1.25, minZ: -1.35, maxZ: 1.5 }; }
    roomAllowed(room) { return (!this.env.roomOnly || room.id === this.env.roomOnly) && (room.kind === 'attic' ? ['all', 'attic'].includes(this.env.view.floor) : this.env.view.floor === 'all' || this.env.view.floor === 'attic' || Number(this.env.view.floor) - 1 === room.floorIdx); }
    furniture(g, room, item, def, hit = true) {
      const p = G.roomSpace.item(room.data, item, def), depth = def.place === 'floor' ? p.depth : item.parent ? p.depth : 0;
      const parent = item.parent && room.data.items.find(v => v.uid === item.parent), parentDef = parent && defFor(parent.defId);
      const frame = this.spaceFrame(room);
      let y = frame.y + .12, z = depthZ(depth);
      if (def.place === 'wall' || def.place === 'ceiling') { y += Math.max(.05, (142 - item.y - def.h) / 78); z = frame.backZ + .08; }
      if (parentDef) y += parentDef.h / 100 * surfaceRatio(parentDef);
      if (def.place === 'ceiling') y = frame.y + 2.0 - def.h / 100;
      const canonicalX = def.place === 'floor' ? item.x + def.w / 2 : (p.footX - 160) / (item.parent ? p.scale : 1) + 160;
      if (parentDef?.place === 'wall') z = frame.backZ + (parentDef.template === 'wall_shelf' ? .34 : .13);
      const pos = [frame.x + (canonicalX - 160) / 100, y, z];
      const size = [Math.max(.12, def.w / 100), Math.max(.08, def.h / 100), def.place === 'wall' ? (def.template === 'wall_shelf' ? .55 : .12) : def.place === 'ceiling' ? .35 : clamp(def.w / 130, .25, 1.15)];
      if (def.template === 'wall_shelf') pos[2] = frame.backZ + .34;
      if (def.template === 'rug') { size[1] = .035; size[2] = Math.min(1.9, size[0] * .7); }
      const vertexStart = g.data.length / 9;
      G.world3dModels.furniture(g, def, item, pos, size);
      if (hit) {
        const entry = this.hitBox('item', pos, size, { roomId: room.id, uid: item.uid, room, item, def, vertexStart, vertexCount: g.data.length / 9 - vertexStart, legacy: { x: room.x + p.x, y: room.y + p.y, w: p.w, h: p.h } });
        // 以实际模型包围盒参与遮挡/叠放，不把画框前面的图案细节留在命中范围之外。
        entry.min = [Infinity, Infinity, Infinity]; entry.max = [-Infinity, -Infinity, -Infinity];
        for (let v = vertexStart * 9; v < g.data.length; v += 9) for (let k = 0; k < 3; k++) { entry.min[k] = Math.min(entry.min[k], g.data[v + k]); entry.max[k] = Math.max(entry.max[k], g.data[v + k]); }
      }
      return { p: pos, size };
    }
    resolveCoplanarLayers(g) {
      const epsilon = .00001, limit = .0005, groups = [];
      const overlap = (a, b, axes = [0, 1, 2]) => axes.every(k => Math.min(a.max[k], b.max[k]) > Math.max(a.min[k], b.min[k]));
      const items = this.hits.filter(hit => hit.kind === 'item');
      // 只给薄壁挂贴面处理近共面精度；其它实体仍完全使用真实深度测试。
      for (const hit of items.filter(value => value.def.place === 'wall' && value.size[2] <= .2)) {
        let group = groups.find(value => value.roomId === hit.roomId && value.parent === (hit.item.parent || null) && value.template === hit.def.template && Math.abs(value.plane - hit.p[2]) <= epsilon && Math.abs(value.depth - hit.size[2]) <= epsilon);
        if (!group) { group = { roomId: hit.roomId, parent: hit.item.parent || null, template: hit.def.template, plane: hit.p[2], depth: hit.size[2], members: [] }; groups.push(group); }
        group.members.push(hit);
      }
      groups.forEach((group, index) => {
        const members = group.members.sort((a, b) => (Number(a.item.z) || 0) - (Number(b.item.z) || 0));
        if (members.length < 2 || !members.some((hit, i) => members.slice(i + 1).some(other => overlap(hit, other)))) return;
        let budget = limit;
        // 保留与真正不相交的前方实体的间隙，即使间隙比微偏移上限更小也不能越过。
        for (const hit of members) for (const other of items) {
          if (members.includes(other) || !overlap(hit, other, [0, 1])) continue;
          const clearance = other.min[2] - hit.max[2];
          if (clearance >= 0) budget = Math.min(budget, clearance / 2);
        }
        const plane = Math.max(...members.map(hit => hit.p[2])), spread = plane - Math.min(...members.map(hit => hit.p[2]));
        members.forEach((hit, rank) => {
          hit.layerGroup = 'wall-' + index;
          if (!members.some(other => other !== hit && overlap(hit, other))) return;
          const shift = Math.min(budget, plane - hit.p[2]) + Math.max(0, budget - spread) * rank / (members.length - 1);
          hit.layerBias = shift;
          for (let v = hit.vertexStart * 9, end = v + hit.vertexCount * 9; v < end; v += 9) g.data[v + 2] += shift;
          hit.p[2] += shift; hit.min[2] += shift; hit.max[2] += shift;
        });
      });
    }
    exteriorBay(g, x, base, room, wallColor) {
      g.box([x, base + 1.12, 1.43], [3.2, 2.2, .2], wallColor, .06);
      const door = room.floorIdx === 0 && room.slotIdx === 1;
      const glassTone = this.env?.night ? '#FFE294' : C.blue;
      g.box([x, base + (door ? .85 : 1.15), 1.57], [door ? .88 : 1.03, door ? 1.55 : 1.04, .1], C.white, .12);
      g.box([x, base + (door ? .82 : 1.15), 1.64], [door ? .72 : .83, door ? 1.4 : .84, .08], door ? '#D48A78' : glassTone, .1);
      if (door) {
        g.sphere([x + .22, base + .78, 1.7], [.045, .045, .045], '#FFD166', 10, 8);
        for (let i = -2; i <= 2; i++) g.box([x + i * .19, base + 1.68, 1.72], [.18, .09, .24], i % 2 === 0 ? '#E46C88' : C.white, .02, [.28, 0, 0]);
      } else {
        g.box([x, base + 1.15, 1.69], [.04, .84, .025], C.white, .01);
        g.box([x, base + 1.15, 1.69], [.84, .04, .025], C.white, .01);
        for (const side of [-1, 1]) g.box([x + side * .62, base + 1.15, 1.6], [.16, .92, .05], '#88C4B8', .025);
        g.box([x, base + .58, 1.68], [.92, .13, .16], '#C98A63', .035);
        for (const f of [-1, 0, 1]) g.sphere([x + f * .24, base + .68, 1.69], [.07, .07, .07], f === 0 ? '#FFD166' : '#FF7898', 8, 6);
      }
    }
    atticSpace(g, room, roofColor, wallColor) {
      const frame = this.spaceFrame(room), y = frame.y, wall = room.data.wallpaper, floor = room.data.floor, tone = color(wall?.color, '#EDDDE7'), accent = color(wall?.color2, '#FFF8FB'), floorTone = color(floor?.color, '#EED7B9');
      g.box([0, y, 0], [3.48, .2, 3.15], '#BE987B', .07);
      g.box([0, y + .12, 0], [3.2, .07, 2.95], floorTone, .035);
      const floorPattern = floor?.pattern;
      if (['wood', 'tile', 'tatami'].includes(floorPattern)) for (let i = -2; i <= 2; i++) {
        g.box([i * .55, y + .16, 0], [.014, .012, 2.9], '#BDA58B', .002);
        if (floorPattern !== 'wood') g.box([0, y + .16, i * .5], [3.18, .012, floorPattern === 'tatami' ? .045 : .014], '#BDA58B', .002);
      }
      if (floorPattern === 'carpet') for (const side of [-1, 1]) { g.box([side * 1.48, y + .163, 0], [.025, .01, 2.72], accent, .002); g.box([0, y + .163, side * 1.32], [2.98, .01, .025], accent, .002); }
      if (['grass', 'cloud', 'marble', 'stars'].includes(floorPattern)) for (let i = 0; i < 18; i++) {
        const x = (i % 6 - 2.5) * .48, z = (Math.floor(i / 6) - 1) * .77;
        if (floorPattern === 'stars') for (const angle of [0, Math.PI / 4]) g.box([x, y + .166, z], [.11, .01, .025], accent, .003, [0, angle, 0]);
        else if (floorPattern === 'marble') g.box([x, y + .166, z], [.025, .01, .6], '#FFF8EF', .003, [0, .35, 0]);
        else g.sphere([x, y + .163, z], [floorPattern === 'cloud' ? .18 : .07, .009, .06], floorPattern === 'cloud' ? '#FFF8EF' : '#ACC19A', 8, 4);
      }
      g.box([0, y + 1.14, -1.43], [3.45, 2.24, .18], tone, .055);
      for (const side of [-1, 1]) {
        g.box([side * 1.67, y + 1.14, -.73], [.14, 2.24, 1.5], tone, .045);
        g.box([side * 1.67, y + .35, .78], [.14, .65, 1.55], tone, .04);
        g.box([side * 1.68, y + 1.88, .78], [.15, .14, 1.55], '#DEC2A9', .03);
      }
      const pattern = wall?.pattern;
      if (['stripes', 'check', 'wood', 'brick'].includes(pattern)) {
        if (pattern !== 'brick') for (let x = -1.44; x < 1.5; x += .36) g.box([x, y + 1.14, -1.329], [pattern === 'stripes' ? .07 : .015, 2.1, .012], accent, .002);
        if (pattern === 'check' || pattern === 'brick') for (let k = 0; k < 7; k++) {
          const cy = y + .25 + k * .3; g.box([0, cy, -1.329], [3.25, .015, .012], accent, .002);
          if (pattern === 'brick') for (let i = -2; i <= 2; i++) g.box([i * .65 + (k % 2 ? .16 : -.16), cy + .15, -1.329], [.015, .3, .012], accent, .002);
        }
      } else if (pattern === 'custom') {
        const art = this.env.state.customArts?.find(value => value.id === wall.artId), config = G.data?.creativeConfig;
        if (art && config?.size && config.palette && config.symbols) for (let row = 0; row < config.size; row++) for (let col = 0; col < config.size; col++) {
          const index = config.symbols.indexOf(art.pixels[row * config.size + col]); if (index < 0) continue;
          g.box([-1.6 + (col + .5) * 3.2 / config.size, y + 2.2 - (row + .5) * 2.1 / config.size, -1.329], [3.2 / config.size, 2.1 / config.size, .014], config.palette[index], .001);
        }
      } else if (pattern && pattern !== 'solid') for (let col = -3; col <= 3; col++) for (let row = 0; row < 4; row++) {
        const p = [col * .44, y + .42 + row * .46, -1.324];
        if (pattern === 'stars') { for (const angle of [0, Math.PI / 4]) g.box(p, [.105, .028, .013], accent, .004, [0, 0, angle]); g.box(p, [.028, .105, .013], accent, .004); }
        else if (pattern === 'flowers') { for (const a of [0, 1.57, 3.14, 4.71]) g.sphere([p[0] + Math.cos(a) * .04, p[1] + Math.sin(a) * .04, p[2]], [.035, .035, .009], accent, 6, 4); }
        else if (pattern === 'hearts') { for (const side of [-1, 1]) g.sphere([p[0] + side * .025, p[1] + .02, p[2]], [.032, .033, .01], accent, 6, 4); g.box([p[0], p[1] - .015, p[2]], [.05, .05, .012], accent, .008, [0, 0, .785]); }
        else if (pattern === 'clouds') { for (const side of [-1, 0, 1]) g.sphere([p[0] + side * .035, p[1] + (side ? 0 : .025), p[2]], [.042, .03, .009], accent, 6, 4); }
        else g.sphere(p, [.03, .03, .01], accent, 6, 4);
      }
      g.box([0, y + .26, -1.3], [3.25, .12, .08], '#F8ECDD', .02);
      // 固定观测台在可布置320宽平面后侧之外，不占库存或parent空间。
      // 圆形观星亭：木圆台+后半圈矮墙+奶油立柱+环梁，避免旧版“白墙+竖长窗”像屋顶上的一扇门。
      const ox = 2.45, oz = -2.05, closed = this.env.view.view === 'exterior' || this.env.view.floor === 'all';
      g.cylinder([ox, y, oz], 1.02, .2, '#BE987B', null, 32);
      g.cylinder([ox, y + .12, oz], .92, .07, floorTone, null, 32);
      for (let i = 0; i < 9; i++) {
        const a = Math.PI + i * Math.PI / 8, px = ox + Math.cos(a) * .9, pz = oz + Math.sin(a) * .9;
        g.box([px, y + .62, pz], [.38, .9, .1], tone, .04, [0, -a - Math.PI / 2, 0]);
        if (i % 2 === 0) { g.cylinder([px, y + 1.3, pz], .055, 2.3, '#FFF4E4', null, 10); g.sphere([px, y + 2.47, pz], [.09, .07, .09], '#E9C58A', 8, 5); }
      }
      for (let i = 0; i < 16; i++) { const a = i * TAU / 16; g.box([ox + Math.cos(a) * .92, y + 2.42, oz + Math.sin(a) * .92], [.38, .1, .12], '#D9A77B', .03, [0, -a - Math.PI / 2, 0]); }
      this.atticTelescope(g, room);
      if (closed) {
        // 全览/外观：玻璃穹顶+肋条+星形尖顶，阁楼前墙用房屋外墙色，配圆窗和童话斜顶。
        g.sphere([ox, y + 2.45, oz], [.98, .72, .98], this.env?.night ? '#7E8FC4' : '#BBD6E6', 24, 10);
        for (let k = 0; k < 6; k++) for (let t = 1; t < 6; t++) {
          const a = k * TAU / 6, phi = t * Math.PI / 12;
          g.sphere([ox + Math.cos(a) * Math.cos(phi) * .99, y + 2.45 + Math.sin(phi) * .73, oz + Math.sin(a) * Math.cos(phi) * .99], [.06, .05, .06], '#F4D988', 6, 4);
        }
        g.sphere([ox, y + 3.22, oz], [.12, .12, .12], '#FFD166', 10, 6);
        const outer = wallColor || tone;
        g.box([0, y + 1.14, 1.49], [3.45, 2.24, .15], outer, .055);
        for (const side of [-1, 1]) g.box([side * 1.62, y + 1.14, 1.58], [.14, 2.24, .08], '#D9A77B', .03);
        g.box([0, y + .1, 1.58], [3.45, .14, .08], '#D9A77B', .03);
        g.cylinder([0, y + 1.25, 1.58], .5, .06, '#FFF8EF', null, 28, [Math.PI / 2, 0, 0]);
        g.cylinder([0, y + 1.25, 1.62], .41, .05, this.env?.night ? '#FFE294' : '#A9C8DE', null, 28, [Math.PI / 2, 0, 0]);
        g.box([0, y + 1.25, 1.66], [.04, .8, .02], '#FFF8EF', .01); g.box([0, y + 1.25, 1.66], [.8, .04, .02], '#FFF8EF', .01);
        g.box([0, y + .66, 1.66], [.9, .12, .16], '#C98A63', .035);
        for (const f of [-1, 0, 1]) g.sphere([f * .26, y + .76, 1.68], [.08, .08, .08], f === 0 ? '#FFD166' : '#FF7898', 8, 6);
        g.roof([0, y + 2.3, 0], 3.8, 3.35, .85, roofColor);
        for (const side of [-1, 1]) for (let k = 0; k < 5; k++) g.sphere([side * (k * .38 + .12), y + 3.1 - k * .17, 1.68], [.22, .1, .12], roofColor, 10, 6);
      }
      this.hitBox('room', [0, y + .08, 0], [3.16, 2.1, 2.9], { room, surface: true });
      for (const item of (room.data.items || []).slice().sort((a, b) => (Number(a.z) || 0) - (Number(b.z) || 0))) { const def = defFor(item.defId); if (def && (this.env.omitUid == null || item.uid !== this.env.omitUid && item.parent !== this.env.omitUid)) this.furniture(g, room, item, def); }
      this.labels.push({ kind: 'room', room, text: '阁楼 · 布置', p: [0, y + 2.4, 1.5], world: { x: room.x + 160, y: room.y + 45 } });
    }
    atticTelescope(g, room) {
      const [x, bottom, z] = room.observation.p, y = bottom + .02;
      const rod = (a, b, r, tone) => { const v = b.map((n, i) => n - a[i]), length = Math.hypot(...v); g.cylinder(a.map((n, i) => (n + b[i]) / 2), r, length, tone, r, 12, [Math.asin(v[2] / length), 0, Math.atan2(-v[0], v[1])]); };
      g.cylinder([x, y + .02, z], .66, .035, '#DED7D1', null, 32);
      for (let i = 0; i < 3; i++) { const a = i * TAU / 3; rod([x + Math.cos(a) * .55, y + .09, z + Math.sin(a) * .55], [x, y + .98, z], .046, '#766B73'); g.sphere([x + Math.cos(a) * .55, y + .06, z + Math.sin(a) * .55], [.085, .045, .085], '#B99C82', 10, 5); }
      g.cylinder([x, y + 1.02, z], .17, .17, '#E6BE78', null, 18);
      g.box([x, y + 1.2, z], [.19, .3, .2], '#7C8294', .035);
      const axis = normalize([.35, .6, -.72]), rotation = [Math.asin(axis[2]), 0, Math.atan2(-axis[0], axis[1])], point = t => [x + axis[0] * t, y + 1.52 + axis[1] * t, z + axis[2] * t];
      g.cylinder(point(0), .205, 1.25, '#A9C3D5', null, 24, rotation);
      for (const t of [-.36, .32]) g.cylinder(point(t), .228, .085, '#F6E7C9', null, 24, rotation);
      g.cylinder(point(.66), .245, .09, '#E9C58A', null, 24, rotation);
      g.cylinder(point(.715), .197, .025, '#405772', null, 24, rotation);
      g.sphere(point(.74), [.09, .065, .055], '#C9E7ED', 12, 7);
      g.cylinder(point(-.71), .09, .2, '#6D7487', null, 16, rotation);
      g.cylinder([x + .25, y + 1.2, z + .06], .085, .11, '#E9C58A', null, 14, [0, 0, Math.PI / 2]);
      g.box([x - .23, y + 1.7, z], [.16, .085, .42], '#E4D6BC', .025, rotation);
      this.hitBox('attic', room.observation.p, room.observation.size, { fixed: true, roomId: room.id, world: room.observation.world });
      this.labels.push({ kind: 'attic', fixed: true, text: '固定望远镜 · 观星', p: [x, y + 2.45, z], roomId: room.id, world: room.observation.world });
    }
    build() {
      const env = this.env, state = env.state, house = state.house, M = G.world3dModels, g = new Geometry();
      this.hits = []; this.labels = []; this.labelHits = []; this.actors = []; this.yardEnvironment = null; this.builds++;
      if (env.gardenPage) {
        if (env.gardenPage.build(g, M) !== true) throw new Error('garden-page-build');
        for (const hit of env.gardenPage.hits) { const { kind, p, size, ...extra } = hit; this.hitBox(kind, p, size, extra); }
        this.labels = env.gardenPage.labels.slice();
        this.staticCount = this.vertexCount = g.data.length / 9; this.vertices = new Float32Array(g.data);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer); this.gl.bufferData(this.gl.ARRAY_BUFFER, this.vertices, this.gl.STATIC_DRAW);
        this.previewKey = ''; return;
      }
      if (env.stage) {
        env.stage.build(g, M);
        this.staticCount = this.vertexCount = g.data.length / 9; this.vertices = new Float32Array(g.data);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer); this.gl.bufferData(this.gl.ARRAY_BUFFER, this.vertices, this.gl.STATIC_DRAW);
        this.previewKey = ''; return;
      }
      const count = env.view.previewFourFloors ? Math.max(4, house.floors.length) : house.floors.length, exterior = house.exterior || {}, roofColor = color(exterior.roofColor, C.roof), wallColor = color(exterior.wallColor, '#FFE3C9');
      // 岛屿、院子、花园与邻居和楼层/视角无关；切换整屋、1F、外观时直接复用，只重建房屋部分。
      const outdoorKey = [!!G.prototypeYard3D?.build, env.omitUid || '', env.neighborKey || '', env.gardenKey || ''].join('|'), outdoor = this.outdoorCache;
      if (!env.roomOnly && outdoor?.key === outdoorKey && outdoor.state === state) {
        g.data = outdoor.data.slice(); this.hits.push(...outdoor.hits); this.labels.push(...outdoor.labels); this.yardEnvironment = outdoor.yardEnvironment;
      } else if (!env.roomOnly) {
        M.island(g, MAIN_ISLAND.x, MAIN_ISLAND.z, MAIN_ISLAND.radius, 0);
        // 前院两侧的草坪与土层延伸到正式yardConfig允许的角落。
        M.island(g, -4.3, 3.4, 3.0, 0); M.island(g, 4.3, 3.4, 3.0, 0);
        M.island(g, env.garden.center.x / 100, yardZ(env.garden.center.y), 3.25, -.02);
        for (let i = 0; i < 8; i++) g.box([6.1 + i * .17, .16, 3.18], [.21, .1, .9], '#e4c8a4', .055);
        // 统一平移/缩放原型整组院景，保留资产自身比例；右侧真实花园、桥和已放庭院家具独立。
        const yardOrigin = [0, 0, .3], yardScale = 1.2, vertexStart = g.data.length / 9;
        if (G.prototypeYard3D?.build) {
          const result = G.prototypeYard3D.build(g, { origin: yardOrigin, scale: yardScale, palette: { roof: '#c86e87', pink: '#efb1c0' } });
          this.yardEnvironment = Object.assign({ source: 'prototype', origin: yardOrigin, scale: yardScale, vertexStart, vertexCount: g.data.length / 9 - vertexStart }, result);
        } else this.yardEnvironment = { source: 'missing-prototype-yard', origin: yardOrigin, scale: yardScale, vertexStart, vertexCount: 0 };
        for (const [x, z, s] of [[-7.4, .5, .9], [6.3, 6.8, .9], [2.5, -5.5, 1.0]]) M.cloud(g, x, -.8, z, s);
        for (const plot of env.garden.plots) {
          const center = [plot.cropX / 100, .14, yardZ(plot.y + plot.h / 2)], pw = plot.w / 100, pd = plot.h / 75;
          const status = env.gardenStatuses?.[plot.index] || G.sys?.garden?.status?.(plot.index), crop = status?.crop && (G.data?.crops || []).find(v => v.id === (typeof status.crop === 'string' ? status.crop : status.crop.cropId || status.crop.id));
          g.box(center, [pw, .16, pd], '#AA8064', .14);
          g.box([center[0], .22, center[2]], [pw - .1, .04, pd - .1], status?.watered ? '#755B48' : '#8E684C', .06);
          for (let row = -1; row <= 1; row++) g.box([center[0], .235, center[2] + row * .19], [.83, .055, .06], '#C59C77', .025);
          if (status?.crop) {
            const ready = !!status.mature, scale = .25 + (status.stage || 0) * .23;
            for (const dx of [-.24, .24]) {
              const cx = center[0] + dx, cz = center[2], col = color(crop?.color, '#ECA8B2');
              if ((status.stage || 0) < 2) {
                g.cylinder([cx, .22 + scale * .17, cz], .018, scale * .34, C.mint, null, 6);
                for (const side of [-1, 1]) g.sphere([cx + side * .08 * scale, .28 + scale * .12, cz], [.13 * scale, .04 * scale, .07 * scale], C.mint, 8, 5);
              } else if (crop?.shape === 'tree') M.tree(g, cx, cz, scale * .5, .22, col);
              else if (crop?.shape === 'carrot') {
                g.cylinder([cx, .35, cz], .06 * scale, .29 * scale, col, .13 * scale, 12);
                g.sphere([cx, .48, cz], [.12 * scale, .04 * scale, .12 * scale], col, 10, 6);
                for (const side of [-1, 0, 1]) g.sphere([cx + side * .05, .55, cz], [.05, .17 * scale, .035], '#58B368', 8, 5, [0, 0, -side * .28]);
              } else if (crop?.shape === 'pumpkin') {
                for (let lobe = 0; lobe < 8; lobe++) {
                  const la = lobe * TAU / 8;
                  g.sphere([cx + Math.cos(la) * .05 * scale, .32 + scale * .16, cz + Math.sin(la) * .05 * scale], [scale * .16, scale * .18, scale * .16], lobe % 2 ? col : '#F27829', 10, 7);
                }
                g.cylinder([cx, .36 + scale * .34, cz], .025 * scale, .08 * scale, '#6E8F4E', .015 * scale, 8, [.18, 0, -.22]);
              } else if (crop?.shape === 'berry') {
                g.cylinder([cx, .33 + scale * .15, cz], .14 * scale, .24 * scale, col, .06 * scale, 14);
                for (let c = 0; c < 5; c++) {
                  const ca = c * TAU / 5;
                  g.sphere([cx + Math.cos(ca) * .06 * scale, .34 + scale * .28, cz + Math.sin(ca) * .06 * scale], [.06 * scale, .025, .04 * scale], '#52A864', 8, 5);
                }
                for (let k = 0; k < 5; k++) {
                  const sa = k * TAU / 5 + .3;
                  g.sphere([cx + Math.cos(sa) * .12 * scale, .33 + scale * .14, cz + Math.sin(sa) * .12 * scale], [.018, .022, .018], '#FFE07D', 6, 4);
                }
              } else if (['blueberry', 'star'].includes(crop?.shape)) {
                for (let k = 0; k < (crop.shape === 'blueberry' ? 4 : 1); k++) g.sphere([cx + (k % 2 - .5) * .12, .3 + scale * .17 + Math.floor(k / 2) * .1, cz], [scale * .19, scale * .2, scale * .18], col, 12, 8);
                g.sphere([cx, .32 + scale * .4, cz], [.12 * scale, .035, .12 * scale], C.mint, 8, 5);
              } else if (crop?.shape === 'lavender') {
                for (const side of [-1, 1]) { g.cylinder([cx + side * .06, .4, cz], .014, .4 * scale, C.mint, null, 6); for (let k = 0; k < 4; k++) g.sphere([cx + side * .06, .4 + k * .06 * scale, cz], [.065 * scale, .06 * scale, .055 * scale], col, 8, 5); }
              } else M.flower(g, cx, cz, col, scale * (crop?.id === 'sunflower' ? 1.35 : 1), .22);
            }
            if (ready) this.labels.push({ kind: 'plot', index: plot.index, text: '可以采收', p: [center[0], .95, center[2]], world: { x: plot.cropX, y: plot.y + plot.h / 2 } });
            else if (status.needsWater) this.labels.push({ kind: 'plot', index: plot.index, text: '需要浇水', p: [center[0], .8, center[2]], world: { x: plot.cropX, y: plot.y + plot.h / 2 } });
          }
          this.hitBox('plot', [center[0], .15, center[2]], [plot.w / 100, status?.crop ? .55 : .1, plot.h / 75], { index: plot.index, world: { x: plot.cropX, y: plot.y + plot.h / 2 } });
        }
        for (const item of house.yard?.items || []) {
          if (item.uid === env.omitUid) continue; const def = defFor(item.defId); if (!def) continue;
          const p = [(item.x + def.w / 2) / 100, .14, yardZ(item.y + def.h)], size = [def.w / 100, Math.max(.06, def.h / 100), clamp(def.w / 130, .2, 1.3)];
          M.furniture(g, def, item, p, size); this.hitBox('yard-item', p, size, { uid: item.uid, item, legacy: { x: item.x, y: item.y, w: def.w, h: def.h } });
        }
        for (const neighbor of env.neighbors || []) {
          const p = this.neighborLocation(neighbor, env), s = clamp(Number(neighbor.scale) || 1, .5, 1.25), r = 1.05 * s, empty = !!neighbor.empty;
          M.island(g, p[0], p[2], r, p[1]);
          if (!empty) {
            const online = !!neighbor.house?.online, glow = online ? '#FFE4A2' : '#BEDAE2', at = (dx, dy, dz) => [p[0] + dx * s, p[1] + dy * s, p[2] + dz * s];
            g.box([p[0], p[1] + .43 * s, p[2]], [1.08 * s, .82 * s, .85 * s], '#F5D5DB', .12 * s);
            g.roof([p[0], p[1] + .85 * s, p[2]], 1.35 * s, 1.08 * s, .58 * s, '#C86482');
            // 糖果小屋细节：屋檐圆瓦、烟囱、拱门、圆窗；在线时窗灯与门口小灯笼亮起。
            for (const side of [-1, 1]) for (let k = 0; k < 4; k++) g.sphere(at(side * (k * .17 + .06), 1.38 - k * .13, .55), [.11 * s, .05 * s, .06 * s], '#D9758F', 8, 5);
            g.box(at(.38, 1.35, -.15), [.16 * s, .34 * s, .16 * s], '#E7A1AE', .04 * s);
            g.box(at(-.2, .5, .45), [.26 * s, .3 * s, .05 * s], glow, .045 * s);
            g.box(at(.22, .3, .44), [.24 * s, .44 * s, .05 * s], '#D48A78', .1 * s);
            g.sphere(at(.31, .3, .47), [.025 * s, .025 * s, .025 * s], '#FFD166', 6, 4);
            g.cylinder(at(.42, .55, .47), .09 * s, .03 * s, online ? '#FFE294' : '#FFF4E4', null, 14, [Math.PI / 2, 0, 0]);
            if (online) { g.sphere(at(-.48, .42, .58), [.07 * s, .09 * s, .07 * s], '#FFD873', 10, 6); g.cylinder(at(-.48, .22, .58), .015 * s, .3 * s, '#9C7A63', null, 6); }
            M.tree(g, p[0] - .72 * s, p[2] - .3 * s, .32 * s, p[1], '#B7D8A8');
            for (let f = 0; f < 3; f++) M.flower(g, p[0] + (f - 1) * .26 * s, p[2] + .78 * s, ['#FF8FA8', '#FFD166', '#FFFFFF'][f], .7 * s, p[1]);
          }
          const data = { id: neighbor.id, empty, world: { x: neighbor.x, y: neighbor.y } };
          this.hitBox('neighbor', p, [2.2 * s, 2 * s, 2 * s], data);
          // 空岛上没有房子，牌子贴着草地上方（约半个单位）；有房子的岛才抬到屋顶之上。抬高了会像悬在半空、和岛对不上。
          this.labels.push(Object.assign({ kind: 'neighbor', text: empty ? '待邻居入住' : neighbor.house?.title || '邻居的小屋', p: [p[0], p[1] + (empty ? .55 : 1.9) * s, p[2]] }, data));
        }
        this.outdoorCache = { key: outdoorKey, state, data: g.data.slice(), hits: this.hits.slice(), labels: this.labels.slice(), yardEnvironment: this.yardEnvironment };
      }
      for (const room of env.rooms) {
        if (!this.roomAllowed(room) || env.view.floor === 'attic') continue;
        const base = floorY(room.floorIdx), x = roomX(room.slotIdx), real = room.floorIdx < house.floors.length;
        if (!room.data) {
          g.box([x, base, 0], [3.12, .14, 2.8], real ? '#E8D5C2' : '#DFC8CA', .08);
          g.box([x, base + 1.13, -1.43], [3.24, 2.2, .18], wallColor, .06);
          for (const side of [-1, 1]) {
            const outer = room.slotIdx === 0 && side === -1 || room.slotIdx === 2 && side === 1;
            if (outer || env.view.view === 'exterior') g.box([x + side * 1.59, base + 1.12, 0], [.13, 2.2, 2.95], wallColor, .045);
            else { g.box([x + side * 1.59, base + 1.12, -.75], [.13, 2.2, 1.45], wallColor, .045); g.box([x + side * 1.59, base + .3, .73], [.13, .55, 1.55], wallColor, .04); }
          }
          if (env.view.view === 'exterior') this.exteriorBay(g, x, base, room, wallColor);
          this.hitBox('empty', [x, base + .08, 0], [3.1, 1.8, 2.7], { room, world: { x: room.x + 160, y: room.y + 170 }, preview: !real });
          if (!env.visiting) this.labels.push({ kind: 'empty', room, preview: !real, text: real ? '待建房间' : '扩建预览 · 待建', p: [x, base + 1.0, 1.63], world: { x: room.x + 160, y: room.y + 170 } });
          continue;
        }
        const primary = color(room.data.wallpaper?.color, '#F1D8D3'), floorColor = color(room.data.floor?.color, '#EED7B9');
        g.box([x, base, 0], [3.24, .18, 2.95], '#C29A7D', .075);
        g.box([x, base + .12, 0], [3.12, .07, 2.83], floorColor, .035);
        for (let plank = -2; plank <= 2; plank++) {
          g.box([x + plank * .53, base + .16, 0], [.012, .012, 2.8], '#D5B99C', .002);
          if (room.data.floor?.pattern === 'tile' || room.data.floor?.pattern === 'check') g.box([x, base + .16, plank * .48], [3.1, .012, .012], '#D5B99C', .002);
        }
        g.box([x, base + 1.13, -1.43], [3.24, 2.2, .18], primary, .06);
        if (room.data.wallpaper?.pattern === 'dots') for (let col = -3; col <= 3; col++) for (let row = 0; row < 4; row++) g.sphere([x + col * .43, base + .4 + row * .42, -1.328], [.035, .035, .012], color(room.data.wallpaper.color2, '#FFF9EF'), 6, 4);
        if (room.data.wallpaper?.pattern === 'stripes') for (let col = -4; col <= 4; col++) g.box([x + col * .36, base + 1.13, -1.326], [.07, 2.08, .015], color(room.data.wallpaper.color2, '#FFF9EF'), .003);
        for (const side of [-1, 1]) {
          // 剖面打开前墙；外侧墙完整，内部隔墙前缘降低以露出实际房间。
          const outer = room.slotIdx === 0 && side === -1 || room.slotIdx === 2 && side === 1;
          if (outer || env.view.view === 'exterior') g.box([x + side * 1.59, base + 1.12, 0], [.13, 2.2, 2.95], wallColor, .045);
          else { g.box([x + side * 1.59, base + 1.12, -.75], [.13, 2.2, 1.45], wallColor, .045); g.box([x + side * 1.59, base + .3, .73], [.13, .55, 1.55], wallColor, .04); }
        }
        g.box([x, base + .29, -1.3], [3.1, .15, .09], C.white, .025);
        g.box([x, base + 1.25, -1.3], [.9, .95, .1], C.white, .09);
        g.box([x, base + 1.25, -1.22], [.73, .79, .045], C.blue, .06);
        g.box([x, base + 1.25, -1.18], [.04, .79, .025], C.white, .01);
        g.box([x, base + 1.25, -1.175], [.73, .04, .025], C.white, .01);
        if (env.view.view === 'exterior') {
          this.exteriorBay(g, x, base, room, wallColor);
          this.hitBox('room', [x, base + .1, 0], [3.16, 2.1, 3.35], { room, world: { x: room.x + 160, y: room.y + 170 } });
          continue;
        }
        this.hitBox('room', [x, base + .08, 0], [3.14, 2.05, 2.8], { room, surface: true });
        const orderedItems = (room.data.items || []).slice().sort((a, b) => (Number(a.z) || 0) - (Number(b.z) || 0));
        for (const item of orderedItems) { const def = defFor(item.defId); if (def && (env.omitUid == null || item.uid !== env.omitUid && item.parent !== env.omitUid)) this.furniture(g, room, item, def); }
        // 串门（env.visiting）时别人的房间不挂“待建/换位/进入房间”这类编辑入口。
        if (!env.visiting) this.labels.push({ kind: 'room-label', roomId: room.id, text: G.data?.rooms?.find(d => d.id === room.data.type)?.name || '房间', p: [x, base + 2.02, 1.47], world: { x: room.x + 160, y: room.y + 24 } });
        // “进入房间”入口挂在房间自己头上（与“待建房间”同类的场景标签），不放在装饰面板里：入口跟着房间走，一眼知道进的是哪间。
        // 文案依赖主角当前所在区域，所以主角 zone 变化必须让缓存重建（见 build 的缓存键）。
        if (!env.visiting) this.labels.push({ kind: 'room-enter', roomId: room.id, text: G.runtime?.player?.zone === room.id ? '去院子' : '进入房间', p: [x, base + 1.6, 1.47], world: { x: room.x + 160, y: room.y + 60 } });
      }
      if (!env.roomOnly) {
        const top = floorY(count) + .02;
        if (env.view.floor === 'all' || env.view.view === 'exterior') {
          g.roof([0, top, -.05], 10.16, 3.72, 1.45, roofColor);
          g.box([0, top + 1.46, -.05], [.18, .12, 3.82], shade(roofColor, .88), .04);
          for (const side of [-1, 1]) {
            g.box([side * 2.57, top + .72, -.05], [5.35, .2, 3.86], roofColor, .095, [0, 0, -side * .282]);
            for (let k = 0; k < 11; k++) {
              g.sphere([side * (k * .45 + .14), top + 1.4 - k * .126, 1.82], [.27, .115, .14], roofColor, 10, 6);
              g.sphere([side * (k * .45 + .14), top + 1.4 - k * .126, .92], [.25, .10, .14], shade(roofColor, .96), 10, 6);
            }
          }
          if (exterior.chimney !== 'none') {
            g.box([3.1, top + 1.25, -.5], [.6, 1.2, .65], '#C47A88', .065);
            g.box([3.1, top + 1.88, -.5], [.8, .18, .8], '#E7A1AE', .07);
          }
        }
      }
      if (env.atticRoom && this.roomAllowed(env.atticRoom)) this.atticSpace(g, env.atticRoom, roofColor, wallColor);
      else if (!house.attic && !env.roomOnly && env.view.floor === 'attic') {
        const y = floorY(count) + .17;
        g.box([0, y, .25], [3.3, .18, 2.25], '#C6A289', .08);
        this.hitBox('attic', [0, y, .25], [3.5, .2, 2.5], { preview: true, world: { x: env.attic.x + 160, y: env.attic.y + 92 } });
        this.labels.push({ kind: 'attic', preview: true, text: '阁楼待建 · Lv.' + (G.data?.observatoryConfig?.unlockLv || 17), p: [0, y + .6, .25], world: { x: env.attic.x + 160, y: env.attic.y + 92 } });
      }
      if (env.visitor && !env.roomOnly) {
        const p = [env.visitor.x / 100, 1.0, yardZ(env.visitor.y)];
        g.sphere(p, [.16, .12, .13], env.visitor.bee ? '#F3D180' : '#E4A1BE', 12, 8);
        for (const side of [-1, 1]) g.sphere([p[0] + side * .13, p[1] + .1, p[2] - .02], [.13, .07, .07], env.visitor.bee ? '#DEEAF0' : '#CEB6E6', 10, 6);
        this.hitBox('visitor', [p[0], p[1] - .2, p[2]], [.6, .6, .5], { world: { x: env.visitor.x, y: env.visitor.y } });
        this.labels.push({ kind: 'visitor', text: '点点我 +5', p: [p[0], p[1] + .5, p[2]], world: { x: env.visitor.x, y: env.visitor.y } });
      }
      this.resolveCoplanarLayers(g);
      this.staticCount = g.data.length / 9;
      const addActor = (id, avatar, resident, p, scale, extra) => {
        const start = g.data.length / 9;
        const mark = extra?.peer && G.liveAvatars?.markers?.(env.peers || [])?.[id];
        if (mark?.twin) { g.cylinder([0, .022, 0], .4, .025, mark.tone[1], null, 24); g.cylinder([0, .04, 0], .32, .025, '#B1CC91', null, 24); }
        M.character(g, avatar, [0, 0, 0], scale, resident);
        this.actors.push(Object.assign({ id, start, count: g.data.length / 9 - start, p, scale, resident }, extra));
      };
      for (const [id, resident] of Object.entries(state.residents || {})) {
        if (!resident.movedIn) continue; const room = env.rooms.find(r => r.id === resident.roomId && this.roomAllowed(r));
        if (!room || env.view.view === 'exterior' || env.view.floor === 'attic') continue;
        const def = G.data?.residents?.find(d => d.id === id);
        addActor(id, null, def, [roomX(room.slotIdx) + .4, floorY(room.floorIdx) + .16, .6], .64, { kind: 'resident', roomId: room.id });
      }
      if (!env.roomOnly && !env.visiting) addActor('nuomi', null, G.data?.residents?.find(d => d.id === 'nuomi') || { species: 'rabbit', color: '#FFF2DB', accent: '#ECA3BA' }, [-5.45, .15, 2.5], .68, { kind: 'resident' });
      if (!env.hidePlayer && !env.peers?.some(p => p.id === env.selfId)) {
        // 主角进的是 zone 指定的那间房；找不到（房间被收起/当前楼层看不到）才退回第一间可见房，再不行留在院子。
        const zone = G.runtime?.player?.zone, room = env.rooms.find(r => r.id && r.id === zone && this.roomAllowed(r)) || env.rooms.find(r => r.id && this.roomAllowed(r)), indoors = room && env.view.view !== 'exterior' && env.view.floor !== 'attic';
        const inYard = !indoors || G.runtime?.player?.zone === 'yard';
        const defaultYardPos = [-2.2, .15, 3.25];
        const runtimePos = G.runtime?.player ? [G.runtime.player.x, G.runtime.player.y ?? .15, G.runtime.player.z] : defaultYardPos;
        const playerPos = inYard ? runtimePos : [roomX(room.slotIdx) - .8, floorY(room.floorIdx) + .16, .9];
        if (!env.roomOnly || inYard) addActor('player', state.avatar, null, playerPos, .7, { kind: 'player', inYard });
      }
      for (const peer of env.peers || []) {
        const world = G.liveAvatars?.position(house, peer); if (!world) continue;
        const room = peer.zone !== 'yard' && env.rooms.find(r => r.id === peer.zone);
        if (peer.zone !== 'yard' && (!room || !this.roomAllowed(room) || env.view.view === 'exterior' || env.view.floor === 'attic')) continue;
        addActor(peer.id, peer.avatar, null, this.logicalToWorld(world.x, world.y), .7, { kind: 'peer', peer });
      }
      this.vertexCount = g.data.length / 9; this.vertices = new Float32Array(g.data);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer); this.gl.bufferData(this.gl.ARRAY_BUFFER, this.vertices, this.gl.STATIC_DRAW);
      this.previewKey = '';
    }
    actorPosition(actor) {
      const env = this.env;
      if (actor.kind === 'player' && (actor.inYard || G.runtime?.player?.zone === 'yard')) {
        if (G.runtime?.player) return [G.runtime.player.x, G.runtime.player.y ?? .15, G.runtime.player.z];
      }
      if (actor.kind === 'resident' && actor.roomId) {
        const frame = env.residentFrame?.find(v => v.id === actor.id && v.roomId === actor.roomId), room = env.rooms.find(r => r.id === actor.roomId);
        if (frame && room) { const foot = G.roomSpace.foot(frame.x, frame.depth); return this.logicalToWorld(room.x + foot.x, room.y + foot.y); }
      }
      if (actor.kind === 'peer') { const peer = env.peers.find(p => p.id === actor.id), world = peer && G.liveAvatars?.position(env.state.house, peer); if (world) return this.logicalToWorld(world.x, world.y); }
      return actor.p;
    }
    attributes(buffer) {
      const gl = this.gl, loc = this.locations; gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      for (const [location, offset] of [[loc.position, 0], [loc.normal, 12], [loc.color, 24]]) { gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 36, offset); }
    }
    render(context, env, options) {
      if (!this.ready || this.destroyed) return false;
      this.setEnvironment(env);
      const ratio = Math.min(1.5, env.dpr || 1);
      const renderW = env.width, renderH = env.height, renderOffsetX = env.offsetX || 0, renderOffsetY = env.offsetY || 0;
      const gl = this.gl, w = Math.max(1, Math.round(renderW * ratio)), h = Math.max(1, Math.round(renderH * ratio));
      if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
      gl.viewport(0, 0, w, h); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.useProgram(this.program);
      gl.uniformMatrix4fv(this.locations.matrix, false, this.matrix); gl.uniform3fv(this.locations.eye, this.eye); gl.uniform1f(this.locations.night, env.night ? 1 : 0); gl.uniform1f(this.locations.opacity, 1); gl.uniform3fv(this.locations.offset, [0, 0, 0]);
      this.attributes(this.buffer); gl.drawArrays(gl.TRIANGLES, 0, this.staticCount);
      for (const actor of this.actors) {
        actor.current = this.actorPosition(actor);
        let offset = actor.current;
        if (!env.reducedMotion && !options?.photo && !env.capturingPhoto && Number.isFinite(env.time)) {
          const isPlayerWalking = actor.kind === 'player' && G.runtime?.player?.walking;
          const phase = isPlayerWalking ? env.time * 9.5 : (env.time * 2.6 + (actor.start % 7) * .7);
          const bobHeight = isPlayerWalking ? .055 : (actor.kind === 'peer' || actor.kind === 'player' ? .028 : .018);
          const bob = Math.abs(Math.sin(phase)) * bobHeight;
          offset = [actor.current[0], actor.current[1] + bob, actor.current[2]];
        }
        gl.uniform3fv(this.locations.offset, offset);
        gl.drawArrays(gl.TRIANGLES, actor.start, actor.count);
      }
      if (env.preview) this.drawPreview(env.preview);
      context.drawImage(this.canvas, renderOffsetX, renderOffsetY, renderW, renderH);
      if (!options?.photo) {
        context.save(); context.beginPath(); context.rect(renderOffsetX, renderOffsetY, renderW, renderH); context.clip();
        this.drawLabels(context); context.restore();
      }
      return true;
    }
    drawPreview(preview) {
      const key = JSON.stringify(preview), gl = this.gl;
      if (key !== this.previewKey) {
        const g = new Geometry();
        if (preview.room) {
          const source = (this.env.atticRoom ? this.env.rooms.concat(this.env.atticRoom) : this.env.rooms).find(room => room.data?.items?.some(item => item.uid === preview.item.uid));
          const original = source?.data.items.find(item => item.uid === preview.item.uid), children = original ? source.data.items.filter(item => item.parent === original.uid).map(item => Object.assign({}, item, { x: item.x + preview.item.x - original.x, y: item.y + preview.item.y - original.y })) : [];
          const moving = new Set([preview.item.uid, ...children.map(item => item.uid)]), room = Object.assign({}, preview.room, { data: Object.assign({}, preview.room.data, { items: preview.room.data.items.filter(item => !moving.has(item.uid)).concat(preview.item, children) }) });
          this.furniture(g, room, preview.item, preview.def, false);
          for (const child of children) { const def = defFor(child.defId); if (def) this.furniture(g, room, child, def, false); }
        }
        else { const def = preview.def, item = preview.item; G.world3dModels.furniture(g, def, item, [(item.x + def.w / 2) / 100, .14, yardZ(item.y + def.h)], [def.w / 100, def.h / 100, clamp(def.w / 130, .2, 1.3)]); }
        this.previewCount = g.data.length / 9; gl.bindBuffer(gl.ARRAY_BUFFER, this.previewBuffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(g.data), gl.DYNAMIC_DRAW); this.previewKey = key;
      }
      this.attributes(this.previewBuffer); gl.uniform3fv(this.locations.offset, [0, 0, 0]); gl.uniform1f(this.locations.opacity, .58);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.drawArrays(gl.TRIANGLES, 0, this.previewCount); gl.depthMask(true); gl.disable(gl.BLEND); gl.uniform1f(this.locations.opacity, 1);
    }
    // 从牌子位置顺镜头方向看过去，穿过小屋就算被挡住（如房子背面小岛的牌子），不画也不能点。
    houseBlocks(p) {
      const floors = this.env.state?.house?.floors?.length;
      if (!floors || this.env.gardenPage || !this.eye || !this.target) return false;
      const d = this.eye.map((v, i) => v - this.target[i]), length = Math.hypot(d[0], d[1], d[2]); if (!length) return false;
      const low = [roomX(0) - 1.7, 0, -1.7], high = [roomX(2) + 1.7, floorY(floors) + 3.4, 1.7];
      let near = 0, far = Infinity;
      for (let i = 0; i < 3; i++) {
        const v = d[i] / length;
        if (Math.abs(v) < 1e-9) { if (p[i] < low[i] || p[i] > high[i]) return false; continue; }
        let t0 = (low[i] - p[i]) / v, t1 = (high[i] - p[i]) / v; if (t0 > t1) [t0, t1] = [t1, t0];
        near = Math.max(near, t0); far = Math.min(far, t1); if (near > far) return false;
      }
      return far > .05;
    }
    drawLabels(c) {
      this.labelHits = [];
      const label = (text, p, data, tone) => {
        const q = this.project(p); if (q.x < (this.env.offsetX || 0) - 150 || q.x > (this.env.offsetX || 0) + this.env.width + 150 || q.y < (this.env.offsetY || 0) || q.y > (this.env.offsetY || 0) + this.env.height) return;
        c.save(); c.font = '600 12px "PingFang SC",sans-serif';
        const roomWidth = data?.kind === 'room-label' ? Math.abs(this.project([p[0] + 1.5, p[1], p[2]]).x - this.project([p[0] - 1.5, p[1], p[2]]).x) : 180;
        let caption = text, w = Math.max(40, Math.min(roomWidth * .94, 180, c.measureText(text).width + 24)), h = 26;
        if (this.env.gardenPage && data?.kind === 'plot') {
          const plot = this.env.gardenPage.plots.find(value => value.index === data.index);
          if (plot) {
            const width = Math.abs(this.project([plot.p[0] + plot.size[0] / 2, p[1], p[2]]).x - this.project([plot.p[0] - plot.size[0] / 2, p[1], p[2]]).x) * .9;
            const height = Math.abs(this.project([p[0], p[1], plot.p[2] + plot.size[2] / 2]).y - this.project([p[0], p[1], plot.p[2] - plot.size[2] / 2]).y) * .8;
            if (width < 14 || height < 10) { c.restore(); return; }
            h = Math.min(26, height); c.font = '600 ' + Math.min(12, Math.max(9, h * .6)) + 'px "PingFang SC",sans-serif';
            // 窄格先显示编号，完整状态仍在纸页与实体状态牌中；不能横跨邻格扩大点击区。
            if (c.measureText(caption).width + 16 > width) caption = String(data.index + 1);
            w = Math.min(width, c.measureText(caption).width + 16);
          }
        }
        c.fillStyle = tone || '#FFF6E9'; c.strokeStyle = '#D7A8B5'; c.lineWidth = 1.2;
        c.beginPath(); c.roundRect ? c.roundRect(q.x - w / 2, q.y - h / 2, w, h, Math.min(10, h / 2)) : c.rect(q.x - w / 2, q.y - h / 2, w, h); c.fill(); c.stroke();
        c.fillStyle = '#744554'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(caption, q.x, q.y, w - 12); c.restore();
        if (data) this.labelHits.push(Object.assign({ screen: { x: q.x - w / 2, y: q.y - h / 2, w, h } }, data));
      };
      for (const value of this.labels) { if (value.kind === 'neighbor' && this.houseBlocks(value.p)) continue; label(value.text, value.p, value); }
      const marks = G.liveAvatars?.markers?.(this.env.peers || []);
      for (const actor of this.actors) {
        if (actor.kind === 'peer') { const p = actor.current || actor.p, mark = marks?.[actor.id]; label(String(actor.peer.displayName || '小小建筑师') + (actor.id === this.env.selfId ? ' · 我' : actor.peer.isHost ? ' · 主人' : ''), [p[0], p[1] + 1.5, p[2]], null, mark?.tone?.[0]); }
        const bubbles = actor.kind === 'resident' && this.env.state.residents?.[actor.id]?.heartBubbles;
        if (bubbles) { const p = actor.current || actor.p; label('♥', [p[0] + .25, p[1] + 1.25, p[2]], { kind: 'resident', id: actor.id, world: { x: 0, y: 0 } }); }
      }
      const selected = this.env.selected, hit = selected && this.hits.find(v => v.uid === selected.uid && (!selected.roomId || v.roomId === selected.roomId));
      if (hit) {
        const corners = [[hit.min[0], hit.min[2]], [hit.max[0], hit.min[2]], [hit.max[0], hit.max[2]], [hit.min[0], hit.max[2]]].map(v => this.project([v[0], hit.min[1] + .03, v[1]]));
        c.save(); c.strokeStyle = '#B9446B'; c.lineWidth = 2; c.setLineDash([5, 4]); c.beginPath(); corners.forEach((q, i) => i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)); c.closePath(); c.stroke(); c.restore();
      }
    }
    groundAt(ray, room, held) {
      const above = held?.def ? held.def.h * (1 - (held.grab?.v ?? 1)) : 0;
      const frame = this.spaceFrame(room), plane = rayPlane(ray, 1, frame.y + .15 + above / 100); if (!plane) return null;
      const { p, distance: t } = plane, center = frame.x;
      if (p[0] < center - 1.6 || p[0] > center + 1.6 || p[2] < frame.minZ || p[2] > frame.maxZ) return null;
      const depth = depthAtZ(p[2]), foot = G.roomSpace.foot(160 + (p[0] - center) * 100, depth);
      return { distance: t, kind: room.id ? 'room' : 'empty', room, world: { x: room.x + foot.x, y: room.y + foot.y - above * foot.scale } };
    }
    containsScreen(x, y) {
      if (!this.env || !Number.isFinite(x) || !Number.isFinite(y)) return false;
      const left = this.env.offsetX || 0, top = this.env.offsetY || 0;
      return x >= left && y >= top && x < left + this.env.width && y < top + this.env.height;
    }
    pick(x, y, placement) {
      if (!this.ready || !this.containsScreen(x, y)) return null;
      if (this.env.stage) return { kind: 'stage', id: this.env.stage.id, world: { x: NaN, y: NaN } };
      let labelHit = null;
      if (!placement) for (const hit of (this.labelHits || []).slice().reverse()) { const s = hit.screen; if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) { labelHit = hit; break; } }
      if (labelHit && !this.env.gardenPage) return labelHit;
      const held = placement && typeof placement === 'object' ? placement : null, mode = held ? held.place : placement;
      const ray = this.ray(x, y), candidates = [];
      for (const hit of this.hits) {
        if (mode && hit.fixed) { const fixed = rayBox(ray, hit); if (fixed) candidates.push({ kind: 'fixed-observatory', fixed: true, distance: fixed.distance, world: { x: NaN, y: NaN } }); continue; }
        if (mode === 'yard') continue;
        if (mode === 'table' && hit.kind === 'item' && hit.def?.surface) {
          const planeY = hit.p[1] + hit.size[1] * surfaceRatio(hit.def) + (held?.def ? held.def.h * (1 - (held.grab?.v ?? 1)) / 100 : 0), plane = rayPlane(ray, 1, planeY);
          if (plane && plane.p[0] >= hit.min[0] && plane.p[0] <= hit.max[0] && plane.p[2] >= hit.min[2] && plane.p[2] <= hit.max[2]) {
            const { p, distance: t } = plane;
            const pos = G.roomSpace.item(hit.room.data, hit.item), fraction = clamp((p[0] - hit.min[0]) / hit.size[0], 0, 1), above = held?.def ? held.def.h * (1 - (held.grab?.v ?? 1)) : 0;
            candidates.push({ kind: 'room', room: hit.room, distance: t, world: { x: hit.room.x + pos.x + pos.w * fraction, y: hit.room.y + pos.y + hit.def.surface.y * pos.scale - above * pos.scale } });
          }
          continue;
        }
        if (mode && !['room', 'empty', 'plot', 'attic'].includes(hit.kind)) continue;
        const test = rayBox(ray, hit); if (!test) continue;
        let world = hit.world;
        if (hit.surface || placement && hit.room) {
          if (mode === 'wall' || mode === 'ceiling') {
            const frame = this.spaceFrame(hit.room), plane = rayPlane(ray, 2, frame.backZ); if (!plane) continue;
            const { p: wall, distance: wallT } = plane;
            const localX = 160 + (wall[0] - frame.x) * 100, localY = 142 - (wall[1] - frame.y) * 78;
            if (wallT >= 0 && localX >= 0 && localX <= 320 && localY >= 0 && localY <= 160) candidates.push(Object.assign({}, hit, { world: { x: hit.room.x + localX, y: hit.room.y + localY }, distance: wallT }));
            continue;
          }
          const ground = this.groundAt(ray, hit.room, held); if (ground) candidates.push(ground);
          else if (!placement && hit.surface) {
            const frame = this.spaceFrame(hit.room), wall = rayPlane(ray, 2, frame.backZ), roomCenter = frame.x, base = frame.y;
            if (wall && wall.p[0] >= roomCenter - 1.6 && wall.p[0] <= roomCenter + 1.6 && wall.p[1] >= base && wall.p[1] <= base + 2.2) candidates.push(Object.assign({}, hit, { distance: wall.distance, world: { x: hit.room.x + 160 + (wall.p[0] - roomCenter) * 100, y: hit.room.y + clamp(142 - (wall.p[1] - base) * 78, 15, 140) } }));
          }
          // 放置只能使用真正的支撑平面；后缘AABB相交不能替代失败的地板/台面求交。
          continue;
        }
        if (hit.legacy) {
          const b = hit.legacy;
          world = { x: b.x + clamp((test.p[0] - hit.min[0]) / (hit.max[0] - hit.min[0]), .1, .9) * b.w, y: b.y + clamp(1 - (test.p[1] - hit.min[1]) / (hit.max[1] - hit.min[1]), .1, .9) * b.h };
        }
        candidates.push(Object.assign({}, hit, { world, distance: test.distance }));
      }
      if (!placement) for (const actor of this.actors) {
        if (actor.kind === 'peer') continue;
        const p = actor.current || actor.p, test = rayBox(ray, boundsFor(p, [.65, 1.2, .55]));
        if (test) candidates.push({ kind: actor.kind, id: actor.id, roomId: actor.roomId, distance: test.distance, world: { x: p[0] * 100, y: actor.roomId ? this.env.rooms.find(r => r.id === actor.roomId).y + 190 : 80 } });
      }
      candidates.sort((a, b) => {
        const distance = a.distance - b.distance;
        const sameSupport = a.kind === 'item' && b.kind === 'item' && a.roomId === b.roomId && a.def?.place === b.def?.place && (a.item?.parent || null) === (b.item?.parent || null) && (a.layerGroup && a.layerGroup === b.layerGroup || Math.abs(a.p[1] - b.p[1]) < 1e-7 && Math.abs(a.p[2] - b.p[2]) < 1e-7);
        return Math.abs(distance) < 1e-7 && sameSupport ? (Number(b.item?.z) || 0) - (Number(a.item?.z) || 0) || distance : distance;
      });
      if (candidates.length) {
        const hit = candidates[0];
        return this.env.gardenPage && labelHit && labelHit.kind === hit.kind && (hit.kind !== 'plot' || labelHit.index === hit.index) ? labelHit : hit;
      }
      // 园区浮签不能抢走其它真实地块/植株；没有实体命中时浮签仍可点击。
      if (labelHit) return labelHit;
      if (this.env.gardenPage) return null;
      const plane = rayPlane(ray, 1, .14);
      return plane ? { kind: 'ground', world: { x: plane.p[0] * 100, y: (plane.p[2] - 1.45) * 75 } } : null;
    }
    screenToWorld(x, y, placement) {
      if (!this.containsScreen(x, y)) return { x: NaN, y: NaN, outsideViewport: true, target: { kind: 'outside-viewport' } };
      const hit = this.pick(x, y, placement); return hit ? Object.assign({}, hit.world, { target: hit, stagePreview: hit.kind === 'stage' }) : { x: NaN, y: NaN, invalidProjection: true, target: { kind: 'void' } };
    }
    destroy() {
      if (this.destroyed) return; this.destroyed = true; this.ready = false;
      this.canvas.removeEventListener('webglcontextlost', this._lost); this.canvas.removeEventListener('webglcontextrestored', this._restored);
      this.release(); this.gl?.getExtension('WEBGL_lose_context')?.loseContext(); this.hits = []; this.actors = []; this.vertices = null; this.env = null; this.stageView = null; this.canvas.width = this.canvas.height = 1;
      this.neighborLocations?.clear();
      this.gardenView = null; this.lastHouseFrame = null;
    }
  }
  G.World3D = World3D;
  G.world3dMath = Object.freeze({ Geometry, rayBox, rayPlane, floorY, roomX, depthZ, depthAtZ, yardZ });
})(window.Game = window.Game || {});
