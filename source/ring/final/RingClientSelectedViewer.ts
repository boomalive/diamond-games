import {
  ACESFilmicToneMapping, Box3, Group, FileLoader, Mesh, MeshPhysicalMaterial,
  PerspectiveCamera, PMREMGenerator, Scene, ShaderMaterial,
  SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/examples/jsm/loaders/DRACOLoader.js';
import {finalDiamondMaterial, updateDiamond} from './FinalDiamondMaterial';
import {diamondMaterial as v6DiamondMaterial} from './V6DiamondMaterial';
import {createClientEnvironment as createV6Environment} from './v6Environment';
import {createFinalStudio} from './createFinalStudio';
import {finalSettings} from './finalSettings';
import {createRoundMap} from '../lighting/createRoundMap';
import {createEmeraldMap} from '../lighting/createEmeraldMap';
import {createInnerLightEnvironment} from '../client/createInnerLightEnvironment';
import {applyInnerLight} from '../client/applyInnerLight';
import type {InnerSurfaceSettings} from '../client/applyInnerLight';

declare const __FINAL_AUDIT__: boolean;

type ViewerDebug = {
  ready: boolean; error?: string; loadMs?: number; angle?: number;
  setPose?: (angle: number, elevation?: number) => void;
  pause?: () => void; render?: () => void; fps?: number;
  renderer?: WebGLRenderer; scene?: Scene; camera?: PerspectiveCamera;
};
declare global {interface Window {ringViewer: ViewerDebug;}}

class PortableDracoLoader extends DRACOLoader {
  async _loadLibrary(file: string, responseType: 'text' | 'arraybuffer') {
    const inline = document.querySelector(file.endsWith('.wasm') ? '#draco-wasm' : '#draco-wrapper')?.textContent;
    if (inline) return responseType === 'text' ? inline : Uint8Array.from(atob(inline.trim()), (c) => c.charCodeAt(0)).buffer;
    return new FileLoader().setResponseType(responseType).loadAsync(`../draco/${file}`);
  }
}

const host = document.querySelector<HTMLElement>('#viewer')!;
const status = document.querySelector<HTMLElement>('#status')!;
const rotation = document.querySelector<HTMLButtonElement>('#rotate')!;
const reset = document.querySelector<HTMLButtonElement>('#reset')!;
const started = performance.now();
const configuration: {product?: string; innerSurface?: InnerSurfaceSettings} = JSON.parse(document.querySelector('#ring-config')?.textContent || '{}');
window.ringViewer = {ready: false};

async function start() {
  const renderer = new WebGLRenderer({antialias: true, alpha: true, powerPreference: 'high-performance'});
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setClearColor(0xffffff, 0);
  host.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', 'Трёхмерная модель кольца');
  renderer.domElement.setAttribute('tabindex', '0');
  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 1, 0.01, 100);
  camera.position.set(4.3, 8.8, 7.7).normalize().multiplyScalar(6.7);
  camera.up.set(-0.65, 1, 0).normalize();
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.085;
  controls.enablePan = false;
  controls.minDistance = 4.5;
  controls.maxDistance = 12;
  controls.minPolarAngle = 0.14;
  controls.maxPolarAngle = Math.PI - 0.14;
  controls.rotateSpeed = 0.62;
  controls.zoomSpeed = 0.7;
  controls.saveState();

  const pmrem = new PMREMGenerator(renderer);
  const studio = createFinalStudio(renderer, pmrem);
  const innerEnv = createInnerLightEnvironment(pmrem);
  const reference = __FINAL_AUDIT__ ? createV6Environment(renderer, pmrem, {
    ...finalSettings.halo, surround: [0.085, 0.18, 0.34],
  }) : null;
  scene.environment = studio.metal;
  pmrem.dispose();

  const cut=configuration.product?.slice(-4,-2);
  const centreEnvironment=cut==='BR'?createRoundMap(renderer,studio.centreAndShank,'accents')
    :cut==='EM'?createEmeraldMap(renderer,studio.centreAndShank,'b'):studio.centreAndShank;
  host.dataset.centrePreset=cut==='BR'?'round-dark-accents':cut==='EM'?'emerald-b':'v12';
  host.dataset.lightingRevision='client-presentation-20261104-v1';
  status.textContent = 'Подготавливаю кольцо…';
  const embedded = document.querySelector('#ring-data')?.textContent?.trim();
  const draco = new PortableDracoLoader().setWorkerLimit(2);
  const loader = new GLTFLoader().setDRACOLoader(draco);
  const gltf = embedded
    ? await loader.parseAsync(Uint8Array.from(atob(embedded), (c) => c.charCodeAt(0)).buffer, '')
    : await loader.loadAsync(configuration.product?`./${configuration.product}.glb`:'./ring-web-v1.glb');
  draco.dispose();
  const model = gltf.scene;
  const bounds = new Box3().setFromObject(model);
  const center = bounds.getCenter(new Vector3());
  const height = bounds.getSize(new Vector3()).y;
  model.position.copy(center).multiplyScalar(-1);
  const normalized = new Group();normalized.add(model);normalized.scale.setScalar(3.2 / height);
  const pivot = new Group();pivot.add(normalized);scene.add(pivot);pivot.rotation.y = 1.25;
  const diamonds: {mesh: Mesh; material: ShaderMaterial; finalMaterial: ShaderMaterial; referenceMaterial: ShaderMaterial | null; hero: boolean; group: 'centre' | 'halo' | 'shank'}[] = [];
  const metalMaterials: MeshPhysicalMaterial[] = [];
  const innerLightAmount = {value: 1};
  model.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    if (o.userData.role === 'diamond' || o.name.startsWith('Diamond')) {
      const hero = o.userData.hero === true || o.name.includes('Centre');
      const metadataGroup = o.userData.finalGroup;
      const group: 'centre' | 'halo' | 'shank' = hero ? 'centre'
        : metadataGroup === 'halo' || metadataGroup === 'shank' ? metadataGroup
        : o.position.y >= finalSettings.diamond.haloMinimumOriginalY ? 'halo' : 'shank';
      const environment = hero ? centreEnvironment : group === 'halo' ? studio.halo : studio.centreAndShank;
      const material = finalDiamondMaterial(o.geometry, environment, hero, finalSettings.diamond[group]);
      const referenceMaterial = __FINAL_AUDIT__ ? v6DiamondMaterial(o.geometry, reference!.diamonds, hero, {
        surfaceReflectionStrength: hero ? 0.12 : 0.22,
      }) : null;
      o.material = material;diamonds.push({mesh: o, material, finalMaterial: material, referenceMaterial, hero, group});
    } else {
      const material = o.material as MeshPhysicalMaterial;
      material.envMap = studio.metal;material.envMapIntensity = 1;
      material.roughness = finalSettings.metal.roughnessMultiplier;
      const mask = applyInnerLight(o, innerEnv, innerLightAmount, configuration.innerSurface);
      host.dataset.innerLightVertices = String(mask.innerVertices);
      metalMaterials.push(material);material.needsUpdate = true;
      if (material.map) material.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      if (material.normalMap) material.normalMap.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    }
  });
  for (const {material} of diamonds) {
    if (material.uniforms.ior.value !== finalSettings.ior) throw new Error('Diamond IOR audit failed');
  }
  host.dataset.ior = String(finalSettings.ior);
  if (configuration.product) host.dataset.product = configuration.product;
  host.dataset.gemGroups = JSON.stringify({centre:diamonds.filter((d)=>d.group==='centre').length,halo:diamonds.filter((d)=>d.group==='halo').length,shank:diamonds.filter((d)=>d.group==='shank').length});
  host.dataset.environment = 'neutral-grayscale';
  if (__FINAL_AUDIT__) host.dataset.neutrality=JSON.stringify(studio.neutrality);

  let needsRender = true;
  const maximumDpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 600 ? 1.5 : 1.75);
  let dpr = maximumDpr;
  const resize = () => {
    const width = host.clientWidth;const heightPx = host.clientHeight;
    renderer.setPixelRatio(dpr);renderer.setSize(width, heightPx, false);host.dataset.renderScale=dpr.toFixed(2);
    camera.aspect = width / heightPx;
    camera.zoom = Math.min(1, camera.aspect / 0.95);camera.updateProjectionMatrix();
    needsRender = true;
  };
  new ResizeObserver(resize).observe(host);resize();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let autoplay = !reducedMotion.matches;
  let interacting = false;
  let resumeAt = 0;
  let visible = true;
  let last = performance.now();
  let frameCount = 0;let sampleTime = last;let fps = 60;
  let qualityAdjusted = false;
  controls.addEventListener('change', () => {needsRender = true;});
  const paint = () => {
    scene.updateMatrixWorld(true);
    for (const {mesh, material} of diamonds) updateDiamond(mesh, material);
    renderer.render(scene, camera);
    needsRender = false;
    window.ringViewer.angle = pivot.rotation.y;
  };
  host.dataset.lightMode = 'client-final-v12';
  const setQuality = (still: boolean) => {
    const high = still || !qualityAdjusted;
    const nextDpr = high ? maximumDpr : Math.max(1, maximumDpr * 0.78);
    if (dpr !== nextDpr) {dpr = nextDpr;resize();}
    // Change pixel density only: keep refraction paths stable between playback and pause.
    for (const {material, hero} of diamonds) material.uniforms.bounces.value = hero ? 12 : 7;
    needsRender = true;
  };
  const updateButton = () => {
    rotation.textContent = autoplay ? 'Ⅱ Пауза' : '▶ Вращать';
    rotation.setAttribute('aria-pressed', String(autoplay));
  };
  rotation.addEventListener('click', () => {autoplay = !autoplay;setQuality(!autoplay);resumeAt = 0;frameCount = 0;sampleTime = performance.now();updateButton();});
  reset.addEventListener('click', () => {controls.enableDamping=false;controls.update();controls.reset();controls.enableDamping=true;resize();pivot.rotation.y = 1.25;resumeAt = performance.now() + 2500;paint();});
  controls.addEventListener('start', () => {interacting = true;setQuality(false);});
  controls.addEventListener('end', () => {interacting = false;resumeAt = performance.now() + 2500;if (!autoplay) setQuality(true);});
  renderer.domElement.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();pivot.rotation.y += event.key === 'ArrowLeft' ? -0.12 : 0.12;resumeAt = performance.now() + 2500;paint();
    }
  });
  new IntersectionObserver(([entry]) => {visible = entry.isIntersecting;}, {threshold: 0.05}).observe(host);
  reducedMotion.addEventListener('change', () => {autoplay = !reducedMotion.matches;updateButton();});
  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();host.classList.remove('ready');status.hidden = false;
    status.textContent = 'Просмотр 3D приостановлен. Обнови страницу, чтобы продолжить.';
  });

  if (__FINAL_AUDIT__) {
    const on = (id: string, action: () => void) => document.querySelector<HTMLButtonElement>(id)?.addEventListener('click',()=>{
      autoplay=false;setQuality(true);updateButton();action();paint();
    });
    const mode = (kind: 'v6' | 'metal' | 'final') => {
      for (const material of metalMaterials) {material.envMap=kind==='v6' ? reference!.metal : studio.metal;material.needsUpdate=true;}
      scene.environment=kind==='v6' ? reference!.metal : studio.metal;
      for (const diamond of diamonds) {
        diamond.material=kind==='final' ? diamond.finalMaterial : diamond.referenceMaterial!;
        diamond.mesh.material=diamond.material;
      }
      host.dataset.auditMode=kind;
    };
    on('#audit-v6',()=>mode('v6'));
    on('#audit-metal',()=>mode('metal'));
    on('#audit-final',()=>mode('final'));
    const pose=(position: number[], angle: number, distance=6.7, target=[0,0,0])=>{
      controls.enableDamping=false;controls.update();controls.target.fromArray(target);
      camera.position.fromArray(position).normalize().multiplyScalar(distance).add(controls.target);
      controls.update();controls.enableDamping=true;pivot.rotation.y=angle;resize();
    };
    on('#audit-default',()=>pose([4.3,8.8,7.7],1.25));
    on('#audit-profile',()=>pose([-2.2,0.6,6.3],0));
    on('#audit-setting',()=>pose([-2.2,0.6,6.3],0,4.5,[0,0.85,0]));
    on('#audit-top',()=>pose([0,10,3],1.25,4.5,[0,0.65,0]));
    on('#audit-road',()=>pose([4.3,8.8,7.7],1.25,4.5,[0.45,0.4,0]));
    const angle=document.querySelector<HTMLInputElement>('#audit-angle');
    angle?.addEventListener('input',()=>{autoplay=false;setQuality(true);updateButton();pivot.rotation.y=Number(angle.value)*Math.PI/180;host.dataset.auditAngle=angle.value;paint();});
    const roughness=document.querySelector<HTMLInputElement>('#audit-roughness');
    roughness?.addEventListener('input',()=>{
      autoplay=false;setQuality(true);updateButton();mode('final');
      for (const diamond of diamonds) diamond.finalMaterial.uniforms.roughness.value=Number(roughness.value)*(diamond.group==='halo' ? 0.014/0.018 : 1);
      host.dataset.auditRoughness=roughness.value;paint();
    });
  }

  window.ringViewer = {
    ready: true, loadMs: performance.now() - started, renderer, scene, camera,
    pause: () => {autoplay = false;setQuality(true);paint();updateButton();},
    setPose: (angle, elevation = 50) => {
      autoplay = false;setQuality(true);updateButton();pivot.rotation.y = angle;
      const distance = camera.position.length();
      camera.position.set(0.487, Math.tan(elevation * Math.PI / 180), 0.873).normalize().multiplyScalar(distance);
      controls.target.set(0, 0, 0);controls.update();paint();
    },
    render: paint,
  };
  Object.assign(window.ringViewer,{
    controls,rotationRoot:pivot,
    resume:()=>{autoplay=!reducedMotion.matches;resumeAt=0;needsRender=true;},
    dispose:()=>{autoplay=false;visible=false;renderer.dispose();renderer.forceContextLoss();},
  });
  controls.update();paint();
  // Compile and render before removing the loading poster.
  host.classList.add('ready');status.hidden = true;updateButton();
  const animate = (time: number) => {
    const dt = Math.min((time - last) / 1000, 0.05);last = time;
    if (visible && !document.hidden) {
      const spinning = autoplay && !interacting && time > resumeAt;
      if (spinning) {
        const advance=(window.ringViewer as typeof window.ringViewer & {advanceRotation?:(delta:number)=>void}).advanceRotation;
        if(advance)advance(dt);else pivot.rotation.y+=dt*Math.PI*2/16;
        needsRender=true;
      }
      controls.update();
      if (needsRender) {paint();frameCount++;}
      if (time - sampleTime > 2000) {
        fps = frameCount * 1000 / (time - sampleTime);window.ringViewer.fps = fps;host.dataset.frameRate=fps.toFixed(1);
        frameCount = 0;sampleTime = time;
        // Reduce GPU work once on slow devices, without changing geometry or maps.
        if (!qualityAdjusted && autoplay && fps < 26) {
          qualityAdjusted = true;setQuality(false);
        }
      }
    } else {frameCount = 0;sampleTime = time;}
    requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);
}

start().catch((error: Error) => {
  window.ringViewer.error = error.message;
  status.textContent = 'Не удалось открыть 3D. Попробуй актуальную версию Chrome, Safari или Edge.';
  console.error(error);
});
