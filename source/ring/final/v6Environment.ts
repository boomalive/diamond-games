import {
  BackSide, CanvasTexture, Color, CubeCamera, DoubleSide, HalfFloatType, LinearFilter, Mesh,
  MeshBasicMaterial, PlaneGeometry, PMREMGenerator, Scene, ShaderMaterial,
  SphereGeometry, SRGBColorSpace, WebGLCubeRenderTarget, WebGLRenderer,
} from 'three';

type Card = {position: [number, number, number]; size: [number, number]; radiance: number};

// Revision from the client's 15 October references: crisp negative fill for
// metal, reshaped and less intense lights for the diamond's internal facets.
export const clientStudioSettings = {
  metal: {
    surround: [0.20, 0.38, 0.70], blur: 0, roughnessMultiplier: 0.60,
    cards: [
      {position: [-4, 3, 4], size: [4.8, 7], radiance: 2.1},
      {position: [4, 1, 2], size: [2.5, 7], radiance: 1.8},
      {position: [0, 5, -1], size: [5.5, 4.5], radiance: 2.2},
      {position: [-3, 1, -4], size: [4.0, 7], radiance: 1.5},
      {position: [3, -2, -4], size: [4.0, 6], radiance: 1.5},
      {position: [0, -4, 2], size: [6.0, 5], radiance: 1.7},
      {position: [1, 1, 3.4], size: [1.15, 7], radiance: 0.001},
      {position: [-3.0, 0.1, 1.2], size: [0.9, 6], radiance: 0.002},
      {position: [2.5, 0.0, -3.0], size: [1.0, 7], radiance: 0.001},
      {position: [-0.9, 0.1, 3.2], size: [0.28, 6], radiance: 0.003},
      {position: [3.2, 0.2, 1.0], size: [0.32, 7], radiance: 0.002},
    ] as Card[],
  },
  diamonds: {
    surround: [0.18, 0.34, 0.58], cubeSize: 512,
    cards: [
      {position: [-4, 4, 4], size: [5.0, 6.0], radiance: 2.3},
      {position: [4, 2, 3], size: [3.0, 6.0], radiance: 2.6},
      {position: [0, 5, -1], size: [6.0, 5.0], radiance: 2.2},
      {position: [-3, 0, -5], size: [4.0, 6.0], radiance: 1.9},
      {position: [3, -2, -4], size: [3.0, 5.0], radiance: 2.1},
      {position: [0, -5, 1], size: [6.0, 6.0], radiance: 1.8},
      {position: [1.5, 3.5, 2.5], size: [0.65, 1.8], radiance: 2.1},
      {position: [1, 1, 3.4], size: [0.85, 6], radiance: 0.004},
      {position: [-3, 0.1, 1.2], size: [1.0, 6], radiance: 0.006},
      {position: [2.5, 0, -3], size: [0.8, 6], radiance: 0.004},
    ] as Card[],
  },
};

function room(settings: {surround: number[]; cards: Card[]}, gems = false) {
  const scene = new Scene();
  const canvas = document.createElement('canvas');canvas.width = 512;canvas.height = 16;
  const context = canvas.getContext('2d')!;
  const gradient = context.createLinearGradient(0, 0, 512, 0);
  const stops = gems
    ? [[0, '#a0a0a0'], [0.18, '#eeeeee'], [0.45, '#ffffff'], [0.72, '#f4f4f4'], [1, '#b0b0b0']] as const
    : [[0, '#4f4f4f'], [0.18, '#d7d7d7'], [0.45, '#ffffff'], [0.72, '#eeeeee'], [1, '#777777']] as const;
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

export function createClientEnvironment(renderer: WebGLRenderer, pmrem: PMREMGenerator, diamondSettings = clientStudioSettings.diamonds) {
  const metalRoom = room(clientStudioSettings.metal);
  const metal = pmrem.fromScene(metalRoom, clientStudioSettings.metal.blur).texture;
  const diamondRoom = room(diamondSettings, true);
  const diamondCube = new WebGLCubeRenderTarget(diamondSettings.cubeSize, {
    type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter,
  });
  new CubeCamera(0.1, 100, diamondCube).update(renderer, diamondRoom);
  for (const scene of [metalRoom, diamondRoom]) {
    scene.traverse((object) => {
      if (object instanceof Mesh) {object.geometry.dispose();(object.material as MeshBasicMaterial).dispose();}
    });
    (scene.userData.softbox as CanvasTexture).dispose();
  }
  return {metal, diamonds: diamondCube.texture};
}
