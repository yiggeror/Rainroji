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
  const r = window.__sim.step(1 / 60);
  return r;
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
    await touch(i === 0 ? 'touchStart' : 'touchMove', at(i / frames));
    path_.push(...(await steps(1)));
  }
  await touch('touchEnd', []);
  path_.push(...(await steps(60)));
}
function report(name, before, after) {
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  let maxJump = 0;
  for (let i = 1; i < path_.length; i++) maxJump = Math.max(maxJump, d(path_[i].pos, path_[i - 1].pos));
  const turned = Math.acos(Math.min(1, before.dir[0] * after.dir[0] + before.dir[1] * after.dir[1] + before.dir[2] * after.dir[2])) * 57.3;
  // + = looked up / turned right
  const pitchDeg = (Math.asin(after.dir[1]) - Math.asin(before.dir[1])) * 57.3;
  const yawRight = before.dir[0] * after.dir[2] - before.dir[2] * after.dir[0] > 0 ? 'right' : 'left';
  console.log(name.padEnd(26), JSON.stringify({ moved: +d(before.pos, after.pos).toFixed(2), turnedDeg: +turned.toFixed(1), pitchDeg: +pitchDeg.toFixed(1), turn: turned > 1 ? yawRight : '-', end: fmt(after.pos), maxStep: +maxJump.toFixed(2) }));
  path_ = [];
}
const joy = await page.evaluate(() => { const e = document.querySelector('.rr-joy'); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
console.log('joystick', joy ? 'present' : 'MISSING');

await reset(); let b = await state();
await gesture(30, (t) => [[150 + 120 * t, 300]]);
report('free: swipe right', b, await state());
await reset(); b = await state();
await gesture(30, (t) => [[195, 420 - 150 * t]]);
report('free: swipe up', b, await state());
await reset(); b = await state();
await gesture(30, (t) => [[195, 270 + 150 * t]]);
report('free: swipe down', b, await state());

await reset(); b = await state();
await gesture(30, (t) => [[195 - 40 - 80 * t, 300], [195 + 40 + 80 * t, 300]]);
report('pinch apart (forward)', b, await state());

await reset(); b = await state();
await gesture(30, (t) => [[150, 300 - 120 * t], [240, 300 - 120 * t]]);
report('two finger drag (pan)', b, await state());

await reset(); b = await state();
for (let k = 0; k < 2; k++) {
  await touch('touchStart', [[195, 330]]);
  path_.push(...(await steps(3)));
  await touch('touchEnd', []);
  path_.push(...(await steps(k ? 1 : 6)));
}
path_.push(...(await steps(180)));
report('double tap (glide)', b, await state());

await page.evaluate(() => window.__sim.rig.setMode('orbit'));
await reset(); b = await state();
await gesture(40, (t) => [[120 + 150 * t, 300]]);
report('orbit: swipe right', b, await state());
await reset(); b = await state();
await gesture(30, (t) => [[195 - 40 - 80 * t, 300], [195 + 40 + 80 * t, 300]]);
report('orbit: pinch apart (zoom)', b, await state());
await page.evaluate(() => window.__sim.rig.setMode('free'));
if (joy) {
  await reset(); b = await state();
  await gesture(120, (t) => [[joy[0], joy[1] - Math.min(1, t * 4) * 38]]);
  report('joystick forward', b, await state());
}
await browser.close();
