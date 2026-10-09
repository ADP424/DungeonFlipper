import type { EnemyDef } from '../types';

export default {
  id: 'water_cooler',
  name: 'Water Cooler',
  sprite: 'td:110',
  radius: 0.38,
  hp: 10,
  threat: 3,
  tags: ['ranged'],
  speed: 1.2,
  movementKind: 'walk',
  movement: { id: 'walkChase', params: { keepAway: 2.5 } },
  attacks: [
    { id: 'contact', params: { damage: 1 } },
    {
      id: 'shootAtPlayer',
      params: { projectile: 'water_glob', cooldown: 2.6, damage: 1, initialDelay: 1.2 },
    },
  ],
  lootTable: 'common',
} satisfies EnemyDef;
