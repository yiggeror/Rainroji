import * as THREE from 'three';
import { PAT } from '../builder.js';
import { col } from '../util.js';

// ---------------------------------------------------------------------------
// Architectural parts. All functions draw into ctx.E in the current frame.
// Facade frames: the facade is the plane z = 0, outward +z, x runs left→right
// as seen from outside, y up.
// ---------------------------------------------------------------------------

const Y = [0, 1, 0];

// quad with automatic orientation towards `want` normal
export function quadF(E, a, b, c, d, uvs, want) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  if (nx * want[0] + ny * want[1] + nz * want[2] < 0) {
    const U = uvs || [0, 0, 1, 0, 1, 1, 0, 1];
    E.quad(a, d, c, b, [U[0], U[1], U[6], U[7], U[4], U[5], U[2], U[3]]);
  } else E.quad(a, b, c, d, uvs);
}
export function triF(E, a, b, c, uvs, want) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  if (nx * want[0] + ny * want[1] + nz * want[2] < 0) {
    const U = uvs || [0, 0, 1, 0, 0.5, 1];
    E.tri(a, c, b, [U[0], U[1], U[4], U[5], U[2], U[3]]);
  } else E.tri(a, b, c, uvs);
}

// Iterate over the 4 facades of a box footprint, calling fn(len, side) inside a facade frame.
// side: 'front' (+z), 'right' (+x), 'back' (-z), 'left' (-x)
export function facades(ctx, x0, z0, x1, z1, y0, fn) {
  const E = ctx.E;
  E.frame(x0, y0, z1, 0, () => fn(x1 - x0, 'front'));
  E.frame(x1, y0, z1, Math.PI / 2, () => fn(z1 - z0, 'right'));
  E.frame(x1, y0, z0, Math.PI, () => fn(x1 - x0, 'back'));
  E.frame(x0, y0, z0, -Math.PI / 2, () => fn(z1 - z0, 'left'));
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------
export const FRAME_COLS = ['#b9bcbd', '#3b3a38', '#8a8d8e', '#5a4a3c', '#d6d6d2'];

export function windowUnit(ctx, x, y, w, h, o = {}) {
  const E = ctx.E, rng = ctx.rng;
  const fw = o.fw ?? 0.05;
  const fd = o.fd ?? 0.06;
  const frameCol = col(o.frame || '#b9bcbd');
  const gw = w - fw * 2, gh = h - fw * 2;
  const lit = o.lit ? 1 : 0;
  const room = o.room || col('#ffffff').lerp(col(rng.pick(['#ffe2b8', '#fff3de', '#e8f0ff'])), 0.7);
  if (o.shutter) {
    // closed amado shutter
    E.with({ color: col(o.shutterCol || '#9ea3a4'), pat: PAT.SHUTTER, gloss: 0.3, weather: 0.4 }, () => E.box(x - w / 2 + 0.02, y + 0.02, 0, x + w / 2 - 0.02, y + h - 0.02, 0.04));
  } else {
    E.with({ color: room, pat: PAT.GLASS, param: o.curtain ?? rng.pick([0, 1, 1, 2, 2, 2, 3]), gloss: 0, emit: lit, weather: rng.next(), ex1: gw, ex2: gh, sway: 0 }, () => {
      E.quad([x - gw / 2, y + fw, 0.012], [x + gw / 2, y + fw, 0.012], [x + gw / 2, y + fw + gh, 0.012], [x - gw / 2, y + fw + gh, 0.012], [0, 0, gw, 0, gw, gh, 0, gh], [0, 0, 1]);
    });
  }
  const BK = { nz: true, ny: true };
  E.with({ color: frameCol, pat: PAT.METAL, gloss: 0.3, weather: 0 }, () => {
    E.box(x - w / 2, y, 0, x + w / 2, y + fw, fd, BK);
    E.box(x - w / 2, y + h - fw, 0, x + w / 2, y + h, fd, { nz: true });
    E.box(x - w / 2, y + fw, 0, x - w / 2 + fw, y + h - fw, fd, { nz: true, ny: true, py: true });
    E.box(x + w / 2 - fw, y + fw, 0, x + w / 2, y + h - fw, fd, { nz: true, ny: true, py: true });
    if (o.slider !== false && !o.shutter && w > 0.8) E.box(x - 0.025, y + fw, 0.01, x + 0.025, y + h - fw, fd + 0.012, { nz: true, ny: true, py: true });
    if (o.transom) E.box(x - w / 2 + fw, y + h * 0.72, 0.01, x + w / 2 - fw, y + h * 0.72 + 0.04, fd, { nz: true, px: true, nx: true });
  });
  // sill
  if (o.sill !== false && !ctx.lod)
    E.with({ color: frameCol.clone().multiplyScalar(0.9), pat: PAT.METAL, gloss: 0.4 }, () => E.box(x - w / 2 - 0.03, y - 0.04, 0, x + w / 2 + 0.03, y, fd + 0.05, BK));
  // window grille (面格子) on small windows
  if (o.grille && !ctx.lod) {
    E.with({ color: col(o.grilleCol || '#a7aaab'), pat: PAT.METAL, gloss: 0.4 }, () => {
      const gz = fd + 0.09;
      E.box(x - w / 2 - 0.02, y - 0.03, fd, x + w / 2 + 0.02, y, gz);
      E.box(x - w / 2 - 0.02, y + h, fd, x + w / 2 + 0.02, y + h + 0.03, gz);
      const n = Math.max(3, Math.round(w / 0.1));
      for (let i = 0; i <= n; i++) {
        const bx = x - w / 2 + (i / n) * w;
        E.box(bx - 0.012, y, gz - 0.025, bx + 0.012, y + h, gz, { ny: true, py: true, nz: true });
      }
    });
  }
  // small awning (庇) over the window
  if (o.hisashi && !ctx.lod) {
    const d = o.hisashi;
    E.with({ color: col(o.hisashiCol || '#6d6f70'), pat: PAT.METAL, gloss: 0.5, weather: 0.2 }, () => {
      const yy = y + h + 0.12;
      quadF(E, [x - w / 2 - 0.15, yy, 0], [x + w / 2 + 0.15, yy, 0], [x + w / 2 + 0.15, yy - d * 0.25, d], [x - w / 2 - 0.15, yy - d * 0.25, d], null, Y);
      quadF(E, [x - w / 2 - 0.15, yy - 0.03, 0], [x + w / 2 + 0.15, yy - 0.03, 0], [x + w / 2 + 0.15, yy - d * 0.25 - 0.03, d], [x - w / 2 - 0.15, yy - d * 0.25 - 0.03, d], null, [0, -1, 0]);
      E.box(x - w / 2 - 0.15, yy - d * 0.25 - 0.05, d - 0.02, x + w / 2 + 0.15, yy - d * 0.25 + 0.01, d);
    });
    // drips from the little awning
    if (ctx.rng.chance(0.5)) ctx.drip(x + ctx.rng.range(-w / 2, w / 2), y + h + 0.05 - d * 0.25, d);
  }
  // shutter box (戸袋) next to large windows
  if (o.tobukuro) {
    const side = o.tobukuro;
    const bx = side > 0 ? x + w / 2 : x - w / 2 - w * 0.5;
    E.with({ color: col(o.tobukuroCol || '#8f9496'), pat: PAT.SHUTTER, gloss: 0.3, weather: 0.3 }, () => E.box(bx, y - 0.02, 0, bx + w * 0.5, y + h + 0.04, 0.16));
    E.with({ color: frameCol, pat: PAT.METAL }, () => E.box(x - w / 2, y + h, 0, x + w / 2, y + h + 0.06, 0.12));
  }
}

// Door with frame; style: 'house' (panel door), 'slide' (old sliding glass door), 'steel' (apartment)
export function door(ctx, x, y, w, h, o = {}) {
  const E = ctx.E;
  const style = o.style || 'house';
  const c = col(o.color || '#6b5140');
  E.with({ color: col(o.frame || '#4a4a48'), pat: PAT.METAL, gloss: 0.3 }, () => {
    E.box(x - w / 2 - 0.06, y, 0, x - w / 2, y + h + 0.06, 0.07);
    E.box(x + w / 2, y, 0, x + w / 2 + 0.06, y + h + 0.06, 0.07);
    E.box(x - w / 2, y + h, 0, x + w / 2, y + h + 0.06, 0.07);
  });
  if (style === 'slide') {
    // wooden lattice sliding doors with frosted glass
    E.with({ color: col('#dfe2e3'), pat: PAT.GLASS, param: 4, emit: o.lit ? 1 : 0, ex1: w, ex2: h, weather: 0.3 }, () =>
      E.quad([x - w / 2, y, 0.01], [x + w / 2, y, 0.01], [x + w / 2, y + h, 0.01], [x - w / 2, y + h, 0.01], [0, 0, w, 0, w, h, 0, h], [0, 0, 1]),
    );
    E.with({ color: c, pat: PAT.WOOD, gloss: 0.1 }, () => {
      for (let i = 0; i <= 4; i++) E.box(x - w / 2 + (i / 4) * w - 0.025, y, 0.01, x - w / 2 + (i / 4) * w + 0.025, y + h, 0.05);
      for (let j = 1; j < 6; j++) E.box(x - w / 2, y + (j / 6) * h - 0.015, 0.01, x + w / 2, y + (j / 6) * h + 0.015, 0.045);
    });
  } else {
    E.with({ color: c, pat: style === 'steel' ? PAT.METAL : PAT.PLAIN, gloss: style === 'steel' ? 0.35 : 0.15 }, () => E.box(x - w / 2, y, 0, x + w / 2, y + h, 0.045));
    // decorative slit window / handle
    if (style === 'house') {
      E.with({ color: col('#dfe4e6'), pat: PAT.GLASS, param: 4, emit: o.lit ? 1 : 0, ex1: 0.12, ex2: h * 0.7 }, () =>
        E.quad([x - w / 2 + 0.12, y + h * 0.15, 0.05], [x - w / 2 + 0.24, y + h * 0.15, 0.05], [x - w / 2 + 0.24, y + h * 0.85, 0.05], [x - w / 2 + 0.12, y + h * 0.85, 0.05], [0, 0, 0.12, 0, 0.12, h * 0.7, 0, h * 0.7], [0, 0, 1]),
      );
    }
    E.with({ color: col('#c9c9c4'), pat: PAT.METAL, gloss: 0.6 }, () => E.box(x + w / 2 - 0.12, y + 0.95, 0.045, x + w / 2 - 0.08, y + 1.3, 0.09));
  }
}

// ---------------------------------------------------------------------------
// Roofs (in the building's local frame; footprint x0..x1, z0..z1)
// ---------------------------------------------------------------------------
function roofSlab(E, top, bottom, uvs, soffitCol, edgeCol, rb) {
  // top: 4 points (quad) or 3 (tri) ; bottom: same count offset below
  if (top.length === 4) {
    quadF(E, top[0], top[1], top[2], top[3], uvs, Y);
    E.with({ color: soffitCol, pat: PAT.PLAIN, gloss: 0.05, weather: 0 }, () => quadF(E, bottom[0], bottom[1], bottom[2], bottom[3], null, [0, -1, 0]));
  } else {
    triF(E, top[0], top[1], top[2], uvs, Y);
    E.with({ color: soffitCol, pat: PAT.PLAIN, gloss: 0.05, weather: 0 }, () => triF(E, bottom[0], bottom[1], bottom[2], null, [0, -1, 0]));
  }
  void edgeCol;
  void rb;
}

export function roofMat(kind, color) {
  if (kind === 'kawara') return { color, pat: PAT.KAWARA, gloss: 0.55, weather: 0 };
  if (kind === 'slate') return { color, pat: PAT.SLATE, gloss: 0.4, weather: 0 };
  if (kind === 'metal') return { color, pat: PAT.CORR, gloss: 0.55, weather: 0 };
  return { color, pat: PAT.MORTAR, gloss: 0.3, weather: 0 };
}

// Gable roof. ridge along x if ridgeX else along z. Returns ridge height.
export function gableRoof(ctx, x0, z0, x1, z1, ye, o) {
  const E = ctx.E;
  const p = o.pitch ?? 0.45, ov = o.ov ?? 0.5, og = o.og ?? 0.4, t = o.t ?? 0.14;
  const soffit = col(o.soffit || '#e9e6de');
  const edge = col(o.edge || '#e6e3dc');
  const mat = roofMat(o.kind, o.color);
  const ridgeX = o.ridgeX !== false;
  // work in a frame where the ridge runs along local x
  const run = ridgeX ? (z1 - z0) / 2 : (x1 - x0) / 2;
  const len = ridgeX ? x1 - x0 : z1 - z0;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const yr = ye + run * p;
  const ye2 = ye - ov * p;
  const tv = t * Math.sqrt(1 + p * p);
  const L = len / 2 + og;
  const slope = Math.sqrt((run + ov) * (run + ov) * (1 + p * p));
  let ridgeTop = yr + tv;
  E.frame(cx, 0, cz, ridgeX ? 0 : Math.PI / 2, () => {
    for (const s of [1, -1]) {
      const ze = s * (run + ov);
      const top = [[-L, ye2 + tv, ze], [L, ye2 + tv, ze], [L, yr + tv, 0], [-L, yr + tv, 0]];
      const bot = [[-L, ye2, ze], [L, ye2, ze], [L, yr, 0], [-L, yr, 0]];
      E.with(mat, () => roofSlab(E, top, bot, [-L, slope, L, slope, L, 0, -L, 0], soffit, edge));
      // eave fascia
      E.with({ color: edge, pat: PAT.PLAIN, gloss: 0.2, weather: 0.2 }, () => {
        quadF(E, [-L, ye2 - 0.04, ze], [L, ye2 - 0.04, ze], [L, ye2 + tv, ze], [-L, ye2 + tv, ze], null, [0, 0, s]);
      });
      // barge boards at the gable ends
      E.with({ color: edge, pat: PAT.PLAIN, gloss: 0.2, weather: 0.2 }, () => {
        for (const e of [-1, 1]) {
          const x = e * L;
          quadF(E, [x, ye2 - 0.05, ze], [x, yr - 0.05, 0], [x, yr + tv + 0.02, 0], [x, ye2 + tv + 0.02, ze], null, [e, 0, 0]);
        }
      });
      // eave gutter
      if (o.gutter !== false) {
        E.with({ color: col(o.gutterCol || '#cfcfca'), pat: PAT.METAL, gloss: 0.5, weather: 0.1 }, () => {
          E.box(-L + 0.05, ye2 - 0.14, ze + s * 0.02 - 0.06, L - 0.05, ye2 - 0.02, ze + s * 0.02 + 0.06);
        });
      } else {
        // no gutter -> water drips along the eave
        for (let x = -L + 0.4; x < L - 0.2; x += ctx.rng.range(0.7, 1.6)) ctx.drip(x, ye2 - 0.05, ze + s * 0.04);
      }
    }
    // gable wall triangles (part of the wall)
    if (o.wall) {
      E.with(o.wall, () => {
        for (const e of [-1, 1]) {
          const x = e * (len / 2);
          const vb = E.b.vbase;
          triF(E, [x, ye, -run], [x, ye, run], [x, yr, 0], [e > 0 ? run * 2 : 0, ye - vb, e > 0 ? 0 : run * 2, ye - vb, run, yr - vb], [e, 0, 0]);
        }
      });
    }
    // ridge cap
    const rc = o.kind === 'kawara' ? 0.3 : 0.14;
    E.with({ ...mat, pat: PAT.PLAIN, gloss: 0.5, color: mat.color.clone().multiplyScalar(0.85) }, () => {
      E.box(-L - 0.02, yr + tv - 0.08, -rc / 2, L + 0.02, yr + tv + rc * 0.6, rc / 2);
      if (o.kind === 'kawara') {
        E.box(-L - 0.02, yr + tv + rc * 0.6, -rc * 0.3, L + 0.02, yr + tv + rc * 0.95, rc * 0.3);
        for (const e of [-1, 1]) E.box(e * L - 0.18, yr + tv - 0.1, -0.22, e * L + 0.18, yr + tv + rc * 1.25, 0.22);
      }
    });
    ridgeTop = yr + tv + rc * 0.9;
  });
  return ridgeTop;
}

// Hip roof (寄棟). Returns ridge height.
export function hipRoof(ctx, x0, z0, x1, z1, ye, o) {
  const E = ctx.E;
  const p = o.pitch ?? 0.42, ov = o.ov ?? 0.55, t = o.t ?? 0.14;
  const soffit = col(o.soffit || '#e9e6de');
  const edge = col(o.edge || '#e6e3dc');
  const mat = roofMat(o.kind, o.color);
  let W = x1 - x0, D = z1 - z0;
  const rot = W < D;
  if (rot) [W, D] = [D, W];
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const hd = D / 2;
  const yr = ye + hd * p, ye2 = ye - ov * p;
  const tv = t * Math.sqrt(1 + p * p);
  const ex = W / 2 + ov, ez = D / 2 + ov;
  const rx = W / 2 - hd;
  const sl = Math.sqrt((hd + ov) * (hd + ov) * (1 + p * p));
  E.frame(cx, 0, cz, rot ? Math.PI / 2 : 0, () => {
    for (const s of [1, -1]) {
      const top = [[-ex, ye2 + tv, s * ez], [ex, ye2 + tv, s * ez], [rx, yr + tv, 0], [-rx, yr + tv, 0]];
      const bot = [[-ex, ye2, s * ez], [ex, ye2, s * ez], [rx, yr, 0], [-rx, yr, 0]];
      E.with(mat, () => roofSlab(E, top, bot, [-ex, sl, ex, sl, rx, 0, -rx, 0], soffit, edge));
      const topS = [[s * ex, ye2 + tv, -ez], [s * ex, ye2 + tv, ez], [s * rx, yr + tv, 0]];
      const botS = [[s * ex, ye2, -ez], [s * ex, ye2, ez], [s * rx, yr, 0]];
      E.with(mat, () => roofSlab(E, topS, botS, [-ez, sl, ez, sl, 0, 0], soffit, edge));
      E.with({ color: edge, pat: PAT.PLAIN, gloss: 0.2 }, () => {
        quadF(E, [-ex, ye2 - 0.04, s * ez], [ex, ye2 - 0.04, s * ez], [ex, ye2 + tv, s * ez], [-ex, ye2 + tv, s * ez], null, [0, 0, s]);
        quadF(E, [s * ex, ye2 - 0.04, -ez], [s * ex, ye2 - 0.04, ez], [s * ex, ye2 + tv, ez], [s * ex, ye2 + tv, -ez], null, [s, 0, 0]);
      });
      if (o.gutter !== false) {
        E.with({ color: col(o.gutterCol || '#cfcfca'), pat: PAT.METAL, gloss: 0.5 }, () => {
          E.box(-ex, ye2 - 0.14, s * ez - 0.06, ex, ye2 - 0.02, s * ez + 0.06);
          E.box(s * ex - 0.06, ye2 - 0.14, -ez, s * ex + 0.06, ye2 - 0.02, ez);
        });
      } else {
        for (let x = -ex + 0.4; x < ex - 0.2; x += ctx.rng.range(0.8, 1.7)) ctx.drip(x, ye2 - 0.05, s * (ez + 0.04));
      }
    }
    const rc = o.kind === 'kawara' ? 0.28 : 0.13;
    E.with({ ...mat, pat: PAT.PLAIN, color: mat.color.clone().multiplyScalar(0.85) }, () => {
      E.box(-rx - 0.1, yr + tv - 0.06, -rc / 2, rx + 0.1, yr + tv + rc * 0.6, rc / 2);
      // hip ridges
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) E.beam([sx * rx, yr + tv + 0.02, 0], [sx * ex, ye2 + tv + 0.02, sz * ez], rc * 0.7, rc * 0.5);
    });
  });
  return yr + tv + 0.1;
}

