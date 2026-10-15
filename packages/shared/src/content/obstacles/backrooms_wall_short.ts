import type { ObstacleDef } from '../types';

export default {
  id: 'backrooms_wall_short',
  name: 'Low Backrooms Wall',
  sprite: 'obstacles/backrooms_wall_short',
  blocksMovement: ['walk'],
  blocksProjectiles: ['straight'],
  height: 'short',
  depth: 6,
  isWall: true,
  material: 'backrooms',
  renovate: ['demolish'],
  connectGroup: 'wall',
  autotile: { set: 'backrooms_wall_short', joins: ['wall'] },
} satisfies ObstacleDef;
