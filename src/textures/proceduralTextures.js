/**
 * Procedural texture generation for photorealistic planet surfaces.
 * Uses canvas-based noise and layered patterns.
 */

/** Seeded pseudo-random number generator */
function seededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** 2D Perlin-style noise */
export function createNoiseGenerator(seed) {
  const rand = seededRandom(seed);
  const perm = new Array(512);
  const p = new Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(a, b, t) { return a + t * (b - a); }
  function grad(hash, x, y) {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
  }

  return function noise(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);
    const a = perm[X] + Y;
    const b = perm[X + 1] + Y;
    return lerp(
      lerp(grad(perm[a], xf, yf), grad(perm[b], xf - 1, yf), u),
      lerp(grad(perm[a + 1], xf, yf - 1), grad(perm[b + 1], xf - 1, yf - 1), u),
      v
    );
  };
}

/** Multi-octave fractal noise */
export function fbm(noise, x, y, octaves = 6, persistence = 0.5, lacunarity = 2.0) {
  let value = 0;
  let amplitude = 1.0;
  let frequency = 1.0;
  let maxValue = 0;
  for (let i = 0; i < octaves; i++) {
    value += noise(x * frequency, y * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }
  return value / maxValue;
}

/** Create a canvas texture of given size */
function createCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { canvas, ctx: canvas.getContext('2d') };
}

/** Helper: map value from one range to another */
function mapRange(value, inMin, inMax, outMin, outMax) {
  return outMin + (outMax - outMin) * ((value - inMin) / (inMax - inMin));
}

/** Helper: clamp value */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** Helper: blend two RGB colors */
function blendColors(r1, g1, b1, r2, g2, b2, t) {
  return [
    r1 + (r2 - r1) * t,
    g1 + (g2 - g1) * t,
    b1 + (b2 - b1) * t,
  ];
}

// ==================== PLANET TEXTURES ====================

