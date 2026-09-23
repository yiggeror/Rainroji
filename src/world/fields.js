import * as THREE from 'three';
import { PAT } from '../builder.js';
import { col } from '../util.js';
import { quadF } from './parts.js';
import { SEA } from './layout.js';
import { grass, clump, pine, bush, tree } from './plants.js';
import { shed } from './props.js';

// ---------------------------------------------------------------------------
// Rice paddies (田んぼ): flooded terraces of young rice in neat rows, earthen
// levees with grass, a concrete irrigation ditch and a farm lane.
// rect: [x0, x1, z0, z1] (2 m aligned, the terrain leaves a hole there)
// ---------------------------------------------------------------------------
export function buildPaddies(ctx, rect, o = {}) {
  const E = ctx.E, rng = ctx.rng;
  const [X0, X1, Z0, Z1] = rect;
  const W = 0.9; // levee width
  // field grid
  const nx = Math.max(1, Math.round((X1 - X0) / (o.cellX || 11)));
  const nz = Math.max(1, Math.round((Z1 - Z0) / (o.cellZ || 16)));
  const cw = (X1 - X0) / nx, cd = (Z1 - Z0) / nz;
  const water = -0.18, soil = -0.34;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const x0 = X0 + i * cw, x1 = x0 + cw, z0 = Z0 + j * cd, z1 = z0 + cd;
      ctx.chunk((x0 + x1) / 2, (z0 + z1) / 2);
      const ax = x0 + W / 2, bx = x1 - W / 2, az = z0 + W / 2, bz = z1 - W / 2;
      // mud floor + water surface
      E.with({ color: col('#4a4133'), pat: PAT.SOIL, param: -0.6, gloss: 0.2 }, () => E.quad([ax, soil, bz], [bx, soil, bz], [bx, soil, az], [ax, soil, az], null, [0, 1, 0]));
      E.with({ color: col('#56645e'), pat: PAT.WATER, param: 0.0, gloss: 0.95, weather: 0 }, () => E.quad([ax, water, bz], [bx, water, bz], [bx, water, az], [ax, water, az], [ax, bz, bx, bz, bx, az, ax, az], [0, 1, 0]));
      // levees (a low earthen ridge around each field)
      E.with({ color: col('#5a6a3f'), pat: PAT.SOIL, param: 0.7, gloss: 0.15 }, () => {
        const lv = (pa, pb, n) => {
          // top strip + two sloped sides
          const [ux, uz] = [pb[0] - pa[0], pb[1] - pa[1]];
          const L = Math.hypot(ux, uz), px = -uz / L, pz = ux / L;
          const t = W / 2;
          quadF(E, [pa[0] + px * t * 0.5, 0.02, pa[1] + pz * t * 0.5], [pb[0] + px * t * 0.5, 0.02, pb[1] + pz * t * 0.5], [pb[0] - px * t * 0.5, 0.02, pb[1] - pz * t * 0.5], [pa[0] - px * t * 0.5, 0.02, pa[1] - pz * t * 0.5], null, [0, 1, 0]);
          for (const sg of [1, -1]) quadF(E, [pa[0] + sg * px * t * 0.5, 0.02, pa[1] + sg * pz * t * 0.5], [pb[0] + sg * px * t * 0.5, 0.02, pb[1] + sg * pz * t * 0.5], [pb[0] + sg * px * t * 1.05, soil, pb[1] + sg * pz * t * 1.05], [pa[0] + sg * px * t * 1.05, soil, pa[1] + sg * pz * t * 1.05], null, [sg * px, 0.6, sg * pz]);
          void n;
        };
        lv([x0, z0 + W / 2], [x1, z0 + W / 2]);
        lv([x0, z1 - W / 2], [x1, z1 - W / 2]);
        lv([x0 + W / 2, z0], [x0 + W / 2, z1]);
        lv([x1 - W / 2, z0], [x1 - W / 2, z1]);
      });
      // weeds on the levees
      for (let k = 0; k < (cw + cd) * 0.5; k++) {
        const e = rng.next();
        const gx = e < 0.5 ? rng.range(x0, x1) : rng.chance(0.5) ? x0 + W / 2 : x1 - W / 2;
        const gz = e < 0.5 ? (rng.chance(0.5) ? z0 + W / 2 : z1 - W / 2) : rng.range(z0, z1);
        grass(ctx, gx, 0.02, gz, rng.range(0.25, 0.55), { n: 2, color: rng.pick(['#6f8f45', '#7d9a50', '#5f7f3f']) });
      }
      // young rice in rows (a few fields are fallow / freshly flooded)
      if (rng.chance(0.85)) {
        const tall = rng.range(0.36, 0.55);
        const sp = 0.36;
        const along = rng.chance(0.5);
        ctx.inSink('leaf', () => {
          E.set({ sway: 0.03, weather: 1.0 });
          for (let a = (along ? ax : az) + 0.3; a < (along ? bx : bz) - 0.2; a += sp) {
            for (let b = (along ? az : ax) + 0.3; b < (along ? bz : bx) - 0.2; b += 0.3) {
              const x = along ? a : b, z = along ? b : a;
              const c = col('#5d8a3c').offsetHSL(rng.range(-0.015, 0.015), rng.range(-0.08, 0.02), rng.range(-0.05, 0.03));
              E.set({ color: c, ex1: rng.next() });
              const h = tall * rng.range(0.8, 1.15);
              for (let q = 0; q < 2; q++) {
                const ang = rng.range(0, Math.PI) + q * 1.4;
                const dx = Math.cos(ang) * h * 0.16, dz = Math.sin(ang) * h * 0.16;
                const i0 = E._vert(x - dx, water - 0.02, z - dz, 0, 1, 0, 0.5, 0);
                const i1 = E._vert(x + dx, water - 0.02, z + dz, 0, 1, 0, 1.0, 0);
                E.b.sway = 0.04 * h;
                const i2 = E._vert(x + dx * 1.4, water + h, z + dz * 1.4, 0.2, 1, 0.2, 1.0, 0.5);
                const i3 = E._vert(x - dx * 1.4, water + h, z - dz * 1.4, 0.2, 1, 0.2, 0.5, 0.5);
                E.b.sway = 0.03;
                E._tri(i0, i1, i2);
                E._tri(i0, i2, i3);
              }
            }
          }
          E.set({ sway: 0, weather: 0, ex1: 0 });
        });
      }
    }
  }
  // irrigation ditch along the west edge, farm lane along the east edge
  ctx.chunk(X0, (Z0 + Z1) / 2);
  E.with({ color: col('#a3a098'), pat: PAT.CONCRETE, gloss: 0.3, weather: 0.8 }, () => {
    E.box(X0 - 1.3, -0.6, Z0, X0 - 1.15, 0.05, Z1);
    E.box(X0 - 0.15, -0.6, Z0, X0, 0.05, Z1);
  });
  E.with({ color: col('#44524c'), pat: PAT.WATER, param: 2.0, gloss: 0.95 }, () => E.quad([X0 - 1.15, -0.35, Z1], [X0 - 0.15, -0.35, Z1], [X0 - 0.15, -0.35, Z0], [X0 - 1.15, -0.35, Z0], [X0 - 1.15, Z1, X0 - 0.15, Z1, X0 - 0.15, Z0, X0 - 1.15, Z0], [0, 1, 0]));
  // a scarecrow, a little tool hut, a persimmon tree
  const sx = X0 + cw * 1.5, sz = Z0 + cd * 0.5;
  ctx.chunk(sx, sz);
  E.with({ color: col('#6a5642'), pat: PAT.WOOD }, () => {
    E.box(sx - 0.03, water, sz - 0.03, sx + 0.03, 1.7, sz + 0.03);
    E.box(sx - 0.55, 1.25, sz - 0.02, sx + 0.55, 1.3, sz + 0.02);
  });
  E.with({ color: col('#4a6a8a'), pat: PAT.PLAIN, gloss: 0.2 }, () => E.box(sx - 0.25, 0.9, sz - 0.12, sx + 0.25, 1.35, sz + 0.12));
  E.with({ color: col('#d8c7a0'), pat: PAT.PLAIN }, () => E.cyl(sx, 1.45, sz, 0.14, 0.26, 8));
  E.with({ color: col('#9a7a4a'), pat: PAT.PLAIN, gloss: 0.2 }, () => E.cyl(sx, 1.68, sz, 0.36, 0.1, 10, true, 0.05));
  shed(ctx, X1 - 2, 0, Z0 - 1.5, 2.2, 1.6, 2.1, Math.PI);
  tree(ctx, X1 - 5, 0, Z0 - 1.8, { h: 5.5, crown: 2.2, color: '#5b7f3a' });
  return { rect };
}

