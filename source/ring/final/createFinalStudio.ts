import {
  BackSide, CanvasTexture, Color, CubeCamera, DoubleSide, HalfFloatType, LinearFilter, LinearMipmapLinearFilter, Mesh,
  MeshBasicMaterial, PlaneGeometry, PMREMGenerator, Scene, ShaderMaterial,
  SphereGeometry, SRGBColorSpace, WebGLCubeRenderTarget, WebGLRenderer,
} from 'three';

import {finalSettings} from './finalSettings';

declare const __FINAL_AUDIT__: boolean;

type Card = {position: [number, number, number]; size: [number, number]; radiance: number};

function room(settings: {surround: number[]; cards: Card[]}, gems = false) {
  const scene = new Scene();
  const canvas = document.createElement('canvas');canvas.width = 512;canvas.height = 16;
  const context = canvas.getContext('2d')!;
  const gradient = context.createLinearGradient(0, 0, 512, 0);
  const stops = gems
    ? [[0, '#a0a0a0'], [0.18, '#eeeeee'], [0.45, '#ffffff'], [0.72, '#f4f4f4'], [1, '#b0b0b0']] as const
    : finalSettings.metal.gradient;
  for (const [offset, color] of stops) {
    gradient.addColorStop(offset, color);
  }
  context.fillStyle = gradient;context.fillRect(0, 0, 512, 16);
  const softbox = new CanvasTexture(canvas);softbox.colorSpace = SRGBColorSpace;
  scene.userData.softbox = softbox;
  scene.add(new Mesh(new SphereGeometry(20, 32, 16), new ShaderMaterial({
    side: BackSide, toneMapped: false,
    uniforms: {radiance: {value: settings.surround}},
    vertexShader: 'varying vec3 direction; void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `varying vec3 direction; uniform float radiance[3];
      void main(){float y=normalize(direction).y;
        float v=mix(radiance[0],radiance[1],smoothstep(-0.2,0.9,y));
        v=mix(v,radiance[2],1.0-smoothstep(-0.9,-0.25,y));
        gl_FragColor=vec4(vec3(v),1.0);}`,
  })));
  for (const {position, size, radiance} of settings.cards) {
    const card = new Mesh(new PlaneGeometry(...size), new MeshBasicMaterial({
      color: new Color().setRGB(radiance, radiance, radiance), side: DoubleSide, toneMapped: false,
      map: radiance > 0.9 ? softbox : null,
    }));
    card.position.set(...position);card.lookAt(0, 0, 0);scene.add(card);
  }
  return scene;
}

function release(scene: Scene) {
  scene.traverse((object) => {
    if (object instanceof Mesh) {object.geometry.dispose();(object.material as MeshBasicMaterial).dispose();}
  });
  (scene.userData.softbox as CanvasTexture).dispose();
}

export function createFinalStudio(renderer: WebGLRenderer, pmrem: PMREMGenerator) {
  const metalRoom = room(finalSettings.metal);
  const metal = pmrem.fromScene(metalRoom, 0, 0.1, 100, {size: finalSettings.metal.cubeSize}).texture;
  release(metalRoom);
  const neutrality: {maximumChannelDifference: number; nonzeroPixels: number; checkedPixels: number}[] = [];
  const cube = (settings: typeof finalSettings.halo) => {
    const studio = room(settings, true);
    const target = new WebGLCubeRenderTarget(settings.cubeSize, {
      type: HalfFloatType, minFilter: LinearMipmapLinearFilter, magFilter: LinearFilter, generateMipmaps: true,
    });
    new CubeCamera(0.1, 100, target).update(renderer, studio);release(studio);
    if (__FINAL_AUDIT__) {
      const pixels = new Uint16Array(settings.cubeSize*settings.cubeSize*4);
      let maximumChannelDifference=0;let nonzeroPixels=0;
      for (let face=0;face<6;face++) {
        renderer.readRenderTargetPixels(target,0,0,settings.cubeSize,settings.cubeSize,pixels,face);
        for (let i=0;i<pixels.length;i+=4) {
          maximumChannelDifference=Math.max(maximumChannelDifference,Math.abs(pixels[i]-pixels[i+1]),Math.abs(pixels[i]-pixels[i+2]));
          if (pixels[i]>0) nonzeroPixels++;
        }
      }
      if (maximumChannelDifference!==0 || nonzeroPixels===0) throw new Error('Neutral diamond environment audit failed');
      neutrality.push({maximumChannelDifference,nonzeroPixels,checkedPixels:6*settings.cubeSize*settings.cubeSize});
    }
    return target.texture;
  };
  return {metal, halo: cube(finalSettings.halo), centreAndShank: cube(finalSettings.centreAndShank), neutrality};
}
