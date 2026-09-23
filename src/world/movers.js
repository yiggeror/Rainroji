import * as THREE from 'three';
import { PAT, Emitter, Sink } from '../builder.js';
import { col } from '../util.js';
import { SEA } from './layout.js';
import { car } from './props.js';
import { makeGlows } from '../fx/glow.js';
import { LAYER_OCC } from '../render.js';
import { U } from '../shaders.js';

// ---------------------------------------------------------------------------
// Quiet things that move: a small car doing its rounds (and stopping for an
// errand at the harbour), a fishing boat crossing far out at sea, gulls
// circling over the harbour.
// ---------------------------------------------------------------------------
export function makeMovers(ctx, { scene, group, material, rng, dynLights }) {
  const out = [];
  const glowList = [];
  const addGlow = (color, size, strength) => {
    glowList.push({ p: new THREE.Vector3(0, -999, 0), color: col(color), size, strength });
    return glowList.length - 1;
  };

  // ---- the car ---------------------------------------------------------------------
  {
    const E = ctx.E;
    const sink = new Sink('car');
    const prev = E.sink;
    E.sink = sink;
    E.frame(0, 0, 0, 0, () => car(ctx, 0, 0, 0, 0, { kind: 'kei', color: '#e8e4da' }));
    // lamps on their own flicker channel (on while driving)
    E.with({ color: col('#fff6dc'), pat: PAT.EMIT, emit: 2.6, ex1: 9 }, () => {
      for (const s of [-1, 1]) E.box(1.69, 0.56, s * 0.5 - 0.13, 1.73, 0.68, s * 0.5 + 0.13);
    });
    E.with({ color: col('#ff3a2a'), pat: PAT.EMIT, emit: 2.0, ex1: 9 }, () => {
      for (const s of [-1, 1]) E.box(-1.74, 0.5, s * 0.62 - 0.07, -1.7, 0.7, s * 0.62 + 0.07);
    });
    E.sink = prev;
    const mesh = new THREE.Mesh(sink.toGeometry(), material);
    mesh.layers.enable(LAYER_OCC);
    group.add(mesh);
    // route: main street south, the harbour road east, the shore road north, the cross
    // street west; driving on the left, corners rounded
    const legs = [[0, 0], [0, 89], [104, 89], [104, 0]];
    const off = 1.25;
    const lines = legs.map((p, i) => {
      const q = legs[(i + 1) % legs.length];
      const dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz);
      const d = [dx / L, dz / L];
      const left = [d[1], -d[0]];
      return { a: [p[0] + left[0] * off, p[1] + left[1] * off], d };
    });
    const pts = [];
    const R = 5.5;
    for (let i = 0; i < lines.length; i++) {
      const A = lines[i], B = lines[(i + 1) % lines.length];
      // corner = intersection of A and B
      const den = A.d[0] * B.d[1] - A.d[1] * B.d[0];
      const t = ((B.a[0] - A.a[0]) * B.d[1] - (B.a[1] - A.a[1]) * B.d[0]) / den;
      const c = [A.a[0] + A.d[0] * t, A.a[1] + A.d[1] * t];
      const p0 = [c[0] - A.d[0] * R, c[1] - A.d[1] * R], p1 = [c[0] + B.d[0] * R, c[1] + B.d[1] * R];
      for (let k = 0; k <= 8; k++) {
        const u = k / 8;
        // quadratic bezier through the corner
        const x = (1 - u) * (1 - u) * p0[0] + 2 * (1 - u) * u * c[0] + u * u * p1[0];
        const z = (1 - u) * (1 - u) * p0[1] + 2 * (1 - u) * u * c[1] + u * u * p1[1];
        pts.push({ x, z, corner: Math.sin(u * Math.PI) });
      }
    }
    pts.push({ ...pts[0] });
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    const L = cum[cum.length - 1];
    const sample = (s) => {
      s = ((s % L) + L) % L;
      let i = 1;
      while (i < cum.length - 1 && cum[i] < s) i++;
      const a = pts[i - 1], b = pts[i];
      const u = (s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
      return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, dx: b.x - a.x, dz: b.z - a.z, corner: a.corner + (b.corner - a.corner) * u };
    };
    // timetable: drive the loop, stop for an errand in front of the co-op, drive on
    const V = 6.2;
    const stopS = cum[9] + 20; // on the harbour road
    const driveA = stopS / V, park = 80, driveB = (L - stopS) / V, rest = 25;
    const P = driveA + park + driveB + rest;
    const light = { p: new THREE.Vector3(), color: new THREE.Color('#fff2d8'), radius: 11, intensity: 0, flicker: 0, dyn: 'car' };
    dynLights.push(light);
    const gH = [addGlow('#fff4dc', 0.5, 0.9), addGlow('#fff4dc', 0.5, 0.9)];
    const gT = [addGlow('#ff4030', 0.3, 0.6), addGlow('#ff4030', 0.3, 0.6)];
    const fwd = new THREE.Vector3(), side = new THREE.Vector3(), tmp = new THREE.Vector3();
    out.push((t, glows) => {
      let u = ((t + 40) % P + P) % P;
      let s, moving = true;
      if (u < driveA) s = Math.min(stopS, V * u - (u > driveA - 2.5 ? (V * (u - (driveA - 2.5)) * (u - (driveA - 2.5))) / 5 : 0));
      else if (u < driveA + park) {
        s = stopS;
        moving = false;
      } else if (u < driveA + park + driveB) {
        const w = u - driveA - park;
        s = stopS + (w < 2.5 ? (V * w * w) / 5 : V * (w - 1.25));
      } else {
        s = L;
        moving = false;
      }
      const q = sample(s);
      const q2 = sample(s + 1.5);
      fwd.set(q2.x - q.x, 0, q2.z - q.z).normalize();
      mesh.position.set(q.x, 0.02, q.z);
      mesh.rotation.set(0, Math.atan2(-fwd.z, fwd.x), 0);
      mesh.updateMatrix();
      const lit = moving ? 1 : 0;
      U.uBlink.value.w = lit ? 1 : 0.05;
      side.set(-fwd.z, 0, fwd.x);
      light.p.set(q.x, 0.9, q.z).addScaledVector(fwd, 5);
      light.intensity = lit * 1.1;
      for (let k = 0; k < 2; k++) {
        const sg = k ? 1 : -1;
        tmp.set(q.x, 0.62, q.z).addScaledVector(fwd, 1.78).addScaledVector(side, sg * 0.5);
        glows.set(gH[k], tmp, lit ? 0.55 : 0);
        tmp.set(q.x, 0.6, q.z).addScaledVector(fwd, -1.78).addScaledVector(side, sg * 0.62);
        glows.set(gT[k], tmp, lit ? 0.3 : 0);
      }
    });
    void driveA;
  }

  // ---- a fishing boat far out at sea -------------------------------------------------
  {
    const bg = ctx.boatGeo;
    const mesh = new THREE.Mesh(bg.geo, material);
    group.add(mesh);
    const g = addGlow('#fff3da', 1.6, 1.2);
    const C = [-20, -10], RX = 330, RZ = 300, SPEED = 3.2;
    const circ = Math.PI * (3 * (RX + RZ) - Math.sqrt((3 * RX + RZ) * (RX + 3 * RZ)));
    const tmp = new THREE.Vector3();
    out.push((t, glows) => {
      const a = (t * SPEED) / ((RX + RZ) / 2) + 1.3;
      const x = C[0] + Math.cos(a) * RX, z = C[1] + Math.sin(a) * RZ;
      const dx = -Math.sin(a) * RX, dz = Math.cos(a) * RZ;
      mesh.position.set(x, SEA - 0.05 + 0.12 * Math.sin(t * 0.9), z);
      mesh.rotation.set(0.03 * Math.sin(t * 0.7), Math.atan2(-dz, dx), 0.05 * Math.sin(t * 0.55));
      mesh.updateMatrix();
      tmp.set(x, SEA + 4.6, z);
      glows.set(g, tmp, 1.6);
    });
    void circ;
  }

  // ---- gulls circling over the harbour ----------------------------------------------------
  {
    const body = new THREE.BufferGeometry();
    const wing = new THREE.BufferGeometry();
    const mk = (geo, E0) => {
      const E = new Emitter();
      const sink = new Sink('g');
      E.sink = sink;
      E0(E);
      const g = sink.toGeometry();
      geo.copy(g);
    };
    mk(body, (E) => {
      E.with({ color: col('#eceae4'), pat: PAT.PLAIN, gloss: 0.3 }, () => {
        E.box(-0.28, -0.07, -0.07, 0.3, 0.07, 0.07);
        E.box(0.3, -0.04, -0.04, 0.4, 0.05, 0.04);
      });
      E.with({ color: col('#e3b83a'), pat: PAT.PLAIN }, () => E.box(0.4, -0.02, -0.015, 0.47, 0.01, 0.015));
      E.with({ color: col('#9ea3a8'), pat: PAT.PLAIN }, () => E.box(-0.42, -0.02, -0.08, -0.28, 0.03, 0.08));
    });
    mk(wing, (E) => {
      E.with({ color: col('#b9bec3'), pat: PAT.PLAIN, gloss: 0.2 }, () => {
        E.box(-0.1, -0.01, 0, 0.14, 0.01, 0.5);
        E.box(-0.14, -0.01, 0.5, 0.06, 0.01, 0.85);
      });
      E.with({ color: col('#3a3d40'), pat: PAT.PLAIN }, () => E.box(-0.12, -0.012, 0.75, 0.04, 0.012, 0.86));
    });
    const gulls = [];
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group();
      const b = new THREE.Mesh(body, material);
      const wl = new THREE.Mesh(wing, material), wr = new THREE.Mesh(wing, material);
      wr.scale.z = -1;
      g.add(b, wl, wr);
      g.scale.setScalar(1.3);
      group.add(g);
      gulls.push({ g, wl, wr, ph: rng.range(0, 6.3), r: rng.range(16, 34), h: rng.range(11, 24), cx: rng.range(35, 75), cz: rng.range(112, 138), w: rng.range(0.12, 0.2) * (rng.chance(0.5) ? 1 : -1) });
    }
    out.push((t) => {
      for (const s of gulls) {
        const a = t * s.w + s.ph;
        const x = s.cx + Math.cos(a) * s.r, z = s.cz + Math.sin(a) * s.r;
        const y = s.h + Math.sin(t * 0.3 + s.ph) * 2;
        s.g.position.set(x, y, z);
        // heading = tangent of the circle; bank into the turn
        const dx = -Math.sin(a) * Math.sign(s.w), dz = Math.cos(a) * Math.sign(s.w);
        s.g.rotation.set(0, Math.atan2(-dz, dx), 0);
        s.g.rotateX(-0.35 * Math.sign(s.w));
        // flap in bursts, glide in between
        const flapping = Math.sin(t * 0.4 + s.ph * 3) > 0.2;
        const f = flapping ? Math.sin(t * 7 + s.ph) * 0.55 : 0.12 + 0.05 * Math.sin(t * 2 + s.ph);
        s.wl.rotation.x = -f;
        s.wr.rotation.x = f;
      }
    });
  }

  // ---- washing machine drums turning in the coin laundry ---------------------------------
  if (ctx.spinners && ctx.spinners.length) {
    const E = new Emitter();
    const sink = new Sink('drum');
    E.sink = sink;
    // a disc of tumbling clothes: coloured wedges
    const cols = ['#d8e0e6', '#3b6db4', '#e0c35a', '#c8463a', '#f2f0ea', '#5a8a5a'];
    const seg = 12;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      E.with({ color: col(cols[(i * 5) % cols.length]), pat: PAT.EMIT, emit: 0.55 }, () => E.tri([0, 0, 0], [Math.cos(a0), Math.sin(a0), 0], [Math.cos(a1), Math.sin(a1), 0], null, [0, 0, 1]));
    }
    const geo = sink.toGeometry();
    const drums = ctx.spinners.map((sp) => {
      const m = new THREE.Mesh(geo, material);
      m.position.copy(sp.p);
      m.scale.setScalar(sp.r);
      m.lookAt(sp.p.clone().add(sp.n));
      group.add(m);
      return { m, speed: sp.speed, base: m.quaternion.clone() };
    });
    const q = new THREE.Quaternion(), z = new THREE.Vector3(0, 0, 1);
    out.push((t) => {
      for (const d of drums) {
        // tumble: turn one way, pause, turn back
        const ph = t * 0.25;
        const ang = Math.sin(ph) > -0.3 ? t * d.speed : -t * d.speed * 0.6;
        q.setFromAxisAngle(z, ang);
        d.m.quaternion.copy(d.base).multiply(q);
      }
    });
  }

  const glows = makeGlows(scene, glowList);
  return {
    update(t) {
      for (const f of out) f(t, glows);
    },
  };
}
