import { noiseBuffer, reverbIR, rainTexture, dist } from './common.js';

// ---------------------------------------------------------------------------
// Fully synthesized soundscape (no samples): rain, drips, gutter water,
// vending-machine hum, level-crossing bell, passing trains and a quiet
// electric-piano piece. Everything is generated with the Web Audio API.
// ---------------------------------------------------------------------------

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

// 王道進行-flavoured loop in C: IV V iii vi | ii V I (III7)
const CHORDS = [
  { bass: 41, notes: [53, 57, 60, 64] }, // Fmaj7
  { bass: 43, notes: [55, 59, 62, 64] }, // G6
  { bass: 40, notes: [52, 55, 59, 62] }, // Em7
  { bass: 45, notes: [57, 60, 64, 67, 71] }, // Am9
  { bass: 38, notes: [53, 57, 60, 64] }, // Dm9 (no root)
  { bass: 43, notes: [53, 57, 60, 64] }, // G13sus
  { bass: 36, notes: [52, 55, 59, 62] }, // Cmaj9
  { bass: 40, notes: [52, 56, 59, 62] }, // E7
];
// melody: [bar, beat, midi, beats]
const MELODY_A = [
  [0, 1.0, 76, 1.0], [0, 2.0, 79, 1.0], [0, 3.0, 81, 1.0],
  [1, 0.0, 79, 1.5], [1, 1.5, 74, 0.5], [1, 2.0, 76, 2.0],
  [2, 0.5, 71, 1.0], [2, 1.5, 74, 0.5], [2, 2.0, 76, 1.0], [2, 3.0, 79, 1.0],
  [3, 0.0, 76, 3.0],
  [4, 0.5, 77, 1.0], [4, 1.5, 76, 0.5], [4, 2.0, 74, 1.0], [4, 3.0, 72, 1.0],
  [5, 0.0, 74, 1.0], [5, 1.0, 76, 1.0], [5, 2.0, 79, 2.0],
  [6, 0.0, 76, 1.5], [6, 1.5, 74, 0.5], [6, 2.0, 72, 1.5], [6, 3.5, 71, 0.5],
  [7, 0.0, 71, 1.5], [7, 1.5, 74, 0.5], [7, 2.0, 76, 2.0],
];
const MELODY_B = [
  [0, 0.5, 72, 1.0], [0, 1.5, 76, 1.5], [0, 3.0, 77, 1.0],
  [1, 0.0, 79, 2.0], [1, 2.5, 81, 0.5], [1, 3.0, 79, 1.0],
  [2, 0.0, 76, 2.5], [2, 3.0, 74, 1.0],
  [3, 0.0, 72, 1.0], [3, 1.0, 76, 3.0],
  [4, 0.0, 81, 1.5], [4, 1.5, 79, 0.5], [4, 2.0, 77, 1.0], [4, 3.0, 76, 1.0],
  [5, 0.0, 74, 2.0], [5, 2.5, 72, 0.5], [5, 3.0, 74, 1.0],
  [6, 0.0, 72, 3.0], [6, 3.0, 67, 1.0],
  [7, 0.0, 68, 1.0], [7, 1.0, 71, 1.0], [7, 2.0, 74, 2.0],
];

