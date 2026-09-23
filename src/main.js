import * as THREE from 'three';
import { U } from './shaders.js';
import { makeSky } from './sky.js';
import { SkyOcclusion, RainMap, GroundReflection, Post, LAYER_OCC } from './render.js';
import { buildWorld } from './world/index.js';
import { makeRain } from './fx/rain.js';
import { makeSoundToggle } from './ui.js';
import { Emitter } from './builder.js';
import { makeGhostCamera } from './camera.js';

export function start({ audio } = {}) {
  const params = new URLSearchParams(location.search);
  const shot = params.has('shot');
  const canvas = document.createElement('canvas');
  if (!canvas.getContext('webgl2')) {
    const v = document.getElementById('rr-veil');
    if (v) v.textContent = 'この場面は WebGL2 対応のブラウザが必要です · This scene needs a WebGL2-capable browser';
    return null;
  }
  document.body.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: shot });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setClearColor(0x000000, 1);
  const maxPR = Math.min(window.devicePixelRatio || 1, 1.5);
  let pixelRatio = shot ? 1 : maxPR;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 0.15, 3500);
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
  const rig = makeGhostCamera({ camera, world, dom: renderer.domElement, ui: !shot });
  rig.reset(view.pos, view.target);

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
    // portrait screens: widen the vertical field so the street isn't a keyhole
    camera.fov = camera.aspect >= 1 ? 50 : Math.min(74, (2 * Math.atan(Math.tan((25 * Math.PI) / 180) / Math.pow(camera.aspect, 0.75)) * 180) / Math.PI);
    camera.updateProjectionMatrix();
    post.setSize(W, H);
    refl.setSize(W, H);
  }
  resize();
  window.addEventListener('resize', resize);

  // --- sound toggle -------------------------------------------------------------
  if (audio && !shot) makeSoundToggle(audio);

  // --- loop -----------------------------------------------------------------------
  const clock = new THREE.Timer();
  let t = +(params.get('t') || 0);
  let fade = shot ? 1 : 0;
  let frameAvg = 16;
  let frames = 0;
  const hideInRefl = [world.groundMesh, rain.object];
  if (params.has('norain')) rain.object.visible = false;
  if (params.has('noglow') && world.glowMesh) world.glowMesh.visible = false;
  if (params.has('norefl')) refl.update = () => { U.uReflOn.value = 0; };

  function stepCamera(dt) {
    rig.update(dt);
  }

  function frame(ts) {
    clock.update(ts);
    const dt = Math.min(clock.getDelta(), 0.1);
    t += dt;
    U.uTime.value = t;
    stepCamera(dt);
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
      if (opts.pos && opts.target) rig.reset(opts.pos, opts.target);
      if (opts.t !== undefined) t = opts.t;
      for (let i = 0; i < (opts.frames || 3); i++) {
        clock.getDelta();
        frame();
      }
      return true;
    };
    window.__world = world;
    window.THREE_Vector3 = THREE.Vector3;
    // headless camera simulation (no rendering) for control tests
    window.__sim = {
      camera,
      rig,
      reset(pos, target) {
        rig.reset(pos, target);
      },
      step(dt, act) {
        if (act) act(rig);
        stepCamera(dt);
        const d = new THREE.Vector3();
        camera.getWorldDirection(d);
        return { pos: camera.position.toArray(), dir: d.toArray(), intended: rig.stats.intended, actual: rig.stats.actual };
      },
    };
    window.__ready = true;
  } else {
    renderer.setAnimationLoop(frame);
  }
  const veil = document.getElementById('rr-veil');
  if (veil) {
    veil.style.opacity = '0';
    setTimeout(() => veil.remove(), 1400);
  }
  return { renderer, scene, camera, world, rig };
}
void LAYER_OCC;
