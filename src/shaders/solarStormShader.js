/**
 * GPU particle shaders for the Solar Storm (CME) simulation.
 * Uses PointsMaterial with custom vertex shader for per-particle physics.
 */

export const cmeVertexShader = `
  attribute float aEnergy;
  attribute float aStartTime;
  attribute vec3 aVelocity;
  attribute vec3 aOrigin;

  uniform float uTime;
  uniform float uDuration;

  varying float vEnergy;
  varying float vAge;
  varying float vAlpha;

  void main() {
    float age = uTime - aStartTime;
    vAge = age;
    vEnergy = aEnergy;

    // Particle is invisible before its start time
    if (age < 0.0 || age > uDuration) {
      gl_Position = vec4(0.0, 0.0, -999.0, 1.0);
      gl_PointSize = 0.0;
      vAlpha = 0.0;
      return;
    }

    float normalizedAge = age / uDuration;

    // Position: origin + velocity * age with slight deceleration
    float decel = 1.0 - normalizedAge * 0.3;
    vec3 pos = aOrigin + aVelocity * age * decel;

    // Slight spiral motion
    float spiral = age * 0.2 * aEnergy;
    pos.x += sin(spiral) * 0.3 * aEnergy;
    pos.z += cos(spiral) * 0.3 * aEnergy;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Size decreases with distance, increases with energy
    float distScale = 300.0 / length(mvPosition.xyz);
    gl_PointSize = clamp(aEnergy * 3.0 * distScale * (1.0 - normalizedAge * 0.5), 1.0, 12.0);

    // Fade in quickly, fade out slowly
    float fadeIn = smoothstep(0.0, 0.05, normalizedAge);
    float fadeOut = 1.0 - smoothstep(0.7, 1.0, normalizedAge);
    vAlpha = fadeIn * fadeOut;
  }
`;

export const cmeFragmentShader = `
  varying float vEnergy;
  varying float vAge;
  varying float vAlpha;

  void main() {
    // Circular particle
    float dist = length(gl_PointCoord - vec2(0.5));
    if (dist > 0.5) discard;

    float softEdge = 1.0 - smoothstep(0.2, 0.5, dist);

    // Color by energy: low=orange, mid=yellow, high=white
    vec3 lowColor = vec3(1.0, 0.4, 0.1);
    vec3 midColor = vec3(1.0, 0.8, 0.3);
    vec3 highColor = vec3(1.0, 1.0, 0.9);

    vec3 color = mix(lowColor, midColor, smoothstep(0.0, 0.5, vEnergy));
    color = mix(color, highColor, smoothstep(0.5, 1.0, vEnergy));

    float alpha = vAlpha * softEdge * (0.5 + vEnergy * 0.5);

    gl_FragColor = vec4(color, alpha);
  }
`;

export const magnetosphereVertexShader = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vFacing;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    vFacing = dot(vNormal, vViewDir);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const magnetosphereFragmentShader = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vFacing;
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uTime;

  void main() {
    float fresnel = 1.0 - abs(vFacing);
    float glow = pow(fresnel, 3.0) * uIntensity;

    // Shimmer effect
    float shimmer = sin(uTime * 2.0 + fresnel * 10.0) * 0.1 + 0.9;

    float alpha = glow * shimmer * 0.6;
    gl_FragColor = vec4(uColor, alpha);
  }
`;
