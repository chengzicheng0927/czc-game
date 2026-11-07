'use strict';
// 场景质感：各图层可绘制、不抛错、夜里柔光退场、减少动态时草丛静止；记录型画布，不代替浏览器目视。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const c = vm.createContext({ console }); c.window = c; vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js/render/polish.js'), 'utf8'), c);
const G = c.Game;
function recorder() {
  const stops = [], calls = [];
  const gradient = { addColorStop(_, color) { stops.push(color); } };
  const ctx = new Proxy({}, { get: (_, name) => (...args) => { calls.push([name, ...args]); return /^create/.test(name) ? gradient : undefined; }, set: () => true });
  return { ctx, stops, calls };
}
const alphas = stops => stops.map(s => Number(/,([\d.]+)\)$/.exec(s)?.[1] || 0));
const light = time => { const r = recorder(); G.polish.light(r.ctx, { width: 1280, height: 700, time }); return r; };

for (const name of ['islandUnder', 'islandOver', 'house', 'light']) assert.equal(typeof G.polish[name], 'function');
{ const r = recorder(); G.polish.islandUnder(r.ctx); assert.ok(r.calls.length > 4); }
{ const r = recorder(); G.polish.islandOver(r.ctx, { time: 3, reducedMotion: false }); assert.ok(r.calls.length > 100, '土层、草坪和草丛都要画出来');
  const still = a => { const q = recorder(); G.polish.islandOver(q.ctx, { time: a, reducedMotion: true }); return JSON.stringify(q.calls); };
  assert.equal(still(1), still(50), '减少动态时草丛静止');
  const moving = a => { const q = recorder(); G.polish.islandOver(q.ctx, { time: a, reducedMotion: false }); return JSON.stringify(q.calls); };
  assert.notEqual(moving(1), moving(50), '正常时草丛轻摆'); }
{ const r = recorder(); G.polish.house(r.ctx, { top: -440, floors: 2 }); assert.ok(r.calls.filter(x => x[0] === 'fillRect').length >= 10, '屋檐阴影、四根木柱高光/背光和脚下阴影'); }
const day = light({ nightness: 0, weather: 'clear' }), night = light({ nightness: 1, weather: 'clear' }), dusk = light({ nightness: .28, weather: 'clear' }), rain = light({ nightness: 0, weather: { type: 'rain' } });
assert.ok(Math.max(...alphas(day.stops)) > Math.max(...alphas(night.stops)), '夜里柔光退场');
assert.equal(night.calls.filter(x => x[0] === 'fillRect').length, 0, '深夜不画暖光与暗角');
assert.ok(dusk.calls.filter(x => x[0] === 'fillRect').length > day.calls.filter(x => x[0] === 'fillRect').length, '黄昏多一层桃色');
assert.ok(alphas(rain.stops)[0] < alphas(day.stops)[0], '下雨时阳光更弱');
assert.doesNotThrow(() => G.polish.light(recorder().ctx, { width: 0, height: NaN, time: null }));
console.log('polish: all passed');
