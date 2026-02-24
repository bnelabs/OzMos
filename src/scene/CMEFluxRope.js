import * as THREE from 'three';

/**
 * CMEFluxRope -- Twisted magnetic field tube for solar storm visualization.
 *
 * Real CMEs have a flux rope structure: a helical magnetic field line
 * wound around a central axis, expanding away from the sun.
 */
export class CMEFluxRope {
  constructor(scene) {
    this._scene = scene;
    this._mesh = null;
    this._active = false;
    this._time = 0;
    this._expansionSpeed = 0.08; // scene units per second
  }

  /**
   * Create and show the flux rope, expanding from sunPos outward in direction.
   * @param {THREE.Vector3} sunPos - Sun center position
   * @param {THREE.Vector3} direction - Normalized direction of CME propagation
   */
  activate(sunPos = new THREE.Vector3(0, 0, 0), direction = new THREE.Vector3(1, 0, 0)) {
    if (this._mesh) this.deactivate();

    this._startPos = sunPos.clone();
    this._direction = direction.clone().normalize();
    this._time = 0;
    this._active = true;
    this._currentLength = 8;

    this._createRope();
  }

  _createRope() {
    const segments = 200;
    const turns = 3;
    const maxExpansion = this._currentLength; // expands over time

    const points = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments; // 0 → 1

      // Main arc: parabolic, bowing outward from sun
      // radialDist goes from 0 to maxExpansion * 2 (distance from start along direction)
      const radialDist = t * maxExpansion * 2;
      // arcHeight: rises then falls back (croissant cross-section arc)
      const arcHeight = Math.sin(t * Math.PI) * maxExpansion * 0.4;

      // Helix radius expands from tight bundle to wider flux rope
      const helixRadius = 0.1 + t * maxExpansion * 0.15;

      // Helix angle
      const helixAngle = t * Math.PI * 2 * turns;

      // Build position along the main propagation direction
      // Use perpendicular basis for helix offsets
      const dir = this._direction;
      const perp1 = new THREE.Vector3(-dir.z, 0, dir.x);
      if (perp1.lengthSq() < 0.001) perp1.set(0, 1, 0);
      perp1.normalize();
      const perp2 = new THREE.Vector3().crossVectors(dir, perp1).normalize();

      // Main axis position: start at sun surface offset + parabolic arc
      const axisPos = this._startPos.clone()
        .addScaledVector(this._direction, radialDist + 6); // +6 offset from sun surface

      // Add arc height (perpendicular lift for croissant bow)
      axisPos.addScaledVector(perp2, arcHeight);

      // Add helix wrapping around the arc axis
      axisPos.addScaledVector(perp1, Math.cos(helixAngle) * helixRadius);
      axisPos.addScaledVector(perp2, Math.sin(helixAngle) * helixRadius);

      points.push(axisPos);
    }

    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(curve, segments, 0.12, 8, false);

    // Color gradient from orange (inner) to blue (outer) via vertex colors
    const colors = [];
    const posArray = geometry.attributes.position.array;
    for (let i = 0; i < posArray.length; i += 3) {
      const t = i / posArray.length;
      colors.push(1.0, 0.4 + t * 0.2, t * 0.5); // orange → blue-orange
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
    });

    if (this._mesh) {
      this._scene.remove(this._mesh);
      this._mesh.geometry.dispose();
      this._mesh.material.dispose();
    }

    this._mesh = new THREE.Mesh(geometry, material);
    this._scene.add(this._mesh);
  }

  update(delta) {
    if (!this._active || !this._mesh) return;
    this._time += delta;

    // Expand the rope over time
    this._currentLength += this._expansionSpeed * delta * 60;

    // Fade out as it expands beyond a threshold
    const maxLength = 120;
    if (this._currentLength > maxLength * 0.7) {
      const fadeT = (this._currentLength - maxLength * 0.7) / (maxLength * 0.3);
      this._mesh.material.opacity = Math.max(0, 0.55 * (1 - fadeT));
    }

    if (this._currentLength > maxLength) {
      this.deactivate();
      return;
    }

    // Rebuild geometry as rope expands (throttled for performance)
    if (Math.floor(this._time * 6) !== Math.floor((this._time - delta) * 6)) {
      this._createRope();
    }
  }

  deactivate() {
    if (this._mesh) {
      this._scene.remove(this._mesh);
      this._mesh.geometry.dispose();
      this._mesh.material.dispose();
      this._mesh = null;
    }
    this._active = false;
    this._time = 0;
  }

  isActive() { return this._active; }
}
