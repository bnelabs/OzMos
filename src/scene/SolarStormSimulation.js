/**
 * SolarStormSimulation — Ultra-realistic CME (Coronal Mass Ejection) visualization
 * with magnetosphere bow shocks, particle deflection, aurora curtains, and impact effects.
 *
 * Simulates:
 * - CME eruption from sun with realistic particle distribution (protons, electrons, helium)
 * - Parker spiral magnetic field structure
 * - Magnetosphere bow shock compression on impact
 * - Aurora curtains at magnetic poles
 * - Atmospheric stripping on unshielded planets
 * - Radiation belt intensification
 */
import * as THREE from 'three';
import {
  cmeVertexShader, cmeFragmentShader,
  magnetosphereVertexShader, magnetosphereFragmentShader,
  auroraVertexShader, auroraFragmentShader,
} from '../shaders/solarStormShader.js';
import { CMEFluxRope } from './CMEFluxRope.js';

const MAGNETIC_FIELDS = {
  mercury:  { strength: 0.01, tilt: 0,    hasField: true,  color: 0x888888 },
  venus:    { strength: 0,    tilt: 0,    hasField: false, color: 0xcc8844 },
  earth:    { strength: 1.0,  tilt: 11.5, hasField: true,  color: 0x4488ff },
  mars:     { strength: 0,    tilt: 0,    hasField: false, color: 0xcc4422 },
  jupiter:  { strength: 20.0, tilt: 9.6,  hasField: true,  color: 0xff8844 },
  saturn:   { strength: 5.8,  tilt: 0,    hasField: true,  color: 0xccaa66 },
  uranus:   { strength: 0.5,  tilt: 59,   hasField: true,  color: 0x44aacc },
  neptune:  { strength: 0.27, tilt: 47,   hasField: true,  color: 0x3355aa },
};

export class SolarStormSimulation {
  constructor(scene, getPlanetWorldPosition, planetData) {
    this._scene = scene;
    this._getPlanetPos = getPlanetWorldPosition;
    this._planetData = planetData;
    this._active = false;
    this._cmeActive = false;
    this._elapsed = 0;
    this._cmeStartTime = 0;
    this._cmeDuration = 35;

    this._particleSystem = null;
    this._shockwaveMesh = null;
    this._magnetospheres = [];
    this._fieldLines = [];
    this._fieldLinesByPlanet = {}; // keyed by planet name for deferred reveal
    this._auroras = [];
    this._impactEffects = [];
    this._intervals = [];

    // Magnetosphere subregions
    this._magnetosheaths = [];
    this._magnetotails = [];

    // Aurora field lines particle system
    this._auroraFieldLines = null;

    // Milestone event tracking
    this._milestones = {
      cmeStart: false,
      halfAU: false,
      earthProximity: false,
      auroraStart: false,
    };
    this._stormTime = 0;

    // CME flux rope geometry
    this._fluxRope = new CMEFluxRope(this._scene);

    const isMobile = window.innerWidth < 768 || /Mobi|Android/i.test(navigator.userAgent);
    this._particleCount = isMobile ? 30000 : 80000;
    this._showFieldLines = !isMobile;
    this._quality = isMobile ? 'low' : 'high';
  }

  get isActive() { return this._active; }

  activate() {
    if (this._active) return;
    this._active = true;
    this._elapsed = 0;
    this._createMagnetospheres();
    setTimeout(() => {
      if (this._active) this._launchCME();
    }, 800);
  }

