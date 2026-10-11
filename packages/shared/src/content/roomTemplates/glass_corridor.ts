import type { RoomTemplateDef } from '../types';

export default {
  id: 'glass_corridor',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['normal'],
  difficulty: 0.3,
  map: [
    '...L.........',
    '.m.........m.',
    '^^^^^...^^^^^',
    '^^^^^.r.^^^^^',
    '^^^^^...^^^^^',
    '.m.........r.',
    '.........t...',
  ],
  legend: {
    m: { enemy: 'ceiling_moth' },
    r: { enemy: 'rat' },
    L: { furniture: 'floor_lamp' },
    t: { furniture: 'stool' },
  },
} satisfies RoomTemplateDef;
