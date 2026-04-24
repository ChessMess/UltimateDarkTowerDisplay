import * as THREE from 'three';
import gsap from 'gsap';
import { LIGHT_EFFECTS } from 'ultimatedarktower';
import type { TowerState } from 'ultimatedarktower';
import type { ResolvedLightingConfig } from './types';
import { TOWER_LAYER_COUNT, LIGHTS_PER_LAYER } from './constants';

export interface LedRef {
  mesh: THREE.Mesh | null;
  material: THREE.MeshStandardMaterial | null;
  light: THREE.PointLight | null;
  redLight: THREE.PointLight;
  driver: { v: number };
  tween: gsap.core.Tween | null;
}

export class LedEffectAnimator {
  constructor(
    private readonly ledRefs: Map<string, LedRef>,
    private readonly getConfig: () => ResolvedLightingConfig,
  ) {}

  setEffect(layer: number, light: number, effect: number): void {
    const ref = this.ledRefs.get(`${layer}:${light}`);
    if (!ref) return;

    ref.tween?.kill();
    ref.tween = null;

    const { driver, material, light: halo, redLight } = ref;
    const { amber, red } = this.getConfig().leds;
    const { fadeS, breatheS, breatheFastS, flickerS } = this.getConfig().animation;
    const write = (): void => {
      if (material) material.emissiveIntensity = driver.v * amber.maxEmissive;
      if (halo) {
        halo.intensity = driver.v * amber.maxHalo;
        halo.visible = driver.v > 0.001;
      }
      redLight.intensity = driver.v * red.maxHalo;
      redLight.visible = driver.v > 0.001;
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
