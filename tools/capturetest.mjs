// Headless check of the high-resolution capture: renders the same frame once
// in many small tiles and once in a single tile, saves both, and reports how
// much they differ (tile seams would show up as a difference along tile edges).
//   node tools/capturetest.mjs [file] [view] [long]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const file = process.argv[2] || 'dist/dev.html';
const view = process.argv[3] || 'start';
const long = +(process.argv[4] || 1280);
const outDir = path.join(root, 'dist/shots');
fs.mkdirSync(outDir, { recursive: true });

const browser = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('[console]', m.text()));
await page.goto('file://' + path.join(root, file) + `?shot=1&w=960&h=540&view=${view}`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });

const res = await page.evaluate(async (long) => {
  window.__renderShot({ t: 12, frames: 3 });
  const toURL = (c) => c.toDataURL('image/png');
  let t0 = performance.now();
  const a = await window.__capture({ long, tile: 160, onProgress() {} });
  const tA = performance.now() - t0;
  t0 = performance.now();
  const b = await window.__capture({ long, tile: long });
  const tB = performance.now() - t0;
  const w = a.width, h = a.height;
  const da = a.canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const db = b.canvas.getContext('2d').getImageData(0, 0, w, h).data;
  // mean abs difference on tile-edge columns/rows vs everywhere
  let all = 0, edge = 0, nEdge = 0, maxd = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const d = (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2])) / 3;
      all += d;
      maxd = Math.max(maxd, d);
      const ex = x % 160, ey = y % 160;
      if (ex === 0 || ex === 159 || ey === 0 || ey === 159) (edge += d), nEdge++;
    }
  return { w, h, tA, tB, meanAll: all / (w * h), meanEdge: edge / nEdge, maxd, size: a.blob.size, a: toURL(a.canvas), b: toURL(b.canvas) };
}, long);
const save = (name, url) => fs.writeFileSync(path.join(outDir, name), Buffer.from(url.split(',')[1], 'base64'));
save(`capture-${view}-tiled.png`, res.a);
save(`capture-${view}-single.png`, res.b);
await page.screenshot({ path: path.join(outDir, `capture-${view}-screen.png`) });
console.log(JSON.stringify({ size: `${res.w}x${res.h}`, tiledMs: Math.round(res.tA), singleMs: Math.round(res.tB), meanDiff: +res.meanAll.toFixed(3), meanDiffTileEdges: +res.meanEdge.toFixed(3), maxDiff: res.maxd, pngBytes: res.size }));
await browser.close();
