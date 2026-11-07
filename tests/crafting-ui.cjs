'use strict';
// 显式准备收获篮，以真实加工/保存规则驱动面板；不启动服务或浏览器。
const assert = require('node:assert/strict');
const { setup } = require('./fixtures/resident-life.cjs');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }
const plain = value => JSON.parse(JSON.stringify(value));
function fixture(options = {}) {
  const env = setup(), { G, document } = env, navigation = [], draws = [], selected = [];
  if (!G.data.craftingRecipes) env.load('js/data/crafting.js');
  if (!G.sys.crafting) env.load('js/systems/crafting.js');
  if (options.saved) G.store.replace(env.parse(options.saved));
  else G.store.update(s => { s.level = options.level || 21; s.wallet.coin = 5000; s.garden.harvest = { tulip: 24, pumpkin: 10, sakura: 3, strawberry: 10, blueberry: 10 }; });
  G.ui.open = (panel, input) => navigation.push({ panel, input });
  G.ui.controls.select = (items, value, onChange) => {
    const node = document.createElement('button'); node.dataset.cuteControl = 'select'; node.value = value; node.items = items; node.setAttribute('role', 'combobox');
    node.choose = value => { node.value = value; onChange(value); }; selected.push(node); return node;
  };
  G.ui.controls.label = (control, text) => { const node = document.createElement('div'), label = document.createElement('span'); node.className = 'ui-field'; label.textContent = text; node.append(label, control); return node; };
  G.ui.garden = { drawCrop() {} }; G.render.drawThumbnail = (canvas, id) => draws.push(id);
  env.load('js/ui/crafting.js');
  let descriptor = null;
  function panel(input = {}, api = {}) { descriptor = G.ui.crafting.panel(input, api); env.panel.className = ''; env.panel.replaceChildren(descriptor.content); return descriptor.content; }
  const root = () => descriptor.content;
  const buttons = () => root().querySelectorAll('button');
  const control = text => buttons().find(node => node.textContent === text);
  const selectors = () => buttons().filter(node => node.attributes.role === 'combobox');
  const make = count => { control('制作 ' + count + ' 份').click(); control('确认制作 ' + count + ' 份')?.click(); };
  return { ...env, navigation, draws, selected, panel, root, buttons, control, selectors, make };
}

test('配方和数量使用现有自定义选择器，完整显示真实材料及成品去向', () => {
  const env = fixture(); env.panel(); const { G } = env;
  assert.equal(env.selectors().length, 2); assert.equal(env.selectors()[0].items.length, 5); assert.equal(env.root().querySelectorAll('select').length, 0);
  assert.match(env.root().textContent, /郁金香花瓶/); assert.match(env.root().textContent, /用郁金香 3 份/); assert.match(env.root().textContent, /收获篮里有 24 份/); assert.match(env.root().textContent, /材料够啦/);
  assert.equal(env.control('制作 1 份').disabled, false); env.frames(); assert.deepEqual(env.draws, plain(G.data.craftingRecipes.map(recipe => recipe.itemId)).concat('craft_tulip_vase'));
  assert.equal(G.state.crafting.last, null);
});

test('材料不足只呈现真实缺口和去花园入口，不误消费或发成品', () => {
  const env = fixture(); env.G.store.update(s => { s.garden.harvest.tulip = 2; }); const before = JSON.stringify(env.G.state); env.panel();
  assert.equal(env.control('材料还差一点').disabled, true); assert.match(env.root().textContent, /还差 1 份/); env.control('去花园收获').click();
  assert.equal(env.navigation.at(-1).panel, 'garden'); assert.equal(JSON.stringify(env.G.state), before);
});

test('樱花前院与高级蛋糕按真实等级/房间锁定，缺工坊可直达建造', () => {
  const low = fixture({ level: 6 }); low.panel({ recipeId: 'sakura_tree' }); assert.equal(low.control('Lv11开放').disabled, true); low.control('看看解锁条件').click(); assert.equal(low.navigation.at(-1).panel, 'yard');
  const env = fixture(); env.panel({ recipeId: 'strawberry_deluxe' }); assert.equal(env.control('先准备工坊').disabled, true); env.control('去建甜品工坊').click(); assert.deepEqual(plain(env.navigation.at(-1)), { panel: 'build', input: { roomType: 'workshop' } });
  const younger = fixture({ level: 20 }); younger.panel({ recipeId: 'blueberry_deluxe' }); assert.equal(younger.control('Lv21开放').disabled, true);
});

