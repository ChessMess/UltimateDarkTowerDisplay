import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import gsap from 'gsap';


import { LIGHT_EFFECTS } from 'ultimatedarktower';
import type { TowerState, SealIdentifier, TowerSide } from 'ultimatedarktower';

import type { ITowerDisplay } from '../types';
import type { LightingConfig, ResolvedLightingConfig } from './types';
import {
  TOWER_LAYER_COUNT, LIGHTS_PER_LAYER,
  RING_AZIMUTH, CORNER_AZIMUTH,
  LED_LAYOUT, RED_LIGHT_LAYOUT,
} from './constants';
import { injectStyles } from '../styles';
import towerModelUrl from './assets/tower.glb?url';
import { buildBoardTexture } from './GameBoardTexture';
import { DEFAULT_LIGHTING, resolveLighting } from './LightingResolver';
export { DEFAULT_LIGHTING, resolveLighting };
import { LedEffectAnimator } from './LedEffectAnimator';
import type { LedRef } from './LedEffectAnimator';
import { CameraController } from './CameraController';
import { SideButtons } from '../shared/SideButtons';
import { SceneLighting } from './SceneLighting';
import {
  computeLedPosition,
  computeRedLightPosition,
  disposeObject,
} from './utils';

const DEFAULT_DRACO_DECODER_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

const SEAL_NAME_PREFIX = 'seal_';
const SEAL_SIDES = ['north', 'south', 'east', 'west'] as const;
const SEAL_LEVELS = ['top', 'middle', 'bottom'] as const;
const sealKey = (side: string, level: string): string => `${side}:${level}`;

/** @internal — exported for unit tests only. */
export const __testables = {
  get LED_LAYOUT(): typeof LED_LAYOUT {
    return LED_LAYOUT;
  },
  get RING_AZIMUTH(): readonly number[] {
    return RING_AZIMUTH;
  },
  get CORNER_AZIMUTH(): readonly number[] {
    return CORNER_AZIMUTH;
  },
  get RED_LIGHT_LAYOUT(): typeof RED_LIGHT_LAYOUT {
    return RED_LIGHT_LAYOUT;
  },
  computeLedPosition: (layer: number, light: number, radius: number) =>
    computeLedPosition(layer, light, radius),
  computeRedLightPosition: (layer: number, light: number, radius: number) =>
    computeRedLightPosition(layer, light, radius),
  getLedRef: (view: Tower3DView, layer: number, light: number): LedRef | undefined =>
    (view as unknown as { ledRefs: Map<string, LedRef> }).ledRefs.get(`${layer}:${light}`),
  getSealNode: (view: Tower3DView, side: string, level: string): THREE.Object3D | undefined =>
    (view as unknown as { sealNodes: Map<string, THREE.Object3D> }).sealNodes.get(`${side}:${level}`),
  getSealNodeCount: (view: Tower3DView): number =>
    (view as unknown as { sealNodes: Map<string, THREE.Object3D> }).sealNodes.size,
};

export interface Tower3DViewOptions {
  /** Override the default bundled GLB URL. */
  modelUrl?: string;
  /** Override the URL path used to fetch Draco decoders (wasm/js). */
  dracoDecoderPath?: string;
  /** Enable verbose 3D diagnostics (logs + axes helper). */
  debug3D?: boolean;
  /** Show the amber LED proxy spheres. Defaults to false. Use for debugging / visibility aid. */
  showLedProxies?: boolean;
  /** Show the noir ground disc that catches the key-light shadow. Defaults to true. */
  showGroundDisc?: boolean;
  /** Light intensities for the three-point rig. */
  lighting?: LightingConfig;
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
  private readonly showLedProxies: boolean;
  private lighting: ResolvedLightingConfig;
  private readonly showGroundDisc: boolean;

  private sceneLighting: SceneLighting | null = null;
  private groundDisc: THREE.Mesh | null = null;
  private boardDiscTexture: THREE.CanvasTexture | null = null;
  private skyboxTexture: THREE.Texture | null = null;
  private skyboxCurrentUrl = '';
  private entranceTween: gsap.core.Timeline | null = null;

