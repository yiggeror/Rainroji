import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Shared uniforms: every material in the town references these objects so the
// weather, fog and sky-light can be tuned in one place.
// ---------------------------------------------------------------------------
const lin = (hex) => new THREE.Color(hex); // THREE.Color converts sRGB hex -> linear

export const NUM_SKY = 12;
export const NUM_LIGHTS = 16;

export const U = {
  uTime: { value: 0 },
  uSkyTop: { value: lin('#6f7e91') },
  uSkyMid: { value: lin('#8f9cab') },
  uSkyHorizon: { value: lin('#b3bcc5') },
  uSkyGlow: { value: lin('#d9d6cc') },
  uGroundFar: { value: lin('#7c858c') },
  uFogDensity: { value: 0.0062 },
  uLightDir: { value: new THREE.Vector3(-0.55, 0.62, -0.35).normalize() },
  uLightColor: { value: new THREE.Color(0.5, 0.49, 0.47) },
  uAmbSky: { value: new THREE.Color(0.54, 0.6, 0.7) },
  uAmbGround: { value: new THREE.Color(0.23, 0.245, 0.25) },
  uWind: { value: new THREE.Vector3(0.8, 0, 0.35) },
  uWet: { value: 1.0 },
  // sky-dome occlusion atlas (12 orthographic depth maps looking down from the sky)
  uSkyShadow: { value: null },
  uSkyMat: { value: Array.from({ length: NUM_SKY }, () => new THREE.Matrix4()) },
  uSkyDir: { value: Array.from({ length: NUM_SKY }, () => new THREE.Vector3(0, 1, 0)) },
  uSkyWeight: { value: new Array(NUM_SKY).fill(1) },
  uSkyBias: { value: new Array(NUM_SKY).fill(0.001) },
  uSkyTile: { value: new THREE.Vector2(4, 3) },
  uSkyOn: { value: 0 },
  // warm local lights (vending machines, lamps, shop)
  uLightPos: { value: Array.from({ length: NUM_LIGHTS }, () => new THREE.Vector4(0, -100, 0, 0.001)) },
  uLightCol: { value: Array.from({ length: NUM_LIGHTS }, () => new THREE.Vector4(0, 0, 0, 0)) },
  // planar reflection (ground at y = 0)
  uReflTex: { value: null },
  uReflBlur: { value: null },
  uReflMatrix: { value: new THREE.Matrix4() },
  uReflOn: { value: 0 },
  // rain height map (surface under the rain), used for splashes & rain occlusion
  uRainMap: { value: null },
  uRainMat: { value: new THREE.Matrix4() },
  uRainInv: { value: new THREE.Matrix4() },
  uRainOn: { value: 0 },
  uFlicker: { value: new THREE.Vector4(1, 1, 1, 1) },
  uCrossing: { value: new THREE.Vector2(0, 0) },
};

// ---------------------------------------------------------------------------
// GLSL library
// ---------------------------------------------------------------------------
export const GLSL_COMMON = /* glsl */ `
uniform float uTime;
uniform vec3 uSkyTop, uSkyMid, uSkyHorizon, uSkyGlow, uGroundFar;
uniform float uFogDensity;
uniform vec3 uLightDir, uLightColor, uAmbSky, uAmbGround, uWind;
uniform float uWet;

float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),u.x), mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p){ float a=0.5, s=0.; for(int i=0;i<4;i++){ s+=a*vnoise(p); p=p*2.03+vec2(17.1,9.3); a*=0.5;} return s; }
float fbm3o(vec2 p){ float a=0.5, s=0.; for(int i=0;i<3;i++){ s+=a*vnoise(p); p=p*2.07+vec2(5.1,1.3); a*=0.5;} return s/0.875; }
float vnoise3(vec3 p){ vec3 i=floor(p), f=fract(p); vec3 u=f*f*(3.-2.*f);
  float a=hash13(i), b=hash13(i+vec3(1,0,0)), c=hash13(i+vec3(0,1,0)), d=hash13(i+vec3(1,1,0));
  float e=hash13(i+vec3(0,0,1)), f1=hash13(i+vec3(1,0,1)), g=hash13(i+vec3(0,1,1)), h=hash13(i+vec3(1,1,1));
  return mix(mix(mix(a,b,u.x),mix(c,d,u.x),u.y), mix(mix(e,f1,u.x),mix(g,h,u.x),u.y), u.z); }

// anti-aliased periodic line: 1 on the line. fades to its average when too small on screen
float gline(float x, float period, float width){
  float fw = fwidth(x) + 1e-5;
  float d = abs(fract(x / period + 0.5) - 0.5) * period;
  float l = 1.0 - smoothstep(width*0.5 - fw*0.7, width*0.5 + fw*0.7, d);
  return mix(l, clamp(width/period, 0.0, 1.0), smoothstep(period*0.25, period*0.7, fw));
}

vec3 tangentOf(vec3 N){
  vec3 t = cross(vec3(0.0, 1.0, 0.0), N);
  float l = length(t);
  return l > 1e-3 ? t / l : vec3(1.0, 0.0, 0.0);
}

vec3 skyGradient(vec3 d){
  float h = d.y;
  vec3 c = mix(uSkyHorizon, uSkyMid, smoothstep(0.0, 0.28, h));
  c = mix(c, uSkyTop, smoothstep(0.25, 0.95, h));
  vec3 dh = normalize(vec3(d.x, 0.0, d.z) + 1e-5);
  vec3 lh = normalize(vec3(uLightDir.x, 0.0, uLightDir.z));
  float g = pow(max(dot(dh, lh), 0.0), 2.0);
  c = mix(c, uSkyGlow, g * 0.28 * (1.0 - smoothstep(0.0, 0.55, h)));
  if (h < 0.0) c = mix(c, uGroundFar, smoothstep(0.0, -0.2, h));
  return c;
}

// aerial perspective + drifting rain mist
vec3 applyFog(vec3 col, vec3 wp, float dist){
  vec3 vd = (wp - cameraPosition) / max(dist, 1e-3);
  float d = dist * uFogDensity;
  float f = 1.0 - exp(-pow(d, 1.3));
  float hf = exp(-max(wp.y + 2.0, 0.0) * 0.035);
  f *= mix(0.72, 1.12, hf);
  float mist = vnoise(wp.xz * 0.018 + vec2(uTime * 0.012, uTime * 0.004)) * 0.65
             + vnoise(wp.xz * 0.05 - vec2(uTime * 0.02, 0.0)) * 0.35;
  f *= mix(0.8, 1.2, mist);
  f = clamp(f, 0.0, 1.0);
  vec3 fc = skyGradient(normalize(vec3(vd.x, max(vd.y, 0.0) * 0.5 + 0.02, vd.z)));
  return mix(col, fc, f);
}

vec3 envColor(vec3 R){
  vec3 c = skyGradient(R);
  // below the horizon we see the wet street and the facades opposite: darker
  float below = smoothstep(0.08, -0.15, R.y);
  c = mix(c, uGroundFar * 0.55, below);
  return c;
}
`;

