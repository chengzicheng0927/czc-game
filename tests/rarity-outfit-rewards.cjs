'use strict';
// 公共稀有度装饰与真实领奖/穿着/旧凭据迁移；由主线程串行执行。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const { setup } = require('./fixtures/content-state.cjs');
const root = path.resolve(__dirname, '..'), plain = value => JSON.parse(JSON.stringify(value));
let passed = 0;
function test(name, action) { action(); passed++; console.log('✓ ' + name); }
function claimBaker(G) {
  G.store.update(state => { state.quests.stats.bakeryOrders = 15; });
  for (const id of ['baker_1', 'baker_2', 'baker_3']) { const result = G.sys.achievements.claim(id); assert.ok(result.ok, result.message); }
}
function rarityUi() {
  class Node {
    constructor() { this.className = ''; this.children = []; this.dataset = {}; this.attributes = {}; this.classList = { add: (...names) => { this.className = [...new Set(this.className.split(' ').filter(Boolean).concat(names))].join(' '); }, remove: name => { this.className = this.className.split(' ').filter(value => value !== name).join(' '); } }; }
    setAttribute(name, value) { this.attributes[name] = value; }
    append(node) { node.parent = this; this.children.push(node); }
    querySelector(selector) { return this.children.find(node => node.className.split(' ').includes(selector.slice(1))) || null; }
    replaceWith(node) { const at = this.parent.children.indexOf(this); this.parent.children[at] = node; node.parent = this.parent; }
  }
  const G = { ui: {} }, context = vm.createContext({ window: { Game: G }, document: { createElement: () => new Node() } });
  vm.runInContext(fs.readFileSync(path.join(root, 'js/ui/furniture-rarity.js'), 'utf8'), context);
  return { api: G.ui.furnitureRarity, Node };
}

test('四档稀有度共享中文标识，白蓝紫金样式键稳定且未知值安全回退', () => {
  const { api, Node } = rarityUi();
  for (const [id, text] of [['common', '普通'], ['fine', '精致'], ['rare', '稀有'], ['limited', '限定']]) {
    const card = new Node(), preview = new Node(), label = api.decorate(card, { rarity: id }, { preview });
    assert.equal(card.dataset.rarity, id); assert.ok(preview.className.includes('furniture-rarity-preview')); assert.equal(label.textContent, text); assert.equal(label.attributes['aria-label'], '家具稀有度：' + text);
  }
  for (const rarity of ['unknown', '__proto__', 'constructor', undefined]) assert.equal(api.info({ rarity }).id, 'common');
  const styles = fs.readFileSync(path.join(root, 'css/furniture-rarity.css'), 'utf8'); assert.match(styles, /prefers-reduced-motion:reduce/); assert.match(styles, /1050ms ease-out 1/);
});

test('重用预览不重复加标识，未点亮图鉴不暴露稀有度或添动画', () => {
  const { api, Node } = rarityUi(), card = new Node(); api.decorate(card, { rarity: 'fine' }); api.decorate(card, { rarity: 'limited' });
  assert.equal(card.children.length, 1); assert.equal(card.children[0].textContent, '限定'); assert.ok(!card.className.split(' ').includes('rarity-fine'));
  const hidden = new Node(); assert.equal(api.decorate(hidden, { rarity: 'rare' }, { discovered: false }), null); assert.equal(hidden.children.length, 0); assert.equal(hidden.className, '');
});

test('小厨师第三阶真实领取额外围裙，可穿且重载保留，重复领奖无变化', () => {
  const { G } = setup(); assert.equal(G.state.avatar.owned.dress_daisy, undefined); const coin = G.state.wallet.coin;
  claimBaker(G); assert.equal(G.state.avatar.owned.dress_daisy, true); assert.equal(G.state.wallet.coin, coin + 50 + 80 + 120); assert.ok(G.sys.avatar.equip('dress_daisy').ok);
  const before = JSON.stringify(G.state); assert.equal(G.sys.achievements.claim('baker_3').ok, false); assert.equal(JSON.stringify(G.state), before);
  const restored = setup(plain(G.state)).G; assert.equal(restored.state.avatar.dress, 'dress_daisy'); assert.equal(restored.state.avatar.owned.dress_daisy, true); assert.equal(restored.state.wallet.coin, G.state.wallet.coin);
});

test('先在衣橱购买同款再领成就，不复制服饰或额外兑换糖果', () => {
  const { G } = setup(); assert.ok(G.sys.avatar.buy('dress_daisy').ok); const owned = Object.keys(G.state.avatar.owned).length, coin = G.state.wallet.coin;
  claimBaker(G); assert.equal(Object.keys(G.state.avatar.owned).length, owned); assert.equal(G.state.wallet.coin, coin + 250); assert.equal(G.state.avatar.owned.dress_daisy, true);
});

