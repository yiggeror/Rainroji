(() => {
'use strict';
/* ============================================================================
   傍晚 · 雨窗 —— 一个永远停在傍晚的旧房间，窗外下着雨
   ----------------------------------------------------------------------------
   渲染：WebGL2，全程线性 HDR（RGBA16F）。每帧的 pass：
     1 outside·sharp    程序化街景，等距柱状广角、清晰，供雨滴折射取样（mip）
     2 outside·defocus  同一街景按相机视角渲染；点光源是能量守恒的解析 bokeh 圆盘
     3 drops → height   CPU 模拟的每颗水滴写成球冠高度场（实例化 quad，MAX 混合，mip）
     4 room             SDF raymarch 室内（动态分辨率、逐帧亚像素抖动）→ 颜色 + 玻璃覆盖率 + 深度；
                        台板玻璃上的倒影是再追踪一次的真实反射
     5 room DOF + TAAU  薄透镜弥散圆（焦点在玻璃上），再做时域上采样：静止时收敛到全分辨率的超采样画面
     6 composite        全分辨率：玻璃的折射、全反射、菲涅尔、雾珠、冷凝雾、室内倒影，叠在室内上
     7 bloom            13-tap 降采样链 + tent 升采样，按能量混合（不设阈值）
     8 final            色差 / 暗角 / 曝光（眼睛适应）→ ACES → 调色 → sRGB → 颗粒、抖动
   模拟（CPU，真实毫米）：钉扎、滑动、合并、拖尾、雾珠吸收，见「RAIN ON GLASS」一节。
   声音：Web Audio 实时合成，由模拟事件驱动，见「AUDIO」一节。
   主要近似及原因（每处在对应代码旁另有注释）：
     · 雨滴显示放大 MAG 倍（物理按真实尺寸计算）：真实尺度下透镜成像只有 2–3 个像素
     · 窗外按方向参数化：远景视差可忽略；bokeh 用解析圆盘而不做散射式景深
     · 间接光 = 虚拟点光源 + radiosity 常量 × AO：真正的 GI 在手机上不可行
     · 雾珠用连续密度场 + 程序化小珠表示，不逐颗模拟
   单位：米；x 向右，y 向上，z 指向观者（窗墙内表面 z = 0，窗外 z < 0）。
   调试参数：?shot &seed= &warm=秒 &lamp=0 &still &q=室内分辨率 &frames=N
            &view=room|dof|defocus|sharp|height|state|bloom|cov|depth &dbg=1..11 &zoom= &zx= &zy=
   ========================================================================== */

// ---------------------------------------------------------------- params ---
const YL = window.YL = window.YL || {};          // 《一粒光》: shared with director.js, hero.js and the other worlds
const QS = new URLSearchParams(location.search);
const DBG = {
  shot: QS.has('shot'),                 // screenshot mode: no fade, preserve buffer
  seed: +(QS.get('seed') || 0) || ((Math.random() * 1e9) | 0),
  lamp: QS.get('lamp') !== '0',
  still: QS.has('still'),               // freeze handheld drift
  flash: +(QS.get('flash') || 0),       // hold a lightning flash at this strength (screenshots)
  view: QS.get('view') || '',           // debug buffer view
  t0: +(QS.get('t') || 0),              // start time offset (s)
  frames: +(QS.get('frames') || 0),     // stop after N frames (screenshots of slow software GL)
  zoom: +(QS.get('zoom') || 1), zx: +(QS.get('zx') || 0), zy: +(QS.get('zy') || 1.5),   // inspect the glass
};

// ------------------------------------------------------------------ math ---
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// 视角：窗内，或走到楼下的人行道上回头看这扇窗。切换像一次剪辑：暗下 0.6 s，再亮起 1.2 s。
const VIEW = { out: QS.get('view') === 'out', want: QS.get('view') === 'out', mix: QS.get('view') === 'out' ? 1 : 0 };
if (VIEW.out) DBG.view = '';
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rnd = mulberry32(DBG.seed);
const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};
// smooth pseudo-random 1D signal (sum of incommensurate sines) for camera drift
const drift = (t, s) => (Math.sin(t * 0.71 + s) * 0.5 + Math.sin(t * 1.37 + s * 2.1) * 0.3 + Math.sin(t * 2.29 + s * 3.7) * 0.2);

// ----------------------------------------------------------------- color ---
// 黑体色温 → 线性 sRGB：Planck 轨迹的 Kim et al.(2002) 三次拟合给出 CIE xy，
// XYZ→sRGB(D65)；再对 3900K 做 von Kries 式白平衡（模拟眼睛对暖色室内的部分适应），
// 亮度归一化为 1。这样 2700K 白炽灯呈琥珀色、9000K 阴天傍晚天光呈冷青蓝，
// 两者的相对关系符合物理直觉。
function bbXYZ(T) {
  const x = T < 4000 ? -0.2661239e9 / T ** 3 - 0.2343589e6 / T ** 2 + 0.8776956e3 / T + 0.179910
                     : -3.0258469e9 / T ** 3 + 2.1070379e6 / T ** 2 + 0.2226347e3 / T + 0.240390;
  const y = T < 2222 ? -1.1063814 * x ** 3 - 1.34811020 * x ** 2 + 2.18555832 * x - 0.20219683
          : T < 4000 ? -0.9549476 * x ** 3 - 1.37418593 * x ** 2 + 2.09137015 * x - 0.16748867
                     : 3.0817580 * x ** 3 - 5.87338670 * x ** 2 + 3.75112997 * x - 0.37001483;
  return [x / y, 1, (1 - x - y) / y];
}
const xyz2rgb = ([X, Y, Z]) => [3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z, -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z, 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z];
const WB = xyz2rgb(bbXYZ(3900));
function bb(T, sat = 1) {
  const c = xyz2rgb(bbXYZ(clamp(T, 1667, 25000)));
  let r = [c[0] / WB[0], c[1] / WB[1], c[2] / WB[2]].map(v => Math.max(v, 0));
  const L = 0.2126 * r[0] + 0.7152 * r[1] + 0.0722 * r[2];
  return r.map(v => lerp(1, v / L, sat));
}
const mulc = (c, s) => [c[0] * s, c[1] * s, c[2] * s];

// ------------------------------------------------------------ scene (m) ---
// 房间与窗户几何：JS 与 GLSL 共用（注入为 #define），保证拾取/擦拭与渲染一致。
const S = {
  ROOM_X0: -0.93, ROOM_X1: 2.4, ROOM_H: 2.78, ROOM_Z1: 3.6,
  WIN_X0: -0.52, WIN_X1: 0.52, WIN_Y0: 0.93, WIN_Y1: 2.30,
  GLASS_Z: -0.12, FRAME_Z0: -0.16, FRAME_Z1: -0.085,
  FW: 0.056, MW: 0.036, TRANSOM_Y: 1.90, TW: 0.03,
  DESK_TOP: 0.76, DESK_X0: -0.905, DESK_X1: 0.88, DESK_Z0: 0.004, DESK_Z1: 0.66,
  LAMP_X: -0.535, LAMP_Z: 0.21,
  SHADE_Y0: 0.30, SHADE_Y1: 0.475, SHADE_R0: 0.138, SHADE_R1: 0.09, BULB_Y: 0.385, BULB_R: 0.026,
  MUG_X: -0.17, MUG_Z: 0.17, MUG_R: 0.041, MUG_H: 0.092, MUG_HANG: 0.55,
  BOOK_X: 0.36, BOOK_Z: 0.20,
  CURT_X0: 0.47, CURT_X1: 0.98, CURT_Z: 0.075,
  // outside world: a raised ground floor of an old building, facing a wide street
  GROUND_Y: -2.3, CURB_Z: -26.0, FACADE_Z: -30.5, FAR_Z: -170.0,
  // equirect range of the sharp outside texture (rad)
  AZM: 1.45, ELMIN: -1.25, ELMAX: 1.15,
};
S.WIN_CX = (S.WIN_X0 + S.WIN_X1) / 2; S.WIN_CY = (S.WIN_Y0 + S.WIN_Y1) / 2;
S.WIN_HW = (S.WIN_X1 - S.WIN_X0) / 2; S.WIN_HH = (S.WIN_Y1 - S.WIN_Y0) / 2;
// glass panes (inside the frame members): lower-left, lower-right, upper-left, upper-right
S.PANES = [
  [S.WIN_X0 + S.FW, S.WIN_Y0 + S.FW, -S.MW, S.TRANSOM_Y - S.TW],
  [S.MW, S.WIN_Y0 + S.FW, S.WIN_X1 - S.FW, S.TRANSOM_Y - S.TW],
  [S.WIN_X0 + S.FW, S.TRANSOM_Y + S.TW, -S.MW, S.WIN_Y1 - S.FW],
  [S.MW, S.TRANSOM_Y + S.TW, S.WIN_X1 - S.FW, S.WIN_Y1 - S.FW],
];
S.BULB = [S.LAMP_X, S.DESK_TOP + S.BULB_Y, S.LAMP_Z];

function glslDefines() {
  const f = v => { const s = (+v).toFixed(6); return v < 0 ? `(${s})` : s; };
  let out = '';
  for (const k in S) if (typeof S[k] === 'number') out += `#define ${k} ${f(S[k])}\n`;
  S.PANES.forEach((p, i) => {
    out += `#define PANE${i}_C vec2(${f((p[0] + p[2]) / 2)},${f((p[1] + p[3]) / 2)})\n`;
    out += `#define PANE${i}_H vec2(${f((p[2] - p[0]) / 2)},${f((p[3] - p[1]) / 2)})\n`;
  });
  return out;
}

/* ============================================================================
   GLSL
   ========================================================================== */
const GLSL_HEAD = () => `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
${glslDefines()}
#define PI 3.14159265359
float sat(float x){ return clamp(x, 0.0, 1.0); }
float hash11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
vec3 hash32(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yzz) * p3.zyx); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }
const mat2 FBM_R = mat2(1.6, 1.2, -1.2, 1.6);
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = FBM_R * p + vec2(3.1, 1.7); a *= 0.5; } return s; }
float fbm3(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++){ s += a * vnoise(p); p = FBM_R * p + vec2(3.1, 1.7); a *= 0.5; } return s / 0.875; }
`;

const VS_FULL = `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

// --------------------------------------------------------------------------
// Shared lamp / room-light model (used by the room raymarcher and by the
// analytic interior used for reflections in the glass and in rain drops).
// --------------------------------------------------------------------------
const GLSL_LIGHT = `
uniform vec3 uLampI;     // bulb radiant intensity (linear rgb, incl. flicker / on-off / filament colour)
uniform vec3 uShadeTau;  // diffuse transmittance of the shade fabric (warm tint)
uniform vec3 uSkyL;      // radiance seen through the upper window (dusk sky)
uniform vec3 uCityL;     // radiance seen through the lower window (street, facades)
uniform vec3 uAmbL;      // radiosity-style ambient irradiance from the lamp
uniform vec3 uAmbS;      // ambient irradiance from the window
uniform vec3 uHeroP;     // 一粒光：从灯丝里跳出来的那粒光的位置
uniform vec3 uHeroI;     // its radiant intensity (0 while it is still inside the bulb)
const float HERO_R = 0.0055;
const vec3 BULB = vec3(LAMP_X, DESK_TOP + BULB_Y, LAMP_Z);

// 灯罩对点光源的调制：从灯泡出发的方向若穿过下/上开口则全透，穿过布面则按 τ 透射。
// 开口边缘按灯泡角半径做线性软化（灯泡不是点，边缘有半影）。
vec3 lampEmitFactor(vec3 dir){
  float a = acos(clamp(-dir.y, -1.0, 1.0));              // angle from straight down
  float aDown = atan(SHADE_R0, BULB_Y - SHADE_Y0);
  float aUp = PI - atan(SHADE_R1, SHADE_Y1 - BULB_Y);
  float open = smoothstep(aDown + 0.2, aDown - 0.2, a) + smoothstep(aUp - 0.22, aUp + 0.22, a);
  return mix(uShadeTau, vec3(1.0), sat(open));
}
// fabric shade radiance seen from outside at point p (Lambertian transmission: L = τ E / π)
vec3 shadeRadiance(vec3 p){
  vec3 q = p - vec3(LAMP_X, DESK_TOP, LAMP_Z);
  vec3 L = BULB - p; float d2 = dot(L, L);
  float y01 = (q.y - SHADE_Y0) / (SHADE_Y1 - SHADE_Y0);
  float ang = atan(q.z, q.x);
  float pleat = 0.84 + 0.16 * pow(0.5 + 0.5 * cos(ang * 46.0), 0.7);                // folds: thicker cloth at the creases
  float weave = 0.94 + 0.06 * vnoise(vec2(ang * 120.0, y01 * 60.0));
  float trim = 1.0 - 0.55 * (smoothstep(0.07, 0.0, y01) + smoothstep(0.93, 1.0, y01)); // bias binding at the rims
  float seam = 1.0 - 0.35 * smoothstep(0.025, 0.0, abs(ang - 2.2));
  float aged = 1.0 - 0.12 * smoothstep(0.5, 0.8, vnoise(vec2(ang * 3.0, y01 * 4.0)));   // faint brown age spots
  // years of heat above the bulb have browned the cloth on one side
  float scorch = smoothstep(0.5, 0.9, y01) * smoothstep(0.9, 0.0, abs(ang - 0.7)) * (0.6 + 0.4 * vnoise(vec2(ang * 9.0, y01 * 12.0)));
  vec3 tint = mix(vec3(1.0), vec3(0.78, 0.6, 0.38), scorch * 0.55);
  // the little light, while it is still inside the shade (or close by), shines through the cloth too
  vec3 Lh = p - uHeroP; float hd2 = max(dot(Lh, Lh), 0.0025);
  return (uLampI * (0.48 / d2) + uHeroI * (0.6 / hd2)) * uShadeTau / PI * pleat * weave * trim * seam * aged * tint;
}
// rectangular Lambertian emitter → irradiance / radiance (Lambert polygon formula, exact w/o horizon clipping)
float edgeT(vec3 a, vec3 b, vec3 n){ float c = clamp(dot(a, b), -0.9999, 0.9999); vec3 cr = cross(a, b); return acos(c) * dot(n, cr) * inversesqrt(max(dot(cr, cr), 1e-10)); }
float rectIrr(vec3 p, vec3 n, vec2 lo, vec2 hi, float z){
  vec3 a = normalize(vec3(lo.x, lo.y, z) - p), b = normalize(vec3(hi.x, lo.y, z) - p);
  vec3 c = normalize(vec3(hi.x, hi.y, z) - p), d = normalize(vec3(lo.x, hi.y, z) - p);
  return max(0.0, -0.5 * (edgeT(a, b, n) + edgeT(b, c, n) + edgeT(c, d, n) + edgeT(d, a, n)));
}
`;

// --------------------------------------------------------------------------
// ROOM: SDF raymarcher
// --------------------------------------------------------------------------
// everything the room raymarcher needs except its main(): the street view reuses it to see into the room
const ROOM_LIB = `
uniform vec2 uRes;
uniform vec3 uCamPos, uCamFwd, uCamRight, uCamUp;
uniform vec2 uTan;
uniform float uTime;
uniform vec2 uJitter;                 // sub-pixel offset (Halton), accumulated by the TAA pass
uniform vec4 uClock;                  // stopped wall clock: hand angles (rad, clockwise from 12)
uniform vec4 uVar;                    // per-visit variation: thermos paint, calendar print, …
uniform float uSteam;                 // tea warmth
uniform float uSeason;                // 0 spring, 1 summer, 2 autumn, 3 winter: what stands on the sill and the desk
layout(location = 0) out vec4 oCol;   // rgb: room radiance (premultiplied by 1-coverage), a: glass coverage
layout(location = 1) out vec4 oAux;   // r: view depth

#define M_WALL 1.0
#define M_FRAME 2.0
#define M_SILL 3.0
#define M_DESK 4.0
#define M_BRASS 5.0
#define M_SHADE 6.0
#define M_BULB 7.0
#define M_MUG 8.0
#define M_TEA 9.0
#define M_BOOK0 10.0
#define M_BOOK1 11.0
#define M_BOOK2 12.0
#define M_CURTAIN 14.0
#define M_CORD 15.0
#define M_LEAF 16.0
#define M_POT 17.0
#define M_SOIL 18.0
#define M_CLOCK 19.0
#define M_HANDS 20.0
#define M_CAL 21.0
#define M_THERMOS 22.0
#define M_CORK 23.0
#define M_PAPER 24.0
#define M_PEN 25.0
#define M_RADIO 26.0
#define M_SECOND 27.0
#define M_NBCOVER 28.0
#define M_GTOP 29.0
#define M_WIRE 30.0
#define M_BAKELITE 31.0
#define M_PLUG 32.0
#define M_CHROME 33.0
#define M_RUNNER 34.0
#define M_BLOSSOM 35.0
#define M_TWIG 36.0
#define M_BOTTLE 37.0
#define M_COIL 38.0
#define M_TIN 39.0
#define M_FAN 40.0
#define M_FANRIM 41.0
#define M_KAKI 42.0
#define M_CALYX 43.0
#define M_HWB 44.0
#define M_STOPPER 45.0
const vec3 SEAS_P = vec3(-0.24, WIN_Y0, -0.035);    // the left half of the sill: this season's things
const vec3 DESK_SP = vec3(-0.33, DESK_TOP, 0.31);   // and a spot on the desk in front of the lamp
const float COIL_B = 0.0013, COIL_T1 = 38.5;         // mosquito coil: Archimedean spiral r = bθ, 8 mm pitch, burnt back to θ = T1
const vec3 EMBER = SEAS_P + vec3(0.05005 * 0.6967, 0.0145, 0.05005 * 0.7174);
const vec3 SOCKET_P = vec3(-0.862, 0.905, 0.0);       // old surface-mounted socket left of the window
const vec3 PLANT_P = vec3(0.30, WIN_Y0, -0.028);     // spider plant on the sill
const vec3 CLOCK_P = vec3(-0.735, 1.70, 0.0);        // wall clock above the lamp
const vec3 CAL_P = vec3(ROOM_X0, 1.47, 0.36);        // calendar on the side wall
const vec3 TH_P = vec3(0.645, DESK_TOP, 0.275);      // thermos flask
const vec3 NB_P = vec3(0.05, DESK_TOP, 0.275);       // open notebook
const vec3 RADIO_P = vec3(0.115, DESK_TOP, 0.072);   // transistor radio under the sill

float sdBox(vec3 p, vec3 b){ vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
float sdBox2(vec2 p, vec2 b){ vec2 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0); }
float sdRBox(vec3 p, vec3 b, float r){ return sdBox(p, b - r) - r; }
float sdCylY(vec3 p, float r, float h){ vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h); return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)); }
float sdSeg2(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
vec2 opU(vec2 a, vec2 b){ return a.x < b.x ? a : b; }
float sdCylZ(vec3 p, float r, float h){ return sdCylY(p.xzy, r, h); }
float sdCapsule(vec3 p, vec3 a, vec3 b, float r){ vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }
// Quilez: vertical frustum centred at the origin, half height h, radii r1 (bottom) → r2 (top)
float sdCappedCone(vec3 p, float h, float r1, float r2){
  vec2 q = vec2(length(p.xz), p.y);
  vec2 k1 = vec2(r2, h), k2 = vec2(r2 - r1, 2.0 * h);
  vec2 ca = vec2(q.x - min(q.x, (q.y < 0.0) ? r1 : r2), abs(q.y) - h);
  vec2 cb = q - k1 + k2 * clamp(dot(k1 - q, k2) / dot(k2, k2), 0.0, 1.0);
  float s = (cb.x < 0.0 && ca.y < 0.0) ? -1.0 : 1.0;
  return s * sqrt(min(dot(ca, ca), dot(cb, cb)));
}
vec2 rot2(vec2 v, float a){ float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }

// ---- walls with the window opening carved through
float sdRoom(vec3 p){
  vec3 c = vec3((ROOM_X0 + ROOM_X1) * 0.5, ROOM_H * 0.5, ROOM_Z1 * 0.5);
  vec3 h = vec3((ROOM_X1 - ROOM_X0) * 0.5, ROOM_H * 0.5, ROOM_Z1 * 0.5);
  float d = -sdBox(p - c, h);
  float op = sdBox(p - vec3(WIN_CX, WIN_CY, -0.26), vec3(WIN_HW, WIN_HH, 0.265));
  return max(d, -op);
}
// ---- old wooden casement: outer frame, centre mullion, transom; pane openings bevelled toward the room
float sdFrame(vec3 p){
  vec3 q = p - vec3(WIN_CX, WIN_CY, (FRAME_Z0 + FRAME_Z1) * 0.5);
  float slab = sdBox(q, vec3(WIN_HW, WIN_HH, (FRAME_Z1 - FRAME_Z0) * 0.5));
  float bev = max(p.z - GLASS_Z, 0.0) * 0.55;
  float holes = sdBox2(p.xy - PANE0_C, PANE0_H + bev);
  holes = min(holes, sdBox2(p.xy - PANE1_C, PANE1_H + bev));
  holes = min(holes, sdBox2(p.xy - PANE2_C, PANE2_H + bev));
  holes = min(holes, sdBox2(p.xy - PANE3_C, PANE3_H + bev));
  float d = max(slab, -holes * 0.87);
  // the two casements meet on the mullion: a thin shadow gap; plus the sash / casing joint lines
  float gap = sdBox(p - vec3(0.0, (WIN_Y0 + TRANSOM_Y) * 0.5, FRAME_Z1), vec3(0.0012, (TRANSOM_Y - WIN_Y0) * 0.5 - FW * 0.5, 0.01));
  d = max(d, -gap);
  // window latch (brass hook) on the mullion
  float latch = sdRBox(p - vec3(0.0, 1.42, FRAME_Z1 + 0.006), vec3(0.008, 0.028, 0.006), 0.003);
  return min(d, latch);
}
float sdSill(vec3 p){ return sdRBox(p - vec3(WIN_CX, WIN_Y0 - 0.017, -0.07), vec3(WIN_HW + 0.055, 0.017, 0.105), 0.004); }

vec2 sdDesk(vec3 p){
  // the wooden top sits 5 mm low: a glass plate (台板玻璃) lies on it, and everything stands on the glass
  float top = sdRBox(p - vec3((DESK_X0 + DESK_X1) * 0.5, DESK_TOP - 0.005 - 0.017, (DESK_Z0 + DESK_Z1) * 0.5),
                     vec3((DESK_X1 - DESK_X0) * 0.5, 0.017, (DESK_Z1 - DESK_Z0) * 0.5), 0.006);
  float plate = sdRBox(p - vec3(-0.01, DESK_TOP - 0.0025, 0.325), vec3(0.865, 0.0025, 0.305), 0.0009);
  float apron = sdRBox(p - vec3((DESK_X0 + DESK_X1) * 0.5, DESK_TOP - 0.034 - 0.06, DESK_Z1 - 0.035),
                       vec3((DESK_X1 - DESK_X0) * 0.5 - 0.035, 0.06, 0.014), 0.003);
  // drawer seam
  float seam = sdBox(p - vec3(0.12, DESK_TOP - 0.094, DESK_Z1 - 0.02), vec3(0.31, 0.047, 0.004));
  seam = abs(seam) - 0.0012;
  apron = max(apron, -seam);
  float knob = length(p - vec3(0.12, DESK_TOP - 0.094, DESK_Z1 - 0.016)) - 0.011;
  vec2 r = vec2(min(top, apron), M_DESK);
  r = opU(r, vec2(plate, M_GTOP));
  return opU(r, vec2(knob, M_BRASS));
}

vec2 sdLamp(vec3 p, bool solidShade){
  vec3 q = p - vec3(LAMP_X, DESK_TOP, LAMP_Z);
  float bound = sdCylY(q - vec3(0.0, 0.25, 0.0), 0.15, 0.255);
  // 灯体本身紧贴灯泡：半影估计对「贴着光源的遮挡物」无效，且真实灯座/灯杆的影子可忽略 → 不参与阴影
  if (!solidShade) return vec2(max(bound, 0.002), -1.0);
  if (bound > 0.03) return vec2(bound, -1.0);
  float r = length(q.xz);
  float base = sdCylY(q - vec3(0.0, 0.008, 0.0), 0.066, 0.008) - 0.003;
  float dome = (length(vec3(q.x, (q.y - 0.016) * 1.8, q.z)) - 0.046) / 1.8;
  float collar = sdCylY(q - vec3(0.0, 0.05, 0.0), 0.012, 0.012) - 0.002;
  float stem = sdCylY(q - vec3(0.0, 0.19, 0.0), 0.0062, 0.17);
  float socket = sdCylY(q - vec3(0.0, 0.338, 0.0), 0.016, 0.026) - 0.002;
  float knob = length(q - vec3(0.024, 0.347, 0.004)) - 0.0065;
  // harp: two thin wires from the socket to the top finial
  vec3 hq = q; hq.x = abs(hq.x);
  float harp = sdSeg2(vec2(length(vec2(hq.x - 0.0, hq.z)), q.y), vec2(0.02, 0.356), vec2(0.004, SHADE_Y1 + 0.012));
  harp = max(abs(q.z) - 0.0016, harp - 0.0016);
  float finial = length(q - vec3(0.0, SHADE_Y1 + 0.016, 0.0)) - 0.009;
  float brass = min(min(min(base, dome), min(collar, stem)), min(min(socket, knob), min(harp, finial)));
  vec2 res = vec2(brass, M_BRASS);
  if (solidShade){
    float sh = sdSeg2(vec2(r, q.y), vec2(SHADE_R0, SHADE_Y0), vec2(SHADE_R1, SHADE_Y1)) - 0.0018;
    res = opU(res, vec2(sh, M_SHADE));
    res = opU(res, vec2(length(q - vec3(0.0, BULB_Y, 0.0)) - BULB_R, M_BULB));
  }
  return res;
}

vec2 sdMug(vec3 p){
  vec3 q = p - vec3(MUG_X, DESK_TOP, MUG_Z);
  float bound = sdCylY(q - vec3(0.0, MUG_H * 0.5, 0.0), MUG_R + 0.045, MUG_H * 0.5 + 0.01);
  if (bound > 0.03) return vec2(bound, -1.0);
  float r = length(q.xz);
  float rr = MUG_R - 0.0025 + 0.0025 * q.y / MUG_H;
  float outer = sdCylY(q - vec3(0.0, MUG_H * 0.5, 0.0), rr - 0.002, MUG_H * 0.5 - 0.002) - 0.002;
  float inner = sdCylY(q - vec3(0.0, MUG_H * 0.5 + 0.004, 0.0), rr - 0.0024, MUG_H * 0.5);
  float body = max(outer, -inner);
  float rim = length(vec2(r - (rr - 0.0012), q.y - MUG_H)) - 0.0027;
  body = min(body, rim);
  // handle: half torus in the handle's local plane
  vec2 hd = vec2(cos(MUG_HANG), sin(MUG_HANG));
  vec3 h = vec3(dot(q.xz, hd), q.y - MUG_H * 0.53, dot(q.xz, vec2(-hd.y, hd.x)));
  h.x -= rr + 0.002;
  float hdist = length(vec2(length(h.xy * vec2(1.0, 0.92)) - 0.026, h.z * 0.75)) - 0.0042;
  hdist = max(hdist, -h.x - 0.002);
  body = min(body, hdist);
  vec2 res = vec2(body, M_MUG);
  float tea = sdCylY(q - vec3(0.0, MUG_H * 0.70, 0.0), rr - 0.0025, 0.0008);
  return opU(res, vec2(tea, M_TEA));
}

vec2 sdBooks(vec3 p){
  vec3 q = p - vec3(BOOK_X, DESK_TOP, BOOK_Z);
  float bound = sdBox(q - vec3(0.0, 0.045, 0.0), vec3(0.17, 0.05, 0.15));
  if (bound > 0.03) return vec2(bound, -1.0);
  vec3 b0 = q - vec3(0.0, 0.0165, 0.0); b0.xz = rot2(b0.xz, 0.10);
  vec3 b1 = q - vec3(-0.012, 0.033 + 0.012, 0.01); b1.xz = rot2(b1.xz, -0.08);
  vec3 b2 = q - vec3(0.02, 0.057 + 0.009, -0.004); b2.xz = rot2(b2.xz, 0.22);
  vec2 r = vec2(sdRBox(b0, vec3(0.132, 0.0165, 0.094), 0.0025), M_BOOK0);
  r = opU(r, vec2(sdRBox(b1, vec3(0.118, 0.012, 0.084), 0.002), M_BOOK1));
  r = opU(r, vec2(sdRBox(b2, vec3(0.09, 0.009, 0.064), 0.0018), M_BOOK2));
  return r;
}

// ---- spider plant (吊兰) in a terracotta pot: arching leaves, each a tapered 3-segment capsule chain
vec2 sdPlant(vec3 p){
  vec3 q = p - PLANT_P;
  float bound = sdBox(q - vec3(0.0, 0.07, 0.06), vec3(0.24, 0.23, 0.15));
  if (bound > 0.03) return vec2(bound, -1.0);
  float pot = sdCappedCone(q - vec3(0.0, 0.042, 0.0), 0.042, 0.040, 0.052) - 0.002;
  pot = max(pot, -sdCappedCone(q - vec3(0.0, 0.05, 0.0), 0.042, 0.035, 0.047));
  float lip = length(vec2(length(q.xz) - 0.052, q.y - 0.084)) - 0.0055;
  vec2 res = vec2(min(pot, lip), M_POT);
  res = opU(res, vec2(sdCylY(q - vec3(0.0, 0.074, 0.0), 0.046, 0.002), M_SOIL));
  if (q.y > -0.07){
    float dl = 1e9;
    for (int i = 0; i < 20; i++){
      float fi = float(i);
      float h1 = hash11(fi * 7.31 + 1.1), h2 = hash11(fi * 3.17 + 5.2), h3 = hash11(fi * 11.7 + 2.9);
      float phi = -0.55 + fract(fi * 0.618 + 0.3 * h1) * 4.25;  // golden-ratio spread round the crown, never into the glass
      float sz = sin(phi);
      vec3 D = vec3(cos(phi), 0.0, sz < 0.0 ? sz * 0.3 : sz);
      vec3 W = normalize(vec3(-D.z, 0.0, D.x));                 // the ribbon's width lies across the arch
      float young = step(13.0, fi);                              // the last leaves are short and upright, the heart of the tuft
      float L = mix(0.14 + 0.10 * h2, 0.06 + 0.04 * h2, young);
      // a leaf follows a fountain-like arc (up·L·(a·s − b·s²) + D·L·s), curling a little sideways; 7 short segments
      // leaves reaching into the room droop over the sill's edge; sideways ones stay above the sill
      float A = mix(2.0 + 0.8 * h3, 4.5, young), B = mix(2.3 + (0.6 + 1.0 * h1) * (0.4 + 0.4 * max(D.z, 0.0)), 3.0, young);
      vec3 C = W * (h3 - 0.5) * 0.45;
      // cheap reject: this leaf lies inside a sphere of radius ≈ 0.75 L around its middle
      vec3 mid = vec3(0.0, 0.072, 0.0) + D * 0.5 * L + vec3(0.0, L * (A * 0.5 - B * 0.25) * 0.7, 0.0);
      if (length(q - mid) - 0.8 * L > dl) continue;
      vec3 prev = vec3(0.0, 0.072, 0.0) + D * 0.006;
      for (int k = 1; k <= 7; k++){
        float sN = float(k) / 7.0;
        vec3 cur = vec3(0.0, 0.072, 0.0) + (D * sN + C * sN * sN) * L + vec3(0.0, L * (A * sN - B * sN * sN) * 0.7, 0.0);
        vec3 ba = cur - prev, pa = q - prev;
        float hh = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
        vec3 e = pa - ba * hh;
        float tAlong = (float(k - 1) + hh) / 7.0;
        float hw = mix(0.005 + 0.0015 * h2, 0.0007, tAlong * tAlong);   // half width tapers to a point
        float ew = dot(e, W);
        float et = length(e - W * ew);
        dl = min(dl, length(vec2(max(abs(ew) - hw, 0.0), et)) - 0.0007);
        prev = cur;
      }
    }
    res = opU(res, vec2(dl * 0.9, M_LEAF));
  }
  // runners (匍匐茎): thin stems arching over the sill's edge, each ending in a baby plant hanging in the air
  float dr = 1e9, db = 1e9;
  for (int k = 0; k < 2; k++){
    float fk = float(k);
    vec3 D = normalize(vec3(k == 0 ? -0.45 : 0.55, 0.0, 0.85));
    vec3 r0 = vec3(0.0, 0.08, 0.0), r1 = r0 + D * 0.05 + vec3(0.0, 0.05, 0.0), r2 = r0 + D * 0.11 + vec3(0.0, 0.02, 0.0);
    vec3 r3 = r0 + D * 0.135 + vec3(0.0, -0.05, 0.0), r4 = r0 + D * 0.14 + vec3(0.0, -0.11 - 0.03 * fk, 0.0);
    dr = min(dr, min(min(sdCapsule(q, r0, r1, 0.0014), sdCapsule(q, r1, r2, 0.0014)), min(sdCapsule(q, r2, r3, 0.0013), sdCapsule(q, r3, r4, 0.0012))));
    for (int i = 0; i < 6; i++){
      float a = float(i) * 1.047 + fk * 0.5;
      vec3 L = vec3(cos(a), 0.0, sin(a));
      vec3 t1 = r4 + L * 0.016 + vec3(0.0, 0.012, 0.0), t2 = r4 + L * 0.034 - vec3(0.0, 0.004, 0.0);
      db = min(db, min(sdCapsule(q, r4, t1, 0.0026), sdCapsule(q, t1, t2, 0.0016)));
    }
  }
  res = opU(res, vec2(dr, M_RUNNER));
  return opU(res, vec2(db, M_LEAF));
}
// ---- an old wall clock: it shows the scene's hour, so while time stands still it is stopped at dusk
vec2 sdClock(vec3 p){
  vec3 q = p - CLOCK_P;
  float bound = sdBox(q - vec3(0.0, 0.0, 0.022), vec3(0.125, 0.125, 0.026));
  if (bound > 0.03) return vec2(bound, -1.0);
  float r = length(q.xy);
  float body = sdCylZ(q - vec3(0.0, 0.0, 0.016), 0.112, 0.016) - 0.003;
  float bezel = length(vec2(r - 0.104, q.z - 0.035)) - 0.0065;
  body = max(body, -sdCylZ(q - vec3(0.0, 0.0, 0.036), 0.098, 0.006));
  vec2 res = vec2(min(body, bezel), M_CLOCK);
  float hd = 1e9, sd = 1e9;
  for (int k = 0; k < 3; k++){
    float a = k == 0 ? uClock.x : k == 1 ? uClock.y : uClock.z;
    vec2 dir = vec2(sin(a), cos(a));
    vec2 uv = vec2(dot(q.xy, vec2(dir.y, -dir.x)), dot(q.xy, dir));
    float len = k == 0 ? 0.052 : k == 1 ? 0.078 : 0.086;
    float wid = k == 0 ? 0.0034 : k == 1 ? 0.0023 : 0.0007;
    float tail = k == 2 ? 0.022 : 0.012;
    float d2 = sdBox2(uv - vec2(0.0, (len - tail) * 0.5), vec2(wid * (1.0 - 0.45 * sat(uv.y / len)), (len + tail) * 0.5));
    float d3 = max(d2, abs(q.z - 0.0315 - float(k) * 0.0012) - 0.0005);
    if (k == 2) sd = d3; else hd = min(hd, d3);
  }
  hd = min(hd, length(q - vec3(0.0, 0.0, 0.0335)) - 0.0035);
  return opU(opU(res, vec2(hd, M_HANDS)), vec2(sd, M_SECOND));
}
// ---- picture calendar hung from a nail; its lower edge curls off the damp wall
vec2 sdCalendar(vec3 p){
  vec3 q = p - CAL_P;
  float bound = sdBox(q - vec3(0.015, 0.03, 0.0), vec3(0.025, 0.25, 0.16));
  if (bound > 0.03) return vec2(bound, -1.0);
  float curl = 0.002 + 0.017 * pow(sat((-q.y - 0.05) / 0.16), 2.0) + 0.004 * sat(abs(q.z) / 0.142) * sat(-q.y / 0.2);
  vec2 res = vec2(sdBox(vec3(q.x - curl, q.y, q.z), vec3(0.0012, 0.205, 0.142)) * 0.7, M_CAL);
  float bar = sdRBox(q - vec3(0.004, 0.201, 0.0), vec3(0.004, 0.008, 0.145), 0.002);
  float nail = length(q - vec3(0.004, 0.262, 0.0)) - 0.0035;
  res = opU(res, vec2(min(bar, nail), M_BRASS));
  float cord = min(sdCapsule(q, vec3(0.005, 0.207, -0.125), vec3(0.004, 0.262, 0.0), 0.001), sdCapsule(q, vec3(0.005, 0.207, 0.125), vec3(0.004, 0.262, 0.0), 0.001));
  return opU(res, vec2(cord, M_CORD));
}
// ---- iron-shell thermos flask (暖水瓶) with a cork stopper
vec2 sdThermos(vec3 p){
  vec3 q = p - TH_P;
  float bound = sdCylY(q - vec3(0.0, 0.19, 0.0), 0.11, 0.2);
  if (bound > 0.03) return vec2(bound, -1.0);
  float body = sdCylY(q - vec3(0.0, 0.142, 0.0), 0.057, 0.128) - 0.002;
  float shoulder = sdCappedCone(q - vec3(0.0, 0.291, 0.0), 0.02, 0.059, 0.036);
  float neck = sdCylY(q - vec3(0.0, 0.318, 0.0), 0.032, 0.01) - 0.002;
  vec2 res = vec2(min(min(body, shoulder), neck), M_THERMOS);
  float foot = sdCylY(q - vec3(0.0, 0.007, 0.0), 0.0595, 0.007) - 0.0015;
  float seam = length(vec2(length(q.xz) - 0.059, q.y - 0.272)) - 0.0028;
  vec3 hq = q - vec3(0.06, 0.19, 0.0);
  float handle = max(length(vec2(length(hq.xy * vec2(1.0, 0.5)) - 0.03, hq.z)) - 0.0045, -hq.x);
  res = opU(res, vec2(min(min(foot, seam), handle), M_BRASS));
  return opU(res, vec2(sdCappedCone(q - vec3(0.0, 0.346, 0.0), 0.02, 0.0285, 0.024) - 0.001, M_CORK));
}
// ---- an open exercise book and a fountain pen (the spread is a height field: pages bow up, the spine dips)
float nbTop(float ax){ return 0.0035 + 0.0075 * pow(sin(PI * sat(ax / 0.152)), 0.6) * (1.0 - 0.3 * sat(ax / 0.152)); }
vec2 sdNotebook(vec3 p){
  vec3 q = p - NB_P; q.xz = rot2(q.xz, 0.24);
  float bound = sdBox(q - vec3(0.0, 0.012, 0.0), vec3(0.17, 0.02, 0.12));
  if (bound > 0.03) return vec2(bound, -1.0);
  float pages = max(max(q.y - nbTop(abs(q.x)), 0.0016 - q.y) * 0.8, sdBox2(q.xz, vec2(0.150, 0.102)));
  vec2 res = vec2(pages, M_PAPER);
  res = opU(res, vec2(sdRBox(q - vec3(0.0, 0.0008, 0.0), vec3(0.157, 0.0008, 0.108), 0.0006), M_NBCOVER));
  return opU(res, vec2(sdCapsule(q, vec3(0.035, 0.0134, -0.07), vec3(0.135, 0.0110, 0.055), 0.0045), M_PEN));
}
// ---- small transistor radio, dial glowing, telescopic antenna pulled out and tilted toward the room
const vec3 ANT_A = RADIO_P + vec3(-0.078, 0.113, -0.015);
const vec3 ANT_D = vec3(-0.746, 0.617, 0.249);
vec2 sdRadio(vec3 p){
  vec3 q = p - RADIO_P - vec3(0.0, 0.057, 0.0);
  float bound = min(sdBox(q, vec3(0.11, 0.065, 0.048)), sdCapsule(p, ANT_A, ANT_A + ANT_D * 0.33, 0.012));
  if (bound > 0.03) return vec2(bound, -1.0);
  vec2 res = vec2(sdRBox(q, vec3(0.098, 0.056, 0.033), 0.01), M_RADIO);
  float knobs = min(sdCylZ(q - vec3(0.066, -0.03, 0.035), 0.0105, 0.005), sdCylZ(q - vec3(0.087, -0.03, 0.035), 0.0075, 0.004)) - 0.001;
  res = opU(res, vec2(knobs, M_BRASS));
  // three nested chrome tubes, a swivel at the base, a ball at the tip
  float ant = min(min(sdCapsule(p, ANT_A, ANT_A + ANT_D * 0.115, 0.0034), sdCapsule(p, ANT_A + ANT_D * 0.11, ANT_A + ANT_D * 0.225, 0.0026)),
                  sdCapsule(p, ANT_A + ANT_D * 0.22, ANT_A + ANT_D * 0.33, 0.0019));
  ant = min(ant, min(length(p - ANT_A) - 0.0062, length(p - ANT_A - ANT_D * 0.334) - 0.0036));
  return opU(res, vec2(ant, M_CHROME));
}
// ---- old surface wiring: a wire clipped to the wall from the ceiling down to a bakelite socket; the lamp is plugged in
vec2 sdWiring(vec3 p){
  float bound = sdBox(p - vec3(-0.71, 1.77, 0.075), vec3(0.215, 1.02, 0.085));
  if (bound > 0.03) return vec2(bound, -1.0);
  vec3 s = SOCKET_P;
  float wire = sdCapsule(p, vec3(s.x, s.y + 0.03, 0.0034), vec3(s.x + 0.006, ROOM_H, 0.0034), 0.0032);
  float cy = mod(p.y - s.y - 0.15, 0.27) - 0.135;
  float clips = sdRBox(vec3(p.x - s.x - 0.006 * (p.y - s.y) / (ROOM_H - s.y), cy, p.z - 0.0042), vec3(0.0068, 0.0042, 0.0046), 0.0016);
  clips = max(clips, s.y + 0.1 - p.y);
  vec2 res = vec2(wire, M_WIRE);
  res = opU(res, vec2(clips, M_WIRE));
  res = opU(res, vec2(sdRBox(p - vec3(s.x, s.y, 0.0085), vec3(0.039, 0.039, 0.0085), 0.0065), M_BAKELITE));
  res = opU(res, vec2(sdRBox(p - vec3(s.x, s.y - 0.006, 0.0255), vec3(0.0155, 0.021, 0.009), 0.0045), M_PLUG));
  // the braided cord: from the plug it hangs down the wall, then runs across the glass to the lamp
  vec3 c0 = vec3(s.x, s.y - 0.028, 0.029), c1 = vec3(s.x + 0.008, DESK_TOP + 0.03, 0.04);
  vec3 c2 = vec3(s.x + 0.05, DESK_TOP + 0.0042, 0.085), c3 = vec3(LAMP_X - 0.09, DESK_TOP + 0.0042, 0.13);
  vec3 c4 = vec3(LAMP_X - 0.045, DESK_TOP + 0.0045, LAMP_Z - 0.035);
  float cord = min(min(sdCapsule(p, c0, c1, 0.0038), sdCapsule(p, c1, c2, 0.0038)), min(sdCapsule(p, c2, c3, 0.0038), sdCapsule(p, c3, c4, 0.0038)));
  return opU(res, vec2(cord, M_CORD));
}

float curtainZ(vec3 p){
  float bunch = smoothstep(1.15, 0.78, p.y);
  float a = 0.021 + 0.011 * bunch;
  float ph = p.x * 57.0 + 1.3 * sin(p.x * 19.0 + p.y * 1.6) + 0.5 * sin(p.y * 2.9);
  return CURT_Z + a * sin(ph);
}
vec2 sdCurtain(vec3 p){
  float bound = sdBox(p - vec3((CURT_X0 + CURT_X1) * 0.5, 1.8, CURT_Z), vec3((CURT_X1 - CURT_X0) * 0.5 + 0.03, 1.05, 0.065));
  if (bound > 0.03) return vec2(bound, -1.0);
  float d = (abs(p.z - curtainZ(p)) - 0.0035) * 0.42;
  float x0 = CURT_X0 + 0.012 * sin(p.y * 2.3 + 0.4) + 0.035 * smoothstep(1.25, 0.78, p.y);
  d = max(d, (x0 - p.x) * 0.9);
  d = max(d, DESK_TOP + 0.003 - p.y);
  return vec2(d, M_CURTAIN);
}

// ---- 时令物件：春天窗台上汽水瓶里插一枝桃花；夏天一盘蚊香在窗台上细细地冒烟，桌上一把蒲扇；
// 秋天窗台上两只柿子；冬天桌上一只红色热水袋。
// peach twig in the sill frame (relative to SEAS_P): a main shoot and two side shoots
const vec3 TW_A[6] = vec3[6](vec3(0.0, 0.02, 0.0), vec3(-0.012, 0.20, -0.012), vec3(-0.035, 0.31, -0.02), vec3(-0.012, 0.20, -0.012), vec3(0.045, 0.28, -0.004), vec3(-0.035, 0.31, -0.02));
const vec3 TW_B[6] = vec3[6](vec3(-0.012, 0.20, -0.012), vec3(-0.035, 0.31, -0.02), vec3(-0.028, 0.405, -0.03), vec3(0.045, 0.28, -0.004), vec3(0.078, 0.335, 0.0), vec3(-0.098, 0.362, -0.014));
const float TW_R[6] = float[6](0.0034, 0.0026, 0.0017, 0.0021, 0.0014, 0.0015);
vec2 sdSpring(vec3 q){
  float bound = sdBox(q - vec3(-0.01, 0.21, -0.012), vec3(0.11, 0.215, 0.05));
  if (bound > 0.02) return vec2(bound, -1.0);
  // an old soda bottle, green glass: body, shoulder, neck, a rolled lip
  float body = sdCylY(q - vec3(0.0, 0.048, 0.0), 0.026, 0.046) - 0.002;
  float sh = sdCappedCone(q - vec3(0.0, 0.112, 0.0), 0.018, 0.027, 0.011) - 0.001;
  float neck = sdCylY(q - vec3(0.0, 0.14, 0.0), 0.0105, 0.012) - 0.0008;
  float lip = length(vec2(length(q.xz) - 0.0105, q.y - 0.152)) - 0.0028;
  vec2 res = vec2(min(min(body, sh), min(neck, lip)), M_BOTTLE);
  float tw = 1e9;
  for (int i = 0; i < 6; i++) tw = min(tw, sdCapsule(q, TW_A[i], TW_B[i], TW_R[i]));
  res = opU(res, vec2(tw, M_TWIG));
  // blossoms and buds along the outer shoots: five cupped petals, opening toward the light
  float bl = 1e9;
  for (int i = 0; i < 22; i++){
    float fi = float(i);
    int sgi = 1 + i % 5;
    vec3 h = vec3(hash11(fi * 3.7 + 1.0), hash11(fi * 5.3 + 2.0), hash11(fi * 9.1 + 3.0));
    vec3 a = TW_A[sgi], b = TW_B[sgi];
    vec3 c = mix(a, b, 0.15 + 0.85 * h.x);
    vec3 side = normalize(vec3(h.y - 0.5, 0.25, h.z - 0.3));
    float bud = step(0.72, h.z) + step(0.95, h.x);
    float R = bud > 0.5 ? 0.0045 : 0.0095 + 0.003 * h.y;
    c += side * (TW_R[sgi] + R * 0.55);
    vec3 d = q - c;
    if (dot(d, d) > 0.0005) continue;
    if (bud > 0.5){ bl = min(bl, length(d * vec3(1.0, 0.8, 1.0)) - R); continue; }
    vec3 nb = normalize(vec3(h.y - 0.5, 0.35 * h.x - 0.1, 1.0));
    vec3 u = normalize(cross(nb, vec3(0.0, 1.0, 0.0))), v = cross(nb, u);
    float al = dot(d, nb); vec2 pl = vec2(dot(d, u), dot(d, v));
    float rr = length(pl), an = atan(pl.y, pl.x) + h.x * 6.0;
    float Rp = R * (0.78 + 0.22 * pow(abs(cos(an * 2.5)), 0.6));
    float cup = 0.35 * rr * rr / R;
    bl = min(bl, (length(vec2(max(rr - Rp, 0.0), al - cup)) - 0.0011) * 0.8);
  }
  return opU(res, vec2(bl, M_BLOSSOM));
}
float coilT(vec2 xz){                       // the spiral's unwrapped angle nearest to xz
  float th = atan(xz.y, xz.x); th += th < 0.0 ? 2.0 * PI : 0.0;
  float k = floor((length(xz) / COIL_B - th) / (2.0 * PI) + 0.5);
  return th + 2.0 * PI * k;
}
vec2 sdSummerSill(vec3 q){
  float bound = sdBox(q - vec3(0.0, 0.012, 0.0), vec3(0.07, 0.016, 0.07));
  if (bound > 0.02) return vec2(bound, -1.0);
  // a tin stand: a shallow dish with a turned-up rim and a pin through the coil's centre
  float dish = max(sdCylY(q - vec3(0.0, 0.0018, 0.0), 0.064, 0.0012), -sdCylY(q - vec3(0.0, 0.004, 0.0), 0.06, 0.0016));
  dish = min(dish, length(vec2(length(q.xz) - 0.0625, q.y - 0.0035)) - 0.0018);
  dish = min(dish, sdCapsule(q, vec3(0.0, 0.002, 0.0), vec3(0.0, 0.02, 0.0), 0.0011));
  vec2 res = vec2(dish, M_TIN);
  vec3 c = q - vec3(0.0, 0.0125, 0.0);
  float T = clamp(coilT(c.xz), 9.0, COIL_T1);
  float th = T - 2.0 * PI * floor(T / (2.0 * PI));
  vec2 sp = COIL_B * T * vec2(cos(th), sin(th));
  float dr = length(c.xz - sp);
  return opU(res, vec2(sdBox2(vec2(dr, c.y), vec2(0.0019, 0.0023)) - 0.0004, M_COIL));
}
vec2 sdAutumn(vec3 q){
  float bound = sdBox(q - vec3(0.01, 0.03, 0.005), vec3(0.08, 0.04, 0.05));
  if (bound > 0.02) return vec2(bound, -1.0);
  vec2 res = vec2(1e9, -1.0); float cx = 1e9;
  for (int k = 0; k < 2; k++){
    float R = k == 0 ? 0.034 : 0.030;
    vec3 c = q - (k == 0 ? vec3(-0.022, 0.0, -0.004) : vec3(0.046, 0.0, 0.018));
    c.xz = rot2(c.xz, float(k) * 0.9 + 0.3);
    c.y -= R * 0.74;
    float a = atan(c.z, c.x);
    float lobes = 1.0 - 0.035 * cos(4.0 * a) * smoothstep(-0.5, 0.6, c.y / R);   // four soft lobes, flat-topped
    res = opU(res, vec2((length(c * vec3(1.0, 1.0 / 0.74, 1.0)) - R * lobes) * 0.72, M_KAKI));
    // the calyx: four stiff sepals pressed flat on top, a stub of stalk
    vec3 t = c - vec3(0.0, R * 0.72, 0.0);
    float sep = 0.016 * (0.45 + 0.55 * pow(abs(cos(2.0 * a + 0.4)), 1.5));
    cx = min(cx, sdBox2(vec2(length(t.xz) - sep * 0.5, t.y + 0.012 * length(t.xz) - 0.001), vec2(sep * 0.5, 0.0012)) - 0.0006);
    cx = min(cx, sdCylY(t - vec3(0.0, 0.004, 0.0), 0.0022, 0.004));
  }
  return opU(res, vec2(cx, M_CALYX));
}
vec2 sdDeskSeason(vec3 p){
  vec3 q = p - DESK_SP;
  float bound = sdBox(q - vec3(0.0, 0.025, 0.0), vec3(0.17, 0.03, 0.17));
  if (bound > 0.02) return vec2(bound, -1.0);
  if (uSeason < 1.5){
    // 蒲扇: a palm-leaf fan lying on the glass, bound round its rim, handle toward the front edge
    q.xz = rot2(q.xz, 0.55);
    vec2 u = q.xz - vec2(0.0, -0.02);
    float disc = length(u * vec2(1.0, 0.94)) - 0.122;
    float dome = 0.0024 + 0.004 * sat(1.0 - length(u) / 0.12);
    vec2 res = vec2(max(disc, abs(q.y - dome) - 0.0011) * 0.9, M_FAN);
    float rim = length(vec2(abs(disc) - 0.0, q.y - 0.0032)) - 0.003;
    rim = max(rim, -disc - 0.003);
    res = opU(res, vec2(rim, M_FANRIM));
    return opU(res, vec2(sdCapsule(q, vec3(0.0, 0.006, 0.09), vec3(0.0, 0.0065, 0.21), 0.0062), M_FANRIM));
  }
  // 热水袋: a red rubber hot-water bag, plump and rounded, its neck and white screw stopper turned to the back
  q.xz = rot2(q.xz, -0.35);
  float bag = sdRBox(q - vec3(0.0, 0.021, 0.0), vec3(0.098, 0.021, 0.066), 0.019);
  float neck = sdCylY((q - vec3(0.112, 0.016, 0.0)).yxz, 0.0175, 0.018) - 0.002;
  vec2 res = vec2(min(bag, neck), M_HWB);
  return opU(res, vec2(sdCylY((q - vec3(0.137, 0.016, 0.0)).yxz, 0.021, 0.008) - 0.0015, M_STOPPER));
}
vec2 sdSeasonal(vec3 p){
  vec3 q = p - SEAS_P;
  vec2 res = vec2(1e9, -1.0);
  if (uSeason < 0.5) res = sdSpring(q);
  else if (uSeason < 1.5) res = sdSummerSill(q);
  else if (uSeason < 2.5) res = sdAutumn(q);
  if (abs(uSeason - 1.0) < 0.5 || uSeason > 2.5) res = opU(res, sdDeskSeason(p));
  return res;
}

vec2 mapObj(vec3 p, bool solidShade){
  vec2 res = vec2(1e9, 0.0);
  float bw = sdBox(p - vec3(WIN_CX, WIN_CY - 0.02, -0.07), vec3(WIN_HW + 0.07, WIN_HH + 0.05, 0.12));
  if (bw < res.x){
    res = opU(res, vec2(sdFrame(p), M_FRAME));
    res = opU(res, vec2(sdSill(p), M_SILL));
  }
  float bd = sdBox(p - vec3((DESK_X0 + DESK_X1) * 0.5, DESK_TOP - 0.08, (DESK_Z0 + DESK_Z1) * 0.5), vec3((DESK_X1 - DESK_X0) * 0.5, 0.0855, (DESK_Z1 - DESK_Z0) * 0.5 + 0.01));
  if (bd < res.x) res = opU(res, sdDesk(p));
  res = opU(res, sdLamp(p, solidShade));
  res = opU(res, sdMug(p));
  res = opU(res, sdBooks(p));
  res = opU(res, sdCurtain(p));
  res = opU(res, sdPlant(p));
  res = opU(res, sdClock(p));
  res = opU(res, sdCalendar(p));
  res = opU(res, sdThermos(p));
  res = opU(res, sdNotebook(p));
  res = opU(res, sdRadio(p));
  res = opU(res, sdWiring(p));
  res = opU(res, sdSeasonal(p));
  return res;
}
// 房间内部是凸的（盒子），墙面不可能遮挡室内光源 → 阴影射线只测试物体，既消除掠射自遮挡条纹又省一半开销
vec2 map(vec3 p, bool solidShade){ return opU(vec2(sdRoom(p), M_WALL), mapObj(p, solidShade)); }

vec3 calcNormal(vec3 p){
  const vec2 k = vec2(1.0, -1.0); const float e = 0.0005;
  return normalize(k.xyy * map(p + k.xyy * e, true).x + k.yyx * map(p + k.yyx * e, true).x +
                   k.yxy * map(p + k.yxy * e, true).x + k.xxx * map(p + k.xxx * e, true).x);
}
// soft shadow (Quilez' improved penumbra estimate); k ~ distance / light radius
float softShadow(vec3 ro, vec3 rd, float tmax, float k){
  float res = 1.0, t = 0.004, ph = 1e10;
  for (int i = 0; i < 30; i++){
    vec2 hm = mapObj(ro + rd * t, false); float h = hm.x;
    // 包围体返回的是距离下界，只能用来加速步进，不能当作真实遮挡物去估计半影
    if (hm.y >= 0.0){
      // Quilez 的改进半影：用前后两次距离三角化最近点。步长被下限截断时 h 可能大于 2·ph，
      // 此时 y > h 公式失效（会造成假阴影条纹），退化为经典 k·h/t。
      float y = h * h / (2.0 * ph);
      float d = y < h ? sqrt(h * h - y * y) : h;
      res = min(res, k * d / max(1e-4, t - min(y, h)));
      ph = h;
    } else ph = 1e10;
    t += clamp(h, 0.004, 0.09);
    if (res < 0.003 || t > tmax) break;
  }
  res = sat(res);
  return res * res * (3.0 - 2.0 * res);
}
float softShadowWide(vec3 ro, vec3 rd, float tmax, float k){
  float res = 1.0, t = 0.01;
  for (int i = 0; i < 16; i++){
    vec2 hm = mapObj(ro + rd * t, false); float h = hm.x;
    if (hm.y >= 0.0) res = min(res, k * h / t);
    t += clamp(h, 0.02, 0.15);
    if (res < 0.01 || t > tmax) break;
  }
  return sat(res);
}
float calcAO(vec3 p, vec3 n){
  float occ = 0.0, sca = 1.0;
  for (int i = 0; i < 5; i++){
    float h = 0.01 + 0.12 * float(i) / 4.0;
    occ += (h - map(p + n * h, true).x) * sca; sca *= 0.8;
  }
  return sat(1.0 - 2.4 * occ);
}

// ---- materials ------------------------------------------------------------
struct Mat { vec3 alb; float rough; float metal; vec3 emis; vec3 trans; };

vec3 wallpaper(vec2 uv, inout vec3 n, vec3 nAxis){
  vec3 base = vec3(0.47, 0.47, 0.37);                      // faded mint-cream paper
  float col = uv.x / 0.0883;
  float line = smoothstep(0.43, 0.48, abs(fract(col) - 0.5));
  vec2 cell = vec2(fract(col) - 0.5, fract(uv.y / 0.104 + 0.5 * mod(floor(col), 2.0)) - 0.5) * vec2(0.0883, 0.104);
  float r = length(cell), a = atan(cell.y, cell.x);
  float petal = smoothstep(0.0009, 0.0, r - 0.0105 * (0.5 + 0.5 * abs(cos(2.0 * a + 0.785))));
  float leaf = smoothstep(0.0008, 0.0, abs(r - 0.019) - 0.0012) * smoothstep(0.3, 0.9, abs(sin(a * 2.0)));
  float dotc = smoothstep(0.0024, 0.0016, r);
  vec3 c = base;
  c = mix(c, base * vec3(0.9, 0.93, 0.87), line);
  // the print has faded unevenly over the years (sun, damp)
  float fade = 0.35 + 0.65 * smoothstep(0.25, 0.75, fbm(uv * 2.2 + 11.0));
  c = mix(c, vec3(0.27, 0.35, 0.27), petal * 0.55 * fade);
  c = mix(c, vec3(0.30, 0.36, 0.28), leaf * 0.35 * fade);
  c = mix(c, vec3(0.55, 0.36, 0.22), dotc * 0.45 * fade);
  // roll seams every 53 cm, slightly lifted
  float sx = abs(fract(uv.x / 0.53 + 0.37) - 0.5) * 0.53;
  float seam = smoothstep(0.0025, 0.0, sx);
  c *= 1.0 - 0.12 * seam;
  // age: water stains, yellowing, fibre mottling
  float stain = smoothstep(0.52, 0.78, fbm(uv * 1.4 + 7.3));
  c *= mix(vec3(1.0), vec3(0.84, 0.76, 0.6), stain * 0.55);
  float tide = smoothstep(0.012, 0.0, abs(fbm(uv * 1.4 + 7.3) - 0.62)) * 0.12;
  c *= 1.0 - tide;
  c *= 0.9 + 0.2 * vnoise(uv * 160.0);
  c *= mix(0.86, 1.0, smoothstep(2.75, 2.1, uv.y));
  // paper texture bump (visible under grazing lamp light)
  float e = 0.002;
  float b0 = vnoise(uv * 220.0), bx = vnoise((uv + vec2(e, 0.0)) * 220.0), by = vnoise((uv + vec2(0.0, e)) * 220.0);
  vec3 t = normalize(cross(nAxis, vec3(0.0, 1.0, 0.0)));
  n = normalize(n + (t * (b0 - bx) + vec3(0.0, 1.0, 0.0) * (b0 - by)) * 0.18 + t * seam * 0.08);
  return c;
}

vec3 deskWood(vec3 p, out float rough){
  float g = fbm(vec2(p.x * 1.3, p.z * 24.0));
  float grain = 0.5 + 0.5 * sin(p.z * 160.0 + 9.0 * fbm(vec2(p.x * 0.9, p.z * 5.0)) + p.x * 2.0);
  grain = pow(grain, 2.5);
  vec3 dark = vec3(0.034, 0.018, 0.009), light = vec3(0.092, 0.054, 0.03);
  vec3 c = mix(light, dark, sat(grain * 0.55 + 0.45 * g));
  c *= 0.9 + 0.2 * vnoise(vec2(p.x * 8.0, p.z * 260.0));                         // fine pores along the grain
  float wear = smoothstep(0.48, 0.66, p.z) * (0.5 + 0.5 * fbm(p.xz * 18.0));
  c = mix(c, c * 1.45 + vec3(0.015, 0.009, 0.004), wear * 0.55);
  // old tea ring next to the mug, an ink blot, scratches
  float ring = abs(length(p.xz - vec2(MUG_X + 0.085, MUG_Z + 0.06)) - 0.0405);
  c *= 1.0 - 0.35 * smoothstep(0.0025, 0.0, ring) * smoothstep(0.3, 0.6, vnoise(p.xz * 90.0));
  float ink = smoothstep(0.012, 0.004, length(p.xz - vec2(0.21, 0.43)) + 0.006 * (vnoise(p.xz * 400.0) - 0.5));
  c = mix(c, vec3(0.008, 0.01, 0.025), ink * 0.85);
  float scr = smoothstep(0.985, 1.0, vnoise(vec2(p.x * 3.0 + p.z * 40.0, p.z * 2.0) * vec2(9.0, 1.0)));
  c += vec3(0.02, 0.012, 0.007) * scr;
  if (p.y < DESK_TOP - 0.035) c *= 0.85;
  rough = mix(0.26, 0.5, wear) + 0.08 * vnoise(p.xz * 70.0);
  return c;
}
// ---- what is pressed under the glass: two photographs, a one-inch ID photo, a bus ticket, a pressed ginkgo leaf
float rectM(vec2 q, vec2 hs, float aa){ vec2 d = abs(q) - hs; return smoothstep(aa, -aa, max(d.x, d.y)); }
vec3 photoPortrait(vec2 u, vec3 dark, vec3 light, float bgLevel){
  float bg = bgLevel + 0.25 * u.y - 0.3 * length(u - vec2(0.5, 0.62));            // studio backdrop with a soft spot
  float head = smoothstep(0.03, -0.03, length((u - vec2(0.5, 0.60)) / vec2(0.17, 0.22)) - 1.0);
  float hair = head * smoothstep(0.6, 0.72, u.y + 0.08 * cos((u.x - 0.5) * 6.0));
  float body = smoothstep(0.03, -0.03, length((u - vec2(0.5, 0.02)) / vec2(0.46, 0.36)) - 1.0);
  float v = mix(mix(mix(bg, 0.62, head), 0.1, hair), 0.16, body);
  return mix(dark, light, v * (1.0 - 0.4 * length(u - 0.5)));
}
vec3 photoLake(vec2 u){
  vec3 c = mix(vec3(0.40, 0.52, 0.54), vec3(0.62, 0.66, 0.64), smoothstep(0.52, 0.56, u.y));
  float hl = 0.53 + 0.12 * fbm(vec2(u.x * 3.0, 4.0));
  c = mix(c, vec3(0.35, 0.42, 0.36), smoothstep(0.01, -0.01, u.y - hl) * step(0.52, u.y));
  c = mix(c, vec3(0.45, 0.42, 0.33), smoothstep(0.25, 0.22, u.y));
  for (int k = 0; k < 2; k++){
    vec2 f = u - vec2(0.42 + 0.12 * float(k), 0.22);
    float fig = max(smoothstep(0.012, -0.012, max(abs(f.x) - 0.035, abs(f.y - 0.12) - 0.12)), smoothstep(0.012, -0.012, length(f - vec2(0.0, 0.27)) - 0.032));
    c = mix(c, k == 0 ? vec3(0.42, 0.18, 0.16) : vec3(0.20, 0.22, 0.28), fig);
  }
  return c * vec3(1.06, 0.93, 1.0) + vec3(0.03, 0.0, 0.02);                      // the magenta cast of a faded print
}
vec4 underItems(vec2 xz){
  const float aa = 0.0007;
  vec4 acc = vec4(0.0);
  vec3 border = vec3(0.44, 0.40, 0.31);
  // 1. a sepia studio portrait with a white deckle border
  vec2 q = rot2(xz - vec2(-0.385, 0.305), 0.16);
  float m = rectM(q, vec2(0.032, 0.044), aa);
  if (m > 0.0){
    vec2 u = vec2(q.x / 0.028, -q.y / 0.040) * 0.5 + 0.5;
    vec3 c = rectM(q, vec2(0.028, 0.040), aa) > 0.5 ? photoPortrait(u, vec3(0.07, 0.05, 0.03), vec3(0.50, 0.41, 0.28), 0.55) : border;
    c *= 1.0 - 0.25 * smoothstep(0.0012, 0.0, abs(q.x * 0.6 + q.y - 0.01));        // an old crease
    acc = vec4(c, m);
  }
  // 2. a faded colour snapshot: two people by a lake
  q = rot2(xz - vec2(-0.335, 0.115), -0.08);
  m = rectM(q, vec2(0.047, 0.033), aa);
  if (m > 0.0){
    vec2 u = vec2(q.x / 0.044, -q.y / 0.030) * 0.5 + 0.5;
    vec3 c = rectM(q, vec2(0.044, 0.030), aa) > 0.5 ? photoLake(u) : border;
    acc = mix(acc, vec4(c, 1.0), m);
  }
  // 3. a one-inch ID photo on a faded blue ground
  q = rot2(xz - vec2(-0.705, 0.305), 0.05);
  m = rectM(q, vec2(0.0135, 0.0185), aa);
  if (m > 0.0){
    vec2 u = vec2(q.x / 0.012, -q.y / 0.017) * 0.5 + 0.5;
    vec3 c = rectM(q, vec2(0.012, 0.017), aa) > 0.5 ? photoPortrait(u, vec3(0.04, 0.05, 0.08), vec3(0.42, 0.52, 0.62), 0.7) : border;
    acc = mix(acc, vec4(c, 1.0), m);
  }
  // 4. a bus ticket: printed bands, a serial number, a red stamp, one end torn off
  q = rot2(xz - vec2(-0.245, 0.36), 0.45);
  float torn = smoothstep(aa, -aa, q.x - 0.03 - 0.002 * (vnoise(vec2(q.y * 900.0, 1.0)) - 0.5));
  m = rectM(q, vec2(0.034, 0.0145), aa) * torn;
  if (m > 0.0){
    vec2 u = vec2(q.x / 0.034, -q.y / 0.0145) * 0.5 + 0.5;
    vec3 c = vec3(0.50, 0.58, 0.46);
    c = mix(c, vec3(0.26, 0.40, 0.30), step(abs(u.y - 0.8), 0.09));
    float lines = step(0.55, vnoise(vec2(u.x * 70.0, floor(u.y * 9.0) * 3.0))) * step(0.5, fract(u.y * 9.0)) * step(u.y, 0.6) * step(0.15, u.y) * step(0.08, u.x) * step(u.x, 0.62);
    c = mix(c, vec3(0.15, 0.2, 0.15), lines * 0.7);
    c = mix(c, vec3(0.6, 0.08, 0.06), smoothstep(0.03, 0.0, abs(length((u - vec2(0.78, 0.4)) * vec2(1.0, 0.45)) - 0.11)) * 0.8);
    acc = mix(acc, vec4(c, 1.0), m);
  }
  // 5. a ginkgo leaf pressed flat years ago
  q = rot2(xz - vec2(-0.775, 0.175), -0.4);
  q.y = -q.y;
  float r = length(q), a = atan(q.x, q.y);
  float fan = smoothstep(0.001, -0.001, r - 0.034 * (0.92 + 0.08 * cos(a * 9.0))) * smoothstep(0.98, 0.9, abs(a)) * step(0.007, r);
  float notch = smoothstep(0.004, 0.0, abs(a) * r - 0.0008) * step(0.022, r);
  float stem = smoothstep(0.0008, 0.0, abs(q.x)) * step(-0.022, q.y) * step(q.y, 0.008);
  float leaf = max(fan * (1.0 - notch), stem);
  if (leaf > 0.0){
    vec3 c = vec3(0.42, 0.27, 0.06) * (0.85 + 0.15 * sin(a * 70.0)) * (0.8 + 0.3 * smoothstep(0.034, 0.012, r));
    acc = mix(acc, vec4(c, 1.0), leaf);
  }
  acc.rgb *= (0.84 + 0.16 * vnoise(xz * 300.0)) * 0.85;                          // grain, foxing, the grey of the glass above
  return acc;
}

// faded offset print on the calendar: a lake under hills, a sunset coast, or peonies (per visit)
// the month's picture follows the season: spring peonies, a summer lotus pond (or a sunset sea), an autumn lake, a snowy village
vec3 calPicture(vec2 u, float season, float var){
  vec3 c;
  if (season > 2.5){
    // 雪景: a white hillside under a grey sky, dark pines dusted with snow, a farmhouse with a lit window
    c = mix(vec3(0.60, 0.61, 0.62), vec3(0.50, 0.53, 0.58), u.y);
    float far = 0.62 + 0.08 * fbm(vec2(u.x * 3.0, 4.0)) - 0.05 * u.x;
    c = mix(c, vec3(0.50, 0.52, 0.55), smoothstep(0.004, -0.004, u.y - far));
    float hill = 0.40 + 0.10 * sin(u.x * 3.0 + 0.5) + 0.03 * fbm(vec2(u.x * 6.0, 1.0));
    float snow = smoothstep(0.004, -0.004, u.y - hill);
    c = mix(c, vec3(0.70, 0.70, 0.69) * (0.94 + 0.06 * fbm(u * 12.0)), snow);
    for (int k = 0; k < 6; k++){
      float fk = float(k);
      vec2 b = vec2(0.08 + 0.15 * fk + 0.04 * sin(fk * 7.0), 0.0);
      b.y = 0.40 + 0.10 * sin(b.x * 3.0 + 0.5) - 0.02;
      vec2 d = u - b;
      float H = 0.16 + 0.05 * fract(fk * 0.618);
      float tri = step(0.0, d.y) * step(d.y, H) * step(abs(d.x), (H - d.y) * 0.32 * (0.85 + 0.15 * sin(d.y * 90.0)));
      vec3 pine = mix(vec3(0.10, 0.14, 0.12), vec3(0.62, 0.63, 0.63), step(0.55, fract(d.y * 22.0)) * 0.7);
      c = mix(c, pine, tri);
    }
    vec2 hp = u - vec2(0.66, 0.36);
    float house = step(abs(hp.x), 0.075) * step(abs(hp.y), 0.04);
    float roof = step(0.04, hp.y) * step(hp.y, 0.04 + (0.095 - abs(hp.x)) * 0.5) * step(abs(hp.x), 0.095);
    c = mix(c, vec3(0.36, 0.25, 0.18), house);
    c = mix(c, vec3(0.72, 0.72, 0.71), roof);
    c = mix(c, vec3(0.80, 0.55, 0.20), step(abs(hp.x - 0.03), 0.014) * step(abs(hp.y + 0.005), 0.013));
    return c;
  }
  if (season > 1.5) var = 0.0;          // autumn: the lake
  else if (season > 0.5) var = var < 0.5 ? 2.0 : 0.6;
  else var = 0.9;                       // spring: peonies
  if (var > 1.5){
    // 荷塘: lotus leaves floating on a pale green pond, two pink flowers on tall stems
    c = mix(vec3(0.44, 0.52, 0.46), vec3(0.54, 0.58, 0.50), u.y);
    for (int k = 0; k < 7; k++){
      float fk = float(k);
      vec2 ce = vec2(fract(fk * 0.618 + 0.1), 0.12 + 0.55 * fract(fk * 0.382 + 0.2));
      vec2 d = (u - ce) * vec2(1.0, 1.6); float r = length(d), a = atan(d.y, d.x);
      float R = 0.09 + 0.05 * fract(fk * 0.77);
      float leaf = smoothstep(0.006, 0.0, r - R) * step(0.1, abs(a - 1.2 - fk));                  // a notch to the stem
      vec3 lc = mix(vec3(0.12, 0.27, 0.15), vec3(0.24, 0.40, 0.22), 0.5 + 0.5 * cos(a * 14.0)) * (0.8 + 0.3 * r / R);
      c = mix(c, lc, leaf);
    }
    for (int k = 0; k < 2; k++){
      vec2 ce = vec2(0.34 + 0.34 * float(k), 0.62 + 0.12 * float(k));
      c = mix(c, vec3(0.20, 0.32, 0.18), step(abs(u.x - ce.x - 0.01 * sin(u.y * 9.0)), 0.004) * step(u.y, ce.y));
      vec2 d = u - ce; float a = atan(d.x, d.y), r = length(d * vec2(1.0, 0.8));
      float petals = 0.07 * (0.65 + 0.35 * pow(abs(cos(a * 2.5)), 0.5)) * step(-0.25, d.y / max(r, 1e-3));
      vec3 pc = mix(vec3(0.80, 0.50, 0.58), vec3(0.70, 0.22, 0.38), smoothstep(0.0, 0.07, d.y + 0.03));
      c = mix(c, pc, smoothstep(0.004, 0.0, r - petals));
    }
    return c;
  }
  if (var < 0.5){
    c = mix(vec3(0.62, 0.60, 0.50), vec3(0.40, 0.50, 0.55), u.y);
    float far = 0.64 + 0.09 * fbm(vec2(u.x * 4.0, 1.0)) - 0.07 * u.x;
    float near = 0.50 + 0.12 * fbm(vec2(u.x * 3.0 + 9.0, 2.0)) + 0.04 * sin(u.x * 5.0);
    c = mix(c, vec3(0.36, 0.45, 0.43), smoothstep(0.004, -0.004, u.y - far));
    // autumn on the near hills: rust and ochre among the green
    vec3 hillC = mix(vec3(0.18, 0.29, 0.24), mix(vec3(0.42, 0.24, 0.12), vec3(0.45, 0.36, 0.14), fbm(u * 20.0)), 0.55 * smoothstep(0.4, 0.6, fbm(u * 9.0 + 2.0)));
    c = mix(c, hillC, smoothstep(0.004, -0.004, u.y - near));
    float lake = smoothstep(0.37, 0.365, u.y);
    vec3 water = mix(vec3(0.44, 0.52, 0.52), vec3(0.24, 0.33, 0.31), smoothstep(0.37, 0.2, u.y) * 0.6) * (0.92 + 0.08 * sin(u.y * 160.0 + 5.0 * fbm(u * 9.0)));
    c = mix(c, water, lake);
    float pagoda = step(abs(u.x - 0.72), 0.010 + 0.012 * step(fract(u.y * 45.0), 0.35) * step(u.y, 0.5)) * step(0.37, u.y) * step(u.y, 0.55);
    c = mix(c, vec3(0.12, 0.13, 0.11), pagoda);
  } else if (var < 0.8){
    c = mix(vec3(0.66, 0.42, 0.28), vec3(0.45, 0.36, 0.42), smoothstep(0.4, 1.0, u.y));
    c = mix(c, vec3(0.80, 0.58, 0.30), smoothstep(0.09, 0.07, length((u - vec2(0.38, 0.52)) * vec2(1.0, 1.3))));
    float sea = smoothstep(0.45, 0.445, u.y);
    c = mix(c, mix(vec3(0.16, 0.18, 0.24), vec3(0.42, 0.30, 0.22), smoothstep(0.08, 0.0, abs(u.x - 0.38)) * (0.5 + 0.5 * sin(u.y * 140.0))), sea);
  } else {
    // a still life of peonies on a pale ground: layered, slightly ruffled petals, leaves behind
    c = mix(vec3(0.56, 0.54, 0.46), vec3(0.48, 0.50, 0.44), u.y);
    for (int k = 0; k < 3; k++){
      vec2 ce = vec2(0.30 + 0.24 * float(k), 0.38 + 0.22 * fract(float(k) * 0.618));
      vec2 lf = (u - ce - vec2(0.09, -0.08)) * vec2(1.0, 2.2);
      c = mix(c, vec3(0.20, 0.30, 0.18), smoothstep(0.012, 0.0, length(lf) - 0.07) * 0.9);
    }
    for (int k = 0; k < 3; k++){
      vec2 ce = vec2(0.30 + 0.24 * float(k), 0.38 + 0.22 * fract(float(k) * 0.618));
      vec2 d = (u - ce) * vec2(1.0, 1.15); float r = length(d), a = atan(d.y, d.x);
      float R0 = 0.11 - 0.015 * float(k);
      float ruffle = 0.86 + 0.08 * sin(9.0 * a + float(k) * 2.0) + 0.06 * sin(17.0 * a);
      float fl = smoothstep(0.01, 0.0, r - R0 * ruffle);
      float inner = smoothstep(0.01, 0.0, r - R0 * 0.62 * (0.9 + 0.1 * sin(7.0 * a + 1.0)));
      vec3 petal = mix(vec3(0.66, 0.30, 0.34), vec3(0.74, 0.50, 0.50), 0.5 + 0.5 * sin(a * 5.0 + r * 40.0));
      c = mix(c, petal * (0.85 + 0.25 * smoothstep(0.0, R0, r)), fl);
      c = mix(c, vec3(0.55, 0.20, 0.25), inner * 0.7);
      c = mix(c, vec3(0.70, 0.58, 0.30), smoothstep(0.02, 0.0, r) * 0.8);
    }
  }
  return c;
}

Mat getMat(float id, vec3 p, inout vec3 n){
  Mat m; m.alb = vec3(0.5); m.rough = 0.85; m.metal = 0.0; m.emis = vec3(0.0); m.trans = vec3(0.0);
  if (id == M_WALL){
    if (p.z < -0.003){                                     // plaster reveal inside the window opening
      m.alb = vec3(0.50, 0.49, 0.44) * (0.9 + 0.1 * fbm(p.xy * 30.0)); m.rough = 0.9;
      m.alb *= 1.0 - 0.3 * smoothstep(0.55, 0.8, fbm(p.yz * 9.0 + 3.0));
    } else if (p.y > ROOM_H - 0.004){
      m.alb = vec3(0.56, 0.55, 0.5) * (0.92 + 0.08 * fbm(p.xz * 3.0));
    } else if (p.y < 0.004){
      m.alb = vec3(0.12, 0.08, 0.05); m.rough = 0.6;
    } else {
      bool left = abs(p.x - ROOM_X0) < 0.004;
      vec2 uv = left ? vec2(4.0 - p.z, p.y) : vec2(p.x, p.y);
      vec3 nAx = left ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 0.0, 1.0);
      m.alb = wallpaper(uv, n, nAx);
      m.rough = 0.92;
      if (left){
        // a bigger calendar hung here for years: its unfaded ghost shows round the present one, with a dust line on top
        vec2 g = vec2(p.z - 0.37, p.y - 1.49);
        float ghost = smoothstep(0.006, -0.006, max(abs(g.x) - 0.19, abs(g.y) - 0.29));
        m.alb *= mix(1.0, 1.1, ghost) * mix(vec3(1.0), vec3(0.97, 1.0, 1.05), ghost);
        m.alb *= 1.0 - 0.25 * smoothstep(0.004, 0.0, abs(g.y - 0.29)) * step(abs(g.x), 0.19);
      } else {
        // a hairline crack running from the lower-left corner of the window opening (stresses gather at corners)
        float cx = p.x - WIN_X0, cy = p.y - WIN_Y0;
        float path = cy - 0.85 * cx - 0.006 * sin(cx * 140.0) - 0.008 * (vnoise(vec2(cx * 40.0, 2.0)) - 0.5);
        float crack = smoothstep(0.0011, 0.0002, abs(path)) * step(-0.16, cx) * step(cx, 0.0) * smoothstep(-0.16, -0.08, cx);
        float br = cy + 0.5 * (cx + 0.07) - 0.003 * sin(cx * 200.0);                // a short branch
        crack = max(crack, smoothstep(0.0009, 0.0002, abs(br)) * step(-0.12, cx) * step(cx, -0.07) * step(cy, 0.0));
        m.alb *= 1.0 - 0.6 * crack;
        n = normalize(n + vec3(0.0, sign(path) * 0.5 * crack, 0.0));
        // scuffs and hand grime on the strip of wall between the desk and the sill
        float scuff = smoothstep(DESK_TOP + 0.14, DESK_TOP, p.y) * smoothstep(0.45, 0.75, fbm(vec2(p.x * 9.0, p.y * 30.0)));
        m.alb *= 1.0 - 0.22 * scuff;
      }
      // old nail holes, each with a faint rust tear below it
      vec2 hc = floor(uv / 0.23), hf = uv - (hc + 0.5) * 0.23;
      vec3 hh = hash32(hc + (left ? 7.0 : 0.0));
      if (hh.z > 0.86){
        vec2 o = hf - (hh.xy - 0.5) * 0.15;
        m.alb *= 1.0 - 0.75 * smoothstep(0.0022, 0.0012, length(o));
        m.alb *= 1.0 - 0.15 * smoothstep(0.003, 0.0, abs(o.x)) * smoothstep(-0.03, 0.0, o.y) * step(o.y, 0.0);
      }
    }
  } else if (id == M_FRAME){
    if (abs(p.x) < 0.012 && abs(p.y - 1.42) < 0.034 && p.z > FRAME_Z1 - 0.001){ m.alb = vec3(0.5, 0.36, 0.17); m.metal = 1.0; m.rough = 0.45; return m; }
    vec3 paint = vec3(0.16, 0.29, 0.255) * (0.88 + 0.24 * fbm(p.xy * 11.0 + p.z * 7.0));
    // brush marks run along each member: vertical on stiles and the mullion, horizontal on rails and the transom
    bool rail = abs(p.y - TRANSOM_Y) < TW + 0.006 || p.y < WIN_Y0 + FW + 0.006 || p.y > WIN_Y1 - FW - 0.006;
    bool stile = abs(p.x) < MW + 0.006 || p.x < WIN_X0 + FW + 0.006 || p.x > WIN_X1 - FW - 0.006;
    vec2 bs = (stile && !rail) ? vec2(p.y * 4.0, (p.x + p.z) * 700.0) : vec2(p.x * 4.0, (p.y + p.z) * 700.0);
    float brush = vnoise(bs) * 0.6 + vnoise(bs * vec2(3.0, 2.1)) * 0.4;
    paint *= 0.93 + 0.14 * brush;
    // a dried run where the last coat sagged under the transom
    float sag = smoothstep(0.003, 0.0, abs(p.x + 0.21 + 0.002 * sin(p.y * 300.0)) - 0.0015) * smoothstep(TRANSOM_Y - TW - 0.05, TRANSOM_Y - TW - 0.002, p.y) * step(p.y, TRANSOM_Y - TW);
    paint *= 1.0 - 0.18 * sag;
    float chip = fbm(vec2(p.x + p.z, p.y) * 46.0);
    float chipped = smoothstep(0.725, 0.735, chip);
    float bare = smoothstep(0.77, 0.79, chip);
    vec3 primer = vec3(0.50, 0.50, 0.45), wood = vec3(0.20, 0.14, 0.09);
    m.alb = mix(paint, mix(primer, wood, bare), chipped);
    m.alb *= 1.0 - 0.25 * smoothstep(0.012, 0.0, abs(p.z - GLASS_Z - 0.004)); // grime along the putty line
    m.rough = mix(0.42, 0.78, chipped);
  } else if (id == M_SILL){
    m.alb = vec3(0.47, 0.45, 0.38) * (0.86 + 0.14 * fbm(p.xz * 20.0));
    m.alb *= 1.0 - 0.3 * smoothstep(0.6, 0.85, fbm(p.xz * 6.0 + 2.0));              // water stains
    float ring = abs(length(p.xz - vec2(0.18, -0.04)) - 0.036);                     // a ring left by a flower pot
    m.alb *= 1.0 - 0.25 * smoothstep(0.004, 0.0, ring);
    m.alb = mix(m.alb, vec3(0.2, 0.15, 0.1), 0.35 * smoothstep(0.72, 0.8, fbm(p.xz * 30.0 + p.y * 9.0)));  // chipped paint
    m.rough = 0.55;
  } else if (id == M_DESK){
    m.alb = deskWood(p, m.rough);
  } else if (id == M_GTOP){
    if (n.y > 0.7){
      // two-layer: the diffuse below the glass (wood, photos) + the glass's own sharp reflection on top
      float rr;
      m.alb = deskWood(p, rr) * 0.92;
      vec4 it = underItems(p.xz);
      m.alb = mix(m.alb, it.rgb, it.a);
      m.rough = 0.03 + 0.04 * smoothstep(0.55, 0.8, fbm(p.xz * 9.0));             // a few greasy smears on the glass
    } else {
      // the cut edge: light trapped inside the plate escapes there, tinted green by the iron in soda-lime glass
      vec3 Lb = BULB - p;
      m.alb = vec3(0.03, 0.08, 0.055); m.rough = 0.1;
      m.emis = uLampI * vec3(0.04, 0.15, 0.085) * 0.22 / max(dot(Lb, Lb), 0.05);
    }
  } else if (id == M_WIRE){
    m.alb = vec3(0.50, 0.47, 0.38) * (0.9 + 0.1 * vnoise(p.yz * 400.0)); m.rough = 0.45;
    m.alb *= 1.0 - 0.3 * smoothstep(0.6, 0.85, fbm(p.yy * 30.0));               // fly-specks, grime
  } else if (id == M_BAKELITE){
    vec3 q = p - SOCKET_P;
    vec3 c = vec3(0.50, 0.44, 0.31) * (0.88 + 0.12 * fbm(q.xy * 120.0));          // ivory bakelite gone yellow
    c *= 1.0 - 0.35 * smoothstep(0.004, 0.0, length(q.xy - vec2(0.0, 0.022)) - 0.002);   // the screw
    c *= 1.0 - 0.25 * smoothstep(0.02, 0.04, length(q.xy + vec2(0.0, 0.01)));     // finger grime round the plug
    m.alb = c; m.rough = 0.35;
  } else if (id == M_PLUG){
    m.alb = vec3(0.045, 0.025, 0.015); m.rough = 0.3;
  } else if (id == M_CHROME){
    vec3 a = p - ANT_A; float sAlong = dot(a, ANT_D);
    m.alb = vec3(0.62, 0.62, 0.6); m.metal = 1.0;
    m.rough = 0.12 + 0.2 * smoothstep(0.6, 0.85, vnoise(vec2(sAlong * 200.0, 3.0)));   // spots of tarnish
  } else if (id == M_RUNNER){
    m.alb = vec3(0.16, 0.20, 0.07); m.rough = 0.5; m.trans = vec3(0.06, 0.1, 0.02);
  } else if (id == M_BRASS){
    float tarn = smoothstep(0.35, 0.75, fbm(p.xy * 40.0 + p.z * 20.0));
    m.alb = mix(vec3(0.74, 0.55, 0.28), vec3(0.32, 0.25, 0.14), tarn * 0.7);
    m.metal = 1.0; m.rough = mix(0.28, 0.5, tarn);
  } else if (id == M_CORD){
    m.alb = vec3(0.07, 0.055, 0.045); m.rough = 0.7;
  } else if (id == M_SHADE){
    m.alb = vec3(0.6, 0.53, 0.38); m.rough = 0.95; m.emis = shadeRadiance(p);
  } else if (id == M_BULB){
    m.emis = uLampI * 22.0;
  } else if (id == M_MUG){
    vec3 q = p - vec3(MUG_X, DESK_TOP, MUG_Z);
    float r = length(q.xz);
    float ang = atan(q.z, q.x);
    vec3 enamel = vec3(0.72, 0.71, 0.66);
    vec3 blue = vec3(0.05, 0.10, 0.22);
    float rimBand = smoothstep(MUG_H - 0.007, MUG_H - 0.0055, q.y);
    float inside = step(r, MUG_R - 0.004) * step(q.y, MUG_H - 0.004);
    vec3 c = mix(enamel, blue, rimBand);
    c = mix(c, enamel * 0.95, inside);
    // tea has stained the inside: a dark line where the level has stood, a brownish film below it
    float tline = smoothstep(0.0025, 0.0, abs(q.y - MUG_H * 0.705 - 0.002));
    c = mix(c, vec3(0.22, 0.11, 0.04), inside * (0.75 * tline + 0.35 * smoothstep(MUG_H * 0.78, MUG_H * 0.7, q.y)));
    // red flower motif on the side facing the room
    vec2 fm = vec2((ang - 0.85) * MUG_R, q.y - MUG_H * 0.48);
    float fr = length(fm), fa = atan(fm.y, fm.x);
    float flower = smoothstep(0.0012, 0.0, fr - 0.0105 * (0.6 + 0.4 * cos(5.0 * fa)));
    float centre = smoothstep(0.0028, 0.0022, fr);
    float stemL = smoothstep(0.0009, 0.0, abs(fm.x + 0.004 * sin(fm.y * 160.0)) - 0.0006) * step(fm.y, -0.008) * step(-0.03, fm.y);
    float leaf = smoothstep(0.001, 0.0, length((fm - vec2(0.006, -0.018)) * vec2(1.0, 1.8)) - 0.005);
    float motif = (1.0 - inside) * step(r, MUG_R + 0.002);
    c = mix(c, vec3(0.42, 0.04, 0.03), flower * motif);
    c = mix(c, vec3(0.6, 0.45, 0.06), centre * motif);
    c = mix(c, vec3(0.05, 0.18, 0.06), max(stemL, leaf) * motif);
    // enamel chips: dark iron showing through, mostly near the rim and the base
    float ch = vnoise(vec2(ang * 9.0, q.y * 140.0));
    float chips = smoothstep(0.80, 0.83, ch) * (smoothstep(MUG_H - 0.02, MUG_H, q.y) + smoothstep(0.012, 0.0, q.y));
    c = mix(c, vec3(0.025, 0.022, 0.02), sat(chips));
    m.alb = c; m.rough = mix(0.1, 0.5, sat(chips));
  } else if (id == M_TEA){
    vec3 q = p - vec3(MUG_X, DESK_TOP, MUG_Z);
    m.alb = vec3(0.05, 0.022, 0.006); m.rough = 0.06;
    // a few tea leaves floating, unfurled
    for (int k = 0; k < 3; k++){
      vec2 c = vec2(cos(float(k) * 2.4 + 0.5), sin(float(k) * 2.4 + 0.5)) * (0.008 + 0.009 * float(k));
      vec2 d = rot2(q.xz - c, float(k) * 1.3);
      float lf = smoothstep(0.0008, 0.0, length(d * vec2(1.0, 2.3)) - 0.0065);
      m.alb = mix(m.alb, vec3(0.06, 0.07, 0.02), lf); m.rough = mix(m.rough, 0.5, lf);
    }
  } else if (id >= M_BOOK0 && id <= M_BOOK2){
    vec3 q = p - vec3(BOOK_X, DESK_TOP, BOOK_Z);
    vec3 b; vec3 hs; vec3 cover;
    if (id == M_BOOK0){ b = q - vec3(0.0, 0.0165, 0.0); b.xz = rot2(b.xz, 0.10); hs = vec3(0.132, 0.0165, 0.094); cover = vec3(0.22, 0.05, 0.04); }
    else if (id == M_BOOK1){ b = q - vec3(-0.012, 0.045, 0.01); b.xz = rot2(b.xz, -0.08); hs = vec3(0.118, 0.012, 0.084); cover = vec3(0.05, 0.12, 0.11); }
    else { b = q - vec3(0.02, 0.066, -0.004); b.xz = rot2(b.xz, 0.22); hs = vec3(0.09, 0.009, 0.064); cover = vec3(0.30, 0.22, 0.08); }
    bool pages = abs(b.y) < hs.y - 0.0022 && (b.x > -hs.x + 0.004) && (abs(b.x) > hs.x - 0.004 || abs(b.z) > hs.z - 0.004);
    if (pages){ m.alb = vec3(0.46, 0.41, 0.3) * (0.85 + 0.15 * sin(b.y * 3000.0)); m.rough = 0.9; }
    else { m.alb = cover * (0.8 + 0.3 * fbm(b.xz * 60.0)) * (1.0 - 0.3 * smoothstep(0.7, 0.9, fbm(b.xz * 12.0))); m.rough = 0.75; }
  } else if (id == M_LEAF){
    vec3 q = p - PLANT_P;
    float v = vnoise(p.xz * 140.0 + p.y * 60.0);
    m.alb = mix(vec3(0.045, 0.12, 0.028), vec3(0.10, 0.19, 0.045), v) * (0.75 + 0.45 * sat((q.y - 0.04) / 0.14));
    m.alb = mix(m.alb, vec3(0.30, 0.33, 0.18), 0.45 * smoothstep(0.72, 0.9, vnoise(vec2(atan(q.z, q.x) * 26.0, q.y * 7.0))));  // pale variegation
    m.alb = mix(m.alb, vec3(0.20, 0.13, 0.05), smoothstep(-0.02, -0.06, q.y));                                               // dry brown tips
    m.rough = 0.42; m.trans = vec3(0.09, 0.19, 0.035);
  } else if (id == M_POT){
    vec3 q = p - PLANT_P;
    vec3 c = vec3(0.30, 0.12, 0.065) * (0.85 + 0.3 * fbm(vec2(atan(q.z, q.x) * 6.0, q.y * 40.0)));
    c = mix(c, vec3(0.44, 0.41, 0.36), 0.7 * smoothstep(0.55, 0.75, fbm(vec2(atan(q.z, q.x) * 5.0, q.y * 25.0) + 4.0)) * smoothstep(0.05, 0.085, q.y));   // lime bloom
    m.alb = c; m.rough = 0.85;
  } else if (id == M_SOIL){
    m.alb = vec3(0.028, 0.019, 0.013) * (0.7 + 0.6 * vnoise(p.xz * 500.0)); m.rough = 0.95;
  } else if (id == M_CLOCK){
    vec3 q = p - CLOCK_P;
    float r = length(q.xy);
    if (q.z > 0.0285 && r < 0.0985){
      // dial behind a glass cover: aged cream paper, hour batons, minute ticks, a small red maker's mark
      float a = atan(q.x, q.y);
      float hourT = abs(fract(a / (PI / 6.0) + 0.5) - 0.5) * (PI / 6.0) * r;
      float minT = abs(fract(a / (PI / 30.0) + 0.5) - 0.5) * (PI / 30.0) * r;
      float big = step(abs(fract(a / (PI / 2.0) + 0.5) - 0.5), 0.05);
      float hourMark = smoothstep(0.0024 + 0.0012 * big, 0.0014 + 0.0012 * big, hourT) * smoothstep(0.064, 0.067, r) * smoothstep(0.090, 0.087, r);
      float minMark = smoothstep(0.0007, 0.0003, minT) * smoothstep(0.084, 0.086, r) * smoothstep(0.091, 0.089, r);
      vec3 dial = vec3(0.50, 0.46, 0.35) * (0.88 + 0.12 * fbm(q.xy * 60.0));
      dial *= 1.0 - 0.25 * smoothstep(0.6, 0.9, fbm(q.xy * 14.0 + 3.0));
      dial = mix(dial, vec3(0.03), max(hourMark, minMark));
      dial = mix(dial, vec3(0.42, 0.05, 0.03), smoothstep(0.0045, 0.003, length((q.xy - vec2(0.0, 0.036)) * vec2(0.6, 1.0))));
      m.alb = dial; m.rough = 0.06;            // the glass cover catches the lamp and the window
    } else if (r > 0.097 && q.z > 0.026){ m.alb = vec3(0.62, 0.60, 0.55); m.metal = 1.0; m.rough = 0.25; }
    else { m.alb = vec3(0.055, 0.028, 0.013) * (0.8 + 0.4 * fbm(q.xy * 40.0)); m.rough = 0.32; }
  } else if (id == M_HANDS){
    m.alb = vec3(0.018); m.rough = 0.4;
  } else if (id == M_SECOND){
    m.alb = vec3(0.34, 0.03, 0.02); m.rough = 0.4;
  } else if (id == M_CAL){
    vec3 q = p - CAL_P;
    vec2 uv = vec2((0.142 - q.z) / 0.284, (q.y + 0.205) / 0.41);
    vec3 paper = vec3(0.50, 0.47, 0.39);
    vec3 c = paper;
    if (uv.y > 0.40){
      vec2 pv = vec2((uv.x - 0.06) / 0.88, (uv.y - 0.43) / 0.53);
      if (pv.x > 0.0 && pv.x < 1.0 && pv.y > 0.0 && pv.y < 1.0) c = calPicture(pv, uSeason, uVar.y);
    } else if (uv.y > 0.335){
      c = vec3(0.50, 0.08, 0.05);
      c = mix(c, vec3(0.62, 0.52, 0.36), step(0.6, vnoise(vec2(uv.x * 60.0, 3.0))) * step(abs(uv.y - 0.367), 0.012) * step(abs(uv.x - 0.5), 0.2));
    } else if (uv.y > 0.04){
      // the month: 7 columns × 5 weeks of numerals, Sundays in red, one date circled in pen
      vec2 g = vec2((uv.x - 0.05) / 0.9 * 7.0, (0.315 - uv.y) / 0.27 * 5.0);
      vec2 gi = floor(g), gf = fract(g) - vec2(0.5, 0.45);
      float on = step(0.0, g.x) * step(g.x, 7.0) * step(0.0, g.y) * step(g.y, 5.0);
      float digit = step(abs(gf.x), 0.16) * step(abs(gf.y), 0.2) * step(0.35, vnoise(gf * 9.0 + gi * 3.1));
      vec3 ink = gi.x < 0.5 ? vec3(0.45, 0.06, 0.04) : vec3(0.06, 0.05, 0.045);
      c = mix(c, ink, digit * on);
      float circ = smoothstep(0.03, 0.0, abs(length(gf * vec2(1.0, 1.3)) - 0.33)) * step(abs(gi.x - 4.0), 0.1) * step(abs(gi.y - 2.0), 0.1);
      c = mix(c, vec3(0.5, 0.06, 0.05), circ * 0.9);
    }
    c *= 0.88 + 0.12 * vnoise(uv * 90.0);
    c = mix(c, c * vec3(1.0, 0.88, 0.68), 0.55 * smoothstep(0.4, 0.85, fbm(uv * 3.0 + 1.0)));   // yellowed with age
    c *= mix(vec3(0.82, 0.86, 0.9), vec3(1.0), smoothstep(0.0, 0.25, uv.y));                    // grubby lower edge, thumbed through every month
    m.alb = c; m.rough = 0.75;
  } else if (id == M_THERMOS){
    vec3 q = p - TH_P;
    float ang = atan(q.z, q.x);
    vec3 base = uVar.x < 0.4 ? vec3(0.30, 0.035, 0.03) : uVar.x < 0.75 ? vec3(0.045, 0.17, 0.10) : vec3(0.08, 0.20, 0.30);
    vec3 c = base;
    // printed band of peonies with leaves, gold pin-stripes
    vec2 fp = vec2((fract(ang / (PI / 3.0)) - 0.5) * 0.0626, q.y - 0.168);
    float fr = length(fp), fa = atan(fp.y, fp.x);
    float flower = smoothstep(0.0015, 0.0, fr - 0.018 * (0.72 + 0.28 * cos(6.0 * fa)));
    float leaf = smoothstep(0.0015, 0.0, length((fp - vec2(0.022, -0.012)) * vec2(1.0, 2.2)) - 0.008);
    c = mix(c, vec3(0.06, 0.18, 0.07), leaf);
    c = mix(c, mix(vec3(0.66, 0.42, 0.40), vec3(0.62, 0.55, 0.35), smoothstep(0.012, 0.0, fr)), flower);
    float stripe = smoothstep(0.0013, 0.0, abs(q.y - 0.105)) + smoothstep(0.0013, 0.0, abs(q.y - 0.235));
    c = mix(c, vec3(0.55, 0.40, 0.12), sat(stripe));
    // decades of use: chipped paint, rust creeping up from the foot
    float chip = smoothstep(0.75, 0.78, fbm(vec2(ang * 8.0, q.y * 60.0)));
    float rust = smoothstep(0.06, 0.0, q.y) * smoothstep(0.4, 0.7, fbm(vec2(ang * 5.0, q.y * 50.0)));
    c = mix(c, vec3(0.12, 0.05, 0.025), sat(chip + rust));
    m.alb = c; m.rough = mix(0.26, 0.7, sat(chip + rust));
  } else if (id == M_CORK){
    m.alb = vec3(0.20, 0.11, 0.05) * (0.7 + 0.5 * vnoise(p.xz * 600.0 + p.y * 300.0)); m.rough = 0.9;
  } else if (id == M_PAPER){
    vec3 q = p - NB_P; q.xz = rot2(q.xz, 0.24);
    vec3 c = vec3(0.56, 0.53, 0.44) * (0.93 + 0.07 * vnoise(q.xz * 300.0));
    float row = floor((q.z + 0.09) / 0.0075);
    float dz = fract((q.z + 0.09) / 0.0075) * 0.0075;
    float inRows = step(-0.088, q.z) * step(q.z, 0.092) * step(0.012, abs(q.x)) * step(abs(q.x), 0.142);
    c = mix(c, vec3(0.38, 0.48, 0.58), smoothstep(0.0003, 0.0, abs(dz - 0.0072)) * inRows * 0.5);
    // handwriting: the left page is full, the right page stops a third of the way down
    float lineLen = (q.x < 0.0) ? 0.142 - 0.05 * hash11(row * 3.1) : (row > 16.0 ? 0.0 : 0.142 - 0.06 * hash11(row * 5.7));
    float written = step(abs(q.x), lineLen) * inRows;
    float glyph = step(0.55, vnoise(vec2(q.x * 520.0, row * 13.7))) * smoothstep(0.0024, 0.0012, abs(dz - 0.0045));
    glyph = max(glyph, step(0.8, vnoise(vec2(q.x * 900.0, row * 5.1))) * smoothstep(0.0034, 0.002, abs(dz - 0.004)));
    c = mix(c, vec3(0.06, 0.08, 0.17), glyph * written * 0.85);
    if (q.y < 0.006 && (abs(q.x) > 0.148 || abs(q.z) > 0.1)) c *= 0.75 + 0.25 * sin(q.y * 4000.0);   // edges of the page block
    m.alb = c; m.rough = 0.88;
  } else if (id == M_PEN){
    vec3 q = p - NB_P; q.xz = rot2(q.xz, 0.24);
    float s = dot(q - vec3(0.035, 0.0134, -0.07), normalize(vec3(0.1, -0.0024, 0.125)));
    m.alb = s > 0.115 ? vec3(0.62, 0.47, 0.20) : vec3(0.025, 0.035, 0.07);
    m.metal = s > 0.115 || abs(s - 0.06) < 0.003 ? 1.0 : 0.0; m.rough = 0.18;
  } else if (id == M_NBCOVER){
    m.alb = vec3(0.035, 0.075, 0.06) * (0.85 + 0.3 * vnoise(p.xz * 200.0)); m.rough = 0.8;
  } else if (id == M_RADIO){
    vec3 q = p - RADIO_P - vec3(0.0, 0.057, 0.0);
    if (q.z > 0.029){
      if (q.x < 0.018 && q.x > -0.086 && abs(q.y) < 0.042){
        vec2 g = fract(q.xy / 0.0042) - 0.5;
        m.alb = mix(vec3(0.16, 0.12, 0.075), vec3(0.04, 0.03, 0.022), smoothstep(0.34, 0.24, length(g))); m.rough = 0.9;
      } else if (q.x > 0.028 && q.x < 0.09 && q.y > -0.006 && q.y < 0.036){
        // the dial window, lit from behind: scale ticks and a red needle
        float tick = smoothstep(0.0005, 0.0, abs(fract(q.x / 0.004) - 0.5) * 0.004 - 0.00015) * step(abs(q.y - 0.022), 0.006);
        float needle = smoothstep(0.0008, 0.0, abs(q.x - 0.061));
        vec3 glow = vec3(1.0, 0.42, 0.10) * 0.9 * (1.0 - 0.7 * tick) * (0.85 + 0.15 * smoothstep(0.036, 0.0, abs(q.y - 0.015)));
        m.alb = vec3(0.04); m.emis = mix(glow, vec3(0.5, 0.03, 0.02), needle); m.rough = 0.08;
      } else { m.alb = vec3(0.34, 0.31, 0.24) * (0.9 + 0.1 * fbm(q.xy * 80.0)); m.rough = 0.35; }
    } else { m.alb = vec3(0.10, 0.055, 0.03) * (0.8 + 0.4 * fbm(vec2(q.x * 30.0, q.y * 300.0))); m.rough = 0.3; }
  } else if (id == M_BLOSSOM){
    // peach blossom: pale pink petals deepening to carmine at the heart; buds are darker; thin petals glow against the window
    vec3 q = p - SEAS_P;
    float v = vnoise(q.xy * 900.0);
    m.alb = mix(vec3(0.78, 0.42, 0.50), vec3(0.62, 0.20, 0.30), 0.35 * v + 0.4 * smoothstep(0.75, 0.95, vnoise(q.xy * 300.0 + 7.0)));
    m.rough = 0.55; m.trans = vec3(0.20, 0.09, 0.10);
  } else if (id == M_TWIG){
    m.alb = vec3(0.075, 0.045, 0.035) * (0.8 + 0.4 * vnoise(p.xy * 500.0)); m.rough = 0.7;
  } else if (id == M_BOTTLE){
    // green soda-bottle glass: almost no diffuse, a sharp gloss, and the window seen through it
    m.alb = vec3(0.02, 0.045, 0.03); m.rough = 0.04; m.trans = vec3(0.07, 0.15, 0.09);
  } else if (id == M_COIL){
    vec3 c = p - SEAS_P - vec3(0.0, 0.0125, 0.0);
    float T = coilT(c.xz);
    float ash = smoothstep(COIL_T1 - 0.9, COIL_T1 - 0.15, T);
    m.alb = mix(vec3(0.05, 0.085, 0.035) * (0.85 + 0.3 * vnoise(c.xz * 900.0)), vec3(0.36, 0.35, 0.33), ash);
    m.rough = 0.9;
    float e = length(p - EMBER);
    m.emis = vec3(6.0, 1.3, 0.22) * smoothstep(0.004, 0.0015, e) * (0.75 + 0.25 * sin(uTime * 2.3) * sin(uTime * 3.7 + 1.0));
  } else if (id == M_TIN){
    vec3 q = p - SEAS_P;
    m.alb = vec3(0.38, 0.36, 0.33) * (0.8 + 0.3 * vnoise(q.xz * 300.0)); m.metal = 1.0; m.rough = 0.35;
    // grey ash fallen from the burnt end
    float ash = smoothstep(0.012, 0.0, length(q.xz - (EMBER.xz - SEAS_P.xz) * 1.05)) * step(q.y, 0.004);
    m.alb = mix(m.alb, vec3(0.42, 0.41, 0.39), ash); m.metal *= 1.0 - ash; m.rough = mix(m.rough, 0.95, ash);
  } else if (id == M_FAN){
    // split palm leaf: pale straw ribs fanning out from the handle, browned and spotted with years of summers
    vec3 q = p - DESK_SP; q.xz = rot2(q.xz, 0.55);
    vec2 u = q.xz - vec2(0.0, 0.10);
    float a = atan(u.x, -u.y), r = length(u);
    float rib = 0.5 + 0.5 * cos(a * 70.0);
    vec3 c = mix(vec3(0.27, 0.20, 0.10), vec3(0.38, 0.30, 0.16), rib * 0.7);
    c *= 0.85 + 0.25 * vnoise(vec2(a * 40.0, r * 30.0));
    c = mix(c, vec3(0.25, 0.17, 0.08), 0.5 * smoothstep(0.6, 0.85, fbm(q.xz * 30.0)));
    m.alb = c; m.rough = 0.7;
  } else if (id == M_FANRIM){
    m.alb = vec3(0.14, 0.10, 0.06); m.rough = 0.6;
  } else if (id == M_KAKI){
    vec3 q = p - SEAS_P;
    m.alb = mix(vec3(0.70, 0.20, 0.025), vec3(0.62, 0.28, 0.03), vnoise(q.xz * 120.0)) * (0.9 + 0.1 * vnoise(q.xy * 400.0));
    m.rough = 0.28; m.trans = vec3(0.10, 0.03, 0.0);
  } else if (id == M_CALYX){
    m.alb = vec3(0.10, 0.08, 0.035); m.rough = 0.8;
  } else if (id == M_HWB){
    // ribbed red rubber (the ribs are on the faces; the edges are smooth)
    vec3 q = p - DESK_SP; q.xz = rot2(q.xz, -0.35);
    float rib = smoothstep(0.3, 0.7, abs(fract((q.x + q.z * 0.6) * 90.0) - 0.5) * 2.0) * smoothstep(0.06, 0.03, abs(q.z));
    m.alb = vec3(0.46, 0.035, 0.03) * (0.85 + 0.15 * rib); m.rough = 0.42 - 0.12 * rib;
  } else if (id == M_STOPPER){
    m.alb = vec3(0.6, 0.58, 0.52); m.rough = 0.35;
  } else if (id == M_CURTAIN){
    vec2 cu = vec2(p.x * 1.0, p.y);
    vec3 c = vec3(0.56, 0.45, 0.25);
    // faded floral print: small sprigs on a 9 cm half-drop repeat
    vec2 g = vec2(p.x / 0.09, p.y / 0.11 + 0.5 * mod(floor(p.x / 0.09), 2.0));
    vec2 f = (fract(g) - 0.5) * vec2(0.09, 0.11);
    float fr = length(f), fa = atan(f.y, f.x);
    float sprig = smoothstep(0.0015, 0.0, fr - 0.012 * (0.55 + 0.45 * cos(5.0 * fa)));
    c = mix(c, vec3(0.42, 0.17, 0.10), sprig * 0.35);
    c = mix(c, vec3(0.22, 0.30, 0.20), smoothstep(0.0015, 0.0, abs(fr - 0.022) - 0.002) * step(0.3, sin(fa * 3.0)) * 0.25);
    m.alb = c * (0.88 + 0.12 * fbm(vec2(p.x * 30.0, p.y * 3.0)));
    m.rough = 0.95;
    m.trans = vec3(0.36, 0.26, 0.12);
  }
  return m;
}

// ---- lighting -------------------------------------------------------------
float D_GGX(float nh, float a){ float a2 = a * a; float d = nh * nh * (a2 - 1.0) + 1.0; return a2 / (PI * d * d); }
vec3 F_Schlick(vec3 f0, float c){ return f0 + (1.0 - f0) * pow(1.0 - c, 5.0); }
float V_Smith(float nv, float nl, float a){ float k = a * 0.5; return 0.25 / ((nv * (1.0 - k) + k) * (nl * (1.0 - k) + k)); }

vec3 windowRadiance(vec3 d){ return mix(uCityL * 2.6, uSkyL * 1.4, smoothstep(0.03, 0.32, d.y)); }

vec3 shade(vec3 p, vec3 n, vec3 rd, float id){
  vec3 nGeo = n;
  Mat m = getMat(id, p, n);
  vec3 v = -rd;
  float nv = max(dot(n, v), 1e-3);
  vec3 f0 = mix(vec3(0.04), m.alb, m.metal);
  vec3 dif = m.alb * (1.0 - m.metal) / PI;
  float a = max(m.rough * m.rough, 0.002);
  vec3 col = m.emis;
  vec3 pe = p + nGeo * 0.0015;

  // 1) desk lamp: bulb as a small sphere light, modulated by the shade
  vec3 L = BULB - p; float d2 = dot(L, L); float d = sqrt(d2); vec3 l = L / d;
  float nl = dot(n, l);
  if (nl > 0.0 && dot(uLampI, vec3(1.0)) > 1e-4 && id != M_SHADE && id != M_BULB){
    float sh = softShadow(pe, l, d - BULB_R * 1.5, d / (BULB_R * 3.2));
    vec3 E = uLampI * lampEmitFactor(-l) * (nl / d2) * sh;
    vec3 hv = normalize(l + v); float nh = max(dot(n, hv), 0.0);
    // sphere light: the lobe is widened by the bulb's angular radius (in half-vector space: R / 2d). The lobe stays
    // normalised, so a mirror shows the bulb at its true radiance × F. (Karis' extra (α/α')² factor belongs to his
    // representative-point method, which is not used here, so it is left out.)
    float aL = sat(a + BULB_R / (2.0 * d));
    vec3 spec = D_GGX(nh, aL) * V_Smith(nv, nl, aL) * F_Schlick(f0, max(dot(l, hv), 0.0));
    col += E * (dif + spec);
  }
  // 1a) the little light that jumped out of the bulb: a tiny sphere light with its own soft shadows,
  //     plus the light it bounces off whatever it is near (a crude one-bounce term)
  if (uHeroI.r > 1e-5){
    vec3 Lh = uHeroP - p; float dh2 = max(dot(Lh, Lh), HERO_R * HERO_R * 4.0), dh = sqrt(dh2); vec3 lh = Lh / dh;
    float nlh = dot(n, lh);
    if (nlh > 0.0 && dh2 < 12.0){
      float shh = softShadow(pe, lh, dh - HERO_R * 2.5, dh / (HERO_R * 5.0));
      vec3 hvh = normalize(lh + v); float aH = sat(a + 0.02 / (2.0 * dh));     // its glow is ~2 cm across: soft highlights
      col += uHeroI * (nlh / dh2) * shh * (dif + D_GGX(max(dot(n, hvh), 0.0), aH) * V_Smith(nv, nlh, aH) * F_Schlick(f0, max(dot(lh, hvh), 0.0)));
    }
    col += dif * uHeroI * 0.05 / (0.02 + dh2);
    if (id == M_LEAF || id == M_CURTAIN) col += m.trans * uHeroI * max(-nlh, 0.0) / dh2 * 0.5;   // seen through a leaf
  }
  // 1b) glowing shade seen as a large sphere light (specular only: its diffuse light is already in τ above)
  if (id != M_SHADE && id != M_BULB){
    vec3 sc = vec3(LAMP_X, DESK_TOP + (SHADE_Y0 + SHADE_Y1) * 0.5, LAMP_Z);
    vec3 Ls = sc - p; float ds = length(Ls); vec3 ls = Ls / ds;
    float nls = dot(n, ls);
    if (nls > 0.0){
      vec3 hv = normalize(ls + v); float nh = max(dot(n, hv), 0.0);
      float R = 0.11; float aS = sat(a + R / (2.0 * ds));
      vec3 Ls_rad = uLampI * uShadeTau * (0.62 / (0.11 * 0.11)) / PI;
      float omega = PI * R * R / (ds * ds);
      col += Ls_rad * omega * nls * D_GGX(nh, aS) * V_Smith(nv, nls, aS) * F_Schlick(f0, max(dot(ls, hv), 0.0));
    }
  }

  // 2) the window as two rectangular area lights (sky above, lit street below), soft-shadowed
  vec2 lo = vec2(WIN_X0, WIN_Y0), hi = vec2(WIN_X1, WIN_Y1);
  float split = 1.62;
  vec3 Ew = uSkyL * rectIrr(p, n, vec2(lo.x, split), hi, GLASS_Z) + uCityL * rectIrr(p, n, lo, vec2(hi.x, split), GLASS_Z);
  if (dot(Ew, vec3(1.0)) > 1e-5){
    vec3 wc = vec3(clamp(p.x, WIN_X0 + 0.1, WIN_X1 - 0.1), clamp(p.y + 0.35, WIN_Y0 + 0.15, WIN_Y1 - 0.15), GLASS_Z);
    vec3 wl = wc - p; float wd = length(wl);
    Ew *= 0.82 * softShadowWide(pe, wl / wd, wd - 0.02, 2.6);
  }
  col += dif * Ew;

  // 3) indirect light: virtual point lights at the brightest bounce surfaces + radiosity ambient
  float ao = calcAO(pe, n);
  vec3 dpos = vec3(LAMP_X + 0.05, DESK_TOP + 0.01, LAMP_Z + 0.12);
  vec3 Ld = dpos - p; float dd2 = dot(Ld, Ld) + 0.03; vec3 ld = Ld * inversesqrt(dd2);
  vec3 Eb = uLampI * vec3(0.10, 0.05, 0.026) * 2.6 * (max(dot(n, ld), 0.0) * max(-ld.y, 0.0) / (PI * dd2));
  vec3 wpos = vec3(LAMP_X, DESK_TOP + 0.42, 0.002);
  vec3 Lw = wpos - p; float wd2 = dot(Lw, Lw) + 0.04; vec3 lw = Lw * inversesqrt(wd2);
  Eb += uLampI * uShadeTau * 0.47 * 2.4 * (max(dot(n, lw), 0.0) * max(-lw.z, 0.0) / (PI * wd2));
  vec3 cpos = vec3(LAMP_X, ROOM_H - 0.01, LAMP_Z + 0.2);
  vec3 Lc = cpos - p; float cd2 = dot(Lc, Lc) + 0.3; vec3 lc = Lc * inversesqrt(cd2);
  Eb += uLampI * 0.55 * 1.6 * (max(dot(n, lc), 0.0) * max(lc.y, 0.0) / (PI * cd2));
  float nearLamp = exp(-length(p - BULB) * 0.9);
  vec3 Ea = (uAmbL * (0.45 + 0.9 * nearLamp) + uAmbS) * (0.4 + 0.6 * max(n.z * 0.5 + 0.5, 0.0));
  col += dif * (Eb * mix(1.0, ao, 0.5) + Ea * ao);

  // 4a) the desk glass is a real mirror: trace the reflected ray through the room and shade the hit cheaply
  //     (unshadowed lamp + ambient). The mug, the lamp base and the cord stand on their own reflections.
  bool mirrored = false;
  if (id == M_GTOP && nGeo.y > 0.7){
    vec3 Rr = reflect(rd, nGeo);
    float tr = 0.004; vec2 hr = vec2(1.0, 0.0);
    for (int i = 0; i < 44; i++){
      hr = map(pe + Rr * tr, true);
      if (hr.x < 0.0005 * tr + 0.00015){ mirrored = true; break; }
      tr += hr.x;
      if (tr > 3.0) break;
    }
    if (mirrored){
      vec3 q = pe + Rr * tr, qn = calcNormal(q);
      Mat mq = getMat(hr.y, q, qn);
      vec3 Lq = BULB - q; float dq = dot(Lq, Lq); vec3 lq = Lq * inversesqrt(dq);
      vec3 Eq = uLampI * lampEmitFactor(-lq) * max(dot(qn, lq), 0.0) / dq + uAmbL + uAmbS;
      vec3 rc = mq.emis + mq.alb * (1.0 - mq.metal) / PI * Eq + mq.alb * mq.metal * (uAmbL + uAmbS) * 0.4;
      col += F_Schlick(vec3(0.04), nv) * rc;
    }
  }
  // 4) glossy reflection of the window (environment specular), the main cold highlight on desk / mug / brass
  vec3 R = reflect(rd, n);
  if (R.z < 0.0 && m.rough < 0.7 && !mirrored){
    float tR = (GLASS_Z - p.z) / R.z; vec2 hp = p.xy + R.xy * tR;
    float blur = 0.02 + a * tR * 1.5;
    float inW = smoothstep(-blur, blur, WIN_HW - abs(hp.x - WIN_CX)) * smoothstep(-blur, blur, WIN_HH - abs(hp.y - WIN_CY));
    float bars = 1.0 - 0.8 * smoothstep(MW + blur, MW - blur, abs(hp.x)) - 0.8 * smoothstep(TW + blur, TW - blur, abs(hp.y - TRANSOM_Y));
    vec3 Fr = F_Schlick(f0, nv) * (1.0 - a * 0.7);
    col += Fr * windowRadiance(R) * inW * sat(bars) * ao;
  }
  // diffuse-ish ambient specular for everything else
  col += F_Schlick(f0, nv) * (uAmbL * 0.5 + uAmbS) / PI * ao * (1.0 - m.rough) * 0.6;

  // 5a) thin leaves: the window shines through them (and, from the side, the lamp)
  if (id == M_LEAF || id == M_BLOSSOM || id == M_BOTTLE || id == M_KAKI){
    col += m.trans * windowRadiance(vec3(0.0, 0.15, -1.0)) * 0.9;
    col += m.trans * uLampI * lampEmitFactor(normalize(p - BULB)) / max(d2, 0.05) * 0.06;
  }
  // 5) curtain transmission: cold window light passing through the fabric where it hangs over the glass
  if (id == M_CURTAIN){
    float over = smoothstep(WIN_X1 + 0.01, WIN_X1 - 0.02, p.x) * smoothstep(WIN_Y0 - 0.02, WIN_Y0 + 0.03, p.y) * smoothstep(WIN_Y1 + 0.02, WIN_Y1 - 0.03, p.y);
    col += m.trans * windowRadiance(vec3(0.0, (p.y - 1.4) * 0.5, -1.0)) * 0.5 * over;
    col += m.trans * dot(Ew, vec3(0.3)) * 0.02;
  }

  return col;
}

// ---- steam over the tea: a thin, rising, wandering plume (single scattering).
// Lamp light (Henyey–Greenstein g = 0.5) and the window behind it (forward scattering g = 0.65) light the droplets;
// optical depth stays ≲ 0.15 so it reads as breath, not smoke.
float HG(float c, float g){ float g2 = g * g; return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }
vec4 steamVol(vec3 ro, vec3 rd, float tEnd){
  vec3 c = vec3(MUG_X, DESK_TOP + MUG_H - 0.004, MUG_Z);
  const float RMAX = 0.09, HMAX = 0.30;
  vec2 oc = ro.xz - c.xz;
  float a = dot(rd.xz, rd.xz), b = dot(oc, rd.xz), cc = dot(oc, oc) - RMAX * RMAX;
  float disc = b * b - a * cc;
  if (disc <= 0.0 || uSteam <= 0.0) return vec4(0.0, 0.0, 0.0, 1.0);
  float sq = sqrt(disc);
  float t0 = max((-b - sq) / a, 0.0), t1 = min((-b + sq) / a, tEnd);
  float ty0 = (c.y - ro.y) / rd.y, ty1 = (c.y + HMAX - ro.y) / rd.y;
  t0 = max(t0, min(ty0, ty1)); t1 = min(t1, max(ty0, ty1));
  if (t1 <= t0) return vec4(0.0, 0.0, 0.0, 1.0);
  float dt = (t1 - t0) / 12.0, T = 1.0; vec3 S = vec3(0.0);
  float jit = hash12(gl_FragCoord.xy + fract(uTime * 7.0) * 61.0);
  vec3 Ewin = uSkyL * 1.1 + uCityL * 0.6;
  for (int i = 0; i < 12; i++){
    vec3 p = ro + rd * (t0 + (float(i) + jit) * dt);
    float h = (p.y - c.y) / HMAX;
    vec2 ctr = c.xz + vec2(0.03 * h * sin(h * 4.0 + uTime * 0.35) + 0.035 * h * h, 0.018 * h * cos(h * 5.0 - uTime * 0.27));
    vec2 dd = p.xz - ctr;
    float rr = length(dd) / (0.014 + 0.065 * h);
    float ang = atan(dd.y, dd.x);
    float f1 = vnoise(vec2(ang * 1.6 + h * 6.0 + 7.0, h * 9.0 - uTime * 0.7));
    float f2 = vnoise(vec2(ang * 3.2 - h * 4.0, h * 21.0 - uTime * 1.3 + 3.0));
    float wisp = smoothstep(0.42, 0.85, f1 * 0.65 + f2 * 0.45);
    float sigma = 10.0 * uSteam * wisp * exp(-rr * rr * 1.6) * smoothstep(0.0, 0.07, h) * (1.0 - h) * (1.0 - h);
    if (sigma < 1e-3) continue;
    vec3 Ll = p - BULB; float ld2 = dot(Ll, Ll); vec3 ll = Ll * inversesqrt(ld2);
    vec3 Lh = p - uHeroP; float hd2 = max(dot(Lh, Lh), 1e-4);
    vec3 Lin = uHeroI / hd2 * HG(dot(Lh * inversesqrt(hd2), -rd), 0.5) + uLampI * lampEmitFactor(ll) / ld2 * HG(dot(ll, -rd), 0.5) + Ewin * HG(dot(vec3(0.0, 0.0, 1.0), -rd), 0.65) * 2.5 + (uAmbL + uAmbS) * 0.08;
    S += T * sigma * dt * Lin;
    T *= exp(-sigma * dt);
  }
  return vec4(S, T);
}

// ---- 蚊香的烟：从火头笔直升起一缕细线（层流），约 8 cm 后开始摆动、卷曲、散开（转捩）。
// Analytic: the plume is a chain of short Gaussian tubes; each adds optical depth σ·s·√π·exp(−d²/s²)/sinθ for a ray
// passing at distance d; the thread thins out as it widens. Smooth in space and time: no noise, no aliasing.
vec4 smokeVol(vec3 ro, vec3 rd, float tEnd){
  if (abs(uSeason - 1.0) > 0.5) return vec4(0.0, 0.0, 0.0, 1.0);
  const float HM = 0.42;
  vec3 c = EMBER + vec3(0.0, HM * 0.5, 0.0);
  vec3 oc = ro - c;                                   // cheap reject: a bounding cylinder r = 9 cm
  float a = dot(rd.xz, rd.xz), b = dot(oc.xz, rd.xz), cc = dot(oc.xz, oc.xz) - 0.0081;
  if (b * b - a * cc <= 0.0) return vec4(0.0, 0.0, 0.0, 1.0);
  float tau = 0.0; vec3 S = vec3(0.0);
  vec3 Ewin = uSkyL * 1.1 + uCityL * 0.6;
  // two strands: the thread, and a second filament that peels off it where the flow turns unstable
  for (int j = 0; j < 2; j++){
    float fj = float(j), ph = fj * 2.6;
    vec3 prev = EMBER;
    for (int i = 1; i <= 14; i++){
      float h = float(i) / 14.0;
      float tr = smoothstep(0.1, 0.42, h);              // laminar → turbulent
      float split = j == 0 ? 1.0 : smoothstep(0.28, 0.5, h);
      float w = uTime * 0.85 - h * 9.0 + ph;            // waves travel up the plume
      float am = tr * pow(h, 0.8) * (1.0 + 0.5 * fj);
      vec3 cur = EMBER + vec3((0.03 * sin(w + h * 3.0) + 0.016 * sin(2.7 * w + 1.0 + ph)) * am + 0.03 * h * h,
                              HM * h,
                              (0.022 * cos(0.8 * w + 1.0) + 0.012 * sin(3.1 * w + ph)) * am);
      float sw = 0.0009 + 0.02 * pow(h, 1.6) * tr;
      if (j == 1 && split < 0.01){ prev = cur; continue; }
      // closest approach of the ray to the line through prev→cur; each ray height belongs to exactly one segment
      vec3 ba = cur - prev, w0 = ro - prev;
      float bb = dot(ba, ba), ab = dot(rd, ba), d0 = dot(rd, w0), e0 = dot(ba, w0);
      float den = max(bb - ab * ab, 1e-9);
      float sc = (ab * e0 - bb * d0) / den, u = (e0 - ab * d0) / den;
      vec3 dd = prev + ba * u - ro - rd * sc;
      float d2 = dot(dd, dd);
      if (u >= 0.0 && u < 1.0 && sc > 0.0 && sc < tEnd && d2 < 9.0 * sw * sw){
        float sinT = sqrt(max(1.0 - ab * ab / bb, 0.04));
        float flick = mix(1.0, 0.25 + 0.95 * vnoise(vec2(h * 8.0 - uTime * 1.4 + fj * 5.0, 3.0)), tr);
        // optical depth falls more slowly than 1/s: the turbulent part folds into sheets that are seen edge-on
        float dt = 0.0005 / sqrt(sw * 0.0009) * exp(-d2 / (sw * sw)) * 1.7725 / sinT * flick * (1.0 - h * h) * split * (j == 0 ? 1.0 : 0.6);
        vec3 rp = ro + rd * sc;
        vec3 Ll = rp - BULB; float ld2 = dot(Ll, Ll); vec3 ll = Ll * inversesqrt(ld2);
        // fine smoke particles scatter blue a little more (it reads as a blue-grey thread)
        vec3 Lin = (uLampI * lampEmitFactor(ll) / ld2 * HG(dot(ll, rd), 0.3) * 1.6 + Ewin * HG(-rd.z, 0.65) * 2.5 + (uAmbL + uAmbS) * 0.15) * vec3(0.85, 0.93, 1.1);
        S += exp(-tau) * dt * Lin;
        tau += dt;
      }
      prev = cur;
    }
  }
  return vec4(S, exp(-tau));
}

`;
const FS_ROOM = () => GLSL_HEAD() + GLSL_LIGHT + ROOM_LIB + `
void main(){
  vec2 ndc = (gl_FragCoord.xy + uJitter) / uRes * 2.0 - 1.0;
  vec3 rd = normalize(uCamFwd + ndc.x * uTan.x * uCamRight + ndc.y * uTan.y * uCamUp);
  vec3 ro = uCamPos;
  float tG = (GLASS_Z - ro.z) / rd.z;
  vec3 pg = ro + rd * tG;
  bool inWin = rd.z < 0.0 && abs(pg.x - WIN_CX) < WIN_HW && abs(pg.y - WIN_CY) < WIN_HH;
  float tmax = inWin ? tG : 9.0;
  float t = 0.05; vec2 h = vec2(1.0, 0.0); bool hit = false;
  for (int i = 0; i < 120; i++){
    h = map(ro + rd * t, true);
    if (h.x < 0.0003 * t + 0.00008){ hit = true; break; }
    t += h.x * 0.96;
    if (t > tmax) break;
  }
  vec4 st = steamVol(ro, rd, hit ? t : tG);
  vec4 sm = smokeVol(ro, rd, hit ? t : tG);
  st = vec4(st.rgb * sm.a + sm.rgb, st.a * sm.a);
  // the little light itself: a bright core, and a soft glow where its light scatters in the room's dusty air
  // (closed form of the single-scattering integral along the ray up to whatever the ray hits)
  if (uHeroI.r > 1e-5){
    vec3 so = uHeroP - ro; float tc = dot(so, rd), tEnd = hit ? t : tG;
    float hh = max(length(so - rd * tc), 1e-4);
    float vis = tc > 0.0 && tc < tEnd ? 1.0 : 0.0;
    float rr = hh / max(tc, 0.05);                                     // angular distance from it (rad)
    float core = smoothstep(HERO_R * 1.5, HERO_R * 0.3, hh) * vis;
    float glow = (atan((tEnd - tc) / hh) + atan(tc / hh)) / hh;
    // core (a small hot sphere), a soft halo round it, and the faint veiling glare a lens adds to any bright point
    st.rgb += uHeroI * (core * 0.35 / (PI * HERO_R * HERO_R) + vis * (exp(-rr / 0.009) * 70.0 + 1.2 / (1.0 + rr * rr * 2e4)) + glow * 0.006 / (4.0 * PI));
  }
  // premultiplied: (room radiance, glass coverage) — steam adds light and veils whatever lies behind it
  if (!hit){ oCol = vec4(st.rgb, st.a); oAux = vec4(tG * dot(rd, uCamFwd)); return; }
  vec3 p = ro + rd * t;
  vec3 n = calcNormal(p);
  vec3 col = shade(p, n, rd, h.y);
  oCol = vec4(max(col, 0.0) * st.a + st.rgb, 0.0);
  oAux = vec4(t * dot(rd, uCamFwd));
}
`;

// --------------------------------------------------------------------------
// OUTSIDE: procedural rainy street (background only; point lights are sprites)
// --------------------------------------------------------------------------
const GLSL_CITY = `
uniform float uTime;
uniform float uCity;            // per-visit seed of the skyline and the shop row
uniform vec4 uBus;              // a passing bus: x, z of its near side, heading, intensity (0: none)
#define TREE_Z (-4.8)
float sdSegC(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float sdBoxC(vec2 p, vec2 b){ vec2 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0); }
// opposite row: old 2-4 storey shophouses; far city: towers seen over their roofs
float bldTop(float x){ float i = floor(x / 9.0) + uCity; return 6.6 + 5.0 * hash11(i * 3.17 + 0.7) + (hash11(i * 7.1) > 0.72 ? 3.0 : 0.0); }
float farTop(float x){ float i = floor(x / 26.0) + uCity * 1.37; return 16.0 + 50.0 * pow(hash11(i * 1.7 + 9.0), 1.6); }
// 窗外人行道上的一棵梧桐，树冠伸进窗口左上角；当作 TREE_Z 处的竖直「卡片」，离焦按该深度的弥散圆处理。
// 枝干是 JS 里递归生成的一副骨架（最多 64 段），叶幕的疏密与颜色随季节：春稀而嫩，夏浓，秋黄而疏，冬只剩枝。
uniform vec4 uBr[64];           // branch segments a.xy → b.xy (world x, y in the tree's plane)
uniform float uBrR[64];         // their radii
uniform vec4 uTips[24];         // leaf clusters around the outer twigs: centre xy, radius
uniform vec4 uLeaf;             // x: foliage density, yzw: leaf albedo
uniform float uWindNow;         // wind strength now (sways the crown, slants the rain)
vec2 treeParts(vec2 pt, float w){
  if (pt.x < -5.6 || pt.x > 1.8 || pt.y < GROUND_Y || pt.y > GROUND_Y + 9.2) return vec2(0.0);
  float sway = (0.6 + uWindNow) * smoothstep(GROUND_Y + 3.5, GROUND_Y + 7.0, pt.y);
  vec2 q = pt + vec2(0.10 * sin(uTime * 0.6 + pt.y * 0.8) + 0.05 * sin(uTime * 1.3 + pt.x), 0.03 * sin(uTime * 0.9 + pt.x * 0.7)) * sway;
  float crown = 0.0;
  if (uLeaf.x > 0.0){
    // leaves grow in clusters round the outer twigs; a sparse crown (spring, autumn) has smaller clusters with sky between
    float e = 1e9;
    for (int i = 0; i < 24; i++){
      if (uTips[i].z <= 0.0) break;
      e = min(e, length(q - uTips[i].xy) / (uTips[i].z * (0.55 + 0.45 * uLeaf.x)));
    }
    float d = e + (0.5 - fbm(q * 1.6 + 3.0)) * 0.75 + (0.5 - vnoise(q * 6.0)) * 0.3;
    crown = smoothstep(0.85 + w, 0.85 - w, d);
  }
  float br = 1e9;
  for (int i = 0; i < 64; i++){
    if (uBrR[i] <= 0.0) break;
    br = min(br, sdSegC(q, uBr[i].xy, uBr[i].zw) - uBrR[i]);
  }
  return vec2(crown, smoothstep(w * 1.5, -w * 1.5, br));
}
float treeAlpha(vec2 pt, float w){ vec2 t = treeParts(pt, w); return max(t.x, t.y); }
float busMask(vec2 l, float w){ return smoothstep(w, -w, sdBoxC(l - vec2(0.0, 1.72), vec2(5.25, 1.12)) - 0.25); }
`;
const GLSL_OUTSIDE = GLSL_CITY + `
uniform vec4 uStreetLamps[6];   // xyz, w = intensity
uniform vec4 uCars[4];          // x, z(lane), heading(+-1), intensity
// ---- the world at this hour (computed once per frame in JS, see WORLD) ----
uniform vec3 uSkyZ, uSkyH;      // overcast sky radiance at the zenith / at the horizon
uniform vec3 uGlow;             // city light reflected by the cloud base, near the horizon
uniform vec3 uEVert, uEGround;  // sky irradiance on a facade / on the street
uniform float uOcc;             // fraction of homes with a light on
uniform float uLampsOut;        // street lamp output 0..1 (incl. sodium warm-up)
uniform vec3 uLampTint;         // street lamp colour (pinkish while warming up, then sodium orange)
uniform float uShopsLit;        // spill of shop light onto the street (shops open and the light needed)
uniform float uDark;            // 0 by day .. 1 after dark (signboards lit)
uniform float uTod;             // hour of the day
uniform float uSnow;            // snow cover 0..1 (winter)
uniform float uLeafFall;        // autumn: leaves falling from the plane tree
vec3 snowLit(vec3 E){ return vec3(0.78, 0.8, 0.84) * E / PI; }   // fresh snow, lit by whatever lights the surface
vec3 skyCol(vec3 rd){
  float e = rd.y;
  vec3 mid = mix(uSkyH, uSkyZ, 0.55);
  vec3 c = mix(uSkyH, mid, smoothstep(-0.02, 0.2, e));
  c = mix(c, uSkyZ, smoothstep(0.18, 0.75, e));
  vec2 cp = rd.xz / max(e + 0.12, 0.06) * 0.8 + vec2(uTime * 0.006, 0.0);
  float cl = fbm3(cp);
  c *= 0.8 + 0.4 * cl;
  c += uGlow * exp(-max(e, 0.0) * 7.0) * (0.6 + 0.6 * cl);   // sodium skyglow on the cloud base
  return c;
}
float rectSoft(vec2 p, vec2 hs, vec2 w){
  vec2 q = abs(p) - hs;
  return smoothstep(w.x, -w.x, q.x) * smoothstep(w.y, -w.y, q.y);
}
vec3 windowLight(float id, vec2 cell){
  float k = fract(id * 13.7);
  vec3 warm = vec3(1.0, 0.70, 0.40), fluo = vec3(0.62, 0.92, 0.92), tv = vec3(0.45, 0.6, 1.0), curt = vec3(0.95, 0.42, 0.18);
  vec3 c = k < 0.62 ? warm : k < 0.82 ? fluo : k < 0.9 ? curt : tv;
  float I = 0.18 + 0.32 * fract(id * 71.3);
  if (k >= 0.9) I *= 0.6 + 0.4 * sin(uTime * (2.0 + 3.0 * fract(id * 5.1)) + id) * sin(uTime * 0.7 + id * 3.0);
  return c * I;
}
// 每个表面 = 反照率 ×（天光 + 路灯 + 商铺溢光）/ π + 自发光（灯窗、营业中的铺面、天黑后点亮的招牌）。
// 傍晚的照度与第一期的画面定标一致；白天楼面现出颜色，夜里只剩灯。
vec3 facade(vec3 p, vec2 bw){
  float fx = p.x, fy = p.y - GROUND_Y;
  float bi = floor(fx / 9.0);
  float bs = bi + uCity;                 // hash key of this block (the layout differs per visit)
  float hb = hash11(bs * 3.17 + 0.3);
  vec3 alb = mix(vec3(0.16, 0.16, 0.17), vec3(0.31, 0.28, 0.25), hb);          // wet concrete, old tiles, faded paint
  alb *= mix(vec3(1.0), vec3(1.0, 0.92, 0.82), step(0.7, fract(hb * 7.0)));    // one block in yellowed cream paint
  alb *= 0.85 + 0.3 * vnoise(vec2(fx * 0.6, fy * 0.25) + bs * 7.0);              // rain streaks, old repairs
  float glow = 0.0;
  for (int i = 0; i < 4; i++){ float dx = fx - uStreetLamps[i].x; glow += uStreetLamps[i].w * exp(-dx * dx * 0.012); }
  vec3 E = uEVert + (uLampTint * 0.28 * glow * uLampsOut + vec3(1.0, 0.82, 0.62) * 0.21 * uShopsLit) * exp(-fy * 0.32);
  vec3 c = alb * E / PI;
  float wx = fx - bi * 9.0;
  // upper floors: 3 windows per block, 3 m floors
  if (fy > 3.6){
    float row = floor((fy - 3.6) / 3.0);
    float colI = floor(wx / 3.0);
    vec2 lc = vec2(fract(wx / 3.0) - 0.5, fract((fy - 3.6) / 3.0) - 0.48) * 3.0;
    float id = hash12(vec2(bs * 5.0 + colI, row + 11.0));
    vec2 hs = vec2(0.58 + 0.12 * hb, 0.68);
    float m = rectSoft(lc, hs, bw + 0.03);
    // a home's light is on when its hash falls under the hour's occupancy; a few also switch on and off over the minutes
    bool lit = id < uOcc;
    if (fract(id * 53.1) < 0.2) lit = lit ^^ (fract(uTime / (50.0 + 110.0 * fract(id * 7.7)) + id * 5.0) > 0.7);
    float cid = fract(id * 7.31) * 0.4;
    vec3 wc = lit ? windowLight(cid, lc) : uEVert * 0.012 + skyCol(vec3(0.0, 0.25, -1.0)) * 0.25;
    // curtains / blinds inside lit windows: break up the flat rectangles
    if (lit) wc *= 0.7 + 0.3 * smoothstep(-0.4, 0.4, sin(lc.x * 2.2 + cid * 40.0) + (fract(cid * 9.0) - 0.5) * 2.0);
    c = mix(c, wc, m);
    if (lit) c += wc * 0.06 * rectSoft(lc, hs, bw + 0.6);                      // rain-scattered glow
    c = mix(c, snowLit(E * 1.3), uSnow * rectSoft(lc - vec2(0.0, -hs.y - 0.07), vec2(hs.x + 0.1, 0.05), bw + 0.02));   // snow on the sills
  }
  // ground floor: shopfronts with signboards
  float shop = hash11(bs * 1.93 + 4.0);
  if (shop > 0.25){
    float si = floor(wx / 4.5);
    float sh2 = hash11(bs * 7.7 + si * 3.1);
    vec2 sc = vec2(fract(wx / 4.5) * 4.5 - 2.25, fy - 1.5);
    float has = step(0.3, sh2);
    float m = rectSoft(sc, vec2(1.75, 1.15), bw + 0.03) * has;
    // each shop keeps its own hours; when closed the corrugated shutter comes all the way down
    float openT = 7.0 + 2.5 * fract(sh2 * 5.1), closeT = 20.0 + 3.5 * fract(sh2 * 9.7);
    float open = step(openT, uTod) * step(uTod, closeT);
    float level = open > 0.5 ? (fract(sh2 * 3.3) > 0.75 ? 0.3 : 1.4) : -1.3;
    float shutter = smoothstep(-0.1, 0.1, sc.y - level);
    vec3 lit = (sh2 > 0.45 ? vec3(1.0, 0.74, 0.46) : vec3(0.78, 0.92, 0.88)) * (0.14 + 0.22 * fract(sh2 * 31.0)) * open;
    lit *= 0.7 + 0.3 * smoothstep(-1.2, 1.0, sc.y) * (0.8 + 0.2 * sin(sc.x * 1.7 + sh2 * 9.0));   // ceiling lights, depth
    lit *= 1.0 - 0.55 * smoothstep(0.35, 0.05, abs(sc.x - 0.6 * fract(sh2 * 17.0))) * smoothstep(0.3, -0.6, sc.y) * step(0.5, fract(sh2 * 13.0)); // a figure
    lit += uEVert * 0.02;
    vec3 shut = vec3(0.30, 0.30, 0.32) * E / PI * (0.85 + 0.15 * sin(sc.y * 55.0));
    c = mix(c, mix(lit, shut, shutter), m);
    vec2 sb = vec2(wx - 4.5, fy - 3.15);
    float ms = rectSoft(sb, vec2(3.9, 0.32), bw + 0.02);
    vec3 boardA = fract(shop * 5.3) < 0.5 ? vec3(0.50, 0.06, 0.05) : fract(shop * 5.3) < 0.8 ? vec3(0.06, 0.17, 0.45) : vec3(0.62, 0.47, 0.09);
    float chars = 0.6 + 0.4 * smoothstep(0.2, 0.8, sin(sb.x * 5.0 + shop * 20.0) * sin(sb.y * 14.0));
    float signOn = uDark * step(7.0, uTod) * step(uTod, 23.0);                  // lit from dusk until the street sleeps
    vec3 boardE = boardA * 0.55 * chars * signOn;
    c = mix(c, boardA * chars * E / PI + boardE, ms);
    c += (lit * 0.06 * has + boardE * 0.06) * rectSoft(sc, vec2(1.75, 1.15), bw + 1.2);
  }
  return c;
}
vec3 farCity(vec3 p, float bw){
  float i = floor(p.x / 26.0);
  float top = GROUND_Y + farTop(p.x);
  float m = smoothstep(bw, -bw, p.y - top);
  vec3 c = vec3(0.22, 0.23, 0.25) * uEVert / PI;
  // sparse lit windows statistically averaged once defocused
  vec2 g = vec2(p.x / 2.6, (p.y - GROUND_Y) / 3.2);
  float on = step(1.0 - 0.45 * uOcc, hash12(floor(g) + i * 31.0));
  float dotM = rectSoft(fract(g) - 0.5, vec2(0.22, 0.2), vec2(bw / 2.6, bw / 3.2) + 0.02);
  float avg = 0.18 * 0.18 * 0.35 * uOcc / 0.4;
  float lights = mix(on * dotM, avg * 4.0, smoothstep(0.4, 2.0, bw));
  c += vec3(1.0, 0.72, 0.42) * 0.22 * lights;
  return c * m;
}
// everything that is not the ground plane
vec3 aboveGround(vec3 ro, vec3 rd, float blur, out float dist){
  vec3 c = skyCol(rd);
  dist = 400.0;
  if (rd.z > -0.03) return mix(c, skyCol(vec3(rd.x, 0.02, -0.5)) * 0.8, 0.6);
  // far skyline
  float tf = (FAR_Z - ro.z) / rd.z;
  vec3 pf = ro + rd * tf;
  float bwf = blur * tf;
  float h = GROUND_Y + farTop(pf.x);
  float hL = GROUND_Y + farTop(pf.x - bwf), hR = GROUND_Y + farTop(pf.x + bwf);
  float mf = (smoothstep(bwf, -bwf, pf.y - h) * 2.0 + smoothstep(bwf, -bwf, pf.y - hL) + smoothstep(bwf, -bwf, pf.y - hR)) * 0.25;
  c = mix(c, mix(farCity(pf, bwf), snowLit(uEVert * 1.2) * mf, uSnow * 0.6 * smoothstep(h - 1.5 - bwf, h - 0.6 + bwf, pf.y)), mf);
  c = mix(c, skyCol(vec3(rd.x, 0.02, rd.z)) * 0.9, mf * 0.55);       // heavy rain haze on far blocks
  if (mf > 0.5) dist = tf;
  // opposite buildings
  float tb = (FACADE_Z - ro.z) / rd.z;
  vec3 pb = ro + rd * tb;
  float bw = blur * tb;
  float topY = GROUND_Y + bldTop(pb.x);
  float topL = GROUND_Y + bldTop(pb.x - bw), topR = GROUND_Y + bldTop(pb.x + bw);
  float mb = (smoothstep(bw, -bw, pb.y - topY) * 2.0 + smoothstep(bw, -bw, pb.y - topL) + smoothstep(bw, -bw, pb.y - topR)) * 0.25;
  vec3 fc = facade(pb, vec2(bw));
  fc = mix(fc, snowLit(uEVert * 1.5 + uLampTint * 0.1 * uLampsOut), uSnow * smoothstep(topY - 0.45 - bw, topY - 0.3 + bw, pb.y));   // snow on the roofs
  fc = mix(fc, skyCol(vec3(rd.x, 0.02, rd.z)) * 0.8, 1.0 - exp(-tb * 0.012));
  c = mix(c, fc, mb);
  if (mb > 0.5) dist = tb;
  return c;
}
// people walking under umbrellas on the far pavement (silhouettes against the lit shops)
uniform vec4 uPeds[5];          // x, z, umbrella kind, gait phase   (x > 900: nobody)
vec4 pedestrians(vec3 ro, vec3 rd, float blur, float tLimit){
  vec4 acc = vec4(0.0);
  for (int i = 0; i < 5; i++){
    vec4 pd = uPeds[i];
    if (pd.x > 900.0) continue;
    float t = (pd.y - ro.z) / rd.z;
    if (t <= 0.0 || t > tLimit) continue;
    vec2 l = vec2(ro.x + rd.x * t - pd.x, ro.y + rd.y * t - GROUND_Y);
    if (abs(l.x) > 1.6 || l.y < -0.3 || l.y > 2.8) continue;
    float w = blur * t + 0.015;
    vec2 ub = vec2(l.x, l.y - 0.025 * abs(sin(pd.w)));
    float umb = smoothstep(1.0 + w * 2.5, 1.0 - w * 2.5, length(vec2(ub.x / 0.52, (ub.y - 1.93) / 0.30))) * smoothstep(1.90 - w, 1.93 + w, ub.y);
    float body = smoothstep(w, -w, sdSegC(ub, vec2(0.0, 0.85), vec2(0.0, 1.5)) - 0.2);
    body = max(body, smoothstep(w, -w, length(ub - vec2(0.0, 1.66)) - 0.1));
    float sw = 0.13 * sin(pd.w);
    body = max(body, smoothstep(w, -w, min(sdSegC(l, vec2(0.06 + sw, 0.0), vec2(0.07, 0.86)), sdSegC(l, vec2(-0.06 - sw, 0.0), vec2(-0.07, 0.86))) - 0.065));
    body = max(body, smoothstep(w, -w, sdSegC(ub, vec2(0.12, 1.2), vec2(0.0, 1.93)) - 0.012));
    float glow = 0.0;
    for (int k = 0; k < 4; k++){ float dx = pd.x - uStreetLamps[k].x; glow += exp(-dx * dx * 0.01); }
    vec3 Lt = uLampTint * (0.05 + 0.18 * glow) * uLampsOut + uEVert * 0.25 + vec3(0.03, 0.025, 0.02) * uShopsLit;
    float kind = pd.z;
    bool clear = kind > 1.5 && kind < 2.5;
    vec3 uc = kind < 0.5 ? vec3(0.03) : kind < 1.5 ? vec3(0.55, 0.05, 0.04) : clear ? vec3(0.62, 0.62, 0.60) : kind < 3.5 ? vec3(0.06, 0.08, 0.20) : vec3(0.60, 0.42, 0.10);
    vec3 umbC = uc * Lt * (0.7 + 0.5 * smoothstep(1.93, 2.2, ub.y));
    if (clear) umbC += vec3(1.0, 0.85, 0.65) * 0.12;          // a clear plastic umbrella glows with the shop light behind it
    float a = max(umb * (clear ? 0.6 : 1.0), body);
    vec3 col = umb > body ? umbC : vec3(0.012, 0.012, 0.014) + Lt * 0.05;
    acc.rgb += (1.0 - acc.a) * col * a;
    acc.a += (1.0 - acc.a) * a;
  }
  return acc;
}
// an old bus now and then: lit windows with a few passengers, an amber destination sign
vec4 busLayer(vec3 ro, vec3 rd, float blur){
  if (uBus.w <= 0.0) return vec4(0.0);
  float t = (uBus.y - ro.z) / rd.z;
  if (t <= 0.0) return vec4(0.0);
  vec2 l = vec2(ro.x + rd.x * t - uBus.x, ro.y + rd.y * t - GROUND_Y);
  float w = blur * t + 0.02;
  float m = busMask(l, w);
  if (m <= 0.0) return vec4(0.0);
  float wx = l.x * uBus.z;                                   // along the direction of travel
  vec3 Eb = uEVert + uLampTint * 0.12 * uLampsOut;
  vec3 col = vec3(0.15, 0.42, 0.38) * Eb / PI * (1.0 + 0.6 * smoothstep(1.2, 0.4, l.y));
  col = mix(col, vec3(0.6, 0.08, 0.06) * Eb / PI + vec3(0.1, 0.015, 0.01) * uDark, smoothstep(w, -w, abs(l.y - 1.2) - 0.05));   // the route-colour stripe
  float win = smoothstep(w, -w, abs(l.y - 1.95) - 0.55) * smoothstep(w, -w, abs(wx + 0.4) - 4.4);
  float cell = floor(wx / 1.15 + 0.5);
  float pillar = smoothstep(0.07 + w, 0.07 - w, abs(fract(wx / 1.15 + 0.5) - 0.5) * 1.15);
  vec2 rp = l - vec2(cell * 1.15 * uBus.z + 0.2 * (hash11(cell * 9.1) - 0.5), 1.62);
  float rider = step(hash11(cell * 3.7 + 11.0), 0.3) * smoothstep(w, -w, min(length(rp - vec2(0.0, 0.18)) - 0.11, sdBoxC(rp + vec2(0.0, 0.12), vec2(0.2, 0.18)) - 0.05));
  vec3 inside = vec3(1.0, 0.86, 0.62) * 0.42 * (0.7 + 0.3 * hash11(cell * 5.3)) * (1.0 - 0.3 * smoothstep(1.6, 2.4, l.y)) * (1.0 - 0.85 * rider);
  col = mix(col, inside, win * (1.0 - pillar));
  float sign = smoothstep(w, -w, sdBoxC(vec2(wx - 4.75, l.y - 2.7), vec2(0.42, 0.13)));
  col = mix(col, vec3(1.0, 0.55, 0.12) * 1.3, sign);
  float wheels = smoothstep(w, -w, min(length(vec2(wx - 3.3, l.y - 0.5)), length(vec2(wx + 3.3, l.y - 0.5))) - 0.48);
  col = mix(col, vec3(0.006), wheels);
  return vec4(col * uBus.w * m, m);
}
vec3 treeCol(vec2 pt, vec2 parts){
  // dark foliage against the dusk; only the undersides nearest the sodium lamp (just left of the view) catch its light
  float under = smoothstep(GROUND_Y + 7.4, GROUND_Y + 5.2, pt.y);
  vec2 dl = pt - vec2(-4.6, GROUND_Y + 6.0);
  float cluster = smoothstep(0.35, 0.75, vnoise(pt * 2.6 + 1.7));
  vec3 alb = uLeaf.yzw * (0.7 + 0.6 * cluster);
  alb = mix(alb, vec3(0.14, 0.06, 0.02), 0.35 * smoothstep(0.6, 0.9, vnoise(pt * 4.0 + 9.0)) * step(0.2, uLeaf.y));   // autumn: some leaves already brown
  vec3 lamp = vec3(1.0, 0.75, 0.3) * 0.25 * under / (1.0 + dot(dl, dl) * 0.15) * uLampsOut;
  vec3 leaves = alb * (uEVert * (1.0 - 0.4 * under) + lamp) / PI;
  vec3 bark = vec3(0.05, 0.045, 0.04) * (uEVert * 0.7 + lamp) / PI;
  bark = mix(bark, snowLit(uEVert * 1.2 + lamp), uSnow * 0.4 * smoothstep(0.55, 0.75, vnoise(pt * vec2(3.0, 7.0))));   // snow lodged on the boughs
  return parts.x >= parts.y ? leaves : bark;
}

vec3 outside(vec3 ro, vec3 rd, float blur){
  float dist;
  vec3 c = aboveGround(ro, rd, blur, dist);
  float tGround = 1e9;
  if (rd.y < -1e-3 && rd.z < -0.02){
    float tg = min((GROUND_Y - ro.y) / rd.y, 600.0);
    vec3 pg = ro + rd * tg;
    float tb = (FACADE_Z - ro.z) / rd.z;
    // street: wet asphalt, far sidewalk, light pools; mirror reflection of the facades
    float side = smoothstep(CURB_Z + 0.1, CURB_Z - 0.1, pg.z);
    vec3 alb = mix(vec3(0.06, 0.06, 0.07), vec3(0.16, 0.15, 0.14), side);       // wet asphalt / paving
    vec3 E = vec3(0.0);
    for (int i = 0; i < 6; i++){
      vec2 dd = pg.xz - uStreetLamps[i].xz;
      E += uLampTint * uLampsOut * uStreetLamps[i].w * 9.0 / (dot(dd, dd) + 40.0);
    }
    for (int i = 0; i < 4; i++){
      if (uCars[i].w <= 0.0) continue;
      vec2 dd = vec2((pg.x - uCars[i].x) * uCars[i].z - 9.0, (pg.z - uCars[i].y) * 3.0);
      E += vec3(1.0, 0.9, 0.75) * uCars[i].w * 0.6 * exp(-dot(dd, dd) * 0.02) * step(0.0, (pg.x - uCars[i].x) * uCars[i].z);
    }
    vec3 rr = vec3(rd.x, -rd.y, rd.z);
    float rdist;
    float rough = 0.04 + 0.03 * fbm3(pg.xz * 0.15);
    vec3 refl = aboveGround(pg, rr, blur + rough, rdist);
    vec4 rp = pedestrians(pg, rr, blur + rough, 1e9); refl = refl * (1.0 - rp.a) + rp.rgb;
    vec4 rbus = busLayer(pg, rr, blur + rough); refl = refl * (1.0 - rbus.a) + rbus.rgb;
    tGround = tg;
    float fres = 0.02 + 0.98 * pow(1.0 - min(-rd.y * 1.0, 1.0), 5.0);
    float puddle = smoothstep(0.42, 0.62, fbm3(pg.xz * vec2(0.18, 0.5)));
    vec3 gc = alb / PI * (uEGround + 1.86 * E) + refl * fres * mix(0.45, 0.95, puddle);
    if (uSnow > 0.0){
      float tracks = 0.0;
      for (int k = 0; k < 4; k++){ float lz = k == 0 ? -6.0 : k == 1 ? -9.5 : k == 2 ? -17.4 : -21.9; tracks = max(tracks, smoothstep(0.35, 0.15, abs(abs(pg.z - lz) - 0.75))); }
      float cover = uSnow * (1.0 - 0.85 * tracks * (1.0 - side)) * (0.85 + 0.15 * vnoise(pg.xz * 1.3));
      gc = mix(gc, snowLit(uEGround + 1.86 * E), cover);
    }
    float m = smoothstep(-blur * tb, blur * tb, (ro.y + rd.y * tb) - GROUND_Y);
    gc = mix(gc, skyCol(vec3(rd.x, 0.02, rd.z)) * 0.7, 1.0 - exp(-tg * 0.012));
    c = mix(gc, c, m);
  }
  vec4 pe = pedestrians(ro, rd, blur, tGround); c = c * (1.0 - pe.a) + pe.rgb;
  vec4 bu = busLayer(ro, rd, blur); c = c * (1.0 - bu.a) + bu.rgb;
  float tt = (TREE_Z - ro.z) / rd.z;                          // the tree: nearest of all
  if (tt > 0.0 && rd.z < -0.02){
    vec2 pt = ro.xy + rd.xy * tt;
    vec2 parts = treeParts(pt, blur * tt * 0.5 + 0.015);
    c = mix(c, treeCol(pt, parts), max(parts.x, parts.y));
  }
  // autumn: plane-tree leaves let go and tumble down past the window
  if (uLeafFall > 0.0){
    for (int i = 0; i < 9; i++){
      float fi = float(i), h1 = hash11(fi * 7.3), h2 = hash11(fi * 3.1 + 2.0);
      float T = 7.0 + 5.0 * h2, ph = fract(uTime / T + h1);
      float lz = TREE_Z + 0.6 - 1.6 * h2;
      vec3 lp = vec3(-3.2 + 3.4 * h1 + 0.6 * sin(ph * 9.0 + fi) + uWindNow * ph * 2.5, GROUND_Y + 7.2 - ph * 7.4, lz);
      float t = (lz - ro.z) / rd.z;
      if (t <= 0.0) continue;
      vec2 d = (ro.xy + rd.xy * t) - lp.xy;
      float a = uTime * (2.0 + 2.0 * h1) + fi;
      d = vec2(cos(a) * d.x - sin(a) * d.y, sin(a) * d.x + cos(a) * d.y);
      float wl = blur * t + 0.01;
      float m = smoothstep(wl, -wl, length(d / vec2(0.07, 0.035 + 0.03 * abs(sin(a * 0.7)))) * 0.05 - 0.05) * uLeafFall;
      c = mix(c, uLeaf.yzw * (uEVert + vec3(1.0, 0.7, 0.3) * 0.3 * uLampsOut) / PI * 1.3, m);
    }
  }
  return c;
}
`;

const FS_OUTSIDE = () => GLSL_HEAD() + GLSL_OUTSIDE + `
uniform int uMode;           // 0: equirect wide (sharp, for drop refraction), 1: camera view (defocused)
uniform vec2 uRes;
uniform vec3 uEye, uCamFwd, uCamRight, uCamUp;
uniform vec2 uTan;
uniform float uBlur;         // angular blur radius (rad)
uniform float uRain, uAperture, uFocus;
out vec4 o;
// 窗外几米处正在落下的雨：只有被背后的灯照亮时才看得见（前向散射），所以亮度正比于背后的光；
// 短而虚（离焦 + 快门拖影），按三层深度分布，随风略斜。
float rainStreaks(vec3 rd){
  // in angular units: width ≈ defocus CoC = A·|1/z − 1/z_f|, length ≈ fall speed × 1/50 s shutter / z.
  // vertically stretched value noise, sharpened → sparse soft streaks without any grid structure
  float L = 0.0;
  vec2 tp = vec2(rd.x, rd.y) / max(-rd.z, 0.2);
  for (int k = 0; k < 3; k++){
    float z = 3.6 * pow(1.75, float(k));                    // 3.6, 6.3, 11 m from the eye
    float coc = max(uAperture * abs(1.0 / z - 1.0 / uFocus), 0.002);
    float len = 6.2 * 0.02 / z;
    vec2 q = vec2((tp.x + tp.y * (0.07 + 0.3 * uWindNow)) / (coc * 1.3), (tp.y + uTime * 6.2 / z) / (len * 1.1));
    float n = vnoise(q + float(k) * 37.0);
    L += pow(n, 7.0) * (1.0 - 0.25 * float(k));
  }
  return L;
}
// 雪：慢慢飘落的雪花（约 1 m/s，随风左右摆），在近处离焦成柔和的圆斑；它们反射照在身上的光（天光、路灯）
vec3 snowFlakes(vec3 rd){
  vec3 L = vec3(0.0);
  vec2 tp = rd.xy / max(-rd.z, 0.2);
  vec3 lightF = (uEVert * 0.9 + uLampTint * 0.12 * uLampsOut + uGlow * 2.0) * 0.8 / PI;
  for (int k = 0; k < 4; k++){
    float z = 2.6 * pow(1.8, float(k));
    float coc = max(uAperture * abs(1.0 / z - 1.0 / uFocus), 0.0012);
    float cell = max(coc * 4.5, 0.01);
    vec2 q = tp;
    q.y += uTime * 0.9 / z;
    q.x += (0.25 * sin(uTime * 0.6 + q.y * 2.0 + float(k)) + uWindNow * uTime * 0.7) / z;
    vec2 g = q / cell, id = floor(g), f = fract(g) - 0.5;
    vec3 h = hash32(id + float(k) * 19.0);
    if (h.z > 0.5) continue;
    float r = length(f - (h.xy - 0.5) * 0.5) * cell;
    L += lightF * smoothstep(coc + 0.0008, coc * 0.6, r) * (0.35 + 0.4 * h.x) * (1.0 - 0.18 * float(k));
  }
  return L;
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 rd;
  if (uMode == 0){
    float az = (uv.x * 2.0 - 1.0) * AZM, el = mix(ELMIN, ELMAX, uv.y);
    rd = vec3(sin(az) * cos(el), sin(el), -cos(az) * cos(el));
  } else {
    vec2 ndc = uv * 2.0 - 1.0;
    rd = normalize(uCamFwd + ndc.x * uTan.x * uCamRight + ndc.y * uTan.y * uCamUp);
  }
  vec3 c = outside(uEye, rd, uBlur);
  if (uMode == 1){
    if (uSnow > 0.0) c += snowFlakes(rd) * uSnow * (0.4 + 0.8 * uRain);
    else c *= 1.0 + rainStreaks(rd) * 0.75 * uRain;
  }
  o = vec4(c, 1.0);
}
`;

// point lights of the street, drawn as energy-conserving sprites
const VS_SPRITE = () => GLSL_HEAD() + GLSL_CITY + `
layout(location = 0) in vec4 aPos;     // xyz world position, w core radius (m)
layout(location = 1) in vec4 aE;       // rgb irradiance at the eye (∫L dΩ), a vertical elongation
layout(location = 2) in vec4 aX;       // x halo fraction, y halo radius (rad), z flags (1: far city light, 2: on a far roof top)
uniform int uMode;
uniform vec2 uRes;
uniform vec3 uEye, uCamFwd, uCamRight, uCamUp;
uniform vec2 uTan;
uniform float uCoC;                    // defocus disc radius (rad)
out vec2 vLocal; out vec3 vE; out vec4 vShape; out vec2 vNdc;
void main(){
  int vid = gl_VertexID;
  vec2 corner = vec2(float(vid & 1), float((vid >> 1) & 1)) * 2.0 - 1.0;
  vec3 wp = aPos.xyz;
  float vis = 1.0;
  if (aX.z > 0.5){
    // far-city light: must sit on a tower (below its roof) and not be hidden by the opposite row
    float top = GROUND_Y + farTop(wp.x);
    if (aX.z > 1.5) wp.y = top + 1.2; else vis *= step(wp.y, top - 1.0);
    vec3 dd = wp - uEye;
    float tb = (FACADE_Z - uEye.z) / dd.z;
    float yb = uEye.y + dd.y * tb, xb = uEye.x + dd.x * tb;
    vis *= smoothstep(-0.25, 0.25, yb - (GROUND_Y + bldTop(xb)));
  }
  {
    vec3 dd = wp - uEye;
    if (wp.z < TREE_Z && dd.z < 0.0){ vec2 pt = uEye.xy + dd.xy * ((TREE_Z - uEye.z) / dd.z); vis *= 1.0 - 0.92 * treeAlpha(pt, 0.06); }
    if (uBus.w > 0.0 && wp.z < uBus.y - 0.3 && dd.z < 0.0){
      vec2 pt = uEye.xy + dd.xy * ((uBus.y - uEye.z) / dd.z);
      vis *= 1.0 - 0.95 * busMask(vec2(pt.x - uBus.x, pt.y - GROUND_Y), 0.1);
    }
  }
  vec3 d = wp - uEye; float dist = length(d); vec3 dir = d / dist;
  vec2 c; float pxPerRad; vec2 aspect;
  if (uMode == 0){
    float az = atan(dir.x, -dir.z), el = asin(clamp(dir.y, -1.0, 1.0));
    c = vec2(az / AZM, (el - ELMIN) / (ELMAX - ELMIN) * 2.0 - 1.0);
    pxPerRad = uRes.x / (2.0 * AZM);
    aspect = vec2(1.0 / AZM, 2.0 / (ELMAX - ELMIN));          // ndc per radian
  } else {
    float z = dot(d, uCamFwd);
    c = vec2(dot(d, uCamRight) / z / uTan.x, dot(d, uCamUp) / z / uTan.y);
    if (z < 0.1) c = vec2(9.0);
    pxPerRad = uRes.y * 0.5 / uTan.y;
    aspect = vec2(1.0 / uTan.x, 1.0 / uTan.y);
  }
  float core = max(aPos.w / dist, 0.7 / pxPerRad);           // angular core radius, at least ~1px
  float disc = uMode == 1 ? max(uCoC, core) : core;
  float elong = aE.a;
  float halo = aX.y;
  vec2 ext = vec2(max(disc, halo * 3.2), max(disc * elong, halo * 3.2 * mix(1.0, elong, 0.5)) * 1.05);
  vLocal = corner * ext;                                      // in radians
  vE = aE.rgb * vis;
  if (vis <= 0.0) c = vec2(9.0);
  vShape = vec4(disc, elong, aX.x, halo);
  vNdc = c;
  gl_Position = vec4(c + corner * ext * aspect, 0.0, 1.0);
}`;
const FS_SPRITE = () => GLSL_HEAD() + `
in vec2 vLocal; in vec3 vE; in vec4 vShape; in vec2 vNdc;
uniform int uMode;
out vec4 o;
void main(){
  float R = vShape.x, elong = vShape.y, hf = vShape.z, hr = vShape.w;
  vec2 q = vLocal;
  // body: defocused disc (mode 1) or sharp core (mode 0); elongated for wet-road reflections
  vec2 qe = vec2(q.x, q.y / elong);
  float r = length(qe) / R;
  vec3 body;
  if (uMode == 1){
    // 肥皂泡式 bokeh：边缘略亮（老镜头球差），轴向色差使 R/B 圆盘半径略不同，边缘柔化约 6%。
    vec3 rad = vec3(1.012, 1.0, 0.985);
    vec3 disc = smoothstep(rad, rad - 0.07, vec3(r));
    float rim = 1.0 + 0.28 * smoothstep(0.55, 0.97, r);
    // cat's eye: clipped by a second circle offset toward the frame centre (mechanical vignetting)
    vec2 off = vNdc * R * 0.55;
    float r2 = length((qe + off)) / (R * 1.08);
    float cat = smoothstep(1.0, 0.93, r2);
    body = vE * disc * rim * cat / (PI * R * R * elong * 1.06);
    // reflections on the rough, rain-pocked road are soft streaks rather than crisp ellipses
    float soft = smoothstep(1.5, 3.0, elong);
    float sg = R * 0.62;
    vec3 streak = vE * exp(-dot(qe, qe) / (2.0 * sg * sg)) / (2.0 * PI * sg * sg * elong);
    body = mix(body, streak, soft);
  } else {
    float s = R * 0.8;
    body = vE * exp(-dot(qe, qe) / (2.0 * s * s)) / (2.0 * PI * s * s * elong);
  }
  // forward-scattering halo in the rain (focus independent)
  float hh = hr * (uMode == 1 ? 1.15 : 1.0);
  vec2 qh = vec2(q.x, q.y / mix(1.0, elong, 0.5));
  vec3 halo = vE * hf * exp(-dot(qh, qh) / (2.0 * hh * hh)) / (2.0 * PI * hh * hh);
  o = vec4((body * (1.0 - hf) + halo), 1.0);
}`;

// --------------------------------------------------------------------------
// interior seen in reflections (glass, drops): an analytic stand-in for the room
// --------------------------------------------------------------------------
const GLSL_INTERIOR = `
vec3 interiorRad(vec3 ro, vec3 rd){
  // lamp shade: closest approach of the ray to the lamp axis, compared with the shade's tapered radius
  vec2 oc = ro.xz - vec2(LAMP_X, LAMP_Z);
  float a = max(dot(rd.xz, rd.xz), 1e-5);
  float tc = max(-dot(oc, rd.xz) / a, 0.0);
  float rad = length(oc + rd.xz * tc);
  float ys = ro.y + rd.y * tc - DESK_TOP;
  float yr = sat((ys - SHADE_Y0) / (SHADE_Y1 - SHADE_Y0));
  float rsh = mix(SHADE_R0, SHADE_R1, yr);
  // the mirror image of the shade lies ~0.6 m behind the glass the lens focuses on → its edges are defocused (~3 cm)
  float shadeM = smoothstep(rsh + 0.03, rsh - 0.03, rad) * smoothstep(-0.03, 0.03, ys - SHADE_Y0) * smoothstep(0.03, -0.03, ys - SHADE_Y1);
  float tS = shadeM > 0.0 ? tc : 1e9;
  // room box + desk top
  // (signed-zero safe: a direction component of -0.0 must not produce -Inf distances)
  float tx = rd.x < 0.0 ? (ROOM_X0 - ro.x) / min(rd.x, -1e-5) : (ROOM_X1 - ro.x) / max(rd.x, 1e-5);
  float ty = rd.y < 0.0 ? (0.0 - ro.y) / min(rd.y, -1e-5) : (ROOM_H - ro.y) / max(rd.y, 1e-5);
  float tz = (ROOM_Z1 - ro.z) / max(rd.z, 1e-4);
  float tB = min(tx, min(ty, tz));
  float tD = rd.y < -1e-5 ? (DESK_TOP - ro.y) / rd.y : 1e9;
  vec3 pd = ro + rd * tD;
  if (pd.x < DESK_X0 || pd.x > DESK_X1 || pd.z > DESK_Z1) tD = 1e9;
  vec3 shadeC = shadeM > 0.0 ? shadeRadiance(vec3(LAMP_X + rsh, DESK_TOP + ys, LAMP_Z)) * shadeM : vec3(0.0);
  vec3 p, n, alb;
  if (tD < tB){ p = pd; n = vec3(0.0, 1.0, 0.0); alb = vec3(0.07, 0.035, 0.018); }
  else {
    p = ro + rd * tB;
    if (tB == tx){ n = vec3(-sign(rd.x), 0.0, 0.0); alb = vec3(0.42, 0.42, 0.33); }
    else if (tB == ty){ n = vec3(0.0, -sign(rd.y), 0.0); alb = rd.y > 0.0 ? vec3(0.5) : vec3(0.1, 0.07, 0.045); }
    else { n = vec3(0.0, 0.0, -1.0); alb = vec3(0.38, 0.37, 0.3); }
  }
  vec3 L = BULB - p; float d2 = dot(L, L); vec3 l = L * inversesqrt(d2);
  vec3 E = uLampI * lampEmitFactor(-l) * max(dot(n, l), 0.0) / d2;
  E += uAmbL * 1.1 + uAmbS;
  vec3 room = alb / PI * E;
  return tS < min(tB, tD) ? mix(room, shadeC / max(shadeM, 1e-3), shadeM) : room;
}
`;

// --------------------------------------------------------------------------
// DROPS → height field. Each drop is a spherical cap (contact radius r, contact angle θ):
//   R = r / sinθ,  h(ρ) = sqrt(R² − ρ²) − R cosθ   (exact cap; edge slope = tanθ)
// Pinned drops get an irregular contact line (pinning on defects) and a downward bulge
// (on a vertical pane the advancing angle sits at the bottom). Sliding drops become
// tear-shaped: the receding (upper) contact line lags into a thinner tail.
// Heights are in physical mm and combined with MAX blending.
// --------------------------------------------------------------------------
const VS_DROP = () => GLSL_HEAD() + `
layout(location = 0) in vec4 aD;   // x, y (mm), r (mm), theta (rad)
layout(location = 1) in vec4 aM;   // motion dir.xy, elongation, seed
uniform vec2 uSimMM;
out vec2 vQ; flat out vec4 vA; flat out vec2 vDir;
void main(){
  int vid = gl_VertexID;
  vec2 corner = vec2(float(vid & 1), float((vid >> 1) & 1)) * 2.0 - 1.0;
  float r = aD.z, el = aM.z;
  vec2 dir = aM.xy, tail = -dir, side = vec2(-dir.y, dir.x);
  float m = 1.14;
  if (aD.w < 0.0){ el = 0.0; dir = vec2(0.0, -1.0); tail = vec2(0.0, 1.0); side = vec2(1.0, 0.0); }   // snowflake: plain square quad
  float u = corner.x > 0.0 ? r * (1.0 + el) * m : -r * (1.0 + 0.15 * el) * m;
  vec2 q = tail * u + side * (corner.y * r * m);
  vQ = q; vA = vec4(r, aD.w, aD.w < 0.0 ? aM.z : el, aM.w); vDir = aD.w < 0.0 ? aM.xy : dir;
  gl_Position = vec4((aD.xy + q) / uSimMM * 2.0 - 1.0, 0.0, 1.0);
}`;
const FS_DROP = () => GLSL_HEAD() + `
in vec2 vQ; flat in vec4 vA; flat in vec2 vDir;
uniform float uHScale;
out vec4 o;
void main(){
  float r = vA.x, th = vA.y, el = vA.z, seed = vA.w;
  if (th < 0.0){
    // a stellar dendrite: six arms, each with side branches at 60°; it shrinks into a bead of water as it melts
    float melt = el;
    vec2 q = vec2(dot(vQ, vDir), dot(vQ, vec2(-vDir.y, vDir.x))) / (r * (1.0 - 0.6 * melt));
    float rr = length(q);
    if (rr > 1.05) discard;
    float a = mod(atan(q.y, q.x), PI / 3.0) - PI / 6.0;
    vec2 w = rr * vec2(cos(a), sin(a));
    float d = abs(w.y) + max(w.x - 1.0, 0.0);
    for (int k = 0; k < 3; k++){
      float kk = 0.28 + 0.24 * float(k) + 0.06 * (seed - 0.5);
      vec2 o2 = vec2(w.x - kk, abs(w.y));
      float t = clamp(dot(o2, vec2(0.5, 0.866)), 0.0, (1.0 - kk) * 0.6);
      d = min(d, length(o2 - vec2(0.5, 0.866) * t));
    }
    float flake = max(smoothstep(0.1, 0.05, d), smoothstep(0.24, 0.16, rr)) * (1.0 - melt * melt * melt);
    float R = r * 0.45, hb = max(R * R - dot(vQ, vQ), 0.0);
    o = vec4(sqrt(hb) * 0.5 * melt * uHScale, flake, 0.0, 1.0);
    return;
  }
  float u = dot(vQ, -vDir), v = dot(vQ, vec2(-vDir.y, vDir.x));
  float slide = min(el * 2.0, 1.0);
  float ang = atan(v, u);
  float irr = 1.0 + (0.06 * sin(ang * 3.0 + seed * 6.2832) + 0.035 * sin(ang * 5.0 + seed * 19.1) + 0.012 * sin(ang * 9.0 + seed * 41.0)) * (1.0 - slide) * smoothstep(0.6, 2.6, r);
  float tailT = smoothstep(0.0, r * (1.0 + el), u);
  float uu = u > 0.0 ? u / (1.0 + el) : u / (1.0 + 0.15 * el);
  float vv = v / max(1.0 - 0.42 * el / (1.0 + el) * tailT, 0.3);
  float rho = length(vec2(uu, vv)) / (r * irr);
  if (rho >= 1.0) discard;
  float R = r / sin(th);
  float h = sqrt(max(R * R - rho * rho * r * r, 0.0)) - R * cos(th);
  // 重力压扁：接触半径超过毛细长度 l_c = sqrt(γ/ρg) ≈ 2.7 mm（Bond 数 > 1）时，水滴顶部变平、
  // 高度趋于饱和（≈ 2 l_c sin(θ/2)），只有边缘保持接触角处的曲率。用平顶轮廓 1−ρ⁴ 与球冠插值近似。
  float H = r * tan(th * 0.5);
  float Hsat = 2.0 * 2.7 * sin(th * 0.5) * 0.62;
  float squash = smoothstep(1.4, 3.6, r);
  float hFlat = min(H, Hsat) * (1.0 - pow(rho, 4.0)) * (1.0 + 0.6 * smoothstep(0.75, 1.0, rho) * (1.0 - rho) * 4.0);
  h = mix(h, min(h, hFlat), squash);
  h *= 1.0 + 0.24 * (-vQ.y / r) * (1.0 - slide);      // gravity bulge of pinned drops
  h *= mix(1.0, 0.42, tailT * slide);                   // thin receding tail
  o = vec4(max(h, 0.0) * uHScale, 0.0, 0.0, 1.0);
}`;

// optics of water and glass, and the paper-cuts on the inside of the panes (shared by the composite and the street view)
const GLSL_GLASS = `
const float NW = 1.333;     // water
float rectSoft(vec2 p, vec2 hs, vec2 w){ vec2 q = abs(p) - hs; return smoothstep(w.x, -w.x, q.x) * smoothstep(w.y, -w.y, q.y); }
const float NG = 1.52;      // soda-lime glass
// exact unpolarised Fresnel reflectance, n1 → n2, ci = cos(incidence) in medium n1
float fresnel(float ci, float n1, float n2){
  float s = n1 / n2 * sqrt(max(0.0, 1.0 - ci * ci));
  if (s >= 1.0) return 1.0;                               // total internal reflection
  float ct = sqrt(1.0 - s * s);
  float rs = (n1 * ci - n2 * ct) / (n1 * ci + n2 * ct);
  float rp = (n1 * ct - n2 * ci) / (n1 * ct + n2 * ci);
  return 0.5 * (rs * rs + rp * rp);
}
vec2 dirToEq(vec3 d){ return vec2(atan(d.x, -d.z) / AZM * 0.5 + 0.5, (asin(clamp(d.y, -1.0, 1.0)) - ELMIN) / (ELMAX - ELMIN)); }

// 窗花（角花）：红纸剪的扇形角花，贴在内侧玻璃的上角。d = distance from the pane's corner into the pane (m).
// Paper minus cut-outs: a scalloped rim, a ring of round holes, radial petal slits, a five-petal flower, an eye.
float paperCut(vec2 d, float R, float aa){
  if (d.x < -aa || d.y < -aa) return 0.0;
  float r = length(d), t = atan(d.y, d.x) / (PI * 0.5);                 // t: 0..1 across the quarter
  if (r > R * 1.02) return 0.0;
  float paper = smoothstep(aa, -aa, r - R * (0.935 + 0.05 * cos(t * PI * 14.0)));
  float holes = 0.0;
  float t1 = (fract(t * 13.0) - 0.5) / 13.0 * PI * 0.5 * r;              // arc length to the nearest hole centre
  holes = max(holes, smoothstep(aa, -aa, length(vec2(t1, r - R * 0.84)) - R * 0.028));
  float t2 = (fract(t * 7.0) - 0.5) / 7.0 * PI * 0.5 * r;
  holes = max(holes, smoothstep(aa, -aa, length(vec2(t2 * 2.6, r - R * 0.62)) - R * 0.11));   // radial slits (lens shapes)
  float t3 = (fract(t * 5.0) - 0.5) / 5.0 * PI * 0.5 * r;
  float petal = length(vec2(t3, (r - R * 0.33) * 0.8)) - R * 0.1;
  holes = max(holes, smoothstep(aa, -aa, abs(petal) - R * 0.011));      // petal outlines cut as thin lines
  holes = max(holes, smoothstep(aa, -aa, abs(r - R * 0.47) - R * 0.008) * step(0.06, fract(t * 10.0)));   // dashed ring
  holes = max(holes, smoothstep(aa, -aa, r - R * 0.075) - smoothstep(aa, -aa, r - R * 0.035));
  return paper * (1.0 - holes);
}
`;

// --------------------------------------------------------------------------
// STREET: 走出去，站在楼下的人行道上，隔着雨回头看这扇窗。
// The facade, the pavement and the lane lamp are a small SDF scene. A ray that reaches our window meets the
// drops on the outside of the glass (the same height field), refracts through them and the pane, and goes on
// into the very same room SDF, shaded by the very same lamp; the inside condensation, the frost and the
// paper-cuts lie on the far side of the glass. Rain in the air and the glow round the lamps are added after TAA.
// --------------------------------------------------------------------------
const GLSL_STREET = `
#define FAC_Z (-0.30)                               // outer face of our wall (30 cm of brick and lime plaster)
#define PAVE_Y (GROUND_Y + 0.14)                    // the pavement, a kerb's height above the road
#define FLOOR2 2.98                                 // the floor upstairs
const vec3 WL_P = vec3(-2.15, 2.80, -0.95);         // the lane lamp's bulb, under a green enamel shade on an iron bracket (from the street, +x is on the left)
const vec3 UPW_C = vec3(0.0, FLOOR2 + 1.55, 0.0);   // the window upstairs (same size as ours)
const vec3 NBW_C = vec3(-6.6, WIN_CY, 0.0);         // the neighbour's window on our floor
const vec3 BSW_C = vec3(0.0, -1.05, 0.0);           // a barred half-window of the semi-basement under ours
const vec3 AC_C = vec3(1.65, 2.6, FAC_Z - 0.17);    // an old air-conditioner box on two angle-iron brackets
#define PIPE_X 2.75
float lampMask(vec3 dirFromBulb){ return smoothstep(-0.05, -0.3, dirFromBulb.y); }   // the shade only lets light down
vec3 skyRad(vec3 d){ return mix(uSkyH, uSkyZ, sat(d.y * 1.4)); }
`;
const FS_STREET = () => GLSL_HEAD() + GLSL_LIGHT + ROOM_LIB + GLSL_CITY.replace('uniform float uTime;\n', '') + GLSL_GLASS + `
uniform sampler2D uHeight, uState, uSharp;
uniform vec2 uSimMM, uHTex;
uniform float uHScale, uFogK, uFrost;
uniform vec3 uSkyZ, uSkyH, uEVert, uEGround;
uniform vec3 uCityGlow;      // irradiance on our facade from the lit street behind the viewer
uniform vec3 uWallI;         // lane lamp intensity (0 by day)
uniform vec4 uFarLamp;       // the sodium lamp across the street: xyz, intensity
uniform vec3 uLampTint;
uniform vec3 uWinL;          // mean radiance leaving our window (lamp-lit room behind fogged glass)
uniform float uOcc, uSnow, uRain;
uniform vec4 uGLeaf[3];
` + GLSL_STREET + `
#define S_WALL 60.0
#define S_PLINTH 61.0
#define S_STONE 62.0
#define S_PAVE 63.0
#define S_PIPE 64.0
#define S_AC 65.0
#define S_IRON 66.0
#define S_ENAMEL 67.0
#define S_BULB 68.0
#define S_GLASS2 69.0
#define S_CABLE 70.0

float holeBox(vec3 p, vec3 c, vec2 hs, float depth){ return sdBox(p - vec3(c.x, c.y, FAC_Z + depth * 0.5), vec3(hs, depth * 0.5 + 0.002)); }
// the wall with its openings (ours leads into the room SDF; the window upstairs, the neighbour's, the basement's)
float wallSDF(vec3 p){
  float air = FAC_Z - p.z;
  if (air > 0.3) return air;
  float wall = max(air, sdRoom(p));
  wall = max(wall, -holeBox(p, UPW_C, vec2(WIN_HW, WIN_HH), 0.17));
  wall = max(wall, -holeBox(p, NBW_C, vec2(WIN_HW, WIN_HH), 0.17));
  return max(wall, -holeBox(p, BSW_C, vec2(0.42, 0.24), 0.2));
}
// everything that stands out from the wall: these are what cast the lane lamp's shadows (a flat wall lit from in
// front cannot shadow itself, and testing it at grazing angles only makes bands)
vec2 mapProt(vec3 p, bool shadow){
  vec2 res = vec2(1e9, -1.0);
  float air = FAC_Z - p.z;
  if (air < 0.5){
    // their glass (a solid here: nobody is looking into those rooms) and the basement bars
    float g2 = min(sdBox(p - vec3(UPW_C.x, UPW_C.y, FAC_Z + 0.15), vec3(WIN_HW, WIN_HH, 0.015)), sdBox(p - vec3(NBW_C.x, NBW_C.y, FAC_Z + 0.15), vec3(WIN_HW, WIN_HH, 0.015)));
    g2 = min(g2, sdBox(p - vec3(BSW_C.x, BSW_C.y, FAC_Z + 0.18), vec3(0.42, 0.24, 0.01)));
    res = opU(res, vec2(g2, S_GLASS2));
    float bx = p.x - BSW_C.x; bx = bx - 0.12 * clamp(floor(bx / 0.12 + 0.5), -3.0, 3.0);
    res = opU(res, vec2(max(length(vec2(bx, p.z - FAC_Z - 0.05)) - 0.009, abs(p.y - BSW_C.y) - 0.25), S_IRON));
    // stone: the plinth's cap, the string course between the floors, our outer sill (weathered to a slope), the sill upstairs
    float st = sdBox(p - vec3(0.0, -0.05, FAC_Z - 0.025), vec3(60.0, 0.05, 0.026));
    st = min(st, sdBox(p - vec3(0.0, FLOOR2 - 0.11, FAC_Z - 0.02), vec3(60.0, 0.09, 0.021)));
    float sill = sdBox(p - vec3(0.0, WIN_Y0 - 0.04, FAC_Z + 0.015), vec3(WIN_HW + 0.09, 0.04, 0.125));
    sill = max(sill, p.y - (WIN_Y0 - 0.006 + 0.16 * (p.z + 0.16)));
    st = min(st, sill);
    st = min(st, sdBox(p - vec3(UPW_C.x, UPW_C.y - WIN_HH - 0.03, FAC_Z - 0.03), vec3(WIN_HW + 0.08, 0.03, 0.06)));
    st = min(st, sdBox(p - vec3(NBW_C.x, NBW_C.y - WIN_HH - 0.03, FAC_Z - 0.03), vec3(WIN_HW + 0.08, 0.03, 0.06)));
    res = opU(res, vec2(st, S_STONE));
    // two black cables slung along the wall between porcelain knobs, sagging between them
    if (!shadow){                                   // (5 mm cables cast no shadow worth the banding they cause)
    float cx = fract(p.x / 3.1) * 2.0 - 1.0, sag = 0.07 * (1.0 - cx * cx);
    float cab = min(length(vec2(p.y - (2.64 - sag), p.z - FAC_Z + 0.05)), length(vec2(p.y - (2.70 - sag * 0.8), p.z - FAC_Z + 0.07))) - 0.0055;
    res = opU(res, vec2(cab, S_CABLE));
    }
  }
  // our frame, seen from outside (the room SDF's casement)
  if (air < 0.2 && abs(p.x) < WIN_HW + 0.1 && abs(p.y - WIN_CY) < WIN_HH + 0.1) res = opU(res, vec2(sdFrame(p), M_FRAME));
  // the air-conditioner box and its brackets
  vec3 qa = p - AC_C;
  float ba = sdBox(qa, vec3(0.45, 0.36, 0.2));
  if (ba < 0.05 || shadow){
    res = opU(res, vec2(sdRBox(qa, vec3(0.40, 0.26, 0.16), 0.012), S_AC));
    float br = min(sdBox(qa - vec3(-0.28, -0.285, 0.0), vec3(0.016, 0.016, 0.17)), sdBox(qa - vec3(0.28, -0.285, 0.0), vec3(0.016, 0.016, 0.17)));
    br = min(br, min(sdCapsule(qa, vec3(-0.28, -0.29, -0.16), vec3(-0.28, -0.60, 0.17), 0.012), sdCapsule(qa, vec3(0.28, -0.29, -0.16), vec3(0.28, -0.60, 0.17), 0.012)));
    res = opU(res, vec2(br, S_IRON));
  } else res = opU(res, vec2(ba, S_AC));
  // the cast-iron downpipe, with collars every 1.6 m
  vec3 qp = p - vec3(PIPE_X, 0.0, FAC_Z - 0.075);
  float pipe = length(qp.xz) - 0.048;
  float cy = mod(p.y, 1.6) - 0.8;
  pipe = min(pipe, max(length(qp.xz) - 0.058, abs(cy) - 0.02));
  res = opU(res, vec2(max(pipe, PAVE_Y + 0.02 - p.y), S_PIPE));
  // the lane lamp: an iron bracket out of the wall, a stay, a green enamel shade over a bare bulb
  if (shadow) return res;
  vec3 ql = p - WL_P;
  float bl = sdBox(ql - vec3(0.0, 0.0, 0.33), vec3(0.2, 0.4, 0.42));
  if (bl < 0.05){
    float arm = min(sdCapsule(p, vec3(WL_P.x, WL_P.y + 0.16, FAC_Z), WL_P + vec3(0.0, 0.16, -0.02), 0.014), sdCapsule(p, WL_P + vec3(0.0, 0.16, -0.02), WL_P + vec3(0.0, 0.065, 0.0), 0.011));
    arm = min(arm, sdCapsule(p, vec3(WL_P.x, WL_P.y - 0.22, FAC_Z), WL_P + vec3(0.0, 0.16, 0.38), 0.009));
    res = opU(res, vec2(arm, S_IRON));
    float sh = sdCappedCone(ql - vec3(0.0, 0.025, 0.0), 0.04, 0.165, 0.045);
    res = opU(res, vec2(abs(sh) - 0.0025, S_ENAMEL));
    res = opU(res, vec2(length(ql) - 0.032, S_BULB));
  } else res = opU(res, vec2(bl, S_IRON));
  return res;
}
vec2 mapStreet(vec3 p){
  vec2 res = vec2(p.y - PAVE_Y, S_PAVE);
  res = opU(res, vec2(wallSDF(p), p.y < -0.1 ? S_PLINTH : S_WALL));
  return opU(res, mapProt(p, false));
}
vec3 calcNormalS(vec3 p){
  const vec2 k = vec2(1.0, -1.0); const float e = 0.0008;
  return normalize(k.xyy * mapStreet(p + k.xyy * e).x + k.yyx * mapStreet(p + k.yyx * e).x + k.yxy * mapStreet(p + k.yxy * e).x + k.xxx * mapStreet(p + k.xxx * e).x);
}
float shadowS(vec3 ro, vec3 rd, float tmax, float k){
  float res = 1.0, t = 0.01;
  bool recess = ro.z > FAC_Z + 0.002;                         // inside a window's reveal the wall itself can shade
  for (int i = 0; i < 20; i++){
    vec3 q = ro + rd * t;
    float h = mapProt(q, true).x;
    if (recess) h = min(h, wallSDF(q));
    res = min(res, k * h / t);
    t += clamp(h, 0.01, 0.3);
    if (res < 0.01 || t > tmax) break;
  }
  return smoothstep(0.0, 1.0, sat(res));
}
// (occlusion from the real occluders only: a bounding box's distance would print its outline on the wall)
float occS(vec3 q){ return min(min(q.y - PAVE_Y, wallSDF(q)), mapProt(q, true).x); }
float aoS(vec3 p, vec3 n){
  float a = occS(p + n * 0.05) / 0.05, b = occS(p + n * 0.2) / 0.2;
  return sat(0.25 + 0.45 * sat(a) + 0.3 * sat(b));
}
// irradiance at a street surface: overcast sky, the lit street behind the viewer, the lane lamp (shadowed),
// the sodium lamp across the street (through the plane tree: its leaves throw moving shadows on our wall), our window
vec3 outdoorE(vec3 p, vec3 n, float ao, bool shadows){
  vec3 E = (n.y >= 0.0 ? mix(uEVert, uEGround, n.y) : mix(uEVert, uEGround * 0.12, -n.y)) * ao;
  E += uCityGlow * max(-n.z, 0.0) * mix(1.0, ao, 0.6);
  vec3 L = WL_P - p; float d2 = dot(L, L); vec3 l = L * inversesqrt(d2);
  float nl = dot(n, l);
  if (nl > 0.0 && uWallI.r > 0.0){
    float m = lampMask(-l);
    if (m > 0.0) E += uWallI * m * nl / d2 * (shadows ? shadowS(p + n * 0.004, l, sqrt(d2) - 0.24, 12.0) : 1.0);   // (the shade itself is lampMask)
  }
  vec3 F = uFarLamp.xyz - p; float f2 = dot(F, F); vec3 fl = F * inversesqrt(f2);
  float nf = dot(n, fl);
  if (nf > 0.0 && uFarLamp.w > 0.0){
    float tt = (TREE_Z - p.z) / fl.z, sh = 1.0;
    if (tt > 0.0){
      vec2 pt = p.xy + fl.xy * tt, tp = treeParts(pt, 0.07);
      // the crown's shadow is dappled: light comes through the gaps between leaves
      sh = 1.0 - 0.9 * max(tp.x * (0.4 + 0.6 * smoothstep(0.42, 0.62, 0.6 * vnoise(FBM_R * pt * 6.0 + 3.0) + 0.4 * vnoise(FBM_R * FBM_R * pt * 5.0))), tp.y);
    }
    E += uLampTint * uFarLamp.w * nf / f2 * sh;
  }
  E += uWinL * rectIrr(p, n, vec2(WIN_X1, WIN_Y0), vec2(WIN_X0, WIN_Y1), GLASS_Z);
  return E;
}
// the lane lamp's highlight on a glossy surface (sphere light)
vec3 lampSpec(vec3 p, vec3 n, vec3 v, float a, vec3 f0){
  vec3 L = WL_P - p; float d2 = dot(L, L), d = sqrt(d2); vec3 l = L / d;
  float nl = dot(n, l), nv = max(dot(n, v), 1e-3);
  if (nl <= 0.0 || uWallI.r <= 0.0) return vec3(0.0);
  vec3 hv = normalize(l + v);
  float aL = sat(a + 0.032 / (2.0 * d));
  return uWallI * lampMask(-l) * nl / d2 * D_GGX(max(dot(n, hv), 0.0), aL) * V_Smith(nv, nl, aL) * F_Schlick(f0, max(dot(l, hv), 0.0));
}

// ---- the wall: faded ochre lime-wash over brick, streaked by years of rain
vec3 wallAlb(vec3 p, out float rough){
  vec2 w = p.xy;
  vec3 c = vec3(0.50, 0.42, 0.29) * (0.82 + 0.3 * fbm(w * 0.8));
  c = mix(c, vec3(0.40, 0.40, 0.33), 0.35 * smoothstep(0.5, 0.8, fbm(w * 0.35 + 4.0)));            // patched with a greyer wash
  // where the plaster has fallen away: brick, in staggered courses
  float spall = smoothstep(0.79, 0.81, fbm(w * 1.3 + 3.0) + 0.08 * vnoise(w * 9.0) + 0.08 * smoothstep(1.5, -0.2, p.y));
  if (spall > 0.0){
    vec2 b = vec2(w.x / 0.24 + 0.5 * mod(floor(w.y / 0.065), 2.0), w.y / 0.065);
    vec2 bf = fract(b);
    float mortar = 1.0 - smoothstep(0.0, 0.06, min(min(bf.x, 1.0 - bf.x) * 0.27, min(bf.y, 1.0 - bf.y)));
    vec3 brick = mix(vec3(0.20, 0.13, 0.10), vec3(0.26, 0.17, 0.13), hash12(floor(b))) * (1.0 - 0.6 * mortar) + vec3(0.25) * mortar * 0.6;
    c = mix(c, brick, spall * 0.85);
    c *= 1.0 - 0.25 * smoothstep(0.0, 0.5, spall) * smoothstep(1.0, 0.5, spall);        // the broken plaster edge
  }
  // rain streaks: water running off the sill's ends, off the AC box and off the string course, carrying grime down
  float sk = 0.0;
  for (int k = 0; k < 2; k++){
    float x0 = (k == 0 ? -1.0 : 1.0) * (WIN_HW + 0.07);
    sk = max(sk, smoothstep(0.05, 0.0, abs(p.x - x0 - 0.015 * sin(p.y * 6.0))) * step(p.y, WIN_Y0 - 0.08) * exp(-(WIN_Y0 - p.y) * 0.5));
  }
  sk = max(sk, smoothstep(0.06, 0.0, abs(abs(p.x - AC_C.x) - 0.36)) * step(p.y, AC_C.y - 0.3) * exp(-(AC_C.y - p.y) * 0.4));
  sk = max(sk, smoothstep(0.55, 0.85, vnoise(vec2(p.x * 7.0, 1.0))) * smoothstep(FLOOR2 - 1.2, FLOOR2 - 0.2, p.y) * step(p.y, FLOOR2 - 0.2) * 0.7);
  sk = max(sk, 0.6 * smoothstep(0.6, 0.0, abs(p.x - PIPE_X)) * smoothstep(1.2, -0.1, p.y - PAVE_Y) * 0.8);
  c *= 1.0 - 0.45 * sk;
  c *= 0.93 + 0.07 * vnoise(w * vec2(40.0, 3.0));                                     // brush marks of the lime-wash
  c = mix(c, vec3(0.16, 0.18, 0.12), 0.5 * smoothstep(0.55, 0.9, fbm(w * 2.2 + 9.0)) * smoothstep(1.8, 0.0, p.y));   // damp, mould
  // the blue enamel house-number plate (门牌) beside the window, and a half-torn notice pasted near the pipe
  vec2 hp = w - vec2(-0.86, 1.98);
  if (abs(hp.x) < 0.1 && abs(hp.y) < 0.065){
    float rim = step(0.088, abs(hp.x)) + step(0.053, abs(hp.y));
    vec2 g = vec2(hp.x / 0.018, (hp.y + 0.008) / 0.03);
    float digit = step(abs(hp.y + 0.008), 0.022) * step(abs(hp.x), 0.06) * step(0.45, vnoise(g * 3.0 + floor(g.x)));
    c = mix(vec3(0.03, 0.08, 0.22), vec3(0.62), max(sat(rim), digit));
    c = mix(c, vec3(0.2, 0.12, 0.06), 0.4 * smoothstep(0.6, 0.85, vnoise(hp * 90.0)));   // chipped enamel, rust
    rough = 0.2;
    return c;
  }
  vec2 np = w - vec2(1.25, 1.35);
  float torn = fbm(np * 18.0);
  if (abs(np.x) < 0.15 && abs(np.y) < 0.2 && torn > 0.32 + 0.4 * smoothstep(-0.05, -0.2, np.y)){
    vec3 paper = vec3(0.55, 0.52, 0.42) * (0.8 + 0.2 * vnoise(np * 200.0));
    float text = step(0.5, vnoise(vec2(np.x * 120.0, floor(np.y / 0.018) * 7.0))) * step(fract(np.y / 0.018), 0.55) * step(abs(np.x), 0.12);
    paper = mix(paper, vec3(0.08), text * 0.8);
    paper = mix(paper, vec3(0.5, 0.06, 0.05), step(0.13, np.y) * step(abs(np.x), 0.1));   // a red heading
    c = mix(c, paper * 0.85, 0.95);
  }
  rough = 0.75;
  return c;
}
vec3 plinthAlb(vec3 p){
  // 水刷石: grey granite chips in render, scored into blocks; splash-back keeps the bottom wet and green
  vec2 b = vec2(p.x / 0.9 + 0.5 * mod(floor(p.y / 0.42), 2.0), p.y / 0.42);
  vec2 bf = fract(b);
  float joint = 1.0 - smoothstep(0.0, 0.012, min(min(bf.x, 1.0 - bf.x) * 0.9, min(bf.y, 1.0 - bf.y) * 0.42));
  vec3 c = vec3(0.33, 0.32, 0.29) * (0.75 + 0.5 * hash12(floor(p.xy * 160.0))) * (0.9 + 0.2 * hash12(floor(b)));
  c *= 1.0 - 0.6 * joint;
  c = mix(c, vec3(0.08, 0.11, 0.06), 0.7 * smoothstep(0.4, 0.0, p.y - PAVE_Y) * (0.5 + 0.5 * fbm(p.xy * 6.0)));
  return c;
}

// ---- puddles: rain rings spreading on the water (two sizes of drop), as a normal perturbation
vec2 ripples(vec2 xz){
  vec2 acc = vec2(0.0);
  for (int L = 0; L < 2; L++){
    float cs = L == 0 ? 0.32 : 0.19;
    vec2 g = xz / cs, gi = floor(g);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
      vec2 c = gi + vec2(float(i), float(j));
      vec3 h = hash32(c + float(L) * 37.0);
      float per = 0.9 + 0.8 * h.z;
      float tt = fract(uTime / per + h.z * 7.0) * per;
      vec2 d = (xz - (c + 0.2 + 0.6 * h.xy) * cs);
      float r = length(d), R = tt * 0.28;
      float x = (r - R) * 70.0;
      float ring = sin(clamp(x, -9.42, 9.42)) * exp(-x * x * 0.03) * pow(1.0 - tt / per, 2.0) * smoothstep(0.0, 0.05, tt);
      acc += d / max(r, 1e-4) * ring * (L == 0 ? 0.11 : 0.06);
    }
  }
  return acc * sat(uRain * 1.4);
}
// what a puddle mirrors: the wall above it (with our lit window, the lamp, the windows upstairs) or the sky
vec3 mirrorScene(vec3 p, vec3 r){
  if (r.z > 0.02){
    float tw = (FAC_Z - p.z) / r.z;
    vec3 q = p + r * tw;
    if (q.y < 10.0){
      if (abs(q.x - WIN_CX) < WIN_HW && abs(q.y - WIN_CY) < WIN_HH){
        float bar = smoothstep(MW + 0.01, MW, abs(q.x)) + smoothstep(TW + 0.01, TW, abs(q.y - TRANSOM_Y));
        return mix(uWinL * 1.3, vec3(0.004, 0.006, 0.004), sat(bar));
      }
      vec3 a = abs(q - UPW_C), b = abs(q - NBW_C);
      if ((a.x < WIN_HW && a.y < WIN_HH) || (b.x < WIN_HW && b.y < WIN_HH)) return skyRad(r) * 0.25 + uCityGlow * 0.004;
      float rr; vec3 alb = (q.y < -0.1 ? plinthAlb(q) : wallAlb(q, rr)) * 0.72;          // wet, like the wall itself
      return alb / PI * outdoorE(q, vec3(0.0, 0.0, -1.0), 0.6 + 0.4 * smoothstep(0.0, 0.6, q.y - PAVE_Y), false);
    }
  }
  return skyRad(r);
}
vec3 envOut(vec3 r){          // the street behind the viewer, as the glass mirrors it (rendered from the window)
  r.z = min(r.z, -0.03); r = normalize(r);
  return textureLod(uSharp, dirToEq(r), 0.5).rgb;
}

vec3 shadeStreet(vec3 p, vec3 n, vec3 rd, float id){
  vec3 v = -rd;
  float ao = aoS(p, n);
  float rough = 0.8, wetK = 0.6; vec3 alb = vec3(0.3), emis = vec3(0.0), f0 = vec3(0.04);
  float snowy = uSnow * smoothstep(0.6, 0.9, n.y);
  if (id == S_WALL){ alb = wallAlb(p, rough); alb *= 0.72; }                    // wet lime-wash darkens
  else if (id == S_PLINTH) { alb = plinthAlb(p) * 0.75; rough = 0.6; }
  else if (id == S_STONE){ alb = vec3(0.30, 0.29, 0.27) * (0.7 + 0.4 * fbm(p.xy * 9.0 + p.z * 5.0)) * (n.y > 0.5 ? 0.6 : 0.8); rough = n.y > 0.5 ? 0.25 : 0.6; }
  else if (id == S_PIPE){ alb = mix(vec3(0.08, 0.10, 0.09), vec3(0.22, 0.10, 0.05), smoothstep(0.5, 0.8, fbm(p.xy * vec2(30.0, 4.0)))); rough = 0.35; }
  else if (id == S_AC){
    vec3 q = p - AC_C;
    alb = vec3(0.52, 0.50, 0.44) * (0.85 + 0.15 * fbm(q.xy * 20.0));
    alb = mix(alb, vec3(0.30, 0.15, 0.07), 0.6 * smoothstep(0.55, 0.8, fbm(vec2(q.x * 25.0, q.y * 3.0))) * smoothstep(0.0, -0.25, q.y));   // rust runs
    if (n.z < -0.7){
      vec2 g = q.xy - vec2(0.12, 0.0); float r = length(g);
      float grille = step(r, 0.21) * (0.5 + 0.5 * step(0.5, fract(r * 55.0)));
      alb = mix(alb, vec3(0.03), grille * 0.85);
      alb = mix(alb, vec3(0.04), step(abs(q.x + 0.29), 0.06) * step(abs(q.y), 0.2) * step(0.5, fract(q.y * 45.0)));   // louvres
    }
    rough = 0.45;
  }
  else if (id == S_IRON || id == S_CABLE){ alb = vec3(0.025, 0.024, 0.022); rough = 0.4; }
  else if (id == S_ENAMEL){
    bool inner = dot(n, normalize(p - WL_P)) < 0.0;
    alb = inner ? vec3(0.75, 0.74, 0.70) : vec3(0.05, 0.16, 0.10); rough = 0.12;
    if (inner) emis = uWallI * 0.75 / dot(p - WL_P, p - WL_P) * 0.75 / PI;           // the white enamel inside, lit by the bulb
  }
  else if (id == S_BULB){ emis = uWallI / (PI * 0.032 * 0.032) * 0.6 + vec3(0.02); alb = vec3(0.0); }
  else if (id == S_GLASS2){
    // the other windows: dark panes that mirror the street; one may have a lit curtain behind it
    vec3 c = abs(p - UPW_C).y < WIN_HH + 0.01 && abs(p.x - UPW_C.x) < WIN_HW + 0.01 ? UPW_C : (p.y < 0.0 ? BSW_C : NBW_C);
    vec2 q = p.xy - c.xy;
    float bars = max(smoothstep(0.03, 0.02, abs(q.x)), smoothstep(0.025, 0.015, abs(q.y - 0.3))) + smoothstep(WIN_HW - 0.05, WIN_HW - 0.04, abs(q.x)) + smoothstep(WIN_HH - 0.05, WIN_HH - 0.04, abs(q.y));
    float lit = c == BSW_C ? 0.0 : step(hash11(c.x * 3.1 + 7.0), uOcc * 1.4);
    vec3 curtain = vec3(0.9, 0.55, 0.28) * (0.6 + 0.4 * sin(q.x * 40.0 + 2.0 * sin(q.y * 3.0))) * 0.035 * lit;
    vec3 rr = reflect(rd, vec3(0.0, 0.0, -1.0));
    float F = fresnel(max(dot(v, vec3(0.0, 0.0, -1.0)), 0.0), 1.0, NG);
    vec3 glassC = envOut(rr) * F * 1.6 + curtain * (1.0 - F) + lampSpec(p, vec3(0.0, 0.0, -1.0), v, 0.01, vec3(0.04));
    vec3 frameC = vec3(0.12, 0.10, 0.07) / PI * outdoorE(p, n, ao, false);
    return mix(glassC, frameC, sat(bars));
  }
  else if (id == S_PAVE){
    vec2 g = p.xz / 0.3, gi = floor(g), gf = fract(g);
    float th = hash12(gi);
    float grout = 1.0 - smoothstep(0.0, 0.035, min(min(gf.x, 1.0 - gf.x), min(gf.y, 1.0 - gf.y)));
    alb = vec3(0.27, 0.26, 0.24) * (0.75 + 0.35 * th) * (0.85 + 0.25 * vnoise(p.xz * 30.0)) * (1.0 - 0.45 * grout) * 0.7;
    // puddles where the pavers have sunk: by the wall under the sill drip, round the downpipe's shoe, in a few dips
    float pud = fbm(p.xz * 0.55 + 11.0) + 0.3 * smoothstep(1.3, 0.3, length((p.xz - vec2(0.45, -6.1)) * vec2(0.8, 1.2)) + 0.25 * vnoise(p.xz * 3.0)) + 0.25 * smoothstep(0.9, 0.0, abs(p.x - PIPE_X)) * smoothstep(1.4, 0.3, abs(p.z + 0.8)) + 0.12 * smoothstep(1.5, 0.4, p.z - FAC_Z + 1.4) * smoothstep(1.2, 0.5, abs(p.x));
    float water = smoothstep(0.56, 0.6, pud + 0.05 * (th - 0.5) - 0.04 * grout) * (1.0 - uSnow);
    // fallen plane leaves in autumn, stuck flat to the wet paving
    if (uSeason > 1.5 && uSeason < 2.5){
      vec2 lg = p.xz / 0.45, li = floor(lg); vec3 lh = hash32(li + 5.0);
      if (lh.z < 0.35){
        vec2 lq = rot2((fract(lg) - 0.3 - 0.4 * lh.xy) * 0.45, lh.z * 40.0);
        float a = atan(lq.y, lq.x), r = length(lq);
        float leaf = smoothstep(0.004, 0.0, r - 0.05 * (0.65 + 0.35 * abs(cos(2.5 * a))));
        alb = mix(alb, mix(vec3(0.42, 0.24, 0.05), vec3(0.3, 0.12, 0.04), lh.x) * 0.8, leaf * (1.0 - water * 0.5));
      }
    }
    if (snowy > 0.0 || uSnow > 0.0){
      float trod = smoothstep(0.35, 0.65, fbm(p.xz * vec2(1.6, 0.5) + 3.0));          // a trodden, slushy path along the kerb side
      snowy = uSnow * (1.0 - 0.75 * trod);
    }
    vec3 nW = normalize(vec3(-ripples(p.xz).x, 1.0, -ripples(p.xz).y));
    vec3 nn = normalize(mix(n, nW, water));
    float cw = max(dot(nn, v), 0.0);
    float Fw = fresnel(cw, 1.0, NW);
    vec3 r = reflect(rd, nn);
    vec3 E = outdoorE(p, n, ao, true);
    vec3 dry = alb / PI * E + lampSpec(p, n, v, 0.32, vec3(0.04)) + F_Schlick(vec3(0.04), max(dot(n, v), 0.0)) * skyRad(reflect(rd, n)) * 0.4;
    vec3 wetc = alb * 0.35 / PI * E * (1.0 - Fw) + Fw * mirrorScene(p, r) + lampSpec(p, nn, v, 0.02, vec3(0.02)) * 1.0;
    vec3 c = mix(dry, wetc, water);
    c = mix(c, vec3(0.75, 0.76, 0.78) / PI * E, snowy);
    return c;
  }
  else if (id == M_FRAME){
    Mat m = getMat(id, p, n); alb = m.alb * 0.8; rough = 0.45;
  }
  if (snowy > 0.0) alb = mix(alb, vec3(0.8, 0.81, 0.83), snowy);
  vec3 E = outdoorE(p, n, ao, true);
  vec3 col = emis + alb / PI * E;
  float a = rough * rough;
  col += lampSpec(p, n, v, max(a, 0.02), f0) * (1.0 - snowy);
  col += F_Schlick(f0, max(dot(n, v), 0.0)) * skyRad(reflect(rd, n)) * (1.0 - rough) * 0.6 * ao;
  return col;
}

// ---- our window from outside: drops, glass, and the room behind them
vec3 windowOut(vec3 P, vec3 rd){
  vec2 guv = (P.xy - vec2(WIN_X0, WIN_Y0)) / vec2(WIN_X1 - WIN_X0, WIN_Y1 - WIN_Y0);
  vec4 st = texture(uState, guv);
  float M = smoothstep(0.02, 0.9, st.r), Fin = min(st.b * uFogK, 1.0), rim = st.a;
  vec2 e = 1.0 / uHTex, emm = e * uSimMM;
  float h = texture(uHeight, guv).r / uHScale;
  float hx = (texture(uHeight, guv + vec2(e.x, 0.0)).r - texture(uHeight, guv - vec2(e.x, 0.0)).r) / uHScale / (2.0 * emm.x);
  float hy = (texture(uHeight, guv + vec2(0.0, e.y)).r - texture(uHeight, guv - vec2(0.0, e.y)).r) / uHScale / (2.0 * emm.y);
  float wet = smoothstep(0.0, 0.03, h);
  vec3 N = normalize(vec3(-hx, -hy, -1.0));                  // the drop's surface, facing the street
  vec3 v = -rd;
  // into the drop, through the pane, out into the room: the drop is a little lens that shows the room upside down
  float ci = max(dot(v, N), 1e-3);
  float Fw = fresnel(ci, 1.0, NW);
  vec3 tw = refract(rd, N, 1.0 / NW);
  vec2 xy = tw.xy * NW; float s2 = dot(xy, xy);
  vec3 dDrop = s2 < 1.0 ? vec3(xy, sqrt(1.0 - s2)) : vec3(0.0, 0.0, 1.0);
  vec3 dIn = normalize(mix(rd, dDrop, wet));
  float Fg = fresnel(abs(rd.z), 1.0, NG);
  // march the room
  vec3 roomC = vec3(0.0);
  float tr = 0.003; vec2 hr = vec2(1.0, 0.0); bool rh = false;
  for (int i = 0; i < 100; i++){
    hr = map(P + dIn * tr, true);
    if (hr.x < 0.0003 * tr + 0.0001){ rh = true; break; }
    tr += hr.x * 0.96;
    if (tr > 6.0) break;
  }
  if (rh){ vec3 q = P + dIn * tr; roomC = shade(q, calcNormal(q), dIn, hr.y); }
  vec4 sm = smokeVol(P, dIn, rh ? tr : 6.0);
  roomC = roomC * sm.a + sm.rgb;
  // the outside mist scatters a little of everything; the inside condensation glows with the lamp behind it
  vec3 Lb = BULB - P; float ld2 = dot(Lb, Lb);
  vec3 Eg = uLampI * lampEmitFactor(-Lb * inversesqrt(ld2)) * max(Lb.z * inversesqrt(ld2), 0.0) / ld2 + uAmbL;
  vec3 Lw = WL_P - P; float lw2 = dot(Lw, Lw);
  vec3 Eo = uWallI * lampMask(-Lw * inversesqrt(lw2)) * max(-Lw.z, 0.0) * inversesqrt(lw2) / lw2 + uCityGlow + uEVert;   // light falling on the glass from the street
  roomC = mix(roomC, uWinL, M * 0.3) + Eo * 0.006 * M;
  float fogA = sat(Fin * 0.85 + rim * 0.35);
  vec3 fogC = (Eg * 0.2 + uWinL * 1.1 + Eo * 0.01) * (0.9 + 0.2 * vnoise(guv * uSimMM * 2.5));
  vec3 through = mix(roomC, fogC, fogA);
  // frost on the inside, lit from the room
  if (uFrost > 0.0){
    float yb = P.y < TRANSOM_Y ? P.y - (WIN_Y0 + FW) : P.y - (TRANSOM_Y + TW);
    float xe = min(min(abs(P.x - (WIN_X0 + FW)), abs(P.x + MW)), min(abs(P.x - MW), abs(P.x - (WIN_X1 - FW))));
    vec2 fq = P.xy * vec2(75.0, 60.0);
    float fern = 0.0, amp = 0.5;
    for (int k = 0; k < 4; k++){ fern += amp * (1.0 - abs(2.0 * vnoise(fq) - 1.0)); fq = FBM_R * fq * 1.1 + 5.3; amp *= 0.55; }
    float corner = min(yb, xe) + 0.6 * max(yb, xe);
    float frost = smoothstep(0.62, 0.86, fern + 0.95 - min(min(yb, xe * 1.6) * 15.0, corner * 11.0)) * (P.y < TRANSOM_Y ? 1.0 : 0.55);
    through = mix(through, Eg * 0.06 + uWinL * 0.5 + Eo * 0.03, frost * 0.8);
  }
  // the paper-cuts on the inside: red paper glowing with the lamp behind it
  float aaW = length(fwidth(P.xy)) * 0.8 + 0.0002;
  vec2 dL = vec2(P.x - (WIN_X0 + FW), (TRANSOM_Y - TW) - P.y), dR = vec2((WIN_X1 - FW) - P.x, (TRANSOM_Y - TW) - P.y);
  float tR = atan(dR.y, dR.x) / (PI * 0.5);
  float keep = smoothstep(0.02, -0.02, tR - 0.6 - 0.12 * (vnoise(dR * 260.0) - 0.5));
  float pc = max(paperCut(dL, 0.112, aaW), paperCut(dR, 0.112, aaW) * keep);
  through = mix(through, (Eg * vec3(0.10, 0.008, 0.006) + uWinL * vec3(0.6, 0.06, 0.05)) * (0.85 + 0.3 * vnoise(P.xy * 300.0)) + Eo * vec3(0.05, 0.01, 0.01), pc);
  // reflections: the flat pane mirrors the street behind the viewer and the lane lamp; the drops mirror it small and bright
  vec3 Rg = reflect(rd, vec3(0.0, 0.0, -1.0));
  vec3 dryC = through * (1.0 - Fg) * (1.0 - Fg) + (envOut(Rg) * Fg * (1.0 + 0.85 * (1.0 - M)) + lampSpec(P, vec3(0.0, 0.0, -1.0), v, 0.004 + 0.05 * M, vec3(0.04))) * (1.0 - 0.5 * M);
  vec3 Rw = reflect(rd, N);
  vec3 wetC = through * (1.0 - Fw) * (1.0 - Fg) * step(s2, 1.0) + envOut(Rw) * Fw + lampSpec(P, N, v, 0.01, vec3(0.02));
  vec3 col = mix(dryC, wetC, wet);
  // snowflakes resting on the outside, lit by the street and the lamp
  float flake = texture(uHeight, guv).g;
  if (flake > 0.0) col = mix(col, (Eo * 0.8 + uEVert * 0.3) / PI + Eg * 0.01, min(flake, 1.0) * 0.9);
  // autumn: wet leaves stuck to the outside
  for (int i = 0; i < 3; i++){
    if (uGLeaf[i].z <= 0.0) continue;
    float Rl = uGLeaf[i].z;
    vec2 q = rot2(P.xy - uGLeaf[i].xy, uGLeaf[i].w);
    float a = atan(q.x, q.y - Rl * 0.35), r = length(q - vec2(0.0, Rl * 0.35));
    float lf = smoothstep(aaW, -aaW, r - Rl * 0.62 * (0.6 + 0.4 * abs(cos(2.5 * a)))) ;
    if (lf <= 0.0) continue;
    vec3 alb = mix(vec3(0.36, 0.20, 0.04), vec3(0.22, 0.10, 0.03), smoothstep(0.4, 0.8, vnoise(q * 60.0 + float(i) * 9.0)));
    col = mix(col, alb / PI * Eo + Eg * vec3(0.02, 0.012, 0.002) + lampSpec(P, vec3(0.0, 0.0, -1.0), v, 0.15, vec3(0.03)), lf);
  }
  return col;
}

void main(){
  vec2 ndc = (gl_FragCoord.xy + uJitter) / uRes * 2.0 - 1.0;
  vec3 rd = normalize(uCamFwd + ndc.x * uTan.x * uCamRight + ndc.y * uTan.y * uCamUp);
  vec3 ro = uCamPos;
  float tGl = 1e9;
  if (rd.z > 0.0){
    float tz = (GLASS_Z - ro.z) / rd.z; vec3 pg = ro + rd * tz;
    if (abs(pg.x - WIN_CX) < WIN_HW && abs(pg.y - WIN_CY) < WIN_HH) tGl = tz;
  }
  float t = 0.0; vec2 h = vec2(1.0, 0.0); bool hit = false;
  for (int i = 0; i < 110; i++){
    h = mapStreet(ro + rd * t);
    if (h.x < 0.0003 * t + 0.0002){ hit = true; break; }
    t += h.x * 0.95;
    if (t > tGl || t > 80.0) break;
  }
  vec3 col;
  if (hit && t < tGl){
    vec3 p = ro + rd * t;
    col = shadeStreet(p, calcNormalS(p), rd, h.y);
  } else if (tGl < 1e8){
    t = tGl;
    col = windowOut(ro + rd * tGl, rd);
  } else { col = skyRad(rd); t = 80.0; }
  oCol = vec4(max(col, 0.0), 0.0);
  oAux = vec4(t * dot(rd, uCamFwd));
}
`;

// after TAA: rain in the air (only where something lights it) and the glow of the lamps in the wet air
const FS_STREETPOST = () => GLSL_HEAD() + `
uniform vec2 uRes;
uniform vec3 uCamPos, uCamFwd, uCamRight, uCamUp;
uniform vec2 uTan;
uniform sampler2D uSrc, uDepth;
uniform float uTime, uRain, uWind, uSnow, uFocus, uAperture;
uniform vec3 uWallI, uWinL, uCityGlow, uSkyH;
out vec4 o;
` + GLSL_STREET.replace('vec3 skyRad(vec3 d){ return mix(uSkyH, uSkyZ, sat(d.y * 1.4)); }', '') + `
// single scattering of a point light along a ray segment [0, T] (closed form of ∫ dt / (h² + (t − tc)²))
float airlight(vec3 ro, vec3 rd, vec3 S, float T, out vec3 cp){
  vec3 so = S - ro; float tc = dot(so, rd);
  float h = max(length(so - rd * tc), 0.02);
  cp = ro + rd * clamp(tc, 0.0, T);
  return (atan((T - tc) / h) + atan(tc / h)) / h;
}
// light arriving at a point in the air (for the raindrops there): the lane lamp, our window, the glow of the street
vec3 lightAt(vec3 p, vec3 rd, out float fwd){
  vec3 L = WL_P - p; float d2 = dot(L, L); vec3 l = L * inversesqrt(d2);
  vec3 W = vec3(WIN_CX, WIN_CY, GLASS_Z) - p; float w2 = dot(W, W); vec3 wl = W * inversesqrt(w2);
  vec3 E = uWallI * lampMask(-l) / max(d2, 0.04);
  vec3 Ew = uWinL * 1.4 * max(-wl.z, 0.0) / max(w2, 0.1);
  // drops scatter strongly forward: a drop between the eye and a light lights up
  fwd = pow(max(dot(-l, -rd), 0.0), 6.0);
  float fw = pow(max(dot(-wl, -rd), 0.0), 6.0);
  return E * (0.15 + 2.2 * fwd) + Ew * (0.15 + 2.2 * fw) + uCityGlow * 0.08;
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 col = texture(uSrc, uv).rgb;
  vec2 ndc = uv * 2.0 - 1.0;
  vec3 rd = normalize(uCamFwd + ndc.x * uTan.x * uCamRight + ndc.y * uTan.y * uCamUp);
  float zv = texture(uDepth, uv).r, cf = dot(rd, uCamFwd);
  float T = zv / cf;
  // glow: the lamp's light and the window's, scattered by rain and mist on the way to the eye
  float sigma = 0.012 + 0.05 * uRain + 0.03 * uSnow;
  vec3 cp;
  float A = airlight(uCamPos, rd, WL_P, T, cp);
  col += uWallI * lampMask(normalize(cp - WL_P)) * A * sigma * (0.08 + 0.5 * pow(max(dot(rd, normalize(WL_P - uCamPos)), 0.0), 40.0)) / (4.0 * PI) * 4.0;
  float Aw = airlight(uCamPos, rd, vec3(WIN_CX, WIN_CY, GLASS_Z - 0.05), T, cp);
  col += uWinL * 1.4 * max(normalize(vec3(WIN_CX, WIN_CY, GLASS_Z) - cp).z, 0.0) * Aw * sigma * 0.12;
  // falling rain / snow: layers at increasing depth; each a sheet of short streaks (the shutter is open 1/50 s),
  // blurred by the lens where it is out of focus, and dark unless a light is behind it or beside it
  float wind = uWind * 0.6;
  for (int k = 0; k < 7; k++){
    float z = 0.7 * pow(1.5, float(k));
    if (z > zv) break;
    vec3 P = uCamPos + rd * (z / cf);
    float coc = uAperture * abs(z - uFocus) / uFocus;                   // blur diameter in metres at that depth
    float px = 2.0 * z * uTan.y / uRes.y;                               // one pixel in metres at that depth
    vec2 q = vec2(dot(P - uCamPos, normalize(vec3(uCamRight.x, 0.0, uCamRight.z))), P.y);
    float cell = max(0.045 * z, 0.06);
    float vfall = uSnow > 0.5 ? 1.1 : 7.5, len = uSnow > 0.5 ? 0.006 : vfall / 50.0;
    q.x -= (wind * (q.y - uTime * vfall) * (uSnow > 0.5 ? 0.6 : 0.12)) + (uSnow > 0.5 ? 0.04 * sin(uTime * 1.3 + q.y * 3.0 + float(k)) : 0.0);
    q.y += uTime * vfall + float(k) * 3.7;
    vec2 g = vec2(q.x / cell, q.y / (cell * 3.0)), gi = floor(g);
    vec3 hh = hash32(gi + float(k) * 13.0);
    if (hh.z > 0.7 * sat(uRain * 1.6 + uSnow)) continue;
    vec2 c = (gi + 0.15 + 0.7 * hh.xy) * vec2(cell, cell * 3.0);
    float w = max(max(coc, px * 1.2), 0.0015);
    float dx = abs(q.x - c.x), dy = abs(q.y - c.y);
    float shape = smoothstep(w * 0.5 + px * 0.5, w * 0.5 - px * 0.5 - 0.0005, dx) * smoothstep(len * 0.5 + w * 0.5, len * 0.5 - w * 0.2, dy);
    if (shape <= 0.0) continue;
    float fwd;
    vec3 Li = lightAt(P, rd, fwd);
    // energy of a 2 mm drop spread over the blurred width
    // a 2 mm drop is mostly a lens (lit from behind); a 5 mm snowflake is a white scatterer, lit from every side
    float k2 = uSnow > 0.5 ? 0.012 / w : 0.0018 / w;
    vec3 Ls = uSnow > 0.5 ? Li * 0.4 + (uCityGlow + uWinL * 0.3) * 0.25 : Li;
    col += Ls * shape * k2 * (0.35 + 0.65 * hh.x) * 0.5;
  }
  o = vec4(col, 1.0);
}
`;

// --------------------------------------------------------------------------
// COMPOSITE: glass over room (full resolution)
// --------------------------------------------------------------------------
const FS_COMPOSITE = () => GLSL_HEAD() + GLSL_LIGHT + GLSL_INTERIOR + `
uniform vec2 uRes;
uniform vec3 uCamPos, uCamFwd, uCamRight, uCamUp;
uniform vec2 uTan;
uniform sampler2D uRoom, uDefocus, uSharp, uHeight, uState;
uniform sampler2D uSharp2;       // 《一粒光》: another world, seen in the drops instead of the street
uniform float uSharpMix, uSharpGain;
uniform vec2 uSimMM;        // simulated glass size (mm)
uniform vec2 uHTex;         // height texture size (texels)
uniform float uHScale;
uniform float uTime;
uniform int uDbg;
uniform float uFrost, uFogK;     // winter frost on the inside; how heavily the inside condenses this season
uniform vec4 uGLeaf[3];          // autumn: wet leaves stuck to the outside of the glass (x, y, size, angle; size 0 = none)
out vec4 o;

vec2 rot2(vec2 v, float a){ float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
${GLSL_GLASS}
// micro-droplets of the outside mist (too many to simulate one by one): a jittered grid of
// tiny caps whose presence and size follow the local mist density M (sim-mm units)
vec3 microDrops(vec2 pm, float M){
  const float CS = 0.6;
  vec2 g = pm / CS, gi = floor(g);
  vec3 best = vec3(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
    vec2 c = gi + vec2(float(i), float(j));
    vec3 h3 = hash32(c);
    if (h3.z > 0.2 + 0.75 * M) continue;
    vec2 ctr = (c + 0.15 + 0.7 * h3.xy) * CS;
    float r = CS * (0.16 + 0.3 * fract(h3.z * 13.1)) * (0.5 + 0.5 * M);
    vec2 d = pm - ctr; float rr = dot(d, d);
    if (rr < r * r){
      float R = r / 0.94, sq = sqrt(R * R - rr), h = sq - R * 0.342;   // θ ≈ 70°
      if (h > best.x) best = vec3(h, -d / sq);
    }
  }
  return best;
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec4 room = texture(uRoom, uv);
  vec3 col = room.rgb;
  float cov = room.a;
  vec2 ndc = uv * 2.0 - 1.0;
  vec3 rd = normalize(uCamFwd + ndc.x * uTan.x * uCamRight + ndc.y * uTan.y * uCamUp);
  vec3 P = uCamPos + rd * ((GLASS_Z - uCamPos.z) / rd.z);
  vec2 guv = (P.xy - vec2(WIN_X0, WIN_Y0)) / vec2(WIN_X1 - WIN_X0, WIN_Y1 - WIN_Y0);
  vec2 pm = guv * uSimMM;
  // ---- glass state: outside mist M, trail film W, inside condensation F, wipe rim
  vec4 st = texture(uState, guv);
  float M = smoothstep(0.02, 0.9, st.r), W = st.g, Fin = min(st.b * uFogK, 1.0), rim = st.a;
  // ---- macro drops: height + gradient (condensation on the inside softens what is seen through it)
  float lod = Fin * 3.0;
  vec2 e = exp2(lod) / uHTex;
  vec2 emm = e * uSimMM;
  float h = textureLod(uHeight, guv, lod).r / uHScale;
  float hx = (textureLod(uHeight, guv + vec2(e.x, 0.0), lod).r - textureLod(uHeight, guv - vec2(e.x, 0.0), lod).r) / uHScale / (2.0 * emm.x);
  float hy = (textureLod(uHeight, guv + vec2(0.0, e.y), lod).r - textureLod(uHeight, guv - vec2(0.0, e.y), lod).r) / uHScale / (2.0 * emm.y);
  vec2 grad = vec2(hx, hy);
  // ---- micro droplets (faded when sub-pixel, and under condensation)
  float pxPerMM = 1.0 / max(length(fwidth(pm)), 1e-4);
  float aaM = smoothstep(2.5, 6.0, pxPerMM * 0.6) * (1.0 - Fin);
  float macro = smoothstep(0.0, 0.03, h);
  vec3 md = aaM > 0.01 ? microDrops(pm, M) * aaM * (1.0 - macro) : vec3(0.0);   // sub-pixel (most phones): skip
  grad += md.yz;
  // ---- trail film: thin, slightly uneven water layer
  float fn = vnoise(pm * vec2(0.9, 0.25) + 3.0) - vnoise(pm * vec2(0.9, 0.25) + vec2(3.6, 3.0));
  grad += vec2(fn, 0.0) * W * 0.05;
  float wet = max(macro, smoothstep(0.0, 0.02, md.x));
  // ---- optics. glass-local frame: x, y as world, z pointing OUT of the room.
  vec3 v = vec3(rd.xy, -rd.z);
  vec3 N = normalize(vec3(-grad, 1.0));
  vec3 dw = vec3(v.xy / NW, 0.0); dw.z = sqrt(1.0 - dot(dw.xy, dw.xy));   // in water (n·sinθ conserved by the flat glass)
  float Fw = fresnel(dot(dw, N), NW, 1.0);
  vec3 dout = refract(dw, -N, NW);
  if (dot(dout, dout) < 0.5) dout = vec3(0.0, 0.0, 1.0);
  vec3 dr = reflect(dw, N);
  vec2 tr = dr.xy * NW; float trr = dot(tr, tr);
  float trapped = step(1.0, trr);                                           // TIR again at the inner glass face
  vec3 droom = trapped > 0.5 ? vec3(0.0, 0.0, 1.0) : vec3(tr, sqrt(max(1.0 - trr, 0.0)));   // world: +z into the room
  // drop: sharp, inverted outside image + internal reflection of the room (lamp glints, dark rims)
  vec2 euv = dirToEq(vec3(dout.xy, -dout.z));
  vec3 sharpC = textureGrad(uSharp, euv, dFdx(euv) * 0.55, dFdy(euv) * 0.55).rgb;
  if (uSharpMix > 0.0) sharpC = mix(sharpC, textureGrad(uSharp2, euv, dFdx(euv) * 0.55, dFdy(euv) * 0.55).rgb * uSharpGain, uSharpMix);
  vec3 inner = mix(interiorRad(P, droom), (uAmbL * 0.4 + uAmbS) * 0.12 + uSkyL * 0.25, trapped);
  float Fg = fresnel(abs(rd.z), 1.0, NG);
  vec3 wetC = sharpC * (1.0 - Fw) * (1.0 - Fg) + inner * Fw * (1.0 - Fg) * 0.92;
  // dry glass: the defocused street, blurred further by the mist of micro droplets
  vec2 off = grad * 0.004 * vec2(1.0, uRes.x / uRes.y) / max(1.0, length(grad) * 2.0);
  float blurL = M * 2.8 + Fin * 3.4;
  vec3 dryC = textureLod(uDefocus, uv + off, blurL).rgb * (1.0 - Fg) * (1.0 - Fg);
  vec3 avgC = textureLod(uDefocus, uv, 6.5).rgb;
  dryC = mix(dryC, avgC * 1.2, M * 0.42);                                  // forward scattering veil of the mist
  vec3 through = mix(dryC, wetC, wet);
  // glass reflection of the room (inner face + outer face; ghost of the lamp)
  // inner face always reflects; the outer face only where it is dry and clear; inside fog scatters both
  vec3 refl = interiorRad(P, reflect(rd, vec3(0.0, 0.0, 1.0))) * Fg * (1.0 + 0.85 * (1.0 - M) * (1.0 - wet)) * (1.0 - 0.6 * Fin);
  // inside condensation: scatters lamp & sky light (warm veil near the lamp), dims what is behind
  vec3 Lb = BULB - P; float ld2 = dot(Lb, Lb);
  vec3 Eg = uLampI * lampEmitFactor(-Lb * inversesqrt(ld2)) * max(Lb.z * inversesqrt(ld2), 0.0) / ld2 + uSkyL * 1.2 + uAmbL;
  vec3 Lhg = uHeroP - P; float hg2 = max(dot(Lhg, Lhg), 1e-4);
  Eg += uHeroI * max(Lhg.z * inversesqrt(hg2), 0.0) / hg2;          // the little light, when it comes close to the glass
  float fogA = sat(Fin * 0.85 + rim * 0.35);
  // condensation droplets: lit from the room side (lamp, room ambient) plus the light they forward-scatter from outside
  vec3 fogC = (Eg * 0.075 + uSkyL * 0.15 + avgC * 0.68) * (0.9 + 0.2 * vnoise(pm * 2.5)) * (1.0 + 0.6 * rim);
  vec3 glass = (through * (1.0 - fogA) + fogC * fogA) + refl;
  glass += Eg * 0.0025 * M * (1.0 - Fin);                                   // mist droplets lit from inside
  // grease on the inside face: round the latch where the window gets pushed open, and in arcs from old wipes;
  // it scatters a little light, so it only shows where the lamp or the bright street catches it
  vec2 lp = P.xy - vec2(0.0, 1.42);
  float smear = smoothstep(0.52, 0.82, fbm(P.xy * vec2(9.0, 14.0) + 21.0)) * (0.2 + 0.9 * exp(-dot(lp, lp) / 0.02));
  glass += (Eg * 0.004 + avgC * 0.12) * smear;
  // dust specks (≈0.6 mm), visible only once they cover a pixel or so
  vec2 dg = P.xy * 260.0, di = floor(dg); vec3 dh = hash32(di);
  float speckPx = 0.15 / max(length(fwidth(dg)), 1e-4);
  float speck = step(0.93, dh.z) * smoothstep(0.17, 0.07, length(fract(dg) - 0.25 - 0.5 * dh.xy)) * smoothstep(0.6, 1.3, speckPx);
  glass += (Eg * 0.03 + avgC * 0.3) * speck;
  float aaG = length(fwidth(P.xy));                          // world size of a pixel on the glass
  // snowflakes resting on the outside: ice crystals scatter both the street light behind and the lamp in front
  float flake = textureLod(uHeight, guv, 0.0).g * (1.0 - 0.5 * Fin);
  if (flake > 0.0) glass = mix(glass, Eg * 0.11 + avgC * 2.2 + uSkyL * 0.25, min(flake, 1.0) * 0.9);
  // 冰花：严冬里内侧玻璃从下沿和窗框边向上结出的冰晶（脊状噪声的分形「羊齿」，越往上越稀）。它散射台灯光，擦不掉。
  if (uFrost > 0.0){
    float yb = P.y < TRANSOM_Y ? P.y - (WIN_Y0 + FW) : P.y - (TRANSOM_Y + TW);
    float xe = min(min(abs(P.x - (WIN_X0 + FW)), abs(P.x + MW)), min(abs(P.x - MW), abs(P.x - (WIN_X1 - FW))));
    float edge = min(yb, xe * 1.6);
    vec2 fq = P.xy * vec2(75.0, 60.0);
    float fern = 0.0, amp = 0.5;
    for (int k = 0; k < 4; k++){ fern += amp * (1.0 - abs(2.0 * vnoise(fq) - 1.0)); fq = FBM_R * fq * 1.1 + 5.3; amp *= 0.55; }
    float corner = min(yb, xe) + 0.6 * max(yb, xe);                 // corners grow first
    float frost = smoothstep(0.62, 0.86, fern + 0.95 - min(edge * 15.0, corner * 11.0)) * uFrost * (P.y < TRANSOM_Y ? 1.0 : 0.55);
    glass = mix(glass, Eg * 0.085 + avgC * 0.9 + uSkyL * 0.12, frost * 0.8);
  }
  // autumn: wet plane-tree leaves blown against the outside of the glass; translucent with the street light behind
  for (int i = 0; i < 3; i++){
    if (uGLeaf[i].z <= 0.0) continue;
    float Rl = uGLeaf[i].z;
    vec2 q = rot2(P.xy - uGLeaf[i].xy, uGLeaf[i].w);
    if (dot(q, q) > Rl * Rl * 1.3) continue;
    vec2 c = q - vec2(0.0, Rl * 0.35);
    float rl = length(c), al = atan(c.x, c.y);
    float lobes = 0.6 + 0.4 * pow(abs(cos(al * 2.5)), 0.6) + 0.035 * sin(al * 26.0);
    float aaL = aaG * 1.2 + 0.0003;
    float blade = smoothstep(aaL, -aaL, rl - Rl * 0.62 * lobes) * step(abs(al), 2.65);
    float stem = smoothstep(0.002 + aaL, 0.0, abs(q.x)) * step(-Rl * 0.45, q.y) * step(q.y, Rl * 0.0);
    float lf = max(blade, stem);
    if (lf <= 0.0) continue;
    float vein = smoothstep(0.0025, 0.0, abs(fract(al / 1.2566 + 0.5) - 0.5) * rl) * step(rl, Rl * 0.55);
    vec3 alb = mix(vec3(0.36, 0.20, 0.04), vec3(0.22, 0.10, 0.03), smoothstep(0.4, 0.8, vnoise(q * 60.0 + float(i) * 9.0)));
    vec3 leafC = avgC * vec3(0.55, 0.36, 0.08) * (1.0 - 0.5 * vein) + Eg * alb / PI * 0.6;
    glass = mix(glass, leafC + refl * 0.5, lf);                                // wet: it keeps a sheen
  }
  // paper-cut corner flowers: red paper glowing with the street light behind it, lit warm from the front by the lamp
  float aaW = length(fwidth(P.xy)) * 0.8 + 0.0002;
  vec2 dL = vec2(P.x - (WIN_X0 + FW), (TRANSOM_Y - TW) - P.y), dR = vec2((WIN_X1 - FW) - P.x, (TRANSOM_Y - TW) - P.y);
  float tR = atan(dR.y, dR.x) / (PI * 0.5);
  float keep = smoothstep(0.02, -0.02, tR - 0.6 - 0.12 * (vnoise(dR * 260.0) - 0.5));       // the right one has lost a piece
  float pc = max(paperCut(dL, 0.112, aaW), paperCut(dR, 0.112, aaW) * keep);
  if (pc > 0.0){
    vec3 alb = mix(vec3(0.26, 0.022, 0.02), vec3(0.42, 0.12, 0.09), 0.6 * smoothstep(0.35, 0.8, fbm(P.xy * 30.0)));   // sun-faded unevenly
    float fibre = 0.82 + 0.18 * vnoise(P.xy * vec2(1400.0, 900.0)) + 0.1 * (vnoise(P.xy * 160.0) - 0.5);
    vec3 back = mix(avgC, dryC, 0.5);
    vec3 paperC = (back * vec3(0.42, 0.035, 0.03) * (0.8 + 0.4 * vnoise(P.xy * 300.0)) + Eg * alb / PI * 0.45) * fibre;
    glass = mix(glass, paperC, pc);
  }
  // yellowed tape holding them on
  float tape = max(rectSoft(rot2(dL - vec2(0.095, 0.012), 0.5), vec2(0.011, 0.0055), vec2(aaW)), rectSoft(rot2(dR - vec2(0.012, 0.09), -0.4), vec2(0.0055, 0.011), vec2(aaW)));
  glass = mix(glass, glass * vec3(0.92, 0.8, 0.52) + Eg * vec3(0.012, 0.01, 0.006), tape * 0.75);
  col += cov * glass;
  if (uDbg == 1) col = vec3(h * 0.5, length(grad) * 0.2, wet);
  if (uDbg == 2) col = N * 0.5 + 0.5;
  if (uDbg == 3) col = sharpC * 4.0;
  if (uDbg == 4) col = vec3(Fw, trapped, 0.0);
  if (uDbg == 5) col = vec3(dirToEq(vec3(dout.xy, -dout.z)), 0.0);
  if (uDbg == 6) col = wetC * 4.0;
  if (uDbg == 7) col = inner * 4.0;
  if (uDbg == 8) col = through * 4.0;
  if (uDbg == 9) col = glass * 4.0;
  if (uDbg == 10) col = vec3(any(isnan(wetC)) || any(isinf(wetC)) ? 1.0 : 0.0, any(isnan(inner)) || any(isinf(inner)) ? 1.0 : 0.0, any(isnan(sharpC)) ? 1.0 : 0.0) + vec3(0.1) * wet;
  if (uDbg == 11) col = vec3(isnan(Fw) ? 1.0 : 0.0, isinf(Fw) ? 1.0 : 0.0, wet * 0.2);
  o = vec4(col, 1.0);
}
`;

// --------------------------------------------------------------------------
// ROOM TEMPORAL UPSAMPLING (TAAU). The room is raymarched at a reduced resolution with a
// sub-pixel jitter that changes every frame (Halton 2,3 over 16 frames). Each output pixel
// takes the nearest jittered sample, weighted by how close that sample lies to the pixel,
// and blends it into a full-resolution history reprojected with the depth. Because the room
// is static and the camera only drifts, the history converges to a supersampled image at the
// full output resolution: fine detail survives even when the raymarch runs at half resolution.
// The history is clamped to the current 3×3 neighbourhood, so lighting changes (the lamp) and
// the moving steam do not ghost; it is resampled with Catmull-Rom so it does not soften.
// --------------------------------------------------------------------------
const FS_TAA = () => GLSL_HEAD() + `
uniform sampler2D uCur, uDepth, uHist;
uniform vec2 uRes, uLowRes, uJitter;
uniform vec3 uCamPos, uCamFwd, uCamRight, uCamUp; uniform vec2 uTan;
uniform vec3 uPPos, uPFwd, uPRight, uPUp; uniform vec2 uPTan;
uniform float uReset;
out vec4 o;
vec4 histCR(vec2 uv){
  vec2 sp = uv * uRes, t1 = floor(sp - 0.5) + 0.5, f = sp - t1;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f)), w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f)), w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 t0 = (t1 - 1.0) / uRes, t3 = (t1 + 2.0) / uRes, t12 = (t1 + w2 / w12) / uRes;
  vec4 r = texture(uHist, vec2(t12.x, t0.y)) * (w12.x * w0.y) + texture(uHist, vec2(t0.x, t12.y)) * (w0.x * w12.y)
         + texture(uHist, t12) * (w12.x * w12.y) + texture(uHist, vec2(t3.x, t12.y)) * (w3.x * w12.y)
         + texture(uHist, vec2(t12.x, t3.y)) * (w12.x * w3.y);
  return max(r / (w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y), 0.0);
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 lt = 1.0 / uLowRes;
  // low-res sample k was taken at screen position (k + 0.5 + jitter) / lowRes
  vec2 lp = uv * uLowRes - 0.5 - uJitter;
  vec2 k = floor(lp + 0.5), dk = lp - k;
  vec2 suv = (k + 0.5) * lt;
  vec4 cur = texture(uCur, suv);
  float w = exp(-dot(dk, dk) * 3.0);                       // 1 on the sample, ~0.5 half a low-res pixel away
  vec4 mn = cur, mx = cur;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
    vec4 c = texture(uCur, suv + vec2(float(i), float(j)) * lt);
    mn = min(mn, c); mx = max(mx, c);
  }
  vec4 curB = texture(uCur, uv - uJitter * lt);               // bilinear at the true position (used on a reset)
  vec2 ndc = uv * 2.0 - 1.0;
  vec3 rd = normalize(uCamFwd + ndc.x * uTan.x * uCamRight + ndc.y * uTan.y * uCamUp);
  float z = texture(uDepth, suv).r;
  vec3 P = uCamPos + rd * (z / max(dot(rd, uCamFwd), 1e-3));
  vec3 d = P - uPPos; float pz = dot(d, uPFwd);
  vec2 puv = vec2(dot(d, uPRight) / pz / uPTan.x, dot(d, uPUp) / pz / uPTan.y) * 0.5 + 0.5;
  bool off = max(abs(puv.x - 0.5), abs(puv.y - 0.5)) > 0.5;
  if (uReset > 0.5 || off){ o = curB; return; }
  vec4 hist = clamp(histCR(puv), mn, mx);
  o = mix(hist, cur, 0.03 + 0.14 * w);
}`;

// --------------------------------------------------------------------------
// ROOM DEPTH OF FIELD: thin-lens circle of confusion, focus on the glass.
//   CoC(z) = A · |1/z − 1/z_f|  (angular radius, A = aperture radius)
// Golden-angle gather; a sample farther than the centre only counts if its own
// blur reaches us (keeps sharp foreground edges from being smeared by background).
// --------------------------------------------------------------------------
const FS_DOF = () => GLSL_HEAD() + `
uniform sampler2D uRoom, uDepth;
uniform vec2 uRes;
uniform float uFocus, uAperture, uPxPerRad;
out vec4 o;
float cocPx(float z){ return min(uAperture * abs(1.0 / max(z, 0.05) - 1.0 / uFocus) * uPxPerRad, 22.0); }
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec4 c0 = texture(uRoom, uv);
  float z0 = texture(uDepth, uv).r;
  float coc = cocPx(z0);
  if (coc < 0.75){ o = c0; return; }
  vec4 acc = c0; float ws = 1.0;
  float rot = hash12(gl_FragCoord.xy) * 6.2832;
  for (int i = 0; i < 24; i++){
    float fi = float(i) + 0.5;
    float r = sqrt(fi / 24.0) * coc;
    float a = fi * 2.39996 + rot;
    vec2 q = uv + vec2(cos(a), sin(a)) * r / uRes;
    vec4 cs = texture(uRoom, q);
    float zs = texture(uDepth, q).r;
    float w = zs < z0 + 0.01 ? 1.0 : sat(cocPx(zs) - r + 1.0);
    acc += cs * w; ws += w;
  }
  o = acc / ws;
}`;

// --------------------------------------------------------------------------
// BLOOM: no threshold — a small, energy-conserving fraction of the light is
// scattered by the lens (13-tap downsample chain + tent upsample, Jimenez 2014).
// --------------------------------------------------------------------------
const FS_DOWN = () => GLSL_HEAD() + `
uniform sampler2D uSrc; uniform vec2 uTexel; uniform vec2 uRes; uniform int uFirst;
out vec4 o;
vec3 T(vec2 uv, float x, float y){ return texture(uSrc, uv + vec2(x, y) * uTexel).rgb; }
vec3 karis(vec3 a, vec3 b, vec3 c, vec3 d){
  // Karis average on the first level suppresses single-pixel fireflies (glints in drops)
  float wa = 1.0 / (1.0 + dot(a, vec3(0.2126, 0.7152, 0.0722))), wb = 1.0 / (1.0 + dot(b, vec3(0.2126, 0.7152, 0.0722)));
  float wc = 1.0 / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722))), wd = 1.0 / (1.0 + dot(d, vec3(0.2126, 0.7152, 0.0722)));
  return (a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd);
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 a = T(uv,-2.,-2.), b = T(uv,0.,-2.), c = T(uv,2.,-2.), d = T(uv,-1.,-1.), e = T(uv,1.,-1.), f = T(uv,-2.,0.), g = T(uv,0.,0.);
  vec3 h = T(uv,2.,0.), i = T(uv,-1.,1.), j = T(uv,1.,1.), k = T(uv,-2.,2.), l = T(uv,0.,2.), m = T(uv,2.,2.);
  vec3 col;
  if (uFirst == 1) col = karis(d, e, i, j) * 0.5 + karis(a, b, f, g) * 0.125 + karis(b, c, g, h) * 0.125 + karis(f, g, k, l) * 0.125 + karis(g, h, l, m) * 0.125;
  else col = (d + e + i + j) * 0.125 + (a + b + f + g + b + c + g + h + f + g + k + l + g + h + l + m) * 0.03125;
  o = vec4(col, 1.0);
}`;
const FS_UP = () => GLSL_HEAD() + `
uniform sampler2D uSrc; uniform vec2 uTexel; uniform vec2 uRes; uniform float uRadius;
out vec4 o;
void main(){
  vec2 uv = gl_FragCoord.xy / uRes; vec2 d = uTexel * uRadius;
  vec3 c = texture(uSrc, uv).rgb * 4.0;
  c += (texture(uSrc, uv + vec2(-d.x, 0.0)).rgb + texture(uSrc, uv + vec2(d.x, 0.0)).rgb + texture(uSrc, uv + vec2(0.0, -d.y)).rgb + texture(uSrc, uv + vec2(0.0, d.y)).rgb) * 2.0;
  c += texture(uSrc, uv - d).rgb + texture(uSrc, uv + d).rgb + texture(uSrc, uv + vec2(d.x, -d.y)).rgb + texture(uSrc, uv + vec2(-d.x, d.y)).rgb;
  o = vec4(c / 16.0, 1.0);
}`;

// --------------------------------------------------------------------------
// FINAL: lens (CA, bloom, vignette) → exposure → ACES → grade → sRGB → grain, dither
// --------------------------------------------------------------------------
const FS_FINAL = () => GLSL_HEAD() + `
uniform sampler2D uHdr, uBloom;
uniform vec2 uRes, uTan;
uniform float uExposure, uTime, uBloomStr, uGrain, uFrame;
out vec4 o;
const mat3 ACESIn = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
const mat3 ACESOut = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
vec3 aces(vec3 v){ v = ACESIn * v; vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return clamp(ACESOut * (a / b), 0.0, 1.0); }
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 d = uv - 0.5;
  // lateral chromatic aberration: ~1 px at the corners, none in the centre
  vec2 ca = d * dot(d, d) * (2.4 / uRes.x) * 2.0;
  vec3 c = vec3(texture(uHdr, uv - ca).r, texture(uHdr, uv).g, texture(uHdr, uv + ca).b);
  // lens scatter: a few percent of the energy, slightly warm (film halation)
  vec3 bl = texture(uBloom, uv).rgb / 6.0 * vec3(1.06, 0.98, 0.9);   // the chain sums 6 levels
  c = mix(c, bl, uBloomStr);
  // natural vignetting ~cos⁴ of the field angle, softened
  vec2 ta = (uv * 2.0 - 1.0) * uTan;
  float c4 = 1.0 / pow(1.0 + dot(ta, ta), 2.0);
  c *= mix(1.0, c4, 0.6) * uExposure;
  c = aces(c);
  // grade in display-linear: faint teal in the shadows, amber in the highlights, slight desaturation
  float L = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c *= mix(vec3(0.94, 1.01, 1.04), vec3(1.03, 1.0, 0.95), smoothstep(0.05, 0.6, L));
  c = mix(vec3(L), c, 0.95);
  c = toSRGB(c);
  // faded print: blacks lifted a little and never neutral-black
  c = c * (1.0 - 0.024) + vec3(0.022, 0.024, 0.026);
  // film grain: triangular noise, strongest in the mid-tones, re-seeded every frame
  float fr = mod(uFrame, 64.0);
  float g = hash12(gl_FragCoord.xy * 0.937 + vec2(fr * 17.13, fr * 7.71)) + hash12(gl_FragCoord.xy * 1.213 + vec2(fr * 3.37 + 11.0, fr * 13.1)) - 1.0;
  float Ls = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c += g * uGrain * (0.35 + 2.2 * Ls * (1.0 - Ls));
  float n = hash12(gl_FragCoord.xy + fr * 91.0) + hash12(gl_FragCoord.xy * 1.37 + 17.0 + fr * 37.0) - 1.0;
  o = vec4(c + n / 255.0, 1.0);
}
`;
const FS_BLIT = () => GLSL_HEAD() + `
uniform sampler2D uTex; uniform vec2 uRes; uniform float uScale; uniform int uChan;
out vec4 o;
void main(){ vec4 t = texture(uTex, gl_FragCoord.xy / uRes); vec3 c = uChan == 1 ? vec3(t.a) : uChan == 2 ? t.rrr : t.rgb; o = vec4(pow(c * uScale / (1.0 + c * uScale), vec3(1.0 / 2.2)), 1.0); }
`;

/* ============================================================================
   WebGL plumbing
   ========================================================================== */
const canvas = document.getElementById('c');
let gl = null, caps = {};
function fail(msg) {
  console.warn(msg);
  document.getElementById('fallback').style.display = 'flex';
  document.getElementById('veil').classList.add('gone');
}

function compile(type, src, name) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  return s;
}
function makeProgram(name, vsrc, fsrc) {
  const p = gl.createProgram();
  const vs = compile(gl.VERTEX_SHADER, vsrc, name), fs = compile(gl.FRAGMENT_SHADER, fsrc, name);
  gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
  return { name, p, vs, fs, vsrc, fsrc, u: {} };
}
function checkProgram(pr) {
  if (!gl.getProgramParameter(pr.p, gl.LINK_STATUS)) {
    const log = (gl.getShaderInfoLog(pr.vs) || '') + '\n' + (gl.getShaderInfoLog(pr.fs) || '') + '\n' + (gl.getProgramInfoLog(pr.p) || '');
    const lines = pr.fsrc.split('\n');
    const m = /ERROR: \d+:(\d+)/.exec(log);
    const ctx = m ? lines.slice(Math.max(0, m[1] - 3), +m[1] + 2).join('\n') : '';
    throw new Error(`shader "${pr.name}" failed:\n${log}\n${ctx}`);
  }
  const n = gl.getProgramParameter(pr.p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(pr.p, i);
    const nm = info.name.replace(/\[0\]$/, '');
    pr.u[nm] = gl.getUniformLocation(pr.p, info.name);
  }
}
// uniform setter: infers the type from the value
function U(pr, name, v) {
  const loc = pr.u[name]; if (loc === undefined || loc === null) return;
  if (typeof v === 'number') gl.uniform1f(loc, v);
  else if (v.int !== undefined) gl.uniform1i(loc, v.int);
  else if (v.length === 2) gl.uniform2fv(loc, v);
  else if (v.length === 3) gl.uniform3fv(loc, v);
  else if (v.length === 4) gl.uniform4fv(loc, v);
  else gl.uniform4fv(loc, v);
}
const I = n => ({ int: n });

function makeTex(w, h, fmt, opts = {}) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  const F = {
    rgba16f: [gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT],
    r16f: [gl.R16F, gl.RED, gl.HALF_FLOAT],
    rg16f: [gl.RG16F, gl.RG, gl.HALF_FLOAT],
    rgba8: [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE],
  }[fmt];
  const levels = opts.mips ? Math.floor(Math.log2(Math.max(w, h))) + 1 : 1;
  gl.texStorage2D(gl.TEXTURE_2D, levels, F[0], w, h);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, opts.mips ? gl.LINEAR_MIPMAP_LINEAR : opts.nearest ? gl.NEAREST : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, opts.nearest ? gl.NEAREST : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return { t, w, h, fmt, mips: !!opts.mips };
}
function makeTarget(w, h, fmts, opts = {}) {
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  const texs = fmts.map(f => makeTex(w, h, f, opts));
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  texs.forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t.t, 0));
  if (texs.length > 1) gl.drawBuffers(texs.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
  const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (st !== gl.FRAMEBUFFER_COMPLETE) throw new Error('framebuffer incomplete ' + st + ' ' + fmts);
  return { fb, w, h, tex: texs[0], texs };
}
function freeTarget(t) { if (!t) return; gl.deleteFramebuffer(t.fb); t.texs.forEach(x => gl.deleteTexture(x.t)); }
function bindTarget(t) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fb : null);
  if (t) gl.viewport(0, 0, t.w, t.h); else gl.viewport(0, 0, canvas.width, canvas.height);
}
function bindTex(pr, name, tex, unit) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex.t || tex);
  const loc = pr.u[name]; if (loc) gl.uniform1i(loc, unit);
}
let emptyVAO;
function drawFull() { gl.bindVertexArray(emptyVAO); gl.drawArrays(gl.TRIANGLES, 0, 3); }

/* ============================================================================
   Outside world: street lamps, signs, cars (JS side, uploaded as sprites)
   ========================================================================== */
const OUT = { lights: [], cars: [], peds: [], nextPed: 3, nextCar: 6 + rnd() * 10, sprites: new Float32Array(12 * 240), count: 0 };
function buildOutside() {
  const GY = S.GROUND_Y, L = OUT.lights, F = S.FACADE_Z;
  const add = (o) => L.push(Object.assign({ core: 0.08, refl: 0, halo: 0.1, haloR: 0.03, kind: 0, flags: 0, ph: rnd() * 10 }, o));
  // street lamps: high-pressure sodium (~2050 K). Far side visible through the glass, near side only via drops
  OUT.lamps = [-31, -4.5, 21, 46];
  for (const x of OUT.lamps) add({ p: [x, GY + 6.4, S.CURB_Z - 0.6], c: bb(2050), E: 0.010, core: 0.22, refl: 1, halo: 0.32, haloR: 0.05, kind: 1 });
  for (const x of [-15, 13]) add({ p: [x, GY + 6.4, -4.2], c: bb(2100), E: 0.016, core: 0.22, refl: 1, halo: 0.32, haloR: 0.05, kind: 1 });
  // neon / lightboxes on the shopfronts: tubes are many overlapping sprites so their bokeh smears into a bar
  // signs keep their shop's hours (the pharmacy cross never goes out)
  const tube = (x0, y0, x1, y1, n, c, E, kind, hours) => { for (let i = 0; i < n; i++) { const t = n === 1 ? 0.5 : i / (n - 1); add({ p: [lerp(x0, x1, t), GY + lerp(y0, y1, t), F + 0.5], c, E: E / n, core: 0.06, refl: 1, halo: 0.25, haloR: 0.03, kind, hours }); } };
  tube(-6.2, 3.3, -6.2, 6.6, 12, [1.0, 0.13, 0.22], 0.0042, 2, [10, 23.5]);   // vertical red-pink sign
  tube(2.2, 3.85, 5.6, 3.85, 11, [0.25, 0.92, 1.0], 0.0032, 3, [8, 22]);     // cyan tube (old, flickers)
  tube(8.6, 4.2, 8.6, 5.7, 6, [0.22, 1.0, 0.42], 0.0018, 2, [0, 24]);        // green pharmacy cross
  tube(7.85, 4.95, 9.35, 4.95, 6, [0.22, 1.0, 0.42], 0.0018, 2, [0, 24]);
  tube(-14.5, 3.6, -10.5, 3.6, 10, bb(2500), 0.0034, 2, [7, 21.5]);         // warm lightbox
  // red lanterns hanging at a small restaurant, swaying a little in the wind
  for (let i = 0; i < 3; i++) add({ p: [-2.6 + i * 1.1, GY + 3.2, F + 1.4], c: [1.0, 0.22, 0.07], E: 0.0011, core: 0.18, refl: 1, halo: 0.3, haloR: 0.035, kind: 7, hours: [10, 23] });
  // a couple of bare bulbs in windows / under awnings
  for (const [x, y] of [[0.6, 7.6], [6.2, 4.6], [-9.4, 7.9]]) add({ p: [x, GY + y, F + 0.3], c: bb(2500), E: 0.0006, core: 0.05, refl: 1, halo: 0.2, haloR: 0.02, kind: 8 });
  // traffic light at the junction (cycles red / green)
  add({ p: [7.6, GY + 5.0, S.CURB_Z + 1.2], c: [1, 0.08, 0.04], E: 0.0011, core: 0.12, refl: 1, halo: 0.3, haloR: 0.03, kind: 4 });
  add({ p: [7.6, GY + 4.6, S.CURB_Z + 1.2], c: [0.15, 1.0, 0.65], E: 0.0011, core: 0.12, refl: 1, halo: 0.3, haloR: 0.03, kind: 5 });
  // the far city: lit windows of towers seen above the opposite roofs (occlusion tested in the vertex shader)
  for (let i = 0; i < 90; i++) {
    const x = -110 + rnd() * 230, y = GY + 4 + Math.pow(rnd(), 1.3) * 60;
    const T = rnd() < 0.75 ? 2300 + rnd() * 1500 : 4500 + rnd() * 2500;
    add({ p: [x, y, S.FAR_Z + 4 + rnd() * 12], c: bb(T, 0.9), E: 0.00012 + 0.00045 * rnd() ** 2, core: 0.5, halo: 0.12, haloR: 0.02, flags: 1 });
  }
  // red aviation obstruction lights on tower tops: slow blink
  for (const x of [-37, 12, 64]) add({ p: [x, 0, S.FAR_Z], c: [1, 0.05, 0.03], E: 0.0007, core: 0.6, halo: 0.35, haloR: 0.03, kind: 6, flags: 2 });
}
function spawnCar() {
  const dir = rnd() < 0.5 ? 1 : -1;
  const lane = dir > 0 ? -21.5 - rnd() * 0.8 : -17.0 - rnd() * 0.8;   // far lanes: visible through the lower panes
  const near = rnd() < 0.3;
  const bus = !near && rnd() < 0.2 && !OUT.cars.some(c => c.bus) && WORLD.tod > 6 && WORLD.tod < 22;   // buses run 6:00–22:00
  OUT.cars.push({ x: -dir * 75, z: near ? (dir > 0 ? -9.5 : -6) : lane, dir, v: bus ? 3.6 + rnd() : 4.2 + rnd() * 2.6, I: 0.8 + rnd() * 0.4, age: 0, bus });
}
// 雨里打伞走过对街的人
function spawnPed(x) {
  const dir = rnd() < 0.5 ? 1 : -1;
  OUT.peds.push({ x: x !== undefined ? x : -dir * (26 + rnd() * 8), z: S.CURB_Z - 1.2 - rnd() * 1.8, dir, v: 0.85 + rnd() * 0.5, kind: Math.floor(rnd() * 5), ph: rnd() * 6 });
}
function updateOutside(dt, t) {
  OUT.nextPed -= dt;
  if (OUT.nextPed < 0 && OUT.peds.length < 5) { spawnPed(); OUT.nextPed = (5 + rnd() * 12) / Math.max(curve(WALKERS, WORLD.tod), 0.04); }
  for (const p of OUT.peds) { p.x += p.dir * p.v * dt; p.ph += dt * p.v * 5.5; }
  OUT.peds = OUT.peds.filter(p => Math.abs(p.x) < 36);
  OUT.nextCar -= dt;
  if (OUT.nextCar < 0) { spawnCar(); OUT.nextCar = (9 + rnd() * 24) / Math.max(curve(TRAFFIC, WORLD.tod), 0.05); }
  for (const c of OUT.cars) { c.x += c.dir * c.v * dt; c.age += dt; }
  OUT.cars = OUT.cars.filter(c => Math.abs(c.x) < 80);
}
function pushSprite(i, p, E, elong, core, halo, haloR, flags = 0) {
  const a = OUT.sprites, o = i * 12;
  a[o] = p[0]; a[o + 1] = p[1]; a[o + 2] = p[2]; a[o + 3] = core;
  a[o + 4] = E[0]; a[o + 5] = E[1]; a[o + 6] = E[2]; a[o + 7] = elong;
  a[o + 8] = halo; a[o + 9] = haloR; a[o + 10] = flags; a[o + 11] = 0;
}
function buildSprites(t, eye) {
  let n = 0;
  const GY = S.GROUND_Y;
  const emit = (p, c, E, l) => {
    const d2 = V.dot(V.sub(p, eye), V.sub(p, eye));
    if (n >= 238) return;
    pushSprite(n++, p, mulc(c, E), 1, l.core, l.halo, l.haloR, l.flags || 0);
    if (l.refl && n < 238) {
      // 湿路面的镜面反射：光源关于地面镜像，粗糙水面把反射拉成竖直光柱（能量 × 掠射菲涅尔 ~0.3）
      const pr = [p[0], 2 * GY - p[1] + 0.5, p[2] + 0.5];
      pushSprite(n++, pr, mulc(c, E * 0.32), 5.5, l.core, l.halo * 0.6, l.haloR);
    }
  };
  const Wu = WORLD.U, tod = WORLD.tod;
  for (const l of OUT.lights) {
    let E = l.E;
    let c = l.c;
    if (l.kind === 1) { E *= Wu.lampsOut; c = mix3(c, mulc(Wu.lampCol, 1 / Math.max(lum3(Wu.lampCol), 1e-3)), 1 - WORLD.lampWarm); }
    if (l.hours && !(tod >= l.hours[0] && tod <= l.hours[1])) continue;
    if (l.kind === 8 && l.ph / 10 > Wu.occ * 2.2) continue;
    if (l.flags === 1) E *= 0.3 + 1.7 * Wu.occ;
    if (l.kind === 3) E *= (Math.sin(t * 31 + l.ph) > -0.97 ? 1 : 0.25) * (0.94 + 0.06 * Math.sin(t * 2.3 + l.ph));
    if (l.kind === 2) E *= 0.96 + 0.04 * Math.sin(t * 1.7 + l.ph);
    if (l.kind === 4 || l.kind === 5) { const ph = (t % 46) / 46; const red = ph < 0.55; E *= (l.kind === 4) === red ? 1 : 0.03; }
    if (l.kind === 6) E *= Math.pow(Math.max(0, Math.sin(t * Math.PI / 1.6 + l.ph)), 2);
    if (E <= 1e-7) continue;
    let p = l.p;
    if (l.kind === 7) p = [p[0] + 0.06 * Math.sin(t * 1.3 + l.ph) + 0.03 * Math.sin(t * 2.9 + l.ph * 2), p[1], p[2]];
    if (E <= 1e-7) continue;
    emit(p, c, E, l);
  }
  // cars: headlights brighten as the car faces us, taillights glow red from behind
  const head = bb(4300, 0.8), tail = [1, 0.06, 0.03];
  for (const c of OUT.cars) {
    const toEye = V.norm(V.sub(eye, [c.x, GY + 0.7, c.z]));
    const facing = Math.max(0, c.dir * toEye[0]);
    const fade = smooth(0, 3, c.age);
    // a headlamp lens still glows well off-axis (≈20% seen side-on); the beam itself is narrow (~facing³)
    const hE = 0.0032 * c.I * (0.2 + 0.8 * facing ** 3) * fade;
    const tE = 0.0008 * c.I * (0.45 + 0.55 * Math.max(0, -c.dir * toEye[0]) ** 2) * fade;
    const half = c.bus ? 5.6 : 2.15, zs = c.bus ? [1.3] : [-0.75, 0.75];
    for (const dz of zs) {
      if (n > 230) break;
      emit([c.x + c.dir * half, GY + 0.68, c.z + dz], head, hE * (c.bus ? 1.3 : 1), { core: 0.09, refl: 1, halo: 0.35, haloR: 0.04 });
      emit([c.x - c.dir * half, GY + 0.82, c.z + dz], tail, tE, { core: 0.06, refl: 1, halo: 0.25, haloR: 0.03 });
    }
  }
  OUT.count = n;
}

/* ============================================================================
   RAIN ON GLASS — CPU simulation in physical millimetres
   ----------------------------------------------------------------------------
   真实物理（量纲为 mm、s、N）：
   · 水滴是球冠：V = π R³ (1−cosθ)² (2+cosθ) / 3，R = r / sinθ（r 接触半径，θ 接触角）。
   · 竖直玻璃上，重力 F_g = ρ g V 对抗接触角滞后造成的钉扎力（Furmidge 方程）
       F_pin = γ · 2r · Δcosθ ,  γ = 0.072 N/m
     ⇒ 临界半径 r_c = sqrt(2γΔcos / (ρ g k_V)) ≈ 1.7–2.2 mm（与实测相符）。
   · 滑动是过阻尼的：v = (F_g − F_kin) / (β r)，耗散正比于接触线长度；
     动滞后略小于静滞后 ⇒ 遇到「脏点」会停下再走（stick-slip）。
   · 静态的「玻璃不均匀场」调制 Δcos；已湿润的水痕 Δcos 更低。
     水滴沿横向梯度偏向阻力小的一侧 ⇒ 自然蜿蜒，并倾向沿旧水痕走。
   · 合并：体积守恒，位置取质心，速度按动量守恒。
   · 滑动时：扫过雾珠层并吸收其水量；留下约 6μm 的水膜（随后蒸发/收缩）；
     按概率在尾部脱落小珠（pearling），体积从母滴中扣除。
   · 撞击：Poisson 到达；直径服从 Marshall–Palmer N(D) ∝ e^(−ΛD)，Λ = 4.1·R^−0.21；
     D > 2.2 mm 的大滴溅出 2–5 颗卫星滴（体积守恒）。
   近似：
   · 显示时按 MAG 倍放大（物理仍按真实毫米计算）。真实尺度下 1 米外的雨滴只有
     2–3 个像素，看不到透镜成像。这是「记忆里的放大」，也是本作品最主要的艺术取舍。
   · 雾珠（< 0.5 mm）不逐颗模拟，用 0.5 mm 网格上的连续密度场表示，
     渲染时再程序化地还原成小水珠。
   ========================================================================== */
const MAG = 8.0;
const SIM = {};
const RHO_G = 9.81e-6;        // ρ g : newtons per mm³ of water
const GAM2 = 1.44e-4;         // 2γ : N per mm of contact width
const BETA = 1.15e-6;         // contact-line dissipation (N·s / mm²) → 1–5 cm/s for mm-sized drops
const kV = th => Math.PI * (1 - Math.cos(th)) ** 2 * (2 + Math.cos(th)) / (3 * Math.sin(th) ** 3);
function hashI(i, j) { let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) | 0; h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; }
function vnoiseJS(x, y) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return lerp(lerp(hashI(i, j), hashI(i + 1, j), u), lerp(hashI(i, j + 1), hashI(i + 1, j + 1), u), v);
}
(function initSim() {
  const W = (S.WIN_X1 - S.WIN_X0) * 1000 / MAG, H = (S.WIN_Y1 - S.WIN_Y0) * 1000 / MAG;
  Object.assign(SIM, { W, H, n: 0, MAX: 2600, rain: 0.55, rainBase: 0.55, clock: 0, events: [] });
  SIM.panes = S.PANES.map(p => [(p[0] - S.WIN_X0) * 1000 / MAG, (p[1] - S.WIN_Y0) * 1000 / MAG, (p[2] - S.WIN_X0) * 1000 / MAG, (p[3] - S.WIN_Y0) * 1000 / MAG]);
  SIM.paneArea = SIM.panes.map(p => (p[2] - p[0]) * (p[3] - p[1]));
  const M = SIM.MAX, F = () => new Float32Array(M);
  Object.assign(SIM, { x: F(), y: F(), r: F(), V: F(), vx: F(), vy: F(), th: F(), hy: F(), seed: F(), age: F(), wob: F(), lat: F(), acc: F(), born: F(),
                       slide: new Uint8Array(M), act: new Uint8Array(M), pane: new Uint8Array(M) });
  SIM.CELL = 0.5;
  SIM.GW = Math.ceil(W / SIM.CELL); SIM.GH = Math.ceil(H / SIM.CELL);
  const N = SIM.GW * SIM.GH;
  SIM.Mi = new Float32Array(N);      // outside mist density 0..1
  SIM.Wt = new Float32Array(N);      // residual trail film 0..1
  SIM.Fin = new Float32Array(N);     // inside condensation 0..1
  SIM.F0 = new Float32Array(N);      // its equilibrium pattern
  SIM.nuc = new Float32Array(N);     // nucleation speed (static, speckled regrowth)
  SIM.rim = new Float32Array(N);     // water pushed to the edge of a wipe
  SIM.het = new Float32Array(N);     // glass heterogeneity (multiplies Δcosθ)
  SIM.tex = new Uint8Array(N * 4);
  for (let j = 0; j < SIM.GH; j++) for (let i = 0; i < SIM.GW; i++) {
    const k = j * SIM.GW + i, x = i * SIM.CELL, y = j * SIM.CELL;
    SIM.het[k] = 0.5 + 1.0 * (0.62 * vnoiseJS(x / 4.2, y / 4.2) + 0.38 * vnoiseJS(x / 1.3 + 50, y / 1.3));
    // condensation forms first at the cold bottom of each pane and along its edges
    let f0 = 0.05;
    for (const p of SIM.panes) if (x >= p[0] - 1 && x <= p[2] + 1 && y >= p[1] - 1 && y <= p[3] + 1) {
      // the fog line is ragged: its height wanders along the pane
      const yf = (y - p[1]) / (p[3] - p[1]) + 0.16 * (vnoiseJS(x / 14, 3.7) - 0.5) + 0.06 * (vnoiseJS(x / 4, 9.1) - 0.5);
      const edge = Math.min(x - p[0], p[2] - x, y - p[1], p[3] - y);
      f0 = 0.06 + 0.56 * Math.pow(1 - smooth(0.0, 0.25, yf), 1.6) + 0.16 * Math.exp(-Math.max(edge, 0) / 5);
      // condensed droplets that grew heavy and ran down, leaving clear wavy lines in the fog
      const col = Math.floor(x / 13), cx = (col + 0.2 + 0.6 * hashI(col, 31)) * 13;
      if (hashI(col, 77) < 0.4) {
        const top = p[1] + (p[3] - p[1]) * (0.1 + 0.32 * hashI(col, 5));
        const wx = cx + 0.25 * Math.sin(y * 0.22 + col) + 0.12 * Math.sin(y * 0.9);
        if (y < top) f0 *= 0.25 + 0.75 * smooth(0.3, 0.8, Math.abs(x - wx));
      }
    }
    f0 *= 0.75 + 0.5 * vnoiseJS(x / 11, y / 8 + 20);
    f0 += 0.06 * (vnoiseJS(x / 2, y / 2 + 70) - 0.5);
    SIM.F0[k] = clamp(f0, 0, 0.95);
    SIM.Fin[k] = SIM.F0[k];
    SIM.nuc[k] = 0.3 + 1.4 * hashI(i + 999, j);
    SIM.Mi[k] = 0.75 + 0.2 * vnoiseJS(x / 7, y / 7 + 40);
  }
  SIM.GCELL = 5;   // merge hash cell (mm)
  SIM.HW = Math.ceil(W / SIM.GCELL); SIM.HH = Math.ceil(H / SIM.GCELL);
  SIM.head = new Int32Array(SIM.HW * SIM.HH); SIM.next = new Int32Array(M);
  SIM.inst = new Float32Array((M + 200) * 8);
  SIM.flakes = [];                    // snowflakes resting on the glass, melting
})();
const gidx = (x, y) => clamp(Math.floor(y / SIM.CELL), 0, SIM.GH - 1) * SIM.GW + clamp(Math.floor(x / SIM.CELL), 0, SIM.GW - 1);
function paneOf(x, y) { for (let k = 0; k < 4; k++) { const p = SIM.panes[k]; if (x >= p[0] && x <= p[2] && y >= p[1] && y <= p[3]) return k; } return -1; }
function addDrop(x, y, V, pane, slide = 0) {
  if (SIM.n >= SIM.MAX || V <= 0) return -1;
  const i = SIM.n++;
  const th = (32 + 20 * rnd()) * Math.PI / 180;
  SIM.x[i] = x; SIM.y[i] = y; SIM.V[i] = V; SIM.th[i] = th; SIM.r[i] = Math.cbrt(V / kV(th));
  SIM.hy[i] = 0.14 + 0.46 * rnd() ** 2;             // Δcosθ of this drop: weathered glass, impurities (0.14–0.6)
  SIM.vx[i] = 0; SIM.vy[i] = 0; SIM.seed[i] = rnd(); SIM.age[i] = 0; SIM.wob[i] = 0; SIM.lat[i] = 0; SIM.acc[i] = 0;
  SIM.slide[i] = slide; SIM.act[i] = 1; SIM.pane[i] = pane;
  // the new drop absorbs the mist under its footprint (volume conserved)
  SIM.V[i] += collect(x, y, x, y, SIM.r[i] * 0.9, 0);
  SIM.r[i] = Math.cbrt(SIM.V[i] / kV(th));
  return i;
}
// sweep a capsule over the grids: collect mist volume, lay down trail film
const MIST_FILM = 0.010;      // mm of water equivalent held by a fully misted glass
function collect(x0, y0, x1, y1, w, film) {
  const C = SIM.CELL, GW = SIM.GW;
  const ia = clamp(Math.floor((Math.min(x0, x1) - w) / C), 0, GW - 1), ib = clamp(Math.floor((Math.max(x0, x1) + w) / C), 0, GW - 1);
  const ja = clamp(Math.floor((Math.min(y0, y1) - w) / C), 0, SIM.GH - 1), jb = clamp(Math.floor((Math.max(y0, y1) + w) / C), 0, SIM.GH - 1);
  const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy + 1e-9;
  let vol = 0;
  for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) {
    const px = (i + 0.5) * C - x0, py = (j + 0.5) * C - y0;
    const t = clamp((px * dx + py * dy) / L2, 0, 1);
    const ex = px - dx * t, ey = py - dy * t;
    const d2 = ex * ex + ey * ey;
    if (d2 > w * w) continue;
    const k = j * GW + i;
    vol += SIM.Mi[k] * MIST_FILM * C * C;
    SIM.Mi[k] = 0;
    if (film > 0) SIM.Wt[k] = Math.max(SIM.Wt[k], film * (1 - d2 / (w * w) * 0.5));
  }
  return vol;
}
function removeDrop(i) { SIM.r[i] = 0; }
function compact() {
  let j = 0;
  const keys = ['x', 'y', 'r', 'V', 'vx', 'vy', 'th', 'hy', 'seed', 'age', 'wob', 'lat', 'acc', 'slide', 'act', 'pane'];
  for (let i = 0; i < SIM.n; i++) {
    if (SIM.r[i] <= 0) continue;
    if (i !== j) for (const k of keys) SIM[k][j] = SIM[k][i];
    j++;
  }
  SIM.n = j;
}
function rainImpact() {
  const SE = SEASONS[WORLD.season];
  // Marshall–Palmer drop-size distribution, truncated to the visible range (the season scales the rain rate:
  // spring drizzle has few big drops, a summer downpour many)
  const R = (1.5 + 34 * SIM.rain * SIM.rain) * SE.rainR;    // rain rate, mm/h
  const Lam = 4.1 * Math.pow(R, -0.21);
  const Dmin = 0.6, Dmax = 5.0;
  const D = Dmin - Math.log(1 - rnd() * (1 - Math.exp(-Lam * (Dmax - Dmin)))) / Lam;
  let V = Math.PI * D * D * D / 6;
  // position: uniform over the glass area
  let a = rnd() * SIM.paneArea.reduce((s, v) => s + v, 0), k = 0;
  while (a > SIM.paneArea[k] && k < 3) a -= SIM.paneArea[k++];
  const p = SIM.panes[k];
  const x = p[0] + rnd() * (p[2] - p[0]), y = p[1] + rnd() * (p[3] - p[1]);
  if (SE.snow) {
    // 雪花落在玻璃上：停留几秒，被玻璃（室内一侧是暖的）慢慢化开，最后变成一颗等水量的小水滴
    if (SIM.flakes.length < 320) SIM.flakes.push({ x, y, r: 0.7 + 1.6 * rnd() ** 1.5, rot: rnd() * 6.283, age: 0, melt: 8 + 14 * rnd(), seed: rnd(), pane: k });
    if (SIM.events.length < 64) SIM.events.push({ type: 'flake', x, y });
    return;
  }
  if (D > 2.2) {                                             // splash: satellites share ~28% of the volume
    const ns = 2 + Math.floor(rnd() * 4), vs = V * 0.28;
    for (let s = 0; s < ns; s++) {
      const ang = rnd() * Math.PI * 2, dist = (1.5 + 2.5 * rnd()) * D;
      const sx = x + Math.cos(ang) * dist, sy = y + Math.sin(ang) * dist * 0.7;
      const pk = paneOf(sx, sy);
      if (pk >= 0) addDrop(sx, sy, vs / ns, pk);
    }
    V *= 0.72;
  }
  const i = addDrop(x, y, V, k);
  if (i >= 0 && SIM.events.length < 64) SIM.events.push({ type: 'hit', x, y, D });
}
// heterogeneity-weighted Δcosθ at a point (wet trails lower it)
function dcos(i, x, y) { const k = gidx(x, y); return SIM.hy[i] * SIM.het[k] * (1 - 0.55 * SIM.Wt[k]); }

function simStep(dt) {
  // 雨不会一直一样大：在滑杆设定的雨势附近，以几分钟为周期缓慢地时大时小（声音随之起伏）
  SIM.clock += dt;
  const c = SIM.clock, swell = 0.5 + 0.22 * Math.sin(c / 37 + 1.3) + 0.17 * Math.sin(c / 83 + 4.1) + 0.11 * Math.sin(c / 151);
  SIM.rain = clamp(SIM.rainBase * (0.62 + 0.76 * swell), 0, 1);
  // 1) rain arrivals (Poisson)
  const lam = (0.5 + 160 * Math.pow(SIM.rain, 1.25)) * SEASONS[WORLD.season].rate * dt;   // impacts per second over the whole window
  let k = 0; const L = Math.exp(-lam); let p = rnd();
  while (p > L && k < 20) { k++; p *= rnd(); }
  for (let q = 0; q < k; q++) rainImpact();
  for (const f of SIM.flakes) {
    f.age += dt;
    if (f.age > f.melt) { f.done = true; addDrop(f.x, f.y, 0.07 * f.r ** 3, f.pane); }   // meltwater: ~0.07 r³ mm³ (a dendrite is mostly air)
  }
  if (SIM.flakes.some(f => f.done)) SIM.flakes = SIM.flakes.filter(f => !f.done);
  // 2) forces & motion
  for (let i = 0; i < SIM.n; i++) {
    const r = SIM.r[i]; if (r <= 0) continue;
    SIM.age[i] += dt; SIM.wob[i] *= Math.exp(-dt / 0.18);
    const V = SIM.V[i], x = SIM.x[i], y = SIM.y[i];
    const Fg = RHO_G * V;
    const dc = dcos(i, x, y - 0.6 * r);
    const Fs = GAM2 * r * dc;
    if (!SIM.slide[i]) {
      if (Fg <= Fs) continue;
      SIM.slide[i] = 1;
    }
    const Fk = Fs * 0.8;
    if (Fg <= Fk) { SIM.slide[i] = 0; SIM.vx[i] = SIM.vy[i] = 0; SIM.act[i] = 1; continue; }
    const vt = (Fg - Fk) / (BETA * r);
    // lateral bias from the heterogeneity gradient across the drop front, plus a slow random walk
    const g = (dcos(i, x + r, y - r) - dcos(i, x - r, y - r)) / (2 * r);
    // Ornstein–Uhlenbeck wander (τ ≈ 0.7 s): real paths are mostly vertical with gentle zig-zags
    SIM.lat[i] += (-SIM.lat[i] * 1.4 + (rnd() - 0.5) * 2.6) * dt;
    const lat = clamp(-1.1 * g * r / Math.max(dc, 0.02) + SIM.lat[i], -0.45, 0.45);
    const il = 1 / Math.hypot(lat, 1);
    const tvx = lat * il * vt, tvy = -il * vt;
    const kk = 1 - Math.exp(-dt / 0.07);
    SIM.vx[i] += (tvx - SIM.vx[i]) * kk; SIM.vy[i] += (tvy - SIM.vy[i]) * kk;
    let nx = x + SIM.vx[i] * dt, ny = y + SIM.vy[i] * dt;
    const pn = SIM.panes[SIM.pane[i]];
    nx = clamp(nx, pn[0] + r * 0.6, pn[2] - r * 0.6);
    const ds = Math.hypot(nx - x, ny - y);
    // sweep: collect mist, leave a film; lose film volume
    SIM.V[i] += collect(x, y, nx, ny, r * 0.95, 1.0);
    SIM.V[i] -= 0.9 * r * 0.006 * ds;
    SIM.x[i] = nx; SIM.y[i] = ny; SIM.act[i] = 1;
    // pearling: occasionally a bead is left behind at the tail
    SIM.acc[i] += ds;
    if (SIM.acc[i] > r * 1.6) {
      SIM.acc[i] = 0;
      const sp = Math.hypot(SIM.vx[i], SIM.vy[i]);
      if (rnd() < 0.16 + 0.25 * clamp(sp / 80, 0, 1)) {
        const rb = r * (0.12 + 0.18 * rnd()), Vb = kV(SIM.th[i]) * rb * rb * rb;
        if (SIM.V[i] - Vb > 0.2) {
          const ux = -SIM.vx[i] / (sp + 1e-6), uy = -SIM.vy[i] / (sp + 1e-6);
          const j = addDrop(nx + ux * r * 1.05 + (rnd() - 0.5) * r * 0.5, ny + uy * r * 1.05, Vb, SIM.pane[i]);
          if (j >= 0) SIM.V[i] -= Vb;
        }
      }
    }
    if (SIM.V[i] < 0.05) { removeDrop(i); continue; }
    SIM.r[i] = Math.cbrt(SIM.V[i] / kV(SIM.th[i]));
    // reached the bottom rail of the pane: water drains along the frame
    if (ny - SIM.r[i] * 0.3 < pn[1]) { if (SIM.events.length < 64) SIM.events.push({ type: 'drain', x: nx, V: SIM.V[i] }); removeDrop(i); }
  }
  // 3) coalescence (spatial hash; only pairs involving an active drop)
  const G = SIM.GCELL, HW = SIM.HW, HH = SIM.HH;
  SIM.head.fill(-1);
  for (let i = 0; i < SIM.n; i++) {
    if (SIM.r[i] <= 0) continue;
    const c = clamp(Math.floor(SIM.y[i] / G), 0, HH - 1) * HW + clamp(Math.floor(SIM.x[i] / G), 0, HW - 1);
    SIM.next[i] = SIM.head[c]; SIM.head[c] = i;
  }
  for (let i = 0; i < SIM.n; i++) {
    if (!SIM.act[i] || SIM.r[i] <= 0) continue;
    const cx = Math.floor(SIM.x[i] / G), cy = Math.floor(SIM.y[i] / G);
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const gx = cx + ox, gy = cy + oy;
      if (gx < 0 || gy < 0 || gx >= HW || gy >= HH) continue;
      for (let j = SIM.head[gy * HW + gx]; j >= 0; j = SIM.next[j]) {
        if (j === i || SIM.r[j] <= 0 || SIM.r[i] <= 0 || SIM.pane[j] !== SIM.pane[i]) continue;
        const dx = SIM.x[j] - SIM.x[i], dy = SIM.y[j] - SIM.y[i], rr = SIM.r[i] + SIM.r[j];
        if (dx * dx + dy * dy >= rr * rr * 0.9) continue;
        // merge the smaller into the larger: volume, centre of mass and momentum conserved
        const a = SIM.V[i] >= SIM.V[j] ? i : j, b = a === i ? j : i;
        const Va = SIM.V[a], Vb = SIM.V[b], V = Va + Vb;
        SIM.x[a] = (SIM.x[a] * Va + SIM.x[b] * Vb) / V; SIM.y[a] = (SIM.y[a] * Va + SIM.y[b] * Vb) / V;
        SIM.vx[a] = (SIM.vx[a] * Va + SIM.vx[b] * Vb) / V; SIM.vy[a] = (SIM.vy[a] * Va + SIM.vy[b] * Vb) / V;
        SIM.th[a] = (SIM.th[a] * Va + SIM.th[b] * Vb) / V; SIM.hy[a] = (SIM.hy[a] * Va + SIM.hy[b] * Vb) / V;
        SIM.V[a] = V; SIM.r[a] = Math.cbrt(V / kV(SIM.th[a]));
        SIM.slide[a] = SIM.slide[a] | SIM.slide[b];
        SIM.wob[a] = Math.min(1, SIM.wob[a] + 2 * Vb / V);
        SIM.act[a] = 2;                 // grown: re-check its new neighbourhood next step (cascades)
        removeDrop(b);
      }
    }
  }
  for (let i = 0; i < SIM.n; i++) SIM.act[i] = SIM.slide[i] || SIM.act[i] === 2 ? 1 : 0;
  compact();
}
// slow fields: mist regrows with the rain, trail film evaporates, condensation creeps back
let fieldRow = 0;
function fieldStep(dt) {
  const GW = SIM.GW, GH = SIM.GH, rows = Math.ceil(GH / 4);
  const dtt = dt * 4;
  const aM = (0.004 + 0.06 * SIM.rain) * SEASONS[WORLD.season].mist * dtt, dW = Math.exp(-dtt / 22), dR = Math.exp(-dtt / 45);
  for (let r = 0; r < rows; r++) {
    const j = (fieldRow + r * 4) % GH;
    for (let i = 0, k = j * GW; i < GW; i++, k++) {
      SIM.Mi[k] += (1 - SIM.Mi[k]) * aM * (0.6 + 0.8 * SIM.nuc[k]) * (1 - 0.7 * SIM.Wt[k]);
      SIM.Wt[k] *= dW;
      const fin = SIM.Fin[k], f0 = SIM.F0[k];
      // dropwise condensation: each spot re-nucleates at its own pace ⇒ speckled regrowth
      SIM.Fin[k] = fin + (f0 - fin) * (1 - Math.exp(-dtt / 30 * SIM.nuc[k] * (fin < 0.02 ? 0.5 : 1)));
      SIM.rim[k] *= dR;
    }
  }
  fieldRow = (fieldRow + 1) % 4;
}
function packFields() {
  const t = SIM.tex, N = SIM.GW * SIM.GH;
  for (let k = 0, o = 0; k < N; k++, o += 4) {
    t[o] = SIM.Mi[k] * 255 + 0.5; t[o + 1] = SIM.Wt[k] * 255 + 0.5; t[o + 2] = SIM.Fin[k] * 255 + 0.5; t[o + 3] = SIM.rim[k] * 255 + 0.5;
  }
}
function packDrops() {
  const a = SIM.inst;
  for (let i = 0, o = 0; i < SIM.n; i++, o += 8) {
    const sp = Math.hypot(SIM.vx[i], SIM.vy[i]);
    const slide = SIM.slide[i] && sp > 0.5;
    const dx = slide ? SIM.vx[i] / sp : 0, dy = slide ? SIM.vy[i] / sp : -1;
    // tear shape grows with speed; a fresh coalescence makes the drop wobble for a moment
    const el = (slide ? clamp(sp / 90, 0, 0.9) : 0) + SIM.wob[i] * 0.22 * Math.sin(SIM.age[i] * 55);
    const grow = 1 - Math.exp(-SIM.age[i] / 0.025);      // impact spreading (~25 ms)
    a[o] = SIM.x[i]; a[o + 1] = SIM.y[i]; a[o + 2] = SIM.r[i] * (0.55 + 0.45 * grow); a[o + 3] = SIM.th[i];
    a[o + 4] = dx; a[o + 5] = dy; a[o + 6] = Math.max(el, 0); a[o + 7] = SIM.seed[i];
  }
  // snowflakes go in the same instance stream, flagged by θ < 0 (they draw into the second channel)
  let o = SIM.n * 8;
  for (const f of SIM.flakes) {
    a[o] = f.x; a[o + 1] = f.y; a[o + 2] = f.r; a[o + 3] = -1;
    a[o + 4] = Math.cos(f.rot); a[o + 5] = Math.sin(f.rot); a[o + 6] = clamp(f.age / f.melt, 0, 1); a[o + 7] = f.seed;
    o += 8;
  }
  return SIM.n + SIM.flakes.length;
}
function simStats() {
  const rs = Array.from(SIM.r.subarray(0, SIM.n)).sort((a, b) => a - b);
  const area = SIM.paneArea.reduce((a, b) => a + b, 0);
  let cov = 0, sl = 0; for (let i = 0; i < SIM.n; i++) { cov += Math.PI * SIM.r[i] ** 2; sl += SIM.slide[i]; }
  let m = 0; for (let k = 0; k < SIM.Mi.length; k++) m += SIM.Mi[k];
  const q = f => (rs[Math.floor(f * (rs.length - 1))] || 0).toFixed(2);
  let sx = -1, sy = -1, best = 0; for (let i = 0; i < SIM.n; i++) if (SIM.slide[i] && SIM.r[i] > best) { best = SIM.r[i]; sx = SIM.x[i] * MAG / 1000 + S.WIN_X0; sy = SIM.y[i] * MAG / 1000 + S.WIN_Y0; }
  return { slideAt: [+sx.toFixed(3), +sy.toFixed(3), +best.toFixed(2)], n: SIM.n, cover: (cov / area).toFixed(3), sliding: sl, r50: q(0.5), r90: q(0.9), r99: q(0.99), rmax: q(1), mist: (m / SIM.Mi.length).toFixed(2) };
}
let fieldAcc = 0;
function simAdvance(dt, fieldEvery = 1 / 30) {
  let left = dt;
  while (left > 1e-6) {
    const h = Math.min(left, 1 / 60); simStep(h); left -= h;
    fieldAcc += h; if (fieldAcc >= fieldEvery) { fieldStep(fieldAcc); fieldAcc = 0; }
  }
}
// the rain has been falling for a while before we look: simulate ~2.5 min in slices (keeps the page responsive)
function prewarmSlice(h, n) {
  for (let k = 0; k < n; k++) { simStep(h); fieldAcc += h; if (fieldAcc >= 0.25) { for (let q = 0; q < 4; q++) fieldStep(fieldAcc / 4); fieldAcc = 0; } }
}

/* ============================================================================
   Camera: framing by aspect, handheld drift, parallax
   ========================================================================== */
const CAM = { pos: [0, 1.2, 1.4], fwd: [0, 0, -1], right: [1, 0, 0], up: [0, 1, 0], tan: [1, 1], par: [0, 0], parT: [0, 0], focus: 1.4 };
function framing(aspect) {
  // landscape: window + lamp + corner + curtain; portrait: step back, taller lens, keep the lamp in frame
  // a gentle three-quarter view (camera right of centre, looking slightly left): depth instead of a stage set
  const L = { pos: [0.30, 1.27, 1.80], tgt: [-0.16, 1.33, 0.0], vfov: 42 };
  const P = { pos: [0.06, 1.24, 2.05], tgt: [-0.24, 1.47, 0.0], vfov: 60 };
  const t = smooth(Math.log(0.56), Math.log(1.5), Math.log(aspect));
  const mix3 = (a, b) => a.map((v, i) => lerp(b[i], v, t));
  return { pos: mix3(L.pos, P.pos), tgt: mix3(L.tgt, P.tgt), vfov: lerp(P.vfov, L.vfov, t) };
}
// outside. Landscape: on the pavement 6 m from the wall, looking up at the window (a longer lens).
// Portrait: from the kerb, the tall frame holds both the window and its reflection in a puddle on the pavement
// (the mirror image lies ~32° below the horizon, the window ~16° above it).
function framingOut(aspect) {
  const L = { pos: [1.35, -0.61, -6.3], tgt: [0.05, 1.38, -0.3], vfov: 37 };
  const P = { pos: [1.0, -0.7, -8.6], tgt: [0.15, -1.72, -0.3], vfov: 62 };
  const t = smooth(Math.log(0.56), Math.log(1.5), Math.log(aspect));
  const m3 = (a, b) => a.map((v, i) => lerp(b[i], v, t));
  return { pos: m3(L.pos, P.pos), tgt: m3(L.tgt, P.tgt), vfov: lerp(P.vfov, L.vfov, t) };
}
function updateCamera(t, dt, aspect) {
  let f = VIEW.out ? framingOut(aspect) : framing(aspect);
  if (YL.cam && YL.cam.w > 0) {                     // a shot set by the director, blended in by weight w
    const c = YL.cam, w = c.w, m3 = (a, b) => a.map((v, i) => lerp(v, b[i], w));
    f = { pos: m3(f.pos, c.pos), tgt: m3(f.tgt, c.tgt), vfov: lerp(f.vfov, c.vfov, w) };
  }
  const ps = VIEW.out ? 4 : 1;                       // outside there is room to lean: parallax moves the eye further
  const k = 1 - Math.exp(-dt * 2.2);
  CAM.par[0] += (CAM.parT[0] - CAM.par[0]) * k; CAM.par[1] += (CAM.parT[1] - CAM.par[1]) * k;
  const st = DBG.still ? 0 : 1;
  // 手持感：位置 ±5mm、指向 ±0.15° 的慢速漂移，叠加约 0.22Hz 的呼吸起伏
  const breath = Math.sin(t * 2 * Math.PI / 4.6) * 0.0016;
  const pos = [f.pos[0] + st * 0.004 * ps * drift(t * 0.21, 1) + CAM.par[0] * 0.06 * ps,
               f.pos[1] + st * (0.003 * ps * drift(t * 0.19, 2) + breath) + CAM.par[1] * 0.035 * ps,
               f.pos[2] + st * 0.004 * drift(t * 0.17, 3)];
  let tgt = [f.tgt[0] + st * 0.004 * drift(t * 0.13, 4) + CAM.par[0] * 0.02, f.tgt[1] + st * 0.003 * drift(t * 0.11, 5) + CAM.par[1] * 0.012, f.tgt[2]];
  if (DBG.zoom > 1) tgt = [DBG.zx, DBG.zy, S.GLASS_Z];
  const fwd = V.norm(V.sub(tgt, pos));
  const roll = st * 0.0012 * drift(t * 0.09, 6);
  let right = V.norm(V.cross(fwd, [0, 1, 0]));
  let up = V.cross(right, fwd);
  right = V.add(V.mul(right, Math.cos(roll)), V.mul(up, Math.sin(roll)));
  up = V.cross(right, fwd);
  const ty = Math.tan(f.vfov * Math.PI / 360) / DBG.zoom;
  CAM.pos = pos; CAM.fwd = fwd; CAM.right = right; CAM.up = up; CAM.tan = [ty * aspect, ty];
  CAM.focus = (S.GLASS_Z - pos[2]) / fwd[2];   // focus distance: the glass, along the view axis
  if (YL.cam && YL.cam.w > 0 && YL.cam.focus) CAM.focus = lerp(CAM.focus, YL.cam.focus, YL.cam.w);
}
function camRay(ndcX, ndcY) {
  return V.norm(V.add(CAM.fwd, V.add(V.mul(CAM.right, ndcX * CAM.tan[0]), V.mul(CAM.up, ndcY * CAM.tan[1]))));
}

/* ============================================================================
   Lighting state
   ========================================================================== */
// 每次打开都略有不同：暖水瓶的漆色、挂历的画、对街的天际线
const VARY = { v: [rnd(), rnd(), rnd(), rnd()], city: Math.floor(rnd() * 97) };
// autumn: where three wet leaves have stuck to the glass this time (world x, y, size, angle)
VARY.glassLeaves = new Float32Array([0, 1, 2].flatMap(i => { const pane = S.PANES[[0, 1, 1][i]];
  return [lerp(pane[0] + 0.07, pane[2] - 0.07, rnd()), lerp(pane[1] + 0.1, pane[3] - 0.08, rnd() ** 0.7), 0.045 + 0.025 * rnd(), (rnd() - 0.5) * 2.4]; }));

/* ============================================================================
   WORLD — season and hour. Everything that depends on them is derived here,
   once per frame, and handed to the shaders as uniforms.
   ========================================================================== */
const lum3 = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
// piecewise-linear daily curve [[hour, value], …], periodic over 24 h
const curve = (pts, h) => { h = ((h % 24) + 24) % 24; for (let i = 1; i < pts.length; i++) if (h <= pts[i][0]) { const a = pts[i - 1], b = pts[i]; return lerp(a[1], b[1], (h - a[0]) / (b[0] - a[0])); } return pts[pts.length - 1][1]; };
// 太阳高度角（北纬 31°，上海一带）：sin h = sinφ sinδ + cosφ cosδ cos H，赤纬取各季节的典型值
const LAT = 31 * Math.PI / 180, DECL = [6, 23, -8, -22];
function sunElev(tod, season) {
  const d = DECL[season] * Math.PI / 180, H = (tod - 12) * Math.PI / 12;
  return Math.asin(Math.sin(LAT) * Math.sin(d) + Math.cos(LAT) * Math.cos(d) * Math.cos(H)) * 180 / Math.PI;
}
// 「傍晚」= 日落后、太阳在地平线下约 4° 的蓝调时刻：夏天约 19:30，冬天约 17:20
function duskTime(season) { let t = 14; while (t < 22 && sunElev(t, season) > -4) t += 0.005; return t; }
// 阴雨天的天空。白天天顶亮度随太阳高度变化，地平线约为天顶的 0.45（CIE 阴天 1/3，加上雨雾）；
// 日落后每下降约 3.5° 暗一个数量级（民用→航海暮光），蓝调时地平线反而更亮；
// 天黑后云底被城市灯光从下面照亮：一层与太阳无关的暗橙色底光。以 h = −4° 对准第一期的傍晚画面。
function skyAt(h) {
  const Lday = 18;
  const Lz = h >= 0 ? Lday * (0.06 + 0.94 * Math.pow(Math.sin(h * Math.PI / 180), 0.9)) : Lday * 0.06 * Math.pow(10, h / 3.5);
  const twi = smooth(3, -1.5, h);
  const zc = mix3([0.92, 1.0, 1.08], [0.58, 1.03, 1.92], twi), hc = mix3([0.98, 1.0, 1.0], [1.09, 0.99, 0.95], twi);
  const sunset = Math.exp(-((h - 0.5) ** 2) / 8);                 // a faint warm band where the sun goes down behind the cloud
  const hcw = [hc[0] * (1 + 0.18 * sunset), hc[1], hc[2] * (1 - 0.15 * sunset)];
  const zen = add3(mulc(zc, Lz), [0.0055, 0.0038, 0.0024]);
  const hor = add3(mulc(hcw, Lz * lerp(0.45, 1.75, twi)), [0.009, 0.0058, 0.0034]);
  return { zen, hor };
}
// 四季：降水（Marshall–Palmer 雨强倍数、撞击率、雾珠增长）、梧桐叶幕、风、雷暴、内侧冷凝的轻重
const SEASONS = [
  { name: '春', rainR: 0.35, rate: 0.85, mist: 1.6, leaf: [0.55, 0.12, 0.22, 0.05], snow: 0, wind: 0.12, storm: 0, fog: 1.0 },
  { name: '夏', rainR: 2.4, rate: 1.5, mist: 1.1, leaf: [1.0, 0.045, 0.10, 0.04], snow: 0, wind: 0.2, storm: 1, fog: 0.75 },
  { name: '秋', rainR: 1.0, rate: 1.0, mist: 1.0, leaf: [0.6, 0.34, 0.21, 0.035], snow: 0, wind: 0.55, storm: 0, fog: 1.0 },
  { name: '冬', rainR: 1.0, rate: 0.3, mist: 0.35, leaf: [0.0, 0.05, 0.04, 0.03], snow: 1, wind: 0.3, storm: 0, fog: 1.0 },
];
// the plane tree's skeleton (recursive branching), in the plane of the tree card: world x, y
const BRANCHES = (() => {
  const GY = S.GROUND_Y, segs = [], r = mulberry32(4242);
  const grow = (x, y, ang, len, rad, depth) => {
    const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
    segs.push([x, y, x2, y2, rad, depth === 0 ? 1 : 0]);
    if (depth === 0) return;
    const n = depth >= 3 ? 2 : 2 + (r() < 0.45 ? 1 : 0);
    for (let i = 0; i < n; i++) grow(x2, y2, ang + (i - (n - 1) / 2) * (0.55 + 0.25 * r()) + (r() - 0.5) * 0.4, len * (0.6 + 0.15 * r()), rad * 0.6, depth - 1);
  };
  segs.push([-3.1, GY, -2.92, GY + 4.6, 0.17]);
  grow(-2.92, GY + 4.4, 0.85, 1.25, 0.075, 3);      // the long limb reaching over toward the window
  grow(-2.95, GY + 4.55, 1.45, 1.25, 0.07, 3);      // straight up
  grow(-2.95, GY + 4.5, 2.25, 1.2, 0.06, 2);        // back over the pavement
  const a = new Float32Array(64 * 4), rr = new Float32Array(64), tips = new Float32Array(24 * 4);
  segs.slice(0, 64).forEach((g, i) => { a.set(g.slice(0, 4), i * 4); rr[i] = g[4]; });
  // the outer twigs carry the foliage
  const ends = segs.filter(g => g[5]).slice(0, 24);
  ends.forEach((g, i) => tips.set([g[2], g[3], 0.75 + 0.25 * r(), 0], i * 4));
  return { a, r: rr, tips, n: Math.min(64, segs.length) };
})();
const WORLD = {
  season: QS.has('season') ? clamp(+QS.get('season') | 0, 0, 3) : 2,          // 《一粒光》: an autumn night
  tod: 0, atDusk: !QS.has('tod'), flowing: QS.has('flow'), dayMinutes: 20,
  h: -4, lampsOn: false, lampWarm: 1, U: {}, flash: 0,
  bolt: { t: 0, next: 10, strokes: [], rnd: mulberry32(1234) },
};
WORLD.tod = QS.has('tod') ? +QS.get('tod') : 20.75;
// households awake and at home, by hour; windows light up when that meets the dark
const HOME = [[0, 0.3], [1.5, 0.12], [4, 0.05], [6, 0.35], [7.5, 0.6], [9, 0.32], [12, 0.38], [16.5, 0.45], [18, 0.75], [20, 0.9], [22.5, 0.75], [23.5, 0.45], [24, 0.3]];
const TRAFFIC = [[0, 0.35], [1, 0.15], [4.5, 0.1], [6, 0.6], [7.5, 1.6], [9, 1.1], [12, 1.0], [16.5, 1.2], [18, 1.6], [19.5, 1.0], [22, 0.6], [24, 0.35]];
const WALKERS = [[0, 0.15], [2, 0.05], [6, 0.45], [8, 1.0], [12, 0.9], [18, 1.15], [21, 0.7], [23, 0.3], [24, 0.15]];
function worldUpdate(wdt) {
  const W = WORLD;
  if (W.flowing) W.tod = (W.tod + wdt * 24 / (W.dayMinutes * 60) + 24) % 24;
  const h = W.h = sunElev(W.tod, W.season);
  // 高压钠灯：天黑（h < −2°）光控开灯，约 4 分钟内从暗粉色升到橙色；天亮（h > −1°）关灯
  const dh = wdt * 24 / (W.dayMinutes * 60) * (W.flowing ? 1 : 0);
  if (!W.lampsOn && h < -2) { W.lampsOn = true; W.lampWarm = W.started ? 0 : 1; }
  if (W.lampsOn && h > -1) W.lampsOn = false;
  if (W.lampsOn) W.lampWarm = Math.min(1, W.lampWarm + dh / 0.07);
  W.started = true;
  const warm = smooth(0, 1, W.lampWarm);
  const lampsOut = W.lampsOn ? 0.15 + 0.85 * warm * warm : 0;
  const lampCol = mix3([0.85, 0.55, 0.75], [1.0, 0.55, 0.18], warm);
  // 夏天的雷阵雨：每隔几十秒一道闪电，由 2–5 次回击组成（间隔 40–150 ms），每次回击是几十毫秒的衰减脉冲，
  // 有的带一段持续电流（余辉更长）。云底被照亮：天光、窗光、楼面一起陡然变亮。眼睛来不及适应（曝光只看不含闪电的天光）。
  // 雷声按声速 343 m/s 延迟到达。
  const SE0 = SEASONS[W.season], B = W.bolt;
  B.t += wdt;
  if (SE0.storm && !DBG.shot) {
    B.next -= wdt * (0.4 + SIM.rain);
    if (B.next <= 0) {
      B.next = 15 + 45 * B.rnd();
      const dist = 1.2 + 7 * B.rnd() ** 1.3, n = 2 + Math.floor(B.rnd() * 4), I0 = 2.5 / (0.5 + dist / 2);
      let ts = B.t;
      for (let i = 0; i < n; i++) {
        B.strokes.push({ t: ts, I: I0 * (i === 0 ? 1 : 0.35 + 0.65 * B.rnd()), tau: B.rnd() < 0.25 ? 0.16 : 0.025 + 0.035 * B.rnd() });
        ts += 0.04 + 0.11 * B.rnd();
      }
      AUDIO.thunder && AUDIO.thunder(dist);
    }
  }
  let fl = 0;
  for (const st of B.strokes) { const a = B.t - st.t; if (a >= 0) fl += st.I * Math.min(1, a / 0.003) * Math.exp(-a / st.tau); }
  if (B.strokes.length && B.t - B.strokes[B.strokes.length - 1].t > 1.5) B.strokes.length = 0;
  W.flash = DBG.flash || fl;
  const sky0 = skyAt(h), FC = [0.86, 0.93, 1.0];
  const sky = { zen: add3(sky0.zen, mulc(FC, W.flash)), hor: add3(sky0.hor, mulc(FC, W.flash * 0.75)) };
  const dark = smooth(4, -3, h);
  const occ = curve(HOME, W.tod) * (0.12 + 0.88 * dark) * 0.5;
  const shops = smooth(7, 8, W.tod) * (1 - smooth(21, 23, W.tod));
  const skyWin = add3(mulc(sky.hor, 0.6), mulc(sky.zen, 0.4));            // what the upper window shows on average
  const eVert = mulc(skyWin, Math.PI * 0.5);
  const eGround = mulc(add3(mulc(sky.zen, 0.75), mulc(sky.hor, 0.25)), Math.PI);
  const cityLights = 0.6 * lampsOut + 0.8 * occ + 0.4 * shops * dark;
  const cityWin = add3(mulc(eVert, 0.2 / Math.PI), mulc([1.0, 0.72, 0.45], 0.028 * cityLights / 0.76));
  const SE = SEASONS[W.season];
  W.gustT = (W.gustT || 0) - wdt;
  if (W.gustT <= 0) { W.gustT = 2 + rnd() * 4; W.gustTo = 0.4 + 0.9 * rnd(); }
  W.gust = lerp(W.gust || 0.7, W.gustTo || 0.7, 1 - Math.exp(-wdt / 1.5));
  W.windNow = SE.wind * W.gust;
  W.U = { sky, skyWin, cityWin, eVert, eGround, occ, lampsOut, lampCol, shops, dark, flash: W.flash,
          skyWinBase: add3(mulc(sky0.hor, 0.6), mulc(sky0.zen, 0.4)),
          glow: mulc([0.05, 0.028, 0.018], 0.3 + 0.7 * lampsOut), shopsLit: shops * (0.3 + 0.7 * dark) };
}
function periodName(tod, h) {
  if (h > 6) return tod < 11 ? '上午' : tod < 13.5 ? '中午' : '下午';
  if (h > -1) return tod < 12 ? '清晨' : '黄昏';
  if (h > -9) return tod < 12 ? '黎明' : '傍晚';
  return (tod >= 22 || tod < 4.5) ? '深夜' : tod < 12 ? '凌晨' : '夜晚';
}
const fmtTod = t => { const m = Math.floor(((t % 24) + 24) % 24 * 60); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
worldUpdate(0);
const HERO = { on: false, p: [S.BULB[0], S.BULB[1], S.BULB[2]], glow: 0 };   // 一粒光 (driven by hero.js)
const LIGHT = { on: (QS.has('lamp') ? DBG.lamp : WORLD.h < 3) ? 1 : 0, level: 0, flick: 1, exposure: 1, expoAdapt: 1 };
LIGHT.level = LIGHT.on;
function lightUniforms(t, dt) {
  // 白炽灯丝的热惯性：开灯 τ≈0.12s，关灯 τ≈0.35s（冷却更慢）；色温随灯丝亮度降低而变红。
  const tau = LIGHT.on ? 0.12 : 0.35;
  LIGHT.level += (LIGHT.on - LIGHT.level) * (1 - Math.exp(-dt / tau));
  const lv = LIGHT.level;
  // 极轻微的亮度波动：电压的慢漂移（±1.2%）+ 偶发的短暂跌落
  const fl = 1 + 0.008 * Math.sin(t * 0.9) * Math.sin(t * 0.37 + 1) + 0.005 * Math.sin(t * 5.3 + Math.sin(t * 1.1) * 2) -
             0.03 * Math.pow(Math.max(0, Math.sin(t * 0.21) * Math.sin(t * 0.077 + 2)), 30);
  const T = 1800 + 900 * Math.sqrt(lv);
  const lampI = mulc(bb(T), 2.3 * lv * lv * fl * (1 - (LIGHT.dip || 0)));   // (dip: the director's flicker)
  const tau3 = [0.20, 0.14, 0.075];       // cream fabric: transmits red/yellow better than blue
  const skyL = WORLD.U.skyWin;
  const cityL = WORLD.U.cityWin;
  const ambL = mulc(lampI, 0.075).map((v, i) => v * [1.0, 0.92, 0.75][i]);
  const ambS = mulc(skyL, 0.8);
  // 眼睛的适应：由已知光照解析地估计场景的基准亮度（台灯 + 窗光），不做 GPU 回读。
  // 只部分补偿：比参考暗时补偿 85%（夜里关灯后房间仍是暗的），比参考亮时补偿 70%（白天窗户偏亮、房间仍明亮）。
  // 变暗适应 2.6 s，变亮 0.7 s。
  // outside, the reference is the lit street at dusk: the lane lamp and the lit windows, not the desk lamp
  // the little light: a warm 2100 K spark that breathes; the eye adapts to it too (it is the only light once the lamp is out)
  const heroI = HERO.on ? mulc(bb(2100 + 300 * HERO.glow), 0.26 * HERO.glow * (1 + 0.07 * Math.sin(t * 2.1) + 0.03 * Math.sin(t * 5.3))) : [0, 0, 0];
  const key = VIEW.out ? 0.5 * (WORLD.lampsOn ? 1 : 0) + 0.12 * lv * lv + 2.0 * lum3(WORLD.U.skyWinBase) + 0.6 * lum3(cityL)
                       : lv * lv + 2.0 * lum3(WORLD.U.skyWinBase) + 0.5 * lum3(cityL) + 0.9 * lum3(heroI);
  const ev = Math.log2(Math.max(key, 0.12) / 1.25);                   // stops above / below the dusk-with-lamp reference
  const target = clamp(Math.pow(2, -ev * (ev > 0 ? 0.7 : 0.85)), 0.03, 7);
  const at = target > LIGHT.expoAdapt ? 2.6 : 0.7;
  if (!LIGHT.adapted || DBG.shot) { LIGHT.expoAdapt = target; LIGHT.adapted = true; }   // open the eyes already adapted
  LIGHT.expoAdapt += (target - LIGHT.expoAdapt) * (1 - Math.exp(-dt / at));
  return { lampI, tau3, skyL, cityL, ambL, ambS, heroI };
}

/* ============================================================================
   Renderer
   ========================================================================== */
const IS_MOBILE = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
const R = { progs: {}, tg: {}, roomScale: IS_MOBILE ? 0.5 : 0.85, roomMax: IS_MOBILE ? 0.62 : 0.9, mainScale: IS_MOBILE ? 0.85 : 1, mainMax: 1, dprCap: IS_MOBILE ? 2 : 2,
            perf: { ema: 16, bad: 0, good: 0, cool: 3 } };
if (QS.get('q')) R.roomScale = R.roomMax = +QS.get('q');
let spriteVAO, spriteBuf, dropVAO, dropBuf, stateTex;

function initGL() {
  gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: DBG.shot, powerPreference: 'high-performance' });
  if (!gl) return false;
  createResources();
  return true;
}
// everything owned by the GL context (re-created after a context loss)
function createResources() {
  caps.cbf = !!gl.getExtension('EXT_color_buffer_float');
  caps.cbhf = !!gl.getExtension('EXT_color_buffer_half_float');
  caps.parallel = gl.getExtension('KHR_parallel_shader_compile');
  caps.hdr = caps.cbf || caps.cbhf;
  emptyVAO = gl.createVertexArray();
  spriteVAO = gl.createVertexArray();
  gl.bindVertexArray(spriteVAO);
  spriteBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, spriteBuf);
  gl.bufferData(gl.ARRAY_BUFFER, OUT.sprites.byteLength, gl.DYNAMIC_DRAW);
  for (let i = 0; i < 3; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 4, gl.FLOAT, false, 48, i * 16); gl.vertexAttribDivisor(i, 1); }
  dropVAO = gl.createVertexArray();
  gl.bindVertexArray(dropVAO);
  dropBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, dropBuf);
  gl.bufferData(gl.ARRAY_BUFFER, SIM.inst.byteLength, gl.DYNAMIC_DRAW);
  for (let i = 0; i < 2; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 4, gl.FLOAT, false, 32, i * 16); gl.vertexAttribDivisor(i, 1); }
  gl.bindVertexArray(null);
  stateTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, stateTex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, SIM.GW, SIM.GH);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}
function buildPrograms() {
  const P = R.progs;
  P.room = makeProgram('room', VS_FULL, FS_ROOM());
  P.outside = makeProgram('outside', VS_FULL, FS_OUTSIDE());
  P.sprite = makeProgram('sprite', VS_SPRITE(), FS_SPRITE());
  P.composite = makeProgram('composite', VS_FULL, FS_COMPOSITE());
  P.drop = makeProgram('drop', VS_DROP(), FS_DROP());
  P.dof = makeProgram('dof', VS_FULL, FS_DOF());
  P.taa = makeProgram('taa', VS_FULL, FS_TAA());
  P.down = makeProgram('down', VS_FULL, FS_DOWN());
  P.up = makeProgram('up', VS_FULL, FS_UP());
  P.final = makeProgram('final', VS_FULL, FS_FINAL());
  P.blit = makeProgram('blit', VS_FULL, FS_BLIT());
  if (VIEW.out || VIEW.want) ensureStreet();
}
// the street view is compiled only when someone first walks outside (it is a large shader)
function ensureStreet() {
  if (R.progs.street) return;
  R.progs.street = makeProgram('street', VS_FULL, FS_STREET());
  R.progs.spost = makeProgram('streetpost', VS_FULL, FS_STREETPOST());
  R.streetOK = false;
}
function streetReady() {
  const P = R.progs;
  if (!P.street) return false;
  if (R.streetOK) return true;
  if (caps.parallel && ![P.street, P.spost].every(p => gl.getProgramParameter(p.p, caps.parallel.COMPLETION_STATUS_KHR))) return false;
  try { checkProgram(P.street); checkProgram(P.spost); R.streetOK = true; }
  catch (e) { console.error(e.message); VIEW.want = false; VIEW.failed = true; }
  return R.streetOK;
}
function programsReady() {
  if (!caps.parallel) return true;
  return Object.values(R.progs).every(p => gl.getProgramParameter(p.p, caps.parallel.COMPLETION_STATUS_KHR));
}
function finishPrograms() { Object.values(R.progs).forEach(checkProgram); }

function allocTargets() {
  const T = R.tg, hdr = caps.hdr ? 'rgba16f' : 'rgba8';
  for (const k in T) if (T[k] && T[k].fb) freeTarget(T[k]);   // (T.bloom is just a list of the b1..b6 targets)
  const W = canvas.width, H = canvas.height;
  T.hdr = makeTarget(W, H, [hdr]);
  T.room = makeTarget(W * R.roomScale, H * R.roomScale, [hdr, caps.hdr ? 'r16f' : 'rgba8']);
  T.roomDof = makeTarget(W * R.roomScale, H * R.roomScale, [hdr]);
  T.hist0 = makeTarget(W, H, [hdr]);                // full-resolution room history (TAAU)
  T.hist1 = makeTarget(W, H, [hdr]);
  R.taaReset = 1;
  T.bloom = [];
  for (let i = 1, w = W, h = H; i <= 6; i++) { w = Math.max(1, Math.ceil(w / 2)); h = Math.max(1, Math.ceil(h / 2)); T['b' + i] = makeTarget(w, h, [hdr]); T.bloom.push(T['b' + i]); }
  T.defocus = makeTarget(Math.ceil(W / 2), Math.ceil(H / 2), [hdr], { mips: true });
  const sw = W > 1400 ? 1024 : 768;
  T.sharp = makeTarget(sw, sw * 0.75, [hdr], { mips: true });
  // height field: about one texel per screen pixel of glass, 512..1408 wide
  const glassPx = W * (S.WIN_X1 - S.WIN_X0) / (2 * CAM.tan[0] * Math.abs(CAM.focus || 1.9));
  const hw = clamp(Math.round(glassPx * 1.1 / 64) * 64, 512, 1408);
  T.height = makeTarget(hw, Math.round(hw * SIM.H / SIM.W), [caps.hdr ? 'rg16f' : 'rgba8'], { mips: true });   // r: water height (mm), g: snowflake
}
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, R.dprCap);
  const cw = Math.max(1, canvas.clientWidth), ch = Math.max(1, canvas.clientHeight);
  const w = Math.round(cw * dpr * R.mainScale), h = Math.round(ch * dpr * R.mainScale);
  if (w === canvas.width && h === canvas.height && R.tg.hdr && R.tg.room && Math.abs(R.tg.room.w - Math.round(w * R.roomScale)) < 2) return;
  canvas.width = w; canvas.height = h;
  allocTargets();
}
// 动态分辨率：帧时间持续偏高时先降室内 raymarch 的分辨率，再降全屏分辨率；持续宽裕时逐步恢复。
function adaptQuality(dt) {
  if (DBG.shot) return;
  const Q = R.perf;
  Q.ema += (dt * 1000 - Q.ema) * 0.05;
  Q.cool -= dt;
  if (Q.cool > 0) return;
  if (Q.ema > 26) { Q.bad += dt; Q.good = 0; } else if (Q.ema < 14.5) { Q.good += dt; Q.bad = 0; } else { Q.bad = Q.good = 0; }
  if (Q.bad > 1.2) {
    if (R.roomScale > 0.42) R.roomScale = Math.max(0.4, R.roomScale - 0.1);
    else if (R.mainScale > 0.62) R.mainScale = Math.max(0.6, R.mainScale - 0.1);
    Q.bad = 0; Q.cool = 2.5; Q.ema = 16;
  } else if (Q.good > 5) {
    if (R.mainScale < R.mainMax) R.mainScale = Math.min(R.mainMax, R.mainScale + 0.1);
    else if (R.roomScale < R.roomMax) R.roomScale = Math.min(R.roomMax, R.roomScale + 0.05);
    Q.good = 0; Q.cool = 2.5;
  }
}

function camUniforms(pr) {
  U(pr, 'uCamPos', CAM.pos); U(pr, 'uCamFwd', CAM.fwd); U(pr, 'uCamRight', CAM.right); U(pr, 'uCamUp', CAM.up); U(pr, 'uTan', CAM.tan);
}
function lightU(pr, Lt) {
  U(pr, 'uLampI', Lt.lampI); U(pr, 'uShadeTau', Lt.tau3); U(pr, 'uSkyL', Lt.skyL); U(pr, 'uCityL', Lt.cityL); U(pr, 'uAmbL', Lt.ambL); U(pr, 'uAmbS', Lt.ambS);
  U(pr, 'uHeroP', HERO.p); U(pr, 'uHeroI', Lt.heroI);
}
function outsideUniforms(pr, t) {
  U(pr, 'uTime', t % 900);              // wrapped: keeps noise coordinates small (float precision) on long sessions
  const lamps = new Float32Array(24);
  OUT.lamps.forEach((x, i) => { lamps.set([x, S.GROUND_Y + 6.4, S.CURB_Z - 0.6, 1.0], i * 4); });
  lamps.set([-15, S.GROUND_Y + 6.4, -4.2, 1.2], 16); lamps.set([13, S.GROUND_Y + 6.4, -4.2, 1.2], 20);
  gl.uniform4fv(pr.u.uStreetLamps, lamps);
  const cars = new Float32Array(16);
  OUT.cars.slice(0, 4).forEach((c, i) => cars.set([c.x, c.z, c.dir, c.I * smooth(0, 3, c.age)], i * 4));
  gl.uniform4fv(pr.u.uCars, cars);
  const peds = new Float32Array(20).fill(999);
  OUT.peds.slice(0, 5).forEach((p, i) => peds.set([p.x, p.z, p.kind, p.ph], i * 4));
  if (pr.u.uPeds) gl.uniform4fv(pr.u.uPeds, peds);
  cityUniforms(pr);
  const Wu = WORLD.U;
  U(pr, 'uSkyZ', Wu.sky.zen); U(pr, 'uSkyH', Wu.sky.hor); U(pr, 'uGlow', Wu.glow);
  U(pr, 'uEVert', Wu.eVert); U(pr, 'uEGround', Wu.eGround);
  U(pr, 'uOcc', Wu.occ); U(pr, 'uLampsOut', Wu.lampsOut); U(pr, 'uLampTint', Wu.lampCol);
  U(pr, 'uShopsLit', Wu.shopsLit); U(pr, 'uDark', Wu.dark); U(pr, 'uTod', WORLD.tod);
  U(pr, 'uSnow', SEASONS[WORLD.season].snow * 0.85); U(pr, 'uLeafFall', WORLD.season === 2 ? 1 : 0);
}

function cityUniforms(pr) {
  if (pr.u.uBr) { gl.uniform4fv(pr.u.uBr, BRANCHES.a); gl.uniform1fv(pr.u.uBrR, BRANCHES.r); }
  if (pr.u.uTips) gl.uniform4fv(pr.u.uTips, BRANCHES.tips);
  const SE = SEASONS[WORLD.season];
  U(pr, 'uLeaf', SE.leaf); U(pr, 'uWindNow', WORLD.windNow || 0);
  const b = OUT.cars.find(c => c.bus);
  U(pr, 'uBus', b ? [b.x, b.z + 1.25, b.dir, smooth(0, 3, b.age)] : [0, 0, 0, 0]);
  U(pr, 'uCity', VARY.city);
}
function drawSprites(target, mode, eye, t) {
  const P = R.progs.sprite;
  gl.useProgram(P.p);
  cityUniforms(P); U(P, 'uTime', t % 900);
  U(P, 'uMode', I(mode)); U(P, 'uRes', [target.w, target.h]); U(P, 'uEye', eye); camUniforms(P);
  U(P, 'uCoC', R.coc);
  gl.bindVertexArray(spriteVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, spriteBuf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, OUT.sprites, 0, OUT.count * 12);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, OUT.count);
  gl.disable(gl.BLEND);
  gl.bindVertexArray(null);
}

// the street at this hour: the lane lamp (an incandescent bulb, on with the street lamps), the sodium lamp across
// the street whose light comes through the plane tree, the glow of the street behind the viewer, our window
const STREET = { wallI: [0, 0, 0], far: [0, 0, 0, 0], cityGlow: [0, 0, 0], winL: [0, 0, 0] };
function streetUpdate(Lt) {
  const Wu = WORLD.U, on = WORLD.lampsOn ? 1 : 0;
  STREET.wallI = mulc(bb(2500), 1.4 * on);
  const fx = OUT.lamps.length ? OUT.lamps.reduce((a, b) => Math.abs(b - 3) < Math.abs(a - 3) ? b : a) : 3;   // (its trunk's shadow then falls clear of the window)
  STREET.far = [fx, S.GROUND_Y + 6.4, S.CURB_Z - 0.6, 160 * Wu.lampsOut];
  STREET.cityGlow = mulc(Wu.cityWin, Math.PI * 0.45);
  STREET.winL = add3(add3(mulc(Lt.lampI, 0.045), mulc(Lt.ambL, 0.5)), mulc(Lt.skyL, 0.05));
}
function streetUniforms(pr, Lt, hScale) {
  const Wu = WORLD.U, SE = SEASONS[WORLD.season], T = R.tg;
  U(pr, 'uSkyZ', Wu.sky.zen); U(pr, 'uSkyH', Wu.sky.hor); U(pr, 'uEVert', Wu.eVert); U(pr, 'uEGround', Wu.eGround);
  U(pr, 'uCityGlow', STREET.cityGlow); U(pr, 'uWallI', STREET.wallI); U(pr, 'uFarLamp', STREET.far); U(pr, 'uLampTint', Wu.lampCol); U(pr, 'uWinL', STREET.winL);
  U(pr, 'uOcc', Wu.occ); U(pr, 'uSnow', SE.snow * 0.85); U(pr, 'uRain', SIM.rain); U(pr, 'uFrost', SE.snow ? 1 : 0); U(pr, 'uFogK', SE.fog);
  if (pr.u.uGLeaf) gl.uniform4fv(pr.u.uGLeaf, WORLD.season === 2 ? VARY.glassLeaves : new Float32Array(12));
  U(pr, 'uSimMM', [SIM.W, SIM.H]); U(pr, 'uHTex', [T.height.w, T.height.h]); U(pr, 'uHScale', hScale);
  cityUniforms(pr);
}
function render(t, dt, rt) {
  const P = R.progs, T = R.tg;
  const hScale = caps.hdr ? 1 : 0.25;
  const Lt = lightUniforms(rt, dt);
  streetUpdate(Lt);
  // 光圈：虚拟镜头光圈半径 30mm（大光圈，为得到明显的焦外光斑；同一光圈也决定室内景深），对焦在玻璃上。背景（无穷远）弥散圆角半径 = A / z_f
  R.aperture = VIEW.out ? 0.014 : 0.030;
  R.coc = R.aperture / CAM.focus;
  const glassEye = [S.WIN_CX, S.WIN_CY, S.GLASS_Z];

  // 1) outside, sharp & wide (for the drops)
  bindTarget(T.sharp);
  gl.useProgram(P.outside.p);
  U(P.outside, 'uMode', I(0)); U(P.outside, 'uRes', [T.sharp.w, T.sharp.h]); U(P.outside, 'uEye', glassEye);
  U(P.outside, 'uBlur', 2.4 * S.AZM / T.sharp.w); outsideUniforms(P.outside, t);
  drawFull();
  buildSprites(t, glassEye);
  drawSprites(T.sharp, 0, glassEye, t);
  gl.bindTexture(gl.TEXTURE_2D, T.sharp.tex.t); gl.generateMipmap(gl.TEXTURE_2D);

  // 2) outside, defocused camera view (only seen from inside)
  if (!VIEW.out) {
  bindTarget(T.defocus);
  gl.useProgram(P.outside.p);
  camUniforms(P.outside);
  U(P.outside, 'uMode', I(1)); U(P.outside, 'uRes', [T.defocus.w, T.defocus.h]); U(P.outside, 'uEye', CAM.pos);
  U(P.outside, 'uBlur', R.coc); U(P.outside, 'uRain', SIM.rain); U(P.outside, 'uAperture', R.aperture); U(P.outside, 'uFocus', CAM.focus);
  outsideUniforms(P.outside, t);
  drawFull();
  buildSprites(t, CAM.pos);
  drawSprites(T.defocus, 1, CAM.pos, t);
  gl.bindTexture(gl.TEXTURE_2D, T.defocus.tex.t); gl.generateMipmap(gl.TEXTURE_2D);
  }

  // 2b) drops → height field (MAX blend), with mips for the condensation blur
  bindTarget(T.height);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  if (SIM.n + SIM.flakes.length > 0) {
    const nInst = packDrops();
    gl.useProgram(P.drop.p);
    U(P.drop, 'uSimMM', [SIM.W, SIM.H]); U(P.drop, 'uHScale', hScale);
    gl.bindVertexArray(dropVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, dropBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, SIM.inst, 0, nInst * 8);
    gl.enable(gl.BLEND); gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nInst);
    gl.blendEquation(gl.FUNC_ADD); gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }
  gl.bindTexture(gl.TEXTURE_2D, T.height.tex.t); gl.generateMipmap(gl.TEXTURE_2D);
  // glass state grids (CPU) → texture
  packFields();
  gl.bindTexture(gl.TEXTURE_2D, stateTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, SIM.GW, SIM.GH, gl.RGBA, gl.UNSIGNED_BYTE, SIM.tex);

  // 3) room — or, outside, the street with the room seen through the window
  const hal = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
  const ji = (frame % 16) + 1;
  R.jitter = QS.has('nojitter') ? [0, 0] : [hal(ji, 2) - 0.5, hal(ji, 3) - 0.5];
  const PR = VIEW.out ? P.street : P.room;
  bindTarget(T.room);
  gl.useProgram(PR.p);
  camUniforms(PR); lightU(PR, Lt);
  U(PR, 'uRes', [T.room.w, T.room.h]); U(PR, 'uTime', t % 900);
  const ct = WORLD.tod;
  U(PR, 'uClock', [(ct % 12) / 12 * 2 * Math.PI, (ct % 1) * 2 * Math.PI, ((ct * 60) % 1) * 2 * Math.PI, 0]); U(PR, 'uVar', VARY.v); U(PR, 'uSteam', 1.0); U(PR, 'uSeason', WORLD.season);
  U(PR, 'uJitter', R.jitter);
  if (VIEW.out) {
    streetUniforms(PR, Lt, hScale);
    bindTex(PR, 'uHeight', T.height.tex, 0); bindTex(PR, 'uState', stateTex, 1); bindTex(PR, 'uSharp', T.sharp.tex, 2);
  }
  drawFull();

  // 3a) depth of field on the room (focus on the glass), at the raymarch resolution
  bindTarget(T.roomDof);
  gl.useProgram(P.dof.p);
  U(P.dof, 'uRes', [T.roomDof.w, T.roomDof.h]); U(P.dof, 'uFocus', CAM.focus); U(P.dof, 'uAperture', R.aperture);
  U(P.dof, 'uPxPerRad', T.roomDof.h * 0.5 / CAM.tan[1]);
  bindTex(P.dof, 'uRoom', T.room.tex, 0); bindTex(P.dof, 'uDepth', T.room.texs[1], 1);
  drawFull();

  // 3b) temporal upsampling into the full-resolution history
  const hNew = R.histFlip ? T.hist1 : T.hist0, hOld = R.histFlip ? T.hist0 : T.hist1;
  R.histFlip = !R.histFlip;
  bindTarget(hNew);
  gl.useProgram(P.taa.p);
  camUniforms(P.taa);
  const pc = R.prevCam || CAM;
  U(P.taa, 'uPPos', pc.pos); U(P.taa, 'uPFwd', pc.fwd); U(P.taa, 'uPRight', pc.right); U(P.taa, 'uPUp', pc.up); U(P.taa, 'uPTan', pc.tan);
  U(P.taa, 'uRes', [hNew.w, hNew.h]); U(P.taa, 'uLowRes', [T.room.w, T.room.h]); U(P.taa, 'uJitter', R.jitter); U(P.taa, 'uReset', R.taaReset);
  bindTex(P.taa, 'uCur', T.roomDof.tex, 0); bindTex(P.taa, 'uDepth', T.room.texs[1], 1); bindTex(P.taa, 'uHist', hOld.tex, 2);
  drawFull();
  R.taaReset = 0;
  R.prevCam = { pos: CAM.pos, fwd: CAM.fwd, right: CAM.right, up: CAM.up, tan: CAM.tan };
  R.roomOut = hNew;

  // 4) composite (inside) / rain and lamp glow over the street (outside)
  if (VIEW.out) {
    bindTarget(T.hdr);
    gl.useProgram(P.spost.p);
    camUniforms(P.spost);
    U(P.spost, 'uRes', [T.hdr.w, T.hdr.h]); U(P.spost, 'uTime', t % 900); U(P.spost, 'uRain', SIM.rain); U(P.spost, 'uWind', WORLD.windNow || 0);
    U(P.spost, 'uSnow', SEASONS[WORLD.season].snow); U(P.spost, 'uFocus', CAM.focus); U(P.spost, 'uAperture', R.aperture);
    U(P.spost, 'uWallI', STREET.wallI); U(P.spost, 'uWinL', STREET.winL); U(P.spost, 'uCityGlow', STREET.cityGlow);
    bindTex(P.spost, 'uSrc', R.roomOut.tex, 0); bindTex(P.spost, 'uDepth', T.room.texs[1], 1);
    drawFull();
  } else {
  bindTarget(T.hdr);
  gl.useProgram(P.composite.p);
  camUniforms(P.composite); lightU(P.composite, Lt);
  U(P.composite, 'uRes', [T.hdr.w, T.hdr.h]); U(P.composite, 'uTime', t); U(P.composite, 'uDbg', I(+(QS.get('dbg') || 0)));
  const SEc = SEASONS[WORLD.season];
  U(P.composite, 'uFrost', SEc.snow ? 1 : 0); U(P.composite, 'uFogK', SEc.fog);
  gl.uniform4fv(P.composite.u.uGLeaf, WORLD.season === 2 ? VARY.glassLeaves : new Float32Array(12));
  U(P.composite, 'uSimMM', [SIM.W, SIM.H]); U(P.composite, 'uHTex', [T.height.w, T.height.h]); U(P.composite, 'uHScale', hScale);
  bindTex(P.composite, 'uRoom', R.roomOut.tex, 0);
  bindTex(P.composite, 'uDefocus', T.defocus.tex, 1);
  bindTex(P.composite, 'uSharp', T.sharp.tex, 2);
  bindTex(P.composite, 'uHeight', T.height.tex, 3);
  bindTex(P.composite, 'uState', stateTex, 4);
  bindTex(P.composite, 'uSharp2', YL.sharp2 ? YL.sharp2.tex : T.sharp.tex, 5);
  U(P.composite, 'uSharpMix', YL.sharp2 ? (YL.sharpMix || 0) : 0); U(P.composite, 'uSharpGain', YL.sharpGain || 1);
  drawFull();
  }

  // 5) bloom chain
  gl.useProgram(P.down.p);
  let src = T.hdr;
  T.bloom.forEach((dst, i) => {
    bindTarget(dst);
    U(P.down, 'uRes', [dst.w, dst.h]); U(P.down, 'uTexel', [1 / src.w, 1 / src.h]); U(P.down, 'uFirst', I(i === 0 ? 1 : 0));
    bindTex(P.down, 'uSrc', src.tex, 0); drawFull(); src = dst;
  });
  gl.useProgram(P.up.p);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  for (let i = T.bloom.length - 1; i > 0; i--) {
    const s0 = T.bloom[i], dst = T.bloom[i - 1];
    bindTarget(dst);
    U(P.up, 'uRes', [dst.w, dst.h]); U(P.up, 'uTexel', [1 / s0.w, 1 / s0.h]); U(P.up, 'uRadius', 1.0);
    bindTex(P.up, 'uSrc', s0.tex, 0); drawFull();
  }
  gl.disable(gl.BLEND);

  // 6) final
  bindTarget(YL.roomTarget || null);                 // 《一粒光》: during a transition the room is drawn into a texture
  if (DBG.view) {
    const srcV = { room: T.room.tex, dof: T.roomDof.tex, taa: R.roomOut.tex, bloom: T.b1.tex, cov: T.room.tex, depth: T.room.texs[1], defocus: T.defocus.tex, sharp: T.sharp.tex, height: T.height.tex, state: { t: stateTex } }[DBG.view] || T.hdr.tex;
    gl.useProgram(P.blit.p);
    U(P.blit, 'uRes', [canvas.width, canvas.height]); U(P.blit, 'uScale', DBG.view === 'depth' ? 0.5 : DBG.view === 'height' ? 1.2 : 1.5);
    U(P.blit, 'uChan', I(DBG.view === 'cov' ? 1 : (DBG.view === 'depth' || DBG.view === 'height') ? 2 : 0));
    bindTex(P.blit, 'uTex', srcV, 0);
    drawFull();
    return;
  }
  gl.useProgram(P.final.p);
  U(P.final, 'uRes', [canvas.width, canvas.height]); U(P.final, 'uTime', t); U(P.final, 'uFrame', frame); U(P.final, 'uTan', CAM.tan);
  U(P.final, 'uExposure', LIGHT.expoAdapt * R.fade);
  U(P.final, 'uBloomStr', 0.04); U(P.final, 'uGrain', 0.022);
  bindTex(P.final, 'uHdr', T.hdr.tex, 0);
  bindTex(P.final, 'uBloom', T.b1.tex, 1);
  drawFull();
}

/* ============================================================================
   Interaction: wipe the condensation, toggle the lamp, parallax
   ========================================================================== */
const TIME = { scale: 1 };
function toNdc(e) { const r = canvas.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2]; }
// lamp silhouette: closest approach of the ray to the lamp axis vs. the radius of shade / stem / base at that height
function pickLamp(ro, rd) {
  const ox = ro[0] - S.LAMP_X, oz = ro[2] - S.LAMP_Z;
  const a = rd[0] * rd[0] + rd[2] * rd[2]; if (a < 1e-9) return Infinity;
  const t = -(ox * rd[0] + oz * rd[2]) / a; if (t <= 0) return Infinity;
  const dist = Math.hypot(ox + rd[0] * t, oz + rd[2] * t), y = ro[1] + rd[1] * t - S.DESK_TOP;
  let rad = -1;
  if (y > S.SHADE_Y0 - 0.01 && y < S.SHADE_Y1 + 0.03) rad = lerp(S.SHADE_R0, S.SHADE_R1, clamp((y - S.SHADE_Y0) / (S.SHADE_Y1 - S.SHADE_Y0), 0, 1)) + 0.015;
  else if (y >= 0.04 && y <= S.SHADE_Y0) rad = 0.03;
  else if (y > -0.01 && y < 0.04) rad = 0.085;
  return dist < rad ? t : Infinity;
}
function pickGlass(ro, rd) {
  if (rd[2] >= 0) return null;
  const t = (S.GLASS_Z - ro[2]) / rd[2], x = ro[0] + rd[0] * t, y = ro[1] + rd[1] * t;
  for (const p of S.PANES) if (x > p[0] && x < p[2] && y > p[1] && y < p[3]) return { t, x, y };
  return null;
}
const toSim = g => [(g.x - S.WIN_X0) * 1000 / MAG, (g.y - S.WIN_Y0) * 1000 / MAG];
// 擦拭：指腹（约 2.4 cm 宽）抹去内侧冷凝雾；被推开的水在笔画边缘堆成一圈更浓的「水边」，随后慢慢重新起雾。
function wipe(a, b) {
  const [x0, y0] = toSim(a), [x1, y1] = toSim(b);
  const w = 12 / MAG + 1.6, C = SIM.CELL, GW = SIM.GW;
  const ia = clamp(Math.floor((Math.min(x0, x1) - w * 1.4) / C), 0, GW - 1), ib = clamp(Math.floor((Math.max(x0, x1) + w * 1.4) / C), 0, GW - 1);
  const ja = clamp(Math.floor((Math.min(y0, y1) - w * 1.4) / C), 0, SIM.GH - 1), jb = clamp(Math.floor((Math.max(y0, y1) + w * 1.4) / C), 0, SIM.GH - 1);
  const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy + 1e-9;
  for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) {
    const px = (i + 0.5) * C - x0, py = (j + 0.5) * C - y0, t = clamp((px * dx + py * dy) / L2, 0, 1);
    const d = Math.hypot(px - dx * t, py - dy * t) / w, k = j * GW + i;
    if (d < 1) { const f = smooth(1, 0.55, d); SIM.Fin[k] *= 1 - f; SIM.rim[k] *= 1 - f; }
    else if (d < 1.4) SIM.rim[k] = Math.min(1, SIM.rim[k] + 0.18 * (1 - Math.abs(d - 1.15) / 0.25) * Math.max(SIM.F0[k], 0.25));
  }
  AUDIO.rub && AUDIO.rub(Math.hypot(b.x - a.x, b.y - a.y));
}
function toggleLamp() {
  if (YL.onLampTap && YL.onLampTap()) return;      // 《一粒光》: tapping the lamp lets the light out instead
  LIGHT.on = LIGHT.on ? 0 : 1; AUDIO.click && AUDIO.click(LIGHT.on);
}
const PTR = { down: false, mode: '', last: null, moved: 0, sx: 0, sy: 0, hover: false };
const GYRO = { base: null, on: false, asked: false };
// outside: the window seen from the street (its opening in the wall)
function pickWindowOut(ro, rd) {
  if (rd[2] <= 0) return false;
  const t = (-0.30 - ro[2]) / rd[2], x = ro[0] + rd[0] * t, y = ro[1] + rd[1] * t;
  return Math.abs(x - S.WIN_CX) < S.WIN_HW && Math.abs(y - S.WIN_CY) < S.WIN_HH;
}
function onDown(e) {
  AUDIO.unlock && AUDIO.unlock();
  YL.ptrDown = true; { const [nx, ny] = toNdc(e); YL.ptr = { nx, ny, t: performance.now() / 1000, speed: 0 }; }
  requestGyro();
  try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  const [nx, ny] = toNdc(e), rd = camRay(nx, ny);
  if (VIEW.out) {
    PTR.down = true; PTR.moved = 0; PTR.sx = e.clientX; PTR.sy = e.clientY;
    PTR.mode = pickWindowOut(CAM.pos, rd) ? 'lamp' : 'pan';
    UI.poke(); return;
  }
  const tl = pickLamp(CAM.pos, rd), g = pickGlass(CAM.pos, rd);
  PTR.down = true; PTR.moved = 0; PTR.sx = e.clientX; PTR.sy = e.clientY;
  if (tl < (g ? g.t : Infinity)) PTR.mode = 'lamp';
  else if (g) { PTR.mode = 'wipe'; PTR.last = g; wipe(g, g); }
  else PTR.mode = 'pan';
  UI.poke();
}
function onMove(e) {
  UI.poke();
  const [nx, ny] = toNdc(e), rd = camRay(nx, ny);
  const now = performance.now() / 1000, P0 = YL.ptr;     // where the pointer is, and how fast it moves (for the little light)
  YL.ptr = { nx, ny, t: now, speed: P0 ? Math.hypot(nx - P0.nx, ny - P0.ny) / Math.max(now - P0.t, 1e-3) : 0 };
  if (!PTR.down) {
    if (e.pointerType === 'mouse') {
      CAM.parT = [clamp(nx, -1, 1) * 0.55, clamp(ny, -1, 1) * 0.45];
      const lamp = VIEW.out ? pickWindowOut(CAM.pos, rd) : pickLamp(CAM.pos, rd) < Infinity;
      if (lamp !== PTR.hover) { PTR.hover = lamp; canvas.style.cursor = lamp ? 'pointer' : 'default'; }
    }
    return;
  }
  PTR.moved += Math.hypot(e.clientX - PTR.sx, e.clientY - PTR.sy); PTR.sx = e.clientX; PTR.sy = e.clientY;
  if (PTR.mode === 'wipe') {
    const g = pickGlass(CAM.pos, rd);
    if (g && PTR.last) wipe(PTR.last, g);
    PTR.last = g;
  } else if (PTR.mode === 'pan') {
    CAM.parT = [clamp(nx, -1, 1), clamp(ny, -1, 1)];     // drag outside the glass: lean around
  }
}
function onUp() {
  YL.ptrDown = false;
  if (PTR.down && PTR.mode === 'lamp' && PTR.moved < 12) toggleLamp();
  if (PTR.mode === 'pan' && !GYRO.on) CAM.parT = [0, 0];
  PTR.down = false; PTR.mode = ''; PTR.last = null;
}
canvas.addEventListener('pointerdown', onDown);
canvas.addEventListener('pointermove', onMove);
canvas.addEventListener('pointerup', e => { AUDIO.unlock && AUDIO.unlock(); onUp(e); });
canvas.addEventListener('pointercancel', onUp);
canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !PTR.down) CAM.parT = [0, 0]; });
// gyroscope parallax (phones): relative to a slowly re-centring reference attitude
function requestGyro() {
  if (GYRO.asked || !IS_MOBILE) return; GYRO.asked = true;
  const D = window.DeviceOrientationEvent;
  if (D && typeof D.requestPermission === 'function') D.requestPermission().then(r => { if (r === 'granted') GYRO.on = true; }).catch(() => {});
  else GYRO.on = true;
}
window.addEventListener('deviceorientation', e => {
  if (!GYRO.on || e.beta == null || PTR.down) return;
  const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
  let x = e.gamma, y = e.beta;
  if (ang === 90) { x = e.beta; y = -e.gamma; } else if (ang === -90 || ang === 270) { x = -e.beta; y = e.gamma; }
  if (!GYRO.base) GYRO.base = [x, y];
  GYRO.base[0] += (x - GYRO.base[0]) * 0.004; GYRO.base[1] += (y - GYRO.base[1]) * 0.004;
  CAM.parT = [clamp((x - GYRO.base[0]) / 14, -1, 1), clamp(-(y - GYRO.base[1]) / 14, -1, 1)];
});

/* ============================================================================
   UI: a single, quiet corner control
   ========================================================================== */
const AUDIO = {};
const UI = (() => {
  const ui = document.getElementById('ui'), btn = document.getElementById('uiBtn'), panel = document.getElementById('panel');
  const rain = document.getElementById('rain'), speed = document.getElementById('speed'), snd = document.getElementById('snd');
  let idleT = 0, hidden = false;
  const api = {
    poke() { idleT = 0; if (!hidden) ui.classList.remove('idle'); },
    tick(dt) { idleT += dt; if (idleT > 4.5 && !panel.classList.contains('open')) ui.classList.add('idle'); },
    show() { ui.classList.add('show'); },
    toggleHidden() { hidden = !hidden; ui.classList.toggle('hidden', hidden); },
  };
  btn.addEventListener('click', e => { e.stopPropagation(); panel.classList.toggle('open'); api.poke(); AUDIO.unlock && AUDIO.unlock(); });
  ui.addEventListener('pointerdown', e => e.stopPropagation());
  ui.addEventListener('pointermove', () => api.poke());
  canvas.addEventListener('pointerdown', () => panel.classList.remove('open'));
  if (IS_MOBILE) panel.querySelector('.hint').innerHTML = '轻触台灯开关；在玻璃上划过可擦去雾气；倾斜手机看看。';
  // season / hour / flow
  const segS = document.getElementById('season'), todIn = document.getElementById('tod'), todLabel = document.getElementById('todLabel'), flowB = document.getElementById('flow');
  const segV = document.getElementById('view');
  api.showView = () => segV.querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.v === (VIEW.want ? 1 : 0)));
  api.setView = out => { if (VIEW.failed) out = false; VIEW.want = out; api.showView(); };
  segV.addEventListener('click', e => { if (e.target.dataset.v !== undefined) api.setView(e.target.dataset.v === '1'); });
  api.showView();
  const rainLbl = document.getElementById('rainLbl');
  const showSeason = () => { segS.querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.s === WORLD.season)); rainLbl.textContent = SEASONS[WORLD.season].snow ? '雪势' : '雨势'; };
  const setSeason = k => {
    WORLD.season = (k + 4) % 4;
    if (WORLD.atDusk) WORLD.tod = duskTime(WORLD.season);         // "dusk" stays dusk: summer's is later than winter's
    showSeason(); api.syncTime(true);
  };
  segS.addEventListener('click', e => { if (e.target.dataset.s !== undefined) setSeason(+e.target.dataset.s); });
  todIn.addEventListener('input', () => { WORLD.tod = +todIn.value; WORLD.atDusk = false; api.syncTime(true); });
  const setFlow = on => { WORLD.flowing = on; if (on) WORLD.atDusk = false; flowB.textContent = on ? '流逝' : '停'; flowB.setAttribute('aria-pressed', on); };
  flowB.addEventListener('click', () => setFlow(!WORLD.flowing));
  let lastLabel = '';
  api.syncTime = (force) => {
    const txt = fmtTod(WORLD.tod) + ' · ' + periodName(WORLD.tod, WORLD.h);
    if (txt !== lastLabel || force) { todLabel.textContent = txt; lastLabel = txt; if (document.activeElement !== todIn) todIn.value = WORLD.tod; }
  };
  showSeason(); setFlow(WORLD.flowing); api.syncTime(true);
  api.setSeason = setSeason; api.setFlow = setFlow;
  rain.addEventListener('input', () => { SIM.rainBase = +rain.value; });
  speed.addEventListener('input', () => { TIME.scale = +speed.value; });
  const setSnd = on => { snd.textContent = on ? '开' : '关'; snd.setAttribute('aria-pressed', on); AUDIO.setEnabled && AUDIO.setEnabled(on); };
  snd.addEventListener('click', () => setSnd(snd.getAttribute('aria-pressed') !== 'true'));
  window.addEventListener('keydown', e => {
    AUDIO.unlock && AUDIO.unlock();
    if (e.key === 'h' || e.key === 'H') api.toggleHidden();
    if (e.key === 'l' || e.key === 'L') toggleLamp();
    if (e.key === 'm' || e.key === 'M') setSnd(snd.getAttribute('aria-pressed') !== 'true');
    if (e.key === 's' || e.key === 'S') api.setSeason(WORLD.season + 1);
    if (e.key === 't' || e.key === 'T') api.setFlow(!WORLD.flowing);
    if (e.key === 'v' || e.key === 'V') api.setView(!VIEW.want);
  });
  return api;
})();

/* ============================================================================
   AUDIO — everything synthesised with Web Audio, driven by the simulation
   ----------------------------------------------------------------------------
   · 雨幕：粉红噪声 → 高通 180Hz → 低通约 2.4kHz（隔着玻璃，高频被削弱），慢速随机阵风调制。
   · 近处雨点：离线合成 9 秒稀疏的衰减共振脉冲（Poisson 到达，1–6 kHz），两路不同速率循环避免重复感。
   · 玻璃上的「嗒」：由模拟中真实落在玻璃上的雨滴触发；响度 ∝ D^1.5，声像随落点左右移动；
     音色 = 瞬态 + 窗玻璃几个低阶模态（约 0.5/1.1/1.8/3 kHz）的衰减。
   · 滴水：水从窗框流下时触发；气泡共振（Minnaert）在气泡上浮时频率上扬，是「叮」声的来源。
   · 车声：每辆车一路滤波噪声，响度随距离、声像随位置、频率随径向速度（多普勒）变化，与画面同步。
   · 室内底噪、台灯开关的咔哒、手指擦玻璃的摩擦声；房间混响用程序生成的指数衰减脉冲响应。
   ========================================================================== */
Object.assign(AUDIO, (() => {
  let ctx = null, master, comp, wet, film, roomVol, enabled = true, ready = false;
  let bedGain, bedLP, patGain, roomGain, windGain, windBP, whistle, tickBuf = [], dripBuf = [], rubBuf = [], clickBuf, cars = [], lastRub = 0, birdT = 2;
  let gust = 0, gustT = 0, lastTick = 0, ticksThisSec = 0, secT = 0, dripT = 3;
  const rand = Math.random;
  function noiseBuffer(sec, kind) {
    const sr = ctx.sampleRate, n = Math.floor(sr * sec), buf = ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (let i = 0; i < n; i++) {
        const w = rand() * 2 - 1;
        if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; continue; }
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      }
      // cross-fade the loop seam
      const f = Math.floor(sr * 0.05);
      for (let i = 0; i < f; i++) { const a = i / f; d[i] = d[i] * a + d[n - f + i] * (1 - a); }
    }
    return buf;
  }
  function patterBuffer(sec, density) {
    const sr = ctx.sampleRate, n = Math.floor(sr * sec), buf = ctx.createBuffer(2, n, sr);
    const L = buf.getChannelData(0), Rr = buf.getChannelData(1);
    for (let t = 0; ; ) {
      t += -Math.log(1 - rand()) / density; if (t >= sec) break;
      const i0 = Math.floor(t * sr), f = 900 + rand() * 5200, dec = 0.002 + rand() * 0.01, amp = 0.04 + 0.3 * rand() ** 3, pan = rand();
      const len = Math.floor(dec * 7 * sr); let ph = rand() * 6.283;
      for (let k = 0; k < len; k++) {
        const tt = k / sr, env = Math.exp(-tt / dec) * (1 - Math.exp(-tt / 0.0003));
        const v = amp * env * (Math.sin(ph) * 0.55 + (rand() * 2 - 1) * 0.45 * Math.exp(-tt / 0.0012));
        ph += 6.2832 * f / sr; const j = (i0 + k) % n; L[j] += v * (1 - pan); Rr[j] += v * pan;
      }
    }
    return buf;
  }
  function tickBuffer() {
    const sr = ctx.sampleRate, n = Math.floor(sr * 0.09), buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
    const modes = [[480 + rand() * 120, 0.035, 0.5], [1050 + rand() * 200, 0.022, 0.45], [1750 + rand() * 300, 0.014, 0.35], [2900 + rand() * 500, 0.008, 0.3]];
    for (let i = 0; i < n; i++) {
      const t = i / sr; let v = (rand() * 2 - 1) * Math.exp(-t / 0.0007) * 0.9;
      for (const [f, dcy, a] of modes) v += a * Math.sin(6.2832 * f * t) * Math.exp(-t / dcy);
      d[i] = v * (1 - Math.exp(-t / 0.0002)) * 0.5;
    }
    return buf;
  }
  function dripBuffer() {
    // bubble ("plink"): Minnaert resonance rising as the bubble surfaces, plus the impact click
    const sr = ctx.sampleRate, n = Math.floor(sr * 0.22), buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
    const f0 = 1100 + rand() * 900, rise = 0.35 + rand() * 0.5, dec = 0.03 + rand() * 0.035; let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr, f = f0 * (1 + rise * (1 - Math.exp(-t / 0.025)));
      ph += 6.2832 * f / sr;
      d[i] = (Math.sin(ph) * Math.exp(-t / dec) * 0.5 + (rand() * 2 - 1) * Math.exp(-t / 0.0015) * 0.35) * (1 - Math.exp(-t / 0.0004));
    }
    return buf;
  }
  function clickBuffer() {
    const sr = ctx.sampleRate, n = Math.floor(sr * 0.12), buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const c1 = (rand() * 2 - 1) * Math.exp(-t / 0.0012) + 0.6 * Math.sin(6.2832 * 2400 * t) * Math.exp(-t / 0.004);
      const t2 = t - 0.018, c2 = t2 > 0 ? (rand() * 2 - 1) * Math.exp(-t2 / 0.0009) * 0.6 + 0.4 * Math.sin(6.2832 * 3100 * t2) * Math.exp(-t2 / 0.003) : 0;
      d[i] = (c1 + c2 + 0.25 * Math.sin(6.2832 * 190 * t) * Math.exp(-t / 0.03)) * 0.4;
    }
    return buf;
  }
  function reverbIR() {
    const sr = ctx.sampleRate, n = Math.floor(sr * 1.4), buf = ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch); let lp = 0;
      for (let i = 0; i < n; i++) { const t = i / sr; lp += ((rand() * 2 - 1) - lp) * 0.35; d[i] = lp * Math.exp(-t / 0.32) * (t < 0.012 ? t / 0.012 : 1); }
    }
    return buf;
  }
  function loop(buf, rate, dest) { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; s.loopStart = 0; s.connect(dest); s.start(0, rand() * buf.duration); return s; }
  function build() {
    master = ctx.createGain(); master.gain.value = 1;
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 2.5; comp.attack.value = 0.02; comp.release.value = 0.4;
    // 《一粒光》: the room's sounds → roomVol (each world fades the rain in or out) → film (the whole film's fader) → compressor
    film = ctx.createGain(); film.gain.value = 0; roomVol = ctx.createGain(); roomVol.gain.value = YL.roomVol ?? 1;
    master.connect(roomVol); roomVol.connect(film); film.connect(comp); comp.connect(ctx.destination);
    const conv = ctx.createConvolver(); conv.buffer = reverbIR(); wet = ctx.createGain(); wet.gain.value = 0.35; wet.connect(conv); conv.connect(master);
    const pink = noiseBuffer(9.3, 'pink'), brown = noiseBuffer(7.1, 'brown');
    // rain wash outside the glass
    bedGain = ctx.createGain(); bedGain.gain.value = 0;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 180;
    bedLP = ctx.createBiquadFilter(); bedLP.type = 'lowpass'; bedLP.frequency.value = 2400; bedLP.Q.value = 0.4;
    loop(pink, 1.0, hp); loop(pink, 0.947, hp);
    hp.connect(bedLP); bedLP.connect(bedGain); bedGain.connect(master);
    // patter on the sill / awning outside
    const pat = patterBuffer(9.0, 60);
    patGain = ctx.createGain(); patGain.gain.value = 0;
    const pLP = ctx.createBiquadFilter(); pLP.type = 'lowpass'; pLP.frequency.value = 4200;
    loop(pat, 1.0, pLP); loop(pat, 0.913, pLP);
    pLP.connect(patGain); patGain.connect(master);
    // wind round the building: band-passed noise swept by the gusts, and a faint whistle in the window's gaps
    windGain = ctx.createGain(); windGain.gain.value = 0;
    windBP = ctx.createBiquadFilter(); windBP.type = 'bandpass'; windBP.frequency.value = 400; windBP.Q.value = 0.9;
    whistle = ctx.createBiquadFilter(); whistle.type = 'bandpass'; whistle.frequency.value = 820; whistle.Q.value = 28;
    const wg = ctx.createGain(); wg.gain.value = 2.2;
    loop(pink, 0.71, windBP); loop(pink, 1.13, whistle);
    windBP.connect(windGain); whistle.connect(wg); wg.connect(windGain); windGain.connect(master);
    // room tone
    roomGain = ctx.createGain(); roomGain.gain.value = 0.05;
    const rLP = ctx.createBiquadFilter(); rLP.type = 'lowpass'; rLP.frequency.value = 160;
    loop(brown, 1.0, rLP); rLP.connect(roomGain); roomGain.connect(master);
    for (let i = 0; i < 6; i++) tickBuf.push(tickBuffer());
    for (let i = 0; i < 5; i++) dripBuf.push(dripBuffer());
    clickBuf = clickBuffer();
    for (let k = 0; k < 3; k++) {                                   // skin on wet glass: short soft noise grains
      const sr = ctx.sampleRate, n = Math.floor(sr * 0.06), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (rand() * 2 - 1) * Math.sin(Math.PI * i / n) * 0.3;
      rubBuf.push(b);
    }
    // three car channels: engine/road rumble + tyre hiss on the wet street, panned and filtered per frame
    for (let i = 0; i < 3; i++) {
      const g = ctx.createGain(); g.gain.value = 0;
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.6;
      const hiss = ctx.createBiquadFilter(); hiss.type = 'bandpass'; hiss.frequency.value = 2600; hiss.Q.value = 0.8;
      const hg = ctx.createGain(); hg.gain.value = 0.6;
      const s1 = loop(brown, 1.0, bp), s2 = loop(pink, 1.0, hiss);
      bp.connect(g); hiss.connect(hg); hg.connect(g);
      if (pan) { g.connect(pan); pan.connect(master); } else g.connect(master);
      cars.push({ g, pan, bp, s1, s2 });
    }
    ready = true;
  }
  // 鸟：清晨（春夏）的一串鸣叫，隔着玻璃。两种：麻雀的短促「啾」，和白头鹎那样起伏的几个音。
  function birdPhrase() {
    const t0 = ctx.currentTime + 0.05, sparrow = rand() < 0.55, n = sparrow ? 2 + Math.floor(rand() * 4) : 3 + Math.floor(rand() * 3);
    const g = ctx.createGain(); g.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4800;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.connect(g); g.connect(lp);
    if (p) { p.pan.value = rand() * 1.6 - 0.8; lp.connect(p); p.connect(master); p.connect(wet); } else lp.connect(master);
    let t = t0; const base = sparrow ? 3300 + rand() * 700 : 1700 + rand() * 600, amp = 0.025 + 0.03 * rand();
    for (let i = 0; i < n; i++) {
      const d = sparrow ? 0.05 + 0.03 * rand() : 0.09 + 0.12 * rand();
      const f0 = base * (sparrow ? 1 + 0.1 * rand() : 0.85 + 0.5 * rand()), f1 = f0 * (sparrow ? 0.7 + 0.2 * rand() : 0.8 + 0.5 * rand());
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + d);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + 0.012); g.gain.setTargetAtTime(0, t + d * 0.6, d * 0.25);
      t += d + (sparrow ? 0.06 + 0.08 * rand() : 0.04 + 0.1 * rand());
    }
    o.start(t0); o.stop(t + 0.3);
  }
  function oneShot(buf, gain, pan, rate = 1, toWet = 0.3, lp = 0) {
    if (!ready) return;
    const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.value = gain;
    let node = s;
    if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; node.connect(f); node = f; }
    node.connect(g);
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) { p.pan.value = clamp(pan, -1, 1); g.connect(p); p.connect(master); p.connect(wet); } else { g.connect(master); }
    if (!p) g.connect(wet);
    s.start();
  }
  return {
    unlock() {
      if (!enabled) return;
      try {
        if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; ctx = new AC(); build(); }
        if (ctx.state === 'suspended') ctx.resume();
        master.gain.cancelScheduledValues(ctx.currentTime);
        film.gain.setTargetAtTime(1.0, ctx.currentTime, 1.2);         // gentle fade-in
      } catch (e) { console.warn('audio', e); }
    },
    setEnabled(on) {
      enabled = on;
      if (!ctx) { if (on) this.unlock(); return; }
      film.gain.setTargetAtTime(on ? 1.0 : 0, ctx.currentTime, on ? 0.6 : 0.25);
      if (on && ctx.state === 'suspended') ctx.resume();
    },
    suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); },
    // other worlds play into the film bus (and may borrow the noise generator)
    bus() { return ready && ctx.state === 'running' ? { ctx, out: film, noiseBuffer, loop } : null; },
    resume() { if (ctx && enabled && ctx.state === 'suspended') ctx.resume(); },
    click(on) { if (ready) oneShot(clickBuf, 0.5 * (1 - 0.92 * VIEW.mix), -0.45, on ? 1.0 : 0.88, 0.4, VIEW.mix > 0.5 ? 1500 : 0); },
    // 一粒光的动机：三个音（A–C♯–E 的上行），每个世界换一种音色；这里是房间里的版本：柔和的钢片琴
    motif(pan = 0, gain = 0.06, rate = 1) {
      if (!ready || ctx.state !== 'running') return;
      const t0 = ctx.currentTime + 0.02, notes = [880, 1108.7, 1318.5];
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      const g = ctx.createGain(); g.gain.value = 1;
      if (p) { p.pan.value = clamp(pan, -1, 1); g.connect(p); p.connect(master); p.connect(wet); } else { g.connect(master); g.connect(wet); }
      notes.forEach((f, i) => {
        const ts = t0 + i * 0.16 / rate;
        for (const [m, a] of [[1, 1], [2.76, 0.25], [5.4, 0.08]]) {      // a struck bar: fundamental + inharmonic partials
          const o = ctx.createOscillator(), e = ctx.createGain();
          o.frequency.value = f * m * rate; o.connect(e); e.connect(g);
          e.gain.setValueAtTime(0, ts); e.gain.linearRampToValueAtTime(gain * a, ts + 0.006);
          e.gain.setTargetAtTime(0, ts + 0.01, (i === 2 ? 0.9 : 0.35) / m);
          o.start(ts); o.stop(ts + 4);
        }
      });
    },
    // 雷声：闪电通道有几公里长，各段的声音先后到达，所以是一串此起彼伏的滚动；近雷先有一声撕裂的「咔」。
    // 空气吸收高频，越远越闷（低通截止 ∝ 1/距离）；隔着玻璃再削一点高频。延迟 = 距离 / 343 m/s。
    thunder(dist) {
      if (!ready || ctx.state !== 'running') return;
      const sr = ctx.sampleRate, dur = 4 + 3 * rand() + dist * 0.4, n = Math.floor(sr * dur), buf = ctx.createBuffer(2, n, sr);
      const peaks = [];
      for (let i = 0, np = 4 + Math.floor(rand() * 5); i < np; i++)
        peaks.push({ t: i === 0 ? 0.02 : 0.1 + rand() ** 1.5 * dur * 0.5, a: i === 0 ? 1 : 0.3 + 0.7 * rand(), r: 0.04 + 0.25 * rand(), d: 0.4 + 1.3 * rand() });
      const crack = clamp(1 - dist / 2.5, 0, 1), fc = 1800 / (1 + dist), k1 = 1 - Math.exp(-6.2832 * fc / sr), k2 = 1 - Math.exp(-6.2832 * 40 / sr);
      let peak = 1e-6;
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch); let a = 0, b = 0, lo = 0;
        for (let i = 0; i < n; i++) {
          const t = i / sr, w = rand() * 2 - 1;
          a += (w - a) * k1; b += (a - b) * k1; lo += (b - lo) * k2;      // two-pole low-pass, minus the sub-audible drift
          let env = 0;
          for (const p of peaks) { const u = t - p.t; if (u > 0) env += p.a * (1 - Math.exp(-u / p.r)) * Math.exp(-u / p.d); }
          d[i] = (b - lo) * env + crack * w * Math.exp(-t / 0.05) * 0.25 * (t < 0.002 ? t / 0.002 : 1);
          peak = Math.max(peak, Math.abs(d[i]));
        }
      }
      for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < n; i++) d[i] /= peak; }
      const src = ctx.createBufferSource(); src.buffer = buf;
      const g = ctx.createGain(); g.gain.value = clamp(0.9 / (0.6 + dist * 0.5), 0.08, 0.7);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = VIEW.mix > 0.5 ? 6000 : 2200;
      src.connect(lp); lp.connect(g); g.connect(master); g.connect(wet);
      src.start(ctx.currentTime + dist / 0.343 / Math.max(TIME.scale, 0.25));
    },
    rub(dist) {
      if (!ready || dist < 0.002 || ctx.currentTime - lastRub < 0.035) return;
      lastRub = ctx.currentTime;
      oneShot(rubBuf[(rand() * rubBuf.length) | 0], clamp(dist * 9, 0.02, 0.25), 0, 0.9 + rand() * 0.2, 0.2, 1800);
    },
    update(dt, wdt) {
      if (!ready || ctx.state !== 'running') { SIM.events.length = 0; return; }
      const now = ctx.currentTime, I = SIM.rain;
      roomVol.gain.setTargetAtTime(YL.roomVol ?? 1, now, 0.5);
      // slow gusts: random walk retargeted every couple of seconds
      gustT -= dt; if (gustT <= 0) { gustT = 1.5 + rand() * 2.5; gust = clamp(gust * 0.6 + (rand() - 0.45) * 0.8, -0.4, 0.6); }
      // snow falls almost silently and the snow cover soaks up the street's echoes: the bed drops and darkens
      const SE = SEASONS[WORLD.season], snow = SE.snow, ts = Math.min(1, TIME.scale * 1.3 + 0.2);
      // outside there is no glass in between: the rain is louder and brighter, the patter is the pavement and the puddles,
      // the room's hum is gone and the drops on the window are far away
      const out = VIEW.mix;
      const bed = 0.4 * Math.pow(I, 0.8) * (1 + 0.35 * gust) * ts * (snow ? 0.22 : 1) * (0.8 + 0.25 * Math.sqrt(SE.rainR)) * (1 + 0.6 * out);
      bedGain.gain.setTargetAtTime(bed, now, 0.8);
      bedLP.frequency.setTargetAtTime((2500 + 1300 * I + 600 * gust) * (snow ? 0.4 : 1) * (1 + 1.6 * out), now, 0.8);
      patGain.gain.setTargetAtTime(0.22 * Math.pow(I, 1.2) * (1 + 0.5 * gust) * (snow ? 0.08 : 1) * (1 + 1.3 * out), now, 0.6);
      roomGain.gain.setTargetAtTime(0.05 * (1 - out), now, 0.8);
      const wn = WORLD.windNow;
      windGain.gain.setTargetAtTime(0.16 * Math.pow(wn, 1.4) * ts, now, 0.7);
      windBP.frequency.setTargetAtTime(260 + 520 * wn + 120 * gust, now, 1.0);
      whistle.frequency.setTargetAtTime(760 + 160 * wn + 60 * gust, now, 1.5);
      // birds at first light in spring and summer, fewer in heavy rain; a stray sparrow during the day
      const dawn = WORLD.season < 2 ? smooth(-7, -2, WORLD.h) * (1 - smooth(8.5, 10, WORLD.tod)) + 0.12 * smooth(2, 8, WORLD.h) : 0;
      birdT -= wdt;
      if (birdT <= 0) { birdT = 1.2 + rand() * 5; if (rand() < dawn * (1.1 - I)) birdPhrase(); }
      // window ticks from real impacts (rate-limited)
      secT += dt; if (secT > 1) { secT = 0; ticksThisSec = 0; }
      for (const ev of SIM.events) {
        if (ev.type === 'hit' && ev.D > 0.9 && ticksThisSec < 9 && now - lastTick > 0.045) {
          const pan = (ev.x / SIM.W) * 2 - 1;
          oneShot(tickBuf[(rand() * tickBuf.length) | 0], clamp(0.05 * Math.pow(ev.D, 1.5), 0.02, 0.32) * (1 - 0.85 * VIEW.mix), pan * 0.7, 0.85 + rand() * 0.35 + (2 - ev.D) * 0.05, 0.25, 5200);
          lastTick = now; ticksThisSec++;
        } else if (ev.type === 'drain' && rand() < 0.35) {
          oneShot(dripBuf[(rand() * dripBuf.length) | 0], 0.06 + 0.06 * rand(), (ev.x / SIM.W) * 1.4 - 0.7, 0.9 + rand() * 0.25, 0.5, 6000);
        }
      }
      SIM.events.length = 0;
      // an eave dripping onto the metal sill outside, irregular
      dripT -= wdt; if (dripT <= 0) { dripT = 1.6 + rand() * 4.5 / (0.4 + I); oneShot(dripBuf[(rand() * dripBuf.length) | 0], (0.05 + 0.05 * I) * (1 + 1.2 * VIEW.mix), 0.55, 0.85 + rand() * 0.3, 0.55, 5000); }
      // cars: loudness ~ 1/(1+(d/d0)²), pan by bearing, Doppler on the rumble
      for (let k = 0; k < cars.length; k++) {
        const ch = cars[k], c = OUT.cars[k];
        if (!c) { ch.g.gain.setTargetAtTime(0, now, 0.5); continue; }
        const dx = c.x, dz = c.z, d = Math.hypot(dx, dz, S.GROUND_Y - 1.2);
        const vr = c.dir * c.v * dx / d;                       // radial velocity (+ = receding)
        const dop = 343 / (343 + vr);
        const L = (c.bus ? 0.8 : 0.5) * c.I / (1 + (d / 11) ** 2) * smooth(0, 4, c.age) * Math.min(1, TIME.scale + 0.2);
        ch.g.gain.setTargetAtTime(L, now, 0.15);
        if (ch.pan) ch.pan.pan.setTargetAtTime(clamp(dx / (Math.abs(dx) + 12), -0.95, 0.95), now, 0.15);
        ch.s1.playbackRate.setTargetAtTime(dop * TIME.scale ** 0.2, now, 0.2);
        ch.bp.frequency.setTargetAtTime((380 + 260 * dop) * (c.bus ? 0.6 : 1), now, 0.2);
      }
    },
  };
})());

/* ============================================================================
   Main loop
   ========================================================================== */
let running = false, lastT = 0, simT = DBG.t0, realT = 0, frame = 0;
R.fade = DBG.shot ? 1 : 0; R.fadeIn = 4.5;
// 切换视角：先暗下（0.6 s），着色器就绪后换到另一边，再亮起（1.2 s）；眼睛在新的一边重新适应
function viewTick(dt) {
  if (VIEW.want !== VIEW.out) {
    if (VIEW.want) ensureStreet();
    R.fade = Math.max(0, R.fade - dt / 0.6);
    if (R.fade <= 0 && (!VIEW.want || streetReady())) {
      VIEW.out = VIEW.want; R.taaReset = 1; LIGHT.adapted = false; R.fadeIn = 1.2;
      if (VIEW.out && !VIEW.hinted && !DBG.shot) {
        VIEW.hinted = true;
        const h = document.getElementById('hint'); h.textContent = '轻触亮着的窗 · 开关屋里的台灯';
        setTimeout(() => h.classList.add('show'), 1400); setTimeout(() => h.classList.remove('show'), 7500);
      }
      CAM.par = [0, 0]; CAM.parT = [0, 0];
      UI.showView && UI.showView();
    }
  }
  VIEW.mix += ((VIEW.out ? 1 : 0) - VIEW.mix) * (1 - Math.exp(-dt / 0.6));
}
function loop(now) {
  if (!running) return;
  if (DBG.frames && frame >= DBG.frames) { window.__done = true; return; }
  requestAnimationFrame(loop);
  if (window.__hold) { lastT = 0; window.__holdAck = (window.__holdAck || 0) + 1; return; }   // debug: freeze for screenshots
  const t = now / 1000;
  const dt = Math.min(0.05, Math.max(0.001, t - (lastT || t)));
  lastT = t;
  realT += dt;
  const wdt = dt * TIME.scale;                 // world time (rain, street) follows the time-flow slider
  simT += wdt;
  YL.director && YL.director.update(dt, realT);
  updateCamera(realT, dt, canvas.clientWidth / Math.max(1, canvas.clientHeight));
  adaptQuality(dt);
  resize();
  worldUpdate(wdt);
  updateOutside(wdt, simT);
  simAdvance(wdt);
  viewTick(dt);
  if (!DBG.shot && VIEW.want === VIEW.out) R.fade = Math.min(1, R.fade + dt / R.fadeIn);
  if (!(YL.director && YL.director.renderFrame && YL.director.renderFrame(dt, realT, simT))) { render(simT, dt, realT); YL.director && YL.director.afterRoom && YL.director.afterRoom(); }
  UI.tick(dt);
  if (frame % 15 === 0) UI.syncTime();
  AUDIO.update && AUDIO.update(dt, wdt);
  frame++;
  if (DBG.shot) gl.finish();                     // screenshots: count frames the GPU has actually finished
  window.__frames = frame;
  if (frame === 2) {
    const v = document.getElementById('veil'); v.classList.add('gone'); if (DBG.shot) v.style.display = 'none';
    if (!DBG.shot) setTimeout(() => { UI.show(); const h = document.getElementById('hint'); h.classList.add('show'); setTimeout(() => h.classList.remove('show'), 7000); }, 3800);
  }
}
if (QS.has('hooks')) window.__dbg = { AUDIO, WORLD, SIM, LIGHT, VIEW, R };  // test harness hooks
function start() {
  if (running) return;
  running = true; lastT = 0;
  requestAnimationFrame(loop);
}
function stop() { running = false; }
document.addEventListener('visibilitychange', () => { if (document.hidden) { stop(); AUDIO.suspend(); } else { start(); AUDIO.resume(); } });

// initial render scales from the pixel count; adaptQuality() refines them from measured frame times
function initialScales() {
  if (QS.get('q')) return;
  const dpr = Math.min(window.devicePixelRatio || 1, R.dprCap);
  const px = Math.max(1, window.innerWidth * window.innerHeight) * dpr * dpr;
  R.mainScale = clamp(Math.sqrt((IS_MOBILE ? 2.2e6 : 4.2e6) / px), 0.6, 1);
  R.roomScale = clamp(Math.sqrt((IS_MOBILE ? 0.45e6 : 1.3e6) / (px * R.mainScale * R.mainScale)), 0.4, R.roomMax);
}
function whenProgramsReady(then) {
  const wait = () => {
    if (!programsReady()) { setTimeout(wait, 30); return; }
    try { finishPrograms(); } catch (e) { console.error(e.message); fail(e.message); return; }
    then();
  };
  wait();
}
function boot() {
  if (DBG.shot) window.__dbg = { SIM, CAM, PTR, LIGHT, R, OUT, WORLD, worldUpdate, pickGlass, camRay, simAdvance, simStats, spawnCar, updateOutside };
  if (!initGL()) { fail('no webgl2'); return; }
  buildOutside();
  for (let i = 0; i < 3; i++) spawnCar(), OUT.cars[i].x = (rnd() - 0.5) * 120;
  for (let i = 0; i < 3; i++) spawnPed(-14 + i * 10 + rnd() * 6);
  initialScales();
  buildPrograms();                      // compile on the GPU (in parallel where supported) while the CPU prewarms the rain
  const total = Math.round((+(QS.get('warm') || 150)) * 30), t0 = performance.now();
  let done = 0;
  const slice = () => {
    const t1 = performance.now();
    while (done < total && performance.now() - t1 < 35) { const n = Math.min(30, total - done); prewarmSlice(1 / 30, n); done += n; }
    if (done < total) { setTimeout(slice, 0); return; }
    SIM.events.length = 0;
    console.log('prewarm', (performance.now() - t0).toFixed(0) + 'ms', JSON.stringify(simStats()));
    whenProgramsReady(() => { resize(); start(); });
  };
  slice();
}
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); stop(); });
canvas.addEventListener('webglcontextrestored', () => {
  R.tg = {}; R.progs = {};
  createResources(); buildPrograms();
  whenProgramsReady(() => { canvas.width = 1; resize(); start(); });
});
// 《一粒光》: what the director, the hero and the other worlds need from the host
Object.assign(YL, { QS, DBG, S, V, CAM, LIGHT, HERO, WORLD, SIM, AUDIO, R, clamp, lerp, smooth, bb, mulc, camRay, pickGlass, drift, rnd: mulberry32(DBG.seed + 1),
  framing, canvasAspect: () => canvas.clientWidth / Math.max(1, canvas.clientHeight), makeProgram, checkProgram, makeTarget, bindTarget, bindTex, drawFull, U, I });
Object.defineProperty(YL, 'gl', { get: () => gl });          // (a live getter: gl is created at boot)
setTimeout(boot, 30);
})();
