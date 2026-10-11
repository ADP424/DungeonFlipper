import type { RoomTemplateDef } from '../types';

export default {
  id: 'l_bend_vermin',
  cells: [{ cx: 0, cy: 0 }, { cx: 1, cy: 0 }, { cx: 0, cy: 1 }],
  tags: ['normal'],
  difficulty: 0.3,
  map: [
    'L................P..........',
    '....................m.......',
    '..^^............wwww........',
    '.....r................r.....',
    '..^^............wwww........',
    '....................m.......',
    '...........................F',
    '.............               ',
    '.............               ',
    '...#....#....               ',
    '.....r.......               ',
    '.............               ',
    '...#....#....               ',
    '.............               ',
    '.m.........r.               ',
    '..........t..               ',
  ],
  legend: {
    m: { enemy: 'ceiling_moth' },
    r: { enemy: 'rat' },
    F: { furniture: 'fern' },
    L: { furniture: 'floor_lamp' },
    P: { furniture: 'potted_plant' },
    t: { furniture: 'stool' },
  },
} satisfies RoomTemplateDef;
