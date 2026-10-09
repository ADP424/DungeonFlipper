import type { LegendEntry } from '../types';

/**
 * Default ASCII legend for room template maps. Templates may extend/override it via `legend`.
 * Unknown characters are treated as floor.
 */
export const defaultLegend: Record<string, LegendEntry> = {
  '.': { floor: true },
  ' ': { floor: true },
  '#': { obstacle: 'concrete_wall' },
  'w': { obstacle: 'concrete_wall_short' },
  'O': { obstacle: 'missing_floor' },
  '^': { obstacle: 'broken_glass' },
  '*': { furniture: 'space_heater' },
  'D': { obstacle: 'stairs_down' },
  'U': { obstacle: 'stairs_up' },
  // Spawn slots: the room's difficulty decides what appears.
  'e': { slot: {} },
  'F': { slot: { tags: ['flyer'] } },
  'R': { slot: { tags: ['ranged'] } },
  'M': { slot: { tags: ['brute'] } },
  'B': { slot: { boss: true } },
  // Furniture slots.
  '$': { furnitureSlot: {} },
  'L': { furnitureSlot: { tags: ['light'] } },
  // Pinned enemies (always this enemy, whatever the difficulty).
  's': { enemy: 'damp_blob' },
  'r': { enemy: 'rat' },
  'b': { enemy: 'ceiling_moth' },
  'a': { enemy: 'stapler_clerk' },
  'g': { enemy: 'intern' },
  'i': { enemy: 'flicker' },
  'k': { enemy: 'security_guard' },
  'c': { enemy: 'hr_rep' },
  'x': { enemy: 'water_cooler' },
};
