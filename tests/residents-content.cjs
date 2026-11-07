'use strict';
// 内容引用与手绘记录器检查；不需要浏览器、服务或外部素材。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
function sandbox() {
  const environment = vm.createContext({ console }); environment.window = environment;
  const read = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), environment, { filename: file });
  ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js'].forEach(read);
  const original = JSON.parse(JSON.stringify(environment.Game.data.residents));
  // 实际要求的依赖顺序：居民只延迟保存服装ID，outfits在其后加载。
  ['js/data/furniture-expansion.js', 'js/data/residents-expansion.js', 'js/data/outfits.js', 'js/data/garden.js', 'js/data/minigames.js', 'js/render/resident-extra.js'].forEach(read);
  return { G: environment.Game, original };
}
function drawingContext() {
  const calls = []; let depth = 0;
  const object = { calls, get depth() { return depth; } };
  for (const name of ['beginPath', 'moveTo', 'lineTo', 'ellipse', 'closePath', 'fill', 'stroke', 'bezierCurveTo', 'quadraticCurveTo', 'translate', 'scale', 'rotate']) object[name] = (...args) => {
    args.forEach(value => { if (typeof value === 'number') assert.ok(Number.isFinite(value), name + '必须使用有限坐标'); });
    if (name === 'ellipse') { assert.ok(args[2] >= 0); assert.ok(args[3] >= 0); }
    calls.push([name, ...args]);
  };
  object.save = () => { depth++; calls.push(['save']); };
  object.restore = () => { depth--; assert.ok(depth >= 0, 'Canvas不能多次restore'); calls.push(['restore']); };
  return new Proxy(object, { set(target, key, value) { target[key] = value; calls.push(['property', key, value]); return true; } });
}
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }
test('12位朋友的ID、名字、动物、生日和解锁等级与需求一致', () => {
  const { G } = sandbox();
  const expected = [
    ['lily', '莉莉', '小兔', '03-14', 1], ['pudding', '布丁', '小熊', '09-09', 6], ['orange', '橘子', '小狐狸', '10-18', 7], ['mianmian', '绵绵', '小羊', '01-20', 9], ['bobo', '波波', '小企鹅', '07-07', 11], ['xingxing', '星星', '小鹿', '05-05', 13], ['lizi', '栗子', '小松鼠', '11-11', 15], ['yuanyuan', '圆圆', '小熊猫', '08-08', 16], ['mimi', '咪露', '小猫', '02-22', 18], ['doudou', '豆豆', '小仓鼠', '04-01', 20], ['shirley', '雪莉', '小天鹅', '06-01', 22], ['rainbow', '彩虹', '独角兽', '12-25', 23]
  ];
  assert.equal(G.data.residents.length, 12);
  assert.deepEqual(Array.from(G.data.residents, resident => [resident.id, resident.name, resident.animal, resident.birthday, resident.unlockLv]), expected);
  G.data.residents.forEach(resident => assert.equal(G.data.residentById[resident.id], resident));
});
test('旧三位主要字段、11句台词和3条情绪不被扩充覆盖', () => {
  const { G, original } = sandbox();
  original.forEach(before => {
    const after = G.data.residentById[before.id];
    for (const key of ['id', 'name', 'animal', 'icon', 'color', 'accent', 'favoriteColor', 'favoriteTheme', 'unlockLv', 'birthday', 'requirement', 'intro', 'chats', 'emotions']) assert.deepEqual(JSON.parse(JSON.stringify(after[key])), before[key], before.id + '.' + key);
  });
});
test('每位居民有独立日常、3种情绪、生日台词与完整外形参数', () => {
  const { G } = sandbox(), birthdays = new Set();
  G.data.residents.forEach(resident => {
    assert.ok(resident.chats.length >= 10); assert.ok(new Set(resident.chats).size >= 10); assert.equal(resident.emotions.length, 3); assert.equal(new Set(resident.emotions).size, 3);
    assert.ok(resident.chats.concat(resident.emotions).every(text => typeof text === 'string' && text.trim().length > 5));
    assert.ok(resident.birthdayText.includes('生日')); birthdays.add(resident.birthdayText);
    assert.match(resident.appearance.body, /^#[0-9a-f]{6}$/i); assert.match(resident.appearance.accent, /^#[0-9a-f]{6}$/i); assert.ok(resident.appearance.earStyle); assert.ok(resident.appearance.tailStyle);
    assert.ok(resident.portraitHeight >= 94); assert.ok(resident.portraitWidth >= 75);
  });
  assert.equal(birthdays.size, 12);
});
test('96个具体心愿覆盖6种类型，家具/主题/作物/活动/服装均存在且普通家具可购买', () => {
  const { G } = sandbox(), wishIds = new Set(), games = new Set(G.data.minigames.map(game => game.id));
  G.data.residents.forEach(resident => {
    assert.ok(resident.wishes.length >= 8); const types = new Set();
    resident.wishes.forEach(wish => {
      assert.equal(wishIds.has(wish.id), false); wishIds.add(wish.id); types.add(wish.type);
      assert.ok(Number.isInteger(wish.target) && wish.target > 0); assert.ok(typeof wish.text === 'string' && wish.text.length > 8);
      if (wish.type === 'furniture') { const item = G.data.furnitureById[wish.itemId]; assert.ok(item, resident.id + '家具引用'); assert.equal(!!item.rewardOnly, false); assert.equal(item.currency, 'coin'); }
      else if (wish.type === 'theme') assert.ok(G.data.themes[wish.theme]);
      else if (wish.type === 'food') assert.ok(wish.itemId === 'cake_strawberry' || G.data.cropById[wish.cropId]);
      else if (wish.type === 'flower') assert.ok(G.data.cropById[wish.cropId]);
      else if (wish.type === 'activity') assert.ok(games.has(wish.gameId));
      else if (wish.type === 'outfit') assert.ok(G.data.outfitById[wish.outfitId]);
      else assert.fail('未知心愿类型');
    });
    assert.equal(types.size, 6);
  });
  assert.ok(wishIds.size >= 96);
});
test('结构化入住条件引用真实房间/主题，旧门槛与Lv23第4章彩虹条件保留', () => {
  const { G } = sandbox(), byId = G.data.residentById;
  G.data.residents.forEach(resident => {
    const admission = resident.admission; assert.equal(admission.unlockLv, resident.unlockLv); assert.equal(admission.roomType, 'bedroom');
    (admission.requiredRoomTypes || []).forEach(id => assert.ok(G.data.rooms.some(room => room.id === id), id));
    if (admission.theme) assert.ok(G.data.themes[admission.theme]); if (admission.houseTheme) assert.ok(G.data.themes[admission.houseTheme]);
  });
  assert.deepEqual(Array.from(byId.lily.admission.requiredTags), ['bed']); assert.equal(byId.pudding.admission.theme, 'forest'); assert.equal(byId.pudding.admission.themeCount, 3); assert.deepEqual(Array.from(byId.orange.admission.requiredRoomTypes), ['studio']);
  assert.deepEqual(Array.from(byId.bobo.admission.requiredHouseTags), ['bathtub']); assert.equal(byId.lizi.admission.minCollection, 60); assert.equal(byId.mimi.admission.theme, 'starry');
  assert.equal(byId.rainbow.admission.unlockLv, 23); assert.equal(byId.rainbow.admission.minChapter, 4); assert.equal(byId.doudou.favoriteTheme, 'basic');
});
test('5级好感奖励阈值、穿搭/专属家具/独立故事/相框徽章均可解析', () => {
  const { G } = sandbox(), stories = new Set(), badges = new Set();
  G.data.residents.forEach(resident => {
    const rewards = resident.friendshipRewards; assert.equal(rewards.length, 5);
    assert.deepEqual(Array.from(rewards, reward => reward.level), [1, 2, 3, 4, 5]); assert.deepEqual(Array.from(rewards, reward => reward.threshold), [0, 100, 300, 600, 1000]); assert.deepEqual(Array.from(rewards, reward => reward.kind), ['dialogue', 'outfit', 'furniture', 'story', 'badge']);
    assert.ok(G.data.outfitById[rewards[1].outfitId]); assert.equal(rewards[2].itemId, 'resident_' + resident.id + '_gift'); assert.ok(G.data.furnitureById[rewards[2].itemId]);
    assert.ok(rewards[3].title); assert.ok(rewards[3].lines.length >= 3); assert.equal(rewards[3].text, rewards[3].lines.join('\n')); stories.add(rewards[3].text);
    assert.ok(G.data.furnitureById[rewards[4].itemId]); assert.equal(rewards[4].badgeId, 'best_friend_' + resident.id); badges.add(rewards[4].badgeId);
  });
  assert.equal(stories.size, 12); assert.equal(badges.size, 12);
});
test('新增9种角色各有独立图形，有限坐标、正尺寸且Canvas状态不泄漏', () => {
  const { G } = sandbox(), signatures = new Set();
  G.data.residents.slice(3).forEach(resident => {
    const c = drawingContext(); assert.equal(G.draw.residentExtra(c, resident.id, 42, 100, .7, { time: 16, still: true }), true); assert.equal(c.depth, 0);
    assert.ok(c.calls.some(call => call[0] === 'fill')); assert.ok(c.calls.some(call => call[0] === 'stroke'));
    assert.equal(G.draw.residentExtra.height(resident.id), resident.portraitHeight); assert.equal(G.draw.residentExtra.width(resident.id), resident.portraitWidth); signatures.add(JSON.stringify(c.calls));
  });
  assert.equal(signatures.size, 9);
});
test('原三位/糯米保留原绘制；减少动态偏好稳定，开心/镜像姿态可绘', () => {
  const { G } = sandbox();
  for (const id of ['lily', 'pudding', 'orange', 'nuomi', 'missing']) { const c = drawingContext(); assert.equal(G.draw.residentExtra(c, id, 0, 0, 1), false); assert.equal(c.calls.length, 0); }
  const a = drawingContext(), b = drawingContext(); G.draw.residentExtra(a, 'rainbow', 0, 0, 1, { time: 1, reducedMotion: true }); G.draw.residentExtra(b, 'rainbow', 0, 0, 1, { time: 99, reducedMotion: true }); assert.deepEqual(a.calls, b.calls);
  const c = drawingContext(); G.draw.residentExtra(c, 'xingxing', 0, 0, 1, { time: 0, happy: true, facing: -1, still: true }); assert.equal(c.depth, 0); assert.ok(c.calls.some(call => call[0] === 'scale' && call[1] === -1 && call[2] === 1));
  assert.equal(G.draw.residentExtra.height('lily'), 112);
});
console.log('\n' + passed + ' 组居民内容与绘图验证通过。');
