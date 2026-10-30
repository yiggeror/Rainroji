/* ============================================================================
   世界五 · 走马灯·皮影
   ----------------------------------------------------------------------------
   木刻里那盏灯笼的里面：一只走马灯。圆筒形的纸幕，里面点着一根蜡烛，烛火的热气推着上面的纸轮转，
   纸轮上挂着一圈皮影——骑马的人、跃起的鲤鱼、浪、一条渔船——它们的影子在纸幕上奔跑。
   · 光就是那根烛火。一切影子都是它投出来的：从烛火的位置，把每一片皮影投到纸幕上（逐像素求交，不是贴图）。
     离纸近的影子清楚；烛火有大小，离纸远的发虚、放大。烛火一晃，所有影子跟着变形、奔跑。
   · 皮影是染色的半透明牛皮：红、绿、琥珀透出自己的颜色，刻掉的地方透出白光，皮的边是黑的。
     它们是关节连着的：马腿在肩和胯上用铆钉连着，跑起来一前一后地摆；鲤鱼的尾巴另是一片。
   · 纸幕：灯光下透亮的纸，有纤维、有接缝；竹骨的影子；上下是红漆的木框。灯笼外面是夜。
   渲染：一个全屏着色器，直接出最终颜色。
   ========================================================================== */
(() => {
'use strict';
const YL = window.YL;
const W = (YL.worlds = YL.worlds || {});

/* ---------------------------------------------------------------- the puppets, drawn once into an atlas
   Colours are what the hide lets through: white = cut away (all the light), the dyed hide its own colour, black almost
   nothing. 4×2 cells of 512 px; the paths are written in 1000-unit cell coordinates (y down). */
const PUPPETS = (() => {
  const C = {
    red: '#d8301c', deep: '#9c1a12', green: '#2f8a4a', teal: '#1f6f78', sea: '#123e46', amber: '#f0a020', yellow: '#f6d24a',
    skin: '#f3c79a', hide: '#c89a5a', ink: '#141010', edge: '#2a1408', blue: '#2a5aa8',
  };
  // cells: name → [col, row] on the 4×2 grid
  const CELLS = { horse: [0, 0], fleg: [1, 0], hleg: [2, 0], rider: [3, 0], carp: [0, 1], tail: [1, 1], boat: [2, 1], waves: [3, 1] };
  function cell(ctx, name, fn) {
    const [cx, cy] = CELLS[name];
    ctx.save(); ctx.translate(cx * 512, cy * 512); ctx.scale(0.512, 0.512);
    ctx.beginPath(); ctx.rect(0, 0, 1000, 1000); ctx.clip();          // nothing spills into the next cell
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    fn(ctx);
    ctx.restore();
  }
  const P = (d) => new Path2D(d);
  // a dyed piece of hide: filled, then edged dark (the edge of the leather is thick)
  // a dyed piece of hide: filled, a fine line carved just inside its edge (the way the carvers finish every piece),
  // then edged dark (the cut edge of the leather is thick)
  function piece(ctx, d, col, edge = 7, inner = true) {
    const p = P(d); ctx.fillStyle = col; ctx.fill(p);
    if (inner) { ctx.save(); ctx.clip(p); ctx.strokeStyle = '#fff'; ctx.lineWidth = edge * 3.4; ctx.stroke(p); ctx.strokeStyle = col; ctx.lineWidth = edge * 2.2; ctx.stroke(p); ctx.restore(); }
    ctx.strokeStyle = C.edge; ctx.lineWidth = edge; ctx.stroke(p); return p;
  }
  // a rivet: where a jointed piece is pinned to the next
  function rivet(ctx, x, y) { ctx.fillStyle = C.edge; ctx.beginPath(); ctx.arc(x, y, 12, 0, 6.28); ctx.fill(); hole(ctx, x, y, 7); ctx.fillStyle = C.edge; ctx.beginPath(); ctx.arc(x, y, 3, 0, 6.28); ctx.fill(); }
  // a carved line: the knife takes the hide away and the light comes through
  function cut(ctx, d, w = 5) { ctx.strokeStyle = '#fff'; ctx.lineWidth = w; ctx.stroke(P(d)); }
  function hole(ctx, x, y, r) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); }
  // a carver's spiral (the whorls cut into the shoulder and the haunch)
  function whorl(ctx, x, y, r, turns, dir = 1, w = 5) {
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) { const u = i / 60, a = dir * u * turns * 6.2832, rr = r * (1 - u * 0.85); ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = w; ctx.stroke();
  }
  function draw(ctx) {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 2048, 1024);
    // ---- the horse: an arched neck, a small fine head, a deep chest, a round haunch; red hide carved with whorls
    cell(ctx, 'horse', c => {
      // tail first (behind)
      piece(c, 'M250 300 C205 290 168 318 150 362 C132 404 112 442 70 474 C126 466 158 436 178 402 C194 372 214 348 246 338 Z', C.ink, 5);
      cut(c, 'M226 318 C190 340 170 380 150 430', 4); cut(c, 'M236 330 C206 352 190 384 172 414', 3);
      const body = 'M255 292 C330 255 460 262 560 262 C615 262 645 245 672 212 C705 168 742 128 785 108 L792 76 L807 103 C822 104 838 112 852 126 C882 156 912 190 938 214 C952 228 946 250 926 254 C906 258 888 252 870 242 C852 232 838 236 826 252 C800 290 784 330 762 372 C744 408 708 430 664 434 C570 444 430 446 340 432 C296 426 262 408 244 380 C228 352 232 316 255 292 Z';
      piece(c, body, C.red, 8);
      // the mane: dark locks along the crest
      piece(c, 'M668 220 C684 196 698 168 728 140 C746 124 764 112 786 108 C774 124 770 132 760 146 C772 142 778 140 790 138 C770 156 760 170 752 184 C762 182 770 182 778 184 C752 200 738 214 722 230 C730 232 736 236 742 240 C716 250 696 248 680 240 Z', C.ink, 5);
      // the face: a blaze cut down the nose, the eye, the nostril, the bridle
      cut(c, 'M842 140 C870 168 900 196 926 226', 6);
      hole(c, 862, 166, 11); c.fillStyle = C.ink; c.beginPath(); c.arc(864, 167, 5, 0, 6.28); c.fill();
      hole(c, 922, 238, 5);
      cut(c, 'M820 150 C832 190 846 220 872 244', 4); cut(c, 'M818 196 C850 206 880 216 914 232', 4);
      // whorls on the shoulder and the haunch, and a row of little crescents along the belly
      whorl(c, 700, 330, 46, 1.7, 1, 6); whorl(c, 330, 340, 52, 1.7, -1, 6);
      for (let i = 0; i < 7; i++) { const x = 400 + i * 38; cut(c, `M${x} 420 C${x + 8} 410 ${x + 22} 410 ${x + 30} 420`, 5); }
      // the saddle cloth: green, bordered in yellow, a lattice cut through it; the saddle on top, a tassel hanging
      piece(c, 'M432 270 C472 262 560 262 604 268 L612 386 C560 398 482 398 428 388 Z', C.green, 6);
      c.strokeStyle = C.yellow; c.lineWidth = 12; c.stroke(P('M444 284 C480 278 556 278 592 282 L598 374 C556 382 486 382 442 376 Z'));
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { const x = 470 + i * 34, y = 302 + j * 26; c.fillStyle = '#fff'; c.beginPath(); c.moveTo(x, y - 9); c.lineTo(x + 9, y); c.lineTo(x, y + 9); c.lineTo(x - 9, y); c.closePath(); c.fill(); }
      piece(c, 'M470 268 C470 236 500 226 520 238 C540 228 576 232 584 262 Z', C.amber, 5);
      piece(c, 'M616 300 C626 330 624 360 630 392 C620 398 610 396 604 390 C606 360 604 330 606 304 Z', C.amber, 4);
      cut(c, 'M612 316 L616 380', 3);
    });
    // ---- a foreleg: pivot at the shoulder (0,0) = cell (500,120); hoof down
    cell(ctx, 'fleg', c => {
      c.translate(500, 120);
      piece(c, 'M-32 0 C-30 60 -24 110 -16 150 C-13 196 -13 236 -12 262 C-16 278 -24 292 -28 302 L24 302 C20 288 15 274 13 262 C15 234 17 196 19 150 C27 110 33 60 31 0 Z', C.red, 7);
      piece(c, 'M-28 302 L24 302 C26 316 26 326 22 334 L-30 334 C-34 324 -32 312 -28 302 Z', C.ink, 4);
      cut(c, 'M-10 40 C-6 76 -4 110 -2 140', 4); hole(c, 0, 158, 7); rivet(c, 0, 14);
      for (let i = 0; i < 3; i++) cut(c, `M-14 ${200 + i * 18} L12 ${196 + i * 18}`, 3);
    });
    // ---- a hind leg: pivot at the hip; the hock bent back
    cell(ctx, 'hleg', c => {
      c.translate(500, 100);
      piece(c, 'M-44 0 C-48 54 -36 112 -16 150 C-6 172 4 188 10 204 C6 228 2 250 0 264 C-4 280 -10 294 -14 304 L34 304 C30 290 26 276 24 264 C26 236 30 210 38 194 C46 166 54 118 46 0 Z', C.red, 7);
      piece(c, 'M-14 304 L34 304 C36 318 36 328 32 336 L-16 336 C-20 326 -18 314 -14 304 Z', C.ink, 4);
      cut(c, 'M-16 46 C-14 90 -4 130 10 170', 4); hole(c, 20, 196, 7); rivet(c, 0, 16);
      for (let i = 0; i < 3; i++) cut(c, `M-2 ${232 + i * 18} L22 ${228 + i * 18}`, 3);
    });
    // ---- the rider: seat at (500, 620); robe red with a yellow belt, a black boot, a helmet with two long pheasant plumes,
    //      a whip raised
    cell(ctx, 'rider', c => {
      c.translate(500, 620);
      // the plumes (翎子): two long curving feathers sweeping back over his shoulders
      piece(c, 'M-6 -232 C-60 -300 -140 -360 -250 -380 C-150 -340 -84 -290 -24 -222 Z', C.amber, 4);
      piece(c, 'M4 -236 C-30 -320 -96 -420 -200 -470 C-110 -400 -56 -320 -10 -230 Z', C.amber, 4);
      for (let i = 0; i < 9; i++) { const u = i / 9; cut(c, `M${-40 - u * 170} ${-268 - u * 90} l${-8 + u * 4} ${-10}`, 3); }
      // the leg over the horse's flank
      piece(c, 'M-24 -10 C12 2 58 10 84 18 C92 60 90 100 86 132 L60 134 C58 100 56 66 52 42 C20 36 -8 28 -30 22 Z', C.red, 6);
      piece(c, 'M60 134 L86 132 C96 140 116 146 124 154 L58 158 Z', C.ink, 4);
      // the robe and torso
      piece(c, 'M-46 6 C-56 -50 -50 -112 -30 -150 C-14 -164 18 -164 32 -150 C50 -110 54 -50 44 6 Z', C.red, 7);
      c.fillStyle = C.yellow; c.fillRect(-48, -64, 96, 16); c.strokeStyle = C.edge; c.lineWidth = 4; c.strokeRect(-48, -64, 96, 16);
      for (let i = 0; i < 4; i++) whorl(c, -20 + (i % 2) * 34, -128 + Math.floor(i / 2) * 40, 14, 1.4, 1, 3);
      cut(c, 'M-36 -8 C-20 -2 20 -2 36 -8', 4);
      // the head: a pale face carved with a brow, an eye, a nose line; the helmet over it
      piece(c, 'M-18 -160 C-28 -176 -28 -206 -14 -218 C0 -228 22 -222 28 -206 C34 -192 32 -170 20 -160 Z', C.skin, 5);
      cut(c, 'M4 -198 C12 -202 20 -200 26 -196', 3); cut(c, 'M10 -190 C14 -188 20 -188 24 -190', 3); cut(c, 'M28 -190 L32 -178 L26 -174', 3);
      piece(c, 'M-28 -206 C-30 -236 -10 -252 12 -248 C30 -244 38 -228 34 -210 C10 -216 -8 -214 -28 -206 Z', C.ink, 4);
      hole(c, 6, -236, 5);
      // the arm and the raised whip
      piece(c, 'M14 -142 C40 -136 66 -118 82 -96 L70 -86 C56 -104 36 -118 10 -124 Z', C.red, 5);
      c.strokeStyle = C.ink; c.lineWidth = 7; c.stroke(P('M80 -92 C110 -140 150 -190 210 -230'));
      c.lineWidth = 3; c.stroke(P('M210 -230 C240 -250 250 -220 236 -196 C226 -180 240 -160 256 -158'));
    });
    // ---- the carp: facing right; red-orange, carved with rows of scales, yellow fins; the tail is its own piece
    cell(ctx, 'carp', c => {
      c.translate(0, 200);
      piece(c, 'M380 212 C420 150 500 110 600 112 C560 140 540 170 548 204 Z', C.amber, 5);                  // dorsal fin
      for (let i = 0; i < 5; i++) cut(c, `M${440 + i * 26} ${196 - i * 8} L${470 + i * 26} ${150 - i * 6}`, 3);
      piece(c, 'M560 380 C580 430 620 460 660 466 C650 430 640 404 620 380 Z', C.amber, 4);                    // pelvic fin
      piece(c, 'M840 300 C830 250 780 214 700 200 C560 176 380 200 250 262 C216 278 190 288 168 294 L168 312 C190 318 216 326 250 342 C380 402 560 422 700 402 C780 390 830 350 840 300 Z', C.red, 8);
      // scales: rows of little arcs, cut
      for (let j = -3; j <= 3; j++) for (let i = 0; i < 10; i++) {
        const x = 300 + i * 46 + (j & 1) * 23, y = 302 + j * 30;
        const top = 300 - 120 * Math.sin(Math.min(1, (x - 200) / 520) * 2.6) * 0.75, inside = Math.abs(y - 302) < (x < 640 ? 18 + (x - 250) * 0.27 : 95 - (x - 640) * 0.5);
        if (x > 270 && x < 680 && inside) cut(c, `M${x} ${y - 14} C${x + 16} ${y - 12} ${x + 18} ${y + 12} ${x} ${y + 14}`, 4);
      }
      // the head: a gill line, an eye ringed, the barbels
      cut(c, 'M708 222 C690 260 690 340 712 384', 6);
      hole(c, 776, 266, 16); c.fillStyle = C.ink; c.beginPath(); c.arc(779, 266, 8, 0, 6.28); c.fill();
      c.strokeStyle = C.edge; c.lineWidth = 4; c.stroke(P('M832 316 C856 340 866 372 852 404')); c.stroke(P('M826 322 C842 352 838 380 820 400'));
      piece(c, 'M700 330 C740 350 760 380 750 410 C730 390 712 366 690 352 Z', C.amber, 4);                   // pectoral fin
    });
    // ---- the carp's tail: pivot at its root (0,0) = cell (500, 500); it spreads to the left
    cell(ctx, 'tail', c => {
      c.translate(560, 500);
      piece(c, 'M0 -16 C-50 -64 -110 -130 -190 -150 C-160 -80 -150 -30 -168 0 C-150 30 -160 80 -190 150 C-110 130 -50 64 0 16 Z', C.amber, 6);
      for (let i = -3; i <= 3; i++) cut(c, `M-14 ${i * 4} C-70 ${i * 22} -120 ${i * 36} -160 ${i * 44}`, 3);
    });
    // ---- the fishing boat: a sampan, bow and stern swept up, a woven arched canopy amidships; an old fisherman in a
    //      broad conical hat and a straw cape sits in the bow, his rod out over the water
    cell(ctx, 'boat', c => {
      c.translate(0, 60);
      c.strokeStyle = C.ink; c.lineWidth = 6; c.stroke(P('M842 452 C880 380 930 300 996 250'));                        // the rod
      c.lineWidth = 2.5; c.stroke(P('M996 250 C994 330 992 420 990 560'));                                         // the line
      // the canopy: woven matting over a bamboo arch
      piece(c, 'M330 500 C326 420 380 360 470 352 C560 346 630 396 640 500 Z', C.amber, 7);
      c.save(); c.clip(P('M330 500 C326 420 380 360 470 352 C560 346 630 396 640 500 Z'));
      for (let i = -8; i < 12; i++) { cut(c, `M${330 + i * 34} 500 L${430 + i * 34} 350`, 4); cut(c, `M${330 + i * 34} 350 L${430 + i * 34} 500`, 4); }
      c.restore(); c.strokeStyle = C.edge; c.lineWidth = 7; c.stroke(P('M330 500 C326 420 380 360 470 352 C560 346 630 396 640 500 Z'));
      piece(c, 'M352 500 C350 430 400 380 470 374 C546 368 606 410 616 500 L600 500 C592 420 540 390 470 396 C410 400 370 440 368 500 Z', C.deep, 4, false);
      // the fisherman: straw cape, conical hat
      piece(c, 'M736 500 C726 466 730 430 748 404 C770 392 812 392 832 404 C850 430 856 468 846 500 Z', C.green, 6);
      for (let i = 0; i < 7; i++) cut(c, `M${750 + i * 13} ${414 + (i % 2) * 6} L${744 + i * 14} 494`, 3);
      piece(c, 'M770 400 C770 380 806 376 812 394 C814 404 806 410 792 410 C780 410 770 408 770 400 Z', C.skin, 4);
      piece(c, 'M690 404 C730 372 772 350 792 340 C812 350 856 372 900 404 C840 396 750 396 690 404 Z', C.hide, 6);
      cut(c, 'M730 392 C770 372 812 372 860 392', 3); cut(c, 'M760 380 C780 368 806 368 828 380', 3);
      piece(c, 'M826 430 C846 438 858 448 848 458 C838 452 826 446 818 440 Z', C.skin, 3);
      // the hull, its planking carved, bow and stern swept up
      piece(c, 'M150 420 C200 470 290 496 400 500 L700 500 C800 496 880 462 940 396 C930 476 860 548 740 562 L360 562 C250 552 180 500 150 420 Z', C.hide, 8);
      for (let i = 0; i < 3; i++) cut(c, `M${190 + i * 24} ${470 + i * 20} C${350} ${516 + i * 16} ${700} ${516 + i * 16} ${890 - i * 34} ${452 + i * 26}`, 4);
      for (let i = 0; i < 6; i++) hole(c, 300 + i * 90, 546, 6);
    });
    // ---- waves: a band of curling crests, blue-green, each curl carved
    cell(ctx, 'waves', c => {
      c.translate(0, 560);
      // (the band runs on into the next piece at both ends: only the crest gets the edge and the carved line, not the sides)
      let crest = 'M-10 120 ';
      for (let i = 0; i < 4; i++) { const x = i * 250; crest += `C${x + 60} 120 ${x + 90} 40 ${x + 150} 30 C${x + 200} 22 ${x + 236} 52 ${x + 224} 84 C${x + 214} 108 ${x + 186} 104 ${x + 180} 84 C${x + 200} 120 ${x + 230} 120 ${x + 250} 120 `; }
      crest += 'L1010 120';
      const body = P(crest + ' L1010 460 L-10 460 Z');
      c.fillStyle = C.sea; c.fill(body);
      c.save(); c.clip(body); c.strokeStyle = '#fff'; c.lineWidth = 24; c.stroke(P(crest)); c.strokeStyle = C.sea; c.lineWidth = 15; c.stroke(P(crest)); c.restore();
      c.strokeStyle = C.edge; c.lineWidth = 7; c.stroke(P(crest));
      for (let i = 0; i < 4; i++) { const x = i * 250; whorl(c, x + 190, 72, 26, 1.3, 1, 5); for (let k = 0; k < 3; k++) cut(c, `M${x + 40 + k * 30} ${170 + k * 40} C${x + 90 + k * 30} ${150 + k * 40} ${x + 140 + k * 30} ${150 + k * 40} ${x + 190 + k * 30} ${170 + k * 40}`, 4); }
    });
  }
  return { draw, CELLS };
})();

