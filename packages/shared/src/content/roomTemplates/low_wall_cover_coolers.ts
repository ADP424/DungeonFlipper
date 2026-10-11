import type { RoomTemplateDef } from '../types';

export default {
  id: 'low_wall_cover_coolers',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['normal'],
  difficulty: 1.2,
  map: [
    'W............',
    '...c.....c...',
    '..www...www..',
    '.............',
    '....b...b....',
    '..www...www..',
    '............t',
  ],
  legend: {
    b: { enemy: 'damp_blob' },
    c: { enemy: 'water_cooler' },
    t: { furniture: 'stool' },
    W: { furniture: 'work_light' },
  },
} satisfies RoomTemplateDef;
