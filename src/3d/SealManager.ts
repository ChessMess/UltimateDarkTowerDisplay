import * as THREE from 'three';
import type { SealIdentifier } from 'ultimatedarktower';
import type { ResolvedLightingConfig } from './types';
import { LIGHTS_PER_LAYER, RING_LEVEL_BY_LAYER_INDEX, SIDES } from './constants';
import { computeSealBacklightPose } from './utils';

const SEAL_NAME_PREFIX = 'seal_';
const SEAL_SIDES = ['north', 'south', 'east', 'west'] as const;
const SEAL_LEVELS = ['top', 'middle', 'bottom'] as const;

function sealKey(side: string, level: string): string {
  return `${side}:${level}`;
}

export interface SealBacklightRef {
  light: THREE.PointLight;
  sealNode: THREE.Object3D;
  driver: { v: number };
}

/**
 * Manages the 12 seal mesh nodes (4 sides × 3 ring levels) and their
 * corresponding interior PointLights. Exposes the backing maps as readonly
 * properties so LedEffectAnimator and __testables can reference live data
 * without coupling to Tower3DView internals.
 */
export class SealManager {
  readonly sealNodes: Map<string, THREE.Object3D> = new Map();
  readonly sealBacklights: Map<string, SealBacklightRef> = new Map();

  /**
   * Walk the loaded GLTF root and register every node whose name matches
   * the `seal_<side>_<level>` convention.
   */
  buildSealNodes(root: THREE.Object3D): void {
    root.traverse((child) => {
      if (child.name.startsWith(SEAL_NAME_PREFIX)) {
        const rest = child.name.slice(SEAL_NAME_PREFIX.length);
        const underscore = rest.indexOf('_');
        if (underscore > 0) {
          const side = rest.slice(0, underscore);
          const level = rest.slice(underscore + 1);
          this.sealNodes.set(sealKey(side, level), child);
        }
      }
    });
  }

  /**
   * Create one interior PointLight per registered seal node and attach it to
   * `model`. Must be called after `buildSealNodes`.
   */
  buildSealBacklights(
    model: THREE.Object3D,
    modelRadius: number,
    lighting: ResolvedLightingConfig,
  ): void {
    const cfg = lighting.leds.sealBacklights;

    for (let layer = 0; layer < 3; layer++) {
      const level = RING_LEVEL_BY_LAYER_INDEX[layer];
      for (let lightIdx = 0; lightIdx < LIGHTS_PER_LAYER; lightIdx++) {
        const side = SIDES[lightIdx];
        const key = sealKey(side, level);
        const sealNode = this.sealNodes.get(key);
        if (!sealNode) continue;

        const pose = computeSealBacklightPose(layer, lightIdx, modelRadius, cfg.radiusFactor);

        const light = new THREE.PointLight(
          cfg.color,
          0,
          modelRadius * cfg.distanceFactor,
          cfg.decay,
        );
        light.position.set(pose.position.x, pose.position.y, pose.position.z);
        light.visible = false;
        model.add(light);

        this.sealBacklights.set(key, { light, sealNode, driver: { v: 0 } });
      }
    }
  }

  /** Show/hide seal nodes and drive backlight visibility according to the broken list. */
  applySeals(brokenSeals: SealIdentifier[], lighting: ResolvedLightingConfig): void {
    if (this.sealNodes.size === 0) return;

    const broken = new Set(brokenSeals.map(s => sealKey(s.side, s.level)));
    const cfg = lighting.leds.sealBacklights;

    for (const [key, node] of this.sealNodes) {
      const isBroken = broken.has(key);
      node.visible = !isBroken;
      const ref = this.sealBacklights.get(key);
      if (!ref) continue;
      const on = cfg.enabled && (!isBroken || cfg.backlightWhenBroken);
      ref.light.visible = on && ref.driver.v > 0.001;
      ref.light.intensity = (isBroken && !cfg.backlightWhenBroken ? 0 : ref.driver.v) * cfg.intensity;
    }
  }

  /** Reapply lighting config to all backlight PointLights. */
  updateLighting(lighting: ResolvedLightingConfig, modelRadius: number): void {
    const cfg = lighting.leds.sealBacklights;
    const backlightDistance = modelRadius * cfg.distanceFactor;

    for (const ref of this.sealBacklights.values()) {
      const pose = computeSealBacklightPose(
        this.layerFromSealNode(ref.sealNode),
        this.lightIndexFromSealNode(ref.sealNode),
        modelRadius,
        cfg.radiusFactor,
      );
      ref.light.position.set(pose.position.x, pose.position.y, pose.position.z);
      ref.light.color.setHex(cfg.color);
      ref.light.distance = backlightDistance;
      ref.light.decay = cfg.decay;
      const on = cfg.enabled && (ref.sealNode.visible || cfg.backlightWhenBroken);
      ref.light.intensity = (on ? ref.driver.v : 0) * cfg.intensity;
      ref.light.visible = on && ref.driver.v > 0.001;
    }
  }

  /** Emit a console warning listing any expected seal nodes absent from the model. */
  warnOnMissing(): void {
    const missing: string[] = [];
    for (const side of SEAL_SIDES) {
      for (const level of SEAL_LEVELS) {
        if (!this.sealNodes.has(sealKey(side, level))) {
          missing.push(`${SEAL_NAME_PREFIX}${side}_${level}`);
        }
      }
    }
    if (missing.length === 0) return;
    // eslint-disable-next-line no-console
    console.warn(
      `[Tower3DView] ${missing.length} seal node(s) missing from the loaded model; ` +
      `applySeals will be a no-op for them. Missing: ${missing.join(', ')}. ` +
      `Found: ${Array.from(this.sealNodes.keys()).sort().join(', ') || '(none)'}.`,
    );
  }

  /** Remove all backlights from their parents and clear both maps. */
  dispose(): void {
    for (const ref of this.sealBacklights.values()) {
      ref.light.removeFromParent();
    }
    this.sealBacklights.clear();
    this.sealNodes.clear();
  }

  // ─────────────────────────────────────────────────────────────────────────

  private layerFromSealNode(node: THREE.Object3D): number {
    const rest = node.name.slice(SEAL_NAME_PREFIX.length);
    const underscore = rest.indexOf('_');
    const level = rest.slice(underscore + 1);
    const idx = RING_LEVEL_BY_LAYER_INDEX.indexOf(level as 'top' | 'middle' | 'bottom');
    return idx >= 0 ? idx : 0;
  }

  private lightIndexFromSealNode(node: THREE.Object3D): number {
    const rest = node.name.slice(SEAL_NAME_PREFIX.length);
    const underscore = rest.indexOf('_');
    const side = rest.slice(0, underscore);
    const idx = SIDES.indexOf(side as typeof SIDES[number]);
    return idx >= 0 ? idx : 0;
  }
}
