import type { FurnitureDef } from '../types';

/** A rival realtor's claim on a room: comes down if they sell it or lose it. */
export default {
  id: 'realtor_flag',
  name: 'Realtor Sign',
  size: { w: 1, h: 1 },
  sprite: 'furniture/realtor_flag',
  height: 1.4,
  blocksMovement: ['walk'],
  blocksProjectiles: [],
  fixed: true,
  claimsRoom: true,
} satisfies FurnitureDef;
