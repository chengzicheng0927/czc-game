'use strict';
// 验证真实绘制模块的分支、有限坐标、离屏合成隔离与粒子预算；不替代浏览器目视检查。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
let passed = 0;
class Context {
  constructor() { this.calls = []; this.gradients = []; this.stack = []; this.globalAlpha = 1; this._composite = 'source-over'; }
  get globalCompositeOperation() { return this._composite; }
  set globalCompositeOperation(value) { this.calls.push({ type: 'composite', value }); this._composite = value; }
  save() { this.stack.push({ alpha: this.globalAlpha, composite: this._composite }); this.calls.push({ type: 'save' }); }
  restore() { assert.ok(this.stack.length, 'restore 必须对应 save'); const state = this.stack.pop(); this.globalAlpha = state.alpha; this._composite = state.composite; this.calls.push({ type: 'restore' }); }
  gradient(type, args) { this.check(args); const value = { type, args, stops: [], addColorStop(offset, color) { assert.ok(offset >= 0 && offset <= 1); this.stops.push({ offset, color }); } }; this.gradients.push(value); return value; }
  createLinearGradient(...args) { return this.gradient('linear', args); }
  createRadialGradient(...args) { return this.gradient('radial', args); }
  check(args) { args.forEach(value => { if (typeof value === 'number') assert.ok(Number.isFinite(value), '绘制坐标应为有限数'); }); }
}
for (const method of ['translate', 'scale', 'rotate', 'beginPath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'arc', 'ellipse', 'fill', 'stroke', 'fillRect', 'clearRect', 'setTransform', 'closePath', 'drawImage']) Context.prototype[method] = function (...args) { this.check(args); this.calls.push({ type: method, args, fill: this.fillStyle, alpha: this.globalAlpha, composite: this._composite }); };
function sandbox() {
  const canvases = [], document = { hidden: false, createElement(tag) { assert.equal(tag, 'canvas'); const canvas = { width: 1, height: 1, context: new Context(), getContext(type) { assert.equal(type, '2d'); return this.context; } }; canvases.push(canvas); return canvas; } };
  const context = vm.createContext({ window: null, document, performance: { now: () => 1000 }, console }); context.window = context;
  context.Game = { runtime: {}, sys: { time: { current: () => ({ phase: 'day', nightness: 0, weather: 'clear', date: '2026-10-27' }) } } };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/render/atmosphere.js'), 'utf8'), context);
  return { G: context.Game, document, canvases, context };
}
function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }
const options = (weather, extra) => Object.assign({ width: 1200, height: 700, now: 1000, time: { phase: 'day', nightness: 0, weather, date: '2026-10-27', rainbow: false } }, extra);
const plain = value => JSON.parse(JSON.stringify(value));
test('六种天气绘制不产生无效坐标，save/restore始终平衡', () => {
  const { G } = sandbox();
  for (const kind of ['clear', 'cloudy', 'rain', 'snow', 'sakura', 'leaves']) {
    const c = new Context(); G.atmosphere.sky(c, options(kind)); const result = G.atmosphere.weather(c, options(kind));
    assert.equal(result.weather, kind); assert.equal(c.stack.length, 0); assert.equal(c.globalAlpha, 1);
    if (['clear', 'cloudy'].includes(kind)) assert.equal(result.count, 0); else assert.ok(result.count > 0);
  }
});
test('真实夜幕用深蓝天空，夜星/月亮出现，黄昏是独立渐变', () => {
  const { G } = sandbox(), day = new Context(), dusk = new Context(), night = new Context();
  const dayInfo = G.atmosphere.sky(day, options('clear'));
  G.atmosphere.sky(dusk, options('clear', { time: { phase: 'dusk', nightness: .46, weather: 'clear', date: '2026-10-27' } }));
  const nightInfo = G.atmosphere.sky(night, options('clear', { time: { phase: 'night', nightness: 1, weather: 'clear', date: '2026-10-27' } }));
  assert.equal(dayInfo.stars, 0); assert.equal(nightInfo.stars, 86); assert.equal(night.gradients[0].stops[0].color, '#14213d');
  assert.notDeepEqual(day.gradients[0].stops, dusk.gradients[0].stops); assert.notDeepEqual(dusk.gradients[0].stops, night.gradients[0].stops); assert.ok(night.calls.filter(call => call.type === 'arc').length > 40);
});
test('雨后彩虹画出七条彩带，而非继续下雨', () => {
  const { G } = sandbox(), plainSky = new Context(), rainbow = new Context();
  G.atmosphere.sky(plainSky, options('clear')); const opts = options('clear', { time: { phase: 'day', nightness: 0, weather: 'clear', date: '2026-10-27', rainbow: true } }); G.atmosphere.sky(rainbow, opts);
  assert.equal(rainbow.calls.filter(call => call.type === 'stroke').length - plainSky.calls.filter(call => call.type === 'stroke').length, 7); assert.equal(G.atmosphere.weather(rainbow, opts).count, 0);
});
test('粒子数有硬上限，低动态天气静止且最多8颗', () => {
  const { G } = sandbox(), c = new Context();
  for (const kind of ['rain', 'snow', 'sakura', 'leaves']) {
    const large = options(kind, { width: 10000, height: 10000 }); const result = G.atmosphere.weather(c, large); assert.ok(result.count <= (kind === 'rain' ? 68 : kind === 'snow' ? 42 : 26));
    const small = options(kind, { reducedMotion: true }); assert.ok(G.atmosphere.weather(c, small).count <= 8); const before = plain(G.runtime.atmosphere.particles);
    G.atmosphere.weather(c, Object.assign({}, small, { now: 10000000 })); assert.deepEqual(plain(G.runtime.atmosphere.particles), before);
  }
});
test('后台不生成天气绘制，恢复后不追补漫长时间', () => {
  const { G, document } = sandbox(), c = new Context(), opts = options('rain'); G.atmosphere.weather(c, opts); document.hidden = true; const count = c.calls.length;
  assert.equal(G.atmosphere.weather(c, Object.assign({}, opts, { now: 999999 })).hidden, true); assert.equal(c.calls.length, count);
  const before = plain(G.runtime.atmosphere.particles); document.hidden = false; G.atmosphere.weather(c, Object.assign({}, opts, { now: 1000000 })); assert.deepEqual(plain(G.runtime.atmosphere.particles), before);
  G.atmosphere.weather(c, Object.assign({}, opts, { now: 9000000 })); G.runtime.atmosphere.particles.forEach((point, i) => assert.ok(Math.abs(point.y - before[i].y) < .1));
});
test('暖灯挖洞仅在离屏destination-out，主画布不清除房子', () => {
  const { G, canvases } = sandbox(), c = new Context(), opts = options('clear', { nightness: 1, lights: [{ x: 150, y: 200, radius: 90 }, { x: 450, y: 280, radius: 120 }] });
  const result = G.atmosphere.night(c, opts); assert.equal(result.lights, 2); assert.equal(canvases.length, 1); assert.ok(canvases[0].context.calls.some(call => call.type === 'composite' && call.value === 'destination-out'));
  assert.equal(c.calls.some(call => call.type === 'composite'), false); assert.equal(c.calls.filter(call => call.type === 'drawImage').length, 1); assert.ok(c.gradients.length >= 2); assert.equal(c.stack.length, 0); assert.equal(canvases[0].context.stack.length, 0);
});
test('白天跳过夜幕、夜幕复用缓存，超大窗口离屏最大1600且灯数最多64', () => {
  const { G, canvases } = sandbox(), c = new Context(); assert.equal(G.atmosphere.night(c, options('clear')).lights, 0); assert.equal(canvases.length, 0);
  const opts = options('clear', { width: 4000, height: 2400, nightness: 1, lights: Array.from({ length: 100 }, (_, i) => ({ x: i * 10, y: 100 })) }); assert.equal(G.atmosphere.night(c, opts).lights, 64); assert.equal(canvases[0].width, 1600); assert.equal(canvases[0].height, 960);
  G.atmosphere.night(c, opts); assert.equal(canvases.length, 1); G.atmosphere.reset(); assert.equal(G.runtime.atmosphere.mask, null); assert.equal(G.runtime.atmosphere.particles.length, 0);
});
test('非法灯坐标被排除，未知天气安全当晴天，模块保留原G.render', () => {
  const { G } = sandbox(), c = new Context(); assert.equal(G.atmosphere.sky(c, options('strange')).weather, 'clear'); assert.equal(G.atmosphere.night(c, options('clear', { nightness: 1, lights: [{ x: NaN, y: 20 }, { x: 1, y: 2, radius: -2 }, { x: Infinity, y: 0 }] })).lights, 1); assert.equal(G.render, undefined);
});
test('集齐七色后日夜和雨天仍有永久彩虹，六色与重复色片不冒充完成', () => {
  const { G } = sandbox(), pieces = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple'];
  for (const nightness of [0, 1]) for (const weather of ['clear', 'rain']) {
    const c = new Context(), opts = options(weather, { state: { rainbowPieces: pieces }, time: { date: '2026-10-28', phase: nightness ? 'night' : 'day', nightness, weather, rainbow: false } });
    assert.equal(G.atmosphere.sky(c, opts).permanentRainbow, true); assert.equal(c.stack.length, 0);
    assert.ok(c.calls.filter(call => call.type === 'stroke').length >= 7);
  }
  for (const incomplete of [pieces.slice(0, 6), Array(7).fill('red')]) assert.equal(G.atmosphere.sky(new Context(), options('clear', { state: { rainbowPieces: incomplete } })).permanentRainbow, false);
});
console.log('\n' + passed + ' 组天空天气渲染检查通过（fakeCanvas，未执行主观视觉验收）。');
