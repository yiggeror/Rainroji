import * as THREE from 'three';
import { U, GLSL_COMMON, GLSL_LIGHTS } from '../shaders.js';
import { makeRng } from '../util.js';

// ---------------------------------------------------------------------------
// Rain: thin falling streaks in a box that follows the camera (hidden under
// roofs using the rain height map), splashes on every surface, drips from
// eaves and down-pipes, and water running along the street gutters.
// ---------------------------------------------------------------------------
const RAIN_DIR = new THREE.Vector3(0.12, -1, 0.05).normalize();

function quadGeo() {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

const RAIN_COMMON = /* glsl */ `
uniform sampler2D uRainMap;
uniform mat4 uRainMat;
uniform mat4 uRainInv;
uniform float uRainOn;
// true if p is below the first surface hit by rain (i.e. sheltered)
float sheltered(vec3 p){
  if (uRainOn < 0.5) return 0.0;
  vec4 c = uRainMat * vec4(p, 1.0);
  vec2 uv = c.xy * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  float d = texture(uRainMap, uv).r;
  return step(d + 0.002, c.z * 0.5 + 0.5);
}
`;

function makeStreaks(count, box, len, width, opacity, speed, seed) {
  const g = quadGeo();
  const rng = makeRng(seed);
  const a = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) a.set([rng.next(), rng.next(), rng.next(), rng.next()], i * 4);
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(a, 4));
  g.instanceCount = count;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...U,
      uBox: { value: new THREE.Vector3(...box) },
      uLen: { value: len },
      uWidth: { value: width },
      uOpacity: { value: opacity },
      uSpeed: { value: speed },
      uDir: { value: RAIN_DIR },
      uPix: { value: 1 / 900 },
    },
    vertexShader: /* glsl */ `
      ${RAIN_COMMON}
      attribute vec4 aSeed;
      uniform float uTime;
      uniform vec3 uBox;
      uniform float uLen, uWidth, uSpeed, uPix;
      uniform vec3 uDir;
      varying vec2 vUv;
      varying float vFade;
      varying vec3 vWorld;
      void main(){
        float sp = uSpeed * (0.8 + 0.4 * aSeed.w);
        vec3 p = aSeed.xyz * uBox + uDir * (uTime * sp);
        vec3 base = cameraPosition - uBox * vec3(0.5, 0.62, 0.5);
        p = base + mod(p - base, uBox);
        vec3 toCam = cameraPosition - p;
        float dist = length(toCam);
        vec3 side = normalize(cross(uDir, toCam / dist));
        // keep streaks at least ~0.7 px wide, fading instead of thickening
        float px = dist * uPix;
        float w = max(uWidth, px * 0.7);
        float thin = uWidth / w;
        float L = uLen * (0.75 + 0.5 * aSeed.w);
        vec3 pos = p + side * (position.x - 0.5) * w + uDir * (position.y - 0.5) * L;
        vWorld = pos;
        float hide = sheltered(p + uDir * 0.3);
        vFade = thin * (1.0 - hide) * smoothstep(0.25, 1.2, dist) * (1.0 - smoothstep(uBox.x * 0.42, uBox.x * 0.5, length(toCam.xz)));
        vUv = position.xy;
        gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
        if (hide > 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_COMMON}
      ${GLSL_LIGHTS}
      uniform float uOpacity;
      varying vec2 vUv;
      varying float vFade;
      varying vec3 vWorld;
      void main(){
        float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
        float along = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
        float a = across * along * uOpacity * vFade;
        vec3 sp;
        vec3 lit = localLights(vWorld, normalize(cameraPosition - vWorld), normalize(cameraPosition - vWorld), 0.0, sp);
        vec3 c = mix(uSkyHorizon, vec3(0.92, 0.95, 1.0), 0.35) * 0.85 + lit * 0.9;
        gl_FragColor = vec4(c, a);
      }`,
    transparent: true,
    depthWrite: false,
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  m.renderOrder = 6;
  return m;
}

