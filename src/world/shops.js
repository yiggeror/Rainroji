import * as THREE from 'three';
import { PAT } from '../builder.js';
import { col } from '../util.js';
import { quv } from './atlas.js';
import { windowUnit, door, facades, gableRoof, hipRoof, flatRoof, downPipe, balcony, quadF } from './parts.js';
import { acUnit, meterBox, gasMeter, bicycle, blockWall, crates, umbrella } from './props.js';
import { potPlant, clump, weeds } from './plants.js';
import { lotBase, slab, wallMat, ROOFS } from './house.js';

// ---------------------------------------------------------------------------
// Shop interiors you can actually look into: clear glass, a lit room with real
// shelves, goods, counters and furniture.
// Frame: the shop front, x along the facade (0..W), z outward, interior z < 0.
// ---------------------------------------------------------------------------
const IN = 0.42; // indoor light (emission) on interior surfaces

function atlasQuad(ctx, r, a, b, c, d, n, emit = 0) {
  const E = ctx.E;
  ctx.inSink('atlas', () => E.with({ color: col('#ffffff'), pat: emit ? PAT.EMIT : PAT.PLAIN, emit: emit || IN, gloss: 0.3, weather: 0 }, () => E.quad(a, b, c, d, quv(r), n)));
}

// glass pane in the current frame, facing +z
export function clearGlass(ctx, x0, y0, x1, y1, z = 0) {
  const E = ctx.E;
  ctx.inSink('glass', () => E.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [0, 0, (x1 - x0) / 2, 0, (x1 - x0) / 2, (y1 - y0) / 2, 0, (y1 - y0) / 2], [0, 0, 1]));
}

// the room shell: floor, three walls, ceiling with light panels
function room(ctx, W, D, H, o) {
  const E = ctx.E;
  const f = 0.12, m = 0.18; // inset so the room sits inside the building walls
  E.with({ color: col(o.floor || '#c8c4ba'), pat: PAT.TILE, param: 0.3, gloss: 0.5, emit: IN * 0.8, weather: 0 }, () => E.quad([m, f, -0.05], [W - m, f, -0.05], [W - m, f, -D + m], [m, f, -D + m], [0, 0, W, 0, W, D, 0, D], [0, 1, 0]));
  E.with({ color: col(o.wall || '#e4e0d6'), pat: o.wallPat ?? PAT.PLAIN, param: 0.2, gloss: 0.1, emit: IN, weather: 0 }, () => {
    quadF(E, [m, f, -D + m], [W - m, f, -D + m], [W - m, H, -D + m], [m, H, -D + m], [0, 0, W, 0, W, H, 0, H], [0, 0, 1]);
    quadF(E, [m, f, -0.05], [m, f, -D + m], [m, H, -D + m], [m, H, -0.05], [0, 0, D, 0, D, H, 0, H], [1, 0, 0]);
    quadF(E, [W - m, f, -D + m], [W - m, f, -0.05], [W - m, H, -0.05], [W - m, H, -D + m], [0, 0, D, 0, D, H, 0, H], [-1, 0, 0]);
  });
  E.with({ color: col(o.ceil || '#eeede8'), pat: PAT.PLAIN, emit: IN * 1.1, gloss: 0 }, () => quadF(E, [m, H, -0.05], [W - m, H, -0.05], [W - m, H, -D + m], [m, H, -D + m], null, [0, -1, 0]));
  // skirting
  E.with({ color: col(o.skirt || '#6b6a66'), pat: PAT.PLAIN, emit: IN * 0.6 }, () => {
    E.box(0.18, f, -D + 0.18, W - 0.18, f + 0.08, -D + 0.2, { ny: true });
  });
  // light fittings
  const warm = o.warm;
  E.with({ color: col(warm ? '#fff0d4' : '#f2f7ff'), pat: PAT.EMIT, emit: 1.7 }, () => {
    const n = Math.max(1, Math.round(W / 2.6));
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) / n) * W;
      if (o.pendants) {
        E.cyl(x, H - 0.75, -D * 0.45, 0.18, 0.16, 10, true, 0.06);
      } else E.box(x - 0.6, H - 0.06, -D * 0.5 - 0.08, x + 0.6, H - 0.02, -D * 0.5 + 0.08);
    }
  });
  if (o.pendants) {
    E.with({ color: col('#2f2a25'), pat: PAT.PLAIN }, () => {
      const n = Math.max(1, Math.round(W / 2.6));
      for (let i = 0; i < n; i++) E.box(((i + 0.5) / n) * W - 0.006, H - 0.6, -D * 0.45 - 0.006, ((i + 0.5) / n) * W + 0.006, H, -D * 0.45 + 0.006);
    });
  }
}

// glazed front with mullions, a kick panel, a transom and a sliding door
function glazedFront(ctx, W, H, o) {
  const E = ctx.E;
  const fc = col(o.frame || '#9a9d9e');
  const kick = o.kick ?? 0.45;
  const panes = Math.max(2, Math.round(W / 1.6));
  E.with({ color: fc, pat: PAT.METAL, gloss: 0.5 }, () => {
    E.box(0.05, 0, -0.02, W - 0.05, kick, 0.06, { ny: true });
    E.box(0.05, H - 0.32, -0.02, W - 0.05, H, 0.06);
    for (let i = 0; i <= panes; i++) {
      const x = 0.05 + (i / panes) * (W - 0.1);
      E.box(x - 0.035, kick, -0.02, x + 0.035, H - 0.32, 0.07, { ny: true, py: true });
    }
    E.box(0.05, kick - 0.04, 0.0, W - 0.05, kick, 0.1);
  });
  for (let i = 0; i < panes; i++) {
    const xa = 0.05 + (i / panes) * (W - 0.1) + 0.035, xb = 0.05 + ((i + 1) / panes) * (W - 0.1) - 0.035;
    clearGlass(ctx, xa, kick, xb, H - 0.32, 0.02);
  }
  clearGlass(ctx, 0.1, H - 0.3, W - 0.1, H - 0.03, 0.03);
}

