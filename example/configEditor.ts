import type { TowerDisplay } from '../src/index';
import type { LightingConfig, CameraConfig } from '../src/3d/types';
import type { TowerState } from 'ultimatedarktower';
import type { DomElements } from './dom';
import { is3DViewVisible, getLastState } from './rendererController';
import { showBannerError, bindCopyButton } from './utils';

type ConfigType = 'state' | 'lighting' | 'camera';

let activeConfigType: ConfigType = 'state';
let cleanConfigJson = '';

export function getActiveConfigType(): ConfigType {
  return activeConfigType;
}

export function refreshConfigPreview(getDisplay: () => TowerDisplay, els: DomElements): void {
  if (!els.configPreview) return;

  let json = '';

  if (activeConfigType === 'lighting') {
    const config = getDisplay().getLightingConfig();
    json = config ? JSON.stringify(config, null, 2) : '';
  } else if (activeConfigType === 'camera') {
    const config = getDisplay().getCameraConfig();
    json = config ? JSON.stringify(config, null, 2) : '';
  } else {
    const state = getLastState();
    json = state ? JSON.stringify(state, null, 2) : '';
  }

  els.configPreview.value = json;
  cleanConfigJson = json;
  if (els.btnApplyConfig) els.btnApplyConfig.disabled = true;
}

export function setConfigPreviewMessage(text: string, els: DomElements): void {
  if (activeConfigType !== 'state') {
    activeConfigType = 'state';
    if (els.selConfigType) els.selConfigType.value = 'state';
  }
  if (!els.configPreview) return;
  els.configPreview.value = text;
  cleanConfigJson = text;
  if (els.btnApplyConfig) els.btnApplyConfig.disabled = true;
}

export function syncConfigSelectorVisibility(getDisplay: () => TowerDisplay, els: DomElements): void {
  const visible = is3DViewVisible();
  const optLighting = document.getElementById('opt-lighting') as HTMLOptionElement | null;
  const optCamera = document.getElementById('opt-camera') as HTMLOptionElement | null;

  if (optLighting) optLighting.disabled = !visible;
  if (optCamera) optCamera.disabled = !visible;

  if (!visible && (activeConfigType === 'lighting' || activeConfigType === 'camera')) {
    activeConfigType = 'state';
    if (els.selConfigType) els.selConfigType.value = 'state';
    refreshConfigPreview(getDisplay, els);
  }
}

export function initConfigEditor(
  getDisplay: () => TowerDisplay,
  setLastState: (s: TowerState) => void,
  onStateApplied: (state: TowerState) => void,
  els: DomElements,
): void {
  if (els.selConfigType) {
    els.selConfigType.addEventListener('change', () => {
      activeConfigType = els.selConfigType!.value as ConfigType;
      refreshConfigPreview(getDisplay, els);
    });
  }

  if (els.configPreview) {
    els.configPreview.addEventListener('input', () => {
      if (els.btnApplyConfig) {
        els.btnApplyConfig.disabled = els.configPreview!.value === cleanConfigJson;
      }
    });
  }

  if (els.btnApplyConfig) {
    els.btnApplyConfig.addEventListener('click', () => {
      if (!els.configPreview) return;
      try {
        if (els.banner) els.banner.hidden = true;

        if (activeConfigType === 'lighting') {
          const parsed = JSON.parse(els.configPreview.value) as LightingConfig;
          getDisplay().applyLightingConfig(parsed);
          refreshConfigPreview(getDisplay, els);
        } else if (activeConfigType === 'camera') {
          const parsed = JSON.parse(els.configPreview.value) as CameraConfig;
          getDisplay().applyCameraConfig(parsed);
          refreshConfigPreview(getDisplay, els);
        } else {
          const parsed = JSON.parse(els.configPreview.value) as TowerState;
          getDisplay().applyState(parsed);
          setLastState(parsed);
          cleanConfigJson = els.configPreview.value;
          if (els.btnApplyConfig) els.btnApplyConfig.disabled = true;
          onStateApplied(parsed);
        }
      } catch (err) {
        showBannerError(els.banner, 'Invalid JSON', err);
      }
    });
  }

  if (els.btnCopyConfig && els.configPreview) {
    bindCopyButton(els.btnCopyConfig, () => els.configPreview!.value, els.banner);
  }
}
