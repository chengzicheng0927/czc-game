'use strict';
// MC-076：真实状态、投影/拾取和GL资源契约。使用有状态GL替身，不把此检查当像素验收。
// 本文件不启动浏览器、服务器、RAF或存档；由总集串行执行。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');

function glFixture() {
  let serial = 0, bound = null;
  const resources = { buffers: new Set(), shaders: new Set(), programs: new Set() };
  const record = { uploads: [], draws: [], viewport: [], deleted: [], lost: 0, uniforms: new Map() };
  const allocate = kind => { const value = { kind, id: ++serial }; resources[kind].add(value); return value; };
  const release = (kind, value) => { assert.ok(resources[kind].delete(value), 'GPU资源只能释放一次'); record.deleted.push(value); };
  const gl = {
    ARRAY_BUFFER: 34962, STATIC_DRAW: 35044, DYNAMIC_DRAW: 35048, TRIANGLES: 4, FLOAT: 5126,
    VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632, COMPILE_STATUS: 35713, LINK_STATUS: 35714,
    DEPTH_TEST: 2929, LEQUAL: 515, CULL_FACE: 2884, COLOR_BUFFER_BIT: 16384, DEPTH_BUFFER_BIT: 256,
    BLEND: 3042, SRC_ALPHA: 770, ONE_MINUS_SRC_ALPHA: 771,
    createShader: () => allocate('shaders'), createProgram: () => allocate('programs'), createBuffer: () => allocate('buffers'),
    deleteShader: value => release('shaders', value), deleteProgram: value => release('programs', value), deleteBuffer: value => release('buffers', value),
    shaderSource(shader, source) { assert.ok(resources.shaders.has(shader)); assert.ok(source.length > 50); shader.source = source; },
    compileShader(shader) { assert.ok(shader.source); shader.compiled = true; },
    getShaderParameter(shader, flag) { assert.equal(flag, gl.COMPILE_STATUS); return !!shader.compiled; },
    attachShader(program, shader) { assert.ok(resources.programs.has(program)); assert.ok(shader.compiled); (program.shaders ||= []).push(shader); },
    linkProgram(program) { assert.equal(program.shaders.length, 2); program.linked = true; },
    getProgramParameter(program, flag) { assert.equal(flag, gl.LINK_STATUS); return !!program.linked; },
    getAttribLocation(program, name) { assert.ok(program.linked); return { aPosition: 0, aNormal: 1, aColor: 2 }[name]; },
    getUniformLocation(program, name) { assert.ok(program.linked); return name; },
    bindBuffer(target, buffer) { assert.equal(target, gl.ARRAY_BUFFER); assert.ok(resources.buffers.has(buffer)); bound = buffer; },
    bufferData(target, values, usage) {
      assert.equal(target, gl.ARRAY_BUFFER); assert.ok(resources.buffers.has(bound)); assert.ok(values.length > 0);
      for (const n of values) assert.ok(Number.isFinite(n), '上传顶点必须有限');
      bound.length = values.length; record.uploads.push({ buffer: bound, length: values.length, usage });
    },
    useProgram(program) { assert.ok(resources.programs.has(program)); assert.ok(program.linked); },
    viewport(...args) { args.forEach(n => assert.ok(Number.isFinite(n))); record.viewport.push(args); },
    uniformMatrix4fv(location, transpose, value) { assert.equal(transpose, false); assert.equal(value.length, 16); for (const n of value) assert.ok(Number.isFinite(n)); record.uniforms.set(location, Array.from(value)); },
    uniform3fv(location, value) { assert.equal(value.length, 3); for (const n of value) assert.ok(Number.isFinite(n)); record.uniforms.set(location, Array.from(value)); },
    uniform1f(location, value) { assert.ok(Number.isFinite(value)); record.uniforms.set(location, value); },
    enableVertexAttribArray(index) { assert.ok(Number.isInteger(index) && index >= 0); },
    vertexAttribPointer(index, size, type, normalized, stride, offset) { assert.equal(size, 3); assert.equal(type, gl.FLOAT); assert.equal(stride, 36); assert.ok(offset >= 0 && offset <= 24); },
    drawArrays(mode, start, count) { assert.equal(mode, gl.TRIANGLES); assert.ok(start >= 0 && count > 0); assert.ok((start + count) * 9 <= bound.length); record.draws.push({ start, count, buffer: bound }); },
    enable() {}, disable() {}, depthFunc() {}, clearColor() {}, clear() {}, blendFunc() {}, depthMask() {},
    getExtension(name) { assert.equal(name, 'WEBGL_lose_context'); return { loseContext() { record.lost++; } }; }
  };
  return { gl, resources, record };
}

