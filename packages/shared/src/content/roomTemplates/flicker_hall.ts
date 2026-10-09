import type { RoomTemplateDef } from '../types';

export default {
  id: 'flicker_hall',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['normal'],
  map: [
    'L................',
    '.................',
    '..OO.........OO..',
    '..OO....F....OO..',
    '.................',
    '..OO....R....OO..',
    '..OO.........OO..',
    '.................',
    '................$',
  ],
} satisfies RoomTemplateDef;
