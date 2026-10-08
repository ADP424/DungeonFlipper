import type { RoomTemplateDef } from '../types';

export default {
  id: 'goblin_den',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['normal'],
  map: [
    '.................',
    '.g.............g.',
    '.....#.....#.....',
    '.....#.....#.....',
    '........*........',
    '.....#.....#.....',
    '.....#.....#.....',
    '.g.............g.',
    '.................',
  ],
} satisfies RoomTemplateDef;
