import type { ObstacleDef } from '../types';

export default {
  id: 'timber_wall',
  name: 'Timber Partition',
  sprite: 'obstacles/timber_wall',
  blocksMovement: ['walk', 'fly'],
  blocksProjectiles: ['straight', 'high', 'lobbed'],
  height: 'tall',
  depth: 6,
  isWall: true,
  material: 'wood',
  renovate: ['demolish'],
  connectGroup: 'wall',
  autotile: { set: 'timber_wall', joins: ['wall'] },
} satisfies ObstacleDef;
