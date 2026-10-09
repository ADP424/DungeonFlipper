import type { RoomTemplateDef } from '../types';

export default {
  id: 'pillars',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['normal'],
  map: [
    'L................',
    '..#...........#..',
    '.................',
    '......e...e......',
    '.................',
    '......e...e......',
    '.................',
    '..#...........#..',
    '................$',
  ],
} satisfies RoomTemplateDef;
