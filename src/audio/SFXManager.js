/**
 * SFXManager — Procedural sound effects for OzMos
 * All effects are synthesized via Web Audio API (no files required).
 * Shares the AudioContext from AudioManager.
 */
export class SFXManager {
  constructor(audioContext) {
    this._ctx = audioContext;
    this._enabled = true;
    this._volume = 0.35; // master SFX volume (0–1)
  }

  setEnabled(enabled) { this._enabled = enabled; }
  setVolume(v) { this._volume = Math.max(0, Math.min(1, v)); }
  isEnabled() { return this._enabled; }

  /** Resume context if suspended (iOS/mobile requirement) */
  async _resume() {
    if (this._ctx?.state === 'suspended') await this._ctx.resume();
  }

  /**
   * Planet / body selected — subtle bell chime
   * 220Hz sine, short attack, 300ms decay
   */
  async playPlanetSelect() {
    if (!this._enabled || !this._ctx) return;
    await this._resume();
    const now = this._ctx.currentTime;
    const osc = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.connect(gain);
    gain.connect(this._ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(380, now + 0.15);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(this._volume * 0.25, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  /**
   * Cross-section panel opened — deep resonant tone
   * 80Hz sine, slow attack, 600ms sustain
   */
  async playCrossSectionOpen() {
    if (!this._enabled || !this._ctx) return;
    await this._resume();
    const now = this._ctx.currentTime;
    const osc = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.connect(gain);
    gain.connect(this._ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(this._volume * 0.3, now + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
    osc.start(now);
    osc.stop(now + 0.75);
  }

  /**
   * Solar storm starting — low rumble + electrical crackle
   */
  async playStormStart() {
    if (!this._enabled || !this._ctx) return;
    await this._resume();
    const now = this._ctx.currentTime;

    // Sub-bass rumble
    const rumble = this._ctx.createOscillator();
    const rumbleGain = this._ctx.createGain();
    rumble.connect(rumbleGain);
    rumbleGain.connect(this._ctx.destination);
    rumble.type = 'sawtooth';
    rumble.frequency.setValueAtTime(40, now);
    rumble.frequency.linearRampToValueAtTime(55, now + 1.5);
    rumbleGain.gain.setValueAtTime(0, now);
    rumbleGain.gain.linearRampToValueAtTime(this._volume * 0.4, now + 0.3);
    rumbleGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.0);
    rumble.start(now);
    rumble.stop(now + 2.1);

    // Electrical crackle via noise burst
    const bufferSize = this._ctx.sampleRate * 0.08;
    const buffer = this._ctx.createBuffer(1, bufferSize, this._ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.6;
    const noise = this._ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = this._ctx.createGain();
    noiseGain.gain.setValueAtTime(this._volume * 0.5, now + 0.05);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    noise.connect(noiseGain);
    noiseGain.connect(this._ctx.destination);
    noise.start(now + 0.05);
  }

  /**
   * Solar storm ending — low rumble fade-out
   */
  async playStormEnd() {
    if (!this._enabled || !this._ctx) return;
    await this._resume();
    const now = this._ctx.currentTime;
    const osc = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.connect(gain);
    gain.connect(this._ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(55, now);
    osc.frequency.exponentialRampToValueAtTime(25, now + 1.2);
    gain.gain.setValueAtTime(this._volume * 0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.3);
    osc.start(now);
    osc.stop(now + 1.4);
  }

  /**
   * Flyby starting — doppler-shifted whoosh
   */
  async playFlybyStart() {
    if (!this._enabled || !this._ctx) return;
    await this._resume();
    const now = this._ctx.currentTime;
    const osc = this._ctx.createOscillator();
    const filter = this._ctx.createBiquadFilter();
    const gain = this._ctx.createGain();
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this._ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.8);
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(600, now);
    filter.frequency.exponentialRampToValueAtTime(200, now + 0.8);
    filter.Q.setValueAtTime(2, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(this._volume * 0.3, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
    osc.start(now);
    osc.stop(now + 1.0);
  }

  /**
   * Speed changed — subtle confirmation tick
   */
  async playSpeedChange() {
    if (!this._enabled || !this._ctx) return;
    await this._resume();
    const now = this._ctx.currentTime;
    const osc = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.connect(gain);
    gain.connect(this._ctx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(1200, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(this._volume * 0.1, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  /**
   * Tour next stop — soft chime
   */
  async playTourChime() {
    if (!this._enabled || !this._ctx) return;
    await this._resume();
    const now = this._ctx.currentTime;
    // Two-note chime: perfect fifth
    for (const [freq, delay] of [[660, 0], [990, 0.12]]) {
      const osc = this._ctx.createOscillator();
      const gain = this._ctx.createGain();
      osc.connect(gain);
      gain.connect(this._ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + delay);
      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(this._volume * 0.2, now + delay + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.5);
      osc.start(now + delay);
      osc.stop(now + delay + 0.55);
    }
  }

  /**
   * Generic UI button tap — minimal click
   */
  async playUIClick() {
    if (!this._enabled || !this._ctx) return;
    await this._resume();
    const now = this._ctx.currentTime;
    const osc = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.connect(gain);
    gain.connect(this._ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(900, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(this._volume * 0.08, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  /**
   * Chorus waves — detuned sines for Earth focus sonification
   * 6 oscillators with LFO sweep, 8-second fade
   */
  playChorusWaves() {
    if (!this._enabled || !this._ctx) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0, now);
    gain.gain.linearRampToValueAtTime(this._volume * 0.08, now + 1.0);
    gain.gain.linearRampToValueAtTime(0.0, now + 8.0);
    gain.connect(ctx.destination);

    // 6 detuned sines for chorus
    const freqs = [300, 303, 350, 354, 600, 597];
    // LFO sweep
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.15;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 30;
    lfo.connect(lfoGain);

    for (const freq of freqs) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      lfoGain.connect(osc.frequency);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 8.5);
    }
    lfo.start(now);
    lfo.stop(now + 8.5);
  }

  /**
   * Jupiter lightning — sharp noise burst with low-freq resonance
   */
  playJupiterLightning() {
    if (!this._enabled || !this._ctx) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;
    const bufferSize = Math.floor(ctx.sampleRate * 0.15);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 80;
    filter.Q.value = 3;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(this._volume * 0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
  }

  /**
   * Magnetic reconnection — chirp tone descending 800→200Hz
   */
  playMagneticReconnection() {
    if (!this._enabled || !this._ctx) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.15);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(this._volume * 0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.22);
  }
}
