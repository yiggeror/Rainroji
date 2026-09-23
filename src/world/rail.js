import * as THREE from 'three';
import { PAT, Emitter, Sink } from '../builder.js';
import { col } from '../util.js';
import { quv } from './atlas.js';
import { RAIL, SEA } from './layout.js';
import { quadF } from './parts.js';
import { meshFence } from './props.js';
import { grass, bush } from './plants.js';
import { vendingMachine, bench, bicycle } from './props.js';

// ---------------------------------------------------------------------------
// Railway line, level crossing with gates and warning lights, passing trains
// ---------------------------------------------------------------------------
const TOP = 0.2; // rail head height (road ramps up at the crossing)

// rail head height along the line: level through the town, rising onto the sea bridge
export function railY(x) {
  const t = Math.min(1, Math.max(0, (x - RAIL.shore) / 150));
  return TOP + 5.6 * t * t * (3 - 2 * t);
}

export function buildRail(ctx) {
  const E = ctx.E, rng = ctx.rng;
  const X0 = RAIL.portal - 2, X1 = RAIL.shore;
  // ---- land section: ballast bed, sleepers, rails -------------------------------
  for (let x = X0; x < X1; x += 20) {
    const xb = Math.min(X1, x + 20);
    ctx.chunk((x + xb) / 2, RAIL.z);
    E.with({ color: col('#7d776d'), pat: PAT.GRAVEL, gloss: 0.15, weather: 0 }, () => {
      const z0 = -118.6, z1 = -127.4;
      E.quad([x, 0.06, z0 - 0.9], [xb, 0.06, z0 - 0.9], [xb, 0.06, z1 + 0.9], [x, 0.06, z1 + 0.9], null, [0, 1, 0]);
      E.quad([x, -0.02, z0], [xb, -0.02, z0], [xb, 0.06, z0 - 0.9], [x, 0.06, z0 - 0.9], null, [0, 1, 0]);
      E.quad([x, 0.06, z1 + 0.9], [xb, 0.06, z1 + 0.9], [xb, -0.02, z1], [x, -0.02, z1], null, [0, 1, 0]);
    });
    for (const tz of RAIL.tracks) {
      E.with({ color: col('#a9a69d'), pat: PAT.CONCRETE, gloss: 0.2, weather: 0.3 }, () => {
        for (let sx = x + 0.3; sx < xb; sx += 0.62) E.box(sx - 0.1, 0.02, tz - 1.05, sx + 0.1, 0.1, tz + 1.05, { ny: true });
      });
      E.with({ color: col('#5b534c'), pat: PAT.RUST, gloss: 0.3 }, () => {
        for (const o of [-0.53, 0.53]) E.box(x, 0.09, tz + o - 0.035, xb, TOP - 0.02, tz + o + 0.035, { ny: true, py: true });
      });
      E.with({ color: col('#c4c7c9'), pat: PAT.METAL, gloss: 0.95, weather: 0 }, () => {
        for (const o of [-0.53, 0.53]) E.box(x, TOP - 0.02, tz + o - 0.035, xb, TOP, tz + o + 0.035, { ny: true });
      });
    }
  }
  // ---- fences along the line (openings: crossing, station path) ----------------------
  const fenceRuns = [
    [-117.3, [[X0 + 1, RAIL.platform[0] - 1], [RAIL.platform[1] + 10.6, 1.5], [10.5, X1]]],
    [-128.7, [[X0 + 1, RAIL.platform[0] - 1], [RAIL.platform[1] + 10.6, 1.5], [10.5, X1]]],
  ];
  for (const [z, runs] of fenceRuns) {
    for (const [a, b] of runs) {
      for (let x = a; x < b - 0.5; x += 30) {
        const xb = Math.min(b, x + 30);
        ctx.chunk((x + xb) / 2, z);
        E.frame(0, 0, z, 0, () => meshFence(ctx, x, xb, 0, 1.4, '#5d6a62'));
      }
    }
  }
  // weeds along the fences and the ballast edge
  for (let i = 0; i < 260; i++) {
    const x = rng.range(X0 + 2, X1);
    if (x > 1 && x < 11) continue;
    if (x > RAIL.platform[0] - 2 && x < RAIL.platform[1] + 11) continue;
    const z = rng.chance(0.5) ? rng.range(-117.8, -116.2) : rng.range(-129.9, -128.3);
    ctx.chunk(x, z);
    grass(ctx, x, 0.0, z, rng.range(0.3, 0.8), { n: 3 });
  }
  // ---- catenary masts & wires (land + bridge) ----------------------------------------
  const masts = [];
  for (let x = X0 + 4; x <= 900; x += x < X1 ? 48 : 40) masts.push(x);
  for (const x of masts) {
    const y = railY(x) - TOP;
    ctx.chunk(x, -128);
    E.with({ color: col('#7f8487'), pat: PAT.METAL, gloss: 0.4, weather: 0.3 }, () => {
      E.box(x - 0.12, y, -128.3 - 0.12, x + 0.12, y + 7.4, -128.3 + 0.12);
      E.box(x - 0.08, y + 6.8, -128.3, x + 0.08, y + 6.95, -119.8);
      E.beam([x, y + 5.2, -128.2], [x, y + 6.8, -124.0], 0.07);
      E.box(x - 0.04, y + 5.9, -126.0, x + 0.04, y + 6.8, -125.9);
      E.box(x - 0.04, y + 5.9, -122.9, x + 0.04, y + 6.8, -122.8);
    });
  }
  for (let i = 0; i < masts.length - 1; i++) {
    const a = masts[i], b = masts[i + 1];
    ctx.chunk((a + b) / 2, RAIL.z);
    for (const tz of RAIL.tracks) {
      const pts = [], mp = [];
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        const x = a + (b - a) * t, y = railY(x) - TOP;
        const zig = k % 2 ? 0.15 : -0.15;
        pts.push([x, y + 5.15, tz + zig * 0.3]);
        mp.push([x, y + 6.1 - 0.5 * 4 * t * (1 - t), tz]);
      }
      E.with({ color: col('#4a3f36'), pat: PAT.METAL, gloss: 0.6 }, () => {
        E.tube(pts, 0.008, 3);
        E.tube(mp, 0.01, 3);
        for (let k = 1; k < 10; k += 2) E.box(mp[k][0] - 0.004, pts[k][1], tz - 0.004, mp[k][0] + 0.004, mp[k][1], tz + 0.004);
      });
    }
  }

  // ---- tunnel portal in the ridge --------------------------------------------------------
  ctx.chunk(RAIL.portal, RAIL.z);
  E.frame(RAIL.portal, 0, RAIL.z, 0, () => {
    // head wall facing east (+x) with an arched opening
    const hw = 7.5, H = 11, rA = 4.6, spring = 4.2;
    E.with({ color: col('#a09d94'), pat: PAT.CONCRETE, gloss: 0.2, weather: 1.0, vbase: 0 }, () => {
      const arch = [];
      for (let i = 0; i <= 16; i++) {
        const a = (i / 16) * Math.PI;
        arch.push([Math.cos(a) * rA, spring + Math.sin(a) * rA]);
      }
      // face strips between the arch and the outline
      for (let i = 0; i < 16; i++) {
        const [z0, y0] = arch[i], [z1, y1] = arch[i + 1];
        quadF(E, [0, y0, -z0], [0, y1, -z1], [0, H, -z1 * (hw / rA)], [0, H, -z0 * (hw / rA)], null, [1, 0, 0]);
      }
      quadF(E, [0, -0.5, rA], [0, -0.5, hw], [0, H, hw], [0, spring, rA], null, [1, 0, 0]);
      quadF(E, [0, -0.5, -hw], [0, -0.5, -rA], [0, spring, -rA], [0, H, -hw], null, [1, 0, 0]);
      E.box(-5.5, H, -hw - 0.3, 0.3, H + 0.6, hw + 0.3);
      // the portal is a thick block: its sides reach back into the hill
      for (const sz of [-1, 1]) E.box(-5.5, -0.5, sz > 0 ? rA : -hw - 0.3, 0, H, sz > 0 ? hw + 0.3 : -rA, { px: true });
      E.box(-5.5, spring + rA, -rA, 0, H, rA, { px: true, ny: true });
      // wing walls
      E.box(-6, -0.5, hw, 0.3, H * 0.8, hw + 0.8);
      E.box(-6, -0.5, -hw - 0.8, 0.3, H * 0.8, -hw);
    });
    // name plate
    E.with({ color: col('#2d2f30'), pat: PAT.PLAIN, gloss: 0.3 }, () => E.box(0.02, spring + rA + 0.6, -1.1, 0.08, spring + rA + 1.3, 1.1));
    // the bore: dark lining receding into the hill
    E.with({ color: col('#2a2927'), pat: PAT.CONCRETE, gloss: 0.3, weather: 0.5 }, () => {
      const L = 160;
      for (let i = 0; i < 16; i++) {
        const a0 = (i / 16) * Math.PI, a1 = ((i + 1) / 16) * Math.PI;
        const p = (a, x) => [x, spring + Math.sin(a) * rA, -Math.cos(a) * rA];
        quadF(E, p(a0, 0), p(a1, 0), p(a1, -L), p(a0, -L), null, [0, -Math.sin((a0 + a1) / 2), Math.cos((a0 + a1) / 2)]);
      }
      quadF(E, [0, -0.5, -rA], [0, spring, -rA], [-L, spring, -rA], [-L, -0.5, -rA], null, [0, 0, 1]);
      quadF(E, [0, -0.5, rA], [0, spring, rA], [-L, spring, rA], [-L, -0.5, rA], null, [0, 0, -1]);
      quadF(E, [-L, -0.5, -rA], [-L, -0.5, rA], [-L, spring + rA, rA], [-L, spring + rA, -rA], null, [1, 0, 0]);
    });
    E.with({ color: col('#4a453e'), pat: PAT.GRAVEL, gloss: 0.1 }, () => quadF(E, [0, 0.05, -rA], [0, 0.05, rA], [-160, 0.05, rA], [-160, 0.05, -rA], null, [0, 1, 0]));
    E.with({ color: col('#6b6862'), pat: PAT.METAL, gloss: 0.8 }, () => {
      for (const tz of RAIL.tracks) for (const o of [-0.53, 0.53]) E.box(-160, 0.09, tz - RAIL.z + o - 0.035, 0, TOP, tz - RAIL.z + o + 0.035);
    });
    ctx.solid(-5.5, -0.5, -hw - 1, 0.3, H + 0.6, -rA);
    ctx.solid(-5.5, -0.5, rA, 0.3, H + 0.6, hw + 1);
    ctx.solid(-5.5, spring + rA * 0.8, -rA, 0.3, H + 0.6, rA);
    // ivy and weeds over the portal
    for (let i = 0; i < 14; i++) grass(ctx, rng.range(-1, 0.3), H + 0.6, rng.range(-hw, hw), rng.range(0.3, 0.7), { n: 3 });
  });

  // ---- the sea bridge: girders on piers running out into the mist ------------------------
  for (let x = X1; x < 1200; x += 32) {
    const xb = x + 32;
    const ya = railY(x) - TOP, yb = railY(xb) - TOP;
    ctx.chunk(x + 16, RAIL.z);
    const far = x > 420;
    // deck girders
    E.with({ color: col('#6d6a66'), pat: PAT.METAL, gloss: 0.35, weather: 0.6 }, () => {
      for (const z of [-126.2, -119.8]) quadF(E, [x, ya - 1.6, z], [xb, yb - 1.6, z], [xb, yb + 0.05, z], [x, ya + 0.05, z], null, [0, 0, z > RAIL.z ? 1 : -1]);
      quadF(E, [x, ya - 1.6, -126.2], [xb, yb - 1.6, -126.2], [xb, yb - 1.6, -119.8], [x, ya - 1.6, -119.8], null, [0, -1, 0]);
    });
    E.with({ color: col('#8d8a84'), pat: PAT.CONCRETE, gloss: 0.2, weather: 0.5 }, () => quadF(E, [x, ya + 0.05, -126.3], [xb, yb + 0.05, -126.3], [xb, yb + 0.05, -119.7], [x, ya + 0.05, -119.7], null, [0, 1, 0]));
    if (!far) {
      E.with({ color: col('#c4c7c9'), pat: PAT.METAL, gloss: 0.9 }, () => {
        for (const tz of RAIL.tracks) for (const o of [-0.53, 0.53]) quadF(E, [x, ya + TOP, tz + o], [xb, yb + TOP, tz + o], [xb, yb + TOP, tz + o + 0.07], [x, ya + TOP, tz + o + 0.07], null, [0, 1, 0]);
      });
      // parapet rails
      E.with({ color: col('#9ea1a3'), pat: PAT.METAL, gloss: 0.5 }, () => {
        for (const z of [-126.25, -119.75]) E.beam([x, ya + 1.1, z], [xb, yb + 1.1, z], 0.06);
        for (let px = x; px < xb; px += 4) {
          const py = railY(px) - TOP;
          for (const z of [-126.25, -119.75]) E.box(px - 0.04, py, z - 0.04, px + 0.04, py + 1.1, z + 0.04);
        }
      });
    }
    // pier
    E.with({ color: col('#a3a098'), pat: PAT.CONCRETE, gloss: 0.25, weather: 0.9, vbase: SEA - 4 }, () => {
      for (const z of [-124.8, -121.2]) E.cyl(xb, SEA - 4, z, 1.0, yb - 1.6 - (SEA - 4), 10);
      E.box(xb - 1.1, yb - 2.4, -126.4, xb + 1.1, yb - 1.6, -119.6);
    });
    E.with({ color: col('#4f5446'), pat: PAT.CONCRETE, gloss: 0.5 }, () => {
      for (const z of [-124.8, -121.2]) E.cyl(xb, SEA - 0.3, z, 1.02, 0.8, 10, false);
    });
    if (x < 400) ctx.solid(x, ya - 1.6, -126.3, xb, ya + 0.1, -119.7);
  }
  // abutment where the bridge leaves the island
  ctx.chunk(X1 + 4, RAIL.z);
  E.with({ color: col('#a8a59c'), pat: PAT.CONCRETE, gloss: 0.2, weather: 0.9, vbase: SEA - 4 }, () => E.box(X1 - 2, SEA - 4, -127.8, X1 + 6, 0.1, -118.2, { ny: true }));
  ctx.solidWorld(X1 - 2, SEA - 4, -127.8, X1 + 6, 0.1, -118.2);

  buildStation(ctx);

  // --- level crossing on the main street (x ~ 6) ---------------------------------
  ctx.chunk(6, RAIL.z);
  E.with({ color: col('#57585a'), pat: PAT.PLAIN, gloss: 0.5 }, () => {
    // rubber/concrete crossing deck flush with the rails
    E.box(3.45, 0, -127.6, 8.55, TOP - 0.005, -118.4, { ny: true });
  });
  E.with({ color: col('#e8e8e2'), pat: PAT.PAINT, gloss: 0.5 }, () => {
    E.box(3.5, TOP - 0.004, -127.6, 3.62, TOP + 0.001, -118.4);
    E.box(8.38, TOP - 0.004, -127.6, 8.5, TOP + 0.001, -118.4);
  });
  E.with({ color: col('#5a5d61'), pat: PAT.ASPHALT, param: 0, gloss: 0.5 }, () => {
    E.quad([3.45, 0.004, -116.6], [8.55, 0.004, -116.6], [8.55, TOP - 0.005, -118.4], [3.45, TOP - 0.005, -118.4], null, [0, 1, 0]);
    E.quad([3.45, TOP - 0.005, -127.6], [8.55, TOP - 0.005, -127.6], [8.55, 0.004, -129.4], [3.45, 0.004, -129.4], null, [0, 1, 0]);
  });
  // stop lines + crossing warning paint
  ctx.inSink('ground', () => {
    E.with({ color: col('#e8e8e2'), pat: PAT.PAINT, gloss: 0.5 }, () => {
      E.box(3.9, 0.0, -115.5, 6.0, 0.01, -115.05);
      E.box(6.0, 0.0, -130.95, 8.1, 0.01, -130.5);
    });
  });
  const gates = [];
  // warning signals + gate machines: south side (x=3.1,z=-116.8) and north side (x=8.9,z=-129.2)
  const units = [
    { x: 3.05, z: -116.9, face: Math.PI, gate: 1 },
    { x: 8.95, z: -129.1, face: 0, gate: -1 },
  ];
  for (const u of units) {
    E.frame(u.x, 0, u.z, u.face, () => {
      // signal pole
      E.with({ color: col('#1b1b1b'), pat: PAT.PLAIN, gloss: 0.4 }, () => E.cyl(0, 0, 0, 0.07, 3.6, 8));
      E.with({ color: col('#e9c21c'), pat: PAT.PLAIN, gloss: 0.4 }, () => {
        for (let k = 0; k < 6; k++) E.cyl(0, 0.3 + k * 0.5, 0, 0.072, 0.25, 8);
      });
      // crossbuck
      ctx.inSink('atlas', () => {
        const r = ctx.atlasRects.crossbuck;
        E.with({ color: col('#ffffff'), pat: PAT.PLAIN, gloss: 0.3 }, () => {
          E.quad([-0.55, 3.2, 0.09], [0.55, 3.2, 0.09], [0.55, 4.3, 0.09], [-0.55, 4.3, 0.09], quv(r), [0, 0, 1]);
          E.quad([0.55, 3.2, -0.09], [-0.55, 3.2, -0.09], [-0.55, 4.3, -0.09], [0.55, 4.3, -0.09], quv(r), [0, 0, -1]);
        });
        const f = ctx.atlasRects.fumikiri;
        E.with({ color: col('#ffffff'), pat: PAT.PLAIN, gloss: 0.3 }, () => E.quad([-0.3, 1.6, 0.08], [0.3, 1.6, 0.08], [0.3, 2.2, 0.08], [-0.3, 2.2, 0.08], quv(f), [0, 0, 1]));
      });
      // twin red lamps on a bar (both faces)
      E.with({ color: col('#1b1b1b'), pat: PAT.PLAIN, gloss: 0.4 }, () => {
        E.box(-0.62, 2.75, -0.05, 0.62, 2.85, 0.05);
        for (const s of [-1, 1]) {
          E.cyl(s * 0.45, 2.55, 0, 0.2, 0.5, 12);
          E.box(s * 0.45 - 0.22, 2.9, -0.28, s * 0.45 + 0.22, 2.95, 0.28);
        }
      });
      for (const [s, fid] of [[-1, 4], [1, 5]]) {
        E.with({ color: col('#ff2a1a'), pat: PAT.EMIT, emit: 3.0, ex1: fid }, () => {
          for (const zf of [0.205, -0.205]) {
            const g = new THREE.CircleGeometry(0.15, 14);
            const m = new THREE.Matrix4().makeTranslation(s * 0.45, 2.8, zf);
            if (zf < 0) m.multiply(new THREE.Matrix4().makeRotationY(Math.PI));
            E.geom(g, m);
          }
        });
        ctx.crossLamps.push({ p: ctx.toWorld(s * 0.45, 2.8, 0.4), fid });
      }
      // gate machine (box) + arm pivot
      E.with({ color: col('#e9c21c'), pat: PAT.METAL, gloss: 0.4, weather: 0.3 }, () => E.box(0.35, 0, -0.25, 0.75, 1.1, 0.25));
      E.with({ color: col('#1b1b1b'), pat: PAT.PLAIN }, () => E.box(0.33, 0.35, -0.26, 0.77, 0.45, 0.26));
      gates.push({ pivot: ctx.toWorld(0.55, 0.95, 0.3), rot: u.face + Math.PI, dir: u.gate });
    });
  }
  // arms are separate meshes so they can rotate
  const armGroup = new THREE.Group();
  const aE = new Emitter();
  const aSink = new Sink('arm');
  aE.sink = aSink;
  aE.with({ color: col('#e9c21c'), pat: PAT.PLAIN, gloss: 0.5 }, () => aE.box(0, -0.05, -0.05, 5.0, 0.05, 0.05));
  aE.with({ color: col('#1b1b1b'), pat: PAT.PLAIN, gloss: 0.5 }, () => {
    for (let x = 0.4; x < 5; x += 0.8) aE.box(x, -0.055, -0.055, x + 0.4, 0.055, 0.055);
  });
  aE.with({ color: col('#3a3a3a'), pat: PAT.PLAIN }, () => aE.box(-0.6, -0.1, -0.1, 0, 0.1, 0.1));
  const armGeo = aSink.toGeometry();
  ctx.gateSpecs = gates.map((g) => ({ ...g, geo: armGeo }));
  ctx.gateGroup = armGroup;
  void rng;
}