function setup() {
  const surfaces = [], document = { hidden: false, addEventListener() {}, createElement(tag) {
    assert.equal(tag, 'canvas'); const gpu = glFixture(), listeners = new Map();
    const canvas = { width: 0, height: 0, style: {}, listeners, gpu,
      getContext(type, options) { assert.equal(type, 'webgl'); assert.equal(options.preserveDrawingBuffer, true); return gpu.gl; },
      addEventListener(name, fn) { assert.ok(!listeners.has(name)); listeners.set(name, fn); },
      removeEventListener(name, fn) { assert.equal(listeners.get(name), fn); listeners.delete(name); }
    }; surfaces.push(canvas); return canvas;
  } };
  const context = vm.createContext({ console, document, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {} }); context.window = context;
  const files = ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/garden.js', 'js/data/outfits.js', 'js/data/yard.js', 'js/core/utils.js', 'js/core/bus.js', 'js/core/store.js', 'js/systems/systems.js', 'js/render/room-space.js', 'js/render/live-avatars.js', 'js/render/world3d-models.js', 'js/render/world3d.js', 'js/render/scene.js'];
  files.forEach(file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file }));
  const G = context.Game; G.store.init(); G.store.update(state => { state.level = 30; state.wallet.coin = 100000; });
  G.sys.garden = { capacity: () => G.data.gardenConfig.expandedPlots, status: () => ({ crop: null }) };
  const first = G.sys.building.buildRoom(0, 0, 'bedroom'), upper = G.sys.building.buildRoom(1, 2, 'living');
  assert.ok(first.ok); assert.ok(upper.ok);
  const placed = G.sys.decorating.place('bed_basic', first.roomId, 88, 130, null, .68); assert.ok(placed.ok);
  function rooms() {
    return G.state.house.floors.flatMap((floor, floorIdx) => floor.slots.map((id, slotIdx) => ({ id, floorIdx, slotIdx, x: -480 + slotIdx * 320, y: -220 - floorIdx * 220, data: id ? G.state.house.rooms[id] : null })));
  }
  function environment(patch) {
    return Object.assign({ width: 1280, height: 720, dpr: 3, camera: { x: 50, y: -190, scale: .72 }, state: G.state, rooms: rooms(), garden: G.render.layout.garden(), attic: G.render.layout.attic(), view: { floor: 'all', view: 'cutaway', previewFourFloors: false }, peers: [], neighbors: [], residentFrame: [], hidePlayer: true }, patch || {});
  }
  function cpu(patch) {
    const world = Object.create(G.World3D.prototype);
    Object.assign(world, { ready: true, dirty: true, destroyed: false, angle: .43, elevation: .49, hits: [], actors: [], labels: [], labelHits: [], builds: 0, gl: glFixture().gl, buffer: {} });
    // 纯CPU试验只用投影/射线，不调用build或构造WebGL。
    world.env = environment(patch); world.updateCamera(world.env); return world;
  }
  return { G, surfaces, first: first.roomId, upper: upper.roomId, uid: placed.uid, rooms, environment, cpu };
}
function near(actual, expected, epsilon = 1e-4) { assert.ok(Math.abs(actual - expected) <= epsilon, actual + ' 应接近 ' + expected); }
function vector(actual, expected, epsilon) { actual.forEach((value, i) => near(value, expected[i], epsilon)); }
const tests = []; const test = (name, fn) => tests.push({ name, fn });

test('真实正交投影和射线在桌面/手机及两种旋转方向保持同一直线', () => {
  const { cpu } = setup();
  for (const [width, height] of [[1280, 720], [390, 844]]) for (const angle of [-.72, .43, .95]) {
    const world = cpu({ width, height }); world.angle = angle; world.updateCamera(world.env);
    for (const p of [[-3.2, .4, .8], [3.2, 3.2, -.8], [10, .15, 3.4], [0, 6, 0]]) {
      const screen = world.project(p), ray = world.ray(screen.x, screen.y), t = p.reduce((sum, n, i) => sum + (n - ray.origin[i]) * ray.direction[i], 0);
      vector(ray.origin.map((n, i) => n + ray.direction[i] * t), p, 2e-5);
    }
  }
});

