// 录一段片子：逐帧渲染，声音逐帧同步，直接编码成视频。
//   node yiliguang/tools/rec.mjs <输出.mp4> "<地址参数>" <秒数> [宽 高] [crf]
// 例：node yiliguang/tools/rec.mjs out/summer.mp4 "film&from=summer" 16 1280 720
// 输出 <名字>.mp4（画面 + 声音），并留下 <名字>.wav（只有环境声，最后和配乐一起混）。
// 需要 Playwright 的 Chromium 和 ffmpeg。没有显卡时用软件渲染（SwiftShader），一帧零点几秒到几秒。
import { createRequire } from 'module';
import { spawn } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const [, , out = 'out.mp4', query = 'film', secs = '10', W = '1280', H = '720', CRF = '16'] = process.argv;
const FPS = 24, N = Math.round(+secs * FPS);
const page_ = resolve(dirname(fileURLToPath(import.meta.url)), '../index.html');
const base = out.replace(/\.mp4$/, '');
mkdirSync(dirname(resolve(out)), { recursive: true });

const ff = (args) => spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['pipe', 'inherit', 'inherit'] });
const done = (p) => new Promise((ok, no) => p.on('close', c => c === 0 ? ok() : no(new Error('ffmpeg ' + c))));
// the pictures go straight into the encoder as PNGs
const enc = ff(['-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', CRF, '-pix_fmt', 'yuv420p', '-movflags', '+faststart', base + '-v.mp4']);
const encDone = done(enc);

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
p.on('console', m => { const t = m.text(); if (!/prewarm/.test(t)) console.log('  page:', t.slice(0, 300)); });
p.on('pageerror', e => console.log('  pageerror:', e.message));
const t0 = Date.now();
let last = t0;
await p.exposeFunction('__recFrame', async (k, url) => {
  // the page hands each frame over as a PNG read off its canvas (a page screenshot of a 1080p software-GL canvas can
  // take longer than the browser is willing to wait)
  const png = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  if (!enc.stdin.write(png)) await new Promise(r => enc.stdin.once('drain', r));
  const now = Date.now();
  if (k % 24 === 0 || k === N - 1) {
    const per = (now - t0) / 1000 / (k + 1);
    console.log(`frame ${k + 1}/${N}  ${((now - last) / 1000).toFixed(2)} s  (avg ${per.toFixed(2)} s, ~${Math.round(per * (N - k - 1) / 60)} min left)`);
  }
  last = now;
});
const chunks = [];
await p.exposeFunction('__recAudio', async (i, n, b64) => { chunks[i] = Buffer.from(b64, 'base64'); });
await p.goto(`file://${page_}?rec&fps=${FPS}&dur=${secs}&seed=7&q=${process.env.Q || 1}&${query}`);
await p.waitForFunction(() => window.__done, null, { timeout: 0, polling: 1000 });
await b.close();
enc.stdin.end();
await encDone;
writeFileSync(base + '.wav', Buffer.concat(chunks));
// picture and sound together
await done(ff(['-i', base + '-v.mp4', '-i', base + '.wav', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out]));
console.log(`${out}: ${N} frames in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
