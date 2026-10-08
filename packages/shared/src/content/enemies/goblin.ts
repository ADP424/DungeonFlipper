import type { EnemyDef } from '../types';

export default {
  id: 'goblin',
  name: 'Goblin',
  sprite: 'td:112',
  radius: 0.36,
  hp: 8,
  speed: 3,
  movementKind: 'walk',
  movement: { id: 'gridStep', params: { stepTime: 0.3, pause: 0.25 } },
  attacks: [{ id: 'contact', params: { damage: 1 } }],
  lootTable: 'common',
} satisfies EnemyDef;
