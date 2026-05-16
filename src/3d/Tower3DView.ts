import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { LIGHT_EFFECTS } from 'ultimatedarktower';
import type { TowerState, SealIdentifier, TowerSide } from 'ultimatedarktower';

import type { ITowerDisplay, TowerPhysicsHooks } from '../types';
import { injectStyles } from '../styles';
import { SideButtons } from '../shared/SideButtons';
import { DrumRotationAudio } from '../audio/DrumRotationAudio';
import { TowerSampleAudio } from '../audio/TowerSampleAudio';
import { DEFAULT_TOWER_SOUND_PACK } from '../audio/audioLibrary';
import { DEFAULT_SEQUENCE_AUDIO_MAP } from '../audio/sequenceAudio';
import type { SoundPack } from '../audio/soundPack';

import type { LightingConfig, ResolvedLightingConfig, CameraConfig, AudioConfig } from './types';
import {
  TOWER_LAYER_COUNT, LIGHTS_PER_LAYER,
  RING_AZIMUTH, CORNER_AZIMUTH,
  LED_LAYOUT, RED_LIGHT_LAYOUT, LEDGE_LED_LAYOUT, BASE1_LED_LAYOUT, BASE2_LED_LAYOUT,
  BLOOM_LAYER,
} from './constants';
import { computeRedLightPosition, computeSealLedPose, disposeObject } from './utils';
import { DEFAULT_LIGHTING, resolveLighting } from './LightingResolver';
import { LedEffectAnimator } from './LedEffectAnimator';
import type { LedRef } from './LedEffectAnimator';
import { SequenceAnimator } from '../sequences/SequenceAnimator';
import { CameraController } from './CameraController';
import { SceneLighting } from './SceneLighting';
import type { SceneLightsPartial } from './SceneLighting';
import { BloomManager } from './BloomManager';
import { EntranceAnimator } from './EntranceAnimator';
import { GroundDiscManager } from './GroundDiscManager';
import { SkyboxManager } from './SkyboxManager';
import { SealManager } from './SealManager';
import type { SealBacklightRef } from './SealManager';
import { DrumManager } from './DrumManager';
import { loadTowerModel } from './ModelLoader';

// Re-exported for consumers that import directly from Tower3DView rather than the package root.
export { DEFAULT_LIGHTING, resolveLighting };
export type { SealBacklightRef };

const DEFAULT_DRACO_DECODER_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

type Logger = { log(label: string, data?: Record<string, unknown>): void };

const NULL_LOGGER: Logger = { log: () => { } };
const CONSOLE_LOGGER: Logger = {
  log(label, data) {
    // eslint-disable-next-line no-console
    console.log(`[Tower3DView] ${label}`, data);
  },
};

type Tower3DViewInternals = {
  ledRefs: Map<string, LedRef>;
  sealManager: SealManager;
};
const internals = (view: Tower3DView): Tower3DViewInternals =>
  view as unknown as Tower3DViewInternals;

/** @internal — exported for unit tests only. */
export const __testables = {
  get LED_LAYOUT(): typeof LED_LAYOUT {
    return LED_LAYOUT;
  },
  get LEDGE_LED_LAYOUT(): typeof LEDGE_LED_LAYOUT {
    return LEDGE_LED_LAYOUT;
  },
  get BASE1_LED_LAYOUT(): typeof BASE1_LED_LAYOUT {
    return BASE1_LED_LAYOUT;
  },
  get BASE2_LED_LAYOUT(): typeof BASE2_LED_LAYOUT {
    return BASE2_LED_LAYOUT;
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
  computeSealLedPose: (layer: number, light: number, radius: number, radiusFactor: number) =>
    computeSealLedPose(layer, light, radius, radiusFactor),
  getLedRef: (view: Tower3DView, layer: number, light: number): LedRef | undefined =>
    internals(view).ledRefs.get(`${layer}:${light}`),
  getSealNode: (view: Tower3DView, side: string, level: string): THREE.Object3D | undefined =>
    internals(view).sealManager.sealNodes.get(`${side}:${level}`),
  getSealNodeCount: (view: Tower3DView): number =>
    internals(view).sealManager.sealNodes.size,
  getSealBacklight: (view: Tower3DView, side: string, level: string): SealBacklightRef | undefined =>
    internals(view).sealManager.sealBacklights.get(`${side}:${level}`),
  getSealBacklightCount: (view: Tower3DView): number =>
    internals(view).sealManager.sealBacklights.size,
};

function isSoundPack(v: Record<number, string> | SoundPack): v is SoundPack {
  return typeof (v as SoundPack).name === 'string' && typeof (v as SoundPack).samples === 'object';
}

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
  /** Initial camera eye and look-target defaults. */
  camera?: CameraConfig;
  /** Initial audio configuration (sound pack, enable, sequence binding, etc.). */
  audio?: AudioConfig;
}

