/**
 * FlybyMode — cinematic spacecraft flyby of a selected planetary body.
 *
 * Trajectory: asymmetric gravity-assist hyperbolic arc (7 control points).
 * Spacecraft: Voyager-style science probe — flat bus, large HGA dish, wide solar panels.
 * Camera: choreographed in 5 phases; planet fills frame during close pass.
 * Duration: 32 seconds.
 */
import * as THREE from 'three';
import { t } from '../i18n/i18n.js';
import { escapeHTML } from '../utils/sanitize.js';

const TOTAL_DURATION = 32; // seconds

export class FlybyMode {
  /**
   * @param {THREE.Scene}  scene
   * @param {THREE.Camera} camera
   * @param {object}       controls  — OrbitControls instance
   * @param {object}       audioManager
   * @param {function}     announceFn
   */
  constructor(scene, camera, controls, audioManager, announceFn) {
    this._scene    = scene;
    this._camera   = camera;
    this._controls = controls;
    this._audio    = audioManager;
    this._announce = announceFn || (() => {});

    this._active  = false;
    this._paused  = false;
    this._elapsed = 0;
    this._bodyKey = null;
    this._bodyPos = new THREE.Vector3();
    this._radius  = 5;

    this._craftGroup = null;
    this._spline     = null;

    this._savedCamPos   = new THREE.Vector3();
    this._savedTarget   = new THREE.Vector3();
    this._savedFOV      = 60;
    this._savedControls = false;

    this._hudEl       = null;
    this._pauseBtn    = null;
    this._repeatBtn   = null;
    this._exitBtn     = null;
    this._elapsedEl   = null;
    this._langListener = null;

    // Scratch quaternion for orientation
    this._q = new THREE.Quaternion();

    this._boundKeydown = (e) => this._onKeydown(e);
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  get isActive() { return this._active; }

  startFlyby(bodyKey, bodyWorldPos, radius) {
    if (this._active) this._cleanup();

    this._bodyKey = bodyKey;
    this._bodyPos.copy(bodyWorldPos);
    this._radius  = Math.max(radius || 5, 3);
    this._elapsed = 0;
    this._paused  = false;
    this._active  = true;

    // Save camera state
    this._savedCamPos.copy(this._camera.position);
    this._savedTarget.copy(this._controls.target);
    this._savedFOV      = this._camera.fov;
    this._savedControls = this._controls.enabled;
    this._controls.enabled = false;

    // Build probe and trajectory
    this._craftGroup = this._buildSpacecraft();
    this._scene.add(this._craftGroup);
    this._spline = this._buildSpline();

    // Place craft at start, orient toward travel direction
    const startPt  = this._spline.getPoint(0);
    const startTan = this._spline.getTangent(0).normalize();
    this._craftGroup.position.copy(startPt);
    this._orientCraft(startTan);

    // Position camera far behind craft for the reveal
    const camStart = startPt.clone()
      .sub(startTan.clone().multiplyScalar(12))
      .addScaledVector(new THREE.Vector3(0, 1, 0), 4);
    this._camera.position.copy(camStart);
    this._camera.lookAt(startPt);

    this._showHUD();
    this._showLetterbox(true);

    if (this._audio) this._audio.setContext('flyby');
    document.addEventListener('keydown', this._boundKeydown);
    this._announce(t('flyby.started') || 'Flyby started');
    document.dispatchEvent(new CustomEvent('flyby-started', { detail: { bodyKey } }));
  }

  update(delta) {
    if (!this._active || !this._spline) return;
    if (this._paused) return;

    this._elapsed += delta;
    const t0 = Math.min(this._elapsed / TOTAL_DURATION, 1);

    const craftPt = this._spline.getPoint(t0);
    const tangent = this._spline.getTangent(t0).normalize();

    this._craftGroup.position.copy(craftPt);
    this._orientCraft(tangent);

    this._updateCamera(t0, craftPt, tangent);

    if (this._elapsedEl) {
      const rem = Math.max(0, TOTAL_DURATION - this._elapsed);
      this._elapsedEl.textContent = rem.toFixed(1) + 's';
    }

    if (this._elapsed >= TOTAL_DURATION) this._onEnd();

    // Update descent mode if active
    this.updateDescent(this._camera, delta);
  }

  pause()       { this._paused = true; }
  resume()      { this._paused = false; }
  togglePause() { if (this._paused) this.resume(); else this.pause(); }

  repeat() {
    this._elapsed = 0;
    this._paused  = false;
  }

  exit() {
    if (!this._active) return;
    this._cleanup();
    document.dispatchEvent(new CustomEvent('flyby-ended'));
    this._announce(t('flyby.ended') || 'Flyby ended');
  }

  // ─── Trajectory ─────────────────────────────────────────────────────────

  _buildSpline() {
    const p = this._bodyPos;
    const r = this._radius;

    // Gravity-assist hyperbolic arc:
    //  Approach from upper-left (inner solar system)
    //  Periapsis skims the planet at ~2× radius
    //  Exit deflected ~60° — classic slingshot geometry
    const pts = [
      new THREE.Vector3(p.x - 270, p.y + 55,       p.z - 240),         // P0  deep-space approach
      new THREE.Vector3(p.x - 105, p.y + 22,        p.z - 92),          // P1  entering sphere of influence
      new THREE.Vector3(p.x - r * 2.6, p.y + r * 0.4, p.z - r * 0.5),  // P2  strong inbound leg
      new THREE.Vector3(p.x + r * 0.2, p.y - r * 0.3, p.z + r * 2.2),  // P3  periapsis — closest pass
      new THREE.Vector3(p.x + r * 2.4, p.y + r * 0.5, p.z + r * 0.7),  // P4  outbound, gravity-deflected
      new THREE.Vector3(p.x + 115,  p.y + 18,       p.z + 58),          // P5  leaving sphere of influence
      new THREE.Vector3(p.x + 275,  p.y + 52,       p.z + 140),         // P6  deep-space exit
    ];

    return new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
  }

  // ─── Camera choreography ────────────────────────────────────────────────

  _updateCamera(t0, craftPt, tangent) {
    const elapsed = t0 * TOTAL_DURATION;

    // Axes relative to spacecraft heading
    const worldUp = new THREE.Vector3(0, 1, 0);
    const right   = new THREE.Vector3().crossVectors(tangent, worldUp).normalize();
    const craftUp = new THREE.Vector3().crossVectors(right, tangent).normalize();

    const toPlanet     = this._bodyPos.clone().sub(craftPt);
    const distToPlanet = toPlanet.length();
    const toPlanetNorm = toPlanet.clone().normalize();

    let targetCamPos, lookTarget;

    if (elapsed < 8) {
      // ── Approach: behind and above craft, planet a growing disc ──
      const t_ = elapsed / 8;
      targetCamPos = craftPt.clone()
        .sub(tangent.clone().multiplyScalar(8 - t_ * 2))
        .addScaledVector(craftUp, 2.5 - t_ * 0.5);
      // Blend look target from ahead-of-craft toward planet
      lookTarget = craftPt.clone().lerp(this._bodyPos, t_ * 0.25);

    } else if (elapsed < 14) {
      // ── Drop-in: camera swings to reveal the planet looming ──
      const t_ = (elapsed - 8) / 6;
      const behind = tangent.clone().negate().multiplyScalar(5 - t_ * 1.5);
      const swing  = right.clone().multiplyScalar(t_ * 2);
      targetCamPos = craftPt.clone().add(behind).add(swing)
        .addScaledVector(craftUp, 2 + t_ * 0.3);
      lookTarget = craftPt.clone().lerp(this._bodyPos, t_ * 0.55);

    } else if (elapsed < 20) {
      // ── Close pass: camera shows planet filling the frame ──
      // Position camera on the "outward" side of the spacecraft so the planet
      // is in the lower/background portion of the shot.
      const awayFromPlanet = toPlanetNorm.clone().negate().multiplyScalar(3.8);
      const behind         = tangent.clone().negate().multiplyScalar(3);
      targetCamPos = craftPt.clone().add(awayFromPlanet).add(behind)
        .addScaledVector(craftUp, 0.8);
      // Look at a point 60% of the way between craft and planet surface
      lookTarget = craftPt.clone().add(toPlanetNorm.clone().multiplyScalar(distToPlanet * 0.6));

    } else if (elapsed < 26) {
      // ── Pull-away: camera drifts back behind, planet shrinking ──
      const t_ = (elapsed - 20) / 6;
      const awayFromPlanet = toPlanetNorm.clone().negate().multiplyScalar(3.8 - t_ * 1.5);
      const behind         = tangent.clone().negate().multiplyScalar(3 + t_ * 3);
      targetCamPos = craftPt.clone().add(awayFromPlanet).add(behind)
        .addScaledVector(craftUp, 0.8 + t_ * 1.5);
      lookTarget = craftPt.clone().lerp(this._bodyPos, (1 - t_) * 0.4);

    } else {
      // ── Exit: wide shot, spacecraft receding into black ──
      const t_ = (elapsed - 26) / 6;
      targetCamPos = craftPt.clone()
        .sub(tangent.clone().multiplyScalar(9))
        .addScaledVector(craftUp, 3 + t_);
      lookTarget = craftPt.clone().lerp(this._bodyPos, 0.12);
    }

    // FOV: wide (58°) → tight (32°) during close pass → wide again
    let targetFOV = 58;
    if (elapsed >= 8  && elapsed < 14) targetFOV = 58 - ((elapsed - 8)  / 6) * 26;
    else if (elapsed >= 14 && elapsed < 20) targetFOV = 32;
    else if (elapsed >= 20 && elapsed < 26) targetFOV = 32 + ((elapsed - 20) / 6) * 26;

    this._camera.fov += (targetFOV - this._camera.fov) * 0.07;
    this._camera.updateProjectionMatrix();

    this._camera.position.lerp(targetCamPos, 0.06);
    this._camera.lookAt(lookTarget);
  }

  // ─── Spacecraft ──────────────────────────────────────────────────────────

  /**
   * Orient the spacecraft group so its +Z axis points in the forward (tangent)
   * direction, with the dish (+Y) kept roughly "up".
   */
  _orientCraft(tangent) {
    // +Z → forward (tangent direction)
    // +Y → approximate world up, corrected to be perpendicular to tangent
    const worldUp   = new THREE.Vector3(0, 1, 0);
    const right     = new THREE.Vector3().crossVectors(tangent, worldUp).normalize();
    const corrUp    = new THREE.Vector3().crossVectors(right, tangent).normalize();
    // Build rotation matrix: X=right, Y=corrUp, Z=tangent
    const m = new THREE.Matrix4().makeBasis(right, corrUp, tangent);
    this._craftGroup.setRotationFromMatrix(m);
  }

  /**
   * Voyager-style science probe:
   *   • Flat 10-sided bus (approximated as a bevelled box)
   *   • Large parabolic HGA dish mounted above, open face down
   *   • Two wide solar-panel arrays extending in ±X
   *   • Science boom pointing forward (+Z)
   *   • RTG power source on side boom
   *   • Magnetometer on opposite boom
   *   • Thruster cluster at rear (−Z)
   */
  _buildSpacecraft() {
    const group = new THREE.Group();

    const silver = new THREE.MeshStandardMaterial({ color: 0xd2dae4, metalness: 0.88, roughness: 0.22 });
    const darkPV = new THREE.MeshStandardMaterial({ color: 0x192040, metalness: 0.35, roughness: 0.80, side: THREE.DoubleSide });
    const gold   = new THREE.MeshStandardMaterial({ color: 0xc8a030, metalness: 0.90, roughness: 0.22 });
    const dim    = new THREE.MeshStandardMaterial({ color: 0xa0aab8, metalness: 0.78, roughness: 0.38 });

    // ── Main bus ─────────────────────────────────────────────────────────
    // Flat box body (wide & shallow, clearly not a missile)
    const bus = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.09, 0.30), silver);
    group.add(bus);

