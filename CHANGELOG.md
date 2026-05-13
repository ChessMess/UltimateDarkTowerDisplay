# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.4.0]

### Added

- **Physics subpath** (`ultimatedarktowerdisplay/physics`) — physics-driven skulls inside the 3D view, available as an opt-in subpath import. Mirrors the Three.js `three/examples/jsm` pattern: same package, separate entry, separate output bundle. Consumers who don't import the subpath never load Rapier or pay any bundle cost for it. See [docs/PHYSICS.md](docs/PHYSICS.md) for the API and tuning guide.
  - Public API: `attachSkullPhysics(view, config?)`, `getPhysicsConfig()`, `applyPhysicsConfig(partial)`, `dropSkull()`, `dispose()`.
  - Single nested `PhysicsConfig` (mirrors the lighting-config pattern) with `DEFAULT_PHYSICS` and `resolvePhysics()` helpers.
  - `@dimforge/rapier3d-compat` is declared as an **optional peer dependency**. Install it only if you want physics:
    ```bash
    npm install ultimatedarktowerdisplay @dimforge/rapier3d-compat
    ```
  - TypeScript consumers need `moduleResolution: "bundler"` (or `"node16"` / `"nodenext"`) to resolve the subpath.

### Changed

- Build emits two ESM + two CJS bundles (`dist/index.{esm,cjs}.js` and `dist/physics.{esm,cjs}.js`) plus matching `.d.ts` files. Vite multi-entry lib mode.

## [0.3.0]

### Added

- **Physics integration hooks** — new public API surface on `Tower3DView` so external add-ons (e.g. a forthcoming `@ultimatedarktowerdisplay/physics` companion package) can integrate without reaching into view internals. Additions:
  - `Tower3DView.getPhysicsHooks(): TowerPhysicsHooks` — returns `{ scene, drumNode(level), onFrame(cb), onSealsApplied(cb), modelRadius, modelBottomY, modelTopY }`.
  - `ModelLoadResult.modelTopY` — world-space Y of the model's top edge (mirrors existing `modelBottomY`).
  - `DrumManager.getDrumNode(level)` — public accessor for a drum's Object3D.
  - `SealManager.onSealsApplied(cb)` — listener API fired after every `applySeals` call.
  - `TowerPhysicsHooks` type, exported from the package root.
  - Render loop now ticks registered `onFrame` callbacks (with a `THREE.Clock`-derived `dt`) before scene lighting and render, so physics-driven mesh transforms are reflected the same frame.
- Documentation: see the companion package's docs/PHYSICS.md (added separately) for the mental model and tuning guide.
- **Board thickness** — the game-board disc is now a `THREE.CylinderGeometry` instead of a flat `CircleGeometry`, giving it a visible edge and underside when the camera is at an oblique or below-board angle. Three new `boardDisc` config fields:
  - `boardDisc.thicknessFactor: number` — cylinder height as a fraction of `modelRadius` (default `0.06`). Exposed as a **Thickness** slider in the example app (range 0–0.12).
  - `boardDisc.edgeColor: HexColor` — colour of the side-wall face (default `0x5c3318`, warm medium wood). Example app exposes **Wood** (`0x5c3318`) and **Neoprene** (`0x0e0e0e`) preset buttons.
  - `boardDisc.bottomCap: boolean` — whether the underside face is rendered (default `true`). Example app exposes a **Board Bottom Face** checkbox.
- Upward `DirectionalLight` (`0xffe8c8`, intensity 1.5) added by `GroundDiscManager` to evenly illuminate the board's bottom face and edge ring when the camera dips below the board. The light is owned and disposed alongside the disc mesh.

### Changed

- `GroundDiscManager` now uses a 3-element material array `[sideMat, topMat, bottomMat]` on the disc mesh (matching `CylinderGeometry` material groups 0/1/2). All board-texture and lighting updates target `mats[1]` (top cap) so the edge and bottom cap colours are independent.

- Game-board image texture for the ground disc. The 3D view now loads `src/3d/assets/board.png` (real Return to Dark Tower board art) via `THREE.TextureLoader`, configured with sRGB color space, max anisotropy, and a calibrated rotation. New module: [`src/3d/GameBoardImageTexture.ts`](src/3d/GameBoardImageTexture.ts). Loading is async with a procedural-texture stand-in until the image resolves; the manager swaps `material.map` live when it lands. On failure (missing asset or fetch error) it logs a warning and falls back to procedural permanently for the session.
- `lighting.boardDisc.source: 'image' | 'procedural'` — picks which texture renders on the disc. Defaults to `'image'`; the existing procedural board ([`GameBoardTexture.ts`](src/3d/GameBoardTexture.ts)) is kept as the fallback.
- `lighting.boardDisc.northKingdom: 0 | 1 | 2 | 3` — rotates the image texture in 90° steps so any kingdom can face +Z. Live-updates without reloading the texture. No effect on `'procedural'` source.
- `lighting.boardDisc.brightness: number` — per-board diffuse multiplier (range 0–2, default 1). Stacks with `scene.exposure` and key/hemi intensity, so the board can be dimmed/brightened independently of the rest of the scene.
- Example app: new "Board" section under "3D Options" with **Board Size** and **Brightness** sliders. Board Size live-resizes the disc geometry via `groundDisc.radiusFactor`; Brightness drives `boardDisc.brightness`.

