/** 原外观款式的纯装饰配方。数据ID沿用js/data/exterior.js，不持有引擎或游戏状态。 */
import type { ClayGeometry } from './island-environment';
export interface ProfilePoint { x: number; y: number }
export interface RoofBox { minX: number; maxX: number; minZ: number; maxZ: number; top: number; height: number }
  const ink = '#A18480', cream = '#FFF2D5', tau = Math.PI * 2;
  function shade(hex: string, delta: number) { const value = /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#D9B4B7'; return '#' + [1, 3, 5].map(i => Math.max(0, Math.min(255, parseInt(value.slice(i, i + 2), 16) + delta)).toString(16).padStart(2, '0')).join(''); }
  function line(c: CanvasRenderingContext2D, x: number, y: number, xx: number, yy: number, color = ink, width = 2) { c.beginPath(); c.moveTo(x, y); c.lineTo(xx, yy); c.strokeStyle = color; c.lineWidth = width; c.stroke(); }
  function ellipse(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill?: string | null, stroke?: string | null, width = 2) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, tau); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); } }
  function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill?: string | null, stroke?: string | null, width = 2) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); } }
  function polygon(c: CanvasRenderingContext2D, points: number[][], fill?: string | null, stroke?: string | null, width = 2) { c.beginPath(); points.forEach((point, i) => i ? c.lineTo(point[0], point[1]) : c.moveTo(point[0], point[1])); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); } }
  function curve(c: CanvasRenderingContext2D, points: number[], color = ink, width = 2) { c.beginPath(); c.moveTo(points[0], points[1]); c.bezierCurveTo(points[2], points[3], points[4], points[5], points[6], points[7]); c.strokeStyle = color; c.lineWidth = width; c.stroke(); }
  function heart(c: CanvasRenderingContext2D, x: number, y: number, size: number, fill?: string | null, stroke?: string | null) { c.beginPath(); c.moveTo(x, y + size * .7); c.bezierCurveTo(x - size * 1.2, y, x - size * .7, y - size, x, y - size * .3); c.bezierCurveTo(x + size * .7, y - size, x + size * 1.2, y, x, y + size * .7); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1.5; c.stroke(); } }
  function star(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, stroke?: string) { polygon(c, Array.from({ length: 10 }, (_, i) => { const angle = i * Math.PI / 5 - Math.PI / 2, radius = i % 2 ? r * .45 : r; return [x + Math.cos(angle) * radius, y + Math.sin(angle) * radius]; }), color, stroke, 1); }
  function text(c: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, color: string) { c.font = '600 ' + size + 'px "PingFang SC", "Microsoft YaHei", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = color; c.fillText(value, x, y); }
  function wall(c: CanvasRenderingContext2D, { x = -496, y = 0, w = 992, h = 240, exterior = {}, preview = false }: { x?: number; y?: number; w?: number; h?: number; exterior?: { wall?: string; wallColor?: string }; preview?: boolean } = {}) {
    const color = exterior.wallColor || '#FFE3C9', edge = shade(color, -30), style = exterior.wall || 'wall_wood';
    c.save(); rr(c, x, y, w, h, 14); if (!preview && w > 36 && h > 32) c.rect(x + 18, y + 16, w - 36, h - 32); c.clip(preview ? 'nonzero' : 'evenodd');
    c.fillStyle = color; c.fillRect(x, y, w, h); c.lineCap = 'round';
    if (style === 'wall_wood') {
      for (let yy = y + 4, row = 0; yy < y + h; yy += 28, row++) { line(c, x, yy, x + w, yy, edge, 1.5); for (let xx = x + row % 2 * 65; xx < x + w; xx += 130) { line(c, xx, yy, xx, yy + 28, edge, 1); curve(c, [xx + 10, yy + 9, xx + 35, yy + 4, xx + 68, yy + 13, xx + 94, yy + 9], shade(color, -13), 1); } }
    } else if (style === 'wall_brick') {
      for (let yy = y, row = 0; yy < y + h; yy += 25, row++) for (let xx = x - 40 + row % 2 * 40; xx < x + w; xx += 80) rr(c, xx + 2, yy + 2, 76, 21, 3, shade(color, row % 2 ? -3 : 4), edge, 1.4);
    } else if (style === 'wall_stone') {
      for (let yy = y, row = 0; yy < y + h; yy += 43, row++) for (let xx = x - 30 + row % 2 * 40; xx < x + w; xx += 86) { polygon(c, [[xx + 5, yy + 7], [xx + 52, yy + 1], [xx + 80, yy + 16], [xx + 70, yy + 38], [xx + 12, yy + 40], [xx + 1, yy + 23]], shade(color, row % 2 ? -8 : 5), edge, 1.5); }
    } else if (style === 'wall_icing') {
      for (let yy = y; yy < y + h; yy += 38) for (let xx = x - 20; xx < x + w; xx += 60) { curve(c, [xx, yy, xx + 12, yy + 29, xx + 48, yy + 29, xx + 60, yy], shade(color, -18), 2.5); ellipse(c, xx + 29, yy + 13, 3, 4, '#FFF6DC'); }
    } else if (style === 'wall_cookie') {
      for (let yy = y; yy < y + h; yy += 48) for (let xx = x - 20; xx < x + w; xx += 84) { rr(c, xx + 2, yy + 2, 80, 44, 10, shade(color, -4), edge, 1.5); [[14, 14], [46, 12], [68, 31], [26, 32]].forEach(([dx, dy]) => ellipse(c, xx + dx, yy + dy, 2.8, 2.3, shade(color, -55))); }
    } else if (style === 'wall_shell') {
      for (let yy = y, row = 0; yy < y + h; yy += 38, row++) for (let xx = x - 30 + row % 2 * 35; xx < x + w; xx += 70) { c.beginPath(); c.moveTo(xx, yy + 34); c.bezierCurveTo(xx - 30, yy + 3, xx + 30, yy - 14, xx + 35, yy + 10); c.bezierCurveTo(xx + 57, yy - 9, xx + 84, yy + 12, xx + 70, yy + 34); c.closePath(); c.fillStyle = shade(color, row % 2 ? 5 : -5); c.fill(); c.strokeStyle = edge; c.lineWidth = 1.2; c.stroke(); [13, 28, 43, 58].forEach(dx => line(c, xx + 35, yy + 33, xx + dx, yy + 10, shade(color, -18), 1)); }
    } else if (style === 'wall_bamboo') {
      for (let xx = x; xx < x + w; xx += 25) { rr(c, xx + 2, y - 5, 19, h + 10, 8, shade(color, -5), edge, 1); for (let yy = y + xx % 23; yy < y + h; yy += 47) { line(c, xx + 1, yy, xx + 22, yy, edge, 2); line(c, xx + 9, yy + 5, xx + 9, yy + 34, shade(color, 15), 1.5); } }
    } else if (style === 'wall_starry') {
      for (let yy = y + 20, row = 0; yy < y + h; yy += 54, row++) for (let xx = x + 20 + row % 2 * 40; xx < x + w; xx += 80) { star(c, xx, yy, 7, shade(color, 23), edge); line(c, xx + 12, yy + 5, xx + 39, yy + 18, shade(color, -15), 1); ellipse(c, xx + 40, yy + 18, 2, 2, edge); }
    }
    c.restore(); rr(c, x, y, w, h, 14, null, edge, 2.5);
  }

export function paintExteriorWall(context: CanvasRenderingContext2D, style: string, color: string) {
  wall(context, { x: 0, y: 0, w: context.canvas.width, h: context.canvas.height, exterior: { wall: style, wallColor: color }, preview: true });
}

interface ProfilePen {
  beginPath(): void; closePath(): void; moveTo(x: number, y: number): void; lineTo(x: number, y: number): void;
  bezierCurveTo(a: number,b: number,c: number,d: number,e: number,f: number): void;
  quadraticCurveTo(a: number,b: number,c: number,d: number): void;
  ellipse(x: number,y: number,rx: number,ry: number,angle: number,start: number,end: number): void;
}
/** 只记录源装饰曲线；最终网格、法线、材质和拾取均由Babylon创建。 */
class ProfileRecorder implements ProfilePen {
  points: ProfilePoint[] = [];
  beginPath() { this.points = []; }
  closePath() {}
  moveTo(x: number,y: number) { this.points.push({x,y}); }
  lineTo(x: number,y: number) { this.points.push({x,y}); }
  bezierCurveTo(a: number,b: number,c: number,d: number,e: number,f: number) {
    const p = this.points[this.points.length - 1];
    for(let i=1;i<=16;i++) { const t=i/16,u=1-t; this.points.push({x:u*u*u*p.x+3*u*u*t*a+3*u*t*t*c+t*t*t*e,y:u*u*u*p.y+3*u*u*t*b+3*u*t*t*d+t*t*t*f}); }
  }
  quadraticCurveTo(a: number,b: number,c: number,d: number) {
    const p = this.points[this.points.length - 1];
    for(let i=1;i<=12;i++) { const t=i/12,u=1-t; this.points.push({x:u*u*p.x+2*u*t*a+t*t*c,y:u*u*p.y+2*u*t*b+t*t*d}); }
  }
  ellipse(x: number,y: number,rx: number,ry: number,_angle: number,start: number,end: number) {
    for(let i=0;i<48;i++) { const t=start+(end-start)*i/48; this.points.push({x:x+Math.cos(t)*rx,y:y+Math.sin(t)*ry}); }
  }
}
  function roofPath(c: ProfilePen, type: string) {
    c.beginPath();
    if (type === 'roof_round' || type === 'roof_starry') { c.moveTo(-532, 7); c.bezierCurveTo(-510, -197, 510, -197, 532, 7); }
    else if (type === 'roof_castle') { [[-530, 8], [-488, -62], [-470, -62], [-470, -105], [-416, -161], [-362, -105], [-362, -60], [-154, -60], [-154, -110], [-80, -179], [-6, -110], [-6, -60], [303, -60], [303, -105], [366, -158], [429, -105], [429, -60], [486, -60], [530, 8]].forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); }
    else if (type === 'roof_mushroom') { c.moveTo(-535, 3); c.bezierCurveTo(-536, -62, -373, -170, 0, -173); c.bezierCurveTo(373, -170, 536, -62, 535, 3); c.bezierCurveTo(341, 34, -341, 34, -535, 3); }
    else if (type === 'roof_strawberry') { c.moveTo(-530, 6); c.bezierCurveTo(-477, -103, -178, -157, 0, -165); c.bezierCurveTo(178, -157, 477, -103, 530, 6); }
    else if (type === 'roof_cloud') { c.moveTo(-533, 6); c.bezierCurveTo(-586, -54, -494, -125, -406, -91); c.bezierCurveTo(-358, -184, -222, -170, -161, -117); c.bezierCurveTo(-88, -211, 87, -185, 144, -117); c.bezierCurveTo(230, -180, 359, -166, 408, -92); c.bezierCurveTo(497, -115, 588, -47, 532, 6); }
    else if (type === 'roof_oriental') { c.moveTo(-543, -63); c.bezierCurveTo(-415, -42, -306, -101, -67, -145); c.quadraticCurveTo(0, -163, 67, -145); c.bezierCurveTo(306, -101, 415, -42, 543, -63); c.quadraticCurveTo(514, -14, 454, 9); c.lineTo(-454, 9); c.quadraticCurveTo(-514, -14, -543, -63); }
    else { c.moveTo(-534, 8); c.lineTo(-410, -122); c.quadraticCurveTo(-402, -130, -387, -130); c.lineTo(387, -130); c.quadraticCurveTo(402, -130, 410, -122); c.lineTo(534, 8); }
    c.closePath();
  }
  function openingPath(c: ProfilePen, type: string) {
    c.beginPath();
    if (type === 'win_round' || type === 'door_round' || type === 'door_moon') c.ellipse(50, 52, 45, 45, 0, 0, tau);
    else if (type === 'win_heart') { c.moveTo(50, 94); c.bezierCurveTo(-22, 52, 5, -8, 50, 25); c.bezierCurveTo(95, -8, 122, 52, 50, 94); }
    else if (['win_arch', 'door_arch', 'win_stained', 'door_castle'].includes(type)) { c.moveTo(6, 96); c.lineTo(6, 41); if (type === 'win_stained' || type === 'door_castle') { c.quadraticCurveTo(8, 15, 50, 3); c.quadraticCurveTo(92, 15, 94, 41); } else c.bezierCurveTo(6, -8, 94, -8, 94, 41); c.lineTo(94, 96); }
    else { c.moveTo(11, 4); c.lineTo(89, 4); c.quadraticCurveTo(96, 4, 96, 12); c.lineTo(96, 89); c.quadraticCurveTo(96, 97, 89, 97); c.lineTo(11, 97); c.quadraticCurveTo(4, 97, 4, 89); c.lineTo(4, 12); c.quadraticCurveTo(4, 4, 11, 4); }
    c.closePath();
  }

