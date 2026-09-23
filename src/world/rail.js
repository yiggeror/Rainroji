import * as THREE from 'three';
import { PAT, Emitter, Sink } from '../builder.js';
import { col } from '../util.js';
import { quv } from './atlas.js';
import { RAIL } from './layout.js';
import { meshFence } from './props.js';
import { grass } from './plants.js';

// ---------------------------------------------------------------------------
// Railway line, level crossing with gates and warning lights, passing trains
// ---------------------------------------------------------------------------
const TOP = 0.2; // rail head height (road ramps up at the crossing)

export function buildRail(ctx) {
  const E = ctx.E, rng = ctx.rng;
  const X0 = -420, X1 = 420;
  // ballast bed in chunks
  for (let x = X0; x < X1; x += 40) {
    ctx.chunk(x + 20, RAIL.z);
    E.with({ color: col('#7d776d'), pat: PAT.GRAVEL, gloss: 0.15, weather: 0 }, () => {
      const z0 = -118.6, z1 = -127.4;
      E.quad([x, 0.06, z0 - 0.9], [x + 40, 0.06, z0 - 0.9], [x + 40, 0.06, z1 + 0.9], [x, 0.06, z1 + 0.9], null, [0, 1, 0]);
      E.quad([x, -0.02, z0], [x + 40, -0.02, z0], [x + 40, 0.06, z0 - 0.9], [x, 0.06, z0 - 0.9], null, [0, 1, 0]);
      E.quad([x, 0.06, z1 + 0.9], [x + 40, 0.06, z1 + 0.9], [x + 40, -0.02, z1], [x, -0.02, z1], null, [0, 1, 0]);
    });
    const near = Math.abs(x + 20) < 170;
    for (const tz of RAIL.tracks) {
      if (near) {
        E.with({ color: col('#a9a69d'), pat: PAT.CONCRETE, gloss: 0.2, weather: 0.3 }, () => {
          for (let sx = x + 0.3; sx < x + 40; sx += 0.62) E.box(sx - 0.1, 0.02, tz - 1.05, sx + 0.1, 0.1, tz + 1.05, { ny: true });
        });
      } else {
        E.with({ color: col('#8d8a83'), pat: PAT.PLAIN, gloss: 0.1 }, () => E.box(x, 0.02, tz - 1.05, x + 40, 0.09, tz + 1.05, { ny: true }));
      }
      E.with({ color: col('#5b534c'), pat: PAT.RUST, gloss: 0.3 }, () => {
        for (const o of [-0.53, 0.53]) E.box(x, 0.09, tz + o - 0.035, x + 40, TOP - 0.02, tz + o + 0.035, { ny: true, py: true });
      });
      E.with({ color: col('#c4c7c9'), pat: PAT.METAL, gloss: 0.95, weather: 0 }, () => {
        for (const o of [-0.53, 0.53]) E.box(x, TOP - 0.02, tz + o - 0.035, x + 40, TOP, tz + o + 0.035, { ny: true });
      });
    }
  }
  // fences along the line (except the crossing)
  for (const [z, rot] of [[-117.3, 0], [-128.7, Math.PI]]) {
    for (let x = -150; x < 150; x += 30) {
      const a = x, b = x + 30;
      if (b < 1.5 || a > 10.5) {
        ctx.chunk(x + 15, z);
        E.frame(0, 0, z, 0, () => meshFence(ctx, a, b, 0, 1.4, '#5d6a62'));
      } else {
        ctx.chunk(x + 15, z);
        if (a < 1.5) E.frame(0, 0, z, 0, () => meshFence(ctx, a, 1.5, 0, 1.4, '#5d6a62'));
        if (b > 10.5) E.frame(0, 0, z, 0, () => meshFence(ctx, 10.5, b, 0, 1.4, '#5d6a62'));
      }
      void rot;
    }
  }
  // weeds along the fences and the ballast edge
  for (let i = 0; i < 260; i++) {
    const x = rng.range(-140, 140);
    if (x > 1 && x < 11) continue;
    const z = rng.chance(0.5) ? rng.range(-117.8, -116.2) : rng.range(-129.9, -128.3);
    ctx.chunk(x, z);
    grass(ctx, x, 0.0, z, rng.range(0.3, 0.8), { n: 3 });
  }
  // catenary masts & wires
  const masts = [];
  for (let x = -400; x <= 400; x += 50) {
    ctx.chunk(x, -128);
    E.with({ color: col('#7f8487'), pat: PAT.METAL, gloss: 0.4, weather: 0.3 }, () => {
      E.box(x - 0.12, 0, -128.3 - 0.12, x + 0.12, 7.4, -128.3 + 0.12);
      E.box(x - 0.08, 6.8, -128.3, x + 0.08, 6.95, -119.8);
      E.beam([x, 5.2, -128.2], [x, 6.8, -124.0], 0.07);
      E.box(x - 0.04, 5.9, -126.0, x + 0.04, 6.8, -125.9);
      E.box(x - 0.04, 5.9, -122.9, x + 0.04, 6.8, -122.8);
    });
    masts.push(x);
  }
  for (let i = 0; i < masts.length - 1; i++) {
    const a = masts[i], b = masts[i + 1];
    ctx.chunk((a + b) / 2, RAIL.z);
    for (const tz of RAIL.tracks) {
      const pts = [], mp = [];
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        const zig = (k % 2 ? 0.15 : -0.15);
        pts.push([a + (b - a) * t, 5.15, tz + zig * 0.3]);
        mp.push([a + (b - a) * t, 6.1 - 0.5 * 4 * t * (1 - t), tz]);
      }
      E.with({ color: col('#4a3f36'), pat: PAT.METAL, gloss: 0.6 }, () => {
        E.tube(pts, 0.008, 3);
        E.tube(mp, 0.01, 3);
        for (let k = 1; k < 10; k += 2) E.box(mp[k][0] - 0.004, pts[k][1], tz - 0.004, mp[k][0] + 0.004, mp[k][1], tz + 0.004);
      });
    }
  }

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

