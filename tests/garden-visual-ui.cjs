'use strict';
// 合成小屋 + 轻DOM；加载正式规则，不读取浏览器、本机账号或真实存档。
const assert = require('node:assert/strict');
const { setup } = require('./fixtures/resident-life.cjs');
const plain = value => JSON.parse(JSON.stringify(value));
let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

function fixture(level = 18) {
  const env = setup(), { G, document } = env;
  const proto = Object.getPrototypeOf(document.body), originalClassList = Object.getOwnPropertyDescriptor(proto, 'classList').get;
  Object.defineProperty(proto, 'classList', { configurable: true, get() { const list = originalClassList.call(this); list.toggle = (name, force) => { const value = force === undefined ? !list.contains(name) : !!force; if (value) list.add(name); else list.remove(name); return value; }; return list; } });
  proto.getAttribute = function (name) { return this.attributes[name] === undefined ? null : this.attributes[name]; };
  proto.removeAttribute = function (name) { delete this.attributes[name]; };
  proto.contains = function (node) { while (node) { if (node === this) return true; node = node.parentElement; } return false; };
  proto.scrollIntoView = function () {};
  proto.matches = function (selector) {
    selector = selector.trim();
    const attribute = selector.match(/\[([^\]=]+)(?:=["']?([^\]"']*)["']?)?\]/);
    const simple = selector.replace(/\[[^\]]+\]/g, '');
    const tag = simple.match(/^[a-z]+/i), id = simple.match(/#([\w-]+)/), classes = [...simple.matchAll(/\.([\w-]+)/g)].map(match => match[1]);
    if (tag && this.tagName !== tag[0].toUpperCase()) return false;
    if (id && this.id !== id[1]) return false;
    if (classes.some(name => !this.classList.contains(name))) return false;
    if (attribute) {
      const name = attribute[1], key = name.startsWith('data-') ? name.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase()) : null;
      const value = key ? this.dataset[key] : this.attributes[name];
      if (value === undefined || attribute[2] !== undefined && String(value) !== attribute[2]) return false;
    }
    return true;
  };
  proto.querySelectorAll = function (selector) {
    const all = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]);
    const matchesPath = (node, parts) => { if (!node.matches(parts.pop())) return false; while (parts.length) { const wanted = parts.pop(); node = node.parentElement; while (node && !node.matches(wanted)) node = node.parentElement; if (!node) return false; } return true; };
    return all.filter(node => selector.split(',').some(part => matchesPath(node, part.trim().split(/\s+/))));
  };
  G.store.update(state => { state.level = level; state.wallet.coin = 10000; state.garden.seeds = Object.fromEntries(G.data.crops.map(crop => [crop.id, 3])); });
  const navigation = [], confirmations = [], sounds = [];
  G.ui.audio = { play: name => sounds.push(name) };
  G.ui.confirm = (text, options) => new Promise(resolve => confirmations.push({ text, options, resolve }));
  // 送居民仍使用其正式选择接口；播种只通过下方实际图卡/radiogroup操作，不造假下拉。
  G.ui.controls.select = (items, value, onChange) => { const node = document.createElement('button'); node.value = value; node.items = items; node.setAttribute('role', 'combobox'); node.choose = value => { node.value = value; onChange?.(value); }; return node; };
  G.ui.controls.label = (control, text) => { const node = document.createElement('label'), copy = document.createElement('span'); node.className = 'ui-field'; copy.textContent = text; node.append(copy, control); return node; };
  let descriptor;
  const show = () => {
    // 共享renderCurrent先记键、重挂面板，再找新节点恢复焦点。
    const focusKey = document.activeElement?.dataset.uiFocus;
    descriptor = G.ui.garden.panel(); env.panel.dataset.kind = 'garden'; env.panel.className = ''; env.panel.replaceChildren(descriptor.content);
    if (document.activeElement && !document.activeElement.isConnected) document.body.focus();
    env.frames();
    if (focusKey) descriptor.content.querySelector('[data-ui-focus="' + focusKey + '"]')?.focus({ preventScroll: true });
    return descriptor.content;
  };
  G.ui.refresh = show;
  G.ui.open = (kind, input) => { navigation.push({ kind, input }); if (kind === 'garden') show(); };
  env.load('js/ui/garden.js');
  const root = () => descriptor.content;
  const control = (pattern, scope = root()) => scope.querySelectorAll('button').find(node => typeof pattern === 'string' ? node.textContent === pattern : pattern.test(node.textContent));
  const tab = name => { const node = control(name, root().querySelector('.garden-tabs')); assert.ok(node, '存在分页：' + name); node.click(); };
  const plots = () => root().querySelectorAll('[data-garden-plot]');
  const select = index => { const node = plots().find(node => Number(node.dataset.gardenPlot) === index); assert.ok(node); node.querySelector('.garden-v2-select').click(); return node; };
  const detail = () => root().querySelector('.garden-v2-detail');
  const seedCards = (scope = detail()) => scope.querySelectorAll('.garden-seed-card');
  const seedCard = (id, scope = detail()) => { const node = seedCards(scope).find(card => card.dataset.cropId === id); assert.ok(node, '存在真实作物图卡：' + id); return node; };
  const chooseSeed = (id, scope = detail()) => seedCard(id, scope).click();
  const selectedSeed = (scope = detail()) => seedCards(scope).find(card => card.getAttribute('aria-checked') === 'true')?.dataset.cropId;
  const tick = () => env.intervals.forEach(fn => fn());
  const input = (node, value) => { node.value = String(value); (node.listeners.get('input') || []).forEach(fn => fn({ target: node })); (node.listeners.get('change') || []).forEach(fn => fn({ target: node })); };
  const cropRow = id => root().querySelectorAll('.garden-crop').find(node => node.dataset.cropId === id || node.textContent.includes(G.data.cropById[id].name));
  return { ...env, navigation, confirmations, sounds, show, root, control, tab, plots, select, detail, seedCards, seedCard, chooseSeed, selectedSeed, tick, input, cropRow };
}

