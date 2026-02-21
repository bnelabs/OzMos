# OzMos Audio Strategy — Comprehensive Analysis & Recommendations

**Author:** Auditory Experience Specialist
**Date:** 2026-02-21
**Status:** Analysis Complete
**Project:** OzMos Solar System Explorer

---

## 1. Current Music System Analysis

### How AudioManager.js Works

**Architecture Overview:**
- **Web Audio API-based** singleton managing 3 background tracks via `AudioContext`
- **Eager loading**: All 3 tracks pre-fetched on first user interaction → instant switching
- **Sequential crossfade**: Fade out old track (500ms) → silence gap (100ms) → fade in new track (700ms)
- **Context-aware auto-switching**: Maps UI context to track:
  - `overview` → Calm
  - `planet` → Contemplative
  - `mission` / `flyby` → Epic

**Key Implementation Details:**
- `BufferSource` (looping) fed through per-track gain nodes
- Master gain controls overall volume (0–1 scale)
- Storage persistence: `ozmos-music-*` keys store mute state, volume, track selection, auto-switch flag
- **User override lock**: When user manually selects a track, auto-switching disables until re-enabled via checkbox

**Track Switching Logic:**
1. `selectTrack(trackId)` → Sets manual lock, disables auto-switch
2. `setContext(context)` → Only fires if `autoSwitch && !muted && !userOverride`
3. `crossfadeTo()` → Sequential ramps (line 151–190 shows the state machine)

**Lifecycle:**
- `init()` called on first user interaction (click/tap)
- Audio context initially in `suspended` state (browser policy)
- `_playTrack()` checks for suspended context and resumes before playback
- **Bug (now fixed per plan)**: `crossfadeTo()` was missing `ctx.resume()` call

### Context Switching Behavior

The system intelligently shifts mood:
- **Overview mode**: Calm, expansive ambient fits the "cosmic overview" perspective
- **Planet selected**: Contemplative becomes introspective (user exploring a specific world)
- **Mission/Flyby**: Epic for high-stakes moments (cinematic sequences, dramatic navigation)

**Current tracks (3 total):**
- **ambient.mp3** (7.1 MB) — Calm track
- **contemplative.mp3** (4.2 MB) — Contemplative track
- **epic.mp3** (3.1 MB) — Epic track

### User Feedback Issue

The user stated "didn't like the music" — this indicates:
1. Generic/formulaic ambient compositions lack character and depth
2. No spatial variation or movement in the soundscape
3. Likely royalty-free stock music from a generic library (Epidemic Sound, Artlist, etc.)
4. No thematic connection to space exploration or the solar system
5. Lack of emotional arc — static padding rather than dynamic accompaniment

---

## 2. Music Quality Assessment & Recommendations

### Problem: Why Current Tracks Fall Short

**Current Issues:**
1. **Generic production quality** — Stock ambient lacks uniqueness
2. **No spatial depth** — Mono/stereo mix without immersive 3D dimensionality
3. **Weak emotional connection** — No narrative or thematic resonance
4. **Static arrangement** — No dynamic sections that respond to interaction
5. **Insufficient contrast** — Three tracks feel too similar in texture (all ambient/pad-based)

### What TYPE of Music Would Elevate OzMos?

A solar system explorer needs music that:
- **Evokes wonder and scale** — Something majestic but intimate
- **Reflects actual space** — Authentic rather than generic
- **Supports contemplation** — Not overly dramatic; allows focus on visuals
- **Has compositional sophistication** — Beyond looped ambient pads

### Recommended Music Sources & Approaches

#### **1. NASA & Space Data Sonification (Public Domain)**
**Best fit for authenticity**

- **NASA Sonification Projects:**
  - NASA's "Rings of Saturn" sonification — actual space probe data converted to sound
  - "Earth Sounds" — Environmental data from NASA satellites
  - **Source:** https://www.nasa.gov/audio/ (fully public domain)
  - **License:** U.S. Government works (no restrictions)
  - **Use case:** Meditative overview track with genuine space data foundation

