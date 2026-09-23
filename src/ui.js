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
  hint.textContent = touch ? '拖动旋转 · 双指缩放/平移' : '拖动旋转 · 右键平移 · 滚轮缩放 · WASD 移动';
  document.body.appendChild(hint);
  setTimeout(() => (hint.style.opacity = '0'), 6500);
  setTimeout(() => hint.remove(), 9500);
}
