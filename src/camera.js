import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Camera for exploring the island. Two modes, switched with a small button in
// the corner (or V):
//
//  free (default) — you are the camera, like a first-person game: the view
//    follows your finger / mouse (drag up = look up, drag right = turn right),
//    fly anywhere with WASD / the joystick, wheel or pinch = forward / back.
//  orbit — the view turns around a centre point in front of you, like turning
//    a model in your hands: drag = rotate around it, wheel / pinch = zoom,
//    two fingers / right-drag = pan, double tap = new centre.
//
// In both modes only buildings stop you (you slide along them) and nothing moves
// the view except your own input, so there are never any cuts.
// ---------------------------------------------------------------------------
const damp = (dt, tau) => 1 - Math.exp(-dt / tau);
const clamp = THREE.MathUtils.clamp;
const MODE_KEY = 'rainroji.camMode';

export function makeGhostCamera({ camera, world, dom, radius = 0.35, ui = true }) {
  const pos = new THREE.Vector3();
  let yaw = 0, pitch = 0; // what we render
  let yawT = 0, pitchT = 0; // where input wants to look (free mode)
  const lookVel = new THREE.Vector2(); // inertia after a flick (rad/s)
  const vel = new THREE.Vector3(); // key / joystick flight (m/s)
  const push = new THREE.Vector3(); // decaying wheel impulses (m/s)
  const pending = new THREE.Vector3(); // direct moves from pan / pinch (m)
  const keys = new Set();
  const joy = new THREE.Vector2(); // -1..1 (x right, y forward)
  let glide = null;
  let dragging = false;
  let mode = 'free';
  try {
    if (localStorage.getItem(MODE_KEY) === 'orbit') mode = 'orbit';
  } catch (_) { /* storage unavailable */ }
  // orbit state: the centre and input still to be applied (eased out -> inertia)
  const pivot = new THREE.Vector3();
  const orb = { theta: 0, phi: 0, zoom: 0 };
  const pivotMove = new THREE.Vector3();

  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
  const tmp = new THREE.Vector3(), step = new THREE.Vector3(), off = new THREE.Vector3();
  const sph = new THREE.Spherical();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const PITCH = 1.45;

  function basis() {
    euler.set(pitch, yaw, 0);
    camera.quaternion.setFromEuler(euler);
    fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    up.set(0, 1, 0).applyQuaternion(camera.quaternion);
  }
  function lookAtPivot() {
    tmp.copy(pivot).sub(pos);
    const l = tmp.length();
    if (l < 1e-3) return;
    tmp.divideScalar(l);
    yaw = yawT = Math.atan2(-tmp.x, -tmp.z);
    pitch = pitchT = Math.asin(clamp(tmp.y, -1, 1));
  }

  // height above whatever is below us: drives the flight speed
  const floorAt = (x, z, y) => world.floorAt(x, z, y);
  const heightAbove = () => pos.y - floorAt(pos.x, pos.z, pos.y);
  const speedScale = () => clamp(1 + (heightAbove() - 1.5) / 7, 1, 12);

  // --- collision: solids push us out, the ground holds us up --------------------
  function resolve(p) {
    world.collide(p, radius);
    const f = floorAt(p.x, p.z, p.y) + radius + 0.02;
    if (p.y < f) p.y = f;
    const b = world.flyBounds;
    p.x = clamp(p.x, b.minX, b.maxX);
    p.z = clamp(p.z, b.minZ, b.maxZ);
    p.y = Math.min(p.y, b.maxY);
  }
  const stats = { intended: 0, actual: 0 };
  const before = new THREE.Vector3();
  function moveBy(d) {
    const len = d.length();
    stats.intended += len;
    if (len < 1e-7) return;
    before.copy(pos);
    const n = Math.min(400, Math.ceil(len / 0.2));
    step.copy(d).divideScalar(n);
    for (let i = 0; i < n; i++) {
      pos.add(step);
      resolve(pos);
    }
    stats.actual += pos.distanceTo(before);
  }

  // --- picking: what is under the pointer ------------------------------------------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function rayAt(clientX, clientY) {
    const r = dom.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    camera.updateMatrixWorld();
    ray.setFromCamera(ndc, camera);
    return ray.ray;
  }
  function pickDistance(clientX, clientY, maxT = 400) {
    const r = rayAt(clientX, clientY);
    return world.pick(r.origin, r.direction, maxT);
  }
  // a sensible orbit centre straight ahead: just in front of what the view hits
  // (never inside a wall), else a point 18 m out
  function placePivot() {
    basis();
    const d = world.pick(pos, fwd, 40);
    pivot.copy(pos).addScaledVector(fwd, d < 39 ? clamp(d - 1.2, 1.5, 30) : 18);
    world.collide(pivot, 0.3);
    const f = floorAt(pivot.x, pivot.z, pivot.y) + 0.3;
    if (pivot.y < f) pivot.y = f;
  }

  function reset(p, target) {
    pos.set(...p);
    const d = new THREE.Vector3(...target).sub(pos).normalize();
    yaw = yawT = Math.atan2(-d.x, -d.z);
    pitch = pitchT = Math.asin(clamp(d.y, -1, 1));
    vel.set(0, 0, 0);
    push.set(0, 0, 0);
    pending.set(0, 0, 0);
    pivotMove.set(0, 0, 0);
    orb.theta = orb.phi = orb.zoom = 0;
    lookVel.set(0, 0);
    glide = null;
    keys.clear();
    joy.set(0, 0);
    resolve(pos);
    basis();
    pivot.set(...target);
    if (mode === 'orbit') placePivot();
    camera.position.copy(pos);
    camera.updateMatrixWorld();
  }

  // --- input -------------------------------------------------------------------------------
  const viewH = () => dom.getBoundingClientRect().height || 600;
  const radPerPx = () => THREE.MathUtils.degToRad(camera.fov) / viewH();
  // free mode: the view follows the finger (drag up = look up, drag right = turn right)
  function look(dx, dy, gain = 1.8) {
    const k = radPerPx() * gain;
    yawT -= dx * k;
    pitchT = clamp(pitchT - dy * k, -PITCH, PITCH);
    glide = null;
  }
  // orbit mode: turn the world around the centre like an object in your hands
  function orbitDrag(dx, dy) {
    const k = (2 * Math.PI) / viewH();
    orb.theta -= dx * k * 0.85;
    orb.phi -= dy * k * 0.85;
    glide = null;
  }
  // grab-pan: the point under the pointer follows it (depth measured at grab time)
  let panDepth = 10;
  function panStart(clientX, clientY) {
    panDepth = mode === 'orbit' ? clamp(pos.distanceTo(pivot), 2, 120) : clamp(pickDistance(clientX, clientY, 200), 2, 90);
  }
  function pan(dx, dy) {
    const upp = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * panDepth) / viewH();
    basis();
    tmp.set(0, 0, 0).addScaledVector(right, -dx * upp).addScaledVector(up, dy * upp);
    pending.add(tmp);
    if (mode === 'orbit') pivotMove.add(tmp);
    glide = null;
  }
  // free: move along the view by roughly `m` metres (scaled by height); orbit: zoom
  function dolly(m, impulse = true) {
    if (mode === 'orbit') {
      orb.zoom -= m * 0.09;
      glide = null;
      return;
    }
    basis();
    const s = speedScale();
    if (impulse) push.addScaledVector(fwd, (m * s) / 0.22);
    else pending.addScaledVector(fwd, m * s);
    glide = null;
  }

  // --- double click / double tap: glide there (orbit: it becomes the new centre) ---------------
  function glideTo(clientX, clientY) {
    const r = rayAt(clientX, clientY);
    const d = world.pick(r.origin, r.direction, 400);
    if (!Number.isFinite(d) || d > 399) return;
    const hit = r.origin.clone().addScaledVector(r.direction, d);
    if (mode === 'orbit') {
      const keep = clamp(pos.distanceTo(pivot), 4, 30);
      const dir = pos.clone().sub(pivot).normalize();
      glide = { orbit: true, from: pivot.clone(), to: hit, camTo: hit.clone().addScaledVector(dir, Math.min(keep, d)), camFrom: pos.clone(), t: 0, dur: clamp(d / 16, 0.6, 2.4) };
      return;
    }
    const stand = clamp(d * 0.3, 1.2, 5);
    const dest = r.origin.clone().addScaledVector(r.direction, Math.max(0, d - stand));
    // arrive at eye height above the ground rather than skimming it
    const f = floorAt(dest.x, dest.z);
    if (hit.y < f + 0.5 && dest.y < f + 1.6) dest.y = f + 1.6;
    glide = { from: pos.clone(), to: dest, t: 0, dur: clamp(d / 14, 0.6, 2.6) };
  }

  // --- mode switching ------------------------------------------------------------------------
  const listeners = [];
  function setMode(m) {
    if (m === mode) return;
    mode = m;
    glide = null;
    lookVel.set(0, 0);
    orb.theta = orb.phi = orb.zoom = 0;
    pivotMove.set(0, 0, 0);
    if (mode === 'orbit') placePivot();
    else {
      yawT = yaw;
      pitchT = pitch;
    }
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch (_) { /* storage unavailable */ }
    for (const f of listeners) f(mode);
  }

  // --- pointer handling -----------------------------------------------------------------
  const pts = new Map(); // pointerId -> {x, y}
  let gesture = null; // 'look' | 'pan' | 'multi'
  let last = null; // previous gesture state
  let lastMoveT = 0;
  const flick = new THREE.Vector2();
  let tapStart = null, lastTap = null, touchGlideAt = -1e9;

  const setCursor = () => (dom.style.cursor = gesture === 'look' || gesture === 'pan' ? 'grabbing' : mode === 'orbit' ? 'grab' : 'crosshair');
  setCursor();

  function gestureState() {
    const a = [...pts.values()];
    if (a.length === 1) return { x: a[0].x, y: a[0].y, d: 0 };
    const cx = (a[0].x + a[1].x) / 2, cy = (a[0].y + a[1].y) / 2;
    return { x: cx, y: cy, d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) };
  }

  dom.addEventListener('pointerdown', (e) => {
    if (pts.size >= 2) return;
    try { dom.setPointerCapture(e.pointerId); } catch (_) { /* synthetic events */ }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    glide = null;
    lookVel.set(0, 0);
    flick.set(0, 0);
    if (e.pointerType === 'mouse') {
      gesture = e.button === 0 && !e.shiftKey ? 'look' : 'pan';
      if (gesture === 'pan') panStart(e.clientX, e.clientY);
    } else {
      gesture = pts.size === 1 ? 'look' : 'multi';
      if (gesture === 'multi') {
        const g = gestureState();
        panStart(g.x, g.y);
        tapStart = null;
      } else tapStart = { x: e.clientX, y: e.clientY, t: performance.now() };
    }
    last = gestureState();
    dragging = true;
    setCursor();
  });
  dom.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;
    const g = gestureState();
    const dx = g.x - last.x, dy = g.y - last.y;
    const now = performance.now();
    if (gesture === 'look') {
      if (mode === 'orbit') orbitDrag(dx, dy);
      else {
        const gain = e.pointerType === 'mouse' ? 1.8 : 1.35;
        look(dx, dy, gain);
        const dtm = Math.max(8, now - lastMoveT) / 1000;
        const k = radPerPx() * gain;
        flick.lerp(new THREE.Vector2((-dx * k) / dtm, (-dy * k) / dtm), 0.5);
      }
    } else if (gesture === 'pan') {
      pan(dx, dy);
    } else if (gesture === 'multi' && pts.size === 2) {
      pan(dx, dy);
      if (last.d > 0 && g.d > 0) dolly(Math.log(g.d / last.d) * 5.5, false);
    }
    lastMoveT = now;
    last = g;
  });
  function endPointer(e) {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    const now = performance.now();
    if (gesture === 'look' && mode === 'free' && now - lastMoveT < 60) lookVel.copy(flick).clampLength(0, 6);
    // touch double tap
    if (e.pointerType !== 'mouse' && tapStart && e.type === 'pointerup') {
      const moved = Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y);
      if (moved < 12 && now - tapStart.t < 300) {
        if (lastTap && now - lastTap.t < 400 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40) {
          glideTo(e.clientX, e.clientY);
          touchGlideAt = now;
          lastTap = null;
        } else lastTap = { x: e.clientX, y: e.clientY, t: now };
      } else lastTap = null;
    }
    tapStart = null;
    if (pts.size === 1) {
      // two fingers -> one: continue as look without a jump
      gesture = 'look';
      last = gestureState();
    } else if (pts.size === 0) {
      gesture = null;
      dragging = false;
    }
    setCursor();
  }
  dom.addEventListener('pointerup', endPointer);
  dom.addEventListener('pointercancel', endPointer);
  dom.addEventListener('contextmenu', (e) => e.preventDefault());
  dom.addEventListener('dblclick', (e) => {
    e.preventDefault();
    if (performance.now() - touchGlideAt < 800) return; // synthesized after our own double tap
    glideTo(e.clientX, e.clientY);
  });
  dom.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
      const dy = e.deltaY * unit, dx = e.deltaX * unit;
      // trackpad pinch arrives as ctrl+wheel with small deltas
      dolly(-dy * (e.ctrlKey ? 0.05 : 0.012));
      if (Math.abs(dx) > 0.5 && mode === 'free') {
        basis();
        push.addScaledVector(right, (dx * 0.01 * speedScale()) / 0.22);
      }
    },
    { passive: false },
  );

  // --- keyboard ----------------------------------------------------------------------------
  const isTyping = (e) => e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
  window.addEventListener('keydown', (e) => {
    if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'KeyV' && !e.repeat) {
      setMode(mode === 'free' ? 'orbit' : 'free');
      return;
    }
    keys.add(e.code);
    if (/^(Arrow|Space)/.test(e.code)) e.preventDefault();
    glide = null;
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  document.addEventListener('visibilitychange', () => keys.clear());
  const k = (...c) => (c.some((x) => keys.has(x)) ? 1 : 0);

  // --- per frame ------------------------------------------------------------------------------
  const want = new THREE.Vector3();
  function flightInput(horizontal) {
    const s = speedScale() * (k('ShiftLeft', 'ShiftRight') ? 3 : 1) * 4.5;
    const f = horizontal ? tmp.set(fwd.x, 0, fwd.z).normalize() : fwd;
    want.set(0, 0, 0)
      .addScaledVector(f, k('KeyW', 'ArrowUp') - k('KeyS', 'ArrowDown') + joy.y)
      .addScaledVector(right, k('KeyD', 'ArrowRight') - k('KeyA', 'ArrowLeft') + joy.x);
    want.y += k('KeyE', 'Space', 'PageUp') - k('KeyQ', 'KeyC', 'PageDown');
    if (want.lengthSq() > 1) want.normalize();
    return want.multiplyScalar(s);
  }

  function updateFree(dt) {
    if (!dragging && lookVel.lengthSq() > 1e-6) {
      yawT += lookVel.x * dt;
      pitchT = clamp(pitchT + lookVel.y * dt, -PITCH, PITCH);
      lookVel.multiplyScalar(Math.exp(-dt / 0.2));
    }
    // a light smoothing so mouse steps don't read as jitter
    const a = damp(dt, 0.045);
    yaw += (yawT - yaw) * a;
    pitch += (pitchT - pitch) * a;
    basis();
    const d = step.set(0, 0, 0);
    if (glide) {
      glide.t = Math.min(1, glide.t + dt / glide.dur);
      const t = glide.t, e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      d.copy(glide.from).lerp(glide.to, e).sub(pos);
      if (glide.t >= 1) glide = null;
      vel.set(0, 0, 0);
    } else {
      vel.lerp(flightInput(false), damp(dt, want.lengthSq() > 0 ? 0.18 : 0.12));
      d.addScaledVector(vel, dt).addScaledVector(push, dt);
      push.multiplyScalar(Math.exp(-dt / 0.22));
    }
    d.add(pending);
    pending.set(0, 0, 0);
    moveBy(d.clone());
  }

  function updateOrbit(dt) {
    basis();
    const target = new THREE.Vector3();
    if (glide && glide.orbit) {
      glide.t = Math.min(1, glide.t + dt / glide.dur);
      const t = glide.t, e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      pivot.copy(glide.from).lerp(glide.to, e);
      target.copy(glide.camFrom).lerp(glide.camTo, e);
      if (glide.t >= 1) glide = null;
      moveBy(target.sub(pos));
      lookAtPivot();
      basis();
      return;
    }
    glide = null;
    // keys / joystick carry the centre and the camera together along the ground
    vel.lerp(flightInput(true), damp(dt, want.lengthSq() > 0 ? 0.18 : 0.12));
    const carry = tmp.copy(vel).multiplyScalar(dt);
    pivot.add(carry);
    pivot.add(pivotMove);
    const carried = carry.clone().add(pending);
    pivotMove.set(0, 0, 0);
    pending.set(0, 0, 0);
    // ease the pending rotation / zoom in (gives a little inertia)
    const a = damp(dt, dragging ? 0.05 : 0.11);
    const dTh = orb.theta * a, dPh = orb.phi * a, dZm = clamp(orb.zoom * a, -0.07, 0.07);
    orb.theta -= dTh;
    orb.phi -= dPh;
    orb.zoom -= dZm;
    off.copy(pos).add(carried).sub(pivot);
    sph.setFromVector3(off);
    sph.theta += dTh;
    sph.phi = clamp(sph.phi + dPh, 0.06, Math.PI - 0.25);
    sph.radius = clamp(sph.radius * Math.exp(dZm), 1.2, 400);
    target.setFromSpherical(sph).add(pivot);
    moveBy(target.sub(pos));
    // never let the centre end up behind or on top of us
    if (pos.distanceTo(pivot) < 0.6) placePivot();
    lookAtPivot();
    basis();
  }

  function update(dt) {
    dt = Math.min(dt, 0.1);
    stats.intended = stats.actual = 0;
    if (mode === 'orbit') updateOrbit(dt);
    else updateFree(dt);
    camera.position.copy(pos);
    camera.updateMatrixWorld();
  }

  // --- touch joystick + mode button ----------------------------------------------------------
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer:coarse)').matches;
  let stick = null;
  function showStick() {
    if (stick || !ui) return;
    stick = makeJoystick((x, y) => {
      joy.set(x, y);
      if (x || y) glide = null;
    });
  }
  if (coarse) showStick();
  if (ui) {
    window.addEventListener('touchstart', showStick, { once: true, passive: true });
    makeModeButton(() => mode, setMode, listeners);
  }

  return {
    update,
    reset,
    keys,
    joy,
    pos,
    pivot,
    look,
    orbitDrag,
    pan,
    dolly,
    panStart,
    glideTo,
    setMode,
    stats,
    get mode() {
      return mode;
    },
    get gliding() {
      return !!glide;
    },
  };
}