// sky-dome visibility: 12 directions, hardware PCF
export const GLSL_SKYOCC = /* glsl */ `
uniform sampler2DShadow uSkyShadow;
uniform mat4 uSkyMat[${NUM_SKY}];
uniform vec3 uSkyDir[${NUM_SKY}];
uniform float uSkyWeight[${NUM_SKY}];
uniform float uSkyBias[${NUM_SKY}];
uniform vec2 uSkyTile;
uniform float uSkyOn;

float skyVisibility(vec3 wp, vec3 n){
  if (uSkyOn < 0.5) return 1.0;
  float sum = 0.0, wsum = 0.0;
  vec3 p = wp + n * 0.12;
  for (int i = 0; i < ${NUM_SKY}; i++){
    float w = uSkyWeight[i] * (max(dot(n, uSkyDir[i]), 0.0) + 0.08);
    vec4 c = uSkyMat[i] * vec4(p, 1.0);
    vec3 s = c.xyz * 0.5 + 0.5;
    float v = 1.0;
    if (s.x > 0.001 && s.x < 0.999 && s.y > 0.001 && s.y < 0.999 && s.z < 1.0){
      float tx = mod(float(i), uSkyTile.x);
      float ty = floor(float(i) / uSkyTile.x);
      vec2 uv = (s.xy + vec2(tx, ty)) / uSkyTile;
      v = texture(uSkyShadow, vec3(uv, s.z - uSkyBias[i]));
    }
    sum += v * w;
    wsum += w;
  }
  return sum / max(wsum, 1e-4);
}
`;

export const GLSL_LIGHTS = /* glsl */ `
uniform vec4 uLightPos[${NUM_LIGHTS}];
uniform vec4 uLightCol[${NUM_LIGHTS}];
vec3 localLights(vec3 wp, vec3 n, vec3 V, float gloss, out vec3 spec){
  vec3 sum = vec3(0.0);
  spec = vec3(0.0);
  for (int i = 0; i < ${NUM_LIGHTS}; i++){
    vec3 L = uLightPos[i].xyz - wp;
    float d = length(L);
    float r = uLightPos[i].w;
    float att = clamp(1.0 - d / r, 0.0, 1.0);
    att *= att;
    if (att <= 0.0) continue;
    L /= d;
    float ndl = dot(n, L) * 0.6 + 0.4;
    sum += uLightCol[i].rgb * uLightCol[i].a * att * max(ndl, 0.0);
    vec3 H = normalize(L + V);
    spec += uLightCol[i].rgb * uLightCol[i].a * att * pow(max(dot(n, H), 0.0), 40.0) * gloss * 1.5;
  }
  return sum;
}
`;

