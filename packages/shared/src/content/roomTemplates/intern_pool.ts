import type { RoomTemplateDef } from '../types';

export default {
  id: 'intern_pool',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['normal'],
  difficulty: 0.8,
  map: [
    'L............',
    '.i.........i.',
    '...#.....#...',
    '......H......',
    '...#.....#...',
    '.i.........i.',
    '...........T.',
  ],
  legend: {
    i: { enemy: 'intern' },
    H: { furniture: 'space_heater' },
    L: { furniture: 'floor_lamp' },
    T: { furniture: 'table' },
  },
} satisfies RoomTemplateDef;