export function roofProfile(style: string): ProfilePoint[] {
  const pen = new ProfileRecorder(); roofPath(pen,style);
  const minX = Math.min(...pen.points.map(p=>p.x)), maxX = Math.max(...pen.points.map(p=>p.x));
  const minY = Math.min(...pen.points.map(p=>p.y)), maxY = Math.max(...pen.points.map(p=>p.y));
  return pen.points.map(p=>({x:(p.x-minX)/(maxX-minX)-.5,y:(maxY-p.y)/(maxY-minY)}));
}
export function openingProfile(style: string): ProfilePoint[] {
  const pen = new ProfileRecorder(); openingPath(pen,style);
  const minX=Math.min(...pen.points.map(p=>p.x)),maxX=Math.max(...pen.points.map(p=>p.x));
  const minY=Math.min(...pen.points.map(p=>p.y)),maxY=Math.max(...pen.points.map(p=>p.y));
  return pen.points.map(p=>({x:(p.x-minX)/(maxX-minX)-.5,y:(maxY-p.y)/(maxY-minY)}));
}
export function roofHeightAt(profile: ProfilePoint[], x: number) {
  let height=0;
  for(let i=0;i<profile.length;i++) {
    const a=profile[i],b=profile[(i+1)%profile.length];
    if(x<Math.min(a.x,b.x)-.00001||x>Math.max(a.x,b.x)+.00001)continue;
    const t=Math.abs(b.x-a.x)<.00001?0:(x-a.x)/(b.x-a.x);
    height=Math.max(height,a.y+(b.y-a.y)*t);
  }
  return height;
}
export function starProfile(): ProfilePoint[] {
  return Array.from({length:10},(_,i)=>{const angle=i*Math.PI/5+Math.PI/2,r=i%2?.45:1;return{x:Math.cos(angle)*r*.5,y:Math.sin(angle)*r*.5+.5};});
}
export function heartProfile(): ProfilePoint[] { return openingProfile('win_heart'); }

