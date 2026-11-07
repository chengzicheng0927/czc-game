'use strict';
// 实时客户端与私档完全隔离；使用内存HTTP替身/假时钟验证会话、迟到与清理。
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../js/core/live.js'),'utf8'),tests=[],plain=x=>JSON.parse(JSON.stringify(x));
const house='11111111-1111-4111-8111-111111111111',otherHouse='22222222-2222-4222-8222-222222222222',build='r-'+'a'.repeat(64),idle=()=>new Promise(resolve=>setImmediate(resolve));
function test(name,fn){tests.push({name,fn});}
function sandbox(options={}){
 let now=100000,nextId=1;const timers=new Map(),calls=[],windowListeners={},documentListeners={};const peer={id:'peer_one',displayName:'小云',avatar:{hair:'short'},isHost:true,zone:'yard',x:.5,y:.5,updatedAt:now};
 const server={auth:true,revision:1,peer:plain(peer),peers:[plain(peer)],messages:[],holdPoll:true};
 const FakeDate=class extends Date{static now(){return now;}};
 const document={hidden:false,currentScript:{src:options.file?'file:///game/js/core/live.js':'https://game.test/play/releases/'+build+'/js/core/live.js'},addEventListener(name,fn){(documentListeners[name]??=[]).push(fn);},removeEventListener(name,fn){documentListeners[name]=(documentListeners[name]||[]).filter(x=>x!==fn);}};
 const setTimer=(fn,ms)=>{const id=nextId++;timers.set(id,{at:now+(ms||0),fn});return id;};const clearTimer=id=>timers.delete(id);
 function response(status,data){return{ok:status>=200&&status<300,status,json:async()=>plain(data)};}
 const window={Game:{},location:new URL(options.file?'file:///game/index.html':'https://game.test/play/visit/'+house),AbortController,crypto:{randomUUID:()=> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},addEventListener(name,fn){(windowListeners[name]??=[]).push(fn);},removeEventListener(name,fn){windowListeners[name]=(windowListeners[name]||[]).filter(x=>x!==fn);}};
 Object.defineProperty(window,'localStorage',{get(){throw new Error('实时客户端不能读写私档存储');}});window.Game.cloud={prepare(){throw new Error('不能初始化私档同步');}};
 window.fetch=async(url,request)=>{const route=url.slice(url.indexOf('/api/v1/live')+'/api/v1/live'.length),call={route,request,body:request.body&&JSON.parse(request.body)};calls.push(call);if(options.handle){const answer=await options.handle(call,server,response);if(answer!==undefined)return answer;}
  if(route==='/me')return response(200,server.auth?{authenticated:true,liveKey:'private_live_key',csrfToken:'private_csrf'}:{authenticated:false});
  if(route==='/join')return response(200,{peerId:server.peer.id,revision:server.revision,house:{id:call.body.houseId,title:'公开小屋'},peers:server.peers,messages:[]});
  if(route.startsWith('/poll?')){if(server.pollError)return response(server.pollError,{message:'之前的加入已经结束。',code:'LIVE_MEMBERSHIP_GONE'});if(server.holdPoll)return new Promise((resolve,reject)=>{server.releasePoll=data=>resolve(response(200,data));request.signal?.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});});return response(200,{revision:server.revision,peers:server.peers,messages:server.messages});}
  return response(200,{ok:true});
 };
 const env=vm.createContext({window,document,console,URL,Date:FakeDate,Math,Map,Set,Promise,setTimeout:setTimer,clearTimeout:clearTimer});vm.runInContext(source,env,{filename:'js/core/live.js'});
 async function tick(ms){now+=ms;for(let i=0;i<30;i++){const due=[...timers].filter(([,t])=>t.at<=now);if(!due.length)break;for(const[id,t]of due){if(!timers.has(id))continue;timers.delete(id);t.fn();}await idle();}}
 return{G:window.Game,server,calls,windowListeners,documentListeners,timers,tick,response,async hide(value){document.hidden=value;for(const fn of(documentListeners.visibilitychange||[]).slice())fn();await idle();},async pagehide(){for(const fn of(windowListeners.pagehide||[]).slice())fn();await idle();}};
}
test('联网凭据只在内存，状态不暴露Live/CSRF且私档适配器完全不启动',async()=>{
 const b=sandbox();assert.equal((await b.G.live.probe()).ok,true);assert.equal((await b.G.live.join(house,'小云')).ok,true);const status=b.G.live.status();assert.equal(status.phase,'connected');assert.equal(status.peerId,'peer_one');assert.ok(!JSON.stringify(status).includes('private_'));assert.ok(!Object.keys(status).includes('csrfToken'));
 for(const call of b.calls){assert.equal(call.request.credentials,'same-origin');assert.equal(call.request.cache,'no-store');assert.equal(call.request.headers['X-MC-Protocol'],'1');assert.equal(call.request.headers['X-MC-Build'],build);assert.equal(call.request.headers['X-MC-Account'],undefined);if(call.route==='/join'){assert.equal(call.request.headers['X-MC-Live'],'private_live_key');assert.equal(call.request.headers['X-CSRF-Token'],'private_csrf');assert.equal(call.request.headers['X-MC-Peer'],undefined);}}
 const clone=b.G.live.status();clone.peers[0].displayName='不能修改内部状态';assert.equal(b.G.live.status().peers[0].displayName,'小云');await b.G.live.leave();b.G.live.destroy();
});
test('文件入口不发请求，未登录可参观但不能加入',async()=>{
 const file=sandbox({file:true});assert.equal((await file.G.live.probe()).ok,false);assert.equal(file.calls.length,0);file.G.live.destroy();
 const b=sandbox();b.server.auth=false;assert.equal((await b.G.live.probe()).ok,true);assert.equal(b.G.live.status().authenticated,false);assert.equal((await b.G.live.join(house,'小云')).ok,false);assert.equal(b.calls.filter(x=>x.route==='/join').length,0);b.G.live.destroy();
});
test('非法昵称、位置与聊天在网络前拒绝，不接收任意请求路径',async()=>{
 const b=sandbox();assert.equal((await b.G.live.join('../private','小云')).ok,false);assert.equal((await b.G.live.join(house,'a\nb')).ok,false);assert.equal(b.calls.length,0);await b.G.live.join(house,'小云');const before=b.calls.length;
 assert.equal(b.G.live.move('yard',Infinity,.4).ok,false);assert.equal(b.G.live.move('yard',-.1,.4).ok,false);assert.equal((await b.G.live.chat('a\nb')).ok,false);assert.equal((await b.G.live.chat('字'.repeat(81))).ok,false);assert.equal(b.calls.length,before);assert.equal(b.G.live.request,undefined);await b.G.live.leave();b.G.live.destroy();
});
test('移动合并最后目的地、绑定当前peer并限于4次每秒，隐藏页不发送',async()=>{
 const b=sandbox();await b.G.live.join(house,'小云');b.G.live.move('yard',.1,.2);b.G.live.move('yard',.3,.4);await b.tick(0);let moves=b.calls.filter(x=>x.route==='/move');assert.equal(moves.length,1);assert.deepEqual(moves[0].body,{houseId:house,seq:1,zone:'yard',x:.3,y:.4});assert.equal(moves[0].request.headers['X-MC-Peer'],'peer_one');
 b.G.live.move('yard',.5,.6);await b.tick(249);assert.equal(b.calls.filter(x=>x.route==='/move').length,1);await b.tick(1);assert.equal(b.calls.filter(x=>x.route==='/move').length,2);await b.hide(true);assert.equal(b.G.live.move('yard',.7,.8).ok,false);await b.tick(1000);assert.equal(b.calls.filter(x=>x.route==='/move').length,2);await b.G.live.leave();b.G.live.destroy();
});
test('只保留一个轮询，消息按seq去重且最多32条，不复制凭据',async()=>{
 const b=sandbox();await b.G.live.join(house,'小云');await b.tick(0);assert.equal(b.calls.filter(x=>x.route.startsWith('/poll?')).length,1);await b.tick(100);assert.equal(b.calls.filter(x=>x.route.startsWith('/poll?')).length,1);
 const list=Array.from({length:32},(_,i)=>({id:'m_'+i,seq:i+1,peerId:'peer_one',displayName:'小云',text:'消息'+i,at:i}));b.server.releasePoll({revision:2,peers:b.server.peers,messages:list});await idle();assert.equal(b.G.live.status().messages.length,32);await b.tick(25);b.server.releasePoll({revision:3,peers:b.server.peers,messages:[list[31],{id:'last',seq:33,peerId:'peer_one',displayName:'小云',text:'最后',at:33}]});await idle();const messages=b.G.live.status().messages;assert.equal(messages.length,32);assert.equal(messages[0].seq,2);assert.equal(messages.at(-1).text,'最后');await b.G.live.leave();b.G.live.destroy();
});
test('离开取消旧加入，迟到结果不能把人带回原房间',async()=>{
 let release;const b=sandbox({handle(call,server,response){if(call.route==='/join')return new Promise(resolve=>{release=()=>resolve(response(200,{peerId:'old_peer',revision:1,peers:server.peers,messages:[]}));});}});const joining=b.G.live.join(house,'小云');await idle();assert.equal(typeof release,'function');await b.G.live.leave();release();assert.equal((await joining).ok,false);assert.equal(b.G.live.status().phase,'left');assert.equal(b.G.live.status().peerId,null);b.G.live.destroy();
});
test('被替换或请离返回409后停止，不自动重新加入',async()=>{
 const b=sandbox();await b.G.live.join(house,'小云');b.server.pollError=409;await b.tick(0);assert.equal(b.G.live.status().phase,'error');assert.equal(b.G.live.status().peerId,null);const n=b.calls.length;await b.tick(20000);assert.equal(b.calls.length,n);assert.equal(b.calls.filter(x=>x.route==='/join').length,1);b.G.live.destroy();
 // 被屋主禁止进入只是本屋权限变化；真正401会话失效才清登录状态。
 for(const code of[403,401]){const s=sandbox({handle(call,server,response){if(call.route==='/join')return response(code,{code:code===403?'LIVE_FORBIDDEN':'LIVE_AUTH_REQUIRED',message:'这次暂时不能加入。'});}});assert.equal((await s.G.live.join(house,'小云')).ok,false);assert.equal(s.G.live.status().authenticated,code===403);assert.equal(s.G.live.status().phase,'error');s.G.live.destroy();const p=sandbox();await p.G.live.join(house,'小云');p.server.pollError=code;await p.tick(0);assert.equal(p.G.live.status().authenticated,code===403);assert.equal(p.G.live.status().peerId,null);p.G.live.destroy();}
});
test('网络恢复只重试轮询，不重复聊天；错误保留草稿由UI处理',async()=>{
 let fail=false;const b=sandbox({handle(call){if(fail&&call.route.startsWith('/poll?'))throw new Error('network');if(call.route==='/chat')throw new Error('network');}});await b.G.live.join(house,'小云');assert.equal((await b.G.live.chat('你好')).ok,false);assert.equal(b.calls.filter(x=>x.route==='/chat').length,1);
 fail=true;await b.tick(0);assert.equal(b.G.live.status().phase,'reconnecting');await b.tick(1000);assert.equal(b.calls.filter(x=>x.route==='/chat').length,1);fail=false;b.server.holdPoll=false;await b.tick(2000);assert.equal(b.G.live.status().phase,'connected');await b.G.live.leave();b.G.live.destroy();
});
test('后台取消轮询，返回验证旧peer；失效不偷偷重加',async()=>{
 const b=sandbox();await b.G.live.join(house,'小云');await b.tick(0);await b.hide(true);const n=b.calls.length;await b.tick(20000);assert.equal(b.calls.length,n);b.server.pollError=409;await b.hide(false);await b.tick(0);assert.equal(b.G.live.status().phase,'error');assert.equal(b.calls.filter(x=>x.route==='/join').length,1);b.G.live.destroy();
});
test('请离仅屋主可发，leave绑定旧peer，关闭后释放监听和后续动作',async()=>{
 const b=sandbox();b.server.peers.push({...b.server.peer,id:'peer_two',isHost:false});await b.G.live.join(house,'小云');assert.equal((await b.G.live.kick('peer_one')).ok,false);assert.equal((await b.G.live.kick('peer_two')).ok,true);const kick=b.calls.find(x=>x.route==='/kick');assert.equal(kick.request.headers['X-MC-Peer'],'peer_one');assert.deepEqual(kick.body,{houseId:house,peerId:'peer_two'});
 await b.pagehide();const leave=b.calls.find(x=>x.route==='/leave');assert.equal(leave.request.keepalive,true);assert.equal(leave.request.headers['X-MC-Peer'],'peer_one');b.G.live.destroy();assert.equal((b.windowListeners.pagehide||[]).length,0);assert.equal((b.documentListeners.visibilitychange||[]).length,0);assert.equal((await b.G.live.join(otherHouse,'小云')).ok,false);
});
test('快捷串门重新确认当前身份，公开称呼和凭据来自同一次握手',async()=>{
 let meCalls=0;const b=sandbox({handle(call,server,response){if(call.route==='/me'){const changed=++meCalls>1;return response(200,{authenticated:true,liveKey:changed?'new_public_key':'old_public_key',csrfToken:changed?'new_csrf':'old_csrf',joinDisplayName:changed?'新孩子公开称呼':'前一孩子公开称呼'});}}});
 await b.G.live.probe();assert.equal((await b.G.live.quickJoin(house)).ok,true);const join=b.calls.find(c=>c.route==='/join');assert.equal(meCalls,2);assert.equal(join.body.displayName,'新孩子公开称呼');assert.equal(join.request.headers['X-MC-Live'],'new_public_key');assert.equal(join.request.headers['X-CSRF-Token'],'new_csrf');assert.ok(!JSON.stringify(join).includes('前一孩子'));assert.ok(!JSON.stringify(b.G.live.status()).includes('new_csrf'));await b.G.live.leave();b.G.live.destroy();
});
test('快捷称呼只接受合法公开文字，未知或非法资料回退通用昵称',async()=>{
 for(const value of[undefined,null,{username:'private_account'},'', '字'.repeat(25),'换\n行','\u202e倒序','\u0085隐藏']){
  const b=sandbox({handle(call,server,response){if(call.route==='/me')return response(200,{authenticated:true,liveKey:'private_key',csrfToken:'private_csrf',joinDisplayName:value});}});assert.equal((await b.G.live.quickJoin(house)).ok,true);assert.equal(b.calls.find(c=>c.route==='/join').body.displayName,'小小建筑师');await b.G.live.leave();b.G.live.destroy();
 }
 const b=sandbox({handle(call,server,response){if(call.route==='/me')return response(200,{authenticated:true,liveKey:'private_key',csrfToken:'private_csrf',joinDisplayName:'  e\u0301小朋友  '});}});await b.G.live.quickJoin(house);assert.equal(b.calls.find(c=>c.route==='/join').body.displayName,'é小朋友');await b.G.live.leave();await b.G.live.join(house,'自己填写的称呼');assert.equal(b.calls.filter(c=>c.route==='/join').at(-1).body.displayName,'自己填写的称呼');await b.G.live.leave();b.G.live.destroy();
});
test('游客、禁止或满员的快捷请求不自动重试，错误保留供主动处理',async()=>{
 const guest=sandbox();guest.server.auth=false;assert.equal((await guest.G.live.quickJoin(house)).ok,false);assert.equal(guest.calls.filter(c=>c.route==='/join').length,0);guest.G.live.destroy();
 for(const code of[403,429,503]){const b=sandbox({handle(call,server,response){if(call.route==='/join')return response(code,{code:code===403?'LIVE_FORBIDDEN':'LIVE_ROOM_FULL',message:'请稍后主动选择小屋。'});}});assert.equal((await b.G.live.quickJoin(house)).ok,false);assert.equal(b.G.live.status().authenticated,true);assert.equal(b.G.live.status().peerId,null);await b.tick(20000);assert.equal(b.calls.filter(c=>c.route==='/join').length,1);b.G.live.destroy();}
 const file=sandbox({file:true});assert.equal((await file.G.live.quickJoin(house)).ok,false);assert.equal(file.calls.length,0);file.G.live.destroy();
});
test('离开或销毁取消尚未完成的快捷身份探测，不会迟到加入',async()=>{
 const hidden=sandbox();await hidden.hide(true);assert.equal((await hidden.G.live.quickJoin(house)).ok,false);assert.equal(hidden.calls.length,0);hidden.G.live.destroy();
 let complete;const paused=sandbox({handle(call,server,response){if(call.route==='/me')return new Promise(resolve=>{complete=()=>resolve(response(200,{authenticated:true,liveKey:'visible_key',csrfToken:'visible_csrf',joinDisplayName:'可见页小朋友'}));});}});const waiting=paused.G.live.quickJoin(house);await idle();await paused.hide(true);complete();assert.equal((await waiting).ok,false);assert.equal(paused.G.live.status().authenticated,true);assert.equal(paused.G.live.status().phase,'idle');assert.equal(paused.calls.filter(c=>c.route==='/join').length,0);await paused.hide(false);await paused.tick(20000);assert.equal(paused.calls.filter(c=>c.route==='/join').length,0);paused.G.live.destroy();
 for(const destroy of[false,true]){let release;const b=sandbox({handle(call,server,response){if(call.route==='/me')return new Promise(resolve=>{release=()=>resolve(response(200,{authenticated:true,liveKey:'late_key',csrfToken:'late_csrf',joinDisplayName:'迟到的小朋友'}));});}});const pending=b.G.live.quickJoin(house);await idle();assert.equal(typeof release,'function');if(destroy)b.G.live.destroy();else await b.G.live.leave();release();assert.equal((await pending).ok,false);assert.equal(b.calls.filter(c=>c.route==='/join').length,0);assert.equal(b.G.live.status().peerId,null);b.G.live.destroy();}
});
(async()=>{for(const{name,fn}of tests){await fn();console.log('✓ '+name);}console.log(tests.length+' 组实时客户端会话、动作与存档隔离检查通过（无监听）。');})().catch(error=>{console.error(error);process.exitCode=1;});
