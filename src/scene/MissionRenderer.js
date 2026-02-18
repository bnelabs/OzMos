/**
 * Renders mission trajectories in the 3D scene using real orbital mechanics.
 * Spacecraft animate along historically accurate paths based on Keplerian positions.
 */
import * as THREE from 'three';
import { MISSIONS } from '../data/missions.js';
import {
  getMissionTrajectory,
  getMissionDateAtProgress,
  getWaypointProgressPositions,
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

    // Trajectory line
    const lineGeo = new THREE.BufferGeometry().setFromPoints(curvePoints);
    const lineMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(mission.color),
      transparent: true,
      opacity: 0.5,
      linewidth: 1,
    });
    this.trajectoryLine = new THREE.Line(lineGeo, lineMat);
    this.trajectoryGroup.add(this.trajectoryLine);

    // Glowing tube around trajectory
    const tubeGeo = new THREE.TubeGeometry(this.curve, 300, 0.1, 8, false);
    const tubeMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(mission.color),
      transparent: true,
      opacity: 0.12,
    });
    const tube = new THREE.Mesh(tubeGeo, tubeMat);
    this.trajectoryGroup.add(tube);

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

    // Spacecraft cone
    const scGeo = new THREE.ConeGeometry(0.25, 0.8, 8);
    scGeo.rotateX(Math.PI / 2);
    const scMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(mission.color),
      emissive: new THREE.Color(mission.color),
      emissiveIntensity: 0.5,
    });
    this.spacecraft = new THREE.Mesh(scGeo, scMat);

    // Engine glow sprite
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = 64;
    glowCanvas.height = 64;
    const gCtx = glowCanvas.getContext('2d');
    const gradient = gCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
    const c = new THREE.Color(mission.color);
    gradient.addColorStop(0, `rgba(${Math.floor(c.r*255)},${Math.floor(c.g*255)},${Math.floor(c.b*255)},0.6)`);
    gradient.addColorStop(1, `rgba(${Math.floor(c.r*255)},${Math.floor(c.g*255)},${Math.floor(c.b*255)},0)`);
    gCtx.fillStyle = gradient;
    gCtx.fillRect(0, 0, 64, 64);
    const glowTexture = new THREE.CanvasTexture(glowCanvas);
    const engineGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    engineGlow.scale.set(2, 2, 1);
    this.spacecraft.add(engineGlow);

    this.spacecraft.position.copy(points[0]);
    this.trajectoryGroup.add(this.spacecraft);

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
      this._followCamera.position.lerp(targetCamPos, 0.06);
      this._followControls.target.lerp(point, 0.08);
    }

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

  clearMission() {
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
  }

  dispose() {
    this.clearMission();
    this.scene.remove(this.trajectoryGroup);
  }
}