- **NOAA Space Weather Audio:**
  - Solar wind spectrograms converted to haunting tones
  - **Source:** https://www.swpc.noaa.gov/products/space-weather-audio
  - **License:** Public domain
  - **Use case:** Solar storm simulation, epic track during mission sequences

#### **2. Classical & Contemporary Orchestral**
**For emotional resonance**

- **Gustav Holst — "The Planets" Suite** (1916)
  - Public domain (pre-1928 in most jurisdictions)
  - Each movement corresponds to a planet (Jupiter, Mars, Venus, Neptune, etc.)
  - **Source:** https://commons.wikimedia.org/ search "The Planets Holst"
  - **License:** Public domain recordings available
  - **Problem:** Direct use feels heavy-handed; consider orchestral arrangements
  - **Alternative:** Orchestral remix artists (e.g., 2CELLOS rearrangements if under CC)

#### **3. Brian Eno & Generative Ambient**
**For contemplation**

- **Brian Eno's Ambient Trilogy** (1978–1980)
  - Music for Airports, Discreet Music
  - **Availability:** Licensed through Spotify/Apple Music for streaming
  - **Problem:** Commercial licensing required for embedded use
  - **Cost estimate:** $5–15k for synchronization rights (prohibitive)
  - **Alternative:** Study Eno's generative structure; commission similar work

