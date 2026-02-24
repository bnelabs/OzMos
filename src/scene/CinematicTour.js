/**
 * CinematicTour — auto-visits each planet with cinematic transitions,
 * an educational HUD showing planet facts, progress, and playback controls.
 */
import { PLANET_ORDER } from '../data/solarSystem.js';
import '../styles/tour-help.css';

const TOUR_FACTS = {
  sun:     ['Surface temperature: 5,778 K', 'Contains 99.86% of solar system mass', 'Light takes 8 minutes to reach Earth'],
  mercury: ['No atmosphere — surface temperatures range -180°C to 430°C', 'Smallest planet, slightly larger than Earth\'s Moon', 'Orbits the Sun every 88 Earth days'],
  venus:   ['Hottest planet at 465°C — hotter than Mercury despite being farther from Sun', 'Rotates backwards relative to most planets', 'Day longer than its year'],
  earth:   ['Only known planet with life', 'Surface 71% covered by water', 'Protected by a powerful magnetic field'],
  mars:    ['Olympus Mons: tallest volcano in solar system (21 km high)', 'Has two tiny moons: Phobos and Deimos', 'Day length: 24h 37min — closest to Earth\'s'],
  jupiter: ['Largest planet — 1,300 Earths could fit inside', 'Great Red Spot: a storm raging for 400+ years', '95 known moons, including volcanic Io'],
  saturn:  ['Ring system extends 282,000 km, but only ~10m thick', 'Least dense planet — would float in water', '146 known moons including Titan with thick atmosphere'],
  uranus:  ['Rotates on its side — axis tilted 98°', 'Coldest planetary atmosphere: -224°C', 'Has 13 faint rings and 28 moons'],
  neptune: ['Winds reach 2,100 km/h — fastest in solar system', 'Takes 165 Earth years to orbit the Sun', 'Moon Triton orbits backwards and is slowly spiraling inward'],
};

const TOUR_STORIES = {
  water: {
    title: 'Follow the Water',
    sequence: ['sun', 'europa', 'titan', 'pluto'],
    stops: {
      sun: { title: 'The Source', narrative: "Every drop of water in our solar system was forged in stellar nurseries and delivered by comets. The Sun's radiation shapes where liquid water can exist — the habitable zone is its gift to life.", transition: "Journeying to Jupiter's ocean moon..." },
      europa: { title: 'Hidden Ocean', narrative: "Beneath Europa's icy shell lies a saltwater ocean twice the volume of Earth's oceans. Tidal heating from Jupiter keeps it liquid. This may be the most promising home for extraterrestrial life in our solar system.", transition: "Flying to Saturn's moon Titan..." },
      titan: { title: 'Methane Lakes', narrative: "Titan has lakes, rivers, and rain — but of liquid methane. Its thick nitrogen atmosphere and hydrocarbon chemistry may mirror conditions on early Earth. A prebiotic chemistry lab in deep freeze.", transition: "Heading to the edge of the solar system..." },
      pluto: { title: 'Ice Mountains', narrative: "Pluto's heart-shaped Tombaugh Regio is a vast nitrogen ice plain. Water ice mountains tower 3 kilometers high. Even at -230°C, geological forces sculpt this distant world.", transition: "Returning home..." },
    },
  },
  rocky: {
    title: 'Rocky Worlds',
    sequence: ['mercury', 'venus', 'earth', 'mars'],
    stops: {
      mercury: { title: 'Extreme Survivor', narrative: "Mercury swings from -180°C nights to 430°C days — the most extreme temperature range of any planet. Scarred by 4 billion years of impacts, it has a disproportionately massive iron core.", transition: "Descending into Venus's hell..." },
      venus: { title: "Hell's Twin", narrative: "Venus is almost identical to Earth in size, yet a runaway greenhouse effect turned it into a 465°C lead-melting furnace with 90 atmospheres of pressure. A cautionary tale about planetary climate.", transition: "Home at last..." },
      earth: { title: 'Pale Blue Dot', narrative: "The only known world harboring life: plate tectonics recycles crust, the Moon stabilizes axial tilt, a magnetic field shields us from solar wind. Every living thing that has ever existed called this world home.", transition: "Crossing to the red planet..." },
      mars: { title: 'Former World', narrative: "Mars once had oceans, rivers, and a thick atmosphere. Olympus Mons is the tallest volcano in the solar system; Valles Marineris would span North America. The question is not whether Mars had life, but whether it still does.", transition: "Tour complete..." },
    },
  },
  giants: {
    title: 'Gas Giants',
    sequence: ['jupiter', 'saturn', 'uranus', 'neptune'],
    stops: {
      jupiter: { title: 'King of Planets', narrative: "Jupiter's Great Red Spot — a storm larger than Earth — has raged for at least 350 years. Its magnetic field is 20,000 times stronger than Earth's. It acts as a gravitational shield, deflecting incoming comets that would otherwise bombard the inner planets.", transition: "Gliding to the ringed jewel..." },
      saturn: { title: 'Lord of the Rings', narrative: "Saturn's rings are only 10–100 meters thick but span 282,000 km — thinner in proportion than a sheet of paper. Made of 99.9% pure water ice, they may have formed just 100 million years ago and will vanish within 300 million more.", transition: "Tilting toward Uranus..." },
      uranus: { title: 'Sideways World', narrative: "Uranus rotates on its side — its axial tilt is 98°, likely from a massive collision billions of years ago. Its seasons last 21 years; one pole experiences 42 years of continuous sunlight followed by 42 years of darkness.", transition: "Racing to the windy frontier..." },
      neptune: { title: 'Windy Frontier', narrative: "Neptune's winds reach 2,100 km/h — the fastest in the solar system. Receiving only 0.1% of the sunlight Earth does, its internal heat source drives these storms. Triton, its captured moon, orbits retrograde and will spiral inward to be torn apart within 3.6 billion years.", transition: "Tour complete..." },
    },
  },
};

