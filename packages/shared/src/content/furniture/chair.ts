import type { FurnitureDef } from '../types';

export default {
  id: 'chair',
  name: 'Chair',
  size: { w: 1, h: 1 },
  sprite: 'ri:54',
  rotatable: true,
  height: 0.6,
  blocksMovement: ['walk'],
  blocksProjectiles: [],
} satisfies FurnitureDef;
