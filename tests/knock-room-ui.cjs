'use strict';
// 串门组件的敲门流程：被要求敲门→等待→同意后带凭证加入／婉拒／取消／路过提示；轻DOM，不发网络。
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const tests=[],plain=x=>JSON.parse(JSON.stringify(x)),idle=()=>new Promise(resolve=>setImmediate(resolve)),house='11111111-1111-4111-8111-111111111111';
function test(name,fn){tests.push({name,fn});}
function sandbox(initial={},options={}){
 let state={phase:'idle',authenticated:false,houseId:null,peerId:null,revision:0,peers:[],messages:[],error:'',...initial};const listeners=[],calls=[],states=[],moves=[],handlers={...options.handlers};
 const document={activeElement:null,hidden:!!options.hidden,currentScript:{src:'https://game.test/play/releases/r-'+'a'.repeat(64)+'/js/ui/live-room.js'}};
 class Node{
  constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.attributes={};this.dataset={};this.className='';this._text='';this.value='';this.hidden=false;this.disabled=false;this.listeners={};this.scrollHeight=0;this.scrollTop=0;this.clientHeight=200;}
  set textContent(value){this._text=String(value);this.children.forEach(n=>n.parentElement=null);this.children=[];}get textContent(){return this._text+this.children.map(n=>n.textContent).join('');}
  set innerHTML(_){throw new Error('聊天不得写入HTML');}
  append(...nodes){for(const node of nodes){if(node.parentElement)node.parentElement.removeChild(node);node.parentElement=this;this.children.push(node);}}
  removeChild(node){const i=this.children.indexOf(node);assert.ok(i>=0);this.children.splice(i,1);node.parentElement=null;return node;}
  insertBefore(node,before){if(!before){this.append(node);return;}if(node.parentElement)node.parentElement.removeChild(node);const i=this.children.indexOf(before);assert.ok(i>=0);this.children.splice(i,0,node);node.parentElement=this;}
  setAttribute(name,value){this.attributes[name]=String(value);}removeAttribute(name){delete this.attributes[name];}
  addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}async fire(name,extra={}){return Promise.all((this.listeners[name]||[]).map(fn=>fn({preventDefault(){},...extra})));}
  click(){return this.disabled?Promise.resolve():this.fire('click');}focus(){document.activeElement=this;}
  querySelectorAll(selector){return descendants(this).filter(n=>selector==='button'&&n.tagName==='BUTTON');}
  get classList(){const has=name=>this.className.split(/\s+/).includes(name),change=(name,on)=>{const values=new Set(this.className.split(/\s+/).filter(Boolean));if(on)values.add(name);else values.delete(name);this.className=[...values].join(' ');return on;};return{contains:has,toggle:(name,on)=>change(name,on===undefined?!has(name):on),add:name=>change(name,true),remove:name=>change(name,false)};}
 }
 function descendants(node){return[node,...node.children.flatMap(descendants)];}
 document.createElement=tag=>new Node(tag);const body=new Node('body'),container=new Node('div');body.append(container);
 const emit=()=>listeners.slice().forEach(fn=>fn(plain(state)));
 const live={status:()=>plain(state),subscribe(fn){listeners.push(fn);return()=>{const i=listeners.indexOf(fn);if(i>=0)listeners.splice(i,1);};},async probe(){calls.push({name:'probe'});if(handlers.probe)return handlers.probe();emit();return{ok:true};},async join(houseId,displayName,pass){calls.push({name:'join',houseId,displayName,pass});if(handlers.join)return handlers.join(houseId,displayName,pass);state={...state,phase:'connected',authenticated:true,houseId,peerId:'one',revision:1,peers:[{id:'one',displayName,avatar:{},isHost:true,zone:'yard',x:.5,y:.5,updatedAt:1}]};emit();return{ok:true};},async chat(text){calls.push({name:'chat',text});return handlers.chat?handlers.chat(text):{ok:true};},async kick(peerId){calls.push({name:'kick',peerId});return handlers.kick?handlers.kick(peerId):{ok:true};},async leave(keepalive){calls.push({name:'leave',keepalive});state={...state,phase:'left',peerId:null,houseId:null,peers:[],messages:[]};emit();return{ok:true};},destroy(){throw new Error('组件卸载不能永久关闭BFCache复用的客户端');}};
 live.knock=async function(houseId,progress){calls.push({name:'knock',houseId});if(handlers.knock)return handlers.knock(houseId,progress);return{ok:true,status:'approved',ticket:'t-1'};};live.cancelKnock=function(){calls.push({name:'cancelKnock'});if(handlers.cancel)handlers.cancel();};
 live.quickJoin=async function(houseId,pass){calls.push({name:'quickJoin',houseId,pass});if(handlers.quickJoin)return handlers.quickJoin(houseId,pass);calls.push({name:'quickJoin',houseId});if(handlers.quickJoin)return handlers.quickJoin(houseId);state={...state,phase:'connected',authenticated:true,houseId,peerId:'one',revision:1,peers:[{id:'one',displayName:'公开小云',avatar:{},isHost:false,zone:'yard',x:.5,y:.5,updatedAt:1}]};emit();return{ok:true};};
 const G={live,ui:{},store:{update(){throw new Error('聊天不能写存档');}},cloud:{prepare(){throw new Error('不能启动私档同步');}}};
 const context=vm.createContext({window:{Game:G},document,console,Map,Set,Promise});vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/ui/live-room.js'),'utf8'),context,{filename:'js/ui/live-room.js'});
 const widget=G.ui.liveRoom.mount(container,{houseId:house,onState:s=>states.push(plain(s)),onMove:dir=>moves.push(dir),quickJoin:options.quickJoin===true});
 const all=()=>descendants(body),hidden=n=>!n||n.hidden||n.parentElement&&hidden(n.parentElement);
 function control(label){const node=all().find(n=>n.tagName==='BUTTON'&&n.textContent===label&&!hidden(n));assert.ok(node,label);return node;}
 function field(name){const node=all().find(n=>n.tagName==='INPUT'&&n.name===name);assert.ok(node,name);return node;}
 return{G,widget,all,calls,states,moves,handlers,document,control,field,hidden,root:()=>container.children[0],state:()=>state,change(change){state={...state,...change};emit();},submit:kind=>all().find(n=>n.tagName==='FORM'&&n.classList.contains(kind==='chat'?'live-chat-form':'live-join-form')).fire('submit'),count:name=>calls.filter(c=>c.name===name).length};
}
const joined={phase:'connected',authenticated:true,houseId:house,peerId:'one',revision:1,peers:[{id:'one',displayName:'小云',isHost:true,avatar:{},zone:'yard',x:.5,y:.5,updatedAt:1},{id:'two',displayName:'小兔',isHost:false,avatar:{},zone:'yard',x:.3,y:.5,updatedAt:1}]};

