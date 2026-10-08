import type { ObstacleDef } from '../types';

export default {
  id: 'wood_wall',
  name: 'Wood Wall',
  sprite: 'proc:tall_wall:wood',
  blocksMovement: ['walk', 'fly'],
  blocksProjectiles: ['straight', 'lobbed'],
  height: 'tall',
  isWall: true,
  material: 'wood',
  renovate: ['demolish'],
  connectGroup: 'wall',
  autotile: { set: 'wood', joins: ['wall'] },
} satisfies ObstacleDef;
