import type { FurnitureDef } from '../types';

export default {
  id: 'potted_plant',
  name: 'Potted Plant',
  size: { w: 1, h: 1 },
  sprite: 'ri:16',
  rotatable: false,
  height: 0.8,
  blocksMovement: ['walk'],
  blocksProjectiles: [],
} satisfies FurnitureDef;
