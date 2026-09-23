import { noiseBuffer, reverbIR, dist } from './common.js';

// ---------------------------------------------------------------------------
// Recorded soundscape for the multi-file site: CC0 / public-domain field
// recordings and piano music (see site/audio/CREDITS.md), mixed live and
// driven by where the camera is in the street.
// ---------------------------------------------------------------------------
export function makeSampleAudio(base = 'audio/') {
  let ac = null, N = null, manifest = null;
  const buffers = {};
  let running = false, loading = null, lastUpdate = 0;
  let schedTimer = null;
  const env = { dripRate: 0.5, crossingOn: false };
  let crossingSrc = null;
  let nextDrop = 0;
  let music = { idx: 0, next: 0, src: null };

  async function loadAll() {
    manifest = await (await fetch(base + 'manifest.json')).json();
    const names = ['rain_street', 'rain_drain', 'roof_drips', 'gutter', 'drops', 'crossing'];
    await Promise.all(
      names.map(async (n) => {
        const r = await fetch(base + n + '.mp3');
        buffers[n] = await ac.decodeAudioData(await r.arrayBuffer());
      }),
    );
    // music can stream in later
    for (const n of ['gymnopedie', 'gnossienne']) {
      fetch(base + n + '.mp3')
        .then((r) => r.arrayBuffer())
        .then((b) => ac.decodeAudioData(b))
        .then((b) => (buffers[n] = b))
        .catch(() => {});
    }
  }

  function build() {
    ac = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' });
    const master = ac.createGain();
    master.gain.value = 0;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 2.5;
    master.connect(comp).connect(ac.destination);
    const tap = ac.createAnalyser();
    tap.fftSize = 2048;
    comp.connect(tap);
    window.__audioTap = tap;
    const reverb = ac.createConvolver();
    reverb.buffer = reverbIR(ac, 2.8, 2.6);
    const rv = ac.createGain();
    rv.gain.value = 0.7;
    reverb.connect(rv).connect(master);
    const sfx = ac.createGain();
    sfx.gain.value = 0.82;
    sfx.connect(master);
    const musicBus = ac.createGain();
    musicBus.gain.value = 0.72;
    const mlp = ac.createBiquadFilter();
    mlp.type = 'lowpass';
    mlp.frequency.value = 6500;
    musicBus.connect(mlp).connect(master);
    const mSend = ac.createGain();
    mSend.gain.value = 0.28;
    mlp.connect(mSend).connect(reverb);

    // synthesized vending machine hum (no good CC0 recording of a Japanese jihanki)
    const hum = ac.createGain();
    hum.gain.value = 0;
    const humF = ac.createBiquadFilter();
    humF.type = 'lowpass';
    humF.frequency.value = 480;
    for (const [f, a] of [[60, 0.5], [120, 0.32], [180, 0.14]]) {
      const o = ac.createOscillator();
      o.frequency.value = f;
      const g = ac.createGain();
      g.gain.value = a;
      o.connect(g).connect(humF);
      o.start();
    }
    humF.connect(hum).connect(sfx);
    // train rumble for trains away from the crossing
    const br = ac.createBufferSource();
    br.buffer = noiseBuffer(ac, 6, 'brown');
    br.loop = true;
    const brf = ac.createBiquadFilter();
    brf.type = 'lowpass';
    brf.frequency.value = 200;
    const trG = ac.createGain();
    trG.gain.value = 0;
    const trPan = ac.createStereoPanner();
    br.connect(brf).connect(trG).connect(trPan).connect(sfx);
    br.start();
    N = { master, reverb, sfx, musicBus, hum, trG, trPan };
    window.__audioNodes = { sfx, musicBus };
  }

  function loopSrc(name, gain, rate = 1) {
    const s = ac.createBufferSource();
    s.buffer = buffers[name];
    s.loop = true;
    const m = manifest[name];
    if (m && m.loopEnd) {
      s.loopStart = m.loopStart;
      s.loopEnd = Math.min(m.loopEnd, s.buffer.duration);
    }
    s.playbackRate.value = rate;
    const g = ac.createGain();
    g.gain.value = gain;
    s.connect(g).connect(N.sfx);
    s.start(ac.currentTime + 0.05, (m ? m.loopStart : 0) + Math.random() * 5);
    return g;
  }

  function startBeds() {
    if (N.beds) return;
    N.beds = {
      street: loopSrc('rain_street', 0.9),
      drain: loopSrc('rain_drain', 0.32),
      roof: loopSrc('roof_drips', 0.0),
      gutter: loopSrc('gutter', 0.0),
    };
  }

  function drop(time, vol, pan) {
    const sp = manifest.drops.sprites;
    const [off, len] = sp[Math.floor(Math.random() * sp.length)];
    const s = ac.createBufferSource();
    s.buffer = buffers.drops;
    s.playbackRate.value = 0.85 + Math.random() * 0.35;
    const g = ac.createGain();
    g.gain.value = vol;
    const p = ac.createStereoPanner();
    p.pan.value = pan;
    s.connect(g).connect(p).connect(N.sfx);
    const send = ac.createGain();
    send.gain.value = 0.15;
    g.connect(send).connect(N.reverb);
    s.start(time, off, len);
  }

  function startCrossing(offset, vol, pan) {
    const s = ac.createBufferSource();
    s.buffer = buffers.crossing;
    const g = ac.createGain();
    g.gain.value = vol;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 12000;
    const p = ac.createStereoPanner();
    p.pan.value = pan;
    s.connect(lp).connect(g).connect(p).connect(N.sfx);
    const send = ac.createGain();
    send.gain.value = 0.35;
    g.connect(send).connect(N.reverb);
    s.start(ac.currentTime + 0.05, Math.max(0, offset));
    crossingSrc = { s, g, lp, p };
    s.onended = () => {
      if (crossingSrc && crossingSrc.s === s) crossingSrc = null;
    };
  }

  function scheduleMusic() {
    const now = ac.currentTime;
    if (music.src || now < music.next) return;
    const order = ['gymnopedie', 'gnossienne'];
    const name = order[music.idx % order.length];
    const b = buffers[name];
    if (!b) return;
    const s = ac.createBufferSource();
    s.buffer = b;
    s.connect(N.musicBus);
    s.start(now + 0.1);
    music.src = s;
    s.onended = () => {
      music.src = null;
      music.idx++;
      // a long rainy pause between pieces
      music.next = ac.currentTime + 35 + Math.random() * 30;
    };
  }

  function tick() {
    if (!running || !manifest) return;
    const now = ac.currentTime;
    const until = now + 0.4;
    while (nextDrop < until) {
      if (nextDrop > now - 0.1) drop(nextDrop, 0.12 + Math.random() * 0.3 * Math.min(1, env.dripRate), Math.random() * 1.6 - 0.8);
      nextDrop += (0.18 + Math.random() * 1.4) / Math.max(0.3, env.dripRate);
    }
    scheduleMusic();
  }

  return {
    async start() {
      if (!ac) build();
      await ac.resume();
      running = true;
      if (!loading) loading = loadAll();
      await loading;
      if (!running) return;
      startBeds();
      const now = ac.currentTime;
      nextDrop = now + 0.5;
      if (!music.src && music.next < now) music.next = now + 4;
      N.master.gain.cancelScheduledValues(now);
      N.master.gain.setTargetAtTime(0.95, now, 1.2);
      if (!schedTimer) schedTimer = setInterval(tick, 100);
    },
    stop() {
      if (!ac) return;
      running = false;
      const now = ac.currentTime;
      N.master.gain.cancelScheduledValues(now);
      N.master.gain.setTargetAtTime(0, now, 0.25);
      clearInterval(schedTimer);
      schedTimer = null;
      setTimeout(() => {
        if (!running) ac.suspend();
      }, 1500);
    },
    update(t, camera, world) {
      if (!ac || !running || !N.beds) return;
      if (t - lastUpdate < 0.1) return;
      lastUpdate = t;
      const now = ac.currentTime;
      const cp = camera.position;
      const fwd = { x: -camera.matrixWorld.elements[8], z: -camera.matrixWorld.elements[10] };
      const panOf = (p) => {
        const dx = p.x - cp.x, dz = p.z - cp.z;
        const l = Math.hypot(dx, dz) || 1;
        return Math.max(-0.85, Math.min(0.85, (dx * -fwd.z + dz * fwd.x) / l));
      };
      // drips & roof runoff near the listener
      let nd = 0;
      for (const d of world.drips) {
        const dx = d.x - cp.x, dz = d.z - cp.z;
        if (dx * dx + dz * dz < 80) nd++;
      }
      env.dripRate = Math.min(2.2, 0.2 + nd * 0.045);
      N.beds.roof.gain.setTargetAtTime(Math.min(0.55, 0.08 + nd * 0.012), now, 0.6);
      // gutter water: nearest down-pipe / gutter
      let gd = 1e9;
      for (const s of world.spouts) gd = Math.min(gd, dist(s, cp));
      N.beds.gutter.gain.setTargetAtTime(0.05 + 0.5 * Math.pow(Math.max(0, 1 - gd / 9), 2), now, 0.5);
      // higher up = less close patter
      const alt = Math.max(0, cp.y - world.groundAt(cp.x, cp.z));
      N.beds.street.gain.setTargetAtTime(0.9 - Math.min(0.3, alt * 0.01), now, 0.8);
      // vending machine hum
      let hd = 1e9;
      for (const h of world.hums) hd = Math.min(hd, dist(h, cp));
      N.hum.gain.setTargetAtTime(0.08 * Math.pow(Math.max(0, 1 - hd / 11), 2), now, 0.3);
      // crossing bell + train pass-by, synced so the roar lands when the train reaches the crossing
      const st = world.state;
      const cross = { x: 6, y: 2, z: -123 };
      const cd = dist(cross, cp);
      const vol = 1.1 / (1 + Math.pow(cd / 30, 2));
      if (st.crossing && !env.crossingOn) {
        env.crossingOn = true;
        const eta = st.train ? Math.abs(st.train.x - 6) / 15 : 12;
        startCrossing(manifest.crossing.trainPeak - eta, vol, panOf(cross));
      } else if (!st.crossing) env.crossingOn = false;
      if (crossingSrc) {
        crossingSrc.g.gain.setTargetAtTime(vol, now, 0.3);
        crossingSrc.p.pan.setTargetAtTime(panOf(cross), now, 0.3);
        crossingSrc.lp.frequency.setTargetAtTime(1500 + 12000 / (1 + cd / 40), now, 0.3);
      }
      if (st.train && st.train.active) {
        const tp = { x: st.train.x - st.train.dir * 40, y: 1.5, z: st.train.z };
        const td = dist(tp, cp);
        N.trG.gain.setTargetAtTime(0.5 / (1 + Math.pow(td / 60, 2)), now, 0.4);
        N.trPan.pan.setTargetAtTime(panOf(tp), now, 0.4);
      } else N.trG.gain.setTargetAtTime(0, now, 0.6);
    },
  };
}
