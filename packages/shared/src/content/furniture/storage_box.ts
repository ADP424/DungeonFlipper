import type { FurnitureDef } from '../types';

export default {
  id: 'storage_box',
  name: 'Storage Box',
  size: { w: 1, h: 1 },
  sprite: 'td:89',
  rotatable: false,
  height: 0.6,
  blocksMovement: ['walk'],
  blocksProjectiles: ['straight'],
  container: { slots: 16 },
  value: 3,
  tags: ['storage'],
} satisfies FurnitureDef;
