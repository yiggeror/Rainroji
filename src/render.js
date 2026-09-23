import * as THREE from 'three';
import { U, NUM_SKY, makeDepthMaterial } from './shaders.js';

export const LAYER_OCC = 1; // static geometry that blocks sky light and rain
export const LAYER_NOREFL = 2; // things hidden from the ground reflection

// ---------------------------------------------------------------------------
// Fullscreen triangle helper
// ---------------------------------------------------------------------------
const fsGeo = new THREE.BufferGeometry();
fsGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
fsGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

export class FSQuad {
  constructor(material) {
    this.mesh = new THREE.Mesh(fsGeo, material);
    this.mesh.frustumCulled = false;
  }
  get material() {
    return this.mesh.material;
  }
  render(renderer, target) {
    renderer.setRenderTarget(target);
    renderer.render(this.mesh, fsCam);
  }
}

const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// ---------------------------------------------------------------------------
// Sky-dome occlusion: 12 orthographic depth maps rendered once (the town is
// static). Sampling all of them approximates how much of the overcast sky a
// point can see -> soft shadows under eaves, in alleys, under trees.
// ---------------------------------------------------------------------------
export class SkyOcclusion {
  constructor(renderer, bounds, tile = 1024) {
    this.renderer = renderer;
    this.bounds = bounds;
    this.tile = tile;
    const W = tile * 4, H = tile * 3;
    this.rt = new THREE.WebGLRenderTarget(W, H, { format: THREE.RedFormat, type: THREE.UnsignedByteType });
    const dt = new THREE.DepthTexture(W, H, THREE.FloatType);
    dt.compareFunction = THREE.LessEqualCompare;
    dt.minFilter = dt.magFilter = THREE.LinearFilter;
    this.rt.depthTexture = dt;
    this.depthMat = makeDepthMaterial();
    this.depthMat.polygonOffset = true;
    this.depthMat.polygonOffsetFactor = 2;
    this.depthMat.polygonOffsetUnits = 2;

    // directions (pointing towards the sky)
    const L = U.uLightDir.value;
    const la = Math.atan2(L.z, L.x);
    const dirs = [];
    dirs.push([0.0, 1.0, 0.04]);
    for (let i = 0; i < 5; i++) {
      const a = la + (i / 5) * Math.PI * 2 + 0.3;
      const el = (60 * Math.PI) / 180;
      dirs.push([Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)]);
    }
    for (let i = 0; i < 6; i++) {
      const a = la + (i / 6) * Math.PI * 2;
      const el = (30 * Math.PI) / 180;
      dirs.push([Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)]);
    }
    this.dirs = dirs.map((d) => new THREE.Vector3(...d).normalize());
    this.cams = this.dirs.map(() => new THREE.OrthographicCamera());
  }

  render(scene) {
    const r = this.renderer;
    const b = this.bounds;
    const corners = [];
    for (const x of [b.minX, b.maxX]) for (const y of [b.minY, b.maxY]) for (const z of [b.minZ, b.maxZ]) corners.push(new THREE.Vector3(x, y, z));
    const center = new THREE.Vector3((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2);
    const prevOverride = scene.overrideMaterial;
    const prevBg = scene.background;
    scene.overrideMaterial = this.depthMat;
    scene.background = null;
    const L = U.uLightDir.value;
    const lh = new THREE.Vector2(L.x, L.z).normalize();
    r.setRenderTarget(this.rt);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, true);
    for (let i = 0; i < NUM_SKY; i++) {
      const d = this.dirs[i];
      const cam = this.cams[i];
      cam.position.copy(center).addScaledVector(d, 600);
      cam.up.set(0, 1, 0);
      if (Math.abs(d.y) > 0.95) cam.up.set(0, 0, -1);
      cam.lookAt(center);
      cam.updateMatrixWorld();
      const inv = cam.matrixWorldInverse;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const c of corners) {
        const p = c.clone().applyMatrix4(inv);
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
        minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
      }
      cam.left = minX; cam.right = maxX; cam.bottom = minY; cam.top = maxY;
      cam.near = -maxZ - 1; cam.far = -minZ + 1;
      cam.updateProjectionMatrix();
      cam.layers.set(LAYER_OCC);
      const tx = i % 4, ty = Math.floor(i / 4);
      r.setViewport(tx * this.tile, ty * this.tile, this.tile, this.tile);
      r.setScissor(tx * this.tile, ty * this.tile, this.tile, this.tile);
      r.setScissorTest(true);
      r.render(scene, cam);
      U.uSkyMat.value[i].multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      U.uSkyDir.value[i].copy(d);
      const range = cam.far - cam.near;
      U.uSkyBias.value[i] = 0.18 / range;
      const hz = new THREE.Vector2(d.x, d.z);
      const facing = hz.length() > 0.01 ? Math.max(0, hz.normalize().dot(lh)) : 0.5;
      // brighter sky near the (hidden) sun and near the zenith
      U.uSkyWeight.value[i] = (i === 0 ? 1.6 : 1.0) * (1.0 + 0.7 * facing);
    }
    r.setScissorTest(false);
    r.setRenderTarget(null);
    scene.overrideMaterial = prevOverride;
    scene.background = prevBg;
    U.uSkyShadow.value = this.rt.depthTexture;
    U.uSkyTile.value.set(4, 3);
    U.uSkyOn.value = 1;
  }
}

