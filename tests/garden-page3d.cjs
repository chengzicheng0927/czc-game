'use strict';
// MC-080：仅合成内存状态；正式花园规则 + 正式Geometry，不创建GL/DOM、服务或私人存档。
// 此文件交总集串行执行，开发会话仅node --check。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));
const files = ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/garden.js',
  'js/core/utils.js', 'js/core/bus.js', 'js/core/store.js', 'js/core/save.js', 'js/systems/systems.js',
  'js/systems/garden.js', 'js/render/world3d-models.js', 'js/render/world3d.js', 'js/render/garden-page3d.js'];
function setup(level = 14) {
  let now = new Date(2026, 9, 30, 21, 0, 0).getTime();
  const RealDate = Date;
  class Clock extends RealDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const forbidden = () => { throw new Error('纯花园模块不得触发外部副作用'); };
  const context = vm.createContext({ console, Date: Clock, Blob, URL, document: { addEventListener() {}, createElement: forbidden },
    requestAnimationFrame: forbidden, setTimeout: () => 1, clearTimeout() {}, setInterval: forbidden, clearInterval() {}, fetch: forbidden });
  context.window = context; context.addEventListener = () => {}; context.localStorage = { getItem: () => null, setItem() {} };
  files.forEach(file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file }));
  const G = context.Game;
  G.store.init(); G.store.update(state => { state.level = level; state.wallet.coin = 100000; state.garden.seeds = Object.fromEntries(G.data.crops.map(crop => [crop.id, 20])); }); G.sys.garden.init();
  function env() {
    const count = G.sys.garden.capacity(), rows = count / 3, center = { x: 1000, y: 143 };
    const plots = Array.from({ length: count }, (_, index) => {
      const x = 832 + index % 3 * 118, y = center.y - (rows * 66 + (rows - 1) * 20) / 2 + Math.floor(index / 3) * 86;
      return { index, x, y, w: 100, h: 66, cropX: x + 50, cropY: y + 38, particleX: x + 50, particleY: y + 12 };
    });
    return { surface: 'garden', state: G.state, data: G.data, garden: { center, plots }, gardenStatuses: G.sys.garden.plots(), selectedPlot: 0, visitor: null };
  }
  return { G, env, at: value => { now = value; }, now: () => now, describe: patch => G.gardenPage3D.describe(Object.assign(env(), patch || {})) };
}
let passed = 0;
function test(name, run) { run(); passed++; console.log('✓ ' + name); }
function geometry(G, description) {
  const g = new G.world3dMath.Geometry(); assert.equal(description.build(g, G.world3dModels), true); return g;
}
function assertBounds(g, bounds) {
  assert.ok(g.data.length > 0 && g.data.length % 27 === 0);
  for (let at = 0; at < g.data.length; at += 9) {
    for (let k = 0; k < 9; k++) assert.ok(Number.isFinite(g.data[at + k]), '正式Geometry顶点/法向/颜色必须有限');
    for (let k = 0; k < 3; k++) assert.ok(g.data[at + k] >= bounds.min[k] - .001 && g.data[at + k] <= bounds.max[k] + .001, '相机bounds必须包括全部实际几何');
  }
}

test('只在已开放的garden页产生独立可交互描述，摄影与家园路径返回null', () => {
  const fixture = setup(), { G } = fixture;
  assert.equal(fixture.describe().id, 'garden'); assert.equal(fixture.describe().interactive, true);
  for (const surface of [null, 'home', 'avatar', 'residents', 'crafting', 'photography']) assert.equal(fixture.describe({ surface }), null);
  for (const flag of ['capturingPhoto', 'forceHouse', 'roomOnly']) assert.equal(fixture.describe({ [flag]: true }), null);
  assert.equal(setup(5).describe(), null);
  assert.deepEqual(Object.keys(G.gardenPage3D), ['describe']);
});

