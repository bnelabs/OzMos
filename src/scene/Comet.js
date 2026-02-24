// @ts-check
import * as THREE from 'three';

/**
 * Comet with icy nucleus, dust tail, and ion tail.
 * Orbital path is highly elliptical Keplerian orbit.
 */
export class Comet {
  /**
   * @param {THREE.Scene} scene
   * @param {Object} opts
   * @param {number} opts.periapsis - periapsis distance in scene units (AU * 36)
   * @param {number} opts.apoapsis - apoapsis distance in scene units
   * @param {number} opts.period - orbital period in simulation days
   * @param {number} opts.inclination - orbital inclination degrees
   * @param {number} opts.startAngle - starting orbital angle
   * @param {string} opts.name - comet name
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.periapsis = opts.periapsis ?? 10.8; // 0.3 AU
    this.apoapsis = opts.apoapsis ?? 250;    // beyond Pluto
    this.period = opts.period ?? 28835;      // 79 years in days
    this.inclination = opts.inclination ?? 162.2;
    this.name = opts.name ?? 'Comet';

    // Semi-major axis and eccentricity
    this.a = (this.periapsis + this.apoapsis) / 2;
    this.e = (this.apoapsis - this.periapsis) / (this.apoapsis + this.periapsis);

    // Current orbital angle
    this._angle = opts.startAngle ?? 0;

    this._active = false; // only visible near sun
    this._group = new THREE.Group();
    scene.add(this._group);

    this._buildNucleus();
    this._buildDustTail();
    this._buildIonTail();

    this._group.visible = false;
  }

  _buildNucleus() {
    const geo = new THREE.SphereGeometry(0.15, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0xaaccff });
    this._nucleus = new THREE.Mesh(geo, mat);
    this._group.add(this._nucleus);
  }

  _buildDustTail() {
    const count = 800;
    const positions = new Float32Array(count * 3);
    const alphas = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // Spread in a cone shape behind nucleus, will be oriented each frame
      const t = i / count;
      positions[i * 3] = (Math.random() - 0.5) * 0.4 * (1 + t * 2);
      positions[i * 3 + 1] = (Math.random() - 0.5) * 0.4 * (1 + t * 2);
      positions[i * 3 + 2] = -t * 4; // extends along -Z (anti-sun direction)
      alphas[i] = 1.0 - t * 0.8;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('alpha', new THREE.Float32BufferAttribute(alphas, 1));
    const mat = new THREE.PointsMaterial({
      color: 0xffeecc,
      size: 0.08,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this._dustTail = new THREE.Points(geo, mat);
    this._group.add(this._dustTail);
  }

  _buildIonTail() {
    const count = 300;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const t = i / count;
      positions[i * 3] = (Math.random() - 0.5) * 0.15;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 0.15;
      positions[i * 3 + 2] = -t * 6; // longer, thinner than dust
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x88aaff,
      size: 0.04,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this._ionTail = new THREE.Points(geo, mat);
    this._group.add(this._ionTail);
  }

  /**
   * Update comet position given simulation days elapsed.
   * @param {number} deltaDays - simulation days per frame
   * @param {THREE.Vector3} sunPos - sun world position (always 0,0,0)
   */
  update(deltaDays, sunPos) {
    // Advance mean anomaly
    const meanMotion = (2 * Math.PI) / this.period; // radians per day
    this._angle += meanMotion * deltaDays;

    // Solve Kepler's equation (simple Newton-Raphson)
    let E = this._angle;
    for (let i = 0; i < 10; i++) {
      E = E - (E - this.e * Math.sin(E) - this._angle) / (1 - this.e * Math.cos(E));
    }
    const trueAnomaly = 2 * Math.atan2(
      Math.sqrt(1 + this.e) * Math.sin(E / 2),
      Math.sqrt(1 - this.e) * Math.cos(E / 2)
    );
    const r = this.a * (1 - this.e * this.e) / (1 + this.e * Math.cos(trueAnomaly));

    // Position in orbital plane
    const incRad = THREE.MathUtils.degToRad(this.inclination);
    const x = r * Math.cos(trueAnomaly);
    const z = r * Math.sin(trueAnomaly);
    const y = z * Math.sin(incRad);
    const zFinal = z * Math.cos(incRad);

    this._group.position.set(x, y, zFinal);

    // Only active within 3 AU of sun (108 scene units)
    const distFromSun = r;
    const wasActive = this._active;
    this._active = distFromSun < 108;
    this._group.visible = this._active;

    if (this._active) {
      // Orient tails anti-solar
      const toSun = sunPos.clone().sub(this._group.position).normalize();
      this._group.lookAt(sunPos);
      // Rotate so tails point away from sun (group's -Z axis away from sun)
      this._group.rotateY(Math.PI);

      // Scale tail length inversely with distance squared (longer when closer)
      const distScale = Math.max(0.3, Math.min(2.0, 30 / (distFromSun * distFromSun + 1)));
      this._dustTail.scale.z = distScale;
      this._ionTail.scale.z = distScale * 1.5;

      // Fade in/out based on distance
      const opacity = THREE.MathUtils.clamp(1 - distFromSun / 108, 0.1, 1.0);
      this._dustTail.material.opacity = opacity * 0.7;
      this._ionTail.material.opacity = opacity * 0.5;
    }
  }

  dispose() {
    this._nucleus.geometry.dispose();
    this._nucleus.material.dispose();
    this._dustTail.geometry.dispose();
    this._dustTail.material.dispose();
    this._ionTail.geometry.dispose();
    this._ionTail.material.dispose();
    this.scene.remove(this._group);
  }
}
