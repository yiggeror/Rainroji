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
  const X0 = CANAL.x0, X1 = CANAL.x1;
  const n = Math.ceil((X1 - X0) / 40), P = (X1 - X0) / n;
  for (let x = X0; x < X1 - 0.01; x += P) {
    ctx.chunk(x + P / 2, (z0 + z1) / 2);
    // walls
    E.with({ color: col('#a3a199'), pat: PAT.CONCRETE, gloss: 0.2, weather: 1.0, vbase: bed }, () => {
      E.quad([x + P, bed, z0], [x, bed, z0], [x, 0, z0], [x + P, 0, z0], [0, 0, P, 0, P, -bed, 0, -bed], [0, 0, -1]);
      E.quad([x, bed, z1], [x + P, bed, z1], [x + P, 0, z1], [x, 0, z1], [0, 0, P, 0, P, -bed, 0, -bed], [0, 0, 1]);
    });
    // banks are solid below the street (the camera can fly down to the water)
    ctx.solidWorld(x, bed - 1, z0, x + P, 0, z0 + 3);
    ctx.solidWorld(x, bed - 1, z1 - 3, x + P, 0, z1);
    // coping
    E.with({ color: col('#b7b4ab'), pat: PAT.CONCRETE, gloss: 0.35 }, () => {
      E.box(x, 0, z0 - 0.02, x + P, 0.12, z0 + 0.35, { ny: true });
      E.box(x, 0, z1 - 0.35, x + P, 0.12, z1 + 0.02, { ny: true });
    });
    // sediment strips with reeds
    E.with({ color: col('#5d5a48'), pat: PAT.SOIL, param: 0.4, gloss: 0.3 }, () => {
      E.box(x, bed, z0 - 0.9, x + P, water + 0.06, z0, { ny: true });
      E.box(x, bed, z1, x + P, water + 0.04, z1 + 0.6, { ny: true });
    });
    // water
    E.with({ color: col('#3b4a45'), pat: PAT.WATER, param: 1.0, gloss: 0.95, weather: 0 }, () => quadF(E, [x, water, z0], [x + P, water, z0], [x + P, water, z1], [x, water, z1], [x, z0, x + P, z0, x + P, z1, x, z1], [0, 1, 0]));
    // reeds
    {
      for (let i = 0; i < 18; i++) {
        const rx = x + rng.range(0, P);
        if (rx > 2 && rx < 10) continue;
        const zz = rng.chance(0.6) ? z0 - rng.range(0.1, 0.8) : z1 + rng.range(0.1, 0.5);
        grass(ctx, rx, water + 0.02, zz, rng.range(0.5, 1.1), { n: 3, color: rng.pick(['#6b8f45', '#7a9a4c', '#8a9a55']) });
      }
    }
    // water stains streak on walls: drainage pipes
    for (let i = 0; i < 2; i++) {
      const px = x + rng.range(2, P - 2);
      if (px > 2 && px < 10) continue;
      const zz = rng.chance(0.5) ? z0 : z1;
      const s = zz === z0 ? -1 : 1;
      E.with({ color: col('#6c6e6d'), pat: PAT.RUST, gloss: 0.3 }, () => E.frameM(new THREE.Matrix4().makeRotationX((s * Math.PI) / 2).setPosition(px, -0.9, zz), () => E.cyl(0, 0, 0, 0.16, 0.25, 10)));
      ctx.spouts.push(new THREE.Vector3(px, -0.95, zz + s * 0.25));
    }
  }
  // bridge deck sides + railings on the main street (x 3.5 .. 8.5)
  ctx.chunk(6, -104.5);
  ctx.solidWorld(3.2, -0.9, z1 - 0.3, 8.8, 0.0, z0 + 0.3);
  ctx.solids[ctx.solids.length - 1].floating = true;
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
  // west end: the stream comes out of a culvert under the ridge
  ctx.chunk(X0, (z0 + z1) / 2);
  E.with({ color: col('#9f9c93'), pat: PAT.CONCRETE, gloss: 0.2, weather: 1.0, vbase: bed }, () => {
    E.box(X0 - 1.2, bed, z1 - 0.6, X0, 1.2, z0 + 0.6, { ny: true });
  });
  E.with({ color: col('#171816'), pat: PAT.PLAIN }, () => {
    const g = new THREE.CircleGeometry(1.05, 16);
    E.geom(g, new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(X0 + 0.01, water + 0.55, (z0 + z1) / 2));
  });
  E.with({ color: col('#6c6e6d'), pat: PAT.RUST, gloss: 0.3 }, () => E.frameM(new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(X0 + 0.15, water + 0.55, (z0 + z1) / 2), () => E.cyl(0, 0, 0, 1.18, 0.3, 16, false)));
  ctx.spouts.push(new THREE.Vector3(X0 + 0.4, water + 0.05, (z0 + z1) / 2));
  ctx.solidWorld(X0 - 1.2, bed, z1 - 0.6, X0, 1.2, z0 + 0.6);
  // east end: a sluice gate (水門) where the canal meets the sea
  const gx = X1 - 4;
  ctx.chunk(gx, (z0 + z1) / 2);
  E.with({ color: col('#aeaba2'), pat: PAT.CONCRETE, gloss: 0.25, weather: 0.9, vbase: bed }, () => {
    for (const z of [z1 - 0.9, z0 + 0.1]) E.box(gx - 1.2, bed, z, gx + 1.2, 6.5, z + 0.8, { ny: true });
    E.box(gx - 1.4, 6.5, z1 - 1.0, gx + 1.4, 7.3, z0 + 1.0);
  });
  E.with({ color: col('#4f6e7a'), pat: PAT.METAL, gloss: 0.4, weather: 0.6 }, () => {
    E.box(gx - 0.25, 3.2, z1 - 0.1, gx + 0.25, 5.8, z0 + 0.1);
    E.box(gx - 0.3, 7.3, -106.2, gx + 0.3, 8.2, -103.8);
  });
  E.with({ color: col('#e0dfd8'), pat: PAT.METAL, gloss: 0.5 }, () => {
    for (const z of [z1 - 1.0, z0 + 1.0]) E.box(gx - 1.4, 7.3, z - 0.02, gx + 1.4, 8.3, z + 0.02);
  });
  ctx.solidWorld(gx - 1.4, bed, z1 - 1.0, gx + 1.4, 8.3, z0 + 1.0);
  // fences + cherry trees along the banks
  for (let x = X0; x < X1 - 6; x += 30) {
    for (const [z, zz] of [[z0 + 0.45, 1], [z1 - 0.45, -1]]) {
      const a = x, b = Math.min(X1 - 6, x + 30);
      ctx.chunk(x + 15, z);
      const segs = b < 3 || a > 9 ? [[a, b]] : [[a, 3.0], [9.0, b]].filter(([p, q]) => q - p > 0.5);
      for (const [p, q] of segs) E.frame(0, 0, z, 0, () => meshFence(ctx, p, q, 0, 1.2, '#5f7766'));
      void zz;
    }
  }
  for (let x = X0 + 4; x < X1 - 8; x += rng.range(7, 10)) {
    if (x > -2 && x < 14) continue;
    ctx.chunk(x, -109.7);
    tree(ctx, x, 0, -109.8, { h: rng.range(6, 8), crown: rng.range(3.0, 3.8), color: rng.pick(['#4f7c3f', '#5a8744', '#476f3c']), lean: [rng.range(-0.3, 0.3), 0.6], clumps: 9 });
    grass(ctx, x + 0.5, 0, -109.5, 0.4, { n: 3 });
  }
  // hillside foot along the south path (west of the main street)
  for (let x = -56; x < -14; x += rng.range(1.5, 3)) {
    ctx.chunk(x, -97);
    bush(ctx, x, 0, -97.1 + rng.range(-0.3, 0.3), rng.range(0.5, 0.9), { color: rng.pick(['#4a7340', '#5d8a45']) });
  }
}
