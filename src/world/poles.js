import * as THREE from 'three';
import { PAT } from '../builder.js';
import { col } from '../util.js';
import { quv } from './atlas.js';
import { lampHead } from './props.js';

// ---------------------------------------------------------------------------
// Concrete utility poles, cross arms, transformers and the web of wires that
// makes Japanese streets look the way they do.
// ---------------------------------------------------------------------------

// Build one pole. dir: unit vector (x,z) along the wire line. Returns attachment points.
function pole(ctx, x, y, z, dir, o = {}) {
  const E = ctx.E, rng = ctx.rng;
  ctx.chunk(x, z);
  const H = o.h || rng.range(11, 12.5);
  const rot = Math.atan2(dir.x, dir.z); // local +z along the line
  const att = { hv: [], lv: [], tel: [], drop: null, base: new THREE.Vector3(x, y, z) };
  E.frame(x, y, z, rot, () => {
    E.with({ color: col('#b9b8b1'), pat: PAT.CONCRETE, gloss: 0.2, weather: 0.5, vbase: 0 }, () => E.cyl(0, 0, 0, 0.19, H, 10, true, 0.13));
    // yellow/black guard sleeve at the base
    if (o.guard ?? rng.chance(0.5)) {
      E.with({ color: col('#e6c229'), pat: PAT.PLAIN, gloss: 0.4 }, () => E.cyl(0, 0, 0, 0.205, 1.8, 10, false, 0.2));
      E.with({ color: col('#1c1c1c'), pat: PAT.PLAIN, gloss: 0.4 }, () => {
        for (let k = 0; k < 4; k++) E.cyl(0, 0.1 + k * 0.45, 0, 0.207, 0.2, 10, false, 0.206);
      });
    }
    // step bolts
    E.with({ color: col('#8d8f8f'), pat: PAT.METAL, gloss: 0.4 }, () => {
      for (let yy = 2.6, k = 0; yy < H - 1.5; yy += 0.45, k++) {
        const s = k % 2 ? 1 : -1;
        E.box(-0.015 + s * 0.0, yy, -0.015, 0.015, yy + 0.03, 0.015);
        E.box(s * 0.14, yy, -0.015, s * 0.33, yy + 0.03, 0.015);
      }
    });
    // top cross arm with 3 HV insulators
    const arm = (yy, w, n, list, insul = true) => {
      E.with({ color: col('#8b8d8c'), pat: PAT.METAL, gloss: 0.4 }, () => E.box(-w / 2, yy - 0.05, -0.05, w / 2, yy + 0.05, 0.05));
      for (let i = 0; i < n; i++) {
        const xx = -w / 2 + 0.12 + (i / Math.max(1, n - 1)) * (w - 0.24);
        if (insul) E.with({ color: col('#e8e6e0'), pat: PAT.PLAIN, gloss: 0.6 }, () => E.cyl(xx, yy + 0.05, 0, 0.045, 0.16, 6, true, 0.035));
        list.push(ctx.toWorld(xx, yy + 0.2, 0));
      }
    };
    arm(H - 0.25, 1.8, 3, att.hv);
    if (o.second ?? rng.chance(0.5)) arm(H - 1.1, 1.5, 3, att.hv);
    // LV vertical rack
    const lvY = H - 2.6;
    E.with({ color: col('#8b8d8c'), pat: PAT.METAL, gloss: 0.4 }, () => E.box(0.19, lvY - 1.0, -0.04, 0.24, lvY + 0.1, 0.04));
    for (let i = 0; i < 3; i++) {
      E.with({ color: col('#e8e6e0'), pat: PAT.PLAIN, gloss: 0.6 }, () => E.box(0.24, lvY - i * 0.4 - 0.05, -0.04, 0.34, lvY - i * 0.4 + 0.05, 0.04));
      att.lv.push(ctx.toWorld(0.36, lvY - i * 0.4, 0));
    }
    att.drop = ctx.toWorld(0.36, lvY - 0.8, 0);
    // transformer
    if (o.trans ?? rng.chance(0.35)) {
      E.with({ color: col('#9ea3a5'), pat: PAT.METAL, gloss: 0.45, weather: 0.3 }, () => {
        const n = rng.int(1, 3);
        E.box(-0.9, lvY + 0.25, -0.35, 0.2, lvY + 0.33, 0.35);
        for (let i = 0; i < n; i++) {
          E.cyl(-0.45 + (i - (n - 1) / 2) * 0.0, lvY + 0.33 + i * 0.0, (i - (n - 1) / 2) * 0.62, 0.27, 0.95, 10);
          E.cyl(-0.45, lvY + 1.28, (i - (n - 1) / 2) * 0.62, 0.29, 0.06, 10);
        }
      });
    }
    // telecom cables + closure
    for (const yy of [H - 5.0, H - 5.6]) {
      E.with({ color: col('#6f7170'), pat: PAT.METAL }, () => E.box(-0.28, yy - 0.04, -0.04, -0.19, yy + 0.04, 0.04));
      att.tel.push(ctx.toWorld(-0.3, yy, 0));
    }
    if (rng.chance(0.5)) E.with({ color: col('#1f2022'), pat: PAT.PLAIN, gloss: 0.3 }, () => E.box(-0.5, H - 5.35, -0.4, -0.28, H - 5.05, 0.4));
    // ad plate & address plate
    ctx.inSink('atlas', () => {
      if (o.ad !== false && rng.chance(0.6)) {
        const r = ctx.atlasRects['ad' + rng.int(0, 3)];
        E.with({ color: col('#ffffff'), pat: PAT.PLAIN, gloss: 0.3, weather: 0 }, () => {
          E.frame(0, 0, 0, Math.PI, () => E.quad([-0.17, 2.0, 0.21], [0.17, 2.0, 0.21], [0.17, 3.5, 0.21], [-0.17, 3.5, 0.21], quv(r), [0, 0, 1]));
        });
      }
      if (rng.chance(0.4)) {
        const r = ctx.atlasRects.address;
        E.with({ color: col('#ffffff'), pat: PAT.PLAIN, gloss: 0.3 }, () => E.frame(0, 0, 0, -Math.PI / 2, () => E.quad([-0.22, 1.7, 0.2], [0.22, 1.7, 0.2], [0.22, 1.86, 0.2], [-0.22, 1.86, 0.2], quv(r), [0, 0, 1])));
      }
    });
    // pole number tag
    E.with({ color: col('#e9e6dc'), pat: PAT.PLAIN, gloss: 0.3 }, () => E.box(-0.07, 3.8, 0.13, 0.07, 4.05, 0.16));
    // street lamp
    if (o.lamp) lampHead(ctx, 0, 5.4, 0, o.lampRot ?? Math.PI / 2);
  });
  att.top = new THREE.Vector3(x, y + H, z);
  return att;
}

