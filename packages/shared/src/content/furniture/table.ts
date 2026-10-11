import type { FurnitureDef } from '../types';

export default {
  id: 'table',
  name: 'Long Table',
  size: { w: 2, h: 1 },
  sprite: 'furniture/table',
  rotatable: true,
  height: 0.6,
  blocksMovement: ['walk'],
  blocksProjectiles: [],
  value: 2,
  tags: ['table'],
  price: 10,
  tabletop: 6,
} satisfies FurnitureDef;
