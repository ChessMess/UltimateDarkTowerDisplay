/** Recursively make every property of `T` required. */
export type DeepRequired<T> = T extends object
  ? { [K in keyof T]-?: DeepRequired<T[K]> }
  : T;

/** RGB hex as a single number (e.g. `0xff2020`). */
export type HexColor = number;
/** XYZ position tuple in three.js world units. */
export type Vec3 = [number, number, number];

/**
 * Core (nested-only) lighting shape. Every value consumed by {@link Tower3DView}
 * lives here: scene-rig intensities/colors/geometry, LED emissive + halo
 * parameters, animation timings, entrance cinematic beats, and the
 * shadow-catching ground disc. All fields optional — unset fields fall back
 * to `DEFAULT_LIGHTING` exported from `Tower3DView`.
 */
export interface LightingConfigCore {
  /** Three-point scene rig + tone mapping + scene background. */
  scene?: {
    /** Scene clear color behind the model. */
    background?: HexColor;
    /** Equirectangular image or .hdr URL to use as a skybox. Clears when set to undefined. */
    skyboxUrl?: string;
    hemisphere?: { color?: HexColor; ground?: HexColor; intensity?: number };
    key?: {
      color?: HexColor;
      intensity?: number;
      /** Camera-local position — the key is parented to the camera so it orbits with the viewer. */
      position?: Vec3;
      shadow?: {
        mapSize?: number;
        bias?: number;
        normalBias?: number;
        /** Shadow camera orthographic half-size, as a factor of modelRadius. */
        frustumRadiusFactor?: number;
        /** Shadow camera far plane, as a factor of modelRadius. */
        farFactor?: number;
      };
    };
    fill?: {
      color?: HexColor;
      intensity?: number;
      width?: number;
      height?: number;
      /** Camera-local position. */
      position?: Vec3;
    };
    /** Renderer tone-mapping exposure. */
    exposure?: number;
  };

  /** Per-LED emissive + halo parameters (amber proxy + red game-accurate light). */
  leds?: {
    amber?: {
      color?: HexColor;
      maxEmissive?: number;
      maxHalo?: number;
      /** Halo PointLight distance as a factor of modelRadius. */
      haloDistanceFraction?: number;
    };
    red?: {
      color?: HexColor;
      maxHalo?: number;
      /** Halo PointLight distance as a factor of modelRadius. */
      haloDistanceFraction?: number;
    };
  };

  /** Per-LED effect tween durations + idle breathing pulse on the key light. */
  animation?: {
    fadeS?: number;
    breatheS?: number;
    breatheFastS?: number;
    flickerS?: number;
    idleBreathe?: { peakFactor?: number; durationS?: number };
  };

  /** Cinematic entrance tween (see `Tower3DView.playEntrance`). */
  entrance?: {
    /** How far the key intensity overshoots its target during the flash beat. */
    peakKeyFactor?: number;
    beats?: {
      silhouetteHemiFactor?: number;
      silhouetteExposureFactor?: number;
      silhouetteDurationS?: number;
      keyArc1DurationS?: number;
      keyArc1DelayS?: number;
      keyPunchDurationS?: number;
      keyPunchDelayS?: number;
      exposureInDurationS?: number;
      keyArc2DurationS?: number;
      keyArc2DelayS?: number;
      keySettleDurationS?: number;
      keySettleDelayS?: number;
      fillInDurationS?: number;
      fillInDelayS?: number;
      hemiInDurationS?: number;
      hemiInDelayS?: number;
    };
  };

  /** Noir ground disc that catches the key-light shadow. */
  groundDisc?: {
    color?: HexColor;
    roughness?: number;
    metalness?: number;
    /** Disc radius as a factor of modelRadius. */
    radiusFactor?: number;
  };

  /** Canvas-generated game board texture overlaid on the ground disc. */
  boardDisc?: {
    /** Show the board texture on the ground disc. Defaults to false. */
    enabled?: boolean;
    /** Material opacity when board texture is active (0–1). Defaults to 0.9. */
    opacity?: number;
  };
}

/**
 * Public lighting config. Extends {@link LightingConfigCore} with four
 * deprecated flat aliases for pre-0.3 callers. When both the flat field and
 * its nested equivalent are supplied, the nested value wins.
 */
export interface LightingConfig extends LightingConfigCore {
  /** @deprecated Use `scene.hemisphere.intensity`. Kept for backward compat. */
  hemisphere?: number;
  /** @deprecated Use `scene.key.intensity`. Kept for backward compat. */
  key?: number;
  /** @deprecated Use `scene.fill.intensity`. Kept for backward compat. */
  fill?: number;
  /** @deprecated Use `scene.exposure`. Kept for backward compat. */
  exposure?: number;
}

/** Fully-resolved lighting config (all nested fields required) used internally by Tower3DView. */
export type ResolvedLightingConfig = DeepRequired<LightingConfigCore>;
