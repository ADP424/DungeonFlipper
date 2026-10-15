import type { ObstacleDef } from '../types';

export default {
  id: 'timber_wall_short',
  name: 'Low Timber Partition',
  sprite: 'obstacles/timber_wall_short',
  blocksMovement: ['walk'],
  blocksProjectiles: ['straight'],
  height: 'short',
  depth: 6,
  isWall: true,
  material: 'wood',
  renovate: ['demolish'],
  connectGroup: 'wall',
  autotile: { set: 'timber_wall_short', joins: ['wall'] },
} satisfies ObstacleDef;
