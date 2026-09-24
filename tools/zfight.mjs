// Z-fighting sweep: renders viewpoints all over the island twice, with the camera's
// near plane nudged in between. Geometry stays put on screen, only depth precision
// changes, so any pixel that changes colour is two surfaces fighting for it.
//   node tools/zfight.mjs [file] [outDir]      (no rain, time frozen)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const file = process.argv[2] || 'dist/dev.html';
const outDir = path.join(root, process.argv[3] || 'dist/zfight');
fs.mkdirSync(outDir, { recursive: true });
const W = 480, H = 270;
const browser = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('file://' + path.join(root, file) + `?shot=1&w=${W}&h=${H}&norain`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });

const views = await page.evaluate(() => {
  const w = window.__world, out = [];
  for (const r of Object.values(w.roads)) {
    let k = 0;
    for (let s = 4; s < r.length - 3; s += 32, k++) {
      const p = r.at(s), sd = k % 2 ? 1 : -1, back = k % 4 >= 2 ? -1 : 1;
      const from = [p.x + p.right.x * sd * 1.2, p.y + 1.7, p.z + p.right.z * sd * 1.2];
      const to = [p.x + p.dir.x * back * 18 - p.right.x * sd * 5, p.y + 1.4, p.z + p.dir.z * back * 18 - p.right.z * sd * 5];
      out.push({ name: `${r.id}@${s.toFixed(0)}`, from, to });
    }
  }
  let k = 0;
  for (let x = -150; x <= 120; x += 45) {
    for (let z = -150; z <= 170; z += 45, k++) {
      const a = k * 1.9, g = w.groundAt(x, z);
      out.push({ name: `air ${x},${z}`, from: [x, g + 26, z], to: [x + Math.cos(a) * 30, g, z + Math.sin(a) * 30] });
    }
  }
  return out;
});
console.log(views.length, 'views');

const results = [];
for (const v of views) {
  const r = await page.evaluate(({ v, W, H }) => {
    const cam = window.__sim.camera, cv = document.querySelector('canvas');
    const c2 = document.createElement('canvas');
    c2.width = W;
    c2.height = H;
    const g = c2.getContext('2d', { willReadFrequently: true });
    const grab = (near) => {
      cam.near = near;
      cam.updateProjectionMatrix();
      window.__renderShot({ pos: v.from, target: v.to, t: 30, frames: 1, still: true });
      g.drawImage(cv, 0, 0);
      return g.getImageData(0, 0, W, H);
    };
    const A = grab(0.15), B = grab(0.1537);
    cam.near = 0.15;
    cam.updateProjectionMatrix();
    let n = 0, x0 = W, y0 = H, x1 = 0, y1 = 0;
    const M = new ImageData(new Uint8ClampedArray(A.data), W, H);
    for (let i = 0; i < W * H; i++) {
      const d = (Math.abs(A.data[i * 4] - B.data[i * 4]) + Math.abs(A.data[i * 4 + 1] - B.data[i * 4 + 1]) + Math.abs(A.data[i * 4 + 2] - B.data[i * 4 + 2])) / 3;
      if (d > 28) {
        n++;
        const x = i % W, y = (i / W) | 0;
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        M.data.set([255, 0, 255, 255], i * 4);
      }
    }
    let url = null, hit = null;
    if (n >= 12) {
      g.putImageData(M, 0, 0);
      url = c2.toDataURL('image/png');
      // where is it? cast a ray through the median flagged pixel
      const xs = [], ys = [];
      for (let i = 0; i < W * H; i++) if (M.data[i * 4] === 255 && M.data[i * 4 + 1] === 0 && M.data[i * 4 + 2] === 255) { xs.push(i % W); ys.push((i / W) | 0); }
      xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
      const px = xs[xs.length >> 1], py = ys[ys.length >> 1];
      if (window.THREE) {
        window.__renderShot({ pos: v.from, target: v.to, t: 30, frames: 1, still: true });
        const rc = new window.THREE.Raycaster();
        rc.setFromCamera(new window.THREE.Vector2((px / W) * 2 - 1, -(py / H) * 2 + 1), cam);
        const hs = rc.intersectObjects(window.__scene.children, true).filter((h) => h.object.visible && h.object.type === 'Mesh');
        if (hs[0]) hit = hs[0].point.toArray().map((q) => +q.toFixed(2));
      }
    }
    return { n, box: [x0, y0, x1, y1], url, hit };
  }, { v, W, H });
  results.push({ ...v, n: r.n, box: r.box, hit: r.hit });
  if (results.length % 10 === 0) console.log('..', results.length);
  if (r.url) fs.writeFileSync(path.join(outDir, v.name.replace(/[^a-z0-9@,.-]+/gi, '_') + '.png'), Buffer.from(r.url.split(',')[1], 'base64'));
}
results.sort((a, b) => b.n - a.n);
fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 1));
const bad = results.filter((r) => r.n >= 12);
console.log(bad.length, 'views with z-fighting');
for (const r of bad.slice(0, 40)) console.log(String(r.n).padStart(6), r.name, 'from', r.from.map((q) => q.toFixed(1)).join(','), 'box', r.box.join(','), 'at', r.hit ? r.hit.join(',') : '?');
await browser.close();
