import * as THREE from 'three';
import { PAT, Sink } from '../builder.js';
import { col, smoothstep, clamp } from '../util.js';
import { quadF, triF } from './parts.js';
import { T1, SEA, CANAL, naturalHeight, coastInfo, coastSegments } from './layout.js';
import { forestTree, sugi, bush, bamboo, blobGeometry } from './plants.js';

function inPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------------------
// Ground height for the whole island: natural hills, flattened under roads and
// lots, shaped into beaches and cliffs at the shore.
// ---------------------------------------------------------------------------
export function makeHeight(roads, lots) {
  const roadList = Object.values(roads);
  return function H(x, z) {
    let h = naturalHeight(x, z);
    if (h > 0.001) {
      for (const lot of lots) {
        const b = lot.bbox;
        if (x < b.minX - 3 || x > b.maxX + 3 || z < b.minZ - 3 || z > b.maxZ + 3) continue;
        const dx = x - lot.x, dz = z - lot.z;
        const c = Math.cos(lot.rot), s = Math.sin(lot.rot);
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        const ox = Math.max(0, Math.abs(lx) - lot.w / 2), oz = Math.max(0, lz, -lot.depth - lz);
        const d = Math.hypot(ox, oz);
        if (d < 0.5) h = lot.level - 0.1;
        else if (d < 3 && h > lot.level) h = lot.level + (h - lot.level) * smoothstep(0.5, 3, d);
      }
      for (const r of roadList) {
        const c = r.closest(x, z);
        const hw = r.w / 2;
        if (c.d < hw + 0.6) h = Math.min(h, c.y - 0.15);
        else if (c.d < hw + 4 && h > c.y) h = c.y + (h - c.y) * smoothstep(hw + 0.6, hw + 4, c.d);
      }
    }
    // the shore
    const ci = coastInfo(x, z);
    if (ci.d > -30) {
      if (ci.kind === 'beach') {
        const bh = SEA - 2.6 + (2.6 - SEA) * smoothstep(9, -16, ci.d);
        h = Math.min(h, bh);
      } else if (ci.kind === 'rock') {
        const k = smoothstep(7, -12, ci.d);
        h = h * k + (SEA - 3.2) * (1 - k);
      } else if (ci.d > 0) h = SEA - 3.5;
    }
    return h;
  };
}

