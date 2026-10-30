/* ============================================================================
   导演 —— 时间线、镜头与转场。
   第一幕 · 雨夜的房间
     intro     台灯亮着；你点它，或者等它自己闪两下——一粒光从灯丝里跳出来，灯熄了
     wander    它在屋里飘：茶的热气、练习本、挂钟、吊兰，最后停到窗玻璃上
     window    镜头推近玻璃，焦点落在它和雨滴上
   转场 1→2 · 雨滴里的白昼
     daydrops  窗上每一颗雨滴里倒映的，从夜里的街慢慢变成晴空、积云和田野（窗外仍是雨夜）
     dive      镜头扎进它所在的那颗雨滴；雨滴的圆从它身上张开，夏天从里面涌出来
   第二幕 · 盛夏午后
     summer    光在风里；光标就是风，按住不动风就停
   调试：?phase=wander|window|daydrops|dive|summer &pt=秒   ?world=summer|woodcut（只看世界，不放主角）
   ========================================================================== */
(() => {
'use strict';
const YL = window.YL;
const { V, clamp, lerp, smooth, S, HERO, LIGHT, QS } = YL;
const ROUTE = [
  { p: S.BULB },
  { p: [-0.50, 0.985, 0.27], travel: 0.7, dwell: 1.0 },     // drops out of the shade's open bottom, looks around
  { p: [-0.17, 0.905, 0.19], travel: 2.4, dwell: 2.2 },     // into the tea's steam
  { p: [0.03, 0.80, 0.31], travel: 2.2, dwell: 1.8 },       // low over the open notebook
  { p: [-0.62, 1.60, 0.12], travel: 3.2, dwell: 1.8 },      // up to the clock
  { p: [0.26, 1.07, 0.04], travel: 3.4, dwell: 2.4 },       // in among the spider plant's leaves
  { p: [0.20, 1.42, -0.098], travel: 2.8, dwell: 0 },       // to the glass, among the drops
];
const T_HOLD = 2.5, T_DAY = 4.5, T_DIVE = 2.6;
const ease = x => x * x * (3 - 2 * x), easeIn = x => x * x * x;

const D = YL.director = {
  phase: 'intro', t: 0, pt: 0,
  go(ph) { D.phase = ph; D.pt = 0; },
  escape() {
    if (D.phase !== 'intro') return;
    D.go('wander'); D.t = 0;
    HERO.on = true; HERO.glow = 0; YL.hero.glowTarget = 1;
    YL.hero.setRoute(ROUTE);
    LIGHT.on = 0; LIGHT.dip = 0;
    YL.AUDIO.click && YL.AUDIO.click(0);
    setTimeout(() => YL.AUDIO.motif && YL.AUDIO.motif(-0.4), 350);
  },
  // the window shot (and where the dive goes)
  winShot(aspect) {
    const portrait = aspect < 0.9;
    return { pos: portrait ? [0.16, 1.38, 0.72] : [0.12, 1.41, 0.62], tgt: [0.20, 1.42, S.GLASS_Z], vfov: portrait ? 44 : 30 };
  },
  update(dt, realT) {
    D.t += dt; D.pt += dt;
    const summer = YL.worlds.summer;
    if (D.phase === 'intro') {
      // it wants out: two little flickers of the lamp, then it goes by itself
      LIGHT.dip = 0.55 * (smooth(7.4, 7.5, D.t) - smooth(7.6, 7.75, D.t)) + 0.35 * (smooth(8.3, 8.36, D.t) - smooth(8.45, 8.6, D.t));
      if (D.t > 10) D.escape();
      YL.cam = null;
      return;
    }
    if (D.phase === 'summer') return;
    YL.hero.update(dt, realT);
    const L = YL.hero.routeLength(), Tw = L - 2.0;
    if (D.phase === 'wander' && D.t > L) D.go('window');
    if (D.phase === 'window' && D.pt > 0.2 && !summer.ready) summer.init();                 // compile the next world early
    if (D.phase === 'window' && D.pt > T_HOLD) D.go('daydrops');
    if (D.phase === 'daydrops' && D.pt > T_DAY) D.go('dive');
    if (D.phase === 'dive' && D.pt > T_DIVE) { D.enterSummer(); return; }
    // ---- the shot
    const aspect = YL.canvasAspect();
    const base = YL.framing(aspect), h = HERO.p;
    const follow = { pos: V.add(base.pos, V.mul(V.sub(h, base.tgt), 0.12)), tgt: base.tgt.map((v, i) => lerp(v, h[i], 0.45)), vfov: base.vfov * 0.92 };
    const win = D.winShot(aspect);
    const ww = D.phase === 'wander' ? smooth(Tw, Tw + 3.5, D.t) : 1;
    let pos = follow.pos.map((v, i) => lerp(v, win.pos[i], ww)), tgt = follow.tgt.map((v, i) => lerp(v, win.tgt[i], ww));
    let vfov = lerp(follow.vfov, win.vfov, ww);
    if (D.phase === 'dive') {
      // into the drop it sits in: the eye goes right up to the glass and the lens narrows
      const u = easeIn(clamp(D.pt / T_DIVE, 0, 1));
      const at = [h[0], h[1], S.GLASS_Z];
      pos = pos.map((v, i) => lerp(v, [h[0] - 0.01, h[1], S.GLASS_Z + 0.09][i], u));
      tgt = tgt.map((v, i) => lerp(v, at[i], u));
      vfov = lerp(vfov, 12, u);
    }
    const fwd = V.norm(V.sub(tgt, pos));
    const focus = lerp(V.dot(V.sub(h, pos), fwd), (S.GLASS_Z - pos[2]) / fwd[2], ww);
    YL.cam = { pos, tgt, vfov, focus: Math.max(focus, 0.05), w: smooth(0, 2.5, D.t) };
    // ---- daylight in the drops; the summer's sounds creep in under the rain
    if (D.phase === 'daydrops' || D.phase === 'dive') {
      const u = D.phase === 'daydrops' ? ease(clamp(D.pt / T_DAY, 0, 1)) : 1;
      YL.sharpMix = u; YL.sharpGain = 0.45;
      summer.vol = 0.35 * u + (D.phase === 'dive' ? 0.65 * ease(clamp(D.pt / T_DIVE, 0, 1)) : 0);
      YL.roomVol = 1 - (D.phase === 'dive' ? ease(clamp(D.pt / T_DIVE, 0, 1)) : 0);
    }
  },
  enterSummer() {
    D.go('summer');
    YL.sharpMix = 0; YL.roomTarget = null; YL.roomVol = 0;
    D.world = 'summer'; D.placeHero = true;              // (placed on the first summer frame, once the world exists)
    setTimeout(() => YL.AUDIO.motif && YL.AUDIO.motif(0, 0.05, 1), 400);
  },
  placeLight() {
    const summer = YL.worlds.summer;
    summer.vol = 1;
    // the light arrives where the drop opened: same spot on the screen, a couple of metres into the field
    const c = D.irisCenter || [0.1, 0.1];
    summer.hero.p = summer.unproject(c[0], c[1], 2.4, YL.canvasAspect());
    summer.hero.anchor = [summer.hero.p[0] * 0.5 + 0.15, 0.62, Math.min(summer.hero.p[2] * 0.5 - 0.9, -1.8)];   // down among the grass tops
    summer.hero.v = [0, 0.05, 0]; summer.hero.on = true;
  },
};
YL.onLampTap = () => { if (D.phase === 'intro') D.escape(); return true; };   // after it has gone, the lamp is just empty

// ---- the iris: during the dive the room and the summer are both drawn into textures and composited here
const FS_IRIS = `#version 300 es
precision highp float;
uniform sampler2D uA, uB; uniform vec2 uRes, uC; uniform float uR, uFlash;
out vec4 o;
void main(){
  vec2 uv = gl_FragCoord.xy / uRes, p = gl_FragCoord.xy;
  float r = length(p - uC); vec2 dir = (p - uC) / max(r, 1e-3);
  float e = r / max(uR, 1.0);
  float inside = 1.0 - smoothstep(0.985, 1.0, e);
  // the drop's rim is a lens: near the edge the summer inside is pinched and bent, and a bright meniscus runs round it
  float bend = smoothstep(0.55, 1.0, e) * inside;
  vec2 uvB = (uC + dir * r * (1.0 - 0.22 * bend * bend)) / uRes;
  vec3 a = texture(uA, uv).rgb, b = texture(uB, clamp(uvB, 0.0, 1.0)).rgb;
  vec3 c = mix(a, b, inside);
  float ring = exp(-pow((e - 0.985) * uR / 3.5, 2.0));
  c += vec3(1.0, 0.97, 0.9) * ring * 0.55 * smoothstep(2.0, 12.0, uR);
  c = mix(c, vec3(1.0, 0.99, 0.96), uFlash);
  o = vec4(c, 1.0);
}`;
let iris = null;
function irisTargets() {
  const gl = YL.gl, w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  if (iris && iris.w === w && iris.h === h) return iris;
  const p = iris ? iris.p : YL.makeProgram('iris', `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`, FS_IRIS);
  if (!iris) YL.checkProgram(p);
  iris = { p, w, h, A: YL.makeTarget(w, h, ['rgba8']), B: YL.makeTarget(w, h, ['rgba8']) };
  return iris;
}
// screen position (ndc) of a world point in the room's camera
function project(p) {
  const C = YL.CAM, v = V.sub(p, C.pos), z = V.dot(v, C.fwd);
  return [V.dot(v, C.right) / (z * C.tan[0]), V.dot(v, C.up) / (z * C.tan[1])];
}

// ---- which world is on screen. The room is the host's own render; the others draw themselves.
D.world = QS.get('world') || 'room';
let lastPtr = null;
D.renderFrame = (dt, realT) => {
  const summer = YL.worlds.summer;
  // drops showing the summer: keep its panorama fresh
  if ((D.phase === 'daydrops' || D.phase === 'dive') && !summer.ready) summer.init();
  if ((D.phase === 'daydrops' || D.phase === 'dive') && summer.ready) {
    if (!YL.sharp2) YL.sharp2 = YL.makeTarget(768, 576, ['rgba8']);
    summer.update(dt, YL.DBG.still);
    summer.renderEquirect(YL.sharp2);
  }
  if (D.phase === 'dive' && summer.ready) {
    const I = irisTargets(), gl = YL.gl;
    const u = clamp(D.pt / T_DIVE, 0, 1);
    D.irisCenter = project([HERO.p[0], HERO.p[1], S.GLASS_Z]);
    YL.roomTarget = I.A;
    return D.irisFrame = { I, u }, false;     // the room renders into A; the composite happens in afterRoom()
  }
  if (D.world === 'room') return false;
  const w = YL.worlds && YL.worlds[D.world];
  if (!w) return false;
  if (!w.ready) w.init();
  if (D.placeHero && D.world === 'summer') { D.placeHero = false; D.placeLight(); }
  const P = YL.ptr;
  if (P && P !== lastPtr && w.pointer) w.pointer(P.nx, P.ny, P.speed);
  lastPtr = P;
  YL.ptrPar = YL.CAM.par;
  w.update(dt, YL.DBG.still);
  w.render(null, YL.canvasAspect());
  return true;
};
// called by the host right after it has drawn the room (into A during the dive)
D.afterRoom = () => {
  const F = D.irisFrame; if (!F || D.phase !== 'dive') return;
  D.irisFrame = null;
  const { I, u } = F, gl = YL.gl, summer = YL.worlds.summer;
  summer.render(I.B, YL.canvasAspect());
  // the iris opens from the light's own drop: slowly, then all at once
  const c = D.irisCenter, w = I.w, h = I.h;
  const cpx = [(c[0] * 0.5 + 0.5) * w, (c[1] * 0.5 + 0.5) * h];
  const R = u < 0.42 ? 0 : 6 * Math.exp((u - 0.42) / 0.58 * Math.log(Math.hypot(w, h) * 1.3 / 6));
  const flash = 0.55 * Math.exp(-Math.pow((u - 0.9) / 0.06, 2));
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, h);
  gl.useProgram(I.p.p);
  YL.U(I.p, 'uRes', [w, h]); YL.U(I.p, 'uC', cpx); YL.U(I.p, 'uR', R); YL.U(I.p, 'uFlash', flash);
  YL.bindTex(I.p, 'uA', I.A.tex, 0); YL.bindTex(I.p, 'uB', I.B.tex, 1);
  YL.drawFull();
};
if (D.world !== 'room') YL.roomVol = 0;

// ---- screenshots: jump straight to a moment
if (QS.get('phase')) {
  const ph = QS.get('phase'), pt = +(QS.get('pt') || 0);
  D.escape();
  LIGHT.level = 0; HERO.glow = 1;
  const L = YL.hero.routeLength();
  if (ph === 'wander') { YL.hero.t = pt; D.t = pt; }
  else {
    YL.hero.t = L + 5; D.t = L + 5;
    if (ph === 'summer') { D.irisCenter = [0.1, 0.1]; D.enterSummer(); }
    else { D.go(ph); D.pt = pt; }
  }
}
})();
