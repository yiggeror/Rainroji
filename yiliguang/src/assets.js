/* 生成的图层：解码成图片，再按需做成纹理。
   图层数据在 src/assets/*.js 里（data URI）；这里一加载页面就开始解码，YL.assetsReady 在全部解码完时兑现
   （录片前会等它，所以每一帧都有图）。 */
(() => {
'use strict';
const YL = window.YL;
const imgs = {}, texs = {};
const jobs = Object.entries(YL.ASSET_DATA || {}).map(([k, u]) => {
  const im = new Image(); im.src = u; imgs[k] = im;
  return (im.decode ? im.decode() : new Promise(r => { im.onload = r; })).catch(() => {});
});
YL.assetsReady = Promise.all(jobs).then(() => { YL.assetsLoaded = true; });
YL.img = (k) => imgs[k];
// a texture of one of them, made the first time it is asked for once the picture is decoded (null until then)
YL.assetTex = (k, mips = true) => {
  if (texs[k]) return texs[k];
  const im = imgs[k];
  if (!im || !im.complete || !im.naturalWidth) return null;
  const gl = YL.gl, t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, im);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  if (mips) gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  texs[k] = t; t.w = im.naturalWidth; t.h = im.naturalHeight;
  return t;
};
YL.dropAssetTextures = () => { for (const k in texs) delete texs[k]; };     // (a lost GL context)
})();
