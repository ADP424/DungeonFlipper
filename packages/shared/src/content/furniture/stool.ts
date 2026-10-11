import type { FurnitureDef } from '../types';

export default {
  id: 'stool',
  name: 'Stool',
  size: { w: 1, h: 1 },
  sprite: 'furniture/stool',
  rotatable: false,
  height: 0.4,
  blocksMovement: ['walk'],
  blocksProjectiles: [],
  value: 1,
  tags: ['seat'],
  price: 4,
} satisfies FurnitureDef;
