import type { FurnitureDef } from '../types';

export default {
  id: 'fern',
  name: 'Fern',
  size: { w: 1, h: 1 },
  sprite: 'furniture/fern',
  rotatable: false,
  height: 0.8,
  blocksMovement: ['walk'],
  blocksProjectiles: [],
  value: 1,
  tags: ['plant'],
  price: 6,
  small: true,
} satisfies FurnitureDef;
