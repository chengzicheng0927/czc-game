'use strict';
// MC-060：真实sys/data + 内存DOM/合成存档。无服务、浏览器、账号或私人存档操作。
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { setup } = require('./fixtures/content-dom.cjs');
const spaces = require('./fixtures/free-spaces.cjs');
const { qaState } = require('./fixtures/content-progress.cjs');
const root = path.resolve(__dirname, '..'), plain = value => JSON.parse(JSON.stringify(value));
const tests = [], test = (name, fn) => tests.push([name, fn]);
function harness(saved) {
  const env = setup(), { G, document, panel } = env, proto = Object.getPrototypeOf(panel);
  proto.matches = function (selector) {
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    const attrs = [...selector.matchAll(/\[([^\]=]+)(?:=["']?([^\]"']*)["']?)?\]/g)];
    const simple = selector.replace(/\[[^\]]+\]/g, ''), tag = simple.match(/^[a-z]+/i), classes = [...simple.matchAll(/\.([\w-]+)/g)].map(match => match[1]);
    if (tag && this.tagName !== tag[0].toUpperCase()) return false;
    if (classes.some(name => !this.classList.contains(name))) return false;
    return attrs.every(([, name, expected]) => { const data = name.startsWith('data-') ? name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()) : null, value = data ? this.dataset[data] : this.attributes[name]; return value !== undefined && (expected === undefined || String(value) === expected); });
  };
  proto.getAttribute = function (name) { return this.attributes[name] ?? null; };
  proto.scrollIntoView = function (options) { this.scrolled = options; };
  proto.dispatch = function (name, input) { const event = Object.assign({ target: this, preventDefault() { this.prevented = true; } }, input); (this.listeners.get(name) || []).forEach(fn => fn(event)); return event; };
  const originalCreate = document.createElement;
  document.createElement = tag => { const node = originalCreate(tag); node.style.setProperty = (key, value) => { node.style[key] = value; }; return node; };
  document.querySelectorAll = selector => document.body.querySelectorAll(selector);
  ['js/data/progression.js', 'js/data/concert.js', 'js/data/achievements.js', 'js/systems/quests.js', 'js/systems/concert.js'].forEach(env.load);
  G.store.replace(env.parse(saved || G.state)); G.sys.init();
  const frameQueue = [], requestFrame = fn => { frameQueue.push(fn); return frameQueue.length; }, frames = () => frameQueue.splice(0).forEach(fn => fn(0));
  const navigation = [], outcomes = [], speech = [], stops = [], parties = [], thumbnails = [];
  G.audio = { stopSpeech: () => stops.push(true) };
  G.ui.questParty = { open: () => parties.push(true) }; G.ui.speak = text => speech.push(text);
  G.ui.photography = { open: () => navigation.push({ panel: 'photo' }) };
  G.ui.controls.select = (items, value, onChange) => {
    const node = document.createElement('button'); node.items = items; node.value = value; node.dataset.cuteControl = 'select'; node.setAttribute('role', 'combobox');
    node.choose = id => { node.focus(); node.value = id; onChange(id); }; return node;
  };
  G.render.drawThumbnail = (canvas, id) => thumbnails.push({ canvas, id });
  const api = { doAction(result) { outcomes.push(plain(result)); if (result.ok) G.ui.refresh(); return result.ok; }, navigate: action => navigation.push(action) };
  const baseModal = G.ui.modal; G.ui.modal = options => { const handle = baseModal(options); handle.element.focus(); return handle; };
  const uiContext = vm.createContext({ Game: G, document, console, requestAnimationFrame: requestFrame, setTimeout: () => 1 }); uiContext.window = uiContext;
  vm.runInContext(fs.readFileSync(path.join(root, 'js/ui/quests.js'), 'utf8'), uiContext, { filename: 'js/ui/quests.js' });
  function render() {
    const focused = document.activeElement, key = focused?.dataset.uiFocus, descriptor = G.ui.questBook.panel(api);
    panel.dataset.kind = 'quests'; panel.className = ''; panel.replaceChildren(descriptor.content);
    if (focused && !focused.isConnected) document.body.focus();
    const target = key && panel.querySelector('[data-ui-focus="' + key + '"]'); if (target) target.focus({ preventScroll: true });
    // 正式ui.js thumbnails()委托，测试只记录真实元数据ID，不伪称像素绘制。
    panel.querySelectorAll('canvas[data-furniture]').forEach(canvas => G.render.drawThumbnail(canvas, canvas.dataset.furniture));
    return descriptor;
  }
  G.ui.refresh = () => { if (!document.activeElement?.dataset.cuteControl) render(); };
  G.ui.open = (kind, options) => { if (kind === 'quests') return render(); navigation.push({ panel: kind, options }); };
  const key = value => panel.querySelector('[data-ui-focus="quest-v2-' + value + '"]');
  const flushFrames = () => { frames(); frames(); frames(); frames(); };
  const enableQueuedRefresh = () => { let pending = false; G.bus.on('state:change', () => { if (pending) return; pending = true; requestFrame(() => { pending = false; G.ui.refresh(); }); }); };
  const openFromOther = options => { const title = document.createElement('h2'); title.id='panel-title';document.body.append(title);G.ui.questBook.focus(options);render();requestFrame(()=>title.focus());flushFrames();return title; };
  const click = value => { const node = key(value); assert.ok(node, value); node.focus(); node.click(); flushFrames(); return node; };
  const tab = value => click('tab-' + value);
  const category = value => { key('category').choose(value); flushFrames(); };
  const focus = options => { G.ui.questBook.focus(options); render(); flushFrames(); };
  const close = () => { panel.className = 'hidden'; G.bus.emit('panel:change', { open: false }); };
  return { ...env, render, key, click, tab, category, focus, close, frames, flushFrames, enableQueuedRefresh, openFromOther, api, navigation, outcomes, speech, stops, parties, thumbnails };
}
const row = (e, id) => e.panel.querySelector('[data-quest-id="' + id + '"]');
function fulfillDaily(e) { e.G.store.update(s => s.quests.daily.list.forEach(entry => { entry.progress = e.G.data.dailyQuests.find(q => q.id === entry.id).target; entry.done = true; })); }
function fillCategory(e, id) {
  const def = e.G.data.achievementCategories.find(c => c.id === id);
  e.G.store.update(s => { s.quests.stats[def.metric] = def.targets[4]; });
}
function allMain(e) { e.G.store.update(s => { s.quests.main.claimed = e.G.data.mainQuests.map(q => q.id); s.quests.main.chapter = 5; s.quests.main.index = 35; s.rainbowPieces = e.G.data.rainbowFragments.map(f => f.id); s.quests.milestoneClaims = ['rainbow', 'home_master']; }); }