test('数量切换真实做三份，成功后锁住原位置按钮，旧点击不能重复生产', () => {
  const env = fixture(), { G } = env; env.panel(); const wallet = plain(G.state.wallet), stats = plain(G.state.quests.stats), exp = G.state.exp;
  env.selectors()[1].choose('3'); assert.match(env.root().textContent, /用郁金香 9 份/); env.control('制作 3 份').click(); const old = env.control('确认制作 3 份'); old.click();
  assert.equal(G.state.garden.harvest.tulip, 15); assert.equal(G.state.inventory.craft_tulip_vase, 3); assert.equal(G.state.crafting.counts.tulip_vase, 3); assert.equal(env.control('这一份已收好').disabled, true);
  old.listeners.get('click')[0]({ target: old }); env.control('这一份已收好').click(); assert.equal(G.state.inventory.craft_tulip_vase, 3);
  assert.deepEqual(plain(G.state.wallet), wallet); assert.deepEqual(plain(G.state.quests.stats), stats); assert.equal(G.state.exp, exp);
  env.control('继续制作').click(); assert.equal(env.control('制作 3 份').disabled, false); env.make(3); assert.equal(G.state.inventory.craft_tulip_vase, 6);
});

test('保存拒写保留配方/份数/篮子，并给出可重试结果', () => {
  const env = fixture(), { G } = env; env.panel({ recipeId: 'pumpkin_lantern' }); env.selectors()[1].choose('3'); const before = JSON.stringify(G.state), commit = G.save.commit;
  G.save.commit = () => false; env.make(3); assert.equal(JSON.stringify(G.state), before); assert.equal(env.selectors()[0].value, 'pumpkin_lantern'); assert.equal(env.selectors()[1].value, '3'); assert.match(env.root().textContent, /无法保存在本机/);
  assert.equal(env.root().querySelector('.crafting-finished'), null); G.save.commit = commit; env.make(3); assert.equal(G.state.inventory.craft_pumpkin_lantern, 3);
});

test('显示后的材料变化要求重新核对，不自动换价制作', () => {
  const env = fixture(), { G } = env; env.panel(); const original = env.control('制作 1 份'); G.store.update(s => { s.garden.harvest.tulip -= 1; }); original.click();
  assert.equal(G.state.inventory.craft_tulip_vase || 0, 0); assert.equal(G.state.garden.harvest.tulip, 23); assert.match(env.root().textContent, /变化/);
  env.make(1); assert.equal(G.state.inventory.craft_tulip_vase, 1); assert.equal(G.state.garden.harvest.tulip, 20);
});

test('成品满格不谎报材料不足，也不显示无效制作成功', () => {
  const env = fixture(), { G } = env; G.store.update(s => { s.inventory.craft_tulip_vase = 9999; s.collection.craft_tulip_vase = true; }); env.panel();
  assert.equal(env.control('成品背包满啦').disabled, true); assert.match(env.root().textContent, /背包格快满/); assert.equal(env.root().querySelector('.crafting-finished'), null);
});

test('真实高级蛋糕进入结果，摆放/送礼回调只传本次成品ID', () => {
  const env = fixture(), { G } = env, placed = [], gifts = []; assert.ok(G.sys.building.buildRoom(0, 0, 'workshop').ok);
  env.panel({ recipeId: 'blueberry_deluxe' }, { place: id => placed.push(id), gift: id => gifts.push(id) }); env.make(1);
  assert.equal(G.state.inventory.cake_blueberry_deluxe, 1); assert.equal(G.state.garden.harvest.blueberry, 8); assert.match(env.root().textContent, /工坊制作不增加蛋糕屋订单/);
  env.control('摆进小屋').click(); env.control('送给朋友').click(); assert.deepEqual(placed, ['cake_blueberry_deluxe']); assert.deepEqual(gifts, ['cake_blueberry_deluxe']);
});

test('默认去向事件连到前院/朋友；刷新最近凭据只重看不重新制作', () => {
  const env = fixture(), { G } = env, events = []; G.bus.on('crafting:place_requested', value => events.push(value)); env.panel({ recipeId: 'sakura_tree' }); env.make(1); env.control('布置前院').click(); assert.deepEqual(plain(events), [{ itemId: 'craft_sakura_tree' }]);
  const saved = plain(G.state), restored = fixture({ saved }); restored.panel(); assert.match(restored.root().textContent, /最近收好：庭院樱花树 × 1/); assert.equal(restored.G.state.inventory.craft_sakura_tree, 1); assert.equal(JSON.stringify(restored.G.state), JSON.stringify(saved));
});

test('绘图只处理现存画布，换档让旧按钮失效，不新增持续计时器', () => {
  const env = fixture(), { G } = env; const intervals = env.intervals.length; env.panel(); const old = env.control('制作 1 份'); env.selectors()[0].choose('pumpkin_lantern'); env.frames(); assert.deepEqual(env.draws, plain(G.data.craftingRecipes.map(recipe => recipe.itemId)).concat('craft_pumpkin_lantern'));
  G.store.replace(env.parse(G.state)); old.listeners.get('click')[0]({ target: old }); assert.equal(G.state.crafting.last, null); assert.equal(env.intervals.length, intervals);
  const stale = env.control('制作 1 份'); stale.listeners.get('click')[0]({ target: stale }); assert.equal(G.state.crafting.last, null);
});