test('圣诞节日信奖励冬裙，领取可穿可存，隔年不复制衣服或发额外货币', () => {
  const { G } = setup(); G.sys.time.setDebug({ date: '2026-12-25' }); const coin = G.state.wallet.coin;
  assert.equal(G.sys.time.current().festivals.find(event => event.id === 'christmas').gift.outfitId, 'dress_winter');
  assert.ok(G.sys.time.claim('christmas').ok); assert.equal(G.state.avatar.owned.dress_winter, true); assert.ok(G.sys.avatar.equip('dress_winter').ok);
  const before = JSON.stringify(G.state); assert.equal(G.sys.time.claim('christmas').ok, false); assert.equal(JSON.stringify(G.state), before);
  const restored = setup(plain(G.state)).G; assert.equal(restored.state.avatar.dress, 'dress_winter'); assert.equal(restored.state.avatar.owned.dress_winter, true);
  const owned = Object.keys(G.state.avatar.owned).length; G.sys.time.setDebug({ date: '2027-12-25' }); assert.ok(G.sys.time.claim('christmas').ok);
  assert.equal(Object.keys(G.state.avatar.owned).length, owned); assert.equal(G.state.inventory.festival_christmas_tree, 2); assert.equal(G.state.wallet.coin, coin);
});

test('旧档已领取成就或节日只幂等补服饰，不重发金币经验家具和记忆', () => {
  const { G } = setup(), raw = plain(G.state); raw.wallet.coin = 777; raw.exp = 12;
  raw.quests.achievements = { baker_1: true, baker_2: true, baker_3: true }; raw.calendar.claimed['2025:christmas'] = true;
  const inventory = JSON.stringify(raw.inventory), memories = JSON.stringify(raw.memories), restored = setup(raw).G;
  assert.equal(restored.state.avatar.owned.dress_daisy, true); assert.equal(restored.state.avatar.owned.dress_winter, true);
  assert.equal(restored.state.wallet.coin, 777); assert.equal(restored.state.exp, 12); assert.equal(JSON.stringify(restored.state.inventory), inventory); assert.equal(JSON.stringify(restored.state.memories), memories);
  const before = JSON.stringify(restored.state), again = setup(plain(restored.state)).G; assert.equal(JSON.stringify(again.state), before);
});

test('节日关闭与未完成成就不误送衣物，补发助手仅认可真实领取凭据', () => {
  const { G } = setup(), before = JSON.stringify(G.state); assert.equal(G.sys.time.claim('christmas').ok, false); assert.equal(G.sys.achievements.claim('baker_3').ok, false); assert.equal(JSON.stringify(G.state), before);
  const raw = plain(G.state); raw.calendar.claimed['2026:christmas:lily'] = true; raw.quests.achievements.baker_3 = false;
  assert.deepEqual(Array.from(G.data.applyOutfitRewardEntitlements(raw)), []); assert.equal(raw.avatar.owned.dress_daisy, undefined); assert.equal(raw.avatar.owned.dress_winter, undefined);
});

test('图鉴服饰来源说明双途径，未得时引向成就或节日，已有后通往衣橱', () => {
  const { G } = setup(); vm.runInNewContext(fs.readFileSync(path.join(root, 'js/systems/collection-book.js'), 'utf8'), { window: { Game: G } });
  const book = G.sys.collectionBook, apron = book.get('outfits', 'dress_daisy'), winter = book.get('outfits', 'dress_winter');
  assert.equal(apron.name, '？？？'); assert.equal(apron.action.panel, 'quests'); assert.equal(apron.action.category, 'baker'); assert.match(apron.source, /成就礼物/); assert.ok(!apron.hint.includes(G.data.outfitById.dress_daisy.name));
  assert.equal(winter.action.panel, 'calendar'); assert.equal(winter.action.eventId, 'christmas'); assert.match(winter.source, /节日心意/); assert.ok(!winter.hint.includes(G.data.outfitById.dress_winter.name));
  assert.equal(book.list({ kind: 'outfits', query: G.data.outfitById.dress_winter.name }).total, 0);
  claimBaker(G); assert.equal(book.get('outfits', 'dress_daisy').action.panel, 'avatar'); assert.equal(book.get('outfits', 'dress_daisy').collected, true);
});

console.log('\n' + passed + ' 组稀有度与服饰来源检查通过');