/** Capitalise first letter of a planet key for display */
function displayName(key) {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export class CinematicTour {
  constructor(scene) {
    this.scene = scene;
    this.active = false;
    this.paused = false;
    this.currentIndex = 0;
    this.dwellTime = 8.0;
    this.dwellTimer = 0;
    this.waitingForTransition = false;
    this.onPlanetVisit = null;
    this.onPlanetLeave = null;
    this.onTourEnd = null;

    this._hudEl = null;
    this._factInterval = null;
    this._factIndex = 0;

    // Story mode state
    this._storyId = null;
    this._storyData = null;
    this._storySequence = null;
  }

  /* ── public API ──────────────────────────────────── */

  start(storyId) {
    this._storyId = storyId || null;
    this._storyData = storyId ? TOUR_STORIES[storyId] : null;

    if (this._storyData) {
      // Override planet sequence for this story
      this._storySequence = this._storyData.sequence;
    } else {
      this._storySequence = null;
    }

    this.active = true;
    this.paused = false;
    this.currentIndex = 0;
    this.dwellTimer = 0;
    this.waitingForTransition = true;
    this._createHUD();
    this._visitCurrent();
  }

  stop() {
    this.active = false;
    this.paused = false;
    this.waitingForTransition = false;
    this.dwellTimer = 0;
    this._storyId = null;
    this._storyData = null;
    this._storySequence = null;
    this._removeHUD();
  }

  toggle() {
    if (this.active) {
      this.stop();
    } else {
      this.start();
    }
    return this.active;
  }

  pause() {
    if (!this.active) return;
    this.paused = true;
    this._updatePauseBtn();
  }

  resume() {
    if (!this.active) return;
    this.paused = false;
    this._updatePauseBtn();
  }

  togglePause() {
    if (this.paused) this.resume();
    else this.pause();
  }

  prev() {
    if (!this.active) return;
    const planets = this._storySequence || PLANET_ORDER;
    if (this.currentIndex > 0) {
      if (this.onPlanetLeave) this.onPlanetLeave(planets[this.currentIndex]);
      this.currentIndex--;
      this._visitCurrent();
    }
  }

  next() {
    if (!this.active) return;
    const planets = this._storySequence || PLANET_ORDER;
    if (this.onPlanetLeave) this.onPlanetLeave(planets[this.currentIndex]);
    this.currentIndex++;
    if (this.currentIndex >= planets.length) {
      this._endTour();
    } else {
      this._visitCurrent();
    }
  }

  get isActive() {
    return this.active;
  }

  /* ── internal navigation ─────────────────────────── */

  _visitCurrent() {
    const planets = this._storySequence || PLANET_ORDER;
    const key = planets[this.currentIndex];
    if (!key) {
      this._endTour();
      return;
    }
    this.waitingForTransition = true;
    this.dwellTimer = 0;
    this._factIndex = 0;
    this.scene.focusOnPlanet(key);
    if (this.onPlanetVisit) this.onPlanetVisit(key);
    this._updateHUD(key);
    // Only run fact rotation for non-story mode
    if (!this._storyData) {
      this._startFactRotation(key);
    } else {
      this._stopFactRotation();
    }
  }

  _endTour() {
    this.active = false;
    this._storyId = null;
    this._storyData = null;
    this._storySequence = null;
    this.scene.goToOverview();
    this._removeHUD();
    if (this.onTourEnd) this.onTourEnd();
  }

  /** Call this every frame with delta time */
  update(delta) {
    if (!this.active) return;
    if (this.paused) return;

    // Wait for the camera transition to finish
    if (this.waitingForTransition) {
      if (!this.scene.isTransitioning) {
        this.waitingForTransition = false;
        this.dwellTimer = 0;
      }
      return;
    }

    const planets = this._storySequence || PLANET_ORDER;

    // Dwell at current planet
    this.dwellTimer += delta;
    if (this.dwellTimer >= this.dwellTime) {
      if (this.onPlanetLeave) {
        this.onPlanetLeave(planets[this.currentIndex]);
      }
      this.currentIndex++;
      if (this.currentIndex >= planets.length) {
        this._endTour();
      } else {
        this._visitCurrent();
      }
    }
  }

  /* ── HUD DOM management ──────────────────────────── */

  _createHUD() {
    this._removeHUD();

    const el = document.createElement('div');
    el.id = 'tour-hud';
    el.className = 'tour-hud';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Cinematic Tour');

    el.innerHTML = `
      <div class="tour-hud-progress">
        <div class="tour-hud-progress-bar" id="tour-progress-bar"></div>
      </div>
      <div class="tour-hud-content">
        <div class="tour-hud-planet" id="tour-hud-planet"></div>
        <div class="tour-hud-fact" id="tour-hud-fact"></div>
        <div class="tour-hud-counter" id="tour-hud-counter"></div>
      </div>
      <div class="tour-hud-controls">
        <button id="tour-btn-prev" class="tour-ctrl-btn" aria-label="Previous stop">‹</button>
        <button id="tour-btn-pause" class="tour-ctrl-btn tour-ctrl-pause" aria-label="Pause tour">⏸</button>
        <button id="tour-btn-next" class="tour-ctrl-btn" aria-label="Next stop">›</button>
        <button id="tour-btn-exit" class="tour-ctrl-btn tour-ctrl-exit" aria-label="Exit tour">✕</button>
      </div>
    `;

    document.body.appendChild(el);
    this._hudEl = el;

    // Wire button listeners
    el.querySelector('#tour-btn-prev').addEventListener('click', () => this.prev());
    el.querySelector('#tour-btn-pause').addEventListener('click', () => this.togglePause());
    el.querySelector('#tour-btn-next').addEventListener('click', () => this.next());
    el.querySelector('#tour-btn-exit').addEventListener('click', () => {
      this.stop();
      if (this.onTourEnd) this.onTourEnd();
    });
  }

  _removeHUD() {
    this._stopFactRotation();
    if (this._hudEl) {
      this._hudEl.remove();
      this._hudEl = null;
    }
  }

  _updateHUD(key) {
    if (!this._hudEl) return;

    const planetEl = this._hudEl.querySelector('#tour-hud-planet');
    const factEl = this._hudEl.querySelector('#tour-hud-fact');
    const counterEl = this._hudEl.querySelector('#tour-hud-counter');
    const progressEl = this._hudEl.querySelector('#tour-progress-bar');

    const planets = this._storySequence || PLANET_ORDER;

    if (planetEl) planetEl.textContent = displayName(key);

    // Show narrative for story mode, facts for regular tour
    if (factEl) {
      if (this._storyData && this._storyData.stops[key]) {
        const stop = this._storyData.stops[key];
        factEl.innerHTML = `<strong>${stop.title}</strong><br><span style="font-weight:normal">${stop.narrative}</span>`;
      } else {
        const facts = TOUR_FACTS[key] || [];
        factEl.textContent = facts[0] || '';
      }
    }

    if (counterEl) {
      counterEl.textContent = `${this.currentIndex + 1} / ${planets.length}`;
    }

    if (progressEl) {
      const pct = ((this.currentIndex + 1) / planets.length) * 100;
      progressEl.style.width = pct + '%';
    }
  }

  _updatePauseBtn() {
    if (!this._hudEl) return;
    const btn = this._hudEl.querySelector('#tour-btn-pause');
    if (btn) {
      btn.textContent = this.paused ? '▶' : '⏸';
      btn.setAttribute('aria-label', this.paused ? 'Resume tour' : 'Pause tour');
    }
  }

  /* ── Fact rotation ───────────────────────────────── */

  _startFactRotation(key) {
    this._stopFactRotation();
    const facts = TOUR_FACTS[key] || [];
    if (facts.length <= 1) return;

    this._factIndex = 0;
    this._factInterval = setInterval(() => {
      this._factIndex = (this._factIndex + 1) % facts.length;
      const factEl = this._hudEl?.querySelector('#tour-hud-fact');
      if (!factEl) return;

      // Fade out, swap text, fade in
      factEl.classList.add('fade');
      setTimeout(() => {
        factEl.textContent = facts[this._factIndex];
        factEl.classList.remove('fade');
      }, 300);
    }, 4000);
  }

  _stopFactRotation() {
    if (this._factInterval) {
      clearInterval(this._factInterval);
      this._factInterval = null;
    }
  }
}
