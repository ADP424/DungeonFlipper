import type { FurnitureDef } from '../types';

export default {
  id: 'chair',
  name: 'Chair',
  size: { w: 1, h: 1 },
  sprite: 'furniture/chair',
  depth: 12,
  height: 0.6,
  blocksMovement: ['walk'],
  blocksProjectiles: [],
  value: 1,
  tags: ['seat'],
  price: 6,
} satisfies FurnitureDef;
