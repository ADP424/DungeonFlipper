import type { RoomTemplateDef } from '../types';

/** Low walls block straight shots but lobbed projectiles sail over them. */
export default {
  id: 'low_wall_cover',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['normal'],
  map: [
    '.................',
    '....a.......a....',
    '...wwww...wwww...',
    '.................',
    '.................',
    '.....x.....x.....',
    '...wwww...wwww...',
    '.................',
    '.................',
  ],
} satisfies RoomTemplateDef;
