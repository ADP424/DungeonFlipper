import type { RoomTemplateDef } from '../types';

export default {
  id: 'pillars_blobs',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['normal'],
  difficulty: 0.6,
  map: [
    'W............',
    '.#..r...r..#.',
    '.............',
    '...b.....b...',
    '.............',
    '.#....b....#.',
    'B............',
  ],
  legend: {
    b: { enemy: 'damp_blob' },
    r: { enemy: 'rat' },
    B: { furniture: 'storage_box' },
    W: { furniture: 'work_light' },
  },
} satisfies RoomTemplateDef;
