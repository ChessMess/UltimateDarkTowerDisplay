# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
- New `showLedProxies` option on `TowerDisplayOptions` and `Tower3DViewOptions` (default `false`) — toggles the amber LED proxy spheres on/off. The amber proxies are now hidden by default; enable them as a layout/debugging aid.
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
