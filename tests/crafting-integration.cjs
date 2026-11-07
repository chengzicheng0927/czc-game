'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { setup } = require('./fixtures/quest-village.cjs');
let passed = 0;
const plain = value => JSON.parse(JSON.stringify(value));
function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }
function prepared() {
  const env = setup(), G = env.G; G.sys.economy.addExp(1000000);
  G.store.update(s => { s.wallet.coin = 5000; ['tulip', 'pumpkin', 'sakura', 'strawberry', 'blueberry'].forEach(id => { s.garden.harvest[id] = 20; }); });
  const bedroom = G.sys.building.buildRoom(0, 0, 'bedroom').roomId, workshop = G.sys.building.buildRoom(0, 1, 'workshop').roomId, bathroom = G.sys.building.buildRoom(0, 2, 'bathroom').roomId;
  assert.ok(G.sys.decorating.place('bed_basic', bedroom, 20, 90).ok); assert.ok(G.sys.economy.buy('bathtub_basic').ok); assert.ok(G.sys.decorating.place('bathtub_basic', bathroom, 20, 90).ok);
  assert.ok(G.sys.residents.invite('lily', bedroom).ok); assert.ok(G.sys.residents.invite('bobo', bedroom).ok);
  return { ...env, bedroom, workshop };
}
function craft(G, id, count = 1) { const status = G.sys.crafting.status(id, count), result = G.sys.crafting.craft(id, count, status.quote); assert.ok(result.ok, result.message); return result; }
test('五份真实加工成品可进入既有摆放/回收，发现历史与制作次数保留', () => {
  const { G, bedroom } = prepared(); assert.ok(G.sys.economy.buy('coffee_table_basic').ok); const table = G.sys.decorating.place('coffee_table_basic', bedroom, 180, 90); assert.ok(table.ok); vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/systems/yard.js'), 'utf8'), { window: { Game: G } });
  for (const recipe of G.data.craftingRecipes) {
    craft(G, recipe.id); const def = G.data.furnitureById[recipe.itemId];
    const result = def.place === 'yard' ? G.sys.yard.place(def.id, 10, 80) : G.sys.decorating.place(def.id, bedroom, 190, 90, def.place === 'table' ? table.uid : undefined); assert.ok(result.ok, result.message);
    if (def.place === 'table') assert.equal(G.state.house.rooms[bedroom].items.find(item => item.uid === result.uid).parent, table.uid); assert.equal(G.state.inventory[def.id], 0);
    if (def.place === 'yard') { const before = JSON.stringify(G.state); assert.equal(G.sys.yard.recolor(result.uid, '#FF0000').ok, false); assert.equal(JSON.stringify(G.state), before); }
    assert.ok(def.place === 'yard' ? G.sys.yard.remove(result.uid).ok : G.sys.decorating.remove(bedroom, result.uid).ok);
    assert.equal(G.state.inventory[def.id], 1); assert.equal(G.state.collection[def.id], true); assert.equal(G.state.crafting.counts[recipe.id], 1);
  }
});
test('高级草莓/蓝莓糕按原8/20偏好规则送礼，真实消耗且不当成作物', () => {
  for (const recipe of ['strawberry_deluxe', 'blueberry_deluxe']) {
    const { G } = prepared(), id = G.data.craftingRecipeById[recipe].itemId; craft(G, recipe, 2); const options = G.sys.residents.giftOptions('bobo'); assert.ok(options.find(option => option.id === id).favorite);
    const before = G.state.residents.bobo.affection, gift = G.sys.residents.gift('bobo', id); assert.ok(gift.ok && gift.favorite); assert.equal(gift.affection, 20); assert.equal(G.state.residents.bobo.affection, before + 20); assert.equal(G.state.inventory[id], 1); assert.equal(G.state.garden.harvest[G.data.craftingRecipeById[recipe].cropId], 16);
    assert.equal(G.sys.residents.gift('bobo', id).ok, false); assert.equal(G.state.inventory[id], 1);
    const ordinary = G.sys.residents.gift('lily', id); assert.ok(ordinary.ok && !ordinary.favorite); assert.equal(ordinary.affection, 8); assert.equal(G.state.inventory[id], 0);
    assert.equal(G.state.collection[id], true); assert.equal(G.state.crafting.counts[recipe], 2);
  }
});
test('高级蛋糕生日仍双倍，非法家具、原型或缺少库存均不能赠送', () => {
  const { G, at } = prepared(); craft(G, 'blueberry_deluxe'); at('2027-07-07'); assert.equal(G.sys.residents.gift('bobo', 'cake_blueberry_deluxe').affection, 40);
  const before = JSON.stringify(G.state); for (const id of ['craft_tulip_vase', 'bed_basic', '__proto__', 'constructor', {}, 'cake_strawberry_deluxe']) assert.equal(G.sys.residents.gift('lily', id).ok, false); assert.equal(JSON.stringify(G.state), before);
});
test('高级蛋糕送礼保存拒写保持材料/成品/日期/好感/经验全部不变且可重试', () => {
  const { G } = prepared(); craft(G, 'blueberry_deluxe'); const before = JSON.stringify(G.state), commit = G.save.commit; let events = 0; G.bus.on('resident:happy', () => events++);
  G.save.commit = () => false; assert.equal(G.sys.residents.gift('bobo', 'cake_blueberry_deluxe').ok, false); assert.equal(JSON.stringify(G.state), before); assert.equal(events, 0);
  G.save.commit = commit; assert.ok(G.sys.residents.gift('bobo', 'cake_blueberry_deluxe').ok); assert.equal(events, 1);
});
test('成品送礼同步重入不能双送，独立材料仍可另作一份', () => {
  const { G } = prepared(); craft(G, 'strawberry_deluxe', 2); let nested = null;
  const off = G.bus.on('state:change', () => { nested = G.sys.residents.gift('bobo', 'cake_strawberry_deluxe'); });
  assert.ok(G.sys.residents.gift('bobo', 'cake_strawberry_deluxe').ok); off(); assert.equal(nested.ok, false); assert.equal(G.state.inventory.cake_strawberry_deluxe, 1); assert.equal(G.state.residents.bobo.affection, 20);
  craft(G, 'strawberry_deluxe'); assert.equal(G.state.inventory.cake_strawberry_deluxe, 2);
});
test('5加工项图鉴来源接回加工册，不进入主题套装、普通货架、特惠或礼盒', () => {
  const { G } = prepared(); const load = file => vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/systems', file), 'utf8'), { window: { Game: G } }); load('collection-book.js'); load('deals.js'); load('gifts.js');
  assert.equal(G.sys.collectionBook.summary()[0].total, 407);
  for (const recipe of G.data.craftingRecipes) { const item = G.sys.collectionBook.get('furniture', recipe.itemId); assert.equal(item.action.panel, 'crafting'); assert.equal(item.action.recipeId, recipe.id); assert.ok(item.hint.includes(G.data.cropById[recipe.cropId].name)); assert.equal(G.sys.economy.buy(recipe.itemId).ok, false); assert.equal(G.sys.deals.list().some(deal => deal.definition.id === recipe.itemId), false); }
  for (const theme of G.sys.collectionBook.themes()) assert.equal(theme.total, 38);
});
test('成品消耗后仍能JSON恢复制作/收藏，Markdown包含配方次数和最近一批', () => {
  const { G } = prepared(); craft(G, 'tulip_vase', 3); craft(G, 'blueberry_deluxe'); assert.ok(G.sys.residents.gift('bobo', 'cake_blueberry_deluxe').ok);
  const restored = setup(plain(G.state)).G; assert.deepEqual(plain(restored.state.crafting), plain(G.state.crafting)); assert.equal(restored.state.inventory.cake_blueberry_deluxe, 0); assert.equal(restored.state.collection.cake_blueberry_deluxe, true);
  restored.utils.download = () => {}; const text = restored.save.exportMemory(); assert.ok(text.includes('花园加工')); assert.ok(text.includes('郁金香花瓶：3')); assert.ok(text.includes('双层蓝莓蛋糕'));
});
console.log('\n' + passed + ' 组加工玩法联动检查通过。');