export function makeSynthAudio() {
  let ac = null;
  let nodes = null;
  let running = false;
  let schedTimer = null;
  let lastUpdate = 0;
  const env = { humLevel: 0, bell: 0, train: 0, trainX: 0, dripRate: 0.6 };

  function build() {
    ac = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' });
    const master = ac.createGain();
    master.gain.value = 0;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    comp.attack.value = 0.02;
    comp.release.value = 0.4;
    master.connect(comp).connect(ac.destination);
    const tap = ac.createAnalyser();
    tap.fftSize = 2048;
    comp.connect(tap);
    window.__audioTap = tap;

    const reverb = ac.createConvolver();
    reverb.buffer = reverbIR(ac, 3.4, 2.4);
    const revGain = ac.createGain();
    revGain.gain.value = 0.9;
    reverb.connect(revGain).connect(master);

    const sfx = ac.createGain();
    sfx.gain.value = 0.62;
    sfx.connect(master);
    const sfxSend = ac.createGain();
    sfxSend.gain.value = 0.12;
    sfx.connect(sfxSend).connect(reverb);

    // ---- rain bed ----------------------------------------------------------
    const pink = noiseBuffer(ac, 8, 'pink');
    const brown = noiseBuffer(ac, 8, 'brown');
    const src = (buf, rate = 1) => {
      const s = ac.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.playbackRate.value = rate;
      s.start(ac.currentTime + Math.random() * 0.1, Math.random() * buf.duration);
      return s;
    };
    const hiss = src(pink);
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 480;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 7500;
    const hissG = ac.createGain();
    hissG.gain.value = 0.34;
    hiss.connect(hp).connect(lp).connect(hissG).connect(sfx);

    const roar = src(brown);
    const rlp = ac.createBiquadFilter();
    rlp.type = 'lowpass';
    rlp.frequency.value = 420;
    const roarG = ac.createGain();
    roarG.gain.value = 0.24;
    roar.connect(rlp).connect(roarG).connect(sfx);

    const tex = src(rainTexture(ac, 14, 1400));
    const thp = ac.createBiquadFilter();
    thp.type = 'highpass';
    thp.frequency.value = 700;
    const texG = ac.createGain();
    texG.gain.value = 0.9;
    tex.connect(thp).connect(texG).connect(sfx);
    // closer, sparser patter on a second texture
    const tex2 = src(rainTexture(ac, 11, 260), 0.93);
    const t2G = ac.createGain();
    t2G.gain.value = 0.55;
    const t2f = ac.createBiquadFilter();
    t2f.type = 'peaking';
    t2f.frequency.value = 2400;
    t2f.gain.value = 4;
    tex2.connect(t2f).connect(t2G).connect(sfx);

    // ---- gutter trickle -------------------------------------------------------
    const gut = src(noiseBuffer(ac, 6, 'white', 1));
    const gbp = ac.createBiquadFilter();
    gbp.type = 'bandpass';
    gbp.frequency.value = 1900;
    gbp.Q.value = 2.2;
    const gAM = ac.createGain();
    gAM.gain.value = 0.06;
    const gLfo = ac.createOscillator();
    gLfo.frequency.value = 9.5;
    const gLfoG = ac.createGain();
    gLfoG.gain.value = 0.05;
    gLfo.connect(gLfoG).connect(gAM.gain);
    gLfo.start();
    const gLfo2 = ac.createOscillator();
    gLfo2.frequency.value = 2.7;
    const gLfo2G = ac.createGain();
    gLfo2G.gain.value = 1200;
    gLfo2.connect(gLfo2G).connect(gbp.frequency);
    gLfo2.start();
    const gutG = ac.createGain();
    gutG.gain.value = 0.7;
    gut.connect(gbp).connect(gAM).connect(gutG).connect(sfx);

    // ---- vending machine hum ----------------------------------------------------
    const hum = ac.createGain();
    hum.gain.value = 0;
    const humF = ac.createBiquadFilter();
    humF.type = 'lowpass';
    humF.frequency.value = 520;
    for (const [f, a, type] of [[60, 0.5, 'sine'], [120, 0.35, 'sine'], [180, 0.18, 'triangle'], [240, 0.08, 'sine']]) {
      const o = ac.createOscillator();
      o.type = type;
      o.frequency.value = f + (Math.random() - 0.5) * 0.4;
      const g = ac.createGain();
      g.gain.value = a;
      o.connect(g).connect(humF);
      o.start();
    }
    const whine = ac.createOscillator();
    whine.frequency.value = 3150;
    const whineG = ac.createGain();
    whineG.gain.value = 0.012;
    whine.connect(whineG).connect(hum);
    whine.start();
    humF.connect(hum).connect(sfx);

    // ---- train rumble ---------------------------------------------------------------
    const tr = src(brown, 0.8);
    const trf = ac.createBiquadFilter();
    trf.type = 'lowpass';
    trf.frequency.value = 220;
    const trG = ac.createGain();
    trG.gain.value = 0;
    const trPan = ac.createStereoPanner();
    tr.connect(trf).connect(trG).connect(trPan).connect(sfx);
    const trHi = src(pink, 0.7);
    const trHf = ac.createBiquadFilter();
    trHf.type = 'bandpass';
    trHf.frequency.value = 900;
    trHf.Q.value = 0.8;
    const trHG = ac.createGain();
    trHG.gain.value = 0;
    trHi.connect(trHf).connect(trHG).connect(trPan);

    // ---- music -------------------------------------------------------------------------
    const music = ac.createGain();
    music.gain.value = 0.95;
    const mlp = ac.createBiquadFilter();
    mlp.type = 'lowpass';
    mlp.frequency.value = 5200;
    music.connect(mlp).connect(master);
    const mSend = ac.createGain();
    mSend.gain.value = 0.5;
    mlp.connect(mSend).connect(reverb);
    // slow stereo tremolo for the electric piano
    const epBus = ac.createStereoPanner();
    const trem = ac.createOscillator();
    trem.frequency.value = 0.35;
    const tremG = ac.createGain();
    tremG.gain.value = 0.25;
    trem.connect(tremG).connect(epBus.pan);
    trem.start();
    epBus.connect(music);

    window.__audioNodes = { sfx, music };
    nodes = { master, sfx, reverb, hissG, roarG, texG, t2G, gutG, gAM, hum, trG, trHG, trPan, music, epBus, sfxSend };
  }

  // ------------------------------------------------------------------------------------
  // Instruments
  // ------------------------------------------------------------------------------------
  function ep(time, m, vel, dur) {
    const f = midi(m);
    const car = ac.createOscillator();
    const mod = ac.createOscillator();
    const modG = ac.createGain();
    car.frequency.value = f;
    mod.frequency.value = f;
    const idx = f * (1.6 + vel * 1.4);
    modG.gain.setValueAtTime(idx, time);
    modG.gain.exponentialRampToValueAtTime(f * 0.25, time + 0.9);
    mod.connect(modG).connect(car.frequency);
    const g = ac.createGain();
    const peak = 0.11 * vel;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(peak, time + 0.008);
    g.gain.exponentialRampToValueAtTime(peak * 0.35, time + 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur + 1.6);
    car.connect(g).connect(nodes.epBus);
    // tine ping
    const tine = ac.createOscillator();
    tine.frequency.value = f * 7.02;
    const tg = ac.createGain();
    tg.gain.setValueAtTime(0.0001, time);
    tg.gain.exponentialRampToValueAtTime(0.012 * vel, time + 0.004);
    tg.gain.exponentialRampToValueAtTime(0.0001, time + 0.25);
    tine.connect(tg).connect(nodes.epBus);
    for (const o of [car, mod, tine]) {
      o.start(time);
      o.stop(time + dur + 1.8);
    }
  }

  function piano(time, m, vel, dur) {
    const f0 = midi(m);
    const out = ac.createGain();
    out.gain.value = 0.085 * vel;
    const pan = ac.createStereoPanner();
    pan.pan.value = (m - 72) / 30;
    out.connect(pan).connect(nodes.music);
    const B = 0.00035;
    for (let n = 1; n <= 7; n++) {
      const o = ac.createOscillator();
      o.frequency.value = f0 * n * Math.sqrt(1 + B * n * n);
      const g = ac.createGain();
      const a = Math.pow(n, -1.5) * (n === 2 ? 1.1 : 1);
      const dec = (2.8 + dur) / Math.pow(n, 0.7);
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(a, time + 0.004 + n * 0.0015);
      g.gain.exponentialRampToValueAtTime(a * 0.4, time + 0.18);
      g.gain.exponentialRampToValueAtTime(0.0001, time + dec);
      o.connect(g).connect(out);
      o.start(time);
      o.stop(time + dec + 0.05);
    }
  }

  function pad(time, notes, dur) {
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.02, time + 1.8);
    g.gain.setValueAtTime(0.02, time + dur - 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur + 2.2);
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(500, time);
    f.frequency.linearRampToValueAtTime(1100, time + dur * 0.6);
    f.frequency.linearRampToValueAtTime(600, time + dur + 2);
    f.connect(g).connect(nodes.music);
    for (const m of notes) {
      for (const det of [-7, 7]) {
        const o = ac.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midi(m);
        o.detune.value = det;
        o.connect(f);
        o.start(time);
        o.stop(time + dur + 2.4);
      }
    }
  }

  // ------------------------------------------------------------------------------------
  // Sound effects
  // ------------------------------------------------------------------------------------
  function plip(time, vol, pan, pitch = 1) {
    const o = ac.createOscillator();
    const f0 = (650 + Math.random() * 900) * pitch;
    o.frequency.setValueAtTime(f0, time);
    o.frequency.exponentialRampToValueAtTime(f0 * (1.7 + Math.random() * 0.8), time + 0.035);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(vol, time + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.09 + Math.random() * 0.06);
    const p = ac.createStereoPanner();
    p.pan.value = pan;
    o.connect(g).connect(p).connect(nodes.sfx);
    o.start(time);
    o.stop(time + 0.2);
    // tiny splash click
    const s = ac.createBufferSource();
    s.buffer = clickBuf();
    const sg = ac.createGain();
    sg.gain.value = vol * 0.5;
    s.connect(sg).connect(p);
    s.start(time);
  }
  let _click = null;
  function clickBuf() {
    if (_click) return _click;
    const n = Math.floor(ac.sampleRate * 0.02);
    _click = ac.createBuffer(1, n, ac.sampleRate);
    const d = _click.getChannelData(0);
    let y = 0;
    for (let i = 0; i < n; i++) {
      y += (Math.random() * 2 - 1 - y) * 0.5;
      d[i] = y * Math.exp(-i / (n * 0.15));
    }
    return _click;
  }

  function bell(time, vol, pan, pitch) {
    const out = ac.createGain();
    out.gain.value = vol;
    const p = ac.createStereoPanner();
    p.pan.value = pan;
    out.connect(p).connect(nodes.sfx);
    const send = ac.createGain();
    send.gain.value = 0.6;
    out.connect(send).connect(nodes.reverb);
    for (const [r, a, d] of [[1, 1, 0.42], [2.76, 0.45, 0.22], [5.4, 0.22, 0.12], [8.9, 0.1, 0.07]]) {
      const o = ac.createOscillator();
      o.frequency.value = pitch * r;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(a, time + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, time + d);
      o.connect(g).connect(out);
      o.start(time);
      o.stop(time + d + 0.02);
    }
  }

  function thump(time, vol, pan) {
    const o = ac.createOscillator();
    o.frequency.setValueAtTime(110, time);
    o.frequency.exponentialRampToValueAtTime(55, time + 0.12);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(vol, time + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
    const p = ac.createStereoPanner();
    p.pan.value = pan;
    o.connect(g).connect(p).connect(nodes.sfx);
    o.start(time);
    o.stop(time + 0.2);
    const s = ac.createBufferSource();
    s.buffer = clickBuf();
    s.playbackRate.value = 0.35;
    const sg = ac.createGain();
    sg.gain.value = vol * 1.6;
    s.connect(sg).connect(p);
    s.start(time);
  }

  // ------------------------------------------------------------------------------------
  // Scheduler
  // ------------------------------------------------------------------------------------
  const BEAT = 60 / 64;
  let nextBar = 0, bar = 0, cycle = 0;
  let nextDrip = 0, nextBell = 0, bellAlt = 0, nextClack = 0;

  function scheduleMusic(until) {
    while (nextBar < until) {
      const b = bar % 8;
      const ch = CHORDS[b];
      const t = nextBar;
      const phase = cycle % 4; // 0: full, 1: full (B melody), 2: sparse, 3: breathing (pad only)
      pad(t, ch.notes.map((m) => m - 12).slice(0, 3), BEAT * 4);
      if (phase !== 3) {
        ep(t, ch.bass, 0.55, BEAT * 3);
        ch.notes.forEach((m, i) => ep(t + 0.035 * i + 0.02, m, 0.45 - i * 0.04, BEAT * 3));
        if (Math.random() < 0.7) ep(t + BEAT * 2.5, ch.notes[ch.notes.length - 1], 0.3, BEAT);
        if (Math.random() < 0.5) ep(t + BEAT * 3.0, ch.notes[1], 0.25, BEAT);
      } else {
        ep(t, ch.bass, 0.35, BEAT * 3);
      }
      const mel = phase === 1 ? MELODY_B : MELODY_A;
      if (phase === 0 || phase === 1 || phase === 2) {
        for (const [mb, beat, m, d] of mel) {
          if (mb !== b) continue;
          if (phase === 2 && Math.random() < 0.55) continue;
          const oct = phase === 2 ? 12 : 0;
          const swing = (Math.random() - 0.5) * 0.03;
          piano(t + beat * BEAT + swing, m + oct, 0.7 + Math.random() * 0.25, d * BEAT);
        }
      }
      nextBar += BEAT * 4;
      bar++;
      if (bar % 8 === 0) cycle++;
    }
  }

  function scheduleFx(until) {
    // eave drips near the listener
    while (nextDrip < until) {
      const rate = env.dripRate;
      if (rate > 0.05) plip(nextDrip, 0.05 + Math.random() * 0.12 * Math.min(1, rate), Math.random() * 1.6 - 0.8, Math.random() < 0.2 ? 1.8 : 1);
      nextDrip += (0.15 + Math.random() * 1.2) / Math.max(0.35, rate);
    }
    // crossing bell: "kan kan kan"
    if (env.bell > 0.001) {
      if (nextBell < ac.currentTime) nextBell = ac.currentTime + 0.05;
      while (nextBell < until) {
        bell(nextBell, env.bell * 0.38, env.bellPan || 0, bellAlt++ % 2 ? 745 : 732);
        nextBell += 0.43;
      }
    }
    // train wheel joints
    if (env.train > 0.02) {
      if (nextClack < ac.currentTime) nextClack = ac.currentTime + 0.05;
      while (nextClack < until) {
        const v = env.train * 0.5;
        thump(nextClack, v, env.trainPan || 0);
        thump(nextClack + 0.16, v * 0.8, env.trainPan || 0);
        nextClack += 1.25 + Math.random() * 0.1;
      }
    }
  }

  function tick() {
    if (!running) return;
    const now = ac.currentTime;
    const until = now + 0.35;
    scheduleMusic(until);
    scheduleFx(until);
  }

  // ------------------------------------------------------------------------------------
  return {
    async start() {
      if (!ac) build();
      await ac.resume();
      running = true;
      const now = ac.currentTime;
      if (nextBar < now) nextBar = now + 0.6;
      if (nextDrip < now) nextDrip = now + 0.3;
      nodes.master.gain.cancelScheduledValues(now);
      nodes.master.gain.setTargetAtTime(0.9, now, 1.2);
      if (!schedTimer) schedTimer = setInterval(tick, 90);
    },
    stop() {
      if (!ac) return;
      running = false;
      const now = ac.currentTime;
      nodes.master.gain.cancelScheduledValues(now);
      nodes.master.gain.setTargetAtTime(0, now, 0.25);
      clearInterval(schedTimer);
      schedTimer = null;
      setTimeout(() => {
        if (!running) ac.suspend();
      }, 1500);
    },
    update(t, camera, world) {
      if (!ac || !running) return;
      if (t - lastUpdate < 0.1) return;
      lastUpdate = t;
      const now = ac.currentTime;
      const cp = camera.position;
      // listener orientation for simple panning
      const fwd = { x: -camera.matrixWorld.elements[8], z: -camera.matrixWorld.elements[10] };
      const panOf = (p) => {
        const dx = p.x - cp.x, dz = p.z - cp.z;
        const l = Math.hypot(dx, dz) || 1;
        const rx = -fwd.z, rz = fwd.x;
        return Math.max(-0.9, Math.min(0.9, (dx * rx + dz * rz) / l));
      };
      // hum from the nearest vending machine
      let hd = 1e9;
      for (const h of world.hums) hd = Math.min(hd, dist(h, cp));
      const humLvl = 0.09 * Math.pow(Math.max(0, 1 - hd / 11), 2);
      nodes.hum.gain.setTargetAtTime(humLvl, now, 0.3);
      // eave drips density: count drip points near the listener
      let nd = 0;
      for (const d of world.drips) {
        const dx = d.x - cp.x, dz = d.z - cp.z;
        if (dx * dx + dz * dz < 80) nd++;
      }
      env.dripRate = Math.min(2.2, 0.25 + nd * 0.05);
      // under a roof the rain gets closer & duller
      const alt = Math.max(0, cp.y - world.groundAt(cp.x, cp.z));
      nodes.roarG.gain.setTargetAtTime(0.2 + Math.min(0.12, alt * 0.004), now, 0.5);
      // crossing bell & train
      const st = world.state;
      const cross = { x: 6, y: 2.5, z: -123 };
      const cd = dist(cross, cp);
      env.bell = st.crossing ? 1 / (1 + Math.pow(cd / 35, 2)) : 0;
      env.bellPan = panOf(cross);
      if (st.train && st.train.active) {
        const tp = { x: st.train.x - st.train.dir * 40, y: 1.5, z: st.train.z };
        const td = dist(tp, cp);
        env.train = 1 / (1 + Math.pow(td / 60, 2));
        env.trainPan = panOf(tp);
      } else env.train = 0;
      nodes.trG.gain.setTargetAtTime(env.train * 0.55, now, 0.4);
      nodes.trHG.gain.setTargetAtTime(env.train * 0.12, now, 0.4);
      nodes.trPan.pan.setTargetAtTime(env.trainPan || 0, now, 0.4);
      // gentle gusts
      const gust = 0.85 + 0.15 * Math.sin(t * 0.11) * Math.sin(t * 0.037 + 1.3);
      nodes.hissG.gain.setTargetAtTime(0.34 * gust, now, 1.0);
      nodes.texG.gain.setTargetAtTime(0.9 * gust, now, 1.0);
    },
  };
}
