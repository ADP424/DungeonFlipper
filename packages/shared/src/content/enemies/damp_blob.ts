import type { EnemyDef } from '../types';

export default {
  id: 'damp_blob',
  name: 'Damp Blob',
  sprite: 'td:108',
  radius: 0.36,
  hp: 6,
  threat: 2,
  tags: ['hopper'],
  speed: 2.2,
  movementKind: 'walk',
  movement: { id: 'hop', params: { interval: 0.9, hopTime: 0.45, distance: 2 } },
  attacks: [{ id: 'contact', params: { damage: 1 } }],
  lootTable: 'common',
} satisfies EnemyDef;
