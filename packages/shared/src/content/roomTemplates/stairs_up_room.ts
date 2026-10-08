import type { RoomTemplateDef } from '../types';

/** Arrival room on floors below the first. */
export default {
  id: 'stairs_up_room',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['stairsUp'],
  startsOwned: true,
  map: [
    '.................',
    '.................',
    '.................',
    '.................',
    '........U........',
    '.................',
    '.................',
    '.................',
    '.................',
  ],
} satisfies RoomTemplateDef;
