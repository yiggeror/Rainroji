import * as THREE from 'three';
import { U, GLSL_COMMON } from '../shaders.js';
import { LAYER_NOREFL } from '../render.js';

// Soft halos around lamps, vending machines and lit windows: they read as
// light scattering in the wet air.
export function makeGlows(scene, list) {
  const n = list.length;
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const pos = new Float32Array(n * 4), colr = new Float32Array(n * 4);
  list.forEach((g, i) => {
    pos.set([g.p.x, g.p.y, g.p.z, g.size], i * 4);
    colr.set([g.color.r, g.color.g, g.color.b, Math.min(9.9, g.strength) + (g.flicker || 0) * 10], i * 4);
  });
  geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(pos, 4));
  geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(colr, 4));
  geo.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */ `
      attribute vec4 aPos;
      attribute vec4 aCol;
      uniform vec4 uFlicker;
      uniform vec2 uCrossing;
      uniform vec4 uBlink;
      varying vec2 vUv;
      varying vec3 vCol;
      varying float vA;
      varying vec3 vWorld;
      void main(){
        vec3 c = aPos.xyz;
        vec4 mv = viewMatrix * vec4(c, 1.0);
        float dist = -mv.z;
        // pull slightly towards the camera so the halo is not cut by its own lamp
        mv.xyz += normalize(-mv.xyz) * min(aPos.w * 0.6, dist * 0.5);
        float s = aPos.w * (1.0 + dist * 0.004);
        mv.xy += position.xy * s;
        gl_Position = projectionMatrix * mv;
        vUv = position.xy;
        float st = aCol.w;
        float fl = 1.0;
        if (st >= 10.0){
          float id = floor(st / 10.0);
          st = st - id * 10.0;
          fl = id < 1.5 ? uFlicker.x : id < 2.5 ? uFlicker.y : id < 3.5 ? uFlicker.z : id < 4.5 ? uCrossing.x : id < 5.5 ? uCrossing.y : id < 6.5 ? uBlink.x : id < 7.5 ? uBlink.y : id < 8.5 ? uBlink.z : uBlink.w;
        }
        vCol = aCol.rgb;
        vA = st * fl * smoothstep(0.4, 2.0, dist);
        vWorld = c;
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_COMMON}
      varying vec2 vUv;
      varying vec3 vCol;
      varying float vA;
      varying vec3 vWorld;
      void main(){
        float r = length(vUv);
        float a = exp(-r * r * 4.0) * 0.8 + exp(-r * 9.0) * 0.5;
        a *= (1.0 - smoothstep(0.8, 1.0, r));
        float dist = length(vWorld - cameraPosition);
        float fog = 1.0 - exp(-pow(dist * uFogDensity, 1.3));
        a *= vA * (1.0 - fog * 0.85);
        gl_FragColor = vec4(vCol * a, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  scene.add(mesh);
  void LAYER_NOREFL;
  const attr = geo.getAttribute('aPos');
  return {
    mesh,
    update() {},
    // move halo i (for lamps on moving things); a = strength multiplier via size
    set(i, p, size) {
      attr.array[i * 4] = p.x;
      attr.array[i * 4 + 1] = p.y;
      attr.array[i * 4 + 2] = p.z;
      if (size !== undefined) attr.array[i * 4 + 3] = size;
      attr.needsUpdate = true;
    },
  };
}