/** 用源款式的色彩和纹样装饰屋面；不画固定房型或假门窗。 */
export function paintRoofPattern(c: CanvasRenderingContext2D, style: string, color: string) {
  const size=c.canvas.width; c.save(); c.scale(size/512,c.canvas.height/512); c.fillStyle=color;c.fillRect(0,0,512,512);
  const edge=shade(color,-25);c.lineCap='round';
  if(['roof_triangle','roof_round','roof_oriental'].includes(style)) {
    for(let row=-1;row<9;row++)for(let tile=-1;tile<9;tile++){const x=tile*68+row%2*34,y=row*64;curve(c,[x,y,x-2,y+45,x+66,y+45,x+68,y],edge,3);}
  }else if(style==='roof_mushroom') {
    [[66,83,34,23],[250,40,40,26],[419,126,31,22],[155,264,45,26],[374,330,40,26],[55,465,30,22],[278,495,33,22]].forEach(v=>ellipse(c,v[0],v[1],v[2],v[3],'#FFF0D6',shade(color,-10),2));
  }else if(style==='roof_strawberry') {
    for(let row=0;row<7;row++)for(let i=0;i<7;i++)ellipse(c,i*84+row%2*42,row*84+27,4,8,'#FFE8AE','#D5B279',1);
  }else if(style==='roof_starry') {
    for(let row=0;row<4;row++)for(let i=0;i<5;i++){const x=i*112+row%2*52,y=row*143+25;star(c,x,y,i%2?8:13,'#F6DDA3','#BDA178');line(c,x+17,y+8,x+55,y+24,shade(color,22),1.4);}
    ellipse(c,250,260,40,40,'#FFF1BC');ellipse(c,269,246,38,38,color);
  }else if(style==='roof_castle') {
    for(let row=0;row<9;row++)for(let col=-1;col<8;col++)rr(c,col*78+row%2*39,row*58,73,48,6,shade(color,11),edge,2);
  }else if(style==='roof_cloud') {
    for(let row=0;row<7;row++)for(let col=-1;col<6;col++){const x=col*110+row%2*55,y=row*90;curve(c,[x,y,x+16,y+28,x+45,y+18,x+54,y-3],shade(color,25),5);}
  }
  c.restore();
}