test('侧面板与顶部HUD的viewport偏移同时作用于投影和反算，不把点击错移到画布原点', () => {
  const { cpu } = setup();
  for (const [width, height, offsetX, offsetY] of [[840, 600, 24, 76], [354, 540, 18, 114]]) {
    const original = cpu({ width, height }), shifted = cpu({ width, height, offsetX, offsetY });
    shifted.angle = original.angle = -.56; shifted.updateCamera(shifted.env); original.updateCamera(original.env);
    for (const p of [[-3.2, .39, 0], [0, 3.1, -.5], [10, .13, 3.5]]) {
      const normal = original.project(p), screen = shifted.project(p);
      near(screen.x - normal.x, offsetX, .00001); near(screen.y - normal.y, offsetY, .00001);
      const normalRay = original.ray(normal.x, normal.y), shiftedRay = shifted.ray(screen.x, screen.y);
      vector(shiftedRay.origin, normalRay.origin, .00001); vector(shiftedRay.direction, normalRay.direction, .00001);
    }
  }
});

test('带偏移的viewport半开边界拒绝边距外真实家具及全部放置模式，内部仍能命中UID', () => {
  const { G, cpu, rooms, first, upper, uid } = setup();
  assert.ok(G.sys.decorating.move(first, uid, upper, 88, 130, null, .68).ok);
  const room = rooms().find(value => value.id === upper), item = room.data.items.find(value => value.uid === uid), def = G.data.furnitureById[item.defId];
  const world = cpu({ width: 600, height: 320, offsetX: 80, offsetY: 64, camera: { x: 320, y: -300, scale: 1 } });
  world.angle = 0; world.updateCamera(world.env);
  const model = world.furniture(new G.world3dMath.Geometry(), room, item, def), center = [model.p[0], model.p[1] + model.size[1] / 2, model.p[2]], hit = world.hits.find(value => value.uid === uid);
  const modes = [undefined, 'floor', 'wall', 'ceiling', 'table', 'yard', { place: 'floor', def, grab: { u: .2, v: .6 } }];
  function aim(x, y) {
    const before = world.project(center), camera = world.env.camera;
    camera.x += (before.x - x) / camera.scale;
    camera.y += (before.y - y) / (Math.cos(world.elevation) * camera.scale);
    assert.ok(camera.y < 0, '此试验保持相机目标位于房屋高度区间'); world.updateCamera(world.env);
    const screen = world.project(center); near(screen.x, x, .0001); near(screen.y, y, .0001); return screen;
  }
  for (const target of [[20, 224], [740, 224], [380, 20], [380, 430]]) {
    const screen = aim(...target);
    assert.ok(G.world3dMath.rayBox(world.ray(screen.x, screen.y), hit), '真实家具仍在该射线下，拒绝不能来自碰巧没物体');
    assert.equal(world.containsScreen(screen.x, screen.y), false);
    for (const mode of modes) {
      assert.equal(world.pick(screen.x, screen.y, mode), null);
      const point = world.screenToWorld(screen.x, screen.y, mode);
      assert.ok(Number.isNaN(point.x) && Number.isNaN(point.y)); assert.equal(point.outsideViewport, true); assert.equal(point.target.kind, 'outside-viewport');
    }
  }
  for (const [x, y, expected] of [[80, 64, true], [679.999, 383.999, true], [79.999, 224, false], [380, 63.999, false], [680, 224, false], [380, 384, false], [NaN, 224, false], [380, Infinity, false]]) assert.equal(world.containsScreen(x, y), expected);
  const inside = aim(380, 224), selected = world.pick(inside.x, inside.y); assert.equal(selected.kind, 'item'); assert.equal(selected.uid, uid); assert.equal(selected.roomId, upper);
});

test('地板落点反解保留房间ID和正式roomSpace前后深度', () => {
  const { cpu, rooms, G, first } = setup(), room = rooms().find(r => r.id === first);
  for (const angle of [-.62, .62]) for (const depth of [.12, .48, .86]) {
    const world = cpu(); world.angle = angle; world.updateCamera(world.env);
    world.hitBox('room', [-3.2, .32, 0], [3.14, 2.05, 2.8], { room, surface: true });
    const expected = G.roomSpace.foot(145, depth), p = [-3.35, .39, G.world3dMath.depthZ(depth)], screen = world.project(p), hit = world.pick(screen.x, screen.y, 'floor');
    assert.equal(hit.kind, 'room'); assert.equal(hit.room.id, first); near(hit.world.x, room.x + expected.x, .002); near(hit.world.y, room.y + expected.y, .002);
  }
});