// Splashes: little crowns popping on whatever surface the rain hits
function makeSplashes(count, area, seed) {
  const g = quadGeo();
  const rng = makeRng(seed);
  const a = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) a.set([rng.next(), rng.next(), rng.next(), rng.next()], i * 4);
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(a, 4));
  g.instanceCount = count;
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U, uArea: { value: area } },
    vertexShader: /* glsl */ `
      ${RAIN_COMMON}
      attribute vec4 aSeed;
      uniform float uTime;
      uniform float uArea;
      varying vec2 vUv;
      varying float vLife;
      varying float vFade;
      varying vec3 vWorld;
      float h1(float n){ return fract(sin(n * 127.1) * 43758.5453); }
      void main(){
        float life = 0.42;
        float t = uTime / life + aSeed.w * 10.0;
        float cyc = floor(t);
        float ph = fract(t);
        vec2 r = vec2(h1(cyc * 1.7 + aSeed.x * 91.0), h1(cyc * 3.1 + aSeed.y * 57.0));
        // choose a point in the rain-map space around the camera
        vec2 xz = cameraPosition.xz + (r - 0.5) * uArea;
        vec4 c = uRainMat * vec4(xz.x, 0.0, xz.y, 1.0);
        vec2 uv = c.xy * 0.5 + 0.5;
        float d = texture(uRainMap, uv).r;
        vec4 w = uRainInv * vec4(c.xy, d * 2.0 - 1.0, 1.0);
        vec3 p = w.xyz / w.w;
        vec3 toCam = cameraPosition - p;
        float dist = length(toCam);
        vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
        float s = (0.035 + 0.05 * aSeed.z) * (0.7 + 0.6 * ph);
        vec3 pos = p + right * (position.x - 0.5) * s * 2.2 + vec3(0.0, 1.0, 0.0) * position.y * s * 1.1;
        vUv = position.xy;
        vLife = ph;
        vWorld = p;
        vFade = (d < 0.9999 ? 1.0 : 0.0) * (1.0 - smoothstep(uArea * 0.3, uArea * 0.5, length(toCam.xz))) * smoothstep(0.4, 1.5, dist);
        gl_Position = projectionMatrix * viewMatrix * vec4(pos + vec3(0.0, 0.01, 0.0), 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_COMMON}
      varying vec2 vUv;
      varying float vLife;
      varying float vFade;
      varying vec3 vWorld;
      void main(){
        vec2 q = vec2((vUv.x - 0.5) * 2.0, vUv.y);
        // crown: a thin arc plus a few flying droplets
        float r = length(vec2(q.x, (q.y - 0.05) * 1.6));
        float ring = smoothstep(0.12, 0.0, abs(r - vLife * 0.9)) * step(q.y, 0.55);
        float drops = 0.0;
        for (int i = 0; i < 4; i++){
          float fi = float(i);
          float ang = -0.9 + fi * 0.6;
          vec2 dp = vec2(sin(ang) * vLife * 0.9, 0.1 + (1.0 - (vLife - 0.5) * (vLife - 0.5) * 4.0) * 0.7);
          drops += smoothstep(0.08, 0.0, length(q - dp));
        }
        float a = (ring * 0.35 + drops * 0.8) * (1.0 - vLife) * (1.0 - vLife) * vFade * 0.32;
        if (a < 0.003) discard;
        vec3 c = mix(uSkyHorizon, vec3(1.0), 0.4);
        gl_FragColor = vec4(c, a);
      }`,
    transparent: true,
    depthWrite: false,
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  m.renderOrder = 7;
  return m;
}

