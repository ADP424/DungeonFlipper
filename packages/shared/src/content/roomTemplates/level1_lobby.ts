import type { RoomTemplateDef } from '../types';

/** Level 1's lobby: where the crack from your apartment comes out. Pre-owned. (The id predates the apartment.) */
export default {
  id: 'level1_lobby',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['lobby'],
  startsOwned: true,
  map: [
    '.................',
    '.................',
    '.................',
    '.................',
    '.................',
    '.................',
    '.................',
    '.................',
    '.................',
  ],
  furniture: [
    { def: 'elevator', x: 5, y: 0 },
    { def: 'portal', x: 11, y: 0 },
    { def: 'desk_lamp', x: 15, y: 0 },
    { def: 'table', x: 12, y: 7 },
    { def: 'chair', x: 11, y: 7 },
    { def: 'potted_plant', x: 0, y: 8 },
    { def: 'work_light', x: 16, y: 8 },
  ],
} satisfies RoomTemplateDef;
