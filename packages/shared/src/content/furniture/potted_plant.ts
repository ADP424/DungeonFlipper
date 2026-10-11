import type { FurnitureDef } from '../types';

export default {
  id: 'potted_plant',
  name: 'Potted Plant',
  size: { w: 1, h: 1 },
  sprite: 'furniture/potted_plant',
  height: 0.8,
  blocksMovement: ['walk'],
  blocksProjectiles: [],
  value: 1,
  tags: ['plant'],
  price: 6,
  small: true,
} satisfies FurnitureDef;
