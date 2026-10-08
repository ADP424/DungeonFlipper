import type { ObstacleDef } from '../types';

export default {
  id: 'plaster_wall',
  name: 'Plaster Wall',
  sprite: 'proc:tall_wall:plaster',
  blocksMovement: ['walk', 'fly'],
  blocksProjectiles: ['straight', 'lobbed'],
  height: 'tall',
  isWall: true,
  material: 'plaster',
  renovate: ['demolish'],
  connectGroup: 'wall',
  autotile: { set: 'plaster', joins: ['wall'] },
} satisfies ObstacleDef;
