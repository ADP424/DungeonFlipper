import type { RoomTemplateDef } from '../types';

/**
 * Your shabby real-world apartment (floor 0): home bed, stash, and the glowing crack in the closet
 * wall that leads to Level 1's lobby. Always yours, always safe, the respawn point.
 */
export default {
  id: 'apartment',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['safe', 'home'],
  startsOwned: true,
  floorSurface: 'wood_oak',
  wallSurface: 'wallpaper_sage',
  map: [
    '...........######',
    '...........######',
    '...........######',
    '...........######',
    '...........######',
    '...........######',
    '...........######',
    '...........######',
    '...........######',
  ],
  furniture: [
    { def: 'home_bed', x: 0, y: 0 },
    { def: 'dresser', x: 2, y: 0 },
    {
      def: 'storage_box',
      x: 4,
      y: 0,
      contents: [
        'company_flag', 'company_flag', 'company_flag', 'company_flag', 'plank_barricade', 'plank_barricade', 'for_rent_sign', 'for_rent_sign',
        'nail_gun', 'claw_hammer', 'hoodie',
        { id: 'toolkit', contents: ['plywood', 'drywall_kit', 'roll_wallpaper_rose', 'wire_spool', 'pipe_bundle'] },
      ],
    },
    { def: 'portal', x: 10, y: 4 },
    { def: 'sofa', x: 1, y: 8 },
    { def: 'floor_lamp', x: 10, y: 8 },
    { def: 'potted_plant', x: 0, y: 8 },
  ],
} satisfies RoomTemplateDef;