// ---------------------------------------------------------------------------
// Rain height map: a single top-down depth map (float colour) along the rain
// direction. Used to stop rain under roofs and to put splashes on surfaces.
// ---------------------------------------------------------------------------
export class RainMap {
  constructor(renderer, bounds, size = 1024) {
    this.renderer = renderer;
    this.bounds = bounds;
    this.rt = new THREE.WebGLRenderTarget(size, size, { type: THREE.FloatType, format: THREE.RedFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.cam = new THREE.OrthographicCamera();
    this.mat = makeDepthMaterial();
  }
  render(scene, dir) {
    const r = this.renderer, b = this.bounds, cam = this.cam;
    const center = new THREE.Vector3((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
    cam.position.copy(center).addScaledVector(dir, 300);
    cam.up.set(0, 0, -1);
    cam.lookAt(center);
    cam.updateMatrixWorld();
    const hw = (b.maxX - b.minX) / 2 + 10, hh = (b.maxZ - b.minZ) / 2 + 10;
    cam.left = -hw; cam.right = hw; cam.top = hh; cam.bottom = -hh;
    cam.near = 300 - (b.maxY + 5);
    cam.far = 300 - (b.minY - 5);
    cam.updateProjectionMatrix();
    cam.layers.set(LAYER_OCC);
    const prev = scene.overrideMaterial;
    scene.overrideMaterial = this.mat;
    r.setRenderTarget(this.rt);
    r.setClearColor(0xffffff, 1);
    r.clear();
    r.render(scene, cam);
    r.setRenderTarget(null);
    r.setClearColor(0x000000, 1);
    scene.overrideMaterial = prev;
    U.uRainMap.value = this.rt.texture;
    U.uRainMat.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    U.uRainInv.value.copy(U.uRainMat.value).invert();
    U.uRainOn.value = 1;
    // keep a CPU copy for camera ground clamping
    const size = this.rt.width;
    const buf = new Float32Array(size * size);
    try {
      r.readRenderTargetPixels(this.rt, 0, 0, size, size, buf);
      this.cpu = buf;
    } catch (e) {
      this.cpu = null;
    }
    this.size = size;
  }
  // world height of the top surface at (x,z) (roofs included)
  heightAt(x, z) {
    if (!this.cpu) return 0;
    const p = new THREE.Vector4(x, 0, z, 1).applyMatrix4(U.uRainMat.value);
    const u = p.x * 0.5 + 0.5, v = p.y * 0.5 + 0.5;
    if (u < 0 || u > 1 || v < 0 || v > 1) return 0;
    const i = Math.floor(v * (this.size - 1)) * this.size + Math.floor(u * (this.size - 1));
    const d = this.cpu[i];
    if (d >= 0.9999) return -10;
    const w = new THREE.Vector4(p.x, p.y, d * 2 - 1, 1).applyMatrix4(U.uRainInv.value);
    return w.y;
  }
}

// ---------------------------------------------------------------------------
// Planar reflection of the town in the wet street (plane y = 0)
// ---------------------------------------------------------------------------
const BLUR_FRAG = /* glsl */ `
uniform sampler2D tMap;
uniform vec2 uStep;
varying vec2 vUv;
void main(){
  vec3 c = texture(tMap, vUv).rgb * 0.2270270270;
  c += texture(tMap, vUv + uStep * 1.3846153846).rgb * 0.3162162162;
  c += texture(tMap, vUv - uStep * 1.3846153846).rgb * 0.3162162162;
  c += texture(tMap, vUv + uStep * 3.2307692308).rgb * 0.0702702703;
  c += texture(tMap, vUv - uStep * 3.2307692308).rgb * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}`;

export function makeBlurMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { tMap: { value: null }, uStep: { value: new THREE.Vector2() } },
    vertexShader: FS_VERT,
    fragmentShader: BLUR_FRAG,
    depthTest: false,
    depthWrite: false,
  });
}

export class GroundReflection {
  constructor(renderer) {
    this.renderer = renderer;
    const opt = { type: THREE.HalfFloatType };
    this.rt = new THREE.WebGLRenderTarget(4, 4, { ...opt, samples: 2 });
    this.rtA = new THREE.WebGLRenderTarget(4, 4, opt);
    this.rtB = new THREE.WebGLRenderTarget(4, 4, opt);
    this.cam = new THREE.PerspectiveCamera();
    this.blur = new FSQuad(makeBlurMaterial());
    this.normal = new THREE.Vector3(0, 1, 0);
    this.plane = new THREE.Plane();
    this.clip = new THREE.Vector4();
    this.q = new THREE.Vector4();
    this.bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  }
  setSize(w, h) {
    const rw = Math.max(4, Math.floor(w * 0.5)), rh = Math.max(4, Math.floor(h * 0.5));
    this.rt.setSize(rw, rh);
    this.rtA.setSize(Math.floor(rw / 2), Math.floor(rh / 2));
    this.rtB.setSize(Math.floor(rw / 2), Math.floor(rh / 2));
  }
  update(scene, camera, hide) {
    const r = this.renderer;
    const camPos = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    if (camPos.y < 0.05) {
      U.uReflOn.value = 0;
      return;
    }
    const n = this.normal;
    const rot = new THREE.Matrix4().extractRotation(camera.matrixWorld);
    const view = camPos.clone().reflect(n).negate(); // plane through origin
    view.y = -camPos.y;
    view.x = camPos.x;
    view.z = camPos.z;
    const look = new THREE.Vector3(0, 0, -1).applyMatrix4(rot).add(camPos);
    const target = look.clone();
    target.y = -target.y;
    const vc = this.cam;
    vc.position.copy(view);
    vc.up.set(0, 1, 0).applyMatrix4(rot);
    vc.up.y = -vc.up.y;
    vc.lookAt(target);
    vc.far = camera.far;
    vc.near = camera.near;
    vc.updateMatrixWorld();
    vc.projectionMatrix.copy(camera.projectionMatrix);
    vc.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    U.uReflMatrix.value.copy(this.bias).multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);

