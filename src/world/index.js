import * as THREE from 'three';
import { U, NUM_LIGHTS, makeToonMaterial, makeFoliageMaterial, makeGlassMaterial } from '../shaders.js';
import { Sink, PAT } from '../builder.js';
import { col } from '../util.js';
import { LAYER_OCC, LAYER_NOREFL } from '../render.js';
import { makeCtx } from './ctx.js';
import { Atlas, paintAtlas } from './atlas.js';
import { makeRoads, T1, CANAL, RAIL, SEA, naturalHeight, coastInfo } from './layout.js';
import { buildRoads, buildTerraces, buildCutWalls } from './streets.js';
import { buildTerrain, buildSea, buildWoods, buildRocks } from './terrain.js';
import { buildCoast, buildBoatGeometry } from './coast.js';
import { buildPaddies, buildBeach } from './fields.js';
import { detached, oldHouse } from './house.js';
import { apartment, cornerShop, closedShop, workshop, mansion, parkingLot, field, park, vacant, shrine, fishMarket, coopOffice, boatShed } from './buildings.js';
import { buildPoles } from './poles.js';
import { buildRail, buildTrain, railY } from './rail.js';
import { buildCanal } from './canal.js';
import { buildDistant } from './distant.js';
import { makeMovers } from './movers.js';
import { shopHouse, izakaya } from './shops.js';
import { makeLeafTexture, tree, hydrangea, bush, grass } from './plants.js';
import { curveMirror, signPost, garbageStation, bicycle, vendingMachine } from './props.js';
import { makeGlows } from '../fx/glow.js';

const BUILD = {
  house: detached,
  old: oldHouse,
  apartment,
  shop: cornerShop,
  closed: closedShop,
  workshop,
  mansion,
  parking: parkingLot,
  field,
  park,
  vacant,
  fishmarket: fishMarket,
  coop: coopOffice,
  boatshed: boatShed,
  kissa: (ctx, lot, o) => shopHouse(ctx, lot, { ...o, kind: 'kissa' }),
  barber: (ctx, lot, o) => shopHouse(ctx, lot, { ...o, kind: 'barber' }),
  laundry: (ctx, lot, o) => shopHouse(ctx, lot, { ...o, kind: 'laundry', floors: 2 }),
  bakery: (ctx, lot, o) => shopHouse(ctx, lot, { ...o, kind: 'bakery' }),
  izakaya,
};

function inPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function buildWorld(scene, renderer) {
  const ctx = makeCtx();
  const rng = ctx.rng;
  ctx.glows = [];
  ctx.hums = [];
  ctx.crossLamps = [];
  ctx.dropPoints = [];
  // ---- textures
  const atlas = new Atlas(2048, 3072);
  paintAtlas(atlas, rng.fork(3));
  ctx.atlasRects = atlas.rects;
  const atlasTex = atlas.texture();
  const leafTex = makeLeafTexture(rng.fork(7));
  const roads = makeRoads();

  // ---- lots -----------------------------------------------------------------
  const lots = [];
  const makeLot = (road, side, sa, sb, item, depth) => {
    const sm = (sa + sb) / 2;
    const p = road.at(sm);
    const off = road.w / 2 + 0.02;
    const x = p.x + p.right.x * side * off, z = p.z + p.right.z * side * off;
    const zx = -p.right.x * side, zz = -p.right.z * side;
    const rot = Math.atan2(zx, zz);
    const level = item.level ?? p.y;
    const d = item.depth ?? depth;
    const lot = { road, side, s0: sa, s1: sb, w: sb - sa, depth: d, level, x, z, rot, type: item.type, opts: item, pad: item.pad ?? Math.max(0, level - (item.padBase ?? 0)), lod: item.lod };
    lotGeom(lot);
    return lot;
  };
  // world corners + bbox of a lot (x,z = middle of the road edge, depth into the lot)
  function lotGeom(lot) {
    const c = Math.cos(lot.rot), s = Math.sin(lot.rot), d = lot.depth;
    const pts = [[-lot.w / 2, 0], [lot.w / 2, 0], [lot.w / 2, -d], [-lot.w / 2, -d]].map(([lx, lz]) => [lot.x + lx * c + lz * s, lot.z - lx * s + lz * c]);
    lot.bbox = { minX: Math.min(...pts.map((q) => q[0])), maxX: Math.max(...pts.map((q) => q[0])), minZ: Math.min(...pts.map((q) => q[1])), maxZ: Math.max(...pts.map((q) => q[1])) };
    lot.corners = pts;
  }
  const along = (roadId, side, s0, s1, plan = [], o = {}) => {
    const road = roads[roadId];
    const run = [];
    let s = s0, i = 0;
    let guard = 0;
    while (s < s1 - 4.5 && guard++ < 60) {
      const item = plan[i] || { type: 'house', w: rng.range(8.5, 11.5), ...(o.fill || {}) };
      let w = Math.min(item.w, s1 - s);
      if (!plan[i + 1] && i >= plan.length - 1 && s1 - (s + w) < 5.5) w = s1 - s;
      // avoid street openings
      let blocked = null;
      for (const [a, b] of road.gaps[side]) if (s < b && s + w > a) blocked = [a, b];
      if (blocked) {
        if (blocked[0] - s > 5) w = blocked[0] - s - 0.1;
        else {
          s = blocked[1] + 0.1;
          continue;
        }
      }
      const lot = makeLot(road, side, s, s + w, { ...item, lod: item.lod ?? o.lod }, o.depth ?? 12);
      if (o.level !== undefined && item.level === undefined) lot.level = o.level;
      if (o.padBase !== undefined) lot.pad = Math.max(0, lot.level - o.padBase);
      run.push(lot);
      s += w;
      i++;
    }
    run.forEach((l, k) => {
      if (side > 0) {
        l.drawRight = true;
        if (k === run.length - 1) l.drawLeft = true;
      } else {
        l.drawLeft = true;
        if (k === run.length - 1) l.drawRight = true;
      }
    });
    lots.push(...run);
    return run;
  };
  const S1 = (z) => 91.3 - z;
  const seg2 = roads.main.segs[1], seg3 = roads.main.segs[2];
  const S2 = (z) => seg2.s0 + ((-40 - z) / 58) * seg2.len;
  const S3 = (z) => seg3.s0 + (-98 - z);

  // main street, east side (depth 14)
  along('main', 1, 4.8, S1(52.4), [{ type: 'house', w: 10 }, { type: 'house', w: 10.5 }, { type: 'house', w: 10.2 }], { depth: 14 });
  along('main', 1, S1(47.5), S1(2.8), [{ type: 'house', w: 11, park: true }, { type: 'parking', w: 10.5 }, { type: 'barber', w: 7.8 }, { type: 'house', w: 15.4, style: 'showa', tree: true }], { depth: 14 });
  along('main', 1, S1(-2.8), S1(-20.8), [{ type: 'shop', w: 12.4, depth: 13 }, { type: 'house', w: 5.6, floors: 3, park: false, style: 'modern' }], { depth: 14 });
  along('main', 1, S1(-23.2), S1(-39.6), [{ type: 'house', w: 8.2, style: 'lap' }, { type: 'house', w: 8.2, style: 'showa' }], { depth: 14 });
  along('main', 1, S2(-40.6), S2(-97.4), [{ type: 'closed', w: 9 }, { type: 'house', w: 8, style: 'tile' }, { type: 'house', w: 6.4, floors: 3, park: false }, { type: 'mansion', w: 14.5, depth: 14 }, { type: 'house', w: 7.5 }, { type: 'workshop', w: 11.5 }], { depth: 14 });
  // main street, west side
  along('main', -1, 4.8, S1(52.4), [{ type: 'house', w: 10.6 }, { type: 'old', w: 14 }], { depth: 12 });
  along('main', -1, S1(47.5), S1(2.8), [{ type: 'house', w: 11, style: 'modern' }, { type: 'old', w: 15.5 }, { type: 'house', w: 11.4, park: true }, { type: 'kissa', w: 6.8, setback: 1.0 }], { depth: 12 });
  along('main', -1, S1(-2.8), S1(-37.3), [{ type: 'house', w: 11.8, style: 'showa', tree: true }, { type: 'house', w: 10.8, style: 'lap' }, { type: 'field', w: 11.8 }], { depth: 12 });
  along('main', -1, S2(-55.8), S2(-96.8), [{ type: 'apartment', w: 15 }, { type: 'house', w: 9.6 }, { type: 'vacant', w: 7.4 }, { type: 'house', w: 9.2 }], { depth: 12 });
  // cross street (west): lots behind the main-street lots, deep gardens
  along('crossW', -1, 12.6, 23.3, [{ type: 'old', w: 10.7, depth: 18 }], {});
  along('crossW', 1, 12.6, 23.3, [{ type: 'house', w: 10.7, depth: 12 }], {});
  along('slope', -1, 12.6, 23.3, [{ type: 'house', w: 10.7, depth: 17.8, style: 'modern' }], {});
  // slope road, north side (stepping up)
  along('slope', 1, 0.6, 36.4, [{ type: 'house', w: 11.8, level: 0.35 }, { type: 'house', w: 11.9, level: 1.55, style: 'showa' }, { type: 'house', w: 12, level: 2.85, style: 'lap' }], { depth: 12 });
  along('slope', 1, 39.2, 62.5, [{ type: 'house', w: 11.4, level: 4.6 }, { type: 'old', w: 11.6, level: 5.8 }], { depth: 11 });
  along('slope', -1, 40.2, 62.5, [{ type: 'house', w: 11, level: 4.9 }, { type: 'house', w: 11.2, level: 6.1, style: 'showa' }], { depth: 11 });
  along('slope', 1, 64.4, 88.5, [{ type: 'house', w: 11.8, level: 7.2 }, { type: 'house', w: 12, level: 8.3, style: 'modern' }], { depth: 11 });
  along('slope', -1, 64.4, 77.2, [{ type: 'house', w: 12.6, level: 7.4 }], { depth: 11 });
  // upper road on T1
  along('upper', 1, 0.6, 93.4, [{ type: 'house', w: 10.4 }, { type: 'old', w: 12.6 }, { type: 'house', w: 10.2 }, { type: 'house', w: 10.8, style: 'showa' }, { type: 'vacant', w: 8.6 }, { type: 'house', w: 10.4 }, { type: 'house', w: 10.4 }, { type: 'house', w: 10.2 }], { depth: 11.9, padBase: 4 });
  along('upper', -1, 0.6, 93.4, [{ type: 'house', w: 10.8 }, { type: 'house', w: 10 }, { type: 'apartment', w: 14 }, { type: 'house', w: 10.6 }, { type: 'house', w: 10 }, { type: 'old', w: 13 }], { depth: 12, padBase: 4 });
  // cross street east
  along('crossE', -1, 14.7, 29.3, [{ type: 'house', w: 14.6, style: 'showa' }], { depth: 12 });
  along('crossE', -1, 33.9, 87.2, [], { depth: 12 });
  along('crossE', 1, 14.7, 87.2, [{ type: 'park', w: 20, depth: 22 }, { type: 'house', w: 10 }, { type: 'old', w: 13 }], { depth: 12 });
  // east lane
  along('east', -1, 2.4, 67.8, [{ type: 'house', w: 15.2 }, { type: 'house', w: 10.5 }, { type: 'house', w: 10 }, { type: 'apartment', w: 14 }], { depth: 14 });
  along('east', 1, 2.4, 84, [], { depth: 12 });
  // south streets
  along('southW', -1, 12.6, 23.3, [{ type: 'house', w: 10.7 }], {});
  along('southW', 1, 12.6, 23.3, [{ type: 'house', w: 10.7 }], {});
  along('southE', -1, 16.6, 61, [], { depth: 12 });
  along('southE', 1, 16.6, 61, [{ type: 'house', w: 10 }, { type: 'mansion', w: 16, depth: 14, floors: 5 }], { depth: 12 });
  // canal-side path lots (facing the water)
  along('canalSE', 1, 16, 23.5, [{ type: 'house', w: 7.5 }], { depth: 11 });
  along('canalSE', 1, 29.8, 63, [], { depth: 12 });
  // the harbour road: houses on the town side, the fish market and sheds on the quay
  along('coastSE', -1, 14.6, 61.4, [{ type: 'house', w: 11.2, style: 'tile' }, { type: 'izakaya', w: 9 }, { type: 'old', w: 12.4 }, { type: 'bakery', w: 8.8 }, { type: 'house', w: 5.4, floors: 3, park: false }], { depth: 20.4 });
  along('coastSE', -1, 63.5, 85.2, [{ type: 'house', w: 10.8, style: 'showa' }, { type: 'house', w: 10.9 }], { depth: 12 });
  along('coastSE', 1, 11.5, 95.8, [{ type: 'coop', w: 13 }, { type: 'fishmarket', w: 26 }, { type: 'boatshed', w: 14 }, { type: 'vacant', w: 9 }, { type: 'boatshed', w: 12.5 }, { type: 'parking', w: 10 }], { depth: 12.2 });
  along('coastS', -1, 4.2, 14.4, [{ type: 'old', w: 10.2 }], { depth: 22.4 });
  // the east shore road
  along('coastE', -1, 4.8, 75.2, [{ type: 'house', w: 11 }, { type: 'laundry', w: 9.2 }, { type: 'old', w: 13 }, { type: 'house', w: 10.4 }, { type: 'house', w: 11.4, style: 'lap' }, { type: 'house', w: 10 }], { depth: 12 });
  along('coastE', -1, 107.2, 174.6, [{ type: 'house', w: 11.4 }, { type: 'field', w: 11 }, { type: 'old', w: 14 }, { type: 'house', w: 10.6 }, { type: 'field', w: 9.8 }, { type: 'house', w: 10.6 }], { depth: 12 });

  // ---- lots must not overlap: trim depths (then widths) where corners collide -------
  {
    const poly = (l) => l.corners.map(([x, z]) => ({ x, z }));
    const overlap = (A, B) => {
      for (const P of [A, B]) {
        for (let i = 0; i < 4; i++) {
          const a = P[i], b = P[(i + 1) % 4];
          const nx = -(b.z - a.z), nz = b.x - a.x, L = Math.hypot(nx, nz);
          let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
          for (const q of A) { const d = (q.x * nx + q.z * nz) / L; amin = Math.min(amin, d); amax = Math.max(amax, d); }
          for (const q of B) { const d = (q.x * nx + q.z * nz) / L; bmin = Math.min(bmin, d); bmax = Math.max(bmax, d); }
          if (amax < bmin + 0.15 || bmax < amin + 0.15) return false;
        }
      }
      return true;
    };
    const minDepth = (l) => (l.type === 'park' ? 12 : 7.5);
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < lots.length; i++) {
        for (let j = i + 1; j < lots.length; j++) {
          const A = lots[i], B = lots[j];
          if (A.bbox.maxX < B.bbox.minX || B.bbox.maxX < A.bbox.minX || A.bbox.maxZ < B.bbox.minZ || B.bbox.maxZ < A.bbox.minZ) continue;
          let guard = 0;
          while (overlap(poly(A), poly(B)) && guard++ < 40) {
            // shorten the deeper lot first
            const L = A.depth - minDepth(A) >= B.depth - minDepth(B) ? A : B;
            if (L.depth > minDepth(L) + 0.01) L.depth = Math.max(minDepth(L), L.depth - 0.5);
            else {
              // both at minimum: narrow the later one from the side facing the other
              B.w -= 0.5;
              B.s0 += 0.25;
              B.s1 -= 0.25;
            }
            lotGeom(L);
            lotGeom(B);
          }
        }
      }
    }
  }

  // ---- build everything --------------------------------------------------------
  buildRoads(ctx, roads);
  buildTerraces(ctx, roads, lots);
  for (const lot of lots) {
    ctx.chunk(lot.x, lot.z);
    ctx.lod = lot.lod || 0;
    const fn = BUILD[lot.type] || detached;
    ctx.E.frame(lot.x, lot.level, lot.z, lot.rot, () => fn(ctx, lot, lot.opts));
  }
  ctx.lod = 0;
  buildPoles(ctx, roads);
  // rice paddies east of the town (holes in the terrain)
  const PADDIES = [[50, 88, -84, -18], [66, 88, 18, 64]];
  const base = new Sink('base');
  const terr = buildTerrain(ctx, roads, lots, { holes: PADDIES, baseSink: base });
  const H = terr.H;
  buildCutWalls(ctx, roads, lots, H);
  buildSea(ctx, terr.sea, terr.grid);
  for (const r of PADDIES) buildPaddies(ctx, r);
  const coast = buildCoast(ctx);
  // harbour apron: concrete from the road to the quay edge
  ctx.inSink('ground', () => ctx.E.with({ color: col('#a19f98'), pat: PAT.CONCRETE, gloss: 0.5, weather: 0 }, () => {
    for (let x = 12; x < 100; x += 22) {
      const xb = Math.min(100, x + 22);
      ctx.E.quad([x, 0.0, 105], [xb, 0.0, 105], [xb, 0.0, 91.3], [x, 0.0, 91.3], [x, 105, xb, 105, xb, 91.3, x, 91.3], [0, 1, 0]);
    }
  }));
  const boats = [];
  buildBeach(ctx, H, boats);
  const lotFree = (x, z, m = 1) => {
    for (const lot of lots) {
      const b = lot.bbox;
      if (x > b.minX - m && x < b.maxX + m && z > b.minZ - m && z < b.maxZ + m) return false;
    }
    return true;
  };
  const roadList0 = Object.values(roads);
  const woodsFree = (x, z) => {
    for (const r of roadList0) if (r.closest(x, z).d < r.w / 2 + 1.5) return false;
    if (!lotFree(x, z)) return false;
    if (x > -87 && x < -24.5 && z > -39 && z < 65) return false; // the terrace
    if (Math.abs(z - RAIL.z) < 9 && x > RAIL.portal - 3) return false; // rail cutting
    if (z > CANAL.z1 - 4 && z < CANAL.z0 + 3) return false;
    const e = roads.slope.at(roads.slope.length);
    if (Math.hypot(x - e.x, z - e.z) < 22) return false; // the shrine precinct plants its own
    return true;
  };
  buildWoods(ctx, H, woodsFree);
  buildRocks(ctx, H);
  // shrine at the top of the slope
  {
    const end = roads.slope.at(roads.slope.length);
    const d = end.dir;
    shrine(ctx, end.x + d.x * 0.3, end.y, end.z + d.z * 0.3, Math.atan2(-d.x, -d.z));
  }
  // the terrace (T1) is solid below its top, except for the stair notch
  ctx.solidWorld(-86, -1, 1.3, -26, T1.level - 0.03, 64);
  ctx.solidWorld(-86, -1, -38, -26, T1.level - 0.03, -1.3);
  ctx.solidWorld(-86, -1, -1.3, -33.6, T1.level - 0.03, 1.3);
  buildRail(ctx);
  buildCanal(ctx);
  buildDistant(ctx);

  // ---- street furniture at key spots -----------------------------------------------
  // curve mirror at the NW corner of the start junction, looking down the cross street
  ctx.chunk(-3, -3);
  curveMirror(ctx, -3.05, 0, -2.75, Math.PI * 0.8, {});
  curveMirror(ctx, 2.95, 0, -40.1, -Math.PI * 0.62, {});
  // stop signs on the minor road approaches
  signPost(ctx, -3.3, 0, 2.6, -Math.PI / 2, ctx.atlasRects.stop, 0.72, 0.65, 2.55);
  signPost(ctx, 3.3, 0, -2.6, Math.PI / 2, ctx.atlasRects.stop, 0.72, 0.65, 2.55);
  signPost(ctx, -3.0, 0, -37.8, -Math.PI / 2 + 0.2, ctx.atlasRects.stop, 0.72, 0.65, 2.55);
  signPost(ctx, 2.95, 0, -13.5, 0, ctx.atlasRects.bluesign, 0.6, 0.6, 2.6);
  signPost(ctx, 3.3, 0, -112, Math.PI, ctx.atlasRects.fumikiri, 0.7, 0.7, 2.4);
  // a lone vending machine by the canal path
  ctx.chunk(-8, -97.6);
  vendingMachine(ctx, -9.5, 0, -97.3, Math.PI, 1);
  // hydrangeas along the T1 wall foot
  for (let z = 5; z < 36; z += rng.range(2.4, 4)) {
    ctx.chunk(-25, z);
    hydrangea(ctx, -25.35, 0, z, rng.range(0.45, 0.65));
  }
  for (let z = -3; z > -36; z -= rng.range(2.4, 4)) {
    ctx.chunk(-25, z);
    if (rng.chance(0.6)) hydrangea(ctx, -25.35, 0, z, rng.range(0.45, 0.6));
    else bush(ctx, -25.4, 0, z, 0.5);
  }
  // big old tree at the bottom of the slope (visible from the start)
  ctx.chunk(-18, -45);
  tree(ctx, -16.5, 1.55, -46.5, { h: 11, crown: 3.8, color: '#4a7a3f', clumps: 12, leafSize: 1.2 });

  // ---- meshes --------------------------------------------------------------------
  const toon = makeToonMaterial();
  const toonGround = makeToonMaterial({ reflect: true });
  const toonAtlas = makeToonMaterial({ atlas: atlasTex, polygonOffset: true });
  const foliage = makeFoliageMaterial(leafTex);
  const far = makeToonMaterial();
  far.defines.FAR = 1;
  const group = new THREE.Group();
  scene.add(group);
  const addMesh = (sink, mat, occ = true) => {
    if (!sink || sink.empty) return null;
    const m = new THREE.Mesh(sink.toGeometry(), mat);
    m.matrixAutoUpdate = false;
    if (occ) m.layers.enable(LAYER_OCC);
    group.add(m);
    return m;
  };
  let verts = 0;
  for (const s of ctx.stat.sinks()) {
    addMesh(s, toon);
    verts += s.count;
  }
  for (const s of ctx.leaf.sinks()) {
    addMesh(s, foliage);
    verts += s.count;
  }
  for (const s of ctx.atlasC.sinks()) addMesh(s, toonAtlas);
  const groundMesh = addMesh(ctx.ground, toonGround);
  addMesh(base, toon);
  const glassMesh = addMesh(ctx.glass, makeGlassMaterial(), false);
  if (glassMesh) glassMesh.renderOrder = 2;
  const seaFar = addMesh(ctx.seaFar, toon, false);
  if (seaFar) seaFar.frustumCulled = false;
  const farMesh = addMesh(ctx.far, far, false);
  if (farMesh) farMesh.frustumCulled = false;
  verts += ctx.ground.count;
  if (/[?&]stats/.test(location.search)) console.log('[rainroji] vertices', verts, 'lights', ctx.lights.length, 'drips', ctx.drips.length);

  // ---- crossing gates + train --------------------------------------------------------
  const gates = ctx.gateSpecs.map((g) => {
    const pivot = new THREE.Group();
    pivot.position.copy(g.pivot);
    pivot.rotation.y = g.rot;
    const arm = new THREE.Mesh(g.geo, toon);
    arm.layers.enable(LAYER_NOREFL);
    arm.layers.disable(LAYER_NOREFL);
    pivot.add(arm);
    group.add(pivot);
    return { pivot, arm, dir: g.dir };
  });
  const trainDef = buildTrain(ctx);
  const train = new THREE.Mesh(trainDef.geo, toon);
  train.frustumCulled = false;
  group.add(train);

  // glows (lamp halos)
  const glows = makeGlows(scene, ctx.glows);

  // ---- light selection -----------------------------------------------------------------
  for (const lp of coast.lamps) ctx.lights.push({ p: lp.p.clone(), color: new THREE.Color(lp.red ? '#ff5a3c' : '#fff2d8'), radius: 14, intensity: 1.4, flicker: lp.red ? 6 : 7 });
  const L = ctx.lights;
  const dynLights = [
    { p: new THREE.Vector3(), color: new THREE.Color('#ff3020'), radius: 6, intensity: 0, flicker: 0, dyn: 'cross' },
    { p: new THREE.Vector3(), color: new THREE.Color('#fff4d8'), radius: 16, intensity: 0, flicker: 0, dyn: 'train' },
  ];
  const tmp = new THREE.Vector3();
  function pickLights(camera) {
    const cp = camera.position;
    const all = L.concat(dynLights.filter((d) => d.intensity > 0.01));
    const scored = all.map((l) => ({ l, d: l.p.distanceTo(cp) - l.radius * 2 }));
    scored.sort((a, b) => a.d - b.d);
    for (let i = 0; i < NUM_LIGHTS; i++) {
      const e = scored[i];
      if (!e) {
        U.uLightPos.value[i].set(0, -1000, 0, 0.001);
        U.uLightCol.value[i].set(0, 0, 0, 0);
        continue;
      }
      const l = e.l;
      const fl = l.flicker === 1 ? U.uFlicker.value.x : l.flicker === 2 ? U.uFlicker.value.y : l.flicker === 3 ? U.uFlicker.value.z : l.flicker === 6 ? U.uBlink.value.x : l.flicker === 7 ? U.uBlink.value.y : 1;
      U.uLightPos.value[i].set(l.p.x, l.p.y, l.p.z, l.radius);
      U.uLightCol.value[i].set(l.color.r, l.color.g, l.color.b, l.intensity * fl);
    }
    void tmp;
  }

  // ---- train timetable ------------------------------------------------------------------------
  // Westbound trains come off the sea bridge out of the mist, stop at the station and
  // leave into the tunnel; eastbound ones come out of the tunnel, stop, and head out
  // over the sea. Everything is a pure function of time (works for any t).
  const LEN = trainDef.length;
  function makeRun(dir, x0, v0, xStop, a1, dwell, a2, v2, xEnd) {
    const bd = (v0 * v0) / (2 * a1);
    const xb = xStop - dir * bd;
    const T1 = Math.abs(xb - x0) / v0, T2 = v0 / a1, T3 = dwell, T4 = v2 / a2, d4 = (v2 * v2) / (2 * a2);
    const T5 = Math.max(0, (Math.abs(xEnd - xStop) - d4) / v2);
    const total = T1 + T2 + T3 + T4 + T5;
    const at = (t) => {
      if (t < T1) return { x: x0 + dir * v0 * t, v: v0 };
      t -= T1;
      if (t < T2) return { x: xb + dir * (v0 * t - 0.5 * a1 * t * t), v: v0 - a1 * t };
      t -= T2;
      if (t < T3) return { x: xStop, v: 0, stopped: true, depart: T3 - t };
      t -= T3;
      if (t < T4) return { x: xStop + dir * 0.5 * a2 * t * t, v: a2 * t };
      t -= T4;
      return { x: xStop + dir * (d4 + v2 * t), v: v2 };
    };
    return { dir, total, at, track: dir < 0 ? RAIL.tracks[0] : RAIL.tracks[1] };
  }
  const runW = makeRun(-1, 720, 16, RAIL.platform[0] - 0.3, 0.8, 24, 0.75, 13, RAIL.portal - 330);
  const runE = makeRun(1, RAIL.portal - 300, 12, RAIL.platform[1] + 0.2, 0.8, 24, 0.7, 16, 720);
  const GAP = 14;
  const PERIOD = runW.total + runE.total + GAP * 2;
  function trainAt(t) {
    let u = ((t % PERIOD) + PERIOD) % PERIOD;
    if (u < runW.total) return { run: runW, ...runW.at(u) };
    u -= runW.total + GAP;
    if (u >= 0 && u < runE.total) return { run: runE, ...runE.at(u) };
    return null;
  }
  const CX = 6; // level crossing on the main street
  const occupied = (t) => {
    const s = trainAt(t);
    if (!s) return false;
    const tail = s.x - s.run.dir * LEN;
    const lo = Math.min(s.x, tail), hi = Math.max(s.x, tail);
    return hi > CX - 14 && lo < CX + 14;
  };
  let gateAngle = 0;
  const state = { train: { x: 9999, dir: 1, active: false }, crossing: 0, bellPhase: 0 };
  const ss = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
  function updateTrain(t, dt) {
    const s = trainAt(t);
    if (s) {
      const dir = s.run.dir, head = s.x, tail = head - dir * LEN;
      const mid = (head + tail) / 2;
      const y = railY(mid) - 0.2 + 0.2;
      if (dir > 0) {
        train.position.set(head - LEN, y, s.run.track);
        train.rotation.set(0, 0, Math.atan2(railY(head) - railY(tail), LEN));
      } else {
        train.position.set(head + LEN, y, s.run.track);
        train.rotation.set(0, Math.PI, Math.atan2(railY(tail) - railY(head), LEN));
      }
      // hidden once it is deep in the tunnel or lost in the fog
      train.visible = Math.max(head, tail) > RAIL.portal - 150 && Math.min(head, tail) < 760;
      train.updateMatrix();
      train.updateMatrixWorld();
      dynLights[1].p.set(head + dir * 6, railY(head) + 1.3, s.run.track);
      dynLights[1].intensity = train.visible && head > RAIL.portal - 10 && head < 420 ? 1.2 : 0;
      state.train = { x: head, dir, active: train.visible, z: s.run.track, v: s.v, stopped: !!s.stopped };
    } else {
      train.visible = false;
      dynLights[1].intensity = 0;
      state.train = { x: 9999, dir: 1, active: false };
    }
    // crossing: gates start down ~7 s before the train arrives and lift once it has cleared
    let ahead = -1;
    for (let k = 0; k <= 16; k++) if (occupied(t + k * 0.5)) { ahead = k * 0.5; break; }
    let since = -1;
    if (ahead < 0) for (let k = 1; k <= 12; k++) if (occupied(t - k * 0.5)) { since = k * 0.5; break; }
    const on = ahead >= 0 ? 1 : 0;
    if (ahead >= 0) gateAngle = 1 - ss(3.5, 7.5, ahead);
    else if (since >= 0) gateAngle = 1 - ss(0.5, 4.5, since);
    else gateAngle = 0;
    for (const g of gates) {
      g.pivot.rotation.z = 0;
      g.arm.rotation.set(0, 0, (1 - gateAngle) * (Math.PI / 2) * 0.96);
      g.pivot.updateMatrixWorld(true);
    }
    const blink = on || gateAngle > 0.05 ? (Math.sin(t * Math.PI * 2 * 0.9) > 0 ? 1 : 0) : 0;
    U.uCrossing.value.set(on * blink, on * (1 - blink));
    const lamp = ctx.crossLamps[0];
    if (lamp) {
      dynLights[0].p.copy(lamp.p);
      dynLights[0].intensity = on * 1.2;
    }
    state.crossing = on;
    state.crossEta = ahead >= 0 ? ahead : 0;
    void dt;
  }

  // ---- harbour: bobbing boats, lighthouse flashes --------------------------------------------
  const boatGeos = [0, 1, 2].map((v) => buildBoatGeometry(v, rng));
  // moored along the quay (double-banked in places) and inside the breakwaters
  for (let x = 17, i = 0; x < 94; x += rng.range(12.5, 15), i++) {
    const v = i % 3;
    boats.push({ x, z: 105.9 + boatGeos[v].beam / 2, rot: i % 2 ? 0 : Math.PI, variant: v });
    if (rng.chance(0.35)) boats.push({ x: x + rng.range(-1, 1), z: 106.1 + boatGeos[v].beam + boatGeos[(v + 1) % 3].beam / 2 + 0.4, rot: i % 2 ? Math.PI : 0, variant: (v + 1) % 3 });
  }
  boats.push({ x: 14, z: 128, rot: -1.45, variant: 1 });
  boats.push({ x: 97, z: 132, rot: 1.62, variant: 0 });
  const boatMeshes = boats.map((b) => {
    const m = new THREE.Mesh(boatGeos[b.variant].geo, toon);
    m.position.set(b.x, b.beached ? b.y : SEA, b.z);
    m.rotation.set(0, b.rot, b.tilt || 0);
    m.layers.enable(LAYER_OCC);
    m.userData = { ph: rng.range(0, 6.28), ph2: rng.range(0, 6.28), beached: !!b.beached };
    group.add(m);
    return m;
  });
  ctx.boatGeo = boatGeos[1];
  const movers = makeMovers(ctx, { scene, group, material: toon, rng, dynLights });
  function updateHarbour(t) {
    movers.update(t);
    for (const m of boatMeshes) {
      if (m.userData.beached) continue;
      const { ph, ph2 } = m.userData;
      m.position.y = SEA - 0.05 + 0.07 * Math.sin(t * 0.8 + ph) + 0.03 * Math.sin(t * 1.9 + ph2);
      m.rotation.x = 0.025 * Math.sin(t * 0.63 + ph2);
      m.rotation.z = 0.012 * Math.sin(t * 0.5 + ph);
      m.updateMatrix();
    }
    // red: one long flash every 4 s; white: two short flashes every 6 s
    const r = (t % 4) < 1.1 ? 1 : 0.04;
    const w6 = t % 6;
    const w = (w6 < 0.35 || (w6 > 0.9 && w6 < 1.25)) ? 1 : 0.04;
    U.uBlink.value.x = r;
    U.uBlink.value.y = w;
    U.uBlink.value.z = 1;
  }

  // ---- flicker ------------------------------------------------------------------------------
  function updateFlicker(t) {
    // vending machine 1: calm; vending machine 2: an occasional stutter; lamps: slow breathing
    const f1 = 1 - 0.04 * Math.max(0, Math.sin(t * 0.7)) * Math.sin(t * 13);
    const burst = Math.sin(t * 0.23) > 0.97 ? (Math.sin(t * 47) > 0 ? 0.55 : 1.0) : 1.0;
    const f2 = (0.97 + 0.03 * Math.sin(t * 2.1)) * burst;
    const f3 = 0.94 + 0.06 * Math.sin(t * 0.9 + Math.sin(t * 0.37) * 2);
    U.uFlicker.value.set(f1, f2, f3, 1);
  }

  // ---- ground height for camera ----------------------------------------------------------------
  const roadList = Object.values(roads);
  function groundAt(x, z) {
    // stairs up to the terrace
    if (x > -33.7 && x < -25.9 && Math.abs(z) < 1.35) return THREE.MathUtils.clamp((-26 - x) / 7.6, 0, 1) * T1.level;
    for (const r of roadList) {
      const c = r.closest(x, z);
      if (c.d < r.w / 2 + 0.3) return c.y;
    }
    for (const lot of lots) {
      const b = lot.bbox;
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
      const dx = x - lot.x, dz = z - lot.z;
      const c = Math.cos(lot.rot), s = Math.sin(lot.rot);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) <= lot.w / 2 && lz <= 0 && lz >= -lot.depth) return lot.level;
    }
    if (inPoly(x, z, T1.poly)) return T1.level;
    return H(x, z);
  }

  // floor for the camera: ground, or the water surface in the canal
  function floorAt(x, z, y = Infinity) {
    if (z < CANAL.z0 && z > CANAL.z1 && x > CANAL.x0 && x < CANAL.x1 + 3 && (y < -0.9 || !(x > 3.2 && x < 8.8))) return CANAL.water;
    return Math.max(groundAt(x, z), SEA);
  }

  // ---- solids: spatial grid, ray casts and 3D push-out for the camera ----------------------
  const CELL = 16;
  const grid = new Map();
  for (const b of ctx.solids) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const v = new THREE.Vector3();
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
      v.set(x, y, z).applyMatrix4(b.mat);
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x); minZ = Math.min(minZ, v.z); maxZ = Math.max(maxZ, v.z);
    }
    b.box2 = { minX, maxX, minZ, maxZ };
    for (let i = Math.floor((minX - 1) / CELL); i <= Math.floor((maxX + 1) / CELL); i++) {
      for (let j = Math.floor((minZ - 1) / CELL); j <= Math.floor((maxZ + 1) / CELL); j++) {
        const key = i + ',' + j;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(b);
      }
    }
  }
  const EMPTY = [];
  const near = (x, z) => grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || EMPTY;
  const _q = new THREE.Vector3(), _lo = new THREE.Vector3(), _ld = new THREE.Vector3();
  function raycast(o, d, maxT) {
    let best = maxT;
    for (const b of ctx.solids) {
      const cx = b.c.x - o.x, cy = b.c.y - o.y, cz = b.c.z - o.z;
      const tc = cx * d.x + cy * d.y + cz * d.z;
      const d2 = cx * cx + cy * cy + cz * cz - tc * tc;
      if (d2 > b.r * b.r || tc < -b.r || tc - b.r > best) continue;
      _lo.copy(o).applyMatrix4(b.inv);
      _ld.copy(d).transformDirection(b.inv);
      let t0 = 0, t1 = best, hit = true;
      for (const k of ['x', 'y', 'z']) {
        const inv = 1 / (_ld[k] || 1e-9);
        let ta = (b.min[k] - _lo[k]) * inv, tb = (b.max[k] - _lo[k]) * inv;
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta);
        t1 = Math.min(t1, tb);
        if (t0 > t1) { hit = false; break; }
      }
      if (hit && t0 < best) best = t0;
    }
    return best;
  }
  // push a sphere out of every solid it overlaps: out of the nearest side or over
  // the top (never down through the floor). Returns true if it moved.
  function collide(p, rad = 0.35) {
    let movedAny = false;
    for (let iter = 0; iter < 4; iter++) {
      let moved = false;
      for (const b of near(p.x, p.z)) {
        const bb = b.box2;
        if (p.x < bb.minX - rad || p.x > bb.maxX + rad || p.z < bb.minZ - rad || p.z > bb.maxZ + rad) continue;
        _q.copy(p).applyMatrix4(b.inv);
        const ax = _q.x - (b.min.x - rad), bx = b.max.x + rad - _q.x;
        const ay = _q.y - (b.min.y - rad), by = b.max.y + rad - _q.y;
        const az = _q.z - (b.min.z - rad), bz = b.max.z + rad - _q.z;
        if (ax <= 0 || bx <= 0 || ay <= 0 || by <= 0 || az <= 0 || bz <= 0) continue;
        let m = Math.min(ax, bx, az, bz, by);
        if (b.floating) m = Math.min(m, ay);
        if (m === ax) _q.x = b.min.x - rad - 1e-3;
        else if (m === bx) _q.x = b.max.x + rad + 1e-3;
        else if (m === az) _q.z = b.min.z - rad - 1e-3;
        else if (m === bz) _q.z = b.max.z + rad + 1e-3;
        else if (m === by) _q.y = b.max.y + rad + 1e-3;
        else _q.y = b.min.y - rad - 1e-3;
        _q.applyMatrix4(b.mat);
        p.copy(_q);
        moved = true;
      }
      if (!moved) break;
      movedAny = true;
    }
    return movedAny;
  }

  // ---- overlap audit (?audit): props vs props and props vs buildings ------------------------
  if (/[?&]audit/.test(location.search)) {
    const F = ctx.feet;
    const cornersOf = (f) => {
      const px = f.ax, pz = new THREE.Vector3(-f.ax.z, 0, f.ax.x);
      return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => f.c.clone().addScaledVector(px, a * f.hx).addScaledVector(pz, b * f.hz));
    };
    const sat = (A, B) => {
      // separating axis test for two convex quads in xz
      for (const P of [A, B]) {
        for (let i = 0; i < 4; i++) {
          const a = P[i], b = P[(i + 1) % 4];
          const nx = -(b.z - a.z), nz = b.x - a.x;
          let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
          for (const q of A) { const d = q.x * nx + q.z * nz; amin = Math.min(amin, d); amax = Math.max(amax, d); }
          for (const q of B) { const d = q.x * nx + q.z * nz; bmin = Math.min(bmin, d); bmax = Math.max(bmax, d); }
          const L = Math.hypot(nx, nz);
          if (amax < bmin + 0.03 * L || bmax < amin + 0.03 * L) return false;
        }
      }
      return true;
    };
    const Q = F.map(cornersOf);
    const issues = [];
    for (let i = 0; i < F.length; i++) {
      for (let j = i + 1; j < F.length; j++) {
        if (F[i].c.distanceTo(F[j].c) > 4) continue;
        if (F[i].kind === 'tree' && F[j].kind === 'tree') continue;
        if (sat(Q[i], Q[j])) issues.push(`${F[i].kind} x ${F[j].kind} at ${F[i].c.x.toFixed(1)},${F[i].c.z.toFixed(1)}`);
      }
      // against building solids near the ground
      for (const b of ctx.solids) {
        if (b.min.y > 1.2 || b.max.y < 0.2) continue;
        if (b.c.distanceTo(F[i].c) > b.r + 2) continue;
        const inside = Q[i].some((q) => {
          const l = q.clone().setY(F[i].c.y + 0.6).applyMatrix4(b.inv);
          return l.x > b.min.x + 0.32 && l.x < b.max.x - 0.32 && l.z > b.min.z + 0.32 && l.z < b.max.z - 0.32 && l.y > b.min.y && l.y < b.max.y;
        });
        if (inside) issues.push(`${F[i].kind} inside building at ${F[i].c.x.toFixed(1)},${F[i].c.z.toFixed(1)} (solid centre ${b.c.x.toFixed(1)},${b.c.y.toFixed(1)},${b.c.z.toFixed(1)})`);
      }
    }
    // lots overlapping each other (their ground quads would fight)
    for (let i = 0; i < lots.length; i++) {
      for (let j = i + 1; j < lots.length; j++) {
        const A = lots[i].corners.map(([x, z]) => new THREE.Vector3(x, 0, z)), B = lots[j].corners.map(([x, z]) => new THREE.Vector3(x, 0, z));
        const ba = lots[i].bbox, bb = lots[j].bbox;
        if (ba.maxX < bb.minX || bb.maxX < ba.minX || ba.maxZ < bb.minZ || bb.maxZ < ba.minZ) continue;
        const shrink = (P) => { const c = P.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(0.25); return P.map((p) => p.clone().lerp(c, 0.25 / Math.max(1, p.distanceTo(c)))); };
        if (sat(shrink(A), shrink(B))) issues.push(`lot ${lots[i].type}@${lots[i].x.toFixed(0)},${lots[i].z.toFixed(0)} x lot ${lots[j].type}@${lots[j].x.toFixed(0)},${lots[j].z.toFixed(0)}`);
      }
    }
    console.log('[rainroji] audit', F.length, 'props,', issues.length, 'overlaps');
    for (const m of issues.slice(0, 200)) console.log('[rainroji] overlap', m);
  }

  const views = {
    start: { pos: [0.9, 2.15, 13.5], target: [0.5, 1.4, 4.0] },
    slope: { pos: [-3.5, 1.9, -33], target: [-24, 3.2, -43] },
    alley: { pos: [-0.8, 1.7, -21.2], target: [10, 1.6, -22] },
    shop: { pos: [-1.8, 1.6, 5.2], target: [3.8, 1.4, -2.2] },
    crossing: { pos: [4.8, 1.9, -93], target: [6.2, 2.4, -123] },
    canal: { pos: [9.2, 3.6, -100.4], target: [34, -1.2, -104.6] },
    sky: { pos: [0.5, 1.8, 8], target: [-2, 9, -20] },
    drip: { pos: [-1.2, 1.5, 24], target: [-4.5, 2.2, 26.5] },
    upper: { pos: [-36.6, 6.5, 0.8], target: [-14, 1.5, -1.5] },
    top: { pos: [40, 42, 42], target: [0, 0, -30] },
    stairs: { pos: [-12.5, 1.7, 0.6], target: [-30, 3.0, 0] },
    south: { pos: [-1.5, 1.9, -8], target: [0.5, 1.5, 24] },
    hill: { pos: [-44, 6.2, -45], target: [-58, 8, -80] },
    east: { pos: [8, 1.8, 1.5], target: [40, 1.5, -1] },
    gutter: { pos: [1.2, 0.9, 16], target: [2.1, 0.1, 8] },
    eave: { pos: [3.2, 1.3, -1.2], target: [5.5, 2.4, -4.5] },
    harbour: { pos: [2, 4.5, 96], target: [50, 1, 120] },
    quay: { pos: [30, 2.2, 99], target: [60, 0.5, 108] },
    station: { pos: [-4, 3.2, -111], target: [-50, 1.5, -121] },
    platform: { pos: [-60, 2.7, -118], target: [-20, 2.4, -121] },
    bridge: { pos: [96, 6, -112], target: [240, 3, -125] },
    tunnel: { pos: [-80, 4, -118], target: [-106, 4, -123] },
    beach: { pos: [-30, 3, 84], target: [-70, 0, 100] },
    paddies: { pos: [46, 4.5, -14], target: [80, 0, -50] },
    island: { pos: [230, 160, 260], target: [-10, 0, -10] },
    islandN: { pos: [-60, 120, -330], target: [-10, 0, -20] },
    ridge: { pos: [-60, 28, -10], target: [-130, 20, -40] },
    edgeS: { pos: [10, 28, 74], target: [10, 0, 115] },
    edgeN: { pos: [6, 24, -120], target: [6, 0, -180] },
    edgeW: { pos: [-68, 22, -10], target: [-160, 6, -10] },
  };


  const world = {
    glowMesh: glows.mesh,
    groundMesh,
    group,
    lots,
    roads,
    views,
    hums: ctx.hums,
    drips: ctx.drips,
    spouts: ctx.spouts,
    gutters: ctx.gutters,
    state,
    occBounds: { minX: -162, maxX: 128, minY: -6, maxY: 45, minZ: -150, maxZ: 172 },
    rainBounds: { minX: -162, maxX: 128, minY: -6, maxY: 45, minZ: -150, maxZ: 172 },
    flyBounds: { minX: -700, maxX: 700, minZ: -700, maxZ: 700, maxY: 240 },
    groundAt,
    floorAt,
    coastDist: (x, z) => coastInfo(x, z).d,
    naturalHeight,
    solids: ctx.solids,
    raycast,
    // distance to the first thing a ray hits: buildings, ground or water
    pick(o, d, maxT = 400) {
      const hitS = raycast(o, d, maxT);
      let t = 0.05, prev = 0;
      const p = new THREE.Vector3();
      while (t < hitS) {
        p.copy(o).addScaledVector(d, t);
        if (p.y <= floorAt(p.x, p.z, p.y)) {
          // refine
          let a = prev, b = t;
          for (let i = 0; i < 12; i++) {
            const m = (a + b) / 2;
            p.copy(o).addScaledVector(d, m);
            if (p.y <= floorAt(p.x, p.z, p.y)) b = m;
            else a = m;
          }
          return b;
        }
        prev = t;
        t += 0.2 + t * 0.015;
      }
      return hitS;
    },
    collide,
    inside(p) {
      const q = new THREE.Vector3();
      for (const b of ctx.solids) {
        if (p.distanceToSquared(b.c) > b.r * b.r) continue;
        q.copy(p).applyMatrix4(b.inv);
        if (q.x > b.min.x && q.x < b.max.x && q.y > b.min.y && q.y < b.max.y && q.z > b.min.z && q.z < b.max.z) return true;
      }
      return false;
    },
    update(t, dt, camera) {
      updateFlicker(t);
      updateTrain(t, dt);
      updateHarbour(t);
      pickLights(camera);
      glows.update(t, camera);
    },
  };
  void renderer;
  void grass;
  return world;
}
