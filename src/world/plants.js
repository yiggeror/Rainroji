import * as THREE from 'three';
import { PAT } from '../builder.js';
import { col } from '../util.js';

// ---------------------------------------------------------------------------
// Leaf atlas: 2x2 tiles drawn on a canvas.
// (0,0) broadleaf cluster (1,0) small leaves (0,1) hydrangea florets (1,1) grass
// ---------------------------------------------------------------------------
export function makeLeafTexture(rng) {
  const S = 1024, T = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d');
  c.clearRect(0, 0, S, S);
  const leaf = (x, y, len, wid, ang, lum) => {
    c.save();
    c.translate(x, y);
    c.rotate(ang);
    const g = Math.round(lum * 255);
    c.fillStyle = `rgb(${g},${Math.round(g * 0.6 + 60)},0)`;
    c.beginPath();
    c.moveTo(0, 0);
    c.quadraticCurveTo(wid, len * 0.45, 0, len);
    c.quadraticCurveTo(-wid, len * 0.45, 0, 0);
    c.fill();
    c.strokeStyle = `rgba(0,0,0,0.18)`;
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(0, len * 0.1);
    c.lineTo(0, len * 0.85);
    c.stroke();
    c.restore();
  };
  // broadleaf cluster
  c.save();
  c.translate(T / 2, T / 2);
  for (let i = 0; i < 150; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.next()) * 180;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    const out = Math.atan2(y, x) - Math.PI / 2 + rng.range(-0.8, 0.8);
    const lum = 0.45 + 0.55 * (1 - r / 200) * rng.range(0.6, 1.0) + (y < 0 ? 0.08 : -0.05);
    leaf(x, y, rng.range(38, 62), rng.range(14, 22), out, Math.min(1, lum));
  }
  c.restore();
  // small leaves (hedge / shrub)
  c.save();
  c.translate(T + T / 2, T / 2);
  for (let i = 0; i < 420; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.next()) * 200;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    leaf(x, y, rng.range(16, 26), rng.range(6, 10), rng.range(0, Math.PI * 2), Math.min(1, 0.4 + 0.6 * rng.next() * (1.1 - r / 240)));
  }
  c.restore();
  // hydrangea florets (round head)
  c.save();
  c.translate(T / 2, T + T / 2);
  for (let i = 0; i < 260; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.next()) * 170;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    const lum = Math.min(1, 0.55 + 0.45 * (1 - r / 190) * rng.range(0.7, 1));
    const g = Math.round(lum * 255);
    c.fillStyle = `rgb(${g},${Math.round(g * 0.9)},0)`;
    c.save();
    c.translate(x, y);
    c.rotate(rng.range(0, 3));
    for (let k = 0; k < 4; k++) {
      c.rotate(Math.PI / 2);
      c.beginPath();
      c.ellipse(0, 7, 6, 8, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = 'rgba(60,40,0,0.5)';
    c.beginPath();
    c.arc(0, 0, 2, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
  c.restore();
  // grass blades
  c.save();
  c.translate(T, T);
  for (let i = 0; i < 90; i++) {
    const x = rng.range(40, T - 40);
    const h = rng.range(200, 470);
    const bend = rng.range(-70, 70);
    const w = rng.range(5, 10);
    const lum = rng.range(0.5, 1.0);
    const g = Math.round(lum * 255);
    c.fillStyle = `rgb(${g},${Math.round(g * 0.6 + 60)},0)`;
    c.beginPath();
    c.moveTo(x - w, T);
    c.quadraticCurveTo(x + bend * 0.3, T - h * 0.5, x + bend, T - h);
    c.quadraticCurveTo(x + bend * 0.3 + w * 0.5, T - h * 0.5, x + w, T);
    c.fill();
  }
  c.restore();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  return tex;
}

const TILES = {
  broad: [0, 0.5, 0.5, 1.0],
  small: [0.5, 0.5, 1.0, 1.0],
  flower: [0, 0, 0.5, 0.5],
  grass: [0.5, 0, 1.0, 0.5],
};

const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _u = new THREE.Vector3(), _w = new THREE.Vector3();

// One foliage card. p: centre, size s, normal-ish orientation dir; normals spherified around `center`.
function card(E, p, s, dir, center, tile, bend = 0.6, shade = 1, rotation = 0) {
  _n.copy(dir).normalize();
  _u.set(0, 1, 0);
  if (Math.abs(_n.y) > 0.9) _u.set(1, 0, 0);
  const U = new THREE.Vector3().crossVectors(_u, _n).normalize();
  const V = new THREE.Vector3().crossVectors(_n, U).normalize();
  if (rotation) {
    const cr = Math.cos(rotation), sr = Math.sin(rotation);
    const u2 = U.clone().multiplyScalar(cr).addScaledVector(V, sr);
    const v2 = V.clone().multiplyScalar(cr).addScaledVector(U, -sr);
    U.copy(u2);
    V.copy(v2);
  }
  const [u0, v0, u1, v1] = TILES[tile];
  const hs = s / 2;
  const corners = [
    [-hs, -hs, u0, v0],
    [hs, -hs, u1, v0],
    [hs, hs, u1, v1],
    [-hs, hs, u0, v1],
  ];
  const saveW = E.b.weather;
  E.b.weather = shade;
  const idx = corners.map(([a, b, uu, vv]) => {
    _p.copy(p).addScaledVector(U, a).addScaledVector(V, b);
    _w.copy(_p).sub(center).normalize().multiplyScalar(bend).addScaledVector(_n, 1 - bend).normalize();
    return E._vert(_p.x, _p.y, _p.z, _w.x, _w.y, _w.z, uu, vv);
  });
  E.b.weather = saveW;
  E._tri(idx[0], idx[1], idx[2]);
  E._tri(idx[0], idx[2], idx[3]);
}

const LEAFS = ['#3f6a3a', '#56823f', '#6f9d4c', '#4c7a4c', '#65803f', '#7ea856', '#3a5f3f'];

// A clump of cards in an ellipsoid volume
export function clump(ctx, cx, cy, cz, rx, ry, rz, o = {}) {
  const E = ctx.E, rng = ctx.rng;
  const center = new THREE.Vector3(cx, cy, cz);
  const n = o.n ? Math.round(o.n) : Math.min(44, Math.round(8 + rx * ry * rz * 10));
  const base = col(o.color || rng.pick(LEAFS));
  const tile = o.tile || 'broad';
  const size = o.size || Math.max(0.35, Math.min(1.9, ((rx + ry + rz) / 3) * 1.0));
  const swayBase = o.sway ?? 0.05;
  const oc = o.outer || center;
  ctx.inSink('leaf', () => {
    for (let i = 0; i < n; i++) {
      // bias points to the shell for crisp silhouettes
      const u = rng.next() * 2 - 1, a = rng.next() * Math.PI * 2;
      const r = Math.pow(rng.next(), 0.35);
      const sx = Math.sqrt(1 - u * u) * Math.cos(a), sy = u, sz = Math.sqrt(1 - u * u) * Math.sin(a);
      const p = new THREE.Vector3(cx + sx * rx * r, cy + sy * ry * r, cz + sz * rz * r);
      const dir = new THREE.Vector3(sx + rng.range(-0.5, 0.5), sy + rng.range(-0.5, 0.5), sz + rng.range(-0.5, 0.5));
      const c = base.clone().offsetHSL(rng.range(-0.02, 0.02), rng.range(-0.05, 0.05), rng.range(-0.04, 0.04));
      E.set({ color: c, pat: 0, sway: swayBase * (0.6 + 0.4 * r) + (o.swayH ? Math.max(0, p.y - (o.swayBaseY || 0)) * o.swayH : 0), ex1: rng.next() });
      card(E, p, size * rng.range(0.75, 1.2), dir, oc, tile, o.bend ?? 0.75, 0.72 + 0.35 * r, rng.range(0, 6.28));
    }
    E.set({ sway: 0, ex1: 0, weather: 0 });
  });
}

// Tree: bent trunk, a few branches and leaf clumps
export function tree(ctx, x, y, z, o = {}) {
  const E = ctx.E, rng = ctx.rng;
  const h = o.h || rng.range(4, 7);
  const cr = o.crown || h * 0.38;
  const trunkCol = col(o.trunk || '#4a3f36');
  const lean = o.lean || [rng.range(-0.3, 0.3), rng.range(-0.3, 0.3)];
  const top = [x + lean[0], y + h * 0.62, z + lean[1]];
  E.with({ color: trunkCol, pat: PAT.WOOD, gloss: 0.15, weather: 0.2, sway: 0 }, () => {
    const pts = [[x, y - 0.1, z], [x + lean[0] * 0.3, y + h * 0.25, z + lean[1] * 0.3], top];
    E.tube(pts, [o.r || h * 0.035, (o.r || h * 0.035) * 0.8, (o.r || h * 0.035) * 0.55], 6);
  });
  const clumps = Math.min(o.clumps || 99, Math.round(3 + h * 0.55));
  const centerY = y + h * 0.66;
  const outer = new THREE.Vector3(top[0], centerY, top[2]);
  const baseCol = o.color || rng.pick(LEAFS);
  for (let i = 0; i < clumps; i++) {
    const a = rng.range(0, Math.PI * 2);
    const rr = rng.range(0.2, 1) * cr * 0.75;
    const cx = top[0] + Math.cos(a) * rr, cz = top[2] + Math.sin(a) * rr;
    const cy = centerY + rng.range(-0.35, 0.45) * cr * (o.flat ? 0.4 : 1);
    // branch
    E.with({ color: trunkCol, pat: PAT.WOOD, gloss: 0.1, sway: 0 }, () => E.tube([top, [(top[0] + cx) / 2, (top[1] + cy) / 2 + 0.2, (top[2] + cz) / 2], [cx, cy, cz]], [h * 0.02, h * 0.012, h * 0.008], 4));
    const s = cr * rng.range(0.45, 0.7);
    clump(ctx, cx, cy, cz, s, s * (o.flat ? 0.45 : 0.8), s, {
      color: col(baseCol).offsetHSL(0, rng.range(-0.05, 0.05), rng.range(-0.04, 0.05)),
      outer,
      tile: o.tile || 'broad',
      sway: 0.04,
      swayH: 0.012,
      swayBaseY: y,
      size: o.leafSize,
    });
  }
  // crown core to avoid see-through holes
  clump(ctx, top[0], centerY, top[2], cr * 0.7, cr * (o.flat ? 0.35 : 0.6), cr * 0.7, { color: col(baseCol).multiplyScalar(0.8), outer, n: Math.min(30, Math.round(cr * cr * 5)), sway: 0.03, swayH: 0.01, swayBaseY: y, size: o.leafSize ? o.leafSize * 1.2 : undefined });
  return { top: centerY + cr };
}

// Rounded shrub on the ground
export function bush(ctx, x, y, z, r, o = {}) {
  clump(ctx, x, y + r * 0.7, z, r, r * 0.75, r, { tile: 'small', sway: 0.03, size: o.size || Math.min(0.9, r * 0.8), ...o });
}

// Hedge between two points along x (in current frame) with height h, thickness t
export function hedge(ctx, x0, x1, z, h, t = 0.6, o = {}) {
  const E = ctx.E, rng = ctx.rng;
  const len = Math.abs(x1 - x0);
  const n = Math.round(len * h * 14);
  const base = col(o.color || rng.pick(['#45703d', '#3e6638', '#577f42']));
  const cx = (x0 + x1) / 2;
  ctx.inSink('leaf', () => {
    for (let i = 0; i < n; i++) {
      const px = rng.range(Math.min(x0, x1), Math.max(x0, x1));
      const face = rng.next();
      let p, d;
      if (face < 0.3) {
        p = new THREE.Vector3(px, h + rng.range(-0.08, 0.05), z + rng.range(-t / 2, t / 2));
        d = new THREE.Vector3(rng.range(-0.3, 0.3), 1, rng.range(-0.3, 0.3));
      } else {
        const s = face < 0.65 ? 1 : -1;
        p = new THREE.Vector3(px, rng.range(0.1, h), z + s * (t / 2 + rng.range(-0.06, 0.06)));
        d = new THREE.Vector3(rng.range(-0.3, 0.3), rng.range(-0.2, 0.4), s);
      }
      const center = new THREE.Vector3(px, h * 0.45, z);
      void cx;
      E.set({ color: base.clone().offsetHSL(0, rng.range(-0.05, 0.05), rng.range(-0.05, 0.05)), sway: 0.015 * (p.y / h), ex1: rng.next() });
      card(E, p, rng.range(0.35, 0.55), d, center, 'small', 0.5, 0.8 + 0.25 * rng.next(), rng.range(0, 6.28));
    }
    E.set({ sway: 0, weather: 0, ex1: 0 });
  });
  // dark core
  E.with({ color: base.clone().multiplyScalar(0.35), pat: PAT.LEAF, gloss: 0 }, () => E.box(Math.min(x0, x1) + 0.05, 0, z - t / 2 + 0.12, Math.max(x0, x1) - 0.05, h - 0.12, z + t / 2 - 0.12, { ny: true }));
}

const HYDRANGEA = ['#6f86c9', '#8a7cc4', '#5f7fbf', '#a08ac8', '#7aa0d2', '#c69ab8', '#e6e9ef'];

export function hydrangea(ctx, x, y, z, r, o = {}) {
  const rng = ctx.rng;
  bush(ctx, x, y, z, r, { color: '#4d7a45', size: Math.min(0.7, r * 0.7) });
  const fc = col(o.flower || rng.pick(HYDRANGEA));
  const E = ctx.E;
  const heads = Math.round(r * r * 10 + 3);
  ctx.inSink('leaf', () => {
    for (let i = 0; i < heads; i++) {
      const u = rng.range(-0.1, 1), a = rng.range(0, Math.PI * 2);
      const sx = Math.sqrt(1 - Math.min(1, u * u)) * Math.cos(a), sz = Math.sqrt(1 - Math.min(1, u * u)) * Math.sin(a);
      const p = new THREE.Vector3(x + sx * r * 0.95, y + r * 0.7 + u * r * 0.75, z + sz * r * 0.95);
      const hs = rng.range(0.22, 0.32);
      const c = fc.clone().offsetHSL(rng.range(-0.03, 0.03), rng.range(-0.08, 0.05), rng.range(-0.06, 0.06));
      E.set({ color: c, sway: 0.04, ex1: rng.next() });
      for (let k = 0; k < 3; k++) {
        const d = new THREE.Vector3(sx + rng.range(-0.6, 0.6), u + rng.range(-0.4, 0.6), sz + rng.range(-0.6, 0.6));
        card(E, p, hs, d, new THREE.Vector3(x, y + r * 0.5, z), 'flower', 0.6, 1.0, rng.range(0, 6));
      }
    }
    E.set({ sway: 0, weather: 0, ex1: 0 });
  });
}

// grass tuft of crossed cards
export function grass(ctx, x, y, z, h = 0.4, o = {}) {
  const E = ctx.E, rng = ctx.rng;
  const c = col(o.color || rng.pick(['#6b8f45', '#7a9a4c', '#5d8040', '#879c55']));
  ctx.inSink('leaf', () => {
    E.set({ color: c.clone().offsetHSL(0, 0, rng.range(-0.05, 0.05)), sway: 0, weather: rng.range(0.85, 1.05), ex1: rng.next() });
    const n = o.n || 2;
    for (let k = 0; k < n; k++) {
      const a = rng.range(0, Math.PI);
      const dx = Math.cos(a) * h * 0.6, dz = Math.sin(a) * h * 0.6;
      const [u0, v0, u1, v1] = TILES.grass;
      const nup = [0, 1, 0];
      const i0 = E._vert(x - dx, y - 0.02, z - dz, nup[0], nup[1], nup[2], u0, v0);
      const i1 = E._vert(x + dx, y - 0.02, z + dz, nup[0], nup[1], nup[2], u1, v0);
      E.b.sway = 0.05 * h;
      const i2 = E._vert(x + dx, y + h, z + dz, 0.2, 1, 0.2, u1, v1);
      const i3 = E._vert(x - dx, y + h, z - dz, 0.2, 1, 0.2, u0, v1);
      E.b.sway = 0;
      E._tri(i0, i1, i2);
      E._tri(i0, i2, i3);
    }
    E.set({ sway: 0, weather: 0 });
  });
}

// row of weeds along a line (x0..x1 at z) in the current frame
export function weeds(ctx, x0, x1, z, y = 0, density = 1.5, h = 0.35) {
  const rng = ctx.rng;
  const n = Math.max(1, Math.round(Math.abs(x1 - x0) * density));
  for (let i = 0; i < n; i++) {
    if (rng.chance(0.35)) continue;
    grass(ctx, rng.range(x0, x1), y, z + rng.range(-0.08, 0.08), h * rng.range(0.5, 1.3));
  }
}

// Ivy patch on a facade (facade frame: plane z=0)
export function ivy(ctx, x0, x1, y0, y1, o = {}) {
  const E = ctx.E, rng = ctx.rng;
  const base = col(o.color || '#4a7340');
  const n = Math.round((x1 - x0) * (y1 - y0) * 9);
  ctx.inSink('leaf', () => {
    for (let i = 0; i < n; i++) {
      const x = rng.range(x0, x1);
      const top = y0 + (y1 - y0) * (1 - Math.abs((x - (x0 + x1) / 2) / ((x1 - x0) / 2)) * rng.range(0.3, 0.9));
      const y = rng.range(y0, top);
      const p = new THREE.Vector3(x, y, 0.06 + rng.range(0, 0.06));
      E.set({ color: base.clone().offsetHSL(0, 0, rng.range(-0.06, 0.06)), sway: 0.01, ex1: rng.next() });
      card(E, p, rng.range(0.3, 0.45), new THREE.Vector3(rng.range(-0.4, 0.4), rng.range(-0.2, 0.5), 1), new THREE.Vector3(x, y, -0.4), 'small', 0.4, 0.8 + 0.3 * rng.next(), rng.range(0, 6));
    }
    E.set({ sway: 0, weather: 0, ex1: 0 });
  });
}

// Flower pot with a plant
export function potPlant(ctx, x, y, z, o = {}) {
  const E = ctx.E, rng = ctx.rng;
  const r = o.r || rng.range(0.12, 0.22);
  const h = r * rng.range(1.0, 1.5);
  const pc = col(o.pot || rng.pick(['#a4583a', '#b8663f', '#3d4f6c', '#e3e1db', '#6a6f72', '#2f3a34', '#8f4b34']));
  E.with({ color: pc, pat: PAT.PLAIN, gloss: 0.35, weather: 0 }, () => E.cyl(x, y, z, r * 0.78, h, 8, true, r));
  E.with({ color: col('#3c2c20'), pat: PAT.SOIL, gloss: 0.1 }, () => E.cyl(x, y + h - 0.03, z, r * 0.95, 0.02, 8, true));
  const kind = o.kind || rng.pick(['round', 'round', 'tall', 'flower', 'spiky']);
  if (kind === 'round') clump(ctx, x, y + h + r * 0.9, z, r * 1.3, r * 1.1, r * 1.3, { tile: rng.pick(['small', 'broad']), size: r * 1.3, sway: 0.02, n: 14 });
  else if (kind === 'tall') {
    clump(ctx, x, y + h + r * 2.4, z, r * 1.2, r * 2.2, r * 1.2, { tile: 'broad', size: r * 1.5, sway: 0.03, n: 18 });
  } else if (kind === 'flower') {
    clump(ctx, x, y + h + r * 0.8, z, r * 1.2, r, r * 1.2, { tile: 'small', size: r * 1.1, sway: 0.02, n: 10 });
    clump(ctx, x, y + h + r * 1.2, z, r * 1.1, r * 0.5, r * 1.1, { tile: 'flower', color: rng.pick(['#d24e6a', '#e8d86a', '#f2f2f0', '#c86ad0', '#ef7f4a']), size: r * 0.7, sway: 0.03, n: 8, bend: 0.3 });
  } else {
    for (let k = 0; k < 3; k++) grass(ctx, x + rng.range(-0.03, 0.03), y + h - 0.02, z + rng.range(-0.03, 0.03), r * 3, { color: '#5b7f3c' });
  }
}

// Bamboo stand
export function bamboo(ctx, x, y, z, n = 8, o = {}) {
  const E = ctx.E, rng = ctx.rng;
  for (let i = 0; i < n; i++) {
    const bx = x + rng.range(-1.2, 1.2), bz = z + rng.range(-1.2, 1.2);
    const h = rng.range(7, 11);
    const lx = rng.range(-0.8, 0.8), lz = rng.range(-0.8, 0.8);
    E.with({ color: col('#7d8f55').offsetHSL(0, 0, rng.range(-0.05, 0.05)), pat: PAT.PLAIN, gloss: 0.4, sway: 0 }, () => {
      const pts = [];
      const sw = [];
      for (let k = 0; k <= 5; k++) {
        const t = k / 5;
        pts.push([bx + lx * t * t, y + h * t, bz + lz * t * t]);
        sw.push(t * t * 0.18);
      }
      E.tube(pts, 0.045, 5, sw);
    });
    clump(ctx, bx + lx, y + h * 0.85, bz + lz, 1.1, 1.6, 1.1, { tile: 'small', color: '#6f9448', size: 0.6, sway: 0.15, n: 30 });
  }
  void o;
}
