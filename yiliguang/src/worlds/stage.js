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
uniform vec4 uA[${NP}], uB[${NP}], uC[${NP}];
uniform float uN;
uniform vec2 uRes;
uniform vec3 uLamp;           // x, y on the screen, how bright
uniform vec3 uView;           // the centre of the picture on the screen (m), half its height (m)
uniform float uTime;
uniform vec4 uSea;            // where the pearl went into the water (x, y), how far the water has changed from there, the waterline
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
    vec2 a = B.yz + vec2(q.x / A.w, -q.y / abs(A.w));
    if (a.x < C.x || a.x > C.z || a.y < C.y || a.y > C.w) continue;
    float pen = lampR * s / ${D.toFixed(2)} / abs(A.w);
    vec3 tc = textureLod(uAtlas, a / vec2(4096.0, 2048.0), log2(max(pen, 0.7))).rgb;
    bool tile = B.w > 1.5;
    float ex = tile ? 1e3 : min(a.x - C.x, C.z - a.x);
    float edgeF = smoothstep(0.0, 24.0, min(ex, min(a.y - C.y, C.w - a.y)));
    T *= mix(vec3(1.0), tc, (tile ? 1.0 : B.w) * edgeF);
  }
  // the lamp's light on the screen; its hot spot is the pearl
  float r2 = dot(X - Lp, X - Lp), r = sqrt(r2);
  float E = pow(${(D * D).toFixed(3)} / (${(D * D).toFixed(3)} + r2), 1.6);
  float flick = 1.0 + 0.04 * sin(uTime * 11.0) * sin(uTime * 7.3);
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
  c = max(mix(vec3(lum), c, 1.22), 0.0);                       // dyed hide, lit from behind, is vivid
  c *= mix(vec3(1.0), vec3(1.0, 0.86, 0.70), smoothstep(0.6, 1.7, r));   // warmer and deeper away from the lamp
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
    const cv = document.createElement('canvas'); cv.width = 4096; cv.height = 2048;
    YL.PUPPETS.draw(cv.getContext('2d'));
    this.atlas = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.A = new Float32Array(NP * 4); this.B = new Float32Array(NP * 4); this.C = new Float32Array(NP * 4);
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
    for (let i = 0; i <= 40; i++) { const u = i / 40; pts.push([-3.0 + 2.2 * u, 0.42 - 0.18 * u + 0.05 * Math.sin(u * 3.0)]); }
    const f8 = (s) => [1.02 * Math.sin(s), 0.20 + 0.23 * Math.sin(2 * s)];
    // join the figure of eight where it is heading right along its left side, s = -pi/2 … going up the lobe
    const s0 = -Math.PI * 0.62;
    const j = f8(s0), last = pts[pts.length - 1];
    for (let i = 1; i <= 20; i++) { const u = i / 20, e = u * u * (3 - 2 * u); pts.push([last[0] + (j[0] - last[0]) * e, last[1] + (j[1] - last[1]) * e]); }
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
      const u = t - this.drop.t0, a = this.drop.p0;
      p = [a[0] + 0.10 * Math.sin(u * 2.0) * Math.min(u, 1), a[1] - 0.25 * u * u - 0.15 * u];
    }
    return p;
  },
  // the head's distance along the way at t: in fast from the left, then at a swimming pace
  dS(t) { const t0 = 0.8; if (t < t0) return 0; const a = t - t0; return 1.6 * a - 0.95 * Math.max(0, a - 1.6) + 0.04 * Math.sin(a * 1.7); },
  startDrop() { this.drop = { t0: this.t, p0: this.pearlAt(this.t) }; },
  pieces() {
    const out = [], t = this.t, P = YL.PUPPETS, CELLS = P.CELLS, PART = P.PART;
    const rectOf = (name) => {
      if (PART[name]) { const [x0, y0, x1, y1, base] = PART[name]; const [cx, cy] = CELLS[base || name]; return [cx * 512 + x0 * 0.512, cy * 512 + y0 * 0.512, cx * 512 + x1 * 0.512, cy * 512 + y1 * 0.512]; }
      const [cx, cy, wd = 1] = CELLS[name]; return [cx * 512, cy * 512, (cx + wd) * 512, (cy + 1) * 512];
    };
    const origin = (name) => { const base = PART[name] ? (PART[name][4] || name) : name; const [cx, cy] = CELLS[base]; return [cx * 512, cy * 512]; };
    const put = (name, x, y, s, mpp, ang, px, py, flip = 1, dens = 1) => {
      const [ox, oy] = origin(name);
      out.push([x, y, s, mpp * flip, ang, ox + px * 0.512, oy + py * 0.512, dens, ...rectOf(name)]);
    };
    // far mountains, soft
    put('mountains', -0.62, -0.06, 0.28, 0.0017, 0, 1000, 560, 1, 0.40);
    put('mountains', 1.05, -0.08, 0.26, 0.0017, 0, 1000, 560, -1, 0.38);
    // clouds drifting across the top
    put('clouds', -0.75 + 0.02 * t, 0.66, 0.03, 0.00095, 0, 1000, 500, 1, 0.9);
    put('clouds', 1.05 + 0.015 * t, 0.70, 0.04, 0.00095, 0, 1000, 500, -1, 0.9);
    // a stone bridge over the water on the right, its far end lost behind the mountains' foot
    put('bridge', 0.95, -0.50, 0.04, 0.00080, 0, 1000, 700, 1, 0.95);
    // reeds and a lotus at the water's edge, close to the screen
    put('reeds', -1.35, -0.62, 0.01, 0.00070, 0.03 * Math.sin(t * 0.9), 500, 990, 1, 1);
    put('lotus', 1.42, -0.58, 0.01, 0.00062, 0, 500, 760, 1, 1);
    // the pagoda on its hill and a willow
    put('pagoda', -1.22, -0.18, 0.05, 0.0011, 0, 500, 1000, 1, 1);
    put('willow', -0.92, -0.42, 0.02, 0.0010, 0.02 * Math.sin(t * 0.8), 500, 1000, 1, 1);
    // the dragon: head, eight joints and the tail, all on its way behind one another
    const mpp = 0.00085, segL = 480 * 0.512 * mpp, sH = this.dS(t);
    const joints = []; for (let i = 0; i <= 9; i++) joints.push(this.wayAt(sH - 0.05 - i * segL));
    const ang = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);
    const hp = this.wayAt(sH + 0.08);
    put('dhead', joints[0][0], joints[0][1], 0.012, mpp, ang(joints[0], hp) + 0.18, 230, 530);
    for (let i = 0; i < 8; i++) put('dbody', joints[i][0], joints[i][1], 0.012, mpp, ang(joints[i], joints[i + 1]) + Math.PI, 900, 530);
    put('dtail', joints[8][0], joints[8][1], 0.012, mpp, ang(joints[8], joints[9]), 100, 530);
    // two cranes crossing high up, right to left, their wings beating
    for (let k = 0; k < 2; k++) {
      const x = 2.1 - 0.30 * (t - 1.5 - k * 1.1), y = 0.52 + 0.05 * k + 0.02 * Math.sin(t * 0.9 + k);
      if (x < -2.1 || x > 2.1) continue;
      const g = t * 4.2 + k * 1.7;
      put('cwing', x + 0.004, y, 0.03, 0.00062, -0.9 + 0.7 * Math.sin(g - 0.5), 500, 500, -1, 0.8);
      put('crane', x, y, 0.03, 0.00062, 0.04 * Math.sin(g - 1.0), 540, 500, -1, 1);
      put('cwing', x, y, 0.03, 0.00062, -0.9 + 0.7 * Math.sin(g), 500, 500, -1, 1);
    }
    // a carp leaping, now and then; a boat on the waves
    const cj = (t - 5.2);
    if (cj > 0 && cj < 1.6) {
      const u = cj / 1.6, x = 0.85 + 0.45 * u, y = -0.78 + 1.6 * u * (1 - u) * 0.55;
      put('carp', x, y, 0.01, 0.00075, 0.9 - 1.8 * u, 500, 500, 1, 1);
      put('tail', x - 0.12 * Math.cos(0.9 - 1.8 * u), y - 0.12 * Math.sin(0.9 - 1.8 * u), 0.01, 0.00075, 0.9 - 1.8 * u + 0.3 * Math.sin(t * 9), 500, 500, 1, 1);
    }
    put('boat', -0.25 + 0.02 * t, -0.62 + 0.015 * Math.sin(t * 1.3), 0.008, 0.00085, 0.05 * Math.sin(t * 1.2), 500, 600, 1, 1);
    // the waves along the bottom: one band, tiling; it heaves
    const wp = 1000 * 0.512 * 0.00110, wx = 0.06 * Math.sin(t * 0.5);
    for (let i = -3; i <= 3; i++) put('waves', i * wp + wx, -0.80 + 0.010 * Math.sin(t * 1.2), 0.0, 0.00110, 0, 500, 760, 1, 2);
    return out;
  },
  update(dt) {
    this.t += dt;
    const t = this.t;
    if (YL.QS.get('world') === 'stage') { this.light = smooth(0, 0.8, t); if (YL.QS.get('drop') && !this.drop && t > +YL.QS.get('drop')) this.startDrop(); }
    this.lamp = this.lampOverride || this.pearlAt(t);
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
    this.A.fill(0); this.B.fill(0); this.C.fill(0);
    ps.slice(0, NP).forEach((q, i) => { this.A.set([q[0], q[1], q[2], q[3]], i * 4); this.B.set([q[4], q[5], q[6], q[7]], i * 4); this.C.set([q[8], q[9], q[10], q[11]], i * 4); });
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null); gl.viewport(0, 0, w, h);
    gl.useProgram(p.p);
    U(p, 'uRes', [w, h]); U(p, 'uTime', this.t);
    U(p, 'uA', this.A); U(p, 'uB', this.B); U(p, 'uC', this.C); U(p, 'uN', Math.min(ps.length, NP));
    U(p, 'uLamp', [this.lamp[0], this.lamp[1], this.light]);
    U(p, 'uView', this.view);
    U(p, 'uSea', this.sea);
    YL.bindTex(p, 'uAtlas', this.atlas, 0);
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
