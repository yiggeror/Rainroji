/* ============================================================================
   导演 —— 时间线与镜头。第一幕：雨夜的房间。
     intro   台灯亮着；你点它，或者十秒后它自己闪两下——一粒光从灯丝里跳出来，灯熄了
     wander  它在屋里飘：钻进茶的热气、贴着练习本、看看挂钟、钻进吊兰的叶子里，最后停到窗玻璃上
     window  镜头推近玻璃，焦点落在它和雨滴上
   镜头：跟拍时目标跟着光走、焦点跟着光走（景深随之移动）；到窗前时推成近景。
   调试：?phase=wander&pt=秒 / ?phase=window&pt=秒 直接跳到某一刻（截图用）
   ========================================================================== */
(() => {
'use strict';
const YL = window.YL;
const { V, clamp, lerp, smooth, S, HERO, LIGHT, QS } = YL;
const ROUTE = [
  { p: S.BULB },
  { p: [-0.50, 0.985, 0.27], travel: 0.7, dwell: 1.0 },     // drops out of the shade's open bottom, looks around
  { p: [-0.17, 0.905, 0.19], travel: 2.4, dwell: 2.2 },     // into the tea's steam: the steam lights up round it
  { p: [0.03, 0.80, 0.31], travel: 2.2, dwell: 1.8 },       // low over the open notebook
  { p: [-0.62, 1.60, 0.12], travel: 3.2, dwell: 1.8 },      // up to the clock
  { p: [0.26, 1.07, 0.04], travel: 3.4, dwell: 2.4 },       // in among the spider plant's leaves
  { p: [0.20, 1.42, -0.098], travel: 2.8, dwell: 0 },       // to the glass, among the drops
];
const D = YL.director = {
  phase: 'intro', t: 0,
  escape() {
    if (D.phase !== 'intro') return;
    D.phase = 'wander'; D.t = 0;
    HERO.on = true; HERO.glow = 0; YL.hero.glowTarget = 1;
    YL.hero.setRoute(ROUTE);
    LIGHT.on = 0; LIGHT.dip = 0;
    YL.AUDIO.click && YL.AUDIO.click(0);
    setTimeout(() => YL.AUDIO.motif && YL.AUDIO.motif(-0.4), 350);
  },
  update(dt, realT) {
    D.t += dt;
    if (D.phase === 'intro') {
      // it wants out: two little flickers of the lamp, then it goes by itself
      LIGHT.dip = 0.55 * (smooth(7.4, 7.5, D.t) - smooth(7.6, 7.75, D.t)) + 0.35 * (smooth(8.3, 8.36, D.t) - smooth(8.45, 8.6, D.t));
      if (D.t > 10) D.escape();
      YL.cam = null;
      return;
    }
    YL.hero.update(dt, realT);
    const Tw = YL.hero.routeLength() - 2.0;
    if (D.phase === 'wander' && D.t > Tw + 2.0) D.phase = 'window';
    // the shot: following it (target and focus on the light), then pushing in to the glass
    const aspect = YL.canvasAspect ? YL.canvasAspect() : 1.6;
    const base = YL.framing(aspect);
    const h = HERO.p;
    const follow = {
      pos: V.add(base.pos, V.mul(V.sub(h, base.tgt), 0.12)),
      tgt: base.tgt.map((v, i) => lerp(v, h[i], 0.45)),
      vfov: base.vfov * 0.92,
    };
    const portrait = aspect < 0.9;
    const win = { pos: portrait ? [0.16, 1.38, 0.72] : [0.12, 1.41, 0.62], tgt: [0.20, 1.42, S.GLASS_Z], vfov: portrait ? 44 : 30 };
    const ww = smooth(Tw, Tw + 3.5, D.t);
    const pos = follow.pos.map((v, i) => lerp(v, win.pos[i], ww)), tgt = follow.tgt.map((v, i) => lerp(v, win.tgt[i], ww));
    const fwd = V.norm(V.sub(tgt, pos));
    const focus = lerp(V.dot(V.sub(h, pos), fwd), (S.GLASS_Z - pos[2]) / fwd[2], ww);
    YL.cam = { pos, tgt, vfov: lerp(follow.vfov, win.vfov, ww), focus: Math.max(focus, 0.25), w: smooth(0, 2.5, D.t) };
  },
};
// ---- which world is on screen. The room is the host's own render; the others draw themselves.
D.world = YL.QS.get('world') || 'room';
let lastPtr = null;
D.renderFrame = (dt, realT) => {
  if (D.world === 'room') return false;
  const w = YL.worlds && YL.worlds[D.world];
  if (!w) return false;
  if (!w.ready) w.init();
  const P = YL.ptr;
  if (P && P !== lastPtr && w.pointer) w.pointer(P.nx, P.ny, P.speed);
  lastPtr = P;
  YL.ptrPar = YL.CAM.par;
  w.update(dt, YL.DBG.still);
  w.render(null, YL.canvasAspect());
  return true;
};
if (D.world !== 'room') YL.roomVol = 0;
YL.onLampTap = () => { if (D.phase === 'intro') D.escape(); return true; };   // after it has gone, the lamp is just empty
// screenshots: jump straight to a moment
if (QS.get('phase')) {
  const ph = QS.get('phase'), pt = +(QS.get('pt') || 0);
  D.escape();
  LIGHT.level = 0; HERO.glow = 1;
  const L = YL.hero.routeLength();
  const t = ph === 'window' ? L + pt : pt;
  YL.hero.t = t; D.t = t;
  if (ph === 'window') D.phase = 'window';
}
})();
