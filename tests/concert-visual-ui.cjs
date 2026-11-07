'use strict';
// MC-070：真实 concert/store/save + 合成入住档案、内存DOM和Canvas委托；不载scene或私人存档。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), tests = [], test = (name, fn) => tests.push([name, fn]);
const plain = value => JSON.parse(JSON.stringify(value));
function harness() {
  let modal = null, denyWrite = false, frameId = 0, booting = true;
  const frames = new Map(), storage = new Map(), audio = [], speech = [], toasts = [], draws = [], operations = [], cancelled = [], errors = [];
  class Node {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.className = ''; this.children = []; this.parentElement = null; this.dataset = {}; this.attributes = {}; this.listeners = new Map(); this._hidden = false; this._disabled = false; this.scrollTop = 0; this._text = ''; this.style = {}; this.width = 300; this.height = 150; }
    get hidden() { return this._hidden; }
    set hidden(value) { this._hidden = !!value; if (this._hidden && this.contains(document.activeElement)) document.activeElement = document.body; }
    get disabled() { return this._disabled; }
    set disabled(value) { this._disabled = !!value; if (this._disabled && document.activeElement === this) document.activeElement = document.body; }
    get isConnected() { return this === document.body || !!this.parentElement?.isConnected; }
    get textContent() { return this._text + this.children.map(n => n.textContent).join(''); }
    set textContent(value) { this.replaceChildren(); this._text = String(value); }
    append(...nodes) { nodes.forEach(n => { n.remove(); this.children.push(n); n.parentElement = this; }); }
    remove() { if (this.parentElement) { if (this.contains(document.activeElement)) document.activeElement = document.body; this.parentElement.children = this.parentElement.children.filter(n => n !== this); this.parentElement = null; } }
    replaceChildren(...nodes) { this.children.forEach(n => { if (n.contains(document.activeElement)) document.activeElement = document.body; n.parentElement = null; }); this.children = []; this._text = ''; this.append(...nodes); }
    contains(node) { return this === node || this.children.some(n => n.contains(node)); }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    getAttribute(key) { return this.attributes[key] ?? null; }
    addEventListener(key, fn) { if (!this.listeners.has(key)) this.listeners.set(key, new Set()); this.listeners.get(key).add(fn); }
    removeEventListener(key, fn) { this.listeners.get(key)?.delete(fn); }
    dispatch(key) { [...(this.listeners.get(key) || [])].forEach(fn => fn({ target: this })); }
    click() { if (!this.disabled) this.dispatch('click'); }
    focus(options) { let hidden = false; for (let n = this; n; n = n.parentElement) hidden ||= n.hidden; if (this.isConnected && !this.disabled && !hidden) { document.activeElement = this; this.focusOptions = options; if (!options?.preventScroll) for (let n = this.parentElement; n; n = n.parentElement) n.scrollTop = 0; } }
    matches(selector) { if (selector.startsWith('.')) return selector.slice(1).split('.').every(n => this.classList.contains(n)); const attr = selector.match(/^\[data-ui-focus="([^"]+)"\]$/); if (attr) return this.dataset.uiFocus === attr[1]; return selector === '*' || this.tagName === selector.toUpperCase(); }
    querySelectorAll(selector) { return this.children.flatMap(n => [n, ...n.querySelectorAll('*')]).filter(n => n.matches(selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    get classList() { return { contains: name => this.className.split(/\s+/).includes(name), add: (...names) => names.forEach(n => { if (!this.classList.contains(n)) this.className += ' ' + n; }) }; }
    getContext() { if (!this.ctx) this.ctx = new Proxy({}, { get: (target, key) => key in target ? target[key] : (...args) => operations.push({ canvas: this, key, args }), set: (target, key, value) => { target[key] = value; return true; } }); return this.ctx; }
  }
  const document = { body: null, activeElement: null, createElement: tag => new Node(tag), addEventListener() {}, removeEventListener() {} };
  document.body = new Node('body'); document.activeElement = document.body;
  const RealDate = Date, now = new RealDate(2026, 9, 30, 12).getTime(); class TestDate extends RealDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const context = vm.createContext({ console: { log: console.log, error: (...args) => errors.push(args) }, document, Blob, URL, Date: TestDate,
    requestAnimationFrame: fn => { const id = ++frameId; frames.set(id, fn); return id; }, cancelAnimationFrame: id => { cancelled.push(id); frames.delete(id); },
    setTimeout: () => 1, clearTimeout() {}, setInterval() { if (!booting) throw new Error('UI不得轮询'); return 1; }, clearInterval() {} });
  context.window = context; context.addEventListener = () => {}; context.localStorage = { getItem: key => storage.get(key) || null, setItem(key, value) { if (denyWrite) throw new Error('QuotaExceededError'); storage.set(key, value); } };
  const files = ['js/core/namespace.js','js/data/balance.js','js/data/content.js','js/data/furniture-expansion.js','js/data/residents-expansion.js','js/data/progression.js','js/data/concert.js','js/data/achievements.js','js/data/garden.js','js/data/calendar.js','js/data/outfits.js','js/data/exterior.js','js/data/yard.js','js/data/minigames.js','js/data/gifts.js','js/core/utils.js','js/core/bus.js','js/core/store.js','js/core/save.js','js/systems/systems.js','js/systems/concert.js'];
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  const G = context.Game, parse = value => vm.runInContext('JSON.parse(' + JSON.stringify(JSON.stringify(value)) + ')', context);
  G.store.init(); G.sys.init(); booting = false;
  G.audio = { play: value => audio.push(value), stopSpeech: () => audio.push('stopSpeech'), stopConcert: () => audio.push('stopConcert') };
  G.render = { drawCharacter(canvas, id) { canvas.width = 176; canvas.height = 208; draws.push({ canvas, id, connected: canvas.isConnected }); } };
  G.ui = { toast: value => toasts.push(value), speak: (text, source) => speech.push({ text, source }), modal(options) {
    modal?.close(); const previous = document.activeElement, overlay = new Node('div'), element = new Node('section'), body = new Node('div'), head = new Node('div'), close = new Node('button');
    close.textContent = '关闭'; close.setAttribute('aria-label','关闭对话框'); close.addEventListener('click', () => handle.close()); head.className = 'modal-head'; head.append(close); body.className = 'modal-body'; body.append(options.content); element.append(head, body); overlay.append(element); document.body.append(overlay);
    let closed = false; const handle = { element, body, close() { if (closed) return; closed = true; overlay.remove(); if (modal === handle) modal = null; options.onClose?.(); if (previous.isConnected) previous.focus(); } }; modal = handle;
    context.requestAnimationFrame(() => (body.querySelectorAll('button').find(n => n.getAttribute('autofocus') !== null && !n.disabled) || body.querySelectorAll('button').find(n => !n.disabled && !n.hidden))?.focus()); return handle;
  } };
  const tracked = new Map(), on = G.bus.on; G.bus.on = (name, fn) => { if (!tracked.has(name)) tracked.set(name,new Set()); tracked.get(name).add(fn); const off = on(name,fn); return () => { tracked.get(name).delete(fn); off(); }; };
  vm.runInContext(fs.readFileSync(path.join(root,'js/ui/concert.js'),'utf8'),context,{filename:'js/ui/concert.js'});
  const allFrames = () => { let count = 0; while (frames.size) { assert.ok(++count < 8,'不得持续RAF'); const batch = [...frames.values()]; frames.clear(); batch.forEach(fn => fn()); } assert.deepEqual(errors,[]); };
  const node = selector => modal?.body.querySelector(selector), key = name => node('[data-ui-focus="concert-' + name + '"]');
  const click = name => { const button = key(name); assert.ok(button,name); button.focus({preventScroll:true}); button.click(); allFrames(); return button; };
  let roomId = null, bedrooms = [];
  function prepare(count = 4, room = true) {
    G.store.update(s => { s.wallet.coin = 1000000; s.tutorial.done = true; }); G.sys.economy.addExp(1000000);
    let cursor = 0; const build = type => { const n = cursor++, r = G.sys.building.buildRoom(Math.floor(n/3),n%3,type); assert.ok(r.ok,r.message); return r.roomId; };
    bedrooms = Array.from({length:6},() => build('bedroom')); if (room) roomId = build('music');
    // 合成入住记录只用于独立UI边界，不声称执行了邀请门槛或家园操作验收。
    G.store.update(s => G.data.residents.forEach((def,i) => { s.residents[def.id] = { affection:0, happiness:70, heartBubbles:0, lastBubbleAt:Date.now(), patsToday:0, movedIn:i<count, roomId:i<count?bedrooms[Math.floor(i/2)]:null }; }));
    return roomId;
  }
  return { G, Node, document, frames, storage, audio, speech, toasts, draws, operations, cancelled, errors, tracked, context, parse, prepare, allFrames, node, key, click, get modal() {return modal;}, get roomId() {return roomId;}, writeFails(value) {denyWrite = value;} };
}
const setup = (count = 4, room = true) => { const e = harness(); e.prepare(count,room); e.G.ui.concert.open(); e.allFrames(); return e; };
const text = e => e.modal?.body.textContent || '', plays = e => e.audio.filter(value => value.startsWith('concert_'));
const third = e => { e.click('next'); e.click('next'); e.click('next'); };
const spy = (e, method) => { const original = e.G.sys.concert[method], calls = []; e.G.sys.concert[method] = (...args) => { calls.push(args); return original(...args); }; return calls; };

test('唯一open接口；查询与入场大厅不写档，绘制真实4位子集与完整三步', () => {
  const e = harness(); e.prepare(); const before = JSON.stringify(e.G.state); e.G.ui.concert.open(); e.allFrames(); assert.deepEqual(Object.keys(e.G.ui.concert),['open']); assert.equal(JSON.stringify(e.G.state),before); assert.equal(e.draws.length,4); assert.ok(e.draws.every(draw => draw.connected)); assert.deepEqual(e.draws.map(x=>x.id),plain(e.G.sys.concert.status().guests));
  e.G.data.concert.verses.forEach(line => assert.ok(text(e).includes(line.title))); assert.equal(e.key('story').hidden,true); assert.equal(e.frames.size,0); assert.ok(e.modal.element.classList.contains('concert-modal-card'));
});
test('无房/无客禁止入场，状态恢复后明确可以重入', () => {
  for (const mode of ['room','guests']) { const e = setup(mode === 'guests' ? 0 : 4,mode !== 'room'), calls = spy(e,'begin'); assert.equal(e.key('next').disabled,true); e.key('next').dispatch('click'); assert.equal(calls.length,0); assert.ok(text(e).includes(e.G.sys.concert.status().reason)); if (mode === 'room') { assert.ok(e.G.sys.building.buildRoom(2,0,'music').ok); } else e.G.store.update(s => { s.residents.lily.movedIn = true; s.residents.lily.roomId = Object.keys(s.house.rooms)[0]; }); assert.equal(e.key('next').disabled,false); e.click('next'); assert.equal(calls.length,1); }
});
test('省略房间委托首间，指定有效房保持；null/未知/原型ID不悄悄替换', () => {
  for (const requested of [undefined,'valid',null,'missing_music','__proto__',{}]) { const e = harness(); e.prepare(); const room = requested === 'valid' ? e.roomId : requested, calls = spy(e,'begin'); e.G.ui.concert.open(room); e.allFrames(); if (requested === undefined || requested === 'valid') { e.click('next'); assert.equal(calls.length,1); assert.equal(calls[0][0],room); } else { assert.equal(e.key('next').disabled,true); e.key('next').dispatch('click'); assert.equal(calls.length,0); assert.match(text(e),/当前音乐室重新进入/); } }
});
test('真实三段全文notes、begin0与两次advance，第三段前后尚未保存，主动finish才成功', () => {
  const e = setup(), begin = spy(e,'begin'), advance = spy(e,'advance'), finish = spy(e,'finish'), before = JSON.stringify(e.G.state);
  for (let i=0;i<3;i++) { e.click('next'); const line=e.G.data.concert.verses[i]; assert.equal(e.node('.concert-copy').textContent,line.text); assert.equal(e.node('h3').textContent,line.title); assert.ok(e.node('.concert-notes').textContent.includes(line.notes.join(' · '))); assert.equal(JSON.stringify(e.G.state),before); assert.equal(e.node('.concert-progress').children[i].getAttribute('aria-current'),'step'); }
  assert.equal(begin.length,1); assert.equal(advance.length,2); assert.equal(finish.length,0); e.click('next'); assert.equal(finish.length,1); assert.equal(e.G.state.quests.stats.concerts,1); assert.equal(e.toasts.length,1); assert.equal(e.node('.concert-v2').dataset.state,'finished'); assert.equal(e.frames.size,0);
});
test('首次persist:true仅concerts=1与一条具名回忆，无糖/爱心/经验/小游戏变化，事件只一次', () => {
  const e=setup(), before=plain(e.G.state), original=e.G.store.update, options=[]; let events=0; e.G.bus.on('concert:finished',()=>events++); e.G.store.update=(fn,opts)=>{options.push(opts);return original(fn,opts);}; third(e); e.click('next');
  assert.deepEqual(plain(options),[{persist:true}]); assert.deepEqual(plain(e.G.state.wallet),before.wallet); assert.equal(e.G.state.exp,before.exp); assert.equal(e.G.state.quests.stats.minigamePlays,before.quests.stats.minigamePlays); assert.equal(e.G.state.memories.length,before.memories.length+1); e.G.sys.concert.status().guests.forEach(id=>assert.ok(e.G.state.memories.at(-1).text.includes(e.G.data.residents.find(d=>d.id===id).name))); assert.equal(events,1); const disk=JSON.parse(e.storage.get(e.G.data.balance.saveKey)); assert.equal(disk.quests.stats.concerts,1);
});
test('重演三段不重复保存、回忆、凭据或事件',()=>{const e=setup();third(e);e.click('next');const before=JSON.stringify(e.G.state),disk=e.storage.get(e.G.data.balance.saveKey);let events=0;e.G.bus.on('concert:finished',()=>events++);third(e);e.click('next');assert.equal(JSON.stringify(e.G.state),before);assert.equal(e.storage.get(e.G.data.balance.saveKey),disk);assert.equal(events,0);assert.match(text(e),/不会重复发奖/);});
test('真实setItem拒写保留原文/内存/第三段同session，原位谢幕重试只提交一次',()=>{
  const e=setup(),begins=spy(e,'begin'),finishes=spy(e,'finish');third(e);assert.ok(e.G.save.flush());const before=JSON.stringify(e.G.state),disk=e.storage.get(e.G.data.balance.saveKey);let events=0;e.G.bus.on('concert:finished',()=>events++);e.node('.concert-scroll').scrollTop=147;e.writeFails(true);e.click('next');assert.equal(JSON.stringify(e.G.state),before);assert.equal(e.storage.get(e.G.data.balance.saveKey),disk);assert.equal(e.node('h3').textContent,e.G.data.concert.verses[2].title);assert.equal(e.node('.concert-v2').dataset.state,'performing');assert.equal(e.toasts.length,0);assert.equal(events,0);assert.equal(e.key('status').getAttribute('role'),'alert');assert.equal(e.document.activeElement,e.key('next'));assert.equal(e.node('.concert-scroll').scrollTop,147);e.writeFails(false);e.click('next');assert.equal(begins.length,1);assert.equal(finishes[0][0],finishes[1][0]);assert.equal(events,1);assert.equal(e.G.state.quests.stats.concerts,1);
});
test('存档容量拒绝保持第三段，容量恢复可重试',()=>{const e=setup();third(e);const limit=e.G.data.balance.maxSaveBytes,before=JSON.stringify(e.G.state);e.G.data.balance.maxSaveBytes=1;e.click('next');assert.equal(JSON.stringify(e.G.state),before);assert.equal(e.toasts.length,0);e.G.data.balance.maxSaveBytes=limit;e.click('next');assert.equal(e.G.state.quests.stats.concerts,1);});
test('重听旋律与ui.speak只委托本段，不推进；静音仍可完成',()=>{
  const e=setup(),calls=spy(e,'advance');e.G.state.settings.music=0;e.G.state.settings.sfx=0;e.G.state.settings.tts=false;e.click('next');e.click('melody');e.click('story');assert.equal(calls.length,0);assert.deepEqual(plays(e),['concert_0','concert_0']);assert.equal(e.speech.length,1);assert.equal(e.speech[0].text,e.G.data.concert.verses[0].text);assert.equal(e.speech[0].source,e.key('story'));e.click('next');e.click('story');assert.equal(e.speech.at(-1).text,e.G.data.concert.verses[1].text);e.click('next');e.click('next');assert.equal(e.G.state.quests.stats.concerts,1);
});
test('主动中途收起取消内存，无奖励；旧按钮无监听，重开从第一段',()=>{
  const e=setup(),calls=spy(e,'cancel'),begins=spy(e,'begin');e.click('next');const old=e.key('next'),before=JSON.stringify(e.G.state);e.modal.close();old.dispatch('click');assert.equal(JSON.stringify(e.G.state),before);assert.equal(calls.length,1);assert.equal(old.listeners.get('click').size,0);assert.equal(typeof calls[0][0],'string');assert.equal(e.G.sys.concert.advance(calls[0][0]).ok,false);e.G.ui.concert.open();e.allFrames();e.click('next');assert.equal(e.node('h3').textContent,e.G.data.concert.verses[0].title);
});
test('换档关闭旧弹窗、释放Canvas/监听/RAF；旧按钮与迟到帧不串新档',()=>{
  const e=setup();e.click('next');const old=e.key('next'),canvas=e.modal.body.querySelectorAll('canvas'),late=[...e.frames.values()],count=e.draws.length;const fresh=e.parse(e.G.state);e.G.store.replace(fresh);old.dispatch('click');late.forEach(fn=>fn());assert.equal(e.modal,null);canvas.forEach(c=>{assert.equal(c.width,0);assert.equal(c.height,0);});assert.equal(e.frames.size,0);assert.equal(e.draws.length,count);assert.equal(e.tracked.get('state:replace').size,0);assert.equal(e.tracked.get('state:change').size,0);assert.equal(e.G.state.quests.stats.concerts,0);assert.equal(e.audio.at(-1),'stopConcert');
});
test('房型/来宾ID/顺序改变使旧场无效，重读并主动重新入场',()=>{
  for(const mode of ['room','guests','order']){const e=setup(),calls=spy(e,'begin');e.click('next');const before=e.G.state.quests.stats.concerts;if(mode==='room')e.G.store.update(s=>{s.house.rooms[e.roomId].type='living';});if(mode==='guests')e.G.store.update(s=>{s.residents.lily.movedIn=false;});if(mode==='order'){e.G.data.residents.reverse();e.G.bus.emit('state:change',e.G.state);}e.allFrames();assert.equal(e.node('.concert-v2').dataset.state,'lobby');assert.match(text(e),/本场已暂停/);assert.equal(e.G.state.quests.stats.concerts,before);if(mode==='room')e.G.store.update(s=>{s.house.rooms[e.roomId].type='music';});e.click('next');assert.equal(calls.length,2);assert.equal(e.node('h3').textContent,e.G.data.concert.verses[0].title);}
});
test('指定房间消失时即使另有音乐室也必须关闭后重入',()=>{const e=harness();e.prepare();const other=e.G.sys.building.buildRoom(2,1,'music').roomId;e.G.ui.concert.open(e.roomId);e.allFrames();e.click('next');e.G.store.update(s=>{s.house.rooms[e.roomId].type='living';});assert.ok(e.G.sys.concert.status().roomIds.includes(other));assert.equal(e.key('next').disabled,true);assert.match(text(e),/当前音乐室重新进入/);assert.equal(e.G.state.quests.stats.concerts,0);});
test('保存/状态/完成同步重入旧按钮与open新按钮，finish仅一次',()=>{
  for(const mode of ['save','change','finished','open']){const e=setup();third(e);const old=e.key('next'),calls=spy(e,'finish');const reenter=()=>{if(mode==='open'){e.G.ui.concert.open();e.key('next').dispatch('click');}else old.dispatch('click');};if(mode==='save'){const commit=e.G.save.commit;e.G.save.commit=(...args)=>{reenter();return commit(...args);};}else e.G.bus.on(mode==='change'?'state:change':'concert:finished',reenter);old.focus();old.click();e.allFrames();assert.equal(calls.length,1);assert.equal(e.G.state.quests.stats.concerts,1);if(mode==='open')assert.equal(e.toasts.length,0);}
});
test('同步完成事件关闭/换档/改来宾，不显示迟到谢幕成功',()=>{
  for(const mode of ['close','replace','guests']){const e=setup();third(e);const fresh=e.parse(e.G.state),old=e.key('next');e.G.bus.on('concert:finished',()=>{if(mode==='close')e.modal.close();else if(mode==='replace')e.G.store.replace(fresh);else e.G.store.update(s=>{s.residents.lily.movedIn=false;});});e.click('next');if(mode!=='guests')old.dispatch('click');assert.equal(e.toasts.length,0);if(mode==='replace')assert.equal(e.G.state.quests.stats.concerts,0);if(mode==='guests'){assert.equal(e.node('.concert-v2').dataset.state,'lobby');assert.match(text(e),/本场已暂停/);}}
});
test('提交后异常不假成功，已存记录不回滚，主动重新入场不重复回忆',()=>{
  const e=setup();third(e);const finish=e.G.sys.concert.finish,before=e.G.state.memories.length;e.G.sys.concert.finish=(...args)=>{finish(...args);throw new Error('after commit');};e.click('next');assert.equal(e.G.state.quests.stats.concerts,1);assert.equal(e.toasts.length,0);assert.match(text(e),/结果暂未确认/);assert.equal(e.G.state.memories.length,before+1);e.G.sys.concert.finish=finish;e.click('restart');third(e);e.click('next');assert.equal(e.G.state.memories.length,before+1);
});
test('finish拒绝/throw/未知结果不显示成功；失效场次有主动重新入场路径',()=>{
  for(const mode of ['cancel','throw','unknown']){const e=setup();third(e);if(mode==='cancel')e.G.sys.concert.cancel();else e.G.sys.concert.finish=()=>{if(mode==='throw')throw new Error('test');};e.click('next');assert.equal(e.G.state.quests.stats.concerts,0);assert.equal(e.toasts.length,0);if(mode==='cancel'){assert.equal(e.key('restart').hidden,true);assert.match(text(e),/重新邀请大家入场/);}else{assert.equal(e.key('restart').hidden,false);e.click('restart');}assert.equal(e.node('.concert-v2').dataset.state,'lobby');assert.equal(e.key('next').disabled,false);}
});
test('同步回调聚焦页外或主动滚动，不把焦点抢回主按钮',()=>{const e=setup();third(e);const outside=new e.Node('button');e.document.body.append(outside);e.G.bus.on('concert:finished',()=>{outside.focus();e.node('.concert-scroll').scrollTop=217;});e.click('next');assert.equal(e.document.activeElement,outside);assert.equal(e.node('.concert-scroll').scrollTop,217);});
test('推进/拒写焦点与实际scrollTop不跳，隐藏当前故事按钮前已捕获焦点',()=>{
  const e=setup();e.node('.concert-scroll').scrollTop=163;e.click('next');assert.equal(e.document.activeElement,e.key('next'));assert.equal(e.key('next').focusOptions.preventScroll,true);assert.equal(e.node('.concert-scroll').scrollTop,163);e.key('story').focus({preventScroll:true});e.G.store.update(s=>{s.residents.lily.movedIn=false;});assert.equal(e.key('story').hidden,true);assert.equal(e.document.activeElement,e.key('next'));assert.equal(e.node('.concert-scroll').scrollTop,163);
});
test('重新入场隐藏原重入按钮后焦点落主按钮，保留滚动',()=>{const e=setup();e.click('next');e.node('.concert-scroll').scrollTop=141;e.click('restart');assert.equal(e.key('restart').hidden,true);assert.equal(e.document.activeElement,e.key('next'));assert.equal(e.node('.concert-scroll').scrollTop,141);});
test('status异常可重新读取，所有操作不假成功',()=>{const e=setup();e.click('next');const status=e.G.sys.concert.status;e.G.sys.concert.status=()=>{throw new Error('read');};e.click('retry');assert.equal(e.key('next').disabled,true);assert.equal(e.node('.concert-v2').dataset.state,'unreadable');assert.equal(e.toasts.length,0);e.G.sys.concert.status=status;e.click('retry');assert.equal(e.key('next').disabled,false);e.click('next');assert.equal(e.node('h3').textContent,e.G.data.concert.verses[0].title);});
test('12位/长名称与三段长全文不截断，人物沿原drawCharacter API无固定12人',()=>{
  const e=harness();e.prepare(12);const long='名字很长的朋友'.repeat(8);e.G.data.residents[0].name=long;e.G.data.concert.verses[0].text='完整故事段落'.repeat(100);e.G.ui.concert.open();e.allFrames();assert.equal(e.node('.concert-guests').children.length,12);assert.equal(e.draws.length,12);assert.ok(text(e).includes(long));e.click('next');assert.equal(e.node('.concert-copy').textContent,e.G.data.concert.verses[0].text);assert.equal(e.draws.length,12);e.click('next');assert.equal(e.draws.length,12);
});
test('Canvas委托失败降级文字，舞台迟到帧关闭后不绘制或夺焦点',()=>{
  const e=harness();e.prepare();e.G.render.drawCharacter=()=>{throw new Error('draw');};e.G.ui.concert.open();const late=[...e.frames.values()],canvases=e.modal.body.querySelectorAll('canvas');e.allFrames();e.click('next');assert.equal(e.node('.concert-copy').textContent,e.G.data.concert.verses[0].text);const before=e.operations.length;e.modal.close();const cleared=e.operations.length;late.forEach(fn=>fn());assert.equal(e.operations.length,cleared);assert.ok(cleared>before);canvases.forEach(c=>assert.equal(c.width,0));assert.equal(e.frames.size,0);
});
test('重复打开仅一场/一组监听，旧onClose不cancel新场，所有资源归零',()=>{
  const e=setup(),cancels=spy(e,'cancel');e.click('next');const old=e.modal,canvases=old.body.querySelectorAll('canvas');e.G.ui.concert.open();e.allFrames();e.click('next');old.close();assert.equal(cancels.length,1);assert.equal(e.tracked.get('state:replace').size,1);assert.equal(e.tracked.get('state:change').size,1);canvases.forEach(c=>assert.equal(c.width,0));e.modal.close();assert.equal(e.tracked.get('state:replace').size,0);assert.equal(e.tracked.get('state:change').size,0);assert.equal(e.frames.size,0);
});
test('begin/advance同步换档返回后不绘制/播音/恢复旧场，入场已建立的内存会话也取消',()=>{
  for(const method of ['begin','advance']){const e=setup();if(method==='advance')e.click('next');const original=e.G.sys.concert[method],before=plays(e).length,fresh=e.parse(e.G.state);let sessionId;e.G.sys.concert[method]=(...args)=>{const result=original(...args);sessionId=result.sessionId||args[0];e.G.store.replace(fresh);return result;};e.click('next');assert.equal(e.modal,null);assert.equal(plays(e).length,before);assert.equal(e.G.sys.concert.advance(sessionId).ok,false);assert.equal(e.G.state.quests.stats.concerts,0);assert.equal(e.frames.size,0);}
});
test('保存commit同步换档即使底层随后返回成功，旧UI无toast或谢幕画面',()=>{
  const e=setup();third(e);const commit=e.G.save.commit,fresh=e.parse(e.G.state);e.G.save.commit=(...args)=>{const value=commit(...args);e.G.store.replace(fresh);return value;};e.click('next');assert.equal(e.modal,null);assert.equal(e.toasts.length,0);assert.equal(e.frames.size,0);
});
test('提交busy期间关闭或换新弹窗且保存拒写，返回后补取消旧内存场次',()=>{
  for(const mode of ['close','open']){const e=setup();third(e);const finishes=spy(e,'finish');e.G.save.commit=()=>{if(mode==='close')e.modal.close();else e.G.ui.concert.open();return false;};e.click('next');assert.equal(e.G.state.quests.stats.concerts,0);assert.equal(e.toasts.length,0);assert.equal(e.G.sys.concert.advance(finishes[0][0]).ok,false);if(mode==='open'){e.click('next');assert.equal(e.node('h3').textContent,e.G.data.concert.verses[0].title);}}
});
test('真实系统提交后通知throw返回失败，只提示核对并重新入场',()=>{
  const e=setup();third(e);const emit=e.G.bus.emit;e.G.bus.emit=(name,payload)=>{if(name==='concert:finished')throw new Error('event after commit');return emit(name,payload);};e.click('next');assert.equal(e.G.state.quests.stats.concerts,1);assert.equal(e.toasts.length,0);assert.equal(e.node('.concert-v2').dataset.state,'lobby');assert.match(e.key('status').textContent,/结果暂未确认/);e.G.bus.emit=emit;third(e);e.click('next');assert.equal(e.G.state.quests.stats.concerts,1);
});
test('读取期间同步关闭/换档，不更新已释放舞台或读出成功',()=>{
  const e=setup(),status=e.G.sys.concert.status,fresh=e.parse(e.G.state);e.G.sys.concert.status=()=>{const value=status();e.G.store.replace(fresh);return value;};e.click('next');assert.equal(e.modal,null);assert.equal(plays(e).length,0);assert.equal(e.toasts.length,0);assert.equal(e.frames.size,0);
});
test('开启时同步onClose不会触发未初始化unsubscribe，旧初始帧无效',()=>{
  const e=harness();e.prepare();const modal=e.G.ui.modal;e.G.ui.modal=options=>{const handle=modal(options);handle.close();return handle;};assert.doesNotThrow(()=>e.G.ui.concert.open());e.allFrames();assert.equal(e.modal,null);assert.equal(e.draws.length,0);assert.equal(e.toasts.length,0);
});
test('保存反馈固定在主动作旁，所有状态仍有可见语义与恢复动作',()=>{
  const e=setup();third(e);e.writeFails(true);e.click('next');assert.equal(e.key('status').parentElement,e.key('next').parentElement);assert.equal(e.key('status').getAttribute('aria-live'),'polite');assert.equal(e.key('status').getAttribute('aria-atomic'),'true');assert.equal(e.key('status').tabIndex,-1);assert.equal(e.key('next').getAttribute('aria-describedby'),e.key('status').id);assert.equal(e.key('restart').hidden,false);
});
test('独立CSS固定操作/48px/手机四列安全边距/全文/减少动态，源码无计时网络与规则写入',()=>{
  const css=fs.readFileSync(path.join(root,'css/concert.css'),'utf8'),source=fs.readFileSync(path.join(root,'js/ui/concert.js'),'utf8');assert.match(css,/min-height:48px/);assert.match(css,/overflow-y:auto/);assert.match(css,/flex-shrink:0/);assert.match(css,/padding:54px 16% 18px/);assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);assert.match(css,/overflow-wrap:anywhere/);assert.match(css,/max-height:540px/);assert.match(css,/prefers-reduced-motion:reduce/);assert.doesNotMatch(css,/line-clamp|text-overflow|white-space:nowrap/);assert.doesNotMatch(source,/setInterval|setTimeout|localStorage|store\.update|fetch\(|AudioContext|Math\.random|ui\.refresh/);assert.equal(effectiveExports(source),true);
});
function effectiveExports(source){return /ui\.concert = \{ open \}/.test(source);}
module.exports={harness};
if(require.main===module)(async()=>{for(const [name,fn]of tests){await fn();console.log('✓ '+name);}console.log('\n'+tests.length+' 组合奏UI隔离检查通过（内存DOM/合成档案/真实规则与拒写/Canvas委托；不代表正式整页、主场景、真实听感或触屏读屏）。');})().catch(error=>{console.error(error);process.exitCode=1;});
