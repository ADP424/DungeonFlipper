import type { EnemyDef } from '../types';
import { GEAR, SUPPLIES } from '../loot/groups';

/** Lumbers after you lobbing globs that leave slippery puddles, and sprays everything around it when hit. */
export default {
  id: 'water_cooler',
  name: 'Water Cooler',
  sprite: 'enemies/water_cooler/idle',
  radius: 0.38,
  hp: 26,
  difficulty: 1.2,
  speed: 1.3,
  movementKind: 'walk',
  knockbackResist: 0.5,
  ai: {
    id: 'water_cooler',
    params: {
      keepAway: 2.5, range: 9, cooldown: 2.4, windup: 0.45, glob: 'water_glob', globDamage: 1,
      spray: 'droplet', sprayCount: 8, sprayDamage: 1, sprayCooldown: 1.4,
    },
  },
  contactDamage: 1,
  anims: { windup: { frames: 'enemies/water_cooler/windup' } },
  loot: [
    { chance: 0.6, entries: [{ chance: 0.55, cash: [2, 4] }, { chance: 0.06, item: 'half_sandwich' }, { chance: 0.01, item: 'sandwich' }] },
    { chance: 0.2, entries: GEAR },
    { chance: 0.2, entries: SUPPLIES },
    { chance: 0.05, entries: [{ chance: 1, item: 'plank_barricade' }] },
    { chance: 0.02, entries: [{ chance: 1, item: 'company_flag' }] },
  ],
} satisfies EnemyDef;