// ---------------------------------------------------------------------------
// Commuter EMU (4 cars, stainless with a green band). Each car is its own
// geometry so it can sit on the rails at its own bogies (the line climbs onto
// the sea bridge). Local frame per car: x along the car (-L/2..L/2), y = 0 at
// the rail head, z across. cab: +1 = driving cab at +x, -1 = at -x, 0 = none.
// Windows are real openings with a lit interior behind clear glass.
// ---------------------------------------------------------------------------
export const TRAIN = { cars: 4, L: 19.5, gap: 0.5, W: 2.9, H: 3.65 };
const STRAP_RING = new THREE.TorusGeometry(0.055, 0.01, 4, 10);
TRAIN.length = TRAIN.cars * (TRAIN.L + TRAIN.gap) - TRAIN.gap;

function buildCar(cab, pantograph) {
  const E = new Emitter();
  const sink = new Sink('car'), glass = new Sink('carGlass');
  E.sink = sink;
  const { L, W, H } = TRAIN;
  const hw = W / 2, x0 = -L / 2, x1 = L / 2;
  const FL = 1.12, CE = 3.28; // interior floor / ceiling
  const WB = 2.3, WT = 3.12; // window bottom / top
  const IN = 0.3;
  const body = { color: col('#cdd1d5'), pat: PAT.PLAIN, gloss: 0.75, weather: 0 };
  const inner = { color: col('#dcd8cc'), pat: PAT.PLAIN, gloss: 0.2, emit: IN, weather: 0 };
  const doors = [-7.5, -2.5, 2.5, 7.5];
  const DW = 0.66; // half door width
  // window openings along the side (x ranges)
  const cabLen = 1.9;
  const ea = cab < 0 ? x0 + cabLen : x0 + 0.35, eb = cab > 0 ? x1 - cabLen : x1 - 0.35;
  const wins = [];
  const addSpan = (a, b) => {
    if (b - a < 0.6) return;
    if (b - a > 2.2) {
      const m = (a + b) / 2;
      wins.push([a, m - 0.05], [m + 0.05, b]);
    } else wins.push([a, b]);
  };
  addSpan(ea + 0.25, doors[0] - DW - 0.35);
  for (let i = 0; i < doors.length - 1; i++) addSpan(doors[i] + DW + 0.35, doors[i + 1] - DW - 0.35);
  addSpan(doors[3] + DW + 0.35, eb - 0.25);

  for (const s of [-1, 1]) {
    const zo = s * hw, zi = s * (hw - 0.06);
    const face = [0, 0, s], faceIn = [0, 0, -s];
    const wall = (a, b, y0, y1) => {
      E.with(body, () => quadF(E, [a, y0, zo], [b, y0, zo], [b, y1, zo], [a, y1, zo], null, face));
      E.with(inner, () => quadF(E, [a, Math.max(y0, FL), zi], [b, Math.max(y0, FL), zi], [b, Math.min(y1, CE), zi], [a, Math.min(y1, CE), zi], null, faceIn));
    };
    // solid wall = the car side minus doors (and minus windows in the window band)
    const minus = (ranges, holes) => {
      let out = ranges;
      for (const [ha, hb] of holes) {
        const next = [];
        for (const [a, b] of out) {
          if (hb <= a || ha >= b) next.push([a, b]);
          else {
            if (ha > a) next.push([a, ha]);
            if (hb < b) next.push([hb, b]);
          }
        }
        out = next;
      }
      return out;
    };
    const doorHoles = doors.map((dx) => [dx - DW, dx + DW]);
    wall(x0, x1, 0.95, 1.0);
    for (const [a, b] of minus([[x0, x1]], doorHoles)) wall(a, b, 1.0, WB);
    for (const [a, b] of minus([[x0, x1]], [...doorHoles, ...wins])) wall(a, b, WB, WT);
    wall(x0, x1, WT, H);
    for (const [a, b] of wins) {
      // reveals (window frame depth) + glass
      E.with({ color: col('#9ea3a8'), pat: PAT.METAL, gloss: 0.6, emit: 0.1 }, () => {
        quadF(E, [a, WB, zo], [b, WB, zo], [b, WB, zi], [a, WB, zi], null, [0, 1, 0]);
        quadF(E, [a, WT, zo], [b, WT, zo], [b, WT, zi], [a, WT, zi], null, [0, -1, 0]);
        quadF(E, [a, WB, zo], [a, WT, zo], [a, WT, zi], [a, WB, zi], null, [1, 0, 0]);
        quadF(E, [b, WB, zo], [b, WT, zo], [b, WT, zi], [b, WB, zi], null, [-1, 0, 0]);
      });
      E.sink = glass;
      E.quad([a, WB, s * (hw - 0.02)], [b, WB, s * (hw - 0.02)], [b, WT, s * (hw - 0.02)], [a, WT, s * (hw - 0.02)], [0, 0, (b - a) / 2, 0, (b - a) / 2, (WT - WB) / 2, 0, (WT - WB) / 2], [0, 0, s]);
      E.sink = sink;
    }
    // band stripes: green under the windows, thin green at the cant rail
    E.with({ color: col('#2e8b57'), pat: PAT.PLAIN, gloss: 0.6 }, () => {
      for (const [a, b] of minus([[x0, x1]], doorHoles)) quadF(E, [a, 2.08, zo + s * 0.004], [b, 2.08, zo + s * 0.004], [b, 2.26, zo + s * 0.004], [a, 2.26, zo + s * 0.004], null, face);
      quadF(E, [x0, 3.36, zo + s * 0.004], [x1, 3.36, zo + s * 0.004], [x1, 3.42, zo + s * 0.004], [x0, 3.42, zo + s * 0.004], null, face);
    });
    // doors: two stainless leaves, each with a real window you can look through
    const zd = zo + s * 0.012;
    for (const dx of doors) {
      for (const [la, lb] of [[dx - DW, dx - 0.012], [dx + 0.012, dx + DW]]) {
        const wa = (la + lb) / 2 - 0.2, wb = (la + lb) / 2 + 0.2, wy0 = 2.15, wy1 = 3.0;
        const pieces = [[la, lb, 1.0, wy0], [la, lb, wy1, 3.2], [la, wa, wy0, wy1], [wb, lb, wy0, wy1]];
        for (const [a, b, y0, y1] of pieces) {
          E.with({ color: col('#bfc4c8'), pat: PAT.METAL, gloss: 0.8 }, () => quadF(E, [a, y0, zd], [b, y0, zd], [b, y1, zd], [a, y1, zd], null, face));
          E.with({ color: col('#d8d5cc'), pat: PAT.PLAIN, emit: IN, gloss: 0.4 }, () => quadF(E, [a, Math.max(y0, FL), zi], [b, Math.max(y0, FL), zi], [b, y1, zi], [a, y1, zi], null, faceIn));
        }
        E.sink = glass;
        E.quad([wa, wy0, zo], [wb, wy0, zo], [wb, wy1, zo], [wa, wy1, zo], [0, 0, 0.2, 0, 0.2, 0.42, 0, 0.42], [0, 0, s]);
        E.sink = sink;
        E.with({ color: col('#8d9296'), pat: PAT.METAL, gloss: 0.5 }, () => {
          quadF(E, [wa, wy0, zd], [wb, wy0, zd], [wb, wy0, zi], [wa, wy0, zi], null, [0, 1, 0]);
          quadF(E, [wa, wy1, zd], [wb, wy1, zd], [wb, wy1, zi], [wa, wy1, zi], null, [0, -1, 0]);
        });
      }
      // door frame seams + the gap between the leaves
      E.with({ color: col('#5f6468'), pat: PAT.PLAIN, gloss: 0.4 }, () => {
        E.box(dx - DW - 0.03, 1.0, zo - s * 0.002, dx - DW, 3.22, zo + s * 0.016);
        E.box(dx + DW, 1.0, zo - s * 0.002, dx + DW + 0.03, 3.22, zo + s * 0.016);
        E.box(dx - DW - 0.03, 3.2, zo - s * 0.002, dx + DW + 0.03, 3.23, zo + s * 0.016);
        E.box(dx - 0.012, 1.0, zo - s * 0.002, dx + 0.012, 3.2, zo + s * 0.014);
      });
      E.with({ color: col('#e2b92c'), pat: PAT.PLAIN, emit: IN }, () => E.box(dx - DW, FL, zi - s * 0.5, dx + DW, FL + 0.005, zi));
      // grab poles beside the door
      E.with({ color: col('#c9ccce'), pat: PAT.METAL, gloss: 0.9, emit: 0.2 }, () => {
        for (const ox of [-DW - 0.28, DW + 0.28]) E.cyl(dx + ox, FL, zi - s * 0.28, 0.02, CE - FL, 6, false);
      });
    }
    // long bench seats between the doors (blue moquette), the end ones in priority colours
    const benches = [];
    benches.push([ea + 0.15, doors[0] - DW - 0.35, true]);
    for (let i = 0; i < 3; i++) benches.push([doors[i] + DW + 0.35, doors[i + 1] - DW - 0.35, false]);
    benches.push([doors[3] + DW + 0.35, eb - 0.15, true]);
    for (const [a, b, prio] of benches) {
      if (b - a < 0.8) continue;
      const seat = col(prio ? '#c26a3a' : '#35589a');
      E.with({ color: col('#8f959a'), pat: PAT.METAL, gloss: 0.5, emit: IN * 0.6 }, () => E.box(a, FL, zi - s * 0.5, b, FL + 0.3, zi, { ny: true }));
      E.with({ color: seat, pat: PAT.PLAIN, gloss: 0.15, emit: IN * 0.8 }, () => {
        E.box(a + 0.03, FL + 0.3, zi - s * 0.52, b - 0.03, FL + 0.45, zi, { ny: true });
        E.box(a + 0.03, FL + 0.45, zi - s * 0.13, b - 0.03, WB - 0.08, zi, { ny: true });
      });
      // seat dividers (standing poles in the middle of long benches)
      if (b - a > 3) E.with({ color: col('#c9ccce'), pat: PAT.METAL, gloss: 0.9, emit: 0.2 }, () => E.cyl((a + b) / 2, FL + 0.45, zi - s * 0.5, 0.018, CE - FL - 0.45, 6, false));
      // luggage rack above the seats
      E.with({ color: col('#aeb3b7'), pat: PAT.GRATE, gloss: 0.5, emit: IN * 0.5 }, () => E.box(a, WT + 0.02, zi - s * 0.34, b, WT + 0.04, zi));
      // hand straps hanging from a rail in front of the rack
      E.with({ color: col('#c9ccce'), pat: PAT.METAL, gloss: 0.9, emit: 0.2 }, () => E.box(a, 2.98, zi - s * 0.46, b, 3.0, zi - s * 0.44));
      for (let hx = a + 0.25; hx < b - 0.15; hx += 0.42) {
        E.with({ color: col('#e8e6de'), pat: PAT.PLAIN, emit: IN * 0.7 }, () => E.box(hx - 0.012, 2.72, zi - s * 0.455, hx + 0.012, 2.98, zi - s * 0.445));
        E.with({ color: col(prio ? '#e0b030' : '#f2f1ec'), pat: PAT.PLAIN, emit: IN * 0.7 }, () => E.geom(STRAP_RING, new THREE.Matrix4().makeTranslation(hx, 2.665, zi - s * 0.45)));
      }
      // advertising frames above the windows
      for (let ax = a + 0.2; ax < b - 0.7; ax += 0.95) {
        E.with({ color: col(['#f2d7a0', '#c9e0f0', '#f0c8c8', '#d8ecd0'][Math.floor(Math.abs(ax * 7)) % 4]), pat: PAT.PLAIN, emit: IN * 0.9 }, () => quadF(E, [ax, 3.08, zi - s * 0.36], [ax + 0.75, 3.08, zi - s * 0.36], [ax + 0.75, 3.24, zi - s * 0.3], [ax, 3.24, zi - s * 0.3], null, [0, -0.3, -s]));
      }
    }
  }
  // floor, ceiling with light strips, end walls with gangway doors
  E.with({ color: col('#8d8a80'), pat: PAT.PLAIN, gloss: 0.3, emit: IN * 0.7 }, () => quadF(E, [x0, FL, -hw], [x1, FL, -hw], [x1, FL, hw], [x0, FL, hw], null, [0, 1, 0]));
  E.with({ color: col('#f1f0eb'), pat: PAT.PLAIN, emit: IN * 1.1 }, () => quadF(E, [x0, CE, -hw], [x1, CE, -hw], [x1, CE, hw], [x0, CE, hw], null, [0, -1, 0]));
  E.with({ color: col('#fbf8ee'), pat: PAT.EMIT, emit: 1.25 }, () => {
    for (const z of [-0.55, 0.55]) E.box(x0 + 0.5, CE - 0.04, z - 0.07, x1 - 0.5, CE, z + 0.07, { py: true });
  });
  for (const [ex, sg] of [[x0 + 0.02, 1], [x1 - 0.02, -1]]) {
    if ((sg > 0 && cab < 0) || (sg < 0 && cab > 0)) continue;
    E.with({ color: col('#dcd8cc'), pat: PAT.PLAIN, emit: IN }, () => quadF(E, [ex, FL, -hw], [ex, FL, hw], [ex, CE, hw], [ex, CE, -hw], null, [sg, 0, 0]));
    E.with({ color: col('#a7abaf'), pat: PAT.METAL, gloss: 0.6, emit: IN * 0.6 }, () => E.box(ex - 0.01, FL, -0.45, ex + 0.01, 3.0, 0.45));
    E.with({ color: col('#2a3138'), pat: PAT.PLAIN, gloss: 0.9, emit: 0.3 }, () => E.box(ex - 0.015, 2.1, -0.25, ex + 0.015, 2.85, 0.25));
    // gangway bellows to the next car (outside)
    const gx = sg > 0 ? x0 : x1;
    E.with({ color: col('#2c2e30'), pat: PAT.PLAIN, gloss: 0.2 }, () => E.box(gx - 0.25, 1.0, -0.6, gx + 0.25, 3.05, 0.6));
  }
  // end walls outside (the ends between cars)
  E.with(body, () => {
    for (const [ex, sg] of [[x0, -1], [x1, 1]]) {
      if ((sg < 0 && cab < 0) || (sg > 0 && cab > 0)) continue;
      quadF(E, [ex, 0.95, -hw], [ex, 0.95, hw], [ex, H, hw], [ex, H, -hw], null, [sg, 0, 0]);
    }
  });
  // roof: slightly domed, with AC units and conduits
  E.with({ color: col('#a3a8ad'), pat: PAT.PLAIN, gloss: 0.5, weather: 0.1 }, () => {
    quadF(E, [x0, H, -hw], [x1, H, -hw], [x1, H + 0.14, -hw + 0.5], [x0, H + 0.14, -hw + 0.5], null, [0, 1, -0.3]);
    quadF(E, [x0, H + 0.14, hw - 0.5], [x1, H + 0.14, hw - 0.5], [x1, H, hw], [x0, H, hw], null, [0, 1, 0.3]);
    quadF(E, [x0, H + 0.14, -hw + 0.5], [x1, H + 0.14, -hw + 0.5], [x1, H + 0.14, hw - 0.5], [x0, H + 0.14, hw - 0.5], null, [0, 1, 0]);
  });
  E.with({ color: col('#c3c7ca'), pat: PAT.METAL, gloss: 0.5 }, () => {
    for (const ax of [-5.5, 5.5]) E.box(ax - 1.4, H + 0.14, -0.8, ax + 1.4, H + 0.55, 0.8);
  });
  E.with({ color: col('#34383b'), pat: PAT.GRATE, gloss: 0.3 }, () => {
    for (const ax of [-5.5, 5.5]) E.box(ax - 1.1, H + 0.555, -0.55, ax + 1.1, H + 0.56, 0.55);
  });
  if (pantograph) {
    E.with({ color: col('#3a3c3e'), pat: PAT.METAL, gloss: 0.4 }, () => {
      E.box(-1.0, H + 0.14, -0.7, 1.0, H + 0.3, 0.7);
      E.beam([-0.9, H + 0.3, 0], [0, H + 1.25, 0], 0.05);
      E.beam([0.9, H + 0.3, 0], [0, H + 1.25, 0], 0.05);
      E.box(-0.12, H + 1.25, -0.85, 0.12, H + 1.31, 0.85);
    });
  }
  // underframe: skirt, equipment boxes, bogies with wheels
  E.with({ color: col('#2e3134'), pat: PAT.PLAIN, gloss: 0.3 }, () => {
    E.box(x0 + 0.4, 0.55, -hw + 0.15, x1 - 0.4, 0.95, hw - 0.15, { py: true });
    for (const ex of [-4.5, -1.5, 2.2, 4.8]) E.box(ex - 1.0, 0.42, -1.1, ex + 1.0, 0.56, 1.1);
    for (const bx of [x0 + 2.5, x1 - 2.5]) {
      E.box(bx - 1.25, 0.25, -1.2, bx + 1.25, 0.62, 1.2);
      for (const wx of [-0.95, 0.95]) for (const wz of [-0.72, 0.72]) E.frameM(new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(bx + wx, 0.43, wz), () => E.cyl(0, -0.07, 0, 0.43, 0.14, 12));
    }
  });
  // --- driving cab ---------------------------------------------------------------------------
  if (cab) {
    const cx = cab > 0 ? x1 : x0, sg = cab;
    const fx = cx + sg * 0.02;
    E.with(body, () => {
      quadF(E, [cx, 0.95, -hw], [cx, 0.95, hw], [cx, 2.2, hw], [cx, 2.2, -hw], null, [sg, 0, 0]);
      quadF(E, [cx, 3.45, -hw], [cx, 3.45, hw], [cx, H, hw], [cx, H, -hw], null, [sg, 0, 0]);
    });
    // the driver's side window
    E.with({ color: col('#1c242b'), pat: PAT.PLAIN, gloss: 0.97 }, () => {
      for (const s of [-1, 1]) quadF(E, [cx - sg * 1.5, 2.3, s * (hw + 0.006)], [cx - sg * 0.4, 2.3, s * (hw + 0.006)], [cx - sg * 0.4, 3.1, s * (hw + 0.006)], [cx - sg * 1.5, 3.1, s * (hw + 0.006)], null, [0, 0, s]);
    });
    // big black windshield band with the destination display and the number
    E.with({ color: col('#1c242b'), pat: PAT.PLAIN, gloss: 0.97 }, () => quadF(E, [fx, 2.2, -hw + 0.08], [fx, 2.2, hw - 0.08], [fx, 3.45, hw - 0.08], [fx, 3.45, -hw + 0.08], null, [sg, 0, 0]));
    E.with({ color: col('#ff9c2a'), pat: PAT.EMIT, emit: 1.7 }, () => E.box(fx - 0.01, 3.1, -0.62, fx + 0.01, 3.34, 0.62));
    E.with({ color: col('#dfe8ee'), pat: PAT.EMIT, emit: 0.9 }, () => E.box(fx - 0.01, 3.14, hw - 0.62, fx + 0.01, 3.3, hw - 0.2));
    E.with({ color: col('#2e8b57'), pat: PAT.PLAIN, gloss: 0.6 }, () => E.box(fx - 0.012, 1.95, -hw, fx + 0.012, 2.2, hw));
    // wipers
    E.with({ color: col('#0e0f10'), pat: PAT.PLAIN }, () => {
      for (const z of [-0.7, 0.55]) E.beam([fx + sg * 0.02, 2.3, z], [fx + sg * 0.02, 2.95, z + 0.25], 0.03, 0.02);
    });
    // headlights (lit on the leading end) and tail lights (lit on the trailing end)
    const lead = cab > 0;
    for (const z of [-1.0, 1.0]) {
      E.with({ color: col(lead ? '#fff8e6' : '#3a2a28'), pat: lead ? PAT.EMIT : PAT.PLAIN, emit: lead ? 3.2 : 0, gloss: 0.9 }, () => E.box(fx - 0.02, 1.35, z - 0.2, fx + 0.03, 1.6, z + 0.02 * sg));
      E.with({ color: col(lead ? '#5a2020' : '#ff2a1a'), pat: lead ? PAT.PLAIN : PAT.EMIT, emit: lead ? 0 : 2.6, gloss: 0.9 }, () => E.box(fx - 0.02, 1.35, z + (z > 0 ? -0.42 : 0.24), fx + 0.03, 1.55, z + (z > 0 ? -0.26 : 0.4)));
    }
    // skirt / snow plough, coupler
    E.with({ color: col('#3a3d40'), pat: PAT.METAL, gloss: 0.4 }, () => {
      quadF(E, [cx + sg * 0.05, 0.95, -hw + 0.2], [cx + sg * 0.05, 0.95, hw - 0.2], [cx + sg * 0.35, 0.25, hw - 0.45], [cx + sg * 0.35, 0.25, -hw + 0.45], null, [sg, -0.4, 0]);
      E.box(cx, 0.6, -0.12, cx + sg * 0.55, 0.85, 0.12);
    });
  }
  return { geo: sink.toGeometry(), glass: glass.toGeometry() };
}

