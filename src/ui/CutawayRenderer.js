/**
 * CutawayRenderer — renders cross-section directly on the 3D planet in the main scene.
 * Instead of a separate mini-renderer, this adds clipped layer spheres as children
 * of the actual planet mesh and animates a clipping plane to reveal internal structure.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PLANET_LAYERS } from '../data/planetLayers.js';
import { t } from '../i18n/i18n.js';

export class CutawayRenderer {
  /**
   * @param {HTMLElement} containerElement - DOM container for labels overlay
   * @param {string} planetKey - Key of the planet to show cross-section for
   * @param {THREE.Mesh} [planetMesh] - Optional: the actual planet mesh in the main scene
   * @param {THREE.WebGLRenderer} [renderer] - Optional: the main scene renderer
   */
  constructor(containerElement, planetKey, planetMesh, renderer) {
    this.container = containerElement;
    this.planetKey = planetKey;
    this.planetMesh = planetMesh;
    this.mainRenderer = renderer;
    this.layerMeshes = [];
    this.clipPlane = null;
    this._animationId = null;
    this._disposed = false;
    this._labelElements = [];
    this._animationComplete = false;
    this._startTime = null;
    this._originalMaterials = [];

    // Fallback: if no planet mesh provided, use legacy mini-renderer mode
    this._useLegacyMode = !planetMesh;

    // Legacy mode objects
    this._legacyRenderer = null;
    this._legacyScene = null;
    this._legacyCamera = null;
    this._legacyControls = null;
  }

  init() {
    const layers = PLANET_LAYERS[this.planetKey];
    if (!layers) return;

    if (this._useLegacyMode) {
      this._initLegacy(layers);
      return;
    }

    this._initOnPlanet(layers);
  }

  /** Main mode: render cross-section on the actual 3D planet mesh */
  _initOnPlanet(layers) {
    // Enable clipping on the main renderer
    if (this.mainRenderer) {
      this.mainRenderer.localClippingEnabled = true;
    }

    const planetRadius = this.planetMesh.geometry.parameters
      ? this.planetMesh.geometry.parameters.radius
      : 1;

    // Create clipping plane in planet's local space (starts fully closed)
    this.clipPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);

    // Save original material and modify to support clipping
    const origMat = this.planetMesh.material;
    this._originalMaterials.push({ mesh: this.planetMesh, material: origMat });

    const clippedMat = origMat.clone();
    clippedMat.clippingPlanes = [this.clipPlane];
    clippedMat.clipShadows = true;
    clippedMat.side = THREE.DoubleSide;
    this.planetMesh.material = clippedMat;

    // Also clip child meshes (atmosphere, clouds, city lights, rings)
    this.planetMesh.children.forEach(child => {
      if (child.material) {
        this._originalMaterials.push({ mesh: child, material: child.material });
        const cMat = child.material.clone();
        cMat.clippingPlanes = [this.clipPlane];
        cMat.clipShadows = true;
        cMat.side = THREE.DoubleSide;
        child.material = cMat;
      }
    });

    // Create concentric layer spheres as children of the planet mesh
    const maxR = layers[0].r;
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      // Skip outermost layer (that's the planet surface itself)
      if (i === 0) continue;

      const radius = (layer.r / maxR) * planetRadius;
      const segments = Math.max(24, Math.floor(48 * (radius / planetRadius)));
      const geo = new THREE.SphereGeometry(radius, segments, segments);
      const mat = new THREE.MeshStandardMaterial({
        color: layer.color,
        roughness: 0.6,
        metalness: 0.15,
        clippingPlanes: [this.clipPlane],
        clipShadows: true,
        side: THREE.DoubleSide,
        emissive: new THREE.Color(layer.color).multiplyScalar(0.1),
      });

      const mesh = new THREE.Mesh(geo, mat);
      this.planetMesh.add(mesh);
      this.layerMeshes.push({ mesh, data: layer, radius });
    }

    // Create cross-section face (flat disc at the cut plane)
    this._createCrossSectionFace(layers, maxR, planetRadius);

    // Start animation
    this._startTime = performance.now();
    this._animate();
  }

  /** Create a flat colored disc showing layer rings at the cross-section face */
  _createCrossSectionFace(layers, maxR, planetRadius) {
    // Create ring segments for each layer on the cut face
    for (let i = 0; i < layers.length; i++) {
      const outerR = (layers[i].r / maxR) * planetRadius;
      const innerR = i < layers.length - 1 ? (layers[i + 1].r / maxR) * planetRadius : 0;

      const ringGeo = new THREE.RingGeometry(innerR, outerR, 48, 1);
      const ringMat = new THREE.MeshStandardMaterial({
        color: layers[i].color,
        roughness: 0.5,
        metalness: 0.1,
        side: THREE.DoubleSide,
        emissive: new THREE.Color(layers[i].color).multiplyScalar(0.08),
      });

      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      // Position at the clip plane face, facing left
      ringMesh.rotation.y = Math.PI / 2;
      ringMesh.position.x = 0.001; // Slightly offset to avoid z-fighting
      this.planetMesh.add(ringMesh);
      this.layerMeshes.push({ mesh: ringMesh, data: layers[i], radius: outerR, isFace: true });
    }
  }

  /** Legacy mode: self-contained mini-renderer (fallback for panel-based display) */
  _initLegacy(layers) {
    const width = this.container.clientWidth || 300;
    const height = 250;

    this._legacyRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this._legacyRenderer.setSize(width, height);
    this._legacyRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this._legacyRenderer.localClippingEnabled = true;
    this.container.appendChild(this._legacyRenderer.domElement);

    this._legacyScene = new THREE.Scene();

    this._legacyCamera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    this._legacyCamera.position.set(2.5, 1.5, 2.5);
    this._legacyCamera.lookAt(0, 0, 0);

    this._legacyControls = new OrbitControls(this._legacyCamera, this._legacyRenderer.domElement);
    this._legacyControls.enableDamping = true;
    this._legacyControls.dampingFactor = 0.08;
    this._legacyControls.enableZoom = false;
    this._legacyControls.enablePan = false;
    this._legacyControls.enabled = false;

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this._legacyScene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(3, 5, 3);
    this._legacyScene.add(dirLight);

    this.clipPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);

    const maxR = layers[0].r;
    for (const layer of layers) {
      const radius = (layer.r / maxR) * 1.0;
      const geo = new THREE.SphereGeometry(radius, 48, 48);
      const mat = new THREE.MeshStandardMaterial({
        color: layer.color,
        roughness: 0.7,
        metalness: 0.1,
        clippingPlanes: [this.clipPlane],
        clipShadows: true,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      this._legacyScene.add(mesh);
      this.layerMeshes.push({ mesh, data: layer, radius });
    }

    this._createLabels(layers, maxR, height);
    this._startTime = performance.now();
    this._animateLegacy();
  }

  _createLabels(layers, maxR, containerHeight) {
    const labelContainer = document.createElement('div');
    labelContainer.className = 'cutaway-labels';
    labelContainer.style.cssText = 'position:relative;margin-top:-' + containerHeight + 'px;height:' + containerHeight + 'px;pointer-events:none;';

    this._labelElements = [];
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      const label = document.createElement('div');
      label.className = 'cutaway-label';
      label.textContent = t(layer.key);
      const yPercent = 15 + (i / layers.length) * 70;
      label.style.cssText = `position:absolute;right:8px;top:${yPercent}%;font-size:11px;color:#ccc;text-shadow:0 1px 3px rgba(0,0,0,0.8);opacity:0;transition:opacity 0.8s ease;`;
      labelContainer.appendChild(label);
      this._labelElements.push(label);
    }

    this.container.appendChild(labelContainer);
  }

  _animate() {
    if (this._disposed) return;

    const now = performance.now();
    const elapsed = now - this._startTime;
    const duration = 6000;
    const progress = Math.min(elapsed / duration, 1);

    // Cubic ease-in-out
    const p = progress;
    const eased = p < 0.5
      ? 4 * p * p * p
      : 1 - Math.pow(-2 * p + 2, 3) / 2;

    // Animate clipping plane to reveal cross-section
    if (this.clipPlane) {
      this.clipPlane.constant = eased * this._getMaxRadius() * 1.1;
    }

    if (progress >= 1 && !this._animationComplete) {
      this._animationComplete = true;
    }

    this._animationId = requestAnimationFrame(() => this._animate());
  }

  _animateLegacy() {
    if (this._disposed) return;

    const now = performance.now();
    const elapsed = now - this._startTime;
    const duration = 6000;
    const progress = Math.min(elapsed / duration, 1);

    const p = progress;
    const eased = p < 0.5
      ? 4 * p * p * p
      : 1 - Math.pow(-2 * p + 2, 3) / 2;

    this.clipPlane.constant = eased * 1.2;

    // Stagger label reveal
    for (let i = 0; i < this._labelElements.length; i++) {
      const threshold = (i + 0.5) / this._labelElements.length;
      if (eased >= threshold) {
        this._labelElements[i].style.opacity = '1';
      }
    }

    // Slow rotation
    if (!this._animationComplete) {
      this._legacyScene.rotation.y += 0.001;
    } else {
      this._legacyScene.rotation.y += 0.004;
    }

    if (this._legacyControls) this._legacyControls.update();
    this._legacyRenderer.render(this._legacyScene, this._legacyCamera);

    if (progress >= 1 && !this._animationComplete) {
      this._animationComplete = true;
      if (this._legacyControls) this._legacyControls.enabled = true;
    }

    this._animationId = requestAnimationFrame(() => this._animateLegacy());
  }

  _getMaxRadius() {
    if (this.planetMesh && this.planetMesh.geometry.parameters) {
      return this.planetMesh.geometry.parameters.radius;
    }
    return 1;
  }

  dispose() {
    this._disposed = true;
    if (this._animationId) {
      cancelAnimationFrame(this._animationId);
    }

    // Restore original materials
    for (const entry of this._originalMaterials) {
      if (entry.mesh && entry.material) {
        // Dispose the clipped clone
        if (entry.mesh.material !== entry.material) {
          entry.mesh.material.dispose();
        }
        entry.mesh.material = entry.material;
      }
    }
    this._originalMaterials = [];

    // Remove layer meshes from planet
    for (const l of this.layerMeshes) {
      if (l.mesh.parent) l.mesh.parent.remove(l.mesh);
      l.mesh.geometry.dispose();
      l.mesh.material.dispose();
    }
    this.layerMeshes = [];

    // Disable clipping on main renderer
    if (this.mainRenderer) {
      this.mainRenderer.localClippingEnabled = false;
    }

    // Legacy mode cleanup
    if (this._legacyControls) this._legacyControls.dispose();
    if (this._legacyRenderer) {
      this._legacyRenderer.dispose();
      if (this._legacyRenderer.domElement && this._legacyRenderer.domElement.parentElement) {
        this._legacyRenderer.domElement.parentElement.removeChild(this._legacyRenderer.domElement);
      }
    }

    // Remove label overlay
    if (this.container) {
      const labels = this.container.querySelector('.cutaway-labels');
      if (labels) labels.remove();
    }

    this._labelElements = [];
    this.clipPlane = null;
  }
}
