import * as THREE from 'three';
import gsap from 'gsap';
import { LIGHT_EFFECTS } from 'ultimatedarktower';
import type { TowerState } from 'ultimatedarktower';
import type { ResolvedLightingConfig } from './types';
import { TOWER_LAYER_COUNT, LIGHTS_PER_LAYER, RING_LEVEL_BY_LAYER_INDEX, SIDES } from './constants';
import type { SealManager } from './SealManager';

export interface LedRef {
  redLight: THREE.PointLight;
  driver: { v: number };
  tween: gsap.core.Tween | null;
  /** Ball-type proxy sphere mesh — present only for ledge (layer 3) and base (layers 4–5) LEDs. */
  proxyMesh?: THREE.Mesh;
  /** Soft halo sprite — present only for ledge (layer 3) and base (layers 4–5) LEDs. */
  haloSprite?: THREE.Sprite;
}

export class LedEffectAnimator {
  constructor(
    private readonly ledRefs: Map<string, LedRef>,
    private readonly getConfig: () => ResolvedLightingConfig,
    private readonly sealManager?: SealManager,
  ) { }

  private getSealKey(layer: number, light: number): string | null {
    if (layer >= 3 || !this.sealManager) return null;
    const level = RING_LEVEL_BY_LAYER_INDEX[layer];
    const side = SIDES[light];
    return `${side}:${level}`;
  }

  setEffect(layer: number, light: number, effect: number): void {
    const ref = this.ledRefs.get(`${layer}:${light}`);
    if (!ref) return;

    ref.tween?.kill();
    ref.tween = null;

    const { driver, redLight } = ref;
    const { red } = this.getConfig().leds;
    const { fadeS, breatheS, breatheFastS, flickerS } = this.getConfig().animation;

    const sealKey = this.getSealKey(layer, light);

    const write = (): void => {
      redLight.intensity = driver.v * red.maxHalo;
      redLight.visible = driver.v > 0.001;

      if (sealKey && this.sealManager) {
        this.sealManager.setSealLed(sealKey, driver.v, this.getConfig());
      }

      const ledgeCfg = this.getConfig().leds.ledgeLeds;
      if (ref.proxyMesh && layer === 3 && ledgeCfg.enabled) {
        if (ledgeCfg.proxy.enabled) {
          (ref.proxyMesh.material as THREE.MeshBasicMaterial).opacity = driver.v;
          ref.proxyMesh.visible = driver.v > 0.001;
        } else {
          ref.proxyMesh.visible = false;
        }
      }
      if (ref.haloSprite && layer === 3 && ledgeCfg.enabled) {
        if (ledgeCfg.halo.enabled) {
          (ref.haloSprite.material as THREE.SpriteMaterial).opacity =
            driver.v * ledgeCfg.halo.opacity;
          ref.haloSprite.visible = driver.v > 0.001;
        } else {
          ref.haloSprite.visible = false;
        }
      }

      const baseCfg = this.getConfig().leds.baseLeds;
      if (ref.proxyMesh && layer >= 4 && baseCfg.enabled) {
        if (baseCfg.proxy.enabled) {
          (ref.proxyMesh.material as THREE.MeshBasicMaterial).opacity = driver.v;
          ref.proxyMesh.visible = driver.v > 0.001;
        } else {
          ref.proxyMesh.visible = false;
        }
      }
      if (ref.haloSprite && layer >= 4 && baseCfg.enabled) {
        if (baseCfg.halo.enabled) {
          (ref.haloSprite.material as THREE.SpriteMaterial).opacity =
            driver.v * baseCfg.halo.opacity;
          ref.haloSprite.visible = driver.v > 0.001;
        } else {
          ref.haloSprite.visible = false;
        }
      }
    };

    switch (effect) {
      case LIGHT_EFFECTS.on:
        ref.tween = gsap.to(driver, { v: 1, duration: fadeS, onUpdate: write });
        break;
      case LIGHT_EFFECTS.breathe:
        driver.v = 0;
        ref.tween = gsap.to(driver, {
          v: 1, duration: breatheS, ease: 'sine.inOut', yoyo: true, repeat: -1, onUpdate: write,
        });
        break;
      case LIGHT_EFFECTS.breatheFast:
        driver.v = 0;
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
