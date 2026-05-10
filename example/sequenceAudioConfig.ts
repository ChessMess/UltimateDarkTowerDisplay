import { TOWER_AUDIO_LIBRARY, TOWER_LIGHT_SEQUENCES } from 'ultimatedarktower';

/**
 * Maps each light sequence name to the audio sample name that should play
 * when that sequence is triggered in the example app.
 *
 * To change which sound plays for a sequence, edit the value on the right.
 * To silence a sequence, remove its entry.
 * To add audio to a new sequence, add an entry here.
 *
 * Both keys and values are enforced by TypeScript — invalid names are
 * caught at compile time.
 *
 * Keys   : keyof typeof TOWER_LIGHT_SEQUENCES  (e.g. 'gloat01', 'defeat')
 * Values : keyof typeof TOWER_AUDIO_LIBRARY     (e.g. 'TowerGloat1', 'MonthEnded')
 */
export const SEQUENCE_AUDIO_CONFIG: Partial<Record<keyof typeof TOWER_LIGHT_SEQUENCES, keyof typeof TOWER_AUDIO_LIBRARY>> = {
  gloat01: 'TowerGloat1',
  gloat02: 'TowerGloat2',
  gloat03: 'TowerGloat3',
  angryStrobe01: 'TowerAngry1',
  angryStrobe02: 'TowerAngry2',
  angryStrobe03: 'TowerAngry3',
  victory: 'BattleVictory',
  defeat: 'MonthEnded',
  dungeonIdle: 'DungeonCaves',
  sealReveal: 'TowerSeal',
  monthStarted: 'MonthStarted',
  flareThenFlicker: 'FoeEvent',
  flareThenFade: 'FoeSpawn',
  flareThenFadeBase: 'FoeSpawn',
  slowFlareThenFade: 'FoeSpawn',
};

/**
 * Resolves SEQUENCE_AUDIO_CONFIG into the numeric map shape consumed by the
 * example app at runtime: sequence-id → sample-id.
 */
export function buildSequenceAudioMap(): Partial<Record<number, number>> {
  const result: Partial<Record<number, number>> = {};
  for (const [seqName, audioName] of Object.entries(SEQUENCE_AUDIO_CONFIG) as [keyof typeof TOWER_LIGHT_SEQUENCES, keyof typeof TOWER_AUDIO_LIBRARY][]) {
    const seqId = TOWER_LIGHT_SEQUENCES[seqName];
    const sampleId = TOWER_AUDIO_LIBRARY[audioName]?.value;
    if (seqId !== undefined && sampleId !== undefined) {
      result[seqId] = sampleId;
    }
  }
  return result;
}
