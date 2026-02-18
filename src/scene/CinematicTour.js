/**
 * CinematicTour — auto-visits each planet with cinematic transitions.
 * 5-second dwell at each planet, then moves to the next.
 */
import { PLANET_ORDER } from '../data/solarSystem.js';

export class CinematicTour {
  constructor(scene) {
    this.scene = scene;
    this.active = false;
    this.currentIndex = 0;
    this.dwellTime = 8.0; // seconds at each planet (accommodates 6s cutaway + buffer)
    this.dwellTimer = 0;
    this.waitingForTransition = false;
    this.onPlanetVisit = null;  // callback(key)
    this.onPlanetLeave = null;  // callback(key) — called before moving to next
    this.onTourEnd = null;      // callback()
  }

  start() {
    this.active = true;
    this.currentIndex = 0;
    this.dwellTimer = 0;
    this.waitingForTransition = true;
    this._visitCurrent();
  }

  stop() {
    this.active = false;
    this.waitingForTransition = false;
    this.dwellTimer = 0;
  }

  toggle() {
    if (this.active) {
      this.stop();
    } else {
      this.start();
    }
    return this.active;
  }

  _visitCurrent() {
    const key = PLANET_ORDER[this.currentIndex];
    if (!key) {
      this._endTour();
      return;
    }
    this.waitingForTransition = true;
    this.dwellTimer = 0;
    this.scene.focusOnPlanet(key);
    if (this.onPlanetVisit) this.onPlanetVisit(key);
  }

  _endTour() {
    this.active = false;
    this.scene.goToOverview();
    if (this.onTourEnd) this.onTourEnd();
  }

  /** Call this every frame with delta time */
  update(delta) {
    if (!this.active) return;

    // Wait for the camera transition to finish
    if (this.waitingForTransition) {
      if (!this.scene.isTransitioning) {
        this.waitingForTransition = false;
        this.dwellTimer = 0;
      }
      return;
    }

    // Dwell at current planet
    this.dwellTimer += delta;
    if (this.dwellTimer >= this.dwellTime) {
      // Fire leave callback for current planet before advancing
      if (this.onPlanetLeave) {
        this.onPlanetLeave(PLANET_ORDER[this.currentIndex]);
      }
      this.currentIndex++;
      if (this.currentIndex >= PLANET_ORDER.length) {
        this._endTour();
      } else {
        this._visitCurrent();
      }
    }
  }

  get isActive() {
    return this.active;
  }
}
