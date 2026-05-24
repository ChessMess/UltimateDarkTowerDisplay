import * as THREE from 'three';
import type { SealIdentifier } from 'ultimatedarktower';
import type { ResolvedLightingConfig } from './types';
import { LIGHTS_PER_LAYER, RING_LEVEL_BY_LAYER_INDEX, SIDES, BLOOM_LAYER } from './constants';
import { computeSealLedPose } from './utils';

const SEAL_NAME_PREFIX = 'seal_';
const SEAL_SIDES = ['north', 'south', 'east', 'west'] as const;
const SEAL_LEVELS = ['top', 'middle', 'bottom'] as const;

function sealKey(side: string, level: string): string {
  return `${side}:${level}`;
}

export interface SealBacklightRef {
  /**
   * Optional atmospheric accent PointLight. §4.19 interior-sprites removes
   * the 12 seal accent PointLights — `light` is always `null` on this branch.
   * The slot is retained so the bulk-lights gate machinery in Tower3DView
   * keeps the same null-guarded wire shape and any future alternative can
   * re-attach a real PointLight here without re-wiring this struct.
   */
  light: THREE.PointLight | null;
  /** Bright proxy mesh — the directly-visible "LED bulb" seen through cutouts. */
  proxyMesh: THREE.Mesh;
  /** Soft additive halo sprite around the proxy. */
  haloSprite: THREE.Sprite;
  /**
   * §4.19 interior atmospheric sprites — 0 or more large additive Sprites
   * placed inside the drum to fake the spill the removed accent PointLight
   * previously provided. Length matches `cfg.interior.count` when
   * `cfg.interior.enabled` is true at construction time; empty otherwise.
   * Driven from `driverV * cfg.interior.opacity` in `setSealLed`.
   */
  interiorSprites: THREE.Sprite[];
  sealNode: THREE.Object3D;
  driver: { v: number };
}

/**
 * Manages the 12 seal mesh nodes (4 sides × 3 ring levels) and their
 * corresponding inside-the-drum LED proxies (proxy mesh + halo sprite +
 * optional accent PointLight). Three.js depth testing naturally handles
 * glyph/chute alignment: the proxy is occluded by solid drum surfaces and
 * visible through real cutout holes — no manual alignment logic needed.
 *
 * All LED visuals are parented to the model root (not the seal node) so they
 * remain at fixed cardinal positions while drums rotate.
 */
export class SealManager {
  readonly sealNodes: Map<string, THREE.Object3D> = new Map();
  readonly sealBacklights: Map<string, SealBacklightRef> = new Map();

  private debugHelpers: THREE.Mesh[] = [];
  private gradientTexture: THREE.CanvasTexture | null = null;
  private sealListeners: Set<(broken: SealIdentifier[]) => void> = new Set();

  /**
   * Register a callback that fires after every `applySeals` call with the
   * broken-seals list. Returns an unsubscribe function. Used by external
   * integrations (e.g. physics colliders) that need to mirror seal state.
   */
  onSealsApplied(cb: (broken: SealIdentifier[]) => void): () => void {
    this.sealListeners.add(cb);
    return () => { this.sealListeners.delete(cb); };
  }

  /** @internal — exposed for tests; equals `sealListeners.size`. */
  get sealListenerCount(): number {
    return this.sealListeners.size;
  }

