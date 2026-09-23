// Headless touch test: real touch events (one-finger drag, pinch, two-finger
// drag, double tap) on a phone-sized page, stepping the camera between events.
//   node tools/touchtest.mjs [file]
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const file = process.argv[2] || 'dist/dev.html';
const W = 390, H = 720;
const browser = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('file://' + path.join(root, file) + `?shot=1&w=${W}&h=${H}`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });
const cdp = await ctx.newCDPSession(page);

const state = () => page.evaluate(() => {
  const S = window.__sim;
  const r = S.step(1 / 60);
  const dist = Math.hypot(...r.orbit.map((v, i) => v - r.target[i]));
  return { ...r, dist };
});
const steps = (n) => page.evaluate((n) => {
  const S = window.__sim, out = [];
  for (let i = 0; i < n; i++) out.push(S.step(1 / 60));
  return out;
}, n);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
const reset = () => page.evaluate(() => { const v = window.__world.views.start; window.__sim.reset(v.pos, v.target); });
const fmt = (a) => a.map((x) => +x.toFixed(2));
let path_ = [];
async function gesture(frames, at) {
  for (let i = 0; i <= frames; i++) {
    const pts = at(i / frames);
    await touch(i === 0 ? 'touchStart' : 'touchMove', pts);
    path_.push(...(await steps(1)));
  }
  await touch('touchEnd', []);
  path_.push(...(await steps(60)));
}
function report(name, before, after) {
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  let maxJump = 0;
  for (let i = 1; i < path_.length; i++) maxJump = Math.max(maxJump, d(path_[i].render, path_[i - 1].render));
  console.log(name.padEnd(26), JSON.stringify({ orbitBefore: fmt(before.orbit), orbitAfter: fmt(after.orbit), targetAfter: fmt(after.target), dist: [+before.dist.toFixed(2), +after.dist.toFixed(2)], maxRenderStep: +maxJump.toFixed(2) }));
  path_ = [];
}

// one finger drag -> rotate
await reset(); let b = await state();
await gesture(30, (t) => [[200 + 120 * t, 400]]);
report('one finger rotate', b, await state());

// pinch out -> zoom in, pinch in -> zoom out
await reset(); b = await state();
await gesture(30, (t) => [[195 - 40 - 80 * t, 400], [195 + 40 + 80 * t, 400]]);
report('pinch apart (zoom in)', b, await state());
await reset(); b = await state();
await gesture(30, (t) => [[195 - 120 + 80 * t, 400], [195 + 120 - 80 * t, 400]]);
report('pinch together (zoom out)', b, await state());

// two finger drag -> pan
await reset(); b = await state();
await gesture(30, (t) => [[150, 400 - 150 * t], [240, 400 - 150 * t]]);
report('two finger drag (pan)', b, await state());

// double tap on the road ahead -> walk there
await reset(); b = await state();
for (let k = 0; k < 2; k++) {
  await touch('touchStart', [[195, 360]]);
  path_.push(...(await steps(3)));
  await touch('touchEnd', []);
  path_.push(...(await steps(k ? 1 : 6)));
}
path_.push(...(await steps(180)));
report('double tap on road', b, await state());

await browser.close();
