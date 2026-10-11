import type { FurnitureDef } from '../types';

/** Where the Backrooms' water comes up: supplies every pipe connected to it (P6). Every lobby has one. */
export default {
  id: 'water_main',
  name: 'Water Main',
  size: { w: 1, h: 1 },
  sprite: 'furniture/water_main',
  blocksMovement: ['walk'],
  blocksProjectiles: [],
  height: 0.8,
  fixed: true,
  utility: { provides: 'water' },
} satisfies FurnitureDef;
