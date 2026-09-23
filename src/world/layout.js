import { clamp, smoothstep } from '../util.js';

// ---------------------------------------------------------------------------
// Street network. Points are [x, z, y]. x = east, z = south, y = up.
// The first view looks north (-z) up the main street.
// ---------------------------------------------------------------------------
export class Road {
  constructor(id, pts, w, opt = {}) {
    this.id = id;
    this.w = w;
    this.opt = opt;
    this.pts = pts.map(([x, z, y]) => ({ x, z, y: y || 0 }));
    this.segs = [];
    let s = 0;
    for (let i = 0; i < this.pts.length - 1; i++) {
      const a = this.pts[i], b = this.pts[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      const dir = { x: dx / len, z: dz / len };
      this.segs.push({ a, b, len, dir, right: { x: -dir.z, z: dir.x }, s0: s });
      s += len;
    }
    this.length = s;
    this.gaps = { 1: [], [-1]: [] }; // s-ranges on each side where side streets join
  }
  segAt(s) {
    for (const g of this.segs) if (s <= g.s0 + g.len + 1e-6) return g;
    return this.segs[this.segs.length - 1];
  }
  at(s) {
    const g = this.segAt(s);
    const t = clamp((s - g.s0) / g.len, 0, 1);
    return {
      x: g.a.x + (g.b.x - g.a.x) * t,
      z: g.a.z + (g.b.z - g.a.z) * t,
      y: g.a.y + (g.b.y - g.a.y) * t,
      dir: g.dir,
      right: g.right,
      slope: (g.b.y - g.a.y) / g.len,
    };
  }
  // closest point: returns {d, s, y}
  closest(x, z) {
    let best = { d: Infinity, s: 0, y: 0, side: 0 };
    for (const g of this.segs) {
      const px = x - g.a.x, pz = z - g.a.z;
      let t = (px * g.dir.x + pz * g.dir.z) / g.len;
      t = clamp(t, 0, 1);
      const cx = g.a.x + (g.b.x - g.a.x) * t, cz = g.a.z + (g.b.z - g.a.z) * t;
      const d = Math.hypot(x - cx, z - cz);
      if (d < best.d) {
        const side = Math.sign(px * g.right.x + pz * g.right.z) || 1;
        best = { d, s: g.s0 + t * g.len, y: g.a.y + (g.b.y - g.a.y) * t, side };
      }
    }
    return best;
  }
  addGap(side, s0, s1) {
    this.gaps[side].push([s0, s1]);
  }
  inGap(side, s) {
    for (const [a, b] of this.gaps[side]) if (s > a && s < b) return true;
    return false;
  }
}

export const CANAL = { z0: -100.8, z1: -108.2, water: -2.1, bed: -2.6, top: 0.0 };
export const RAIL = { z: -123, tracks: [-121.5, -124.5], y: 0.32 };
export const T1 = {
  level: 4.0,
  // terrace west of the start crossing (retaining wall along x = -26, notch for the stairs)
  poly: [[-26, 64], [-26, 1.3], [-33.6, 1.3], [-33.6, -1.3], [-26, -1.3], [-26, -38], [-86, -38], [-86, 64]],
};

export function makeRoads() {
  const R = {};
  const add = (id, pts, w, opt) => (R[id] = new Road(id, pts, w, opt));
  add('main', [[0, 84], [0, -40], [6, -98], [6, -205]], 5.0, { lines: true, main: true });
  add('crossW', [[-2.5, 0], [-25.9, 0]], 4.2, { lines: true });
  add('crossE', [[2.5, 0], [96, 0]], 4.2, { lines: true });
  add('southW', [[-2.5, 50], [-25.9, 50]], 4.0, {});
  add('southE', [[2.5, 50], [64, 50]], 4.0, {});
  add('east', [[34, -2.1], [34, -70], [36, -97.8]], 3.4, {});
  add('slope', [[-2.5, -40, 0], [-40, -40, 4.0], [-54, -62, 6.6], [-60, -86, 8.8]], 4.0, { lines: true, slope: true });
  add('upper', [[-40, 56, 4.0], [-40, -38, 4.0]], 3.6, {});
  add('canalSW', [[-58, -99], [3.6, -99]], 2.4, { path: true });
  add('canalSE', [[8.4, -99], [72, -99]], 2.4, { path: true });
  add('canalNW', [[-140, -113], [3.6, -113]], 4.0, {});
  add('canalNE', [[8.4, -113], [120, -113]], 4.0, {});
  add('northW', [[-140, -134], [3.6, -134]], 4.0, {});
  add('northE', [[8.4, -134], [120, -134]], 4.0, {});
  add('alley', [[2.5, -22], [32.3, -22]], 1.5, { alley: true });

  // side-street openings in the curbs / lots
  const m = R.main;
  const zToS1 = (z) => 84 - z; // first segment of main
  const gap = (road, side, s, half) => road.addGap(side, s - half, s + half);
  gap(m, 1, zToS1(50), 2.6);
  gap(m, -1, zToS1(50), 2.6);
  gap(m, 1, zToS1(0), 2.7);
  gap(m, -1, zToS1(0), 2.7);
  gap(m, 1, zToS1(-22), 1.1);
  gap(m, -1, zToS1(-40), 2.6);
  // canal / rail crossings on segment 3 (x = 6)
  const s3 = (z) => m.segs[2].s0 + (-98 - z);
  for (const z of [-99, -113, -134]) {
    gap(m, 1, s3(z), z === -99 ? 1.8 : 2.6);
    gap(m, -1, s3(z), z === -99 ? 1.8 : 2.6);
  }
  gap(R.crossE, -1, 34 - 2.5, 2.2);
  gap(R.crossE, 1, 34 - 2.5, 0.01);
  gap(R.upper, 1, 56, 1.8); // stair landing
  gap(R.slope, -1, 37.5, 2.2); // upper road joins
  return R;
}

// ---------------------------------------------------------------------------
// Natural ground (hill to the west / north-west). Flattened later under
// roads and lots.
// ---------------------------------------------------------------------------
export function naturalHeight(x, z) {
  let h = 0;
  // spur between the slope road and the canal: rises west of the main street
  const spurZ = smoothstep(-42, -60, z) * smoothstep(-99, -91, z);
  const spur = 9.5 * smoothstep(-15.5, -33, x) + Math.max(0, -33 - x) * 0.28;
  h = Math.max(h, spur * spurZ);
  // T1 terrace level to the south-west
  if (z > -40 && x < -26) h = Math.max(h, 4.0);
  // west ridge (forest), everywhere west of x=-86 except the rail valley
  const ridge = Math.max(0, -86 - x) * 0.45 + 4.0 * smoothstep(-80, -90, x);
  // the canal / rail valley cuts through the ridge with gentle wooded sides
  const valley = 1 - smoothstep(-70, -99, z) * smoothstep(-168, -139, z);
  h = Math.max(h, ridge * valley);
  // rolling noise on the hills
  if (h > 0.5) h += (Math.sin(x * 0.11 + z * 0.07) * 0.6 + Math.sin(x * 0.05 - z * 0.13) * 0.8) * smoothstep(0.5, 6, h);
  // canal & rail band stays flat
  const band = smoothstep(-97, -99, z) * smoothstep(-142, -138, z);
  h *= 1 - band;
  return h;
}