/* ---------------------------------------------------------------- the lantern, lit from inside */
const NP = 40;                                   // most pieces of hide on the wheel at once
const FS = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform vec3 uEye, uFwd, uRight, uUp; uniform vec2 uTan;
uniform float uTime, uExp, uFade, uDbg;
uniform sampler2D uAtlas;
uniform vec3 uF;             // the flame
uniform vec4 uFI;            // its colour × brightness, its radius
uniform vec4 uP0[${NP}];     // each piece: ring angle, ring radius, where its pivot is on the hide's plane (u, v; m)
uniform vec4 uP1[${NP}];     //             its turn, metres per atlas pixel, its pivot in the atlas (px)
uniform int uN;
uniform vec4 uRod[8];        // the wires that hold the figures: ring angle, radius, u, height of the top
uniform int uNR;
out vec4 o;
const float R = 0.30, H = 0.24;                  // the paper drum: radius, half its height
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
// the ray against the drum's side (x² + z² = r²): nearest entry
vec2 cyl(vec3 ro, vec3 rd, float r){
  float a = dot(rd.xz, rd.xz), b = dot(ro.xz, rd.xz), c = dot(ro.xz, ro.xz) - r * r, h = b * b - a * c;
  if (h < 0.0) return vec2(-1.0);
  h = sqrt(h); return vec2((-b - h) / a, (-b + h) / a);
}
// what reaches the paper at S from the flame: through every piece of hide in the way, and past the bamboo ribs
vec3 through(vec3 S, float blur){
  vec3 F = uF, D = S - F;
  float dS = length(D);
  vec3 T = vec3(1.0);
  for (int i = 0; i < ${NP}; i++){
    if (i >= uN) break;
    vec4 a = uP0[i], b = uP1[i];
    vec3 n = vec3(cos(a.x), 0.0, sin(a.x)), t = vec3(sin(a.x), 0.0, -cos(a.x));
    float dn = dot(n, D); if (dn <= 1e-4) continue;
    float s = (a.y - dot(n, F)) / dn;
    if (s <= 0.0 || s >= 1.0) continue;
    vec3 X = F + D * s;
    vec2 q = vec2(dot(X, t), X.y) - a.zw;
    float c = cos(b.x), sn = sin(b.x);
    q = vec2(c * q.x + sn * q.y, -sn * q.x + c * q.y) / b.y;              // into the piece's own pixels
    vec2 px = b.zw + vec2(q.x, -q.y);
    vec2 cellO = floor(b.zw / 512.0) * 512.0;
    if (px.x < cellO.x + 1.0 || px.y < cellO.y + 1.0 || px.x > cellO.x + 511.0 || px.y > cellO.y + 511.0) continue;
    // the flame has a size: the further the hide is from the paper, the softer its shadow
    float pen = (uFI.w * (1.0 - s) / s + blur) / b.y;                       // penumbra, in atlas pixels
    vec3 tr = textureLod(uAtlas, px / vec2(2048.0, 1024.0), log2(max(pen, 1.0))).rgb;
    tr = pow(tr, vec3(2.2));
    // dyed hide is not even: it is thicker here, thinner there
    float hide = 1.0 - step(0.9, min(tr.r, min(tr.g, tr.b)));
    tr *= 1.0 - hide * (0.25 * vnoise(px * 0.08) + 0.15 * vnoise(px * 0.5));
    T *= tr;
  }
  // the wires that hold the figures out on the wheel
  for (int i = 0; i < 8; i++){
    if (i >= uNR) break;
    vec4 a = uRod[i];
    vec3 n = vec3(cos(a.x), 0.0, sin(a.x)), t = vec3(sin(a.x), 0.0, -cos(a.x));
    float dn = dot(n, D); if (dn <= 1e-4) continue;
    float s = (a.y - dot(n, F)) / dn; if (s <= 0.0 || s >= 1.0) continue;
    vec3 X = F + D * s;
    float w = 0.0011 + uFI.w * (1.0 - s) / s;
    T *= 1.0 - 0.85 * smoothstep(w, w * 0.4, abs(dot(X, t) - a.z)) * step(X.y, a.w) * step(-0.20, X.y);
  }
  // the bamboo ribs, just inside the paper: sixteen upright, and a hoop near the top and the bottom
  vec2 rr = cyl(F, normalize(D), 0.290);
  vec3 Xr = F + normalize(D) * rr.y;
  float ang = atan(Xr.z, Xr.x), cell = 6.28318 / 8.0;
  float da = abs(fract(ang / cell + 0.5 + 0.0625) - 0.5) * cell * 0.290;
  float pw = uFI.w * 0.010 / 0.29;
  T *= 1.0 - 0.75 * smoothstep(0.0018 + pw, 0.0018 - pw * 0.5, da);
  T *= 1.0 - 0.80 * smoothstep(0.0025 + pw, 0.0025 - pw * 0.5, abs(abs(Xr.y) - 0.222));
  return T;
}
void main(){
  vec2 ndc = gl_FragCoord.xy / uRes * 2.0 - 1.0;
  vec3 rd = normalize(uFwd + uRight * ndc.x * uTan.x + uUp * ndc.y * uTan.y), ro = uEye;
  vec3 col = vec3(0.0);
  vec2 hc = cyl(ro, rd, R);
  float tF = hc.x;
  vec3 S = ro + rd * tF;
  vec3 flameC = uFI.rgb;
  if (tF > 0.0 && abs(S.y) < H){
    vec3 N = vec3(S.x, 0.0, S.z) / R;
    float th = atan(S.z, S.x);
    vec2 pq = vec2(th * R, S.y);                                               // the paper, flattened (m)
    // the light arriving at the inside of the paper, and how much of it comes through
    vec3 L = uF - S; float d2 = dot(L, L);
    float cosI = max(dot(-N, normalize(L)), 0.0);
    vec3 E = flameC / d2 * (0.35 + 0.65 * cosI);
    float fib = 0.82 + 0.10 * vnoise(pq * vec2(90.0, 30.0)) + 0.08 * vnoise(pq * 420.0) + 0.06 * (vnoise(pq * vec2(1400.0, 300.0)) - 0.5);
    // where two sheets overlap at a rib, the paper is double
    float cellA = 6.28318 / 8.0, sa = abs(fract(th / cellA + 0.5 + 0.0625) - 0.5) * cellA * R;
    float seam = smoothstep(0.0062, 0.0056, sa + 0.0006 * vnoise(vec2(S.y * 300.0, th)));
    float tau = fib * (1.0 - 0.22 * seam);
    vec3 paper = vec3(1.0, 0.90, 0.72);
    vec3 thr = through(S, 0.0);
    col = E * thr * tau * paper * 0.032;
    // through this paper, faintly, the far side of the drum: its own shadows, running the other way
    vec3 S2 = ro + rd * hc.y;
    vec3 L2 = uF - S2;
    if (abs(S2.y) < H) col += flameC / dot(L2, L2) * through(S2, 0.004) * paper * 0.032 * 0.22 * fib;
    // the flame seen straight through the paper: a soft hot glow where it sits
    vec3 toF = normalize(uF - ro);
    float g = max(dot(rd, toF), 0.0);
    col += flameC * thr * (0.10 * exp(-(1.0 - g) * 5000.0) + 0.020 * exp(-(1.0 - g) * 350.0)) * tau;
    // the paper's edge darkens where it turns away (the light inside comes through it slantwise, through more paper)
    col *= 0.55 + 0.45 * pow(max(dot(N, -rd), 0.0), 0.6);
  } else {
    // the red lacquered frame above and below the paper, and beyond it the night
    vec2 hf = cyl(ro, rd, R + 0.012);
    vec3 P = ro + rd * hf.x;
    if (hf.x > 0.0 && abs(P.y) < H + 0.040 && abs(P.y) > H - 0.004){
      vec3 N = vec3(P.x, 0.0, P.z) / (R + 0.012);
      float lit = exp(-(abs(P.y) - H) / 0.012);                               // the paper's glow on the wood next to it
      float band = smoothstep(0.003, 0.0, abs(abs(P.y) - H - 0.020)) * 0.5;     // a gilt line round it
      vec3 lac = vec3(0.30, 0.035, 0.02) * (0.6 + 0.4 * vnoise(vec2(atan(P.z, P.x) * 40.0, P.y * 200.0)));
      col = flameC * (lac * (0.004 + 0.03 * lit) + vec3(0.9, 0.6, 0.2) * band * 0.012) * pow(max(dot(N, -rd), 0.0), 0.7);
    } else {
      // the night round it, warmed a little by the lantern
      vec3 c0 = vec3(0.0, uF.y, 0.0) - ro; float tc = max(dot(c0, rd), 0.0);
      float dd = length(ro + rd * tc - vec3(0.0, clamp((ro + rd * tc).y, -H, H), 0.0)) - R;
      col = flameC * (0.012 * exp(-max(dd, 0.0) / 0.05) + 0.006 * exp(-max(dd, 0.0) / 0.25)) + vec3(0.0015, 0.0012, 0.0011);
    }
  }
  if (uDbg > 0.0 && tF > 0.0 && abs(S.y) < H) col = through(S, 0.0) * 0.6;
  vec3 c = aces(col * uExp);
  c = pow(c, vec3(1.0 / 2.2));
  vec2 uv = gl_FragCoord.xy / uRes - 0.5;
  c *= 1.0 - 0.35 * dot(uv, uv) * 1.6;
  c += (hash12(gl_FragCoord.xy + fract(uTime * 7.13) * 917.0) - 0.5) * 0.02;
  o = vec4(max(c, 0.0) * uFade, 1.0);
}`;
const VS_FULL = `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

