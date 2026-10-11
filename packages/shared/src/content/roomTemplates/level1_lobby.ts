import type { RoomTemplateDef } from '../types';

/** Level 1's lobby: where the crack from your apartment comes out, with the floor's generator and water main. Pre-owned. (The id predates the apartment.) */
export default {
  id: 'level1_lobby',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['lobby'],
  startsOwned: true,
  map: [
    '...V.....@.A.',
    '.G.........M.',
    '.............',
    '.............',
    '.............',
    '.........CT..',
    'P...........W',
  ],
  legend: {
    '@': { furniture: 'portal' },
    A: { furniture: 'desk_lamp' },
    C: { furniture: 'chair' },
    G: { furniture: 'generator' },
    M: { furniture: 'water_main' },
    P: { furniture: 'potted_plant' },
    T: { furniture: 'table' },
    V: { furniture: 'elevator' },
    W: { furniture: 'work_light' },
  },
} satisfies RoomTemplateDef;