test('落地家具拖动保留非中央抓点u/v，反算后位置和depth不跳变', () => {
  const { G, cpu, rooms, first } = setup(), room = rooms().find(r => r.id === first), def = G.data.furnitureById.bed_basic;
  for (const angle of [-.61, .61]) for (const depth of [.2, .7]) for (const grab of [{ u: .12, v: .2 }, { u: .83, v: .65 }]) {
    const world = cpu({ offsetX: 28, offsetY: 82 }); world.angle = angle; world.updateCamera(world.env);
    world.hitBox('room', [-3.2, .32, 0], [3.14, 2.05, 2.8], { room, surface: true });
    const canonicalX = 88 + def.w * grab.u, above = def.h * (1 - grab.v);
    const pointer3d = [-3.2 + (canonicalX - 160) / 100, G.world3dMath.floorY(0) + .15 + above / 100, G.world3dMath.depthZ(depth)];
    const screen = world.project(pointer3d), pointer = world.screenToWorld(screen.x, screen.y, { place: 'floor', def, grab });
    assert.equal(pointer.target.room.id, first);
    const pos = G.roomSpace.placement(def, { x: pointer.x - room.x, y: pointer.y - room.y }, grab);
    near(pos.x, 88, .002); near(pos.y, G.data.balance.floorLine - def.h, .002); near(pos.depth, depth, .00002);
  }
});

test('墙上落点投影反解使用后墙平面，不误落到地板或房间前沿', () => {
  const { cpu, rooms, first } = setup(), room = rooms().find(r => r.id === first);
  for (const angle of [-.55, .55]) for (const local of [[90, 36], [210, 85]]) {
    const world = cpu(); world.angle = angle; world.updateCamera(world.env);
    world.hitBox('room', [-3.2, .32, 0], [3.14, 2.05, 2.8], { room, surface: true });
    const screen = world.worldToScreen(room.x + local[0], room.y + local[1]), hit = world.pick(screen.x, screen.y, 'wall');
    assert.ok(hit && hit.room, '墙面必须命中真实房间'); assert.equal(hit.room.id, first);
    near(hit.world.x, room.x + local[0], .02); near(hit.world.y, room.y + local[1], .02);
  }
});

test('真实床头柜台面拾取把台灯落点交给roomSpace和规则preview并保留parent UID', () => {
  const { G, cpu, rooms, first } = setup();
  const placed = G.sys.decorating.place('nightstand_basic', first, 140, 155, null, .55); assert.ok(placed.ok);
  const room = rooms().find(r => r.id === first), parent = room.data.items.find(item => item.uid === placed.uid);
  const parentDef = G.data.furnitureById[parent.defId], lampDef = G.data.furnitureById.desk_lamp_basic, grab = { u: .5, v: 1 };
  const stateBefore = JSON.stringify(G.state);
  for (const angle of [-.65, .65]) {
    const world = cpu({ offsetX: 18, offsetY: 80 }); world.angle = angle; world.updateCamera(world.env);
    const geometry = new G.world3dMath.Geometry(), model = world.furniture(geometry, room, parent, parentDef), parentHit = world.hits.find(hit => hit.uid === parent.uid);
    assert.ok(parentHit); assert.equal(parentHit.roomId, first);
    // 床头柜的可见面板位于其真实模型高度的99%；使用面板中心避开边缘容差。
    const plane = [model.p[0], model.p[1] + model.size[1] * .99, model.p[2]], screen = world.project(plane);
    const hit = world.pick(screen.x, screen.y, { place: 'table', def: lampDef, grab });
    assert.equal(hit.kind, 'room'); assert.equal(hit.room.id, first);
    const local = { x: hit.world.x - room.x, y: hit.world.y - room.y }, raw = G.roomSpace.tablePlacement(room.data, parent, lampDef, local, grab);
    const preview = G.sys.decorating.preview(lampDef.id, first, raw.x, raw.y, parent.uid);
    assert.equal(preview.parent, parent.uid); near(preview.x, parent.x + (parentDef.w - lampDef.w) / 2, .002);
    near(preview.y, parent.y + parentDef.surface.y - lampDef.h, .002);
    const projectedParent = G.roomSpace.item(room.data, parent);
    near(local.y, projectedParent.y + parentDef.surface.y * projectedParent.scale, .002);
  }
  assert.equal(JSON.stringify(G.state), stateBefore, '拾取和摆放预览不能写入存档');
});