function planted(G, stage, cropId = 'daisy') {
  const now = G.state.profile.createdAt, crop = G.data.cropById[cropId];
  return { crop: cropId, plantedAt: now - (stage === 3 ? crop.growMs + 1 : Math.floor(crop.growMs / 3) * stage + 1), durationMs: crop.growMs, watered: [null, null, null] };
}

test('真实等级只显示六格或九格，Lv5不能播种', () => {
  const locked = fixture(5); locked.show(); assert.equal(locked.plots().length, 0); assert.match(locked.root().textContent, /Lv\.?6/);
  const six = fixture(6); six.show(); assert.equal(six.plots().length, 6); assert.match(six.root().textContent, /14/);
  const nine = fixture(14); nine.show(); assert.equal(nine.plots().length, 9); assert.equal(nine.G.state.garden.plots.length, 9);
});

test('点击花圃详情区分空地和四个真实生长阶段，选择不修改存档', () => {
  const env = fixture(), { G } = env;
  G.store.update(state => { state.garden.plots[0] = null; for (let stage = 0; stage < 4; stage++) state.garden.plots[stage + 1] = planted(G, stage); });
  env.show(); const before = JSON.stringify(G.state);
  env.select(0); assert.match(env.detail().textContent, /空地|种子/);
  for (let stage = 0; stage < 4; stage++) { env.select(stage + 1); assert.equal(env.detail().querySelector('[aria-current="step"]').textContent, G.data.gardenConfig.stageNames[stage]); assert.equal(G.runtime.gardenVisual.selectedPlot, stage + 1); assert.match(env.detail().querySelector('.garden-v2-planted').textContent, /播种于/); assert.match(env.detail().querySelector('.garden-v2-arrival').textContent, /预计成熟/); }
  assert.equal(JSON.stringify(G.state), before);
});

test('每秒读数与自然成熟不写档，保留焦点和数量控件', () => {
  const env = fixture(), { G } = env;
  G.store.update(state => { state.garden.plots[0] = planted(G, 0); }); env.show(); env.select(0);
  const focus = env.plots()[0].querySelector('.garden-v2-select'); focus.focus(); const before = JSON.stringify(G.state); env.tick();
  assert.equal(env.document.activeElement, focus); assert.equal(JSON.stringify(G.state), before);
  env.at('2026-10-28', 13); env.tick(); assert.match(env.detail().textContent, /成熟/); assert.equal(JSON.stringify(G.state), before);
  env.tab('种子铺'); const quantity = env.root().querySelector('input'); assert.ok(quantity); env.input(quantity, 7); quantity.focus(); env.tick(); assert.equal(quantity.value, '7'); assert.equal(env.document.activeElement, quantity);
});

