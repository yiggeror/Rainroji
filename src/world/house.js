import * as THREE from 'three';
import { PAT } from '../builder.js';
import { col, clamp } from '../util.js';
import { windowUnit, door, facades, gableRoof, hipRoof, shedRoof, flatRoof, downPipe, balcony, canopy, quadF, FRAME_COLS } from './parts.js';
import { acUnit, meterBox, gasMeter, waterHeater, shed, bicycle, car, blockWall, fence, gatePost, umbrella } from './props.js';
import { tree, bush, hedge, hydrangea, potPlant, weeds, grass, ivy, clump } from './plants.js';

// ---------------------------------------------------------------------------
// Palettes (sRGB)
// ---------------------------------------------------------------------------
const WALLS = {
  modern: ['#e7e4dc', '#dcd6ca', '#cfd1cf', '#b8c0c3', '#e3d9c6', '#c9c1b2', '#d6d0c2', '#a9adab', '#eeebe4', '#c4b8a4'],
  showa: ['#d8cfbd', '#cdc5b3', '#d9d3c5', '#c5c0b4', '#e0d6bf', '#bfb8a8', '#d3c7ae'],
  lap: ['#b9c4c6', '#c7c9bd', '#a8b3b6', '#d0cbbd', '#9fb0ad', '#c9bfae', '#b2b8ba'],
  tile: ['#b7a386', '#cbbfa8', '#9d917f', '#d4cab8', '#a89984'],
};
const ROOFS = {
  kawara: ['#58616d', '#4f555e', '#636a73', '#5a5a5c', '#6e6258'],
  slate: ['#4b5057', '#5b4b40', '#55606b', '#3f4449', '#6a6e71', '#5a5048'],
  metal: ['#4f6c61', '#4c6582', '#7c4a3c', '#5c5550', '#3f4b55', '#6f7a70', '#8a6a4a'],
};

function wallMat(style, rng, colr) {
  const c = col(colr || rng.pick(WALLS[style] || WALLS.modern));
  switch (style) {
    case 'modern':
      return { color: c, pat: PAT.PANEL, param: rng.chance(0.35) ? 1 : 0, gloss: 0.12, weather: rng.range(0.2, 0.5) };
    case 'showa':
      return { color: c, pat: PAT.MORTAR, param: 0, gloss: 0.08, weather: rng.range(0.6, 1.0) };
    case 'lap':
      return { color: c, pat: PAT.LAP, param: rng.pick([0.18, 0.2, 0.24]), gloss: 0.15, weather: rng.range(0.4, 0.8) };
    case 'tile':
      return { color: c, pat: PAT.TILE, param: rng.pick([0.06, 0.05, 0.1]), gloss: 0.15, weather: rng.range(0.3, 0.6) };
    case 'wood':
      return { color: c, pat: PAT.WOOD, param: 0, gloss: 0.1, weather: 0.4 };
    default:
      return { color: c, pat: PAT.MORTAR, gloss: 0.1, weather: 0.5 };
  }
}

// ---------------------------------------------------------------------------
// Lot ground + pad + boundary
// ---------------------------------------------------------------------------
export function lotBase(ctx, lot, o = {}) {
  const E = ctx.E, rng = ctx.rng;
  const w = lot.w, d = lot.depth;
  const lowland = Math.abs(lot.level) < 0.05;
  // pad for raised lots
  if (lot.pad > 0.05) {
    const stone = lot.padStyle || (rng.chance(0.6) ? 'stone' : 'concrete');
    E.with({ color: col(stone === 'stone' ? '#9a9788' : '#a9a8a0'), pat: stone === 'stone' ? PAT.STONE : PAT.CONCRETE, gloss: 0.15, weather: 0.5, vbase: -lot.pad }, () =>
      E.box(-w / 2, -lot.pad - 0.4, -d, w / 2, 0, 0, { py: true, ny: true }),
    );
  }
  // ground: gravel everywhere (reflective sink when at street level)
  const g = () => {
    E.with({ color: col(o.groundCol || rng.pick(['#8c8a84', '#9a948a', '#83817c'])), pat: PAT.GRAVEL, gloss: 0.12, weather: 0 }, () => {
      E.quad([-w / 2, 0.012, 0], [w / 2, 0.012, 0], [w / 2, 0.012, -d], [-w / 2, 0.012, -d], [-w / 2, 0, w / 2, 0, w / 2, d, -w / 2, d], [0, 1, 0]);
    });
  };
  if (lowland) ctx.inSink('ground', g);
  else g();
}

// concrete slab (driveway / path) in lot coords
export function slab(ctx, x0, z0, x1, z1, h = 0.05, colr = '#bdbbb4', lowland = true) {
  const E = ctx.E;
  const f = () => E.with({ color: col(colr), pat: PAT.CONCRETE, gloss: 0.4, weather: 0 }, () => E.box(x0, 0, z0, x1, h, z1, { ny: true }));
  if (lowland) ctx.inSink('ground', f);
  else f();
}

function soilPatch(ctx, x0, z0, x1, z1, lowland) {
  const E = ctx.E;
  const f = () => E.with({ color: col('#5a4c3c'), pat: PAT.SOIL, param: 0.6, gloss: 0.1 }, () => E.box(x0, 0, z0, x1, 0.035, z1, { ny: true }));
  if (lowland) ctx.inSink('ground', f);
  else f();
}

