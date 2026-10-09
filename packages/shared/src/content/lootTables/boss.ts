import type { LootTableDef } from '../types';

export default {
  id: 'boss',
  drops: [
    { chance: 1, entries: [{ chance: 1, cash: [20, 30] }] },
    { chance: 1, entries: [{ chance: 1, item: 'sandwich' }] },
    {
      chance: 1,
      entries: [
        { chance: 0.1427, item: 'energy_drink' },
        { chance: 0.1427, item: 'running_shoes' },
        { chance: 0.1427, item: 'duct_tape' },
        { chance: 0.1427, item: 'precision_bits' },
        { chance: 0.1427, item: 'work_gloves' },
        { chance: 0.1427, item: 'double_nozzle' },
        { chance: 0.1427, item: 'extension_pole' },
      ],
    },
    {
      chance: 1,
      entries: [
        { chance: 0.25, item: 'sledgehammer' },
        { chance: 0.25, item: 'rivet_gun' },
        { chance: 0.25, item: 'riot_vest' },
        { chance: 0.25, item: 'blowtorch' },
      ],
    },
    { chance: 1, entries: [{ chance: 0.7, item: 'steel_door' }, { chance: 0.3, item: 'blast_door' }] },
    { chance: 1, entries: [{ chance: 1, item: 'company_flag' }] },
  ],
} satisfies LootTableDef;
