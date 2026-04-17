import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import gsap from 'gsap';
import type { TowerState, SealIdentifier } from 'ultimatedarktower';

import type { ITowerDisplay, TowerSide } from './types';
import { injectStyles } from './styles';
import towerModelUrl from './assets/tower.glb?url';

const SIDES: TowerSide[] = ['north', 'east', 'south', 'west'];
const SIDE_LABELS: Record<TowerSide, string> = {
  north: 'N',
  east: 'E',
  south: 'S',
  west: 'W',
};

/** Maps a side to its camera azimuth angle (radians), with +Z = north. */
const SIDE_AZIMUTH: Record<TowerSide, number> = {
  north: 0,
  east: Math.PI / 2,
  south: Math.PI,
  west: -Math.PI / 2,
};

const DEFAULT_DRACO_DECODER_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

interface CameraState {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

export interface Tower3DViewOptions {
  /** Override the default bundled GLB URL. */
  modelUrl?: string;
  /** Override the URL path used to fetch Draco decoders (wasm/js). */
  dracoDecoderPath?: string;
  /** Enable verbose 3D diagnostics (logs + axes helper). */
  debug3D?: boolean;
}

/**
 * A three.js-based 3D renderer for the Dark Tower model.
 *
 * V1: loads a GLB model, lets the user orbit / zoom / pan with mouse, and
 * provides N/E/S/W side-snap buttons plus a Reset button. `applyState` and
 * `applySeals` store the latest inputs but do not yet drive any visuals —
 * LED / drum / seal animation will come in a later pass once the model is
 * split into named sub-meshes.
 */
export class Tower3DView implements ITowerDisplay {
  private readonly container: HTMLElement;
  private readonly modelUrl: string;
  private readonly dracoDecoderPath: string;
  private readonly debug3D: boolean;

  private wrapper: HTMLDivElement | null = null;
  private canvasContainer: HTMLDivElement | null = null;
  private buttons: HTMLButtonElement[] = [];
  private currentSide: TowerSide | null = null;

  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private controls: OrbitControls | null = null;
  private model: THREE.Group | null = null;
  private axesHelper: THREE.AxesHelper | null = null;
  private modelRadius = 1;

  private defaultCamera: CameraState | null = null;
  private activeTween: gsap.core.Timeline | null = null;

  private rafId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private frameCount = 0;

  private latestState: TowerState | null = null;
  private latestBrokenSeals: SealIdentifier[] = [];

  constructor(container: HTMLElement, options?: Tower3DViewOptions) {
    this.container = container;
    this.modelUrl = options?.modelUrl ?? towerModelUrl;
    this.dracoDecoderPath = options?.dracoDecoderPath ?? DEFAULT_DRACO_DECODER_PATH;
    this.debug3D = options?.debug3D ?? false;
    injectStyles();
    this.build();
    this.initScene();
    this.loadModel(this.modelUrl);
    this.startRenderLoop();
  }

  applyState(state: TowerState): void {
    this.latestState = state;
    if (this.wrapper) this.wrapper.style.display = '';
  }

  applySeals(brokenSeals: SealIdentifier[]): void {
    this.latestBrokenSeals = brokenSeals;
  }

  showIdle(): void {
    if (this.wrapper) this.wrapper.style.display = 'none';
  }

  dispose(): void {
    if (this.activeTween) {
      this.activeTween.kill();
      this.activeTween = null;
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.controls) {
      this.controls.dispose();
      this.controls = null;
    }
    if (this.model) {
      disposeObject(this.model);
      this.model = null;
    }
    if (this.axesHelper) {
      this.axesHelper.removeFromParent();
      this.axesHelper = null;
    }
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer.domElement.remove();
      this.renderer = null;
    }
    this.scene = null;
    this.camera = null;
    if (this.wrapper) {
      this.wrapper.remove();
      this.wrapper = null;
    }
    this.buttons = [];
    this.canvasContainer = null;
    this.latestState = null;
    this.latestBrokenSeals = [];
  }

  // ─────────────────────────────────────────────────────────────────────────

