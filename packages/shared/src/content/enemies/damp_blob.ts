import type { EnemyDef } from '../types';
import { GEAR, SUPPLIES } from '../loot/groups';

/** A few short hops, then a long leap at you that lands in a ring of droplets. */
export default {
  id: 'damp_blob',
  name: 'Damp Blob',
  sprite: 'enemies/damp_blob/idle',
  radius: 0.36,
  hp: 18,
  difficulty: 0.6,
  speed: 2.2,
  movementKind: 'walk',
  ai: {
    id: 'damp_blob',
    params: {
      rest: 0.45, hops: [2, 3], hopTime: 0.35, hopDistance: 1.4, hopHeight: 0.5, jitter: 0.8,
      windup: 0.55, leapTime: 0.6, leapRange: 5.5, leapHeight: 1.6,
      droplet: 'droplet', droplets: 6, dropletDamage: 1, landRest: 0.9,
    },
  },
  contactDamage: 1,
  anims: { windup: { frames: 'enemies/damp_blob/windup' } },
  loot: [
    { chance: 0.6, entries: [{ chance: 0.55, cash: [1, 3] }, { chance: 0.06, item: 'half_sandwich' }, { chance: 0.01, item: 'sandwich' }] },
    { chance: 0.2, entries: GEAR },
    { chance: 0.2, entries: SUPPLIES },
    { chance: 0.05, entries: [{ chance: 1, item: 'plank_barricade' }] },
    { chance: 0.02, entries: [{ chance: 1, item: 'company_flag' }] },
  ],
} satisfies EnemyDef;
