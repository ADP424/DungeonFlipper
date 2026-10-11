import type { FurnitureDef } from '../types';

export default {
  id: 'round_table',
  name: 'Round Table',
  size: { w: 1, h: 1 },
  sprite: 'furniture/round_table',
  height: 0.6,
  blocksMovement: ['walk'],
  blocksProjectiles: [],
  value: 2,
  tags: ['table'],
  price: 10,
  tabletop: 6,
} satisfies FurnitureDef;
