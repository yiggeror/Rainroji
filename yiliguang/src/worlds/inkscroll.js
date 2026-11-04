/* ============================================================================
   世界六的笔墨：一卷烟雨山水（水墨世界画在这里，ink.js 负责把它显出来）
   ----------------------------------------------------------------------------
   从左往右：
     · 近处一面石崖，崖顶一棵老松斜出水面，松边一个人抱琴坐着；
     · 一座主峰顶天：一块块矾头叠上去，披麻皴，点苔，山脊上一排远树，肩上一座小寺；
     · 一道瀑布从画外落下，两叠，两边的崖壁斧劈皴，崖顶和崖缝里长着松；
     · 雨里的竹林在近前，竹脚几块石头；一座石拱桥，桥头一棵垂柳；
     · 坡下的村子：茅屋、篱笆、树丛，几个人；水边一座亭子；
     · 开阔的江面，芦苇，一叶小舟。
   画法：
     · 从后往前画。每块石头先把自己轮廓里的东西擦掉（它挡住了后面的），再上墨：
       石头的顶留白，往下到石缝渐深；背光的一侧再深一层；皴笔从顶上顺着石形往下拖；顶上点苔。
       所以一座山是一层一层的矾头，亮的顶、暗的缝，不是一个剪影。
     · 每一笔都记下它在哪、多粗（ops）。光就是那支笔：它走过附近，那一笔才顺着笔势画出来，
       墨晕从落笔处往外洇（见 times()：画「什么时候画到这里」的时间图）。
   通道：笔（brush）R 石头、房子、桥；G 树；B 会在风里动的（柳丝、竹、芦苇）。
         墨晕（wash）R 石和地的渲染；G 树冠的底色；B「实」的地方（挡住后面的远山：1 近处，0.5、0.75 中景）。
   ========================================================================== */
