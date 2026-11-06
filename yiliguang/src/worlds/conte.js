/* ============================================================================
   世界 · 孔特笔·雨夜（修拉那样的炭精笔素描）
   ----------------------------------------------------------------------------
   光从窗上那颗雨滴钻出来，落进窗外的街——这条街是用黑色孔特笔画在粗纹纸上的：没有一根轮廓线，
   只有炭粉挂在纸的颗粒上，越密越黑；亮的地方就是纸本身。
   · 镜头沿着湿漉漉的街往下走，一直走到河岸：街、路灯、打伞的两个人、湿石板路上的倒影，然后是石桥、河、
     河岸上撑阳伞的女人、坐着的男人和小狗，近处一棵大树从镜头前掠过（几层图，远近不同，所以有视差）。
   · 雨一直在下（纸上擦出来的细白线），水洼里一圈圈涟漪，倒影在晃，河上的雾慢慢流；楼上那扇亮着的窗里，
     有人影走过。
   · 光在这里就是纸的白：它到哪里，哪里的炭粉就退开。最后它越来越亮，把整张画擦成一张白纸——夏天从白里出来。
   画法：街和河是一张生成的长图，路灯、人、树是单独的透明图层（见 assets/prompts/）；它们先合成一张「浓淡图」，
   然后统一用纸的纹理重新上「炭」——纸的颗粒固定在画面上不动，画在上面移动，所以整张画像是一直在同一张纸上重画，
   而不是几张图在滑。
   ========================================================================== */
