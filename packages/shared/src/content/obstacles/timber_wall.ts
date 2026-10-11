import type { ObstacleDef } from '../types';

export default {
  id: 'timber_wall',
  name: 'Timber Partition',
  sprite: 'obstacles/timber_wall',
  blocksMovement: ['walk', 'fly'],
  blocksProjectiles: ['straight', 'lobbed'],
  height: 'tall',
  isWall: true,
  material: 'wood',
  renovate: ['demolish'],
  connectGroup: 'wall',
  autotile: { set: 'timber_wall', joins: ['wall'] },
} satisfies ObstacleDef;
