/// <reference types="vite/client" />
import { TOWER_AUDIO_LIBRARY } from 'ultimatedarktower';

const A = TOWER_AUDIO_LIBRARY;

function resolveAudioBase(): string {
  // `npm run dev:example` serves `/example/index.html` from the project root,
  // while sample assets are emitted under `/dist-example/audio/`.
  if (import.meta.env.DEV && typeof window !== 'undefined' && window.location.pathname.startsWith('/example/')) {
    return '/dist-example/audio/';
  }
  return `${import.meta.env.BASE_URL}audio/`;
}

function buildFileAudioLibrary(base: string): Record<number, string> {
  // === BEGIN AUTOGEN (scripts/extract-audio.mjs) ===
  return {
    [A.Ashstrider.value]: base + 'Adversary_Ashstrider_01.ogg',
    [A.BaneofOmens.value]: base + 'Adversary_Bane_01.ogg',
    [A.EmpressofShades.value]: base + 'Adversary_Empress_01.ogg',
    [A.GazeEternal.value]: base + 'Adversary_Gaze_01.ogg',
    [A.Gravemaw.value]: base + 'Adversary_Gravemaw_01.ogg',
    [A.IsatheHollow.value]: base + 'Adversary_Isa_01.ogg',
    [A.LingeringRot.value]: base + 'Adversary_Rot_03.ogg',
    [A.UtukKu.value]: base + 'Adversary_Utuk_03.ogg',
    [A.Gleb.value]: base + 'Ally_Gleb_05.ogg',
    [A.Grigor.value]: base + 'Ally_Grigor_01.ogg',
    [A.Hakan.value]: base + 'Ally_Hakan_02.ogg',
    [A.Letha.value]: base + 'Ally_Letha_02.ogg',
    [A.Miras.value]: base + 'Ally_Miras_01.ogg',
    [A.Nimet.value]: base + 'Ally_Nimet_01.ogg',
    [A.Tomas.value]: base + 'Ally_Tomas_03.ogg',
    [A.Vasa.value]: base + 'Ally_Vasa_03.ogg',
    [A.Yana.value]: base + 'Ally_Yana_01.ogg',
    [A.Zaida.value]: base + 'Ally_Zaida_01.ogg',
    [A.ApplyAdvantage01.value]: base + 'Battle_Advantage_Applied_01F.ogg',
    [A.ApplyAdvantage02.value]: base + 'Battle_Advantage_Applied_02.ogg',
    [A.ApplyAdvantage03.value]: base + 'Battle_Advantage_Applied_03.ogg',
    [A.ApplyAdvantage04.value]: base + 'Battle_Advantage_Applied_04.ogg',
    [A.ApplyAdvantage05.value]: base + 'Battle_Advantage_Applied_05.ogg',
    [A.MaxAdvantages.value]: base + 'Battle_Advantages_Maxed_01.ogg',
    [A.NoAdvantages.value]: base + 'Battle_Advantages_None_01.ogg',
    [A.AdversaryEscaped.value]: base + 'Battle_Adversary_Escape_01.ogg',
    [A.BattleButton.value]: base + 'Battle_Button_01.ogg',
    [A.CardFlip01.value]: base + 'Battle_Card_Flip_01.ogg',
    [A.CardFlip02.value]: base + 'Battle_Card_Flip_02.ogg',
    [A.CardFlip03.value]: base + 'Battle_Card_Flip_03.ogg',
    [A.CardFlipPaper01.value]: base + 'Battle_Card_Flip_Paper_01.ogg',
    [A.CardFlipPaper02.value]: base + 'Battle_Card_Flip_Paper_02.ogg',
    [A.CardFlipPaper03.value]: base + 'Battle_Card_Flip_Paper_03.ogg',
    [A.CardSelect01.value]: base + 'Battle_Card_Select_01.ogg',
    [A.CardSelect02.value]: base + 'Battle_Card_Select_02.ogg',
    [A.CardSelect03.value]: base + 'Battle_Card_Select_03.ogg',
    [A.BattleStart.value]: base + 'Battle_start_01.ogg',
    [A.BattleVictory.value]: base + 'Battle_Victory_01.ogg',
    [A.ButtonHoldPressCombo.value]: base + 'Button_HoldandPressComboDemo.ogg',
    [A.ButtonHold.value]: base + 'Button_Hold_01.ogg',
    [A.ButtonPress.value]: base + 'Button_Press_01.ogg',
    [A.ClassicAdvantageApplied.value]: base + 'Classic_AdvantageApplied.ogg',
    [A.ClassicAttackTower.value]: base + 'Classic_Attack_Tower.ogg',
    [A.ClassicBazaar.value]: base + 'Classic_Bazaar.ogg',
    [A.ClassicConfirmation.value]: base + 'Classic_Confirmation_Beep.ogg',
    [A.ClassicDragons.value]: base + 'Classic_DragonStrike.ogg',
    [A.ClassicQuestFailed.value]: base + 'Classic_Quest_Failure.ogg',
    [A.ClassicRetreat.value]: base + 'Classic_Retreat.ogg',
    [A.ClassicStartMonth.value]: base + 'Classic_StartOfMonth.ogg',
    [A.ClassicStartDungeon.value]: base + 'Classic_StartingDungeon.ogg',
    [A.ClassicTowerLost.value]: base + 'Classic_TowerLost.ogg',
    [A.ClassicUnsure.value]: base + 'Classic_Unsure_5.ogg',
    [A.DungeonAdvantage01.value]: base + 'Dungeon_Advantage_01.ogg',
    [A.DungeonAdvantage02.value]: base + 'Dungeon_Advantage_02.ogg',
    [A.DungeonButton.value]: base + 'Dungeon_Button_01.ogg',
    [A.DungeonFootsteps.value]: base + 'Dungeon_Button_Footsteps_01.ogg',
    [A.DungeonCaves.value]: base + 'Dungeon_Caves_01.ogg',
    [A.DungeonComplete.value]: base + 'Dungeon_Complete_01.ogg',
    [A.DungeonEncampment.value]: base + 'Dungeon_Encampment_01.ogg',
    [A.DungeonEscape.value]: base + 'Dungeon_Escape_01.ogg',
    [A.DungeonFortress.value]: base + 'Dungeon_Fortress_01.ogg',
    [A.DungeonRuins.value]: base + 'Dungeon_Ruins_01.ogg',
    [A.DungeonShrine.value]: base + 'Dungeon_Shrine_01.ogg',
    [A.DungeonTomb.value]: base + 'Dungeon_Tomb_01.ogg',
    [A.FoeEvent.value]: base + 'Event_Foe.ogg',
    [A.FoeSpawn.value]: base + 'Event_Spawn.ogg',
    [A.Brigands.value]: base + 'Foe_Brigands_03.ogg',
    [A.ClanofNeuri.value]: base + 'Foe_Clan_01.ogg',
    [A.Dragons.value]: base + 'Foe_Dragon_01.ogg',
    [A.Lemures.value]: base + 'Foe_Lemure_01.ogg',
    [A.LeveledUp.value]: base + 'Foe_Level_Up_01.ogg',
    [A.Mormos.value]: base + 'Foe_Mormo_01.ogg',
    [A.Oreks.value]: base + 'Foe_Oreks_01.ogg',
    [A.ShadowWolves.value]: base + 'Foe_Shadow_01.ogg',
    [A.SpineFiends.value]: base + 'Foe_Spine_01.ogg',
    [A.Strigas.value]: base + 'Foe_Striga_01.ogg',
    [A.Titans.value]: base + 'Foe_Titan_01.ogg',
    [A.FrostTrolls.value]: base + 'Foe_Troll_01.ogg',
    [A.WidowmadeSpiders.value]: base + 'Foe_Widowmade_01.ogg',
    [A.AshstriderSpawn.value]: base + 'MainObjectiveVictory_BossSpawn_Ashstrider.ogg',
    [A.BaneofOmensSpawn.value]: base + 'MainObjectiveVictory_BossSpawn_Bane.ogg',
    [A.EmpressofShadesSpawn.value]: base + 'MainObjectiveVictory_BossSpawn_Empress.ogg',
    [A.GazeEternalSpawn.value]: base + 'MainObjectiveVictory_BossSpawn_Gaze.ogg',
    [A.GravemawSpawn.value]: base + 'MainObjectiveVictory_BossSpawn_Gravemaw.ogg',
    [A.IsatheHollowSpawn.value]: base + 'MainObjectiveVictory_BossSpawn_Isa.ogg',
    [A.LingeringRotSpawn.value]: base + 'MainObjectiveVictory_BossSpawn_Rot.ogg',
    [A.UtukKuSpawn.value]: base + 'MainObjectiveVictory_BossSpawn_Utuk.ogg',
    [A.QuestComplete.value]: base + 'Quest_Complete_01.ogg',
    [A.TowerAllGlyphs.value]: base + 'Tower_All_Glyphs_01.ogg',
    [A.TowerAngry1.value]: base + 'Tower_Angry_01.ogg',
    [A.TowerAngry2.value]: base + 'Tower_Angry_02.ogg',
    [A.TowerAngry3.value]: base + 'Tower_Angry_03.ogg',
    [A.TowerAngry4.value]: base + 'Tower_Angry_04.ogg',
    [A.TowerConnected.value]: base + 'Tower_Connected_04.ogg',
    [A.GameStart.value]: base + 'Tower_Game_Start.ogg',
    [A.TowerGloat1.value]: base + 'Tower_Gloat_01.ogg',
    [A.TowerGloat2.value]: base + 'Tower_Gloat_02.ogg',
    [A.TowerGloat3.value]: base + 'Tower_Gloat_03.ogg',
    [A.TowerGlyph.value]: base + 'Tower_Glyph_01.ogg',
    [A.TowerIdle1.value]: base + 'Tower_Idle_01.ogg',
    [A.TowerIdle2.value]: base + 'Tower_Idle_02.ogg',
    [A.TowerIdle3.value]: base + 'Tower_Idle_03.ogg',
    [A.TowerIdle4.value]: base + 'Tower_Idle_04.ogg',
    [A.TowerIdle5.value]: base + 'Tower_Idle_05.ogg',
    [A.TowerDisconnected.value]: base + 'Tower_Lost_Connection_04.ogg',
    [A.MonthEnded.value]: base + 'Tower_Month_End_06.ogg',
    [A.MonthStarted.value]: base + 'Tower_Month_Start_01.ogg',
    [A.QuestFailed.value]: base + 'Tower_Quest_Failure.ogg',
    [A.RotateExit.value]: base + 'Tower_Rotate_Exit.ogg',
    [A.RotateLoop.value]: base + 'Tower_Rotate_Loop.ogg',
    [A.RotateStart.value]: base + 'Tower_Rotate_Start.ogg',
    [A.TowerSeal.value]: base + 'Tower_Seal_01.ogg',
    [A.TowerSkullDropped.value]: base + 'Tower_Skull_Drop_01.ogg',
  };
  // === END AUTOGEN ===
}

/**
 * Sample-id → URL map for the example app.
 *
 * Generated from the firmware flash image (.local/out.bin) via
 * scripts/extract-audio.mjs. Every UDT sample id (0x01–0x71) is covered.
 *
 * Re-run `node scripts/extract-audio.mjs` after updating the firmware blob
 * or audio_metadata.{c,h}.
 */
export function buildTowerAudioLibrary(): Record<number, string> {
  return buildFileAudioLibrary(resolveAudioBase());
}

export function hasTowerAudioAsset(sample: number): boolean {
  if (sample === 0) return true;
  const library = buildTowerAudioLibrary();
  return typeof library[sample] === 'string';
}
