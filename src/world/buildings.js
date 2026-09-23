import * as THREE from 'three';
import { PAT } from '../builder.js';
import { col, clamp } from '../util.js';
import { windowUnit, door, facades, gableRoof, hipRoof, shedRoof, flatRoof, downPipe, balcony, quadF } from './parts.js';
import { acUnit, meterBox, gasMeter, shed, bicycle, car, blockWall, fence, meshFence, vendingMachine, postBox, crates, bench, umbrella, wheelStop, signPost, garbageStation } from './props.js';
import { tree, bush, hedge, hydrangea, potPlant, weeds, grass, clump } from './plants.js';
import { lotBase, slab, wallMat, ROOFS } from './house.js';
import { quv } from './atlas.js';

const lowOf = (lot) => Math.abs(lot.level) < 0.05;

// ---------------------------------------------------------------------------
// 2-storey wooden apartment (アパート) with open corridor and steel stair
// ---------------------------------------------------------------------------
export function apartment(ctx, lot, opts = {}) {
  const E = ctx.E, rng = ctx.rng;
  const lw = lot.w, ld = lot.depth;
  const W = clamp(lw - 3.2, 9, 16), D = clamp(ld - 4.2, 6, 8);
  const setback = 2.6;
  const x0 = -lw / 2 + 0.6, x1 = x0 + W, z1 = -setback, z0 = z1 - D;
  const base = 0.4, fh = 2.75, ye = base + fh * 2;
  lotBase(ctx, lot);
  ctx.solid(x0 - 0.3, 0, z0 - 1.2, x1 + 1.3, ye + 1, z1 + 1.3);
  ctx.dropPoints.push(ctx.toWorld(x0 + 0.3, ye - 0.4, z1 + 1.3));
  slab(ctx, -lw / 2 + 0.2, z1, lw / 2 - 0.2, -0.15, 0.04, '#b9b6ae', lowOf(lot));
  const wm = { ...wallMat('lap', rng, opts.wallCol || rng.pick(['#d8d3c7', '#c9cfcf', '#d9ccb8'])), grad: [base, ye, 0.85] };
  E.with({ color: col('#9d9c96'), pat: PAT.CONCRETE, gloss: 0.1 }, () => E.box(x0, 0, z0, x1, base, z1, { ny: true }));
  E.with(wm, () => E.box(x0, base, z0, x1, ye, z1, { ny: true }));
  const units = Math.max(2, Math.floor(W / 3.4));
  const uw = W / units;
  const corrD = 1.25;
  // corridor slab + railing on the upper floor (front)
  E.with({ color: col('#b7b5ae'), pat: PAT.CONCRETE, gloss: 0.3, weather: 0.6 }, () => E.box(x0, base + fh - 0.2, z1, x1 + 0.1, base + fh, z1 + corrD));
  const railCol = col(rng.pick(['#7b5b43', '#5c6770', '#8b8f8a', '#6d4e3c']));
  E.with({ color: railCol, pat: PAT.METAL, gloss: 0.45, weather: 0.4 }, () => {
    E.box(x0, base + fh + 1.05, z1 + corrD - 0.06, x1 + 0.1, base + fh + 1.1, z1 + corrD);
    for (let x = x0 + 0.05; x < x1 + 0.1; x += 0.13) E.box(x - 0.012, base + fh, z1 + corrD - 0.04, x + 0.012, base + fh + 1.05, z1 + corrD - 0.02, { ny: true, py: true });
    // posts supporting the corridor
    for (let x = x0 + 0.1; x <= x1 + 0.05; x += W / Math.max(1, Math.round(W / 4))) E.box(x - 0.05, 0, z1 + corrD - 0.1, x + 0.05, base + fh - 0.2, z1 + corrD);
  });
  // corridor roof = main roof eave extends
  const roofCol = col(rng.pick(ROOFS.metal));
  shedRoof(ctx, x0, z0, x1, z1 + corrD, ye, { kind: 'metal', color: roofCol, pitch: 0.12, ov: 0.3, og: 0.3, edge: '#d9d6cf', gutterCol: '#8c8f90', wall: wm });
  // units
  E.frame(x0, 0, z1, 0, () => {
    for (let f = 0; f < 2; f++) {
      const fy = base + f * fh;
      for (let u = 0; u < units; u++) {
        const ux = u * uw;
        door(ctx, ux + 0.7, fy + 0.02, 0.8, 2.0, { style: 'steel', color: rng.pick(['#c9b99a', '#8a6b4f', '#bfc4c4', '#6f5a48']), frame: '#8d8f8e' });
        windowUnit(ctx, ux + uw - 0.95, fy + 1.1, 0.8, 0.8, { frame: '#b9bcbd', grille: true, curtain: 4, lit: rng.chance(0.3) });
        meterBox(ctx, ux + 1.45, fy + 1.3);
        if (rng.chance(0.6)) gasMeter(ctx, ux + uw - 0.3, fy + 0.8);
        // corridor ceiling light
        const on = rng.chance(0.55);
        E.with({ color: col(on ? '#fff4e0' : '#dcdcd6'), pat: on ? PAT.EMIT : PAT.PLAIN, emit: on ? 1.5 : 0, ex1: on && rng.chance(0.3) ? 3 : 0 }, () => E.box(ux + 1.2, fy + 2.45 - (f === 0 ? 0.05 : -0.2) , corrD * 0.45, ux + 1.45, fy + 2.5 - (f === 0 ? 0.05 : -0.2), corrD * 0.55));
        if (on) {
          ctx.addLight(ctx.toWorld(ux + 1.3, fy + 2.0, corrD * 0.6), '#ffeccc', 3.2, 0.7);
        }
        if (f === 0 && rng.chance(0.4)) umbrella(ctx, ux + 0.2, 0.05, 0.25, 0);
        if (rng.chance(0.3)) potPlant(ctx, ux + 1.6, fy + 0.02, 0.35);
      }
    }
    // name plate
    const r = ctx.atlasRects.corpo;
    ctx.inSink('atlas', () => E.with({ color: col('#fff'), pat: PAT.PLAIN, gloss: 0.3 }, () => E.quad([W - 1.4, base + fh + 1.2, corrD + 0.01], [W - 0.2, base + fh + 1.2, corrD + 0.01], [W - 0.2, base + fh + 1.5, corrD + 0.01], [W - 1.4, base + fh + 1.5, corrD + 0.01], quv(r), [0, 0, 1])));
  });
  // external steel stair at the right end, rising towards the back along +x side
  const sx = x1 + 0.1;
  const stairCol = railCol;
  E.with({ color: stairCol, pat: PAT.METAL, gloss: 0.4, weather: 0.4 }, () => {
    const steps = 15, rise = (base + fh) / steps, run = 0.25;
    for (let i = 0; i < steps; i++) {
      const zz = z1 + corrD - 0.2 - i * run;
      E.box(sx, (i + 1) * rise - 0.04, zz - run, sx + 1.0, (i + 1) * rise, zz);
    }
    const zTop = z1 + corrD - 0.2 - steps * run;
    E.beam([sx + 0.02, 0, z1 + corrD - 0.1], [sx + 0.02, base + fh, zTop], 0.05, 0.2);
    E.beam([sx + 0.98, 0, z1 + corrD - 0.1], [sx + 0.98, base + fh, zTop], 0.05, 0.2);
    E.beam([sx + 1.0, 1.0, z1 + corrD - 0.1], [sx + 1.0, base + fh + 1.0, zTop], 0.04, 0.04);
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      E.box(sx + 0.98, t * (base + fh), z1 + corrD - 0.1 - t * steps * run - 0.02, sx + 1.02, t * (base + fh) + 1.0, z1 + corrD - 0.1 - t * steps * run + 0.02);
    }
    E.box(sx, base + fh - 0.15, zTop - 1.0, sx + 1.0, base + fh, zTop);
  });
  // bicycles under the corridor
  for (let i = 0; i < rng.int(3, 6); i++) bicycle(ctx, x0 + 1.0 + i * 0.55, 0.04, z1 + corrD + 0.8, Math.PI / 2 + rng.range(-0.2, 0.2), { lean: rng.range(0.03, 0.1) });
  // back balconies
  facades(ctx, x0, z0, x1, z1, 0, (len, side) => {
    if (side === 'back') {
      for (let f = 0; f < 2; f++) {
        for (let u = 0; u < units; u++) {
          const ux = u * uw;
          windowUnit(ctx, ux + uw / 2, base + f * fh + 0.1, 1.7, 1.9, { frame: '#b9bcbd', lit: rng.chance(0.22), curtain: rng.pick([1, 2, 2, 3]) });
          if (f === 1) balcony(ctx, ux + 0.2, ux + uw - 0.2, base + fh + 0.02, 0.9, { style: 'bars', railCol: '#9fa3a5' });
          acUnit(ctx, ux + 0.55, base + f * fh + (f ? 0.2 : -0.28), { pipe: false });
        }
      }
    } else if (side === 'left') {
      windowUnit(ctx, len / 2, base + 1.1, 0.7, 0.9, { frame: '#b9bcbd', grille: true, curtain: 4 });
      windowUnit(ctx, len / 2, base + fh + 1.1, 0.7, 0.9, { frame: '#b9bcbd', grille: true, curtain: 4 });
    }
    if (side === 'front' || side === 'back') downPipe(ctx, 0.15, ye - 0.1, 0, '#8c8f90');
  });
  // mailboxes & garbage point
  E.with({ color: col('#b5b1a6'), pat: PAT.METAL, gloss: 0.4 }, () => E.box(lw / 2 - 1.6, 0.9, -0.6, lw / 2 - 0.4, 1.5, -0.3));
  garbageStation(ctx, -lw / 2 + 1.2, -0.7, 0);
  blockWall(ctx, lw / 2 - 1.8, lw / 2, -0.1, 1.0, {});
  if (lot.drawLeft) E.frame(-lw / 2 + 0.08, 0, 0, Math.PI / 2, () => blockWall(ctx, 0.05, ld - 0.05, 0, 1.3, {}));
  if (lot.drawRight) E.frame(lw / 2 - 0.08, 0, 0, Math.PI / 2, () => blockWall(ctx, 0.05, ld - 0.05, 0, 1.3, {}));
  weeds(ctx, -lw / 2 + 0.3, lw / 2 - 0.3, -0.2, 0, 1.2, 0.3);
  bush(ctx, -lw / 2 + 0.6, 0.02, z0 - 0.4, 0.5);
}

