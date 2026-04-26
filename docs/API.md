# API Reference

This document covers the public API exported by `ultimatedarktowerdisplay`.

## Exports

```ts
import {
  TowerDisplay,
  TowerStateReadout,
  TowerSideView,
  Tower3DView,
} from 'ultimatedarktowerdisplay';
import type {
  TowerDisplayOptions,
  Tower3DViewOptions,
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

| Parameter                    | Type                             | Default                    | Description                                                                                                                                                                  |
| ---------------------------- | -------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `options.container`          | `HTMLElement`                    | —                          | DOM element to render into                                                                                                                                                   |
| `options.renderers`          | `RendererType \| RendererType[]` | `['readout', 'side-view']` | Which renderer(s) to show                                                                                                                                                    |
| `options.onSealClick`        | `(seal: SealIdentifier) => void` | —                          | Callback fired whenever the user clicks a seal in the side view or the readout seal grid                                                                                     |
| `options.clickToToggleSeals` | `boolean`                        | `true`                     | When `true`, clicking a seal toggles its visibility across every active renderer (2D hides in 3D, and vice-versa). Set to `false` to disable click-driven toggling entirely. |
| `options.onSideChange`       | `(side: TowerSide) => void`      | —                          | Callback fired whenever the user or an external `selectSide` call moves the active side on any side-aware renderer                                                           |
| `options.modelUrl`           | `string`                         | bundled GLB                | Forwarded to `Tower3DView` — override the default bundled model URL                                                                                                          |
| `options.dracoDecoderPath`   | `string`                         | gstatic CDN                | Forwarded to `Tower3DView` — override where Draco decoder wasm/js files are loaded from                                                                                      |
| `options.debug3D`            | `boolean`                        | `false`                    | Forwarded to `Tower3DView` — enables diagnostic logs, render heartbeats, and axes helpers                                                                                    |
| `options.showGroundDisc`     | `boolean`                        | `true`                     | Forwarded to `Tower3DView` — shows the noir ground disc that catches the key-light shadow                                                                                    |
| `options.lighting`           | `LightingConfig`                 | `DEFAULT_LIGHTING`         | Forwarded to `Tower3DView` — see [`LightingConfig`](#lightingconfig)                                                                                                         |

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

| Property             | Type                             | Default | Description                                                                   |
| -------------------- | -------------------------------- | ------- | ----------------------------------------------------------------------------- |
| `onSealClick`        | `(seal: SealIdentifier) => void` | —       | Callback fired when a seal button in the grid is clicked                      |
| `clickToToggleSeals` | `boolean`                        | `false` | When `true`, enables click interaction on the seal grid. Default is read-only |

The seal grid renders 12 buttons (4 sides × 3 levels); filled = present, hollow = broken. `applySeals` updates the grid. When `clickToToggleSeals` is `false` (the default for the readout), the buttons render as disabled — they still reflect state but don't emit events.

#### Methods

Same as `TowerDisplay`: `applyState(state)`, `applySeals(brokenSeals)`, `showIdle()`, `dispose()`.

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

##### `LightingConfig`

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
  /** Optional override for the 3D view's GLB model URL. */
  modelUrl?: string;
  /** Optional override for where Draco decoder wasm/js files are loaded from. */
  dracoDecoderPath?: string;
  /** Enable verbose 3D diagnostics (logs, render heartbeats, axes helpers). Forwarded to Tower3DView. */
  debug3D?: boolean;
  /** Show the amber LED proxy spheres. Defaults to false. */
  showLedProxies?: boolean;
  /** Show the noir ground disc that catches the key-light shadow. Defaults to true. */
  showGroundDisc?: boolean;
  /** Nested lighting configuration forwarded to Tower3DView. See `LightingConfig`. */
  lighting?: LightingConfig;
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
  modelUrl?: string;
  dracoDecoderPath?: string;
  debug3D?: boolean;
  showLedProxies?: boolean;
  showGroundDisc?: boolean;
  lighting?: LightingConfig;
}
```

See the [`LightingConfig`](#lightingconfig) section above for the full shape.

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
