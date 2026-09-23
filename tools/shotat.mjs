// Render stills from arbitrary camera poses.
//   node tools/shotat.mjs file.html out_dir W H 'name:px,py,pz:tx,ty,tz' ...
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const [file, outDir, W, H, ...specs] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const browser = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: +W, height: +H } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (/error|warn|rainroji/i.test(m.text())) console.log('[page]', m.text()); });
const t0 = Date.now();
await page.goto('file://' + path.resolve(root, file) + `?shot=1&w=${W}&h=${H}` + (process.env.QS || ''));
await page.waitForFunction(() => window.__ready === true, null, { timeout: 900000 });
console.log('ready in', ((Date.now() - t0) / 1000).toFixed(1), 's');
for (const s of specs) {
  const [name, p, t, tt] = s.split(':');
  const pos = p.split(',').map(Number), target = t.split(',').map(Number);
  await page.evaluate(([pos, target, tt]) => window.__renderShot({ pos, target, t: tt ? +tt : 12, frames: 2 }), [pos, target, tt]);
  const out = path.join(outDir, name + '.png');
  await page.locator('canvas').screenshot({ path: out });
  console.log('shot', out);
}
await browser.close();
