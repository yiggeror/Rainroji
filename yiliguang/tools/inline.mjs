// 把 index.html 和它引用的脚本合成一个可以单独分享的 HTML 文件。
// 用法：node yiliguang/tools/inline.mjs   →   yiliguang/yiliguang-single.html
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let html = readFileSync(join(root, 'index.html'), 'utf8');
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
  const js = readFileSync(join(root, src), 'utf8');
  if (/<\/script/i.test(js)) throw new Error(`${src} contains "</script", which would end the inlined block early`);
  return `<script>\n/* ---- ${src} ---- */\n${js}\n</script>`;
});
const out = join(root, 'yiliguang-single.html');
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`);
