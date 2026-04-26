import type { LightingConfig, ResolvedLightingConfig } from './types';

export const DEFAULT_LIGHTING: ResolvedLightingConfig = {
  scene: {
    background: 0x000000,
    skyboxUrl: '',
    hemisphere: { color: 0xffffff, ground: 0x000000, intensity: 0.04 },
    key: {
      color: 0xffffff,
      intensity: 1.6,
      position: [3, 4.5, -1],
      shadow: {
        mapSize: 2048,
        bias: -0.0003,
        normalBias: 0.02,
        frustumRadiusFactor: 1.3,
        farFactor: 10,
      },
    },
    fill: {
      color: 0xffffff,
      intensity: 5.0,
      width: 1.5,
      height: 2.5,
      position: [-4, 1.5, -8],
    },
    exposure: 0.7,
  },
  leds: {
    red: {
      color: 0xff2020,
      maxHalo: 1.0,
      haloDistanceFraction: 0.20,
    },
    sealBacklights: {
      enabled: true,
      color: 0xff2020,
      intensity: 8,
      radiusFactor: 0.88,
      distanceFactor: 0.4,
      decay: 2.0,
      backlightWhenBroken: true,
    },
  },
  animation: {
    fadeS: 0.15,
    breatheS: 2.0,
    breatheFastS: 0.8,
    flickerS: 0.3,
    idleBreathe: { peakFactor: 1.08, durationS: 4 },
  },
  entrance: {
    peakKeyFactor: 2.5,
    beats: {
      silhouetteHemiFactor: 0.25,
      silhouetteExposureFactor: 0.15,
      silhouetteDurationS: 1.4,
      keyArc1DurationS: 0.9,
      keyArc1DelayS: 1.2,
      keyPunchDurationS: 0.6,
      keyPunchDelayS: 1.5,
      exposureInDurationS: 1.2,
      keyArc2DurationS: 1.0,
      keyArc2DelayS: 2.1,
      keySettleDurationS: 1.2,
      keySettleDelayS: 2.3,
      fillInDurationS: 1.1,
      fillInDelayS: 2.6,
      hemiInDurationS: 1.1,
      hemiInDelayS: 2.8,
    },
  },
  groundDisc: {
    color: 0x050505,
    roughness: 0.92,
    metalness: 0,
    radiusFactor: 3,
  },
  boardDisc: {
    enabled: true,
    opacity: 0.9,
  },
};