/* ---------------------------------------------------------------- the figures on the wheel
   Ring angles turn with the wheel; positions on the hide's plane are in metres (u along the ring, v up). */
const S_PX = 3.3e-4;                             // metres per atlas pixel: a horse about 15 cm long
const RING = 0.255;
const cellPx = (name, x, y) => { const c = PUPPETS.CELLS[name]; return [c[0] * 512 + x * 0.512, c[1] * 512 + y * 0.512]; };
function rot(p, a) { const c = Math.cos(a), s = Math.sin(a); return [c * p[0] - s * p[1], s * p[0] + c * p[1]]; }

W.shadow = {
  ready: false, t: 0, fade: 1, vol: 1, light: 1,
  init() {
    if (this.ready) return;
    const gl = YL.gl;
    this.p = YL.makeProgram('shadow', VS_FULL, FS); YL.checkProgram(this.p);
    // the hide, cut and dyed
    const cv = document.createElement('canvas'); cv.width = 2048; cv.height = 1024;
    PUPPETS.draw(cv.getContext('2d'));
    this.atlas = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.empty = gl.createVertexArray();
    if (!this.inited) this.t = +(YL.QS.get('wt') || 0);
    this.inited = true;
    this.ready = true;
  },
  hero: { on: false, sway: [0, 0], v: [0, 0], aim: null },
  // the wheel: one turn in about 24 s; the figures run left to right across the front
  wheel(t) { return Math.PI / 2 - 0.62 + t * 0.26; },
  // every piece of hide this frame: [ring angle, radius, pivot u, v] [turn, m/px, atlas px x, y]
  pieces(t) {
    const out = [], rods = [], w = this.wheel(t);
    const put = (phi, u, v, cell, cx, cy, turn = 0, k = 1, r = RING) => out.push([phi, r, u, v, turn, S_PX * k, ...cellPx(cell, cx, cy)]);
    // a horseman at the gallop: legs swinging on their rivets, the body rocking, the rider rising and falling
    const horse = (phi, ph, k) => {
      const g = t * 9.0 + ph, rock = 0.05 * Math.sin(g), bob = 0.004 * Math.sin(2 * g + 0.5);
      const at = (x, y) => { const p = rot([(x - 500) * 0.512 * S_PX * k, -(y - 300) * 0.512 * S_PX * k], rock); return [p[0], p[1] - 0.005 + bob]; };
      let p = at(330, 380); put(phi, p[0], p[1], 'hleg', 500, 100, rock + 0.45 * Math.sin(g + 2.4), k); put(phi, p[0] + 0.004, p[1], 'hleg', 500, 100, rock + 0.45 * Math.sin(g + 1.6), k);
      p = at(700, 390); put(phi, p[0], p[1], 'fleg', 500, 120, rock + 0.55 * Math.sin(g + 0.4), k); put(phi, p[0] - 0.004, p[1], 'fleg', 500, 120, rock + 0.55 * Math.sin(g - 0.6), k);
      p = at(500, 300); put(phi, p[0], p[1], 'horse', 500, 300, rock, k);
      p = at(520, 282); put(phi, p[0], p[1] + 0.002 * Math.sin(2 * g + 1.5), 'rider', 500, 620, rock * 0.5 - 0.04 * Math.sin(g), k * 1.45);
      rods.push([phi, RING + 0.004, 0, -0.03]);
    };
    // a carp leaping out of the waves and back, flexing its tail
    const carp = (phi, ph, k, flip = 1) => {
      const L = ((t + ph) % 6.0) / 6.0, arc = Math.sin(Math.PI * L), up = -0.075 + 0.13 * arc, tilt = 0.6 * Math.cos(Math.PI * L) * flip;
      const at = (x, y) => { const p = rot([(x - 500) * 0.512 * S_PX * k, -(y - 500) * 0.512 * S_PX * k], tilt); return [p[0] + 0.05 * (L - 0.5), p[1] + up]; };
      let p = at(168, 503); put(phi, p[0], p[1], 'tail', 560, 500, tilt + 0.35 * Math.sin(t * 7 + ph), k);
      p = at(500, 500); put(phi, p[0], p[1], 'carp', 500, 500, tilt, k);
    };
    horse(w, 0, 1);
    horse(w - 0.72, 2.1, 0.94);
    carp(w - 1.95, 0, 0.9);
    // the boat, rocking on the swell
    const bt = t * 1.3;
    put(w - 2.55, 0, -0.085 + 0.006 * Math.sin(bt), 'boat', 500, 500, 0.06 * Math.sin(bt + 0.7), 1.25);
    carp(w - 3.15, 2.7, 0.8);
    // the sea: a band of waves right round the wheel (eight pieces, end to end), heaving a little; and further in, on a
    // smaller wheel turning the other way, a second, bigger swell whose shadow is larger and softer
    // (each piece is flat, so it must reach the tangent's length, not the arc's, to meet the next one)
    const kw = 2 * RING * Math.tan(Math.PI / 8) / (512 * S_PX);
    for (let i = 0; i < 8; i++) put(w - i * Math.PI / 4, 0, -0.140 + 0.004 * Math.sin(t * 1.3 + i * 2), 'waves', 500, 500, 0, kw);
    const w2 = Math.PI / 2 - t * 0.11, r2 = 0.165, kw2 = 2 * r2 * Math.tan(Math.PI / 6) / (512 * S_PX);
    for (let i = 0; i < 6; i++) put(w2 - i * Math.PI / 3, 0, -0.118 + 0.005 * Math.sin(t * 0.9 + i), 'waves', 500, 500, 0, kw2, r2);
    for (const ph of [w - 1.95, w - 2.55, w - 3.15]) rods.push([ph, RING + 0.004, 0, -0.16]);
    return { out, rods };
  },
  camera(aspect, t, still) {
    const V = YL.V;
    // (pull: 0 = right up against the paper, by the flame; 1 = the whole lantern)
    const u = this.pull ?? 1, e = u * u * (3 - 2 * u), f = this.flame(t).p;
    const eye = [(still ? 0 : 0.010 * Math.sin(t * 0.21)) * e + f[0] * (1 - e), -0.01 + (still ? 0 : 0.006 * Math.sin(t * 0.17)) * e + (f[1] + 0.01) * (1 - e), 0.40 + 0.72 * e];
    const at = [f[0] * (1 - e), -0.012 * e + f[1] * (1 - e), 0];
    const fwd = V.norm(V.sub(at, eye)), right = V.norm(V.cross(fwd, [0, 1, 0])), up = V.cross(right, fwd);
    const vfov = (aspect < 0.9 ? 52 : 36) * (this.zoom ?? 1), ty = Math.tan(vfov * Math.PI / 360);
    return { eye, fwd, right, up, tan: [ty * aspect, ty] };
  },
  // the flame: it leans with the draught, flickers, and (when 一粒光 is in it) answers your hand
  flame(t) {
    const H = this.hero;
    const sx = 0.004 * Math.sin(t * 1.7) + 0.002 * Math.sin(t * 4.3 + 1) + H.sway[0], sy = 0.002 * Math.sin(t * 2.3);
    const br = 1 + 0.07 * Math.sin(t * 2.1) + 0.03 * Math.sin(t * 5.3) + 0.05 * Math.sin(t * 13.0) * Math.sin(t * 3.1);   // the breathing every world shares, and a candle's flicker
    const sink = this.sink || 0;
    return { p: [sx * (1 - sink), -0.075 + sy + H.sway[1] - 0.15 * sink, 0.004 * Math.sin(t * 1.1)], k: br * this.light, r: 0.007 * (1 - 0.7 * sink) };
  },
  pointer(nx, ny, speed) {
    this.hero.aim = [Math.max(-1, Math.min(1, nx)), Math.max(-1, Math.min(1, ny))];
    if (speed > 1.5) this.gust = Math.min(1, (this.gust || 0) + 0.3);
  },
  update(dt) {
    this.t += dt;
    const H = this.hero, tgt = H.aim ? [H.aim[0] * 0.03, H.aim[1] * 0.012] : [0, 0];
    this.gust = Math.max(0, (this.gust || 0) - dt * 0.8);
    for (let i = 0; i < 2; i++) { H.v[i] += (tgt[i] - H.sway[i]) * 14 * dt; H.v[i] *= Math.exp(-dt * 4); H.sway[i] += H.v[i] * dt; }
    this.sound(dt);
  },
  render(target, aspect) {
    const gl = YL.gl, U = YL.U, p = this.p;
    const w = target ? target.w : gl.drawingBufferWidth, h = target ? target.h : gl.drawingBufferHeight;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null); gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    gl.useProgram(p.p);
    const cam = this.cam = this.camera(aspect, this.t, YL.DBG.still);
    const f = this.flame(this.t), { out, rods } = this.pieces(this.t);
    U(p, 'uRes', [w, h]); U(p, 'uEye', cam.eye); U(p, 'uFwd', cam.fwd); U(p, 'uRight', cam.right); U(p, 'uUp', cam.up); U(p, 'uTan', cam.tan);
    U(p, 'uTime', this.t); U(p, 'uDbg', YL.QS.has('sdbg') ? 1 : 0); U(p, 'uExp', 1.0); U(p, 'uFade', this.fade);
    U(p, 'uF', f.p); U(p, 'uFI', [...YL.mulc(YL.bb(1850), 0.9 * f.k), f.r * (1 + (this.gust || 0))]);
    const a0 = new Float32Array(NP * 4), a1 = new Float32Array(NP * 4), ar = new Float32Array(32);
    out.slice(0, NP).forEach((q, i) => { a0.set(q.slice(0, 4), i * 4); a1.set(q.slice(4, 8), i * 4); });
    rods.slice(0, 8).forEach((q, i) => ar.set(q, i * 4));
    gl.uniform4fv(p.u.uP0, a0); gl.uniform4fv(p.u.uP1, a1); gl.uniform1i(p.u.uN, Math.min(out.length, NP));
    gl.uniform4fv(p.u.uRod, ar); gl.uniform1i(p.u.uNR, Math.min(rods.length, 8));
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.atlas); gl.uniform1i(p.u.uAtlas, 0);
    gl.bindVertexArray(this.empty); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null);
  },
  /* ---- sound: the paper wheel turning (a dry, soft rustle in time with it), the candle's small crackle, and far off
     a bowed string and a gong, the way a shadow play begins */
  buildAudio(b) {
    const { ctx, out, noiseBuffer, loop } = b;
    const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(out);
    const pink = noiseBuffer(6.1, 'pink');
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 0.8;
    const rg = ctx.createGain(); rg.gain.value = 0;
    loop(pink, 1.0, bp); bp.connect(rg); rg.connect(bus);
    this.snd = { ctx, bus, rg, next: 0.5, nextTone: 1.2 };
  },
  crackle() {
    const S = this.snd, ctx = S.ctx, t0 = ctx.currentTime + 0.01, sr = ctx.sampleRate;
    const n = Math.floor(sr * 0.03), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.003));
    const s = ctx.createBufferSource(); s.buffer = b;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1800;
    const g = ctx.createGain(); g.gain.value = 0.05 + 0.06 * Math.random();
    s.connect(f); f.connect(g); g.connect(S.bus); s.start(t0);
  },
  // an erhu-like phrase: a bowed tone sliding between notes of the pentatonic scale, then a soft gong
  phrase() {
    const S = this.snd, ctx = S.ctx; let t = ctx.currentTime + 0.05;
    const notes = [392, 440, 523.25, 587.33, 659.25], seq = [2, 3, 1, 2, 0];
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    const vib = ctx.createOscillator(); vib.frequency.value = 5.2; const vg = ctx.createGain(); vg.gain.value = 5; vib.connect(vg); vg.connect(o.frequency);
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 1100; f1.Q.value = 1.4;
    const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 2600;
    const g = ctx.createGain(); g.gain.value = 0;
    o.connect(f1); f1.connect(f2); f2.connect(g); g.connect(S.bus);
    o.frequency.setValueAtTime(notes[seq[0]], t);
    let tt = t;
    seq.forEach((k, i) => { const d = i === seq.length - 1 ? 1.8 : 0.55 + 0.25 * (i % 2); o.frequency.setTargetAtTime(notes[k], tt, 0.05); g.gain.setTargetAtTime(0.035, tt, 0.08); g.gain.setTargetAtTime(0.022, tt + d * 0.6, 0.1); tt += d; });
    g.gain.setTargetAtTime(0, tt, 0.4);
    o.start(t); vib.start(t); o.stop(tt + 2); vib.stop(tt + 2);
    // the gong, far off
    const gt = tt - 0.6;
    [[110, 1], [167, 0.6], [231, 0.35], [298, 0.2]].forEach(([fq, a]) => {
      const go = ctx.createOscillator(); go.frequency.setValueAtTime(fq * 1.02, gt); go.frequency.exponentialRampToValueAtTime(fq, gt + 1.5);
      const gg = ctx.createGain(); gg.gain.setValueAtTime(0, gt); gg.gain.linearRampToValueAtTime(0.035 * a, gt + 0.02); gg.gain.setTargetAtTime(0, gt + 0.05, 1.6);
      go.connect(gg); gg.connect(S.bus); go.start(gt); go.stop(gt + 7);
    });
  },
  sound(dt) {
    if (!this.snd) { const b = YL.AUDIO.bus && YL.AUDIO.bus(); if (b) this.buildAudio(b); else return; }
    const S = this.snd, now = S.ctx.currentTime;
    S.bus.gain.setTargetAtTime(this.fade * (this.vol ?? 1), now, 0.5);
    S.rg.gain.setTargetAtTime(0.025 * (0.6 + 0.4 * Math.sin(this.t * 6.3) * Math.sin(this.t * 1.1)), now, 0.1);
    if ((S.next -= dt) <= 0) { this.crackle(); S.next = Math.random() < 0.4 ? 0.08 + Math.random() * 0.2 : 0.8 + Math.random() * 2.5; }
    if ((S.nextTone -= dt) <= 0) { this.phrase(); S.nextTone = 14 + Math.random() * 6; }
  },
};
})();
