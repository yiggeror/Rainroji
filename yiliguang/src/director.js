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
   转场 · 灯笼里
     inlantern 镜头推进灯笼，直到只剩它透亮的纸；那张纸变成另一盏灯的纸
   走马灯·皮影
     shadow    一盏走马灯：烛火的热气推着纸轮转，骑马的人、跃起的鲤鱼、浪、渔船的影子在纸幕上奔跑
     snuff     烛火一缩，纸幕暗下去，影子的黑涌上来，只剩那一点火——它落进黑水里
   （旧的出口，只在调试里还能看到：leave 刻一条路走到冰窟窿，tear 纸从洞口撕开）
   第四幕 · 深海
     deepsea   只有它照亮的那一小团水是看得见的。手牵着它走；不动，黑暗里的小生命就过来看它；
               一会儿，黑暗里出现另一粒一模一样的光
   转场 · 墨
     inkbloom  黑水化开：像一滴墨落进清水，翻涌、散成丝，沉下来，沉成山
   水墨·烟雨山水
     ink       远山、中景、石壁和老松一笔一笔洇开；雾流过山腰，细雨；一点朱砂落在小舟上
     dawn      天边破晓：颜色从水墨里渗出来
   印象派·清晨睡莲池
     burst     颜色炸开：一万多笔从太阳那里往外铺开，成了一片清晨的睡莲池
     pond      全是笔触的水、天光、柳、睡莲；一粒光是水上第一点阳光
     dew       它停进一片叶子上的露珠里；露珠滚落——落进那杯茶
   （旧的出口，只在调试里还能看到：rise 往上浮到杯底）
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
let T_HOLD = 2.5, T_DAY = 4.5, T_DIVE = 2.6;
let T_SUMMER = 30, T_PAPER = 4.6, T_UP = 6.5, T_CLOUD = 6.0, T_PRINT = 4.8, T_WOOD = 50, T_ZOOM = 3.0, T_SHADOW = 36, T_SNUFF = 2.6, T_TEAR = 4.4, T_GREAT = 5, T_WHALE = 14, T_LURE = 28, T_SQUID = 41.3, T_SEA = 46, T_BLOOM = 4.5, T_INK = 30, T_DAWN = 4.0, T_BURST = 3.0, T_POND = 30, T_DEW = 3.0, T_RISE = 8, T_SURF = 4.5;
/* ---- 成片（?film）：没有人要等，每个世界只演最好的两三拍就走。观众的手也编好了：夏天里一阵风扫过、按住不动；
   深海里小鱼一齐受惊，然后鲸来了。 */
const FILM = QS.has('film');
// in the film it never stops on the way: one flowing curve from the bulb, through the tea's steam, round the spider
// plant's leaves, up to a drop on the glass
const FILM_ROUTE = Object.assign([
  { p: S.BULB },
  { p: [-0.50, 0.985, 0.27], travel: 0.6 },                 // out of the shade's open bottom
  { p: [-0.17, 0.925, 0.19], travel: 1.4 },                 // through the tea's steam
  { p: [0.03, 1.00, 0.15], travel: 0.8 },                   // over the desk
  { p: [0.25, 1.09, 0.05], travel: 1.0 },                   // in among the spider plant's leaves
  { p: [0.25, 1.30, -0.04], travel: 0.9 },                  // up the glass
  { p: [0.20, 1.42, -0.098], travel: 0.7 },                 // onto a drop
], { flow: true });
/* the film's camera in the room: one continuous move, keyed to where the light is (te: seconds since it jumped out;
   the film opens 3.4 s before that). It never cuts and never blends two shots: positions and aims run along
   Catmull-Rom curves through these keys, the lens eases between its keys, and the focus is always on the light. */
const ROOM_CAM = [
  { t: -3.4, pos: [0.30, 1.27, 1.80], tgt: [-0.16, 1.33, 0.00], vfov: 42 },   // the room, the lamp lit
  { t: 0.0, pos: [0.18, 1.24, 1.42], tgt: [-0.40, 1.14, 0.12], vfov: 38 },    // drawing in on the lamp as the light jumps out
  { t: 1.6, pos: [0.08, 1.16, 1.08], tgt: [-0.20, 0.98, 0.15], vfov: 37 },    // down with it over the tea
  { t: 3.3, pos: [0.33, 1.21, 0.94], tgt: [0.17, 1.10, 0.02], vfov: 33 },     // round to the spider plant
  { t: 5.4, pos: [0.23, 1.40, 0.55], tgt: [0.20, 1.42, -0.12], vfov: 28 },    // the window
  { t: 7.0, pos: [0.205, 1.42, 0.30], tgt: [0.20, 1.42, -0.12], vfov: 16 },   // in on the drop
  { t: 9.0, pos: [0.199, 1.42, 0.14], tgt: [0.20, 1.42, -0.12], vfov: 5 },    // into it: a long lens, not a crash into the light
];
function camPath(keys, t) {
  t = clamp(t, keys[0].t, keys[keys.length - 1].t);
  let k = 0; while (k < keys.length - 2 && t > keys[k + 1].t) k++;
  const A = keys[Math.max(k - 1, 0)], B = keys[k], C = keys[k + 1], E = keys[Math.min(k + 2, keys.length - 1)];
  const u = (t - B.t) / (C.t - B.t), u2 = u * u, u3 = u2 * u;
  // Catmull-Rom with the neighbours' tangents scaled to this segment's duration (smooth speed across keys)
  const sc1 = (C.t - B.t) / Math.max(C.t - A.t, 1e-6) * 2, sc2 = (C.t - B.t) / Math.max(E.t - B.t, 1e-6) * 2;
  const cr = (f) => [0, 1, 2].map(i => {
    const m1 = (C[f][i] - A[f][i]) * 0.5 * sc1, m2 = (E[f][i] - B[f][i]) * 0.5 * sc2;
    return (2 * u3 - 3 * u2 + 1) * B[f][i] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * C[f][i] + (u3 - u2) * m2;
  });
  const e = u * u * (3 - 2 * u);
  return { pos: cr('pos'), tgt: cr('tgt'), vfov: lerp(B.vfov, C.vfov, e) };
}
// ---- the village, the stage, the sea
const T_LANE = 10.0, T_PUSH = 12.6, T_PLAY = 9.0, T_DESC = 4.0;
const VIL_CAM = [
  { t: 5.0, pos: [3.6, 5.2, -33], tgt: [4.4, 3.3, -56], vfov: 30 },
  { t: 7.0, pos: [4.2, 4.8, -36.5], tgt: [4.5, 3.2, -56], vfov: 28 },
  { t: 8.6, pos: [4.4, 4.4, -39.5], tgt: [4.6, 3.15, -56], vfov: 26 },   // the square, over the crowd, the stage
  { t: 10.2, pos: [4.5, 3.7, -44.2], tgt: [4.55, 3.07, -56.26], vfov: 24.5 },
  { t: 12.6, pos: null, tgt: null, vfov: 24 },                           // (the end of the push: filled in below)
  { t: 13.6, pos: null, tgt: null, vfov: 24 },
];
{ const E = YL.worlds.village.CAM_END; for (const K of VIL_CAM) if (!K.pos) { K.pos = E.pos.slice(); K.tgt = E.tgt.slice(); } }
if (FILM) ({ T_HOLD, T_DAY, T_DIVE, T_SUMMER, T_PAPER, T_UP, T_CLOUD, T_PRINT, T_ZOOM, T_SHADOW, T_SNUFF, T_TEAR, T_GREAT, T_WHALE, T_SQUID, T_SEA, T_BLOOM, T_INK, T_DAWN, T_BURST, T_POND, T_DEW, T_RISE, T_SURF } =
  { T_HOLD: 0.0, T_DAY: 1.6, T_DIVE: 2.0, T_SUMMER: 7.6, T_PAPER: 6.2, T_UP: 3.2, T_CLOUD: 4.2, T_PRINT: 2.6, T_ZOOM: 2.6, T_SHADOW: 10.0, T_SNUFF: 2.2, T_TEAR: 3.2, T_GREAT: 3.3, T_WHALE: 9.4, T_SQUID: 15.8, T_SEA: 20.5, T_BLOOM: 5.2, T_INK: 9.0, T_DAWN: 3.2, T_BURST: 2.6, T_POND: 9.0, T_DEW: 2.8, T_RISE: 5.0, T_SURF: 3.0 });
