# UltimateDarkTowerDisplay

DOM-based visual readout for decoded [Ultimate Dark Tower](https://github.com/ChessMess/ultimatedarktower) tower state.

**[Live Demo](https://chessmess.github.io/UltimateDarkTowerDisplay/)**

This package renders a live tower dashboard into a DOM element. It is intended for tools that already know how to obtain or decode a `TowerState` and want a compact on-screen display of:

- LED layers and per-light effects (in text, 2D SVG, and emissive on a 3D model)
- Drum positions and calibration status
- Visible glyph on each calibrated drum
- Active audio sample, loop flag, and volume
- Beam/skull count and skull-drop transitions
- Active LED sequence override

## What This Package Does

`ultimatedarktowerdisplay` is a renderer. It does not talk to the physical tower, decode packets, or create `TowerState` objects on its own.

Use it alongside [`ultimatedarktower`](https://github.com/ChessMess/ultimatedarktower) (UDT), which is the library that:

- Connects to the physical Dark Tower over Bluetooth (Web Bluetooth in the browser, `@stoprocent/noble` in Node.js, custom adapters for React Native, etc.)
- Sends tower commands (lights, sounds, drum rotation)
- Decodes tower responses into the `TowerState` this package renders
- Provides the `TowerState` type and helpers such as `createDefaultTowerState()`, plus protocol constants like `LIGHT_EFFECTS`, `TOWER_AUDIO_LIBRARY`, and `TOWER_LIGHT_SEQUENCES`

This package is purely the visual layer — pair it with UDT when you want a live on-screen readout of a real tower, or use it with hand-constructed `TowerState` objects for testing and demos.

## Installation

```bash
npm install ultimatedarktowerdisplay ultimatedarktower
```

`ultimatedarktower` is a peer dependency and must be installed by the consuming app.

### Optional: physics add-on

Physics-driven skulls inside the 3D view ship as an **opt-in subpath** of this same package. To use them, also install Rapier (declared as an optional peer dependency):

```bash
npm install @dimforge/rapier3d-compat
```

```ts
import { attachSkullPhysics } from 'ultimatedarktowerdisplay/physics';
```

If you don't import the subpath, Rapier is never loaded and adds no bundle cost. See [docs/PHYSICS.md](docs/PHYSICS.md) for the API and tuning guide.

## Quick Start

```ts
import { TowerDisplay } from 'ultimatedarktowerdisplay';
import { createDefaultTowerState } from 'ultimatedarktower';

const container = document.getElementById('tower');

if (!container) {
  throw new Error('Missing #tower container');
}

const display = new TowerDisplay({ container });
const state = createDefaultTowerState();

display.applyState(state);

// Later, when the tower sends an updated decoded state:
// display.applyState(nextState);

// Reset to the idle placeholder.
display.showIdle();

// Remove rendered DOM when tearing down the view.
display.dispose();
```

Minimal HTML:

```html
<div id="tower"></div>
```

## Typical Integration

In most applications the flow looks like this:

1. Use `ultimatedarktower` to connect to the tower over Bluetooth and obtain a decoded `TowerState` (or, for testing, call `createDefaultTowerState()` and mutate fields directly).
2. Create a `TowerDisplay` for a container element.
3. Call `applyState(state)` whenever a new decoded state arrives.
4. Call `dispose()` when removing the view.

Example with a manually adjusted state:

```ts
import { TowerDisplay } from 'ultimatedarktowerdisplay';
import { createDefaultTowerState, LIGHT_EFFECTS, TOWER_AUDIO_LIBRARY } from 'ultimatedarktower';

const container = document.getElementById('tower');

if (!container) {
  throw new Error('Missing #tower container');
}

const display = new TowerDisplay({ container });
const state = createDefaultTowerState();

state.layer[0].light[0].effect = LIGHT_EFFECTS.on;
state.layer[0].light[1].effect = LIGHT_EFFECTS.breathe;
state.drum[0].position = 1;
state.drum[0].calibrated = true;
state.audio.sample = TOWER_AUDIO_LIBRARY.Ashstrider.value;
state.audio.loop = true;
state.beam.count = 2;

display.applyState(state);
```

## Expected `TowerState` Shape

You usually do not construct `TowerState` by hand. Start from `createDefaultTowerState()` and mutate fields you care about.

Conceptually, the renderer expects a state shaped like this:

```ts
type TowerState = {
  drum: Array<{
    calibrated: boolean;
    position: number;
  }>;
  layer: Array<{
    light: Array<{
      effect: number;
      loop: boolean;
    }>;
  }>;
  audio: {
    sample: number;
    loop: boolean;
    volume: number;
  };
  beam: {
    count: number;
    fault: boolean;
  };
  led_sequence: number;
};
```

For a valid starting point, prefer:

```ts
import { createDefaultTowerState } from 'ultimatedarktower';

const state = createDefaultTowerState();
```

The example page in [example/index.html](./example/index.html) follows this pattern.

## Rendering Behavior

- The constructor immediately renders an idle message: `Waiting for tower state…`
- Styles are injected into `document.head` automatically on first use
- A skull-drop highlight appears only when `beam.count` increases between successive `applyState()` calls
- `dispose()` clears the container and resets internal state, including skull-drop tracking

## API

### `TowerDisplay`

Primary entry point. Composes one or both renderers into a container.

```ts
new TowerDisplay(options: TowerDisplayOptions)
```

| Option               | Type                             | Default                    | Description                                                                                             |
| -------------------- | -------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------- |
| `container`          | `HTMLElement`                    | —                          | DOM element that will receive the rendered output                                                       |
| `renderers`          | `RendererType \| RendererType[]` | `['readout', 'side-view']` | Which renderer(s) to show: `'readout'`, `'side-view'`, `'3d-view'`, or any combination                  |
| `onSealClick`        | `(seal: SealIdentifier) => void` | —                          | Called whenever the user clicks a seal overlay in the side view                                         |
| `clickToToggleSeals` | `boolean`                        | `true`                     | When true, clicking a seal toggles its visibility independent of game state. Set to `false` to disable. |

Methods:

- `applyState(state: TowerState): void` — update all renderers with a new decoded tower state
- `applySeals(brokenSeals: SealIdentifier[]): void` — hide seal overlays for broken seals; pass the current list of broken seals each time it changes
- `showIdle(): void` — reset all renderers to their idle placeholder
- `dispose(): void` — remove all rendered DOM and reset internal state

### `TowerSideView`

SVG side-view renderer. Shows a rotatable view of one tower face with seal overlays and LED markers. Can be used standalone or composed via `TowerDisplay`.

```ts
const view = new TowerSideView(container);
view.onSealClick = (seal) => console.log(seal);
view.clickToToggleSeals = true; // default
```

| Property             | Type                             | Default | Description                                                  |
| -------------------- | -------------------------------- | ------- | ------------------------------------------------------------ |
| `onSealClick`        | `(seal: SealIdentifier) => void` | —       | Callback fired on every seal click                           |
| `clickToToggleSeals` | `boolean`                        | `true`  | Enables built-in click-to-toggle visibility on seal overlays |

### `Tower3DView`

Three.js model renderer. Loads the bundled tower GLB, supports orbit/pan/zoom, provides N/E/S/W side-snap and reset buttons, and mirrors LED state on the model as emissive amber proxies with halo spill light.

```ts
import { Tower3DView } from 'ultimatedarktowerdisplay';

const view3d = new Tower3DView(container, { debug3D: true });
view3d.applyState(state);
```

| Option             | Type      | Default     | Description                                                          |
| ------------------ | --------- | ----------- | -------------------------------------------------------------------- |
| `modelUrl`         | `string`  | bundled GLB | Override the default bundled model URL                               |
| `dracoDecoderPath` | `string`  | gstatic CDN | Override where Draco decoder wasm/js files are loaded from           |
| `debug3D`          | `boolean` | `false`     | Diagnostic console logs, render heartbeats, and per-LED axes helpers |

Exposes the same methods as `TowerDisplay` (`applyState`, `applySeals`, `showIdle`, `dispose`).

### `TowerStateReadout`

Text-based readout renderer. Lower-level; takes a container directly.

```ts
new TowerStateReadout(container: HTMLElement)
```

Exposes the same methods as `TowerDisplay` (`applyState`, `applySeals`, `showIdle`, `dispose`).

**Full API reference:** see [docs/API.md](docs/API.md) for every method, option, type, and the lighting/camera config shapes.

### Exported Types

- `ITowerDisplay` — common interface implemented by all renderers
- `TowerDisplayOptions` — configuration object for `TowerDisplay`
- `RendererType` — `'readout' | 'side-view' | '3d-view'`
- `TowerSide` — `'north' | 'east' | 'south' | 'west'`
- `SealIdentifier` — `{ side: TowerSide, level: TowerLevels }`

`ultimatedarktowerdisplay` does not re-export tower protocol constants or helpers from `ultimatedarktower`.

## Development

Install dependencies:

```bash
npm install
```

Available commands:

```bash
npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run build
npm run dev
npm run dev:example
npm run ci
```

`npm run dev:example` starts the Vite example page and opens [example/index.html](./example/index.html).

## License

MIT
