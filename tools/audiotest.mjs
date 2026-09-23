// Record ~N seconds of the page's audio output in headless Chromium and save it as webm.
//   node tools/audiotest.mjs <url> <seconds> <out.webm> [view]
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const [url, secs = '20', out = 'audio.webm'] = process.argv.slice(2);
const browser = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { const t = m.text(); if (!t.includes('GPU stall')) console.log('[page]', t.slice(0, 200)); });
await page.goto(url);
await page.waitForSelector('.rr-sound', { timeout: 300000 });
await page.click('.rr-sound');
await page.waitForFunction(() => !!window.__audioTap, null, { timeout: 60000 });
const solo = process.env.SOLO || '';
const b64 = await page.evaluate(async ([ms, solo]) => {
  const tap = window.__audioTap;
  if (solo && window.__audioNodes) for (const k in window.__audioNodes) if (k !== solo) window.__audioNodes[k].gain.value = 0;
  const dest = tap.context.createMediaStreamDestination();
  tap.connect(dest);
  const rec = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 160000 });
  const chunks = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  const done = new Promise((r) => (rec.onstop = r));
  rec.start(1000);
  await new Promise((r) => setTimeout(r, ms));
  rec.stop();
  await done;
  const buf = await new Blob(chunks).arrayBuffer();
  let s = '';
  const u = new Uint8Array(buf);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}, [+secs * 1000, solo]);
fs.writeFileSync(out, Buffer.from(b64, 'base64'));
console.log('saved', out, fs.statSync(out).size);
await browser.close();
