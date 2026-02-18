/**
 * SolarStormSimulation — NASA-level CME (Coronal Mass Ejection) visualization
 * with magnetospheres, particle deflection, aurora, and impact effects.
 */
import * as THREE from 'three';
import {
  cmeVertexShader, cmeFragmentShader,
  magnetosphereVertexShader, magnetosphereFragmentShader,
} from '../shaders/solarStormShader.js';

const MAGNETIC_FIELDS = {
  mercury:  { strength: 0.01, tilt: 0,    hasField: true  },
  venus:    { strength: 0,    tilt: 0,    hasField: false },
  earth:    { strength: 1.0,  tilt: 11.5, hasField: true  },
  mars:     { strength: 0,    tilt: 0,    hasField: false },
  jupiter:  { strength: 20.0, tilt: 9.6,  hasField: true  },
  saturn:   { strength: 5.8,  tilt: 0,    hasField: true  },
  uranus:   { strength: 0.5,  tilt: 59,   hasField: true  },
  neptune:  { strength: 0.27, tilt: 47,   hasField: true  },
};

export class SolarStormSimulation {
  /**
   * @param {THREE.Scene} scene - The main Three.js scene
   * @param {Function} getPlanetWorldPosition - fn(key) => THREE.Vector3
   * @param {Object} planetData - { key: { displayRadius } }
   */
  constructor(scene, getPlanetWorldPosition, planetData) {
    this._scene = scene;
    this._getPlanetPos = getPlanetWorldPosition;
    this._planetData = planetData;
    this._active = false;
    this._cmeActive = false;
    this._elapsed = 0;
    this._cmeStartTime = 0;
    this._cmeDuration = 30; // seconds for particles to reach outer planets

    this._particleSystem = null;
    this._magnetospheres = [];
    this._fieldLines = [];
    this._auroras = [];
    this._impactFlashes = [];

    const isMobile = window.innerWidth < 768 || /Mobi|Android/i.test(navigator.userAgent);
    this._particleCount = isMobile ? 20000 : 50000;
    this._showFieldLines = !isMobile;
  }

  get isActive() { return this._active; }

  activate() {
    if (this._active) return;
    this._active = true;
    this._elapsed = 0;
    this._createMagnetospheres();
    // Start CME after 1 second
    setTimeout(() => {
      if (this._active) this._launchCME();
    }, 1000);
  }

  deactivate() {
    this._active = false;
    this._cmeActive = false;
    this._dispose();
  }

  launchNewCME() {
    if (!this._active) return;
    this._disposeCME();
    this._launchCME();
  }

  _createMagnetospheres() {
    for (const [key, field] of Object.entries(MAGNETIC_FIELDS)) {
      if (!field.hasField) continue;
      const pData = this._planetData[key];
      if (!pData) continue;

      const pos = this._getPlanetPos(key);
      const radius = pData.displayRadius;

      // Bow shock — deformed sphere on sun-facing side
      const bowShockSize = radius * (2.0 + Math.log10(field.strength + 1) * 1.5);
      const bowGeo = new THREE.SphereGeometry(bowShockSize, 32, 32);
      // Deform: compress sun-facing side
      const posAttr = bowGeo.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i);
        const y = posAttr.getY(i);
        const z = posAttr.getZ(i);
        // Sun is at origin, so sun-facing direction is -normalize(pos)
        const sunDir = pos.clone().normalize().negate();
        const dot = (x * sunDir.x + y * sunDir.y + z * sunDir.z) / bowShockSize;
        if (dot > 0) {
          // Compress the sun-facing side
          const factor = 1.0 - dot * 0.3;
          posAttr.setXYZ(i, x * factor, y * factor, z * factor);
        } else {
          // Extend the tail side
          const factor = 1.0 - dot * 0.5;
          posAttr.setXYZ(i, x * factor, y * factor, z * factor);
        }
      }
      posAttr.needsUpdate = true;
      bowGeo.computeVertexNormals();

      const fieldColor = key === 'earth' ? new THREE.Color(0x4488ff) :
                         key === 'jupiter' ? new THREE.Color(0xff8844) :
                         new THREE.Color(0x44aacc);

      const bowMat = new THREE.ShaderMaterial({
        vertexShader: magnetosphereVertexShader,
        fragmentShader: magnetosphereFragmentShader,
        uniforms: {
          uColor: { value: fieldColor },
          uIntensity: { value: Math.min(field.strength * 0.15, 0.8) },
          uTime: { value: 0 },
        },
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      const bowMesh = new THREE.Mesh(bowGeo, bowMat);
      bowMesh.position.copy(pos);
      // Tilt based on magnetic field tilt
      bowMesh.rotation.z = THREE.MathUtils.degToRad(field.tilt);
      this._scene.add(bowMesh);
      this._magnetospheres.push({ mesh: bowMesh, key, field });

      // Field lines (desktop only, limited planets)
      if (this._showFieldLines && ['earth', 'jupiter', 'saturn', 'uranus'].includes(key)) {
        this._createFieldLines(key, pos, radius, field, fieldColor);
      }
    }
  }

