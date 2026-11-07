'use strict';
// 真实sys/data + 合成内存存档和轻DOM，不启动服务/浏览器、不接触私人小屋。
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { setup } = require('./fixtures/content-dom.cjs');
const spaces = require('./fixtures/free-spaces.cjs');
const root = path.resolve(__dirname, '..'), plain = value => JSON.parse(JSON.stringify(value));
const tests = []; const test = (name, fn) => tests.push([name, fn]);
function harness() {
  const env = setup(), { G, document, panel } = env, proto = Object.getPrototypeOf(panel);
  proto.getAttribute = function (name) { return this.attributes[name] ?? null; };
  proto.matches = function (selector) {
    const attributes = [...selector.matchAll(/\[([^\]=]+)(?:=["']?([^\]"']*)["']?)?\]/g)];
    const simple = selector.replace(/\[[^\]]+\]/g, ''), tag = simple.match(/^[a-z]+/i), classes = [...simple.matchAll(/\.([\w-]+)/g)].map(match => match[1]);
    if (tag && this.tagName !== tag[0].toUpperCase()) return false;
    if (classes.some(name => !this.classList.contains(name))) return false;
    return attributes.every(([, name, expected]) => { const data = name.startsWith('data-') ? name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()) : null, value = data ? this.dataset[data] : this.attributes[name]; return value !== undefined && (expected === undefined || String(value) === expected); });
  };
  proto.contains = function (node) { while (node) { if (this === node) return true; node = node.parentElement; } return false; };
  proto.dispatch = function (name, input) { const event = Object.assign({ target: this, preventDefault() {} }, input); (this.listeners.get(name) || []).forEach(fn => fn(event)); };
  proto.scrollIntoView = function () {};
  document.querySelectorAll = selector => document.body.querySelectorAll(selector);
  ['js/data/progression.js', 'js/data/achievements.js', 'js/data/crafting.js', 'js/systems/crafting.js', 'js/systems/collection-book.js'].forEach(env.load);
  // 载入五个真实加工成品后再校验合成存档，不沿用402家具fixture作为产品数。
  G.store.replace(env.parse(G.state));
  const actions = [], navigation = [], calendars = [], drawings = [], rarity = [], modalOptions = [];
  G.ui.controls.select = (items, value, onChange) => {
    const node = document.createElement('button'); node.type = 'button'; node.items = items; node.value = value; node.dataset.cuteControl = 'select'; node.setAttribute('role', 'combobox');
    node.choose = value => { node.focus(); node.value = value; onChange(value); }; return node;
  };
  G.ui.controls.label = (control, text) => { const label = document.createElement('label'), copy = document.createElement('span'); label.className = 'ui-field'; copy.textContent = text; label.append(copy, control); return label; };
  G.ui.furnitureRarity = { decorate: (node, def, options) => rarity.push({ node, def, options }) };
  G.ui.garden = { drawCrop: (ctx, id, ...args) => drawings.push({ kind: 'crops', id, args }) };
  G.ui.calendar = { open: id => calendars.push(id) };
  G.render.drawThumbnail = (canvas, id) => drawings.push({ kind: 'furniture', canvas, id });
  G.render.drawCharacter = (canvas, id) => drawings.push({ kind: 'residents', canvas, id });
  G.render.drawAvatar = (canvas, look, options) => drawings.push({ kind: 'outfits', canvas, look: plain(look), options });
  const baseModal = G.ui.modal;
  G.ui.modal = options => { modalOptions.push(options); return baseModal(options); };
  const api = { doAction(result) { actions.push(plain(result)); if (result.ok) G.ui.refresh(); return result.ok; }, navigate: action => navigation.push(plain(action)) };
  env.load('js/ui/collection-book.js');
  function show() {
    const focused = document.activeElement, focusKey = focused?.dataset.uiFocus;
    const descriptor = G.ui.collectionBook.panel(api); panel.dataset.kind = 'collection'; panel.className = ''; panel.replaceChildren(descriptor.content);
    if (focused && !focused.isConnected) document.body.focus();
    if (focusKey) descriptor.content.querySelector('[data-ui-focus="' + focusKey + '"]')?.focus({ preventScroll: true });
    return descriptor;
  }
  G.ui.refresh = () => { const active = document.activeElement; if (panel.contains(active) && (active.tagName === 'INPUT' || active.dataset.cuteControl)) return; show(); };
  G.ui.open = (kind, options) => navigation.push({ open: kind, options: plain(options) });
  const key = name => panel.querySelector('[data-ui-focus="collection-' + name + '"]');
  const input = value => { const search = key('search'); search.focus(); search.value = value; search.dispatch('input'); return search; };
  const focus = options => { G.ui.collectionBook.focus(options); show(); };
  const cards = () => panel.querySelectorAll('.collection-entry');
  const detailBody = () => env.dialogs.at(-1).element.querySelector('.collection-detail');
  const go = () => detailBody().querySelector('button');
  const complete = id => G.store.update(state => G.sys.collectionBook.regularIds(id).forEach(itemId => { state.collection[itemId] = true; }));
  return { ...env, api, actions, navigation, calendars, drawings, rarity, modalOptions, show, key, input, focus, cards, detailBody, go, complete };
}