// ---------------------------------------------------------------------------
// Terrain mesh over the whole island on a 2 m grid.
//  - flat town ground goes into one plain "base" sink (just below the streets)
//  - hills, beaches and cliffs get sloped, shaded quads
//  - cells along sea walls / quays are clipped exactly at the wall line
//  - the canal, the paddies and the stair notch are left open
// ---------------------------------------------------------------------------
export function buildTerrain(ctx, roads, lots, opts = {}) {
  const E = ctx.E, rng = ctx.rng;
  const H = makeHeight(roads, lots);
  const X0 = -172, X1 = 132, Z0 = -164, Z1 = 120, S = 2;
  const nx = (X1 - X0) / S, nz = (Z1 - Z0) / S;
  const holes = [[CANAL.x0 - 2, CANAL.x1, CANAL.z1, CANAL.z0], [-34, -26, -2, 2], ...(opts.holes || [])];
  const inHole = (x, z) => holes.some(([a, b, c, d]) => x > a && x < b && z > c && z < d);
  // corner samples
  const hs = new Float32Array((nx + 1) * (nz + 1));
  const ds = new Float32Array((nx + 1) * (nz + 1));
  const ks = [];
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = X0 + i * S, z = Z0 + j * S;
      const ci = coastInfo(x, z);
      hs[j * (nx + 1) + i] = H(x, z);
      ds[j * (nx + 1) + i] = ci.d;
      ks[j * (nx + 1) + i] = ci;
    }
  }
  const base = opts.baseSink || new Sink('base');
  const soil = { color: col('#6c6456'), pat: PAT.SOIL, param: 0.25, gloss: 0.2, weather: 0 };
  const sea = [];
  for (let j = 0; j < nz; j++) {
    let run = null; // merged flat run [i0, i1)
    const flush = () => {
      if (!run) return;
      const x0 = X0 + run[0] * S, x1 = X0 + run[1] * S, z0 = Z0 + j * S, z1 = z0 + S;
      const prev = E.sink;
      E.sink = base;
      E.with(soil, () => E.quad([x0, -0.04, z1], [x1, -0.04, z1], [x1, -0.04, z0], [x0, -0.04, z0], [x0, z1, x1, z1, x1, z0, x0, z0], [0, 1, 0]));
      E.sink = prev;
      run = null;
    };
    for (let i = 0; i < nx; i++) {
      const x = X0 + i * S, z = Z0 + j * S;
      const cx = x + S / 2, cz = z + S / 2;
      const id = [j * (nx + 1) + i, j * (nx + 1) + i + 1, (j + 1) * (nx + 1) + i + 1, (j + 1) * (nx + 1) + i];
      const h = id.map((k) => hs[k]), d = id.map((k) => ds[k]);
      const center = coastInfo(cx, cz);
      // the sea: everything near or beyond the shore (the land hides what is under it)
      if (Math.max(...d) > -3 && !inHole(cx, cz)) sea.push([x, z]);
      if (inHole(cx, cz)) {
        flush();
        continue;
      }
      if (Math.max(...h) < SEA - 0.4 && Math.min(...d) > 0) {
        flush();
        continue;
      }
      if (inPoly(cx, cz, T1.poly) && Math.max(...h) <= T1.level + 0.05) {
        flush();
        continue;
      }
      const hard = center.kind === 'wall' || center.kind === 'quay';
      const allIn = Math.max(...d) < 0;
      const flat = allIn && h.every((v) => Math.abs(v) < 0.02);
      if (flat) {
        if (!run) run = [i, i + 1];
        else run[1] = i + 1;
        continue;
      }
      flush();
      // polygon of the cell (x, z, h), clipped at a sea wall
      let poly = [[x, z + S, h[3]], [x + S, z + S, h[2]], [x + S, z, h[1]], [x, z, h[0]]];
      if (hard && !allIn) {
        if (Math.min(...d) > 0) continue;
        const g = coastSegments[center.seg];
        const f = (p) => (p[0] - g.ax) * -g.dz + (p[1] - g.az) * g.dx; // > 0 inland
        const out = [];
        for (let k = 0; k < poly.length; k++) {
          const a = poly[k], b = poly[(k + 1) % poly.length];
          const fa = f(a), fb = f(b);
          if (fa >= 0) out.push(a);
          if ((fa >= 0) !== (fb >= 0)) {
            const t = fa / (fa - fb);
            const px = a[0] + (b[0] - a[0]) * t, pz = a[1] + (b[1] - a[1]) * t;
            out.push([px, pz, fa >= 0 ? a[2] : b[2]]);
          }
        }
        poly = out;
        if (poly.length < 3) continue;
      }
      ctx.chunk(cx, cz);
      const hmax = Math.max(...poly.map((p) => p[2])), hmin = Math.min(...poly.map((p) => p[2]));
      const slope = (hmax - hmin) / S;
      const sandy = center.kind === 'beach' && hmax < 0.6;
      const rocky = center.kind === 'rock' && center.d > -14 && slope > 0.7;
      let c;
      if (sandy) c = col('#a99c83');
      else if (rocky) c = col('#6e6961');
      else if (slope > 0.9) c = col('#6b5d49');
      else c = col('#566b3e');
      c.offsetHSL(0, 0, rng.range(-0.02, 0.02));
      E.set({ color: c, pat: sandy ? PAT.GRAVEL : PAT.SOIL, param: rocky || slope > 0.9 ? -0.3 : 0.5, gloss: sandy ? 0.35 : 0.15, weather: 0 });
      const pts = poly.map((p) => [p[0], p[2], p[1]]);
      if (pts.length === 4) quadF(E, pts[0], pts[1], pts[2], pts[3], null, [0, 1, 0]);
      else for (let k = 1; k < pts.length - 1; k++) triF(E, pts[0], pts[k], pts[k + 1], null, [0, 1, 0]);
    }
    flush();
  }
  E.set({ pat: 0, weather: 0 });
  return { H, base, sea, grid: { X0, X1, Z0, Z1, S }, inHole };
}

// ---------------------------------------------------------------------------
// Sea surface: grid cells along the shore + four big quads out to the horizon
// ---------------------------------------------------------------------------
export function buildSea(ctx, cells, grid) {
  const E = ctx.E;
  const mat = { color: col('#3a4a4f'), pat: PAT.WATER, param: 0.25, gloss: 0.95, weather: 0 };
  E.with(mat, () => {
    // merge runs along x
    const byRow = new Map();
    for (const [x, z] of cells) {
      if (!byRow.has(z)) byRow.set(z, []);
      byRow.get(z).push(x);
    }
    for (const [z, xs] of byRow) {
      xs.sort((a, b) => a - b);
      let a = xs[0], b = xs[0] + grid.S;
      const emit = () => {
        ctx.chunk((a + b) / 2, z + grid.S / 2);
        E.quad([a, SEA, z + grid.S], [b, SEA, z + grid.S], [b, SEA, z], [a, SEA, z], [a, z + grid.S, b, z + grid.S, b, z, a, z], [0, 1, 0]);
      };
      for (let k = 1; k < xs.length; k++) {
        if (Math.abs(xs[k] - b) < 1e-6 && b - a < 60) b += grid.S;
        else {
          emit();
          a = xs[k];
          b = xs[k] + grid.S;
        }
      }
      emit();
    }
    // open sea around the grid: one mesh, always drawn
    const prev = E.sink;
    E.sink = ctx.seaFar = ctx.seaFar || new Sink('seaFar');
    const R = 3200, T = 800;
    for (let x = -R; x < R; x += T) {
      for (let z = -R; z < R; z += T) {
        const x1 = x + T, z1 = z + T;
        // skip the part covered by the grid
        if (x1 > grid.X0 && x < grid.X1 && z1 > grid.Z0 && z < grid.Z1) {
          // split into up to four strips around the grid box
          const parts = [];
          if (x < grid.X0) parts.push([x, grid.X0, z, z1]);
          if (x1 > grid.X1) parts.push([grid.X1, x1, z, z1]);
          const xa = Math.max(x, grid.X0), xb = Math.min(x1, grid.X1);
          if (z < grid.Z0) parts.push([xa, xb, z, grid.Z0]);
          if (z1 > grid.Z1) parts.push([xa, xb, grid.Z1, z1]);
          for (const [a, b, c, d] of parts) {
            E.quad([a, SEA, d], [b, SEA, d], [b, SEA, c], [a, SEA, c], [a, d, b, d, b, c, a, c], [0, 1, 0]);
          }
          continue;
        }
        E.quad([x, SEA, z1], [x1, SEA, z1], [x1, SEA, z], [x, SEA, z], [x, z1, x1, z1, x1, z, x, z], [0, 1, 0]);
      }
    }
    E.sink = prev;
  });
}

