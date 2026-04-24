import type { TowerDisplay } from '../src/index';
import type { LightingConfig, ResolvedLightingConfig } from '../src/3d/types';
import type { DomElements } from './dom';
import { is3DViewVisible, getSceneLights } from './rendererController';
import { showBannerError, bindCopyButton } from './utils';

function syncSceneLightControls(lighting: ResolvedLightingConfig, els: DomElements): void {
  if (!lighting || !lighting.scene) return;

  const hemi = lighting.scene.hemisphere.intensity;
  const key = lighting.scene.key.intensity;
  const fill = lighting.scene.fill.intensity;
  const exposure = lighting.scene.exposure;
  const [keyX, keyY, keyZ] = lighting.scene.key.position;

  const sceneLights = getSceneLights();
  sceneLights.hemiIntensity = hemi;
  sceneLights.keyIntensity = key;
  sceneLights.fillIntensity = fill;

  const syncTargets: [HTMLInputElement | null, HTMLElement | null, number, number][] = [
    [els.rngHemi, els.lblHemi, hemi, 2], [els.rngKey, els.lblKey, key, 2],
    [els.rngFill, els.lblFill, fill, 2], [els.rngExposure, els.lblExposure, exposure, 2],
    [els.rngKeyX, els.lblKeyX, keyX, 1], [els.rngKeyY, els.lblKeyY, keyY, 1],
    [els.rngKeyZ, els.lblKeyZ, keyZ, 1],
  ];
  for (const [rng, lbl, val, dec] of syncTargets) {
    if (rng) rng.value = String(val);
    if (lbl) lbl.textContent = val.toFixed(dec);
  }
}

let cleanLightingJson = '';

export function refreshLightingConfigBox(getDisplay: () => TowerDisplay, els: DomElements): void {
  if (!els.lightingPreview) return;
  const lighting = getDisplay().getLightingConfig();
  if (!lighting) {
    els.lightingPreview.value = '';
    cleanLightingJson = '';
    if (els.btnApplyLighting) els.btnApplyLighting.disabled = true;
    return;
  }
  syncSceneLightControls(lighting, els);
  const json = JSON.stringify(lighting, null, 2);
  els.lightingPreview.value = json;
  cleanLightingJson = json;
  if (els.btnApplyLighting) els.btnApplyLighting.disabled = true;
}

export function syncLightingEditorVisibility(getDisplay: () => TowerDisplay, els: DomElements): void {
  const visible = is3DViewVisible();
  if (els.lightingSection) els.lightingSection.hidden = !visible;
  if (els.editorPanel) els.editorPanel.classList.toggle('panel-editors-3d', visible);
  if (visible) refreshLightingConfigBox(getDisplay, els);
}

function bindLightSlider(
  rng: HTMLInputElement | null,
  lbl: HTMLElement | null,
  apply: (v: number) => void,
  getDisplay: () => TowerDisplay,
  els: DomElements,
  decimals = 2
): void {
  if (!rng) return;
  rng.addEventListener('input', () => {
    const v = parseFloat(rng.value);
    if (lbl) lbl.textContent = v.toFixed(decimals);
    apply(v);
    if (is3DViewVisible()) refreshLightingConfigBox(getDisplay, els);
  });
}

export function initLightingController(getDisplay: () => TowerDisplay, els: DomElements): void {
  const sceneLights = getSceneLights();

  bindLightSlider(els.rngHemi, els.lblHemi, v => {
    sceneLights.hemiIntensity = v;
    getDisplay().setSceneLights({ hemi: v });
  }, getDisplay, els);

  bindLightSlider(els.rngKey, els.lblKey, v => {
    sceneLights.keyIntensity = v;
    getDisplay().setSceneLights({ key: v });
  }, getDisplay, els);

  bindLightSlider(els.rngFill, els.lblFill, v => {
    sceneLights.fillIntensity = v;
    getDisplay().setSceneLights({ fill: v });
  }, getDisplay, els);

  bindLightSlider(els.rngExposure, els.lblExposure, v => getDisplay().setSceneLights({ exposure: v }), getDisplay, els);
  bindLightSlider(els.rngKeyX, els.lblKeyX, v => getDisplay().setSceneLights({ keyX: v }), getDisplay, els, 1);
  bindLightSlider(els.rngKeyY, els.lblKeyY, v => getDisplay().setSceneLights({ keyY: v }), getDisplay, els, 1);
  bindLightSlider(els.rngKeyZ, els.lblKeyZ, v => getDisplay().setSceneLights({ keyZ: v }), getDisplay, els, 1);

  if (els.lightingPreview) {
    els.lightingPreview.addEventListener('input', () => {
      if (els.btnApplyLighting) {
        els.btnApplyLighting.disabled = els.lightingPreview!.value === cleanLightingJson;
      }
    });
  }

  if (els.btnApplyLighting) {
    els.btnApplyLighting.addEventListener('click', () => {
      if (!els.lightingPreview) return;
      try {
        if (els.banner) els.banner.hidden = true;
        const parsed = JSON.parse(els.lightingPreview.value) as LightingConfig;
        getDisplay().applyLightingConfig(parsed);
        refreshLightingConfigBox(getDisplay, els);
      } catch (err) {
        showBannerError(els.banner, 'Invalid JSON', err);
      }
    });
  }

  if (els.btnCopyLighting && els.lightingPreview) {
    bindCopyButton(els.btnCopyLighting, () => els.lightingPreview!.value, els.banner);
  }

  if (els.chkGroundDisc) {
    els.chkGroundDisc.addEventListener('change', () => {
      getDisplay().setGroundDiscVisible(els.chkGroundDisc!.checked);
      if (is3DViewVisible()) refreshLightingConfigBox(getDisplay, els);
    });
  }

  if (els.chkBoardDisc) {
    els.chkBoardDisc.addEventListener('change', () => {
      getDisplay().setBoardDiscEnabled(els.chkBoardDisc!.checked);
    });
  }

  if (els.inpSkyboxUrl) {
    els.inpSkyboxUrl.addEventListener('change', () => {
      getDisplay().setSkyboxUrl(els.inpSkyboxUrl!.value || null);
    });
  }
}
