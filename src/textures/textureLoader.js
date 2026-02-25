/**
 * Loads photo-realistic NASA textures for all planets.
 * Returns a map of texture keys to THREE.Texture objects.
 * Supports LOD: mobile gets 2K, desktop with good GPU gets 4K (if available).
 */
import * as THREE from 'three';

/** Detect device texture quality capability. */
function getTextureQuality() {
  if (typeof window === 'undefined') return 'medium';
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const hasGoodGPU = !mobile
    && typeof navigator.hardwareConcurrency !== 'undefined'
    && navigator.hardwareConcurrency >= 4;

  if (mobile) return 'low';
  if (hasGoodGPU) return 'high';
  return 'medium';
}

export const TEXTURE_QUALITY = getTextureQuality();

/** High-res 4K texture paths — only list files that actually exist. */
export const HIGH_RES_TEXTURES = {
  earth:   '/textures/4k/earth_4k.jpg',    // 3MB  @ 8192×4096 (NASA Blue Marble)
  mercury: '/textures/4k/mercury_4k.jpg',  // 15MB @ 8192×4096 (Solar System Scope)
  venus:   '/textures/4k/venus_4k.jpg',    // 12MB @ 8192×4096 (Solar System Scope)
  // mars, moon, jupiter: 2K files in /textures/ are already max available quality
};

/**
 * Get the appropriate texture path for a planet based on device quality.
 * @param {string} planetName - Planet key (e.g. 'earth', 'mars')
 * @param {boolean} forceLow - Force 2K resolution
 * @returns {string} Texture path
 */
export function getTexturePath(planetName, forceLow = false) {
  if (forceLow || TEXTURE_QUALITY === 'low') {
    return `/textures/${planetName}_2k.jpg`;
  }
  if (TEXTURE_QUALITY === 'high' && HIGH_RES_TEXTURES[planetName]) {
    return HIGH_RES_TEXTURES[planetName];
  }
  return `/textures/${planetName}_2k.jpg`;
}

// Build texture paths using LOD quality detection
const TEXTURE_PATHS = {
  mercury: getTexturePath('mercury'),
  // venus_2k.jpg is a bad/mislabeled file (225KB) — only load the correct 4K version
  venus: TEXTURE_QUALITY === 'high' ? '/textures/4k/venus_4k.jpg' : null,
  earth: getTexturePath('earth'),
  earthClouds: '/textures/earth_clouds_2k.jpg',
  mars: getTexturePath('mars'),
  jupiter: getTexturePath('jupiter'),
  saturn: getTexturePath('saturn'),
  saturnRing: '/textures/saturn_ring.png',
  uranus: getTexturePath('uranus'),
  neptune: getTexturePath('neptune'),
  moon: getTexturePath('moon'),
  sun: '/textures/sun_8k.jpg',
  starmap: '/textures/starmap_2k.jpg',
  // Dwarf planets — real NASA/CC spacecraft imagery
  pluto: '/textures/dwarfs/pluto_2k.jpg',   // NASA New Horizons global mosaic (public domain)
  ceres: '/textures/dwarfs/ceres_2k.jpg',   // Solar System Scope CC BY 4.0
};

/** Solid-color fallback canvas texture (1×1 pixel, neutral grey). */
function makeFallbackTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#444466';
  ctx.fillRect(0, 0, 1, 1);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Attempt to load a texture, retrying up to maxAttempts times with
 * exponential backoff (2 s → 4 s → 8 s …).
 * On final failure returns a 1×1 solid-colour fallback texture.
 * @param {THREE.TextureLoader} loader
 * @param {string} url
 * @param {number} maxAttempts
 * @returns {Promise<THREE.Texture>}
 */
async function loadTextureWithRetry(loader, url, maxAttempts = 3) {
  let delay = 2000;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const texture = await new Promise((resolve, reject) => {
        loader.load(url, resolve, undefined, reject);
      });
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    } catch {
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, delay));
        delay *= 2;
      }
    }
  }
  console.warn(`[TextureLoader] Failed to load "${url}" after ${maxAttempts} attempts — using fallback.`);
  return makeFallbackTexture();
}

/**
 * Loads all textures and returns a map.
 * Each texture is retried up to 3 times with exponential backoff before
 * falling back to a solid-colour placeholder.
 * @param {function} onProgress - Called with (percent) as textures load
 * @returns {Promise<Object>} Map of key -> THREE.Texture
 */
export async function loadAllTextures(onProgress) {
  const loader = new THREE.TextureLoader();
  const keys = Object.keys(TEXTURE_PATHS).filter(k => TEXTURE_PATHS[k] != null);
  const total = keys.length;
  let loaded = 0;
  const textures = {};

  const promises = keys.map(async (key) => {
    textures[key] = await loadTextureWithRetry(loader, TEXTURE_PATHS[key]);
    loaded++;
    if (onProgress) onProgress(Math.round((loaded / total) * 100));
  });

  await Promise.all(promises);
  return textures;
}
