import type { ObstacleDef } from '../types';

export default {
  id: 'stone_wall_short',
  name: 'Low Stone Wall',
  sprite: 'proc:short_wall:stone',
  blocksMovement: ['walk'],
  blocksProjectiles: ['straight'],
  height: 'short',
  isWall: true,
  material: 'stone',
  renovate: ['demolish'],
  connectGroup: 'wall',
  autotile: { set: 'stone_short', joins: ['wall'] },
} satisfies ObstacleDef;
