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
  // cells: name → [col, row, cells wide] on the 8×4 grid
  const CELLS = {
    horse: [0, 0], fleg: [1, 0], hleg: [2, 0], rider: [3, 0], carp: [0, 1], tail: [1, 1], boat: [2, 1], waves: [3, 1],
    bearer: [4, 0], leg: [5, 0], palanquin: [6, 0], flagman: [7, 0], banner: [4, 1], pagoda: [5, 1], willow: [6, 1], pine: [7, 1],
    wall: [0, 2, 2], bridge: [2, 2, 2], mountains: [4, 2, 2], clouds: [6, 2, 2],
    crane: [0, 3], cwing: [1, 3], dhead: [2, 3], dbody: [3, 3], dtail: [4, 3], reeds: [5, 3], lotus: [6, 3], wtrunk: [7, 3],
  };
  // a few cells hold two pieces: those are told apart by the part of the cell they use (in cell units)
  const PART = { waves: [0, 560, 1000, 1000], road: [0, 330, 1000, 540, 'waves'] };
  function cell(ctx, name, fn) {
    const [cx, cy, wd = 1] = CELLS[name];
    ctx.save(); ctx.translate(cx * 512, cy * 512); ctx.scale(0.512, 0.512);
    ctx.beginPath(); ctx.rect(0, 0, 1000 * wd, 1000); ctx.clip();     // nothing spills into the next cell
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
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 4096, 2048);
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
    // ================================================================ the world inside the lantern
    // patterns cut through a piece (clipped to its outline): lattice, rows of dots, fish scales, brickwork
    const within = (c, d, fn) => { c.save(); c.clip(P(d)); fn(); c.restore(); };
    const lattice = (c, x0, y0, x1, y1, s, w = 4) => { for (let x = x0 - (y1 - y0); x < x1; x += s) { cut(c, `M${x} ${y1} L${x + (y1 - y0)} ${y0}`, w); cut(c, `M${x} ${y0} L${x + (y1 - y0)} ${y1}`, w); } };
    const dots = (c, x0, y0, x1, y1, s, r) => { for (let y = y0, k = 0; y < y1; y += s, k++) for (let x = x0 + (k % 2) * s / 2; x < x1; x += s) hole(c, x, y, r); };
    const scales = (c, x0, y0, x1, y1, s, w = 4) => { for (let y = y0, k = 0; y < y1; y += s * 0.6, k++) for (let x = x0 + (k % 2) * s / 2; x < x1; x += s) cut(c, `M${x - s / 2} ${y} Q${x} ${y + s * 0.6} ${x + s / 2} ${y}`, w); };
    const bricks = (c, x0, y0, x1, y1, bw, bh, w = 3) => { for (let y = y0, k = 0; y < y1; y += bh, k++) { cut(c, `M${x0} ${y} L${x1} ${y}`, w); for (let x = x0 + (k % 2) * bw / 2; x < x1; x += bw) cut(c, `M${x} ${y} L${x} ${y + bh}`, w); } };
    const torso = 'M455 660 C440 590 448 520 470 470 C490 440 540 432 566 450 C590 470 596 520 588 580 C580 620 570 650 556 668 Z';
    // ---- a palanquin bearer, facing right, leaning into the load; his hand up at the pole (the palanquin carries it)
    cell(ctx, 'bearer', c => {
      piece(c, 'M540 470 C580 440 610 420 640 404 L652 422 C620 444 590 466 560 492 Z', C.blue, 5);                                     // the far arm
      piece(c, torso, C.blue, 6);
      within(c, torso, () => dots(c, 470, 480, 600, 600, 30, 6));
      c.fillStyle = C.yellow; c.fillRect(452, 600, 140, 22); c.strokeStyle = C.edge; c.lineWidth = 4; c.strokeRect(452, 600, 140, 22);    // the sash
      cut(c, 'M470 640 L580 640', 3);
      piece(c, 'M548 486 C584 460 612 440 642 420 L654 436 C624 458 596 482 566 508 Z', C.blue, 5);                                     // the near arm
      piece(c, 'M640 410 C658 402 676 410 672 424 C668 434 652 436 644 428 Z', C.skin, 3);                                              // the hand
      piece(c, 'M520 432 C506 414 504 386 518 368 C534 350 566 354 576 374 C586 394 580 420 566 432 Z', C.skin, 5);                     // the head
      cut(c, 'M552 388 C560 386 568 388 572 392', 3); hole(c, 562, 398, 4); cut(c, 'M572 414 C566 418 560 418 556 416', 3);
      piece(c, 'M498 376 C516 330 562 322 592 348 C570 356 540 362 498 376 Z', C.ink, 4);                                               // the cap
      piece(c, 'M506 372 C496 380 490 396 494 410 C500 400 506 390 516 384 Z', C.ink, 3, false);                                        // the queue
      rivet(c, 500, 650);
    });
    // ---- a leg: hip pivot at (500, 80); a short trouser, a bound calf, a cloth shoe pointing right
    cell(ctx, 'leg', c => {
      const d = 'M462 60 C458 120 466 180 476 230 L470 300 L520 300 L524 230 C536 180 540 120 536 60 Z';
      piece(c, d, C.ink, 5);
      within(c, d, () => { for (let y = 236; y < 300; y += 14) cut(c, `M462 ${y} L540 ${y - 6}`, 3); cut(c, 'M498 90 C496 140 498 180 500 216', 3); });
      piece(c, 'M466 296 L528 296 C560 300 580 314 584 330 L462 330 C458 318 460 306 466 296 Z', C.deep, 4);
      rivet(c, 500, 80);
    });
    // ---- the palanquin (花轿): a red box under a sweeping roof, lattice windows, gold borders, tassels; its long poles
    cell(ctx, 'palanquin', c => {
      c.fillStyle = C.ink; c.fillRect(20, 548, 960, 18); cut(c, 'M30 557 L970 557', 3);
      for (const x of [20, 980]) { c.fillStyle = C.ink; c.beginPath(); c.arc(x, 557, 14, 0, 6.28); c.fill(); hole(c, x, 557, 6); }
      const box = 'M300 560 L300 330 L700 330 L700 560 Z';
      piece(c, box, C.red, 7);
      within(c, box, () => {
        c.strokeStyle = C.yellow; c.lineWidth = 16; c.strokeRect(318, 348, 364, 194);
        lattice(c, 360, 380, 640, 500, 34, 5);
        c.fillStyle = C.yellow; for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(340 + i * 80, 525, 10, 0, 6.28); c.fill(); }
        whorl(c, 500, 440, 34, 1.5, 1, 5);
      });
      const roof = 'M250 340 C330 300 420 240 500 222 C580 240 670 300 750 340 C770 344 784 330 790 312 C760 352 720 372 700 360 L300 360 C280 372 240 352 210 312 C216 330 230 344 250 340 Z';
      piece(c, roof, C.amber, 6);
      within(c, roof, () => { for (let i = -6; i <= 6; i++) cut(c, `M${500 + i * 38} 230 L${500 + i * 48} 356`, 4); });
      piece(c, 'M488 222 C486 190 492 166 500 150 C508 166 514 190 512 222 Z', C.yellow, 4);
      hole(c, 500, 190, 6);
      for (const x of [250, 750]) { c.strokeStyle = C.ink; c.lineWidth = 4; c.stroke(P(`M${x} 340 L${x} 420`)); piece(c, `M${x - 14} 420 L${x + 14} 420 L${x + 8} 480 L${x - 8} 480 Z`, C.red, 3); for (let k = 0; k < 4; k++) cut(c, `M${x - 6 + k * 4} 430 L${x - 6 + k * 4} 474`, 2); }
    });
    // ---- a flag bearer: upright, both hands on a tall pole (the banner is its own piece, pinned near the pole's top)
    cell(ctx, 'flagman', c => {
      c.fillStyle = C.ink; c.fillRect(612, 40, 14, 620); hole(c, 619, 50, 5);
      piece(c, torso, C.green, 6);
      within(c, torso, () => scales(c, 450, 470, 600, 600, 36, 4));
      c.fillStyle = C.red; c.fillRect(452, 600, 140, 22); c.strokeStyle = C.edge; c.lineWidth = 4; c.strokeRect(452, 600, 140, 22);
      cut(c, 'M470 640 L580 640', 3);
      piece(c, 'M540 480 C570 470 596 470 616 476 L616 498 C596 494 572 496 548 504 Z', C.green, 5);
      piece(c, 'M540 540 C570 534 596 534 616 540 L616 560 C596 556 572 558 548 566 Z', C.green, 5);
      piece(c, 'M520 440 C508 422 506 394 520 376 C536 358 566 362 576 382 C586 402 580 428 566 440 Z', C.skin, 5);
      cut(c, 'M552 398 C560 396 568 398 572 402', 3); hole(c, 562, 408, 4);
      piece(c, 'M494 384 C510 336 570 330 592 372 C560 364 530 368 494 384 Z', C.ink, 4);
      piece(c, 'M540 344 C560 300 600 268 640 260 C610 290 590 320 570 352 Z', C.amber, 3);
      rivet(c, 500, 650);
    });
    // ---- the banner: pinned at (60, 110); a long swallow-tailed pennant, red bordered in gold, a field of scales
    cell(ctx, 'banner', c => {
      const d = 'M60 100 C300 90 600 110 900 150 L760 260 L900 380 C600 340 300 330 60 330 Z';
      piece(c, d, C.red, 7);
      within(c, d, () => { c.strokeStyle = C.yellow; c.lineWidth = 22; c.stroke(P(d)); scales(c, 120, 150, 760, 320, 44, 4); });
      whorl(c, 220, 215, 46, 1.6, 1, 6);
      for (let i = 0; i < 6; i++) piece(c, `M${100 + i * 110} 334 L${112 + i * 110} 384 L${88 + i * 110} 384 Z`, C.yellow, 3, false);
      rivet(c, 60, 110);
    });
    // ---- a pagoda: five storeys, each under its sweeping eaves, the windows latticed; a spire
    cell(ctx, 'pagoda', c => {
      for (let k = 0; k < 5; k++) {
        const y = 960 - k * 165, w = 150 - k * 20, h = 110;
        const wall = `M${500 - w} ${y} L${500 - w} ${y - h} L${500 + w} ${y - h} L${500 + w} ${y} Z`;
        piece(c, wall, k % 2 ? C.amber : C.red, 6);
        within(c, wall, () => { lattice(c, 500 - w * 0.55, y - h + 18, 500 + w * 0.55, y - 18, 24, 4); });
        const ew = w + 80, top = y - h - 50;
        const eave = `M${500 - ew - 30} ${y - h + 4} C${500 - ew + 10} ${y - h + 4} ${500 - w * 0.6} ${top + 20} 500 ${top} C${500 + w * 0.6} ${top + 20} ${500 + ew - 10} ${y - h + 4} ${500 + ew + 30} ${y - h + 4} C${500 + ew + 40} ${y - h - 14} ${500 + ew + 44} ${y - h - 24} ${500 + ew + 36} ${y - h - 36} C${500 + ew + 30} ${y - h + 20} ${500 + w} ${y - h + 16} ${500} ${y - h + 18} C${500 - w} ${y - h + 16} ${500 - ew - 30} ${y - h + 20} ${500 - ew - 36} ${y - h - 36} C${500 - ew - 44} ${y - h - 24} ${500 - ew - 40} ${y - h - 14} ${500 - ew - 30} ${y - h + 4} Z`;
        piece(c, eave, C.ink, 4);
        within(c, eave, () => { for (let i = -5; i <= 5; i++) cut(c, `M${500 + i * ew / 6} ${top + 4 + Math.abs(i) * 7} L${500 + i * ew / 5.2} ${y - h + 14}`, 3); });
        hole(c, 500 - ew - 30, y - h - 30, 6); hole(c, 500 + ew + 30, y - h - 30, 6);                              // little bells
      }
      piece(c, 'M492 140 L508 140 L504 30 L496 30 Z', C.yellow, 4);
      for (let k = 0; k < 4; k++) { c.fillStyle = C.yellow; c.beginPath(); c.arc(500, 124 - k * 22, 13 - k * 2, 0, 6.28); c.fill(); c.strokeStyle = C.edge; c.lineWidth = 3; c.stroke(); }
    });
    // ---- a willow's trunk; and its crown, with long strands hanging from it (the crown is a piece of its own, so it can sway)
    const trunk = 'M470 990 C460 820 470 640 520 480 C540 420 560 380 600 340 L620 360 C590 400 570 460 560 520 C530 660 530 820 540 990 Z';
    cell(ctx, 'wtrunk', c => {
      piece(c, trunk, C.hide, 6);
      within(c, trunk, () => { for (let y = 420; y < 990; y += 40) cut(c, `M450 ${y} C490 ${y - 10} 530 ${y + 10} 600 ${y - 6}`, 3); });
      piece(c, 'M540 600 C580 560 620 540 660 536 L664 552 C628 560 596 580 560 616 Z', C.hide, 4);                // a bough
    });
    cell(ctx, 'willow', c => {
      // boughs arching out from the top of the trunk (600, 340) and drooping; the strands hang from all along them
      const boughs = [[600, 340, 300, 330, 250, 420], [600, 340, 420, 230, 330, 300], [600, 340, 640, 200, 760, 260], [600, 340, 800, 300, 860, 420], [600, 340, 520, 260, 450, 250]];
      for (const [x0, y0, cx, cy, x1, y1] of boughs) {
        const d = `M${x0} ${y0} Q${cx} ${cy} ${x1} ${y1}`;
        c.strokeStyle = C.edge; c.lineWidth = 15; c.stroke(P(d)); c.strokeStyle = C.hide; c.lineWidth = 9; c.stroke(P(d));
      }
      let k = 0;
      for (const [x0, y0, cx, cy, x1, y1] of boughs) for (let i = 1; i <= 6; i++, k++) {
        const u = 0.25 + 0.75 * i / 6, x = (1 - u) * (1 - u) * x0 + 2 * u * (1 - u) * cx + u * u * x1, y = (1 - u) * (1 - u) * y0 + 2 * u * (1 - u) * cy + u * u * y1;
        const len = 260 + 340 * ((k * 37) % 11) / 11, sw = 14 * Math.sin(k * 1.9);
        const d = `M${x} ${y} C${x + sw} ${y + len * 0.35} ${x - sw} ${y + len * 0.7} ${x + sw * 0.5} ${y + len}`;
        c.strokeStyle = C.edge; c.lineWidth = 8; c.stroke(P(d)); c.strokeStyle = C.green; c.lineWidth = 4; c.stroke(P(d));
        for (let j = 1; j < 11; j++) {
          const t = j / 11, yy = y + len * t, xx = x + sw * (3 * t * (1 - t) * (1 - t) - 3 * t * t * (1 - t) + 0.5 * t * t * t) + 0 ;
          c.fillStyle = C.green; c.beginPath(); c.ellipse(xx + (j % 2 ? 8 : -8), yy, 11, 4, j % 2 ? 0.7 : -0.7, 0, 6.28); c.fill(); c.strokeStyle = C.edge; c.lineWidth = 2.5; c.stroke();
        }
      }
    });
    // ---- a pine: a crooked trunk, flat clusters of needles carved as fans
    cell(ctx, 'pine', c => {
      const d = 'M480 990 C470 860 500 760 470 660 C450 600 470 520 520 470 L540 490 C500 540 492 600 510 660 C540 760 530 880 540 990 Z';
      piece(c, d, C.hide, 6);
      within(c, d, () => scales(c, 450, 500, 560, 990, 30, 3));
      for (const [x, y, s] of [[380, 580, 1.0], [640, 620, 1.1], [520, 450, 1.25], [400, 370, 0.9], [640, 340, 1.0], [520, 230, 0.8]]) {
        const fan = `M${x - 150 * s} ${y + 20} C${x - 110 * s} ${y - 80 * s} ${x + 110 * s} ${y - 80 * s} ${x + 150 * s} ${y + 20} C${x + 80 * s} ${y + 4} ${x - 80 * s} ${y + 4} ${x - 150 * s} ${y + 20} Z`;
        piece(c, fan, C.green, 5);
        within(c, fan, () => { for (let i = 0; i < 15; i++) { const a = Math.PI * (0.08 + 0.84 * i / 14); cut(c, `M${x} ${y + 14} L${x - Math.cos(a) * 160 * s} ${y + 14 - Math.sin(a) * 100 * s}`, 3); } });
      }
    });
    // ---- the city wall (two cells wide): crenellated, bricked; an arched gate under a gate tower of two roofs
    cell(ctx, 'wall', c => {
      let d = 'M0 990 L0 560 ';
      for (let x = 0; x < 2000; x += 80) d += `L${x} 520 L${x + 44} 520 L${x + 44} 560 L${x + 80} 560 `;
      d += 'L2000 560 L2000 990 Z';
      piece(c, d, C.hide, 7);
      within(c, d, () => { bricks(c, 0, 600, 2000, 990, 90, 42, 3); for (let x = 22; x < 2000; x += 80) hole(c, x, 538, 6); });
      const gate = 'M880 990 L880 760 C880 700 940 660 1000 660 C1060 660 1120 700 1120 760 L1120 990 Z';
      piece(c, gate, C.ink, 6);
      within(c, gate, () => { for (let x = 904; x < 1120; x += 36) cut(c, `M${x} 700 L${x} 990`, 3); dots(c, 900, 770, 1110, 990, 40, 6); });
      const tower = 'M800 520 L800 360 L1200 360 L1200 520 Z';
      piece(c, tower, C.red, 6);
      within(c, tower, () => { for (let i = 0; i < 6; i++) { const x = 828 + i * 62; c.strokeStyle = C.yellow; c.lineWidth = 6; c.strokeRect(x, 386, 46, 110); lattice(c, x + 4, 390, x + 42, 492, 16, 3); } });
      for (const [y, w] of [[360, 300], [250, 220]]) {
        const rf = `M${1000 - w - 50} ${y} C${1000 - w} ${y - 10} ${1000 - w * 0.4} ${y - 60} 1000 ${y - 80} C${1000 + w * 0.4} ${y - 60} ${1000 + w} ${y - 10} ${1000 + w + 50} ${y} C${1000 + w + 60} ${y - 20} ${1000 + w + 64} ${y - 30} ${1000 + w + 56} ${y - 42} C${1000 + w + 40} ${y + 20} ${1000 + w * 0.5} ${y + 12} 1000 ${y + 6} C${1000 - w * 0.5} ${y + 12} ${1000 - w - 40} ${y + 20} ${1000 - w - 56} ${y - 42} C${1000 - w - 64} ${y - 30} ${1000 - w - 60} ${y - 20} ${1000 - w - 50} ${y} Z`;
        piece(c, rf, C.ink, 5);
        within(c, rf, () => { for (let i = -6; i <= 6; i++) cut(c, `M${1000 + i * w / 7} ${y - 72 + Math.abs(i) * 9} L${1000 + i * w / 6} ${y + 4}`, 3); });
      }
      const loft = 'M880 250 L880 170 L1120 170 L1120 250 Z';
      piece(c, loft, C.red, 5);
      within(c, loft, () => lattice(c, 890, 180, 1110, 240, 22, 3));
      piece(c, 'M990 168 L1010 168 L1006 100 L994 100 Z', C.yellow, 3);
      // little flags along the battlements
      for (const x of [200, 520, 1480, 1800]) { c.fillStyle = C.ink; c.fillRect(x, 400, 8, 124); piece(c, `M${x + 8} 404 L${x + 90} 420 L${x + 70} 440 L${x + 90} 460 L${x + 8} 470 Z`, C.yellow, 3); }
    });
    // ---- an arched bridge (two cells wide): a stone hump with a railing of posts; the arch beneath it open
    cell(ctx, 'bridge', c => {
      const d = 'M80 780 C400 760 700 520 1000 500 C1300 520 1600 760 1920 780 L1920 830 L1500 830 C1400 700 1200 620 1000 620 C800 620 600 700 500 830 L80 830 Z';
      piece(c, d, C.hide, 7);
      within(c, d, () => bricks(c, 0, 520, 2000, 830, 70, 34, 3));
      c.strokeStyle = C.ink; c.lineWidth = 10; c.stroke(P('M120 740 C420 720 700 470 1000 450 C1300 470 1580 720 1880 740'));
      for (let i = 0; i <= 20; i++) { const u = i / 20, x = 120 + u * 1760, y = 740 - 290 * Math.sin(Math.PI * u) ** 1.4; c.fillStyle = C.ink; c.fillRect(x - 6, y, 12, 48); hole(c, x, y - 4, 7); }
    });
    // ---- mountains (two cells wide): a range of peaks, the ridges carved, the slopes stippled
    cell(ctx, 'mountains', c => {
      const pk = [[0, 560], [120, 520], [320, 300], [520, 480], [700, 220], [900, 420], [1080, 160], [1300, 380], [1480, 260], [1700, 460], [1880, 340], [2000, 560]];
      let d = 'M0 990 ';
      for (let k = 0; k < pk.length; k++) {
        const [x, y] = pk[k];
        if (!k) { d += `L${x} ${y} `; continue; }
        const [px, py] = pk[k - 1], mx = (px + x) / 2, my = Math.max(py, y) + 40;
        d += `Q${(px + mx) / 2} ${(py + my) / 2 - 20} ${mx} ${my} Q${(mx + x) / 2} ${(my + y) / 2 - 20} ${x} ${y} `;
      }
      d += 'L2000 990 Z';
      piece(c, d, '#4f8f8a', 7);
      within(c, d, () => {
        for (let k = 1; k < pk.length - 1; k++) { const [x, y] = pk[k]; for (let j = 1; j < 6; j++) { const sgn = j % 2 ? 1 : -1; cut(c, `M${x} ${y + j * 10} C${x + sgn * 30 * j} ${y + 60 * j} ${x + sgn * 20 * j} ${y + 110 * j} ${x + sgn * 46 * j} ${y + 190 * j}`, 3); } }
        dots(c, 0, 760, 2000, 990, 46, 5);
        for (let x = 40; x < 2000; x += 120) cut(c, `M${x} 990 C${x + 20} 900 ${x + 50} 860 ${x + 60} 820 C${x + 70} 860 ${x + 100} 900 ${x + 120} 990`, 3);
      });
    });
    // ---- auspicious clouds (two cells wide): a band of scrolling cloud-heads, each curl carved
    cell(ctx, 'clouds', c => {
      for (let k = 0; k < 7; k++) {
        const x = 140 + k * 270, y = 500 + 120 * Math.sin(k * 1.7), s = 0.8 + 0.3 * ((k * 3) % 4) / 3;
        const d = `M${x - 160 * s} ${y + 40 * s} C${x - 200 * s} ${y - 40 * s} ${x - 120 * s} ${y - 110 * s} ${x - 40 * s} ${y - 80 * s} C${x - 20 * s} ${y - 150 * s} ${x + 90 * s} ${y - 150 * s} ${x + 100 * s} ${y - 70 * s} C${x + 180 * s} ${y - 90 * s} ${x + 220 * s} ${y + 10 * s} ${x + 160 * s} ${y + 40 * s} C${x + 60 * s} ${y + 70 * s} ${x - 60 * s} ${y + 70 * s} ${x - 160 * s} ${y + 40 * s} Z`;
        piece(c, d, '#f6dc86', 6);
        whorl(c, x - 60 * s, y - 40 * s, 40 * s, 1.5, 1, 5); whorl(c, x + 70 * s, y - 50 * s, 34 * s, 1.5, -1, 5);
        cut(c, `M${x - 140 * s} ${y + 20 * s} C${x - 40 * s} ${y + 40 * s} ${x + 60 * s} ${y + 40 * s} ${x + 150 * s} ${y + 20 * s}`, 4);
      }
    });
    // ---- a crane in flight, facing right: white body, black neck and tail, red crown, legs trailing (the wings are pieces of their own)
    cell(ctx, 'crane', c => {
      const body = 'M300 520 C380 480 520 470 640 490 C700 500 740 520 760 540 C720 560 640 570 560 568 C460 566 360 560 300 540 Z';
      piece(c, body, '#f4efe2', 6);
      within(c, body, () => scales(c, 320, 490, 740, 566, 40, 3));
      piece(c, 'M740 520 C800 490 860 470 920 460 L926 476 C870 490 810 514 760 546 Z', C.ink, 4);
      piece(c, 'M912 454 C930 444 952 450 956 462 L990 470 L956 474 C948 486 924 486 914 474 Z', '#f4efe2', 4);
      hole(c, 930, 462, 5); piece(c, 'M916 452 C922 444 934 442 940 448 C934 452 926 454 916 452 Z', C.red, 2, false);
      piece(c, 'M300 530 C260 520 220 520 190 530 C220 540 260 548 300 548 Z', C.ink, 4);
      c.strokeStyle = C.ink; c.lineWidth = 6; c.stroke(P('M320 548 L120 590 M330 556 L130 604'));
      rivet(c, 540, 500);
    });
    // ---- a crane's wing: pinned at the shoulder (500, 500), spreading up and back; black primaries, feathers carved
    cell(ctx, 'cwing', c => {
      const d = 'M500 500 C470 400 420 300 330 200 C360 190 400 200 430 220 C420 180 430 150 450 130 C470 170 490 200 520 230 C530 190 550 160 580 150 C580 220 570 300 560 360 C590 330 620 320 650 320 C620 400 570 460 540 500 Z';
      piece(c, d, '#f4efe2', 6);
      within(c, d, () => { c.fillStyle = C.ink; c.fillRect(300, 100, 400, 110); for (let i = 0; i < 10; i++) cut(c, `M500 500 L${330 + i * 34} ${200 - Math.sin(i / 9 * Math.PI) * 60}`, 3); });
      rivet(c, 500, 500);
    });
    // ---- the dragon: the head (facing right, jaws open, horns, whiskers), body segments with scales and a spine, a fan of a tail
    cell(ctx, 'dhead', c => {
      const d = 'M200 520 C260 440 360 400 470 410 C560 380 640 400 700 440 L840 430 C820 470 780 480 740 482 L860 520 C820 540 760 540 700 530 C640 590 540 610 440 600 C340 600 250 580 200 560 Z';
      piece(c, d, C.green, 7);
      within(c, d, () => { scales(c, 210, 440, 520, 600, 36, 3); hole(c, 610, 452, 18); cut(c, 'M470 430 C520 470 560 520 560 580', 4); });
      c.fillStyle = C.ink; c.beginPath(); c.arc(613, 452, 8, 0, 6.28); c.fill();
      piece(c, 'M520 410 C500 330 520 260 570 220 C560 290 570 350 600 400 Z', C.amber, 4);
      piece(c, 'M440 410 C410 340 420 280 460 240 C460 300 470 350 490 404 Z', C.amber, 4);
      for (let i = 0; i < 6; i++) piece(c, `M${700 + i * 22} 530 L${711 + i * 22} 558 L${722 + i * 22} 530 Z`, '#fff8e8', 2, false);
      c.strokeStyle = C.amber; c.lineWidth = 6; c.stroke(P('M730 468 C800 400 880 420 960 360')); c.stroke(P('M720 506 C800 566 900 546 980 606'));
      piece(c, 'M200 520 C170 480 150 440 160 400 C190 440 220 470 260 480 Z', C.red, 4);
      piece(c, 'M330 600 C320 640 330 680 350 700 C360 670 370 640 380 604 Z', C.red, 4);
      rivet(c, 230, 530);
    });
    cell(ctx, 'dbody', c => {
      const d = 'M80 470 C300 420 700 420 920 470 L920 590 C700 640 300 640 80 590 Z';
      piece(c, d, C.green, 7);
      within(c, d, () => { scales(c, 80, 440, 920, 640, 40, 4); c.fillStyle = C.yellow; c.fillRect(80, 575, 840, 30); for (let x = 100; x < 920; x += 36) cut(c, `M${x} 577 L${x} 603`, 3); });
      for (let i = 0; i < 9; i++) piece(c, `M${120 + i * 90} 448 L${160 + i * 90} 380 L${190 + i * 90} 446 Z`, C.red, 3);
      piece(c, 'M380 596 L356 690 L330 700 L350 712 L420 700 L440 604 Z', C.green, 4); piece(c, 'M620 596 L596 690 L570 700 L590 712 L660 700 L680 604 Z', C.green, 4);
      rivet(c, 100, 530); rivet(c, 900, 530);
    });
    cell(ctx, 'dtail', c => {
      const d = 'M80 470 C300 440 500 470 620 500 C700 420 800 360 900 340 C860 420 840 500 860 540 C840 580 860 660 900 740 C800 720 700 660 620 580 C500 610 300 620 80 590 Z';
      piece(c, d, C.green, 7);
      within(c, d, () => { scales(c, 80, 450, 620, 610, 40, 4); for (let i = -4; i <= 4; i++) cut(c, `M640 540 L880 ${540 + i * 45}`, 3); });
      for (let i = 0; i < 5; i++) piece(c, `M${120 + i * 90} 458 L${160 + i * 90} 396 L${190 + i * 90} 456 Z`, C.red, 3);
      rivet(c, 100, 530);
    });
    // ---- reeds and a lotus, for the water's edge
    cell(ctx, 'reeds', c => {
      for (let k = 0; k < 9; k++) {
        const x = 260 + k * 60, h = 460 + 300 * ((k * 5) % 7) / 7, lean = 40 * Math.sin(k * 2.1);
        const stem = `M${x} 990 C${x} ${990 - h * 0.5} ${x + lean * 0.4} ${990 - h * 0.8} ${x + lean} ${990 - h}`;
        c.strokeStyle = C.edge; c.lineWidth = 11; c.stroke(P(stem)); c.strokeStyle = C.green; c.lineWidth = 6; c.stroke(P(stem));
        piece(c, `M${x + lean} ${990 - h} C${x + lean - 14} ${990 - h - 60} ${x + lean + 14} ${990 - h - 120} ${x + lean + 6} ${990 - h - 150} C${x + lean + 26} ${990 - h - 100} ${x + lean + 20} ${990 - h - 40} ${x + lean} ${990 - h} Z`, C.hide, 3);
        if (k % 2) piece(c, `M${x} ${990 - h * 0.4} C${x + 40} ${990 - h * 0.5} ${x + 90} ${990 - h * 0.45} ${x + 130} ${990 - h * 0.35} C${x + 90} ${990 - h * 0.4} ${x + 40} ${990 - h * 0.38} ${x} ${990 - h * 0.34} Z`, C.green, 3);
      }
    });
    cell(ctx, 'lotus', c => {
      const pad = 'M200 760 C260 700 420 680 500 700 C600 680 760 700 820 760 C700 800 320 800 200 760 Z';
      piece(c, pad, C.green, 6);
      within(c, pad, () => { for (let i = 0; i < 12; i++) cut(c, `M510 740 L${220 + i * 52} ${730 + 30 * Math.sin(i)}`, 3); });
      c.strokeStyle = C.edge; c.lineWidth = 12; c.stroke(P('M560 700 C560 620 570 520 560 440')); c.strokeStyle = C.green; c.lineWidth = 7; c.stroke(P('M560 700 C560 620 570 520 560 440'));
      for (let k = 0; k < 5; k++) { const a = -0.9 + k * 0.45; piece(c, `M560 440 C${560 + Math.sin(a) * 60 - 30} 370 ${560 + Math.sin(a) * 120} ${440 - 150 * Math.cos(a)} ${560 + Math.sin(a) * 130} ${440 - 170 * Math.cos(a)} C${560 + Math.sin(a) * 130 + 30} 340 ${560 + Math.sin(a) * 40 + 30} 400 560 440 Z`, '#f2a0a8', 4); }
    });
    // ---- the river bank the procession walks along (in the top of the waves' cell): a band of earth, tufts of grass along its edge
    cell(ctx, 'waves', c => {
      // (the band runs on into the next piece at both ends)
      let top = 'M-10 420 ';
      for (let x = -10; x < 1010; x += 40) { const h = 24 + 14 * Math.abs(Math.sin(x * 0.37)); top += `L${x + 8} 420 C${x + 12} ${420 - h * 0.5} ${x + 16} ${420 - h * 0.8} ${x + 22 + 6 * Math.sin(x)} ${420 - h} C${x + 22} ${420 - h * 0.6} ${x + 26} ${420 - h * 0.3} ${x + 30} 420 L${x + 40} 420 `; }
      const band = top + 'L1010 420 L1010 470 L-10 470 Z';
      piece(c, band, C.hide, 5);
      within(c, band, () => { for (let x = 10; x < 1000; x += 56) { c.save(); c.translate(x + 16 * Math.sin(x * 0.7), 446 + 6 * Math.sin(x * 1.3)); c.beginPath(); c.ellipse(0, 0, 12, 6, Math.sin(x), 0, 6.28); c.strokeStyle = '#fff'; c.lineWidth = 3; c.stroke(); c.restore(); } });
    });
  }
  return { draw, CELLS, PART };
})();
YL.PUPPETS = PUPPETS;                            // (for looking at the atlas on its own)