    // ── HGA dish (dominant visual element) ───────────────────────────────
    // Hemisphere: open face downward, mounted above bus on a strut
    const dishGeo = new THREE.SphereGeometry(0.36, 32, 14, 0, Math.PI * 2, 0, Math.PI * 0.48);
    const dish = new THREE.Mesh(dishGeo, silver);
    dish.rotation.x = Math.PI;   // open face down
    dish.position.set(0, 0.21, 0.02);
    group.add(dish);

    // Dish feed horn at focus point
    const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.020, 0.06, 8), dim);
    horn.position.set(0, 0.18, 0.02);
    group.add(horn);

    // Strut connecting dish to bus
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.013, 0.13, 8), dim);
    strut.position.set(0, 0.10, 0.02);
    group.add(strut);

    // ── Solar panels ─────────────────────────────────────────────────────
    for (const side of [-1, 1]) {
      // Main panel (dark photovoltaic surface)
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.014, 0.24), darkPV);
      panel.position.set(side * 0.59, 0.005, 0.00);
      group.add(panel);

      // Silver frame
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(0.84, 0.020, 0.26),
        new THREE.MeshStandardMaterial({ color: 0x7080a0, metalness: 0.70, roughness: 0.45 })
      );
      frame.position.copy(panel.position);
      group.add(frame);

      // Hinge bracket where panel meets bus
      const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.06, 8), silver);
      hinge.rotation.z = Math.PI / 2;
      hinge.position.set(side * 0.21, 0.00, 0.00);
      group.add(hinge);
    }

    // ── Science boom (points forward along +Z) ───────────────────────────
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.52, 6), dim);
    boom.rotation.x = Math.PI / 2;              // lay along Z axis
    boom.position.set(0.06, 0.02, 0.36);        // extends forward from bus
    group.add(boom);

    // Instrument package at boom tip
    const inst = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.038, 0.055), silver);
    inst.position.set(0.06, 0.02, 0.62);
    group.add(inst);

    // ── RTG power source ─────────────────────────────────────────────────
    // Short boom extending in +X with gold RTG cylinder at end
    const rtgBoom = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.40, 6), silver);
    rtgBoom.rotation.z = Math.PI / 2;
    rtgBoom.position.set(0.25, -0.05, 0.14);
    group.add(rtgBoom);

    const rtg = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.14, 10), gold);
    rtg.rotation.z = Math.PI / 2;
    rtg.position.set(0.48, -0.06, 0.14);
    group.add(rtg);

    // ── Magnetometer boom (−X side, thinner) ─────────────────────────────
    const magBoom = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.38, 6), dim);
    magBoom.rotation.z = Math.PI / 2;
    magBoom.position.set(-0.24, 0.03, 0.12);
    group.add(magBoom);

    const magHead = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), dim);
    magHead.position.set(-0.46, 0.03, 0.12);
    group.add(magHead);

    // ── Thruster cluster (rear face, −Z) ─────────────────────────────────
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.042, 6), silver);
      nozzle.rotation.x = -Math.PI / 2;   // opens toward −Z (rear)
      nozzle.position.set(Math.cos(a) * 0.055, Math.sin(a) * 0.035, -0.18);
      group.add(nozzle);
    }

    // ── Engine glow sprite (rear) ─────────────────────────────────────────
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = 64; glowCanvas.height = 64;
    const gCtx = glowCanvas.getContext('2d');
    const grad = gCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0,   'rgba(180,230,255,0.90)');
    grad.addColorStop(0.4, 'rgba(80, 160,255,0.50)');
    grad.addColorStop(1,   'rgba(0,  60, 255,0)');
    gCtx.fillStyle = grad;
    gCtx.fillRect(0, 0, 64, 64);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map:         new THREE.CanvasTexture(glowCanvas),
      transparent: true,
      blending:    THREE.AdditiveBlending,
      depthWrite:  false,
    }));
    glow.scale.set(0.45, 0.45, 1);
    glow.position.set(0, 0, -0.26);
    group.add(glow);

    group.scale.setScalar(0.42);
    return group;
  }

  // ─── HUD & Letterbox ─────────────────────────────────────────────────────

  _showHUD() {
    this._hudEl = document.getElementById('flyby-hud');
    if (!this._hudEl) return;
    this._hudEl.classList.remove('hidden');
    this._hudEl.setAttribute('aria-hidden', 'false');

    this._exitBtn   = this._hudEl.querySelector('#flyby-exit');
    this._elapsedEl = this._hudEl.querySelector('#flyby-elapsed');

    if (this._exitBtn) {
      this._exitBtn.onclick = () => this.exit();
    }

    this._refreshHUDLabels();

    this._langListener = () => this._refreshHUDLabels();
    window.addEventListener('langchange', this._langListener);
  }

  _refreshHUDLabels() {
    if (this._exitBtn) {
      this._exitBtn.textContent = t('flyby.exit') || 'Exit';
    }
  }

  _hideHUD() {
    if (!this._hudEl) return;
    this._hudEl.classList.add('hidden');
    this._hudEl.setAttribute('aria-hidden', 'true');
    this._hudEl = null;
  }

  _showLetterbox(visible) {
    const lb = document.getElementById('flyby-letterbox');
    if (lb) lb.classList.toggle('active', visible);
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────

  _onEnd() {
    this._paused = true;
    setTimeout(() => { if (this._active) this.exit(); }, 4000);
  }

  _cleanup() {
    this._active = false;
    this._paused = false;

    if (this._craftGroup) {
      this._scene.remove(this._craftGroup);
      this._craftGroup.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
          } else {
            if (obj.material.map) obj.material.map.dispose();
            obj.material.dispose();
          }
        }
      });
      this._craftGroup = null;
    }

    this._camera.position.copy(this._savedCamPos);
    this._controls.target.copy(this._savedTarget);
    this._camera.fov = this._savedFOV;
    this._camera.updateProjectionMatrix();
    this._controls.enabled = this._savedControls;

    this._hideHUD();
    this._showLetterbox(false);
    document.removeEventListener('keydown', this._boundKeydown);
    if (this._langListener) {
      window.removeEventListener('langchange', this._langListener);
      this._langListener = null;
    }
    this._bodyKey = null;
    this._spline  = null;
  }

  // ─── Keyboard ────────────────────────────────────────────────────────────

  _onKeydown(e) {
    if (!this._active) return;
    if (e.key === 'Escape') { e.preventDefault(); this.exit(); }
    if (e.key === ' ')      { e.preventDefault(); this.togglePause(); }
  }

  // ─── Surface Descent Mode ────────────────────────────────────────────────

  startDescentMode(bodyKey, bodyWorldPos, radius) {
    if (this._descentActive) return;
    this._descentActive = true;
    this._descentTime = 0;
    this._descentDuration = 45;
    this._descentBody = bodyKey;
    this._descentRadius = radius;
    this._descentPos = bodyWorldPos.clone();

    // Fog density lerp state
    this._descentFogStart = 0;

    // Cloud particles (100 billboard quads)
    const cloudGroup = new THREE.Group();
    for (let i = 0; i < 100; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.5) * Math.PI * 0.6;
      const r = radius * (1.1 + Math.random() * 0.4);
      const geo = new THREE.PlaneGeometry(radius * 0.15, radius * 0.08);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const plane = new THREE.Mesh(geo, mat);
      plane.position.set(
        r * Math.cos(theta) * Math.cos(phi) + bodyWorldPos.x,
        r * Math.sin(phi) + bodyWorldPos.y,
        r * Math.sin(theta) * Math.cos(phi) + bodyWorldPos.z
      );
      plane.lookAt(bodyWorldPos);
      cloudGroup.add(plane);
    }
    if (this._scene) this._scene.add(cloudGroup);
    this._descentClouds = cloudGroup;

    // Altitude HUD
    const hud = document.createElement('div');
    hud.id = 'descent-hud';
    hud.style.cssText = 'position:fixed;top:80px;right:24px;background:rgba(0,10,20,0.85);border:1px solid rgba(100,180,255,0.4);border-radius:10px;padding:14px 20px;color:#99ccff;font-family:monospace;font-size:0.82rem;z-index:700;min-width:180px;';
    const PLANET_SURFACE = {
      earth: { temp: '15°C', pressure: '1 atm', color: '#4a90d9' },
      venus: { temp: '465°C', pressure: '90 atm', color: '#e8a040' },
      mars: { temp: '-65°C', pressure: '0.006 atm', color: '#c1440e' },
      jupiter: { temp: '-108°C (cloud top)', pressure: '1 atm (cloud top)', color: '#c8a878' },
      saturn: { temp: '-139°C (cloud top)', pressure: '1 atm (cloud top)', color: '#e8d8a0' },
      titan: { temp: '-179°C', pressure: '1.5 atm', color: '#c8a060' },
      default: { temp: 'Unknown', pressure: 'Unknown', color: '#8888aa' },
    };
    const surfData = PLANET_SURFACE[bodyKey] || PLANET_SURFACE.default;
    hud.innerHTML = `
      <div style="font-size:0.95rem;font-weight:bold;color:${surfData.color};margin-bottom:8px;">DESCENT: ${bodyKey.toUpperCase()}</div>
      <div id="descent-alt">Altitude: ---</div>
      <div id="descent-pressure">Pressure: ${surfData.pressure}</div>
      <div id="descent-temp">Surface temp: ${surfData.temp}</div>
      <div style="margin-top:10px;">
        <button id="descent-exit" style="background:rgba(255,80,80,0.2);border:1px solid #f44;color:#f99;border-radius:6px;padding:4px 12px;cursor:pointer;font-size:0.8rem;">Exit Descent</button>
      </div>`;
    document.body.appendChild(hud);
    this._descentHud = hud;
    document.getElementById('descent-exit')?.addEventListener('click', () => this.stopDescentMode());
  }

  stopDescentMode() {
    if (!this._descentActive) return;
    this._descentActive = false;
    if (this._descentClouds && this._scene) {
      this._scene.remove(this._descentClouds);
      this._descentClouds.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
      this._descentClouds = null;
    }
    if (this._descentHud) { this._descentHud.remove(); this._descentHud = null; }
    // Reset fog if the scene has it
    if (this._scene && this._scene.fog) this._scene.fog.density = 0;
  }

  updateDescent(camera, delta) {
    if (!this._descentActive) return;
    this._descentTime += delta;
    const t = this._descentTime / this._descentDuration;

    const bodyPos = this._descentPos;
    const r = this._descentRadius;

    if (t < 1) {
      // Phase 1 (0-10s): Approach from above
      if (this._descentTime < 10) {
        const phase = this._descentTime / 10;
        const startDist = r * 8;
        const endDist = r * 2;
        const dist = startDist + (endDist - startDist) * phase;
        camera.position.set(
          bodyPos.x + dist * Math.cos(phase * 0.5),
          bodyPos.y + dist * (1 - phase * 0.7),
          bodyPos.z + dist * Math.sin(phase * 0.5)
        );
        camera.lookAt(bodyPos);
      }
      // Phase 2 (10-25s): Cloud penetration — increase fog
      else if (this._descentTime < 25) {
        const phase = (this._descentTime - 10) / 15;
        const dist = r * 2 - r * 1.5 * phase;
        camera.position.set(
          bodyPos.x + dist * Math.cos(this._descentTime * 0.1),
          bodyPos.y + dist * 0.3,
          bodyPos.z + dist * Math.sin(this._descentTime * 0.1)
        );
        camera.lookAt(bodyPos);

        // Increase fog
        if (this._scene && !this._scene.fog) {
          this._scene.fog = new THREE.FogExp2(0x88aacc, 0);
        }
        if (this._scene && this._scene.fog) {
          this._scene.fog.density = phase * 0.04;
        }

        // Fade in clouds
        if (this._descentClouds) {
          this._descentClouds.traverse(obj => {
            if (obj.material) obj.material.opacity = phase * 0.4;
          });
        }
      }
      // Phase 3 (25-45s): Surface / Deep
      else {
        const phase = (this._descentTime - 25) / 20;
        const dist = r * 0.5 - r * 0.3 * phase;
        camera.position.set(
          bodyPos.x + dist * Math.cos(this._descentTime * 0.15),
          bodyPos.y + r * 0.1,
          bodyPos.z + dist * Math.sin(this._descentTime * 0.15)
        );
        camera.lookAt(bodyPos);

        // Reduce fog slightly near surface (haze clears)
        if (this._scene && this._scene.fog) {
          this._scene.fog.density = 0.04 - phase * 0.02;
        }
      }

      // Update altitude HUD
      const camDist = camera.position.distanceTo(bodyPos);
      const altScene = Math.max(0, camDist - r);
      // Scale: 1 scene unit ≈ 1000km for Earth-sized
      const altKm = Math.round(altScene * 1000);
      const altEl = document.getElementById('descent-alt');
      if (altEl) altEl.textContent = `Altitude: ${altKm.toLocaleString()} km`;
    }

    if (this._descentTime >= this._descentDuration) {
      this.stopDescentMode();
    }
  }
}
