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

/** High-res 4K texture paths (must be downloaded separately from NASA). */
export const HIGH_RES_TEXTURES = {
  earth: '/textures/4k/earth_4k.jpg',
  mars: '/textures/4k/mars_4k.jpg',
  moon: '/textures/4k/moon_4k.jpg',
  jupiter: '/textures/4k/jupiter_4k.jpg',
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
  venus: getTexturePath('venus'),
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
  const keys = Object.keys(TEXTURE_PATHS);
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