export function paintWallpaper(c: CanvasRenderingContext2D, pattern: 'solid'|'dots'|'stripes', color: string) {
  const size=c.canvas.width;c.fillStyle=color;c.fillRect(0,0,size,c.canvas.height);c.fillStyle=shade(color,22);
  if(pattern==='dots')for(let y=16,row=0;y<size;y+=48,row++)for(let x=16+row%2*24;x<size;x+=48){c.beginPath();c.arc(x,y,6,0,tau);c.fill();}
  if(pattern==='stripes')for(let x=0;x<size;x+=48)c.fillRect(x,0,19,size);
}

export interface ExteriorGeometry extends ClayGeometry {
  profile(points: ProfilePoint[],position:[number,number,number],size:[number,number,number],color:string,rotation?:number[]): unknown;
}
export function addChimney(g: ExteriorGeometry, box: RoofBox, style: string, roof: ProfilePoint[]) {
  if(style==='none')return;
  const width=box.maxX-box.minX,depth=box.maxZ-box.minZ,cx=(box.minX+box.maxX)/2+width*.23,cz=(box.minZ+box.maxZ)/2-depth*.15;
  const cy=box.top+roofHeightAt(roof,.23)*box.height,body=style==='heart'?'#DFA9BC':'#E4C2AD',edge=shade(body,-24);
  g.box([cx,cy+.32,cz],[.34,.64,.36],body,.045);g.box([cx,cy+.68,cz],[.44,.12,.46],shade(body,17),.035);g.box([cx,cy+.745,cz],[.28,.02,.3],'#8D6F6B',.018);
  for(let row=0;row<3;row++) {g.box([cx,cy+.13+row*.17,cz+.183],[.33,.018,.012],edge,.004);g.box([cx+(row%2?.08:-.065),cy+.2+row*.17,cz+.183],[.013,.15,.013],edge,.004);}
  if(style==='heart')for(let i=0;i<3;i++)g.profile(heartProfile(),[cx+i*.07,cy+.84+i*.23,cz],[.16+i*.04,.15+i*.04,.08],'#F4C4D2');
  else for(let i=0;i<3;i++)g.sphere([cx+i*.08,cy+.89+i*.22,cz],[.12+i*.03,.07+i*.025,.09+i*.02],'#FFF8EB',10,6);
}

