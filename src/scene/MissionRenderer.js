/**
 * Renders mission trajectories in the 3D scene using real orbital mechanics.
 * Spacecraft animate along historically accurate paths based on Keplerian positions.
 */
import * as THREE from 'three';
import '../styles/missions.css';
import { MISSIONS } from '../data/missions.js';
import {
  getMissionTrajectory,
  getMissionDateAtProgress,
  getWaypointProgressPositions,
  getPlanetPosition,
} from './OrbitalMechanics.js';

export class MissionRenderer {
  constructor(scene) {
    this.scene = scene;
    this.trajectoryGroup = new THREE.Group();
    this.scene.add(this.trajectoryGroup);
    this.activeMission = null;
    this.spacecraft = null;
    this.trajectoryLine = null;
    this.curve = null;
    this.animationProgress = 0;
    this.isPlaying = false;
    this.playbackSpeed = 1;
    this.waypointMarkers = [];
    this.waypointProgressPositions = [];
    this.lastWaypointIndex = -1;
    this.cameraFollowEnabled = false;
    this._followCamera = null;
    this._followControls = null;

    // Epoch planet ghost spheres
    this._epochMeshes = [];
    // DOM timeline strip
    this._timelineStrip = null;

    // Event callbacks
    this.onWaypointReached = null;
    this.onProgressUpdate = null;
  }

  /**
   * Show trajectory for a mission using real orbital positions.
   * No longer needs a getPlanetWorldPos callback.
   */
  showMission(missionId) {
    this.clearMission();
    const mission = MISSIONS.find(m => m.id === missionId);
    if (!mission) return;

    this.activeMission = mission;

    // Compute real trajectory from Keplerian orbital mechanics
    const { points, waypointIndices, dates, waypointDates } = getMissionTrajectory(missionId);
    if (points.length < 2) return;

    this.trajectoryDates = dates;
    this.waypointIndices = waypointIndices;
    this.waypointProgressPositions = getWaypointProgressPositions(missionId);

    // Create smooth curve through all points
    this.curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.3);
    const curvePoints = this.curve.getPoints(400);

