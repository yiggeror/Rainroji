import * as THREE from 'three';
import { PAT } from '../builder.js';
import { col, smoothstep, clamp } from '../util.js';
import { quv } from './atlas.js';
import { quadF } from './parts.js';
import { T1, naturalHeight } from './layout.js';
import { handRail, fence } from './props.js';
import { grass, bush, tree, bamboo, blobGeometry } from './plants.js';

// edge points with mitred joints
function edges(road, off) {
  const out = [];
  const n = road.pts.length;
  for (let i = 0; i < n; i++) {
    const p = road.pts[i];
    let nx, nz, k = 1;
    if (i === 0) ({ x: nx, z: nz } = road.segs[0].right);
    else if (i === n - 1) ({ x: nx, z: nz } = road.segs[n - 2].right);
    else {
      const a = road.segs[i - 1].right, b = road.segs[i].right;
      nx = a.x + b.x;
      nz = a.z + b.z;
      const l = Math.hypot(nx, nz);
      nx /= l;
      nz /= l;
      k = 1 / Math.max(0.5, nx * a.x + nz * a.z);
    }
    out.push({ x: p.x + nx * off * k, z: p.z + nz * off * k, y: p.y });
  }
  return out;
}

// point on a road at (s, across)
function P(road, s, a, dy = 0) {
  const p = road.at(s);
  return [p.x + p.right.x * a, p.y + dy, p.z + p.right.z * a];
}

// strip between across a0..a1 from s0..s1 (split at joints)
function strip(ctx, road, s0, s1, a0, a1, dy, uvMode = 'road') {
  const E = ctx.E;
  const cuts = [s0];
  for (const g of road.segs) if (g.s0 > s0 && g.s0 < s1) cuts.push(g.s0);
  cuts.push(s1);
  for (let i = 0; i < cuts.length - 1; i++) {
    const sa = cuts[i], sb = cuts[i + 1];
    const A = P(road, sa, a0, dy), B = P(road, sa, a1, dy), C = P(road, sb, a1, dy), D = P(road, sb, a0, dy);
    const uv = uvMode === 'road' ? [sa, a0, sa, a1, sb, a1, sb, a0] : [sa, 0, sa, a1 - a0, sb, a1 - a0, sb, 0];
    quadF(E, A, B, C, D, uv, [0, 1, 0]);
  }
}