// ---------------------------------------------------------------------------
// Corner shop (酒・たばこ たなか商店)
// ---------------------------------------------------------------------------
export function cornerShop(ctx, lot) {
  const E = ctx.E, rng = ctx.rng;
  const lw = lot.w, ld = lot.depth;
  const W = lw - 1.4, D = ld - 3.4;
  const x0 = -lw / 2 + 0.2, x1 = x0 + W, z1 = -1.6, z0 = z1 - D;
  const base = 0.15, fh1 = 3.1, fh2 = 2.7, ye = base + fh1 + fh2;
  lotBase(ctx, lot, { groundCol: '#8f8d88' });
  ctx.solid(x0 - 0.4, 0, z0 - 0.4, x1 + 0.4, ye + 1.8, z1 + 0.2);
  ctx.dropPoints.push(ctx.toWorld(x0 + 0.3, ye - 0.4, z1 + 0.05));
  slab(ctx, -lw / 2, z1, lw / 2, 0, 0.05, '#aaa79f', true);
  const wm = { color: col('#d6cdb9'), pat: PAT.MORTAR, gloss: 0.08, weather: 0.9, grad: [0, ye, 0.82] };
  E.with({ color: col('#8a8781'), pat: PAT.TILE, param: 0.1, gloss: 0.2 }, () => E.box(x0, 0, z0, x1, base + 0.5, z1, { ny: true }));
  E.with(wm, () => E.box(x0, base + 0.5, z0, x1, ye, z1, { ny: true }));
  // shop front: big glass with interior
  E.frame(x0, 0, z1, 0, () => {
    const gw = W - 2.6;
    E.with({ color: col('#fff6e8'), pat: PAT.GLASS, param: 5, emit: 1, weather: 0.37, ex1: gw, ex2: 2.25 }, () =>
      E.quad([0.3, base + 0.5, 0.02], [0.3 + gw, base + 0.5, 0.02], [0.3 + gw, base + 2.75, 0.02], [0.3, base + 2.75, 0.02], [0, 0, gw, 0, gw, 2.25, 0, 2.25], [0, 0, 1]),
    );
    E.with({ color: col('#9a9d9e'), pat: PAT.METAL, gloss: 0.5 }, () => {
      for (let x = 0.3; x <= 0.3 + gw + 0.01; x += gw / 4) E.box(x - 0.04, base + 0.5, 0, x + 0.04, base + 2.75, 0.08);
      E.box(0.25, base + 2.75, 0, 0.35 + gw, base + 2.85, 0.08);
      E.box(0.25, base + 0.45, 0, 0.35 + gw, base + 0.55, 0.1);
    });
    // shutter box
    E.with({ color: col('#a9abab'), pat: PAT.SHUTTER, gloss: 0.3 }, () => E.box(0.2, base + 2.85, 0, W - 0.2, base + 3.15, 0.3));
    // awning (striped tent)
    const aw = W - 0.2, ad = 1.4, ay = base + 3.05;
    E.with({ color: col('#2f5f9a'), pat: PAT.AWNING, param: 0.5, gloss: 0.25, weather: 0.2 }, () => {
      quadF(E, [0.1, ay, 0.3], [0.1 + aw, ay, 0.3], [0.1 + aw, ay - 0.65, ad], [0.1, ay - 0.65, ad], [0, 0, aw, 0, aw, 1.2, 0, 1.2], [0, 1, 0.5]);
      quadF(E, [0.1, ay - 0.65, ad], [0.1 + aw, ay - 0.65, ad], [0.1 + aw, ay - 0.95, ad], [0.1, ay - 0.95, ad], [0, 0, aw, 0, aw, 0.3, 0, 0.3], [0, 0, 1]);
      quadF(E, [0.1, ay - 0.02, 0.3], [0.1 + aw, ay - 0.02, 0.3], [0.1 + aw, ay - 0.67, ad], [0.1, ay - 0.67, ad], [0, 0, aw, 0, aw, 1.2, 0, 1.2], [0, -1, -0.5]);
    });
    for (let x = 0.3; x < aw; x += rng.range(0.25, 0.6)) ctx.drip(x, ay - 0.97, ad + 0.02);
    // interior glow onto the street
    ctx.addLight(ctx.toWorld(W / 2, 1.5, 1.2), '#ffe8c6', 7.5, 1.0, 1);
    ctx.glows.push({ p: ctx.toWorld(W / 2, 1.6, 0.3), color: col('#ffe6c2'), size: 3.0, strength: 0.12 });
    // sign board
    const sr = ctx.atlasRects.shopsign;
    const sw = Math.min(W - 1.0, 5.6), sh = sw * 0.156, sx0 = 0.5;
    ctx.inSink('atlas', () => E.with({ color: col('#ffffff'), pat: PAT.PLAIN, gloss: 0.3, weather: 0 }, () => E.quad([sx0, base + 3.28, 0.14], [sx0 + sw, base + 3.28, 0.14], [sx0 + sw, base + 3.28 + sh, 0.14], [sx0, base + 3.28 + sh, 0.14], quv(sr), [0, 0, 1])));
    E.with({ color: col('#2a2c2e'), pat: PAT.METAL }, () => E.box(sx0 - 0.05, base + 3.23, 0.02, sx0 + sw + 0.05, base + 3.33 + sh, 0.13));
    // tabako sign sticking out
    const tr = ctx.atlasRects.tabako;
    ctx.inSink('atlas', () => E.with({ color: col('#ffffff'), pat: PAT.EMIT, emit: 0.9 }, () => {
      E.quad([W + 0.02, base + 2.5, 0.1], [W + 0.02, base + 2.5, 0.8], [W + 0.02, base + 2.8, 0.8], [W + 0.02, base + 2.8, 0.1], quv(tr), [1, 0, 0]);
      E.quad([W - 0.02, base + 2.5, 0.8], [W - 0.02, base + 2.5, 0.1], [W - 0.02, base + 2.8, 0.1], [W - 0.02, base + 2.8, 0.8], quv(tr), [-1, 0, 0]);
    }));
    // 2F windows & balcony
    const fy = base + fh1;
    windowUnit(ctx, 1.4, fy + 0.8, 1.35, 1.1, { frame: '#b9bcbd', lit: true, curtain: 2, hisashi: 0.35 });
    windowUnit(ctx, W - 1.6, fy + 0.8, 1.35, 1.1, { frame: '#b9bcbd', lit: false, curtain: 1, hisashi: 0.35 });
    windowUnit(ctx, W * 0.55, fy + 1.0, 0.7, 0.9, { frame: '#b9bcbd', grille: true, curtain: 4 });
    // goods outside: crates, bench, umbrellas
    crates(ctx, 0.5, 0.5, 3);
    crates(ctx, 0.95, 0.45, 2);
    bench(ctx, W - 1.6, 0.9, 0, { color: '#6a4a36', back: false });
  });
  // side facade (towards the cross street): vending machines
  facades(ctx, x0, z0, x1, z1, 0, (len, side) => {
    if (side === 'right') {
      windowUnit(ctx, len - 1.4, base + fh1 + 0.8, 1.2, 1.1, { frame: '#b9bcbd', curtain: 2, lit: false, hisashi: 0.35 });
      windowUnit(ctx, len - 3.4, base + fh1 + 1.1, 0.6, 0.9, { frame: '#b9bcbd', grille: true, curtain: 4 });
      acUnit(ctx, len - 2.3, 0.12, { pipeH: 3.5 });
      meterBox(ctx, len - 0.7, 1.4);
    }
    if (side === 'back' || side === 'left') {
      for (let k = 0; k < 2; k++) windowUnit(ctx, 1.2 + k * 2.6, base + fh1 + 0.8, 1.2, 1.1, { frame: '#b9bcbd', curtain: rng.pick([1, 2]), lit: rng.chance(0.3) });
    }
    if (side === 'front') downPipe(ctx, W - 0.1, ye - 0.3, 0, '#8c8f90');
  });
  // vending machines along the corner side, facing the cross street (+x local)
  for (let i = 0; i < 3; i++) vendingMachine(ctx, lw / 2 - 0.25 - 0.36, 0.05, -0.8 - i * 1.05, Math.PI / 2, i % 3);
  postBox(ctx, lw / 2 - 0.35, 0.05, 0.3, Math.PI / 2);
  umbrella(ctx, -lw / 2 + 0.4, 0.05, -1.1, 0.4);
  hipRoof(ctx, x0, z0, x1, z1, ye, { kind: 'kawara', color: col('#56606b'), pitch: 0.42, ov: 0.55, edge: '#e3ded2', gutterCol: '#8c8f90' });
  // back yard
  potPlant(ctx, -lw / 2 + 0.5, 0.05, -0.6);
  if (lot.drawLeft) E.frame(-lw / 2 + 0.08, 0, 0, Math.PI / 2, () => blockWall(ctx, 2.0, ld - 0.05, 0, 1.4, {}));
}

