'use strict';
// 房间引用互换、真实保存拒写与恢复检查；仅使用规则环境，不启动服务或浏览器。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const files = ['js/core/namespace.js', 'js/data/balance.js', 'js/data/content.js', 'js/data/furniture-expansion.js', 'js/data/residents-expansion.js', 'js/data/progression.js', 'js/data/achievements.js', 'js/data/minigames.js', 'js/data/garden.js', 'js/data/calendar.js', 'js/data/outfits.js', 'js/data/yard.js', 'js/data/exterior.js', 'js/data/creative.js', 'js/data/gifts.js', 'js/data/observatory.js', 'js/data/deals.js', 'js/data/login.js', 'js/core/utils.js', 'js/core/bus.js', 'js/core/store.js', 'js/core/save.js', 'js/systems/systems.js', 'js/systems/minigames.js', 'js/systems/garden.js', 'js/systems/time.js', 'js/systems/avatar.js', 'js/systems/resident-wishes.js', 'js/systems/quests.js', 'js/systems/creative.js', 'js/systems/room-layout.js'];
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
function homes(G) { ready(G); const a = G.sys.building.buildRoom(0, 0, 'bedroom'), b = G.sys.building.buildRoom(0, 1, 'kitchen'); assert.ok(a.ok, a.message); assert.ok(b.ok, b.message); return { a: a.roomId, b: b.roomId }; }
function everythingExceptPositionsAndMemory(state) { const value = plain(state); value.house.floors = null; value.memories = null; return value; }
function stock(G, id, roomId, x, parent) { if (!(G.state.inventory[id] > 0)) assert.ok(G.sys.economy.buy(id).ok); const result = G.sys.decorating.place(id, roomId, x, 80, parent); assert.ok(result.ok, result.message); return result; }

