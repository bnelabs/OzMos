/** Atmospheric glow shader for planets */

export const atmosphereVertexShader = `
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const atmosphereFragmentShader = `
uniform vec3 uSunPosition;
uniform vec3 uColor;
uniform float uThickness;
uniform float uTerminatorWidth;
uniform vec3 uSunsetColor;
varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  vec3 sunDir = normalize(uSunPosition - vWorldPosition);

  // Fresnel term — atmosphere visible at grazing angles
  float fresnel = 1.0 - max(0.0, dot(normal, viewDir));
  fresnel = pow(fresnel, 2.5);

  // Sun-facing term for day/night
  float sunFacing = dot(normal, sunDir);

  // Rayleigh scatter — blue at zenith, more at limb
  float scatter = pow(fresnel, 1.5) * uThickness;

  // Twilight terminator: bright strip at sunFacing ≈ 0
  float terminator = smoothstep(-uTerminatorWidth, uTerminatorWidth, sunFacing);
  float terminatorBand = 1.0 - abs(sunFacing) / uTerminatorWidth;
  terminatorBand = clamp(terminatorBand, 0.0, 1.0) * step(-uTerminatorWidth * 0.5, sunFacing);

  // Crepuscular warm tint at terminator
  float crepuscular = smoothstep(0.0, 0.2, sunFacing) * smoothstep(0.3, 0.05, sunFacing);
  vec3 atmosphereColor = mix(uColor, uSunsetColor, crepuscular * 0.6);
  atmosphereColor = mix(atmosphereColor, uColor * 1.5, terminatorBand * 0.3);

  // Day side scattering
  float dayScatter = max(0.0, sunFacing) * scatter;

  // Night side: very faint city lights / phosphorescence
  float nightGlow = max(0.0, -sunFacing) * scatter * 0.05;

  // Total alpha
  float alpha = (dayScatter + nightGlow + terminatorBand * 0.15 * uThickness) * terminator;
  // Atmospheric depth: thicker at grazing angles
  alpha *= (0.5 + 0.5 * fresnel);
  alpha = clamp(alpha, 0.0, 0.7);

  gl_FragColor = vec4(atmosphereColor, alpha);
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
