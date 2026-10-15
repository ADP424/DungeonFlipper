import type { FurnitureDef } from '../types';

export default {
  id: 'dresser',
  name: 'Dresser',
  size: { w: 1, h: 1 },
  sprite: 'furniture/dresser',
  depth: 10,
  height: 0.75,
  blocksMovement: ['walk'],
  blocksProjectiles: ['straight'],
  value: 2,
  tags: ['storage'],
  price: 15,
  tabletop: 8,
} satisfies FurnitureDef;
