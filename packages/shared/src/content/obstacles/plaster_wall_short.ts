import type { ObstacleDef } from '../types';

export default {
  id: 'plaster_wall_short',
  name: 'Low Plaster Wall',
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
