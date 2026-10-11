import type { RoomTemplateDef } from '../types';

export default {
  id: 'boss_facility_manager',
  cells: [{ cx: 0, cy: 0 }, { cx: 1, cy: 0 }],
  tags: ['boss'],
  difficulty: 3,
  attach: ['stairsDown'],
  map: [
    '............................',
    '..H.......................H.',
    '.....##................##...',
    '.............X..............',
    '.....##................##...',
    '..H.......................H.',
    '............................',
  ],
  legend: {
    X: { enemy: 'facility_manager' },
    H: { furniture: 'space_heater' },
  },
} satisfies RoomTemplateDef;
