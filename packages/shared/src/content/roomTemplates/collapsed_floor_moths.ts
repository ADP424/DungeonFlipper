import type { RoomTemplateDef } from '../types';

export default {
  id: 'collapsed_floor_moths',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['normal'],
  difficulty: 0.3,
  map: [
    'L............',
    '.m.........m.',
    '..OOOOOOOOO..',
    '..OO.....OO..',
    '..OOOOOOOOO..',
    '.m.........m.',
    '............F',
  ],
  legend: {
    m: { enemy: 'ceiling_moth' },
    F: { furniture: 'fern' },
    L: { furniture: 'floor_lamp' },
  },
} satisfies RoomTemplateDef;
