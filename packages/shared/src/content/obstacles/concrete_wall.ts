import type { ObstacleDef } from '../types';

export default {
  id: 'concrete_wall',
  name: 'Concrete Wall',
  sprite: 'obstacles/concrete_wall',
  blocksMovement: ['walk', 'fly'],
  blocksProjectiles: ['straight', 'high', 'lobbed'],
  height: 'tall',
  depth: 6,
  isWall: true,
  material: 'stone',
  renovate: ['demolish'],
  connectGroup: 'wall',
  autotile: { set: 'concrete_wall', joins: ['wall'] },
} satisfies ObstacleDef;
