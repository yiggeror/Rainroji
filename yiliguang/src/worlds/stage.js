/* ============================================================================
   世界四 · 戏台上的皮影 —— 龙戏珠
   ----------------------------------------------------------------------------
   村口戏台那块幕的里面。幕后点着的那盏灯，就是那粒光：它在幕上的那一团亮，就是龙要追的珠。
   · 每一片皮影（染色的半透明牛皮）都从灯的位置投到幕上：逐像素求交，贴着幕的清楚，离幕远的大而虚；
     灯一动，远处的影子跟着挪（近大远小的视差），近幕的几乎不动。
   · 远山、祥云、宝塔、柳、渔船、鲤鱼、一排浪，一条九节的龙。龙头朝着珠游，身子沿着头走过的路一节节跟上来。
   · 最后珠往下一沉，落进浪里——浪线以下就是海（另一个世界）：这里只告诉外面哪里是浪线以下（alpha），
     外面把海画进去，镜头跟着珠往下走。
   ========================================================================== */
(() => {
'use strict';
const YL = window.YL;
const W = (YL.worlds = YL.worlds || {});
const NP = 48;
const SW = 3.2, SH = 1.8;                    // the screen, metres
const D = 1.1;                               // the lamp, behind it
const VS = `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float;
uniform sampler2D uAtlas;
uniform vec4 uA[${NP}], uB[${NP}], uC[${NP}], uD[${NP}];   // (D.x: how far the piece is turned toward the screen, signed: a turned-over piece shows its mirror image)
uniform float uN;
uniform vec2 uRes;
uniform vec3 uLamp;           // x, y on the screen, how bright
uniform vec3 uView;           // the centre of the picture on the screen (m), half its height (m)
uniform float uTime;
uniform vec4 uSea;            // where the pearl went into the water (x, y), how far the water has changed from there, the waterline
uniform vec2 uAtSize;         // the atlas, px
uniform vec4 uRod[10];        // the rods the players hold the figures by: where each meets its figure (x, y), how far behind the screen, on
uniform float uFlick;         // the oil lamp's flame, breathing
out vec4 o;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
void main(){
  vec2 frag = gl_FragCoord.xy;
  vec2 X = uView.xy + (frag - 0.5 * uRes) / uRes.y * 2.0 * uView.z;
  vec2 Lp = uLamp.xy;
  float lampR = 0.035;
  vec3 T = vec3(1.0);
  for (int i = 0; i < ${NP}; i++){
    if (float(i) >= uN) break;
    vec4 A = uA[i], B = uB[i], C = uC[i];
    float s = A.z;
    vec2 Y = Lp + (${D.toFixed(2)} - s) / ${D.toFixed(2)} * (X - Lp);
    vec2 q = rot(-B.x) * (Y - A.xy);
    float ys = uD[i].x;
    vec2 a = B.yz + vec2(q.x / A.w, -q.y / (abs(A.w) * ys));
    if (a.x < C.x || a.x > C.z || a.y < C.y || a.y > C.w) continue;
    float pen = lampR * s / ${D.toFixed(2)} / abs(A.w);
    vec3 tc = textureLod(uAtlas, vec2(a.x, uAtSize.y - a.y) / uAtSize, min(log2(max(pen, 0.7)) + max(0.0, -0.5 * log2(max(abs(ys), 0.05))), 3.2)).rgb;
    tc = pow(tc, vec3(0.80));                                      // (dyed hide lets the light through well)
    bool tile = B.w > 1.5;
    float ex = tile ? 1e3 : min(a.x - C.x, C.z - a.x);
    float edgeF = smoothstep(0.0, 3.0, min(ex, min(a.y - C.y, C.w - a.y)));
    T *= mix(vec3(1.0), tc, (tile ? 1.0 : B.w) * edgeF);
  }
  // the rods: thin bamboo, from each figure down and back to the hands below the screen; their shadows soften as they go
  for (int i = 0; i < 10; i++){
    vec4 R = uRod[i];
    if (R.w <= 0.0) continue;
    vec2 a0 = R.xy, a1 = vec2(R.x * 0.82 + 0.10 * sign(R.x), -1.25);
    vec2 ab = a1 - a0; float h = clamp(dot(X - a0, ab) / dot(ab, ab), 0.0, 1.0);
    float d = length(X - a0 - ab * h);
    float wdt = 0.0022 + 0.007 * h, soft = 0.0012 + 0.010 * h;
    T *= 1.0 - R.w * (0.42 - 0.22 * h) * smoothstep(wdt + soft, wdt - soft * 0.3, d) * step(1e-4, h);
  }
  // smoke from the lamp's chimney, drifting up between the lamp and the screen: soft moving shade
  vec2 sq = (X - Lp) * vec2(2.2, 1.4);
  float smk = vnoise(sq * 2.0 + vec2(0.3 * uTime, -0.55 * uTime)) * 0.6 + vnoise(sq * 4.3 + vec2(-0.2 * uTime, -0.9 * uTime)) * 0.4;
  float sMask = smoothstep(-0.05, 0.25, X.y - Lp.y) * exp(-abs(X.x - Lp.x - 0.15 * (X.y - Lp.y)) * 2.2) * exp(-max(X.y - Lp.y, 0.0) * 1.2);
  T *= 1.0 - 0.16 * smoothstep(0.45, 0.85, smk) * sMask;
  // the lamp's light on the screen; its hot spot is the pearl
  float r2 = dot(X - Lp, X - Lp), r = sqrt(r2);
  float E = pow(${(D * D).toFixed(3)} / (${(D * D).toFixed(3)} + r2), 2.0);
  // (and the troupe's own lamp, fixed, high in the middle: the screen is never dark where the play is)
  vec2 Fp = vec2(0.0, 0.25);
  E += 0.42 * pow(1.6 / (1.6 + dot(X - Fp, X - Fp)), 1.4);
  float flick = uFlick;
  vec3 lampC = vec3(1.0, 0.80, 0.52);
  float on = uLamp.z;
  vec3 c = lampC * E * 2.7 * T * on * flick;
  // the pearl: a hard bright core in the hot spot, and its halo (it shines through the hide too, a little)
  float core = smoothstep(0.034, 0.022, r);
  float halo = exp(-r / 0.05) * 0.9 + exp(-r / 0.16) * 0.35;
  c += vec3(1.0, 0.95, 0.82) * halo * 1.6 * mix(1.0, dot(T, vec3(0.33)), 0.5) * on;
  c += vec3(2.6, 2.3, 1.7) * core * on;
  // the paper of the screen
  float fib = vnoise(vec2(frag.x * 0.05 + frag.y * 0.01, frag.y * 0.6)) * 0.5 + vnoise(frag * 0.3) * 0.5;
  c *= 0.94 + 0.08 * fib;
  // outside the screen (only seen as the eye goes down): the dark of the stage
  float inside = step(abs(X.x), ${(SW / 2).toFixed(2)}) * step(abs(X.y), ${(SH / 2).toFixed(2)});
  c *= mix(0.15, 1.0, inside);
  float lum = dot(c, vec3(0.3, 0.55, 0.15));
  c = max(mix(vec3(lum), c, 1.32), 0.0);                       // dyed hide, lit from behind, is vivid
  c *= mix(vec3(1.0), vec3(0.95, 0.66, 0.42), smoothstep(0.5, 1.8, r));   // warmer and deeper away from the lamp
  // the cloth darkens toward its edges, where the lamp hardly reaches and the frame's shadow lies
  vec2 eg = abs(X) / vec2(${(SW / 2).toFixed(2)}, ${(SH / 2).toFixed(2)});
  c *= 1.0 - 0.45 * smoothstep(0.55, 1.0, max(eg.x, eg.y * 0.92)) - 0.15 * smoothstep(0.7, 1.0, eg.y);
  c = 1.0 - exp(-c * 1.1);
  c = pow(c, vec3(0.92));
  // below the waterline, near where the pearl went in, the water is no longer hide: it is the sea (alpha 0)
  float below = smoothstep(uSea.w + 0.004, uSea.w - 0.004, X.y);
  float reach = length((X - uSea.xy) * vec2(0.55, 1.0));
  float ragged = 0.05 * (vnoise(vec2(atan(X.y - uSea.y, X.x - uSea.x) * 4.0, uTime * 0.3)) - 0.5);
  float sea = below * smoothstep(uSea.z + 0.04, uSea.z - 0.04, reach + ragged);
  sea = max(sea, step(0.001, uSea.z) * smoothstep(-0.86, -0.92, X.y));
  o = vec4(c, 1.0 - sea);
}`;
const smooth = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);

W.stage = {
  ready: false, t: 0, vol: 1, fade: 1,
  lamp: [0, 0.75], light: 0,            // the light behind the screen, and how bright it burns
  view: [0, 0, SH / 2],                 // what of the screen is in the picture
  sea: [0, -0.755, 0, -0.755],
  WATER: -0.755,
  init() {
    const gl = YL.gl;
    this.p = YL.makeProgram('stage', VS, FS); YL.checkProgram(this.p);
    this.empty = gl.createVertexArray();
    // the pieces of carved hide (generated; see assets/prompts/pi_*, sh_*), laid on white in one atlas
    this.atlas = YL.assetTex('stage_atlas');
    this.A = new Float32Array(NP * 4); this.B = new Float32Array(NP * 4); this.C = new Float32Array(NP * 4); this.Dv = new Float32Array(NP * 4);
    this.reset();
    this.ready = true;
  },
  reset() {
    this.t = 0; this.light = 0; this.lamp = [0, 0.75];
    this.dragon = { p: [-2.4, 0.15], v: [1.2, 0], trail: [] };
    for (let i = 0; i < 300; i++) this.dragon.trail.push([-2.4 - i * 0.012, 0.15 + 0.10 * Math.sin(i * 0.05)]);
    this.drop = null; this.sea = [0, this.WATER, 0, this.WATER]; this.lampOverride = null; this.seaT = undefined; this.splash = undefined;
  },
  // ---- the way the dragon swims: in from off the left, then round a long figure of eight across the screen, again
  //      and again. Its head is on the way, every joint of its body is on the way behind it (so it bends exactly where
  //      the head bent), and the pearl is on the way a little ahead of the head: it always nearly has it.
  way() {
    if (this._way) return this._way;
    const pts = [];
    // (it keeps above the bank: the general rides beneath it, his plume reaching to about y 0.1; and its turns stay wide
    // enough for a body of eight joints: the lobes' ends bend at a radius of about 0.17)
    const f8 = (s) => [0.95 * Math.sin(s), 0.41 + 0.20 * Math.sin(2 * s)];
    // in from the left in one smooth curve, joining the figure of eight along its way: on the left lobe's lower side,
    // heading right and down toward the middle (no turning back on itself)
    const s0 = -Math.PI / 2 + 0.5, j = f8(s0), dj = [0.95 * Math.cos(s0), 0.40 * Math.cos(2 * s0)];
    const P0 = [-3.0, 0.56], T0 = [2.4, 0], kT = 2.4 / Math.hypot(dj[0], dj[1]), T1 = [dj[0] * kT, dj[1] * kT];
    for (let i = 0; i <= 60; i++) {
      const u = i / 60, h00 = 2 * u ** 3 - 3 * u * u + 1, h10 = u ** 3 - 2 * u * u + u, h01 = -2 * u ** 3 + 3 * u * u, h11 = u ** 3 - u * u;
      pts.push([h00 * P0[0] + h10 * T0[0] + h01 * j[0] + h11 * T1[0], h00 * P0[1] + h10 * T0[1] + h01 * j[1] + h11 * T1[1]]);
    }
    for (let i = 1; i <= 2400; i++) pts.push(f8(s0 + i * 0.01));
    const d = [0]; for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return (this._way = { pts, d });
  },
  wayAt(s) {
    const W = this.way(); s = Math.max(0, Math.min(s, W.d[W.d.length - 1]));
    let lo = 0, hi = W.d.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (W.d[m] < s) lo = m; else hi = m; }
    const f = (s - W.d[lo]) / Math.max(W.d[hi] - W.d[lo], 1e-6);
    return [W.pts[lo][0] + (W.pts[hi][0] - W.pts[lo][0]) * f, W.pts[lo][1] + (W.pts[hi][1] - W.pts[lo][1]) * f];
  },
  pearlAt(t) {
    const enter = this.enterAt || [0.0, 0.70];
    let p = this.wayAt(this.dS(t) + 0.55);
    const k = smooth(0.4, 3.0, t);
    p = [enter[0] + (p[0] - enter[0]) * k, enter[1] + (p[1] - enter[1]) * k];
    if (this.drop) {
      // (it carries on a little the way it was going, then sinks: no stop where the fall begins)
      const u = t - this.drop.t0, a = this.drop.p0, v = this.drop.v0 || [0, 0], c = (1 - Math.exp(-1.8 * u)) / 1.8;
      p = [a[0] + v[0] * c + 0.10 * Math.sin(u * 2.0) * Math.min(u, 1), a[1] + v[1] * c - 0.25 * u * u - 0.15 * u];
    }
    return p;
  },
  // the head's distance along the way at t: in fast from the left, then at a swimming pace
  dS(t) { const t0 = 0.8; if (t < t0) return 0; const a = t - t0; return 1.6 * a - 0.95 * Math.max(0, a - 1.6) + 0.04 * Math.sin(a * 1.7); },
  startDrop() {
    const t = this.t, p0 = this.pearlAt(t), p1 = this.pearlAt(t - 0.05);
    this.drop = { t0: t, p0, v0: [(p0[0] - p1[0]) / 0.05, (p0[1] - p1[1]) / 0.05] };
  },
  // what the eye sees of the screen: all of it as the stage is reached; it leans in to the play, after the pearl (the
  // lamp: where it is, the screen is lit); back out as the pearl falls
  viewAt(t) {
    const full = this.FULL || SH / 2, k = smooth(2.8, 6.0, t) * (1 - smooth(7.4, 9.3, t));
    const px = this.wayAt(this.dS(t) + 0.55)[0];
    return [0.40 * k * px, 0.07 * k, full * (1 - 0.17 * k)];
  },
  pieces() {
    const out = [], t = this.t, AT = YL.STAGE_ATLAS;
    this.rods = [];
    if (!AT) return out;
    // name, the pivot on the screen (m), how far behind the screen (m), metres per atlas pixel, turn, the pivot in the piece
    // (fractions of its width and height, from its top left), mirrored, how dense the hide
    const put = (name, x, y, s, mpp, ang, pu, pv, flip = 1, dens = 1, ys = 1) => {
      const P = AT[name]; if (!P) return;
      const [ax, ay] = P.at;
      out.push([x, y, s, mpp * flip, ang, ax + pu * P.w, ay + pv * P.h, dens, ax, ay, ax + P.w, ay + P.h, ys]);
    };
    // where a point of a piece is on the screen, once placed
    const at = (name, x, y, mpp, ang, pu, pv, u, v, flip = 1) => {
      const P = AT[name], dx = (u - pu) * P.w * mpp * flip, dy = -(v - pv) * P.h * mpp, c = Math.cos(ang), s_ = Math.sin(ang);
      return [x + c * dx - s_ * dy, y + s_ * dx + c * dy];
    };
    const rod = (x, y, s, k = 1) => this.rods.push([x, y, s, k]);
    // ---- far: the mountains (big and soft: they are held well back from the screen), clouds drifting
    put('mountains', -0.75, -0.42, 0.30, 0.0015, 0, 0.5, 1.0, 1, 0.42);
    put('mountains', 1.05, -0.44, 0.32, 0.0014, 0, 0.5, 1.0, -1, 0.36);
    put('clouds', -0.80 + 0.018 * t, 0.66, 0.05, 0.00085, 0, 0.5, 0.5, 1, 0.85);
    put('clouds', 0.95 + 0.012 * t, 0.74, 0.06, 0.00070, 0, 0.5, 0.5, -1, 0.80);
    put('pagoda', -0.55, -0.40, 0.10, 0.00060, 0, 0.5, 1.0, 1, 0.62);
    // ---- the far bank: the city wall and its gate on the left, the bridge on the right, trees; the bank between
    for (let i = -1; i <= 1; i++) put('bank', i * 1536 * 0.00072, -0.535, 0.012, 0.00072, 0, 0.5, 0.31, 1, 2);
    put('wall', -1.22, -0.50, 0.025, 0.00068, 0, 0.5, 1.0, 1, 1);
    put('bridge', 1.20, -0.50, 0.02, 0.00062, 0, 0.5, 1.0, 1, 1);
    put('willow', 1.62, -0.50, 0.03, 0.00070, 0.03 * Math.sin(t * 0.9 + 1.0), 0.5, 1.0, -1, 0.9);
    // ---- the general rides out of the gate, along the bank and over the bridge: the legs swing on their rivets, the
    // horse rocks, the rider rises and falls in the saddle and levels his spear
    {
      const hx = -1.22 + 0.36 * Math.max(0, t - 2.0);
      if (hx < 2.4) {
        const m = 0.00062, g = t * 8.0 * (t > 2.2 ? 1 : 0.4), rock = 0.045 * Math.sin(g), bob = 0.008 * Math.sin(2 * g + 0.5);
        const bridge = 0.095 * Math.max(0, 1 - Math.pow((hx - 1.20) / 0.36, 2));
        const ground = -0.535 + 0.012 + bridge, legLen = 360 * 0.925 * m;
        const by = ground + legLen + (0.26 * 556) * m * 0.0 + bob;
        // the body's pivot: the middle of its belly line
        const B = (u, v) => at('horse', hx, by, m, rock, 0.55, 0.75, u, v);
        const hind = B(0.36, 0.76), fore = B(0.80, 0.74);
        put('hleg', hind[0], hind[1], 0.016, m, 0.42 * Math.sin(g + 2.4), 0.33, 0.075);
        put('fleg', fore[0], fore[1], 0.016, m, 0.50 * Math.sin(g - 0.6), 0.5, 0.075);
        put('horse', hx, by, 0.014, m, rock, 0.55, 0.75);
        put('hleg', hind[0] + 0.006, hind[1], 0.012, m, 0.42 * Math.sin(g + 1.5), 0.33, 0.075);
        put('fleg', fore[0] - 0.006, fore[1], 0.012, m, 0.50 * Math.sin(g + 0.4), 0.5, 0.075);
        // the general: in the saddle; his leg hangs at his hip, his arm at his shoulder
        const gm = m * 0.92, seat = B(0.47, 0.30), sway = -0.5 * rock + 0.03 * Math.sin(g * 0.5);
        const gy = seat[1] + 0.012 * Math.sin(2 * g + 1.6);
        const G = (u, v) => at('gbody', seat[0], gy, gm, sway, 0.83, 0.78, u, v);
        const hip = G(0.83, 0.78), sh = G(0.74, 0.47);
        put('gbody', seat[0], gy, 0.010, gm, sway, 0.83, 0.78);
        put('gleg', hip[0], hip[1], 0.008, gm, 0.25 + 0.10 * Math.sin(g), 0.125, 0.073);
        const level = smooth(5.0, 6.0, t) * (1 - smooth(7.4, 8.2, t));
        put('garm', sh[0], sh[1], 0.006, gm, -0.25 - 0.55 * level + 0.06 * Math.sin(g), 0.06, 0.61);
        rod(B(0.55, 0.45)[0], B(0.55, 0.45)[1], 0.02); rod(sh[0] + 0.03, sh[1] - 0.02, 0.01, 0.8);
      }
    }
    // ---- a soldier runs the other way along the bank, his banner streaming
    {
      const rx = 1.85 - 0.30 * Math.max(0, t - 1.6);
      if (rx > -2.0) {
        const g = t * 7.0, bob = 0.010 * Math.abs(Math.sin(g)), rk = 0.05 * Math.sin(g);
        const onB = 0.095 * Math.max(0, 1 - Math.pow((rx - 1.20) / 0.36, 2));
        const ry = -0.535 + 0.012 + onB + bob;
        put('runner', rx, ry, 0.012, 0.00056, rk, 0.62, 0.98, -1);
        const nk = at('runner', rx, ry, 0.00056, rk, 0.62, 0.98, 0.80, 0.30, -1); rod(nk[0], nk[1], 0.015);
      }
    }
    // ---- the cranes: high across, right to left, their wings beating about the root
    for (let k = 0; k < 2; k++) {
      const x = 2.0 - 0.32 * (t - 1.2 - k * 1.3), y = 0.635 + 0.045 * k + 0.02 * Math.sin(t * 0.9 + k);      // (up among the clouds, over the dragon's way)
      if (x < -2.2 || x > 2.2) continue;
      const g = t * 4.4 + k * 1.7, m = 0.00046;
      const root = at('crane', x, y, m, 0.04 * Math.sin(g - 1.0), 0.5, 0.5, 0.36, 0.30, -1);
      put('crane', x, y, 0.03, m, 0.04 * Math.sin(g - 1.0), 0.5, 0.5, -1, 1);
      put('cwing', root[0], root[1], 0.028, m, 0.65 * Math.sin(g) - 0.15, 0.93, 0.80, -1, 0.95);
    }
    // ---- the dragon: head, eight joints (two of them with claws) and the tail, all on its way behind one another.
    // As in a dragon dance, a wave runs down it from the head to the tail (the poles lifted one after another), across
    // its way; the head keeps to the way, after the pearl. Where the way turns back on itself the hide is turned over (the
    // player rolls the rod: its shadow narrows to the edge and opens again, mirrored) so the crest stays on top.
    {
      const m = 0.00040, segL = 0.92 * 560 * m, sH = this.dS(t);
      const tan = (s) => { const a = this.wayAt(s - 0.02), b = this.wayAt(s + 0.02), l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
      const joints = [], roll = [];
      for (let i = 0; i <= 10; i++) {
        const d = 0.04 + i * segL, s = sH - d, p = this.wayAt(s), tg = tan(s);
        const w = 0.062 * smooth(0.05, 0.45, d) * Math.sin(2.6 * t - 5.4 * d);
        joints.push([p[0] - tg[1] * w, p[1] + tg[0] * w]);
        // (it narrows as it turns, but never to a line: a piece seen nearly edge-on would leave a gap in the body; it
        // turns over in the last few degrees, while it is narrow)
        const r = Math.max(-1, Math.min(1, tg[0] / 0.45)); roll.push((r < 0 ? -1 : 1) * Math.max(0.42, Math.pow(Math.abs(r), 0.7)));
      }
      const ang = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);
      const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
      const hp = this.wayAt(sH + 0.08);
      // (a piece turned over is mirrored about its long axis: the same pivot, its far side up)
      const putR = (name, p, mpp, a, pu, pv, flip, dens, r) => put(name, p[0], p[1], 0.012, mpp, a, pu, pv, flip, dens, r);
      // (the pieces face right: each body piece runs from the joint behind it to the joint ahead, its front at the front)
      for (let i = 7; i >= 0; i--) {
        const a = ang(joints[i + 1], joints[i]);
        const claw = i === 1 || i === 5;
        const rr = roll[i] * roll[i + 1] > 0 ? 0.5 * (roll[i] + roll[i + 1]) : roll[i];
        putR(claw ? 'dclaw' : 'dbody', joints[i], m, a, 0.96, claw ? 0.36 : 0.55, 1, 1, rr);
      }
      // (the tail's fins flare out behind: the piece is mirrored end to end, its root at the last joint)
      putR('dtail', joints[8], m, ang(joints[9], joints[8]), 0.03, 0.60, -1, 1, roll[8]);
      const a1 = ang(joints[1], joints[0]), aH = ang(joints[0], hp);
      putR('dhead', joints[0], m * 1.1, aH + 0.15 * wrap(a1 - aH), 0.06, 0.78, 1, 1, roll[0]);
      rod(joints[0][0], joints[0][1], 0.02); rod(joints[5][0], joints[5][1], 0.02);
    }
    // ---- on the water: the fisherman's boat, rocking; a carp leaps beside it
    {
      const bx = -0.30 + 0.018 * t, by = -0.735 + 0.012 * Math.sin(t * 1.3), ba = 0.045 * Math.sin(t * 1.2);
      put('boat', bx, by, 0.010, 0.00070, ba, 0.5, 0.95);
      const deck = at('boat', bx, by, 0.00070, ba, 0.5, 0.95, 0.30, 0.62);
      const pull = smooth(5.0, 5.4, t) * (1 - smooth(6.4, 7.4, t));
      put('fisher', deck[0], deck[1], 0.008, 0.00050, ba - 0.12 * pull + 0.02 * Math.sin(t * 0.8), 0.55, 0.97);
      rod(deck[0] - 0.02, deck[1] + 0.12, 0.012, 0.8);
    }
    const cj = t - 5.0;
    if (cj > 0 && cj < 1.7) {
      const u = cj / 1.7, x = 0.30 + 0.55 * u, y = -0.80 + 1.5 * u * (1 - u) * 0.55, a = 0.95 - 1.9 * u;
      const tj = at('carp', x, y, 0.00052, a, 0.55, 0.5, 0.03, 0.52);
      put('ctail', tj[0], tj[1], 0.01, 0.00052, a + 0.35 * Math.sin(t * 10), 0.93, 0.47);
      put('carp', x, y, 0.01, 0.00052, a, 0.55, 0.5);
    }
    put('lotus', -1.38, -0.70, 0.01, 0.00060, 0.02 * Math.sin(t * 0.8), 0.5, 1.0);
    // ---- the waves along the bottom: one band, tiling; it heaves
    const P = AT.waves, wm = 0.00068, wp = P.w * wm, wx = 0.06 * Math.sin(t * 0.5) + 0.03 * t;
    for (let i = -2; i <= 2; i++) put('waves', i * wp + (wx % wp), -0.775 + 0.010 * Math.sin(t * 1.2), 0.0, wm, 0, 0.5, 0.42, 1, 2);
    return out;
  },
  update(dt) {
    this.t += dt;
    const t = this.t;
    if (YL.QS.get('world') === 'stage') { this.light = smooth(0, 0.8, t); if (YL.QS.get('drop') && !this.drop && t > +YL.QS.get('drop')) this.startDrop(); }
    this.lamp = this.lampOverride || this.pearlAt(t);
    if (!this.lampOverride) this.lamp = [this.lamp[0] + 0.004 * Math.sin(t * 9.1) * Math.sin(t * 3.3), this.lamp[1] + 0.005 * Math.sin(t * 7.7 + 1.0)];
    this.headSNow = this.dS(t);
    // the water changes, from where the pearl went in
    if (this.drop) {
      const pe = this.lamp;
      if (this.seaT === undefined && pe[1] < this.WATER + 0.02) { this.sea[0] = pe[0]; this.sea[1] = this.WATER; this.seaT = t; this.splash = t; }
      if (this.seaT !== undefined) this.sea[2] = 4.0 * smooth(0, 1.4, t - this.seaT) + 0.12 * smooth(0, 0.15, t - this.seaT);
    }
    this.sound(dt);
  },
  render(target, aspect) {
    const gl = YL.gl, U = YL.U, p = this.p;
    const w = target ? target.w : gl.drawingBufferWidth, h = target ? target.h : gl.drawingBufferHeight;
    const ps = this.pieces();
    this.A.fill(0); this.B.fill(0); this.C.fill(0); this.Dv.fill(0);
    if (ps.length > NP && !this._warned) { this._warned = true; console.log('stage: ' + ps.length + ' pieces, room for ' + NP); }
    ps.slice(0, NP).forEach((q, i) => { this.A.set([q[0], q[1], q[2], q[3]], i * 4); this.B.set([q[4], q[5], q[6], q[7]], i * 4); this.C.set([q[8], q[9], q[10], q[11]], i * 4); this.Dv[i * 4] = q[12]; });
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null); gl.viewport(0, 0, w, h);
    gl.useProgram(p.p);
    U(p, 'uRes', [w, h]); U(p, 'uTime', this.t);
    U(p, 'uA', this.A); U(p, 'uB', this.B); U(p, 'uC', this.C); U(p, 'uD', this.Dv); U(p, 'uN', Math.min(ps.length, NP));
    U(p, 'uLamp', [this.lamp[0], this.lamp[1], this.light]);
    U(p, 'uView', this.view);
    U(p, 'uSea', this.sea);
    const sz = (YL.ASSET_SIZE && YL.ASSET_SIZE.stage_atlas) || [4096, 4096];
    U(p, 'uAtSize', sz);
    const R = new Float32Array(40); (this.rods || []).slice(0, 10).forEach((r, i) => R.set(r, i * 4));
    gl.uniform4fv(p.u.uRod, R);
    // an oil lamp: it breathes, and now and then gutters
    const t = this.t, n1 = Math.sin(t * 11.0) * Math.sin(t * 7.3), n2 = Math.sin(t * 2.9 + Math.sin(t * 1.7) * 2.0);
    U(p, 'uFlick', 1.0 + 0.045 * n1 + 0.035 * n2 - 0.06 * Math.pow(Math.max(0, Math.sin(t * 0.83 + 1.0)), 24));
    YL.bindTex(p, 'uAtlas', this.atlas || (this.atlas = YL.assetTex('stage_atlas')), 0);
    gl.bindVertexArray(this.empty); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null);
  },
  // where a point of the screen (m) lands in the picture (ndc)
  toNdc(X, aspect) { return [(X[0] - this.view[0]) / (this.view[2] * aspect), (X[1] - this.view[1]) / this.view[2]]; },
  /* ---- sound: the troupe behind the screen. A gong as the lamp catches; a bowed string; a drum roll and cymbal as
     the dragon comes; the clappers; a splash as the pearl goes into the waves */
  buildAudio(b) {
    const { ctx, out, noiseBuffer } = b;
    const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(out);
    this.snd = { ctx, bus, pink: noiseBuffer(6.1, 'pink'), next: 0.5, ev: {}, step: -1 };
  },
  crackle() {
    const S = this.snd, ctx = S.ctx, t0 = ctx.currentTime + 0.01, sr = ctx.sampleRate;
    const n = Math.floor(sr * 0.03), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.003));
    const s = ctx.createBufferSource(); s.buffer = b;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1800;
    const g = ctx.createGain(); g.gain.value = 0.04 + 0.05 * Math.random();
    s.connect(f); f.connect(g); g.connect(S.bus); s.start(t0);
  },
  strike(t0, parts, a, pan = 0) {
    const S = this.snd, ctx = S.ctx, p = ctx.createStereoPanner(); p.pan.value = pan; p.connect(S.bus);
    for (const [f, amp, dec, f1] of parts) {
      const o = ctx.createOscillator(); o.frequency.setValueAtTime(f * (f1 || 1), t0); if (f1) o.frequency.exponentialRampToValueAtTime(f, t0 + 0.08);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(a * amp, t0 + 0.003); g.gain.setTargetAtTime(0, t0 + 0.004, dec);
      o.connect(g); g.connect(p); o.start(t0); o.stop(t0 + dec * 8 + 0.1);
    }
  },
  hiss(t0, type, f, q, a, att, dec, pan = 0) {
    const S = this.snd, ctx = S.ctx, s = ctx.createBufferSource(); s.buffer = S.pink;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(a, t0 + att); g.gain.setTargetAtTime(0, t0 + att, dec);
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    s.connect(fl); fl.connect(g); g.connect(p); p.connect(S.bus); s.start(t0, Math.random() * 4); s.stop(t0 + att + dec * 7);
  },
  clapper(t0, a, hi, pan) { this.strike(t0, [[hi ? 1180 : 940, 1, 0.025], [hi ? 3150 : 2600, 0.35, 0.012]], a, pan); this.hiss(t0, 'bandpass', 2400, 2, a * 0.5, 0.002, 0.01, pan); },
  gong(t0, a) { this.strike(t0, [[110, 1, 1.6, 1.03], [167, 0.6, 1.2], [231, 0.35, 0.9], [298, 0.2, 0.7], [413, 0.1, 0.5]], a); this.hiss(t0, 'highpass', 3000, 0.7, a * 0.3, 0.005, 0.4); },
  phrase() {
    const S = this.snd, ctx = S.ctx; let t = ctx.currentTime + 0.05;
    const notes = [392, 440, 523.25, 587.33, 659.25], seq = [2, 3, 4, 3, 1, 2];
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    const vib = ctx.createOscillator(); vib.frequency.value = 5.2; const vg = ctx.createGain(); vg.gain.value = 5; vib.connect(vg); vg.connect(o.frequency);
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 1100; f1.Q.value = 1.4;
    const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 2600;
    const g = ctx.createGain(); g.gain.value = 0;
    o.connect(f1); f1.connect(f2); f2.connect(g); g.connect(S.bus);
    o.frequency.setValueAtTime(notes[seq[0]], t);
    let tt = t;
    seq.forEach((k, i) => { const d = i === seq.length - 1 ? 1.8 : 0.45 + 0.2 * (i % 2); o.frequency.setTargetAtTime(notes[k], tt, 0.05); g.gain.setTargetAtTime(0.026, tt, 0.08); g.gain.setTargetAtTime(0.016, tt + d * 0.6, 0.1); tt += d; });
    g.gain.setTargetAtTime(0, tt, 0.4);
    o.start(t); vib.start(t); o.stop(tt + 2); vib.stop(tt + 2);
  },
  splashSound() {
    const now = this.snd.ctx.currentTime + 0.01;
    this.hiss(now, 'bandpass', 1400, 0.7, 0.06, 0.01, 0.25, 0.2);
    this.hiss(now + 0.05, 'lowpass', 600, 0.5, 0.05, 0.02, 0.35, 0.1);
    this.strike(now + 0.02, [[320, 1, 0.08, 1.8]], 0.05, 0.2);
  },
  sound(dt) {
    if (!this.snd) { const b = YL.AUDIO.bus && YL.AUDIO.bus(); if (b) this.buildAudio(b); else return; }
    const S = this.snd, ctx = S.ctx, now = ctx.currentTime, t = this.t, E = S.ev;
    const once = (k, cond, fn) => { if (cond && !E[k]) { E[k] = 1; fn(); } };
    S.bus.gain.setTargetAtTime(this.fade * (this.vol ?? 1), now, 0.3);
    if (this.light > 0.2 && (S.next -= dt) <= 0) { this.crackle(); S.next = Math.random() < 0.4 ? 0.08 + Math.random() * 0.2 : 0.8 + Math.random() * 2.5; }
    once('gong', this.light > 0.5, () => this.gong(now + 0.02, 0.05));
    once('erhu', t > 2.4, () => this.phrase());
    once('dragon', t > 1.2, () => {
      this.hiss(now + 0.02, 'highpass', 5200, 0.7, 0.04, 0.9, 0.5, -0.4);
      for (let i = 0; i < 14; i++) this.strike(now + 0.02 + 1.3 * Math.pow(i / 14, 0.8), [[92, 1, 0.09, 1.4]], 0.045 * (0.35 + 0.65 * i / 14), -0.3);
      this.strike(now + 1.36, [[80, 1, 0.3, 1.5], [180, 0.3, 0.1]], 0.09, -0.2);
    });
    // the clappers keep time while it plays
    const step = Math.floor(t * 2.2);
    if (step !== S.step && t > 3 && !this.drop) { this.clapper(now + 0.01, step % 2 ? 0.016 : 0.026, step % 2, 0.3); S.step = step; }
    once('splash', this.splash !== undefined, () => this.splashSound());
  },
};
})();
