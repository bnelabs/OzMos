/**
 * Ultra-realistic GPU particle shaders for Solar Storm (CME) simulation.
 * Features:
 * - Volumetric CME cone with density-based opacity
 * - Per-particle magnetic deflection near planets
 * - Energy-dependent color (protons vs electrons)
 * - Heliospheric current sheet structure
 * - Realistic magnetosphere bow shock visualization
 */

// ============== CME Particle Shaders ==============

export const cmeVertexShader = `
  attribute float aEnergy;
  attribute float aStartTime;
  attribute vec3 aVelocity;
  attribute vec3 aOrigin;
  attribute float aType; // 0=proton, 1=electron, 2=helium

  uniform float uTime;
  uniform float uDuration;

  varying float vEnergy;
  varying float vAge;
  varying float vAlpha;
  varying float vType;
  varying float vSpeed;

  void main() {
    float age = uTime - aStartTime;
    vAge = age;
    vEnergy = aEnergy;
    vType = aType;

    if (age < 0.0 || age > uDuration) {
      gl_Position = vec4(0.0, 0.0, -999.0, 1.0);
      gl_PointSize = 0.0;
      vAlpha = 0.0;
      return;
    }

    float normalizedAge = age / uDuration;

    // Position: origin + velocity * age with realistic deceleration
    // CME slows as it expands through heliosphere
    float decel = 1.0 - normalizedAge * 0.25;
    vec3 pos = aOrigin + aVelocity * age * decel;

    // Magnetic field structure: particles follow spiral (Parker spiral)
    float spiralAngle = age * 0.15 * (1.0 + aEnergy * 0.5);
    float spiralRadius = 0.4 * aEnergy * sqrt(age);
    pos.x += sin(spiralAngle) * spiralRadius;
    pos.y += cos(spiralAngle) * spiralRadius * 0.3; // Compressed in ecliptic
    pos.z += cos(spiralAngle * 0.7) * spiralRadius * 0.2;

    // Heliospheric current sheet waviness
    float currentSheet = sin(atan(pos.z, pos.x) * 2.0 + uTime * 0.1) * 0.5;
    pos.y += currentSheet * normalizedAge * 0.5;

    vSpeed = length(aVelocity) * decel;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Size: electrons are smaller, protons medium, helium larger
    float baseSize = aType < 0.5 ? 2.0 : (aType < 1.5 ? 1.2 : 3.0);
    float distScale = 400.0 / length(mvPosition.xyz);
    float sizeDecay = 1.0 - normalizedAge * 0.3;
    gl_PointSize = clamp(baseSize * aEnergy * distScale * sizeDecay, 0.5, 16.0);

    // Fade: rapid brightening at shockfront, gradual fade
    float fadeIn = smoothstep(0.0, 0.03, normalizedAge);
    float fadeOut = 1.0 - smoothstep(0.6, 1.0, normalizedAge);
    float shockBrightening = 1.0 + smoothstep(0.0, 0.05, normalizedAge) *
                              smoothstep(0.15, 0.05, normalizedAge) * 2.0;
    vAlpha = fadeIn * fadeOut * shockBrightening;
  }
`;

export const cmeFragmentShader = `
  varying float vEnergy;
  varying float vAge;
  varying float vAlpha;
  varying float vType;
  varying float vSpeed;

  void main() {
    float dist = length(gl_PointCoord - vec2(0.5));
    if (dist > 0.5) discard;

    // Soft glow with hot core
    float core = 1.0 - smoothstep(0.0, 0.15, dist);
    float glow = 1.0 - smoothstep(0.1, 0.5, dist);
    float softEdge = core * 0.4 + glow * 0.6;

    // Particle-type based colors:
    // Protons: warm orange-white
    vec3 protonLow = vec3(1.0, 0.45, 0.1);
    vec3 protonMid = vec3(1.0, 0.75, 0.3);
    vec3 protonHigh = vec3(1.0, 0.95, 0.85);

    // Electrons: blue-white (faster, lighter)
    vec3 electronLow = vec3(0.4, 0.6, 1.0);
    vec3 electronMid = vec3(0.7, 0.85, 1.0);
    vec3 electronHigh = vec3(0.95, 0.97, 1.0);

    // Helium: golden
    vec3 heliumLow = vec3(1.0, 0.6, 0.15);
    vec3 heliumHigh = vec3(1.0, 0.85, 0.5);

    vec3 color;
    if (vType < 0.5) {
      // Proton
      color = mix(protonLow, protonMid, smoothstep(0.0, 0.5, vEnergy));
      color = mix(color, protonHigh, smoothstep(0.5, 1.0, vEnergy));
    } else if (vType < 1.5) {
      // Electron
      color = mix(electronLow, electronMid, smoothstep(0.0, 0.5, vEnergy));
      color = mix(color, electronHigh, smoothstep(0.5, 1.0, vEnergy));
    } else {
      // Helium
      color = mix(heliumLow, heliumHigh, vEnergy);
    }

    // Shock front brightening
    float shockGlow = core * vEnergy * 0.3;
    color += vec3(shockGlow);

    float alpha = vAlpha * softEdge * (0.4 + vEnergy * 0.6);
    gl_FragColor = vec4(color, alpha);
  }
`;

