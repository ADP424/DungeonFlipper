import type { RoomTemplateDef } from '../types';

export default {
  id: 'intern_pool',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['normal'],
  // Goblins live here: pinned list slots ignore the difficulty cap.
  legend: { g: { slot: { enemies: ['intern'] } } },
  map: [
    'L................',
    '.g.............g.',
    '.....#.....#.....',
    '.....#.....#.....',
    '........*........',
    '.....#.....#.....',
    '.....#.....#.....',
    '.g.............g.',
    '................$',
  ],
} satisfies RoomTemplateDef;
