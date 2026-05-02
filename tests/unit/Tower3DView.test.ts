import { LIGHT_EFFECTS } from 'ultimatedarktower';
import type { TowerState } from 'ultimatedarktower';
import { Tower3DView, __testables, DEFAULT_LIGHTING, resolveLighting } from '../../src/3d/Tower3DView';
import * as gltfLoaderMock from '../__mocks__/gltfLoader.js';
import * as gsapMock from '../__mocks__/gsap.js';

const {
  LED_LAYOUT, LEDGE_LED_LAYOUT, RING_AZIMUTH, CORNER_AZIMUTH,
  computeRedLightPosition, RED_LIGHT_LAYOUT, getLedRef,
  getSealNode, getSealNodeCount,
  computeSealBacklightPose, getSealBacklight, getSealBacklightCount,
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
    it('after load, dispatches one tween per LED (24 total)', () => {
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });
      gsapMock.__reset();

      const state = makeState();
      state.layer[0].light[0].effect = LIGHT_EFFECTS.on;
      state.layer[1].light[2].effect = LIGHT_EFFECTS.breathe;
      state.layer[5].light[3].effect = LIGHT_EFFECTS.flicker;

      view.applyState(state);

      expect(gsapMock.__getTweens().length).toBe(24);
      view.dispose();
    });

    it('replays latestState when buildLeds runs after pre-load applyState', () => {
      gltfLoaderMock.__setAutoLoad(false);
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });

      const state = makeState();
      state.layer[0].light[0].effect = LIGHT_EFFECTS.on;

      const tweensBefore = gsapMock.__getTweens().length;
      view.applyState(state);
      // No LEDs built yet — no new tweens.
      expect(gsapMock.__getTweens().length).toBe(tweensBefore);

      const loader = gltfLoaderMock.__getLastInstance();
      loader.fireLoad();

      // 24 dispatches happen from replay at end of buildLeds.
      expect(gsapMock.__getTweens().length - tweensBefore).toBe(24);
      view.dispose();
    });
  });

  describe('showIdle', () => {
    it('dispatches 24 off effects', () => {
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });
      gsapMock.__reset();

      view.showIdle();

      const tweens = gsapMock.__getTweens();
      expect(tweens.length).toBe(24);
      // Every tween should target `v: 0` (off fades driver to 0).
      expect(tweens.every((t: { vars: { v: number } }) => t.vars.v === 0)).toBe(true);
      view.dispose();
    });
  });

  describe('dispose', () => {
    it('kills every LED tween and clears the ledRefs map', () => {
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });

      const state = makeState();
      for (const layer of state.layer) {
        for (const light of layer.light) light.effect = LIGHT_EFFECTS.on;
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
    it('creates a redLight for every LED', () => {
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });
      for (let layer = 0; layer < 6; layer++) {
        for (let light = 0; light < 4; light++) {
          const ref = getLedRef(view, layer, light);
          expect(ref).toBeDefined();
          expect(ref!.redLight).toBeDefined();
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
    it('write() drives redLight intensity and visibility from driver.v', () => {
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });
      gsapMock.__reset();

      const state = makeState();
      state.layer[0].light[0].effect = LIGHT_EFFECTS.on;
      view.applyState(state);

      const ref = getLedRef(view, 0, 0)!;
      expect(ref.tween).not.toBeNull();

      ref.driver.v = 0.7;
      (ref.tween as unknown as { vars: { onUpdate: () => void } }).vars.onUpdate();

      expect(ref.redLight.intensity).toBeCloseTo(0.7, 10);
      expect(ref.redLight.visible).toBe(true);
      view.dispose();
    });

    it('write() hides redLight when driver.v is at zero threshold', () => {
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });
      gsapMock.__reset();

      const state = makeState();
      state.layer[0].light[0].effect = LIGHT_EFFECTS.on;
      view.applyState(state);

      const ref = getLedRef(view, 0, 0)!;
      ref.driver.v = 0;
      (ref.tween as unknown as { vars: { onUpdate: () => void } }).vars.onUpdate();

      expect(ref.redLight.visible).toBe(false);
      view.dispose();
    });
  });

  describe('dispose cleans up red lights', () => {
    it('removes redLight from parent for every LED', () => {
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

      expect(refs.every(r => r.redLight.parent !== null)).toBe(true);

      view.dispose();

      expect(refs.every(r => r.redLight.parent === null)).toBe(true);
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

  describe('computeSealBacklightPose', () => {
    const R = 1.0;
    const RF = 0.88;

    it('positions just behind north top seal: +Z at radiusFactor depth', () => {
      const pose = computeSealBacklightPose(0, 0, R, RF);
      expect(pose.position.x).toBeCloseTo(0, 10);
      expect(pose.position.y).toBeCloseTo(LED_LAYOUT.topY, 10);
      expect(pose.position.z).toBeCloseTo(RF, 10);
    });

    it('east middle: +X axis at middleY', () => {
      const pose = computeSealBacklightPose(1, 1, R, RF);
      expect(pose.position.x).toBeCloseTo(RF, 10);
      expect(pose.position.y).toBeCloseTo(LED_LAYOUT.middleY, 10);
      expect(pose.position.z).toBeCloseTo(0, 10);
    });

    it('south bottom: -Z axis at bottomY', () => {
      const pose = computeSealBacklightPose(2, 2, R, RF);
      expect(pose.position.x).toBeCloseTo(0, 10);
      expect(pose.position.y).toBeCloseTo(LED_LAYOUT.bottomY, 10);
      expect(pose.position.z).toBeCloseTo(-RF, 10);
    });

    it('scales linearly with radius', () => {
      const a = computeSealBacklightPose(0, 0, 1.0, RF);
      const b = computeSealBacklightPose(0, 0, 4.0, RF);
      expect(b.position.z).toBeCloseTo(a.position.z * 4, 10);
    });
  });

  describe('seal backlights', () => {
    it('creates 12 PointLights (one per side:level), each parented to the model', () => {
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });
      expect(getSealBacklightCount(view)).toBe(12);
      for (const side of ['north', 'south', 'east', 'west']) {
        for (const level of ['top', 'middle', 'bottom']) {
          const ref = getSealBacklight(view, side, level);
          expect(ref).toBeDefined();
          expect(ref!.light).toBeDefined();
          expect(ref!.light.parent).not.toBeNull();
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

    it('positions each backlight just behind the seal at the correct cardinal bearing', () => {
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
        check(ref.light.position);
      }
      view.dispose();
    });

    it('initialises each light with configured color, distance, decay and zero intensity', () => {
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });
      const cfg = view.getLightingConfig().leds.sealBacklights;
      const radius = (view as unknown as { modelRadius: number }).modelRadius;

      const ref = getSealBacklight(view, 'north', 'top')!;
      expect(ref.light.color.getHex()).toBe(cfg.color);
      expect(ref.light.distance).toBeCloseTo(radius * cfg.distanceFactor, 10);
      expect(ref.light.decay).toBe(cfg.decay);
      // Off until driven.
      expect(ref.light.intensity).toBe(0);
      expect(ref.light.visible).toBe(false);
      view.dispose();
    });

    it('intensity scales with driver.v after applyLightingConfig', () => {
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });

      const ref = getSealBacklight(view, 'north', 'top')!;
      ref.driver.v = 1;
      view.applyLightingConfig(view.getLightingConfig());

      const cfg = view.getLightingConfig().leds.sealBacklights;
      expect(ref.light.intensity).toBeCloseTo(cfg.intensity, 10);
      expect(ref.light.visible).toBe(true);
      view.dispose();
    });

    it('with backlightWhenBroken=true, light stays available when seal is broken', () => {
      const view = new Tower3DView(container, {
        modelUrl: TEST_MODEL_URL,
        lighting: { leds: { sealBacklights: { backlightWhenBroken: true } } },
      });

      const ref = getSealBacklight(view, 'north', 'top')!;
      ref.driver.v = 1;
      view.applySeals([{ side: 'north', level: 'top' }]);

      const cfg = view.getLightingConfig().leds.sealBacklights;
      expect(ref.light.intensity).toBeCloseTo(cfg.intensity, 10);
      expect(ref.light.visible).toBe(true);
      view.dispose();
    });

    it('with backlightWhenBroken=false, light hides when seal is broken', () => {
      const view = new Tower3DView(container, {
        modelUrl: TEST_MODEL_URL,
        lighting: { leds: { sealBacklights: { backlightWhenBroken: false } } },
      });

      const ref = getSealBacklight(view, 'north', 'top')!;
      ref.driver.v = 1;
      view.applySeals([{ side: 'north', level: 'top' }]);

      expect(ref.light.intensity).toBe(0);
      expect(ref.light.visible).toBe(false);
      view.dispose();
    });

    it('applyLightingConfig({ enabled: false }) drops every backlight to zero intensity', () => {
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });
      // Force drivers on so the only thing keeping lights off is enabled=false.
      for (const side of ['north', 'south', 'east', 'west']) {
        for (const level of ['top', 'middle', 'bottom']) {
          getSealBacklight(view, side, level)!.driver.v = 1;
        }
      }

      view.applyLightingConfig({ leds: { sealBacklights: { enabled: false } } });

      for (const side of ['north', 'south', 'east', 'west']) {
        for (const level of ['top', 'middle', 'bottom']) {
          const ref = getSealBacklight(view, side, level)!;
          expect(ref.light.intensity).toBe(0);
          expect(ref.light.visible).toBe(false);
        }
      }
      view.dispose();
    });

    it('applyLightingConfig hot-reloads color', () => {
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });
      view.applyLightingConfig({ leds: { sealBacklights: { color: 0x00ff00 } } });

      for (const side of ['north', 'south', 'east', 'west']) {
        for (const level of ['top', 'middle', 'bottom']) {
          const ref = getSealBacklight(view, side, level)!;
          expect(ref.light.color.getHex()).toBe(0x00ff00);
        }
      }
      view.dispose();
    });

    it('removes lights from parent on dispose', () => {
      const view = new Tower3DView(container, { modelUrl: TEST_MODEL_URL });
      const refs: Array<{ light: { parent: unknown } }> = [];
      for (const side of ['north', 'south', 'east', 'west']) {
        for (const level of ['top', 'middle', 'bottom']) {
          refs.push(getSealBacklight(view, side, level)!);
        }
      }
      expect(refs.every((r) => r.light.parent !== null)).toBe(true);

      view.dispose();
      expect(refs.every((r) => r.light.parent === null)).toBe(true);
      expect(getSealBacklightCount(view)).toBe(0);
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

  it('animation values match historical literals', () => {
    expect(DEFAULT_LIGHTING.animation.fadeS).toBe(0.15);
    expect(DEFAULT_LIGHTING.animation.breatheS).toBe(2.0);
    expect(DEFAULT_LIGHTING.animation.breatheFastS).toBe(0.8);
    expect(DEFAULT_LIGHTING.animation.flickerS).toBe(0.3);
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
