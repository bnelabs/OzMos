/** Atmospheric glow shader for planets */

export const atmosphereVertexShader = `
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vPlanetCenter;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    // Planet center in world space (atmosphere is child of planet mesh)
    vPlanetCenter = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const atmosphereFragmentShader = `
uniform vec3  uSunPosition;
uniform vec3  uColor;          // Rayleigh scatter color (sky hue, e.g. blue for Earth)
uniform float uThickness;      // scale-height multiplier (higher = thicker atmosphere)
uniform float uTerminatorWidth; // kept for API compat, unused
uniform vec3  uSunsetColor;    // kept for API compat, unused
uniform float uPlanetRadius;   // normalized planet radius
uniform float uAtmRadius;      // normalized atmosphere outer radius

varying vec3 vNormal;
varying vec3 vWorldPosition;
varying vec3 vPlanetCenter;

const int N_PRIMARY = 8;
const int N_LIGHT   = 4;
const float PI      = 3.14159265;

// Ray–sphere intersection; returns (tNear, tFar), negative y = no hit
vec2 raySphere(vec3 ro, vec3 rd, vec3 sc, float sr) {
  vec3  oc = ro - sc;
  float b  = dot(oc, rd);
  float c  = dot(oc, oc) - sr * sr;
  float h  = b * b - c;
  if (h < 0.0) return vec2(1e9, -1e9);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

float densityR(float h, float HR) { return exp(-max(h, 0.0) / HR); }
float densityM(float h, float HM) { return exp(-max(h, 0.0) / HM); }

float phaseRayleigh(float c) { return 0.75 * (1.0 + c * c); }
float phaseMie(float c) {
  const float g = 0.76, g2 = g * g;
  return 1.5 * (1.0 - g2) / (2.0 + g2)
       * (1.0 + c * c) / pow(max(0.001, 1.0 + g2 - 2.0 * g * c), 1.5);
}

void main() {
  vec3 rayO   = cameraPosition;
  vec3 rayD   = normalize(vWorldPosition - cameraPosition);
  vec3 sunDir = normalize(uSunPosition - vPlanetCenter);

  float atmThick = uAtmRadius - uPlanetRadius;
  if (atmThick <= 0.0) discard;

  float HR = atmThick * 0.25 * clamp(uThickness, 0.1, 5.0);
  float HM = atmThick * 0.10 * clamp(uThickness, 0.1, 5.0);

  // Intersect ray with atmosphere shell
  vec2 atmHit = raySphere(rayO, rayD, vPlanetCenter, uAtmRadius);
  if (atmHit.y < 0.0 || atmHit.x > atmHit.y) discard;

  float tN = max(atmHit.x, 0.0);
  float tF = atmHit.y;

  // Clip at planet surface (avoid scattering inside solid rock)
  vec2 planHit = raySphere(rayO, rayD, vPlanetCenter, uPlanetRadius * 0.998);
  if (planHit.x > 0.0 && planHit.x < tF) tF = planHit.x;
  if (tF <= tN + 0.0001) discard;

  float stepLen = (tF - tN) / float(N_PRIMARY);

  // Rayleigh beta (per-channel — blue dominates = blue sky)
  vec3 betaR = uColor * 0.028;
  float betaM = 0.007;

  vec3 accumR = vec3(0.0);
  float accumM = 0.0;
  float odR = 0.0, odM = 0.0; // running optical depth along view ray

  for (int i = 0; i < N_PRIMARY; i++) {
    vec3 p   = rayO + rayD * (tN + (float(i) + 0.5) * stepLen);
    float h  = length(p - vPlanetCenter) - uPlanetRadius;

    float dR = densityR(h, HR) * stepLen;
    float dM = densityM(h, HM) * stepLen;
    odR += dR;
    odM += dM;

    // Light ray: march from sample point toward sun
    float lodR = 0.0, lodM = 0.0;
    vec2 sunHit = raySphere(p, sunDir, vPlanetCenter, uAtmRadius);
    float lightStepLen = sunHit.y / float(N_LIGHT);

    for (int j = 0; j < N_LIGHT; j++) {
      vec3 lp  = p + sunDir * ((float(j) + 0.5) * lightStepLen);
      float lh = length(lp - vPlanetCenter) - uPlanetRadius;
      lodR += densityR(lh, HR) * lightStepLen;
      lodM += densityM(lh, HM) * lightStepLen;
    }

    // Attenuation: Beer–Lambert through view + light paths
    vec3 atten = exp(-(betaR * (odR + lodR) + betaM * (odM + lodM)));
    accumR += atten * dR;
    accumM += atten.x * dM;
  }

  float cosA   = dot(rayD, sunDir);
  float phR    = phaseRayleigh(cosA);
  float phM    = phaseMie(cosA);

  // Final color: Rayleigh (sky color) + Mie (white-ish sun halo)
  vec3 color = phR * betaR * accumR * 20.0
             + phM * betaM * accumM * vec3(1.0, 0.96, 0.88) * 35.0;

  float alpha = clamp(length(color) * 2.0, 0.0, 0.72);

  gl_FragColor = vec4(color, alpha);
}
`;

/** Ring shader for Saturn — Henyey-Greenstein phase scattering */
export const ringVertexShader = `
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const ringFragmentShader = `
uniform sampler2D uRingTexture;
uniform vec3 uSunPosition;
uniform vec3 uCameraPos;
uniform vec3 uPlanetPosition;
uniform float uPlanetRadius;
varying vec2 vUv;
varying vec3 vWorldPosition;
varying vec3 vNormal;

void main() {
  // Sample ring texture (1D, u = radial distance inner→outer)
  vec4 texColor = texture2D(uRingTexture, vec2(vUv.x, 0.5));
  if (texColor.a < 0.01) discard;

  // Sun lighting from above/below
  vec3 sunDir = normalize(uSunPosition - vWorldPosition);
  float sunLight = max(dot(vec3(0.0, 1.0, 0.0), sunDir), 0.0) * 0.5 + 0.5;

  // Shadow from planet
  vec3 toSun = normalize(uSunPosition - vWorldPosition);
  vec3 toPlanet = uPlanetPosition - vWorldPosition;
  float projDist = dot(toPlanet, toSun);
  vec3 closestPoint = vWorldPosition + toSun * projDist;
  float shadowDist = length(closestPoint - uPlanetPosition);
  float shadow = smoothstep(uPlanetRadius * 0.8, uPlanetRadius * 1.2, shadowDist);

  // Phase angle between camera-ring-sun (Henyey-Greenstein)
  vec3 toCamera = normalize(uCameraPos - vWorldPosition);
  vec3 toSunDir = normalize(uSunPosition - vWorldPosition);
  float cosPhase = dot(-toCamera, toSunDir);

  // Henyey-Greenstein phase function
  float g = 0.6;
  float phase = (1.0 - g * g) / pow(max(0.001, 1.0 + g * g - 2.0 * g * cosPhase), 1.5);
  phase = phase / (4.0 * 3.14159);

  // Normalize: phase ≈ 0.35 at g=0.6, cosPhase=0 (neutral)
  float phaseNorm = clamp(phase * 4.0, 0.3, 2.5);

  vec3 finalColor = texColor.rgb * sunLight * shadow * phaseNorm;
  gl_FragColor = vec4(finalColor, texColor.a * 0.85);
}
`;

/** City lights shader — only visible on the night side */
export const cityLightsVertexShader = `
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const cityLightsFragmentShader = `
  uniform sampler2D uCityMap;
  uniform vec3 uSunPosition;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec2 vUv;

  void main() {
    vec4 city = texture2D(uCityMap, vUv);
    vec3 sunDir = normalize(uSunPosition - vWorldPosition);
    float sunFacing = dot(vNormal, sunDir);
    // Only show on night side with smooth transition at terminator
    float nightMask = smoothstep(0.1, -0.1, sunFacing);
    gl_FragColor = vec4(city.rgb, city.r * nightMask);
  }
`;

/** Gas giant band animation shader (Jupiter, Saturn, Uranus, Neptune) */
export const gasGiantVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const gasGiantFragmentShader = `
uniform sampler2D tDiffuse;
uniform float uTime;
uniform float uBandVelocities[8];
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
  // Animate latitude bands at different speeds
  float y = vUv.y;
  float bandIndex = floor(y * 8.0);
  int band = int(clamp(bandIndex, 0.0, 7.0));

  float vel = 0.0;
  if (band == 0) vel = uBandVelocities[0];
  else if (band == 1) vel = uBandVelocities[1];
  else if (band == 2) vel = uBandVelocities[2];
  else if (band == 3) vel = uBandVelocities[3];
  else if (band == 4) vel = uBandVelocities[4];
  else if (band == 5) vel = uBandVelocities[5];
  else if (band == 6) vel = uBandVelocities[6];
  else vel = uBandVelocities[7];

  // Offset UV x by band velocity * time
  vec2 animUv = vec2(vUv.x + vel * uTime * 0.003, vUv.y);
  animUv.x = fract(animUv.x);

  vec4 texColor = texture2D(tDiffuse, animUv);
  gl_FragColor = texColor;
}
`;
