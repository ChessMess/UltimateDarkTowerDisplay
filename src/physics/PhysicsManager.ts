import * as THREE from 'three';
import type { SealIdentifier, TowerPhysicsHooks } from '../types';
import type { PhysicsConfig, ResolvedPhysicsConfig } from './types';
import { resolvePhysics } from './PhysicsResolver';
import { buildStaticColliderSpecs } from './buildColliders';

// Rapier is dynamic-imported inside init() so the WASM init runs once.
type RAPIER_NS = typeof import('@dimforge/rapier3d-compat');
type RapierWorld = import('@dimforge/rapier3d-compat').World;
type RapierRigidBody = import('@dimforge/rapier3d-compat').RigidBody;
type RapierCollider = import('@dimforge/rapier3d-compat').Collider;

/** Per-frame scratch for sync'ing kinematic drum trimesh poses without alloc. */
const drumStepScratch = {
  pos: new THREE.Vector3(),
  quat: new THREE.Quaternion(),
};

/** Seal-wireframe color for intact (green) and broken (red) states. */
const SEAL_WIRE_COLOR_INTACT = 0x2dff52;
const SEAL_WIRE_COLOR_BROKEN = 0xff2e2e;

const SEAL_NAME_PREFIX = 'seal_';
const SEAL_SIDES = ['north', 'east', 'south', 'west'] as const;
const SEAL_LEVELS = ['top', 'middle', 'bottom'] as const;
type SealSide = typeof SEAL_SIDES[number];
type SealLevel = typeof SEAL_LEVELS[number];

function parseSealNode(name: string): { side: SealSide; level: SealLevel } | null {
  if (!name.startsWith(SEAL_NAME_PREFIX)) return null;
  const rest = name.slice(SEAL_NAME_PREFIX.length);
  const underscore = rest.indexOf('_');
  if (underscore < 0) return null;
  const side = rest.slice(0, underscore);
  const level = rest.slice(underscore + 1);
  if (!SEAL_SIDES.includes(side as SealSide)) return null;
  if (!SEAL_LEVELS.includes(level as SealLevel)) return null;
  return { side: side as SealSide, level: level as SealLevel };
}

interface DrumColliderRef {
  body: RapierRigidBody;
  collider: RapierCollider;
  node: THREE.Object3D;
}

interface SealColliderRef {
  body: RapierRigidBody;
  collider: RapierCollider;
  /** Visual seal node — its world transform drives the body each frame. */
  node: THREE.Object3D;
  /** Wireframe overlay for the seal-debug checkbox (visible toggled separately). */
  wireframe: THREE.LineSegments;
  /** Currently-applied material so we can swap it when broken state flips. */
  wireMat: THREE.LineBasicMaterial;
}

interface SkullRef {
  body: RapierRigidBody;
  mesh: THREE.Mesh;
}

function sealKey(level: SealLevel, side: SealSide): string {
  return `${level}:${side}`;
}

/**
 * Owns the Rapier physics world and ties it to the Tower3DView via the hooks
 * surface. Public lifecycle: `init()` (async), `dropSkull()`, `dispose()`.
 */
export class PhysicsManager {
  private rapier: RAPIER_NS | null = null;
  private world: RapierWorld | null = null;
  /** Single source of truth for every tunable. Live-updated by applyPhysicsConfig. */
  private config: ResolvedPhysicsConfig;
  private readonly hooks: TowerPhysicsHooks;

  private unsubFrame: () => void = () => { };
  private unsubSeal: () => void = () => { };
  private unsubModel: () => void = () => { };

  private brokenSet: Set<string> = new Set();
  private trimeshCount = 0;
  /** Kinematic drum trimesh bodies, keyed by drum level. */
  private drumColliders: Map<'top' | 'middle' | 'bottom', DrumColliderRef> = new Map();
  /** Kinematic seal trimesh bodies, keyed by `${level}:${side}`. */
  private sealColliders: Map<string, SealColliderRef> = new Map();
  /** Fixed-body trimesh colliders for non-drum/non-seal GLB meshes. */
  private staticGlbColliders: RapierCollider[] = [];
  /** The game-board floor collider, set in buildStaticColliders. */
  private boardCollider: RapierCollider | null = null;
  /** The hollow-cylinder lip around the board's edge (trimesh of N segments). */
  private boardLipBody: RapierRigidBody | null = null;
  private boardLipCollider: RapierCollider | null = null;