  private wrapper: HTMLDivElement | null = null;
  private canvasContainer: HTMLDivElement | null = null;
  private sideButtons: SideButtons | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private controls: OrbitControls | null = null;
  private model: THREE.Group | null = null;
  private axesHelper: THREE.AxesHelper | null = null;
  private modelRadius = 1;
  private modelBottomY = -1;

  private cameraController: CameraController | null = null;

  private rafId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private frameCount = 0;

  private latestState: TowerState | null = null;
  private latestBrokenSeals: SealIdentifier[] = [];
  private pendingSide: TowerSide | null = null;

  private ledRefs: Map<string, LedRef> = new Map();
  private ledAnimator: LedEffectAnimator | null = null;

  private sealNodes: Map<string, THREE.Object3D> = new Map();

  /** Optional callback fired when the selected side changes (user click or programmatic). */
  onSideChange?: (side: TowerSide) => void;

  constructor(container: HTMLElement, options?: Tower3DViewOptions) {
    this.container = container;
    this.modelUrl = options?.modelUrl ?? towerModelUrl;
    this.dracoDecoderPath = options?.dracoDecoderPath ?? DEFAULT_DRACO_DECODER_PATH;
    this.debug3D = options?.debug3D ?? false;
    this.showLedProxies = options?.showLedProxies ?? false;
    this.lighting = resolveLighting(options?.lighting);
    this.showGroundDisc = options?.showGroundDisc ?? true;
    injectStyles();
    this.build();
    this.initScene();
    this.loadModel(this.modelUrl);
    this.startRenderLoop();
  }

  applyState(state: TowerState): void {
    this.latestState = state;
    if (this.wrapper) this.wrapper.style.display = '';
    this.ledAnimator?.replayAll(state);
  }

  applySeals(brokenSeals: SealIdentifier[]): void {
    this.latestBrokenSeals = brokenSeals;
    if (this.sealNodes.size === 0) return; // model not loaded — replayed in loadModel.
    const broken = new Set(brokenSeals.map(s => sealKey(s.side, s.level)));
    for (const [key, node] of this.sealNodes) {
      node.visible = !broken.has(key);
    }
  }

  selectSide(side: TowerSide): void {
    if (this.cameraController?.getCurrentSide() === side) return;
    this.cameraController?.snapToSide(side);
    // snapToSide no-ops before the model is loaded (defaultCamera is null).
    // Stash the pending side so loadModel can replay it once the camera is ready.
    if (this.cameraController?.getCurrentSide() === side) {
      this.pendingSide = null;
    } else {
      this.pendingSide = side;
    }
    this.onSideChange?.(side);
  }

  showIdle(): void {
    if (this.ledAnimator) {
      for (let layer = 0; layer < TOWER_LAYER_COUNT; layer++) {
        for (let light = 0; light < LIGHTS_PER_LAYER; light++) {
          this.ledAnimator.setEffect(layer, light, LIGHT_EFFECTS.off);
        }
      }
    }
    if (this.wrapper) this.wrapper.style.display = 'none';
  }

