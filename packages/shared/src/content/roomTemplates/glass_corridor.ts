import type { RoomTemplateDef } from '../types';

export default {
  id: 'glass_corridor',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['normal'],
  map: [
    '...L.............',
    '.e.............e.',
    '.................',
    '^^^^^^.....^^^^^^',
    '^^^^^^..e..^^^^^^',
    '^^^^^^.....^^^^^^',
    '.................',
    '.e.............e.',
    '.............$...',
  ],
} satisfies RoomTemplateDef;
