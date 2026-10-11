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
    'E.K.B.....###',
    '..........###',
    '..........###',
    '.........@###',
    '..........###',
    '..........###',
    'PS.......L###',
  ],
  legend: {
    '@': { furniture: 'portal' },
    B: {
      furniture: 'storage_box',
      contents: [
        'company_flag', 'company_flag', 'company_flag', 'company_flag', 'plank_barricade', 'plank_barricade', 'for_rent_sign', 'for_rent_sign',
        'nail_gun', 'claw_hammer', 'hoodie',
        { id: 'toolkit', contents: ['plywood', 'drywall_kit', 'roll_wallpaper_rose', 'wire_spool', 'pipe_bundle'] },
      ],
    },
    E: { furniture: 'home_bed' },
    K: { furniture: 'dresser' },
    L: { furniture: 'floor_lamp' },
    P: { furniture: 'potted_plant' },
    S: { furniture: 'sofa' },
  },
} satisfies RoomTemplateDef;