- **Modern Eno-inspired creators (Royalty-Free):**
  - **Epidemic Sound** (https://www.epidemicsound.com/)
    - "Space ambient" / "Sci-fi" playlists with high production value
    - **License:** Epidemic+ tier ($9.99/mo or $99/year for projects)
    - **Pros:** Curated, high quality, instant integration
    - **Cons:** Subscription model; rights depend on license tier

  - **Artlist** (https://artlist.io/)
    - Similar model; includes space/sci-fi curation
    - **Cost:** $25–50/mo for sync rights
    - **Pros:** Massive library, great for iterating
    - **Cons:** Per-project licensing can add up

#### **4. Carbon Based Lifeforms & Modern Space Ambient (CC/Royalty-Free)**
**Best modern approach**

- **Carbon Based Lifeforms** (Andreas Köhler & Torsten Quaas)
  - Albums: "World of Sleepers," "Interloper," "Larger Than Life"
  - **License:** Largely under Creative Commons Attribution
  - **Source:** https://carbonbasedlifeforms.bandcamp.com/ (pay-what-you-want)
  - **Pros:** Sophisticated, lush production; actual license clarity
  - **Cost:** $0–50 depending on usage terms

- **Solar Fields** (Magnus Birgersson)
  - Albums: "Movements," "Expand," "Blue Moon Station"
  - **License:** Many tracks available under CC-BY-SA
  - **Source:** https://www.solarfields.com/ (direct download + streaming)
  - **Pros:** Perfect for space application; ethereal, vast soundscapes
  - **Cost:** $0–20 for direct purchase; streaming platforms require licensing

- **Other CC-Licensed Space Ambient Artists:**
  - **Unicorn Heads** — Spacey, dreamy compositions (CC-BY)
  - **Stellardrone** — "Space Music" series (CC-BY)
  - **Source:** https://incompetech.com/ (Kevin MacLeod's library, many CC-BY)

#### **5. Procedural/Generative Audio (Advanced Option)**
**For future scalability**

- **Tone.js + Web Audio API:**
  - Generate ambient pads procedurally (pitch, timbre, envelope variations)
  - **Advantage:** Infinite uniqueness, responsive to game state
  - **Disadvantage:** Requires sophisticated composition (not trivial)
  - **Example:** Brian Eno's Music for Airports uses simple generative rules

- **Orca.js or Hydra (Live coding):**
  - Build spatially-aware soundscapes that respond to planet proximity
  - **Cost:** Free (open source)
  - **Learning curve:** Steep

### Music Recommendation Summary

| Track Type | Current | **Recommended Approach** | Source | Cost |
|-----------|---------|------------------------|--------|------|
| **Calm/Overview** | Generic ambient | NASA sonification OR Carbon Based Lifeforms | https://www.nasa.gov/audio/ OR bandcamp | Free–$20 |
| **Contemplative/Planet** | Generic ambient | Solar Fields or modern space ambient (CC) | https://www.solarfields.com/ | Free–$20 |
| **Epic/Mission** | Generic ambient | Holst "The Planets" remix OR Epidemic Sound curated | Public domain OR Epidemic | Free–$15k (or $10/mo sub) |

### Implementation Path (Minimal Friction)

**Option A: Replace with High-Quality Royalty-Free (Recommended)**
1. License 3 tracks from Epidemic Sound ($9.99/mo subscription tier)
2. Export MP3s; replace files in `/public/audio/`
3. No code changes needed
4. **Cost:** ~$120/year for dedicated subscription

**Option B: Commission Original Work**
1. Hire composer (freelance or studio) to create 3 bespoke tracks
2. Specify: "Space exploration ambient; Eno/CBL influence; ~4–8 min loops"
3. Budget: $1–3k for 3 professional tracks
4. Full creative control; timeless asset

**Option C: Hybrid (Best Long-term)**
1. Replace 2 tracks with NASA/CC-licensed authentic material
2. Commission 1 original "mission" track for epic moments
3. Update toward procedural audio generation later

---

## 3. Sound Effects Strategy

### Current State
**No sound effects currently implemented.** Interactions are silent except for the music system.

### Evaluation: Enriching vs. Overkill?

For a contemplative space explorer, sound effects should be **selective and meaningful**, not ubiquitous.

**Recommended SFX per context:**

| Interaction | SFX Recommendation | Implementation | Priority |
|-------------|-------------------|-----------------|----------|
| **Planet selection click** | Soft chime/bell (200–400 Hz) | Web Audio API synth; 100ms tone | High |
| **Solar storm simulation** | Low sub-bass rumble + HF crackle | Procedural; FFT visualization | High |
| **Flyby mode initiation** | Spacecraft thrusters (white noise filtered) | Sample or synthetic sweep | Medium |
| **Cross-section open** | Deep resonant tone (sine wave glide) | Web Audio API; 1s fade-in | Medium |
| **Speed control change** | Pitch shift up/down (Doppler effect) | Play note matching speed multiplier | Low |
| **Hover over planet** | Subtle shimmer/sparkle | Granular synthesis or short sample | Low |
| **Tour narration underlay** | Ambient pad swell (separate track) | Layered with music; fade on narration | Medium |

### Sound Design Philosophy

**Principle:** Keep atmospheric, non-intrusive. Every effect serves a purpose:
- **Confirmation** (click → chime acknowledges selection)
- **Immersion** (storm → visceral cosmic event)
- **Cinematic** (flyby → spatial audio enhances 3D perspective)

### Web Audio API Approach (Recommended)

**Why?** No external dependencies; instant response; spatial audio support (THREE.AudioListener).

**Example implementation patterns:**

```javascript
// Chime on planet click
function playSelectionChime() {
  const ctx = audioManager.ctx;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.frequency.value = 300; // Hz
  osc.type = 'sine';
  osc.connect(gain);
  gain.connect(ctx.destination);

  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.15);
}

// Solar storm rumble (procedural)
function playSolarStormRumble() {
  const ctx = audioManager.ctx;
  const noise = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  // Create white noise buffer
  const buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < buf.length; i++) ch[i] = Math.random() * 2 - 1;

  noise.buffer = buf;
  filter.type = 'lowpass';
  filter.frequency.value = 150; // Low sub-bass

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.3);
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 3);

  noise.start(ctx.currentTime);
  noise.stop(ctx.currentTime + 3);
}
```

### Architecture: Extend AudioManager

Add SFX module alongside music system:

```
src/audio/
  ├── AudioManager.js          (current: music only)
  ├── SFXManager.js            (NEW: sound effects registry)
  └── SFXLibrary.js            (NEW: procedural effect generators)
```

**SFXManager responsibilities:**
- Synthesize chimes, rumbles, whooshes on demand
- Respect master volume (use AudioManager.masterGain or separate chain)
- Pool synthesizers to avoid audio context overload
- Spatial audio support (connect to THREE.AudioListener for 3D space)

---

## 4. Space Shuttle Countdown Strategy

### Context
The dedication screen will eventually have a 3–5 second countdown ("3... 2... 1... Launch!") before transitioning to the main explorer.

### Source Material: NASA Public Domain Audio

**Apollo Countdown (Iconic):**
- Launch Control: "We have a GO for launch"
- Classic CAPCOM (Capsule Communicator) voice: distinctive, authoritative
- **Source:** NASA Archives (https://www.nasa.gov/missions/apollo/)
- **License:** Public domain (U.S. Government work)
- **Audio quality:** Variable (originals are ~60 years old); cleaned versions exist

**Specific recordings to target:**
1. **Apollo 11 Countdown** (1969-07-16)
   - Most iconic; widely available in cleaned form
   - "30 seconds" → "Ignition sequence started" → "Liftoff"
   - **Duration:** ~3–4 seconds for compressed version
   - **Source:** NASA Audio Archive: https://www.nasa.gov/multimedia/

2. **Space Shuttle Countdowns** (1981–2011)
   - More digitized, cleaner audio
   - Different profile: "Main engine start" / "Solid rocket booster ignition"
   - **Source:** NASA Shuttle Program archive
   - **Best source:** https://archive.org/details/nasa_shuttle_archive/ (community cleaned versions)

3. **Modern SpaceX/Artemis Countdowns**
   - Digital-era audio (2020+)
   - Cleaner production but less iconic
   - **Source:** SpaceX YouTube / NASA Artemis feeds (licensed under CC-BY for most)

### Integration Strategy

**Countdown Audio Structure:**
```
[0.0s] NASA CAPCOM voice: "T minus 3 seconds"
[0.5s] Mechanical relay clicks (procedural, add tension)
[1.0s] Voice: "2 seconds"
[1.5s] Relay clicks (louder)
[2.0s] Voice: "1 second"
[2.5s] Engine ignition sound (crescendo rumble)
[3.0s] Transition to main explorer (fade to music)
```

### Audio Sourcing Workflow

1. **Find source recording:**
   - Search https://archive.org/ for "NASA Apollo 11 countdown" or "Space Shuttle launch"
   - Download cleaned 96kHz WAV (if available) or MP3
   - **Recommendation:** Use well-established archive versions (millions of listens = verified quality)

2. **Extract/Edit Countdown Section:**
   - Use Audacity (free, open-source) to isolate 3–5 second clip
   - Normalize to -3dB peak
   - Apply gentle EQ: boost 1–2 kHz (vocal clarity), reduce 100 Hz rumble (background noise)
   - Export as MP3 128kbps (file size ~400 KB)

3. **Add procedural elements:**
   - Relay clicks: Web Audio API clicks (short sine chirps)
   - Rumble crescendo: Procedural noise sweep (LPF glide 300→50 Hz)
   - **No additional audio file needed** — synthesized in real-time

4. **Store in public/audio/:**
   - `countdown-capcom.mp3` — NASA voice clip
   - Procedural effects generated in DedicationCountdown module

### Code Architecture

```javascript
// src/audio/CountdownSequence.js
class CountdownSequence {
  async play() {
    // Load CAPCOM countdown audio
    const countdownTrack = await fetch('/audio/countdown-capcom.mp3')
      .then(r => r.arrayBuffer())
      .then(buf => audioManager.ctx.decodeAudioData(buf));

    // Create source, play with visualization
    const source = audioManager.ctx.createBufferSource();
    source.buffer = countdownTrack;
    source.connect(audioManager.masterGain);
    source.start(0);

    // Trigger procedural relay clicks every 1 second
    this._playRelayClicks();

    // On "Launch!" cue, play engine rumble
    setTimeout(() => this._playSolidRocketIgnition(), 2500);
  }

  _playRelayClicks() { /* synthesize */ }
  _playSolidRocketIgnition() { /* procedural rumble */ }
}
```

### Recommendations

**Best sources (priority order):**
1. **Archive.org NASA Collection** — Vetted, cleaned audio; many options
   - https://archive.org/search.php?query=nasa+countdown&mediatype=audio
2. **Internet Archive Wayback Machine (historic broadcasts)** — Primary source material
3. **NASA official audio library** — https://www.nasa.gov/multimedia/ (limited but authentic)

**Music choice during countdown:**
- Keep music volume LOW (–12dB) to emphasize countdown audio
- Fade out completely on "3... 2... 1..."
- Crossfade to main track on transition to explorer

---

## 5. AudioManager Architecture Evolution

### Current Limitations

1. **No spatial audio** — Music/SFX always come from stereo center
2. **No procedural sound** — All audio must be pre-encoded files
3. **No effects chain** — No reverb, EQ, compression for immersive space feel
4. **Limited context awareness** — Only music switching; SFX unmapped
5. **No distance-based audio** — Flyby sequence would benefit from Doppler/distance attenuation

### Recommended Evolution Path

#### **Phase 1: SFX & Procedural Synthesis (Near-term)**

```
src/audio/
├── AudioManager.js           (existing; expand slightly)
├── SFXManager.js             (new; procedural sound registry)
├── SFXLibrary.js             (new; reusable generators)
└── ProceduralAudio.js        (new; tone/noise synthesis utilities)
```

**Key additions:**
- `SFXManager.playChime(freq, duration)` → synthesizes interactive feedback
- `SFXManager.playRumble(depth, duration)` → low-frequency thunder
- `SFXManager.playWhoosh(direction)` → spatial motion cue
- Shared audio context with AudioManager (no redundant contexts)

#### **Phase 2: Spatial Audio via THREE.js (Medium-term)**

Leverage existing Three.js + Web Audio API integration:

```javascript
// Create a 3D audio listener (already in scene)
const listener = new THREE.AudioListener();
camera.add(listener);

// Attach flyby spacecraft sound to 3D position
const flybySfx = new THREE.PositionalAudio(listener);
flybySfx.setContentType('audio/mpeg');
flybySfx.setRefDistance(5);
flybySfx.load('/audio/spacecraft-thrusters.mp3');
craftGroup.add(flybySfx);
flybySfx.play(); // 3D audio! Pans/attenuates with craft position
```

**Benefit:** As spacecraft flies past, audio pans and fades naturally (Doppler-like effect without complex synthesis).

**Timeline:** Implement after SFX foundation stabilized.

#### **Phase 3: Immersive Effects Chain (Long-term)**

Add spatial effects to deepen immersion:

- **Reverb:** Convolver effect simulating vast cosmic chamber
- **EQ:** Context-specific tone shaping (warm on planets, cold on void)
- **Compression:** Dynamic range control for consistent mix across contexts
- **Delay:** Echo for distance perception

**Library:** https://github.com/Tonejs/Tone.js (optional; adds ~50KB)

### Implementation Steps (Immediate)

**Step 1: Audit AudioManager for shared audio context**
- Currently creates `AudioContext` on first user interaction ✓
- No conflicts with spatial audio (listener can attach to camera) ✓

**Step 2: Create SFXManager**
- Reuse `audioManager.ctx` (no second context)
- Create gain node for SFX (separate from music gain)
- Expose API: `sfxManager.playChime(freq)`, `playSolarStormRumble()`, etc.

**Step 3: Wire SFX to interactions**
- Planet click → `sfxManager.playChime(300)`
- Flyby start → `sfxManager.playSpacecraftThrusters()`
- Storm activation → `sfxManager.playSolarStormRumble()`

**Step 4: Test mix levels**
- Ensure SFX doesn't overwhelm music (–6dB relative to music gain)
- Verify no audio context clipping (monitor `analyser.getByteFrequencyData()`)

### Code Template for Expansion

```javascript
// src/audio/SFXManager.js
import { audioManager } from './AudioManager.js';

class SFXManager {
  constructor() {
    this.ctx = audioManager.ctx;
    this.sfxGain = null;
    this._init();
  }

  _init() {
    if (!this.ctx) {
      console.warn('SFXManager: Audio context not ready');
      return;
    }
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.4; // –6dB relative to music
    this.sfxGain.connect(audioManager.masterGain);
  }

  playChime(freq = 300, duration = 0.15) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(this.sfxGain);

    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

    osc.start(this.ctx.currentTime);
    osc.stop(this.ctx.currentTime + duration);
  }

  async playSolarStormRumble(depth = 150, duration = 3) {
    // Implement as per earlier example
  }

  playFlybyWhoosh() {
    // Implement sweep/resonance filter
  }
}

export const sfxManager = new SFXManager();
```

---

## 6. Preloading & Performance Strategy

### Current Audio Loading
- **On-demand lazy loading** in `_loadTrack()` with Promise-based fetch
- **Problem:** Slow connections may cause stutter during first track switch

### Recommended Improvements

#### **1. Manifest-based Preloading**
```javascript
const AUDIO_MANIFEST = {
  music: [
    { id: 'calm', path: '/audio/ambient.mp3', priority: 'high' },
    { id: 'epic', path: '/audio/epic.mp3', priority: 'high' },
    { id: 'contemplative', path: '/audio/contemplative.mp3', priority: 'high' },
  ],
  sfx: [
    { id: 'chime', synth: { freq: 300, duration: 0.15 }, priority: 'low' },
    { id: 'rumble', synth: { /* ... */ }, priority: 'medium' },
  ],
  countdown: [
    { id: 'capcom', path: '/audio/countdown-capcom.mp3', priority: 'low' },
  ],
};

// Preload in background during loading screen
async function preloadAudio(manifest, onProgress) {
  const loaded = [];
  for (const track of manifest.music) {
    await audioManager._loadTrack(track.id);
    onProgress(loaded.length / manifest.music.length);
    loaded.push(track.id);
  }
}
```

#### **2. Progressive Loading**
- **High priority** (calm, epic, contemplative): Load during loading screen → block
- **Medium priority** (SFX synths): Load on first SFX trigger (cached after)
- **Low priority** (countdown): Load in background; fallback to text if unavailable

#### **3. File Size Optimization**
Current: ~14.4 MB total (7.1 + 4.2 + 3.1 MB)

**Optimization opportunities:**
- **Re-encode at 128 kbps** (from assumed 256–320 kbps)
- **Duration check**: Ensure no redundant padding
- **Example**: 4 min track at 128 kbps ≈ 3.2 MB; current tracks suggest oversize

**Target:** 8–10 MB total after re-encoding

### Web Worker Audio Decoding (Optional)

For large audio files (>10 MB), offload decoding to worker:

```javascript
// src/audio/audioDecoder.worker.js
self.onmessage = async (e) => {
  const { arrayBuffer } = e.data;
  const ctx = new (self.AudioContext || self.webkitAudioContext)();
  const decoded = await ctx.decodeAudioData(arrayBuffer);
  self.postMessage({ decoded }, [decoded]);
};
```

**Benefit:** Main thread remains responsive during decode.
**Downside:** Added complexity; only needed if >20 MB files.

---

## 7. Summary & Action Items

### Immediate Actions (Next Sprint)

| Item | Owner | Timeline | Effort |
|------|-------|----------|--------|
| **Replace 3 music tracks** | Designer/Producer | 1 week | 4 hrs (sourcing + licensing) |
| **Fix crossfadeTo() bug** | Audio Engineer | 1 day | 15 min (code review + test) |
| **Create SFXManager scaffold** | Audio Engineer | 3 days | 3 hrs (template + testing) |
| **Wire planet-click chime** | Frontend | 2 days | 1 hr (integration + tuning) |

### Medium-term (Q1 2026)

- **Implement solar storm rumble** SFX with visualization
- **Add countdown sequence** to dedication screen
- **Implement spatial audio** for flyby mode (THREE.PositionalAudio)
- **Create SFX library** of reusable procedural generators

### Long-term (Q2+)

- **Explore procedural ambient generation** (Tone.js or similar)
- **Add effects chain** (reverb, EQ, compression)
- **Record custom orchestral** theme (commission composer)
- **Integrate narration** system with music ducking

### Budget Estimate

| Component | Option | Cost | Notes |
|-----------|--------|------|-------|
| **Music tracks** | Epidemic Sound | $120/year | Ongoing subscription; unlimited swaps |
| **Countdown audio** | NASA archive | $0 | Already public domain |
| **SFX development** | In-house | $0 | Web Audio API; no external library |
| **Custom orchestral** | Commission | $1–3k | Optional; future iteration |
| **Spatial audio** | THREE.js built-in | $0 | Already available |

### Success Metrics

- ✓ Audio loads within 2s on average connection
- ✓ Music selection persists across sessions (storage working)
- ✓ SFX feedback audible but non-intrusive (<0 dBFS mix)
- ✓ Flyby audio enhances spatial perception (user feedback)
- ✓ Countdown creates emotional lift pre-launch
- ✓ No audio context errors in console

---

## Appendices

### A. Recommended Royalty-Free Music Resources

| Platform | Cost | Best For | License |
|----------|------|----------|---------|
| **Epidemic Sound** | $9.99–49.99/mo | Commercial quality; curated | Sync included |
| **Artlist** | $25–50/mo | Large library; variety | Sync included |
| **Incompetech** | Free | CC-BY flexibility | CC-BY |
| **Carbon Based Lifeforms** | $0–20 | Authentic space ambient | CC-BY / custom |
| **Solar Fields** | $0–20 | Ethereal, vast soundscapes | CC / direct |
| **NASA Archive** | Free | Authentic space data | Public domain |
| **Archive.org** | Free | Historic recordings | Variable (check) |

### B. Web Audio API Cheat Sheet

```javascript
// Oscillator (sine tone)
const osc = ctx.createOscillator();
osc.frequency.value = 440; // Hz
osc.type = 'sine'; // 'sine' | 'square' | 'sawtooth' | 'triangle'

// Noise (white noise)
const buffer = ctx.createBuffer(1, sampleRate, sampleRate);
const data = buffer.getChannelData(0);
for (let i = 0; i < sampleRate; i++) data[i] = Math.random() * 2 - 1;

// Filter (low-pass)
const filter = ctx.createBiquadFilter();
filter.type = 'lowpass';
filter.frequency.value = 200;

// Gain (volume control)
const gain = ctx.createGain();
gain.gain.setValueAtTime(1, ctx.currentTime);
gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1);

// Common pattern
osc.connect(gain);
gain.connect(ctx.destination);
osc.start(ctx.currentTime);
osc.stop(ctx.currentTime + duration);
```

### C. NASA Audio Archive Links

- **NASA Official Audio:** https://www.nasa.gov/audio/
- **Apollo Missions Archive:** https://www.nasa.gov/missions/apollo/
- **Space Shuttle Program History:** https://www.nasa.gov/missions/space-shuttle/
- **Archive.org NASA Collection:** https://archive.org/search.php?query=nasa&mediatype=audio
- **Space Weather Audio:** https://www.swpc.noaa.gov/products/space-weather-audio

---

**Status:** Ready for implementation
**Next Review:** Post-implementation A/B testing with user feedback
