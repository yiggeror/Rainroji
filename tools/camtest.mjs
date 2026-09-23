// Headless control test: drive the camera with scripted input and report
// discontinuities in the rendered camera path (the "sudden cut" feeling).
//   node tools/camtest.mjs [file]
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const file = process.argv[2] || 'dist/dev.html';
const browser = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('file://' + path.join(root, file) + '?shot=1&w=320&h=180');
await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });

const scenarios = {
  'orbit 360 (start)': { frames: 480, act: 'c._rotateLeft(Math.PI*2/480)' },
  'tilt down to horizon': { frames: 240, act: 'c._rotateUp(-0.006)' },
  'orbit 360 low, zoomed out': { pre: 'for(let i=0;i<20;i++) c._dollyIn(1/0.9); c._rotateUp(-0.35)', frames: 480, act: 'c._rotateLeft(Math.PI*2/480)' },
  'walk W 12s': { frames: 720, act: "k.add('KeyW')" },
  'walk D into houses 4s': { frames: 240, act: "k.add('KeyD')" },
  'pan sideways': { frames: 300, act: 'c._pan(6, 0)' },
  'walk W up the stairs': { start: [[-13, 2.2, 0.3], [-19, 1.4, 0]], frames: 600, act: "k.add('KeyW')" },
  'walk W up the slope road': { start: [[3, 2.2, -37], [-3, 1.4, -39.5]], frames: 720, act: "k.add('KeyW')" },
  'orbit 360 in alley': { start: [[4, 1.8, -22], [8, 1.4, -22]], frames: 480, act: 'c._rotateLeft(Math.PI*2/480)' },
  'orbit 360 on stairs top': { start: [[-37, 6, 0.6], [-33, 5.4, 0]], frames: 480, act: 'c._rotateLeft(Math.PI*2/480)' },
  'zoom out max': { frames: 200, act: 'c._dollyOut(0.97)' },
};
let total = 0;
for (const [name, sc] of Object.entries(scenarios)) {
  const res = await page.evaluate(([sc]) => {
    const S = window.__sim;
    const v = window.__world.views.start;
    const st = sc.start || [v.pos, v.target];
    S.reset(st[0], st[1]);
    const k = new Set();
    // reach into the keys set used by the page
    const c = S.controls;
    if (sc.pre) new Function('c', sc.pre)(c);
    const act = new Function('c', 'k', sc.act);
    const out = [];
    for (let i = 0; i < 20; i++) out.push(S.step(1 / 60, (cc, keys) => keys.clear()));
    for (let i = 0; i < sc.frames; i++) out.push(S.step(1 / 60, (cc, keys) => act(cc, keys)));
    for (let i = 0; i < 60; i++) out.push(S.step(1 / 60, (cc, keys) => keys.clear()));
    void k;
    const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    let jumps = 0, maxJump = 0, stuck = 0, maxRatio = 0;
    for (let i = 21; i < out.length; i++) {
      const dr = d(out[i].render, out[i - 1].render);
      const dor = d(out[i].orbit, out[i - 1].orbit);
      if (dr > Math.max(0.5, 4 * dor + 0.15)) jumps++;
      maxJump = Math.max(maxJump, dr);
      maxRatio = Math.max(maxRatio, dr / (dor + 0.05));
      if (i < 20 + sc.frames && d(out[i].target, out[i - 1].target) < 1e-4 && /Key/.test(sc.act)) stuck++;
    }
    const end = out[out.length - 1];
    return { jumps, maxJump: +maxJump.toFixed(2), maxRatio: +maxRatio.toFixed(1), stuck, endTarget: end.target.map((x) => +x.toFixed(1)), endRender: end.render.map((x) => +x.toFixed(1)) };
  }, [sc]);
  total += res.jumps;
  console.log(name.padEnd(28), JSON.stringify(res));
}
console.log('TOTAL JUMPS', total);
await browser.close();
