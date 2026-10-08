import type { EnemyDef } from '../types';

export default {
  id: 'skeleton',
  name: 'Skeleton',
  sprite: 'td:97',
  tint: 0xe8e2d0,
  radius: 0.35,
  hp: 4,
  speed: 2.6,
  movementKind: 'walk',
  movement: { id: 'walkChase' },
  attacks: [{ id: 'contact', params: { damage: 1 } }],
} satisfies EnemyDef;
