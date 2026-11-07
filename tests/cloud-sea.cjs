'use strict';
// 云海背景：镜头视差、昼夜/天气取色、减少动态静止、极端缩放下的绘制量上限；用记录型画布，不代替浏览器目视。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const c = vm.createContext({ console }); c.window = c; vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js/render/cloud-sea.js'), 'utf8'), c);
const G = c.Game;
function record() {
  const calls = []; const ctx = new Proxy({}, { get: (_, name) => (...args) => { calls.push([name, ...args]); return name === 'createLinearGradient' ? { addColorStop() {} } : undefined; }, set: () => true });
  return { ctx, calls };
}
const base = { width: 1280, height: 700, time: { nightness: 0, weather: 'clear' }, reducedMotion: false, now: 12 };
const run = (camera, extra = {}) => { const r = record(); G.cloudSea.draw(r.ctx, Object.assign({}, base, { camera }, extra)); return r.calls; };
const fills = calls => calls.filter(x => x[0] === 'arc').length;

assert.ok(run({ x: 0, y: -100, scale: .55 }).length > 50, '默认镜头应画出云层');
assert.deepEqual(JSON.stringify(run({ x: 0, y: -100, scale: .55 })), JSON.stringify(run({ x: 0, y: -100, scale: .55 })), '同一镜头同一时间结果完全一致');
assert.notEqual(JSON.stringify(run({ x: 0, y: -100, scale: .55 })), JSON.stringify(run({ x: 900, y: -100, scale: .55 })), '镜头平移后云要跟着变（视差）');
assert.equal(JSON.stringify(run({ x: 0, y: -100, scale: .55 }, { reducedMotion: true, now: 1 })), JSON.stringify(run({ x: 0, y: -100, scale: .55 }, { reducedMotion: true, now: 99 })), '减少动态时不随时间漂移');
assert.notEqual(JSON.stringify(run({ x: 0, y: -100, scale: .55 }, { now: 1 })), JSON.stringify(run({ x: 0, y: -100, scale: .55 }, { now: 60 })), '正常模式云会缓缓漂');
for (const scale of [.04, .1, .55, 1.2, 2]) assert.ok(fills(run({ x: 300, y: -200, scale })) < 1500, '缩放' + scale + '时绘制量必须有上限：' + fills(run({ x: 300, y: -200, scale })));
const colors = calls => new Set(calls.filter(x => x[0] === 'fillStyle').map(x => x[1]));
const fillColors = (extra) => { const colorsSeen = new Set(); const ctx = new Proxy({}, { get: (_, name) => () => name === 'createLinearGradient' ? { addColorStop(_, color) { colorsSeen.add(color); } } : undefined, set: (_, name, value) => { if (name === 'fillStyle') colorsSeen.add(value); return true; } }); G.cloudSea.draw(ctx, Object.assign({}, base, { camera: { x: 0, y: -100, scale: .55 } }, extra)); return [...colorsSeen].join(); };
assert.notEqual(fillColors({}), fillColors({ time: { nightness: 1, weather: 'clear' } }), '夜里换成蓝紫色');
assert.notEqual(fillColors({}), fillColors({ time: { nightness: 0, weather: { type: 'rain' } } }), '下雨偏灰');
assert.doesNotThrow(() => G.cloudSea.draw(record().ctx, { width: 0, height: 0, camera: { x: NaN, y: 0, scale: 0 }, time: null }), '异常输入不抛错');
void colors;
console.log('cloud-sea: all passed');