/**
 * A three.js-based 3D renderer for the Dark Tower model.
 *
 * Loads a GLB model, lets the user orbit / zoom / pan with mouse, and provides
 * N/E/S/W side-snap buttons. `applyState` drives the 24 LED proxies (per-light
 * effect animation) and rotates the three named drum meshes to match the state.
 * `applySeals` hides/shows seal meshes by name (`seal_<side>_<level>`).
 */
export class Tower3DView implements ITowerDisplay {
  private readonly container: HTMLElement;
  private readonly modelUrl: string;
  private readonly dracoDecoderPath: string;
  private readonly debug3D: boolean;
  private readonly logger: Logger;
  private lighting: ResolvedLightingConfig;
  private readonly showGroundDisc: boolean;
  private readonly cameraConfig: CameraConfig;

  private sceneLighting: SceneLighting | null = null;
  private entranceAnimator: EntranceAnimator = new EntranceAnimator();
  private groundDiscManager: GroundDiscManager | null = null;
  private skyboxManager: SkyboxManager | null = null;
  private sealManager: SealManager = new SealManager();
  private drumAudio: DrumRotationAudio = new DrumRotationAudio();
  private towerSampleAudio: TowerSampleAudio = new TowerSampleAudio();
  // Resolved audio state. `sequenceMapOverride` holds the user-supplied
  // override; `activeSequenceMap()` resolves it against the pack/default at
  // read time so getAudioConfig().sequenceMap always reflects what is in use.
  private audioState: {
    pack: SoundPack;
    enabled: boolean;
    bindSequenceToSample: boolean;
    sequenceMapOverride: Record<number, number> | undefined;
    drumRotationUrl: string | null;
  } = {
      pack: DEFAULT_TOWER_SOUND_PACK,
      enabled: false,
      bindSequenceToSample: false,
      sequenceMapOverride: undefined,
      drumRotationUrl: null,
    };
  private drumManager: DrumManager;

  private wrapper: HTMLDivElement | null = null;
  private canvasContainer: HTMLDivElement | null = null;
  private sideButtons: SideButtons | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private bloomManager: BloomManager | null = null;
  private controls: OrbitControls | null = null;
  private model: THREE.Group | null = null;
  private axesHelper: THREE.AxesHelper | null = null;
  private modelRadius = 1;
  private modelBottomY = -1;
  private modelTopY = 1;

  /** Clock for deriving `dt` for registered physics frame callbacks. */
  private readonly physicsClock = new THREE.Clock();
  private physicsFrameListeners: Set<(dt: number) => void> = new Set();
  private physicsModelLoadListeners: Set<
    (info: { root: THREE.Object3D; modelRadius: number; modelBottomY: number; modelTopY: number }) => void
  > = new Set();

  private cameraController: CameraController | null = null;

  private rafId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private frameCount = 0;

  private latestState: TowerState | null = null;
  private latestBrokenSeals: SealIdentifier[] = [];
  private pendingSide: TowerSide | null = null;
  private _loadState: 'pending' | 'ready' | 'error' = 'pending';

  private ledRefs: Map<string, LedRef> = new Map();
  private ledAnimator: LedEffectAnimator | null = null;
  private sequenceAnimator: SequenceAnimator | null = null;

  /** Optional callback fired when the selected side changes (user click or programmatic). */
  onSideChange?: (side: TowerSide) => void;

