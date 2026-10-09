import type { RoomTemplateDef } from '../types';

/** Low walls block straight shots but lobbed projectiles sail over them. */
export default {
  id: 'low_wall_cover',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['normal'],
  map: [
    'L................',
    '....R.......R....',
    '...wwww...wwww...',
    '.................',
    '.................',
    '.....R.....R.....',
    '...wwww...wwww...',
    '.................',
    '................$',
  ],
} satisfies RoomTemplateDef;
