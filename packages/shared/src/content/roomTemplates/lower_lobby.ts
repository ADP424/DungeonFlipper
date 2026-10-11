import type { RoomTemplateDef } from '../types';

/** Lobby of the floors below the first: stairs back up, the elevator, a generator and a water main. */
export default {
  id: 'lower_lobby',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['stairsUp', 'lobby'],
  startsOwned: true,
  map: [
    '...V.........',
    '.G.........M.',
    '.............',
    '......U......',
    '.............',
    '.............',
    '.............',
  ],
  legend: {
    G: { furniture: 'generator' },
    M: { furniture: 'water_main' },
    V: { furniture: 'elevator' },
  },
} satisfies RoomTemplateDef;