// ---------------------------------------------------------------------------
export function buildRoads(ctx, roads) {
  const E = ctx.E, rng = ctx.rng;
  const at = ctx.atlasRects;
  for (const road of Object.values(roads)) {
    const flat = road.pts.every((p) => Math.abs(p.y) < 0.01);
    const hw = road.w / 2;
    const mid = road.at(road.length / 2);
    ctx.chunk(mid.x, mid.z);
    const sinkFn = flat ? (f) => ctx.inSink('ground', f) : (f) => f();
    const L = edges(road, -hw), R = edges(road, hw);
    // --- surface
    sinkFn(() => {
      const kind = road.opt.alley ? 'alley' : road.opt.path ? 'path' : 'asphalt';
      const colr = kind === 'alley' ? '#8b8983' : kind === 'path' ? '#8e8a82' : road.opt.main ? '#54585d' : '#5a5d61';
      const mat = kind === 'asphalt' ? { color: col(colr), pat: PAT.ASPHALT, param: road.w, gloss: 0.5, weather: 0 } : kind === 'alley' ? { color: col(colr), pat: PAT.CONCRETE, param: 0, gloss: 0.45 } : { color: col(colr), pat: PAT.PAVING, gloss: 0.4 };
      E.with(mat, () => {
        for (let i = 0; i < road.segs.length; i++) {
          const g = road.segs[i];
          const a = L[i], b = R[i], c = R[i + 1], d = L[i + 1];
          const uv = kind === 'asphalt' ? [g.s0, -hw, g.s0, hw, g.s0 + g.len, hw, g.s0 + g.len, -hw] : [-hw, g.s0, hw, g.s0, hw, g.s0 + g.len, -hw, g.s0 + g.len];
          quadF(E, [a.x, a.y, a.z], [b.x, b.y, b.z], [c.x, c.y, c.z], [d.x, d.y, d.z], uv, [0, 1, 0]);
        }
      });
    });
    // --- side skirts for raised roads
    if (!flat) {
      E.with({ color: col('#9c9a93'), pat: PAT.CONCRETE, gloss: 0.15, weather: 0.6, vbase: 0 }, () => {
        for (const side of [L, R]) {
          for (let i = 0; i < side.length - 1; i++) {
            const a = side[i], b = side[i + 1];
            const want = side === R ? [road.segs[i].right.x, 0, road.segs[i].right.z] : [-road.segs[i].right.x, 0, -road.segs[i].right.z];
            quadF(E, [a.x, -0.6, a.z], [b.x, -0.6, b.z], [b.x, b.y - 0.01, b.z], [a.x, a.y - 0.01, a.z], [0, -0.6, 1, -0.6, 1, b.y, 0, a.y], want);
          }
        }
      });
    }
    if (road.opt.alley || road.opt.path) {
      if (road.opt.alley) {
        // centre drain channel
        sinkFn(() => E.with({ color: col('#6f6e69'), pat: PAT.GUTTER, gloss: 0.6 }, () => strip(ctx, road, 0, road.length, -0.12, 0.12, 0.012, 'gutter')));
        ctx.gutters.push([P(road, 0.2, 0, 0.02), P(road, road.length - 0.2, 0, 0.02)]);
      }
      continue;
    }
    // --- L-shaped gutters
    const gw = road.opt.main ? 0.45 : 0.36;
    sinkFn(() => {
      E.with({ color: col('#a3a29c'), pat: PAT.GUTTER, gloss: 0.45, weather: 0 }, () => {
        for (const side of [1, -1]) {
          let s = 0.2;
          const segsOut = [];
          let start = null;
          for (; s <= road.length - 0.2; s += 0.5) {
            const ok = !road.inGap(side, s);
            if (ok && start === null) start = s;
            if ((!ok || s + 0.5 > road.length - 0.2) && start !== null) {
              segsOut.push([start, ok ? road.length - 0.2 : s]);
              start = null;
            }
          }
          for (const [a, b] of segsOut) {
            if (b - a < 0.4) continue;
            const a0 = side > 0 ? hw - gw : -hw, a1 = side > 0 ? hw : -hw + gw;
            strip(ctx, road, a, b, a0, a1, 0.014, 'gutter');
            ctx.gutters.push([P(road, a, side * (hw - 0.14), 0.024), P(road, b, side * (hw - 0.14), 0.024)]);
            // gratings every so often
            for (let gs = a + rng.range(4, 10); gs < b - 1; gs += rng.range(10, 18)) {
              E.with({ color: col('#3b3d3f'), pat: PAT.GRATE, gloss: 0.5 }, () => strip(ctx, road, gs, gs + 0.6, a0 + 0.04, a1 - 0.04, 0.02, 'gutter'));
            }
          }
        }
      });
    });
    // --- markings
    if (road.opt.lines) {
      sinkFn(() => {
        E.with({ color: col('#e6e6e0'), pat: PAT.PAINT, gloss: 0.5 }, () => {
          const off = hw - gw - 0.25;
          for (const side of [1, -1]) {
            let start = null;
            for (let s = 0.4; s <= road.length - 0.4; s += 0.5) {
              const ok = !road.inGap(side, s) && !road.inGap(side, s - 1.2) && !road.inGap(side, s + 1.2);
              if (ok && start === null) start = s;
              if ((!ok || s + 0.5 > road.length - 0.4) && start !== null) {
                if (s - start > 1) strip(ctx, road, start, s, side * off - 0.075, side * off + 0.075, 0.008);
                start = null;
              }
            }
          }
        });
      });
    }
    // stop line + 止まれ where minor roads meet the main street (their start)
    if (road.id === 'crossW' || road.id === 'crossE' || road.id === 'slope' || road.id === 'southW' || road.id === 'southE') {
      sinkFn(() => {
        E.with({ color: col('#e8e8e2'), pat: PAT.PAINT, gloss: 0.5 }, () => strip(ctx, road, 1.2, 1.65, 0, hw - gw, 0.009));
        ctx.inSink('atlas', () => {
          E.with({ color: col('#e8e8e2'), pat: PAT.PAINT, gloss: 0.5 }, () => {
            const sc = 4.6, tl = 3.6, tw = Math.min(1.4, hw - gw - 0.2), ac = hw / 2 - 0.05;
            quadF(E, P(road, sc + tl / 2, ac + tw / 2, 0.012), P(road, sc + tl / 2, ac - tw / 2, 0.012), P(road, sc - tl / 2, ac - tw / 2, 0.012), P(road, sc - tl / 2, ac + tw / 2, 0.012), quv(at.tomare), [0, 1, 0]);
          });
        });
      });
    }
    // manholes along the centre of longer roads
    if (road.length > 30) {
      ctx.inSink('atlas', () => {
        E.with({ color: col('#ffffff'), pat: PAT.PLAIN, gloss: 0.7, weather: 0 }, () => {
          for (let s = rng.range(8, 20); s < road.length - 5; s += rng.range(28, 45)) {
            const c = P(road, s, rng.range(-0.3, 0.3), 0.013);
            const r = 0.33, seg = 16;
            const m = at.manhole;
            const cu = (m.u0 + m.u1) / 2, cv = (m.v0 + m.v1) / 2, ru = (m.u1 - m.u0) / 2, rv = (m.v1 - m.v0) / 2;
            const ci = E._vert(c[0], c[1], c[2], 0, 1, 0, cu, cv);
            const ring = [];
            for (let i = 0; i <= seg; i++) {
              const a = (i / seg) * Math.PI * 2;
              ring.push(E._vert(c[0] + Math.cos(a) * r, c[1], c[2] + Math.sin(a) * r, 0, 1, 0, cu + Math.cos(a) * ru, cv - Math.sin(a) * rv));
            }
            for (let i = 0; i < seg; i++) E._tri(ci, ring[i + 1], ring[i]);
          }
        });
      });
    }
  }
  // zebra crossing on the main street just south of the start junction
  const m = roads.main;
  ctx.chunk(0, 6);
  ctx.inSink('ground', () => {
    E.with({ color: col('#e8e8e2'), pat: PAT.PAINT, gloss: 0.5 }, () => {
      for (let a = -1.9; a < 1.95; a += 0.9) strip(ctx, m, 84 - 9.4, 84 - 6.4, a, a + 0.45, 0.009);
    });
  });
  // diamond "crossing ahead" mark
  ctx.inSink('ground', () => {
    E.with({ color: col('#e8e8e2'), pat: PAT.PAINT, gloss: 0.5 }, () => {
      const s = 84 - 22, a = -1.1;
      const pts = [P(m, s - 1.5, a, 0.009), P(m, s, a + 0.45, 0.009), P(m, s + 1.5, a, 0.009), P(m, s, a - 0.45, 0.009)];
      const inner = [P(m, s - 1.2, a, 0.0092), P(m, s, a + 0.3, 0.0092), P(m, s + 1.2, a, 0.0092), P(m, s, a - 0.3, 0.0092)];
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        quadF(E, pts[i], pts[j], inner[j], inner[i], null, [0, 1, 0]);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Terrace T1 (retaining wall), stairs, hill terrain
// ---------------------------------------------------------------------------
function inPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function buildTerraces(ctx, roads, lots) {
  const E = ctx.E, rng = ctx.rng;
  ctx.chunk(-40, 10);
  // T1 prism: stone walls + soil top
  E.with({ color: col('#9b988d'), pat: PAT.STONE, gloss: 0.2, weather: 0.6, vbase: 0 }, () => {
    const pts = T1.poly;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      // polygon listed clockwise seen from above (x right, z down) -> outside on the left walking a->b
      E.wall(a[0], a[1], b[0], b[1], -0.5, T1.level, 0);
    }
  });
  // wall cap
  E.with({ color: col('#b3b0a6'), pat: PAT.CONCRETE, gloss: 0.3 }, () => {
    const pts = T1.poly;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (a[0] < -80 || b[0] < -80) continue;
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
      const nx = dz / l, nz = -dx / l;
      E.frame(0, 0, 0, 0, () => {
        quadF(E, [a[0], T1.level + 0.08, a[1]], [b[0], T1.level + 0.08, b[1]], [b[0] + nx * 0.25, T1.level + 0.08, b[1] + nz * 0.25], [a[0] + nx * 0.25, T1.level + 0.08, a[1] + nz * 0.25], null, [0, 1, 0]);
        quadF(E, [a[0], T1.level - 0.05, a[1]], [b[0], T1.level - 0.05, b[1]], [b[0], T1.level + 0.08, b[1]], [a[0], T1.level + 0.08, a[1]], null, [-nx, 0, -nz]);
      });
    }
  });
  E.with({ color: col('#6a604f'), pat: PAT.SOIL, param: 0.4, gloss: 0.15 }, () => E.poly(T1.poly.map(([x, z]) => [x, z]), T1.level - 0.04, true));
  // fence along the top edges (east + north)
  E.frame(-26.35, T1.level, 0, Math.PI / 2, () => {
    fence(ctx, -63, -1.5, 0, 1.1, { color: '#8b8e8d' });
    fence(ctx, 1.5, 37.6, 0, 1.1, { color: '#8b8e8d' });
  });
  E.frame(0, T1.level, -37.7, 0, () => fence(ctx, -38.5, -26.3, 0, 1.1, { color: '#8b8e8d' }));
  // weeds along the wall foot and top
  E.frame(-25.9, 0, 0, Math.PI / 2, () => {
    for (let z = -60; z < 36; z += 0.7) if (rng.chance(0.4) && Math.abs(z) > 2.5) grass(ctx, z, 0.01, 0.05, rng.range(0.2, 0.5));
  });
  // ivy / shrubs hanging over the wall
  for (let z = 30; z > -36; z -= rng.range(3, 7)) {
    if (Math.abs(z) < 3) continue;
    bush(ctx, -26.6, T1.level, z, rng.range(0.4, 0.8), { color: '#4f7a42' });
  }

  // stairs from the cross street up to T1
  ctx.chunk(-30, 0);
  const steps = 25, rise = T1.level / steps, run = (33.6 - 26) / steps;
  E.with({ color: col('#b1afa8'), pat: PAT.CONCRETE, gloss: 0.4, weather: 0.3 }, () => {
    for (let i = 0; i < steps; i++) {
      const xa = -26 - (i + 1) * run, xb = -26 - i * run;
      E.box(xa, -0.2, -1.3, xb + 0.02, (i + 1) * rise, 1.3, { ny: true });
      // non-slip nosing
    }
  });
  E.with({ color: col('#8f8d86'), pat: PAT.PLAIN, gloss: 0.3 }, () => {
    for (let i = 0; i < steps; i++) E.box(-26 - i * run - 0.06, (i + 1) * rise, -1.25, -26 - i * run + 0.0, (i + 1) * rise + 0.004, 1.25);
  });
  const railPts = (z) => [[-25.6, 0, z], [-26 - run * 0.5, rise, z], [-33.6 + run * 0.5, T1.level, z], [-34.6, T1.level, z]];
  handRail(ctx, railPts(0), 0.85, { mid: false, step: 2.4 });
  handRail(ctx, railPts(-1.18), 0.85, { step: 2.4 });
  handRail(ctx, railPts(1.18), 0.85, { step: 2.4 });
  for (let i = 0; i < steps; i += 3) grass(ctx, -26 - i * run - 0.1, (i + 1) * rise, rng.chance(0.5) ? 1.2 : -1.2, 0.2);
  void roads;
  void lots;
}

// retaining walls where the slope road cuts into the hill
export function buildCutWalls(ctx, roads, lots, H) {
  const E = ctx.E;
  const road = roads.slope;
  const hw = road.w / 2;
  for (const side of [1, -1]) {
    let prev = null;
    for (let s = 36; s <= road.length; s += 1.5) {
      const p = road.at(s);
      const ox = p.x + p.right.x * side * (hw + 0.05), oz = p.z + p.right.z * side * (hw + 0.05);
      const nat = naturalHeight(p.x + p.right.x * side * (hw + 2.5), p.z + p.right.z * side * (hw + 2.5));
      let free = true;
      for (const lot of lots) {
        const b = lot.bbox;
        if (b && ox > b.minX - 0.5 && ox < b.maxX + 0.5 && oz > b.minZ - 0.5 && oz < b.maxZ + 0.5) free = false;
      }
      const top = clamp(nat, p.y, p.y + 4.5);
      const cur = free && top - p.y > 0.5 ? { x: ox, z: oz, y0: p.y - 0.3, y1: top } : null;
      if (prev && cur) {
        ctx.chunk(ox, oz);
        E.with({ color: col('#9a978b'), pat: PAT.STONE, gloss: 0.2, weather: 0.6, vbase: 0 }, () => {
          const want = [-p.right.x * side, 0, -p.right.z * side];
          quadF(E, [prev.x, prev.y0, prev.z], [cur.x, cur.y0, cur.z], [cur.x, cur.y1, cur.z], [prev.x, prev.y1, prev.z], [0, prev.y0, 1.5, cur.y0, 1.5, cur.y1, 0, prev.y1], want);
          E.with({ color: col('#b0ada3'), pat: PAT.CONCRETE }, () => quadF(E, [prev.x, prev.y1, prev.z], [cur.x, cur.y1, cur.z], [cur.x + p.right.x * side * 0.3, cur.y1, cur.z + p.right.z * side * 0.3], [prev.x + p.right.x * side * 0.3, prev.y1, prev.z + p.right.z * side * 0.3], null, [0, 1, 0]));
        });
      }
      prev = cur;
    }
  }
  void H;
  void tree;
  void THREE;
}