// Shed roof (片流れ): high at the back (z0), low at the front (z1) unless flip
export function shedRoof(ctx, x0, z0, x1, z1, ye, o) {
  const E = ctx.E;
  const p = o.pitch ?? 0.25, ov = o.ov ?? 0.45, og = o.og ?? 0.35, t = o.t ?? 0.14;
  const soffit = col(o.soffit || '#e9e6de');
  const edge = col(o.edge || '#e6e3dc');
  const mat = roofMat(o.kind, o.color);
  const D = z1 - z0;
  const yLow = ye - ov * p, yHigh = ye + (D + ov) * p;
  const tv = t * Math.sqrt(1 + p * p);
  const a = x0 - og, b = x1 + og;
  const sl = (D + 2 * ov) * Math.sqrt(1 + p * p);
  E.with(mat, () => roofSlab(E, [[a, yLow + tv, z1 + ov], [b, yLow + tv, z1 + ov], [b, yHigh + tv, z0 - ov], [a, yHigh + tv, z0 - ov]], [[a, yLow, z1 + ov], [b, yLow, z1 + ov], [b, yHigh, z0 - ov], [a, yHigh, z0 - ov]], [a, sl, b, sl, b, 0, a, 0], soffit, edge));
  E.with({ color: edge, pat: PAT.PLAIN, gloss: 0.2 }, () => {
    quadF(E, [a, yLow - 0.05, z1 + ov], [b, yLow - 0.05, z1 + ov], [b, yLow + tv, z1 + ov], [a, yLow + tv, z1 + ov], null, [0, 0, 1]);
    quadF(E, [a, yHigh - 0.05, z0 - ov], [b, yHigh - 0.05, z0 - ov], [b, yHigh + tv + 0.05, z0 - ov], [a, yHigh + tv + 0.05, z0 - ov], null, [0, 0, -1]);
    for (const [x, e] of [[a, -1], [b, 1]]) quadF(E, [x, yLow - 0.05, z1 + ov], [x, yHigh - 0.05, z0 - ov], [x, yHigh + tv + 0.05, z0 - ov], [x, yLow + tv, z1 + ov], null, [e, 0, 0]);
  });
  if (o.gutter !== false)
    E.with({ color: col(o.gutterCol || '#cfcfca'), pat: PAT.METAL, gloss: 0.5 }, () => E.box(a + 0.05, yLow - 0.15, z1 + ov - 0.04, b - 0.05, yLow - 0.03, z1 + ov + 0.08));
  else for (let x = a + 0.3; x < b - 0.2; x += ctx.rng.range(0.6, 1.4)) ctx.drip(x, yLow - 0.05, z1 + ov + 0.04);
  // side wall infill up to the roof
  if (o.wall) {
    E.with(o.wall, () => {
      const vb = E.b.vbase;
      for (const [x, e] of [[x0, -1], [x1, 1]]) {
        triF(E, [x, ye, z1], [x, ye, z0], [x, ye + D * p, z0], [0, ye - vb, D, ye - vb, D, ye + D * p - vb], [e, 0, 0]);
      }
      quadF(E, [x0, ye, z0], [x1, ye, z0], [x1, ye + D * p, z0], [x0, ye + D * p, z0], [0, ye - vb, x1 - x0, ye - vb, x1 - x0, ye + D * p - vb, 0, ye + D * p - vb], [0, 0, -1]);
    });
  }
  return yHigh + tv;
}

