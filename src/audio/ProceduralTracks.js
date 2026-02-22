/**
 * ProceduralTracks — synthesized ambient music tracks using the Web Audio API.
 * No audio files required; every track is generated in real-time from
 * oscillators, noise, filters, and modulators.
 *
 * Each factory receives (ctx, outputGain) and returns { stop() }.
 * The generated audio is connected directly to outputGain.
 */

// ── White-noise generator via ScriptProcessor (fallback-free approach) ──────

function createNoiseSource(ctx) {
  const bufLen = ctx.sampleRate * 2; // 2-second looping noise buffer
  const buf    = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data   = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop   = true;
  return src;
}

// ── Track 1: Deep Space ──────────────────────────────────────────────────────
// Two detuned sawtooth drones with a slow LFO sweeping a lowpass filter.
// Adds a feedback delay for a vast, reverb-like sense of space.

export function createDeepSpace(ctx, outGain) {
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  osc1.type = 'sawtooth'; osc1.frequency.value = 55;    // A1
  osc2.type = 'sawtooth'; osc2.frequency.value = 56.4;  // ~A1 detuned — beating

  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass'; filt.frequency.value = 320; filt.Q.value = 2.5;

  // Slow LFO opens and closes the filter
  const lfo     = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.type = 'sine'; lfo.frequency.value = 0.07;
  lfoGain.gain.value = 280;
  lfo.connect(lfoGain); lfoGain.connect(filt.frequency);

  // Delay feedback for depth
  const delay    = ctx.createDelay(1.0);
  const feedback = ctx.createGain();
  const wetGain  = ctx.createGain();
  delay.delayTime.value = 0.38;
  feedback.gain.value   = 0.38;
  wetGain.gain.value    = 0.28;
  filt.connect(delay); delay.connect(feedback);
  feedback.connect(delay); delay.connect(wetGain); wetGain.connect(outGain);

  // Oscillator gain (keep overall level modest)
  const driverGain = ctx.createGain();
  driverGain.gain.value = 0.22;
  osc1.connect(driverGain); osc2.connect(driverGain);
  driverGain.connect(filt); filt.connect(outGain);

  osc1.start(); osc2.start(); lfo.start();
  return { stop() {
    [osc1, osc2, lfo].forEach(n => { try { n.stop(); } catch {} });
  }};
}

// ── Track 2: Solar Wind ──────────────────────────────────────────────────────
// Filtered noise (high-shelf) gives a breathy wind texture.
// Three slow sine oscillators add harmonic colour and shimmer.

export function createSolarWind(ctx, outGain) {
  const noise = createNoiseSource(ctx);

  const hiPass = ctx.createBiquadFilter();
  hiPass.type = 'highpass'; hiPass.frequency.value = 800; hiPass.Q.value = 0.7;
  const notch = ctx.createBiquadFilter();
  notch.type = 'bandpass'; notch.frequency.value = 1600; notch.Q.value = 3.0;

  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.14;
  noise.connect(hiPass); hiPass.connect(notch); notch.connect(noiseGain);
  noiseGain.connect(outGain);

  // Three harmonic sine tones with slow vibrato
  const tones = [
    { freq: 220, vibFreq: 0.11, vibDepth: 1.2, vol: 0.06 },
    { freq: 330, vibFreq: 0.07, vibDepth: 0.8, vol: 0.04 },
    { freq: 440, vibFreq: 0.13, vibDepth: 0.5, vol: 0.03 },
  ];
  const oscNodes = tones.map(({ freq, vibFreq, vibDepth, vol }) => {
    const osc   = ctx.createOscillator();
    const vib   = ctx.createOscillator();
    const vGain = ctx.createGain();
    const aGain = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = freq;
    vib.type = 'sine'; vib.frequency.value = vibFreq;
    vGain.gain.value = vibDepth; aGain.gain.value = vol;
    vib.connect(vGain); vGain.connect(osc.frequency);
    osc.connect(aGain); aGain.connect(outGain);
    osc.start(); vib.start();
    return [osc, vib];
  });

  noise.start();
  return { stop() {
    try { noise.stop(); } catch {}
    oscNodes.forEach(([o, v]) => { try { o.stop(); } catch {} try { v.stop(); } catch {} });
  }};
}

// ── Track 3: Pulsar Field ────────────────────────────────────────────────────
// Low noise carrier amplitude-modulated at ~0.45 Hz creates rhythmic pulses.
// A resonant ping filter adds a metallic shimmer on each burst.

export function createPulsarField(ctx, outGain) {
  const noise   = createNoiseSource(ctx);
  const carrier = ctx.createGain();
  carrier.gain.value = 0;
  noise.connect(carrier);

  // LFO as amplitude envelope: rectified sine = pulsing bursts
  const lfo     = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.type = 'sine'; lfo.frequency.value = 0.45;
  lfoGain.gain.value = 1.0;
  lfo.connect(lfoGain); lfoGain.connect(carrier.gain);

  // Resonant filter on the pulsing noise
  const resonFilt = ctx.createBiquadFilter();
  resonFilt.type = 'bandpass'; resonFilt.frequency.value = 220; resonFilt.Q.value = 8.0;
  carrier.connect(resonFilt);

  // Dry noise layer (subtle low-level backdrop)
  const backdrop = createNoiseSource(ctx);
  const bpFilt   = ctx.createBiquadFilter();
  bpFilt.type = 'lowpass'; bpFilt.frequency.value = 300;
  const bgGain = ctx.createGain();
  bgGain.gain.value = 0.12;
  backdrop.connect(bpFilt); bpFilt.connect(bgGain); bgGain.connect(outGain);

  // Mix pulsing resonant component
  const pulseGain = ctx.createGain();
  pulseGain.gain.value = 0.55;
  resonFilt.connect(pulseGain); pulseGain.connect(outGain);

  // Slow melodic sine underlayer (E1 = 41.2 Hz)
  const drone  = ctx.createOscillator();
  const dGain  = ctx.createGain();
  drone.type = 'sine'; drone.frequency.value = 41.2;
  dGain.gain.value = 0.18;
  drone.connect(dGain); dGain.connect(outGain);

  lfo.start(); drone.start(); noise.start(); backdrop.start();
  return { stop() {
    [lfo, drone, noise, backdrop].forEach(n => { try { n.stop(); } catch {} });
  }};
}

