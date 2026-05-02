import type { TowerDisplay, TowerStateReadout } from '../src/index';
import type { TowerState } from 'ultimatedarktower';
import type { DomElements } from './dom';
import { refreshConfigPreview, setConfigPreviewMessage, syncConfigSelectorVisibility } from './configEditor';
import { refreshLightingConfigBox } from './lightingController';
import { is3DViewVisible, getLastState } from './rendererController';
import { createReadmeExampleState, createRandomState, createAllOnState } from './presets';
import { resetSeals } from './sealController';

const DRUM_INDEX_BY_LEVEL: Record<string, number> = { top: 0, middle: 1, bottom: 2 };

function setStateName(name: string, els: DomElements): void {
  if (els.stateBadge) els.stateBadge.textContent = name;
}

function applyAndShow(
  state: TowerState,
  getDisplay: () => TowerDisplay,
  getReadout: () => TowerStateReadout,
  setLastState: (s: TowerState) => void,
  els: DomElements
): void {
  setLastState(state);
  getDisplay().applyState(state);
  getReadout().applyState(state);
  refreshConfigPreview(getDisplay, els);
  refreshDrumRotateActive(state, els);
  if (is3DViewVisible()) {
    refreshLightingConfigBox(getDisplay, els);
  }
}

export function initStateEditor(
  getDisplay: () => TowerDisplay,
  getReadout: () => TowerStateReadout,
  setLastState: (s: TowerState) => void,
  els: DomElements
): void {
  if (els.btnReadme) {
    els.btnReadme.addEventListener('click', () => {
      setStateName('readme example', els);
      applyAndShow(createReadmeExampleState(), getDisplay, getReadout, setLastState, els);
    });
  }

  if (els.btnRandom) {
    els.btnRandom.addEventListener('click', () => {
      setStateName('randomized', els);
      applyAndShow(createRandomState(), getDisplay, getReadout, setLastState, els);
    });
  }

  if (els.btnAllOn) {
    els.btnAllOn.addEventListener('click', () => {
      setStateName('all leds on', els);
      applyAndShow(createAllOnState(), getDisplay, getReadout, setLastState, els);
    });
  }

  if (els.btnIdle) {
    els.btnIdle.addEventListener('click', () => {
      setStateName('idle', els);
      getDisplay().showIdle();
      getReadout().showIdle();
      setConfigPreviewMessage('Idle view: no state currently rendered.', els);
    });
  }

  if (els.btnResetSeals) {
    els.btnResetSeals.addEventListener('click', () => {
      resetSeals(getDisplay(), getReadout());
    });
  }

  if (els.drumRotateGrid) {
    els.drumRotateGrid.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      const level = target.dataset.drumLevel;
      const sideAttr = target.dataset.drumSide;
      if (!level || sideAttr === undefined) return;
      const drumIndex = DRUM_INDEX_BY_LEVEL[level];
      const side = Number(sideAttr);
      if (drumIndex === undefined || Number.isNaN(side)) return;

      const base = getLastState() ?? createReadmeExampleState();
      const next: TowerState = {
        ...base,
        drum: base.drum.map((d, i) =>
          i === drumIndex ? { ...d, position: side, calibrated: true } : { ...d },
        ) as TowerState['drum'],
      };
      setStateName(`drum ${level} → ${'NESW'[side]}`, els);
      applyAndShow(next, getDisplay, getReadout, setLastState, els);
      refreshDrumRotateActive(next, els);
    });
  }
}

export function refreshDrumRotateActive(state: TowerState, els: DomElements): void {
  if (!els.drumRotateGrid) return;
  const buttons = els.drumRotateGrid.querySelectorAll<HTMLButtonElement>('button[data-drum-level]');
  buttons.forEach((btn) => {
    const level = btn.dataset.drumLevel;
    const side = Number(btn.dataset.drumSide);
    const idx = level ? DRUM_INDEX_BY_LEVEL[level] : undefined;
    if (idx === undefined || Number.isNaN(side)) return;
    btn.classList.toggle('active', state.drum[idx]?.position === side);
  });
}

export function initInitialState(
  getDisplay: () => TowerDisplay,
  getReadout: () => TowerStateReadout,
  setLastState: (s: TowerState) => void,
  els: DomElements
): void {
  syncConfigSelectorVisibility(getDisplay, els);
  if (els.stateBadge) els.stateBadge.textContent = 'readme example';
  applyAndShow(createReadmeExampleState(), getDisplay, getReadout, setLastState, els);
}
