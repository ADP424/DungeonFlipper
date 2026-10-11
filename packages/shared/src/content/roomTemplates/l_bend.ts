import type { RoomTemplateDef } from '../types';

/** L-shaped room; the generator mirrors it to fit all four orientations. */
export default {
  id: 'l_bend',
  cells: [{ cx: 0, cy: 0 }, { cx: 1, cy: 0 }, { cx: 0, cy: 1 }],
  tags: ['normal'],
  difficulty: 0.8,
  map: [
    'L................F..........',
    '....................r.......',
    '..^^............wwww........',
    '.....b................i.....',
    '..^^............wwww........',
    '....................r.......',
    '...........................t',
    '.............               ',
    '.............               ',
    '...#....#....               ',
    '.....b..i....               ',
    '.............               ',
    '...#....#....               ',
    '.............               ',
    '.r....b....r.               ',
    '..........B..               ',
  ],
  legend: {
    b: { enemy: 'damp_blob' },
    i: { enemy: 'intern' },
    r: { enemy: 'rat' },
    B: { furniture: 'storage_box' },
    F: { furniture: 'fern' },
    L: { furniture: 'floor_lamp' },
    t: { furniture: 'stool' },
  },
} satisfies RoomTemplateDef;
