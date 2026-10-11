import type { FurnitureDef } from '../types';

export default {
  id: 'fridge',
  name: 'Fridge',
  size: { w: 1, h: 1 },
  sprite: 'furniture/fridge',
  rotatable: false,
  blocksMovement: ['walk'],
  blocksProjectiles: ['straight'],
  height: 1.6,
  value: 3,
  tags: ['kitchen'],
  price: 30,
  utility: { needs: 'power' },
} satisfies FurnitureDef;