### Changed

- `GroundDiscManager` constructor now accepts an optional `maxAnisotropy` argument (forwarded by `Tower3DView` from `renderer.capabilities.getMaxAnisotropy()`). Required so the image texture is sharp at glancing camera angles.

### Fixed

- Expanding the "3D Options" panel in the example app no longer shrinks the rendered output. Previously, a `ResizeObserver` on the `<details>` element triggered a recomputation of the rendered panel's pixel height every time the panel opened/closed; the rendered area now keeps its initial height (still recomputes on window resize and toolbar layout changes).
- `boardDisc.enabled` JSDoc/runtime mismatch resolved. The JSDoc on [`types.ts`](src/3d/types.ts) used to say "Defaults to false" while the runtime default is `true`. JSDoc now matches runtime. The corresponding "Known gaps" entry has been removed from [`docs/LIGHTING.md`](docs/LIGHTING.md).
- Re-triggering the same audio sample (e.g. clicking the example app's "Trigger Sequence" button twice on the same sequence) now replays audio. Added an optional `force` parameter to `TowerDisplay.applyState`, `Tower3DView.applyState`, and `TowerSampleAudio.sync` — default `false` preserves dedup for BLE state-mirror callers; pass `true` for user-initiated retriggers. The `ITowerDisplay.applyState` interface now accepts an optional `force?: boolean` (non-breaking for library consumers; `TowerStateReadout` and `TowerSideView` accept and ignore it).

### Documentation

- Documentation sweep: `docs/API.md` is now the canonical API reference — added missing `TowerDisplay` method docs (`setLedOverride`, `setBoardDiscEnabled`, `setSkyboxUrl`, `getCameraConfig`, `applyCameraConfig`, `setZoomToCursor`, `loadState` getter), a new `TowerStateController` section, and the `clickToToggleLeds`/`onLedClick` properties on `TowerStateReadout`. README now points at `docs/API.md` for the full reference. Removed stale `showLedProxies` references from `README.md`, `docs/API.md`, and the contradictory "Added" entry in this changelog. Fixed outdated "V1" JSDoc on `Tower3DView` that claimed `applyState`/`applySeals` didn't drive visuals. Added missing JSDoc to `SideButtons`, `EFFECT_LABELS`, and three `TowerStateController` getters/methods.

### Removed

- Deprecated `computeSealBacklightPose` utility (an alias for `computeSealLedPose`) and its `__testables` re-export removed; the only callers were tests of the alias itself, which now exercise `computeSealLedPose` directly. Also removed unused `__setSealsAsMeshes` / `__setDrumNames` mock hooks from the GLTFLoader test mock.

### Added

- Ledge LEDs (layer 3) and base LEDs (layers 4–5) now render as ball-type visuals — a `MeshBasicMaterial` sphere proxy plus an additive halo `Sprite` — matching the seal backlight style. Previously ledge/base layers had only a `PointLight` with no visible mesh.
- `ledgeLeds` and `baseLeds` config sections in `LightingConfigCore` (and `DEFAULT_LIGHTING`), each with `enabled`, `color`, `proxy.enabled`, `proxy.sizeFactor`, `halo.enabled`, `halo.sizeFactor`, and `halo.opacity`. Live sliders exposed in the example app under "3D Options → Ledge LEDs / Base LEDs".
- `LEDGE_LED_LAYOUT`, `BASE1_LED_LAYOUT`, and `BASE2_LED_LAYOUT` layout constants in `constants.ts` — each has `y` (vertical height), `radius` (distance from tower axis), and `azimuthOffset` (angular shift in radians, positive = counter-clockwise from above). `BASE_LED_LAYOUT` has been removed; the two independent per-layer objects give separate control over layer-4 and layer-5 lights.
- Seal backlights (`SealManager`) redesigned: each of the 12 seal positions now gets a `MeshBasicMaterial` sphere proxy, an additive halo `Sprite`, and an optional atmospheric accent `PointLight`. Configurable via `lighting.leds.sealLeds` (`proxy`, `halo`, `accentLight`).
- `CameraController` accepts a `CameraConfig` object: `elevationFactor`, `targetHeightFactor`, `zoomToCursor`, and `preserveViewOnSideSelect`. Side-to-side camera snaps animate with a short zoom-dip tween (`SIDE_SNAP_DURATION_S = 0.4 s`). `onSideChange` callback fires on both user-driven orbits and programmatic `selectSide` calls.

### Changed

- LED position constants consolidated: `xOffset` (raw world-space X translation) replaced with `azimuthOffset` (rotation around the tower axis) on all layout objects. The old approach shifted lights asymmetrically — south/west lights moved further from the tower while north/east were brought closer. `azimuthOffset` rotates all 4 lights by the same angle so every light stays equidistant from the surface.
- `BASE_LED_LAYOUT` split into `BASE1_LED_LAYOUT` (layer 4) and `BASE2_LED_LAYOUT` (layer 5). Previously the shared `base1Y`/`base2Y` fields meant changing radius or azimuthOffset required touching one object but only half the lights would move in Y independently. Each layer now has a fully independent layout object.

### Removed

- **Breaking:** Deprecated flat `LightingConfig` aliases (`hemisphere`, `key`, `fill`, `exposure`) removed. Use the nested equivalents: `scene.hemisphere.intensity`, `scene.key.intensity`, `scene.fill.intensity`, `scene.exposure`.
- **Breaking:** Amber LED proxy sphere system removed (`showLedProxies` option on `TowerDisplayOptions` and `Tower3DViewOptions`, `leds.amber` in `LightingConfig`, `computeLedPosition` utility, `drumRadius`/`cornerRadius`/`ledSize` from `LED_LAYOUT`). The `LedRef` interface no longer carries `mesh`, `material`, or `light` fields.

### Changed

- Seal click-to-toggle state is now owned by `TowerDisplay` when composing renderers, so a seal click in the 2D side view also hides the corresponding mesh in the 3D view (and vice-versa for any external `applySeals` call). Previously the 2D view owned its own toggle set in isolation and the 3D view didn't react. Standalone `TowerSideView` usage (without `TowerDisplay`) is unchanged — the class keeps its internal toggle for backwards compatibility. `onSealClick` callback still fires exactly once per click, and `clickToToggleSeals: false` still fully disables toggling across both views.
- Removed the `[TowerSideView] Seal clicked: …` console.log lines from the 2D seal click handler. Consumers that need click events should use the `onSealClick` callback (unchanged).
- Example app (`example/example.ts`, `example/example-init.ts`) converted from JavaScript to TypeScript. The `typecheck` and `lint` npm scripts now cover `example/` via a new `tsconfig.example.json`.
- Consolidated every lighting-tunable value consumed by `Tower3DView` under a single nested `LightingConfig` (scene rig, LED emissive/halo, effect timings, entrance cinematic beats, idle breathing pulse, and the noir ground disc). The exported `DEFAULT_LIGHTING` captures today's values exactly and `resolveLighting()` deep-merges user overrides. The flat `{ hemisphere, key, fill, exposure }` fields are kept as deprecated aliases for pre-0.3 callers; when both a flat field and its nested equivalent are supplied, the nested value wins.

### Added

- `onLoadError` callback on `Tower3DView` (class property) and `TowerDisplayOptions` — fires with the raw error details when the GLB model fails to load. Previously failures were only reported via `console.error` with no signal to the consumer.
- `loadState` read-only getter on `Tower3DView` and `TowerDisplay` — returns `'pending' | 'ready' | 'error'` reflecting the current GLB load state. `TowerDisplay.loadState` returns `undefined` when no 3D renderer is active.

- Post-process bloom (`UnrealBloomPass`) on the 3D view. Bright LED proxy/halo pixels bleed outward in screen space as they appear through glyph cutouts, creating a glowing-presence effect instead of a bare LED pinhole. Controlled via `lighting.scene.bloom` (`enabled`, `strength`, `radius`, `threshold`). Live sliders in the example app under "3D Options → Bloom". Seal backlight halo defaults tuned (sizeFactor 0.10→0.14, opacity 0.6→0.75) and accent PointLight enabled by default (intensity 2) for a subtle drum-interior light spill.

- `Tower3DView` now rotates the three named drum meshes (`drum_top` / `drum_middle` / `drum_bottom`) to match `state.drum[i].position` whenever a new `TowerState` is applied. Rotations take the shortest arc, animate via a short tween, and fall back to a snap on the first state after model load. New opt-in rotation audio: `setDrumRotationSoundUrl(url)` and `setDrumRotationSoundEnabled(enabled)` on `TowerDisplay` and `Tower3DView`. With no URL set, a procedural sawtooth placeholder tone plays — drop in a recorded asset later via `setDrumRotationSoundUrl`. Disabled by default; enabling from a click satisfies browser autoplay-policy gestures.
- Seal grid in `TowerStateReadout` — a 3×4 grid of clickable buttons (4 sides × 3 levels) showing which seals are present (filled) or broken (hollow). Opt-in interactivity via the new `clickToToggleSeals` (default `false`) + `onSealClick` public fields; mirrors the existing `TowerSideView` API shape. Accessible as `<button>` with `aria-pressed`.
- `TowerDisplay.selectSide(side)` method + `onSideChange` option — programmatically select the facing side on every side-aware renderer; callback fires when the user or external code changes sides on any renderer. Public `selectSide` + `onSideChange` on both `TowerSideView` and `Tower3DView`. Cross-renderer fan-out means clicking a side button in 2D now rotates the 3D camera to match (and vice-versa) in combined views.
- Example app persists broken-seal state and selected side across view switches by treating a module-scoped `UltimateDarkTower` instance as the source of truth. New `example/sealController.ts` demonstrates the pattern for consumers. New "Reset Seals" preset button in the example.
- `Tower3DView.applySeals(brokenSeals)` is now a real implementation — hides/shows the corresponding seal meshes on the 3D model by name. The unified `TowerDisplay.applySeals` call already fanned out to the 3D renderer, but this was previously a no-op; it now drives both the 2D and 3D views identically. Naming contract for custom models via `modelUrl`: seal meshes must be named `seal_<side>_<level>` (e.g. `seal_north_top`, `seal_west_bottom`). Missing names are logged as a single `console.warn` at model-load time. The default bundled GLB ships with all 12 named seal nodes. Seal registry is lazily populated during GLB load; pre-load `applySeals` calls are stored and applied once the model resolves. See [docs/API.md](docs/API.md) for consumer-facing docs.
- `Tower3DView` now visualizes per-LED effects on the 3D model. 24 emissive LED proxies (amber, `#f0c040`) are placed at the tower's ring, ledge, and base positions, each with a short-range PointLight halo that spills onto nearby geometry. All six `LIGHT_EFFECTS` are supported: `off`, `on`, `breathe`, `breatheFast`, `breathe50percent`, `flicker`. Animation timings match the 2D side view (2.0s / 0.8s / 0.3s).
- Added red light layer to the 3D view (`#ff2020`) matching the physical tower's LED color. Red lights are positioned independently from the amber proxies: inset inside the drum for ring layers (0–2) so light shines through doors/seals, and near the outer corner surface for ledge/base layers (3–5) so light shines onto the faces. Red lights animate in lockstep with the amber driver — no additional GSAP tweens per LED.
- `debug3D` option on `TowerDisplayOptions` — forwarded to `Tower3DView` for diagnostic logging, render heartbeats, origin axes helper, and per-LED position axes helpers for layout tuning.

## [0.2.0] - 2026-04-15

### Fixed

- `TowerSideView` now calls `injectStyles()` so side-view-only mode gets CSS
- JSDoc for `TowerDisplayOptions.renderers` now correctly documents the default as `['readout', 'side-view']`

### Added

- Tests for seal overlay injection, double-dispose safety, and multi-button side selection
- `applySeals(brokenSeals: SealIdentifier[])` method on `TowerDisplay`, `TowerSideView`, and `ITowerDisplay` — hides seal SVG overlays for broken seals on the currently displayed side; re-evaluates when switching sides
- `SealIdentifier` re-exported from the package public API
- `clickToToggleSeals` option on `TowerDisplayOptions` (default `true`) — clicking a seal in the side view toggles its visibility independently of game state; user-toggled state and game-broken state are merged so either alone can hide a seal; toggle state is per-side and is cleared on `dispose()`
- `clickToToggleSeals` public property on `TowerSideView` for consumers using the class directly
- Console logging on seal click: logs the side, level, and new visibility state (or notes when toggle is disabled)

## [0.1.0] - 2026-03-22

### Added

- Initial release
- `TowerDisplay` wrapper class with options-based constructor
- `TowerStateReadout` core DOM renderer
- LED grid rendering with per-light effect labels (on, off, breathe, flicker, etc.)
- Drum position and calibration display with glyph lookup
- Audio sample name resolution via `TOWER_AUDIO_LIBRARY`
- Skull drop detection (beam count delta between consecutive states)
- LED sequence override labels via `TOWER_LIGHT_SEQUENCES`
- Volume description rendering
- Automatic CSS injection via `injectStyles()`
- Interactive example demo page
- TypeScript type exports (`TowerDisplayOptions`, `ITowerDisplay`)
- Dual ESM/CJS build via Vite library mode
