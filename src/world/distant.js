import { PAT } from '../builder.js';
import { col } from '../util.js';
import { SEA } from './layout.js';
import { triF } from './parts.js';

// Other islands of the archipelago, far out in the rain: soft silhouettes that
// dissolve into the mist (drawn with the lighter 'far' fog).
export function buildDistant(ctx) {
  const E = ctx.E, rng = ctx.rng;
  const islands = [
    // [angle (rad, 0 = east, pi/2 = south), distance, radius, height, colour]
    [0.05, 2300, 1100, 170, '#4a5a58'], // the mainland the bridge runs to
    [-0.55, 1500, 420, 95, '#3f504c'],
    [-1.25, 1250, 300, 70, '#3c4d48'],
    [-1.9, 1750, 600, 120, '#46574f'],
    [-2.55, 1150, 260, 55, '#3a4b46'],
    [2.9, 1400, 480, 105, '#425349'],
    [2.3, 950, 170, 38, '#394a44'],
    [1.75, 1300, 360, 80, '#3f4f4a'],
    [1.2, 2100, 800, 150, '#4a5b58'],
    [0.7, 1000, 200, 45, '#3a4b45'],
  ];
  ctx.inSink('far', () => {
    for (const [a, d, R, H, c] of islands) {
      const cx = Math.cos(a) * d, cz = Math.sin(a) * d;
      const seg = 36, rings = 6;
      const ph = rng.range(0, 10);
      const rim = (ang) => 1 + 0.14 * Math.sin(ang * 2 + ph) + 0.07 * Math.sin(ang * 3 + ph * 2) + 0.04 * Math.sin(ang * 5 + ph * 3);
      const P = [];
      for (let r = 0; r <= rings; r++) {
        const t = r / rings; // 0 = peak, 1 = shore
        const row = [];
        for (let i = 0; i <= seg; i++) {
          const ang = (i / seg) * Math.PI * 2;
          const rr = R * t * rim(ang);
          // rounded hump with a couple of shoulders
          const bump = Math.pow(Math.max(0, 1 - t * t), 1.3) * (r === 0 ? 0.92 : 0.84 + 0.16 * Math.sin(ang * 2 + ph + r * 0.4));
          const h = t >= 1 ? SEA - 8 : H * bump;
          row.push([cx + Math.cos(ang) * rr, h, cz + Math.sin(ang) * rr]);
        }
        P.push(row);
      }
      E.set({ color: col(c), pat: PAT.LEAF, gloss: 0, weather: 0, param: Math.min(3, d / 800) });
      for (let r = 0; r < rings; r++) {
        for (let i = 0; i < seg; i++) {
          const p00 = P[r][i], p01 = P[r][i + 1], p10 = P[r + 1][i], p11 = P[r + 1][i + 1];
          const up = (a, b, c) => [(a[0] + b[0] + c[0]) / 3 - cx, R * 0.4, (a[2] + b[2] + c[2]) / 3 - cz];
          triF(E, p00, p10, p11, null, up(p00, p10, p11));
          if (r > 0) triF(E, p00, p11, p01, null, up(p00, p11, p01));
        }
      }
    }
  });
  E.set({ pat: 0, param: 0 });
}