// catenary wire between two world points
function wire(ctx, a, b, r, sag, colr, swayAmp) {
  const E = ctx.E, rng = ctx.rng;
  const n = Math.max(6, Math.round(a.distanceTo(b) / 2.2));
  const pts = [], sw = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t), a.z + (b.z - a.z) * t]);
    sw.push(Math.sin(Math.PI * t) * swayAmp);
  }
  ctx.chunk((a.x + b.x) / 2, (a.z + b.z) / 2);
  E.with({ color: col(colr), pat: PAT.PLAIN, gloss: 0.35, weather: 0, ex1: rng.next(), ex2: 1 }, () => E.tube(pts, r, 4, sw));
  E.set({ ex1: 0, ex2: 0, sway: 0 });
  // drops of water hanging from the lowest part
  if (rng.chance(0.25)) ctx.drips.push(new THREE.Vector3(...pts[Math.floor(n / 2)]).add(new THREE.Vector3(0, -r - 0.01, 0)));
}

function connect(ctx, A, B) {
  const rng = ctx.rng;
  const span = A.base.distanceTo(B.base);
  const k = span / 30;
  for (let i = 0; i < Math.min(A.hv.length, B.hv.length); i++) wire(ctx, A.hv[i], B.hv[i], 0.011, 0.35 * k * k + 0.1, '#30343a', 0.05);
  for (let i = 0; i < Math.min(A.lv.length, B.lv.length); i++) wire(ctx, A.lv[i], B.lv[i], 0.013, 0.5 * k * k + 0.12, '#2a2d31', 0.07);
  for (let i = 0; i < Math.min(A.tel.length, B.tel.length); i++) wire(ctx, A.tel[i], B.tel[i], i === 0 ? 0.03 : 0.022, 0.7 * k * k + 0.2 + rng.range(0, 0.15), '#1c1d20', 0.1);
}