/* ---------------------------------------------------------------- the lantern, lit from inside */
const NP = 136;                                  // most pieces of hide in sight at once (in front, and on the far side)
const DR = 0.45, DH = 0.30;                      // the paper drum: its radius, half its height
const FS = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform vec3 uEye, uFwd, uRight, uUp; uniform vec2 uTan;
uniform float uTime, uExp, uFade, uDbg, uShim, uSink, uBare;
uniform vec4 uReach;         // as the candle catches: the point on the paper nearest the flame, how far round it the light has reached (m)
uniform vec3 uDot;           // the flame itself (一粒光): it stays when the paper goes dark
uniform sampler2D uAtlas;
uniform vec3 uF;             // the flame
uniform vec4 uFI;            // its colour × brightness, its radius
uniform vec4 uP0[${NP}];     // each piece: the angle of its plane round the drum, the plane's distance from the axis, its pivot on the plane (u, v; m)
uniform vec4 uP1[${NP}];     //             its turn, metres per atlas pixel (negative: turned over), its pivot in the atlas (px)
uniform vec4 uP2[${NP}];     //             the part of the atlas it is cut from (px)
uniform vec4 uP3[${NP}];     //             sway: how far (px), from where (px), over how long (px; negative: it stands up); how dense the hide
uniform int uN, uNB;         // pieces on the near side of the wheel; then those on the far side
out vec4 o;
const float R = ${DR}, H = ${DH};
const vec2 ATLAS = vec2(4096.0, 2048.0);
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
// the ray against the drum's side (x² + z² = r²): nearest entry, far exit
vec2 cyl(vec3 ro, vec3 rd, float r){
  float a = dot(rd.xz, rd.xz), b = dot(ro.xz, rd.xz), c = dot(ro.xz, ro.xz) - r * r, h = b * b - a * c;
  if (h < 0.0) return vec2(-1.0);
  h = sqrt(h); return vec2((-b - h) / a, (-b + h) / a);
}
// what reaches the paper at S from the flame: through every piece of hide in the way, and past the bamboo ribs
vec3 through(vec3 S, float blur, int i0, int i1){
  vec3 F = uF, D = S - F;
  // above the flame the hot air shimmers, and bends the light a little on its way up
  float up = smoothstep(0.0, 0.25, D.y);
  D.xz += uShim * up * 0.0035 * (vec2(vnoise(vec2(S.y * 40.0 - uTime * 3.1, atan(S.z, S.x) * 9.0)), vnoise(vec2(S.y * 33.0 - uTime * 2.6, atan(S.z, S.x) * 7.0 + 5.0))) - 0.5);
  vec3 T = vec3(1.0);
  for (int i = i0; i < i1; i++){
    vec4 a = uP0[i], b = uP1[i];
    vec3 n = vec3(cos(a.x), 0.0, sin(a.x)), t = vec3(sin(a.x), 0.0, -cos(a.x));
    float dn = dot(n, D); if (dn <= 1e-4) continue;
    float s = (a.y - dot(n, F)) / dn;
    if (s <= 0.0 || s >= 1.0) continue;
    vec3 X = F + D * s;
    vec2 q = vec2(dot(X, t), X.y) - a.zw;
    float c = cos(b.x), sn = sin(b.x), k = abs(b.y);
    q = vec2(c * q.x + sn * q.y, -sn * q.x + c * q.y) / k;              // into the piece's own pixels
    q.x *= sign(b.y);
    vec2 px = b.zw + vec2(q.x, -q.y);
    vec4 w = uP3[i];
    if (w.x != 0.0){
      // willow strands and reeds: they move in the hot air, more the further from where they hang (or stand)
      float h = clamp((px.y - w.y) / w.z, 0.0, 1.0);
      px.x += w.x * h * h * sin(uTime * 1.6 + px.x * 0.035 + float(i) * 1.7) + w.x * 0.4 * h * sin(uTime * 2.9 + px.x * 0.08);
    }
    vec4 r = uP2[i];
    if (px.x < r.x + 1.0 || px.y < r.y + 1.0 || px.x > r.z - 1.0 || px.y > r.w - 1.0) continue;
    // the flame has a size: the further the hide is from the paper, the softer its shadow
    float pen = (uFI.w * (1.0 - s) + blur) / k;                             // the penumbra, on the hide, in atlas pixels
    float lod = log2(max(pen, 1.0));
    vec3 tr;
    if (lod > 2.0){
      // a wide penumbra: four taps a level finer, spread across it (one coarse level alone turns blocky)
      float e = pen * 0.32;
      tr = 0.25 * (textureLod(uAtlas, (px + vec2(e, 0.4 * e)) / ATLAS, lod - 1.2).rgb + textureLod(uAtlas, (px + vec2(-0.4 * e, e)) / ATLAS, lod - 1.2).rgb
                 + textureLod(uAtlas, (px + vec2(-e, -0.4 * e)) / ATLAS, lod - 1.2).rgb + textureLod(uAtlas, (px + vec2(0.4 * e, -e)) / ATLAS, lod - 1.2).rgb);
    } else tr = textureLod(uAtlas, px / ATLAS, lod).rgb;
    tr = pow(tr, vec3(2.2));
    // dyed hide is not even: it is thicker here, thinner there
    float hide = 1.0 - step(0.9, min(tr.r, min(tr.g, tr.b)));
    tr *= 1.0 - hide * 0.32 * vnoise(px * 0.07);
    T *= mix(vec3(1.0), tr, w.w);
  }
  // the bamboo ribs, just inside the paper: eight upright, and a hoop near the top and the bottom
  float rr0 = R - 0.010;
  vec2 rr = cyl(F, normalize(D), rr0);
  vec3 Xr = F + normalize(D) * rr.y;
  float ang = atan(Xr.z, Xr.x), cell = 6.28318 / 8.0;
  float da = abs(fract(ang / cell + 0.5 + 0.0625) - 0.5) * cell * rr0;
  float pw = uFI.w * 0.010 / rr0;
  T *= 1.0 - 0.45 * smoothstep(0.0014 + pw, 0.0014 - pw * 0.5, da);
  T *= 1.0 - 0.80 * smoothstep(0.0025 + pw, 0.0025 - pw * 0.5, abs(abs(Xr.y) - (H - 0.018)));
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
    vec3 thr = through(S, 0.0, 0, uN);
    // as the candle catches, its light reaches out across the paper from the nearest point
    vec3 rq = S - uReach.xyz;
    float wob = 0.035 * (vnoise(vec2(atan(rq.y, length(rq.xz) * sign(dot(rq, vec3(-N.z, 0.0, N.x)))) * 3.0, uTime * 2.5)) - 0.5);
    float reach = 1.0 - smoothstep(uReach.w - 0.12, uReach.w + 0.02, length(rq) + wob * smoothstep(0.0, 0.1, uReach.w));
    col = E * thr * tau * paper * 0.072 * reach;
    // through this paper, faintly, the far side of the drum: its own shadows, running the other way
    vec3 S2 = ro + rd * hc.y;
    vec3 L2 = uF - S2;
    if (abs(S2.y) < H) col += flameC / dot(L2, L2) * through(S2, 0.004, uN, uN + uNB) * paper * 0.072 * 0.20 * fib * mix(vec3(1.0), thr, 0.5) * smoothstep(0.3, 0.6, uReach.w);
    // the flame seen straight through the paper: a soft hot glow where it sits
    vec3 toF = normalize(uF - ro);
    float g = max(dot(rd, toF), 0.0);
    col += flameC * thr * (0.10 * exp(-(1.0 - g) * 5000.0) + 0.020 * exp(-(1.0 - g) * 350.0)) * tau * reach;
    // and the flame as a point behind the paper: the shadows cover it while the show goes on; as the candle gutters and
    // everything else goes dark, it is what is left
    float bare = max(uSink, uBare);                                       // (before the light has spread, and as it dies: nothing in its way)
    col += uDot * mix(thr, vec3(1.0), bare) * (0.6 * exp(-(1.0 - g) * 60000.0) + 0.06 * exp(-(1.0 - g) * 6000.0) + bare * (0.10 * exp(-(1.0 - g) * 1500.0) + 0.03 * exp(-(1.0 - g) * 200.0))) * mix(tau, 1.0, bare);
    // the paper's edge darkens where it turns away (the light inside comes through it slantwise, through more paper)
    col *= 0.55 + 0.45 * pow(max(dot(N, -rd), 0.0), 0.6);
  } else {
    // the red lacquered frame above and below the paper, and beyond it the night
    vec2 hf = cyl(ro, rd, R + 0.012);
    vec3 P = ro + rd * hf.x;
    if (hf.x > 0.0 && abs(P.y) < H + 0.040 && abs(P.y) > H - 0.004){
      vec3 N = vec3(P.x, 0.0, P.z) / (R + 0.012);
      float lit = exp(-(abs(P.y) - H) / 0.012);
      float band = smoothstep(0.003, 0.0, abs(abs(P.y) - H - 0.020)) * 0.5;
      vec3 lac = vec3(0.30, 0.035, 0.02) * (0.6 + 0.4 * vnoise(vec2(atan(P.z, P.x) * 40.0, P.y * 200.0)));
      col = flameC * (lac * (0.004 + 0.03 * lit) + vec3(0.9, 0.6, 0.2) * band * 0.012) * pow(max(dot(N, -rd), 0.0), 0.7);
    } else {
      vec3 c0 = vec3(0.0, uF.y, 0.0) - ro; float tc = max(dot(c0, rd), 0.0);
      float dd = length(ro + rd * tc - vec3(0.0, clamp((ro + rd * tc).y, -H, H), 0.0)) - R;
      col = flameC * (0.012 * exp(-max(dd, 0.0) / 0.05) + 0.006 * exp(-max(dd, 0.0) / 0.25)) + vec3(0.0015, 0.0012, 0.0011);
    }
  }
  if (uDbg > 0.0 && tF > 0.0 && abs(S.y) < H) col = through(S, 0.0, 0, uN) * 0.6;
  vec3 c = aces(col * uExp);
  c = pow(c, vec3(1.0 / 2.2));
  vec2 uv = gl_FragCoord.xy / uRes - 0.5;
  c *= 1.0 - 0.35 * dot(uv, uv) * 1.6;
  c += (hash12(gl_FragCoord.xy + fract(uTime * 7.13) * 917.0) - 0.5) * 0.02;
  o = vec4(max(c, 0.0) * uFade, 1.0);
}`;
const VS_FULL = `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

