import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Geometry emitter.
// Everything static in the town is written straight into a handful of big
// indexed buffers ("sinks") that share one toon material. Each vertex carries
// its own colour plus two small material vectors that the shader uses to pick
// a painted pattern (siding, tiles, kawara...), wetness and emission.
// ---------------------------------------------------------------------------

class Grow {
  constructor(Type, n = 4096) {
    this.T = Type;
    this.a = new Type(n);
    this.n = 0;
  }
  ensure(k) {
    if (this.n + k > this.a.length) {
      let len = this.a.length * 2;
      while (len < this.n + k) len *= 2;
      const b = new this.T(len);
      b.set(this.a.subarray(0, this.n));
      this.a = b;
    }
  }
  view() {
    return this.a.slice(0, this.n);
  }
}

export class Sink {
  constructor(name) {
    this.name = name;
    this.pos = new Grow(Float32Array);
    this.nrm = new Grow(Float32Array);
    this.col = new Grow(Float32Array);
    this.uv = new Grow(Float32Array);
    this.ma = new Grow(Float32Array);
    this.mb = new Grow(Float32Array);
    this.idx = new Grow(Uint32Array);
    this.count = 0;
  }
  get empty() {
    return this.count === 0;
  }
  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.view(), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm.view(), 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col.view(), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv.view(), 2));
    g.setAttribute('aMatA', new THREE.BufferAttribute(this.ma.view(), 4));
    g.setAttribute('aMatB', new THREE.BufferAttribute(this.mb.view(), 4));
    g.setIndex(new THREE.BufferAttribute(this.idx.view(), 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// Pattern ids understood by the toon shader (keep in sync with shaders.js)
export const PAT = {
  PLAIN: 0,
  LAP: 1, // lap siding, horizontal boards
  PANEL: 2, // ceramic siding panels
  WOOD: 3, // old dark wooden boards
  TILE: 4, // small wall tiles
  BLOCK: 5, // concrete block wall
  MORTAR: 6, // mortar / concrete with stains
  KAWARA: 7, // Japanese clay roof tiles
  SLATE: 8, // colonial slate roof
  CORR: 9, // corrugated steel
  ASPHALT: 10,
  GLASS: 11,
  EMIT: 12,
  WATER: 14,
  STONE: 15, // kenchi-ishi retaining wall
  GRAVEL: 16,
  SOIL: 17,
  METAL: 18,
  PAINT: 19, // road paint
  GUTTER: 20, // L-shaped concrete gutter
  SHUTTER: 21,
  PAVING: 22,
  AWNING: 23,
  LEAF: 24, // solid foliage blobs
  CARPAINT: 25,
  GRATE: 26,
  RUST: 27,
  CONCRETE: 28, // bare concrete, form-tie holes
};

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _nm = new THREE.Matrix3();

export class Emitter {
  constructor() {
    this.m = new THREE.Matrix4();
    this.nm = new THREE.Matrix3();
    this.stack = [];
    this.sink = null;
    this.b = {
      color: new THREE.Color(1, 1, 1),
      pat: 0,
      param: 0,
      gloss: 0.1,
      emit: 0,
      weather: 0,
      sway: 0,
      ex1: 0,
      ex2: 0,
      grad: null, // [y0, y1, kBottom] vertical colour gradient in local space
      vbase: 0, // local y that maps to v=0 for side faces
    };
    this.bstack = [];
  }

  // ---- state -------------------------------------------------------------
  set(o) {
    const b = this.b;
    for (const k in o) {
      if (k === 'color') b.color = o.color instanceof THREE.Color ? o.color : new THREE.Color(o.color);
      else b[k] = o[k];
    }
    return this;
  }
  with(o, fn) {
    this.bstack.push({ ...this.b });
    this.set(o);
    fn();
    this.b = this.bstack.pop();
    return this;
  }
  push(mat) {
    this.stack.push(this.m.clone());
    this.m.multiply(mat);
    this.nm.getNormalMatrix(this.m);
    return this;
  }
  pop() {
    this.m.copy(this.stack.pop());
    this.nm.getNormalMatrix(this.m);
    return this;
  }
  frame(x, y, z, ry, fn) {
    _m.makeRotationY(ry || 0).setPosition(x, y, z);
    this.push(_m);
    fn();
    this.pop();
    return this;
  }
  frameM(mat, fn) {
    this.push(mat);
    fn();
    this.pop();
  }

  // ---- low level ---------------------------------------------------------
  _vert(x, y, z, nx, ny, nz, u, v) {
    const s = this.sink;
    const b = this.b;
    _v.set(x, y, z).applyMatrix4(this.m);
    _n.set(nx, ny, nz).applyMatrix3(this.nm).normalize();
    if (!(_n.lengthSq() > 0.5) || !Number.isFinite(_v.x + _v.y + _v.z)) {
      // degenerate normal: fall back to up so shading never produces NaN
      if (Emitter.debugBad !== undefined && Emitter.debugBad < 6) {
        Emitter.debugBad++;
        console.log('[bad-normal]', nx, ny, nz, _v.x.toFixed(2), _v.y.toFixed(2), _v.z.toFixed(2), new Error().stack.split('\n').slice(2, 6).join(' | '));
      }
      _n.set(0, 1, 0);
    }
    s.pos.ensure(3);
    s.nrm.ensure(3);
    s.col.ensure(3);
    s.uv.ensure(2);
    s.ma.ensure(4);
    s.mb.ensure(4);
    let k = 1;
    if (b.grad) {
      const t = Math.min(1, Math.max(0, (y - b.grad[0]) / (b.grad[1] - b.grad[0])));
      k = b.grad[2] + (1 - b.grad[2]) * t;
    }
    let p = s.pos.n;
    s.pos.a[p] = _v.x;
    s.pos.a[p + 1] = _v.y;
    s.pos.a[p + 2] = _v.z;
    s.pos.n += 3;
    p = s.nrm.n;
    s.nrm.a[p] = _n.x;
    s.nrm.a[p + 1] = _n.y;
    s.nrm.a[p + 2] = _n.z;
    s.nrm.n += 3;
    p = s.col.n;
    s.col.a[p] = b.color.r * k;
    s.col.a[p + 1] = b.color.g * k;
    s.col.a[p + 2] = b.color.b * k;
    s.col.n += 3;
    p = s.uv.n;
    s.uv.a[p] = u;
    s.uv.a[p + 1] = v;
    s.uv.n += 2;
    p = s.ma.n;
    s.ma.a[p] = b.pat;
    s.ma.a[p + 1] = b.param;
    s.ma.a[p + 2] = b.gloss;
    s.ma.a[p + 3] = b.emit;
    s.ma.n += 4;
    p = s.mb.n;
    s.mb.a[p] = b.weather;
    s.mb.a[p + 1] = typeof b.sway === 'function' ? b.sway(x, y, z) : b.sway;
    s.mb.a[p + 2] = b.ex1;
    s.mb.a[p + 3] = b.ex2;
    s.mb.n += 4;
    return s.count++;
  }
  _tri(a, b, c) {
    const s = this.sink;
    s.idx.ensure(3);
    s.idx.a[s.idx.n++] = a;
    s.idx.a[s.idx.n++] = b;
    s.idx.a[s.idx.n++] = c;
  }

  // Quad with explicit corners (counter-clockwise seen from the front) and uv per corner.
  quad(a, b, c, d, uvs, normal) {
    let nx, ny, nz;
    if (normal) {
      [nx, ny, nz] = normal;
    } else {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
      nx = uy * vz - uz * vy;
      ny = uz * vx - ux * vz;
      nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
    }
    const U = uvs || [0, 0, 1, 0, 1, 1, 0, 1];
    const i0 = this._vert(a[0], a[1], a[2], nx, ny, nz, U[0], U[1]);
    const i1 = this._vert(b[0], b[1], b[2], nx, ny, nz, U[2], U[3]);
    const i2 = this._vert(c[0], c[1], c[2], nx, ny, nz, U[4], U[5]);
    const i3 = this._vert(d[0], d[1], d[2], nx, ny, nz, U[6], U[7]);
    this._tri(i0, i1, i2);
    this._tri(i0, i2, i3);
  }
  tri(a, b, c, uvs, normal) {
    let nx, ny, nz;
    if (normal) [nx, ny, nz] = normal;
    else {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      nx = uy * vz - uz * vy;
      ny = uz * vx - ux * vz;
      nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
    }
    const U = uvs || [0, 0, 1, 0, 0.5, 1];
    const i0 = this._vert(a[0], a[1], a[2], nx, ny, nz, U[0], U[1]);
    const i1 = this._vert(b[0], b[1], b[2], nx, ny, nz, U[2], U[3]);
    const i2 = this._vert(c[0], c[1], c[2], nx, ny, nz, U[4], U[5]);
    this._tri(i0, i1, i2);
  }

  // Vertical wall rectangle from (x0,z0) to (x1,z1) (left→right seen from outside), y0..y1.
  // Outward normal is to the right-hand side when walking from p0 to p1 ... i.e. cross(up, dir) points inward,
  // so we use the convention: outside is where you stand to see p0 on the left.
  wall(x0, z0, x1, z1, y0, y1, u0 = 0) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const vb = this.b.vbase;
    // faces the viewer who sees p0 on their left
    const dx = (x1 - x0) / len, dz = (z1 - z0) / len;
    const n = [-dz, 0, dx];
    this.quad(
      [x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0],
      [u0, y0 - vb, u0 + len, y0 - vb, u0 + len, y1 - vb, u0, y1 - vb],
      n,
    );
  }

  // Axis aligned box in local space. skip: set of 'px','nx','py','ny','pz','nz'
  box(x0, y0, z0, x1, y1, z1, skip) {
    const vb = this.b.vbase;
    const sx = x1 - x0, sz = z1 - z0;
    const sk = skip || NOSKIP;
    // +z face (front)
    if (!sk.pz) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, y0 - vb, sx, y0 - vb, sx, y1 - vb, 0, y1 - vb], [0, 0, 1]);
    // -z face (back)
    if (!sk.nz) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, y0 - vb, sx, y0 - vb, sx, y1 - vb, 0, y1 - vb], [0, 0, -1]);
    // +x
    if (!sk.px) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [0, y0 - vb, sz, y0 - vb, sz, y1 - vb, 0, y1 - vb], [1, 0, 0]);
    // -x
    if (!sk.nx) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [0, y0 - vb, sz, y0 - vb, sz, y1 - vb, 0, y1 - vb], [-1, 0, 0]);
    // top
    if (!sk.py) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [x0, z1, x1, z1, x1, z0, x0, z0], [0, 1, 0]);
    // bottom
    if (!sk.ny) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, z0, x1, z0, x1, z1, x0, z1], [0, -1, 0]);
  }
  boxC(cx, cy, cz, sx, sy, sz, skip) {
    this.box(cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2, skip);
  }
  // box standing on y (bottom at y)
  boxB(cx, y, cz, sx, sy, sz, skip) {
    this.box(cx - sx / 2, y, cz - sz / 2, cx + sx / 2, y + sy, cz + sz / 2, skip || SKIPBOTTOM);
  }

  // Oriented box between two points (a beam / bar), square section w x h.
  beam(a, b, w, h = w, up = [0, 1, 0]) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const d = B.clone().sub(A);
    const len = d.length();
    if (len < 1e-5) return;
    d.divideScalar(len);
    let U = new THREE.Vector3(...up);
    if (Math.abs(U.dot(d)) > 0.98) U = new THREE.Vector3(1, 0, 0);
    const X = new THREE.Vector3().crossVectors(U, d).normalize();
    const Y = new THREE.Vector3().crossVectors(d, X).normalize();
    const M = new THREE.Matrix4().makeBasis(X, Y, d).setPosition(A);
    this.push(M);
    this.box(-w / 2, -h / 2, 0, w / 2, h / 2, len);
    this.pop();
  }

  // Cylinder with its axis along local +Y from y0 to y1.
  cyl(x, y0, z, r, h, seg = 8, caps = true, r2) {
    const rt = r2 === undefined ? r : r2;
    const vb = this.b.vbase;
    const s = this.sink;
    const base = [];
    const slope = (r - rt) / h;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const c = Math.cos(a), sn = Math.sin(a);
      const nl = Math.hypot(1, slope);
      const i0 = this._vert(x + c * r, y0, z + sn * r, c / nl, slope / nl, sn / nl, (i / seg) * Math.PI * 2 * r, y0 - vb);
      const i1 = this._vert(x + c * rt, y0 + h, z + sn * rt, c / nl, slope / nl, sn / nl, (i / seg) * Math.PI * 2 * r, y0 + h - vb);
      base.push([i0, i1]);
    }
    for (let i = 0; i < seg; i++) {
      const [a0, a1] = base[i];
      const [b0, b1] = base[i + 1];
      this._tri(a0, b1, b0);
      this._tri(a0, a1, b1);
    }
    if (caps) {
      const top = this._vert(x, y0 + h, z, 0, 1, 0, x, z);
      const ring = [];
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        ring.push(this._vert(x + Math.cos(a) * rt, y0 + h, z + Math.sin(a) * rt, 0, 1, 0, 0, 0));
      }
      for (let i = 0; i < seg; i++) this._tri(top, ring[i + 1], ring[i]);
    }
    void s;
  }

  // Tube along an arbitrary polyline (points in local space). sways: optional per-point sway weights
  tube(points, r, seg = 4, sways, closed = false) {
    const n = points.length;
    const P = points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    const T = [];
    for (let i = 0; i < n; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
      T.push(b.clone().sub(a).normalize());
    }
    let N0 = new THREE.Vector3(0, 1, 0);
    if (Math.abs(N0.dot(T[0])) > 0.9) N0 = new THREE.Vector3(1, 0, 0);
    const rings = [];
    let prevN = N0;
    const savedSway = this.b.sway;
    let acc = 0;
    for (let i = 0; i < n; i++) {
      if (i > 0) acc += P[i].distanceTo(P[i - 1]);
      const B = new THREE.Vector3().crossVectors(T[i], prevN).normalize();
      const N = new THREE.Vector3().crossVectors(B, T[i]).normalize();
      prevN = N;
      const ring = [];
      if (sways) this.b.sway = sways[i];
      const rr = Array.isArray(r) ? r[i] : r;
      for (let k = 0; k <= seg; k++) {
        const a = (k / seg) * Math.PI * 2;
        const c = Math.cos(a), s = Math.sin(a);
        const nx = N.x * c + B.x * s, ny = N.y * c + B.y * s, nz = N.z * c + B.z * s;
        ring.push(this._vert(P[i].x + nx * rr, P[i].y + ny * rr, P[i].z + nz * rr, nx, ny, nz, k / seg, acc));
      }
      rings.push(ring);
    }
    this.b.sway = savedSway;
    for (let i = 0; i < n - 1; i++) {
      for (let k = 0; k < seg; k++) {
        const a = rings[i][k], b = rings[i][k + 1], c = rings[i + 1][k + 1], d = rings[i + 1][k];
        this._tri(a, b, c);
        this._tri(a, c, d);
      }
    }
    void closed;
  }

  // Append a three.js BufferGeometry transformed by `mat` (optional) in the current frame.
  geom(g, mat, uvScale = 1) {
    if (mat) this.push(mat);
    const pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv;
    const map = new Uint32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      map[i] = this._vert(
        pos.getX(i), pos.getY(i), pos.getZ(i),
        nrm ? nrm.getX(i) : 0, nrm ? nrm.getY(i) : 1, nrm ? nrm.getZ(i) : 0,
        uv ? uv.getX(i) * uvScale : 0, uv ? uv.getY(i) * uvScale : 0,
      );
    }
    if (g.index) {
      const I = g.index.array;
      for (let i = 0; i < I.length; i += 3) this._tri(map[I[i]], map[I[i + 1]], map[I[i + 2]]);
    } else {
      for (let i = 0; i < pos.count; i += 3) this._tri(map[i], map[i + 1], map[i + 2]);
    }
    if (mat) this.pop();
  }

  // Extruded polygon (xz outline, counter-clockwise from above) from y0 to y1
  prism(pts, y0, y1, withTop = true, withBottom = false) {
    const n = pts.length;
    let area = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      area += a[0] * b[1] - b[0] * a[1];
    }
    if (area < 0) pts = pts.slice().reverse();
    let u = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      // outline CCW from above -> outside is on the right when walking a->b ... wall() expects viewer-left = p0
      this.wall(b[0], b[1], a[0], a[1], y0, y1, u);
      u += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    if (withTop) this.poly(pts, y1, true);
    if (withBottom) this.poly(pts, y0, false);
  }
  // Flat polygon (convex or simple) at height y using earcut from THREE.ShapeUtils
  poly(pts, y, up = true) {
    const contour = pts.map((p) => new THREE.Vector2(p[0], p[1]));
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    const idx = pts.map((p) => this._vert(p[0], y, p[1], 0, up ? 1 : -1, 0, p[0], p[1]));
    for (const t of tris) {
      // ShapeUtils returns CW/CCW depending on contour; ensure facing
      const a = pts[t[0]], b = pts[t[1]], c = pts[t[2]];
      const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      // with x right, z down(towards viewer): cross<0 means CCW when seen from +y
      const faceUp = cross < 0;
      if (faceUp === up) this._tri(idx[t[0]], idx[t[1]], idx[t[2]]);
      else this._tri(idx[t[0]], idx[t[2]], idx[t[1]]);
    }
  }
}

const NOSKIP = {};
export const SKIPBOTTOM = { ny: true };
export const SKIP = (s) => {
  const o = {};
  for (const k of s.split(',')) o[k.trim()] = true;
  return o;
};

// Holds a set of sinks split into spatial chunks so large areas can be frustum-culled.
export class ChunkSet {
  constructor(name, cell = 40) {
    this.name = name;
    this.cell = cell;
    this.map = new Map();
  }
  get(x, z) {
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    const key = cx + ',' + cz;
    let s = this.map.get(key);
    if (!s) {
      s = new Sink(this.name + key);
      this.map.set(key, s);
    }
    return s;
  }
  sinks() {
    return [...this.map.values()].filter((s) => !s.empty);
  }
}