test('四类动态summary为407/12/12/60，含5加工成品且读取不写档', () => {
  const e = harness(), { G } = e, before = JSON.stringify(G.state), summary = G.sys.collectionBook.summary(); e.show(); e.frames();
  assert.deepEqual(plain(summary.map(item => [item.id, item.total])), [['furniture', 407], ['residents', 12], ['crops', 12], ['outfits', 60]]);
  for (const item of summary) {
    e.key('kind-' + item.id).click();
    const current = G.sys.collectionBook.summary().find(kind => kind.id === item.id), tab = e.key('kind-' + item.id);
    assert.equal(G.runtime.collectionBookV2.kind, current.id);
    assert.ok(e.panel.querySelector('.collection-overview-count').textContent.includes(current.done + ' / ' + current.total));
    assert.ok(tab.attributes['aria-label'].includes(current.done + ' / ' + current.total));
    assert.ok(tab.attributes['aria-label'].includes(current.percent + '%')); assert.equal(tab.getAttribute('aria-pressed'), 'true');
    for (const other of summary.filter(kind => kind.id !== current.id)) assert.equal(e.key('kind-' + other.id).getAttribute('aria-pressed'), 'false');
    assert.equal(e.document.activeElement, tab, '切换分类后仍可继续键盘操作');
  }
  e.focus({ kind: 'furniture', query: '' }); const seen = [];
  while (true) { seen.push(...e.cards().map(node => node.dataset.uiFocus)); if (e.key('page-next').disabled) break; e.key('page-next').click(); }
  assert.equal(seen.length, 407); assert.equal(new Set(seen).size, 407);
  for (const recipe of G.data.craftingRecipes) assert.ok(seen.includes('collection-entry-furniture-' + recipe.itemId));
  assert.equal(JSON.stringify(G.state), before);
});

test('未知四类条目只有问号/剪影，文本、aria、title和真名搜索不泄露', () => {
  const e = harness();
  for (const kind of ['furniture', 'residents', 'crops', 'outfits']) {
    const item = e.G.sys.collectionBook.list({ kind, status: 'missing' }).items[0]; assert.ok(item);
    e.focus({ kind, status: 'missing', query: '' }); const card = e.key('entry-' + kind + '-' + item.id); assert.ok(card.textContent.includes('？？？'));
    assert.ok(card.querySelector('canvas').classList.contains('is-undiscovered')); assert.equal(card.querySelector('canvas').attributes['aria-hidden'], 'true');
    card.click(); const modal = e.modalOptions.at(-1), detail = e.detailBody(); assert.equal(modal.title, '？？？ · 获取线索');
    for (const node of [card, ...card.querySelectorAll('*'), detail, ...detail.querySelectorAll('*')]) {
      assert.equal(node.textContent.includes(item.definition.name), false, kind + '文本不可泄露');
      assert.equal(String(node.attributes['aria-label'] || '').includes(item.definition.name), false); assert.equal(String(node.attributes.title || '').includes(item.definition.name), false);
    }
    e.dialogs.at(-1).close(); e.input(item.definition.name); assert.equal(e.cards().length, 0, kind + '未知真名不命中');
  }
  e.rarity.filter(entry => entry.node.classList.contains('is-missing')).forEach(entry => assert.equal(entry.options.discovered, false));
});

