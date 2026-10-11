import type { RoomTemplateDef } from '../types';

export default {
  id: 'glass_corridor_interns',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['normal'],
  difficulty: 1,
  map: [
    '...W.........',
    '.i....m....i.',
    '^^^^^...^^^^^',
    '^^^^^...^^^^^',
    '^^^^^...^^^^^',
    '.m....i....m.',
    '.........H...',
  ],
  legend: {
    i: { enemy: 'intern' },
    m: { enemy: 'ceiling_moth' },
    H: { furniture: 'space_heater' },
    W: { furniture: 'work_light' },
  },
} satisfies RoomTemplateDef;
