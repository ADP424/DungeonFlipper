import type { RoomTemplateDef } from '../types';

export default {
  id: 'collapsed_floor',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['normal'],
  map: [
    'L................',
    '.................',
    '...OOOOOOOOOOO...',
    '...OO.......OO...',
    '...OO...R...OO...',
    '...OO.......OO...',
    '...OOOOOOOOOOO...',
    '..e...........e..',
    '................$',
  ],
} satisfies RoomTemplateDef;
