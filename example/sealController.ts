// Example pattern: persistent seal state backed by a software-only
// UltimateDarkTower instance. The display is recreated on view switches,
// but this module is not — so the broken-seal set survives.
//
// Copy this pattern into your own app if you need seal state to persist
// across renderer changes or view toggles.

import { UltimateDarkTower } from 'ultimatedarktower';
import type { SealIdentifier } from 'ultimatedarktower';
import type { TowerDisplay, TowerStateReadout } from '../src/index';

const tower = new UltimateDarkTower();

export function getTower(): UltimateDarkTower {
  return tower;
}

export function toggleSeal(
  seal: SealIdentifier,
  display: TowerDisplay,
  readout: TowerStateReadout,
): void {
  if (tower.isSealBroken(seal)) tower.markSealRestored(seal);
  else tower.markSealBroken(seal);
  refreshSeals(display, readout);
}

export function refreshSeals(display: TowerDisplay, readout: TowerStateReadout): void {
  const broken = tower.getBrokenSeals();
  display.applySeals(broken);
  readout.applySeals(broken);
}

export function resetSeals(display: TowerDisplay, readout: TowerStateReadout): void {
  tower.resetBrokenSeals();
  refreshSeals(display, readout);
}
