import type { FurnitureDef } from '../types';

export default {
  id: 'toilet',
  name: 'Toilet',
  size: { w: 1, h: 1 },
  sprite: 'furniture/toilet',
  blocksMovement: ['walk'],
  blocksProjectiles: [],
  height: 0.7,
  value: 2,
  tags: ['bath'],
  price: 22,
  utility: { needs: 'water' },
} satisfies FurnitureDef;
