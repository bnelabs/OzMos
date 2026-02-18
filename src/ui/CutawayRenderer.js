import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PLANET_LAYERS } from '../data/planetLayers.js';
import { t } from '../i18n/i18n.js';

export class CutawayRenderer {
  constructor(containerElement, planetKey) {
    this.container = containerElement;
    this.planetKey = planetKey;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.controls = null;
    this.layers = [];
    this.clipPlane = null;
    this._animationId = null;
    this._disposed = false;
    this._labelElements = [];
    this._animationComplete = false;
  }

  init() {
    const layers = PLANET_LAYERS[this.planetKey];
    if (!layers) return;

    const width = this.container.clientWidth || 300;
    const height = 250;

    // Create mini renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.localClippingEnabled = true;
    this.container.appendChild(this.renderer.domElement);

    // Scene
    this.scene = new THREE.Scene();

    // Camera
    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    this.camera.position.set(2.5, 1.5, 2.5);
    this.camera.lookAt(0, 0, 0);

    // OrbitControls for user drag-to-rotate after animation
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enableZoom = false;
    this.controls.enablePan = false;
    this.controls.enabled = false; // Disabled during animation

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(3, 5, 3);
    this.scene.add(dirLight);

    // Clipping plane - starts fully closed (no clipping visible)
    this.clipPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);

    // Create concentric spheres for each layer
    const maxR = layers[0].r;
    for (const layer of layers) {
      const radius = (layer.r / maxR) * 1.0; // normalize to 1.0 max
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
      this.scene.add(mesh);
      this.layers.push({ mesh, data: layer, radius });
    }

    // Create HTML labels for layers (hidden initially for staggered reveal)
    this._createLabels(layers, maxR, height);

    // Start animation
    this.playAnimation();
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
      // Position labels on the right side, vertically distributed
      const yPercent = 15 + (i / layers.length) * 70;
      label.style.cssText = `position:absolute;right:8px;top:${yPercent}%;font-size:11px;color:#ccc;text-shadow:0 1px 3px rgba(0,0,0,0.8);opacity:0;transition:opacity 0.8s ease;`;
      labelContainer.appendChild(label);
      this._labelElements.push(label);
    }

    this.container.appendChild(labelContainer);
  }

  playAnimation() {
    let startTime = null;
    const duration = 6000; // 6 second reveal animation
    const layerCount = this.layers.length;

    const animate = (timestamp) => {
      if (this._disposed) return;
      if (!startTime) startTime = timestamp;

      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Cubic ease-in-out
      const p = progress;
      const eased = p < 0.5
        ? 4 * p * p * p
        : 1 - Math.pow(-2 * p + 2, 3) / 2;

      // Sweep clip plane from right (-1) to center (0)
      this.clipPlane.constant = eased * 1.2;

      // Stagger label reveal: show each label when its layer is exposed
      for (let i = 0; i < this._labelElements.length; i++) {
        const threshold = (i + 0.5) / layerCount;
        if (eased >= threshold) {
          this._labelElements[i].style.opacity = '1';
        }
      }

      // Slow rotation during reveal, speed up after
      if (!this._animationComplete) {
        this.scene.rotation.y += 0.001;
      } else {
        this.scene.rotation.y += 0.004;
      }

      // Update controls if enabled
      if (this.controls) {
        this.controls.update();
      }

      this.renderer.render(this.scene, this.camera);

      if (progress >= 1 && !this._animationComplete) {
        this._animationComplete = true;
        // Enable user interaction after animation
        if (this.controls) {
          this.controls.enabled = true;
        }
      }

      this._animationId = requestAnimationFrame(animate);
    };

    this._animationId = requestAnimationFrame(animate);
  }

  dispose() {
    this._disposed = true;
    if (this._animationId) {
      cancelAnimationFrame(this._animationId);
    }
    if (this.controls) {
      this.controls.dispose();
    }
    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement && this.renderer.domElement.parentElement) {
        this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
      }
    }
    // Remove label overlay
    if (this.container) {
      const labels = this.container.querySelector('.cutaway-labels');
      if (labels) labels.remove();
    }
    this.layers.forEach(l => {
      l.mesh.geometry.dispose();
      l.mesh.material.dispose();
    });
    this.layers = [];
    this._labelElements = [];
  }
}