  private skull: SkullRef | null = null;
  /** True if dropSkull() was called before colliders were built. */
  private pendingDrop = false;
  private disposed = false;
  /** True once `onModelLoaded` has fired and colliders are built. */
  private ready = false;

  /** Snapshot of model bounds captured at model-load time. */
  private bounds: { modelRadius: number; modelBottomY: number; modelTopY: number } = {
    modelRadius: 1,
    modelBottomY: -1,
    modelTopY: 1,
  };

  /** Debug-visualization line segments overlay (opt-in via config.debug.colliders). */
  private debugLines: THREE.LineSegments | null = null;

  constructor(hooks: TowerPhysicsHooks, config?: PhysicsConfig) {
    this.hooks = hooks;
    this.config = resolvePhysics(config);
  }

  /**
   * Lazy-init Rapier WASM, create the world, and subscribe to the view's
   * hooks. Collider construction is deferred until the GLB has loaded —
   * `onModelLoaded` then drives the actual build using real model bounds.
   */
  async init(): Promise<void> {
    if (this.disposed) return;
    const RAPIER = await import('@dimforge/rapier3d-compat');
    await RAPIER.init();
    if (this.disposed) return;
    this.rapier = RAPIER;

    // Default gravity scaled to a unit-radius model; rescaled on model-load.
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

    this.unsubFrame = this.hooks.onFrame((dt) => this.step(dt));
    this.unsubSeal = this.hooks.onSealsApplied((broken) => this.applyBrokenSeals(broken));
    this.unsubModel = this.hooks.onModelLoaded((info) => this.onModelReady(info));
  }

  /**
   * Called once the host view's GLB model is loaded — at this point model
   * bounds and named drum/seal nodes are stable. Builds every static and
   * kinematic collider with correct dimensions, then drains any queued drop.
   */
  private onModelReady(info: {
    root: THREE.Object3D;
    modelRadius: number;
    modelBottomY: number;
    modelTopY: number;
  }): void {
    if (this.disposed || !this.rapier || !this.world) return;
    if (this.ready) return;
    this.ready = true;

    this.bounds = {
      modelRadius: info.modelRadius,
      modelBottomY: info.modelBottomY,
      modelTopY: info.modelTopY,
    };

    // Rescale gravity to the real model radius. Rapier's World ctor took the
    // placeholder; mutate `gravity` to match the now-known scale.
    this.world.gravity = { x: 0, y: -info.modelRadius * 9.81, z: 0 };

    this.buildStaticColliders();
    this.buildGlbTrimeshColliders(info.root);
    if (this.config.debug.colliders) this.buildDebugOverlay();
    // Apply seal-debug overlay visibility if it was set before colliders existed.
    this.applySealDebugVisibility();

    if (this.pendingDrop) {
      this.pendingDrop = false;
      this.dropSkull();
    }
  }