// ---------------------------------------------------------------------------
// Closed shop with the shutter down
// ---------------------------------------------------------------------------
export function closedShop(ctx, lot) {
  const E = ctx.E, rng = ctx.rng;
  const lw = lot.w, ld = lot.depth;
  const W = lw - 0.8, D = ld - 3;
  const x0 = -W / 2, x1 = W / 2, z1 = -0.8, z0 = z1 - D;
  const base = 0.12, fh1 = 3.0, fh2 = 2.7, ye = base + fh1 + fh2;
  lotBase(ctx, lot);
  ctx.solid(x0 - 0.3, 0, z0 - 0.3, x1 + 0.3, ye + 1.2, z1 + 0.3);
  ctx.dropPoints.push(ctx.toWorld(x0 + 0.3, ye - 0.4, z1 + 0.05));
  slab(ctx, -lw / 2, z1, lw / 2, 0, 0.05, '#a8a59d', lowOf(lot));
  const wm = { color: col(rng.pick(['#cfc6b2', '#c6c9c4', '#d2c7b0'])), pat: PAT.TILE, param: 0.06, gloss: 0.1, weather: 1.0, grad: [0, ye, 0.8] };
  E.with(wm, () => E.box(x0, 0, z0, x1, ye, z1, { ny: true }));
  E.frame(x0, 0, z1, 0, () => {
    E.with({ color: col('#9a9c9b'), pat: PAT.SHUTTER, gloss: 0.35, weather: 0.8 }, () => E.box(0.3, base, 0, W - 0.3, base + 2.6, 0.06));
    E.with({ color: col('#7a5a3e'), pat: PAT.RUST, gloss: 0.2 }, () => E.box(0.3, base + 1.8, 0.061, W - 0.3, base + 2.6, 0.062));
    E.with({ color: col('#8c8e8d'), pat: PAT.METAL, gloss: 0.3 }, () => E.box(0.25, base + 2.6, 0, W - 0.25, base + 2.95, 0.35));
    const cr = ctx.atlasRects.closedsign;
    ctx.inSink('atlas', () => {
      E.with({ color: col('#e9e4d8'), pat: PAT.PLAIN, gloss: 0.1, weather: 0 }, () => E.quad([0.5, base + 3.05, 0.04], [W - 0.5, base + 3.05, 0.04], [W - 0.5, base + 3.05 + (W - 1) / 6, 0.04], [0.5, base + 3.05 + (W - 1) / 6, 0.04], quv(cr), [0, 0, 1]));
      const pr = ctx.atlasRects.shutterpaper;
      E.with({ color: col('#ffffff'), pat: PAT.PLAIN, gloss: 0.1 }, () => E.quad([W / 2 - 0.2, 1.2, 0.07], [W / 2 + 0.2, 1.2, 0.07], [W / 2 + 0.2, 1.7, 0.07], [W / 2 - 0.2, 1.7, 0.07], quv(pr), [0, 0, 1]));
    });
    // folded old awning frame
    E.with({ color: col('#6f5f55'), pat: PAT.AWNING, param: 0.45, gloss: 0.2, weather: 0.6 }, () => E.box(0.2, base + 2.95, 0, W - 0.2, base + 3.05, 0.55));
    const fy = base + fh1;
    windowUnit(ctx, W * 0.3, fy + 0.8, 1.35, 1.1, { frame: '#b9bcbd', curtain: 1, lit: rng.chance(0.5), hisashi: 0.35 });
    windowUnit(ctx, W * 0.72, fy + 0.8, 1.35, 1.1, { frame: '#b9bcbd', curtain: 2, lit: false, hisashi: 0.35 });
    for (let i = 0; i < 4; i++) potPlant(ctx, 0.5 + i * 0.45, 0.05, 0.4);
    bicycle(ctx, W - 0.8, 0.05, 0.45, 0, { color: '#3a3a3a' });
  });
  facades(ctx, x0, z0, x1, z1, 0, (len, side) => {
    if (side === 'left' || side === 'right') {
      windowUnit(ctx, len * 0.5, base + fh1 + 1.1, 0.6, 0.9, { frame: '#b9bcbd', grille: true, curtain: 4 });
      if (rng.chance(0.6)) acUnit(ctx, len * 0.6, base + fh1 + 0.2, { bracket: true, pipe: false });
    }
    if (side === 'front') downPipe(ctx, 0.1, ye - 0.2, 0, '#8c8f90');
  });
  gableRoof(ctx, x0, z0, x1, z1, ye, { kind: 'metal', color: col('#6b5048'), pitch: 0.3, ov: 0.35, og: 0.3, edge: '#8a8580', ridgeX: false, gutterCol: '#8c8f90', wall: wm });
}

