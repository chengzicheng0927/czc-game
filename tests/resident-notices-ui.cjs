'use strict';
// 真资格规则与来信UI的连接；不启动页面或服务，不替代根的桌面/手机目视验收。
const assert = require('node:assert/strict'), { setup } = require('./fixtures/resident-life.cjs');
const tests = []; const test = (name, fn) => tests.push({ name, fn });
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
function ready(env) {
  const G = env.G, bedroom = G.sys.building.buildRoom(0, 0, 'bedroom').roomId; G.sys.decorating.place('bed_basic', bedroom, 10, 80);
  G.store.update(state => { state.tutorial.done = true; state.tutorial.step = 10; }); return bedroom;
}
function ui(env) { env.load('js/ui/resident-notices.js'); env.G.ui.residentNotices.init(); return env.world.querySelector('.resident-letter'); }
test('资格出现时一次纸笺，可关闭并保留信封；刷新只留可主动打开的入口', async () => {
  const env = setup(); ready(env); const root = ui(env), note = root.querySelector('.resident-letter-note'), entry = root.querySelector('.resident-letter-button'); await flush();
  assert.equal(root.hidden, false); assert.equal(note.hidden, false); assert.match(note.textContent, /有新朋友想搬进来.*莉莉/); assert.deepEqual(Array.from(env.G.state.residentNotices), ['lily']);
  root.querySelector('.resident-letter-dismiss').click(); assert.equal(note.hidden, true); assert.equal(env.document.activeElement, entry);
  env.G.bus.emit('state:change', env.G.state); await flush(); assert.equal(note.hidden, true);
  const restored = setup(JSON.parse(JSON.stringify(env.G.state))), restoredRoot = ui(restored); await flush(); assert.equal(restoredRoot.hidden, false); assert.equal(restoredRoot.querySelector('.resident-letter-note').hidden, true);
});
test('单人信封复用现有自我介绍选房事件，选择不直接写入住或改变居民ID', async () => {
  const env = setup(); ready(env); const received = []; env.G.bus.on('resident:invite_requested', event => received.push(event)); const root = ui(env); await flush();
  const before = JSON.stringify(env.G.state); root.querySelector('.resident-letter-button').click(); assert.deepEqual(JSON.parse(JSON.stringify(received)), [{ id: 'lily' }]); assert.equal(env.dialogs.length, 0); assert.equal(JSON.stringify(env.G.state), before); assert.equal(root.querySelector('.resident-letter-note').hidden, true);
});
test('引导、抽屉和已有弹窗期间不抢占，关闭后才送达一次', async () => {
  const env = setup(), bedroom = env.G.sys.building.buildRoom(0, 0, 'bedroom').roomId; env.G.sys.decorating.place('bed_basic', bedroom, 10, 80); const root = ui(env); await flush(); assert.equal(root.hidden, true); assert.equal(env.G.state.residentNotices.length, 0);
  env.panel.className = ''; env.G.store.update(state => { state.tutorial.done = true; state.tutorial.step = 10; }); await flush(); assert.equal(root.hidden, true); assert.equal(env.G.state.residentNotices.length, 0);
  env.panel.className = 'hidden'; const body = env.document.createElement('div'), handle = env.G.ui.modal({ title: '已有弹窗', content: body }); env.G.bus.emit('panel:change', {}); await flush(); assert.equal(root.hidden, true); assert.equal(env.G.state.residentNotices.length, 0);
  handle.close(); await flush(); assert.equal(root.hidden, false); assert.equal(root.querySelector('.resident-letter-note').hidden, false); assert.deepEqual(Array.from(env.G.state.residentNotices), ['lily']);
});
test('多位朋友使用既有角色头像先选一位，之后通过同一事件进入介绍', async () => {
  const env = setup(), bedroom = ready(env), G = env.G; G.store.update(state => { state.level = 6; state.wallet.coin = 10000; });
  for (let i = 0; i < 3; i++) { G.sys.economy.buy('chair_forest'); G.sys.decorating.place('chair_forest', bedroom, 80 + 40 * i, 90); }
  const received = []; G.bus.on('resident:invite_requested', event => received.push(event.id)); const root = ui(env); await flush(); root.querySelector('.resident-letter-button').click();
  const list = env.document.querySelector('.resident-letter-list'); assert.equal(list.querySelectorAll('.resident-letter-friend').length, 2); assert.equal(list.querySelectorAll('canvas').length, 2); assert.equal(received.length, 0); assert.match(list.textContent, /莉莉.*布丁/);
  list.querySelectorAll('button')[1].click(); assert.deepEqual(received, ['pudding']); assert.equal(env.document.querySelector('.modal-backdrop'), null);
});
test('资格失效时旧信封点击不发入住事件，已入住信封消失', async () => {
  const env = setup(), bedroom = ready(env), G = env.G, received = []; G.bus.on('resident:invite_requested', event => received.push(event.id)); const root = ui(env); await flush();
  const entry = root.querySelector('.resident-letter-button'), bed = G.state.house.rooms[bedroom].items.find(item => item.defId === 'bed_basic'); G.sys.decorating.remove(bedroom, bed.uid); entry.click(); await flush(); assert.equal(root.hidden, true); assert.equal(received.length, 0);
  G.sys.decorating.place('bed_basic', bedroom, 10, 80); await flush(); assert.equal(root.hidden, false); assert.equal(root.querySelector('.resident-letter-note').hidden, true); assert.ok(G.sys.residents.invite('lily', bedroom).ok); await flush(); assert.equal(root.hidden, true);
});
test('重复init不增加DOM、监听或定时器；换档清理当前来信弹窗', async () => {
  const env = setup(), bedroom = ready(env), G = env.G; G.store.update(state => { state.level = 6; state.wallet.coin = 10000; }); for (let i = 0; i < 3; i++) { G.sys.economy.buy('chair_forest'); G.sys.decorating.place('chair_forest', bedroom, 80 + i * 40, 90); }
  const root = ui(env), listeners = env.documentListeners.get('visibilitychange').length, intervals = env.intervals.length; G.ui.residentNotices.init(); G.ui.residentNotices.init(); assert.equal(env.world.querySelectorAll('.resident-letter').length, 1); assert.equal(env.documentListeners.get('visibilitychange').length, listeners); assert.equal(env.intervals.length, intervals);
  await flush(); root.querySelector('.resident-letter-button').click(); assert.ok(env.document.querySelector('.modal-backdrop')); G.store.replace(env.parse(G.state)); await flush(); assert.equal(env.document.querySelector('.modal-backdrop'), null); assert.equal(root.querySelector('.resident-letter-note').hidden, true);
});
(async () => { for (const entry of tests) { await entry.fn(); console.log('✓ ' + entry.name); } console.log('\n' + tests.length + ' 组新朋友来信UI检查通过。'); })().catch(error => { console.error(error); process.exitCode = 1; });
