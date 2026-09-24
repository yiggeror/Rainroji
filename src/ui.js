// Minimal UI: one small sound switch in the corner and a control hint that fades away.
const ICON_ON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.2L11.5 6v12l-4.3-3.5H4z"/><path d="M15 9.2a4 4 0 0 1 0 5.6"/><path d="M17.6 6.8a7.4 7.4 0 0 1 0 10.4"/></svg>`;
const ICON_OFF = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.2L11.5 6v12l-4.3-3.5H4z"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5"/></svg>`;

export function makeSoundToggle(audio) {
  const style = document.createElement('style');
  style.textContent = `
  .rr-sound{position:fixed;right:calc(14px + env(safe-area-inset-right, 0px));bottom:calc(14px + env(safe-area-inset-bottom, 0px));width:34px;height:34px;border-radius:50%;
    border:1px solid rgba(255,255,255,.28);background:rgba(40,48,58,.22);color:rgba(255,255,255,.72);
    display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;
    backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);opacity:.55;transition:opacity .3s,background .3s;z-index:10}
  .rr-sound:hover,.rr-sound:focus-visible{opacity:.95;background:rgba(40,48,58,.4);outline:none}
  .rr-hint{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);font:12px/1.4 system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;
    color:rgba(255,255,255,.8);letter-spacing:.06em;text-shadow:0 1px 3px rgba(0,0,0,.35);pointer-events:none;transition:opacity 2.5s;white-space:nowrap;z-index:9}
  @media (max-width:520px){.rr-hint{font-size:11px;bottom:58px}}`;
  document.head.appendChild(style);
  const btn = document.createElement('button');
  btn.className = 'rr-sound';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Sound on/off');
  btn.title = '声音 / Sound';
  btn.innerHTML = ICON_OFF;
  let on = false;
  btn.addEventListener('click', async () => {
    on = !on;
    btn.innerHTML = on ? ICON_ON : ICON_OFF;
    try {
      if (on) await audio.start();
      else audio.stop();
    } catch (e) {
      console.warn(e);
    }
  });
  document.body.appendChild(btn);

  const hint = document.createElement('div');
  hint.className = 'rr-hint';
  const touch = matchMedia('(pointer:coarse)').matches;
  hint.textContent = touch ? '拖动环顾 · 摇杆移动 · 双击前往 · 右下角：截图 / 视角 / 声音' : '拖动环顾 · WASD 飞行 · E/Q 升降 · 滚轮前后 · 双击前往 · V 切换环绕视角 · P 截图';
  document.body.appendChild(hint);
  setTimeout(() => (hint.style.opacity = '0'), 6500);
  setTimeout(() => hint.remove(), 9500);
}

// ---------------------------------------------------------------------------
// Screenshot: a small camera button (and the P key). The current frame is
// re-rendered at 4K with supersampling, then offered as a PNG.
// ---------------------------------------------------------------------------
const ICON_CAM = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8.5h3l1.6-2.2h6.8L17 8.5h3v10H4z"/><circle cx="12" cy="13.3" r="3.3"/></svg>`;
const FONT = 'system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif';

