import * as THREE from 'three';
import { U } from './shaders.js';
import { makeSky } from './sky.js';
import { SkyOcclusion, RainMap, GroundReflection, Post, LAYER_OCC } from './render.js';
import { buildWorld } from './world/index.js';
import { makeRain } from './fx/rain.js';
import { makeSoundToggle, makeShotButton } from './ui.js';
import { Emitter } from './builder.js';
import { makeGhostCamera } from './camera.js';
import { makeCapture } from './capture.js';

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
  let capturing = false, resizeLater = false, sized = '';
  function resize(force) {
    if (capturing) {
      resizeLater = true;
      return;
    }
    const w = shot ? +(params.get('w') || 1600) : window.innerWidth;
    const h = shot ? +(params.get('h') || 900) : window.innerHeight;
    // phones fire resize events without a real change (and briefly report 0 while
    // switching apps): only reallocate when the size really changed
    if (w < 16 || h < 16) return;
    const key = `${w}x${h}@${pixelRatio}`;
    if (key === sized && !force) return;
    sized = key;
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
  // Resizing the canvas wipes what is on it, so never do it between drawing a frame and
  // showing it: size changes are applied at the start of the next frame, right before drawing.
  let resizeDue = false;
  window.addEventListener('resize', () => {
    if (shot) resize();
    else resizeDue = true;
  });
  // if the browser drops and restores the GPU context, redo the one-off passes
  canvas.addEventListener('webglcontextrestored', () => {
    occ.render(scene);
    rainMap.render(scene, rain.dir);
    resize(true);
  });

  // --- loop -----------------------------------------------------------------------
  const clock = new THREE.Timer();
  let t = +(params.get('t') || 0);
  let fade = shot ? 1 : 0;
  let frameAvg = 16;
  let frames = 0;
  let goodChecks = 0, lastScale = -10;
  let still = false;
  const hideInRefl = [world.groundMesh, rain.object];
  if (params.has('norain')) rain.object.visible = false;
  if (params.has('noglow') && world.glowMesh) world.glowMesh.visible = false;
  if (params.has('norefl')) refl.update = () => { U.uReflOn.value = 0; };

  // --- high-resolution capture of the current frame (time stands still meanwhile) ---
  const capture = makeCapture({ renderer, scene, camera, post, refl, rain, hide: hideInRefl.filter(Boolean) });
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer:coarse)').matches;
  const smallGPU = coarse || (navigator.deviceMemory && navigator.deviceMemory < 4);
  async function takeShot(opts = {}) {
    if (capturing) return null;
    capturing = true;
    try {
      return await capture({ long: +params.get('cap') || 3840, ss: 2, tile: smallGPU ? 512 : 768, reflScale: smallGPU ? 0.5 : 0.75, ...opts });
    } finally {
      capturing = false;
      if (resizeLater) {
        resizeLater = false;
        resize();
      }
    }
  }

  // --- small corner buttons ----------------------------------------------------------
  if (!shot) {
    if (audio) makeSoundToggle(audio);
    makeShotButton(takeShot);
  }

  function stepCamera(dt) {
    rig.update(dt);
  }

  function frame(ts) {
    clock.update(ts);
    if (capturing) return;
    if (resizeDue) {
      resizeDue = false;
      resize();
    }
    const dt = still ? 0 : Math.min(clock.getDelta(), 0.1);
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

    // adaptive resolution: keep things smooth on weaker GPUs. Changes are rare (every
    // reallocation of the render targets costs a hitch) and take effect next frame.
    if (!shot) {
      frameAvg = frameAvg * 0.95 + dt * 1000 * 0.05;
      frames++;
      if (frames % 30 === 0) {
        const slow = frameAvg > 30 && pixelRatio > 0.6;
        const fast = frameAvg < 17 && pixelRatio < maxPR;
        goodChecks = fast ? goodChecks + 1 : 0;
        if (slow && t - lastScale > 3) {
          pixelRatio = Math.max(0.6, pixelRatio - 0.15);
          lastScale = t;
          resizeDue = true;
        } else if (goodChecks >= 6 && t - lastScale > 12) {
          pixelRatio = Math.min(maxPR, pixelRatio + 0.1);
          lastScale = t;
          goodChecks = 0;
          resizeDue = true;
        }
      }
    }
  }

  if (shot) {
    // deterministic stills for review: render a few frames so the rain settles
    window.__renderShot = (opts = {}) => {
      if (opts.pos && opts.target) rig.reset(opts.pos, opts.target);
      if (opts.t !== undefined) t = opts.t;
      still = !!opts.still; // time stands still (exactly repeatable frames)
      for (let i = 0; i < (opts.frames || 3); i++) {
        clock.getDelta();
        frame();
      }
      still = false;
      return true;
    };
    window.__world = world;
    window.THREE_Vector3 = THREE.Vector3;
    window.THREE = THREE;
    window.__capture = takeShot;
    window.__scene = scene;
    window.__renderer = renderer;
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
