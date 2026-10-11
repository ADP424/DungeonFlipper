import type { RoomTemplateDef } from '../types';

export default {
  id: 'checkpoint',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['normal'],
  difficulty: 2.5,
  map: [
    'W...........W',
    '....s...s....',
    '..wwww.wwww..',
    '.............',
    '......g......',
    '.............',
    '.t.........t.',
  ],
  legend: {
    g: { enemy: 'security_guard' },
    s: { enemy: 'stapler_clerk' },
    t: { furniture: 'stool' },
    W: { furniture: 'work_light' },
  },
} satisfies RoomTemplateDef;
