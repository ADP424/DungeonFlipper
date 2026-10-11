import type { FurnitureDef } from '../types';

export default {
  id: 'sofa',
  name: 'Sofa',
  size: { w: 2, h: 1 },
  sprite: 'furniture/sofa',
  rotatable: true,
  height: 0.6,
  blocksMovement: ['walk'],
  blocksProjectiles: [],
  value: 3,
  tags: ['seat'],
  price: 25,
} satisfies FurnitureDef;
