import type { EnemyDef } from '../types';

export default {
  id: 'bog_crab',
  name: 'Bog Crab',
  sprite: 'td:110',
  radius: 0.38,
  hp: 10,
  speed: 1.2,
  movementKind: 'walk',
  movement: { id: 'walkChase', params: { keepAway: 2.5 } },
  attacks: [
    { id: 'contact', params: { damage: 1 } },
    {
      id: 'shootAtPlayer',
      params: { projectile: 'slime_glob', cooldown: 2.6, damage: 1, initialDelay: 1.2 },
    },
  ],
  lootTable: 'common',
} satisfies EnemyDef;
