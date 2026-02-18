/**
 * Ultra-realistic sun shaders with:
 * - Procedural granulation (convection cells)
 * - Sunspot simulation
 * - Limb darkening with wavelength dependence
 * - Volumetric corona with streamers and prominences
 * - Noise-driven surface turbulence
 */

// ============== Shared noise functions (inlined in each shader) ==============
const NOISE_GLSL = `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  float fbm(vec3 p, int octaves) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    for (int i = 0; i < 8; i++) {
      if (i >= octaves) break;
      value += amplitude * snoise(p * frequency);
      amplitude *= 0.5;
      frequency *= 2.0;
    }
    return value;
  }
`;

// ============== Sun Surface Shader ==============

export const sunVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
  uniform float uTime;

  ${NOISE_GLSL}

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);

    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vViewDir = normalize(cameraPosition - worldPos.xyz);

    // Turbulent surface displacement — granulation cells
    float t = uTime * 0.08;
    float disp1 = snoise(position * 3.0 + vec3(t * 0.3, t * 0.1, t * 0.2));
    float disp2 = snoise(position * 6.0 + vec3(-t * 0.2, t * 0.4, t * 0.15));
    float displacement = disp1 * 0.015 + disp2 * 0.008;

    vec3 newPos = position + normal * displacement;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
  }
`;

export const sunFragmentShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
  uniform float uTime;

  ${NOISE_GLSL}

  // Voronoi-like pattern for granulation cells
  float voronoi(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    float minDist = 1.0;
    for (int x = -1; x <= 1; x++) {
      for (int y = -1; y <= 1; y++) {
        for (int z = -1; z <= 1; z++) {
          vec3 neighbor = vec3(float(x), float(y), float(z));
          vec3 r = neighbor + 0.5 * sin(6.2831 * snoise(i + neighbor) + uTime * 0.1) - f;
          float d = dot(r, r);
          minDist = min(minDist, d);
        }
      }
    }
    return sqrt(minDist);
  }

  void main() {
    vec3 pos = vPosition * 2.0;
    float t = uTime * 0.12;

    // === Granulation (convection cells) ===
    float granulation = voronoi(pos * 4.0 + vec3(t * 0.2));
    float cellEdge = smoothstep(0.0, 0.15, granulation);

    // === Multi-layered turbulence for surface activity ===
    float noise1 = fbm(pos + vec3(t * 0.3, t * 0.1, t * 0.2), 7);
    float noise2 = fbm(pos * 2.5 + vec3(t * 0.5, -t * 0.2, t * 0.4), 5);
    float noise3 = fbm(pos * 5.0 + vec3(-t * 0.1, t * 0.6, -t * 0.3), 4);
    float combined = noise1 * 0.5 + noise2 * 0.3 + noise3 * 0.2;

    // === Sunspot simulation ===
    // Sunspots appear in active regions near the equator
    float latitude = abs(vPosition.y / length(vPosition));
    float sunspotBand = smoothstep(0.05, 0.35, latitude) * smoothstep(0.6, 0.35, latitude);
    float spotNoise = snoise(pos * 1.5 + vec3(t * 0.02, 0.0, t * 0.01));
    float sunspot = smoothstep(0.55, 0.65, spotNoise) * sunspotBand;

    // === Solar active regions (bright plage) ===
    float plage = smoothstep(0.3, 0.5, spotNoise) * sunspotBand * 0.3;

    // === Color palette (photosphere) ===
    vec3 umbra = vec3(0.35, 0.08, 0.01);     // Dark sunspot center
    vec3 penumbra = vec3(0.65, 0.25, 0.05);   // Sunspot edge
    vec3 intergranule = vec3(0.92, 0.55, 0.12); // Between granules (cooler)
    vec3 granuleCenter = vec3(1.0, 0.78, 0.35); // Hot granule center
    vec3 brightPlage = vec3(1.0, 0.92, 0.65);   // Active bright region
    vec3 hotSpot = vec3(1.0, 1.0, 0.88);        // Extremely bright point

    // Build surface color
    vec3 color = mix(intergranule, granuleCenter, cellEdge);
    color = mix(color, brightPlage, plage);
    color = mix(color, hotSpot, smoothstep(0.3, 0.6, combined) * 0.3);

    // Apply sunspots
    vec3 spotColor = mix(penumbra, umbra, smoothstep(0.55, 0.75, spotNoise));
    color = mix(color, spotColor, sunspot * 0.85);

    // === Limb darkening (wavelength-dependent) ===
    float cosTheta = max(dot(vNormal, vViewDir), 0.0);
    // Stronger darkening at red wavelengths: I/I0 = a + b*cos(theta)
    float limbR = 0.3 + 0.7 * pow(cosTheta, 0.35);
    float limbG = 0.2 + 0.8 * pow(cosTheta, 0.5);
    float limbB = 0.1 + 0.9 * pow(cosTheta, 0.7);
    color *= vec3(limbR, limbG, limbB);

    // === Emission intensity with chromospheric brightening at limb ===
    float brightness = 1.3 + combined * 0.25 + plage * 0.4;
    // Subtle chromospheric rim brightening (very thin bright edge)
    float chromoRim = pow(1.0 - cosTheta, 8.0) * 0.15;
    brightness += chromoRim;

    gl_FragColor = vec4(color * brightness, 1.0);
  }
`;

