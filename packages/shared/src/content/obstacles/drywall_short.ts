import type { ObstacleDef } from '../types';

export default {
  id: 'drywall_short',
  name: 'Low Drywall',
  sprite: 'proc:short_wall:plaster',
  blocksMovement: ['walk'],
  blocksProjectiles: ['straight'],
  height: 'short',
  isWall: true,
  material: 'plaster',
  renovate: ['demolish'],
  connectGroup: 'wall',
  autotile: { set: 'plaster_short', joins: ['wall'] },
} satisfies ObstacleDef;
