import type { FurnitureDef } from '../types';

export default {
  id: 'table',
  name: 'Long Table',
  size: { w: 2, h: 1 },
  sprite: { tiles: [['ri:27', 'ri:29']] },
  rotatable: true,
  height: 0.6,
  blocksMovement: ['walk'],
  blocksProjectiles: [],
} satisfies FurnitureDef;
