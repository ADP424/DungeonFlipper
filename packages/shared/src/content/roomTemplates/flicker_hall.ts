import type { RoomTemplateDef } from '../types';

export default {
  id: 'flicker_hall',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['normal'],
  difficulty: 1.2,
  map: [
    'L............',
    '..OO..m..OO..',
    '..OO.....OO..',
    '...f.....f...',
    '..OO.....OO..',
    '..OO..m..OO..',
    '............P',
  ],
  legend: {
    f: { enemy: 'flicker' },
    m: { enemy: 'ceiling_moth' },
    L: { furniture: 'floor_lamp' },
    P: { furniture: 'potted_plant' },
  },
} satisfies RoomTemplateDef;
