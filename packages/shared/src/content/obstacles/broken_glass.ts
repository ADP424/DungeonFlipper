import type { ObstacleDef } from '../types';

export default {
  id: 'broken_glass',
  name: 'Broken Glass',
  sprite: 'obstacles/broken_glass',
  blocksMovement: [],
  blocksProjectiles: [],
  height: 'none',
  hazard: { damage: 1, enemyDamage: 2, affects: ['walk'] },
  renovate: ['demolish'],
} satisfies ObstacleDef;