// ---------------------------------------------------------------------------
// The beach below the terrace: a black pine grove, boats pulled up on the sand,
// net racks, and a small torii on a rock just off the shore.
// ---------------------------------------------------------------------------
export function buildBeach(ctx, H, boats) {
  const E = ctx.E, rng = ctx.rng;
  // pine grove behind the beach
  for (let k = 0, n = 0; k < 600 && n < 46; k++) {
    const x = rng.range(-92, -24), z = rng.range(66, 86);
    const h = H(x, z);
    if (h < -0.2) continue;
    n++;
    ctx.chunk(x, z);
    pine(ctx, x, h, z, { h: rng.range(6, 10.5), lean: [rng.range(-1.2, 1.2), rng.range(0.4, 2.2)] });
    if (rng.chance(0.3)) bush(ctx, x + rng.range(-2, 2), h, z + rng.range(-2, 2), rng.range(0.4, 0.8), { color: '#557a3e' });
  }
  // net drying racks and two boats hauled up the beach
  for (const [x, z, r] of [[-52, 90, 0.2], [-66, 92, -0.1]]) {
    const y = H(x, z);
    ctx.chunk(x, z);
    E.frame(x, y, z, r, () => {
      E.with({ color: col('#6e5a44'), pat: PAT.WOOD, gloss: 0.1 }, () => {
        for (const px of [-3, 0, 3]) E.box(px - 0.05, 0, -0.05, px + 0.05, 1.9, 0.05);
        E.box(-3.2, 1.85, -0.04, 3.2, 1.9, 0.04);
      });
      E.with({ color: col('#2f4a3c'), pat: PAT.GRATE, gloss: 0.2, sway: 0.03 }, () => {
        quadF(E, [-3, 1.85, 0.06], [3, 1.85, 0.06], [3, 0.35, 0.18], [-3, 0.35, 0.18], [0, 0, 6, 0, 6, 1.5, 0, 1.5], [0, 0, 1]);
        quadF(E, [3, 1.85, -0.06], [-3, 1.85, -0.06], [-3, 0.35, -0.18], [3, 0.35, -0.18], [0, 0, 6, 0, 6, 1.5, 0, 1.5], [0, 0, -1]);
      });
      E.with({ color: col('#e8762c'), pat: PAT.PLAIN, gloss: 0.5 }, () => {
        for (let px = -2.6; px < 2.8; px += 0.8) E.cyl(px, 1.7, 0.1, 0.07, 0.12, 6);
      });
    });
  }
  boats.push({ x: -40, z: 93.5, rot: 1.35, variant: 2, beached: true, y: H(-40, 93.5) + 0.35, tilt: 0.12 });
  boats.push({ x: -58, z: 95, rot: 1.9, variant: 2, beached: true, y: H(-58, 95) + 0.3, tilt: -0.1 });
  // the rock with a little torii, just off the beach
  const rx = -63, rz = 118;
  ctx.chunk(rx, rz);
  E.with({ color: col('#6b665e'), pat: PAT.LEAF, gloss: 0.5, weather: 0.3 }, () => {
    const g = new THREE.IcosahedronGeometry(1, 1);
    E.geom(g, new THREE.Matrix4().compose(new THREE.Vector3(rx, SEA - 0.5, rz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.4, 0)), new THREE.Vector3(5.2, 3.1, 4.4)));
    E.geom(g, new THREE.Matrix4().compose(new THREE.Vector3(rx + 3.5, SEA - 0.3, rz + 1.5), new THREE.Quaternion(), new THREE.Vector3(2.2, 1.6, 2.0)));
  });
  ctx.solidWorld(rx - 4, SEA - 3, rz - 3.5, rx + 4, SEA + 2.0, rz + 3.5);
  const ty = SEA + 2.3;
  E.frame(rx - 0.4, ty, rz, 0.3, () => {
    E.with({ color: col('#c4452f'), pat: PAT.PLAIN, gloss: 0.35, weather: 0.3 }, () => {
      for (const sx of [-0.8, 0.8]) E.cyl(sx, -0.3, 0, 0.09, 2.3, 10);
      E.box(-1.0, 1.6, -0.07, 1.0, 1.72, 0.07);
    });
    E.with({ color: col('#262220'), pat: PAT.PLAIN, gloss: 0.4 }, () => {
      E.beam([-1.35, 2.08, 0], [0, 1.98, 0], 0.18, 0.14);
      E.beam([0, 1.98, 0], [1.35, 2.08, 0], 0.18, 0.14);
    });
    E.with({ color: col('#e8dcb0'), pat: PAT.PLAIN }, () => E.tube([[-0.8, 1.35, 0.1], [0, 1.2, 0.12], [0.8, 1.35, 0.1]], 0.035, 4));
  });
  clump(ctx, rx + 1.8, SEA + 2.5, rz - 1.2, 0.8, 0.4, 0.7, { tile: 'small', color: '#4f6f3e', n: 14 });
  void grass;
}
