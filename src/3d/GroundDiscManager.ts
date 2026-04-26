import * as THREE from 'three';
import type { ResolvedLightingConfig } from './types';
import { buildBoardTexture } from './GameBoardTexture';

/**
 * Manages the noir shadow-catching ground disc and the optional canvas-drawn
 * game board texture that sits on top of it. Owns the Three.js Mesh and
 * CanvasTexture so their lifecycle is isolated from Tower3DView.
 */
export class GroundDiscManager {
  private disc: THREE.Mesh | null = null;
  private boardTexture: THREE.CanvasTexture | null = null;

  constructor(private readonly scene: THREE.Scene) { }

  /**
   * Create the disc and add it to the scene. Idempotent — subsequent calls
   * are ignored if the disc already exists. Must be called after the model
   * is loaded so that modelRadius and modelBottomY are accurate.
   */
  build(
    modelRadius: number,
    modelBottomY: number,
    lighting: ResolvedLightingConfig,
  ): void {
    if (this.disc) return;

    const { roughness, metalness, radiusFactor } = lighting.groundDisc;
    const geom = new THREE.CircleGeometry(modelRadius * radiusFactor, 64);

    if (lighting.boardDisc.enabled && !this.boardTexture) {
      this.boardTexture = buildBoardTexture();
    }
    const useBoardTex = lighting.boardDisc.enabled && this.boardTexture;
    const mat = useBoardTex
      ? new THREE.MeshStandardMaterial({
        map: this.boardTexture!,
        roughness: 0.95,
        metalness: 0,
        opacity: lighting.boardDisc.opacity,
        transparent: lighting.boardDisc.opacity < 1,
      })
      : new THREE.MeshStandardMaterial({
        color: lighting.groundDisc.color,
        roughness,
        metalness,
      });

    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = modelBottomY - modelRadius * 0.002;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.disc = mesh;
  }

  /** Toggle disc visibility, building it lazily if it does not yet exist. */
  setVisible(
    visible: boolean,
    modelRadius: number,
    modelBottomY: number,
    lighting: ResolvedLightingConfig,
  ): void {
    if (visible && !this.disc) {
      this.build(modelRadius, modelBottomY, lighting);
    }
    if (this.disc) this.disc.visible = visible;
  }

  /** Toggle the canvas-generated game board texture on the disc. */
  setBoardDiscEnabled(
    enabled: boolean,
    lighting: ResolvedLightingConfig,
  ): void {
    if (!this.disc) return;
    const mat = this.disc.material;
    if (!(mat instanceof THREE.MeshStandardMaterial)) return;

    if (enabled) {
      if (!this.boardTexture) this.boardTexture = buildBoardTexture();
      mat.map = this.boardTexture;
      mat.color.set(0xffffff);
      mat.roughness = 0.95;
      mat.metalness = 0;
      mat.opacity = lighting.boardDisc.opacity;
      mat.transparent = lighting.boardDisc.opacity < 1;
    } else {
      mat.map = null;
      mat.color.setHex(lighting.groundDisc.color);
      mat.roughness = lighting.groundDisc.roughness;
      mat.metalness = lighting.groundDisc.metalness;
      mat.opacity = 1;
      mat.transparent = false;
      this.boardTexture?.dispose();
      this.boardTexture = null;
    }
    mat.needsUpdate = true;
  }

  /** Reapply the full lighting config to the disc material and geometry. */
  updateLighting(
    lighting: ResolvedLightingConfig,
    modelRadius: number,
    modelBottomY: number,
  ): void {
    if (!this.disc) return;
    const mat = this.disc.material;

    if (mat instanceof THREE.MeshStandardMaterial) {
      if (lighting.boardDisc.enabled) {
        if (!this.boardTexture) this.boardTexture = buildBoardTexture();
        mat.map = this.boardTexture;
        mat.color.set(0xffffff);
        mat.roughness = 0.95;
        mat.metalness = 0;
        mat.opacity = lighting.boardDisc.opacity;
        mat.transparent = lighting.boardDisc.opacity < 1;
      } else {
        if (this.boardTexture) {
          this.boardTexture.dispose();
          this.boardTexture = null;
        }
        mat.map = null;
        mat.color.setHex(lighting.groundDisc.color);
        mat.roughness = lighting.groundDisc.roughness;
        mat.metalness = lighting.groundDisc.metalness;
        mat.opacity = 1;
        mat.transparent = false;
      }
      mat.needsUpdate = true;
    }

    this.disc.geometry.dispose();
    this.disc.geometry = new THREE.CircleGeometry(
      modelRadius * lighting.groundDisc.radiusFactor,
      64,
    );
    this.disc.position.y = modelBottomY - modelRadius * 0.002;
  }

  dispose(): void {
    if (this.disc) {
      this.disc.geometry?.dispose();
      const mat = this.disc.material;
      if (Array.isArray(mat)) {
        for (const m of mat) m.dispose();
      } else {
        mat?.dispose();
      }
      this.disc.removeFromParent();
      this.disc = null;
    }
    if (this.boardTexture) {
      this.boardTexture.dispose();
      this.boardTexture = null;
    }
  }
}
