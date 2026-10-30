// 成片的最后一步：配乐 + 环境声混音、响度归一，片尾加片名和署名。
//   node yiliguang/tools/master.mjs <录好的片子（rec.mjs 的输出名，不带扩展名）> <成片.mp4> [宽 高]
// 需要 rec.mjs 留下的 <名字>-v.mp4（画面）和 <名字>.wav（逐帧同步的环境声）。
// 配乐和字体第一次用时自动下载到 yiliguang/tools/.cache/：
//   配乐  "Dreamy Flashback"  Kevin MacLeod (incompetech.com)  CC BY 4.0
//   字体  Noto Serif SC（思源宋体）  SIL Open Font License 1.1（经 npm 上的 @fontsource 包）
import { createRequire } from 'module';
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const [, , src, out = 'film.mp4', W = '1920', H = '1080'] = process.argv;
if (!src) { console.log('usage: master.mjs <recorded name> <out.mp4> [W H]'); process.exit(1); }
const here = dirname(fileURLToPath(import.meta.url)), cache = resolve(here, '.cache');
mkdirSync(cache, { recursive: true });
const run = (cmd, args) => { const r = spawnSync(cmd, args, { stdio: 'inherit' }); if (r.status) throw new Error(cmd + ' failed'); };
const probe = (f) => +spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).stdout.toString().trim();

// ---- the music and the font
const music = resolve(cache, 'Dreamy Flashback.mp3');
if (!existsSync(music)) run('curl', ['-sfL', '-o', music, 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Dreamy%20Flashback.mp3']);
const font = resolve(cache, 'noto-serif-sc');
if (!existsSync(font)) {
  mkdirSync(font, { recursive: true });
  run('curl', ['-sfL', '-o', resolve(font, 'pkg.tgz'), 'https://registry.npmjs.org/@fontsource/noto-serif-sc/-/noto-serif-sc-5.3.1.tgz']);
  run('tar', ['xzf', resolve(font, 'pkg.tgz'), '-C', font]);
}

// ---- the title card and the credit, drawn by the browser (it reads the web font as it is)
const card = resolve(cache, 'card.html');
writeFileSync(card, `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="noto-serif-sc/package/300.css">
<style>html,body{margin:0;width:${W}px;height:${H}px;background:transparent;overflow:hidden}
.t{position:absolute;left:0;right:0;top:${Math.round(H * 0.40)}px;text-align:center;font-family:'Noto Serif SC';font-weight:300;font-size:${Math.round(H * 0.122)}px;letter-spacing:0.42em;text-indent:0.42em;color:#efe6d6}
.c{position:absolute;left:0;right:0;bottom:${Math.round(H * 0.08)}px;text-align:center;font-family:'Noto Serif SC';font-weight:300;font-size:${Math.round(H * 0.022)}px;letter-spacing:0.12em;color:#a99f90;line-height:1.9}</style></head>
<body><div class="t" id="t">一粒光</div><div class="c" id="c">音乐　<i>Dreamy Flashback</i>　Kevin MacLeod（incompetech.com）<br>Creative Commons Attribution 4.0</div></body></html>`);
{
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: +W, height: +H } });
  await p.goto('file://' + card); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(400);
  await p.evaluate(() => { document.getElementById('c').style.visibility = 'hidden'; });
  await p.screenshot({ path: resolve(cache, 'title.png'), omitBackground: true });
  await p.evaluate(() => { document.getElementById('c').style.visibility = 'visible'; document.getElementById('t').style.visibility = 'hidden'; });
  await p.screenshot({ path: resolve(cache, 'credit.png'), omitBackground: true });
  await b.close();
}

// ---- picture: the film, then seven seconds of black with the title and the credit
const film = src + '-v.mp4', amb = src + '.wav', T = probe(film), TAIL = +(process.env.TAIL ?? 7.5), END = T + TAIL, MUSIC_AT = +(process.env.MUSIC_AT ?? 3.4);
const vf = [
  `[0:v]scale=${W}:${H}:flags=lanczos,setsar=1,fps=24,format=yuv420p[f]`,
  `color=c=black:s=${W}x${H}:r=24:d=${TAIL},format=yuv420p[k]`,
  `[f][k]concat=n=2:v=1:a=0[v0]`,
  `[3:v]format=rgba,fade=t=in:st=${T + 0.6}:d=1.6:alpha=1,fade=t=out:st=${END - 1.8}:d=1.6:alpha=1[ti]`,
  `[4:v]format=rgba,fade=t=in:st=${T + 2.6}:d=1.4:alpha=1,fade=t=out:st=${END - 1.8}:d=1.6:alpha=1[cr]`,
  `[v0][ti]overlay=0:0:shortest=0[v1]`,
  `[v1][cr]overlay=0:0:shortest=0,format=yuv420p[v]`,
];
// ---- sound: the music over the worlds' own sounds (the rain, the cicadas, the wheel, the sea, the qin, the birds);
//      the whole mixed to a broadcast-ish loudness, fading out with the title
const af = [
  `[1:a]aresample=48000,volume=1.0[amb]`,
  // (the music comes in as the light jumps out of the lamp, 3.4 s in)
  `[2:a]aresample=48000,volume=0.62,adelay=${Math.round(MUSIC_AT * 1000)}|${Math.round(MUSIC_AT * 1000)},afade=t=in:st=${MUSIC_AT}:d=1.5[mus]`,
  `[amb][mus]amix=inputs=2:normalize=0:duration=longest,apad=whole_dur=${END},atrim=0:${END},afade=t=out:st=${END - 3}:d=3,loudnorm=I=-16:LRA=11:TP=-1.5,aresample=48000[a]`,
];
run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
  '-i', film, '-i', amb, '-i', music, '-loop', '1', '-framerate', '24', '-t', String(END), '-i', resolve(cache, 'title.png'), '-loop', '1', '-framerate', '24', '-t', String(END), '-i', resolve(cache, 'credit.png'),
  '-filter_complex', [...vf, ...af].join(';'), '-map', '[v]', '-map', '[a]',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-t', String(END), out]);
console.log(out, (END).toFixed(1) + ' s');