test('搜索仅委托sys.list暴露元数据，组合状态/主题/类别和24分页吻合', () => {
  const e = harness(), { G } = e; e.show();
  const search = e.input('家具商店'); assert.equal(e.document.activeElement, search); assert.equal(e.cards().length, 24);
  e.key('theme').choose('forest'); e.key('category').choose('bedroom'); e.key('status').choose('missing');
  const expected = G.sys.collectionBook.list({ kind: 'furniture', query: '家具商店', theme: 'forest', category: 'bedroom', status: 'missing' });
  assert.deepEqual(e.cards().map(node => node.dataset.uiFocus), Array.from(expected.items, item => 'collection-entry-furniture-' + item.id));
  assert.equal(e.document.activeElement, e.key('status'), '选择器回调局部刷新保留anchor');
  e.key('reset').click(); const ids = []; let pages = 0;
  do { const cards = e.cards(); assert.ok(cards.length <= 24); ids.push(...cards.map(node => node.dataset.uiFocus)); pages++; if (e.key('page-next').disabled) break; e.key('page-next').click(); } while (pages < 30);
  assert.equal(pages, 17); assert.equal(ids.length, 407); assert.equal(new Set(ids).size, 407); assert.equal(e.document.activeElement, e.key('page-number'), '末页落到页码而非禁用按钮');
  while (!e.key('page-previous').disabled) e.key('page-previous').click(); assert.equal(e.document.activeElement, e.key('page-number'));
});

test('空结果清除全部条件并回搜索焦点；全部已发现有独立空态', () => {
  const e = harness(); e.show(); e.key('theme').choose('forest'); e.key('category').choose('bedroom'); e.key('status').choose('collected'); e.input('不存在的小饼干');
  assert.equal(e.cards().length, 0); assert.match(e.panel.textContent, /没有符合条件/); e.key('empty-clear').click(); assert.equal(e.cards().length, 24); assert.equal(e.key('search').value, ''); assert.equal(e.document.activeElement, e.key('search'));
  assert.equal(e.key('theme').value, 'all'); assert.equal(e.key('category').value, 'all'); assert.equal(e.key('status').value, 'all');
  e.G.store.update(state => e.G.data.outfits.forEach(def => { state.avatar.owned[def.id] = true; })); e.focus({ kind: 'outfits', status: 'missing', query: '' }); assert.match(e.panel.textContent, /都点亮啦/);
});

test('历史发现与当前数量分开；收获卖完、家具送空、居民搬离仍点亮', () => {
  const e = harness(), { G } = e; G.store.update(state => { state.level = 30; state.garden.harvest.rose = 2; });
  assert.ok(G.sys.garden.sell('rose', 2).ok);
  const room = spaces.buildSpace(G, 0, 0, 'bedroom').roomId; assert.ok(spaces.placeItem(G, 'bed_basic', room, 10, 80).ok); assert.ok(G.sys.residents.invite('lily', room).ok); assert.ok(spaces.removeSpace(G, room).ok);
  // 准备合法的已搬离历史存档；自由拆墙本身不会清除朋友记录。
  G.store.update(state => { state.inventory.bed_basic = 0; state.residents.lily.movedIn = false; state.residents.lily.roomId = null; });
  for (const [kind, id] of [['crops', 'rose'], ['furniture', 'bed_basic'], ['residents', 'lily']]) {
    e.focus({ kind, status: 'collected', query: '' }); const card = e.key('entry-' + kind + '-' + id); assert.ok(card.classList.contains('is-collected')); assert.ok(card.textContent.includes('当前 0')); card.click();
    const text = e.detailBody().textContent; assert.match(text, /历史发现已发现/); assert.match(text, /现在用完或送出了/); assert.match(text, /当前.*0/); e.dialogs.at(-1).close();
  }
});

