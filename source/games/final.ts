export {};
type Ring={id:string;url:string;cut:string;mount:string};
const catalog=JSON.parse(document.getElementById('final-catalog')!.textContent!) as Ring[];
const initial=new URLSearchParams(window.location.search).get('ring');
let ringId=catalog.find(r=>r.id===initial)?.id??'LR0211OV01';
let modelFrame:HTMLIFrameElement|null=null,active=true,ready=false;
let scrollProgress=0,scrollFrame=0;
const area=document.getElementById('final-model-area')!;
const download=document.getElementById('download-ring') as HTMLButtonElement;
const status=document.getElementById('save-status')!;
function updateScroll(){
 scrollFrame=0;
 const progress=Math.max(0,Math.min(1,window.scrollY/279));
 scrollProgress=progress*progress*(3-2*progress);
 area.style.setProperty('--model-scale',String(1-.6*scrollProgress));
 area.style.setProperty('--model-offset',`${-93*scrollProgress}px`);
 document.getElementById('final-page')!.dataset.scrollProgress=String(progress);
}
function scheduleScroll(){if(!scrollFrame)scrollFrame=requestAnimationFrame(updateScroll);}
window.addEventListener('scroll',scheduleScroll,{passive:true});
window.addEventListener('resize',scheduleScroll);
function tellActive(){modelFrame?.contentWindow?.postMessage({scope:'diamond-final',type:'active',active},'*');}
function setRing(id:string){
 const ring=catalog.find(r=>r.id===id);if(!ring||modelFrame&&ringId===id)return;
 ringId=id;ready=false;download.disabled=true;area.setAttribute('aria-busy','true');
 document.getElementById('final-cut')!.textContent=ring.cut;document.getElementById('final-mount')!.textContent=ring.mount;
 const next=document.createElement('iframe');next.id='final-model';next.title=`Готовое кольцо · ${ringId}`;next.src=new URL(ring.url,document.baseURI).href;
 const previous=modelFrame;modelFrame=next;previous?.remove();area.replaceChildren(next);next.addEventListener('load',tellActive);
 document.getElementById('final-page')!.dataset.ring=ringId;
 window.parent.postMessage({scope:'lavivion-suite',type:'final-ui-state',ringId},'*');
}
window.addEventListener('message',event=>{
 const data=event.data;
 if(modelFrame&&event.source===modelFrame.contentWindow&&data?.scope==='diamond-final'){
  if(data.type==='ready'){ready=true;download.disabled=false;area.setAttribute('aria-busy','false');tellActive();}
  if(data.type==='snapshot'&&data.blob instanceof Blob){const url=URL.createObjectURL(data.blob),link=document.createElement('a');link.href=url;link.download=`ring-${ringId}.png`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);download.disabled=!ready;}
  if(data.type==='snapshot-error'){status.textContent='Не получилось сохранить фото. Попробуй ещё раз.';download.disabled=!ready;}
  return;
 }
 if(event.source!==window.parent||data?.scope!=='lavivion-suite')return;
 if(data.type==='final-ring')setRing(data.ringId);
 if(data.type==='active'){active=!!data.active;tellActive();}
});
download.addEventListener('click',()=>{if(ready){download.disabled=true;status.textContent='';modelFrame?.contentWindow?.postMessage({scope:'diamond-final',type:'snapshot'},'*');}});
document.getElementById('save-form')!.addEventListener('submit',event=>{event.preventDefault();status.textContent='В демоверсии письмо не отправляется. Можно скачать фото кольца.';});
document.getElementById('final-back')!.addEventListener('click',()=>window.parent.postMessage({scope:'lavivion-suite',type:'go',game:'setting'},'*'));
Object.assign(window,{diamondFinalUI:{setRing,getState:()=>({ringId,ready,active,scrollProgress})}});
setRing(ringId);updateScroll();
