import type { FurnitureDef } from '../types';

export default {
  id: 'dresser',
  name: 'Dresser',
  size: { w: 1, h: 1 },
  sprite: 'ri:141',
  rotatable: true,
  height: 1.1,
  blocksMovement: ['walk'],
  blocksProjectiles: ['straight'],
} satisfies FurnitureDef;