(() => {
'use strict';
const YL = window.YL;
const W = (YL.worlds = YL.worlds || {});
const N_SPR = 6;
const FS = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime, uBuild, uWhite, uFade, uAspect;
uniform vec3 uCam;                 // where the eye is on the long drawing (u along it, v up it) and how close
uniform sampler2D uPano, uPaper, uS0, uS1, uS2, uS3, uS4, uS5;
uniform vec4 uRect[${N_SPR}];      // each cut-out: x0, y0, w, h on the screen (screen-height units, origin at the centre)
uniform vec4 uMod[${N_SPR}];       // its sway (the top moves, the foot stays), how much paler (haze), on, -
uniform vec4 uHero;                // the light: x, y, how bright, how big
uniform vec4 uLamp;                // the gas lamp's head x, y, its brightness, the street under it (y)
uniform vec4 uWin;                 // the lit window x, y, brightness, a shadow crossing it (-1 … 1)
out vec4 o;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s / 0.9375; }
float sat(float x){ return clamp(x, 0.0, 1.0); }
// one cut-out layer: how dark it is at p, and how much of it is there (alpha)
float sprite(sampler2D s, vec4 r, vec4 m, vec2 p, out float a){
  a = 0.0;
  if (m.z <= 0.0) return 0.0;
  vec2 q = (p - r.xy) / r.zw;
  q.x -= m.x * q.y * q.y;
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) return 0.0;
  vec4 c = textureLod(s, q, 0.7);
  a = c.a * m.z;
  return sat((1.0 - dot(c.rgb, vec3(0.333)) - 0.08) * 1.25) * (1.0 - m.y);
}
void main(){
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;           // the screen, in screen heights, origin at the centre
  float t = uTime;
  // ---- the long drawing: where on it this pixel looks, its reflections trembling below the horizon
  vec2 pu = vec2(uCam.x + p.x / uCam.z, uCam.y + p.y / uCam.z);
  float wet = smoothstep(0.47, 0.36, pu.y);
  vec2 wob = vec2(0.0018 * sin(pu.y * 820.0 + t * 2.3 + pu.x * 9.0) + 0.0009 * sin(pu.y * 1900.0 - t * 3.1), 0.0) * wet;
  float D = 1.0 - textureLod(uPano, vec2((pu.x + wob.x) / 3.0, pu.y), 1.1).r;
  // mist drifting low over the river and down the street, lifting the crayon off
  float mist = smoothstep(0.35, 0.8, fbm(vec2(pu.x * 2.4 - t * 0.05, pu.y * 9.0))) * exp(-pow((pu.y - 0.46) / 0.07, 2.0)) * smoothstep(0.9, 1.4, pu.x);
  D *= 1.0 - 0.45 * mist;
  // rings spreading in the puddles where the rain falls into them
  if (pu.y < 0.36 && pu.x < 1.25){
    vec2 g = vec2(pu.x * 9.0, pu.y * 30.0), gi = floor(g), gf = fract(g) - 0.5;
    float h = hash12(gi), ph = fract(t * (0.55 + 0.5 * h) + h * 7.0);
    vec2 c = (vec2(hash12(gi + 3.1), hash12(gi + 5.7)) - 0.5) * 0.5;
    float r = length((gf - c) * vec2(1.0, 0.33)) - ph * 0.42;
    D *= 1.0 - 0.45 * step(0.55, h) * smoothstep(0.03, 0.0, abs(r)) * (1.0 - ph) * wet;
  }
  // ---- the cut-outs, back to front
  float a;
  float d0 = sprite(uS0, uRect[0], uMod[0], p, a); D = mix(D, d0, a);
  float d1 = sprite(uS1, uRect[1], uMod[1], p, a); D = mix(D, d1, a);
  float d2 = sprite(uS2, uRect[2], uMod[2], p, a); D = mix(D, d2, a);
  float d3 = sprite(uS3, uRect[3], uMod[3], p, a); D = mix(D, d3, a);
  float d4 = sprite(uS4, uRect[4], uMod[4], p, a); D = mix(D, d4, a);
  float d5 = sprite(uS5, uRect[5], uMod[5], p, a); D = mix(D, d5, a);
  // ---- light is paper: round the lamp, the lit window and the light itself the crayon is lifted off
  {
    vec2 d = p - uLamp.xy; float r = length(d * vec2(1.0, 0.85));
    D *= 1.0 - uLamp.z * (0.85 * exp(-r / 0.022) + 0.45 * exp(-r / 0.085));
    vec2 dr = vec2(p.x - uLamp.x, max(0.0, uLamp.w - p.y));   // its long reflection down the wet street
    D *= 1.0 - uLamp.z * 0.35 * exp(-abs(dr.x) / (0.012 + dr.y * 0.05)) * exp(-dr.y / 0.25) * step(p.y, uLamp.w) * (0.75 + 0.25 * sin(p.y * 260.0 + t * 3.0));
    vec2 dw = p - uWin.xy; float rw = length(dw);
    float shadow = 1.0 - 0.75 * exp(-pow((dw.x - uWin.w * 0.03) / 0.008, 2.0)) * step(abs(dw.y), 0.03);
    D *= 1.0 - uWin.z * (0.5 * exp(-rw / 0.04) * shadow);
  }
  float hr = length(p - uHero.xy);
  D *= 1.0 - uHero.z * (0.95 * exp(-hr / (uHero.w * 0.55)) + 0.55 * exp(-hr / (uHero.w * 2.2)));
  // ---- rain: fine slanting lines lifted off with an eraser, two depths
  for (int k = 0; k < 2; k++){
    float fk = float(k), sc = 1.0 + fk * 0.8;
    vec2 r = vec2(p.x * 1.0 + p.y * 0.18, p.y) * vec2(85.0 / sc, 3.2 / sc) + vec2(fk * 17.0, t * (5.5 - fk * 1.8));
    vec2 ri = floor(r); float h = hash12(ri + fk * 31.0);
    float line = smoothstep(0.10, 0.0, abs(fract(r.x) - 0.5)) * step(0.86, h) * smoothstep(0.0, 0.2, fract(r.y + h * 5.0)) * smoothstep(0.75, 0.45, fract(r.y + h * 5.0));
    D *= 1.0 - line * (0.55 - fk * 0.2);
  }
  // ---- coming in: the drawing is laid down patch by patch; going out: the light rubs the whole page back to white
  float n = fbm(p * 3.5 + 2.0) * 0.7 + 0.3 * hash12(floor(gl_FragCoord.xy / 2.0));
  D *= smoothstep(n - 0.08, n + 0.08, uBuild * 1.25 - 0.1);
  // the light as an eraser: it rubs the page outward from itself in short strokes, each one going over a patch a few
  // times (streaks along it, the crayon only partly lifted), the strokes overlapping into a ragged white; well behind
  // the rubbing, the page is clean. (It takes the whole of the going-white to reach the corners.)
  if (uWhite > 0.0){
    float R = pow(uWhite, 1.4) * 1.35, er = 0.0;
    for (int L = 0; L < 2; L++){
      float fl = float(L), cs = 7.0 + fl * 1.7;
      vec2 q = p * cs + fl * vec2(0.37, 0.61), qi = floor(q);
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
        vec2 c = qi + vec2(float(i), float(j));
        float h1 = hash12(c + fl * 13.1), h2 = hash12(c + 4.3 + fl * 7.7), h3 = hash12(c + 9.1 + fl * 3.3);
        vec2 ctr = (c + vec2(h1, h2) - fl * vec2(0.37, 0.61)) / cs;
        float on = smoothstep(0.0, 0.07, R - length(ctr - uHero.xy) - 0.10 * h3);
        if (on <= 0.0) continue;
        float ang = 0.35 + 0.9 * (h1 - 0.5);
        vec2 dir = vec2(cos(ang), sin(ang)), d = p - ctr;
        float al = dot(d, dir), ac = dot(d, vec2(-dir.y, dir.x));
        float len = 0.045 + 0.035 * h2, wd = 0.016 + 0.012 * h3;
        float cap = smoothstep(wd, wd * 0.55, abs(ac) + max(abs(al) - len, 0.0));
        float st = 0.55 + 0.45 * smoothstep(0.3, 0.7, vnoise(vec2(al * 40.0, ac * 520.0) + c * 3.1));
        er = 1.0 - (1.0 - er) * (1.0 - cap * on * st * (0.65 + 0.3 * h1));
      }
    }
    D *= 1.0 - er;
    D *= 1.0 - smoothstep(R - 0.08, R - 0.38, hr + 0.06 * (fbm(p * 5.0 + 5.0) - 0.5));
  }
  // ---- the crayon on the paper: the paper's grain stays where it is on the screen, the drawing moves over it
  vec2 pp = gl_FragCoord.xy / 1024.0;
  float pl = texture(uPaper, pp * 1.15).r, pb = textureLod(uPaper, pp * 1.15, 4.5).r;
  float tooth = (pl - pb) * 4.2 + (vnoise(gl_FragCoord.xy * 0.75) - 0.5) * 0.55 + (vnoise(gl_FragCoord.xy * 0.21 + 9.0) - 0.5) * 0.30 + (vnoise(gl_FragCoord.xy * vec2(0.9, 0.35) + 3.0) - 0.5) * 0.2;
  float mid = 1.0 - abs(D - 0.5) * 1.6;
  float ink = sat(D * 1.06 + tooth * 0.42 * max(mid, 0.15));
  ink = mix(ink, smoothstep(0.25, 0.75, ink), 0.25);
  vec3 paper = vec3(0.958, 0.944, 0.918) * (0.97 + 0.06 * (pl - 0.5) * 2.0);
  vec3 crayon = vec3(0.105, 0.098, 0.095);
  vec3 c = mix(paper, crayon, ink * 0.95);
  // the light itself: a pale warm core, the only warm thing on the page
  float core = exp(-hr * hr / (uHero.w * uHero.w * 0.06));
  c = mix(c, vec3(1.0, 0.95, 0.82), sat(core * uHero.z));
  c += vec3(0.10, 0.07, 0.02) * uHero.z * exp(-hr / (uHero.w * 1.5));
  // the sheet's edges a little darker, as a drawing under a lamp
  vec2 uv = gl_FragCoord.xy / uRes - 0.5;
  c *= 1.0 - 0.10 * dot(uv, uv) * 1.6 * (1.0 - uWhite);
  c = mix(c, vec3(1.0, 0.99, 0.96), smoothstep(0.82, 1.0, uWhite));          // (the white the summer comes out of)
  c += (hash12(gl_FragCoord.xy + fract(t * 7.13) * 917.0) - 0.5) * 0.010;
  o = vec4(c * uFade, 1.0);
}`;
const VS = `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
const ease = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const ease2 = (x) => ease(ease(x));
const lerp = (a, b, t) => a + (b - a) * t;
// the cut-outs: [asset, where its foot stands (u, v on the drawing, as seen with the eye at uRef), its height on the screen,
// how much nearer than the drawing it is (k: it slides k times as fast), uRef, haze]
const SPR = [
  ['conte_umb',   0.88, 0.165, 0.33, 1.15, 0.95, 0.18],
  ['conte_lamp',  0.60, 0.040, 0.86, 1.40, 0.95, 0.00],
  ['conte_dog',   2.17, 0.035, 0.10, 1.30, 2.05, 0.10],
  ['conte_man',   1.93, 0.030, 0.22, 1.30, 2.05, 0.08],
  ['conte_woman', 1.66, 0.030, 0.44, 1.30, 2.05, 0.05],
  ['conte_tree',  1.40, -0.10, 0.98, 3.00, 1.45, 0.00],
];
W.conte = {
  ready: false, t: 0, fade: 1, vol: 0, white: 0, T: 12.5,
  hero: { p: [0, 0], on: true, glow: 1 },
  init() {
    if (this.ready) return;
    const gl = YL.gl;
    this.p = YL.makeProgram('conte', VS, FS); YL.checkProgram(this.p);
    this.vao = gl.createVertexArray();
    if (!this.started) this.start([0.1, 0.1]);
    if (YL.QS.has('ct')) this.t = +YL.QS.get('ct');
    this.ready = true;
  },
  // the light comes in where the drop opened (ndc)
  start(ndc) { this.t = 0; this.white = 0; this.started = true; this.entry = ndc ? ndc.slice() : [0.1, 0.1]; this.hero.on = true; },
  cam(t) {
    const u = ease2((t - 0.4) / 9.4);
    return { u: lerp(0.95, 2.05, u), v: lerp(0.50, 0.47, u), z: lerp(1.0, 1.08, ease((t - 0.4) / 9.4)) };
  },
  // the light's place on the screen: out of the drop, then along with the eye, low over the water at the end
  heroAt(t, aspect) {
    const e = [this.entry[0] * aspect * 0.5, this.entry[1] * 0.5];
    const a = ease((t - 0.2) / 2.2), b = ease((t - 6.0) / 4.0);
    const mid = [0.10 + 0.05 * Math.sin(t * 0.7), 0.04 + 0.03 * Math.sin(t * 1.1 + 1.0)];
    const end = [0.14, -0.13 + 0.01 * Math.sin(t * 1.4)];
    const m = [lerp(mid[0], end[0], b), lerp(mid[1], end[1], b)];
    return [lerp(e[0], m[0], a), lerp(e[1], m[1], a)];
  },
  ndcOfHero(aspect) { const p = this.hero.p; return [p[0] / (aspect * 0.5), p[1] / 0.5]; },
  update(dt) {
    this.t += dt;
    this.white = ease((this.t - (this.T - 2.6)) / 2.3);
    const aspect = YL.canvasAspect ? YL.canvasAspect() : 16 / 9;
    this.hero.p = this.heroAt(this.t, aspect);
    this.sound(dt);
  },
  render(target, aspect) {
    const gl = YL.gl, U = YL.U, p = this.p, t = this.t;
    const w = target ? target.w : gl.drawingBufferWidth, h = target ? target.h : gl.drawingBufferHeight;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null); gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    gl.useProgram(p.p);
    const c = this.cam(t);
    const pano = YL.assetTex('conte_pano'), paper = YL.assetTex('conte_paper');
    if (paper && !paper.rep) { gl.bindTexture(gl.TEXTURE_2D, paper); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT); paper.rep = true; }
    // the cut-outs: where each is now (its parallax), its sway and its walk
    const rect = new Float32Array(4 * N_SPR), mod = new Float32Array(4 * N_SPR);
    const texs = [];
    SPR.forEach(([k, u, v, hgt, kd, uRef, haze], i) => {
      const tx = YL.assetTex(k), sz = YL.ASSET_SIZE && YL.ASSET_SIZE[k];
      texs.push(tx);
      if (!tx || !sz) return;
      let uu = u, hh = hgt, vv = v, sway = 0;
      if (k === 'conte_umb') { const wk = ease(t / 11); uu = u + 0.20 * wk; hh = hgt * (1 - 0.13 * wk); vv = v + 0.02 * wk + 0.004 * Math.abs(Math.sin(t * Math.PI * 1.6)); sway = 0.012 * Math.sin(t * Math.PI * 1.6); }
      if (k === 'conte_woman') sway = 0.02 * Math.sin(t * 0.9);
      if (k === 'conte_tree') sway = 0.025 * Math.sin(t * 0.8) + 0.012 * Math.sin(t * 2.1);
      if (k === 'conte_man') hh = hgt * (1 + 0.006 * Math.sin(t * 1.3));
      if (k === 'conte_dog') { hh = hgt * (1 + 0.02 * Math.max(0, Math.sin(t * 2.2))); }
      const x = ((uu - uRef) + (uRef - c.u) * kd) * c.z, y = (vv - c.v) * c.z * (k === 'conte_tree' ? 1.0 : 1.0);
      const H = hh * c.z * (1 + (kd - 1) * (c.z - 1) * 2.0), Wd = H * sz[0] / sz[1];
      rect.set([x - (k === 'conte_tree' ? 0.12 * Wd : 0.5 * Wd), y, Wd, H], i * 4);
      mod.set([sway, haze, 1, 0], i * 4);
    });
    // the lamp's head (its glass, near the top of the cut-out) and the street under it; the lit window on the drawing
    const lr = rect.subarray(4, 8);
    const lampOn = 1 - this.white;
    U(p, 'uLamp', [lr[0] + lr[2] * 0.5, lr[1] + lr[3] * 0.93, lampOn * (0.9 + 0.05 * Math.sin(t * 9.0) * Math.sin(t * 3.3)), lr[1]]);
    const wx = (0.29 - c.u) * c.z, wy = (0.67 - c.v) * c.z;
    U(p, 'uWin', [wx, wy, lampOn, Math.max(-1, Math.min(1, (t - 5.0) / 1.6))]);
    U(p, 'uRes', [w, h]); U(p, 'uTime', t); U(p, 'uAspect', aspect); U(p, 'uFade', this.fade);
    U(p, 'uCam', [c.u, c.v, c.z]);
    U(p, 'uBuild', ease(t / 1.8)); U(p, 'uWhite', this.white);
    U(p, 'uHero', [this.hero.p[0], this.hero.p[1], this.hero.on ? this.hero.glow * (1.15 + 0.08 * Math.sin(t * 2.3)) : 0, 0.028 + 0.06 * this.white]);
    gl.uniform4fv(p.u.uRect, rect); gl.uniform4fv(p.u.uMod, mod);
    const bind = (name, tex, unit) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex || null); gl.uniform1i(p.u[name], unit); };
    bind('uPano', pano, 0); bind('uPaper', paper, 1);
    texs.forEach((tx, i) => bind('uS' + i, tx, 2 + i));
    gl.bindVertexArray(this.vao); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null);
  },
  /* ---- sound: the rain on the street (the room's rain, heard from outside now), the river lapping against the quay,
     the crayon on the paper as the drawing is laid down and rubbed out */
  sound(dt) {
    if (!this.snd) { const b = YL.AUDIO && YL.AUDIO.bus && YL.AUDIO.bus(); if (b) this.buildAudio(b); else return; }
    const S = this.snd, now = S.ctx.currentTime, t = this.t;
    S.bus.gain.setTargetAtTime(this.vol * this.fade, now, 0.3);
    S.lap.gain.setTargetAtTime(0.18 * ease((t - 4) / 4), now, 0.5);
    // a scratch of crayon now and then while it is being drawn, an eraser's rub as it goes white
    const drawing = t < 2.0 ? 1 : this.white > 0 ? 0.8 : 0;
    if ((S.next -= dt) <= 0 && drawing > 0) { this.scratch(now + 0.02, drawing); S.next = 0.08 + Math.random() * 0.18; }
  },
  buildAudio(b) {
    const { ctx, out, noiseBuffer, loop } = b;
    const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(out);
    const rain = noiseBuffer(6.1, 'pink');
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1400;
    const rg = ctx.createGain(); rg.gain.value = 0.16;
    loop(rain, 1.0, hp); hp.connect(rg); rg.connect(bus);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    const lap = ctx.createGain(); lap.gain.value = 0;
    loop(noiseBuffer(4.3, 'brown'), 1.0, lp); lp.connect(lap); lap.connect(bus);
    this.snd = { ctx, bus, lap, next: 0 };
  },
  scratch(when, k) {
    const S = this.snd, ctx = S.ctx, sr = ctx.sampleRate, n = Math.floor(sr * (0.05 + 0.08 * Math.random()));
    const buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) { const e = Math.sin(Math.PI * i / n); d[i] = (Math.random() * 2 - 1) * e * (0.5 + 0.5 * Math.sin(i * 0.02)); }
    const s = ctx.createBufferSource(); s.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600 + 1800 * Math.random(); bp.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.value = 0.05 * k;
    s.connect(bp); bp.connect(g); g.connect(S.bus); s.start(when);
  },
};
})();
