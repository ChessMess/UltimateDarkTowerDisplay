import type { TowerState, TowerSide, SealIdentifier } from 'ultimatedarktower';
import type { LightingConfig, CameraConfig } from './3d/types';

export type { TowerSide, SealIdentifier };
export type { LightingConfig };
export type { CameraConfig };

/** Identifies which renderer implementation to use. */
export type RendererType = 'readout' | 'side-view' | '3d-view';

/** Configuration options for TowerDisplay. */
export interface TowerDisplayOptions {
  /** DOM element to render into. */
  container: HTMLElement;
  /** Which renderer(s) to show. Defaults to ['readout', 'side-view']. */
  renderers?: RendererType | RendererType[];
  /** Called when the user clicks a seal overlay in the side view. */
  onSealClick?: (seal: SealIdentifier) => void;
  /**
   * When true (the default), clicking a seal toggles its visibility independently
   * of game state. Set to false to disable the built-in toggle and rely solely on
   * {@link ITowerDisplay.applySeals} for seal visibility.
   */
  clickToToggleSeals?: boolean;
  /** Called when any side-aware renderer changes its selected side. */
  onSideChange?: (side: TowerSide) => void;
  /** Called if the 3D GLB model fails to load. Only fires when `renderers` includes `'3d-view'`. */
  onLoadError?: (details: unknown) => void;
  /**
   * URL of the GLB model for the 3D view. **Required** when `renderers` includes `'3d-view'`.
   * The package ships the model at `dist/3d/assets/tower.glb` — reference it through your
   * bundler (e.g. `import towerModelUrl from 'ultimatedarktowerdisplay/dist/3d/assets/tower.glb'`)
   * or copy it to a static asset path and pass that URL here.
   */
  modelUrl?: string;
  /** Optional override for where Draco decoder wasm/js files are loaded from. */
  dracoDecoderPath?: string;
  /** Enable verbose 3D diagnostics (logs, render heartbeats, axes helpers). Forwarded to Tower3DView. */
  debug3D?: boolean;
  /** Show the noir ground disc that catches the key-light shadow. Defaults to true. */
  showGroundDisc?: boolean;
  /** Light intensities for the 3D view. Forwarded to Tower3DView. */
  lighting?: LightingConfig;
  /** Initial camera eye and look-target defaults for the 3D view. Forwarded to Tower3DView. */
  camera?: CameraConfig;
  /**
   * When false, skips injecting the built-in `<style>` tag into `document.head`.
   * Use this in environments with a strict Content Security Policy (e.g. Electron)
   * where `'unsafe-inline'` is not allowed for `style-src`. You must then include
   * the exported {@link TOWER_DISPLAY_CSS} string via your own bundler or stylesheet.
   * Defaults to true.
   */
  injectStyles?: boolean;
}

/** Public interface for all display implementations. */
export interface ITowerDisplay {
  /** Update the display with a new decoded tower state. */
  applyState(state: TowerState): void;
  /** Update seal visibility — pass the current list of broken seals. */
  applySeals(brokenSeals: SealIdentifier[]): void;
  /** Reset the display to its idle/waiting state. */
  showIdle(): void;
  /** Remove all rendered DOM content and reset internal state. */
  dispose(): void;
  /** Optional — select which side of the tower is facing. Only implemented by side-aware views. */
  selectSide?(side: TowerSide): void;
}
