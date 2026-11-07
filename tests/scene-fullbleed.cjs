'use strict';
// 3D 场景铺满：画布与天空同尺寸，安全区只决定默认取景（偏心正交投影），放大/拖拽后不被中间矩形裁切。
// 使用内存Game、真实WebGL引擎和有状态GL替身（tests/fixtures/scene-harness.cjs）；不证明实际像素，不代替浏览器目视。
const assert = require('node:assert/strict');
const { setup, near, vector, finite, DESKTOP } = require('./fixtures/scene-harness.cjs');
const tests = []; const test = (name, fn) => tests.push({ name, fn });
const center = v => ({ x: v.x + v.width / 2, y: v.y + v.height / 2 });
// 屏幕点对应的相机平面世界点（以相机目标为原点，目标映射在安全区中心）。
function planePoint(world, screen) {
  const env = world.env, c = world.viewCenterScreen(env), unit = world.range / env.height;
  return world.target.map((value, i) => value + (world.right[i] * (screen.x - c.x) + world.up[i] * (c.y - screen.y)) * unit);
}

test('画布与天空同尺寸铺满：env为整幅、offset为0、safe为安全区，WebGL合成到(0,0,整幅)', () => {
  const env = setup();
  try {
    const e = env.world.env;
    assert.equal(e.width, 900); assert.equal(e.height, 700); assert.equal(e.offsetX, 0); assert.equal(e.offsetY, 0);
    assert.equal(JSON.stringify(e.safe), JSON.stringify({ x: DESKTOP.x, y: DESKTOP.y, width: DESKTOP.width, height: DESKTOP.height }));
    const ratio = Math.min(1.5, e.dpr || 1);
    assert.equal(env.world.canvas.width, Math.round(900 * ratio)); assert.equal(env.world.canvas.height, Math.round(700 * ratio));
    const last = env.main.context.record.composites.at(-1);
    assert.equal(last[0], env.world.canvas); assert.deepEqual(last.slice(1), [0, 0, 900, 700], 'drawImage不能再按安全区偏移/尺寸贴一块');
  } finally { env.destroy(); }
});

test('默认取景：相机目标落在安全区中心，完整3D点都在安全区内，camera.scale与改前口径一致', () => {
  const env = setup();
  try {
    const c = env.G.render.camera, w = env.world; c.resetView(); env.redraw();
    const at = w.project(w.target), mid = center(DESKTOP);
    near(at.x, mid.x, 1e-3); near(at.y, mid.y, 1e-3);
    near(w.rangeScale(w.env), 700 / DESKTOP.height, 1e-9);
    // range是整幅画布高度对应的世界单位；按安全区高度折算后 scale*100*range = 安全区高度。
    near(w.viewFrame().range * c.scale * 100, DESKTOP.height, 1e-3); near(w.range * c.scale * 100, 700, 1e-3);
    for (const p of w.cameraSpec(w.env).points) { const s = w.project(p); assert.ok(s.x >= DESKTOP.x - .01 && s.x <= DESKTOP.x + DESKTOP.width + .01 && s.y >= DESKTOP.y - .01 && s.y <= DESKTOP.y + DESKTOP.height + .01, '默认取景仍整体落在安全区内'); }
  } finally { env.destroy(); }
});

test('偏心投影下ray与project互逆，含安全区外的边距点；多种朝向/俯仰', () => {
  const env = setup();
  try {
    const w = env.world, c = env.G.render.camera, plane = env.G.world3dMath.rayPlane;
    for (const [angle, elevation] of [[.43, .49], [-1.2, .3], [2.4, .9]]) {
      c.resetView(); env.redraw(); c.rotate((w.angle - angle) / .007, (elevation - w.elevation) / .004); env.redraw();
      for (const [x, y] of [[10, 10], [380, 315], [890, 690], [60, 600], [700, 40]]) {
        const hit = plane(w.ray(x, y), 1, .14); assert.ok(hit, '射线应与地面相交');
        const back = w.project(hit.p); near(back.x, x, 1e-3); near(back.y, y, 1e-3);
      }
    }
  } finally { env.destroy(); }
});

test('缩放：默认锚点是安全区中心；指针在安全区外边距时该点保持不动', () => {
  const env = setup();
  try {
    const w = env.world, c = env.G.render.camera; c.resetView(); env.redraw();
    const mid = center(DESKTOP), targetBefore = Array.from(w.target), scale = c.scale;
    c.zoom(1.25); env.redraw(); assert.ok(c.scale > scale);
    vector(Array.from(w.target), targetBefore, 1e-9); const at = w.project(w.target); near(at.x, mid.x, 1e-3); near(at.y, mid.y, 1e-3);
    const margin = { x: 40, y: 60 }, anchor = planePoint(w, margin), oldScale = c.scale;
    c.zoom(1.1, margin); env.redraw(); assert.ok(c.scale > oldScale);
    const back = w.project(anchor); near(back.x, margin.x, .003); near(back.y, margin.y, .003);
  } finally { env.destroy(); }
});

