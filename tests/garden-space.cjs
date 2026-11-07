'use strict';
// 只验证场景几何与镜头计算，不创建页面、渲染循环、浏览器或服务。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const G = { data: {}, sys: {}, runtime: { mode: 'explore' }, state: { level: 30, house: { floors: [{ slots: [null, null, null] }] } } }, context = vm.createContext({ Game: G, console }); context.window = context;
vm.runInContext(fs.readFileSync(path.join(root, 'js/data/garden.js'), 'utf8'), context);
G.sys.garden = { capacity: () => G.state.level >= G.data.gardenConfig.expandLv ? G.data.gardenConfig.expandedPlots : G.data.gardenConfig.basePlots, status: () => ({ crop: null }) };
vm.runInContext(fs.readFileSync(path.join(root, 'js/render/scene.js'), 'utf8'), context);
const layout = G.render.layout;
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }
function corners(box) { return [[box.x, box.y], [box.x + box.w, box.y], [box.x, box.y + box.h], [box.x + box.w, box.y + box.h]]; }
function project(point, frame, width, height) { return { x: (point[0] - frame.x) * frame.scale + width / 2, y: (point[1] - frame.y) * frame.scale + height / 2 }; }
function within(point, width, height, padding) { assert.ok(point.x >= padding - 1e-7 && point.x <= width - padding + 1e-7, '横向未裁切：' + JSON.stringify(point)); assert.ok(point.y >= padding - 1e-7 && point.y <= height - padding + 1e-7, '纵向未裁切：' + JSON.stringify(point)); }
test('实际容量仍为6/9，布局按3列居中；未来12格只提供4列3排几何能力', () => {
  assert.equal(G.data.gardenConfig.basePlots, 6); assert.equal(G.data.gardenConfig.expandedPlots, 9); assert.equal(layout.garden().plots.length, 9);
  for (const [count, columns, rows] of [[6, 3, 2], [9, 3, 3], [12, 4, 3]]) { const value = layout.garden(count); assert.equal(value.columns, columns); assert.equal(value.rows, rows); assert.equal(value.center.x, 1000); assert.equal(value.center.y, 143); assert.equal(value.plots.length, count); assert.ok(value.plots.every(plot => plot.w === 100 && plot.h === 66)); }
});
test('6/9及前向12格的所有地块四角均在扩大后的花园椭圆内，底排不悬空', () => {
  for (const count of [6, 9, 12]) { const value = layout.garden(count); for (const plot of value.plots) for (const [x, y] of corners(plot)) { const distance = Math.pow((x - value.center.x) / value.radius.x, 2) + Math.pow((y - value.center.y) / value.radius.y, 2); assert.ok(distance <= 1, count + '格第' + plot.index + '块越过草地'); } assert.ok(Math.max(...value.plots.map(plot => plot.y + plot.h)) <= 270); }
});
test('桥连接前院右缘与花园，末端和最左地块至少留10单位间隔', () => {
  for (const count of [6, 9, 12]) { const value = layout.garden(count), first = Math.min(...value.plots.map(plot => plot.x)); assert.ok(value.bridge.x < 710 && value.bridge.x + value.bridge.w > value.center.x - value.radius.x); assert.ok(value.bridge.x + value.bridge.w <= first - 10); assert.ok(value.bridge.y <= 143 && value.bridge.y + value.bridge.h >= 143); }
});
test('绘制坐标、土块中心点击和粒子锚点共用同一布局，桥上不误点地块', () => {
  for (const count of [6, 9, 12]) { const value = layout.garden(count); for (const plot of value.plots) { const hit = layout.plotAt({ x: plot.x + plot.w / 2, y: plot.y + plot.h / 2 }, count); assert.equal(hit.index, plot.index); assert.equal(plot.cropX, plot.x + plot.w / 2); assert.equal(plot.particleX, plot.cropX); assert.ok(plot.particleY > plot.y && plot.particleY < plot.y + plot.h); } assert.equal(layout.plotAt({ x: 700, y: 143 }, count), null); }
});
test('400像素手机和1024桌面全景均按总边界居中，不裁花园右侧或院子左侧', () => {
  for (const floors of [1, 2, 4]) for (const [width, height] of [[400, 180], [400, 420], [1024, 180], [1024, 576]]) { const bounds = layout.overview(floors), frame = layout.frame(bounds, width, height); assert.equal(bounds.left, -710); assert.equal(bounds.right, 1330); assert.equal(frame.x, 310); for (const point of [[bounds.left, bounds.top], [bounds.right, bounds.top], [bounds.left, bounds.bottom], [bounds.right, bounds.bottom]]) within(project(point, frame, width, height), width, height, 24); for (const plot of layout.garden().plots) for (const corner of corners(plot)) within(project(corner, frame, width, height), width, height, 24); }
  // 缩放栏占底部80px，整个世界须落在上方可用区域，不能只检查横向完整。
  for (const floors of [1, 4]) for (const [width, height] of [[400, 180], [400, 580], [1024, 548]]) {
    const bounds = layout.overview(floors), frame = layout.frame(bounds, width, height, 24, 1.15, 80);
    for (const point of [[bounds.left, bounds.top], [bounds.right, bounds.bottom]]) { const screen = project(point, frame, width, height); within(screen, width, height, 24); assert.ok(screen.y <= height - 80 - 24 + 1e-7, '全景应避开底部缩放栏'); }
  }
});
test('面板打开仅余180像素时花园focus也完整容纳地块，不受旧0.5最小缩放限制', () => {
  for (const count of [6, 9, 12]) { const value = layout.garden(count), frame = layout.frame(value.bounds, 400, 180, 18, 1.4); assert.ok(frame.scale < .5); for (const plot of value.plots) for (const corner of corners(plot)) within(project(corner, frame, 400, 180), 400, 180, 18); within(project([value.header.x, value.header.y], frame, 400, 180), 400, 180, 18); }
});
test('阁楼随楼层升高，命中范围准确且不会挤掉正常房间格', () => {
  const before=JSON.stringify(G.state); for (const count of [1,3,4]) { G.state.house.floors=Array.from({length:count},()=>({slots:[null,null,null]})); G.state.house.attic={type:'observatory'}; const attic=layout.attic(); assert.equal(attic.y,-220*count-295); assert.equal(attic.w,320); assert.equal(layout.atticAt({x:0,y:attic.y+50}),true); assert.equal(layout.atticAt({x:attic.x-1,y:attic.y+50}),false); }
  G.state=JSON.parse(before);
});
test('已建阁楼的全景边界和手机镜头完整包含穹顶', () => {
  const before=JSON.stringify(G.state); G.state.house.floors=Array.from({length:3},()=>({slots:[null,null,null]})); G.state.house.attic={type:'observatory'}; const attic=layout.attic(), bounds=layout.overview(); assert.ok(bounds.top<attic.y); const frame=layout.frame(bounds,400,580,24,1.15,80); for (const corner of corners(attic)) within(project(corner,frame,400,580),400,580,24); G.state=JSON.parse(before);
});
console.log('\n' + passed + ' 组花园布局与镜头几何检查通过。');
