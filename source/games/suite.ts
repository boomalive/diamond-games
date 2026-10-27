export {};
type GameName = 'mining' | 'polish' | 'setting' | 'final';
const names: GameName[] = ['mining','polish','setting','final'];
const labels = {mining:'Добыча',polish:'Огранка',setting:'Вставка',final:'Финал'};
const payload = JSON.parse(document.getElementById('games-data')!.textContent!) as Record<GameName,string>;
const frames = names.reduce((result,name)=>{result[name]=document.getElementById(`frame-${name}`) as HTMLIFrameElement;return result;},{} as Record<GameName,HTMLIFrameElement>);
const loaded = new Set<GameName>();
const shape = document.getElementById('shape') as HTMLSelectElement;
const ring = document.getElementById('ring') as HTMLSelectElement;
const finalRing = document.getElementById('final-ring') as HTMLSelectElement;
finalRing.value='LR0211OV01';
let loadedFinalRing = '';
let current: GameName = 'mining';
let soundEnabled = false;

function updateSoundButton() {
  const button=document.getElementById('mining-sound')!;
  button.setAttribute('aria-pressed',String(soundEnabled));
  button.textContent=soundEnabled?'♪ Звук вкл.':'♪ Звук выкл.';
  button.title=soundEnabled?'Выключить звук удара':'Включить звук удара';
}

function send(name: GameName, data: Record<string,unknown>) {
  frames[name].contentWindow?.postMessage({scope:'lavivion-suite',...data},'*');
}
function loadFinalRing() {
  if(loadedFinalRing===finalRing.value)return;
  if(loaded.has('final')){
    loadedFinalRing=finalRing.value;send('final',{type:'final-ring',ringId:finalRing.value});return;
  }
  const frame=document.createElement('iframe');
  frame.id='frame-final';frame.title=`Готовое кольцо · ${finalRing.value}`;
  frame.allow='fullscreen';frame.dataset.ring=finalRing.value;
  const url=new URL(payload.final,document.baseURI);url.searchParams.set('ring',finalRing.value);frame.src=url.href;
  frame.addEventListener('load',()=>{send('final',{type:'active',active:current==='final'});send('final',{type:'final-ring',ringId:finalRing.value});},{once:true});
  frames.final.replaceWith(frame);frames.final=frame;
  loadedFinalRing=finalRing.value;loaded.add('final');
}
function selectGame(name: GameName) {
  current = name;
  for (const key of names) {
    const active = key === name;
    document.getElementById(`panel-${key}`)!.hidden = !active;
    const tab = document.getElementById(`tab-${key}`)!;
    tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;
    if (loaded.has(key)) send(key,{type:'active',active});
  }
  for(const key of names)document.getElementById(`${key}-controls`)!.hidden=key!==name;
  if(name==='final')loadFinalRing();
  else if (!loaded.has(name)) {
    loaded.add(name);
    frames[name].addEventListener('load',()=>{
      send(name,{type:'active',active:current===name});
      if (name==='polish')send(name,{type:'shape',shape:shape.value});
      if (name==='mining')send(name,{type:'sound',enabled:soundEnabled});
      if (name==='setting'){
        send(name,{type:'setting-ring',ringId:ring.value});
      }
    },{once:true});
    const url=new URL(payload[name],document.baseURI);
    if(name==='polish')url.searchParams.set('shape',shape.value);
    if(name==='setting')url.searchParams.set('ring',ring.value);
    frames[name].src=url.href;
  }
  document.getElementById('announcement')!.textContent=`Игра: ${labels[name]}`;
  document.body.dataset.game=name;
}
function resize() {
  const width=document.documentElement.clientWidth,height=document.documentElement.clientHeight;
  const mobile=width<=600;
  const scale=Math.min(width/375,Math.max(.2,(height-(mobile?88:130))/672),mobile?1.25:1.12);
  document.documentElement.style.setProperty('--scale',String(scale));
  document.documentElement.style.setProperty('--screen-width',`${375*scale}px`);
}
for (const name of names) {
  const tab=document.getElementById(`tab-${name}`)!;
  tab.addEventListener('click',()=>selectGame(name));
  tab.addEventListener('keydown',event=>{
    const index=names.indexOf(name);
    let target: GameName|undefined;
    if(event.key==='ArrowRight')target=names[(index+1)%names.length];
    if(event.key==='ArrowLeft')target=names[(index+names.length-1)%names.length];
    if(event.key==='Home')target=names[0];if(event.key==='End')target=names[names.length-1];
    if(target){event.preventDefault();selectGame(target);document.getElementById(`tab-${target}`)!.focus();}
  });
}
shape.addEventListener('change',()=>send('polish',{type:'shape',shape:shape.value}));
ring.addEventListener('change',()=>send('setting',{type:'setting-ring',ringId:ring.value}));
finalRing.addEventListener('change',()=>{if(current==='final')loadFinalRing();});
document.getElementById('setting-reset')!.addEventListener('click',()=>send('setting',{type:'reset'}));
document.getElementById('mining-reset')!.addEventListener('click',()=>send('mining',{type:'reset'}));
document.getElementById('mining-sound')!.addEventListener('click',()=>{soundEnabled=!soundEnabled;updateSoundButton();send('mining',{type:'sound',enabled:soundEnabled});});
document.getElementById('demo')!.addEventListener('click',()=>send('polish',{type:'demo'}));
document.getElementById('reset')!.addEventListener('click',()=>send('polish',{type:'reset'}));
window.addEventListener('message',event=>{
  const name=names.find(key=>frames[key].contentWindow===event.source);
  if (!name) return;
  if(event.data?.scope==='lavivion-suite'&&event.data.type==='mining-sound-state'&&name==='mining'){soundEnabled=!!event.data.enabled;updateSoundButton();}
  if(event.data?.scope==='lavivion-suite'&&event.data.type==='setting-ui-state'&&name==='setting'&&ring.value!==event.data.ringId)ring.value=event.data.ringId;
  if(event.data?.scope==='lavivion-suite'&&event.data.type==='final-ui-state'&&name==='final'&&finalRing.value!==event.data.ringId)finalRing.value=event.data.ringId;
  if(event.data?.scope==='lavivion-suite'&&event.data.type==='setting-next'&&name==='setting'){
    document.getElementById('announcement')!.textContent='Идеально! Бриллиант на своем месте.';
    window.dispatchEvent(new CustomEvent('lavivion:setting-next',{detail:{ringId:event.data.ringId}}));
    if([...finalRing.options].some(option=>option.value===event.data.ringId))finalRing.value=event.data.ringId;
    selectGame('final');
  }
  if(event.data?.scope==='lavivion-suite'&&event.data.type==='go'&&names.indexOf(event.data.game)!==-1)selectGame(event.data.game);
  if(event.data?.scope==='lavivion-suite'&&event.data.type==='next')selectGame(name==='mining'?'polish':'setting');
  if(name==='polish'&&event.data?.type==='lavivion:diamond-ready')selectGame('setting');
});
document.addEventListener('visibilitychange',()=>send(current,{type:'active',active:!document.hidden}));
window.addEventListener('resize',resize);resize();selectGame('mining');
