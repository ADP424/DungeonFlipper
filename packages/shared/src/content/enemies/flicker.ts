import type { EnemyDef } from '../types';

export default {
  id: 'flicker',
  name: 'Flicker',
  sprite: 'td:121',
  tint: 0xd0b0ff,
  radius: 0.33,
  hp: 6,
  threat: 3,
  tags: ['flyer', 'ranged'],
  speed: 1.4,
  movementKind: 'fly',
  hazardImmune: true,
  movement: { id: 'bobSine', params: { amplitude: 1.8, frequency: 1.1 } },
  attacks: [
    { id: 'contact', params: { damage: 1 } },
    {
      id: 'shootAtPlayer',
      params: { projectile: 'memo', cooldown: 2.4, damage: 1, initialDelay: 1.5 },
    },
  ],
  lootTable: 'common',
  light: { radius: 2.2, color: 0xc090ff, intensity: 0.7 },
} satisfies EnemyDef;
