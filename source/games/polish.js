/* global document, window, Image, URLSearchParams, performance, requestAnimationFrame, cancelAnimationFrame, matchMedia, CustomEvent, console */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('stone'), ctx = canvas.getContext('2d');
  const effects = $('effects'), fx = effects.getContext('2d');
  const wrap = $('stone-wrap'), brush = $('brush');
  const W = 360, H = 360, MW = 180, MH = 180, N = MW * MH;
  // More deliberate polishing: retain the tool's visual size, narrow its contact
  // patch and let the player finish almost all of the surface before cleanup.
  const SIZE = 600, TOOL_RADIUS = 46, BRUSH_RADIUS = 38, AUTO_CLEAR_AT = .96;
  const assetSets = JSON.parse($('stone-assets').textContent);
  const BOUNDARIES = [0, 30, 60, 100];
  const COPY = [
    'Огранщик рассчитывает будущую огранку бриллианта с помощью 3D-сканирования.',
    'Блеск зависит от пропорций, симметрии и полировки бриллианта.',
    'Эксперты LA VIVION помогут подобрать камень по вашим пожеланиям.'
  ];
  const HINTS = ['Проведите пальцем<br>по камню', 'А теперь еще раз<br>повторите', 'Остался последний<br>раз…'];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coverage = new Float32Array(N), domains = [], areas = [], layers = [];
  const mask = document.createElement('canvas'); mask.width = MW; mask.height = MH;
  const maskCtx = mask.getContext('2d'), maskPixels = maskCtx.createImageData(MW,MH);
  const overlay = document.createElement('canvas'); overlay.width = SIZE; overlay.height = SIZE;
  const over = overlay.getContext('2d');
  const particles = [];
  let stage = 0, phase = 'loading', ready = false, covered = 0, cleanups = 0;
  let pointer = null, previous = null, frame = null, lastFrame = 0;
  let dirty = true, percent = -1, phaseStart = 0, clearSnapshot = null;
  let demoRunning = false, demoPath = null, demoIndex = 0, demoPoint = null;
  let announcedPercent = -1;
  let shape = 'round', preparation = 0, hostActive = true, pausedAt = 0;
  const initialShape = new URLSearchParams(window.location.search).get('shape');
  if(assetSets[initialShape])shape=initialShape;
  const copyAnimations = new Map();
  const clamp = (v,a=0,b=1) => Math.max(a,Math.min(b,v));
  const smooth = v => {v=clamp(v);return v*v*(3-2*v);};
  const active = () => phase === 'ready' || phase === 'scratching';
  const load = src => new Promise((resolve,reject) => {const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src;});

  function metadata() {
    wrap.dataset.stage = String(stage+1);
    wrap.dataset.phase = phase;
    wrap.dataset.cleanups = String(cleanups);
    wrap.dataset.stageProgress = String(Math.round(covered/(areas[stage]||1)*100));
    $('round-label').textContent = (stage+1)+' / 3';
    $('round-label').setAttribute('aria-label','Этап стирания '+(stage+1)+' из 3');
  }

  function silhouette(image) {
    const c=document.createElement('canvas');c.width=MW;c.height=MH;
    const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(image,0,0,MW,MH);
    const p=x.getImageData(0,0,MW,MH).data;
    const rows=Array.from({length:MH},()=>[MW,-1]);
    for(let y=0;y<MH;y++)for(let xx=0;xx<MW;xx++){
      const i=(y*MW+xx)*4;
      if(Math.min(p[i],p[i+1],p[i+2])<239){rows[y][0]=Math.min(rows[y][0],xx);rows[y][1]=Math.max(rows[y][1],xx);}
    }
    return rows;
  }

  function setCopy(id,text,animate=true) {
    const node=$(id);copyAnimations.get(node)?.cancel();copyAnimations.delete(node);
    if(!animate||reduced||node.textContent===text){node.textContent=text;return;}
    const outgoing=node.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(5px)'}],{duration:110,easing:'ease-in',fill:'forwards'});
    copyAnimations.set(node,outgoing);
    outgoing.finished.then(()=>{
      if(copyAnimations.get(node)!==outgoing)return;
      node.textContent=text;
      const incoming=node.animate([{opacity:0,transform:'translateY(-7px)'},{opacity:1,transform:'translateY(0)'}],{duration:260,easing:'cubic-bezier(.16,.7,.25,1)'});
      copyAnimations.set(node,incoming);outgoing.cancel();
      return incoming.finished.then(()=>{if(copyAnimations.get(node)===incoming)copyAnimations.delete(node);});
    }).catch(()=>{});
  }

  async function prepare(nextShape = shape) {
    if(!assetSets[nextShape])return;
    if(nextShape===shape&&preparation>0&&phase!=='error')return;
    const ticket=++preparation;shape=nextShape;
    ready=false;phase='loading';stopDemo();releasePointer();
    if(frame!==null){cancelAnimationFrame(frame);frame=null;}
    $('loading').hidden=false;$('loading').textContent='Подготавливаем камень…';
    brush.classList.remove('visible');wrap.dataset.ready='false';metadata();
    try {
      const images=await Promise.all(assetSets[shape].map(load));
      if(ticket!==preparation)return;
      layers.length=domains.length=areas.length=0;
      images.forEach(im=>{
        const c=document.createElement('canvas');c.width=SIZE;c.height=SIZE;
        const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,SIZE,SIZE);
        // The supplied 1000×1000 artwork fills the full square, without crops.
        x.drawImage(im,0,0,SIZE,SIZE);layers.push(c);
      });
      const rows=layers.map(silhouette);
      for(let s=0;s<3;s++){
        const d=new Uint8Array(N);let area=0;
        for(let y=0;y<MH;y++){
          const lo=Math.min(rows[s][y][0],rows[s+1][y][0]);
          const hi=Math.max(rows[s][y][1],rows[s+1][y][1]);
          if(hi-lo<5)continue;
          for(let x=lo;x<=hi;x++){d[y*MW+x]=1;area++;}
        }
        domains.push(d);areas.push(area);
      }
      ready=true;$('loading').hidden=true;wrap.dataset.ready='true';wrap.dataset.shape=shape;
      reset();
      window.parent.postMessage({scope:'lavivion-suite',type:'ready',game:'polish',shape},'*');
    } catch(e) {
      if(ticket!==preparation)return;
      phase='error';metadata();
      $('loading').textContent='Не удалось загрузить камень. Обновите страницу.';
      console.error('Diamond assets could not be loaded.',e);
    }
  }

  function render() {
    ctx.clearRect(0,0,SIZE,SIZE);
    if(phase==='complete'){ctx.drawImage(layers[3],0,0);dirty=false;return;}
    ctx.drawImage(layers[stage],0,0);
    const p=maskPixels.data;
    for(let i=0;i<N;i++){p[i*4]=p[i*4+1]=p[i*4+2]=255;p[i*4+3]=Math.round(coverage[i]*255);}
    maskCtx.putImageData(maskPixels,0,0);
    over.globalCompositeOperation='source-over';over.clearRect(0,0,SIZE,SIZE);
    // Each round can reveal only its next material state.
    over.drawImage(layers[stage+1],0,0);
    over.globalCompositeOperation='destination-in';over.drawImage(mask,0,0,SIZE,SIZE);
    ctx.drawImage(overlay,0,0);dirty=false;
  }

  function stamp(x,y) {
    const gx=x/2,gy=y/2,r=BRUSH_RADIUS/2,feather=7;
    const domain=domains[stage];
    for(let iy=Math.max(0,Math.floor(gy-r));iy<Math.min(MH,Math.ceil(gy+r));iy++){
      for(let ix=Math.max(0,Math.floor(gx-r));ix<Math.min(MW,Math.ceil(gx+r));ix++){
        const dist=Math.hypot(ix-gx,iy-gy);if(dist>=r)continue;
        const i=iy*MW+ix,before=coverage[i];
        coverage[i]=Math.max(before,smooth((r-dist)/feather));
        if(domain[i])covered+=coverage[i]-before;
      }
    }
    dirty=true;
  }

  function stroke(a,b) {
    if(!active())return;
    const distance=Math.hypot(b.x-a.x,b.y-a.y),steps=Math.max(1,Math.ceil(distance/8));
    for(let i=1;i<=steps;i++)stamp(a.x+(b.x-a.x)*i/steps,a.y+(b.y-a.y)*i/steps);
    if(covered>.5){phase='scratching';document.querySelector('.game').classList.add('has-scratched');}
    if(!reduced&&distance>5)spawnParticles(b.x,b.y,2);
    updateProgress();metadata();schedule();
    if(covered/areas[stage]>=AUTO_CLEAR_AT)beginCleanup();
  }

  function updateProgress(force) {
    const fraction=clamp(covered/(areas[stage]||1));
    const value=force??Math.floor(BOUNDARIES[stage]+(BOUNDARIES[stage+1]-BOUNDARIES[stage])*fraction);
    canvas.setAttribute('aria-label','Этап стирания '+(stage+1)+' из 3. Алмаз открыт на '+value+'%. Проведите пальцем или зажатой мышью по камню.');
    if(value===percent)return;
    percent=value;$('progress-fill').style.width=percent+'%';
    $('progress').setAttribute('aria-valuenow',percent);
    $('progress-label').textContent='Алмаз огранён на '+percent+'%';
    if(Math.floor(percent/10)!==announcedPercent){announcedPercent=Math.floor(percent/10);if(percent>0)announce('Алмаз открыт на '+percent+'%.');}
  }

  function releasePointer() {
    const id=pointer;pointer=null;previous=null;
    if(id!==null&&canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);
    parkTool();
  }

  function beginCleanup() {
    if(!active())return;
    phase='clearing';phaseStart=performance.now();clearSnapshot=new Float32Array(coverage);
    releasePointer();wrap.classList.add('ready');$('hint').style.opacity='0';
    $('shine').classList.remove('active');void $('shine').offsetWidth;$('shine').classList.add('active');
    announce('Стирание '+(stage+1)+' завершено. Убираем остатки.');metadata();schedule();
  }

  function finishCleanup(now) {
    coverage.fill(1);covered=areas[stage];cleanups++;
    updateProgress(BOUNDARIES[stage+1]);dirty=true;
    if(stage===2){complete();return;}
    // Display the clean result, then require a fresh gesture for the next stage.
    phase='settling';phaseStart=now;metadata();
  }

  function nextStage() {
    stage++;coverage.fill(0);covered=0;phase='ready';clearSnapshot=null;
    releasePointer();wrap.classList.remove('ready');$('shine').classList.remove('active');
    document.querySelector('.game').classList.remove('has-scratched');
    setCopy('description',COPY[stage]);$('hint-text').innerHTML=HINTS[stage];$('hint').style.opacity='1';
    dirty=true;metadata();updateProgress(BOUNDARIES[stage]);
    announce('Этап стирания '+(stage+1)+' из 3. '+COPY[stage]);
    if(demoRunning)prepareDemoPath();
  }

  function complete() {
    phase='complete';stopDemo();wrap.classList.add('ready');wrap.dataset.complete='true';
    setCopy('title','ВАШ БРИЛЛИАНТ ГОТОВ!');
    setCopy('description','Все камни LA VIVION отвечают самым строгим стандартам бренда.');
    $('progress-panel').hidden=true;$('next').hidden=false;
    canvas.setAttribute('aria-label','Готовый огранённый бриллиант. Все три этапа стирания пройдены.');
    if(!reduced)for(const [x,y]of [[150,56],[280,200],[101,300]])sparkle(x,y);
    metadata();announce('Ваш бриллиант готов! Все три этапа стирания завершены.');dirty=true;
  }

  function schedule(){if(frame===null&&hostActive)frame=requestAnimationFrame(tick);}
  function tick(now) {
    frame=null;const dt=Math.min((now-lastFrame)/1000,.04);lastFrame=now;
    if(demoRunning&&active())advanceDemo(dt);
    if(phase==='clearing'){
      const t=clamp((now-phaseStart)/(reduced?350:1250));
      let sum=0;
      for(let y=0;y<MH;y++){
        const f=smooth(t*1.4-y/MH*.4);
        for(let x=0;x<MW;x++){
          const i=y*MW+x;coverage[i]=clearSnapshot[i]+(1-clearSnapshot[i])*f;
          if(domains[stage][i])sum+=coverage[i];
        }
      }
      covered=sum;dirty=true;updateProgress();metadata();
      if(t>=1)finishCleanup(now);
    }
    if(phase==='settling'&&now-phaseStart>650)nextStage();
    if(dirty&&ready)render();renderEffects(dt);
    if(demoRunning||phase==='clearing'||phase==='settling'||particles.length)schedule();
  }

  function coords(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width*W,y:(e.clientY-r.top)/r.height*H};}
  function showBrush(p,isDemo=false){
    if(!active()||!hostActive){brush.classList.remove('visible');return;}
    brush.style.left=p.x/W*100+'%';brush.style.top=p.y/H*100+'%';
    const size=TOOL_RADIUS*2/W*canvas.getBoundingClientRect().width;
    brush.style.width=size+'px';brush.style.height=size+'px';
    brush.classList.add('visible');brush.classList.toggle('demo',isDemo);
  }
  function parkTool(){
    if(ready&&active()&&hostActive)showBrush({x:268,y:222});
    else brush.classList.remove('visible');
  }
  canvas.addEventListener('pointerdown',e=>{
    if(!ready||!active()||e.button!==0||pointer!==null)return;
    stopDemo();pointer=e.pointerId;previous=coords(e);canvas.setPointerCapture(pointer);
    stamp(previous.x,previous.y);showBrush(previous);updateProgress();metadata();schedule();
    if(covered/areas[stage]>=AUTO_CLEAR_AT)beginCleanup();e.preventDefault();
  });
  canvas.addEventListener('pointermove',e=>{
    if(!ready||!active())return;
    if(pointer===null){if(e.pointerType==='mouse'&&!demoRunning)showBrush(coords(e));return;}
    if(e.pointerId!==pointer||!previous)return;
    const p=coords(e),a=previous;stroke(a,p);
    if(active()){previous=p;showBrush(p);}e.preventDefault();
  });
  function release(e){if(e.pointerId!==pointer)return;releasePointer();}
  canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
  canvas.addEventListener('pointerleave',()=>{if(pointer===null&&!demoRunning)parkTool();});
  canvas.addEventListener('keydown',e=>{if(e.code==='Enter'||e.code==='Space'){e.preventDefault();if(ready)startDemo();}});

  function prepareDemoPath() {
    demoPath=[];demoIndex=1;
    // The denser sweep also reaches the edges with the smaller contact patch.
    for(let j=0;j<10;j++){
      const y=18+j*36,span=W*.44*Math.sqrt(Math.max(.08,1-((y-H/2)/(H*.49))**2));
      const l=W/2-span,r=W/2+span;
      demoPath.push({x:j%2?r:l,y},{x:j%2?l:r,y:y+6});
    }
    demoPoint={...demoPath[0]};
  }
  function startDemo(){if(!ready)return;reset();demoRunning=true;prepareDemoPath();$('demo-label').textContent='Остановить анимацию';$('demo').setAttribute('aria-pressed','true');lastFrame=performance.now();schedule();}
  function stopDemo(){demoRunning=false;demoPath=null;$('demo-label').textContent='Показать анимацию';$('demo').setAttribute('aria-pressed','false');parkTool();}
  function advanceDemo(dt){
    let budget=dt*390;
    while(budget>0&&demoRunning&&active()){
      const target=demoPath[demoIndex];
      if(!target){prepareDemoPath();return;}
      const old={...demoPoint},distance=Math.hypot(target.x-old.x,target.y-old.y);
      if(distance<.01){demoIndex++;continue;}
      const take=Math.min(distance,budget),p={x:old.x+(target.x-old.x)*take/distance,y:old.y+(target.y-old.y)*take/distance};
      demoPoint=p;stroke(old,p);budget-=take;
      if(!active())return;showBrush(p,true);if(take>=distance-.01)demoIndex++;
    }
  }
  $('demo').addEventListener('click',()=>demoRunning?stopDemo():startDemo());

  function reset(){
    stopDemo();releasePointer();if(frame!==null){cancelAnimationFrame(frame);frame=null;}
    stage=0;phase='ready';covered=0;cleanups=0;coverage.fill(0);clearSnapshot=null;
    percent=-1;announcedPercent=-1;particles.length=0;dirty=true;fx.clearRect(0,0,SIZE,SIZE);
    wrap.classList.remove('ready');delete wrap.dataset.complete;$('shine').classList.remove('active');
    document.querySelector('.game').classList.remove('has-scratched');
    setCopy('title','ПРИДАЙТЕ КАМНЮ ФОРМУ',false);setCopy('description',COPY[0],false);
    $('hint-text').innerHTML=HINTS[0];$('hint').style.opacity='1';
    $('progress-panel').hidden=false;$('next').hidden=true;$('completion').hidden=true;
    updateProgress(0);metadata();if(ready){render();parkTool();}announce('Этап стирания 1 из 3. Проведите пальцем по камню.');
  }
  $('reset').addEventListener('click',reset);document.querySelector('.back').addEventListener('click',reset);$('repeat').addEventListener('click',reset);
  $('next').addEventListener('click',()=>{
    window.dispatchEvent(new CustomEvent('lavivion:diamond-ready',{detail:{step:3,progress:100,rounds:3}}));
    if(window.parent!==window)window.parent.postMessage({type:'lavivion:diamond-ready',step:3,rounds:3},'*');
    if(window.parent===window){$('completion').hidden=false;$('repeat').focus();}
  });
  $('close-completion').addEventListener('click',()=>{$('completion').hidden=true;$('next').focus();});
  function spawnParticles(x,y,n){for(let i=0;i<n;i++)particles.push({x,y,vx:(Math.random()-.5)*25,vy:8+Math.random()*22,life:.5,max:.5,size:.5+Math.random(),spark:false});}
  function sparkle(x,y){particles.push({x,y,vx:0,vy:0,life:1.05,max:1.05,size:8,spark:true});}
  function renderEffects(dt){
    fx.clearRect(0,0,SIZE,SIZE);fx.save();fx.scale(SIZE/W,SIZE/H);
    for(let i=particles.length-1;i>=0;i--){
      const p=particles[i];p.life-=dt;if(p.life<=0){particles.splice(i,1);continue;}p.x+=p.vx*dt;p.y+=p.vy*dt;
      if(p.spark){const a=Math.sin(p.life/p.max*Math.PI),r=p.size*a;fx.strokeStyle='rgba(255,255,255,'+a+')';fx.lineWidth=.8;fx.beginPath();fx.moveTo(p.x-r*1.5,p.y);fx.lineTo(p.x+r*1.5,p.y);fx.moveTo(p.x,p.y-r*2);fx.lineTo(p.x,p.y+r*2);fx.stroke();}
      else{fx.fillStyle='rgba(144,162,164,'+(p.life/p.max*.5)+')';fx.fillRect(p.x,p.y,p.size,p.size);}
    }fx.restore();
  }
  function announce(text){$('announcement').textContent=text;}
  document.addEventListener('visibilitychange',()=>{if(document.hidden){releasePointer();stopDemo();}});
  window.addEventListener('message',event=>{
    if(event.source!==window.parent||event.data?.scope!=='lavivion-suite')return;
    const data=event.data;
    if(data.type==='shape')prepare(data.shape);
    if(data.type==='reset'&&ready)reset();
    if(data.type==='demo'&&ready){if(demoRunning)stopDemo();else startDemo();}
    if(data.type==='active'){
      if(hostActive===data.active)return;
      hostActive=!!data.active;
      if(!hostActive){pausedAt=performance.now();releasePointer();stopDemo();if(frame!==null){cancelAnimationFrame(frame);frame=null;}}
      else{phaseStart+=performance.now()-pausedAt;lastFrame=performance.now();parkTool();schedule();}
    }
  });
  prepare();
})();