    // oblique near plane = ground plane (clip everything below the street)
    this.plane.setFromNormalAndCoplanarPoint(n, new THREE.Vector3(0, 0.02, 0));
    this.plane.applyMatrix4(vc.matrixWorldInverse);
    const clip = this.clip.set(this.plane.normal.x, this.plane.normal.y, this.plane.normal.z, this.plane.constant);
    const P = vc.projectionMatrix.elements;
    const q = this.q;
    q.x = (Math.sign(clip.x) + P[8]) / P[0];
    q.y = (Math.sign(clip.y) + P[9]) / P[5];
    q.z = -1.0;
    q.w = (1.0 + P[10]) / P[14];
    clip.multiplyScalar(2.0 / clip.dot(q));
    P[2] = clip.x;
    P[6] = clip.y;
    P[10] = clip.z + 1.0;
    P[14] = clip.w;

    for (const o of hide) o.visible = false;
    vc.layers.enableAll();
    vc.layers.disable(LAYER_NOREFL);
    U.uReflOn.value = 0;
    U.uCheap.value = 1;
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(scene, vc);
    U.uCheap.value = 0;
    for (const o of hide) o.visible = true;

    // anime-style vertical smear: blur harder vertically
    const bm = this.blur.material;
    const w = this.rtA.width, h = this.rtA.height;
    bm.uniforms.tMap.value = this.rt.texture;
    bm.uniforms.uStep.value.set(1.2 / w, 0);
    this.blur.render(r, this.rtA);
    bm.uniforms.tMap.value = this.rtA.texture;
    bm.uniforms.uStep.value.set(0, 3.5 / h);
    this.blur.render(r, this.rtB);
    bm.uniforms.tMap.value = this.rtB.texture;
    bm.uniforms.uStep.value.set(0, 1.8 / h);
    this.blur.render(r, this.rtA);
    r.setRenderTarget(null);
    U.uReflTex.value = this.rt.texture;
    U.uReflBlur.value = this.rtA.texture;
    U.uReflOn.value = 1;
  }
}

// ---------------------------------------------------------------------------
// Post: bloom + gentle grading, output sRGB
// ---------------------------------------------------------------------------
const BRIGHT_FRAG = /* glsl */ `
uniform sampler2D tMap;
uniform vec2 uTexel;
varying vec2 vUv;
void main(){
  vec3 c = vec3(0.0);
  c += texture(tMap, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture(tMap, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
  c += texture(tMap, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
  c += texture(tMap, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
  c *= 0.25;
  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
  c = min(c, vec3(24.0));
  float l = max(c.r, max(c.g, c.b));
  float k = smoothstep(0.82, 1.6, l);
  gl_FragColor = vec4(c * k, 1.0);
}`;

