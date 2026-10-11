import type { RoomTemplateDef } from '../types';

export default {
  id: 'l_bend_patrol',
  cells: [{ cx: 0, cy: 0 }, { cx: 1, cy: 0 }, { cx: 0, cy: 1 }],
  tags: ['normal'],
  difficulty: 2.5,
  map: [
    'W................W..........',
    '....................n.......',
    '..^^............wwww........',
    '.....s................g.....',
    '..^^............wwww........',
    '....................n.......',
    '............................',
    '.............               ',
    '.............               ',
    '...#....#....               ',
    '.....g.......               ',
    '.............               ',
    '...#....#....               ',
    '.............               ',
    '.n.........s.               ',
    '..........H..               ',
  ],
  legend: {
    g: { enemy: 'security_guard' },
    n: { enemy: 'mannequin' },
    s: { enemy: 'stapler_clerk' },
    H: { furniture: 'space_heater' },
    W: { furniture: 'work_light' },
  },
} satisfies RoomTemplateDef;