  setSceneLights(opts: {
    hemi?: number;
    key?: number;
    fill?: number;
    exposure?: number;
    keyX?: number;
    keyY?: number;
    keyZ?: number;
  }): void {
    // Manual lighting edits should always win over the cinematic timeline.
    if (this.entranceTween) {
      this.entranceTween.kill();
      this.entranceTween = null;
    }

    const sl = this.sceneLighting;
    if (sl) {
      if (opts.hemi !== undefined) sl.hemi.intensity = opts.hemi;
      if (opts.key !== undefined) {
        sl.key.intensity = opts.key;
        if (sl.isBreathing) sl.startBreathing(opts.key, this.lighting);
      }
      if (opts.fill !== undefined) sl.fill.intensity = opts.fill;
      if (opts.exposure !== undefined) this.renderer!.toneMappingExposure = opts.exposure;
      if (opts.keyX !== undefined) sl.key.position.x = opts.keyX;
      if (opts.keyY !== undefined) sl.key.position.y = opts.keyY;
      if (opts.keyZ !== undefined) sl.key.position.z = opts.keyZ;
    }
    if (opts.hemi !== undefined) this.lighting.scene.hemisphere.intensity = opts.hemi;
    if (opts.key !== undefined) this.lighting.scene.key.intensity = opts.key;
    if (opts.fill !== undefined) this.lighting.scene.fill.intensity = opts.fill;
    if (opts.exposure !== undefined) this.lighting.scene.exposure = opts.exposure;
    const [currentX, currentY, currentZ] = this.lighting.scene.key.position;
    this.lighting.scene.key.position = [
      opts.keyX ?? currentX,
      opts.keyY ?? currentY,
      opts.keyZ ?? currentZ,
    ];
  }

  /** Return a JSON-safe snapshot of the full resolved lighting configuration. */
  getLightingConfig(): ResolvedLightingConfig {
    return JSON.parse(JSON.stringify(this.lighting)) as ResolvedLightingConfig;
  }

  /** Resolve and apply a new lighting configuration at runtime. */
  applyLightingConfig(config: LightingConfig): void {
    this.lighting = resolveLighting(config);
    this.applyLightingToScene();
    if (this.latestState) this.ledAnimator?.replayAll(this.latestState);
  }

  /**
   * Dramatic noir entrance: a silhouette emerges from black, the key light
   * sweeps in from a grazing angle and punches past its target (flash), then
   * settles while fill fades into the shadow side. Starts the breathing
   * pulse on complete. Safe to call repeatedly; any in-flight entrance or
   * breathing tween is killed before a new run.
   */
  playEntrance(): void {
    const sl = this.sceneLighting;
    if (!sl || !this.renderer) return;

    this.entranceTween?.kill();
    sl.stopBreathing();
    this.entranceTween = null;

    const targets = {
      hemi: sl.hemi.intensity,
      key: sl.key.intensity,
      fill: sl.fill.intensity,
      exposure: this.renderer.toneMappingExposure,
      keyX: sl.key.position.x,
      keyY: sl.key.position.y,
      keyZ: sl.key.position.z,
    };

    sl.hemi.intensity = 0;
    sl.key.intensity = 0;
    sl.fill.intensity = 0;
    this.renderer.toneMappingExposure = 0;

    // Snap the key far off to the opposite side and low — the searchlight
    // will arc across the top of the model from there into the target.
    sl.key.position.set(-Math.abs(targets.keyX) * 1.8, targets.keyY * 0.25, targets.keyZ - 8);

    const { peakKeyFactor, beats } = this.lighting.entrance;
    const peakKey = targets.key * peakKeyFactor;

    const tl = gsap.timeline({
      onComplete: () => sl.startBreathing(targets.key, this.lighting),
    });

    // Beat 1 — long silhouette hold: exposure + minimal hemi creep in
    // barely enough to suggest a shape in the dark.
    tl.to(this.renderer, {
      toneMappingExposure: targets.exposure * beats.silhouetteExposureFactor,
      duration: beats.silhouetteDurationS,
      ease: 'power1.in',
    }, 0);
    tl.to(sl.hemi, {
      intensity: targets.hemi * beats.silhouetteHemiFactor,
      duration: beats.silhouetteDurationS,
      ease: 'power1.in',
    }, 0);

    // Beat 2 — key arcs over the top: first leg to an overhead waypoint.
    tl.to(sl.key.position, {
      x: targets.keyX * 0.2,
      y: Math.max(targets.keyY * 1.8, targets.keyY + 3),
      z: targets.keyZ - 3,
      duration: beats.keyArc1DurationS,
      ease: 'power2.in',
    }, beats.keyArc1DelayS);

    // Beat 3 — key punches on during the arc: intensity overshoots past
    // target for the flash beat, exposure climbs to full.
    tl.to(sl.key, {
      intensity: peakKey,
      duration: beats.keyPunchDurationS,
      ease: 'power3.out',
    }, beats.keyPunchDelayS);
    tl.to(this.renderer, {
      toneMappingExposure: targets.exposure,
      duration: beats.exposureInDurationS,
      ease: 'power2.out',
    }, beats.keyPunchDelayS);

    // Beat 4 — second arc leg: key descends from waypoint to target.
    tl.to(sl.key.position, {
      x: targets.keyX,
      y: targets.keyY,
      z: targets.keyZ,
      duration: beats.keyArc2DurationS,
      ease: 'power2.out',
    }, beats.keyArc2DelayS);

    // Beat 5 — key settles from peak back to its resting intensity.
    tl.to(sl.key, {
      intensity: targets.key,
      duration: beats.keySettleDurationS,
      ease: 'power2.inOut',
    }, beats.keySettleDelayS);

    // Beat 6 — fill + remaining hemi ease in last so the shadow side stays
    // mysterious until the reveal has landed.
    tl.to(sl.fill, {
      intensity: targets.fill,
      duration: beats.fillInDurationS,
      ease: 'power1.out',
    }, beats.fillInDelayS);
    tl.to(sl.hemi, {
      intensity: targets.hemi,
      duration: beats.hemiInDurationS,
      ease: 'power1.out',
    }, beats.hemiInDelayS);

    this.entranceTween = tl;
  }

