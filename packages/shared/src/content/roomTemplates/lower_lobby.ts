import type { RoomTemplateDef } from '../types';

/** Lobby of the floors below the first: stairs back up, and the elevator. */
export default {
  id: 'lower_lobby',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['stairsUp', 'lobby'],
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
  furniture: [{ def: 'elevator', x: 5, y: 0 }],
} satisfies RoomTemplateDef;
