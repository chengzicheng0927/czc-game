import { executeCommand, validateDocument, deriveSpaces, type BuildingDocument, type BuildingCommand, type Point2, type Vec3 } from './building/domain';
import { furnitureDimensions } from './building/catalog';
import { BuildingRenderer } from './building/renderer';
import { LiveVisitors } from './content/live-visitors';

// 只编排新建筑命令与原有游戏界面；账号、内容面板和视觉身份继续由各自模块负责。
const G = window.Game;
type Kind = 'wall' | 'opening' | 'furniture' | 'none';
type Mode = 'select' | 'wall' | 'door' | 'window' | 'furniture' | 'wallpaper';
type HouseHistory = { exteriorBefore: any; exteriorAfter: any; roomMaps: { before: Record<string, string>; after: Record<string, string> } };
type Entry = { before: BuildingDocument; after: BuildingDocument; inventory: Record<string, number>; label: string; house?: HouseHistory };
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const node = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag); n.className = className; if (text !== undefined) n.textContent = text; return n;
};
let editorEpoch = 0;
const button = (text: string, action: () => void, className = 'ui-button ui-button-soft') => {
  const epoch=editorEpoch,b=node('button',className,text);b.type='button';
  b.addEventListener('click',()=>{if(epoch===editorEpoch&&b.isConnected)action();});return b;
};
const clone = <T>(value: T): T => structuredClone(value);
const uid = (prefix: string) => prefix + '_' + crypto.randomUUID().replaceAll('-', '');
const params = new URLSearchParams(location.search);
const review = params.get('review') === '1';
const reviewSlot = review && /^[a-z0-9_-]{1,32}$/.test(params.get('slot') || '') ? params.get('slot')! : '';
const visitorId = location.pathname.match(/\/visit\/([a-f0-9-]{36})$/)?.[1];
const buildingPanels = new Set(['build','decor','yard','roomLayout']);
let renderer: BuildingRenderer;
let visitors: LiveVisitors;
let captureDepth=0;
let editing = false, builderPanel = '';
let mode: Mode = 'select', floorId = '', start: Point2 | null = null;
let selected: {kind: Kind; id: string | null} = {kind:'none',id:null};
let placement: string | null = null, wallHeight = 2.8, openingWidth = .9;
let finishColor='#FFD6E0',finishPattern:'solid'|'dots'|'stripes'='dots';
let undoStack: Entry[] = [], redoStack: Entry[] = [];
let visitorDocument: BuildingDocument | null = null, visitorVisual:any = {customArts:[]};
let housePreview: any = null;
let houseView: {floor:string; view:'exterior'|'cutaway'} = {floor:'all',view:'exterior'};
const doc = (): BuildingDocument => visitorDocument || housePreview?.building || G.state.building;
const isYardFloor = (floor: {id:string}) => floor.id.includes('yard');
const isYardItem = (item: BuildingDocument['furniture'][number], building = doc()) => item.legacyRoomId === 'yard' || G.data.furnitureById[item.defId]?.place === 'yard' || building.floors.some(floor=>floor.id===item.floorId&&isYardFloor(floor));
function visualState() {
  if (visitorDocument) return visitorVisual;
  if (!housePreview) return G.state;
  const residents = clone(G.state.residents);
  for (const assignment of housePreview.roomAssignments || []) if (residents[assignment.residentId]?.movedIn) residents[assignment.residentId].roomId = assignment.roomId;
  return { ...G.state, building: housePreview.building, house: { ...G.state.house, exterior: housePreview.exterior }, residents };
}
const toast = (text:string) => G.ui.toast(text);
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
function field(label:string,input:HTMLElement) {return G.ui.controls.label(input,label);}
function numberInput(label:string,value:number,step=.25) {
  const n=node('input','ui-input');n.type='number';n.step=String(step);n.value=String(value);n.setAttribute('aria-label',label);return n;
}
function hintText() {
  if(visitorDocument)return '在朋友家看看 · 拖动转动镜头，滚轮缩放';
  if(housePreview)return '正在看「'+housePreview.name+'」· 还没建造，选好后确认再搬进去';
  if(!editing)return '拖动转动小岛 · 滚轮放大看看 · 点「建造装饰」搭自己的小屋';
  return ({select:'点一点选择 · 拖动家具挪位置 · 随时可以退一步',wall:start?'接着点下一个墙角 · Esc 结束这一段':'在草坪上点两下，搭起一面墙',door:'在墙上点一下，装一扇小门',window:'在墙上点一下，添一扇窗',furniture:placement?'点草坪放好家具 · 小摆件也能放到桌面上':'从背包挑一件喜欢的家具',wallpaper:'挑个颜色和花纹，再点一面墙，给小屋换新衣'})[mode];
}
function hint() {if($('scene-hint'))$('scene-hint').textContent=hintText();}
function syncSelection() {
  const item=doc().furniture.find(f=>f.id===selected.id);
  G.runtime.placing=placement;
  G.runtime.selected=selected.id?{uid:selected.id,kind:selected.kind,floorId:item?.floorId||floorId,roomId:G.contentSpaces?.list()?.find((r:any)=>r.items.some((i:any)=>i.uid===selected.id))?.id||null}:null;
}
function setMode(next:Mode) {
  if(visitorDocument)return;
  editing=true;mode=next;start=null;
  const outdoors=doc().floors.some(f=>f.id===floorId&&isYardFloor(f));
  renderer.setReadOnly(next==='wallpaper');renderer.clearPreview();renderer.setMode(next==='wallpaper'?'select':next);houseView={floor:outdoors?'all':floorId,view:outdoors?'exterior':'cutaway'};renderer.setView(houseView.view);
  if(next!=='furniture'){placement=null;renderer.setPlacement(null);}
  syncSelection();paint();hint();
  document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tool===next)));
  renderOptions();selectionTools();
}
function leaveEditing() {
  editing=false;mode='select';start=null;placement=null;selected={kind:'none',id:null};
  renderer.setReadOnly(true);renderer.setMode('select');renderer.setPlacement(null);renderer.clearPreview();renderer.select('none',null);
  houseView={floor:'all',view:'exterior'};renderer.setView('exterior');syncSelection();hint();selectionTools();
}
function placementHeight(def:any,p:Point2) {
  if(def.place==='wall')return 1.25;
  if(def.place==='ceiling')return 2.35;
  if(def.place==='table'){
    const support=doc().furniture.filter(item=>item.floorId===floorId && G.data.furnitureById[item.defId]?.surface).find(item=>{
      const a=-item.rotation,dx=p.x-item.position.x,dz=p.z-item.position.z;
      return Math.abs(dx*Math.cos(a)-dz*Math.sin(a))<=item.dimensions.width/2 && Math.abs(dx*Math.sin(a)+dz*Math.cos(a))<=item.dimensions.depth/2;
    });
    if(support)return support.position.y+support.dimensions.height;
  }
  return 0;
}
function persist(building: BuildingDocument, delta: Record<string,number> = {}, effect?:(state:any)=>void) {
  if(visitorDocument) throw new Error('参观的小屋只能查看。');
  // 建筑和库存差值同一次提交；写盘失败时store不会发布新状态。
  G.store.update((state: any)=>{
    for(const [id,amount] of Object.entries(delta)) { const next=(state.inventory[id]||0)+amount; if(next<0 || next>9999) throw new Error('这件家具的库存已经变化，请重新选择。'); state.inventory[id]=next; }
    state.building=validateDocument({...building,revision:state.building.revision+1},G.data.furnitureById);
    effect?.(state);
  },{persist:true});
}
function command(c: BuildingCommand, label: string, delta: Record<string,number> = {}) {
  try {
    if(c.type==='furniture.move'){
      const item=doc().furniture.find(value=>value.id===c.id);
      if(item&&isYardItem(item)&&!yardPositionAllowed(c.position,item.dimensions,c.rotation??item.rotation))throw new Error('请把家具留在屋前的庭院草坪里，给小屋和花圃留出通路。');
    }
    const before=clone(doc()),after=executeCommand(before,c,G.data.furnitureById);let levels:number[]=[];
    persist(after,delta,state=>{
      if(c.type==='wall.finish'){state.quests.stats.wallpaperChanges=(state.quests.stats.wallpaperChanges||0)+1;}
      if(c.type==='furniture.add') {
        state.quests.stats.itemsPlaced=(state.quests.stats.itemsPlaced||0)+1;
        for(const entry of state.quests.daily.list){const def=G.data.dailyQuests.find((q:any)=>q.id===entry.id);if(def?.metric==='itemsPlaced'){entry.progress++;entry.done=entry.progress>=def.target;}}
        const flag='placed_'+c.furniture.defId;
        if(!state.tutorial.seenTips[flag]){state.tutorial.seenTips[flag]=true;levels=G.sys.economy.expInto(state,G.data.balance.firstPlaceExp);}
      }
    });
    undoStack.push({before,after:clone(doc()),inventory:delta,label});if(undoStack.length>80)undoStack.shift();redoStack=[];
    levels.forEach(level=>G.bus.emit('level:up',{level}));
    if(c.type==='furniture.add')G.bus.emit('item:placed',{uid:c.furniture.id,defId:c.furniture.defId});
    paint();if(mode==='select')renderOptions();return true;
  }catch(error){toast(message(error));paint();return false;}
}
function history(redo: boolean) {
  if(housePreview)return {ok:false,message:'先回到现在的小屋，再退一步吧。'};
  const from=redo?redoStack:undoStack,to=redo?undoStack:redoStack,e=from.at(-1);if(!e)return {ok:false,message:'还没有可以'+(redo?'重做':'撤销')+'的布置。'};
  // 打开旧档院子准备的空地面不是布置变动；有墙或家具的院子仍严格参与冲突校验。
  const emptyYards = (value:BuildingDocument) => value.floors.filter(f=>isYardFloor(f)&&!value.walls.some(w=>w.floorId===f.id)&&!value.furniture.some(item=>item.floorId===f.id));
  const content = (value:BuildingDocument) => {const empty=new Set(emptyYards(value).map(f=>f.id));return JSON.stringify({...value,revision:0,floors:value.floors.filter(f=>!empty.has(f.id))});};
  if(content(doc())!==content(redo?e.before:e.after)){undoStack=[];redoStack=[];paint();return {ok:false,message:'小屋有了新的变化，已收好之前的布置记录。请从现在继续搭吧。'};}
  const ordered = (value:Record<string,unknown>) => JSON.stringify(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)));
  const roomMap = () => Object.fromEntries(Object.entries(G.state.residents).filter(([,r]:any)=>r.movedIn).map(([id,r]:any)=>[id,r.roomId]));
  const exteriorFields = (value:any) => Object.fromEntries(Object.entries(value).filter(([key])=>key!=='owned'));
  if(e.house&&(ordered(roomMap())!==ordered(redo?e.house.roomMaps.before:e.house.roomMaps.after)||ordered(exteriorFields(G.state.house.exterior))!==ordered(redo?e.house.exteriorBefore:e.house.exteriorAfter))) {
    undoStack=[];redoStack=[];paint();return {ok:false,message:'朋友的房间或小屋外观有了新安排，之前的换房记录收好啦，请从现在继续搭配。'};
  }
  try {const delta=Object.fromEntries(Object.entries(e.inventory).map(([id,n])=>[id,redo?n:-n])),target=clone(redo?e.after:e.before);for(const floor of emptyYards(doc()))if(!target.floors.some(f=>f.id===floor.id))target.floors.push(clone(floor));persist(target,delta,state=>{
    if(!e.house)return;
    Object.assign(state.house.exterior,clone(redo?e.house.exteriorAfter:e.house.exteriorBefore));
    for(const [id,roomId] of Object.entries(redo?e.house.roomMaps.after:e.house.roomMaps.before)) if(state.residents[id]?.movedIn)state.residents[id].roomId=roomId;
  });from.pop();to.push(e);selected={kind:'none',id:null};renderer.select('none',null);start=null;renderer.clearPreview();paint();renderOptions();return {ok:true,message:(redo?'重做：':'撤销：')+e.label};}
  catch(error){return {ok:false,message:message(error)};}
}
function endHousePreview() {
  if(!housePreview)return;
  housePreview=null;G.runtime.houseBlueprintPreviewId=null;
  floorId=G.state.building.floors[0].id;houseView={floor:'all',view:'exterior'};
  renderer.setReadOnly(true);renderer.setView('exterior');paint();renderer.resetCamera();
}
function previewHouse(id:string) {
  if(visitorDocument||G.visitSession?.active?.())return {ok:false,message:'先回自己的小屋，再挑新房子吧。'};
  try {
    const preview=G.sys.houseBlueprints.preview(id);if(!preview?.building)return {ok:false,message:preview?.reason||'先选一座小屋吧。'};
    leaveEditing();housePreview=preview;G.runtime.houseBlueprintPreviewId=id;
    floorId=preview.building.floors[0].id;houseView={floor:'all',view:'exterior'};
    renderer.setReadOnly(true);renderer.setView('exterior');paint();renderer.resetCamera();return {ok:true};
  }catch(error){return {ok:false,message:message(error)};}
}
function buildHouse(id:string,quote:any) {
  if(visitorDocument||G.visitSession?.active?.())return {ok:false,message:'先回自己的小屋，再建新房子吧。'};
  try {
    const result=G.sys.houseBlueprints.apply(id,quote);if(!result.ok)return result;
    if(result.unchanged)return result;
    undoStack.push({before:clone(result.buildingBefore),after:clone(result.buildingAfter),inventory:clone(result.inventoryDelta),label:'建造'+(result.name||'新房子'),house:{
      exteriorBefore:clone(result.exteriorBefore),exteriorAfter:clone(result.exteriorAfter),roomMaps:clone(result.roomMaps),
    }});if(undoStack.length>80)undoStack.shift();redoStack=[];
    endHousePreview();floorId=G.state.building.floors[0].id;paint();return result;
  }catch(error){return {ok:false,message:message(error)};}
}
// 庭院有自己的稳定地面；它不是屋内楼层，也不从历史归档重复领取家具。
function yardSnapshot() {
  const building=G.state.building,unlockLv=G.data.yardConfig.unlockLv;
  return {unlocked:G.state.level>=unlockLv,unlockLv,floorId:building.floors.find(isYardFloor)?.id||null,
    items:building.furniture.filter((item:any)=>isYardItem(item,building)).map((item:any)=>({...clone(item),name:G.data.furnitureById[item.defId]?.name||'庭院家具'}))};
}
function ensureYard() {
  const before:BuildingDocument=clone(G.state.building),after=clone(before);
  let yard=after.floors.find(isYardFloor);
  if(!yard){yard={id:'legacy_yard',name:'我的院子',elevation:0};after.floors.push(yard);}
  for(const item of after.furniture)if(isYardItem(item,after)&&!after.floors.some(f=>f.id===item.floorId&&isYardFloor(f)))item.floorId=yard.id;
  if(JSON.stringify(after)!==JSON.stringify(before)){
    persist(after);
  }
  return yard.id;
}
function openYard(options:any={}) {
  if(visitorDocument||G.visitSession?.active?.())return {ok:false,message:'先回自己的小屋，再来布置院子吧。'};
  try{
    endHousePreview();const entering=!editing||builderPanel!=='yard',snapshot=yardSnapshot();
    if(snapshot.unlocked&&entering){
      floorId=ensureYard();editing=true;builderPanel='yard';mode='select';placement=null;start=null;
      renderer.setReadOnly(false);renderer.setMode('select');renderer.setPlacement(null);
      houseView={floor:'all',view:'exterior'};renderer.setView('exterior');paint();
    }else if(!snapshot.unlocked)leaveEditing();
    if(entering)renderer.focusYard();
    if(options.panel!==false)G.ui.open('yard');
    return {ok:true};
  }catch(error){return {ok:false,message:message(error)};}
}
function yardPositionAllowed(point:Point2,dimensions:{width:number;depth:number},rotation=0) {
  const b=renderer.yardBounds(),c=Math.abs(Math.cos(rotation)),s=Math.abs(Math.sin(rotation));
  const x=(dimensions.width*c+dimensions.depth*s)/2,z=(dimensions.width*s+dimensions.depth*c)/2;
  return point.x-x>=b.minX&&point.x+x<=b.maxX&&point.z-z>=b.minZ&&point.z+z<=b.maxZ;
}
function ground(point: Point2) {
  if(housePreview)return;
  if(G.visitSession?.walkTo(point)||G.hostRoom?.walkTo(point))return;
  if(visitorDocument){if(visitorId&&G.live?.status()?.phase==='connected'){const next=G.liveSpace.destination(visitorVisual,point,floorId);if(next)G.live.move(next.zone,next.x,next.y);}return;}
  const p={x:Math.round(point.x*4)/4,z:Math.round(point.z*4)/4};
  if(mode==='wall') {
    if(!start){start=p;hint();return;}
    const ok=command({type:'wall.add',wall:{id:uid('wall'),floorId,start:clone(start),end:p,height:wallHeight,thickness:.16,color:'#F2D9D0'}},'画一面墙');
    if(ok){start=p;renderer.clearPreview();hint();}return;
  }
  if(mode==='furniture' && placement) {
    const def=G.data.furnitureById[placement];if(!def)return;
    const dims=furnitureDimensions(def), y=placementHeight(def,p);
    if(def.place==='yard'&&!yardPositionAllowed(p,dims)){toast('把它放在屋前的庭院草坪里吧，花圃和小屋要留出通路。');return;}
    if(def.place==='yard'&&yardSnapshot().items.length>=G.data.yardConfig.maxItems){toast('院子已经放满啦，先收起一些再继续布置吧。');return;}
    const item={id:uid('furniture'),defId:placement,floorId,position:{...p,y},rotation:0,dimensions:dims};
    if(command({type:'furniture.add',furniture:item},'摆放'+def.name,{[placement]:-1})) { selected={kind:'furniture',id:item.id};renderer.select('furniture',item.id); if(!(G.state.inventory[placement]>0))setMode('select');else renderOptions();syncSelection();selectionTools(); }
  }
}
function wallClick(id: string, offset: number) {
  if(!editing||visitorDocument||(mode!=='door'&&mode!=='window')||!doc().walls.some(w=>w.id===id&&w.floorId===floorId))return;
  const opening={id:uid(mode),wallId:id,kind:mode,offset:Math.round((offset-openingWidth/2)*4)/4,width:openingWidth,height:mode==='door'?2.15:1.15,sill:mode==='door'?0:.95};
  if(command({type:'opening.add',opening},mode==='door'?'安装一扇门':'安装一扇窗')) {selected={kind:'opening',id:opening.id};renderer.select('opening',opening.id);syncSelection();renderOptions();selectionTools();}
}
function choose(kind:Kind,id:string|null) { if(mode==='wallpaper'&&kind==='wall'&&id){command({type:'wall.finish',wallIds:[id],color:finishColor,pattern:finishPattern},'换上喜欢的墙纸');return;}if(mode!=='select'||!editing)return;selected={kind,id};syncSelection();renderer.select(kind,id);renderOptions();selectionTools(); }
function move(id:string,position:Vec3) { if(!editing||mode!=='select'||visitorDocument)return;const item=doc().furniture.find(f=>f.id===id&&f.floorId===floorId);if(!item)return;const next={x:Math.round(position.x*4)/4,y:item.position.y,z:Math.round(position.z*4)/4};if(isYardItem(item)&&!yardPositionAllowed(next,item.dimensions,item.rotation)){toast('请把家具留在屋前的庭院草坪里。');paint();return;}command({type:'furniture.move',id,position:next},'移动家具');selected={kind:'furniture',id};renderer.select('furniture',id);syncSelection();renderOptions();selectionTools(); }
function removeSelected() {
  if(!selected.id)return;const item=doc().furniture.find(f=>f.id===selected.id),delta=item&&!G.data.furnitureById[item.defId]?.customArt?{[item.defId]:1}:{};
  if(command({type:'entity.remove',id:selected.id},item?'收起家具':'移除选中内容',delta)){selected={kind:'none',id:null};renderer.select('none',null);syncSelection();renderOptions();selectionTools();}
}
function renderOptions() {
  const root=$('editor-options');if(!root)return;root.replaceChildren();$('sidebar-title').textContent=({select:'选择与调整',wall:'搭起软软的墙',door:'给小屋开扇门',window:'让阳光住进来',furniture:'挑一件喜欢的家具',wallpaper:'给墙壁换件小衣服'})[mode];
  if(visitorId){root.append(node('p','','正在参观公开的小屋。建筑和家具只可查看。'));return;}
  if(mode==='furniture'){renderCatalog(root);return;}
  if(mode==='wallpaper'){
    const palette=node('div','ui-row free-wall-palette');
    for(const color of ['#FFD6E0','#FFE9B4','#BDECD6','#BFE3FF','#D9C8FF','#FFD3B0','#FFF8FB','#E8C39E']){const b=button('',()=>{finishColor=color;renderOptions();});b.style.background=color;b.setAttribute('aria-label','墙纸颜色 '+color);b.setAttribute('aria-pressed',String(finishColor===color));palette.append(b);}
    root.append(node('p','editor-note','挑一颗糖果色，再给墙壁选一件小衣服。点墙可以只换这一面，也能给这一层一起换上。'),palette);
    const patterns=node('div','ui-row');for(const [id,label]of [['solid','纯色'],['dots','圆点'],['stripes','条纹']] as const){const b=button(label,()=>{finishPattern=id;renderOptions();},'ui-button '+(finishPattern===id?'ui-button-primary':'ui-button-soft'));patterns.append(b);}root.append(patterns,button('给这一层换上',()=>{const ids=doc().walls.filter(w=>w.floorId===floorId).map(w=>w.id);if(!ids.length){toast('先搭起一面墙，再给它换衣服吧。');return;}command({type:'wall.finish',wallIds:ids,color:finishColor,pattern:finishPattern},'换上喜欢的墙纸');},'ui-button ui-button-primary'));
  }else if(mode==='wall'){
    root.append(node('p','editor-note','在草坪上点两下，就能搭起一面墙。接着点下一个墙角，还能继续搭哦。'));
    const h=numberInput('墙高',wallHeight,.1);h.min='1';h.max='5';h.addEventListener('change',()=>{wallHeight=Math.max(1,Math.min(5,Number(h.value)||2.8));h.value=String(wallHeight);});root.append(field('墙高 / 米',h));
    const row=node('div','coordinate-grid'),x1=numberInput('起点 X',-3),z1=numberInput('起点 Z',-2),x2=numberInput('终点 X',3),z2=numberInput('终点 Z',-2);
    row.append(field('起点 X',x1),field('起点 Z',z1),field('终点 X',x2),field('终点 Z',z2));const precision=node('details','precision-options');precision.append(node('summary','','我想精确调整'));precision.append(row,button('添加这面墙',()=>{
      command({type:'wall.add',wall:{id:uid('wall'),floorId,start:{x:Number(x1.value),z:Number(z1.value)},end:{x:Number(x2.value),z:Number(z2.value)},height:wallHeight,thickness:.16,color:'#F2D9D0'}},'画一面墙');
    },'ui-button ui-button-primary'));root.append(precision,button('结束连续画墙',()=>{start=null;renderer.clearPreview();hint();}));
  }else if(mode==='door'||mode==='window'){
    root.append(node('p','editor-note','点击目标墙面，门窗会沿着墙安装。靠墙角太近或与已有开口重叠时，会提示重新选择。'));
    const width=numberInput('开口宽度',openingWidth,.1);width.min='.5';width.max='3';width.addEventListener('change',()=>{openingWidth=Math.max(.5,Math.min(3,Number(width.value)||.9));width.value=String(openingWidth);});root.append(field('宽度 / 米',width));
  }else{
    const item=doc().furniture.find(f=>f.id===selected.id),wall=doc().walls.find(w=>w.id===selected.id),opening=doc().openings.find(o=>o.id===selected.id);
    if(item&&item.floorId!==floorId){const floor=doc().floors.find(f=>f.id===item.floorId);root.append(node('p','editor-note','已选家具留在'+(floor?.name||'另一层')+'，回去还能接着布置。'),button('回到这件家具',()=>{focusFloor(item.floorId);G.ui.refresh();}));return;}
    if(item){root.append(node('h3','',G.data.furnitureById[item.defId]?.name||'家具'));const row=node('div','coordinate-grid');const x=numberInput('家具 X',item.position.x),z=numberInput('家具 Z',item.position.z),y=numberInput('家具高度',item.position.y,.1),r=numberInput('家具朝向',Math.round(item.rotation*180/Math.PI),15);row.append(field('左右位置',x),field('前后位置',z),field('离地高度',y),field('转个方向',r));const precision=node('details','precision-options');precision.append(node('summary','','精确挪一挪'));precision.append(row,button('应用位置与朝向',()=>command({type:'furniture.move',id:item.id,position:{x:Number(x.value),y:Number(y.value),z:Number(z.value)},rotation:Number(r.value)*Math.PI/180},'调整家具'),'ui-button ui-button-primary'));root.append(precision,button('转动 90°',()=>command({type:'furniture.move',id:item.id,position:item.position,rotation:item.rotation+Math.PI/2},'转动家具')),button('收回背包',removeSelected));}
    else if(wall){root.append(node('h3','','这面墙'),node('p','',`长 ${Math.hypot(wall.end.x-wall.start.x,wall.end.z-wall.start.z).toFixed(2)} 米 · 高 ${wall.height} 米`),node('p','editor-note','移除墙体时，依附在这面墙上的门窗也会一起移除；可以撤销恢复。'),button('移除这面墙',removeSelected,'ui-button ui-button-soft'));}
    else if(opening){root.append(node('h3','',opening.kind==='door'?'这扇门':'这扇窗'),node('p','',`宽 ${opening.width} 米 · 高 ${opening.height} 米`),button('移除这个开口',removeSelected));}
    else root.append(node('p','editor-note','点击一件家具或一面墙，即可选择。家具可以在画布里直接拖动，也可以输入位置和朝向。'),node('div','editor-tip','先画出轮廓，再留一扇门，最后把喜欢的家具搬进来。'));
  }
  const summary=node('div','building-summary'); const spaces=deriveSpaces(doc(),floorId);summary.textContent=`这一层：${doc().walls.filter(w=>w.floorId===floorId).length} 面墙 · ${spaces.length} 个闭合空间`;root.append(summary);
}
function captureScene(settings:{scope?:string;roomId?:string}={}){
  const camera=renderer.camera,held={alpha:camera.alpha,beta:camera.beta,radius:camera.radius,target:camera.target.clone(),offset:camera.targetScreenOffset.clone(),mode:camera.mode},source=$<HTMLCanvasElement>('scene');
  const room=settings.scope==='room'?G.contentSpaces.get(settings.roomId):null;captureDepth++;
  try{
    if(settings.scope==='room'&&!room)throw new Error('这间小屋的位置有变化，请重新选一次。');
    if(room){renderer.setDocument(doc(),room.floorId);renderer.setView('cutaway');const xs=room.polygon.map((p:Point2)=>p.x),zs=room.polygon.map((p:Point2)=>p.z),elevation=doc().floors.find(f=>f.id===room.floorId)!.elevation;camera.target.set((Math.min(...xs)+Math.max(...xs))/2,elevation+1.2,(Math.min(...zs)+Math.max(...zs))/2);camera.radius=Math.max(7,Math.hypot(Math.max(...xs)-Math.min(...xs),Math.max(...zs)-Math.min(...zs))*1.6);camera.beta=.78;}
    renderer.screenshot();const result=node('canvas');let x=0,y=0,w=source.width,h=source.height;
    if(room){const elevation=doc().floors.find(f=>f.id===room.floorId)!.elevation,points=room.polygon.flatMap((p:Point2)=>[renderer.project({...p,y:elevation}),renderer.project({...p,y:elevation+3.5})]),rect=source.getBoundingClientRect(),sx=source.width/rect.width,sy=source.height/rect.height;const minX=Math.min(...points.map((p:any)=>p.x))-18,minY=Math.min(...points.map((p:any)=>p.y))-18,maxX=Math.max(...points.map((p:any)=>p.x))+18,maxY=Math.max(...points.map((p:any)=>p.y))+18;x=Math.max(0,minX*sx);y=Math.max(0,minY*sy);w=Math.max(1,Math.min(source.width-x,(maxX-minX)*sx));h=Math.max(1,Math.min(source.height-y,(maxY-minY)*sy));}
    const scale=Math.min(1,2560/w,2560/h);result.width=Math.max(1,Math.round(w*scale));result.height=Math.max(1,Math.round(h*scale));result.getContext('2d')!.drawImage(source,x,y,w,h,0,0,result.width,result.height);return result;
  }finally{captureDepth--;if(room){renderer.setDocument(doc(),floorId);renderer.setView(houseView.view);camera.alpha=held.alpha;camera.beta=held.beta;camera.radius=held.radius;camera.target.copyFrom(held.target);camera.mode=held.mode;renderer.screenshot();}camera.targetScreenOffset.copyFrom(held.offset);}
}

