/* ============================================================================
   一粒光 —— 主角。它没有脸：性格只靠运动和明暗。
   · 位置：导演给出一条带停留的路径（路点 + 行程时间 + 停留时间），中间用 Catmull-Rom 平滑；
     叠加一点游移（像在空气里浮着），停留时绕着小圈「东张西望」。
   · 好奇：光标靠近时，它朝光标的那条视线凑过去一点；光标甩得太快，它吓得一暗，躲开。
   · 呼吸：亮度有一个固定的慢节奏（全片不变，是它的识别特征）。
   ========================================================================== */
(() => {
'use strict';
const YL = window.YL;
const { V, clamp, lerp, smooth } = YL;
const H = YL.hero = {
  route: null, t: 0, scare: 0, lean: [0, 0, 0], last: null,
  // route: [{ p: [x,y,z], travel: s, dwell: s }, …]; the first point is where it starts
  setRoute(route) { H.route = route; H.t = 0; H.last = null; },
  routeLength() { return H.route ? H.route.slice(1).reduce((s, w) => s + w.travel + (w.dwell || 0), 0) : 0; },
  // position along the route at time t (s): eased travel between points, gentle hovering while dwelling
  sample(t) {
    const R = H.route; if (!R) return YL.HERO.p;
    if (R.flow) return H.flowAt(t);
    let k = 1, tt = t;
    for (; k < R.length; k++) {
      const w = R[k];
      if (tt < w.travel) break;
      tt -= w.travel;
      if (tt < (w.dwell || 0) && k < R.length - 1) return H.hover(w.p, tt, k);
      tt -= (w.dwell || 0);
    }
    if (k >= R.length) return H.hover(R[R.length - 1].p, tt + 99, R.length - 1);
    const p0 = R[Math.max(k - 2, 0)].p, p1 = R[k - 1].p, p2 = R[k].p, p3 = R[Math.min(k + 1, R.length - 1)].p;
    const u = smooth(0, 1, tt / R[k].travel), u2 = u * u, u3 = u2 * u;
    const cr = i => 0.5 * ((2 * p1[i]) + (-p0[i] + p2[i]) * u + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * u2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * u3);
    // an arc: it does not travel in straight lines, it bobs up a little on the way
    const lift = Math.sin(Math.PI * u) * Math.min(0.06, 0.25 * Math.hypot(p2[0] - p1[0], p2[2] - p1[2]));
    return [cr(0), cr(1) + lift, cr(2)];
  },
  // a flowing route (the film): one curve through all the points, never stopping on the way — it gathers speed as it
  // leaves the first point and settles only at the last; between, each leg takes its own time
  flowAt(t) {
    const R = H.route, legs = R.slice(1).map(w => w.travel), T = legs.reduce((a, b) => a + b, 0), a = 0.6, b = 0.9;
    // time warp: speed ramps up over the first a seconds and down over the last b, constant between
    const v = 1 / (1 - a / 2 / T - b / 2 / T);
    const tc = clamp(t, 0, T);
    let s = tc < a ? v * tc * tc / (2 * a) : tc > T - b ? v * (T - a / 2 - b / 2) - v * (T - tc) * (T - tc) / (2 * b) : v * (tc - a / 2);
    s = clamp(s, 0, T);
    let k = 0; while (k < legs.length - 1 && s > legs[k]) { s -= legs[k]; k++; }
    const u = clamp(s / legs[k], 0, 1), u2 = u * u, u3 = u2 * u;
    const p0 = R[Math.max(k - 1, 0)].p, p1 = R[k].p, p2 = R[k + 1].p, p3 = R[Math.min(k + 2, R.length - 1)].p;
    const cr = i => 0.5 * ((2 * p1[i]) + (-p0[i] + p2[i]) * u + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * u2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * u3);
    const p = [cr(0), cr(1), cr(2)];
    return t > T ? H.hover(p, t - T, R.length - 1) : p;
  },
  hover(p, tt, k) {
    const a = tt * 1.7 + k * 1.3, r = 0.012 * smooth(0, 0.8, tt);
    return [p[0] + Math.sin(a) * r, p[1] + Math.sin(a * 2.0) * r * 0.5, p[2] + Math.cos(a) * r * 0.6];
  },
  update(dt, realT) {
    const HERO = YL.HERO;
    if (!HERO.on) return;
    H.t += dt;
    let p = H.sample(H.t);
    // floating in the air: a slow, small, three-axis drift
    const f = YL.DBG.still ? 0 : 1;
    p = V.add(p, [0.004 * f * YL.drift(realT * 0.9, 11), 0.005 * f * YL.drift(realT * 0.8, 12), 0.004 * f * YL.drift(realT * 0.7, 13)]);
    // curiosity and fright: the pointer's line of sight
    const P = YL.ptr, CAM = YL.CAM;
    let leanT = [0, 0, 0];
    if (P && YL.now() - P.t < 1.5 && !YL.DBG.shot) {
      const rd = YL.camRay(P.nx, P.ny), oc = V.sub(p, CAM.pos), tc = V.dot(oc, rd);
      const q = V.add(CAM.pos, V.mul(rd, tc)), d = V.sub(q, p), dl = Math.hypot(...d);
      if (P.speed > 3.5 && dl < 0.3) H.scare = 1;                         // flung past it: it flinches
      else if (dl < 0.35) leanT = V.mul(d, 0.35 * smooth(0.35, 0.05, dl));   // drawn towards it
    }
    H.scare = Math.max(0, H.scare - dt * 0.8);
    if (H.scare > 0 && P) leanT = V.add(leanT, V.mul(V.norm(V.sub(p, CAM.pos)), 0.05 * H.scare));
    H.lean = H.lean.map((v, i) => v + (leanT[i] - v) * (1 - Math.exp(-dt * 2.5)));
    HERO.p = V.add(p, H.lean);
    // brightness: the breathing never changes (its signature); fright dims it
    const target = (H.glowTarget ?? 1) * (1 - 0.55 * H.scare);
    HERO.glow += (target - HERO.glow) * (1 - Math.exp(-dt * (target > HERO.glow ? 2.5 : 6)));
  },
};
})();
