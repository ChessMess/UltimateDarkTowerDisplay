import * as THREE from 'three';
import { LIGHT_EFFECTS } from 'ultimatedarktower';
import type { TowerState } from 'ultimatedarktower';
import { Tower3DView, __testables, DEFAULT_LIGHTING, resolveLighting } from '../../src/3d/Tower3DView';
import * as gltfLoaderMock from '../__mocks__/gltfLoader.js';
import * as gsapMock from '../__mocks__/gsap.js';

const {
  LED_LAYOUT, LEDGE_LED_LAYOUT, RING_AZIMUTH, CORNER_AZIMUTH,
  computeRedLightPosition, RED_LIGHT_LAYOUT, getLedRef,
  getSealNode, getSealNodeCount,
  computeSealLedPose, getSealBacklight, getSealBacklightCount,
  tickLightsGate, isLightsGateOpen,
} = __testables;

const EPS = 1e-9;
const close = (a: number, b: number, eps = EPS): boolean => Math.abs(a - b) < eps;

const TEST_MODEL_URL = 'mock://tower.glb';

function makeLayer(): TowerState['layer'][number] {
  return {
    light: [
      { effect: LIGHT_EFFECTS.off, loop: false },
      { effect: LIGHT_EFFECTS.off, loop: false },
      { effect: LIGHT_EFFECTS.off, loop: false },
      { effect: LIGHT_EFFECTS.off, loop: false },
    ],
  };
}

function makeState(): TowerState {
  return {
    drum: [
      { jammed: false, calibrated: false, position: 0, playSound: false, reverse: false },
      { jammed: false, calibrated: false, position: 0, playSound: false, reverse: false },
      { jammed: false, calibrated: false, position: 0, playSound: false, reverse: false },
    ],
    layer: [makeLayer(), makeLayer(), makeLayer(), makeLayer(), makeLayer(), makeLayer()],
    audio: { sample: 0, loop: false, volume: 0 },
    beam: { count: 0, fault: false },
    led_sequence: 0,
  };
}

describe('computeRedLightPosition', () => {
  const R = 1.0;

  it('layer 0 light 0 (ring, North) → inset inside drum at topY', () => {
    const p = computeRedLightPosition(0, 0, R);
    expect(p.x).toBeCloseTo(0, 10);
    expect(p.y).toBeCloseTo(LED_LAYOUT.topY, 10);
    expect(p.z).toBeCloseTo(RED_LIGHT_LAYOUT.ringInsetRadius, 10);
  });

  it('layer 0 light 1 (ring, East) → +X axis inset at topY', () => {
    const p = computeRedLightPosition(0, 1, R);
    expect(p.x).toBeCloseTo(RED_LIGHT_LAYOUT.ringInsetRadius, 10);
    expect(p.y).toBeCloseTo(LED_LAYOUT.topY, 10);
    expect(p.z).toBeCloseTo(0, 10);
  });

  it('layer 3 light 0 (ledge, NE) → LEDGE_LED_LAYOUT radius at LEDGE_LED_LAYOUT y', () => {
    const p = computeRedLightPosition(3, 0, R);
    const expected = Math.sin(Math.PI / 4) * LEDGE_LED_LAYOUT.radius;
    expect(p.x).toBeCloseTo(expected, 10);
    expect(p.y).toBeCloseTo(LEDGE_LED_LAYOUT.y, 10);
    expect(p.z).toBeCloseTo(expected, 10);
  });

  it('scales linearly with radius', () => {
    const p1 = computeRedLightPosition(0, 0, 1.0);
    const p2 = computeRedLightPosition(0, 0, 2.5);
    expect(p2.x).toBeCloseTo(p1.x * 2.5, 10);
    expect(p2.y).toBeCloseTo(p1.y * 2.5, 10);
    expect(p2.z).toBeCloseTo(p1.z * 2.5, 10);
  });
});

