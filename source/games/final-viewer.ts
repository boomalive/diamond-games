import type {Group,PerspectiveCamera,Quaternion,Vector3,WebGLRenderer} from 'three';
import type {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
type Runtime={ready:boolean;error?:string;camera:PerspectiveCamera;renderer:WebGLRenderer;controls:OrbitControls;rotationRoot:Group;advanceRotation?:(delta:number)=>void;resume:()=>void;pause:()=>void;render:()=>void};
const runtime=window as unknown as {ringViewer?:Runtime};
let active=true,pausedAt=0;
let api:Runtime|null=null;
let homePosition:Vector3,homeTarget:Vector3,homeUp:Vector3,homeZoom=1;
let rotationAxis:Vector3,baseRotation:Quaternion,turnRotation:Quaternion,rotationPhase=0;
let returnAt:number|null=null;
const RETURN_DELAY=2000;
let returning:{start:number;direction:Vector3;distance:number;target:Vector3;up:Vector3;zoom:number;turn:Quaternion}|null=null;
const host=document.getElementById('viewer')!;
function state(value:string){host.dataset.motion=value;}
function applyRotation(){
 if(api&&baseRotation)api.rotationRoot.quaternion.copy(baseRotation).premultiply(turnRotation.setFromAxisAngle(rotationAxis,rotationPhase));
}
function beginReturn(){
 if(!api)return;
 returnAt=null;
 const {camera,controls}=api,position=camera.position.clone(),target=controls.target.clone();
 controls.enableDamping=false;controls.update();camera.position.copy(position);controls.target.copy(target);controls.update();
 const direction=position.clone().sub(target).normalize(),destination=homePosition.clone().sub(homeTarget).normalize();
 returning={start:performance.now(),direction,distance:position.distanceTo(target),target,up:camera.up.clone(),zoom:camera.zoom,turn:camera.quaternion.clone().setFromUnitVectors(direction,destination)};
 api.resume();state('returning');
}
function scheduleReturn(){
 if(!api)return;
 returning=null;returnAt=performance.now()+RETURN_DELAY;
 api.pause();state('waiting');
}
function initialize(){
 const viewer=runtime.ringViewer;
 if(!viewer?.ready){if(!viewer?.error)requestAnimationFrame(initialize);return;}
 api=viewer;viewer.rotationRoot.scale.multiplyScalar(1.055);viewer.rotationRoot.rotation.set(0,1.25,0);
 viewer.camera.updateMatrixWorld();
 // Use the camera's actual screen-up direction, rather than the model's tilted Y axis.
 rotationAxis=viewer.camera.position.clone().setFromMatrixColumn(viewer.camera.matrixWorld,1).normalize();
 baseRotation=viewer.rotationRoot.quaternion.clone();turnRotation=baseRotation.clone().identity();
 viewer.advanceRotation=delta=>{rotationPhase+=delta*Math.PI*2/16;applyRotation();};
 homePosition=viewer.camera.position.clone();homeTarget=viewer.controls.target.clone();homeUp=viewer.camera.up.clone();homeZoom=viewer.camera.zoom;
 viewer.controls.enableZoom=false;
 viewer.controls.addEventListener('start',()=>{returnAt=null;returning=null;viewer.controls.enableDamping=true;state('manual');});
 viewer.controls.addEventListener('end',scheduleReturn);
 viewer.renderer.domElement.addEventListener('keydown',event=>{
  if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;
  event.preventDefault();event.stopImmediatePropagation();rotationPhase+=event.key==='ArrowLeft'?-.12:.12;applyRotation();viewer.render();
 },true);
 if(!active)viewer.pause();
 state('auto');
 window.parent.postMessage({scope:'diamond-final',type:'ready'},'*');
 requestAnimationFrame(tick);
}
function tick(now:number){
 if(api&&active&&!document.hidden&&returnAt!==null&&now>=returnAt)beginReturn();
 if(api&&active&&!document.hidden&&returning){
  const t=Math.max(0,Math.min(1,(now-returning.start)/1100)),u=t*t*t*(t*(t*6-15)+10);
  const {camera,controls}=api,turn=returning.turn.clone().identity().slerp(returning.turn,u);
  controls.target.copy(returning.target).lerp(homeTarget,u);
  camera.position.copy(returning.direction).applyQuaternion(turn).multiplyScalar(returning.distance+(homePosition.distanceTo(homeTarget)-returning.distance)*u).add(controls.target);
  camera.up.copy(returning.up).lerp(homeUp,u).normalize();camera.zoom=returning.zoom+(homeZoom-returning.zoom)*u;camera.updateProjectionMatrix();controls.update();api.render();
  if(t===1){returning=null;controls.enableDamping=true;state('auto');}
 }
 requestAnimationFrame(tick);
}
function snapshot(){
 if(!api)return;
 try{
  const {renderer}=api,width=host.clientWidth,height=host.clientHeight,ratio=renderer.getPixelRatio();
  const canvas=document.createElement('canvas');canvas.width=1500;canvas.height=Math.round(1500*height/width);
  renderer.setPixelRatio(1);renderer.setSize(canvas.width,canvas.height,false);api.render();
  const context=canvas.getContext('2d')!;context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(renderer.domElement,0,0);
  renderer.setPixelRatio(ratio);renderer.setSize(width,height,false);api.render();
  canvas.toBlob(blob=>{window.parent.postMessage({scope:'diamond-final',type:blob?'snapshot':'snapshot-error',blob},'*');},'image/png');
 }catch{window.parent.postMessage({scope:'diamond-final',type:'snapshot-error'},'*');}
}
window.addEventListener('message',event=>{
 if(event.source!==window.parent||event.data?.scope!=='diamond-final')return;
 if(event.data.type==='snapshot')snapshot();
 if(event.data.type==='active'&&active!==!!event.data.active){
  active=!!event.data.active;
  if(!active){pausedAt=performance.now();api?.pause();}
  else{
   const pausedFor=performance.now()-pausedAt;
   if(returnAt!==null)returnAt+=pausedFor;
   if(returning)returning.start+=pausedFor;
   if(returning||host.dataset.motion==='auto')api?.resume();
  }
 }
});
Object.assign(window,{diamondFinalMotion:{getState:()=>({active,motion:host.dataset.motion,home:homePosition?.toArray(),target:homeTarget?.toArray(),axis:rotationAxis?.toArray(),phase:rotationPhase}),returnToPath:beginReturn,setRotationPhase:(phase:number)=>{if(Number.isFinite(phase)){rotationPhase=phase;applyRotation();api?.render();}}}});
initialize();
