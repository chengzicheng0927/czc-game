'use strict';
// 云海地图：布局稳定性、命中、夜灯，以及适配层的数据合并、file入口静默和串门卡片；无监听、无真实网络。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));
const idle = () => new Promise(resolve => setImmediate(resolve));
const uuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const house = (n, online) => Object.assign({ id: uuid(n), title: '小屋' + n, displayName: '建筑师' + n, roomCount: 2, updatedAt: 1793232000000 - n }, online ? { online } : {});

function load(files, extra = {}) {
  const c = vm.createContext(Object.assign({ console, setTimeout: () => 1, clearTimeout() {} }, extra)); c.window = c;
  c.Game = { ui: {} };
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), c, { filename: file });
  return c.Game;
}

function layoutTests() {
  const G = load(['js/render/sea-map.js']), sea = G.seaMap, keep = sea.keepOut;
  assert.equal(sea.bounds(), null); assert.deepEqual(plain(sea.lights()), []);
  assert.deepEqual(plain(sea.visualPositions()), [], '未开启空云时没有视觉云位');
  sea.setEmpty(true);
  const emptyVisual = sea.visualPositions(), expectedEmpty = plain(emptyVisual);
  assert.equal(emptyVisual.length, 8, '3D默认固定八座邻居岛'); assert.equal(sea.emptyCount(), 6, '2D空云仍保留六朵');
  assert.ok(emptyVisual.every(p => p.id === 'empty' && p.empty && p.scale >= .5 && p.scale <= 1.25 && Number.isFinite(p.x) && Number.isFinite(p.y)));
  assert.ok(new Set(emptyVisual.map(p => p.scale)).size > 1, '3D邻居岛随远近呈现不同大小');
  assert.deepEqual(plain(sea.positions()), [], '既有positions不包含空云');
  emptyVisual[0].id = 'changed'; emptyVisual[0].x = 0; emptyVisual[0].y = 0; emptyVisual[0].empty = false; emptyVisual[0].scale = 9; emptyVisual.pop();
  assert.deepEqual(plain(sea.visualPositions()), expectedEmpty, '修改返回对象和数组不得污染内部空云');
  const list = Array.from({ length: 60 }, (_, i) => house(i + 1));
  sea.setHouses(list);
  assert.equal(sea.count(), sea.limit, '最多显示' + sea.limit + '朵');
  const first = sea.positions();
  assert.equal(sea.visualPositions().length, 8, '日常画面只保留八座邻居岛');
  const realVisual = sea.visualPositions({ all: true }), expectedReal = plain(realVisual);
  assert.equal(realVisual.length, sea.count()); assert.ok(realVisual.every(p => !p.empty), '有真实邻居时不混入空云');
  assert.deepEqual(plain(realVisual.map(p => ({ id: p.id, x: p.x, y: p.y })).sort((a, b) => a.id.localeCompare(b.id))), plain(first).sort((a, b) => a.id.localeCompare(b.id)));
  realVisual[0].id = 'changed'; realVisual[0].x = 0; realVisual[0].y = 0; realVisual[0].empty = true; realVisual[0].scale = 9; realVisual.pop();
  assert.deepEqual(plain(sea.visualPositions({ all: true })), expectedReal, '修改返回对象和数组不得污染真实云位');
  assert.deepEqual(plain(sea.positions()), plain(first), '视觉getter不改变既有positions');
  const near = new Set(first.filter(p => p.x > keep.left && p.x < keep.right && p.y > keep.top && p.y < keep.bottom));
  assert.ok(near.size === 6, '岛边有近处小云：' + near.size);
  for (const p of first.filter(p => !near.has(p))) assert.ok(!(p.x > keep.left && p.x < keep.right && p.y > keep.top && p.y < keep.bottom), '云不得压住自己的小岛');
  for (let i = 0; i < first.length; i++) for (let j = i + 1; j < first.length; j++) assert.ok(Math.hypot(first[i].x - first[j].x, first[i].y - first[j].y) > 200, '云不得互相重叠');
  const sides = { left: 0, right: 0, top: 0, bottom: 0 };
  for (const p of first) { if (p.x <= keep.left) sides.left++; if (p.x >= keep.right) sides.right++; if (p.y <= keep.top) sides.top++; if (p.y >= keep.bottom) sides.bottom++; }
  assert.ok(Object.values(sides).every(n => n >= 3), '四面都要有云：' + JSON.stringify(sides));
  sea.setHouses(list.slice(0, 40).reverse());
  assert.deepEqual(plain(sea.positions().map(p => [p.id, p.x, p.y]).sort()), plain(first.map(p => [p.id, p.x, p.y]).sort()), '同一名单顺序不同，位置必须一致');
  sea.setHouses([list[3]]);
  // 命中：缩得很小时点击范围随之放大
  const target = sea.positions()[0];
  assert.equal(sea.hitAt({ x: target.x, y: target.y - 30 }, 1).id, list[3].id);
  assert.equal(sea.hitAt({ x: target.x + 300 / .1, y: target.y }, .1), null);
  assert.ok(sea.hitAt({ x: target.x + 20 / .05, y: target.y - 30 }, .05), '缩到0.05时20像素内仍应点中');
  assert.equal(sea.hitAt({ x: 0, y: 0 }, 1), null, '自己小岛上的点击不得被云截获');
  // 在线灯与包围盒
  sea.setHouses([house(1, { count: 2, hostOnline: true, displayNames: ['小明', '小红'] }), house(2)]);
  assert.equal(sea.lights().length, 1); assert.ok(sea.bounds().right > sea.bounds().left);
  // 绘制不抛错，且减少动态时不依赖时间
  const calls = []; const ctx = new Proxy({}, { get: (_, name) => name === 'measureText' ? () => ({ width: 40 }) : name === 'createRadialGradient' ? () => ({ addColorStop() {} }) : (...args) => { calls.push(name); }, set: () => true });
  sea.draw(ctx, { time: 3, reducedMotion: true, scale: .3, view: { left: -4000, right: 4000, top: -2000, bottom: 2000 } });
  assert.ok(calls.includes('fillText'), '在线称呼应画在牌子上');
  const before = calls.length; sea.draw(ctx, { time: 3, reducedMotion: true, scale: .3, view: { left: 0, right: 10, top: 0, bottom: 10 } });
  assert.equal(calls.length, before, '视野外的云不绘制');
}