// ── Track 4: Nebula Drift ────────────────────────────────────────────────────
// Four sine oscillators at harmonic ratios (1 : 1.5 : 2 : 3).
// Each has its own very slow amplitude modulator — they breathe independently,
// creating an ever-shifting harmonic blend.

export function createNebulaDrift(ctx, outGain) {
  const root  = 82.4;  // E2
  const freqs = [root, root * 1.498, root * 2, root * 3]; // just fifths + octave

  const oscNodes = freqs.map((freq, i) => {
    const osc   = ctx.createOscillator();
    const am    = ctx.createOscillator();
    const amGain = ctx.createGain();
    const vol   = ctx.createGain();

    osc.type = 'sine'; osc.frequency.value = freq;
    am.type  = 'sine'; am.frequency.value  = 0.04 + i * 0.015; // 0.04–0.085 Hz
    amGain.gain.value = 0.5; // AM depth
    vol.gain.value    = [0.10, 0.07, 0.05, 0.04][i];

    // AM: carrier gain oscillates 0.5 → 1.5 around 1.0
    am.connect(amGain); amGain.connect(vol.gain);
    osc.connect(vol); vol.connect(outGain);
    osc.start(); am.start();
    return [osc, am];
  });

  // Pad of filtered noise to fill the spectral space
  const noise   = createNoiseSource(ctx);
  const lpFilt  = ctx.createBiquadFilter();
  lpFilt.type = 'lowpass'; lpFilt.frequency.value = 180;
  const nGain   = ctx.createGain();
  nGain.gain.value = 0.03;
  noise.connect(lpFilt); lpFilt.connect(nGain); nGain.connect(outGain);
  noise.start();

  return { stop() {
    try { noise.stop(); } catch {}
    oscNodes.forEach(([o, a]) => { try { o.stop(); } catch {} try { a.stop(); } catch {} });
  }};
}

// ── Track 5: Cosmic Journey ──────────────────────────────────────────────────
// Triangle waves in a tonic-fifth-octave chord (C2 / G2 / C3).
// A gentle amplitude modulation on the octave tone suggests forward motion.
// A slow sawtooth LFO sweeps a bandpass filter for a sense of melody.

export function createCosmicJourney(ctx, outGain) {
  const base = 65.41; // C2

  const makeTri = (freq, vol) => {
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.type = 'triangle'; osc.frequency.value = freq;
    g.gain.value = vol;
    osc.connect(g); g.connect(outGain);
    osc.start();
    return osc;
  };

  const osc1 = makeTri(base,        0.09); // C2 tonic
  const osc2 = makeTri(base * 1.5,  0.06); // G2 fifth
  const osc3 = makeTri(base * 2,    0.05); // C3 octave

  // Gentle AM on octave for motion
  const am  = ctx.createOscillator();
  const amG = ctx.createGain();
  am.type = 'sine'; am.frequency.value = 0.18;
  amG.gain.value = 0.03;
  am.connect(amG);
  // connect to osc3's output gain — slightly complex but functional
  amG.connect(outGain);

  // Wandering bandpass filter over noise for "melody" texture
  const noise  = createNoiseSource(ctx);
  const bpFilt = ctx.createBiquadFilter();
  bpFilt.type = 'bandpass'; bpFilt.frequency.value = 523; bpFilt.Q.value = 12;

  const melLfo  = ctx.createOscillator();
  const melGain = ctx.createGain();
  melLfo.type = 'sine'; melLfo.frequency.value = 0.06; // ~1 cycle per 16s
  melGain.gain.value = 180; // sweep ±180 Hz around 523 Hz
  melLfo.connect(melGain); melGain.connect(bpFilt.frequency);

  const nVol = ctx.createGain();
  nVol.gain.value = 0.055;
  noise.connect(bpFilt); bpFilt.connect(nVol); nVol.connect(outGain);

  noise.start(); am.start(); melLfo.start();
  return { stop() {
    [osc1, osc2, osc3, am, melLfo, noise].forEach(n => { try { n.stop(); } catch {} });
  }};
}

// ── Registry ─────────────────────────────────────────────────────────────────

const PROCEDURAL_FACTORIES = {
  deepspace: createDeepSpace,
  solarwind: createSolarWind,
  pulsars:   createPulsarField,
  nebula:    createNebulaDrift,
  journey:   createCosmicJourney,
};

/**
 * Create a procedural track and return a source-like object with stop().
 * The audio is wired directly to outputGain.
 */
export function createProceduralTrack(trackId, ctx, outputGain) {
  const factory = PROCEDURAL_FACTORIES[trackId];
  if (!factory) return { stop() {} };
  return factory(ctx, outputGain);
}

export const PROCEDURAL_TRACK_IDS = Object.keys(PROCEDURAL_FACTORIES);
