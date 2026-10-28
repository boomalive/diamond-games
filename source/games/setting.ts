export {};
type ViewState = 'start' | 'progress' | 'complete';
type Ring = {id: string; label: string; module: string; previousModule?: string};
const rings = JSON.parse(document.getElementById('setting-rings')!.textContent!) as Ring[];
const game = document.getElementById('setting-game')!;
const area = document.getElementById('setting-play-area')!;
const initialRing=new URLSearchParams(window.location.search).get('ring');
let variant=new URLSearchParams(window.location.search).get('variant')==='previous'?'previous':'new';
let ringId = rings.find(ring=>ring.id===initialRing)?.id ?? rings[0].id;
let ringFrame: HTMLIFrameElement | null = null;
let state: ViewState = 'start';
let phase = 'loading';
let progress = 0;
let frame = 0;
let retry = false;
let failed = false;

function notify() {
  window.parent.postMessage({scope:'lavivion-suite',type:'setting-ui-state',ringId,state,phase,progress,frame,variant,supportsVariants:!!rings.find(ring=>ring.id===ringId)?.previousModule},'*');
}
function copy(id: string, text: string) {
  const element=document.getElementById(id)!;
  if(element.textContent!==text)element.textContent=text;
}
function render(nextState: ViewState, value: number) {
  state=nextState;progress=Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;
  game.dataset.state=state;game.dataset.phase=phase;game.dataset.progress=String(progress);
  game.dataset.ring=ringId;game.dataset.frame=String(frame);game.dataset.ready=String(phase!=='loading'&&phase!=='error');
  game.dataset.variant=variant;
  area.dataset.ring=ringId;area.setAttribute('aria-busy',String(phase==='loading'));
  copy('setting-title',state==='complete'?'Идеально! Бриллиант\nна своем месте':'А теперь работа ювелира —\nвставьте бриллиант в оправу');
  document.getElementById('setting-description')!.hidden=state==='complete';
  document.getElementById('setting-prompt')!.hidden=state==='complete';
  const hint=failed?'Не удалось загрузить кольцо.':retry?'Попробуйте ещё раз':state==='start'?'Удерживая бриллиант,\nперетащите его в оправу':'Еще немного…';
  copy('setting-prompt',hint);
  const bar=document.getElementById('setting-progress')!;
  bar.hidden=state==='complete';bar.setAttribute('aria-valuenow',String(Math.round(progress*100)));
  document.getElementById('setting-progress-fill')!.style.width=`${progress*255}px`;
  document.getElementById('setting-next')!.hidden=state!=='complete';
  copy('setting-announcement',state==='complete'?'Идеально! Бриллиант на своем месте.':hint.replace('\n',' '));
  notify();
}
function setRing(id: string, force = false) {
  const ring=rings.find(item=>item.id===id);
  if(!ring)return false;
  if(ringId===id&&ringFrame&&!force)return true;
  ringId=id;phase='loading';frame=0;retry=false;failed=false;
  const previous=ringFrame;
  const next=document.createElement('iframe');
  ringFrame=next;
  previous?.remove();
  next.id='ring-game';next.className='ring-frame';next.title=`Установка бриллианта · ${ring.label}`;
  next.width='375';next.height='340';
  const moduleURL=new URL(variant==='previous'&&ring.previousModule?ring.previousModule:ring.module,document.baseURI);
  const hostRevision=new URL(document.baseURI).searchParams.get('v');
  if(hostRevision)moduleURL.searchParams.set('host',hostRevision);
  next.src=moduleURL.href;
  next.addEventListener('error',()=>{if(ringFrame===next){phase='error';failed=true;render('start',0);}});
  area.replaceChildren(next);
  render('start',0);
  window.dispatchEvent(new CustomEvent('lavivion:ring-selected',{detail:{ringId}}));
  return true;
}
function reset() {
  // Recreate the selected iframe, including under file:// origin restrictions.
  setRing(ringId,true);
}
function setVariant(value:string){
  if(value!=='previous'&&value!=='new'||value===variant)return;
  variant=value;setRing(ringId,true);
}
window.addEventListener('message',event=>{
  const data=event.data;
  if(ringFrame&&event.source===ringFrame.contentWindow){
    if(!data||data.product!==ringId||typeof data.type!=='string'||data.type.indexOf('ring-setting:')!==0)return;
    if(typeof data.phase==='string')phase=data.phase;
    if(Number.isFinite(data.frame))frame=Math.max(0,Math.round(data.frame));
    const value=Number.isFinite(data.progress)?data.progress:progress;
    if(data.type==='ring-setting:retry'){retry=true;render('start',0);}
    else if(data.type==='ring-setting:dragstart'||data.type==='ring-setting:progress'){retry=false;render('progress',value);}
    else if(data.type==='ring-setting:inserted'){retry=false;render('progress',1);}
    else if(data.type==='ring-setting:complete'){retry=false;render('complete',1);}
    else if(data.type==='ring-setting:ready'){failed=false;render('start',0);}
    else if(data.type==='ring-setting:error'){failed=true;render('start',0);}
    else if(data.type==='ring-setting:statechange'){
      if(phase==='loading'){retry=false;failed=false;render('start',0);}
      else if(phase==='ready')render('start',0);
      else if(phase==='returning'){retry=true;render('start',0);}
      else if(phase==='dragging'){retry=false;render('progress',value);}
      else if(phase==='settling'||phase==='clamping'||phase==='complete')render('progress',1);
      else if(phase==='error'){failed=true;render('start',0);}
    }
    // Only ring-setting:complete reveals the final title and Next button.
    return;
  }
  if(event.source!==window.parent||data?.scope!=='lavivion-suite')return;
  if(data.type==='setting-ring')setRing(data.ringId);
  if(data.type==='setting-variant')setVariant(data.variant);
  if(data.type==='reset')reset();
  if(data.type==='active')window.dispatchEvent(new CustomEvent('lavivion:host-active',{detail:{active:!!data.active}}));
});
Object.assign(window,{lavivionSettingUI:{area,setRing,setVariant,reset,getState:()=>({ringId,state,phase,progress,frame,variant})}});
document.getElementById('setting-back')!.addEventListener('click',()=>window.parent.postMessage({scope:'lavivion-suite',type:'go',game:'polish'},'*'));
document.getElementById('setting-next')!.addEventListener('click',()=>{
  if(state!=='complete')return;
  window.dispatchEvent(new CustomEvent('lavivion:setting-next',{detail:{ringId}}));
  window.parent.postMessage({scope:'lavivion-suite',type:'setting-next',ringId},'*');
});
setRing(ringId);