// front boundary with openings: segments [x0,x1] to fill
function frontBoundary(ctx, lot, openings, style) {
  const rng = ctx.rng;
  const w = lot.w;
  const segs = [];
  let x = -w / 2;
  const ops = openings.slice().sort((a, b) => a[0] - b[0]);
  for (const [a, b] of ops) {
    if (a > x + 0.1) segs.push([x, a]);
    x = Math.max(x, b);
  }
  if (x < w / 2 - 0.1) segs.push([x, w / 2]);
  const h = style.h;
  for (const [a, b] of segs) {
    if (style.kind === 'hedge') {
      blockWall(ctx, a, b, -0.3, 0.35, { color: style.color });
      hedge(ctx, a + 0.1, b - 0.1, -0.35, 1.25, 0.55);
    } else if (style.kind === 'fence') {
      blockWall(ctx, a, b, -0.1, 0.45, { color: style.color });
      ctx.E.frame(0, 0.45, 0, 0, () => fence(ctx, a + 0.05, b - 0.05, -0.1, 0.8, { color: style.fenceCol }));
    } else {
      blockWall(ctx, a, b, -0.1, h, { color: style.color, pierced: rng.chance(0.3), fenceTop: style.fenceTop });
    }
    // weeds at the wall base on the street side
    if (rng.chance(0.7)) weeds(ctx, a + 0.1, b - 0.1, 0.02, 0, 0.8, 0.28);
  }
  return segs;
}

function sideBoundary(ctx, lot, x, h, colr) {
  const E = ctx.E;
  E.frame(x, 0, 0, Math.PI / 2, () => blockWall(ctx, 0.05, lot.depth - 0.05, 0, h, { color: colr }));
}

// ---------------------------------------------------------------------------
// Window layout along a facade for one floor
// ---------------------------------------------------------------------------
function layoutWindows(rng, len, kind, avoid = []) {
  const res = [];
  const margin = 0.45;
  let x = margin + rng.range(0, 0.6);
  let guard = 0;
  while (x < len - margin && guard++ < 12) {
    let type = kind === 'front' ? rng.weighted([['std', 5], ['wide', 2], ['small', 1]]) : rng.weighted([['std', 3], ['small', 3], ['none', 2]]);
    let w = type === 'wide' ? rng.range(1.6, 1.75) : type === 'std' ? rng.pick([1.2, 1.35, 1.65]) : rng.range(0.55, 0.75);
    if (type === 'none') {
      x += rng.range(0.8, 1.6);
      continue;
    }
    if (x + w > len - margin) {
      w = Math.min(w, len - margin - x);
      if (w < 0.55) break;
      if (w < 1.0) type = 'small';
    }
    const cx = x + w / 2;
    if (avoid.some(([a, b]) => cx + w / 2 > a && cx - w / 2 < b)) {
      x = Math.max(...avoid.map(([, b]) => b)) + 0.4;
      continue;
    }
    res.push({ x: cx, w, type });
    x += w + rng.range(0.6, 1.5);
  }
  return res;
}

