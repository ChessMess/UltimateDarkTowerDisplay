import type { TowerSide } from '../types';

// --- Tower Sides ---

export const SIDES: TowerSide[] = ['north', 'east', 'south', 'west'];

export const SIDE_LABELS: Record<TowerSide, string> = {
  north: 'N',
  east: 'E',
  south: 'S',
  west: 'W',
};

export const SIDE_AZIMUTH: Record<TowerSide, number> = {
  north: 0,
  east: Math.PI / 2,
  south: Math.PI,
  west: -Math.PI / 2,
};

// --- LED Layer Layout ---

/** Number of LED layers on the tower (TOP/MIDDLE/BOTTOM_RING, LEDGE, BASE1, BASE2). */
export const TOWER_LAYER_COUNT = 6;
/** Lights per layer — cardinal for rings, corners for ledge/base. */
export const LIGHTS_PER_LAYER = 4;

/** Cardinal azimuths (rad) for ring lights. Indexed by RING_LIGHT_POSITIONS (N=0, E=1, S=2, W=3). */
export const RING_AZIMUTH: readonly number[] = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

/** Layer-index (0/1/2) → seal level string. Aligned with LED_LAYOUT.topY/middleY/bottomY. */
export const RING_LEVEL_BY_LAYER_INDEX: readonly ('top' | 'middle' | 'bottom')[] = [
  'top',
  'middle',
  'bottom',
];

/** Corner azimuths (rad) for ledge/base lights. Indexed by LEDGE_BASE_LIGHT_POSITIONS (NE=0, SE=1, SW=2, NW=3). */
export const CORNER_AZIMUTH: readonly number[] = [
  Math.PI / 4,
  (3 * Math.PI) / 4,
  (5 * Math.PI) / 4,
  (7 * Math.PI) / 4,
];

/**
 * LED geometry constants, all expressed as fractions of the model's bounding
 * sphere radius so the layout scales if the GLB is swapped. Initial values are
 * educated guesses — tuning is expected with `debug3D: true`.
 */
export const LED_LAYOUT = {
  topY: 0.83,
  middleY: 0.53,
  bottomY: 0.23,
  ledgeY: -0.36,
  base1Y: -0.26,
  base2Y: 0.02,
} as const;

/**
 * Red light positions are independent from the amber proxy positions.
 * Ring layers (0–2): inset inside the drum so light shines outward through doors/seals.
 * Ledge/base (3–5): at the outer corner surface so light shines onto the face.
 * Values are initial guesses; expected tuning with debug3D: true.
 */
export const RED_LIGHT_LAYOUT = {
  ringInsetRadius: 0.35,
  cornerNearSurfaceRadius: 0.52,
} as const;