export function addRoofDetails(g: ExteriorGeometry, box: RoofBox, style: string, color: string, profile: ProfilePoint[]) {
  const width=box.maxX-box.minX,depth=box.maxZ-box.minZ,x=(box.minX+box.maxX)/2,z=(box.minZ+box.maxZ)/2;
  const at=(u:number,v:number,raise=.03):[number,number,number]=>[x+u*width,box.top+roofHeightAt(profile,u)*box.height+raise,z+v*depth];
  const dark=shade(color,-25),pale=shade(color,23);
  // 原外观在蘑菇和云朵屋檐上有整排圆珠；其余保留柔圆厚檐。
  for(const end of [-1,1]) {
    if(style==='roof_mushroom'||style==='roof_cloud')for(let u=-.47;u<.49;u+=.07)g.sphere([x+u*width,box.top+.035,z+end*depth/2],[Math.min(.2,width*.04),.08,.1],pale,10,6);
    else g.box([x,box.top+.025,z+end*depth/2],[width+.06,.12,.12],'#FFF2D5',.05);
  }
  for(const side of [-1,1])g.box([x+side*width/2,box.top+.02,z],[.13,.13,depth+.08],'#FFF2D5',.05);
  if(style==='roof_strawberry') {
    for(let i=-2;i<=2;i++)g.sphere(at(i*.028,0,.1),[width*.12,.045,.18],i%2?'#A9C39B':'#B7CDA7',12,6);
    g.cylinder(at(0,0,.23),.045,.26,'#88A580',.032,8,[0,0,-.24]);
  }else if(style==='roof_castle') {
    for(const u of [-.393,-.075,.346]) {
      const p=at(u,-.33,.13);g.cylinder(p,.018,.31,'#B79A78',undefined,8);
      g.profile([{x:-.5,y:0},{x:-.5,y:1},{x:.5,y:.5}],[p[0]+.1,p[1]+.055,p[2]],[.22,.15,.025],'#EBCB91');
    }
    for(const end of [-1,1])for(const u of [-.393,-.075,.346])g.box([x+u*width,box.top+box.height*.51,z+end*(depth/2+.018)],[.16,.22,.035],'#FFF0CE',.07);
  }else if(style==='roof_starry') {
    for(const u of [-.34,-.13,.17,.35])g.profile(starProfile(),at(u,.28,.055),[.18,.18,.03],'#F6DDA3',[Math.PI/2,0,0]);
  }else if(style==='roof_oriental') {
    for(const side of [-1,1])for(const end of [-1,1])g.sphere([x+side*width*.48,box.top+roofHeightAt(profile,side*.48)*box.height+.055,z+end*depth/2],[.1,.1,.1],dark,12,6);
    g.cylinder(at(0,0,.06),.065,depth+.1,dark,undefined,12,[Math.PI/2,0,0]);
  }
}

