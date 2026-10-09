import type { EnemyDef } from '../types';

export default {
  id: 'stapler_clerk',
  name: 'Stapler Clerk',
  sprite: 'td:100',
  tint: 0xe8e2d0,
  radius: 0.35,
  hp: 7,
  threat: 4,
  tags: ['ranged'],
  speed: 2.4,
  movementKind: 'walk',
  movement: { id: 'keepDistance', params: { min: 3, max: 5.5 } },
  attacks: [
    { id: 'contact', params: { damage: 1 } },
    {
      id: 'shootAtPlayer',
      params: { projectile: 'staple', cooldown: 1.8, damage: 1, initialDelay: 1 },
    },
  ],
  lootTable: 'tough',
} satisfies EnemyDef;
