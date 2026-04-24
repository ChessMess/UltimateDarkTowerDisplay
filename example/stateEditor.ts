import type { TowerDisplay, TowerStateReadout } from '../src/index';
import type { TowerState } from 'ultimatedarktower';
import type { DomElements } from './dom';
import { showBannerError, bindCopyButton } from './utils';
import { refreshLightingConfigBox, syncLightingEditorVisibility } from './lightingController';
import { is3DViewVisible } from './rendererController';
import { createReadmeExampleState, createRandomState, createAllOnState } from './presets';
import { resetSeals } from './sealController';

let cleanJson = '';

export function showState(state: TowerState, els: DomElements): void {
  if (!els.statePreview) return;
  const json = JSON.stringify(state, null, 2);
  els.statePreview.value = json;
  cleanJson = json;
  if (els.btnApply) els.btnApply.disabled = true;
}

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
  showState(state, els);
  if (is3DViewVisible()) refreshLightingConfigBox(getDisplay, els);
}

export function initStateEditor(
  getDisplay: () => TowerDisplay,
  getReadout: () => TowerStateReadout,
  setLastState: (s: TowerState) => void,
  els: DomElements
): void {
  if (els.statePreview) {
    els.statePreview.addEventListener('input', () => {
      if (els.btnApply) els.btnApply.disabled = els.statePreview!.value === cleanJson;
    });
  }

  if (els.btnCopy && els.statePreview) {
    bindCopyButton(els.btnCopy, () => els.statePreview!.value, els.banner);
  }

  if (els.btnApply) {
    els.btnApply.addEventListener('click', () => {
      if (!els.statePreview) return;
      try {
        if (els.banner) els.banner.hidden = true;
        const parsed = JSON.parse(els.statePreview.value) as TowerState;
        getDisplay().applyState(parsed);
        cleanJson = els.statePreview.value;
        els.btnApply!.disabled = true;
      } catch (err) {
        showBannerError(els.banner, 'Invalid JSON', err);
      }
    });
  }

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
      if (els.statePreview) {
        els.statePreview.value = 'Idle view: no state currently rendered.';
        cleanJson = els.statePreview.value;
        if (els.btnApply) els.btnApply.disabled = true;
      }
    });
  }

  if (els.btnResetSeals) {
    els.btnResetSeals.addEventListener('click', () => {
      resetSeals(getDisplay(), getReadout());
    });
  }
}

export function initInitialState(
  getDisplay: () => TowerDisplay,
  getReadout: () => TowerStateReadout,
  setLastState: (s: TowerState) => void,
  els: DomElements
): void {
  syncLightingEditorVisibility(getDisplay, els);
  if (els.stateBadge) els.stateBadge.textContent = 'readme example';
  applyAndShow(createReadmeExampleState(), getDisplay, getReadout, setLastState, els);
}
