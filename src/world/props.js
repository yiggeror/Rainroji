import * as THREE from 'three';
import { PAT } from '../builder.js';
import { col } from '../util.js';
import { quadF } from './parts.js';
import { quv } from './atlas.js';

// Street furniture & everyday clutter. Functions draw in the current frame.

// Outdoor AC unit standing on ground (or on a bracket) against the facade plane z=0
export function acUnit(ctx, x, y, o = {}) {
  const E = ctx.E;
  const w = 0.8, h = 0.56, d = 0.28;
  const z0 = o.z ?? 0.12;
  E.with({ color: col(o.color || '#e2e0d8'), pat: PAT.PLAIN, gloss: 0.3, weather: 0.3 }, () => E.box(x - w / 2, y, z0, x + w / 2, y + h, z0 + d));
  // fan grille
  E.with({ color: col('#4a4c4e'), pat: PAT.GRATE, gloss: 0.2 }, () => {
    const cx = x - 0.1, cy = y + h / 2, r = 0.2;
    const seg = 14;
    const c0 = E._vert(cx, cy, z0 + d + 0.005, 0, 0, 1, 0, 0);
    const ring = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      ring.push(E._vert(cx + Math.cos(a) * r, cy + Math.sin(a) * r, z0 + d + 0.005, 0, 0, 1, Math.cos(a) * r, Math.sin(a) * r));
    }
    for (let i = 0; i < seg; i++) E._tri(c0, ring[i], ring[i + 1]);
  });
  // legs / bracket
  E.with({ color: col('#9a9b98'), pat: PAT.METAL, gloss: 0.3 }, () => {
    if (o.bracket) {
      E.box(x - w / 2 + 0.05, y - 0.05, 0, x - w / 2 + 0.1, y, z0 + d);
      E.box(x + w / 2 - 0.1, y - 0.05, 0, x + w / 2 - 0.05, y, z0 + d);
    } else {
      E.box(x - w / 2, y - 0.12, z0 + 0.02, x + w / 2, y, z0 + d - 0.02);
    }
  });
  // pipe cover climbing into the wall
  if (o.pipe !== false) {
    E.with({ color: col('#dcd6c8'), pat: PAT.PLAIN, gloss: 0.25, weather: 0.2 }, () => {
      const px = x + w / 2 + 0.08;
      E.box(px - 0.05, y + 0.2, 0.0, px + 0.05, y + (o.pipeH || 1.0), 0.1);
      E.box(x + w / 2, y + 0.18, 0.0, px + 0.05, y + 0.3, z0 + 0.12);
    });
  }
  if (!o.bracket) ctx.drip(x + 0.2, y + h + 0.01, z0 + d + 0.01);
}

export function meterBox(ctx, x, y) {
  const E = ctx.E;
  E.with({ color: col('#c8c9c4'), pat: PAT.PLAIN, gloss: 0.3, weather: 0.3 }, () => E.box(x - 0.18, y, 0, x + 0.18, y + 0.42, 0.14));
  E.with({ color: col('#26292b'), pat: PAT.PLAIN, gloss: 0.8 }, () => E.box(x - 0.1, y + 0.2, 0.14, x + 0.1, y + 0.34, 0.15));
}

export function gasMeter(ctx, x, y) {
  const E = ctx.E;
  E.with({ color: col('#b8b3a3'), pat: PAT.METAL, gloss: 0.4, weather: 0.3 }, () => {
    E.box(x - 0.14, y, 0.02, x + 0.14, y + 0.32, 0.2);
    E.box(x - 0.03, y - 0.5, 0.05, x + 0.03, y, 0.11);
    E.box(x - 0.03, y + 0.32, 0.05, x + 0.03, y + 0.6, 0.11);
  });
}

export function waterHeater(ctx, x, y) {
  const E = ctx.E;
  E.with({ color: col('#e8e6e0'), pat: PAT.PLAIN, gloss: 0.3, weather: 0.3 }, () => {
    E.box(x - 0.3, y, 0.1, x + 0.3, y + 1.8, 0.75);
    E.box(x + 0.4, y, 0.12, x + 1.2, y + 0.65, 0.42);
  });
  E.with({ color: col('#4a4c4e'), pat: PAT.GRATE, gloss: 0.2 }, () => E.box(x + 0.5, y + 0.12, 0.42, x + 0.95, y + 0.55, 0.425));
}