// ---------------------------------------------------------------------------
// Toon material: the whole town is drawn with this.
// ---------------------------------------------------------------------------
const TOON_VERT = /* glsl */ `
attribute vec4 aMatA;
attribute vec4 aMatB;
uniform float uTime;
uniform vec3 uWind;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vColor;
varying vec2 vUv;
varying vec4 vMatA;
varying vec4 vMatB;
void main(){
  vec4 wp = vec4(position, 1.0);
  vec3 nrm = normal;
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
    nrm = mat3(instanceMatrix) * nrm;
  #endif
  wp = modelMatrix * wp;
  float sw = aMatB.y;
  if (sw > 0.0){
    float ph = (aMatB.w > 0.5 ? 0.0 : dot(wp.xz, vec2(0.13, 0.21))) + aMatB.z * 6.28;
    float s = sin(uTime * 1.1 + ph) * 0.55 + sin(uTime * 2.3 + ph * 1.7) * 0.25 + sin(uTime * 0.37 + ph * 0.5) * 0.5;
    wp.xyz += vec3(uWind.x, 0.0, uWind.z) * sw * s + vec3(uWind.z, 0.0, -uWind.x) * sw * 0.35 * sin(uTime * 1.7 + ph * 2.1);
    wp.y += sw * 0.25 * sin(uTime * 1.3 + ph);
  }
  vWorldPos = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * nrm);
  vColor = color;
  vUv = uv;
  vMatA = aMatA;
  vMatB = aMatB;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const TOON_FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_SKYOCC}
${GLSL_LIGHTS}
uniform vec4 uFlicker;
uniform vec2 uCrossing;
#ifdef ATLAS
uniform sampler2D uAtlas;
#endif
#ifdef REFLECT
uniform sampler2D uReflTex;
uniform sampler2D uReflBlur;
uniform mat4 uReflMatrix;
uniform float uReflOn;
#endif
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vColor;
varying vec2 vUv;
varying vec4 vMatA;
varying vec4 vMatB;

// ---- rain ripples: expanding rings in a jittered grid --------------------
vec3 ripples(vec2 p, float t){
  vec2 grad = vec2(0.0);
  float ring = 0.0;
  for (int k = 0; k < 2; k++){
    vec2 q = p * (k == 0 ? 3.1 : 2.3) + float(k) * 7.31;
    vec2 cell = floor(q);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
      vec2 c = cell + vec2(i, j);
      vec2 h = hash22(c);
      float ph = fract(t * (0.9 + h.y * 0.5) + h.x);
      vec2 center = c + 0.2 + 0.6 * hash22(c + 13.1);
      vec2 dv = q - center;
      float d = length(dv);
      float r = ph * 0.85;
      float w = (1.0 - ph);
      float x = (d - r) * 18.0;
      float ringv = sin(clamp(x, -3.1416, 3.1416)) * w * w * step(abs(x), 3.1416);
      ring += abs(ringv) * 0.5;
      grad += (dv / max(d, 1e-3)) * ringv;
    }
  }
  return vec3(grad * 0.35, ring);
}

vec3 interiorWindow(vec3 wp, vec3 N, vec3 V, vec2 uv, vec2 size, float style, float seed, vec3 roomTint, float lit){
  vec3 T = tangentOf(N);
  vec3 B = vec3(0.0, 1.0, 0.0);
  vec3 dir = -V;
  vec3 d = vec3(dot(dir, T), dot(dir, B), -dot(dir, N));
  d.z = max(d.z, 0.02);
  float shop = step(4.5, style);
  float Wr = max(size.x + 1.6, 3.0) + seed * 1.5;
  float Hr = 2.5;
  float Dr = mix(3.0 + seed * 2.0, 5.0, shop);
  float sill = size.y > 1.6 ? 0.05 : 0.9;
  vec3 p = vec3(uv.x - size.x * 0.5, uv.y + sill, 0.0);
  float tx = d.x > 0.0 ? (Wr * 0.5 - p.x) / d.x : (-Wr * 0.5 - p.x) / min(d.x, -1e-4);
  float ty = d.y > 0.0 ? (Hr - p.y) / d.y : (-p.y) / min(d.y, -1e-4);
  float tz = (Dr - p.z) / d.z;
  float t = min(tx, min(ty, tz));
  vec3 h = p + d * t;
  vec3 wallC = mix(vec3(0.62, 0.58, 0.52), vec3(0.55, 0.57, 0.6), fract(seed * 7.3));
  vec3 c;
  if (t == tz){
    c = wallC;
    // furniture silhouettes on back wall
    float fx = h.x / Wr + 0.5;
    float k = floor(fx * 4.0 + seed * 3.0);
    float fh = hash12(vec2(k, seed * 17.0));
    if (fh > 0.45 && h.y < 0.6 + fh * 1.3) c = mix(vec3(0.3, 0.22, 0.16), vec3(0.45, 0.42, 0.38), fract(fh * 9.1));
    if (shop > 0.5){
      float shelf = step(0.5, fract(h.y * 2.2));
      float item = hash12(floor(vec2(h.x * 6.0, h.y * 4.4)) + seed);
      c = mix(vec3(0.5, 0.48, 0.45), mix(vec3(0.8, 0.5, 0.3), vec3(0.4, 0.6, 0.8), item), shelf * step(0.3, item) * step(h.y, 2.0));
    }
  } else if (t == ty){
    c = d.y > 0.0 ? vec3(0.78, 0.76, 0.72) : mix(vec3(0.35, 0.26, 0.18), vec3(0.5, 0.45, 0.35), fract(seed * 3.7));
  } else {
    c = wallC * 0.9;
  }
  // light inside
  float depthFade = exp(-h.z * 0.35);
  vec3 warm = vec3(1.0, 0.78, 0.5);
  vec3 lamp = warm * (1.6 - 0.35 * length(vec2(h.x / Wr, (h.z - Dr * 0.5) / Dr)) - 0.4 * (Hr - h.y) / Hr);
  vec3 dim = vec3(0.23, 0.25, 0.28) * (0.35 + 0.65 * depthFade);
  vec3 room = c * mix(dim, lamp * roomTint, lit);
  if (shop > 0.5) room = c * mix(vec3(0.4, 0.42, 0.42), vec3(1.25, 1.2, 1.05), lit);
  // curtain layer
  float s = floor(style + 0.5);
  if (s > 0.5 && shop < 0.5){
    float tc = 0.12 / d.z;
    vec3 pc = p + d * tc;
    float a = 0.0;
    vec3 cc = vec3(0.86, 0.84, 0.8);
    float fold = 0.5 + 0.5 * sin(pc.x * 38.0 + seed * 10.0);
    if (s < 1.5){ a = 0.72; cc *= 0.85 + 0.15 * fold; }                       // lace
    else if (s < 2.5){                                                         // drawn curtains
      float edge = size.x * 0.5 * (0.35 + 0.35 * fract(seed * 5.1));
      a = step(edge, abs(pc.x)) * 0.97;
      cc = mix(vec3(0.62, 0.55, 0.42), vec3(0.45, 0.52, 0.55), fract(seed * 11.3)) * (0.8 + 0.2 * fold);
      a = max(a, 0.55);
      cc = mix(vec3(0.85, 0.83, 0.78) * (0.85 + 0.15 * fold), cc, step(edge, abs(pc.x)));
    }
    else if (s < 3.5){ a = 0.9 * step(0.35, fract(pc.y * 14.0)); cc = vec3(0.78, 0.78, 0.76); } // blinds
    else { a = 1.0; cc = vec3(0.74, 0.77, 0.8) * (0.9 + 0.1 * vnoise(uv * 30.0)); }  // frosted
    vec3 curtainLit = mix(vec3(0.5, 0.52, 0.56), vec3(1.25, 1.0, 0.72) * roomTint, lit);
    room = mix(room, cc * curtainLit, a);
  }
  // reflection
  vec3 R = reflect(-V, N);
  vec3 env = envColor(R);
  float band = smoothstep(-0.05, 0.1, R.y) * (1.0 - smoothstep(0.12, 0.35, R.y));
  env = mix(env, env * 0.62, band * (0.6 + 0.4 * hash12(vec2(seed * 91.0, 3.0))));
  float nv = clamp(dot(N, V), 0.0, 1.0);
  float F = mix(0.18, 0.92, pow(1.0 - nv, 2.2));
  F *= 1.0 - 0.55 * lit;
  vec3 col = mix(room, env, F);
  // painted diagonal glints
  float g = (uv.x + uv.y * 0.9) / max(size.x, 0.4);
  float gl = smoothstep(0.02, 0.0, abs(fract(g * 0.8 + seed) - 0.3) - 0.035) + 0.6 * smoothstep(0.02, 0.0, abs(fract(g * 0.8 + seed) - 0.42) - 0.012);
  col += vec3(0.22, 0.24, 0.27) * gl * step(0.62, seed) * (1.0 - lit * 0.7);
  return col;
}

void main(){
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 toCam = cameraPosition - vWorldPos;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  int pat = int(vMatA.x + 0.5);
  float param = vMatA.y;
  float gloss = vMatA.z;
  float emit = vMatA.w;
  float weather = vMatB.x;
  vec3 albedo = vColor;
  vec2 uv = vUv;
  vec3 Np = N;
  float wetDark = 0.0;     // how much the surface darkens when wet
  float isGlass = 0.0;
  float puddle = 0.0;
  vec3 extraEmit = vec3(0.0);
  float fw = fwidth(uv.x) + fwidth(uv.y);

  #ifdef FAR
  {
    // distant ranges: painted forest texture, much lighter fog, misty feet
    float n = fbm(vWorldPos.xz * 0.008 + vWorldPos.y * 0.015);
    float n2 = vnoise(vWorldPos.xz * 0.05 + vWorldPos.y * 0.07);
    vec3 alb = vColor * (0.78 + 0.35 * n + 0.12 * n2);
    vec3 c = alb * (uAmbSky * 0.9 + uLightColor * 0.35 * max(dot(N, uLightDir), 0.0) + 0.08);
    c = applyFog(c, vWorldPos, dist * (0.12 + 0.045 * param));
    vec3 vd = (vWorldPos - cameraPosition) / dist;
    float low = 1.0 - smoothstep(-10.0, 60.0 + 50.0 * param, vWorldPos.y);
    c = mix(c, skyGradient(normalize(vec3(vd.x, 0.03, vd.z))), low * 0.6);
    gl_FragColor = vec4(c, 1.0);
    return;
  }
  #endif

  #ifdef ATLAS
  vec4 at = texture(uAtlas, vUv);
  if (at.a < 0.45) discard;
  albedo *= at.rgb;
  #endif

  // big soft painterly blotches everywhere
  float blot = fbm3o(vWorldPos.xz * 0.11 + vWorldPos.y * 0.07);
  albedo *= 0.94 + 0.12 * blot;

  if (pat == 1){ // lap siding
    float s = param > 0.0 ? param : 0.2;
    float l = gline(uv.y - s * 0.5, s, 0.018);
    float f = fract(uv.y / s);
    albedo *= (0.965 + 0.05 * f) * (1.0 - 0.22 * l);
    wetDark = 0.12;
  } else if (pat == 2){ // ceramic siding panels
    float lv = gline(uv.x, 0.455, 0.008) * 0.6 + gline(uv.y, 3.03, 0.012);
    if (param > 0.5){ // faux brick/stone texture
      float row = floor(uv.y / 0.24);
      float bx = uv.x / 0.52 + row * 0.5;
      float br = hash12(vec2(floor(bx), row));
      albedo *= 0.94 + 0.1 * br;
      lv += gline(uv.y, 0.24, 0.012) * 0.8 + gline(bx, 1.0, 0.02) * 0.8 * (1.0 - smoothstep(0.02, 0.1, fw));
    }
    albedo *= 1.0 - 0.14 * clamp(lv, 0.0, 1.0);
    wetDark = 0.1;
  } else if (pat == 3){ // old wood boards
    float s = 0.21;
    float l = gline(uv.y, s, 0.012);
    float board = floor(uv.y / s);
    float grain = vnoise(vec2(uv.x * 1.3 + board * 11.0, uv.y * 40.0));
    albedo *= (0.86 + 0.18 * hash12(vec2(board, floor(uv.x / 1.82)))) * (0.9 + 0.12 * grain) * (1.0 - 0.45 * l);
    wetDark = 0.25;
  } else if (pat == 4){ // wall tiles
    float th = param > 0.0 ? param : 0.06;
    float tw = th * 3.75;
    float row = floor(uv.y / th);
    float tx = uv.x / tw + mod(row, 2.0) * 0.5;
    float h = hash12(vec2(floor(tx), row));
    float gl1 = gline(uv.y, th, 0.006) + gline(tx * tw, tw, 0.006);
    albedo *= (0.95 + 0.09 * h) * (1.0 - 0.18 * clamp(gl1, 0.0, 1.0));
    gloss = max(gloss, 0.12);
    wetDark = 0.05;
  } else if (pat == 5){ // concrete block wall
    float row = floor(uv.y / 0.2);
    float h = hash12(vec2(floor(uv.x / 0.4), row));
    float gl1 = gline(uv.y, 0.2, 0.012) + gline(uv.x, 0.4, 0.012);
    albedo *= (0.93 + 0.1 * h) * (1.0 - 0.28 * clamp(gl1, 0.0, 1.0));
    float moss = (1.0 - smoothstep(0.0, 0.45 + 0.3 * vnoise(uv * 3.0), uv.y)) * 0.8;
    albedo = mix(albedo, albedo * vec3(0.62, 0.72, 0.5), moss);
    float stain = smoothstep(0.55, 0.8, fbm(vec2(uv.x * 2.0, uv.y * 0.35 + 3.0)));
    albedo *= 1.0 - 0.25 * stain;
    wetDark = 0.3;
  } else if (pat == 6 || pat == 28){ // mortar / concrete
    float st = fbm(uv * vec2(1.5, 0.6) + 11.0);
    albedo *= 0.93 + 0.1 * st;
    if (pat == 28){
      float pj = gline(uv.x, 1.8, 0.01) + gline(uv.y, 0.9, 0.01);
      vec2 hc = fract(uv / vec2(0.6, 0.45)) - 0.5;
      float hole = 1.0 - smoothstep(0.012, 0.022, length(hc * vec2(0.6, 0.45)));
      albedo *= (1.0 - 0.12 * clamp(pj, 0.0, 1.0)) * (1.0 - 0.35 * hole * (1.0 - smoothstep(0.01, 0.05, fw)));
    }
    wetDark = 0.3;
  } else if (pat == 7){ // kawara roof tiles. uv.x along ridge, uv.y down the slope
    float gx = uv.x / 0.3;
    float prof = sin(gx * 6.2832);
    float row = gline(uv.y, 0.27, 0.025);
    float rowEdge = fract(uv.y / 0.27);
    vec3 T = tangentOf(N);
    Np = normalize(N + T * prof * 0.35 * (1.0 - smoothstep(0.05, 0.25, fw)));
    albedo *= (0.9 + 0.12 * prof) * (1.0 - 0.3 * row) * (0.92 + 0.1 * smoothstep(0.0, 0.9, rowEdge));
    albedo *= 0.92 + 0.12 * hash12(floor(vec2(gx, uv.y / 0.27)));
    wetDark = 0.15;
  } else if (pat == 8){ // slate
    float row = floor(uv.y / 0.22);
    float l = gline(uv.y, 0.22, 0.02) + gline(uv.x + row * 0.45, 0.91, 0.01) * 0.6;
    albedo *= (0.94 + 0.1 * hash12(vec2(floor((uv.x + row * 0.45) / 0.91), row))) * (1.0 - 0.3 * clamp(l, 0.0, 1.0));
    wetDark = 0.12;
  } else if (pat == 9 || pat == 21){ // corrugated / shutter
    float per = pat == 9 ? 0.12 : 0.09;
    float x = pat == 9 ? uv.x : uv.y;
    float pr = sin(x / per * 6.2832);
    float fade = 1.0 - smoothstep(per * 0.2, per * 0.6, fw);
    albedo *= 1.0 + 0.1 * pr * fade;
    vec3 T = pat == 9 ? tangentOf(N) : vec3(0.0, 1.0, 0.0);
    Np = normalize(N + T * pr * 0.25 * fade);
    if (pat == 21) albedo *= 1.0 - 0.12 * gline(uv.y, per, 0.01);
    wetDark = 0.05;
  } else if (pat == 10){ // asphalt
    vec2 w = vWorldPos.xz;
    float sp = hash12(floor(w * 38.0));
    float n1 = fbm(w * 0.35);
    albedo *= 0.88 + 0.16 * n1 + 0.08 * (sp - 0.5) * (1.0 - smoothstep(0.02, 0.06, fw));
    // repair patches
    float patchN = vnoise(w * 0.12 + 40.0);
    albedo *= 1.0 - 0.1 * step(0.72, patchN);
    // cracks
    float cr = abs(vnoise(w * 0.9 + 3.0) - 0.5);
    albedo *= 1.0 - 0.3 * (1.0 - smoothstep(0.0, 0.012, cr)) * step(0.55, vnoise(w * 0.2));
    // puddles: along the edges, in wheel ruts and random dips
    float across = abs(uv.y);
    float edge = param > 0.0 ? smoothstep(param * 0.5 - 0.9, param * 0.5 - 0.1, across) : 0.0;
    float rut = param > 0.0 ? (1.0 - smoothstep(0.1, 0.35, abs(across - 0.75))) * 0.25 : 0.0;
    float pn = fbm(w * 0.22 + 7.0) + edge * 0.28 + rut;
    puddle = smoothstep(0.66, 0.7, pn) * smoothstep(0.9975, 0.9995, N.y);
    wetDark = 0.35;
    gloss = mix(0.35, 0.95, puddle);
  } else if (pat == 12){ // pure emissive lamps / panels
    float fl = 1.0;
    int fid = int(vMatB.z + 0.5);
    if (fid == 1) fl = uFlicker.x;
    else if (fid == 2) fl = uFlicker.y;
    else if (fid == 3) fl = uFlicker.z;
    else if (fid == 4) fl = uCrossing.x;
    else if (fid == 5) fl = uCrossing.y;
    vec3 c = albedo * emit * fl + albedo * 0.08;
    c = applyFog(c, vWorldPos, dist);
    gl_FragColor = vec4(c, 1.0);
    return;
  } else if (pat == 14){ // water surface
    vec3 rp = ripples(vWorldPos.xz * 0.8 + vec2(0.0, uTime * 0.05 * param), uTime);
    Np = normalize(N + vec3(rp.x, 0.0, rp.y) * 1.2 + vec3(vnoise(vWorldPos.xz * 2.0 + uTime * 0.3) - 0.5, 0.0, vnoise(vWorldPos.xz * 2.0 - uTime * 0.2) - 0.5) * 0.25);
    gloss = 0.95;
    puddle = 1.0;
  } else if (pat == 15){ // kenchi-ishi retaining wall (diagonal stones)
    vec2 r = vec2(uv.x + uv.y, uv.x - uv.y) * 0.7071;
    vec2 cell = floor(r / 0.36);
    float h = hash12(cell);
    float gl1 = gline(r.x, 0.36, 0.02) + gline(r.y, 0.36, 0.02);
    vec2 f = fract(r / 0.36) - 0.5;
    albedo *= (0.86 + 0.16 * h) * (1.0 - 0.35 * clamp(gl1, 0.0, 1.0)) * (1.0 - 0.1 * dot(f, f) * 4.0);
    float moss = smoothstep(0.55, 0.8, fbm(uv * 0.8 + 4.0)) * 0.6 + (1.0 - smoothstep(0.0, 0.8, uv.y)) * 0.4;
    albedo = mix(albedo, albedo * vec3(0.6, 0.72, 0.48), moss);
    float drip = smoothstep(0.6, 0.85, fbm(vec2(uv.x * 3.0, uv.y * 0.3)));
    albedo *= 1.0 - 0.3 * drip;
    wetDark = 0.3;
  } else if (pat == 16){ // gravel / ballast
    float g = hash12(floor(vWorldPos.xz * 22.0));
    albedo *= 0.75 + 0.45 * g * (1.0 - smoothstep(0.03, 0.1, fw)) + 0.22 * smoothstep(0.03, 0.1, fw);
    wetDark = 0.2;
  } else if (pat == 17){ // soil with grass
    float g = fbm(vWorldPos.xz * 0.6);
    vec3 grass = vec3(0.16, 0.26, 0.08);
    albedo = mix(albedo, grass, smoothstep(0.35, 0.65, g + param * 0.3));
    albedo *= 0.85 + 0.25 * hash12(floor(vWorldPos.xz * 18.0)) * (1.0 - smoothstep(0.03, 0.1, fw));
    wetDark = 0.25;
  } else if (pat == 19){ // road paint
    float wear = fbm(vWorldPos.xz * 2.5);
    albedo *= mix(0.55, 1.0, smoothstep(0.3, 0.55, wear));
    gloss = 0.5;
  } else if (pat == 20){ // concrete L-gutter; uv.x along the road
    float seam = gline(uv.x, 2.0, 0.015);
    albedo *= (0.92 + 0.08 * fbm(uv * 1.5)) * (1.0 - 0.3 * seam);
    wetDark = 0.3;
    gloss = 0.45;
  } else if (pat == 22){ // interlocking pavers
    float row = floor(uv.y / 0.1);
    float bx = uv.x / 0.2 + mod(row, 2.0) * 0.5;
    float gl1 = gline(uv.y, 0.1, 0.008) + gline(bx * 0.2, 0.2, 0.008);
    albedo *= (0.9 + 0.15 * hash12(vec2(floor(bx), row))) * (1.0 - 0.3 * clamp(gl1, 0.0, 1.0));
    wetDark = 0.25;
    gloss = 0.4;
  } else if (pat == 23){ // awning stripes
    float st = step(0.5, fract(uv.x / param));
    albedo = mix(albedo, vec3(0.8, 0.79, 0.74), st);
    wetDark = 0.12;
  } else if (pat == 24){ // solid leafy blob
    float n = fbm(vWorldPos.xz * 1.3 + vWorldPos.y * 1.1);
    albedo *= 0.8 + 0.4 * n;
    wetDark = 0.1;
  } else if (pat == 26){ // steel grating
    float bars = gline(uv.x, 0.033, 0.012);
    albedo *= mix(0.25, 1.0, bars);
    gloss = 0.4;
  } else if (pat == 27){ // rust streaks
    float rs = fbm(vec2(uv.x * 4.0, uv.y * 0.6));
    albedo = mix(albedo, vec3(0.28, 0.12, 0.05), smoothstep(0.45, 0.75, rs) * 0.7);
  } else if (pat == 11){
    isGlass = 1.0;
  }

  // ---- weathering: stains and damp bottoms on walls
  if (weather > 0.0){
    float st = smoothstep(0.52, 0.82, fbm(vec2(uv.x * 2.2, uv.y * 0.12 + vMatB.w * 3.0)));
    float topBias = 0.6 + 0.4 * smoothstep(0.0, 4.0, uv.y);
    albedo *= 1.0 - weather * 0.22 * st * topBias;
    float damp = 1.0 - smoothstep(0.0, 0.35 + 0.25 * vnoise(uv * vec2(2.0, 1.0)), uv.y);
    albedo *= 1.0 - weather * 0.3 * damp;
  }

  // wet surfaces are darker and a bit more saturated
  float upness = smoothstep(0.3, 0.9, N.y);
  float wet = uWet * (0.35 + 0.65 * upness);
  albedo *= 1.0 - wetDark * wet;

  float vis = skyVisibility(vWorldPos, N);
  // painted cool shadow: occlusion also shifts hue towards blue
  vec3 col;
  if (isGlass > 0.5){
    col = interiorWindow(vWorldPos, N, V, uv, vMatB.zw, param, vMatB.x, vColor, emit);
    col *= mix(0.55, 1.0, vis);
    col = applyFog(col, vWorldPos, dist);
    gl_FragColor = vec4(col, 1.0);
    return;
  }

  // puddle / water normals
  #ifdef REFLECT
  if (pat == 10){
    vec3 rp = ripples(vWorldPos.xz, uTime);
    float ripAmt = mix(0.05, 0.8, puddle);
    Np = normalize(N + vec3(rp.x, 0.0, rp.y) * ripAmt);
  }
  #endif

  float ndl = dot(Np, uLightDir);
  float band = smoothstep(-0.1, 0.5, ndl);
  float hemi = Np.y * 0.5 + 0.5;
  vec3 amb = mix(uAmbGround, uAmbSky, hemi);
  vec3 shadowTint = vec3(0.86, 0.9, 1.06);
  vec3 lightAcc = amb * mix(0.5 * shadowTint, vec3(1.0), vis) + uLightColor * band * mix(0.12, 1.0, vis * vis);
  col = albedo * lightAcc;

  vec3 lspec;
  vec3 ll = localLights(vWorldPos, Np, V, gloss, lspec);
  col += albedo * ll + lspec * (0.3 + 0.7 * wet);

  // wet sheen: sky reflection
  vec3 R = reflect(-V, Np);
  float nv = clamp(dot(Np, V), 0.0, 1.0);
  float fres = pow(1.0 - nv, 4.0);
  float refl = gloss * mix(0.04, 1.0, fres) * mix(0.3, 1.0, vis) * (0.4 + 0.6 * wet);
  vec3 env = envColor(R);

  #ifdef REFLECT
  if (uReflOn > 0.5){
    vec4 rc = uReflMatrix * vec4(vWorldPos, 1.0);
    vec2 ruv = rc.xy / rc.w + Np.xz * vec2(0.05, 0.09);
    vec3 sharp = texture(uReflTex, ruv).rgb;
    vec3 blurred = texture(uReflBlur, ruv).rgb;
    vec3 rr = mix(blurred, sharp, puddle * 0.85);
    // reflections fade towards the sky colour where the texture has nothing (outside)
    env = rr;
    float f2 = mix(0.12, 1.0, pow(1.0 - nv, 3.0));
    refl = mix(0.28, 0.8, puddle) * f2 * (0.5 + 0.5 * wet) * mix(0.6, 1.0, vis);
    col *= mix(1.0, 0.45, puddle);
  }
  #endif
  if (pat == 14){
    float f2 = mix(0.3, 1.0, pow(1.0 - nv, 2.0));
    col = mix(albedo * 0.35 * lightAcc, env, f2 * 0.85);
    refl = 0.0;
  }
  col = mix(col, env, clamp(refl, 0.0, 1.0));
  col += albedo * emit;

  col = applyFog(col, vWorldPos, dist);
  gl_FragColor = vec4(col, 1.0);
}
`;

