import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { BuildingRenderer } from '../building/renderer';
import { buildStaticAvatar, avatarVertexShader, avatarFragmentShader } from './avatar-model';

// 同屋人物是内存视觉层，复用主Engine、原人物工厂和纯名牌规则；不读写任何私人存档。
export class LiveVisitors {
  private actors=new Map<string,{mesh:Mesh;label:HTMLDivElement;bubble:HTMLSpanElement;peer:any;target:Vector3;look:string;floorId:string}>();
  private messages=new Map<string,any>();
  private marks:Record<string,any>={};
  private overlay:HTMLDivElement;
  private material:ShaderMaterial;
  private selfId:string|null=null;
  constructor(private renderer:BuildingRenderer,private visualState:()=>any,private helpers:any,private visibleFloor:()=>string|null=()=>null) {
    this.overlay=document.createElement('div');this.overlay.className='free-live-labels';this.overlay.setAttribute('aria-hidden','true');renderer.canvas.parentElement!.append(this.overlay);
    this.material=new ShaderMaterial('original-live-avatars',renderer.scene,{vertexSource:avatarVertexShader,fragmentSource:avatarFragmentShader},{attributes:['position','normal','color'],uniforms:['world','worldViewProjection','uEye']});
    this.material.backFaceCulling=false;
    renderer.scene.onBeforeRenderObservable.add(()=>this.frame());
  }
  set(peers:any[],selfId:string|null,messages:any[]) {
    this.selfId=selfId;const list=(Array.isArray(peers)?peers:[]).filter(p=>p&&typeof p.id==='string').slice(0,8),keep=new Set<string>();
    this.marks=this.helpers.markers(list);this.helpers.syncBubbles(this.messages,messages,performance.now());
    for(const peer of list){
      const point=window.Game.liveSpace?.position(this.visualState(),peer);if(!point)continue;keep.add(peer.id);
      let actor=this.actors.get(peer.id);const look=JSON.stringify(peer.avatar);
      if(actor&&actor.look!==look){actor.mesh.dispose();actor.label.remove();this.actors.delete(peer.id);actor=undefined;}
      const target=new Vector3(point.x,point.y,point.z);
      if(!actor){
        const mesh=new Mesh('live-peer-'+peer.id,this.renderer.scene),data=buildStaticAvatar(peer.avatar,.72);
        const positions:number[]=[],normals:number[]=[],colors:number[]=[],indices:number[]=[];
        for(let offset=0;offset<data.length;offset+=9){positions.push(data[offset],data[offset+1],data[offset+2]);normals.push(data[offset+3],data[offset+4],data[offset+5]);colors.push(data[offset+6],data[offset+7],data[offset+8],1);indices.push(indices.length);}
        const vertices=new VertexData();Object.assign(vertices,{positions,normals,colors,indices});vertices.applyToMesh(mesh);mesh.material=this.material;mesh.isPickable=false;mesh.position.copyFrom(target);
        const label=document.createElement('div');label.className='free-peer-label';const name=document.createElement('strong');const bubble=document.createElement('span');bubble.className='free-peer-bubble';label.append(name,bubble);this.overlay.append(label);
        actor={mesh,label,bubble,peer,target,look,floorId:point.floorId};this.actors.set(peer.id,actor);
      }
      actor.peer=peer;actor.target=target;actor.floorId=point.floorId;
      const mark=this.marks[peer.id];actor.label.style.setProperty('--peer-paper',mark.tone[0]);actor.label.style.setProperty('--peer-ink',mark.tone[1]);
      actor.label.querySelector('strong')!.textContent=String(peer.displayName||'小小建筑师')+(peer.id===this.selfId?' · 我':peer.isHost?' · 主人':'');
    }
    for(const [id,actor]of this.actors)if(!keep.has(id)){actor.mesh.dispose();actor.label.remove();this.actors.delete(id);this.messages.delete(id);}
  }
  clear() {for(const actor of this.actors.values()){actor.mesh.dispose();actor.label.remove();}this.actors.clear();this.messages.clear();this.selfId=null;}
  private frame() {
    this.material.setVector3('uEye',this.renderer.camera.globalPosition);
    const dt=Math.min(.1,this.renderer.engine.getDeltaTime()/1000),rect=this.renderer.canvas.getBoundingClientRect();
    const now=performance.now(),projected:{actor:any;x:number;y:number}[]=[];
    for(const [id,actor]of this.actors){
      const floor=this.visibleFloor(),visible=!floor||floor===actor.floorId;actor.mesh.setEnabled(visible);if(!visible){actor.label.hidden=true;continue;}
      const delta=actor.target.subtract(actor.mesh.position),distance=delta.length();
      if(distance>.002){actor.mesh.position.addInPlace(delta.scale(Math.min(1,dt*6)));if(Math.hypot(delta.x,delta.z)>.015)actor.mesh.rotation.y=Math.atan2(-delta.x,-delta.z);}
      const position=Vector3.Project(actor.mesh.position.add(new Vector3(0,1.5,0)),Matrix.Identity(),this.renderer.scene.getTransformMatrix(),this.renderer.camera.viewport.toGlobal(this.renderer.engine.getRenderWidth(),this.renderer.engine.getRenderHeight()));
      const x=position.x/this.renderer.engine.getRenderWidth()*rect.width,y=position.y/this.renderer.engine.getRenderHeight()*rect.height;
      actor.label.hidden=position.z<0||position.z>1||x<0||x>rect.width||y<0||y>rect.height;
      const text=this.helpers.activeBubble(this.messages,id,now);actor.bubble.textContent=text;actor.bubble.hidden=!text;
      if(!actor.label.hidden)projected.push({actor,x,y});
    }
    const used:{x:number;y:number;width:number;height:number}[]=[];
    // 沿用靠前的人先占位：相邻的名牌和发言向上错开，保留原六秒气泡时效。
    projected.sort((a,b)=>b.y-a.y).forEach(({actor,x,y})=>{
      const width=actor.label.offsetWidth||140,height=actor.label.offsetHeight||30;
      let top=y-height;
      for(let pass=0;pass<8;pass++){const overlap=used.find(box=>Math.abs(box.x-x)<(box.width+width)/2+8&&top<box.y+box.height+8&&top+height>box.y-8);if(!overlap)break;top=overlap.y-height-8;}
      actor.label.style.left=x+'px';actor.label.style.top=Math.max(5,top)+'px';used.push({x,y:top,width,height});
    });
  }
}
