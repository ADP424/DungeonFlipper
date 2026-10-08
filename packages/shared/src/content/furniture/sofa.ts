import type { FurnitureDef } from '../types';

export default {
  id: 'sofa',
  name: 'Sofa',
  size: { w: 2, h: 1 },
  sprite: { tiles: [['ri:147', 'ri:148']] },
  rotatable: true,
  height: 0.6,
  blocksMovement: ['walk'],
  blocksProjectiles: [],
} satisfies FurnitureDef;
