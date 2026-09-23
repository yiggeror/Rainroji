import * as THREE from 'three';
import { PAT } from '../builder.js';
import { col } from '../util.js';
import { CANAL } from './layout.js';
import { meshFence } from './props.js';
import { tree, grass, bush } from './plants.js';
import { quv } from './atlas.js';
import { quadF } from './parts.js';

// Concrete-lined river channel with a small bridge on the main street
export function buildCanal(ctx) {
  const E = ctx.E, rng = ctx.rng;
  const { z0, z1, water, bed } = CANAL;
  const X0 = -360, X1 = 360;
  for (let x = X0; x < X1; x += 40) {
    ctx.chunk(x + 20, (z0 + z1) / 2);
    // walls
    E.with({ color: col('#a3a199'), pat: PAT.CONCRETE, gloss: 0.2, weather: 1.0, vbase: bed }, () => {
      E.quad([x + 40, bed, z0], [x, bed, z0], [x, 0, z0], [x + 40, 0, z0], [0, 0, 40, 0, 40, -bed, 0, -bed], [0, 0, -1]);
      E.quad([x, bed, z1], [x + 40, bed, z1], [x + 40, 0, z1], [x, 0, z1], [0, 0, 40, 0, 40, -bed, 0, -bed], [0, 0, 1]);
    });
    // coping
    E.with({ color: col('#b7b4ab'), pat: PAT.CONCRETE, gloss: 0.35 }, () => {
      E.box(x, 0, z0 - 0.02, x + 40, 0.12, z0 + 0.35, { ny: true });
      E.box(x, 0, z1 - 0.35, x + 40, 0.12, z1 + 0.02, { ny: true });
    });
    // sediment strips with reeds
    E.with({ color: col('#5d5a48'), pat: PAT.SOIL, param: 0.4, gloss: 0.3 }, () => {
      E.box(x, bed, z0 - 0.9, x + 40, water + 0.06, z0, { ny: true });
      E.box(x, bed, z1, x + 40, water + 0.04, z1 + 0.6, { ny: true });
    });
    // water
    E.with({ color: col('#3b4a45'), pat: PAT.WATER, param: 1.0, gloss: 0.95, weather: 0 }, () => quadF(E, [x, water, z0], [x + 40, water, z0], [x + 40, water, z1], [x, water, z1], [x, z0, x + 40, z0, x + 40, z1, x, z1], [0, 1, 0]));
    // reeds
    if (Math.abs(x) < 200) {
      for (let i = 0; i < 18; i++) {
        const rx = x + rng.range(0, 40);
        if (rx > 2 && rx < 10) continue;
        const zz = rng.chance(0.6) ? z0 - rng.range(0.1, 0.8) : z1 + rng.range(0.1, 0.5);
        grass(ctx, rx, water + 0.02, zz, rng.range(0.5, 1.1), { n: 3, color: rng.pick(['#6b8f45', '#7a9a4c', '#8a9a55']) });
      }
    }
    // water stains streak on walls: drainage pipes
    for (let i = 0; i < 2; i++) {
      const px = x + rng.range(2, 38);
      if (px > 2 && px < 10) continue;
      const zz = rng.chance(0.5) ? z0 : z1;
      const s = zz === z0 ? -1 : 1;
      E.with({ color: col('#6c6e6d'), pat: PAT.RUST, gloss: 0.3 }, () => E.frameM(new THREE.Matrix4().makeRotationX((s * Math.PI) / 2).setPosition(px, -0.9, zz), () => E.cyl(0, 0, 0, 0.16, 0.25, 10)));
      ctx.spouts.push(new THREE.Vector3(px, -0.95, zz + s * 0.25));
    }
  }
  // bridge deck sides + railings on the main street (x 3.5 .. 8.5)
  ctx.chunk(6, -104.5);
  E.with({ color: col('#b5b2a9'), pat: PAT.CONCRETE, gloss: 0.2, weather: 0.8, vbase: -0.9 }, () => {
    E.box(3.2, -0.9, z1 - 0.3, 3.5, 0.02, z0 + 0.3, { py: true });
    E.box(8.5, -0.9, z1 - 0.3, 8.8, 0.02, z0 + 0.3, { py: true });
    quadF(E, [3.5, -0.9, z0 + 0.3], [8.5, -0.9, z0 + 0.3], [8.5, -0.9, z1 - 0.3], [3.5, -0.9, z1 - 0.3], null, [0, -1, 0]);
  });
  for (const bx of [3.3, 8.7]) {
    E.with({ color: col('#c2beb3'), pat: PAT.CONCRETE, gloss: 0.3, weather: 0.5 }, () => {
      E.box(bx - 0.2, 0, z0 + 0.1, bx + 0.2, 1.2, z0 + 0.6);
      E.box(bx - 0.2, 0, z1 - 0.6, bx + 0.2, 1.2, z1 - 0.1);
      for (let z = z1 + 1.0; z < z0; z += 1.8) E.box(bx - 0.08, 0, z - 0.08, bx + 0.08, 0.95, z + 0.08);
      E.box(bx - 0.12, 0.95, z1 - 0.1, bx + 0.12, 1.05, z0 + 0.1);
    });
    E.with({ color: col('#6f7c80'), pat: PAT.METAL, gloss: 0.6 }, () => {
      E.box(bx - 0.03, 0.45, z1 - 0.1, bx + 0.03, 0.5, z0 + 0.1);
    });
    // name plates on the end posts
    ctx.inSink('atlas', () => {
      const s = bx < 6 ? 1 : -1;
      E.with({ color: col('#ffffff'), pat: PAT.PLAIN, gloss: 0.4 }, () => {
        E.frame(bx + s * 0.205, 0, z0 + 0.35, s > 0 ? Math.PI / 2 : -Math.PI / 2, () => E.quad([-0.2, 0.55, 0], [0.2, 0.55, 0], [0.2, 1.0, 0], [-0.2, 1.0, 0], quv(ctx.atlasRects[s > 0 ? 'bridge1' : 'bridge2']), [0, 0, 1]));
      });
    });
  }
  // fences + cherry trees along the banks
  for (let x = -150; x < 150; x += 30) {
    for (const [z, zz] of [[z0 + 0.45, 1], [z1 - 0.45, -1]]) {
      const a = x, b = x + 30;
      ctx.chunk(x + 15, z);
      const segs = b < 3 || a > 9 ? [[a, b]] : [[a, 3.0], [9.0, b]].filter(([p, q]) => q - p > 0.5);
      for (const [p, q] of segs) E.frame(0, 0, z, 0, () => meshFence(ctx, p, q, 0, 1.2, '#5f7766'));
      void zz;
    }
  }
  for (let x = -100; x < 130; x += rng.range(7, 10)) {
    if (x > -2 && x < 14) continue;
    ctx.chunk(x, -109.7);
    tree(ctx, x, 0, -109.8, { h: rng.range(6, 8), crown: rng.range(3.0, 3.8), color: rng.pick(['#4f7c3f', '#5a8744', '#476f3c']), lean: [rng.range(-0.3, 0.3), 0.6], clumps: 9 });
    grass(ctx, x + 0.5, 0, -109.5, 0.4, { n: 3 });
  }
  // hillside foot along the south path (west of the main street)
  for (let x = -56; x < -14; x += rng.range(1.5, 3)) {
    ctx.chunk(x, -97);
    bush(ctx, x, 0, -96.8 + rng.range(-0.3, 0.3), rng.range(0.5, 0.9), { color: rng.pick(['#4a7340', '#5d8a45']) });
  }
}