  /** Walk the loaded GLTF root and register every seal_<side>_<level> node. */
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
   * Create one proxy mesh + halo sprite (+ optional accent PointLight) per
   * registered seal node. All attached to `model` (root) — not to the seal
   * node — so they stay at fixed cardinal positions when drums rotate.
   * Must be called after `buildSealNodes`.
   */
  buildSealBacklights(
    model: THREE.Object3D,
    modelRadius: number,
    lighting: ResolvedLightingConfig,
  ): void {
    const cfg = lighting.leds.sealBacklights;
    const gradTex = this.getOrCreateGradientTexture();

    for (let layer = 0; layer < 3; layer++) {
      const level = RING_LEVEL_BY_LAYER_INDEX[layer];
      for (let lightIdx = 0; lightIdx < LIGHTS_PER_LAYER; lightIdx++) {
        const side = SIDES[lightIdx];
        const key = sealKey(side, level);
        const sealNode = this.sealNodes.get(key);
        if (!sealNode) continue;

        const pose = computeSealLedPose(layer, lightIdx, modelRadius, cfg.radiusFactor);
        const { x, y, z } = pose.position;

        // Proxy mesh — bright "LED bulb" visible through aligned cutout holes.
        const proxyRadius = modelRadius * cfg.proxy.sizeFactor;
        const proxyGeo = new THREE.SphereGeometry(proxyRadius, 8, 6);
        const proxyMat = new THREE.MeshBasicMaterial({
          color: cfg.color,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          toneMapped: false,
        });
        const proxyMesh = new THREE.Mesh(proxyGeo, proxyMat);
        proxyMesh.position.set(x, y, z);
        proxyMesh.layers.enable(BLOOM_LAYER);
        proxyMesh.renderOrder = 2;
        proxyMesh.castShadow = false;
        proxyMesh.receiveShadow = false;
        proxyMesh.visible = false;
        model.add(proxyMesh);

        // Halo sprite — soft additive glow, also depth-tested so it's occluded
        // by solid drum surfaces like the proxy.
        const haloMat = new THREE.SpriteMaterial({
          color: cfg.color,
          map: gradTex,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        });
        const haloSprite = new THREE.Sprite(haloMat);
        const haloScale = modelRadius * cfg.halo.sizeFactor;
        haloSprite.scale.setScalar(haloScale);
        haloSprite.position.set(x, y, z);
        haloSprite.layers.enable(BLOOM_LAYER);
        haloSprite.renderOrder = 3;
        haloSprite.visible = false;
        model.add(haloSprite);

        // §4.19 interior-sprites — accent PointLight removed entirely. The
        // optional interior sprites (below) replace its atmospheric-spill role
        // via additive billboard accumulation. The `light` slot stays null so
        // Tower3DView's bulk-lights gate can null-guard its writes without a
        // separate code path.

        // §4.19 interior atmospheric sprites. Always constructed (count from
        // cfg.interior.count, min 1) so cfg.interior.enabled can be toggled
        // at runtime via applyLightingConfig without a dispose + rebuild —
        // same lifecycle pattern as the existing halo. setSealLed gates
        // visibility on cfg.interior.enabled && driverV > 0.001. Multiple
        // sprites per seal are vertically distributed (±0.15 × modelRadius)
        // so they read as a soft column rather than fully overlapping.
        // Render order 1 sits between the drum body (default 0) and the
        // proxy/halo (2/3) so interior sprites are depth-occluded by drum
        // walls but render in front of the drum interior surface to
        // additively glow.
        const interiorSprites: THREE.Sprite[] = [];
        const interiorCount = Math.max(1, cfg.interior.count);
        const interiorScale = modelRadius * cfg.interior.sizeFactor;
        const ySpread = modelRadius * 0.15;
        for (let i = 0; i < interiorCount; i++) {
          // Distribute in y: count=1 → centred; count=2 → ±ySpread;
          // count=3 → -ySpread, 0, +ySpread.
          const yOffset =
            interiorCount === 1
              ? 0
              : interiorCount === 2
                ? (i === 0 ? -ySpread : ySpread)
                : (i - 1) * ySpread;
          const sprMat = new THREE.SpriteMaterial({
            color: cfg.color,
            map: gradTex,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
          });
          const spr = new THREE.Sprite(sprMat);
          spr.scale.setScalar(interiorScale);
          spr.position.set(x, y + yOffset, z);
          spr.layers.enable(BLOOM_LAYER);
          spr.renderOrder = 1;
          spr.visible = false;
          model.add(spr);
          interiorSprites.push(spr);
        }

        this.sealBacklights.set(key, {
          light: null,
          proxyMesh,
          haloSprite,
          interiorSprites,
          sealNode,
          driver: { v: 0 },
        });
      }
    }
  }