// Storage shed (物置)
export function shed(ctx, x, y, z, w = 1.6, d = 0.9, h = 1.9, rot = 0) {
  const E = ctx.E;
  const c = col(ctx.rng.pick(['#d9d3c2', '#c9ccc4', '#b8bfb9', '#d8cdb5']));
  E.frame(x, y, z, rot, () => {
    ctx.foot('shed', 0, 0, w / 2, d / 2);
    E.with({ color: c, pat: PAT.CORR, gloss: 0.4, weather: 0.4 }, () => E.box(-w / 2, 0.08, -d / 2, w / 2, h, d / 2));
    E.with({ color: c.clone().multiplyScalar(0.8), pat: PAT.METAL, gloss: 0.5 }, () => {
      E.box(-w / 2 - 0.05, h, -d / 2 - 0.08, w / 2 + 0.05, h + 0.08, d / 2 + 0.1);
      E.box(-w / 2, 0, -d / 2, w / 2, 0.08, d / 2);
      E.box(-0.02, 0.1, d / 2, 0.02, h - 0.05, d / 2 + 0.02);
      E.box(-w / 2 + 0.1, h * 0.45, d / 2, -w / 2 + 0.16, h * 0.55, d / 2 + 0.03);
    });
  });
}

// Bicycle (mamachari) at x,z facing rotation rot about y
export function bicycle(ctx, x, y, z, rot, o = {}) {
  const E = ctx.E, rng = ctx.rng;
  const fc = col(o.color || rng.pick(['#c9c7c0', '#2e5e8e', '#a12f2f', '#e6e3dc', '#3d5a45', '#d8b54a', '#1d1d1f']));
  const wr = 0.33;
  E.frame(x, y, z, rot, () => {
    ctx.foot('bicycle', 0, 0, 0.85, 0.2);
    // lean on its stand a little
    const lean = new THREE.Matrix4().makeRotationZ(o.lean ?? 0.06);
    E.frameM(lean, () => {
      E.with({ color: col('#232426'), pat: PAT.PLAIN, gloss: 0.3 }, () => {
        for (const wx of [-0.55, 0.55]) {
          const g = new THREE.TorusGeometry(wr, 0.022, 4, 18);
          E.geom(g, new THREE.Matrix4().makeTranslation(wx, wr, 0));
        }
      });
      E.with({ color: col('#b7b9ba'), pat: PAT.METAL, gloss: 0.7 }, () => {
        for (const wx of [-0.55, 0.55]) E.beam([wx, wr, -0.03], [wx, wr, 0.03], 0.05);
      });
      E.with({ color: fc, pat: PAT.METAL, gloss: 0.6 }, () => {
        const r = 0.022;
        E.tube([[-0.55, wr, 0], [-0.1, wr - 0.05, 0], [0.4, wr + 0.42, 0]], r, 4);
        E.tube([[-0.1, wr - 0.05, 0], [-0.22, wr + 0.5, 0]], r, 4);
        E.tube([[-0.55, wr, 0], [-0.24, wr + 0.46, 0]], r * 0.8, 4);
        E.tube([[0.55, wr, 0], [0.4, wr + 0.42, 0], [0.36, wr + 0.62, 0]], r, 4);
        // fenders
        E.tube([[-0.8, wr + 0.12, 0], [-0.62, wr + 0.34, 0], [-0.35, wr + 0.3, 0]], 0.03, 4);
        E.tube([[0.33, wr + 0.28, 0], [0.62, wr + 0.34, 0], [0.8, wr + 0.12, 0]], 0.03, 4);
      });
      E.with({ color: col('#2b2b2b'), pat: PAT.PLAIN, gloss: 0.5 }, () => {
        E.box(-0.34, wr + 0.5, -0.07, -0.12, wr + 0.56, 0.07);
        E.tube([[0.3, wr + 0.64, -0.28], [0.36, wr + 0.64, 0], [0.3, wr + 0.64, 0.28]], 0.016, 4);
      });
      if (o.basket !== false) {
        E.with({ color: col('#9a9d9e'), pat: PAT.GRATE, gloss: 0.5 }, () => {
          E.box(0.46, wr + 0.46, -0.17, 0.78, wr + 0.72, 0.17, { py: true });
        });
      }
      E.with({ color: col('#9a9d9e'), pat: PAT.METAL, gloss: 0.5 }, () => E.box(-0.75, wr + 0.34, -0.1, -0.4, wr + 0.37, 0.1));
    });
  });
}

