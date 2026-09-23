import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAT, Emitter, Sink } from '../builder.js';
import { col } from '../util.js';
import { quadF } from './parts.js';
import { SEA, CANAL, RAIL, coastSegments, BREAKWATERS } from './layout.js';
import { grass } from './plants.js';

const WALL_BOTTOM = SEA - 3.6;

// frame along a shoreline segment: local x along the shore, local z inland
function segFrame(g) {
  return Math.atan2(-g.dz, g.dx);
}

let _tetra = null;
function tetrapodGeometry() {
  if (_tetra) return _tetra;
  const dirs = [
    [0, 1, 0],
    [0.9428, -0.3333, 0],
    [-0.4714, -0.3333, 0.8165],
    [-0.4714, -0.3333, -0.8165],
  ];
  const parts = dirs.map((d) => {
    const g = new THREE.CylinderGeometry(0.28, 0.62, 1.35, 7, 1);
    g.translate(0, 0.62, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...d));
    g.applyQuaternion(q);
    g.deleteAttribute('uv');
    return g;
  });
  _tetra = mergeGeometries(parts);
  return _tetra;
}

// ---------------------------------------------------------------------------
// Sea walls, quays, breakwaters, lighthouses, tetrapods and harbour clutter.
// Returns specs for things that move (lighthouse lamps).
// ---------------------------------------------------------------------------
export function buildCoast(ctx) {
  const E = ctx.E, rng = ctx.rng;
  const tetra = tetrapodGeometry();
  const lamps = [];
  const gapsZ = [
    [CANAL.z1 - 0.6, CANAL.z0 + 0.6], // canal mouth
    [RAIL.z - 4.5, RAIL.z + 4.5], // railway bridge abutment
  ];
  const tetrapod = (x, y, z, s = 1) => {
    ctx.chunk(x, z);
    E.with({ color: col('#b1aea5').offsetHSL(0, 0, rng.range(-0.04, 0.03)), pat: PAT.CONCRETE, gloss: 0.3, weather: 0.8 }, () => {
      E.geom(tetra, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(-0.6, 0.6), rng.range(0, 6.3), rng.range(-0.6, 0.6))), new THREE.Vector3(s, s, s)));
    });
  };

  for (const g of coastSegments) {
    if (g.kind !== 'wall' && g.kind !== 'quay') continue;
    const rot = segFrame(g);
    // split into pieces of <= 24 m so chunks cull and gaps can be cut
    const n = Math.max(1, Math.ceil(g.len / 24));
    for (let k = 0; k < n; k++) {
      const s0 = (g.len * k) / n, s1 = (g.len * (k + 1)) / n;
      const ax = g.ax + g.dx * s0, az = g.az + g.dz * s0;
      const mz = g.az + g.dz * (s0 + s1) * 0.5;
      const cut = gapsZ.some(([a, b]) => Math.abs(g.dx) < 0.3 && mz > a - 8 && mz < b + 8);
      ctx.chunk(ax + g.dx * (s1 - s0) * 0.5, mz);
      E.frame(ax, 0, az, rot, () => {
        const L = s1 - s0;
        // pieces along the east shore can have openings (canal mouth, rail bridge)
        const openings = [];
        if (cut) {
          for (const [za, zb] of gapsZ) {
            // local x of world z along this piece
            const ta = (za - az) / g.dz, tb = (zb - az) / g.dz;
            const lo = Math.max(0, Math.min(ta, tb)), hi = Math.min(L, Math.max(ta, tb));
            if (hi > lo) openings.push([lo, hi]);
          }
        }
        const spans = [];
        let x = 0;
        for (const [a, b] of openings.sort((p, q) => p[0] - q[0])) {
          if (a > x) spans.push([x, a]);
          x = Math.max(x, b);
        }
        if (x < L) spans.push([x, L]);
        for (const [a, b] of spans) {
          // face
          E.with({ color: col('#a7a49b'), pat: PAT.CONCRETE, gloss: 0.25, weather: 1.0, vbase: WALL_BOTTOM }, () => {
            quadF(E, [a, WALL_BOTTOM, 0], [b, WALL_BOTTOM, 0], [b, 0.02, 0], [a, 0.02, 0], [a, 0, b, 0, b, -WALL_BOTTOM, a, -WALL_BOTTOM], [0, 0, -1]);
          });
          // tide line: darker wet band with weed
          E.with({ color: col('#4f5446'), pat: PAT.CONCRETE, gloss: 0.5, weather: 0 }, () => quadF(E, [a, SEA - 0.2, -0.012], [b, SEA - 0.2, -0.012], [b, SEA + 0.45, -0.012], [a, SEA + 0.45, -0.012], null, [0, 0, -1]));
          ctx.solid(a, WALL_BOTTOM - 1, 0, b, 0, 1.2);
          if (g.kind === 'wall') {
            // parapet (wave wall) with a cap, set just behind the edge
            E.with({ color: col('#b3b0a6'), pat: PAT.CONCRETE, gloss: 0.2, weather: 0.9, vbase: 0 }, () => E.box(a, 0, 0.0, b, 0.95, 0.42, { ny: true }));
            E.with({ color: col('#bdbab0'), pat: PAT.CONCRETE, gloss: 0.35, weather: 0.2 }, () => E.box(a - 0.02, 0.95, -0.03, b + 0.02, 1.02, 0.45, { ny: true }));
            ctx.solid(a, 0, 0, b, 1.02, 0.45);
            // drain holes and a few steel steps
            E.with({ color: col('#2c2e2f'), pat: PAT.PLAIN }, () => {
              for (let hx = a + 2.5; hx < b - 1; hx += 6) E.box(hx - 0.12, -0.55, -0.01, hx + 0.12, -0.35, 0.0);
            });
            for (let hx = a + 3; hx < b - 1; hx += 3.5) if (rng.chance(0.5)) grass(ctx, hx, 0, 0.55, rng.range(0.2, 0.4), { n: 2 });
          } else {
            // quay: edge coping with a yellow line, bollards, fenders, ladders
            E.with({ color: col('#bebbb2'), pat: PAT.CONCRETE, gloss: 0.4, weather: 0.3 }, () => E.box(a, -0.05, 0, b, 0.12, 0.5, { ny: true }));
            E.with({ color: col('#d8b83a'), pat: PAT.PAINT, gloss: 0.4 }, () => E.box(a, 0.12, 0.52, b, 0.125, 0.64));
            for (let bx = a + 3; bx < b - 1; bx += 7.5) {
              E.with({ color: col('#2f3336'), pat: PAT.METAL, gloss: 0.5, weather: 0.2 }, () => {
                E.cyl(bx, 0.12, 0.9, 0.16, 0.42, 10);
                E.cyl(bx, 0.52, 0.9, 0.24, 0.07, 10);
              });
              E.with({ color: col('#1e1f20'), pat: PAT.PLAIN, gloss: 0.3 }, () => E.box(bx - 0.5, -0.9, -0.28, bx + 0.5, -0.1, 0.0));
            }
            for (let lx = a + 10; lx < b - 2; lx += 22) {
              E.with({ color: col('#7a7f82'), pat: PAT.RUST, gloss: 0.4 }, () => {
                E.box(lx - 0.24, SEA - 1.5, -0.08, lx - 0.2, 0.15, -0.04);
                E.box(lx + 0.2, SEA - 1.5, -0.08, lx + 0.24, 0.15, -0.04);
                for (let yy = SEA - 1.3; yy < 0; yy += 0.3) E.box(lx - 0.2, yy, -0.07, lx + 0.2, yy + 0.03, -0.05);
              });
            }
          }
        }
        // tetrapods at the foot of the north and east sea walls
        if (g.kind === 'wall' && (g.az < -120 || g.ax > 105) && !cut) {
          for (let tx = 1; tx < L - 1; tx += rng.range(1.8, 2.6)) {
            for (let row = 0; row < 2; row++) {
              const p = new THREE.Vector3(tx + rng.range(-0.4, 0.4), SEA - 0.9 + row * 0.5 + rng.range(-0.2, 0.3), -1.4 - row * 1.5 + rng.range(-0.3, 0.3));
              p.applyMatrix4(E.m);
              tetrapod(p.x, p.y, p.z, rng.range(0.85, 1.05));
            }
          }
        }
      });
    }
  }

  // ---- breakwaters ----------------------------------------------------------------
  for (const bw of BREAKWATERS) {
    const P = bw.pts;
    for (let i = 0; i < P.length - 1; i++) {
      const [ax, az] = P[i], [bx, bz] = P[i + 1];
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
      const rot = Math.atan2(-dz / len, dx / len);
      ctx.chunk((ax + bx) / 2, (az + bz) / 2);
      E.frame(ax, 0, az, rot, () => {
        const w = 3.2, top = 1.6;
        E.with({ color: col('#aaa79e'), pat: PAT.CONCRETE, gloss: 0.3, weather: 0.9, vbase: WALL_BOTTOM }, () => E.box(-0.5, WALL_BOTTOM, -w, len + 0.5, top, w, { ny: true }));
        E.with({ color: col('#4f5446'), pat: PAT.CONCRETE, gloss: 0.5 }, () => {
          E.box(-0.5, SEA - 0.2, -w - 0.01, len + 0.5, SEA + 0.5, w + 0.01, { py: true, ny: true, px: true, nx: true });
        });
        ctx.solid(-0.5, WALL_BOTTOM, -w, len + 0.5, top, w);
        // wave wall on the seaward side
        const outer = bw.light === 'red' ? -1 : 1;
        const zs = outer * (w - 0.6);
        E.with({ color: col('#b5b2a8'), pat: PAT.CONCRETE, gloss: 0.25, weather: 0.8, vbase: top }, () => E.box(-0.5, top, zs - 0.6, len + 0.5, top + 1.5, zs + 0.6, { ny: true }));
        ctx.solid(-0.5, top, zs - 0.6, len + 0.5, top + 1.5, zs + 0.6);
        // tetrapods along the seaward face
        for (let tx = 0; tx < len; tx += rng.range(1.6, 2.3)) {
          for (let row = 0; row < 2; row++) {
            const p = new THREE.Vector3(tx, SEA - 0.8 + row * 0.6 + rng.range(-0.2, 0.3), outer * (w + 1.2 + row * 1.5 + rng.range(-0.3, 0.3)));
            p.applyMatrix4(E.m);
            tetrapod(p.x, p.y, p.z, rng.range(0.9, 1.15));
          }
        }
        // bollards on the harbour side
        E.with({ color: col('#2f3336'), pat: PAT.METAL, gloss: 0.5 }, () => {
          for (let tx = 4; tx < len - 2; tx += 9) E.cyl(tx, top, -outer * (w - 0.6), 0.15, 0.45, 10);
        });
      });
    }
    // lighthouse at the tip
    const [lx, lz] = P[P.length - 1];
    ctx.chunk(lx, lz);
    const red = bw.light === 'red';
    E.frame(lx, 1.6, lz, 0, () => {
      E.with({ color: col('#aaa79e'), pat: PAT.CONCRETE, gloss: 0.3, weather: 0.8, vbase: WALL_BOTTOM - 1.6 }, () => E.cyl(0, WALL_BOTTOM - 1.6, 0, 4.2, -WALL_BOTTOM + 1.6, 16));
      ctx.solid(-3.6, WALL_BOTTOM - 1.6, -3.6, 3.6, 0, 3.6);
      const tc = col(red ? '#c8372c' : '#ecebe6');
      E.with({ color: tc, pat: PAT.PLAIN, gloss: 0.5, weather: 0.35 }, () => E.cyl(0, 0, 0, 0.95, 7.2, 14, true, 0.75));
      if (!red) E.with({ color: col('#2d4f7a'), pat: PAT.PLAIN, gloss: 0.4 }, () => E.cyl(0, 2.3, 0, 0.9, 0.6, 14, false, 0.87));
      E.with({ color: col('#e7e5de'), pat: PAT.PLAIN, gloss: 0.4 }, () => E.cyl(0, 7.2, 0, 1.15, 0.12, 14));
      E.with({ color: col('#3a3d40'), pat: PAT.METAL, gloss: 0.4 }, () => {
        for (let a = 0; a < 12; a++) {
          const t = (a / 12) * Math.PI * 2;
          E.box(Math.cos(t) * 1.05 - 0.02, 7.32, Math.sin(t) * 1.05 - 0.02, Math.cos(t) * 1.05 + 0.02, 8.1, Math.sin(t) * 1.05 + 0.02);
        }
        E.cyl(0, 8.05, 0, 1.08, 0.05, 14, false);
        E.cyl(0, 9.4, 0, 0.62, 0.18, 12, true, 0.1);
      });
      E.with({ color: col(red ? '#ff5a3c' : '#fff5dc'), pat: PAT.EMIT, emit: 3.2, ex1: red ? 6 : 7 }, () => E.cyl(0, 8.1, 0, 0.42, 1.3, 12, true, 0.42));
      E.with({ color: col('#343638'), pat: PAT.METAL }, () => E.box(-0.28, 0.02, 0.8, 0.28, 1.9, 0.98));
      ctx.solid(-1.2, 0, -1.2, 1.2, 9.6, 1.2);
    });
    lamps.push({ p: new THREE.Vector3(lx, 1.6 + 8.7, lz), red });
    ctx.glows.push({ p: new THREE.Vector3(lx, 1.6 + 8.7, lz), color: col(red ? '#ff6a4a' : '#fff2d8'), size: 2.4, strength: 0.5, flicker: red ? 6 : 7 });
  }
  return { lamps };
}