  /**
   * Drive proxy opacity, halo opacity, and accent PointLight intensity from
   * `driverV` (0–1). This is the single write path — both the LedEffectAnimator
   * (effect changes) and applySeals (broken-list changes) call through here.
   */
  setSealLed(key: string, driverV: number, lighting: ResolvedLightingConfig): void {
    const ref = this.sealBacklights.get(key);
    if (!ref) return;
    const cfg = lighting.leds.sealBacklights;

    if (!cfg.enabled) {
      ref.proxyMesh.visible = false;
      ref.haloSprite.visible = false;
      for (const spr of ref.interiorSprites) spr.visible = false;
      if (ref.light) ref.light.intensity = 0;
      return;
    }

    ref.driver.v = driverV;
    const on = driverV > 0.001;

    if (cfg.proxy.enabled) {
      (ref.proxyMesh.material as THREE.MeshBasicMaterial).opacity = driverV;
      ref.proxyMesh.visible = on;
    } else {
      ref.proxyMesh.visible = false;
    }

    if (cfg.halo.enabled) {
      (ref.haloSprite.material as THREE.SpriteMaterial).opacity = driverV * cfg.halo.opacity;
      ref.haloSprite.visible = on;
    } else {
      ref.haloSprite.visible = false;
    }

    // §4.19 interior atmospheric sprites. Driven by driverV; hidden when
    // cfg.interior.enabled is false (resilient to runtime toggles even though
    // the sprite array was empty at construction in that case).
    if (cfg.interior.enabled) {
      const interiorOpacity = driverV * cfg.interior.opacity;
      for (const spr of ref.interiorSprites) {
        (spr.material as THREE.SpriteMaterial).opacity = interiorOpacity;
        spr.visible = on;
      }
    } else {
      for (const spr of ref.interiorSprites) spr.visible = false;
    }

    // §4.19 interior-sprites — accent PointLight removed (`ref.light` always
    // null). Branch kept null-guarded so future alternatives can drop a real
    // light back into the SealBacklightRef without changing this write path.
    if (ref.light) {
      ref.light.intensity = cfg.accentLight ? driverV * cfg.intensity : 0;
    }
  }

  /**
   * Show/hide seal nodes according to the broken list. When a seal is broken, the
   * backlight is also updated: if `backlightWhenBroken` is false, the LED is forced
   * off; if true (default), the LED keeps its current driver state.
   */
  applySeals(brokenSeals: SealIdentifier[], lighting?: ResolvedLightingConfig): void {
    if (this.sealNodes.size === 0) {
      this.notifySealListeners(brokenSeals);
      return;
    }
    const broken = new Set(brokenSeals.map(s => sealKey(s.side, s.level)));
    for (const [key, node] of this.sealNodes) {
      const isBroken = broken.has(key);
      node.visible = !isBroken;
      if (isBroken && lighting) {
        const ref = this.sealBacklights.get(key);
        const keepOn = lighting.leds.sealBacklights.backlightWhenBroken;
        const driverV = keepOn ? (ref?.driver.v ?? 0) : 0;
        this.setSealLed(key, driverV, lighting);
      }
    }
    this.notifySealListeners(brokenSeals);
  }

  private notifySealListeners(brokenSeals: SealIdentifier[]): void {
    for (const cb of this.sealListeners) {
      try {
        cb(brokenSeals);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[SealManager] seal listener threw', err);
      }
    }
  }

