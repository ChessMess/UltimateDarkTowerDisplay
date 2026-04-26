import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

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
import { DEFAULT_LIGHTING, resolveLighting } from './LightingResolver';
export { DEFAULT_LIGHTING, resolveLighting };
import { LedEffectAnimator } from './LedEffectAnimator';
import type { LedRef } from './LedEffectAnimator';
import { CameraController } from './CameraController';
import { SideButtons } from '../shared/SideButtons';
import { SceneLighting } from './SceneLighting';
import { computeRedLightPosition, computeSealBacklightPose, disposeObject } from './utils';
import { EntranceAnimator } from './EntranceAnimator';
import { GroundDiscManager } from './GroundDiscManager';
import { SkyboxManager } from './SkyboxManager';
import { SealManager } from './SealManager';
import type { SealBacklightRef } from './SealManager';
export type { SealBacklightRef };
import { loadTowerModel } from './ModelLoader';

const DEFAULT_DRACO_DECODER_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

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
  computeRedLightPosition: (layer: number, light: number, radius: number) =>
    computeRedLightPosition(layer, light, radius),
  computeSealBacklightPose: (
    layer: number,
    light: number,
    radius: number,
    radiusFactor: number,
  ) => computeSealBacklightPose(layer, light, radius, radiusFactor),
  getLedRef: (view: Tower3DView, layer: number, light: number): LedRef | undefined =>
    (view as unknown as { ledRefs: Map<string, LedRef> }).ledRefs.get(`${layer}:${light}`),
  getSealNode: (view: Tower3DView, side: string, level: string): THREE.Object3D | undefined =>
    (view as unknown as { sealManager: SealManager }).sealManager.sealNodes.get(`${side}:${level}`),
  getSealNodeCount: (view: Tower3DView): number =>
    (view as unknown as { sealManager: SealManager }).sealManager.sealNodes.size,
  getSealBacklight: (view: Tower3DView, side: string, level: string): SealBacklightRef | undefined =>
    (view as unknown as { sealManager: SealManager }).sealManager.sealBacklights.get(`${side}:${level}`),
  getSealBacklightCount: (view: Tower3DView): number =>
    (view as unknown as { sealManager: SealManager }).sealManager.sealBacklights.size,
};

export interface Tower3DViewOptions {
  /**
   * URL of the tower GLB model. The package ships the model file at
   * `dist/3d/assets/tower.glb` — consumers must reference it via their bundler
   * (e.g. `import towerModelUrl from 'ultimatedarktowerdisplay/dist/3d/assets/tower.glb'`)
   * or copy it to a static asset path and pass that URL here.
   */
  modelUrl: string;
  /** Override the URL path used to fetch Draco decoders (wasm/js). */
  dracoDecoderPath?: string;
  /** Enable verbose 3D diagnostics (logs + axes helper). */
  debug3D?: boolean;
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
  private lighting: ResolvedLightingConfig;
  private readonly showGroundDisc: boolean;

  private sceneLighting: SceneLighting | null = null;
  private entranceAnimator: EntranceAnimator = new EntranceAnimator();
  private groundDiscManager: GroundDiscManager | null = null;
  private skyboxManager: SkyboxManager | null = null;
  private sealManager: SealManager = new SealManager();

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

  /** Optional callback fired when the selected side changes (user click or programmatic). */
  onSideChange?: (side: TowerSide) => void;

  constructor(container: HTMLElement, options: Tower3DViewOptions) {
    this.container = container;
    this.modelUrl = options.modelUrl;
    this.dracoDecoderPath = options.dracoDecoderPath ?? DEFAULT_DRACO_DECODER_PATH;
    this.debug3D = options.debug3D ?? false;
    this.lighting = resolveLighting(options.lighting);
    this.showGroundDisc = options.showGroundDisc ?? true;
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
    this.sealManager.applySeals(brokenSeals, this.lighting);
  }

  selectSide(side: TowerSide): void {
    if (this.cameraController?.getCurrentSide() === side) return;
    this.cameraController?.snapToSide(side);
    // Stash the pending side so loadModel can replay the tween once the camera
    // is ready (snapToSide skips the tween before the model loads).
    this.pendingSide = this.model ? null : side;
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
    this.entranceAnimator.stop();

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
    if (!this.sceneLighting || !this.renderer) return;
    this.entranceAnimator.play(this.sceneLighting, this.renderer, this.lighting);
  }

  /** Toggle the shadow-catching ground disc. Builds lazily on first enable. */
  setGroundDiscVisible(visible: boolean): void {
    this.groundDiscManager?.setVisible(visible, this.modelRadius, this.modelBottomY, this.lighting);
  }

  /** Toggle the canvas-generated game board texture on the ground disc. */
  setBoardDiscEnabled(enabled: boolean): void {
    this.lighting.boardDisc.enabled = enabled;
    this.groundDiscManager?.setBoardDiscEnabled(enabled, this.lighting);
  }