// Eave drips / spouts: instances are re-filled with the points nearest to the camera
function makeDrips(max) {
  const g = quadGeo();
  const a = new Float32Array(max * 4), b = new Float32Array(max * 4);
  g.setAttribute('aP', new THREE.InstancedBufferAttribute(a, 4)); // xyz, fall height
  g.setAttribute('aQ', new THREE.InstancedBufferAttribute(b, 4)); // period, phase, kind, size
  g.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */ `
      attribute vec4 aP;
      attribute vec4 aQ;
      uniform float uTime;
      varying vec2 vUv;
      varying float vKind;
      varying float vA;
      varying vec3 vWorld;
      void main(){
        float period = aQ.x;
        float t = mod(uTime + aQ.y * period, period);
        float fallT = sqrt(2.0 * aP.w / 9.8);
        vec3 p = aP.xyz;
        vec3 toCam = cameraPosition - p;
        vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
        float kind = aQ.z;
        vec3 pos;
        float a = 1.0;
        if (kind < 0.5){
          // single falling drop, stretched by speed
          float y = 0.5 * 9.8 * t * t;
          float v = 9.8 * t;
          float len = 0.02 + v * 0.018;
          bool landed = t > fallT;
          if (landed){
            // tiny splash ring at the landing spot
            float st = (t - fallT) / 0.25;
            a = st < 1.0 ? (1.0 - st) : 0.0;
            float s = 0.05 + st * 0.12;
            pos = p - vec3(0.0, aP.w - 0.01, 0.0) + right * (position.x - 0.5) * s * 2.0 + vec3(0.0, position.y * s * 0.5, 0.0);
            vKind = 1.0;
          } else {
            pos = p - vec3(0.0, y, 0.0) + right * (position.x - 0.5) * aQ.w + vec3(0.0, (position.y - 0.5) * len, 0.0);
            vKind = 0.0;
          }
        } else {
          // continuous thin stream (down-pipe outlet)
          float h = min(aP.w, 0.6);
          pos = p + right * (position.x - 0.5) * aQ.w - vec3(0.0, position.y * h, 0.0);
          vKind = 2.0;
        }
        vUv = position.xy;
        vA = a * smoothstep(40.0, 18.0, length(toCam));
        vWorld = pos;
        gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_COMMON}
      varying vec2 vUv;
      varying float vKind;
      varying float vA;
      varying vec3 vWorld;
      void main(){
        float a;
        if (vKind < 0.5){
          float r = length(vec2((vUv.x - 0.5) * 2.0, (vUv.y - 0.5) * 2.0));
          a = smoothstep(1.0, 0.2, r) * 0.9;
        } else if (vKind < 1.5){
          float r = length(vec2((vUv.x - 0.5) * 2.0, vUv.y * 2.0 - 0.2));
          a = smoothstep(0.2, 0.0, abs(r - 0.8)) * 0.5;
        } else {
          float stripe = 0.6 + 0.4 * sin(vUv.y * 40.0 + uTime * 30.0 + vUv.x * 3.0);
          a = (1.0 - abs(vUv.x - 0.5) * 2.0) * stripe * 0.55;
        }
        a *= vA;
        if (a < 0.004) discard;
        vec3 c = mix(uSkyHorizon, vec3(1.0), 0.45);
        gl_FragColor = vec4(c, a);
      }`,
    transparent: true,
    depthWrite: false,
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  m.renderOrder = 7;
  return m;
}