export function generateMercuryTexture(size = 1024) {
  const { canvas, ctx } = createCanvas(size, size / 2);
  const imageData = ctx.createImageData(size, size / 2);
  const data = imageData.data;
  const noise = createNoiseGenerator(42);

  for (let y = 0; y < size / 2; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size * 8;
      const ny = y / (size / 2) * 4;

      // Base terrain
      const terrain = fbm(noise, nx, ny, 8, 0.55, 2.0) * 0.5 + 0.5;

      // Crater-like features
      const craterNoise = fbm(noise, nx * 3 + 100, ny * 3 + 100, 4, 0.6, 2.2);
      const craters = Math.max(0, -craterNoise * 0.8);

      // Scarps and ridges
      const ridges = Math.abs(fbm(noise, nx * 5 + 200, ny * 5 + 200, 3, 0.4, 2.0)) * 0.3;

      let value = terrain - craters + ridges;
      value = clamp(value, 0, 1);

      // Mercury color palette: grey-brown
      const [r, g, b] = blendColors(
        90, 80, 70,    // dark
        180, 170, 155, // light
        value
      );

      const i = (y * size + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export function generateVenusTexture(size = 1024) {
  const { canvas, ctx } = createCanvas(size, size / 2);
  const imageData = ctx.createImageData(size, size / 2);
  const data = imageData.data;
  const noise = createNoiseGenerator(99);

  for (let y = 0; y < size / 2; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size * 6;
      const ny = y / (size / 2) * 3;

      // Thick cloud layers
      const clouds1 = fbm(noise, nx + 50, ny + 50, 6, 0.5, 2.0) * 0.5 + 0.5;
      const clouds2 = fbm(noise, nx * 2 + 150, ny * 2 + 150, 4, 0.45, 2.2) * 0.5 + 0.5;
      const clouds3 = fbm(noise, nx * 0.5, ny * 0.5, 3, 0.6, 1.8) * 0.5 + 0.5;

      const value = clouds1 * 0.5 + clouds2 * 0.3 + clouds3 * 0.2;

      // Venus: yellowish-orange cloud palette
      const [r, g, b] = blendColors(
        160, 120, 60,  // darker cloud
        220, 190, 110, // lighter cloud
        value
      );

      const i = (y * size + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export function generateEarthTexture(size = 1024) {
  const { canvas, ctx } = createCanvas(size, size / 2);
  const imageData = ctx.createImageData(size, size / 2);
  const data = imageData.data;
  const noise = createNoiseGenerator(7);
  const noise2 = createNoiseGenerator(777);

  for (let y = 0; y < size / 2; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size * 8;
      const ny = y / (size / 2) * 4;

      // Latitude for polar ice
      const lat = Math.abs(y / (size / 2) - 0.5) * 2;

      // Continental shapes
      const continent = fbm(noise, nx, ny, 7, 0.55, 2.0);
      const detail = fbm(noise2, nx * 4, ny * 4, 4, 0.4, 2.2) * 0.15;

      const landLevel = continent + detail;
      const isLand = landLevel > 0.05;
      const isPolar = lat > 0.75;

      let r, g, b;

      if (isPolar) {
        // Polar ice
        [r, g, b] = [235, 240, 245];
      } else if (isLand) {
        // Land - varies from green to brown to desert
        const elevation = clamp(mapRange(landLevel, 0.05, 0.6, 0, 1), 0, 1);
        if (elevation < 0.3) {
          [r, g, b] = blendColors(34, 85, 34, 85, 120, 55, elevation / 0.3);
        } else if (elevation < 0.6) {
          [r, g, b] = blendColors(85, 120, 55, 140, 130, 80, (elevation - 0.3) / 0.3);
        } else {
          [r, g, b] = blendColors(140, 130, 80, 180, 170, 150, (elevation - 0.6) / 0.4);
        }
      } else {
        // Ocean - depth varies
        const depth = clamp(mapRange(landLevel, -0.5, 0.05, 0, 1), 0, 1);
        [r, g, b] = blendColors(15, 30, 80, 30, 80, 160, depth);
      }

      // Transition zones
      if (lat > 0.65 && lat <= 0.75) {
        const snowBlend = (lat - 0.65) / 0.1;
        [r, g, b] = blendColors(r, g, b, 235, 240, 245, snowBlend);
      }

      const i = (y * size + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export function generateEarthClouds(size = 1024) {
  const { canvas, ctx } = createCanvas(size, size / 2);
  const imageData = ctx.createImageData(size, size / 2);
  const data = imageData.data;
  const noise = createNoiseGenerator(333);

  for (let y = 0; y < size / 2; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size * 8;
      const ny = y / (size / 2) * 4;

      const cloud = fbm(noise, nx, ny, 6, 0.5, 2.0) * 0.5 + 0.5;
      const alpha = clamp(mapRange(cloud, 0.4, 0.8, 0, 255), 0, 255);

      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = alpha;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export function generateMarsTexture(size = 1024) {
  const { canvas, ctx } = createCanvas(size, size / 2);
  const imageData = ctx.createImageData(size, size / 2);
  const data = imageData.data;
  const noise = createNoiseGenerator(444);

  for (let y = 0; y < size / 2; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size * 8;
      const ny = y / (size / 2) * 4;
      const lat = Math.abs(y / (size / 2) - 0.5) * 2;

      // Surface terrain
      const terrain = fbm(noise, nx, ny, 7, 0.55, 2.0) * 0.5 + 0.5;
      const detail = fbm(noise, nx * 6 + 300, ny * 6 + 300, 4, 0.4, 2.2) * 0.15;
      const value = terrain + detail;

      // Mars color: red/orange/brown tones
      let [r, g, b] = blendColors(
        140, 60, 25,   // dark rust
        210, 140, 80,  // light sand
        clamp(value, 0, 1)
      );

      // Volcanic dark regions
      const darkRegions = fbm(noise, nx * 0.8 + 500, ny * 0.8 + 500, 3, 0.5, 2.0);
      if (darkRegions < -0.2) {
        const darkBlend = clamp(mapRange(darkRegions, -0.5, -0.2, 1, 0), 0, 1);
        [r, g, b] = blendColors(r, g, b, 80, 40, 20, darkBlend);
      }

      // Polar ice caps
      if (lat > 0.82) {
        const iceBlend = (lat - 0.82) / 0.18;
        [r, g, b] = blendColors(r, g, b, 230, 225, 220, iceBlend);
      }

      const i = (y * size + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export function generateJupiterTexture(size = 1024) {
  const { canvas, ctx } = createCanvas(size, size / 2);
  const imageData = ctx.createImageData(size, size / 2);
  const data = imageData.data;
  const noise = createNoiseGenerator(555);

  const bands = [
    { y: 0.0, color: [180, 150, 100] },
    { y: 0.1, color: [200, 160, 110] },
    { y: 0.2, color: [160, 120, 80] },
    { y: 0.25, color: [210, 180, 130] },
    { y: 0.35, color: [190, 140, 90] },
    { y: 0.42, color: [220, 190, 140] },
    { y: 0.48, color: [170, 120, 70] },
    { y: 0.52, color: [200, 170, 120] },
    { y: 0.58, color: [180, 130, 80] },
    { y: 0.65, color: [210, 175, 125] },
    { y: 0.75, color: [170, 135, 95] },
    { y: 0.8, color: [200, 165, 115] },
    { y: 0.9, color: [185, 150, 105] },
    { y: 1.0, color: [175, 145, 100] },
  ];

  for (let y = 0; y < size / 2; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size * 12;
      const ny = y / (size / 2);

      // Band turbulence
      const turbulence = fbm(noise, nx * 2, ny * 20, 4, 0.4, 2.0) * 0.02;
      const bandY = clamp(ny + turbulence, 0, 1);

      // Find band color
      let bandColor = bands[0].color;
      for (let i = 0; i < bands.length - 1; i++) {
        if (bandY >= bands[i].y && bandY < bands[i + 1].y) {
          const t = (bandY - bands[i].y) / (bands[i + 1].y - bands[i].y);
          const smoothT = t * t * (3 - 2 * t); // smoothstep
          bandColor = blendColors(
            bands[i].color[0], bands[i].color[1], bands[i].color[2],
            bands[i + 1].color[0], bands[i + 1].color[1], bands[i + 1].color[2],
            smoothT
          );
          break;
        }
      }

      // Swirl detail
      const swirl = fbm(noise, nx * 3 + 600, ny * 30 + 600, 5, 0.5, 2.0) * 15;
      const detail = fbm(noise, nx + swirl * 0.01, ny * 8, 4, 0.45, 2.0) * 0.5 + 0.5;

      let [r, g, b] = bandColor;
      r = clamp(r * (0.8 + detail * 0.4), 0, 255);
      g = clamp(g * (0.8 + detail * 0.4), 0, 255);
      b = clamp(b * (0.8 + detail * 0.4), 0, 255);

      // Great Red Spot (approximate position)
      const spotX = 0.6;
      const spotY = 0.58;
      const dx = (nx / 12 - spotX) * 2.5;
      const dy = (ny - spotY) * 8;
      const spotDist = Math.sqrt(dx * dx + dy * dy);
      if (spotDist < 1.0) {
        const spotBlend = 1.0 - spotDist;
        const spotSwirl = fbm(noise, nx * 4 + Math.atan2(dy, dx) * 2, ny * 4 + spotDist * 3, 4, 0.5, 2.0) * 0.5 + 0.5;
        const spotR = 180 + spotSwirl * 50;
        const spotG = 70 + spotSwirl * 40;
        const spotB = 40 + spotSwirl * 20;
        [r, g, b] = blendColors(r, g, b, spotR, spotG, spotB, spotBlend * spotBlend);
      }

      const i = (y * size + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export function generateSaturnTexture(size = 1024) {
  const { canvas, ctx } = createCanvas(size, size / 2);
  const imageData = ctx.createImageData(size, size / 2);
  const data = imageData.data;
  const noise = createNoiseGenerator(666);

  const bands = [
    { y: 0.0, color: [195, 180, 140] },
    { y: 0.15, color: [210, 195, 155] },
    { y: 0.25, color: [190, 175, 130] },
    { y: 0.35, color: [215, 200, 165] },
    { y: 0.45, color: [200, 185, 145] },
    { y: 0.55, color: [220, 205, 170] },
    { y: 0.65, color: [195, 178, 138] },
    { y: 0.75, color: [210, 195, 158] },
    { y: 0.85, color: [200, 180, 142] },
    { y: 1.0, color: [190, 175, 135] },
  ];

  for (let y = 0; y < size / 2; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size * 10;
      const ny = y / (size / 2);

      const turbulence = fbm(noise, nx * 2, ny * 15, 3, 0.35, 2.0) * 0.015;
      const bandY = clamp(ny + turbulence, 0, 0.999);

      let bandColor = bands[0].color;
      for (let i = 0; i < bands.length - 1; i++) {
        if (bandY >= bands[i].y && bandY < bands[i + 1].y) {
          const t = (bandY - bands[i].y) / (bands[i + 1].y - bands[i].y);
          const smoothT = t * t * (3 - 2 * t);
          bandColor = blendColors(
            bands[i].color[0], bands[i].color[1], bands[i].color[2],
            bands[i + 1].color[0], bands[i + 1].color[1], bands[i + 1].color[2],
            smoothT
          );
          break;
        }
      }

      const detail = fbm(noise, nx * 4, ny * 12, 4, 0.4, 2.0) * 0.5 + 0.5;
      let [r, g, b] = bandColor;
      r = clamp(r * (0.85 + detail * 0.3), 0, 255);
      g = clamp(g * (0.85 + detail * 0.3), 0, 255);
      b = clamp(b * (0.85 + detail * 0.3), 0, 255);

      // North polar hexagon hint
      if (ny < 0.08) {
        const polarBlend = 1.0 - ny / 0.08;
        [r, g, b] = blendColors(r, g, b, 160, 180, 200, polarBlend * 0.4);
      }

      const i = (y * size + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export function generateUranusTexture(size = 1024) {
  const { canvas, ctx } = createCanvas(size, size / 2);
  const imageData = ctx.createImageData(size, size / 2);
  const data = imageData.data;
  const noise = createNoiseGenerator(777);

  for (let y = 0; y < size / 2; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size * 6;
      const ny = y / (size / 2);

      // Subtle banding
      const band = Math.sin(ny * Math.PI * 8) * 0.05;
      const cloud = fbm(noise, nx, ny * 4, 5, 0.4, 2.0) * 0.1;

      const value = 0.5 + band + cloud;

      // Uranus pale cyan/blue-green palette
      const [r, g, b] = blendColors(
        85, 155, 170,  // darker cyan
        140, 210, 220, // lighter cyan
        clamp(value, 0, 1)
      );

      const i = (y * size + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export function generateNeptuneTexture(size = 1024) {
  const { canvas, ctx } = createCanvas(size, size / 2);
  const imageData = ctx.createImageData(size, size / 2);
  const data = imageData.data;
  const noise = createNoiseGenerator(888);

  for (let y = 0; y < size / 2; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size * 8;
      const ny = y / (size / 2);

      // Banding with storms
      const band = Math.sin(ny * Math.PI * 10) * 0.08;
      const storm = fbm(noise, nx * 2, ny * 6, 5, 0.5, 2.0) * 0.15;
      const detail = fbm(noise, nx * 4 + 100, ny * 8 + 100, 4, 0.4, 2.0) * 0.08;

      const value = 0.5 + band + storm + detail;

      // Neptune deep blue palette
      const [r, g, b] = blendColors(
        30, 50, 120,   // deep blue
        80, 110, 190,  // bright blue
        clamp(value, 0, 1)
      );

      const i = (y * size + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export function generateMoonTexture(size = 512, seed = 1234) {
  const { canvas, ctx } = createCanvas(size, size / 2);
  const imageData = ctx.createImageData(size, size / 2);
  const data = imageData.data;
  const noise = createNoiseGenerator(seed);

  for (let y = 0; y < size / 2; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size * 8;
      const ny = y / (size / 2) * 4;

      const terrain = fbm(noise, nx, ny, 6, 0.5, 2.0) * 0.5 + 0.5;
      const craters = Math.max(0, -fbm(noise, nx * 4 + 50, ny * 4 + 50, 3, 0.6, 2.2) * 0.5);
      const value = clamp(terrain - craters, 0, 1);

      const base = 120 + value * 80;
      const i = (y * size + x) * 4;
      data[i] = base;
      data[i + 1] = base - 5;
      data[i + 2] = base - 10;
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Generate a starfield background */
export function generateStarfield(size = 4096) {
  const { canvas, ctx } = createCanvas(size, size);
  const rand = seededRandom(12345);

  // Dark background
  ctx.fillStyle = '#000005';
  ctx.fillRect(0, 0, size, size);

  // Dense star field — 15K stars for 4K
  const starCount = Math.round(15000 * (size / 4096));
  for (let i = 0; i < starCount; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const brightness = rand();
    const radius = brightness < 0.95 ? rand() * 1.2 : rand() * 2.5;

    // Star color varies with temperature
    let r, g, b;
    const colorRand = rand();
    if (colorRand < 0.6) {
      r = g = b = 200 + rand() * 55;
    } else if (colorRand < 0.75) {
      r = 180 + rand() * 40;
      g = 190 + rand() * 50;
      b = 230 + rand() * 25;
    } else if (colorRand < 0.85) {
      r = 230 + rand() * 25;
      g = 210 + rand() * 30;
      b = 160 + rand() * 40;
    } else if (colorRand < 0.92) {
      r = 230 + rand() * 25;
      g = 170 + rand() * 40;
      b = 120 + rand() * 40;
    } else {
      r = 220 + rand() * 35;
      g = 140 + rand() * 40;
      b = 120 + rand() * 30;
    }

    const alpha = 0.4 + brightness * 0.6;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${Math.floor(r)},${Math.floor(g)},${Math.floor(b)},${alpha})`;
    ctx.fill();

    // Add glow to brighter stars
    if (brightness > 0.9) {
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius * 4);
      gradient.addColorStop(0, `rgba(${Math.floor(r)},${Math.floor(g)},${Math.floor(b)},0.3)`);
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath();
      ctx.arc(x, y, radius * 4, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
    }
  }

  // Multi-color nebula / Milky Way band with dark dust lanes
  const noise = createNoiseGenerator(9999);
  const noise2 = createNoiseGenerator(8888);
  const nebulaData = ctx.getImageData(0, 0, size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size * 3;
      const ny = y / size * 3;
      const n = fbm(noise, nx, ny, 6, 0.5, 2.0) * 0.5 + 0.5;
      const band = Math.exp(-Math.pow((y / size - 0.5) * 4, 2));

      // Dark dust lanes using second noise
      const dust = fbm(noise2, nx * 2, ny * 2, 4, 0.55, 2.0) * 0.5 + 0.5;
      const dustMask = dust > 0.55 ? 1.0 - (dust - 0.55) * 3 : 1.0;

      if (n > 0.45 && band > 0.2) {
        const intensity = (n - 0.45) * 2 * band * 14 * Math.max(0.1, dustMask);
        const i = (y * size + x) * 4;
        // Multi-color: blue core, purple/pink edges, hints of gold
        const bandPos = (y / size - 0.5) * 4;
        const colorShift = Math.abs(bandPos);
        nebulaData.data[i] += intensity * (0.25 + colorShift * 0.4);     // red: more at edges
        nebulaData.data[i + 1] += intensity * (0.15 + colorShift * 0.1); // green: subtle
        nebulaData.data[i + 2] += intensity * (0.8 - colorShift * 0.2);  // blue: strongest at center
      }
    }
  }
  ctx.putImageData(nebulaData, 0, 0);

  return canvas;
}

/** Generate a procedural bump map for rocky planets */
export function generateBumpMap(size = 1024, seed = 42, options = {}) {
  const { octaves = 6, frequency = 8, craterStrength = 0.4 } = options;
  const { canvas, ctx } = createCanvas(size, size / 2);
  const imageData = ctx.createImageData(size, size / 2);
  const data = imageData.data;
  const noise = createNoiseGenerator(seed);
  const craterNoise = createNoiseGenerator(seed + 100);

  for (let y = 0; y < size / 2; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size * frequency;
      const ny = y / (size / 2) * (frequency / 2);

      // Base terrain height
      let h = fbm(noise, nx, ny, octaves, 0.55, 2.0) * 0.5 + 0.5;

      // Crater layer
      const crater = fbm(craterNoise, nx * 3, ny * 3, 4, 0.6, 2.2);
      h -= Math.max(0, -crater) * craterStrength;

      h = clamp(h, 0, 1);
      const v = Math.floor(h * 255);
      const i = (y * size + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Generate per-pixel roughness map for Earth */
export function generateEarthRoughnessMap(size = 1024) {
  const { canvas, ctx } = createCanvas(size, size / 2);
  const imageData = ctx.createImageData(size, size / 2);
  const data = imageData.data;
  const noise = createNoiseGenerator(7); // same seed as Earth texture for continent alignment

  for (let y = 0; y < size / 2; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size * 8;
      const ny = y / (size / 2) * 4;
      const lat = Math.abs(y / (size / 2) - 0.5) * 2;

      const continent = fbm(noise, nx, ny, 7, 0.55, 2.0);
      const isLand = continent > 0.05;
      const isPolar = lat > 0.75;

      let roughness;
      if (isPolar) {
        roughness = 0.5; // ice: medium roughness
      } else if (isLand) {
        roughness = 0.8; // land: rough
      } else {
        roughness = 0.15; // ocean: smooth/specular
      }

      // Smooth transitions
      if (lat > 0.65 && lat <= 0.75) {
        const blend = (lat - 0.65) / 0.1;
        roughness = roughness * (1 - blend) + 0.5 * blend;
      }

      const v = Math.floor(roughness * 255);
      const i = (y * size + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Generate per-pixel roughness map for Mars */
export function generateMarsRoughnessMap(size = 1024) {
  const { canvas, ctx } = createCanvas(size, size / 2);
  const imageData = ctx.createImageData(size, size / 2);
  const data = imageData.data;
  const noise = createNoiseGenerator(444); // same seed as Mars texture

  for (let y = 0; y < size / 2; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size * 8;
      const ny = y / (size / 2) * 4;
      const lat = Math.abs(y / (size / 2) - 0.5) * 2;

      const darkRegions = fbm(noise, nx * 0.8 + 500, ny * 0.8 + 500, 3, 0.5, 2.0);
      const isVolcanic = darkRegions < -0.2;
      const isPolar = lat > 0.82;

      let roughness;
      if (isPolar) {
        roughness = 0.4; // ice caps
      } else if (isVolcanic) {
        roughness = 0.6; // volcanic dark regions
      } else {
        roughness = 0.85; // general terrain
      }

      const v = Math.floor(roughness * 255);
      const i = (y * size + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Generate Earth city lights texture (population-density clusters) */
export function generateEarthCityLights(size = 1024) {
  const { canvas, ctx } = createCanvas(size, size / 2);
  const imageData = ctx.createImageData(size, size / 2);
  const data = imageData.data;
  const continentNoise = createNoiseGenerator(7); // matches Earth texture
  const cityNoise = createNoiseGenerator(2222);
  const clusterNoise = createNoiseGenerator(3333);

  for (let y = 0; y < size / 2; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size * 8;
      const ny = y / (size / 2) * 4;
      const lat = Math.abs(y / (size / 2) - 0.5) * 2;

      // Only on land
      const continent = fbm(continentNoise, nx, ny, 7, 0.55, 2.0);
      const isLand = continent > 0.05;

      if (!isLand || lat > 0.75) {
        const i = (y * size + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 0;
        data[i + 3] = 255;
        continue;
      }

      // Mid-latitude concentration (most cities 20-60 degrees)
      const latWeight = Math.exp(-Math.pow((lat - 0.4) * 3, 2));

      // Coastal bias: land near ocean boundaries is brighter
      const coastDist = Math.max(0, 1.0 - (continent - 0.05) * 5);
      const coastBias = 1.0 + coastDist * 1.5;

      // City clusters
      const cluster = fbm(clusterNoise, nx * 4, ny * 4, 4, 0.5, 2.0) * 0.5 + 0.5;
      const detail = fbm(cityNoise, nx * 12, ny * 12, 3, 0.4, 2.0) * 0.5 + 0.5;

      let brightness = cluster * detail * latWeight * coastBias;
      // Threshold: only show above certain density
      brightness = brightness > 0.35 ? Math.pow((brightness - 0.35) / 0.65, 1.5) : 0;
      brightness = clamp(brightness, 0, 1);

      // Warm yellow-orange city light color
      const i = (y * size + x) * 4;
      data[i] = Math.floor(brightness * 255);       // R
      data[i + 1] = Math.floor(brightness * 200);   // G (warm)
      data[i + 2] = Math.floor(brightness * 100);   // B (warm)
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Generate roughness map from a loaded NASA Earth texture.
 *  Analyzes color to detect ocean (smooth/specular) vs land (matte) vs ice (medium). */
export function generateRoughnessFromTexture(texture, size = 1024) {
  const height = size / 2;
  // Draw the Three.js texture image to a canvas to sample pixels
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = size;
  srcCanvas.height = height;
  const srcCtx = srcCanvas.getContext('2d');
  srcCtx.drawImage(texture.image, 0, 0, size, height);
  const srcData = srcCtx.getImageData(0, 0, size, height).data;

  const { canvas, ctx } = createCanvas(size, height);
  const imageData = ctx.createImageData(size, height);
  const data = imageData.data;

  for (let y = 0; y < height; y++) {
    const lat = Math.abs(y / height - 0.5) * 2; // 0 at equator, 1 at poles
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const r = srcData[i];
      const g = srcData[i + 1];
      const b = srcData[i + 2];

      let roughness;

      // Polar regions: ice
      if (lat > 0.83) {
        roughness = 0.5;
      } else {
        // Ocean detection: blue-dominant pixels
        const isOcean = b > r * 1.1 && b > g * 1.05 && b > 40;
        // Also detect very dark ocean (deep water)
        const isDarkOcean = r < 50 && g < 60 && b < 90 && b >= r;

        if (isOcean || isDarkOcean) {
          roughness = 0.15; // smooth/specular water
        } else {
          roughness = 0.8; // matte land
        }
      }

      // Smooth transition into polar ice
      if (lat > 0.75 && lat <= 0.83) {
        const blend = (lat - 0.75) / 0.08;
        roughness = roughness * (1 - blend) + 0.5 * blend;
      }

      const v = Math.floor(roughness * 255);
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Generate city lights from a loaded NASA Earth texture.
 *  Uses the actual texture to detect land areas, placing lights only on real continents. */
export function generateCityLightsFromTexture(texture, size = 1024) {
  const height = size / 2;
  // Draw the Three.js texture image to a canvas to sample pixels
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = size;
  srcCanvas.height = height;
  const srcCtx = srcCanvas.getContext('2d');
  srcCtx.drawImage(texture.image, 0, 0, size, height);
  const srcData = srcCtx.getImageData(0, 0, size, height).data;

  const { canvas, ctx } = createCanvas(size, height);
  const imageData = ctx.createImageData(size, height);
  const data = imageData.data;

  // Build a land mask from the NASA texture
  const landMask = new Uint8Array(size * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const r = srcData[i];
      const g = srcData[i + 1];
      const b = srcData[i + 2];
      const lat = Math.abs(y / height - 0.5) * 2;

      // Ocean detection (same as roughness map)
      const isOcean = (b > r * 1.1 && b > g * 1.05 && b > 40) ||
                      (r < 50 && g < 60 && b < 90 && b >= r);
      const isPolar = lat > 0.78;

      landMask[y * size + x] = (!isOcean && !isPolar) ? 1 : 0;
    }
  }

  // Compute distance-to-coast for each land pixel (approximate via sampling neighbors)
  const cityNoise = createNoiseGenerator(2222);
  const clusterNoise = createNoiseGenerator(3333);

  for (let y = 0; y < height; y++) {
    const lat = Math.abs(y / height - 0.5) * 2;
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const i = idx * 4;

      if (!landMask[idx]) {
        data[i] = data[i + 1] = data[i + 2] = 0;
        data[i + 3] = 255;
        continue;
      }

      const nx = x / size * 8;
      const ny = y / height * 4;

      // Mid-latitude concentration (most cities 20-60 degrees)
      const latWeight = Math.exp(-Math.pow((lat - 0.4) * 3, 2));

      // Coastal bias: check nearby pixels for ocean
      let coastDist = 1.0;
      const checkR = 8;
      for (let dy = -checkR; dy <= checkR; dy += 2) {
        for (let dx = -checkR; dx <= checkR; dx += 2) {
          const cx = (x + dx + size) % size;
          const cy = clamp(y + dy, 0, height - 1);
          if (!landMask[cy * size + cx]) {
            const d = Math.sqrt(dx * dx + dy * dy) / checkR;
            coastDist = Math.min(coastDist, d);
          }
        }
      }
      const coastBias = 1.0 + (1.0 - coastDist) * 1.5;

      // City clusters using noise
      const cluster = fbm(clusterNoise, nx * 4, ny * 4, 4, 0.5, 2.0) * 0.5 + 0.5;
      const detail = fbm(cityNoise, nx * 12, ny * 12, 3, 0.4, 2.0) * 0.5 + 0.5;

      let brightness = cluster * detail * latWeight * coastBias;
      brightness = brightness > 0.35 ? Math.pow((brightness - 0.35) / 0.65, 1.5) : 0;
      brightness = clamp(brightness, 0, 1);

      // Warm yellow-orange city light color
      data[i] = Math.floor(brightness * 255);       // R
      data[i + 1] = Math.floor(brightness * 200);   // G (warm)
      data[i + 2] = Math.floor(brightness * 100);   // B (warm)
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Generate Saturn's ring texture */
export function generateRingTexture(size = 1024) {
  const { canvas, ctx } = createCanvas(size, 64);
  const imageData = ctx.createImageData(size, 64);
  const data = imageData.data;
  const noise = createNoiseGenerator(321);

  for (let x = 0; x < size; x++) {
    const r = x / size;

    // Ring band structure
    let opacity = 0;
    let brightness = 0.7;

    // Inner C ring (faint)
    if (r > 0.15 && r < 0.25) {
      opacity = 0.2 + Math.sin(r * 200) * 0.05;
      brightness = 0.5;
    }
    // B ring (brightest)
    if (r > 0.28 && r < 0.52) {
      opacity = 0.6 + Math.sin(r * 300) * 0.15 + Math.sin(r * 800) * 0.05;
      brightness = 0.85;
    }
    // Cassini Division (gap)
    if (r > 0.52 && r < 0.57) {
      opacity = 0.05;
      brightness = 0.3;
    }
    // A ring
    if (r > 0.57 && r < 0.78) {
      opacity = 0.45 + Math.sin(r * 400) * 0.1;
      brightness = 0.75;
      // Encke Gap
      if (r > 0.70 && r < 0.72) {
        opacity = 0.05;
      }
    }
    // F ring (thin, faint)
    if (r > 0.82 && r < 0.84) {
      opacity = 0.2;
      brightness = 0.6;
    }

    // Fine noise detail
    const n = noise(r * 50, 0) * 0.1;
    opacity = clamp(opacity + n, 0, 1);

    const base = brightness * 220;
    for (let y = 0; y < 64; y++) {
      const i = (y * size + x) * 4;
      data[i] = base + 10;
      data[i + 1] = base;
      data[i + 2] = base - 15;
      data[i + 3] = opacity * 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// ==================== DWARF PLANET TEXTURES ====================

/** Ceres: grey/brown with bright spots (Occator), craters */
export function generateCeresTexture(size = 512) {
  const { canvas, ctx } = createCanvas(size, size / 2);
  const imageData = ctx.createImageData(size, size / 2);
  const data = imageData.data;
  const noise = createNoiseGenerator(801);
  const noise2 = createNoiseGenerator(802);
  const h = size / 2;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size * 8;
      const ny = y / h * 4;

      const terrain = fbm(noise, nx, ny, 6, 0.55, 2.0) * 0.5 + 0.5;
      const craters = Math.max(0, -fbm(noise2, nx * 3 + 50, ny * 3 + 50, 4, 0.6, 2.2) * 0.6);
      let value = terrain - craters;

      // Occator-like bright spots
      const spotX = (x / size - 0.35);
      const spotY = (y / h - 0.45);
      const spotDist = Math.sqrt(spotX * spotX + spotY * spotY);
      const spot = spotDist < 0.03 ? (1 - spotDist / 0.03) * 0.6 : 0;

      value = clamp(value + spot, 0, 1);
      const [r, g, b] = blendColors(60, 60, 55, 150, 148, 140, value);

      const i = (y * size + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Pluto: heart-shaped nitrogen ice, reddish tholins, methane terrain */
export function generatePlutoTexture(size = 512) {
  const { canvas, ctx } = createCanvas(size, size / 2);
  const imageData = ctx.createImageData(size, size / 2);
  const data = imageData.data;
  const noise = createNoiseGenerator(930);
  const noise2 = createNoiseGenerator(931);
  const h = size / 2;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size * 8;
      const ny = y / h * 4;

      const terrain = fbm(noise, nx, ny, 6, 0.5, 2.0) * 0.5 + 0.5;
      const detail = fbm(noise2, nx * 4, ny * 4, 4, 0.4, 2.2) * 0.15;

      // Heart-shaped Sputnik Planitia region
      const hx = (x / size - 0.4);
      const hy = (y / h - 0.5);
      const heartDist = Math.sqrt(hx * hx * 1.2 + hy * hy);
      const isHeart = heartDist < 0.12;

      let r, g, b;
      if (isHeart) {
        const iceVal = 0.8 + fbm(noise2, nx * 2, ny * 2, 3, 0.3, 2.0) * 0.1;
        [r, g, b] = blendColors(180, 170, 155, 220, 210, 195, clamp(iceVal, 0, 1));
      } else {
        const val = clamp(terrain + detail, 0, 1);
        [r, g, b] = blendColors(120, 85, 65, 195, 165, 130, val);
      }

      // Polar frost
      const lat = Math.abs(y / h - 0.5) * 2;
      if (lat > 0.8) {
        const frost = (lat - 0.8) / 0.2;
        [r, g, b] = blendColors(r, g, b, 200, 195, 185, frost * 0.5);
      }

      const i = (y * size + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Haumea: bright crystalline water ice, subtle features */
export function generateHaumeaTexture(size = 512) {
  const { canvas, ctx } = createCanvas(size, size / 2);
  const imageData = ctx.createImageData(size, size / 2);
  const data = imageData.data;
  const noise = createNoiseGenerator(126);
  const h = size / 2;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size * 10;
      const ny = y / h * 5;

      const ice = fbm(noise, nx, ny, 5, 0.45, 2.0) * 0.5 + 0.5;
      const fractures = Math.abs(fbm(noise, nx * 6 + 100, ny * 6 + 100, 3, 0.4, 2.0)) * 0.15;
      const val = clamp(ice + fractures, 0, 1);

      const [r, g, b] = blendColors(180, 178, 172, 225, 222, 215, val);
      const i = (y * size + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Makemake: frozen methane/ethane with reddish tholins */
export function generateMakemakeTexture(size = 512) {
  const { canvas, ctx } = createCanvas(size, size / 2);
  const imageData = ctx.createImageData(size, size / 2);
  const data = imageData.data;
  const noise = createNoiseGenerator(2005);
  const noise2 = createNoiseGenerator(2006);
  const h = size / 2;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size * 8;
      const ny = y / h * 4;

      const terrain = fbm(noise, nx, ny, 6, 0.5, 2.0) * 0.5 + 0.5;
      const tholins = fbm(noise2, nx * 2 + 50, ny * 2 + 50, 4, 0.45, 2.0) * 0.5 + 0.5;

      const val = clamp(terrain, 0, 1);
      const thVal = clamp(tholins, 0, 1);
      let [r, g, b] = blendColors(155, 130, 105, 200, 175, 145, val);
      r = clamp(r + thVal * 20, 0, 255);
      g = clamp(g - thVal * 5, 0, 255);

      const i = (y * size + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Eris: extremely reflective nitrogen ice, nearly white */
export function generateErisTexture(size = 512) {
  const { canvas, ctx } = createCanvas(size, size / 2);
  const imageData = ctx.createImageData(size, size / 2);
  const data = imageData.data;
  const noise = createNoiseGenerator(2003);
  const h = size / 2;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size * 8;
      const ny = y / h * 4;

      const ice = fbm(noise, nx, ny, 5, 0.4, 2.0) * 0.5 + 0.5;
      const cracks = Math.abs(fbm(noise, nx * 8 + 200, ny * 8 + 200, 3, 0.5, 2.0)) * 0.1;
      const val = clamp(ice - cracks, 0, 1);

      const [r, g, b] = blendColors(190, 190, 195, 235, 235, 240, val);
      const i = (y * size + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}