export interface OpeningDetails {
  x: number; sill: number; width: number; height: number; depth: number; faceZ: number; outward: number;
  kind: 'window' | 'door'; style: string;
}
export function profileSpanAtY(profile: ProfilePoint[], y: number): [number, number] {
  const hits: number[] = [];
  profile.forEach((a,i)=> { const b=profile[(i+1)%profile.length]; if((a.y>y)!==(b.y>y))hits.push(a.x+(y-a.y)*(b.x-a.x)/(b.y-a.y)); });
  return hits.length ? [Math.min(...hits),Math.max(...hits)] : [0,0];
}
export function addOpeningDetails(g: ExteriorGeometry, spec: OpeningDetails) {
  const {x,sill,width:w,height:h,faceZ:z,outward,depth,kind,style}=spec,profile=openingProfile(style);
  const isDoor=kind==='door', cream='#FFF2D5', trim=style==='door_cake'?'#DCA9B7':style==='door_moon'?'#B6C3D5':style==='door_castle'?'#C9BCCB':'#D7B794';
  const tone=isDoor?trim:cream;
  // 轮廓只形成边框；不从旧2D门板复制任何填充面，真实门洞始终通透。
  for(const face of [-1,1])for(let i=0;i<profile.length;i++) {
    const a=profile[i],b=profile[(i+1)%profile.length];
    if(isDoor&&Math.max(a.y,b.y)<.055)continue;
    const ax=x+a.x*w,ay=sill+a.y*h,bx=x+b.x*w,by=sill+b.y*h;
    g.box([(ax+bx)/2,(ay+by)/2,face*(depth/2+.018)],[Math.hypot(bx-ax,by-ay)+.025,.065,.075],tone,.025,[0,0,Math.atan2(by-ay,bx-ax)]);
  }
  if(!isDoor) {
    const middle=style==='win_arch'?.54:.5,span=profileSpanAtY(profile,middle);
    g.box([x,sill+h*.49,z],[.032,h*.88,.032],'#BEA58C',.012);
    g.box([x+(span[0]+span[1])*w/2,sill+h*middle,z],[(span[1]-span[0])*w,.032,.032],'#BEA58C',.012);
    if(style==='win_stained')g.profile(starProfile(),[x,sill+h*.49,z+outward*.025],[w*.23,h*.22,.025],'#F6DF9F');
    if(style==='win_lace') {
      for(let i=0;i<10;i++)for(const y of [sill,sill+h])g.sphere([x-w*.47+i*w*.105,y,z],[w*.055,h*.045,.045],'#F5E4DF',10,6);
      for(const side of [-1,1])g.profile([{x:-.5,y:0},{x:.5,y:.16},{x:.28,y:1},{x:-.5,y:1}],[x+side*w*.41,sill+h*.23,z],[w*.18,h*.74,.04],'#E7BCC7',side<0?undefined:[0,Math.PI,0]);
    }
    if(style!=='win_round'&&style!=='win_heart')g.box([x,sill-.018,z],[w+.1,.08,.18],'#DEC5A7',.028);
    return;
  }
  if(style==='door_castle') {
    for(const side of [-1,1]) {
      g.box([x+side*(w/2+.045),sill+h*.38,z],[.13,h*.75,.13],'#D4C7CE',.025);
      g.profile([{x:-.5,y:0},{x:0,y:1},{x:.5,y:0}],[x+side*(w/2+.045),sill+h*.76,z],[.21,h*.17,.13],'#C1ADC7');
      g.sphere([x+side*(w/2-.035),sill+h*.43,z+outward*.055],[.032,.045,.025],'#A0866D',10,6);
      for(let row=1;row<5;row++)g.box([x+side*(w/2+.046),sill+row*h*.15,z+outward*.07],[.13,.014,.012],'#AB9AA9',.004);
    }
  }else if(style==='door_cake') {
    g.box([x,sill+h+.015,z],[w+.1,.12,.12],cream,.045);
    for(let i=0;i<5;i++)g.sphere([x+(i-2)*w*.19,sill+h-(i%2?.075:.025),z+outward*.035],[w*.095,h*.055,.07],cream,10,6);
    g.sphere([x,sill+h+.14,z],[.085,.075,.07],'#D995AA',12,8);
    g.sphere([x+.055,sill+h+.205,z],[.09,.025,.035],'#A7C49C',10,6);
    for(const side of [-1,1])g.profile(heartProfile(),[x+side*(w/2+.065),sill+h*.42,z],[.13,.13,.035],'#F2CDCE');
  }else if(style==='door_moon') {
    // 月亮镂空在门楣上，不以底色圆片覆盖通透门洞。
    const crescent:ProfilePoint[]=[];
    for(let i=0;i<=20;i++){const a=Math.PI*.35+i/20*Math.PI*1.3;crescent.push({x:Math.cos(a)*.5,y:Math.sin(a)*.5+.5});}
    for(let i=20;i>=0;i--){const a=Math.PI*.35+i/20*Math.PI*1.3;crescent.push({x:Math.cos(a)*.38+.14,y:Math.sin(a)*.45+.5});}
    g.profile(crescent,[x,sill+h+.06,z],[.31,.31,.045],'#FFF0BA');
    for(const side of [-1,1])g.profile(starProfile(),[x+side*w*.5,sill+h*.72,z],[.12,.12,.04],'#FFF0BA');
  }else {
    // 木门的板缝移到门侧实心门框，拱门/圆门仍保持各自源轮廓。
    for(const side of [-1,1])for(const shift of [-.025,.025])g.box([x+side*(w/2+.018)+shift,sill+h*.46,z],[.012,h*.78,.018],'#B69679',.004);
    g.box([x,sill+h+.09,z],[Math.min(.5,w*.62),.17,.065],'#DDE6D5',.055);
    g.box([x,sill+h+.09,z+outward*.04],[.018,.13,.018],'#B5967C',.005);
    g.box([x,sill+h+.09,z+outward*.04],[Math.min(.44,w*.54),.018,.018],'#B5967C',.005);
  }
  if(style!=='door_castle')g.sphere([x+w/2-.02,sill+h*.38,z+outward*.055],[.036,.036,.036],'#E4C88D',10,6);
  g.box([x,sill+.008,0],[w,.016,depth+.12],'#D8B895',.008);
}
