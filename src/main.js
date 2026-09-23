import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { U } from './shaders.js';
import { makeSky } from './sky.js';
import { SkyOcclusion, RainMap, GroundReflection, Post, LAYER_OCC } from './render.js';
import { buildWorld } from './world/index.js';
import { makeRain } from './fx/rain.js';
import { makeSoundToggle } from './ui.js';
import { Emitter } from './builder.js';

export function start({ audio } = {}) {
  const params = new URLSearchParams(location.search);
  const shot = params.has('shot');
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: shot });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setClearColor(0x000000, 1);
  const maxPR = Math.min(window.devicePixelRatio || 1, 1.5);
  let pixelRatio = shot ? 1 : maxPR;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 3000);
  const sky = makeSky();
  scene.add(sky);

  if (params.has('dbg')) Emitter.debugBad = 0;
  const world = buildWorld(scene, renderer);
  const rain = makeRain(scene, world);

  // --- one-off static passes -------------------------------------------------
  const occ = new SkyOcclusion(renderer, world.occBounds, 1024);
  occ.render(scene);
  const rainMap = new RainMap(renderer, world.rainBounds, 1024);
  rainMap.render(scene, rain.dir);
  const refl = new GroundReflection(renderer);
  const post = new Post(renderer);

  // --- camera & controls ------------------------------------------------------
  const view = world.views[params.get('view') || 'start'] || world.views.start;
  camera.position.set(...view.pos);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...view.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 1.5;
  controls.maxDistance = 70;
  controls.maxPolarAngle = Math.PI * 0.53;
  controls.screenSpacePanning = false;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.8;
  controls.panSpeed = 0.8;
  controls.keyPanSpeed = 12;
  controls.update();

  // WASD / arrow keys walk the orbit target along the ground
  const keys = new Set();
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON')) return;
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), move = new THREE.Vector3();
  function walk(dt) {
    move.set(0, 0, 0);
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    right.crossVectors(fwd, camera.up).normalize();
    if (keys.has('KeyW') || keys.has('ArrowUp')) move.add(fwd);
    if (keys.has('KeyS') || keys.has('ArrowDown')) move.sub(fwd);
    if (keys.has('KeyD') || keys.has('ArrowRight')) move.add(right);
    if (keys.has('KeyA') || keys.has('ArrowLeft')) move.sub(right);
    if (move.lengthSq() > 0) {
      const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 14 : 6;
      move.normalize().multiplyScalar(speed * dt);
      controls.target.add(move);
      camera.position.add(move);
    }
  }
  // keep the orbit target inside the neighbourhood and on the ground
  function constrain() {
    const t = controls.target;
    const b = world.walkBounds;
    const cx = THREE.MathUtils.clamp(t.x, b.minX, b.maxX), cz = THREE.MathUtils.clamp(t.z, b.minZ, b.maxZ);
    const dx = cx - t.x, dz = cz - t.z;
    t.x = cx; t.z = cz;
    camera.position.x += dx; camera.position.z += dz;
    const gy = world.groundAt(t.x, t.z) + 1.4;
    const dy = (gy - t.y) * 0.12;
    t.y += dy;
    camera.position.y += dy;
    const cg = Math.max(world.groundAt(camera.position.x, camera.position.z), 0) + 0.45;
    if (camera.position.y < cg) camera.position.y = cg;
  }

  // --- sizing ----------------------------------------------------------------
  let W = 0, H = 0;
  function resize() {
    const w = shot ? +(params.get('w') || 1600) : window.innerWidth;
    const h = shot ? +(params.get('h') || 900) : window.innerHeight;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(w, h, !shot);
    if (shot) {
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
    }
    W = Math.floor(w * pixelRatio);
    H = Math.floor(h * pixelRatio);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    post.setSize(W, H);
    refl.setSize(W, H);
  }
  resize();
  window.addEventListener('resize', resize);

  // --- sound toggle -------------------------------------------------------------
  if (audio && !shot) makeSoundToggle(audio);

  // --- loop -----------------------------------------------------------------------
  const clock = new THREE.Clock();
  let t = +(params.get('t') || 0);
  let fade = shot ? 1 : 0;
  let frameAvg = 16;
  let frames = 0;
  const hideInRefl = [world.groundMesh, rain.object];
  if (params.has('norain')) rain.object.visible = false;
  if (params.has('noglow') && world.glowMesh) world.glowMesh.visible = false;
  if (params.has('norefl')) refl.update = () => { U.uReflOn.value = 0; };

  const lastGood = controls.target.clone();
  const desired = new THREE.Vector3();
  const armDir = new THREE.Vector3();
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.1);
    t += dt;
    U.uTime.value = t;
    walk(dt);
    controls.update();
    constrain();
    // never let the orbit target walk into a house
    if (world.inside(controls.target)) {
      const back = lastGood.clone().sub(controls.target);
      controls.target.add(back);
      camera.position.add(back);
    } else lastGood.copy(controls.target);
    // spring arm: pull the render camera in front of walls between it and the target
    desired.copy(camera.position);
    armDir.copy(camera.position).sub(controls.target);
    const armLen = armDir.length();
    if (armLen > 0.01) {
      armDir.divideScalar(armLen);
      const hit = world.raycast(controls.target, armDir, armLen);
      if (hit < armLen) camera.position.copy(controls.target).addScaledVector(armDir, Math.max(0.35, hit - 0.3));
    }
    world.update(t, dt, camera);
    rain.update(t, dt, camera, renderer);
    if (audio) audio.update && audio.update(t, camera, world);
    sky.position.copy(camera.position);
    sky.updateMatrixWorld();
    camera.updateMatrixWorld();

    refl.update(scene, camera, hideInRefl.filter(Boolean));
    renderer.setRenderTarget(post.main);
    renderer.clear();
    camera.layers.enableAll();
    renderer.render(scene, camera);
    fade = Math.min(1, fade + dt * 0.5);
    post.render(fade);
    camera.position.copy(desired);

    // adaptive resolution: keep things smooth on weaker GPUs
    if (!shot) {
      frameAvg = frameAvg * 0.95 + dt * 1000 * 0.05;
      if (++frames % 90 === 0) {
        if (frameAvg > 30 && pixelRatio > 0.6) {
          pixelRatio = Math.max(0.6, pixelRatio - 0.15);
          resize();
        } else if (frameAvg < 18 && pixelRatio < maxPR) {
          pixelRatio = Math.min(maxPR, pixelRatio + 0.1);
          resize();
        }
      }
    }
  }

  if (shot) {
    // deterministic stills for review: render a few frames so the rain settles
    window.__renderShot = (opts = {}) => {
      if (opts.pos) camera.position.set(...opts.pos);
      if (opts.target) controls.target.set(...opts.target);
      if (opts.t !== undefined) t = opts.t;
      controls.update();
      for (let i = 0; i < (opts.frames || 3); i++) {
        clock.getDelta();
        frame();
      }
      return true;
    };
    window.__world = world;
    window.__ready = true;
  } else {
    renderer.setAnimationLoop(frame);
  }
  const veil = document.getElementById('rr-veil');
  if (veil) {
    veil.style.opacity = '0';
    setTimeout(() => veil.remove(), 1400);
  }
  return { renderer, scene, camera, world, controls };
}
void LAYER_OCC;