test('共享面板重挂能按稳定键找回控件，详情自然成熟时保留操作焦点', () => {
  const env = fixture(), { G } = env; G.store.update(state => { state.garden.plots[0] = planted(G, 0); }); env.show();
  const plotControls = () => [
    ...env.root().querySelector('.garden-tabs').querySelectorAll('button'),
    ...env.root().querySelectorAll('.garden-v2-select'),
    ...env.root().querySelectorAll('.garden-plot-action'),
    env.detail().querySelector('button')
  ];
  function verifyRebuild(nodes, focused) {
    const identities = nodes.map(node => { assert.ok(node.dataset.uiFocus, '控件提供共享renderer的焦点键'); return { key: node.dataset.uiFocus, tag: node.tagName, text: node.textContent }; });
    assert.equal(new Set(identities.map(item => item.key)).size, identities.length, '同屏焦点键唯一');
    focused.focus(); const focusKey = env.document.activeElement.dataset.uiFocus;
    env.show();
    identities.forEach(item => { const replacement = env.root().querySelector('[data-ui-focus="' + item.key + '"]'); assert.ok(replacement, item.key + '重挂后可定位'); assert.equal(replacement.tagName, item.tag); assert.equal(replacement.textContent, item.text); });
    // 与共享renderCurrent相同的公共契约：重挂后用data-ui-focus查找新控件。
    const replacement = env.root().querySelector('[data-ui-focus="' + focusKey + '"]'); replacement.focus({ preventScroll: true }); assert.equal(env.document.activeElement, replacement); assert.notEqual(replacement, focused); assert.equal(replacement.isConnected, true);
  }
  verifyRebuild(plotControls(), env.plots()[2].querySelector('.garden-v2-select'));
  env.tab('种子铺');
  const catalogControls = [...env.root().querySelector('.garden-tabs').querySelectorAll('button'), ...env.root().querySelectorAll('input'), ...env.root().querySelectorAll('button').filter(node => node.dataset.uiFocus?.startsWith('garden-stock-action-'))];
  assert.equal(env.root().querySelectorAll('input').length, 12); assert.equal(catalogControls.filter(node => node.dataset.uiFocus?.startsWith('garden-stock-action-')).length, 12);
  verifyRebuild(catalogControls, env.root().querySelector('input'));
  env.tab('我的花圃'); const action = env.detail().querySelector('button'); assert.match(action.textContent, /浇/); action.focus(); const key = action.dataset.uiFocus, before = JSON.stringify(G.state);
  env.at('2026-10-28', 13); env.tick();
  const matureAction = env.detail().querySelector('[data-ui-focus="' + key + '"]'); assert.notEqual(matureAction, action); assert.match(matureAction.textContent, /收获/); assert.equal(env.document.activeElement, matureAction); assert.equal(matureAction.isConnected, true); assert.equal(JSON.stringify(G.state), before);
});

test('空地详情选郁金香后买一粒，重挂保留所选种子与购买焦点并真正种郁金香', () => {
  const env = fixture(), { G } = env; G.store.update(state => { state.garden.seeds.tulip = 0; }); env.show();
  const choosingBefore = JSON.stringify(G.state); env.chooseSeed('tulip'); assert.equal(JSON.stringify(G.state), choosingBefore, '选种只保存在运行时');
  const oldPicker = env.seedCard('tulip'), oldPlant = env.control(/先买一粒种子|种下种子/, env.detail()), oldBuy = env.control(/^买 1 粒/, env.detail()); assert.equal(oldPlant.disabled, true);
  const before = G.state.garden.seeds.tulip, coin = G.state.wallet.coin; oldBuy.focus(); oldBuy.click();
  assert.equal(G.state.garden.seeds.tulip, before + 1); assert.equal(G.state.wallet.coin, coin - G.data.cropById.tulip.seedPrice);
  assert.equal(env.selectedSeed(), 'tulip', '买种后的同一花圃仍选中郁金香');
  const newBuy = env.control(/^买 1 粒/, env.detail()), newPlant = env.control('种下种子', env.detail());
  assert.equal(newPlant.disabled, false, '买到一粒后才允许播种');
  assert.notEqual(newBuy, oldBuy); [oldPicker, oldPlant, oldBuy].forEach(node => assert.ok(node.dataset.uiFocus));
  assert.equal(env.seedCard('tulip').dataset.uiFocus, oldPicker.dataset.uiFocus); assert.equal(newPlant.dataset.uiFocus, oldPlant.dataset.uiFocus); assert.equal(newBuy.dataset.uiFocus, oldBuy.dataset.uiFocus); assert.equal(env.document.activeElement, newBuy); assert.equal(newBuy.isConnected, true);
  const beforeStale = JSON.stringify(G.state); oldPlant.click(); assert.equal(JSON.stringify(G.state), beforeStale, '重挂前旧表单不能播种');
  env.control('种下种子', env.detail()).click(); assert.equal(G.state.garden.plots[0].crop, 'tulip'); assert.equal(G.state.garden.seeds.tulip, before); assert.equal(G.state.garden.seeds.daisy, 3);
});