test('真实等级只产生六格或九格，逐格index与旧世界/粒子坐标原样对应', () => {
  for (const [level, count] of [[6, 6], [13, 6], [14, 9], [30, 9]]) {
    const fixture = setup(level), input = fixture.env(), page = fixture.describe();
    assert.equal(page.plots.length, count); assert.equal(page.hits.length, count);
    assert.deepEqual(plain(page.plots.map(plot => plot.index)), Array.from({ length: count }, (_, i) => i));
    page.plots.forEach(plot => {
      const original = input.garden.plots.find(source => source.index === plot.index), hit = page.hits.find(value => value.index === plot.index);
      assert.deepEqual(plain(plot.world), { x: original.cropX, y: original.y + original.h / 2 });
      assert.deepEqual(plain(hit.world), plain(plot.world));
      assert.deepEqual(plain(plot.particleWorld), { x: original.particleX, y: original.particleY });
      assert.deepEqual(plain(page.worldToPage(plot.world)), plain(plot.p));
      assert.equal(hit.kind, 'plot'); assert.equal(hit.p[0], plot.harvestAnchor[0]); assert.equal(hit.p[2], plot.harvestAnchor[2]);
    });
  }
});

test('缺少真实status、越界或重复地块时不伪造空地，不借全局规则兜底', () => {
  const fixture = setup(), input = fixture.env();
  assert.equal(fixture.describe({ gardenStatuses: input.gardenStatuses.slice(1) }), null);
  const duplicate = plain(input.garden); duplicate.plots[8].index = 0;
  assert.equal(fixture.describe({ garden: duplicate }), null);
  const short = plain(input.garden); short.plots.pop(); assert.equal(fixture.describe({ garden: short }), null);
  const invalid = plain(input.garden); invalid.plots[0].cropX = NaN; assert.equal(fixture.describe({ garden: invalid }), null);
  assert.equal(fixture.describe({ gardenStatuses: null }), null);
});

test('真实播种/分阶段浇水/离线成熟驱动状态和key，不按场景夜色伪造进度', () => {
  const fixture = setup(), { G } = fixture, empty = fixture.describe();
  assert.ok(G.sys.garden.plant(0, 'star_fruit').ok);
  const planted = fixture.describe(); assert.notEqual(planted.key, empty.key); assert.equal(planted.plots[0].status.stage, 0); assert.equal(planted.plots[0].status.needsWater, true);
  assert.ok(G.sys.garden.water(0).ok);
  const watered = fixture.describe(); assert.notEqual(watered.key, planted.key); assert.equal(watered.plots[0].status.watered, true);
  const key = watered.key; fixture.at(fixture.now() + 1000); assert.equal(fixture.describe().key, key, '剩余秒数不让整园每秒重建');
  fixture.at(G.sys.garden.status(0).stageEndAt);
  const sprout = fixture.describe(); assert.equal(sprout.plots[0].status.stage, 1); assert.equal(sprout.plots[0].status.needsWater, true); assert.notEqual(sprout.key, key);
  fixture.at(G.sys.garden.status(0).matureAt + 1);
  const mature = fixture.describe(); assert.equal(mature.plots[0].status.mature, true); assert.equal(mature.plots[0].status.needsWater, false);
  assert.match(mature.labels.find(label => label.index === 0).text, /可收获/);
});

test('所有12种作物的四个真实阶段可追加正式Geometry，完整相机边界不裁切', () => {
  const fixture = setup(), { G } = fixture;
  // 每轮九个合成播种存档，status仍由正式时间线产生；覆盖48个作物阶段组合。
  const combinations = G.data.crops.flatMap(crop => Array.from({ length: 4 }, (_, stage) => ({ crop, stage })));
  for (let offset = 0; offset < combinations.length; offset += 9) {
    const group = combinations.slice(offset, offset + 9);
    G.store.update(state => { state.garden.plots = Array.from({ length: 9 }, (_, index) => {
      const entry = group[index]; return entry ? { crop: entry.crop.id, durationMs: entry.crop.growMs, plantedAt: fixture.now() - entry.crop.growMs / 3 * entry.stage - 1, watered: [null, null, null] } : null;
    }); });
    const page = fixture.describe(); assert.ok(page);
    group.forEach((entry, i) => { assert.equal(page.plots[i].status.crop, entry.crop.id); assert.equal(page.plots[i].status.stage, entry.stage); });
    const g = geometry(G, page); assertBounds(g, page.bounds);
    const before = g.data.length; assert.equal(page.build(g, G.world3dModels), true); assert.equal(g.data.length, before * 2, 'build只追加，不清空宿主Geometry');
  }
});

