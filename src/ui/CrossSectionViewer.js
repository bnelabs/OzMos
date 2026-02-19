/**
 * CrossSectionViewer — split-screen planet interior viewer.
 *
 * Left 60%: isolated Three.js renderer — static cross-section sphere,
 *   quarter-wedge cut facing the camera, dramatic directional lighting.
 * Right 40%: scrollable layer list sidebar; clicking a row highlights
 *   that shell in 3D and shows a detail card at the bottom of the sidebar.
 */
import * as THREE from 'three';
import { PLANET_LAYERS } from '../data/planetLayers.js';
import { t } from '../i18n/i18n.js';
import { trapFocus } from '../utils/focusTrap.js';
import { makeSwipeDismissible } from '../utils/swipe.js';
import { escapeHTML } from '../utils/sanitize.js';

// ─── Layer classification ─────────────────────────────────────────────────────

/** 0=rock/crust, 1=mantle, 2=liquid-core, 3=inner-core, 4=gas/atm, 5=ice/ocean */
function layerType(key) {
  const k = key.toLowerCase();
  if (k.includes('inner') && k.includes('core')) return 3;
  if (k.includes('core') || k.includes('metallic')) return 2;
  if (k.includes('mantle') && !k.includes('ice')) return 1;
  if (k.includes('cloud') || k.includes('atmosphere') || k.includes('molecular') ||
      k.includes('corona') || k.includes('chromosphere') || k.includes('photosphere') ||
      k.includes('convective') || k.includes('radiative')) return 4;
  if (k.includes('ice') || k.includes('ocean') || k.includes('nitrogen') ||
      k.includes('methane') || k.includes('water')) return 5;
  return 0;
}

/** PBR values per layer type. depthFactor: 0=outermost, 1=innermost */
function layerPBR(lt, depthFactor = 0) {
  // Base emissive per type — inner layers get dramatic depth gradient on top
  const emBase = [0.02, 0.06, 0.22, 0.40, 0.03, 0.07];
  const emissiveFactor = (emBase[lt] ?? 0.03) + depthFactor * depthFactor * 2.8;
  switch (lt) {
    case 1: return { roughness: 0.72, metalness: 0.08, emissiveFactor };
    case 2: return { roughness: 0.28, metalness: 0.50, emissiveFactor };
    case 3: return { roughness: 0.18, metalness: 0.70, emissiveFactor };
    case 4: return { roughness: 0.95, metalness: 0.00, emissiveFactor };
    case 5: return { roughness: 0.38, metalness: 0.12, emissiveFactor };
    default: return { roughness: 0.86, metalness: 0.04, emissiveFactor };
  }
}

// ─── Cut-face disc texture ────────────────────────────────────────────────────

/**
 * Brightens a hex color toward white by `factor` (0=original, 1=white).
 * Makes dark layer colors readable on the 2D cross-section face.
 */