// gondola shelving unit (double sided) along local z at x, from z0 to z1
function gondola(ctx, x, z0, z1, h, r) {
  const E = ctx.E;
  E.with({ color: col('#dcdad3'), pat: PAT.METAL, gloss: 0.4, emit: IN * 0.8 }, () => {
    E.box(x - 0.45, 0.12, z1, x + 0.45, 0.28, z0, { ny: true });
    E.box(x - 0.04, 0.28, z1, x + 0.04, h, z0, { ny: true });
    for (let k = 1; k <= 4; k++) {
      const y = 0.28 + (k / 4.2) * (h - 0.35);
      E.box(x - 0.42 + (k * 0.04), y - 0.02, z1, x + 0.42 - (k * 0.04), y, z0);
    }
  });
  const len = Math.abs(z0 - z1);
  for (const s of [-1, 1]) {
    const fx = x + s * 0.4;
    const a = [fx, 0.3, s > 0 ? z0 : z1], b = [fx, 0.3, s > 0 ? z1 : z0], c = [fx, h - 0.05, s > 0 ? z1 : z0], d = [fx, h - 0.05, s > 0 ? z0 : z1];
    const R = ctx.atlasRects.goods;
    const rr = { ...R, u1: R.u0 + (R.u1 - R.u0) * Math.min(1, len / 3.2) };
    atlasQuad(ctx, rr, a, b, c, d, [s, 0, 0]);
  }
  // end caps facing the door
  atlasQuad(ctx, ctx.atlasRects.goods, [x - 0.42, 0.3, z0 + 0.01], [x + 0.42, 0.3, z0 + 0.01], [x + 0.42, h - 0.05, z0 + 0.01], [x - 0.42, h - 0.05, z0 + 0.01], [0, 0, 1]);
}

function chair(E, x, z, rot, c = '#6a4a36') {
  E.frame(x, 0.12, z, rot, () => {
    E.with({ color: col(c), pat: PAT.WOOD, gloss: 0.3, emit: IN * 0.8 }, () => {
      E.box(-0.2, 0.42, -0.2, 0.2, 0.46, 0.2);
      E.box(-0.2, 0.46, -0.22, 0.2, 0.9, -0.18);
      for (const [a, b] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) E.box(a - 0.02, 0, b - 0.02, a + 0.02, 0.42, b + 0.02);
    });
  });
}

