import {
  attachSkullPhysics,
  DEFAULT_PHYSICS,
  type PhysicsConfig,
  type ResolvedPhysicsConfig,
  type SkullPhysicsHandle,
} from '../src/physics';
import { getDisplay, onViewChange } from './rendererController';
import { notifyPhysicsConfigChanged } from './configEditor';

let handle: SkullPhysicsHandle | null = null;

/**
 * Working `PhysicsConfig` accumulated from slider/JSON edits. We pass this
 * to `attachSkullPhysics` every time the renderer is recreated so the user's
 * tuning survives a 2D⇄3D switch.
 */
let workingConfig: PhysicsConfig = {};

export function getPhysicsHandle(): SkullPhysicsHandle | null {
  return handle;
}

function isThreeDActive(): boolean {
  return getDisplay().view3D !== null;
}

/** Read the current value of the 3D Options' Board Size slider. */
function readVisualBoardRadius(): number {
  const rng = document.getElementById('rng-board-size') as HTMLInputElement | null;
  return rng ? Number(rng.value) : DEFAULT_PHYSICS.board.radiusFactor;
}

/** Updaters invoked by `syncSlidersFromConfig` to mirror a resolved config into the UI. */
const sliderSyncers: Array<(cfg: ResolvedPhysicsConfig) => void> = [];

/**
 * Wire a slider input + label pair to a config writer. Clicking the label
 * resets to the default. `read(config)` extracts the current value from a
 * resolved config so `syncSlidersFromConfig` can re-populate the UI when
 * the user pastes a new JSON config.
 */
function wireSlider(
  rangeId: string,
  labelId: string,
  decimals: number,
  defaultValue: number,
  onChange: (value: number) => void,
  read: (cfg: ResolvedPhysicsConfig) => number,
): void {
  const rng = document.getElementById(rangeId) as HTMLInputElement | null;
  const lbl = document.getElementById(labelId);
  if (!rng || !lbl) return;
  lbl.textContent = Number(rng.value).toFixed(decimals);
  lbl.style.cursor = 'pointer';
  lbl.title = `Click to reset to ${defaultValue.toFixed(decimals)}`;

  const apply = (v: number, fire: boolean): void => {
    rng.value = String(v);
    lbl.textContent = v.toFixed(decimals);
    if (fire) onChange(v);
  };

  rng.addEventListener('input', () => apply(Number(rng.value), true));
  lbl.addEventListener('click', () => apply(defaultValue, true));

  sliderSyncers.push((cfg) => apply(read(cfg), false));
}

/**
 * Mirror a resolved physics config into every slider/label in the toolbar.
 * Called by `configEditor` after the user applies JSON, so the slider UI
 * stays in lockstep with the canonical config.
 */
export function syncSlidersFromConfig(cfg: ResolvedPhysicsConfig): void {
  for (const sync of sliderSyncers) sync(cfg);
}

/** Apply a partial config to both the live handle and our working config. */
function applyConfig(partial: PhysicsConfig): void {
  workingConfig = mergePartial(workingConfig, partial);
  handle?.applyPhysicsConfig(partial);
  // Keep the JSON preview in sync if the user is looking at the physics
  // config tab. No-op otherwise.
  notifyPhysicsConfigChanged();
}

/**
 * Shallow-merge each top-level domain (skull, drum, etc.) one level deep.
 * Sufficient because the `PhysicsConfig` shape is exactly two levels.
 */
function mergePartial(base: PhysicsConfig, patch: PhysicsConfig): PhysicsConfig {
  const out: PhysicsConfig = { ...base };
  for (const key of Object.keys(patch) as Array<keyof PhysicsConfig>) {
    const baseSection = base[key];
    const patchSection = patch[key];
    if (baseSection && patchSection) {
      out[key] = { ...baseSection, ...patchSection } as PhysicsConfig[typeof key];
    } else if (patchSection) {
      out[key] = patchSection as PhysicsConfig[typeof key];
    }
  }
  return out;
}

function reattach(): void {
  detach();
  const view = getDisplay().view3D;
  if (!view) return;
  // Ensure the board collider matches the current visual disc size before
  // colliders are built — the live slider's value is the source of truth
  // for board.radiusFactor while running in the example app.
  workingConfig = mergePartial(workingConfig, {
    board: { radiusFactor: readVisualBoardRadius() },
  });
  handle = attachSkullPhysics(view, workingConfig);
}