test('外部入口保留指定配方，自定义选择只接受已知配方和合法份数', () => {
  const env = fixture(); env.G.ui.crafting.open('blueberry_deluxe'); assert.deepEqual(plain(env.navigation.at(-1)), { panel: 'crafting', input: { recipeId: 'blueberry_deluxe' } });
  env.G.ui.crafting.entry('tulip_vase').click(); assert.deepEqual(plain(env.navigation.at(-1)), { panel: 'crafting', input: { recipeId: 'tulip_vase' } });
  env.panel(); env.selectors()[0].choose('__proto__'); env.selectors()[1].choose('0'); env.selectors()[1].choose('1.5'); assert.match(env.root().textContent, /用郁金香 3 份/); assert.equal(env.control('制作 1 份').disabled, false);
});

test('五份配方列表都使用权威ID，Lv18仍可查看两个锁定蛋糕的真实条件', () => {
  const env = fixture({ level: 18 }); env.panel();
  const rows = env.root().querySelectorAll('.crafting-v2-recipe'); assert.equal(rows.length, 5);
  assert.deepEqual(rows.map(row => row.dataset.recipeId), plain(env.G.data.craftingRecipes.map(recipe => recipe.id)));
  for (const row of rows) assert.ok(row.textContent.includes(env.G.data.craftingRecipeById[row.dataset.recipeId].name));
  rows.find(row => row.dataset.recipeId === 'blueberry_deluxe').click();
  assert.match(env.root().textContent, /Lv\.21 · 当前 Lv\.18/); assert.match(env.root().textContent, /甜品工坊 · 未建造/); assert.equal(env.control('Lv21开放').disabled, true);
});

test('完整1到99整数份数可选，查看报价不扣料，99份确认只保存一次', () => {
  const env = fixture(), { G } = env; G.store.update(state => { state.garden.harvest.tulip = 297; }); env.panel();
  assert.equal(env.selectors()[1].items.length, 99); assert.equal(env.selectors()[1].items[0].id, '1'); assert.equal(env.selectors()[1].items.at(-1).id, '99');
  env.selectors()[1].choose('99'); const before = JSON.stringify(G.state), commit = G.save.commit; let saves = 0;
  G.save.commit = value => { saves++; return commit(value); };
  env.control('制作 99 份').click(); assert.equal(JSON.stringify(G.state), before); assert.equal(saves, 0);
  assert.match(env.root().textContent, /收获篮：297 → 0 份 · 成品背包：0 → 99 份/);
  env.control('确认制作 99 份').click(); assert.equal(saves, 1); assert.equal(G.state.garden.harvest.tulip, 0); assert.equal(G.state.inventory.craft_tulip_vase, 99);
});

test('报价返回修改不改变材料和记录，数量调整要重新核对', () => {
  const env = fixture(); env.panel(); const before = JSON.stringify(env.G.state);
  env.control('制作 1 份').click(); assert.equal(env.root().dataset.phase, 'confirm'); assert.equal(env.control('正在核对这一批').disabled, true);
  env.control('返回修改').click(); assert.equal(env.root().querySelector('.crafting-v2-confirm'), null); assert.equal(JSON.stringify(env.G.state), before);
  env.control('制作 1 份').click(); const stale = env.control('确认制作 1 份'); env.selectors()[1].choose('2');
  stale.listeners.get('click')[0]({ target: stale }); assert.equal(JSON.stringify(env.G.state), before); assert.equal(env.root().querySelector('.crafting-v2-confirm'), null); assert.equal(env.control('制作 2 份').disabled, false);
});

test('已展示报价与确认之间的库存竞争失败，不自动换价生产，也不播放成功反馈', () => {
  const env = fixture(), { G } = env, sounds = []; G.audio = { play: name => sounds.push(name) }; env.panel();
  env.control('制作 1 份').click(); const accept = env.control('确认制作 1 份'); G.store.update(state => { state.garden.harvest.tulip--; }); const before = JSON.stringify(G.state);
  accept.click(); assert.equal(JSON.stringify(G.state), before); assert.equal(env.root().querySelector('.crafting-finished'), null); assert.match(env.root().textContent, /变化/); assert.equal(env.toasts.length, 0); assert.equal(sounds.length, 0);
  env.make(1); assert.equal(G.state.garden.harvest.tulip, 20); assert.equal(G.state.inventory.craft_tulip_vase, 1); assert.deepEqual(sounds, ['success']);
});

test('换档使待确认按钮失效；加工历史满额显示实际原因', () => {
  const env = fixture(), { G } = env; env.panel(); env.control('制作 1 份').click(); const stale = env.control('确认制作 1 份');
  G.store.replace(env.parse(G.state)); const before = JSON.stringify(G.state); stale.listeners.get('click')[0]({ target: stale }); assert.equal(JSON.stringify(G.state), before);
  G.store.update(state => { state.crafting = { counts: { tulip_vase: 1000000000 }, last: { recipeId: 'tulip_vase', count: 1, total: 1000000000, at: Date.now() } }; }); env.panel();
  assert.equal(env.control('加工记录满啦').disabled, true); assert.match(env.root().textContent, /加工记录已经装满/); assert.match(env.root().textContent, /制作记录 · 累计 1,000,000,000 份/);
});

console.log('\n' + passed + ' 组加工册UI检查通过。');