  deactivate() {
    this._active = false;
    this._cmeActive = false;
    this._stormTime = 0;
    Object.keys(this._milestones).forEach(k => this._milestones[k] = false);
    this._fluxRope.deactivate();
    this._dispose();
    document.dispatchEvent(new CustomEvent('storm-ended'));
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

      // Bow shock size scales logarithmically with field strength
      const bowShockSize = radius * (2.0 + Math.log10(field.strength + 1) * 2.0);
      const bowGeo = new THREE.SphereGeometry(bowShockSize, 48, 48);

      // Deform into magnetopause shape: compressed sun-side, elongated tail
      const posAttr = bowGeo.attributes.position;
      const sunDir = pos.clone().normalize().negate();
      for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i);
        const y = posAttr.getY(i);
        const z = posAttr.getZ(i);
        const localDir = new THREE.Vector3(x, y, z).normalize();
        const dot = localDir.dot(sunDir);

        let factor;
        if (dot > 0) {
          // Sun-facing: compress by ~40%
          factor = 1.0 - dot * 0.4;
        } else {
          // Tail: extend by up to 80%
          factor = 1.0 - dot * 0.8;
        }
        posAttr.setXYZ(i, x * factor, y * factor, z * factor);
      }
      posAttr.needsUpdate = true;
      bowGeo.computeVertexNormals();

      const fieldColor = new THREE.Color(field.color);

      const bowMat = new THREE.ShaderMaterial({
        vertexShader: magnetosphereVertexShader,
        fragmentShader: magnetosphereFragmentShader,
        uniforms: {
          uColor: { value: fieldColor },
          uIntensity: { value: Math.min(field.strength * 0.12, 0.6) },
          uTime: { value: 0 },
          uImpactStrength: { value: 0 },
        },
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      const bowMesh = new THREE.Mesh(bowGeo, bowMat);
      bowMesh.position.copy(pos);
      bowMesh.rotation.z = THREE.MathUtils.degToRad(field.tilt);
      this._scene.add(bowMesh);
      this._magnetospheres.push({ mesh: bowMesh, key, field, bowShockSize });

      // Magnetosheath and magnetotail subregions
      const sheathMesh = this._createMagnetosheath(pos, bowShockSize);
      this._scene.add(sheathMesh);
      this._magnetosheaths.push({ mesh: sheathMesh, key });

      const tailMesh = this._createMagnetotail(pos, bowShockSize);
      this._scene.add(tailMesh);
      this._magnetotails.push({ mesh: tailMesh, key });

      // Magnetic field lines (desktop only, selected planets)
      if (this._showFieldLines && ['earth', 'jupiter', 'saturn'].includes(key)) {
        this._createFieldLines(key, pos, radius, field, fieldColor);
      }
    }
  }

  _createMagnetosheath(pos, bowShockRadius) {
    const sheathRadius = bowShockRadius * 0.75;
    const geo = new THREE.SphereGeometry(sheathRadius, 32, 32);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff8844,
      transparent: true,
      opacity: 0.06,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    return mesh;
  }

  _createMagnetotail(pos, radius) {
    const geo = new THREE.CylinderGeometry(radius * 0.8, radius * 2, radius * 20, 16, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x4466ff,
      transparent: true,
      opacity: 0.04,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.z = Math.PI / 2;
    // Offset so tail extends away from sun: planet pos is approximately along +X from origin
    const sunDir = pos.clone().normalize();
    const tailCenter = pos.clone().addScaledVector(sunDir.negate(), radius * 10);
    mesh.position.copy(tailCenter);
    return mesh;
  }

  _createAuroraFieldLines(pos, radius) {
    const numLines = 24;
    const particlesPerLine = 60;
    const totalParticles = numLines * particlesPerLine;

    const positions = new Float32Array(totalParticles * 3);
    const colors = new Float32Array(totalParticles * 3);
    const energies = new Float32Array(totalParticles);

    for (let line = 0; line < numLines; line++) {
      const longitude = (line / numLines) * Math.PI * 2;
      const L = 2.5 * radius;
      const poleSign = line < numLines / 2 ? 1 : -1;

      for (let p = 0; p < particlesPerLine; p++) {
        const idx = (line * particlesPerLine + p) * 3;
        const latFrac = p / (particlesPerLine - 1);
        const latitude = THREE.MathUtils.degToRad(20 + latFrac * 55) * poleSign;
        const r = L * Math.cos(latitude) * Math.cos(latitude);

        positions[idx]     = pos.x + r * Math.cos(latitude) * Math.cos(longitude);
        positions[idx + 1] = pos.y + r * Math.sin(latitude);
        positions[idx + 2] = pos.z + r * Math.cos(latitude) * Math.sin(longitude);

        const energy = 1.0 - latFrac;
        energies[line * particlesPerLine + p] = energy;
        colors[idx]     = energy < 0.5 ? 0.5 + energy : 0.0;
        colors[idx + 1] = energy > 0.3 ? energy * 1.2 : 0.0;
        colors[idx + 2] = energy > 0.5 ? 1.0 : energy * 2;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute('energy', new THREE.Float32BufferAttribute(energies, 1));

    const mat = new THREE.PointsMaterial({
      size: 0.08,
      vertexColors: true,
      transparent: true,
      opacity: 0.0, // starts invisible, shown on CME impact
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const points = new THREE.Points(geo, mat);
    this._auroraFieldLines = points;
    return points;
  }

  _triggerReconnection() {
    if (!this._active) return;
    const geo = new THREE.BufferGeometry();
    const pts = [
      new THREE.Vector3(-0.5, 0.5, 0),
      new THREE.Vector3(0.5, -0.5, 0),
    ];
    geo.setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
    });
    const line = new THREE.Line(geo, mat);

    // Position at Earth's bow shock boundary if available
    const earthMag = this._magnetospheres.find(m => m.key === 'earth');
    if (earthMag) {
      const planetPos = earthMag.mesh.position.clone();
      line.position.copy(planetPos);
      line.position.x += (earthMag.bowShockSize || 3) * 0.8;
    }
    this._scene.add(line);
    document.dispatchEvent(new CustomEvent('magnetic-reconnection'));
    setTimeout(() => {
      line.material.dispose();
      line.geometry.dispose();
      if (line.parent) this._scene.remove(line);
    }, 200);
  }

  _createFieldLines(key, pos, radius, field, color) {
    const lineCount = 12;
    for (let i = 0; i < lineCount; i++) {
      const angle = (i / lineCount) * Math.PI * 2;
      const points = [];

      // Dipole field line parametric equation
      const L = 1.5 + field.strength * 0.2; // L-shell parameter
      for (let t = 0; t <= 1; t += 0.015) {
        const theta = t * Math.PI;
        const r = radius * L * Math.sin(theta) * Math.sin(theta);
        const x = r * Math.sin(theta) * Math.cos(angle);
        const y = r * Math.cos(theta);
        const z = r * Math.sin(theta) * Math.sin(angle);
        points.push(new THREE.Vector3(x + pos.x, y + pos.y, z + pos.z));
      }

      if (points.length < 3) continue;

      const curve = new THREE.CatmullRomCurve3(points);
      const tubeGeo = new THREE.TubeGeometry(curve, 48, 0.02, 3, false);
      const tubeMat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const tube = new THREE.Mesh(tubeGeo, tubeMat);
      tube.visible = false; // hidden until CME arrives at this planet
      this._scene.add(tube);
      this._fieldLines.push(tube);
      if (!this._fieldLinesByPlanet[key]) this._fieldLinesByPlanet[key] = [];
      this._fieldLinesByPlanet[key].push(tube);
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
    const types = new Float32Array(count); // 0=proton, 1=electron, 2=helium

    // CME cone parameters — realistic angular spread
    const coneHalfAngle = Math.PI * 0.35;

    // Pick a random direction for this CME (in ecliptic plane)
    const cmeDir = Math.random() * Math.PI * 2;
    const cmeDirVec = new THREE.Vector3(Math.cos(cmeDir), 0, Math.sin(cmeDir));

    for (let i = 0; i < count; i++) {
      // Particle type distribution: 96% protons, 3.5% helium, 0.5% electrons
      const typeRand = Math.random();
      types[i] = typeRand < 0.96 ? 0 : (typeRand < 0.995 ? 2 : 1);

      // Origin: on sun surface with realistic distribution
      const phi = Math.random() * Math.PI * 2;
      const theta = Math.random() * coneHalfAngle * 0.25;
      const sunR = 8;

      // Rotate origin to face CME direction
      const localX = Math.sin(theta) * Math.cos(phi);
      const localY = Math.sin(theta) * Math.sin(phi) * 0.4;
      const localZ = Math.cos(theta);

      origins[i * 3]     = cmeDirVec.x * localZ * sunR + localX * sunR;
      origins[i * 3 + 1] = localY * sunR;
      origins[i * 3 + 2] = cmeDirVec.z * localZ * sunR + localX * sunR * 0.3;

      // Velocity: directed along CME with spread
      // Speed varies by type: electrons faster, helium slower
      const baseSpeed = types[i] === 1 ? 8 : (types[i] === 2 ? 2.5 : 4);
      const speed = baseSpeed + Math.random() * baseSpeed * 1.5;
      const spreadPhi = (Math.random() - 0.5) * coneHalfAngle;
      const spreadTheta = (Math.random() - 0.5) * coneHalfAngle;

      velocities[i * 3]     = cmeDirVec.x * speed * Math.cos(spreadTheta) + Math.sin(spreadTheta) * Math.cos(spreadPhi) * speed * 0.3;
      velocities[i * 3 + 1] = Math.sin(spreadPhi) * speed * 0.2;
      velocities[i * 3 + 2] = cmeDirVec.z * speed * Math.cos(spreadTheta) + Math.sin(spreadTheta) * Math.sin(spreadPhi) * speed * 0.3;

      // Energy: power-law distribution (many low, few high)
      energies[i] = Math.pow(Math.random(), 1.5);

      // Staggered launch: main burst over ~3 seconds, with continued emission
      startTimes[i] = this._cmeStartTime + Math.pow(Math.random(), 0.7) * 3.0;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('aOrigin', new THREE.BufferAttribute(origins, 3));
    geometry.setAttribute('aVelocity', new THREE.BufferAttribute(velocities, 3));
    geometry.setAttribute('aEnergy', new THREE.BufferAttribute(energies, 1));
    geometry.setAttribute('aStartTime', new THREE.BufferAttribute(startTimes, 1));
    geometry.setAttribute('aType', new THREE.BufferAttribute(types, 1));

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

    // Create CME shockwave ring
    this._createShockwave();

    // Activate flux rope along CME direction
    this._fluxRope.activate(new THREE.Vector3(0, 0, 0), cmeDirVec);

    // Schedule planet impacts
    this._scheduleImpacts();
  }

  _createShockwave() {
    // Expanding ring of compressed plasma at the CME leading edge
    const ringGeo = new THREE.TorusGeometry(10, 0.3, 8, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff8833,
      transparent: true,
      opacity: 0.15,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this._shockwaveMesh = new THREE.Mesh(ringGeo, ringMat);
    this._shockwaveMesh.rotation.x = Math.PI / 2;
    this._scene.add(this._shockwaveMesh);
  }

  _scheduleImpacts() {
    const impactDelay = (distFromSun) => {
      return (distFromSun / 200) * this._cmeDuration * 0.7;
    };

    for (const [key, field] of Object.entries(MAGNETIC_FIELDS)) {
      const pData = this._planetData[key];
      if (!pData) continue;
      const pos = this._getPlanetPos(key);
      const dist = pos.length();
      const delay = impactDelay(dist);

      if (field.hasField && field.strength >= 0.5) {
        this._scheduleAurora(key, pos, pData.displayRadius, delay, field);
      } else if (!field.hasField) {
        this._scheduleAtmosphericImpact(key, pos, pData.displayRadius, delay);
      } else {
        // Weak field (Mercury) — partial shield, partial impact
        this._scheduleWeakFieldImpact(key, pos, pData.displayRadius, delay);
      }
    }
  }

  _scheduleAurora(key, pos, radius, delay, field) {
    const timer = setTimeout(() => {
      if (!this._active) return;

      // Reveal pre-created field lines now that CME has arrived
      if (this._fieldLinesByPlanet[key]) {
        for (const line of this._fieldLinesByPlanet[key]) {
          line.visible = true;
        }
      }

      // Create aurora curtain geometry at north and south poles
      const auroraRadius = radius * 0.85;
      const auroraHeight = radius * 0.4;
      const segments = 32;

      for (const pole of [1, -1]) {
        const auroraGeo = new THREE.CylinderGeometry(
          auroraRadius * 0.3, auroraRadius, auroraHeight, segments, 4, true
        );
        const auroraColor = key === 'earth' ? new THREE.Color(0.2, 1.0, 0.4) :
                            key === 'jupiter' ? new THREE.Color(1.0, 0.5, 0.2) :
                            new THREE.Color(0.3, 0.8, 0.9);

        const auroraMat = new THREE.ShaderMaterial({
          vertexShader: auroraVertexShader,
          fragmentShader: auroraFragmentShader,
          uniforms: {
            uTime: { value: 0 },
            uIntensity: { value: 0 },
            uColor: { value: auroraColor },
          },
          transparent: true,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });

        const auroraMesh = new THREE.Mesh(auroraGeo, auroraMat);
        auroraMesh.position.set(pos.x, pos.y + pole * radius * 0.8, pos.z);
        if (pole === -1) auroraMesh.rotation.x = Math.PI;
        this._scene.add(auroraMesh);
        this._auroras.push({ mesh: auroraMesh, key, startTime: this._elapsed });
      }

      // Add aurora field lines if not yet created (Earth only for performance)
      if (key === 'earth' && !this._auroraFieldLines) {
        const fieldLinesObj = this._createAuroraFieldLines(pos, radius);
        this._scene.add(fieldLinesObj);
      }

      // Show aurora field lines for Earth
      if (key === 'earth' && this._auroraFieldLines) {
        this._auroraFieldLines.material.opacity = 0.5;
      }

      // Animate aurora intensity: ramp up, sustain, fade
      let auroraTime = 0;
      const auroraAnim = setInterval(() => {
        auroraTime += 0.05;
        const rampUp = smoothstep(0, 1, auroraTime);
        const fadeOut = 1.0 - smoothstep(6, 10, auroraTime);
        const flicker = Math.sin(auroraTime * 4) * 0.15 + 0.85;
        const intensity = rampUp * fadeOut * flicker * Math.min(field.strength * 0.3, 0.8);

        for (const aurora of this._auroras) {
          if (aurora.key === key && aurora.mesh.material.uniforms) {
            aurora.mesh.material.uniforms.uIntensity.value = Math.max(0, intensity);
            aurora.mesh.material.uniforms.uTime.value = this._elapsed;
          }
        }

        if (auroraTime > 10 || !this._active) {
          clearInterval(auroraAnim);
        }
      }, 50);
      this._intervals.push(auroraAnim);
    }, delay * 1000);
    this._intervals.push(timer);
  }

  _scheduleAtmosphericImpact(key, pos, radius, delay) {
    const timer = setTimeout(() => {
      if (!this._active) return;

      // Glowing impact on atmosphere — expanding heated ring
      const impactGeo = new THREE.SphereGeometry(radius * 1.2, 24, 24);
      const impactMat = new THREE.MeshBasicMaterial({
        color: key === 'venus' ? 0xff6633 : 0xff4422,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const impactMesh = new THREE.Mesh(impactGeo, impactMat);
      impactMesh.position.copy(pos);
      this._scene.add(impactMesh);
      this._impactEffects.push(impactMesh);

      // Atmospheric stripping particles
      if (this._quality === 'high') {
        this._createStrippingParticles(pos, radius, key);
      }

      // Impact flash animation
      let flashTime = 0;
      const flashAnim = setInterval(() => {
        flashTime += 0.08;
        if (flashTime < 0.5) {
          impactMat.opacity = flashTime * 0.8;
          impactMesh.scale.setScalar(1 + flashTime * 0.3);
        } else {
          impactMat.opacity = Math.max(0, 0.4 * (1 - (flashTime - 0.5) / 3));
          impactMesh.scale.setScalar(1.15 + (flashTime - 0.5) * 0.1);
        }
        if (flashTime > 4 || !this._active) {
          clearInterval(flashAnim);
          if (impactMesh.parent) this._scene.remove(impactMesh);
          impactMesh.geometry.dispose();
          impactMesh.material.dispose();
        }
      }, 50);
      this._intervals.push(flashAnim);
    }, delay * 1000);
    this._intervals.push(timer);
  }

  _scheduleWeakFieldImpact(key, pos, radius, delay) {
    const timer = setTimeout(() => {
      if (!this._active) return;
      // Partial magnetosphere flash for Mercury
      const flashGeo = new THREE.SphereGeometry(radius * 1.5, 16, 16);
      const flashMat = new THREE.MeshBasicMaterial({
        color: 0xffaa44,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const flashMesh = new THREE.Mesh(flashGeo, flashMat);
      flashMesh.position.copy(pos);
      this._scene.add(flashMesh);
      this._impactEffects.push(flashMesh);

      let t = 0;
      const anim = setInterval(() => {
        t += 0.06;
        flashMat.opacity = Math.sin(t * 2) * 0.15 * Math.max(0, 1 - t / 5);
        if (t > 5 || !this._active) {
          clearInterval(anim);
          if (flashMesh.parent) this._scene.remove(flashMesh);
          flashMesh.geometry.dispose();
          flashMesh.material.dispose();
        }
      }, 50);
      this._intervals.push(anim);
    }, delay * 1000);
    this._intervals.push(timer);
  }

  _createStrippingParticles(pos, radius, key) {
    // Small particles ejected from unshielded atmosphere
    const count = 500;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    const color = key === 'venus' ? [1, 0.6, 0.2] : [1, 0.3, 0.1];
    for (let i = 0; i < count; i++) {
      const phi = Math.random() * Math.PI * 2;
      const theta = Math.random() * Math.PI;
      const r = radius * (1 + Math.random() * 0.5);
      positions[i * 3]     = pos.x + Math.sin(theta) * Math.cos(phi) * r;
      positions[i * 3 + 1] = pos.y + Math.cos(theta) * r;
      positions[i * 3 + 2] = pos.z + Math.sin(theta) * Math.sin(phi) * r;
      colors[i * 3] = color[0]; colors[i * 3 + 1] = color[1]; colors[i * 3 + 2] = color[2];
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.08,
      transparent: true,
      opacity: 0.4,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const particles = new THREE.Points(geo, mat);
    this._scene.add(particles);
    this._impactEffects.push(particles);

    // Animate: particles drift away from sun
    let t = 0;
    const anim = setInterval(() => {
      t += 0.05;
      const posArr = particles.geometry.attributes.position.array;
      for (let i = 0; i < count; i++) {
        posArr[i * 3]     += (Math.random() - 0.3) * 0.02;
        posArr[i * 3 + 1] += (Math.random() - 0.5) * 0.01;
        posArr[i * 3 + 2] += (Math.random() - 0.3) * 0.02;
      }
      particles.geometry.attributes.position.needsUpdate = true;
      mat.opacity = Math.max(0, 0.4 * (1 - t / 6));

      if (t > 6 || !this._active) {
        clearInterval(anim);
        if (particles.parent) this._scene.remove(particles);
        particles.geometry.dispose();
        particles.material.dispose();
      }
    }, 50);
    this._intervals.push(anim);
  }

  update(delta) {
    if (!this._active) return;
    this._elapsed += delta;
    this._stormTime += delta;

    // Milestone event dispatch
    if (!this._milestones.cmeStart && this._stormTime > 0.5) {
      this._milestones.cmeStart = true;
      this._dispatchMilestone('cmeStart', 'storm.cmeEruption');
    }
    if (!this._milestones.halfAU && this._stormTime > 5) {
      this._milestones.halfAU = true;
      this._dispatchMilestone('halfAU', 'storm.halfAU');
    }
    if (!this._milestones.earthProximity && this._stormTime > 12) {
      this._milestones.earthProximity = true;
      this._dispatchMilestone('earthProximity', 'storm.earthProximity');
    }
    if (!this._milestones.auroraStart && this._stormTime > 18) {
      this._milestones.auroraStart = true;
      this._dispatchMilestone('auroraStart', 'storm.aurora');
    }

    // Update flux rope
    this._fluxRope.update(delta);

    // Update particle system
    if (this._particleSystem && this._particleSystem.material.uniforms) {
      this._particleSystem.material.uniforms.uTime.value = this._elapsed;
    }

    // Update shockwave expansion
    if (this._shockwaveMesh && this._cmeActive) {
      const timeSinceCME = this._elapsed - this._cmeStartTime;
      const expansion = timeSinceCME * 5;
      this._shockwaveMesh.scale.set(expansion, expansion, expansion * 0.3);
      this._shockwaveMesh.material.opacity = Math.max(0, 0.15 * (1 - timeSinceCME / this._cmeDuration));
      if (timeSinceCME > this._cmeDuration) {
        this._scene.remove(this._shockwaveMesh);
        this._shockwaveMesh.geometry.dispose();
        this._shockwaveMesh.material.dispose();
        this._shockwaveMesh = null;
      }
    }

    // Random magnetic reconnection flash at magnetopause (only during active CME)
    if (this._cmeActive && Math.random() < 0.003) {
      this._triggerReconnection();
    }

    // Animate aurora field line particles
    if (this._auroraFieldLines) {
      const elapsed = Date.now() * 0.001;
      this._auroraFieldLines.material.opacity = Math.max(
        0,
        this._auroraFieldLines.material.opacity * 0.9995 +
          0.3 * Math.sin(elapsed * 2.0) * (this._auroraFieldLines.material.opacity > 0.01 ? 1 : 0),
      );
      this._auroraFieldLines.geometry.attributes.position.needsUpdate = false;
    }

    // Update magnetospheres
    for (const mag of this._magnetospheres) {
      if (mag.mesh.material.uniforms) {
        mag.mesh.material.uniforms.uTime.value = this._elapsed;

        // Dynamic bow shock compression during CME impact
        if (this._cmeActive) {
          const timeSinceCME = this._elapsed - this._cmeStartTime;
          const planetPos = this._getPlanetPos(mag.key);
          const dist = planetPos.length();
          const arrivalTime = (dist / 200) * this._cmeDuration * 0.7;

          if (timeSinceCME > arrivalTime && timeSinceCME < arrivalTime + 8) {
            const impactPhase = (timeSinceCME - arrivalTime) / 8;
            // Ramp up impact, then slowly recover
            const impactStrength = Math.sin(impactPhase * Math.PI) * Math.min(mag.field.strength * 0.2, 0.8);
            mag.mesh.material.uniforms.uImpactStrength.value = Math.max(0, impactStrength);

            // Compress bow shock on sun-facing side during impact
            const compression = 1.0 - impactStrength * 0.15;
            mag.mesh.scale.setScalar(compression);

            // Intensify glow
            const intensity = mag.field.strength * 0.12 + impactStrength * 0.4;
            mag.mesh.material.uniforms.uIntensity.value = Math.min(intensity, 1.0);
          } else {
            mag.mesh.material.uniforms.uImpactStrength.value *= 0.95; // Decay
            mag.mesh.scale.lerp(new THREE.Vector3(1, 1, 1), 0.02);
          }
        }
      }

      // Update position to follow planet
      const newPos = this._getPlanetPos(mag.key);
      mag.mesh.position.copy(newPos);
    }

    // Update magnetosheath and magnetotail positions to follow planets
    for (const sheath of this._magnetosheaths) {
      const newPos = this._getPlanetPos(sheath.key);
      sheath.mesh.position.copy(newPos);
    }
    for (const tail of this._magnetotails) {
      const newPos = this._getPlanetPos(tail.key);
      // Recalculate tail center: extend anti-solar
      const mag = this._magnetospheres.find(m => m.key === tail.key);
      const tailLen = (mag ? mag.bowShockSize : 3) * 10;
      const sunDir = newPos.clone().normalize().negate();
      tail.mesh.position.copy(newPos.clone().addScaledVector(sunDir, tailLen));
    }

    // Check if CME has finished
    if (this._cmeActive && this._elapsed - this._cmeStartTime > this._cmeDuration + 10) {
      this._cmeActive = false;
    }
  }

  _dispatchMilestone(type, i18nKey) {
    const event = new CustomEvent('storm-milestone', {
      detail: { type, i18nKey },
      bubbles: true,
    });
    document.dispatchEvent(event);
  }

  _disposeCME() {
    if (this._particleSystem) {
      this._scene.remove(this._particleSystem);
      this._particleSystem.geometry.dispose();
      this._particleSystem.material.dispose();
      this._particleSystem = null;
    }
    if (this._shockwaveMesh) {
      this._scene.remove(this._shockwaveMesh);
      this._shockwaveMesh.geometry.dispose();
      this._shockwaveMesh.material.dispose();
      this._shockwaveMesh = null;
    }
    this._fluxRope.deactivate();
  }

  _dispose() {
    // Clear all intervals/timeouts
    for (const id of this._intervals) {
      clearInterval(id);
      clearTimeout(id);
    }
    this._intervals = [];

    this._disposeCME();

    for (const mag of this._magnetospheres) {
      this._scene.remove(mag.mesh);
      mag.mesh.geometry.dispose();
      mag.mesh.material.dispose();
    }
    this._magnetospheres = [];

    for (const sheath of this._magnetosheaths) {
      if (sheath.mesh.parent) this._scene.remove(sheath.mesh);
      sheath.mesh.geometry.dispose();
      sheath.mesh.material.dispose();
    }
    this._magnetosheaths = [];

    for (const tail of this._magnetotails) {
      if (tail.mesh.parent) this._scene.remove(tail.mesh);
      tail.mesh.geometry.dispose();
      tail.mesh.material.dispose();
    }
    this._magnetotails = [];

    if (this._auroraFieldLines) {
      if (this._auroraFieldLines.parent) this._scene.remove(this._auroraFieldLines);
      this._auroraFieldLines.geometry.dispose();
      this._auroraFieldLines.material.dispose();
      this._auroraFieldLines = null;
    }

    for (const tube of this._fieldLines) {
      this._scene.remove(tube);
      tube.geometry.dispose();
      tube.material.dispose();
    }
    this._fieldLines = [];
    this._fieldLinesByPlanet = {};

    for (const aurora of this._auroras) {
      if (aurora.mesh.parent) this._scene.remove(aurora.mesh);
      aurora.mesh.geometry.dispose();
      aurora.mesh.material.dispose();
    }
    this._auroras = [];

    for (const effect of this._impactEffects) {
      if (effect.parent) this._scene.remove(effect);
      effect.geometry.dispose();
      effect.material.dispose();
    }
    this._impactEffects = [];
  }
}

// Helper smoothstep for JS
function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
