/**
 * AudioManager — multi-track music system with crossfade and context-aware switching.
 * Uses Web Audio API with per-track gain nodes and a master gain.
 */
import { storageGet, storageSet, storageRemove } from '../utils/storage.js';

const STORAGE_KEY = 'ozmos-music-muted';
const VOLUME_KEY  = 'ozmos-music-volume';
const TRACK_KEY   = 'ozmos-music-track';
const AUTO_KEY    = 'ozmos-music-auto';
const LOCKED_KEY  = 'ozmos-music-locked'; // true when user has manually chosen a track

const TRACK_PATHS = {
  calm:         '/audio/ambient.mp3',
  epic:         '/audio/epic.mp3',
  contemplative:'/audio/contemplative.mp3',
};

const CONTEXT_TRACKS = {
  overview: 'calm',
  planet:   'contemplative',
  mission:  'epic',
  flyby:    'epic',
};

class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.tracks = new Map(); // id -> { buffer, gain, source }
    this.currentTrack = null;
    this.loaded = false;
    this.playing = false;

    // Restore persisted state — default to muted on first visit (storage returns null)
    this.muted = storageGet(STORAGE_KEY) !== 'false';

    const storedVolume = storageGet(VOLUME_KEY);
    this._volume = storedVolume !== null ? parseFloat(storedVolume) : 0.3;

    this._preferredTrack = storageGet(TRACK_KEY, ['calm', 'epic', 'contemplative'], 'calm');
    // Locked = user has manually picked a track, context switching should not override it
    this._userOverride = storageGet(LOCKED_KEY) === 'true';

    const storedAuto = storageGet(AUTO_KEY);
    this.autoSwitch = storedAuto === null ? true : storedAuto === 'true';

    this._crossfadeDuration = 2.5;
    this._rampTime = 0.5;
    this._pendingTrack = null; // track queued before audio context is ready
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

    // Eagerly load all 3 tracks so switching is instant
    await Promise.all(['calm', 'epic', 'contemplative'].map(id =>
      this._loadTrack(id).catch(() => {})
    ));
    this.loaded = this.tracks.size > 0;

    // Auto-play if user previously opted in (not muted)
    if (this.loaded && !this.muted) {
      // Honour any track selection made before audio was ready
      const startTrack = this._pendingTrack && this.tracks.has(this._pendingTrack)
        ? this._pendingTrack
        : this.tracks.has(this._preferredTrack)
          ? this._preferredTrack
          : this.tracks.keys().next().value;
      this._pendingTrack = null;
      this._playTrack(startTrack);
    }
  }

  /** Load a single track by ID if not already loaded */
  async _loadTrack(trackId) {
    if (this.tracks.has(trackId)) return; // already loaded
    const path = TRACK_PATHS[trackId];
    if (!path || !this.ctx) return;
    try {
      const response = await fetch(path);
      if (!response.ok) return;
      const arrayBuffer = await response.arrayBuffer();
      const buffer = await this.ctx.decodeAudioData(arrayBuffer);
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this.masterGain);
      this.tracks.set(trackId, { buffer, gain, source: null });
    } catch {
      // Track not available — skip silently
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

  async _playTrack(trackId) {
    if (!this.loaded) return;
    // Lazy-load track on demand
    if (!this.tracks.has(trackId)) {
      await this._loadTrack(trackId);
    }
    if (!this.tracks.has(trackId)) {
      // Fallback to first available track
      trackId = this.tracks.keys().next().value;
      if (!trackId) return;
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

  /** Sequential fade: fade out old track first, then fade in new track — no simultaneous playback */
  async crossfadeTo(trackId, duration) {
    if (!this.loaded) return;
    if (this.ctx && this.ctx.state === 'suspended') await this.ctx.resume();
    if (!this.tracks.has(trackId)) {
      await this._loadTrack(trackId);
      if (!this.tracks.has(trackId)) return;
    }
    if (this.currentTrack === trackId && this.playing) return;

    const fadeOut = 0.5;
    const fadeIn  = 0.7;
    const now = this.ctx.currentTime;

    // Step 1: fade out the currently playing track
    if (this.currentTrack) {
      const oldTrack = this.tracks.get(this.currentTrack);
      if (oldTrack) {
        oldTrack.gain.gain.cancelScheduledValues(now);
        oldTrack.gain.gain.setValueAtTime(oldTrack.gain.gain.value, now);
        oldTrack.gain.gain.linearRampToValueAtTime(0, now + fadeOut);
        const oldSource = oldTrack.source;
        setTimeout(() => {
          try { if (oldSource) oldSource.stop(); } catch {}
        }, fadeOut * 1000 + 100);
      }
    }

    // Step 2: after fade-out completes, start and fade in the new track
    this.currentTrack = trackId;
    this.playing = true;
    setTimeout(() => {
      this._startSource(trackId);
      const newTrack = this.tracks.get(trackId);
      if (!newTrack) return;
      const t = this.ctx.currentTime;
      newTrack.gain.gain.cancelScheduledValues(t);
      newTrack.gain.gain.setValueAtTime(0, t);
      newTrack.gain.gain.linearRampToValueAtTime(1, t + fadeIn);
    }, (fadeOut + 0.1) * 1000);
  }

  /**
   * Explicit user track selection — locks context-switching off until
   * the user re-enables auto-switch via the checkbox.
   */
  selectTrack(trackId) {
    this._preferredTrack = trackId;
    this._userOverride   = true;
    this.autoSwitch      = false;
    storageSet(TRACK_KEY,  trackId);
    storageSet(LOCKED_KEY, 'true');
    storageSet(AUTO_KEY,   'false');
    if (!this.loaded) { this._pendingTrack = trackId; return; }
    if (this.isMuted) this.play();
    return this.crossfadeTo(trackId);
  }

  /** Context-aware auto-switching — skipped when user has manually locked a track */
  setContext(context) {
    if (!this.autoSwitch || this.muted || this._userOverride) return;
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
    storageSet(STORAGE_KEY, 'false');
  }

  pause() {
    if (!this.loaded || !this.playing) return;
    this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, this.ctx.currentTime);
    this.masterGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + this._rampTime);
    this.muted = true;
    storageSet(STORAGE_KEY, 'true');
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
    storageSet(VOLUME_KEY, String(this._volume));
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
    storageSet(AUTO_KEY, String(enabled));
    // Re-enabling auto-switch clears the manual lock so context switching resumes
    if (enabled) {
      this._userOverride = false;
      storageRemove(LOCKED_KEY);
    }
  }

  getAutoSwitch() {
    return this.autoSwitch;
  }

  getCurrentTrack() {
    return this.currentTrack;
  }

  getPreferredTrack() {
    return this._preferredTrack;
  }

  getAvailableTracks() {
    return [...this.tracks.keys()];
  }

  get isMuted() {
    return this.muted;
  }
}

export const audioManager = new AudioManager();