// ---------------------------------------------------------------------------
// Detached house (the most common building)
// ---------------------------------------------------------------------------
export function detached(ctx, lot, opts = {}) {
  const E = ctx.E, rng = ctx.rng;
  const lowland = Math.abs(lot.level) < 0.05;
  const style = opts.style || rng.weighted([['modern', 4], ['showa', 3], ['lap', 2], ['tile', 1]]);
  const lw = lot.w, ld = lot.depth;
  const floors = opts.floors || (lw < 6.8 ? 3 : rng.chance(0.85) ? 2 : 1);
  const wantPark = opts.park ?? rng.chance(0.6);
  let W = clamp(opts.W || rng.range(6.2, 9.0), 4.6, lw - 1.2);
  let parkSide = 0;
  if (wantPark) {
    if (lw - W - 1.0 < 2.7) W = Math.max(4.8, lw - 3.9);
    if (lw - W - 1.0 >= 2.6) parkSide = opts.parkSide || rng.sign();
  }
  const D = clamp(opts.D || rng.range(6.5, 9.0), 4.8, ld - 2.2);
  const setback = clamp(opts.setback || rng.range(1.4, 3.2), 1.0, Math.max(1.0, ld - D - 0.6));
  const hx = parkSide ? -parkSide * (lw / 2 - 0.55 - W / 2) : rng.range(-1, 1) * Math.max(0, (lw - W) / 2 - 0.6);
  const x0 = hx - W / 2, x1 = hx + W / 2, z1 = -setback, z0 = -setback - D;
  const base = 0.45, fh = rng.range(2.75, 2.95);
  const ye = base + floors * fh;
  const wm = wallMat(style, rng, opts.wallCol);
  const frame = opts.frame || (style === 'modern' ? rng.pick(['#3b3a38', '#b9bcbd', '#5a4a3c', '#8a8d8e']) : rng.pick(['#b9bcbd', '#b9bcbd', '#8a8d8e', '#5a4a3c']));

  lotBase(ctx, lot);
  ctx.solid(x0 - 0.3, 0, z0 - 0.3, x1 + 0.3, ye + 1.5, z1 + 0.3);
  ctx.dropPoints.push(ctx.toWorld(x0 + 0.3, ye - 0.5, z1 + 0.05));

  // --- structure
  E.with({ color: col('#9d9c96'), pat: PAT.CONCRETE, gloss: 0.1, weather: 0.6 }, () => E.box(x0 - 0.02, 0, z0 - 0.02, x1 + 0.02, base, z1 + 0.02, { ny: true }));
  // foundation vents
  E.with({ color: col('#3a3a38'), pat: PAT.GRATE }, () => {
    for (let x = x0 + 1.2; x < x1 - 0.5; x += 2.7) E.box(x, 0.15, z1 + 0.02, x + 0.35, 0.3, z1 + 0.03, { ny: true });
  });
  const wallStyle = { ...wm, grad: [base, ye, 0.84], vbase: 0 };
  // two-tone: some modern houses have a different 1F colour
  const twoTone = style === 'modern' && rng.chance(0.35);
  const wall1 = twoTone ? { ...wallStyle, ...wallMat(rng.pick(['modern', 'tile']), rng), grad: [base, ye, 0.84], vbase: 0 } : wallStyle;
  E.with(wall1, () => E.box(x0, base, z0, x1, base + fh, z1, { ny: true, py: floors > 1 }));
  if (floors > 1) {
    const over = 0;
    E.with(wallStyle, () => E.box(x0, base + fh, z0, x1, ye, z1 + over, { ny: over === 0 }));
    if (twoTone || rng.chance(0.3))
      E.with({ color: col('#d9d6ce'), pat: PAT.PLAIN, gloss: 0.3, weather: 0.3 }, () => E.box(x0 - 0.03, base + fh - 0.05, z0 - 0.03, x1 + 0.03, base + fh + 0.06, z1 + 0.03 + over));
  }

  // --- roof
  const roofKind = opts.roofKind || (style === 'showa' ? rng.pick(['kawara', 'kawara', 'metal']) : style === 'lap' ? 'metal' : style === 'tile' ? rng.pick(['kawara', 'flat']) : rng.pick(['slate', 'slate', 'metal']));
  const roofType = opts.roofType || (roofKind === 'flat' ? 'flat' : rng.weighted([['gable', 4], ['hip', 3], ['shed', style === 'modern' ? 2 : 0.5]]));
  const roofCol = col(opts.roofCol || rng.pick(ROOFS[roofKind === 'flat' ? 'slate' : roofKind]));
  const edgeCol = style === 'showa' || style === 'lap' ? rng.pick(['#e8e4da', '#6a5a4a', '#3d3b39']) : rng.pick(['#e8e4da', '#3d3b39', '#5a4a3c', '#e8e4da']);
  const gutterCol = rng.pick(['#d0cfca', '#8c8f90', '#3d3b39', '#6b5a48']);
  const ridgeX = W >= D ? rng.chance(0.8) : rng.chance(0.2);
  let pitch = roofKind === 'kawara' ? rng.range(0.42, 0.52) : rng.range(0.3, 0.45);
  const ov = rng.range(0.35, 0.65);
  const noGutter = style === 'showa' && rng.chance(0.25);
  const ro = { kind: roofKind, color: roofCol, pitch, ov, og: ov * 0.8, edge: edgeCol, gutterCol, gutter: !noGutter, wall: wallStyle, ridgeX };
  let top;
  if (roofType === 'gable') top = gableRoof(ctx, x0, z0, x1, z1, ye, ro);
  else if (roofType === 'hip') top = hipRoof(ctx, x0, z0, x1, z1, ye, ro);
  else if (roofType === 'shed') {
    pitch = rng.range(0.18, 0.3);
    top = shedRoof(ctx, x0, z0, x1, z1, ye, { ...ro, pitch });
  } else top = flatRoof(ctx, x0, z0, x1, z1, ye, { wall: wallStyle });
  void top;
  const eaveY = roofType === 'flat' ? ye : ye - ov * pitch;

  // skirt roof (下屋) over the 1F front on older houses
  const skirt = floors > 1 && (style === 'showa' || style === 'tile') && rng.chance(0.55);
  if (skirt) {
    const sd = rng.range(0.6, 0.9);
    E.frame(0, 0, 0, 0, () => {
      const kind = roofKind === 'flat' ? 'kawara' : roofKind;
      const y = base + fh + 0.1;
      const mat = { color: roofCol, pat: kind === 'kawara' ? PAT.KAWARA : kind === 'slate' ? PAT.SLATE : PAT.CORR, gloss: 0.5 };
      E.with(mat, () => quadF(E, [x0 - 0.3, y, z1], [x1 + 0.3, y, z1], [x1 + 0.3, y - sd * 0.35, z1 + sd], [x0 - 0.3, y - sd * 0.35, z1 + sd], [x0, 0, x1, 0, x1, sd, x0, sd], [0, 1, 0]));
      E.with({ color: col(edgeCol), pat: PAT.PLAIN, gloss: 0.2 }, () => E.box(x0 - 0.3, y - sd * 0.35 - 0.12, z1 + sd - 0.03, x1 + 0.3, y - sd * 0.35 + 0.02, z1 + sd + 0.02));
      E.with({ color: col('#e9e6de'), pat: PAT.PLAIN }, () => quadF(E, [x0 - 0.3, y - 0.12, z1], [x1 + 0.3, y - 0.12, z1], [x1 + 0.3, y - sd * 0.35 - 0.1, z1 + sd], [x0 - 0.3, y - sd * 0.35 - 0.1, z1 + sd], null, [0, -1, 0]));
      for (let x = x0; x < x1; x += rng.range(0.9, 1.8)) ctx.drip(x, y - sd * 0.35 - 0.12, z1 + sd + 0.03);
    });
  }

  // --- entrance
  const doorOnFront = opts.doorSide ? opts.doorSide === 'front' : rng.chance(0.75);
  const doorX = parkSide ? (parkSide > 0 ? W - 1.15 : 1.15) : rng.chance(0.5) ? 1.1 : W - 1.1; // facade-local
  const lit = (p) => rng.chance(p);
  const balc = floors > 1 && rng.chance(style === 'showa' ? 0.45 : 0.65);
  const balcFront = rng.chance(0.7);
  let balcRange = null;

  facades(ctx, x0, z0, x1, z1 + 0, 0, (len, side) => {
    const isFront = side === 'front';
    const avoid1 = [];
    if (isFront && doorOnFront) avoid1.push([doorX - 0.9, doorX + 0.9]);
    // --- 1F
    if (isFront) {
      // big garden window
      const bigX = doorX < len / 2 ? len - 1.6 : 1.6;
      if (len > 4.5) {
        const shut = rng.chance(0.12);
        windowUnit(ctx, bigX, base + 0.12, 1.7, 1.95, { frame, lit: lit(0.25), tobukuro: !shut && rng.chance(0.4) ? (bigX > len / 2 ? 1 : -1) : 0, shutter: shut, curtain: rng.pick([1, 2, 2, 3]) });
        avoid1.push([bigX - 1.25, bigX + 1.25]);
      }
    }
    for (const wv of layoutWindows(rng, len, isFront ? 'front' : 'side', avoid1)) {
      const small = wv.type === 'small';
      const h = small ? 0.9 : 1.1;
      const y = base + (small ? 1.2 : 0.85);
      windowUnit(ctx, wv.x, y, wv.w, h, { frame, lit: lit(0.14), grille: small || (style !== 'modern' && rng.chance(0.4)), curtain: small ? 4 : undefined, hisashi: !isFront && style !== 'modern' && rng.chance(0.5) ? 0.35 : rng.chance(0.2) ? 0.3 : 0 });
    }
    // --- upper floors
    for (let f = 1; f < floors; f++) {
      const fy = base + f * fh;
      const avoid = [];
      const hasBalc = balc && f === 1 && ((isFront && balcFront) || (side === 'back' && !balcFront));
      if (hasBalc) {
        const bw = clamp(len * rng.range(0.5, 0.8), 2.4, len - 0.6);
        const bx = rng.chance(0.5) ? 0.3 : len - 0.3 - bw;
        balcRange = [bx, bx + bw];
        windowUnit(ctx, bx + bw / 2, fy + 0.1, Math.min(1.7, bw - 0.6), 1.95, { frame, lit: lit(0.18), curtain: rng.pick([1, 2, 2]) });
        balcony(ctx, bx, bx + bw, fy + 0.02, rng.range(0.85, 1.1), { wall: wallStyle });
        if (rng.chance(0.4)) E.frame(0, 0, 0, 0, () => acUnit(ctx, bx + 0.6, fy + 0.2, { pipe: false }));
        avoid.push([bx - 0.4, bx + bw + 0.4]);
      }
      for (const wv of layoutWindows(rng, len, isFront ? 'front' : 'side', avoid)) {
        const small = wv.type === 'small';
        windowUnit(ctx, wv.x, fy + (small ? 1.2 : 0.85), wv.w, small ? 0.9 : 1.1, { frame, lit: lit(0.12), grille: small, curtain: small ? 4 : undefined, hisashi: style !== 'modern' && rng.chance(0.45) ? 0.35 : 0, tobukuro: !small && style === 'showa' && rng.chance(0.35) ? 1 : 0 });
      }
    }
    // --- door
    if ((isFront && doorOnFront) || (side === (hx > 0 ? 'left' : 'right') && !doorOnFront)) {
      const dx = isFront ? doorX : len - 1.3;
      const dstyle = style === 'showa' && rng.chance(0.5) ? 'slide' : 'house';
      door(ctx, dx, base + 0.02, dstyle === 'slide' ? 1.5 : 0.95, 2.05, { style: dstyle, color: rng.pick(['#6b5140', '#4a3a30', '#8a7a68', '#3c4247', '#b5aa98']), lit: lit(0.3) });
      canopy(ctx, dx, base + 2.35, 1.6, 0.8, edgeCol);
      // porch light
      const pl = rng.chance(0.45);
      E.with({ color: col(pl ? '#ffe0b0' : '#e9e6dc'), pat: pl ? PAT.EMIT : PAT.PLAIN, emit: pl ? 1.4 : 0 }, () => E.box(dx + 0.7, base + 1.9, 0, dx + 0.84, base + 2.12, 0.12));
      if (pl) {
        ctx.addLight(ctx.toWorld(dx + 0.77, base + 2.0, 0.5), '#ffcf96', 3.0, 0.7);
        ctx.glows.push({ p: ctx.toWorld(dx + 0.77, base + 2.0, 0.15), color: col('#ffd8a0'), size: 0.55, strength: 0.4 });
      }
      // steps
      E.with({ color: col('#b5b2aa'), pat: PAT.TILE, param: 0.3, gloss: 0.3, weather: 0.2 }, () => {
        E.box(dx - 0.9, 0, 0, dx + 0.9, base - 0.15, 0.9, { ny: true });
        E.box(dx - 0.9, 0, 0.9, dx + 0.9, (base - 0.15) / 2, 1.3, { ny: true });
      });
      // umbrella leaning by the door
      if (rng.chance(0.35)) umbrella(ctx, dx - 0.75, 0.05, 0.25, 0);
      // pots by the door
      const np = rng.int(0, 4);
      for (let i = 0; i < np; i++) potPlant(ctx, dx + (i % 2 ? 1 : -1) * rng.range(1.0, 1.5), 0.02, rng.range(0.3, 1.1));
    }
    // --- utilities on side / back walls
    if (!ctx.lod && (side === 'right' || side === 'left')) {
      if (rng.chance(0.8)) acUnit(ctx, len * rng.range(0.35, 0.8), 0.12, { pipeH: rng.range(0.9, 2.2) });
      if (rng.chance(0.6)) meterBox(ctx, len * 0.15, 1.4);
      if (rng.chance(0.5)) gasMeter(ctx, len * 0.25, 0.9);
      if (rng.chance(0.2)) ivy(ctx, len * 0.3, len * 0.9, 0.1, rng.range(1.5, 4));
    }
    if (!ctx.lod && side === 'back') {
      if (rng.chance(0.35)) waterHeater(ctx, len * 0.3, 0);
      if (rng.chance(0.6)) acUnit(ctx, len * 0.7, 0.12, { pipeH: 1.2 });
    }
    // down pipes at two corners
    if (side === 'front' || side === 'back') downPipe(ctx, 0.12, eaveY - 0.08, 0, gutterCol);
  });

  if (ctx.lod) {
    if (lot.drawLeft) sideBoundary(ctx, lot, -lw / 2 + 0.08, 1.2, '#b3b2ab');
    E.frame(0, 0, 0, 0, () => blockWall(ctx, -lw / 2, lw / 2, -0.1, 1.1, {}));
    if (rng.chance(0.4)) tree(ctx, rng.sign() * (lw / 2 - 1), 0, -0.9, { h: rng.range(3.5, 5), crown: 1.4 });
    return;
  }
  // --- front boundary & yard
  const openings = [];
  let gateX = null;
  if (parkSide) {
    const px = parkSide > 0 ? lw / 2 - 0.1 : -lw / 2 + 0.1;
    openings.push([Math.min(px, px - parkSide * 3.0), Math.max(px, px - parkSide * 3.0)]);
  }
  const doorWorldX = doorOnFront ? x0 + doorX : hx;
  gateX = clamp(doorWorldX, -lw / 2 + 0.9, lw / 2 - 0.9);
  if (!openings.some(([a, b]) => gateX > a - 0.9 && gateX < b + 0.9)) openings.push([gateX - 0.6, gateX + 0.6]);
  else gateX = null;
  const fb = opts.boundary || rng.weighted([['block', 5], ['hedge', 2], ['fence', 2], ['none', lot.w > 12 ? 0 : 1]]);
  const bcol = rng.pick(['#b3b2ab', '#aeb0ad', '#b9b4a8', '#c4c0b6']);
  if (fb !== 'none') frontBoundary(ctx, lot, openings, { kind: fb, h: rng.range(0.9, 1.4), color: bcol, fenceTop: fb === 'block' && rng.chance(0.2) ? 0.6 : 0, fenceCol: rng.pick(['#6e706f', '#3d3b39', '#a5a7a6']) });
  if (gateX !== null && fb !== 'none') {
    gatePost(ctx, gateX - 0.9, -0.15, rng.range(1.2, 1.45), { lamp: rng.chance(0.3), tile: rng.chance(0.4) });
  }
  // path to the door
  if (doorOnFront) slab(ctx, doorWorldX - 0.6, z1 + 0.2, doorWorldX + 0.6, 0, 0.04, rng.pick(['#bdbbb4', '#a8a39a', '#c9c3b6']), lowland);
  if (lot.drawLeft) sideBoundary(ctx, lot, -lw / 2 + 0.08, rng.range(1.0, 1.5), bcol);
  if (lot.drawRight) sideBoundary(ctx, lot, lw / 2 - 0.08, rng.range(1.0, 1.5), bcol);
  if (lot.drawBack) E.frame(0, 0, -ld + 0.08, 0, () => blockWall(ctx, -lw / 2, lw / 2, 0, 1.3, { color: bcol }));

  // parking
  if (parkSide) {
    const pxc = parkSide > 0 ? (x1 + lw / 2) / 2 : (x0 - lw / 2) / 2;
    const pw = parkSide > 0 ? lw / 2 - x1 : x0 + lw / 2;
    const pd = Math.min(ld - 0.5, 5.2);
    slab(ctx, pxc - pw / 2 + 0.05, -pd, pxc + pw / 2 - 0.05, 0, 0.06, '#c2c0b8', lowland);
    if (rng.chance(0.7)) car(ctx, pxc, 0.06, -pd / 2 - 0.1, Math.PI / 2 + (rng.chance(0.5) ? Math.PI : 0), {});
    else for (let i = 0; i < rng.int(1, 3); i++) bicycle(ctx, pxc + (i - 0.5) * 0.45, 0.06, -1.3 - i * 0.2, Math.PI / 2 + rng.range(-0.15, 0.15));
    if (rng.chance(0.3)) {
      // carport
      E.with({ color: col('#8f9294'), pat: PAT.METAL, gloss: 0.5 }, () => {
        for (const [a, b] of [[-1, -1], [-1, 1]]) E.box(pxc + a * 1.45 - 0.05, 0, (b < 0 ? -pd + 0.3 : -0.4) - 0.05, pxc + a * 1.45 + 0.05, 2.3, (b < 0 ? -pd + 0.3 : -0.4) + 0.05);
        E.box(pxc - 1.6, 2.3, -pd, pxc + 1.6, 2.38, 0.1);
      });
      E.with({ color: col('#c9d3d2'), pat: PAT.CORR, gloss: 0.7 }, () => E.box(pxc - 1.6, 2.38, -pd, pxc + 1.6, 2.42, 0.1));
      for (let x = pxc - 1.4; x < pxc + 1.5; x += rng.range(0.7, 1.2)) ctx.drip(x, 2.28, 0.12);
    }
  }
  // front yard greenery
  const yardZ = z1 + 0.1;
  if (setback >= 1.3) {
    const gx0 = parkSide > 0 ? -lw / 2 + 0.3 : parkSide < 0 ? -lw / 2 + 3.3 : -lw / 2 + 0.3;
    const gx1 = parkSide > 0 ? lw / 2 - 3.3 : lw / 2 - 0.3;
    soilPatch(ctx, gx0, yardZ, gx1, -0.25, lowland);
    let x = gx0 + 0.4;
    while (x < gx1 - 0.3) {
      if (gateX !== null && Math.abs(x - gateX) < 1.0) {
        x += 1.2;
        continue;
      }
      if (doorOnFront && Math.abs(x - doorWorldX) < 1.1) {
        x += 1.3;
        continue;
      }
      const r = rng.next();
      if (r < 0.28) hydrangea(ctx, x, 0.02, (yardZ - 0.25) / 2, rng.range(0.4, 0.62));
      else if (r < 0.55) bush(ctx, x, 0.02, (yardZ - 0.25) / 2, rng.range(0.3, 0.55));
      else if (r < 0.7) potPlant(ctx, x, 0.02, -0.5);
      else if (r < 0.8) grass(ctx, x, 0.02, -0.4, 0.4, { n: 3 });
      x += rng.range(0.7, 1.4);
    }
  }
  // garden tree
  if (opts.tree ?? rng.chance(0.55)) {
    const tx = parkSide ? -parkSide * (lw / 2 - 0.9) : rng.sign() * (lw / 2 - 0.9);
    const tz = rng.chance(0.5) ? Math.min(-0.8, z1 + 0.2) : z0 - 0.6;
    if (tz < -0.6 && tz > -ld + 0.5) tree(ctx, tx, 0, tz, { h: rng.range(3.2, 5.5), crown: rng.range(1.0, 1.7) });
  }
  // back / side clutter
  if (ld + z0 > 1.6 && rng.chance(0.45)) shed(ctx, rng.range(x0 + 0.8, x1 - 0.8), 0, z0 - 0.75, 1.6, 0.8, 1.8, Math.PI);
  if (!parkSide && rng.chance(0.25)) bicycle(ctx, x1 + 0.45, 0.02, z1 - 1.5, Math.PI / 2);
  for (let i = 0; i < 4; i++) grass(ctx, rng.range(-lw / 2 + 0.2, lw / 2 - 0.2), 0.01, rng.range(-ld + 0.2, -0.3), rng.range(0.2, 0.45));
}