// ---------------------------------------------------------------------------
// Small workshop (町工場)
// ---------------------------------------------------------------------------
export function workshop(ctx, lot) {
  const E = ctx.E, rng = ctx.rng;
  const lw = lot.w, ld = lot.depth;
  const W = lw - 1.2, D = ld - 2.4, H = 5.2;
  const x0 = -W / 2, x1 = W / 2, z1 = -1.6, z0 = z1 - D;
  lotBase(ctx, lot);
  ctx.solid(x0 - 0.3, 0, z0 - 0.3, x1 + 0.3, H + 1.2, z1 + 0.3);
  ctx.dropPoints.push(ctx.toWorld(x0 + 0.3, H - 0.5, z1 + 0.05));
  slab(ctx, -lw / 2, z1, lw / 2, 0, 0.05, '#9d9a92', lowOf(lot));
  const wc = col(rng.pick(['#aab3ad', '#b4b7b3', '#9fb0b3']));
  E.with({ color: wc, pat: PAT.CORR, gloss: 0.45, weather: 0.8, grad: [0, H, 0.8] }, () => E.box(x0, 0, z0, x1, H, z1, { ny: true }));
  E.frame(x0, 0, z1, 0, () => {
    // big half-open shutter with dark lit interior
    const sw = 4.0, sx = 0.8;
    E.with({ color: col('#fff1dc'), pat: PAT.GLASS, param: 5, emit: 0.7, ex1: sw, ex2: 1.6, weather: 0.8 }, () => E.quad([sx, 0.05, 0.01], [sx + sw, 0.05, 0.01], [sx + sw, 1.65, 0.01], [sx, 1.65, 0.01], [0, 0, sw, 0, sw, 1.6, 0, 1.6], [0, 0, 1]));
    E.with({ color: col('#8f9391'), pat: PAT.SHUTTER, gloss: 0.4, weather: 0.6 }, () => E.box(sx, 1.65, 0, sx + sw, 3.6, 0.06));
    E.with({ color: col('#7c7f7d'), pat: PAT.METAL }, () => E.box(sx - 0.1, 3.6, 0, sx + sw + 0.1, 3.95, 0.35));
    ctx.addLight(ctx.toWorld(sx + sw / 2, 0.6, 1.0), '#fff0d8', 5.0, 0.8);
    windowUnit(ctx, W - 1.6, 1.2, 1.6, 1.0, { frame: '#b9bcbd', curtain: 3, lit: true });
    door(ctx, W - 3.1, 0.05, 0.85, 2.0, { style: 'steel', color: '#8e9a9a' });
    // drums & rust
    E.with({ color: col('#3e5f7a'), pat: PAT.RUST, gloss: 0.4 }, () => {
      E.cyl(W - 0.6, 0, 0.6, 0.29, 0.88, 12);
      E.cyl(W - 1.2, 0, 0.5, 0.29, 0.88, 12);
    });
    E.with({ color: col('#b43a2a'), pat: PAT.PLAIN, gloss: 0.3 }, () => E.box(0.1, 0.9, 0.05, 0.4, 1.4, 0.2));
  });
  gableRoof(ctx, x0, z0, x1, z1, H, { kind: 'metal', color: col('#5f6a6c'), pitch: 0.2, ov: 0.3, og: 0.25, edge: '#8f9391', ridgeX: false, gutter: false, wall: { color: wc, pat: PAT.CORR, gloss: 0.45, weather: 0.8 } });
  facades(ctx, x0, z0, x1, z1, 0, (len, side) => {
    if (side === 'right' || side === 'left') for (let x = 1.5; x < len - 1; x += 3) windowUnit(ctx, x, 2.8, 1.4, 0.9, { frame: '#9a9d9e', curtain: 0, lit: rng.chance(0.4) });
  });
  weeds(ctx, -lw / 2, lw / 2, -0.1, 0, 1.4, 0.35);
}

