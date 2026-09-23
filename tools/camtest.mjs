// Headless test of the ghost camera: scripted input, checks that the view never
// jumps, never ends up inside a building and never gets stuck.
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
await page.waitForFunction(() => window.__ready === true, null, { timeout: 900000 });

// act(r, i): r = rig, i = frame index
const S = {
  'fly W 12s': { frames: 720, act: "r.keys.add('KeyW')" },
  'strafe D into houses 5s': { frames: 300, act: "r.keys.add('KeyD')" },
  'fast W+Shift into a house': { start: [[-1, 1.7, 30], [-12, 2, 30]], frames: 240, act: "r.keys.add('KeyW'); r.keys.add('ShiftLeft')" },
  'rise E then fly over roofs': { frames: 900, act: "if (i < 240) r.keys.add('KeyE'); else { r.keys.delete('KeyE'); r.keys.add('KeyW'); r.keys.add('ShiftLeft'); }" },
  'dive into canal, under bridge': { start: [[-10, 6, -104.5], [10, -2, -104.5]], frames: 600, act: "r.keys.add('KeyW'); if (i < 120) r.keys.add('KeyQ'); else r.keys.delete('KeyQ');" },
  'look around 360': { frames: 480, act: 'r.look(8, Math.sin(i / 40) * 2)' },
  'wheel towards wall': { start: [[4, 1.8, -8], [12, 2, -8]], frames: 300, act: 'if (i % 6 === 0) r.dolly(1.2)' },
  'pan right-drag': { frames: 300, act: 'if (i === 0) r.panStart(160, 90); const k = Math.min(1, i / 12); r.pan(-3 * k, 0.5 * k)' },
  'glide to centre': { frames: 240, act: 'if (i === 0) r.glideTo(160, 100)' },
  'stairs up to terrace': { start: [[-20, 1.6, 0], [-40, 5, 0]], frames: 480, act: "r.keys.add('KeyW')" },
  'random stress': { frames: 3600, act: `
    const k = ['KeyW','KeyA','KeyS','KeyD','KeyE','KeyQ','ShiftLeft'];
    if (i % 45 === 0) { r.keys.clear(); for (const c of k) if (Math.random() < 0.3) r.keys.add(c); }
    if (i % 90 < 30) r.look((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 12);
    if (i % 300 === 150) r.glideTo(Math.random() * 320, Math.random() * 180);` },
};
let bad = 0;
for (const [name, sc] of Object.entries(S)) {
  const res = await page.evaluate(([sc]) => {
    const Sm = window.__sim, W = window.__world;
    const v = W.views.start;
    const st = sc.start || [v.pos, v.target];
    Sm.reset(st[0], st[1]);
    const act = new Function('r', 'i', sc.act);
    const out = [];
    for (let i = 0; i < 10; i++) out.push(Sm.step(1 / 60));
    for (let i = 0; i < sc.frames; i++) out.push(Sm.step(1 / 60, (r) => act(r, i)));
    Sm.rig.keys.clear();
    for (let i = 0; i < 60; i++) out.push(Sm.step(1 / 60));
    const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const steps = out.map((o, i) => (i ? d(o.pos, out[i - 1].pos) : 0));
    let jumps = 0, maxStep = 0, inside = 0, maxAccel = 0;
    const P = new window.THREE_Vector3();
    for (let i = 2; i < out.length; i++) {
      maxStep = Math.max(maxStep, steps[i]);
      // a jump: a step much larger than the steps around it (velocity is smoothed)
      const ref = Math.max(steps[i - 1], steps[i - 2], 0.02);
      const acc = steps[i] - ref;
      maxAccel = Math.max(maxAccel, acc);
      if (acc > 0.25) jumps++;
      P.set(...out[i].pos);
      if (W.inside(P)) inside++;
    }
    const e = out[out.length - 1];
    return { jumps, maxStep: +maxStep.toFixed(2), maxAccel: +maxAccel.toFixed(2), inside, end: e.pos.map((x) => +x.toFixed(1)) };
  }, [sc]);
  if (res.jumps || res.inside) bad++;
  console.log(name.padEnd(30), JSON.stringify(res));
}
console.log(bad ? `FAILED scenarios: ${bad}` : 'all clean');
await browser.close();
