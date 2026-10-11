import type { RoomTemplateDef } from '../types';

export default {
  id: 'rat_nest',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['normal'],
  difficulty: 0.3,
  map: [
    'W......r.....',
    '..r.......r..',
    '....B........',
    '.........K...',
    '..r..........',
    '.......r..t..',
    '.............',
  ],
  legend: {
    r: { enemy: 'rat' },
    B: { furniture: 'storage_box' },
    K: { furniture: 'dresser' },
    t: { furniture: 'stool' },
    W: { furniture: 'work_light' },
  },
} satisfies RoomTemplateDef;
