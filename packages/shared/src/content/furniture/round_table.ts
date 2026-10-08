import type { FurnitureDef } from '../types';

export default {
  id: 'round_table',
  name: 'Round Table',
  size: { w: 1, h: 1 },
  sprite: 'ri:7',
  rotatable: false,
  height: 0.6,
  blocksMovement: ['walk'],
  blocksProjectiles: [],
} satisfies FurnitureDef;
