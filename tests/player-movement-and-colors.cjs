'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');

const files = [
  'js/core/namespace.js',
  'js/data/balance.js',
  'js/data/content.js',
  'js/data/garden.js',
  'js/core/utils.js',
  'js/core/bus.js',
  'js/core/store.js',
  'js/core/save.js',
  'js/systems/systems.js',
  'js/systems/exterior.js',
  'js/render/player-movement.js'
];

function sandbox() {
  const context = vm.createContext({
    console,
    Blob,
    URL,
    setTimeout: (fn) => setTimeout(fn, 16),
    clearTimeout,
    setInterval: () => 1,
    clearInterval() {},
    document: {
      addEventListener() {},
      removeEventListener() {},
      getElementById() { return null; },
      activeElement: null
    },
    performance: { now: () => Date.now() },
    requestAnimationFrame: fn => setTimeout(fn, 16),
    cancelAnimationFrame: id => clearTimeout(id)
  });
  context.window = context;
  context.addEventListener = () => {};
  context.removeEventListener = () => {};
  context.localStorage = { getItem() { return null; }, setItem() {} };

  for (const file of files) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  }

  const G = context.Game;
  G.store.init(G.save.load());
  G.sys.init();
  return G;
}

const G = sandbox();

// 1. 测试小岛边界检测
console.log('测试小岛与花园边界检测...');
assert.ok(G.playerMovement.isWalkable(-0.6, 2.5), '主岛前院中央应可行走');
assert.ok(G.playerMovement.isWalkable(-4.3, 3.4), '左侧草坪延伸岛应可行走');
assert.ok(G.playerMovement.isWalkable(4.3, 3.4), '右侧草坪延伸岛应可行走');
assert.ok(G.playerMovement.isWalkable(6.5, 3.2), '通往花园岛的木桥应可行走');
assert.ok(G.playerMovement.isWalkable(10.0, 3.36), '花园小岛中央应可行走');
assert.ok(G.playerMovement.isWalkable(11.2, 4.0), '花园农田附近应可行走');

// 测试小岛外阻挡（绝对不能走出小岛）
assert.ok(!G.playerMovement.isWalkable(15.0, 3.36), '花园岛外悬崖(15, 3.36)必须被阻挡');
assert.ok(!G.playerMovement.isWalkable(-12.0, 3.0), '左侧悬崖外部必须被阻挡');
assert.ok(!G.playerMovement.isWalkable(0, 8.5), '正前方悬崖外部必须被阻挡');
assert.ok(!G.playerMovement.isWalkable(0, -2.5), '房屋后墙深处必须被阻挡');
assert.ok(!G.playerMovement.isWalkable(3.0, -1.5), '房屋后墙必须被阻挡');

// 2. 测试主角院子位移 API
console.log('测试主角在院子走动...');
G.playerMovement.toYard(-1.5, 3.0);
assert.equal(G.runtime.player.zone, 'yard');
assert.equal(G.runtime.player.x, -1.5);
assert.equal(G.runtime.player.z, 3.0);

// 测试走到花园岛
G.playerMovement.toYard(10.0, 3.36);
assert.equal(G.runtime.player.zone, 'yard');
assert.equal(G.runtime.player.x, 10.0);
assert.equal(G.runtime.player.z, 3.36);

// 非法坐标传入时应自动兜底到默认安全位置
G.playerMovement.toYard(99.0, 99.0);
assert.equal(G.runtime.player.x, -2.2);
assert.equal(G.runtime.player.z, 3.25);

// 3. 测试进入房间 API
console.log('测试小人进入房间...');
const testRoom = G.sys.building.buildRoom(0, 0, 'bedroom');
assert.ok(testRoom.ok, '建造测试卧室');
const enterResult = G.playerMovement.enterRoom(testRoom.roomId);
assert.strictEqual(enterResult, true, '进入房间应该成功');
assert.strictEqual(G.runtime.player.zone, testRoom.roomId, '主角区域应为测试房间');
assert.strictEqual(G.runtime.activeRoomId, testRoom.roomId, '当前激活房间应同步');

// 3. 测试屋顶颜色切换
console.log('测试屋顶颜色与外墙颜色切换...');
const roofRes = G.sys.exterior.color('roof', '#E98982');
assert.strictEqual(roofRes.ok, true, '切换屋顶颜色应成功');
assert.strictEqual(G.state.house.exterior.roofColor, '#E98982', '屋顶颜色应更新为 #E98982');

const wallRes = G.sys.exterior.color('wall', '#FFF8F0');
assert.strictEqual(wallRes.ok, true, '切换外墙颜色应成功');
assert.strictEqual(G.state.house.exterior.wallColor, '#FFF8F0', '外墙颜色应更新为 #FFF8F0');

// 5. 测试房间墙纸更换
console.log('测试房间墙纸更换...');
const wallResult = G.sys.decorating.wallpaper(testRoom.roomId, 'dots', '#FFE0E9', '#FFFFFF');
assert.strictEqual(wallResult.ok, true, '更换墙纸应成功');
assert.strictEqual(G.state.house.rooms[testRoom.roomId].wallpaper.color, '#FFE0E9');
assert.strictEqual(G.state.house.rooms[testRoom.roomId].wallpaper.pattern, 'dots');

console.log('✓ 玩家院子走动、小岛边界阻挡、屋顶颜色与墙纸切换全部验证通过！');