// ============== Corona Glow (inner atmosphere) ==============

export const coronaVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vViewDir;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const coronaFragmentShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vViewDir;
  uniform float uTime;

  ${NOISE_GLSL}

  void main() {
    float fresnel = 1.0 - abs(dot(vNormal, vViewDir));

    // Noise-modulated corona with streamer structure
    vec3 pos = vPosition * 1.5;
    float t = uTime * 0.1;
    float streamer = fbm(pos + vec3(t * 0.2, t * 0.1, -t * 0.15), 5);
    float streamPattern = smoothstep(-0.2, 0.4, streamer);

    // Radial streamer emphasis
    float radialNoise = snoise(normalize(vPosition) * 6.0 + vec3(0.0, t * 0.05, 0.0));
    float streamerBeam = smoothstep(0.2, 0.8, abs(radialNoise)) * 0.5;

    float glow = pow(fresnel, 2.5) * (0.7 + streamPattern * 0.3 + streamerBeam);

    // Pulsating
    float pulse = sin(uTime * 0.3) * 0.08 + sin(uTime * 0.7) * 0.04 + 0.88;

    // Color: warm inner to pale outer
    vec3 innerColor = vec3(1.0, 0.75, 0.25);
    vec3 outerColor = vec3(1.0, 0.35, 0.08);
    vec3 color = mix(innerColor, outerColor, fresnel * 0.8);

    // Brighten streamer areas
    color += vec3(0.2, 0.15, 0.05) * streamerBeam;

    float alpha = glow * 0.7 * pulse;
    gl_FragColor = vec4(color, alpha);
  }
`;

// ============== Volumetric Corona Shell Shaders ==============
// Used on concentric BackSide spheres for depth effect

export const coronaShellVertexShader = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vPosition;
  varying vec3 vWorldPos;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const coronaShellFragmentShader = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vPosition;
  varying vec3 vWorldPos;
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uColor;
  uniform float uScale; // shell scale factor for streamer variation

  ${NOISE_GLSL}

  void main() {
    float fresnel = 1.0 - abs(dot(vNormal, vViewDir));
    float t = uTime * 0.08;

    // Radial direction from center
    vec3 radDir = normalize(vPosition);

    // Corona streamers: elongated noise along radial direction
    vec3 noisePos = radDir * 3.0 + vec3(t * 0.15, t * 0.08, -t * 0.1);
    float streamer = fbm(noisePos, 5);
    float streamerMask = smoothstep(-0.1, 0.5, streamer) * 0.6 + 0.4;

    // Equatorial streamer belt (corona is brighter near solar equator)
    float equatorial = 1.0 - abs(radDir.y);
    float equatorialBoost = pow(equatorial, 1.5) * 0.3 + 0.7;

    // Coronal hole simulation (dark patches near poles)
    float coronalHole = smoothstep(0.7, 0.95, abs(radDir.y));
    float holeFactor = 1.0 - coronalHole * 0.6;

    // Glow with streamer modulation
    float glow = pow(fresnel, 2.0) * streamerMask * equatorialBoost * holeFactor;

    // Pulse — multiple frequencies for organic feel
    float pulse = sin(uTime * 0.3 + length(vPosition)) * 0.06
                + sin(uTime * 0.7 + streamer * 3.0) * 0.03
                + 0.91;

    // Color shift: streamers are slightly different hue
    vec3 color = uColor;
    color += vec3(0.1, 0.05, -0.02) * streamerMask * 0.5;

    float alpha = glow * uOpacity * pulse;
    gl_FragColor = vec4(color, alpha);
  }
`;

// ============== Solar Prominence Shader ==============
// For arc-like prominences rising from the surface

export const prominenceVertexShader = `
  attribute float aProgress;
  varying float vProgress;
  varying float vAlpha;
  uniform float uTime;
  uniform float uAge;

  void main() {
    vProgress = aProgress;

    // Arc trajectory
    float arcHeight = sin(aProgress * 3.14159) * (1.0 + sin(uTime * 0.5) * 0.1);
    vec3 pos = position;
    pos.y += arcHeight * 0.3;

    // Fade based on age
    float fadeFactor = 1.0 - smoothstep(0.7, 1.0, uAge);
    float fadeEdge = smoothstep(0.0, 0.1, aProgress) * smoothstep(1.0, 0.9, aProgress);
    vAlpha = fadeFactor * fadeEdge;

    gl_PointSize = mix(2.0, 5.0, sin(aProgress * 3.14159)) * fadeFactor;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

export const prominenceFragmentShader = `
  varying float vProgress;
  varying float vAlpha;

  void main() {
    float dist = length(gl_PointCoord - vec2(0.5));
    if (dist > 0.5) discard;
    float soft = 1.0 - smoothstep(0.1, 0.5, dist);

    // Color: bright orange-red for prominences
    vec3 color = mix(vec3(1.0, 0.3, 0.05), vec3(1.0, 0.7, 0.2), vProgress);

    gl_FragColor = vec4(color, vAlpha * soft * 0.8);
  }
`;