function renderCatalog(root:HTMLElement) {
  if(G.ui.backpackPanel)root.append(G.ui.backpackPanel().content);
}
function selectionTools() {
  const host=$('selection-tools');if(!host)return;host.replaceChildren();
  if(visitorDocument||!editing)return;
  const row=node('div','ui-row free-selection');
  if(placement) {
    row.append(node('span','',`准备摆放：${G.data.furnitureById[placement]?.name||'家具'}`),button('先不摆啦',()=>{setMode('select');G.ui.refresh();}));
  } else if(selected.id) {
    const item=doc().furniture.find(f=>f.id===selected.id);
    if(item&&item.floorId!==floorId)row.append(button('回到已选家具',()=>{focusFloor(item.floorId);G.ui.refresh();}));
    else if(item)row.append(button('转个方向',()=>command({type:'furniture.move',id:item.id,position:item.position,rotation:item.rotation+Math.PI/2},'转动家具')),button('收回背包',removeSelected));
    else row.append(button('移除'+(selected.kind==='wall'?'这面墙':'这扇门窗'),removeSelected));
    row.append(button('选好了',()=>{selected={kind:'none',id:null};renderer.select('none',null);syncSelection();selectionTools();renderOptions();}));
  }
  if(row.childElementCount)host.append(row);
}
function paint() {
  if(!renderer)return;
  const building=doc();
  if(!building.floors.some(f=>f.id===floorId))floorId=building.floors[0].id;
  renderer.setContentState({...visualState(),hidePlayer:!!G.live?.status()?.peerId});
  renderer.setDocument(building,floorId,houseView.floor==='all');
  document.querySelectorAll<HTMLButtonElement>('[data-history]').forEach(b=>b.disabled=!(b.dataset.history==='redo'?redoStack:undoStack).length);
  const summary=$('editor-options')?.querySelector('.building-summary');
  if(summary)summary.textContent=`这一层：${building.walls.filter(w=>w.floorId===floorId).length} 面墙 · ${deriveSpaces(building,floorId).length} 个闭合空间`;
  syncSelection();hint();selectionTools();syncSurface();
}
function syncSurface() {
  if(!renderer)return;
  renderer.setHomeGarden(visitorDocument||housePreview?null:{state:G.state,gardenStatuses:Array.from({length:G.sys.garden.capacity()},(_,index)=>G.sys.garden.status(index)),selectedPlot:G.runtime.gardenVisual?.selectedPlot});
  // 打开园艺面板只在同一主岛近看，房子和院子不再被另一座花园岛替换。
  renderer.setSurface(null);
}
function addFloor() {
  const ordinary=doc().floors.filter(f=>!f.id.includes('yard')&&!f.id.includes('attic'));
  const floor={id:uid('floor'),name:`${ordinary.length+1} 楼`,elevation:Math.max(...ordinary.map(f=>f.elevation),-3)+3};
  if(command({type:'floor.add',floor},'添加楼层')){floorId=floor.id;houseView={floor:floorId,view:'cutaway'};paint();renderer.resetCamera();G.ui.refresh();}
}
function builderPanelContent(name:string,options:any={}) {
  if(doc().floors.some(f=>f.id===floorId&&isYardFloor(f)))floorId=doc().floors.find(f=>!isYardFloor(f))!.id;
  const isEntering=!editing||builderPanel!==name;builderPanel=name;editing=true;
  if(isEntering){mode=options.tab==='wallpaper'?'wallpaper':name==='build'?'wall':'furniture';start=null;placement=null;renderer.setReadOnly(mode==='wallpaper');renderer.setPlacement(null);renderer.setMode(mode==='wallpaper'?'select':mode);}
  houseView={floor:floorId,view:'cutaway'};renderer.setView('cutaway');renderer.setDocument(doc(),floorId,false);
  const body=node('div','ui-stack free-building-panel');
  const tabs=node('div','ui-row decorate-suite-tabs');tabs.setAttribute('aria-label','建造与装饰分类');
  for(const [id,label] of [['select','选一选'],['wall','画墙'],['door','小门'],['window','窗户'],['furniture','家具'],['wallpaper','墙纸']] as const){
    const b=button(label,()=>{setMode(id);G.ui.refresh();},'ui-button '+(mode===id?'ui-button-primary is-active':'ui-button-soft'));
    b.dataset.tool=id;b.setAttribute('aria-pressed',String(mode===id));tabs.append(b);
  }
  const floors=node('div','ui-row free-floor-picker'),select=node('select','ui-input');select.setAttribute('aria-label','编辑楼层');
  for(const floor of doc().floors.filter(f=>!isYardFloor(f))){const option=node('option','',floor.name);option.value=floor.id;select.append(option);}select.value=floorId;
  const epoch=editorEpoch;
  select.onchange=()=>{if(epoch!==editorEpoch||!select.isConnected)return;floorId=select.value;G.runtime.roomCameraId='';houseView={floor:floorId,view:'cutaway'};start=null;renderer.clearPreview();paint();renderer.resetCamera();G.ui.refresh();};
  floors.append(field('这次布置哪一层？',select),button('＋ 再搭一层',addFloor));
  const tools=node('div','ui-row free-history');
  for(const [redo,label] of [[false,'↶ 退一步'],[true,'↷ 再做一次']] as const){const b=button(label,()=>{const result=history(redo);if(result)toast(result.message);G.ui.refresh();});b.dataset.history=redo?'redo':'undo';b.disabled=!(redo?redoStack:undoStack).length;tools.append(b);}
  tools.append(button('收好小屋',()=>toast(G.save.flush()?'小屋已经收好啦，下次还能接着玩。':G.save.status),'ui-button ui-button-primary'));
  const title=node('h3','ui-card-head');title.id='sidebar-title';const optionsHost=node('div','ui-stack');optionsHost.id='editor-options';
  const views=node('div','ui-row free-room-views');views.setAttribute('aria-label','房间视角');
  for(const [value,label] of [['admire','斜着欣赏'],['place','俯视摆放']] as const){const b=button(label,()=>{renderer.setRoomView(value);G.ui.refresh();},'ui-button '+(renderer.getRoomView()===value?'ui-button-primary':'ui-button-soft'));b.setAttribute('aria-pressed',String(renderer.getRoomView()===value));views.append(b);}
  const rooms=node('select','ui-input');rooms.setAttribute('aria-label','取景房间');
  const all=node('option','','这一整层');all.value='';rooms.append(all);
  for(const [index,room] of G.contentSpaces.list().filter((r:any)=>r.floorId===floorId).entries()){const name=G.data.rooms.find((r:any)=>r.id===room.type)?.name||'自由空间';const o=node('option','',name+' '+(index+1)+' · '+Math.round(room.area)+'㎡');o.value=room.id;rooms.append(o);}
  rooms.value=Array.from(rooms.options).some(o=>o.value===G.runtime.roomCameraId)?G.runtime.roomCameraId:'';
  rooms.onchange=()=>{if(epoch!==editorEpoch||!rooms.isConnected)return;G.runtime.roomCameraId=rooms.value;const room=G.contentSpaces.get(rooms.value);renderer.focusRoomBounds(room?.bounds||null);};
  body.append(tabs,floors,views,field('近看哪里？',rooms),tools,title,optionsHost);
  queueMicrotask(()=>{if(body.isConnected){renderOptions();hint();}});
  return {title:'🛋 建造装饰',subtitle:'画出自己的小天地，把喜欢的日子装进来',content:body};
}
function setHouseView(patch:any={}) {
  if(patch.floor!==undefined){
    const value=String(patch.floor),ordinary=doc().floors.filter(f=>!f.id.includes('yard')&&!f.id.includes('attic'));
    const chosen=doc().floors.find(f=>f.id===value) || (value==='attic'?doc().floors.find(f=>f.id.includes('attic')||f.id==='observatory_floor'):null) || (typeof patch.floor==='number'?ordinary[patch.floor-1]:null);
    houseView.floor=chosen?.id||'all';if(chosen){if(floorId!==chosen.id)G.runtime.roomCameraId='';floorId=chosen.id;}
  }
  if(patch.view==='exterior'||patch.view==='cutaway')houseView.view=patch.view;
  renderer.setView(houseView.view);paint();renderer.resetCamera();G.bus.emit('house:view',houseView);
}
function focusFloor(id:string) {if(!doc().floors.some(f=>f.id===id))return false;floorId=id;setHouseView({floor:id,view:'cutaway'});return true;}
function focusRoom(id:string) {
  const room=G.contentSpaces.get(id);if(!room)return;
  focusFloor(room.floorId);const b=room.bounds;
  G.runtime.roomCameraId=id;renderer.focusRoomBounds(b);
}
let exteriorPreviewQueue=Promise.resolve();
function previewExterior(target:HTMLCanvasElement,exterior:any) {
  const draw=async()=>{
    if(!target.isConnected)return {ok:false};
    renderer.setSurface(null);
    const state=visitorDocument?visitorVisual:G.state,camera=renderer.camera,building=doc(),epoch=editorEpoch,panel=G.ui.view?.panel;
    const held={alpha:camera.alpha,beta:camera.beta,radius:camera.radius,target:camera.target.clone(),offset:camera.targetScreenOffset.clone()};captureDepth++;
    try {
      renderer.setContentState({...state,house:{...state.house,exterior}});renderer.setView('exterior');
      renderer.setDocument(building,floorId,true);renderer.resetCamera();camera.targetScreenOffset.x=0;
      await renderer.scene.whenReadyAsync();
      if(epoch!==editorEpoch||building!==doc()||state!==(visitorDocument?visitorVisual:G.state)||panel!==G.ui.view?.panel||!target.isConnected)return {ok:false};
      renderer.screenshot();const source=$<HTMLCanvasElement>('scene'),context=target.getContext('2d');if(!context)throw new Error('外观预览画布还没有准备好。');
      const width=Math.min(source.width,source.height*target.width/target.height),height=Math.min(source.height,source.width*target.height/target.width);
      context.clearRect(0,0,target.width,target.height);context.drawImage(source,(source.width-width)/2,(source.height-height)/2,width,height,0,0,target.width,target.height);
      return {ok:true};
    } finally {
      captureDepth--;renderer.setContentState(visualState());renderer.setView(houseView.view);renderer.setDocument(doc(),floorId,houseView.floor==='all');
      if(epoch===editorEpoch&&building===doc()){camera.alpha=held.alpha;camera.beta=held.beta;camera.radius=held.radius;camera.target.copyFrom(held.target);camera.targetScreenOffset.copyFrom(held.offset);}renderer.screenshot();
    }
  };
  const result=exteriorPreviewQueue.then(draw);exteriorPreviewQueue=result.then(()=>undefined,()=>undefined);return result;
}
function installBridges() {
  let interaction='orbit';
  G.render=G.render||{};
  Object.assign(G.render,{
    drawThumbnail:G.catalogArt.drawThumbnail,drawCharacter:G.catalogArt.drawCharacter,
    drawAvatar:(canvas:HTMLCanvasElement,look:any,options:any={})=>renderer.drawAvatar(canvas,look,options),
    drawAvatar3D:(canvas:HTMLCanvasElement,look:any,options:any={})=>{void renderer.drawAvatar(canvas,look,options);return true;},
    createAvatarStage:(...args:any[])=>(renderer as any).createAvatarStage(...args),
    captureScene,previewExterior,redraw:paint,getHouseView:()=>({...houseView}),setHouseView,
    visit:{
      active:()=>!!visitorDocument,
      set:(next:any)=>{
        housePreview=null;G.runtime.houseBlueprintPreviewId=null;leaveEditing();visitorDocument=next?validateDocument(next.building,G.data.furnitureById):null;visitorVisual=next||{customArts:[]};
        floorId=doc().floors[0].id;renderer.setReadOnly(!!visitorDocument);visitors?.clear();paint();renderer.setView('exterior');renderer.resetCamera();
      },
    },
    beginPlacement:(id:string,roomId:string|null)=>G.buildingEditor.beginPlacement(id,roomId),
    cancelPlacement:()=>G.buildingEditor.cancelPlacement(),
    camera:{
      fit:()=>renderer.resetCamera(),reset:()=>renderer.resetCamera(),resetView:()=>renderer.resetCamera(),
      zoom:(factor:number)=>renderer.camera.radius=Math.max(3,Math.min(150,renderer.camera.radius/factor)),
      focusRoom,focusObservatory:()=>{const f=doc().floors.find(f=>f.id==='observatory_floor'||f.id==='legacy_attic');if(f)focusFloor(f.id);},
      focusYard:()=>renderer.focusYard(),
      focusGarden:()=>renderer.focusGarden(),focusSea:()=>{renderer.resetCamera();renderer.camera.radius*=1.4;},focusPlayer:()=>{renderer.resetCamera();renderer.camera.radius*=.55;},
      getInteractionMode:()=>interaction,setInteractionMode:(value:string)=>{interaction=value;renderer.camera.detachControl();renderer.camera.attachControl(true,false,value==='pan'?0:2);G.bus.emit('camera:interaction',{});},
      goHome:()=>{endHousePreview();renderer.setSurface(null);leaveEditing();renderer.resetCamera();},
    },
  });
  visitors=new LiveVisitors(renderer,()=>visitorDocument?visitorVisual:G.state,G.liveAvatars,()=>G.ui.view?.panel==='garden'?'__garden__':houseView.view==='cutaway'&&houseView.floor!=='all'?floorId:null);
  G.livePeers={set:(peers:any[],selfId:string|null,messages:any[])=>visitors.set(peers,selfId,messages),clear:()=>visitors.clear()};
  G.buildingEditor={
    panel:builderPanelContent,selection:selectionTools,hint:hintText,
    yardSnapshot,openYard,
    removeYard:(id:string)=>{if(!yardSnapshot().unlocked)return {ok:false,message:'小屋到Lv.'+G.data.yardConfig.unlockLv+'就能布置院子啦。'};const item=G.state.building.furniture.find((value:any)=>value.id===id);if(!item||!isYardItem(item))return {ok:false,message:'这件庭院家具已经有了新位置，请重新看看。'};const ok=command({type:'entity.remove',id},'收起'+(G.data.furnitureById[item.defId]?.name||'庭院家具'),G.data.furnitureById[item.defId]?.customArt?{}:{[item.defId]:1});return {ok,message:ok?'庭院家具收回背包啦。':'这次还没有收好，原来的家具保留着。'};},
    previewHouse,endHousePreview,buildHouse,
    openFurniture:()=>{endHousePreview();if(!G.state.building.walls.length){G.ui.open('houseBlueprints');toast('先挑一座房子，再搬进喜欢的家具吧。');return;}G.ui.open('decor',{tab:'furniture'});},
    openAdvanced:()=>{endHousePreview();G.ui.open('build',{advanced:true});},
    undo:(options:any={})=>history(!!options.redo),
    beginPlacement:(id:string,spaceId:string|null)=>{
      if(visitorDocument)return {ok:false,message:'朋友的小屋只能看看哦。'};
      if(!(G.state.inventory[id]>0))return {ok:false,message:'这件家具已经摆好啦，先去背包看看。'};
      const def=G.data.furnitureById[id];if(def?.place==='yard'){
        const required=Math.max(G.data.yardConfig.unlockLv,def.unlockLv||1);if(G.state.level<required)return {ok:false,message:'小屋到Lv.'+required+'就能布置这件庭院家具啦。'};
        const opened=openYard({panel:false});if(!opened.ok)return opened;
        floorId=ensureYard();renderer.setDocument(doc(),floorId,true);
        mode='furniture';placement=id;renderer.setPlacement(id);renderer.setMode('furniture');
        houseView={floor:'all',view:'exterior'};renderer.setView('exterior');paint();renderer.focusYard();syncSelection();hint();selectionTools();return {ok:true};
      }
      if(doc().floors.find(f=>f.id===floorId&&isYardFloor(f)))floorId=doc().floors.find(f=>!isYardFloor(f))!.id;
      const room=spaceId?G.contentSpaces.get(spaceId):null;if(room)floorId=room.floorId;
      setMode('furniture');placement=id;renderer.setPlacement(id);syncSelection();hint();selectionTools();return {ok:true};
    },
    cancelPlacement:()=>{placement=null;start=null;mode='select';renderer.setMode('select');renderer.setPlacement(null);renderer.clearPreview();syncSelection();selectionTools();hint();},
    focusFloor,
    focusFurniture:(id:string)=>{const f=doc().furniture.find(v=>v.id===id);if(f){if(isYardItem(f)){const opened=openYard();if(!opened.ok)return opened;const current=G.state.building.furniture.find((item:any)=>item.id===id);if(!current)return {ok:false,message:'这件家具的位置刚刚有了变化，请重新选择。'};floorId=current.floorId;selected={kind:'furniture',id};paint();renderer.select('furniture',id);syncSelection();selectionTools();return {ok:true};}focusFloor(f.floorId);G.ui.open('decor');setMode('select');selected={kind:'furniture',id};renderer.select('furniture',id);renderOptions();selectionTools();}},
    focusWall:(id:string)=>{const w=doc().walls.find(v=>v.id===id);if(w){focusFloor(w.floorId);G.ui.open('build');setMode('select');selected={kind:'wall',id};renderer.select('wall',id);renderOptions();}},
  };
}
function updateCameraInset() {
  if(!renderer)return;
  if(captureDepth){renderer.camera.targetScreenOffset.set(0,0);return;}
  const view=G.runtime.shellLayout?.viewport,rect=$('scene').getBoundingClientRect(),camera=renderer.camera;
  if(!view||!rect.width){camera.targetScreenOffset.x=0;return;}
  renderer.setUsableViewport(view);
  const halfHeight=camera.radius*Math.tan(camera.fov/2);
  if($('scene').dataset.view==='cutaway')camera.targetScreenOffset.y=-(view.y+view.height/2-rect.height/2)/rect.height*2*halfHeight;
  // Babylon以相机空间平移表示屏幕偏移；按真实FOV换算，任何取景重置后都保持在纸面板旁。
  camera.targetScreenOffset.x=(view.x+view.width/2-rect.width/2)/rect.width*2*camera.radius*Math.tan(camera.fov/2)*renderer.engine.getAspectRatio(camera);
}
function installEvents() {
  renderer.scene.onBeforeRenderObservable.add(updateCameraInset);
  document.addEventListener('keydown',e=>{
    if(visitorDocument||(e.target as HTMLElement).closest('input,textarea,select,[contenteditable]')||document.querySelector('.modal-backdrop'))return;
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();const result=history(true);if(result)toast(result.message);return;}
    if(e.key==='Escape'&&!e.defaultPrevented){start=null;renderer.clearPreview();hint();}
    if(editing&&(e.key==='Delete'||e.key==='Backspace')){e.preventDefault();removeSelected();}
  });
  G.bus.on('creative:changed',(event:any)=>{
    if(event.type==='removed'){undoStack=[];redoStack=[];}
    else if(event.buildingBefore&&event.buildingAfter){undoStack.push({before:clone(event.buildingBefore),after:clone(event.buildingAfter),inventory:{},label:event.label||'布置画作'});if(undoStack.length>80)undoStack.shift();redoStack=[];}paint();
  });
  const canvas=$<HTMLCanvasElement>('scene');
  canvas.addEventListener('dragover',e=>{if(!visitorDocument&&Array.from(e.dataTransfer?.types||[]).some(t=>['application/x-marshmallow-item','application/x-marshmallow-furniture','text/plain'].includes(t))){e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='copy';}});
  canvas.addEventListener('drop',e=>{
    if(visitorDocument||!e.dataTransfer)return;
    e.preventDefault();
    const id=e.dataTransfer.getData('application/x-marshmallow-item')||e.dataTransfer.getData('application/x-marshmallow-furniture')||e.dataTransfer.getData('text/plain');
    if(!G.data.furnitureById[id])return;
    const result=G.buildingEditor.beginPlacement(id,null);if(!result.ok){toast(result.message);return;}
    const point=(renderer as any).groundAt(e.clientX,e.clientY);if(point)ground(point);
    G.ui.refresh();
  });
  G.bus.on('state:change',paint);
  G.bus.on('state:replace',()=>{editorEpoch++;undoStack=[];redoStack=[];housePreview=null;G.runtime.houseBlueprintPreviewId=null;leaveEditing();if(buildingPanels.has(G.ui.view?.panel)||G.ui.view?.panel==='houseBlueprints')G.ui.panel.close();paint();});
  G.bus.on('save:error',(e:any)=>toast(e.message));
  G.bus.on('shell:layout',(layout:any)=>{
    const current=G.ui.view?.panel;
    if(housePreview&&current!=='houseBlueprints')endHousePreview();
    if(editing&&!buildingPanels.has(current)&&!G.runtime.placing)leaveEditing();
    syncSurface();
    updateCameraInset();
  });
  let lastTime=Date.now(),sessionSec=0,reminded=false;
  if(!visitorDocument)window.setInterval(()=>{
    const now=Date.now(),elapsed=document.hidden?0:Math.min(30,Math.round((now-lastTime)/1000));lastTime=now;
    if(!elapsed||!G.store.canWrite())return;
    sessionSec+=elapsed;G.store.update((s:any)=>{s.profile.playTimeSec+=elapsed;});
    if(!reminded&&sessionSec>=40*60&&G.state.settings.restReminder){reminded=true;G.ui.modal({title:'糯米的小提醒',content:'小屋会一直在这里等你。休息一下眼睛，看看远方，再喝一口水吧。'});}
  },30000);
  document.addEventListener('visibilitychange',()=>{lastTime=Date.now();if(document.hidden&&!visitorDocument)G.save.flush();});
}
async function loadVisit() {
  const source=document.querySelector<HTMLScriptElement>('script[src*="/releases/"]')?.src;
  const base=source?new URL(source).pathname.split('/releases/')[0]:'';
  const build=source?.match(/\/releases\/([^/]+)/)?.[1]||'';
  const response=await fetch(base+'/api/v1/public-houses/'+visitorId,{headers:{'X-MC-Protocol':'1','X-MC-Build':build},cache:'no-store'});
  if(!response.ok)throw new Error('这座公开小屋暂时无法参观，请回邻居列表再试。');
  const result=await response.json();visitorVisual=result.snapshot||result;visitorDocument=G.publicHouse.readBuilding(result.snapshot||result.house?.snapshot||result);visitorVisual={...visitorVisual,building:visitorDocument};
}
async function boot() {
  G.runtime.reviewMode=review;
  if(visitorId)await loadVisit();
  else {
    if(review)G.data.balance.saveKey+='_free_building_review'+(reviewSlot?'_'+reviewSlot:'');else G.cloud.prepare();
    G.store.init(G.save.load());if(!G.state.building)throw new Error('建筑文档没有准备好，已有存档已保留。');
  }
  floorId=doc().floors[0].id;
  renderer=new BuildingRenderer($<HTMLCanvasElement>('scene'),G.data.furnitureById,{
    onGround:ground,onWall:wallClick,onSelect:choose,onMove:move,onGardenPlot:(index:number)=>G.ui.garden.openPlot(index),onGardenEntry:()=>G.ui.open('garden'),
    onHoverGround:(p:Point2)=>{if(mode==='wall'&&start)renderer.previewWall(start,{x:Math.round(p.x*4)/4,z:Math.round(p.z*4)/4},wallHeight);},
  },G.data);
  installBridges();
  if(visitorDocument){
    renderer.setReadOnly(true);paint();renderer.setView('exterior');renderer.resetCamera();
    $('location-title').textContent='朋友的云上小屋';$('location-copy').textContent='每一个墙角，都藏着朋友的想象。';
    document.querySelectorAll<HTMLElement>('#hud,#quick-nav,#home-paper,#home-paper-toggle,#guide-button,.dock-wrap').forEach(n=>n.hidden=true);
    const livePanel=node('aside','host-room'),liveSlot=node('div','host-room-slot');livePanel.append(liveSlot);document.body.append(livePanel);
    G.ui.liveRoom?.mount(liveSlot,{houseId:visitorId,onMove:(name:string)=>{const live=G.live.status(),self=live.peers.find((p:any)=>p.id===live.peerId);if(!self||live.phase!=='connected')return;const next={...self,x:Math.max(0,Math.min(1,self.x+(name==='left'?-.08:name==='right'?.08:0))),y:Math.max(0,Math.min(1,self.y+(name==='up'?-.08:name==='down'?.08:0)))};const point=G.liveSpace.position(visitorVisual,next),destination=point&&G.liveSpace.destination(visitorVisual,point,point.floorId);if(destination)G.live.move(destination.zone,destination.x,destination.y);},onState:(state:any)=>{if(state.phase==='connected'||state.phase==='reconnecting')visitors.set(state.peers,state.peerId,state.messages);else visitors.clear();}});
    const back=button('回我的小屋',()=>location.assign('../..'),'ui-button ui-button-primary');back.classList.add('free-visit-home');$('world').append(back);
  } else {
    if(G.store.canWrite())G.sys.init();G.ui.init();G.save.init();
    if(!review){G.cloud.init();G.offline?.init();}
    else {const banner=node('span','free-review-banner','独立体验 · 与自己的小屋分开保存');$('world').append(banner);}
    installEvents();renderer.setReadOnly(true);paint();renderer.setView('exterior');renderer.resetCamera();
  }
  document.documentElement.dataset.appReady='true';
}
boot().catch(error=>{
  console.error(error);
  const body=node('div','modal-backdrop'),card=node('section','modal-card');
  card.append(node('h1','','小屋暂时没有准备好'),node('p','',message(error)),node('p','','已有存档仍保留在本机。请保留完整项目文件，重新构建后再试。'));body.append(card);document.body.append(body);
});