// ---------------------------------------------------------------------------
// Mid-rise apartment block (マンション)
// ---------------------------------------------------------------------------
export function mansion(ctx, lot, opts = {}) {
  const E = ctx.E, rng = ctx.rng;
  const lw = lot.w, ld = lot.depth;
  const floors = opts.floors || rng.int(4, 6);
  const W = lw - 2, D = clamp(ld - 4, 8, 11);
  const x0 = -W / 2, x1 = W / 2, z1 = -2.5, z0 = z1 - D;
  const fh = 2.9, base = 0.3, ye = base + floors * fh;
  lotBase(ctx, lot);
  ctx.solid(x0 - 0.2, 0, z0 - 1.3, x1 + 0.2, ye + 3, z1 + 1.3);
  slab(ctx, -lw / 2, z1, lw / 2, 0, 0.05, '#b3b0a8', lowOf(lot));
  const tile = { color: col(opts.wallCol || rng.pick(['#c9bfae', '#b8ad9c', '#d6d0c4', '#a7a198'])), pat: PAT.TILE, param: 0.06, gloss: 0.15, weather: 0.5, grad: [0, ye, 0.85] };
  E.with(tile, () => E.box(x0, 0, z0, x1, ye, z1, { ny: true }));
  const bays = Math.max(2, Math.round(W / 3.6));
  const bw = W / bays;
  E.frame(x0, 0, z1, 0, () => {
    for (let f = 0; f < floors; f++) {
      const fy = base + f * fh;
      for (let b = 0; b < bays; b++) {
        const bx = b * bw;
        if (f === 0 && b === Math.floor(bays / 2)) {
          // entrance
          E.with({ color: col('#fff4e2'), pat: PAT.GLASS, param: 5, emit: 1.0, ex1: bw - 0.8, ex2: 2.3, weather: 0.6 }, () => E.quad([bx + 0.4, 0.05, 0.02], [bx + bw - 0.4, 0.05, 0.02], [bx + bw - 0.4, 2.35, 0.02], [bx + 0.4, 2.35, 0.02], [0, 0, bw - 0.8, 0, bw - 0.8, 2.3, 0, 2.3], [0, 0, 1]));
          E.with({ color: col('#e8e5de'), pat: PAT.PLAIN, gloss: 0.3 }, () => E.box(bx + 0.1, 2.4, 0, bx + bw - 0.1, 2.6, 1.6));
          ctx.addLight(ctx.toWorld(bx + bw / 2, 1.2, 1.4), '#fff0d8', 5, 0.8);
          continue;
        }
        windowUnit(ctx, bx + bw / 2, fy + 0.1, Math.min(2.2, bw - 0.9), 1.95, { frame: '#9a9d9e', lit: rng.chance(0.16), curtain: rng.pick([1, 2, 2, 3]) });
        if (f > 0) balcony(ctx, bx + 0.05, bx + bw - 0.05, fy + 0.02, 1.1, { style: 'panel', railCol: '#8f9394', panelCol: rng.pick(['#cfd6da', '#d8d4ca']), laundry: false });
        if (f > 0 && rng.chance(0.6)) acUnit(ctx, bx + 0.6, fy + 0.2, { pipe: false });
      }
    }
  });
  facades(ctx, x0, z0, x1, z1, 0, (len, side) => {
    if (side === 'left' || side === 'right') for (let f = 0; f < floors; f++) windowUnit(ctx, len * 0.5, base + f * fh + 1.0, 0.8, 1.0, { frame: '#9a9d9e', curtain: rng.pick([1, 4]), lit: rng.chance(0.15) });
    if (side === 'back') for (let f = 0; f < floors; f++) for (let x = 1.2; x < len - 1; x += 2.6) windowUnit(ctx, x, base + f * fh + 1.0, 1.2, 1.0, { frame: '#9a9d9e', grille: true, curtain: 4, lit: rng.chance(0.2) });
  });
  flatRoof(ctx, x0, z0, x1, z1, ye, { wall: tile, parapet: 0.8 });
  E.with({ color: col('#d8d6d0'), pat: PAT.PLAIN, gloss: 0.3, weather: 0.6 }, () => {
    E.box(x1 - 4, ye, z0 + 1, x1 - 1.5, ye + 2.6, z0 + 3.5);
    E.box(x0 + 1.5, ye, z0 + 1.5, x0 + 3.5, ye + 1.6, z0 + 3.5);
  });
  E.with({ color: col('#9ea8ae'), pat: PAT.METAL, gloss: 0.4 }, () => E.cyl(x0 + 2.5, ye + 1.6, z0 + 2.5, 0.8, 1.4, 12));
  for (let i = 0; i < 6; i++) bicycle(ctx, -lw / 2 + 1 + i * 0.5, 0.05, -1.2, Math.PI / 2 + rng.range(-0.1, 0.1));
  hedge(ctx, lw / 2 - 4.5, lw / 2 - 0.4, -0.4, 0.9, 0.5);
}

