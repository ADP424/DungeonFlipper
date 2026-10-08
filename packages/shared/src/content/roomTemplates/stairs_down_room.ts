import type { RoomTemplateDef } from '../types';

export default {
  id: 'stairs_down_room',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['stairsDown'],
  map: [
    '.................',
    '.*.............*.',
    '.................',
    '.......www.......',
    '.......wDw.......',
    '.................',
    '.................',
    '.*.............*.',
    '.................',
  ],
} satisfies RoomTemplateDef;
