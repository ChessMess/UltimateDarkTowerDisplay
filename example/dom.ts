export interface DomElements {
  banner: HTMLElement | null;
  editorPanel: HTMLElement | null;
  lightingSection: HTMLElement | null;
  statePreview: HTMLTextAreaElement | null;
  btnApply: HTMLButtonElement | null;
  btnCopy: HTMLButtonElement | null;
  lightingPreview: HTMLTextAreaElement | null;
  btnApplyLighting: HTMLButtonElement | null;
  btnCopyLighting: HTMLButtonElement | null;
  towerContainer: HTMLElement;
  readoutContainer: HTMLElement;
  stateBadge: HTMLElement | null;
  threeDOptionsEl: HTMLElement | null;
  rngHemi: HTMLInputElement | null;
  rngKey: HTMLInputElement | null;
  rngFill: HTMLInputElement | null;
  rngExposure: HTMLInputElement | null;
  rngKeyX: HTMLInputElement | null;
  rngKeyY: HTMLInputElement | null;
  rngKeyZ: HTMLInputElement | null;
  lblHemi: HTMLElement | null;
  lblKey: HTMLElement | null;
  lblFill: HTMLElement | null;
  lblExposure: HTMLElement | null;
  lblKeyX: HTMLElement | null;
  lblKeyY: HTMLElement | null;
  lblKeyZ: HTMLElement | null;
  debug3dCheckbox: HTMLInputElement | null;
  chkGroundDisc: HTMLInputElement | null;
  chkBoardDisc: HTMLInputElement | null;
  inpSkyboxUrl: HTMLInputElement | null;
  btnEntrance: HTMLElement | null;
  btnReadme: HTMLElement | null;
  btnRandom: HTMLElement | null;
  btnAllOn: HTMLElement | null;
  btnIdle: HTMLElement | null;
  btnResetSeals: HTMLElement | null;
  renderedPanel: HTMLElement | null;
  toolbarEl: Element | null;
}

export function queryDom(): DomElements {
  const towerContainer = document.getElementById('tower');
  const readoutContainer = document.getElementById('readout-container');

  if (!(towerContainer instanceof HTMLElement)) {
    throw new Error('Missing #tower container');
  }
  if (!(readoutContainer instanceof HTMLElement)) {
    throw new Error('Missing #readout-container');
  }

  return {
    banner: document.getElementById('error-banner'),
    editorPanel: document.getElementById('editor-panel'),
    lightingSection: document.getElementById('lighting-section'),
    statePreview: document.getElementById('state-preview') as HTMLTextAreaElement | null,
    btnApply: document.getElementById('btn-apply') as HTMLButtonElement | null,
    btnCopy: document.getElementById('btn-copy') as HTMLButtonElement | null,
    lightingPreview: document.getElementById('lighting-preview') as HTMLTextAreaElement | null,
    btnApplyLighting: document.getElementById('btn-apply-lighting') as HTMLButtonElement | null,
    btnCopyLighting: document.getElementById('btn-copy-lighting') as HTMLButtonElement | null,
    towerContainer,
    readoutContainer,
    stateBadge: document.getElementById('state-badge'),
    threeDOptionsEl: document.getElementById('three-d-options'),
    rngHemi: document.getElementById('rng-hemi') as HTMLInputElement | null,
    rngKey: document.getElementById('rng-key') as HTMLInputElement | null,
    rngFill: document.getElementById('rng-fill') as HTMLInputElement | null,
    rngExposure: document.getElementById('rng-exposure') as HTMLInputElement | null,
    rngKeyX: document.getElementById('rng-key-x') as HTMLInputElement | null,
    rngKeyY: document.getElementById('rng-key-y') as HTMLInputElement | null,
    rngKeyZ: document.getElementById('rng-key-z') as HTMLInputElement | null,
    lblHemi: document.getElementById('lbl-hemi'),
    lblKey: document.getElementById('lbl-key'),
    lblFill: document.getElementById('lbl-fill'),
    lblExposure: document.getElementById('lbl-exposure'),
    lblKeyX: document.getElementById('lbl-key-x'),
    lblKeyY: document.getElementById('lbl-key-y'),
    lblKeyZ: document.getElementById('lbl-key-z'),
    debug3dCheckbox: document.getElementById('chk-debug3d') as HTMLInputElement | null,
    chkGroundDisc: document.getElementById('chk-ground-disc') as HTMLInputElement | null,
    chkBoardDisc: document.getElementById('chk-board-disc') as HTMLInputElement | null,
    inpSkyboxUrl: document.getElementById('inp-skybox-url') as HTMLInputElement | null,
    btnEntrance: document.getElementById('btn-entrance'),
    btnReadme: document.getElementById('btn-readme'),
    btnRandom: document.getElementById('btn-random'),
    btnAllOn: document.getElementById('btn-allon'),
    btnIdle: document.getElementById('btn-idle'),
    btnResetSeals: document.getElementById('btn-reset-seals'),
    renderedPanel: document.getElementById('rendered-panel'),
    toolbarEl: document.querySelector('.toolbar'),
  };
}
