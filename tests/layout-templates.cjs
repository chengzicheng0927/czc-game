'use strict';
// 模板只排列已有房间，覆盖预览确认、旧档恢复和持久事务；不启动服务或浏览器。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const files = ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/furniture-expansion.js', 'js/data/residents-expansion.js', 'js/data/progression.js', 'js/data/achievements.js', 'js/data/minigames.js', 'js/data/garden.js', 'js/data/calendar.js', 'js/data/outfits.js', 'js/data/yard.js', 'js/data/exterior.js', 'js/data/creative.js', 'js/data/gifts.js', 'js/data/observatory.js', 'js/data/deals.js', 'js/data/login.js', 'js/data/layout-templates.js', 'js/core/utils.js', 'js/core/bus.js', 'js/core/store.js', 'js/core/save.js', 'js/systems/systems.js', 'js/systems/minigames.js', 'js/systems/garden.js', 'js/systems/time.js', 'js/systems/avatar.js', 'js/systems/resident-wishes.js', 'js/systems/quests.js', 'js/systems/creative.js', 'js/systems/room-layout.js', 'js/systems/layout-templates.js'];
function sandbox(saved) {
  let storageError = false, writes = 0; const storage = new Map(), context = vm.createContext({ console, Blob, URL, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, document: { addEventListener() {} } });
  context.window = context; context.addEventListener = () => {};
  context.localStorage = { getItem: key => storage.get(key) || null, setItem(key, value) { if (storageError) throw new Error('QuotaExceededError'); writes++; storage.set(key, value); } };
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  const G = context.Game, parse = value => vm.runInContext('JSON.parse(' + JSON.stringify(JSON.stringify(value)) + ')', context);
  G.store.init(saved ? parse(saved) : undefined); G.sys.init();
  return { G, parse, storage, writes: () => writes, writeFails(value) { storageError = value; } };
}
const plain = value => JSON.parse(JSON.stringify(value)), tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function ready(G, level = 17) { G.store.update(s => { s.level = level; s.exp = 0; s.wallet.coin = 50000; s.tutorial.done = true; s.tutorial.step = 10; }); }
function homes(G, count = 3, level = 17) {
  ready(G, level); const cap = G.sys.building.capacity(), ids = [];
  for (let index = 0; index < count; index++) { const result = G.sys.building.buildRoom(Math.floor(index / cap.slots), index % cap.slots, index === 1 ? 'kitchen' : 'bedroom'); assert.ok(result.ok, result.message); ids.push(result.roomId); }
  return ids;
}
function stablePositions(G) {
  const ids = Object.keys(G.state.house.rooms).sort(), cap = G.sys.building.capacity();
  G.store.update(s => { s.house.floors = Array.from({length:cap.floors},()=>({slots:[null,null,null]})); ids.forEach((id,index)=>{s.house.floors[Math.floor(index/cap.slots)].slots[index%cap.slots]=id;}); });
  return ids;
}
function apply(G, id) { const plan = G.sys.layoutTemplates.preview(id); assert.ok(plan.ok, plan.message); return G.sys.layoutTemplates.apply(id, plan.signature); }
function allButPositions(state) { const result = plain(state); result.house.floors = null; result.memories = null; return result; }
function stock(G, id, roomId, x, parent) { if (!(G.state.inventory[id] > 0)) assert.ok(G.sys.economy.buy(id).ok); const result = G.sys.decorating.place(id, roomId, x, 80, parent); assert.ok(result.ok, result.message); return result; }