describe('Tower3DView instance', () => {
  let container: HTMLElement;

  beforeAll(() => {
    // jsdom has no ResizeObserver — stub it so initScene() can construct one.
    (global as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe(): void { }
      unobserve(): void { }
      disconnect(): void { }
    };
  });

  beforeEach(() => {
    gltfLoaderMock.__reset();
    gsapMock.__reset();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  describe('applyState', () => {
    it('after load, drives every LED to its effect outcome', () => {
      // Per-LED effects are now firmware-accurate: on/off write instantly
      // (no GSAP tween), breathe/breatheFast/breathe50 use a single tween,
      // flicker uses a timeline. So we assert per-LED state, not tween count.
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });
      gsapMock.__reset();

      const state = makeState();
      state.layer[0].light[0].effect = LIGHT_EFFECTS.on;
      state.layer[1].light[2].effect = LIGHT_EFFECTS.breathe;
      state.layer[5].light[3].effect = LIGHT_EFFECTS.flicker;

      view.applyState(state);

      // §4.19 interior-sprites: redLight is null. driver.v is the canonical
      // "is this LED lit" signal — proxy/halo/interior-sprite writes consume it.
      expect(getLedRef(view, 0, 0)!.redLight).toBeNull();
      expect(getLedRef(view, 0, 0)!.driver.v).toBeCloseTo(1.0, 10);
      // Default-off LEDs end up dark.
      expect(getLedRef(view, 2, 1)!.driver.v).toBeCloseTo(0, 10);
      // Breathe creates exactly one yoyo tween for that LED.
      const breatheRef = getLedRef(view, 1, 2)!;
      expect(breatheRef.tween).not.toBeNull();
      // Flicker uses a timeline (no plain `gsap.to` for that LED).
      expect(getLedRef(view, 5, 3)!.tween).not.toBeNull();
      view.dispose();
    });

    it('replays latestState when buildLeds runs after pre-load applyState', async () => {
      gltfLoaderMock.__setAutoLoad(false);
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });

      const state = makeState();
      state.layer[0].light[0].effect = LIGHT_EFFECTS.on;

      view.applyState(state);
      // No LEDs built yet, so no per-LED state has been applied.
      expect(getLedRef(view, 0, 0)).toBeUndefined();

      const loader = gltfLoaderMock.__getLastInstance();
      loader.fireLoad();

      // The load callback is async (it awaits prewarmLightPrograms). Yield to
      // the microtask queue so applyState (which runs after the prewarm await)
      // can fire before we assert.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // After buildLeds finishes, replayAll wrote the `on` effect to (0,0).
      // §4.19 interior-sprites: redLight is null; assert driver.v instead.
      expect(getLedRef(view, 0, 0)!.driver.v).toBeCloseTo(1.0, 10);
      view.dispose();
    });
  });

  describe('showIdle', () => {
    it('drives every LED off (instant write, no tween)', () => {
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });
      gsapMock.__reset();

      view.showIdle();

      // Off is now a firmware-accurate instant write — no GSAP tweens.
      expect(gsapMock.__getTweens().length).toBe(0);
      tickLightsGate(view); // gate normally runs in rAF; drive manually in jsdom
      // §4.19 interior-sprites: redLight is null on every LED. Assert via driver.v
      // (the canonical "lit" signal) and isLightsGateOpen (covers the gate state).
      for (let layer = 0; layer < 6; layer++) {
        for (let light = 0; light < 4; light++) {
          const ref = getLedRef(view, layer, light)!;
          expect(ref.redLight).toBeNull();
          expect(ref.driver.v).toBeCloseTo(0, 10);
        }
      }
      expect(isLightsGateOpen(view)).toBe(false);
      view.dispose();
    });
  });

  describe('dispose', () => {
    it('kills every active LED animation and clears the ledRefs map', () => {
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });

      // Use breathe so every LED gets a live tween we can verify is killed.
      const state = makeState();
      for (const layer of state.layer) {
        for (const light of layer.light) light.effect = LIGHT_EFFECTS.breathe;
      }
      view.applyState(state);

      const ledTweens = gsapMock.__getTweens().slice(-24);
      expect(ledTweens.length).toBe(24);
      expect(ledTweens.every((t: { killed: boolean }) => !t.killed)).toBe(true);

      view.dispose();

      expect(ledTweens.every((t: { killed: boolean }) => t.killed)).toBe(true);
    });
  });

  describe('red light creation', () => {
    it('§4.19 interior-sprites: redLight is null for every LED (all 24 ring/ledge/base PointLights removed)', () => {
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });
      for (let layer = 0; layer < 6; layer++) {
        for (let light = 0; light < 4; light++) {
          const ref = getLedRef(view, layer, light);
          expect(ref).toBeDefined();
          expect(ref!.redLight).toBeNull();
        }
      }
      view.dispose();
    });
  });

  describe('breathe / breatheFast reset driver.v to 0 before animating', () => {
    it('breathe resets driver.v to 0 when switching from on (was stuck at v=1)', () => {
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });
      gsapMock.__reset();

      // First apply "on" so driver.v reaches 1
      const onState = makeState();
      onState.layer[0].light[0].effect = LIGHT_EFFECTS.on;
      view.applyState(onState);
      const ref = getLedRef(view, 0, 0)!;
      ref.driver.v = 1; // simulate tween having completed

      gsapMock.__reset();

      // Now switch to breathe — driver.v must be reset to 0 so the yoyo range is [0,1]
      const breatheState = makeState();
      breatheState.layer[0].light[0].effect = LIGHT_EFFECTS.breathe;
      view.applyState(breatheState);

      expect(ref.driver.v).toBe(0);
      const tween = gsapMock.__getTweens().find(
        (t: { target: object; vars: { v: number } }) => t.target === ref.driver && t.vars.v === 1
      );
      expect(tween).toBeDefined();
      view.dispose();
    });

    it('breatheFast resets driver.v to 0 when switching from on', () => {
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });
      gsapMock.__reset();

      const onState = makeState();
      onState.layer[0].light[0].effect = LIGHT_EFFECTS.on;
      view.applyState(onState);
      const ref = getLedRef(view, 0, 0)!;
      ref.driver.v = 1;

      gsapMock.__reset();

      const breatheFastState = makeState();
      breatheFastState.layer[0].light[0].effect = LIGHT_EFFECTS.breatheFast;
      view.applyState(breatheFastState);

      expect(ref.driver.v).toBe(0);
      const tween = gsapMock.__getTweens().find(
        (t: { target: object; vars: { v: number } }) => t.target === ref.driver && t.vars.v === 1
      );
      expect(tween).toBeDefined();
      view.dispose();
    });
  });

  describe('lockstep animation', () => {
    it('write() drives driver.v through the GSAP onUpdate callback', () => {
      // Use `breathe` so we have a live tween whose onUpdate we can fire to
      // exercise the writeLed() pipeline. (`on` is now an instant write —
      // no tween, no onUpdate.) §4.19 interior-sprites: redLight is null, so
      // assert driver.v (the canonical lit signal) instead of redLight state.
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });
      gsapMock.__reset();

      const state = makeState();
      state.layer[0].light[0].effect = LIGHT_EFFECTS.breathe;
      view.applyState(state);

      const ref = getLedRef(view, 0, 0)!;
      expect(ref.tween).not.toBeNull();
      expect(ref.redLight).toBeNull();

      ref.driver.v = 0.7;
      (ref.tween as unknown as { vars: { onUpdate: () => void } }).vars.onUpdate();
      tickLightsGate(view); // any-active → gate opens

      expect(ref.driver.v).toBeCloseTo(0.7, 10);
      expect(isLightsGateOpen(view)).toBe(true);
      view.dispose();
    });

    it('write() with zero driver leaves gate closed', () => {
      // §4.19 interior-sprites: with redLight null, the only observable state
      // is driver.v + gate. The bulk-lights gate (in startRenderLoop tick)
      // remains as a no-op machinery for any future alternative that
      // re-introduces per-LED PointLights.
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });
      gsapMock.__reset();

      const state = makeState();
      state.layer[0].light[0].effect = LIGHT_EFFECTS.breathe;
      view.applyState(state);

      const ref = getLedRef(view, 0, 0)!;
      ref.driver.v = 0;
      (ref.tween as unknown as { vars: { onUpdate: () => void } }).vars.onUpdate();
      tickLightsGate(view); // no LEDs active → gate closes

      expect(ref.driver.v).toBeCloseTo(0, 10);
      expect(isLightsGateOpen(view)).toBe(false);
      view.dispose();
    });
  });

  describe('bulk lights gate', () => {
    it('opens when any LED has driver.v > 0.001 and closes when all are 0', () => {
      // §4.19 interior-sprites: gate flag is preserved for future alternatives
      // (and for the seal accent light when re-introduced) even though all
      // 36 PointLights are gone on this branch. The flag itself still tracks
      // any-LED-active correctly.
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });

      // Initial: gate closed (all LEDs idle)
      tickLightsGate(view);
      expect(isLightsGateOpen(view)).toBe(false);

      // Drive one LED to nonzero → gate opens
      getLedRef(view, 0, 0)!.driver.v = 0.5;
      tickLightsGate(view);
      expect(isLightsGateOpen(view)).toBe(true);

      // Drop back to 0 → gate closes
      getLedRef(view, 0, 0)!.driver.v = 0;
      tickLightsGate(view);
      expect(isLightsGateOpen(view)).toBe(false);

      view.dispose();
    });
  });

  describe('dispose cleans up red lights', () => {
    it('§4.19 interior-sprites: redLight is null on every LedRef (nothing to detach)', () => {
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });
      const state = makeState();
      for (const layer of state.layer) {
        for (const light of layer.light) light.effect = LIGHT_EFFECTS.on;
      }
      view.applyState(state);

      const refs = [];
      for (let layer = 0; layer < 6; layer++) {
        for (let light = 0; light < 4; light++) {
          refs.push(getLedRef(view, layer, light)!);
        }
      }
      expect(refs.every(r => r.redLight === null)).toBe(true);

      view.dispose();

      // Same after dispose; the dispose loop just no-ops the null-guarded
      // removeFromParent. The ledRefs map is cleared (asserted elsewhere).
      expect(refs.every(r => r.redLight === null)).toBe(true);
    });
  });

  describe('collectPerfReport', () => {
    it('returns a structured PerfReport with the expected fields', async () => {
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });

      // Short duration so the test runs fast; rAF in jsdom is shimmed via setTimeout
      const report = await view.collectPerfReport(50);

      // Top-level shape
      expect(typeof report.fps).toBe('number');
      expect(typeof report.frames).toBe('number');
      expect(typeof report.durationMs).toBe('number');
      expect(typeof report.bloomEnabled).toBe('boolean');
      expect(report.frameMs).toEqual(expect.objectContaining({
        median: expect.any(Number),
        p95: expect.any(Number),
        max: expect.any(Number),
      }));
      expect(report.drawCalls).toEqual(expect.objectContaining({
        median: expect.any(Number),
        max: expect.any(Number),
      }));
      expect(report.triangles).toEqual(expect.objectContaining({
        median: expect.any(Number),
        max: expect.any(Number),
      }));
      expect(report.scene).toEqual(expect.objectContaining({
        visibleBloomMeshes: expect.any(Number),
        visibleNonBloomMeshes: expect.any(Number),
        visiblePointLights: expect.any(Number),
        visibleSprites: expect.any(Number),
        totalMeshes: expect.any(Number),
      }));
      expect(report.drivers).toEqual({ ledsActive: expect.any(Number) });
      expect(report.canvas).toEqual(expect.objectContaining({
        cssW: expect.any(Number),
        cssH: expect.any(Number),
        bufW: expect.any(Number),
        bufH: expect.any(Number),
        pixelRatio: expect.any(Number),
      }));

      // Bloom sub-step stats are present when bloom is enabled (default true).
      if (report.bloomEnabled) {
        expect(report.bloomTotalMs).toBeDefined();
        expect(report.darkenMs).toBeDefined();
        expect(report.bloomComposerMs).toBeDefined();
        expect(report.restoreMs).toBeDefined();
        expect(report.finalComposerMs).toBeDefined();
      }
      view.dispose();
    });
  });

  describe('applySeals', () => {
    it('registers all 12 seal nodes after load and leaves them visible by default', () => {
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });

      expect(getSealNodeCount(view)).toBe(12);
      for (const side of ['north', 'south', 'east', 'west']) {
        for (const level of ['top', 'middle', 'bottom']) {
          const node = getSealNode(view, side, level);
          expect(node).toBeDefined();
          expect(node!.visible).toBe(true);
        }
      }
      view.dispose();
    });

    it('hides only the seals in the broken list; leaves the others visible', () => {
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });

      view.applySeals([
        { side: 'north', level: 'top' },
        { side: 'east', level: 'middle' },
      ]);

      expect(getSealNode(view, 'north', 'top')!.visible).toBe(false);
      expect(getSealNode(view, 'east', 'middle')!.visible).toBe(false);
      expect(getSealNode(view, 'north', 'middle')!.visible).toBe(true);
      expect(getSealNode(view, 'south', 'top')!.visible).toBe(true);
      expect(getSealNode(view, 'west', 'bottom')!.visible).toBe(true);
      view.dispose();
    });

    it('restores previously hidden seals when called with an empty list', () => {
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });

      view.applySeals([{ side: 'south', level: 'bottom' }]);
      expect(getSealNode(view, 'south', 'bottom')!.visible).toBe(false);

      view.applySeals([]);
      expect(getSealNode(view, 'south', 'bottom')!.visible).toBe(true);
      view.dispose();
    });

    it('applies a pre-load applySeals call once the model finishes loading', () => {
      gltfLoaderMock.__setAutoLoad(false);
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });

      // Registry is empty before the load fires; apply is stored but a no-op.
      view.applySeals([{ side: 'west', level: 'top' }]);
      expect(getSealNodeCount(view)).toBe(0);

      const loader = gltfLoaderMock.__getLastInstance();
      loader.fireLoad();

      expect(getSealNodeCount(view)).toBe(12);
      expect(getSealNode(view, 'west', 'top')!.visible).toBe(false);
      expect(getSealNode(view, 'west', 'middle')!.visible).toBe(true);
      view.dispose();
    });

    it('warns once when expected seal nodes are missing from the model', () => {
      gltfLoaderMock.__setSealNames([
        'seal_north_top', 'seal_north_middle', 'seal_north_bottom',
        // south / east / west intentionally omitted
      ]);
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });

      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toMatch(/9 seal node\(s\) missing/);
      expect(warnSpy.mock.calls[0][0]).toMatch(/seal_south_top/);
      expect(warnSpy.mock.calls[0][0]).toMatch(/seal_west_bottom/);
      expect(getSealNodeCount(view)).toBe(3);

      warnSpy.mockRestore();
      view.dispose();
    });

    it('does not warn when every expected seal is present', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
      view.dispose();
    });

    it('clears the seal registry on dispose', () => {
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });
      expect(getSealNodeCount(view)).toBe(12);
      view.dispose();
      expect(getSealNodeCount(view)).toBe(0);
    });
  });

  describe('computeSealLedPose', () => {
    const R = 1.0;
    const RF = 0.88;

    it('positions just behind north top seal: +Z at radiusFactor depth', () => {
      const pose = computeSealLedPose(0, 0, R, RF);
      expect(pose.position.x).toBeCloseTo(0, 10);
      expect(pose.position.y).toBeCloseTo(LED_LAYOUT.topY, 10);
      expect(pose.position.z).toBeCloseTo(RF, 10);
    });

    it('east middle: +X axis at middleY', () => {
      const pose = computeSealLedPose(1, 1, R, RF);
      expect(pose.position.x).toBeCloseTo(RF, 10);
      expect(pose.position.y).toBeCloseTo(LED_LAYOUT.middleY, 10);
      expect(pose.position.z).toBeCloseTo(0, 10);
    });

    it('south bottom: -Z axis at bottomY', () => {
      const pose = computeSealLedPose(2, 2, R, RF);
      expect(pose.position.x).toBeCloseTo(0, 10);
      expect(pose.position.y).toBeCloseTo(LED_LAYOUT.bottomY, 10);
      expect(pose.position.z).toBeCloseTo(-RF, 10);
    });

    it('scales linearly with radius', () => {
      const a = computeSealLedPose(0, 0, 1.0, RF);
      const b = computeSealLedPose(0, 0, 4.0, RF);
      expect(b.position.z).toBeCloseTo(a.position.z * 4, 10);
    });
  });

  describe('seal backlights', () => {
    it('§4.19 interior-sprites: creates 12 backlights with light=null, proxy+halo parented to model', () => {
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });
      expect(getSealBacklightCount(view)).toBe(12);
      for (const side of ['north', 'south', 'east', 'west']) {
        for (const level of ['top', 'middle', 'bottom']) {
          const ref = getSealBacklight(view, side, level);
          expect(ref).toBeDefined();
          expect(ref!.light).toBeNull();
          expect(ref!.proxyMesh.parent).not.toBeNull();
          expect(ref!.haloSprite.parent).not.toBeNull();
        }
      }
      view.dispose();
    });

    it('creates only as many backlights as available seal nodes', () => {
      gltfLoaderMock.__setSealNames([
        'seal_north_top', 'seal_north_middle', 'seal_north_bottom',
      ]);
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });

      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });
      expect(getSealBacklightCount(view)).toBe(3);
      expect(getSealBacklight(view, 'north', 'top')).toBeDefined();
      expect(getSealBacklight(view, 'south', 'top')).toBeUndefined();

      warnSpy.mockRestore();
      view.dispose();
    });

    it('positions each proxy just behind the seal at the correct cardinal bearing', () => {
      // §4.19 interior-sprites: light is null; assert positioning via proxyMesh
      // (which is at the same (x, y, z) as the removed accent light).
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });
      const cfg = view.getLightingConfig().leds.sealBacklights;
      const radius = (view as unknown as { modelRadius: number }).modelRadius;

      const cases: Array<[string, string, (p: { x: number; y: number; z: number }) => void]> = [
        ['north', 'top', (p) => {
          expect(p.x).toBeCloseTo(0, 10);
          expect(p.z).toBeCloseTo(radius * cfg.radiusFactor, 10);
        }],
        ['east', 'middle', (p) => {
          expect(p.x).toBeCloseTo(radius * cfg.radiusFactor, 10);
          expect(p.z).toBeCloseTo(0, 10);
        }],
        ['south', 'bottom', (p) => {
          expect(p.x).toBeCloseTo(0, 10);
          expect(p.z).toBeCloseTo(-radius * cfg.radiusFactor, 10);
        }],
        ['west', 'top', (p) => {
          expect(p.x).toBeCloseTo(-radius * cfg.radiusFactor, 10);
          expect(p.z).toBeCloseTo(0, 10);
        }],
      ];

      for (const [side, level, check] of cases) {
        const ref = getSealBacklight(view, side, level)!;
        check(ref.proxyMesh.position);
      }
      view.dispose();
    });

    it('§4.19 interior-sprites: light is null at construction; proxy opacity starts at 0', () => {
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });
      const ref = getSealBacklight(view, 'north', 'top')!;
      expect(ref.light).toBeNull();
      // Proxy material starts at opacity 0; driver.v=0 at construction.
      expect((ref.proxyMesh.material as THREE.MeshBasicMaterial).opacity).toBe(0);
      expect(ref.driver.v).toBe(0);
      view.dispose();
    });

    it('proxy/halo opacity scales with driver.v', () => {
      // §4.19 interior-sprites: light is null. The proxy+halo are the
      // surviving cutout-glow visuals (driven by driver.v); interior
      // sprites cover the spill role when enabled.
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });
      const ref = getSealBacklight(view, 'north', 'top')!;

      // Drive the seal directly; setSealLed runs through the SealManager.
      const sm = (view as unknown as { sealManager: { setSealLed: (k: string, v: number, l: unknown) => void } }).sealManager;
      sm.setSealLed('north:top', 0.6, view.getLightingConfig());

      expect((ref.proxyMesh.material as THREE.MeshBasicMaterial).opacity).toBeCloseTo(0.6, 10);
      const cfg = view.getLightingConfig().leds.sealBacklights;
      expect((ref.haloSprite.material as THREE.SpriteMaterial).opacity).toBeCloseTo(0.6 * cfg.halo.opacity, 10);
      view.dispose();
    });

    it('with backlightWhenBroken=true, proxy opacity stays nonzero when seal is broken', () => {
      const view = new Tower3DView(container, {
        modelUrl: TEST_MODEL_URL,
        lighting: { leds: { sealBacklights: { backlightWhenBroken: true } } },
      });

      const ref = getSealBacklight(view, 'north', 'top')!;
      ref.driver.v = 1;
      view.applySeals([{ side: 'north', level: 'top' }]);

      expect((ref.proxyMesh.material as THREE.MeshBasicMaterial).opacity).toBeCloseTo(1, 10);
      view.dispose();
    });

    it('with backlightWhenBroken=false, proxy opacity drops to 0 when seal is broken', () => {
      const view = new Tower3DView(container, {
        modelUrl: TEST_MODEL_URL,
        lighting: { leds: { sealBacklights: { backlightWhenBroken: false } } },
      });

      const ref = getSealBacklight(view, 'north', 'top')!;
      ref.driver.v = 1;
      view.applySeals([{ side: 'north', level: 'top' }]);

      expect((ref.proxyMesh.material as THREE.MeshBasicMaterial).opacity).toBe(0);
      view.dispose();
    });

    it('applyLightingConfig({ enabled: false }) hides every backlight', () => {
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });
      for (const side of ['north', 'south', 'east', 'west']) {
        for (const level of ['top', 'middle', 'bottom']) {
          getSealBacklight(view, side, level)!.driver.v = 1;
        }
      }

      view.applyLightingConfig({ leds: { sealBacklights: { enabled: false } } });

      for (const side of ['north', 'south', 'east', 'west']) {
        for (const level of ['top', 'middle', 'bottom']) {
          const ref = getSealBacklight(view, side, level)!;
          expect(ref.proxyMesh.visible).toBe(false);
          expect(ref.haloSprite.visible).toBe(false);
        }
      }
      view.dispose();
    });

    it('applyLightingConfig hot-reloads color on proxy + halo', () => {
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });
      view.applyLightingConfig({ leds: { sealBacklights: { color: 0x00ff00 } } });

      for (const side of ['north', 'south', 'east', 'west']) {
        for (const level of ['top', 'middle', 'bottom']) {
          const ref = getSealBacklight(view, side, level)!;
          expect((ref.proxyMesh.material as THREE.MeshBasicMaterial).color.getHex()).toBe(0x00ff00);
          expect((ref.haloSprite.material as THREE.SpriteMaterial).color.getHex()).toBe(0x00ff00);
        }
      }
      view.dispose();
    });

    it('§4.19 interior-sprites: dispose detaches proxy + halo + interior sprites; light slot is null throughout', () => {
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });
      const refs = [];
      for (const side of ['north', 'south', 'east', 'west']) {
        for (const level of ['top', 'middle', 'bottom']) {
          refs.push(getSealBacklight(view, side, level)!);
        }
      }
      expect(refs.every((r) => r.light === null)).toBe(true);
      expect(refs.every((r) => r.proxyMesh.parent !== null)).toBe(true);

      view.dispose();
      expect(refs.every((r) => r.proxyMesh.parent === null)).toBe(true);
      expect(refs.every((r) => r.haloSprite.parent === null)).toBe(true);
      expect(refs.every((r) => r.interiorSprites.every((s: THREE.Sprite) => s.parent === null))).toBe(true);
      expect(getSealBacklightCount(view)).toBe(0);
    });
  });

  describe('§4.19 interior-sprites: seal backlight interior sprites', () => {
    it('constructs cfg.interior.count interior sprites per seal regardless of enabled flag (at build time)', () => {
      // Sprites are always built so applyLightingConfig({ ...interior: { enabled: true } })
      // can toggle them at runtime without a dispose + rebuild.
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });
      const cfg = view.getLightingConfig().leds.sealBacklights.interior;
      const expectedCount = Math.max(1, cfg.count);

      for (const side of ['north', 'south', 'east', 'west']) {
        for (const level of ['top', 'middle', 'bottom']) {
          const ref = getSealBacklight(view, side, level)!;
          expect(ref.interiorSprites.length).toBe(expectedCount);
          for (const spr of ref.interiorSprites) {
            expect(spr.parent).not.toBeNull();
            expect(spr.visible).toBe(false); // off until driven
          }
        }
      }
      view.dispose();
    });

    it('with interior.enabled=true, driver.v drives interior-sprite opacity', () => {
      const view = new Tower3DView(container, {
        modelUrl: TEST_MODEL_URL,
        lighting: { leds: { sealBacklights: { interior: { enabled: true } } } },
      });
      const ref = getSealBacklight(view, 'north', 'top')!;
      const cfg = view.getLightingConfig().leds.sealBacklights;

      const sm = (view as unknown as { sealManager: { setSealLed: (k: string, v: number, l: unknown) => void } }).sealManager;
      sm.setSealLed('north:top', 0.7, view.getLightingConfig());

      for (const spr of ref.interiorSprites) {
        expect((spr.material as THREE.SpriteMaterial).opacity).toBeCloseTo(0.7 * cfg.interior.opacity, 10);
        expect(spr.visible).toBe(true);
      }
      view.dispose();
    });

    it('with interior.enabled=false (default), interior sprites stay invisible regardless of driver.v', () => {
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });
      const ref = getSealBacklight(view, 'north', 'top')!;

      const sm = (view as unknown as { sealManager: { setSealLed: (k: string, v: number, l: unknown) => void } }).sealManager;
      sm.setSealLed('north:top', 0.9, view.getLightingConfig());

      for (const spr of ref.interiorSprites) {
        expect(spr.visible).toBe(false);
      }
      view.dispose();
    });

    it('applyLightingConfig hot-reloads interior-sprite color', () => {
      const view = new Tower3DView(container, {
        modelUrl: TEST_MODEL_URL,
        lighting: { leds: { sealBacklights: { interior: { enabled: true } } } },
      });
      view.applyLightingConfig({ leds: { sealBacklights: { color: 0x00ff00 } } });

      for (const side of ['north', 'south', 'east', 'west']) {
        for (const level of ['top', 'middle', 'bottom']) {
          const ref = getSealBacklight(view, side, level)!;
          for (const spr of ref.interiorSprites) {
            expect((spr.material as THREE.SpriteMaterial).color.getHex()).toBe(0x00ff00);
          }
        }
      }
      view.dispose();
    });

    it('applyLightingConfig({ interior: { enabled: true } }) toggles visibility on next setSealLed', () => {
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });
      view.applyLightingConfig({ leds: { sealBacklights: { interior: { enabled: true } } } });

      const ref = getSealBacklight(view, 'north', 'top')!;
      const sm = (view as unknown as { sealManager: { setSealLed: (k: string, v: number, l: unknown) => void } }).sealManager;
      sm.setSealLed('north:top', 0.5, view.getLightingConfig());

      for (const spr of ref.interiorSprites) {
        expect(spr.visible).toBe(true);
      }
      view.dispose();
    });
  });

  describe('selectSide', () => {
    it('marks north active after initial load', () => {
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });

      const camCtrl = (view as unknown as {
        cameraController: { getCurrentSide(): string | null };
      }).cameraController;
      const northButton = container.querySelector('[data-side="north"]') as HTMLButtonElement | null;

      expect(camCtrl.getCurrentSide()).toBe('north');
      expect(northButton?.dataset.active).toBe('true');
      view.dispose();
    });

    it('after load, selectSide updates cameraController.currentSide and fires onSideChange', () => {
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });
      const spy = jest.fn();
      view.onSideChange = spy;

      view.selectSide('east');

      const camCtrl = (view as unknown as {
        cameraController: { getCurrentSide(): string | null };
      }).cameraController;
      expect(camCtrl.getCurrentSide()).toBe('east');
      expect(spy).toHaveBeenCalledWith('east');
      view.dispose();
    });

    it('selectSide to the current side is a no-op (loop prevention)', () => {
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });
      view.selectSide('east');

      const spy = jest.fn();
      view.onSideChange = spy;
      view.selectSide('east');
      expect(spy).not.toHaveBeenCalled();
      view.dispose();
    });

    it('applies a pre-load selectSide call once the model finishes loading', () => {
      gltfLoaderMock.__setAutoLoad(false);
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });

      view.selectSide('south');

      // Model not loaded yet — snapToSide sets currentSide immediately (for re-entry guard
      // correctness) but defers the camera tween until the model loads.
      const camCtrl = (view as unknown as {
        cameraController: { getCurrentSide(): string | null };
      }).cameraController;
      expect(camCtrl.getCurrentSide()).toBe('south');

      const loader = gltfLoaderMock.__getLastInstance();
      loader.fireLoad();

      expect(camCtrl.getCurrentSide()).toBe('south');
      view.dispose();
    });

    it('reset returns the active side to north', () => {
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });

      view.selectSide('west');

      const resetButton = container.querySelector('.t3v-reset-btn') as HTMLButtonElement | null;
      const camCtrl = (view as unknown as {
        cameraController: { getCurrentSide(): string | null };
      }).cameraController;
      const northButton = container.querySelector('[data-side="north"]') as HTMLButtonElement | null;
      const westButton = container.querySelector('[data-side="west"]') as HTMLButtonElement | null;

      resetButton?.click();

      expect(camCtrl.getCurrentSide()).toBe('north');
      expect(northButton?.dataset.active).toBe('true');
      expect(westButton?.dataset.active).toBe('false');
      view.dispose();
    });
  });

  describe('lighting config runtime helpers', () => {
    it('getLightingConfig returns a deep-cloned snapshot', () => {
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });
      const snapshot = view.getLightingConfig();
      snapshot.scene.key.intensity = 99;

      const latest = view.getLightingConfig();
      expect(latest.scene.key.intensity).toBe(DEFAULT_LIGHTING.scene.key.intensity);
      view.dispose();
    });

    it('setSceneLights updates getter-visible scene values', () => {
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });
      view.setSceneLights({
        hemi: 0.12,
        key: 2.4,
        fill: 0.25,
        exposure: 1.15,
        keyX: 6,
        keyY: 7,
        keyZ: -2,
      });

      const lighting = view.getLightingConfig();
      expect(lighting.scene.hemisphere.intensity).toBe(0.12);
      expect(lighting.scene.key.intensity).toBe(2.4);
      expect(lighting.scene.fill.intensity).toBe(0.25);
      expect(lighting.scene.exposure).toBe(1.15);
      expect(lighting.scene.key.position).toEqual([6, 7, -2]);
      view.dispose();
    });

    it('applyLightingConfig resolves partial input over defaults', () => {
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });
      view.applyLightingConfig({
        scene: {
          key: { intensity: 2.8, position: [2, 3, 4] },
          hemisphere: { intensity: 0.2 },
        },
        groundDisc: { roughness: 0.5 },
      });

      const lighting = view.getLightingConfig();
      expect(lighting.scene.key.intensity).toBe(2.8);
      expect(lighting.scene.key.position).toEqual([2, 3, 4]);
      expect(lighting.scene.hemisphere.intensity).toBe(0.2);
      expect(lighting.groundDisc.roughness).toBe(0.5);
      expect(lighting.scene.fill.intensity).toBe(DEFAULT_LIGHTING.scene.fill.intensity);
      view.dispose();
    });

    it('manual setSceneLights cancels active entrance timeline', () => {
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });
      view.playEntrance();

      const timelines = gsapMock.__getTimelines();
      expect(timelines.length).toBeGreaterThan(0);

      const entranceTimeline = timelines[timelines.length - 1] as { killed: boolean };
      expect(entranceTimeline.killed).toBe(false);

      view.setSceneLights({ fill: 0.33 });

      expect(entranceTimeline.killed).toBe(true);
      expect(view.getLightingConfig().scene.fill.intensity).toBe(0.33);
      view.dispose();
    });
  });
});

