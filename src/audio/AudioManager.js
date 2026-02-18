/**
 * AudioManager — multi-track music system with crossfade and context-aware switching.
 * Uses Web Audio API with per-track gain nodes and a master gain.
 */

const STORAGE_KEY = 'ozmos-music-muted';
const VOLUME_KEY = 'ozmos-music-volume';
const TRACK_KEY = 'ozmos-music-track';
const AUTO_KEY = 'ozmos-music-auto';

const TRACK_PATHS = {
  calm: '/audio/ambient.mp3',
  epic: '/audio/epic.mp3',
  contemplative: '/audio/contemplative.mp3',
};

const CONTEXT_TRACKS = {
  overview: 'calm',
  planet: 'contemplative',
  mission: 'epic',
};

class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.tracks = new Map(); // id -> { buffer, gain, source }
    this.currentTrack = null;
    this.loaded = false;
    this.playing = false;

    // Restore persisted state
    const storedMuted = localStorage.getItem(STORAGE_KEY);
    this.muted = storedMuted === null ? false : storedMuted === 'true';

    const storedVolume = localStorage.getItem(VOLUME_KEY);
    this._volume = storedVolume !== null ? parseFloat(storedVolume) : 0.3;

    const storedTrack = localStorage.getItem(TRACK_KEY);
    this._preferredTrack = storedTrack || 'epic';

    const storedAuto = localStorage.getItem(AUTO_KEY);
    this.autoSwitch = storedAuto === null ? true : storedAuto === 'true';

    this._crossfadeDuration = 2.5;
    this._rampTime = 0.5;
  }

  /** Initialize AudioContext (must be called after user interaction). */
  async init() {
    if (this.ctx) return;

    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : this._volume;
      this.masterGain.connect(this.ctx.destination);
    } catch {
      return;
    }

    // Load all tracks in parallel
    const loadPromises = Object.entries(TRACK_PATHS).map(async ([id, path]) => {
      try {
        const response = await fetch(path);
        if (!response.ok) return;
        const arrayBuffer = await response.arrayBuffer();
        const buffer = await this.ctx.decodeAudioData(arrayBuffer);

        const gain = this.ctx.createGain();
        gain.gain.value = 0;
        gain.connect(this.masterGain);

        this.tracks.set(id, { buffer, gain, source: null });
      } catch {
        // Track not available — skip silently
      }
    });

    await Promise.all(loadPromises);
    this.loaded = this.tracks.size > 0;

    // Auto-play if user previously opted in (not muted)
    if (this.loaded && !this.muted) {
      this._playTrack(this._preferredTrack);
    }
  }

  _startSource(trackId) {
    const track = this.tracks.get(trackId);
    if (!track || !track.buffer) return;

    // Stop existing source for this track
    if (track.source) {
      try { track.source.stop(); } catch {}
    }
    track.source = this.ctx.createBufferSource();
    track.source.buffer = track.buffer;
    track.source.loop = true;
    track.source.connect(track.gain);
    track.source.start(0);
  }

  _playTrack(trackId) {
    if (!this.loaded) return;
    if (!this.tracks.has(trackId)) {
      // Fallback to calm if requested track unavailable
      trackId = 'calm';
      if (!this.tracks.has(trackId)) {
        // Use first available track
        trackId = this.tracks.keys().next().value;
        if (!trackId) return;
      }
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    if (this.currentTrack === trackId && this.playing) return;

    if (this.currentTrack && this.currentTrack !== trackId) {
      this.crossfadeTo(trackId);
    } else {
      this._startSource(trackId);
      const track = this.tracks.get(trackId);
      track.gain.gain.cancelScheduledValues(this.ctx.currentTime);
      track.gain.gain.setValueAtTime(0, this.ctx.currentTime);
      track.gain.gain.linearRampToValueAtTime(1, this.ctx.currentTime + this._rampTime);
      this.currentTrack = trackId;
      this.playing = true;
    }
  }

  /** Equal-power crossfade between current and target track */
  crossfadeTo(trackId, duration) {
    if (!this.loaded || !this.tracks.has(trackId)) return;
    duration = duration || this._crossfadeDuration;

    const now = this.ctx.currentTime;

    // Fade out current
    if (this.currentTrack) {
      const oldTrack = this.tracks.get(this.currentTrack);
      if (oldTrack) {
        oldTrack.gain.gain.cancelScheduledValues(now);
        oldTrack.gain.gain.setValueAtTime(oldTrack.gain.gain.value, now);
        oldTrack.gain.gain.linearRampToValueAtTime(0, now + duration);
        // Stop old source after fade
        const oldSource = oldTrack.source;
        setTimeout(() => {
          try { if (oldSource) oldSource.stop(); } catch {}
        }, duration * 1000 + 100);
      }
    }

    // Start and fade in new
    this._startSource(trackId);
    const newTrack = this.tracks.get(trackId);
    newTrack.gain.gain.cancelScheduledValues(now);
    newTrack.gain.gain.setValueAtTime(0, now);
    newTrack.gain.gain.linearRampToValueAtTime(1, now + duration);

    this.currentTrack = trackId;
    this.playing = true;
    localStorage.setItem(TRACK_KEY, trackId);
  }

  /** Context-aware auto-switching */
  setContext(context) {
    if (!this.autoSwitch || this.muted) return;
    const targetTrack = CONTEXT_TRACKS[context];
    if (targetTrack && targetTrack !== this.currentTrack) {
      this.crossfadeTo(targetTrack);
    }
  }

  play() {
    if (!this.loaded) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, this.ctx.currentTime);
    this.masterGain.gain.linearRampToValueAtTime(this._volume, this.ctx.currentTime + this._rampTime);

    if (!this.playing) {
      this._playTrack(this._preferredTrack);
    }
    this.muted = false;
    localStorage.setItem(STORAGE_KEY, 'false');
  }

  pause() {
    if (!this.loaded || !this.playing) return;
    this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, this.ctx.currentTime);
    this.masterGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + this._rampTime);
    this.muted = true;
    localStorage.setItem(STORAGE_KEY, 'true');
  }

  toggle() {
    if (this.muted || !this.playing) {
      this.play();
    } else {
      this.pause();
    }
    return !this.muted;
  }

  setVolume(v) {
    this._volume = Math.max(0, Math.min(1, v));
    localStorage.setItem(VOLUME_KEY, String(this._volume));
    if (!this.muted && this.masterGain) {
      this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.masterGain.gain.linearRampToValueAtTime(this._volume, this.ctx.currentTime + 0.1);
    }
  }

  getVolume() {
    return this._volume;
  }

  setAutoSwitch(enabled) {
    this.autoSwitch = enabled;
    localStorage.setItem(AUTO_KEY, String(enabled));
  }

  getAutoSwitch() {
    return this.autoSwitch;
  }

  getCurrentTrack() {
    return this.currentTrack;
  }

  getAvailableTracks() {
    return [...this.tracks.keys()];
  }

  get isMuted() {
    return this.muted;
  }
}

export const audioManager = new AudioManager();
