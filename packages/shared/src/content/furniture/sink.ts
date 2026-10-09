import type { FurnitureDef } from '../types';

export default {
  id: 'sink',
  name: 'Sink',
  size: { w: 1, h: 1 },
  sprite: 'proc:sink',
  rotatable: false,
  blocksMovement: ['walk'],
  blocksProjectiles: [],
  height: 0.8,
  value: 2,
  tags: ['kitchen'],
  price: 18,
  utility: { needs: 'water' },
} satisfies FurnitureDef;
