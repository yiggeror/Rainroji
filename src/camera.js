import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Camera rig for exploring narrow streets.
// The orbit itself (OrbitControls + keys + fly-to) never teleports; the pose
// we *render* from is derived from it every frame:
//   - the orbit point slides along walls instead of stopping dead,
//   - a smoothed "spring arm" keeps houses from getting between the camera
//     and the orbit point (fast in, slow out, several rays so corners don't flicker),
//   - a smoothed floor keeps the camera above the ground and terraces,
//   - zooming out gradually lifts the camera above the rooftops.
// ---------------------------------------------------------------------------
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const damp = (dt, tau) => 1 - Math.exp(-dt / tau);

export function makeCameraRig({ camera, controls, world, dom, eye = 1.4 }) {
  const keys = new Set();
  const isTyping = (e) => e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
  window.addEventListener('keydown', (e) => {
    if (isTyping(e) || e.metaKey || e.ctrlKey) return;
    keys.add(e.code);
    if (/^(Arrow|Space)/.test(e.code)) e.preventDefault();
    fly = null;
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  document.addEventListener('visibilitychange', () => keys.clear());

  const orbitPos = new THREE.Vector3();
  const renderPos = new THREE.Vector3();
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), move = new THREE.Vector3();
  const tmp = new THREE.Vector3(), dir = new THREE.Vector3(), side = new THREE.Vector3();
  const lastTarget = controls.target.clone();
  let arm = -1; // smoothed arm length actually used for rendering
  let prevL = 0;
  let floorY = null; // smoothed minimum camera height
  let fly = null;

  function shiftOrbit(d) {
    controls.target.add(d);
    camera.position.add(d);
  }

  // --- keyboard walking --------------------------------------------------------
  function walk(dt) {
    move.set(0, 0, 0);
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    right.set(-fwd.z, 0, fwd.x);
    if (keys.has('KeyW') || keys.has('ArrowUp')) move.add(fwd);
    if (keys.has('KeyS') || keys.has('ArrowDown')) move.sub(fwd);
    if (keys.has('KeyD') || keys.has('ArrowRight')) move.add(right);
    if (keys.has('KeyA') || keys.has('ArrowLeft')) move.sub(right);
    if (move.lengthSq() === 0) return;
    const fast = keys.has('ShiftLeft') || keys.has('ShiftRight');
    move.normalize().multiplyScalar((fast ? 13 : 5.5) * dt);
    shiftOrbit(move);
  }

  // --- double click / double tap: walk to that spot ------------------------------
  const ray = new THREE.Raycaster();
  function pick(clientX, clientY) {
    const r = dom.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    // pick from the pose the user actually sees
    const save = camera.position.clone();
    camera.position.copy(renderPos.lengthSq() ? renderPos : save);
    camera.updateMatrixWorld();
    ray.setFromCamera(ndc, camera);
    camera.position.copy(save);
    camera.updateMatrixWorld();
    const o = ray.ray.origin, d = ray.ray.direction;
    const wall = world.raycast(o, d, 250);
    let hit = null;
    for (let s = 0.3; s < Math.min(wall, 250); s += 0.3) {
      tmp.copy(o).addScaledVector(d, s);
      if (tmp.y <= world.groundAt(tmp.x, tmp.z) + 0.02) {
        hit = tmp.clone();
        break;
      }
    }
    if (!hit) {
      if (wall >= 250) return null;
      // clicked a house: stop on the ground in front of it
      hit = o.clone().addScaledVector(d, Math.max(0.5, wall - 1.5));
    }
    hit.y = world.groundAt(hit.x, hit.z) + eye;
    return hit;
  }
  function flyTo(dest) {
    if (!dest) return;
    const b = world.walkBounds;
    dest.x = THREE.MathUtils.clamp(dest.x, b.minX, b.maxX);
    dest.z = THREE.MathUtils.clamp(dest.z, b.minZ, b.maxZ);
    world.pushOut(dest, 0.35);
    const dist = dest.distanceTo(controls.target);
    fly = { from: controls.target.clone(), to: dest, t: 0, dur: THREE.MathUtils.clamp(dist / 14, 0.5, 2.2) };
  }
  // mouse: dblclick; touch: our own double-tap detection (dblclick is unreliable there)
  let down = null, lastTap = null, touchFlyAt = -1e9;
  dom.addEventListener('dblclick', (e) => {
    e.preventDefault();
    // some mobile browsers also synthesize dblclick after our own double tap
    if (performance.now() - touchFlyAt < 800) return;
    flyTo(pick(e.clientX, e.clientY));
  });
  dom.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') {
      fly = null;
      return;
    }
    down = e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
  });
  dom.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'touch' || !down) return;
    const now = performance.now();
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    if (moved < 12 && now - down.t < 280) {
      if (lastTap && now - lastTap.t < 380 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40) {
        flyTo(pick(e.clientX, e.clientY));
        touchFlyAt = now;
        lastTap = null;
      } else lastTap = { x: e.clientX, y: e.clientY, t: now };
    } else {
      lastTap = null;
      fly = null;
    }
    down = null;
  });
  dom.addEventListener('wheel', () => (fly = null), { passive: true });

  // --- per frame -----------------------------------------------------------------
  function update(dt) {
    dt = Math.min(dt, 0.1);
    walk(dt);
    if (fly) {
      fly.t = Math.min(1, fly.t + dt / fly.dur);
      const e = fly.t < 0.5 ? 2 * fly.t * fly.t : 1 - Math.pow(-2 * fly.t + 2, 2) / 2;
      tmp.copy(fly.from).lerp(fly.to, e).sub(controls.target);
      tmp.y = 0;
      shiftOrbit(tmp);
      if (fly.t >= 1) fly = null;
    }
    // zoomed out -> look from above the roofs instead of skimming them
    const d0 = camera.position.distanceTo(controls.target);
    controls.maxPolarAngle = Math.PI * (0.492 - 0.14 * smooth(14, 55, d0));
    controls.update();

    // orbit point: stay in bounds, slide along walls, follow the ground
    const t = controls.target;
    const b = world.walkBounds;
    tmp.set(THREE.MathUtils.clamp(t.x, b.minX, b.maxX) - t.x, 0, THREE.MathUtils.clamp(t.z, b.minZ, b.maxZ) - t.z);
    if (tmp.lengthSq()) shiftOrbit(tmp);
    tmp.copy(t);
    if (world.pushOut(tmp, 0.35)) {
      tmp.sub(t);
      tmp.y = 0;
      shiftOrbit(tmp);
    }
    const gy = world.groundAt(t.x, t.z) + eye;
    tmp.set(0, (gy - t.y) * damp(dt, 0.16), 0);
    shiftOrbit(tmp);
    lastTarget.copy(t);

    // --- rendered pose ---
    orbitPos.copy(camera.position);
    dir.copy(orbitPos).sub(t);
    const L = dir.length();
    if (L < 1e-4) {
      renderPos.copy(orbitPos);
      return;
    }
    dir.divideScalar(L);
    // A fan of rays around the arm. Rays further off-axis count for less, so a
    // building corner sweeping towards the view line pulls the camera in
    // gradually instead of all at once when it crosses.
    let allowed = L;
    const FAN = 0.3; // radians either side
    for (const a of [-FAN, -0.2, -0.1, 0, 0.1, 0.2, FAN]) {
      for (const pitch of [0, 0.12]) {
        const ca = Math.cos(a), sa = Math.sin(a);
        tmp.set(dir.x * ca - dir.z * sa, dir.y, dir.x * sa + dir.z * ca);
        if (pitch) tmp.y += pitch;
        tmp.normalize();
        const h = world.raycast(t, tmp, L + 1);
        if (h >= L + 1) continue;
        const w = Math.min(1, (Math.abs(a) + pitch * 0.5) / FAN);
        allowed = Math.min(allowed, h - 0.45 + w * (L + 0.5));
      }
    }
    // thickness: two parallel rays so thin gaps between houses don't flicker
    side.crossVectors(dir, camera.up);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    for (const sx of [0.3, -0.3]) {
      tmp.copy(t).addScaledVector(side, sx);
      allowed = Math.min(allowed, world.raycast(tmp, dir, L + 1) - 0.45);
    }
    // high above the roofs nothing can block the view: let the arm out
    const above = smooth(9, 17, orbitPos.y - world.groundAt(orbitPos.x, orbitPos.z));
    allowed += (L - allowed) * above;
    allowed = THREE.MathUtils.clamp(allowed, Math.min(0.9, L), L);
    if (arm < 0) arm = allowed;
    // Zooming is obeyed at once while nothing is in the way; obstacles pull the
    // camera in smoothly and let it out slowly, both speed-capped so even a
    // sudden obstacle never reads as a cut.
    if (arm > L) arm = L;
    if (arm >= prevL - 0.02 && allowed > arm) arm = allowed;
    const step = (allowed - arm) * damp(dt, allowed < arm ? 0.1 : 0.5);
    const cap = (allowed < arm ? 16 : Math.max(6, 0.8 * L)) * dt;
    arm += THREE.MathUtils.clamp(step, -cap, cap);
    prevL = L;
    renderPos.copy(t).addScaledVector(dir, arm);

    // floor: never below the ground / terrace under the camera (eased, not snapped)
    const fy = Math.max(world.groundAt(renderPos.x, renderPos.z), world.groundAt(t.x, t.z) - 0.5) + 0.55;
    if (floorY === null) floorY = fy;
    floorY += (fy - floorY) * damp(dt, fy > floorY ? 0.12 : 0.3);
    if (renderPos.y < floorY) renderPos.y = floorY;
    camera.position.copy(renderPos);
  }

  function restore() {
    camera.position.copy(orbitPos);
  }

  function reset() {
    arm = -1;
    floorY = null;
    fly = null;
  }

  return { update, restore, reset, keys, flyTo, pick, renderPos, orbitPos };
}
