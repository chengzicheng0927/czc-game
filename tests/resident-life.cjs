'use strict';
// 主线程串行执行；不启动服务、浏览器、后台循环或打包。
const assert = require('node:assert/strict'), { setup, home } = require('./fixtures/resident-life.cjs');
const tests = []; const test = (name, fn) => tests.push({ name, fn });
const plain = value => JSON.parse(JSON.stringify(value));
test('已有场景帧推进日常，包含停留动作/喜欢家具/概率串门；不写游戏存档', () => {
  const { G } = setup(), built = home(G), original = JSON.stringify(G.state), poses = new Set(); let visited = false, faded = false, favourite = false, previousVisit = 0;
  for (let now = 0; now <= 1800000; now += 500) {
    const actor = G.sys.residentLife.advance(now, { phase: 'day' })[0], internal = G.runtime.residentLife.actors.lily; poses.add(actor.pose);
    assert.ok(actor.x >= 42 && actor.x <= 278); assert.ok(actor.depth >= .25 && actor.depth <= .82); assert.ok(actor.alpha >= 0 && actor.alpha <= 1);
    if (internal.nextVisitAt !== previousVisit) { assert.ok(internal.nextVisitAt - G.runtime.residentLife.clock >= 30000); assert.ok(internal.nextVisitAt - G.runtime.residentLife.clock <= 90000); previousVisit = internal.nextVisitAt; }
    if (actor.roomId === built.living) visited = true;
    if (actor.alpha > 0 && actor.alpha < 1) faded = true;
    if (actor.pose === 'favorite') { assert.equal(actor.roomId, built.bedroom); assert.equal(actor.favoriteUid, built.favorite); favourite = true; }
  }
  for (const pose of ['pause', 'walk', 'sit', 'stretch', 'read', 'hop', 'depart', 'arrive']) assert.ok(poses.has(pose), '真实日常应出现' + pose);
  assert.ok(visited && faded && favourite); assert.equal(JSON.stringify(G.state), original);
});
test('夜间回自己卧室，取景只读与返回对象修改不影响运行时', () => {
  const { G } = setup(), built = home(G); G.sys.residentLife.advance(0, { phase: 'day' });
  let now = 0; while (now < 900000 && G.sys.residentLife.snapshot()[0].roomId === built.bedroom) { now += 500; G.sys.residentLife.advance(now, { phase: 'day' }); }
  assert.equal(G.sys.residentLife.snapshot()[0].roomId, built.living);
  const runtime = JSON.stringify(G.runtime.residentLife), state = JSON.stringify(G.state), night = G.sys.residentLife.snapshot({ phase: 'night' })[0]; assert.equal(night.roomId, built.bedroom); assert.equal(night.pose, 'sleep');
  night.x = 999; assert.equal(JSON.stringify(G.runtime.residentLife), runtime); assert.equal(JSON.stringify(G.state), state);
  const actual = G.sys.residentLife.advance(now + 100, { phase: 'night' })[0]; assert.equal(actual.roomId, built.bedroom); assert.equal(actual.pose, 'sleep');
  assert.equal(G.sys.residentLife.advance(now + 200, { phase: 'day' })[0].pose, 'pause');
});
test('减少动态与后台冻结日间动作，恢复不追赶离线串门', () => {
  const env = setup(), { G } = env; home(G); G.sys.residentLife.advance(0, { phase: 'day' }); G.sys.residentLife.advance(500, { phase: 'day' });
  const clock = G.runtime.residentLife.clock, position = plain(G.sys.residentLife.snapshot()[0]);
  for (let now = 1000; now <= 90000; now += 1000) assert.equal(G.sys.residentLife.advance(now, { phase: 'day', reducedMotion: true })[0].pose, 'pause');
  assert.equal(G.runtime.residentLife.clock, clock); assert.equal(G.sys.residentLife.snapshot()[0].x, position.x);
  env.document.hidden = true; G.sys.residentLife.advance(900000, { phase: 'day' }); assert.equal(G.runtime.residentLife.clock, clock);
  env.document.hidden = false; env.tickVisibility(); G.sys.residentLife.advance(1800000, { phase: 'day' }); assert.equal(G.runtime.residentLife.clock, clock);
});
test('访客目标房拆除、喜欢家具收回与换档后不留下无效房间/家具引用或新循环', () => {
  const env = setup(), { G } = env, built = home(G); let now = 0;
  while (now < 900000 && G.sys.residentLife.advance(now, { phase: 'day' })[0].roomId !== built.living) now += 500;
  assert.equal(G.sys.residentLife.snapshot()[0].roomId, built.living); assert.ok(G.sys.building.demolishRoom(built.living).ok);
  assert.equal(G.sys.residentLife.advance(now + 500, { phase: 'day' })[0].roomId, built.bedroom);
  assert.ok(G.sys.decorating.remove(built.bedroom, built.favorite).ok); for (let i = 0; i < 120; i++) assert.notEqual(G.sys.residentLife.advance(now + 1000 + i * 500, { phase: 'day' })[0].favoriteUid, built.favorite);
  const intervals = env.intervals.length, listeners = env.documentListeners.get('visibilitychange').length; G.sys.residentLife.init(); G.sys.residentLife.init(); assert.equal(env.intervals.length, intervals); assert.equal(env.documentListeners.get('visibilitychange').length, listeners);
  G.store.replace(env.parse(G.state)); assert.equal(Object.keys(G.runtime.residentLife.actors).length, 0); assert.equal(G.runtime.residentLife.clock, 0);
});
test('新朋友资格只读、送达去重、旧存档迁移和保存失败均保持正确边界', () => {
  const { G, parse } = setup(); assert.equal(G.sys.residentLife.notices().eligible.length, 0);
  const roomId = G.sys.building.buildRoom(0, 0, 'bedroom').roomId; G.sys.decorating.place('bed_basic', roomId, 10, 80); const before = JSON.stringify(G.state);
  assert.deepEqual(plain(G.sys.residentLife.notices()), { eligible: ['lily'], unseen: ['lily'] }); assert.equal(JSON.stringify(G.state), before);
  const update = G.store.update; G.store.update = () => { throw new Error('本机保存失败'); }; assert.equal(G.sys.residentLife.acknowledge(['lily']).ok, false); assert.equal(JSON.stringify(G.state), before); G.store.update = update;
  assert.deepEqual(plain(G.sys.residentLife.acknowledge(['lily', 'unknown', 'lily']).ids), ['lily']); const once = JSON.stringify(G.state); assert.equal(G.sys.residentLife.acknowledge(['lily']).ids.length, 0); assert.equal(JSON.stringify(G.state), once);
  const restored = setup(plain(G.state)); assert.deepEqual(plain(restored.G.sys.residentLife.notices()), { eligible: ['lily'], unseen: [] });
  const legacy = plain(G.state); delete legacy.residentNotices; assert.deepEqual(plain(G.store.validate(parse(legacy)).residentNotices), []);
  for (const value of [['lily', 'lily'], ['unknown'], 'lily']) { const invalid = plain(G.state); invalid.residentNotices = value; assert.throws(() => G.store.validate(parse(invalid))); }
  assert.ok(G.sys.residents.invite('lily', roomId).ok); assert.equal(G.sys.residentLife.notices().eligible.length, 0);
});
test('橘子真实偏好田园主题，日常喜欢家具和幸福度共同遵守该偏好', () => {
  const { G } = setup(); G.store.update(state => { state.level = 30; state.wallet.coin = 100000; });
  const bedroom = G.sys.building.buildRoom(0, 0, 'bedroom').roomId; G.sys.building.buildRoom(0, 1, 'studio'); G.sys.decorating.place('bed_basic', bedroom, 10, 80);
  for (let i = 0; i < 3; i++) { G.sys.economy.buy('chair_garden'); G.sys.decorating.place('chair_garden', bedroom, 170 + i * 32, 80); }
  assert.equal(G.data.residentById.orange.favoriteTheme, 'garden'); assert.ok(G.sys.residents.invite('orange', bedroom).ok); G.sys.residents.tick(); const gardenHappiness = G.state.residents.orange.happiness;
  assert.equal(G.sys.residentLife.favoriteItems('orange', bedroom).length, 3);
  G.store.update(state => { state.house.rooms[bedroom].items.filter(item => item.defId === 'chair_garden').forEach(item => { item.defId = 'chair_basic'; }); }); G.sys.residents.tick();
  assert.ok(G.state.residents.orange.happiness < gardenHappiness); assert.equal(G.sys.residentLife.favoriteItems('orange', bedroom).length, 0);
});
test('普通蛋糕8好感/偏好蛋糕20，生日各翻倍，失败与每天一次仍原子', () => {
  const { G } = setup(); home(G); const def = G.data.residentById.lily; def.birthday = '02-30'; G.store.update(state => { state.inventory.cake_strawberry = 4; });
  const normal = G.sys.residents.gift('lily'); assert.equal(normal.affection, 8); assert.equal(normal.favorite, false); const once = JSON.stringify(G.state); assert.equal(G.sys.residents.gift('lily').ok, false); assert.equal(JSON.stringify(G.state), once);
  def.favoriteGifts = ['cake_strawberry']; G.store.update(state => { state.residents.lily.giftDate = ''; }); const favorite = G.sys.residents.gift('lily'); assert.equal(favorite.affection, 20); assert.equal(favorite.favorite, true);
  def.birthday = G.utils.dateKey().slice(5); G.store.update(state => { state.residents.lily.giftDate = ''; }); assert.equal(G.sys.residents.gift('lily').affection, 40);
  def.favoriteGifts = []; G.store.update(state => { state.residents.lily.giftDate = ''; }); assert.equal(G.sys.residents.gift('lily').affection, 16); assert.equal(G.state.inventory.cake_strawberry, 0);
});
test('真实scene离屏取景复用访客快照，不推进AI或改命中/存档；无床夜间不躺悬空床', () => {
  const { G, load, surfaces, at } = setup(), built = home(G); let now = 0;
  while (now < 900000 && G.sys.residentLife.advance(now, { phase: 'day' })[0].roomId !== built.living) now += 500;
  assert.equal(G.sys.residentLife.snapshot()[0].roomId, built.living);
  ['js/render/room-space.js', 'js/render/room-shell.js', 'js/render/resident-extra.js', 'js/render/furniture-extra.js', 'js/render/scene.js'].forEach(load);
  const life = JSON.stringify(G.runtime.residentLife), state = JSON.stringify(G.state); G.render.captureScene({ scope: 'room', roomId: built.living }); G.render.captureScene({ scope: 'house' });
  assert.equal(JSON.stringify(G.runtime.residentLife), life); assert.equal(JSON.stringify(G.state), state); assert.ok(surfaces.every(canvas => canvas.context.depth === 0));
  const bed = G.state.house.rooms[built.bedroom].items.find(item => item.defId === 'bed_basic'); G.sys.decorating.remove(built.bedroom, bed.uid); at('2026-10-28', 22); G.render.captureScene({ scope: 'room', roomId: built.bedroom });
  assert.ok(surfaces.at(-1).context.calls.some(([name, args]) => name === 'fillText' && args[0] === 'z z z')); assert.ok(!surfaces.at(-1).context.calls.some(([name, args]) => name === 'rotate' && args[0] === -Math.PI / 2));
});
for (const entry of tests) { entry.fn(); console.log('✓ ' + entry.name); }
console.log('\n' + tests.length + ' 组居民日常与偏好检查通过。');
