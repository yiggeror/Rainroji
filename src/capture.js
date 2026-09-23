import * as THREE from 'three';
import { U } from './shaders.js';
import { FSQuad, FS_VERT, GroundReflection } from './render.js';

// ---------------------------------------------------------------------------
// High-resolution still of the current view.
//
// The frame is frozen and re-rendered in square tiles (camera.setViewOffset),
// each tile supersampled `ss`x on top of 4x MSAA, then box-filtered down in
// linear light. Everything that spans the whole picture is computed once for
// the full frame and sampled by every tile, so there are no seams:
//   - the ground reflection (a larger, mipmapped copy for the capture)
//   - bloom (from a full-frame render at screen resolution, like on screen)
//   - vignette and grain (positioned in full-image coordinates)
// ---------------------------------------------------------------------------
const DOWN_FRAG = /* glsl */ `
uniform sampler2D tMap;
uniform int uSS;
vec3 toLin(vec3 c){ return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toSRGB(vec3 c){ c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  ivec2 base = ivec2(gl_FragCoord.xy) * uSS;
  vec3 s = vec3(0.0);
  for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++)
    if (i < uSS && j < uSS) s += toLin(texelFetch(tMap, base + ivec2(i, j), 0).rgb);
  gl_FragColor = vec4(toSRGB(s / float(uSS * uSS)), 1.0);
}`;

// give the browser a moment to paint the progress, without stalling in hidden tabs
const breathe = () =>
  new Promise((res) => {
    let done = false;
    const go = () => {
      if (!done) (done = true), res();
    };
    requestAnimationFrame(go);
    setTimeout(go, 60);
  });

export function makeCapture({ renderer, scene, camera, post, refl, rain, hide }) {
  const down = new FSQuad(
    new THREE.ShaderMaterial({ uniforms: { tMap: { value: null }, uSS: { value: 2 } }, vertexShader: FS_VERT, fragmentShader: DOWN_FRAG, depthTest: false, depthWrite: false }),
  );

  // long: long side of the picture in pixels; tile: output pixels per tile edge
  return async function capture({ long = 3840, ss = 2, tile = 768, reflScale = 0.75, onProgress } = {}) {
    const caps = renderer.capabilities;
    ss = Math.max(1, Math.min(4, Math.round(ss)));
    tile = Math.min(tile, Math.floor(caps.maxTextureSize / ss));
    const aspect = camera.aspect;
    const outW = Math.round(aspect >= 1 ? long : long * aspect);
    const outH = Math.round(aspect >= 1 ? long / aspect : long);
    const R = tile * ss;
    const nx = Math.ceil(outW / tile), ny = Math.ceil(outH / tile);
    const total = nx * ny;

    const out = document.createElement('canvas');
    out.width = outW;
    out.height = outH;
    const ctx = out.getContext('2d');

    const skyFar = U.uSkyFar.value;
    let capRefl = null, tMain = null, tComp = null, tDown = null;
    try {
      camera.aspect = outW / outH;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      camera.layers.enableAll();
      U.uSkyFar.value = 1e6; // full sky-visibility estimate out to the horizon

      // --- full-frame passes (this frame also stays on screen while we work) ---
      capRefl = new GroundReflection(renderer, { mips: true });
      capRefl.setSize(outW * 2 * reflScale, outH * 2 * reflScale, refl.rtA.width, refl.rtA.height);
      capRefl.update(scene, camera, hide);
      renderer.setRenderTarget(post.main);
      renderer.clear();
      renderer.render(scene, camera);
      post.bloom();

      // --- tiles ---------------------------------------------------------------
      // rain streaks: minimum width in capture pixels rather than screen pixels
      rain.setPix(2 / (camera.projectionMatrix.elements[5] * outH * ss));
      tMain = new THREE.WebGLRenderTarget(R, R, { type: THREE.HalfFloatType, samples: Math.min(4, caps.maxSamples || 4) });
      tComp = new THREE.WebGLRenderTarget(R, R, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
      tDown = new THREE.WebGLRenderTarget(tile, tile, { depthBuffer: false });
      down.material.uniforms.tMap.value = tComp.texture;
      down.material.uniforms.uSS.value = ss;
      const buf = new Uint8Array(tile * tile * 4);
      const tileInfo = { offset: [0, 0], scale: [tile / outW, tile / outH], fullRes: [outW * ss, outH * ss] };
      let done = 0;
      if (onProgress) onProgress(0, total);
      await breathe();
      for (let ty = 0; ty < ny; ty++) {
        for (let tx = 0; tx < nx; tx++) {
          const x0 = tx * tile, y0 = ty * tile;
          const w = Math.min(tile, outW - x0), h = Math.min(tile, outH - y0);
          camera.setViewOffset(outW * ss, outH * ss, x0 * ss, y0 * ss, R, R);
          renderer.setRenderTarget(tMain);
          renderer.clear();
          renderer.render(scene, camera);
          tileInfo.offset[0] = x0 / outW;
          tileInfo.offset[1] = 1 - (y0 + tile) / outH;
          post.composite(tComp, tMain.texture, 1, tileInfo);
          down.render(renderer, tDown);
          // the tile's top rows are the last rows of the target (GL is bottom-up)
          renderer.readRenderTargetPixels(tDown, 0, tile - h, w, h, buf);
          const img = ctx.createImageData(w, h);
          const row = w * 4;
          for (let j = 0; j < h; j++) img.data.set(buf.subarray((h - 1 - j) * row, (h - j) * row), j * row);
          ctx.putImageData(img, x0, y0);
          done++;
          if (onProgress) onProgress(done, total);
          // keep the screen showing the frozen frame while we work
          post.composite(null, null, 1);
          await breathe();
        }
      }
    } finally {
      camera.clearViewOffset();
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      U.uSkyFar.value = skyFar;
      renderer.setRenderTarget(null);
      if (capRefl) capRefl.dispose();
      if (tMain) tMain.dispose();
      if (tComp) tComp.dispose();
      if (tDown) tDown.dispose();
    }
    const blob = await new Promise((res) => out.toBlob(res, 'image/png'));
    return { blob, canvas: out, width: outW, height: outH };
  };
}
