import type { ObstacleDef } from '../types';

export default {
  id: 'backrooms_wall',
  name: 'Backrooms Wall',
  sprite: 'obstacles/backrooms_wall',
  blocksMovement: ['walk', 'fly'],
  blocksProjectiles: ['straight', 'lobbed'],
  height: 'tall',
  isWall: true,
  material: 'backrooms',
  renovate: ['demolish'],
  connectGroup: 'wall',
  autotile: { set: 'backrooms_wall', joins: ['wall'] },
} satisfies ObstacleDef;