const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tB1;
uniform sampler2D tB2;
uniform sampler2D tB3;
uniform vec2 uRes;
uniform float uTime;
uniform float uFade;
uniform vec3 uFadeColor;
uniform float uDebugNaN;
varying vec2 vUv;
float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 toSRGB(vec3 c){
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c));
}
void main(){
  vec3 c = texture(tColor, vUv).rgb;
  bool bad = any(isnan(c)) || any(isinf(c));
  if (bad) c = uDebugNaN > 0.5 ? vec3(4.0, 0.0, 4.0) : vec3(0.5);
  vec3 b = texture(tB1, vUv).rgb * 0.45 + texture(tB2, vUv).rgb * 0.4 + texture(tB3, vUv).rgb * 0.35;
  c += b * 0.6;
  // soft shoulder
  vec3 x = max(c - 0.78, 0.0);
  c = min(c, 0.78) + 0.22 * (1.0 - exp(-x / 0.22));
  // grade: cool low end, faint warm top, keep it gentle
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c, c * vec3(0.93, 0.98, 1.07), (1.0 - smoothstep(0.0, 0.45, l)) * 0.6);
  c = mix(vec3(l), c, 1.06);
  // vignette
  vec2 q = vUv - 0.5;
  q.x *= uRes.x / uRes.y;
  c *= 1.0 - smoothstep(0.35, 1.25, length(q)) * 0.28;
  vec3 s = toSRGB(c);
  s += (hash(vUv * uRes + fract(uTime) * 91.0) - 0.5) / 255.0 * 2.0;
  s = mix(uFadeColor, s, uFade);
  gl_FragColor = vec4(s, 1.0);
}`;

export class Post {
  constructor(renderer) {
    this.renderer = renderer;
    this.main = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    const opt = { type: THREE.HalfFloatType };
    this.b = [0, 1, 2, 3, 4, 5].map(() => new THREE.WebGLRenderTarget(4, 4, opt));
    this.bright = new FSQuad(
      new THREE.ShaderMaterial({ uniforms: { tMap: { value: null }, uTexel: { value: new THREE.Vector2() } }, vertexShader: FS_VERT, fragmentShader: BRIGHT_FRAG, depthTest: false, depthWrite: false }),
    );
    this.blur = new FSQuad(makeBlurMaterial());
    this.comp = new FSQuad(
      new THREE.ShaderMaterial({
        uniforms: {
          tColor: { value: null }, tB1: { value: null }, tB2: { value: null }, tB3: { value: null },
          uRes: { value: new THREE.Vector2() }, uTime: U.uTime, uFade: { value: 0 },
          uFadeColor: { value: new THREE.Color(0.72, 0.75, 0.78) },
          uDebugNaN: { value: /[?&]nan/.test(location.search) ? 1 : 0 },
        },
        vertexShader: FS_VERT,
        fragmentShader: COMPOSITE_FRAG,
        depthTest: false,
        depthWrite: false,
      }),
    );
  }
  setSize(w, h) {
    this.main.setSize(w, h);
    let bw = Math.max(2, w >> 1), bh = Math.max(2, h >> 1);
    for (let i = 0; i < 3; i++) {
      this.b[i * 2].setSize(bw, bh);
      this.b[i * 2 + 1].setSize(bw, bh);
      bw = Math.max(2, bw >> 1);
      bh = Math.max(2, bh >> 1);
    }
    this.comp.material.uniforms.uRes.value.set(w, h);
  }
  render(fade) {
    const r = this.renderer;
    // bright pass into level 0, then blur/downsample chain
    let src = this.main.texture;
    for (let i = 0; i < 3; i++) {
      const A = this.b[i * 2], B = this.b[i * 2 + 1];
      this.bright.material.uniforms.tMap.value = src;
      this.bright.material.uniforms.uTexel.value.set(0.5 / A.width, 0.5 / A.height);
      if (i === 0) this.bright.render(r, A);
      else {
        // plain downsample: reuse blur with zero step
        this.blur.material.uniforms.tMap.value = src;
        this.blur.material.uniforms.uStep.value.set(0, 0);
        this.blur.render(r, A);
      }
      this.blur.material.uniforms.tMap.value = A.texture;
      this.blur.material.uniforms.uStep.value.set(1 / A.width, 0);
      this.blur.render(r, B);
      this.blur.material.uniforms.tMap.value = B.texture;
      this.blur.material.uniforms.uStep.value.set(0, 1 / A.height);
      this.blur.render(r, A);
      src = A.texture;
    }
    const u = this.comp.material.uniforms;
    u.tColor.value = this.main.texture;
    u.tB1.value = this.b[0].texture;
    u.tB2.value = this.b[2].texture;
    u.tB3.value = this.b[4].texture;
    u.uFade.value = fade;
    this.comp.render(r, null);
  }
}
