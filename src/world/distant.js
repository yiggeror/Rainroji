import * as THREE from 'three';
import { PAT } from '../builder.js';
import { col } from '../util.js';
import { quadF } from './parts.js';

// Layered hills fading into the rain and a sea of roofs beyond the neighbourhood
export function buildDistant(ctx) {
  const E = ctx.E, rng = ctx.rng;
  // ---- mountain ranges (drawn into the 'far' sink: softer fog)
  const ranges = [
    { r: 520, h0: 30, h1: 95, colr: '#4d5f57', seg: 160, bias: (a) => 0.6 + 0.4 * Math.max(0, Math.cos(a - 3.6)) },
    { r: 900, h0: 70, h1: 170, colr: '#5e6f72', seg: 140, bias: (a) => 0.5 + 0.5 * Math.max(0, Math.cos(a - 4.4)) },
    { r: 1500, h0: 120, h1: 300, colr: '#7c8a91', seg: 120, bias: (a) => 0.55 + 0.45 * Math.cos(a - 4.0) },
  ];
  ctx.inSink('far', () => {
    ranges.forEach((R, ri) => {
      const pts = [];
      const ph = rng.range(0, 10);
      for (let i = 0; i <= R.seg; i++) {
        const a = (i / R.seg) * Math.PI * 2;
        const n = Math.sin(a * 3 + ph) * 0.35 + Math.sin(a * 7.3 + ph * 2) * 0.2 + Math.sin(a * 17.1 + ph) * 0.08 + Math.sin(a * 31 + ph * 3) * 0.03;
        const h = (R.h0 + (R.h1 - R.h0) * (0.5 + 0.5 * n)) * R.bias(a);
        const rr = R.r * (1 + 0.08 * Math.sin(a * 5 + ph));
        pts.push([Math.cos(a) * rr, h, Math.sin(a) * rr]);
      }
      const base = col(R.colr);
      for (let i = 0; i < R.seg; i++) {
        const a = pts[i], b = pts[i + 1];
        E.set({ color: base, pat: PAT.LEAF, gloss: 0, weather: 0, param: ri });
        // face towards the centre
        quadF(E, [a[0], -20, a[2]], [b[0], -20, b[2]], [b[0], b[1], b[2]], [a[0], a[1], a[2]], [0, 0, 1, 0, 1, 1, 0, 1], [-a[0], 0, -a[2]]);
      }
    });
  });
  E.set({ pat: 0, param: 0 });

  // ---- distant town: simple houses scattered in rings (not to the west: hills)
  const occupied = (x, z) => (x > -30 && x < 125 && z > -210 && z < 125) || (x < -80 && z > -150 && z < 130);
  let n = 0;
  for (let k = 0; k < 4000 && n < 900; k++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(140, 420);
    const x = Math.cos(a) * d + 20, z = Math.sin(a) * d - 60;
    if (occupied(x, z)) continue;
    if (x < -120 && z > -140) continue; // behind the west ridge
    if (z < -101 && z > -140 && Math.abs(x) < 400) {
      // keep the rail/canal corridor clear
      if (z > -135) continue;
    }
    n++;
    ctx.chunk(x, z);
    const w = rng.range(6, 10), dd = rng.range(6, 9);
    const tall = rng.chance(0.06);
    const h = tall ? rng.range(10, 22) : rng.range(4.5, 7);
    const rot = Math.round(rng.range(0, 4)) * (Math.PI / 2) + rng.range(-0.1, 0.1);
    const wc = col(rng.pick(['#d9d4c8', '#c9c9c2', '#bfc5c7', '#d8cdb8', '#b8b2a6']));
    E.frame(x, 0, z, rot, () => {
      E.with({ color: wc, pat: tall ? PAT.TILE : PAT.PANEL, param: 0.1, gloss: 0.1, weather: 0.4 }, () => E.box(-w / 2, 0, -dd / 2, w / 2, h, dd / 2, { ny: true, py: !tall }));
      // window bands
      E.with({ color: col('#59636d'), pat: PAT.PLAIN, gloss: 0.6 }, () => {
        for (let y = 1.2; y < h - 1; y += 2.8) {
          E.box(-w / 2 + 0.8, y, dd / 2, -w / 2 + 2.2, y + 1.0, dd / 2 + 0.02);
          E.box(w / 2 - 2.2, y, dd / 2, w / 2 - 0.8, y + 1.0, dd / 2 + 0.02);
        }
      });
      if (!tall) {
        const rc = col(rng.pick(['#4b5057', '#58616d', '#4f6c61', '#5b4b40', '#63686e']));
        const rh = dd * 0.22;
        E.with({ color: rc, pat: PAT.PLAIN, gloss: 0.45 }, () => {
          quadF(E, [-w / 2 - 0.4, h - 0.1, dd / 2 + 0.4], [w / 2 + 0.4, h - 0.1, dd / 2 + 0.4], [w / 2 + 0.4, h + rh, 0], [-w / 2 - 0.4, h + rh, 0], null, [0, 1, 1]);
          quadF(E, [w / 2 + 0.4, h - 0.1, -dd / 2 - 0.4], [-w / 2 - 0.4, h - 0.1, -dd / 2 - 0.4], [-w / 2 - 0.4, h + rh, 0], [w / 2 + 0.4, h + rh, 0], null, [0, 1, -1]);
        });
        E.with({ color: wc, pat: PAT.PANEL, gloss: 0.1 }, () => {
          for (const s of [-1, 1]) quadF(E, [s * w / 2, h, -dd / 2], [s * w / 2, h, dd / 2], [s * w / 2, h + rh, 0], [s * w / 2, h, dd / 2], null, [s, 0, 0]);
        });
      } else {
        E.with({ color: col('#9ea3a6'), pat: PAT.PLAIN }, () => E.box(-w / 2, h, -dd / 2, w / 2, h + 0.4, dd / 2));
      }
    });
    // odd tree between houses
    if (rng.chance(0.25)) {
      E.with({ color: col(rng.pick(['#3f5f3c', '#4a6b42'])), pat: PAT.LEAF, gloss: 0 }, () => {
        const g = new THREE.IcosahedronGeometry(rng.range(2, 3.5), 0);
        E.geom(g, new THREE.Matrix4().makeTranslation(x + rng.range(-6, 6), rng.range(3, 5), z + rng.range(-6, 6)));
      });
    }
  }
  // ---- steel transmission towers marching over the hills
  const towers = [[-260, 38, -40], [-230, 30, -260], [-120, 18, -420], [60, 22, -520], [240, 26, -470]];
  const tp = [];
  for (const [x, y, z] of towers) {
    ctx.chunk(x, z);
    tp.push(tower(ctx, x, y, z));
  }
  for (let i = 0; i < tp.length - 1; i++) {
    for (let k = 0; k < tp[i].length; k++) {
      const a = tp[i][k], b = tp[i + 1][k];
      const pts = [];
      for (let t = 0; t <= 16; t++) {
        const u = t / 16;
        pts.push([a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u - 18 * 4 * u * (1 - u), a.z + (b.z - a.z) * u]);
      }
      ctx.chunk((a.x + b.x) / 2, (a.z + b.z) / 2);
      E.with({ color: col('#3a3f45'), pat: PAT.PLAIN, gloss: 0.2 }, () => E.tube(pts, 0.06, 3));
    }
  }
}

