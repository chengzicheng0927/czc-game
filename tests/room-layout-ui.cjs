'use strict';
// 执行真实位置图UI与事件处理；轻量DOM只替代浏览器，不替代房间事务规则验收。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
function sandbox() {
  const all = [], calls = [], toasts = [], timers = new Map(), documentListeners = new Map(), windowListeners = new Map(); let timerId = 0, activeOptions = null, currentBody = null, failSwap = false;
  const on = (map, name, fn) => { if (!map.has(name)) map.set(name, new Set()); map.get(name).add(fn); };
  const off = (map, name, fn) => map.get(name)?.delete(fn);
  function event(values = {}) { return Object.assign({ target:null, button:0, isPrimary:true, pointerId:1, clientX:10, clientY:10, prevented:false, preventDefault() { this.prevented = true; }, stopPropagation() {}, stopImmediatePropagation() {} }, values); }
  function emit(map, name, values) { const next = event(values); [...(map.get(name) || [])].forEach(fn => fn(next)); return next; }
  class Node {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.parentElement = null; this.dataset = {}; this.attributes = {}; this.listeners = new Map(); this.className = ''; this.style = {}; this.disabled = false; this._text = ''; this.captures = new Set(); all.push(this); }
    get isConnected() { return this === document.body || !!this.parentElement?.isConnected; }
    set textContent(value) { this.replaceChildren(); this._text = String(value); }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    append(...nodes) { nodes.forEach(node => { node.remove(); this.children.push(node); node.parentElement = this; }); }
    replaceChildren(...nodes) { this.children.forEach(child => { child.parentElement = null; }); this.children = []; this._text = ''; this.append(...nodes); }
    remove() { if (this.parentElement) { this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null; } }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    addEventListener(name, fn) { on(this.listeners, name, fn); }
    removeEventListener(name, fn) { off(this.listeners, name, fn); }
    fire(name, values = {}) { return emit(this.listeners, name, Object.assign({target:this}, values)); }
    click() { if (!this.disabled) this.fire('click'); }
    focus() { if (this.isConnected) document.activeElement = this; }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    matches(selector) {
      if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
      const attribute = /^\[data-([a-z-]+)(?:="([^"]*)")?\]$/.exec(selector);
      if (attribute) { const key = attribute[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()); return Object.hasOwn(this.dataset, key) && (attribute[2] === undefined || this.dataset[key] === attribute[2]); }
      return this.tagName === selector.toUpperCase();
    }
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
    querySelectorAll(selector) { return this.children.flatMap(child => [child, ...child.querySelectorAll('*')]).filter(node => selector === '*' || node.matches(selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    setPointerCapture(id) { this.captures.add(id); }
    releasePointerCapture(id) { this.captures.delete(id); }
    get classList() {
      const change = (name, enabled) => { const names = new Set(this.className.split(/\s+/).filter(Boolean)); if (enabled) names.add(name); else names.delete(name); this.className = [...names].join(' '); };
      return { add:(...names) => names.forEach(name => change(name,true)), remove:(...names) => names.forEach(name => change(name,false)), contains:name => this.className.split(/\s+/).includes(name), toggle:(name, enabled) => change(name,enabled === undefined ? !this.className.split(/\s+/).includes(name) : enabled) };
    }
  }
  const document = { hidden:false, activeElement:null, hitNode:null, body:null, createElement:tag => new Node(tag), addEventListener:(name,fn) => on(documentListeners,name,fn), removeEventListener:(name,fn) => off(documentListeners,name,fn), elementFromPoint:() => document.hitNode };
  document.body = new Node('body');
  const environment = vm.createContext({ console, document, setTimeout(fn) { const id=++timerId; timers.set(id,fn); return id; }, clearTimeout:id => timers.delete(id) }); environment.window = environment;
  environment.addEventListener = (name,fn) => on(windowListeners,name,fn); environment.removeEventListener = (name,fn) => off(windowListeners,name,fn);
  for (const file of ['js/core/namespace.js','js/data/balance.js','js/data/content.js','js/core/bus.js']) vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),environment,{filename:file});
  const G=environment.Game; G.ui={};
  G.state={house:{rooms:{a:{type:'bedroom',items:[{uid:'bed'}]},b:{type:'kitchen',items:[]}},floors:[{slots:['a','b',null]}]},residents:{lily:{movedIn:true,roomId:'a'}}};
  G.sys.building={
    roomPosition(id) { if (!Object.hasOwn(G.state.house.rooms,id)) return null; for (let floorIdx=0;floorIdx<G.state.house.floors.length;floorIdx++) { const slotIdx=G.state.house.floors[floorIdx].slots.indexOf(id); if (slotIdx>=0) return {floorIdx,slotIdx}; } return null; },
    layoutSlots() { return G.state.house.floors.flatMap((floor,floorIdx) => floor.slots.map((roomId,slotIdx)=>({floorIdx,slotIdx,roomId,locked:false}))); },
    swapRooms(...args) { calls.push(args); if (failSwap) return {ok:false,message:'保存失败，请再试一次。'}; const [id,floorIdx,slotIdx]=args, from=this.roomPosition(id), other=G.state.house.floors[floorIdx].slots[slotIdx]; G.state.house.floors[from.floorIdx].slots[from.slotIdx]=other;G.state.house.floors[floorIdx].slots[slotIdx]=id;return {ok:true,message:'房间位置换好啦。'}; }
  };
  G.audio={play() {}}; G.ui.toast=value=>toasts.push(value);
  G.ui.controls={close() {},select(options,value,onChange) { const node=new Node('button');node.value=value;node.choose=value=>{node.value=value;onChange(value);};return node; },label(node,text) { const wrapper=new Node('div'),label=new Node('span');label.textContent=text;wrapper.append(label,node);return wrapper; }};
  function render() { const result=G.ui.roomLayout.panel(activeOptions);currentBody=result.content;document.body.replaceChildren(currentBody);G.bus.emit('panel:change',{open:true,height:570});return currentBody; }
  G.ui.open=(name,options={})=>{assert.equal(name,'roomLayout');activeOptions=options;return render();};G.ui.refresh=()=>render();
  vm.runInContext(fs.readFileSync(path.join(root,'js/ui/room-layout.js'),'utf8'),environment,{filename:'js/ui/room-layout.js'});
  const open=options=>G.ui.roomLayout.open(options||'a'), cell=slot=>currentBody.querySelector('[data-layout-slot="'+slot+'"]'), confirm=()=>currentBody.querySelector('[data-ui-focus="room-layout-confirm"]');
  function startDrag() { const source=cell('0:0');currentBody.fire('pointerdown',{target:source});document.hitNode=cell('0:1');emit(documentListeners,'pointermove',{clientX:35,clientY:35});assert.equal(G.ui.roomLayout.isInteracting(),true);return source; }
  const listenerCount=()=>[...documentListeners.values(),...windowListeners.values()].reduce((sum,entries)=>sum+entries.size,0);
  function cleaned() { assert.equal(G.ui.roomLayout.isInteracting(),false);assert.equal(listenerCount(),0);assert.equal(all.reduce((sum,node)=>sum+node.captures.size,0),0);assert.equal(document.body.querySelectorAll('.room-layout-drag-tag').length,0); }
  return {G,document,all,calls,toasts,open,cell,confirm,startDrag,cleaned,body:()=>currentBody,emitDocument:(name,values)=>emit(documentListeners,name,values),emitWindow:(name,values)=>emit(windowListeners,name,values),fail(value) {failSwap=value;},flushTimers() {const values=[...timers.values()];timers.clear();values.forEach(fn=>fn());}};
}
let passed=0;function test(name,fn) {fn();passed++;console.log('✓ '+name);}
test('点目标只预览，确认才传预期房间ID；来源与住户不改成目标ID',()=>{
  const env=sandbox();env.open();env.cell('0:1').click();assert.equal(env.calls.length,0);assert.equal(env.confirm().disabled,false);assert.match(env.body().textContent,/卧室.*1楼第1格.*1楼第2格/);env.confirm().click();assert.deepEqual(env.calls,[['a',0,1,'b']]);assert.deepEqual(env.G.state.house.floors[0].slots,['b','a',null]);assert.equal(env.G.state.residents.lily.roomId,'a');assert.equal(env.confirm().disabled,true);
});
test('空格提交显式null快照，规则返回保存失败时保留预览和重试入口',()=>{
  const env=sandbox();env.open();env.cell('0:2').click();env.fail(true);env.confirm().click();assert.deepEqual(env.calls,[['a',0,2,null]]);assert.equal(env.confirm().disabled,false);assert.match(env.body().textContent,/保存失败/);assert.deepEqual(env.G.state.house.floors[0].slots,['a','b',null]);env.fail(false);env.confirm().click();assert.deepEqual(env.G.state.house.floors[0].slots,[null,'b','a']);
});
for (const [kind,change] of [
  ['源位置已改变',state=>{state.house.floors[0].slots=['b','a',null];}],
  ['源房间已拆除',state=>{delete state.house.rooms.a;state.house.floors[0].slots[0]=null;}],
  ['源用途已改变',state=>{state.house.rooms.a.type='kitchen';}],
  ['目标房间已改变',state=>{state.house.rooms.c={type:'kitchen',items:[]};state.house.floors[0].slots[1]='c';}],
  ['目标用途已改变',state=>{state.house.rooms.b.type='bedroom';}]
]) test(kind+'时，旧确认处理器同步拒绝且清预览，不调用规则API',()=>{
  const env=sandbox();env.open();env.cell('0:1').click();const stale=env.confirm();change(env.G.state);stale.click();assert.equal(env.calls.length,0);assert.equal(env.confirm().disabled,true);assert.match(env.body().textContent,/已经改变|重新挑选/);
});
test('DOM标签拖动只选目标，释放后清监听和捕获，主动确认才移动',()=>{
  const env=sandbox();env.open();env.startDrag();env.emitDocument('pointerup',{clientX:35,clientY:35});env.cleaned();assert.equal(env.calls.length,0);assert.equal(env.confirm().disabled,false);env.confirm().click();assert.deepEqual(env.calls,[['a',0,1,'b']]);
});
for(const [label,cancel] of [
  ['Esc',env=>env.emitDocument('keydown',{key:'Escape'})],
  ['第二根手指',env=>env.emitDocument('pointerdown',{pointerId:2,isPrimary:false})],
  ['后台隐藏',env=>{env.document.hidden=true;env.emitDocument('visibilitychange');}],
  ['窗口失焦',env=>env.emitWindow('blur')],
  ['pointercancel',env=>env.emitDocument('pointercancel')]
]) test(label+'取消拖动，不提交并释放全部手势期监听',()=>{
  const env=sandbox();env.open();env.startDrag();cancel(env);env.cleaned();assert.equal(env.calls.length,0);env.emitDocument('pointerup',{clientX:35,clientY:35});assert.equal(env.calls.length,0);assert.equal(env.confirm().disabled,true);assert.match(env.body().textContent,/取消|原位/);
});
test('面板收起与换档都释放临时资源，旧目标不会在刷新后复活',()=>{
  for(const replace of [false,true]) {const env=sandbox();env.open({roomId:'a',target:{floorIdx:0,slotIdx:1,roomId:'b'}});assert.equal(env.confirm().disabled,false);env.startDrag();env.G.bus.emit(replace?'state:replace':'panel:change',replace?env.G.state:{open:false});env.cleaned();env.G.ui.refresh();assert.equal(env.confirm().disabled,true);assert.equal(env.calls.length,0);}
});
test('键盘Esc清预览，方向键可移动位置图焦点',()=>{
  const env=sandbox();env.open();env.cell('0:1').click();env.body().fire('keydown',{key:'Escape',target:env.confirm()});assert.equal(env.confirm().disabled,true);env.body().fire('keydown',{key:'ArrowRight',target:env.cell('0:0')});assert.equal(env.document.activeElement,env.cell('0:1'));assert.equal(env.calls.length,0);
});
console.log('\n'+passed+' 组房间位置图交互检查通过（轻量DOM，不替代真实手机/桌面验收）。');