test('种子与生长中不能点亮收获图鉴', () => {
  const e = harness(), { G } = e; G.store.update(state => { state.level = 6; state.wallet.coin = 1000; }); assert.ok(G.sys.garden.buySeeds('tulip', 1).ok); assert.ok(G.sys.garden.plant(0, 'tulip').ok);
  e.focus({ kind: 'crops', status: 'collected' }); assert.equal(e.cards().length, 0); G.ui.collectionBook.openDetail('crops', 'tulip', e.api); assert.match(e.detailBody().textContent, /历史发现尚未发现/); assert.match(e.detailBody().textContent, /当前收获篮0 份/);
});

test('各来源导航完整转发系统action，日历沿用eventId', () => {
  const e = harness(), { G } = e, samples = []; G.runtime.avatarUI = { tab: 'presets' };
  for (const kind of ['furniture', 'residents', 'crops', 'outfits']) {
    const definitions = kind === 'furniture' ? G.data.furniture : kind === 'residents' ? G.data.residents : kind === 'crops' ? G.data.crops : G.data.outfits;
    const signatures = new Set();
    for (const def of definitions) { const item = G.sys.collectionBook.get(kind, def.id), signature = Object.keys(item.action).sort().join(',') + ':' + item.action.panel; if (!signatures.has(signature)) { signatures.add(signature); samples.push(item); } }
  }
  for (const recipe of G.data.craftingRecipes) samples.push(G.sys.collectionBook.get('furniture', recipe.itemId));
  for (const item of samples) { G.ui.collectionBook.openDetail(item.kind, item.id, e.api); const expected = plain(G.sys.collectionBook.get(item.kind, item.id).action); e.go().click(); if (expected.panel === 'calendar') assert.equal(e.calendars.at(-1), expected.eventId); else assert.deepEqual(e.navigation.at(-1), expected); }
  assert.ok(samples.some(item => item.action.shopTab === 'festival')); assert.ok(samples.some(item => item.action.milestoneId)); assert.ok(samples.some(item => item.action.achievementId)); assert.equal(new Set(samples.map(item => item.action.panel)).size, 7);
  const reward = G.data.outfits.find(def => def.rewardSources); G.store.update(state => { state.avatar.owned[reward.id] = true; }); G.runtime.avatarUI.tab = 'presets'; G.ui.collectionBook.openDetail('outfits', reward.id, e.api); e.go().click(); assert.deepEqual(e.navigation.at(-1), plain(G.sys.collectionBook.get('outfits', reward.id).action)); assert.equal(G.runtime.avatarUI.tab, 'clothes', '已拥有服饰来源进入衣橱而非预设');
  G.ui.collectionBook.openDetail('furniture', 'bed_basic'); e.go().click(); const last = e.navigation.at(-1); assert.equal(last.open, 'shop'); assert.deepEqual(last.options, plain(G.sys.collectionBook.get('furniture', 'bed_basic').action));
});

test('四类沿用原绘制API，服装试穿克隆外观且不修改玩家', () => {
  const e = harness(), before = JSON.stringify(e.G.state); for (const kind of ['furniture', 'residents', 'crops', 'outfits']) { e.focus({ kind, status: 'all', query: '' }); e.frames(); }
  for (const kind of ['furniture', 'residents', 'crops', 'outfits']) assert.ok(e.drawings.some(item => item.kind === kind));
  assert.equal(JSON.stringify(e.G.state), before); for (const item of e.rarity) assert.equal(item.options.discovered, e.G.sys.collectionBook.get('furniture', item.def.id).collected);
  const original = e.G.render.drawAvatar; e.G.render.drawAvatar = (canvas, look, options) => { assert.notEqual(look, e.G.state.avatar); assert.notEqual(look.acc, e.G.state.avatar.acc); look.acc.push('preview_only'); original(canvas, look, options); };
  for (const category of ['dress', 'top', 'bottom', 'shoes', 'acc']) { const def = e.G.data.outfits.find(item => item.category === category); e.G.ui.collectionBook.openDetail('outfits', def.id, e.api); e.frames(); e.dialogs.at(-1).close(); }
  assert.equal(JSON.stringify(e.G.state), before);
});

