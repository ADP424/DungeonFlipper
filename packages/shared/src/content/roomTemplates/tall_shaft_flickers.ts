import type { RoomTemplateDef } from '../types';

export default {
  id: 'tall_shaft_flickers',
  cells: [{ cx: 0, cy: 0 }, { cx: 0, cy: 1 }],
  tags: ['normal'],
  difficulty: 1.5,
  map: [
    '.............',
    '.m.........m.',
    '.............',
    '...OOO.OOO...',
    '......f......',
    '.............',
    '.^^^..c..^^^.',
    '.............',
    '.............',
    '.^^^.....^^^.',
    '.............',
    '......f......',
    '...OOO.OOO...',
    '.............',
    '.m.........m.',
    '............H',
  ],
  legend: {
    c: { enemy: 'water_cooler' },
    f: { enemy: 'flicker' },
    m: { enemy: 'ceiling_moth' },
    H: { furniture: 'space_heater' },
  },
} satisfies RoomTemplateDef;
