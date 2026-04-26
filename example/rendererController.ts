import { TowerDisplay, TowerStateReadout } from '../src/index';
import type { TowerDisplayOptions, RendererType } from '../src/index';
import type { TowerState, TowerSide } from 'ultimatedarktower';
import type { DomElements } from './dom';
import { toggleSeal, refreshSeals } from './sealController';
import towerModelUrl from '../src/3d/assets/tower.glb?url';

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
let currentRenderers: RendererType | RendererType[] = 'side-view';
let currentActiveId: ViewButtonId = 'btn-view-2d';
let onViewChanged: (() => void) | null = null;

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

export function onViewChange(cb: () => void): void {
  onViewChanged = cb;
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
    lighting: {
      scene: {
        hemisphere: { intensity: sceneLights.hemiIntensity },
        key: { intensity: sceneLights.keyIntensity },
        fill: { intensity: sceneLights.fillIntensity },
      },
    },
  };
}

function setActiveViewButton(activeId: ViewButtonId): void {
  for (const id of Object.keys(viewButtons) as ViewButtonId[]) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', id === activeId);
  }
}

function syncToolbar3DState(els: DomElements): void {
  if (els.threeDOptionsEl) {
    els.threeDOptionsEl.classList.toggle('three-d-inactive', !is3DViewVisible());
  }
}

function recreateDisplay(renderers: RendererType | RendererType[], activeId: ViewButtonId, els: DomElements): void {
  display.dispose();
  currentRenderers = renderers;
  currentActiveId = activeId;
  display = new TowerDisplay(buildDisplayOptions(renderers, els));
  publishDisplay();
  setActiveViewButton(activeId);
  if (lastState) display.applyState(lastState);
  refreshSeals(display, readout);
  if (lastSide) display.selectSide(lastSide);
  syncToolbar3DState(els);
  onViewChanged?.();
}

export function initRendererController(els: DomElements): void {
  readout = new TowerStateReadout(els.readoutContainer);
  readout.clickToToggleSeals = true;
  readout.onSealClick = (seal) => toggleSeal(seal, display, readout);
  display = new TowerDisplay(buildDisplayOptions('side-view', els));
  publishDisplay();

  for (const [id, renderers] of Object.entries(viewButtons) as [ViewButtonId, RendererType | RendererType[]][]) {
    const btn = document.getElementById(id);
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