// Small cars: 'kei' (tall kei car), 'van' (kei van), 'sedan'
export function car(ctx, x, y, z, rot, o = {}) {
  const E = ctx.E, rng = ctx.rng;
  const kind = o.kind || rng.pick(['kei', 'kei', 'van', 'hatch']);
  const paint = col(o.color || rng.pick(['#f1f0ec', '#c9ccd0', '#2b2d31', '#8fa3b8', '#b93b36', '#e8dcc2', '#5d6f5a', '#d9d9d5']));
  const dims = { kei: [3.4, 1.47, 1.7, 0.72], van: [3.4, 1.47, 1.85, 0.85], hatch: [4.0, 1.7, 1.5, 0.75] }[kind];
  const [L, W, H, bh] = dims;
  const glass = col('#27303a');
  E.frame(x, y, z, rot, () => {
    ctx.foot('car', 0, 0, L / 2, W / 2);
    // lower body
    E.with({ color: paint, pat: PAT.PLAIN, gloss: 0.85, weather: 0 }, () => {
      E.box(-L / 2, 0.22, -W / 2, L / 2, bh, W / 2);
      // bumpers
      E.box(-L / 2 - 0.05, 0.22, -W / 2 + 0.04, -L / 2 + 0.1, 0.5, W / 2 - 0.04);
      E.box(L / 2 - 0.1, 0.22, -W / 2 + 0.04, L / 2 + 0.05, 0.5, W / 2 - 0.04);
    });
    // cabin: slanted windshield + roof
    const hood = kind === 'van' ? 0.25 : kind === 'kei' ? 0.55 : 0.9;
    const fx = L / 2 - hood;
    const rx0 = -L / 2 + 0.12, rx1 = fx - (kind === 'van' ? 0.25 : 0.55);
    const iw = W / 2 - 0.08;
    E.with({ color: glass, pat: PAT.PLAIN, gloss: 0.95, weather: 0 }, () => {
      // windshield
      quadF(E, [fx, bh, -iw], [fx, bh, iw], [rx1, H - 0.04, iw], [rx1, H - 0.04, -iw], null, [1, 0.6, 0]);
      // rear window
      quadF(E, [-L / 2 + 0.02, bh, -iw], [-L / 2 + 0.02, bh, iw], [rx0, H - 0.04, iw], [rx0, H - 0.04, -iw], null, [-1, 0.3, 0]);
      // sides
      for (const s of [-1, 1]) {
        quadF(E, [-L / 2 + 0.02, bh, s * (W / 2 - 0.02)], [fx, bh, s * (W / 2 - 0.02)], [rx1, H - 0.04, s * iw], [rx0, H - 0.04, s * iw], null, [0, 0.2, s]);
      }
    });
    E.with({ color: paint, pat: PAT.PLAIN, gloss: 0.85 }, () => {
      E.box(rx0 - 0.02, H - 0.06, -iw - 0.02, rx1 + 0.02, H, iw + 0.02);
      // pillars
      for (const s of [-1, 1]) {
        E.beam([fx, bh, s * (W / 2 - 0.05)], [rx1, H - 0.05, s * iw], 0.07, 0.05);
        E.beam([(rx0 + rx1) / 2, bh, s * (W / 2 - 0.03)], [(rx0 + rx1) / 2, H - 0.05, s * iw], 0.08, 0.04);
      }
    });
    // wheels
    E.with({ color: col('#1e1f21'), pat: PAT.PLAIN, gloss: 0.2 }, () => {
      for (const wx of [-L / 2 + 0.6, L / 2 - 0.6]) for (const s of [-1, 1]) E.frameM(new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(wx, 0.28, s * (W / 2 - 0.12)), () => E.cyl(0, -0.1, 0, 0.28, 0.2, 10));
    });
    // lights
    E.with({ color: col('#f3f1e6'), pat: PAT.PLAIN, gloss: 0.9 }, () => {
      for (const s of [-1, 1]) E.box(L / 2 - 0.02, bh - 0.18, s * (W / 2 - 0.3) - 0.14, L / 2 + 0.02, bh - 0.06, s * (W / 2 - 0.3) + 0.14);
    });
    E.with({ color: col('#8c1d1d'), pat: PAT.PLAIN, gloss: 0.9 }, () => {
      for (const s of [-1, 1]) E.box(-L / 2 - 0.02, bh - 0.22, s * (W / 2 - 0.12) - 0.08, -L / 2 + 0.02, bh - 0.02, s * (W / 2 - 0.12) + 0.08);
    });
    // number plate
    E.with({ color: col(kind === 'hatch' ? '#f2f2ee' : '#e8d84a'), pat: PAT.PLAIN, gloss: 0.4 }, () => E.box(-L / 2 - 0.04, 0.32, -0.17, -L / 2, 0.48, 0.17));
    // drips off the roof edge
    ctx.drip((rx0 + rx1) / 2, H - 0.05, iw + 0.04);
  });
}

