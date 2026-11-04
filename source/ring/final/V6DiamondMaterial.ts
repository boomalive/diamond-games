import {
  BufferGeometry, Color, CubeTexture, FrontSide, Matrix4, Mesh,
  ShaderMaterial, Vector3,
} from 'three';
import {MeshBVH, MeshBVHUniformStruct, SAH, shaderStructs, shaderIntersectFunction} from 'three-mesh-bvh';

// Internal facet tracing uses the MIT-licensed three-mesh-bvh intersection routines.
// Unlike a surface-only glass material, this follows total internal reflection.
export function diamondMaterial(geometry: BufferGeometry, environment: CubeTexture, hero: boolean, appearance: {surfaceReflectionStrength?: number} = {}) {
  geometry.computeBoundingBox();
  const extent = geometry.boundingBox!.getSize(new Vector3()).length();
  // Unit-size BVHs prevent micron-sized stones from hitting their entry facet
  // again due to the ray routine's numerical tolerance.
  const localScale = 1 / extent;
  const bvh = new MeshBVHUniformStruct();
  bvh.updateFrom(new MeshBVH(geometry.clone().scale(localScale, localScale, localScale), {strategy: SAH, targetLeafSize: 4}));
  const material = new ShaderMaterial({
    side: FrontSide,
    uniforms: {
      bvh: {value: bvh},
      envMap: {value: environment},
      worldInverse: {value: new Matrix4()},
      worldMatrix: {value: new Matrix4()},
      epsilon: {value: 0.000015},
      localScale: {value: localScale},
      ior: {value: 2.42},
      bounces: {value: hero ? 12 : 7},
      dispersion: {value: hero ? 0.0018 : 0},
      tint: {value: new Color(0.99, 0.998, 1)},
      surfaceReflectionStrength: {value: appearance.surfaceReflectionStrength ?? 1},
    },
    vertexShader: `
      varying vec3 worldPosition;
      varying vec3 worldNormal;
      void main() {
        worldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        worldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * vec4(worldPosition, 1.0);
      }
    `,
    fragmentShader: `
      precision highp isampler2D;
      precision highp usampler2D;
      ${shaderStructs}
      ${shaderIntersectFunction}
      uniform BVH bvh;
      uniform samplerCube envMap;
      uniform mat4 worldInverse;
      uniform mat4 worldMatrix;
      uniform float epsilon;
      uniform float localScale;
      uniform float ior;
      uniform float bounces;
      uniform float dispersion;
      uniform vec3 tint;
      uniform float surfaceReflectionStrength;
      varying vec3 worldPosition;
      varying vec3 worldNormal;
      vec3 traceGem(vec3 incoming, vec3 n, float eta) {
        vec3 ray = refract(incoming, n, 1.0 / eta);
        vec3 origin = (worldInverse * vec4(worldPosition, 1.0)).xyz * localScale;
        ray = normalize((worldInverse * vec4(ray, 0.0)).xyz);
        origin += ray * epsilon * 4.0;
        for (int i = 0; i < 20; i++) {
          if (float(i) >= bounces) break;
          uvec4 indices = uvec4(0u);
          vec3 faceNormal = vec3(0.0);
          vec3 bary = vec3(0.0);
          float side = 1.0;
          float distance = 0.0;
          bool hit = bvhIntersectFirstHit(bvh, origin, ray, indices, faceNormal, bary, side, distance);
          if (!hit) break;
          vec3 position = origin + ray * distance;
          // The BVH normal faces the incoming ray, including at internal faces.
          vec3 exiting = refract(ray, faceNormal, eta);
          if (dot(exiting, exiting) > 0.000001) {
            ray = exiting;
            break;
          }
          ray = reflect(ray, faceNormal);
          origin = position + ray * epsilon * 4.0;
        }
        return normalize((worldMatrix * vec4(ray, 0.0)).xyz);
      }
      vec3 sampleStudio(vec3 direction) {
        // Fixed sharp mip preserves the individual reflected facets.
        return textureLod(envMap, direction, 0.0).rgb;
      }
      void main() {
        vec3 n = normalize(worldNormal);
        vec3 incoming = normalize(worldPosition - cameraPosition);
        vec3 middle = traceGem(incoming, n, ior);
        vec3 transmitted = sampleStudio(middle);
        if (dispersion > 0.0) {
          vec3 red = traceGem(incoming, n, ior * (1.0 - dispersion));
          vec3 blue = traceGem(incoming, n, ior * (1.0 + dispersion));
          transmitted = vec3(sampleStudio(red).r, transmitted.g, sampleStudio(blue).b);
        }
        float f0 = pow((ior - 1.0) / (ior + 1.0), 2.0);
        float fresnel = f0 + (1.0 - f0) * pow(1.0 - clamp(dot(-incoming, n), 0.0, 1.0), 5.0);
        vec3 reflected = sampleStudio(reflect(incoming, n));
        // Art direction: reduce the broad surface veil while keeping the
        // internal facet tracing and grazing-angle edge reflection intact.
        float grazing = pow(1.0 - clamp(dot(-incoming, n), 0.0, 1.0), 4.0);
        fresnel *= mix(surfaceReflectionStrength, 1.0, grazing);
        gl_FragColor = vec4(mix(transmitted, reflected, fresnel) * tint, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  return material;
}

export function updateDiamond(mesh: Mesh, material: ShaderMaterial) {
  material.uniforms.worldInverse.value.copy(mesh.matrixWorld).invert();
  material.uniforms.worldMatrix.value.copy(mesh.matrixWorld);
}
