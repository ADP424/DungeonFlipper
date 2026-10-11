import type { RoomTemplateDef } from '../types';

/** A generator nobody's using: worth claiming and wiring up. */
export default {
  id: 'boiler_room',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['normal'],
  difficulty: 0.6,
  map: [
    '.............',
    '.G.....#..r..',
    '.......#.....',
    '...b.......b.',
    '.....#.......',
    '..r..#.....W.',
    '.............',
  ],
  legend: {
    b: { enemy: 'damp_blob' },
    r: { enemy: 'rat' },
    G: { furniture: 'generator' },
    W: { furniture: 'work_light' },
  },
} satisfies RoomTemplateDef;
