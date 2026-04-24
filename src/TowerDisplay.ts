import type { TowerState, SealIdentifier, TowerSide } from 'ultimatedarktower';
import type { LightingConfig, ResolvedLightingConfig } from './3d/types';
import type { TowerDisplayOptions, ITowerDisplay, RendererType } from './types';
import { TowerStateReadout } from './TowerStateReadout';
import { TowerSideView } from './2d/TowerSideView';
import { Tower3DView } from './3d/Tower3DView';

function normalizeRenderers(input?: RendererType | RendererType[]): RendererType[] {
  if (!input) return ['readout', 'side-view'];
  return Array.isArray(input) ? input : [input];
}

const sealKey = (seal: SealIdentifier): string => `${seal.side}:${seal.level}`;

function createRenderer(type: RendererType, container: HTMLElement, options: TowerDisplayOptions): ITowerDisplay {
  switch (type) {
    case 'readout':
      return new TowerStateReadout(container);
    case 'side-view':
      return new TowerSideView(container);
    case '3d-view':
      return new Tower3DView(container, {
        modelUrl: options.modelUrl,
        dracoDecoderPath: options.dracoDecoderPath,
        debug3D: options.debug3D,
        showLedProxies: options.showLedProxies,
        showGroundDisc: options.showGroundDisc,
        lighting: options.lighting,
      });
    default:
      throw new Error(`Unknown renderer type: ${type}`);
  }
}

/**
 * TowerDisplay renders decoded tower state into a DOM container.
 *
 * @example
 * ```ts
 * const display = new TowerDisplay({
 *   container: document.getElementById('tower')!,
 *   renderers: ['readout', 'side-view'],
 * });
 * display.applyState(state);
 * ```
 */
export class TowerDisplay implements ITowerDisplay {
  private readonly renderers: ITowerDisplay[] = [];
  private readonly root: HTMLDivElement;
  private view3d: Tower3DView | null = null;

  private readonly onSealClickCallback?: (seal: SealIdentifier) => void;
  private readonly onSideChangeCallback?: (side: TowerSide) => void;
  private readonly togglesEnabled: boolean;
  private userToggledSeals: Map<string, SealIdentifier> = new Map();
  private externalBrokenSeals: SealIdentifier[] = [];

  constructor(options: TowerDisplayOptions) {
    this.onSealClickCallback = options.onSealClick;
    this.onSideChangeCallback = options.onSideChange;
    this.togglesEnabled = options.clickToToggleSeals !== false;

    const types = normalizeRenderers(options.renderers);

    this.root = document.createElement('div');
    this.root.className = types.length > 1 ? 'td-layout td-multi' : 'td-layout';
    options.container.appendChild(this.root);

    for (const type of types) {
      const slot = document.createElement('div');
      slot.className = `td-slot td-slot-${type}`;
      this.root.appendChild(slot);
      const r = createRenderer(type, slot, options);
      this.renderers.push(r);
      if (r instanceof Tower3DView) this.view3d = r;
      if (r instanceof TowerSideView) {
        // Parent owns click-toggle state so 2D clicks fan out to every renderer.
        r.clickToToggleSeals = false;
        r.onSealClick = (seal) => this.handleSealClick(seal);
        r.onSideChange = (side) => this.handleSideChange(side);
      }
      if (r instanceof Tower3DView) {
        r.onSideChange = (side) => this.handleSideChange(side);
      }
      if (r instanceof TowerStateReadout) {
        // Enable clickable seal buttons in the readout grid; route clicks
        // through TowerDisplay so they participate in the same merge/fan-out
        // path as 2D seal clicks.
        r.clickToToggleSeals = true;
        r.onSealClick = (seal) => this.handleSealClick(seal);
      }
    }
  }

  /** Update the display with a new decoded tower state. */
  applyState(state: TowerState): void {
    for (const r of this.renderers) r.applyState(state);
  }

  /** Update seal visibility — pass the current list of broken seals. */
  applySeals(brokenSeals: SealIdentifier[]): void {
    this.externalBrokenSeals = brokenSeals;
    this.fanOutSeals();
  }

  private handleSealClick(seal: SealIdentifier): void {
    if (this.togglesEnabled) {
      const key = sealKey(seal);
      if (this.userToggledSeals.has(key)) {
        this.userToggledSeals.delete(key);
      } else {
        this.userToggledSeals.set(key, seal);
      }
      this.fanOutSeals();
    }
    this.onSealClickCallback?.(seal);
  }

  private fanOutSeals(): void {
    const merged = new Map<string, SealIdentifier>();
    for (const s of this.externalBrokenSeals) merged.set(sealKey(s), s);
    for (const [key, seal] of this.userToggledSeals) {
      if (!merged.has(key)) merged.set(key, seal);
    }
    const list = Array.from(merged.values());
    for (const r of this.renderers) r.applySeals(list);
  }

  /** Select the facing side on every side-aware renderer (2D SVG + 3D camera). */
  selectSide(side: TowerSide): void {
    for (const r of this.renderers) r.selectSide?.(side);
  }

  private handleSideChange(side: TowerSide): void {
    // Fan out so a click in one view mirrors to the others. Each view's
    // selectSide early-returns when already on the requested side, so there is
    // no loop — the originating renderer no-ops on reentry.
    for (const r of this.renderers) r.selectSide?.(side);
    this.onSideChangeCallback?.(side);
  }

  /** Reset the display to its idle/waiting state. */
  showIdle(): void {
    for (const r of this.renderers) r.showIdle();
  }

  /** Live-update scene light intensities. Only affects the 3D view; no-op otherwise. */
  setSceneLights(opts: {
    hemi?: number;
    key?: number;
    fill?: number;
    exposure?: number;
    keyX?: number;
    keyY?: number;
    keyZ?: number;
  }): void {
    this.view3d?.setSceneLights(opts);
  }

  /** Get the full resolved 3D lighting config. Returns undefined when no 3D view is active. */
  getLightingConfig(): ResolvedLightingConfig | undefined {
    return this.view3d?.getLightingConfig();
  }

  /** Apply a 3D lighting config. No-op when no 3D view is active. */
  applyLightingConfig(config: LightingConfig): void {
    this.view3d?.applyLightingConfig(config);
  }

  /** Toggle the noir ground disc in the 3D view. No-op otherwise. */
  setGroundDiscVisible(visible: boolean): void {
    this.view3d?.setGroundDiscVisible(visible);
  }

  /** Toggle the canvas-generated game board texture on the ground disc. No-op when no 3D view is active. */
  setBoardDiscEnabled(enabled: boolean): void {
    this.view3d?.setBoardDiscEnabled(enabled);
  }

  /** Set an equirectangular skybox image or .hdr URL on the 3D view. Pass null to clear. No-op otherwise. */
  setSkyboxUrl(url: string | null): void {
    this.view3d?.setSkyboxUrl(url);
  }

  /** Play the cinematic entrance fade-in + breathing on the 3D view. No-op otherwise. */
  playEntrance(): void {
    this.view3d?.playEntrance();
  }

  /** Remove all rendered DOM content and reset internal state. */
  dispose(): void {
    for (const r of this.renderers) r.dispose();
    this.renderers.length = 0;
    this.userToggledSeals.clear();
    this.externalBrokenSeals = [];
    this.root.remove();
  }
}
