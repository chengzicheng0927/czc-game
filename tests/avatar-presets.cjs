'use strict';
// 预设形象与同屋防撞脸：数据合法、互不相同、只对新存档生效、不动已拥有衣物；名牌配色各端一致。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
function sandbox(extraFiles = []) {
  const context = vm.createContext({ console, Blob, URL, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, document: { addEventListener() {} } }); context.window = context;
  const files = ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/garden.js', 'js/data/calendar.js', 'js/data/outfits.js', 'js/core/utils.js', 'js/core/bus.js', 'js/building/schema.js', 'js/core/store.js', 'js/core/save.js', 'js/core/content-spaces.js', 'js/systems/systems.js', 'js/systems/avatar.js'].concat(extraFiles);
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  return context.Game;
}
let passed = 0; const test = (name, fn) => { fn(); passed++; console.log('✓ ' + name); };
const plain = v => JSON.parse(JSON.stringify(v));

test('8套预设全部通过存档校验，只用初始衣橱，指纹互不相同', () => {
  const G = sandbox(), D = G.data; assert.equal(D.avatarPresets.length, 8);
  const seen = new Set();
  for (const preset of D.avatarPresets) {
    const avatar = Object.assign(D.defaultAvatar(), D.avatarPresetLook(preset.id));
    assert.doesNotThrow(() => D.validateAvatar(avatar), preset.id);
    for (const id of [avatar.top, avatar.bottom, avatar.dress, avatar.shoes, ...avatar.acc].filter(Boolean)) assert.ok(D.avatarConfig.starterIds.includes(id), preset.id + ' 不得使用商店衣物：' + id);
    seen.add(D.avatarFingerprint(avatar));
  }
  assert.equal(seen.size, 8, '8套预设外观必须互不相同');
  assert.equal(D.avatarPresetLook('nope'), null);
});

test('新存档需要挑选；老存档、已开始引导、已挑过的都不会被打扰', () => {
  const G = sandbox(); G.store.init(); G.sys.init();
  assert.equal(G.sys.avatar.needsPreset(), true, '全新存档（出厂默认外观）需要挑选');
  G.store.update(s => { s.tutorial.step = 1; }); assert.equal(G.sys.avatar.needsPreset(), false, '引导已开始');
  G.store.update(s => { s.tutorial.step = 0; s.tutorial.done = true; }); assert.equal(G.sys.avatar.needsPreset(), false, '老存档（引导已完成）');
  G.store.update(s => { s.tutorial.done = false; }); assert.equal(G.sys.avatar.needsPreset(), true);
  G.sys.avatar.setHair('bob'); assert.equal(G.sys.avatar.needsPreset(), false, '外观已经改过，不是出厂默认');
});

test('应用预设：只改外观，保留已拥有衣物与搭配盒，并记下已挑选', () => {
  const G = sandbox(); G.store.init(); G.sys.init();
  G.store.update(s => { s.wallet.coin = 999; s.level = 12; });
  assert.equal(G.sys.avatar.buy('dress_daisy').ok || G.sys.avatar.buy('top_berry').ok, true);
  G.sys.avatar.saveOutfit(0, '我的搭配');
  const before = plain(G.sys.avatar.current());
  const result = G.sys.avatar.applyPreset('preset_bob'); assert.equal(result.ok, true);
  const after = plain(G.sys.avatar.current());
  assert.equal(after.hair, 'bob'); assert.equal(after.hairColor, '#8EBBA8'); assert.equal(after.skin, 1);
  assert.deepEqual(after.owned, before.owned, '已拥有的衣物一件不少'); assert.deepEqual(after.outfits, before.outfits, '搭配盒保持不变');
  assert.equal(G.state.tutorial.seenTips.avatar_preset, true); assert.equal(G.sys.avatar.needsPreset(), false);
  assert.equal(G.sys.avatar.applyPreset('missing').ok, false);
});

test('随机预选覆盖全部8套，且任意随机值都落在合法范围', () => {
  const G = sandbox(); const hit = new Set();
  for (let i = 0; i < 400; i++) hit.add(G.sys.avatar.randomPresetId(() => (i % 100) / 100));
  assert.equal(hit.size, 8); assert.ok(G.data.avatarPresetById[G.sys.avatar.randomPresetId(() => 0.999999)]); assert.ok(G.data.avatarPresetById[G.sys.avatar.randomPresetId(() => 0)]);
});

