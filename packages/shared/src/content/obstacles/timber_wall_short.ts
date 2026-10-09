import type { ObstacleDef } from '../types';

export default {
  id: 'timber_wall_short',
  name: 'Low Timber Partition',
  sprite: 'proc:short_wall:wood',
  blocksMovement: ['walk'],
  blocksProjectiles: ['straight'],
  height: 'short',
  isWall: true,
  material: 'wood',
  renovate: ['demolish'],
  connectGroup: 'wall',
  autotile: { set: 'wood_short', joins: ['wall'] },
} satisfies ObstacleDef;