export function makeToonMaterial(opts = {}) {
  const defines = {};
  if (opts.reflect) defines.REFLECT = 1;
  if (opts.atlas) defines.ATLAS = 1;
  const m = new THREE.ShaderMaterial({
    uniforms: opts.atlas ? { ...U, uAtlas: { value: opts.atlas } } : U,
    vertexShader: TOON_VERT,
    fragmentShader: TOON_FRAG,
    vertexColors: true,
    side: opts.side ?? THREE.FrontSide,
    defines,
    polygonOffset: !!opts.polygonOffset,
    polygonOffsetFactor: opts.polygonOffset ? -1 : 0,
    polygonOffsetUnits: opts.polygonOffset ? -2 : 0,
  });
  return m;
}

// ---------------------------------------------------------------------------
// Foliage: alpha-tested leaf cards with spherified normals (painterly clumps)
// ---------------------------------------------------------------------------
const FOLIAGE_VERT = /* glsl */ `
attribute vec4 aMatB;
uniform float uTime;
uniform vec3 uWind;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vColor;
varying vec2 vUv;
varying float vShade;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float sw = aMatB.y;
  float ph = dot(wp.xz, vec2(0.21, 0.17)) + aMatB.z * 6.28;
  float s = sin(uTime * 1.3 + ph) * 0.5 + sin(uTime * 3.1 + ph * 2.3) * 0.18 + sin(uTime * 0.41 + ph * 0.3) * 0.6;
  wp.xyz += vec3(uWind.x, 0.0, uWind.z) * sw * s;
  wp.y += sw * 0.3 * sin(uTime * 2.1 + ph * 1.3);
  // rain drops hitting leaves make them tremble
  wp.y += sw * 0.12 * sin(uTime * 9.0 + ph * 13.0) * step(0.7, fract(ph * 3.7 + uTime * 0.3));
  vWorldPos = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vColor = color;
  vUv = uv;
  vShade = aMatB.x;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FOLIAGE_FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_SKYOCC}
${GLSL_LIGHTS}
uniform sampler2D uLeafTex;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vColor;
varying vec2 vUv;
varying float vShade;
void main(){
  vec4 tx = texture(uLeafTex, vUv);
  // sharpen alpha so alpha-to-coverage gives crisp, antialiased leaf edges
  float aa = (tx.a - 0.5) / max(fwidth(tx.a), 1e-4) + 0.5;
  aa = clamp(aa, 0.0, 1.0);
  if (aa < 0.02) discard;
  vec3 N = normalize(vNormal);
  vec3 toCam = cameraPosition - vWorldPos;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  vec3 albedo = vColor * (0.7 + 0.45 * tx.r);
  float al = dot(albedo, vec3(0.299, 0.587, 0.114));
  albedo = max(mix(vec3(al), albedo, 1.18), 0.0);
  // flowers keep their own tint from the texture's green channel
  float vis = skyVisibility(vWorldPos, N);
  float ndl = dot(N, uLightDir);
  float band = smoothstep(-0.25, 0.35, ndl);
  float hemi = N.y * 0.5 + 0.5;
  vec3 amb = mix(uAmbGround, uAmbSky, hemi);
  vec3 lightAcc = amb * mix(0.45 * vec3(0.85, 0.92, 1.05), vec3(1.0), vis) + uLightColor * band * mix(0.15, 1.0, vis);
  // soft translucency
  float back = pow(max(dot(-V, uLightDir), 0.0), 3.0) * 0.25;
  vec3 col = albedo * (lightAcc + back);
  vec3 lspec;
  col += albedo * localLights(vWorldPos, N, V, 0.2, lspec);
  // wet leaves glint
  vec3 R = reflect(-V, N);
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
  col = mix(col, envColor(R), 0.1 * fres * tx.g * vis + 0.03);
  col *= vShade;
  col = applyFog(col, vWorldPos, dist);
  gl_FragColor = vec4(col, aa);
}
`;

export function makeFoliageMaterial(leafTex) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, uLeafTex: { value: leafTex } },
    vertexShader: FOLIAGE_VERT,
    fragmentShader: FOLIAGE_FRAG,
    vertexColors: true,
    side: THREE.DoubleSide,
    alphaToCoverage: true,
  });
}

// Depth-only material for the sky occlusion pass (handles instancing + sway-less)
export function makeDepthMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      void main(){
        vec4 p = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          p = instanceMatrix * p;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * p;
      }`,
    fragmentShader: /* glsl */ `void main(){ gl_FragColor = vec4(gl_FragCoord.z, 0.0, 0.0, 1.0); }`,
    side: THREE.DoubleSide,
  });
}
