import type { LootTableDef } from '../types';

export default {
  id: 'tough',
  drops: [
    { chance: 0.9, entries: [{ chance: 0.6, cash: [3, 7] }, { chance: 0.3, item: 'sandwich' }] },
    {
      chance: 0.35,
      entries: [
        { chance: 0.0714, item: 'box_cutter' },
        { chance: 0.0714, item: 'crowbar' },
        { chance: 0.0714, item: 'sledgehammer' },
        { chance: 0.0714, item: 'pipe_wrench' },
        { chance: 0.0714, item: 'push_broom' },
        { chance: 0.0714, item: 'fire_axe' },
        { chance: 0.0714, item: 'nail_gun' },
        { chance: 0.0714, item: 'rivet_gun' },
        { chance: 0.0714, item: 'blowtorch' },
        { chance: 0.0714, item: 'fire_extinguisher' },
        { chance: 0.0714, item: 'cleaning_spray' },
        { chance: 0.0714, item: 'hoodie' },
        { chance: 0.0714, item: 'hi_vis_vest' },
        { chance: 0.0714, item: 'riot_vest' },
      ],
    },
    {
      chance: 0.2,
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
      chance: 0.25,
      entries: [
        { chance: 0.0999, item: 'claw_hammer' },
        { chance: 0.0999, item: 'plywood' },
        { chance: 0.0999, item: 'drywall_kit' },
        { chance: 0.0999, item: 'stud_kit' },
        { chance: 0.0999, item: 'roll_wallpaper_rose' },
        { chance: 0.0999, item: 'roll_wallpaper_sage' },
        { chance: 0.0999, item: 'roll_wallpaper_navy' },
        { chance: 0.0999, item: 'roll_carpet_crimson' },
        { chance: 0.0999, item: 'roll_carpet_teal' },
        { chance: 0.0999, item: 'roll_wood_oak' },
      ],
    },
    { chance: 0.12, entries: [{ chance: 0.6, item: 'plank_barricade' }, { chance: 0.4, item: 'security_door' }] },
    { chance: 0.06, entries: [{ chance: 1, item: 'company_flag' }] },
  ],
} satisfies LootTableDef;
