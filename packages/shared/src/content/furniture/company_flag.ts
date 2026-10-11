import type { FurnitureDef } from '../types';

/** A planted company flag: the room's claim marker. It stays put, and comes down if the room is lost. */
export default {
  id: 'company_flag',
  name: 'Company Flag',
  size: { w: 1, h: 1 },
  sprite: 'furniture/company_flag',
  height: 1.4,
  blocksMovement: ['walk'],
  blocksProjectiles: [],
  fixed: true,
  claimsRoom: true,
} satisfies FurnitureDef;