test('真实已建房间、空格与家具UID在旋转后的命中保持身份', () => {
  const { cpu, rooms, first, uid } = setup(), built = rooms().find(r => r.id === first), empty = rooms().find(r => !r.id && r.floorIdx === 0 && r.slotIdx === 1);
  for (const angle of [-.78, .78]) {
    const world = cpu(); world.angle = angle; world.updateCamera(world.env);
    world.hitBox('room', [-3.2, .32, 0], [3.14, 2.05, 2.8], { room: built, surface: true });
    world.hitBox('empty', [0, .32, 0], [3.1, 1.8, 2.7], { room: empty, world: { x: empty.x + 160, y: empty.y + 170 } });
    world.hitBox('item', [-3.2, .4, .65], [.8, .7, .6], { room: built, roomId: first, uid, legacy: { x: built.x + 120, y: built.y + 130, w: 80, h: 70 } });
    const itemScreen = world.project([-3.2, .75, .65]), item = world.pick(itemScreen.x, itemScreen.y);
    assert.equal(item.kind, 'item'); assert.equal(item.roomId, first); assert.equal(item.uid, uid);
    const emptyScreen = world.project([0, .9, 0]), slot = world.pick(emptyScreen.x, emptyScreen.y);
    assert.equal(slot.kind, 'empty'); assert.equal(slot.room.slotIdx, 1); assert.equal(slot.room.floorIdx, 0);
  }
});

test('楼层聚焦排除其它层，roomOnly仅保留指定真实房间', () => {
  const { cpu, rooms, first, upper } = setup(), list = rooms();
  const world = cpu({ view: { floor: 2, view: 'cutaway', previewFourFloors: false } });
  assert.equal(world.roomAllowed(list.find(r => r.id === first)), false); assert.equal(world.roomAllowed(list.find(r => r.id === upper)), true);
  world.env = Object.assign({}, world.env, { roomOnly: upper, view: { floor: 'all', view: 'cutaway', previewFourFloors: false } });
  assert.equal(world.roomAllowed(list.find(r => r.id === first)), false); assert.equal(world.roomAllowed(list.find(r => r.id === upper)), true);
});

test('正式花园九格与采收锚点经同一镜头投影，旋转不改变地块index', () => {
  const { cpu, G } = setup(), garden = G.render.layout.garden(); assert.equal(garden.plots.length, 9);
  for (const angle of [-.8, .65]) {
    const world = cpu({ camera: { x: garden.center.x, y: garden.center.y, scale: .7 } }); world.angle = angle; world.updateCamera(world.env);
    for (const plot of garden.plots) {
      const p = [plot.cropX / 100, .15, 1.45 + (plot.y + plot.h / 2) / 75];
      world.hitBox('plot', p, [plot.w / 100, .1, plot.h / 75], { index: plot.index, world: { x: plot.cropX, y: plot.y + plot.h / 2 } });
    }
    for (const plot of garden.plots) {
      const screen = world.worldToScreen(plot.particleX, plot.particleY), hit = world.pick(screen.x, screen.y);
      assert.ok(screen.x >= 0 && screen.x < world.env.width && screen.y >= 0 && screen.y < world.env.height, '花园聚焦使全部采收锚点在viewport内');
      assert.equal(hit.kind, 'plot'); assert.equal(hit.index, plot.index); near(hit.world.x, plot.cropX);
      const ray = world.ray(screen.x, screen.y), t = (.13 - ray.origin[1]) / ray.direction[1], expectedZ = 1.45 + plot.particleY / 75;
      near(ray.origin[0] + ray.direction[0] * t, plot.particleX / 100, .00003); near(ray.origin[2] + ray.direction[2] * t, expectedZ, .00003);
    }
  }
});