(() => {
'use strict';
const YL = window.YL;
const SL = 5.6, PS = 1152, PW = Math.round(SL * PS), PH = PS, TS = 0.5;
const BRUSH_V = 7, WASH_V = 2.2;            // how fast a stroke is drawn, a wash spreads (painting units per unit of the painting's time)

function paint(rand) {
  const mk = () => { const c = document.createElement('canvas'); c.width = PW; c.height = PH; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, PW, PH); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round'; return g; };
  const gB = mk(), gW = mk();
  const ops = [], water = [];
  let D0 = 0;                                // how long after the brush comes near this mark is laid (outline, then wash, then texture, then moss)
  const X = x => x * PS, Y = y => (1 - y) * PS;
  const R = (a, b) => a + (b - a) * rand();
  const COL = ['255,0,0', '0,255,0', '0,0,255'];
  const rgba = (ch, a) => `rgba(${COL[ch]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
  const lerp = (a, b, t) => a + (b - a) * t;
  const h1 = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const vn = (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(h1(i), h1(i + 1), u); };
  const crag = (x, seed) => { let r = 0, a = 0.5, f = 1; for (let i = 0; i < 4; i++) { r += a * (1 - Math.abs(2 * vn(x * f + seed * 17.3) - 1)); f *= 2.15; a *= 0.5; } return r / 0.9375; };
  const pathOf = (g, poly) => { g.beginPath(); poly.forEach((q, i) => i ? g.lineTo(X(q[0]), Y(q[1])) : g.moveTo(X(q[0]), Y(q[1]))); g.closePath(); };
  // a smooth run through points (any number of values each)
  const run = (pts, per = 10) => {
    if (pts.length < 2) return pts.map(q => q.slice());
    const out = [], m = pts[0].length;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
      for (let k = 0; k < per; k++) { const t = k / per, t2 = t * t, t3 = t2 * t, q = []; for (let j = 0; j < m; j++) q.push(0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)); out.push(q); }
    }
    out.push(pts[pts.length - 1].slice()); return out;
  };
  const sub = (P, k = 12) => { if (P.length <= k) return P.map(q => [q[0], q[1]]); const o = []; for (let i = 0; i < k; i++) { const q = P[Math.round(i / (k - 1) * (P.length - 1))]; o.push([q[0], q[1]]); } return o; };
  const arcLen = (P) => { const s = [0]; for (let i = 1; i < P.length; i++) s.push(s[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1])); return s; };

  /* ---------------------------------------------------------------- the marks */
  // one stroke of a soft brush: its hairs each carry their own ink and run dry one by one, the outer ones first (飞白)
  function stroke(pts, o = {}) {
    const { ch = 0, ink = 0.8, hairs = 24, dry = 0.3, taper = [0.12, 0.3], per = 10, d = 0, g = gB } = o;
    const P = run(pts, per), n = P.length, col = COL[ch];
    let wMax = 0; for (const q of P) wMax = Math.max(wMax, q[2]);
    for (let h = 0; h < hairs; h++) {
      const off = ((h + 0.5) / hairs * 2 - 1) * (0.85 + 0.3 * rand()), load = ink * (0.45 + 0.55 * rand());
      const runOut = 1 - dry * (0.2 + 0.8 * rand()) * (0.3 + 0.7 * Math.abs(off)), seed = rand() * 100;
      g.strokeStyle = `rgba(${col},${Math.min(1, load).toFixed(3)})`; g.lineWidth = Math.max(0.8, wMax * PS / hairs * 1.7);
      let open = false;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1), q = P[i], a = P[Math.max(i - 1, 0)], b = P[Math.min(i + 1, n - 1)];
        const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-6;
        const tw = Math.max(0.0, Math.min(1, u / taper[0], (1 - u) / taper[1]));
        const of = off * q[2] * 0.5 * (0.35 + 0.65 * tw);
        const x = q[0] - dy / L * of, y = q[1] + dx / L * of;
        const lifted = Math.abs(off) > tw * 1.15 + 0.08;
        const skip = lifted || u > runOut && (Math.sin(u * 41 + seed) + Math.sin(u * 97 + seed * 2.3)) * 0.5 > 1 - 1.8 * Math.min(1, (u - runOut) / 0.25);
        if (skip) { if (open) { g.stroke(); open = false; } continue; }
        if (!open) { g.beginPath(); g.moveTo(X(x), Y(y)); open = true; } else g.lineTo(X(x), Y(y));
      }
      if (open) g.stroke();
    }
    ops.push({ ch, w: wMax, pts: sub(P), d: D0 + d });
  }
  // a line drawn with the tip, pressed and lifted as it goes (thick and thin), breaking where the brush leaves the paper
  function ribbon(pts, o = {}) {
    const { w = 0.004, ink = 0.85, ch = 0, breaks = 0.1, rough = 0.2, taper = [0.06, 0.12], d = 0, g = gB, per = 8, swell = 1 } = o;
    const P = run(pts.map(q => [q[0], q[1]]), per), n = P.length; if (n < 2) return;
    const S = arcLen(P), Lt = S[n - 1] || 1e-6, ph = rand() * 6, fr = R(25, 45);
    const bph = rand() * 6, bf = R(18, 30);
    let piece = [];
    const fill = () => {
      if (piece.length >= 2) {
        const Lf = [], Rt = [];
        for (const i of piece) {
          const a = P[Math.max(i - 1, 0)], b = P[Math.min(i + 1, n - 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1e-6;
          const u = S[i] / Lt, pr = (1 - 0.45 * swell + 0.45 * swell * Math.sin(S[i] * fr + ph)) * Math.min(1, u / taper[0] + 0.12, (1 - u) / taper[1] + 0.12);
          const ww = w * pr * 0.5 * (1 + rough * (rand() - 0.5));
          Lf.push([P[i][0] - dy / l * ww, P[i][1] + dx / l * ww]); Rt.push([P[i][0] + dy / l * ww, P[i][1] - dx / l * ww]);
        }
        g.fillStyle = rgba(ch, ink * R(0.85, 1.0));
        g.beginPath(); Lf.forEach((q, k) => k ? g.lineTo(X(q[0]), Y(q[1])) : g.moveTo(X(q[0]), Y(q[1])));
        for (let k = Rt.length - 1; k >= 0; k--) g.lineTo(X(Rt[k][0]), Y(Rt[k][1]));
        g.closePath(); g.fill();
      }
      piece = [];
    };
    for (let i = 0; i < n; i++) {
      const gap = breaks > 0 && i > 0 && i < n - 1 && (Math.sin(S[i] * bf + bph) + 0.7 * Math.sin(S[i] * bf * 2.7 + bph * 2)) > 1.7 - breaks * 2.4;
      if (gap) { fill(); continue; }
      piece.push(i);
    }
    fill();
    ops.push({ ch, w, pts: sub(P), d: D0 + d });
  }
  // a wash inside a shape: a gradient (down from its top by default, or along dir = [x0, y0, x1, y1])
  function wash(poly, o = {}) {
    const { ch = 0, stops = [[0, 0.2], [1, 0]], depth, g = gW, d = 0.004, dir = null, op = true } = o;
    let top = -9, bot = 9, cx = 0, cy = 0;
    for (const q of poly) { top = Math.max(top, q[1]); bot = Math.min(bot, q[1]); cx += q[0]; cy += q[1]; }
    cx /= poly.length; cy /= poly.length;
    const dep = depth ?? (top - bot);
    const gr = dir ? g.createLinearGradient(X(dir[0]), Y(dir[1]), X(dir[2]), Y(dir[3])) : g.createLinearGradient(0, Y(top), 0, Y(top - dep));
    for (const [u, a] of stops) gr.addColorStop(Math.max(0, Math.min(1, u)), rgba(ch, a));
    g.fillStyle = gr; pathOf(g, poly); g.fill();
    if (!op) return;
    let r = 0; for (const q of poly) r = Math.max(r, Math.hypot(q[0] - cx, q[1] - cy));
    ops.push({ ch, wash: g === gW, poly: sub(poly, 40), c: [cx, cy], r, d: D0 + d });
  }
  // a soft wet dab
  function blob(x, y, rx, ry, ink, o = {}) {
    const { ch = 0, g = gW, d = 0.004, soft = 0.5 } = o;
    g.save(); g.translate(X(x), Y(y)); g.scale(1, ry / rx);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx * PS);
    gr.addColorStop(0, rgba(ch, ink)); gr.addColorStop(soft, rgba(ch, ink * 0.7)); gr.addColorStop(1, rgba(ch, 0));
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx * PS, 0, 6.2832); g.fill(); g.restore();
    ops.push({ ch, wash: g === gW, c: [x, y], r: Math.max(rx, ry), ell: [rx, ry], d: D0 + d });
  }
  // a dot of the tip
  function dot(x, y, r, ink, o = {}) {
    const { ch = 0, ecc = 0.75, ang = rand() * 3.14, g = gB, d = 0 } = o;
    g.fillStyle = rgba(ch, ink); g.beginPath();
    g.ellipse(X(x), Y(y), Math.max(0.6, r * PS * R(0.85, 1.15)), Math.max(0.5, r * PS * ecc * R(0.8, 1.1)), ang, 0, 6.2832); g.fill();
    ops.push({ ch, w: r * 2.4, pts: [[x, y], [x + r * 0.3, y]], d: D0 + d });
  }
  // what is in front hides what is behind: wipe its shape clean before painting it
  function erase(poly) { for (const g of [gB, gW]) { g.save(); g.globalCompositeOperation = 'source-over'; g.fillStyle = '#000'; pathOf(g, poly); g.fill(); g.restore(); } }
  function cover(poly, v) { gW.save(); gW.globalCompositeOperation = 'lighten'; gW.fillStyle = `rgb(0,0,${Math.round(v * 255)})`; pathOf(gW, poly); gW.fill(); gW.restore(); }

  /* ---------------------------------------------------------------- rocks and mountains */
  // one rock form.
  //   hemp (披麻): a rounded mass, its brow rising and falling in two or three humps; long loose fibres of strokes run down
  //     it in bundles along the fall of its slope, thicker on the side away from the light and down in the crevice at its
  //     foot, its brow left light.
  //   axe (斧劈): an angular block, a steep rise, a flat brow with a notch, a steep drop; broad wedges of a nearly dry
  //     brush dragged down from under the brow, dark there, the rest of the face left pale; a few long cracks.
  function lump(o) {
    const { cx, yb, w, h, depth = h * 1.2, axe = false, ink = 1, side = 1, moss = 0, cov = 0.5, lw = 1, tex = 1, sc = 1, line = 1 } = o;
    const N = 28, top = [];
    if (axe) {
      const u1 = R(0.06, 0.2), u2 = R(0.35, 0.55), u3 = R(0.65, 0.88);
      const key = [[0, 0], [u1, R(0.75, 1.0)], [u2, R(0.62, 0.95)], [u3, R(0.7, 1.0)], [1, R(0, 0.25)]];
      for (let i = 0; i <= N; i++) {
        const u = i / N; let k = 0; while (k < key.length - 2 && u > key[k + 1][0]) k++;
        const t = (u - key[k][0]) / (key[k + 1][0] - key[k][0]);
        top.push([cx + (u - 0.5) * w, yb + h * lerp(key[k][1], key[k + 1][1], t) + 0.006 * sc * (vn(u * 9 + cx * 40) - 0.5) * Math.sin(Math.PI * u)]);
      }
    } else {
      const upk = R(0.3, 0.7), ph = rand() * 6, nbm = R(2.5, 5.0), ex = R(0.5, 0.75);
      for (let i = 0; i <= N; i++) {
        const u = i / N, env = u < upk ? Math.sin(Math.PI * 0.5 * u / upk) : Math.sin(Math.PI * 0.5 * (1 - u) / (1 - upk));
        top.push([cx + (u - 0.5) * w, yb + h * Math.pow(Math.max(0, env), ex) * (1 + 0.12 * Math.sin(u * Math.PI * nbm + ph))]);
      }
    }
    const L0 = top[0], R0 = top[N], ins = axe ? 0.02 : 0.10;
    const sideL = [[L0[0] + ins * w * 0.4, L0[1] - depth * 0.5], [L0[0] + ins * w, L0[1] - depth]];
    const sideR = [[R0[0] - ins * w * 0.4, R0[1] - depth * 0.5], [R0[0] - ins * w, R0[1] - depth]];
    const poly = [sideL[1], sideL[0], ...top, sideR[0], sideR[1]];
    erase(poly); if (cov > 0) cover(poly, cov);
    let topY = -9; for (const q of top) topY = Math.max(topY, q[1]);
    const span = topY - (yb - depth), hk = (topY - yb) / span;
    const fallAt = (i) => {              // down the slope at the brow's i-th point: along the fall of it, blended with straight down
      const a = top[Math.max(i - 1, 0)], b = top[Math.min(i + 1, N)];
      let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1e-6; tx /= tl; ty /= tl;
      if (ty > 0) { tx = -tx; ty = -ty; }
      const k = Math.min(1, Math.abs(ty) * 1.2) * 0.55;
      let dx = tx * k, dy = ty * k - (1 - k); const dl = Math.hypot(dx, dy); return [dx / dl, dy / dl];
    };
    // the washes: its brow left light; deeper toward its foot, where the form in front will cover it; then lost
    D0 = 0.004;
    wash(poly, { stops: [[0, 0.01 * ink], [hk * 0.55, 0.05 * ink], [Math.min(0.94, hk * 1.02), (axe ? 0.24 : 0.19) * ink], [Math.min(0.97, hk + (1 - hk) * 0.5), 0.09 * ink], [1, 0]], depth: span });
    wash(poly, { stops: [[0, 0], [0.45, 0.015 * ink], [1, (axe ? 0.16 : 0.12) * ink]], dir: [cx - side * w * 0.1, 0, cx + side * w * 0.5, 0], op: false });
    D0 = 0.008;
    gB.save(); pathOf(gB, poly); gB.clip();
    const area = w * (h + depth * 0.5);
    if (!axe) {
      const nb = Math.max(2, Math.round(area * 480 * tex));
      for (let j = 0; j < nb; j++) {
        let u = rand(); u = side > 0 ? 1 - Math.pow(1 - u, 1.8) : Math.pow(u, 1.8); u = 0.04 + 0.92 * u;
        const i = Math.round(u * N), q = top[i], [dx, dy] = fallAt(i), px = -dy, py = dx;
        const L = R(0.35, 0.9) * (h + depth * 0.4), m = 2 + Math.floor(rand() * 4), sp = R(0.0035, 0.0065) * sc, wob = R(-0.06, 0.06) * L, inkB = R(0.14, 0.36) * ink;
        for (let s = 0; s < m; s++) {
          const o0 = (s - (m - 1) / 2) * sp, Ls = L * R(0.6, 1.0), s0 = R(0.002, 0.012);
          const p0 = [q[0] + dx * s0 + px * o0, q[1] + dy * s0 + py * o0];
          stroke([[p0[0], p0[1], 0.0030 * sc], [p0[0] + dx * Ls * 0.5 + px * wob, p0[1] + dy * Ls * 0.5 + py * wob, 0.0034 * sc], [p0[0] + dx * Ls + px * wob * 0.3, p0[1] + dy * Ls, 0.0012 * sc]], { ink: inkB * R(0.8, 1.2), hairs: 3, dry: R(0.5, 0.85), taper: [0.12, 0.45], per: 6 });
        }
      }
      // shorter, darker ones down in the crevice at its foot, on the side away from the light
      for (let j = 0; j < Math.round(nb * 0.8); j++) {
        const u = side > 0 ? R(0.4, 0.98) : R(0.02, 0.6), x = cx + (u - 0.5) * w * 0.9, y = yb + R(-0.2, 0.3) * h, L = R(0.15, 0.3) * h;
        stroke([[x, y, 0.003 * sc], [x + side * L * 0.12, y - L * 0.5, 0.0034 * sc], [x + side * L * 0.2, y - L, 0.0012 * sc]], { ink: R(0.3, 0.55) * ink, hairs: 3, dry: R(0.4, 0.7), taper: [0.1, 0.5], per: 5 });
      }
      // one fold inside it, faint
      const s0 = 4 + Math.floor(rand() * 6), s1 = Math.min(N - 3, s0 + 6 + Math.floor(rand() * 8)), kk = R(0.55, 0.8), dyf = R(0.3, 0.5) * h;
      ribbon(top.slice(s0, s1).map(q => [cx + (q[0] - cx) * kk, q[1] - dyf - (1 - kk) * (q[1] - yb) * 0.4]), { w: 0.003 * lw, ink: 0.4 * ink, breaks: 0.35 });
    } else {
      // the block has a lit face and a face turned away, the crease between them running down from the brow. Broad
      // strokes of the side of a nearly dry brush, all dragged the same way: most down the face turned away, a few under
      // the brow of the lit one
      const uc = side > 0 ? R(0.55, 0.8) : R(0.2, 0.45), ic = Math.round(uc * N), qc = top[ic];
      const crease = [qc, [qc[0] + side * R(0.0, 0.012), qc[1] - (qc[1] - yb) * 0.5 - depth * 0.2], [qc[0] + side * R(0.005, 0.025), yb - depth * 0.6]];
      const face = side > 0 ? [crease[2], crease[1], ...top.slice(ic), sideR[0], sideR[1]] : [sideL[1], sideL[0], ...top.slice(0, ic + 1), crease[1], crease[2]];
      D0 = 0.004; wash(face, { stops: [[0, 0.17 * ink], [0.5, 0.12 * ink], [1, 0.02 * ink]] }); D0 = 0.008;
      const ang = -Math.PI / 2 + side * R(0.15, 0.45);
      const n = Math.round(w * 75 * tex);
      for (let j = 0; j < n; j++) {
        const onFace = rand() < 0.65, u = onFace ? (side > 0 ? R(uc, 0.98) : R(0.02, uc)) : R(0.04, 0.96);
        const q = top[Math.round(u * N)], y0 = q[1] - (onFace ? R(0.01, 0.6) : R(0.004, 0.12)) * (q[1] - yb + depth * 0.4);
        const a = ang + R(-0.12, 0.12), L = R(0.04, 0.11) * sc, wd = R(0.012, 0.026) * sc, x0 = q[0] + R(-0.01, 0.01);
        stroke([[x0, y0, wd * 0.9], [x0 + Math.cos(a) * L * 0.5, y0 + Math.sin(a) * L * 0.5, wd], [x0 + Math.cos(a) * L, y0 + Math.sin(a) * L, wd * 0.45]], { ink: R(0.2, 0.48) * ink * (onFace ? 1 : 0.8), hairs: 16, dry: R(0.65, 0.92), taper: [0.04, 0.35], per: 5 });
      }
      ribbon(crease, { w: 0.0035 * lw, ink: 0.6 * ink, breaks: 0.3, taper: [0.05, 0.8] });
      for (let j = 0; j < Math.round(w * 8); j++) {
        const x = cx + R(-0.42, 0.42) * w, y = yb + h * R(0.3, 0.85), L = R(0.4, 1.0) * (h + depth * 0.5);
        stroke([[x, y, 0.0025 * sc], [x + R(-0.008, 0.008), y - L * 0.5, 0.003 * sc], [x + R(-0.012, 0.012), y - L, 0.001]], { ink: R(0.3, 0.5) * ink, hairs: 3, dry: 0.75, taper: [0.1, 0.5], per: 6 });
      }
    }
    gB.restore();
    // the outline: the brow pressed and lifted; the sides fainter, broken, going down out of sight
    D0 = 0;
    ribbon(top, { w: (axe ? 0.0058 : 0.0046) * lw, ink: (axe ? 0.88 : 0.72) * line * ink, breaks: axe ? 0.08 : 0.16 });
    ribbon([L0, sideL[0], sideL[1]], { w: 0.003 * lw, ink: 0.42 * line * ink, breaks: 0.4, taper: [0.05, 0.9] });
    ribbon([R0, sideR[0], sideR[1]], { w: 0.003 * lw, ink: 0.42 * line * ink, breaks: 0.4, taper: [0.05, 0.9] });
    // moss on its brow (点苔), a few dots together
    D0 = 0.02;
    for (let m = 0; m < moss; m++) {
      const q = top[Math.round(R(0.08, 0.92) * N)];
      for (let j = 0, nj = 2 + Math.floor(rand() * 3); j < nj; j++) dot(q[0] + R(-0.012, 0.012), q[1] + R(-0.004, 0.006), R(0.0022, 0.0040), R(0.75, 0.95) * Math.min(1, ink * 1.1), { ecc: 0.55, ang: R(-0.4, 0.4) });
    }
    D0 = 0;
    return { top, poly };
  }
  // a mountain or a cliff: its outline (top(x), and edgeL/edgeR(y) for ragged sides) filled with rock forms, row by row
  // from the summit down, each row in front of the one above it: small knobs (矾头) at the top, the forms growing larger
  // as they come down and forward; its foot lost in the mist; then its outline drawn over all of it
  function massif(o) {
    const { x0, x1, top, base, rowH, wMin, wMax, axe = false, ink = 1, cov = 0.5, side = 1, moss = 1, tex = 1, fade = 0.1, sc = 1, outline = 1, rk0 = 0.35, rkStep = 0.2, rkMax = 1.2 } = o;
    const sil = []; for (let x = x0; x <= x1 + 1e-6; x += 0.004) sil.push([x, top(x)]);
    const floor = base - 0.3;
    const left = [], right = [];
    if (o.edgeL) for (let y = floor; y <= top(x0); y += 0.008) left.push([o.edgeL(y), y]); else left.push([x0, floor]);
    if (o.edgeR) for (let y = top(x1); y >= floor; y -= 0.008) right.push([o.edgeR(y), y]); else right.push([x1, floor]);
    const clip = [...left, ...sil, ...right];
    let maxT = -9; for (const q of sil) maxT = Math.max(maxT, q[1]);
    for (const g of [gB, gW]) { g.save(); pathOf(g, clip); g.clip(); }
    const lumps = [];
    let y = maxT;
    for (let r = 0; r < 60; r++) {
      const rk = Math.min(rkMax, rk0 + rkStep * r);
      y -= rowH * rk * 0.6;
      const yb = y + R(-0.1, 0.1) * rowH * rk * 0.6;
      if (yb < base - rowH * 0.6) break;
      const fk = fade > 0 ? Math.max(0, Math.min(1, (yb - base) / fade + 0.08)) : 1;
      if (fk < 0.04) continue;
      const row = [];
      let x = x0 - 0.05 + R(-0.5, 0.2) * wMax * rk;
      while (x < x1 + 0.05) {
        const w = R(wMin, wMax) * rk, cx = x + w / 2, h = rowH * R(0.8, 1.2) * rk;
        if (top(Math.max(x0, Math.min(x1, cx))) > yb + 0.2 * h) row.push({ cx, w, h });
        x += w * R(0.6, 0.85);
      }
      row.sort(() => rand() - 0.5);
      for (const L of row) lumps.push(lump({ cx: L.cx, yb, w: L.w, h: L.h, depth: L.h * 1.2, axe, ink: ink * fk, side, moss: rand() < 0.5 * moss ? Math.round(R(3, 9)) : 0, cov, tex, sc, line: 0.9 }));
    }
    for (const g of [gB, gW]) g.restore();
    if (outline > 0) { D0 = 0; ribbon(sil.filter((q, i) => i % 3 === 0 && q[1] > base - 0.02), { w: 0.0058 * outline * sc, ink: 0.85 * ink, breaks: 0.12 }); }
    return { sil, lumps };
  }
  // an outline through points, as a function of x (with crags on it)
  function profile(pts, amp = 0.02, fq = 10, seed = 1) {
    const P = run(pts, 12);
    return (x) => {
      if (x <= P[0][0]) return P[0][1];
      for (let i = 0; i < P.length - 1; i++) if (x <= P[i + 1][0]) { const t = (x - P[i][0]) / (P[i + 1][0] - P[i][0] || 1e-6); return lerp(P[i][1], P[i + 1][1], Math.max(0, Math.min(1, t))) + amp * (crag(x * fq, seed) - 0.55); }
      return P[P.length - 1][1];
    };
  }
  // far trees on a ridge: a tick of a trunk and a few dots
  function farTrees(pts, s = 1, ink = 0.55) {
    for (const [x, y] of pts) {
      const hh = R(0.010, 0.02) * s;
      stroke([[x, y - 0.002, 0.0016 * s], [x + R(-0.002, 0.002), y + hh, 0.0008 * s]], { ch: 1, ink, hairs: 2, dry: 0.2, per: 3 });
      for (let k = 0; k < 5; k++) dot(x + R(-0.004, 0.004) * s, y + hh * R(0.5, 1.05), R(0.0016, 0.0028) * s, ink * R(0.8, 1.1), { ch: 1, ecc: 0.65 });
    }
  }
  const along = (f, a, b, step, jit = 0.4) => { const o = []; for (let x = a; x <= b; x += step * R(1 - jit, 1 + jit)) o.push([x, f(x) - 0.003]); return o; };

  /* ---------------------------------------------------------------- trees */
  // a trunk: for a thick one, two lines and a pale wash between, knots and bark; for a thin one, one line
  function trunk(pts, w0, w1, ink = 1, ch = 1, scaly = false) {
    const P = run(pts.map(q => [q[0], q[1]]), 8), n = P.length, Ls = [], Rs = [];
    P.forEach((q, i) => {
      const a = P[Math.max(i - 1, 0)], b = P[Math.min(i + 1, n - 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1e-6;
      const ww = lerp(w0, w1, i / (n - 1)) * 0.5 * (1 + 0.12 * Math.sin(i * 1.3 + 2));
      Ls.push([q[0] - dy / l * ww, q[1] + dx / l * ww]); Rs.push([q[0] + dy / l * ww, q[1] - dx / l * ww]);
    });
    if (w0 > 0.0055) {
      const poly = [...Ls, ...Rs.slice().reverse()];
      erase(poly);
      D0 = 0.004; wash(poly, { ch, stops: [[0, 0.10 * ink], [1, 0.20 * ink]], dir: [Ls[0][0], Ls[0][1], Rs[0][0], Rs[0][1]] }); D0 = 0;
      ribbon(Ls, { w: Math.min(0.004, w0 * 0.3), ink: 0.85 * ink, ch, breaks: 0.06 });
      ribbon(Rs, { w: Math.min(0.0045, w0 * 0.34), ink: 0.95 * ink, ch, breaks: 0.04 });
      D0 = 0.01;
      if (scaly) {
        // the old bark of a pine: scales, small curved strokes across the trunk
        for (let i = 3; i < n - 3; i += 2 + Math.floor(rand() * 2)) {
          const q = P[i], a = Ls[i], b = Rs[i], sgn = rand() < 0.5 ? -1 : 1;
          const m = [q[0] + (b[0] - a[0]) * R(-0.25, 0.25), q[1] + (b[1] - a[1]) * R(-0.25, 0.25)];
          const tx = P[Math.min(i + 1, n - 1)][0] - P[i - 1][0], ty = P[Math.min(i + 1, n - 1)][1] - P[i - 1][1], tl = Math.hypot(tx, ty) || 1e-6, s = lerp(w0, w1, i / (n - 1)) * 0.35;
          ribbon([[m[0] - tx / tl * s - ty / tl * s * 0.4 * sgn, m[1] - ty / tl * s + tx / tl * s * 0.4 * sgn], [m[0], m[1]], [m[0] + tx / tl * s - ty / tl * s * 0.4 * sgn, m[1] + ty / tl * s + tx / tl * s * 0.4 * sgn]], { w: 0.0016, ink: 0.65 * ink, ch, breaks: 0, taper: [0.2, 0.2], per: 3 });
        }
      } else for (let k = 0; k < Math.round(n / 6); k++) { const i = Math.floor(R(0.1, 0.9) * n), q = P[i]; dot(q[0] + R(-0.3, 0.3) * w0 * 0.5, q[1], R(0.0012, 0.0022), 0.8 * ink, { ch, ecc: 0.5 }); }
      D0 = 0;
    } else ribbon(pts, { w: w0, ink: 0.9 * ink, ch, breaks: 0, taper: [0.02, 0.4] });
  }
  // the leaves of a tree, round a point: first a pale wet underlayer, then the leaves over it, denser and darker underneath
  function foliage(cx, cy, r, kind, ink = 1, ch = 1) {
    const k30 = r / 0.03;
    D0 = 0.006; blob(cx, cy - r * 0.1, r * 1.1, r * 0.75, 0.12 * ink, { ch }); D0 = 0.012;
    const n = Math.round((kind === 'dot' ? 75 : kind === 'mi' ? 26 : 34) * k30 * k30) + 4;
    for (let k = 0; k < n; k++) {
      const a = rand() * 6.283, rr = r * Math.sqrt(rand()), px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr * 0.7;
      const shade = Math.max(0, -(py - cy) / (r * 0.7)), dk = ink * R(0.45, 0.8) * (0.75 + 0.45 * shade);
      if (kind === 'dot') dot(px, py, R(0.0022, 0.0036) * (0.5 + 0.5 * k30), dk, { ch, ecc: 0.7 });
      else if (kind === 'mi') blob(px, py, R(0.006, 0.011) * k30, R(0.003, 0.0055) * k30, dk * 0.55, { ch, g: gB, soft: 0.75, d: 0 });
      else if (kind === 'jie') { const L = 0.009 * (0.6 + 0.4 * k30); for (const sg of [-1, 1]) stroke([[px, py, 0.0024], [px + sg * L * 0.45, py - L, 0.0006]], { ch, ink: dk, hairs: 2, dry: 0.12, taper: [0.05, 0.7], per: 3 }); }
      else if (kind === 'ge') { const L = 0.009 * (0.6 + 0.4 * k30); for (const an of [-2.25, -1.57, -0.9]) stroke([[px, py, 0.0024], [px + Math.cos(an) * L, py + Math.sin(an) * L, 0.0006]], { ch, ink: dk, hairs: 2, dry: 0.12, taper: [0.05, 0.7], per: 3 }); }
      else if (kind === 'ring') { const rr2 = R(0.003, 0.0045) * (0.6 + 0.4 * k30); const pts = []; for (let j = 0; j <= 6; j++) { const t = j / 6 * 6.283; pts.push([px + Math.cos(t) * rr2, py + Math.sin(t) * rr2 * 0.7]); } ribbon(pts, { w: 0.0012, ink: dk, ch, breaks: 0.15, per: 2, swell: 0.4 }); }
    }
    D0 = 0;
  }
  // a tree: a trunk bending up to a fork, boughs and twigs from it; a crown of leaves of its kind round the twigs' ends
  function tree(o) {
    const { x, y, h, lean = 0, kind = 'dot', s = 1, ink = 1, ch = 1, crown = 1 } = o;
    const fork = [x + lean * h * 0.7, y + h * 0.6];
    const tw = 0.0075 * s;
    trunk([[x, y], [x + lean * h * 0.3 + R(-0.003, 0.003) * s, y + h * 0.33], fork], tw, tw * 0.6, ink, ch);
    const tips = [];
    const nb = 2 + Math.floor(rand() * 2);
    for (let b = 0; b < nb; b++) {
      const a = Math.PI / 2 + (b - (nb - 1) / 2) * R(0.5, 0.8) - lean * 1.5, L = h * R(0.28, 0.42);
      const e = [fork[0] + Math.cos(a) * L, fork[1] + Math.sin(a) * L], m = [fork[0] + Math.cos(a) * L * 0.5 + R(-0.004, 0.004) * s, fork[1] + Math.sin(a) * L * 0.5];
      ribbon([fork, m, e], { w: tw * 0.55, ink: 0.85 * ink, ch, breaks: 0, taper: [0.02, 0.6] });
      tips.push(e);
      for (let t = 0; t < (kind === 'bare' ? 4 : 2); t++) {
        const a2 = a + R(-0.8, 0.8) - (kind === 'bare' ? 0.4 * Math.sign(Math.cos(a)) : 0), L2 = L * R(0.3, 0.6);
        const q = [lerp(m[0], e[0], R(0.1, 0.9)), lerp(m[1], e[1], R(0.1, 0.9))], e2 = [q[0] + Math.cos(a2) * L2, q[1] + Math.sin(a2) * L2];
        ribbon([q, [lerp(q[0], e2[0], 0.5) + R(-0.003, 0.003), lerp(q[1], e2[1], 0.5)], e2], { w: tw * 0.3, ink: 0.8 * ink, ch, breaks: 0, taper: [0.02, 0.8] });
        tips.push(e2);
        if (kind === 'bare') for (let c = 0; c < 3; c++) { const a3 = a2 + R(-1.0, 1.0) - 0.5, L3 = L2 * R(0.25, 0.5), e3 = [e2[0] + Math.cos(a3) * L3, e2[1] + Math.sin(a3) * L3]; ribbon([e2, e3], { w: tw * 0.16, ink: 0.75 * ink, ch, breaks: 0, taper: [0.02, 0.9] }); }
      }
    }
    if (kind === 'bare') return;
    for (const q of tips) foliage(q[0] + R(-0.004, 0.004), q[1] + 0.006 * s, R(0.020, 0.030) * s * crown * (h / 0.12), kind, ink, ch);
  }
  // a fan of pine needles, and a pale wash under it
  function needleFan(cx, cy, s, ink = 1) {
    D0 = 0.006; blob(cx, cy + 0.007 * s, 0.034 * s, 0.015 * s, 0.13 * ink, { ch: 1 }); D0 = 0.012;
    for (let f = 0; f < 3; f++) {
      const ox = cx + (f - 1) * 0.017 * s + R(-0.002, 0.002), oy = cy + R(-0.002, 0.002) - Math.abs(f - 1) * 0.004 * s;
      for (let k = 0, m = 13; k < m; k++) {
        const a = Math.PI * (0.06 + 0.88 * k / (m - 1)) + R(-0.04, 0.04), L = R(0.019, 0.028) * s, ca = Math.cos(a), sa = Math.sin(a) * 0.78;
        stroke([[ox + ca * 0.002, oy + sa * 0.002, 0.0022 * s], [ox + ca * L * 0.6, oy + sa * L * 0.6, 0.0018 * s], [ox + ca * L, oy + sa * L, 0.0007]], { ch: 1, ink: ink * R(0.7, 0.95), hairs: 2, dry: 0.12, taper: [0.02, 0.6], per: 3 });
      }
    }
    D0 = 0;
  }
  function pine(trunkPts, w0, branches, clusters, ink = 1) {
    trunk(trunkPts, w0, w0 * 0.45, ink, 1, true);
    for (const b of branches) ribbon(b, { w: w0 * 0.42, ink: 0.85 * ink, ch: 1, breaks: 0.05, taper: [0.02, 0.6] });
    for (const [x, y, s] of clusters) needleFan(x, y, s, ink);
  }
  // a small pine on a far ridge or a cliff's brow: a leaning stroke, two or three flat clusters
  function smallPine(x, y, h, lean, s, ink = 1) {
    const e = [x + lean, y + h];
    ribbon([[x, y], [x + lean * 0.4 + R(-0.004, 0.004), y + h * 0.55], e], { w: 0.006 * s, ink: 0.9 * ink, ch: 1, breaks: 0, taper: [0.02, 0.5] });
    needleFan(e[0], e[1], 0.75 * s, ink); needleFan(x + lean * 0.55 + R(-0.01, 0.01), y + h * 0.6, 0.6 * s, ink);
    if (rand() < 0.6) needleFan(x + lean * 0.3 - 0.015 * s, y + h * 0.35, 0.5 * s, ink);
  }
  // bamboo in the rain: the culm in segments, a gap and a dark mark at each node; twigs; the leaves long, heavy, hanging
  // in clusters (个, 介, 分) along the twigs. The leaves are laid as the brush does it: pressed down at once, lifted slowly
  function bambooLeaf(x, y, a, L, wd, ink, sd) {
    const bend = sd * R(0.05, 0.18);
    stroke([[x, y, wd * 0.35], [x + Math.cos(a) * L * 0.3, y + Math.sin(a) * L * 0.3, wd], [x + Math.cos(a + bend * 0.5) * L * 0.65, y + Math.sin(a + bend * 0.5) * L * 0.65, wd * 0.7], [x + Math.cos(a + bend) * L, y + Math.sin(a + bend) * L, wd * 0.05]], { ch: 2, ink: ink * R(0.8, 1.0), hairs: 9, dry: 0.06, taper: [0.12, 0.8], per: 5 });
  }
  function bambooCluster(x, y, n, ink, s, sd, droop = 1) {
    const base = -Math.PI / 2 + sd * R(0.25, 0.75) * droop + (1 - droop) * sd * 1.2;
    for (let k = 0; k < n; k++) {
      const a = base + (k - (n - 1) / 2) * R(0.18, 0.32), L = R(0.045, 0.075) * s, wd = R(0.0065, 0.0095) * s;
      bambooLeaf(x + R(-0.004, 0.004) * s, y + R(-0.004, 0.004) * s, a, L, wd, ink, sd);
    }
  }
  function bamboo(x, y0, h, lean, ink, s = 1) {
    let p = [x, y0], a = Math.PI / 2 - lean;
    const n = Math.max(3, Math.round(h / (0.06 * s)));
    for (let i = 0; i < n; i++) {
      const L = h / n * R(0.85, 1.15); a += R(-0.025, 0.025) - lean * 0.06;
      const q = [p[0] + Math.cos(a) * L, p[1] + Math.sin(a) * L], g0 = 0.003 * s;
      const pa = [p[0] + Math.cos(a) * g0, p[1] + Math.sin(a) * g0], pb = [q[0] - Math.cos(a) * g0, q[1] - Math.sin(a) * g0];
      const wd = 0.0115 * s * (1 - 0.3 * i / n);
      // the culm: one press of the side of the brush per segment, paler in its middle
      stroke([[pa[0], pa[1], wd], [(pa[0] + pb[0]) / 2 + 0.0006, (pa[1] + pb[1]) / 2, wd * 0.96], [pb[0], pb[1], wd]], { ch: 2, ink: ink * 0.62, hairs: 10, dry: 0.12, taper: [0.01, 0.01], per: 4 });
      const nx = -Math.sin(a), ny = Math.cos(a);
      ribbon([[q[0] - nx * wd * 0.62, q[1] - ny * wd * 0.62 - 0.0012], [q[0], q[1] + 0.0016], [q[0] + nx * wd * 0.62, q[1] + ny * wd * 0.62 - 0.0012]], { w: 0.0034 * s, ink: ink * 0.95, ch: 2, breaks: 0, taper: [0.25, 0.25], per: 3 });
      if (i > n * 0.35 && rand() < 0.85) {
        const sd = rand() < 0.5 ? -1 : 1, ta = a + sd * R(0.45, 0.85), tl = R(0.04, 0.08) * s;
        const tq = [q[0] + Math.cos(ta) * tl, q[1] + Math.sin(ta) * tl];
        ribbon([q, [lerp(q[0], tq[0], 0.5), lerp(q[1], tq[1], 0.5) + 0.002], tq], { w: 0.0022 * s, ink: ink * 0.85, ch: 2, breaks: 0, taper: [0.05, 0.6] });
        bambooCluster(tq[0], tq[1], 3 + Math.floor(rand() * 3), ink, s, sd);
        bambooCluster(lerp(q[0], tq[0], 0.55), lerp(q[1], tq[1], 0.55), 2 + Math.floor(rand() * 3), ink, s, -sd);
        if (rand() < 0.5) bambooCluster(lerp(q[0], tq[0], 0.25), lerp(q[1], tq[1], 0.25), 2, ink, s, sd, 0.6);
      }
      p = q;
    }
    bambooCluster(p[0], p[1], 3 + Math.floor(rand() * 2), ink, s, rand() < 0.5 ? -1 : 1, 0.5);
  }

  /* ---------------------------------------------------------------- built things and people */
  function thatch(x, y, w, ink = 1) {
    const h = w * 0.42, rh = w * 0.42;
    const poly = [[x - w * 0.66, y + h - 0.002], [x - w * 0.30, y + h + rh], [x + w * 0.30, y + h + rh], [x + w * 0.66, y + h - 0.002], [x + w * 0.5, y + h - 0.004], [x + w * 0.5, y], [x - w * 0.5, y], [x - w * 0.5, y + h - 0.004]];
    erase(poly); cover(poly, 0.5);
    D0 = 0.004;
    wash([[x - w * 0.5, y], [x - w * 0.5, y + h], [x + w * 0.5, y + h], [x + w * 0.5, y]], { stops: [[0, 0.10 * ink], [1, 0.035 * ink]] });
    wash([[x - w * 0.66, y + h], [x - w * 0.30, y + h + rh], [x + w * 0.30, y + h + rh], [x + w * 0.66, y + h]], { stops: [[0, 0.08 * ink], [1, 0.22 * ink]] });
    D0 = 0.008;
    for (let k = 0; k < 18; k++) { const u = k / 17 - 0.5; stroke([[x + u * w * 0.58, y + h + rh - 0.002, 0.005], [x + u * w * 1.30, y + h + 0.001, 0.006]], { ink: R(0.35, 0.7) * ink, hairs: 5, dry: 0.6, taper: [0.05, 0.25], per: 4 }); }
    D0 = 0;
    ribbon([[x - w * 0.31, y + h + rh], [x, y + h + rh + 0.002], [x + w * 0.31, y + h + rh]], { w: 0.0055, ink: 0.95 * ink, breaks: 0 });
    ribbon([[x - w * 0.68, y + h - 0.003], [x, y + h + 0.002], [x + w * 0.68, y + h - 0.003]], { w: 0.003, ink: 0.85 * ink, breaks: 0.1 });
    for (const sx of [-0.5, 0.5]) ribbon([[x + w * sx, y + h - 0.004], [x + w * sx, y]], { w: 0.0022, ink: 0.6 * ink, breaks: 0 });
    ribbon([[x - w * 0.58, y], [x + w * 0.58, y + 0.0005]], { w: 0.0018, ink: 0.45 * ink, breaks: 0.3 });
    stroke([[x + w * 0.14, y + h * 0.66, 0.009], [x + w * 0.14, y + 0.002, 0.009]], { ink: 0.85 * ink, hairs: 6, dry: 0.08 });
    const wx = x - w * 0.24, wy = y + h * 0.55;
    for (let b = 0; b < 3; b++) ribbon([[wx - 0.005 + b * 0.005, wy - 0.006], [wx - 0.005 + b * 0.005, wy + 0.006]], { w: 0.0012, ink: 0.7 * ink, breaks: 0 });
    ribbon([[wx - 0.008, wy + 0.0065], [wx + 0.008, wy + 0.0065]], { w: 0.0014, ink: 0.7 * ink, breaks: 0 }); ribbon([[wx - 0.008, wy - 0.0065], [wx + 0.008, wy - 0.0065]], { w: 0.0014, ink: 0.7 * ink, breaks: 0 });
  }
  // a hall of a temple: a tiled roof, the eaves lifted at the corners; columns; steps
  function temple(x, y, w, ink = 1) {
    const h = w * 0.36, rh = w * 0.30;
    const eL = [x - w * 0.82, y + h + w * 0.08], eR = [x + w * 0.82, y + h + w * 0.08];
    const eave = [eL, [x - w * 0.62, y + h + 0.004], [x, y + h + 0.001], [x + w * 0.62, y + h + 0.004], eR];
    const rL = [x - w * 0.34, y + h + rh], rR = [x + w * 0.34, y + h + rh];
    const sil = [[x - w * 0.5, y - 0.01], [x - w * 0.5, y + h], eL, rL, rR, eR, [x + w * 0.5, y + h], [x + w * 0.5, y - 0.01]];
    erase(sil); cover(sil, 0.5);
    D0 = 0.004;
    wash([...eave, rR, rL], { stops: [[0, 0.30 * ink], [1, 0.18 * ink]] });
    wash([[x - w * 0.5, y], [x - w * 0.5, y + h], [x + w * 0.5, y + h], [x + w * 0.5, y]], { stops: [[0, 0.12 * ink], [1, 0.04 * ink]] });
    D0 = 0;
    ribbon(eave, { w: 0.0035, ink: 0.95 * ink, breaks: 0 });
    ribbon([[rL[0] - 0.004, rL[1] + 0.004], rL, rR, [rR[0] + 0.004, rR[1] + 0.004]], { w: 0.0045, ink: 0.95 * ink, breaks: 0 });
    ribbon([rL, [lerp(rL[0], eL[0], 0.5) + 0.004, lerp(rL[1], eL[1], 0.5) - 0.003], eL], { w: 0.0028, ink: 0.9 * ink, breaks: 0 });
    ribbon([rR, [lerp(rR[0], eR[0], 0.5) - 0.004, lerp(rR[1], eR[1], 0.5) - 0.003], eR], { w: 0.0028, ink: 0.9 * ink, breaks: 0 });
    D0 = 0.01;
    for (let k = 1; k < 12; k++) { const u = k / 12 - 0.5; ribbon([[x + u * w * 0.66, y + h + rh - 0.003], [x + u * w * 1.40, y + h + 0.004]], { w: 0.0013, ink: 0.55 * ink, breaks: 0 }); }
    for (const cxp of [-0.42, -0.14, 0.14, 0.42]) ribbon([[x + w * cxp, y + h - 0.002], [x + w * cxp, y]], { w: 0.0022, ink: 0.8 * ink, breaks: 0 });
    stroke([[x, y + h * 0.7, 0.012], [x, y + 0.002, 0.012]], { ink: 0.7 * ink, hairs: 6, dry: 0.15 });
    for (let k = 0; k < 3; k++) ribbon([[x - w * (0.55 + 0.06 * k), y - 0.004 * k], [x + w * (0.55 + 0.06 * k), y - 0.004 * k]], { w: 0.0016, ink: 0.55 * ink, breaks: 0.1 });
    D0 = 0;
  }
  // a pavilion on posts at the water's edge: a pointed roof with lifted eaves; a railing
  function pavilion(x, y, w, ink = 1) {
    const hp = w * 0.75, apex = [x, y + hp + w * 0.62], eL = [x - w * 0.85, y + hp + w * 0.12], eR = [x + w * 0.85, y + hp + w * 0.12];
    const sil = [[x - w * 0.55, y - 0.04], [x - w * 0.55, y + hp], eL, apex, eR, [x + w * 0.55, y + hp], [x + w * 0.55, y - 0.04]];
    erase(sil); cover(sil, 0.75);
    D0 = 0.004;
    wash([eL, [x - w * 0.6, y + hp + 0.002], [x + w * 0.6, y + hp + 0.002], eR, apex], { stops: [[0, 0.22 * ink], [1, 0.36 * ink]] });
    D0 = 0;
    ribbon([eL, [x - w * 0.6, y + hp + 0.003], [x, y + hp + 0.001], [x + w * 0.6, y + hp + 0.003], eR], { w: 0.003, ink: 0.95 * ink, breaks: 0 });
    ribbon([eL, [x - w * 0.42, y + hp + w * 0.26], apex], { w: 0.0028, ink: 0.9 * ink, breaks: 0 });
    ribbon([eR, [x + w * 0.42, y + hp + w * 0.26], apex], { w: 0.0028, ink: 0.9 * ink, breaks: 0 });
    ribbon([apex, [x, apex[1] + w * 0.12]], { w: 0.002, ink: 0.9 * ink, breaks: 0 });
    for (const sx of [-0.45, 0.45]) ribbon([[x + w * sx, y + hp], [x + w * sx, y - 0.035]], { w: 0.0024, ink: 0.85 * ink, breaks: 0 });
    for (const sx of [-0.15, 0.15]) ribbon([[x + w * sx, y], [x + w * sx, y - 0.032]], { w: 0.002, ink: 0.7 * ink, breaks: 0 });
    ribbon([[x - w * 0.6, y], [x + w * 0.6, y]], { w: 0.0026, ink: 0.85 * ink, breaks: 0 });
    ribbon([[x - w * 0.5, y + w * 0.22], [x + w * 0.5, y + w * 0.22]], { w: 0.0016, ink: 0.7 * ink, breaks: 0 });
    for (let k = 0; k <= 6; k++) { const xx = x - w * 0.45 + w * 0.9 * k / 6; ribbon([[xx, y], [xx, y + w * 0.22]], { w: 0.0011, ink: 0.6 * ink, breaks: 0 }); }
  }
  // the stone bridge, arched over the stream (the traveller crosses it on this curve: see ink.js)
  const BR = (u) => [3.62 + 0.40 * u, 0.255 + 0.07 * Math.sin(Math.PI * u)];
  function bridge() {
    const deck = []; for (let i = 0; i <= 14; i++) deck.push(BR(i / 14));
    const arch = []; for (let i = 0; i <= 14; i++) { const a = Math.PI * i / 14; arch.push([3.82 - Math.cos(a) * 0.12, 0.205 + Math.sin(a) * 0.082]); }
    const poly = [[3.595, 0.20], ...deck, [4.045, 0.20], ...arch.slice().reverse()];
    erase(poly); cover(poly, 0.75);
    D0 = 0.004; wash(poly, { stops: [[0, 0.05], [1, 0.17]] }); D0 = 0;
    ribbon(deck, { w: 0.0065, ink: 0.95, breaks: 0.03 });
    const rail = deck.map(q => [q[0], q[1] + 0.016]); ribbon(rail, { w: 0.0026, ink: 0.85, breaks: 0.06 });
    for (let i = 1; i < 14; i += 2) { const q = deck[i]; ribbon([[q[0], q[1] + 0.001], [q[0], q[1] + 0.0175]], { w: 0.0022, ink: 0.85, breaks: 0 }); }
    ribbon(arch, { w: 0.0055, ink: 0.92, breaks: 0.04 });
    const arch2 = arch.map(q => [3.82 + (q[0] - 3.82) * 1.12, 0.205 + (q[1] - 0.205) * 1.16]);
    ribbon(arch2, { w: 0.0022, ink: 0.6, breaks: 0.2 });
    D0 = 0.01;
    for (let i = 1; i < 14; i++) ribbon([arch[i], arch2[i]], { w: 0.0015, ink: 0.55, breaks: 0 });
    for (let k = 0; k < 22; k++) {
      const x = R(3.63, 4.01), yTop = BR((x - 3.62) / 0.40)[1] - 0.006, dxa = x - 3.82;
      const archY = Math.abs(dxa) < 0.134 ? 0.205 + Math.sqrt(Math.max(0, 0.134 ** 2 - dxa * dxa)) / 0.134 * 0.095 : 0.205;
      if (yTop - archY < 0.012) continue;
      const yy = R(archY + 0.004, yTop); ribbon([[x - 0.008, yy], [x + 0.008, yy + 0.0005]], { w: 0.0013, ink: 0.42, breaks: 0 });
    }
    D0 = 0;
  }
  function scholar(x, y, s = 1) {
    const poly = [[x - 0.014 * s, y], [x - 0.009 * s, y + 0.016 * s], [x - 0.003 * s, y + 0.024 * s], [x + 0.004 * s, y + 0.022 * s], [x + 0.008 * s, y + 0.010 * s], [x + 0.018 * s, y + 0.004 * s], [x + 0.018 * s, y]];
    erase(poly); cover(poly, 1);
    D0 = 0.004; wash(poly, { stops: [[0, 0.04], [1, 0.12]] }); D0 = 0;
    ribbon(poly.slice(0, 6), { w: 0.0017 * s, ink: 0.85, breaks: 0.05, swell: 0.6 });
    ribbon([[x - 0.014 * s, y], [x + 0.018 * s, y]], { w: 0.0013 * s, ink: 0.55, breaks: 0 });
    dot(x + 0.0008 * s, y + 0.028 * s, 0.0036 * s, 0.9, { ecc: 0.9, ang: 0 });
    dot(x - 0.0012 * s, y + 0.0325 * s, 0.0018 * s, 0.95, { ecc: 1 });
    ribbon([[x - 0.004 * s, y + 0.0095 * s], [x + 0.031 * s, y + 0.0062 * s]], { w: 0.0026 * s, ink: 0.95, breaks: 0, swell: 0.2 });
    ribbon([[x + 0.002 * s, y + 0.019 * s], [x + 0.010 * s, y + 0.012 * s], [x + 0.015 * s, y + 0.0095 * s]], { w: 0.0016 * s, ink: 0.8, breaks: 0 });
  }
  function villager(x, y, s = 1, o = {}) {
    for (const sx of [-1, 1]) ribbon([[x + sx * 0.0012 * s, y + 0.008 * s], [x + sx * 0.0022 * s, y]], { w: 0.0012 * s, ink: 0.8, breaks: 0 });
    ribbon([[x, y + 0.006 * s], [x + 0.0008 * s, y + 0.017 * s]], { w: 0.0055 * s, ink: 0.7, breaks: 0, swell: 0.3 });
    dot(x + 0.0008 * s, y + 0.0205 * s, 0.0024 * s, 0.9, { ecc: 0.95 });
    ribbon([[x - 0.0065 * s, y + 0.0205 * s], [x + 0.0008 * s, y + 0.0262 * s], [x + 0.0082 * s, y + 0.0205 * s]], { w: 0.0019 * s, ink: 0.9, breaks: 0 });
    if (o.hoe) ribbon([[x - 0.007 * s, y + 0.003 * s], [x + 0.011 * s, y + 0.025 * s], [x + 0.016 * s, y + 0.022 * s]], { w: 0.0012 * s, ink: 0.8, breaks: 0 });
    if (o.basket) { ribbon([[x - 0.012 * s, y + 0.016 * s], [x + 0.013 * s, y + 0.019 * s]], { w: 0.0012 * s, ink: 0.8, breaks: 0 }); for (const e of [-0.012, 0.013]) dot(x + e * s, y + 0.010 * s, 0.003 * s, 0.6, { ecc: 1.2, ang: 0 }); }
  }
  // grass along a bank: a broken line, tufts on it
  function bank(a, b, ink = 0.6, tufts = 6) {
    ribbon([a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.006], b], { w: 0.0035, ink, breaks: 0.25 });
    for (let k = 0; k < tufts; k++) {
      const u = rand(), x = lerp(a[0], b[0], u), y = lerp(a[1], b[1], u) + 0.004 + 0.006 * Math.sin(Math.PI * u);
      for (let j = 0, nj = 2 + Math.floor(rand() * 4); j < nj; j++) stroke([[x, y, 0.002], [x + 0.007 * (j - nj / 2) + R(-0.003, 0.003), y + R(0.010, 0.02), 0.0006]], { ch: 2, ink: ink * 1.1, hairs: 1, dry: 0.1, per: 2 });
    }
  }
  function ripples(x0, x1, y0, y1, n, ink = 0.2) {
    D0 = 0.015;
    for (let k = 0; k < n; k++) { const x = R(x0, x1), y = R(y0, y1), L = R(0.03, 0.14); ribbon([[x, y], [x + L * 0.5, y + R(-0.0015, 0.0015)], [x + L, y]], { w: 0.0015, ink: ink * R(0.6, 1.2), breaks: 0.25, taper: [0.25, 0.35] }); }
    D0 = 0;
  }

  /* ================================================================ the painting, from the back to the front */
  // ---- the main peak: up from the mist to the top of the picture, a summit and two shoulders
  const mainTop = profile([[0.88, 0.29], [1.00, 0.38], [1.10, 0.47], [1.19, 0.52], [1.27, 0.56], [1.33, 0.66], [1.38, 0.725], [1.44, 0.70], [1.50, 0.75],
    [1.55, 0.87], [1.60, 0.935], [1.665, 0.93], [1.72, 0.865], [1.78, 0.80], [1.84, 0.785], [1.905, 0.805], [1.955, 0.765], [2.02, 0.70], [2.08, 0.665], [2.15, 0.64],
    [2.23, 0.575], [2.32, 0.50], [2.40, 0.43], [2.47, 0.38]], 0.024, 9, 3);
  massif({ x0: 0.88, x1: 2.47, top: mainTop, base: 0.33, rowH: 0.15, wMin: 0.12, wMax: 0.26, ink: 0.82, cov: 0.5, side: 1, moss: 1, fade: 0.15, rk0: 0.28, rkStep: 0.2, rkMax: 1.15 });
  farTrees([...along(mainTop, 1.30, 1.44, 0.011), ...along(mainTop, 1.55, 1.69, 0.010), ...along(mainTop, 1.84, 1.98, 0.012), ...along(mainTop, 1.12, 1.22, 0.013)], 0.9, 0.6);
  // a small temple on the shoulder, among pines
  smallPine(1.955, 0.655, 0.05, -0.012, 0.6, 0.8);
  temple(2.02, 0.648, 0.05, 0.9);
  smallPine(2.075, 0.640, 0.055, 0.015, 0.65, 0.85);
  tree({ x: 2.105, y: 0.632, h: 0.06, lean: 0.05, kind: 'dot', s: 0.6, ink: 0.8 });
  // ---- the waterfall: two cliffs and the ledge between its two leaps; the gap the water falls through
  const lipL = (y) => 2.452 + 0.007 * Math.sin(y * 37 + 1) + 0.006 * (vn(y * 23 + 5) - 0.5), lipR = (y) => 2.528 + 0.007 * Math.sin(y * 31 + 4) + 0.006 * (vn(y * 27 + 9) - 0.5);
  const topR = (x) => (x < 2.66 ? 0.885 : 0.885 - Math.pow(x - 2.66, 1.1) * 1.6) + 0.02 * (crag(x * 11, 7) - 0.55);
  massif({ x0: 2.53, x1: 2.98, top: topR, base: 0.14, rowH: 0.20, wMin: 0.10, wMax: 0.20, axe: true, ink: 1.0, cov: 0.75, side: -1, moss: 0.8, fade: 0.05, edgeL: lipR, rk0: 0.55, rkStep: 0.15, rkMax: 1.1 });
  const topL = (x) => Math.min(1.14, 0.58 + (x - 2.02) * 4.2) + 0.02 * (crag(x * 11, 9) - 0.55);
  massif({ x0: 2.02, x1: 2.45, top: topL, base: 0.14, rowH: 0.20, wMin: 0.10, wMax: 0.20, axe: true, ink: 1.0, cov: 0.75, side: 1, moss: 0.8, fade: 0.05, edgeR: lipL, rk0: 0.55, rkStep: 0.15, rkMax: 1.1 });
  lump({ cx: 2.49, yb: 0.50, w: 0.13, h: 0.05, depth: 0.06, axe: true, ink: 1.1, cov: 0.75, moss: 5, side: 1 });
  // (the falling water hides the far hills behind it)
  const fallUp = [[2.443, 0.53], [2.443, 1.05], [2.535, 1.05], [2.535, 0.53]], fallLo = [[2.443, 0.15], [2.443, 0.51], [2.535, 0.51], [2.535, 0.15]];
  cover(fallUp, 0.75); cover(fallLo, 0.75);
  wash(fallUp, { stops: [[0, 0], [1, 0]] }); wash(fallLo, { stops: [[0, 0], [1, 0]] });
  // its lips: broken dry lines down each side of the white water
  const lipPts = (f, y0, y1) => { const o = []; for (let y = y0; y >= y1; y -= 0.02) o.push([f(y), y]); return o; };
  ribbon(lipPts(lipL, 1.02, 0.56), { w: 0.005, ink: 0.9, breaks: 0.2 }); ribbon(lipPts(lipR, 0.88, 0.56), { w: 0.005, ink: 0.9, breaks: 0.2 });
  ribbon(lipPts(lipL, 0.49, 0.17), { w: 0.0045, ink: 0.8, breaks: 0.25 }); ribbon(lipPts(lipR, 0.49, 0.17), { w: 0.0045, ink: 0.8, breaks: 0.25 });
  // pines on the cliffs: on the right one's brow, further down it, and one hanging from a crack in the left one
  smallPine(2.585, topR(2.585) - 0.004, 0.07, 0.03, 1.0);
  smallPine(2.70, topR(2.70) - 0.004, 0.06, 0.04, 0.9);
  smallPine(2.83, topR(2.83) - 0.004, 0.055, 0.035, 0.85);
  pine([[2.405, 0.80], [2.43, 0.795], [2.455, 0.81], [2.47, 0.835]], 0.0075, [[[2.455, 0.81], [2.49, 0.80], [2.515, 0.79]]], [[2.475, 0.845, 0.75], [2.515, 0.80, 0.7], [2.44, 0.83, 0.6]], 0.95);
  farTrees(along(topL, 2.03, 2.13, 0.012), 0.9, 0.6);
  farTrees(along(topR, 2.88, 2.96, 0.014), 0.9, 0.6);
  // the pool at its foot: dark wet stones
  for (const [x, y, w, h] of [[2.35, 0.128, 0.09, 0.016], [2.63, 0.126, 0.11, 0.02], [2.74, 0.142, 0.06, 0.012], [2.41, 0.112, 0.05, 0.01], [2.88, 0.124, 0.08, 0.014]]) lump({ cx: x, yb: y, w, h, depth: 0.012, axe: true, ink: 1.3, cov: 1, moss: 2, side: 1 });
  ripples(2.25, 2.95, 0.04, 0.12, 9, 0.22);
  // ---- the low hills behind the village
  const topV = (x) => 0.27 + (0.17 + 0.035 * Math.sin(x * 7.0 + 1.0) + 0.02 * Math.sin(x * 17 + 2) + 0.012 * (crag(x * 8, 4) - 0.5)) * Math.min(1, Math.max(0, (x - 3.74) / 0.14), Math.max(0, (4.99 - x) / 0.12));
  massif({ x0: 3.74, x1: 4.99, top: topV, base: 0.28, rowH: 0.10, wMin: 0.10, wMax: 0.20, ink: 0.5, cov: 0.5, side: 1, moss: 1.2, fade: 0.08, outline: 0.75, tex: 0.75, rk0: 0.5, rkStep: 0.25, rkMax: 1.1 });
  farTrees([...along(topV, 3.80, 3.98, 0.012), ...along(topV, 4.30, 4.52, 0.012), ...along(topV, 4.75, 4.94, 0.013)], 0.85, 0.5);
  // ---- the village: trees behind, the houses, trees in front, fences, people about
  tree({ x: 4.08, y: 0.33, h: 0.13, lean: 0.02, kind: 'jie', s: 1.0 });
  tree({ x: 4.215, y: 0.36, h: 0.15, lean: -0.03, kind: 'dot', s: 1.1 });
  tree({ x: 4.365, y: 0.355, h: 0.14, lean: 0.02, kind: 'mi', s: 1.0, ink: 0.9 });
  tree({ x: 4.505, y: 0.37, h: 0.16, lean: -0.02, kind: 'ring', s: 1.1 });
  tree({ x: 4.655, y: 0.35, h: 0.13, lean: 0.04, kind: 'ge', s: 1.0 });
  tree({ x: 4.80, y: 0.335, h: 0.15, lean: -0.02, kind: 'bare', s: 1.0 });
  thatch(4.13, 0.300, 0.075); thatch(4.29, 0.330, 0.062); thatch(4.43, 0.305, 0.072); thatch(4.585, 0.335, 0.058); thatch(4.71, 0.298, 0.066);
  D0 = 0.01;
  for (const [a, b] of [[[4.04, 0.29], [4.085, 0.29]], [[4.175, 0.296], [4.25, 0.30]], [[4.475, 0.30], [4.545, 0.302]], [[4.755, 0.293], [4.83, 0.29]]]) {
    ribbon([[a[0], a[1] + 0.012], [b[0], b[1] + 0.012]], { w: 0.0014, ink: 0.6, breaks: 0.15 });
    for (let k = 0; k <= 5; k++) { const x = lerp(a[0], b[0], k / 5), y = lerp(a[1], b[1], k / 5); ribbon([[x, y], [x + 0.0005, y + 0.016]], { w: 0.0013, ink: 0.65, breaks: 0 }); }
  }
  D0 = 0;
  tree({ x: 4.255, y: 0.285, h: 0.10, lean: 0.03, kind: 'dot', s: 0.85 });
  tree({ x: 4.62, y: 0.285, h: 0.11, lean: -0.03, kind: 'jie', s: 0.9 });
  villager(4.50, 0.287, 1.0, { hoe: true }); villager(4.355, 0.293, 0.95, { basket: true }); villager(4.79, 0.282, 0.9);
  bank([4.02, 0.272], [4.95, 0.268], 0.55, 14);
  // ---- the stream from the pool, the bridge over it, the willow at its end
  bank([2.98, 0.16], [3.58, 0.205], 0.55, 8); bank([3.25, 0.06], [3.65, 0.085], 0.5, 5);
  bridge();
  trunk([[3.50, 0.19], [3.515, 0.27], [3.535, 0.35], [3.56, 0.41]], 0.012, 0.006, 1, 1);
  ribbon([[3.525, 0.31], [3.48, 0.36], [3.45, 0.39]], { w: 0.005, ink: 0.85, ch: 1, breaks: 0 }); ribbon([[3.55, 0.38], [3.60, 0.42], [3.63, 0.415]], { w: 0.004, ink: 0.8, ch: 1, breaks: 0 });
  D0 = 0.01;
  for (let k = 0; k < 64; k++) {
    const x0 = 3.44 + 0.21 * rand(), y0 = 0.40 + 0.05 * Math.sin((x0 - 3.44) / 0.21 * Math.PI) + 0.01 * rand(), L = 0.08 + 0.2 * rand(), sw = 0.008 * (rand() - 0.5);
    stroke([[x0, y0, 0.0022], [x0 + 0.004 + sw, y0 - L * 0.35, 0.0018], [x0 + 0.003 + sw * 2, y0 - L * 0.75, 0.0014], [x0 + sw * 2.5, y0 - L, 0.0006]], { ch: 2, ink: 0.25 + 0.45 * rand(), hairs: 2, dry: 0.15, taper: [0.1, 0.5], per: 6 });
    if (rand() < 0.5) for (let j = 0; j < 4; j++) { const u = R(0.3, 0.95), px = x0 + sw * 2.5 * u, py = y0 - L * u; stroke([[px, py, 0.0018], [px + R(-0.006, 0.006), py - 0.007, 0.0004]], { ch: 2, ink: 0.4 + 0.3 * rand(), hairs: 2, dry: 0.1, per: 2 }); }
  }
  D0 = 0;
  // the pavilion over the water
  pavilion(4.875, 0.212, 0.042);
  // ---- the bamboo grove, close: the far culms pale, the near ones dark; rocks at their feet
  for (const [x, h, l, ink, s] of [[3.03, 0.50, 0.05, 0.34, 0.85], [3.15, 0.57, -0.02, 0.30, 0.85], [3.26, 0.47, -0.06, 0.36, 0.85], [3.36, 0.41, -0.10, 0.32, 0.8], [3.09, 0.42, 0.10, 0.38, 0.8], [3.21, 0.36, 0.04, 0.30, 0.8]]) bamboo(x, 0.02, h, l, ink, s);
  for (const [x, h, l, ink, s] of [[2.99, 0.60, 0.08, 0.95, 1.2], [3.065, 0.66, 0.02, 0.9, 1.25], [3.19, 0.62, -0.04, 1.0, 1.2], [3.30, 0.54, -0.09, 0.92, 1.15], [3.125, 0.50, 0.13, 0.85, 1.1]]) bamboo(x, -0.01, h, l, ink, s);
  lump({ cx: 3.08, yb: -0.02, w: 0.20, h: 0.075, depth: 0.04, ink: 1.15, cov: 1, moss: 6, side: 1 });
  lump({ cx: 3.27, yb: -0.03, w: 0.13, h: 0.06, depth: 0.04, ink: 1.15, cov: 1, moss: 4, side: 1 });
  bank([3.18, 0.045], [3.42, 0.05], 0.6, 6);
  // ---- the near cliff: its blocks, its pine reaching out over the water, the man with his qin
  const C = [[-0.04, 0.50], [0.07, 0.525], [0.16, 0.50], [0.25, 0.44], [0.34, 0.345], [0.44, 0.235], [0.53, 0.125], [0.62, 0.0]];
  const CP = run(C.map(q => [q[0], q[1]]), 20);
  const topA = (x) => { for (let i = 0; i < CP.length - 1; i++) if (x <= CP[i + 1][0]) { const t = Math.max(0, Math.min(1, (x - CP[i][0]) / (CP[i + 1][0] - CP[i][0] || 1e-6))); return lerp(CP[i][1], CP[i + 1][1], t) + 0.014 * (crag(x * 14, 2) - 0.55); } return -0.1; };
  massif({ x0: -0.04, x1: 0.625, top: topA, base: -0.06, rowH: 0.20, wMin: 0.14, wMax: 0.26, axe: true, ink: 1.1, cov: 1, side: 1, moss: 1.4, fade: 0, sc: 1.3, outline: 1.3, rk0: 0.7, rkStep: 0.15, rkMax: 1.2 });
  pine([[0.245, 0.43], [0.265, 0.50], [0.305, 0.565], [0.38, 0.595], [0.47, 0.588], [0.56, 0.566], [0.64, 0.548]], 0.017,
    [[[0.33, 0.578], [0.305, 0.63], [0.275, 0.655]], [[0.47, 0.588], [0.485, 0.625], [0.50, 0.645]], [[0.56, 0.566], [0.595, 0.59], [0.625, 0.61]], [[0.63, 0.55], [0.67, 0.53], [0.70, 0.50]], [[0.40, 0.594], [0.42, 0.615]]],
    [[0.27, 0.665, 1.7], [0.325, 0.635, 1.45], [0.40, 0.625, 1.35], [0.50, 0.652, 1.7], [0.455, 0.607, 1.2], [0.555, 0.603, 1.35], [0.625, 0.62, 1.55], [0.665, 0.565, 1.3], [0.71, 0.505, 1.4], [0.355, 0.662, 1.2], [0.585, 0.635, 1.1], [0.30, 0.69, 1.0]], 1.0);
  scholar(0.10, topA(0.10) - 0.004, 1.9);
  bank([-0.03, topA(-0.03) - 0.002], [0.06, topA(0.06) - 0.002], 0.6, 5); bank([0.15, topA(0.15)], [0.23, topA(0.23)], 0.6, 4);
  ripples(0.45, 1.6, 0.03, 0.27, 14, 0.18);
  // ---- reeds in the near water at the river's end, the far ones paler; two in flower, their plumes nodding
  for (let k = 0; k < 16; k++) {
    const far = k < 6, x0 = 5.0 + k * 0.022 + 0.02 * rand(), h = (far ? 0.12 : 0.16) + 0.16 * rand(), lean = 0.04 + 0.06 * rand() * (k % 3 === 0 ? -1 : 1);
    stroke([[x0, -0.01, 0.009], [x0 + lean * 0.3, h * 0.5, 0.008], [x0 + lean * 0.8, h * 0.85, 0.005], [x0 + lean * 1.4, h * 0.95, 0.001]], { ch: 2, ink: far ? 0.3 + 0.15 * rand() : 0.55 + 0.35 * rand(), hairs: 6, dry: 0.3, taper: [0.02, 0.5] });
  }
  for (const [x0, h, lean] of [[5.09, 0.33, 0.05], [5.16, 0.29, 0.03], [5.25, 0.26, -0.02]]) {
    const tip = [x0 + lean, h];
    stroke([[x0, -0.01, 0.004], [x0 + lean * 0.4, h * 0.55, 0.0035], [tip[0], tip[1], 0.003]], { ch: 2, ink: 0.7, hairs: 3, dry: 0.2, taper: [0.02, 0.1] });
    for (let j = 0; j < 9; j++) { const a = -0.35 - 0.12 * j + 0.08 * rand(); stroke([[tip[0], tip[1], 0.004], [tip[0] + Math.cos(a) * 0.018, tip[1] + Math.sin(a) * 0.012 - 0.003 * j, 0.003], [tip[0] + Math.cos(a) * 0.032, tip[1] + Math.sin(a) * 0.02 - 0.006 * j, 0.001]], { ch: 2, ink: 0.45, hairs: 3, dry: 0.4 }); }
  }
  ripples(3.45, 4.05, 0.02, 0.18, 8, 0.18); ripples(4.05, 4.95, 0.04, 0.24, 10, 0.16); ripples(4.95, 5.55, 0.02, 0.19, 10, 0.18);
  // ---- the water, and where what stands in it hangs its reflection from
  water.push({ poly: [[2.18, -0.05], [2.18, 0.15], [2.98, 0.15], [2.98, -0.05]], axis: 0.15 });
  water.push({ poly: [[3.43, -0.05], [3.43, 0.205], [4.05, 0.205], [4.05, -0.05]], axis: 0.205 });
  water.push({ poly: [[4.05, -0.05], [4.05, 0.268], [4.83, 0.268], [4.83, -0.05]], axis: 0.27 });
  water.push({ poly: [[4.83, -0.05], [4.83, 0.205], [5.6, 0.205], [5.6, -0.05]], axis: 0.205 });
  return { brush: gB.canvas, wash: gW.canvas, ops, water };
}

/* ---------------------------------------------------------------- when each mark is laid
   F(p): when the painting reaches p (0 … 1 of the light's way; from the brush's nearest passing, spreading out a
   little). Each stroke starts at F of where it starts, and is drawn along at the brush's pace; each wash spreads out
   from where it was touched. Drawn into two maps at half the painting's resolution, each channel for its own layer;
   where marks overlap, the earliest wins. With no F, everything is painted already. */
function times(sc, F, cS, cW) {
  const w = cS.width, h = cS.height, k = w / PW;
  const prep = (c) => { const g = c.getContext('2d'); g.globalCompositeOperation = 'source-over'; g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'darken'; g.lineCap = 'round'; g.lineJoin = 'round'; return g; };
  const gS = prep(cS), gT = prep(cW);
  const XX = x => x * PS * k, YY = y => (1 - y) * PS * k;
  const col = (ch, t) => { const v = Math.round(255 * Math.max(0, Math.min(0.985, t))); return ch === 0 ? `rgb(${v},255,255)` : ch === 1 ? `rgb(255,${v},255)` : `rgb(255,255,${v})`; };
  for (const op of sc.ops) {
    const g = op.wash ? gT : gS;
    const t0 = F ? F(op.pts ? op.pts[0] : op.c) + op.d : -1;
    if (op.pts) {
      const P = op.pts; g.lineWidth = op.w * PS * k * 1.3 + 2.0;
      if (!F) { g.strokeStyle = col(op.ch, 0); g.beginPath(); P.forEach((q, i) => i ? g.lineTo(XX(q[0]), YY(q[1])) : g.moveTo(XX(q[0]), YY(q[1]))); g.stroke(); continue; }
      let s = 0;
      for (let i = 0; i < P.length - 1; i++) {
        const l = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]);
        g.strokeStyle = col(op.ch, t0 + s / BRUSH_V); g.beginPath(); g.moveTo(XX(P[i][0]), YY(P[i][1])); g.lineTo(XX(P[i + 1][0]), YY(P[i + 1][1])); g.stroke();
        s += l;
      }
    } else {
      const cx = XX(op.c[0]), cy = YY(op.c[1]), rr = op.r * PS * k * 1.15 + 3;
      let fill = col(op.ch, 0);
      if (F) { fill = g.createRadialGradient(cx, cy, 0, cx, cy, rr); fill.addColorStop(0, col(op.ch, t0)); fill.addColorStop(1, col(op.ch, t0 + op.r / WASH_V)); }
      g.fillStyle = fill; g.strokeStyle = fill; g.lineWidth = 6;
      g.beginPath();
      if (op.poly) { op.poly.forEach((q, i) => i ? g.lineTo(XX(q[0]), YY(q[1])) : g.moveTo(XX(q[0]), YY(q[1]))); g.closePath(); g.fill(); g.stroke(); }
      else { g.ellipse(cx, cy, (op.ell ? op.ell[0] : op.r) * PS * k + 2, (op.ell ? op.ell[1] : op.r) * PS * k + 2, 0, 0, 6.2832); g.fill(); }
    }
  }
  // the water, in the wash map's blue: the line its reflections hang from (white where there is none)
  for (const Wt of sc.water) { gT.fillStyle = `rgb(255,255,${Math.round(Wt.axis * 255)})`; gT.beginPath(); Wt.poly.forEach((q, i) => i ? gT.lineTo(XX(q[0]), YY(q[1])) : gT.moveTo(XX(q[0]), YY(q[1]))); gT.closePath(); gT.fill(); }
}

YL.INKSCROLL = { SL, PS, PW, PH, TS, paint, times };
})();