test('五章真实8/6/7/7/7与35任务；初始当前先行且其余折叠，纯读取', () => {
  const e = harness(), before = JSON.stringify(e.G.state); e.render();
  assert.deepEqual(plain(e.G.sys.quests.chapters().map(c => c.total)), [8, 6, 7, 7, 7]);
  assert.equal(e.panel.querySelectorAll('.qb-chapter-spine').length, 5); assert.equal(e.key('current').dataset.questId, 'name_home');
  assert.equal(e.panel.querySelector('.quest-chapter-list').open, false); assert.equal(e.panel.querySelectorAll('.quest-book-task').length, 8); assert.equal(JSON.stringify(e.G.state), before);
});
test('未来章节可浏览但全部任务锁定；当前已满未来任务仍不可领取', () => {
  const e = harness(); e.G.store.update(s => { s.house.name = '验收小屋'; s.quests.stats.harvests = 100; }); e.render(); e.click('chapter-2');
  assert.match(e.panel.textContent, /这一章还在等你/); assert.equal(e.panel.querySelectorAll('.quest-book-task').length, 6);
  e.panel.querySelectorAll('.quest-book-task').forEach(node => assert.match(node.textContent, /尚未开启/));
  assert.equal(e.key('claim-garden_morning').disabled, true); assert.equal(e.key('read-2').disabled, true); assert.equal(e.key('current'), null);
});
test('主线进行→可领→已领→下一项；旧按钮不重复发奖，焦点到当前任务', () => {
  const e = harness(); e.render(); assert.equal(e.key('claim-name_home').disabled, true); assert.match(row(e, 'name_home').textContent, /进行中/);
  e.G.store.update(s => { s.house.name = '云边家'; }); e.render(); assert.match(row(e, 'name_home').textContent, /可以领取/);
  const coin = e.G.state.wallet.coin, old = e.click('claim-name_home'); assert.equal(e.G.state.wallet.coin, coin + 30); assert.equal(e.key('current').dataset.questId, 'first_bedroom');
  assert.match(row(e, 'name_home').textContent, /已领取/); assert.equal(e.document.activeElement, e.key('current')); old.dispatch('click'); assert.equal(e.G.state.wallet.coin, coin + 30);
});
test('复合任务依已满足条件计数，逐项真实进度；只满足一项不能领', () => {
  const e = harness(); e.G.store.update(s => { s.quests.main.claimed = e.G.data.mainQuests.slice(0, 10).map(q => q.id); s.quests.main.chapter = 2; s.quests.main.index = 10; s.quests.stats.harvests = 2; }); e.render();
  const q = e.G.sys.quests.list().find(q => q.id === 'garden_morning'); assert.equal(q.progress, 0); assert.equal(q.target, 2);
  assert.match(row(e, q.id).textContent, /已满足条件 0 \/ 2/); assert.match(row(e, q.id).textContent, /收获作物 2\/3/);
  e.G.store.update(s => { s.quests.stats.harvests = 3; }); e.render(); assert.match(row(e, q.id).textContent, /已满足条件 1 \/ 2/); assert.equal(e.key('claim-' + q.id).disabled, true);
  e.G.store.update(s => { s.level = 6; }); spaces.addFloor(e.G, 1); e.render(); assert.match(row(e, q.id).textContent, /已满足条件 2 \/ 2/); assert.equal(e.key('claim-' + q.id).disabled, false);
});
test('章节折叠状态在切签与领奖后保留，章节切换焦点稳定', () => {
  const e = harness(); e.render(); const details = e.panel.querySelector('.quest-chapter-list'); details.open = true; details.dispatch('toggle');
  e.tab('daily'); e.tab('main'); assert.equal(e.panel.querySelector('.quest-chapter-list').open, true);
  e.G.store.update(s => { s.house.name = '小屋'; }); e.render(); e.click('claim-name_home'); assert.equal(e.panel.querySelector('.quest-chapter-list').open, true);
  e.click('chapter-3'); assert.equal(e.document.activeElement, e.key('chapter-3')); assert.equal(e.key('chapter-3').scrolled.inline, 'nearest');
});
test('三页签ARIA与左右/Home/End键切换，焦点及tabpanel关联', () => {
  const e = harness(); e.render(); assert.equal(e.key('tab-main').attributes.role, 'tab'); assert.equal(e.key('tab-main').attributes['aria-selected'], 'true');
  e.key('tab-main').dispatch('keydown', { key: 'ArrowRight' }); e.flushFrames(); assert.equal(e.document.activeElement, e.key('tab-daily')); assert.equal(e.key('tab-daily').attributes['aria-selected'], 'true');
  e.key('tab-daily').dispatch('keydown', { key: 'End' }); e.flushFrames(); assert.equal(e.document.activeElement, e.key('tab-achievements'));
  assert.equal(e.panel.querySelector('[role="tabpanel"]').attributes['aria-labelledby'], 'quest-v2-tab-achievements');
  e.key('tab-achievements').dispatch('keydown', { key: 'Home' }); e.flushFrames(); assert.equal(e.document.activeElement, e.key('tab-main'));
  e.key('tab-main').dispatch('keydown', { key: 'ArrowLeft' }); e.flushFrames(); assert.equal(e.document.activeElement, e.key('tab-achievements'));
});
test('真实任务行动原对象完整转交，不丢居民/房型/家具/墙纸/主题/游戏/合奏/服饰参数', () => {
  const e = harness();
  for (const id of ['name_home','first_bedroom','first_bed','welcome_lily','first_cake','new_wallpaper','ocean_stage','island_concert']) {
    const index = e.G.data.mainQuests.findIndex(q => q.id === id), def = e.G.data.mainQuests[index];
    e.G.store.update(s => { s.quests.main.claimed = e.G.data.mainQuests.slice(0,index).map(q=>q.id); s.quests.main.chapter = def.chapter; s.quests.main.index = index; });
    // 导航合约测试强制未达标，只改派生读响应，不改规则或目标模块。
    const original = e.G.sys.quests.list; e.G.sys.quests.list = () => original().map(q => q.id === id ? { ...q, done: false } : q);
    e.G.ui.questBook.focus({}); e.render(); e.click('chapter-' + def.chapter); e.click('go-' + id); assert.equal(e.navigation.at(-1), def.action); e.G.sys.quests.list = original;
  }
  const q = e.G.data.mainQuests[0], originalAction = q.action; q.action = { panel: 'avatar', outfitId: 'dress_daisy', category: 'dress', extra: { keep: true } };
  e.G.store.update(s => { s.quests.main.claimed=[];s.quests.main.chapter=1;s.quests.main.index=0; }); e.render(); e.click('chapter-1'); e.click('go-name_home'); assert.equal(e.navigation.at(-1), q.action); q.action=originalAction;
});
test('每日按真日期四取三、每项40币15经验；完成动作与领取宝箱分离', () => {
  const e = harness(); e.render(); e.tab('daily'); const tasks = e.G.sys.quests.list().filter(q=>q.type==='daily');
  assert.deepEqual(plain(tasks.map(q=>q.id)), plain(e.G.data.dailyQuestsForDate(e.G.utils.dateKey()).map(q=>q.id))); assert.equal(tasks.length,3);
  tasks.forEach(q => { assert.equal(q.reward.coin,40); assert.equal(q.reward.exp,15); });
  fulfillDaily(e); e.render(); assert.equal(e.key('claim-chest').disabled,true); assert.match(e.key('chest').textContent,/奖励已收好 0 \/ 3/); assert.equal(e.key('tab-daily').textContent,'每日任务 · 3');
});
test('每日三项逐领后宝箱才可手动开一次80币30经验5爱心；重击不重奖', () => {
  const e = harness(); fulfillDaily(e); e.render(); e.tab('daily'); const ids = e.G.state.quests.daily.list.map(q=>q.id), before=plain(e.G.state.wallet);
  ids.forEach((id,index) => { const old=e.click('claim-'+id), snapshot=JSON.stringify(e.G.state); old.dispatch('click');assert.equal(JSON.stringify(e.G.state),snapshot);assert.match(e.key('chest').textContent,new RegExp('奖励已收好 '+(index+1)+' / 3'));assert.equal(e.G.state.quests.daily.chestClaimed,false); });
  assert.equal(e.key('claim-chest').disabled,false); assert.equal(e.G.state.wallet.coin,before.coin+120);
  const old=e.click('claim-chest');assert.equal(e.G.state.wallet.coin,before.coin+200);assert.equal(e.G.state.wallet.heart,before.heart+5);assert.equal(e.G.state.quests.daily.chestClaimed,true);assert.equal(e.document.activeElement,e.key('chest'));
  const snapshot=JSON.stringify(e.G.state);old.dispatch('click');e.key('claim-chest').click();assert.equal(JSON.stringify(e.G.state),snapshot);assert.equal(e.key('tab-daily').textContent,'每日任务');
});
test('未来日期三任务/宝箱锁定且页签不报可领，不补领不回退日期', () => {
  const e=harness();fulfillDaily(e);e.at('2026-10-27');e.render();e.tab('daily');
  assert.match(e.panel.textContent,/日期暂不可用/);e.G.state.quests.daily.list.forEach(q=>assert.equal(e.key('claim-'+q.id).disabled,true));assert.equal(e.key('claim-chest').disabled,true);assert.equal(e.key('tab-daily').textContent,'每日任务');
  const before=JSON.stringify(e.G.state);e.flushFrames();assert.equal(JSON.stringify(e.G.state),before);assert.equal(e.G.state.quests.daily.date,'2026-10-28');
});
test('换日旧按钮调用由系统换新清单且失败，不补发旧日奖励', () => {
  const e=harness();fulfillDaily(e);e.render();e.tab('daily');const id=e.G.state.quests.daily.list[0].id,coin=e.G.state.wallet.coin;e.at('2026-10-29');e.click('claim-'+id);
  assert.equal(e.G.state.wallet.coin,coin);assert.equal(e.G.state.quests.daily.date,'2026-10-29');assert.equal(e.outcomes.at(-1).ok,false);assert.ok(e.panel.querySelector('.qb-feedback.is-error'));
});
test('八类40成就真metadata/五阶奖励和顶阶家具Canvas委托', () => {
  const e=harness();e.render();e.tab('achievements');assert.equal(e.G.sys.achievements.summary().total,40);assert.equal(e.key('category').items.length,8);
  for(const category of e.G.data.achievementCategories){e.category(category.id);const entries=e.G.sys.achievements.list(category.id);assert.equal(e.panel.querySelectorAll('.achievement-step').length,5);entries.forEach((entry,index)=>{const node=e.key('achievement-'+entry.id);assert.ok(node.textContent.includes(entry.title));assert.ok(node.textContent.includes(entry.description));assert.ok(node.textContent.includes('糖果 '+[50,80,120,180,300][index]));assert.ok(node.textContent.includes('经验 '+[20,30,50,70,100][index]));});const top=entries[4];assert.ok(e.thumbnails.some(p=>p.id===top.reward.itemId));}
});
test('成就五阶顺序领取；越阶/重复受disabled及系统双重约束', () => {
  const e=harness();fillCategory(e,'baker');e.render();e.tab('achievements');e.category('baker');
  assert.equal(e.key('achievement-claim-baker_1').disabled,false);assert.equal(e.key('achievement-claim-baker_5').disabled,true);assert.match(e.key('achievement-baker_5').textContent,/前阶待领/);
  for(let tier=1;tier<=5;tier++){const id='baker_'+tier,old=e.click('achievement-claim-'+id);assert.equal(e.G.state.quests.achievements[id],true);assert.equal(e.document.activeElement,e.key('achievement-'+id));const before=JSON.stringify(e.G.state);old.dispatch('click');assert.equal(JSON.stringify(e.G.state),before);}
  assert.equal(e.G.state.inventory[e.G.data.achievementGiftById.baker],1);
});
test('baker_3雏菊服饰真名与衣橱精确入口；已有同款不重复或折币', () => {
  const e=harness();fillCategory(e,'baker');e.G.store.update(s=>{s.avatar.owned.dress_daisy=true;s.quests.achievements.baker_1=true;s.quests.achievements.baker_2=true;});e.render();e.tab('achievements');e.category('baker');
  assert.ok(e.key('achievement-baker_3').textContent.includes(e.G.data.outfitById.dress_daisy.name));const count=Object.keys(e.G.state.avatar.owned).length,coin=e.G.state.wallet.coin;e.click('achievement-claim-baker_3');
  assert.equal(Object.keys(e.G.state.avatar.owned).length,count);assert.equal(e.G.state.wallet.coin,coin+120);e.click('outfit-baker_3');assert.deepEqual(plain(e.navigation.at(-1)),{panel:'avatar',outfitId:'dress_daisy'});
});
test('无类别/无成就条目均有明确空态，缺服饰metadata安全降级', () => {
  const e=harness();e.G.data.achievementCategories=[];e.render();e.tab('achievements');assert.match(e.panel.textContent,/徽章小册还在整理/);assert.equal(e.panel.querySelectorAll('.achievement-step').length,0);
  const f=harness();f.G.data.achievements=f.G.data.achievements.filter(q=>q.category!=='baker');f.render();f.tab('achievements');f.category('baker');assert.match(f.panel.textContent,/这本类别小册还在整理/);
  const d=harness();delete d.G.data.outfitById.dress_daisy;d.render();d.tab('achievements');d.category('baker');assert.match(d.panel.textContent,/待确认服饰/);assert.equal(d.panel.querySelector('.qb-feedback.is-error'),null);
});
test('成就类别选择时强制局部重绘并保焦点；摄影入口保持', () => {
  const e=harness();e.render();e.tab('achievements');e.category('photographer');assert.equal(e.document.activeElement,e.key('category'));assert.ok(e.key('achievement-photographer_1'));e.click('take-photo');assert.deepEqual(plain(e.navigation.at(-1)),{panel:'photo'});
});
test('图鉴focus类别与具体里程碑自动展开、精确焦点/滚动；里程碑只读', () => {
  const e=harness(),before=JSON.stringify(e.G.state);e.focus({tab:'achievements',category:'baker'});assert.ok(e.key('achievement-baker_3'));assert.equal(e.document.activeElement,e.key('category'));
  for(const id of ['rainbow','home_master']){e.focus({tab:'achievements',milestoneId:id});const target=e.key('milestone-'+id);assert.equal(e.document.activeElement,target);assert.equal(target.scrolled.block,'nearest');assert.equal(e.panel.querySelector('.achievement-milestones').open,true);assert.equal(target.querySelectorAll('button').length,0);assert.ok(target.textContent.includes(e.G.data.furnitureById[e.G.data.achievementGiftById[id]].name));}
  assert.equal(JSON.stringify(e.G.state),before);
});
test('35主线+七色才显示派对入口；重播只调party API', () => {
  const e=harness();e.render();assert.equal(e.key('party'),null);e.G.store.update(s=>{s.quests.main.claimed=e.G.data.mainQuests.slice(0,34).map(q=>q.id);s.quests.main.index=34;s.quests.main.chapter=5;s.rainbowPieces=e.G.data.rainbowFragments.map(f=>f.id);});e.render();assert.equal(e.key('party'),null);
  allMain(e);e.render();const before=JSON.stringify(e.G.state);e.click('party');e.click('party');assert.equal(e.parties.length,2);assert.equal(JSON.stringify(e.G.state),before);
});
test('真实第35任务领取保留endingUnlocked优先处理及自动里程碑显示', () => {
  const e=harness(qaState());e.render();e.click('claim-rainbow_party');assert.equal(e.parties.length,1);assert.equal(e.dialogs.length,0);assert.equal(e.G.state.quests.main.claimed.length,35);assert.deepEqual(plain(e.G.state.quests.milestoneClaims).sort(),['home_master','rainbow']);
  e.focus({tab:'achievements',milestoneId:'home_master'});assert.match(e.key('milestone-home_master').textContent,/已自动收好/);assert.equal(e.key('milestone-home_master').querySelectorAll('button').length,0);
});
test('真实章末领取仍打开completion故事；只主动朗读当前句且翻句停读', () => {
  const e=harness(qaState('new_wallpaper'));e.render();e.click('claim-new_wallpaper');assert.equal(e.dialogs.length,1);assert.equal(e.parties.length,0);assert.equal(e.speech.length,0);
  const story=e.dialogs.at(-1).element.querySelector('.quest-story'),line=story.querySelector('.quest-story-line'),buttons=story.querySelectorAll('button');buttons.find(b=>b.textContent==='听一听').click();assert.deepEqual(e.speech,[line.textContent]);const stops=e.stops.length;buttons.find(b=>b.textContent==='下一句').click();assert.ok(e.stops.length>stops);assert.equal(e.speech.length,1);
});
for(const type of ['main','daily','chest','achievement'])test(type+'领取规则抛异常留页重读无成功，恢复后可重试',()=>{
  const e=harness();let nodeKey,owner,method;
  if(type==='main'){e.G.store.update(s=>{s.house.name='可领';});e.render();nodeKey='claim-name_home';owner=e.G.sys.quests;method='claim';}
  else if(type==='daily'||type==='chest'){fulfillDaily(e);if(type==='chest')for(const q of e.G.state.quests.daily.list)e.G.sys.quests.claim(q.id);e.render();e.tab('daily');nodeKey=type==='chest'?'claim-chest':'claim-'+e.G.state.quests.daily.list[0].id;owner=e.G.sys.quests;method=type==='chest'?'claimDailyChest':'claim';}
  else{fillCategory(e,'baker');e.render();e.tab('achievements');e.category('baker');nodeKey='achievement-claim-baker_1';owner=e.G.sys.achievements;method='claim';}
  const before=JSON.stringify(e.G.state),original=owner[method];owner[method]=()=>{throw Error('合成拒写');};e.click(nodeKey);assert.equal(JSON.stringify(e.G.state),before);assert.equal(e.outcomes.at(-1).ok,false);assert.match(e.panel.querySelector('.qb-feedback').textContent,/没能确认领取结果/);assert.equal(e.panel.querySelector('.qb-feedback.is-success'),null);assert.equal(e.document.querySelectorAll('.quest-reward-float').length,0);assert.equal(e.key(nodeKey).disabled,false);
  owner[method]=original;e.click(nodeKey);assert.equal(e.outcomes.at(-1).ok,true);
});
test('规则返回失败反馈、满钱包失败与异常已提交后重读已领，不伪造回滚/成功',()=>{
  const e=harness();e.G.store.update(s=>{s.house.name='可领';s.wallet.coin=1000000000;});e.render();e.click('claim-name_home');assert.equal(e.outcomes.at(-1).ok,false);assert.match(e.panel.querySelector('.qb-feedback').textContent,/装满/);
  const f=harness();f.G.store.update(s=>{s.house.name='可领';});const original=f.G.sys.quests.claim;f.G.sys.quests.claim=id=>{original(id);throw Error('合成提交后总线错误');};f.render();f.click('claim-name_home');assert.equal(f.G.state.quests.main.claimed.includes('name_home'),true);assert.equal(f.outcomes.at(-1).ok,false);assert.match(row(f,'name_home').textContent,/已领取/);assert.ok(f.panel.querySelector('.qb-feedback.is-error'));assert.equal(f.parties.length,0);
});
test('权威读取异常与空主线/每日有重读/空态，重读不发奖励',()=>{
  const e=harness(),original=e.G.sys.quests.list,before=JSON.stringify(e.G.state);e.G.sys.quests.list=()=>{throw Error('读取异常');};e.render();assert.match(e.panel.textContent,/成长册暂时没能读好/);assert.equal(e.outcomes.length,0);e.G.sys.quests.list=original;e.click('retry');assert.ok(e.key('current'));assert.equal(JSON.stringify(e.G.state),before);
  e.G.sys.quests.chapters=()=>[];e.render();assert.match(e.panel.textContent,/正在整理新的故事/);e.G.store.update(s=>{s.quests.daily.list=[];});e.render();e.tab('daily');assert.match(e.panel.textContent,/任务清单还没准备好/);assert.equal(e.key('claim-chest').disabled,true);
});
test('普通update旧按钮仍可操作；关闭/换档/重建后的旧按钮选择器失效',()=>{
  const e=harness();e.G.store.update(s=>{s.house.name='可领';});e.render();const button=e.key('claim-name_home');e.G.store.update(s=>{s.wallet.coin++;});button.click();assert.equal(e.G.state.quests.main.claimed.includes('name_home'),true);
  e.tab('achievements');const picker=e.key('category'),tab=e.key('tab-daily'),old=e.key('achievement-claim-builder_1');e.close();const before=JSON.stringify(e.G.state);picker.choose('baker');tab.dispatch('click');old.dispatch('click');assert.equal(JSON.stringify(e.G.state),before);assert.equal(e.panel.classList.contains('hidden'),true);
  e.render();e.focus({tab:'achievements',milestoneId:'rainbow'});const stale=e.key('tab-daily');e.G.store.replace(e.parse(e.G.state));stale.dispatch('click');e.render();e.flushFrames();assert.equal(e.key('tab-main').attributes['aria-selected'],'true');e.tab('achievements');assert.equal(e.panel.querySelector('.achievement-milestones').open,false);
});
test('迟到的来源/领奖焦点不能抢新页或关闭后的焦点',()=>{
  const e=harness();e.G.ui.questBook.focus({tab:'achievements',milestoneId:'home_master'});e.render();e.key('tab-daily').click();e.flushFrames();assert.equal(e.document.activeElement,e.key('tab-daily'));
  e.G.ui.questBook.focus({tab:'achievements',milestoneId:'rainbow'});e.render();e.close();e.document.body.focus();e.flushFrames();assert.equal(e.document.activeElement,e.document.body);
});
test('真实公共面板调度顺序：来源焦点越过标题，领奖经全局刷新仍落最新卡片',()=>{
  const e=harness();e.openFromOther({tab:'achievements',category:'baker',milestoneId:'home_master'});assert.equal(e.document.activeElement,e.key('milestone-home_master'));
  e.tab('main');e.G.store.update(s=>{s.house.name='可领';});e.render();e.enableQueuedRefresh();e.click('claim-name_home');assert.equal(e.document.activeElement,e.key('current'));assert.equal(e.key('current').dataset.questId,'first_bedroom');
  e.tab('achievements');e.category('baker');fillCategory(e,'baker');e.render();e.click('achievement-claim-baker_1');assert.equal(e.document.activeElement,e.key('achievement-baker_1'));
});
test('章末故事期间不抢模态焦点，关闭后恢复最新当前任务',()=>{
  const e=harness(qaState('new_wallpaper'));e.render();e.enableQueuedRefresh();e.click('claim-new_wallpaper');const modal=e.dialogs.at(-1);assert.equal(e.document.activeElement,modal.element);modal.close();e.flushFrames();assert.equal(e.document.activeElement,e.key('current'));
});
test('章节选择和折叠说明保留真实全文、条件与焦点，翻阅不写进度',()=>{
  const e=harness();e.G.store.update(s=>{s.quests.main.claimed=e.G.data.mainQuests.slice(0,10).map(q=>q.id);s.quests.main.chapter=2;s.quests.main.index=10;s.quests.stats.harvests=2;});
  const before=JSON.stringify(e.G.state),chapters=e.G.sys.quests.chapters();e.render();
  const openDisclosure=summary=>{assert.ok(summary,'有可操作的展开入口');assert.equal(summary.tagName,'SUMMARY');const disclosure=summary.parentElement;assert.equal(disclosure.tagName,'DETAILS');disclosure.open=true;disclosure.dispatch('toggle');return disclosure;};
  assert.equal(e.key('chapter-select').getAttribute('role'),'combobox');assert.equal(e.key('chapter-select').getAttribute('aria-label'),'主线章节');
  assert.deepEqual(plain(e.key('chapter-select').items.map(item=>item.id)),plain(chapters.map(chapter=>String(chapter.id))));
  for(const chapter of chapters){
    e.key('chapter-select').choose(String(chapter.id));e.flushFrames();assert.equal(e.document.activeElement,e.key('chapter-select'));
    const introduction=openDisclosure(e.key('fold-description-'+chapter.id));assert.ok(introduction.textContent.includes(chapter.title));assert.ok(introduction.textContent.includes(chapter.description));
    assert.equal(e.key('read-'+chapter.id).disabled,!chapter.available);
    openDisclosure(e.key('fold-chapter-'+chapter.id));
    for(const task of e.G.sys.quests.list().filter(q=>q.type==='main'&&Number(q.chapter)===Number(chapter.id))){
      const taskRow=row(e,task.id);assert.ok(taskRow,task.id);assert.ok(taskRow.textContent.includes(task.title));assert.ok(taskRow.textContent.includes(task.description),'完整心愿说明：'+task.id);
      if(task.conditions)for(const condition of task.conditions)assert.ok(taskRow.textContent.includes(condition.label||condition.description),'完整条件：'+task.id);
      const explanation=e.key('task-description-'+task.id);if(explanation){const disclosure=openDisclosure(explanation);assert.ok(disclosure.textContent.includes(task.description));}
    }
  }
  e.key('chapter-select').choose('2');e.flushFrames();e.tab('daily');e.tab('main');
  assert.equal(e.key('fold-description-2').parentElement.open,true);assert.equal(e.key('task-description-garden_morning').parentElement.open,true);
  assert.equal(JSON.stringify(e.G.state),before);assert.equal(e.outcomes.length,0);assert.equal(e.navigation.length,0);
});
test('真实成就服饰来源先切衣橱页签，再完整导航；无navigate时仍精确到已拥有类别',()=>{
  for(const delegated of [true,false]){
    const e=harness(),reward=e.G.data.achievements.find(entry=>entry.id==='baker_3').reward,outfit=e.G.data.outfitById[reward.outfitId];
    e.G.store.update(s=>{s.avatar.owned[outfit.id]=true;for(const id of ['baker_1','baker_2','baker_3'])s.quests.achievements[id]=true;});
    e.G.runtime.avatarUI={tab:'presets',category:'shoes',filter:'shop'};
    if(delegated)e.api.navigate=action=>{assert.equal(e.G.runtime.avatarUI.tab,'clothes','导航执行前已选中衣橱');e.navigation.push(action);};else delete e.api.navigate;
    const before=JSON.stringify(e.G.state);e.render();e.tab('achievements');e.category('baker');assert.ok(e.key('achievement-baker_3').textContent.includes(outfit.name));
    const source=e.click('outfit-baker_3');assert.equal(e.G.runtime.avatarUI.tab,'clothes');
    if(delegated)assert.deepEqual(plain(e.navigation.at(-1)),{panel:'avatar',outfitId:outfit.id});
    else{assert.equal(e.navigation.at(-1).panel,'avatar');assert.equal(e.G.runtime.avatarUI.category,outfit.category);assert.equal(e.G.runtime.avatarUI.filter,'owned');}
    assert.equal(JSON.stringify(e.G.state),before);assert.equal(e.outcomes.length,0);
    const calls=e.navigation.length;e.close();e.G.runtime.avatarUI.tab='face';source.dispatch('click');assert.equal(e.navigation.length,calls);assert.equal(e.G.runtime.avatarUI.tab,'face','关闭后的旧来源不能切换新页面');
  }
});
test('主线服饰action保持原对象全部字段，指标后备导航也能离开预设页',()=>{
  const e=harness(),read=e.G.sys.quests.list,outfit=e.G.data.outfitById.dress_daisy,action={panel:'avatar',outfitId:outfit.id,category:outfit.category,extra:{keep:true}};
  e.G.runtime.avatarUI={tab:'face',category:'shoes',filter:'owned'};
  e.G.sys.quests.list=()=>read().map(task=>task.id==='name_home'?{...task,done:false,action}:task);
  e.api.navigate=value=>{assert.equal(e.G.runtime.avatarUI.tab,'clothes');e.navigation.push(value);};
  const before=JSON.stringify(e.G.state);e.render();e.click('go-name_home');assert.equal(e.navigation.at(-1),action);assert.deepEqual(plain(e.navigation.at(-1).extra),{keep:true});
  delete e.api.navigate;e.G.runtime.avatarUI.tab='presets';e.G.sys.quests.list=()=>read().map(task=>task.id==='name_home'?{...task,done:false,action:null,metric:'outfitsOwned'}:task);
  e.render();e.click('go-name_home');assert.equal(e.navigation.at(-1).panel,'avatar');assert.equal(e.G.runtime.avatarUI.tab,'clothes');assert.equal(JSON.stringify(e.G.state),before);assert.equal(e.outcomes.length,0);
});
let passed=0;for(const [name,fn]of tests){try{fn();passed++;console.log('PASS '+name);}catch(error){console.error('FAIL '+name);throw error;}}console.log('成长册UI：'+passed+'组通过（轻DOM/合成存档；不代表浏览器整页/设备验收）');
