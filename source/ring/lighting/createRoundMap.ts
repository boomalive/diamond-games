import {
  BackSide, CircleGeometry, Color, CubeCamera, CubeTexture, DoubleSide, Euler,
  HalfFloatType, LinearFilter, LinearMipmapLinearFilter, Matrix3, Matrix4,
  Mesh, MeshBasicMaterial, PlaneGeometry, Scene, ShaderMaterial, SphereGeometry,
  WebGLCubeRenderTarget, WebGLRenderer,
} from 'three';

export type RoundMapMode = 'v12' | 'rotated' | 'accents';
export const roundMapSettings = {
  rotation: [-1.05, .35, .12] as [number, number, number],
  aperture: {position: [0, 4, 0] as [number, number, number], radius: .70, radiance: .004},
  sideCard: {position: [-3, 3.2, -2] as [number, number, number], size: [1.65, 2.8] as [number, number], radiance: .006},
};

export function createRoundMap(renderer: WebGLRenderer, base: CubeTexture, mode: Exclude<RoundMapMode, 'v12'>,
  probe?: {rotation?: [number, number, number]; radius?: number}) {
  const room = new Scene();
  const angles = mode === 'rotated' ? probe?.rotation ?? roundMapSettings.rotation : [0, 0, 0];
  const rotation = new Matrix3().setFromMatrix4(new Matrix4().makeRotationFromEuler(new Euler(...angles))).transpose();
  room.add(new Mesh(new SphereGeometry(20, 24, 12), new ShaderMaterial({
    side: BackSide, toneMapped: false,
    uniforms: {environment: {value: base}, rotation: {value: rotation}},
    vertexShader: 'varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'uniform samplerCube environment;uniform mat3 rotation;varying vec3 direction;void main(){gl_FragColor=textureCube(environment,normalize(rotation*direction));}',
  })));
  if (mode === 'accents') {
    const a = roundMapSettings.aperture, c = roundMapSettings.sideCard;
    for (const [geometry, position, radiance] of [
      [new CircleGeometry(probe?.radius ?? a.radius, 96), a.position, a.radiance],
      [new PlaneGeometry(...c.size), c.position, c.radiance],
    ] as const) {
      const card = new Mesh(geometry, new MeshBasicMaterial({color: new Color().setRGB(radiance, radiance, radiance), side: DoubleSide, toneMapped: false}));
      card.position.set(...position);card.lookAt(0, 0, 0);room.add(card);
    }
  }
  const target = new WebGLCubeRenderTarget(512, {
    type: HalfFloatType, minFilter: LinearMipmapLinearFilter, magFilter: LinearFilter, generateMipmaps: true,
  });
  new CubeCamera(.1, 100, target).update(renderer, room);
  room.traverse(o => {if (o instanceof Mesh) {o.geometry.dispose();(o.material as ShaderMaterial).dispose();}});
  target.texture.userData.reviewTarget = target;
  return target.texture;
}
