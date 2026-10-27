// This is an interactive browser game. Its clock is independent of Remotion renders.
declare const lottie: {
  loadAnimation(options: Record<string, unknown>): {
    goToAndPlay(frame: number, isFrame: boolean): void;
    goToAndStop(frame: number, isFrame: boolean): void;
    pause(): void;
    play(): void;
    addEventListener(event: string, listener: () => void): void;
  };
};

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const game = element('game');
const hit = element<HTMLButtonElement>('hit');
const pick = element<HTMLImageElement>('pickaxe');
const stone = element('floating-stone');
const reaction = element('stone-reaction');
const shadow = element('shadow');
const hintContainer = element('hint');
const images = Array.from(document.querySelectorAll<HTMLImageElement>('.stone'));
const canvas = element<HTMLCanvasElement>('effects');
const context = canvas.getContext('2d')!;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const facts = [
  'Самым древним из датированных алмазов около 3,5 млрд лет — почти три четверти возраста Земли. Они появились задолго до первых динозавров.',
  'Давление при рождении природного алмаза — как вес самолета, сосредоточенный на кончике пальца.',
  'Чтобы получить один карат, перерабатывают 200-250 тонн породы. Это примерно 10–12 грузовиков.',
  'Лишь 20% добытых алмазов — ювелирного качества',
  'Теперь раскройте его красоту с помощью огранки',
];
const prompts = ['Нажмите на породу,\nчтобы ударить киркой', 'Продолжайте…', 'Еще немного…', 'Остались мелочи', ''];
const percentages = [0, 30, 60, 90, 100];
let stage = 0;
let ready = false;
let busy = false;
let strikeStart = -1;
let impactAt = -1;
let impactApplied = false;
let fromStage = 0;
let floatOffset = 0;
let soundEnabled = false;
let audio: AudioContext | undefined;
let raf = 0;
let idleOrigin = performance.now();
let hostActive = true;
let hostPausedAt = 0;
const swingDuration = 1080;
const contactTime = 320;

const hint = lottie.loadAnimation({
  container: hintContainer, renderer: 'svg', loop: true,
  autoplay: !reducedMotion.matches,
  animationData: JSON.parse(element('hint-data').textContent || '{}'),
  rendererSettings: {progressiveLoad: false, hideOnTransparent: true},
});
hint.addEventListener('DOMLoaded', () => {
  if (reducedMotion.matches) hint.goToAndStop(6, true);
});

const random = (seed: number) => {
  let value = seed | 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) | 0;
    return (value >>> 0) / 4294967296;
  };
};
type Chip = {
  x: number; y: number; vx: number; vy: number; size: number; spin: number;
  angle: number; sx: number; sy: number; polygon: [number, number][];
};
type Dust = {x: number; y: number; vx: number; vy: number; radius: number; alpha: number};
let chips: Chip[] = [];
let dust: Dust[] = [];
const copyAnimations = new Map<HTMLElement, Animation>();
const heavyImpact = () => fromStage === 1 || fromStage === 2;

// Cache the soft dust brush: the larger bursts must stay smooth on phones.
const dustBrush = document.createElement('canvas');
dustBrush.width = dustBrush.height = 128;
const dustContext = dustBrush.getContext('2d')!;
const dustGradient = dustContext.createRadialGradient(64,64,0,64,64,64);
dustGradient.addColorStop(0, 'rgba(82,82,82,1)');
dustGradient.addColorStop(1, 'rgba(142,142,142,0)');
dustContext.fillStyle = dustGradient;
dustContext.fillRect(0,0,128,128);