test('真实同墙面重叠挂画调层改变网格颜色顺序和命中，数组与UID不重排且bias只平移网格', () => {
  const { G, environment, first } = setup();
  G.store.update(state => { state.inventory.frame_basic = 2; });
  const a = G.sys.decorating.place('frame_basic', first, 110, 40, null), b = G.sys.decorating.place('frame_basic', first, 110, 40, null); assert.ok(a.ok && b.ok);
  assert.ok(G.sys.decorating.recolor(first, a.uid, '#FF1122').ok); assert.ok(G.sys.decorating.recolor(first, b.uid, '#11AAFF').ok);
  const originalOrder = G.state.house.rooms[first].items.map(item => item.uid), positions = G.state.house.rooms[first].items.map(item => [item.uid, item.x, item.y, item.parent]);
  const world = new G.World3D(), context = { drawImage() {} }; world.angle = 0;
  function snapshot(expectedTop) {
    const stateBefore = JSON.stringify(G.state); world.render(context, environment({ roomOnly: first }), { photo: true }); assert.equal(JSON.stringify(G.state), stateBefore);
    const hits = [a.uid, b.uid].map(uid => world.hits.find(hit => hit.uid === uid));
    for (const hit of hits) {
      assert.ok(Number.isInteger(hit.vertexStart) && hit.vertexStart >= 0); assert.ok(Number.isInteger(hit.vertexCount) && hit.vertexCount > 0);
      assert.ok(hit.layerGroup, '同支撑平面的实际重叠组须有身份'); assert.ok(Number.isFinite(hit.layerBias) && hit.layerBias >= 0 && hit.layerBias <= .0005);
      const wanted = hit.uid === a.uid ? [1, 17 / 255, 34 / 255] : [17 / 255, 170 / 255, 1];
      vector(Array.from(world.vertices.slice(hit.vertexStart * 9 + 6, hit.vertexStart * 9 + 9)), wanted, 1e-6);
    }
    assert.equal(hits[0].layerGroup, hits[1].layerGroup);
    const top = hits.find(hit => hit.uid === expectedTop), bottom = hits.find(hit => hit.uid !== expectedTop);
    assert.ok(top.item.z > bottom.item.z); assert.ok(top.vertexStart > bottom.vertexStart, '实际顶点上传顺序必须随z调整'); assert.ok(top.layerBias > bottom.layerBias);
    const screen = world.project([top.p[0], top.p[1] + top.size[1] / 2, top.p[2]]), picked = world.pick(screen.x, screen.y);
    assert.equal(picked.kind, 'item'); assert.equal(picked.uid, expectedTop);
    return hits.map(hit => ({ uid: hit.uid, p: Array.from(hit.p), min: Array.from(hit.min), max: Array.from(hit.max), vertexCount: hit.vertexCount, vertices: Array.from(world.vertices.slice(hit.vertexStart * 9, (hit.vertexStart + hit.vertexCount) * 9)) }));
  }
  const before = snapshot(b.uid), layer = G.sys.decorating.layer(first, a.uid, 1); assert.ok(layer.ok);
  assert.deepEqual(G.state.house.rooms[first].items.map(item => item.uid), originalOrder);
  assert.deepEqual(G.state.house.rooms[first].items.map(item => [item.uid, item.x, item.y, item.parent]), positions);
  const after = snapshot(a.uid);
  for (const old of before) {
    const next = after.find(value => value.uid === old.uid), delta = next.p.map((value, i) => value - old.p[i]); assert.equal(next.vertexCount, old.vertexCount);
    assert.ok(Math.hypot(...delta) > 0 && Math.hypot(...delta) <= .0005 + 1e-8);
    for (let axis = 0; axis < 3; axis++) { near(next.min[axis] - old.min[axis], delta[axis], 1e-7); near(next.max[axis] - old.max[axis], delta[axis], 1e-7); }
    for (let i = 0; i < old.vertices.length; i += 9) {
      for (let axis = 0; axis < 3; axis++) near(next.vertices[i + axis] - old.vertices[i + axis], delta[axis], 4e-7);
      for (let value = 3; value < 9; value++) near(next.vertices[i + value], old.vertices[i + value], 1e-7);
    }
  }
  world.destroy();
});

test('不同物理深度的家具即使后方z最高，真实前方不相交家具仍优先命中', () => {
  const { G, environment, first } = setup(); G.store.update(state => { state.inventory.wardrobe_basic = 2; });
  const back = G.sys.decorating.place('wardrobe_basic', first, 120, 80, null, .05), front = G.sys.decorating.place('wardrobe_basic', first, 120, 80, null, .95); assert.ok(back.ok && front.ok);
  assert.ok(G.sys.decorating.layer(first, back.uid, 1).ok);
  const world = new G.World3D(); world.angle = 0; world.render({ drawImage() {} }, environment({ roomOnly: first }), { photo: true });
  const rear = world.hits.find(hit => hit.uid === back.uid), nearItem = world.hits.find(hit => hit.uid === front.uid);
  assert.ok(rear.item.z > nearItem.item.z); assert.ok(rear.max[2] < nearItem.min[2], '两个真实家具体积不能相交');
  assert.ok(!rear.layerGroup || rear.layerGroup !== nearItem.layerGroup, '不同支撑深度不能被归成薄贴面重叠组');
  const screen = world.project([nearItem.p[0], nearItem.p[1] + nearItem.size[1] * .8, nearItem.p[2]]), ray = world.ray(screen.x, screen.y);
  const backIntersection = G.world3dMath.rayBox(ray, rear), frontIntersection = G.world3dMath.rayBox(ray, nearItem);
  assert.ok(backIntersection && frontIntersection, '验证同一射线穿过两个对象，避免后方压根未命中的空断言');
  assert.ok(frontIntersection.distance < backIntersection.distance); assert.equal(world.pick(screen.x, screen.y).uid, front.uid); world.destroy();
});