  /**
   * Spawn (or respawn) the single skull just above the top of the tower.
   * If init() hasn't resolved yet, the drop is queued until it does.
   */
  dropSkull(): void {
    if (this.disposed) return;
    if (!this.rapier || !this.world || !this.ready) {
      this.pendingDrop = true;
      return;
    }
    this.despawnSkull();

    const RAPIER = this.rapier;
    const R = this.bounds.modelRadius;
    const r = R * this.config.skull.radiusFactor;
    const spawnY = this.bounds.modelTopY + R * 0.02;

    // Drop somewhere over the top opening, not straight down the axis. The
    // opening is roughly the drum's inner radius wide; jitter within a disc
    // sized as a fraction of it so the skull still clears the rim.
    const jitterMax = R * this.config.drum.innerRadiusFactor * 0.6;
    const jitterAngle = Math.random() * Math.PI * 2;
    const jitterRadius = Math.sqrt(Math.random()) * jitterMax;
    const spawnX = Math.cos(jitterAngle) * jitterRadius;
    const spawnZ = Math.sin(jitterAngle) * jitterRadius;

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawnX, spawnY, spawnZ)
      .setCcdEnabled(true)
      .setAngularDamping(this.config.skull.angularDamping)
      .setLinearDamping(this.config.skull.linearDamping);
    const body = this.world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.ball(r)
      .setFriction(this.config.skull.friction)
      .setRestitution(this.config.skull.restitution);
    this.world.createCollider(colliderDesc, body);

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(r, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.6, metalness: 0.1 }),
    );
    mesh.position.set(spawnX, spawnY, spawnZ);
    mesh.castShadow = true;
    this.hooks.scene.add(mesh);

    this.skull = { body, mesh };
  }

  /** Tear down the Rapier world and release all references. Safe to re-call. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.unsubFrame();
    this.unsubSeal();
    this.unsubModel();
    this.unsubFrame = () => { };
    this.unsubSeal = () => { };
    this.unsubModel = () => { };

    this.despawnSkull();

    if (this.debugLines) {
      this.debugLines.removeFromParent();
      this.debugLines.geometry.dispose();
      (this.debugLines.material as THREE.Material).dispose();
      this.debugLines = null;
    }

    for (const [, ref] of this.sealColliders) {
      ref.wireframe.removeFromParent();
      ref.wireframe.geometry.dispose();
      ref.wireMat.dispose();
    }
    this.sealColliders.clear();

    // Rapier's World owns all rigid bodies and colliders; calling free()
    // releases the WASM memory in one go.
    this.world?.free();
    this.world = null;
    this.rapier = null;
    this.brokenSet.clear();
    this.drumColliders.clear();
    this.staticGlbColliders.length = 0;
    this.boardCollider = null;
    this.boardLipBody = null;
    this.boardLipCollider = null;
  }

  // ── internals ──────────────────────────────────────────────────────────

  private buildStaticColliders(): void {
    if (!this.rapier || !this.world) return;
    const RAPIER = this.rapier;
    const world = this.world;

    const specs = buildStaticColliderSpecs({
      modelRadius: this.bounds.modelRadius,
      modelBottomY: this.bounds.modelBottomY,
      modelTopY: this.bounds.modelTopY,
      config: this.config,
    });

    // Board floor: a thin cylinder collider matching the visual disc's
    // shape (round, axis-aligned to Y). Radius comes directly from the
    // resolved config (synced to the host app's visual board-size slider).
    {
      const halfThick = specs.boardFloor.thickness / 2;
      const desc = RAPIER.RigidBodyDesc.fixed()
        .setTranslation(0, specs.boardFloor.y - halfThick, 0);
      const body = world.createRigidBody(desc);
      const cd = RAPIER.ColliderDesc.cylinder(halfThick, specs.boardFloor.radius)
        .setFriction(this.config.board.friction)
        .setRestitution(this.config.skull.restitution);
      this.boardCollider = world.createCollider(cd, body);
    }

    // OOB safety net: a Y-coordinate check in `step()` despawns skulls that
    // fall below the board (e.g. through a physics glitch). No collider
    // needed for it; the manual `t.y < ...` test is enough.
    void specs.oobSensor;

    // Drum inner walls are no longer authored parametrically — the trimesh
    // colliders built from the GLB body (in buildGlbTrimeshColliders) provide
    // the real outer shell with cutouts at cardinal slot positions. Doors
    // (built separately as kinematic bodies) close those cutouts when sealed.
    void specs.drumWalls;

    // Board lip: a hollow vertical ring (trimesh) around the board edge that
    // prevents skulls from rolling off. Initial radius matches the floor.
    this.rebuildBoardLip();
  }

  /**
   * (Re)build the board-edge lip — a trimesh of `N` quads around the perimeter
   * of the board floor, like a short cylindrical rim. Called at world build
   * time and whenever the board radius changes via `applyPhysicsConfig`.
   */
  private rebuildBoardLip(): void {
    if (!this.rapier || !this.world) return;
    const RAPIER = this.rapier;
    const world = this.world;

    if (this.boardLipBody) {
      world.removeRigidBody(this.boardLipBody);
      this.boardLipBody = null;
      this.boardLipCollider = null;
    }

    const R = this.bounds.modelRadius;
    const radius = R * this.config.board.radiusFactor;
    const lipHeight = R * 0.06;
    const y0 = this.bounds.modelBottomY;
    const y1 = y0 + lipHeight;
    const N = 48;

    // 2N ring vertices: (bottom_i, top_i) alternating around the circle.
    const verts = new Float32Array(2 * N * 3);
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const x = Math.cos(a) * radius;
      const z = Math.sin(a) * radius;
      const o = i * 6;
      verts[o + 0] = x; verts[o + 1] = y0; verts[o + 2] = z;
      verts[o + 3] = x; verts[o + 4] = y1; verts[o + 5] = z;
    }
    // 2N triangles (two per segment) → 6N index entries.
    const indices = new Uint32Array(N * 6);
    for (let i = 0; i < N; i++) {
      const bot_i = i * 2;
      const top_i = i * 2 + 1;
      const bot_n = ((i + 1) % N) * 2;
      const top_n = ((i + 1) % N) * 2 + 1;
      const o = i * 6;
      indices[o + 0] = bot_i;
      indices[o + 1] = top_i;
      indices[o + 2] = bot_n;
      indices[o + 3] = top_i;
      indices[o + 4] = top_n;
      indices[o + 5] = bot_n;
    }

    const bodyDesc = RAPIER.RigidBodyDesc.fixed();
    const body = world.createRigidBody(bodyDesc);
    const cd = RAPIER.ColliderDesc.trimesh(verts, indices)
      .setFriction(this.config.board.friction)
      .setRestitution(this.config.skull.restitution);
    const collider = world.createCollider(cd, body);
    this.boardLipBody = body;
    this.boardLipCollider = collider;
  }

  /**
   * Walk the loaded GLB root and create one Rapier trimesh collider per
   * THREE.Mesh:
   *   - Static meshes (non-drum, non-seal): fixed body, vertices baked into
   *     world space.
   *   - Drums (`drum_*`): kinematic-position-based body that tracks the
   *     visual drum's transform each frame, with vertices in the drum's
   *     local frame (scale baked in via worldScale at build time).
   *   - Seals (`seal_*`): skipped — handled by the kinematic door colliders
   *     and the seal-state listener.
   */
  private buildGlbTrimeshColliders(root: THREE.Object3D): void {
    if (!this.rapier || !this.world) return;
    const RAPIER = this.rapier;
    const world = this.world;

    // Make sure every transform is current before we read matrixWorld.
    root.updateMatrixWorld(true);

    let staticBuilt = 0;
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;

      const name = mesh.name ?? '';
      const geom = mesh.geometry;
      if (!geom) return;
      const posAttr = geom.getAttribute('position') as THREE.BufferAttribute | undefined;
      if (!posAttr || posAttr.count === 0) return;

      const drumLevel = parseDrumLevel(name);
      if (drumLevel) {
        this.buildDrumTrimesh(mesh, drumLevel, posAttr, geom);
        return;
      }

      const sealId = parseSealNode(name);
      if (sealId) {
        this.buildSealTrimesh(mesh, sealId, posAttr, geom);
        return;
      }

      // Static mesh: bake matrixWorld into the vertices and create a fixed
      // body at world origin.
      const v = new THREE.Vector3();
      const verts = new Float32Array(posAttr.count * 3);
      for (let i = 0; i < posAttr.count; i++) {
        v.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
        v.applyMatrix4(mesh.matrixWorld);
        verts[i * 3 + 0] = v.x;
        verts[i * 3 + 1] = v.y;
        verts[i * 3 + 2] = v.z;
      }
      const indices = extractIndices(geom, posAttr.count);

      const bodyDesc = RAPIER.RigidBodyDesc.fixed();
      const body = world.createRigidBody(bodyDesc);
      const cd = RAPIER.ColliderDesc.trimesh(verts, indices)
        .setFriction(this.config.static.friction)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
        .setRestitution(this.config.skull.restitution);
      const collider = world.createCollider(cd, body);
      this.staticGlbColliders.push(collider);
      staticBuilt++;
    });

    this.trimeshCount = staticBuilt;
  }

  /**
   * Build one kinematic-position-based trimesh for a drum mesh. Vertices are
   * extracted in the drum's local frame so the kinematic body's pose (synced
   * to the visual drum each frame in `step`) carries them with it. Static
   * world scale is baked in here since scale doesn't animate.
   */
  private buildDrumTrimesh(
    mesh: THREE.Mesh,
    level: 'top' | 'middle' | 'bottom',
    posAttr: THREE.BufferAttribute,
    geom: THREE.BufferGeometry,
  ): void {
    if (!this.rapier || !this.world) return;
    const RAPIER = this.rapier;
    const world = this.world;

    const worldScale = new THREE.Vector3();
    mesh.getWorldScale(worldScale);

    const verts = new Float32Array(posAttr.count * 3);
    for (let i = 0; i < posAttr.count; i++) {
      verts[i * 3 + 0] = posAttr.getX(i) * worldScale.x;
      verts[i * 3 + 1] = posAttr.getY(i) * worldScale.y;
      verts[i * 3 + 2] = posAttr.getZ(i) * worldScale.z;
    }
    const indices = extractIndices(geom, posAttr.count);

    const wp = new THREE.Vector3();
    const wq = new THREE.Quaternion();
    mesh.getWorldPosition(wp);
    mesh.getWorldQuaternion(wq);

    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(wp.x, wp.y, wp.z)
      .setRotation({ x: wq.x, y: wq.y, z: wq.z, w: wq.w });
    const body = world.createRigidBody(bodyDesc);
    const cd = RAPIER.ColliderDesc.trimesh(verts, indices)
      .setFriction(this.config.drum.friction)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
      .setRestitution(this.config.skull.restitution);
    const collider = world.createCollider(cd, body);

    this.drumColliders.set(level, { body, collider, node: mesh });
  }

  /**
   * Build a kinematic trimesh collider for a single seal mesh. The body's pose
   * tracks the visual seal node's world transform every frame (so it rotates
   * with its drum if the GLB has it parented to one, or stays put if not).
   * The collider is enabled/disabled by `applyBrokenSeals`.
   */
  private buildSealTrimesh(
    mesh: THREE.Mesh,
    id: { side: 'north' | 'east' | 'south' | 'west'; level: 'top' | 'middle' | 'bottom' },
    posAttr: THREE.BufferAttribute,
    geom: THREE.BufferGeometry,
  ): void {
    if (!this.rapier || !this.world) return;
    const RAPIER = this.rapier;
    const world = this.world;

    const worldScale = new THREE.Vector3();
    mesh.getWorldScale(worldScale);

    const verts = new Float32Array(posAttr.count * 3);
    for (let i = 0; i < posAttr.count; i++) {
      verts[i * 3 + 0] = posAttr.getX(i) * worldScale.x;
      verts[i * 3 + 1] = posAttr.getY(i) * worldScale.y;
      verts[i * 3 + 2] = posAttr.getZ(i) * worldScale.z;
    }
    const indices = extractIndices(geom, posAttr.count);

    const wp = new THREE.Vector3();
    const wq = new THREE.Quaternion();
    mesh.getWorldPosition(wp);
    mesh.getWorldQuaternion(wq);

    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(wp.x, wp.y, wp.z)
      .setRotation({ x: wq.x, y: wq.y, z: wq.z, w: wq.w });
    const body = world.createRigidBody(bodyDesc);
    const cd = RAPIER.ColliderDesc.trimesh(verts, indices)
      .setFriction(this.config.seal.friction)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
      .setRestitution(this.config.skull.restitution);
    const collider = world.createCollider(cd, body);

    // Wireframe overlay for the seal-debug checkbox. Built once; the seal
    // body's pose drives its transform each frame so it follows the visual
    // seal even when broken (and thus invisible) and when the drum rotates.
    const wireGeom = new THREE.WireframeGeometry(geom);
    const wireMat = new THREE.LineBasicMaterial({
      color: SEAL_WIRE_COLOR_INTACT,
      depthTest: false,
      transparent: true,
      opacity: 0.95,
    });
    const wireframe = new THREE.LineSegments(wireGeom, wireMat);
    wireframe.renderOrder = 1000;
    wireframe.visible = false;
    // Apply the same scale once so the wireframe matches the seal mesh.
    wireframe.scale.copy(worldScale);
    this.hooks.scene.add(wireframe);

    this.sealColliders.set(sealKey(id.level, id.side), {
      body,
      collider,
      node: mesh,
      wireframe,
      wireMat,
    });
  }

  /** Per-frame: update kinematic poses, step world, sync skull mesh. */
  private step(dt: number): void {
    if (!this.world || !this.ready) return;
    const R = this.bounds.modelRadius;

    // Drums (kinematic trimesh): mirror the visual drum node's world transform.
    const wp = drumStepScratch.pos;
    const wq = drumStepScratch.quat;
    for (const [, ref] of this.drumColliders) {
      ref.node.getWorldPosition(wp);
      ref.node.getWorldQuaternion(wq);
      ref.body.setNextKinematicTranslation({ x: wp.x, y: wp.y, z: wp.z });
      ref.body.setNextKinematicRotation({ x: wq.x, y: wq.y, z: wq.z, w: wq.w });
    }

    // Seals (kinematic trimesh): also track the visual seal node's world
    // transform. Whether the seal rotates with the drum depends on the GLB
    // hierarchy; either way, the body matches what the user sees.
    for (const [, ref] of this.sealColliders) {
      ref.node.getWorldPosition(wp);
      ref.node.getWorldQuaternion(wq);
      ref.body.setNextKinematicTranslation({ x: wp.x, y: wp.y, z: wp.z });
      ref.body.setNextKinematicRotation({ x: wq.x, y: wq.y, z: wq.z, w: wq.w });
      if (this.config.debug.sealColliders) {
        ref.wireframe.position.set(wp.x, wp.y, wp.z);
        ref.wireframe.quaternion.set(wq.x, wq.y, wq.z, wq.w);
      }
    }


    // Rapier's step uses its own fixed timestep internally; `dt` is unused for
    // numerical integration but is reserved for future variable-step modes.
    void dt;
    this.world.step();

    if (this.skull) {
      const t = this.skull.body.translation();
      this.skull.mesh.position.set(t.x, t.y, t.z);
      const r = this.skull.body.rotation();
      this.skull.mesh.quaternion.set(r.x, r.y, r.z, r.w);

      // OOB despawn: if the skull falls below the safety net Y, remove it.
      if (t.y < this.bounds.modelBottomY - R * 4) {
        this.despawnSkull();
      }
    }

    if (this.debugLines) this.updateDebugOverlay();
  }

  /**
   * Build a `THREE.LineSegments` overlay backed by Rapier's `world.debugRender`
   * output. Useful for verifying collider placement against the visual model
   * during tuning.
   */
  private buildDebugOverlay(): void {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(0), 4));
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 });
    const lines = new THREE.LineSegments(geom, mat);
    lines.renderOrder = 999;
    (lines.material as THREE.LineBasicMaterial).depthTest = false;
    this.hooks.scene.add(lines);
    this.debugLines = lines;
  }

  private updateDebugOverlay(): void {
    if (!this.world || !this.debugLines) return;
    const buf = this.world.debugRender();
    // Rapier returns interleaved (x, y, z) vertex pairs and (r, g, b, a) colors.
    const posAttr = this.debugLines.geometry.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = this.debugLines.geometry.getAttribute('color') as THREE.BufferAttribute;
    if (posAttr.array.length !== buf.vertices.length) {
      this.debugLines.geometry.setAttribute('position', new THREE.BufferAttribute(buf.vertices, 3));
      this.debugLines.geometry.setAttribute('color', new THREE.BufferAttribute(buf.colors, 4));
    } else {
      (posAttr.array as Float32Array).set(buf.vertices);
      (colAttr.array as Float32Array).set(buf.colors);
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
    }
    this.debugLines.geometry.computeBoundingSphere();
  }

  /**
   * Return a deep-cloned snapshot of the fully-resolved physics config.
   * Safe to mutate the result.
   */
  getPhysicsConfig(): ResolvedPhysicsConfig {
    return structuredClone(this.config);
  }

  /**
   * Apply a partial physics config on top of the current one. Live-tunable
   * leaves (debug overlays, frictions, damping, board radius/friction)
   * take effect immediately; skull-body leaves (radius, friction,
   * restitution) take effect on the next `dropSkull()`; geometry leaves
   * (drum sizes, board thickness, oob depth) only matter at world-build
   * time and are silently ignored after that.
   */
  applyPhysicsConfig(partial: PhysicsConfig): void {
    if (this.disposed) return;
    const prev = this.config;
    this.config = resolvePhysics(partial, prev);

    // Apply live-tunable changes. We compare against `prev` so we only do
    // work when a value actually changed — most ticks of a slider only
    // touch one leaf.
    if (this.config.drum.friction !== prev.drum.friction) {
      for (const [, ref] of this.drumColliders) ref.collider.setFriction(this.config.drum.friction);
    }
    if (this.config.seal.friction !== prev.seal.friction) {
      for (const [, ref] of this.sealColliders) ref.collider.setFriction(this.config.seal.friction);
    }
    if (this.config.static.friction !== prev.static.friction) {
      for (const c of this.staticGlbColliders) c.setFriction(this.config.static.friction);
    }
    if (this.config.board.friction !== prev.board.friction) {
      this.boardCollider?.setFriction(this.config.board.friction);
      this.boardLipCollider?.setFriction(this.config.board.friction);
    }
    if (this.config.board.radiusFactor !== prev.board.radiusFactor) {
      if (this.boardCollider) {
        this.boardCollider.setRadius(this.bounds.modelRadius * this.config.board.radiusFactor);
      }
      if (this.boardLipBody) {
        // Trimesh radius isn't mutable; rebuild from scratch.
        this.rebuildBoardLip();
      }
    }
    if (this.config.skull.angularDamping !== prev.skull.angularDamping) {
      this.skull?.body.setAngularDamping(this.config.skull.angularDamping);
    }
    if (this.config.skull.linearDamping !== prev.skull.linearDamping) {
      this.skull?.body.setLinearDamping(this.config.skull.linearDamping);
    }
    if (this.config.debug.sealColliders !== prev.debug.sealColliders) {
      this.applySealDebugVisibility();
    }
    // Note: `debug.colliders` toggles the full Rapier debug overlay. We
    // build it lazily at attach time only — flipping it on later would
    // require allocating the overlay mesh mid-flight, which we don't
    // currently support. Document it as attach-time only.
  }

  private applySealDebugVisibility(): void {
    const visible = this.config.debug.sealColliders;
    for (const [, ref] of this.sealColliders) {
      ref.wireframe.visible = visible;
    }
  }

  /** Apply broken-seal updates by toggling seal collider enablement. */
  private applyBrokenSeals(broken: SealIdentifier[]): void {
    if (!this.world) return;
    const newBroken = new Set<string>(broken.map(b => sealKey(b.level, b.side)));

    for (const [key, ref] of this.sealColliders) {
      const isBroken = newBroken.has(key);
      const wasBroken = this.brokenSet.has(key);
      if (isBroken !== wasBroken) {
        ref.collider.setEnabled(!isBroken);
        ref.wireMat.color.setHex(isBroken ? SEAL_WIRE_COLOR_BROKEN : SEAL_WIRE_COLOR_INTACT);
      }
    }
    this.brokenSet = newBroken;
  }

  private despawnSkull(): void {
    if (!this.skull || !this.world) return;
    this.world.removeRigidBody(this.skull.body);
    this.skull.mesh.removeFromParent();
    this.skull.mesh.geometry.dispose();
    const mat = this.skull.mesh.material;
    if (Array.isArray(mat)) {
      for (const m of mat) m.dispose();
    } else {
      (mat as THREE.Material).dispose();
    }
    this.skull = null;
  }
}

const DRUM_NAME_PREFIX = 'drum_';

function parseDrumLevel(name: string): 'top' | 'middle' | 'bottom' | null {
  if (!name.startsWith(DRUM_NAME_PREFIX)) return null;
  const rest = name.slice(DRUM_NAME_PREFIX.length);
  if (rest === 'top' || rest === 'middle' || rest === 'bottom') return rest;
  return null;
}

function extractIndices(geom: THREE.BufferGeometry, vertexCount: number): Uint32Array {
  const idx = geom.getIndex();
  if (idx) {
    const out = new Uint32Array(idx.count);
    for (let i = 0; i < idx.count; i++) out[i] = idx.getX(i);
    return out;
  }
  // Non-indexed: vertices are already laid out as sequential triangles.
  const out = new Uint32Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) out[i] = i;
  return out;
}