export function buildPoles(ctx, roads) {
  const lines = [];
  const at = (road, s, side, off = 0.25) => {
    const p = road.at(s);
    return { x: p.x + p.right.x * side * (road.w / 2 - off), z: p.z + p.right.z * side * (road.w / 2 - off), y: p.y, dir: p.dir };
  };
  const line = (road, side, list, opts = {}) => {
    const out = [];
    for (const s of list) {
      const q = at(road, typeof s === 'number' ? s : s.s, side, opts.off);
      const o = typeof s === 'number' ? {} : s;
      out.push(pole(ctx, q.x, q.y, q.z, q.dir, { lampRot: side > 0 ? Math.PI / 2 : -Math.PI / 2, adSide: side, ...opts, ...o }));
    }
    for (let i = 0; i < out.length - 1; i++) connect(ctx, out[i], out[i + 1]);
    lines.push(out);
    return out;
  };
  const R = roads;
  // main street, east side (the first view looks up this line)
  const main = line(R.main, 1, [2, { s: 30, lamp: true }, 58, { s: 88, trans: true, lamp: true }, 116, { s: 146, lamp: true }, 174, { s: 212, lamp: true }, 240, 268]);
  // cross street west: wires fly across the junction
  const cw = line(R.crossW, 1, [{ s: 9, lamp: true }, 21.5]);
  connect(ctx, main[3], cw[0]);
  const ce = line(R.crossE, -1, [{ s: 14, trans: true }, { s: 40, lamp: true }, 66, 92]);
  connect(ctx, main[3], ce[0]);
  const sl = line(R.slope, -1, [{ s: 12, lamp: true }, 34, { s: 56, lamp: true }, 80]);
  connect(ctx, main[4], sl[0]);
  const up = line(R.upper, 1, [6, { s: 32, lamp: true }, 60, 86]);
  connect(ctx, up[3], sl[1]);
  const ea = line(R.east, 1, [4, { s: 30, lamp: true }, 58, 86]);
  connect(ctx, ce[1], ea[0]);
  const cn = line(R.canalNW, -1, [44, 74, { s: 104, lamp: true }, 134]);
  const cne = line(R.canalNE, -1, [{ s: 14, lamp: true }, 44, 74, 104]);
  connect(ctx, cn[3], cne[0]);
  const nw = line(R.northW, -1, [50, 80, 110, 138]);
  const ne = line(R.northE, -1, [12, 42, 72, 102]);
  connect(ctx, nw[3], ne[0]);
  const sw = line(R.southW, 1, [10, 22]);
  const se = line(R.southE, -1, [14, 40]);
  connect(ctx, main[1], sw[0]);
  connect(ctx, main[1], se[0]);
  ctx.poleLines = lines;
  // service drops to houses
  const all = lines.flat();
  for (const d of ctx.dropPoints) {
    let best = null, bd = 22;
    for (const p of all) {
      const dist = Math.hypot(p.base.x - d.x, p.base.z - d.z);
      if (dist < bd && Math.abs(p.base.y - d.y) < 14) {
        bd = dist;
        best = p;
      }
    }
    if (best) wire(ctx, best.drop, d, 0.007, 0.25 + bd * 0.01, '#26282b', 0.04);
  }
}