  /** Toggle the shadow-catching ground disc. Builds lazily on first enable. */
  setGroundDiscVisible(visible: boolean): void {
    if (visible && !this.groundDisc) {
      this.buildGroundDisc();
    }
    if (this.groundDisc) this.groundDisc.visible = visible;
  }

  /** Toggle the canvas-generated game board texture on the ground disc. */
  setBoardDiscEnabled(enabled: boolean): void {
    this.lighting.boardDisc.enabled = enabled;
    if (!this.groundDisc) return;
    const mat = this.groundDisc.material;
    if (!(mat instanceof THREE.MeshStandardMaterial)) return;
    if (enabled) {
      if (!this.boardDiscTexture) this.boardDiscTexture = buildBoardTexture();
      mat.map = this.boardDiscTexture;
      mat.color.set(0xffffff);
      mat.roughness = 0.95;
      mat.metalness = 0;
      mat.opacity = this.lighting.boardDisc.opacity;
      mat.transparent = this.lighting.boardDisc.opacity < 1;
    } else {
      mat.map = null;
      mat.color.setHex(this.lighting.groundDisc.color);
      mat.roughness = this.lighting.groundDisc.roughness;
      mat.metalness = this.lighting.groundDisc.metalness;
      mat.opacity = 1;
      mat.transparent = false;
      this.boardDiscTexture?.dispose();
      this.boardDiscTexture = null;
    }
    mat.needsUpdate = true;
  }

  /** Load an equirectangular image or .hdr/.exr file as the scene skybox. Pass null to clear. */
  setSkyboxUrl(url: string | null): void {
    this.lighting.scene.skyboxUrl = url ?? '';
    this.applySkybox(url ?? '');
  }

  private applySkybox(url: string): void {
    this.skyboxCurrentUrl = url;
    if (!url) {
      if (this.skyboxTexture) {
        this.skyboxTexture.dispose();
        this.skyboxTexture = null;
      }
      if (this.scene) this.scene.background = new THREE.Color(this.lighting.scene.background);
      return;
    }
    const onLoad = (texture: THREE.Texture) => {
      if (this.skyboxCurrentUrl !== url) { texture.dispose(); return; }
      texture.mapping = THREE.EquirectangularReflectionMapping;
      if (this.skyboxTexture) this.skyboxTexture.dispose();
      this.skyboxTexture = texture;
      if (this.scene) this.scene.background = texture;
    };
    const onError = () => console.warn('[Tower3DView] Skybox load failed:', url);
    if (/\.(hdr|exr)$/i.test(url)) {
      new HDRLoader().load(url, onLoad, undefined, onError);
    } else {
      new THREE.TextureLoader().load(url, onLoad, undefined, onError);
    }
  }