const required={ok:false,code:'LIVE_KNOCK_REQUIRED',message:'先敲敲门，等主人同意后才能进来哦。'};
const connectAs=(b,name)=>{b.change({phase:'connected',authenticated:true,houseId:house,peerId:'me',revision:1,peers:[{id:'me',displayName:name,avatar:{},isHost:false,zone:'yard',x:.5,y:.5,updatedAt:1}]});return{ok:true};};
test('路过模式提示：登录后未进屋时可见，进屋后收起；加入表单说明需要主人同意',async()=>{
 const b=sandbox({authenticated:true});await idle();assert.ok(!b.hidden(b.all().find(n=>n.className.includes('live-room-passerby'))));assert.match(b.all().find(n=>n.className.includes('live-room-passerby')).textContent,/主人不会知道你来过/);assert.match(b.all().find(n=>n.className.includes('live-join-hint')).textContent,/先敲敲门/);
 b.change(joined);assert.ok(b.hidden(b.all().find(n=>n.className.includes('live-room-passerby'))));b.widget.destroy();
});
test('不是屋主：加入被要求敲门→显示等待与取消→同意后带凭证加入',async()=>{
 let release;const b=sandbox({authenticated:true},{handlers:{join:async(h,n,pass)=>pass?connectAs(b,n):required,knock:(h,progress)=>new Promise(resolve=>{progress('主人看到啦，稍等一下…');release=resolve;})}});await idle();
 b.field('live-display-name').value='小云';const joining=b.submit('join');await idle();await idle();
 const box=b.all().find(n=>n.className.includes('live-knock-box'));assert.ok(!b.hidden(box));assert.ok(b.hidden(b.all().find(n=>n.className.includes('live-join-form'))));assert.match(box.textContent,/主人看到啦/);
 release({ok:true,status:'approved',ticket:'t-9'});await joining;await idle();
 const join=b.calls.filter(c=>c.name==='join');assert.equal(join.length,2);assert.equal(join[0].pass,undefined);assert.equal(join[1].pass,'t-9');assert.equal(join[1].displayName,'小云');assert.equal(b.state().phase,'connected');assert.ok(b.hidden(box));b.widget.destroy();
});
test('主人婉拒/不在家/没回应：温和提示，回到可再试的状态，不带凭证加入',async()=>{
 for(const [status,message] of [['declined','主人现在不方便，过一会儿再来看看吧。'],['host_away','主人现在不在家，下次再来看看吧。'],['expired','主人还没有看到，稍后再试试吧。']]){
  const b=sandbox({authenticated:true},{handlers:{join:async()=>required,knock:async()=>({ok:false,status,message})}});await idle();await b.submit('join');await idle();
  assert.match(b.root().textContent,new RegExp(message.slice(0,6)));assert.equal(b.calls.filter(c=>c.name==='join').length,1);assert.ok(!b.hidden(b.all().find(n=>n.className.includes('live-join-form'))));assert.ok(b.hidden(b.all().find(n=>n.className.includes('live-knock-box'))));b.widget.destroy();
 }
});
test('等待中可以取消，取消后不再加入',async()=>{
 let release;const b=sandbox({authenticated:true},{handlers:{join:async()=>required,knock:()=>new Promise(resolve=>{release=resolve;}),cancel(){release({ok:false,status:'cancelled',message:'已取消敲门。'});}}});await idle();
 const joining=b.submit('join');await idle();await idle();b.control('先不进去了').click();await joining;await idle();assert.equal(b.count('cancelKnock'),1);assert.equal(b.calls.filter(c=>c.name==='join').length,1);assert.match(b.root().textContent,/已取消敲门/);b.widget.destroy();
});
test('从“敲门”链接打开（#join）：自动尝试一次→要求敲门→同意后用快捷称呼带凭证加入',async()=>{
 const b=sandbox({authenticated:true},{quickJoin:true,handlers:{probe:async()=>{return{ok:true};},quickJoin:async(h,pass)=>pass?connectAs(b,'公开小云'):required,knock:async()=>({ok:true,status:'approved',ticket:'t-quick'})}});
 b.change({authenticated:true});await idle();await idle();await idle();const q=b.calls.filter(c=>c.name==='quickJoin');assert.equal(q.length,2);assert.equal(q[0].pass,undefined);assert.equal(q[1].pass,'t-quick');assert.equal(b.count('knock'),1);assert.equal(b.state().phase,'connected');b.widget.destroy();
});
(async()=>{for(const t of tests){await t.fn();console.log('✓ '+t.name);}console.log(tests.length+' 组敲门界面检查通过（轻DOM，不发网络）');})().catch(e=>{console.error(e);process.exit(1);});
