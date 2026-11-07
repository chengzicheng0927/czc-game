'use strict';
// 仅合成内存作品与原creative绘图/下载系统；真实PNG编码，不读取scene或私人存档。
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createCanvas,loadImage}=require(process.env.CREATIVE_CANVAS_MODULE || '@napi-rs/canvas');
const root=path.resolve(__dirname,'..'),events=[],downloads=[],canvases=[];
const document={addEventListener(){},createElement(tag){assert.equal(tag,'canvas');const canvas=createCanvas(1,1);canvases.push(canvas);return canvas;}};
const context=vm.createContext({console,document,Blob,URL,atob,setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){}});context.window=context;context.addEventListener=()=>{};context.localStorage={getItem:()=>null,setItem(){}};
for(const file of ['js/core/namespace.js','js/data/balance.js','js/data/content.js','js/data/furniture-expansion.js','js/data/residents-expansion.js','js/data/progression.js','js/data/achievements.js','js/data/garden.js','js/data/calendar.js','js/data/outfits.js','js/data/exterior.js','js/data/yard.js','js/data/minigames.js','js/data/creative.js','js/core/utils.js','js/core/bus.js','js/core/store.js','js/core/save.js','js/systems/systems.js','js/systems/creative.js','js/render/creative.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
const G=context.Game,C=G.data.creativeConfig;G.store.init();G.sys.init();G.store.update(s=>{s.level=7;s.wallet.coin=10000;});assert.ok(G.sys.building.buildRoom(0,0,'studio').ok);
G.utils.download=(name,bytes,type)=>{downloads.push({name,bytes:Buffer.from(bytes),type});return true;};G.bus.on('creative:changed',event=>events.push(event));
(async()=>{
  const pixels=C.symbols+'.'.repeat(256-C.symbols.length),saved=G.sys.creative.save({name:'合成24色透明验收',pixels});assert.ok(saved.ok,saved.message);
  G.runtime.creativeDrafts={['art:'+saved.art.id]:{id:saved.art.id,name:'不应下载的草稿',pixels:'0'.repeat(256)}};
  const before=JSON.stringify(G.state),eventCount=events.length;assert.ok((await G.sys.creative.download(saved.art.id)).ok);assert.equal(downloads.length,1);assert.equal(downloads[0].type,'image/png');assert.equal(JSON.stringify(G.state),before);assert.equal(events.length,eventCount);
  const image=await loadImage(downloads[0].bytes);assert.equal(image.width,512);assert.equal(image.height,512);const canvas=createCanvas(512,512),c=canvas.getContext('2d');c.drawImage(image,0,0);const rgba=c.getImageData(0,0,512,512).data;
  let transparent=0,opaque=0;
  for(let y=0;y<512;y++)for(let x=0;x<512;x++){
    const cell=Math.floor(y/32)*16+Math.floor(x/32),offset=(y*512+x)*4;
    if(cell>=24){assert.equal(rgba[offset+3],0);transparent++;}
    else{const hex=C.palette[cell].replace('#',''),expected=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));assert.deepEqual(Array.from(rgba.slice(offset,offset+3)),expected);assert.equal(rgba[offset+3],255);opaque++;}
  }
  assert.equal(opaque,24*32*32);assert.equal(transparent,232*32*32);assert.equal(rgba[(16*512+6*32+16)*4+3],255,'雪白必须不透明');
  const output=path.join(__dirname,'creative-visual-ui-export.png');fs.writeFileSync(output,downloads[0].bytes);
  const target=createCanvas(512,512),tc=target.getContext('2d');tc.imageSmoothingEnabled=true;G.draw.creative.drawPixels(tc,saved.art.pixels,0,0,512,512);assert.equal(tc.imageSmoothingEnabled,true,'绘图恢复调用者状态');assert.deepEqual(Buffer.from(tc.getImageData(0,0,512,512).data),Buffer.from(rgba));
  assert.equal((await G.sys.creative.download('missing')).ok,false);assert.equal(downloads.length,1);
  console.log('✓ 原download已存ID → 512×512真实PNG，草稿不混入');
  console.log('✓ 全262144像素核对：24色精确且无平滑、232格透明、雪白不透明，无相框/网格/光标');
  console.log('✓ 下载不改存档/事件、未知ID拒绝、drawPixels恢复调用者状态');
  console.log('3 组隔离PNG检查通过；证据：'+output+'（合成色表，不代表正式场景/浏览器下载/触屏）。');
})().catch(error=>{console.error(error);process.exitCode=1;});