  /** Reapply lighting config to all seal LED visuals. */
  updateLighting(lighting: ResolvedLightingConfig, modelRadius: number): void {
    const cfg = lighting.leds.sealBacklights;
    const color = new THREE.Color(cfg.color);
    const backlightDistance = modelRadius * cfg.distanceFactor;

    for (const [key, ref] of this.sealBacklights) {
      const pose = computeSealLedPose(
        this.layerFromKey(key),
        this.lightIndexFromKey(key),
        modelRadius,
        cfg.radiusFactor,
      );
      const { x, y, z } = pose.position;

      ref.proxyMesh.position.set(x, y, z);
      (ref.proxyMesh.material as THREE.MeshBasicMaterial).color.copy(color);
      const proxyRadius = modelRadius * cfg.proxy.sizeFactor;
      ref.proxyMesh.scale.setScalar(proxyRadius / (ref.proxyMesh.geometry as THREE.SphereGeometry).parameters.radius);

      ref.haloSprite.position.set(x, y, z);
      (ref.haloSprite.material as THREE.SpriteMaterial).color.copy(color);
      const haloScale = modelRadius * cfg.halo.sizeFactor;
      ref.haloSprite.scale.setScalar(haloScale);

      // §4.19 interior-sprites — hot-reload color + scale + position for every
      // interior sprite. Opacity is re-derived from driver.v in setSealLed (below).
      if (ref.interiorSprites.length > 0) {
        const interiorScale = modelRadius * cfg.interior.sizeFactor;
        const count = ref.interiorSprites.length;
        const ySpread = modelRadius * 0.15;
        for (let i = 0; i < count; i++) {
          const spr = ref.interiorSprites[i];
          (spr.material as THREE.SpriteMaterial).color.copy(color);
          spr.scale.setScalar(interiorScale);
          const yOffset =
            count === 1
              ? 0
              : count === 2
                ? (i === 0 ? -ySpread : ySpread)
                : (i - 1) * ySpread;
          spr.position.set(x, y + yOffset, z);
        }
      }

      if (ref.light) {
        ref.light.position.set(x, y, z);
        ref.light.color.copy(color);
        ref.light.distance = backlightDistance;
        ref.light.decay = cfg.decay;
      }

      this.setSealLed(key, ref.driver.v, lighting);
    }
  }

  /** Emit a console warning for any expected seal nodes absent from the model. */
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

  /**
   * Show/hide small yellow debug spheres at each proxy position.
   * Enabled by the `debug3D` flag so placement can be validated against the real GLB.
   */
  setDebug(enabled: boolean, parent: THREE.Object3D): void {
    for (const helper of this.debugHelpers) {
      helper.removeFromParent();
      (helper.material as THREE.Material).dispose();
      helper.geometry.dispose();
    }
    this.debugHelpers = [];

    if (!enabled) return;

    const debugMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    for (const ref of this.sealBacklights.values()) {
      const geo = new THREE.SphereGeometry(
        (ref.proxyMesh.geometry as THREE.SphereGeometry).parameters.radius * 0.8,
        6, 4,
      );
      const mesh = new THREE.Mesh(geo, debugMat);
      mesh.position.copy(ref.proxyMesh.position);
      mesh.renderOrder = 10;
      parent.add(mesh);
      this.debugHelpers.push(mesh);
    }
  }

  /** Remove all LED visuals from their parents and clear both maps. */
  dispose(): void {
    for (const ref of this.sealBacklights.values()) {
      ref.light?.removeFromParent();
      ref.proxyMesh.geometry.dispose();
      (ref.proxyMesh.material as THREE.Material).dispose();
      ref.proxyMesh.removeFromParent();
      (ref.haloSprite.material as THREE.Material).dispose();
      ref.haloSprite.removeFromParent();
      for (const spr of ref.interiorSprites) {
        (spr.material as THREE.Material).dispose();
        spr.removeFromParent();
      }
    }
    this.sealBacklights.clear();
    this.sealNodes.clear();

    for (const helper of this.debugHelpers) {
      helper.removeFromParent();
      (helper.material as THREE.Material).dispose();
      helper.geometry.dispose();
    }
    this.debugHelpers = [];

    this.gradientTexture?.dispose();
    this.gradientTexture = null;

    this.sealListeners.clear();
  }

  // ─────────────────────────────────────────────────────────────────────────

  private getOrCreateGradientTexture(): THREE.CanvasTexture {
    if (this.gradientTexture) return this.gradientTexture;

    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const center = size / 2;
      const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.4, 'rgba(255,255,255,0.6)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
    }

    this.gradientTexture = new THREE.CanvasTexture(canvas);
    return this.gradientTexture;
  }

  private layerFromKey(key: string): number {
    const level = key.split(':')[1] as 'top' | 'middle' | 'bottom';
    const idx = RING_LEVEL_BY_LAYER_INDEX.indexOf(level);
    return idx >= 0 ? idx : 0;
  }

  private lightIndexFromKey(key: string): number {
    const side = key.split(':')[0];
    const idx = SIDES.indexOf(side as typeof SIDES[number]);
    return idx >= 0 ? idx : 0;
  }
}
