import type { ObstacleDef } from '../types';

export default {
  id: 'hole',
  name: 'Pit',
  sprite: 'proc:hole',
  blocksMovement: ['walk'],
  blocksProjectiles: [],
  height: 'none',
  renovate: ['fill'],
  connectGroup: 'hole',
} satisfies ObstacleDef;
