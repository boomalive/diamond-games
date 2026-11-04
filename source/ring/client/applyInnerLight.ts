import {BufferAttribute, Mesh, MeshPhysicalMaterial, ShaderChunk, Texture} from 'three';

const smooth = (a: number, b: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const innerSurfaceSettings = {
  inwardNormalBlend: [0.42, 0.90], radialBlendMeters: [0.00805, 0.00865],
  upperBoundaryMeters: [0.0055, 0.0075],
};

export type InnerSurfaceSettings = typeof innerSurfaceSettings;

// The supplied GLB places the hoop centre at the model origin. Its metal node
// has a translation, so classify vertices back in the original model frame.
export function applyInnerLight(mesh: Mesh, environment: Texture, amount: {value: number}, settings: InnerSurfaceSettings = innerSurfaceSettings) {
  const position = mesh.geometry.getAttribute('position');
  const normal = mesh.geometry.getAttribute('normal');
  const mask = new Float32Array(position.count);
  let selected = 0;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i) + mesh.position.x;
    const y = position.getY(i) + mesh.position.y;
    const radius = Math.hypot(x, y);
    const inward = -(x * normal.getX(i) + y * normal.getY(i)) / Math.max(radius, 1e-8);
    mask[i] = smooth(...settings.inwardNormalBlend as [number, number], inward)
      * (1 - smooth(...settings.radialBlendMeters as [number, number], radius))
      * (1 - smooth(...settings.upperBoundaryMeters as [number, number], y));
    if (mask[i] > 0.5) selected++;
  }
  mesh.geometry.setAttribute('innerLightMask', new BufferAttribute(mask, 1));
  const material = mesh.material as MeshPhysicalMaterial;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.innerLightMap = {value: environment};
    shader.uniforms.innerLightAmount = amount;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      attribute float innerLightMask;
      varying float vInnerLightMask;`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvInnerLightMask = innerLightMask;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      uniform sampler2D innerLightMap;
      uniform float innerLightAmount;
      varying float vInnerLightMask;`);
    const environmentChunk = ShaderChunk.envmap_physical_pars_fragment
      .replace('vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );', `
        vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
        if (innerLightAmount > 0.0 && vInnerLightMask > 0.0) {
          vec4 fill = textureCubeUV(innerLightMap, envMapRotation * worldNormal, 1.0);
          envMapColor = mix(envMapColor, fill, clamp(vInnerLightMask * innerLightAmount, 0.0, 1.0));
        }`)
      .replace('vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );', `
        vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
        if (innerLightAmount > 0.0 && vInnerLightMask > 0.0) {
          vec4 fill = textureCubeUV(innerLightMap, envMapRotation * reflectVec, roughness);
          envMapColor = mix(envMapColor, fill, clamp(vInnerLightMask * innerLightAmount, 0.0, 1.0));
        }`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <envmap_physical_pars_fragment>', environmentChunk);
  };
  material.customProgramCacheKey = () => 'ring-inner-surface-light-v4';
  material.needsUpdate = true;
  return {vertices: position.count, innerVertices: selected};
}
