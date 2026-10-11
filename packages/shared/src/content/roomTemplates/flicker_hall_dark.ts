import type { RoomTemplateDef } from '../types';

/** No lamp: the flickers are the only light in here. */
export default {
  id: 'flicker_hall_dark',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['normal'],
  difficulty: 2,
  map: [
    '.............',
    '..OO.f.f.OO..',
    '..OO.....OO..',
    '......h......',
    '..OO.....OO..',
    '..OO.i.i.OO..',
    '.....f.......',
  ],
  legend: {
    f: { enemy: 'flicker' },
    h: { enemy: 'hr_rep' },
    i: { enemy: 'intern' },
  },
} satisfies RoomTemplateDef;