  /** Optional callback fired when the GLB model fails to load. */
  onLoadError?: (details: unknown) => void;

  /** Current load state of the GLB model. */
  get loadState(): 'pending' | 'ready' | 'error' {
    return this._loadState;
  }

  constructor(container: HTMLElement, options: Tower3DViewOptions) {
    this.container = container;
    this.modelUrl = options.modelUrl;
    this.dracoDecoderPath = options.dracoDecoderPath ?? DEFAULT_DRACO_DECODER_PATH;
    this.debug3D = options.debug3D ?? false;
    this.logger = this.debug3D ? CONSOLE_LOGGER : NULL_LOGGER;
    this.lighting = resolveLighting(options.lighting);
    this.showGroundDisc = options.showGroundDisc ?? true;
    this.cameraConfig = options.camera ?? {};
    this.drumManager = new DrumManager(this.drumAudio);
    // Seed audio state. Pack defaults to the bundled official pack so audio
    // works without any consumer setup beyond enabling from a user gesture.
    // Push the default pack to TowerSampleAudio first so the empty options.audio
    // case still gets sample URLs; applyAudioConfig then layers any overrides.
    this.towerSampleAudio.setLibrary(this.audioState.pack.samples);
    this.applyAudioConfig(options.audio ?? {});
    injectStyles();
    this.build();
    this.initScene();
    this.loadModel(this.modelUrl);
    this.startRenderLoop();
  }

  /**
   * Update the 3D view with a new decoded tower state, replaying all LED
   * effects and drum positions. Pass `force = true` to replay tower-sample
   * audio even when `state.audio.sample`/`loop` match the previous state
   * (e.g. the example app's "Trigger Sequence" button needs this).
   */
  applyState(state: TowerState, force = false): void {
    this.latestState = state;
    if (this.wrapper) this.wrapper.style.display = '';

    // When a sequence completes naturally, leave the LEDs at whatever value
    // the timeline last wrote. On the real tower, the firmware ends the
    // sequence body (defeat saturated; victory cut to black at phase 8) and
    // the app delivers a fresh state in response to the completion
    // notification. We don't simulate that follow-up state here, so a
    // post-completion replay of the base state would falsely restore
    // user-set "on" effects that the real tower would never show.
    const sequenceActive = this.sequenceAnimator?.apply(state.led_sequence, () => {
      // intentionally empty — see comment above
    });

    if (!sequenceActive) {
      this.ledAnimator?.replayAll(state);
    }

    this.drumManager.applyDrums(state.drum);

    // Sequence → sample auto-binding: when the consumer opted in and the state
    // carries a known sequence but no explicit sample, substitute the mapped
    // sample. The default (decoupled) behaviour leaves state.audio.sample as-is.
    let effectiveSample = state.audio.sample;
    if (
      effectiveSample === 0 &&
      this.audioState.bindSequenceToSample &&
      state.led_sequence
    ) {
      const mapped = this.activeSequenceMap()[state.led_sequence];
      if (mapped !== undefined) effectiveSample = mapped;
    }
    this.towerSampleAudio.sync(effectiveSample, state.audio.loop, state.audio.volume, force);
  }

  private activeSequenceMap(): Record<number, number> {
    return (
      this.audioState.sequenceMapOverride ??
      this.audioState.pack.sequenceMap ??
      DEFAULT_SEQUENCE_AUDIO_MAP
    );
  }

  /** Update seal backlight visibility — pass the current list of broken seals. */
  applySeals(brokenSeals: SealIdentifier[]): void {
    this.latestBrokenSeals = brokenSeals;
    this.sealManager.applySeals(brokenSeals, this.lighting);
  }

