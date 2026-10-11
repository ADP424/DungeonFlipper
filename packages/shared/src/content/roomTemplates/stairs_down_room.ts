import type { RoomTemplateDef } from '../types';

export default {
  id: 'stairs_down_room',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['stairsDown'],
  map: [
    '.............',
    '.H.........H.',
    '.....www.....',
    '.....wDw.....',
    '.............',
    '.H.........H.',
    '.............',
  ],
  legend: {
    H: { furniture: 'space_heater' },
  },
} satisfies RoomTemplateDef;
