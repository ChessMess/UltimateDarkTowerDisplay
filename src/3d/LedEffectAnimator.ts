import * as THREE from 'three';
import gsap from 'gsap';
import { LIGHT_EFFECTS } from 'ultimatedarktower';
import type { TowerState } from 'ultimatedarktower';
import type { ResolvedLightingConfig } from './types';
import { TOWER_LAYER_COUNT, LIGHTS_PER_LAYER, RING_LEVEL_BY_LAYER_INDEX, SIDES } from './constants';
import type { SealBacklightRef } from './SealManager';

export interface LedRef {
  redLight: THREE.PointLight;
  driver: { v: number };
  tween: gsap.core.Tween | null;
}

export class LedEffectAnimator {
  constructor(
    private readonly ledRefs: Map<string, LedRef>,
    private readonly getConfig: () => ResolvedLightingConfig,
    private readonly sealBacklights?: Map<string, SealBacklightRef>,
  ) { }

  private getSealDriver(layer: number, light: number): { v: number } | null {
    // Ring layers (0-2) have corresponding seals; ledge/base layers don't
    if (layer >= 3 || !this.sealBacklights) return null;
    const level = RING_LEVEL_BY_LAYER_INDEX[layer];
    const side = SIDES[light];
    const key = `${side}:${level}`;
    const ref = this.sealBacklights.get(key);
    return ref?.driver ?? null;
  }

  private getSealRef(layer: number, light: number): SealBacklightRef | null {
    // Ring layers (0-2) have corresponding seals; ledge/base layers don't
    if (layer >= 3 || !this.sealBacklights) return null;
    const level = RING_LEVEL_BY_LAYER_INDEX[layer];
    const side = SIDES[light];
    const key = `${side}:${level}`;
    return this.sealBacklights.get(key) ?? null;
  }

  setEffect(layer: number, light: number, effect: number): void {
    const ref = this.ledRefs.get(`${layer}:${light}`);
    if (!ref) return;

    ref.tween?.kill();
    ref.tween = null;

    const { driver, redLight } = ref;
    const { red } = this.getConfig().leds;
    const { fadeS, breatheS, breatheFastS, flickerS } = this.getConfig().animation;

    // For ring layers (0-2), get corresponding seal backlight driver
    const sealDriver = this.getSealDriver(layer, light);
    const seal = sealDriver ? this.getSealRef(layer, light) : null;

    const write = (): void => {
      redLight.intensity = driver.v * red.maxHalo;
      redLight.visible = driver.v > 0.001;

      // Drive seal backlight: PointLight intensity scales with the LED driver,
      // so light shining through the seal's carved openings tracks the LED state.
      if (sealDriver && seal) {
        sealDriver.v = driver.v;
        const cfg = this.getConfig().leds.sealBacklights;
        const on = cfg.enabled && (seal.sealNode.visible || cfg.backlightWhenBroken);
        seal.light.intensity = (on ? driver.v : 0) * cfg.intensity;
        seal.light.visible = on && driver.v > 0.001;
      }
    };

    switch (effect) {
      case LIGHT_EFFECTS.on:
        ref.tween = gsap.to(driver, { v: 1, duration: fadeS, onUpdate: write });
        break;
      case LIGHT_EFFECTS.breathe:
        ref.tween = gsap.to(driver, {
          v: 1, duration: breatheS, ease: 'sine.inOut', yoyo: true, repeat: -1, onUpdate: write,
        });
        break;
      case LIGHT_EFFECTS.breatheFast:
        ref.tween = gsap.to(driver, {
          v: 1, duration: breatheFastS, ease: 'sine.inOut', yoyo: true, repeat: -1, onUpdate: write,
        });
        break;
      case LIGHT_EFFECTS.breathe50percent:
        ref.tween = gsap.to(driver, {
          v: 0.5, duration: breatheS, ease: 'sine.inOut', yoyo: true, repeat: -1, onUpdate: write,
        });
        break;
      case LIGHT_EFFECTS.flicker:
        driver.v = 1;
        write();
        ref.tween = gsap.to(driver, {
          v: 0.2, duration: flickerS, ease: 'steps(1)', yoyo: true, repeat: -1, onUpdate: write,
        });
        break;
      case LIGHT_EFFECTS.off:
      default:
        ref.tween = gsap.to(driver, { v: 0, duration: fadeS, onUpdate: write });
        break;
    }

    // Ensure write callback is called at least once for immediate feedback
    write();
  }

  replayAll(state: TowerState): void {
    if (this.ledRefs.size === 0) return;
    for (let layer = 0; layer < TOWER_LAYER_COUNT; layer++) {
      for (let light = 0; light < LIGHTS_PER_LAYER; light++) {
        this.setEffect(layer, light, state.layer[layer].light[light].effect);
      }
    }
  }

  dispose(): void {
    for (const ref of this.ledRefs.values()) {
      ref.tween?.kill();
      ref.tween = null;
    }
  }
}
