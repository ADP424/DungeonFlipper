import type { FurnitureDef } from '../types';

/** A For Rent sign standing in a unit: the unit is listed while it's open. */
export default {
  id: 'for_rent_sign',
  name: 'For Rent Sign',
  size: { w: 1, h: 1 },
  sprite: 'furniture/for_rent_sign',
  rotatable: false,
  height: 0.9,
  blocksMovement: ['walk'],
  blocksProjectiles: [],
  use: { id: 'toggleListing' },
} satisfies FurnitureDef;
