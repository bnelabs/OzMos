/**
 * Main 3D scene — builds the solar system with Three.js.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SOLAR_SYSTEM, PLANET_ORDER } from '../data/solarSystem.js';
import {
  sunVertexShader, sunFragmentShader,
  coronaVertexShader, coronaFragmentShader,
  coronaShellVertexShader, coronaShellFragmentShader,
  prominenceVertexShader, prominenceFragmentShader,
} from '../shaders/sunShader.js';
import {
  atmosphereVertexShader, atmosphereFragmentShader,
  ringVertexShader, ringFragmentShader,
  cityLightsVertexShader, cityLightsFragmentShader,
} from '../shaders/atmosphereShader.js';
import { getPlanetHeliocentricAU, getCurrentDateStr, advanceDateStr } from './OrbitalMechanics.js';
import { AsteroidBelt } from './AsteroidBelt.js';
import { ISSTracker } from './ISSTracker.js';
import { DWARF_PLANETS, DWARF_PLANET_ORDER } from '../data/dwarfPlanets.js';
import {
  generateMercuryTexture, generateVenusTexture, generateEarthTexture,
  generateEarthClouds, generateMarsTexture, generateJupiterTexture,
  generateSaturnTexture, generateUranusTexture, generateNeptuneTexture,
  generateMoonTexture, generateStarfield, generateRingTexture,
  createNoiseGenerator, fbm,
  generateBumpMap, generateEarthRoughnessMap, generateMarsRoughnessMap,
  generateEarthCityLights,
  generateRoughnessFromTexture, generateCityLightsFromTexture,
} from '../textures/proceduralTextures.js';
import { loadAllTextures } from '../textures/textureLoader.js';

const TEXTURE_GENERATORS = {
  mercury: generateMercuryTexture,
  venus: generateVenusTexture,
  earth: generateEarthTexture,
  mars: generateMarsTexture,
  jupiter: generateJupiterTexture,
  saturn: generateSaturnTexture,
  uranus: generateUranusTexture,
  neptune: generateNeptuneTexture,
};

export class SolarSystemScene {
  constructor(container, onProgress) {
    this.container = container;
    this.onProgress = onProgress || (() => {});
    this.planets = {};
    this.moonMeshes = {};
    this.orbitLines = {};
    this.labels = {};
    this.clock = new THREE.Clock();
    this.animationSpeed = 1;
    this.showOrbits = true;
    this.showLabels = true;
    this.selectedPlanet = null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.hoveredPlanet = null;
    this.targetCameraPos = null;
    this.targetLookAt = null;
    this.isTransitioning = false;
    this.transitionProgress = 0;
    this.transitionDuration = 1.0;
    this.transitionMidPoint = null;
    this.startCameraPos = new THREE.Vector3();
    this.startLookAt = new THREE.Vector3();
    this._missionMode = false;

    // Quality level — gate expensive features on mobile
    const isMobile = window.innerWidth < 768 || /Mobi|Android/i.test(navigator.userAgent);
    this._quality = isMobile ? 'low' : 'high';

    // Default camera FOV (for cinematic zoom)
    this._defaultFOV = 50;

    // Real-time orbital mode
    this._simDate = getCurrentDateStr();
    this._daysPerSecond = 1; // 1 day per second at 1x speed

    // Dwarf planets
    this.dwarfPlanets = {};
    this.dwarfMoonMeshes = {};

    // Asteroid belts
    this.asteroidBelt = null;

    // ISS
    this.issTracker = null;

    this._init();
  }

  async _init() {
    this.onProgress(5);
    this.textures = {};

    // Check WebGL support
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) {
      document.dispatchEvent(new CustomEvent('scene-error', {
        detail: 'WebGL is not supported by your browser. Please try a modern browser like Chrome, Firefox, or Edge.',
      }));
      return;
    }

    // Renderer
    try {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    // Scene
    this.scene = new THREE.Scene();

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      50, window.innerWidth / window.innerHeight, 0.1, 3000
    );
    this.camera.position.set(0, 5, 15);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 800;
    this.controls.enablePan = true;
    this.controls.autoRotate = false;
    this.controls.zoomSpeed = 1.2;

    this.onProgress(10);

    // Load photo-realistic textures
    this.textures = await loadAllTextures((pct) => {
      // Map texture loading to 10-25% of overall progress
      this.onProgress(10 + Math.round(pct * 0.15));
    });

    // Build scene
    this._createStarfield();
    this._createParticleStars();
    this.onProgress(30);
    this._createSun();
    this.onProgress(40);
    this._createLighting();
    this._createPlanets();
    this.onProgress(70);
    this._createOrbits();
    this.onProgress(75);
    this._createDwarfPlanets();
    this._createDwarfOrbits();
    this.onProgress(80);

    // Asteroid belts
    this.asteroidBelt = new AsteroidBelt(this.scene);
    this.asteroidBelt.createMainBelt();
    this.asteroidBelt.createKuiperBelt();
    this.onProgress(85);

    // Sync planets to today's real positions
    this.syncPlanetsToDate(this._simDate);
    this._syncDwarfPlanetsToDate(this._simDate);

    // Post-processing bloom (desktop only)
    this.composer = null;
    if (window.innerWidth >= 768) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.2, 0.4, 0.9
      );
      this._bloomPass = bloomPass;
      this.composer.addPass(bloomPass);
    }

    // Events
    window.addEventListener('resize', () => this._onResize());
    this.renderer.domElement.addEventListener('mousemove', (e) => this._onMouseMove(e));
    this.renderer.domElement.addEventListener('click', (e) => this._onClick(e));

    // ISS Tracker on Earth
    const earthPlanet = this.planets.earth;
    if (earthPlanet) {
      this.issTracker = new ISSTracker(earthPlanet.mesh, earthPlanet.data.displayRadius);
    }

    this.onProgress(100);

    // Initial cinematic sweep from close to sun to overview
    this._startCinematicSweep();

    // Start render loop
    this._animate();
    } catch (err) {
      document.dispatchEvent(new CustomEvent('scene-error', {
        detail: 'Failed to initialize 3D renderer: ' + err.message,
      }));
    }
  }

  _createStarfield() {
    let starTexture;
    if (this.textures.starmap) {
      starTexture = this.textures.starmap;
    } else {
      const starSize = this._quality === 'high' ? 4096 : 2048;
      const starCanvas = generateStarfield(starSize);
      starTexture = new THREE.CanvasTexture(starCanvas);
    }
    starTexture.mapping = THREE.EquirectangularReflectionMapping;

    const starGeo = new THREE.SphereGeometry(1200, 64, 64);
    const starMat = new THREE.MeshBasicMaterial({
      map: starTexture,
      side: THREE.BackSide,
    });
    this.starfield = new THREE.Mesh(starGeo, starMat);
    this.scene.add(this.starfield);
  }

  _createParticleStars() {
    const count = 12000;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    // Star color palette: white, blue-white, yellow, orange-red
    const starColors = [
      [1.0, 1.0, 1.0],
      [0.8, 0.85, 1.0],
      [1.0, 0.95, 0.8],
      [1.0, 0.7, 0.5],
      [0.7, 0.8, 1.0],
    ];

    for (let i = 0; i < count; i++) {
      // Distribute on a sphere at varying distances
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 400 + Math.random() * 350;

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      const color = starColors[Math.floor(Math.random() * starColors.length)];
      colors[i * 3] = color[0];
      colors[i * 3 + 1] = color[1];
      colors[i * 3 + 2] = color[2];

      // Power-law size distribution: many small, few bright
      sizes[i] = 0.3 + Math.pow(Math.random(), 3) * 2.5;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    // Create a small circular point texture
    const starCanvas = document.createElement('canvas');
    starCanvas.width = 32;
    starCanvas.height = 32;
    const sCtx = starCanvas.getContext('2d');
    const grad = sCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    sCtx.fillStyle = grad;
    sCtx.fillRect(0, 0, 32, 32);

    const pointTexture = new THREE.CanvasTexture(starCanvas);

    const mat = new THREE.PointsMaterial({
      size: 1.5,
      sizeAttenuation: true,
      map: pointTexture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });

    this.particleStars = new THREE.Points(geo, mat);
    this.scene.add(this.particleStars);
  }

  _createSun() {
    const sunData = SOLAR_SYSTEM.sun;

    // Sun surface — photo-realistic texture with emissive glow, or shader fallback
    const sunGeo = new THREE.SphereGeometry(sunData.displayRadius, 64, 64);
    let sunMat;
    if (this.textures.sun) {
      sunMat = new THREE.MeshBasicMaterial({
        map: this.textures.sun,
      });
    } else {
      sunMat = new THREE.ShaderMaterial({
        vertexShader: sunVertexShader,
        fragmentShader: sunFragmentShader,
        uniforms: {
          uTime: { value: 0 },
        },
      });
    }
    this.sun = new THREE.Mesh(sunGeo, sunMat);
    this.sun.userData = { key: 'sun', type: 'planet' };
    this.scene.add(this.sun);

    // Corona glow (inner)
    const coronaGeo = new THREE.SphereGeometry(sunData.displayRadius * 1.25, 64, 64);
    const coronaMat = new THREE.ShaderMaterial({
      vertexShader: coronaVertexShader,
      fragmentShader: coronaFragmentShader,
      uniforms: {
        uTime: { value: 0 },
      },
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.corona = new THREE.Mesh(coronaGeo, coronaMat);
    this.scene.add(this.corona);

    // Volumetric corona shells — 6 concentric spheres with noise-driven streamers
    const shellConfigs = [
      { scale: 1.3, opacity: 0.18, color: new THREE.Color(1.0, 0.82, 0.35) },
      { scale: 1.6, opacity: 0.12, color: new THREE.Color(1.0, 0.72, 0.25) },
      { scale: 2.2, opacity: 0.07, color: new THREE.Color(1.0, 0.58, 0.15) },
      { scale: 3.2, opacity: 0.035, color: new THREE.Color(1.0, 0.45, 0.08) },
      { scale: 5.0, opacity: 0.015, color: new THREE.Color(1.0, 0.35, 0.05) },
      { scale: 8.0, opacity: 0.005, color: new THREE.Color(1.0, 0.25, 0.02) },
    ];
    this.coronaShells = [];
    for (const cfg of shellConfigs) {
      const shellGeo = new THREE.SphereGeometry(sunData.displayRadius * cfg.scale, 48, 48);
      const shellMat = new THREE.ShaderMaterial({
        vertexShader: coronaShellVertexShader,
        fragmentShader: coronaShellFragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uOpacity: { value: cfg.opacity },
          uColor: { value: cfg.color },
          uScale: { value: cfg.scale },
        },
        transparent: true,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const shellMesh = new THREE.Mesh(shellGeo, shellMat);
      this.scene.add(shellMesh);
      this.coronaShells.push(shellMesh);
    }

    // Solar prominences — arcs of plasma rising from the surface
    this._createProminences(sunData.displayRadius);

    // Sun point light — bright with no decay so all planets are well-lit
    this.sunLight = new THREE.PointLight(0xFFF5E0, 3.5, 0, 0);
    this.sunLight.position.set(0, 0, 0);
    this.scene.add(this.sunLight);

    this.planets.sun = {
      mesh: this.sun,
      group: this.sun,
      data: sunData,
    };
  }

  _createProminences(sunRadius) {
    this.prominences = [];
    const promCount = 4;
    for (let i = 0; i < promCount; i++) {
      const pointCount = 40;
      const positions = new Float32Array(pointCount * 3);
      const progress = new Float32Array(pointCount);

      // Random arc on sun surface
      const baseAngle = (i / promCount) * Math.PI * 2 + Math.random() * 0.5;
      const baseLat = (Math.random() - 0.5) * 1.2;
      const arcSpan = 0.3 + Math.random() * 0.4;
      const arcHeight = sunRadius * (0.3 + Math.random() * 0.5);

      for (let j = 0; j < pointCount; j++) {
        const t = j / (pointCount - 1);
        const angle = baseAngle + (t - 0.5) * arcSpan;
        const height = Math.sin(t * Math.PI) * arcHeight;
        const r = sunRadius * 1.02 + height;

        positions[j * 3] = Math.cos(angle) * Math.cos(baseLat) * r;
        positions[j * 3 + 1] = Math.sin(baseLat) * r + height * 0.3;
        positions[j * 3 + 2] = Math.sin(angle) * Math.cos(baseLat) * r;
        progress[j] = t;
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('aProgress', new THREE.BufferAttribute(progress, 1));

      const mat = new THREE.ShaderMaterial({
        vertexShader: prominenceVertexShader,
        fragmentShader: prominenceFragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uAge: { value: Math.random() * 0.5 },
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const points = new THREE.Points(geo, mat);
      this.scene.add(points);
      this.prominences.push({ mesh: points, ageSpeed: 0.02 + Math.random() * 0.03 });
    }
  }

  _createLighting() {
    // Hemisphere light — warm neutral to avoid purple contamination
    const hemi = new THREE.HemisphereLight(0x887766, 0x221111, 0.2);
    this.scene.add(hemi);

    // Ambient light — dim gray for base visibility on dark sides
    const ambient = new THREE.AmbientLight(0x181818, 0.3);
    this.scene.add(ambient);

    // Subtle fill light to reduce harsh shadows
    this._fillLight = new THREE.DirectionalLight(0xffffff, 0.08);
    this._fillLight.position.set(0, 1, 1);
    this.scene.add(this._fillLight);
  }

  _createPlanets() {
    const planetKeys = PLANET_ORDER.filter(k => k !== 'sun');
    let idx = 0;

    for (const key of planetKeys) {
      const planetData = SOLAR_SYSTEM[key];

      // Planet group (for orbit rotation)
      const orbitGroup = new THREE.Group();
      // Random starting angle
      const startAngle = (idx / planetKeys.length) * Math.PI * 2 + idx * 1.3;
      orbitGroup.rotation.y = startAngle;
      this.scene.add(orbitGroup);

      // Tilt group for orbital inclination
      const tiltGroup = new THREE.Group();
      tiltGroup.rotation.x = THREE.MathUtils.degToRad(planetData.orbitInclination || 0);
      orbitGroup.add(tiltGroup);

      // Planet mesh — adaptive geometry resolution
      const segments = planetData.displayRadius > 3 ? 64 : planetData.displayRadius > 1.5 ? 48 : 32;
      const planetGeo = new THREE.SphereGeometry(planetData.displayRadius, segments, segments);
      let planetMat;

      // Per-planet PBR properties for realistic appearance
      const PBR = {
        mercury:  { roughness: 0.9,  metalness: 0.1  },
        venus:    { roughness: 0.95, metalness: 0.0  },
        earth:    { roughness: 0.7,  metalness: 0.05 },
        mars:     { roughness: 0.85, metalness: 0.05 },
        jupiter:  { roughness: 1.0,  metalness: 0.0  },
        saturn:   { roughness: 1.0,  metalness: 0.0  },
        uranus:   { roughness: 0.9,  metalness: 0.0  },
        neptune:  { roughness: 0.9,  metalness: 0.0  },
      };
      const pbr = PBR[key] || { roughness: 0.8, metalness: 0.0 };

      // Prefer photo-realistic textures, fallback to procedural
      if (this.textures[key]) {
        planetMat = new THREE.MeshStandardMaterial({
          map: this.textures[key],
          roughness: pbr.roughness,
          metalness: pbr.metalness,
        });
      } else if (TEXTURE_GENERATORS[key]) {
        const canvas = TEXTURE_GENERATORS[key](1024);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        planetMat = new THREE.MeshStandardMaterial({
          map: texture,
          roughness: pbr.roughness,
          metalness: pbr.metalness,
        });
      } else {
        planetMat = new THREE.MeshStandardMaterial({
          color: planetData.color,
          roughness: 0.8,
          metalness: 0.0,
        });
      }

      // Enhanced FBM-based normal maps for rocky planets (desktop only for 1024)
      if (['mercury', 'mars', 'moon'].includes(key) || (key === 'earth' && !this.textures[key])) {
        const normalSize = this._quality === 'high' ? 1024 : 512;
        const perPlanetNormals = {
          mercury: { strength: 1.2, octaves: 6, frequency: 10 },
          mars: { strength: 0.8, octaves: 6, frequency: 8 },
          moon: { strength: 1.0, octaves: 6, frequency: 8 },
          earth: { strength: 0.6, octaves: 5, frequency: 8 },
        };
        const normalOpts = perPlanetNormals[key] || {};
        const normalCanvas = this._generateNormalMap(normalSize, idx * 1000, normalOpts);
        const normalTexture = new THREE.CanvasTexture(normalCanvas);
        planetMat.normalMap = normalTexture;
        planetMat.normalScale = new THREE.Vector2(0.4, 0.4);
      }

      // Procedural bump maps for rocky planets (desktop only)
      if (this._quality === 'high') {
        const bumpConfig = {
          mercury: { seed: 42, bumpScale: 0.04, octaves: 6, frequency: 10, craterStrength: 0.5 },
          mars: { seed: 444, bumpScale: 0.03, octaves: 6, frequency: 8, craterStrength: 0.3 },
          moon: { seed: 1234, bumpScale: 0.03, octaves: 6, frequency: 8, craterStrength: 0.4 },
          venus: { seed: 99, bumpScale: 0.02, octaves: 4, frequency: 6, craterStrength: 0.1 },
        };
        if (bumpConfig[key]) {
          const cfg = bumpConfig[key];
          const bumpCanvas = generateBumpMap(1024, cfg.seed, {
            octaves: cfg.octaves,
            frequency: cfg.frequency,
            craterStrength: cfg.craterStrength,
          });
          const bumpTexture = new THREE.CanvasTexture(bumpCanvas);
          planetMat.bumpMap = bumpTexture;
          planetMat.bumpScale = cfg.bumpScale;
        }
      }

      // Per-pixel roughness maps for Earth and Mars (desktop only)
      if (this._quality === 'high') {
        if (key === 'earth' && this.textures.earth) {
          // Generate roughness from actual NASA texture for accurate ocean/land specular
          const roughCanvas = generateRoughnessFromTexture(this.textures.earth, 1024);
          const roughTexture = new THREE.CanvasTexture(roughCanvas);
          planetMat.roughnessMap = roughTexture;
          planetMat.roughness = 1.0;
        } else if (key === 'earth') {
          // Fallback to procedural if no NASA texture
          const roughCanvas = generateEarthRoughnessMap(1024);
          const roughTexture = new THREE.CanvasTexture(roughCanvas);
          planetMat.roughnessMap = roughTexture;
          planetMat.roughness = 1.0;
        } else if (key === 'mars') {
          const roughCanvas = generateMarsRoughnessMap(1024);
          const roughTexture = new THREE.CanvasTexture(roughCanvas);
          planetMat.roughnessMap = roughTexture;
          planetMat.roughness = 1.0;
        }
      }

      const planetMesh = new THREE.Mesh(planetGeo, planetMat);
      planetMesh.position.x = planetData.orbitRadius;
      planetMesh.rotation.z = THREE.MathUtils.degToRad(planetData.axialTilt || 0);
      planetMesh.userData = { key, type: 'planet' };
      tiltGroup.add(planetMesh);

      // Atmosphere for Earth, Venus, Mars
      if (key === 'earth' || key === 'venus' || key === 'mars') {
        const atmConfig = {
          earth: { color: 0x4488ff, intensity: 1.0, scale: 1.05 },
          venus: { color: 0xddaa44, intensity: 0.6, scale: 1.05 },
          mars: { color: 0xcc6644, intensity: 0.3, scale: 1.03 },
        };
        const atm = atmConfig[key];
        const atmGeo = new THREE.SphereGeometry(planetData.displayRadius * atm.scale, 48, 48);
        const atmMat = new THREE.ShaderMaterial({
          vertexShader: atmosphereVertexShader,
          fragmentShader: atmosphereFragmentShader,
          uniforms: {
            uColor: { value: new THREE.Color(atm.color) },
            uIntensity: { value: atm.intensity },
            uSunPosition: { value: new THREE.Vector3(0, 0, 0) },
          },
          transparent: true,
          side: THREE.BackSide,
          depthWrite: false,
        });
        const atmosphere = new THREE.Mesh(atmGeo, atmMat);
        planetMesh.add(atmosphere);
      }

      // Earth cloud layer
      if (key === 'earth') {
        let cloudTexture;
        if (this.textures.earthClouds) {
          cloudTexture = this.textures.earthClouds;
        } else {
          const cloudCanvas = generateEarthClouds(1024);
          cloudTexture = new THREE.CanvasTexture(cloudCanvas);
        }
        const cloudGeo = new THREE.SphereGeometry(planetData.displayRadius * 1.015, 48, 48);
        const cloudMat = new THREE.MeshStandardMaterial({
          map: cloudTexture,
          transparent: true,
          opacity: 0.45,
          roughness: 1.0,
          metalness: 0.0,
          depthWrite: false,
        });
        const cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
        planetMesh.add(cloudMesh);
        this.earthClouds = cloudMesh;
      }

      // Earth night-side city lights (desktop only)
      if (key === 'earth' && this._quality === 'high') {
        // Use texture-aware generator if NASA texture available
        const cityCanvas = this.textures.earth
          ? generateCityLightsFromTexture(this.textures.earth, 1024)
          : generateEarthCityLights(1024);
        const cityTexture = new THREE.CanvasTexture(cityCanvas);
        const cityGeo = new THREE.SphereGeometry(planetData.displayRadius * 1.005, 48, 48);
        const cityMat = new THREE.ShaderMaterial({
          vertexShader: cityLightsVertexShader,
          fragmentShader: cityLightsFragmentShader,
          uniforms: {
            uCityMap: { value: cityTexture },
            uSunPosition: { value: new THREE.Vector3(0, 0, 0) },
          },
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const cityMesh = new THREE.Mesh(cityGeo, cityMat);
        planetMesh.add(cityMesh);
        this.earthCityLights = cityMesh;
      }

      // Rings for Saturn, Uranus, Neptune
      if (planetData.hasRings) {
        this._createRing(planetMesh, planetData, key);
      }

      // Moons
      const moonMeshes = [];
      if (planetData.moons && planetData.moons.length > 0) {
        for (let mi = 0; mi < planetData.moons.length; mi++) {
          const moonData = planetData.moons[mi];
          const moonGroup = new THREE.Group();
          moonGroup.rotation.y = mi * 2.1 + Math.random() * Math.PI;
          planetMesh.add(moonGroup);

          const moonRadius = Math.max(0.15, moonData.radius * planetData.displayRadius * 0.4);
          let moonTexture;
          // Use photo-realistic texture for Earth's Moon (Luna)
          if (key === 'earth' && mi === 0 && this.textures.moon) {
            moonTexture = this.textures.moon;
          } else {
            const moonCanvas = generateMoonTexture(512, 1000 + mi * 100 + idx * 10);
            moonTexture = new THREE.CanvasTexture(moonCanvas);
          }
          const moonGeo = new THREE.SphereGeometry(moonRadius, 24, 24);

          // Tint the moon texture with its color (skip tint for photo-realistic Luna)
          const useLunaTex = key === 'earth' && mi === 0 && this.textures.moon;
          const moonColor = useLunaTex ? new THREE.Color(0xffffff) : new THREE.Color(moonData.color);
          const moonMat = new THREE.MeshStandardMaterial({
            map: moonTexture,
            color: moonColor,
            roughness: 0.9,
            metalness: 0.05,
          });

          const moonMesh = new THREE.Mesh(moonGeo, moonMat);
          const moonDist = moonData.distance * planetData.displayRadius * 0.6;
          moonMesh.position.x = moonDist;
          moonMesh.userData = { key: `${key}_moon_${mi}`, type: 'moon', parentKey: key, moonIndex: mi };
          moonGroup.add(moonMesh);

          // Moon orbit line
          const moonOrbitGeo = new THREE.BufferGeometry();
          const moonOrbitPoints = [];
          for (let a = 0; a <= 64; a++) {
            const angle = (a / 64) * Math.PI * 2;
            moonOrbitPoints.push(
              Math.cos(angle) * moonDist,
              0,
              Math.sin(angle) * moonDist
            );
          }
          moonOrbitGeo.setAttribute('position', new THREE.Float32BufferAttribute(moonOrbitPoints, 3));
          const moonOrbitMat = new THREE.LineBasicMaterial({
            color: 0x444466,
            transparent: true,
            opacity: 0.1,
          });
          const moonOrbitLine = new THREE.Line(moonOrbitGeo, moonOrbitMat);
          planetMesh.add(moonOrbitLine);

          moonMeshes.push({
            mesh: moonMesh,
            group: moonGroup,
            data: moonData,
            orbitLine: moonOrbitLine,
          });
        }
      }

      this.planets[key] = {
        mesh: planetMesh,
        orbitGroup,
        tiltGroup,
        data: planetData,
        startAngle,
      };
      this.moonMeshes[key] = moonMeshes;

      idx++;
    }
  }

  _createRing(planetMesh, planetData, key) {
    const innerR = planetData.ringInnerRadius || planetData.displayRadius * 1.3;
    const outerR = planetData.ringOuterRadius || planetData.displayRadius * 2.2;

    // Use a flat disc geometry
    const ringGeo = new THREE.RingGeometry(innerR, outerR, 128, 1);

    // Fix UV mapping for ring
    const pos = ringGeo.attributes.position;
    const uv = ringGeo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getY(i);
      const dist = Math.sqrt(x * x + z * z);
      const u = (dist - innerR) / (outerR - innerR);
      uv.setXY(i, u, 0.5);
    }

    let ringMat;
    if (key === 'saturn') {
      let ringTexture;
      if (this.textures.saturnRing) {
        ringTexture = this.textures.saturnRing;
      } else {
        const ringCanvas = generateRingTexture(1024);
        ringTexture = new THREE.CanvasTexture(ringCanvas);
      }
      ringMat = new THREE.MeshBasicMaterial({
        map: ringTexture,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        opacity: 0.85,
      });
    } else {
      // Simpler rings for Uranus/Neptune
      ringMat = new THREE.MeshBasicMaterial({
        color: key === 'uranus' ? 0x667788 : 0x445566,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        opacity: 0.15,
      });
    }

    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    planetMesh.add(ring);
  }

  /** Generate an FBM-based normal map using Sobel kernel for proper normals */
  _generateNormalMap(size, seed, options = {}) {
    const { strength = 1.0, octaves = 6, frequency = 8 } = options;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    const noise = createNoiseGenerator(seed || 42);

    // Generate FBM height map
    const heights = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = x / size * frequency;
        const ny = y / size * frequency;
        heights[y * size + x] = fbm(noise, nx, ny, octaves, 0.55, 2.0) * 0.5 + 0.5;
      }
    }

    // Sobel kernel for computing normals from height field
    const sample = (sx, sy) => heights[((sy + size) % size) * size + ((sx + size) % size)];

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Sobel X
        const dX = (
          -1 * sample(x - 1, y - 1) + 1 * sample(x + 1, y - 1) +
          -2 * sample(x - 1, y)     + 2 * sample(x + 1, y) +
          -1 * sample(x - 1, y + 1) + 1 * sample(x + 1, y + 1)
        ) * strength;

        // Sobel Y
        const dY = (
          -1 * sample(x - 1, y - 1) - 2 * sample(x, y - 1) - 1 * sample(x + 1, y - 1) +
           1 * sample(x - 1, y + 1) + 2 * sample(x, y + 1) + 1 * sample(x + 1, y + 1)
        ) * strength;

        // Normal = normalize(-dX, -dY, 1) then encode to 0-255
        const len = Math.sqrt(dX * dX + dY * dY + 1);
        const nx = (-dX / len) * 0.5 + 0.5;
        const ny = (-dY / len) * 0.5 + 0.5;
        const nz = (1 / len) * 0.5 + 0.5;

        const pi = (y * size + x) * 4;
        data[pi] = Math.floor(nx * 255);
        data[pi + 1] = Math.floor(ny * 255);
        data[pi + 2] = Math.floor(nz * 255);
        data[pi + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  _createOrbits() {
    const planetKeys = PLANET_ORDER.filter(k => k !== 'sun');
    for (const key of planetKeys) {
      const planetData = SOLAR_SYSTEM[key];
      const segments = 512;
      const points = [];

      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        // Account for eccentricity (simplified ellipse)
        const e = planetData.eccentricity || 0;
        const r = planetData.orbitRadius * (1 - e * e) / (1 + e * Math.cos(angle));
        points.push(
          Math.cos(angle) * r,
          0,
          Math.sin(angle) * r
        );
      }

      const orbitGeo = new THREE.BufferGeometry();
      orbitGeo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));

      const orbitMat = new THREE.LineDashedMaterial({
        color: 0x4466aa,
        transparent: true,
        opacity: 0.15,
        dashSize: 0.8,
        gapSize: 0.4,
      });

      const orbitLine = new THREE.Line(orbitGeo, orbitMat);
      orbitLine.computeLineDistances();
      // Apply inclination
      orbitLine.rotation.x = THREE.MathUtils.degToRad(planetData.orbitInclination || 0);
      this.scene.add(orbitLine);
      this.orbitLines[key] = orbitLine;
    }
  }

  _createDwarfPlanets() {
    let idx = 0;
    for (const key of DWARF_PLANET_ORDER) {
      const planetData = DWARF_PLANETS[key];
      if (!planetData) continue;

      const orbitGroup = new THREE.Group();
      const startAngle = idx * 1.7 + 0.5;
      orbitGroup.rotation.y = startAngle;
      this.scene.add(orbitGroup);

      const tiltGroup = new THREE.Group();
      tiltGroup.rotation.x = THREE.MathUtils.degToRad(planetData.orbitInclination || 0);
      orbitGroup.add(tiltGroup);

      const segments = 24;
      const planetGeo = new THREE.SphereGeometry(planetData.displayRadius, segments, segments);
      const planetMat = new THREE.MeshStandardMaterial({
        color: planetData.color,
        roughness: 0.85,
        metalness: 0.05,
      });

      const planetMesh = new THREE.Mesh(planetGeo, planetMat);
      planetMesh.position.x = planetData.orbitRadius;
      planetMesh.rotation.z = THREE.MathUtils.degToRad(planetData.axialTilt || 0);
      planetMesh.userData = { key, type: 'planet' };
      tiltGroup.add(planetMesh);

      // Moons for dwarf planets (e.g., Charon for Pluto)
      const moonMeshes = [];
      if (planetData.moons && planetData.moons.length > 0) {
        for (let mi = 0; mi < planetData.moons.length; mi++) {
          const moonData = planetData.moons[mi];
          const moonGroup = new THREE.Group();
          moonGroup.rotation.y = mi * 2.1 + Math.random() * Math.PI;
          planetMesh.add(moonGroup);

          const moonRadius = Math.max(0.12, moonData.radius * planetData.displayRadius * 0.4);
          const moonCanvas = generateMoonTexture(256, 5000 + idx * 100 + mi);
          const moonTexture = new THREE.CanvasTexture(moonCanvas);
          const moonGeo = new THREE.SphereGeometry(moonRadius, 16, 16);
          const moonMat = new THREE.MeshStandardMaterial({
            map: moonTexture,
            color: new THREE.Color(moonData.color),
            roughness: 0.9,
            metalness: 0.05,
          });

          const moonMesh = new THREE.Mesh(moonGeo, moonMat);
          const moonDist = moonData.distance * planetData.displayRadius * 0.6;
          moonMesh.position.x = moonDist;
          moonMesh.userData = { key: `${key}_moon_${mi}`, type: 'moon', parentKey: key, moonIndex: mi };
          moonGroup.add(moonMesh);

          moonMeshes.push({ mesh: moonMesh, group: moonGroup, data: moonData });
        }
      }

      this.dwarfPlanets[key] = {
        mesh: planetMesh,
        orbitGroup,
        tiltGroup,
        data: planetData,
        startAngle,
      };
      this.dwarfMoonMeshes[key] = moonMeshes;
      idx++;
    }
  }

  _createDwarfOrbits() {
    for (const key of DWARF_PLANET_ORDER) {
      const planetData = DWARF_PLANETS[key];
      if (!planetData) continue;

      const segments = 256;
      const points = [];
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const e = planetData.eccentricity || 0;
        const r = planetData.orbitRadius * (1 - e * e) / (1 + e * Math.cos(angle));
        points.push(Math.cos(angle) * r, 0, Math.sin(angle) * r);
      }

      const orbitGeo = new THREE.BufferGeometry();
      orbitGeo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      const orbitMat = new THREE.LineDashedMaterial({
        color: 0x668899,
        transparent: true,
        opacity: 0.1,
        dashSize: 1.2,
        gapSize: 0.8,
      });

      const orbitLine = new THREE.Line(orbitGeo, orbitMat);
      orbitLine.computeLineDistances();
      orbitLine.rotation.x = THREE.MathUtils.degToRad(planetData.orbitInclination || 0);
      this.scene.add(orbitLine);
      this.orbitLines[key] = orbitLine;
    }
  }

  _syncDwarfPlanetsToDate(dateStr) {
    if (!dateStr) return;
    for (const key of DWARF_PLANET_ORDER) {
      const planet = this.dwarfPlanets[key];
      if (!planet) continue;
      const posAU = getPlanetHeliocentricAU(key, dateStr);
      if (posAU.x === 0 && posAU.y === 0 && posAU.z === 0) continue;
      planet.orbitGroup.rotation.y = Math.atan2(-posAU.y, posAU.x);
    }
  }

  /** Get the current simulation date */
  getSimDate() {
    return this._simDate;
  }

  /** Get world position of a planet */
  getPlanetWorldPosition(key) {
    if (key === 'sun') return new THREE.Vector3(0, 0, 0);
    const planet = this.planets[key] || this.dwarfPlanets[key];
    if (!planet) return new THREE.Vector3(0, 0, 0);
    const worldPos = new THREE.Vector3();
    planet.mesh.getWorldPosition(worldPos);
    return worldPos;
  }

  /** Focus camera on a planet with cinematic cubic Bezier arc */
  focusOnPlanet(key) {
    const worldPos = this.getPlanetWorldPosition(key);
    const planetData = SOLAR_SYSTEM[key] || DWARF_PLANETS[key];
    if (!planetData) return;
    const radius = planetData.displayRadius;
    // Dwarf planets are tiny — get camera closer for visibility
    const isDwarf = DWARF_PLANETS[key] !== undefined;
    const distance = isDwarf ? radius * 3 + 2 : radius * 5 + 3;

    this.startCameraPos.copy(this.camera.position);
    this.startLookAt.copy(this.controls.target);
    this.targetCameraPos = new THREE.Vector3(
      worldPos.x + distance * 0.7,
      worldPos.y + distance * 0.4,
      worldPos.z + distance * 0.7
    );
    this.targetLookAt = worldPos.clone();

    // Slower cinematic transition duration
    const cameraDist = this.startCameraPos.distanceTo(this.targetCameraPos);
    this.transitionDuration = THREE.MathUtils.clamp(cameraDist / 40, 2.0, 5.0);

    // Cubic Bezier with two control points for sweeping orbital arc
    const mid = new THREE.Vector3().addVectors(this.startCameraPos, this.targetCameraPos).multiplyScalar(0.5);
    // Lateral offset direction (perpendicular to path in XZ plane)
    const pathDir = new THREE.Vector3().subVectors(this.targetCameraPos, this.startCameraPos);
    const lateral = new THREE.Vector3(-pathDir.z, 0, pathDir.x).normalize();
    const lateralOffset = cameraDist * 0.2;

    this._bezierCP1 = new THREE.Vector3().lerpVectors(this.startCameraPos, this.targetCameraPos, 1/3);
    this._bezierCP1.add(lateral.clone().multiplyScalar(lateralOffset));
    this._bezierCP1.y += cameraDist * 0.12;

    this._bezierCP2 = new THREE.Vector3().lerpVectors(this.startCameraPos, this.targetCameraPos, 2/3);
    this._bezierCP2.add(lateral.clone().multiplyScalar(lateralOffset * 0.4));
    this._bezierCP2.y += cameraDist * 0.06;

    // Clear old midpoint — we use cubic Bezier now
    this.transitionMidPoint = null;

    // FOV zoom: start with telephoto, settle to default
    this._fovZoomActive = true;
    this._startFOV = this._defaultFOV;

    this.isTransitioning = true;
    this.transitionProgress = 0;
    this.selectedPlanet = key;

    // Disable auto-rotate when focused
    this.controls.autoRotate = false;

    // Dynamic min-distance based on planet size
    this.controls.minDistance = Math.max(2, radius * 1.8);
  }

  /** Focus camera on a moon with cinematic arc */
  focusOnMoon(planetKey, moonIndex) {
    const moons = this.moonMeshes[planetKey] || this.dwarfMoonMeshes[planetKey];
    if (!moons || !moons[moonIndex]) return;

    const moonEntry = moons[moonIndex];
    const worldPos = new THREE.Vector3();
    moonEntry.mesh.getWorldPosition(worldPos);

    const moonRadius = moonEntry.data.radius || 0.3;
    const distance = moonRadius * 5 + 1;

    this.startCameraPos.copy(this.camera.position);
    this.startLookAt.copy(this.controls.target);
    this.targetCameraPos = new THREE.Vector3(
      worldPos.x + distance * 0.7,
      worldPos.y + distance * 0.4,
      worldPos.z + distance * 0.7
    );
    this.targetLookAt = worldPos.clone();

    const cameraDist = this.startCameraPos.distanceTo(this.targetCameraPos);
    this.transitionDuration = THREE.MathUtils.clamp(cameraDist / 40, 1.5, 3.0);

    const pathDir = new THREE.Vector3().subVectors(this.targetCameraPos, this.startCameraPos);
    const lateral = new THREE.Vector3(-pathDir.z, 0, pathDir.x).normalize();
    const lateralOffset = cameraDist * 0.15;

    this._bezierCP1 = new THREE.Vector3().lerpVectors(this.startCameraPos, this.targetCameraPos, 1/3);
    this._bezierCP1.add(lateral.clone().multiplyScalar(lateralOffset));
    this._bezierCP1.y += cameraDist * 0.08;

    this._bezierCP2 = new THREE.Vector3().lerpVectors(this.startCameraPos, this.targetCameraPos, 2/3);
    this._bezierCP2.add(lateral.clone().multiplyScalar(lateralOffset * 0.3));
    this._bezierCP2.y += cameraDist * 0.04;

    this.transitionMidPoint = null;
    this._fovZoomActive = false;

    this.isTransitioning = true;
    this.transitionProgress = 0;
    this.selectedPlanet = planetKey;

    this.controls.autoRotate = false;
    this.controls.minDistance = Math.max(0.5, moonRadius * 2);
  }

  /** Go back to overview */
  goToOverview() {
    this.startCameraPos.copy(this.camera.position);
    this.startLookAt.copy(this.controls.target);
    this.targetCameraPos = new THREE.Vector3(40, 30, 80);
    this.targetLookAt = new THREE.Vector3(0, 0, 0);

    // Slower cinematic transition
    const cameraDist = this.startCameraPos.distanceTo(this.targetCameraPos);
    this.transitionDuration = THREE.MathUtils.clamp(cameraDist / 40, 2.5, 5.0);

    // Cubic Bezier arc for overview return
    const mid = new THREE.Vector3().addVectors(this.startCameraPos, this.targetCameraPos).multiplyScalar(0.5);
    const pathDir = new THREE.Vector3().subVectors(this.targetCameraPos, this.startCameraPos);
    const lateral = new THREE.Vector3(-pathDir.z, 0, pathDir.x).normalize();

    this._bezierCP1 = new THREE.Vector3().lerpVectors(this.startCameraPos, this.targetCameraPos, 1/3);
    this._bezierCP1.add(lateral.clone().multiplyScalar(cameraDist * 0.15));
    this._bezierCP1.y += cameraDist * 0.1;

    this._bezierCP2 = new THREE.Vector3().lerpVectors(this.startCameraPos, this.targetCameraPos, 2/3);
    this._bezierCP2.add(lateral.clone().multiplyScalar(cameraDist * 0.06));
    this._bezierCP2.y += cameraDist * 0.05;

    this.transitionMidPoint = null;
    this._fovZoomActive = false;

    this.isTransitioning = true;
    this.transitionProgress = 0;
    this.selectedPlanet = null;

    // Enable auto-rotate in overview
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.3;

    // Reset min-distance for overview
    this.controls.minDistance = 5;
  }

  /** Focus on asteroid belt region — elevated view centered on ~54 AU (Ceres orbit) */
  focusOnAsteroidBelt() {
    this.startCameraPos.copy(this.camera.position);
    this.startLookAt.copy(this.controls.target);
    // Target a region in the asteroid belt (between Mars and Jupiter)
    this.targetCameraPos = new THREE.Vector3(30, 35, 55);
    this.targetLookAt = new THREE.Vector3(0, 0, 0);

    const cameraDist = this.startCameraPos.distanceTo(this.targetCameraPos);
    this.transitionDuration = THREE.MathUtils.clamp(cameraDist / 40, 1.5, 4.0);

    const mid = new THREE.Vector3().addVectors(this.startCameraPos, this.targetCameraPos).multiplyScalar(0.5);
    const pathDir = new THREE.Vector3().subVectors(this.targetCameraPos, this.startCameraPos);
    const lateral = new THREE.Vector3(-pathDir.z, 0, pathDir.x).normalize();

    this._bezierCP1 = new THREE.Vector3().lerpVectors(this.startCameraPos, this.targetCameraPos, 1/3);
    this._bezierCP1.add(lateral.clone().multiplyScalar(cameraDist * 0.12));
    this._bezierCP1.y += cameraDist * 0.08;

    this._bezierCP2 = new THREE.Vector3().lerpVectors(this.startCameraPos, this.targetCameraPos, 2/3);
    this._bezierCP2.add(lateral.clone().multiplyScalar(cameraDist * 0.04));
    this._bezierCP2.y += cameraDist * 0.03;

    this.transitionMidPoint = null;
    this._fovZoomActive = false;

    this.isTransitioning = true;
    this.transitionProgress = 0;
    this.selectedPlanet = null;

    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.2;
    this.controls.minDistance = 5;
  }

  setAnimationSpeed(speed) {
    this.animationSpeed = speed;
  }

  toggleOrbits() {
    this.showOrbits = !this.showOrbits;
    Object.values(this.orbitLines).forEach(line => {
      line.visible = this.showOrbits;
    });
    if (this.asteroidBelt) this.asteroidBelt.setVisible(this.showOrbits);
    return this.showOrbits;
  }

  toggleLabels() {
    this.showLabels = !this.showLabels;
    return this.showLabels;
  }

  /** Enter mission mode — freeze normal orbit animation. */
  enterMissionMode() {
    this._missionMode = true;
    this.controls.autoRotate = false;
  }

  /** Exit mission mode — resume normal orbit animation. */
  exitMissionMode() {
    this._missionMode = false;
  }

  /**
   * Sync all planet orbitGroup rotations to real Keplerian positions for a date.
   * This makes visible planets align with trajectory waypoints.
   */
  syncPlanetsToDate(dateStr) {
    if (!dateStr) return;
    const planetKeys = PLANET_ORDER.filter(k => k !== 'sun');
    for (const key of planetKeys) {
      const planet = this.planets[key];
      if (!planet) continue;
      const posAU = getPlanetHeliocentricAU(key, dateStr);
      // Map ecliptic angle to orbitGroup.rotation.y
      // Scene: world_x = r*cos(θ), world_z = -r*sin(θ)
      // Keplerian: sceneX = posAU.x * scale, sceneZ = posAU.y * scale
      // So θ = atan2(-posAU.y, posAU.x)
      planet.orbitGroup.rotation.y = Math.atan2(-posAU.y, posAU.x);
    }
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setSize(w, h);
    }
    if (this._bloomPass) {
      this._bloomPass.resolution.set(w, h);
    }
  }

  _onMouseMove(event) {
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  }

  _onClick(event) {
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Collect all clickable meshes
    const clickable = [];
    for (const key of PLANET_ORDER) {
      if (this.planets[key]) {
        clickable.push(this.planets[key].mesh);
      }
    }
    // Dwarf planets
    for (const key of DWARF_PLANET_ORDER) {
      if (this.dwarfPlanets[key]) {
        clickable.push(this.dwarfPlanets[key].mesh);
      }
    }
    // Add moons
    for (const key of Object.keys(this.moonMeshes)) {
      for (const moon of this.moonMeshes[key]) {
        clickable.push(moon.mesh);
      }
    }
    for (const key of Object.keys(this.dwarfMoonMeshes)) {
      for (const moon of this.dwarfMoonMeshes[key]) {
        clickable.push(moon.mesh);
      }
    }

    const intersects = this.raycaster.intersectObjects(clickable, false);

    if (intersects.length > 0) {
      const hit = intersects[0].object;
      if (hit.userData.type === 'planet') {
        this.focusOnPlanet(hit.userData.key);
        if (this.onPlanetClick) this.onPlanetClick(hit.userData.key);
      } else if (hit.userData.type === 'moon') {
        if (this.onMoonClick) this.onMoonClick(hit.userData.parentKey, hit.userData.moonIndex);
      }
    }
  }

  /** Raycast for hover */
  _checkHover() {
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const clickable = [];
    for (const key of PLANET_ORDER) {
      if (this.planets[key]) clickable.push(this.planets[key].mesh);
    }
    for (const key of DWARF_PLANET_ORDER) {
      if (this.dwarfPlanets[key]) clickable.push(this.dwarfPlanets[key].mesh);
    }

    const intersects = this.raycaster.intersectObjects(clickable, false);
    const prevHovered = this.hoveredPlanet;

    if (intersects.length > 0) {
      this.hoveredPlanet = intersects[0].object.userData.key;
      this.renderer.domElement.style.cursor = 'pointer';
    } else {
      this.hoveredPlanet = null;
      this.renderer.domElement.style.cursor = 'default';
    }

    if (this.hoveredPlanet !== prevHovered && this.onHoverChange) {
      this.onHoverChange(this.hoveredPlanet);
    }
  }

  /** Get 2D screen position of a planet for labels */
  getScreenPosition(key) {
    const worldPos = this.getPlanetWorldPosition(key);
    const screenPos = worldPos.clone().project(this.camera);
    return {
      x: (screenPos.x * 0.5 + 0.5) * window.innerWidth,
      y: (-screenPos.y * 0.5 + 0.5) * window.innerHeight,
      visible: screenPos.z < 1,
    };
  }

  _startCinematicSweep() {
    // 15-second cinematic sweep: start close to Earth, pull back to overview
    this._cinematicSweepActive = true;

    // Get Earth's world position at load time
    const earthPos = this.getPlanetWorldPosition('earth');
    const earthData = SOLAR_SYSTEM.earth;
    const earthR = earthData.displayRadius;
    const earthCloseup = new THREE.Vector3(
      earthPos.x + earthR * 3,
      earthPos.y + earthR * 1.5,
      earthPos.z + earthR * 3
    );
    const earthDrift = new THREE.Vector3(
      earthPos.x + earthR * 5,
      earthPos.y + earthR * 2.5,
      earthPos.z + earthR * 6
    );

    this._cinematicSpline = new THREE.CatmullRomCurve3([
      earthCloseup,                          // Close to Earth
      earthDrift,                            // Drift away from Earth
      new THREE.Vector3(15, 10, 20),         // Inner planets
      new THREE.Vector3(30, 20, 45),         // Mid solar system
      new THREE.Vector3(40, 30, 80),         // Final overview
    ], false, 'centripetal', 0.5);

    this._cinematicLookSpline = new THREE.CatmullRomCurve3([
      earthPos.clone(),                      // Look at Earth
      earthPos.clone(),                      // Still looking at Earth
      new THREE.Vector3(5, 0, 5),            // Transition to center
      new THREE.Vector3(0, 0, 0),            // Center
      new THREE.Vector3(0, 0, 0),            // Final: center
    ], false, 'centripetal', 0.5);

    this.transitionDuration = 15.0;
    this.isTransitioning = true;
    this.transitionProgress = 0;
    this.selectedPlanet = null;
    this.targetCameraPos = new THREE.Vector3(40, 30, 80);
    this.targetLookAt = new THREE.Vector3(0, 0, 0);

    // Disable controls during sweep
    this.controls.enabled = false;
  }

  _animate() {
    requestAnimationFrame(() => this._animate());

    const delta = this.clock.getDelta();
    const elapsed = this.clock.getElapsedTime();
    const speed = this.animationSpeed;

    // Subtle starfield drift
    if (this.starfield) {
      this.starfield.rotation.y += 0.00002 * speed;
    }

    // Particle stars subtle twinkle
    if (this.particleStars) {
      this.particleStars.rotation.y += 0.00001 * speed;
      const sizes = this.particleStars.geometry.attributes.size;
      if (sizes && Math.random() < 0.3) {
        // Twinkle a few random stars per frame
        for (let i = 0; i < 20; i++) {
          const idx = Math.floor(Math.random() * sizes.count);
          sizes.array[idx] = 0.3 + Math.pow(Math.random(), 3) * 2.5;
        }
        sizes.needsUpdate = true;
      }
    }

    // Update sun shader (only if using shader material)
    if (this.sun.material.uniforms) {
      this.sun.material.uniforms.uTime.value = elapsed;
    }
    if (this.corona && this.corona.material.uniforms) {
      this.corona.material.uniforms.uTime.value = elapsed;
    }
    // Update corona shell shaders
    if (this.coronaShells) {
      for (const shell of this.coronaShells) {
        shell.material.uniforms.uTime.value = elapsed;
      }
    }
    // Update solar prominences
    if (this.prominences) {
      for (const prom of this.prominences) {
        prom.mesh.material.uniforms.uTime.value = elapsed;
        prom.mesh.material.uniforms.uAge.value += delta * prom.ageSpeed;
        // Recycle prominence when faded out
        if (prom.mesh.material.uniforms.uAge.value > 1.0) {
          prom.mesh.material.uniforms.uAge.value = 0;
        }
      }
    }

    // Slowly rotate the sun for realism
    if (this.sun) {
      this.sun.rotation.y += 0.0003 * speed;
    }

    // Advance simulation date and sync Keplerian positions
    if (!this._missionMode && speed > 0) {
      const daysAdvanced = delta * speed * this._daysPerSecond;
      this._simDate = advanceDateStr(this._simDate, daysAdvanced);
      this.syncPlanetsToDate(this._simDate);
      this._syncDwarfPlanetsToDate(this._simDate);

      // Fire date update callback
      if (this.onDateUpdate) this.onDateUpdate(this._simDate);
    }

    // Rotate and orbit planets
    const planetKeys = PLANET_ORDER.filter(k => k !== 'sun');
    for (const key of planetKeys) {
      const planet = this.planets[key];
      if (!planet) continue;

      // Self rotation
      const rotSpeed = planet.data.rotationSpeed || 0.005;
      planet.mesh.rotation.y += rotSpeed * delta * speed * 3;

      // Rotate moons
      if (this.moonMeshes[key]) {
        for (const moon of this.moonMeshes[key]) {
          moon.group.rotation.y += (moon.data.speed || 0.03) * delta * speed * 3;
        }
      }
    }

    // Dwarf planet self-rotation and moons
    for (const key of DWARF_PLANET_ORDER) {
      const planet = this.dwarfPlanets[key];
      if (!planet) continue;
      const rotSpeed = planet.data.rotationSpeed || 0.005;
      planet.mesh.rotation.y += rotSpeed * delta * speed * 3;
      if (this.dwarfMoonMeshes[key]) {
        for (const moon of this.dwarfMoonMeshes[key]) {
          moon.group.rotation.y += (moon.data.speed || 0.03) * delta * speed * 3;
        }
      }
    }

    // Rotate Earth clouds slightly faster
    if (this.earthClouds) {
      this.earthClouds.rotation.y += 0.0005 * speed;
    }

    // Update asteroid belts
    if (this.asteroidBelt) {
      this.asteroidBelt.update(delta * speed);
    }

    // Update ISS
    if (this.issTracker) {
      this.issTracker.update(delta * speed, elapsed, this.camera);
    }

    // Proximity-based orbit line fading
    if (this.showOrbits) {
      const allOrbitKeys = [...planetKeys, ...DWARF_PLANET_ORDER];
      for (const key of allOrbitKeys) {
        const orbitLine = this.orbitLines[key];
        if (!orbitLine) continue;
        const planetWorldPos = this.getPlanetWorldPosition(key);
        const camDist = this.camera.position.distanceTo(planetWorldPos);
        const pData = SOLAR_SYSTEM[key] || DWARF_PLANETS[key];
        const radius = pData ? pData.displayRadius : 1;
        orbitLine.material.opacity = 0.15 * THREE.MathUtils.clamp(camDist / (radius * 15), 0, 1);
      }
    }

    // Camera transition
    if (this.isTransitioning && this.targetCameraPos) {
      this.transitionProgress += delta / this.transitionDuration;
      const t = Math.min(this.transitionProgress, 1);
      // Quintic ease-in-out for cinematic smoothness
      const eased = t < 0.5
        ? 16 * t * t * t * t * t
        : 1 - Math.pow(-2 * t + 2, 5) / 2;

      // If tracking a selected planet, update target
      if (this.selectedPlanet) {
        const currentPos = this.getPlanetWorldPosition(this.selectedPlanet);
        const pData = SOLAR_SYSTEM[this.selectedPlanet] || DWARF_PLANETS[this.selectedPlanet];
        const radius = pData ? pData.displayRadius : 1;
        const distance = radius * 5 + 3;
        this.targetCameraPos.set(
          currentPos.x + distance * 0.7,
          currentPos.y + distance * 0.4,
          currentPos.z + distance * 0.7
        );
        this.targetLookAt.copy(currentPos);
      }

      // Cinematic spline sweep (on initial load)
      if (this._cinematicSpline) {
        this.camera.position.copy(this._cinematicSpline.getPoint(eased));
        this.controls.target.copy(this._cinematicLookSpline.getPoint(eased));
      }
      // Cubic Bezier arc for planet transitions
      else if (this._bezierCP1 && this._bezierCP2) {
        const u = eased;
        const u1 = 1 - u;
        // B(t) = (1-t)^3*P0 + 3*(1-t)^2*t*P1 + 3*(1-t)*t^2*P2 + t^3*P3
        this.camera.position.set(
          u1*u1*u1 * this.startCameraPos.x + 3*u1*u1*u * this._bezierCP1.x + 3*u1*u*u * this._bezierCP2.x + u*u*u * this.targetCameraPos.x,
          u1*u1*u1 * this.startCameraPos.y + 3*u1*u1*u * this._bezierCP1.y + 3*u1*u*u * this._bezierCP2.y + u*u*u * this.targetCameraPos.y,
          u1*u1*u1 * this.startCameraPos.z + 3*u1*u1*u * this._bezierCP1.z + 3*u1*u*u * this._bezierCP2.z + u*u*u * this.targetCameraPos.z
        );
        this.controls.target.lerpVectors(this.startLookAt, this.targetLookAt, eased);
      }
      // Quadratic Bezier fallback
      else if (this.transitionMidPoint) {
        const oneMinusT = 1 - eased;
        this.camera.position.set(
          oneMinusT * oneMinusT * this.startCameraPos.x + 2 * oneMinusT * eased * this.transitionMidPoint.x + eased * eased * this.targetCameraPos.x,
          oneMinusT * oneMinusT * this.startCameraPos.y + 2 * oneMinusT * eased * this.transitionMidPoint.y + eased * eased * this.targetCameraPos.y,
          oneMinusT * oneMinusT * this.startCameraPos.z + 2 * oneMinusT * eased * this.transitionMidPoint.z + eased * eased * this.targetCameraPos.z
        );
        this.controls.target.lerpVectors(this.startLookAt, this.targetLookAt, eased);
      } else {
        this.camera.position.lerpVectors(this.startCameraPos, this.targetCameraPos, eased);
        this.controls.target.lerpVectors(this.startLookAt, this.targetLookAt, eased);
      }

      // FOV zoom effect: telephoto during first 40%, settle back during remaining 60%
      if (this._fovZoomActive) {
        let fov;
        if (eased < 0.4) {
          // Narrow FOV (telephoto zoom)
          fov = this._defaultFOV - 15 * (1 - eased / 0.4);
        } else {
          // Settle back to default
          const settleT = (eased - 0.4) / 0.6;
          fov = (this._defaultFOV - 15) + 15 * settleT;
        }
        this.camera.fov = fov;
        this.camera.updateProjectionMatrix();
      }

      if (t >= 1) {
        this.isTransitioning = false;
        this.transitionMidPoint = null;
        this._bezierCP1 = null;
        this._bezierCP2 = null;

        // Reset FOV
        if (this._fovZoomActive) {
          this.camera.fov = this._defaultFOV;
          this.camera.updateProjectionMatrix();
          this._fovZoomActive = false;
        }

        // Enable auto-rotate after cinematic sweep
        if (this._cinematicSweepActive) {
          this._cinematicSweepActive = false;
          this._cinematicSpline = null;
          this._cinematicLookSpline = null;
          this.controls.enabled = true;
          this.controls.autoRotate = true;
          this.controls.autoRotateSpeed = 0.3;
        }
      }
    }

    // If following a planet, keep updating the look target
    if (this.selectedPlanet && !this.isTransitioning) {
      const currentPos = this.getPlanetWorldPosition(this.selectedPlanet);
      this.controls.target.lerp(currentPos, 0.05);
    }

    // Hover check
    this._checkHover();

    // Controls
    this.controls.update();

    // Render
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    // Callback for label updates
    if (this.onFrame) this.onFrame(delta);
  }

  dispose() {
    if (this.asteroidBelt) this.asteroidBelt.dispose();
    if (this.issTracker) this.issTracker.dispose();
    if (this.earthCityLights) {
      this.earthCityLights.geometry.dispose();
      const mat = this.earthCityLights.material;
      if (mat.uniforms && mat.uniforms.uCityMap) {
        mat.uniforms.uCityMap.value.dispose();
      } else if (mat.map) {
        mat.map.dispose();
      }
      mat.dispose();
    }
    this.renderer.dispose();
    window.removeEventListener('resize', this._onResize);
  }
}
