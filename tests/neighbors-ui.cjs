'use strict';
// 真实账号入口与邻居UI，隔离DOM/API验证主动公开、账号切换和失败恢复；无监听。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), tests = [], plain = value => JSON.parse(JSON.stringify(value));
const idle = () => new Promise(resolve => setImmediate(resolve));
const account = { id: 'child_a', username: 'private_account_name', displayName: '小熊' }, otherAccount = { id: 'child_b', username: 'another_private_name', displayName: '小鹿' };
const ownHouse = { id: '11111111-1111-4111-8111-111111111111', title: '我的公开屋', displayName: '云朵建筑师', roomCount: 2, updatedAt: 1793232000000, sourceRevision: 7 };
const neighbor = { id: '22222222-2222-4222-8222-222222222222', title: '草莓小屋', displayName: '小兔建筑师', roomCount: 3, updatedAt: 1793232001000 };
function test(name, fn) { tests.push({ name, fn }); }
function sandbox(initial = {}, options = {}) {
  let state = { available: true, account: null, phase: 'guest', binding: false, busy: false, dirty: false, readOnly: false, restoreRequired: false, remote: null, ...initial };
  const events = {}, calls = [], answers = [], confirmations = [], opens = [], handlers = { ...options.handlers }, documentEvents = {}, windowEvents = {}, timers = new Map(); let timerId = 0;
  const document = { activeElement: null, hidden: false, currentScript: { src: 'https://game.test/play/releases/r-' + 'a'.repeat(64) + '/js/ui/neighbors.js' }, addEventListener(name, fn) { (documentEvents[name] ||= []).push(fn); } };
  class Node {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.attributes = {}; this.listeners = {}; this.className = ''; this._text = ''; this.value = ''; this.disabled = false; this.style = {}; }
    set textContent(value) { this._text = String(value); this.children = []; }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    set innerHTML(_) { throw new Error('公开内容不得作为HTML写入'); }
    append(...children) { children.forEach(child => { if (child.parentElement) child.parentElement.children = child.parentElement.children.filter(value => value !== child); this.children.push(child); child.parentElement = this; }); }
    insertBefore(child, sibling) { if (child === sibling) return; if (document.activeElement && descendants(child).includes(document.activeElement)) document.activeElement = null; if (child.parentElement) child.parentElement.children = child.parentElement.children.filter(value => value !== child); const i = sibling === null ? this.children.length : this.children.indexOf(sibling); assert.ok(i >= 0); this.children.splice(i, 0, child); child.parentElement = this; }
    removeChild(child) { if (document.activeElement && descendants(child).includes(document.activeElement)) document.activeElement = null; const i = this.children.indexOf(child); assert.ok(i >= 0); this.children.splice(i, 1); child.parentElement = null; }
    replaceChildren(...children) { this.children.forEach(child => { child.parentElement = null; }); this.children = []; this._text = ''; this.append(...children); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    removeAttribute(name) { delete this.attributes[name]; }
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
    fire(name, extra = {}) { return Promise.all((this.listeners[name] || []).map(fn => fn({ preventDefault() {}, ...extra }))); }
    click() { return this.disabled ? Promise.resolve([]) : this.fire('click'); }
    focus() { document.activeElement = this; }
    querySelectorAll(selector) { return descendants(this).filter(node => selector === '[data-cloud-action]' && node.dataset.cloudAction); }
    get classList() {
      const has = name => this.className.split(/\s+/).includes(name);
      const change = (name, add) => { const values = new Set(this.className.split(/\s+/).filter(Boolean)); if (add) values.add(name); else values.delete(name); this.className = [...values].join(' '); return !!add; };
      return { contains: has, add: name => change(name, true), remove: name => change(name, false), toggle: (name, add) => change(name, add === undefined ? !has(name) : add) };
    }
  }
  function descendants(node) { return [node, ...node.children.flatMap(descendants)]; }
  const page = new Node('body'), app = new Node('div'), hud = new Node('header'), world = new Node('main'), panelRoot = new Node('div'); app.id = 'app'; hud.id = 'hud'; world.id = 'world'; panelRoot.id = 'panel-body'; app.append(hud, world, panelRoot); page.append(app);
  document.createElement = tag => new Node(tag); document.getElementById = id => descendants(page).find(node => node.id === id) || null;
  const G = {
    state: { house: { name: '我自己的小屋', rooms: { room_a: {}, room_b: {} } }, level: 6, wallet: { coin: 425 }, profile: { birthday: 'private-date' } },
    cloud: { status: () => plain(state), async requestPublic(route) { if (route === '/neighbors/online') { calls.push({ name: 'online', route }); return handlers.online ? handlers.online(route) : { houses: [] }; } calls.push({ name: 'public', route }); return handlers.public ? handlers.public(route) : { houses: [neighbor], nextCursor: null }; },
      async requestAccount(route, method, body) { calls.push({ name: method, route, body: body && plain(body) }); if (handlers[method]) return handlers[method](route, body); return method === 'GET' ? { publication: options.mine || null } : method === 'DELETE' ? { ok: true } : { publication: { ...ownHouse, title: body.title, displayName: body.displayName, sourceRevision: body.expectedRevision } }; },
      async syncNow() { calls.push({ name: 'sync' }); return handlers.sync ? handlers.sync() : { ok: true }; } },
    bus: { on(name, fn) { (events[name] ||= []).push(fn); }, emit(name) { (events[name] || []).slice().forEach(fn => fn()); } },
    save: { exportJson() { throw new Error('邻居不能导出私人存档'); } },
    store: { update() { throw new Error('邻居不能写游戏进度'); }, replace() { throw new Error('邻居不能替换游戏进度'); } },
    ui: { async confirm(message, info) { confirmations.push({ message, info }); const answer = answers.length ? answers.shift() : false; return typeof answer === 'function' ? answer() : answer; }, open(name) { opens.push(name); if (name === 'neighbors') panelRoot.append(G.ui.neighbors.panel().content); } }
  };
  const env = vm.createContext({ window: { Game: G, addEventListener(name, fn) { (windowEvents[name] ||= []).push(fn); } }, document, console, Date, URLSearchParams,
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; }, clearTimeout(id) { timers.delete(id); },
    localStorage: { getItem() { throw new Error('邻居UI不得读localStorage'); }, setItem() { throw new Error('邻居UI不得写localStorage'); } }, fetch() { throw new Error('邻居UI必须通过adapter'); } });
  for (const file of ['js/ui/cloud-account.js', 'js/ui/neighbors.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), env, { filename: file });
  G.ui.cloudAccount.init(); G.ui.neighbors.init();
  if (!options.closed) G.ui.neighbors.open();
  const all = () => descendants(page), body = () => G.ui.neighbors.panel().content;
  const hidden = node => !!(!node || node.classList.contains('hidden') || node.parentElement && hidden(node.parentElement));
  function control(label) { const node = all().find(value => value.tagName === 'BUTTON' && value.textContent === label && !hidden(value)); assert.ok(node, label); return node; }
  function field(name) { const node = all().find(value => value.tagName === 'INPUT' && value.name === name); assert.ok(node, name); return node; }
  return { G, all, calls, body, opens, confirmations, hidden, control, field, document, node: id => document.getElementById(id),
    state: () => state, change(value) { state = { ...state, ...value }; G.bus.emit('cloud:change'); }, handle(name, fn) { handlers[name] = fn; }, answer(value) { answers.push(value); },
    count: name => calls.filter(value => value.name === name).length,
    rows: () => all().filter(node => node.classList.contains('neighbors-row')),
    onlineRows: () => all().filter(node => node.classList.contains('neighbors-online-row')),
    async tick() { const pending = [...timers.entries()]; pending.forEach(([id, task]) => { timers.delete(id); assert.equal(task.delay, 10000); task.fn(); }); await idle(); },
    timerCount: () => timers.size,
    async visible(value) { document.hidden = !value; (documentEvents.visibilitychange || []).forEach(fn => fn()); await idle(); },
    async page(name) { (windowEvents[name] || []).forEach(fn => fn()); await idle(); },
    async list() { await all().find(node => node.classList.contains('ui-tab') && node.textContent === '邻居小屋').click(); await idle(); },
    async mine() { await control('公开我的小屋').click(); await idle(); }, submit: () => all().find(value => value.tagName === 'FORM' && value.classList.contains('neighbors-form')).fire('submit') };
}
const signed = { account, binding: true, phase: 'ready', remote: { revision: 7 } };
test('主界面直接提供可选登录和邻居，初始化不读私档或发送请求', async () => {
  const s = sandbox({}, { closed: true }); assert.match(s.node('account-entry').textContent, /登录 \/ 注册/); assert.match(s.node('account-entry').textContent, /不登录也能玩/); assert.equal(s.calls.length, 0);
  assert.equal(s.node('app').children[1].id, 'account-bar'); assert.ok(s.node('app').classList.contains('has-account-bar'));
  await s.node('account-entry').click(); assert.equal(s.opens.at(-1), 'cloudAccount'); await s.node('neighbors-entry').click(); assert.equal(s.opens.at(-1), 'neighbors'); await idle(); assert.equal(s.count('GET'), 0);
});
test('主入口实时显示本人的昵称与同步状态，过期后回到登录提示', () => {
  const s = sandbox({}, { closed: true }); s.change(signed); assert.match(s.node('account-entry').textContent, /小熊已同步/);
  s.change({ phase: 'conflict' }); assert.match(s.node('account-entry').textContent, /请选择进度/);
  s.change({ phase: 'expired' }); assert.match(s.node('account-entry').textContent, /登录 \/ 注册重新登录/); assert.doesNotMatch(s.node('account-entry').textContent, /private_account_name/);
});
test('来宾可参观，列表文本按纯文字呈现且链接只去隔离访客入口', async () => {
  const s = sandbox(), before = JSON.stringify(s.G.state); await idle(); s.handle('public', () => ({ houses: [{ ...neighbor, title: '<img src=x>' }], nextCursor: null })); s.G.neighbors.refresh(); await idle();
  assert.equal(s.count('GET'), 0); assert.match(s.rows()[0].textContent, /<img src=x>/); const link = s.rows()[0].children.find(value => value.tagName === 'A');
  assert.equal(link.href, '/play/visit/' + neighbor.id); assert.equal(link.target, '_blank'); assert.match(link.rel, /noopener/); assert.equal(JSON.stringify(s.G.state), before);
});
test('先显示其它孩子的小屋，本人的公开信息留在自己的页签', async () => {
  const s = sandbox(signed, { mine: ownHouse }); await idle(); s.handle('public', () => ({ houses: [ownHouse, neighbor], nextCursor: null })); s.G.neighbors.refresh(); await idle();
  assert.equal(s.rows().length, 1); assert.match(s.rows()[0].textContent, /草莓小屋/); await s.mine(); assert.match(s.body().textContent, /我的公开屋/); assert.equal(s.field('public-display-name').value, ownHouse.displayName);
});
test('主人可从本人公开页直接接待朋友，进入隔离小屋后只尝试一次快捷加入', async () => {
  const s = sandbox(signed, { mine: ownHouse }); await idle(); await s.mine();
  const mine = s.all().find(n => n.tagName === 'A' && n.textContent === '接待朋友，一起玩'); assert.ok(mine); assert.equal(mine.href, '/play/visit/' + ownHouse.id + '#join'); assert.equal(mine.target, '_blank'); assert.match(s.body().textContent, /主界面会提醒/);
});
test('新公开表单默认通用展示称呼，草稿与焦点不被同步刷新重建', async () => {
  const s = sandbox(signed); await idle(); await s.mine(); const title = s.field('public-title'); assert.equal(s.field('public-display-name').value, '小小建筑师'); assert.notEqual(s.field('public-display-name').value, account.username);
  title.value = '我的新标题'; await title.fire('input'); title.focus(); const content = s.body(); s.change({ message: '计时刷新' }); assert.equal(s.body(), content); assert.equal(s.field('public-title'), title); assert.equal(title.value, '我的新标题'); assert.equal(s.G.state.house.name, '我自己的小屋');
});
test('只有确认后才先同步再发布，上传只含公开文字与当前修订', async () => {
  const s = sandbox(signed); await idle(); await s.mine(); s.field('public-title').value = '公开新小屋'; s.field('public-display-name').value = '薄荷朋友';
  s.answer(false); await s.submit(); assert.equal(s.count('sync'), 0); assert.equal(s.count('POST'), 0);
  s.answer(true); await s.submit(); assert.equal(s.count('sync'), 1); assert.equal(s.count('POST'), 1);
  const post = s.calls.find(value => value.name === 'POST'); assert.deepEqual(post.body, { title: '公开新小屋', displayName: '薄荷朋友', expectedRevision: 7 }); assert.ok(s.calls.indexOf(post) > s.calls.findIndex(value => value.name === 'sync'));
  assert.match(s.confirmations.at(-1).message, /账号名、生日、相册和完整进度不会公开/); assert.match(s.body().textContent, /公开模样已收好/);
});
test('冲突、坏档、未关联和其它页只读都不能公开临时小屋', async () => {
  for (const change of [{ phase: 'conflict' }, { restoreRequired: true }, { binding: false }, { readOnly: true }, { phase: 'offline' }]) {
    const s = sandbox({ ...signed, ...change }); await idle(); await s.mine(); assert.equal(s.control('公开这个模样').disabled, true); s.answer(true); await s.submit(); assert.equal(s.count('POST'), 0); assert.equal(s.count('sync'), 0);
  }
});
test('确认或同步期间换账号，旧操作不能向新账号发布', async () => {
  const s = sandbox(signed); await idle(); await s.mine(); let accept; s.answer(() => new Promise(resolve => { accept = resolve; })); const pending = s.submit();
  s.change({ account: otherAccount }); accept(true); await pending; await idle(); assert.equal(s.count('POST'), 0); assert.equal(s.count('sync'), 0);
  let resolve; s.handle('sync', () => new Promise(done => { resolve = done; })); s.answer(true); const syncing = s.submit(); await idle(); s.change({ account }); resolve({ ok: true }); await syncing; assert.equal(s.count('POST'), 0);
});
test('迟到的本人公开状态不污染另一孩子的表单和列表', async () => {
  let resolve; const s = sandbox(signed, { closed: true, handlers: { GET: () => new Promise(done => { resolve = done; }) } }); await s.node('neighbors-entry').click(); await idle();
  s.handle('GET', () => ({ publication: null })); s.change({ account: otherAccount }); await idle(); resolve({ publication: ownHouse }); await idle(); await s.mine();
  assert.equal(s.G.neighbors.status().published, false); assert.equal(s.field('public-display-name').value, '小小建筑师'); assert.doesNotMatch(s.body().textContent, /云朵建筑师/);
});
test('撤下需确认且只删公开内容，取消不调用接口、成功后保留私档', async () => {
  const s = sandbox(signed, { mine: ownHouse }), before = JSON.stringify(s.G.state); await idle(); await s.mine();
  s.answer(false); await s.control('撤下公开模样').click(); assert.equal(s.count('DELETE'), 0);
  s.answer(true); await s.control('撤下公开模样').click(); assert.equal(s.count('DELETE'), 1); assert.deepEqual(s.calls.find(value => value.name === 'DELETE').body, {}); assert.equal(s.G.neighbors.status().published, false); assert.equal(JSON.stringify(s.G.state), before); assert.match(s.body().textContent, /自己的小屋进度还在/);
});
test('未关联或本机坏档也能撤下本人已公开的模样，不用先覆盖本机进度', async () => {
  const s = sandbox({ ...signed, binding: false, phase: 'choose', restoreRequired: true }, { mine: ownHouse }); await idle(); await s.mine();
  assert.equal(s.control('更新公开模样').disabled, true); assert.equal(s.control('撤下公开模样').disabled, false); s.answer(true); await s.control('撤下公开模样').click(); assert.equal(s.count('DELETE'), 1); assert.equal(s.count('sync'), 0);
});
test('发布响应迟到时不能把前一个账号的公开信息带到另一个孩子', async () => {
  const s = sandbox(signed); await idle(); await s.mine(); let resolve; s.handle('POST', () => new Promise(done => { resolve = done; }));
  s.answer(true); const pending = s.submit(); await idle(); assert.equal(s.count('POST'), 1); s.change({ account: otherAccount }); await idle(); resolve({ publication: ownHouse }); await pending;
  assert.equal(s.G.neighbors.status().published, false); assert.doesNotMatch(s.body().textContent, /云朵建筑师/); assert.equal(s.field('public-display-name').value, '小小建筑师');
});
test('分页合并去重，刷新失败保留已读的邻居并提供重试', async () => {
  const s = sandbox({}, { closed: true }); let page = 0; const third = { ...neighbor, id: '33333333-3333-4333-8333-333333333333', title: '薄荷小屋' };
  s.handle('public', route => { page++; return route.includes('cursor=') ? { houses: [neighbor, third], nextCursor: null } : { houses: [neighbor], nextCursor: 'next safe cursor' }; }); await s.node('neighbors-entry').click(); await idle();
  await s.control('再看看更多小屋').click(); await idle(); assert.equal(s.rows().length, 2); assert.ok(s.calls.some(value => value.route.includes('cursor=next%20safe%20cursor')));
  s.handle('public', () => { throw new Error('邻居暂时没有连上，请重试。'); }); await s.control('刷新邻居').click(); await idle(); assert.equal(s.rows().length, 2); assert.match(s.body().textContent, /暂时没有连上/); assert.equal(s.control('刷新邻居').disabled, false); assert.equal(page, 2);
});
test('同步失败与公开修订冲突保留草稿，允许重新确认重试', async () => {
  const s = sandbox(signed); await idle(); await s.mine(); const title = s.field('public-title'); title.value = '需要保留的草稿'; await title.fire('input');
  s.handle('sync', () => ({ ok: false, message: '请先在账号面板选好两份进度。' })); s.answer(true); await s.submit(); assert.equal(s.count('POST'), 0); assert.equal(title.value, '需要保留的草稿'); assert.match(s.body().textContent, /选好两份进度/);
  s.handle('sync', () => ({ ok: true })); s.handle('POST', () => { const error = new Error('changed'); error.status = 412; throw error; }); s.answer(true); await s.submit(); assert.match(s.body().textContent, /先同步并确认进度/); assert.equal(s.field('public-title'), title); assert.equal(title.value, '需要保留的草稿'); assert.equal(s.control('公开这个模样').disabled, false);
});
test('离线文件入口不发邻居请求，登录仍可选且游戏数据不变', async () => {
  const s = sandbox({ available: false, phase: 'offline' }), before = JSON.stringify(s.G.state); await idle(); assert.equal(s.calls.length, 0); assert.match(s.body().textContent, /离线文件版暂时不能读取邻居/); assert.equal(s.control('刷新邻居').disabled, true); assert.equal(JSON.stringify(s.G.state), before);
});
const onlineHouse = (house, names, hostOnline = true) => ({ ...house, online: { count: names.length, hostOnline, displayNames: names } });
const linkIn = row => row.children.find(node => node.tagName === 'A');
test('在线小朋友置顶并显示称呼、人数和屋主状态，自己的小屋有人也保留且普通区去重', async () => {
  const s = sandbox(signed, { closed: true, mine: ownHouse }), before = JSON.stringify(s.G.state), other = { ...neighbor, id: '33333333-3333-4333-8333-333333333333', title: '离线薄荷小屋' };
  s.handle('online', () => ({ houses: [onlineHouse(neighbor, ['小云', '<小雨>']), onlineHouse(ownHouse, ['来我家的朋友'], false)] }));
  s.handle('public', () => ({ houses: [ownHouse, neighbor, other], nextCursor: null })); await s.node('neighbors-entry').click(); await idle();
  assert.equal(s.onlineRows().length, 2); assert.equal(s.rows().length, 3); assert.equal(s.rows()[0].dataset.houseId, neighbor.id); assert.match(s.rows()[0].textContent, /2位在线/); assert.match(s.rows()[0].textContent, /小云、<小雨>/); assert.match(s.rows()[0].textContent, /屋主也在这里/);
  assert.match(s.onlineRows()[1].textContent, /我家有小伙伴/); assert.match(s.onlineRows()[1].textContent, /屋主暂时不在/); assert.equal(linkIn(s.rows()[0]).textContent, '敲门串门'); assert.equal(linkIn(s.rows()[0]).href, '/play/visit/' + neighbor.id + '#join'); assert.match(linkIn(s.rows()[0]).rel, /noopener/);
  assert.equal(linkIn(s.rows()[2]).href, '/play/visit/' + other.id); assert.equal(linkIn(s.rows()[2]).textContent, '路过看看'); assert.equal(JSON.stringify(s.G.state), before); assert.doesNotMatch(s.body().textContent, /private_account_name/);
});
test('满员有明确文字，查看入口不触发自动加入，未在线小屋有独立状态', async () => {
  const s = sandbox({}, { closed: true }), empty = { ...neighbor, id: '33333333-3333-4333-8333-333333333333', title: '安静小屋' };
  s.handle('online', () => ({ houses: [onlineHouse(neighbor, Array.from({ length: 8 }, (_, i) => '朋友' + (i + 1)))] })); s.handle('public', () => ({ houses: [neighbor, empty], nextCursor: null })); await s.node('neighbors-entry').click(); await idle();
  assert.match(s.rows()[0].textContent, /8位在线 · 小屋满员/); assert.equal(linkIn(s.rows()[0]).textContent, '路过看看'); assert.equal(linkIn(s.rows()[0]).href.includes('#join'), false); assert.match(s.rows()[1].textContent, /暂时没人串门/);
});
test('十秒刷新只在打开的列表前台运行，关闭、页签、隐藏和离页均停止，回来立即更新', async () => {
  const s = sandbox({}, { closed: true }); assert.equal(s.timerCount(), 0); assert.equal(s.count('online'), 0);
  await s.node('neighbors-entry').click(); await idle(); assert.equal(s.count('online'), 1); assert.equal(s.timerCount(), 1); await s.tick(); assert.equal(s.count('online'), 2);
  await s.mine(); assert.equal(s.timerCount(), 0); await s.tick(); assert.equal(s.count('online'), 2); await s.list(); assert.equal(s.count('online'), 3);
  await s.visible(false); assert.equal(s.timerCount(), 0); await s.tick(); assert.equal(s.count('online'), 3); await s.visible(true); assert.equal(s.count('online'), 4);
  await s.page('pagehide'); assert.equal(s.timerCount(), 0); await s.tick(); assert.equal(s.count('online'), 4); await s.page('pageshow'); assert.equal(s.count('online'), 5);
  s.G.neighbors.close(); assert.equal(s.timerCount(), 0); await s.tick(); assert.equal(s.count('online'), 5); await s.node('neighbors-entry').click(); await idle(); assert.equal(s.count('online'), 6);
});
test('定时变化原位更新链接与在线排序，跨在线/普通区仍保留键盘焦点，不重建发布草稿', async () => {
  const s = sandbox(signed, { closed: true }), second = { ...neighbor, id: '33333333-3333-4333-8333-333333333333', title: '薄荷小屋' }; let list = [onlineHouse(neighbor, ['小云']), onlineHouse(second, ['小雨'])];
  s.handle('online', () => ({ houses: list })); s.handle('public', () => ({ houses: [neighbor, second], nextCursor: null })); await s.node('neighbors-entry').click(); await idle();
  const first = s.onlineRows()[0], focused = linkIn(first); focused.focus(); list = [onlineHouse(second, ['小雨', '小鹿']), onlineHouse(neighbor, ['小云', '小熊'])]; await s.tick(); assert.equal(s.onlineRows()[1], first); assert.equal(linkIn(first), focused); assert.equal(s.document.activeElement, focused); assert.match(first.textContent, /小云、小熊/);
  list = [onlineHouse(second, ['小雨'])]; await s.tick(); assert.equal(s.rows().find(row => row.dataset.houseId === neighbor.id), first); assert.equal(s.document.activeElement, focused); assert.equal(focused.href.includes('#join'), false);
  await s.mine(); const title = s.field('public-title'); title.value = '没有丢掉的草稿'; await title.fire('input'); title.focus(); const content = s.body(); await s.tick(); s.change({ message: '普通同步反馈' }); assert.equal(s.body(), content); assert.equal(s.field('public-title'), title); assert.equal(title.value, '没有丢掉的草稿'); assert.equal(s.document.activeElement, title);
});
test('刷新失败保留过期记录但撤销绿色在线和直接加入，恢复后再次提供聊天入口', async () => {
  const s = sandbox({}, { closed: true }); s.handle('online', () => ({ houses: [onlineHouse(neighbor, ['小云'])] })); await s.node('neighbors-entry').click(); await idle(); const row = s.onlineRows()[0], link = linkIn(row);
  s.handle('online', () => { throw new Error('网络暂不可用'); }); await s.tick(); assert.equal(s.onlineRows()[0], row); assert.match(row.textContent, /上次有1位在玩/); assert.match(row.textContent, /上次在这里玩：小云/); assert.equal(link.href.includes('#join'), false); assert.equal(s.all().some(node => node.classList.contains('neighbors-presence') && node.classList.contains('is-online')), false); assert.match(s.body().textContent, /在线状态暂时无法更新/); assert.equal(s.G.neighbors.status().onlineStale, true);
  s.handle('online', () => ({ houses: [onlineHouse(neighbor, ['小云', '小雨'])] })); await s.control('刷新邻居').click(); await idle(); assert.equal(linkIn(s.onlineRows()[0]), link); assert.equal(link.href.endsWith('#join'), true); assert.match(row.textContent, /2位在线/); assert.equal(s.G.neighbors.status().onlineStale, false);
});
test('关闭、切账号和隐藏期间迟到的在线响应不复活旧列表或覆盖新结果', async () => {
  const s = sandbox(signed, { closed: true }); let resolve; s.handle('online', () => new Promise(done => { resolve = done; })); await s.node('neighbors-entry').click(); await idle(); s.G.neighbors.close(); resolve({ houses: [onlineHouse(neighbor, ['旧朋友'])] }); await idle(); assert.equal(s.G.neighbors.status().onlineHouseCount, 0);
  s.handle('online', () => ({ houses: [] })); await s.node('neighbors-entry').click(); await idle(); let old; s.handle('online', () => new Promise(done => { old = done; })); await s.tick(); s.handle('online', () => ({ houses: [onlineHouse(neighbor, ['新朋友'])] })); s.change({ account: otherAccount }); await idle(); old({ houses: [onlineHouse(ownHouse, ['旧账号朋友'])] }); await idle(); assert.equal(s.G.neighbors.status().onlineHouseCount, 1); assert.match(s.onlineRows()[0].textContent, /新朋友/); assert.doesNotMatch(s.body().textContent, /旧账号朋友/);
  let hidden; s.handle('online', () => new Promise(done => { hidden = done; })); await s.tick(); await s.visible(false); hidden({ houses: [] }); await idle(); assert.equal(s.G.neighbors.status().onlineHouseCount, 1); assert.equal(s.timerCount(), 0);
});
test('在线人员离开后小屋回普通区，成功空列表不冒充服务器故障', async () => {
  const s = sandbox({}, { closed: true }); let active = true; s.handle('online', () => ({ houses: active ? [onlineHouse(neighbor, ['小云'])] : [] })); await s.node('neighbors-entry').click(); await idle(); const row = s.onlineRows()[0]; active = false; await s.tick(); assert.equal(s.onlineRows().length, 0); assert.equal(s.rows()[0], row); assert.match(row.textContent, /暂时没人串门/); assert.match(s.body().textContent, /暂时没人串门，可以先逛逛/); assert.doesNotMatch(s.body().textContent, /状态暂时无法更新/); assert.equal(linkIn(row).href.includes('#join'), false);
});
test('非法在线摘要不被显示为新在线状态，只有服务器返回的有限公开称呼可见', async () => {
  for (const value of [onlineHouse(neighbor, []), { ...onlineHouse(neighbor, ['小云']), online: { count: 2, hostOnline: true, displayNames: ['小云'] } }, onlineHouse(neighbor, ['换\n行']), { ...onlineHouse(neighbor, ['小云']), online: { count: 1, hostOnline: 'yes', displayNames: ['小云'] } }]) {
    const s = sandbox({}, { closed: true }); s.handle('online', () => ({ houses: [value] })); await s.node('neighbors-entry').click(); await idle(); assert.equal(s.onlineRows().length, 0); assert.match(s.body().textContent, /在线状态暂时无法更新/); assert.equal(s.all().some(node => node.tagName === 'A' && (node.href || '').endsWith('#join')), false);
  }
});
test('主人不打开邻居面板也能看到访客人数与公开称呼，并有安全的一键接待入口', async () => {
  const s = sandbox(signed, { closed: true, mine: ownHouse }), before = JSON.stringify(s.G.state);
  s.G.live = { join() { throw new Error('主人主界面不能自动加入或替换另一个标签成员'); }, quickJoin() { throw new Error('只可通过明确接待入口加入'); } };
  s.handle('online', () => ({ houses: [onlineHouse(ownHouse, ['<小橘>', '薄荷朋友'], false)] })); await idle();
  assert.equal(s.opens.length, 0); assert.equal(s.count('GET'), 1); assert.equal(s.count('online'), 1); assert.equal(s.timerCount(), 1); assert.equal(s.hidden(s.node('neighbors-entry')), false);
  const reception = s.node('neighbors-reception'); assert.equal(s.hidden(reception), false); assert.equal(reception.textContent, '接待朋友 · 2位'); assert.equal(reception.href, '/play/visit/' + ownHouse.id + '#join'); assert.equal(reception.target, '_blank'); assert.match(reception.rel, /noopener/);
  assert.match(reception.attributes['aria-label'], /<小橘>、薄荷朋友/); assert.doesNotMatch(reception.attributes['aria-label'], /private_account_name|private-date|child_a/); assert.equal(JSON.stringify(s.G.state), before); assert.equal(s.count('POST'), 0);
});
test('关闭邻居面板或切到公开表单后主人提醒仍刷新，朋友离开即收起接待提示', async () => {
  const s = sandbox(signed, { closed: true, mine: ownHouse }); let names = ['来访小熊']; s.handle('online', () => ({ houses: [onlineHouse(ownHouse, names, false)] })); await idle();
  await s.node('neighbors-entry').click(); await idle(); await s.mine(); s.G.neighbors.close(); assert.equal(s.timerCount(), 1);
  names = ['来访小熊', '来访小鹿']; await s.tick(); assert.equal(s.node('neighbors-reception').textContent, '接待朋友 · 2位');
  s.handle('online', () => ({ houses: [] })); await s.tick(); assert.equal(s.hidden(s.node('neighbors-reception')), true); assert.equal(s.node('neighbors-reception').attributes.href, undefined); assert.equal(s.G.neighbors.homePresence().count, 0);
});
test('主人另页自己在线不算来访，满员时提醒保留但不自动快捷加入', async () => {
  const s = sandbox(signed, { closed: true, mine: ownHouse }); let names = ['主人公开称呼']; s.handle('online', () => ({ houses: [onlineHouse(ownHouse, names, true)] })); await idle(); assert.equal(s.hidden(s.node('neighbors-reception')), true);
  names = ['主人公开称呼', '来访朋友']; await s.tick(); assert.equal(s.G.neighbors.homePresence().count, 1); assert.match(s.node('neighbors-reception').textContent, /1位/);
  names = Array.from({ length: 8 }, (_, i) => '朋友' + i); await s.tick(); assert.match(s.node('neighbors-reception').textContent, /我家满员 · 7位/); assert.equal(s.node('neighbors-reception').href.endsWith('#join'), false); assert.match(s.node('neighbors-reception').attributes['aria-label'], /满员/);
});
test('后台停止访客查询并撤销过期接待入口，返回即刷新，失败后不能把上次访客称作在线', async () => {
  const s = sandbox(signed, { closed: true, mine: ownHouse }); s.handle('online', () => ({ houses: [onlineHouse(ownHouse, ['来访小熊'], false)] })); await idle();
  await s.visible(false); const calls = s.count('online'); assert.equal(s.timerCount(), 0); assert.equal(s.hidden(s.node('neighbors-reception')), true); await s.tick(); assert.equal(s.count('online'), calls);
  await s.visible(true); assert.equal(s.count('online'), calls + 1); assert.equal(s.hidden(s.node('neighbors-reception')), false);
  s.handle('online', () => { throw new Error('暂时断网'); }); await s.tick(); assert.equal(s.hidden(s.node('neighbors-reception')), true); assert.equal(s.G.neighbors.homePresence().stale, true);
  s.handle('online', () => ({ houses: [] })); await s.tick(); assert.equal(s.G.neighbors.homePresence().stale, false);
});
test('切账号或退出即清除主人访客称呼，旧请求迟到不恢复另一孩子的接待入口', async () => {
  const s = sandbox(signed, { closed: true, mine: ownHouse }); s.handle('online', () => ({ houses: [onlineHouse(ownHouse, ['旧屋来访小熊'], false)] })); await idle(); assert.equal(s.hidden(s.node('neighbors-reception')), false);
  let finish; s.handle('online', () => new Promise(resolve => { finish = resolve; })); await s.tick(); s.handle('GET', () => ({ publication: null })); s.change({ account: otherAccount }); await idle(); finish({ houses: [onlineHouse(ownHouse, ['迟到旧朋友'], false)] }); await idle();
  assert.equal(s.hidden(s.node('neighbors-reception')), true); assert.equal(s.G.neighbors.homePresence().count, 0); assert.equal(s.timerCount(), 0); assert.doesNotMatch(s.node('account-bar').textContent, /旧屋来访小熊|迟到旧朋友/);
  s.change({ account: null, phase: 'guest', binding: false }); await idle(); assert.equal(s.G.neighbors.homePresence().count, 0);
});
test('未公开小屋与离线入口不会因主人提醒而轮询或主动公开', async () => {
  for (const initial of [signed, { ...signed, available: false, phase: 'offline' }, { account: null, phase: 'guest' }]) {
    const s = sandbox(initial, { closed: true }); await idle(); assert.equal(s.count('online'), 0); assert.equal(s.count('POST'), 0); assert.equal(s.timerCount(), 0); assert.equal(s.hidden(s.node('neighbors-reception')), true);
  }
});
test('冷启动缓存账号不冒充已确认会话，同账号恢复后自动读取公开状态与访客', async () => {
  let sessionConfirmed = false;
  const s = sandbox({ ...signed, phase: 'offline', busy: true }, { closed: true, handlers: { GET: () => { assert.equal(sessionConfirmed, true, '不能在冷启动Cookie握手前读取本人公开状态'); return { publication: ownHouse }; } } });
  s.handle('online', () => ({ houses: [onlineHouse(ownHouse, ['小橘来串门'], false)] })); await idle(); assert.equal(s.count('GET'), 0); assert.equal(s.count('online'), 0);
  s.change({ phase: 'ready', busy: true }); await idle(); assert.equal(s.count('GET'), 0);
  sessionConfirmed = true; s.change({ phase: 'ready', busy: false }); await idle(); assert.equal(s.count('GET'), 1); assert.equal(s.count('online'), 1); assert.equal(s.hidden(s.node('neighbors-reception')), false); assert.match(s.node('neighbors-reception').attributes['aria-label'], /小橘来串门/);
});
test('同账号会话恢复可重试先前失败的公开读取，不被旧mineError永久挡住', async () => {
  const s = sandbox(signed, { closed: true, handlers: { GET: () => { throw new Error('会话暂时没有读出'); } } }); await idle(); assert.equal(s.count('GET'), 1); assert.equal(s.count('online'), 0);
  s.change({ phase: 'offline', busy: true }); await idle(); s.handle('GET', () => ({ publication: ownHouse })); s.handle('online', () => ({ houses: [onlineHouse(ownHouse, ['恢复后的来访朋友'], false)] }));
  s.change({ phase: 'ready', busy: false }); await idle(); assert.equal(s.count('GET'), 2); assert.equal(s.hidden(s.node('neighbors-reception')), false); assert.equal(s.timerCount(), 1);
});
(async () => { for (const entry of tests) { await entry.fn(); console.log('✓ ' + entry.name); } console.log('\n' + tests.length + ' 组主入口、邻居列表与主动公开UI检查通过（无监听，未替代浏览器）。'); })().catch(error => { console.error(error); process.exitCode = 1; });