describe('DEFAULT_LIGHTING', () => {
  it('scene values match historical literals', () => {
    expect(DEFAULT_LIGHTING.scene.background).toBe(0x000000);
    expect(DEFAULT_LIGHTING.scene.hemisphere).toEqual({ color: 0xffffff, ground: 0x000000, intensity: 0.04 });
    expect(DEFAULT_LIGHTING.scene.key.color).toBe(0xffffff);
    expect(DEFAULT_LIGHTING.scene.key.intensity).toBe(1.6);
    expect(DEFAULT_LIGHTING.scene.key.position).toEqual([3, 4.5, -1]);
    expect(DEFAULT_LIGHTING.scene.key.shadow).toEqual({
      mapSize: 2048,
      bias: -0.0003,
      normalBias: 0.02,
      frustumRadiusFactor: 1.3,
      farFactor: 10,
    });
    expect(DEFAULT_LIGHTING.scene.fill).toEqual({
      color: 0xffffff,
      intensity: 5.0,
      width: 1.5,
      height: 2.5,
      position: [-4, 1.5, -8],
    });
    expect(DEFAULT_LIGHTING.scene.exposure).toBe(0.7);
  });

  it('leds values match historical literals', () => {
    expect(DEFAULT_LIGHTING.leds.red).toEqual({
      color: 0xff2020,
      maxHalo: 1.0,
      haloDistanceFraction: 0.20,
    });
  });

  it('idle breathe values match historical literals', () => {
    expect(DEFAULT_LIGHTING.animation.idleBreathe).toEqual({ peakFactor: 1.08, durationS: 4 });
  });

  it('entrance beats match historical literals', () => {
    expect(DEFAULT_LIGHTING.entrance.peakKeyFactor).toBe(2.5);
    expect(DEFAULT_LIGHTING.entrance.beats).toEqual({
      silhouetteHemiFactor: 0.25,
      silhouetteExposureFactor: 0.15,
      silhouetteDurationS: 1.4,
      keyArc1DurationS: 0.9,
      keyArc1DelayS: 1.2,
      keyPunchDurationS: 0.6,
      keyPunchDelayS: 1.5,
      exposureInDurationS: 1.2,
      keyArc2DurationS: 1.0,
      keyArc2DelayS: 2.1,
      keySettleDurationS: 1.2,
      keySettleDelayS: 2.3,
      fillInDurationS: 1.1,
      fillInDelayS: 2.6,
      hemiInDurationS: 1.1,
      hemiInDelayS: 2.8,
    });
  });

  it('groundDisc values match historical literals', () => {
    expect(DEFAULT_LIGHTING.groundDisc).toEqual({
      color: 0x050505,
      roughness: 0.92,
      metalness: 0,
      radiusFactor: 3,
      undersideLightIntensity: 0.15,
    });
  });
});

describe('resolveLighting', () => {
  it('returns a full copy of DEFAULT_LIGHTING when no user config is provided', () => {
    const resolved = resolveLighting();
    expect(resolved).toEqual(DEFAULT_LIGHTING);
  });

  it('applies a deep nested override while leaving siblings at defaults', () => {
    const resolved = resolveLighting({ scene: { key: { intensity: 9 } } });
    expect(resolved.scene.key.intensity).toBe(9);
    // sibling fields under scene.key untouched
    expect(resolved.scene.key.color).toBe(DEFAULT_LIGHTING.scene.key.color);
    expect(resolved.scene.key.position).toEqual(DEFAULT_LIGHTING.scene.key.position);
    // sibling sections untouched
    expect(resolved.scene.hemisphere).toEqual(DEFAULT_LIGHTING.scene.hemisphere);
    expect(resolved.leds).toEqual(DEFAULT_LIGHTING.leds);
  });

  it('does not mutate DEFAULT_LIGHTING', () => {
    const before = JSON.stringify(DEFAULT_LIGHTING);
    resolveLighting({ scene: { key: { intensity: 42 } } });
    expect(JSON.stringify(DEFAULT_LIGHTING)).toBe(before);
  });
});
