import type { ObstacleDef } from '../types';

export default {
  id: 'stairs_down',
  name: 'Stairs Down',
  sprite: 'obstacles/stairs_down',
  blocksMovement: [],
  blocksProjectiles: [],
  height: 'none',
  trigger: { id: 'stairs', params: { delta: 1 } },
  light: { radius: 2.5, color: 0x8899ff, intensity: 0.6 },
} satisfies ObstacleDef;
