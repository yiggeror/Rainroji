/* ============================================================================
   世界 · 定格动画·纸船（桌上搭的一台小布景）
   ----------------------------------------------------------------------------
   康定斯基那张画里的蓝圆和黄月，变成了真东西：刷着蓝颜料的卡纸天幕，一弯瓦楞纸剪的月亮挂在线上。
   镜头往后退：棉花云吊在线上轻轻晃，三排揉皱的玻璃纸浪一前一后地推，纸船在浪里摇，船上坐着毛毡做的小孩，
   两手捧着那粒光——光照亮他的脸和纸帆，在玻璃纸的褶上一闪一闪。
   最后小孩把光举起来，光朝镜头飘过来，越来越亮，白——回到雨夜的房间。
   画法：天幕、月亮、云、三排浪、船都是生成的图（见 assets/prompts/），各自一层，远近不同（视差）；
   · 布景里的东西按定格动画的节奏动：每秒 12 格，一格一格地跳（镜头是轨道上的，平滑）；
   · 微距：焦点在船上，前后的层按远近虚掉；
   · 光是真的：它的暖光洒在近处的层上，玻璃纸的亮褶跟着它闪。
   ========================================================================== */
(() => {
'use strict';
const YL = window.YL;
const W = (YL.worlds = YL.worlds || {});
const N = 8;
const FS = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime, uStep, uFade, uWhite, uAspect, uFlick;
uniform vec4 uCam;                  // camera: x, y on the set, zoom, -
uniform sampler2D uSky, uS0, uS1, uS2, uS3, uS4, uS5, uS6, uS7;
uniform vec4 uA[${N}];              // each cut-out: its pivot on the screen (x, y), its size on the screen (w, h)
uniform vec4 uB[${N}];              // the pivot's place in the picture (u, v), its turn (radians), how out of focus (lod)
uniform vec4 uC[${N}];              // on, glints (cellophane), warm light it catches, darkening at the hands (the boat)
uniform vec4 uSky4;                 // the sky card on the screen: x0, y0, w, h
uniform vec4 uHero;                 // the light: x, y, brightness, size
uniform vec2 uHands;                // where the hands are (the boat's picture glows there while it holds the light)
out vec4 o;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }
float sat(float x){ return clamp(x, 0.0, 1.0); }
vec4 layer(sampler2D s, vec4 A, vec4 B, vec4 C, vec2 p, vec3 heroWarm){
  if (C.x <= 0.0) return vec4(0.0);
  vec2 d = p - A.xy;
  float cs = cos(-B.z), sn = sin(-B.z);
  d = vec2(cs * d.x - sn * d.y, sn * d.x + cs * d.y);
  vec2 q = B.xy + d / A.zw;
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) return vec4(0.0);
  vec4 c = textureLod(s, q, B.w);
  // the warm light it catches from the light (stronger on its near side), and the cellophane's creases flashing
  float l = dot(c.rgb, vec3(0.333));
  c.rgb += c.rgb * heroWarm * C.z;
  // (only the cellophane flashes — coloured and bright — not the white wool of the foam)
  float sat_ = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  float tw = smoothstep(0.80, 0.97, vnoise(q * vec2(1400.0, 420.0) + uStep * 7.3));
  c.rgb += vec3(1.0, 0.94, 0.80) * C.y * smoothstep(0.18, 0.4, sat_) * pow(sat(l * 1.4), 3.0) * (0.25 + 2.2 * tw) * (0.35 + heroWarm.r);
  // (the boat: once the light has left the hands, the glow they held goes out)
  if (C.w > 0.0){ float r = length((q - uHands) * vec2(1.0, 1.06)); c.rgb *= 1.0 - C.w * 0.55 * exp(-r / 0.07); }
  c.a *= C.x;
  return c;
}
void main(){
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime;
  float hr = length(p - uHero.xy);
  vec3 warm = vec3(1.0, 0.72, 0.40) * uHero.z * (0.9 * exp(-hr / 0.30) + 0.35 * exp(-hr / 0.9));
  // ---- the painted card sky, out of focus behind everything
  vec2 qs = (p - uSky4.xy) / uSky4.zw;
  vec3 c = textureLod(uSky, clamp(qs, 0.0, 1.0), 2.2).rgb;
  c += c * warm * 0.35;
  // ---- the cut-outs, back to front
  vec4 l;
  l = layer(uS0, uA[0], uB[0], uC[0], p, warm); c = mix(c, l.rgb, l.a);
  l = layer(uS1, uA[1], uB[1], uC[1], p, warm); c = mix(c, l.rgb, l.a);
  l = layer(uS2, uA[2], uB[2], uC[2], p, warm); c = mix(c, l.rgb, l.a);
  l = layer(uS3, uA[3], uB[3], uC[3], p, warm); c = mix(c, l.rgb, l.a);
  l = layer(uS4, uA[4], uB[4], uC[4], p, warm); c = mix(c, l.rgb, l.a);
  l = layer(uS5, uA[5], uB[5], uC[5], p, warm); c = mix(c, l.rgb, l.a);
  l = layer(uS6, uA[6], uB[6], uC[6], p, warm); c = mix(c, l.rgb, l.a);
  l = layer(uS7, uA[7], uB[7], uC[7], p, warm); c = mix(c, l.rgb, l.a);
  // ---- motes of dust floating in its light
  for (int i = 0; i < 18; i++){
    float fi = float(i);
    vec2 m = uHero.xy + vec2(sin(fi * 7.1 + t * 0.21) * 0.25, cos(fi * 3.7 + t * 0.17) * 0.2) * (0.5 + 0.5 * hash12(vec2(fi, 2.0)));
    float r = length(p - m);
    c += vec3(1.0, 0.85, 0.6) * uHero.z * 0.35 * smoothstep(0.0035, 0.0, r) * exp(-length(m - uHero.xy) / 0.25);
  }
  // ---- the light: a warm white core and its bloom
  c += vec3(1.0, 0.86, 0.6) * uHero.z * (exp(-hr * hr / (uHero.w * uHero.w * 0.05)) * 1.4 + 0.25 * exp(-hr / (uHero.w * 1.8)));
  // a real lamp on a set: the exposure breathes a little from frame to frame
  c *= 1.0 + uFlick;
  vec2 uv = gl_FragCoord.xy / uRes - 0.5;
  c *= 1.0 - 0.28 * dot(uv, uv) * 1.6;
  c = 1.0 - exp(-c * 1.25); c = pow(c, vec3(0.95));
  c = mix(c, vec3(1.0, 0.99, 0.96), uWhite);
  c += (hash12(gl_FragCoord.xy + fract(t * 7.13) * 917.0) - 0.5) * 0.012;
  o = vec4(c * uFade, 1.0);
}`;
const VS = `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
const ease = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;
// the set, back to front: [asset, pivot on the set (x, y), height, how near (k), pivot in its picture (u, v), focus lod, glints, warmth]
const SET = [
  ['stop_moon',       0.55,  0.60, 0.46, 1.06, 0.508, 1.00, 1.4, 0.0, 0.25],
  ['stop_cloud0',    -0.70,  0.62, 0.40, 1.10, 0.454, 1.00, 1.5, 0.0, 0.35],
  ['stop_cloud1',    -0.08,  0.64, 0.33, 1.12, 0.407, 1.00, 1.5, 0.0, 0.40],
  ['stop_cloud2',     1.02,  0.62, 0.36, 1.14, 0.469, 1.00, 1.5, 0.0, 0.40],
  ['stop_wave_back',  0.00, -0.50, 0.22, 1.25, 0.500, 0.00, 1.2, 0.6, 0.55],
  ['stop_boat',       0.06, -0.40, 0.44, 1.40, 0.500, 0.06, 0.0, 0.0, 0.25],
  ['stop_wave_mid',   0.00, -0.62, 0.40, 1.50, 0.500, 0.00, 0.3, 1.0, 0.75],
  ['stop_wave_front', 0.00, -0.74, 0.44, 1.90, 0.500, 0.00, 2.2, 0.8, 0.70],
];
W.stop = {
  ready: false, t: 0, fade: 1, vol: 0, white: 0, T: 12.0,
  hero: { p: [0, 0], b: 1 },
  init() {
    if (this.ready) return;
    this.p = YL.makeProgram('stop', VS, FS); YL.checkProgram(this.p);
    this.vao = YL.gl.createVertexArray();
    if (YL.QS.has('st')) this.t = +YL.QS.get('st');
    this.ready = true;
  },
  start() { this.t = 0; this.white = 0; },
  // the camera: from right up against the moon (the circle of the painting it came out of), back and down to the
  // whole little sea; then slowly in on the boat
  cam(t) {
    const a = ease((t - 0.3) / 4.2), b = ease((t - 4.5) / 6.0);
    const z = lerp(lerp(2.7, 1.04, Math.pow(a, 0.8)), 1.14, b);
    const x = lerp(lerp(0.54, 0.0, a), 0.10, b), y = lerp(lerp(0.30, -0.02, a), -0.06, b);
    return { x, y, z };
  },
  // where a thing on the set is on the screen: nearer things (k) slide and grow more as the camera moves
  place(x, y, k, c) { return [(x - c.x * k) * c.z, (y - c.y * k) * c.z, c.z * (1 + (k - 1) * (c.z - 1) * 0.6)]; },
  update(dt) {
    this.t += dt;
    this.white = ease((this.t - (this.T - 1.7)) / 1.6);
    this.sound(dt);
  },
  render(target, aspect) {
    const gl = YL.gl, U = YL.U, p = this.p, t = this.t;
    const w = target ? target.w : gl.drawingBufferWidth, h = target ? target.h : gl.drawingBufferHeight;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null); gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    gl.useProgram(p.p);
    const c = this.cam(t);
    const ts = Math.floor(t * 12) / 12;             // the set moves on twos: twelve positions a second
    const A = new Float32Array(4 * N), B = new Float32Array(4 * N), C = new Float32Array(4 * N), texs = [];
    let hands = [0, 0], boatRect = null;
    const leave = ease((t - 8.4) / 1.4);
    SET.forEach(([k, x, y, hgt, kd, pu, pv, lod, glint, warmth], i) => {
      const tx = YL.assetTex(k), sz = YL.ASSET_SIZE && YL.ASSET_SIZE[k];
      texs.push(tx);
      if (!tx || !sz) return;
      let xx = x, yy = y, ang = 0;
      if (k === 'stop_moon') ang = 0.05 * Math.sin(ts * 0.9);
      if (k.startsWith('stop_cloud')) { const ph = i * 1.7; ang = 0.07 * Math.sin(ts * 1.1 + ph); yy = y + 0.005 * Math.sin(ts * 0.7 + ph); }
      if (k.startsWith('stop_wave')) { const ph = i * 2.1, sp = k === 'stop_wave_mid' ? 1.0 : 0.8; xx = x + 0.035 * Math.sin(ts * sp + ph); yy = y + 0.012 * Math.sin(ts * 1.6 + ph); }
      if (k === 'stop_boat') { ang = 0.06 * Math.sin(ts * 1.6 + 0.4); yy = y + 0.016 * Math.sin(ts * 1.6) + 0.006 * Math.sin(ts * 3.1); xx = x + 0.02 * Math.sin(ts * 0.5); }
      const [sx, sy, sc] = this.place(xx, yy, kd, c);
      const H = hgt * sc, Wd = H * sz[0] / sz[1];
      A.set([sx, sy, Wd, H], i * 4); B.set([pu, pv, ang, lod + (k === 'stop_wave_front' ? 0.6 * (c.z - 1) : 0)], i * 4);
      C.set([1, glint, warmth, k === 'stop_boat' ? leave : 0], i * 4);
      if (k === 'stop_boat') {
        // the hands in the picture (0.684, 0.462), turned with the boat, on the screen
        const du = (0.684 - pu) * Wd, dv = (0.462 - pv) * H, cs = Math.cos(ang), sn = Math.sin(ang);
        hands = [sx + cs * du - sn * dv, sy + sn * du + cs * dv];
      }
    });
    // the light: in the hands; then lifted, floating up toward the eye, growing, all white
    const up = ease((t - 8.4) / 3.2);
    this.hero.p = [lerp(hands[0], 0.02, up), lerp(hands[1], 0.04, up) + 0.05 * Math.sin(Math.PI * up)];
    this.hero.b = 0.75 + 0.06 * Math.sin(t * 2.3) + 2.2 * up * up;
    const skyTex = YL.assetTex('stop_sky'), sk = YL.ASSET_SIZE && YL.ASSET_SIZE.stop_sky;
    const [kx, ky, ksc] = this.place(-1.5, -0.5, 1.0, c);
    U(p, 'uSky4', [kx, ky, 3.0 * ksc, 1.0 * ksc]);
    gl.uniform4fv(p.u.uA, A); gl.uniform4fv(p.u.uB, B); gl.uniform4fv(p.u.uC, C);
    U(p, 'uRes', [w, h]); U(p, 'uTime', t); U(p, 'uStep', Math.floor(t * 12)); U(p, 'uFade', this.fade); U(p, 'uAspect', aspect);
    U(p, 'uWhite', this.white); U(p, 'uFlick', 0.012 * (Math.sin(Math.floor(t * 12) * 12.9898) * 0.5));
    U(p, 'uCam', [c.x, c.y, c.z, 0]);
    U(p, 'uHero', [this.hero.p[0], this.hero.p[1], this.hero.b, 0.022 + 0.05 * up]);
    U(p, 'uHands', [0.684, 0.462]);
    const bind = (name, tex, unit) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex || null); gl.uniform1i(p.u[name], unit); };
    bind('uSky', skyTex, 0);
    texs.forEach((tx, i) => bind('uS' + i, tx, 1 + i));
    gl.bindVertexArray(this.vao); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null);
  },
  /* ---- sound: the little sea (a soft wash), the cellophane crinkling as the waves are pushed, a thread creaking now and then */
  sound(dt) {
    if (!this.snd) { const b = YL.AUDIO && YL.AUDIO.bus && YL.AUDIO.bus(); if (b) this.buildAudio(b); else return; }
    const S = this.snd, now = S.ctx.currentTime;
    S.bus.gain.setTargetAtTime(this.vol * this.fade * (1 - this.white), now, 0.3);
    const step = Math.floor(this.t * 12);
    if (step !== S.last) { S.last = step; if (step % 3 === 0) this.crinkle(now + 0.01, 0.4 + 0.6 * Math.abs(Math.sin(this.t * 1.6))); }
  },
  buildAudio(b) {
    const { ctx, out, noiseBuffer, loop } = b;
    const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(out);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const g = ctx.createGain(); g.gain.value = 0.22;
    loop(noiseBuffer(5.7, 'brown'), 1.0, lp); lp.connect(g); g.connect(bus);
    this.snd = { ctx, bus, last: -1 };
  },
  crinkle(when, k) {
    const S = this.snd, ctx = S.ctx, sr = ctx.sampleRate, n = Math.floor(sr * 0.12);
    const buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() < 0.06 ? Math.random() * 2 - 1 : 0) * Math.exp(-i / (n * 0.4));
    const s = ctx.createBufferSource(); s.buffer = buf;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
    const g = ctx.createGain(); g.gain.value = 0.10 * k;
    s.connect(hp); hp.connect(g); g.connect(S.bus); s.start(when);
  },
};
})();
