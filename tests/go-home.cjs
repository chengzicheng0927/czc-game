'use strict';
// 点底部“我的小屋”还原初始页面：scene.js 的 camera.goHome()（家园相机 / 花园页 / 舞台页）。
// 公共外壳那一半（串门离开、关面板、home-paper 只收不切换、玩家回站位）见 tests/visual-shell-viewport.cjs。
// 使用内存Game、真实WebGL引擎和有状态GL替身；不证明实际像素，不代替浏览器目视。
const assert = require('node:assert/strict');
const { setup, near, vector, DESKTOP } = require('./fixtures/scene-harness.cjs');
const tests = []; const test = (name, fn) => tests.push({ name, fn });
const center = v => ({ x: v.x + v.width / 2, y: v.y + v.height / 2 });
const plain = value => JSON.parse(JSON.stringify(value));
function stagePage(G) {
  G.pageStages3D = { describe(env) {
    if (!['avatar', 'residents'].includes(env.surface)) return null;
    return { id: env.surface, key: env.surface, readonlyStage: true, bounds: { min: [-2, 0, -1.5], max: [2, 3.4, 1.5] }, focus: [0, 1.6, 0], build(g) { g.box([0, .12, 0], [3.8, .24, 2.8], '#D57996', .08); } };
  } };
}

test('家园相机：转动/俯仰/平移/缩放/楼层/摆放/选中全部还原，目标回安全区中心，不写存档', () => {
  const env = setup();
  try {
    const G = env.G, c = G.render.camera, w = env.world; c.resetView(); env.redraw();
    const home = { scale: c.scale, x: c.x, y: c.y, range: w.range };
    G.render.setHouseView({ floor: 1 }); env.redraw(); c.setInteractionMode('orbit'); c.rotate(120, 60); c.pan(40, -30); c.zoom(1.6); env.redraw();
    G.runtime.placing = 'frame_basic'; G.runtime.selected = { uid: env.uid, roomId: env.first }; G.runtime.mode = 'decorate';
    assert.notEqual(w.angle, .43); assert.ok(Math.hypot(...w.panVector) > 0); assert.equal(c.focusKind, 'floor');
    const before = env.snapshot();
    c.goHome(); env.redraw();
    near(w.angle, .43, 1e-12); near(w.elevation, .49, 1e-12); vector(Array.from(w.panVector), [0, 0, 0], 1e-12);
    assert.equal(c.focusKind, 'overview'); assert.equal(c.getInteractionMode(), 'pan');
    assert.deepEqual(plain(G.render.getHouseView()), { floor: 'all', view: 'cutaway', previewFourFloors: false });
    assert.equal(G.runtime.placing, null); assert.equal(G.runtime.selected, null); assert.equal(G.runtime.mode, 'explore');
    near(c.scale, home.scale, 1e-9); near(c.x, home.x, 1e-9); near(c.y, home.y, 1e-9); near(w.range, home.range, 1e-9);
    const at = w.project(w.target), mid = center(DESKTOP); near(at.x, mid.x, 1e-3); near(at.y, mid.y, 1e-3);
    assert.equal(JSON.stringify(G.state), before.state, '回到初始页面不写存档'); assert.equal(before.state, JSON.stringify(G.state));
    c.goHome(); env.redraw(); near(c.scale, home.scale, 1e-9); // 幂等
  } finally { env.destroy(); }
});

test('舞台页（avatar/residents）：退出舞台镜头，家园相机回到默认而不是舞台前的拖拽状态', () => {
  const env = setup();
  try {
    const G = env.G, c = G.render.camera, w = env.world; stagePage(G); c.resetView(); env.redraw();
    const home = { scale: c.scale, range: w.range };
    c.rotate(80, 20); c.pan(25, 10); c.zoom(1.4); env.redraw();
    G.runtime.shellLayout.panelKind = 'avatar'; env.redraw(); assert.equal(env.main.dataset.scene, 'page-stage');
    G.runtime.shellLayout.panelKind = null; // 外壳先发布 panelKind=null，再调用 goHome
    c.goHome(); env.redraw();
    assert.equal(env.main.dataset.scene, 'home'); assert.equal(w.env.stage, null);
    near(w.angle, .43, 1e-12); near(w.elevation, .49, 1e-12); vector(Array.from(w.panVector), [0, 0, 0], 1e-12);
    near(c.scale, home.scale, 1e-9); near(w.range, home.range, 1e-9); assert.equal(c.focusKind, 'overview');
    const at = w.project(w.target), mid = center(DESKTOP); near(at.x, mid.x, 1e-3); near(at.y, mid.y, 1e-3);
  } finally { env.destroy(); }
});

test('花园页：退出花园镜头并恢复家园相机后再重置，回到默认全景', () => {
  const env = setup({ extraFiles: ['js/render/garden-page3d.js'] });
  try {
    const G = env.G, c = G.render.camera, w = env.world; c.resetView(); env.redraw();
    const home = { scale: c.scale, range: w.range };
    c.rotate(60, 10); c.pan(20, 5); c.zoom(1.3); env.redraw();
    G.runtime.mode = 'garden'; G.runtime.shellLayout.panelKind = 'garden'; env.redraw();
    assert.equal(env.main.dataset.scene, 'garden-page', '花园页3D已进入');
    G.runtime.shellLayout.panelKind = null; G.runtime.mode = 'explore';
    c.goHome(); env.redraw();
    assert.equal(env.main.dataset.scene, 'home'); assert.equal(w.env.gardenPage, null);
    near(w.angle, .43, 1e-12); near(w.elevation, .49, 1e-12); vector(Array.from(w.panVector), [0, 0, 0], 1e-12);
    near(c.scale, home.scale, 1e-9); near(w.range, home.range, 1e-9); assert.equal(c.focusKind, 'overview');
    const at = w.project(w.target), mid = center(DESKTOP); near(at.x, mid.x, 1e-3); near(at.y, mid.y, 1e-3);
  } finally { env.destroy(); }
});

for (const entry of tests) { entry.fn(); console.log('✓ ' + entry.name); }
console.log('\n' + tests.length + ' 组“我的小屋”相机还原检查通过（GL状态替身；外壳部分见visual-shell-viewport.cjs，不代替浏览器目视）。');