  /** Load an equirectangular image or .hdr/.exr file as the scene skybox. Pass null to clear. */
  setSkyboxUrl(url: string | null): void {
    this.lighting.scene.skyboxUrl = url ?? '';
    this.skyboxManager?.apply(url ?? '', this.lighting.scene.background);
  }

  dispose(): void {
    this.cameraController?.dispose();
    this.cameraController = null;
    this.entranceAnimator.dispose();
    this.sceneLighting?.dispose();
    this.sceneLighting = null;
    this.groundDiscManager?.dispose();
    this.groundDiscManager = null;
    this.skyboxManager?.dispose();
    this.skyboxManager = null;
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
      ref.redLight.removeFromParent();
    }
    this.ledRefs.clear();
    this.sealManager.dispose();
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
    this.controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;

    this.sceneLighting = new SceneLighting(this.scene, this.camera, this.renderer, lighting);
    this.groundDiscManager = new GroundDiscManager(this.scene);
    this.skyboxManager = new SkyboxManager(this.scene);

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

    if (this.lighting.scene.skyboxUrl) {
      this.skyboxManager.apply(this.lighting.scene.skyboxUrl, this.lighting.scene.background);
    }
  }

  private loadModel(url: string): void {
    loadTowerModel(
      url,
      this.dracoDecoderPath,
      ({ root, modelRadius, modelBottomY }) => {
        if (!this.scene) return;

        this.modelRadius = modelRadius;
        this.modelBottomY = modelBottomY;

        this.debugLog('modelLoaded', {
          url,
          radius: modelRadius,
          rootPosition: root.position.toArray(),
        });

        if (this.axesHelper) {
          this.axesHelper.scale.setScalar(Math.max(1, modelRadius * 0.35));
          this.axesHelper.visible = true;
        }

        this.sealManager.buildSealNodes(root);
        this.scene.add(root);
        this.model = root;

        this.sceneLighting?.applyLights(this.lighting, modelRadius);
        if (this.showGroundDisc) this.groundDiscManager?.build(modelRadius, modelBottomY, this.lighting);
        this.buildLeds();
        this.sealManager.buildSealBacklights(root, modelRadius, this.lighting);
        this.sealManager.warnOnMissing();
        if (this.latestBrokenSeals.length > 0) this.applySeals(this.latestBrokenSeals);
        this.cameraController?.fitToModel(modelRadius, (l, d) => this.debugLog(l, d));
        if (this.pendingSide !== null) {
          const pending = this.pendingSide;
          this.pendingSide = null;
          this.cameraController?.snapToSide(pending);
        }

        // Replay state AFTER all visuals are built (seals + LEDs)
        if (this.latestState) this.applyState(this.latestState);
      },
      (details) => {
        // eslint-disable-next-line no-console
        console.error('[Tower3DView] Failed to load GLB model:', details);
      },
    );
  }

  /** Apply current `this.lighting` values onto live three.js scene resources. */
  private applyLightingToScene(): void {
    const lighting = this.lighting;
    this.skyboxManager?.apply(lighting.scene.skyboxUrl, lighting.scene.background);

    this.sceneLighting?.applyLights(lighting, this.modelRadius);
    this.groundDiscManager?.updateLighting(lighting, this.modelRadius, this.modelBottomY);

    const redHaloDistance = this.modelRadius * lighting.leds.red.haloDistanceFraction;
    for (const ref of this.ledRefs.values()) {
      ref.redLight.color.setHex(lighting.leds.red.color);
      ref.redLight.distance = redHaloDistance;
      ref.redLight.intensity = ref.driver.v * lighting.leds.red.maxHalo;
      ref.redLight.visible = ref.driver.v > 0.001;
    }

    this.sealManager.updateLighting(lighting, this.modelRadius);
  }

  /**
   * Populate `ledRefs` with 24 red PointLights (6 layers × 4 lights) positioned
   * relative to the model's bounding radius.
   */
  private buildLeds(): void {
    if (!this.model) return;

    const { red } = this.lighting.leds;
    const redHaloDistance = this.modelRadius * red.haloDistanceFraction;

    for (let layer = 0; layer < TOWER_LAYER_COUNT; layer++) {
      for (let light = 0; light < LIGHTS_PER_LAYER; light++) {
        const redPos = computeRedLightPosition(layer, light, this.modelRadius);
        const redLight = new THREE.PointLight(red.color, 0, redHaloDistance, 2);
        redLight.visible = false;
        redLight.position.set(redPos.x, redPos.y, redPos.z);
        this.model.add(redLight);

        this.ledRefs.set(`${layer}:${light}`, {
          redLight,
          driver: { v: 0 },
          tween: null,
        });
      }
    }

    this.debugLog('buildLeds', { count: this.ledRefs.size, radius: this.modelRadius });

    this.ledAnimator = new LedEffectAnimator(this.ledRefs, () => this.lighting, this.sealManager.sealBacklights);
  }

  // ─────────────────────────────────────────────────────────────────────────

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

}
