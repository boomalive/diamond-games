import {
  BackSide, CanvasTexture, Color, DoubleSide, Mesh, MeshBasicMaterial,
  PlaneGeometry, PMREMGenerator, Scene, ShaderMaterial, SphereGeometry,
  SRGBColorSpace,
} from 'three';

type Card = {position: [number, number, number]; size: [number, number]; radiance: number};

export const innerLightSettings = {
  surround: [0.76, 1.0, 1.10], blur: 0, roughnessMultiplier: 0.60,
  cards: [
    {position: [-4, 3, 4], size: [6.5, 8], radiance: 2.1},
    {position: [4, 1, 2], size: [4.5, 7], radiance: 1.8},
    {position: [0, 5, -1], size: [7.0, 6.0], radiance: 2.2},
    {position: [-3, 1, -4], size: [5.5, 7], radiance: 1.5},
    {position: [3, -2, -4], size: [5.5, 6], radiance: 1.5},
    {position: [0, -4, 2], size: [7.0, 6], radiance: 1.7},
    {position: [1.0, 1.0, 3.4], size: [0.36, 7], radiance: 0.001},
    {position: [-3.0, 0.1, 1.2], size: [0.30, 6], radiance: 0.002},
    {position: [2.5, 0.0, -3.0], size: [0.34, 7], radiance: 0.001},
  ] as Card[],
  gradient: [[0, '#b8b8b8'], [0.18, '#eeeeee'], [0.45, '#ffffff'], [0.72, '#f6f6f6'], [1, '#c6c6c6']] as const,
};

export function createInnerLightEnvironment(pmrem: PMREMGenerator) {
  const room = new Scene();
  room.add(new Mesh(new SphereGeometry(20, 32, 16), new ShaderMaterial({
    side: BackSide, toneMapped: false,
    uniforms: {radiance: {value: innerLightSettings.surround}},
    vertexShader: 'varying vec3 direction; void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `varying vec3 direction; uniform float radiance[3];
      void main(){float y=normalize(direction).y;
        float v=mix(radiance[0],radiance[1],smoothstep(-0.2,0.9,y));
        v=mix(v,radiance[2],1.0-smoothstep(-0.9,-0.25,y));
        gl_FragColor=vec4(vec3(v),1.0);}`,
  })));
  const canvas = document.createElement('canvas');canvas.width = 512;canvas.height = 16;
  const context = canvas.getContext('2d')!;
  const gradient = context.createLinearGradient(0, 0, 512, 0);
  for (const [offset, color] of innerLightSettings.gradient) gradient.addColorStop(offset, color);
  context.fillStyle = gradient;context.fillRect(0, 0, 512, 16);
  const softbox = new CanvasTexture(canvas);softbox.colorSpace = SRGBColorSpace;
  for (const {position, size, radiance} of innerLightSettings.cards) {
    const card = new Mesh(new PlaneGeometry(...size), new MeshBasicMaterial({
      color: new Color().setRGB(radiance, radiance, radiance), side: DoubleSide,
      toneMapped: false, map: radiance > 0.9 ? softbox : null,
    }));
    card.position.set(...position);card.lookAt(0, 0, 0);room.add(card);
  }
  const metal = pmrem.fromScene(room, innerLightSettings.blur).texture;
  room.traverse((object) => {
    if (object instanceof Mesh) {object.geometry.dispose();(object.material as MeshBasicMaterial).dispose();}
  });
  softbox.dispose();
  return metal;
}
