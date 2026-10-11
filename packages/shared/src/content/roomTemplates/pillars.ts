import type { RoomTemplateDef } from '../types';

export default {
  id: 'pillars',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['normal'],
  difficulty: 0.3,
  map: [
    'L............',
    '.#.........#.',
    '....r...m....',
    '.............',
    '....m...r....',
    '.#.........#.',
    '............C',
  ],
  legend: {
    m: { enemy: 'ceiling_moth' },
    r: { enemy: 'rat' },
    C: { furniture: 'chair' },
    L: { furniture: 'floor_lamp' },
  },
} satisfies RoomTemplateDef;
