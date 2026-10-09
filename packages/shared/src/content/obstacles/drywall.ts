import type { ObstacleDef } from '../types';

export default {
  id: 'drywall',
  name: 'Drywall',
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
