import type { DeepRequired } from '../3d/types';
export type { DeepRequired };

/**
 * Nested, fully-optional physics configuration. Pass any subset to
 * `attachSkullPhysics` or `applyPhysicsConfig`; missing leaves fall back to
 * `DEFAULT_PHYSICS`. Grouped by domain (skull, drum, seal, static, board,
 * oob) to mirror how the lighting config is structured.
 */
export interface PhysicsConfig {
  /** Wireframe overlays for tuning. Live. */
  debug?: {
    /** Draw every active Rapier collider (world-wide overlay). */
    colliders?: boolean;
    /** Draw only the 12 kinematic seal/door colliders, colored by intact/broken. */
    sealColliders?: boolean;
  };
  /** The dynamic ball that gets dropped. */
  skull?: {
    /** Skull mesh radius as a fraction of `modelRadius`. Applies on next `dropSkull()`. */
    radiusFactor?: number;
    /** Friction on the skull body's collider. Applies on next `dropSkull()`. */
    friction?: number;
    /** Restitution (bounciness) on the skull body. Applies on next `dropSkull()`. */
    restitution?: number;
    /** Per-second exponential decay on angular velocity. Live. */
    angularDamping?: number;
    /** Per-second exponential decay on linear velocity. Live. */
    linearDamping?: number;
  };
  /** The three rotating drums (kinematic trimesh per level). */
  drum?: {
    /** Drum interior radius as a fraction of `modelRadius`. World-rebuild only (attach time). */
    innerRadiusFactor?: number;
    /** Drum interior half-height as a fraction of `modelRadius`. World-rebuild only. */
    halfHeightFactor?: number;
    /** Friction on the kinematic drum trimesh (Min combine rule). Live. */
    friction?: number;
  };
  /** The 12 cardinal seal panels (kinematic trimesh per seal). */
  seal?: {
    /** Friction on the kinematic seal trimeshes (Min combine rule). Live. */
    friction?: number;
  };
  /** Non-drum, non-seal GLB mesh trimeshes (cone funnel, base, outer shell). */
  static?: {
    /** Friction on every static GLB trimesh (Min combine rule). Live. */
    friction?: number;
  };
  /** The game-board floor + hollow rim the skull lands on after exiting the tower. */
  board?: {
    /** Board floor cylinder radius as a fraction of `modelRadius`. Live. */
    radiusFactor?: number;
    /** Board floor thickness as a fraction of `modelRadius`. World-rebuild only. */
    thicknessFactor?: number;
    /** Friction on the game-board floor collider (Average combine rule). Live. */
    friction?: number;
  };
  /** Out-of-bounds safety sensor that despawns escaped skulls. */
  oob?: {
    /** Distance below `modelBottomY` as a fraction of `modelRadius`. World-rebuild only. */
    depthFactor?: number;
  };
}

/**
 * Fully-resolved physics config — every leaf has a value. Used internally
 * by the manager and returned from `getPhysicsConfig()`.
 */
export type ResolvedPhysicsConfig = DeepRequired<PhysicsConfig>;

/**
 * Handle returned by `attachSkullPhysics`. Use `dropSkull` to spawn (and
 * respawn) the one-and-only skull; use `dispose` to tear down the physics
 * world and remove all subscriptions.
 */
export interface SkullPhysicsHandle {
  /**
   * Spawn a fresh skull above the top opening. Idempotent — if a skull is
   * already present it is removed before the new one is created.
   */
  dropSkull(): void;
  /**
   * Get a deep-cloned snapshot of the current fully-resolved physics
   * config. Safe to mutate the result.
   */
  getPhysicsConfig(): ResolvedPhysicsConfig;
  /**
   * Apply a partial config on top of the current one. Live-tunable leaves
   * (frictions, damping, debug overlays, board radius) take effect
   * immediately; skull-body leaves (radius, friction, restitution) take
   * effect on the next `dropSkull()`; geometry leaves
   * (drum half-height/inner radius, board thickness, oob depth) are only
   * honored at attach time and are silently ignored otherwise.
   */
  applyPhysicsConfig(partial: PhysicsConfig): void;
  /**
   * Tear down the Rapier world, remove the skull, and unsubscribe from
   * frame and seal-state callbacks. Safe to call multiple times.
   */
  dispose(): void;
}