function tower(ctx, x, y, z) {
  const E = ctx.E;
  const H = 48;
  const att = [];
  E.frame(x, y, z, 0.3, () => {
    E.with({ color: col('#8d9397'), pat: PAT.METAL, gloss: 0.3 }, () => {
      const lv = [0, 12, 24, 34, 42, 48];
      const wd = (h) => 4.5 * (1 - h / H) + 0.8;
      for (let i = 0; i < lv.length - 1; i++) {
        const a = lv[i], b = lv[i + 1];
        const wa = wd(a), wb = wd(b);
        for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) E.beam([sx * wa, a, sz * wa], [sx * wb, b, sz * wb], 0.25);
        for (const [p, q] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) {
          E.beam([p[0] * wa, a, p[1] * wa], [q[0] * wb, b, q[1] * wb], 0.12);
          E.beam([q[0] * wa, a, q[1] * wa], [p[0] * wb, b, p[1] * wb], 0.12);
        }
      }
      for (const [yy, w] of [[30, 7], [38, 6], [45, 5]]) {
        E.box(-w, yy - 0.3, -0.3, w, yy + 0.3, 0.3);
        for (const s of [-1, 1]) att.push(ctx.toWorld(s * (w - 0.3), yy - 2, 0));
      }
    });
  });
  return att;
}