function setCopy(id: string, text: string, animate: boolean) {
  const target = element(id);
  copyAnimations.get(target)?.cancel();
  copyAnimations.delete(target);
  if (!animate || reducedMotion.matches || target.textContent === text) {
    target.textContent = text;
    return;
  }
  const outgoing = target.animate([
    {opacity: 1, transform: 'translateY(0)'},
    {opacity: 0, transform: 'translateY(5px)'},
  ], {duration: 110, easing: 'ease-in', fill: 'forwards'});
  copyAnimations.set(target, outgoing);
  void outgoing.finished.then(() => {
    if (copyAnimations.get(target) !== outgoing) return;
    target.textContent = text;
    const incoming = target.animate([
      {opacity: 0, transform: 'translateY(-7px)'},
      {opacity: 1, transform: 'translateY(0)'},
    ], {duration: 260, easing: 'cubic-bezier(.16,.7,.25,1)'});
    copyAnimations.set(target, incoming);
    outgoing.cancel();
    return incoming.finished.then(() => {
      if (copyAnimations.get(target) === incoming) copyAnimations.delete(target);
    });
  }).catch(() => { /* Reset can cancel either half of the transition. */ });
}

function resize() {
  // On mobile innerWidth can include the initially unscaled 375px canvas overflow.
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;
  const mobile = viewportWidth <= 600;
  const horizontal = (viewportWidth - (mobile ? 0 : 32)) / 375;
  const vertical = (viewportHeight - (mobile ? 62 : 145)) / 672;
  const scale = Math.min(horizontal, Math.max(.2, vertical), mobile ? 1.25 : 1.12);
  document.documentElement.style.setProperty('--scale', String(scale));
  const space = element('screen-space');
  space.style.width = `${375 * scale}px`;
  space.style.height = `${672 * scale}px`;
  const ratio = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = Math.round(375 * ratio);
  canvas.height = Math.round(672 * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function updateStage(animateCopy = false) {
  game.dataset.stage = String(stage);
  setCopy('title', stage === 4 ? 'Вы нашли природный алмаз!' : 'Добудьте алмаз из кимберлита', animateCopy);
  setCopy('fact', facts[stage], animateCopy);
  setCopy('prompt', prompts[stage], animateCopy);
  element('progress-text').textContent = `Алмаз открыт на ${percentages[stage]}%`;
  element('progress-fill').style.width = `${percentages[stage]}%`;
  element('progress').setAttribute('aria-valuenow', String(percentages[stage]));
  element('progress-wrap').hidden = stage === 4;
  element('again').hidden = stage !== 4;
  element('hit-counter').textContent = `${stage} / 4 удара`;
  hit.setAttribute('aria-label', stage === 4 ? 'Алмаз освобождён' : `Ударить киркой по центру камня. Осталось ${4 - stage} ${stage === 3 ? 'удар' : 'удара'}`);
  element('announcement').textContent = stage === 4 ? 'Ты освободил природный алмаз за четыре удара!' : `Алмаз открыт на ${percentages[stage]}%. Осталось ${4 - stage} удара.`;
  images.forEach((image, index) => {
    image.alt = index === stage ? (stage === 4 ? 'Освобождённый природный алмаз' : `Кимберлит. Алмаз открыт на ${percentages[stage]}%`) : '';
  });
}

function burst() {
  const rand = random(1907 + fromStage * 137);
  const heavy = heavyImpact();
  const amount = reducedMotion.matches ? (heavy ? 12 : 7) : (heavy ? 84 : 30);
  const majorCount = heavy ? 18 : 8;
  // Stage-specific detachment zones follow the disappearing rock, not the diamond.
  const zones = [[232, 354], [210, 316], [130, 307], [118, 426]];
  const [zx, zy] = zones[fromStage];
  chips = Array.from({length: amount}, (_, i) => {
    const angle = -Math.PI + rand() * Math.PI * 2;
    const speed = (i < majorCount ? (heavy ? 135 : 115) : (heavy ? 215 : 180)) + rand() * (heavy ? 235 : 190);
    const size = i < majorCount ? (heavy ? 18 : 12) + rand() * (heavy ? 22 : 16) : 3 + rand() * (heavy ? 11 : 8);
    const vertices = 5 + Math.floor(rand() * 3);
    const polygon: [number, number][] = Array.from({length: vertices}, (__, j) => {
      const theta = j / vertices * Math.PI * 2;
      const radius = size * (.68 + rand() * .32);
      return [Math.cos(theta) * radius, Math.sin(theta) * radius];
    });
    return {
      x: (heavy && i % 3 === 0 ? 187.5 : zx) + (rand() - .5) * (heavy ? 110 : 65),
      y: (heavy && i % 3 === 0 ? 356 : zy) + floatOffset + (rand() - .5) * (heavy ? 145 : 90),
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 110,
      size, spin: (rand() - .5) * 15, angle: rand() * 6,
      sx: 420 + rand() * 500, sy: 650 + rand() * 550, polygon,
    };
  });
  dust = Array.from({length: reducedMotion.matches ? (heavy ? 6 : 5) : (heavy ? 40 : 32)}, (_, i) => ({
    x: (heavy && i % 3 === 0 ? zx : 187.5) + (rand() - .5) * (heavy ? 135 : 85),
    y: (heavy && i % 3 === 0 ? zy : 356) + floatOffset + (rand() - .5) * (heavy ? 150 : 100),
    vx: (rand() - .5) * 190, vy: (rand() - .5) * 120 - 35,
    radius: (heavy ? 14 : 12) + rand() * (heavy ? 20 : 23), alpha: .12 + rand() * (heavy ? .16 : .2),
  }));
}

function playImpact() {
  if (!soundEnabled || !audio) return;
  const t = audio.currentTime;
  const buffer = audio.createBuffer(1, audio.sampleRate * .3, audio.sampleRate);
  const data = buffer.getChannelData(0);
  const rand = random(stage * 7919);
  for (let i = 0; i < data.length; i++) data[i] = (rand() * 2 - 1) * Math.exp(-i / (audio.sampleRate * .052));
  const noise = audio.createBufferSource();
  noise.buffer = buffer;
  const filter = audio.createBiquadFilter();
  filter.type = 'lowpass'; filter.frequency.setValueAtTime(2200, t);
  const volume = audio.createGain(); volume.gain.setValueAtTime(.2, t);
  noise.connect(filter).connect(volume).connect(audio.destination); noise.start(t);
  const body = audio.createOscillator(); const bodyGain = audio.createGain();
  body.type = 'sine'; body.frequency.setValueAtTime(190, t); body.frequency.exponentialRampToValueAtTime(52, t + .12);
  bodyGain.gain.setValueAtTime(.18, t); bodyGain.gain.exponentialRampToValueAtTime(.001, t + .18);
  body.connect(bodyGain).connect(audio.destination); body.start(t); body.stop(t + .2);
}

function strike() {
  if (!ready || busy || stage >= 4) return;
  busy = true; impactApplied = false; fromStage = stage;
  strikeStart = performance.now(); impactAt = strikeStart + contactTime;
  hit.disabled = true; hintContainer.style.opacity = '0'; hint.pause();
  if (soundEnabled) {
    audio ??= new AudioContext();
    void audio.resume();
  }
  ensureLoop();
}

function reset() {
  stage = 0; busy = false; strikeStart = -1; impactAt = -1; impactApplied = false;
  chips = []; dust = []; idleOrigin = performance.now();
  images.forEach((image, i) => {image.style.opacity = i === 0 ? '1' : '0';});
  reaction.style.transform = ''; pick.style.opacity = '1'; pick.style.transform = 'rotate(-19.77deg)';
  hintContainer.style.opacity = '1';
  if (reducedMotion.matches) hint.goToAndStop(6, true); else hint.goToAndPlay(0, true);
  hit.disabled = !ready; updateStage(); ensureLoop();
}

const ease = (t: number) => t * t * (3 - 2 * t);
const clamp = (t: number) => Math.max(0, Math.min(1, t));
// time, x, y, angle. The left metal tip lands at (188, 356), the stone's centre.
const poses = [[0,0,0,-19.77],[185,35,-35,13],[240,38,-43,17],[320,-53,59,-48],[363,-47,52,-43],[530,5,10,-27],[850,0,0,-19.77],[1080,0,0,-19.77]];
function drawPick(elapsed: number) {
  let a = poses[0], b = poses[1];
  for (let i = 1; i < poses.length; i++) {a = poses[i - 1]; b = poses[i]; if (elapsed <= b[0]) break;}
  let t = clamp((elapsed - a[0]) / (b[0] - a[0]));
  // The downswing accelerates sharply; recovery is soft.
  t = b[0] === contactTime ? t * t * t : ease(t);
  const mix = (i: number) => a[i] + (b[i] - a[i]) * t;
  pick.style.transform = `translate(${mix(1)}px,${mix(2) + (elapsed > 240 && elapsed < 530 ? floatOffset : 0)}px) rotate(${mix(3)}deg)`;
  if (stage === 4) pick.style.opacity = String(1 - clamp((elapsed - 530) / 300));
}

function drawEffects(now: number) {
  context.clearRect(0, 0, 375, 672);
  if (!impactApplied || impactAt < 0) return;
  const age = (now - impactAt) / 1000;
  if (age < 0 || age > 1.7) return;
  const reduced = reducedMotion.matches;
  const heavy = heavyImpact();
  // A brief white pressure flash and branching fissures veil the image replacement.
  if (age < .23) {
    const alpha = (1 - age / .23) * .85;
    const glow = context.createRadialGradient(187.5, 356 + floatOffset, 0, 187.5, 356 + floatOffset, 106);
    glow.addColorStop(0, `rgba(255,253,244,${alpha})`); glow.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = glow; context.fillRect(55, 225, 265, 265);
    context.save(); context.globalAlpha = alpha * .48; context.strokeStyle = '#f5f1e5'; context.lineWidth = 1.3;
    const rng = random(43 + fromStage);
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4 + .1;
      context.beginPath(); context.moveTo(187.5,356 + floatOffset);
      for (let j = 1; j < 5; j++) context.lineTo(187.5 + Math.cos(angle) * j * 20 + (rng() - .5) * 17,356 + floatOffset + Math.sin(angle) * j * 20 + (rng() - .5) * 16);
      context.stroke();
    }
    context.restore();
  }
  // Keep the cover local to the fracture: smaller neutral-grey puffs clear quickly,
  // while the retained coarse fragments still conceal the image replacement.
  if (heavy && age < .46) {
    const cover = ease(clamp(age / .075)) * (1 - ease(clamp((age - .18) / .28)));
    const originX = fromStage === 1 ? 210 : 130;
    const originY = fromStage === 1 ? 316 : 307;
    const lobes = [[originX,originY,88],[187.5,355,90],[originX+15,originY+63,66]];
    for (let i = 0; i < lobes.length; i++) {
      const [x,y,baseRadius] = lobes[i];
      const radius = baseRadius * (.82 + age * (reduced ? .3 : 1.05));
      context.save();
      context.translate(x + (i % 2 ? 1 : -1) * age * (reduced ? 10 : 35),y + floatOffset - age * 18);
      context.scale(1,1.08);
      const plume = context.createRadialGradient(0,0,0,0,0,radius);
      plume.addColorStop(0,`rgba(78,78,78,${cover * .58})`);
      plume.addColorStop(.4,`rgba(108,108,108,${cover * .46})`);
      plume.addColorStop(1,'rgba(152,152,152,0)');
      context.fillStyle = plume; context.fillRect(-radius,-radius,radius*2,radius*2);
      context.restore();
    }
  }
  // Soft expanding mineral dust and coarse fragments form separate depth layers.
  for (const p of dust) {
    const life = Math.max(0, 1 - age / (heavy ? .58 : .72));
    if (!life) continue;
    const x = p.x + p.vx * age, y = p.y + p.vy * age + age * age * 55;
    const radius = p.radius * (1 + age * 1.8);
    if (heavy) {
      context.globalAlpha = p.alpha * life;
      context.drawImage(dustBrush,x-radius,y-radius,radius*2,radius*2);
      context.globalAlpha = 1;
    } else {
      const grad = context.createRadialGradient(x,y,0,x,y,radius);
      grad.addColorStop(0, `rgba(82,82,82,${p.alpha * life})`); grad.addColorStop(1,'rgba(142,142,142,0)');
      context.fillStyle = grad; context.fillRect(x-radius,y-radius,radius*2,radius*2);
    }
  }
  // Retouched stages can have a different source resolution. Sample the same
  // material patches in normalised source coordinates so chips retain texture.
  const sourceScaleX = images[0].naturalWidth / 2048;
  const sourceScaleY = images[0].naturalHeight / 2220;
  for (const p of chips) {
    const life = 1 - clamp((age - .28) / .68);
    if (!life) continue;
    const travel = reduced ? .22 : 1;
    context.save(); context.globalAlpha = life;
    context.translate(p.x + p.vx * age * travel, p.y + p.vy * age * travel + 380 * age * age * travel);
    context.rotate(p.angle + p.spin * age);
    context.scale(Math.cos(age * 4 + p.angle) * .27 + .73, 1);
    context.beginPath(); p.polygon.forEach(([x,y],i) => {if(i === 0)context.moveTo(x,y); else context.lineTo(x,y);}); context.closePath();
    context.save(); context.clip();
    context.drawImage(images[0],p.sx*sourceScaleX,p.sy*sourceScaleY,155*sourceScaleX,155*sourceScaleY,-p.size,-p.size,p.size*2,p.size*2);
    context.restore();
    context.strokeStyle = '#332f295c'; context.lineWidth = .7; context.stroke();
    context.restore();
  }
  if (stage === 4 && age > .2 && age < 1.6 && !reduced) {
    const phase = (age - .2) / 1.4;
    context.save(); context.globalAlpha = Math.sin(phase * Math.PI) * .82;
    for (const [x,y,offset] of [[132,299,0],[259,372,.4],[180,446,.8]]) {
      const radius = 3 + Math.max(0,Math.sin(phase*7 + offset)) * 7;
      context.fillStyle = '#fff'; context.beginPath();
      context.moveTo(x,y-radius); context.quadraticCurveTo(x+1,y-1,x+radius*.55,y); context.quadraticCurveTo(x+1,y+1,x,y+radius); context.quadraticCurveTo(x-1,y+1,x-radius*.55,y); context.quadraticCurveTo(x-1,y-1,x,y-radius); context.fill();
    }
    context.restore();
  }
}

function frame(now: number) {
  raf = 0;
  const floatPhase = (now - idleOrigin) / 3600 * Math.PI * 2;
  floatOffset = reducedMotion.matches ? 0 : Math.sin(floatPhase) * 5;
  stone.style.transform = `translateY(${floatOffset}px)`;
  const height = (floatOffset + 5) / 10;
  shadow.style.transform = `scale(${.88 + height * .13},${.86 + height * .17})`;
  shadow.style.opacity = String(.64 + height * .22);
  if (busy) {
    const elapsed = now - strikeStart;
    drawPick(elapsed);
    if (elapsed >= contactTime && !impactApplied) {
      impactApplied = true; stage = fromStage + 1; burst(); updateStage(true); playImpact();
    }
    if (impactApplied) {
      const since = now - impactAt;
      const blend = heavyImpact() ? clamp((since - 96) / 108) : clamp((since - 16) / 85);
      // Figma's 30% screen has the original stone underneath its transparent overlay.
      images[fromStage].style.opacity = fromStage === 0 ? '1' : String(1 - blend);
      if (fromStage === 1) images[0].style.opacity = String(1 - blend);
      images[stage].style.opacity = String(blend);
      const force = reducedMotion.matches ? .15 : 1;
      const shake = Math.exp(-since / 90) * force;
      reaction.style.transform = `translate(${Math.sin(since * .08) * 6 * shake}px,${Math.sin(since * .11) * 4 * shake}px) rotate(${Math.sin(since * .06) * 1.6 * shake}deg) scale(${1 + .025 * shake})`;
    }
    if (elapsed >= swingDuration) {
      busy = false; reaction.style.transform = '';
      images.forEach((image,i) => {image.style.opacity = i === stage || (stage === 1 && i === 0) ? '1' : '0';});
      hit.disabled = stage === 4;
      if (stage < 4) {
        hintContainer.style.opacity = '1';
        if (reducedMotion.matches) hint.goToAndStop(6,true); else hint.goToAndPlay(0,true);
      }
    }
  }
  drawEffects(now);
  if (!reducedMotion.matches || busy || (impactApplied && now - impactAt < 1750)) ensureLoop();
}
function ensureLoop() {if (!raf && !document.hidden && hostActive) raf = requestAnimationFrame(frame);}

hit.addEventListener('click', strike);
for (const id of ['restart','back']) element(id).addEventListener('click', reset);
element('again').addEventListener('click',()=>{
  if(window.parent!==window)window.parent.postMessage({scope:'lavivion-suite',type:'next'},'*');
  else reset();
});
if(window.parent!==window)element('again').textContent='К ОГРАНКЕ';
function setSound(enabled: boolean) {
  soundEnabled = enabled;
  element('sound').setAttribute('aria-pressed', String(soundEnabled));
  element('sound').querySelector('span')!.textContent = soundEnabled ? 'Звук вкл.' : 'Звук выкл.';
  element('sound').title = soundEnabled ? 'Выключить звук удара' : 'Включить звук удара';
  if (soundEnabled) {audio ??= new AudioContext(); void audio.resume();}
  if(window.parent!==window)window.parent.postMessage({scope:'lavivion-suite',type:'mining-sound-state',enabled:soundEnabled},'*');
}
element('sound').addEventListener('click',()=>setSound(!soundEnabled));
document.addEventListener('keydown', (event) => {
  if ((event.code !== 'Space' && event.code !== 'Enter') || event.repeat || event.altKey || event.metaKey || event.ctrlKey) return;
  // Native buttons retain their normal keyboard behavior, including restart/sound.
  if (document.activeElement instanceof HTMLButtonElement) return;
  event.preventDefault(); strike();
});
window.addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {cancelAnimationFrame(raf); raf = 0; hint.pause();}
  else {if (hostActive && stage < 4 && !busy && !reducedMotion.matches) hint.play(); ensureLoop();}
});
window.addEventListener('message',event=>{
  if(event.source!==window.parent||event.data?.scope!=='lavivion-suite')return;
  if(event.data.type==='reset')reset();
  if(event.data.type==='sound')setSound(!!event.data.enabled);
  if(event.data.type!=='active'||hostActive===event.data.active)return;
  hostActive=!!event.data.active;
  if(!hostActive){hostPausedAt=performance.now();cancelAnimationFrame(raf);raf=0;hint.pause();}
  else{
    const delta=performance.now()-hostPausedAt;
    idleOrigin+=delta;if(strikeStart>=0)strikeStart+=delta;if(impactAt>=0)impactAt+=delta;
    if(stage<4&&!busy&&!reducedMotion.matches)hint.play();ensureLoop();
  }
});
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) hint.goToAndStop(6,true); else if (stage < 4 && !busy) hint.play();
  if (reducedMotion.matches) updateStage();
  ensureLoop();
});
resize();
Promise.all([...images, pick, element<HTMLImageElement>('logo'), element<HTMLImageElement>('shadow')].map(image => image.decode()))
  .then(() => {ready = true; game.dataset.ready = 'true'; reset();})
  .catch(() => {element('prompt').textContent = 'Не удалось загрузить изображения.\nОткрой HTML-файл заново.';});