  _createFieldLines(key, pos, radius, field, color) {
    const lineCount = 8;
    for (let i = 0; i < lineCount; i++) {
      const angle = (i / lineCount) * Math.PI * 2;
      const points = [];
      // Parametric dipole field line
      for (let t = 0; t <= 1; t += 0.02) {
        const theta = t * Math.PI;
        const r = radius * (1.5 + field.strength * 0.3) * Math.sin(theta) * Math.sin(theta);
        const x = r * Math.sin(theta) * Math.cos(angle);
        const y = r * Math.cos(theta);
        const z = r * Math.sin(theta) * Math.sin(angle);
        points.push(new THREE.Vector3(x + pos.x, y + pos.y, z + pos.z));
      }

      const curve = new THREE.CatmullRomCurve3(points);
      const tubeGeo = new THREE.TubeGeometry(curve, 32, 0.03, 4, false);
      const tubeMat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.15,
        depthWrite: false,
      });
      const tube = new THREE.Mesh(tubeGeo, tubeMat);
      this._scene.add(tube);
      this._fieldLines.push(tube);
    }
  }

  _launchCME() {
    this._cmeActive = true;
    this._cmeStartTime = this._elapsed;

    const count = this._particleCount;

    // Per-particle attributes
    const origins = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const energies = new Float32Array(count);
    const startTimes = new Float32Array(count);

    // CME cone direction — primarily along +X/+Z (arbitrary outward from sun)
    const coneAngle = Math.PI * 0.4; // ~72 degree cone

    for (let i = 0; i < count; i++) {
      // Origin: near sun surface with spread
      const phi = Math.random() * Math.PI * 2;
      const theta = Math.random() * coneAngle * 0.3;
      const sunR = 8; // sun display radius

      origins[i * 3] = sunR * Math.sin(theta) * Math.cos(phi);
      origins[i * 3 + 1] = sunR * Math.sin(theta) * Math.sin(phi) * 0.5;
      origins[i * 3 + 2] = sunR * Math.cos(theta);

      // Velocity: outward with spread
      const speed = 3 + Math.random() * 8;
      const spreadPhi = (Math.random() - 0.5) * coneAngle;
      const spreadTheta = (Math.random() - 0.5) * coneAngle;

      velocities[i * 3] = Math.sin(spreadTheta) * Math.cos(spreadPhi) * speed;
      velocities[i * 3 + 1] = Math.sin(spreadPhi) * speed * 0.3;
      velocities[i * 3 + 2] = Math.cos(spreadTheta) * speed;

      energies[i] = Math.random();

      // Staggered start: particles launch over ~2 seconds
      startTimes[i] = this._cmeStartTime + Math.random() * 2.0;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('aOrigin', new THREE.BufferAttribute(origins, 3));
    geometry.setAttribute('aVelocity', new THREE.BufferAttribute(velocities, 3));
    geometry.setAttribute('aEnergy', new THREE.BufferAttribute(energies, 1));
    geometry.setAttribute('aStartTime', new THREE.BufferAttribute(startTimes, 1));

    const material = new THREE.ShaderMaterial({
      vertexShader: cmeVertexShader,
      fragmentShader: cmeFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uDuration: { value: this._cmeDuration },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this._particleSystem = new THREE.Points(geometry, material);
    this._scene.add(this._particleSystem);

    // Schedule impact effects
    this._scheduleImpacts();
  }

  _scheduleImpacts() {
    // Create aurora sprites for magnetized planets and impact flashes for unshielded ones
    const impactDelay = (distFromSun) => {
      // Approximate time for particles to reach this distance
      return (distFromSun / 200) * this._cmeDuration * 0.8;
    };

    for (const [key, field] of Object.entries(MAGNETIC_FIELDS)) {
      const pData = this._planetData[key];
      if (!pData) continue;
      const pos = this._getPlanetPos(key);
      const dist = pos.length();
      const delay = impactDelay(dist);

      if (field.hasField && field.strength >= 0.5) {
        // Aurora at poles for strong fields
        this._scheduleAurora(key, pos, pData.displayRadius, delay);
      } else if (!field.hasField) {
        // Impact flash for unshielded planets
        this._scheduleImpactFlash(key, pos, pData.displayRadius, delay);
      }
    }
  }

  _scheduleAurora(key, pos, radius, delay) {
    setTimeout(() => {
      if (!this._active) return;
      // Create aurora glow at poles
      const auroraGeo = new THREE.SphereGeometry(radius * 0.3, 16, 16);
      const auroraMat = new THREE.MeshBasicMaterial({
        color: key === 'earth' ? 0x44ff88 : 0xff8844,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      // North pole aurora
      const northAurora = new THREE.Mesh(auroraGeo, auroraMat.clone());
      northAurora.position.set(pos.x, pos.y + radius * 0.9, pos.z);
      this._scene.add(northAurora);

      // South pole aurora
      const southAurora = new THREE.Mesh(auroraGeo.clone(), auroraMat.clone());
      southAurora.position.set(pos.x, pos.y - radius * 0.9, pos.z);
      this._scene.add(southAurora);

      this._auroras.push(northAurora, southAurora);

      // Fade in, pulse, fade out
      let t = 0;
      const auroraAnim = setInterval(() => {
        t += 0.05;
        const opacity = Math.sin(t * 0.8) * 0.4 * Math.max(0, 1 - t / 8);
        if (northAurora.material) northAurora.material.opacity = Math.max(0, opacity);
        if (southAurora.material) southAurora.material.opacity = Math.max(0, opacity);
        if (t > 8 || !this._active) {
          clearInterval(auroraAnim);
        }
      }, 50);
    }, delay * 1000);
  }

  _scheduleImpactFlash(key, pos, radius, delay) {
    setTimeout(() => {
      if (!this._active) return;
      const flashGeo = new THREE.SphereGeometry(radius * 1.3, 16, 16);
      const flashMat = new THREE.MeshBasicMaterial({
        color: 0xff6633,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const flash = new THREE.Mesh(flashGeo, flashMat);
      flash.position.copy(pos);
      this._scene.add(flash);
      this._impactFlashes.push(flash);

      // Quick flash effect
      let t = 0;
      const flashAnim = setInterval(() => {
        t += 0.1;
        if (t < 0.5) {
          flash.material.opacity = t * 1.2;
        } else {
          flash.material.opacity = Math.max(0, 0.6 - (t - 0.5) * 0.4);
        }
        if (t > 3 || !this._active) {
          clearInterval(flashAnim);
          if (flash.parent) this._scene.remove(flash);
          flash.geometry.dispose();
          flash.material.dispose();
        }
      }, 50);
    }, delay * 1000);
  }

  update(delta) {
    if (!this._active) return;
    this._elapsed += delta;

    // Update particle system
    if (this._particleSystem && this._particleSystem.material.uniforms) {
      this._particleSystem.material.uniforms.uTime.value = this._elapsed;
    }

    // Update magnetosphere shaders
    for (const mag of this._magnetospheres) {
      if (mag.mesh.material.uniforms) {
        mag.mesh.material.uniforms.uTime.value = this._elapsed;

        // Intensify during CME impact
        if (this._cmeActive) {
          const timeSinceCME = this._elapsed - this._cmeStartTime;
          const planetPos = this._getPlanetPos(mag.key);
          const dist = planetPos.length();
          const arrivalTime = (dist / 200) * this._cmeDuration * 0.8;
          if (timeSinceCME > arrivalTime && timeSinceCME < arrivalTime + 5) {
            const intensity = mag.field.strength * 0.15 + 0.3 * Math.sin((timeSinceCME - arrivalTime) * 2);
            mag.mesh.material.uniforms.uIntensity.value = Math.min(intensity, 1.0);
          }
        }
      }

      // Update position to follow planet
      const newPos = this._getPlanetPos(mag.key);
      mag.mesh.position.copy(newPos);
    }

    // Check if CME has finished
    if (this._cmeActive && this._elapsed - this._cmeStartTime > this._cmeDuration + 5) {
      this._cmeActive = false;
    }
  }

  _disposeCME() {
    if (this._particleSystem) {
      this._scene.remove(this._particleSystem);
      this._particleSystem.geometry.dispose();
      this._particleSystem.material.dispose();
      this._particleSystem = null;
    }
  }

  _dispose() {
    this._disposeCME();

    for (const mag of this._magnetospheres) {
      this._scene.remove(mag.mesh);
      mag.mesh.geometry.dispose();
      mag.mesh.material.dispose();
    }
    this._magnetospheres = [];

    for (const tube of this._fieldLines) {
      this._scene.remove(tube);
      tube.geometry.dispose();
      tube.material.dispose();
    }
    this._fieldLines = [];

    for (const aurora of this._auroras) {
      if (aurora.parent) this._scene.remove(aurora);
      aurora.geometry.dispose();
      aurora.material.dispose();
    }
    this._auroras = [];

    for (const flash of this._impactFlashes) {
      if (flash.parent) this._scene.remove(flash);
      flash.geometry.dispose();
      flash.material.dispose();
    }
    this._impactFlashes = [];
  }
}
