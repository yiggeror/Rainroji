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

export const SEA = -1.7; // sea level (the town sits at 0)
export const CANAL = { z0: -101, z1: -109, water: -1.72, bed: -2.6, top: 0.0, x0: -92, x1: 114 };
export const RAIL = { z: -123, tracks: [-121.5, -124.5], y: 0.32, portal: -106, shore: 106, platform: [-92, -16] };
export const T1 = {
  level: 4.0,
  // terrace west of the start crossing (retaining wall along x = -26, notch for the stairs)
  poly: [[-26, 64], [-26, 1.3], [-33.6, 1.3], [-33.6, -1.3], [-26, -1.3], [-26, -38], [-86, -38], [-86, 64]],
};

// ---------------------------------------------------------------------------
// The island's shoreline, clockwise on the map (x east, z south). Each point
// starts a segment of the given kind:
//   wall  - concrete sea wall, town ground right up to the edge
//   quay  - harbour quay (vertical, boats alongside)
//   beach - sand / pebbles sloping into the water
//   rock  - the ridge falling into the sea: cliffs and boulders
// ---------------------------------------------------------------------------
export const COAST = [
  [12, 105, 'wall'], [-4, 95, 'wall'], [-24, 94, 'beach'], [-46, 98, 'beach'], [-70, 101, 'beach'], [-92, 99, 'rock'],
  [-112, 90, 'rock'], [-124, 80, 'rock'], [-136, 64, 'rock'], [-142, 46, 'rock'], [-150, 30, 'rock'], [-152, 8, 'rock'],
  [-158, -12, 'rock'], [-154, -32, 'rock'], [-150, -56, 'rock'], [-154, -76, 'rock'], [-146, -102, 'rock'], [-138, -122, 'rock'],
  [-126, -136, 'rock'], [-112, -141, 'wall'], [-86, -145, 'wall'], [-58, -143, 'wall'], [-30, -146, 'wall'], [0, -144, 'wall'],
  [30, -147, 'wall'], [58, -145, 'wall'], [84, -149, 'rock'], [100, -150, 'rock'], [114, -140, 'rock'], [116, -128, 'wall'],
  [115, -96, 'wall'], [114, -66, 'wall'], [117, -40, 'wall'], [118, -8, 'wall'], [115, 14, 'beach'], [121, 30, 'beach'],
  [122, 46, 'beach'], [116, 60, 'wall'], [110, 76, 'wall'], [107, 96, 'wall'], [100, 105, 'quay'],
];
// harbour breakwaters (centre lines) and their lighthouse tips
export const BREAKWATERS = [
  { pts: [[12, 105], [6, 150], [36, 168]], light: 'red' },
  { pts: [[100, 105], [104, 148], [64, 164]], light: 'white' },
];