test('九主题各38常规历史，未齐查缺/可领/已领与独立手动单次奖励', () => {
  const e = harness(), { G } = e; e.show(); const themes = G.sys.collectionBook.themes(); assert.equal(themes.length, 9);
  themes.forEach(theme => { assert.equal(theme.total, 38); for (const id of G.sys.collectionBook.regularIds(theme.id)) { const def = G.data.furnitureById[id]; assert.ok(!def.rewardOnly && !def.festivalId && def.place !== 'yard' && def.source !== 'crafting'); } });
  const initialCoin = G.state.wallet.coin; assert.equal(e.key('theme-basic').textContent, '找找缺少的'); e.key('theme-basic').click(); assert.equal(e.key('theme').value, 'basic'); assert.equal(e.key('status').value, 'missing'); assert.equal(e.document.activeElement, e.key('theme'));
  e.complete('basic'); e.show(); assert.equal(G.state.wallet.coin, initialCoin); const action = e.key('theme-basic'), original = G.sys.collectionBook.claimTheme; let calls = 0;
  G.sys.collectionBook.claimTheme = id => { calls++; action.click(); return original(id); }; action.click();
  assert.equal(calls, 1); assert.equal(G.state.wallet.coin, initialCoin + 500); assert.deepEqual(plain(G.state.collectionBook.themeClaims), ['basic']); assert.ok(G.state.memories.at(-1).text.includes('套装徽章')); assert.equal(e.key('theme-basic').disabled, true); assert.equal(e.document.activeElement, e.key('theme-row-basic'));
  const after = JSON.stringify(G.state); action.click(); assert.equal(calls, 1); assert.equal(JSON.stringify(G.state), after);
  for (const theme of themes.slice(1)) { e.complete(theme.id); e.show(); e.key('theme-' + theme.id).click(); }
  assert.equal(G.state.collectionBook.themeClaims.length, 9); assert.equal(G.state.wallet.coin, initialCoin + 4500); assert.equal(e.panel.querySelector('.collection-badges').open, true);
});

test('领取规则失败/钱包上限/异常均可重试，UI只调用系统不伪造奖励', () => {
  const e = harness(), { G } = e; e.complete('basic'); e.show(); const original = G.sys.collectionBook.claimTheme, before = JSON.stringify(G.state); let calls = 0;
  G.sys.collectionBook.claimTheme = () => { calls++; return { ok: false, message: '合成失败，请重试' }; }; e.key('theme-basic').click(); assert.equal(calls, 1); assert.match(e.panel.querySelector('.collection-feedback').textContent, /合成失败/); assert.equal(JSON.stringify(G.state), before); assert.equal(e.document.activeElement, e.key('theme-basic')); assert.equal(e.key('theme-basic').disabled, false);
  G.sys.collectionBook.claimTheme = () => { throw new Error('同步异常'); }; e.key('theme-basic').click(); assert.match(e.panel.querySelector('.collection-feedback').textContent, /重试/); assert.equal(e.actions.at(-1).ok, false); assert.equal(JSON.stringify(G.state), before);
  G.sys.collectionBook.claimTheme = original; G.store.update(state => { state.wallet.coin = 1000000000; }); e.show(); e.key('theme-basic').click(); assert.match(e.panel.querySelector('.collection-feedback').textContent, /糖果罐/); assert.equal(G.state.collectionBook.themeClaims.length, 0);
  G.store.update(state => { state.wallet.coin = 10; }); e.show(); e.key('theme-basic').click(); assert.equal(G.state.wallet.coin, 510); assert.equal(G.state.collectionBook.themeClaims.length, 1);
});

