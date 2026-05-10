# API Reference

This document covers the public API exported by `ultimatedarktowerdisplay`.

## Exports

```ts
import {
  TowerDisplay,
  TowerStateReadout,
  TowerSideView,
  Tower3DView,
  TowerStateController,
} from 'ultimatedarktowerdisplay';
import type {
  TowerDisplayOptions,
  Tower3DViewOptions,
  TowerStateControllerOptions,
  CameraConfig,
  ITowerDisplay,
  RendererType,
  TowerSide,
  SealIdentifier,
} from 'ultimatedarktowerdisplay';
```

---

## Classes

### `TowerDisplay`

High-level wrapper that composes one or both renderers into a DOM container. Recommended entry point for most consumers.

```ts
const display = new TowerDisplay({
  container: document.getElementById('tower')!,
});
```

#### Constructor

```ts
new TowerDisplay(options: TowerDisplayOptions)
```

| Parameter                    | Type                             | Default                             | Description                                                                                                                                                                                                       |
| ---------------------------- | -------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `options.container`          | `HTMLElement`                    | —                                   | DOM element to render into                                                                                                                                                                                        |
| `options.renderers`          | `RendererType \| RendererType[]` | `['readout', 'side-view']`          | Which renderer(s) to show                                                                                                                                                                                         |
| `options.onSealClick`        | `(seal: SealIdentifier) => void` | —                                   | Callback fired whenever the user clicks a seal in the side view or the readout seal grid                                                                                                                          |
| `options.clickToToggleSeals` | `boolean`                        | `true`                              | When `true`, clicking a seal toggles its visibility across every active renderer (2D hides in 3D, and vice-versa). Set to `false` to disable click-driven toggling entirely.                                      |
| `options.onSideChange`       | `(side: TowerSide) => void`      | —                                   | Callback fired whenever the active side changes on any side-aware renderer — via an explicit `selectSide` call, a side-button click, or (for the 3D view) the user orbiting the camera into a new cardinal facing |
| `options.onLoadError`        | `(details: unknown) => void`     | —                                   | Callback fired if the 3D GLB model fails to load. Only fires when `renderers` includes `'3d-view'`. Check `display.loadState` to poll load status without a callback.                                             |
| `options.modelUrl`           | `string`                         | bundled GLB                         | Forwarded to `Tower3DView` — override the default bundled model URL                                                                                                                                               |
| `options.dracoDecoderPath`   | `string`                         | gstatic CDN                         | Forwarded to `Tower3DView` — override where Draco decoder wasm/js files are loaded from                                                                                                                           |
| `options.debug3D`            | `boolean`                        | `false`                             | Forwarded to `Tower3DView` — enables diagnostic logs, render heartbeats, and axes helpers                                                                                                                         |
| `options.showGroundDisc`     | `boolean`                        | `true`                              | Forwarded to `Tower3DView` — shows the noir ground disc that catches the key-light shadow                                                                                                                         |
| `options.lighting`           | `LightingConfig`                 | `DEFAULT_LIGHTING`                  | Forwarded to `Tower3DView` — see [`LightingConfig`](#lightingconfig)                                                                                                                                              |
| `options.camera`             | `CameraConfig`                   | see [`CameraConfig`](#cameraconfig) | Forwarded to `Tower3DView` — initial camera framing defaults and runtime behavior flags                                                                                                                           |

#### Methods

##### `applyState(state: TowerState): void`

Update all renderers with a new decoded tower state. Renders LED grid, drum positions, audio info, skull drops, and LED sequence overrides.

Obtain `TowerState` from the [`ultimatedarktower`](https://www.npmjs.com/package/ultimatedarktower) peer dependency.

**Skull drop detection:** The readout tracks `beam.count` across consecutive calls. When the count increases between two calls, a skull drop animation is shown.

##### `applySeals(brokenSeals: SealIdentifier[]): void`

Update seal visibility across every active renderer. Pass the full current list of broken seals; seals in the list are hidden, and any seals previously hidden but now absent from the list are restored. Call this whenever the set of broken seals changes.

- **Side view (2D):** seals are hidden via CSS opacity for the currently displayed side; switching sides re-evaluates visibility against the same list.
- **3D view:** each of the 12 seal meshes in the GLB model is resolved by name and its `Object3D.visible` flag is flipped. The default bundled model ships with the 12 named seal nodes. If you supply a custom `modelUrl`, the model must contain objects named `seal_<side>_<level>` (lowercase) for every `side ∈ {north, south, east, west}` and `level ∈ {top, middle, bottom}` — e.g. `seal_north_top`, `seal_west_bottom`. Missing names are logged once as a `console.warn` at load time and become silent no-ops for `applySeals`.
- **Click-to-toggle (`clickToToggleSeals`, default `true`):** `TowerDisplay` owns a user-toggle set that is merged with the external `brokenSeals` list before fan-out. Clicking a seal in the 2D view (or the readout seal grid when `TowerStateReadout` is registered as a renderer) flips its user-toggle state and immediately hides/shows it on every renderer. Clearing the external list (`applySeals([])`) does not clear user toggles — they persist until clicked again or until `dispose()`.

**Two patterns for managing seal state:**

1. **Simple (internal merge):** leave `clickToToggleSeals` at its default and let `TowerDisplay` track the user-toggle set itself. Best for short-lived demos or a single persistent `TowerDisplay` instance.
2. **External source of truth:** set `clickToToggleSeals: false`, provide `onSealClick`, and drive seal state from your own store (e.g. an `UltimateDarkTower` instance). Your callback decides what to do, then calls `display.applySeals(store.getBrokenSeals())`. Required if your app recreates the `TowerDisplay` on view switches — `dispose()` wipes the internal set, so the external store is what survives. See [`example/sealController.ts`](../example/sealController.ts) for a worked example.

##### `selectSide(side: TowerSide): void`

Select the facing side on every side-aware renderer (2D SVG + 3D camera). No-op for renderers that don't implement `selectSide` (e.g. the readout). Each view's `selectSide` early-returns if already on the requested side, so cross-view fan-out never loops.

##### `showIdle(): void`

Reset all renderers to their idle state.

##### `dispose(): void`

Remove all rendered DOM content and reset internal state. Also clears any user seal toggle state.

##### `setSceneLights(opts): void`

Live-tweak the 3D scene's light intensities and key-light position. No-op when no 3D view is active. All fields are optional.

```ts
display.setSceneLights({
  hemi?: number;      // hemisphere intensity
  key?: number;       // key light intensity
  fill?: number;      // fill light intensity
  exposure?: number;  // tone-mapping exposure
  keyX?: number;      // key light X position
  keyY?: number;      // key light Y position
  keyZ?: number;      // key light Z position
});
```

##### `getLightingConfig(): ResolvedLightingConfig | undefined`

Return a deep-cloned snapshot of the full resolved lighting configuration currently active in the 3D view. Returns `undefined` when no 3D renderer is active. Useful for reading back the current state after sliders or `setSceneLights` calls.

##### `applyLightingConfig(config: LightingConfig): void`

Resolve a new (partial) lighting config over the defaults and apply it immediately to the 3D scene — updating lights, materials, the ground disc, and LED effects. No-op when no 3D renderer is active.

```ts
display.applyLightingConfig({
  scene: { key: { intensity: 2.0 }, exposure: 0.85 },
  leds: { red: { color: 0xff0000 } },
});
```

##### `setGroundDiscVisible(visible: boolean): void`

Show or hide the noir ground disc that catches the key-light shadow. No-op when no 3D view is active.

##### `playEntrance(): void`

Trigger the cinematic entrance sequence on the 3D view: the tower silhouette fades up from black, the key light sweeps in and overshoots, then settles while the idle breathing pulse starts. Safe to call repeatedly — any in-flight entrance tween is cancelled before the new one begins. No-op when no 3D view is active.

##### `setDrumRotationSoundUrl(url: string | null): void`

Set the URL of the audio asset played in the 3D view while drums rotate. Pass `null` to fall back to a procedural placeholder tone. Decode happens in the background; rotations that fire mid-decode use the placeholder. No-op when no 3D view is active.

##### `setDrumRotationSoundEnabled(enabled: boolean): void`

Enable or disable drum rotation audio in the 3D view. Disabled by default — consumers must opt in (which also satisfies browser autoplay-policy gestures, since the toggle is typically wired to a click). No-op when no 3D view is active.

##### `setPreserveViewOnSideSelect(enabled: boolean): void`

Toggle the `preserveViewOnSideSelect` flag on the active 3D camera. When `true`, clicking a side button (or calling `selectSide`) rotates the camera azimuth to the new cardinal while preserving the current orbit target, tilt, pan offset, and zoom distance. When `false` (the default), the camera snaps back to the fitted default framing each time. No-op when no 3D view is active.

##### `setZoomToCursor(enabled: boolean): void`

Toggle whether scroll-wheel zoom-in moves the camera toward the cursor (`true`) or toward the orbit target (`false`). Zoom-out always uses the standard OrbitControls behavior. No-op when no 3D view is active.

##### `getCameraConfig(): Required<CameraConfig> | undefined`

Return a snapshot of the current resolved camera configuration (all four fields guaranteed present) on the 3D view. Returns `undefined` when no 3D renderer is active.

##### `applyCameraConfig(config: CameraConfig): void`

Apply a partial camera configuration at runtime. Any fields provided overwrite the corresponding current values; omitted fields are unchanged. No-op when no 3D view is active.

##### `setBoardDiscEnabled(enabled: boolean): void`

Show or hide the canvas-generated game board texture on the ground disc. No-op when no 3D view is active.

##### `setSkyboxUrl(url: string | null): void`

Set an equirectangular skybox image (or `.hdr`) URL on the 3D view. Pass `null` to clear the skybox. No-op when no 3D view is active.

##### `setLedOverride(layer: number, light: number, effect: number): void`

Programmatically override a single LED's effect on every active renderer. Equivalent to the user clicking the LED in the readout grid — the override is stored in the internal state controller, then re-applied on every subsequent `applyState`. Useful for driving LED state from a custom UI without going through a click event.

##### `loadState` (getter)

Read-only getter returning `'pending' | 'ready' | 'error' | undefined`. Reflects the current GLB load state of the 3D view. Returns `undefined` when no 3D renderer is active.

---

### `TowerSideView`

SVG side-view renderer showing one rotatable face of the tower with seal overlays and LED markers. Can be used standalone or composed via `TowerDisplay`.

```ts
const view = new TowerSideView(document.getElementById('tower')!);
view.onSealClick = (seal) => console.log(seal.side, seal.level);
```

#### Constructor

```ts
new TowerSideView(container: HTMLElement)
```

#### Public Properties

| Property             | Type                             | Default | Description                                                                |
| -------------------- | -------------------------------- | ------- | -------------------------------------------------------------------------- |
| `onSealClick`        | `(seal: SealIdentifier) => void` | —       | Callback fired on every seal click regardless of `clickToToggleSeals`      |
| `clickToToggleSeals` | `boolean`                        | `true`  | Enables built-in click-to-toggle visibility on seal overlays               |
| `onSideChange`       | `(side: TowerSide) => void`      | —       | Callback fired when the selected side changes (user click or `selectSide`) |

When `clickToToggleSeals` is `true`:

- Clicking an intact seal hides it.
- Clicking a hidden seal shows it again.
- Toggle state is tracked per `side + level` key and is independent of `applySeals()`.
- A console message is logged on each click with the seal identity and new visibility state.
- Toggle state is cleared on `dispose()`.

#### Methods

`applyState(state)`, `applySeals(brokenSeals)`, `showIdle()`, `dispose()`, plus:

##### `selectSide(side: TowerSide): void`

Programmatically change the active side. Updates the side-button state, re-applies LED mapping for the new face, and fires `onSideChange`. Early-returns when already on `side`.

---

### `TowerStateReadout`

Text-based readout renderer. Same interface as `TowerDisplay` but takes an `HTMLElement` directly. Renders LEDs, drums, audio, skulls, LED sequence overrides, and a 3×4 seal grid.

```ts
const readout = new TowerStateReadout(document.getElementById('tower')!);
readout.clickToToggleSeals = true;
readout.onSealClick = (seal) => console.log(seal);
readout.applyState(state);
readout.applySeals([{ side: 'north', level: 'top' }]);
```

#### Constructor

```ts
new TowerStateReadout(container: HTMLElement)
```

#### Public Properties

| Property             | Type                                                     | Default | Description                                                                                                                           |
| -------------------- | -------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `onSealClick`        | `(seal: SealIdentifier) => void`                         | —       | Callback fired when a seal button in the grid is clicked                                                                              |
| `clickToToggleSeals` | `boolean`                                                | `false` | When `true`, enables click interaction on the seal grid. Default is read-only                                                         |
| `onLedClick`         | `(layer: number, light: number, effect: number) => void` | —       | Callback fired when an LED indicator is clicked. Receives the new (cycled) effect value                                               |
| `clickToToggleLeds`  | `boolean`                                                | `false` | When `true`, clicking an LED indicator cycles it through all `LIGHT_EFFECTS` values (off → on → breathe → ...) and fires `onLedClick` |

The seal grid renders 12 buttons (4 sides × 3 levels); filled = present, hollow = broken. `applySeals` updates the grid. When `clickToToggleSeals` is `false` (the default for the readout), the buttons render as disabled — they still reflect state but don't emit events.

When `TowerStateReadout` is composed via `TowerDisplay`, both `clickToToggleSeals` and `clickToToggleLeds` are auto-enabled and the parent fans out the resulting state to every renderer (so a readout LED click also updates the 2D and 3D views).

#### Methods

Same as `TowerDisplay`: `applyState(state)`, `applySeals(brokenSeals)`, `showIdle()`, `dispose()`.

---

### `TowerStateController`

Pure (non-DOM) state controller — holds the latest `TowerState`, a user-toggle set of seal overrides, and a per-LED effect override map. Returns resolved (merged) state and seal lists for renderers. `TowerDisplay` instantiates one internally to fan out clicks; expose it directly when you need the same merge behavior outside the DOM (e.g. driving a custom renderer or running headless).

```ts
import { TowerStateController } from 'ultimatedarktowerdisplay';
const ctrl = new TowerStateController({ togglesEnabled: true });
const resolved = ctrl.applyState(state);
```

#### Constructor

```ts
new TowerStateController(options?: TowerStateControllerOptions)
```

| Option           | Type      | Default | Description                                                                      |
| ---------------- | --------- | ------- | -------------------------------------------------------------------------------- |
| `togglesEnabled` | `boolean` | `true`  | When `false`, `toggleSeal` is a no-op. Mirrors `TowerDisplay.clickToToggleSeals` |

#### Methods

| Method                                      | Returns              | Description                                                                                         |
| ------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------- |
| `applyState(state: TowerState)`             | `TowerState`         | Store `state`, merge in any active LED overrides, and return the resolved state for renderers       |
| `applySeals(brokenSeals: SealIdentifier[])` | `SealIdentifier[]`   | Store the external broken-seal list and return the deduplicated union with user toggles             |
| `toggleSeal(seal: SealIdentifier)`          | `SealIdentifier[]`   | Flip `seal`'s user-toggle state (when enabled) and return the resolved seal list                    |
| `setLedOverride(layer, light, effect)`      | `TowerState \| null` | Record a per-LED override; returns the resolved state, or `null` when no state has been applied yet |
| `getResolvedState()`                        | `TowerState \| null` | Get the latest applied state with LED overrides merged in                                           |
| `getResolvedSeals()`                        | `SealIdentifier[]`   | Get the deduplicated union of externally-broken seals and user-toggled seals                        |
| `reset()`                                   | `void`               | Clear stored state, all user toggles, and all LED overrides                                         |

---

### `Tower3DView`

Three.js model renderer. Loads the bundled tower GLB (or a custom URL), supports orbit controls, and provides side-snap + reset camera controls.

```ts
const view3d = new Tower3DView(document.getElementById('tower')!, {
  debug3D: true,
});
```

#### Constructor

```ts
new Tower3DView(container: HTMLElement, options?: Tower3DViewOptions)
```

#### Options (`Tower3DViewOptions`)

| Option             | Type             | Default                                                   | Description                                                                   |
| ------------------ | ---------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `modelUrl`         | `string`         | bundled GLB                                               | Override the default bundled model URL                                        |
| `dracoDecoderPath` | `string`         | `https://www.gstatic.com/draco/versioned/decoders/1.5.7/` | Override where Draco decoder wasm/js files are loaded from                    |
| `debug3D`          | `boolean`        | `false`                                                   | Enables diagnostic console logs, render heartbeats, and an origin axes helper |
| `showGroundDisc`   | `boolean`        | `true`                                                    | Show the noir ground disc that catches the key-light shadow                   |
| `lighting`         | `LightingConfig` | `DEFAULT_LIGHTING`                                        | Deep-merged nested config for every lighting-tunable value — see below        |
| `camera`           | `CameraConfig`   | see [`CameraConfig`](#cameraconfig)                       | Initial camera framing defaults and runtime behavior flags — see below        |

##### `LightingConfig`

> See [LIGHTING.md](LIGHTING.md) for the complete lighting reference — every subsystem (scene rig, bloom, red ring LEDs, seal backlights, ground disc, skybox, animations) with defaults, source links, and tuning recipes.

Every lighting-tunable value consumed by the 3D view lives under a single nested config. All fields are optional — unset fields fall back to the exported `DEFAULT_LIGHTING` constant. User-supplied values are deep-merged over the defaults at construction time.

````ts
interface LightingConfig {
  scene?: {
    background?: number; // 0x000000
    hemisphere?: { color?: number; ground?: number; intensity?: number }; // 0xffffff / 0x000000 / 0.04
    key?: {
      color?: number; // 0xffffff
      intensity?: number; // 1.6
      position?: [number, number, number]; // [3, 4.5, -1] — camera-local
      shadow?: {
        mapSize?: number; // 2048
        bias?: number; // -0.0003
        normalBias?: number; // 0.02
        frustumRadiusFactor?: number; // 1.3 × modelRadius
        farFactor?: number; // 10 × modelRadius
      };
    };
    fill?: {
      color?: number; // 0xffffff
      intensity?: number; // 0.02
      width?: number; // 1.5
      height?: number; // 2.5
      position?: [number, number, number]; // [-4, 1.5, -8] — camera-local
    };
    exposure?: number; // 0.7 (renderer tone-mapping)
    bloom?: {
      enabled?: boolean;     // true — enable post-process bloom (UnrealBloomPass)
      strength?: number;     // 1.5 — glow intensity (0–3)
      radius?: number;       // 0.5 — bloom spread (0–1)
      threshold?: number;    // 0.0 — luminance threshold (0 = all bright pixels)
    };
  };
  leds?: {
    red?: { color?: number; maxHalo?: number; haloDistanceFraction?: number };
  };
  animation?: {
    fadeS?: number; // 0.15 — on/off fade
    breatheS?: number; // 2.0  — breathe + breathe50%
    breatheFastS?: number; // 0.8
    flickerS?: number; // 0.3
    idleBreathe?: { peakFactor?: number; durationS?: number }; // 1.08 / 4 — key light pulse
  };
  entrance?: {
    peakKeyFactor?: number; // 2.5 — key overshoot during flash beat
    beats?: {
      /* 16 per-beat durations/delays/factors — see source for full list */
    };
  };
  groundDisc?: {
    color?: number; // 0x050505
    roughness?: number; // 0.92
    metalness?: number; // 0
    radiusFactor?: number; // 3 × modelRadius
  };

```ts
// Examples
new Tower3DView(el, { lighting: { scene: { exposure: 0.9 } } });
new Tower3DView(el, { lighting: { leds: { red: { color: 0x00ff00 } } } }); // green LEDs
new Tower3DView(el, { lighting: { animation: { breatheS: 3 } } }); // slower breathe
````

#### Public Properties

| Property       | Type                              | Default     | Description                                                                                                                                                                                                    |
| -------------- | --------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onSideChange` | `(side: TowerSide) => void`       | —           | Callback fired when the active side changes — either via `selectSide`, a side-button click, or the user orbiting the camera into a new cardinal facing (per-frame detection, fires once per quadrant crossing) |
| `onLoadError`  | `(details: unknown) => void`      | —           | Callback fired if the GLB model fails to load. Assign before or immediately after construction.                                                                                                                |
| `loadState`    | `'pending' \| 'ready' \| 'error'` | `'pending'` | Read-only getter reflecting the current GLB load state. Transitions to `'ready'` on success or `'error'` on failure.                                                                                           |

#### Methods

Core display methods: `applyState(state)`, `applySeals(brokenSeals)`, `showIdle()`, `dispose()`.

##### `setSceneLights(opts): void`

Same signature as [`TowerDisplay#setSceneLights`](#setscenelightsopts-void). Live-updates the active scene.

##### `getLightingConfig(): ResolvedLightingConfig`

Return a deep-cloned snapshot of the full resolved lighting config currently active in the scene. Useful for reading back values after `setSceneLights` calls or to seed a lighting editor.

##### `applyLightingConfig(config: LightingConfig): void`

Resolve a partial `LightingConfig` over the defaults and apply it to the live scene — updating lights, ground disc material, LED light colors, and replaying all current LED effects.

##### `setGroundDiscVisible(visible: boolean): void`

Show or hide the noir ground disc.

##### `playEntrance(): void`

Trigger the cinematic entrance sequence. See [`TowerDisplay#playEntrance`](#playentrance-void).

##### `setDrumRotationSoundUrl(url: string | null): void` / `setDrumRotationSoundEnabled(enabled: boolean): void`

Same signatures as the matching [`TowerDisplay`](#setdrumrotationsoundurlurl-string--null-void) methods. See [Drum rotation](#drum-rotation) below.

##### `setPreserveViewOnSideSelect(enabled: boolean): void`

Toggle whether side-button snaps preserve the current orbit state. See [`TowerDisplay#setPreserveViewOnSideSelect`](#setpreserveviewonsideselectenabled-boolean-void).

##### `getCameraConfig(): Required<CameraConfig>`

Return a snapshot of the current resolved camera configuration (all four fields guaranteed present). Reflects values that were last applied via the constructor `camera` option or `applyCameraConfig`. Returns synthesized defaults post-`dispose()`.

##### `applyCameraConfig(config: CameraConfig): void`

Apply a partial camera configuration at runtime. Any fields provided overwrite the corresponding current values; omitted fields are unchanged. If the model is loaded, `elevationFactor` / `targetHeightFactor` changes immediately refit the camera.

```ts
view3d.applyCameraConfig({ preserveViewOnSideSelect: true });
view3d.applyCameraConfig({ zoomToCursor: false, elevationFactor: -0.3 });
```

##### Drum rotation

`applyState()` rotates the three named drum meshes (`drum_top`, `drum_middle`, `drum_bottom`) around the Y axis to match `state.drum[i].position`. Rotations take the shortest arc and use a short tweened animation; the first state applied after the model loads snaps without animating. `calibrated` and `jammed` are intentionally not used to gate the rotation — the visual mirrors whatever the firmware reports.

Rotation audio is opt-in via `setDrumRotationSoundEnabled(true)`. While enabled, a sound plays whenever any drum is rotating. Provide an asset URL with `setDrumRotationSoundUrl(url)`; without one, a procedural sawtooth placeholder tone is used so the wiring is testable.

##### Tower sample audio

`applyState()` also drives sample playback from `state.audio` (sample id, loop flag, volume). Sample audio is opt-in — call `setSampleAudioEnabled(true)` (or the equivalent on `Tower3DView` directly) to activate it.

Volume is treated as binary: `state.audio.volume === 3` (the firmware's mute value) silences playback; all other volume values play at full gain. No intermediate gain levels are applied.

##### LED visualization

`applyState()` drives 24 red `PointLight` sources (`#ff2020`) matching the physical tower's LED color. Ring layers (0–2) are inset inside the drum so light shines outward through doors/seals; ledge/base layers (3–5) sit near the outer corner surface so light shines onto the faces.

All six `LIGHT_EFFECTS` values are supported:

| Effect             | Visual                             |
| ------------------ | ---------------------------------- |
| `off`              | Fades to dark (≈0.15s)             |
| `on`               | Steady full emission               |
| `breathe`          | Sine ease 0→1→0 over 2.0s, loops   |
| `breatheFast`      | Sine ease 0→1→0 over 0.8s, loops   |
| `breathe50percent` | Sine ease 0→0.5→0 over 2.0s, loops |
| `flicker`          | Stepped 1↔0.2 at 0.3s, loops       |

Timing parity with [`TowerSideView`](#towersideview) is intentional.

Enable `debug3D: true` to render a tiny axes helper at each LED origin for layout debugging.

---

## Interfaces

### `TowerDisplayOptions`

```ts
interface TowerDisplayOptions {
  /** DOM element to render into. */
  container: HTMLElement;
  /** Which renderer(s) to show. Defaults to ['readout', 'side-view']. */
  renderers?: RendererType | RendererType[];
  /** Called when the user clicks a seal overlay in the side view. */
  onSealClick?: (seal: SealIdentifier) => void;
  /**
   * When true (the default), clicking a seal toggles its visibility
   * independently of game state. Set to false to disable.
   */
  clickToToggleSeals?: boolean;
  /** Called when any side-aware renderer changes its selected side. */
  onSideChange?: (side: TowerSide) => void;
  /** Called if the 3D GLB model fails to load. Only fires when renderers includes '3d-view'. */
  onLoadError?: (details: unknown) => void;
  /** Optional override for the 3D view's GLB model URL. */
  modelUrl?: string;
  /** Optional override for where Draco decoder wasm/js files are loaded from. */
  dracoDecoderPath?: string;
  /** Enable verbose 3D diagnostics (logs, render heartbeats, axes helpers). Forwarded to Tower3DView. */
  debug3D?: boolean;
  /** Show the noir ground disc that catches the key-light shadow. Defaults to true. */
  showGroundDisc?: boolean;
  /** Nested lighting configuration forwarded to Tower3DView. See `LightingConfig`. */
  lighting?: LightingConfig;
  /** Initial camera framing defaults forwarded to Tower3DView. See `CameraConfig`. */
  camera?: CameraConfig;
}
```

### `ITowerDisplay`

Common interface implemented by `TowerDisplay`, `TowerSideView`, and `TowerStateReadout`.

```ts
interface ITowerDisplay {
  applyState(state: TowerState): void;
  applySeals(brokenSeals: SealIdentifier[]): void;
  showIdle(): void;
  dispose(): void;
}
```

### `RendererType`

```ts
type RendererType = 'readout' | 'side-view' | '3d-view';
```

### `Tower3DViewOptions`

```ts
interface Tower3DViewOptions {
  modelUrl: string;
  dracoDecoderPath?: string;
  debug3D?: boolean;
  showGroundDisc?: boolean;
  lighting?: LightingConfig;
  camera?: CameraConfig;
}
```

See the [`LightingConfig`](#lightingconfig) section above for the full shape.

### `CameraConfig`

Camera framing and behavior options. All fields are optional — unset fields fall back to their defaults.

```ts
interface CameraConfig {
  elevationFactor?: number; // default: -0.5
  targetHeightFactor?: number; // default: -0.15
  zoomToCursor?: boolean; // default: true
  preserveViewOnSideSelect?: boolean; // default: false
}
```

| Field                      | Default | Description                                                                                                                                                                       |
| -------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `elevationFactor`          | `-0.5`  | Camera eye height as a fraction of `modelRadius`. Negative values place the eye below the model's geometric centre.                                                               |
| `targetHeightFactor`       | `-0.15` | Vertical position of the orbit target (look-at point) as a fraction of `modelRadius`. Negative values aim the camera lower.                                                       |
| `zoomToCursor`             | `true`  | When `true`, scroll-wheel zoom-in moves the camera toward the cursor rather than the orbit target. Zoom-out always uses standard OrbitControls behavior.                          |
| `preserveViewOnSideSelect` | `false` | When `true`, selecting a cardinal side via the side buttons or `selectSide` rotates only the azimuth while keeping the current orbit target, tilt, pan, and zoom distance intact. |

### `TowerSide`

```ts
type TowerSide = 'north' | 'east' | 'south' | 'west';
```

### `SealIdentifier`

```ts
type SealIdentifier = { side: TowerSide; level: TowerLevels };
```

`TowerLevels` is `'top' | 'middle' | 'bottom'` — imported from `ultimatedarktower`.

---

## Rendered Sections

When `applyState()` is called, the display renders three sections:

### LEDs

A 6-layer x 4-light grid. Each light shows its effect as a data attribute:

| Effect       | CSS `data-effect` value |
| ------------ | ----------------------- |
| Off          | `off`                   |
| On           | `on`                    |
| Breathe      | `breathe`               |
| Breathe Fast | `breathe-fast`          |
| Breathe 50%  | `breathe-50`            |
| Flicker      | `flicker`               |

Layers are labeled by position (e.g., `top`, `upper-middle`, `lower-middle`, `bottom`) using `LAYER_TO_POSITION` from `ultimatedarktower`. Lights are labeled by compass direction (N, E, S, W) using `LIGHT_INDEX_TO_DIRECTION`.

### Drums

Three drums (Top, Middle, Bottom) showing:

- **Position** — compass direction (N, E, S, W)
- **Calibration** — checkmark or dash
- **Glyph** — the glyph name visible on the north-facing side (only when calibrated), resolved from `GLYPHS`

### Info

- **Audio** — sample name (resolved from `TOWER_AUDIO_LIBRARY`), loop flag, volume description
- **Skulls** — beam count with skull drop highlight when count increases
- **LED Sequence** — active sequence override label (resolved from `TOWER_LIGHT_SEQUENCES`), shown only when non-zero

---

## CSS Classes

### Readout (`tdr-` prefix)

All readout elements use the `tdr-` prefix:

| Class              | Element                       |
| ------------------ | ----------------------------- |
| `.tdr-idle`        | Idle/waiting message          |
| `.tdr-section`     | Section wrapper               |
| `.tdr-leds`        | LED section                   |
| `.tdr-layer`       | Single LED layer row          |
| `.tdr-layer-label` | Layer position label          |
| `.tdr-led`         | Individual LED indicator      |
| `.tdr-drums`       | Drums section                 |
| `.tdr-drum`        | Single drum row               |
| `.tdr-drum-name`   | Drum name (Top/Middle/Bottom) |
| `.tdr-drum-pos`    | Drum compass position         |
| `.tdr-drum-cal`    | Calibration indicator         |
| `.tdr-glyph`       | Glyph name                    |
| `.tdr-info`        | Info section                  |
| `.tdr-audio`       | Audio display                 |
| `.tdr-audio-name`  | Audio sample name             |
| `.tdr-audio-loop`  | Loop badge                    |
| `.tdr-audio-vol`   | Volume label                  |
| `.tdr-skull-drop`  | Skull drop highlight          |
| `.tdr-beam-count`  | Beam/skull count              |
| `.tdr-led-seq`     | LED sequence override label   |

### Side View (`tsv-` prefix)

| Class                               | Element                                        |
| ----------------------------------- | ---------------------------------------------- |
| `.tsv-wrapper`                      | Outer wrapper div                              |
| `.tsv-side-selector`                | N/E/S/W button bar                             |
| `.tsv-side-btn`                     | Individual side selector button                |
| `.tsv-side-btn[data-active="true"]` | Currently selected side button                 |
| `.tsv-svg`                          | SVG container div                              |
| `.tsv-seal`                         | Seal overlay SVG element (all seals)           |
| `.tsv-seal-top`                     | Top doorway seal                               |
| `.tsv-seal-middle`                  | Middle doorway seal                            |
| `.tsv-seal-bottom`                  | Bottom doorway seal                            |
| `.tsv-seal[data-broken="true"]`     | Hidden seal (opacity 0)                        |
| `.tsv-seal[data-broken="false"]`    | Visible seal                                   |
| `.tsv-led`                          | LED marker element                             |
| `.tsv-led[data-effect="<effect>"]`  | LED with active effect (same values as `tdr-`) |

---

## Peer Dependency

This package requires [`ultimatedarktower`](https://www.npmjs.com/package/ultimatedarktower) `^2.5.0` as a peer dependency. It provides:

- `TowerState` — the state type passed to `applyState()`
- `GLYPHS`, `TOWER_AUDIO_LIBRARY`, `TOWER_LIGHT_SEQUENCES`, `VOLUME_DESCRIPTIONS`, `LAYER_TO_POSITION`, `LIGHT_INDEX_TO_DIRECTION`, `LIGHT_EFFECTS` — lookup constants used for rendering
