/** Custom shader for photorealistic sun with corona and surface detail */

export const sunVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  uniform float uTime;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;

    // Subtle surface displacement for turbulence feel
    float displacement = sin(position.x * 3.0 + uTime * 0.5) *
                         sin(position.y * 3.0 + uTime * 0.3) *
                         sin(position.z * 3.0 + uTime * 0.7) * 0.02;

    vec3 newPos = position + normal * displacement;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
  }
`;

export const sunFragmentShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  uniform float uTime;

  // Simplex-like noise
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i  = floor(v + dot(v, C.yyy));
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
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    for (int i = 0; i < 6; i++) {
      value += amplitude * snoise(p * frequency);
      amplitude *= 0.5;
      frequency *= 2.0;
    }
    return value;
  }

  void main() {
    vec3 pos = vPosition * 2.0;

    // Multi-layered turbulence
    float t = uTime * 0.15;
    float noise1 = fbm(pos + vec3(t * 0.3, t * 0.1, t * 0.2));
    float noise2 = fbm(pos * 2.0 + vec3(t * 0.5, -t * 0.2, t * 0.4));
    float noise3 = fbm(pos * 4.0 + vec3(-t * 0.1, t * 0.6, -t * 0.3));

    float combined = noise1 * 0.5 + noise2 * 0.3 + noise3 * 0.2;

    // Sun color palette
    vec3 darkSpot = vec3(0.8, 0.2, 0.0);
    vec3 midColor = vec3(1.0, 0.6, 0.1);
    vec3 brightColor = vec3(1.0, 0.95, 0.7);
    vec3 hotColor = vec3(1.0, 1.0, 0.9);

    // Color based on noise
    float t1 = smoothstep(-0.4, 0.0, combined);
    float t2 = smoothstep(0.0, 0.3, combined);
    float t3 = smoothstep(0.3, 0.6, combined);

    vec3 color = mix(darkSpot, midColor, t1);
    color = mix(color, brightColor, t2);
    color = mix(color, hotColor, t3);

    // Limb darkening
    float fresnel = dot(vNormal, vec3(0.0, 0.0, 1.0));
    float limb = pow(max(fresnel, 0.0), 0.4);
    color *= mix(0.3, 1.0, limb);

    // Emission intensity
    float brightness = 1.2 + combined * 0.3;

    gl_FragColor = vec4(color * brightness, 1.0);
  }
`;

export const coronaVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const coronaFragmentShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  uniform float uTime;

  void main() {
    float fresnel = 1.0 - dot(vNormal, vec3(0.0, 0.0, 1.0));
    float glow = pow(fresnel, 3.0);

    // Pulsating corona
    float pulse = sin(uTime * 0.5) * 0.1 + 0.9;

    vec3 innerColor = vec3(1.0, 0.8, 0.3);
    vec3 outerColor = vec3(1.0, 0.3, 0.05);
    vec3 color = mix(innerColor, outerColor, fresnel);

    float alpha = glow * 0.6 * pulse;

    gl_FragColor = vec4(color, alpha);
  }
`;

/** Volumetric corona shell shaders — Fresnel-based glow on concentric BackSide spheres */
export const coronaShellVertexShader = `
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const coronaShellFragmentShader = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uColor;

  void main() {
    // Fresnel: stronger glow at edges (BackSide means normals point inward)
    float fresnel = 1.0 - abs(dot(vNormal, vViewDir));
    float glow = pow(fresnel, 2.5);

    // Subtle pulse
    float pulse = sin(uTime * 0.4) * 0.08 + 0.92;

    float alpha = glow * uOpacity * pulse;

    gl_FragColor = vec4(uColor, alpha);
  }
`;
