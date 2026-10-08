import type { EnemyDef } from '../types';

export default {
  id: 'slime',
  name: 'Slime',
  sprite: 'td:108',
  radius: 0.36,
  hp: 6,
  speed: 2.2,
  movementKind: 'walk',
  movement: { id: 'hop', params: { interval: 0.9, hopTime: 0.45, distance: 2 } },
  attacks: [{ id: 'contact', params: { damage: 1 } }],
  lootTable: 'common',
} satisfies EnemyDef;
