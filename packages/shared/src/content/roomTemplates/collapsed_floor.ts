import type { RoomTemplateDef } from '../types';

/** The cooler sits on the island, out of reach, lobbing over the hole. */
export default {
  id: 'collapsed_floor',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['normal'],
  difficulty: 1.2,
  map: [
    'L............',
    '.r.........r.',
    '..OOOOOOOOO..',
    '..OO..c..OO..',
    '..OOOOOOOOO..',
    '.r....b....r.',
    '............B',
  ],
  legend: {
    b: { enemy: 'damp_blob' },
    c: { enemy: 'water_cooler' },
    r: { enemy: 'rat' },
    B: { furniture: 'storage_box' },
    L: { furniture: 'floor_lamp' },
  },
} satisfies RoomTemplateDef;