// ============== Magnetosphere Bow Shock Shaders ==============

export const magnetosphereVertexShader = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vFacing;
  varying vec3 vPosition;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
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
  varying vec3 vPosition;
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uTime;
  uniform float uImpactStrength; // 0-1, increases during CME impact

  // Simple noise for energy flow visualization
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

  void main() {
    float fresnel = 1.0 - abs(vFacing);

    // Energy flow patterns along field lines
    float flow = snoise(vPosition * 3.0 + vec3(0.0, uTime * 1.5, 0.0));
    float energyFlow = smoothstep(-0.3, 0.5, flow) * 0.4 + 0.6;

    // Base glow
    float glow = pow(fresnel, 2.5) * uIntensity;

    // Impact intensification: rippling shock waves
    float impactRipple = 0.0;
    if (uImpactStrength > 0.01) {
      float ripple = sin(vPosition.x * 8.0 - uTime * 5.0) *
                     sin(vPosition.y * 6.0 + uTime * 3.0) * 0.5 + 0.5;
      impactRipple = ripple * uImpactStrength * pow(fresnel, 1.5) * 0.6;
    }

    // Shimmer with energy flow
    float shimmer = sin(uTime * 2.0 + fresnel * 10.0 + flow * 5.0) * 0.08 + 0.92;

    float alpha = (glow * energyFlow + impactRipple) * shimmer;

    // Color shift during impact: more intense, slightly different hue
    vec3 color = uColor;
    if (uImpactStrength > 0.01) {
      vec3 impactColor = uColor * 1.5 + vec3(0.2, 0.1, 0.3) * uImpactStrength;
      color = mix(color, impactColor, uImpactStrength * 0.5);
    }

    // Add field-line-like streaks
    float fieldStreak = pow(abs(sin(vPosition.y * 12.0 + uTime * 0.5)), 8.0) * fresnel * 0.2;
    alpha += fieldStreak * uIntensity;

    gl_FragColor = vec4(color, alpha * 0.7);
  }
`;

// ============== Aurora Shader ==============

export const auroraVertexShader = `
  varying vec3 vPosition;
  varying vec3 vNormal;
  uniform float uTime;

  void main() {
    vPosition = position;
    vNormal = normalize(normalMatrix * normal);

    // Curtain-like wave motion
    vec3 pos = position;
    float wave = sin(position.x * 4.0 + uTime * 2.0) * 0.02 +
                 sin(position.z * 3.0 + uTime * 1.5) * 0.015;
    pos.y += wave;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

export const auroraFragmentShader = `
  varying vec3 vPosition;
  varying vec3 vNormal;
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3 uColor;

  void main() {
    // Curtain effect: vertical streaks
    float curtain = pow(abs(sin(vPosition.x * 20.0 + uTime * 3.0)), 0.5);
    float height = smoothstep(0.0, 1.0, abs(vPosition.y));

    // Shimmer
    float shimmer = sin(vPosition.x * 30.0 + uTime * 5.0) *
                    sin(vPosition.y * 15.0 - uTime * 2.0) * 0.3 + 0.7;

    // Color varies with height: green at base, purple/red at top
    vec3 baseColor = uColor;
    vec3 topColor = vec3(0.6, 0.1, 0.3);
    vec3 color = mix(baseColor, topColor, height * 0.5);

    float alpha = curtain * shimmer * uIntensity * (1.0 - height * 0.5);
    gl_FragColor = vec4(color, alpha * 0.6);
  }
`;
