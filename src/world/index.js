import * as THREE from 'three';
import { U, NUM_LIGHTS, makeToonMaterial, makeFoliageMaterial } from '../shaders.js';
import { Sink, PAT } from '../builder.js';
import { col } from '../util.js';
import { LAYER_OCC, LAYER_NOREFL } from '../render.js';
import { makeCtx } from './ctx.js';
import { Atlas, paintAtlas } from './atlas.js';
import { makeRoads, T1, CANAL, RAIL, naturalHeight } from './layout.js';
import { buildRoads, buildTerraces, buildTerrain, buildCutWalls } from './streets.js';
import { detached, oldHouse } from './house.js';
import { apartment, cornerShop, closedShop, workshop, mansion, parkingLot, field, park, vacant, shrine } from './buildings.js';
import { buildPoles } from './poles.js';
import { buildRail, buildTrain } from './rail.js';
import { buildCanal } from './canal.js';
import { buildDistant } from './distant.js';
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
  const atlas = new Atlas(2048);
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
    // world bbox
    const c = Math.cos(rot), s = Math.sin(rot);
    const pts = [[-lot.w / 2, 0], [lot.w / 2, 0], [lot.w / 2, -d], [-lot.w / 2, -d]].map(([lx, lz]) => [x + lx * c + lz * s, z - lx * s + lz * c]);
    lot.bbox = { minX: Math.min(...pts.map((q) => q[0])), maxX: Math.max(...pts.map((q) => q[0])), minZ: Math.min(...pts.map((q) => q[1])), maxZ: Math.max(...pts.map((q) => q[1])) };
    lot.corners = pts;
    return lot;
  };
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
  const S1 = (z) => 84 - z;
  const seg2 = roads.main.segs[1], seg3 = roads.main.segs[2];
  const S2 = (z) => seg2.s0 + ((-40 - z) / 58) * seg2.len;
  const S3 = (z) => seg3.s0 + (-98 - z);

  // main street, east side (depth 14)
  along('main', 1, 1, S1(52.4), [{ type: 'house', w: 10 }, { type: 'house', w: 10.5 }, { type: 'house', w: 10.2 }], { depth: 14 });
  along('main', 1, S1(47.5), S1(2.8), [{ type: 'house', w: 11, park: true }, { type: 'parking', w: 10.5 }, { type: 'house', w: 11.5, style: 'modern' }, { type: 'house', w: 11.6, style: 'showa', tree: true }], { depth: 14 });
  along('main', 1, S1(-2.8), S1(-20.8), [{ type: 'shop', w: 12.4, depth: 13 }, { type: 'house', w: 5.6, floors: 3, park: false, style: 'modern' }], { depth: 14 });
  along('main', 1, S1(-23.2), S1(-39.6), [{ type: 'house', w: 8.2, style: 'lap' }, { type: 'house', w: 8.2, style: 'showa' }], { depth: 14 });
  along('main', 1, S2(-40.6), S2(-97.4), [{ type: 'closed', w: 9 }, { type: 'house', w: 8, style: 'tile' }, { type: 'house', w: 6.4, floors: 3, park: false }, { type: 'mansion', w: 14.5, depth: 14 }, { type: 'house', w: 7.5 }, { type: 'workshop', w: 11.5 }], { depth: 14 });
  along('main', 1, S3(-136.6), S3(-205), [], { depth: 13, lod: 1 });
  // main street, west side
  along('main', -1, 1, S1(52.4), [{ type: 'house', w: 10.6 }, { type: 'old', w: 14 }], { depth: 12 });
  along('main', -1, S1(47.5), S1(2.8), [{ type: 'house', w: 11, style: 'modern' }, { type: 'old', w: 15.5 }, { type: 'house', w: 11.4, park: true }, { type: 'house', w: 6.8, floors: 3, park: false }], { depth: 12 });
  along('main', -1, S1(-2.8), S1(-37.3), [{ type: 'house', w: 11.8, style: 'showa', tree: true }, { type: 'house', w: 10.8, style: 'lap' }, { type: 'field', w: 11.8 }], { depth: 12 });
  along('main', -1, S2(-55.8), S2(-96.8), [{ type: 'apartment', w: 15 }, { type: 'house', w: 9.6 }, { type: 'vacant', w: 7.4 }, { type: 'house', w: 9.2 }], { depth: 12 });
  along('main', -1, S3(-136.6), S3(-205), [], { depth: 12, lod: 1 });
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
  along('crossE', -1, 33.9, 93, [], { depth: 12 });
  along('crossE', 1, 14.7, 93, [{ type: 'park', w: 20, depth: 22 }, { type: 'house', w: 10 }, { type: 'old', w: 13 }], { depth: 12 });
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
  // north of the railway
  along('northW', -1, 60, 143.4, [], { depth: 12, lod: 1 });
  along('northE', -1, 2, 110, [], { depth: 12, lod: 1 });

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
  const H = buildTerrain(ctx, roads, lots);
  buildCutWalls(ctx, roads, lots, H);
  // shrine at the top of the slope
  {
    const end = roads.slope.at(roads.slope.length);
    const d = end.dir;
    shrine(ctx, end.x + d.x * 0.3, end.y, end.z + d.z * 0.3, Math.atan2(-d.x, -d.z));
  }
  buildRail(ctx);
  buildCanal(ctx);
  buildDistant(ctx);

  // ---- street furniture at key spots -----------------------------------------------
  // curve mirror at the NW corner of the start junction, looking down the cross street
  ctx.chunk(-3, -3);
  curveMirror(ctx, -3.05, 0, -2.75, Math.PI * 0.8, {});
  curveMirror(ctx, 3.0, 0, -41.0, -Math.PI * 0.62, {});
  // stop signs on the minor road approaches
  signPost(ctx, -3.3, 0, 2.6, -Math.PI / 2, ctx.atlasRects.stop, 0.72, 0.65, 2.55);
  signPost(ctx, 3.3, 0, -2.6, Math.PI / 2, ctx.atlasRects.stop, 0.72, 0.65, 2.55);
  signPost(ctx, -3.0, 0, -37.8, -Math.PI / 2 + 0.2, ctx.atlasRects.stop, 0.72, 0.65, 2.55);
  signPost(ctx, 2.95, 0, -13.5, 0, ctx.atlasRects.bluesign, 0.6, 0.6, 2.6);
  signPost(ctx, 3.3, 0, -112, Math.PI, ctx.atlasRects.fumikiri, 0.7, 0.7, 2.4);
  // a lone vending machine by the canal path
  ctx.chunk(-8, -97.6);
  vendingMachine(ctx, -9.5, 0, -97.3, Math.PI, 1);
  // garbage point at the corner of the cross street
  garbageStation(ctx, -6.2, 3.4, 0);
  // bicycles leaning near the alley
  ctx.chunk(4, -20);
  bicycle(ctx, 3.3, 0.0, -20.4, 0.2, {});
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

  // ---- ground base plane (with a hole for the canal) -----------------------------
  const base = new Sink('base');
  ctx.E.sink = base;
  ctx.E.with({ color: col('#6c6456'), pat: PAT.SOIL, param: 0.2, gloss: 0.2, weather: 0 }, () => {
    for (const [z0, z1] of [[CANAL.z0, 500], [-700, CANAL.z1]]) {
      ctx.E.quad([-700, -0.04, z1], [700, -0.04, z1], [700, -0.04, z0], [-700, -0.04, z0], [-700, z1, 700, z1, 700, z0, -700, z0], [0, 1, 0]);
    }
  });

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
      const fl = l.flicker === 1 ? U.uFlicker.value.x : l.flicker === 2 ? U.uFlicker.value.y : l.flicker === 3 ? U.uFlicker.value.z : 1;
      U.uLightPos.value[i].set(l.p.x, l.p.y, l.p.z, l.radius);
      U.uLightCol.value[i].set(l.color.r, l.color.g, l.color.b, l.intensity * fl);
    }
    void tmp;
  }

  // ---- train & crossing timeline ---------------------------------------------------------
  const TRAIN_SPEED = 15;
  const PERIOD = 95;
  let crossingActive = 0, gateAngle = 0;
  const state = { train: { x: 9999, dir: 1, active: false }, crossing: 0, bellPhase: 0 };
  function updateTrain(t, dt) {
    const k = Math.floor(t / PERIOD);
    const local = t % PERIOD;
    const dir = k % 2 === 0 ? -1 : 1;
    const start = -520, span = 1040;
    const x = dir > 0 ? start + local * TRAIN_SPEED : -start - local * TRAIN_SPEED;
    const tz = dir > 0 ? RAIL.tracks[1] : RAIL.tracks[0];
    const len = trainDef.length;
    const head = x, tail = x - dir * len;
    // position mesh: model built along +x from 0..len
    if (dir > 0) {
      train.position.set(x - len, 0.2, tz);
      train.rotation.y = 0;
    } else {
      train.position.set(x + len, 0.2, tz);
      train.rotation.y = Math.PI;
    }
    train.visible = local * TRAIN_SPEED < span + len;
    train.updateMatrix();
    train.updateMatrixWorld();
    // crossing at x = 6
    const cx = 6;
    const approaching = dir > 0 ? cx - head : head - cx;
    const passed = dir > 0 ? tail - cx : cx - tail;
    const want = train.visible && approaching < 210 && passed < 12 ? 1 : 0;
    crossingActive = want;
    // deterministic gate motion from the train position (works for time jumps too)
    const ss = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
    if (want) gateAngle = ss(1.5, 5.5, (210 - approaching) / TRAIN_SPEED);
    else if (train.visible && passed >= 12) gateAngle = 1 - ss(0.3, 4.5, (passed - 12) / TRAIN_SPEED);
    else gateAngle = 0;
    for (const g of gates) {
      g.pivot.rotation.z = 0;
      g.arm.rotation.set(0, 0, 0);
      // arm lies along local +x; raise = rotate about local z
      g.arm.rotation.z = (1 - gateAngle) * (Math.PI / 2) * 0.96;
      g.pivot.updateMatrixWorld(true);
    }
    const blink = crossingActive || gateAngle > 0.05 ? (Math.sin(t * Math.PI * 2 * 0.9) > 0 ? 1 : 0) : 0;
    const on = crossingActive ? 1 : 0;
    U.uCrossing.value.set(on * blink, on * (1 - blink));
    const lamp = ctx.crossLamps[0];
    if (lamp) {
      dynLights[0].p.copy(lamp.p);
      dynLights[0].intensity = on * 1.2;
    }
    dynLights[1].p.set(head + dir * 6, 1.5, tz);
    dynLights[1].intensity = train.visible && Math.abs(head) < 300 ? 1.2 : 0;
    state.train = { x: head, dir, active: train.visible, z: tz };
    state.crossing = on;
    void dt;
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
    return Math.max(0, H(x, z));
  }

  const views = {
    start: { pos: [0.9, 2.2, 13.5], target: [0.1, 2.6, -6] },
    slope: { pos: [-3.5, 1.9, -33], target: [-24, 3.2, -43] },
    alley: { pos: [-0.8, 1.7, -21.2], target: [10, 1.6, -22] },
    shop: { pos: [-1.8, 1.6, 5.2], target: [3.8, 1.4, -2.2] },
    crossing: { pos: [4.8, 1.9, -93], target: [6.2, 2.4, -123] },
    canal: { pos: [9.2, 3.6, -100.4], target: [34, -1.2, -104.6] },
    sky: { pos: [0.5, 1.8, 8], target: [-2, 9, -20] },
    drip: { pos: [-1.2, 1.5, 24], target: [-4.5, 2.2, 26.5] },
    upper: { pos: [-35.8, 6.1, 0.4], target: [-12, 1.8, -3] },
    top: { pos: [40, 42, 42], target: [0, 0, -30] },
    stairs: { pos: [-12.5, 1.7, 0.6], target: [-30, 3.0, 0] },
    south: { pos: [-1.5, 1.9, -8], target: [0.5, 1.5, 24] },
    hill: { pos: [-44, 6.2, -45], target: [-58, 8, -80] },
    east: { pos: [8, 1.8, 1.5], target: [40, 1.5, -1] },
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
    occBounds: { minX: -130, maxX: 130, minY: -3, maxY: 45, minZ: -215, maxZ: 90 },
    rainBounds: { minX: -130, maxX: 130, minY: -3, maxY: 45, minZ: -215, maxZ: 90 },
    walkBounds: { minX: -72, maxX: 92, minZ: -150, maxZ: 76 },
    groundAt,
    naturalHeight,
    // nearest hit distance of a ray against building boxes (for the camera spring arm)
    raycast(o, d, maxT) {
      let best = maxT;
      const lo = new THREE.Vector3(), ld = new THREE.Vector3();
      for (const b of ctx.solids) {
        // quick sphere reject
        const cx = b.c.x - o.x, cy = b.c.y - o.y, cz = b.c.z - o.z;
        const tc = cx * d.x + cy * d.y + cz * d.z;
        const d2 = cx * cx + cy * cy + cz * cz - tc * tc;
        if (d2 > b.r * b.r || tc < -b.r || tc - b.r > best) continue;
        lo.copy(o).applyMatrix4(b.inv);
        ld.copy(d).transformDirection(b.inv);
        let t0 = 0, t1 = best;
        let hit = true;
        for (const k of ['x', 'y', 'z']) {
          const inv = 1 / (ld[k] || 1e-9);
          let ta = (b.min[k] - lo[k]) * inv, tb = (b.max[k] - lo[k]) * inv;
          if (ta > tb) [ta, tb] = [tb, ta];
          t0 = Math.max(t0, ta);
          t1 = Math.min(t1, tb);
          if (t0 > t1) {
            hit = false;
            break;
          }
        }
        if (hit && t0 < best) best = t0;
      }
      return best;
    },
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
      pickLights(camera);
      glows.update(t, camera);
    },
  };
  void renderer;
  void grass;
  return world;
}