    // Core trajectory line — bright, clearly visible
    const lineGeo = new THREE.BufferGeometry().setFromPoints(curvePoints);
    const lineMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(mission.color),
      transparent: true,
      opacity: 0.5,
      linewidth: 1,
    });
    this.trajectoryLine = new THREE.Line(lineGeo, lineMat);
    this.trajectoryGroup.add(this.trajectoryLine);

    // Wide outer glow tube — fat enough to read against the black void
    const tubeGeo = new THREE.TubeGeometry(this.curve, 300, 0.16, 8, false);
    const tubeMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(mission.color),
      transparent: true,
      opacity: 0.15,
    });
    const tube = new THREE.Mesh(tubeGeo, tubeMat);
    this.trajectoryGroup.add(tube);

    // Ultra-thin inner bright tube for the glowing core
    const innerGeo = new THREE.TubeGeometry(this.curve, 300, 0.06, 6, false);
    const innerMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(mission.color),
      transparent: true,
      opacity: 0.35,
    });
    this.trajectoryGroup.add(new THREE.Mesh(innerGeo, innerMat));

    // Waypoint markers (glowing spheres at flyby positions)
    this.waypointMarkers = [];
    for (let i = 0; i < waypointIndices.length; i++) {
      const idx = waypointIndices[i];
      const pos = points[Math.min(idx, points.length - 1)];

      const markerGeo = new THREE.SphereGeometry(0.35, 16, 16);
      const markerMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(mission.color),
        transparent: true,
        opacity: 0.7,
      });
      const marker = new THREE.Mesh(markerGeo, markerMat);
      marker.position.copy(pos);
      this.trajectoryGroup.add(marker);

      // Outer glow ring
      const glowGeo = new THREE.RingGeometry(0.4, 0.7, 32);
      const glowMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(mission.color),
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
      });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.copy(pos);
      glow.lookAt(0, 0, 0);
      this.trajectoryGroup.add(glow);

      this.waypointMarkers.push({ marker, glow, pos });
    }

    // Mission-specific spacecraft
    this.spacecraft = this._createSpacecraftMesh(mission.id, new THREE.Color(mission.color));
    this.spacecraft.position.copy(points[0]);
    this.trajectoryGroup.add(this.spacecraft);

    // Pulsing "current position" indicator
    const nowGeo = new THREE.SphereGeometry(0.25, 12, 12);
    const nowMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
    });
    this._nowIndicator = new THREE.Mesh(nowGeo, nowMat);
    this._nowIndicator.position.copy(points[0]);
    this.trajectoryGroup.add(this._nowIndicator);
    this._nowPulse = 0;

    // Show ghost spheres for planets at launch date
    this._showEpochPlanets(mission);

    // Show DOM timeline strip with mission phases
    this._createTimelineStrip(mission);

    this.animationProgress = 0;
    this.lastWaypointIndex = -1;
  }

  /**
   * Animate spacecraft along trajectory.
   * Progress is mapped to mission timeline.
   */
  update(delta) {
    if (!this.curve || !this.spacecraft) return null;

    if (this.isPlaying) {
      // Speed: full mission in ~60 seconds at 1x speed (slower, more cinematic)
      this.animationProgress += delta * (1 / 60) * this.playbackSpeed;
      if (this.animationProgress > 1) {
        this.animationProgress = 1;
        this.isPlaying = false;
      }
    }

    // Move spacecraft along curve
    const point = this.curve.getPoint(this.animationProgress);
    this.spacecraft.position.copy(point);

    // Update "now" indicator position and pulse
    if (this._nowIndicator && this.curve) {
      this._nowIndicator.position.copy(point);
      this._nowPulse = (this._nowPulse || 0) + delta * 2;
      this._nowIndicator.material.opacity = 0.5 + 0.4 * Math.abs(Math.sin(this._nowPulse));
    }

    // Orient spacecraft along path
    const tangent = this.curve.getTangent(this.animationProgress);
    if (tangent.length() > 0.001) {
      this.spacecraft.lookAt(point.clone().add(tangent));
    }

    // Pulse waypoint markers when nearby
    for (let i = 0; i < this.waypointMarkers.length; i++) {
      const wm = this.waypointMarkers[i];
      const dist = point.distanceTo(wm.pos);
      const nearThreshold = 3;
      if (dist < nearThreshold) {
        const pulse = 0.8 + Math.sin(Date.now() * 0.005) * 0.2;
        wm.marker.material.opacity = pulse;
        wm.glow.material.opacity = 0.4 * pulse;
        wm.marker.scale.setScalar(1.2);
      } else {
        wm.marker.material.opacity = 0.5;
        wm.glow.material.opacity = 0.15;
        wm.marker.scale.setScalar(1.0);
      }
    }

    // Check waypoint crossing
    const currentWpIdx = this._getCurrentWaypointIndex();
    if (currentWpIdx !== this.lastWaypointIndex && currentWpIdx >= 0) {
      this.lastWaypointIndex = currentWpIdx;
      if (this.onWaypointReached) {
        this.onWaypointReached(currentWpIdx, this.activeMission.waypoints[currentWpIdx]);
      }
    }

    // Smoother camera follow with gentle roll
    if (this.cameraFollowEnabled && this._followCamera && this._followControls) {
      const cameraOffset = tangent.clone().multiplyScalar(-8).add(new THREE.Vector3(0, 3, 0));

      // Subtle roll from binormal (cross product of tangent and up)
      const up = new THREE.Vector3(0, 1, 0);
      const binormal = new THREE.Vector3().crossVectors(tangent, up).normalize();
      const rollAmount = Math.sin(this.animationProgress * Math.PI * 4) * 0.03;
      cameraOffset.add(binormal.multiplyScalar(rollAmount * 2));

      const targetCamPos = point.clone().add(cameraOffset);
      const lerpPos = Math.min(0.06 * Math.max(1, this.playbackSpeed), 0.55);
      const lerpTgt = Math.min(0.08 * Math.max(1, this.playbackSpeed), 0.65);
      this._followCamera.position.lerp(targetCamPos, lerpPos);
      this._followControls.target.lerp(point, lerpTgt);
    }

    // Update timeline strip active phase
    this.updateTimelineProgress(this.animationProgress);

    // Emit progress update
    if (this.onProgressUpdate) {
      const currentDate = getMissionDateAtProgress(this.activeMission.id, this.animationProgress);
      this.onProgressUpdate(this.animationProgress, currentDate, currentWpIdx);
    }

    return this.animationProgress;
  }

  /**
   * Determine which waypoint we're closest to based on progress.
   */
  _getCurrentWaypointIndex() {
    if (!this.waypointProgressPositions.length) return -1;
    for (let i = this.waypointProgressPositions.length - 1; i >= 0; i--) {
      if (this.animationProgress >= this.waypointProgressPositions[i] - 0.01) {
        return i;
      }
    }
    return 0;
  }

  /**
   * Jump to a specific point in the timeline.
   */
  seekTo(progress) {
    this.animationProgress = Math.max(0, Math.min(1, progress));
    // Force an immediate position update
    if (this.curve && this.spacecraft) {
      const point = this.curve.getPoint(this.animationProgress);
      this.spacecraft.position.copy(point);
      const tangent = this.curve.getTangent(this.animationProgress);
      if (tangent.length() > 0.001) {
        this.spacecraft.lookAt(point.clone().add(tangent));
      }
    }
    this.updateTimelineProgress(this.animationProgress);
  }

  /**
   * Enable camera follow mode.
   */
  setCameraFollow(camera, controls) {
    this._followCamera = camera;
    this._followControls = controls;
  }

  toggleCameraFollow() {
    this.cameraFollowEnabled = !this.cameraFollowEnabled;
    return this.cameraFollowEnabled;
  }

  play() { this.isPlaying = true; }
  pause() { this.isPlaying = false; }
  toggle() { this.isPlaying = !this.isPlaying; return this.isPlaying; }
  reset() { this.animationProgress = 0; this.lastWaypointIndex = -1; }

  setSpeed(speed) {
    this.playbackSpeed = speed;
  }

  // ==================== Epoch Planet Ghosts ====================

  /**
   * Show semi-transparent ghost spheres for key planets at the mission's launch date.
   * Gives spatial context so users can see where planets were when the mission launched.
   */
  _showEpochPlanets(mission) {
    this._clearEpochPlanets();
    if (!mission || !mission.waypoints || !mission.launchDate) return;

    // Collect unique bodies from waypoints
    const bodies = new Set();
    for (const wp of mission.waypoints) {
      if (wp.body) bodies.add(wp.body.toLowerCase());
    }

    const PLANET_COLORS = {
      earth: 0x4A90D9,
      venus: 0xE8CDA0,
      mars: 0xC1440E,
      jupiter: 0xC88B3A,
      saturn: 0xC5AB6E,
      uranus: 0x7EC8E3,
      neptune: 0x3B5BA5,
    };

    for (const planetKey of bodies) {
      try {
        const pos = getPlanetPosition(planetKey, mission.launchDate);
        if (!pos || (pos.x === 0 && pos.y === 0 && pos.z === 0 && planetKey !== 'sun')) continue;

        const color = PLANET_COLORS[planetKey] || 0x888888;

        const geo = new THREE.SphereGeometry(1.5, 16, 16);
        const mat = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.35,
          wireframe: false,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        this.trajectoryGroup.add(mesh);
        this._epochMeshes.push(mesh);
      } catch (e) {
        console.warn('Could not compute epoch position for', planetKey, e);
      }
    }
  }

  _clearEpochPlanets() {
    for (const m of this._epochMeshes) {
      this.trajectoryGroup.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    }
    this._epochMeshes = [];
  }

  // ==================== Mission Phase Timeline Strip ====================

  /**
   * Create a DOM timeline strip showing mission phases/waypoints.
   */
  _createTimelineStrip(mission) {
    this._removeTimelineStrip();
    if (!mission) return;

    const strip = document.createElement('div');
    strip.id = 'mission-timeline';
    strip.className = 'mission-timeline';
    strip.setAttribute('aria-label', 'Mission timeline');

    const phases = mission.waypoints || [];
    const phasesHtml = phases.map((wp, i) => {
      const name = wp.event || `Phase ${i + 1}`;
      const year = wp.date ? new Date(wp.date).getFullYear() : '';
      const phaseHtml = `<div class="mission-phase${i === 0 ? ' active' : ''}" data-idx="${i}">
        <div class="mission-phase-dot"></div>
        <div class="mission-phase-name">${name}</div>
        <div class="mission-phase-date">${year}</div>
      </div>`;
      // Add connector line between phases (not after the last one)
      if (i < phases.length - 1) {
        return phaseHtml + '<div class="mission-phase-line"></div>';
      }
      return phaseHtml;
    }).join('');

    strip.innerHTML = `
      <div class="mission-timeline-inner">
        <div class="mission-timeline-label">${mission.name || 'Mission'}</div>
        <div class="mission-timeline-phases">${phasesHtml}</div>
      </div>
    `;

    document.body.appendChild(strip);
    this._timelineStrip = strip;
  }

  _removeTimelineStrip() {
    if (this._timelineStrip) {
      this._timelineStrip.remove();
      this._timelineStrip = null;
    }
  }

  /**
   * Update active phase in the timeline strip based on animation progress.
   */
  updateTimelineProgress(progress) {
    if (!this._timelineStrip) return;
    const phases = this._timelineStrip.querySelectorAll('.mission-phase');
    if (!phases.length) return;

    // Determine active phase from waypoint progress positions
    let activeIdx = 0;
    for (let i = this.waypointProgressPositions.length - 1; i >= 0; i--) {
      if (progress >= this.waypointProgressPositions[i] - 0.01) {
        activeIdx = i;
        break;
      }
    }

    phases.forEach((p, i) => {
      p.classList.toggle('active', i === activeIdx);
      p.classList.toggle('passed', i < activeIdx);
    });
  }

  /** Create engine glow sprite in mission colour. */
  _makeEngineGlow(color, scale = 2) {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    const c = new THREE.Color(color);
    const r = Math.floor(c.r * 255), g = Math.floor(c.g * 255), b = Math.floor(c.b * 255);
    grad.addColorStop(0, `rgba(${r},${g},${b},0.8)`);
    grad.addColorStop(0.4, `rgba(${r},${g},${b},0.4)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    sprite.scale.set(scale, scale, 1);
    return sprite;
  }

  /**
   * Build a mission-specific spacecraft THREE.Group.
   * All geometry is procedural — no external assets required.
   * @param {string} missionId
   * @param {THREE.Color} color
   * @returns {THREE.Group}
   */
  _createSpacecraftMesh(missionId, color) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.8,
      roughness: 0.3,
      emissive: color,
      emissiveIntensity: 0.15,
    });

    if (missionId === 'voyager1' || missionId === 'voyager2') {
      // Hexagonal bus body
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.08, 6), mat);
      group.add(body);
      // Parabolic HGA dish (hemisphere)
      const dish = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
      dish.position.set(0, 0.2, 0);
      group.add(dish);
      // 3 RTG boom arms at 120° apart
      for (let i = 0; i < 3; i++) {
        const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 4), mat);
        boom.rotation.z = Math.PI / 2;
        boom.position.set(Math.cos(i * Math.PI * 2 / 3) * 0.35, -0.1, Math.sin(i * Math.PI * 2 / 3) * 0.35);
        group.add(boom);
      }
    } else if (missionId === 'pioneer10' || missionId === 'pioneer11') {
      // Flat hexagonal bus
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.05, 6), mat);
      group.add(body);
      // Large HGA dish
      const dish = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
      dish.position.set(0, 0.18, 0);
      group.add(dish);
      // Single long RTG arm
      const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.7, 4), mat);
      boom.rotation.z = Math.PI / 2;
      boom.position.set(0.45, -0.05, 0);
      group.add(boom);
    } else if (missionId === 'newhorizons') {
      // Piano-lid box body
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.28), mat);
      group.add(body);
      // LORRI telescope
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.18, 8), mat);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.1, 0.12);
      group.add(scope);
      // 2 short RTG arms
      for (let s = -1; s <= 1; s += 2) {
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 4), mat);
        arm.rotation.z = Math.PI / 2;
        arm.position.set(s * 0.22, -0.02, 0);
        group.add(arm);
      }
    } else if (missionId === 'cassini') {
      // Cylindrical bus
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.3, 8), mat);
      group.add(body);
      // HGA dish
      const dish = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
      dish.position.set(0, 0.22, 0);
      group.add(dish);
      // Huygens probe disc attached at side
      const huygens = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.03, 32), mat);
      huygens.rotation.z = Math.PI / 2;
      huygens.position.set(0.22, 0, 0);
      group.add(huygens);
      // Magnetometer boom
      const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.45, 4), mat);
      boom.rotation.z = Math.PI / 2;
      boom.position.set(-0.32, 0.05, 0);
      group.add(boom);
    } else if (missionId === 'juno') {
      // Small hexagonal body
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 6), mat);
      group.add(body);
      // 3 large solar panel wings at 120°
      const panelMat = new THREE.MeshStandardMaterial({
        color: 0x1a3a6a,
        metalness: 0.4,
        roughness: 0.6,
        emissive: 0x0a1a3a,
        emissiveIntensity: 0.1,
        side: THREE.DoubleSide,
      });
      for (let i = 0; i < 3; i++) {
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.25), panelMat);
        const angle = (i * Math.PI * 2) / 3;
        panel.position.set(Math.cos(angle) * 0.55, 0, Math.sin(angle) * 0.55);
        panel.rotation.y = angle + Math.PI / 2;
        group.add(panel);
      }
    } else if (missionId === 'galileo') {
      // Cylindrical body
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.28, 8), mat);
      group.add(body);
      // Large dish (partially deployed — tilted 30°)
      const dish = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
      dish.position.set(0, 0.2, 0);
      dish.rotation.z = Math.PI / 6; // 30° tilt (partially deployed)
      group.add(dish);
      // RTG boom
      const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.55, 4), mat);
      boom.rotation.z = Math.PI / 2;
      boom.position.set(0.38, -0.05, 0);
      group.add(boom);
    } else {
      // Generic fallback — simple directional craft
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.4, 8), mat);
      body.rotation.x = Math.PI / 2;
      group.add(body);
    }

    // Engine glow at rear
    const glow = this._makeEngineGlow(color, 1.8);
    glow.position.set(0, -0.3, 0);
    group.add(glow);

    return group;
  }

  clearMission() {
    // Clean up epoch planet ghosts and timeline strip
    this._clearEpochPlanets();
    this._removeTimelineStrip();

    while (this.trajectoryGroup.children.length > 0) {
      const child = this.trajectoryGroup.children[0];
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
      }
      this.trajectoryGroup.remove(child);
    }
    this.activeMission = null;
    this.spacecraft = null;
    this.trajectoryLine = null;
    this.curve = null;
    this.animationProgress = 0;
    this.isPlaying = false;
    this.waypointMarkers = [];
    this.waypointProgressPositions = [];
    this.lastWaypointIndex = -1;
    this.cameraFollowEnabled = false;
    this._nowIndicator = null;
    this._nowPulse = 0;
  }

  dispose() {
    this.clearMission();
    this.scene.remove(this.trajectoryGroup);
  }
}