export function resolveLighting(user?: LightingConfig): ResolvedLightingConfig {
  const out: ResolvedLightingConfig = {
    scene: {
      background: user?.scene?.background ?? DEFAULT_LIGHTING.scene.background,
      skyboxUrl: user?.scene?.skyboxUrl ?? DEFAULT_LIGHTING.scene.skyboxUrl,
      hemisphere: {
        color: user?.scene?.hemisphere?.color ?? DEFAULT_LIGHTING.scene.hemisphere.color,
        ground: user?.scene?.hemisphere?.ground ?? DEFAULT_LIGHTING.scene.hemisphere.ground,
        intensity: user?.scene?.hemisphere?.intensity ?? DEFAULT_LIGHTING.scene.hemisphere.intensity,
      },
      key: {
        color: user?.scene?.key?.color ?? DEFAULT_LIGHTING.scene.key.color,
        intensity: user?.scene?.key?.intensity ?? DEFAULT_LIGHTING.scene.key.intensity,
        position: user?.scene?.key?.position ?? DEFAULT_LIGHTING.scene.key.position,
        shadow: {
          mapSize: user?.scene?.key?.shadow?.mapSize ?? DEFAULT_LIGHTING.scene.key.shadow.mapSize,
          bias: user?.scene?.key?.shadow?.bias ?? DEFAULT_LIGHTING.scene.key.shadow.bias,
          normalBias: user?.scene?.key?.shadow?.normalBias ?? DEFAULT_LIGHTING.scene.key.shadow.normalBias,
          frustumRadiusFactor:
            user?.scene?.key?.shadow?.frustumRadiusFactor ??
            DEFAULT_LIGHTING.scene.key.shadow.frustumRadiusFactor,
          farFactor: user?.scene?.key?.shadow?.farFactor ?? DEFAULT_LIGHTING.scene.key.shadow.farFactor,
        },
      },
      fill: {
        color: user?.scene?.fill?.color ?? DEFAULT_LIGHTING.scene.fill.color,
        intensity: user?.scene?.fill?.intensity ?? DEFAULT_LIGHTING.scene.fill.intensity,
        width: user?.scene?.fill?.width ?? DEFAULT_LIGHTING.scene.fill.width,
        height: user?.scene?.fill?.height ?? DEFAULT_LIGHTING.scene.fill.height,
        position: user?.scene?.fill?.position ?? DEFAULT_LIGHTING.scene.fill.position,
      },
      exposure: user?.scene?.exposure ?? DEFAULT_LIGHTING.scene.exposure,
    },
    leds: {
      red: {
        color: user?.leds?.red?.color ?? DEFAULT_LIGHTING.leds.red.color,
        maxHalo: user?.leds?.red?.maxHalo ?? DEFAULT_LIGHTING.leds.red.maxHalo,
        haloDistanceFraction:
          user?.leds?.red?.haloDistanceFraction ?? DEFAULT_LIGHTING.leds.red.haloDistanceFraction,
      },
      sealBacklights: {
        enabled:
          user?.leds?.sealBacklights?.enabled ?? DEFAULT_LIGHTING.leds.sealBacklights.enabled,
        color:
          user?.leds?.sealBacklights?.color ?? DEFAULT_LIGHTING.leds.sealBacklights.color,
        intensity:
          user?.leds?.sealBacklights?.intensity ?? DEFAULT_LIGHTING.leds.sealBacklights.intensity,
        radiusFactor:
          user?.leds?.sealBacklights?.radiusFactor ??
          DEFAULT_LIGHTING.leds.sealBacklights.radiusFactor,
        distanceFactor:
          user?.leds?.sealBacklights?.distanceFactor ??
          DEFAULT_LIGHTING.leds.sealBacklights.distanceFactor,
        decay:
          user?.leds?.sealBacklights?.decay ?? DEFAULT_LIGHTING.leds.sealBacklights.decay,
        backlightWhenBroken:
          user?.leds?.sealBacklights?.backlightWhenBroken ??
          DEFAULT_LIGHTING.leds.sealBacklights.backlightWhenBroken,
      },
    },
    animation: {
      fadeS: user?.animation?.fadeS ?? DEFAULT_LIGHTING.animation.fadeS,
      breatheS: user?.animation?.breatheS ?? DEFAULT_LIGHTING.animation.breatheS,
      breatheFastS: user?.animation?.breatheFastS ?? DEFAULT_LIGHTING.animation.breatheFastS,
      flickerS: user?.animation?.flickerS ?? DEFAULT_LIGHTING.animation.flickerS,
      idleBreathe: {
        peakFactor:
          user?.animation?.idleBreathe?.peakFactor ?? DEFAULT_LIGHTING.animation.idleBreathe.peakFactor,
        durationS:
          user?.animation?.idleBreathe?.durationS ?? DEFAULT_LIGHTING.animation.idleBreathe.durationS,
      },
    },
    entrance: {
      peakKeyFactor: user?.entrance?.peakKeyFactor ?? DEFAULT_LIGHTING.entrance.peakKeyFactor,
      beats: { ...DEFAULT_LIGHTING.entrance.beats, ...user?.entrance?.beats },
    },
    groundDisc: {
      color: user?.groundDisc?.color ?? DEFAULT_LIGHTING.groundDisc.color,
      roughness: user?.groundDisc?.roughness ?? DEFAULT_LIGHTING.groundDisc.roughness,
      metalness: user?.groundDisc?.metalness ?? DEFAULT_LIGHTING.groundDisc.metalness,
      radiusFactor: user?.groundDisc?.radiusFactor ?? DEFAULT_LIGHTING.groundDisc.radiusFactor,
    },
    boardDisc: {
      enabled: user?.boardDisc?.enabled ?? DEFAULT_LIGHTING.boardDisc.enabled,
      opacity: user?.boardDisc?.opacity ?? DEFAULT_LIGHTING.boardDisc.opacity,
    },
  };

  return out;
}
