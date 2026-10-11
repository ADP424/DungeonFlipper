import type { LootEntry } from '../types';

/**
 * Lists of things several enemies drop, written once. Every enemy has its own `loot`, which decides
 * how often a group comes up; the group decides what it is when it does.
 */

/** One entry per item, sharing the drop evenly. */
export const evenly = (items: string[]): LootEntry[] => items.map((item) => ({ chance: 1 / items.length, item }));

/** Weapons and armor. */
export const GEAR: LootEntry[] = evenly([
  'box_cutter', 'crowbar', 'sledgehammer', 'pipe_wrench', 'push_broom', 'fire_axe', 'nail_gun', 'rivet_gun',
  'blowtorch', 'fire_extinguisher', 'cleaning_spray', 'hoodie', 'hi_vis_vest', 'riot_vest',
]);

/** Renovation supplies; wall kits come up about twice as often as the rest. */
export const SUPPLIES: LootEntry[] = [
  { chance: 0.16, item: 'backrooms_wall_kit' },
  ...[
    'claw_hammer', 'plywood', 'drywall_kit', 'stud_kit', 'roll_wallpaper_rose', 'roll_wallpaper_sage',
    'roll_wallpaper_navy', 'roll_carpet_crimson', 'roll_carpet_teal', 'roll_wood_oak',
  ].map((item): LootEntry => ({ chance: 0.084, item })),
];