test('普通store.update语义保持，不宣称新增同步拒写保证', () => {
  const e = harness(), { G } = e; e.complete('basic'); e.show(); const update = G.store.update; let options = 'not_called'; G.store.update = (fn, opts) => { options = opts; return update(fn, opts); };
  G.save.commit = () => { throw new Error('本UI不得主动调用同步提交'); }; e.key('theme-basic').click(); assert.equal(options, undefined); assert.equal(G.state.collectionBook.themeClaims.includes('basic'), true);
});

test('focus支持旧入口/五项条件并重置分页，非家具不被家具条件筛空', () => {
  const e = harness(); e.show(); e.key('page-next').click(); assert.equal(e.key('page-number').textContent, '2 / 17 页');
  e.focus({ kind: 'furniture', status: 'missing', query: '家具商店', theme: 'forest', category: 'bedroom' }); assert.equal(e.key('search').value, '家具商店'); assert.equal(e.key('theme').value, 'forest'); assert.equal(e.key('category').value, 'bedroom'); assert.equal(e.key('status').value, 'missing'); assert.ok(e.key('page-number').textContent.startsWith('1 /'));
  e.focus({ kind: 'outfits', status: 'owned', query: '' }); assert.equal(e.cards().length, 5); assert.equal(e.key('theme'), null); assert.equal(e.key('status').value, 'collected');
  e.focus({ kind: 'clothes', status: 'nonsense' }); assert.ok(e.key('kind-outfits').classList.contains('is-active'));
  e.focus({ kind: 'furniture', status: 'all', theme: 'unknown', category: 'unknown' }); assert.equal(e.key('theme').value, 'all'); assert.equal(e.key('category').value, 'all'); assert.equal(e.cards().length, 24);
});

test('共享自动重挂能恢复全部稳定焦点键，搜索/选择器编辑不重建', () => {
  const e = harness(); e.show(); const search = e.input('家具'); e.G.ui.refresh(); assert.equal(e.key('search'), search); assert.equal(e.document.activeElement, search);
  const picker = e.key('status'); picker.choose('all'); e.G.ui.refresh(); assert.equal(e.key('status'), picker);
  const collect = () => e.panel.querySelectorAll('*').filter(node => node.dataset.uiFocus);
  const keys = collect().map(node => node.dataset.uiFocus); assert.equal(new Set(keys).size, keys.length);
  for (const name of ['kind-furniture', 'status', 'theme', 'category', 'entry-furniture-bed_basic', 'page-next', 'badges', 'theme-basic']) {
    const previous = e.key(name); assert.ok(previous, name); previous.focus(); e.show(); assert.notEqual(e.key(name), previous); assert.equal(e.document.activeElement, e.key(name));
  }
});

test('换档重置运行态，旧卡片/主题/详情/筛选回调与待绘制均失效', () => {
  const e = harness(), { G } = e; e.complete('basic'); e.show(); e.key('page-next').click(); const oldNext = e.key('page-next'), oldKind = e.key('kind-outfits'), oldSelect = e.key('theme'), oldSearch = e.key('search'), oldClaim = e.key('theme-basic'), oldCard = e.cards()[0];
  oldCard.click(); const oldGo = e.go(), oldModal = e.dialogs.at(-1); const counts = e.drawings.length, nav = e.navigation.length;
  G.store.replace(e.parse(G.store.defaultState())); const before = JSON.stringify(G.state); assert.equal(oldModal.element.isConnected, false); oldClaim.click(); oldNext.click(); oldKind.click(); oldSelect.choose('forest'); oldSearch.value = 'old'; oldSearch.dispatch('input'); oldGo.click(); oldCard.click(); e.frames();
  assert.equal(JSON.stringify(G.state), before); assert.equal(e.drawings.length, counts); assert.equal(e.navigation.length, nav); assert.equal(G.runtime.collectionBookV2.kind, 'furniture'); assert.equal(G.runtime.collectionBookV2.query, ''); assert.equal(G.runtime.collectionBookV2.page, 1); assert.equal(G.runtime.collectionBookV2.badgesOpen, false);
  e.show(); assert.equal(e.key('search').value, ''); assert.equal(e.key('theme').value, 'all'); assert.equal(e.panel.querySelector('.collection-badges').open, false);
});