function brightenHex(hex, factor) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.round(r + factor * (255 - r))},${
              Math.round(g + factor * (255 - g))},${
              Math.round(b + factor * (255 - b))})`;
}

/**
 * Generates a 512×512 canvas texture showing the concentric cross-section rings.
 * Colors are brightened 35% so dark geological colours are clearly legible.
 */
/**
 * Per-layer-type brightness amplification for the flat cut face.
 * Hot inner layers look vivid/glowing; cold outer layers stay muted.
 */
function faceBrightness(lt) {
  switch (lt) {
    case 3: return 0.60;  // inner core: blazing golden
    case 2: return 0.45;  // liquid core: vivid orange-red
    case 1: return 0.30;  // mantle: warm, moderate
    case 4: return 0.20;  // gas: pale, wispy
    case 5: return 0.25;  // ice/ocean: cool, subtle
    default: return 0.15; // crust/rock: muted gray-tan
  }
}

/**
 * Returns a radial gradient color that goes from hot-inner to cool-outer.
 * Adds a sense of thermal depth to each ring.
 */
function ringGradient(ctx, cx, cy, innerR, outerR, lt) {
  const g = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
  if (lt === 3 || lt === 2) {
    g.addColorStop(0, 'rgba(255,220,80,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0.25)');
  } else if (lt === 1) {
    g.addColorStop(0, 'rgba(220,100,20,0.18)');
    g.addColorStop(1, 'rgba(0,0,0,0.22)');
  } else if (lt === 4) {
    g.addColorStop(0, 'rgba(160,200,255,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0.15)');
  } else if (lt === 5) {
    g.addColorStop(0, 'rgba(180,230,255,0.14)');
    g.addColorStop(1, 'rgba(0,0,0,0.18)');
  } else {
    g.addColorStop(0, 'rgba(200,180,140,0.10)');
    g.addColorStop(1, 'rgba(0,0,0,0.22)');
  }
  return g;
}

function generateFaceTexture(layers) {
  const S = 512;
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d');
  const cx = S / 2, cy = S / 2;
  const maxR = layers[0].r;

  // Dark background — layers stand out against dark space
  ctx.fillStyle = '#06060a';
  ctx.fillRect(0, 0, S, S);

  // Draw rings outermost-first; each inner layer paints over the outer
  for (let i = 0; i < layers.length; i++) {
    const lt     = layerType(layers[i].key);
    const bright = faceBrightness(lt);
    const r      = (layers[i].r / maxR) * (S * 0.47);
    const col    = brightenHex(layers[i].color, bright);

    // Solid ring fill
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();

    // Thermal depth gradient per ring (hot inner edge, dark outer edge)
    const innerR = i < layers.length - 1 ? (layers[i + 1].r / maxR) * (S * 0.47) : 0;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    if (innerR > 0) ctx.arc(cx, cy, innerR, 0, Math.PI * 2, true);
    ctx.fillStyle = ringGradient(ctx, cx, cy, innerR, r, lt);
    ctx.fill();

    // Bright boundary line (glow + sharp edge)
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,240,140,0.22)';
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,250,200,0.95)';
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }

  // Central core glow — hot white highlight at innermost layer
  const innerR = layers.length > 1
    ? (layers[layers.length - 1].r / maxR) * (S * 0.47)
    : S * 0.12;
  const coreGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, innerR * 0.85);
  coreGlow.addColorStop(0, 'rgba(255,255,255,0.55)');
  coreGlow.addColorStop(0.4, 'rgba(255,220,120,0.25)');
  coreGlow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.beginPath();
  ctx.arc(cx, cy, innerR * 0.85, 0, Math.PI * 2);
  ctx.fillStyle = coreGlow;
  ctx.fill();

  return new THREE.CanvasTexture(canvas);
}

// ─── Real planet surface textures ────────────────────────────────────────────

const BODY_TEXTURE_MAP = {
  sun:          '/textures/sun_8k.jpg',
  mercury:      '/textures/mercury_2k.jpg',
  venus:        '/textures/venus_2k.jpg',
  earth:        '/textures/earth_2k.jpg',
  mars:         '/textures/mars_2k.jpg',
  jupiter:      '/textures/jupiter_2k.jpg',
  saturn:       '/textures/saturn_2k.jpg',
  uranus:       '/textures/uranus_2k.jpg',
  neptune:      '/textures/neptune_2k.jpg',
  earth_moon_0: '/textures/moon_2k.jpg',
};

// Canvas multiply-tint for bodies that fall back to moon_2k.jpg
const BODY_TINTS = {
  jupiter_moon_0: '#E8C050', // Io: sulfurous orange-yellow
  jupiter_moon_1: '#D8EAF0', // Europa: icy white-blue
  jupiter_moon_2: '#907858', // Ganymede: grey-brown
  jupiter_moon_3: '#504030', // Callisto: very dark dusty
  saturn_moon_0:  '#D4904A', // Titan: hazy orange
  saturn_moon_1:  '#F4F0EC', // Enceladus: bright ice
  pluto:          '#C8A870', // Pluto: pale tan
  ceres:          '#706860', // Ceres: dark grey
  eris:           '#E8E4DC', // Eris: icy white
  haumea:         '#F0E8E0', // Haumea: bright white
  makemake:       '#C87840', // Makemake: reddish brown
};

// ─── Interior layer texture generators ───────────────────────────────────────

/** 2D value noise (module-level, cs = cross-section prefix) */
function _csHash(x, y) {
  let h = ((x * 374761393) ^ (y * 668265263)) | 0;
  h = ((h ^ (h >>> 13)) * 1274126177) | 0;
  return ((h ^ (h >>> 16)) & 0x7fffffff) / 0x7fffffff;
}
function _csNoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
  const a = _csHash(xi, yi), b = _csHash(xi+1, yi);
  const c = _csHash(xi, yi+1), d = _csHash(xi+1, yi+1);
  return a + sx*(b-a) + sy*(c-a) + sx*sy*(a-b-c+d);
}
function _csHexRgb(h) {
  return [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
}
function _csLerp(a, b, t) {
  return [
    Math.round(a[0] + (b[0]-a[0])*t),
    Math.round(a[1] + (b[1]-a[1])*t),
    Math.round(a[2] + (b[2]-a[2])*t),
  ];
}
function _clamp8(v) { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }

/**
 * Generates a 256×128 equirectangular CanvasTexture for an interior layer.
 * Each layer type (mantle, core, ice, gas) gets its own geological pixel shader.
 */
function generateLayerTexture(layer, lt) {
  const W = 256, H = 128;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx   = canvas.getContext('2d');
  const col   = _csHexRgb(layer.color);
  const deep  = layer.deepColor
    ? _csHexRgb(layer.deepColor)
    : [Math.max(0, col[0]-35), Math.max(0, col[1]-35), Math.max(0, col[2]-35)];
  const data  = new Uint8ClampedArray(W * H * 4);

  switch (lt) {
    case 1: _genMantlePx(data, W, H, col, deep); break;
    case 2: _genMoltenPx(data, W, H, col, deep); break;
    case 3: _genCrystalPx(data, W, H, col, deep); break;
    case 4: _genAtmosPx(data, W, H, col, deep); break;
    case 5: _genIcePx(data, W, H, col, deep); break;
    default: _genCrustPx(data, W, H, col, deep); break;
  }

  ctx.putImageData(new ImageData(data, W, H), 0, 0);
  return new THREE.CanvasTexture(canvas);
}

function _genCrustPx(data, W, H, col, deep) {
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const n1 = _csNoise(px*0.022, py*0.022);
      const n2 = _csNoise(px*0.065, py*0.065) * 0.45;
      const n3 = _csNoise(px*0.18,  py*0.18 ) * 0.20;
      const n = (n1 + n2 + n3) / 1.65;
      const c = _csLerp(deep, col, 0.35 + n * 0.65);
      const i = (py*W+px)*4;
      data[i]   = _clamp8(c[0]);
      data[i+1] = _clamp8(c[1]);
      data[i+2] = _clamp8(c[2]);
      data[i+3] = 255;
    }
  }
}

function _genMantlePx(data, W, H, col, deep) {
  // Hot rock: cool top → glowing hot bottom, wavy strata + convection
  const hotCol = [Math.min(255,col[0]+80), Math.max(0,col[1]-25), Math.max(0,col[2]-35)];
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const heatGrad = py / H;
      const n1 = _csNoise(px*0.018, py*0.018);
      const n2 = _csNoise(px*0.055, py*0.055) * 0.40;
      const n3 = _csNoise(px*0.15,  py*0.15 ) * 0.18;
      const n = (n1 + n2 + n3) / 1.58;
      // Wavy strata lines
      const strata = 0.5 + 0.5*Math.sin(py*0.22 + _csNoise(px*0.012, py*0.006)*6.0);
      const rockT  = 0.30 + n * 0.70;
      const heatT  = heatGrad * 0.60 + strata * 0.14;
      let c = _csLerp(deep, col, rockT);
      c = _csLerp(c, hotCol, Math.min(1, heatT));
      const i = (py*W+px)*4;
      data[i]   = _clamp8(c[0]);
      data[i+1] = _clamp8(c[1]);
      data[i+2] = _clamp8(c[2]);
      data[i+3] = 255;
    }
  }
}

function _genMoltenPx(data, W, H, col, deep) {
  // Liquid metal / magma ocean: swirling orange-gold with bright convection plumes
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const n1 = _csNoise(px*0.025, py*0.025);
      const n2 = _csNoise(px*0.07+3, py*0.07+3) * 0.55;
      const n3 = _csNoise(px*0.20+7, py*0.20+7) * 0.28;
      const n = (n1 + n2 + n3) / 1.83;
      // Rising plumes (bright hot spots at high-noise values)
      const plume = _csNoise(px*0.035+1.5, py*0.035+1.5);
      const plumeM = Math.max(0, plume*2 - 1);
      let c = _csLerp(deep, col, 0.25 + n*0.75);
      if (plumeM > 0) {
        const brightCol = [Math.min(255,col[0]+100), Math.min(255,col[1]+60), Math.min(255,col[2]+20)];
        c = _csLerp(c, brightCol, Math.min(1, plumeM*1.5));
      }
      const i = (py*W+px)*4;
      data[i]   = _clamp8(c[0]);
      data[i+1] = _clamp8(c[1]);
      data[i+2] = _clamp8(c[2]);
      data[i+3] = 255;
    }
  }
}

function _genCrystalPx(data, W, H, col, deep) {
  // Solid crystalline metallic core: faceted Voronoi-like pattern + bright edge highlights
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const s  = 0.10;
      const c0 = _csNoise(px*s, py*s);
      const cx = _csNoise(px*s+0.01, py*s);
      const cy = _csNoise(px*s, py*s+0.01);
      const grad = Math.sqrt((cx-c0)*(cx-c0) + (cy-c0)*(cy-c0)) * 100;
      const n1 = _csNoise(px*0.04, py*0.04);
      const n2 = _csNoise(px*0.12+5, py*0.12+5) * 0.40;
      const n = (n1 + n2) / 1.4;
      const edgeGlow = Math.min(1, grad * 8);
      const brightCol = [Math.min(255,col[0]+120), Math.min(255,col[1]+100), Math.min(255,col[2]+80)];
      let c = _csLerp(deep, col, 0.5 + n*0.5);
      c = _csLerp(c, brightCol, edgeGlow * 0.70);
      const heat = 0.15 + n * 0.25;
      c = c.map(v => _clamp8(v * (1 + heat)));
      const i = (py*W+px)*4;
      data[i]   = _clamp8(c[0]);
      data[i+1] = _clamp8(c[1]);
      data[i+2] = _clamp8(c[2]);
      data[i+3] = 255;
    }
  }
}

function _genAtmosPx(data, W, H, col, deep) {
  // Gas/atmosphere: horizontal cloud bands with turbulent edges
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const bandY = (py / H) * 8.0;
      const wave  = _csNoise(px*0.02, py*0.04) * 1.5;
      const band  = 0.5 + 0.5*Math.sin((bandY + wave) * Math.PI);
      const n1    = _csNoise(px*0.03, py*0.03);
      const n2    = _csNoise(px*0.09+2, py*0.09+2) * 0.40;
      const turb  = (n1 + n2) / 1.4;
      const c = _csLerp(deep, col, band*0.60 + turb*0.40);
      const i = (py*W+px)*4;
      data[i]   = _clamp8(c[0]);
      data[i+1] = _clamp8(c[1]);
      data[i+2] = _clamp8(c[2]);
      data[i+3] = 255;
    }
  }
}

function _genIcePx(data, W, H, col, deep) {
  // Ice crust / frozen ocean: smooth bright regions + dark crack network
  const deepOcean = [Math.max(0,deep[0]-20), Math.max(0,deep[1]-10), Math.min(255,deep[2]+40)];
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const n1 = _csNoise(px*0.012, py*0.012);
      const n2 = _csNoise(px*0.040+2, py*0.040+2) * 0.45;
      const n  = (n1 + n2) / 1.45;
      // Crack detection via noise gradient steepness
      const sc   = 0.015;
      const nc   = _csNoise(px*sc, py*sc);
      const nxd  = _csNoise(px*sc+0.01, py*sc);
      const nyd  = _csNoise(px*sc, py*sc+0.01);
      const grad = Math.sqrt((nxd-nc)*(nxd-nc)+(nyd-nc)*(nyd-nc)) * 60;
      const crack = Math.max(0, 1 - grad * 4); // 0 at crack lines, 1 elsewhere
      // Icy surface tinted with layer color, subsurface glow from below
      const bright = [Math.min(255,col[0]+70), Math.min(255,col[1]+70), Math.min(255,col[2]+70)];
      let c = _csLerp(col, bright, n);
      c = _csLerp(c, deepOcean, _csNoise(px*0.008, py*0.008) * 0.35);
      c = c.map(v => _clamp8(v * (0.38 + crack * 0.62)));
      const i = (py*W+px)*4;
      data[i]   = _clamp8(c[0]);
      data[i+1] = _clamp8(c[1]);
      data[i+2] = _clamp8(c[2]);
      data[i+3] = 255;
    }
  }
}

// ─── Main class ───────────────────────────────────────────────────────────────

export class CrossSectionViewer {
  /** @param {function(string):void} announceFn */
  constructor(announceFn) {
    this._announce = announceFn || (() => {});

    // DOM elements
    this._overlay     = document.getElementById('cs-overlay');
    this._canvas      = document.getElementById('cs-canvas');
    this._bodyNameEl  = document.getElementById('cs-body-name');
    this._layerCountEl = document.getElementById('cs-layer-count');
    this._closeBtn    = document.getElementById('cs-close');
    this._sidebarList = document.getElementById('cs-layers-list');
    this._detailPanel = document.getElementById('cs-detail-panel');
    this._srLayers    = document.getElementById('cs-sr-layers');

    // Three.js handles
    this._renderer       = null;
    this._scene          = null;
    this._camera         = null;
    this._animId         = null;
    this._sphereGroup    = null;
    this._clipPlane1     = null;
    this._clipPlane2     = null;
    this._layerMeshes    = [];
    this._faceMeshes     = [];
    this._boundaryRings  = [];
    this._starfield      = null;
    this._coreLight      = null;

    // Camera intro zoom vectors (reused every frame — no GC)
    // Camera positioned at +z,+x angle: sees LEFT hemisphere exterior dome (from +z)
    // AND the face disc at x=0.002 through the cut opening (right side removed).
    this._camStart = new THREE.Vector3(2.5, 1.0, 5.0);
    this._camEnd   = new THREE.Vector3(0.8, 0.6, 2.5);

    // Numbered layer badges
    this._badges = [];

    // State
    this._disposed         = true;
    this._startTime        = 0;
    this._lastFrameTime    = 0;
    this._activeLayerIndex = -1;
    this._currentLayers    = null;
    this._currentKey       = null;
    this._rowEls           = [];

    // Utilities
    this._focusTrap      = null;
    this._swipeHandle    = null;
    this._resizeObserver = null;

    this._isOpen = false;

    this._boundClose   = () => this.close();
    this._boundKeydown = (e) => this._onKeydown(e);
    this._boundLangChange = () => {
      if (this._isOpen && this._currentLayers) this._refreshLabels();
    };

    if (this._closeBtn) this._closeBtn.addEventListener('click', this._boundClose);
    document.addEventListener('langchange', this._boundLangChange);
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  open(bodyKey) {
    if (!this._overlay) return;

    const layers = PLANET_LAYERS[bodyKey];
    this._currentKey    = bodyKey;
    this._currentLayers = layers;

    const bodyName = this._getBodyName(bodyKey);
    if (this._bodyNameEl) this._bodyNameEl.textContent = bodyName;
    if (this._layerCountEl && layers) {
      this._layerCountEl.textContent = `${layers.length} ${t('cs.layers') || 'layers'}`;
    }

    this._buildSrLayerList(layers);
    this._isOpen = true;
    this._overlay.classList.remove('hidden');
    this._overlay.setAttribute('aria-hidden', 'false');
    this._announce((t('cs.opened') || 'Interior opened for') + ' ' + bodyName);

    if (!layers || layers.length === 0) {
      this._showNoData();
      return;
    }

    this._disposed = false;
    this._buildScene(layers);
    this._startTime     = performance.now();
    this._lastFrameTime = this._startTime;
    this._tick();

    this._buildSidebarRows(layers);

    this._focusTrap   = trapFocus(this._overlay);
    this._swipeHandle = makeSwipeDismissible(this._overlay, () => this.close());
    document.addEventListener('keydown', this._boundKeydown);

    this._resizeObserver = new ResizeObserver(() => this._onResize());
    this._resizeObserver.observe(this._overlay);
  }

  close() {
    if (!this._overlay || this._overlay.classList.contains('hidden')) return;

    document.removeEventListener('keydown', this._boundKeydown);

    if (this._animId) {
      cancelAnimationFrame(this._animId);
      this._animId = null;
    }

    this._isOpen = false;
    this._disposed = true;
    this._disposeThree();

    this._overlay.classList.add('hidden');
    this._overlay.setAttribute('aria-hidden', 'true');

    if (this._sidebarList) this._sidebarList.innerHTML = '';
    if (this._detailPanel) {
      this._detailPanel.innerHTML = '';
      this._detailPanel.classList.add('hidden');
    }

    this._rowEls = [];
    this._activeLayerIndex = -1;
    this._expandTarget  = [];
    this._expandCurrent = [];

    // Remove all badge elements
    for (const b of this._badges) b.remove();
    this._badges = [];

    if (this._focusTrap)   { this._focusTrap.release();   this._focusTrap = null; }
    if (this._swipeHandle) { this._swipeHandle.release();  this._swipeHandle = null; }
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }

    this._currentKey    = null;
    this._currentLayers = null;
    this._announce(t('cs.closed') || 'Interior closed');
  }

  // ─── Three.js scene ─────────────────────────────────────────────────────────

  _buildScene(layers) {
    const w = this._canvas.clientWidth  || Math.round(window.innerWidth  * 0.6);
    let h = this._canvas.clientHeight || Math.max(window.innerHeight, 400);
    h = Math.min(h, window.innerHeight - 60);

    this._renderer = new THREE.WebGLRenderer({
      canvas: this._canvas, antialias: true, alpha: true,
    });
    this._renderer.setSize(w, h);
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this._renderer.localClippingEnabled = true;
    this._renderer.setClearColor(0x000000, 0);

    this._scene = new THREE.Scene();

    // Camera — starts zoomed out and eases in over 1.5 s via _tick
    this._camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
    this._camera.position.copy(this._camStart);
    this._camera.lookAt(0, -0.05, 0);

    // ── Lights ──
    // Key: from upper-front-right — illuminates the cut face (normal +X) AND
    //   the top of the exterior hemisphere. dot((1,0,0), normalize(3,4,2))=0.56 > 0 ✓
    const keyLight = new THREE.DirectionalLight(0xfff0d0, 2.6);
    keyLight.position.set(3, 4, 2);
    this._scene.add(keyLight);

    // Rim: from upper-left-back — separates the exterior hemisphere edge
    const rimLight = new THREE.DirectionalLight(0x4466cc, 0.75);
    rimLight.position.set(-4, 2, -3);
    this._scene.add(rimLight);

    // Fill: very dim so far side isn't pure black
    this._scene.add(new THREE.AmbientLight(0x0c0e1c, 0.45));

    // ── Single clip plane ──
    // Plane((-1,0,0), c) clips geometry where: -x + c < 0  →  x > c
    // c=1.5: clips x > 1.5 → nothing clipped (sphere max r=1) → whole sphere shows
    // c=0.0: clips x > 0 → RIGHT half removed ✓
    // Camera at (0.8, 0.6, 2.5) sees:
    //   • LEFT hemisphere exterior (the dome) — visible from the +z camera angle
    //   • Face disc at x=0.002 through the opening (right side clipped away)
    // The face disc has no clippingPlanes so it's always rendered.
    // Animation sweeps c from 1.5 → 0 (blade cuts from right edge to center).
    this._clipPlane1 = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 1.5);
    this._clipPlane2 = null; // unused — kept for compat with dispose()
    const clipPlanes = [this._clipPlane1];

    const maxR = layers[0].r;
    this._layerMeshes   = [];
    this._faceMeshes    = [];
    this._boundaryRings = [];
    this._expandTarget  = []; // target x-offset for each layer (0 = resting, 0.22 = expanded)
    this._expandCurrent = []; // current lerped x-offset for each layer

    // ── Starfield ──
    this._starfield = this._buildStarfield();
    this._scene.add(this._starfield);

    // ── Concentric sphere shells ──
    for (let i = 0; i < layers.length; i++) {
      const layer       = layers[i];
      const radius      = layer.r / maxR;
      const lt          = layerType(layer.key);
      const depthFactor = layers.length > 1 ? i / (layers.length - 1) : 0;
      const pbr         = layerPBR(lt, depthFactor);

      const baseEmissive = new THREE.Color(layer.color).multiplyScalar(pbr.emissiveFactor);

      // Surface layer (i=0): real planet photo loaded async → start with neutral white.
      // Inner layers: procedural canvas texture applied immediately.
      const matColor = i === 0 ? 0xffffff : layer.color;
      const mat = new THREE.MeshStandardMaterial({
        color:             matColor,
        roughness:         pbr.roughness,
        metalness:         pbr.metalness,
        emissive:          baseEmissive,
        emissiveIntensity: 1.0,
        clippingPlanes:    clipPlanes,
        clipIntersection:  false,
        side:              THREE.FrontSide,
      });
      mat.userData.baseEmissive = baseEmissive.clone();

      if (i === 0) {
        // Outermost layer: load the planet's real photographic texture
        this._loadSurfaceTexture(this._currentKey, mat);
      } else {
        // Inner layers: generated geological canvas texture
        mat.map = generateLayerTexture(layer, lt);
        mat.needsUpdate = true;
      }

      const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 48), mat);
      this._layerMeshes.push(mesh);
    }

    // Initialise expansion state arrays now that _layerMeshes is fully populated
    this._expandTarget  = new Array(this._layerMeshes.length).fill(0);
    this._expandCurrent = new Array(this._layerMeshes.length).fill(0);

    // ── Cut-face disc ──
    // Full circle at x=0.002, facing +X (toward camera).
    // MeshBasicMaterial — ignores lighting, always shows texture at full brightness.
    // Depth-test hides it inside the sphere until the left side is cut away.
    const faceTex = generateFaceTexture(layers);
    const faceMat = new THREE.MeshBasicMaterial({
      map:  faceTex,
      side: THREE.FrontSide,
    });
    const faceMesh = new THREE.Mesh(new THREE.CircleGeometry(1.0, 128), faceMat);
    faceMesh.rotation.y = Math.PI / 2; // +Z face → face +X toward camera ✓
    faceMesh.position.x = 0.002;
    this._faceMeshes.push(faceMesh);

    // ── Layer boundary rings (glowing halos on the cut face) ──
    // Placed in the YZ plane (rotation.y = PI/2) at x=0.005 — in front of the
    // face disc (x=0.002) so they appear as bright ring outlines.
    // The clip plane clips x < 0; with position.x=0.005 the torus is fully in
    // the x≥0 region so no partial-ring artifacts.
    for (let i = 0; i < layers.length; i++) {
      const radius = layers[i].r / maxR;
      const col    = new THREE.Color(layers[i].color);
      col.r = Math.min(1, col.r + 0.45);
      col.g = Math.min(1, col.g + 0.45);
      col.b = Math.min(1, col.b + 0.45);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.007, 8, 96),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85 }),
      );
      ring.rotation.y = Math.PI / 2;
      ring.position.x = 0.005;
      this._boundaryRings.push(ring);
    }

    // ── Core glow light ──
    const innerColor = new THREE.Color(layers[layers.length - 1].color);
    this._coreLight  = new THREE.PointLight(innerColor, 0, 3.0, 1.8);
    this._scene.add(this._coreLight);

    // ── Sphere group (for scale-in animation) ──
    this._sphereGroup = new THREE.Group();
    for (const m of [...this._layerMeshes, ...this._faceMeshes, ...this._boundaryRings]) {
      this._sphereGroup.add(m);
    }
    this._sphereGroup.scale.setScalar(0);
    this._scene.add(this._sphereGroup);
  }

  // ─── Animation loop ──────────────────────────────────────────────────────────

  _tick() {
    if (this._disposed) return;

    const now     = performance.now();
    const elapsed = (now - this._startTime) * 0.001;
    const delta   = Math.min((now - this._lastFrameTime) * 0.001, 0.05);
    this._lastFrameTime = now;

    // ── Phase 1: sphere scales in (0.15 → 0.85 s), ease-out-back overshoot ──
    const scaleT = Math.min(Math.max((elapsed - 0.15) / 0.70, 0), 1);
    if (this._sphereGroup) {
      this._sphereGroup.scale.setScalar(this._easeOutBack(scaleT));
    }

    // ── Phase 2: knife-cut sweeps from right edge to centre (0.85 → 2.5 s) ──
    // Clip constant goes 1.5 → 0: looks like a blade slicing through the planet.
    const cutT      = Math.min(Math.max((elapsed - 0.85) / 1.65, 0), 1);
    const clipConst = 1.5 * (1 - this._easeOutCubic(cutT));
    if (this._clipPlane1) this._clipPlane1.constant = clipConst;

    // ── Phase 2b: per-layer reveal flash ──
    // Clip plane: Plane((-1,0,0), c) clips x > c, c: 1.5→0.
    // c = 1.5*(1 - easeOutCubic(cutT)).
    // Layer at normalised radius r is first cut when c = r.
    // Solving: r = 1.5*(1-easeOut(t)) → easeOut(t) = 1-r/1.5
    //   → t = 1 - (r/1.5)^(1/3)   (exact easeOutCubic inverse)
    // Outer layers (r≈1) flash first (t≈0), inner last (t closer to 1).
    if (this._activeLayerIndex < 0 && this._currentLayers) {
      const maxR = this._currentLayers[0].r;
      for (let i = 0; i < this._layerMeshes.length; i++) {
        const normR      = this._currentLayers[i].r / maxR;
        const revealCutT = Math.max(0, 1 - Math.pow(normR / 1.5, 1 / 3)); // exact inverse
        const postReveal = cutT - revealCutT; // >0 after reveal
        const mat        = this._layerMeshes[i].material;
        const base       = mat.userData.baseEmissive;
        if (postReveal >= 0 && postReveal < 0.28) {
          // brief emissive flash for ~0.28 s after the layer is first exposed
          const flashT = postReveal / 0.28;
          const boost  = 4.5 * Math.sin(flashT * Math.PI);
          mat.emissive = base.clone().multiplyScalar(1 + boost);
        } else {
          mat.emissive = base.clone();
        }
        mat.emissiveIntensity = 1.0;
      }
    }

    // ── Phase 3: sidebar rows slide in staggered (1.0 s + 0.12 s per row) ──
    for (let i = 0; i < this._rowEls.length; i++) {
      if (elapsed >= 1.0 + i * 0.12) {
        this._rowEls[i].classList.add('visible');
      }
    }

    // ── Idle: NO sphere rotation — face disc must stay aligned with cut plane ──
    // (clip plane is in world space; rotating the sphere would offset the face disc)

    // ── Core light: fades in with the cut, then pulses gently ──
    if (this._coreLight) {
      const base  = cutT * 1.6;
      const pulse = elapsed > 2.5 ? Math.sin(elapsed * 1.2) * 0.35 : 0;
      this._coreLight.intensity = base + pulse;
    }

    // ── Camera intro zoom: ease from far (start) → close (end) over 1.5 s ──
    if (this._camera) {
      const camT = this._easeOutCubic(Math.min(elapsed / 1.5, 1.0));
      this._camera.position.lerpVectors(this._camStart, this._camEnd, camT);
      this._camera.lookAt(0, -0.05, 0);
    }

    // ── Build numbered badges once after camera + cut have settled ──
    if (this._badges.length === 0 && elapsed > 2.7 && this._currentLayers) {
      this._buildBadges();
    }

    // ── Update badge positions every frame ──
    if (this._badges.length > 0 && this._renderer && this._camera) {
      this._updateBadgePositions();
    }

    // ── Layer expansion lerp ──
    if (this._expandTarget && this._expandCurrent) {
      for (let i = 0; i < this._layerMeshes.length; i++) {
        this._expandCurrent[i] += (this._expandTarget[i] - this._expandCurrent[i]) * 0.12;
        this._layerMeshes[i].position.x = this._expandCurrent[i];
        // Move the boundary ring with its layer
        if (this._boundaryRings[i]) {
          this._boundaryRings[i].position.x = 0.005 + this._expandCurrent[i];
        }
      }
    }

    if (this._renderer && this._scene && this._camera) {
      this._renderer.render(this._scene, this._camera);
    }

    this._animId = requestAnimationFrame(() => this._tick());
  }

  _easeOutBack(t) {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  _easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  /** Builds a starfield of N random points at r=12–20 around the origin. */
  _buildStarfield() {
    const N   = 600;
    const buf = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r     = 12 + Math.random() * 8;
      const theta = Math.acos(2 * Math.random() - 1);
      const phi   = Math.random() * Math.PI * 2;
      buf[i * 3]     = r * Math.sin(theta) * Math.cos(phi);
      buf[i * 3 + 1] = r * Math.sin(theta) * Math.sin(phi);
      buf[i * 3 + 2] = r * Math.cos(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(buf, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.055, sizeAttenuation: true });
    return new THREE.Points(geo, mat);
  }

  // ─── Surface texture loader ──────────────────────────────────────────────────

  /**
   * Loads the planet's real photographic texture and applies it to the outermost
   * sphere material. Bodies without a dedicated texture use moon_2k.jpg tinted
   * with a canvas multiply overlay to match their known spectral appearance.
   */
  _loadSurfaceTexture(bodyKey, mat) {
    const path = BODY_TEXTURE_MAP[bodyKey] || '/textures/moon_2k.jpg';
    const tint = BODY_TINTS[bodyKey] || null;

    new THREE.TextureLoader().load(path, (tex) => {
      if (this._disposed) return; // viewer was closed before texture finished loading
      if (tint) {
        // Bake a tinted version into a canvas so each body looks distinct
        const W = 512, H = 256;
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(tex.image, 0, 0, W, H);
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = tint;
        ctx.fillRect(0, 0, W, H);
        mat.map = new THREE.CanvasTexture(canvas);
      } else {
        mat.map = tex;
      }
      mat.color.set(0xffffff); // texture carries full colour; no additional tint
      mat.needsUpdate = true;
    });
  }

  // ─── Numbered layer badges ────────────────────────────────────────────────────

  /**
   * Creates one absolutely-positioned badge per layer, placed inside #cs-body
   * (which is position:relative). Badges are numbered 1-N from outermost to
   * innermost and colored to match the layer. Positions are updated each frame
   * by _updateBadgePositions().
   */
  _buildBadges() {
    if (!this._camera || !this._currentLayers || !this._canvas) return;
    const bodyEl = this._overlay.querySelector('#cs-body');
    if (!bodyEl) return;

    // Remove any stale badges first
    for (const b of this._badges) b.remove();
    this._badges = [];

    for (let i = 0; i < this._currentLayers.length; i++) {
      const layer = this._currentLayers[i];
      const n = i + 1;

      const badge = document.createElement('div');
      badge.className = 'cs-badge';
      badge.dataset.layer = String(n);
      badge.textContent = String(n);
      badge.style.setProperty('--c', layer.color);
      bodyEl.appendChild(badge);
      this._badges.push(badge);

      // Make visible after a short stagger
      setTimeout(() => badge.classList.add('visible'), 80 + i * 40);
    }

    // Set initial positions immediately
    this._updateBadgePositions();
  }

  /**
   * Projects each ring's top-edge world position to canvas pixel coords and
   * repositions the badge div. Called every animation frame after badges exist.
   */
  _updateBadgePositions() {
    if (!this._camera || !this._currentLayers || !this._canvas) return;
    const bodyEl = this._overlay.querySelector('#cs-body');
    if (!bodyEl) return;

    const canvasRect = this._canvas.getBoundingClientRect();
    const bodyRect   = bodyEl.getBoundingClientRect();
    if (canvasRect.width === 0 || canvasRect.height === 0) return;

    const maxR   = this._currentLayers[0].r;
    const tmpVec = new THREE.Vector3();

    for (let i = 0; i < this._badges.length; i++) {
      const layer = this._currentLayers[i];
      if (!layer) continue;

      const r = layer.r / maxR;

      // Project the topmost visible point of the ring (at x=0.006, y=r, z=0)
      // onto the screen. This is the "12 o'clock" position of the boundary ring.
      tmpVec.set(0.006, r, 0);
      const ndc = tmpVec.clone().project(this._camera);

      // Convert NDC → canvas-local pixels
      const sx = (ndc.x *  0.5 + 0.5) * canvasRect.width;
      const sy = (ndc.y * -0.5 + 0.5) * canvasRect.height;

      // Convert to #cs-body-relative coords (badge container)
      const bx = sx + (canvasRect.left - bodyRect.left);
      const by = sy + (canvasRect.top  - bodyRect.top);

      // Centre the 22×22 badge on the projected point
      this._badges[i].style.left = `${(bx - 11).toFixed(1)}px`;
      this._badges[i].style.top  = `${(by - 11).toFixed(1)}px`;
    }
  }

  // ─── Sidebar ─────────────────────────────────────────────────────────────────

  _buildSidebarRows(layers) {
    if (!this._sidebarList) return;
    this._sidebarList.innerHTML = '';
    this._rowEls = [];

    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      const n     = i + 1;

      const row = document.createElement('button');
      row.className = 'cs-layer-row';
      row.type      = 'button';
      row.setAttribute('aria-label', t(layer.key));

      // Numbered badge prefix matching the 3D overlay badge
      const num = document.createElement('span');
      num.className = 'cs-layer-num';
      num.textContent = String(n);
      num.style.cssText = `background:color-mix(in srgb,${layer.color} 20%,transparent);border:1.5px solid ${layer.color};color:${layer.color};`;

      const dot = document.createElement('span');
      dot.className = 'cs-layer-dot';
      dot.style.cssText = `background:${layer.color}; box-shadow:0 0 5px ${layer.color}99;`;

      const text = document.createElement('span');
      text.className = 'cs-layer-text';

      const name = document.createElement('span');
      name.className   = 'cs-layer-name';
      name.textContent = t(layer.key);

      const comp = document.createElement('span');
      comp.className   = 'cs-layer-comp';
      comp.textContent = layer.compositionShort ? t(layer.compositionShort) : '';

      const stat = document.createElement('span');
      stat.className   = 'cs-layer-stat';
      stat.textContent = layer.thickness ? t(layer.thickness) : (layer.temperatureRange ? t(layer.temperatureRange) : '');

      text.append(name, comp, stat);
      row.append(num, dot, text);

      const idx = i;
      row.addEventListener('click', () => this._onLayerClick(idx));

      // Hover: pulse matching badge + boost ring emissive
      row.addEventListener('mouseenter', () => this._onRowHover(idx, true));
      row.addEventListener('mouseleave', () => this._onRowHover(idx, false));

      this._sidebarList.appendChild(row);
      this._rowEls.push(row);
    }
  }

  /** Re-render sidebar labels and open detail card after language change. */
  _refreshLabels() {
    if (!this._currentLayers || !this._sidebarList) return;
    // Rebuild layer row text content only (keep DOM structure, just update text)
    const rows = this._sidebarList.querySelectorAll('.cs-layer-row');
    this._currentLayers.forEach((layer, i) => {
      const row = rows[i];
      if (!row) return;
      row.setAttribute('aria-label', t(layer.key));
      const nameEl = row.querySelector('.cs-layer-name');
      const compEl = row.querySelector('.cs-layer-comp');
      const statEl = row.querySelector('.cs-layer-stat');
      if (nameEl) nameEl.textContent = t(layer.key);
      if (compEl) compEl.textContent = layer.compositionShort ? t(layer.compositionShort) : '';
      if (statEl) statEl.textContent = layer.thickness ? t(layer.thickness) : (layer.temperatureRange ? t(layer.temperatureRange) : '');
    });
    // Re-render open detail panel if any
    if (this._activeLayerIndex >= 0 && this._currentLayers[this._activeLayerIndex]) {
      this._showDetailPanel(this._currentLayers[this._activeLayerIndex]);
    }
    this._buildSrLayerList(this._currentLayers);
  }

  _onLayerClick(index) {
    if (this._activeLayerIndex === index) {
      // Second click on same row → deselect
      this._clearHighlight();
      this._hideDetailPanel();
      return;
    }

    this._activeLayerIndex = index;

    for (let i = 0; i < this._rowEls.length; i++) {
      this._rowEls[i].classList.toggle('active', i === index);
      this._rowEls[i].classList.toggle('dimmed', i !== index);
    }

    this._highlightLayer(index);
    this._showDetailPanel(this._currentLayers[index]);
  }

  _onRowHover(index, entering) {
    // Pulse the matching badge
    const badge = this._badges[index];
    if (badge) {
      if (entering) {
        badge.classList.remove('pulse');
        // Force reflow so re-adding the class restarts the animation
        void badge.offsetWidth;
        badge.classList.add('pulse');
      } else {
        badge.classList.remove('pulse');
      }
    }
    // Boost emissive of the matching boundary ring
    const ring = this._boundaryRings[index];
    if (ring) {
      ring.material.opacity = entering ? 1.0 : 0.85;
    }

    // Expand the hovered layer outward along +X so it separates from the cut face
    if (this._expandTarget) {
      for (let i = 0; i < this._expandTarget.length; i++) {
        this._expandTarget[i] = (entering && i === index) ? 0.22 : 0;
      }
    }
  }

  _highlightLayer(index) {
    if (!this._layerMeshes.length) return;
    for (let i = 0; i < this._layerMeshes.length; i++) {
      const mat  = this._layerMeshes[i].material;
      const base = mat.userData.baseEmissive;
      if (i === index) {
        // Active shell — strong emissive glow
        mat.emissive = base.clone().multiplyScalar(5.5);
      } else {
        // Inactive shells — dim down
        mat.emissive = base.clone().multiplyScalar(0.25);
      }
      mat.emissiveIntensity = 1.0;
    }
  }

  _clearHighlight() {
    this._activeLayerIndex = -1;
    for (let i = 0; i < this._layerMeshes.length; i++) {
      const mat = this._layerMeshes[i].material;
      mat.emissive          = mat.userData.baseEmissive.clone();
      mat.emissiveIntensity = 1.0;
    }
    for (const row of this._rowEls) {
      row.classList.remove('active', 'dimmed');
    }
  }

  // ─── Detail panel ────────────────────────────────────────────────────────────

  _showDetailPanel(layer) {
    if (!this._detailPanel) return;

    const rows = [];
    if (layer.compositionFull || layer.compositionShort) {
      rows.push({ label: t('cs.composition'), value: t(layer.compositionFull || layer.compositionShort) });
    }
    if (layer.thickness)       rows.push({ label: t('cs.thickness'),    value: t(layer.thickness) });
    if (layer.temperatureRange) rows.push({ label: t('cs.temperature'), value: t(layer.temperatureRange) });
    if (layer.pressureRange)   rows.push({ label: t('cs.pressure'),     value: t(layer.pressureRange) });
    if (layer.state)           rows.push({ label: t('cs.state'),        value: t(layer.state) });

    let html = `
      <div class="cs-detail-header">
        <span class="cs-detail-dot"
              style="background:${escapeHTML(layer.color)};
                     box-shadow:0 0 8px ${escapeHTML(layer.color)}99;"></span>
        <span class="cs-detail-title">${escapeHTML(t(layer.key))}</span>
        <button class="cs-detail-close" id="cs-detail-close-btn"
                aria-label="${escapeHTML(t('cs.close') || 'Close')}">&times;</button>
      </div>`;

    html += rows.map(r => `
      <div class="cs-detail-row">
        <div class="cs-detail-label">${escapeHTML(r.label)}</div>
        <div class="cs-detail-value">${escapeHTML(r.value)}</div>
      </div>`).join('');

    if (layer.funFact) {
      html += `
        <div class="cs-detail-funfact">
          <div class="cs-detail-label">${escapeHTML(t('cs.funFact'))}</div>
          <div class="cs-detail-value">${escapeHTML(t(layer.funFact))}</div>
        </div>`;
    }

    this._detailPanel.innerHTML = html;
    this._detailPanel.classList.remove('hidden');

    const closeBtn = document.getElementById('cs-detail-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this._clearHighlight();
        this._hideDetailPanel();
      });
    }
  }

  _hideDetailPanel() {
    if (!this._detailPanel) return;
    this._detailPanel.classList.add('hidden');
    this._detailPanel.innerHTML = '';
  }

  // ─── Keyboard ────────────────────────────────────────────────────────────────

  _onKeydown(e) {
    if (e.key !== 'Escape') return;
    if (this._activeLayerIndex >= 0) {
      this._clearHighlight();
      this._hideDetailPanel();
    } else {
      this.close();
    }
  }

  // ─── Resize ──────────────────────────────────────────────────────────────────

  _onResize() {
    if (!this._renderer || !this._camera || !this._canvas) return;
    const w = this._canvas.clientWidth;
    const h = this._canvas.clientHeight;
    if (w === 0 || h === 0) return;
    this._renderer.setSize(w, h);
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
    // Badge positions update automatically each frame via _updateBadgePositions()
  }

  // ─── Utilities ───────────────────────────────────────────────────────────────

  _getBodyName(key) {
    const map = {
      sun: 'Sun',
      mercury: 'Mercury', venus: 'Venus', earth: 'Earth', mars: 'Mars',
      jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Uranus', neptune: 'Neptune',
      pluto: 'Pluto', ceres: 'Ceres', eris: 'Eris', haumea: 'Haumea', makemake: 'Makemake',
      earth_moon_0: 'Moon',
      jupiter_moon_0: 'Io', jupiter_moon_1: 'Europa',
      jupiter_moon_2: 'Ganymede', jupiter_moon_3: 'Callisto',
      saturn_moon_0: 'Titan', saturn_moon_1: 'Enceladus',
    };
    return map[key] || key;
  }

  _buildSrLayerList(layers) {
    if (!this._srLayers) return;
    this._srLayers.innerHTML = '';
    this._srLayers.setAttribute('aria-label', t('cs.layersLabel') || 'Geological layers');
    if (!layers) return;
    for (let i = layers.length - 1; i >= 0; i--) {
      const li = document.createElement('li');
      li.textContent = t(layers[i].key);
      this._srLayers.appendChild(li);
    }
  }

  _showNoData() {
    if (!this._sidebarList) return;
    const p = document.createElement('p');
    p.style.cssText = 'color:rgba(200,200,200,0.55);font-size:0.88rem;padding:20px 16px;';
    p.textContent   = t('cs.noData');
    this._sidebarList.appendChild(p);
  }

  // ─── Dispose ─────────────────────────────────────────────────────────────────

  _disposeThree() {
    for (const mesh of [
      ...(this._layerMeshes   || []),
      ...(this._faceMeshes    || []),
      ...(this._boundaryRings || []),
    ]) {
      mesh.geometry?.dispose();
      if (mesh.material) {
        mesh.material.map?.dispose();
        mesh.material.dispose();
      }
    }
    this._layerMeshes   = [];
    this._faceMeshes    = [];
    this._boundaryRings = [];

    if (this._starfield) {
      this._starfield.geometry?.dispose();
      this._starfield.material?.dispose();
      this._starfield = null;
    }

    if (this._coreLight?.parent) this._coreLight.parent.remove(this._coreLight);
    this._coreLight = null;

    if (this._renderer) { this._renderer.dispose(); this._renderer = null; }

    this._scene       = null;
    this._camera      = null;
    this._sphereGroup = null;
    this._clipPlane1  = null;
    this._clipPlane2  = null;
  }
}
