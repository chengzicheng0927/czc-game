'use strict';
// 真实规则 + 轻DOM；不启动浏览器/服务，不读取用户存档，不冒充整页几何验收。
const assert = require('node:assert/strict');
const { setup } = require('./fixtures/content-dom.cjs');
const spaces = require('./fixtures/free-spaces.cjs');
const tests = []; const test = (name, fn) => tests.push({ name, fn });
function harness() {
  const env = setup(), { G, document, panel } = env;
  const proto = Object.getPrototypeOf(panel), originalMatches = proto.matches;
  proto.matches = function (selector) {
    if (selector.includes(' ')) { const parts = selector.split(' '), last = parts.pop(); if (!this.matches(last)) return false; let parent = this.parentElement; while (parent) { if (parent.matches(parts.join(' '))) return true; parent = parent.parentElement; } return false; }
    const data = selector.match(/^\[data-ui-focus="([^"]+)"\]$/); if (data) return this.dataset.uiFocus === data[1];
    return originalMatches.call(this, selector);
  };
  proto.getAttribute = function (key) { return this.attributes[key] ?? null; };
  proto.dispatch = function (type, values) { const event = Object.assign({ target: this, preventDefault() { this.prevented = true; } }, values); (this.listeners.get(type) || []).forEach(fn => fn(event)); return event; };
  document.querySelectorAll = selector => document.body.querySelectorAll(selector);
  const forwarded = [], outcomes = [], drawn = []; let currentModal = null;
  const baseModal = G.ui.modal;
  G.ui.modal = options => { currentModal?.close(); const handle = baseModal(options); currentModal = handle; return handle; };
  G.render.drawCharacter = (canvas, id) => drawn.push({ canvas, id });
  G.ui.controls.select = (options, value, onChange) => {
    const node = document.createElement('button'); node.dataset.cuteControl = 'select'; node.value = value; node.textContent = options.find(option => option.id === value)?.name || '';
    node.choose = id => { node.focus(); node.value = id; node.textContent = options.find(option => option.id === id)?.name || ''; onChange(id); }; return node;
  };
  const api = {
    roomName: id => '测试卧室 ' + id,
    chat: id => forwarded.push(['chat', id]), gift: id => forwarded.push(['gift', id]), invite: id => forwarded.push(['invite', id]),
    navigate: (wish, id) => forwarded.push(['navigate', wish.action.panel, id]),
    doAction(result) { outcomes.push(result); if (result.ok) G.ui.refresh(); return result.ok; }
  };
  function render() {
    const key = document.activeElement?.dataset.uiFocus;
    const result = G.ui.residentBook.panel(api); panel.replaceChildren(result.content);
    if (key) panel.querySelectorAll('*').find(node => node.dataset.uiFocus === key && !node.disabled)?.focus();
    return result;
  }
  // 模拟真实ui.refresh对焦点仍在自定义控件时跳过重绘的规则。
  G.ui.refresh = () => { if (!document.activeElement?.dataset.cuteControl) render(); };
  G.ui.open = name => { if (name === 'residents') render(); else forwarded.push(['open', name]); };
  env.load('js/ui/residents.js');
  const key = name => document.querySelectorAll('[data-ui-focus="resident-v2-' + name + '"]').at(-1) || null;
  const chooseFilter = value => key('filter').choose(value);
  const chooseFriend = value => key('picker').choose(value);
  const tab = value => key('tab-' + value).click();
  return Object.assign(env, { api, render, key, tab, chooseFilter, chooseFriend, forwarded, outcomes, drawn });
}
function prepare(env, type) {
  const { G } = env, def = G.data.residentById.lily;
  if (type) def.wishes = [def.wishes.find(wish => wish.type === type)];
  G.store.update(state => { state.level = 30; state.wallet.coin = 100000; state.tutorial.done = true; });
  if (type === 'food') assert.ok(spaces.buildSpace(G, 0, 1, 'kitchen').ok);
  const room = spaces.buildSpace(G, 0, 0, 'bedroom').roomId;
  assert.ok(spaces.placeItem(G, 'bed_basic', room, 10, 80).ok); assert.ok(G.sys.residents.invite('lily', room).ok); return room;
}
function complete(env, type, room) {
  const { G } = env, wish = G.sys.residents.wish('lily').definition;
  if (type === 'furniture' || type === 'theme') {
    const itemId = type === 'furniture' ? wish.itemId : 'chair_strawberry';
    for (let index = 0; index < (type === 'theme' ? 3 : 1); index++) { assert.ok(G.sys.economy.buy(itemId).ok); assert.ok(spaces.placeItem(G, itemId, room, 30 + index * 30, 80).ok); }
  } else if (type === 'food' || type === 'flower') G.store.update(state => { if (wish.cropId) state.garden.harvest[wish.cropId] = 1; else state.inventory[wish.itemId] = 1; });
  else if (type === 'activity') { const sessionId = G.sys.minigames.begin(wish.gameId); assert.ok(G.sys.minigames.finish(wish.gameId, { sessionId, score: 20, stars: 1 }).ok); }
  else { assert.ok(G.sys.avatar.equip('top_cloud').ok); assert.ok(G.sys.avatar.equip(wish.outfitId).ok); }
}
function inviteAll(env) {
  const { G } = env; G.store.update(state => { state.level = 30; state.wallet.coin = 1000000; state.quests.main.chapter = 4; state.inventory.bed_basic = 6; });
  const bedrooms = [];
  for (let index = 0; index < 6; index++) { const result = spaces.buildSpace(G, Math.floor(index / 3), index % 3, 'bedroom'); assert.ok(result.ok); bedrooms.push(result.roomId); assert.ok(spaces.placeItem(G, 'bed_basic', result.roomId, 5, 80).ok); }
  for (const [index, type] of ['studio', 'bathroom', 'wardrobe', 'music', 'game'].entries()) assert.ok(spaces.buildSpace(G, Math.floor((6 + index) / 3), (6 + index) % 3, type).ok);
  const bathroom = G.contentSpaces.list().find(room => G.contentSpaces.isType(room, 'bathroom')).id;
  function furnish(id, room, count = 1) { for (let index = 0; index < count; index++) { assert.ok(G.sys.economy.buy(id).ok); assert.ok(spaces.placeItem(G, id, room, 20 + index * 35, 80).ok); } }
  furnish('bathtub_basic', bathroom); ['forest', 'starry', 'oriental', 'princess'].forEach((theme, index) => furnish('chair_' + theme, bedrooms[index], 3));
  G.store.update(state => G.data.furniture.slice(0, 65).forEach(def => { state.collection[def.id] = true; }));
  for (const id of ['lily', 'pudding', 'mimi', ...G.data.residents.map(def => def.id).filter(id => !['lily', 'pudding', 'mimi'].includes(id))]) { const eligibility = G.sys.residents.eligibility(id); assert.ok(eligibility.ok, id); assert.ok(G.sys.residents.invite(id, eligibility.roomIds[0]).ok); }
}
test('12位真实动物档案、生日与头像；默认无入住，不写状态', () => {
  const env = harness(), before = JSON.stringify(env.G.state); const result = env.render(); env.chooseFilter('all'); env.tab('roster'); env.frames();
  const faces = env.panel.querySelectorAll('.rb-face'); assert.equal(faces.length, 12);
  assert.deepEqual(faces.map(node => node.querySelector('strong').textContent), Array.from(env.G.data.residents, def => def.name + ' · ' + def.animal));
  assert.ok(faces.every((node, index) => node.textContent.includes(env.G.data.residents[index].birthday.replace('-', '月') + '日')));
  for (const def of env.G.data.residents) { env.chooseFriend(def.id); const identity = env.panel.querySelector('.rb-identity'); assert.match(identity.textContent, new RegExp(def.name + '.*' + def.animal)); assert.ok(identity.textContent.includes(def.birthday.replace('-', '月') + '日')); }
  assert.equal(result.subtitle, '0 位住在这里 · 12 位朋友的温暖小册'); assert.equal(JSON.stringify(env.G.state), before);
  assert.ok(env.drawn.length >= 12); assert.ok(env.drawn.every(item => env.G.data.residentById[item.id] && item.canvas.attributes['aria-label'].includes(env.G.data.residentById[item.id].animal)));
});
test('选择控件聚焦后立即重绘详情、筛选与稳定焦点，直接focus保留接口', () => {
  const env = harness(); prepare(env); env.render(); env.chooseFilter('visitors'); assert.equal(env.panel.querySelectorAll('.rb-face').length, 11); assert.match(env.panel.querySelector('.rb-identity').textContent, /布丁/); assert.equal(env.document.activeElement, env.key('filter'));
  env.chooseFriend('mimi'); assert.match(env.panel.querySelector('.rb-identity').textContent, /咪露/); assert.equal(env.document.activeElement, env.key('picker'));
  env.G.ui.residentBook.focus('lily'); env.render(); assert.match(env.panel.querySelector('.rb-identity').textContent, /莉莉/); assert.ok(env.key('pat-lily'));
  env.G.ui.residentBook.focus('unknown'); env.render(); assert.match(env.panel.querySelector('.rb-identity').textContent, /莉莉/);
});
test('0/1/12入住与两种空态，资格缺项和可选卧室来自真实eligibility', () => {
  const env = harness(); env.render(); env.chooseFilter('home'); assert.match(env.panel.textContent, /还没有朋友入住/);
  env.chooseFilter('visitors'); env.chooseFriend('lily'); assert.equal(env.key('invite-lily').disabled, true); const missing = env.G.sys.residents.eligibility('lily').missing; missing.forEach(item => assert.ok(env.panel.textContent.includes(item.text)));
  const room = spaces.buildSpace(env.G, 0, 0, 'bedroom').roomId; spaces.placeItem(env.G, 'bed_basic', room, 10, 80); env.render(); assert.equal(env.key('invite-lily').disabled, false); assert.ok(env.panel.textContent.includes('已准备好 1 间可选卧室'));
  env.key('invite-lily').click(); assert.deepEqual(env.forwarded.pop(), ['invite', 'lily']);
  const full = harness(); inviteAll(full); assert.equal(full.render().subtitle, '12 位住在这里 · 12 位朋友的温暖小册'); full.chooseFilter('visitors'); assert.match(full.panel.textContent, /12位朋友都已入住/);
});
for (const [type, label] of [['furniture', '家具'], ['theme', '主题'], ['food', '点心'], ['flower', '花果'], ['activity', '活动'], ['outfit', '换装']]) test('真实' + label + '心愿未完成→待领→已领，四项奖励与重复点击', () => {
  const env = harness(), room = prepare(env, type); env.render(); const before = JSON.stringify(env.G.state);
  assert.equal(env.key('wish-lily').disabled, true); assert.match(env.panel.querySelector('.rb-wish').textContent, new RegExp(label + '心愿'));
  env.key('wish-go-lily').click(); assert.equal(env.forwarded.pop()[0], 'navigate'); assert.equal(JSON.stringify(env.G.state), before);
  if (['food', 'flower'].includes(type)) assert.match(env.panel.textContent, /库存还差 1 份/);
  complete(env, type, room); env.render(); const quote = env.G.sys.residents.wish('lily'), text = env.panel.querySelector('.rb-wish').textContent;
  for (const [name, value] of [['糖果', quote.reward.coin], ['爱心', quote.reward.heart], ['好感', quote.reward.affection], ['经验', quote.reward.exp]]) assert.ok(text.includes(name + ' +' + value));
  assert.equal(env.key('wish-lily').disabled, false); const claim = env.key('wish-lily'), wallet = Object.assign({}, env.G.state.wallet), affection = env.G.state.residents.lily.affection;
  claim.click(); assert.equal(env.G.state.wallet.coin, wallet.coin + quote.reward.coin); assert.equal(env.G.state.wallet.heart, wallet.heart + quote.reward.heart); assert.equal(env.G.state.residents.lily.affection, affection + quote.reward.affection);
  const claimed = JSON.stringify(env.G.state); claim.click(); assert.equal(JSON.stringify(env.G.state), claimed); assert.equal(env.key('wish-lily').disabled, true); assert.match(env.panel.textContent, /今日已收好/);
  if (['food', 'flower'].includes(type)) assert.equal(env.G.state.residents.lily.giftDate, '');
  env.frames(); assert.equal(env.document.activeElement, env.panel.querySelector('.rb-detail'));
});
test('日期锁定优先、无有效心愿有明确空态，刷新是纯读取', () => {
  const env = harness(); prepare(env, 'flower'); env.at('2026-10-29'); const before = JSON.stringify(env.G.state); env.render(); assert.match(env.panel.textContent, /日期暂不可用/); assert.equal(env.key('wish-lily').disabled, true); assert.equal(env.key('wish-go-lily'), null); assert.equal(JSON.stringify(env.G.state), before);
  const empty = harness(); const def = empty.G.data.residentById.lily; def.wishes = []; prepare(empty); empty.render(); assert.match(empty.panel.textContent, /朋友还在准备明天的小心愿/); assert.equal(empty.key('wish-lily').disabled, true);
});
test('聊天/送礼转发既有API；摸头与泡泡各走真实系统，次数跨日归零', () => {
  const env = harness(); prepare(env, 'flower'); env.G.store.update(state => { state.residents.lily.heartBubbles = 2; }); env.render();
  env.key('chat-lily').click(); env.key('gift-lily').click(); assert.deepEqual(env.forwarded, [['chat', 'lily'], ['gift', 'lily']]);
  const heart = env.G.state.wallet.heart, affection = env.G.state.residents.lily.affection; env.key('pat-lily').click(); assert.equal(env.G.state.wallet.heart, heart); assert.equal(env.G.state.residents.lily.affection, affection + 5);
  env.key('pat-lily').click(); env.key('pat-lily').click(); assert.equal(env.key('pat-lily').disabled, true); env.key('collect-lily').click(); assert.ok(env.G.state.wallet.heart > heart); assert.equal(env.G.state.residents.lily.heartBubbles, 0);
  env.at('2026-10-29'); env.render(); assert.match(env.key('pat-lily').textContent, /0\/3/); assert.equal(env.key('pat-lily').disabled, false);
});
test('好友五阶阈值与依序领取、隐藏正文，领取后重读不写存档', () => {
  const env = harness(); prepare(env, 'flower'); env.G.store.update(state => { state.residents.lily.affection = 1000; }); env.render(); env.tab('friendship');
  const def = env.G.data.residentById.lily; assert.equal(env.panel.querySelectorAll('.rb-friendship-step').length, 5); [0, 100, 300, 600, 1000].forEach(value => assert.ok(env.panel.textContent.includes('好感 ' + value)));
  assert.equal(env.panel.textContent.includes(def.friendshipRewards[0].text), false); def.friendshipRewards[3].lines.forEach(line => assert.equal(env.panel.textContent.includes(line), false));
  assert.equal(env.key('friendship-lily-1').disabled, false); assert.equal(env.key('friendship-lily-2').disabled, true);
  for (let level = 1; level <= 5; level++) {
    if (level === 2 || level === 5) env.G.ui.residentBook.friendship('lily', env.api);
    const node = env.key('friendship-lily-' + level); assert.equal(node.disabled, false); node.click();
    assert.deepEqual(Array.from(env.G.state.residents.lily.friendshipClaims), Array.from({ length: level }, (_, index) => index + 1));
    if (level === 1 || level === 4) { assert.ok(env.document.querySelector('.rb-story')); const before = JSON.stringify(env.G.state); env.key('story-back-lily').click(); env.key('friendship-lily-' + level).click(); assert.equal(JSON.stringify(env.G.state), before); env.key('story-back-lily').click(); }
  }
  assert.equal(env.G.state.residents.lily.bestFriendBadge, true); const last = JSON.stringify(env.G.state); env.key('friendship-lily-5').click(); assert.equal(JSON.stringify(env.G.state), last);
});
test('同步操作异常显示重试，未伪造成功，恢复后可完成', () => {
  const env = harness(), room = prepare(env, 'flower'); complete(env, 'flower', room); env.render(); const original = env.G.sys.residents.claimWish, before = JSON.stringify(env.G.state);
  env.G.sys.residents.claimWish = () => { throw new Error('合成拒写'); }; env.key('wish-lily').click(); assert.match(env.panel.querySelector('.rb-feedback').textContent, /合成拒写.*重试/); assert.equal(JSON.stringify(env.G.state), before); assert.equal(env.outcomes.at(-1).ok, false);
  env.G.sys.residents.claimWish = original; env.key('wish-lily').click(); assert.equal(env.G.state.residents.lily.wish.claimed, true);
});
test('主面板好友第2/3/5阶领取后保留可见详情焦点', () => {
  for (const target of [2, 3, 5]) {
    const env = harness(); prepare(env, 'flower'); env.G.store.update(state => { state.residents.lily.affection = 1000; });
    for (let level = 1; level < target; level++) assert.ok(env.G.sys.residents.claimFriendship('lily', level).ok);
    env.render(); env.tab('friendship'); const claim = env.key('friendship-lily-' + target); claim.focus(); claim.click(); env.frames();
    assert.equal(env.key('friendship-lily-' + target).disabled, true); assert.equal(env.document.activeElement, env.panel.querySelector('.rb-detail'));
  }
});
test('正常update不废弃当前按钮；换档后所有旧按钮/选择/弹窗失效', () => {
  const env = harness(); prepare(env, 'flower'); env.render(); const pat = env.key('pat-lily'); env.G.store.update(state => { state.wallet.coin++; }); pat.click(); assert.equal(env.G.state.residents.lily.patsToday, 1);
  const filter = env.key('filter'), tab = env.key('tab-roster'), oldPat = env.key('pat-lily'); env.G.ui.residentBook.friendship('lily', env.api); const oldClaim = env.key('friendship-lily-1');
  env.G.store.replace(env.parse(env.G.state)); const after = JSON.stringify(env.G.state); oldPat.click(); oldClaim.click(); tab.click(); filter.choose('all'); assert.equal(JSON.stringify(env.G.state), after); assert.equal(env.document.querySelector('.friendship-v2'), null); assert.equal(env.G.runtime.residentBookV2.tab, 'today');
});
test('本批委托普通送礼/入住确认弹层换档关闭，旧确认不能写新档', () => {
  for (const operation of ['gift', 'invite', 'chat']) {
    const env = harness(); prepare(env, 'flower'); env.render(); let submits = 0;
    env.api[operation] = () => { const content = env.document.createElement('div'), confirm = env.document.createElement('button'); confirm.textContent = '合成确认'; confirm.addEventListener('click', () => submits++); content.append(confirm); env.G.ui.modal({ content }); };
    if (operation === 'invite') { env.chooseFilter('visitors'); env.chooseFriend('orange'); env.G.sys.residents.eligibility = () => ({ ok: true, roomIds: ['isolated'], missing: [] }); env.render(); }
    env.key(operation + '-' + (operation === 'invite' ? 'orange' : 'lily')).click(); const confirmation = env.document.querySelector('.modal-backdrop').querySelector('button'); const modalFunction = env.G.ui.modal;
    env.G.store.replace(env.parse(env.G.state)); assert.equal(env.document.querySelector('.modal-backdrop'), null); confirmation.click(); assert.equal(submits, 0); assert.equal(env.G.ui.modal, modalFunction);
  }
});
test('标签键盘左右/Home/End与刷新焦点，详情具有稳定焦点标记', () => {
  const env = harness(); prepare(env); env.render(); const before = JSON.stringify(env.G.state);
  const first = env.key('tab-today'); first.focus(); assert.equal(first.dispatch('keydown', { key: 'ArrowRight' }).prevented, true); assert.equal(env.document.activeElement, env.key('tab-roster')); assert.equal(env.key('tab-roster').getAttribute('aria-selected'), 'true');
  env.key('tab-roster').dispatch('keydown', { key: 'End' }); assert.equal(env.document.activeElement, env.key('tab-friendship')); env.key('tab-friendship').dispatch('keydown', { key: 'Home' }); assert.equal(env.document.activeElement, env.key('tab-today'));
  const detail = env.panel.querySelector('.rb-detail'); detail.focus(); env.render(); assert.equal(env.document.activeElement, env.panel.querySelector('.rb-detail')); assert.equal(JSON.stringify(env.G.state), before);
});
test('名册选择、页签与详情保持可访问语义，真实1位入住不扩成样本人数', () => {
  const env = harness(); prepare(env, 'flower'); const before = JSON.stringify(env.G.state); env.render();
  assert.equal(env.key('filter').getAttribute('aria-label'), '按入住状态查看朋友');
  assert.equal(env.key('picker').getAttribute('aria-label'), '选择要陪伴的朋友');
  const faces = env.panel.querySelectorAll('.rb-face'); assert.equal(faces.length, 1);
  assert.equal(faces[0].getAttribute('aria-pressed'), 'true'); assert.match(faces[0].getAttribute('aria-label'), /莉莉.*已入住/);
  assert.equal(env.panel.querySelector('.rb-tabs').getAttribute('role'), 'tablist');
  for (const tab of ['today', 'roster', 'friendship']) {
    env.tab(tab); const control = env.key('tab-' + tab), detail = env.panel.querySelector('.rb-detail');
    assert.equal(control.getAttribute('role'), 'tab'); assert.equal(control.getAttribute('aria-selected'), 'true');
    assert.equal(control.getAttribute('aria-controls'), detail.id); assert.equal(detail.getAttribute('role'), 'tabpanel');
    assert.equal(detail.getAttribute('aria-labelledby'), control.id); assert.equal(detail.tabIndex, 0);
  }
  env.chooseFilter('all'); assert.equal(env.panel.querySelectorAll('.rb-face').length, 12);
  env.chooseFriend('mimi'); assert.ok(env.panel.textContent.includes(env.G.data.residentById.mimi.requirement));
  assert.equal(JSON.stringify(env.G.state), before, '选择与阅读不写存档');
});
test('单张头像与心愿插图绘制失败不阻断其他朋友、文字和真实心愿操作', () => {
  const roster = harness(); roster.render(); roster.chooseFilter('all');
  let first = true; const portraits = [];
  roster.G.render.drawCharacter = (canvas, id) => { portraits.push(id); if (first) { first = false; throw new Error('单张头像失败'); } };
  assert.doesNotThrow(() => roster.frames());
  for (const def of roster.G.data.residents) assert.ok(portraits.includes(def.id), def.id + '仍尝试绘制');
  assert.match(roster.panel.querySelector('.rb-identity').textContent, /莉莉/);
  for (const type of ['flower', 'furniture']) {
    const env = harness(), room = prepare(env, type), attempts = [];
    env.G.render.drawThumbnail = (canvas, id) => { attempts.push(id); throw new Error('心愿家具插图失败'); };
    env.G.ui.garden = { drawCrop(ctx, id) { attempts.push(id); throw new Error('心愿花果插图失败'); } };
    env.render(); const quote = env.G.sys.residents.wish('lily'); assert.doesNotThrow(() => env.frames());
    assert.ok(attempts.includes(quote.definition.cropId || quote.definition.itemId));
    assert.ok(env.panel.querySelector('.rb-wish').textContent.includes(quote.text));
    env.key('wish-go-lily').click(); assert.equal(env.forwarded.at(-1)[0], 'navigate');
    complete(env, type, room); env.render(); assert.doesNotThrow(() => env.frames());
    assert.equal(env.key('wish-lily').disabled, false); env.key('wish-lily').click();
    assert.equal(env.G.state.residents.lily.wish.claimed, true, '插图异常不改变真实领奖资格');
  }
});
test('换装心愿来源先进入衣橱页签，再转发真实目标动作且不写存档', () => {
  const env = harness(); prepare(env, 'outfit'); env.G.runtime.avatarUI = { tab: 'presets', category: 'dress', filter: 'owned' };
  env.render(); const quote = env.G.sys.residents.wish('lily'), before = JSON.stringify(env.G.state);
  assert.equal(quote.action.panel, 'avatar'); env.key('wish-go-lily').click();
  assert.equal(env.G.runtime.avatarUI.tab, 'clothes'); assert.deepEqual(env.forwarded.at(-1), ['navigate', 'avatar', 'lily']);
  assert.equal(JSON.stringify(env.G.state), before);
});
(async () => { for (const entry of tests) { await entry.fn(); console.log('✓ ' + entry.name); } console.log('\n' + tests.length + ' 组居民第二版UI隔离检查通过；390px实际布局待集成浏览器验收。'); })().catch(error => { console.error(error); process.exitCode = 1; });
