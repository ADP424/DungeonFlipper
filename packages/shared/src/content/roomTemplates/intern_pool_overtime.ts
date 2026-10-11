import type { RoomTemplateDef } from '../types';

export default {
  id: 'intern_pool_overtime',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['normal'],
  difficulty: 1.5,
  map: [
    'W..........A.',
    '.i....s....i.',
    '...#.....#...',
    '..i...H...i..',
    '...#.....#...',
    '.i.........i.',
    '...........T.',
  ],
  legend: {
    i: { enemy: 'intern' },
    s: { enemy: 'stapler_clerk' },
    A: { furniture: 'desk_lamp' },
    H: { furniture: 'space_heater' },
    T: { furniture: 'table' },
    W: { furniture: 'work_light' },
  },
} satisfies RoomTemplateDef;
