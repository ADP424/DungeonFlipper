import type { LegendEntry } from '../types';

/**
 * The shared ASCII legend for room template maps: structure only. What stands in a room (which
 * enemy, which furniture) is that template's own business: it marks the spots with any other
 * characters and says what they are in its `legend`.
 */
export const defaultLegend: Record<string, LegendEntry> = {
  '.': { floor: true },
  ' ': { floor: true },
  '#': { obstacle: 'backrooms_wall' },
  'w': { obstacle: 'backrooms_wall_short' },
  'O': { obstacle: 'missing_floor' },
  '^': { obstacle: 'broken_glass' },
  'D': { obstacle: 'stairs_down' },
  'U': { obstacle: 'stairs_up' },
};
