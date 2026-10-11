import type { RoomTemplateDef } from '../types';

export default {
  id: 'security_office_night',
  cells: [{ cx: 0, cy: 0 }, { cx: 1, cy: 0 }],
  tags: ['normal'],
  difficulty: 1.5,
  map: [
    '.................K..........',
    '...www................www...',
    '.......s......i.....s.......',
    '...........H....H...........',
    '.......i............i.......',
    '...www................www...',
    '...........................t',
  ],
  legend: {
    i: { enemy: 'intern' },
    s: { enemy: 'stapler_clerk' },
    H: { furniture: 'space_heater' },
    K: { furniture: 'dresser' },
    t: { furniture: 'stool' },
  },
} satisfies RoomTemplateDef;
