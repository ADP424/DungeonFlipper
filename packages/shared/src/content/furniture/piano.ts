import type { FurnitureDef } from '../types';

export default {
  id: 'piano',
  name: 'Piano',
  size: { w: 2, h: 1 },
  sprite: { tiles: [['ri:239', 'ri:240']] },
  rotatable: true,
  height: 1.1,
  blocksMovement: ['walk'],
  blocksProjectiles: ['straight'],
} satisfies FurnitureDef;