// ---------------------------------------------------------------------------
export function shopFront(ctx, W, D, H, kind, o = {}) {
  const E = ctx.E, rng = ctx.rng;
  const R = ctx.atlasRects;
  const warm = kind === 'kissa' || kind === 'bakery' || kind === 'izakaya';
  room(ctx, W, D, H, {
    warm,
    pendants: kind === 'kissa',
    floor: kind === 'kissa' ? '#7a5a42' : kind === 'barber' ? '#d8d4ca' : kind === 'bakery' ? '#b89a78' : '#cfccc3',
    wall: kind === 'kissa' ? '#8a6a50' : kind === 'barber' ? '#e8ecee' : kind === 'laundry' ? '#e6ecef' : '#ece8de',
    wallPat: kind === 'kissa' ? PAT.WOOD : PAT.PLAIN,
  });
  glazedFront(ctx, W, H, { frame: o.frame, kick: kind === 'kissa' ? 0.8 : 0.45 });
  const inLight = ctx.toWorld(W / 2, H - 0.6, -D * 0.45);
  ctx.addLight(inLight, warm ? '#ffe2b6' : '#eef4ff', Math.max(6, W * 0.9), 0.9);
  ctx.addLight(ctx.toWorld(W / 2, 1.2, 1.4), warm ? '#ffe0b0' : '#eaf2ff', 6.5, 0.75, warm ? 0 : 1);
  ctx.glows.push({ p: ctx.toWorld(W / 2, 1.6, 0.3), color: col(warm ? '#ffe2b8' : '#eaf2ff'), size: 2.4, strength: 0.1 });

  if (kind === 'grocery') {
    const g1 = W * 0.36, g2 = W * 0.64;
    gondola(ctx, g1, -1.5, -D + 1.7, 1.55, R);
    if (W > 5.5) gondola(ctx, g2, -1.5, -D + 1.7, 1.55, R);
    // drink coolers along the back wall
    const cz = -D + 0.75;
    E.with({ color: col('#e9ebe8'), pat: PAT.METAL, gloss: 0.5, emit: IN }, () => E.box(0.4, 0.12, -D + 0.1, W - 0.4, 2.2, cz, { ny: true }));
    for (let x = 0.5; x < W - 1.2; x += 1.0) atlasQuad(ctx, R.bottles, [x, 0.3, cz + 0.01], [x + 0.9, 0.3, cz + 0.01], [x + 0.9, 2.0, cz + 0.01], [x, 2.0, cz + 0.01], [0, 0, 1], 1.1);
    // counter + register + cigarette rack
    const kx = W - 1.4;
    E.with({ color: col('#b9a585'), pat: PAT.WOOD, gloss: 0.3, emit: IN }, () => E.box(kx - 0.9, 0.12, -1.9, kx + 0.9, 1.0, -1.35, { ny: true }));
    E.with({ color: col('#2f3235'), pat: PAT.PLAIN, gloss: 0.6, emit: IN * 0.5 }, () => E.box(kx - 0.2, 1.0, -1.75, kx + 0.2, 1.22, -1.5));
    E.with({ color: col('#7fd4a0'), pat: PAT.EMIT, emit: 0.9 }, () => E.box(kx - 0.12, 1.12, -1.49, kx + 0.12, 1.2, -1.485));
    for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) {
      E.with({ color: col(rng.pick(['#d8433a', '#f2f0ea', '#3b7dc4', '#e8c030', '#2e8a5a', '#8a5ab0'])), pat: PAT.PLAIN, emit: IN }, () => E.box(W - 0.35 - c * 0.13 - 0.12, 1.3 + r * 0.2, -D + 0.9 + 0.0, W - 0.35 - c * 0.13, 1.45 + r * 0.2, -D + 0.9 + 0.08));
    }
    // magazine rack under the front window
    E.with({ color: col('#bdbab2'), pat: PAT.METAL, gloss: 0.4, emit: IN }, () => E.box(0.35, 0.12, -0.55, W * 0.45, 0.9, -0.25, { ny: true }));
    atlasQuad(ctx, R.magazines, [0.35, 0.5, -0.24], [W * 0.45, 0.5, -0.24], [W * 0.45, 1.05, -0.24], [0.35, 1.05, -0.24], [0, 0, 1]);
    atlasQuad(ctx, R.poster0, [0.11, 1.3, -1.8], [0.11, 1.3, -2.6], [0.11, 2.4, -2.6], [0.11, 2.4, -1.8], [1, 0, 0]);
  } else if (kind === 'laundry') {
    // washers along the left wall, stacked dryers on the right
    ctx.spinners = ctx.spinners || [];
    for (let z = -1.2, i = 0; z > -D + 1.0; z -= 0.85, i++) {
      E.frame(0.55, 0.12, z, Math.PI / 2, () => {
        E.with({ color: col('#eef1f2'), pat: PAT.METAL, gloss: 0.5, emit: IN }, () => E.box(-0.38, 0, -0.45, 0.38, 1.0, 0.3));
        atlasQuad(ctx, R.washer, [-0.36, 0.1, 0.305], [0.36, 0.1, 0.305], [0.36, 0.92, 0.305], [-0.36, 0.92, 0.305], [0, 0, 1]);
        if (i % 2 === 0) ctx.spinners.push({ p: ctx.toWorld(0, 0.49, 0.312), n: ctx.toWorld(0, 0.49, 1.312).sub(ctx.toWorld(0, 0.49, 0.312)).normalize(), r: 0.2, speed: rng.range(2, 4) * (rng.chance(0.5) ? 1 : -1) });
      });
    }
    for (let z = -1.2; z > -D + 1.0; z -= 0.9) {
      for (let k = 0; k < 2; k++) {
        E.frame(W - 0.5, 0.12 + k * 0.85, z, -Math.PI / 2, () => {
          E.with({ color: col('#dde3e6'), pat: PAT.METAL, gloss: 0.5, emit: IN }, () => E.box(-0.4, 0, -0.35, 0.4, 0.82, 0.3));
          atlasQuad(ctx, R.washer, [-0.35, 0.06, 0.305], [0.35, 0.06, 0.305], [0.35, 0.76, 0.305], [-0.35, 0.76, 0.305], [0, 0, 1]);
        });
      }
    }
    // folding table and a bench
    E.with({ color: col('#c7c2b6'), pat: PAT.WOOD, gloss: 0.3, emit: IN }, () => {
      E.box(W / 2 - 0.7, 0.85, -D + 1.1, W / 2 + 0.7, 0.9, -D + 0.5);
      for (const x of [W / 2 - 0.65, W / 2 + 0.6]) E.box(x, 0.12, -D + 1.05, x + 0.05, 0.85, -D + 0.55);
      E.box(W / 2 - 0.8, 0.45, -0.9, W / 2 + 0.8, 0.5, -0.55);
    });
    E.with({ color: col('#e8eaea'), pat: PAT.PLAIN, emit: IN }, () => {
      for (let i = 0; i < 3; i++) E.box(W / 2 - 0.5 + i * 0.35, 0.9, -D + 0.9, W / 2 - 0.25 + i * 0.35, 1.0 + i * 0.03, -D + 0.65);
    });
  } else if (kind === 'barber') {
    for (let i = 0; i < 2; i++) {
      const z = -1.5 - i * 1.6;
      // mirror + counter on the right wall
      E.with({ color: col('#7e8d96'), pat: PAT.PLAIN, gloss: 1.0, emit: IN * 0.8 }, () => quadF(E, [W - 0.12, 1.0, z + 0.55], [W - 0.12, 1.0, z - 0.55], [W - 0.12, 2.2, z - 0.55], [W - 0.12, 2.2, z + 0.55], null, [-1, 0, 0]));
      E.with({ color: col('#f3f2ee'), pat: PAT.PLAIN, gloss: 0.5, emit: IN }, () => E.box(W - 0.45, 0.85, z - 0.6, W - 0.1, 0.92, z + 0.6));
      for (let k = 0; k < 4; k++) E.with({ color: col(rng.pick(['#3a7dc4', '#e8e4d8', '#c8322e', '#2e8a5a'])), pat: PAT.PLAIN, gloss: 0.7, emit: IN }, () => E.cyl(W - 0.28, 0.92, z - 0.4 + k * 0.2, 0.035, 0.18, 6));
      // the chair
      E.frame(W - 1.25, 0.12, z, -Math.PI / 2, () => {
        E.with({ color: col('#9a9d9e'), pat: PAT.METAL, gloss: 0.6, emit: IN }, () => {
          E.cyl(0, 0, 0, 0.3, 0.06, 12);
          E.cyl(0, 0.06, 0, 0.07, 0.34, 8);
          E.box(-0.3, 0.12, 0.35, 0.3, 0.16, 0.6);
        });
        E.with({ color: col('#8a2a26'), pat: PAT.PLAIN, gloss: 0.6, emit: IN }, () => {
          E.box(-0.3, 0.4, -0.3, 0.3, 0.55, 0.3);
          E.box(-0.3, 0.55, -0.36, 0.3, 1.25, -0.24);
          E.box(-0.36, 0.55, -0.3, -0.28, 0.75, 0.3);
          E.box(0.28, 0.55, -0.3, 0.36, 0.75, 0.3);
          E.box(-0.14, 1.25, -0.34, 0.14, 1.42, -0.26);
        });
      });
    }
    // waiting sofa by the window + a little table with magazines
    E.with({ color: col('#4f5a66'), pat: PAT.PLAIN, gloss: 0.3, emit: IN }, () => {
      E.box(0.3, 0.12, -1.4, 0.9, 0.55, -0.4);
      E.box(0.2, 0.55, -1.4, 0.35, 0.95, -0.4);
    });
    atlasQuad(ctx, R.magazines, [1.0, 0.56, -0.9], [1.5, 0.56, -0.9], [1.5, 0.56, -1.2], [1.0, 0.56, -1.2], [0, 1, 0]);
    E.with({ color: col('#e0dbd0'), pat: PAT.PLAIN, emit: IN }, () => E.box(0.95, 0.12, -1.25, 1.55, 0.55, -0.85));
    // back wall: shampoo basin, shelves of folded towels, a clock and a price list
    E.with({ color: col('#f2f1ec'), pat: PAT.PLAIN, gloss: 0.5, emit: IN }, () => {
      E.box(W * 0.35, 0.12, -D + 0.2, W * 0.35 + 1.2, 0.85, -D + 0.75);
      E.box(0.4, 1.3, -D + 0.2, W * 0.3, 1.34, -D + 0.5);
      E.box(0.4, 1.75, -D + 0.2, W * 0.3, 1.79, -D + 0.5);
    });
    E.with({ color: col('#c9ccd0'), pat: PAT.METAL, gloss: 0.9, emit: IN }, () => E.cyl(W * 0.35 + 0.6, 0.85, -D + 0.45, 0.22, 0.06, 12));
    for (let x = 0.5; x < W * 0.3 - 0.2; x += 0.28) {
      for (const y of [1.34, 1.79]) E.with({ color: col(rng.pick(['#f4f2ec', '#e9eef2', '#dde8e0'])), pat: PAT.PLAIN, emit: IN }, () => E.box(x, y, -D + 0.25, x + 0.24, y + 0.12, -D + 0.48));
    }
    E.with({ color: col('#2a2c2e'), pat: PAT.PLAIN, emit: IN * 0.5 }, () => E.cyl(W * 0.7, 2.2, -D + 0.21, 0.18, 0.03, 16));
    E.with({ color: col('#f5f5f0'), pat: PAT.PLAIN, emit: IN }, () => E.cyl(W * 0.7, 2.2, -D + 0.24, 0.15, 0.01, 16));
    atlasQuad(ctx, R.timetable, [W * 0.72 + 0.4, 1.3, -D + 0.2], [W * 0.72 + 0.9, 1.3, -D + 0.2], [W * 0.72 + 0.9, 1.95, -D + 0.2], [W * 0.72 + 0.4, 1.95, -D + 0.2], [0, 0, 1]);
  } else if (kind === 'kissa') {
    // counter along the back with stools, cup shelves, two window tables
    const cz = -D + 1.3;
    E.with({ color: col('#5a3e2b'), pat: PAT.WOOD, gloss: 0.4, emit: IN }, () => {
      E.box(0.4, 0.12, cz - 0.1, W - 0.4, 1.0, cz + 0.45, { ny: true });
      E.box(0.35, 1.0, cz - 0.15, W - 0.35, 1.06, cz + 0.55);
      for (let k = 0; k < 2; k++) E.box(0.4, 1.45 + k * 0.45, -D + 0.12, W - 0.4, 1.49 + k * 0.45, -D + 0.4);
    });
    for (let x = 0.6; x < W - 0.5; x += 0.35) {
      E.with({ color: col(rng.pick(['#f2efe6', '#e8e2d2', '#c9b89a', '#3a6a8a'])), pat: PAT.PLAIN, gloss: 0.6, emit: IN }, () => {
        E.cyl(x, 1.49, -D + 0.26, 0.05, 0.1, 8);
        if (rng.chance(0.6)) E.cyl(x + 0.12, 1.94, -D + 0.26, 0.04, rng.range(0.15, 0.3), 6);
      });
    }
    for (let x = 0.9; x < W - 0.6; x += 0.8) {
      E.with({ color: col('#2f2a25'), pat: PAT.METAL, gloss: 0.5, emit: IN }, () => {
        E.cyl(x, 0.12, cz + 0.85, 0.03, 0.62, 6);
        E.cyl(x, 0.74, cz + 0.85, 0.17, 0.06, 10);
      });
    }
    for (const tx of [W * 0.28, W * 0.7]) {
      E.with({ color: col('#6b4a34'), pat: PAT.WOOD, gloss: 0.4, emit: IN }, () => {
        E.cyl(tx, 0.12, -1.2, 0.05, 0.62, 6);
        E.cyl(tx, 0.74, -1.2, 0.36, 0.04, 12);
      });
      chair(E, tx - 0.55, -1.2, Math.PI / 2);
      chair(E, tx + 0.55, -1.2, -Math.PI / 2);
      E.with({ color: col('#f4f1ea'), pat: PAT.PLAIN, emit: IN }, () => E.cyl(tx + 0.1, 0.78, -1.15, 0.05, 0.08, 8));
    }
    potPlant(ctx, 0.45, 0.12, -D + 1.0, { kind: 'tall', r: 0.2 });
  } else if (kind === 'bakery') {
    // bread on tiered shelves and in a glass case
    for (const [x0, x1, z] of [[0.3, W / 2 - 0.3, -1.1], [W / 2 + 0.3, W - 0.3, -1.1], [0.4, W - 0.4, -D + 0.6]]) {
      E.with({ color: col('#b99a70'), pat: PAT.WOOD, gloss: 0.3, emit: IN }, () => {
        for (let k = 0; k < 3; k++) E.box(x0, 0.5 + k * 0.4, z - 0.22 - k * 0.08, x1, 0.54 + k * 0.4, z + 0.22 - k * 0.08);
        E.box(x0, 0.12, z - 0.2, x0 + 0.05, 1.4, z + 0.2);
        E.box(x1 - 0.05, 0.12, z - 0.2, x1, 1.4, z + 0.2);
      });
      for (let k = 0; k < 3; k++) {
        for (let x = x0 + 0.15; x < x1 - 0.1; x += rng.range(0.14, 0.24)) {
          const c = col(rng.pick(['#b8733a', '#c98a4a', '#8a5226', '#d8a86a', '#e8c890']));
          E.with({ color: c, pat: PAT.PLAIN, gloss: 0.4, emit: IN * 1.2 }, () => {
            const g = new THREE.SphereGeometry(1, 8, 5);
            E.geom(g, new THREE.Matrix4().compose(new THREE.Vector3(x, 0.6 + k * 0.4, z - k * 0.08 + rng.range(-0.08, 0.08)), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng.range(0, 3), 0)), new THREE.Vector3(rng.range(0.06, 0.11), 0.045, rng.range(0.05, 0.08))));
          });
        }
      }
    }
    E.with({ color: col('#e8e0d0'), pat: PAT.PLAIN, emit: IN }, () => E.box(W - 1.6, 0.12, -D + 1.6, W - 0.3, 0.95, -D + 1.1));
  }
}