// Water running along gutters: thin shimmering strips
function makeGutterFlow(lines) {
  const pos = [], uv = [], idx = [];
  let n = 0;
  for (const [a, b] of lines) {
    const dx = b[0] - a[0], dz = b[2] - a[2];
    const len = Math.hypot(dx, dz);
    if (len < 0.5) continue;
    const nx = -dz / len * 0.09, nz = dx / len * 0.09;
    const flip = a[1] < b[1] ? -1 : 1; // flow downhill
    const steps = Math.max(1, Math.round(len / 6));
    for (let k = 0; k < steps; k++) {
      const t0 = k / steps, t1 = (k + 1) / steps;
      const p0 = [a[0] + dx * t0, a[1] + (b[1] - a[1]) * t0, a[2] + dz * t0];
      const p1 = [a[0] + dx * t1, a[1] + (b[1] - a[1]) * t1, a[2] + dz * t1];
      pos.push(p0[0] - nx, p0[1], p0[2] - nz, p0[0] + nx, p0[1], p0[2] + nz, p1[0] + nx, p1[1], p1[2] + nz, p1[0] - nx, p1[1], p1[2] - nz);
      const u0 = t0 * len * flip, u1 = t1 * len * flip;
      uv.push(u0, 0, u0, 1, u1, 1, u1, 0);
      idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
      n += 4;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorld;
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      ${GLSL_COMMON}
      varying vec2 vUv;
      varying vec3 vWorld;
      void main(){
        float across = 1.0 - abs(vUv.y - 0.5) * 2.0;
        float u = vUv.x - uTime * 0.9;
        float n = vnoise(vec2(u * 3.0, vUv.y * 3.0)) * 0.6 + vnoise(vec2(u * 9.0 + 3.0, vUv.y * 5.0)) * 0.4;
        float glint = smoothstep(0.62, 0.9, n);
        float dist = length(vWorld - cameraPosition);
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 env = envColor(reflect(-V, vec3(0.0, 1.0, 0.0)));
        // thin running water: darker than the dry concrete, with bright moving glints
        float ripple = 0.5 + 0.5 * sin(u * 26.0 + vUv.y * 5.0);
        vec3 c = mix(env * 0.36, vec3(0.92, 0.95, 1.0), glint * 0.55 + ripple * 0.06);
        float a = smoothstep(0.0, 0.5, across) * (0.55 + 0.4 * glint) * (1.0 - smoothstep(25.0, 45.0, dist));
        gl_FragColor = vec4(applyFog(c, vWorld, dist), a);
      }`,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 4;
  return m;
}

export function makeRain(scene, world) {
  const group = new THREE.Group();
  const near = makeStreaks(22000, [34, 22, 34], 0.55, 0.0045, 0.32, 9.5, 11);
  const mid = makeStreaks(16000, [90, 36, 90], 0.9, 0.009, 0.16, 9.0, 23);
  const splash = makeSplashes(2600, 26, 31);
  const drips = makeDrips(700);
  group.add(near, mid, splash, drips);
  const flow = makeGutterFlow(world.gutters || []);
  group.add(flow);
  scene.add(group);

  // precompute landing heights for drips / spouts
  const rng = makeRng(99);
  const pts = [];
  for (const d of world.drips) {
    const g = world.groundAt(d.x, d.z);
    const fall = d.y - g;
    if (fall > 0.2 && fall < 14) pts.push({ p: d, fall, period: rng.range(0.7, 2.6), phase: rng.next(), kind: 0, size: rng.range(0.02, 0.03) });
  }
  for (const s of world.spouts) {
    const g = world.groundAt(s.x, s.z);
    pts.push({ p: s, fall: Math.max(0.05, s.y - g), period: 1, phase: 0, kind: 1, size: 0.03 });
  }
  let lastRefresh = -10;
  const aP = drips.geometry.attributes.aP, aQ = drips.geometry.attributes.aQ;
  function refresh(camera) {
    const cp = camera.position;
    const tg = cp;
    const cand = pts.map((d) => ({ d, k: (d.p.x - tg.x) ** 2 + (d.p.z - tg.z) ** 2 + (d.p.y - tg.y) ** 2 * 0.5 }));
    cand.sort((a, b) => a.k - b.k);
    const n = Math.min(cand.length, aP.count);
    for (let i = 0; i < n; i++) {
      const d = cand[i].d;
      aP.array.set([d.p.x, d.p.y, d.p.z, d.fall], i * 4);
      aQ.array.set([d.period, d.phase, d.kind, d.size], i * 4);
    }
    aP.needsUpdate = aQ.needsUpdate = true;
    drips.geometry.instanceCount = n;
  }

  const dir = RAIN_DIR.clone().negate(); // towards the sky, for the rain map camera
  return {
    object: group,
    dir,
    update(t, dt, camera, renderer) {
      if (t - lastRefresh > 0.6) {
        refresh(camera);
        lastRefresh = t;
      }
      const h = renderer ? renderer.getDrawingBufferSize(new THREE.Vector2()).y : 900;
      const f = camera.projectionMatrix.elements[5];
      const pix = 2 / (f * h);
      near.material.uniforms.uPix.value = pix;
      mid.material.uniforms.uPix.value = pix;
      void dt;
    },
    // world-space size of one pixel at 1 m (for renders at a resolution other than the canvas)
    setPix(pix) {
      near.material.uniforms.uPix.value = pix;
      mid.material.uniforms.uPix.value = pix;
    },
  };
}