function stamp() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function makeShotButton(takeShot) {
  const style = document.createElement('style');
  style.textContent = `
  .rr-shot{position:fixed;right:calc(14px + env(safe-area-inset-right, 0px));bottom:calc(102px + env(safe-area-inset-bottom, 0px));width:34px;height:34px;border-radius:50%;
    border:1px solid rgba(255,255,255,.28);background:rgba(40,48,58,.22);color:rgba(255,255,255,.72);
    display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;
    backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);opacity:.55;transition:opacity .3s,background .3s;z-index:10}
  .rr-shot:hover,.rr-shot:focus-visible{opacity:.95;background:rgba(40,48,58,.4);outline:none}
  .rr-shot.busy{opacity:.95;cursor:progress}
  .rr-shot.busy svg{animation:rr-pulse 1.1s ease-in-out infinite}
  @keyframes rr-pulse{50%{opacity:.3}}
  .rr-block{position:fixed;inset:0;z-index:20;cursor:progress}
  .rr-prog{position:fixed;left:50%;top:calc(16px + env(safe-area-inset-top, 0px));transform:translateX(-50%);z-index:21;min-width:190px;
    font:12px/1.4 ${FONT};color:rgba(255,255,255,.9);letter-spacing:.05em;text-align:center;white-space:nowrap;
    background:rgba(34,40,48,.45);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);padding:7px 14px 9px;border-radius:14px;
    transition:opacity .4s}
  .rr-prog i{display:block;height:2px;margin-top:6px;border-radius:1px;background:rgba(255,255,255,.16);overflow:hidden}
  .rr-prog b{display:block;height:100%;width:0;background:rgba(255,255,255,.8);transition:width .25s}
  .rr-flash{position:fixed;inset:0;background:#fff;pointer-events:none;z-index:22;opacity:.28;transition:opacity .7s ease-out}
  .rr-card{position:fixed;right:calc(58px + env(safe-area-inset-right, 0px));bottom:calc(14px + env(safe-area-inset-bottom, 0px));z-index:12;
    min-width:200px;padding:8px;border-radius:12px;background:rgba(30,36,44,.55);border:1px solid rgba(255,255,255,.16);
    backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);font:12px/1.4 ${FONT};color:rgba(255,255,255,.88);
    opacity:0;transform:translateY(8px);transition:opacity .35s,transform .35s}
  .rr-card.show{opacity:1;transform:none}
  .rr-card img{display:block;margin:0 auto;max-width:250px;max-height:min(36vh,260px);border-radius:7px;cursor:zoom-in;-webkit-touch-callout:default}
  .rr-card .row{display:flex;align-items:center;gap:6px;margin-top:7px}
  .rr-card .meta{flex:1;opacity:.65;font-size:11px;letter-spacing:.03em}
  .rr-card a,.rr-card button{font:inherit;color:inherit;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.22);border-radius:10px;
    padding:3px 10px;cursor:pointer;text-decoration:none;line-height:1.4}
  .rr-card a:hover,.rr-card button:hover{background:rgba(255,255,255,.2)}
  .rr-card .x{padding:3px 8px}
  @media (max-width:520px){
    .rr-card{left:50%;right:auto;top:calc(14px + env(safe-area-inset-top, 0px));bottom:auto;transform:translate(-50%,-8px)}
    .rr-card img{max-width:78vw}
    .rr-card.show{transform:translate(-50%,0)}}`;
  document.head.appendChild(style);

  const btn = document.createElement('button');
  btn.className = 'rr-shot';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Capture a 4K still');
  btn.title = '截取当前画面 · 4K (P)';
  btn.innerHTML = ICON_CAM;
  document.body.appendChild(btn);

  const iOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  let busy = false, card = null, url = null;
  // inside the claude.ai artifact viewer plain downloads are blocked; it offers a save capability instead
  let downloads = null;
  if (window.claude && typeof window.claude.use === 'function') {
    Promise.resolve(window.claude.use('downloads')).then((d) => (downloads = d), () => {});
  }
  function saveFile(blob, name) {
    if (downloads) return downloads.save({ filename: name, data: blob }).catch((e) => console.warn(e && e.code));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function closeCard() {
    if (!card) return;
    const c = card, u = url;
    card = url = null;
    c.classList.remove('show');
    setTimeout(() => {
      c.remove();
      if (u) URL.revokeObjectURL(u);
    }, 400);
  }

  function showCard(res, name) {
    closeCard();
    url = URL.createObjectURL(res.blob);
    card = document.createElement('div');
    card.className = 'rr-card';
    const img = document.createElement('img');
    img.src = url;
    img.alt = name;
    img.title = '打开原图 / Open full size';
    img.addEventListener('click', () => window.open(url, '_blank'));
    const row = document.createElement('div');
    row.className = 'row';
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = `${res.width} × ${res.height}`;
    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = '保存';
    save.addEventListener('click', () => saveFile(res.blob, name));
    row.append(meta, save);
    const file = typeof File === 'function' ? new File([res.blob], name, { type: 'image/png' }) : null;
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      const share = document.createElement('button');
      share.type = 'button';
      share.textContent = '分享';
      share.addEventListener('click', () => navigator.share({ files: [file] }).catch(() => {}));
      row.append(share);
    }
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'x';
    x.setAttribute('aria-label', 'Close');
    x.textContent = '×';
    x.addEventListener('click', closeCard);
    row.append(x);
    card.append(img, row);
    document.body.appendChild(card);
    requestAnimationFrame(() => card && card.classList.add('show'));
  }

  async function shoot() {
    if (busy) return;
    busy = true;
    btn.classList.add('busy');
    const block = document.createElement('div');
    block.className = 'rr-block';
    const prog = document.createElement('div');
    prog.className = 'rr-prog';
    prog.innerHTML = '<span>高清渲染中…</span><i><b></b></i>';
    document.body.append(block, prog);
    const label = prog.querySelector('span'), bar = prog.querySelector('b');
    try {
      const res = await takeShot({
        onProgress(done, total) {
          label.textContent = `高清渲染中 · ${Math.round((done / total) * 100)}%`;
          bar.style.width = `${(done / total) * 100}%`;
        },
      });
      if (!res || !res.blob) throw new Error('capture failed');
      const flash = document.createElement('div');
      flash.className = 'rr-flash';
      document.body.appendChild(flash);
      requestAnimationFrame(() => requestAnimationFrame(() => (flash.style.opacity = '0')));
      setTimeout(() => flash.remove(), 900);
      const name = `rainroji-${stamp()}.png`;
      showCard(res, name);
      // straight to the downloads folder where that works; iOS saves via the card (share / long-press)
      if (!iOS || downloads) saveFile(res.blob, name);
      prog.remove();
    } catch (e) {
      console.warn(e);
      label.textContent = '截图失败，请重试';
      bar.parentNode.remove();
      setTimeout(() => (prog.style.opacity = '0'), 1800);
      setTimeout(() => prog.remove(), 2300);
    } finally {
      block.remove();
      btn.classList.remove('busy');
      busy = false;
    }
  }

  btn.addEventListener('click', shoot);
  window.addEventListener('keydown', (e) => {
    const tag = e.target && e.target.tagName;
    if (e.code !== 'KeyP' || e.repeat || e.metaKey || e.ctrlKey || e.altKey || tag === 'INPUT' || tag === 'TEXTAREA') return;
    shoot();
  });
  return { shoot };
}
