'use strict';
// 主场景串门会话：状态机、路过不发 live 请求、敲门等待留在自己家、leave 幂等、被请离/撤下退出、
// ui.open 拦截与放行、入口修饰键与兜底、G.state 与存档不被改动、自己房子的接待链接走 hostRoom。
// 轻DOM + 桩：不联网、不启动浏览器、不监听端口；真实加载 live-avatars/live-peers/host-room/visit-session/neighbors。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), plain = x => JSON.parse(JSON.stringify(x)), idle = () => new Promise(r => setImmediate(r));
const ID = '11111111-1111-4111-8111-111111111111', OTHER = '22222222-2222-4222-8222-222222222222', OWN = '33333333-3333-4333-8333-333333333333';
const neighborHouse = { name: '邻居的家', floors: [{ slots: ['room_a', null, null] }], rooms: { room_a: { type: 'bedroom' } } };
const ownHouse = { name: '我的小屋', floors: [{ slots: ['room_a', null, null] }], rooms: { room_a: { type: 'bedroom' } } };

class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.className = ''; this.textContent = ''; this.attributes = {}; this.listeners = {}; this.hidden = false; this.disabled = false; this.parent = null; }
  setAttribute(k, v) { this.attributes[k] = v; }
  append(...nodes) { nodes.forEach(n => { n.parent = this; this.children.push(n); }); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this); this.parent = null; }
  addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
  click() { if (this.disabled) return; (this.listeners.click || []).forEach(fn => fn({ preventDefault() {} })); }
}
const walk = n => [n, ...n.children.flatMap(walk)];
const textOf = n => walk(n).map(x => x.textContent).join('|');

