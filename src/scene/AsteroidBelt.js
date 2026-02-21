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

  createMainBelt(innerRadius = 60, outerRadius = 85, count = 500) {
    if (this._quality === 'low') count = 180;

    this._mainBeltGroup = new THREE.Group();

    // Two geometry variants: rounded (gentle bumps) and angular (sharper facets)
    const geoRounded = this._createDeformedIcosahedron(1, 2, 42);             // 0.80–1.20
    const geoAngular = this._createDeformedIcosahedron(1, 2, 99, 0.74, 1.26); // slightly wider

    // Shared material: PBR rock base; moon texture loaded async for photographic detail
    const mat = new THREE.MeshStandardMaterial({
      roughness: 0.92,
      metalness: 0.08,
    });
    // Load moon texture once — each instance's spectral color (instanceColor) tints it
    new THREE.TextureLoader().load('/textures/moon_2k.jpg', (moonTex) => {
      moonTex.wrapS = THREE.RepeatWrapping;
      moonTex.wrapT = THREE.RepeatWrapping;
      mat.map = moonTex;
      mat.needsUpdate = true;
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

  _createDeformedIcosahedron(radius, detail, seed, noiseMin = 0.80, noiseMax = 1.20) {
    const geo = new THREE.IcosahedronGeometry(radius, detail);
    const pos = geo.attributes.position;
    const range = noiseMax - noiseMin;
    // Seed-dependent offsets so the two geometry variants look distinct
    const ox = (seed % 97)  * 0.137;
    const oy = (seed % 113) * 0.191;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const len = Math.sqrt(x * x + y * y + z * z) || 1;
      const nx = x / len, ny = y / len, nz = z / len;
      // Position-coherent noise using 3D surface coords — no UV-seam spikes
      const f1 = this._valueNoise(nx * 2.1 + nz * 0.7 + ox, ny * 2.1 + nz * 0.5 + oy);
      const f2 = this._valueNoise(nx * 4.3 + ny * 0.8 + ox, nz * 4.3 + nx * 0.6 + oy) * 0.40;
      const noise = noiseMin + ((f1 + f2) / 1.4) * range;
      const clamped = Math.max(noiseMin, Math.min(noiseMax, noise));
      pos.setXYZ(i, x * clamped, y * clamped, z * clamped);
    }
    geo.computeVertexNormals();
    return geo;
  }

  _fillInstances(mesh, count, innerR, outerR, verticalSpread, seedOffset) {
    // Asteroid spectral type colors (RGB linear)
    const cType = [0.35, 0.33, 0.30]; // C-type: dark grey-brown
    const sType = [0.55, 0.38, 0.28]; // S-type: tan-grey
    const mType = [0.70, 0.68, 0.65]; // M-type: silver-metallic

    const midR = (innerR + outerR) / 2; // spectral gradient boundary

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

      // Power-law scale: mostly tiny, very few large — keeps belt visually sparse
      const baseScale = 0.04 + Math.pow(Math.random(), 4) * 0.12;
      const aspectX = 0.7 + Math.random() * 0.6;
      const aspectY = 0.7 + Math.random() * 0.6;
      const aspectZ = 0.7 + Math.random() * 0.6;
      dummy.scale.set(baseScale * aspectX, baseScale * aspectY, baseScale * aspectZ);

      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      // Spectral gradient: inner belt = more S-type, outer = more C-type
      const typeRoll = Math.random();
      let c;
      if (r < midR) {
        // Inner belt: 50% S / 30% C / 20% M
        if (typeRoll < 0.50) c = sType;
        else if (typeRoll < 0.80) c = cType;
        else c = mType;
      } else {
        // Outer belt: 70% C / 20% S / 10% M
        if (typeRoll < 0.70) c = cType;
        else if (typeRoll < 0.90) c = sType;
        else c = mType;
      }

      const variation = 0.85 + Math.random() * 0.3;
      color.setRGB(c[0] * variation, c[1] * variation, c[2] * variation);
      mesh.instanceColor.setXYZ(i, color.r, color.g, color.b);
    }
  }

  createKuiperBelt(innerRadius = 140, outerRadius = 180, count = 40) {
    // Real Kuiper belt is vastly sparser than the asteroid belt — just a thin distant scatter.
    if (this._quality === 'low') count = 18;
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
      size: 0.18,           // reduced from 0.55 — distant icy specks, not inflated blobs
      sizeAttenuation: true,
      map: pointTexture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      opacity: 0.50,
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

      const orbitGroup = new THREE.Group();
      this.scene.add(orbitGroup);

      const tiltGroup = new THREE.Group();
      tiltGroup.rotation.x = THREE.MathUtils.degToRad(data.orbitInclination || 0);
      orbitGroup.add(tiltGroup);

      const config = this._getAsteroidConfig(key);
      const geo    = this._createAsteroidGeometry(key);
      const mat    = this._generateAsteroidMaterial(key);  // canvas textures generated here

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.x = data.orbitRadius;
      mesh.rotation.z = THREE.MathUtils.degToRad(data.axialTilt || 0);
      mesh.userData   = { key, type: 'planet' };

      // Uniform scale to reach displayRadius, then apply per-axis elongation from config
      geo.computeBoundingSphere();
      const s  = data.displayRadius / geo.boundingSphere.radius;
      const cs = config.scale || [1, 1, 1];
      mesh.scale.set(s * cs[0], s * cs[1], s * cs[2]);

      tiltGroup.add(mesh);
      this._notableAsteroids[key] = { mesh, orbitGroup, tiltGroup, data };
    }
  }

  // ─── Per-asteroid configuration ─────────────────────────────────────────────

  /**
   * Returns spectral type, base colour, elongation scale, and crater array.
   * Craters use standard spherical convention:
   *   d = direction vector, radius = angular radius (rad),
   *   depth = floor darkness, ejecta = rim brightness.
   */
  _getAsteroidConfig(key) {
    // dir(lat_deg, lon_deg) → unit direction vector
    const d = (lat, lon) => {
      const la = lat * Math.PI / 180;
      const lo = lon * Math.PI / 180;
      const th = Math.PI / 2 - la;
      return [Math.sin(th) * Math.cos(lo), Math.cos(th), Math.sin(th) * Math.sin(lo)];
    };

    switch (key) {
      case 'vesta':
        return {
          spectralType: 'V',
          baseRgb: [0.50, 0.46, 0.40],
          scale: [1.0, 1.0, 1.0],
          craters: [
            { d: d(-85,   0), radius: 0.88, depth: 0.26, ejecta: 0.10 }, // Rheasilvia
            { d: d(-62,  60), radius: 0.55, depth: 0.16, ejecta: 0.06 }, // Veneneia
            { d: d( 26, 145), radius: 0.14, depth: 0.08, ejecta: 0.32 }, // Olbers (bright)
            { d: d(  8, 240), radius: 0.11, depth: 0.07, ejecta: 0.22 },
            { d: d(-14,  46), radius: 0.09, depth: 0.07, ejecta: 0.18 },
            { d: d( 49, 200), radius: 0.08, depth: 0.06, ejecta: 0.14 },
            { d: d( 30,  30), radius: 0.07, depth: 0.05, ejecta: 0.12 },
            { d: d(-40, 286), radius: 0.06, depth: 0.05, ejecta: 0.10 },
          ],
        };

      case 'pallas':
        return {
          spectralType: 'B',
          baseRgb: [0.18, 0.18, 0.20],
          scale: [1.0, 0.88, 0.88],
          craters: [
            { d: d( 32,  46), radius: 0.45, depth: 0.12, ejecta: 0.04 },
            { d: d(-34, 120), radius: 0.38, depth: 0.10, ejecta: 0.04 },
            { d: d( 11, 218), radius: 0.30, depth: 0.09, ejecta: 0.03 },
            { d: d(-17, 315), radius: 0.25, depth: 0.08, ejecta: 0.03 },
            { d: d( 63,  86), radius: 0.20, depth: 0.07, ejecta: 0.02 },
            { d: d(-46, 229), radius: 0.18, depth: 0.07, ejecta: 0.02 },
            { d: d( 23,  17), radius: 0.14, depth: 0.06, ejecta: 0.02 },
            { d: d( 78, 155), radius: 0.12, depth: 0.05, ejecta: 0.02 },
          ],
        };

      case 'hygiea':
        return {
          spectralType: 'C',
          baseRgb: [0.12, 0.12, 0.11],
          scale: [1.0, 1.0, 1.0],
          craters: [
            { d: d(  6,  69), radius: 0.22, depth: 0.05, ejecta: 0.02 },
            { d: d(-29, 200), radius: 0.16, depth: 0.04, ejecta: 0.02 },
            { d: d( 46, 286), radius: 0.12, depth: 0.03, ejecta: 0.01 },
            { d: d(-60,  42), radius: 0.10, depth: 0.03, ejecta: 0.01 },
          ],
        };

      case 'juno':
        return {
          spectralType: 'S',
          baseRgb: [0.44, 0.38, 0.30],
          scale: [1.2, 1.0, 1.0],
          craters: [
            { d: d( 11,  86), radius: 0.30, depth: 0.16, ejecta: 0.22 },
            { d: d(-23, 218), radius: 0.24, depth: 0.13, ejecta: 0.18 },
            { d: d( 40, 315), radius: 0.20, depth: 0.12, ejecta: 0.16 },
            { d: d( -6,  29), radius: 0.16, depth: 0.10, ejecta: 0.14 },
            { d: d( 60, 172), radius: 0.12, depth: 0.08, ejecta: 0.10 },
          ],
        };

      case 'eros':
        return {
          spectralType: 'S',
          baseRgb: [0.56, 0.44, 0.32],
          scale: [1.55, 0.82, 0.82],        // elongated peanut (mesh-scale, not geometry)
          craters: [
            { d: d( 17, 115), radius: 0.30, depth: 0.26, ejecta: 0.20 }, // Psyche
            { d: d(  0,   0), radius: 0.50, depth: 0.08, ejecta: 0.00 }, // Himeros saddle
            { d: d(-29, 258), radius: 0.16, depth: 0.14, ejecta: 0.12 }, // Shoemaker
            { d: d( 43,  69), radius: 0.13, depth: 0.11, ejecta: 0.09 },
            { d: d(-11, 178), radius: 0.10, depth: 0.09, ejecta: 0.08 },
            { d: d( 63, 315), radius: 0.08, depth: 0.07, ejecta: 0.07 },
          ],
        };

      default:
        return { spectralType: 'C', baseRgb: [0.20, 0.20, 0.18], scale: [1, 1, 1], craters: [] };
    }
  }

  // ─── Geometry (SphereGeometry + shape deformation) ──────────────────────────

  /**
   * Unified asteroid geometry using SMOOTH COHERENT noise via _valueNoise.
   *
   * Why: per-vertex independent random displacement (the previous approach) makes
   * adjacent vertices have wildly different radii → sharp triangular spikes visible
   * as "2D triangles loosely attached". Smooth noise keyed on angular position
   * creates large, gradual rocky undulations instead.
   *
   * Each asteroid has unique phase offsets so they all look distinct.
   * Shape-specific features (Vesta basin, Eros waist) are layered on top.
   */
  _createAsteroidGeometry(key) {
    const segs = key === 'hygiea' ? 48 : 64;
    const geo  = new THREE.SphereGeometry(1, segs, Math.floor(segs / 2));
    const pos  = geo.attributes.position;

    // Per-asteroid phase offsets → unique appearance per body
    const phases = {
      vesta:  [1.50, 2.30, 3.70, 0.90],
      pallas: [4.70, 8.10, 2.40, 6.30],
      hygiea: [2.20, 5.90, 1.10, 7.80],
      juno:   [6.30, 3.40, 9.20, 1.50],
      eros:   [9.10, 1.80, 5.50, 3.20],
    };
    const [ox, oy, ox2, oy2] = phases[key] || [0, 0, 0, 0];

    // Reduced amplitudes: texture provides visual detail, geometry just gives a potato shape
    const amp = { vesta: 0.06, pallas: 0.08, hygiea: 0.03, juno: 0.07, eros: 0.06 };
    const noiseAmp = amp[key] ?? 0.06;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const len = Math.sqrt(x*x + y*y + z*z) || 1;
      const nx  = x / len, ny = y / len, nz = z / len;

      // Use 3D normalised position as noise input — no phi/atan2 seam spikes
      const f1 = this._valueNoise(nx * 1.3 + nz * 0.6 + ox,  ny * 1.6 + nx * 0.4 + oy);
      const f2 = this._valueNoise(nx * 2.9 + ny * 0.7 + ox2, nz * 3.5 + ny * 0.5 + oy2) * 0.50;
      const f3 = this._valueNoise(nz * 5.8 + nx * 1.2 + ox,  ny * 6.8 + nz * 0.3 + oy)  * 0.25;
      const n  = (f1 + f2 + f3) / 1.75;  // [0..1]

      let r = len * (1.0 - noiseAmp * 0.5 + n * noiseAmp);

      // ── Shape-specific major features (softened to avoid spikes) ──
      if (key === 'vesta') {
        // Rheasilvia impact basin: gentle south-polar depression
        const sa = Math.acos(Math.max(-1, Math.min(1, -ny)));
        if (sa < 0.88) {
          r -= 0.08 * (1 - sa / 0.88);
          if (sa < 0.12) r += 0.04 * (1 - sa / 0.12); // central rebound
        }
      }
      if (key === 'eros') {
        // Himeros saddle: mild equatorial waist pinch
        r *= (1 - 0.12 * Math.exp(-nx * nx / 0.15));
      }

      pos.setXYZ(i, x * r / len, y * r / len, z * r / len);
    }
    geo.computeVertexNormals();
    return geo;
  }

  // ─── Procedural canvas texture generation ────────────────────────────────────

  /**
   * Generates albedo (512×256) + normal map (256×128) canvas textures per asteroid.
   * Uses pixel-by-pixel equirectangular rendering: each pixel maps to a sphere direction,
   * craters are rendered precisely in angular space with dark floors and bright rims.
   * Three.js SphereGeometry UV convention:
   *   px=0,py=0 (canvas top-left) → north pole (y=+1) with flipY=true ✓
   */
  _generateAsteroidTextures(key) {
    const config = this._getAsteroidConfig(key);
    const W = 1024, H = 512; // doubled for more surface detail

    // Precompute each crater's UV centre + bounding radius for fast rejection
    const cUV = config.craters.map(cr => {
      const theta = Math.acos(Math.max(-1, Math.min(1, cr.d[1])));
      const phi   = Math.atan2(cr.d[2], cr.d[0]);
      const cu    = ((phi < 0 ? phi + Math.PI * 2 : phi)) / (Math.PI * 2);
      const cv    = theta / Math.PI;
      return { cu, cv, uvR: cr.radius / Math.PI * 1.5 + 0.02 };
    });

    const [br, bg, bb] = config.baseRgb;
    const albPx  = new Uint8ClampedArray(W * H * 4);
    const hBuf   = new Float32Array(W * H);       // height field for normal map

    for (let py = 0; py < H; py++) {
      // theta=0 at py=0 (north, canvas top), theta=π at py=H (south, canvas bottom)
      const theta = (py + 0.5) / H * Math.PI;
      const sinT  = Math.sin(theta);
      const cosT  = Math.cos(theta);

      for (let px = 0; px < W; px++) {
        const phi = (px + 0.5) / W * Math.PI * 2;
        // Direction vector for this pixel (standard spherical coords)
        const dx = sinT * Math.cos(phi);
        const dy = cosT;
        const dz = sinT * Math.sin(phi);

        // 4-octave value noise for realistic mottled surface albedo
        const n1 = this._valueNoise(px * 0.014, py * 0.014);
        const n2 = this._valueNoise(px * 0.040, py * 0.040) * 0.50;
        const n3 = this._valueNoise(px * 0.100, py * 0.100) * 0.25;
        const n4 = this._valueNoise(px * 0.260, py * 0.260) * 0.12;
        const nv = (n1 + n2 + n3 + n4) / 1.87;  // [0..1]
        const ns = 0.62 + nv * 0.76;             // [0.62..1.38] — wider albedo range

        // Per-asteroid large-scale region variation (signature markings)
        const lf1 = this._valueNoise(px * 0.004 + 0.5, py * 0.004 + 0.5);
        const lf2 = this._valueNoise(px * 0.008 + 1.5, py * 0.008 + 1.5) * 0.5;
        const lf  = (lf1 + lf2) / 1.5;

        let regionFactor = 1.0;
        if (key === 'vesta') {
          // Darker south, brighter north — Rheasilvia basin floor is dark
          regionFactor = 0.82 + dy * 0.38 + lf * 0.12;
        } else if (key === 'pallas') {
          // Strong patchwork (heavily space-weathered, primitive surface)
          regionFactor = 0.68 + lf * 0.64;
        } else if (key === 'eros') {
          // Slight longitudinal bands (NEAR Shoemaker imagery)
          regionFactor = 0.88 + lf * 0.24;
        } else if (key === 'juno') {
          // Bright equatorial band
          const lat = Math.abs(dy);
          regionFactor = 0.85 + (1 - lat) * 0.30 + lf * 0.15;
        } else {
          // Generic: subtle patchwork
          regionFactor = 0.90 + lf * 0.20;
        }

        let r = br * ns * regionFactor;
        let g = bg * ns * regionFactor;
        let b = bb * ns * regionFactor;
        let h = nv * 0.010;

        const u = (px + 0.5) / W;
        const v = (py + 0.5) / H;

        let colF = 0, htF = 0;

        for (let ci = 0; ci < config.craters.length; ci++) {
          const cr  = config.craters[ci];
          const cuv = cUV[ci];

          // Bounding-box rejection (longitude wraps at u=0/1)
          const du = Math.min(Math.abs(u - cuv.cu), 1 - Math.abs(u - cuv.cu));
          if (du > cuv.uvR && Math.abs(v - cuv.cv) > cuv.uvR) continue;

          // Precise angular distance
          const dot   = Math.max(-1, Math.min(1, dx*cr.d[0] + dy*cr.d[1] + dz*cr.d[2]));
          const angle = Math.acos(dot);
          const t     = angle / cr.radius;
          if (t >= 1.5) continue;

          let cf = 0, hf = 0;
          if (t < 0.58) {
            // Floor: deeply dark, flat-bottomed
            const ft = t / 0.58;
            cf = -cr.depth * 1.5 * (1 - ft * ft * 0.3);
            hf = -cr.depth * 0.55 * (1 - t / 0.58);
          } else if (t < 0.78) {
            // Inner rim wall: sharp bright peak
            const rt = (t - 0.58) / 0.20;
            cf = cr.ejecta * 1.3 * Math.sin(rt * Math.PI);
            hf = cr.ejecta * 0.45 * Math.sin(rt * Math.PI);
          } else if (t < 1.10) {
            // Ejecta blanket: fading brightness
            const et = (t - 0.78) / 0.32;
            cf = cr.ejecta * 0.65 * (1 - et);
          } else if (t < 1.45) {
            // Extended ejecta halo for larger craters
            const ht = (t - 1.10) / 0.35;
            cf = cr.ejecta * 0.18 * Math.exp(-ht * 3);
          }

          if (Math.abs(cf) > Math.abs(colF)) colF = cf;
          htF += hf;
        }

        r = Math.max(0, Math.min(1, r + colF));
        g = Math.max(0, Math.min(1, g + colF));
        b = Math.max(0, Math.min(1, b + colF));
        h += htF;

        const idx = py * W + px;
        albPx[idx*4]   = (r * 255) | 0;
        albPx[idx*4+1] = (g * 255) | 0;
        albPx[idx*4+2] = (b * 255) | 0;
        albPx[idx*4+3] = 255;
        hBuf[idx]       = h;
      }
    }

    // Build albedo CanvasTexture
    const albC = document.createElement('canvas');
    albC.width = W; albC.height = H;
    albC.getContext('2d').putImageData(new ImageData(albPx, W, H), 0, 0);
    const albedoTex = new THREE.CanvasTexture(albC);

    // Build normal map at half resolution via Sobel on height field
    const NW = W >> 1, NH = H >> 1;
    const normPx = new Uint8ClampedArray(NW * NH * 4);
    const bumpScale = 15.0;

    for (let py = 0; py < NH; py++) {
      for (let px = 0; px < NW; px++) {
        const hx = px * 2, hy = py * 2;
        const hL = hBuf[hy * W + Math.max(0, hx-1)];
        const hR = hBuf[hy * W + Math.min(W-1, hx+1)];
        const hU = hBuf[Math.max(0, hy-1) * W + hx];
        const hD = hBuf[Math.min(H-1, hy+1) * W + hx];
        const ndx = (hR - hL) * bumpScale;
        const ndy = (hD - hU) * bumpScale;
        const len = Math.sqrt(ndx*ndx + ndy*ndy + 1);
        const idx = py * NW + px;
        normPx[idx*4]   = ((ndx / len) * 0.5 + 0.5) * 255 | 0;
        normPx[idx*4+1] = ((ndy / len) * 0.5 + 0.5) * 255 | 0;
        normPx[idx*4+2] = ((1.0  / len) * 0.5 + 0.5) * 255 | 0;
        normPx[idx*4+3] = 255;
      }
    }

    const normC = document.createElement('canvas');
    normC.width = NW; normC.height = NH;
    normC.getContext('2d').putImageData(new ImageData(normPx, NW, NH), 0, 0);
    const normalTex = new THREE.CanvasTexture(normC);

    return { albedoTex, normalTex };
  }

  /** Smooth 2D value noise via bilinear interpolation of hashed lattice. */
  _valueNoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const sx = xf * xf * (3 - 2 * xf);
    const sy = yf * yf * (3 - 2 * yf);
    const h00 = this._hash2D(xi,   yi  );
    const h10 = this._hash2D(xi+1, yi  );
    const h01 = this._hash2D(xi,   yi+1);
    const h11 = this._hash2D(xi+1, yi+1);
    return h00 + sx*(h10-h00) + sy*(h01-h00) + sx*sy*(h00-h10-h01+h11);
  }

  _hash2D(x, y) {
    let h = ((x * 374761393) ^ (y * 668265263)) | 0;
    h = ((h ^ (h >>> 13)) * 1274126177) | 0;
    return ((h ^ (h >>> 16)) & 0x7fffffff) / 0x7fffffff;
  }

  /**
   * Generate PBR material using the real photographic moon texture.
   *
   * The Moon's surface is morphologically identical to S/C-type asteroid terrain
   * (both are heavily cratered airless rocky bodies processed by the same impact
   * physics). Using moon_2k.jpg gives genuine photographic surface detail instead
   * of procedural noise.
   *
   * Spectral differentiation is achieved via material.color (a linear multiplier
   * on the texture), which controls both albedo level and colour tint:
   *   V-type (Vesta):  medium warm gray  — HED achondrite, ~42% albedo
   *   S-type (Eros/Juno): warm tan       — silicate/metal, ~20% albedo
   *   B-type (Pallas): dark gray         — carbonaceous, ~15% albedo
   *   C-type (Hygiea): very dark         — primitive C-type, ~5% albedo
   *
   * Each asteroid also gets a unique UV offset so they show different parts of
   * the source texture and look distinct from one another.
   */
  /**
   * Build a PBR material whose albedo is derived from the real moon_2k.jpg photo.
   *
   * WHY CANVAS CROP INSTEAD OF UV OFFSET:
   *   THREE.TextureLoader caches images internally. All five `loader.load(url)` calls
   *   return Texture objects that share the same underlying HTMLImageElement.
   *   Setting `.offset` on one mutates the SAME object → all asteroids end up with
   *   the last offset written. The fix: bake a unique crop + spectral tint into a
   *   dedicated CanvasTexture per asteroid — five genuinely different textures.
   *
   * CROP REGIONS (normalised source coords [x, y, w, h]):
   *   Each asteroid shows a different geographic region of the Moon so they look
   *   visually distinct even though they share the same source image.
   *
   * SPECTRAL TINT (canvas 'multiply' blend):
   *   Multiplying the lunar grey-scale with the tint colour shifts albedo and hue
   *   to match each asteroid's spectral class:
   *     V-type (Vesta)      bright warm gray  ~42 % albedo
   *     S-type (Eros/Juno)  warm tan-orange   ~20 % albedo
   *     B-type (Pallas)     medium dark gray  ~15 % albedo
   *     C-type (Hygiea)     very dark         ~5 % albedo
   */
  _generateAsteroidMaterial(key) {
    const config = this._getAsteroidConfig(key);
    const st     = config.spectralType;

    const roughness = { C: 0.97, B: 0.96, S: 0.88, V: 0.90, M: 0.65 };
    const metalness = { C: 0.02, B: 0.02, S: 0.06, V: 0.04, M: 0.40 };

    // Material starts with a flat placeholder colour; .map is set once the image loads
    const mat = new THREE.MeshStandardMaterial({
      color:     0x666660,
      roughness: roughness[st] ?? 0.92,
      metalness: metalness[st] ?? 0.04,
    });

    new THREE.TextureLoader().load('/textures/moon_2k.jpg', (moonTex) => {
      const W = 512, H = 256;
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');
      const img = moonTex.image;

      // Unique source crop per asteroid [srcX%, srcY%, srcW%, srcH%]
      // → each body shows a clearly different region of the lunar surface
      const regions = {
        vesta:  [0.00, 0.00, 1.00, 1.00], // full map — polar craters + mare
        pallas: [0.28, 0.10, 0.72, 0.90], // highland terrain, dense cratering
        hygiea: [0.55, 0.38, 0.45, 0.62], // mare-rich region (darkest, fewest craters)
        juno:   [0.06, 0.52, 0.94, 0.48], // equatorial band, elongated perspective
        eros:   [0.60, 0.02, 0.40, 0.98], // far-side terrain, fresh craters
      };
      const [rx, ry, rw, rh] = regions[key] || [0, 0, 1, 1];
      ctx.drawImage(
        img,
        rx * img.width, ry * img.height,
        rw * img.width, rh * img.height,
        0, 0, W, H,
      );

      // Spectral tint — multiply blend shifts albedo level + colour cast
      const tints = {
        V: '#C8C0B2', // Vesta: warm medium-gray (HED achondrite)
        S: '#D4AC7C', // Juno / Eros: warm tan-orange (silicate S-type)
        B: '#706A62', // Pallas: medium-dark cool gray (B carbonaceous)
        C: '#343230', // Hygiea: near-black gray-brown (primitive C-type)
        M: '#8898AC', // M-type: cool steel-gray (metallic)
      };
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = tints[st] || '#808080';
      ctx.fillRect(0, 0, W, H);

      // Assign the baked texture — material auto-updates on next render frame
      mat.map = new THREE.CanvasTexture(canvas);
      mat.color.setHex(0xffffff); // tint is in the texture; reset material tint to white
      mat.needsUpdate = true;
    });

    return mat;
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
        if (entry.mesh.material) {
          entry.mesh.material.map?.dispose();
          entry.mesh.material.normalMap?.dispose();
          entry.mesh.material.dispose();
        }
        this.scene.remove(entry.orbitGroup);
      }
    }
  }
}
