import {
  BackSide, Color, CubeCamera, CubeTexture, DoubleSide, Euler, HalfFloatType,
  LinearFilter, LinearMipmapLinearFilter, Matrix3, Matrix4, Mesh, MeshBasicMaterial,
  PlaneGeometry, Scene, ShaderMaterial, SphereGeometry, WebGLCubeRenderTarget, WebGLRenderer,
} from 'three';

type Triple = [number, number, number];
type Card = {position: Triple; size: [number, number]; radiance: number; horizontal?: boolean};
export type EmeraldMapMode = 'v12' | 'a' | 'b' | 'c';
export const emeraldMapSettings: Record<'a' | 'b' | 'c', {rotation: Triple; cards: Card[]}> = {
  a: {
    rotation: [0, 0, 0],
    cards: [
      {position: [-.28, 4, 0], size: [.09, .975], radiance: .004, horizontal: true},
      {position: [.28, 4, 0], size: [.09, .975], radiance: .004, horizontal: true},
      {position: [-3, 3.2, -2], size: [.9375, 1.875], radiance: .006},
    ],
  },
  b: {
    rotation: [0, 0, 0],
    cards: [
      {position: [-.245, 4, 0], size: [.078, 1.05], radiance: .004, horizontal: true},
      {position: [.245, 4, 0], size: [.078, 1.05], radiance: .004, horizontal: true},
      {position: [-3, 3.2, -2], size: [.9375, 1.875], radiance: .006},
    ],
  },
  c: {
    rotation: [0, 0, 0],
    cards: [
      {position: [-.30, 4, 0], size: [.085, 1.05], radiance: .004, horizontal: true},
      {position: [.30, 4, 0], size: [.085, 1.05], radiance: .004, horizontal: true},
      {position: [-.46, 4, 0], size: [.10, .90], radiance: .015, horizontal: true},
      {position: [.46, 4, 0], size: [.10, .90], radiance: .015, horizontal: true},
      {position: [-3, 3.2, -2], size: [.9375, 1.875], radiance: .006},
    ],
  },
};

export function createEmeraldMap(renderer: WebGLRenderer, base: CubeTexture, mode: Exclude<EmeraldMapMode, 'v12'>,
  probe?: {rotation?: Triple; scale?: number; spread?: number}) {
  const settings = emeraldMapSettings[mode];
  const room = new Scene();
  const rotation = new Matrix3().setFromMatrix4(new Matrix4().makeRotationFromEuler(new Euler(...(probe?.rotation ?? settings.rotation)))).transpose();
  room.add(new Mesh(new SphereGeometry(20, 24, 12), new ShaderMaterial({
    side: BackSide, toneMapped: false,
    uniforms: {environment: {value: base}, rotation: {value: rotation}},
    vertexShader: 'varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'uniform samplerCube environment;uniform mat3 rotation;varying vec3 direction;void main(){gl_FragColor=textureCube(environment,normalize(rotation*direction));}',
  })));
  for (const card of settings.cards) {
    const scale = probe?.scale ?? 1, spread = probe?.spread ?? 1;
    const panel = new Mesh(new PlaneGeometry(card.size[0] * scale, card.size[1] * scale),
      new MeshBasicMaterial({color: new Color().setRGB(card.radiance, card.radiance, card.radiance), side: DoubleSide, toneMapped: false}));
    panel.position.set(card.position[0] * spread, card.position[1], card.position[2] * spread);
    if (card.horizontal) panel.rotation.x = -Math.PI / 2;
    else panel.lookAt(0, 0, 0);
    room.add(panel);
  }
  const target = new WebGLCubeRenderTarget(512, {
    type: HalfFloatType, minFilter: LinearMipmapLinearFilter, magFilter: LinearFilter, generateMipmaps: true,
  });
  new CubeCamera(.1, 100, target).update(renderer, room);
  room.traverse(o => {if (o instanceof Mesh) {o.geometry.dispose();(o.material as ShaderMaterial).dispose();}});
  target.texture.userData.reviewTarget = target;
  return target.texture;
}