// Vending machine standing on the ground, front facing +z of the given frame
export function vendingMachine(ctx, x, y, z, rot, variant = 0) {
  const E = ctx.E;
  const r = ctx.atlasRects['vm' + variant];
  const bodyCol = col(['#f2f1ec', '#e6ebef', '#eeede7'][variant]);
  const accent = col(['#c8282c', '#1d5aa8', '#2f8f4e'][variant]);
  const w = 1.0, h = 1.83, d = 0.72;
  E.frame(x, y, z, rot, () => {
    ctx.foot('vending', 0, -d / 2, w / 2, d / 2);
    E.with({ color: accent, pat: PAT.PLAIN, gloss: 0.6, weather: 0.1 }, () => E.box(-w / 2, 0, -d, w / 2, h, 0));
    E.with({ color: bodyCol, pat: PAT.PLAIN, gloss: 0.6 }, () => E.box(-w / 2 - 0.02, h, -d - 0.02, w / 2 + 0.02, h + 0.06, 0.04));
    E.with({ color: col('#3a3b3d'), pat: PAT.PLAIN }, () => E.box(-w / 2 + 0.02, 0, -d + 0.05, w / 2 - 0.02, 0.08, 0.0));
    ctx.inSink('atlas', () => {
      E.with({ color: col('#ffffff'), pat: PAT.EMIT, emit: 0.95, ex1: variant === 1 ? 2 : 1 }, () => {
        E.quad([-w / 2 + 0.03, 0.1, 0.012], [w / 2 - 0.03, 0.1, 0.012], [w / 2 - 0.03, h - 0.03, 0.012], [-w / 2 + 0.03, h - 0.03, 0.012], quv(r), [0, 0, 1]);
      });
    });
    ctx.addLight(ctx.toWorld(0, 1.1, 0.9), '#eef4ff', 5.5, 1.35, variant === 1 ? 2 : 1);
    ctx.glows.push({ p: ctx.toWorld(0, 1.1, 0.3), color: col('#e9f2ff'), size: 1.1, strength: 0.16, flicker: variant === 1 ? 2 : 1 });
    ctx.hums.push(ctx.toWorld(0, 1, 0.3));
    ctx.drip(-0.3, h + 0.05, 0.05);
    ctx.drip(0.35, h + 0.05, 0.05);
  });
}

// Curve mirror (カーブミラー). Pole at x,z; mirror faces direction rot
export function curveMirror(ctx, x, y, z, rot, o = {}) {
  const E = ctx.E;
  const orange = col('#e36f2a');
  E.frame(x, y, z, rot, () => {
    ctx.foot('mirror', 0, 0, 0.05, 0.05);
    E.with({ color: orange, pat: PAT.METAL, gloss: 0.55, weather: 0.2 }, () => {
      E.cyl(0, 0, 0, 0.038, 3.0, 8);
      E.box(-0.05, 2.55, -0.05, 0.05, 2.65, 0.25);
    });
    E.frame(0, 2.62, 0.25, 0, () => {
      E.with({ color: orange, pat: PAT.METAL, gloss: 0.5 }, () => {
        const g = new THREE.TorusGeometry(0.4, 0.035, 5, 28);
        E.geom(g, null);
        // hood
        const hood = new THREE.CylinderGeometry(0.43, 0.43, 0.14, 20, 1, true, -Math.PI * 0.5, Math.PI);
        E.geom(hood, new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 0.03, 0.06));
        E.box(-0.42, -0.42, -0.06, 0.42, 0.42, -0.04);
      });
      // mirror face: convex, highly reflective
      E.with({ color: col('#3a4148'), pat: PAT.PLAIN, gloss: 1.0, weather: 0 }, () => {
        const g = new THREE.SphereGeometry(1.1, 18, 8, 0, Math.PI * 2, 0, 0.37);
        E.geom(g, new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 0, -1.06));
      });
    });
    if (o.plate) {
      ctx.inSink('atlas', () => {
        const r = ctx.atlasRects[o.plate];
        E.with({ color: col('#ffffff'), pat: PAT.PLAIN, gloss: 0.3 }, () => E.quad([-0.26, 1.9, 0.045], [0.26, 1.9, 0.045], [0.26, 2.1, 0.045], [-0.26, 2.1, 0.045], quv(r), [0, 0, 1]));
      });
    }
  });
}