// barber pole: a spinning striped cylinder in a glass tube (animated in the shader)
export function barberPole(ctx, x, y, z) {
  const E = ctx.E;
  E.with({ color: col('#d6d8d8'), pat: PAT.METAL, gloss: 0.6 }, () => {
    E.cyl(x, y, z, 0.13, 0.12, 12);
    E.cyl(x, y + 1.02, z, 0.13, 0.14, 12, true, 0.08);
  });
  E.with({ color: col('#ffffff'), pat: PAT.BARBER, emit: 0.9, gloss: 0.6 }, () => E.cyl(x, y + 0.12, z, 0.1, 0.9, 16, false));
  ctx.addLight(new THREE.Vector3(x, y + 0.6, z).applyMatrix4(ctx.E.m), '#ffd8d8', 2.5, 0.4);
}

// red paper lantern hanging from a bracket
export function chochin(ctx, x, y, z) {
  const E = ctx.E;
  E.with({ color: col('#2a2522'), pat: PAT.PLAIN }, () => {
    E.cyl(x, y + 0.28, z, 0.13, 0.05, 10);
    E.cyl(x, y - 0.33, z, 0.13, 0.05, 10);
    E.box(x - 0.01, y + 0.33, z - 0.01, x + 0.01, y + 0.6, z + 0.01);
  });
  const g = new THREE.SphereGeometry(1, 16, 10);
  const r = ctx.atlasRects.chochin;
  // spherical uvs mapped onto the lantern texture
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, r.u0 + (r.u1 - r.u0) * uv.getX(i), r.v0 + (r.v1 - r.v0) * uv.getY(i));
  ctx.inSink('atlas', () => E.with({ color: col('#ffffff'), pat: PAT.EMIT, emit: 1.2, sway: 0 }, () => E.geom(g, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(0.24, 0.32, 0.24)))));
  ctx.glows.push({ p: ctx.toWorld(x, y, z), color: col('#ff6a3a'), size: 0.9, strength: 0.55 });
  ctx.addLight(ctx.toWorld(x, y - 0.2, z + 0.4), '#ff9a5a', 3.5, 0.8);
}

