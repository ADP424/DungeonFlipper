import type { ObstacleDef } from '../types';

export default {
  id: 'drywall',
  name: 'Drywall',
  sprite: 'obstacles/drywall',
  blocksMovement: ['walk', 'fly'],
  blocksProjectiles: ['straight', 'high', 'lobbed'],
  height: 'tall',
  depth: 6,
  isWall: true,
  material: 'plaster',
  renovate: ['demolish'],
  connectGroup: 'wall',
  autotile: { set: 'drywall', joins: ['wall'] },
} satisfies ObstacleDef;
