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
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform vec3 uSunPosition;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    vec3 sunDir = normalize(uSunPosition - vWorldPosition);

    float fresnel = 1.0 - dot(vNormal, viewDir);
    float glow = pow(fresnel, 3.0) * uIntensity;

    // Sun-facing side is brighter
    float sunFacing = dot(vNormal, sunDir) * 0.5 + 0.5;
    glow *= mix(0.05, 1.0, sunFacing);

    gl_FragColor = vec4(uColor, glow * 0.5);
  }
`;

/** Ring shader for Saturn/Uranus/Neptune */
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
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  uniform vec3 uColor;
  uniform float uInnerRadius;
  uniform float uOuterRadius;
  uniform vec3 uSunPosition;
  uniform vec3 uPlanetPosition;
  uniform float uPlanetRadius;

  void main() {
    // Radial distance from center
    float dist = length(vUv - 0.5) * 2.0;

    // Ring pattern using radial bands
    float r = (dist - 0.0) / 1.0;
    float ringPattern = 0.0;

    // Multiple ring bands with varying opacity
    ringPattern += smoothstep(0.15, 0.18, r) * (1.0 - smoothstep(0.20, 0.22, r)) * 0.3;
    ringPattern += smoothstep(0.24, 0.26, r) * (1.0 - smoothstep(0.42, 0.44, r)) * 0.7;
    ringPattern += smoothstep(0.46, 0.48, r) * (1.0 - smoothstep(0.52, 0.54, r)) * 0.5;
    ringPattern += smoothstep(0.55, 0.56, r) * (1.0 - smoothstep(0.78, 0.82, r)) * 0.9;
    ringPattern += smoothstep(0.84, 0.86, r) * (1.0 - smoothstep(0.92, 0.96, r)) * 0.4;

    // Fine detail noise
    float fineDetail = sin(r * 200.0) * 0.1 + 0.9;
    ringPattern *= fineDetail;

    // Sun lighting
    vec3 sunDir = normalize(uSunPosition - vWorldPosition);
    float sunLight = max(dot(vec3(0.0, 1.0, 0.0), sunDir), 0.0) * 0.5 + 0.5;

    // Shadow from planet
    vec3 toSun = normalize(uSunPosition - vWorldPosition);
    vec3 toPlanet = uPlanetPosition - vWorldPosition;
    float projDist = dot(toPlanet, toSun);
    vec3 closestPoint = vWorldPosition + toSun * projDist;
    float shadowDist = length(closestPoint - uPlanetPosition);
    float shadow = smoothstep(uPlanetRadius * 0.8, uPlanetRadius * 1.2, shadowDist);

    vec3 color = uColor * sunLight * shadow;
    float alpha = ringPattern * 0.8;

    // Fade at edges
    alpha *= smoothstep(0.0, 0.15, r) * (1.0 - smoothstep(0.94, 1.0, r));

    gl_FragColor = vec4(color, alpha);
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
