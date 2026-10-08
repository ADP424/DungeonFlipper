import type { FurnitureDef } from '../types';

export default {
  id: 'fern',
  name: 'Fern',
  size: { w: 1, h: 1 },
  sprite: 'ri:17',
  rotatable: false,
  height: 0.8,
  blocksMovement: ['walk'],
  blocksProjectiles: [],
} satisfies FurnitureDef;
