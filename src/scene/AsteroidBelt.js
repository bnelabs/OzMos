/**
 * Asteroid belt (InstancedMesh 3D rocks) + Kuiper belt (Points) + notable asteroid meshes.
 */
import * as THREE from 'three';
import { ASTEROIDS, ASTEROID_ORDER } from '../data/asteroids.js';

export class AsteroidBelt {
  constructor(scene) {
    this.scene = scene;
    this.mainBeltMeshes = []; // InstancedMesh array
    this.kuiperBelt = null;
    this._elapsed = 0;
    this._mainBeltGroup = null;
    this._notableAsteroids = {}; // key → { mesh, orbitGroup, tiltGroup, data }

    // Quality level
    const isMobile = window.innerWidth < 768 || /Mobi|Android/i.test(navigator.userAgent);
    this._quality = isMobile ? 'low' : 'high';
  }

  createMainBelt(innerRadius = 50, outerRadius = 58, count = 1500) {
    if (this._quality === 'low') count = 750;

    this._mainBeltGroup = new THREE.Group();

    // Two geometry variants: rounded and angular
    const detailLevel = this._quality === 'high' ? 1 : 0;
    const geoRounded = this._createDeformedIcosahedron(1, Math.max(detailLevel, 1), 42);
    const geoAngular = this._createDeformedIcosahedron(1, 0, 99);

    // Shared material: flat-shaded PBR
    const mat = new THREE.MeshStandardMaterial({
      flatShading: true,
      roughness: 0.9,
      metalness: 0.05,
    });

    // 65/35 split
    const countRounded = Math.floor(count * 0.65);
    const countAngular = count - countRounded;

    const meshRounded = new THREE.InstancedMesh(geoRounded, mat, countRounded);
    const meshAngular = new THREE.InstancedMesh(geoAngular, mat, countAngular);
    meshRounded.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(countRounded * 3), 3);
    meshAngular.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(countAngular * 3), 3);

    // Fill rounded instances
    this._fillInstances(meshRounded, countRounded, innerRadius, outerRadius, 1.5, 0);
    // Fill angular instances
    this._fillInstances(meshAngular, countAngular, innerRadius, outerRadius, 1.5, countRounded);

    meshRounded.instanceMatrix.needsUpdate = true;
    meshAngular.instanceMatrix.needsUpdate = true;
    meshRounded.instanceColor.needsUpdate = true;
    meshAngular.instanceColor.needsUpdate = true;

    // Frustum culling off for instanced meshes (they span large area)
    meshRounded.frustumCulled = false;
    meshAngular.frustumCulled = false;

    this._mainBeltGroup.add(meshRounded);
    this._mainBeltGroup.add(meshAngular);
    this.mainBeltMeshes = [meshRounded, meshAngular];
    this.scene.add(this._mainBeltGroup);
  }

  _createDeformedIcosahedron(radius, detail, seed) {
    const geo = new THREE.IcosahedronGeometry(radius, detail);
    const pos = geo.attributes.position;
    // Apply noise deformation to each vertex
    let s = seed;
    const rand = () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const len = Math.sqrt(x * x + y * y + z * z);
      const noise = 0.75 + rand() * 0.5; // 0.75..1.25
      const newLen = len * noise;
      const scale = newLen / (len || 1);
      pos.setXYZ(i, x * scale, y * scale, z * scale);
    }
    geo.computeVertexNormals();
    return geo;
  }

  _fillInstances(mesh, count, innerR, outerR, verticalSpread, seedOffset) {
    // Asteroid spectral type colors
    const cType = [0.35, 0.33, 0.30]; // C-type 60%
    const sType = [0.55, 0.38, 0.28]; // S-type 30%
    const mType = [0.70, 0.68, 0.65]; // M-type 10%

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = innerR + (outerR - innerR) * (0.5 + 0.5 * this._gaussianRandom());
      const y = this._gaussianRandom() * verticalSpread;

      dummy.position.set(
        Math.cos(angle) * r,
        y,
        Math.sin(angle) * r
      );

      // Random rotation
      dummy.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );

      // Power-law scale with aspect ratio variation
      const baseScale = 0.08 + Math.pow(Math.random(), 4) * 0.35;
      const aspectX = 0.7 + Math.random() * 0.6;
      const aspectY = 0.7 + Math.random() * 0.6;
      const aspectZ = 0.7 + Math.random() * 0.6;
      dummy.scale.set(baseScale * aspectX, baseScale * aspectY, baseScale * aspectZ);

      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      // Color by spectral type
      const typeRoll = Math.random();
      let c;
      if (typeRoll < 0.6) c = cType;
      else if (typeRoll < 0.9) c = sType;
      else c = mType;

      const variation = 0.85 + Math.random() * 0.3;
      color.setRGB(c[0] * variation, c[1] * variation, c[2] * variation);
      mesh.instanceColor.setXYZ(i, color.r, color.g, color.b);
    }
  }

  createKuiperBelt(innerRadius = 140, outerRadius = 180, count = 1000) {
    this.kuiperBelt = this._createPointsBelt(innerRadius, outerRadius, count, 5.0, 'kuiper');
    this.scene.add(this.kuiperBelt);
  }

  _createPointsBelt(innerR, outerR, count, verticalSpread, type) {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = innerR + (outerR - innerR) * (0.5 + 0.5 * this._gaussianRandom());
      const y = this._gaussianRandom() * verticalSpread;

      positions[i * 3] = Math.cos(angle) * r;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(angle) * r;

      const variation = 0.85 + Math.random() * 0.3;
      colors[i * 3] = 0.5 * variation;
      colors[i * 3 + 1] = 0.52 * variation;
      colors[i * 3 + 2] = 0.58 * variation;

      sizes[i] = 0.15 + Math.pow(Math.random(), 4) * 0.6;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const pointTexture = new THREE.CanvasTexture(this._createIcySprite());

    const mat = new THREE.PointsMaterial({
      size: 0.4,
      sizeAttenuation: true,
      map: pointTexture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      opacity: 0.4,
      alphaTest: 0.01,
    });

    return new THREE.Points(geo, mat);
  }

  /** Generate a 64x64 icy/dusty sprite for Kuiper belt */
  _createIcySprite() {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const cx = size / 2, cy = size / 2;

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.4);
    grad.addColorStop(0, 'rgba(200,210,230,0.9)');
    grad.addColorStop(0.3, 'rgba(150,165,190,0.6)');
    grad.addColorStop(0.6, 'rgba(120,130,155,0.3)');
    grad.addColorStop(1, 'rgba(80,90,120,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    return canvas;
  }

  // ==================== Notable Asteroids ====================

  createNotableAsteroids() {
    for (const key of ASTEROID_ORDER) {
      const data = ASTEROIDS[key];
      if (!data) continue;

      // Follow dwarf planet pattern: orbitGroup → tiltGroup → mesh
      const orbitGroup = new THREE.Group();
      this.scene.add(orbitGroup);

      const tiltGroup = new THREE.Group();
      tiltGroup.rotation.x = THREE.MathUtils.degToRad(data.orbitInclination || 0);
      orbitGroup.add(tiltGroup);

      // Create unique procedural geometry per asteroid
      const geo = this._createAsteroidGeometry(key);
      const mat = new THREE.MeshStandardMaterial({
        color: data.color,
        roughness: 0.85,
        metalness: 0.08,
        flatShading: true,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.x = data.orbitRadius;
      mesh.rotation.z = THREE.MathUtils.degToRad(data.axialTilt || 0);
      mesh.userData = { key, type: 'planet' };

      // Scale mesh to displayRadius
      const currentSize = this._getGeoBoundingRadius(geo);
      const targetSize = data.displayRadius;
      const s = targetSize / currentSize;
      mesh.scale.set(s, s, s);

      tiltGroup.add(mesh);

      this._notableAsteroids[key] = {
        mesh,
        orbitGroup,
        tiltGroup,
        data,
      };
    }
  }

  _getGeoBoundingRadius(geo) {
    geo.computeBoundingSphere();
    return geo.boundingSphere.radius;
  }

  _createAsteroidGeometry(key) {
    switch (key) {
      case 'vesta': return this._createVestaGeometry();
      case 'pallas': return this._createPallasGeometry();
      case 'hygiea': return this._createHygieaGeometry();
      case 'juno': return this._createJunoGeometry();
      case 'eros': return this._createErosGeometry();
      default: return new THREE.IcosahedronGeometry(1, 1);
    }
  }

  /** Vesta: sphere with south pole basin (Rheasilvia) + central peak + noise */
  _createVestaGeometry() {
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const pos = geo.attributes.position;
    let seed = 4242;
    const rand = () => { seed = (seed * 16807 + 0) % 2147483647; return seed / 2147483647; };

    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      const len = Math.sqrt(x * x + y * y + z * z);
      const nx = x / len, ny = y / len, nz = z / len;

      // South pole angle (y < 0)
      const southAngle = Math.acos(Math.max(-1, Math.min(1, -ny)));
      let r = len;

      // Rheasilvia basin: depression in the south
      if (southAngle < 0.6) {
        const basinDepth = 0.15 * (1 - southAngle / 0.6);
        r -= basinDepth;
        // Central peak
        if (southAngle < 0.12) {
          r += 0.08 * (1 - southAngle / 0.12);
        }
      }

      // Surface noise
      r *= (0.92 + rand() * 0.16);

      const s = r / len;
      pos.setXYZ(i, x * s, y * s, z * s);
    }
    geo.computeVertexNormals();
    return geo;
  }

  /** Pallas: oblate sphere with crater depressions + heavy noise */
  _createPallasGeometry() {
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const pos = geo.attributes.position;
    let seed = 1802;
    const rand = () => { seed = (seed * 16807 + 0) % 2147483647; return seed / 2147483647; };

    // Pre-generate crater positions
    const craters = [];
    for (let c = 0; c < 6; c++) {
      const theta = rand() * Math.PI * 2;
      const phi = Math.acos(2 * rand() - 1);
      craters.push({
        x: Math.sin(phi) * Math.cos(theta),
        y: Math.sin(phi) * Math.sin(theta),
        z: Math.cos(phi),
        radius: 0.2 + rand() * 0.3,
        depth: 0.05 + rand() * 0.08,
      });
    }

    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      const len = Math.sqrt(x * x + y * y + z * z);
      const nx = x / len, ny = y / len, nz = z / len;

      // Oblate (squash y by 10%)
      let r = len * (1 - 0.1 * ny * ny);

      // Crater depressions
      for (const cr of craters) {
        const dot = nx * cr.x + ny * cr.y + nz * cr.z;
        const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
        if (angle < cr.radius) {
          r -= cr.depth * (1 - angle / cr.radius);
        }
      }

      // Heavy noise
      r *= (0.88 + rand() * 0.24);

      const s = r / len;
      pos.setXYZ(i, x * s, y * s, z * s);
    }
    geo.computeVertexNormals();
    return geo;
  }

  /** Hygiea: nearly spherical with very mild noise */
  _createHygieaGeometry() {
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const pos = geo.attributes.position;
    let seed = 2019;
    const rand = () => { seed = (seed * 16807 + 0) % 2147483647; return seed / 2147483647; };

    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      const len = Math.sqrt(x * x + y * y + z * z);

      // Very mild deformation — nearly spherical
      const r = len * (0.97 + rand() * 0.06);
      const s = r / len;
      pos.setXYZ(i, x * s, y * s, z * s);
    }
    geo.computeVertexNormals();
    return geo;
  }

  /** Juno: angular icosahedron, slightly elongated, with crater depressions */
  _createJunoGeometry() {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const pos = geo.attributes.position;
    let seed = 1804;
    const rand = () => { seed = (seed * 16807 + 0) % 2147483647; return seed / 2147483647; };

    // Craters
    const craters = [];
    for (let c = 0; c < 4; c++) {
      const theta = rand() * Math.PI * 2;
      const phi = Math.acos(2 * rand() - 1);
      craters.push({
        x: Math.sin(phi) * Math.cos(theta),
        y: Math.sin(phi) * Math.sin(theta),
        z: Math.cos(phi),
        radius: 0.25 + rand() * 0.2,
        depth: 0.06 + rand() * 0.06,
      });
    }

    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      const len = Math.sqrt(x * x + y * y + z * z);
      const nx = x / len, ny = y / len, nz = z / len;

      // Elongate along X axis
      let r = len;

      // Crater depressions
      for (const cr of craters) {
        const dot = nx * cr.x + ny * cr.y + nz * cr.z;
        const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
        if (angle < cr.radius) {
          r -= cr.depth * (1 - angle / cr.radius);
        }
      }

      // Moderate noise — angular feel preserved by low-detail icosahedron
      r *= (0.90 + rand() * 0.20);

      const s = r / len;
      // Elongation: stretch x by 1.2
      pos.setXYZ(i, x * s * 1.2, y * s, z * s);
    }
    geo.computeVertexNormals();
    return geo;
  }

  /** Eros: peanut/bi-lobed shape via waist pinch + X-axis elongation */
  _createErosGeometry() {
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const pos = geo.attributes.position;
    let seed = 2000;
    const rand = () => { seed = (seed * 16807 + 0) % 2147483647; return seed / 2147483647; };

    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      const len = Math.sqrt(x * x + y * y + z * z);
      const nx = x / len, ny = y / len, nz = z / len;

      let r = len;

      // Waist pinch: suppress radius near the equatorial center (nx ~ 0)
      const pinch = 1 - 0.3 * Math.exp(-nx * nx / 0.08);
      r *= pinch;

      // Surface noise
      r *= (0.90 + rand() * 0.20);

      const s = r / len;
      // Elongate along X by 1.5 for peanut shape
      pos.setXYZ(i, x * s * 1.5, y * s * 0.85, z * s * 0.85);
    }
    geo.computeVertexNormals();
    return geo;
  }

  /** Get a notable asteroid entry */
  getNotableAsteroid(key) {
    return this._notableAsteroids[key] || null;
  }

  /** Get all notable asteroid keys */
  getNotableAsteroidKeys() {
    return ASTEROID_ORDER;
  }

  _gaussianRandom() {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * 0.3;
  }

  update(delta) {
    this._elapsed += delta;
    // Rotate main belt group (no per-instance updates)
    if (this._mainBeltGroup) {
      this._mainBeltGroup.rotation.y += 0.00008 * delta;
    }
    if (this.kuiperBelt) {
      this.kuiperBelt.rotation.y += 0.00003 * delta;
    }
    // Rotate notable asteroids on their axes
    for (const key of ASTEROID_ORDER) {
      const entry = this._notableAsteroids[key];
      if (entry) {
        const rotSpeed = entry.data.rotationSpeed || 0.005;
        entry.mesh.rotation.y += rotSpeed * delta * 3;
      }
    }
  }

  setVisible(visible) {
    if (this._mainBeltGroup) this._mainBeltGroup.visible = visible;
    if (this.kuiperBelt) this.kuiperBelt.visible = visible;
  }

  dispose() {
    if (this._mainBeltGroup) {
      for (const m of this.mainBeltMeshes) {
        m.geometry.dispose();
        m.material.dispose();
      }
      this.scene.remove(this._mainBeltGroup);
    }
    if (this.kuiperBelt) {
      this.kuiperBelt.geometry.dispose();
      this.kuiperBelt.material.dispose();
      this.scene.remove(this.kuiperBelt);
    }
    for (const key of ASTEROID_ORDER) {
      const entry = this._notableAsteroids[key];
      if (entry) {
        entry.mesh.geometry.dispose();
        entry.mesh.material.dispose();
        this.scene.remove(entry.orbitGroup);
      }
    }
  }
}
