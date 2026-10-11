import type { RoomTemplateDef } from '../types';

/** Four of them, one behind each pillar: you can't face them all. */
export default {
  id: 'pillars_mannequins',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['normal'],
  difficulty: 1.2,
  map: [
    'L..........P.',
    '.#.n.....n.#.',
    '.............',
    '.....S.......',
    '.............',
    '.#.n.....n.#.',
    '.............',
  ],
  legend: {
    n: { enemy: 'mannequin' },
    L: { furniture: 'floor_lamp' },
    P: { furniture: 'potted_plant' },
    S: { furniture: 'sofa' },
  },
} satisfies RoomTemplateDef;
