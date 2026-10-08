import type { RoomTemplateDef } from '../types';

export default {
  id: 'pillars',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['normal'],
  map: [
    '.................',
    '..#...........#..',
    '.................',
    '......s...s......',
    '.................',
    '......b...b......',
    '.................',
    '..#...........#..',
    '.................',
  ],
} satisfies RoomTemplateDef;