test('详情关闭恢复被共享重挂替换的条目焦点，只关闭自己创建的弹窗', () => {
  const e = harness(); e.show(); const id = 'entry-furniture-bed_basic'; e.key(id).click(); const modal = e.dialogs.at(-1); e.show(); modal.close(); assert.equal(e.document.activeElement, e.key(id));
  const other = e.G.ui.modal({ content: e.document.createElement('p') }); e.G.store.replace(e.parse(e.G.state)); assert.equal(other.element.isConnected, true);
});

test('原生筛选披露具名可达，重挂后保留筛选/展开/焦点且重置可恢复目录', () => {
  const e = harness(); e.show(); const before = JSON.stringify(e.G.state), filters = e.panel.querySelector('.collection-filter-box'), summary = e.key('filters');
  assert.equal(filters.tagName, 'DETAILS'); assert.equal(summary.tagName, 'SUMMARY'); assert.match(summary.textContent, /筛选收藏/);
  summary.focus(); assert.equal(e.document.activeElement, summary);
  filters.open = true; filters.dispatch('toggle');
  for (const [key, label] of [['status', '发现状态'], ['theme', '家具主题'], ['category', '家具类别']]) {
    const control = e.key(key); assert.equal(control.isConnected, true); assert.equal(control.getAttribute('aria-label'), label); assert.notEqual(control.disabled, true);
  }
  e.key('theme').choose('forest'); e.key('status').choose('missing'); e.input('家具商店');
  const expected = e.G.sys.collectionBook.list({ kind: 'furniture', theme: 'forest', status: 'missing', category: 'all', query: '家具商店' });
  assert.deepEqual(e.cards().map(node => node.dataset.uiFocus), Array.from(expected.items, item => 'collection-entry-furniture-' + item.id));
  e.show(); assert.equal(e.panel.querySelector('.collection-filter-box').open, true);
  assert.equal(e.key('theme').value, 'forest'); assert.equal(e.key('status').value, 'missing'); assert.equal(e.key('search').value, '家具商店');
  assert.equal(e.document.activeElement, e.key('search'));
  const reopened = e.panel.querySelector('.collection-filter-box'); reopened.open = false; reopened.dispatch('toggle'); e.show();
  assert.equal(e.panel.querySelector('.collection-filter-box').open, false); assert.equal(e.key('theme').value, 'forest');
  e.panel.querySelector('.collection-filter-box').open = true; e.panel.querySelector('.collection-filter-box').dispatch('toggle');
  e.key('reset').click(); assert.equal(e.key('theme').value, 'all'); assert.equal(e.key('status').value, 'all');
  assert.equal(e.key('search').value, ''); assert.equal(e.document.activeElement, e.key('search')); assert.equal(e.cards().length, 24);
  assert.equal(JSON.stringify(e.G.state), before);
});

test('当前纸面/柔色/主操作设计token的正文对比度至少4.5（非浏览器计算色证明）', () => {
  const css = fs.readFileSync(path.join(root, 'css/collection-book.css'), 'utf8');
  const token = name => { const match = css.match(new RegExp('--cb-' + name + ':#([a-f0-9]{6})', 'i')); assert.ok(match, name + '颜色token'); return match[1]; };
  const light = hex => { const values = hex.match(/../g).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4); return values[0] * .2126 + values[1] * .7152 + values[2] * .0722; };
  for (const [text, surface] of [[token('ink'), token('paper')], [token('muted'), token('paper')], [token('ink'), token('soft')], [token('muted'), token('soft')], [token('berry'), token('soft')], [token('paper'), token('berry')]]) {
    const values = [light(text), light(surface)].sort((a, b) => b - a); assert.ok((values[0] + .05) / (values[1] + .05) >= 4.5, text + '/' + surface);
  }
});

if (require.main === module) (async () => { for (const [name, fn] of tests) { await fn(); console.log('✓ ' + name); } console.log('\n' + tests.length + ' 组收藏图鉴视觉UI检查通过。'); })().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { harness };
