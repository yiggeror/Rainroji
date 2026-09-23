import * as THREE from 'three';

// A single canvas atlas for every painted detail that needs real texture:
// road lettering, vending machine fronts, signs, manholes, posters...
const FONT = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Meiryo","Noto Sans JP","Noto Sans CJK JP","IPAGothic","WenQuanYi Zen Hei",sans-serif';
const FONT_M = '"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP","IPAMincho","IPAGothic",serif';

export class Atlas {
  constructor(size = 2048, height = size) {
    this.size = size;
    this.height = height;
    this.canvas = document.createElement('canvas');
    this.canvas.width = size;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.clearRect(0, 0, size, height);
    this.x = 0;
    this.y = 0;
    this.rowH = 0;
    this.rects = {};
  }
  // allocate w x h px and draw into it; returns uv rect {u0,v0,u1,v1}
  add(name, w, h, draw) {
    const pad = 4;
    if (this.x + w + pad > this.size) {
      this.x = 0;
      this.y += this.rowH + pad;
      this.rowH = 0;
    }
    const x = this.x, y = this.y;
    this.x += w + pad;
    this.rowH = Math.max(this.rowH, h);
    const c = this.ctx;
    c.save();
    c.translate(x, y);
    c.beginPath();
    c.rect(0, 0, w, h);
    c.clip();
    draw(c, w, h);
    c.restore();
    const S = this.size, SH = this.height;
    if (y + h > SH) console.warn('[rainroji] atlas overflow at', name);
    const r = { u0: (x + 0.5) / S, u1: (x + w - 0.5) / S, v0: 1 - (y + h - 0.5) / SH, v1: 1 - (y + 0.5) / SH, w, h };
    this.rects[name] = r;
    return r;
  }
  texture() {
    const t = new THREE.CanvasTexture(this.canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    return t;
  }
}

// uv array for Emitter.quad (a=bottom-left, b=bottom-right, c=top-right, d=top-left)
export function quv(r, flipX = false) {
  return flipX ? [r.u1, r.v0, r.u0, r.v0, r.u0, r.v1, r.u1, r.v1] : [r.u0, r.v0, r.u1, r.v0, r.u1, r.v1, r.u0, r.v1];
}

function rr(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function vtext(c, text, x, y, size, color, font = FONT, gap = 1.05) {
  c.fillStyle = color;
  c.font = `bold ${size}px ${font}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  [...text].forEach((ch, i) => c.fillText(ch, x, y + i * size * gap));
}

export function paintAtlas(A, rng) {
  // --- 止まれ road lettering (white, stretched tall as painted on Japanese roads)
  A.add('tomare', 256, 512, (c, w, h) => {
    c.fillStyle = '#fff';
    c.font = `bold 200px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.save();
    c.scale(1, 0.85);
    ['止', 'ま', 'れ'].forEach((ch, i) => {
      c.save();
      c.translate(w / 2, (80 + i * 190) / 0.85 * 0.85);
      c.scale(1.05, 0.95);
      c.fillText(ch, 0, 0);
      c.restore();
    });
    c.restore();
  });

