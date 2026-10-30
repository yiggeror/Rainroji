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
   转场 2→3 · 被抽走的颜色
     updraft   一阵上升的风把它带走；镜头跟着它仰起来，望向那座最高的积云
     cloud     钻进云里：一片白，越来越厚、越来越暗、越来越冷；开始下雪；颜色被一层层抽走，最后只剩一张纸
   第三幕 · 雪夜·木刻
     print     这张纸被印上去：先靛版，再墨版，最后朱版——世界一块版一块版地出现；它随着雪落下来
     woodcut   它找到那盏黑着的灯笼，钻进去，灯亮了；你在黑处划一刀，它就沿着你的刀痕走
     leave     最后它从灯笼里出来，自己刻出一条路，走到冰窟窿，沉进黑水里
   转场 3→4 · 冰窟窿
     tear      冰窟窿里的黑水变成了真的水；纸从洞口撕开，越撕越大，我们掉进去
   第四幕 · 深海
     deepsea   只有它照亮的那一小团水是看得见的。手牵着它走；不动，黑暗里的小生命就过来看它；
               一会儿，黑暗里出现另一粒一模一样的光
   转场 4→5 · 杯底
     rise      它往上浮。头顶有一圈暖光——杯口那么大，边上一圈白搪瓷，几片茶叶的影子漂着；水越来越像茶
   第五幕 · 回到房间
     surface   穿出水面：是书桌上那只搪瓷杯里的茶。镜头从茶面上方慢慢拉开，雨夜的房间
     home      它飞回台灯，钻进灯丝；灯重新亮起，房间又暖了
     end       雨还在下。（再点一下台灯，就从头再来一遍）
   调试：?phase=wander|window|daydrops|dive|summer|updraft|cloud|print|woodcut|leave|tear|deepsea|rise|surface &pt=秒
         ?world=summer|woodcut（只看世界，不放主角）
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
const T_SUMMER = 30, T_UP = 6.5, T_CLOUD = 6.0, T_PRINT = 4.8, T_WOOD = 50, T_TEAR = 4.4, T_LURE = 24, T_SEA = 46, T_RISE = 8, T_SURF = 4.5;
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
    if (D.phase === 'summer' || D.phase === 'updraft' || D.phase === 'cloud') { D.toPrint(dt); return; }
    if (D.phase === 'print' || D.phase === 'woodcut' || D.phase === 'leave') { D.inPrint(dt); return; }
    if (D.phase === 'tear' || D.phase === 'deepsea' || D.phase === 'rise') { D.inSea(dt); return; }
    if (D.phase === 'surface' || D.phase === 'home' || D.phase === 'end') { D.inRoom(dt, realT); return; }
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
  // ---- out of the summer: up into the cloud, and through it into the print
  toPrint(dt) {
    const summer = YL.worlds.summer, wood = YL.worlds.woodcut, H = summer.hero;
    if (D.phase === 'summer') { if (D.pt > T_SUMMER) D.go('updraft'); return; }
    // the light is carried up toward the tower of cloud, further and further away; the eye follows it up
    const T = summer.tower, dir = [Math.sin(T[0]) * Math.cos(T[1]), Math.sin(T[1]), -Math.cos(T[0]) * Math.cos(T[1])];
    if (D.phase === 'updraft') {
      const u = clamp(D.pt / T_UP, 0, 1);
      summer.lift = ease(clamp(D.pt / (T_UP * 0.8), 0, 1));
      summer.zoom = 0.35 * easeIn(u);
      const dist = 2.4 * Math.exp(u * Math.log(30 / 2.4));
      H.fly = V.add([0, 0.85, 0], V.mul(dir, dist));
      if (u > 0.5 && !wood.ready) wood.init();                                   // cut the blocks while it's still bright
      if (D.pt > T_UP) D.go('cloud');
    } else {
      const u = clamp(D.pt / T_CLOUD, 0, 1);
      summer.lift = 1; summer.zoom = 0.35 + 0.6 * ease(clamp(u / 0.6, 0, 1));
      H.fly = V.add([0, 0.85, 0], V.mul(dir, 30 + 40 * u));
      summer.vol = 1 - ease(clamp((u - 0.2) / 0.7, 0, 1));
      if (D.pt > T_CLOUD) {
        D.go('print'); D.world = 'woodcut';
        const hp = D.drainHero || [0, 0.5];
        wood.show = [0, 0, 0]; wood.vol = 0;
        wood.arrive(hp[0], hp[1], YL.canvasAspect());
      }
    }
  },
  // ---- in the print: the blocks go on one after another; later, the way out
  inPrint(dt) {
    const wood = YL.worlds.woodcut;
    if (D.phase === 'print') {
      const t = D.pt;
      wood.show = [ease(clamp(t / 1.6, 0, 1)), ease(clamp((t - 1.3) / 1.6, 0, 1)), ease(clamp((t - 2.7) / 1.3, 0, 1))];
      wood.vol = ease(clamp(t / 3, 0, 1));
      if (D.pt > T_PRINT) { wood.show = [1, 1, 1]; D.go('woodcut'); }
    } else if (D.phase === 'woodcut') {
      wood.vol = 1;
      // once the lantern is lit, a word on what the hand can do here (only once, and never in a screenshot)
      if (!D.carveHint && wood.hero.mode === 'home' && D.pt > 3 && !YL.DBG.shot) {
        D.carveHint = true;
        const h = document.getElementById('hint');
        if (h) { h.textContent = '在黑处划一刀'; h.classList.add('show'); setTimeout(() => h.classList.remove('show'), 6000); }
      }
      if (D.pt > T_WOOD && wood.hero.mode === 'home') { wood.leave(); D.go('leave'); }
    } else if (D.phase === 'leave') {
      const sea = YL.worlds.deepsea;
      if (!sea.ready) sea.init();                                                // ready the water while it walks
      if (wood.gone) { D.go('tear'); D.tearSound(); }
    }
  },
  // ---- through the ice: the print tears open onto the deep, and then there is only the deep
  inSea(dt) {
    const sea = YL.worlds.deepsea, wood = YL.worlds.woodcut;
    if (D.phase === 'tear') {
      const u = clamp(D.pt / T_TEAR, 0, 1);
      wood.vol = 1 - ease(clamp(u / 0.6, 0, 1)); sea.vol = ease(clamp((u - 0.2) / 0.8, 0, 1));
      if (D.pt > T_TEAR) { D.go('deepsea'); D.world = 'deepsea'; sea.vol = 1; }
    } else if (D.phase === 'deepsea') {
      if (D.pt > T_LURE && sea.lure.state === 'off') sea.startLure();
      if (D.pt > T_SEA && !['approach', 'reveal', 'snap'].includes(sea.lure.state)) { D.go('rise'); D.riseY0 = sea.cam ? sea.cam.eye[1] : 0; }
    } else if (D.phase === 'rise') {
      // up toward the light above; the water turns to tea; then the surface
      const u = clamp(D.pt / T_RISE, 0, 1);
      sea.rise = u; sea.riseY = 6.6 * Math.pow(u, 2.2);
      sea.surfY = (D.riseY0 || 0) + 7.4; sea.surf = smooth(0.0, 0.2, u); sea.tea = smooth(0.25, 1.0, u);
      sea.flash = smooth(0.86, 1.0, u);
      sea.vol = 1 - 0.7 * smooth(0.6, 1.0, u);
      YL.roomVol = 0.6 * smooth(0.75, 1.0, u);                                  // the rain, faintly, through the water
      if (D.pt > T_RISE) D.surface();
    }
  },
  // ---- back in the room: out of the tea, home to the lamp
  surface() {
    const sea = YL.worlds.deepsea, S_ = YL.S, wood = YL.worlds.woodcut;
    D.go('surface'); D.world = 'room'; YL.roomTarget = null;
    sea.vol = 0; if (wood) wood.vol = 0; YL.roomVol = 1;
    const tea = [S_.MUG_X, S_.DESK_TOP + S_.MUG_H * 0.70 + 0.004, S_.MUG_Z];
    HERO.on = true; HERO.glow = 1; HERO.p = tea.slice(); YL.hero.glowTarget = 1;
    YL.hero.setRoute([
      { p: tea },
      { p: [S_.MUG_X, S_.DESK_TOP + 0.17, S_.MUG_Z + 0.01], travel: 1.3, dwell: 0.9 },     // up out of the steam: it looks round — it's home
      { p: [-0.36, 1.04, 0.27], travel: 1.9, dwell: 0.3 },
      { p: S_.BULB, travel: 1.7, dwell: 0 },
    ]);
    LIGHT.on = 0; LIGHT.dip = 0;
  },
  inRoom(dt, realT) {
    const aspect = YL.canvasAspect(), base = YL.framing(aspect), S_ = YL.S, h = HERO.p;
    if (D.phase === 'surface' || D.phase === 'home') YL.hero.update(dt, realT);
    // the shot: from just above the tea, drawing back to the room, with a lean toward the light
    const u = ease(clamp(D.pt / T_SURF, 0, 1));
    const close = { pos: [S_.MUG_X + 0.05, S_.DESK_TOP + 0.13, S_.MUG_Z + 0.12], tgt: [S_.MUG_X, S_.DESK_TOP + 0.075, S_.MUG_Z], vfov: 42 };
    const follow = { pos: V.add(base.pos, V.mul(V.sub(h, base.tgt), 0.10)), tgt: base.tgt.map((v, i) => lerp(v, h[i], 0.35)), vfov: base.vfov * 0.95 };
    const k = D.phase === 'surface' ? u : 1;
    let pos = close.pos.map((v, i) => lerp(v, follow.pos[i], k)), tgt = close.tgt.map((v, i) => lerp(v, follow.tgt[i], k)), vfov = lerp(close.vfov, follow.vfov, k);
    const fwd = V.norm(V.sub(tgt, pos));
    let w = 1;
    if (D.phase === 'end') w = 1 - smooth(0.5, 3.5, D.pt);                     // and the eye settles back where the film began
    YL.cam = w > 0.001 ? { pos, tgt, vfov, focus: Math.max(V.dot(V.sub(h, pos), fwd), 0.05), w } : null;
    if (D.phase === 'surface' && D.pt > T_SURF) D.go('home');
    if (D.phase === 'home' && YL.hero.t >= YL.hero.routeLength()) {
      // into the filament: the lamp comes back on
      D.go('end');
      LIGHT.on = 1; YL.hero.glowTarget = 0;
      YL.AUDIO.click && YL.AUDIO.click(1);
      setTimeout(() => YL.AUDIO.motif && YL.AUDIO.motif(-0.4, 0.05, 1), 300);
    }
    if (D.phase === 'end' && HERO.glow < 0.02) HERO.on = false;
    if (D.phase === 'end') YL.hero.update(dt, realT);
  },
  // tapping the lamp at the end: the light jumps out again, and the film runs once more
  replay() {
    const sm = YL.worlds.summer, wd = YL.worlds.woodcut, sea = YL.worlds.deepsea;
    if (sm) { sm.lift = 0; sm.zoom = 0; if (sm.hero) { sm.hero.fly = null; sm.hero.on = false; } sm.vol = 0; }
    if (wd) { wd.gone = false; wd.hero.mode = 'home'; wd.show = [1, 1, 1]; wd.lanLight = 1; wd.vol = 0; }
    if (sea) { sea.hero.on = false; sea.rise = 0; sea.riseY = 0; sea.surf = 0; sea.tea = 0; sea.flash = 0; sea.lure.state = 'off'; sea.vol = 0; }
    YL.sharpMix = 0; YL.cam = null; D.world = 'room'; YL.roomVol = 1;
    D.phase = 'intro'; D.escape();
  },
  tearSound() {
    const b = YL.AUDIO.bus && YL.AUDIO.bus(); if (!b) return;
    const { ctx, out } = b, t0 = ctx.currentTime + 0.05;
    // paper tearing: a dry crackle that runs on for a second
    const n = Math.floor(ctx.sampleRate * 1.6), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    let env = 0;
    for (let i = 0; i < n; i++) { if (Math.random() < 0.004) env = 0.4 + Math.random() * 0.6; env *= 0.9985; d[i] = (Math.random() * 2 - 1) * env * Math.min(1, i / 2000) * (1 - i / n); }
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.value = 0.14;
    src.connect(bp); bp.connect(g); g.connect(out); src.start(t0 + 0.4);
    // and the plunge: a low, heavy hush
    const nb = ctx.createBufferSource(); nb.buffer = buf;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(600, t0 + 1.6); lp.frequency.exponentialRampToValueAtTime(70, t0 + 3.6);
    const g2 = ctx.createGain(); g2.gain.setValueAtTime(0, t0 + 1.6); g2.gain.linearRampToValueAtTime(0.5, t0 + 2.2); g2.gain.exponentialRampToValueAtTime(1e-4, t0 + 4.2);
    nb.playbackRate.value = 0.5; nb.connect(lp); lp.connect(g2); g2.connect(out); nb.start(t0 + 1.6);
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
YL.onLampTap = () => { if (D.phase === 'intro') D.escape(); else if (D.phase === 'end') D.replay(); return true; };   // while it is away, the lamp is just empty

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
// ---- inside the cloud: the summer drowned in white, then cold, then snow, the colour drained out of it, then paper
const FS_DRAIN = `#version 300 es
precision highp float;
uniform sampler2D uA, uB; uniform vec2 uRes; uniform float uTime, uFog, uCold, uSnow, uPaper; uniform vec3 uHero;
out vec4 o;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s / 0.9375; }
// one layer of falling flakes, drifting with the wind; near ones big and soft, far ones small; crisper as the world turns to paper
float flakes(vec2 p, float cell, float rad, float speed, float dens, float blur, float seed){
  p.y += uTime * speed; p.x += uTime * speed * 0.35 + 0.3 * cell * sin(uTime * 0.7 + p.y / cell * 0.4 + seed);
  vec2 g = p / cell, i = floor(g), f = fract(g) - 0.5;
  float h = hash12(i + seed);
  if (h > dens) return 0.0;
  vec2 c = vec2(hash12(i * 1.3 + seed), hash12(i * 2.1 + seed)) - 0.5;
  float r = rad * (0.6 + 0.8 * h / dens);
  float soft = mix(r * blur, r * 0.12, uPaper);
  return smoothstep(r + soft, r - soft, length((f - c * 0.6) * cell)) * mix(0.75, 1.0, uPaper);
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes, q = gl_FragCoord.xy / uRes.y;
  vec3 a = texture(uA, uv).rgb;
  // rising through the cloud: two layers of it stream down past the eye, the near one faster, with more contrast;
  // the rise slows as it gets cold
  float rise = uTime * mix(0.55, 0.12, uCold);
  float far = fbm(q * vec2(1.6, 2.2) + vec2(0.05 * uTime, rise * 0.45));
  float near = fbm(q * vec2(3.0, 2.0) + vec2(-0.08 * uTime, rise * 1.3) + 7.0);
  float fog = clamp(uFog * (0.45 + 0.8 * far + 0.5 * smoothstep(0.45, 0.8, near)), 0.0, 1.0);
  vec3 bright = vec3(0.96, 0.97, 0.99), cold = vec3(0.50, 0.54, 0.62);
  vec3 cloud = mix(bright, cold, uCold) * (0.86 + 0.22 * far) * (1.0 - 0.18 * uCold * smoothstep(0.5, 0.85, near));
  vec2 d = uv - 0.5; cloud *= 1.0 - (0.10 + 0.35 * uCold) * dot(d, d) * 2.2;        // deeper in, darker round the edges
  vec3 c = mix(a, cloud, fog);
  // the colour goes: and it gets darker, colder
  float l = dot(c, vec3(0.30, 0.55, 0.15));
  c = mix(c, vec3(l) * vec3(0.90, 0.95, 1.06), uCold);
  c *= 1.0 - 0.28 * uCold * (1.0 - uPaper);
  // the light: the only warm thing left
  vec2 hp = (uHero.xy * 0.5 + 0.5) * uRes;
  float hd = length(gl_FragCoord.xy - hp) / uRes.y;
  c += vec3(1.0, 0.60, 0.26) * uHero.z * (exp(-hd / 0.006) * 1.4 + exp(-hd / 0.035) * 0.30 * (1.0 - fog * 0.4)) * (1.0 - uPaper);
  // snow begins
  float s = flakes(q, 0.030, 0.0018, 0.07, 0.30, 0.6, 1.0);
  s = max(s, flakes(q, 0.065, 0.0036, 0.13, 0.30, 0.8, 5.0));
  s = max(s, flakes(q, 0.16, 0.0090, 0.30, 0.22, 1.6, 9.0));
  c = mix(c, vec3(0.97, 0.97, 0.99), s * uSnow);
  // and then there is only paper
  c = mix(c, texture(uB, uv).rgb, uPaper);
  o = vec4(c, 1.0);
}`;
// ---- the print tearing open onto the deep
const FS_TEAR = `#version 300 es
precision highp float;
uniform sampler2D uA, uB; uniform vec2 uRes, uC, uR0; uniform float uU, uZoom;
out vec4 o;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }
float anoise(float a, float f, float s){ return vnoise(vec2(cos(a), sin(a)) * f + s); }   // noise round a circle, seamless
void main(){
  vec2 p = gl_FragCoord.xy, uv = p / uRes, d = p - uC;
  float ang = atan(d.y, d.x);
  // the hole: first just the ice hole's ellipse, then rounder and larger, past the corners
  float open = smoothstep(0.18, 1.0, uU);
  float big = length(uRes) * 1.25;
  vec2 rr = mix(uR0, vec2(big), pow(open, 2.2));
  rr = mix(rr, vec2(max(rr.x, rr.y)), smoothstep(0.2, 0.6, uU));
  float e = length(d / rr);
  // its torn edge, ragged at every scale
  float rag = (anoise(ang, 1.6, 1.0) - 0.5) * 0.30 + (anoise(ang, 6.0, 5.0) - 0.5) * 0.12 + (anoise(ang, 24.0, 9.0) - 0.5) * 0.05;
  e *= 1.0 + rag * smoothstep(0.15, 0.35, uU);
  float edgePx = (e - 1.0) * max(rr.x, rr.y);                            // pixels outside the tear (negative inside)
  // inside: the deep, at first far down the hole, then rising up to fill it
  vec2 uvB = (uC + d / uZoom) / uRes;
  vec3 sea = texture(uB, clamp(uvB, 0.0, 1.0)).rgb;
  sea *= 1.0 - 0.55 * smoothstep(-12.0, 0.0, edgePx) * smoothstep(0.15, 0.3, uU);      // the paper's shadow on the water
  vec3 print_ = texture(uA, uv).rgb;
  // before it tears, the black water in the hole simply becomes water
  float seep = smoothstep(0.0, 0.18, uU);
  // the paper near the tear lifts a little (darker), and its torn edge shows white fibres
  float lift = smoothstep(40.0, 0.0, edgePx) * smoothstep(0.15, 0.4, uU);
  print_ *= 1.0 - 0.22 * lift;
  float fib = smoothstep(0.35, 0.8, vnoise(vec2(ang * 260.0, edgePx * 0.25))) * smoothstep(9.0, 0.0, edgePx) * step(0.0, edgePx);
  vec3 paper = vec3(0.95, 0.93, 0.87);
  print_ = mix(print_, paper, fib * smoothstep(0.15, 0.3, uU));
  float inside = (1.0 - smoothstep(-1.0, 1.0, edgePx)) * mix(seep, 1.0, step(0.18, uU));
  o = vec4(mix(print_, sea, inside), 1.0);
}`;
let tearP = null;
function tear() {
  if (tearP) return tearP;
  tearP = YL.makeProgram('tear', `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`, FS_TEAR);
  YL.checkProgram(tearP);
  return tearP;
}
let drainP = null;
function drain() {
  if (drainP) return drainP;
  drainP = YL.makeProgram('drain', `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`, FS_DRAIN);
  YL.checkProgram(drainP);
  return drainP;
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
  if (D.phase === 'cloud' && summer.ready) {
    const I = irisTargets(), gl = YL.gl, wood = YL.worlds.woodcut, aspect = YL.canvasAspect(), S = smooth;
    const u = clamp(D.pt / T_CLOUD, 0, 1);
    summer.update(dt, YL.DBG.still);
    summer.render(I.B, aspect);
    if (!wood.ready) wood.init();
    wood.show = [0, 0, 0]; wood.hero.mode = 'off'; wood.vol = 0.6 * S(0.55, 1.0, u);
    wood.update(dt); wood.render(I.A, aspect);
    const hp = D.drainHero = summer.project(summer.hero.p, aspect);
    const p = drain();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, I.w, I.h);
    gl.useProgram(p.p);
    YL.U(p, 'uRes', [I.w, I.h]); YL.U(p, 'uTime', realT);
    YL.U(p, 'uFog', S(0.0, 0.35, u)); YL.U(p, 'uCold', S(0.2, 0.62, u)); YL.U(p, 'uSnow', S(0.38, 0.7, u)); YL.U(p, 'uPaper', S(0.72, 1.0, u));
    YL.U(p, 'uHero', [hp[0], hp[1], 1]);
    YL.bindTex(p, 'uA', I.B.tex, 0); YL.bindTex(p, 'uB', I.A.tex, 1);
    YL.drawFull();
    return true;
  }
  if (D.phase === 'tear') {
    const I = irisTargets(), gl = YL.gl, wood = YL.worlds.woodcut, sea = YL.worlds.deepsea, aspect = YL.canvasAspect();
    const u = clamp(D.pt / T_TEAR, 0, 1);
    if (!sea.ready) sea.init();
    const hole = wood.holeOnScreen(aspect, I.h);
    if (!sea.hero.on) sea.arrive(hole.nx, hole.ny, aspect);                     // the light is down there, where it sank
    wood.update(dt); wood.render(I.A, aspect);
    sea.update(dt); sea.render(I.B, aspect);
    const p = tear();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, I.w, I.h);
    gl.useProgram(p.p);
    YL.U(p, 'uRes', [I.w, I.h]); YL.U(p, 'uC', [(hole.nx * 0.5 + 0.5) * I.w, (hole.ny * 0.5 + 0.5) * I.h]); YL.U(p, 'uR0', [hole.rx, hole.ry]);
    YL.U(p, 'uU', u); YL.U(p, 'uZoom', 0.35 + 0.65 * ease(clamp((u - 0.15) / 0.85, 0, 1)));
    YL.bindTex(p, 'uA', I.A.tex, 0); YL.bindTex(p, 'uB', I.B.tex, 1);
    YL.drawFull();
    return true;
  }
  if (D.phase === 'surface' && D.pt < 1.0) {
    const I = irisTargets();
    YL.roomTarget = I.A; D.flashFrame = { I, f: 1 - smooth(0.0, 1.0, D.pt) };
    return false;
  } else if (YL.roomTarget && D.phase !== 'dive') YL.roomTarget = null;
  if (D.world === 'room') return false;
  const w = YL.worlds && YL.worlds[D.world];
  if (!w) return false;
  if (!w.ready) w.init();
  if (D.placeHero && D.world === 'summer') { D.placeHero = false; D.placeLight(); }
  if (D.seaJump && D.world === 'deepsea') { D.seaJump = false; w.arrive(0, 0, YL.canvasAspect()); }
  if (D.jump && D.world === 'woodcut') {
    const { ph, pt } = D.jump; D.jump = null;
    w.arrive(0.1, 0.6, YL.canvasAspect());
    D.go(ph === 'leave' || ph === 'tear' ? 'woodcut' : ph);
    if (ph === 'print') { w.show = [0, 0, 0]; D.pt = pt; }
    else { w.show = [1, 1, 1]; w.vol = 1; w.hero.mode = 'home'; w.lanLight = 1; w.lit = w.litBase.slice(); w.lightsOn = true; D.pt = ph === 'leave' ? T_WOOD + 1 : pt; }
    if (ph === 'tear') { w.hero.mode = 'gone'; w.gone = true; w.lanLight = 0.12; D.go('tear'); D.pt = pt; YL.worlds.deepsea.init(); }
  }
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
  if (D.flashFrame) {
    // out of the tea: the warm flash fading off the room
    const { I, f } = D.flashFrame, gl = YL.gl; D.flashFrame = null;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, I.w, I.h);
    gl.useProgram(I.p.p);
    YL.U(I.p, 'uRes', [I.w, I.h]); YL.U(I.p, 'uC', [-10, -10]); YL.U(I.p, 'uR', 0); YL.U(I.p, 'uFlash', f);
    YL.bindTex(I.p, 'uA', I.A.tex, 0); YL.bindTex(I.p, 'uB', I.A.tex, 1);
    YL.drawFull();
    return;
  }
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
    const later = ['summer', 'updraft', 'cloud', 'print', 'woodcut', 'leave', 'tear', 'deepsea', 'rise', 'surface'];
    if (later.includes(ph)) {
      D.irisCenter = [0.1, 0.1]; D.enterSummer();
      if (ph === 'summer') D.pt = pt;
      else if (ph === 'updraft' || ph === 'cloud') { D.go(ph); D.pt = pt; }
      else {
        // straight into the print (once the GL context exists: see renderFrame)
        D.world = 'woodcut'; YL.roomVol = 0; D.jump = { ph, pt };
        if (ph === 'deepsea' || ph === 'rise') { D.world = 'deepsea'; D.jump = null; D.go(ph); D.pt = pt; D.seaJump = true; }
        if (ph === 'surface') { D.jump = null; YL.roomVol = 1; setTimeout(() => { D.surface(); D.pt = pt; YL.hero.t = pt; if (pt > T_SURF) D.go('home'); }, 0); }
      }
    }
    else { D.go(ph); D.pt = pt; }
  }
}
})();
