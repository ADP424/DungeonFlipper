import type { RoomTemplateDef } from '../types';

export default {
  id: 'hr_office',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['normal'],
  difficulty: 2,
  map: [
    'L.........K..',
    '..T.C.h...I..',
    '.............',
    '..i..T.C.i...',
    '.............',
    '..T.C..i.....',
    '............A',
  ],
  legend: {
    h: { enemy: 'hr_rep' },
    i: { enemy: 'intern' },
    A: { furniture: 'desk_lamp' },
    C: { furniture: 'chair' },
    I: { furniture: 'fridge' },
    K: { furniture: 'dresser' },
    L: { furniture: 'floor_lamp' },
    T: { furniture: 'table' },
  },
} satisfies RoomTemplateDef;
