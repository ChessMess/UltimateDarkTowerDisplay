import { TowerDisplay, TowerStateReadout } from '../src/index';
import type { TowerDisplayOptions, RendererType } from '../src/index';
import type { TowerState, TowerSide } from 'ultimatedarktower';
import type { DomElements } from './dom';
import { toggleSeal, refreshSeals } from './sealController';
import { setLedOverride as recordLedOverride, replayLedOverrides } from './ledOverrideController';
import towerModelUrl from '../src/3d/assets/tower.glb?url';
import { buildTowerAudioLibrary, hasTowerAudioAsset } from './towerAudioLibrary';

export type ViewButtonId = 'btn-view-2d' | 'btn-view-3d' | 'btn-view-2d3d';

const viewButtons: Record<ViewButtonId, RendererType | RendererType[]> = {
  'btn-view-2d': 'side-view',
  'btn-view-3d': '3d-view',
  'btn-view-2d3d': ['side-view', '3d-view'],
};

const sceneLights = { hemiIntensity: 0.15, keyIntensity: 0.9, fillIntensity: 0.12 };

declare global {
  interface Window {
    display?: TowerDisplay;
  }
}

let display: TowerDisplay;
let readout: TowerStateReadout;
let lastState: TowerState | null = null;
let lastSide: TowerSide | null = null;
let currentRenderers: RendererType | RendererType[] = '3d-view';
let currentActiveId: ViewButtonId = 'btn-view-3d';
const viewChangeListeners = new Set<() => void>();

function publishDisplay(): void {
  window.display = display;
}

export function getDisplay(): TowerDisplay {
  return display;
}

export function getReadout(): TowerStateReadout {
  return readout;
}

export function getLastState(): TowerState | null {
  return lastState;
}

export function setLastState(state: TowerState | null): void {
  lastState = state;
}

export function getSceneLights() {
  return sceneLights;
}

export function is3DViewVisible(): boolean {
  if (Array.isArray(currentRenderers)) return currentRenderers.includes('3d-view');
  return currentRenderers === '3d-view';
}

export function onViewChange(cb: () => void): () => void {
  viewChangeListeners.add(cb);
  return () => { viewChangeListeners.delete(cb); };
}

function fireViewChange(): void {
  for (const cb of viewChangeListeners) {
    try {
      cb();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[rendererController] onViewChange listener threw', err);
    }
  }
}

function buildDisplayOptions(renderers: RendererType | RendererType[], els: DomElements): TowerDisplayOptions {
  return {
    container: els.towerContainer,
    renderers,
    modelUrl: towerModelUrl,
    clickToToggleSeals: false, // external source of truth lives in sealController.
    onSealClick: (seal) => toggleSeal(seal, display, readout),
    onSideChange: (side) => { lastSide = side; },
    debug3D: (els.debug3dCheckbox?.checked ?? false),
    camera: {
      zoomToCursor: els.chkZoomToCursor?.checked ?? true,
      preserveViewOnSideSelect: els.chkPreserveViewOnSideSelect?.checked ?? false,
    },
    lighting: {
      scene: {
        hemisphere: { intensity: sceneLights.hemiIntensity },
        key: { intensity: sceneLights.keyIntensity },
        fill: { intensity: sceneLights.fillIntensity },
      },
    },
  };
}

function getViewButtonRef(id: ViewButtonId, els: DomElements): HTMLButtonElement | null {
  switch (id) {
    case 'btn-view-2d': return els.btnView2d;
    case 'btn-view-3d': return els.btnView3d;
    case 'btn-view-2d3d': return els.btnView2d3d;
  }
}

function setActiveViewButton(activeId: ViewButtonId, els: DomElements): void {
  for (const id of Object.keys(viewButtons) as ViewButtonId[]) {
    const el = getViewButtonRef(id, els);
    if (el) el.classList.toggle('active', id === activeId);
  }
}

function syncToolbar3DState(els: DomElements): void {
  if (els.threeDOptionsEl) {
    els.threeDOptionsEl.classList.toggle('three-d-inactive', !is3DViewVisible());
  }
}

function applyAudioConfig(els: DomElements, enableNow = false): void {
  display.setTowerAudioLibrary(buildTowerAudioLibrary());
  // Only enable from a user gesture. Initial page load is not a valid
  // autoplay-policy gesture, so defer until the user applies state or toggles
  // a 3D control.
  if (enableNow && els.chkTowerAudio?.checked) {
    display.setTowerAudioEnabled(true);
  }
}

export function armTowerAudioFromUserGesture(els: DomElements): void {
  if (!is3DViewVisible() || !els.chkTowerAudio?.checked) return;
  display.setTowerAudioEnabled(true);
}

function recreateDisplay(renderers: RendererType | RendererType[], activeId: ViewButtonId, els: DomElements): void {
  display.dispose();
  currentRenderers = renderers;
  currentActiveId = activeId;
  display = new TowerDisplay(buildDisplayOptions(renderers, els));
  publishDisplay();
  setActiveViewButton(activeId, els);
  applyAudioConfig(els, true);
  if (lastState) display.applyState(lastState);
  replayLedOverrides(display);
  refreshSeals(display, readout);
  if (lastSide) display.selectSide(lastSide);
  syncToolbar3DState(els);
  fireViewChange();
}

/**
 * Rebuild the TowerDisplay in place using the currently-selected renderers
 * and view button. Used by the pop-out controller after moving #tower
 * between the main document and a popup document.
 */
export function recreateCurrentDisplay(els: DomElements): void {
  recreateDisplay(currentRenderers, currentActiveId, els);
}

export function initRendererController(els: DomElements): void {
  readout = new TowerStateReadout(els.readoutContainer);
  readout.clickToToggleSeals = true;
  readout.onSealClick = (seal) => toggleSeal(seal, display, readout);
  readout.clickToToggleLeds = true;
  readout.onLedClick = (layer, light, effect) => recordLedOverride(layer, light, effect, display);
  display = new TowerDisplay(buildDisplayOptions('3d-view', els));
  publishDisplay();
  applyAudioConfig(els);

  for (const [id, renderers] of Object.entries(viewButtons) as [ViewButtonId, RendererType | RendererType[]][]) {
    const btn = getViewButtonRef(id, els);
    if (btn) btn.addEventListener('click', () => recreateDisplay(renderers, id, els));
  }

  if (els.debug3dCheckbox) {
    els.debug3dCheckbox.addEventListener('change', () => {
      recreateDisplay(currentRenderers, currentActiveId, els);
    });
  }

  if (els.btnEntrance) {
    els.btnEntrance.addEventListener('click', () => display.playEntrance());
  }

  syncToolbar3DState(els);
}