// ---------------------------------------------------------------------------
// Monthly parking lot
// ---------------------------------------------------------------------------
export function parkingLot(ctx, lot) {
  const E = ctx.E, rng = ctx.rng;
  const lw = lot.w, ld = lot.depth;
  const low = lowOf(lot);
  const f = () => {
    E.with({ color: col('#5d6167'), pat: PAT.ASPHALT, param: 0, gloss: 0.5 }, () => E.quad([-lw / 2, 0.02, 0], [lw / 2, 0.02, 0], [lw / 2, 0.02, -ld], [-lw / 2, 0.02, -ld], [0, 0, lw, 0, lw, ld, 0, ld], [0, 1, 0]));
    const n = Math.floor(lw / 2.5);
    E.with({ color: col('#e8e8e2'), pat: PAT.PAINT, gloss: 0.5 }, () => {
      for (let i = 0; i <= n; i++) {
        const x = -lw / 2 + 0.2 + i * 2.5;
        E.quad([x - 0.06, 0.035, -1.0], [x + 0.06, 0.035, -1.0], [x + 0.06, 0.035, -6.0], [x - 0.06, 0.035, -6.0], null, [0, 1, 0]);
      }
    });
  };
  if (low) ctx.inSink('ground', f);
  else f();
  const n = Math.floor(lw / 2.5);
  for (let i = 0; i < n; i++) {
    const x = -lw / 2 + 0.2 + i * 2.5 + 1.25;
    wheelStop(ctx, x - 0.55, -5.4, 0);
    wheelStop(ctx, x + 0.55, -5.4, 0);
    if (rng.chance(0.55)) car(ctx, x, 0.03, -3.4, Math.PI / 2 + (rng.chance(0.8) ? 0 : Math.PI));
  }
  // sign
  signPost(ctx, lw / 2 - 0.6, 0, -0.3, 0, ctx.atlasRects.parking, 0.7, 0.7, 1.9, { pole: '#8a8d8f' });
  // edges: low block, weeds
  E.frame(0, 0, -ld + 0.1, 0, () => blockWall(ctx, -lw / 2, lw / 2, 0, 1.2, {}));
  weeds(ctx, -lw / 2 + 0.2, lw / 2 - 0.2, -ld + 0.35, 0, 2.0, 0.4);
  for (let i = 0; i < 6; i++) grass(ctx, rng.range(-lw / 2, lw / 2), 0.02, rng.range(-ld + 0.4, -0.2), rng.range(0.15, 0.3));
  // chain posts at the entrance
  E.with({ color: col('#e9e6df'), pat: PAT.METAL, gloss: 0.5 }, () => {
    for (const x of [-lw / 2 + 0.2, lw / 2 - 0.2]) E.cyl(x, 0, -0.2, 0.05, 0.75, 8);
  });
  if (lot.drawLeft) E.frame(-lw / 2 + 0.08, 0, 0, Math.PI / 2, () => blockWall(ctx, 0.05, ld - 0.05, 0, 0.6, {}));
}

// ---------------------------------------------------------------------------
// Vegetable patch (畑)
// ---------------------------------------------------------------------------
export function field(ctx, lot) {
  const E = ctx.E, rng = ctx.rng;
  const lw = lot.w, ld = lot.depth;
  const f = () => E.with({ color: col('#5b4a3a'), pat: PAT.SOIL, param: 0.3, gloss: 0.15 }, () => E.quad([-lw / 2, 0.02, 0], [lw / 2, 0.02, 0], [lw / 2, 0.02, -ld], [-lw / 2, 0.02, -ld], [0, 0, lw, 0, lw, ld, 0, ld], [0, 1, 0]));
  if (lowOf(lot)) ctx.inSink('ground', f);
  else f();
  // ridges
  const rows = Math.floor((ld - 2) / 1.1);
  for (let r = 0; r < rows; r++) {
    const z = -1.4 - r * 1.1;
    E.with({ color: col('#4f3f31'), pat: PAT.SOIL, param: 0, gloss: 0.1 }, () => {
      quadF(E, [-lw / 2 + 0.8, 0.02, z + 0.4], [lw / 2 - 1.2, 0.02, z + 0.4], [lw / 2 - 1.2, 0.2, z], [-lw / 2 + 0.8, 0.2, z], null, [0, 1, 1]);
      quadF(E, [-lw / 2 + 0.8, 0.2, z], [lw / 2 - 1.2, 0.2, z], [lw / 2 - 1.2, 0.02, z - 0.4], [-lw / 2 + 0.8, 0.02, z - 0.4], null, [0, 1, -1]);
    });
    const kind = rng.pick(['leafy', 'leafy', 'tall', 'none']);
    for (let x = -lw / 2 + 1.1; x < lw / 2 - 1.4; x += kind === 'tall' ? 0.6 : 0.4) {
      if (kind === 'leafy') clump(ctx, x, 0.35, z, 0.22, 0.16, 0.22, { tile: 'broad', color: rng.pick(['#6f9d4c', '#7ea856', '#5e8f45']), n: 6, size: 0.3, sway: 0.02 });
      else if (kind === 'tall') {
        E.with({ color: col('#b9aa7a'), pat: PAT.PLAIN, gloss: 0.3 }, () => E.cyl(x, 0.1, z, 0.012, 1.8, 4));
        clump(ctx, x, 1.0, z, 0.2, 0.7, 0.2, { tile: 'broad', color: '#5d8a45', n: 12, size: 0.3, sway: 0.03 });
      }
    }
  }
  // tool shed
  shed(ctx, lw / 2 - 1.2, 0, -ld + 1.2, 1.4, 1.0, 1.9, -Math.PI / 2);
  // wire fence at the front
  E.with({ color: col('#8a8c88'), pat: PAT.METAL }, () => {
    for (let x = -lw / 2; x <= lw / 2; x += 1.8) E.cyl(x, 0, -0.15, 0.03, 1.0, 5);
    E.box(-lw / 2, 0.95, -0.17, lw / 2, 0.98, -0.13);
    E.box(-lw / 2, 0.5, -0.17, lw / 2, 0.52, -0.13);
  });
  weeds(ctx, -lw / 2, lw / 2, -0.4, 0, 2.5, 0.45);
  weeds(ctx, -lw / 2, lw / 2, -ld + 0.3, 0, 2.5, 0.5);
  // blue plastic bucket
  E.with({ color: col('#3b6fb0'), pat: PAT.PLAIN, gloss: 0.5 }, () => E.cyl(-lw / 2 + 0.8, 0.02, -0.8, 0.16, 0.3, 10, true, 0.2));
  if (lot.drawLeft) E.frame(-lw / 2 + 0.08, 0, 0, Math.PI / 2, () => blockWall(ctx, 0.05, ld - 0.05, 0, 1.0, {}));
}