// Flat roof with parapet
export function flatRoof(ctx, x0, z0, x1, z1, ye, o) {
  const E = ctx.E;
  const ph = o.parapet ?? 0.5, pt = 0.18;
  E.with({ color: col(o.topCol || '#8d9092'), pat: PAT.MORTAR, gloss: 0.5, weather: 0 }, () => E.box(x0 + pt, ye, z0 + pt, x1 - pt, ye + 0.08, z1 - pt, { ny: true }));
  if (o.wall) {
    E.with(o.wall, () => {
      E.box(x0, ye, z1 - pt, x1, ye + ph, z1, { ny: true });
      E.box(x0, ye, z0, x1, ye + ph, z0 + pt, { ny: true });
      E.box(x0, ye, z0 + pt, x0 + pt, ye + ph, z1 - pt, { ny: true, pz: true, nz: true });
      E.box(x1 - pt, ye, z0 + pt, x1, ye + ph, z1 - pt, { ny: true, pz: true, nz: true });
    });
  }
  E.with({ color: col(o.capCol || '#b8b8b2'), pat: PAT.METAL, gloss: 0.5 }, () => E.box(x0 - 0.03, ye + ph, z0 - 0.03, x1 + 0.03, ye + ph + 0.05, z1 + 0.03, { ny: true }));
  return ye + ph + 0.05;
}