test('四份模板稳定且列表/预览只读，空屋不生成或修改房间', () => {
  const env = sandbox(), { G } = env, before = JSON.stringify(G.state), writes = env.writes(), list = G.sys.layoutTemplates.list();
  assert.equal(list.length,4); assert.equal(new Set(list.map(d=>d.id)).size,4); assert.ok(list.every(d=>d.name && d.description && d.icon));
  list[0].name='篡改'; assert.notEqual(G.sys.layoutTemplates.list()[0].name,'篡改');
  for(const def of list) assert.equal(G.sys.layoutTemplates.preview(def.id).ok,false);
  assert.equal(JSON.stringify(G.state),before); assert.equal(env.writes(),writes);
});
test('所有开放容量按已有房间生成合法布局，不提前建造解锁或引入存档字段', () => {
  for (const [level,count] of [[1,2],[3,3],[6,6],[17,9],[25,12]]) {
    const { G }=sandbox();homes(G,count,level);const before=JSON.stringify(G.state),keys=Object.keys(G.state).sort(),houseKeys=Object.keys(G.state.house).sort();
    for(const def of G.sys.layoutTemplates.list()){
      const plan=G.sys.layoutTemplates.preview(def.id),ids=plan.floors.flatMap(f=>f.slots).filter(Boolean);assert.ok(plan.ok,plan.message);assert.equal(ids.length,count);assert.equal(new Set(ids).size,count);assert.equal(plan.roomCount,count);
      plan.floors.forEach((floor,f)=>floor.slots.forEach((id,s)=>{if(id)assert.ok(f<plan.capacity.floors&&s<plan.capacity.slots);}));
      plan.floors[0].slots[0]='fake';assert.equal(JSON.stringify(G.state),before);
    }
    assert.ok(apply(G,'mirror_rows').ok);assert.deepEqual(Object.keys(G.state).sort(),keys);assert.deepEqual(Object.keys(G.state.house).sort(),houseKeys);
  }
});
test('三间房在两层四种模板均有不同位置，重复选择同模板幂等', () => {
  const { G }=sandbox();homes(G,3,6);const signatures=new Set();
  for(const def of G.sys.layoutTemplates.list()){
    const plan=G.sys.layoutTemplates.preview(def.id);signatures.add(JSON.stringify(plan.floors));assert.ok(G.sys.layoutTemplates.apply(def.id,plan.signature).ok);
    const before=JSON.stringify(G.state),result=apply(G,def.id);assert.equal(result.unchanged,true);assert.equal(JSON.stringify(G.state),before);
  }
  assert.equal(signatures.size,4);
});
test('整屋确认只改房间引用与一条回忆，不改变经济/主线/收藏/前院/阁楼', () => {
  const env=sandbox(),{ G }=env;homes(G,5);stablePositions(G);G.store.update(s=>{s.house.attic={type:'observatory',paidPrice:1000,builtAt:0};});
  const before=allButPositions(G.state),memories=G.state.memories.length,writes=env.writes();let event;
  G.bus.on('house:layout-applied',value=>event=plain(value));const plan=G.sys.layoutTemplates.preview('mirror_rows'),result=G.sys.layoutTemplates.apply('mirror_rows',plan.signature);
  assert.ok(result.ok,result.message);assert.deepEqual(allButPositions(G.state),before);assert.equal(G.state.memories.length,memories+1);assert.equal(env.writes(),writes+1);assert.equal(event.templateId,'mirror_rows');assert.equal(event.moves.length,plan.moves.length);
  assert.deepEqual(JSON.parse(env.storage.get(G.data.balance.saveKey)).house.floors,plain(plan.floors));
});
test('家具父子/自制挂画墙纸/深度颜色与入住朋友全部跟随原房间身份', () => {
  const { G }=sandbox(),[a]=homes(G,3);const studio=G.sys.building.buildRoom(1,0,'studio');assert.ok(studio.ok);
  stock(G,'bed_basic',a,25);const table=stock(G,'nightstand_basic',a,180);stock(G,'desk_lamp_basic',a,185,table.uid);assert.ok(G.sys.decorating.move(a,table.uid,a,170,120,null,.2).ok);assert.ok(G.sys.decorating.flip(a,table.uid).ok);assert.ok(G.sys.decorating.recolor(a,table.uid,'#FFB6C8').ok);
  const art=G.sys.creative.save({name:'搬家时带着的画',pixels:'0'.repeat(256)});assert.ok(art.ok,art.message);assert.ok(G.sys.creative.place(art.art.id,a,24,20).ok);assert.ok(G.sys.creative.wallpaper(a,art.art.id).ok);assert.ok(G.sys.residents.invite('lily',a).ok);
  const before=allButPositions(G.state),rooms=JSON.stringify(G.state.house.rooms),resident=JSON.stringify(G.state.residents.lily);
  assert.ok(apply(G,'cloud_steps').ok);assert.deepEqual(allButPositions(G.state),before);assert.equal(JSON.stringify(G.state.house.rooms),rooms);assert.equal(JSON.stringify(G.state.residents.lily),resident);assert.equal(G.state.residents.lily.roomId,a);
});
test('只有预览过的同一份模板可确认，非法ID和缺失/伪造确认凭据保持原样', () => {
  const { G }=sandbox();homes(G);const plan=G.sys.layoutTemplates.preview('mirror_rows'),before=JSON.stringify(G.state);
  for(const id of ['missing','__proto__','constructor','toString',null,{},[]]){assert.equal(G.sys.layoutTemplates.preview(id).ok,false);assert.equal(G.sys.layoutTemplates.apply(id,plan.signature).ok,false);}
  for(const signature of [undefined,null,'',{},[],true,'fake'])assert.equal(G.sys.layoutTemplates.apply('mirror_rows',signature).ok,false);
  assert.equal(G.sys.layoutTemplates.apply('cloud_steps',plan.signature).ok,false);assert.equal(JSON.stringify(G.state),before);
});
test('预览后增房/换位/改房型/开放容量变化都拒绝过期布局，不搬动新状态', () => {
  for(const mutate of [G=>{assert.ok(G.sys.building.buildRoom(1,0,'bedroom').ok);},G=>{const id=Object.keys(G.state.house.rooms)[0];assert.ok(G.sys.building.swapRooms(id,1,2,null).ok);},G=>{const id=Object.keys(G.state.house.rooms)[0];assert.ok(G.sys.building.changeRoomType(id,'kitchen').ok);},G=>G.store.update(s=>{s.level=25;})]){
    const { G }=sandbox();homes(G);const plan=G.sys.layoutTemplates.preview('mirror_rows');mutate(G);const before=JSON.stringify(G.state);assert.equal(G.sys.layoutTemplates.apply('mirror_rows',plan.signature).ok,false);assert.equal(JSON.stringify(G.state),before);
  }
});
test('预览之后新增家具仍原样随房保存，预览副本篡改不会覆盖内容或目标格', () => {
  const { G }=sandbox(),[a]=homes(G);stablePositions(G);const plan=G.sys.layoutTemplates.preview('mirror_rows'),expected=plain(plan.floors);plan.floors[0].slots[0]='fake';plan.moves=[];plan.before=[];
  stock(G,'bed_basic',a,25);const rooms=JSON.stringify(G.state.house.rooms);assert.ok(G.sys.layoutTemplates.apply('mirror_rows',plan.signature).ok);assert.equal(JSON.stringify(G.state.house.rooms),rooms);assert.deepEqual(plain(G.state.house.floors),expected);
});
test('真实拒写和容量验证失败保留内存/磁盘/运行期，成功才发事件并清理选择', () => {
  const env=sandbox(),{ G }=env,[a,b]=homes(G);stablePositions(G);G.runtime.activeRoomId=a;G.runtime.selected={roomId:a,uid:'held'};G.runtime.placing='bed_basic';assert.ok(G.save.flush());
  const before=JSON.stringify(G.state),runtime=JSON.stringify(G.runtime),disk=env.storage.get(G.data.balance.saveKey);let events=0;G.bus.on('house:layout-applied',()=>events++);
  env.writeFails(true);assert.equal(apply(G,'mirror_rows').ok,false);env.writeFails(false);assert.equal(JSON.stringify(G.state),before);assert.equal(JSON.stringify(G.runtime),runtime);assert.equal(env.storage.get(G.data.balance.saveKey),disk);assert.equal(events,0);
  const max=G.data.balance.maxSaveBytes;G.data.balance.maxSaveBytes=1;try{assert.equal(apply(G,'mirror_rows').ok,false);assert.equal(JSON.stringify(G.state),before);assert.equal(JSON.stringify(G.runtime),runtime);assert.equal(env.storage.get(G.data.balance.saveKey),disk);}finally{G.data.balance.maxSaveBytes=max;}
  assert.ok(apply(G,'mirror_rows').ok);assert.equal(events,1);assert.equal(G.runtime.activeRoomId,a);assert.equal(G.runtime.selected,null);assert.equal(G.runtime.placing,null);assert.ok(G.state.house.rooms[b]);
});
test('同布局无保存/无事件/无回忆，也不打断孩子的当前选择', () => {
  const env=sandbox(),{ G }=env,[a]=homes(G);stablePositions(G);G.runtime.activeRoomId=a;G.runtime.selected={roomId:a,uid:'held'};G.runtime.placing='bed_basic';const before=JSON.stringify(G.state),runtime=JSON.stringify(G.runtime),writes=env.writes();let events=0;G.bus.on('house:layout-applied',()=>events++);env.writeFails(true);
  const result=apply(G,'together_rows');assert.ok(result.ok);assert.equal(result.unchanged,true);assert.equal(JSON.stringify(G.state),before);assert.equal(JSON.stringify(G.runtime),runtime);assert.equal(env.writes(),writes);assert.equal(events,0);
});
test('状态和成功事件同步重入不会重复搬家、写盘或追加回忆', () => {
  const env=sandbox(),{ G }=env;homes(G);stablePositions(G);const plan=G.sys.layoutTemplates.preview('mirror_rows'),memories=G.state.memories.length,writes=env.writes();let nestedState,nestedEvent,armed=true,events=0;
  G.bus.on('state:change',()=>{if(armed){armed=false;nestedState=apply(G,'cloud_steps');}});G.bus.on('house:layout-applied',()=>{events++;nestedEvent=apply(G,'cloud_steps');});
  assert.ok(G.sys.layoutTemplates.apply('mirror_rows',plan.signature).ok);assert.equal(nestedState.ok,false);assert.equal(nestedEvent.ok,false);assert.equal(events,1);assert.equal(env.writes(),writes+1);assert.equal(G.state.memories.length,memories+1);
});
test('失败保留装饰撤销，成功后清除旧撤销，防止跨布局误用', () => {
  const env=sandbox(),{ G }=env,[a]=homes(G);stablePositions(G);stock(G,'bed_basic',a,20);env.writeFails(true);assert.equal(apply(G,'mirror_rows').ok,false);env.writeFails(false);assert.ok(G.sys.decorating.undo().ok);assert.equal(G.state.house.rooms[a].items.length,0);
  stock(G,'bed_basic',a,25);assert.ok(apply(G,'mirror_rows').ok);assert.equal(G.sys.decorating.undo().ok,false);assert.equal(G.state.house.rooms[a].items.length,1);
});
test('旧档无需模板迁移，JSON刷新/导入与MD保留真实外观位置和居民', async () => {
  const env=sandbox(),{ G }=env,[a]=homes(G);stock(G,'bed_basic',a,25);assert.ok(G.sys.residents.invite('lily',a).ok);
  G.store.update(s=>{Object.assign(s.house.exterior,{roof:'roof_round',wall:'wall_brick',window:'win_arch',door:'door_arch',chimney:'none',roofColor:'#A7C4D3',wallColor:'#F3F2DE'});['roof_round','wall_brick','win_arch','door_arch'].forEach(id=>{s.house.exterior.owned[id]=true;});});
  assert.ok(apply(G,'cloud_steps').ok);const saved=plain(G.state),loaded=sandbox(saved);
  assert.deepEqual(plain(loaded.G.state.house.floors),saved.house.floors);assert.equal(loaded.G.state.residents.lily.roomId,a);assert.ok(loaded.G.sys.layoutTemplates.preview('cloud_steps').unchanged);
  assert.ok(apply(G,'mirror_rows').ok);const imported=await G.save.importFile({text:async()=>JSON.stringify(saved)});assert.ok(imported.ok,imported.message);assert.deepEqual(plain(G.state.house.floors),saved.house.floors);
  let download;G.utils.download=(name,text)=>download={name,text};const memory=G.save.exportMemory();const position=G.sys.building.roomPosition(a);assert.ok(memory.includes((position.floorIdx+1)+' 楼 · 第 '+(position.slotIdx+1)+' 间 卧室'));assert.ok(memory.includes('原木小床'));assert.equal(download.text,memory);
  for(const text of ['当前风格：自由搭配','屋顶：圆弧软糖顶','外墙：团圆小砖墙','窗户：圆拱小窗','小门：软软圆拱门','烟囱：清爽无烟囱','屋顶配色：\\#A7C4D3','外墙配色：\\#F3F2DE'])assert.ok(memory.includes(text),text);
  const definitions=G.data.exteriorById;delete G.data.exteriorById;const fallback=G.save.exportMemory();assert.ok(fallback.includes('屋顶：roof\\_round'));assert.ok(fallback.includes('烟囱：none'));assert.ok(fallback.includes('屋顶配色：\\#A7C4D3'));G.data.exteriorById=definitions;
});
test('满十二房仍无损重排，回忆容量仅裁最旧，锁定位置的异常档不被重写', () => {
  const { G }=sandbox();homes(G,12,30);stablePositions(G);G.store.update(s=>{s.memories=Array.from({length:G.data.balance.maxMemories},(_,index)=>({at:index,text:'旧回忆'+index}));});const rooms=JSON.stringify(G.state.house.rooms);assert.ok(apply(G,'mirror_rows').ok);assert.equal(JSON.stringify(G.state.house.rooms),rooms);assert.equal(G.state.memories.length,G.data.balance.maxMemories);assert.equal(G.state.memories[0].text,'旧回忆1');assert.ok(G.state.memories.at(-1).text.includes('镜像横排'));
  G.store.update(s=>{s.level=1;s.garden.plots=Array(G.data.gardenConfig.basePlots).fill(null);});const before=JSON.stringify(G.state);assert.equal(G.sys.layoutTemplates.preview('together_rows').ok,false);assert.equal(JSON.stringify(G.state),before);
});
(async()=>{for(const entry of tests){await entry.fn();console.log('✓ '+entry.name);}console.log('\n'+tests.length+' 组布局模板与持久事务检查通过（规则环境，不代替实际界面验收）。');})().catch(error=>{console.error(error);process.exitCode=1;});