  private build(): void {
    this.wrapper = document.createElement('div');
    this.wrapper.className = 't3v-wrapper';

    const controls = document.createElement('div');
    controls.className = 't3v-controls';

    for (const side of SIDES) {
      const btn = document.createElement('button');
      btn.className = 't3v-side-btn';
      btn.textContent = SIDE_LABELS[side];
      btn.dataset.side = side;
      btn.dataset.active = 'false';
      btn.addEventListener('click', () => this.snapToSide(side));
      controls.appendChild(btn);
      this.buttons.push(btn);
    }

    const resetBtn = document.createElement('button');
    resetBtn.className = 't3v-reset-btn';
    resetBtn.textContent = 'Reset';
    resetBtn.addEventListener('click', () => this.resetView());
    controls.appendChild(resetBtn);

    this.wrapper.appendChild(controls);

    this.canvasContainer = document.createElement('div');
    this.canvasContainer.className = 't3v-canvas';
    this.wrapper.appendChild(this.canvasContainer);

    this.container.appendChild(this.wrapper);
  }

  private initScene(): void {
    if (!this.canvasContainer) return;

    const { width, height } = this.getCanvasSize();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x111111);

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    this.camera.position.set(0, 0.5, 5);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.canvasContainer.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0, 0);

    // Lighting — simple three-point-ish rig so the model is visible before any
    // tower-LED work lands.
    const hemi = new THREE.HemisphereLight(0xffffff, 0x202030, 0.6);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffffff, 1.0);
    key.position.set(3, 5, 4);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xffffff, 0.4);
    fill.position.set(-4, 2, -3);
    this.scene.add(fill);

    if (this.debug3D) {
      this.axesHelper = new THREE.AxesHelper(1);
      this.scene.add(this.axesHelper);
    }

    this.debugLog('initScene', {
      width,
      height,
      camera: {
        fov: this.camera.fov,
        near: this.camera.near,
        far: this.camera.far,
        position: this.camera.position.toArray(),
      },
    });

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.canvasContainer);
  }

  private loadModel(url: string): void {
    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(this.dracoDecoderPath);
    loader.setDRACOLoader(dracoLoader);

    loader.load(
      url,
      (gltf) => {
        dracoLoader.dispose();

        if (!this.scene) return;

        const root = gltf.scene;

        // Center and measure the model.
        const box = new THREE.Box3().setFromObject(root);
        const center = new THREE.Vector3();
        const size = new THREE.Vector3();
        box.getCenter(center);
        box.getSize(size);
        root.position.sub(center);

        const sphere = new THREE.Sphere();
        box.getBoundingSphere(sphere);
        this.modelRadius = sphere.radius || 1;

        this.debugLog('modelLoaded', {
          url,
          center: center.toArray(),
          size: size.toArray(),
          radius: this.modelRadius,
          rootPosition: root.position.toArray(),
        });

        if (this.axesHelper) {
          this.axesHelper.scale.setScalar(Math.max(1, this.modelRadius * 0.35));
          this.axesHelper.visible = true;
        }

        this.scene.add(root);
        this.model = root;

        this.fitToView();
      },
      undefined,
      (err) => {
        dracoLoader.dispose();

        // eslint-disable-next-line no-console
        console.error('[Tower3DView] Failed to load GLB model:', this.describeLoadError(url, err));
      },
    );
  }

  private describeLoadError(url: string, err: unknown): Record<string, unknown> {
    const details: Record<string, unknown> = {
      url,
      dracoDecoderPath: this.dracoDecoderPath,
      errorType: typeof err,
    };

    if (err instanceof Error) {
      details.name = err.name;
      details.message = err.message;
      if (err.stack) details.stack = err.stack;

      if (err.message.includes('KHR_draco_mesh_compression')) {
        details.hint = 'Model requires Draco decoding; ensure decoder files are reachable from dracoDecoderPath.';
      }
    }

    if (err && typeof err === 'object') {
      const e = err as {
        type?: unknown;
        message?: unknown;
        target?: unknown;
        currentTarget?: unknown;
      };

      if (typeof e.type === 'string') details.eventType = e.type;
      if (typeof e.message === 'string') details.eventMessage = e.message;

      const target = e.target ?? e.currentTarget;
      if (target && typeof target === 'object') {
        const xhr = target as {
          status?: unknown;
          statusText?: unknown;
          responseURL?: unknown;
          readyState?: unknown;
        };

        if (typeof xhr.status === 'number') details.httpStatus = xhr.status;
        if (typeof xhr.statusText === 'string') details.httpStatusText = xhr.statusText;
        if (typeof xhr.responseURL === 'string') details.responseURL = xhr.responseURL;
        if (typeof xhr.readyState === 'number') details.readyState = xhr.readyState;
      }
    }

    return details;
  }

  private fitToView(): void {
    if (!this.camera || !this.controls) return;

    const fovRad = (this.camera.fov * Math.PI) / 180;
    // Distance to fit the bounding sphere in frame, with some breathing room.
    const distance = (this.modelRadius / Math.sin(fovRad / 2)) * 1.15;

    // Keep the model comfortably inside the frustum for large exports.
    const minFar = 1000;
    const maxFar = 50000;
    const recommendedFar = Math.max(minFar, distance + this.modelRadius * 3);
    this.camera.far = Math.min(maxFar, recommendedFar);
    this.camera.updateProjectionMatrix();

    this.camera.position.set(0, this.modelRadius * 0.15, distance);
    this.controls.target.set(0, 0, 0);
    this.camera.lookAt(0, 0, 0);
    this.controls.update();

    this.debugLog('fitToView', {
      radius: this.modelRadius,
      distance,
      cameraPosition: this.camera.position.toArray(),
      target: this.controls.target.toArray(),
      near: this.camera.near,
      far: this.camera.far,
    });

    this.defaultCamera = {
      position: this.camera.position.clone(),
      target: this.controls.target.clone(),
    };
  }

  private snapToSide(side: TowerSide): void {
    if (!this.camera || !this.controls || !this.defaultCamera) return;

    this.currentSide = side;
    this.updateSideButtons();

    const distance = this.defaultCamera.position.length();
    const elevation = this.modelRadius * 0.15;
    const azimuth = SIDE_AZIMUTH[side];
    const horiz = Math.sqrt(Math.max(0, distance * distance - elevation * elevation));

    const target = {
      x: Math.sin(azimuth) * horiz,
      y: elevation,
      z: Math.cos(azimuth) * horiz,
    };

    this.tweenCameraTo(target, { x: 0, y: 0, z: 0 });
  }

  private resetView(): void {
    if (!this.defaultCamera) return;

    this.currentSide = null;
    this.updateSideButtons();

    const p = this.defaultCamera.position;
    const t = this.defaultCamera.target;
    this.tweenCameraTo({ x: p.x, y: p.y, z: p.z }, { x: t.x, y: t.y, z: t.z });
  }

  private tweenCameraTo(
    position: { x: number; y: number; z: number },
    target: { x: number; y: number; z: number },
  ): void {
    if (!this.camera || !this.controls) return;

    if (this.activeTween) this.activeTween.kill();

    const tl = gsap.timeline();
    tl.to(this.camera.position, { ...position, duration: 0.4, ease: 'power2.inOut' }, 0);
    tl.to(this.controls.target, { ...target, duration: 0.4, ease: 'power2.inOut' }, 0);
    this.activeTween = tl;
  }

  private updateSideButtons(): void {
    for (const btn of this.buttons) {
      btn.dataset.active = String(btn.dataset.side === this.currentSide);
    }
  }

  private startRenderLoop(): void {
    const tick = () => {
      this.rafId = requestAnimationFrame(tick);
      this.controls?.update();
      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
        if (this.debug3D) {
          this.frameCount += 1;
          if (this.frameCount % 120 === 0) {
            this.debugLog('renderHeartbeat', {
              frame: this.frameCount,
              camera: this.camera.position.toArray(),
              target: this.controls?.target.toArray() ?? null,
            });
          }
        }
      }
    };
    tick();
  }

  private handleResize(): void {
    if (!this.renderer || !this.camera) return;
    const { width, height } = this.getCanvasSize();
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.debugLog('resize', {
      width,
      height,
      aspect: this.camera.aspect,
      near: this.camera.near,
      far: this.camera.far,
    });
  }

  private getCanvasSize(): { width: number; height: number } {
    if (!this.canvasContainer) return { width: 1, height: 1 };
    const rect = this.canvasContainer.getBoundingClientRect();
    return {
      width: Math.max(1, Math.floor(rect.width)),
      height: Math.max(1, Math.floor(rect.height)),
    };
  }

  private debugLog(label: string, data: Record<string, unknown>): void {
    if (!this.debug3D) return;
    // eslint-disable-next-line no-console
    console.log(`[Tower3DView] ${label}`, data);
  }
}

function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry?.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) {
        for (const m of mat) m.dispose();
      } else if (mat) {
        mat.dispose();
      }
    }
  });
  obj.removeFromParent();
}