test('相同真实编号的3D垂直命中互不串格，所有操作命中都保留有限旧世界坐标', () => {
  const fixture = setup(), { G } = fixture;
  G.store.update(state => { state.garden.plots = Array.from({ length: 9 }, (_, i) => ({ crop: i % 2 ? 'sakura' : 'sunflower', plantedAt: fixture.now() - 20000000, durationMs: G.data.cropById[i % 2 ? 'sakura' : 'sunflower'].growMs, watered: [null, null, null] })); });
  const page = fixture.describe();
  for (const plot of page.plots) {
    const ray = { origin: [plot.p[0], 10, plot.p[2]], direction: [0, -1, 0] };
    const found = page.hits.filter(hit => {
      const box = { min: [hit.p[0] - hit.size[0] / 2, hit.p[1], hit.p[2] - hit.size[2] / 2], max: [hit.p[0] + hit.size[0] / 2, hit.p[1] + hit.size[1], hit.p[2] + hit.size[2] / 2] };
      return G.world3dMath.rayBox(ray, box);
    });
    assert.equal(found.length, 1); assert.equal(found[0].index, plot.index);
    assert.ok(Number.isFinite(found[0].world.x) && Number.isFinite(found[0].world.y));
    assert.ok(found[0].p[1] <= .3, 'hitBox的p.y是底边，土面也必须可点击');
    if (plot.status.crop === 'sakura') {
      assert.ok(plot.harvestAnchor[1] > 2.433, '成熟樱花的收获起点高于完整树冠');
      assert.ok(found[0].p[1] + found[0].size[1] >= 2.433, '成熟樱花树尖也属于同一地块');
    }
  }
});

test('只描述传入的原访客，命中坐标不搬档，不生成额外领奖或装饰命中', () => {
  const fixture = setup(), initial = fixture.describe();
  assert.equal(initial.hits.some(hit => hit.kind === 'visitor'), false);
  const visitor = { x: 1286, y: -46, bee: true }, page = fixture.describe({ visitor });
  assert.equal(page.hits.length, 10); assert.equal(page.hits.filter(hit => hit.kind === 'visitor').length, 1);
  assert.deepEqual(plain(page.hits.find(hit => hit.kind === 'visitor').world), { x: visitor.x, y: visitor.y });
  assert.ok(page.hits.every(hit => ['plot', 'visitor'].includes(hit.kind)));
  assert.notEqual(page.key, initial.key); assertBounds(geometry(fixture.G, page), page.bounds);
});

test('describe/build不改输入或store；选择只改变高亮，持有快照不追随后续env变动', () => {
  const fixture = setup(), { G } = fixture, input = fixture.env(), before = JSON.stringify(input);
  G.store.update = () => { throw new Error('纯模块不得写存档'); };
  const page = G.gardenPage3D.describe(input), first = geometry(G, page).data.slice();
  assert.equal(JSON.stringify(input), before);
  const second = fixture.describe({ selectedPlot: 4 }); assert.notEqual(second.key, page.key);
  assert.deepEqual(plain(second.hits), plain(page.hits));
  assert.notDeepEqual(geometry(G, second).data, first);
  input.gardenStatuses[0].stage = 3; input.garden.plots[0].cropX = 100000; input.garden.center.x = -1000;
  assert.deepEqual(geometry(G, page).data, first, '描述与绘制使用同一状态快照');
  assert.equal(page.build({}, G.world3dModels), false); assert.equal(page.build(new G.world3dMath.Geometry(), {}), false);
});

console.log('\n独立花园3D契约：' + passed + '组通过。');