// Vertical down pipe from (x,y0) to ground at the facade (in facade frame)
export function downPipe(ctx, x, yTop, yBot, colr) {
  const E = ctx.E;
  E.with({ color: col(colr || '#cfcfca'), pat: PAT.METAL, gloss: 0.5, weather: 0 }, () => {
    E.box(x - 0.035, yBot + 0.15, 0.05, x + 0.035, yTop, 0.12);
    E.box(x - 0.035, yBot + 0.05, 0.05, x + 0.035, yBot + 0.2, 0.2);
    for (let y = yBot + 0.8; y < yTop - 0.3; y += 1.2) E.box(x - 0.05, y, 0.0, x + 0.05, y + 0.03, 0.13);
  });
  ctx.spouts.push(ctx.toWorld(x, yBot + 0.08, 0.2));
}

// Balcony along a facade from xa to xb at floor height y, depth d
export function balcony(ctx, xa, xb, y, d, o = {}) {
  const E = ctx.E, rng = ctx.rng;
  const slab = col(o.slabCol || '#c9c7c0');
  E.with({ color: slab, pat: PAT.MORTAR, gloss: 0.25, weather: 0.5 }, () => E.box(xa, y - 0.18, 0, xb, y, d));
  const style = o.style || rng.pick(['bars', 'panel', 'bars', 'wall']);
  const rc = col(o.railCol || rng.pick(['#9fa3a5', '#56595b', '#b4b0a6', '#3f3d3a']));
  const h = 1.05;
  if (style === 'wall') {
    // solid parapet in wall material
    E.with(o.wall || { color: slab, pat: PAT.MORTAR, weather: 0.6 }, () => {
      E.box(xa, y, d - 0.12, xb, y + h, d, { ny: true });
      E.box(xa, y, 0, xa + 0.12, y + h, d - 0.12, { ny: true });
      E.box(xb - 0.12, y, 0, xb, y + h, d - 0.12, { ny: true });
    });
    E.with({ color: rc, pat: PAT.METAL, gloss: 0.5 }, () => E.box(xa - 0.02, y + h, -0.02, xb + 0.02, y + h + 0.05, d + 0.02, { ny: true }));
  } else {
    E.with({ color: rc, pat: PAT.METAL, gloss: 0.5 }, () => {
      E.box(xa, y + h - 0.05, d - 0.06, xb, y + h, d);
      E.box(xa, y + h - 0.05, 0, xa + 0.06, y + h, d);
      E.box(xb - 0.06, y + h - 0.05, 0, xb, y + h, d);
      E.box(xa, y + 0.02, d - 0.05, xb, y + 0.08, d - 0.01);
      if (style === 'bars') {
        const st = ctx.lod ? 0.3 : 0.13;
        for (let x = xa + 0.06; x < xb; x += st) E.box(x - 0.012, y + 0.08, d - 0.045, x + 0.012, y + h - 0.05, d - 0.02, { ny: true, py: true });
        for (let z = 0.1; z < d - 0.06; z += st) {
          E.box(xa, y + 0.08, z - 0.012, xa + 0.024, y + h - 0.05, z + 0.012, { ny: true, py: true, pz: true, nz: true });
          E.box(xb - 0.024, y + 0.08, z - 0.012, xb, y + h - 0.05, z + 0.012, { ny: true, py: true, pz: true, nz: true });
        }
      }
    });
    if (style === 'panel') {
      // frosted panels
      E.with({ color: col(o.panelCol || '#cfd6da'), pat: PAT.GLASS, param: 4, emit: 0, ex1: xb - xa, ex2: 0.9 }, () => {
        E.quad([xa, y + 0.08, d - 0.03], [xb, y + 0.08, d - 0.03], [xb, y + h - 0.05, d - 0.03], [xa, y + h - 0.05, d - 0.03], [0, 0, xb - xa, 0, xb - xa, 0.9, 0, 0.9], [0, 0, 1]);
      });
      E.with({ color: rc, pat: PAT.METAL }, () => {
        for (let x = xa; x <= xb + 0.01; x += (xb - xa) / Math.max(1, Math.round((xb - xa) / 1.8))) E.box(x - 0.025, y + 0.08, d - 0.06, x + 0.025, y + h - 0.05, d);
      });
    }
  }
  // laundry pole brackets + pole
  if (o.laundry !== false && rng.chance(0.7)) {
    E.with({ color: col('#b8bcbe'), pat: PAT.METAL, gloss: 0.6 }, () => {
      const yy = y + 1.75;
      E.box(xa + 0.3, yy - 0.3, 0, xa + 0.34, yy, 0.45);
      E.box(xb - 0.34, yy - 0.3, 0, xb - 0.3, yy, 0.45);
      E.beam([xa + 0.2, yy - 0.05, 0.4], [xb - 0.2, yy - 0.05, 0.4], 0.035);
    });
  }
  // drips from the balcony edge
  for (let x = xa + 0.3; x < xb; x += rng.range(1.2, 2.6)) ctx.drip(x, y - 0.2, d - 0.02);
}

// Canopy over a door (庇) sticking out of a facade
export function canopy(ctx, x, y, w, d, colr) {
  const E = ctx.E;
  E.with({ color: col(colr || '#e8e6df'), pat: PAT.PLAIN, gloss: 0.3, weather: 0.3 }, () => {
    E.box(x - w / 2, y, 0, x + w / 2, y + 0.12, d);
  });
  for (let xx = x - w / 2 + 0.2; xx < x + w / 2; xx += ctx.rng.range(0.6, 1.1)) ctx.drip(xx, y - 0.01, d - 0.03);
}