test('空地种子选择只属于当前地块，切地块、换档和已有作物后清理选择', () => {
  const env = fixture(), { G } = env; env.show();
  env.chooseSeed('tulip'); env.show(); assert.equal(env.selectedSeed(), 'tulip');
  env.select(1); assert.equal(env.selectedSeed(), 'daisy', '切至别的空地不带入旧选择');
  env.select(0); assert.equal(env.selectedSeed(), 'daisy', '切换地块后原地块重新选种');
  env.chooseSeed('blueberry'); const oldPlant = env.control('种下种子', env.detail()); G.store.replace(env.parse(G.state)); env.show(); assert.equal(env.selectedSeed(), 'daisy', '换档清理运行时选种');
  const before = JSON.stringify(G.state); oldPlant.click(); assert.equal(JSON.stringify(G.state), before);
  env.chooseSeed('tulip'); G.store.update(state => { state.garden.plots[0] = planted(G, 0, 'tulip'); }); env.show(); assert.match(env.detail().textContent, /郁金香/);
  G.store.update(state => { state.garden.plots[0] = null; }); env.show(); assert.equal(env.selectedSeed(), 'daisy', '地块已种后不保留旧选种');
});

test('十二作物图卡有图形可读名、实际种子数量/价格和夜种标识，不出现选种下拉', () => {
  const env = fixture(), { G } = env;
  G.store.update(state => { state.garden.seeds.daisy = 0; state.garden.seeds.tulip = 7; state.garden.seeds.star_fruit = 9999; }); env.show();
  assert.equal(env.detail().querySelectorAll('[role="radiogroup"]').length, 1);
  assert.equal(env.detail().querySelectorAll('[role="combobox"]').length, 0); assert.equal(env.detail().querySelectorAll('select').length, 0);
  assert.equal(env.seedCards().length, 12);
  G.data.crops.forEach(crop => {
    const card = env.seedCard(crop.id), art = card.querySelector('canvas'), n = G.state.garden.seeds[crop.id] || 0;
    assert.ok(art); assert.ok(art.getAttribute('aria-label').includes(crop.name));
    assert.equal(card.getAttribute('role'), 'radio'); assert.ok(card.getAttribute('aria-label').includes(crop.name));
    assert.ok(card.textContent.includes('持有 ' + n + ' 粒')); assert.ok(card.textContent.includes(crop.seedPrice + ' 糖果'));
  });
  assert.match(env.seedCard('star_fruit').textContent, /夜间播种/);
  const before = JSON.stringify(G.state); env.chooseSeed('daisy'); assert.equal(JSON.stringify(G.state), before, '选择无种子的作物也不自动购买');
  assert.equal(env.control(/先买一粒种子/, env.detail()).disabled, true);
});

test('作物图卡方向键与Home/End真实切换、只有当前项进入Tab顺序，重挂保留图卡焦点', () => {
  const env = fixture(); env.show(); const before = JSON.stringify(env.G.state);
  const key = (id, value) => { const node = env.seedCard(id); let prevented = false; (node.listeners.get('keydown') || []).forEach(fn => fn({ key: value, preventDefault() { prevented = true; } })); assert.equal(prevented, true); };
  key('daisy', 'ArrowRight'); assert.equal(env.selectedSeed(), 'tulip'); assert.equal(env.document.activeElement, env.seedCard('tulip'));
  key('tulip', 'End'); assert.equal(env.selectedSeed(), 'star_fruit');
  key('star_fruit', 'ArrowRight'); assert.equal(env.selectedSeed(), 'daisy');
  key('daisy', 'ArrowLeft'); assert.equal(env.selectedSeed(), 'star_fruit');
  key('star_fruit', 'Home'); assert.equal(env.selectedSeed(), 'daisy');
  assert.equal(env.seedCards().filter(node => node.tabIndex === 0).length, 1);
  assert.equal(env.seedCards().filter(node => node.getAttribute('aria-checked') === 'true').length, 1);
  const selected = env.seedCard('daisy'); selected.focus(); const focus = selected.dataset.uiFocus; env.show();
  assert.notEqual(env.document.activeElement, selected); assert.equal(env.document.activeElement.dataset.uiFocus, focus);
  assert.equal(JSON.stringify(env.G.state), before);
});

