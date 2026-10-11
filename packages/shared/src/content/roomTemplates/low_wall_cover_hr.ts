import type { RoomTemplateDef } from '../types';

export default {
  id: 'low_wall_cover_hr',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['normal'],
  difficulty: 2,
  map: [
    'L............',
    '...s..h..s...',
    '..www...www..',
    '.............',
    '....i...i....',
    '..www...www..',
    '............A',
  ],
  legend: {
    h: { enemy: 'hr_rep' },
    i: { enemy: 'intern' },
    s: { enemy: 'stapler_clerk' },
    A: { furniture: 'desk_lamp' },
    L: { furniture: 'floor_lamp' },
  },
} satisfies RoomTemplateDef;
