import type { FurnitureDef } from '../types';

export default {
  id: 'stool',
  name: 'Stool',
  size: { w: 1, h: 1 },
  sprite: 'ri:81',
  rotatable: false,
  height: 0.4,
  blocksMovement: ['walk'],
  blocksProjectiles: [],
} satisfies FurnitureDef;
