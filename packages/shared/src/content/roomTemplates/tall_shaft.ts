import type { RoomTemplateDef } from '../types';

export default {
  id: 'tall_shaft',
  cells: [{ cx: 0, cy: 0 }, { cx: 0, cy: 1 }],
  tags: ['normal'],
  difficulty: 0.6,
  map: [
    'L............',
    '.m.........mB',
    '.............',
    '...OOO.OOO...',
    '......b......',
    '.............',
    '.^^^.....^^^.',
    '.............',
    '.............',
    '.^^^.....^^^.',
    '.............',
    '......b......',
    '...OOO.OOO...',
    '.............',
    '.m.........m.',
    '............F',
  ],
  legend: {
    b: { enemy: 'damp_blob' },
    m: { enemy: 'ceiling_moth' },
    B: { furniture: 'storage_box' },
    F: { furniture: 'fern' },
    L: { furniture: 'floor_lamp' },
  },
} satisfies RoomTemplateDef;
