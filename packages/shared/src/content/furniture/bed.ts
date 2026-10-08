import type { FurnitureDef } from '../types';

export default {
  id: 'bed',
  name: 'Bed',
  size: { w: 1, h: 2 },
  sprite: { tiles: [['proc:bed_top'], ['proc:bed_bottom']] },
  rotatable: true,
  height: 0.5,
  blocksMovement: ['walk'],
  blocksProjectiles: [],
} satisfies FurnitureDef;