test('软陶几何的圆角盒/球/圆柱/屋顶均产出有限顶点和单位法线', () => {
  const { G } = setup(), g = new G.world3dMath.Geometry();
  g.box([1, 2, 3], [2, 1, .7], '#CE7588', .1, [.2, -.4, .3]);
  g.sphere([-1, .6, .2], [.6, .4, .9], '#FFF2D9', 10, 8);
  g.cylinder([0, 1, 0], .5, 1, '#B1CC91', .3, 14, [.3, 0, -.2]);
  g.roof([0, 2, 0], 3, 2, 1, '#C86482');
  assert.ok(g.data.length > 1000); assert.equal(g.data.length % 27, 0);
  for (let i = 0; i < g.data.length; i += 9) {
    for (let j = 0; j < 9; j++) assert.ok(Number.isFinite(g.data[i + j]));
    near(Math.hypot(g.data[i + 3], g.data[i + 4], g.data[i + 5]), 1, 1e-5);
    for (let j = 6; j < 9; j++) assert.ok(g.data[i + j] >= 0 && g.data[i + j] <= 1);
  }
});

test('真实state生成房间/家具命中，镜头变化只重绘；移动后仅重建一次且不写存档', () => {
  const { G, environment, first, upper, uid } = setup(), world = new G.World3D(), gpu = world.canvas.gpu;
  assert.equal(world.ready, true); const before = JSON.stringify(G.state), env = environment();
  const context = { drawImage(canvas, x, y, width, height) { assert.equal(canvas, world.canvas); assert.ok(width > 0 && height > 0); } };
  assert.equal(world.render(context, env, { photo: true }), true);
  assert.equal(JSON.stringify(G.state), before); assert.equal(world.builds, 1); assert.ok(gpu.record.draws.length > 0);
  assert.ok(world.hits.some(hit => hit.uid === uid && hit.roomId === first)); assert.ok(world.hits.some(hit => hit.kind === 'empty'));
  const uploadCount = gpu.record.uploads.length; world.rotate(30, 10); world.render(context, env, { photo: true });
  assert.equal(world.builds, 1); assert.equal(gpu.record.uploads.length, uploadCount);
  assert.equal(world.canvas.width, 1920); assert.equal(world.canvas.height, 1080, 'DPR应限制到1.5');
  const move = G.sys.decorating.move(first, uid, upper, 40, 130, null, .25); assert.ok(move.ok);
  const afterMove = JSON.stringify(G.state); world.render(context, environment(), { photo: true });
  assert.equal(world.builds, 2); assert.ok(world.hits.some(hit => hit.uid === uid && hit.roomId === upper));
  world.render(context, environment(), { photo: true }); assert.equal(world.builds, 2); assert.equal(JSON.stringify(G.state), afterMove);
  world.destroy();
});

test('摄影与主场景的omitUid:null保留全部真实家具；指定UID只隐藏自身及实际承托子件并能恢复', () => {
  const { G, environment, first, uid: bedUid } = setup();
  const parentResult = G.sys.decorating.place('nightstand_basic', first, 140, 155, null, .55); assert.ok(parentResult.ok);
  const parent = G.state.house.rooms[first].items.find(item => item.uid === parentResult.uid), parentDef = G.data.furnitureById[parent.defId], lampDef = G.data.furnitureById.desk_lamp_basic;
  const childResult = G.sys.decorating.place(lampDef.id, first, parent.x + (parentDef.w - lampDef.w) / 2, parent.y + parentDef.surface.y - lampDef.h, parent.uid); assert.ok(childResult.ok);
  assert.equal(G.state.house.rooms[first].items.find(item => item.uid === childResult.uid).parent, parent.uid, '必须由真实规则产生承托关系');
  const parentUid = parent.uid, childUid = childResult.uid, all = [bedUid, parentUid, childUid].sort(), stateBefore = JSON.stringify(G.state);
  const world = new G.World3D(), context = { drawImage() {} };
  function check(omitUid, expected) {
    assert.equal(world.render(context, environment({ omitUid, roomOnly: first }), { photo: true }), true);
    const rendered = world.hits.filter(hit => hit.kind === 'item' && hit.roomId === first);
    assert.deepEqual(Array.from(rendered, hit => hit.uid).sort(), expected.slice().sort());
    for (const hit of rendered) {
      assert.ok(hit.vertexCount > 0, '可见家具必须实际建立网格，不能只伪造命中记录');
      assert.ok((hit.vertexStart + hit.vertexCount) * 9 <= world.vertices.length);
    }
    assert.equal(JSON.stringify(G.state), stateBefore, '隐藏预览和摄影不得修改真实家具、UID或承托关系');
  }
  check(undefined, all);
  check(null, all);
  check(parentUid, [bedUid]);
  check(childUid, [bedUid, parentUid]);
  check('missing_test_furniture_uid', all);
  check(null, all);
  world.destroy();
});