export function buildTrain() {
  return {
    cars: [buildCar(-1, false), buildCar(0, true), buildCar(0, false), buildCar(1, false)],
    length: TRAIN.length,
  };
}

// ---------------------------------------------------------------------------
// 雨ノ浦 station: two side platforms, a wooden waiting room, lamps, name boards,
// a little crossing path over the tracks at the east end.
// ---------------------------------------------------------------------------
export const PLATFORMS = [
  { z0: -119.85, z1: -116.9, side: 1, track: RAIL.tracks[0] }, // south, westbound
  { z0: -126.15, z1: -129.9, side: -1, track: RAIL.tracks[1] }, // north, eastbound
];
function buildStation(ctx) {
  const E = ctx.E, rng = ctx.rng;
  const [P0, P1] = RAIL.platform;
  const TOPY = 1.05;
  const R = ctx.atlasRects;
  for (const pf of PLATFORMS) {
    const za = Math.min(pf.z0, pf.z1), zb = Math.max(pf.z0, pf.z1);
    const edge = pf.z0, back = pf.z1, s = pf.side; // s: direction from the edge to the back
    for (let x = P0; x < P1; x += 20) {
      const xb = Math.min(P1, x + 20);
      ctx.chunk((x + xb) / 2, (za + zb) / 2);
      E.with({ color: col('#a8a59c'), pat: PAT.CONCRETE, gloss: 0.25, weather: 0.8, vbase: 0 }, () => E.box(x, 0, za, xb, TOPY - 0.05, zb, { ny: true, py: true, px: x + 20 < P1, nx: x > P0 }));
      E.with({ color: col('#b9b6ae'), pat: PAT.PAVING, gloss: 0.45, weather: 0 }, () => E.box(x, TOPY - 0.05, za, xb, TOPY, zb, { ny: true }));
      // white edge coping and the yellow tactile strip
      E.with({ color: col('#e4e2da'), pat: PAT.PLAIN, gloss: 0.4 }, () => E.box(x, TOPY - 0.12, Math.min(edge, edge + s * 0.3), xb, TOPY + 0.004, Math.max(edge, edge + s * 0.3)));
      E.with({ color: col('#e3b92e'), pat: PAT.GRATE, gloss: 0.3 }, () => E.box(x, TOPY, Math.min(edge + s * 0.8, edge + s * 1.1), xb, TOPY + 0.012, Math.max(edge + s * 0.8, edge + s * 1.1)));
    }
    ctx.solidWorld(P0, 0, za, P1, TOPY, zb);
    // ramps down at the east end towards the station crossing
    ctx.chunk(P1 + 4, (za + zb) / 2);
    E.with({ color: col('#b0ada5'), pat: PAT.CONCRETE, gloss: 0.3, weather: 0.5 }, () => {
      quadF(E, [P1, TOPY, za], [P1, TOPY, zb], [P1 + 8, 0.04, zb], [P1 + 8, 0.04, za], null, [0.13, 1, 0]);
      quadF(E, [P1, 0, za], [P1, TOPY, za], [P1 + 8, 0.04, za], [P1 + 8, 0.0, za], null, [0, 0, -1]);
      quadF(E, [P1, 0, zb], [P1, TOPY, zb], [P1 + 8, 0.04, zb], [P1 + 8, 0.0, zb], null, [0, 0, 1]);
    });
    handRailLine(ctx, [[P1, TOPY, back - s * 0.1], [P1 + 8, 0.04, back - s * 0.1]]);
    // back railing
    E.with({ color: col('#8e9a96'), pat: PAT.METAL, gloss: 0.5 }, () => {
      const zr = back - s * 0.08;
      E.box(P0, TOPY + 1.05, zr - 0.03, P1, TOPY + 1.1, zr + 0.03);
      E.box(P0, TOPY + 0.55, zr - 0.02, P1, TOPY + 0.58, zr + 0.02);
      for (let x = P0; x <= P1; x += 2) E.box(x - 0.03, TOPY, zr - 0.03, x + 0.03, TOPY + 1.1, zr + 0.03);
    });
    // lamps along the platform (warm white), benches, name boards
    for (let x = P0 + 6; x < P1 - 2; x += 13) {
      const zl = back - s * 0.5;
      ctx.chunk(x, zl);
      E.with({ color: col('#5f676b'), pat: PAT.METAL, gloss: 0.5 }, () => {
        E.cyl(x, TOPY, zl, 0.05, 3.2, 8);
        E.box(x - 0.05, TOPY + 3.15, zl - 0.05, x + 0.05, TOPY + 3.25, zl - s * 0.9);
      });
      E.with({ color: col('#fff4de'), pat: PAT.EMIT, emit: 1.8, ex1: 3 }, () => E.box(x - 0.45, TOPY + 3.1, zl - s * 0.95 - 0.08, x + 0.45, TOPY + 3.16, zl - s * 0.95 + 0.08));
      const lp = new THREE.Vector3(x, TOPY + 2.6, zl - s * 0.95);
      ctx.addLight(lp, '#fff0d6', 6.5, 0.6, 3);
      ctx.glows.push({ p: new THREE.Vector3(x, TOPY + 3.08, zl - s * 0.95), color: col('#fff2dc'), size: 0.9, strength: 0.35, flicker: 3 });
    }
    for (const bx of [P0 + 14, P0 + 40, P0 + 60]) {
      ctx.chunk(bx, back);
      E.frame(bx, TOPY, back - s * 0.9, s > 0 ? Math.PI : 0, () => benchLocal(E));
    }
    for (const nxp of [P0 + 24, P0 + 52]) {
      ctx.chunk(nxp, back);
      E.frame(nxp, TOPY, back - s * 0.6, s > 0 ? Math.PI : 0, () => {
        E.with({ color: col('#5f676b'), pat: PAT.METAL, gloss: 0.5 }, () => {
          E.box(-1.15, 0, -0.04, -1.08, 2.25, 0.04);
          E.box(1.08, 0, -0.04, 1.15, 2.25, 0.04);
        });
        ctx.inSink('atlas', () => E.with({ color: col('#ffffff'), pat: PAT.PLAIN, gloss: 0.3, weather: 0 }, () => {
          E.quad([-1.1, 1.45, 0.05], [1.1, 1.45, 0.05], [1.1, 2.18, 0.05], [-1.1, 2.18, 0.05], quv(R.ekimei), [0, 0, 1]);
          E.quad([1.1, 1.45, -0.05], [-1.1, 1.45, -0.05], [-1.1, 2.18, -0.05], [1.1, 2.18, -0.05], quv(R.ekimei), [0, 0, -1]);
        }));
      });
    }
  }
  // ---- waiting room on the south platform --------------------------------------------
  const pf = PLATFORMS[0];
  const wx0 = -50, wx1 = -41.5, wz0 = pf.z1 - 1.8, wz1 = pf.z1 - 0.05;
  ctx.chunk((wx0 + wx1) / 2, (wz0 + wz1) / 2);
  E.frame(0, TOPY, 0, 0, () => {
    const wood = { color: col('#6b5140'), pat: PAT.WOOD, gloss: 0.12, weather: 0.5 };
    E.with(wood, () => {
      E.box(wx0, 0, wz1 - 0.1, wx1, 2.6, wz1, { ny: true });
      E.box(wx0, 0, wz0, wx0 + 0.1, 2.6, wz1, { ny: true });
      E.box(wx1 - 0.1, 0, wz0, wx1, 2.6, wz1, { ny: true });
      // front: posts and a low wall with big windows
      E.box(wx0, 0, wz0, wx1, 0.8, wz0 + 0.1, { ny: true });
      for (const x of [wx0, wx0 + 2.8, wx1 - 2.8, wx1 - 0.1]) E.box(x, 0, wz0, x + 0.1, 2.6, wz0 + 0.12);
    });
    E.with({ color: col('#dfe6e8'), pat: PAT.GLASS, param: 0, emit: 1, ex1: 2.7, ex2: 1.6, weather: 0.3 }, () => {
      for (const x of [wx0 + 0.1, wx1 - 2.7]) E.quad([x, 0.85, wz0 + 0.05], [x + 2.6, 0.85, wz0 + 0.05], [x + 2.6, 2.4, wz0 + 0.05], [x, 2.4, wz0 + 0.05], [0, 0, 2.6, 0, 2.6, 1.55, 0, 1.55], [0, 0, -1]);
    });
    // open door gap in the middle; bench inside and a warm light
    E.frame((wx0 + wx1) / 2, 0, wz1 - 0.45, Math.PI, () => benchLocal(E, 2.6));
    E.with({ color: col('#fff1d6'), pat: PAT.EMIT, emit: 1.6 }, () => E.box((wx0 + wx1) / 2 - 0.5, 2.5, (wz0 + wz1) / 2 - 0.08, (wx0 + wx1) / 2 + 0.5, 2.55, (wz0 + wz1) / 2 + 0.08));
    ctx.addLight(new THREE.Vector3((wx0 + wx1) / 2, TOPY + 2.2, wz0 - 0.4), '#ffe6c0', 5.5, 0.7);
    // roof: corrugated, overhanging the platform
    E.with({ color: col('#5d6b73'), pat: PAT.CORR, gloss: 0.5, weather: 0 }, () => quadF(E, [wx0 - 0.4, 2.95, wz1 + 0.3], [wx1 + 0.4, 2.95, wz1 + 0.3], [wx1 + 0.4, 2.7, wz0 - 1.4], [wx0 - 0.4, 2.7, wz0 - 1.4], [0, 0, 9.3, 0, 9.3, 4.2, 0, 4.2], [0, 1, 0]));
    E.with({ color: col('#e3e0d8'), pat: PAT.PLAIN }, () => quadF(E, [wx0 - 0.4, 2.9, wz1 + 0.3], [wx1 + 0.4, 2.9, wz1 + 0.3], [wx1 + 0.4, 2.65, wz0 - 1.4], [wx0 - 0.4, 2.65, wz0 - 1.4], null, [0, -1, 0]));
    E.with({ color: col('#5f676b'), pat: PAT.METAL }, () => {
      for (const x of [wx0 - 0.2, wx1 + 0.2]) E.box(x - 0.05, 0, wz0 - 1.25, x + 0.05, 2.72, wz0 - 1.15);
    });
    for (let x = wx0; x < wx1; x += rng.range(0.4, 0.8)) ctx.drip(x, 2.62, wz0 - 1.43);
    // station name over the door, a timetable and a poster
    ctx.inSink('atlas', () => E.with({ color: col('#ffffff'), pat: PAT.PLAIN, gloss: 0.3 }, () => {
      E.quad([(wx0 + wx1) / 2 + 0.8, 2.25, wz0 - 0.02], [(wx0 + wx1) / 2 - 0.8, 2.25, wz0 - 0.02], [(wx0 + wx1) / 2 - 0.8, 2.65, wz0 - 0.02], [(wx0 + wx1) / 2 + 0.8, 2.65, wz0 - 0.02], quv(R.stationsign), [0, 0, -1]);
      E.quad([wx1 + 0.01, 1.2, wz0 + 1.8], [wx1 + 0.01, 1.2, wz0 + 1.1], [wx1 + 0.01, 2.1, wz0 + 1.1], [wx1 + 0.01, 2.1, wz0 + 1.8], quv(R.timetable), [1, 0, 0]);
      E.quad([wx0 - 0.01, 1.1, wz0 + 0.8], [wx0 - 0.01, 1.1, wz0 + 1.6], [wx0 - 0.01, 2.2, wz0 + 1.6], [wx0 - 0.01, 2.2, wz0 + 0.8], quv(R.poster0), [-1, 0, 0]);
    }));
  });
  ctx.solidWorld(wx0, TOPY, wz0, wx1, TOPY + 2.95, wz1);
  // ---- shelter on the north platform ---------------------------------------------------
  const nf = PLATFORMS[1];
  ctx.chunk(-54, nf.z1);
  E.frame(0, TOPY, 0, 0, () => {
    E.with({ color: col('#5f676b'), pat: PAT.METAL, gloss: 0.5 }, () => {
      for (const x of [-58, -51]) E.box(x - 0.05, 0, nf.z1 + 0.5, x + 0.05, 2.7, nf.z1 + 0.6);
    });
    E.with({ color: col('#5d6b73'), pat: PAT.CORR, gloss: 0.5 }, () => quadF(E, [-58.6, 2.8, nf.z1 + 0.1], [-50.4, 2.8, nf.z1 + 0.1], [-50.4, 2.6, nf.z0 - 0.6], [-58.6, 2.6, nf.z0 - 0.6], [0, 0, 8.2, 0, 8.2, 3.5, 0, 3.5], [0, 1, 0]));
    E.with({ color: col('#e3e0d8'), pat: PAT.PLAIN }, () => quadF(E, [-58.6, 2.76, nf.z1 + 0.1], [-50.4, 2.76, nf.z1 + 0.1], [-50.4, 2.56, nf.z0 - 0.6], [-58.6, 2.56, nf.z0 - 0.6], null, [0, -1, 0]));
    E.frame(-54.5, 0, nf.z1 + 0.9, 0, () => benchLocal(E, 2.4));
  });
  // ---- the station crossing path and the entrance ------------------------------------------
  const cx0 = P1 + 8, cx1 = P1 + 10.2;
  ctx.chunk((cx0 + cx1) / 2, RAIL.z);
  E.with({ color: col('#57585a'), pat: PAT.PLAIN, gloss: 0.5 }, () => E.box(cx0, 0, -128.9, cx1, 0.195, -117.1, { ny: true }));
  E.with({ color: col('#e3b92e'), pat: PAT.GRATE, gloss: 0.3 }, () => {
    for (const z of [-118.2, -127.8]) E.box(cx0, 0.0, z - 0.3, cx1, 0.21, z + 0.3);
  });
  // entrance from the canal road: a sign, a vending machine and a bicycle shed
  ctx.chunk(P1 + 9, -115.4);
  E.frame(P1 + 9.1, 0, -115.6, 0, () => {
    E.with({ color: col('#5f676b'), pat: PAT.METAL, gloss: 0.5 }, () => {
      E.box(-1.6, 0, -0.05, -1.52, 2.6, 0.05);
      E.box(1.52, 0, -0.05, 1.6, 2.6, 0.05);
    });
    ctx.inSink('atlas', () => E.with({ color: col('#ffffff'), pat: PAT.PLAIN, gloss: 0.3 }, () => {
      E.quad([-1.5, 2.2, 0.06], [1.5, 2.2, 0.06], [1.5, 2.95, 0.06], [-1.5, 2.95, 0.06], quv(R.stationsign), [0, 0, 1]);
      E.quad([1.5, 2.2, -0.06], [-1.5, 2.2, -0.06], [-1.5, 2.95, -0.06], [1.5, 2.95, -0.06], quv(R.stationsign), [0, 0, -1]);
    }));
    E.with({ color: col('#fff1d6'), pat: PAT.EMIT, emit: 1.2 }, () => E.box(-1.4, 3.0, -0.1, 1.4, 3.05, 0.1));
  });
  vendingMachine(ctx, P1 + 1.2, 0, -115.08, 0, 2);
  // bicycles parked along the platform fence, under a small roof
  ctx.chunk(-34, -116);
  E.frame(-34, 0, -116.0, 0, () => {
    E.with({ color: col('#7e8a86'), pat: PAT.METAL, gloss: 0.5 }, () => {
      for (const x of [-5, 0, 5]) E.box(x - 0.05, 0, -0.75, x + 0.05, 2.1, -0.65);
      E.box(-5.3, 2.1, -0.85, 5.3, 2.16, 0.75);
    });
    E.with({ color: col('#c9d3d2'), pat: PAT.CORR, gloss: 0.6 }, () => E.box(-5.3, 2.16, -0.85, 5.3, 2.2, 0.75));
    for (let i = 0; i < 12; i++) bicycle(ctx, -4.6 + i * 0.78, 0.02, 0.0, Math.PI / 2 + rng.range(-0.08, 0.08), { lean: rng.range(0.04, 0.12) });
    for (let x = -5; x < 5.2; x += rng.range(0.5, 0.9)) ctx.drip(x, 2.14, 0.77);
  });
  void bench;
  void bush;
}

