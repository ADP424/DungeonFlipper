import type { ObstacleDef } from '../types';

export default {
  id: 'concrete_wall',
  name: 'Concrete Wall',
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
