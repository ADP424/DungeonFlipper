import type { RoomTemplateDef } from '../types';

export default {
  id: 'tall_shaft_moths',
  cells: [{ cx: 0, cy: 0 }, { cx: 0, cy: 1 }],
  tags: ['normal'],
  difficulty: 0.3,
  map: [
    'W............',
    '.m.........m.',
    '.............',
    '...OOO.OOO...',
    '.............',
    '.............',
    '.^^^..r..^^^.',
    '.............',
    '.............',
    '.^^^..r..^^^.',
    '.............',
    '.............',
    '...OOO.OOO...',
    '.............',
    '.m.........m.',
    '............C',
  ],
  legend: {
    m: { enemy: 'ceiling_moth' },
    r: { enemy: 'rat' },
    C: { furniture: 'chair' },
    W: { furniture: 'work_light' },
  },
} satisfies RoomTemplateDef;