// ---------------------------------------------------------------------------
// Woods on the ridge and the spur: cedars higher up, broadleaf lower down,
// bamboo and shrubs at the edges. Everything placed at least `gap` apart.
// ---------------------------------------------------------------------------
export function buildWoods(ctx, H, isFree) {
  const rng = ctx.rng;
  const placed = [];
  const cell = 4;
  const hash = new Map();
  const key = (x, z) => Math.floor(x / cell) + ',' + Math.floor(z / cell);
  const tooClose = (x, z, r) => {
    const ci = Math.floor(x / cell), cj = Math.floor(z / cell);
    for (let i = ci - 2; i <= ci + 2; i++) for (let j = cj - 2; j <= cj + 2; j++) {
      for (const p of hash.get(i + ',' + j) || []) if (Math.hypot(p[0] - x, p[1] - z) < r + p[2]) return true;
    }
    return false;
  };
  const add = (x, z, r) => {
    const k = key(x, z);
    if (!hash.has(k)) hash.set(k, []);
    hash.get(k).push([x, z, r]);
    placed.push([x, z]);
  };
  let n = 0;
  for (let k = 0; k < 16000 && n < 1100; k++) {
    const x = rng.range(-160, -12), z = rng.range(-150, 100);
    const h = H(x, z);
    if (h < 1.2 || !isFree(x, z)) continue;
    const ci = coastInfo(x, z);
    if (ci.d > -3) continue;
    const high = smoothstep(8, 22, h);
    const cedar = rng.chance(0.2 + 0.55 * high);
    const r = cedar ? 1.7 : 2.4;
    if (tooClose(x, z, r)) continue;
    add(x, z, r);
    n++;
    ctx.chunk(x, z);
    // ground slopes: stand the tree on the lowest point around the trunk
    const y = Math.min(h, H(x + 0.6, z), H(x - 0.6, z), H(x, z + 0.6), H(x, z - 0.6)) - 0.1;
    if (cedar) sugi(ctx, x, y, z, { h: rng.range(11, 17) });
    else if (rng.chance(0.08) && h < 10) bamboo(ctx, x, y, z, rng.int(5, 9));
    else forestTree(ctx, x, y, z, { h: rng.range(7, 12) });
  }
  // understorey shrubs
  for (let k = 0; k < 3000 && n < 1600; k++) {
    const x = rng.range(-150, -14), z = rng.range(-145, 96);
    const h = H(x, z);
    if (h < 1 || !isFree(x, z) || coastInfo(x, z).d > -4) continue;
    if (tooClose(x, z, 0.4)) continue;
    add(x, z, 0.6);
    n++;
    ctx.chunk(x, z);
    bush(ctx, x, h - 0.1, z, rng.range(0.7, 1.4), { color: rng.pick(['#4a7340', '#3f6438', '#557a3e']) });
  }
  return placed;
}

// Boulders along the cliff foot and scattered on the beach
export function buildRocks(ctx, H) {
  const E = ctx.E, rng = ctx.rng;
  const g = blobGeometry();
  let n = 0;
  for (let k = 0; k < 6000 && n < 420; k++) {
    const x = rng.range(-165, 20), z = rng.range(-150, 110);
    const ci = coastInfo(x, z);
    if (ci.kind !== 'rock' && !(ci.kind === 'beach' && rng.chance(0.15))) continue;
    if (ci.d < -9 || ci.d > 7) continue;
    const h = H(x, z);
    n++;
    ctx.chunk(x, z);
    const s = rng.range(0.6, 2.4) * (ci.kind === 'beach' ? 0.5 : 1);
    const c = col(rng.pick(['#6f6a63', '#7b766d', '#5f5b55', '#817a6e'])).offsetHSL(0, 0, rng.range(-0.03, 0.03));
    E.with({ color: c, pat: PAT.LEAF, gloss: 0.45, weather: 0.3 }, () => {
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(x, Math.max(h, SEA - 1) + s * 0.15, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(-0.3, 0.3), rng.range(0, 6.3), rng.range(-0.3, 0.3))),
        new THREE.Vector3(s * rng.range(0.9, 1.4), s * rng.range(0.45, 0.8), s * rng.range(0.9, 1.3)),
      );
      E.geom(g, m);
    });
  }
  void clamp;
}
