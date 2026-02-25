// @ts-check
/**
 * Main 3D scene — builds the solar system with Three.js.
 *
 * @typedef {Object} PlanetConfig
 * @property {string} key
 * @property {number} radius
 * @property {number} distance
 * @property {number} [tilt]
 * @property {number} [orbitSpeed]
 * @property {number} [rotationSpeed]
 * @property {string} [textureKey]
 * @property {number} [color]
 * @property {boolean} [hasRings]
 * @property {boolean} [hasClouds]
 * @property {Array<Object>} [moons]
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
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
  gasGiantVertexShader, gasGiantFragmentShader,
} from '../shaders/atmosphereShader.js';
import { getPlanetHeliocentricAU, getCurrentDateStr, dateToJulian, julianToDateStr } from './OrbitalMechanics.js';
import { AsteroidBelt } from './AsteroidBelt.js';
import { ISSTracker } from './ISSTracker.js';
import { Comet } from './Comet.js';
import { DWARF_PLANETS, DWARF_PLANET_ORDER } from '../data/dwarfPlanets.js';
import { ASTEROIDS, ASTEROID_ORDER } from '../data/asteroids.js';
import {
  generateMercuryTexture, generateVenusTexture, generateEarthTexture,
  generateEarthClouds, generateMarsTexture, generateJupiterTexture,
  generateSaturnTexture, generateUranusTexture, generateNeptuneTexture,
  generateMoonTexture, generateStarfield, generateRingTexture,
  createNoiseGenerator, fbm,
  generateBumpMap, generateEarthRoughnessMap, generateMarsRoughnessMap,
  generateEarthCityLights,
  generateRoughnessFromTexture, generateCityLightsFromTexture,
  generateCeresTexture, generatePlutoTexture, generateHaumeaTexture,
  generateMakemakeTexture, generateErisTexture,
} from '../textures/proceduralTextures.js';
import { loadAllTextures } from '../textures/textureLoader.js';

const orbitGlowVS = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const orbitGlowFS = `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  float center = 1.0 - abs(vUv.x - 0.5) * 2.0;
  float glow = pow(center, 2.0) * uOpacity;
  gl_FragColor = vec4(uColor, glow);
}
`;

const TEXTURE_GENERATORS = {
  mercury: generateMercuryTexture,
  venus: generateVenusTexture,
  earth: generateEarthTexture,
  mars: generateMarsTexture,
  jupiter: generateJupiterTexture,
  saturn: generateSaturnTexture,
  uranus: generateUranusTexture,
  neptune: generateNeptuneTexture,
  ceres: generateCeresTexture,
  pluto: generatePlutoTexture,
  haumea: generateHaumeaTexture,
  makemake: generateMakemakeTexture,
  eris: generateErisTexture,
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
    this.selectedMoonEntry = null; // tracks focused moon for post-transition camera tracking
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
    this._simJD = dateToJulian(this._simDate); // cached Julian date — avoids string roundtrip each frame
    this._daysPerSecond = 1; // 1 day per second at 1x speed

    // Dwarf planets
    this.dwarfPlanets = {};
    this.dwarfMoonMeshes = {};

    // Asteroid belts
    this.asteroidBelt = null;

    // ISS
    this.issTracker = null;

    this._rotationPaused = false;

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
    this._exposure = 1.2;
    this._autoExposure = false;
    this.renderer.toneMappingExposure = this._exposure;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
    this._createMilkyWayLayer();
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
    this.asteroidBelt.createNotableAsteroids();
    this._createAsteroidOrbits();
    this.onProgress(85);

    // Sync planets to today's real positions
    this.syncPlanetsToDate(this._simDate);
    this._syncDwarfPlanetsToDate(this._simDate);
    this._syncAsteroidsToDate(this._simDate);

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
      this._filmPass = new FilmPass(0, false);
      this._filmPass.uniforms.intensity.value = 0;
      this.composer.addPass(this._filmPass);
      // FXAA — compensates for hardware AA being ineffective inside EffectComposer framebuffers
      const fxaaPass = new ShaderPass(FXAAShader);
      fxaaPass.uniforms['resolution'].value.set(
        1 / (window.innerWidth * Math.min(window.devicePixelRatio, 2)),
        1 / (window.innerHeight * Math.min(window.devicePixelRatio, 2))
      );
      this._fxaaPass = fxaaPass;
      this.composer.addPass(fxaaPass);
    }

    // Bind event handlers so we can remove them later
    this._resizeHandler = this._debounce(() => this._onResize(), 150);
    this._mouseMoveHandler = (e) => this._onMouseMove(e);
    this._clickHandler = (e) => this._onClick(e);
    this._dblClickHandler = (e) => this._onDblClick(e);
    this._contextLostHandler = (e) => this._onContextLost(e);
    this._contextRestoredHandler = () => this._onContextRestored();

    window.addEventListener('resize', this._resizeHandler);
    this.renderer.domElement.addEventListener('mousemove', this._mouseMoveHandler);
    this.renderer.domElement.addEventListener('click', this._clickHandler);
    this.renderer.domElement.addEventListener('dblclick', this._dblClickHandler);
    this.renderer.domElement.addEventListener('webglcontextlost', this._contextLostHandler);
    this.renderer.domElement.addEventListener('webglcontextrestored', this._contextRestoredHandler);

    // ISS Tracker on Earth
    const earthPlanet = this.planets.earth;
    if (earthPlanet) {
      this.issTracker = new ISSTracker(earthPlanet.mesh, earthPlanet.data.displayRadius);
    }

    this.onProgress(100);

    // Initial cinematic sweep from close to sun to overview
    this._startCinematicSweep();

    // Start render loop
    this._initCameraEffects();
    this._initComets();
    this._initMeteorShower();
    this._animating = true;
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

  _createMilkyWayLayer() {
    const size = 2048;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size / 2;
    const ctx = canvas.getContext('2d');

    // Deep space black background
    ctx.fillStyle = '#000008';
    ctx.fillRect(0, 0, size, size / 2);

    // Milky Way band: dense star cluster along equator
    const bandCenterY = size / 4;
    const bandWidth = size / 6;

    // Background nebula glow
    const grd = ctx.createLinearGradient(0, bandCenterY - bandWidth, 0, bandCenterY + bandWidth);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(0.3, 'rgba(40,35,70,0.15)');
    grd.addColorStop(0.5, 'rgba(60,50,90,0.25)');
    grd.addColorStop(0.7, 'rgba(40,35,70,0.15)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, bandCenterY - bandWidth * 1.5, size, bandWidth * 3);

    // Dense star field in band
    for (let i = 0; i < 80000; i++) {
      const x = Math.random() * size;
      const bandBias = Math.random();
      const y = bandCenterY + (Math.random() - 0.5) * bandWidth * 3 * Math.pow(bandBias, 0.4);
      if (y < 0 || y > size / 2) continue;
      const brightness = Math.random();
      const sizePx = brightness > 0.97 ? 2 : 1;
      const alpha = 0.2 + brightness * 0.7;
      const r = Math.random();
      let color;
      if (r > 0.9) color = `rgba(180, 200, 255, ${alpha})`;
      else if (r > 0.8) color = `rgba(255, 240, 200, ${alpha})`;
      else color = `rgba(255, 255, 255, ${alpha})`;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, sizePx, sizePx);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;

    const geo = new THREE.SphereGeometry(2000, 64, 32);
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.PI * 0.05;
    this.scene.add(mesh);
    this._milkyWayMesh = mesh;
    this._milkyWayMat = mat;
  }

  _createParticleStars() {
    const count = 12000;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const baseSizes = new Float32Array(count);
    const seeds = new Float32Array(count); // Per-vertex random seed for shader twinkling

    // Star color palette: white, blue-white, yellow, orange-red
    const starColors = [
      [1.0, 1.0, 1.0],
      [0.8, 0.85, 1.0],
      [1.0, 0.95, 0.8],
      [1.0, 0.7, 0.5],
      [0.7, 0.8, 1.0],
    ];

    for (let i = 0; i < count; i++) {
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
      baseSizes[i] = 0.3 + Math.pow(Math.random(), 3) * 2.5;
      seeds[i] = Math.random() * 100.0; // random phase offset per star
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('baseSize', new THREE.BufferAttribute(baseSizes, 1));
    geo.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));

    // ShaderMaterial: twinkling computed entirely on GPU via uTime + per-vertex seed
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: /* glsl */`
        attribute float baseSize;
        attribute float seed;
        attribute vec3 color;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uTime;
        uniform float uPixelRatio;

        void main() {
          vColor = color;
          // Smooth oscillation: combine two sine waves with the per-vertex seed
          float twinkle = 0.75 + 0.25 * sin(uTime * 1.5 + seed)
                                * sin(uTime * 0.7 + seed * 0.3);
          vAlpha = twinkle;
          gl_PointSize = baseSize * twinkle * uPixelRatio;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          // Circular soft disc
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float alpha = smoothstep(0.5, 0.1, d) * vAlpha;
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: false, // colors handled via varying in shader
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
          uChromosphereStrength: { value: 0.6 },
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
    // Corona haze removed — sun_8k.jpg texture provides realistic photosphere appearance
    // this.scene.add(this.corona);

    // Corona shells removed — sun_8k.jpg texture provides realistic appearance
    const shellConfigs = [];
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
      points.visible = false; // Hidden by default — shown only during solar storm
      this.scene.add(points);
      this.prominences.push({ mesh: points, ageSpeed: 0.02 + Math.random() * 0.03 });
    }
  }

  /** Show or hide solar prominences (called when storm activates/deactivates). */
  setProminencesVisible(visible) {
    if (!this.prominences) return;
    for (const prom of this.prominences) {
      prom.mesh.visible = visible;
    }
  }

  _createLighting() {
    // Hemisphere light — warm neutral to avoid purple contamination
    this._hemiLight = new THREE.HemisphereLight(0x998877, 0x221111, 0.4);
    this.scene.add(this._hemiLight);

    // Ambient light — dim gray for base visibility on dark sides
    this._ambientLight = new THREE.AmbientLight(0x282828, 0.6);
    this.scene.add(this._ambientLight);

    // Subtle fill light to reduce harsh shadows
    this._fillLight = new THREE.DirectionalLight(0xffffff, 0.08);
    this._fillLight.position.set(0, 1, 1);
    this.scene.add(this._fillLight);

    // Shadow-casting DirectionalLight: tracks focused planet (avoids expensive PointLight cubemap)
    this._shadowLight = new THREE.DirectionalLight(0xFFF5E0, 0);
    this._shadowLight.castShadow = true;
    this._shadowLight.shadow.mapSize.width = 1024;
    this._shadowLight.shadow.mapSize.height = 1024;
    this._shadowLight.shadow.bias = -0.001;
    this._shadowLight.shadow.camera.near = 0.5;
    this._shadowLight.shadow.camera.far  = 200;
    this._shadowLight.shadow.camera.left = this._shadowLight.shadow.camera.bottom = -8;
    this._shadowLight.shadow.camera.right = this._shadowLight.shadow.camera.top  =  8;
    this.scene.add(this._shadowLight);
    this.scene.add(this._shadowLight.target);
    this._focusedPlanetKey = null;
  }

  _generateDetailNormalMap() {
    const S = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = S;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const h  = (n => n - Math.floor(n))(Math.sin(x * 127.1 + y * 311.7) * 43758.5);
        const hr = (n => n - Math.floor(n))(Math.sin((x+1)*127.1 + y*311.7) * 43758.5);
        const hd = (n => n - Math.floor(n))(Math.sin(x*127.1 + (y+1)*311.7) * 43758.5);
        const nx = (h - hr) * 6.0 + 0.5;
        const ny = (h - hd) * 6.0 + 0.5;
        const nz = 0.88;
        const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
        const i4 = (y * S + x) * 4;
        img.data[i4+0] = Math.floor((nx/len*0.5+0.5)*255);
        img.data[i4+1] = Math.floor((ny/len*0.5+0.5)*255);
        img.data[i4+2] = Math.floor((nz/len*0.5+0.5)*255);
        img.data[i4+3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  setRealisticLighting(on) {
    if (this._hemiLight) this._hemiLight.intensity = on ? 0 : 0.4;
    if (this._ambientLight) this._ambientLight.intensity = on ? 0.05 : 0.6;
    if (this._fillLight) this._fillLight.intensity = on ? 0 : 0.08;
    if (this.sunLight) this.sunLight.intensity = on ? 4.5 : 3.5;
    this._realisticLighting = on;
  }

  setPlanetRotationPaused(paused) {
    this._rotationPaused = paused;
  }

  /** Pause/resume the main render loop — used by CrossSectionViewer to free GPU on mobile */
  setRenderPaused(paused) {
    if (paused) {
      this._animating = false;
    } else if (!this._animating) {
      this._animating = true;
      this._animate();
    }
  }

  _createPlanets() {
    // Detail normal map for proximity surface detail (reused across all rocky planets)
    if (!this._detailNormalMap) {
      this._detailNormalMap = this._generateDetailNormalMap();
    }
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

      // Per-planet texture color correction (multiplies with texture map)
      const TEXTURE_TINT = {
        venus: new THREE.Color(0.88, 1.0, 0.82), // shift any reddish tone → cream/yellow
      };

      // Prefer photo-realistic textures, fallback to procedural
      if (this.textures[key]) {
        planetMat = new THREE.MeshStandardMaterial({
          map: this.textures[key],
          color: TEXTURE_TINT[key] ?? new THREE.Color(1, 1, 1),
          roughness: pbr.roughness,
          metalness: pbr.metalness,
        });
      } else if (TEXTURE_GENERATORS[key]) {
        if (['jupiter', 'saturn', 'uranus', 'neptune'].includes(key) && this._quality === 'high') {
          // Animated gas giant shader — latitude-band scrolling with limb darkening
          const texCanvas = TEXTURE_GENERATORS[key](1024);
          const diffuseTex = new THREE.CanvasTexture(texCanvas);
          diffuseTex.colorSpace = THREE.SRGBColorSpace;

          const BAND_VELOCITIES = {
            jupiter: [1.0, -0.8, 0.9, -1.0, 0.7, -0.9, 1.0, -0.8],
            saturn:  [0.4, -0.3, 0.35, -0.4, 0.3, -0.35, 0.4, -0.3],
            uranus:  [0.2, -0.15, 0.18, -0.2, 0.15, -0.18, 0.2, -0.15],
            neptune: [0.25, -0.2, 0.22, -0.25, 0.2, -0.22, 0.25, -0.2],
          };

          planetMat = new THREE.ShaderMaterial({
            vertexShader: gasGiantVertexShader,
            fragmentShader: gasGiantFragmentShader,
            uniforms: {
              tDiffuse: { value: diffuseTex },
              uTime: { value: 0 },
              uBandVelocities: { value: BAND_VELOCITIES[key] || [0,0,0,0,0,0,0,0] },
            },
          });
          if (!this._gasGiantMaterials) this._gasGiantMaterials = {};
          this._gasGiantMaterials[key] = planetMat;
        } else {
          const canvas = TEXTURE_GENERATORS[key](1024);
          const texture = new THREE.CanvasTexture(canvas);
          texture.colorSpace = THREE.SRGBColorSpace;
          planetMat = new THREE.MeshStandardMaterial({
            map: texture,
            roughness: pbr.roughness,
            metalness: pbr.metalness,
          });
        }
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
      planetMesh.castShadow = true;
      planetMesh.receiveShadow = true;

      // Proximity detail normal map (Epic 3)
      if (planetMat.isMeshStandardMaterial) {
        const _detailTex = this._detailNormalMap;
        planetMat.onBeforeCompile = (shader) => {
          shader.uniforms.uDetailNormal = { value: _detailTex };
          shader.uniforms.uDetailBlend  = { value: 0.0 };
          // Declare uniforms at top of fragment shader
          shader.fragmentShader = 'uniform sampler2D uDetailNormal;\nuniform float uDetailBlend;\n'
            + shader.fragmentShader;
          // Blend detail normal in at close range
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <normal_fragment_maps>',
            `#include <normal_fragment_maps>
            #ifdef USE_UV
            if (uDetailBlend > 0.001) {
              vec3 detailN = texture2D(uDetailNormal, vUv * 48.0).xyz * 2.0 - 1.0;
              normal = normalize(normal + vec3(detailN.x, detailN.y, 0.0) * uDetailBlend * 0.5);
            }
            #endif`
          );
          planetMat.userData.detailShader = shader;
        };
      }

      // Atmosphere for Earth, Venus, Mars, gas giants
      const atmConfig = {
        earth:   { color: 0x4488ff, intensity: 1.0, scale: 1.05, thickness: 1.0 },
        venus:   { color: 0xddaa44, intensity: 0.6, scale: 1.05, thickness: 3.0 },
        mars:    { color: 0xcc6644, intensity: 0.3, scale: 1.03, thickness: 0.15 },
        jupiter: { color: 0xccaa77, intensity: 0.5, scale: 1.04, thickness: 2.5 },
        saturn:  { color: 0xddcc88, intensity: 0.4, scale: 1.04, thickness: 2.0 },
        uranus:  { color: 0x88ccdd, intensity: 0.4, scale: 1.03, thickness: 2.0 },
        neptune: { color: 0x4466cc, intensity: 0.5, scale: 1.03, thickness: 2.2 },
      };
      if (atmConfig[key]) {
        const atm = atmConfig[key];
        const atmGeo = new THREE.SphereGeometry(planetData.displayRadius * atm.scale, 48, 48);
        const atmMat = new THREE.ShaderMaterial({
          vertexShader: atmosphereVertexShader,
          fragmentShader: atmosphereFragmentShader,
          uniforms: {
            uColor: { value: new THREE.Color(atm.color) },
            uIntensity: { value: atm.intensity },
            uSunPosition: { value: new THREE.Vector3(0, 0, 0) },
            uThickness: { value: atm.thickness },
            uTerminatorWidth: { value: 0.12 },
            uSunsetColor: { value: new THREE.Color(1.0, 0.4, 0.1) },
            uPlanetRadius: { value: planetData.displayRadius },
            uAtmRadius:    { value: planetData.displayRadius * atm.scale },
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
          moonGroup.rotation.z = THREE.MathUtils.degToRad(moonData.inclination || 0);
          planetMesh.add(moonGroup);

          // Correct ratio: (moonRealRadius / planetRealRadius) * planetDisplayRadius
          // preserves the true physical size relationship between moon and parent planet.
          const moonRadius = Math.max(0.12, (moonData.radius / planetData.radius) * planetData.displayRadius);
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
          // Ensure moon orbits outside the planet surface (min clearance = planetRadius + moonRadius + buffer)
          const rawDist = moonData.distance * planetData.displayRadius * 0.6;
          const minDist = planetData.displayRadius + moonRadius + 0.3;
          const moonDist = Math.max(rawDist, minDist);
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
          moonOrbitLine.rotation.z = THREE.MathUtils.degToRad(moonData.inclination || 0);

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
      ringMat = new THREE.ShaderMaterial({
        vertexShader: ringVertexShader,
        fragmentShader: ringFragmentShader,
        uniforms: {
          uRingTexture: { value: ringTexture },
          uSunPosition: { value: new THREE.Vector3(0, 0, 0) },
          uCameraPos: { value: new THREE.Vector3() },
          uPlanetPosition: { value: new THREE.Vector3() },
          uPlanetRadius: { value: planetData.displayRadius },
        },
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      this._saturnRingMat = ringMat;
    } else if (key === 'neptune') {
      // Neptune has five narrow, faint rings — Adams (brightest), Le Verrier, Galle, Lassell, Arago
      const nepCanvas = document.createElement('canvas');
      nepCanvas.width = 512; nepCanvas.height = 1;
      const nepCtx = nepCanvas.getContext('2d');
      // Transparent base
      nepCtx.clearRect(0, 0, 512, 1);
      // Ring bands as fractions of total ring width (inner→outer: Galle, Le Verrier, Lassell, Arago, Adams)
      const bands = [
        { pos: 0.08, w: 0.06, a: 0.12 }, // Galle — faint, wide
        { pos: 0.38, w: 0.025, a: 0.38 }, // Le Verrier — narrow, moderate
        { pos: 0.48, w: 0.08, a: 0.08 },  // Lassell — very faint, wide
        { pos: 0.58, w: 0.02, a: 0.22 },  // Arago — narrow
        { pos: 0.88, w: 0.03, a: 0.72 },  // Adams — brightest, narrow
      ];
      for (const b of bands) {
        const start = Math.round((b.pos - b.w / 2) * 512);
        const end   = Math.round((b.pos + b.w / 2) * 512);
        const grad  = nepCtx.createLinearGradient(start, 0, end, 0);
        grad.addColorStop(0, `rgba(100,140,200,0)`);
        grad.addColorStop(0.3, `rgba(110,150,210,${b.a})`);
        grad.addColorStop(0.7, `rgba(110,150,210,${b.a})`);
        grad.addColorStop(1, `rgba(100,140,200,0)`);
        nepCtx.fillStyle = grad;
        nepCtx.fillRect(start, 0, end - start, 1);
      }
      const nepTexture = new THREE.CanvasTexture(nepCanvas);
      nepTexture.needsUpdate = true;
      ringMat = new THREE.MeshBasicMaterial({
        map: nepTexture,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        opacity: 0.9,
      });
    } else {
      // Uranus — simple faint ring
      ringMat = new THREE.MeshBasicMaterial({
        color: 0x667788,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        opacity: 0.12,
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
        const r = planetData.orbitRadius;
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
      // Hide inner planet orbits — they look like dotted rings around the sun
      if (['mercury', 'venus', 'earth'].includes(key)) {
        orbitLine.visible = false;
      }
      // Apply inclination
      orbitLine.rotation.x = THREE.MathUtils.degToRad(planetData.orbitInclination || 0);
      this.scene.add(orbitLine);
      this.orbitLines[key] = orbitLine;

      // Orbit glow tube (desktop only)
      if (this._quality === 'high') {
        const glowPoints = [];
        for (let i = 0; i <= 128; i++) {
          const angle = (i / 128) * Math.PI * 2;
          glowPoints.push(new THREE.Vector3(Math.cos(angle) * planetData.orbitRadius, 0, Math.sin(angle) * planetData.orbitRadius));
        }
        const glowCurve = new THREE.CatmullRomCurve3(glowPoints, true);
        const glowGeo = new THREE.TubeGeometry(glowCurve, 128, 0.06, 4, true);
        const glowMat = new THREE.ShaderMaterial({
          vertexShader: orbitGlowVS,
          fragmentShader: orbitGlowFS,
          uniforms: {
            uColor: { value: new THREE.Color(0x4488cc) },
            uOpacity: { value: 0.0 },
          },
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const glowTube = new THREE.Mesh(glowGeo, glowMat);
        glowTube.rotation.x = THREE.MathUtils.degToRad(planetData.orbitInclination || 0);
        this.scene.add(glowTube);
        if (!this.orbitGlows) this.orbitGlows = {};
        this.orbitGlows[key] = glowTube;
      }
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

      const segments = 48;
      const planetGeo = new THREE.SphereGeometry(planetData.displayRadius, segments, segments);
      let planetMat;
      if (this.textures[key]) {
        // Real NASA/spacecraft photo texture
        planetMat = new THREE.MeshStandardMaterial({
          map: this.textures[key],
          roughness: 0.85,
          metalness: 0.05,
        });
      } else if (TEXTURE_GENERATORS[key]) {
        const texCanvas = TEXTURE_GENERATORS[key](1024);
        const texture = new THREE.CanvasTexture(texCanvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        planetMat = new THREE.MeshStandardMaterial({
          map: texture,
          roughness: 0.85,
          metalness: 0.05,
        });
      } else {
        planetMat = new THREE.MeshStandardMaterial({
          color: planetData.color,
          roughness: 0.85,
          metalness: 0.05,
        });
      }

      const planetMesh = new THREE.Mesh(planetGeo, planetMat);
      planetMesh.position.x = planetData.orbitRadius;
      planetMesh.rotation.z = THREE.MathUtils.degToRad(planetData.axialTilt || 0);
      planetMesh.userData = { key, type: 'planet' };
      tiltGroup.add(planetMesh);
      planetMesh.castShadow = true;
      planetMesh.receiveShadow = true;

      // Proximity detail normal map (Epic 3)
      if (planetMat.isMeshStandardMaterial) {
        const _detailTex = this._detailNormalMap;
        planetMat.onBeforeCompile = (shader) => {
          shader.uniforms.uDetailNormal = { value: _detailTex };
          shader.uniforms.uDetailBlend  = { value: 0.0 };
          // Declare uniforms at top of fragment shader
          shader.fragmentShader = 'uniform sampler2D uDetailNormal;\nuniform float uDetailBlend;\n'
            + shader.fragmentShader;
          // Blend detail normal in at close range
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <normal_fragment_maps>',
            `#include <normal_fragment_maps>
            #ifdef USE_UV
            if (uDetailBlend > 0.001) {
              vec3 detailN = texture2D(uDetailNormal, vUv * 48.0).xyz * 2.0 - 1.0;
              normal = normalize(normal + vec3(detailN.x, detailN.y, 0.0) * uDetailBlend * 0.5);
            }
            #endif`
          );
          planetMat.userData.detailShader = shader;
        };
      }

      // Moons for dwarf planets (e.g., Charon for Pluto)
      const moonMeshes = [];
      if (planetData.moons && planetData.moons.length > 0) {
        for (let mi = 0; mi < planetData.moons.length; mi++) {
          const moonData = planetData.moons[mi];
          const moonGroup = new THREE.Group();
          moonGroup.rotation.y = mi * 2.1 + Math.random() * Math.PI;
          moonGroup.rotation.z = THREE.MathUtils.degToRad(moonData.inclination || 0);
          planetMesh.add(moonGroup);

          const moonRadius = Math.max(0.12, (moonData.radius / planetData.radius) * planetData.displayRadius);
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
          // Ensure moon orbits outside the dwarf planet surface
          const rawDist = moonData.distance * planetData.displayRadius * 0.6;
          const minDist = planetData.displayRadius + moonRadius + 0.2;
          const moonDist = Math.max(rawDist, minDist);
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
      orbitLine.visible = false; // hide dwarf planet dotted rings
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
      const newRotY = Math.atan2(-posAU.y, posAU.x);
      if (!isFinite(newRotY)) continue;
      planet.orbitGroup.rotation.y = newRotY;
    }
  }

  _createAsteroidOrbits() {
    if (!this.asteroidBelt) return;
    for (const key of ASTEROID_ORDER) {
      const data = ASTEROIDS[key];
      if (!data) continue;

      const segments = 256;
      const points = [];
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const e = data.eccentricity || 0;
        const r = data.orbitRadius * (1 - e * e) / (1 + e * Math.cos(angle));
        points.push(Math.cos(angle) * r, 0, Math.sin(angle) * r);
      }

      const orbitGeo = new THREE.BufferGeometry();
      orbitGeo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      const orbitMat = new THREE.LineDashedMaterial({
        color: 0x888866,
        transparent: true,
        opacity: 0.1,
        dashSize: 0.8,
        gapSize: 0.6,
      });

      const orbitLine = new THREE.Line(orbitGeo, orbitMat);
      orbitLine.computeLineDistances();
      orbitLine.rotation.x = THREE.MathUtils.degToRad(data.orbitInclination || 0);
      this.scene.add(orbitLine);
      this.orbitLines[key] = orbitLine;
    }
  }

  _syncAsteroidsToDate(dateStr) {
    if (!dateStr || !this.asteroidBelt) return;
    for (const key of ASTEROID_ORDER) {
      const asteroid = this.asteroidBelt.getNotableAsteroid(key);
      if (!asteroid) continue;
      const posAU = getPlanetHeliocentricAU(key, dateStr);
      if (posAU.x === 0 && posAU.y === 0 && posAU.z === 0) continue;
      const newRotY = Math.atan2(-posAU.y, posAU.x);
      if (!isFinite(newRotY)) continue;
      asteroid.orbitGroup.rotation.y = newRotY;
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
    if (planet) {
      const worldPos = new THREE.Vector3();
      planet.mesh.getWorldPosition(worldPos);
      return worldPos;
    }
    // Check notable asteroids
    if (this.asteroidBelt) {
      const asteroid = this.asteroidBelt.getNotableAsteroid(key);
      if (asteroid) {
        const worldPos = new THREE.Vector3();
        asteroid.mesh.getWorldPosition(worldPos);
        return worldPos;
      }
    }
    return new THREE.Vector3(0, 0, 0);
  }

  /** Focus camera on a planet with cinematic cubic Bezier arc */
  focusOnPlanet(key) {
    this._focusedPlanetKey = key;
    const worldPos = this.getPlanetWorldPosition(key);
    const planetData = SOLAR_SYSTEM[key] || DWARF_PLANETS[key] || ASTEROIDS[key];
    if (!planetData) return;
    const radius = planetData.displayRadius;
    // Dwarf planets and asteroids are tiny — get camera closer for visibility
    const isDwarf = DWARF_PLANETS[key] !== undefined;
    const isAsteroid = ASTEROIDS[key] !== undefined;
    const distance = (isDwarf || isAsteroid) ? radius * 3 + 2 : radius * 5 + 3;

    this.startCameraPos.copy(this.camera.position);
    this.startLookAt.copy(this.controls.target);
    // Special case: Sun is at origin — normalize() on a zero vector returns NaN, placing
    // the camera directly below. Use a fixed approach angle instead.
    let litSide;
    if (key === 'sun') {
      litSide = new THREE.Vector3(0.6, 0.3, 0.8).normalize();
    } else {
      const sunToplanet = worldPos.clone().normalize();
      litSide = sunToplanet.clone().negate(); // planet → sun = lit-side direction
      litSide.y += 0.4;   // elevate slightly above equatorial plane
      litSide.normalize();
    }
    // Place camera on the lit side (sun-facing hemisphere), looking at planet
    this.targetCameraPos = worldPos.clone().addScaledVector(litSide, distance);
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
    this.selectedMoonEntry = null; // clear moon focus when selecting a planet

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
    this.selectedMoonEntry = moonEntry; // track moon for post-transition camera following

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
    this.selectedMoonEntry = null;

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
    this.selectedMoonEntry = null;

    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.2;
    this.controls.minDistance = 5;
  }

  setAnimationSpeed(speed) {
    this.animationSpeed = speed;
  }

  startLightSpeedMode() {
    if (this._lightSpeedActive) return;
    this._lightSpeedActive = true;
    this._lightSpeedStart = performance.now();
    this._savedTimeScale = this.animationSpeed;
    this.animationSpeed = 0;

    // Create expanding light ring
    const ringGeo = new THREE.RingGeometry(0.1, 0.3, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffcc,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this._lightRing = new THREE.Mesh(ringGeo, ringMat);
    this._lightRing.rotation.x = Math.PI / 2;
    this.scene.add(this._lightRing);

    // HUD overlay
    const hud = document.createElement('div');
    hud.id = 'lightspeed-hud';
    hud.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:rgba(0,0,10,0.85);border:1px solid rgba(255,255,150,0.4);border-radius:12px;padding:16px 24px;color:#ffffcc;font-family:monospace;font-size:0.85rem;z-index:800;text-align:center;pointer-events:none;';
    hud.innerHTML = '<div style="font-size:1rem;font-weight:bold;margin-bottom:8px;">Speed of Light from Sun</div><div id="lightspeed-status">Light departing...</div><div style="margin-top:8px;font-size:0.75rem;color:#aaa;">Mercury 3.2 min | Earth 8.3 min | Mars 12.6 min | Jupiter 43 min | Saturn 79 min</div>';
    document.body.appendChild(hud);
    this._lightSpeedHud = hud;
  }

  stopLightSpeedMode() {
    if (!this._lightSpeedActive) return;
    this._lightSpeedActive = false;
    if (this._lightRing) {
      this._lightRing.geometry.dispose();
      this._lightRing.material.dispose();
      this.scene.remove(this._lightRing);
      this._lightRing = null;
    }
    if (this._lightSpeedHud) {
      this._lightSpeedHud.remove();
      this._lightSpeedHud = null;
    }
    this.animationSpeed = this._savedTimeScale || 1;
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
      const newRotY = Math.atan2(-posAU.y, posAU.x);
      if (!isFinite(newRotY)) continue; // NaN guard — hold previous valid rotation
      planet.orbitGroup.rotation.y = newRotY;
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
    if (this._fxaaPass) {
      const dpr = Math.min(window.devicePixelRatio, 2);
      this._fxaaPass.uniforms['resolution'].value.set(1 / (w * dpr), 1 / (h * dpr));
    }
  }

  _onMouseMove(event) {
    const newX = (event.clientX / window.innerWidth) * 2 - 1;
    const newY = -(event.clientY / window.innerHeight) * 2 + 1;
    // Track pixel-space delta to skip raycast when mouse barely moved
    this._lastMousePxX = this._lastMousePxX ?? event.clientX;
    this._lastMousePxY = this._lastMousePxY ?? event.clientY;
    const dx = event.clientX - this._lastMousePxX;
    const dy = event.clientY - this._lastMousePxY;
    this._mouseMovedEnough = (dx * dx + dy * dy) >= 4; // 2px threshold squared
    if (this._mouseMovedEnough) {
      this._lastMousePxX = event.clientX;
      this._lastMousePxY = event.clientY;
    }
    this.mouse.x = newX;
    this.mouse.y = newY;
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
    // Notable asteroids
    if (this.asteroidBelt) {
      for (const key of ASTEROID_ORDER) {
        const asteroid = this.asteroidBelt.getNotableAsteroid(key);
        if (asteroid) clickable.push(asteroid.mesh);
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

    // Check ISS first — it's a Group so needs recursive raycasting
    if (this.issTracker && this.issTracker.issMesh && this.issTracker.issMesh.visible) {
      const issHits = this.raycaster.intersectObject(this.issTracker.issMesh, true);
      if (issHits.length > 0) {
        if (this.onISSClick) this.onISSClick();
        return;
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

  /** Double-click: if a planet is hit focus on it; otherwise pivot orbit around clicked point */
  _onDblClick(event) {
    if (this.selectedPlanet || this.isTransitioning) return;

    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Collect planet meshes only
    const clickable = [];
    for (const key of PLANET_ORDER) {
      if (this.planets[key]) clickable.push(this.planets[key].mesh);
    }
    for (const key of DWARF_PLANET_ORDER) {
      if (this.dwarfPlanets[key]) clickable.push(this.dwarfPlanets[key].mesh);
    }

    const intersects = this.raycaster.intersectObjects(clickable, false);
    if (intersects.length > 0) {
      const hit = intersects[0].object;
      if (hit.userData.type === 'planet') {
        this.focusOnPlanet(hit.userData.key);
        if (this.onPlanetClick) this.onPlanetClick(hit.userData.key);
      }
    } else {
      // Empty space double-click: set orbit pivot to the clicked world point
      const ray = this.raycaster.ray;
      // Project onto horizontal plane y=0 for natural pivot
      if (Math.abs(ray.direction.y) > 0.001) {
        const t2 = -ray.origin.y / ray.direction.y;
        if (t2 > 0 && t2 < 500) {
          const worldPoint = ray.origin.clone().addScaledVector(ray.direction, t2);
          worldPoint.y = 0;
          this.startLookAt.copy(this.controls.target);
          this.targetLookAt = worldPoint;
          this.startCameraPos.copy(this.camera.position);
          this.targetCameraPos = this.camera.position.clone();
          this.transitionDuration = 0.5;
          this.transitionMidPoint = null;
          this._bezierCP1 = null;
          this._bezierCP2 = null;
          this.isTransitioning = true;
          this.transitionProgress = 0;
        }
      }
    }
  }


  /** Raycast for hover — skipped if mouse didn't move enough */
  _checkHover() {
    if (!this._mouseMovedEnough) return;
    this._mouseMovedEnough = false;
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const clickable = [];
    for (const key of PLANET_ORDER) {
      if (this.planets[key]) clickable.push(this.planets[key].mesh);
    }
    for (const key of DWARF_PLANET_ORDER) {
      if (this.dwarfPlanets[key]) clickable.push(this.dwarfPlanets[key].mesh);
    }
    if (this.asteroidBelt) {
      for (const key of ASTEROID_ORDER) {
        const asteroid = this.asteroidBelt.getNotableAsteroid(key);
        if (asteroid) clickable.push(asteroid.mesh);
      }
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
    this.selectedMoonEntry = null;
    this.targetCameraPos = new THREE.Vector3(40, 30, 80);
    this.targetLookAt = new THREE.Vector3(0, 0, 0);

    // Disable controls during sweep
    this.controls.enabled = false;
  }

  _animate() {
    if (!this._animating) return;
    requestAnimationFrame(() => this._animate());

    const delta = this.clock.getDelta();
    const elapsed = this.clock.getElapsedTime();
    const speed = this.animationSpeed;

    // Subtle starfield drift
    if (this.starfield) {
      this.starfield.rotation.y += 0.00002 * speed;
    }

    // Milky Way fade-in based on camera distance
    if (this._milkyWayMat) {
      const dist = this.camera.position.length();
      const t = THREE.MathUtils.clamp((dist - 400) / 300, 0, 1);
      this._milkyWayMat.opacity = t * 0.55;
    }

    // Particle stars — twinkling driven by shader uniform (GPU, zero CPU array writes)
    if (this.particleStars) {
      this.particleStars.rotation.y += 0.00001 * speed;
      if (this.particleStars.material.uniforms) {
        this.particleStars.material.uniforms.uTime.value = elapsed;
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

    // Update ring phase scattering uniforms
    if (this._saturnRingMat && this._saturnRingMat.uniforms) {
      this._saturnRingMat.uniforms.uCameraPos.value.copy(this.camera.position);
    }

    // Slowly rotate the sun for realism
    if (this.sun) {
      this.sun.rotation.y += 0.0003 * speed;
    }

    // Light speed ring animation
    if (this._lightSpeedActive && this._lightRing) {
      const elapsed_ls = (performance.now() - this._lightSpeedStart) / 1000; // seconds
      // 1 AU = 36 scene units, 8.3 minutes realtime = 498 seconds
      // Compress: 1 scene second = 16.6 realtime seconds (so 30s anim covers ~500s realtime)
      const scaledTime = elapsed_ls * 16.6;
      // Expand at 1 AU per 498 seconds: radius = (scaledTime / 498) * 36 scene units
      const ringRadius = (scaledTime / 498) * 36;
      this._lightRing.scale.set(ringRadius, ringRadius, 1);

      // Fade opacity as it expands
      this._lightRing.material.opacity = Math.max(0, 0.9 - ringRadius / 80);

      // Update status text
      const minutesElapsed = scaledTime / 60;
      const statusEl = document.getElementById('lightspeed-status');
      if (statusEl) {
        let status = `Light has traveled for ${minutesElapsed.toFixed(1)} minutes`;
        if (minutesElapsed >= 3.2 && minutesElapsed < 8.3) status += ' — passing Mercury';
        else if (minutesElapsed >= 8.3 && minutesElapsed < 12.6) status += ' — reaching Earth';
        else if (minutesElapsed >= 12.6 && minutesElapsed < 43) status += ' — passing Mars';
        else if (minutesElapsed >= 43 && minutesElapsed < 79) status += ' — reaching Jupiter';
        else if (minutesElapsed >= 79) status += ' — passing Saturn';
        statusEl.textContent = status;
      }

      // Stop after 35 seconds
      if (elapsed_ls > 35) this.stopLightSpeedMode();
    }

    // Advance simulation date and sync Keplerian positions
    if (!this._missionMode && speed > 0) {
      const daysAdvanced = Math.min(delta * speed * this._daysPerSecond, 30);
      this._simJD += daysAdvanced; // advance Julian date numerically — no string parse/format roundtrip
      this._simDate = julianToDateStr(this._simJD);
      this.syncPlanetsToDate(this._simJD);
      this._syncDwarfPlanetsToDate(this._simJD);
      this._syncAsteroidsToDate(this._simJD);

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
      if (!this._rotationPaused) planet.mesh.rotation.y += rotSpeed * delta * speed * 3;

      // Rotate moons
      if (this.moonMeshes[key]) {
        for (const moon of this.moonMeshes[key]) {
          if (!this._rotationPaused) moon.group.rotation.y += (moon.data.speed || 0.03) * delta * speed * 3;
        }
      }
    }

    // Update gas giant shader uniforms
    if (this._gasGiantMaterials) {
      for (const [gKey, mat] of Object.entries(this._gasGiantMaterials)) {
        if (mat.uniforms && mat.uniforms.uTime) {
          mat.uniforms.uTime.value = elapsed;
        }
      }
    }

    // Dwarf planet self-rotation and moons
    for (const key of DWARF_PLANET_ORDER) {
      const planet = this.dwarfPlanets[key];
      if (!planet) continue;
      const rotSpeed = planet.data.rotationSpeed || 0.005;
      if (!this._rotationPaused) planet.mesh.rotation.y += rotSpeed * delta * speed * 3;
      if (this.dwarfMoonMeshes[key]) {
        for (const moon of this.dwarfMoonMeshes[key]) {
          if (!this._rotationPaused) moon.group.rotation.y += (moon.data.speed || 0.03) * delta * speed * 3;
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

    // Update comets
    if (this._comets) {
      const deltaDays = delta * speed * this._daysPerSecond;
      const sunWorldPos = new THREE.Vector3(0, 0, 0);
      for (const comet of this._comets) {
        comet.update(Math.min(deltaDays, 100), sunWorldPos);
      }
    }

    // Meteor shower: trigger when time warp >= 500x and Earth is focused
    if (this._meteorShowerObj) {
      const earthPlanet = this.planets['earth'];
      if (earthPlanet && speed >= 500 && this.selectedPlanet === 'earth') {
        if (!this._meteorShowerActive && Math.random() < 0.002) {
          // Trigger
          this._meteorShowerActive = true;
          this._meteorShowerTimer = 0;
          earthPlanet.mesh.add(this._meteorShowerObj);
          document.dispatchEvent(new CustomEvent('meteor-shower'));
        }
      }
      if (this._meteorShowerActive) {
        this._meteorShowerTimer += delta;
        const fadeIn = Math.min(1, this._meteorShowerTimer / 0.2);
        const fadeOut = this._meteorShowerTimer > 2.5 ? Math.max(0, 1 - (this._meteorShowerTimer - 2.5) / 0.5) : 1;
        this._meteorShowerObj.material.opacity = fadeIn * fadeOut * 0.9;
        if (this._meteorShowerTimer > 3.0) {
          this._meteorShowerActive = false;
          if (this._meteorShowerObj.parent) this._meteorShowerObj.parent.remove(this._meteorShowerObj);
        }
      }
    }


    // Proximity-based orbit line fading
    if (this.showOrbits) {
      const allOrbitKeys = [...planetKeys, ...DWARF_PLANET_ORDER, ...ASTEROID_ORDER];
      for (const key of allOrbitKeys) {
        const orbitLine = this.orbitLines[key];
        if (!orbitLine) continue;
        const planetWorldPos = this.getPlanetWorldPosition(key);
        const camDist = this.camera.position.distanceTo(planetWorldPos);
        const pData = SOLAR_SYSTEM[key] || DWARF_PLANETS[key] || ASTEROIDS[key];
        const radius = pData ? pData.displayRadius : 1;
        orbitLine.material.opacity = 0.15 * THREE.MathUtils.clamp(camDist / (radius * 15), 0, 1);
      }
    }

    // Orbit glow proximity fade
    if (this.orbitGlows && this._quality === 'high') {
      for (const key of planetKeys) {
        const glowTube = this.orbitGlows[key];
        if (!glowTube) continue;
        const pData = SOLAR_SYSTEM[key];
        if (!pData) continue;
        const planetWorldPos = this.getPlanetWorldPosition(key);
        const camDist = this.camera.position.distanceTo(planetWorldPos);
        const targetOpacity = THREE.MathUtils.clamp(1 - camDist / (pData.displayRadius * 25), 0, 0.4);
        glowTube.material.uniforms.uOpacity.value += (targetOpacity - glowTube.material.uniforms.uOpacity.value) * 0.05;
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

      // After transition completes, snap to current planet position
      // During transition, keep the fixed target to avoid jitter

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

    // If following a moon or planet, keep updating the look target
    if (this.selectedMoonEntry && !this.isTransitioning) {
      const moonWorldPos = new THREE.Vector3();
      this.selectedMoonEntry.mesh.getWorldPosition(moonWorldPos);
      this.controls.target.lerp(moonWorldPos, 0.05);
    } else if (this.selectedPlanet && !this.isTransitioning) {
      const currentPos = this.getPlanetWorldPosition(this.selectedPlanet);
      this.controls.target.lerp(currentPos, 0.05);
    } else if (!this.isTransitioning) {
      // Smart pan: orbit centre drifts with camera so the Sun is not permanently locked
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      const newTarget = this.camera.position.clone().addScaledVector(dir, 60);
      this.controls.target.lerp(newTarget, 0.015);
    }

    // Camera effects (shake, lens flare)
    this._updateCameraEffects(delta);

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


  _initComets() {
    this._comets = [
      // Halley-like (79-year period)
      new Comet(this.scene, {
        periapsis: 3.2, apoapsis: 200, period: 28835,
        inclination: 162.2, startAngle: 0, name: "Halley-like",
      }),
      // Hale-Bopp-like (2500-year period)
      new Comet(this.scene, {
        periapsis: 5.0, apoapsis: 360, period: 913000,
        inclination: 89.4, startAngle: 1.8, name: "Hale-Bopp-like",
      }),
      // Short-period (6-year)
      new Comet(this.scene, {
        periapsis: 5.5, apoapsis: 80, period: 2190,
        inclination: 11.8, startAngle: 3.5, name: "Short-period",
      }),
    ];
  }

  _initMeteorShower() {
    const count = 150;
    const positions = new Float32Array(count * 6); // 2 points per streak
    const geo = new THREE.BufferGeometry();
    // Create line segments — 2 vertices per streak
    for (let i = 0; i < count; i++) {
      // Random point on Earth's night hemisphere (lat cap around dark side)
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random()); // 0 to PI/2 → front hemisphere; offset to dark side
      const r = 1.5; // slightly outside Earth surface (display radius ~1.5 for Earth)
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.cos(phi) * 0.5;
      const z = r * Math.sin(phi) * Math.sin(theta);
      const len = 0.1 + Math.random() * 0.2;
      // Line from outer atmosphere inward
      positions[i * 6] = x;
      positions[i * 6 + 1] = y;
      positions[i * 6 + 2] = z;
      positions[i * 6 + 3] = x * (1 - len / r);
      positions[i * 6 + 4] = y * (1 - len / r);
      positions[i * 6 + 5] = z * (1 - len / r);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0xffffaa,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this._meteorShowerObj = new THREE.LineSegments(geo, mat);
    // Will be added to Earth's mesh later
    this._meteorShowerActive = false;
    this._meteorShowerTimer = 0;
  }

  _initCameraEffects() {
    this._shakeIntensity = 0;
    // Lens flare sprite
    const flareCanvas = document.createElement('canvas');
    flareCanvas.width = 64; flareCanvas.height = 64;
    const ctx = flareCanvas.getContext('2d');
    const grad = ctx.createRadialGradient(32,32,0,32,32,32);
    grad.addColorStop(0,'rgba(255,240,200,0.9)');
    grad.addColorStop(0.3,'rgba(255,220,100,0.4)');
    grad.addColorStop(1,'rgba(255,200,50,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,64,64);
    const flareTex = new THREE.CanvasTexture(flareCanvas);
    const flareMat = new THREE.SpriteMaterial({ map: flareTex, transparent: true, blending: THREE.AdditiveBlending, depthTest: false });
    this._lensFlareSprite = new THREE.Sprite(flareMat);
    this._lensFlareSprite.scale.set(8,8,1);
    this._lensFlareSprite.position.set(0,0,0);
    this.scene.add(this._lensFlareSprite);
    // Lens dirt DOM overlay
    const dirt = document.createElement('div');
    dirt.id = 'lens-dirt';
    dirt.style.cssText = 'position:fixed;inset:0;pointer-events:none;opacity:0;transition:opacity 0.3s;background:radial-gradient(ellipse at 30% 40%,rgba(255,240,180,0.12) 0%,transparent 60%),radial-gradient(ellipse at 70% 60%,rgba(200,220,255,0.08) 0%,transparent 50%);z-index:5;';
    document.body.appendChild(dirt);
    this._lensDirt = dirt;
  }

  addCameraShake(intensity) {
    this._shakeIntensity = Math.max(this._shakeIntensity || 0, intensity);
  }

  _updateCameraEffects(delta) {
    // Decay shake
    if (this._shakeIntensity > 0) {
      const offset = new THREE.Vector3(
        (Math.random()-0.5) * this._shakeIntensity,
        (Math.random()-0.5) * this._shakeIntensity,
        (Math.random()-0.5) * this._shakeIntensity
      );
      this.camera.position.add(offset);
      this._shakeIntensity *= 0.88;
      if (this._shakeIntensity < 0.0001) this._shakeIntensity = 0;
    }
    // Asteroid belt continuous shake
    const camLen = this.camera.position.length();
    if (camLen >= 55 && camLen <= 90) {
      this.addCameraShake(0.008);
    }
    // Auto-exposure
    if (this._autoExposure && this.sun) {
      const sp = this.sun.position.clone().project(this.camera);
      const onScreen = Math.abs(sp.x) < 1 && Math.abs(sp.y) < 1 && sp.z < 1;
      const targetExp = onScreen ? 0.9 : 1.4;
      this._exposure += (targetExp - this._exposure) * 0.02;
      this.renderer.toneMappingExposure = THREE.MathUtils.clamp(this._exposure, 0.7, 1.8);
    }

    // Update shadow light to track focused planet (efficient shadow casting)
    if (this._shadowLight && this._focusedPlanetKey) {
      const fKey = this._focusedPlanetKey;
      const pd   = SOLAR_SYSTEM[fKey] || DWARF_PLANETS[fKey];
      if (pd) {
        const wp = this.getPlanetWorldPosition(fKey);
        // DirectionalLight: position is in sun direction FROM planet, target IS planet
        const sunToplanet = wp.clone().normalize();
        this._shadowLight.position.copy(wp).addScaledVector(sunToplanet.negate(), 30);
        this._shadowLight.target.position.copy(wp);
        this._shadowLight.target.updateMatrixWorld();
        const r = pd.displayRadius * 2.2;
        this._shadowLight.shadow.camera.left   = -r;
        this._shadowLight.shadow.camera.right  =  r;
        this._shadowLight.shadow.camera.top    =  r;
        this._shadowLight.shadow.camera.bottom = -r;
        this._shadowLight.shadow.camera.updateProjectionMatrix();
        this._shadowLight.intensity = this._realisticLighting ? 4.5 : 3.5;
      }
    }

    // DOF focus tracking
    if (this._bokehPass?.enabled && this._targetCameraPos) {
      const dist = this._targetCameraPos.distanceTo(this.camera.position);
      this._bokehPass.uniforms['focus'].value += (dist - this._bokehPass.uniforms['focus'].value) * 0.05;
    }

    // Update detail normal map blend based on camera proximity
    for (const key of ['mercury','venus','earth','mars','pluto']) {
      const planet = this.planets[key];
      if (!planet || !planet.mesh.material.userData.detailShader) continue;
      const wp = this.getPlanetWorldPosition(key);
      const camDist = this.camera.position.distanceTo(wp);
      const r = planet.data.displayRadius;
      // Blend in at 4x radius, full at 1.5x radius
      const t = THREE.MathUtils.clamp((camDist / r - 1.5) / 2.5, 0.0, 1.0);
      planet.mesh.material.userData.detailShader.uniforms.uDetailBlend.value = 1.0 - t;
    }

    // Lens flare visibility based on sun position
    if (this._lensFlareSprite && this.sun) {
      const sunScreenPos = this.sun.position.clone().project(this.camera);
      const inView = Math.abs(sunScreenPos.x) < 1 && Math.abs(sunScreenPos.y) < 1 && sunScreenPos.z < 1;
      const opacity = inView ? Math.max(0, 1 - Math.sqrt(sunScreenPos.x*sunScreenPos.x + sunScreenPos.y*sunScreenPos.y) * 1.5) : 0;
      this._lensFlareSprite.material.opacity = opacity * 0.6;
      if (this._lensDirt) this._lensDirt.style.opacity = (opacity * 0.4).toFixed(3);
    }
  }

  /** Simple debounce helper — returns a debounced version of fn */
  _debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  /** Handle WebGL context loss — stop rendering until restored */
  _onContextLost(event) {
    event.preventDefault(); // Required to allow context restoration
    this._animating = false;

    // Show a recovery UI overlay
    const overlay = document.createElement('div');
    overlay.id = 'webgl-recovery-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);color:#fff;display:flex;align-items:center;justify-content:center;z-index:9999;font-family:sans-serif;font-size:1.1rem;text-align:center;';
    overlay.innerHTML = '<div><p>⚠ Graphics context lost.</p><p>Attempting to recover…</p></div>';
    document.body.appendChild(overlay);
  }

  /** Handle WebGL context restoration — reinitialize and restart loop */
  _onContextRestored() {
    const overlay = document.getElementById('webgl-recovery-overlay');
    if (overlay) overlay.remove();

    // Re-upload textures and restart the loop
    this._animating = true;
    this._animate();
  }


  _initEclipseShadows() {
    this._eclipseShadows = {};
    // Earth lunar eclipse shadow
    const earthShadowGeo = new THREE.PlaneGeometry(1, 1);
    const earthShadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const earthShadow = new THREE.Mesh(earthShadowGeo, earthShadowMat);
    earthShadow.renderOrder = 1;
    this.scene.add(earthShadow);
    this._eclipseShadows['earth'] = earthShadow;

    // Jupiter moon shadow dots
    for (const moonKey of ['io', 'europa']) {
      const jShadowGeo = new THREE.PlaneGeometry(1, 1);
      const jShadowMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const jShadow = new THREE.Mesh(jShadowGeo, jShadowMat);
      jShadow.renderOrder = 1;
      this.scene.add(jShadow);
      this._eclipseShadows[`jupiter_${moonKey}`] = jShadow;
    }
  }

  _updateEclipseShadows() {
    if (!this._eclipseShadows) return;
    const sunPos = new THREE.Vector3(0, 0, 0);

    // Earth-Moon eclipse
    const earthPlanet = this.planets['earth'];
    if (earthPlanet && this.moonMeshes['earth'] && this.moonMeshes['earth'].length > 0) {
      const earthPos = new THREE.Vector3();
      earthPlanet.mesh.getWorldPosition(earthPos);
      const moonEntry = this.moonMeshes['earth'][0];
      const moonPos = new THREE.Vector3();
      moonEntry.mesh.getWorldPosition(moonPos);
      const moonRadius = moonEntry.data.radius ? moonEntry.mesh.geometry.parameters.radius : 0.27;

      // Anti-solar direction from earth
      const antiSolar = earthPos.clone().sub(sunPos).normalize();
      const toMoon = moonPos.clone().sub(earthPos).normalize();
      const alignment = antiSolar.dot(toMoon);
      const moonDist = earthPos.distanceTo(moonPos);
      const shadow = this._eclipseShadows['earth'];
      if (alignment > 0.97 && moonDist < earthPlanet.data.displayRadius * 5) {
        // Moon is roughly in anti-solar direction — solar eclipse
        const angularSize = (earthPlanet.data.displayRadius * 0.3) / moonDist;
        const scale = angularSize * 2;
        shadow.position.copy(earthPos);
        shadow.lookAt(sunPos);
        shadow.scale.set(scale, scale, 1);
        shadow.material.opacity = Math.min(0.7, (alignment - 0.97) / 0.03 * 0.7);
      } else {
        shadow.material.opacity = 0;
      }
    }

    // Jupiter moon shadows
    const jupiterPlanet = this.planets['jupiter'];
    if (jupiterPlanet && this.moonMeshes['jupiter']) {
      const jupiterPos = new THREE.Vector3();
      jupiterPlanet.mesh.getWorldPosition(jupiterPos);
      const antiSolar = jupiterPos.clone().sub(sunPos).normalize();
      const moonNames = ['io', 'europa'];
      this.moonMeshes['jupiter'].forEach((moonEntry, mi) => {
        if (mi >= moonNames.length) return;
        const moonPos = new THREE.Vector3();
        moonEntry.mesh.getWorldPosition(moonPos);
        const toMoon = moonPos.clone().sub(jupiterPos).normalize();
        const alignment = antiSolar.dot(toMoon);
        const moonDist = jupiterPos.distanceTo(moonPos);
        const shadow = this._eclipseShadows[`jupiter_${moonNames[mi]}`];
        if (!shadow) return;
        if (alignment > 0.95 && moonDist < jupiterPlanet.data.displayRadius * 6) {
          const scale = jupiterPlanet.data.displayRadius * 0.15;
          shadow.position.copy(jupiterPos);
          const toSun = sunPos.clone().sub(jupiterPos).normalize();
          shadow.position.addScaledVector(toSun, jupiterPlanet.data.displayRadius * 0.8);
          shadow.lookAt(sunPos);
          shadow.scale.set(scale, scale, 1);
          shadow.material.opacity = Math.min(0.5, (alignment - 0.95) / 0.05 * 0.5);
        } else {
          shadow.material.opacity = 0;
        }
      });
    }
  }

  dispose() {
    // Stop animation loop
    this._animating = false;

    // Remove all event listeners
    if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
    if (this._mouseMoveHandler) this.renderer.domElement.removeEventListener('mousemove', this._mouseMoveHandler);
    if (this._clickHandler) this.renderer.domElement.removeEventListener('click', this._clickHandler);
    if (this._contextLostHandler) this.renderer.domElement.removeEventListener('webglcontextlost', this._contextLostHandler);
    if (this._contextRestoredHandler) this.renderer.domElement.removeEventListener('webglcontextrestored', this._contextRestoredHandler);

    if (this.asteroidBelt) this.asteroidBelt.dispose();
    if (this.issTracker) this.issTracker.dispose();
    if (this._comets) {
      for (const c of this._comets) c.dispose();
    }
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

    // Traverse scene graph and dispose all geometries and materials
    if (this.scene) {
      this.scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const mat of mats) {
            // Dispose all texture uniforms
            if (mat.uniforms) {
              for (const uniform of Object.values(mat.uniforms)) {
                if (uniform.value && uniform.value.isTexture) uniform.value.dispose();
              }
            }
            // Dispose standard texture slots
            for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap', 'bumpMap']) {
              if (mat[key] && mat[key].isTexture) mat[key].dispose();
            }
            mat.dispose();
          }
        }
      });
    }

    // Dispose all loaded textures
    if (this.textures) {
      for (const tex of Object.values(this.textures)) {
        if (tex && tex.isTexture) tex.dispose();
      }
    }

    // Dispose composer render targets
    if (this.composer) {
      this.composer.passes.forEach(pass => {
        if (pass.renderToScreen === false && pass.renderTarget) pass.renderTarget.dispose();
      });
    }

    this.renderer.dispose();
  }

  setBloomStrength(v) {
    if (this._bloomPass) this._bloomPass.strength = v;
  }

  setAutoExposure(on) {
    this._autoExposure = on;
    if (!on) {
      this._exposure = 1.2;
      this.renderer.toneMappingExposure = 1.2;
    }
  }

  setOrbitStyle(style) {
    this._orbitStyle = style;
    Object.values(this.orbitLines || {}).forEach(line => {
      line.visible = style !== 'off';
      if (line.material) line.material.opacity = style === 'glow' ? 0.15 : 0.5;
    });
    Object.values(this.orbitGlows || {}).forEach(g => {
      g.visible = style === 'glow';
    });
  }

  setDOF(on, opts = {}) {
    if (this._quality === 'low') return;
    if (on && !this._bokehPass && this.composer) {
      try {
        this._bokehPass = new BokehPass(this.scene, this.camera, {
          focus: 36, aperture: 0.001, maxblur: 0.003
        });
        const insertIdx = this.composer.passes.length - 1;
        this.composer.passes.splice(insertIdx, 0, this._bokehPass);
      } catch (e) { console.warn('BokehPass unavailable', e); return; }
    }
    if (this._bokehPass) this._bokehPass.enabled = on;
  }

  setFilmGrain(on) {
    if (this._filmPass) this._filmPass.uniforms.intensity.value = on ? 0.35 : 0;
  }

  setGraphicsPreset(preset) {
    const cfgMap = {
      low:    { bloom: 0.2, grain: false, dof: false, autoExp: false, orbitStyle: 'dashed' },
      medium: { bloom: 0.4, grain: false, dof: false, autoExp: true,  orbitStyle: 'glow'   },
      high:   { bloom: 0.5, grain: true,  dof: true,  autoExp: true,  orbitStyle: 'glow'   },
    };
    const cfg = cfgMap[preset] || cfgMap.medium;
    this.setBloomStrength(cfg.bloom);
    this.setFilmGrain(cfg.grain);
    this.setDOF(cfg.dof);
    this.setAutoExposure(cfg.autoExp);
    this.setOrbitStyle(cfg.orbitStyle);
  }
}