// Commuter train as its own mesh, built once
export function buildTrain(ctx) {
  const E = new Emitter();
  const sink = new Sink('train');
  E.sink = sink;
  const rng = ctx.rng;
  const cars = 4, L = 19.5, gap = 0.5, W = 2.9, H = 3.65;
  const body = col('#cfd2d6');
  const stripe = col('#2f8f5a');
  for (let c = 0; c < cars; c++) {
    const x0 = c * (L + gap);
    E.with({ color: body, pat: PAT.PLAIN, gloss: 0.8, weather: 0 }, () => {
      E.box(x0, 0.95, -W / 2, x0 + L, H, W / 2);
    });
    // roof
    E.with({ color: col('#9ea2a6'), pat: PAT.PLAIN, gloss: 0.5 }, () => {
      E.box(x0 + 0.2, H, -W / 2 + 0.25, x0 + L - 0.2, H + 0.18, W / 2 - 0.25);
      for (let k = 0; k < 3; k++) E.box(x0 + 3 + k * 6, H + 0.18, -0.5, x0 + 4.4 + k * 6, H + 0.42, 0.5);
    });
    E.with({ color: stripe, pat: PAT.PLAIN, gloss: 0.6 }, () => {
      E.box(x0, 2.05, -W / 2 - 0.005, x0 + L, 2.25, W / 2 + 0.005, { py: true, ny: true });
      E.box(x0, H - 0.22, -W / 2 - 0.005, x0 + L, H - 0.12, W / 2 + 0.005, { py: true, ny: true });
    });
    for (const s of [-1, 1]) {
      // windows (lit interior) and doors
      for (let k = 0; k < 4; k++) {
        const dx = x0 + 1.6 + k * 5.0;
        E.with({ color: col('#e8ecef'), pat: PAT.EMIT, emit: 1.1 }, () => {
          const wx0 = dx + 1.35, wx1 = dx + 3.9;
          if (k < 3 || true) {
            const z = s * (W / 2 + 0.008);
            const a = [wx0, 2.35, z], b = [wx1, 2.35, z], cc = [wx1, 3.15, z], d = [wx0, 3.15, z];
            if (s > 0) E.quad(a, b, cc, d, null, [0, 0, 1]);
            else E.quad(b, a, d, cc, null, [0, 0, -1]);
          }
        });
        E.with({ color: col('#9aa0a6'), pat: PAT.METAL, gloss: 0.8 }, () => {
          const z = s * (W / 2 + 0.004);
          E.box(dx - 0.65, 1.0, z - 0.004, dx + 0.65, 3.2, z + 0.004);
        });
        E.with({ color: col('#dde6ea'), pat: PAT.EMIT, emit: 0.9 }, () => {
          const z = s * (W / 2 + 0.01);
          for (const ox of [-0.35, 0.35]) {
            const a = [dx + ox - 0.22, 2.2, z], b = [dx + ox + 0.22, 2.2, z], cc = [dx + ox + 0.22, 3.0, z], d = [dx + ox - 0.22, 3.0, z];
            if (s > 0) E.quad(a, b, cc, d, null, [0, 0, 1]);
            else E.quad(b, a, d, cc, null, [0, 0, -1]);
          }
        });
      }
    }
    // bogies & skirt
    E.with({ color: col('#2c2e30'), pat: PAT.PLAIN, gloss: 0.3 }, () => {
      E.box(x0 + 0.5, 0.35, -W / 2 + 0.2, x0 + L - 0.5, 0.95, W / 2 - 0.2);
      for (const bx of [x0 + 2.5, x0 + L - 2.5]) E.box(bx - 1.3, 0.12, -1.25, bx + 1.3, 0.75, 1.25);
    });
    // pantograph on car 2
    if (c === 1) {
      E.with({ color: col('#3a3c3e'), pat: PAT.METAL, gloss: 0.4 }, () => {
        E.beam([x0 + 8, H + 0.2, 0], [x0 + 9, H + 1.1, 0], 0.05);
        E.beam([x0 + 10, H + 0.2, 0], [x0 + 9, H + 1.1, 0], 0.05);
        E.box(x0 + 8.9, H + 1.1, -0.9, x0 + 9.1, H + 1.16, 0.9);
      });
    }
    // ends: front cab on first and last car
    for (const end of c === 0 ? [0] : c === cars - 1 ? [1] : []) {
      const ex = end === 0 ? x0 : x0 + L;
      const sgn = end === 0 ? -1 : 1;
      E.with({ color: col('#1f2a33'), pat: PAT.PLAIN, gloss: 0.95 }, () => {
        const a = [ex + sgn * 0.01, 2.3, -W / 2 + 0.25], b = [ex + sgn * 0.01, 2.3, W / 2 - 0.25], cc = [ex + sgn * 0.01, 3.25, W / 2 - 0.25], d = [ex + sgn * 0.01, 3.25, -W / 2 + 0.25];
        if (sgn > 0) E.quad(a, b, cc, d, null, [1, 0, 0]);
        else E.quad(b, a, d, cc, null, [-1, 0, 0]);
      });
      E.with({ color: col('#fff8e0'), pat: PAT.EMIT, emit: 3.0 }, () => {
        for (const s of [-1, 1]) E.box(ex + sgn * 0.02 - 0.02, 1.35, s * 1.0 - 0.15, ex + sgn * 0.02 + 0.02, 1.55, s * 1.0 + 0.15);
      });
      E.with({ color: col('#ffb24a'), pat: PAT.EMIT, emit: 1.5 }, () => E.box(ex + sgn * 0.02 - 0.02, 3.35, -0.6, ex + sgn * 0.02 + 0.02, 3.55, 0.6));
    }
  }
  void rng;
  const geo = sink.toGeometry();
  return { geo, length: cars * (L + gap) - gap };
}
