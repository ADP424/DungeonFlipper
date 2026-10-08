import type { ObstacleDef } from '../types';

export default {
  id: 'wood_wall_short',
  name: 'Low Wood Wall',
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
