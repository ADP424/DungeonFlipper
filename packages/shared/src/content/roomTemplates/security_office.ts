import type { RoomTemplateDef } from '../types';

export default {
  id: 'security_office',
  cells: [{ cx: 0, cy: 0 }, { cx: 1, cy: 0 }],
  tags: ['normal'],
  difficulty: 2.5,
  map: [
    'L................K..........',
    '...www................www...',
    '.......g............g.......',
    '...........H....H...........',
    '.......s............s.......',
    '...www................www...',
    '...........................A',
  ],
  legend: {
    g: { enemy: 'security_guard' },
    s: { enemy: 'stapler_clerk' },
    A: { furniture: 'desk_lamp' },
    H: { furniture: 'space_heater' },
    K: { furniture: 'dresser' },
    L: { furniture: 'floor_lamp' },
  },
} satisfies RoomTemplateDef;
