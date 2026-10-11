import type { RoomTemplateDef } from '../types';

/** A water main, and what grew around it. */
export default {
  id: 'pump_room',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['normal'],
  difficulty: 1.2,
  map: [
    'W............',
    '.M....w...c..',
    '......w......',
    '..........b..',
    '......w......',
    '..c...w....N.',
    '.............',
  ],
  legend: {
    b: { enemy: 'damp_blob' },
    c: { enemy: 'water_cooler' },
    M: { furniture: 'water_main' },
    N: { furniture: 'sink' },
    W: { furniture: 'work_light' },
  },
} satisfies RoomTemplateDef;