// ---------------------------------------------------------------------------
// Old wooden house: dark boards, heavy kawara roof, sliding doors, garden pine
// ---------------------------------------------------------------------------
export function oldHouse(ctx, lot, opts = {}) {
  const E = ctx.E, rng = ctx.rng;
  const lowland = Math.abs(lot.level) < 0.05;
  const lw = lot.w, ld = lot.depth;
  const W = clamp(rng.range(8, 10.5), 6, lw - 2.5), D = clamp(rng.range(7.5, 9.5), 6, ld - 3);
  const setback = clamp(rng.range(2.4, 3.6), 2.0, ld - D - 0.5);
  const hx = rng.range(-0.8, 0.8);
  const x0 = hx - W / 2, x1 = hx + W / 2, z1 = -setback, z0 = z1 - D;
  const base = 0.5, fh = 2.8;
  const two = opts.floors === 2 || (opts.floors === undefined && rng.chance(0.55));
  lotBase(ctx, lot, { groundCol: '#8f8a80' });
  ctx.solid(x0 - 0.5, 0, z0 - 0.5, x1 + 0.5, base + fh * 2.2, z1 + 0.5);
  ctx.dropPoints.push(ctx.toWorld(x0 + 0.4, base + fh * 0.9, z1 + 0.05));
  const wood = { color: col(rng.pick(['#4d3b2f', '#56443a', '#3f322a'])), pat: PAT.WOOD, gloss: 0.1, weather: 0.5, grad: [base, base + fh * 2, 0.85] };
  const plaster = { color: col('#dcd4c0'), pat: PAT.MORTAR, gloss: 0.05, weather: 0.9, grad: [base, base + fh * 2, 0.85] };
  E.with({ color: col('#8e8c85'), pat: PAT.STONE, gloss: 0.1 }, () => E.box(x0, 0, z0, x1, base, z1, { ny: true }));
  // lower walls wood, upper plaster band
  E.with(wood, () => E.box(x0, base, z0, x1, base + 1.9, z1, { ny: true, py: true }));
  E.with(plaster, () => E.box(x0, base + 1.9, z0, x1, base + fh, z1, { ny: true, py: !two }));
  // posts
  E.with({ color: col('#3a2e25'), pat: PAT.WOOD, gloss: 0.1 }, () => {
    for (let x = x0; x <= x1 + 0.01; x += W / Math.round(W / 1.82)) {
      E.box(x - 0.06, base, z1 - 0.02, x + 0.06, base + fh, z1 + 0.05, { ny: true });
      E.box(x - 0.06, base, z0 - 0.05, x + 0.06, base + fh, z0 + 0.02, { ny: true });
    }
    E.box(x0 - 0.02, base + fh - 0.1, z1, x1 + 0.02, base + fh, z1 + 0.06);
  });
  // front: sliding glass doors (engawa) + lit shoji behind
  E.frame(x0, 0, z1 + 0.06, 0, () => {
    const n = Math.floor((W - 2.2) / 0.9);
    for (let i = 0; i < n; i++) {
      windowUnit(ctx, 2.0 + i * 0.9 + 0.45, base + 0.1, 0.88, 1.8, { frame: '#5a4636', fw: 0.045, curtain: i % 3 === 0 ? 4 : 2, lit: rng.chance(0.25), slider: false, transom: true, sill: false });
    }
    door(ctx, 0.95, base + 0.02, 1.5, 1.95, { style: 'slide', color: '#5a4636', lit: rng.chance(0.5) });
    // stepping stones
    E.with({ color: col('#9a9790'), pat: PAT.STONE, gloss: 0.3 }, () => {
      for (let i = 0; i < 4; i++) E.cyl(0.95 + rng.range(-0.2, 0.2), 0, 0.6 + i * 0.7, rng.range(0.25, 0.35), 0.06, 8);
    });
  });
  // side windows
  facades(ctx, x0, z0, x1, z1, 0, (len, side) => {
    if (side === 'front') return;
    for (const wv of layoutWindows(rng, len, 'side')) windowUnit(ctx, wv.x, base + 1.0, wv.w, 0.95, { frame: '#5a4636', grille: true, curtain: rng.pick([1, 4]), hisashi: 0.4, hisashiCol: '#4f555e' });
    if (side === 'back' && rng.chance(0.6)) acUnit(ctx, len * 0.4, 0.12, {});
    if (side !== 'back' && rng.chance(0.4)) gasMeter(ctx, len * 0.3, 0.9);
  });
  const roofCol = col(rng.pick(ROOFS.kawara));
  if (two) {
    // smaller second floor block with its own roof, lower roof skirt all around
    const iw = W * 0.62, id = D * 0.7;
    const ix0 = hx - iw / 2 + rng.range(-0.5, 0.5), iz0 = z0 + 0.4;
    hipRoof(ctx, x0, z0, x1, z1, base + fh, { kind: 'kawara', color: roofCol, pitch: 0.45, ov: 0.9, edge: '#3a2e25', soffit: '#6b5a48', gutter: rng.chance(0.4), gutterCol: '#5c554c' });
    E.with(plaster, () => E.box(ix0, base + fh, iz0, ix0 + iw, base + fh * 1.95, iz0 + id, { ny: true }));
    facades(ctx, ix0, iz0, ix0 + iw, iz0 + id, 0, (len, side) => {
      for (const wv of layoutWindows(rng, len, side === 'front' ? 'front' : 'side')) windowUnit(ctx, wv.x, base + fh + 0.9, wv.w, 1.0, { frame: '#5a4636', curtain: rng.pick([1, 2, 4]), lit: rng.chance(0.15), tobukuro: side === 'front' && rng.chance(0.5) ? -1 : 0, tobukuroCol: '#4d3b2f' });
    });
    gableRoof(ctx, ix0, iz0, ix0 + iw, iz0 + id, base + fh * 1.95, { kind: 'kawara', color: roofCol, pitch: 0.5, ov: 0.75, og: 0.6, edge: '#3a2e25', soffit: '#6b5a48', gutter: false, wall: plaster });
  } else {
    gableRoof(ctx, x0, z0, x1, z1, base + fh, { kind: 'kawara', color: roofCol, pitch: 0.5, ov: 0.9, og: 0.7, edge: '#3a2e25', soffit: '#6b5a48', gutter: false, wall: plaster });
  }
  // wooden fence + gate roof, or hedge
  const fenceKind = rng.pick(['wood', 'hedge', 'block']);
  const gx = x0 + 0.95;
  if (fenceKind === 'wood') {
    E.with({ color: col('#4a3a2e'), pat: PAT.WOOD, gloss: 0.1, weather: 0.5 }, () => {
      E.box(-lw / 2, 0, -0.18, gx - 0.8, 1.7, -0.08, { ny: true });
      E.box(gx + 0.8, 0, -0.18, lw / 2, 1.7, -0.08, { ny: true });
    });
    E.with({ color: col('#3a2e25'), pat: PAT.WOOD }, () => {
      E.box(gx - 0.9, 0, -0.25, gx - 0.75, 2.2, -0.05);
      E.box(gx + 0.75, 0, -0.25, gx + 0.9, 2.2, -0.05);
    });
    E.with({ color: roofCol, pat: PAT.KAWARA, gloss: 0.5 }, () => {
      quadF(E, [gx - 1.2, 2.5, -0.15], [gx + 1.2, 2.5, -0.15], [gx + 1.2, 2.25, 0.45], [gx - 1.2, 2.25, 0.45], [0, 0, 2.4, 0, 2.4, 0.6, 0, 0.6], [0, 1, 0.3]);
      quadF(E, [gx + 1.2, 2.5, -0.15], [gx - 1.2, 2.5, -0.15], [gx - 1.2, 2.25, -0.75], [gx + 1.2, 2.25, -0.75], [0, 0, 2.4, 0, 2.4, 0.6, 0, 0.6], [0, 1, -0.3]);
    });
    E.with({ color: col('#3a2e25'), pat: PAT.WOOD }, () => E.box(gx - 1.0, 2.1, -0.25, gx + 1.0, 2.25, -0.05));
    for (let x = gx - 1.1; x < gx + 1.1; x += 0.5) ctx.drip(x, 2.23, 0.47);
    weeds(ctx, -lw / 2, lw / 2, 0.02, 0, 1.2, 0.3);
  } else if (fenceKind === 'hedge') {
    blockWall(ctx, -lw / 2, gx - 0.7, -0.3, 0.4, {});
    hedge(ctx, -lw / 2 + 0.1, gx - 0.8, -0.35, 1.5, 0.7, { color: '#3e6638' });
    blockWall(ctx, gx + 0.7, lw / 2, -0.3, 0.4, {});
    hedge(ctx, gx + 0.8, lw / 2 - 0.1, -0.35, 1.5, 0.7, { color: '#3e6638' });
  } else {
    blockWall(ctx, -lw / 2, gx - 0.7, -0.1, 1.5, { color: '#a3a39b', pierced: true });
    blockWall(ctx, gx + 0.7, lw / 2, -0.1, 1.5, { color: '#a3a39b' });
    gatePost(ctx, gx - 1.0, -0.15, 1.5, { color: '#8e8a82', lamp: true });
  }
  if (lot.drawLeft) sideBoundary(ctx, lot, -lw / 2 + 0.08, 1.4, '#a8a69e');
  if (lot.drawRight) sideBoundary(ctx, lot, lw / 2 - 0.08, 1.4, '#a8a69e');
  // garden: pine, stone lantern, shrubs
  const px = x1 - 1.2;
  E.with({ color: col('#51453b'), pat: PAT.WOOD, gloss: 0.1 }, () => E.tube([[px, 0, z1 + 1.2], [px - 0.4, 1.2, z1 + 1.3], [px + 0.3, 2.3, z1 + 1.0], [px + 0.9, 2.9, z1 + 1.4]], [0.14, 0.12, 0.09, 0.06], 6));
  for (const [dx, dy, dz, r] of [[0.9, 3.0, 0.2, 0.9], [-0.3, 2.5, -0.2, 0.8], [0.3, 1.9, 0.4, 0.7], [1.5, 2.6, 0.5, 0.6], [-0.6, 3.2, 0.3, 0.6]]) {
    clump(ctx, px + dx, dy, z1 + 1.2 + dz, r, r * 0.38, r, { tile: 'small', color: '#3b5a3a', size: 0.45, sway: 0.03, n: Math.round(r * 40) });
  }
  E.with({ color: col('#8f8d86'), pat: PAT.STONE, gloss: 0.2 }, () => {
    const lx = x1 - 3.0, lz = z1 + 1.3;
    E.cyl(lx, 0, lz, 0.18, 0.7, 6);
    E.box(lx - 0.28, 0.7, lz - 0.28, lx + 0.28, 1.0, lz + 0.28);
    E.cyl(lx, 1.0, lz, 0.42, 0.15, 6, true, 0.05);
  });
  for (let i = 0; i < 4; i++) bush(ctx, rng.range(-lw / 2 + 0.8, lw / 2 - 0.8), 0.02, rng.range(z1 + 0.6, -0.8), rng.range(0.35, 0.6), { color: '#44683c' });
  if (rng.chance(0.6)) hydrangea(ctx, x0 + 3.0, 0.02, z1 + 0.9, 0.55);
  tree(ctx, x0 - 0.9 + (lw / 2 + x0 > 1.5 ? 0 : 1.2), 0, z0 + 1.0, { h: rng.range(5, 7), crown: 1.8, color: '#3f6a3a' });
  if (lowland) void 0;
}

// Small helper so other modules can fill a strip with shrubs
export function shrubRow(ctx, x0, x1, z, rng) {
  for (let x = x0; x < x1; x += rng.range(0.7, 1.3)) bush(ctx, x, 0.02, z, rng.range(0.3, 0.5));
}

export { WALLS, ROOFS, wallMat };
void THREE;
void FRAME_COLS;
