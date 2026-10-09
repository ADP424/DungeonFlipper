import type { FurnitureDef } from '../types';

/** The apartment bed: the only bed you sleep in (and the only place you fully heal). It stays put. */
export default {
  id: 'home_bed',
  name: 'Your Bed',
  size: { w: 1, h: 2 },
  sprite: { tiles: [['proc:bed_top'], ['proc:bed_bottom']] },
  rotatable: true,
  height: 0.5,
  blocksMovement: ['walk'],
  blocksProjectiles: [],
  fixed: true,
  use: { id: 'sleepHome' },
} satisfies FurnitureDef;