function detach(): void {
  if (handle) {
    handle.dispose();
    handle = null;
  }
}

export function initPhysicsController(): void {
  const btnDrop = document.getElementById('btn-drop-skull') as HTMLButtonElement | null;
  const chkDebug = document.getElementById('chk-physics-debug') as HTMLInputElement | null;

  if (btnDrop) {
    btnDrop.addEventListener('click', () => {
      if (!handle && isThreeDActive()) reattach();
      handle?.dropSkull();
    });
  }

  if (chkDebug) {
    chkDebug.addEventListener('change', () => {
      // The full Rapier debug overlay is built at attach time only, so
      // toggling it later requires a fresh attach.
      applyConfig({ debug: { colliders: chkDebug.checked } });
      if (handle) reattach();
    });
  }

  const chkSealDebug = document.getElementById('chk-seal-debug') as HTMLInputElement | null;
  if (chkSealDebug) {
    chkSealDebug.addEventListener('change', () => {
      applyConfig({ debug: { sealColliders: chkSealDebug.checked } });
    });
  }

  wireSlider(
    'rng-skull-radius', 'lbl-skull-radius', 3, DEFAULT_PHYSICS.skull.radiusFactor,
    (v) => applyConfig({ skull: { radiusFactor: v } }),
    (cfg) => cfg.skull.radiusFactor,
  );
  wireSlider(
    'rng-skull-friction', 'lbl-skull-friction', 2, DEFAULT_PHYSICS.skull.friction,
    (v) => applyConfig({ skull: { friction: v } }),
    (cfg) => cfg.skull.friction,
  );
  wireSlider(
    'rng-drum-friction', 'lbl-drum-friction', 3, DEFAULT_PHYSICS.drum.friction,
    (v) => applyConfig({ drum: { friction: v } }),
    (cfg) => cfg.drum.friction,
  );
  wireSlider(
    'rng-seal-friction', 'lbl-seal-friction', 3, DEFAULT_PHYSICS.seal.friction,
    (v) => applyConfig({ seal: { friction: v } }),
    (cfg) => cfg.seal.friction,
  );
  wireSlider(
    'rng-static-friction', 'lbl-static-friction', 3, DEFAULT_PHYSICS.static.friction,
    (v) => applyConfig({ static: { friction: v } }),
    (cfg) => cfg.static.friction,
  );
  wireSlider(
    'rng-board-friction', 'lbl-board-friction', 3, DEFAULT_PHYSICS.board.friction,
    (v) => applyConfig({ board: { friction: v } }),
    (cfg) => cfg.board.friction,
  );

  // The board collider radius mirrors the visual disc's `Board Size` slider
  // in 3D Options. Listening to its input events keeps the physics floor in
  // lockstep with whatever size the user has dialed in.
  const visualBoardSize = document.getElementById('rng-board-size') as HTMLInputElement | null;
  if (visualBoardSize) {
    visualBoardSize.addEventListener('input', () => {
      applyConfig({ board: { radiusFactor: Number(visualBoardSize.value) } });
    });
  }
  wireSlider(
    'rng-restitution', 'lbl-restitution', 2, DEFAULT_PHYSICS.skull.restitution,
    (v) => applyConfig({ skull: { restitution: v } }),
    (cfg) => cfg.skull.restitution,
  );
  wireSlider(
    'rng-skull-ang-damp', 'lbl-skull-ang-damp', 2, DEFAULT_PHYSICS.skull.angularDamping,
    (v) => applyConfig({ skull: { angularDamping: v } }),
    (cfg) => cfg.skull.angularDamping,
  );
  wireSlider(
    'rng-skull-lin-damp', 'lbl-skull-lin-damp', 2, DEFAULT_PHYSICS.skull.linearDamping,
    (v) => applyConfig({ skull: { linearDamping: v } }),
    (cfg) => cfg.skull.linearDamping,
  );

  // When the user switches renderers (e.g. from 2D-only to 3D), refresh
  // attachment so the physics hooks point at the current Tower3DView.
  onViewChange(() => {
    if (isThreeDActive()) {
      reattach();
    } else {
      detach();
    }
  });

  // Initial attach if 3D is already active at boot.
  if (isThreeDActive()) reattach();
}