test('12种真实种子的价格、基础时长、售出单价和种子库存可见', () => {
  const env = fixture(); env.show(); env.tab('种子铺');
  assert.equal(env.root().querySelectorAll('.garden-crop').length, 12);
  env.G.data.crops.forEach(crop => { const row = env.cropRow(crop.id); assert.ok(row, crop.id); assert.ok(row.textContent.includes(String(crop.seedPrice))); assert.ok(row.textContent.includes(String(crop.growMinutes))); assert.ok(row.textContent.includes(String(crop.sellPrice))); assert.match(row.textContent, /3/); });
  const row = env.cropRow('daisy'), amount = row.querySelector('input'); env.input(amount, 7); const before = env.G.state.wallet.coin; env.control(/买|购买/, row).click(); assert.equal(env.G.state.garden.seeds.daisy, 10); assert.equal(env.G.state.wallet.coin, before - 35);
});

test('种子数量拒绝零、小数和越界，余额与库存上限不误扣款', () => {
  const env = fixture(), { G } = env; env.show(); env.tab('种子铺');
  let row = env.cropRow('daisy'), amount = row.querySelector('input');
  for (const invalid of [0, 1.5, 100, '']) { const before = JSON.stringify(G.state); env.input(amount, invalid); const buy = env.control(/买种子/, row); assert.equal(buy.disabled, true); buy.click(); assert.equal(JSON.stringify(G.state), before); }
  G.store.update(state => { state.wallet.coin = 0; }); env.show(); row = env.cropRow('daisy'); assert.equal(env.control(/买种子/, row).disabled, true);
  G.store.update(state => { state.wallet.coin = 100; state.garden.seeds.daisy = 9999; }); env.show(); row = env.cropRow('daisy'); assert.equal(env.control(/买种子/, row).disabled, true);
});

test('浇水只减当前阶段剩余30%，重复浇水与保存拒写不报成功', () => {
  const env = fixture(), { G } = env; G.store.update(state => { state.garden.plots[0] = planted(G, 0); }); env.show(); env.select(0);
  const beforeStatus = G.sys.garden.status(0), beforeMature = beforeStatus.matureAt; env.plots()[0].querySelector('.garden-plot-action').click();
  const after = G.sys.garden.status(0); assert.equal(after.watered, true); assert.ok(Math.abs((beforeMature - after.matureAt) - beforeStatus.stageRemainingMs * .3) < 1);
  const snapshot = JSON.stringify(G.state); assert.equal(env.plots()[0].querySelector('.garden-plot-action').disabled, true); env.plots()[0].querySelector('.garden-plot-action').click(); assert.equal(JSON.stringify(G.state), snapshot);
  G.store.update(state => { state.garden.plots[1] = planted(G, 0); }); env.show(); const saved = JSON.stringify(G.state); G.save.commit = () => false; env.plots()[1].querySelector('.garden-plot-action').click(); assert.equal(JSON.stringify(G.state), saved); assert.match(env.toasts.at(-1), /保存|备份/);
});

test('成熟地块只收获一份且点亮收藏，拒写保留作物', () => {
  const env = fixture(), { G } = env; G.store.update(state => { state.garden.plots[0] = planted(G, 3, 'tulip'); }); env.show();
  const old = env.plots()[0].querySelector('.garden-plot-action'); const exp = G.state.exp; old.click(); assert.equal(G.state.garden.harvest.tulip, 1); assert.equal(G.state.exp, exp + 3); assert.ok(G.state.collectionBook.crops.includes('tulip')); old.click(); assert.equal(G.state.garden.harvest.tulip, 1);
  G.store.update(state => { state.garden.plots[1] = planted(G, 3, 'rose'); }); env.show(); const before = JSON.stringify(G.state); G.save.commit = () => false; env.plots()[1].querySelector('.garden-plot-action').click(); assert.equal(JSON.stringify(G.state), before); assert.equal(G.state.garden.harvest.rose || 0, 0); assert.match(env.toasts.at(-1), /保存|存档|备份/);
});

