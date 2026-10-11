import type { RoomTemplateDef } from '../types';

export default {
  id: 'showroom',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['normal'],
  difficulty: 1,
  map: [
    'L......P.....',
    '.S......n....',
    '.............',
    '...n...R..S..',
    '.............',
    '.S.......n...',
    '............L',
  ],
  legend: {
    n: { enemy: 'mannequin' },
    L: { furniture: 'floor_lamp' },
    P: { furniture: 'potted_plant' },
    R: { furniture: 'round_table' },
    S: { furniture: 'sofa' },
  },
} satisfies RoomTemplateDef;
