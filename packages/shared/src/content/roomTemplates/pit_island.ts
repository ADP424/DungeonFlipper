import type { RoomTemplateDef } from '../types';

export default {
  id: 'pit_island',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['normal'],
  map: [
    '.................',
    '.................',
    '...OOOOOOOOOOO...',
    '...OO.......OO...',
    '...OO...a...OO...',
    '...OO.......OO...',
    '...OOOOOOOOOOO...',
    '..b...........b..',
    '.................',
  ],
} satisfies RoomTemplateDef;