// Small round button above the sound switch: free view <-> orbit view
const ICON_FREE = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.6"/></svg>`;
const ICON_ORBIT = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="12" rx="9" ry="4.2"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><path d="M17.6 5.9l2.2 1.4-1.2 2.3"/></svg>`;
function makeModeButton(getMode, setMode, listeners) {
  const style = document.createElement('style');
  style.textContent = `
  .rr-mode{position:fixed;right:calc(14px + env(safe-area-inset-right, 0px));bottom:calc(58px + env(safe-area-inset-bottom, 0px));width:34px;height:34px;border-radius:50%;
    border:1px solid rgba(255,255,255,.28);background:rgba(40,48,58,.22);color:rgba(255,255,255,.72);
    display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;
    backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);opacity:.55;transition:opacity .3s,background .3s;z-index:10}
  .rr-mode:hover,.rr-mode:focus-visible{opacity:.95;background:rgba(40,48,58,.4);outline:none}
  .rr-toast{position:fixed;right:calc(56px + env(safe-area-inset-right, 0px));bottom:calc(62px + env(safe-area-inset-bottom, 0px));
    font:12px/1.4 system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;color:rgba(255,255,255,.9);
    background:rgba(40,48,58,.35);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);padding:5px 10px;border-radius:12px;
    pointer-events:none;opacity:0;transition:opacity .4s;white-space:nowrap;z-index:10}`;
  document.head.appendChild(style);
  const btn = document.createElement('button');
  btn.className = 'rr-mode';
  btn.type = 'button';
  const toast = document.createElement('div');
  toast.className = 'rr-toast';
  document.body.appendChild(btn);
  document.body.appendChild(toast);
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer:coarse)').matches;
  let timer = 0;
  const show = (m, announce) => {
    btn.innerHTML = m === 'free' ? ICON_FREE : ICON_ORBIT;
    btn.title = m === 'free' ? '自由视角（点按切换到环绕视角 · V）' : '环绕视角（点按切换到自由视角 · V）';
    btn.setAttribute('aria-label', btn.title);
    if (!announce) return;
    toast.textContent = m === 'free'
      ? (touch ? '自由视角 · 拖动环顾 · 摇杆移动' : '自由视角 · 拖动环顾 · WASD 移动')
      : (touch ? '环绕视角 · 拖动绕中心旋转 · 双指缩放' : '环绕视角 · 拖动绕中心旋转 · 滚轮缩放');
    toast.style.opacity = '1';
    clearTimeout(timer);
    timer = setTimeout(() => (toast.style.opacity = '0'), 2600);
  };
  show(getMode(), false);
  btn.addEventListener('click', () => setMode(getMode() === 'free' ? 'orbit' : 'free'));
  listeners.push((m) => show(m, true));
}

// Small translucent thumb stick (touch devices only)
function makeJoystick(onChange) {
  const style = document.createElement('style');
  style.textContent = `
  .rr-joy{position:fixed;left:calc(18px + env(safe-area-inset-left,0px));bottom:calc(18px + env(safe-area-inset-bottom,0px));
    width:104px;height:104px;border-radius:50%;border:1px solid rgba(255,255,255,.3);background:rgba(40,48,58,.14);
    touch-action:none;z-index:10;-webkit-user-select:none;user-select:none;opacity:.6;transition:opacity .3s}
  .rr-joy.on{opacity:.9}
  .rr-joy i{position:absolute;left:50%;top:50%;width:42px;height:42px;margin:-21px 0 0 -21px;border-radius:50%;
    background:rgba(255,255,255,.28);border:1px solid rgba(255,255,255,.45);pointer-events:none}`;
  document.head.appendChild(style);
  const el = document.createElement('div');
  el.className = 'rr-joy';
  el.setAttribute('aria-hidden', 'true');
  const knob = document.createElement('i');
  el.appendChild(knob);
  document.body.appendChild(el);
  let id = null;
  const R = 40;
  const set = (x, y) => {
    knob.style.transform = `translate(${x * R}px, ${-y * R}px)`;
    onChange(x, y);
  };
  const at = (e) => {
    const r = el.getBoundingClientRect();
    let x = (e.clientX - (r.left + r.width / 2)) / R, y = -(e.clientY - (r.top + r.height / 2)) / R;
    const l = Math.hypot(x, y);
    if (l > 1) (x /= l), (y /= l);
    // small dead zone, then a soft curve for fine control
    const m = Math.hypot(x, y), c = m < 0.12 ? 0 : ((m - 0.12) / 0.88) ** 1.4;
    return m > 0 ? [(x / m) * c, (y / m) * c, x, y] : [0, 0, 0, 0];
  };
  el.addEventListener('pointerdown', (e) => {
    if (id !== null) return;
    id = e.pointerId;
    try { el.setPointerCapture(id); } catch (_) { /* ignore */ }
    el.classList.add('on');
    const [x, y, kx, ky] = at(e);
    onChange(x, y);
    knob.style.transform = `translate(${kx * R}px, ${-ky * R}px)`;
    e.preventDefault();
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    const [x, y, kx, ky] = at(e);
    onChange(x, y);
    knob.style.transform = `translate(${kx * R}px, ${-ky * R}px)`;
  });
  const end = (e) => {
    if (e.pointerId !== id) return;
    id = null;
    el.classList.remove('on');
    set(0, 0);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  return el;
}