/* ---------------------------------------------------------------- the world on the wheels
   Everything is laid out where its shadow should fall: s along the paper (m, to the right as you look at it), Y up
   the paper (m). Each piece hangs on a ring nearer the flame or nearer the paper. Near the paper a shadow is the size of
   its piece and sharp; near the flame it is cast large and soft. The rings turn at different speeds, so as the eye
   travels round the lantern with the procession, the city slides past behind it, and the mountains behind that hardly
   move at all. */
const S_PX = 3.3e-4;                             // metres of shadow per atlas pixel, at k = 1
const C_ARC = 2 * Math.PI * DR;                  // once round the paper
const YF = -0.050;                               // the flame's height, as the figures were laid out for it
const RF = 0.15, RC = 0.33, RM = 0.28, RS = 0.36, RN = 0.41;   // the rings: mountains, clouds, the city, the sky, the near one
const VC = 0.060, VW = 0.042, VH = 0.140;        // how fast the eye, the procession and the horsemen travel (m of paper per s)
const YG = -0.072, YM = -0.064;                  // where the procession walks; where the city stands
const REF = (() => {
  const o = {};
  for (const [n, [cx, cy, wd = 1]] of Object.entries(PUPPETS.CELLS)) o[n] = { ox: cx * 512, oy: cy * 512, rect: [cx * 512, cy * 512, (cx + wd) * 512, (cy + 1) * 512] };
  for (const [n, [x0, y0, x1, y1, base]] of Object.entries(PUPPETS.PART)) { const b = o[base || n]; o[n] = { ox: b.ox, oy: b.oy, rect: [b.ox + x0 * 0.512, b.oy + y0 * 0.512, b.ox + x1 * 0.512, b.oy + y1 * 0.512] }; }
  return o;
})();
const wrap = (x) => x - C_ARC * Math.round(x / C_ARC);
const smooth = (a, b, x) => { const u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
function rot(p, a) { const c = Math.cos(a), s = Math.sin(a); return [c * p[0] - s * p[1], s * p[0] + c * p[1]]; }
// a jointed figure: its root pivot (ox, oy, in its own cell's units) at (s, Y) on the paper; size k; facing right
// (dir 1) or left (-1); leaning by rock. part() pins a piece: the piece's own pivot (px, py) goes where (x, y) is in the
// root cell's units, turned by turn
function figure(out, r, s, Y, k, dir, rock, ox, oy, dens = 1) {
  const sg = 0.512 * S_PX * k;
  return (name, x, y, px, py, turn = 0, o = {}) => {
    const d = rot([(x - ox) * sg, -(y - oy) * sg], rock);
    out.push({ r: o.r ?? r, s: s + dir * d[0], Y: Y + d[1], name, px, py, k: k * (o.k ?? 1), dir: dir * (o.flip ? -1 : 1), turn: dir * (turn + rock), sway: o.sway, dens: o.dens ?? dens });
  };
}

W.shadow = {
  ready: false, t: 0, fade: 1, vol: 1, light: 1, slow: 0,
  init() {
    if (this.ready) return;
    const gl = YL.gl;
    this.p = YL.makeProgram('shadow', VS_FULL, FS); YL.checkProgram(this.p);
    // the hide, cut and dyed
    const cv = document.createElement('canvas'); cv.width = 4096; cv.height = 2048;
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
    if (!this.inited && YL.QS.has('wt')) this.t = +YL.QS.get('wt');
    this.inited = true;
    this.ready = true;
  },
  hero: { on: false, sway: [0, 0], v: [0, 0], aim: null },
  // the wheels stand still until the flame has caught; its heat sets them turning (and as it dies they slow)
  wheelT(t) {
    let w;
    if (t <= 2.4) w = 0; else if (t >= 4.4) w = t - 3.4; else { const x = (t - 2.4) / 2; w = 2 * (x * x * x - x * x * x * x / 2); }
    return Math.max(0, w - this.slow);
  },
  // where the eye is, along the paper: it travels with the procession, a little faster, so the procession slips back
  camS(w) { const e = w <= 13 ? w : 13 + 6 * (1 - Math.exp(-(w - 13) / 6)); return VW * w + (VC - VW) * e; },
  // ---- every piece of hide this frame, as {r, s, Y, name, px, py, k, dir, turn, sway, dens}, grouped by what they belong to
  actors(t) {
    const w = this.wheelT(t), A = [];
    const add = (s, ext, fn) => A.push({ s, ext, fn });
    // ---- far: a range of mountains right round, cast big and soft from close by the flame; then a band of clouds
    for (let i = 0; i < 6; i++) {
      const s = (i + 0.5) * C_ARC / 6 + 0.75 * VC * w, half = RF * Math.tan(Math.PI / 6), k = 2 * half / (1024 * S_PX) * DR / RF;
      add(s, 0.25, out => out.push({ r: RF, s, Y: -0.035 + 0.010 * (i % 3), name: 'mountains', px: 1000, py: 575, k, dir: i % 2 ? -1 : 1, turn: 0, dens: 0.62 }));
    }
    for (let i = 0; i < 5; i++) {
      const s = (i + 0.2) * C_ARC / 5 + 0.82 * VC * w + 0.004 * t;
      add(s, 0.25, out => out.push({ r: RC, s, Y: 0.090 + 0.010 * Math.sin(i * 2.3), name: 'clouds', px: 1000, py: 500, k: 0.72 + 0.10 * Math.sin(i * 1.7), dir: i % 2 ? -1 : 1, turn: 0, dens: 0.75 }));
    }
    // ---- the city, behind the procession: a wall with its gate, a pagoda, willows, pines, a hump bridge (and round again)
    const cityV = 0.4 * VC * w;
    const city = [['wall', -0.04, 0], ['pine', 0.150, 1], ['willow', 0.210, 0], ['willow', 0.300, 1], ['pagoda', 0.350, 0], ['pine', 0.430, 0], ['bridge', 0.540, 0],
      ['willow', 0.690, 1], ['pine', 0.760, 1], ['wall', 1.000, 1], ['pagoda', 1.240, 0], ['willow', 1.330, 0], ['bridge', 1.560, 1], ['pine', 1.700, 0], ['willow', 1.800, 1], ['pine', 2.000, 0]];
    for (const [kind, s0, flip] of city) {
      const s = s0 + cityV, dir = flip ? -1 : 1;
      if (kind === 'wall') add(s, 0.16, out => out.push({ r: RM, s, Y: YM, name: 'wall', px: 1000, py: 990, k: 0.88, dir, turn: 0, dens: 0.48 }));
      if (kind === 'bridge') add(s, 0.16, out => out.push({ r: RM, s, Y: YM - 0.004, name: 'bridge', px: 1000, py: 830, k: 0.95, dir, turn: 0, dens: 0.62 }));
      if (kind === 'pagoda') add(s, 0.06, out => out.push({ r: RM, s, Y: YM, name: 'pagoda', px: 500, py: 960, k: 0.95, dir, turn: 0, dens: 0.66 }));
      if (kind === 'pine') add(s, 0.06, out => out.push({ r: RM, s, Y: YM, name: 'pine', px: 505, py: 990, k: 0.78, dir, turn: 0.012 * Math.sin(t * 0.9 + s0 * 7), dens: 0.66 }));
      if (kind === 'willow') add(s, 0.07, out => {
        out.push({ r: RM, s, Y: YM, name: 'wtrunk', px: 505, py: 990, k: 0.86, dir, turn: 0, dens: 0.66 });
        out.push({ r: RM, s, Y: YM, name: 'willow', px: 505, py: 990, k: 0.86, dir, turn: 0.01 * Math.sin(t * 0.7 + s0 * 5), sway: [5, 250, 600], dens: 0.66 });
      });
    }
    // ---- near: the river bank the procession walks along, and the river below it, flowing slowly the other way
    // (each band is a ring of flat pieces, so each must reach the tangent's length, not the arc's, to meet the next)
    const band = (n) => 2 * RN * Math.tan(Math.PI / n) / (512 * S_PX) * DR / RN * 1.004;
    for (let i = 0, kb = band(14); i < 14; i++) { const s = (i + 0.5) * C_ARC / 14; add(s, 0.10, out => out.push({ r: RN, s, Y: YG - 0.0030, name: 'road', px: 500, py: 420, k: kb, dir: 1, turn: 0, dens: 1 })); }
    for (let i = 0, kw = band(19); i < 19; i++) {
      const s = (i + 0.5) * C_ARC / 19 - 0.008 * w;
      add(s, 0.10, out => out.push({ r: RN, s: s + 0.002 * Math.sin(t * 0.8 + i), Y: -0.089 + 0.0018 * Math.sin(t * 1.3 + i * 2), name: 'waves', px: 500, py: 600, k: kw, dir: 1, turn: 0, dens: 0.72 }));
    }
    for (const [s0, kind] of [[0.10, 'reeds'], [0.30, 'lotus'], [0.47, 'reeds'], [0.86, 'lotus'], [0.98, 'reeds'], [1.4, 'reeds'], [1.62, 'lotus'], [1.9, 'reeds']]) {
      const s = s0;
      add(s, 0.06, out => out.push(kind === 'reeds'
        ? { r: RN, s, Y: -0.104, name: 'reeds', px: 500, py: 990, k: 0.28, dir: 1, turn: 0, sway: [6, 990, -700], dens: 1 }
        : { r: RN, s: s + 0.002 * Math.sin(t * 0.6), Y: -0.096 + 0.0015 * Math.sin(t * 1.1 + s0), name: 'lotus', px: 510, py: 760, k: 0.45, dir: 1, turn: 0.03 * Math.sin(t * 0.9 + s0 * 3), dens: 1 }));
    }
    // a fishing boat drifting down the river, rocking; and carp leaping out of it
    for (const s0 of [0.66, 0.66 + C_ARC / 2]) {
      const s = s0 - 0.004 * w, bt = t * 1.25 + s0;
      add(s, 0.07, out => out.push({ r: RN, s, Y: -0.100 + 0.0015 * Math.sin(bt), name: 'boat', px: 545, py: 560, k: 0.62, dir: 1, turn: 0.045 * Math.sin(bt + 0.7), dens: 1 }));
    }
    for (const [s0, ph] of [[0.52, 0.0], [0.77, 2.6], [1.25, 1.2], [1.95, 3.9]]) {
      const s = s0 - 0.008 * w;
      add(s, 0.06, out => {
        // one leap every 5 s of the wheel: out of the water, an arc, a flick of the tail, back in
        const L = ((w + ph) % 5.0) / 1.4;
        if (L > 1) return;
        const arc = Math.sin(Math.PI * L), tilt = 0.75 * Math.cos(Math.PI * L), k = 0.48;
        const f = figure(out, RN, s + 0.03 * (L - 0.5), -0.118 + 0.058 * arc, k, 1, tilt, 500, 500);
        f('tail', 168, 503, 560, 500, 0.4 * Math.sin(t * 9 + ph));
        f('carp', 500, 500, 500, 500);
      });
    }
    // ---- the procession, coming out of the city gate: flag bearers ahead, the bridal palanquin on four bearers, a flag behind
    const walk = (out, s, k, ph, body, extra) => {
      const g = 2 * Math.PI * 1.17 * w + ph, bob = 8 * Math.cos(2 * g), lean = 0.03 + 0.02 * Math.sin(2 * g);
      const f = figure(out, RN, s, YG + 0.512 * S_PX * k * (250 + bob), k, 1, -lean * 0.3, 500, 650);
      f('leg', 500, 650, 500, 80, 0.36 * Math.sin(g + Math.PI));
      f(body, 500, 650, 500, 650);
      f('leg', 500, 650, 500, 80, 0.36 * Math.sin(g));
      if (extra) extra(f, g);
    };
    const flagman = (s, ph) => add(s, 0.07, out => walk(out, s, 0.64, ph, 'flagman', (f, g) => {
      // the banner streams back from the top of the pole, rippling
      const fl = -0.10 - 0.07 * Math.sin(t * 2.3 + ph) - 0.04 * Math.sin(t * 5.7 + ph * 2) + 0.03 * Math.sin(g);
      f('banner', 619, 62, 60, 110, -fl, { flip: true, k: 0.62 });
    }));
    for (const base of [0, C_ARC / 2]) {
      const sp = base - 0.03 + VW * w;
      flagman(sp + 0.13, 0.0); flagman(sp + 0.20, 2.1); flagman(sp - 0.17, 4.0);
      add(sp, 0.10, out => {
        const k = 0.64, g = 2 * Math.PI * 1.17 * w, sg = 0.512 * S_PX * k, kp = 0.76, sgp = 0.512 * S_PX * kp;
        // the bearers, two at each end (the far one a step behind), the poles on their hands at head height
        const poleY = YG + sg * (250 + 232), bob = 0.0012 * Math.cos(2 * g), rock = 0.02 * Math.sin(g);
        for (const [px, ph] of [[100, 0.0], [140, Math.PI * 0.5], [860, Math.PI], [900, Math.PI * 1.5]]) walk(out, sp + (px - 500) * sgp - 160 * sg, k, ph, 'bearer');
        out.push({ r: RN, s: sp, Y: poleY + bob, name: 'palanquin', px: 500, py: 557, k: kp, dir: 1, turn: rock, dens: 1 });
      });
    }
    // ---- horsemen at the gallop, overtaking the procession: legs swinging on their rivets, the body rocking, the rider rising and falling
    for (const [s0, ph] of [[-0.36, 0], [-0.78, 2.1], [-0.40 + C_ARC / 2, 1.0]]) {
      const s = s0 + VH * w;
      add(s, 0.10, out => {
        const k = 0.66, g = (t < 1 ? 0 : 9.0 * w) + ph, rock = 0.05 * Math.sin(g) * smooth(0, 0.5, w), bob = 10 * Math.sin(2 * g + 0.5);
        const f = figure(out, RN, s, YG + 0.512 * S_PX * k * (316 + bob), k, 1, rock, 500, 300);
        f('hleg', 330, 380, 500, 100, 0.45 * Math.sin(g + 2.4)); f('fleg', 700, 390, 500, 120, 0.55 * Math.sin(g - 0.6));
        f('horse', 500, 300, 500, 300);
        f('hleg', 334, 380, 500, 100, 0.45 * Math.sin(g + 1.6)); f('fleg', 696, 390, 500, 120, 0.55 * Math.sin(g + 0.4));
        f('rider', 520, 282 - 4 * Math.sin(2 * g + 1.5), 500, 620, -0.5 * rock - 0.04 * Math.sin(g), { k: 1.45 });
      });
    }
    // ---- cranes crossing the sky the other way, wings beating
    for (const [s0, Y0, ph] of [[0.40, 0.080, 0], [0.47, 0.096, 1.9], [0.55, 0.072, 3.7], [0.40 + C_ARC / 2, 0.088, 0.8]]) {
      const s = s0 + (VC - 0.10) * w;
      add(s, 0.06, out => {
        const g = 2 * Math.PI * 1.5 * w + ph, k = 0.50;
        const f = figure(out, RS, s, Y0 + 0.003 * Math.sin(g - 0.6), k, -1, 0.04 * Math.sin(g - 1.0), 540, 500);
        f('cwing', 548, 500, 500, 500, -0.9 + 0.7 * Math.sin(g - 0.5), { dens: 0.8 });
        f('crane', 540, 500, 540, 500);
        f('cwing', 540, 500, 500, 500, -0.9 + 0.7 * Math.sin(g));
      });
    }
    // ---- a dragon swimming through the clouds, against the procession: it follows its own wake, so the body ripples through
    {
      const k = 0.44, sg = 0.512 * S_PX * k, segL = 800 * sg, headL = 640 * sg, lam = 0.24, amp = 0.020;
      const xh = 0.62 + (VC - 0.11) * w;                                       // where its head is, along the paper
      const path = (x) => [x, 0.060 + amp * Math.sin(2 * Math.PI * x / lam + 0.8) + 0.006 * Math.sin(t * 0.7)];
      for (const base of [0, C_ARC / 2]) add(xh + base + 0.18, 0.26, out => {
        const joints = [];
        for (let i = 0; i <= 6; i++) joints.push(path(xh + base + i * segL));      // the neck, then each joint back along the body
        const ang = (a, b) => Math.atan2(a[1] - b[1], a[0] - b[0]);
        const put = (name, p, q, px, py) => out.push({ r: RS + 0.01, s: p[0], Y: p[1], name, px, py, k, dir: -1, turn: ang(p, q) - Math.PI, dens: 1 });
        const hp = path(xh + base - headL * 0.6);
        out.push({ r: RS + 0.01, s: joints[0][0], Y: joints[0][1], name: 'dhead', px: 230, py: 530, k, dir: -1, turn: ang(hp, joints[0]) - Math.PI, dens: 1 });
        for (let i = 0; i < 5; i++) put('dbody', joints[i], joints[i + 1], 900, 530);
        put('dtail', joints[5], joints[6], 100, 530);
      });
    }
    return { w, A };
  },
  // pack the pieces for the shader: those in front of the eye, then those across the drum behind
  pieces(t) {
    const { w, A } = this.actors(t), sc = this.camS(w), front = [], back = [];
    for (const a of A) {
      const x = wrap(a.s - sc);
      if (Math.abs(x) < 0.40 + a.ext) a.fn(front);
      else if (Math.abs(wrap(x - C_ARC / 2)) < 0.22 + a.ext) a.fn(back);
    }
    // (the far side is only seen faintly through the paper: its far and middle layers are enough)
    { const keep = back.filter(q => q.r <= RM + 1e-6); back.length = 0; back.push(...keep); }
    const only = YL.QS.get('sonly');                                            // (debug: just the pieces of one name)
    if (only) { for (const L of [front, back]) { const keep = L.filter(q => q.name === only); L.length = 0; L.push(...keep); } }
    const nf = Math.min(front.length, NP - 16), nb = Math.min(back.length, NP - nf);
    if (front.length > nf && !this.warned) { this.warned = true; console.warn('shadow: too many pieces in sight', front.length); }
    const all = front.slice(0, nf).concat(back.slice(0, nb));
    const a0 = new Float32Array(NP * 4), a1 = new Float32Array(NP * 4), a2 = new Float32Array(NP * 4), a3 = new Float32Array(NP * 4);
    all.forEach((q, i) => {
      const R = REF[q.name], th = Math.PI / 2 - q.s / DR, m = S_PX * q.k * q.r / DR;
      a0.set([th, q.r, 0, YF + (q.Y - YF) * q.r / DR], i * 4);
      a1.set([q.turn, m * q.dir, R.ox + q.px * 0.512, R.oy + q.py * 0.512], i * 4);
      a2.set(R.rect, i * 4);
      a3.set(q.sway ? [q.sway[0], R.oy + q.sway[1] * 0.512, q.sway[2] * 0.512, q.dens] : [0, 0, 1, q.dens], i * 4);
    });
    return { a0, a1, a2, a3, nf, nb, sc };
  },
  camera(aspect, t, still, sc) {
    const V = YL.V;
    // (pull: 0 = right up against the paper by the flame; 1 = back far enough that the paper fills the picture)
    const u = this.pull ?? 1, e = u * u * (3 - 2 * u), f = this.flame(t).p;
    const th = Math.PI / 2 - sc / DR, dir = [Math.cos(th), 0, Math.sin(th)];
    const dist = 0.075 + 0.305 * e, y = (f[1] + 0.012) * (1 - e) + (0.0 + (still ? 0 : 0.004 * Math.sin(t * 0.23))) * e;
    const eye = [dir[0] * (DR + dist), y, dir[2] * (DR + dist)];
    // (as the candle gutters the eye tips down after it, so the last of the light stays in the picture)
    const sk = this.sink || 0, at = [f[0] * (1 - e), f[1] * (1 - e) + (y - 0.004 + 0.55 * sk * (f[1] - y)) * e, f[2] * (1 - e)];
    const fwd = V.norm(V.sub(at, eye)), right = V.norm(V.cross(fwd, [0, 1, 0])), up = V.cross(right, fwd);
    const vfov = (aspect < 0.9 ? 52 : 36) * (this.zoom ?? 1), ty = Math.tan(vfov * Math.PI / 360);
    return { eye, fwd, right, up, tan: [ty * aspect, ty] };
  },
  // the flame: it catches (and flares) as the light arrives, leans with the draught, flickers, answers your hand; a gust
  // now and then bends it right over and every shadow swings
  flame(t) {
    const H = this.hero;
    const tg = ((t - 9.4) % 22 + 22) % 22, gust = smooth(-0.5, 0.0, tg - 0.0) * (1 - smooth(0.5, 1.9, tg));
    const sx = 0.004 * Math.sin(t * 1.7) + 0.002 * Math.sin(t * 4.3 + 1) + H.sway[0] + gust * (0.010 + 0.003 * Math.sin(t * 11)), sy = 0.002 * Math.sin(t * 2.3) - 0.004 * gust;
    let br = 1 + 0.07 * Math.sin(t * 2.1) + 0.03 * Math.sin(t * 5.3) + 0.05 * Math.sin(t * 13.0) * Math.sin(t * 3.1);   // the breathing every world shares, and a candle's flicker
    const catchUp = smooth(0.9, 2.1, t) + 0.45 * Math.exp(-Math.pow((t - 1.1) / 0.22, 2));
    const dotK = 0.7 + 0.3 * smooth(0.6, 1.0, t) + 1.2 * Math.exp(-Math.pow((t - 1.05) / 0.12, 2));      // the point flickers, flares
    br *= catchUp * (1 - 0.18 * gust + 0.08 * gust * Math.sin(t * 17));
    const sink = this.sink || 0;
    return { p: [sx * (1 - sink), YF + sy + H.sway[1] - 0.15 * sink, 0.004 * Math.sin(t * 1.1)], k: br * this.light, br: dotK * (1 + 0.07 * Math.sin(t * 2.1) + 0.04 * Math.sin(t * 13.0) * Math.sin(t * 3.1)), r: 0.0042 * (1 - 0.7 * sink), gust };
  },
  pointer(nx, ny, speed) {
    this.hero.aim = [Math.max(-1, Math.min(1, nx)), Math.max(-1, Math.min(1, ny))];
    if (speed > 1.5) this.gust = Math.min(1, (this.gust || 0) + 0.3);
  },
  update(dt) {
    this.t += dt;
    this.slow = this.sink ? this.slow + dt * this.sink * 0.85 : 0;
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
    const f = this.flame(this.t), P = this.pieces(this.t);
    const cam = this.cam = this.camera(aspect, this.t, YL.DBG.still, P.sc);
    U(p, 'uRes', [w, h]); U(p, 'uEye', cam.eye); U(p, 'uFwd', cam.fwd); U(p, 'uRight', cam.right); U(p, 'uUp', cam.up); U(p, 'uTan', cam.tan);
    U(p, 'uTime', this.t); U(p, 'uDbg', YL.QS.has('sdbg') ? 1 : 0); U(p, 'uExp', 1.0); U(p, 'uFade', this.fade); U(p, 'uShim', 1 + 1.5 * f.gust); U(p, 'uSink', Math.min(1, (this.sink || 0) * 2.5)); const rr = smooth(1.0, 3.2, this.t), ce = YL.V.norm([cam.eye[0], 0, cam.eye[2]]);
    U(p, 'uReach', [ce[0] * DR, f.p[1], ce[2] * DR, 0.65 * rr * rr]); U(p, 'uBare', 1 - smooth(1.4, 2.4, this.t));
    U(p, 'uDot', YL.mulc(YL.bb(1900), 0.55 * f.br * (1 - 0.35 * (this.sink || 0))));
    U(p, 'uF', f.p); U(p, 'uFI', [...YL.mulc(YL.bb(2000), 1.15 * f.k), f.r * (1 + (this.gust || 0))]);
    gl.uniform4fv(p.u.uP0, P.a0); gl.uniform4fv(p.u.uP1, P.a1); gl.uniform4fv(p.u.uP2, P.a2); gl.uniform4fv(p.u.uP3, P.a3);
    gl.uniform1i(p.u.uN, P.nf); gl.uniform1i(p.u.uNB, P.nb);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.atlas); gl.uniform1i(p.u.uAtlas, 0);
    gl.bindVertexArray(this.empty); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null);
  },
  /* ---- sound: the lantern itself (the paper wheel's dry rustle, the candle's crackle, the river), and a shadow-play
     troupe behind the screen keeping time with what passes on it: a gong as the flame catches, then a bowed string;
     the wooden clappers on the bearers' steps; a patter of hooves as the horsemen gallop by; the cranes calling; a
     cymbal swell and a drum roll for the dragon */
  buildAudio(b) {
    const { ctx, out, noiseBuffer, loop } = b;
    const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(out);
    const pink = noiseBuffer(6.1, 'pink');
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 0.8;
    const rg = ctx.createGain(); rg.gain.value = 0;
    loop(pink, 1.0, bp); bp.connect(rg); rg.connect(bus);
    // the river: a low, slow lapping
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.6;
    const wg = ctx.createGain(); wg.gain.value = 0;
    loop(pink, 0.53, lp); lp.connect(wg); wg.connect(bus);
    this.snd = { ctx, bus, rg, wg, pink, next: 0.5, ev: {}, step: -1, stride: {} };
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
  // a struck tone: a few partials with their own decays (wood, bronze, skin)
  strike(t0, parts, a, pan = 0) {
    const S = this.snd, ctx = S.ctx, p = ctx.createStereoPanner(); p.pan.value = pan; p.connect(S.bus);
    for (const [f, amp, dec, f1] of parts) {
      const o = ctx.createOscillator(); o.frequency.setValueAtTime(f * (f1 || 1), t0); if (f1) o.frequency.exponentialRampToValueAtTime(f, t0 + 0.08);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(a * amp, t0 + 0.003); g.gain.setTargetAtTime(0, t0 + 0.004, dec);
      o.connect(g); g.connect(p); o.start(t0); o.stop(t0 + dec * 8 + 0.1);
    }
  },
  // a burst of filtered noise (the click of wood on wood, the hiss of a cymbal, a breath of wind)
  hiss(t0, type, f, q, a, att, dec, pan = 0) {
    const S = this.snd, ctx = S.ctx, s = ctx.createBufferSource(); s.buffer = S.pink;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(a, t0 + att); g.gain.setTargetAtTime(0, t0 + att, dec);
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    s.connect(fl); fl.connect(g); g.connect(p); p.connect(S.bus); s.start(t0, Math.random() * 4); s.stop(t0 + att + dec * 7);
  },
  clapper(t0, a, hi, pan) { this.strike(t0, [[hi ? 1180 : 940, 1, 0.025], [hi ? 3150 : 2600, 0.35, 0.012]], a, pan); this.hiss(t0, 'bandpass', 2400, 2, a * 0.5, 0.002, 0.01, pan); },
  hoof(t0, a, pan) { this.strike(t0, [[620 + 80 * Math.random(), 1, 0.02], [140, 0.8, 0.035, 1.6]], a, pan); },
  gong(t0, a) { this.strike(t0, [[110, 1, 1.6, 1.03], [167, 0.6, 1.2], [231, 0.35, 0.9], [298, 0.2, 0.7], [413, 0.1, 0.5]], a); this.hiss(t0, 'highpass', 3000, 0.7, a * 0.3, 0.005, 0.4); },
  craneCall(t0, a, pan) {
    const S = this.snd, ctx = S.ctx;
    for (const [dt, f] of [[0, 860], [0.22, 760]]) {
      const t = t0 + dt, o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f * 1.12, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06); o.frequency.exponentialRampToValueAtTime(f * 0.86, t + 0.18);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 2.5;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.02); g.gain.setTargetAtTime(0, t + 0.12, 0.04);
      const p = ctx.createStereoPanner(); p.pan.value = pan;
      o.connect(bp); bp.connect(g); g.connect(p); p.connect(S.bus); o.start(t); o.stop(t + 0.5);
    }
  },
  // where something is in the picture: -1 (left edge) … 1 (right edge), and how near the middle (for loudness)
  where(s) { const x = wrap(s - this.camS(this.wheelT(this.t))); return { pan: Math.max(-1, Math.min(1, x / 0.3)), near: Math.exp(-x * x / 0.07) }; },
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
    seq.forEach((k, i) => { const d = i === seq.length - 1 ? 1.8 : 0.55 + 0.25 * (i % 2); o.frequency.setTargetAtTime(notes[k], tt, 0.05); g.gain.setTargetAtTime(0.030, tt, 0.08); g.gain.setTargetAtTime(0.019, tt + d * 0.6, 0.1); tt += d; });
    g.gain.setTargetAtTime(0, tt, 0.4);
    o.start(t); vib.start(t); o.stop(tt + 2); vib.stop(tt + 2);
  },
  sound(dt) {
    if (!this.snd) { const b = YL.AUDIO.bus && YL.AUDIO.bus(); if (b) this.buildAudio(b); else return; }
    const S = this.snd, ctx = S.ctx, now = ctx.currentTime, t = this.t, w = this.wheelT(t), E = S.ev, sink = this.sink || 0;
    const once = (k, cond, fn) => { if (cond && !E[k]) { E[k] = 1; fn(); } else if (!cond) E[k] = 0; };
    S.bus.gain.setTargetAtTime(this.fade * (this.vol ?? 1), now, 0.3);
    const turning = Math.min(1, w > 0 ? (this.wheelT(t + 0.1) - w) / 0.1 : 0) * (1 - sink);
    S.rg.gain.setTargetAtTime(0.022 * turning * (0.6 + 0.4 * Math.sin(t * 6.3) * Math.sin(t * 1.1)), now, 0.1);
    S.wg.gain.setTargetAtTime(0.05 * (0.7 + 0.3 * Math.sin(t * 0.8)) * (1 - sink), now, 0.3);
    if ((S.next -= dt) <= 0) { this.crackle(); S.next = Math.random() < 0.4 ? 0.08 + Math.random() * 0.2 : 0.8 + Math.random() * 2.5; }
    // the flame catches: the gong; then the string begins (and again every twenty-odd seconds after)
    once('gong', t > 1.02 && t < 3, () => this.gong(now + 0.02, 0.05));
    once('erhu', (t - 4.4 + 40) % 24 < 0.5 && t > 4, () => this.phrase());
    // the clappers keep the bearers' step (a lighter tick between)
    const step = Math.floor(2 * 1.17 * w + 0.25);
    if (step !== S.step) { if (S.step >= 0 && turning > 0.3) { const P = this.where(VW * w - 0.03); this.clapper(now + 0.01, (step % 2 ? 0.020 : 0.034) * (0.5 + 0.5 * P.near), step % 2, P.pan * 0.6); } S.step = step; }
    // hooves: three to a stride, from each horseman, louder as he passes the middle
    [[-0.36, 0], [-0.78, 2.1], [-0.40 + C_ARC / 2, 1.0]].forEach(([s0, ph], i) => {
      const P = this.where(s0 + VH * w), g = 9.0 * w + ph, k = Math.floor(g / (2 * Math.PI));
      if (S.stride[i] !== undefined && k !== S.stride[i] && P.near > 0.05 && turning > 0.5) for (const [o, a] of [[0, 0.8], [0.075, 0.6], [0.15, 1]]) this.hoof(now + 0.01 + o, 0.05 * a * P.near, P.pan);
      S.stride[i] = k;
    });
    // the cranes call as they cross; the dragon arrives with a cymbal swell and a drum roll
    const cr = this.where(0.47 + (VC - 0.10) * w);
    once('crane', cr.near > 0.5 && turning > 0.5, () => { this.craneCall(now + 0.02, 0.016, cr.pan); this.craneCall(now + 0.65, 0.011, cr.pan * 0.8); });
    const dr = this.where(0.62 + (VC - 0.11) * w);
    once('dragon', dr.near > 0.12 && dr.pan > 0 && turning > 0.5, () => {
      this.hiss(now + 0.02, 'highpass', 5200, 0.7, 0.05, 0.9, 0.5, 0.4);
      for (let i = 0; i < 14; i++) this.strike(now + 0.02 + 1.3 * Math.pow(i / 14, 0.8), [[92, 1, 0.09, 1.4]], 0.05 * (0.35 + 0.65 * i / 14), 0.2);
      this.strike(now + 1.36, [[80, 1, 0.3, 1.5], [180, 0.3, 0.1]], 0.10, 0.2);
    });
    // a gust: a breath of wind through the lantern, and the flame flutters
    const tg = ((t - 9.4) % 22 + 22) % 22;
    once('gust', tg > 21.6 || tg < 0.3, () => this.hiss(now + 0.02, 'bandpass', 700, 0.6, 0.05, 0.5, 0.7));
    // the candle gutters
    once('snuff', sink > 0.02, () => { this.hiss(now + 0.02, 'lowpass', 900, 0.5, 0.06, 0.15, 0.5); this.strike(now + 0.6, [[110, 1, 1.4, 1.03], [167, 0.5, 1.0]], 0.03); });
  },
};
})();