// Old round red post box (丸ポスト)
export function postBox(ctx, x, y, z, rot) {
  const E = ctx.E;
  E.frame(x, y, z, rot, () => {
    ctx.foot('postbox', 0, 0, 0.29, 0.29);
    E.with({ color: col('#c8231f'), pat: PAT.METAL, gloss: 0.6, weather: 0.1 }, () => {
      E.cyl(0, 0.25, 0, 0.26, 1.05, 16);
      const dome = new THREE.SphereGeometry(0.28, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      E.geom(dome, new THREE.Matrix4().makeTranslation(0, 1.3, 0));
      E.cyl(0, 1.28, 0, 0.29, 0.05, 16);
    });
    E.with({ color: col('#3b3b3b'), pat: PAT.PLAIN, gloss: 0.3 }, () => E.cyl(0, 0, 0, 0.2, 0.25, 12));
    E.with({ color: col('#1d1d1d'), pat: PAT.PLAIN }, () => E.box(-0.12, 1.1, 0.2, 0.12, 1.14, 0.27));
    E.with({ color: col('#eae6da'), pat: PAT.PLAIN }, () => E.box(-0.07, 0.75, 0.24, 0.07, 0.95, 0.27));
  });
}

// Sign post with an atlas sign
export function signPost(ctx, x, y, z, rot, rect, w, h, top = 2.5, o = {}) {
  const E = ctx.E;
  E.frame(x, y, z, rot, () => {
    ctx.foot('sign', 0, 0, 0.05, 0.05);
    E.with({ color: col(o.pole || '#9fa3a6'), pat: PAT.METAL, gloss: 0.5, weather: 0.1 }, () => E.cyl(0, 0, 0, 0.035, top + 0.05, 8));
    ctx.inSink('atlas', () => {
      E.with({ color: col('#ffffff'), pat: PAT.PLAIN, gloss: 0.35, weather: 0 }, () => {
        E.quad([-w / 2, top - h, 0.05], [w / 2, top - h, 0.05], [w / 2, top, 0.05], [-w / 2, top, 0.05], quv(rect), [0, 0, 1]);
      });
    });
    E.with({ color: col('#8a8e90'), pat: PAT.METAL, gloss: 0.4 }, () => E.box(-w / 2, top - h, 0.035, w / 2, top, 0.048));
  });
}

// Concrete block wall along x (x0..x1) at z in the current frame, standing on y=0
export function blockWall(ctx, x0, x1, z, h, o = {}) {
  const E = ctx.E, rng = ctx.rng;
  const t = 0.15;
  const c = col(o.color || rng.pick(['#b3b2ab', '#aeb0ad', '#b9b4a8', '#a6a8a6']));
  if (x1 - x0 < 0.05) return;
  E.with({ color: c, pat: PAT.BLOCK, gloss: 0.15, weather: 0.7, vbase: 0 }, () => E.box(x0, 0, z - t / 2, x1, h, z + t / 2, { ny: true }));
  // cap
  E.with({ color: c.clone().multiplyScalar(0.92), pat: PAT.MORTAR, gloss: 0.4, weather: 0.2 }, () => E.box(x0 - 0.01, h, z - t / 2 - 0.015, x1 + 0.01, h + 0.05, z + t / 2 + 0.015, { ny: true }));
  // decorative pierced blocks sometimes
  if (o.pierced && x1 - x0 > 2.5) {
    E.with({ color: c.clone().multiplyScalar(0.45), pat: PAT.PLAIN }, () => {
      const y = h - 0.4;
      for (let x = x0 + 0.6; x < x1 - 0.6; x += 1.6) E.box(x, y + 0.03, z - t / 2 - 0.002, x + 0.34, y + 0.17, z + t / 2 + 0.002, { ny: true, py: true });
    });
  }
  if (o.fenceTop) {
    E.with({ color: col(o.fenceCol || '#6e706f'), pat: PAT.METAL, gloss: 0.4 }, () => {
      const fh = o.fenceTop;
      E.box(x0, h + fh - 0.04, z - 0.025, x1, h + fh, z + 0.025);
      for (let x = x0 + 0.05; x < x1; x += 0.11) E.box(x - 0.01, h + 0.05, z - 0.01, x + 0.01, h + fh - 0.04, z + 0.01, { ny: true, py: true });
    });
  }
}

// Light aluminium fence along x
export function fence(ctx, x0, x1, z, h = 1.1, o = {}) {
  const E = ctx.E;
  const c = col(o.color || '#7a7d7c');
  E.with({ color: c, pat: PAT.METAL, gloss: 0.45, weather: 0 }, () => {
    E.box(x0, h - 0.04, z - 0.025, x1, h, z + 0.025);
    E.box(x0, 0.06, z - 0.02, x1, 0.1, z + 0.02);
    for (let x = x0; x <= x1 + 0.01; x += 2.0) E.box(x - 0.03, 0, z - 0.03, x + 0.03, h, z + 0.03, { ny: true });
    const step = o.mesh ? 0.25 : 0.12;
    for (let x = x0 + 0.05; x < x1; x += step) E.box(x - 0.008, 0.1, z - 0.008, x + 0.008, h - 0.04, z + 0.008, { ny: true, py: true });
  });
}

// green-mesh fence (公園・線路)
export function meshFence(ctx, x0, x1, z, h = 1.5, colr = '#4f6f52') {
  const E = ctx.E;
  const c = col(colr);
  E.with({ color: c, pat: PAT.METAL, gloss: 0.4 }, () => {
    for (let x = x0; x <= x1 + 0.01; x += 2.0) E.box(x - 0.03, 0, z - 0.03, x + 0.03, h, z + 0.03, { ny: true });
    E.box(x0, h - 0.04, z - 0.02, x1, h, z + 0.02);
  });
  E.with({ color: c.clone().multiplyScalar(0.9), pat: PAT.GRATE, gloss: 0.3 }, () => {
    E.quad([x0, 0.05, z], [x1, 0.05, z], [x1, h - 0.04, z], [x0, h - 0.04, z], [0, 0, (x1 - x0) * 1.3, 0, (x1 - x0) * 1.3, h, 0, h], [0, 0, 1]);
    E.quad([x1, 0.05, z], [x0, 0.05, z], [x0, h - 0.04, z], [x1, h - 0.04, z], [0, 0, (x1 - x0) * 1.3, 0, (x1 - x0) * 1.3, h, 0, h], [0, 0, -1]);
  });
}

// Gate post with name plate, intercom, mailbox and a little lamp
export function gatePost(ctx, x, z, h = 1.35, o = {}) {
  const E = ctx.E, rng = ctx.rng;
  const c = col(o.color || rng.pick(['#b8b5ad', '#8e8a82', '#d4cfc2', '#6f6a64']));
  ctx.foot('gatepost', x, z, 0.3, 0.15);
  // a little proud of the boundary wall it stands in, so their faces never coincide
  const hw = 0.32, hd = 0.17, f = z + hd;
  E.with({ color: c, pat: o.tile ? PAT.TILE : PAT.MORTAR, param: 0.06, gloss: 0.2, weather: 0.4 }, () => E.box(x - hw, 0, z - hd, x + hw, h, z + hd, { ny: true }));
  E.with({ color: c.clone().multiplyScalar(0.85), pat: PAT.PLAIN, gloss: 0.4 }, () => E.box(x - hw - 0.03, h, z - hd - 0.03, x + hw + 0.03, h + 0.05, z + hd + 0.03, { ny: true }));
  // nameplate
  const nr = ctx.atlasRects['name' + rng.int(0, 15)];
  ctx.inSink('atlas', () => E.with({ color: col('#ffffff'), pat: PAT.PLAIN, gloss: 0.4 }, () => E.quad([x - 0.08, h - 0.42, f + 0.005], [x + 0.08, h - 0.42, f + 0.005], [x + 0.08, h - 0.1, f + 0.005], [x - 0.08, h - 0.1, f + 0.005], quv(nr), [0, 0, 1])));
  // intercom
  E.with({ color: col('#e9e8e3'), pat: PAT.PLAIN, gloss: 0.4 }, () => E.box(x + 0.12, h - 0.55, f, x + 0.24, h - 0.37, f + 0.03));
  // mailbox
  E.with({ color: col(rng.pick(['#3a3a38', '#b9b3a4', '#8a4a33', '#2f4a5f'])), pat: PAT.METAL, gloss: 0.5 }, () => E.box(x - 0.18, h - 0.95, f, x + 0.18, h - 0.62, f + 0.15));
  // lamp on top
  if (o.lamp) {
    E.with({ color: col('#ffe2b0'), pat: PAT.EMIT, emit: 1.6 }, () => E.box(x - 0.08, h + 0.05, z - 0.08, x + 0.08, h + 0.26, z + 0.08));
    E.with({ color: col('#3a3a38'), pat: PAT.METAL }, () => E.box(x - 0.1, h + 0.26, z - 0.1, x + 0.1, h + 0.3, z + 0.1));
    ctx.addLight(ctx.toWorld(x, h + 0.35, z + 0.4), '#ffc98a', 3.2, 0.9);
    ctx.glows.push({ p: ctx.toWorld(x, h + 0.16, z), color: col('#ffd49a'), size: 0.7, strength: 0.4 });
  }
}

// Stacked beer crates
export function crates(ctx, x, z, n = 3) {
  const E = ctx.E, rng = ctx.rng;
  for (let i = 0; i < n; i++) {
    const c = col(rng.pick(['#e2b53c', '#c8342c', '#3a6aa8']));
    E.with({ color: c, pat: PAT.GRATE, gloss: 0.4 }, () => E.box(x - 0.2, i * 0.3, z - 0.23, x + 0.2, i * 0.3 + 0.29, z + 0.23));
  }
}

// Wooden/plastic bench
export function bench(ctx, x, z, rot, o = {}) {
  const E = ctx.E;
  E.frame(x, 0, z, rot, () => {
    ctx.foot('bench', 0, -0.05, 0.8, 0.25);
    E.with({ color: col(o.color || '#7a5a40'), pat: PAT.WOOD, gloss: 0.25, weather: 0.3 }, () => {
      for (let i = 0; i < 3; i++) E.box(-0.8, 0.42, -0.2 + i * 0.13, 0.8, 0.46, -0.1 + i * 0.13);
      if (o.back !== false) for (let i = 0; i < 2; i++) E.box(-0.8, 0.6 + i * 0.16, -0.26, 0.8, 0.7 + i * 0.16, -0.23);
    });
    E.with({ color: col('#3a3b3b'), pat: PAT.METAL, gloss: 0.4 }, () => {
      for (const s of [-0.65, 0.65]) {
        E.box(s - 0.03, 0, -0.22, s + 0.03, 0.42, -0.18);
        E.box(s - 0.03, 0, 0.12, s + 0.03, 0.42, 0.16);
        if (o.back !== false) E.box(s - 0.03, 0.42, -0.27, s + 0.03, 0.95, -0.23);
      }
    });
  });
}

// Vinyl umbrella leaning against something (transparent-ish white)
export function umbrella(ctx, x, y, z, rot, open = false) {
  const E = ctx.E;
  E.frame(x, y, z, rot, () => {
    if (!open) {
      E.frameM(new THREE.Matrix4().makeRotationZ(-0.18), () => {
        E.with({ color: col('#d9dde0'), pat: PAT.PLAIN, gloss: 0.8 }, () => E.cyl(0, 0.08, 0, 0.02, 0.62, 8, true, 0.07));
        E.with({ color: col('#e9ecee'), pat: PAT.PLAIN, gloss: 0.9 }, () => E.cyl(0, 0.3, 0, 0.075, 0.45, 8, true, 0.03));
        E.with({ color: col('#b0b3b5'), pat: PAT.METAL, gloss: 0.6 }, () => E.cyl(0, 0, 0, 0.008, 0.95, 4));
        E.with({ color: col('#e8e6e0'), pat: PAT.PLAIN, gloss: 0.4 }, () => E.tube([[0, 0.95, 0], [0, 1.02, 0], [0.05, 1.05, 0], [0.09, 1.0, 0]], 0.012, 4));
      });
    }
  });
}

// Garbage collection point: folding green mesh cage with a few bags
export function garbageStation(ctx, x, z, rot) {
  const E = ctx.E;
  E.frame(x, 0, z, rot, () => {
    ctx.foot('garbage', 0, 0, 0.82, 0.42);
    const g = col('#3d6b4a');
    E.with({ color: g, pat: PAT.METAL, gloss: 0.4 }, () => {
      for (const [a, b] of [[-0.8, -0.4], [0.8, -0.4], [-0.8, 0.4], [0.8, 0.4]]) E.box(a - 0.02, 0, b - 0.02, a + 0.02, 0.95, b + 0.02);
      E.box(-0.82, 0.93, -0.42, 0.82, 0.97, 0.42);
    });
    E.with({ color: g.clone().multiplyScalar(1.1), pat: PAT.GRATE, gloss: 0.3 }, () => {
      E.box(-0.8, 0.02, 0.39, 0.8, 0.93, 0.4);
      E.box(-0.8, 0.02, -0.4, 0.8, 0.93, -0.39);
      E.box(-0.8, 0.02, -0.4, -0.79, 0.93, 0.4);
      E.box(0.79, 0.02, -0.4, 0.8, 0.93, 0.4);
      E.box(-0.8, 0.93, -0.4, 0.8, 0.94, 0.4);
    });
  });
}

// Utility: low curb stone / wheel stop
export function wheelStop(ctx, x, z, rot) {
  const E = ctx.E;
  E.frame(x, 0, z, rot, () => E.with({ color: col('#c7c5bd'), pat: PAT.CONCRETE, gloss: 0.3 }, () => E.box(-0.3, 0, -0.08, 0.3, 0.12, 0.08)));
}

// Galvanised hand rail along a polyline
export function handRail(ctx, pts, h = 0.85, o = {}) {
  const E = ctx.E;
  const c = col(o.color || '#b4b8b9');
  E.with({ color: c, pat: PAT.METAL, gloss: 0.7, weather: 0 }, () => {
    E.tube(pts.map((p) => [p[0], p[1] + h, p[2]]), 0.024, 5);
    if (o.mid) E.tube(pts.map((p) => [p[0], p[1] + h * 0.5, p[2]]), 0.02, 5);
    const step = o.step || 1.8;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
      const n = Math.max(1, Math.round(len / step));
      for (let k = 0; k <= n; k++) {
        if (k === n && i < pts.length - 2) continue;
        const t = k / n;
        const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
        E.cyl(p[0], p[1], p[2], 0.022, h, 6, true);
      }
    }
  });
}

