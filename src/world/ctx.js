import * as THREE from 'three';
import { Emitter, ChunkSet, Sink } from '../builder.js';
import { makeRng } from '../util.js';

// Shared build context: emitter + the sinks everything is written into.
export function makeCtx() {
  const E = new Emitter();
  const ctx = {
    E,
    rng: makeRng(20240611),
    stat: new ChunkSet('static', 48),
    leaf: new ChunkSet('leaf', 64),
    atlasC: new ChunkSet('atlas', 64),
    ground: new Sink('ground'), // reflective street surfaces at y ~ 0
    far: new Sink('far'), // distant hills & silhouettes
    glass: new Sink('glass'), // clear shop windows (drawn transparent)
    lights: [],
    drips: [], // eave drip points {x,y,z}
    spouts: [], // down-pipe outlets
    gutters: [], // water flow lines [[x,y,z],[x,y,z]]
    ripplePts: [],
    anims: [], // animated objects
    cx: 0,
    cz: 0,
  };
  // Choose the chunk for subsequent geometry by a world position
  ctx.chunk = (x, z) => {
    ctx.cx = x;
    ctx.cz = z;
    E.sink = ctx.stat.get(x, z);
  };
  ctx.useStatic = () => (E.sink = ctx.stat.get(ctx.cx, ctx.cz));
  ctx.useLeaf = () => (E.sink = ctx.leaf.get(ctx.cx, ctx.cz));
  ctx.useAtlas = () => (E.sink = ctx.atlasC.get(ctx.cx, ctx.cz));
  ctx.useGround = () => (E.sink = ctx.ground);
  ctx.inSink = (which, fn) => {
    const prev = E.sink;
    if (which === 'leaf') ctx.useLeaf();
    else if (which === 'atlas') ctx.useAtlas();
    else if (which === 'ground') ctx.useGround();
    else if (which === 'far') E.sink = ctx.far;
    else if (which === 'glass') E.sink = ctx.glass;
    else ctx.useStatic();
    fn();
    E.sink = prev;
  };
  const _v = new THREE.Vector3();
  ctx.toWorld = (x, y, z) => _v.set(x, y, z).applyMatrix4(E.m).clone();
  ctx.addLight = (p, color, radius, intensity, flicker = 0) => {
    ctx.lights.push({ p: p.clone ? p.clone() : new THREE.Vector3(...p), color: new THREE.Color(color), radius, intensity, flicker });
  };
  ctx.drip = (x, y, z) => ctx.drips.push(ctx.toWorld(x, y, z));
  // oriented solid boxes for camera collision (local box + world->local matrix)
  ctx.solids = [];
  ctx.solid = (x0, y0, z0, x1, y1, z1) => {
    const inv = E.m.clone().invert();
    const c = ctx.toWorld((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    const r = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2;
    ctx.solids.push({ mat: E.m.clone(), inv, min: new THREE.Vector3(x0, y0, z0), max: new THREE.Vector3(x1, y1, z1), c, r });
  };
  // footprints of props (oriented rectangles on the ground) for the overlap audit
  ctx.feet = [];
  ctx.foot = (kind, x, z, hx, hz) => {
    const c = ctx.toWorld(x, 0, z);
    const ax = ctx.toWorld(x + 1, 0, z).sub(c).normalize();
    ctx.feet.push({ kind, c, ax, hx, hz, id: ctx.feet.length });
  };
  // axis-aligned world box (terraces etc.)
  ctx.solidWorld = (x0, y0, z0, x1, y1, z1) => {
    const m = new THREE.Matrix4();
    const c = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    const r = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2;
    ctx.solids.push({ mat: m, inv: m.clone(), min: new THREE.Vector3(x0, y0, z0), max: new THREE.Vector3(x1, y1, z1), c, r });
  };
  return ctx;
}