const ease = x => x * x * (3 - 2 * x), easeIn = x => x * x * x;
// distance covered (0 … 1) at time x (0 … 1) when speeding up over the first a, steady, slowing over the last b
const trap = (x, a, b) => { const vm = 1 / (1 - a / 2 - b / 2);
  if (x < a) return vm * x * x / (2 * a);
  if (x < 1 - b) return vm * (a / 2 + (x - a));
  const y = 1 - x; return 1 - vm * y * y / (2 * b); };

// someone who has asked their system for less motion: the print stops 'boiling' between printings
YL.reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const D = YL.director = {
  phase: 'intro', t: 0, pt: 0, clock: 0, later: [],
  go(ph) { D.phase = ph; D.pt = 0; if (FILM) console.log('film ' + D.clock.toFixed(2) + ' ' + ph); },
  // do something a little later, by the film's own clock (the recorder runs far slower than real time)
  after(s, fn) { D.later.push({ at: D.clock + s, fn }); },
  escape() {
    if (D.phase !== 'intro') return;
    D.go('wander'); D.t = 0;
    HERO.on = true; HERO.glow = 0; YL.hero.glowTarget = 1;
    YL.hero.setRoute(FILM ? FILM_ROUTE : ROUTE);
    LIGHT.on = 0; LIGHT.dip = 0;
    YL.AUDIO.click && YL.AUDIO.click(0);
    D.after(0.35, () => YL.AUDIO.motif && YL.AUDIO.motif(-0.4));
  },
  // the window shot (and where the dive goes)
  winShot(aspect) {
    const portrait = aspect < 0.9;
    return { pos: portrait ? [0.16, 1.38, 0.72] : [0.12, 1.41, 0.62], tgt: [0.20, 1.42, S.GLASS_Z], vfov: portrait ? 44 : 30 };
  },
  update(dt, realT) {
    D.t += dt; D.pt += dt; D.clock += dt;
    for (const e of D.later.filter(e => e.at <= D.clock)) { D.later.splice(D.later.indexOf(e), 1); e.fn(); }
    if (FILM) D.fade(dt);
    const summer = YL.worlds.summer;
    if (D.phase === 'intro') {
      // it wants out: two little flickers of the lamp, then it goes by itself (in the film, almost at once)
      const t = D.t + (FILM ? 6.6 : 0);
      LIGHT.dip = 0.55 * (smooth(7.4, 7.5, t) - smooth(7.6, 7.75, t)) + 0.35 * (smooth(8.3, 8.36, t) - smooth(8.45, 8.6, t));
      if (t > 10) D.escape();
      YL.cam = FILM ? D.roomCam(D.phase === 'intro' ? D.t - 3.4 : D.t) : null;      // (it may have just jumped out)
      return;
    }
    if (D.phase === 'village' || D.phase === 'stage' || D.phase === 'fall' || D.phase === 'water') { D.lineage(dt); return; }
    if (D.phase === 'summer' || D.phase === 'updraft' || D.phase === 'cloud' || D.phase === 'paper') { D.toPrint(dt); return; }
    if (D.phase === 'print' || D.phase === 'woodcut' || D.phase === 'inlantern' || D.phase === 'spark' || D.phase === 'leave') { D.inPrint(dt); return; }
    if (D.phase === 'shadow' || D.phase === 'snuff' || D.phase === 'drop') { D.inShadow(dt); return; }
    if (D.phase === 'inkbloom' || D.phase === 'ink' || D.phase === 'dawn') { D.inInk(dt); return; }
    if (D.phase === 'burst' || D.phase === 'pond' || D.phase === 'dew') { D.inPond(dt); return; }
    if (D.phase === 'tear' || D.phase === 'deepsea' || D.phase === 'rise') { D.inSea(dt); return; }
    if (D.phase === 'surface' || D.phase === 'home' || D.phase === 'end') { D.inRoom(dt, realT); return; }
    YL.hero.update(dt, realT);
    const L = YL.hero.routeLength(), Tw = L - (FILM ? 2.4 : 2.0), Tww = FILM ? 2.8 : 3.5;
    if (D.phase === 'wander' && D.t > L) D.go('window');
    if (D.phase === 'window' && D.pt > 0.2 && !summer.ready) summer.init();                 // compile the next world early
    if (D.phase === 'window' && D.pt > T_HOLD) D.go('daydrops');
    if (D.phase === 'daydrops' && D.pt > T_DAY) D.go('dive');
    if (D.phase === 'dive' && D.pt > T_DIVE) { D.enterSummer(); return; }
    // ---- the shot
    if (FILM) { YL.cam = D.roomCam(D.t); D.dayDrops(); return; }
    const aspect = YL.canvasAspect();
    const base = YL.framing(aspect), h = HERO.p;
    const follow = { pos: V.add(base.pos, V.mul(V.sub(h, base.tgt), 0.12)), tgt: base.tgt.map((v, i) => lerp(v, h[i], 0.45)), vfov: base.vfov * 0.92 };
    const win = D.winShot(aspect);
    const ww = D.phase === 'wander' ? smooth(Tw, Tw + Tww, D.t) : 1;
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
    D.dayDrops();
  },
  // the film's room camera at te (see ROOM_CAM); it leans a little toward the light while it flies, focused on it
  roomCam(te) {
    const c = camPath(ROOM_CAM, te), h = HERO.on ? HERO.p : S.BULB;
    const lean = 0.30 * smooth(-0.5, 0.8, te) * (1 - smooth(4.6, 6.0, te));
    const tgt = c.tgt.map((v, i) => lerp(v, h[i], lean));
    const fwd = V.norm(V.sub(tgt, c.pos));
    return { pos: c.pos, tgt, vfov: c.vfov, focus: Math.max(V.dot(V.sub(h, c.pos), fwd), 0.05), w: 1 };
  },
  dayDrops() {
    const summer = YL.worlds.summer;
    // (in the film the light sinks into its drop as the eye goes in, so its glow doesn't fill the lens)
    if (FILM) YL.hero.glowTarget = D.phase === 'daydrops' ? 1 - 0.65 * clamp(D.pt / T_DAY, 0, 1) : D.phase === 'dive' ? 0.35 - 0.30 * clamp(D.pt / (T_DIVE * 0.6), 0, 1) : 1;
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
    D.after(0.4, () => YL.AUDIO.motif && YL.AUDIO.motif(0, 0.05, 1));
  },
  /* ---- the film's own hand. In the summer: one sweep across the field (a gust: the grass goes down in a wave and the
     light is blown along), then a press held still (the wind drops and the cicadas swell). */
  filmHand(world, t) {
    const set = (nx, ny, speed, down) => { YL.ptr = { nx, ny, t: YL.now(), speed }; YL.ptrDown = down; };
    if (world === 'summer') {
      const a = [-0.85, -0.40], b = [0.80, -0.05], t0 = 1.4, t1 = 2.2;
      if (t > t0 && t < t1) { const u = ease((t - t0) / (t1 - t0)); set(lerp(a[0], b[0], u), lerp(a[1], b[1], u), 2.6, true); }
      else if (t >= t1 && t < t1 + 0.1) YL.ptrDown = false;
      else if (t > 3.3 && t < 6.6) { if (!YL.ptrDown) set(0.15, -0.15, 0, true); }
      else if (t >= 6.6 && YL.ptrDown) YL.ptrDown = false;
    }
  },
  // the film opens out of black and closes into it
  fade(dt) {
    let el = D.fadeEl;
    if (!el) { el = D.fadeEl = document.createElement('div'); el.style.cssText = 'position:fixed;inset:0;background:#000;pointer-events:none;z-index:50'; document.body.appendChild(el); }
    const a = Math.max(1 - smooth(0.2, 1.6, D.clock), D.phase === 'end' ? smooth(4.0, 6.0, D.pt) : 0);
    el.style.opacity = a.toFixed(3);
    if (D.phase === 'end' && D.pt > 6.5) D.filmDone = true;
  },
  /* ---- the snowy village, the stage, the sea: one unbroken shot.
     village  the light, come in through the paper, flies down the lane, lighting each string of lanterns it passes; over
              the crowd waiting in the square it goes into the screen of the stage, and the screen lights from there.
              The eye goes after it, through the crowd, until the screen is the whole picture.
     stage    on the screen, the shadow play: the light is the lamp behind it, its bright spot the pearl a dragon chases.
     fall     the pearl drops into the waves; below the wave line it is the sea (both drawn every frame); the eye goes
              down with it until the stage is gone above.
     water    the watercolour sea: down through the light; a humpback comes and looks at it; a squid's ink. */
  lineage(dt) {
    const vil = YL.worlds.village, stg = YL.worlds.stage, sea = YL.worlds.sea;
    if (D.phase === 'village') {
      const t = D.pt;
      if (!vil.ready) vil.init();
      if (!stg.ready) stg.init();
      // the light: along its way, slowing as it comes to the screen; it lights the lanterns it passes
      const sm = vil.arc().L * trap(clamp((t - 0.8) / (T_LANE - 0.8), 0, 1), 0.14, 0.32);
      vil.hero.p = vil.pathAtS(sm);
      D.vilS = sm;
      vil.hero.b = 1 - smooth(T_LANE - 0.25, T_LANE + 0.05, t);
      if (t > 0.8) vil.lightNear(vil.hero.p, vil.t);
      // it goes into the screen: the lamp behind catches where it touched
      if (t > T_LANE - 0.05 && !D.stageOn) {
        D.stageOn = true; stg.reset();
        const sc = vil.SCR, hp = vil.pathAt(1);
        stg.enterAt = [(hp[0] - sc.c[0]) / sc.hw * 1.6, (hp[1] - sc.c[1]) / sc.hh * 0.9];
      }
      if (D.stageOn) {
        const a = t - (T_LANE - 0.05);
        stg.light = smooth(0, 0.9, a) * (0.85 + 0.15 * Math.sin(a * 23) * (1 - smooth(0.3, 1.0, a)));
        vil.lit = smooth(0, 0.9, a);
        stg.view = [0, 0, 0.9 / vil.OVER];
        stg.vol = 1;
      } else stg.vol = 0;
      // the eye: down from the whole village, after the light along the lane, to the square, and through the crowd into the screen
      vil.cam = D.villageCam(t, vil);
      // the snow and the printing thin out as the eye comes right up to the screen
      const kEnd = smooth(T_PUSH - 2.2, T_PUSH, t);
      vil.snowAmt = 1 - kEnd; vil.pure = 1 - kEnd;
      vil.vol = 1 - 0.8 * kEnd;
      if (t >= T_PUSH) { D.go('stage'); D.world = 'stage'; vil.vol = 0; stg.vol = 1; }
      return;
    }
    if (D.phase === 'stage') {
      stg.view = [0, 0, 0.9 / vil.OVER];
      if (stg.t > T_PLAY && !stg.drop) stg.startDrop();
      if (stg.drop && stg.lamp[1] < stg.WATER - 0.02) { D.go('fall'); if (!sea.ready) sea.init(); D.fallV = null; }
      return;
    }
    if (D.phase === 'fall' || D.phase === 'water') {
      // one descent, from the moment the pearl goes into the water: the eye goes down (sea units: a picture's height),
      // quickly at first, slowing to where the whale comes, a little faster again for the squid
      const vz = 0.9 / vil.OVER, k = 1 / (2 * vz);
      if (D.tau === undefined) { D.tau = 0; D.camY = (0 - stg.WATER) * k; D.fallP = { y: (stg.lamp[1] - stg.WATER) * k, x: stg.lamp[0] * k, v: -0.6 }; }
      D.tau += dt; const tau = D.tau;
      const v = 0.55 * smooth(0, 1.5, tau) - 0.43 * smooth(3.5, 8.0, tau) + 0.16 * smooth(13.5, 15.5, tau);
      D.camY -= v * dt;
      const P = D.fallP;
      // the pearl: it slows from the speed it came in at, and settles a little above the middle of the picture
      P.v += (-0.10 - P.v) * (1 - Math.exp(-dt * 1.6)); P.y += P.v * dt;
      const want = [0.05 + 0.04 * Math.sin(tau * 0.5), D.camY + 0.06 + 0.02 * Math.sin(tau * 0.8)];
      const hold = smooth(0.6, 3.5, tau);
      P.x += (want[0] - P.x) * (1 - Math.exp(-dt * 0.9)) * hold; P.y += (want[1] - P.y) * (1 - Math.exp(-dt * 0.9)) * hold;
      sea.pearl = [P.x, P.y]; sea.zoom = 1;
      let cam = [0, D.camY];
      if (D.phase === 'fall') {
        stg.view = [0, D.camY / k + stg.WATER, vz];
        stg.lampOverride = [P.x / k, P.y / k + stg.WATER];
        stg.light = 0.40 + 0.60 * Math.exp(-Math.max(0, -P.y) * 2.5);        // (the screen keeps some of its glow as the pearl goes down)
        sea.vol = smooth(0, 1.5, tau); stg.vol = 1 - smooth(0.5, 2.5, tau);
        if (D.camY < -0.56) { D.go('water'); D.world = 'sea'; stg.vol = 0; sea.vol = 1; }
      }
      // ---- the whale: in from the right, slowing, until its eye is beside the pearl; it looks; it blinks; it goes on
      const tw = tau - 2.5;
      const L = 1.6, eyeOff = (0.245 - 0.5) * L;
      const arrive = smooth(1.0, 6.5, tw), leave = smooth(9.0, 13.0, tw);
      const eyeX = P.x + 0.075, wx = lerp(eyeX - eyeOff + 2.4, eyeX - eyeOff, arrive) - 2.6 * leave * leave;
      const wy = P.y + 0.024 * L + 0.005 + 0.02 * Math.sin(tw * 0.4);
      sea.whale = [wx, wy, tw > 0.5 ? L : 0, -0.03 + 0.04 * Math.sin(tw * 0.3)];
      const look = smooth(6.0, 7.5, tw) * (1 - smooth(9.2, 10.6, tw));
      sea.whaleB = [1 - 0.95 * Math.exp(-Math.pow((tw - 8.1) / 0.12, 2)), 0, look, 0];
      const eyeW = [wx + eyeOff, wy - 0.024 * L];
      const mid = [eyeW[0] + (P.x - eyeW[0]) * 0.35, eyeW[1] + (P.y - eyeW[1]) * 0.35];
      sea.zoom = 1 / lerp(1, 1 / 0.075, look * look * (3 - 2 * look));
      cam = [lerp(cam[0], mid[0], look), lerp(cam[1], mid[1], look)];
      sea.cam = cam;
      // ---- the squid: up out of the deep, startled; it jets off and leaves its ink, which blooms over everything
      const sq = tw - 11.0;
      if (sq > 0) {
        const jet = smooth(1.4, 1.7, sq);
        const sx = 0.55 - 0.15 * sq - 1.6 * smooth(1.5, 2.6, sq), sy = D.camY - 0.55 + 0.12 * sq + 0.5 * smooth(1.5, 2.6, sq);
        sea.squid = [sx, sy, 0.30, 2.6 + 0.5 * smooth(1.4, 1.8, sq)]; sea.squidB = [smooth(0, 0.6, sq) * (1 - smooth(2.4, 2.9, sq)), jet, 0, 0];
        if (sq > 1.55 && !D.inkAt) D.inkAt = [sx + 0.10, sy - 0.05];
        if (D.inkAt) { const a2 = sq - 1.55; sea.ink = [D.inkAt[0], D.inkAt[1], 0.02 + a2 * 0.75, smooth(2.2, 4.2, a2)];
          // all ink now: it thins on the paper, and the pearl in it is a point of vermilion
          if (a2 > 4.3 && D.phase === 'water') {
            const ink = YL.worlds.ink; if (!ink.ready) ink.init();
            const aspect = YL.canvasAspect(), n = sea.toNdc(sea.pearl, aspect), Pp = ink.toPaint(n[0], n[1], aspect);
            ink.arrive(Pp[0], Pp[1]); ink.bloom = 1; ink.dawn = 0; ink.grow = [0, 0, 0, 0]; ink.vol = 0;
            D.go('inkbloom');
          }
        }
      }
      return;
    }
  },
  villageCam(t, vil) {
    const V = YL.V, A = vil.arc(), sm = D.vilS || 0;
    // following: some way behind it along the lane, a little above and to the right, looking ahead of it
    const back = vil.pathAtS(sm - 10), ahead = vil.pathAtS(sm + 14), here = vil.pathAtS(sm);
    const fwd = V.norm(V.sub(vil.pathAtS(sm + 2), vil.pathAtS(sm - 2)));
    const right = V.norm(V.cross(fwd, [0, 1, 0]));
    const follow = { pos: V.add(V.add(back, [0, 2.4, 0]), V.mul(right, 1.4)), tgt: V.add(ahead, [0, -0.9, 0]), vfov: 32 };
    const C0 = vil.CAM0V, rail = camPath(VIL_CAM, t);
    const kIn = smooth(0.9, 3.4, t), kOut = smooth(T_LANE - 3.6, T_LANE - 1.2, t);
    const mix3 = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));
    let pos = mix3(C0.pos, follow.pos, kIn), tgt = mix3(C0.tgt, follow.tgt, kIn), vfov = lerp(C0.vfov, follow.vfov, kIn);
    pos = mix3(pos, rail.pos, kOut); tgt = mix3(tgt, rail.tgt, kOut); vfov = lerp(vfov, rail.vfov, kOut);
    return { pos, tgt, vfov };
  },
  // ---- out of the summer: up into the cloud, and through it into the print
  toPrint(dt) {
    const summer = YL.worlds.summer, wood = YL.worlds.woodcut, H = summer.hero;
    if (D.phase === 'summer') { if (FILM) summer.speed = 1.1; if (FILM) D.filmHand('summer', D.pt); if (D.pt > T_SUMMER) { YL.ptrDown = false; D.go('paper'); summer.startSheet(); } return; }
    // ---- a sheet of paper comes blowing over the grass. On it, faded, asleep, the snowy village is already printed. The light
    //      goes after it and into it, through its face: what has gone through is a flame in the print. The print wakes
    //      from there; the eye closes in until the sheet is the whole picture, and then it is
    if (D.phase === 'paper') {
      // A sheet of paper comes blowing over the grass and settles on the grass tops ahead. On it, printed in black only,
      // the snowy village. The light goes to it; its warmth falls on the paper; it sinks in, and what has gone through is
      // a flame in the print. The colour goes on from there, block by block, outward. The eye comes down to the sheet and
      // turns square to it until it is the whole picture: and the picture is the village itself, already alive.
      const u = D.pt, V = YL.V, vil = YL.worlds.village;
      if (!vil.ready) vil.init();
      summer.speed = 1.1 * (1 - smooth(0, 1.6, u));
      const sh = summer.sheetAt(), Rs = sh.rest;
      // where on the sheet the light goes in: where the village's light starts, as the sheet's picture shows it
      const q = vil.project(vil.ENTRY, 16 / 9, vil.CAM0);
      const X = V.mul(Rs.X, 0.24), Y = V.mul(Rs.Y, 0.135);
      const entryW = V.add(Rs.c, V.add(V.mul(X, q[0]), V.mul(Y, q[1])));
      // the light: up and over to a little above that place on the sheet; it hangs there, its warmth on the paper; then
      // straight down onto the paper, and through it
      const H = summer.hero, start = D.paperH0 || (D.paperH0 = H.p.slice());
      const high = V.add(entryW, V.add(V.mul(Rs.N, 0.34), [0, 0.10, 0])), touch = V.add(entryW, V.mul(Rs.N, 0.015)), through = V.sub(entryW, V.mul(Rs.N, 0.035));
      const arcTop = V.add(V.mul(V.add(start, high), 0.5), [0, 0.12, 0]);
      const k1 = smooth(0.3, 2.3, u);
      const qb = V.add(V.add(V.mul(start, (1 - k1) * (1 - k1)), V.mul(arcTop, 2 * k1 * (1 - k1))), V.mul(high, k1 * k1));
      const hover = V.add(qb, [0.012 * Math.sin(u * 2.3), 0.010 * Math.sin(u * 3.1), 0]);
      const k2 = smooth(2.9, 3.55, u), k3 = smooth(3.55, 4.0, u);
      H.fly = V.add(V.mul(V.add(V.mul(hover, 1 - k2), V.mul(touch, k2)), 1 - k3), V.mul(through, k3));
      H.flyK = 2 + 22 * smooth(0.2, 1.2, u);
      summer.heroK = 1 - smooth(3.85, 4.15, u);
      // the eye: comes down over the sheet, looking at where the light is going, then turns square to it as it closes in
      const dEnd = 0.135 / vil.PAPER_OVER / Math.tan(20 * Math.PI / 180);
      const E0 = D.paperE0 || (D.paperE0 = summer.eyeAt(summer.t));
      const pEnd = V.add(Rs.c, V.mul(Rs.N, dEnd)), pMid = V.add(Rs.c, V.add(V.mul(Rs.N, 0.75), V.mul(V.sub(E0, Rs.c), 0.30)));
      const s_ = trap(clamp((u - 1.0) / 3.8, 0, 1), 0.30, 0.35);
      const bz = (a0, m, c0, w) => V.add(V.add(V.mul(a0, (1 - w) * (1 - w)), V.mul(m, 2 * w * (1 - w))), V.mul(c0, w * w));
      const eye = bz(E0, pMid, pEnd, s_);
      const look = V.add(V.mul(entryW, 1 - smooth(3.7, 4.8, u)), V.mul(Rs.c, smooth(3.7, 4.8, u)));
      const fwd = V.norm(V.sub(look, eye));
      const upK = smooth(3.0, 4.8, u);
      summer.camOv = { k: smooth(0.8, 2.0, u), eye, fwd, up: V.norm(V.add(V.mul([0, 1, 0], 1 - upK), V.mul(Rs.Y, upK))), vfov: lerp(52, 40, smooth(1.0, 4.8, u)) };
      summer.look = null; summer.zoom = 0;
      summer.sheetFlat = smooth(4.0, 5.0, u);
      summer.sheetGlow = [0, 0, 0, 0.1];
      // in the print: the flame where it went in, then the colour going on from there
      vil.cam = vil.CAM0; vil.hero.p = vil.ENTRY.slice();
      vil.hero.b = smooth(3.55, 4.0, u);
      vil.wake = { p: vil.ENTRY, r: u < 3.65 ? 0 : 2.4 * Math.pow(smooth(3.65, T_PAPER, u), 1.2) };
      vil.snowAmt = 1; vil.pure = 1; vil.lit = 0;
      summer.vol = 1 - smooth(3.9, T_PAPER, u); vil.vol = smooth(3.9, T_PAPER, u);
      if (D.pt > T_PAPER) {
        D.go('village'); D.world = 'village'; summer.vol = 0; vil.vol = 1; vil.wake = null; summer.camOv = null;
      }
      return;
    }
    if (D.phase === 'updraft') {
      const u = clamp(D.pt / T_UP, 0, 1);
      summer.lift = ease(clamp(D.pt / (T_UP * 0.8), 0, 1));
      summer.zoom = 0.35 * easeIn(u);
      const dist = 2.4 * Math.exp(u * Math.log(30 / 2.4));
      H.fly = V.add(summer.eyeAt(summer.t), V.mul(dir, dist));
      summer.speed = 1.1 * (1 - smooth(0, 0.6, u));                                 // the eye slows as it turns up to follow
      if (u > 0.5 && !wood.ready) wood.init();                                   // cut the blocks while it's still bright
      if (D.pt > T_UP) D.go('cloud');
    } else {
      const u = clamp(D.pt / T_CLOUD, 0, 1);
      summer.lift = 1; summer.zoom = 0.35 + 0.6 * ease(clamp(u / 0.6, 0, 1));
      H.fly = V.add(summer.eyeAt(summer.t), V.mul(dir, 30 + 40 * u));
      summer.speed = 0;
      summer.vol = 1 - ease(clamp((u - 0.2) / 0.7, 0, 1));
      if (D.pt > T_CLOUD) {
        D.go('print'); D.world = 'woodcut'; if (FILM) { wood.pace = 1.7; wood.panX = 0.80; }
        const hp = D.drainHero || [0, 0.5];
        wood.show = [0, 0, 0]; wood.vol = 0;
        wood.arrive(hp[0], hp[1], YL.canvasAspect());
      }
    }
  },
  // ---- in the print: the blocks go on one after another; later, the way out
  inPrint(dt) {
    const wood = YL.worlds.woodcut;
    if (D.phase === 'print' && (wood.paintK > 0 || wood.hero.mode === 'paint')) {
      // the light is printing the sheet; the vermilion goes on once it is home in the lantern
      const H = wood.hero;
      if ((H.mode === 'enter' || H.mode === 'home') && D.rOn === undefined) D.rOn = D.pt;
      wood.show = [1, 1, D.rOn !== undefined ? ease(clamp((D.pt - D.rOn) / 0.7, 0, 1)) : 0];
      wood.vol = ease(clamp(D.pt / 1.5, 0, 1));
      if (H.mode === 'home' && D.rOn !== undefined && D.pt - D.rOn > 0.8) { wood.show = [1, 1, 1]; D.go('woodcut'); }
    } else if (D.phase === 'print') {
      const t = D.pt;
      const k = T_PRINT / 4.8;
      wood.show = [ease(clamp(t / (1.6 * k), 0, 1)), ease(clamp((t - 1.3 * k) / (1.6 * k), 0, 1)), ease(clamp((t - 2.7 * k) / (1.3 * k), 0, 1))];
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
      // nobody has cut anything: it shows how, carving a new moon into the night (in the film, as soon as it is home)
      // in the film it first goes from eave to eave lighting the village's little lanterns, then carves the moon
      if (FILM && !wood.villageDone && wood.hero.mode === 'home' && D.pt > 0.3) wood.lightVillage();
      if (D.pt > (FILM ? 0.6 : 20) && !wood.userCut && !wood.moonDone && wood.hero.mode === 'home' && (!FILM || wood.villageDone)) wood.carveMoon();
      const done = FILM ? wood.moonDone && !wood.queue.length && wood.hero.mode === 'home' && D.pt > 5 : D.pt > T_WOOD;
      // the way on: the lantern sends a spark of its light along the village, into the dark revolving lantern at its end
      if (done && wood.hero.mode === 'home') { D.go('spark'); D.sparkIn = undefined; wood.sendSpark(); const sh = YL.worlds.shadow; if (!sh.ready) sh.init(); }
    } else if (D.phase === 'spark') {
      // inside it the candle catches and its light spreads; the shadows come; then the eye goes into its paper, and is there
      const sh = YL.worlds.shadow;
      wood.whole = true;
      if (wood.hero.mode === 'inzm' && D.sparkIn === undefined) { D.sparkIn = D.pt; sh.t = 0.55; sh.light = 1; sh.sink = 0; sh.slow = 0; sh.vol = 0; sh.fade = 1; }
      if (D.sparkIn !== undefined) {
        const a = D.pt - D.sparkIn;
        sh.vol = smooth(0.2, 1.6, a); wood.vol = 1 - smooth(1.2, 3.6, a);
        wood.zoomTo = { c: wood.zm.c, h: 2 * wood.zm.hw * 9 / 16 }; wood.zoomIn = clamp((a - 1.9) / T_ZOOM, 0, 1);
        if (a > 1.9 + T_ZOOM) { D.go('shadow'); D.world = 'shadow'; wood.vol = 0; sh.vol = 1; wood.zoomIn = 0; wood.zoomTo = null; }
      }
    } else if (D.phase === 'inlantern') {
      const u = clamp(D.pt / T_ZOOM, 0, 1), sh = YL.worlds.shadow;
      wood.zoomIn = u; wood.whole = true;
      wood.vol = 1 - smooth(0.5, 1.0, u);
      if (D.pt > T_ZOOM) { D.go('shadow'); D.world = 'shadow'; wood.vol = 0; sh.vol = 1; sh.pull = 0.55; sh.light = 1; }
    } else if (D.phase === 'leave') {
      const sea = YL.worlds.deepsea;
      if (!sea.ready) sea.init();                                                // ready the water while it walks
      if (wood.gone) { D.go('tear'); D.tearSound(); }
    }
  },
  // ---- inside the lantern of shadows; then the candle shrinks to nothing, and there is only the black water
  inShadow(dt) {
    const sh = YL.worlds.shadow, sea = YL.worlds.deepsea;
    if (D.phase === 'shadow') {
      sh.pull = 0.55 + 0.45 * smooth(2.0, 5.2, sh.t);                           // in the dark close to the flame; back as its light spreads
      if (D.pt > T_SHADOW) { D.go('drop'); if (!sea.ready) sea.init(); }
    } else if (D.phase === 'drop') {
      // the flame sends off a spark of itself (it stays lit); it falls into the river, and the river opens: under its surface
      // is the deep. The eye goes down after it, into the water, and is there
      const a = D.pt, aspect = YL.canvasAspect();
      if (!sh.spark) sh.sendSpark();
      sh.pull = 1; sh.win = smooth(0.25, 0.75, a); sh.diveK = smooth(0.8, 2.7, a);
      const scr = sh.sparkScreen();
      if (scr && sea.ready) { const p = sea.unproject(scr[0], scr[1], 1.4, aspect); sea.hero.on = true; sea.hero.p = p.slice(); sea.hero.hold = p; sea.hero.v = [0, 0, 0]; }
      sea.light = smooth(0.45, 0.80, a); sea.fade = 1;
      sh.vol = 1 - smooth(1.4, 2.9, a); sea.vol = smooth(0.4, 2.0, a);
      if (a > 2.9) { D.go('deepsea'); D.world = 'deepsea'; sea.hero.hold = null; sea.light = 1; sh.vol = 0; sea.vol = 1; }
    } else if (D.phase === 'snuff') {
      const u = clamp(D.pt / T_SNUFF, 0, 1);
      // the candle gutters: the flame sinks and shrinks, so every shadow stretches up and swells over the paper; then it dies
      sh.sink = Math.pow(u, 1.4);
      sh.light = Math.pow(1 - u, 1.8) * (1 - 0.3 * u);
      sh.vol = 1 - u;
      if (D.pt > T_SNUFF) {
        // the deep, with the light just where the flame was on the screen
        const aspect = YL.canvasAspect(), c = sh.cam, f = sh.flame(sh.t).p, v = YL.V.sub(f, c.eye), z = YL.V.dot(v, c.fwd);
        sea.arrive(YL.V.dot(v, c.right) / (z * c.tan[0]), YL.V.dot(v, c.up) / (z * c.tan[1]), aspect);
        sea.fade = 0.6; sea.vol = 1;                                           // (not from black: the light carries straight on)
        D.go('deepsea'); D.world = 'deepsea';
      }
    }
  },
  // ---- through the ice: the print tears open onto the deep, and then there is only the deep
  inSea(dt) {
    const sea = YL.worlds.deepsea, wood = YL.worlds.woodcut;
    if (!sea.ready) return;                                                      // (a jump straight here: wait for the world to exist)
    if (D.phase === 'tear') {
      const u = clamp(D.pt / T_TEAR, 0, 1);
      wood.vol = 1 - ease(clamp(u / 0.6, 0, 1)); sea.vol = ease(clamp((u - 0.2) / 0.8, 0, 1));
      if (D.pt > T_TEAR) { D.go('deepsea'); D.world = 'deepsea'; sea.vol = 1; }
    } else if (D.phase === 'deepsea') {
      sea.fade = Math.min(1, (sea.fade ?? 1) + dt / 1.2);
      // the small lives come to look; then all at once they flash and scatter: something big is coming. The whole whale
      // goes by, a little way behind the light; then it comes back, close, to look at it
      if (FILM && D.pt > T_GREAT - 0.3 && !D.scared) { D.scared = true; sea.scare(); }
      const onlySquid = YL.QS.has('sqtest');                                      // (debug: just the squid)
      if (D.pt > T_GREAT && !sea.great && !onlySquid) sea.startGreat();
      if (D.pt > T_WHALE && !sea.pass && sea.lure.state === 'off' && !onlySquid) sea.startWhale(FILM ? 9.5 : 9.0, FILM ? 1.4 : 1);
      if (!FILM && D.pt > T_LURE && sea.lure.state === 'off' && (!sea.pass || sea.t - sea.pass.t0 > 12)) sea.startLure();
      // a squid comes at the light, takes fright, squirts its ink; the light sends a spark into the ink
      if (D.pt > T_SQUID && !sea.sq && sea.lure.state === 'off') sea.startSquid();
      if (D.pt > T_SEA && !['approach', 'reveal', 'snap'].includes(sea.lure.state)) {
        // there is nothing but the ink now; it thins on paper, and the spark in it is a point of vermilion
        sea.hero.hold = null;
        const ink = YL.worlds.ink; if (!ink.ready) ink.init();
        const SQ = sea.squidState(), at = SQ && SQ.spark ? SQ.spark.p : sea.hero.p;
        const c = sea.cam, v = YL.V.sub(at, c.eye), z = Math.max(YL.V.dot(v, c.fwd), 0.05), aspect = YL.canvasAspect();
        const P = ink.toPaint(YL.V.dot(v, c.right) / (z * c.tan[0]), YL.V.dot(v, c.up) / (z * c.tan[1]), aspect);
        ink.arrive(P[0], P[1]); ink.bloom = 1; ink.dawn = 0; ink.grow = [0, 0, 0, 0]; ink.vol = 0;
        D.go('inkbloom');
      }
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
  // ---- ink: the deep's black breaking up into it, the painting laying itself down, then the dawn
  inInk(dt) {
    const ink = YL.worlds.ink, sea = YL.worlds.sea;
    const G = (a, b, x) => smooth(a, b, x);
    if (D.phase === 'inkbloom') {
      const u = clamp(D.pt / T_BLOOM, 0, 1);
      ink.bloom = 0.80 * (1 - smooth(0.18, 1.0, u)) + 0.20 * (1 - smooth(0.0, 0.14, u));
      ink.grow = [G(0.35, 0.85, u), G(0.55, 1.0, u), 0, 0];
      ink.vol = smooth(0.1, 0.8, u); sea.vol = 1 - smooth(0.0, 0.3, u);
      // out of the settling ink the light sets off as the brush, and paints the scroll as it goes
      if (D.pt > 1.2 && !ink.painting && ink.now === 0) ink.startPaint();
      if (D.pt > T_BLOOM) { D.go('ink'); D.world = 'ink'; ink.bloom = 0; sea.vol = 0; }
    } else if (D.phase === 'ink') {
      const t = D.pt;
      ink.grow = [1, 1, 1, 1]; void t;
      if (D.pt > T_INK && !ink.painting) D.go('dawn');
    } else if (D.phase === 'dawn') {
      ink.dawn = smooth(0, T_DAWN, D.pt);
      ink.sunK = smooth(0.2, T_DAWN, D.pt);                                     // the light goes up and becomes the sun
      if (D.pt > T_DAWN) {
        const pond = YL.worlds.pond; if (!pond.ready) pond.init();
        const aspect = YL.canvasAspect(), H = ink.sunP || ink.hero.p;                // (the pond's light is the spark that became the sun)
        const nx = ((H[0] - (1.7778 - aspect) * 0.5 - (ink.pan ? ink.pan[0] : 0)) / aspect) * 2 - 1, ny = H[1] * 2 - 1;
        pond.arrive(...pond.toPaint(nx, ny, aspect)); pond.reveal = 0; pond.dew = 0; pond.drop = 0; pond.white = 0; pond.vol = 0;
        pond.burstAt = pond.hero.p.slice();                                      // (the colour bursts out from the light, now the sun)
        D.go('burst');
      }
    }
  },
  // ---- the pond: bursting out of the dawn; then the light into a dewdrop, and the drop into the tea
  inPond(dt) {
    const pond = YL.worlds.pond, ink = YL.worlds.ink;
    if (D.phase === 'burst') {
      const u = clamp(D.pt / T_BURST, 0, 1);
      pond.reveal = smooth(0.15, 1.0, u); pond.vol = smooth(0.0, 0.8, u); ink.vol = 1 - smooth(0.0, 0.5, u);
      if (D.pt > T_BURST) { D.go('pond'); D.world = 'pond'; pond.reveal = 1; ink.vol = 0; }
    } else if (D.phase === 'pond') {
      if (D.pt > T_POND) D.go('dew');
    } else if (D.phase === 'dew') {
      const t = D.pt;
      pond.dew = smooth(0.0, 1.2, t);
      pond.drop = smooth(1.7, 2.5, t);
      pond.white = smooth(2.3, T_DEW, t);
      if (t > 1.7 && !D.dropSound) { D.dropSound = true; pond.plip && pond.plip(0.14); }
      if (D.pt > T_DEW) { D.dropSound = false; pond.vol = 0; D.surface(); }
    }
  },
  // ---- back in the room: out of the tea, home to the lamp
  surface() {
    const sea = YL.worlds.deepsea, S_ = YL.S, wood = YL.worlds.woodcut;
    D.go('surface'); D.world = 'room'; YL.roomTarget = null;
    sea.vol = 0; if (wood) wood.vol = 0; if (YL.worlds.ink) YL.worlds.ink.vol = 0; if (YL.worlds.pond) YL.worlds.pond.vol = 0; YL.roomVol = 1;
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
      D.after(0.3, () => YL.AUDIO.motif && YL.AUDIO.motif(-0.4, 0.05, 1));
    }
    if (D.phase === 'end' && HERO.glow < 0.02) HERO.on = false;
    if (D.phase === 'end') YL.hero.update(dt, realT);
  },
  // tapping the lamp at the end: the light jumps out again, and the film runs once more
  replay() {
    const sm = YL.worlds.summer, wd = YL.worlds.woodcut, sea = YL.worlds.deepsea;
    if (sm) { sm.lift = 0; sm.zoom = 0; if (sm.hero) { sm.hero.fly = null; sm.hero.on = false; } sm.vol = 0; }
    if (wd) { wd.gone = false; wd.hero.mode = 'home'; wd.show = [1, 1, 1]; wd.lanLight = 1; wd.vol = 0; wd.zoomIn = 0; wd.whole = false; }
    const sh = YL.worlds.shadow; if (sh) { sh.vol = 0; sh.light = 1; sh.pull = 1; sh.sink = 0; }
    const ik = YL.worlds.ink; if (ik) { ik.vol = 0; ik.bloom = 0; ik.dawn = 0; }
    const pd = YL.worlds.pond; if (pd) { pd.vol = 0; pd.dew = 0; pd.drop = 0; pd.white = 0; }
    if (sea) { sea.hero.on = false; sea.hero.hold = null; sea.pass = null; sea.rise = 0; sea.riseY = 0; sea.surf = 0; sea.tea = 0; sea.flash = 0; sea.lure.state = 'off'; sea.vol = 0; }
    D.scared = false;
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
// ---- one world dissolving into the next through a warm glow
const FS_MIX = `#version 300 es
precision highp float;
uniform sampler2D uA, uB; uniform vec2 uRes; uniform float uK, uGlow;
out vec4 o;
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 c = mix(texture(uA, uv).rgb, texture(uB, uv).rgb, uK);
  c = mix(c, vec3(1.0, 0.82, 0.55), uGlow * (1.0 - 0.5 * length(uv - 0.5)));
  o = vec4(c, 1.0);
}`;
// ---- the shadow play over the sea: above the water line (alpha) the screen, below it the watercolour
const FS_FALL = `#version 300 es
precision highp float;
uniform sampler2D uA, uB; uniform vec2 uRes;
out vec4 o;
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec4 a = texture(uA, uv); vec3 b = texture(uB, uv).rgb;
  vec3 c = mix(b, a.rgb, a.a);
  c += vec3(0.95, 0.97, 1.0) * a.a * (1.0 - a.a) * 4.0 * 0.22;          // a bright meniscus along the line
  o = vec4(c, 1.0);
}`;
let fallProg = null;
function fallP() {
  if (fallProg) return fallProg;
  fallProg = YL.makeProgram('fall', `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`, FS_FALL);
  YL.checkProgram(fallProg);
  return fallProg;
}
let mixProg = null;
function mixP() {
  if (mixProg) return mixProg;
  mixProg = YL.makeProgram('mix', `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`, FS_MIX);
  YL.checkProgram(mixProg);
  return mixProg;
}
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
  if (YL.gl.isContextLost()) return true;          // (the loss is reported a frame late: draw nothing meanwhile)
  if (D.phase === 'village' || D.phase === 'stage' || D.phase === 'fall' || D.phase === 'water') { D.drawLineage(dt); return true; }
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
  if (D.phase === 'drop') {
    const sea = YL.worlds.deepsea;
    if (!sea.ready) sea.init();
    const I = irisTargets();
    sea.update(dt); sea.render(I.B, YL.canvasAspect());
    YL.worlds.shadow.seaTex = I.B.tex;                                           // (then the shadow play is drawn as usual, the river opened onto this)
  }
  if (D.phase === 'spark' && D.sparkIn !== undefined) {
    const sh = YL.worlds.shadow, wood = YL.worlds.woodcut;
    if (!D.zmT) D.zmT = YL.makeTarget(640, 360, ['rgba8']);
    sh.pull = 0.55 + 0.45 * smooth(2.0, 5.2, sh.t);
    sh.update(dt); sh.render(D.zmT, 16 / 9);
    wood.zmTex = D.zmT.tex;                                                      // (then the woodcut is drawn as usual, the shadow play in its lantern)
  }
  if (D.phase === 'paper' && summer.ready) {
    // the print on the sheet is the village itself, drawn at the size of the picture (so when the sheet fills it, it is it)
    const vil = YL.worlds.village, gl = YL.gl;
    if (!vil.ready) vil.init();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    if (!D.printT || D.printT.w !== w || D.printT.h !== h) D.printT = YL.makeTarget(w, h, ['rgba8']);
    if (D.pt > 3.65) vil.update(dt);
    vil.render(D.printT, w / h);
    summer.printTex = D.printT.tex;                                              // (then the summer is drawn as usual, the print on its sheet)
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
  if (D.phase === 'inkbloom' && D.pt < 1.2) {
    const I = irisTargets(), gl = YL.gl, sea = YL.worlds.sea, ink = YL.worlds.ink, aspect = YL.canvasAspect();
    if (!sea.ready) sea.init(); if (!ink.ready) ink.init();                      // (a jump straight here)
    sea.update(dt); sea.render(I.A, aspect);
    ink.update(dt); ink.render(I.B, aspect);
    const p = mixP();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, I.w, I.h);
    gl.useProgram(p.p);
    YL.U(p, 'uRes', [I.w, I.h]); YL.U(p, 'uK', smooth(0.0, 1.2, D.pt)); YL.U(p, 'uGlow', 0);
    YL.bindTex(p, 'uA', I.A.tex, 0); YL.bindTex(p, 'uB', I.B.tex, 1);
    YL.drawFull();
    return true;
  }
  if (D.phase === 'inkbloom' && D.world !== 'ink') D.world = 'ink';
  if (D.phase === 'burst') {
    // the colour bursts out of the ink: the pond's strokes spreading from the sun over the dawn-lit painting
    const I = irisTargets(), gl = YL.gl, ink = YL.worlds.ink, pond = YL.worlds.pond, aspect = YL.canvasAspect();
    if (!pond.ready) pond.init();
    ink.update(dt); ink.render(I.A, aspect);
    pond.update(dt); pond.render(I.B, aspect);
    const p = mixP();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, I.w, I.h);
    gl.useProgram(p.p);
    YL.U(p, 'uRes', [I.w, I.h]); YL.U(p, 'uK', smooth(0.0, 1.1, D.pt)); YL.U(p, 'uGlow', 0.25 * Math.exp(-Math.pow((D.pt - 0.6) / 0.35, 2)));
    YL.bindTex(p, 'uA', I.A.tex, 0); YL.bindTex(p, 'uB', I.B.tex, 1);
    YL.drawFull();
    return true;
  }
  if (D.phase === 'inlantern') {
    const I = irisTargets(), gl = YL.gl, wood = YL.worlds.woodcut, sh = YL.worlds.shadow, aspect = YL.canvasAspect();
    const u = clamp(D.pt / T_ZOOM, 0, 1), k = smooth(0.70, 1.0, u);
    wood.update(dt); wood.render(I.A, aspect);
    if (k > 0) { if (!sh.ready) sh.init(); sh.pull = 0.55; sh.update(dt); sh.render(I.B, aspect); }
    const p = mixP();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, I.w, I.h);
    gl.useProgram(p.p);
    YL.U(p, 'uRes', [I.w, I.h]); YL.U(p, 'uK', k); YL.U(p, 'uGlow', 0.22 * Math.exp(-Math.pow((u - 0.84) / 0.09, 2)));
    YL.bindTex(p, 'uA', I.A.tex, 0); YL.bindTex(p, 'uB', I.B.tex, 1);
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
    if (ph === 'spark') { w.villageDone = w.moonDone = true; w.sendSpark(); D.sparkIn = undefined; D.pt = 0; YL.worlds.shadow.init(); }
  }
  const P = YL.ptr;
  if (P && P !== lastPtr && w.pointer) w.pointer(P.nx, P.ny, P.speed);
  lastPtr = P;
  YL.ptrPar = YL.CAM.par;
  w.update(dt, YL.DBG.still);
  w.render(null, YL.canvasAspect());
  return true;
};
// the worlds of the village–stage–sea shot: move them on, then draw (the screen's picture first, or both sides of the water line)
D.stepLineage = (dt) => {
  const vil = YL.worlds.village, stg = YL.worlds.stage, sea = YL.worlds.sea;
  for (const w of [vil, stg, sea]) if (!w.ready) w.init();
  if (D.phase === 'village') { vil.update(dt); if (D.stageOn) stg.update(dt); }
  else if (D.phase === 'stage') stg.update(dt);
  else if (D.phase === 'fall') { stg.update(dt); sea.update(dt); }
  else if (D.phase === 'water') sea.update(dt);
};
D.drawLineage = (dt) => {
  if (D.lineageJump) {
    const { ph, pt } = D.lineageJump; D.lineageJump = null;
    const order = ['village', 'stage', 'fall', 'water'];
    // run until that phase is reached, then on into it by pt
    let guard = 0;
    while (order.indexOf(D.phase) < order.indexOf(ph) && guard++ < 24 * 60) D.ffLineage(1 / 24);
    D.ffLineage(pt);
  }
  const vil = YL.worlds.village, stg = YL.worlds.stage, sea = YL.worlds.sea, aspect = YL.canvasAspect(), gl = YL.gl;
  D.stepLineage(dt);
  if (D.phase === 'village') {
    if (D.stageOn) { const I = irisTargets(); stg.render(I.B, aspect); vil.screenTex = I.B.tex; } else vil.screenTex = null;
    vil.render(null, aspect);
  } else if (D.phase === 'stage') stg.render(null, aspect);
  else if (D.phase === 'fall') {
    const I = irisTargets();
    stg.render(I.A, aspect); sea.render(I.B, aspect);
    const p = fallP();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, I.w, I.h);
    gl.useProgram(p.p);
    YL.U(p, 'uRes', [I.w, I.h]);
    YL.bindTex(p, 'uA', I.A.tex, 0); YL.bindTex(p, 'uB', I.B.tex, 1);
    YL.drawFull();
  } else sea.render(null, aspect);
};
// run the shot forward without drawing (for a jump straight into the middle of it)
D.ffLineage = (secs) => { const dt = 1 / 24; for (let i = 0; i < Math.round(secs * 24); i++) { D.pt += dt; D.t += dt; D.clock += dt; D.lineage(dt); D.stepLineage(dt); } };
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
// a lost and restored GL context: everything the worlds and the transitions made belongs to the old one
YL.onContextRestored = () => {
  iris = null; tearP = null; drainP = null; mixProg = null; fallProg = null; YL.sharp2 = null; YL.roomTarget = null;
  for (const w of Object.values(YL.worlds || {})) {
    w.ready = false;
    w.res = null; w.tw = 0; w.inks = null; w.A = null; w.B = null;
  }
};

