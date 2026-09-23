// Build script: bundles the scene with esbuild.
//   node tools/build.mjs           -> all targets
//   node tools/build.mjs dev       -> dist/dev.html only (no audio, fast)
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const which = process.argv[2] || 'all';

const HEAD = (title) => `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="雨の日の日本の住宅街を、アニメ背景のような三渲二スタイルで自由に歩ける3Dシーン。">
<style>
:root{--bg:#b3bcc5;--fg:#f4f6f8}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#b3bcc5;--fg:#f4f6f8}}
:root[data-theme="dark"]{--bg:#b3bcc5;--fg:#f4f6f8}
html,body{margin:0;height:100%;overflow:hidden;overscroll-behavior:none;background:var(--bg);color:var(--fg);
  -webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}
canvas{display:block;position:fixed;inset:0;width:100%;height:100%;touch-action:none;outline:none}
.rr-veil{position:fixed;inset:0;background:var(--bg);display:flex;align-items:center;justify-content:center;
  font:13px/1.5 system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;letter-spacing:.2em;color:rgba(255,255,255,.85);transition:opacity 1.2s;z-index:20;pointer-events:none}
</style>
</head>
<body>
<div class="rr-veil" id="rr-veil">雨の路地</div>
`;

async function bundle(entry, opts = {}) {
  const r = await esbuild.build({
    entryPoints: [path.join(root, entry)],
    bundle: true,
    format: 'iife',
    minify: opts.minify ?? true,
    write: false,
    target: ['es2020'],
    legalComments: 'none',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  return r.outputFiles[0].text;
}

function page(title, js, inline = true) {
  const tail = inline ? `<script>${js.replace(/<\/script/g, '<\\/script')}</script>\n</body>\n</html>\n` : `<script src="${js}"></script>\n</body>\n</html>\n`;
  return HEAD(title) + tail;
}

// Artifact pages are wrapped in their own skeleton by the host: drop ours.
function artifactPage(html) {
  return html
    .replace(/<!doctype html>\s*/i, '')
    .replace(/<html[^>]*>\s*/i, '')
    .replace(/<head>\s*/i, '')
    .replace(/<meta charset="utf-8">\s*/i, '')
    .replace(/<meta name="viewport"[^>]*>\s*/i, '')
    .replace(/<\/head>\s*/i, '')
    .replace(/<body>\s*/i, '')
    .replace(/<\/body>\s*<\/html>\s*$/i, '');
}

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
if (which === 'dev' || which === 'all') {
  const js = await bundle('src/entry-dev.js', { minify: false });
  fs.writeFileSync(path.join(root, 'dist/dev.html'), page('Rainroji dev', js));
  console.log('dist/dev.html', (js.length / 1024).toFixed(0) + 'KB');
}
if (which === 'single' || which === 'all') {
  const js = await bundle('src/entry-single.js');
  fs.writeFileSync(path.join(root, 'rainroji-single.html'), page('雨の路地', js));
  console.log('rainroji-single.html', (js.length / 1024).toFixed(0) + 'KB');
}
if (which === 'site' || which === 'all') {
  const js = await bundle('src/entry-site.js');
  const out = path.join(root, 'site');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'app.js'), js);
  fs.writeFileSync(path.join(out, 'index.html'), page('雨の路地', 'app.js', false));
  console.log('site/app.js', (js.length / 1024).toFixed(0) + 'KB');
}
if (which === 'artifact' || which === 'all') {
  const single = fs.readFileSync(path.join(root, 'rainroji-single.html'), 'utf8');
  fs.mkdirSync(path.join(root, 'dist/artifact-single'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist/artifact-single/rainroji.html'), artifactPage(single).replace('<title>雨の路地</title>', '<title>雨の路地 合成音</title>'));
  const site = fs.readFileSync(path.join(root, 'site/index.html'), 'utf8');
  fs.mkdirSync(path.join(root, 'dist/artifact-site'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist/artifact-site/index.html'), artifactPage(site));
  console.log('dist/artifact-* written');
}
