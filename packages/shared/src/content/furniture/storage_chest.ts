import type { FurnitureDef } from '../types';

export default {
  id: 'storage_chest',
  name: 'Storage Chest',
  size: { w: 1, h: 1 },
  sprite: 'td:89',
  rotatable: false,
  height: 0.6,
  blocksMovement: ['walk'],
  blocksProjectiles: ['straight'],
  container: { slots: 12 },
} satisfies FurnitureDef;
