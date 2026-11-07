'use strict';
// 真实串门组件的轻DOM检查；不发网络、不启动浏览器或游戏规则。
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
 const live={status:()=>plain(state),subscribe(fn){listeners.push(fn);return()=>{const i=listeners.indexOf(fn);if(i>=0)listeners.splice(i,1);};},async probe(){calls.push({name:'probe'});if(handlers.probe)return handlers.probe();emit();return{ok:true};},async join(houseId,displayName){calls.push({name:'join',houseId,displayName});if(handlers.join)return handlers.join(houseId,displayName);state={...state,phase:'connected',authenticated:true,houseId,peerId:'one',revision:1,peers:[{id:'one',displayName,avatar:{},isHost:true,zone:'yard',x:.5,y:.5,updatedAt:1}]};emit();return{ok:true};},async chat(text){calls.push({name:'chat',text});return handlers.chat?handlers.chat(text):{ok:true};},async kick(peerId){calls.push({name:'kick',peerId});return handlers.kick?handlers.kick(peerId):{ok:true};},async leave(keepalive){calls.push({name:'leave',keepalive});state={...state,phase:'left',peerId:null,houseId:null,peers:[],messages:[]};emit();return{ok:true};},destroy(){throw new Error('组件卸载不能永久关闭BFCache复用的客户端');}};
 live.quickJoin=async function(houseId){calls.push({name:'quickJoin',houseId});if(handlers.quickJoin)return handlers.quickJoin(houseId);state={...state,phase:'connected',authenticated:true,houseId,peerId:'one',revision:1,peers:[{id:'one',displayName:'公开小云',avatar:{},isHost:false,zone:'yard',x:.5,y:.5,updatedAt:1}]};emit();return{ok:true};};
 live.knock=async function(houseId){calls.push({name:'knock',houseId});return handlers.knock?handlers.knock(houseId):{ok:false,status:'declined',message:'主人现在不方便，过一会儿再来看看吧。'};};live.cancelKnock=function(){calls.push({name:'cancelKnock'});};
 const G={live,ui:{},store:{update(){throw new Error('聊天不能写存档');}},cloud:{prepare(){throw new Error('不能启动私档同步');}}};
 const context=vm.createContext({window:{Game:G},document,console,Map,Set,Promise});vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/ui/live-room.js'),'utf8'),context,{filename:'js/ui/live-room.js'});
 const widget=G.ui.liveRoom.mount(container,{houseId:house,onState:s=>states.push(plain(s)),onMove:dir=>moves.push(dir),quickJoin:options.quickJoin===true,onKnockResult:options.onKnockResult});
 const all=()=>descendants(body),hidden=n=>!n||n.hidden||n.parentElement&&hidden(n.parentElement);
 function control(label){const node=all().find(n=>n.tagName==='BUTTON'&&n.textContent===label&&!hidden(n));assert.ok(node,label);return node;}
 function field(name){const node=all().find(n=>n.tagName==='INPUT'&&n.name===name);assert.ok(node,name);return node;}
 return{G,widget,all,calls,states,moves,handlers,document,control,field,hidden,root:()=>container.children[0],state:()=>state,change(change){state={...state,...change};emit();},submit:kind=>all().find(n=>n.tagName==='FORM'&&n.classList.contains(kind==='chat'?'live-chat-form':'live-join-form')).fire('submit'),count:name=>calls.filter(c=>c.name===name).length};
}
const joined={phase:'connected',authenticated:true,houseId:house,peerId:'one',revision:1,peers:[{id:'one',displayName:'小云',isHost:true,avatar:{},zone:'yard',x:.5,y:.5,updatedAt:1},{id:'two',displayName:'小兔',isHost:false,avatar:{},zone:'yard',x:.3,y:.5,updatedAt:1}]};
test('游客仍可静态参观，组件只探测会话并给出同源登录入口',async()=>{
 const s=sandbox();await idle();assert.equal(s.count('probe'),1);assert.equal(s.count('join'),0);const link=s.all().find(n=>n.tagName==='A');assert.equal(link.href,'/play/');assert.match(link.textContent,/登录/);assert.ok(!s.hidden(link));assert.match(s.root().textContent,/现在也可以继续看看小屋/);s.widget.destroy();
});
test('昵称默认通用称呼，表单DOM与焦点在状态刷新后保持',async()=>{
 const s=sandbox({authenticated:true});await idle();const input=s.field('live-display-name'),root=s.root();assert.equal(input.value,'小小建筑师');assert.match(s.root().textContent,/尚未加入/);input.value='薄荷小朋友';input.focus();s.change({error:'稍后再试'});assert.equal(s.root(),root);assert.equal(s.field('live-display-name'),input);assert.equal(input.value,'薄荷小朋友');assert.equal(s.document.activeElement,input);s.widget.destroy();
});
test('昵称输入校验后才加入，成功透传房屋ID且状态回调不依赖主人UI',async()=>{
 const s=sandbox({authenticated:true});await idle();s.field('live-display-name').value='a\nb';await s.submit();assert.equal(s.count('join'),0);assert.equal(s.field('live-display-name').attributes['aria-invalid'],'true');s.field('live-display-name').value='小云';await s.submit();assert.equal(s.count('join'),1);assert.deepEqual(s.calls.find(c=>c.name==='join'),{name:'join',houseId:house,displayName:'小云'});assert.equal(s.states.at(-1).phase,'connected');assert.match(s.root().textContent,/1 \/ 8人/);s.widget.destroy();
});
test('方向按钮只传方向，由画面处理位置，不自行修改进度',async()=>{
 const s=sandbox(joined);await idle();for(const name of ['向左走','向前走','向后走','向右走'])await s.control(name).click();assert.deepEqual(s.moves,['left','up','down','right']);s.change({phase:'reconnecting',error:'正在恢复'});assert.equal(s.control('向左走').disabled,true);assert.equal(s.control('发送').disabled,true);s.widget.destroy();
});
test('消息和成员纯文字显示，屏蔽只隐藏该人的聊天并可恢复',async()=>{
 const s=sandbox({...joined,messages:[{id:'x',seq:1,peerId:'two',displayName:'<img>',text:'<script>你好</script>',at:1},{id:'y',seq:2,peerId:'one',displayName:'小云',text:'欢迎',at:2}]});await idle();const log=s.all().find(n=>n.attributes.role==='log');assert.match(log.textContent,/<script>你好<\/script>/);assert.equal(log.children.length,2);assert.equal(s.states.at(-1).messages.length,2);await s.control('屏蔽聊天').click();assert.doesNotMatch(log.textContent,/<script>/);assert.match(log.textContent,/欢迎/);assert.equal(s.state().peers.length,2);assert.deepEqual(s.states.at(-1).messages.map(m=>m.peerId),['one'],'屏蔽同步过滤传给画面的气泡消息');await s.control('恢复聊天').click();assert.match(log.textContent,/<script>/);assert.equal(log.children[0].children[1].textContent,'<script>你好</script>');assert.equal(s.states.at(-1).messages.length,2);s.widget.destroy();
});
test('聊天发送失败保留草稿，成功才清空；不自动重发',async()=>{
 const s=sandbox(joined);await idle();const input=s.field('live-message');input.value='给你看看新家具';s.handlers.chat=()=>({ok:false,message:'暂时断线，请重试。'});await s.submit('chat');assert.equal(input.value,'给你看看新家具');assert.equal(s.count('chat'),1);assert.match(s.root().textContent,/暂时断线/);s.change({revision:2});assert.equal(s.count('chat'),1);s.handlers.chat=()=>({ok:true});await s.submit('chat');assert.equal(input.value,'');assert.equal(s.count('chat'),2);assert.match(s.root().textContent,/消息已发出/);s.change({phase:'error',peerId:null,houseId:null,peers:[],error:'屋主请你先离开。'});assert.doesNotMatch(s.root().textContent,/消息已发出/);assert.match(s.root().textContent,/尚未加入/);assert.ok(s.control('加入串门'));s.handlers.join=()=>{s.change({phase:'error',error:'这次暂时不能加入。'});return{ok:false,message:'这次暂时不能加入。'};};await s.submit();const feedback=s.all().find(n=>n.classList.contains('live-room-feedback'));assert.equal(feedback.hidden,true);assert.equal(feedback.textContent,'');assert.match(s.root().textContent,/这次暂时不能加入/);s.widget.destroy();
});
test('空白/超长/换行消息不发送，快捷短句走同一发送入口',async()=>{
 const s=sandbox(joined);await idle();const input=s.field('live-message');for(const value of [' ','字'.repeat(81),'你好\n朋友']){input.value=value;await s.submit('chat');}assert.equal(s.count('chat'),0);await s.control('你好呀！').click();assert.deepEqual(s.calls.find(c=>c.name==='chat'),{name:'chat',text:'你好呀！'});s.widget.destroy();
});
test('屋主请离先明确确认，成员位置刷新不重建操作按钮',async()=>{
 const s=sandbox(joined);await idle();const button=s.control('请离');s.change({peers:joined.peers.map(p=>({...p,x:.8,updatedAt:10}))});assert.equal(s.control('请离'),button);await button.click();assert.equal(s.count('kick'),0);await s.control('确认请离').click();assert.equal(s.count('kick'),1);assert.equal(s.calls.find(c=>c.name==='kick').peerId,'two');s.widget.destroy();
});
test('普通成员无请离入口，离开保留参观并恢复主动加入',async()=>{
 const s=sandbox({...joined,peerId:'two'});await idle();assert.equal(s.all().filter(n=>n.tagName==='BUTTON'&&n.textContent==='请离'&&!s.hidden(n)).length,0);await s.control('结束这次串门').click();assert.equal(s.count('leave'),1);assert.ok(s.control('加入串门'));assert.match(s.root().textContent,/串门已结束/);s.widget.destroy();
});
test('卸载取消迟到UI回调，离开而不永久销毁BFCache可复用客户端',async()=>{
 const s=sandbox({authenticated:true});await idle();let resolve;s.handlers.join=()=>new Promise(done=>{resolve=done;});const pending=s.submit();await idle();const before=s.states.length;s.widget.destroy();resolve({ok:true});await pending;assert.equal(s.root(),undefined);assert.equal(s.states.length,before);assert.equal(s.calls.at(-1).name,'leave');assert.equal(s.calls.at(-1).keepalive,true);
});
test('在线快捷入口只自动加入一次，退出或重新确认不重新执行意图',async()=>{
 const s=sandbox({authenticated:true},{quickJoin:true});await idle();assert.equal(s.count('quickJoin'),1);assert.equal(s.count('join'),0);assert.deepEqual(s.calls.find(c=>c.name==='quickJoin'),{name:'quickJoin',houseId:house});assert.equal(s.field('live-display-name').value,'公开小云');assert.match(s.root().textContent,/邻居列表和同屋/);s.change({revision:2});assert.equal(s.count('quickJoin'),1);
 await s.control('结束这次串门').click();await s.control('重新确认登录').click();assert.equal(s.count('quickJoin'),1);assert.equal(s.state().peerId,null);s.field('live-display-name').value='重新填写';await s.submit();assert.equal(s.count('join'),1);assert.equal(s.calls.find(c=>c.name==='join').displayName,'重新填写');s.widget.destroy();
});
test('游客和初始后台快捷页不保留以后执行的自动加入意图',async()=>{
 for(const hidden of[false,true]){const s=sandbox({authenticated:hidden},{quickJoin:true,hidden});await idle();assert.equal(s.count('quickJoin'),0);s.document.hidden=false;s.change({authenticated:true});await s.control('重新确认登录').click();assert.equal(s.count('quickJoin'),0);assert.equal(s.count('join'),0);assert.ok(!s.hidden(s.field('live-display-name')));s.widget.destroy();}
});
test('快捷加入被拒绝或探测失败时保留手动表单，状态刷新不循环重加',async()=>{
 for(const message of['小屋已经坐满啦。','主人请你换一座小屋。','连接暂时中断。']){const s=sandbox({authenticated:true},{quickJoin:true});s.handlers.quickJoin=async()=>{s.change({phase:'error',error:message});return{ok:false,message};};await idle();assert.equal(s.count('quickJoin'),1);assert.match(s.root().textContent,new RegExp(message));assert.ok(!s.hidden(s.field('live-display-name')));s.change({error:message});await s.control('重新确认登录').click();assert.equal(s.count('quickJoin'),1);s.widget.destroy();}
 const failed=sandbox({authenticated:true},{quickJoin:true,handlers:{async probe(){return{ok:false,message:'会话暂时没有确认好。'};}}});await idle();assert.equal(failed.count('quickJoin'),0);delete failed.handlers.probe;await failed.control('重新确认登录').click();assert.equal(failed.count('quickJoin'),0);failed.widget.destroy();
});
test('销毁中的快捷探测和加入结果都不能复活组件或再次发起请求',async()=>{
 let release;const pending=sandbox({authenticated:true},{quickJoin:true,handlers:{probe:()=>new Promise(resolve=>{release=()=>resolve({ok:true});})}});pending.widget.destroy();release();await idle();assert.equal(pending.count('quickJoin'),0);assert.equal(pending.root(),undefined);
 let finish;const s=sandbox({authenticated:true},{quickJoin:true});s.handlers.quickJoin=()=>new Promise(resolve=>{finish=()=>resolve({ok:true});});await idle();assert.equal(s.count('quickJoin'),1);const n=s.states.length;s.widget.destroy();finish();await idle();assert.equal(s.root(),undefined);assert.equal(s.states.length,n);assert.equal(s.calls.at(-1).name,'leave');
});
test('onKnockResult（可选）收到敲门结果：婉拒/取消带状态，同意后继续带凭证加入；回调出错不影响组件；不传也照常',async()=>{
 const results=[],knockRequired=()=>({ok:false,code:'LIVE_KNOCK_REQUIRED',message:'需要先敲门'});
 const declined=sandbox({authenticated:true},{quickJoin:true,onKnockResult:r=>results.push(r),handlers:{quickJoin:knockRequired}});await idle();await idle();
 assert.equal(declined.count('knock'),1);assert.equal(results.length,1);assert.equal(results[0].ok,false);assert.equal(results[0].status,'declined');assert.match(results[0].message,/不方便/);
 const cancelled=sandbox({authenticated:true},{quickJoin:true,onKnockResult:r=>results.push(r),handlers:{quickJoin:knockRequired,knock:()=>({ok:false,status:'cancelled',message:'已取消'})}});await idle();await idle();assert.equal(results.at(-1).status,'cancelled');
 let second=0;const approved=sandbox({authenticated:true},{quickJoin:true,onKnockResult:r=>results.push(r),handlers:{knock:()=>({ok:true,ticket:'t'.repeat(8)}),quickJoin:id=>{second++;return second===1?knockRequired():{ok:true};}}});await idle();await idle();
 assert.equal(results.at(-1).ok,true);assert.equal(approved.count('quickJoin'),2,'同意后带凭证再加入一次');
 const noisy=sandbox({authenticated:true},{quickJoin:true,onKnockResult:()=>{throw new Error('宿主回调失败');},handlers:{quickJoin:knockRequired}});await idle();await idle();assert.ok(noisy.root(),'回调抛错不会拆掉组件');
 const plainMount=sandbox({authenticated:true},{quickJoin:true,handlers:{quickJoin:knockRequired}});await idle();await idle();assert.equal(plainMount.count('knock'),1,'不传onKnockResult时行为不变');
});
(async()=>{for(const{name,fn}of tests){await fn();console.log('✓ '+name);}console.log(tests.length+' 组实时串门UI、聊天与稳定输入检查通过（无监听，未代替浏览器）。');})().catch(error=>{console.error(error);process.exitCode=1;});