const segs = COAST.map((p, i) => {
  const q = COAST[(i + 1) % COAST.length];
  const dx = q[0] - p[0], dz = q[1] - p[1], len = Math.hypot(dx, dz);
  return { ax: p[0], az: p[1], dx: dx / len, dz: dz / len, len, kind: p[2] };
});
function inside(x, z) {
  let c = false;
  for (let i = 0, j = COAST.length - 1; i < COAST.length; j = i++) {
    const [xi, zi] = COAST[i], [xj, zj] = COAST[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
// nearest shoreline point: signed distance (negative on land), kind, outward normal
export function coastInfo(x, z) {
  let best = { d: Infinity, kind: 'wall', nx: 0, nz: 1, s: 0, seg: 0 };
  let acc = 0;
  segs.forEach((g, i) => {
    const px = x - g.ax, pz = z - g.az;
    const t = clamp(px * g.dx + pz * g.dz, 0, g.len);
    const d = Math.hypot(px - g.dx * t, pz - g.dz * t);
    if (d < best.d) best = { d, kind: g.kind, nx: -g.dz, nz: g.dx, s: acc + t, seg: i, t };
    acc += g.len;
  });
  const inn = inside(x, z);
  best.d = inn ? -best.d : best.d;
  // blend the kind across segment joints so beaches fade into rocks
  return best;
}
export const coastSegments = segs;
export const onIsland = (x, z) => inside(x, z);

export function makeRoads() {
  const R = {};
  const add = (id, pts, w, opt) => (R[id] = new Road(id, pts, w, opt));
  add('main', [[0, 91.3], [0, -40], [6, -98], [6, -136.1]], 5.0, { lines: true, main: true });
  add('crossW', [[-2.5, 0], [-25.9, 0]], 4.2, { lines: true });
  add('crossE', [[2.5, 0], [101.8, 0]], 4.2, { lines: true });
  add('southW', [[-2.5, 50], [-25.9, 50]], 4.0, {});
  add('southE', [[2.5, 50], [64, 50]], 4.0, {});
  add('east', [[34, -2.1], [34, -70], [36, -97.8]], 3.4, {});
  add('slope', [[-2.5, -40, 0], [-40, -40, 4.0], [-54, -62, 6.6], [-60, -86, 8.8]], 4.0, { lines: true, slope: true });
  add('upper', [[-40, 56, 4.0], [-40, -38, 4.0]], 3.6, {});
  add('canalSW', [[-58, -99], [3.6, -99]], 2.4, { path: true });
  add('canalSE', [[8.4, -99], [101.8, -99]], 2.4, { path: true });
  add('canalNW', [[-92, -113], [3.6, -113]], 4.0, {});
  add('canalNE', [[8.4, -113], [104, -113]], 4.0, {});
  add('coastN', [[-92, -134], [3.5, -134]], 4.2, { lines: true });
  add('coastNE', [[8.5, -134], [100, -134]], 4.2, { lines: true });
  add('coastS', [[-30, 89], [-2.5, 89]], 4.6, { lines: true });
  add('coastSE', [[2.5, 89], [101.8, 89]], 4.6, { lines: true });
  add('coastE', [[104, 91.3], [104, -97.8]], 4.6, { lines: true });
  add('alley', [[2.5, -22], [32.3, -22]], 1.5, { alley: true });

  // side-street openings in the curbs / lots
  const m = R.main;
  const zToS1 = (z) => 91.3 - z; // first segment of main
  const gap = (road, side, s, half) => road.addGap(side, s - half, s + half);
  gap(m, 1, zToS1(50), 2.6);
  gap(m, -1, zToS1(50), 2.6);
  gap(m, 1, zToS1(0), 2.7);
  gap(m, -1, zToS1(0), 2.7);
  gap(m, 1, zToS1(-22), 1.1);
  gap(m, -1, zToS1(-40), 2.6);
  gap(m, 1, 2.3, 2.6);
  gap(m, -1, 2.3, 2.6);
  // canal / rail crossings on segment 3 (x = 6)
  const s3 = (z) => m.segs[2].s0 + (-98 - z);
  for (const z of [-99, -113]) {
    gap(m, 1, s3(z), z === -99 ? 1.8 : 2.6);
    gap(m, -1, s3(z), z === -99 ? 1.8 : 2.6);
  }
  gap(m, 1, m.length - 2.1, 2.6);
  gap(m, -1, m.length - 2.1, 2.6);
  gap(R.crossE, -1, 34 - 2.5, 2.2);
  gap(R.crossE, 1, 34 - 2.5, 0.01);
  gap(R.upper, 1, 56, 1.8); // stair landing
  gap(R.slope, -1, 37.5, 2.2); // upper road joins
  // the east coast road: crossE, the harbour road and the canal path join it
  gap(R.coastE, -1, 91.3, 2.6);
  gap(R.coastE, -1, 0.1, 2.9);
  gap(R.coastE, -1, 188.3, 1.4);
  gap(R.coastSE, 1, 99.3, 2.8);
  return R;
}

// ---------------------------------------------------------------------------
// Natural ground: the spur between the slope road and the canal, the T1
// terrace, the forested ridge in the west (cut for the railway) and the shore.
// Flattened later under roads and lots.
// ---------------------------------------------------------------------------
export function naturalHeight(x, z) {
  let h = 0;
  // spur between the slope road and the canal: rises west of the main street
  const spurZ = smoothstep(-42, -60, z) * smoothstep(-99, -91, z);
  const spur = 9.5 * smoothstep(-15.5, -33, x) + Math.max(0, -33 - x) * 0.28;
  h = Math.max(h, spur * spurZ);
  // T1 terrace level to the south-west
  if (z > -40 && z < 66 && x < -26) h = Math.max(h, 4.0);
  // the ridge: rises west of the terrace, crest around x = -122, falls to the sea
  const up = smoothstep(-84, -118, x);
  const crest = 30 + 6 * Math.sin(z * 0.035 + 1.2) + 3 * Math.sin(z * 0.09);
  let ridge = 4.0 * smoothstep(-80, -90, x) + (crest - 4) * up * up;
  ridge *= 1 - 0.55 * smoothstep(-128, -150, x);
  // the ridge also tapers towards the north and south shores
  ridge *= 1 - smoothstep(60, 95, z) * 0.75;
  ridge *= 1 - smoothstep(-118, -140, z) * 0.8;
  h = Math.max(h, ridge);
  // rolling noise on the hills
  if (h > 0.5) h += (Math.sin(x * 0.11 + z * 0.07) * 0.6 + Math.sin(x * 0.05 - z * 0.13) * 0.8) * smoothstep(0.5, 6, h);
  // the canal and the railway run through a flat band; west of the town the rail
  // sits in a cutting that ends at the tunnel portal
  const band = smoothstep(-97, -99, z) * smoothstep(-142, -138, z);
  const cut = x > RAIL.portal - 5 ? 1 : 0;
  const railCut = cut * (1 - smoothstep(6, 16, Math.abs(z + 123)));
  const flat = Math.max(band * smoothstep(-96, -86, x), railCut);
  h *= 1 - flat;
  return h;
}
