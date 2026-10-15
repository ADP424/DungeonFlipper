import type { ObstacleDef } from '../types';

export default {
  id: 'concrete_wall_short',
  name: 'Low Concrete Wall',
  sprite: 'obstacles/concrete_wall_short',
  blocksMovement: ['walk'],
  blocksProjectiles: ['straight'],
  height: 'short',
  depth: 6,
  isWall: true,
  material: 'stone',
  renovate: ['demolish'],
  connectGroup: 'wall',
  autotile: { set: 'concrete_wall_short', joins: ['wall'] },
} satisfies ObstacleDef;
