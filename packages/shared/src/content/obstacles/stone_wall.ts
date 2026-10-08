import type { ObstacleDef } from '../types';

export default {
  id: 'stone_wall',
  name: 'Stone Wall',
  sprite: 'td:40',
  blocksMovement: ['walk', 'fly'],
  blocksProjectiles: ['straight', 'lobbed'],
  height: 'tall',
  isWall: true,
  material: 'stone',
  renovate: ['demolish'],
  connectGroup: 'wall',
  autotile: { set: 'stone', joins: ['wall'] },
} satisfies ObstacleDef;
