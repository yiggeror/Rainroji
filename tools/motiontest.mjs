// Steps the scene clock in small increments and reports any visible object that
// jumps (moves further in one step than anything in the scene can travel).
//   node tools/motiontest.mjs [file] [seconds]
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const file = process.argv[2] || 'dist/dev.html';
const T = +(process.argv[3] || 600);
const browser = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 160, height: 90 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('file://' + path.join(root, file) + '?shot=1&w=160&h=90');
await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });
const res = await page.evaluate((T) => {
  const w = window.__world, scene = window.__scene, cam = window.__sim.camera;
  const DT = 0.05, LIMIT = 20 * DT; // nothing here moves faster than 20 m/s
  const objs = [];
  scene.traverse((o) => { if (o.isMesh || o.isGroup || o.isObject3D) objs.push(o); });
  const prev = new Map(), worst = new Map();
  const visible = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
  for (let t = 0; t < T; t += DT) {
    w.update(t, DT, cam);
    scene.updateMatrixWorld(true);
    for (const o of objs) {
      if (!o.isMesh) continue;
      const e = o.matrixWorld.elements, p = [e[12], e[13], e[14]], vis = visible(o);
      const q = prev.get(o);
      if (q && q.vis && vis) {
        const d = Math.hypot(p[0] - q.p[0], p[1] - q.p[1], p[2] - q.p[2]);
        const k = worst.get(o) || { d: 0 };
        if (d > k.d) worst.set(o, { d, t, at: p.map((v) => +v.toFixed(1)) });
      }
      prev.set(o, { p, vis });
    }
  }
  const out = [];
  for (const [o, k] of worst) if (k.d > 0.001) out.push({ name: o.name || o.geometry?.type || 'mesh', verts: o.geometry?.attributes.position.count, maxStep: +k.d.toFixed(3), t: +k.t.toFixed(2), at: k.at, jump: k.d > LIMIT });
  out.sort((a, b) => b.maxStep - a.maxStep);
  return out;
}, T);
const jumps = res.filter((r) => r.jump);
console.log(res.length, 'moving objects,', jumps.length, 'jumps');
for (const r of res.slice(0, 25)) console.log(JSON.stringify(r));
await browser.close();
