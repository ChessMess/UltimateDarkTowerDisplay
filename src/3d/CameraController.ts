import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import gsap from 'gsap';
import type { TowerSide } from '../types';
import { SIDE_AZIMUTH } from './constants';
import { polarToXZ } from './utils';
import { SideButtons } from '../shared/SideButtons';

interface CameraState {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

export class CameraController {
  private defaultCamera: CameraState | null = null;
  private currentSide: TowerSide | null = null;
  private activeTween: gsap.core.Timeline | null = null;
  private modelRadius = 1;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly controls: OrbitControls,
    private readonly sideButtons: SideButtons,
  ) { }

  fitToModel(modelRadius: number, debugLog?: (label: string, data: Record<string, unknown>) => void): void {
    this.modelRadius = modelRadius;
    const fovRad = (this.camera.fov * Math.PI) / 180;
    const distance = (modelRadius / Math.sin(fovRad / 2)) * 1.15;

    const minFar = 1000;
    const maxFar = 50000;
    const recommendedFar = Math.max(minFar, distance + modelRadius * 3);
    this.camera.far = Math.min(maxFar, recommendedFar);
    this.camera.updateProjectionMatrix();

    this.camera.position.set(0, modelRadius * 0.15, distance);
    this.controls.target.set(0, 0, 0);
    this.camera.lookAt(0, 0, 0);
    this.controls.update();

    debugLog?.('fitToView', {
      radius: modelRadius,
      distance,
      cameraPosition: this.camera.position.toArray(),
      target: this.controls.target.toArray(),
      near: this.camera.near,
      far: this.camera.far,
    });

    this.defaultCamera = {
      position: this.camera.position.clone(),
      target: this.controls.target.clone(),
    };

    this.currentSide = 'north';
    this.updateSideButtons();
  }

  getCurrentSide(): TowerSide | null {
    return this.currentSide;
  }

  snapToSide(side: TowerSide): void {
    this.currentSide = side;
    this.updateSideButtons();
    if (!this.defaultCamera) return; // tween deferred; currentSide updated for re-entry guard

    const elevation = this.modelRadius * 0.15;
    const distance = this.defaultCamera.position.length();
    const azimuth = SIDE_AZIMUTH[side];
    const horiz = Math.sqrt(Math.max(0, distance * distance - elevation * elevation));

    this.tweenCameraTo(
      { ...polarToXZ(azimuth, horiz), y: elevation },
      { x: 0, y: 0, z: 0 },
    );
  }

  resetView(): void {
    if (!this.defaultCamera) return;

    this.currentSide = 'north';
    this.updateSideButtons();

    const p = this.defaultCamera.position;
    const t = this.defaultCamera.target;
    this.tweenCameraTo({ x: p.x, y: p.y, z: p.z }, { x: t.x, y: t.y, z: t.z });
  }

  dispose(): void {
    if (this.activeTween) {
      this.activeTween.kill();
      this.activeTween = null;
    }
  }

  private tweenCameraTo(
    position: { x: number; y: number; z: number },
    target: { x: number; y: number; z: number },
  ): void {
    if (this.activeTween) this.activeTween.kill();
    const tl = gsap.timeline();
    tl.to(this.camera.position, { ...position, duration: 0.4, ease: 'power2.inOut' }, 0);
    tl.to(this.controls.target, { ...target, duration: 0.4, ease: 'power2.inOut' }, 0);
    this.activeTween = tl;
  }

  private updateSideButtons(): void {
    this.sideButtons.setActive(this.currentSide);
  }
}
