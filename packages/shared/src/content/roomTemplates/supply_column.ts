import type { RoomTemplateDef } from '../types';

export default {
  id: 'supply_column',
  cells: [{ cx: 0, cy: 0 }, { cx: 0, cy: 1 }],
  tags: ['normal'],
  difficulty: 1.2,
  map: [
    'L............',
    '............B',
    '..#...c...#..',
    '..#.......#..',
    '.............',
    '.............',
    '..m.......m..',
    '.............',
    '.............',
    '..m.......m..',
    '....wwwww....',
    '.............',
    '..#.......#..',
    '..#...c...#..',
    '..#.......#..',
    '............K',
  ],
  legend: {
    c: { enemy: 'water_cooler' },
    m: { enemy: 'ceiling_moth' },
    B: { furniture: 'storage_box' },
    K: { furniture: 'dresser' },
    L: { furniture: 'floor_lamp' },
  },
} satisfies RoomTemplateDef;