test('同屋peer跨隐藏房间和前院改变zone会更新actor集合，同区域走动只更新位置', () => {
  const { G, environment, first, upper } = setup(), world = new G.World3D(), context = { drawImage() {} }, before = JSON.stringify(G.state);
  const peer = { id: 'peer_zone_regression', displayName: '同屋小朋友', avatar: G.state.avatar, zone: first, x: .5, y: .5 };
  function render(zone, x = .5) {
    const value = Object.assign({}, peer, { zone, x });
    world.render(context, environment({ peers: [value], view: { floor: 2, view: 'cutaway', previewFourFloors: false } }), { photo: true });
    assert.equal(JSON.stringify(G.state), before); return world.actors.find(actor => actor.kind === 'peer' && actor.id === peer.id);
  }
  assert.equal(render(first), undefined, '隐藏层不应建立可见actor'); const builds = world.builds;
  assert.ok(render('yard'), '同peer从隐藏层进入前院必须重新出现'); assert.equal(world.builds, builds + 1);
  const yardBuilds = world.builds, uploads = world.canvas.gpu.record.uploads.length, initial = Array.from(world.actors.find(actor => actor.id === peer.id).current);
  const moved = render('yard', .9); assert.ok(moved); assert.equal(world.builds, yardBuilds); assert.equal(world.canvas.gpu.record.uploads.length, uploads);
  assert.notDeepEqual(Array.from(moved.current), initial, '实际同区移动须更新投影位置');
  assert.ok(render(upper), '进入可见楼层房间应保留actor');
  assert.equal(render(first), undefined, '回到隐藏楼层须移除先前可见actor');
  world.destroy();
});

test('聚焦/屋外环境改变后重建命中，不遗留隐藏层家具与人物', () => {
  const { G, environment, first, upper, uid } = setup(), world = new G.World3D();
  G.state.residents.lily = { movedIn: true, roomId: first, heartBubbles: 0 };
  const context = { drawImage() {} };
  world.render(context, environment({ view: { floor: 2, view: 'cutaway', previewFourFloors: false } }), { photo: true });
  assert.ok(!world.hits.some(hit => hit.uid === uid || hit.room?.id === first)); assert.ok(!world.actors.some(actor => actor.id === 'lily'));
  assert.ok(world.hits.some(hit => hit.room?.id === upper));
  world.render(context, environment({ view: { floor: 'all', view: 'exterior', previewFourFloors: false } }), { photo: true });
  assert.ok(!world.hits.some(hit => hit.kind === 'item')); assert.ok(!world.actors.some(actor => actor.id === 'lily')); world.destroy();
});

test('WebGL丢失停止绘制，恢复重新上传；destroy释放监听和每个GPU资源且可重复调用', () => {
  let changes = 0; const { G, environment } = setup(), world = new G.World3D(() => { changes++; }), canvas = world.canvas, gpu = canvas.gpu, context = { drawImage() {} };
  world.render(context, environment(), { photo: true }); const uploads = gpu.record.uploads.length; let prevented = false;
  canvas.listeners.get('webglcontextlost')({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(world.ready, false); assert.equal(world.render(context, environment(), { photo: true }), false);
  canvas.listeners.get('webglcontextrestored')(); assert.equal(world.ready, true); assert.ok(changes >= 2);
  world.render(context, environment(), { photo: true }); assert.ok(gpu.record.uploads.length > uploads);
  world.destroy(); const deletions = gpu.record.deleted.length;
  assert.equal(canvas.listeners.size, 0); for (const set of Object.values(gpu.resources)) assert.equal(set.size, 0);
  assert.equal(gpu.record.lost, 1); assert.equal(canvas.width, 1); assert.equal(canvas.height, 1); assert.equal(world.render(context, environment(), { photo: true }), false);
  world.destroy(); assert.equal(gpu.record.deleted.length, deletions); assert.equal(gpu.record.lost, 1);
});

for (const entry of tests) { entry.fn(); console.log('✓ ' + entry.name); }
console.log('\n' + tests.length + ' 组真实3D状态/投影/拾取/GL资源契约检查通过（CPU与GL状态替身，不代替正式根页视觉验收）。');
