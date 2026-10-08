import type { ObstacleDef } from '../types';

export default {
  id: 'boundary_wall',
  name: 'Dungeon Wall',
  sprite: 'td:40',
  blocksMovement: ['walk', 'fly'],
  blocksProjectiles: ['straight', 'lobbed'],
  height: 'tall',
  isWall: true,
  material: 'stone',
  connectGroup: 'wall',
  autotile: { set: 'stone', joins: ['wall'] },
} satisfies ObstacleDef;
