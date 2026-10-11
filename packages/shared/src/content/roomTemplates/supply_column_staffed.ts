import type { RoomTemplateDef } from '../types';

export default {
  id: 'supply_column_staffed',
  cells: [{ cx: 0, cy: 0 }, { cx: 0, cy: 1 }],
  tags: ['normal'],
  difficulty: 2,
  map: [
    'W............',
    '............B',
    '..#...s...#..',
    '..#.......#..',
    '.............',
    '..i.......i..',
    '.............',
    '......h......',
    '.............',
    '......i......',
    '....wwwww....',
    '.............',
    '..#.......#..',
    '..#...s...#..',
    '..#.......#..',
    '............B',
  ],
  legend: {
    h: { enemy: 'hr_rep' },
    i: { enemy: 'intern' },
    s: { enemy: 'stapler_clerk' },
    B: { furniture: 'storage_box' },
    W: { furniture: 'work_light' },
  },
} satisfies RoomTemplateDef;