// ---------------------------------------------------------------------------
// Small children's park (児童公園)
// ---------------------------------------------------------------------------
export function park(ctx, lot) {
  const E = ctx.E, rng = ctx.rng;
  const lw = lot.w, ld = lot.depth;
  const f = () => E.with({ color: col('#8e7f69'), pat: PAT.SOIL, param: -0.2, gloss: 0.3 }, () => E.quad([-lw / 2, 0.02, 0], [lw / 2, 0.02, 0], [lw / 2, 0.02, -ld], [-lw / 2, 0.02, -ld], [0, 0, lw, 0, lw, ld, 0, ld], [0, 1, 0]));
  if (lowOf(lot)) ctx.inSink('ground', f);
  else f();
  // fence with an entrance
  E.frame(0, 0, -0.3, 0, () => {
    meshFence(ctx, -lw / 2, -1.2, 0, 1.2, '#476a52');
    meshFence(ctx, 1.2, lw / 2, 0, 1.2, '#476a52');
  });
  E.with({ color: col('#e8e5dd'), pat: PAT.METAL, gloss: 0.5 }, () => {
    for (const x of [-0.6, 0.6]) E.cyl(x, 0, -0.2, 0.06, 0.8, 8);
  });
  for (const x of [-lw / 2 + 0.1, lw / 2 - 0.1]) E.frame(x, 0, 0, Math.PI / 2, () => meshFence(ctx, 0.3, ld - 0.1, 0, 1.2, '#476a52'));
  E.frame(0, 0, -ld + 0.1, 0, () => meshFence(ctx, -lw / 2, lw / 2, 0, 1.2, '#476a52'));
  // trees along the edges
  for (const [tx, tz, h] of [[-lw / 2 + 1.5, -1.8, 7], [lw / 2 - 1.6, -2.4, 6.5], [-lw / 2 + 1.8, -ld + 2, 8], [lw / 2 - 2, -ld + 1.8, 7.5], [0, -ld + 1.6, 6]]) tree(ctx, tx, 0, tz, { h, crown: 2.3, color: rng.pick(['#4f7c3f', '#5d8a45', '#3f6a3a']) });
  for (let x = -lw / 2 + 1; x < lw / 2 - 1; x += rng.range(1.2, 2.0)) if (rng.chance(0.6)) hydrangea(ctx, x, 0.02, -0.9, rng.range(0.4, 0.6));
  // swing
  E.frame(-lw * 0.18, 0, -ld * 0.55, 0, () => {
    E.with({ color: col('#c43b2e'), pat: PAT.METAL, gloss: 0.5, weather: 0.3 }, () => {
      for (const x of [-1.6, 1.6]) {
        E.beam([x, 0, -0.9], [x, 2.4, 0], 0.07);
        E.beam([x, 0, 0.9], [x, 2.4, 0], 0.07);
      }
      E.beam([-1.7, 2.4, 0], [1.7, 2.4, 0], 0.09);
    });
    E.with({ color: col('#9a9d9e'), pat: PAT.METAL, gloss: 0.6 }, () => {
      for (const x of [-0.8, 0.8]) {
        E.cyl(x - 0.25, 0.45, 0, 0.01, 1.95, 3);
        E.cyl(x + 0.25, 0.45, 0, 0.01, 1.95, 3);
      }
    });
    E.with({ color: col('#e3b43c'), pat: PAT.PLAIN, gloss: 0.4 }, () => {
      for (const x of [-0.8, 0.8]) E.box(x - 0.28, 0.42, -0.12, x + 0.28, 0.47, 0.12);
    });
  });
  // slide
  E.frame(lw * 0.2, 0, -ld * 0.45, -0.4, () => {
    E.with({ color: col('#3f7db8'), pat: PAT.METAL, gloss: 0.5 }, () => {
      E.box(-0.4, 0, -0.4, 0.4, 1.6, 0.4, { py: true });
      E.box(-0.45, 1.55, -0.45, 0.45, 1.65, 0.45);
    });
    E.with({ color: col('#c9cdcf'), pat: PAT.METAL, gloss: 0.8 }, () => quadF(E, [-0.3, 1.6, 0.45], [0.3, 1.6, 0.45], [0.3, 0.2, 2.6], [-0.3, 0.2, 2.6], null, [0, 1, 0.6]));
    E.with({ color: col('#9a9d9e'), pat: PAT.METAL }, () => {
      for (let i = 0; i < 6; i++) E.box(-0.3, i * 0.27, -0.75 + i * 0.05, 0.3, i * 0.27 + 0.04, -0.6 + i * 0.05);
    });
  });
  // sandbox
  E.with({ color: col('#bfb8a8'), pat: PAT.CONCRETE, gloss: 0.3 }, () => {
    const sx = lw * 0.15, sz = -ld * 0.75;
    E.box(sx - 1.5, 0, sz - 1.2, sx + 1.5, 0.25, sz - 1.05);
    E.box(sx - 1.5, 0, sz + 1.05, sx + 1.5, 0.25, sz + 1.2);
    E.box(sx - 1.5, 0, sz - 1.05, sx - 1.35, 0.25, sz + 1.05);
    E.box(sx + 1.35, 0, sz - 1.05, sx + 1.5, 0.25, sz + 1.05);
    E.with({ color: col('#b59a74'), pat: PAT.SOIL, param: -0.8 }, () => E.box(sx - 1.35, 0, sz - 1.05, sx + 1.35, 0.15, sz + 1.05));
  });
  bench(ctx, -lw / 2 + 2.5, -ld + 2.8, 0.3, { color: '#6f5541' });
  bench(ctx, lw / 2 - 2.5, -ld * 0.3, -Math.PI / 2, { color: '#6f5541' });
  // park lamp
  E.with({ color: col('#5d6468'), pat: PAT.METAL, gloss: 0.5 }, () => E.cyl(lw / 2 - 1.2, 0, -ld * 0.6, 0.06, 3.8, 8));
  E.with({ color: col('#fff3dc'), pat: PAT.EMIT, emit: 1.8, ex1: 3 }, () => E.cyl(lw / 2 - 1.2, 3.8, -ld * 0.6, 0.18, 0.35, 10));
  ctx.addLight(ctx.toWorld(lw / 2 - 1.2, 3.2, -ld * 0.6), '#fff0d0', 7, 0.5, 3);
  ctx.glows.push({ p: ctx.toWorld(lw / 2 - 1.2, 3.95, -ld * 0.6), color: col('#fff0d8'), size: 1.1, strength: 0.4, flicker: 3 });
  // puddles & grass patches
  for (let i = 0; i < 30; i++) grass(ctx, rng.range(-lw / 2 + 0.5, lw / 2 - 0.5), 0.02, rng.range(-ld + 0.5, -0.8), rng.range(0.15, 0.35));
  garbageStation(ctx, 0, 0, 0);
}

// ---------------------------------------------------------------------------
// Overgrown vacant lot
// ---------------------------------------------------------------------------
export function vacant(ctx, lot) {
  const E = ctx.E, rng = ctx.rng;
  const lw = lot.w, ld = lot.depth;
  const f = () => E.with({ color: col('#6d6452'), pat: PAT.SOIL, param: 0.7, gloss: 0.2 }, () => E.quad([-lw / 2, 0.02, 0], [lw / 2, 0.02, 0], [lw / 2, 0.02, -ld], [-lw / 2, 0.02, -ld], [0, 0, lw, 0, lw, ld, 0, ld], [0, 1, 0]));
  if (lowOf(lot)) ctx.inSink('ground', f);
  else f();
  for (let i = 0; i < lw * ld * 0.9; i++) grass(ctx, rng.range(-lw / 2 + 0.2, lw / 2 - 0.2), 0.02, rng.range(-ld + 0.2, -0.3), rng.range(0.25, 0.75), { n: 2 });
  for (let i = 0; i < 4; i++) bush(ctx, rng.range(-lw / 2 + 1, lw / 2 - 1), 0.02, rng.range(-ld + 1, -2), rng.range(0.4, 0.8), { color: '#5d7f3c' });
  // rope fence
  E.with({ color: col('#d8d6cf'), pat: PAT.PLAIN, gloss: 0.3 }, () => {
    for (let x = -lw / 2 + 0.2; x <= lw / 2; x += 2) E.box(x - 0.04, 0, -0.34, x + 0.04, 0.8, -0.26);
  });
  E.with({ color: col('#e9d23a'), pat: PAT.PLAIN, gloss: 0.2 }, () => E.tube([[-lw / 2 + 0.2, 0.72, -0.3], [0, 0.62, -0.3], [lw / 2 - 0.2, 0.72, -0.3]], 0.012, 3));
  signPost(ctx, rng.range(-1, 1), 0, -0.5, 0, ctx.atlasRects.parking, 0.8, 0.8, 1.8);
  if (rng.chance(0.6)) tree(ctx, -lw / 2 + 1.2, 0, -ld + 1.4, { h: 5, crown: 1.8 });
}

