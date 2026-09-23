import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Free-flying "ghost" camera.
// You are the camera: drag to look around, fly anywhere in 3D. Only buildings
// (and terraces / walls registered as solids) stop you; you slide along them.
// Nothing ever moves the view except your own input, so there are no cuts.
//
//   desktop: drag = look · right-drag = pan · wheel = forward/back
//            WASD / arrows = fly · E/Space = up · Q/C = down · Shift = fast
//            double-click = glide to that spot
//   touch:   one finger = look · pinch = forward/back · two fingers = pan
//            joystick (bottom left) = fly · double-tap = glide there
// ---------------------------------------------------------------------------
const damp = (dt, tau) => 1 - Math.exp(-dt / tau);
const clamp = THREE.MathUtils.clamp;

export function makeGhostCamera({ camera, world, dom, radius = 0.35 }) {
  const pos = new THREE.Vector3();
  let yaw = 0, pitch = 0; // what we render
  let yawT = 0, pitchT = 0; // where input wants to look
  const lookVel = new THREE.Vector2(); // inertia after a flick (rad/s)
  const vel = new THREE.Vector3(); // key / joystick flight (m/s)
  const push = new THREE.Vector3(); // decaying wheel impulses (m/s)
  const pending = new THREE.Vector3(); // direct moves from pan / pinch (m)
  const keys = new Set();
  const joy = new THREE.Vector2(); // -1..1 (x right, y forward)
  let glide = null;
  let dragging = false;

  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
  const tmp = new THREE.Vector3(), step = new THREE.Vector3();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const PITCH = 1.45;

  function basis() {
    euler.set(pitch, yaw, 0);
    camera.quaternion.setFromEuler(euler);
    fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    up.set(0, 1, 0).applyQuaternion(camera.quaternion);
  }

  function reset(p, target) {
    pos.set(...p);
    const d = new THREE.Vector3(...target).sub(pos).normalize();
    yaw = yawT = Math.atan2(-d.x, -d.z);
    pitch = pitchT = Math.asin(clamp(d.y, -1, 1));
    vel.set(0, 0, 0);
    push.set(0, 0, 0);
    pending.set(0, 0, 0);
    lookVel.set(0, 0);
    glide = null;
    keys.clear();
    joy.set(0, 0);
    resolve(pos);
    basis();
    camera.position.copy(pos);
    camera.updateMatrixWorld();
  }

  // height above whatever is below us: drives the flight speed
  const floorAt = (x, z, y) => world.floorAt(x, z, y);
  const speedScale = () => clamp(1 + (pos.y - floorAt(pos.x, pos.z, pos.y) - 1.5) / 7, 1, 12);

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
  function moveBy(d) {
    const len = d.length();
    if (len < 1e-7) return;
    const n = Math.min(400, Math.ceil(len / 0.2));
    step.copy(d).divideScalar(n);
    for (let i = 0; i < n; i++) {
      pos.add(step);
      resolve(pos);
    }
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

  // --- input: look / pan / dolly ------------------------------------------------------
  const viewH = () => dom.getBoundingClientRect().height || 600;
  const radPerPx = () => THREE.MathUtils.degToRad(camera.fov) / viewH();
  function look(dx, dy, gain = 1.8) {
    const k = radPerPx() * gain;
    yawT += dx * k;
    pitchT = clamp(pitchT + dy * k, -PITCH, PITCH);
    glide = null;
  }
  // grab-pan: the point under the pointer follows it (depth measured at grab time)
  let panDepth = 10;
  function panStart(clientX, clientY) {
    panDepth = clamp(pickDistance(clientX, clientY, 200), 2, 90);
  }
  function pan(dx, dy) {
    const upp = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * panDepth) / viewH();
    basis();
    pending.addScaledVector(right, -dx * upp).addScaledVector(up, dy * upp);
    glide = null;
  }
  // move along the view direction by roughly `m` metres (scaled by height)
  function dolly(m, impulse = true) {
    basis();
    const s = speedScale();
    if (impulse) push.addScaledVector(fwd, (m * s) / 0.22);
    else pending.addScaledVector(fwd, m * s);
    glide = null;
  }

  // --- glide to a picked point ----------------------------------------------------------
  function glideTo(clientX, clientY) {
    const r = rayAt(clientX, clientY);
    const d = world.pick(r.origin, r.direction, 400);
    if (!Number.isFinite(d) || d > 399) return;
    const hit = r.origin.clone().addScaledVector(r.direction, d);
    const stand = clamp(d * 0.3, 1.2, 5);
    const dest = r.origin.clone().addScaledVector(r.direction, Math.max(0, d - stand));
    // arrive at eye height above the ground rather than skimming it
    const f = floorAt(dest.x, dest.z);
    if (hit.y < f + 0.5 && dest.y < f + 1.6) dest.y = f + 1.6;
    glide = { from: pos.clone(), to: dest, t: 0, dur: clamp(d / 14, 0.6, 2.6) };
  }

  // --- pointer handling -----------------------------------------------------------------
  const pts = new Map(); // pointerId -> {x, y}
  let mode = null; // 'look' | 'pan' | 'multi'
  let last = null; // previous gesture state
  let lastMoveT = 0;
  const flick = new THREE.Vector2();
  let tapStart = null, lastTap = null, touchGlideAt = -1e9;

  const setCursor = () => (dom.style.cursor = mode === 'look' || mode === 'pan' ? 'grabbing' : 'grab');
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
      mode = e.button === 0 && !e.shiftKey ? 'look' : 'pan';
      if (mode === 'pan') panStart(e.clientX, e.clientY);
    } else {
      mode = pts.size === 1 ? 'look' : 'multi';
      if (mode === 'multi') {
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
    if (mode === 'look') {
      const gain = e.pointerType === 'mouse' ? 1.8 : 1.35;
      look(dx, dy, gain);
      const dtm = Math.max(8, now - lastMoveT) / 1000;
      const k = radPerPx() * gain;
      flick.lerp(new THREE.Vector2((dx * k) / dtm, (dy * k) / dtm), 0.5);
    } else if (mode === 'pan') {
      pan(dx, dy);
    } else if (mode === 'multi' && pts.size === 2) {
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
    if (mode === 'look' && now - lastMoveT < 60) lookVel.copy(flick).clampLength(0, 6);
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
      mode = 'look';
      last = gestureState();
    } else if (pts.size === 0) {
      mode = null;
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
      if (Math.abs(dx) > 0.5) {
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
  function update(dt) {
    dt = Math.min(dt, 0.1);
    // look: inertia, then a light smoothing so mouse steps don't read as jitter
    if (!dragging && lookVel.lengthSq() > 1e-6) {
      yawT += lookVel.x * dt;
      pitchT = clamp(pitchT + lookVel.y * dt, -PITCH, PITCH);
      lookVel.multiplyScalar(Math.exp(-dt / 0.2));
    }
    const a = damp(dt, 0.045);
    yaw += (yawT - yaw) * a;
    pitch += (pitchT - pitch) * a;
    basis();

    const d = tmp.set(0, 0, 0);
    if (glide) {
      glide.t = Math.min(1, glide.t + dt / glide.dur);
      const t = glide.t, e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      want.copy(glide.from).lerp(glide.to, e);
      d.copy(want).sub(pos);
      if (glide.t >= 1) glide = null;
      vel.set(0, 0, 0);
    } else {
      const s = speedScale() * (k('ShiftLeft', 'ShiftRight') ? 3 : 1) * 4.5;
      want.set(0, 0, 0)
        .addScaledVector(fwd, k('KeyW', 'ArrowUp') - k('KeyS', 'ArrowDown') + joy.y)
        .addScaledVector(right, k('KeyD', 'ArrowRight') - k('KeyA', 'ArrowLeft') + joy.x);
      want.y += k('KeyE', 'Space', 'PageUp') - k('KeyQ', 'KeyC', 'PageDown');
      if (want.lengthSq() > 1) want.normalize();
      want.multiplyScalar(s);
      vel.lerp(want, damp(dt, want.lengthSq() > 0 ? 0.18 : 0.12));
      d.addScaledVector(vel, dt).addScaledVector(push, dt);
      push.multiplyScalar(Math.exp(-dt / 0.22));
    }
    d.add(pending);
    pending.set(0, 0, 0);
    moveBy(d);
    camera.position.copy(pos);
    camera.updateMatrixWorld();
  }

  // --- touch joystick ----------------------------------------------------------------------------
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer:coarse)').matches;
  let stick = null;
  function showStick() {
    if (stick) return;
    stick = makeJoystick((x, y) => {
      joy.set(x, y);
      if (x || y) glide = null;
    });
  }
  if (coarse) showStick();
  window.addEventListener('touchstart', showStick, { once: true, passive: true });

  return {
    update,
    reset,
    keys,
    joy,
    pos,
    look,
    pan,
    dolly,
    panStart,
    glideTo,
    get gliding() {
      return !!glide;
    },
  };
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