test('星星果以设备当地20—6播种，永夜背景不绕过，温室只影响新播种', () => {
  const env = fixture(), { G } = env; G.store.update(state => { state.settings.dayMode = 'night'; }); env.show(); G.ui.garden.openPlot(0);
  let modal = env.dialogs.at(-1).element; env.chooseSeed('star_fruit', modal);
  assert.equal(env.control(/种下|等待当地夜晚/, modal).disabled, true); const before = JSON.stringify(G.state); env.control(/种下|等待当地夜晚/, modal).click(); assert.equal(JSON.stringify(G.state), before);
  env.at('2026-10-28', 20); env.tick(); assert.equal(env.control(/种下/, modal).disabled, false); env.control(/种下/, modal).click(); assert.equal(G.state.garden.plots[0].crop, 'star_fruit');
  const oldDuration = G.state.garden.plots[0].durationMs; assert.ok(G.sys.building.buildRoom(0, 0, 'greenhouse').ok); assert.equal(G.state.garden.plots[0].durationMs, oldDuration);
  G.ui.garden.openPlot(1); modal = env.dialogs.at(-1).element; env.chooseSeed('daisy', modal); env.control(/种下/, modal).click(); assert.equal(G.state.garden.plots[1].durationMs, Math.round(G.data.cropById.daisy.growMs / 1.2));
});

test('收获出售先确认数量，取消不扣货，卖完保留收藏发现', async () => {
  const env = fixture(), { G } = env; G.store.update(state => { state.garden.harvest.daisy = 7; }); env.show(); env.tab('收获篮');
  let row = env.cropRow('daisy'); env.input(row.querySelector('input'), 7); const before = JSON.stringify(G.state); env.control(/卖出|出售/, row).click(); assert.equal(env.confirmations.length, 1); assert.equal(JSON.stringify(G.state), before); env.confirmations[0].resolve(false); await flush(); assert.equal(JSON.stringify(G.state), before);
  row = env.cropRow('daisy'); const coin = G.state.wallet.coin; env.control(/卖出|出售/, row).click(); env.confirmations.at(-1).resolve(true); await flush(); assert.equal(G.state.garden.harvest.daisy, 0); assert.equal(G.state.wallet.coin, coin + 84); assert.ok(G.state.collectionBook.crops.includes('daisy'));
});

test('出售确认期间库存变化不能超卖；换档后旧确认不改变新小屋', async () => {
  const env = fixture(), { G } = env; G.store.update(state => { state.garden.harvest.tulip = 3; }); env.show(); env.tab('收获篮');
  let row = env.cropRow('tulip'); env.input(row.querySelector('input'), 3); env.control(/卖出|出售/, row).click(); G.store.update(state => { state.garden.harvest.tulip = 1; }); const coin = G.state.wallet.coin; env.confirmations.at(-1).resolve(true); await flush(); assert.equal(G.state.garden.harvest.tulip, 1); assert.equal(G.state.wallet.coin, coin);
  env.show(); row = env.cropRow('tulip'); env.control(/卖出|出售/, row).click(); G.store.replace(env.parse(G.state)); const before = JSON.stringify(G.state); env.confirmations.at(-1).resolve(true); await flush(); assert.equal(JSON.stringify(G.state), before);
});

test('送居民只调用真实礼物规则，每次一份且每天一次；收藏入口可达', () => {
  const env = fixture(), { G } = env; const room = G.sys.building.buildRoom(0, 0, 'bedroom').roomId; assert.ok(G.sys.decorating.place('bed_basic', room, 15, 80).ok); assert.ok(G.sys.residents.invite('lily', room).ok);
  G.store.update(state => { state.garden.harvest.carrot = 3; }); env.show(); env.tab('收获篮'); env.control(/送给|送居民|送朋友/, env.cropRow('carrot')).click(); const modal = env.dialogs.at(-1).element; const before = G.state.residents.lily.affection; env.control(/送给|送出/, modal).click(); assert.equal(G.state.garden.harvest.carrot, 2); assert.equal(G.state.residents.lily.affection, before + 20); assert.equal(G.sys.residents.gift('lily', 'carrot').ok, false);
  const focusCalls = []; G.ui.collectionBook = { focus: options => focusCalls.push(plain(options)) };
  env.control(/收藏|图鉴/).click(); assert.deepEqual(focusCalls, [{ kind: 'crops' }]); assert.equal(env.navigation.at(-1).kind, 'collection');
});

(async () => { for (const [name, fn] of tests) { await fn(); passed++; console.log('✓ ' + name); } console.log('\n' + passed + ' 组花园视觉UI检查通过。'); })().catch(error => { console.error(error); process.exitCode = 1; });
