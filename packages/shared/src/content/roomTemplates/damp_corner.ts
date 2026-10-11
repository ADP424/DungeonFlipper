import type { RoomTemplateDef } from '../types';

export default {
  id: 'damp_corner',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['normal'],
  difficulty: 0.6,
  map: [
    'L............',
    '..b.......m..',
    '.....OO......',
    '.....OO..b...',
    '..m..........',
    '.......b.....',
    'F............',
  ],
  legend: {
    b: { enemy: 'damp_blob' },
    m: { enemy: 'ceiling_moth' },
    F: { furniture: 'fern' },
    L: { furniture: 'floor_lamp' },
  },
} satisfies RoomTemplateDef;