  /**
   * Expose a narrow integration surface for external add-ons (e.g. a physics
   * companion package). Returns hooks for: the Three.js scene, per-drum-level
   * Object3D access, a per-frame callback registry, a seal-state listener, and
   * the current model bounds. All callbacks return an unsubscribe function.
   * Bounds (`modelRadius`, `modelBottomY`, `modelTopY`) are snapshotted at call
   * time — call after the GLB has loaded for non-default values.
   */
  getPhysicsHooks(): TowerPhysicsHooks {
    return {
      scene: this.scene as THREE.Scene,
      drumNode: (level) => this.drumManager.getDrumNode(level),
      onFrame: (cb) => {
        this.physicsFrameListeners.add(cb);
        return () => { this.physicsFrameListeners.delete(cb); };
      },
      onSealsApplied: (cb) => this.sealManager.onSealsApplied(cb),
      onModelLoaded: (cb) => {
        this.physicsModelLoadListeners.add(cb);
        // Fire immediately if the model is already loaded.
        if (this.model) {
          try {
            cb({
              root: this.model,
              modelRadius: this.modelRadius,
              modelBottomY: this.modelBottomY,
              modelTopY: this.modelTopY,
            });
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error('[Tower3DView] onModelLoaded listener threw', err);
          }
        }
        return () => { this.physicsModelLoadListeners.delete(cb); };
      },
      modelRadius: this.modelRadius,
      modelBottomY: this.modelBottomY,
      modelTopY: this.modelTopY,
    };
  }

  /** @internal — exposed for tests; equals `physicsFrameListeners.size`. */
  get physicsFrameListenerCount(): number {
    return this.physicsFrameListeners.size;
  }

  private tickPhysicsListeners(): void {
    if (this.physicsFrameListeners.size === 0) return;
    const dt = this.physicsClock.getDelta();
    for (const cb of this.physicsFrameListeners) {
      try {
        cb(dt);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[Tower3DView] physics frame listener threw', err);
      }
    }
  }

  /** Tween the camera to face the given tower side. No-op if the camera is already on that side. */
  selectSide(side: TowerSide): void {
    if (this.cameraController?.getCurrentSide() === side) return;
    this.snapSide(side);
  }

  /** Always snaps the camera to `side`, even if already on that side. Used by side buttons. */
  private snapSide(side: TowerSide): void {
    this.cameraController?.snapToSide(side);
    // Stash the pending side so loadModel can replay the tween once the camera
    // is ready (snapToSide skips the tween before the model loads).
    this.pendingSide = this.model ? null : side;
    this.onSideChange?.(side);
  }

  /** Turn all LEDs off, stop drum audio, and hide the canvas wrapper until the next `applyState` call. */
  showIdle(): void {
    if (this.ledAnimator) {
      for (let layer = 0; layer < TOWER_LAYER_COUNT; layer++) {
        for (let light = 0; light < LIGHTS_PER_LAYER; light++) {
          this.ledAnimator.setEffect(layer, light, LIGHT_EFFECTS.off);
        }
      }
    }
    this.drumManager.stopAll();
    this.towerSampleAudio.stop();
    if (this.wrapper) this.wrapper.style.display = 'none';
  }

  /**
   * Set the URL of the audio asset played while drums rotate.
   * Pass null to fall back to the procedural placeholder tone. Decode runs in
   * the background; rotations that fire mid-decode use the placeholder.
   */
  setDrumRotationSoundUrl(url: string | null): void {
    this.applyAudioConfig({ drumRotationUrl: url });
  }

  /**
   * Enable or disable drum rotation audio. Disabled by default — consumers
   * must opt in (which also satisfies browser autoplay-policy gestures).
   *
   * @deprecated The `enabled` field of `AudioConfig` is a single master toggle
   *   covering both drum-rotation and tower-sample audio. Prefer
   *   `applyAudioConfig({ enabled })`.
   */
  setDrumRotationSoundEnabled(enabled: boolean): void {
    this.applyAudioConfig({ enabled });
  }

  /**
   * Provide the sample-id → URL map used to play decoded tower audio
   * (`state.audio.sample`). Sparse maps are fine — unmapped ids warn-once
   * and skip playback. Sample id 0 always means silence.
   *
   * Pass no argument (or `undefined`) to install the bundled default pack.
   * Pass a `SoundPack` to install a full pack with metadata + optional
   * sequence map. Pass a `Record<number, string>` for the legacy one-shot
   * "just the URLs" path; the library wraps it as an unnamed pack.
   */
  setTowerAudioLibrary(library?: Record<number, string> | SoundPack): void {
    const pack: SoundPack =
      library === undefined
        ? DEFAULT_TOWER_SOUND_PACK
        : isSoundPack(library)
          ? library
          : { name: 'custom', samples: library };
    this.applyAudioConfig({ pack });
  }