function benchLocal(E, w = 1.8) {
  E.with({ color: col('#7d5a3f'), pat: PAT.WOOD, gloss: 0.25, weather: 0.2 }, () => {
    for (let i = 0; i < 3; i++) E.box(-w / 2, 0.42, -0.2 + i * 0.13, w / 2, 0.46, -0.1 + i * 0.13);
    for (let i = 0; i < 2; i++) E.box(-w / 2, 0.6 + i * 0.16, -0.27, w / 2, 0.7 + i * 0.16, -0.24);
  });
  E.with({ color: col('#3a3b3b'), pat: PAT.METAL, gloss: 0.4 }, () => {
    for (const x of [-w / 2 + 0.15, w / 2 - 0.15]) {
      E.box(x - 0.03, 0, -0.22, x + 0.03, 0.42, 0.16);
      E.box(x - 0.03, 0.42, -0.28, x + 0.03, 0.95, -0.24);
    }
  });
}

function handRailLine(ctx, pts) {
  const E = ctx.E;
  E.with({ color: col('#b4b8b9'), pat: PAT.METAL, gloss: 0.7 }, () => {
    E.tube(pts.map((p) => [p[0], p[1] + 0.9, p[2]]), 0.025, 5);
    for (const p of pts) E.cyl(p[0], p[1], p[2], 0.022, 0.9, 6);
  });
}