  // --- manhole cover (decorative municipal design)
  A.add('manhole', 256, 256, (c, w) => {
    const r = w / 2;
    c.translate(r, r);
    c.fillStyle = '#3d3f42';
    c.beginPath();
    c.arc(0, 0, r - 2, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#6a6b6c';
    c.lineWidth = 6;
    c.beginPath();
    c.arc(0, 0, r - 10, 0, Math.PI * 2);
    c.stroke();
    // flower/wave motif
    c.lineWidth = 5;
    for (let i = 0; i < 12; i++) {
      c.save();
      c.rotate((i / 12) * Math.PI * 2);
      c.beginPath();
      c.ellipse(0, -62, 16, 42, 0, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    }
    c.beginPath();
    c.arc(0, 0, 26, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = '#707172';
    c.font = `bold 22px ${FONT}`;
    c.textAlign = 'center';
    c.fillText('おすい', 0, 8);
    // grip bumps
    c.fillStyle = '#58595b';
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * Math.PI * 2;
      c.fillRect(Math.cos(a) * (r - 22) - 2, Math.sin(a) * (r - 22) - 2, 4, 4);
    }
  });

  // --- vending machines (3 variants): bright front with sample cans
  const vmColors = [
    ['#f4f4f2', '#d8282c'],
    ['#e9eef2', '#1d5aa8'],
    ['#f2f1ec', '#2f8f4e'],
  ];
  vmColors.forEach(([body, accent], vi) => {
    A.add('vm' + vi, 256, 480, (c, w, h) => {
      c.fillStyle = body;
      c.fillRect(0, 0, w, h);
      // header band
      c.fillStyle = accent;
      c.fillRect(0, 0, w, 44);
      c.fillStyle = '#fff';
      c.font = `bold 26px ${FONT}`;
      c.textAlign = 'center';
      c.fillText(['つめた〜い', 'あったか〜い', 'お茶'][vi], w / 2, 32);
      // display window
      c.fillStyle = '#dfe6ea';
      c.fillRect(10, 52, w - 20, 250);
      const canCols = ['#c8322e', '#2c62b0', '#e6b33a', '#3b9c5a', '#f0f0f0', '#8a4b2a', '#e46a2a', '#5a3b8c', '#1f1f1f', '#d9d34a'];
      for (let row = 0; row < 4; row++) {
        for (let k = 0; k < 7; k++) {
          const x = 16 + k * 32.5, y = 62 + row * 60;
          c.fillStyle = canCols[Math.floor(rng.next() * canCols.length)];
          rr(c, x + 3, y + 4, 22, 40, 5);
          c.fill();
          c.fillStyle = 'rgba(255,255,255,0.45)';
          c.fillRect(x + 6, y + 8, 4, 30);
          // price tag & button
          c.fillStyle = row % 2 ? '#2a6fd6' : '#d6362a';
          c.fillRect(x + 4, y + 47, 20, 7);
        }
      }
      c.fillStyle = '#b8c0c6';
      c.fillRect(10, 302, w - 20, 3);
      // lower panel with coin slot & ads
      c.fillStyle = accent;
      c.globalAlpha = 0.85;
      c.fillRect(14, 318, 150, 90);
      c.globalAlpha = 1;
      c.fillStyle = '#fff';
      c.font = `bold 30px ${FONT}`;
      c.textAlign = 'left';
      c.fillText(['冷たい', 'ホット', '緑茶'][vi], 26, 356);
      c.font = `18px ${FONT}`;
      c.fillText('いつでもどこでも', 26, 388);
      c.fillStyle = '#9aa2a8';
      c.fillRect(180, 322, 56, 80);
      c.fillStyle = '#2b2d30';
      c.fillRect(196, 336, 22, 5);
      c.fillRect(190, 360, 34, 22);
      // dispenser
      c.fillStyle = '#2a2b2e';
      c.fillRect(24, 420, 200, 44);
      c.fillStyle = '#44464a';
      c.fillRect(30, 426, 188, 32);
    });
  });

  // --- shop signs
  A.add('shopsign', 1024, 160, (c, w, h) => {
    c.fillStyle = '#f1efe6';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#1f4f8f';
    c.fillRect(0, 0, 150, h);
    c.fillStyle = '#fff';
    c.font = `bold 92px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('酒', 75, h / 2 + 4);
    c.fillStyle = '#23262b';
    c.font = `bold 96px ${FONT_M}`;
    c.textAlign = 'left';
    c.fillText('たなか商店', 190, h / 2 + 6);
    c.fillStyle = '#b3342c';
    c.font = `bold 44px ${FONT}`;
    c.fillText('たばこ・食料品', 700, h / 2 + 4);
  });
  A.add('tabako', 256, 96, (c, w, h) => {
    c.fillStyle = '#c8322e';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff';
    c.font = `bold 64px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('たばこ', w / 2, h / 2 + 3);
  });
  A.add('closedsign', 768, 128, (c, w, h) => {
    c.fillStyle = '#d9d4c6';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#6b4a2e';
    c.font = `bold 80px ${FONT_M}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('丸山クリーニング', w / 2, h / 2 + 4);
  });
  A.add('shutterpaper', 128, 160, (c, w, h) => {
    c.fillStyle = '#f5f2e8';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#333';
    c.font = `bold 20px ${FONT}`;
    c.textAlign = 'center';
    c.fillText('長い間', w / 2, 40);
    c.fillText('ありがとう', w / 2, 70);
    c.fillText('ございました', w / 2, 100);
    c.font = `14px ${FONT}`;
    c.fillText('店主', w / 2, 136);
  });

  // --- pole advertisement plates (電柱広告), vertical
  const ads = [
    ['さくら歯科', 'この先50m', '#f4f1e8', '#2d5d9a'],
    ['中村内科', '右折すぐ', '#fbfaf5', '#2e7d4f'],
    ['ひかり塾', '小・中学生', '#fff7e0', '#c8472c'],
    ['山田不動産', '賃貸・売買', '#f0f3f6', '#1c3f75'],
  ];
  ads.forEach(([a, b, bg, fg], i) => {
    A.add('ad' + i, 96, 420, (c, w, h) => {
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);
      c.fillStyle = fg;
      c.fillRect(0, 0, w, 10);
      c.fillRect(0, h - 70, w, 70);
      vtext(c, a, w / 2, 48, 54, fg);
      c.fillStyle = '#fff';
      c.font = `bold 20px ${FONT}`;
      c.textAlign = 'center';
      c.fillText(b, w / 2, h - 32);
    });
  });

  // --- address plate (住居表示, blue)
  A.add('address', 256, 96, (c, w, h) => {
    c.fillStyle = '#244f9a';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff';
    c.font = `bold 34px ${FONT}`;
    c.textAlign = 'center';
    c.fillText('若葉町二丁目', w / 2, 42);
    c.font = `bold 28px ${FONT}`;
    c.fillText('7', w / 2, 80);
  });

  // --- stop sign (inverted triangle)
  A.add('stop', 256, 230, (c, w, h) => {
    c.fillStyle = '#fff';
    c.beginPath();
    c.moveTo(4, 4);
    c.lineTo(w - 4, 4);
    c.lineTo(w / 2, h - 4);
    c.closePath();
    c.fill();
    c.fillStyle = '#c8232b';
    c.beginPath();
    c.moveTo(20, 13);
    c.lineTo(w - 20, 13);
    c.lineTo(w / 2, h - 26);
    c.closePath();
    c.fill();
    c.fillStyle = '#fff';
    c.font = `bold 54px ${FONT}`;
    c.textAlign = 'center';
    c.fillText('止まれ', w / 2, 88);
  });
  // blue round sign (pedestrian / no entry etc.)
  A.add('bluesign', 256, 256, (c, w) => {
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(w / 2, w / 2, w / 2 - 2, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#1e56a8';
    c.beginPath();
    c.arc(w / 2, w / 2, w / 2 - 14, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#fff';
    // walking figures
    c.beginPath();
    c.arc(100, 70, 16, 0, Math.PI * 2);
    c.arc(160, 84, 13, 0, Math.PI * 2);
    c.fill();
    c.fillRect(88, 92, 24, 70);
    c.fillRect(150, 102, 20, 56);
    c.fillRect(84, 160, 12, 50);
    c.fillRect(106, 160, 12, 50);
    c.fillRect(148, 156, 10, 44);
    c.fillRect(162, 156, 10, 44);
  });
  // crossing warning sign
  A.add('fumikiri', 256, 256, (c, w) => {
    c.fillStyle = '#f1c21b';
    c.save();
    c.translate(w / 2, w / 2);
    c.rotate(Math.PI / 4);
    c.fillRect(-86, -86, 172, 172);
    c.strokeStyle = '#111';
    c.lineWidth = 8;
    c.strokeRect(-78, -78, 156, 156);
    c.restore();
    c.fillStyle = '#111';
    c.fillRect(70, 150, 116, 10);
    c.fillRect(84, 110, 36, 40);
    c.fillRect(130, 104, 44, 46);
    c.fillRect(92, 96, 6, 14);
  });
  // school zone text painted on road
  A.add('slow', 256, 512, (c, w, h) => {
    c.fillStyle = '#fff';
    c.font = `bold 190px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('ス', w / 2, 90);
    c.fillText('ク', w / 2, 260);
    c.fillText('ル', w / 2, 430);
  });
  // bridge name plates
  A.add('bridge1', 256, 96, (c, w, h) => {
    c.fillStyle = '#5b4b36';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#e8dcc0';
    c.font = `bold 60px ${FONT_M}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('若葉橋', w / 2, h / 2 + 3);
  });
  A.add('bridge2', 256, 96, (c, w, h) => {
    c.fillStyle = '#5b4b36';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#e8dcc0';
    c.font = `bold 44px ${FONT_M}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('わかばばし', w / 2, h / 2 + 3);
  });
  // apartment name plate
  A.add('corpo', 320, 80, (c, w, h) => {
    c.fillStyle = '#e9e4d6';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#3c3a36';
    c.font = `bold 44px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('コーポ若葉', w / 2, h / 2 + 2);
  });
  // parking sign
  A.add('parking', 256, 256, (c, w, h) => {
    c.fillStyle = '#f4f4f0';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#1c55a6';
    c.fillRect(10, 10, w - 20, 150);
    c.fillStyle = '#fff';
    c.font = `bold 130px sans-serif`;
    c.textAlign = 'center';
    c.fillText('P', w / 2, 132);
    c.fillStyle = '#222';
    c.font = `bold 32px ${FONT}`;
    c.fillText('月極駐車場', w / 2, 204);
    c.font = `20px ${FONT}`;
    c.fillText('空きあり 山田不動産', w / 2, 238);
  });
  // nameplate generic
  const names = ['佐藤', '鈴木', '高橋', '田中', '渡辺', '伊藤', '山本', '中村', '小林', '加藤', '吉田', '山田', '松本', '井上', '木村', '清水'];
  names.forEach((n, i) => {
    A.add('name' + i, 64, 128, (c, w, h) => {
      c.fillStyle = i % 3 === 0 ? '#e8e2d2' : i % 3 === 1 ? '#3b3632' : '#d9d9d9';
      c.fillRect(0, 0, w, h);
      vtext(c, n, w / 2, 36, 42, i % 3 === 1 ? '#e9e2cf' : '#2a2724', FONT_M, 1.2);
    });
  });
  // posters for boards
  A.add('poster0', 128, 180, (c, w, h) => {
    c.fillStyle = '#f7f3e3';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#d24b3a';
    c.fillRect(0, 0, w, 40);
    c.fillStyle = '#fff';
    c.font = `bold 22px ${FONT}`;
    c.textAlign = 'center';
    c.fillText('夏祭り', w / 2, 29);
    c.fillStyle = '#333';
    c.font = `14px ${FONT}`;
    ['7月20日(土)', '若葉公園', '盆踊り・夜店'].forEach((t, i) => c.fillText(t, w / 2, 70 + i * 26));
    c.fillStyle = '#e39b2d';
    c.beginPath();
    c.arc(w / 2, 150, 14, 0, Math.PI * 2);
    c.fill();
  });
  A.add('poster1', 128, 180, (c, w, h) => {
    c.fillStyle = '#e8f0f4';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#2e5f8a';
    c.font = `bold 20px ${FONT}`;
    c.textAlign = 'center';
    c.fillText('ゴミの日', w / 2, 30);
    c.fillStyle = '#333';
    c.font = `14px ${FONT}`;
    ['燃える 月・木', '資源 水', 'ビン缶 第2金'].forEach((t, i) => c.fillText(t, w / 2, 64 + i * 28));
  });
  // crossing X sign (crossbuck) yellow/black
  A.add('crossbuck', 256, 256, (c, w) => {
    c.save();
    c.translate(w / 2, w / 2);
    for (const a of [Math.PI / 4, -Math.PI / 4]) {
      c.save();
      c.rotate(a);
      c.fillStyle = '#f1c21b';
      c.fillRect(-120, -18, 240, 36);
      c.fillStyle = '#141414';
      for (let k = -120; k < 120; k += 40) c.fillRect(k, -18, 20, 36);
      c.restore();
    }
    c.restore();
  });

  // ---- station, harbour and the new shops ---------------------------------------
  A.add('ekimei', 512, 170, (c, w, h) => {
    c.fillStyle = '#f7f7f3';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#1d3f6e';
    c.fillRect(0, 0, w, 8);
    c.fillStyle = '#2f8f5a';
    c.fillRect(0, 112, w, 16);
    c.fillStyle = '#1c1e22';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `bold 62px ${FONT}`;
    c.fillText('あめのうら', w / 2, 52);
    c.font = `bold 22px ${FONT}`;
    c.fillText('雨ノ浦  AMENOURA', w / 2, 94);
    c.font = `bold 20px ${FONT}`;
    c.textAlign = 'left';
    c.fillText('◀ みさき', 14, 150);
    c.textAlign = 'right';
    c.fillText('はまだ ▶', w - 14, 150);
  });
  A.add('stationsign', 384, 96, (c, w, h) => {
    c.fillStyle = '#1d3f6e';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff';
    c.font = `bold 56px ${FONT_M}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('雨ノ浦駅', w / 2, h / 2 + 3);
  });
  const board = (name, w, h, bg, fg, text, size, font = FONT, extra) =>
    A.add(name, w, h, (c) => {
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);
      if (extra) extra(c, w, h);
      c.fillStyle = fg;
      c.font = `bold ${size}px ${font}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(text, w / 2, h / 2 + 3);
    });
  board('gyokyo', 640, 96, '#f4f2ea', '#1d3a66', '雨ノ浦漁業協同組合', 52, FONT_M, (c, w, h) => {
    c.fillStyle = '#1d3a66';
    c.fillRect(0, h - 8, w, 8);
  });
  board('fishmkt', 384, 96, '#1d3a66', '#ffffff', '魚市場', 60, FONT_M);
  board('laundry', 512, 110, '#2a64b4', '#ffffff', 'コインランドリー', 60, FONT, (c, w, h) => {
    c.fillStyle = 'rgba(255,255,255,0.25)';
    for (let i = 0; i < 14; i++) {
      c.beginPath();
      c.arc(20 + i * 37, h - 14 - (i % 3) * 8, 6 + (i % 4) * 2, 0, Math.PI * 2);
      c.fill();
    }
  });
  board('barber', 384, 100, '#f3f1ea', '#23262b', '理容 ヤマモト', 50, FONT_M, (c, w, h) => {
    c.fillStyle = '#c8322e';
    c.fillRect(0, 0, 14, h);
    c.fillStyle = '#2a4f9a';
    c.fillRect(w - 14, 0, 14, h);
  });
  board('kissa', 384, 100, '#efe6d2', '#5a3a22', '喫茶 しぐれ', 52, FONT_M, (c, w, h) => {
    c.strokeStyle = '#5a3a22';
    c.lineWidth = 3;
    c.strokeRect(8, 8, w - 16, h - 16);
  });
  board('bakery', 384, 100, '#f6f0e2', '#7a4a24', 'パン工房 こむぎ', 44, FONT, (c, w, h) => {
    c.fillStyle = '#d9a35b';
    c.fillRect(0, h - 10, w, 10);
  });
  // red paper lantern (akachochin): wraps around a cylinder
  A.add('chochin', 256, 192, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#9e1f1a');
    g.addColorStop(0.5, '#e0473a');
    g.addColorStop(1, '#9e1f1a');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(60,0,0,0.35)';
    c.lineWidth = 2;
    for (let y = 10; y < h; y += 16) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
    }
    c.fillStyle = '#151515';
    c.font = `bold 96px ${FONT_M}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('酒', w * 0.25, h / 2 + 4);
    c.fillText('処', w * 0.75, h / 2 + 4);
  });
  // indigo shop curtain (noren) with a name, split into three flaps
  A.add('noren', 512, 256, (c, w, h) => {
    c.fillStyle = '#23324f';
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(0,0,0,0.25)';
    for (const x of [w / 3, (2 * w) / 3]) c.fillRect(x - 3, 40, 6, h);
    c.fillStyle = '#f2efe6';
    c.font = `bold 92px ${FONT_M}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('や', w / 6, h / 2 + 10);
    c.fillText('き', w / 2, h / 2 + 10);
    c.fillText('鳥', (5 * w) / 6, h / 2 + 10);
    c.font = `bold 28px ${FONT}`;
    c.fillText('鳥 八', w / 2, 28);
  });
  A.add('busstop', 160, 160, (c, w, h) => {
    c.fillStyle = '#f5f5f0';
    c.beginPath();
    c.arc(w / 2, h / 2, 76, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#2a64b4';
    c.lineWidth = 12;
    c.stroke();
    c.fillStyle = '#2a64b4';
    c.font = `bold 30px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('雨ノ浦港', w / 2, h / 2 - 12);
    c.font = `bold 20px ${FONT}`;
    c.fillText('町営バス', w / 2, h / 2 + 22);
  });
  A.add('timetable', 128, 170, (c, w, h) => {
    c.fillStyle = '#fbfbf7';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#1d3f6e';
    c.fillRect(0, 0, w, 22);
    c.fillStyle = '#333';
    c.font = `12px ${FONT}`;
    for (let r = 0; r < 12; r++) {
      c.fillText(String(6 + r).padStart(2, '0'), 6, 38 + r * 11);
      for (let k = 0; k < 3; k++) if ((r * 7 + k * 3) % 5 !== 0) c.fillText(String((r * 13 + k * 19) % 60).padStart(2, '0'), 34 + k * 28, 38 + r * 11);
    }
  });
  // shelf goods: rows of colourful packs, cans and bottles (drawn on shelf fronts)
  A.add('goods', 512, 256, (c, w, h) => {
    c.fillStyle = '#e9e6de';
    c.fillRect(0, 0, w, h);
    const cols = ['#d8433a', '#f2c230', '#3b7dc4', '#4aa060', '#f08a3c', '#ffffff', '#8a5ab0', '#e9e0c8', '#2c3e50', '#e87aa0'];
    for (let row = 0; row < 4; row++) {
      let x = 2;
      const y0 = row * 64;
      while (x < w - 4) {
        const bw = 10 + Math.floor(rng.next() * 22);
        const bh = 26 + Math.floor(rng.next() * 32);
        c.fillStyle = cols[Math.floor(rng.next() * cols.length)];
        c.fillRect(x, y0 + 62 - bh, bw, bh);
        c.fillStyle = 'rgba(255,255,255,0.5)';
        c.fillRect(x + 2, y0 + 62 - bh + 4, bw - 4, 4);
        c.fillStyle = 'rgba(0,0,0,0.18)';
        c.fillRect(x + bw - 2, y0 + 62 - bh, 2, bh);
        x += bw + 1;
      }
      c.fillStyle = '#bdb8ac';
      c.fillRect(0, y0 + 60, w, 4);
    }
  });
  A.add('bottles', 256, 256, (c, w, h) => {
    c.fillStyle = '#dfe6ea';
    c.fillRect(0, 0, w, h);
    const cols = ['#e9eef2', '#3a7a3e', '#c8322e', '#f0b030', '#2e5e9e', '#8fd0e6', '#a0522d'];
    for (let row = 0; row < 5; row++) {
      for (let k = 0; k < 11; k++) {
        const x = 6 + k * 22, y = row * 51 + 10;
        c.fillStyle = cols[(row * 3 + k) % cols.length];
        c.fillRect(x, y + 8, 16, 34);
        c.fillRect(x + 5, y, 6, 10);
        c.fillStyle = 'rgba(255,255,255,0.6)';
        c.fillRect(x + 2, y + 18, 12, 8);
      }
      c.fillStyle = '#9aa3a8';
      c.fillRect(0, row * 51 + 46, w, 3);
    }
  });
  A.add('magazines', 256, 128, (c, w, h) => {
    const cols = ['#e84a5f', '#2a9d8f', '#f4a261', '#264653', '#e9c46a', '#8ab17d', '#6a4c93', '#ff6b6b'];
    for (let k = 0; k < 8; k++) {
      c.fillStyle = cols[k];
      c.fillRect(k * 32, 0, 30, h);
      c.fillStyle = '#fff';
      c.fillRect(k * 32 + 3, 8, 24, 10);
      c.fillStyle = 'rgba(255,255,255,0.5)';
      c.fillRect(k * 32 + 5, 40, 18, 40);
    }
  });
  A.add('menu', 128, 180, (c, w, h) => {
    c.fillStyle = '#2b2a27';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#8a6a44';
    c.lineWidth = 8;
    c.strokeRect(4, 4, w - 8, h - 8);
    c.fillStyle = '#efeadf';
    c.font = `bold 20px ${FONT}`;
    c.textAlign = 'center';
    c.fillText('本日の', w / 2, 34);
    c.fillText('おすすめ', w / 2, 58);
    c.font = `16px ${FONT}`;
    ['珈琲 450', 'ナポリタン', 'ホットケーキ', '雨の日割'].forEach((t, i) => c.fillText(t, w / 2, 90 + i * 22));
  });
  A.add('washer', 128, 128, (c, w, h) => {
    c.fillStyle = '#eef1f2';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#c9d1d5';
    c.fillRect(0, 0, w, 20);
    c.fillStyle = '#2c3238';
    c.beginPath();
    c.arc(w / 2, 72, 44, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#6d8796';
    c.beginPath();
    c.arc(w / 2, 72, 36, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.beginPath();
    c.arc(w / 2 - 12, 60, 12, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#e25a3a';
    c.fillRect(10, 6, 16, 8);
  });
  // leaf cluster textures live in their own atlas (see plants.js)
  if (/[?&]stats/.test(location.search)) console.log('[rainroji] atlas used px rows', A.y + A.rowH);
}