  /**
   * Enable or disable tower-sample audio. Disabled by default — consumers
   * must opt in (which also satisfies browser autoplay-policy gestures).
   * If a non-silent sample was the most recent state, enabling re-triggers
   * playback so users hear active loops without waiting for the next state.
   */
  setTowerAudioEnabled(enabled: boolean): void {
    this.applyAudioConfig({ enabled });
  }

  /**
   * Return the fully-resolved audio configuration. Every field is populated:
   * `pack`, `enabled`, `bindSequenceToSample`, `sequenceMap` (the effective
   * map after fallback resolution), and `drumRotationUrl`.
   */
  getAudioConfig(): Required<AudioConfig> {
    return {
      pack: this.audioState.pack,
      enabled: this.audioState.enabled,
      bindSequenceToSample: this.audioState.bindSequenceToSample,
      sequenceMap: this.activeSequenceMap(),
      drumRotationUrl: this.audioState.drumRotationUrl,
    };
  }

  /**
   * Sparse-merge an audio configuration: only fields explicitly provided
   * (i.e., not `undefined`) overwrite the current state. Mirrors
   * `applyLightingConfig` / `applyCameraConfig`.
   */
  applyAudioConfig(config: AudioConfig): void {
    if (config.pack !== undefined) {
      this.audioState.pack = config.pack;
      this.towerSampleAudio.setLibrary(config.pack.samples);
    }
    if (config.enabled !== undefined) {
      this.audioState.enabled = config.enabled;
      this.towerSampleAudio.setEnabled(config.enabled);
      this.drumAudio.setEnabled(config.enabled);
    }
    if (config.bindSequenceToSample !== undefined) {
      this.audioState.bindSequenceToSample = config.bindSequenceToSample;
    }
    if (config.sequenceMap !== undefined) {
      this.audioState.sequenceMapOverride = config.sequenceMap;
    }
    if (config.drumRotationUrl !== undefined) {
      this.audioState.drumRotationUrl = config.drumRotationUrl;
      this.drumAudio.setUrl(config.drumRotationUrl);
    }
  }

  /** When enabled, preserve the current camera orbit instead of resetting to the default fit on side selection. */
  setPreserveViewOnSideSelect(enabled: boolean): void {
    this.cameraController?.setPreserveViewOnSideSelect(enabled);
  }

  /**
   * Live-update individual scene light intensities and key-light position.
   * Stops any active entrance or breathing animation so manual values take precedence.
   */
  setSceneLights(opts: SceneLightsPartial): void {
    // Manual lighting edits should always win over the cinematic timeline.
    this.entranceAnimator.stop();
    this.sceneLighting?.applyPartial(opts, this.lighting);
    this.absorbSceneLights(opts);
  }

  private absorbSceneLights(opts: SceneLightsPartial): void {
    const scene = this.lighting.scene;
    if (opts.hemi !== undefined) scene.hemisphere.intensity = opts.hemi;
    if (opts.key !== undefined) scene.key.intensity = opts.key;
    if (opts.fill !== undefined) scene.fill.intensity = opts.fill;
    if (opts.fillY !== undefined) {
      const [x, y, z] = scene.fill.position;
      scene.fill.position = [x, opts.fillY ?? y, z];
    }
    if (opts.exposure !== undefined) scene.exposure = opts.exposure;
    if (opts.keyX !== undefined || opts.keyY !== undefined || opts.keyZ !== undefined) {
      const [x, y, z] = scene.key.position;
      scene.key.position = [opts.keyX ?? x, opts.keyY ?? y, opts.keyZ ?? z];
    }
  }

  /** Return a deep-cloned snapshot of the full resolved lighting configuration. */
  getLightingConfig(): ResolvedLightingConfig {
    return structuredClone(this.lighting);
  }

  /** Resolve and apply a new lighting configuration at runtime. */
  applyLightingConfig(config: LightingConfig): void {
    this.lighting = resolveLighting(config, this.lighting);
    this.applyLightingToScene();
    if (this.latestState) this.ledAnimator?.replayAll(this.latestState);
  }

