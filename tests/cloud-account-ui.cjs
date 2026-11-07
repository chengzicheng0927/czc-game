'use strict';
// 真实账号UI + 可控云接口/轻量DOM，验证选择边界、错误恢复及输入保留；不启动服务。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), tests = [];
const plain = value => JSON.parse(JSON.stringify(value));
function test(name, fn) { tests.push({ name, fn }); }
function sandbox(initial = {}) {
  let state = { available: true, phase: 'guest', account: null, binding: false, remote: null, conflict: null, busy: false, dirty: false, readOnly: false, backups: [], ...initial };
  const calls = [], events = {}, handlers = {}, confirms = [], answers = [], downloads = [], opens = [];
  const document = { activeElement: null };
  class Node {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.attributes = {}; this.listeners = {}; this.className = ''; this._text = ''; this.value = ''; this.disabled = false; }
    set textContent(value) { this._text = String(value); this.children = []; }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    set innerHTML(_) { throw new Error('账号/小屋文本不得作为HTML写入'); }
    append(...children) { children.forEach(child => { if (child.parentElement) child.parentElement.children = child.parentElement.children.filter(node => node !== child); this.children.push(child); child.parentElement = this; }); }
    insertBefore(child, sibling) { if (child.parentElement) child.parentElement.children = child.parentElement.children.filter(node => node !== child); const at = sibling === null ? this.children.length : this.children.indexOf(sibling); assert.ok(at >= 0); this.children.splice(at, 0, child); child.parentElement = this; }
    replaceChildren(...children) { this.children.forEach(child => { child.parentElement = null; }); this.children = []; this._text = ''; this.append(...children); }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    removeAttribute(key) { delete this.attributes[key]; if (key === 'href') delete this.href; }
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
  document.createElement = tag => new Node(tag);
  const page = new Node('body'), app = new Node('div'), hud = new Node('header'), world = new Node('main'); app.id = 'app'; world.id = 'world'; app.append(hud, world); page.append(app);
  document.getElementById = id => descendants(page).find(node => node.id === id) || null;
  const G = {
    state: { house: { name: '今天的小屋', rooms: { room_a: {}, room_b: {} } }, level: 6, wallet: { coin: 740 } },
    save: { exportJson() { downloads.push('local'); return JSON.stringify(G.state); } },
    offline: { status: () => ({ phase: 'preparing', message: '正在准备离线副本，请先保留JSON备份。' }) },
    bus: { on(name, fn) { (events[name] ||= []).push(fn); }, emit(name) { (events[name] || []).slice().forEach(fn => fn()); } },
    ui: { async confirm(message, options) { confirms.push({ message, options }); const answer = answers.length ? answers.shift() : false; return typeof answer === 'function' ? answer() : answer; }, open(name) { opens.push(name); } }, cloud: { status: () => plain(state) }
  };
  for (const name of ['register', 'login', 'logout', 'syncNow', 'bindLocal', 'startNew', 'useCloud', 'resolveConflict', 'downloadCloud', 'takeover', 'downloadBackup', 'forgetBackup']) G.cloud[name] = async (...args) => { calls.push({ name, args }); return handlers[name] ? handlers[name](...args) : { ok: true, message: '已经收好。' }; };
  const environment = vm.createContext({ window: { Game: G }, document, console, Date, localStorage: { setItem() { throw new Error('UI不可持久化账号密码'); }, getItem() { throw new Error('UI不可读取账号密码缓存'); } }, fetch() { throw new Error('UI不可直接请求网络'); } });
  vm.runInContext(fs.readFileSync(path.join(root, 'js/ui/cloud-account.js'), 'utf8'), environment, { filename: 'js/ui/cloud-account.js' });
  G.ui.cloudAccount.init();
  const body = G.ui.cloudAccount.panel().content;
  function descendants(node) { return [node, ...node.children.flatMap(descendants)]; }
  function hidden(node) { return !!(!node || node.classList.contains('hidden') || node.parentElement && hidden(node.parentElement)); }
  const all = () => descendants(body);
  function button(label) { const result = all().find(node => node.tagName === 'BUTTON' && node.textContent === label && !hidden(node)); assert.ok(result, label); return result; }
  function field(name) { const result = all().find(node => node.tagName === 'INPUT' && node.name === name); assert.ok(result, name); return result; }
  const form = () => all().find(node => node.tagName === 'FORM');
  return { G, body, calls, confirms, downloads, opens, all, hidden, button, field, form, node: id => document.getElementById(id),
    status: () => state, change(next) { state = { ...state, ...next }; G.bus.emit('cloud:change'); }, answer(value) { answers.push(value); }, handle(name, fn) { handlers[name] = fn; },
    count(name) { return calls.filter(call => call.name === name).length; }, submit: () => form().fire('submit') };
}
const account = { id: 'a_child', username: 'child_a', displayName: '小熊' };
const remote = { name: '云端小屋', level: 7, coin: 515, roomCount: 3, updatedAt: Date.UTC(2026, 9, 29, 10), revision: 3 };

