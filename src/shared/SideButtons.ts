import type { TowerSide } from '../types';
import { SIDES, SIDE_LABELS } from '../3d/constants';

export class SideButtons {
  readonly buttons: HTMLButtonElement[] = [];

  constructor(onClick: (side: TowerSide) => void) {
    for (const side of SIDES) {
      const btn = document.createElement('button');
      btn.className = 'tower-side-btn';
      btn.textContent = SIDE_LABELS[side];
      btn.dataset.side = side;
      btn.dataset.active = 'false';
      btn.addEventListener('click', () => onClick(side));
      this.buttons.push(btn);
    }
  }

  setActive(side: TowerSide | null): void {
    for (const btn of this.buttons) {
      btn.dataset.active = String(btn.dataset.side === side);
    }
  }
}