test('同屋防撞脸：相同形象互相标记，名牌配色按peerId排序、各端一致', () => {
  const G = sandbox(['js/render/live-labels.js']), D = G.data, same = Object.assign(D.defaultAvatar(), D.avatarPresetLook('preset_sunny')), other = Object.assign(D.defaultAvatar(), D.avatarPresetLook('preset_bob'));
  const peers = [{ id: 'p3', avatar: same }, { id: 'p1', avatar: same }, { id: 'p2', avatar: other }];
  const a = plain(G.liveAvatars.markers(peers)), b = plain(G.liveAvatars.markers(peers.slice().reverse()));
  assert.deepEqual(a, b, '顺序不同、结果必须一致');
  assert.equal(a.p1.twin, true); assert.equal(a.p3.twin, true); assert.equal(a.p2.twin, false);
  assert.notEqual(a.p1.tone[0], a.p3.tone[0]); assert.notEqual(a.p1.tone[0], a.p2.tone[0]);
  const eight = Array.from({ length: 8 }, (_, i) => ({ id: 'q' + i, avatar: same })), marks = plain(G.liveAvatars.markers(eight));
  assert.equal(new Set(Object.values(marks).map(m => m.tone[0])).size, 8, '8人同屋名牌两两不同色');
  assert.deepEqual(plain(G.liveAvatars.markers(null)), {});
});
test('hasConfigured准确识别是否设置过个人形象；未选预设且出厂默认视为未设置', () => {
  const G = sandbox(); G.store.init(); G.sys.init();
  assert.equal(G.sys.avatar.hasConfigured(), false, '初始状态尚未设置个人形象');
  G.sys.avatar.applyPreset('preset_curl');
  assert.equal(G.sys.avatar.hasConfigured(), true, '挑选预设后视为已设置');
  // 重置外观但保留已挑选标记
  G.store.update(s => { s.avatar = G.data.defaultAvatar(); s.tutorial.seenTips.avatar_preset = true; });
  assert.equal(G.sys.avatar.hasConfigured(), true, '记录过挑选预设视为已设置');
  // 未记录挑选标记但外观改动过
  G.store.update(s => { s.tutorial.seenTips.avatar_preset = false; });
  assert.equal(G.sys.avatar.hasConfigured(), false);
  G.sys.avatar.setSkin(2);
  assert.equal(G.sys.avatar.hasConfigured(), true, '外观非出厂默认视为已设置');
});

test('登录后流程：未设置形象时引导挑选预设，已设置过则不重复触发', () => {
  let modalOpened = false, modalOptions = null, panelClosed = false;
  const G = sandbox(['js/ui/cloud-account.js']);
  G.store.init(); G.sys.init();
  G.ui = G.ui || {};
  G.ui.panel = { close: () => { panelClosed = true; } };
  G.ui.avatar = {
    pickPreset: opts => { modalOpened = true; modalOptions = opts; },
    hasConfigured: () => G.sys.avatar.hasConfigured()
  };
  G.cloud = {
    status: () => ({ available: true, phase: 'ready', account: { id: 'user_1', username: 'test_child' }, binding: true })
  };
  // 此时未设置形象，调用 maybeGuideAvatarSetup 触发引导
  assert.equal(G.sys.avatar.hasConfigured(), false);
  const guided = G.ui.cloudAccount.maybeGuideAvatarSetup();
  assert.equal(guided, true, '未设置个人形象应触发引导');
  assert.equal(panelClosed, true, '自动关闭当前账号面板');
  // 模拟设置了形象
  G.sys.avatar.applyPreset('preset_sunny');
  assert.equal(G.sys.avatar.hasConfigured(), true);
  modalOpened = false;
  const guidedAgain = G.ui.cloudAccount.maybeGuideAvatarSetup();
  assert.equal(guidedAgain, false, '已设置形象后不再引导');
  assert.equal(modalOpened, false);
});

console.log(passed + ' 组形象预设与防撞脸检查通过');
