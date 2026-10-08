import type { ObstacleDef } from '../types';

export default {
  id: 'stairs_up',
  name: 'Stairs Up',
  sprite: 'td:36',
  blocksMovement: [],
  blocksProjectiles: [],
  height: 'none',
  trigger: { id: 'stairs', params: { delta: -1 } },
  light: { radius: 2.5, color: 0xffe0a0, intensity: 0.6 },
} satisfies ObstacleDef;
