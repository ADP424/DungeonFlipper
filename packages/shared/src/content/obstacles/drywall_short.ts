import type { ObstacleDef } from '../types';

export default {
  id: 'drywall_short',
  name: 'Low Drywall',
  sprite: 'obstacles/drywall_short',
  blocksMovement: ['walk'],
  blocksProjectiles: ['straight'],
  height: 'short',
  depth: 6,
  isWall: true,
  material: 'plaster',
  renovate: ['demolish'],
  connectGroup: 'wall',
  autotile: { set: 'drywall_short', joins: ['wall'] },
} satisfies ObstacleDef;
