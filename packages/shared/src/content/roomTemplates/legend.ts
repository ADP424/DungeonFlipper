import type { LegendEntry } from '../types';

/**
 * Default ASCII legend for room template maps. Templates may extend/override it via `legend`.
 * Unknown characters are treated as floor.
 */
export const defaultLegend: Record<string, LegendEntry> = {
  '.': { floor: true },
  ' ': { floor: true },
  '#': { obstacle: 'stone_wall' },
  'w': { obstacle: 'stone_wall_short' },
  'O': { obstacle: 'hole' },
  '^': { obstacle: 'spikes' },
  '*': { furniture: 'brazier' },
  'D': { obstacle: 'stairs_down' },
  'U': { obstacle: 'stairs_up' },
  's': { enemy: 'slime' },
  'r': { enemy: 'rat' },
  'b': { enemy: 'bat' },
  'a': { enemy: 'skeleton_archer' },
  'g': { enemy: 'goblin' },
  'i': { enemy: 'wisp' },
  'k': { enemy: 'knight' },
  'c': { enemy: 'cultist' },
  'x': { enemy: 'bog_crab' },
  'B': { enemy: 'bone_warden' },
};