test('已开放格与房间定位是只读副本，等级2/3/6/9/12格准确', () => {
  for (const [level, count] of [[1,2],[3,3],[6,6],[17,9],[25,12]]) { const { G } = sandbox(); ready(G, level); const before = JSON.stringify(G.state), list = G.sys.building.layoutSlots(); assert.equal(list.length, count); assert.ok(list.every(slot => slot.roomId === null && slot.locked === false)); list[0].roomId = 'fake'; assert.equal(G.sys.building.layoutSlots()[0].roomId, null); assert.equal(G.sys.building.roomPosition('missing'), null); assert.equal(JSON.stringify(G.state), before); }
  const { G } = sandbox(), { a } = homes(G), position = G.sys.building.roomPosition(a); assert.deepEqual(plain(position), { floorIdx:0,slotIdx:0 }); position.floorIdx = 9; assert.equal(G.sys.building.roomPosition(a).floorIdx, 0);
});
test('同层两间互换只改引用，不改变房间或经济、收藏和统计', () => {
  const { G, storage } = sandbox(), { a, b } = homes(G), before = everythingExceptPositionsAndMemory(G.state), memories = G.state.memories.length; let event;
  G.bus.on('room:swapped', value => event = plain(value)); const result = G.sys.building.swapRooms(a,0,1,b); assert.ok(result.ok, result.message);
  assert.equal(G.state.house.floors[0].slots[0], b); assert.equal(G.state.house.floors[0].slots[1], a); assert.deepEqual(everythingExceptPositionsAndMemory(G.state), before); assert.equal(G.state.memories.length, memories + 1);
  assert.deepEqual(event, { roomId:a,otherRoomId:b,from:{floorIdx:0,slotIdx:0},to:{floorIdx:0,slotIdx:1} }); assert.deepEqual(plain(result.from), event.from); assert.equal(JSON.parse(storage.get(G.data.balance.saveKey)).house.floors[0].slots[1], a);
});
test('跨楼移入空格并补齐已解锁楼层，随后可与另一间房交换', () => {
  const { G } = sandbox(), { a, b } = homes(G), rooms = JSON.stringify(G.state.house.rooms);
  // 模拟旧档已解锁等级但尚未访问高层，实际房间仍全部在首层。
  G.store.update(state => state.house.floors = state.house.floors.slice(0, 1));
  assert.equal(G.state.house.floors.length, 1); let result = G.sys.building.swapRooms(a,2,2,null); assert.ok(result.ok, result.message); assert.equal(result.otherRoomId, null); assert.equal(G.state.house.floors.length, 3); assert.equal(G.state.house.floors[0].slots[0], null); assert.equal(G.state.house.floors[2].slots[2], a);
  result = G.sys.building.swapRooms(b,2,2,a); assert.ok(result.ok, result.message); assert.equal(G.state.house.floors[0].slots[1], a); assert.equal(G.state.house.floors[2].slots[2], b); assert.equal(JSON.stringify(G.state.house.rooms), rooms);
});
test('十二个普通房间满格时仍可互换，阁楼原位保留', () => {
  const { G } = sandbox(); ready(G,30); const ids=[]; for (let floor=0;floor<4;floor++) for(let slot=0;slot<3;slot++) { const result=G.sys.building.buildRoom(floor,slot,'bedroom');assert.ok(result.ok,result.message);ids.push(result.roomId); }
  G.store.update(state=>state.house.attic={type:'observatory',paidPrice:1000,builtAt:0}); const attic=JSON.stringify(G.state.house.attic), rooms=JSON.stringify(G.state.house.rooms), stats=JSON.stringify(G.state.quests.stats);
  assert.ok(G.sys.building.swapRooms(ids[0],3,2,ids[11]).ok); assert.equal(G.state.house.floors[0].slots[0],ids[11]);assert.equal(G.state.house.floors[3].slots[2],ids[0]);assert.equal(Object.keys(G.state.house.rooms).length,12);assert.equal(JSON.stringify(G.state.house.attic),attic);assert.equal(JSON.stringify(G.state.house.rooms),rooms);assert.equal(JSON.stringify(G.state.quests.stats),stats);
});
test('家具台面父子、深度翻转颜色、墙纸画作与居民身份全部跟随房间', () => {
  const { G }=sandbox(), { a,b }=homes(G); const studio=G.sys.building.buildRoom(0,2,'studio');assert.ok(studio.ok);
  stock(G,'bed_basic',a,30); const table=stock(G,'nightstand_basic',a,180); stock(G,'desk_lamp_basic',a,185,table.uid); assert.ok(G.sys.decorating.move(a,table.uid,a,170,120,null,.2).ok);assert.ok(G.sys.decorating.flip(a,table.uid).ok);assert.ok(G.sys.decorating.recolor(a,table.uid,'#FFB6C8').ok);
  const art=G.sys.creative.save({name:'软糖搬家画',pixels:'0'.repeat(256)});assert.ok(art.ok,art.message);assert.ok(G.sys.creative.place(art.art.id,a,24,20).ok);assert.ok(G.sys.creative.wallpaper(a,art.art.id).ok);assert.ok(G.sys.residents.invite('lily',a).ok);
  const before=everythingExceptPositionsAndMemory(G.state), roomBefore=JSON.stringify(G.state.house.rooms[a]), residentBefore=JSON.stringify(G.state.residents.lily);assert.ok(G.sys.building.swapRooms(a,0,1,b).ok);
  assert.equal(JSON.stringify(G.state.house.rooms[a]),roomBefore);assert.equal(JSON.stringify(G.state.residents.lily),residentBefore);assert.equal(G.state.residents.lily.roomId,a);assert.equal(G.state.house.rooms[a].wallpaper.artId,art.art.id);assert.deepEqual(everythingExceptPositionsAndMemory(G.state),before);
});
test('同位置为无保存无事件无回忆操作，也不清理已有选择', () => {
  const env=sandbox(), { G }=env, { a }=homes(G);G.runtime.activeRoomId='old';G.runtime.selected={roomId:a,uid:'held'};G.runtime.placing='bed_basic';const runtime=plain(G.runtime),before=JSON.stringify(G.state),writes=env.writes();let events=0;G.bus.on('room:swapped',()=>events++);env.writeFails(true);
  const result=G.sys.building.swapRooms(a,0,0,a);assert.equal(result.ok,true);assert.equal(result.unchanged,true);assert.equal(events,0);assert.equal(env.writes(),writes);assert.equal(JSON.stringify(G.state),before);assert.deepEqual(plain(G.runtime),runtime);
});
test('源ID、整数坐标、阁楼和未开放位置边界均拒绝且不改状态', () => {
  const { G }=sandbox();ready(G,1);const built=G.sys.building.buildRoom(0,0,'bedroom');assert.ok(built.ok);const a=built.roomId,before=JSON.stringify(G.state),runtime=JSON.stringify(G.runtime);
  for(const [id,floor,slot] of [[null,0,1],['__proto__',0,1],['constructor',0,1],['toString',0,1],['observatory',0,1],['attic',0,1],['missing',0,1],[{},0,1],[a,0,2],[a,1,0],[a,-1,0],[a,0,-1],[a,0,3],[a,.5,0],[a,0,1.5],[a,'0',1],[a,0,'1'],[a,NaN,1],[a,Infinity,0],[a,0,null],[a,0,undefined]]) {const result=G.sys.building.swapRooms(id,floor,slot);assert.equal(result.ok,false,JSON.stringify([id,floor,slot]));assert.equal(JSON.stringify(G.state),before);assert.equal(JSON.stringify(G.runtime),runtime);}
});
test('旧界面的目标房间或空格已变化时拒绝，不会调换其它房间', () => {
  const { G }=sandbox(),{ a,b }=homes(G);assert.ok(G.sys.building.swapRooms(b,0,2,null).ok);const before=JSON.stringify(G.state);
  for(const expected of [b,{},false,'__proto__'])assert.equal(G.sys.building.swapRooms(a,0,1,expected).ok,false);assert.equal(JSON.stringify(G.state),before);assert.equal(G.sys.building.swapRooms(a,0,2,null).ok,false);assert.equal(JSON.stringify(G.state),before);assert.ok(G.sys.building.swapRooms(a,0,1,null).ok);
});
test('真实localStorage拒写与容量失败保留内存、磁盘、资格和运行期', () => {
  const env=sandbox(),{ G }=env,{ a,b }=homes(G);G.runtime.activeRoomId=b;G.runtime.selected={roomId:a,uid:'held'};G.runtime.placing='bed_basic';assert.ok(G.save.flush());const before=JSON.stringify(G.state),runtime=JSON.stringify(G.runtime),disk=env.storage.get(G.data.balance.saveKey);let events=0;G.bus.on('room:swapped',()=>events++);
  env.writeFails(true);assert.equal(G.sys.building.swapRooms(a,0,1,b).ok,false);assert.equal(JSON.stringify(G.state),before);assert.equal(JSON.stringify(G.runtime),runtime);assert.equal(env.storage.get(G.data.balance.saveKey),disk);assert.equal(events,0);env.writeFails(false);
  const max=G.data.balance.maxSaveBytes;G.data.balance.maxSaveBytes=1;try{assert.equal(G.sys.building.swapRooms(a,0,1,b).ok,false);assert.equal(JSON.stringify(G.state),before);assert.equal(JSON.stringify(G.runtime),runtime);assert.equal(env.storage.get(G.data.balance.saveKey),disk);}finally{G.data.balance.maxSaveBytes=max;}
  assert.ok(G.sys.building.swapRooms(a,0,1,b).ok);assert.equal(events,1);assert.equal(G.runtime.activeRoomId,a);assert.equal(G.runtime.selected,null);assert.equal(G.runtime.placing,null);
});
test('同步状态与完成事件重入都不会造成第二次交换或重复回忆', () => {
  const { G }=sandbox(),{ a,b }=homes(G),memories=G.state.memories.length;let nestedState,nestedEvent,armed=true,events=0;
  G.bus.on('state:change',()=>{if(armed){armed=false;nestedState=G.sys.building.swapRooms(a,0,0,b);}});G.bus.on('room:swapped',()=>{events++;nestedEvent=G.sys.building.swapRooms(a,0,0,b);});
  assert.ok(G.sys.building.swapRooms(a,0,1,b).ok);assert.equal(nestedState.ok,false);assert.equal(nestedEvent.ok,false);assert.equal(events,1);assert.equal(G.state.memories.length,memories+1);assert.equal(G.state.house.floors[0].slots[1],a);
});
test('成功后清理旧装饰撤销，保存失败仍保留旧撤销', () => {
  const env=sandbox(),{ G }=env,{ a,b }=homes(G);stock(G,'bed_basic',a,20);env.writeFails(true);assert.equal(G.sys.building.swapRooms(a,0,1,b).ok,false);env.writeFails(false);assert.ok(G.sys.decorating.undo().ok);assert.equal(G.state.house.rooms[a].items.length,0);
  stock(G,'bed_basic',a,25);assert.ok(G.sys.building.swapRooms(a,0,1,b).ok);assert.equal(G.sys.decorating.undo().ok,false);assert.equal(G.state.house.rooms[a].items.length,1);
});
test('JSON刷新与实际导入保留位置和居民；MD按新位置列房间', async () => {
  const env=sandbox(),{ G }=env,{ a,b }=homes(G);stock(G,'bed_basic',a,25);assert.ok(G.sys.residents.invite('lily',a).ok);assert.ok(G.sys.building.swapRooms(a,2,1,null).ok);const saved=plain(G.state),loaded=sandbox(saved);
  assert.equal(loaded.G.state.house.floors[2].slots[1],a);assert.equal(loaded.G.state.residents.lily.roomId,a);assert.equal(loaded.G.state.house.floors[0].slots[1],b);
  assert.ok(G.sys.building.swapRooms(a,0,0,null).ok);const result=await G.save.importFile({text:async()=>JSON.stringify(saved)});assert.ok(result.ok,result.message);assert.equal(G.state.house.floors[2].slots[1],a);assert.equal(G.state.residents.lily.roomId,a);
  let download;G.utils.download=(name,text,mime)=>download={name,text,mime};const memory=G.save.exportMemory();assert.ok(memory.includes('3 楼 · 第 2 间 卧室'));assert.ok(memory.includes('原木小床'));assert.ok(memory.includes('1 楼 · 第 2 间 厨房'));assert.equal(download.text,memory);assert.ok(download.name.endsWith('.md'));
});
test('旧版缺少新模块字段的存档无需房间位置迁移，新引用仍可直接互换', () => {
  const { G }=sandbox(),{ a,b }=homes(G),old=plain(G.state);for(const key of ['giftBox','loginRewards','observatory','customArts','albumTrash','collectionBook'])delete old[key];const loaded=sandbox(old),roomBefore=JSON.stringify(loaded.G.state.house.rooms);
  assert.ok(loaded.G.sys.building.swapRooms(a,0,1,b).ok);assert.equal(loaded.G.state.house.floors[0].slots[1],a);assert.equal(JSON.stringify(loaded.G.state.house.rooms),roomBefore);assert.equal(loaded.G.state.version,1);
});
test('回忆容量到顶时只裁剪最旧条目，交换记录仅一次且不扩展schema', () => {
  const { G }=sandbox(),{ a,b }=homes(G);G.store.update(state=>state.memories=Array.from({length:G.data.balance.maxMemories},(_,n)=>({at:n,text:'旧回忆'+n})));const keys=Object.keys(G.state).sort();assert.ok(G.sys.building.swapRooms(a,0,1,b).ok);assert.equal(G.state.memories.length,G.data.balance.maxMemories);assert.equal(G.state.memories[0].text,'旧回忆1');assert.ok(G.state.memories.at(-1).text.includes('互换位置'));assert.deepEqual(Object.keys(G.state).sort(),keys);
});
(async()=>{for(const entry of tests){await entry.fn();console.log('✓ '+entry.name);}console.log('\n'+tests.length+' 组房间互换与持久事务检查通过（规则环境，不代替实际拖动验收）。');})().catch(error=>{console.error(error);process.exitCode=1;});