// White steel guard rail (ガードレール) along a polyline
export function guardRail(ctx, pts, o = {}) {
  const E = ctx.E;
  const c = col(o.color || '#eeeeea');
  E.with({ color: c, pat: PAT.METAL, gloss: 0.7, weather: 0.15 }, () => {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
      const n = Math.max(1, Math.round(len / 2));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        E.cyl(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, 0.05, 0.8, 8);
      }
      const dx = (b[0] - a[0]) / len, dz = (b[2] - a[2]) / len;
      const ox = -dz * 0.06, oz = dx * 0.06;
      for (const hh of [0.5, 0.72]) {
        quadF(E, [a[0] + ox, a[1] + hh - 0.1, a[2] + oz], [b[0] + ox, b[1] + hh - 0.1, b[2] + oz], [b[0] + ox, b[1] + hh + 0.1, b[2] + oz], [a[0] + ox, a[1] + hh + 0.1, a[2] + oz], null, [-dz, 0, dx]);
        quadF(E, [a[0] - ox, a[1] + hh - 0.1, a[2] - oz], [b[0] - ox, b[1] + hh - 0.1, b[2] - oz], [b[0] - ox, b[1] + hh + 0.1, b[2] - oz], [a[0] - ox, a[1] + hh + 0.1, a[2] - oz], null, [dz, 0, -dx]);
      }
    }
  });
}

// Street lamp arm glow helper (used by poles)
export function lampHead(ctx, x, y, z, rot) {
  const E = ctx.E;
  E.frame(x, y, z, rot, () => {
    E.with({ color: col('#d8d8d4'), pat: PAT.METAL, gloss: 0.5 }, () => {
      E.box(-0.06, -0.02, 0, 0.06, 0.06, 0.8);
      E.box(-0.12, -0.08, 0.6, 0.12, 0.04, 1.05);
    });
    E.with({ color: col('#fff1d6'), pat: PAT.EMIT, emit: 2.2, ex1: 3 }, () => E.box(-0.1, -0.1, 0.63, 0.1, -0.07, 1.02));
    ctx.addLight(ctx.toWorld(0, -0.5, 0.85), '#ffe7c2', 7.0, 0.55, 3);
    ctx.glows.push({ p: ctx.toWorld(0, -0.14, 0.85), color: col('#fff0d6'), size: 1.2, strength: 0.35, flicker: 3 });
  });
}
