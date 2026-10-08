import type { RoomTemplateDef } from '../types';

export default {
  id: 'haunted_hall',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['normal'],
  map: [
    '.................',
    '.................',
    '..OO.........OO..',
    '..OO....i....OO..',
    '.................',
    '..OO....c....OO..',
    '..OO.........OO..',
    '.................',
    '.................',
  ],
} satisfies RoomTemplateDef;
