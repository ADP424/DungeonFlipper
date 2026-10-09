import type { FurnitureDef } from '../types';

export default {
  id: 'upright_piano',
  name: 'Upright Piano',
  size: { w: 2, h: 1 },
  sprite: { tiles: [['ri:239', 'ri:240']] },
  rotatable: true,
  height: 1.1,
  blocksMovement: ['walk'],
  blocksProjectiles: ['straight'],
  value: 5,
  tags: ['music'],
  price: 60,
} satisfies FurnitureDef;
