import * as THREE from 'three';

// Small deterministic RNG (mulberry32) so the neighbourhood is the same on every load.
export function makeRng(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    next,
    range: (a, b) => a + (b - a) * next(),
    int: (a, b) => Math.floor(a + (b - a + 1) * next()),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    sign: () => (next() < 0.5 ? -1 : 1),
    // weighted pick: [[item, weight], ...]
    weighted: (list) => {
      let total = 0;
      for (const [, w] of list) total += w;
      let r = next() * total;
      for (const [item, w] of list) {
        if ((r -= w) <= 0) return item;
      }
      return list[list.length - 1][0];
    },
    fork: (salt) => makeRng((Math.floor(next() * 1e9) ^ (salt * 2654435761)) >>> 0),
  };
  return rng;
}

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const _c = new THREE.Color();
// Colours are authored in sRGB hex; returns a linear THREE.Color with optional HSL jitter.
export function col(hex, rng, jh = 0, js = 0, jl = 0) {
  const c = new THREE.Color(hex);
  if (rng && (jh || js || jl)) {
    c.offsetHSL(rng.range(-jh, jh), rng.range(-js, js), rng.range(-jl, jl));
  }
  return c;
}

export function mixCol(a, b, t) {
  return new THREE.Color().copy(a).lerp(b, t);
}

export function shade(c, k) {
  return _c.copy(c).multiplyScalar(k).clone();
}

// 2D hash-based value noise for CPU-side placement decisions
export function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
