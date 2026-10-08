import type { EnemyDef } from '../types';

export default {
  id: 'bat',
  name: 'Bat',
  sprite: 'td:120',
  radius: 0.3,
  hp: 3,
  speed: 3.6,
  movementKind: 'fly',
  hazardImmune: true,
  movement: { id: 'flyErratic', params: { turnInterval: 0.5, chaseBias: 0.5 } },
  attacks: [{ id: 'contact', params: { damage: 1 } }],
  lootTable: 'common',
} satisfies EnemyDef;
