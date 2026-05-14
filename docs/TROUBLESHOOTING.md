# Troubleshooting

*Docs: [Index](README.md) > All readers > Troubleshooting*

Predictable failure modes and their fixes. Each section is keyed by symptom. If you do not find your problem here, open an issue on [GitHub](https://github.com/ChessMess/UltimateDarkTowerDisplay/issues).

## Getting-started issues

### `Cannot find module 'ultimatedarktower'`

`ultimatedarktower` is a peer dependency, not a regular dependency. Your app installs it:

```bash
npm install ultimatedarktower
```

The same applies to `three` and `gsap` if you use `Tower3DView`, and to `@dimforge/rapier3d-compat` if you import the physics subpath.

### `engines.node` mismatch warning

This package requires Node.js 18 or newer. Upgrade Node, or set `engine-strict=false` in `.npmrc` to bypass with the understanding that older Node may break the build.

### TypeScript: subpath import `ultimatedarktowerdisplay/physics` not resolved

Set `compilerOptions.moduleResolution` to `"bundler"`, `"node16"`, or `"nodenext"` in `tsconfig.json`. The older `"node"` resolution does not understand the `exports` field that defines the subpath.

Runtime resolution by Vite, Webpack, Rollup, and esbuild works regardless of the `tsconfig` setting — this is a typecheck-only issue.

## Display shows idle and never updates

Most common causes, in order of likelihood:

1. **You never called `applyState`.** The constructor renders an idle placeholder; the placeholder stays until `applyState` is called.
2. **You called `applyState` on a disposed display.** A disposed `TowerDisplay` is not reusable. Construct a new one.
3. **The container is detached from the DOM.** `TowerDisplay` writes into the container element. If the element has been removed from `document.body` since construction, mutations still happen but are invisible.
4. **You constructed `TowerDisplay` before the container existed.** Check the container is in the DOM before `new TowerDisplay({ container })`. In React, build inside `useEffect`, not in the render body.

## GLB load failures

The 3D renderer loads `tower.glb` asynchronously. Failures surface in three places:

- `console.error` from Three.js.
- The `onLoadError` callback (constructor option), called once with the failure details.
- `display.loadState === 'error'` afterwards.

Common causes:

- **MIME type wrong.** The server must serve `.glb` as `model/gltf-binary` (or `application/octet-stream`). Some bundler dev servers default to `text/plain`, which breaks Three.js. Vite handles this correctly.
- **Path is wrong.** The default `modelUrl` is the bundled GLB. If you set `modelUrl` to a custom path, confirm the file is actually served at that URL (open it directly in a browser tab).
- **Draco decoder cannot load.** The Draco decoder defaults to gstatic CDN. If your CSP blocks external scripts, host the decoder yourself and pass `dracoDecoderPath: '/path/to/draco/'`.
- **Custom model is missing named nodes.** Custom models must contain `drum_top`, `drum_middle`, `drum_bottom` for drum rotation, and `seal_<side>_<level>` (lowercase, all 12) for seal visibility. Missing names log one warning and become silent no-ops.

For Electron the most common variant of this is `file://` URLs being blocked — see [ELECTRON](ELECTRON.md) for the `app://` protocol recipe.

## Rapier WASM not loading

The physics subpath loads Rapier's WebAssembly module on first `attachSkullPhysics` call.

- **Vite, esbuild, Rollup:** work out of the box.
- **Webpack 5:** add `experiments.asyncWebAssembly: true` to your webpack config.
- **Webpack 4:** not supported by Rapier's compat package; upgrade to Webpack 5.
- **No bundler (raw `<script type="module">`):** browsers ship WebAssembly natively, but you may need to serve Rapier's `.wasm` file with `Content-Type: application/wasm`.

If you do not import `ultimatedarktowerdisplay/physics`, Rapier is never loaded. The main package entry never references it.

## Web Bluetooth and user-gesture requirements

This package never opens a BLE connection. All BLE belongs to [`ultimatedarktower`](https://github.com/ChessMess/ultimatedarktower). The most common confusion: Web Bluetooth's `navigator.bluetooth.requestDevice` must be called from a user gesture (button click), or it throws.

The audio subsystem in `Tower3DView` has the same constraint. Browsers block audio playback until the user clicks something. Wire `setDrumRotationSoundEnabled(true)` and any audio-enabling toggle to a click handler, not to mount or to a state subscription.

Volume `3` in `TowerState.audio.volume` is the firmware's mute value. If you build a state by hand and audio is silent, check the volume.

## Electron-specific

Run in the renderer process, not the main process. The package mutates `document.head` on construction and depends on a real browser DOM.

Common Electron failures:
- **Blank rendered output, CSP error in console.** Default CSP forbids inline `<style>`. Pass `injectStyles: false` to `TowerDisplay` and inject the exported `TOWER_DISPLAY_CSS` constant via a hashed `<style>` tag or a `<link>` to a CSS file you control.
- **GLB does not load.** `file://` URLs misbehave. Use the `app://` protocol with a custom protocol handler that serves your packaged assets.
- **BLE picker does not open.** Set `BrowserWindow`'s `webPreferences.webBluetoothEnabled: true`. Then wire the `select-bluetooth-device` event on the session.

See [ELECTRON](ELECTRON.md) for the full walkthrough.

## Bundler resolution for the physics subpath

Symptom: typecheck reports `Cannot find module 'ultimatedarktowerdisplay/physics'` even though runtime works.

Fix: change `tsconfig.json`'s `compilerOptions.moduleResolution` from `"node"` to one of:

- `"bundler"` — newest, recommended for new projects.
- `"node16"` or `"nodenext"` — work, but require `.js` extensions on relative imports in some configurations.

The `package.json` `exports` field that defines the subpath is invisible to legacy `"node"` resolution.

## Idle state quirks

`showIdle()` resets every active renderer to its idle representation, but it does **not**:

- Unload the GLB. The model stays in memory; the next `applyState` is fast.
- Replay the entrance cinematic. Call `playEntrance()` explicitly if you want it.
- Clear user-toggled seals. Those persist until `dispose()` or until clicked again.

Calling `applyState` after `showIdle` immediately reanimates everything.

## Skull-drop detection edge cases

The readout's skull-drop highlight fires when `state.beam.count` is greater than the previous `applyState`'s `beam.count`.

- **Resets do not fire.** Setting `beam.count` to 0 (or any lower value) does not highlight. Resetting state through `Reset Seals` and `Empty` presets in the example does not trigger the animation.
- **Equal values do not fire.** Two identical `applyState` calls show no highlight even when `force: true` is passed (force only affects audio dedup).
- **`dispose()` clears tracking.** A new `TowerDisplay` starts at `beam.count = -Infinity` for tracking purposes, so the first `applyState` with `beam.count > 0` does fire.

## Audio sample does not replay on the same trigger

By design. The audio subsystem deduplicates identical successive packets to prevent retriggers when a BLE state-mirror caller resends a steady state.

To replay deliberately on a user click, pass `force: true`:

```ts
display.applyState(state, true);
```

In the example app, the Trigger button uses `force: true`; the live BLE subscription does not.

## 3D performance is slow

Bloom is the dominant cost. Disable it for low-end hardware:

```ts
display.applyLightingConfig({
  scene: { bloom: { enabled: false } },
});
```

Other levers:
- Lower `scene.shadow.mapSize` (default 2048).
- Skip the 3D renderer entirely if the device is constrained: `renderers: ['readout', 'side-view']`.
- Disable the ground disc: `setGroundDiscVisible(false)` or `lighting.groundDisc.enabled: false`.

The bundle itself is dominated by the 22 MB GLB. If GLB size is the bottleneck, supply your own smaller model via `modelUrl` — drum and seal naming must still match.

## See also

- [GETTING_STARTED](GETTING_STARTED.md) — install and prerequisites.
- [RENDERERS](RENDERERS.md) — capabilities and constraints per renderer.
- [ELECTRON](ELECTRON.md) — deep dive on Electron integration.
- [API](API.md) — option and method reference for every callback mentioned here.
