import type { EnemyDef } from '../types';
import { GEAR, SUPPLIES } from '../loot/groups';

/** Runs straight at you, fast, around whatever's in the way. */
export default {
  id: 'rat',
  name: 'Rat',
  sprite: 'enemies/rat/idle',
  radius: 0.3,
  hp: 10,
  difficulty: 0.3,
  speed: 4.2,
  movementKind: 'walk',
  ai: { id: 'rat' },
  contactDamage: 1,
  loot: [
    { chance: 0.6, entries: [{ chance: 0.55, cash: [1, 3] }, { chance: 0.06, item: 'half_sandwich' }, { chance: 0.01, item: 'sandwich' }] },
    { chance: 0.2, entries: GEAR },
    { chance: 0.2, entries: SUPPLIES },
    { chance: 0.05, entries: [{ chance: 1, item: 'plank_barricade' }] },
    { chance: 0.02, entries: [{ chance: 1, item: 'company_flag' }] },
  ],
} satisfies EnemyDef;