function sandbox(options = {}) {
  const log = { live: [], toasts: [], visitSets: [], redraws: 0, requests: [], mounts: [], panelClose: 0, cloudOpen: 0 };
  const timers = [], windowEvents = {}, bus = {}, listeners = [];
  const reply = { house: { title: '邻居的小屋', displayName: '小云', updatedAt: 'v1' }, snapshot: { state: { house: neighborHouse } } };
  let hold = null, failure = options.requestFail || null;
  let liveState = { phase: 'idle', authenticated: true, houseId: null, peerId: null, revision: 0, houseVersion: '', peers: [], messages: [], error: '' };
  const emit = () => listeners.slice().forEach(fn => fn(plain(liveState)));
  const live = {
    status: () => plain(liveState), subscribe(fn) { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; },
    async quickJoin(id) { log.live.push(['quickJoin', id]); liveState = { ...liveState, phase: 'connected', houseId: id, peerId: 'host', peers: [{ id: 'host', displayName: '小主人', avatar: {}, isHost: true, zone: 'yard', x: .5, y: .5 }] }; emit(); return { ok: true }; },
    move(zone, x, y) { log.live.push(['move', zone, x, y]); return { ok: true }; },
    leave(keepalive) { log.live.push(['leave', !!keepalive]); liveState = { ...liveState, phase: 'left', peerId: null, houseId: null, peers: [] }; emit(); return Promise.resolve({ ok: true }); },
    cancelKnock() { log.live.push(['cancelKnock']); }
  };
  const body = new Node('body');
  const document = { hidden: false, body, createElement: tag => new Node(tag) };
  const own = { house: ownHouse, wallet: { coins: 5 }, avatar: { hair: 'bob' } };
  const G = {
    runtime: { mode: 'explore', selected: 'sel', placing: 'plc', activeRoomId: null }, state: own,
    store: { update() { throw new Error('串门不能写存档'); }, save() { throw new Error('串门不能写存档'); } },
    bus: { on(name, fn) { (bus[name] ||= []).push(fn); } },
    cloud: {
      status: () => ({ available: !options.file, account: options.signedOut ? null : { id: 'a' }, phase: 'ready' }),
      async requestPublic(route) {
        log.requests.push(route); if (hold) await hold; if (failure) throw failure;
        return { house: { ...reply.house, id: route.split('/').pop() }, snapshot: reply.snapshot };
      }
    },
    publicHouse: { materialize(snapshot) { return { house: structuredClone(snapshot.state.house), avatar: { hair: 'pony' } }; } },
    render: { redraw() { log.redraws++; } },
    live, neighbors: { ownId: () => OWN },
    ui: {
      toast: t => log.toasts.push(t), cloudAccount: { open() { log.cloudOpen++; } },
      panel: { close() { log.panelClose++; G.runtime.mode = 'explore'; (bus['panel:change'] || []).forEach(fn => fn()); } },
      liveRoom: {
        mount(slot, opts) {
          const record = { slot, opts, destroyed: false }; log.mounts.push(record);
          const off = live.subscribe(s => { if (!record.destroyed) opts.onState(s); });
          opts.onState(live.status()); // 真实组件挂载时会立刻回报一次当前（可能是陈旧的）状态
          return { destroy() { if (record.destroyed) return; record.destroyed = true; off(); live.leave(true); } };
        }
      }
    }
  };
  if (!options.noVisit) G.render.visit = { set(s) { log.visitSets.push(s); } };
  if (options.noRequest) delete G.cloud.requestPublic;
  const context = vm.createContext({ window: { Game: G, addEventListener(n, f) { windowEvents[n] = f; } }, document, console, Math, Map, Set, Array, Number, String, Promise, Date, Object, JSON, setTimeout(fn, ms) { timers.push({ fn, ms }); return timers.length; }, clearTimeout(id) { timers[id - 1] = null; } });
  for (const file of ['js/render/live-avatars.js', 'js/render/live-peers.js', 'js/ui/host-room.js', 'js/ui/visit-session.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  const bannerNode = () => walk(body).find(n => n.className.split(' ').includes('visit-banner'));
  const buttonOf = (label) => walk(body).find(n => n.tag === 'button' && n.textContent === label);
  return {
    G, log, body, timers, windowEvents, own, ownJson: JSON.stringify(own), reply,
    setLive(patch) { liveState = { ...liveState, ...patch }; emit(); },
    connect(peerId = 'me', extra = {}) {
      liveState = { ...liveState, phase: 'connected', authenticated: true, houseId: ID, peerId, revision: 1, houseVersion: extra.houseVersion || '', error: '',
        peers: [{ id: peerId, displayName: '我', avatar: { hair: 'bob' }, isHost: false, zone: 'yard', x: .5, y: .5 }, { id: 'owner', displayName: '小云', avatar: { hair: 'pony' }, isHost: true, zone: 'yard', x: .3, y: .5 }] }; emit();
    },
    knockResult(result) { log.mounts.at(-1).opts.onKnockResult(result); },
    fail(error) { failure = error; }, holdRequests() { let release; hold = new Promise(r => { release = () => { hold = null; r(); }; }); return release; },
    fireTimer() { const t = timers.filter(Boolean).at(-1); assert.ok(t, '应有定时器'); timers[timers.indexOf(t)] = null; t.fn(); },
    bannerNode, bannerText: () => { const b = bannerNode(); return b ? textOf(b) : ''; }, buttonOf,
    counts: () => ({ visitSets: log.visitSets.length, mounts: log.mounts.length })
  };
}
const tests = []; const test = (name, fn) => tests.push({ name, fn });
const lastSet = b => b.log.visitSets[b.log.visitSets.length - 1];

test('available：需要 render.visit、同源公开读取、非 file 入口；否则 enter 给出兜底标记且不发请求', async () => {
  assert.equal(sandbox().G.visitSession.available(), true);
  assert.equal(sandbox({ noVisit: true }).G.visitSession.available(), false, '没有 G.render.visit 回落旧页');
  assert.equal(sandbox({ file: true }).G.visitSession.available(), false, 'file入口不可用');
  assert.equal(sandbox({ noRequest: true }).G.visitSession.available(), false);
  const b = sandbox({ file: true }); const r = await b.G.visitSession.enter(ID, { mode: 'passerby' });
  assert.equal(r.ok, false); assert.equal(r.fallback, true); assert.deepEqual(b.log.requests, []); assert.equal(b.G.visitSession.active(), false);
  const ok = sandbox(); assert.equal((await ok.G.visitSession.enter('not-an-id', {})).ok, false); assert.deepEqual(ok.log.requests, []);
});

test('路过：只读快照冻结后交给渲染层，写 runtime.visit，不发任何 live 请求、不挂浮层，自己的 G.state 不变', async () => {
  const b = sandbox(); const own = b.G.state;
  const r = await b.G.visitSession.enter(ID, { mode: 'passerby' }); assert.equal(r.ok, true);
  assert.equal(b.G.visitSession.active(), true); assert.equal(b.G.visitSession.state().phase, 'passerby');
  const v = b.G.runtime.visit; assert.equal(v.active, true); assert.equal(v.houseId, ID); assert.equal(v.mode, 'passerby'); assert.equal(v.selfPeerId, null);
  assert.equal(v.title, '邻居的小屋'); assert.equal(v.ownerDisplayName, '小云');
  assert.ok(Object.isFrozen(v.state) && Object.isFrozen(v.state.house) && Object.isFrozen(v.state.house.rooms), '访客状态深度冻结');
  assert.notEqual(v.state, b.G.state); assert.equal(b.G.state, own, 'G.state 仍是自己的存档对象'); assert.equal(JSON.stringify(b.G.state), b.ownJson);
  assert.equal(b.log.visitSets.length, 1); assert.equal(b.log.visitSets[0], v.state);
  assert.equal(b.G.runtime.mode, 'visit'); assert.equal(b.G.runtime.placing, null); assert.equal(b.G.runtime.selected, null); assert.equal(b.log.panelClose, 1, '收起邻居面板露出场景');
  assert.deepEqual(b.log.requests, ['/public-houses/' + ID]); assert.deepEqual(b.log.live, [], '路过不发 live 请求'); assert.equal(b.log.mounts.length, 0, '路过不挂载串门浮层');
  const text = b.bannerText(); assert.match(text, /正在小云的小屋 · 路过/); assert.match(text, /主人不会知道你来过/); assert.ok(b.buttonOf('回自己的小屋')); assert.ok(b.buttonOf('敲门串门'));
  assert.equal(b.G.visitSession.walkTo({ x: 0, y: 100 }), false, '路过不能走动');
  assert.equal(b.timers.filter(Boolean).length, 1, '安排了快照核对');
  assert.equal((await b.G.visitSession.enter(ID, { mode: 'passerby' })).ok, true); assert.equal(b.log.requests.length, 1, '同一座小屋不重复读取');
});

test('未登录要求 live：降级为路过并提示登录，仍不发 live 请求；横幅的“敲门串门”引导登录', async () => {
  const b = sandbox({ signedOut: true }); const r = await b.G.visitSession.enter(ID, { mode: 'live' });
  assert.equal(r.ok, true); assert.equal(b.G.visitSession.state().phase, 'passerby'); assert.equal(b.G.runtime.visit.mode, 'passerby');
  assert.ok(b.log.toasts.some(t => /登录/.test(t))); assert.deepEqual(b.log.live, []); assert.equal(b.log.mounts.length, 0);
  b.buttonOf('敲门串门').click(); assert.equal(b.log.cloudOpen, 1); assert.deepEqual(b.log.live, []); assert.equal(b.log.mounts.length, 0);
});

test('敲门等待留在自己家：active 为假、不切场景；陈旧的初始状态与等待期的 idle/left/joining 都被忽略；连上才切换', async () => {
  const b = sandbox(); b.setLive({ phase: 'error', error: '上次的旧错误' }); // 挂载时会回报一次陈旧状态
  const r = await b.G.visitSession.enter(ID, { mode: 'live' }); assert.equal(r.ok, true); assert.equal(r.knocking, true);
  assert.equal(b.G.visitSession.state().phase, 'knocking'); assert.equal(b.G.visitSession.active(), false); assert.ok(!b.G.runtime.visit);
  assert.equal(b.log.visitSets.length, 0); assert.equal(b.G.runtime.mode, 'explore'); assert.equal(b.G.runtime.placing, 'plc'); assert.deepEqual(b.log.toasts, [], '陈旧错误不触发退出');
  assert.equal(b.log.mounts.length, 1); assert.equal(b.log.mounts[0].opts.quickJoin, true); assert.equal(b.log.mounts[0].opts.houseId, ID);
  assert.ok(b.log.mounts[0].slot.parent.className.includes('host-room'), '浮层不占整页'); assert.ok(!b.bannerNode(), '没连上不显示串门横幅');
  b.setLive({ phase: 'idle', error: '' }); b.setLive({ phase: 'joining' }); b.setLive({ phase: 'left' }); b.setLive({ phase: 'idle', error: '' });
  assert.equal(b.G.visitSession.state().phase, 'knocking'); assert.deepEqual(b.log.toasts, []);
  b.connect('me');
  assert.equal(b.G.visitSession.active(), true); assert.equal(b.G.visitSession.state().phase, 'live'); const v = b.G.runtime.visit;
  assert.equal(v.mode, 'live'); assert.equal(v.selfPeerId, 'me'); assert.equal(v.houseId, ID); assert.equal(b.log.visitSets.length, 1); assert.equal(b.log.visitSets[0], v.state);
  assert.equal(b.G.runtime.mode, 'visit'); assert.equal(b.G.runtime.placing, null); assert.equal(b.G.livePeers.count(), 2, '同屋的人交给主场景');
  assert.match(b.bannerText(), /正在小云的小屋 · 串门中/); assert.ok(b.buttonOf('回自己的小屋')); assert.equal(b.buttonOf('敲门串门').hidden, true);
  assert.equal(b.G.state, b.G.state); assert.equal(JSON.stringify(b.G.state), b.ownJson);
  assert.equal(b.G.visitSession.walkTo({ x: 0, y: 100 }), true); const move = b.log.live.filter(c => c[0] === 'move').at(-1); assert.equal(move[1], 'yard'); assert.ok(move[2] >= 0 && move[2] <= 1);
  assert.equal(b.G.visitSession.walkTo({ x: 9999, y: 9999 }), false, '点到场外不处理');
  b.log.mounts[0].opts.onMove('left'); assert.ok(Math.abs(b.log.live.filter(c => c[0] === 'move').at(-1)[2] - .42) < 1e-9, '方向键步进');
  b.setLive({ houseVersion: 'a'.repeat(64) }); b.setLive({ houseVersion: 'b'.repeat(64), phase: 'connected' }); await idle();
  assert.ok(b.log.requests.length >= 1);
});

test('敲门被婉拒/不在家/没回应/取消：都留在自己家并提示，浮层与敲门被收掉', async () => {
  const cases = [[{ ok: false, status: 'declined', message: '主人现在不方便，过一会儿再来看看吧。' }, /不方便/], [{ ok: false, status: 'host_away', message: '主人现在不在家，下次再来看看吧。' }, /不在家/],
    [{ ok: false, status: 'expired', message: '主人还没有看到，稍后再试试吧。' }, /还没有看到/], [{ ok: false, status: 'cancelled', message: '已取消' }, /已取消敲门/]];
  for (const [result, pattern] of cases) {
    const b = sandbox(); await b.G.visitSession.enter(ID, { mode: 'live' }); b.knockResult(result);
    assert.equal(b.G.visitSession.active(), false); assert.equal(b.G.visitSession.state().phase, 'idle'); assert.ok(!b.G.runtime.visit); assert.equal(b.log.visitSets.length, 0, '从未切换场景');
    assert.equal(b.log.toasts.length, 1); assert.match(b.log.toasts[0], pattern); assert.equal(b.log.mounts[0].destroyed, true); assert.equal(b.body.children.length, 0, '浮层和横幅都不留');
    assert.ok(b.log.live.some(c => c[0] === 'cancelKnock')); assert.equal(b.G.livePeers.count(), 0); assert.equal(b.G.runtime.mode, 'explore'); assert.equal(b.G.runtime.placing, 'plc');
  }
  const approved = sandbox(); await approved.G.visitSession.enter(ID, { mode: 'live' }); approved.knockResult({ ok: true, ticket: 'x'.repeat(8) });
  assert.equal(approved.G.visitSession.state().phase, 'knocking', '同意后继续等待连上'); assert.deepEqual(approved.log.toasts, []);
});

test('加入失败：连上之前 error、idle+错误文字、未登录探测（idle 且 authenticated=false）都留在自己家并提示', async () => {
  for (const [patch, pattern] of [[{ phase: 'error', error: '这座小屋现在满员了。' }, /满员/], [{ phase: 'idle', authenticated: true, error: '快捷串门已暂停，回到页面后可以手动加入。' }, /暂停/], [{ phase: 'idle', authenticated: false, error: '' }, /登录/]]) {
    const b = sandbox(); await b.G.visitSession.enter(ID, { mode: 'live' }); b.setLive(patch);
    assert.equal(b.G.visitSession.active(), false); assert.equal(b.G.visitSession.state().phase, 'idle'); assert.match(b.log.toasts[0], pattern); assert.equal(b.log.visitSets.length, 0); assert.equal(b.body.children.length, 0);
  }
});

test('路过中点“敲门串门”升级为 live：等待时仍在路过（active 为真）；失败留在路过；连上后改为 live 且不重复切场景', async () => {
  const b = sandbox(); await b.G.visitSession.enter(ID, { mode: 'passerby' }); assert.deepEqual(b.log.live, []);
  b.buttonOf('敲门串门').click(); await idle();
  assert.equal(b.G.visitSession.state().phase, 'knocking'); assert.equal(b.G.visitSession.active(), true, '已在对方家路过'); assert.equal(b.G.runtime.visit.mode, 'passerby');
  assert.equal(b.log.mounts.length, 1); assert.equal(b.buttonOf('正在敲门…').disabled, true);
  b.knockResult({ ok: false, status: 'declined', message: '主人现在不方便，过一会儿再来看看吧。' });
  assert.equal(b.G.visitSession.state().phase, 'passerby'); assert.equal(b.G.visitSession.active(), true); assert.match(b.log.toasts.at(-1), /不方便/); assert.equal(b.log.mounts[0].destroyed, true);
  assert.equal(b.buttonOf('敲门串门').disabled, false);
  b.buttonOf('敲门串门').click(); await idle(); b.connect('me2');
  assert.equal(b.G.runtime.visit.mode, 'live'); assert.equal(b.G.runtime.visit.selfPeerId, 'me2'); assert.equal(b.log.visitSets.length, 1, '升级不重复设置场景'); assert.match(b.bannerText(), /串门中/);
});

test('leave 幂等：回到自己的小屋，清运行态、渲染层、同屋人物、浮层与横幅；重复调用无副作用', async () => {
  const b = sandbox(); assert.equal(b.G.visitSession.leave().ok, true); assert.deepEqual(b.log.live, []); assert.equal(b.log.visitSets.length, 0, '没进过就什么都不做');
  await b.G.visitSession.enter(ID, { mode: 'live' }); b.connect('me');
  assert.equal(b.G.visitSession.leave().ok, true);
  assert.equal(b.G.visitSession.active(), false); assert.equal(b.G.runtime.visit, null); assert.equal(b.G.runtime.mode, 'explore'); assert.equal(lastSet(b), null); assert.equal(b.log.visitSets.length, 2);
  assert.equal(b.G.livePeers.count(), 0); assert.equal(b.body.children.length, 0); assert.equal(b.log.mounts[0].destroyed, true); assert.deepEqual(b.log.toasts, []);
  const leaves = b.log.live.filter(c => c[0] === 'leave').length; assert.ok(leaves >= 1);
  const redraws = b.log.redraws; b.G.visitSession.leave(); b.G.visitSession.leave();
  assert.equal(b.log.live.filter(c => c[0] === 'leave').length, leaves); assert.equal(b.log.visitSets.length, 2); assert.equal(b.log.redraws, redraws); assert.equal(b.G.visitSession.state().phase, 'idle');
  assert.equal(JSON.stringify(b.G.state), b.ownJson);
  const home = sandbox(); await home.G.visitSession.enter(ID, { mode: 'passerby' }); home.buttonOf('回自己的小屋').click();
  assert.equal(home.G.visitSession.active(), false); assert.deepEqual(home.log.toasts, ['已回到自己的小屋。']); assert.deepEqual(home.log.live, [], '路过离开也不碰 live'); assert.equal(lastSet(home), null);
});

test('被请离、重连失败（error）、自己结束（left）：优雅退出并提示；路过期间读取失败（非404）则保留画面', async () => {
  for (const [patch, pattern] of [[{ phase: 'error', peerId: null, houseId: null, peers: [], error: '你已被屋主请离，本次不能再加入。' }, /请离/], [{ phase: 'error', peerId: null, houseId: null, peers: [], error: '串门连接已结束，请重新加入。' }, /串门连接已结束/], [{ phase: 'left', peerId: null, houseId: null, peers: [] }, /串门结束了/]]) {
    const b = sandbox(); await b.G.visitSession.enter(ID, { mode: 'live' }); b.connect('me'); b.setLive(patch);
    assert.equal(b.G.visitSession.active(), false); assert.equal(b.G.runtime.visit, null); assert.equal(lastSet(b), null); assert.match(b.log.toasts.at(-1), pattern); assert.equal(b.body.children.length, 0); assert.equal(b.G.livePeers.count(), 0);
  }
  const r = sandbox(); await r.G.visitSession.enter(ID, { mode: 'live' }); r.connect('me'); r.setLive({ phase: 'reconnecting', error: '连接中断，正在尝试恢复；聊天不会自动重发。' });
  assert.equal(r.G.visitSession.active(), true, '重连中保持在对方家'); assert.deepEqual(r.log.toasts, []);
});

test('快照刷新：updatedAt 变了就换新的冻结状态；读到 404（主人撤下）优雅退出；其它失败保留画面并继续核对', async () => {
  const b = sandbox(); await b.G.visitSession.enter(ID, { mode: 'passerby' }); const first = b.G.runtime.visit.state;
  b.fireTimer(); await idle(); assert.equal(b.log.visitSets.length, 1, '时间未变不重设'); assert.equal(b.timers.filter(Boolean).length, 1, '继续安排下次核对');
  b.reply.house = { ...b.reply.house, title: '新装修的家', updatedAt: 'v2' }; b.reply.snapshot = { state: { house: { ...neighborHouse, name: '新装修的家' } } }; b.fireTimer(); await idle();
  assert.equal(b.log.visitSets.length, 2); assert.notEqual(lastSet(b), first); assert.ok(Object.isFrozen(lastSet(b))); assert.equal(b.G.runtime.visit.state, lastSet(b)); assert.equal(b.G.runtime.visit.title, '新装修的家'); assert.match(b.bannerText(), /路过/);
  b.fail({ status: 500 }); b.fireTimer(); await idle(); assert.equal(b.G.visitSession.active(), true); assert.equal(b.timers.filter(Boolean).length, 1);
  b.fail({ status: 404 }); b.fireTimer(); await idle();
  assert.equal(b.G.visitSession.active(), false); assert.equal(lastSet(b), null); assert.match(b.log.toasts.at(-1), /撤下/); assert.equal(b.body.children.length, 0); assert.equal(b.timers.filter(Boolean).length, 0, '退出后不再核对');
  const v = sandbox(); await v.G.visitSession.enter(ID, { mode: 'live' }); v.connect('me', { houseVersion: 'a'.repeat(64) }); const n = v.log.requests.length;
  v.reply.house = { ...v.reply.house, updatedAt: 'v9' }; v.connect('me', { houseVersion: 'b'.repeat(64) }); await idle(); await idle();
  assert.equal(v.log.requests.length, n + 1, '联机收到新版本号立即重读'); assert.equal(v.log.visitSets.length, 2);
});

test('读取公开快照失败：友好提示，不切场景、不动 hostRoom；加载中途离开不会复活', async () => {
  const gone = sandbox({ requestFail: { status: 404, message: 'private detail' } }); const r = await gone.G.visitSession.enter(ID, { mode: 'passerby' });
  assert.equal(r.ok, false); assert.match(r.message, /撤下/); assert.doesNotMatch(r.message, /private/); assert.equal(gone.G.visitSession.active(), false); assert.equal(gone.G.visitSession.state().phase, 'idle'); assert.equal(gone.log.visitSets.length, 0); assert.match(gone.log.toasts[0], /撤下/);
  const net = sandbox({ requestFail: new Error('boom') }); await net.G.visitSession.enter(ID, { mode: 'live' }); assert.match(net.log.toasts[0], /载入/); assert.equal(net.log.mounts.length, 0); assert.deepEqual(net.log.live, []);
  const slow = sandbox(); const release = slow.holdRequests(); const pending = slow.G.visitSession.enter(ID, { mode: 'passerby' }); await idle();
  assert.equal(slow.G.visitSession.state().phase, 'loading'); assert.equal(slow.G.visitSession.active(), false); slow.G.visitSession.leave(); release();
  const result = await pending; assert.equal(result.cancelled, true); assert.equal(slow.G.visitSession.active(), false); assert.equal(slow.log.visitSets.length, 0);
});

test('换一座小屋：先离开当前的再进新的；pagehide 尽力 leave(keepalive) 并收尾', async () => {
  const b = sandbox(); await b.G.visitSession.enter(ID, { mode: 'passerby' }); await b.G.visitSession.enter(OTHER, { mode: 'passerby' });
  assert.equal(b.G.runtime.visit.houseId, OTHER); assert.equal(b.log.visitSets.length, 3); assert.equal(b.log.visitSets[1], null); assert.deepEqual(b.log.requests, ['/public-houses/' + ID, '/public-houses/' + OTHER]); assert.equal(walk(b.body).filter(n => n.className.split(' ').includes('visit-banner')).length, 1, '只有一个横幅');
  const l = sandbox(); await l.G.visitSession.enter(ID, { mode: 'live' }); l.connect('me'); assert.equal(typeof l.windowEvents.pagehide, 'function'); l.windowEvents.pagehide();
  assert.equal(l.G.visitSession.active(), false); assert.deepEqual(l.log.live.find(c => c[0] === 'leave'), ['leave', true]); assert.equal(lastSet(l), null); assert.deepEqual(l.log.toasts, []);
  const k = sandbox(); k.windowEvents.pagehide(); assert.deepEqual(k.log.live, []);
});

test('同一账号不同时在两个房子：host 接待与串门互相先 leave', async () => {
  const b = sandbox(); await b.G.visitSession.enter(ID, { mode: 'passerby' }); assert.equal(b.G.visitSession.active(), true);
  assert.equal((await b.G.hostRoom.enter()).ok, true);
  assert.equal(b.G.hostRoom.active(), true); assert.equal(b.G.visitSession.active(), false); assert.equal(lastSet(b), null); assert.equal(b.G.runtime.visit, null);
  await b.G.visitSession.enter(OTHER, { mode: 'passerby' });
  assert.equal(b.G.hostRoom.active(), false, '进入串门前结束屋主接待'); assert.equal(b.G.visitSession.active(), true); assert.equal(b.G.runtime.visit.houseId, OTHER); assert.ok(b.log.live.some(c => c[0] === 'leave'));
  const k = sandbox(); await k.G.visitSession.enter(ID, { mode: 'live' }); assert.equal(k.G.visitSession.state().phase, 'knocking');
  await k.G.hostRoom.enter(); assert.equal(k.G.visitSession.state().phase, 'idle', '敲门等待中屋主进入自己家会取消敲门'); assert.ok(k.log.live.some(c => c[0] === 'cancelKnock')); assert.equal(k.G.hostRoom.active(), true);
  const fail = sandbox(); await fail.G.visitSession.enter(ID, { mode: 'passerby' }); fail.G.neighbors.ownId = () => ''; assert.equal((await fail.G.hostRoom.enter()).ok, false); assert.equal(fail.G.visitSession.active(), true, '屋主进不去时不打断串门');
});

test('ui.open 拦截：串门中拦下装扮类面板并提示，放行 neighbors/账号/换装/设置/回忆/帮助；不串门时一律放行（从 ui.js 源码提取拦截行）', async () => {
  const source = fs.readFileSync(path.join(root, 'js/ui/ui.js'), 'utf8').split('\n'), lines = source.filter(l => l.includes('G.visitSession.blocks')); assert.equal(lines.length, 1, 'ui.open 顶部只有一处拦截');
  const index = source.findIndex(l => l.includes('ui.open = function (name, options)')); assert.ok(index >= 0 && source[index + 1].includes('G.visitSession.blocks'), '拦截在 ui.open 第一行');
  const run = vm.runInNewContext('(function (G, ui, name) {\n' + lines[0] + '\nreturn "放行";\n})');
  const b = sandbox(); const toasts = []; const ui = { toast: t => toasts.push(t) };
  for (const name of ['build', 'decor', 'yard', 'exterior', 'houseDesign', 'roomLayout', 'shop', 'garden', 'residents', 'crafting', 'play', 'quests', 'collection', 'observatory']) assert.equal(run(b.G, ui, name), '放行', '没串门时放行 ' + name);
  assert.deepEqual(toasts, []);
  await b.G.visitSession.enter(ID, { mode: 'passerby' });
  for (const name of ['build', 'decor', 'yard', 'exterior', 'houseDesign', 'roomLayout', 'shop', 'garden', 'residents', 'crafting', 'play', 'quests', 'collection', 'observatory']) { assert.equal(b.G.visitSession.blocks(name), true, name); assert.equal(run(b.G, ui, name), undefined, '拦下 ' + name); }
  assert.equal(toasts.length, 14); assert.ok(toasts.every(t => t === '正在串门，先回自己的小屋再装扮吧'));
  for (const name of ['neighbors', 'cloudAccount', 'login', 'avatar', 'settings', 'memories', 'help']) { assert.equal(b.G.visitSession.blocks(name), false, name); assert.equal(run(b.G, ui, name), '放行', '放行 ' + name); }
  assert.equal(toasts.length, 14); b.G.visitSession.leave(); assert.equal(run(b.G, ui, 'decor'), '放行', '回家后恢复');
  assert.equal(run({}, ui, 'decor'), '放行', 'visit-session 未加载时不影响');
});

test('入口 bindVisit：只拦截无修饰键左键且可用时；保留 href/target；其余走旧页；自己房子的接待链接走 hostRoom', async () => {
  const b = sandbox(); const entryContext = vm.createContext({ window: null, document: { currentScript: { src: 'https://game.test/play/releases/r-' + 'a'.repeat(64) + '/js/ui/neighbors.js' } }, console, Math, Map, Set, Array, Number, String, Promise, Date, Object, JSON });
  const G2 = { ui: { toast: t => b.log.toasts.push(t) }, visitSession: b.G.visitSession }; entryContext.window = { Game: G2 };
  vm.runInContext(fs.readFileSync(path.join(root, 'js/ui/neighbors.js'), 'utf8'), entryContext, { filename: 'js/ui/neighbors.js' });
  assert.equal(typeof G2.neighbors.bindVisit, 'function');
  function anchor(id, join) { const a = { href: '/play/visit/' + id + (join ? '#join' : ''), target: '_blank', rel: 'noopener noreferrer', handlers: [], addEventListener(n, f) { if (n === 'click') this.handlers.push(f); } }; G2.neighbors.bindVisit(a, id, join); return a; }
  function click(a, extra = {}) { const e = { button: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra }; a.handlers.forEach(f => f(e)); return e; }
  const link = anchor(ID, false); assert.equal(link.handlers.length, 1); assert.equal(link.href, '/play/visit/' + ID); assert.equal(link.target, '_blank');
  // 修饰键、中键、右键：不拦截，仍走旧页
  for (const extra of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { button: 2 }]) assert.equal(click(link, extra).defaultPrevented, false, JSON.stringify(extra));
  assert.deepEqual(b.log.requests, []); assert.equal(b.G.visitSession.active(), false);
  // 普通左键：拦截并路过
  const plainClick = click(link); assert.equal(plainClick.defaultPrevented, true); await idle(); await idle();
  assert.equal(b.G.visitSession.active(), true); assert.equal(b.G.runtime.visit.mode, 'passerby'); assert.equal(link.href, '/play/visit/' + ID, 'href 保留'); assert.equal(link.target, '_blank'); assert.deepEqual(b.log.live, []);
  b.G.visitSession.leave();
  // 敲门串门：live
  const join = anchor(OTHER, true); assert.equal(click(join).defaultPrevented, true); await idle(); await idle(); assert.equal(b.G.visitSession.state().phase, 'knocking'); assert.equal(b.log.mounts.length, 1); b.G.visitSession.leave();
  // 重复绑定只更新目标，不叠加监听（列表刷新会把同一个链接从“路过”改成“敲门”）
  const dynamic = anchor(ID, false); G2.neighbors.bindVisit(dynamic, ID, true); assert.equal(dynamic.handlers.length, 1); click(dynamic); await idle(); await idle(); assert.equal(b.G.visitSession.state().phase, 'knocking'); b.G.visitSession.leave();
  // 不可用（没有渲染接口 / file 入口）：不拦截，仍走旧页
  const noRender = sandbox({ noVisit: true }); G2.visitSession = noRender.G.visitSession; assert.equal(click(anchor(ID, false)).defaultPrevented, false); G2.visitSession = undefined; assert.equal(click(anchor(ID, false)).defaultPrevented, false, '没有会话模块也不拦截');
  const file = sandbox({ file: true }); G2.visitSession = file.G.visitSession; assert.equal(click(anchor(ID, true)).defaultPrevented, false);
  // 自己房子的“接待朋友，一起玩”：走 G.hostRoom.enter，不读自己的公开快照
  const own = sandbox(); G2.visitSession = own.G.visitSession; const reception = anchor(OWN, true); assert.equal(click(reception).defaultPrevented, true); await idle(); await idle();
  assert.equal(own.G.hostRoom.active(), true); assert.deepEqual(own.log.requests, [], '不经公开快照'); assert.equal(own.log.visitSets.length, 0); assert.equal(own.G.visitSession.active(), false); assert.ok(own.log.live.some(c => c[0] === 'quickJoin' && c[1] === OWN));
});

test('静态检查：index.html 里 visit-session.js 在 host-room.js 之后、样式单独登记；sea-map 用 bindVisit 保护；旧 visit.js 不依赖新模块；写存档只经 Game.store.update', async () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8'); assert.ok(html.indexOf('js/ui/visit-session.js') > html.indexOf('js/ui/host-room.js') && html.indexOf('js/ui/host-room.js') > 0);
  assert.ok(html.includes('css/visit-session.css')); assert.ok(fs.existsSync(path.join(root, 'css/visit-session.css')));
  assert.ok(fs.readFileSync(path.join(root, 'js/ui/sea-map.js'), 'utf8').includes('if (G.neighbors.bindVisit) G.neighbors.bindVisit('));
  assert.ok(!fs.readFileSync(path.join(root, 'js/ui/visit.js'), 'utf8').includes('visitSession'));
  const source = fs.readFileSync(path.join(root, 'js/ui/visit-session.js'), 'utf8'); assert.ok(!/G\.state\s*=[^=]/.test(source), '不替换 G.state'); assert.ok(!/localStorage|fetch\(|XMLHttpRequest/.test(source), '会话层自己不联网');
});

(async () => { for (const t of tests) { await t.fn(); console.log('✓ ' + t.name); } console.log(tests.length + ' 组主场景串门会话检查通过（轻DOM，不联网，未代替浏览器）'); })().catch(e => { console.error(e); process.exit(1); });