// ---------------------------------------------------------------------------
// Small fishing boat (漁船), built once per variant as its own geometry so it
// can bob on the water. Local frame: bow towards +x, waterline at y = 0.
// ---------------------------------------------------------------------------
export function buildBoatGeometry(variant = 0, rng) {
  const E = new Emitter();
  const sink = new Sink('boat' + variant);
  E.sink = sink;
  const L = [9.5, 11.5, 7.5][variant % 3], B = [2.6, 3.0, 2.2][variant % 3];
  const hullC = col(['#f1f0ea', '#e9eef0', '#f3efe4'][variant % 3]);
  const stripe = col(['#2f5f9a', '#b8352d', '#2f7a5a'][variant % 3]);
  const bottom = col('#8a3a2e');
  // hull stations: x, half beam, sheer height, keel depth
  const st = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const x = -L / 2 + t * L;
    const bow = Math.max(0, (t - 0.62) / 0.38);
    const hb = (B / 2) * (t < 0.1 ? 0.82 + t * 1.8 : 1 - bow * bow * 0.97);
    const sheer = 0.95 + bow * bow * 0.75 - (t < 0.1 ? 0.05 : 0);
    const keel = -0.55 - 0.15 * Math.sin(Math.PI * t) + bow * 0.35;
    st.push({ x, hb: Math.max(0.03, hb), sheer, keel });
  }
  for (let i = 0; i < st.length - 1; i++) {
    const a = st[i], b = st[i + 1];
    for (const s of [-1, 1]) {
      // topsides (white) above the boot top, antifouling below
      const pts = (p, y) => [p.x, y, s * p.hb];
      const mid = (p) => 0.08;
      E.with({ color: hullC, pat: PAT.PLAIN, gloss: 0.7, weather: 0 }, () => quadF(E, pts(a, mid(a)), pts(b, mid(b)), pts(b, b.sheer), pts(a, a.sheer), null, [0, 0, s]));
      E.with({ color: stripe, pat: PAT.PLAIN, gloss: 0.7 }, () => quadF(E, [a.x, a.sheer - 0.28, s * (a.hb + 0.004)], [b.x, b.sheer - 0.28, s * (b.hb + 0.004)], [b.x, b.sheer - 0.16, s * (b.hb + 0.004)], [a.x, a.sheer - 0.16, s * (a.hb + 0.004)], null, [0, 0, s]));
      E.with({ color: bottom, pat: PAT.PLAIN, gloss: 0.5 }, () => quadF(E, [a.x, a.keel, 0], [b.x, b.keel, 0], [b.x, 0.08, s * b.hb], [a.x, 0.08, s * a.hb], null, [0, -0.4, s]));
    }
    // deck
    E.with({ color: col('#b9b6ab'), pat: PAT.PLAIN, gloss: 0.4 }, () => quadF(E, [a.x, a.sheer - 0.3, -a.hb + 0.08], [b.x, b.sheer - 0.3, -b.hb + 0.08], [b.x, b.sheer - 0.3, b.hb - 0.08], [a.x, a.sheer - 0.3, a.hb - 0.08], null, [0, 1, 0]));
    // gunwale caps
    E.with({ color: hullC.clone().multiplyScalar(0.92), pat: PAT.PLAIN, gloss: 0.5 }, () => {
      for (const s of [-1, 1]) quadF(E, [a.x, a.sheer, s * a.hb], [b.x, b.sheer, s * b.hb], [b.x, b.sheer, s * (b.hb - 0.1)], [a.x, a.sheer, s * (a.hb - 0.1)], null, [0, 1, 0]);
      // inner bulwark
      for (const s of [-1, 1]) quadF(E, [a.x, a.sheer - 0.3, s * (a.hb - 0.08)], [b.x, b.sheer - 0.3, s * (b.hb - 0.08)], [b.x, b.sheer, s * (b.hb - 0.1)], [a.x, a.sheer, s * (a.hb - 0.1)], null, [0, 0, -s]);
    });
  }
  // transom
  const t0 = st[0];
  E.with({ color: hullC, pat: PAT.PLAIN, gloss: 0.6 }, () => quadF(E, [t0.x, 0.08, -t0.hb], [t0.x, 0.08, t0.hb], [t0.x, t0.sheer, t0.hb], [t0.x, t0.sheer, -t0.hb], null, [-1, 0, 0]));
  E.with({ color: bottom, pat: PAT.PLAIN }, () => E.tri([t0.x, t0.keel, 0], [t0.x, 0.08, t0.hb], [t0.x, 0.08, -t0.hb], null, [-1, 0, 0]));
  // wheelhouse
  const wx0 = -L * 0.12, wx1 = wx0 + L * 0.22, wh = 1.7, dy = st[4].sheer - 0.3;
  E.with({ color: col('#eeede8'), pat: PAT.PLAIN, gloss: 0.6, weather: 0.2 }, () => E.box(wx0, dy, -B * 0.32, wx1, dy + wh, B * 0.32, { ny: true }));
  E.with({ color: col('#23303a'), pat: PAT.PLAIN, gloss: 0.95 }, () => {
    E.box(wx1, dy + 0.95, -B * 0.28, wx1 + 0.01, dy + 1.5, B * 0.28, { ny: true });
    for (const s of [-1, 1]) E.box(wx0 + 0.2, dy + 0.95, s * B * 0.32 - 0.005, wx1 - 0.2, dy + 1.45, s * B * 0.32 + 0.005, { ny: true });
  });
  E.with({ color: col('#d7d5ce'), pat: PAT.PLAIN, gloss: 0.5 }, () => E.box(wx0 - 0.15, dy + wh, -B * 0.36, wx1 + 0.25, dy + wh + 0.08, B * 0.36));
  // mast, lamp, radar
  E.with({ color: col('#dcdad4'), pat: PAT.METAL, gloss: 0.5 }, () => {
    E.cyl(wx0 + 0.4, dy + wh, 0, 0.05, 2.6, 6);
    E.box(wx0 + 0.1, dy + wh + 1.8, -0.5, wx0 + 0.7, dy + wh + 1.86, 0.5);
    E.box(wx0 + 0.9, dy + wh + 0.1, -0.35, wx0 + 1.4, dy + wh + 0.18, 0.35);
    E.cyl(wx0 + 1.15, dy + wh + 0.18, 0, 0.22, 0.18, 10);
  });
  E.with({ color: col('#fff3d6'), pat: PAT.EMIT, emit: 2.2, ex1: 8 }, () => E.box(wx0 + 0.34, dy + wh + 2.55, -0.07, wx0 + 0.46, dy + wh + 2.7, 0.07));
  // tyres hung as fenders, a coil of rope, fish boxes
  E.with({ color: col('#1c1d1e'), pat: PAT.PLAIN, gloss: 0.3 }, () => {
    for (let x = -L * 0.35; x < L * 0.3; x += L * 0.16) {
      for (const s of [-1, 1]) {
        const p = st[Math.round(((x + L / 2) / L) * 10)];
        const g = new THREE.TorusGeometry(0.24, 0.08, 5, 10);
        E.geom(g, new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(x, p.sheer - 0.45, s * (p.hb + 0.08)));
      }
    }
  });
  E.with({ color: col('#3f6db3'), pat: PAT.PLAIN, gloss: 0.5 }, () => {
    for (let i = 0; i < 3; i++) E.box(-L * 0.42 + i * 0.62, st[1].sheer - 0.3, -0.35, -L * 0.42 + i * 0.62 + 0.55, st[1].sheer - 0.02, 0.1);
  });
  // blue tarp over the fore deck
  E.with({ color: col('#355f8c'), pat: PAT.PLAIN, gloss: 0.4 }, () => {
    const a = st[6], b = st[8];
    quadF(E, [a.x, a.sheer - 0.05, -a.hb * 0.8], [b.x, b.sheer - 0.1, -b.hb * 0.8], [b.x, b.sheer + 0.25, 0], [a.x, a.sheer + 0.35, 0], null, [0, 1, -0.5]);
    quadF(E, [a.x, a.sheer - 0.05, a.hb * 0.8], [b.x, b.sheer - 0.1, b.hb * 0.8], [b.x, b.sheer + 0.25, 0], [a.x, a.sheer + 0.35, 0], null, [0, 1, 0.5]);
  });
  void rng;
  return { geo: sink.toGeometry(), length: L, beam: B };
}