// ---------------------------------------------------------------------------
// Two-storey shop house: a shop on the ground floor (real interior), the
// family living upstairs.
// ---------------------------------------------------------------------------
export function shopHouse(ctx, lot, opts = {}) {
  const E = ctx.E, rng = ctx.rng;
  const kind = opts.kind || 'kissa';
  const lw = lot.w, ld = lot.depth;
  const W = Math.min(lw - 0.8, 9.5), D = Math.min(ld - 2.4, 8.5);
  const hx = opts.hx ?? 0;
  const x0 = hx - W / 2, x1 = hx + W / 2, z1 = -(opts.setback ?? 1.4), z0 = z1 - D;
  // the shop is 3.1 m tall; above it a fascia band carries the sign board, then the house floors
  const R0 = ctx.atlasRects;
  const sign = { kissa: R0.kissa, barber: R0.barber, laundry: R0.laundry, bakery: R0.bakery }[kind];
  const hS = 3.1, FASC = sign ? 0.95 : 0;
  const base = 0.12, fh1 = hS + FASC, fh2 = 2.8, floors = opts.floors || 2;
  const ye = base + fh1 + fh2 * (floors - 1);
  const style = opts.style || rng.pick(['showa', 'modern', 'lap', 'tile']);
  const wm = { ...wallMat(style, rng, opts.wallCol), grad: [0, ye, 0.85], vbase: 0 };
  lotBase(ctx, lot, { groundCol: '#8f8d88' });
  slab(ctx, -lw / 2, z1, lw / 2, 0, 0.05, '#a8a59d', Math.abs(lot.level) < 0.05);
  ctx.solid(x0 - 0.2, 0, z0 - 0.2, x1 + 0.2, ye + 0.15, z1 + 0.02);
  ctx.dropPoints.push(ctx.toWorld(x0 + 0.3, ye - 0.4, z1 + 0.05));
  // ground floor: side and back walls only (the front is the shop)
  E.with(wm, () => {
    E.box(x0, 0, z0, x0 + 0.1, fh1 + base, z1, { ny: true });
    E.box(x1 - 0.1, 0, z0, x1, fh1 + base, z1, { ny: true });
    E.box(x0, 0, z0, x1, fh1 + base, z0 + 0.1, { ny: true });
    // upper floors
    E.box(x0, base + fh1, z0, x1, ye, z1, { ny: false });
  });
  E.with({ color: col('#8f8d86'), pat: PAT.CONCRETE, gloss: 0.2 }, () => E.box(x0 - 0.02, base + fh1 - 0.05, z1 - 0.02, x1 + 0.02, base + fh1 + 0.18, z1 + 0.06));
  E.frame(x0, 0, z1, 0, () => {
    shopFront(ctx, W, D - 0.1, base + hS - 0.1, kind, opts);
    // fascia band over the shop front, and on it the sign board
    if (FASC) E.with(wm, () => E.box(0.1, base + hS - 0.1, -0.12, W - 0.1, base + fh1 - 0.05, 0));
    const R = ctx.atlasRects;
    const sy = base + hS + 0.08;
    if (sign) {
      const sw = Math.min(W - 0.6, 4.6, (FASC - 0.22) * (sign.w / sign.h)), sh = sw * (sign.h / sign.w);
      E.with({ color: col('#2a2c2e'), pat: PAT.METAL }, () => E.box(W / 2 - sw / 2 - 0.05, sy - 0.05, 0.04, W / 2 + sw / 2 + 0.05, sy + sh + 0.05, 0.12));
      atlasQuad(ctx, sign, [W / 2 - sw / 2, sy, 0.13], [W / 2 + sw / 2, sy, 0.13], [W / 2 + sw / 2, sy + sh, 0.13], [W / 2 - sw / 2, sy + sh, 0.13], [0, 0, 1], kind === 'laundry' ? 0.9 : 0.55);
    }
    const awn = { kissa: '#6b4a34', bakery: '#c86a3a', barber: '#2f4f8a', laundry: '#3a6db4' }[kind];
    if (awn) {
      const ay = base + hS - 0.05;
      E.with({ color: col(awn), pat: PAT.AWNING, param: kind === 'bakery' ? 0.45 : 2.0, gloss: 0.25, weather: 0.2 }, () => {
        quadF(E, [0.1, ay, 0.1], [W - 0.1, ay, 0.1], [W - 0.1, ay - 0.5, 1.1], [0.1, ay - 0.5, 1.1], [0, 0, W, 0, W, 1.1, 0, 1.1], [0, 1, 0.5]);
        quadF(E, [0.1, ay - 0.5, 1.1], [W - 0.1, ay - 0.5, 1.1], [W - 0.1, ay - 0.72, 1.1], [0.1, ay - 0.72, 1.1], [0, 0, W, 0, W, 0.22, 0, 0.22], [0, 0, 1]);
        quadF(E, [0.1, ay - 0.02, 0.1], [W - 0.1, ay - 0.02, 0.1], [W - 0.1, ay - 0.52, 1.1], [0.1, ay - 0.52, 1.1], null, [0, -1, -0.5]);
      });
      for (let x = 0.3; x < W - 0.2; x += rng.range(0.3, 0.7)) ctx.drip(x, ay - 0.74, 1.12);
    }
    // things out front
    if (kind === 'kissa') {
      // A-frame menu board
      E.frame(W - 0.8, 0, 0.8, -0.3, () => {
        E.with({ color: col('#4a3526'), pat: PAT.WOOD }, () => {
          E.beam([-0.3, 0, 0.25], [-0.3, 0.95, 0.02], 0.04);
          E.beam([0.3, 0, 0.25], [0.3, 0.95, 0.02], 0.04);
          E.beam([-0.3, 0, -0.25], [-0.3, 0.95, -0.02], 0.04);
          E.beam([0.3, 0, -0.25], [0.3, 0.95, -0.02], 0.04);
        });
        const mr = R.menu;
        atlasQuad(ctx, mr, [-0.28, 0.12, 0.23], [0.28, 0.12, 0.23], [0.28, 0.9, 0.04], [-0.28, 0.9, 0.04], [0, 0.25, 1]);
      });
      potPlant(ctx, 0.4, 0.05, 0.5, { kind: 'round', r: 0.22 });
      potPlant(ctx, W - 0.3, 0.05, 0.4, { kind: 'flower', r: 0.18 });
    } else if (kind === 'barber') {
      barberPole(ctx, -0.05, 0.05, 0.45);
    } else if (kind === 'laundry') {
      umbrella(ctx, 0.3, 0.05, 0.3, 0.3);
      bicycle(ctx, W + 0.7, 0.05, 0.2, 0.2);
    } else if (kind === 'bakery') {
      E.with({ color: col('#e9e1cc'), pat: PAT.PLAIN, gloss: 0.3 }, () => E.box(W - 1.2, 0.05, 0.3, W - 0.3, 0.8, 0.8));
      potPlant(ctx, 0.35, 0.05, 0.4, { kind: 'tall' });
    }
    // upstairs: windows + a balcony with laundry
    const fy = base + fh1;
    for (let f = 1; f < floors; f++) {
      const y = base + fh1 + (f - 1) * fh2;
      windowUnit(ctx, W * 0.28, y + 0.85, 1.4, 1.1, { lit: rng.chance(0.35), curtain: rng.pick([1, 2, 2]), hisashi: 0.3 });
      windowUnit(ctx, W * 0.72, y + 0.1, 1.6, 1.9, { lit: rng.chance(0.25), curtain: 2 });
      if (f === 1) balcony(ctx, W * 0.52, W - 0.2, y + 0.02, 0.9, { style: 'bars', laundry: true });
    }
    void fy;
  });
  facades(ctx, x0, z0, x1, z1, 0, (len, side) => {
    if (side === 'front') {
      downPipe(ctx, 0.1, ye - 0.1, 0, '#8c8f90');
      return;
    }
    for (let f = 1; f < floors; f++) windowUnit(ctx, len * 0.5, base + fh1 + (f - 1) * fh2 + 1.0, 0.8, 0.9, { grille: true, curtain: 4, lit: rng.chance(0.2) });
    if (side === 'right') {
      acUnit(ctx, len * 0.6, 0.12, { pipeH: 2.4 });
      meterBox(ctx, len * 0.2, 1.4);
      gasMeter(ctx, len * 0.3, 0.9);
    }
  });
  const roofKind = rng.pick(['kawara', 'slate', 'metal']);
  const ro = { kind: roofKind, color: col(rng.pick(ROOFS[roofKind])), pitch: 0.4, ov: 0.45, og: 0.35, edge: '#e3ded2', gutterCol: '#8c8f90', wall: wm, ridgeX: rng.chance(0.5) };
  if (rng.chance(0.5)) gableRoof(ctx, x0, z0, x1, z1, ye, ro);
  else hipRoof(ctx, x0, z0, x1, z1, ye, ro);
  if (lot.drawLeft) E.frame(-lw / 2 + 0.08, 0, 0, Math.PI / 2, () => blockWall(ctx, 1.5, ld - 0.05, 0, 1.3, {}));
  if (lot.drawRight) E.frame(lw / 2 - 0.08, 0, 0, Math.PI / 2, () => blockWall(ctx, 1.5, ld - 0.05, 0, 1.3, {}));
  weeds(ctx, x0, x1, z0 - 0.3, 0, 1.2, 0.3);
  void flatRoof;
  void door;
  void crates;
  void clump;
}