// ---------------------------------------------------------------------------
// Neighbourhood shrine on the hill top
// ---------------------------------------------------------------------------
export function shrine(ctx, x, y, z, rot) {
  const E = ctx.E, rng = ctx.rng;
  ctx.chunk(x, z);
  E.frame(x, y, z, rot, () => {
    // gravel precinct
    E.with({ color: col('#9b968b'), pat: PAT.GRAVEL, gloss: 0.15 }, () => E.box(-9, -1.5, -20, 9, 0.03, 0, { ny: true }));
    // stone path
    E.with({ color: col('#a8a59c'), pat: PAT.STONE, gloss: 0.3 }, () => E.box(-0.9, 0, -16, 0.9, 0.06, 0, { ny: true }));
    // torii (vermilion)
    E.frame(0, 0, -1.5, 0, () => {
      E.with({ color: col('#c4452f'), pat: PAT.PLAIN, gloss: 0.35, weather: 0.3 }, () => {
        for (const s of [-1, 1]) E.cyl(s * 1.6, 0, 0, 0.17, 4.2, 12, true, 0.15);
        E.box(-1.9, 3.35, -0.14, 1.9, 3.55, 0.14);
        E.box(-0.08, 3.55, -0.1, 0.08, 4.1, 0.1);
      });
      E.with({ color: col('#2b2624'), pat: PAT.PLAIN, gloss: 0.4 }, () => {
        E.beam([-2.5, 4.28, 0], [0, 4.1, 0], 0.32, 0.26);
        E.beam([0, 4.1, 0], [2.5, 4.28, 0], 0.32, 0.26);
        for (const s of [-1, 1]) E.box(s * 1.6 - 0.22, 0, -0.22, s * 1.6 + 0.22, 0.35, 0.22);
      });
      for (let xx = -2.3; xx < 2.4; xx += 0.5) ctx.drip(xx, 4.1, 0.16);
    });
    // lanterns
    for (const s of [-1, 1]) {
      E.with({ color: col('#8f8c84'), pat: PAT.STONE, gloss: 0.2, weather: 0.5 }, () => {
        const lx = s * 1.8, lz = -8;
        E.box(lx - 0.35, 0, lz - 0.35, lx + 0.35, 0.3, lz + 0.35);
        E.cyl(lx, 0.3, lz, 0.13, 1.0, 8);
        E.box(lx - 0.3, 1.3, lz - 0.3, lx + 0.3, 1.75, lz + 0.3);
        E.cyl(lx, 1.75, lz, 0.5, 0.25, 6, true, 0.08);
      });
      clump(ctx, s * 1.8, 1.9, -8, 0.3, 0.12, 0.3, { tile: 'small', color: '#5d7f3c', n: 6, size: 0.25 });
    }
    // shrine hall
    E.frame(0, 0, -15.5, 0, () => {
      E.with({ color: col('#8f8b82'), pat: PAT.STONE, gloss: 0.2 }, () => E.box(-2.6, 0, -2.6, 2.6, 0.6, 2.6));
      E.with({ color: col('#5a4332'), pat: PAT.WOOD, gloss: 0.1, weather: 0.5 }, () => E.box(-1.9, 0.6, -1.9, 1.9, 3.2, 1.9));
      E.with({ color: col('#e8e2d4'), pat: PAT.GLASS, param: 4, emit: 0.6, ex1: 2.2, ex2: 1.6, weather: 0.2 }, () => E.quad([-1.1, 1.0, 1.91], [1.1, 1.0, 1.91], [1.1, 2.6, 1.91], [-1.1, 2.6, 1.91], [0, 0, 2.2, 0, 2.2, 1.6, 0, 1.6], [0, 0, 1]));
      E.with({ color: col('#3a2c22'), pat: PAT.WOOD }, () => {
        for (let i = -2; i <= 2; i++) E.box(i * 0.5 - 0.03, 1.0, 1.9, i * 0.5 + 0.03, 2.6, 1.96);
        for (let j = 0; j < 5; j++) E.box(-1.1, 1.0 + j * 0.4, 1.9, 1.1, 1.04 + j * 0.4, 1.95);
        E.box(-2.0, 0.55, 1.9, 2.0, 0.65, 3.2);
        for (let i = 0; i < 3; i++) E.box(-1.0, 0.1 + i * 0.16, 2.6 + i * -0.25, 1.0, 0.26 + i * 0.16, 3.4 - i * 0.25);
      });
      gableRoof(ctx, -1.9, -1.9, 1.9, 1.9, 3.2, { kind: 'metal', color: col('#5d7d6e'), pitch: 0.75, ov: 1.3, og: 0.9, edge: '#3a2c22', soffit: '#6b5a48', ridgeX: false, gutter: false, wall: { color: col('#5a4332'), pat: PAT.WOOD } });
      // rope + bell
      E.with({ color: col('#e8dcb0'), pat: PAT.PLAIN }, () => E.tube([[-1.5, 3.1, 2.3], [0, 2.95, 2.35], [1.5, 3.1, 2.3]], 0.05, 5));
      E.with({ color: col('#c9a445'), pat: PAT.METAL, gloss: 0.8 }, () => E.cyl(0, 2.6, 2.3, 0.12, 0.25, 8));
    });
    // big cedar-ish trees around the precinct
    for (const [tx, tz, h] of [[-6, -4, 13], [6.5, -6, 12], [-7, -13, 15], [6, -14, 14], [-3.5, -19, 12], [4, -19.5, 13], [8, -1.5, 10]]) {
      tree(ctx, tx, 0, tz, { h, crown: 3.2, color: rng.pick(['#35573a', '#3e5f3a', '#2f5236']), clumps: 8, leafSize: 1.2 });
    }
    for (let i = 0; i < 20; i++) bush(ctx, rng.range(-8, 8), 0.02, rng.range(-19, -2), rng.range(0.4, 0.8), { color: '#3f6438' });
    ctx.addLight(ctx.toWorld(0, 2.5, -12.5), '#ffe0b0', 5, 0.4);
  });
}
void THREE;
void hipRoof;
void fence;
void hydrangea;
void potPlant;
