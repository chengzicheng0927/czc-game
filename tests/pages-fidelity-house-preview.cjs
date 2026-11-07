'use strict';
// 合成楼层与只读快照：只验预览适配/降级/生命周期，不宣称实际WebGL像素通过。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../js/render/exterior.js'), 'utf8'), tests = [];
const test = (name, fn) => tests.push([name, fn]);
const plain = value => JSON.parse(JSON.stringify(value));
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function house(count = 3) {
  const floors = [{ slots: ['a', 'b', null] }, { slots: [null, 'c', null] }, { slots: ['d', null, 'e'] }, { slots: [null, null, 'f'] }].slice(0, count);
  return { name: '合成小屋', floors, rooms: Object.fromEntries(floors.flatMap(floor => floor.slots.filter(Boolean)).map(id => [id, { type: 'living', wallpaper: { color: '#F1D8D3' }, floor: { color: '#EED7B9' }, items: [] }])),
    attic: count > 1 ? { type: 'observatory', paidPrice: 1000, builtAt: 1 } : null, exterior: { roof: 'roof_triangle', roofColor: '#FF9FB5', wall: 'wall_wood', wallColor: '#FFE3C9', window: 'win_square', door: 'door_wood', chimney: 'normal' }, yard: { items: [{ uid: 'preview_yard_tree', defId: 'yard_tree', x: -480, y: 70, color: '#B6CE9E' }] } };
}
function target() {
  let depth = 0;
  const operations = [], context = new Proxy({}, { get: (object, key) => object[key] || ((...args) => {
    for (const arg of args) if (typeof arg === 'number') assert.ok(Number.isFinite(arg), key + '坐标必须有限');
    if (key === 'save') depth++; if (key === 'restore') { depth--; assert.ok(depth >= 0, 'Canvas状态不能多次恢复'); }
    operations.push({ key, args, font: object.font, fillStyle: object.fillStyle });
  }), set: (object, key, value) => { object[key] = value; return true; } });
  return { width: 0, height: 0, dataset: {}, operations, get depth() { return depth; }, getContext: kind => kind === '2d' ? context : null };
}
function setup(engine = 'ready') {
  const instances = [], state = freeze({ house: house() });
  const G = { state, store: { update() { throw Error('预览不能写档'); } } };
  Object.defineProperty(G, 'runtime', { get() { throw Error('预览不能使用主运行态'); } });
  G.render = {}; Object.defineProperty(G.render, 'camera', { get() { throw Error('预览不能使用主相机'); } });
  if (engine !== 'missing') G.World3D = class {
    constructor() { this.ready = engine !== 'unavailable'; this.reason = this.ready ? '' : 'webgl-unavailable'; this.calls = []; this.destroyed = 0; instances.push(this); }
    render(context, env, options) { this.calls.push({ env, options }); if (engine === 'throw') throw Error('合成WebGL失败'); context.drawImage({}, 0, 0, env.width, env.height); return true; }
    destroy() { this.destroyed++; this.ready = false; }
  };
  const context = vm.createContext({ window: { Game: G, devicePixelRatio: 1 }, document: { createElement: () => { throw Error('适配层不为每卡新建Canvas'); } }, console });
  vm.runInContext(source, context); return { G, api: G.draw.exterior, instances };
}
test('保留旧绘制API；七张卡复用一个离屏renderer，按实际楼层/房间且不动主相机与存档', () => {
  const e = setup(), before = JSON.stringify(e.G.state), chosen = freeze(Object.assign({}, e.G.state.house.exterior, { roofColor: '#C86482', wallColor: '#FFE6C9' }));
  for (const name of ['roof', 'wall', 'window', 'door', 'chimney', 'preview', 'disposePreview']) assert.equal(typeof e.api[name], 'function');
  const canvases = Array.from({ length: 7 }, target), results = canvases.map((canvas, i) => e.api.preview(canvas, chosen, '合成小屋', { width: i ? 220 : 560, height: i ? 160 : 400, dpr: i ? 1 : 3 }));
  assert.equal(e.instances.length, 1); assert.equal(e.instances[0].calls.length, 7);
  assert.equal(canvases[0].width, 840); assert.equal(canvases[0].height, 600); assert.equal(canvases[1].width, 220); assert.equal(canvases[1].height, 160);
  results.forEach(result => { assert.equal(result.ok, true); assert.equal(result.status, 'ready'); assert.equal(result.mode, 'webgl'); assert.equal(result.floors, 3); assert.equal(result.rooms, 5); assert.equal(result.attic, true); assert.equal(result.partsSupport, 'current-world3d-parts'); assert.ok(result.unsupportedParts.includes('roof')); });
  for (const { env, options } of e.instances[0].calls) {
    assert.deepEqual(plain(env.state.house.floors), plain(e.G.state.house.floors)); assert.deepEqual(plain(env.rooms.map(room => room.id)), plain(e.G.state.house.floors.flatMap(floor => floor.slots)));
    assert.deepEqual(plain(env.state.house.yard), plain(e.G.state.house.yard)); assert.notEqual(env.state.house.yard.items[0], e.G.state.house.yard.items[0], '前院家具为只读快照，不清空实际院景');
    assert.notEqual(env.state.house, e.G.state.house); assert.notEqual(env.state.house.rooms.a, e.G.state.house.rooms.a); assert.equal(env.state.house.exterior.roofColor, chosen.roofColor);
    assert.equal(env.view.floor, 'all'); assert.equal(env.view.view, 'exterior'); assert.equal(env.view.previewFourFloors, false); assert.equal(env.reducedMotion, true); assert.equal(env.hidePlayer, true); assert.equal(options.photo, true);
  }
  assert.equal(JSON.stringify(e.G.state), before);
});
test('无GL按实际一至四层/空位/阁楼画体积模型，坐标有限且不是固定单层', () => {
  const e = setup('missing'), canvases = [], results = [];
  for (const count of [1, 2, 3, 4]) { const canvas = target(), synthetic = freeze(house(count)), before = JSON.stringify(synthetic); canvases.push(canvas); results.push(e.api.preview(canvas, synthetic.exterior, synthetic.name, { house: synthetic, width: 560, height: 400 })); assert.equal(JSON.stringify(synthetic), before); }
  results.forEach((result, i) => { assert.equal(result.ok, true); assert.equal(result.status, 'fallback'); assert.equal(result.mode, 'canvas-isometric'); assert.equal(result.reason, 'world3d-module-unavailable'); assert.equal(result.floors, i + 1); assert.equal(result.attic, i > 0); assert.equal(result.partsSupport, 'canvas-exterior-parts'); });
  const paths = canvas => canvas.operations.filter(operation => operation.key === 'beginPath').length;
  assert.ok(paths(canvases[3]) > paths(canvases[0]), '实际多层与额外房间必须改变降级建筑图形');
  assert.equal(canvases[2].dataset.previewFloors, '3'); assert.equal(canvases[2].dataset.previewRooms, '5');
});
test('not-ready或context丢失只降级，恢复后复用原实例；显式dispose可重复并允许重开', () => {
  const e = setup('unavailable'), canvas = target();
  assert.equal(e.api.preview(canvas, null, '合成小屋').reason, 'webgl-unavailable'); assert.equal(e.instances.length, 1);
  const first = e.instances[0]; first.reason = 'context-lost'; assert.equal(e.api.preview(canvas, null, '合成小屋').reason, 'context-lost');
  first.ready = true; first.reason = ''; assert.equal(e.api.preview(canvas, null, '合成小屋').mode, 'webgl'); assert.equal(e.instances.length, 1);
  e.api.disposePreview(); e.api.disposePreview(); assert.equal(first.destroyed, 1); e.api.preview(canvas, null, '合成小屋'); assert.equal(e.instances.length, 2);
});
test('WebGL render异常不抛到UI、不每张卡重建context，dispose释放后可重新尝试', () => {
  const e = setup('throw'), before = JSON.stringify(e.G.state);
  for (let i = 0; i < 7; i++) { const result = e.api.preview(target(), null, '合成小屋'); assert.equal(result.ok, true); assert.equal(result.mode, 'canvas-isometric'); assert.equal(result.reason, 'webgl-render-failed'); }
  assert.equal(e.instances.length, 1); assert.equal(e.instances[0].destroyed, 1); assert.equal(JSON.stringify(e.G.state), before);
  e.api.disposePreview(); e.api.preview(target(), null, '合成小屋'); assert.equal(e.instances.length, 2);
});
test('旧三参/null options兼容；缺Canvas或无真实楼层明确不可用，不造单层房子', () => {
  const e = setup('missing'), canvas = target(); assert.equal(e.api.preview(canvas, null, '合成小屋').floors, 3); assert.equal(e.api.preview(canvas, null, '合成小屋', null).floors, 3);
  assert.equal(e.api.preview(null).reason, 'canvas-unavailable');
  const result = e.api.preview(canvas, null, '合成小屋', { house: { floors: [], rooms: {} } }); assert.equal(result.ok, false); assert.equal(result.status, 'unavailable'); assert.equal(result.mode, 'none'); assert.equal(result.reason, 'invalid-house');
  const absent = e.api.preview({ getContext: () => null }); assert.equal(absent.reason, 'canvas-2d-unavailable');
});
test('GL与降级都显示完整当前家名，八字/emoji及大小预览不遮房屋且恢复Canvas状态', () => {
  for (const engine of ['ready', 'missing', 'throw']) {
    const e = setup(engine), before = JSON.stringify(e.G.state);
    for (const [width, height] of [[560, 400], [220, 160], [80, 80]]) for (const name of [undefined, '云朵和小兔的家啊', '云朵🌼的家']) {
      const canvas = target(), expected = name ?? e.G.state.house.name, result = e.api.preview(canvas, null, name, { width, height, dpr: 3 });
      assert.equal(result.ok, true); assert.equal(result.mode, engine === 'ready' ? 'webgl' : 'canvas-isometric');
      assert.equal(canvas.width, Math.round(width * 1.5)); assert.equal(canvas.height, Math.round(height * 1.5));
      const labels = canvas.operations.filter(operation => operation.key === 'fillText');
      assert.equal(labels.length, 1); const label = labels[0]; assert.equal(label.args[0], expected); assert.equal(label.args[1], width / 2);
      assert.ok(label.args[2] > 0 && label.args[2] < height); assert.ok(label.args[3] > 0 && label.args[3] < width, '长家名须限制在名牌内');
      const fontSize = Number(/600 ([\d.]+)px/.exec(label.font)?.[1]); assert.ok(fontSize > 0 && fontSize <= 28); assert.equal(label.fillStyle, '#744554');
      if (engine === 'ready') {
        const draw = canvas.operations.find(operation => operation.key === 'drawImage'); assert.ok(draw); assert.ok(label.args[2] > draw.args[4], '家名须位于GL房屋取景之外');
        assert.ok(canvas.operations.indexOf(label) > canvas.operations.indexOf(draw), 'GL合成后仍须保留可见家名');
      }
      assert.equal(canvas.depth, 0); assert.equal(canvas.operations.at(-1).key, 'restore');
      assert.ok(result.unsupportedParts.includes('roof'), '补家名不能声称未建模的屋顶款式已还原');
    }
    assert.equal(JSON.stringify(e.G.state), before);
  }
});
test('改名后的同一画布展示新名，不留旧名且不改真实存档或重建GL实例', () => {
  for (const engine of ['ready', 'missing']) {
    const e = setup(engine), canvas = target(), before = JSON.stringify(e.G.state);
    assert.equal(e.api.preview(canvas, null, '云上的家').ok, true); canvas.operations.length = 0;
    assert.equal(e.api.preview(canvas, null, '杏仁小屋').ok, true);
    assert.deepEqual(canvas.operations.filter(operation => operation.key === 'fillText').map(operation => operation.args[0]), ['杏仁小屋']);
    assert.ok(canvas.operations.some(operation => operation.key === 'clearRect')); assert.equal(canvas.depth, 0);
    assert.equal(e.instances.length, engine === 'ready' ? 1 : 0); assert.equal(JSON.stringify(e.G.state), before);
  }
});
if (require.main === module) { for (const [name, fn] of tests) { fn(); console.log('✓ ' + name); } console.log('\n' + tests.length + ' 组个性化预览适配检查通过（合成状态/渲染委托，不代表实际GL像素或浏览器布局验收）。'); }