function dom() {
  const body = { children: [], append(...nodes) { nodes.forEach(n => { n.parent = body; body.children.push(n); }); } };
  function node(tag) {
    return { tag, className: '', textContent: '', children: [], attributes: {}, listeners: {}, setAttribute(k, v) { this.attributes[k] = v; }, addEventListener(n, f) { this.listeners[n] = f; }, append(...kids) { this.children.push(...kids); }, remove() { if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this); } };
  }
  const events = {}, button = { hidden: true };
  const document = { hidden: false, body, createElement: node, getElementById: id => id === 'zoom-sea' ? button : null, addEventListener(n, f) { events[n] = f; } };
  return { document, body, button };
}
function text(node) { return node.textContent + (node.children || []).map(text).join(''); }
function anchors(card) { return card.children.flatMap(function walk(n) { return n.children && n.children.length ? [n, ...n.children.flatMap(walk)] : [n]; }).filter(n => n.tag === 'a'); }

(async () => {
  layoutTests();
  // 适配层需要 window 事件注册，单独构造沙箱
  const { document, body, button } = dom(), requests = [], bus = {}; let available = true, onlineReply, recentReply;
  const c = vm.createContext({ console, document, setTimeout: () => 1, clearTimeout() {} }); c.window = c; c.addEventListener = () => {};
  c.Game = { ui: {}, bus: { on(name, fn) { bus[name] = fn; } }, neighbors: { ownId: () => uuid(9), visitUrl: (id, join) => '/visit/' + id + (join ? '#join' : '') } };
  c.Game.cloud = { status: () => ({ available }), requestPublic: async url => { requests.push(url); const reply = url === '/neighbors/online' ? onlineReply : recentReply; if (reply instanceof Error) throw reply; return reply; } };
  for (const file of ['js/render/sea-map.js', 'js/ui/sea-map.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), c, { filename: file });
  const G = c.Game;

  // file入口 / 云不可用：不发请求，不显示按钮，没有云
  available = false; G.ui.seaMap.init(); await idle();
  assert.deepEqual(requests, []); assert.equal(button.hidden, true); assert.equal(G.seaMap.count(), 0);

  // 可用：在线优先、去重、排除自己的小屋
  available = true;
  onlineReply = { houses: [house(5, { count: 3, hostOnline: false, displayNames: ['甲', '乙', '丙'] }), house(9, { count: 1, hostOnline: true, displayNames: ['自己'] })] };
  recentReply = { houses: [house(5), house(6), house(7), house(9)], nextCursor: null };
  bus['cloud:change'](); await idle(); await idle();
  assert.equal(button.hidden, false); assert.deepEqual(requests.slice(-2), ['/neighbors/online', '/neighbors']);
  assert.deepEqual(plain(G.seaMap.positions().map(p => p.id).sort()), [uuid(5), uuid(6), uuid(7)]);
  assert.equal(G.seaMap.lights().length, 1);

  // 点击在线小屋：卡片含串门与参观；点击满员小屋：只剩参观
  bus['scene:neighbor']({ id: uuid(5) });
  let card = body.children[body.children.length - 1];
  assert.deepEqual(anchors(card).map(a => a.href), ['/visit/' + uuid(5) + '#join', '/visit/' + uuid(5)]);
  assert.ok(text(card).includes('甲、乙、丙 正在玩'));
  assert.ok(anchors(card).every(a => a.target === '_blank' && a.rel === 'noopener noreferrer'));
  bus['scene:neighbor']({ id: uuid(6) });
  assert.equal(body.children.filter(n => n.className === 'sea-card').length, 1, '同时只留一张卡片');
  card = body.children[body.children.length - 1]; assert.deepEqual(anchors(card).map(a => a.href), ['/visit/' + uuid(6)]);
  assert.ok(text(card).includes('现在没有人'));
  bus['scene:neighbor']({ id: 'not-a-uuid' }); assert.equal(card.parent, body);
  bus['scene:deselect'](); assert.equal(body.children.length, 0, '点别处收起卡片');

  // 非法在线名单：忽略在线状态但不影响普通名单；满员(8人)不提供加入
  onlineReply = { houses: [{ id: uuid(5), title: 'x', displayName: 'y', roomCount: 1, online: { count: 9, hostOnline: true, displayNames: [] } }] };
  await G.ui.seaMap.refresh(); assert.equal(G.seaMap.lights().length, 0); assert.equal(G.seaMap.count(), 4 - 1);
  onlineReply = { houses: [house(5, { count: 8, hostOnline: false, displayNames: ['1', '2', '3', '4', '5', '6', '7', '8'] })] };
  await G.ui.seaMap.refresh(); bus['scene:neighbor']({ id: uuid(5) });
  assert.deepEqual(anchors(body.children[body.children.length - 1]).map(a => a.href), ['/visit/' + uuid(5)]);

  // 请求失败：在线灯熄灭，普通云保留
  onlineReply = new Error('断网'); await G.ui.seaMap.refresh(); assert.equal(G.seaMap.lights().length, 0); assert.ok(G.seaMap.count() >= 3);
  // 没有任何邻居：出现空云，点击给出引导；有邻居后空云消失
  onlineReply = { houses: [] }; recentReply = { houses: [], nextCursor: null };
  for (let i = 0; i < 6; i++) await G.ui.seaMap.refresh();
  assert.equal(G.seaMap.count(), 0); assert.equal(G.seaMap.emptyCount(), 6); assert.equal(G.seaMap.lights().length, 0);
  const slot = G.seaMap.bounds(); assert.ok(slot.right > slot.left, '空云也参与全景取景');
  assert.equal(G.seaMap.hitAt({ x: 0, y: 0 }, 1), null, '空云不得挡住自己的小岛');
  let opened = 0; G.neighbors.open = () => { opened++; };
  bus['scene:neighbor']({ id: 'empty', empty: true }); card = body.children[body.children.length - 1];
  assert.ok(text(card).includes('这里还空着') && text(card).includes('公开自己的小屋')); assert.equal(anchors(card).length, 0);
  card.children.flatMap(function walk(n) { return [n, ...(n.children || []).flatMap(walk)]; }).find(n => n.tag === 'button' && n.className.includes('ui-button')).listeners.click();
  assert.equal(opened, 1); assert.equal(body.children.length, 0);
  onlineReply = { houses: [house(5, { count: 1, hostOnline: false, displayNames: ['甲'] })] }; await G.ui.seaMap.refresh(); assert.equal(G.seaMap.emptyCount(), 0);
  available = false; bus['cloud:change'](); assert.equal(G.seaMap.emptyCount(), 0, '网站不可用时不画空云');
  console.log('sea-map: all passed');
})().catch(error => { console.error(error); process.exit(1); });
