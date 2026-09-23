// Render stills of the scene in headless Chromium (SwiftShader) for visual review.
//   node tools/shots.mjs [file] [view,view,...] [w] [h]
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const file = process.argv[2] || 'dist/dev.html';
const views = (process.argv[3] || 'start').split(',');
const W = +(process.argv[4] || 1280), H = +(process.argv[5] || 720);
const outDir = process.env.SHOT_DIR || path.join(root, 'dist/shots');
fs.mkdirSync(outDir, { recursive: true });
const browser = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const t0 = Date.now();
await page.goto("file://" + path.join(root, file) + `?shot=1&w=${W}&h=${H}` + (process.env.QS || ""));
await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });
console.log('ready in', ((Date.now() - t0) / 1000).toFixed(1), 's');
for (const v of views) {
  const [name, t] = v.split('@');
  const t1 = Date.now();
  await page.evaluate(([n, tt]) => {
    const w = window.__world;
    const vv = w.views[n];
    window.__renderShot({ pos: vv.pos, target: vv.target, t: tt ? +tt : 12, frames: 2 });
  }, [name, t]);
  const out = path.join(outDir, `${name}${t ? '_' + t : ''}.png`);
  await page.locator('canvas').screenshot({ path: out });
  console.log('shot', out, ((Date.now() - t1) / 1000).toFixed(1) + 's');
}
await browser.close();