test('拖拽不再被安全区硬裁：焦点可进入左右边距，但仍留在整幅画布内', () => {
  const env = setup();
  try {
    const w = env.world, c = env.G.render.camera; c.resetView(); env.redraw();
    // 取景内容（岛/房/花园的3D点）的屏幕范围：拖到底时内容应进入原安全区外的边距，而不是被安全区硬边裁住。
    const extent = () => { const s = w.cameraSpec(w.env).points.map(p => w.project(p)); return { left: Math.min(...s.map(p => p.x)), right: Math.max(...s.map(p => p.x)), bottom: Math.max(...s.map(p => p.y)) }; };
    assert.ok(extent().left >= DESKTOP.x - .01, '默认取景从安全区内开始');
    // 每个方向从复位出发只拖一次（panScreen单次最多2倍画布宽高，足以拖到限位）。
    c.pan(-1e8, 0); env.redraw();
    const left = extent(); assert.ok(left.left < DESKTOP.x && left.left >= -65, '向左拖到底，内容左缘进入左边距（仍留在画布边缘附近）：' + left.left);
    c.resetView(); env.redraw(); c.pan(1e8, 0); env.redraw();
    const right = extent(); assert.ok(right.right > DESKTOP.x + DESKTOP.width && right.right <= 900 + 65, '向右拖到底，内容右缘进入右边距：' + right.right);
    c.resetView(); env.redraw(); c.pan(0, 1e8); env.redraw();
    assert.ok(extent().bottom > DESKTOP.y + DESKTOP.height, '向下拖，内容下缘进入底边距');
    finite([...w.target, ...Array.from(w.matrix)]);
  } finally { env.destroy(); }
});

test('safeRect：无env.safe（visit.js自建）、拍照、非法safe一律整幅，行为不变', () => {
  const env = setup();
  try {
    const w = env.world, full = { x: 0, y: 0, width: 900, height: 700 };
    const plain = value => JSON.parse(JSON.stringify(value));
    assert.deepEqual(plain(w.safeRect({ width: 900, height: 700 })), full);
    assert.deepEqual(plain(w.safeRect({ width: 900, height: 700, safe: DESKTOP, capturingPhoto: true })), full);
    assert.deepEqual(plain(w.safeRect({ width: 900, height: 700, safe: { x: 0, y: 0, width: 0, height: 5 } })), full);
    const bare = { width: 900, height: 700, offsetX: 3, offsetY: 4 };
    assert.equal(w.rangeScale(bare), 1); assert.deepEqual(plain(w.viewCenter(bare)), { x: 450, y: 350 }); assert.deepEqual(plain(w.viewCenterScreen(bare)), { x: 453, y: 354 });
    // 安全区越界时钳到画布内
    const clamped = plain(w.safeRect({ width: 900, height: 700, safe: { x: 800, y: 600, width: 500, height: 500 } })); assert.deepEqual(clamped, { x: 800, y: 600, width: 100, height: 100 });
  } finally { env.destroy(); }
});

test('拍照用整幅画布取景，不带safe；拍照前后主画布环境与相机不变', () => {
  const env = setup();
  try {
    const c = env.G.render.camera; c.focusRoom(env.first); env.redraw();
    const before = env.snapshot(), safe = JSON.stringify(env.world.env.safe), start = env.renders.length;
    env.G.render.captureScene({ scope: 'house', width: 640, height: 480 }); env.G.render.captureScene({ scope: 'view', width: 640, height: 480 });
    const photos = env.renders.slice(start).filter(entry => entry.photo); assert.equal(photos.length, 2);
    for (const photo of photos) { assert.equal(photo.capturingPhoto, true); assert.equal(photo.safe, null); assert.equal(photo.width, 640); assert.equal(photo.height, 480); assert.equal(photo.offsetX, 0); assert.equal(photo.offsetY, 0); }
    assert.equal(env.world.env.width, 900); assert.equal(JSON.stringify(env.world.env.safe), safe);
    assert.deepEqual(env.camera(), before.camera); assert.equal(JSON.stringify(env.G.state), before.state);
  } finally { env.destroy(); }
});

test('安全区等于整幅（手机/接管）时与原行为一致；侧栏开合通过panel:change重新取景到新安全区中心', () => {
  const env = setup({ viewport: { x: 0, y: 0, width: 900, height: 700, layout: 'none' } });
  try {
    const w = env.world, c = env.G.render.camera; c.resetView(); env.redraw();
    assert.equal(w.rangeScale(w.env), 1); const at = w.project(w.target); near(at.x, 450, 1e-3); near(at.y, 350, 1e-3); near(c.scale * w.range * 100, 700, 1e-3);
    env.setViewport({ x: 100, y: 80, width: 500, height: 400, layout: 'side' }); env.G.bus.emit('panel:change', { open: true, layout: 'side', height: 0 }); env.redraw();
    const moved = w.project(w.target); near(moved.x, 350, 1e-3); near(moved.y, 280, 1e-3); near(w.viewFrame().range * c.scale * 100, 400, 1e-3);
    env.setViewport({ x: 0, y: 0, width: 900, height: 700, layout: 'none' }); env.G.bus.emit('panel:change', { open: false, layout: 'none', height: 0 }); env.redraw();
    const back = w.project(w.target); near(back.x, 450, 1e-3); near(back.y, 350, 1e-3);
  } finally { env.destroy(); }
});

for (const entry of tests) { entry.fn(); console.log('✓ ' + entry.name); }
console.log('\n' + tests.length + ' 组3D场景铺满/偏心取景/拖拽缩放/摄影隔离检查通过（GL状态替身，不代替浏览器目视）。');