  dispose(): void {
    this.cameraController?.dispose();
    this.cameraController = null;
    if (this.entranceTween) {
      this.entranceTween.kill();
      this.entranceTween = null;
    }
    this.sceneLighting?.dispose();
    this.sceneLighting = null;
    if (this.groundDisc) {
      this.groundDisc.geometry?.dispose();
      const mat = this.groundDisc.material;
      if (Array.isArray(mat)) {
        for (const m of mat) m.dispose();
      } else {
        mat?.dispose();
      }
      this.groundDisc.removeFromParent();
      this.groundDisc = null;
    }
    if (this.boardDiscTexture) {
      this.boardDiscTexture.dispose();
      this.boardDiscTexture = null;
    }
    if (this.skyboxTexture) {
      this.skyboxTexture.dispose();
      this.skyboxTexture = null;
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
    this.ledAnimator?.dispose();
    this.ledAnimator = null;
    for (const ref of this.ledRefs.values()) {
      ref.material?.dispose();
      ref.light?.removeFromParent();
      ref.redLight.removeFromParent();
    }
    this.ledRefs.clear();
    this.sealNodes.clear();
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
    this.sideButtons = null;
    this.canvasContainer = null;
    this.latestState = null;
    this.latestBrokenSeals = [];
    this.pendingSide = null;
  }

  // ─────────────────────────────────────────────────────────────────────────

  private build(): void {
    this.wrapper = document.createElement('div');
    this.wrapper.className = 't3v-wrapper';

    const controls = document.createElement('div');
    controls.className = 't3v-controls';

    this.sideButtons = new SideButtons((side) => this.selectSide(side));
    // Reflect the post-load default camera side ('north') up front so the N button
    // is highlighted before the GLB finishes loading, matching the 2D view.
    this.sideButtons.setActive('north');
    for (const btn of this.sideButtons.buttons) controls.appendChild(btn);

    const resetBtn = document.createElement('button');
    resetBtn.className = 't3v-reset-btn';
    resetBtn.textContent = 'Reset';
    resetBtn.addEventListener('click', () => this.cameraController?.resetView());
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

    const lighting = this.lighting;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(lighting.scene.background);

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    this.camera.position.set(0, 0.5, 5);
    this.scene.add(this.camera); // required so camera-parented lights are found during scene traversal

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = lighting.scene.exposure;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.canvasContainer.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0, 0);

    this.sceneLighting = new SceneLighting(this.scene, this.camera, this.renderer, lighting);

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

    this.cameraController = new CameraController(this.camera, this.controls, this.sideButtons!);

    if (this.lighting.scene.skyboxUrl) this.applySkybox(this.lighting.scene.skyboxUrl);
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
        this.modelBottomY = -size.y / 2;

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

        root.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
          if (child.name.startsWith(SEAL_NAME_PREFIX)) {
            const rest = child.name.slice(SEAL_NAME_PREFIX.length);
            const underscore = rest.indexOf('_');
            if (underscore > 0) {
              const side = rest.slice(0, underscore);
              const level = rest.slice(underscore + 1);
              this.sealNodes.set(sealKey(side, level), child);
            }
          }
        });

        this.scene.add(root);
        this.model = root;

        this.sceneLighting?.applyLights(this.lighting, this.modelRadius);
        if (this.showGroundDisc) this.buildGroundDisc();
        this.buildLeds();
        this.warnOnMissingSeals();
        if (this.latestBrokenSeals.length > 0) this.applySeals(this.latestBrokenSeals);
        this.cameraController?.fitToModel(this.modelRadius, (l, d) => this.debugLog(l, d));
        if (this.pendingSide !== null) {
          const pending = this.pendingSide;
          this.pendingSide = null;
          this.cameraController?.snapToSide(pending);
        }
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

  /** Apply current `this.lighting` values onto live three.js scene resources. */
  private applyLightingToScene(): void {
    const lighting = this.lighting;
    this.applySkybox(lighting.scene.skyboxUrl);

    this.sceneLighting?.applyLights(lighting, this.modelRadius);

    if (this.groundDisc) {
      const mat = this.groundDisc.material;
      if (mat instanceof THREE.MeshStandardMaterial) {
        if (lighting.boardDisc.enabled) {
          if (!this.boardDiscTexture) this.boardDiscTexture = buildBoardTexture();
          mat.map = this.boardDiscTexture;
          mat.color.set(0xffffff);
          mat.roughness = 0.95;
          mat.metalness = 0;
          mat.opacity = lighting.boardDisc.opacity;
          mat.transparent = lighting.boardDisc.opacity < 1;
        } else {
          if (this.boardDiscTexture) {
            this.boardDiscTexture.dispose();
            this.boardDiscTexture = null;
          }
          mat.map = null;
          mat.color.setHex(lighting.groundDisc.color);
          mat.roughness = lighting.groundDisc.roughness;
          mat.metalness = lighting.groundDisc.metalness;
          mat.opacity = 1;
          mat.transparent = false;
        }
        mat.needsUpdate = true;
      }
      this.groundDisc.geometry.dispose();
      this.groundDisc.geometry = new THREE.CircleGeometry(this.modelRadius * lighting.groundDisc.radiusFactor, 64);
      this.groundDisc.position.y = this.modelBottomY - this.modelRadius * 0.002;
    }

    const amberHaloDistance = this.modelRadius * lighting.leds.amber.haloDistanceFraction;
    const redHaloDistance = this.modelRadius * lighting.leds.red.haloDistanceFraction;
    for (const ref of this.ledRefs.values()) {
      ref.redLight.color.setHex(lighting.leds.red.color);
      ref.redLight.distance = redHaloDistance;
      ref.redLight.intensity = ref.driver.v * lighting.leds.red.maxHalo;
      ref.redLight.visible = ref.driver.v > 0.001;

      if (ref.material) {
        ref.material.emissive.setHex(lighting.leds.amber.color);
        ref.material.emissiveIntensity = ref.driver.v * lighting.leds.amber.maxEmissive;
      }
      if (ref.light) {
        ref.light.color.setHex(lighting.leds.amber.color);
        ref.light.distance = amberHaloDistance;
        ref.light.intensity = ref.driver.v * lighting.leds.amber.maxHalo;
        ref.light.visible = ref.driver.v > 0.001;
      }
    }
  }

  /**
   * Populate `ledRefs` with 24 proxy LEDs (6 layers × 4 lights), each an
   * emissive sphere with a child PointLight for halo spill. Positions are
   * computed relative to the model's bounding radius.
   */
  private buildLeds(): void {
    if (!this.model) return;

    const { amber, red } = this.lighting.leds;
    const redHaloDistance = this.modelRadius * red.haloDistanceFraction;

    let sharedGeom: THREE.SphereGeometry | null = null;
    let baseMaterial: THREE.MeshStandardMaterial | null = null;
    const amberHaloDistance = this.modelRadius * amber.haloDistanceFraction;

    if (this.showLedProxies) {
      sharedGeom = new THREE.SphereGeometry(this.modelRadius * LED_LAYOUT.ledSize, 12, 8);
      baseMaterial = new THREE.MeshStandardMaterial({
        color: 0x000000,
        emissive: amber.color,
        emissiveIntensity: 0,
        toneMapped: false,
      });
    }

    for (let layer = 0; layer < TOWER_LAYER_COUNT; layer++) {
      for (let light = 0; light < LIGHTS_PER_LAYER; light++) {
        const redPos = computeRedLightPosition(layer, light, this.modelRadius);
        const redLight = new THREE.PointLight(red.color, 0, redHaloDistance, 2);
        redLight.visible = false;
        redLight.position.set(redPos.x, redPos.y, redPos.z);
        this.model.add(redLight);

        let mesh: THREE.Mesh | null = null;
        let material: THREE.MeshStandardMaterial | null = null;
        let pointLight: THREE.PointLight | null = null;

        if (this.showLedProxies && sharedGeom && baseMaterial) {
          material = baseMaterial.clone();
          mesh = new THREE.Mesh(sharedGeom, material);
          const pos = computeLedPosition(layer, light, this.modelRadius);
          mesh.position.set(pos.x, pos.y, pos.z);

          pointLight = new THREE.PointLight(amber.color, 0, amberHaloDistance, 2);
          pointLight.visible = false;
          mesh.add(pointLight);

          this.model.add(mesh);

          if (this.debug3D) {
            const axes = new THREE.AxesHelper(this.modelRadius * 0.02);
            axes.position.set(pos.x, pos.y, pos.z);
            this.model.add(axes);
          }
        }

        this.ledRefs.set(`${layer}:${light}`, {
          mesh,
          material,
          light: pointLight,
          redLight,
          driver: { v: 0 },
          tween: null,
        });
      }
    }

    baseMaterial?.dispose();

    this.debugLog('buildLeds', {
      count: this.ledRefs.size,
      radius: this.modelRadius,
      ledSize: this.modelRadius * LED_LAYOUT.ledSize,
    });

    this.ledAnimator = new LedEffectAnimator(this.ledRefs, () => this.lighting);

    if (this.latestState) this.applyState(this.latestState);
  }

  /**
   * Build the noir ground disc that catches the key-light shadow. Sized from
   * the loaded model's bounding radius, positioned just below it. Idempotent —
   * subsequent calls are ignored if the disc already exists.
   */
  private buildGroundDisc(): void {
    if (this.groundDisc || !this.scene) return;
    const { roughness, metalness, radiusFactor } = this.lighting.groundDisc;
    const geom = new THREE.CircleGeometry(this.modelRadius * radiusFactor, 64);

    if (this.lighting.boardDisc.enabled && !this.boardDiscTexture) {
      this.boardDiscTexture = buildBoardTexture();
    }
    const useBoardTex = this.lighting.boardDisc.enabled && this.boardDiscTexture;
    const mat = useBoardTex
      ? new THREE.MeshStandardMaterial({
        map: this.boardDiscTexture!,
        roughness: 0.95,
        metalness: 0,
        opacity: this.lighting.boardDisc.opacity,
        transparent: this.lighting.boardDisc.opacity < 1,
      })
      : new THREE.MeshStandardMaterial({
        color: this.lighting.groundDisc.color,
        roughness,
        metalness,
      });

    const disc = new THREE.Mesh(geom, mat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = this.modelBottomY - this.modelRadius * 0.002;
    disc.receiveShadow = true;
    this.scene.add(disc);
    this.groundDisc = disc;
  }



  private startRenderLoop(): void {
    const tick = () => {
      this.rafId = requestAnimationFrame(tick);
      this.controls?.update();
      this.sceneLighting?.fill.lookAt(0, 0, 0);
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

  private warnOnMissingSeals(): void {
    const missing: string[] = [];
    for (const side of SEAL_SIDES) {
      for (const level of SEAL_LEVELS) {
        if (!this.sealNodes.has(sealKey(side, level))) {
          missing.push(`${SEAL_NAME_PREFIX}${side}_${level}`);
        }
      }
    }
    if (missing.length === 0) return;
    // eslint-disable-next-line no-console
    console.warn(
      `[Tower3DView] ${missing.length} seal node(s) missing from the loaded model; ` +
      `applySeals will be a no-op for them. Missing: ${missing.join(', ')}. ` +
      `Found: ${Array.from(this.sealNodes.keys()).sort().join(', ') || '(none)'}.`,
    );
  }

}
