import * as THREE from 'three';
import {
  LED_LAYOUT,
  RED_LIGHT_LAYOUT,
  RING_AZIMUTH,
  CORNER_AZIMUTH,
} from './constants';

const LED_Y_FRACTIONS = [
  LED_LAYOUT.topY,
  LED_LAYOUT.middleY,
  LED_LAYOUT.bottomY,
  LED_LAYOUT.ledgeY,
  LED_LAYOUT.base1Y,
  LED_LAYOUT.base2Y,
] as const;

export function polarToXZ(azimuth: number, r: number): { x: number; z: number } {
  return {
    x: Math.sin(azimuth) * r,
    z: Math.cos(azimuth) * r,
  };
}

export function computeLedPosition(
  layer: number,
  light: number,
  radius: number
): { x: number; y: number; z: number } {
  const isRing = layer < 3;
  const r = radius * (isRing ? LED_LAYOUT.drumRadius : LED_LAYOUT.cornerRadius);
  const azimuth = isRing ? RING_AZIMUTH[light] : CORNER_AZIMUTH[light];
  return {
    ...polarToXZ(azimuth, r),
    y: radius * LED_Y_FRACTIONS[layer],
  };
}

export function computeRedLightPosition(
  layer: number,
  light: number,
  radius: number
): { x: number; y: number; z: number } {
  const isRing = layer < 3;
  const r = radius * (isRing
    ? RED_LIGHT_LAYOUT.ringInsetRadius
    : RED_LIGHT_LAYOUT.cornerNearSurfaceRadius);
  const azimuth = isRing ? RING_AZIMUTH[light] : CORNER_AZIMUTH[light];
  return {
    ...polarToXZ(azimuth, r),
    y: radius * LED_Y_FRACTIONS[layer],
  };
}

export function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry?.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) {
        for (const m of mat) m.dispose();
      } else if (mat) {
        mat.dispose();
      }
    }
  });
  obj.removeFromParent();
}