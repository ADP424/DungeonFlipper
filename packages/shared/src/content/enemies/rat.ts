import type { EnemyDef } from '../types';

export default {
  id: 'rat',
  name: 'Giant Rat',
  sprite: 'td:123',
  radius: 0.3,
  hp: 4,
  speed: 4.2,
  movementKind: 'walk',
  movement: { id: 'walkChase' },
  attacks: [{ id: 'contact', params: { damage: 1 } }],
  lootTable: 'common',
} satisfies EnemyDef;
