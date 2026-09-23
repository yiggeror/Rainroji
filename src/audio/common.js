// Shared Web Audio helpers for both sound versions.

export function noiseBuffer(ctx, secs, kind = 'white', channels = 2) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * secs);
  const buf = ctx.createBuffer(channels, n, sr);
  for (let c = 0; c < channels; c++) {
    const d = buf.getChannelData(c);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      } else if (kind === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w * 0.5;
    }
    // smooth loop seam
    const f = Math.min(2048, n >> 3);
    for (let i = 0; i < f; i++) {
      const t = i / f;
      d[i] = d[i] * t + d[n - f + i] * (1 - t);
    }
  }
  return buf;
}

// Algorithmic reverb impulse: decaying stereo noise with a darker tail
export function reverbIR(ctx, secs = 3.2, decay = 2.6) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * secs);
  const buf = ctx.createBuffer(2, n, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const w = Math.random() * 2 - 1;
      const k = 0.35 + 0.6 * t; // tail gets darker
      lp = lp + (w - lp) * (1 - k);
      d[i] = lp * Math.pow(1 - t, decay) * (i < sr * 0.012 ? i / (sr * 0.012) : 1);
    }
  }
  return buf;
}

// Pre-rendered rain texture: thousands of tiny droplet ticks and plinks, loopable
export function rainTexture(ctx, secs = 14, density = 1300) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * secs);
  const buf = ctx.createBuffer(2, n, sr);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  const events = Math.floor(secs * density);
  for (let e = 0; e < events; e++) {
    const t0 = Math.floor(Math.random() * n);
    const near = Math.random() < 0.035;
    const amp = near ? 0.12 + Math.random() * 0.25 : Math.pow(Math.random(), 2.5) * 0.09 + 0.004;
    const pan = Math.random();
    const gl = Math.cos(pan * Math.PI * 0.5), gr = Math.sin(pan * Math.PI * 0.5);
    if (Math.random() < 0.72) {
      // tick: a short burst of filtered noise
      const len = Math.floor(sr * (0.001 + Math.random() * (near ? 0.01 : 0.004)));
      const tau = len * 0.3;
      let y = 0;
      const k = 0.2 + Math.random() * 0.6;
      for (let i = 0; i < len; i++) {
        y = y + ((Math.random() * 2 - 1) - y) * k;
        const v = y * amp * Math.exp(-i / tau);
        const j = (t0 + i) % n;
        L[j] += v * gl;
        R[j] += v * gr;
      }
    } else {
      // plink: a damped sine chirping upwards (small drop into water)
      const f0 = 900 + Math.random() * 3200;
      const len = Math.floor(sr * (0.012 + Math.random() * 0.03));
      const tau = len * 0.35;
      let ph = 0;
      for (let i = 0; i < len; i++) {
        const f = f0 * (1 + (i / len) * 0.9);
        ph += (2 * Math.PI * f) / sr;
        const v = Math.sin(ph) * amp * 0.6 * Math.exp(-i / tau);
        const j = (t0 + i) % n;
        L[j] += v * gl;
        R[j] += v * gr;
      }
    }
  }
  return buf;
}

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

// Tiny helper to glide an AudioParam
export function glide(p, v, ctx, tc = 0.3) {
  p.cancelScheduledValues(ctx.currentTime);
  p.setTargetAtTime(v, ctx.currentTime, tc);
}

// Waves washing against the sea wall / beach: low surf + a fizzing wash that
// rise and fall on a slow swell. update(t, level) sets how close the shore is.
export function makeSea(ac, dest) {
  const buf = noiseBuffer(ac, 9, 'brown');
  const pink = noiseBuffer(ac, 7, 'pink');
  const mk = (b, rate) => {
    const s = ac.createBufferSource();
    s.buffer = b;
    s.loop = true;
    s.playbackRate.value = rate;
    s.start(ac.currentTime + 0.05, Math.random() * b.duration);
    return s;
  };
  const surf = mk(buf, 0.7);
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 520;
  const surfG = ac.createGain();
  surfG.gain.value = 0;
  surf.connect(lp).connect(surfG).connect(dest);
  const wash = mk(pink, 0.9);
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1500;
  bp.Q.value = 0.6;
  const washG = ac.createGain();
  washG.gain.value = 0;
  wash.connect(bp).connect(washG).connect(dest);
  return {
    update(t, level) {
      const now = ac.currentTime;
      // a swell every ~8 s: the wash follows the surf and then drains away
      const ph = (t / 8.3) % 1;
      const swell = Math.pow(Math.sin(Math.PI * ph), 2);
      const drain = Math.pow(Math.max(0, Math.sin(Math.PI * (ph - 0.18))), 3);
      surfG.gain.setTargetAtTime(level * (0.08 + 0.2 * swell), now, 0.4);
      washG.gain.setTargetAtTime(level * (0.015 + 0.09 * drain), now, 0.3);
      lp.frequency.setTargetAtTime(380 + 420 * swell, now, 0.5);
    },
  };
}
