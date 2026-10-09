import type { ObstacleDef } from '../types';

export default {
  id: 'missing_floor',
  name: 'Missing Floor',
  sprite: 'proc:hole',
  blocksMovement: ['walk'],
  blocksProjectiles: [],
  height: 'none',
  renovate: ['fill'],
  connectGroup: 'missing_floor',
} satisfies ObstacleDef;