  /**
   * Return the current camera config (elevation + target-height factors).
   * @remarks After `dispose()`, `cameraController` is null and this returns synthetic
   * defaults derived from the construction-time `camera` option. Behavior post-dispose
   * is undefined — do not rely on these values.
   */
  getCameraConfig(): Required<CameraConfig> {
    return this.cameraController?.getCameraConfig() ?? {
      elevationFactor: this.cameraConfig.elevationFactor ?? -0.5,
      targetHeightFactor: this.cameraConfig.targetHeightFactor ?? -0.15,
      zoomToCursor: this.cameraConfig.zoomToCursor ?? true,
      preserveViewOnSideSelect: false,
    };
  }

  /** Update the camera elevation and/or look-target height and refit immediately. */
  applyCameraConfig(config: CameraConfig): void {
    this.cameraController?.applyCameraConfig(config);
  }

  /** Enable or disable zoom-toward-cursor on scroll-wheel zoom-in. */
  setZoomToCursor(enabled: boolean): void {
    this.cameraController?.setZoomToCursor(enabled);
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

  /** Cancel the render loop, release all three.js resources, and remove the canvas from the DOM. */
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
    this.sequenceAnimator?.dispose();
    this.sequenceAnimator = null;
    this.ledAnimator?.dispose();
    this.ledAnimator = null;
    for (const ref of this.ledRefs.values()) {
      ref.redLight.removeFromParent();
    }
    this.ledRefs.clear();
    this.sealManager.dispose();
    this.drumManager.dispose();
    this.physicsFrameListeners.clear();
    this.physicsModelLoadListeners.clear();
    this.drumAudio.dispose();
    this.towerSampleAudio.dispose();
    if (this.model) {
      disposeObject(this.model);
      this.model = null;
    }
    if (this.axesHelper) {
      this.axesHelper.removeFromParent();
      this.axesHelper = null;
    }
    this.bloomManager?.dispose();
    this.bloomManager = null;
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

  private build(): void {
    this.wrapper = document.createElement('div');
    this.wrapper.className = 't3v-wrapper';

    const controls = document.createElement('div');
    controls.className = 't3v-controls';

    this.sideButtons = new SideButtons((side) => this.snapSide(side));
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

    if (lighting.scene.bloom.enabled) {
      this.bloomManager = new BloomManager(
        this.scene,
        this.camera,
        this.renderer,
        lighting,
        width,
        height,
      );
    }

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0, 0);
    this.controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;

    this.sceneLighting = new SceneLighting(this.scene, this.camera, this.renderer, lighting);
    this.groundDiscManager = new GroundDiscManager(
      this.scene,
      this.renderer.capabilities.getMaxAnisotropy(),
    );
    this.skyboxManager = new SkyboxManager(this.scene);

    if (this.debug3D) {
      this.axesHelper = new THREE.AxesHelper(1);
      this.scene.add(this.axesHelper);
    }

    this.logger.log('initScene', {
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

    this.cameraController = new CameraController(this.camera, this.controls, this.sideButtons!, this.cameraConfig);
    this.cameraController.onSideChange = (side) => this.onSideChange?.(side);
    this.cameraController.bindZoomTowardCursor(this.renderer.domElement);

    if (this.lighting.scene.skyboxUrl) {
      this.skyboxManager.apply(this.lighting.scene.skyboxUrl, this.lighting.scene.background);
    }
  }

  private loadModel(url: string): void {
    loadTowerModel(
      url,
      this.dracoDecoderPath,
      ({ root, modelRadius, modelBottomY, modelTopY }) => {
        if (!this.scene) return;

        this.modelRadius = modelRadius;
        this.modelBottomY = modelBottomY;
        this.modelTopY = modelTopY;

        this.logger.log('modelLoaded', {
          url,
          radius: modelRadius,
          rootPosition: root.position.toArray(),
        });

        if (this.axesHelper) {
          this.axesHelper.scale.setScalar(Math.max(1, modelRadius * 0.35));
          this.axesHelper.visible = true;
        }

        this.sealManager.buildSealNodes(root);
        this.drumManager.buildDrumNodes(root);
        this.scene.add(root);
        this.model = root;

        this.sceneLighting?.applyLights(this.lighting, modelRadius);
        if (this.showGroundDisc) this.groundDiscManager?.build(modelRadius, modelBottomY, this.lighting);
        this.buildLeds();
        this.sealManager.buildSealBacklights(root, modelRadius, this.lighting);
        this.sealManager.setDebug(this.debug3D, root);
        this.sealManager.warnOnMissing();
        this.drumManager.warnOnMissing();
        if (this.latestBrokenSeals.length > 0) this.applySeals(this.latestBrokenSeals);
        if (this.latestState) this.drumManager.applyDrums(this.latestState.drum, { animate: false });
        this.cameraController?.fitToModel(modelRadius, (l, d) => this.logger.log(l, d));
        if (this.pendingSide !== null) {
          const pending = this.pendingSide;
          this.pendingSide = null;
          this.cameraController?.snapToSide(pending);
        }

        // Replay state AFTER all visuals are built (seals + LEDs)
        this._loadState = 'ready';
        if (this.latestState) this.applyState(this.latestState);

        // Notify physics integration listeners (e.g. the companion physics
        // package) that the model is now in the scene with finalized bounds.
        for (const cb of this.physicsModelLoadListeners) {
          try {
            cb({ root, modelRadius, modelBottomY, modelTopY });
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error('[Tower3DView] onModelLoaded listener threw', err);
          }
        }
      },
      (details) => {
        // eslint-disable-next-line no-console
        console.error('[Tower3DView] Failed to load GLB model:', details);
        this._loadState = 'error';
        this.onLoadError?.(details);
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
    const ledgeColor = new THREE.Color(lighting.leds.ledgeLeds.color);
    const baseColor = new THREE.Color(lighting.leds.baseLeds.color);
    for (const [key, ref] of this.ledRefs.entries()) {
      const layer = parseInt(key.split(':')[0], 10);
      ref.redLight.color.setHex(lighting.leds.red.color);
      ref.redLight.distance = redHaloDistance;
      ref.redLight.intensity = ref.driver.v * lighting.leds.red.maxHalo;
      ref.redLight.visible = ref.driver.v > 0.001;

      if (ref.proxyMesh) {
        const col = layer >= 4 ? baseColor : ledgeColor;
        (ref.proxyMesh.material as THREE.MeshBasicMaterial).color.copy(col);
      }
      if (ref.haloSprite) {
        const col = layer >= 4 ? baseColor : ledgeColor;
        (ref.haloSprite.material as THREE.SpriteMaterial).color.copy(col);
      }
    }

    this.sealManager.updateLighting(lighting, this.modelRadius);

    this.bloomManager?.applyConfig(lighting);
  }

  /**
   * Populate `ledRefs` with 24 red PointLights (6 layers × 4 lights) positioned
   * relative to the model's bounding radius.
   */
  private buildLeds(): void {
    if (!this.model) return;

    const { red, ledgeLeds, baseLeds } = this.lighting.leds;
    const redHaloDistance = this.modelRadius * red.haloDistanceFraction;

    // Radial gradient texture shared by ledge and base halo sprites.
    const gradTex = this.createLedgeGradientTexture();

    for (let layer = 0; layer < TOWER_LAYER_COUNT; layer++) {
      for (let light = 0; light < LIGHTS_PER_LAYER; light++) {
        const redPos = computeRedLightPosition(layer, light, this.modelRadius);
        const redLight = new THREE.PointLight(red.color, 0, redHaloDistance, 2);
        redLight.visible = false;
        redLight.position.set(redPos.x, redPos.y, redPos.z);
        this.model.add(redLight);

        const ref: LedRef = { redLight, driver: { v: 0 }, tween: null };

        // Layer 3 = LEDGE — add ball-type LED visuals (proxy sphere + halo sprite).
        if (layer === 3) {
          const { x, y, z } = redPos;

          const proxyRadius = this.modelRadius * ledgeLeds.proxy.sizeFactor;
          const proxyGeo = new THREE.SphereGeometry(proxyRadius, 8, 6);
          const proxyMat = new THREE.MeshBasicMaterial({
            color: ledgeLeds.color,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            toneMapped: false,
          });
          const proxyMesh = new THREE.Mesh(proxyGeo, proxyMat);
          proxyMesh.position.set(x, y, z);
          proxyMesh.layers.enable(BLOOM_LAYER);
          proxyMesh.renderOrder = 2;
          proxyMesh.castShadow = false;
          proxyMesh.receiveShadow = false;
          proxyMesh.visible = false;
          this.model.add(proxyMesh);
          ref.proxyMesh = proxyMesh;

          const haloMat = new THREE.SpriteMaterial({
            color: ledgeLeds.color,
            map: gradTex,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
          });
          const haloSprite = new THREE.Sprite(haloMat);
          const haloScale = this.modelRadius * ledgeLeds.halo.sizeFactor;
          haloSprite.scale.setScalar(haloScale);
          haloSprite.position.set(x, y, z);
          haloSprite.layers.enable(BLOOM_LAYER);
          haloSprite.renderOrder = 3;
          haloSprite.visible = false;
          this.model.add(haloSprite);
          ref.haloSprite = haloSprite;
        }

        // Layers 4–5 = BASE1/BASE2 — same ball-type LED visuals.
        if (layer >= 4) {
          const { x, y, z } = redPos;

          const proxyRadius = this.modelRadius * baseLeds.proxy.sizeFactor;
          const proxyGeo = new THREE.SphereGeometry(proxyRadius, 8, 6);
          const proxyMat = new THREE.MeshBasicMaterial({
            color: baseLeds.color,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            toneMapped: false,
          });
          const proxyMesh = new THREE.Mesh(proxyGeo, proxyMat);
          proxyMesh.position.set(x, y, z);
          proxyMesh.layers.enable(BLOOM_LAYER);
          proxyMesh.renderOrder = 2;
          proxyMesh.castShadow = false;
          proxyMesh.receiveShadow = false;
          proxyMesh.visible = false;
          this.model.add(proxyMesh);
          ref.proxyMesh = proxyMesh;

          const haloMat = new THREE.SpriteMaterial({
            color: baseLeds.color,
            map: gradTex,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
          });
          const haloSprite = new THREE.Sprite(haloMat);
          const haloScale = this.modelRadius * baseLeds.halo.sizeFactor;
          haloSprite.scale.setScalar(haloScale);
          haloSprite.position.set(x, y, z);
          haloSprite.layers.enable(BLOOM_LAYER);
          haloSprite.renderOrder = 3;
          haloSprite.visible = false;
          this.model.add(haloSprite);
          ref.haloSprite = haloSprite;
        }

        this.ledRefs.set(`${layer}:${light}`, ref);
      }
    }

    this.logger.log('buildLeds', { count: this.ledRefs.size, radius: this.modelRadius });

    this.ledAnimator = new LedEffectAnimator(this.ledRefs, () => this.lighting, this.sealManager);
    this.sequenceAnimator = new SequenceAnimator({ ledAnimator: this.ledAnimator });
  }

  /** Create a radial-gradient canvas texture for ledge LED halo sprites. */
  private createLedgeGradientTexture(): THREE.CanvasTexture {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const center = size / 2;
      const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.4, 'rgba(255,255,255,0.6)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
    }
    return new THREE.CanvasTexture(canvas);
  }

  private startRenderLoop(): void {
    this.physicsClock.start();
    const tick = () => {
      this.rafId = requestAnimationFrame(tick);
      this.controls?.update();
      this.cameraController?.tickDerivedSide();
      this.tickPhysicsListeners();
      this.sceneLighting?.tick();
      if (this.renderer && this.scene && this.camera) {
        if (this.bloomManager) {
          this.bloomManager.render();
        } else {
          this.renderer.render(this.scene, this.camera);
        }
        if (this.debug3D) {
          this.frameCount += 1;
          if (this.frameCount % 120 === 0) {
            this.logger.log('renderHeartbeat', {
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
    this.bloomManager?.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.logger.log('resize', {
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

}
