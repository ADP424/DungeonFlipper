import type { RoomTemplateDef } from '../types';

/** Low walls block straight shots but lobbed projectiles sail over them. */
export default {
  id: 'low_wall_cover',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['normal'],
  difficulty: 1.5,
  map: [
    'L............',
    '...s.....s...',
    '..www...www..',
    '.............',
    '....r...r....',
    '..www...www..',
    '....r...r...K',
  ],
  legend: {
    r: { enemy: 'rat' },
    s: { enemy: 'stapler_clerk' },
    K: { furniture: 'dresser' },
    L: { furniture: 'floor_lamp' },
  },
} satisfies RoomTemplateDef;
