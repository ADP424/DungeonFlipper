import type { FurnitureDef } from '../types';

export default {
  id: 'upright_piano',
  name: 'Upright Piano',
  size: { w: 2, h: 1 },
  sprite: 'furniture/upright_piano',
  rotatable: true,
  height: 1.1,
  blocksMovement: ['walk'],
  blocksProjectiles: ['straight'],
  value: 5,
  tags: ['music'],
  price: 60,
} satisfies FurnitureDef;