test('顶栏独立接待入口响应公开访客事件，保持邻居按钮且不自动联网或加入', async () => {
  const s = sandbox({ account, binding: true, phase: 'ready' }), reception = s.node('neighbors-reception'), before = JSON.stringify(s.G.state);
  assert.equal(s.hidden(reception), true); assert.equal(s.hidden(s.node('neighbors-entry')), false);
  let presence = { count: 2, displayNames: ['屋主称呼', '<来访小鹿>', '来访小熊'], href: '/play/visit/11111111-1111-4111-8111-111111111111#join', full: false, stale: false };
  s.G.neighbors = s.G.ui.neighbors = { homePresence: () => presence, open() { s.opens.push('neighbors'); } }; s.G.live = { quickJoin() { throw new Error('顶栏不能自动加入'); } };
  s.G.bus.emit('neighbors:presence'); assert.equal(s.hidden(reception), false); assert.equal(reception.tagName, 'A'); assert.equal(reception.textContent, '接待朋友 · 2位'); assert.equal(reception.href, presence.href); assert.equal(reception.target, '_blank'); assert.match(reception.rel, /noopener/); assert.match(reception.attributes['aria-label'], /屋主称呼、<来访小鹿>、来访小熊/);
  assert.match(s.node('account-bar').textContent, /我家正在玩：屋主称呼、<来访小鹿> 等3位/); assert.doesNotMatch(s.node('account-bar').textContent, /来访者：屋主/); assert.equal(s.hidden(s.node('neighbors-entry')), false); await s.node('neighbors-entry').click(); assert.equal(s.opens.at(-1), 'neighbors');
  presence = { ...presence, count: 7, full: true, href: presence.href.replace('#join', '') }; s.G.bus.emit('neighbors:presence'); assert.equal(reception.textContent, '我家满员 · 7位'); assert.equal(reception.href.endsWith('#join'), false);
  presence = { count: 0, displayNames: [], href: '', full: false, stale: true }; s.G.bus.emit('neighbors:presence'); assert.equal(s.hidden(reception), true); assert.equal(reception.href, undefined); assert.equal(reception.attributes['aria-label'], undefined); assert.match(s.node('account-bar').textContent, /重新确认/);
  assert.equal(s.calls.length, 0); assert.equal(JSON.stringify(s.G.state), before);
});
test('退出与登录过期隐藏顶栏接待链接，旧称呼不泄露给未登录页面', () => {
  const s = sandbox({ account, phase: 'ready' }), reception = s.node('neighbors-reception');
  s.G.neighbors = { homePresence: () => ({ count: 1, displayNames: ['来访小鹿'], href: '/visit/public#join', full: false, stale: false }) }; s.G.bus.emit('neighbors:presence'); assert.equal(s.hidden(reception), false);
  s.change({ phase: 'expired' }); assert.equal(s.hidden(reception), true); assert.equal(reception.href, undefined); assert.doesNotMatch(s.node('account-bar').textContent, /来访小鹿/);
  s.change({ account: null, phase: 'guest' }); s.G.bus.emit('neighbors:presence'); assert.equal(s.hidden(reception), true); assert.equal(s.calls.length, 0);
});
test('紧凑HUD长称呼不撑开外壳，状态仍可访问，完整名单留给接待链接', async () => {
  const s = sandbox({ account, phase: 'ready' }), names = Array.from({ length: 8 }, (_, i) => String(i + 1) + '棉花糖朋友'.repeat(4) + '喵喵喵');
  s.G.neighbors = { homePresence: () => ({ count: 7, displayNames: names, href: '/visit/public', full: true, stale: false }) }; s.G.bus.emit('neighbors:presence');
  const note = s.node('account-bar').children.find(node => node.classList.contains('account-bar-note')), reception = s.node('neighbors-reception');
  assert.match(note.textContent, /…、.*… 等8位/); assert.ok(Array.from(note.textContent).length < 50); assert.doesNotMatch(note.textContent, /3棉花糖朋友/); names.forEach(name => assert.ok(reception.attributes['aria-label'].includes(name)));
  // 备注退出可见HUD，但不能display:none丢掉原有实时状态播报。
  assert.equal(note.attributes.role, 'status'); assert.equal(note.attributes['aria-live'], 'polite');
  const accountEntry = s.node('account-entry'); assert.match(accountEntry.attributes['aria-label'], /已同步/); assert.match(accountEntry.attributes.title, /已同步/);
  await accountEntry.click(); assert.equal(s.opens.at(-1), 'cloudAccount');
  const css = fs.readFileSync(path.join(root, 'css/cloud-account.css'), 'utf8'), declaration = css.match(/\.account-bar-note\s*\{([^}]+)\}/)[1];
  assert.match(declaration, /position:\s*absolute/); assert.match(declaration, /width:\s*1px/); assert.match(declaration, /height:\s*1px/); assert.match(declaration, /overflow:\s*hidden/); assert.match(declaration, /clip-path:\s*inset\(50%\)/); assert.doesNotMatch(declaration, /display:\s*none|visibility:\s*hidden/);
  const nameDeclaration = css.match(/\.account-launch-name\s*\{([^}]+)\}/)[1]; assert.match(nameDeclaration, /overflow:\s*hidden/); assert.match(nameDeclaration, /text-overflow:\s*ellipsis/); assert.match(nameDeclaration, /white-space:\s*nowrap/);
});
test('离线文件说明无云请求，仍可下载本机JSON；离线缓存按真实状态提示', async () => {
  const s = sandbox({ available: false, phase: 'offline' });
  assert.ok(s.hidden(s.form())); assert.match(s.body.textContent, /离线文件版不能登录/); assert.equal(s.calls.length, 0);
  await s.button('下载本机JSON').click(); assert.deepEqual(s.downloads, ['local']); assert.match(s.body.textContent, /正在准备离线副本/);
  s.G.offline.status = () => ({ phase: 'ready', message: '离线副本已准备好。' }); s.G.bus.emit('offline:change'); assert.match(s.body.textContent, /离线副本已准备好/);
});
test('输入有持久标签和密码语义，非法账号与短密码不提交', async () => {
  const s = sandbox(); assert.equal(s.field('username').autocomplete, 'username'); assert.equal(s.field('password').type, 'password'); assert.equal(s.field('password').autocomplete, 'current-password');
  s.field('username').value = '小熊'; s.field('password').value = 'eight letters'; await s.submit(); assert.equal(s.calls.length, 0); assert.equal(s.field('username').attributes['aria-invalid'], 'true');
  s.field('username').value = 'child_a'; s.field('password').value = 'short'; await s.submit(); assert.equal(s.calls.length, 0); assert.equal(s.field('password').attributes['aria-invalid'], 'true');
  assert.ok(s.all().some(node => node.attributes.role === 'alert' && /密码需要/.test(node.textContent)));
});
test('登录失败和定时状态变化不清密码、不重建表单，离开面板清除密码', async () => {
  const s = sandbox(), password = s.field('password'), username = s.field('username'), form = s.form();
  s.handle('login', async () => ({ ok: false, message: '账号或密码没有对上，请再看看。' })); username.value = 'CHILD_A'; password.value = 'not-trim-this ';
  await s.submit(); assert.equal(s.count('login'), 1); assert.equal(s.calls[0].args[0].username, 'child_a'); assert.equal(s.calls[0].args[0].password, 'not-trim-this ');
  assert.equal(password.value, 'not-trim-this '); assert.match(s.body.textContent, /账号或密码没有对上/);
  s.change({ message: '网络刚刚恢复。' }); assert.equal(s.field('password'), password); assert.equal(s.form(), form); assert.equal(s.G.ui.cloudAccount.panel().content, s.body); assert.equal(password.value, 'not-trim-this ');
  s.G.ui.cloudAccount.close(); assert.equal(password.value, '');
});
test('注册只传账号密码和可选昵称，成功清密码且先显示主动关联', async () => {
  const s = sandbox(); await s.button('新建账号').click(); assert.equal(s.field('password').autocomplete, 'new-password');
  s.field('username').value = 'CHILD_A'; s.field('password').value = 'password_a'; s.field('display-name').value = '棉花糖🐻';
  s.handle('register', async details => { assert.deepEqual(plain(details), { username: 'child_a', password: 'password_a', displayName: '棉花糖🐻' }); s.change({ account, phase: 'choose' }); return { ok: true, message: '账号已经准备好，请选择小屋。' }; });
  const before = JSON.stringify(s.G.state); await s.submit(); assert.equal(s.count('register'), 1); assert.equal(s.field('password').value, ''); assert.equal(JSON.stringify(s.G.state), before); assert.match(s.body.textContent, /主动选择|先关联这座小屋/); assert.equal(s.count('bindLocal'), 0);
});
test('首次关联和恢复都要明确确认，取消不调用且两份都可先下载', async () => {
  const s = sandbox({ account, phase: 'choose', remote }), before = JSON.stringify(s.G.state);
  await s.button('下载本机JSON').click(); await s.button('下载云端JSON').click(); assert.equal(s.downloads.length, 1); assert.equal(s.count('downloadCloud'), 1);
  s.answer(false); await s.button('把本机小屋存到账号').click(); assert.equal(s.count('bindLocal'), 0);
  s.answer(true); await s.button('把本机小屋存到账号').click(); assert.equal(s.count('bindLocal'), 1);
  s.answer(true); await s.button('用账号里的小屋继续').click(); assert.equal(s.count('useCloud'), 1); assert.match(s.confirms.at(-1).message, /保留本机副本/); assert.equal(JSON.stringify(s.G.state), before);
});
test('新孩子空账号可选择全新小屋，须确认且不会自动复制当前旧小屋', async () => {
  const s = sandbox({ account, phase: 'choose', remote: null }), before = JSON.stringify(s.G.state);
  assert.match(s.body.textContent, /可以新建一座/); assert.ok(s.button('为这个账号新建小屋')); assert.equal(s.count('startNew'), 0); assert.equal(s.count('bindLocal'), 0);
  s.answer(false); await s.button('为这个账号新建小屋').click(); assert.equal(s.count('startNew'), 0); assert.equal(JSON.stringify(s.G.state), before);
  s.answer(true); await s.button('为这个账号新建小屋').click(); assert.equal(s.count('startNew'), 1); assert.equal(s.count('bindLocal'), 0); assert.match(s.confirms.at(-1).message, /保留当前本机小屋的副本/);
  s.change({ remote }); assert.equal(s.all().filter(node => node.tagName === 'BUTTON' && node.textContent === '为这个账号新建小屋' && !s.hidden(node)).length, 0);
});
test('坏档读取后的临时小屋不能上传或新建，明确恢复云端仍可选', async () => {
  const s = sandbox({ account, phase: 'choose', remote, restoreRequired: true });
  assert.match(s.body.textContent, /本机存档没有完整读出/); assert.equal(s.button('把本机小屋存到账号').disabled, true); assert.equal(s.button('用账号里的小屋继续').disabled, false);
  await s.button('把本机小屋存到账号').click(); assert.equal(s.count('bindLocal'), 0);
  s.answer(true); await s.button('用账号里的小屋继续').click(); assert.equal(s.count('useCloud'), 1);
  s.change({ remote: null }); assert.equal(s.button('为这个账号新建小屋').disabled, true); await s.button('为这个账号新建小屋').click(); assert.equal(s.count('startNew'), 0);
});
test('冲突清楚对照两边并显式选择，不用等级或金币替用户决定', async () => {
  const local = { name: '本机新布置', level: 6, coin: 740, roomCount: 2 }, s = sandbox({ account, binding: true, phase: 'conflict', remote, conflict: { local, cloud: remote } });
  assert.match(s.body.textContent, /本机新布置/); assert.match(s.body.textContent, /云端小屋/); assert.match(s.body.textContent, /金币、家具不会自动拼在一起/); assert.equal(s.count('resolveConflict'), 0);
  s.answer(true); await s.button('继续本机这份').click(); assert.deepEqual(s.calls.at(-1), { name: 'resolveConflict', args: ['local'] });
  s.answer(true); await s.button('继续云端这份').click(); assert.deepEqual(s.calls.at(-1), { name: 'resolveConflict', args: ['cloud'] });
});
test('确认期间远端变化会要求重看，不按陈旧摘要覆盖', async () => {
  const s = sandbox({ account, phase: 'choose', remote }); let accept;
  s.answer(() => new Promise(resolve => { accept = resolve; }));
  const pending = s.button('把本机小屋存到账号').click(); s.change({ remote: { ...remote, revision: 4, name: '刚在别处改好的小屋' } }); accept(true); await pending;
  assert.equal(s.count('bindLocal'), 0); assert.match(s.body.textContent, /进度有了变化/);
});
test('提交中的重复操作不会再次登录，错误正文与密码保留供重试', async () => {
  const s = sandbox(); let resolve;
  s.handle('login', () => new Promise(done => { resolve = done; })); s.field('username').value = 'child_a'; s.field('password').value = 'password_a';
  const pending = s.submit(); await s.submit(); assert.equal(s.count('login'), 1); assert.equal(s.field('password').readOnly, true); assert.equal(s.button('正在登录…').disabled, true);
  resolve({ ok: false, message: '暂时没连上，请重试。' }); await pending; assert.equal(s.field('password').readOnly, false); assert.equal(s.field('password').value, 'password_a'); assert.match(s.body.textContent, /暂时没连上/);
});
test('退出待同步账号先说明副本，拒写不假成功；成功后才能换账号', async () => {
  const s = sandbox({ account, binding: true, phase: 'pending', dirty: true, remote });
  s.handle('logout', async () => ({ ok: false, message: '本机副本暂时没有保存，账号尚未退出。' })); s.answer(true); await s.button('退出账号').click();
  assert.match(s.confirms.at(-1).message, /尚未同步/); assert.match(s.body.textContent, /账号尚未退出/); assert.equal(s.status().account.id, account.id); assert.ok(s.button('下载本机JSON'));
  s.handle('logout', async () => { s.change({ account: null, binding: false, phase: 'guest' }); return { ok: true, message: '已退出，可以换账号。' }; }); s.answer(true); await s.button('退出账号').click(); assert.equal(s.status().account, null); assert.ok(!s.hidden(s.form()));
});
test('其它标签只读时不自动接管，用户确认后才调用接管', async () => {
  const s = sandbox({ account, binding: true, phase: 'other_tab', readOnly: true, remote });
  assert.match(s.body.textContent, /这页只读/); assert.equal(s.button('现在同步').disabled, true); assert.equal(s.count('takeover'), 0);
  s.answer(false); await s.button('在此页继续').click(); assert.equal(s.count('takeover'), 0);
  s.answer(true); await s.button('在此页继续').click(); assert.equal(s.count('takeover'), 1); assert.match(s.confirms.at(-1).message, /另一个页面会暂停写入/);
});
test('副本仅主动下载/确认整理，活动副本无删除按钮，文本不会当HTML执行', async () => {
  const active = { id: 'active', account, active: true, name: '<img src=x>', level: 6, roomCount: 2 }, old = { id: 'old', account: { displayName: '另一个孩子' }, active: false, name: '旧小屋', level: 5, roomCount: 1 };
  const s = sandbox({ account, binding: true, phase: 'ready', remote, backups: [active, old] });
  assert.match(s.body.textContent, /<img src=x>/); assert.equal(s.all().filter(node => node.tagName === 'BUTTON' && node.textContent === '移除本机副本').length, 1);
  const download = s.all().find(node => node.tagName === 'BUTTON' && node.textContent === '下载这份JSON'); await download.click(); assert.deepEqual(s.calls.at(-1), { name: 'downloadBackup', args: ['active'] });
  s.answer(false); await s.button('移除本机副本').click(); assert.equal(s.count('forgetBackup'), 0);
  s.answer(true); await s.button('移除本机副本').click(); assert.deepEqual(s.calls.at(-1), { name: 'forgetBackup', args: ['old'] }); assert.match(s.confirms.at(-1).message, /未同步的内容可能只在这份副本里/);
});

(async () => { for (const entry of tests) { await entry.fn(); console.log('✓ ' + entry.name); } console.log('\n' + tests.length + ' 组账号表单、选择与恢复反馈检查通过（未替代浏览器验收）。'); })().catch(error => { console.error(error); process.exitCode = 1; });