// ---- screenshots: jump straight to a moment
if (QS.get('phase')) {
  const ph = QS.get('phase'), pt = +(QS.get('pt') || 0);
  D.escape();
  if (FILM) D.clock = 3;                           // (past the film's opening fade from black)
  LIGHT.level = 0; HERO.glow = 1;
  const L = YL.hero.routeLength();
  if (ph === 'wander') { YL.hero.t = pt; D.t = pt; }
  else {
    YL.hero.t = L + 5; D.t = L + 5;
    const later = ['summer', 'paper', 'updraft', 'cloud', 'print', 'woodcut', 'spark', 'inlantern', 'shadow', 'drop', 'snuff', 'leave', 'tear', 'deepsea', 'inkbloom', 'ink', 'dawn', 'burst', 'pond', 'dew', 'rise', 'surface'];
    if (['village', 'stage', 'fall', 'water'].includes(ph)) {
      // into the village–stage–sea shot: run it from the village's start up to the moment asked for (once GL exists)
      D.irisCenter = [0.1, 0.1]; D.enterSummer(); YL.roomVol = 0;
      D.go('village'); D.world = 'village';
      D.lineageJump = { ph, pt };
    } else if (later.includes(ph)) {
      D.irisCenter = [0.1, 0.1]; D.enterSummer();
      if (ph === 'summer') D.pt = pt;
      else if (ph === 'updraft' || ph === 'cloud') { D.go(ph); D.pt = pt; }
      else if (ph === 'paper') { D.go(ph); D.pt = pt; setTimeout(() => { const su = YL.worlds.summer; su.startSheet(); su.sheet.t0 -= pt; }, 0); }
      else {
        // straight into the print (once the GL context exists: see renderFrame)
        D.world = 'woodcut'; YL.roomVol = 0; D.jump = { ph, pt };
        if (FILM && ['print', 'woodcut', 'spark', 'inlantern'].includes(ph)) { const w = YL.worlds.woodcut; w.pace = 1.7; w.panX = 0.80; }   // (as the film sets it on the way in)
        if (ph === 'deepsea' || ph === 'rise') { D.world = 'deepsea'; D.jump = null; D.go(ph); D.pt = pt; D.seaJump = true; }
        if (ph === 'shadow' || ph === 'snuff' || ph === 'drop') { D.world = 'shadow'; D.jump = null; D.go(ph); D.pt = pt; YL.worlds.shadow.t = 1 + pt + (ph === 'drop' ? 12 : 0); }
        if (ph === 'burst' || ph === 'pond' || ph === 'dew') { D.world = ph === 'burst' ? 'ink' : 'pond'; D.jump = null; D.go(ph); D.pt = pt; YL.worlds.ink.dawn = 1; }
        if (ph === 'inkbloom' || ph === 'ink' || ph === 'dawn') { D.world = 'ink'; D.jump = null; D.go(ph); D.pt = pt; const k = YL.worlds.ink; k.bloom = ph === 'inkbloom' ? 1 : 0; k.grow = ph === 'inkbloom' ? [0, 0, 0, 0] : [1, 1, 1, 1]; if (ph === 'inkbloom') k.arrive(0.9, 0.5); }
        if (ph === 'surface') { D.jump = null; YL.roomVol = 1; setTimeout(() => { D.surface(); D.pt = pt; YL.hero.t = pt; if (pt > T_SURF) D.go('home'); }, 0); }
      }
    }
    else { D.go(ph); D.pt = pt; }
  }
}
})();