// ---------------------------------------------------------------------------
// Izakaya: dark timber front, sliding lattice door under a noren, red lanterns
// ---------------------------------------------------------------------------
export function izakaya(ctx, lot) {
  const E = ctx.E, rng = ctx.rng;
  const lw = lot.w, ld = lot.depth;
  const W = Math.min(lw - 1.0, 8), D = Math.min(ld - 2.5, 8);
  const x0 = -W / 2, x1 = W / 2, z1 = -1.2, z0 = z1 - D;
  const base = 0.15, fh1 = 3.0, fh2 = 2.7, ye = base + fh1 + fh2;
  lotBase(ctx, lot, { groundCol: '#8a867e' });
  slab(ctx, -lw / 2, z1, lw / 2, 0, 0.05, '#9d9a92', Math.abs(lot.level) < 0.05);
  ctx.solid(x0 - 0.2, 0, z0 - 0.2, x1 + 0.2, ye + 0.15, z1 + 0.2);
  const wood = { color: col('#4a3a2e'), pat: PAT.WOOD, gloss: 0.12, weather: 0.5, grad: [0, ye, 0.85] };
  const plaster = { color: col('#d8d0bc'), pat: PAT.MORTAR, gloss: 0.06, weather: 0.9, grad: [0, ye, 0.85] };
  E.with(wood, () => E.box(x0, 0, z0, x1, base + fh1, z1, { ny: true }));
  E.with(plaster, () => E.box(x0, base + fh1, z0, x1, ye, z1, { ny: true }));
  E.frame(x0, 0, z1, 0, () => {
    // sliding lattice door (frosted, lit) and a small window with a bamboo blind
    door(ctx, W * 0.35, base, 1.8, 2.1, { style: 'slide', color: '#3a2c22', lit: true });
    windowUnit(ctx, W * 0.78, base + 0.9, 1.3, 1.0, { frame: '#3a2c22', curtain: 3, lit: true, sill: false });
    // noren over the door: three flaps that sway
    const r = ctx.atlasRects.noren;
    const nx = W * 0.35 - 0.95, nw = 1.9, ny = base + 2.25;
    ctx.inSink('atlas', () => {
      for (let k = 0; k < 3; k++) {
        const a = nx + (k * nw) / 3 + 0.02, b = nx + ((k + 1) * nw) / 3 - 0.02;
        const u0 = r.u0 + ((r.u1 - r.u0) * k) / 3, u1 = r.u0 + ((r.u1 - r.u0) * (k + 1)) / 3;
        E.with({ color: col('#ffffff'), pat: PAT.PLAIN, gloss: 0.1, weather: 0, ex1: k * 0.13 }, () => {
          E.b.sway = 0.07;
          const i0 = E._vert(a, ny - 0.75, 0.16, 0, 0, 1, u0, r.v0);
          const i1 = E._vert(b, ny - 0.75, 0.16, 0, 0, 1, u1, r.v0);
          E.b.sway = 0;
          const i2 = E._vert(b, ny, 0.14, 0, 0, 1, u1, r.v1);
          const i3 = E._vert(a, ny, 0.14, 0, 0, 1, u0, r.v1);
          E._tri(i0, i1, i2);
          E._tri(i0, i2, i3);
          E.b.sway = 0.07;
          const j0 = E._vert(b, ny - 0.75, 0.155, 0, 0, -1, u1, r.v0);
          const j1 = E._vert(a, ny - 0.75, 0.155, 0, 0, -1, u0, r.v0);
          E.b.sway = 0;
          const j2 = E._vert(a, ny, 0.135, 0, 0, -1, u0, r.v1);
          const j3 = E._vert(b, ny, 0.135, 0, 0, -1, u1, r.v1);
          E._tri(j0, j1, j2);
          E._tri(j0, j2, j3);
        });
      }
    });
    E.with({ color: col('#2a2220'), pat: PAT.WOOD }, () => E.box(nx - 0.1, ny - 0.02, 0.1, nx + nw + 0.1, ny + 0.04, 0.2));
    // a little roof over the front
    E.with({ color: col('#4f555e'), pat: PAT.KAWARA, gloss: 0.5 }, () => quadF(E, [-0.2, base + fh1 + 0.1, 0], [W + 0.2, base + fh1 + 0.1, 0], [W + 0.2, base + fh1 - 0.3, 0.9], [-0.2, base + fh1 - 0.3, 0.9], [0, 0, W, 0, W, 0.9, 0, 0.9], [0, 1, 0.3]));
    E.with({ color: col('#3a2c22'), pat: PAT.WOOD }, () => E.box(-0.2, base + fh1 - 0.42, 0.85, W + 0.2, base + fh1 - 0.28, 0.95));
    for (let x = 0; x < W; x += rng.range(0.4, 0.8)) ctx.drip(x, base + fh1 - 0.44, 0.96);
    // red lanterns either side of the door
    chochin(ctx, W * 0.35 - 1.3, base + 2.2, 0.55);
    chochin(ctx, W * 0.35 + 1.3, base + 2.2, 0.55);
    // sake barrel, beer crates
    E.with({ color: col('#8a6a4a'), pat: PAT.WOOD, gloss: 0.2 }, () => E.cyl(W - 0.6, 0.05, 0.5, 0.35, 0.7, 12));
    E.with({ color: col('#e8e2d2'), pat: PAT.PLAIN }, () => E.cyl(W - 0.6, 0.45, 0.5, 0.36, 0.2, 12, false));
    crates(ctx, 0.35, 0.45, 2);
    windowUnit(ctx, W * 0.3, base + fh1 + 0.8, 1.6, 1.1, { lit: true, curtain: 1 });
    windowUnit(ctx, W * 0.75, base + fh1 + 0.8, 1.2, 1.1, { lit: false, curtain: 2 });
    ctx.addLight(ctx.toWorld(W * 0.35, 1.2, 1.5), '#ffb070', 6.5, 0.9);
  });
  facades(ctx, x0, z0, x1, z1, 0, (len, side) => {
    if (side === 'front') return;
    windowUnit(ctx, len * 0.5, base + fh1 + 1.0, 0.8, 0.9, { grille: true, curtain: 4, frame: '#3a2c22' });
    if (side === 'right') acUnit(ctx, len * 0.5, 0.12, { pipeH: 2 });
    if (side === 'back') downPipe(ctx, 0.1, ye - 0.1, 0, '#5c554c');
  });
  gableRoof(ctx, x0, z0, x1, z1, ye, { kind: 'kawara', color: col('#58616d'), pitch: 0.45, ov: 0.6, og: 0.45, edge: '#3a2e25', soffit: '#6b5a48', ridgeX: true, wall: plaster });
  if (lot.drawLeft) E.frame(-lw / 2 + 0.08, 0, 0, Math.PI / 2, () => blockWall(ctx, 1.5, ld - 0.05, 0, 1.3, {}));
  if (lot.drawRight) E.frame(lw / 2 - 0.08, 0, 0, Math.PI / 2, () => blockWall(ctx, 1.5, ld - 0.05, 0, 1.3, {}));
}
