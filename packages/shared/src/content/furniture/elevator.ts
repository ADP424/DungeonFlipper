import type { FurnitureDef } from '../types';

/** Lobby elevator: rides between the lobbies of floors you've reached. */
export default {
  id: 'elevator',
  name: 'Elevator',
  size: { w: 1, h: 1 },
  sprite: 'furniture/elevator',
  height: 1.6,
  blocksMovement: ['walk', 'fly'],
  blocksProjectiles: ['straight', 'high'],
  fixed: true,
  use: { id: 'elevator' },
  utility: { needs: 'power' },
} satisfies FurnitureDef;
