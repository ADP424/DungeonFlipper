import type { FurnitureDef } from '../types';

/** Sleeps two: what couples (and the parents of a family) need. */
export default {
  id: 'double_bed',
  name: 'Double Bed',
  size: { w: 2, h: 2 },
  sprite: 'furniture/double_bed',
  rotatable: true,
  height: 0.5,
  blocksMovement: ['walk'],
  blocksProjectiles: [],
  value: 4,
  tags: ['bed'],
  sleeps: 2,
  price: 35,
} satisfies FurnitureDef;
