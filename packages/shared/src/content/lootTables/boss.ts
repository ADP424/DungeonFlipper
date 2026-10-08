import type { LootTableDef } from '../types';

export default {
  id: 'boss',
  drops: [
    { chance: 1, entries: [{ chance: 1, gold: [20, 30] }] },
    { chance: 1, entries: [{ chance: 1, item: 'heart' }] },
    {
      chance: 1,
      entries: [
        { chance: 0.1427, item: 'heart_container' },
        { chance: 0.1427, item: 'swift_boots' },
        { chance: 0.1427, item: 'whetstone' },
        { chance: 0.1427, item: 'fletching' },
        { chance: 0.1427, item: 'quickdraw' },
        { chance: 0.1427, item: 'twin_shot' },
        { chance: 0.1427, item: 'long_reach' },
      ],
    },
    {
      chance: 1,
      entries: [
        { chance: 0.25, item: 'broadsword' },
        { chance: 0.25, item: 'crossbow' },
        { chance: 0.25, item: 'plate_armor' },
        { chance: 0.25, item: 'fire_wand' },
      ],
    },
    {
      chance: 1,
      entries: [
        { chance: 0.333, furniture: 'piano' },
        { chance: 0.333, furniture: 'candelabra' },
        { chance: 0.333, furniture: 'floor_lamp' },
      ],
    },
  ],
} satisfies LootTableDef;
