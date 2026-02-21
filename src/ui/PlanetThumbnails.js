/**
 * PlanetThumbnails — generates circular sphere thumbnails from real NASA textures.
 *
 * Each thumbnail is a canvas-rendered 56×56 image (80×56 for Saturn to fit rings)
 * with an equatorial crop of the planet's 2K texture, sphere-lighting overlay, and
 * a dataURL returned for use as CSS background-image in the planet bar and info panel.
 */

const THUMB_SIZE = 56; // px — planet sphere diameter

/** Texture paths (same files used by the 3D scene TextureLoader) */
const TEXTURE_URLS = {
  mercury: '/textures/mercury_2k.jpg',
  venus:   '/textures/venus_2k.jpg',
  earth:   '/textures/earth_2k.jpg',
  mars:    '/textures/mars_2k.jpg',
  jupiter: '/textures/jupiter_2k.jpg',
  saturn:  '/textures/saturn_2k.jpg',
  uranus:  '/textures/uranus_2k.jpg',
  neptune: '/textures/neptune_2k.jpg',
  moon:    '/textures/moon_2k.jpg',
  // Dwarf planets
  pluto:   '/textures/dwarfs/pluto_2k.jpg',
  ceres:   '/textures/dwarfs/ceres_2k.jpg',
};

/** Load an image, resolving on load and rejecting on error. */
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${url}`));
    img.src = url;
  });
}

/**
 * Render a plain spherical thumbnail for a planet.
 * @param {HTMLImageElement} img - Source texture image (equirectangular)
 * @param {number} size - Output canvas size in px
 * @returns {HTMLCanvasElement}
 */
function renderSphere(img, size) {
  const canvas = document.createElement('canvas');
  canvas.width  = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Clip everything to a circle
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();

  // Equatorial crop: take a square from the centre of the texture
  const srcSize = Math.min(img.width, img.height);
  const srcX    = (img.width  - srcSize) / 2 + srcSize * 0.1; // slight eastward offset for nicer face
  const srcY    = (img.height - srcSize) / 2;
  ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, size, size);

  // Sphere lighting overlay: highlight top-left, shadow bottom-right
  const light = ctx.createRadialGradient(
    size * 0.33, size * 0.28, 0,
    size * 0.52, size * 0.52, size * 0.52,
  );
  light.addColorStop(0,    'rgba(255,255,255,0.22)');
  light.addColorStop(0.35, 'rgba(255,255,255,0.06)');
  light.addColorStop(0.65, 'rgba(0,0,0,0.05)');
  light.addColorStop(1,    'rgba(0,0,0,0.48)');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, size, size);

  // Thin dark rim to separate sphere from background
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 0.5, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 1;
  ctx.stroke();

  return canvas;
}

/**
 * Render Saturn with realistic rings composited around the sphere.
 * @param {HTMLImageElement} img - Saturn texture
 * @returns {HTMLCanvasElement} - Wider canvas (rings extend beyond sphere)
 */
function renderSaturn(img) {
  const sphereSize = THUMB_SIZE;
  const ringW = Math.round(sphereSize * 1.72); // total canvas width
  const ringH = sphereSize;
  const cx    = ringW / 2;
  const cy    = ringH / 2;

  const canvas = document.createElement('canvas');
  canvas.width  = ringW;
  canvas.height = ringH;
  const ctx = canvas.getContext('2d');

  const rx = ringW * 0.48;   // ring horizontal radius
  const ry = ringH * 0.16;   // ring vertical radius (foreshortened)
  const rInner = sphereSize * 0.56; // inner edge of rings

  // ── Back ring (drawn before sphere so it peeks out behind) ──
  ctx.save();
  ctx.beginPath();
  // clip: only below the horizontal centreline (the "back" half)
  ctx.rect(0, 0, ringW, cy);
  ctx.clip();
  drawRingEllipse(ctx, cx, cy, rx, ry, rInner);
  ctx.restore();

  // ── Saturn sphere ──
  const sphere = renderSphere(img, sphereSize);
  const sx = cx - sphereSize / 2;
  const sy = cy - sphereSize / 2;
  ctx.drawImage(sphere, sx, sy);

  // ── Front ring (drawn after sphere so it overlaps the bottom half) ──
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, cy, ringW, ringH);
  ctx.clip();
  drawRingEllipse(ctx, cx, cy, rx, ry, rInner);
  ctx.restore();

  return canvas;
}

/**
 * Draw a filled ring ellipse using even-odd fill (doughnut shape).
 */
function drawRingEllipse(ctx, cx, cy, rx, ry, innerRx) {
  const innerRy = ry * (innerRx / rx);

  // Build gradient across the ring width
  const grad = ctx.createLinearGradient(cx - rx, cy, cx + rx, cy);
  grad.addColorStop(0,    'rgba(160,130,80,0)');
  grad.addColorStop(0.08, 'rgba(185,158,105,0.45)');
  grad.addColorStop(0.22, 'rgba(210,185,130,0.75)');
  grad.addColorStop(0.38, 'rgba(195,170,110,0.55)');
  grad.addColorStop(0.48, 'rgba(175,150, 95,0.35)'); // Cassini Division hint
  grad.addColorStop(0.52, 'rgba(175,150, 95,0.35)');
  grad.addColorStop(0.62, 'rgba(205,180,125,0.65)');
  grad.addColorStop(0.78, 'rgba(215,190,140,0.70)');
  grad.addColorStop(0.92, 'rgba(185,160,105,0.40)');
  grad.addColorStop(1,    'rgba(160,130,80,0)');

  ctx.fillStyle = grad;

  // Outer ellipse
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);

  // Inner ellipse (cut-out) — even-odd rule makes it a doughnut
  ctx.ellipse(cx, cy, innerRx, innerRy, 0, 0, Math.PI * 2, true);

  ctx.fill('evenodd');
}

/**
 * Generate canvas thumbnails for all planets that have real textures.
 * Returns a plain object: { mercury: dataURL, venus: dataURL, ... }
 * Planets without real textures (Haumea, Makemake, Eris) are skipped —
 * they fall back to the CSS gradient dots.
 *
 * @returns {Promise<Object.<string,string>>}
 */
export async function generatePlanetThumbnails() {
  const results = {};

  const entries = Object.entries(TEXTURE_URLS);
  await Promise.all(entries.map(async ([key, url]) => {
    try {
      const img = await loadImage(url);
      let canvas;
      if (key === 'saturn') {
        canvas = renderSaturn(img);
      } else {
        canvas = renderSphere(img, THUMB_SIZE);
      }
      results[key] = canvas.toDataURL('image/webp', 0.85);
    } catch {
      // Texture unavailable — CSS gradient fallback stays active
    }
  }));

  return results;
}
