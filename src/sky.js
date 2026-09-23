import * as THREE from 'three';
import { U, GLSL_COMMON } from './shaders.js';

// Overcast sky dome: layered, slowly drifting cloud masses painted in soft greys.
export function makeSky() {
  const geo = new THREE.SphereGeometry(1800, 48, 24);
  const mat = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_COMMON}
      varying vec3 vDir;
      float warp(vec2 p){
        vec2 q = vec2(fbm(p), fbm(p + vec2(5.2, 1.3)));
        return fbm(p + 0.9 * q);
      }
      void main(){
        vec3 d = normalize(vDir);
        vec3 c = skyGradient(d);
        float h = max(d.y, 0.0);
        if (d.y > -0.02){
          vec3 lh = normalize(vec3(uLightDir.x, 0.0, uLightDir.z));
          // project on a cloud plane; drifts slowly with the wind
          vec2 uv = d.xz / (h + 0.12);
          vec2 drift = vec2(uTime * 0.0045, uTime * 0.0016);
          vec2 p = uv * 0.75 + drift;
          float n = warp(p);
          float nl = warp(p + lh.xz * 0.06);
          n = clamp((n - 0.28) / 0.44, 0.0, 1.0);
          nl = clamp((nl - 0.28) / 0.44, 0.0, 1.0);
          // coverage: heavy deck broken into rolling masses
          float dens = smoothstep(0.25, 0.6, n);
          float thick = smoothstep(0.55, 0.95, n);
          float rim = clamp((n - nl) * 3.5, -1.0, 1.0);
          vec3 belly = vec3(0.33, 0.37, 0.43);
          vec3 mid = vec3(0.47, 0.52, 0.58);
          vec3 lit = vec3(0.6, 0.63, 0.67);
          vec3 cc = mix(mid, lit, clamp(0.35 + 0.65 * rim, 0.0, 1.0));
          cc = mix(cc, belly, thick * 0.75 * (1.0 - max(rim, 0.0)));
          float fade = smoothstep(0.0, 0.18, h);
          c = mix(c, cc, dens * fade * 0.85);
          // pale gaps where the deck thins
          float gap = (1.0 - dens) * smoothstep(0.55, 0.8, fbm(p * 0.6 + 12.0));
          c = mix(c, mix(uSkyGlow, vec3(0.86, 0.88, 0.9), 0.3), gap * 0.45 * fade);
          // low ragged scud racing below the deck
          vec2 p2 = d.xz / (h + 0.05) * 1.3 + vec2(uTime * 0.014, uTime * 0.005);
          float s = fbm(p2 * 0.9 + 3.0) * 0.65 + fbm(p2 * 2.6) * 0.35;
          float scud = smoothstep(0.55, 0.75, s) * smoothstep(0.02, 0.1, h) * (1.0 - smoothstep(0.3, 0.6, h));
          c = mix(c, mix(uSkyMid, belly, 0.4), scud * 0.5);
          // haze near the horizon (rain curtain)
          c = mix(c, uSkyHorizon, (1.0 - smoothstep(0.0, 0.14, h)) * 0.75);
        }
        gl_FragColor = vec4(c, 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  return sky;
}
